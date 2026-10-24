// Der Dschungeltempel mit echten Browsern:
//   Ana steht vor dem Sockel mit dem goldenen Idol, Ben unten in der
//   Vorhalle (so nah, dass die Kugel im Bild ist). Stacheln heben und senken sich (bei Ben, am Bild).
//   Ana nimmt das Idol: Ben sieht den Sockel leer werden, der Tempel bebt,
//   die Kugel rollt. Ana rennt den Gang hinab und kommt lebend unten an.
//   Die Kugel bleibt in der Vorhalle liegen — Ben sieht sie am Bildpunkt und
//   läuft nicht durch sie hindurch. Nach dem Neuladen liegt sie noch da.
//
//   node pruefstand/tempel.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/tempel.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3496;
const bilder = join(wurzel, 'pruefstand', 'bilder');
mkdirSync(bilder, { recursive: true });
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const stelle = (name, farbe, x, y, richtung) => {
  const ort = { gebiet: 'tempel', x, y };
  return { name, farbe, klasse: 'kaempfer', spezies: 'mensch', richtung, ...ort, leben: 6, ankunft: ort };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    ana: stelle('Ana', 'gruen', 10 * 32 + 16, 5 * 32 + 16, 'oben'),
    ben: stelle('Ben', 'rot', 10 * 32 + 16, 29 * 32 + 24, 'oben'),
  },
}));

const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(PORT), SPIELSTAND: spielstand } });
let log = '';
await new Promise((gut, schlecht) => {
  const t = setTimeout(() => schlecht(new Error('Server startet nicht:\n' + log)), 8000);
  const lesen = (d) => {
    log += d;
    if (log.includes(`:${PORT}`)) clearTimeout(t), gut();
  };
  server.stdout.on('data', lesen);
  server.stderr.on('data', lesen);
});

const fehler = [];
let pruefungen = 0;
const pruefe = (bed, text) => {
  pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Ohne Drosselung — s. zwei-spieler.mjs.
const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  const oeffnen = async (name) => {
    const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
    p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
    await p.goto(`http://localhost:${PORT}/`);
    await anmelden(p, name);
    await warte(500);
    return p;
  };
  const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
  // Wo ein Weltpunkt auf dem Schirm liegt (das Spiel ist kleiner gerechnet
  // und hochskaliert).
  const aufSchirm = (p, wx, wy) => p.evaluate(([wx, wy]) => {
    const s = window.__spiel.szene, v = s.cameras.main.worldView, c = s.game.canvas.getBoundingClientRect();
    const f = c.width / s.scale.width;
    return { x: c.x + (wx - v.x) * f, y: c.y + (wy - v.y) * f };
  }, [wx, wy]);
  const bildBei = async (p) => {
    const png = await p.screenshot();
    return p.evaluate(async (daten) => {
      const bild = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
      const c = new OffscreenCanvas(bild.width, bild.height), g = c.getContext('2d');
      g.drawImage(bild, 0, 0);
      return { b: bild.width, h: bild.height, d: [...g.getImageData(0, 0, bild.width, bild.height).data] };
    }, png.toString('base64'));
  };
  // Wie viele Bildpunkte sich im Umkreis deutlich unterscheiden, und ihre
  // Mitte. Nur im Umkreis: die Fackeln flackern, Schleime hüpfen, und auf dem
  // ganzen Schirm lag die Mitte 50 Bildpunkte neben der Kugel.
  const flaeche = (a, b, um) => {
    let n = 0, sx = 0, sy = 0;
    for (let i = 0; i < a.d.length; i += 4) {
      const x = (i / 4) % a.b, y = Math.floor(i / 4 / a.b);
      if (Math.abs(x - um.x) > 90 || Math.abs(y - um.y) > 90) continue;
      if (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]) < 30) continue;
      n++;
      sx += x;
      sy += y;
    }
    return { n, x: sx / (n || 1), y: sy / (n || 1) };
  };

  const ben = await oeffnen('Ben');
  const ana = await oeffnen('Ana');
  let zb = await zustand(ben);
  pruefe(zb.gebiet === 'tempel' && zb.kugel?.z === 'ruht' && zb.sockel.length === 1 && !zb.sockel[0].leer,
    `Ben im Tempel: Kugel ${zb.kugel?.z}, Sockel ${zb.sockel[0]?.leer ? 'leer' : 'mit Idol'}`);
  pruefe(zb.fallen.length === 9, `Ben sieht ${zb.fallen.length} Fallen`);
  // Stacheln heben und senken sich: über 2,5 s beide Bilder gesehen.
  const gesehen = new Set();
  for (let t = 0; t < 2500; t += 100) {
    (await zustand(ben)).fallen.filter((f) => f.art === 'stacheln').forEach((f) => gesehen.add(f.bild));
    await warte(100);
  }
  pruefe(gesehen.has(0) && gesehen.has(1), `Stacheln oben und unten gesehen (Bilder ${[...gesehen].join(', ')})`);

  // --- Ana nimmt das Idol ---
  await ana.keyboard.press('e');
  let gebebt = false;
  for (let t = 0; t < 1000 && !gebebt; t += 50) {
    gebebt = await ben.evaluate(() => window.__spiel.szene.cameras.main.shakeEffect.isRunning);
    await warte(50);
  }
  const za = await zustand(ana);
  zb = await zustand(ben);
  pruefe(za.anzeige === 'idol 1' && za.zustaende.tempel_geschlossen, `Ana hat das Idol (Anzeige „${za.anzeige}")`);
  pruefe(zb.sockel[0].leer, 'Ben sieht den Sockel leer');
  pruefe(gebebt, 'bei Ben bebt der Tempel');
  // Ana schließt die Textbox (erst schreibt sie fertig, dann geht sie zu) und rennt.
  for (let i = 0; i < 4 && (await zustand(ana)).dialog; i++) {
    await ana.keyboard.press('e');
    await warte(150);
  }
  await ana.keyboard.down('ArrowDown');
  let rollte = false, minAbstand = 1e9;
  let z = za;
  for (let t = 0; t < 16000; t += 100) {
    await warte(100);
    z = await zustand(ana);
    if (z.kugel?.z === 'rollt') {
      rollte = true;
      minAbstand = Math.min(minAbstand, z.ich.y - z.kugel.y);
    }
    if (z.ich.y > 25 * 32 + 20) break;
  }
  // In der Vorhalle zur Seite, aus der Bahn der Kugel.
  await ana.keyboard.up('ArrowDown');
  await ana.keyboard.down('ArrowLeft');
  await warte(700);
  await ana.keyboard.up('ArrowLeft');
  z = await zustand(ana);
  pruefe(rollte, 'Ana sieht die Kugel rollen');
  pruefe(!z.ich.tot && z.ich.y > 25 * 32, `Ana entkommt in die Vorhalle (y ${z.ich.y.toFixed(0)}, Leben ${z.ich.leben}, Kugel zuletzt ${minAbstand.toFixed(0)} px hinter ihr)`);

  // --- Die Kugel liegt ---
  for (let t = 0; t < 12000; t += 200) {
    if ((await zustand(ben)).kugel.z === 'liegt') break;
    await warte(200);
  }
  await warte(400);
  zb = await zustand(ben);
  pruefe(zb.kugel.z === 'liegt' && Math.abs(zb.kugel.y - (27 * 32 + 16)) < 2, `bei Ben liegt die Kugel in der Vorhalle (y ${zb.kugel.y.toFixed(0)})`);
  // Ben läuft auf die Kugel zu und bleibt davor stehen (Kachel 10,28 ist zu).
  await ben.keyboard.down('ArrowUp');
  await warte(1500);
  await ben.keyboard.up('ArrowUp');
  await warte(300);
  zb = await zustand(ben);
  pruefe(zb.ich.y >= 29 * 32 && zb.gesperrt.length === 9, `Ben läuft nicht durch die Kugel (y ${zb.ich.y.toFixed(0)}, ${zb.gesperrt.length} Kacheln zu)`);

  // Neu laden: sie liegt noch da, der Sockel ist leer.
  await ben.close();
  const ben2 = await oeffnen('Ben');
  zb = await zustand(ben2);
  pruefe(zb.kugel.z === 'liegt' && zb.sockel[0].leer && zb.gesperrt.length === 9, `nach dem Neuladen: Kugel ${zb.kugel.z}, Sockel leer`);
  // Am Bildpunkt: der ganze Schirm mit und ohne die Kugel. Wo er sich
  // unterscheidet, ist sie — das muss eine kugelgroße Fläche an der Stelle
  // sein, wo die Kugel laut Stand liegt. Gemessen gleich nach dem Neuladen,
  // in der Schonfrist, und die Szene steht dabei still (sie wird gezeichnet,
  // rechnet aber nicht): vorher stießen Schleime Ben herum, die Kamera lief
  // 60 Bildpunkte weiter, und die Fackeln flackern.
  // Ohne Lichtfläche: ob die Kugel im Dunkeln gut zu sehen ist, ist eine
  // andere Frage — hier geht es darum, wo sie gezeichnet wird. (Mit Licht
  // fielen die Ränder je nach Bens Abstand unter die Schwelle.)
  await warte(1500);
  await ben2.evaluate(() => {
    const s = window.__spiel.szene;
    s.scene.pause();
    s.licht.flaeche.setVisible(false);
  });
  await warte(100);
  const soll = await aufSchirm(ben2, zb.kugel.x, zb.kugel.y);
  const mit = await bildBei(ben2);
  await ben2.evaluate(() => window.__spiel.szene.kugel.bild.setVisible(false));
  await warte(100);
  const ohne = await bildBei(ben2);
  await ben2.evaluate(() => {
    const s = window.__spiel.szene;
    s.kugel.bild.setVisible(true);
    s.licht.flaeche.setVisible(true);
    s.scene.resume();
  });
  const anders = flaeche(mit, ohne, soll);
  // Senkrecht mit Spielraum: Figuren davor und dahinter verdecken die Kugel
  // oder werden von ihr verdeckt, das verschiebt die Mitte um bis zu 15
  // Weltpunkte. Eine Kugel am falschen Ort liegt weit daneben.
  const f = mit.b / 480;
  // Obergrenze: einmal war jeder Bildpunkt anders (Einblenden lief noch) — dann
  // ist die Mitte zwangsläufig die Soll-Stelle, und die Prüfung sagt nichts.
  pruefe(anders.n > 4000 && anders.n < 16000 && Math.abs(anders.x - soll.x) < 8 && Math.abs(anders.y - soll.y) < 16 * f,
    `am Bildpunkt: ${anders.n} Bildpunkte anders, Mitte ${anders.x.toFixed(0)},${anders.y.toFixed(0)} (Soll ${soll.x.toFixed(0)},${soll.y.toFixed(0)}); 180×180 von ${mit.b}×${mit.h} angesehen`);
  await ben2.screenshot({ path: join(bilder, 'tempel-kugel.png') });
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
