// Die Monster der zweiten Runde (Ruinen im Sumpf) mit echten Browsern:
//   alle sieben Bilder geladen (zwei Bilder, der Ork drei), und der Schatten
//   schleicht: Ben steht nah bei ihm und sieht ihn deutlich, Ana steht weiter
//   weg und sieht ihn im selben Augenblick kaum (dunkle Bildpunkte bei beiden).
//   (Rudel, Gift, Zombie, Akolyth, Stärkeentzug prüft server-regeln.)
//
//   node pruefstand/ruinen.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/ruinen.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3506;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
// Die Gegner stehen still (GEGNER_STILL=1): gemessen wird, wie derselbe Schatten
// bei zwei Spielern aussieht, nicht wie er jagt. Gegen die echte KI lief er mal
// durch die Maueröffnung aus Anas Bild, mal wurde Ben herumgestoßen und fiel.
// Ben steht zwei Kacheln neben dem ersten Schatten (64 px, im Schleich-Abstand
// von 80), Ana gut viereinhalb weiter (140 px).
// Ankunft = die eigene Stelle: wer dort fällt, steht dort wieder auf. Sonst
// landete Ben nach einem Kobold- oder Kultistentreffer am Westeingang, 500 px
// vom Schatten weg, und die Messung lief ins Leere.
const spieler = (name, farbe, x, y) => {
  const ort = { gebiet: 'ruinen', x: x * 32 + 16, y: y * 32 + 24 };
  return { name, farbe, klasse: 'kaempfer', spezies: 'mensch', richtung: 'unten', ...ort, leben: 6, ankunft: ort };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: { ben: spieler('Ben', 'gruen', 23, 10), ana: spieler('Ana', 'blau', 17, 12) },
}));

const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, ZUFALL: '0.99', GEGNER_STILL: '1', PORT: String(PORT), SPIELSTAND: spielstand } });
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
let pruefungen = 0, bildpunkte = 0;
const pruefe = (bed, text) => {
  pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

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
  // Bildpunkte einer Bedingung in einem Weltrechteck.
  const zaehle = async (p, wx, wy, b, h, bed) => {
    const r = await p.evaluate(([wx, wy]) => {
      const s = window.__spiel.szene, v = s.cameras.main.worldView, c = s.game.canvas.getBoundingClientRect();
      const f = c.width / s.scale.width;
      return { x: c.x + (wx - v.x) * f, y: c.y + (wy - v.y) * f, f };
    }, [wx, wy]);
    const png = await p.screenshot({ clip: { x: r.x, y: r.y, width: b * r.f, height: h * r.f } });
    bildpunkte += b * h * r.f * r.f;
    return p.evaluate(async ([daten, bed]) => {
      const pruef = new Function('r', 'g', 'b', `return ${bed}`);
      const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
      const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
      c.drawImage(b, 0, 0);
      const d = c.getImageData(0, 0, b.width, b.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (pruef(d[i], d[i + 1], d[i + 2])) n++;
      return n;
    }, [png.toString('base64'), bed]);
  };

  const ben = await oeffnen('Ben');
  const ana = await oeffnen('Ana');
  let zb = await zustand(ben);
  const neu = ['kobold', 'zombie', 'ork', 'giftschlange', 'kultist', 'akolyth', 'schattenwesen'];
  const arten = new Set(zb.gegner.map((g) => g.art));
  const falsch = zb.gegner.filter((g) => g.textur !== g.art || g.bilder < (g.art === 'ork' ? 3 : 2));
  pruefe(zb.gebiet === 'ruinen' && neu.every((a) => arten.has(a)) && !falsch.length,
    `Ruinen: ${zb.gegner.length} Gegner, ${arten.size} Arten mit eigenem Bild (falsch: ${falsch.map((g) => g.art).join(', ') || 'keins'})`);
  // Der Schatten nahe Ben: auf Bens Schirm deutlich, auf Anas kaum — im selben Augenblick.
  // Genau die zwei Farben des Schattens (#1e1a2e, #2e2842): ein bloßes „dunkel"
  // zählte die Kutte eines Kultisten daneben mit.
  const dunkel = '(Math.abs(r - 30) < 7 && Math.abs(g - 26) < 7 && Math.abs(b - 46) < 7) || (Math.abs(r - 46) < 7 && Math.abs(g - 40) < 7 && Math.abs(b - 66) < 7)';
  let nahBen = 0, beiAna = 0, aBen = 0, aAna = 0, abstand = 0, versuche = 0;
  for (; versuche < 40 && !(nahBen > 40 && beiAna < nahBen / 3); versuche++) {
    await warte(150);
    zb = await zustand(ben);
    const za = await zustand(ana);
    const swB = zb.gegner.filter((g) => g.art === 'schattenwesen' && g.sichtbar).sort((a, b) => Math.hypot(a.x - zb.ich.x, a.y - zb.ich.y) - Math.hypot(b.x - zb.ich.x, b.y - zb.ich.y))[0];
    const swA = swB && za.gegner.find((g) => g.id === swB.id);
    if (!swB || !swA) continue;
    abstand = Math.hypot(swB.x - zb.ich.x, swB.y - zb.ich.y);
    const anaAbstand = Math.hypot(swA.x - za.ich.x, swA.y - za.ich.y);
    // Erst messen, wenn er bei Ben ganz eingeblendet ist (er blendet weich über).
    if (abstand > 76 || anaAbstand < 110 || swB.alpha < 0.9) continue;
    // Nur, wenn er bei beiden ganz im Bild ist — sonst bricht das Bildschirmfoto ab
    // (in der vollen Runde lief er einmal aus Anas Bild).
    const imBild = (p, g) => p.evaluate(([x, y]) => {
      const v = window.__spiel.szene.cameras.main.worldView;
      return x - 14 > v.x && x + 14 < v.x + v.width && y - 30 > v.y && y < v.y + v.height;
    }, [g.x, g.y]);
    if (!(await imBild(ben, swB)) || !(await imBild(ana, swA))) continue;
    [aBen, aAna] = [swB.alpha, swA.alpha];
    nahBen = await zaehle(ben, swB.x - 12, swB.y - 28, 24, 26, dunkel);
    beiAna = await zaehle(ana, swA.x - 12, swA.y - 28, 24, 26, dunkel);
  }
  pruefe(aBen > 0.8 && aAna < 0.3, `Schatten: bei Ben (${abstand.toFixed(0)} px weg) Deckkraft ${aBen}, bei Ana ${aAna}`);
  pruefe(nahBen > 40 && beiAna < nahBen / 3, `Schatten am Bildpunkt: bei Ben ${nahBen} dunkle, bei Ana ${beiAna} (${versuche} Blicke)`);
  if (process.env.BILDER) await ben.screenshot({ path: wurzel + 'pruefstand/bilder/ruinen-ben.png' });
  await ana.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
