// Klassen im Browser: Wahl beim ersten Beitreten (auch am Handy), eigenes
// Aussehen beim anderen Spieler, Feuerball und Heilung — gemessen im
// jeweils ANDEREN Browser, und am Bildpunkt.
//
//   node pruefstand/klassen.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/klassen.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { werteBerechnen } from '../gemeinsam/regeln.js';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3461;
const lies = (d) => JSON.parse(readFileSync(join(wurzel, d), 'utf8'));
const werte = lies('inhalte/daten/werte.json'), klassen = lies('inhalte/daten/klassen.json'), spezies = lies('inhalte/daten/spezies.json');
const soll = werteBerechnen(klassen.magier, spezies.elf, werte.spieler);

if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, ZUFALL: '0.99', PORT: String(PORT), SPIELSTAND: spielstand, STARTGEBIET: 'wald' } });
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
const z = { pruefungen: 0, karten: 0, bilder: 0, geschossBlicke: 0, punkte: 0 };
const pruefe = (bed, text) => {
  z.pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Bildpunkte einer Farbe (± toleranz je Kanal) in einem Weltausschnitt
// zählen — dekodiert wird das Bildschirmfoto in der Seite selbst.
async function farbeZaehlen(p, wx, wy, w, h, [r0, g0, b0], toleranz = 18) {
  const r = await p.evaluate(([wx, wy]) => {
    const s = window.__spiel.szene, v = s.cameras.main.worldView, c = s.game.canvas.getBoundingClientRect();
    const f = c.width / s.scale.width;
    return { x: c.x + (wx - v.x) * f, y: c.y + (wy - v.y) * f, f };
  }, [wx, wy]);
  const bild = await p.screenshot({ clip: { x: r.x, y: r.y, width: w * r.f, height: h * r.f } });
  const n = await p.evaluate(async ([daten, farbe, tol]) => {
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
    const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
    c.drawImage(b, 0, 0);
    const d = c.getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - farbe[0]) <= tol && Math.abs(d[i + 1] - farbe[1]) <= tol && Math.abs(d[i + 2] - farbe[2]) <= tol) n++;
    return n;
  }, [bild.toString('base64'), [r0, g0, b0], toleranz]);
  z.punkte += (w * r.f) * (h * r.f);
  return n;
}

const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  // --- Mia wählt am Handy (360 Punkte breit) ---
  const mia = await browser.newPage({ viewport: { width: 360, height: 640 } });
  mia.on('pageerror', (e) => fehler.push(`Mia: Seitenfehler ${e.message}`));
  await mia.goto(`http://localhost:${PORT}/`);
  await mia.fill('#name', 'Mia');
  await mia.click('#anmelden button[type=submit]');
  await mia.waitForFunction(() => document.getElementById('wahl')?.hidden === false, null, { timeout: 10000 });
  const wahl = await mia.evaluate(async () => {
    const start = document.getElementById('start');
    const urls = [...document.querySelectorAll('#wahl .bild')].map((e) => getComputedStyle(e).backgroundImage.slice(5, -2));
    const breiten = await Promise.all(urls.map((u) => new Promise((gut) => {
      const i = new Image();
      i.onload = () => gut(i.naturalWidth);
      i.onerror = () => gut(0);
      i.src = u;
    })));
    return {
      karten: document.querySelectorAll('#wahl .karte').length,
      breiten,
      ueberstand: Math.max(document.documentElement.scrollWidth, start.scrollWidth) - start.clientWidth,
      knopfErreichbar: start.scrollHeight > start.clientHeight ? getComputedStyle(start).overflowY === 'auto' : true,
    };
  });
  z.karten = wahl.karten;
  z.bilder = wahl.breiten.length;
  pruefe(wahl.karten === 9, `Wahl zeigt ${wahl.karten} Karten (5 Klassen, 4 Spezies)`);
  pruefe(wahl.breiten.length >= 6 && wahl.breiten.every((b) => b === 128), `Klassenbilder geladen (${wahl.breiten.join(', ')} px breit)`);
  pruefe(wahl.ueberstand <= 0 && wahl.knopfErreichbar, `am Handy nichts rechts abgeschnitten (Überstand ${wahl.ueberstand} px), Seite scrollt`);
  await mia.evaluate(() => {
    const f = document.getElementById('wahl');
    f.querySelector('input[value=magier]').checked = true;
    f.querySelector('input[value=elf]').checked = true;
    f.dispatchEvent(new Event('change'));
  });
  const vorschau = await mia.textContent('#vorschau');
  pruefe(vorschau.includes('Feuerball') && vorschau.includes(`Tempo ${soll.tempo}`) && vorschau.includes(`${soll.maxLeben / 2} Herzen`),
    `Vorschau rechnet wie der Server: ${vorschau.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
  await mia.click('#wahl button[type=submit]');
  await mia.waitForFunction(() => window.__spiel?.zustand, null, { timeout: 10000 });
  await mia.setViewportSize({ width: 960, height: 540 });

  // --- Tom wählt den Kleriker ---
  const tom = await browser.newPage({ viewport: { width: 960, height: 540 } });
  tom.on('pageerror', (e) => fehler.push(`Tom: Seitenfehler ${e.message}`));
  await tom.goto(`http://localhost:${PORT}/`);
  await tom.fill('#name', 'Tom');
  await tom.click('#anmelden button[type=submit]');
  await tom.waitForFunction(() => document.getElementById('wahl')?.hidden === false, null, { timeout: 10000 });
  await tom.evaluate(() => {
    document.querySelector('#wahl input[value=kleriker]').checked = true;
    document.querySelector('#wahl input[value=zwerg]').checked = true;
  });
  await tom.click('#wahl button[type=submit]');
  await tom.waitForFunction(() => window.__spiel?.zustand, null, { timeout: 10000 });
  await warte(600);

  const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
  let zm = await zustand(mia), zt = await zustand(tom);
  pruefe(zm.ich.klasse === 'magier' && zm.ich.tempo === soll.tempo && zm.ich.max === soll.maxLeben,
    `Mia ist Elfen-Magierin: Tempo ${zm.ich.tempo}, ${zm.ich.max} halbe Herzen`);
  pruefe(zt.andere[0]?.textur?.startsWith('held-magier-'), `Tom sieht Mia als Magierin (${zt.andere[0]?.textur})`);
  pruefe(zm.andere[0]?.textur?.startsWith('held-kleriker-'), `Mia sieht Tom als Kleriker (${zm.andere[0]?.textur})`);
  // Die weiße Kapuze des Klerikers, auf Mias Schirm (Figuren sind 48 hoch,
  // die Kapuze sitzt 25…45 Punkte über dem Fuß).
  const tomBeiMia = zm.andere[0];
  if (process.env.BILDER) await mia.screenshot({ path: wurzel + 'pruefstand/bilder/klassen-mia.png' });
  // Mehrmals: in der Schonfrist blinkt Tom (jedes zweite Bild fast durchsichtig).
  let weiss = 0;
  for (let i = 0; i < 6 && weiss <= 20; i++) {
    weiss = Math.max(weiss, await farbeZaehlen(mia, tomBeiMia.x - 16, tomBeiMia.y - 48, 32, 30, [236, 230, 214]));
    await warte(37);
  }
  pruefe(weiss > 20, `weiße Kapuze bei Mia auf dem Schirm (${weiss} Bildpunkte)`);

  // --- Feuerball: Mia wirft, Tom sieht ihn fliegen ---
  // Die Richtung mit dem längsten freien Weg — die Karte entscheidet, nicht der Zufall.
  const richtung = await mia.evaluate(() => {
    const s = window.__spiel.szene, w = s.welt, k = w.kachel;
    const R = { rechts: [1, 0], links: [-1, 0], unten: [0, 1], oben: [0, -1] };
    let beste = 'rechts', weit = -1;
    for (const [r, [dx, dy]] of Object.entries(R)) {
      let n = 0;
      while (n < 6 && !w.istFest(Math.floor((s.ich.x + dx * k * (n + 1)) / k), Math.floor((s.ich.y - 10 + dy * k * (n + 1)) / k))) n++;
      if (n > weit) [beste, weit] = [r, n];
    }
    return beste;
  });
  await mia.evaluate((r) => (window.__spiel.szene.ich.richtung = r), richtung);
  // Orange auf dem ganzen Schirm, vorher und im Flug: der Ball ist schneller
  // als ein Bildschirmfoto, ein kleiner Ausschnitt um ihn verfehlte ihn.
  const ganz = (p) => p.evaluate(() => window.__spiel.szene.cameras.main.worldView).then((v) => farbeZaehlen(p, v.x, v.y, v.width, v.height, [240, 120, 40], 30));
  const orangeVorher = await ganz(tom);
  await mia.keyboard.press('q');
  await mia.keyboard.press('q');
  let gesehen = 0, hoechstens = 0, orange = 0;
  for (let i = 0; i < 40; i++) {
    zt = await zustand(tom);
    const f = zt.geschosse.filter((g) => g.art === 'feuerball');
    z.geschossBlicke++;
    hoechstens = Math.max(hoechstens, f.length);
    if (f.length) {
      gesehen++;
      if (!orange) orange = (await ganz(tom)) - orangeVorher;
    }
    if (gesehen && !f.length) break;
    await warte(40);
  }
  zm = await zustand(mia);
  pruefe(gesehen > 0 && hoechstens === 1, `Tom sieht Mias Feuerball (${gesehen}× gesehen, höchstens ${hoechstens} zugleich — Abklingzeit)`);
  pruefe(orange > 5, `der Feuerball ist auf Toms Schirm orange (${orange} Bildpunkte mehr als vor dem Wurf)`);
  pruefe(zm.ich.faehigkeitBereit > 0 && zm.ich.faehigkeitBereit <= klassen.magier.faehigkeit.abklingzeit,
    `Mias Abklingzeit läuft (${zm.ich.faehigkeitBereit.toFixed(0)} ms übrig)`);

  // --- Tom heilt: Mia sieht die Funken um ihn ---
  const funkenVorher = zm.funken;
  await tom.keyboard.press('q');
  await mia.waitForFunction((n) => window.__spiel.zustand().funken > n, funkenVorher, { timeout: 3000 }).catch(() => {});
  await warte(150);
  zm = await zustand(mia);
  const t2 = zm.andere[0];
  const gelb = await farbeZaehlen(mia, t2.x - 24, t2.y - 44, 48, 48, [255, 244, 176], 20);
  pruefe(zm.funken - funkenVorher >= 6, `Mia sieht Toms Heilung (${zm.funken - funkenVorher} Funken)`);
  pruefe(gelb > 3, `Funken auf Mias Schirm (${gelb} Bildpunkte)`);

  // --- Tempo: gemessen am Weg in Mias Browser, nicht an der Zahl ---
  // 4 % mehr als ein Mensch ohne Geschick-Bonus; das muss die Messung trennen.
  const frei = await mia.evaluate(() => {
    const s = window.__spiel.szene, w = s.welt, k = w.kachel;
    const R = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    let beste = 'ArrowRight', weit = -1;
    for (const [t, [dx, dy]] of Object.entries(R)) {
      let n = 0;
      while (n < 8 && w.frei(s.ich.x + dx * k * (n + 1), s.ich.y + dy * k * (n + 1))) n++;
      if (n > weit) [beste, weit] = [t, n];
    }
    return beste;
  });
  await mia.keyboard.down(frei);
  await warte(150);
  // Weg geteilt durch die Summe der delta, mit denen die Figur bewegt wurde:
  // Phaser glättet delta, die Uhrzeit nicht — gegen die Uhr gemessen
  // schwankte das Ergebnis um ±5 %, mehr als der Bonus selbst.
  const lauf = await mia.evaluate(() => new Promise((gut) => {
    const s = window.__spiel.szene;
    let a = null, zeit = 0;
    const nachher = (t, delta) => {
      if (!a) return (a = { x: s.ich.x, y: s.ich.y });
      zeit += Math.min(delta, 100);
      if (zeit < 500) return;
      s.events.off('postupdate', nachher);
      gut(Math.hypot(s.ich.x - a.x, s.ich.y - a.y) / (zeit / 1000));
    };
    s.events.on('postupdate', nachher);
  }));
  await mia.keyboard.up(frei);
  pruefe(Math.abs(lauf - soll.tempo) < 1, `Mia läuft ${lauf.toFixed(1)} px/s (soll ${soll.tempo}, ein Mensch ohne Bonus ${werte.spieler.geschwindigkeit})`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${z.pruefungen} Prüfungen, ${z.karten} Karten, ${z.bilder} Klassenbilder, ${z.geschossBlicke} Blicke auf Geschosse, ${z.punkte.toFixed(0)} Bildpunkte gezählt.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
