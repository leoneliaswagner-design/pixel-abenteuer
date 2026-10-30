// Stufen und Erfahrung mit echten Browsern:
//   Ana steht im Tempel vor dem Idol (15 Erfahrung, Stufe 1), Ben in Riftside.
//   Ana nimmt das Idol: beide bekommen 60 Erfahrung und steigen auf Stufe 3.
//   Gemessen am Bildpunkt: „Stufe 3!" in der Mitte, der Erfahrungsbalken
//   (grün) halb voll, ein fünftes Herz. Nach dem Neuladen bleibt Stufe 3.
//
//   node pruefstand/stufen.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/stufen.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3497;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const stelle = (name, farbe, gebiet, x, y, richtung, erfahrung) => {
  const ort = { gebiet, x, y };
  // Volle Herzen (Kämpfer, Mensch: 8 halbe): so ist das neue fünfte Herz
  // am Bildpunkt das einzige, das dazukommt.
  return { name, farbe, klasse: 'kaempfer', spezies: 'mensch', richtung, ...ort, leben: 8, ankunft: ort, erfahrung };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    ana: stelle('Ana', 'gruen', 'tempel', 10 * 32 + 16, 5 * 32 + 16, 'oben', 15),
    ben: stelle('Ben', 'rot', 'riftside', 21 * 32 + 16, 20 * 32 + 24, 'unten', 0),
  },
}));

const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, ZUFALL: '0.99', PORT: String(PORT), SPIELSTAND: spielstand } });
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
    await warte(700);
    return p;
  };
  const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
  // Bildpunkte einer Bedingung in einem Rechteck der Oberfläche (480×270,
  // ohne Kamera), aus dem Bildschirmfoto.
  const zaehle = async (p, x, y, b, h, bedingung) => {
    const r = await p.evaluate(() => {
      const s = window.__spiel.szene, c = s.game.canvas.getBoundingClientRect();
      return { x: c.x, y: c.y, f: c.width / s.scale.width };
    });
    const png = await p.screenshot({ clip: { x: r.x + x * r.f, y: r.y + y * r.f, width: b * r.f, height: h * r.f } });
    bildpunkte += b * r.f * h * r.f;
    return p.evaluate(async ([daten, bed]) => {
      const bild = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
      const c = new OffscreenCanvas(bild.width, bild.height).getContext('2d');
      c.drawImage(bild, 0, 0);
      const d = c.getImageData(0, 0, bild.width, bild.height).data;
      const f = new Function('r', 'g', 'b', `return ${bed}`);
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++;
      return n;
    }, [png.toString('base64'), bedingung]);
  };
  const GRUEN = 'g > 180 && r > 110 && r < 170 && b < 120';   // Balken 0x8ee05a
  const GELB = 'r > 220 && g > 190 && b < 110';               // „Stufe 3!" 0xffd84a
  const ROT = 'r > 170 && g < 90 && b < 100';                 // volles Herz

  const ben = await oeffnen('Ben');
  const ana = await oeffnen('Ana');
  let za = await zustand(ana);
  const t = werte.stufen.erfahrung;
  pruefe(za.ich.stufe === 1 && za.ich.erfahrung === 15 && za.stufenAnzeige.text === 'St. 1', `vorher: Ana Stufe ${za.ich.stufe}, ${za.ich.erfahrung} Erfahrung, Anzeige „${za.stufenAnzeige.text}"`);
  const soll1 = za.stufenAnzeige.voll * (15 / t[1]);
  pruefe(Math.abs(za.stufenAnzeige.balken - soll1) <= 1, `Balken ${za.stufenAnzeige.balken} von ${za.stufenAnzeige.voll} (Soll ${soll1.toFixed(0)})`);
  const gruenVor = await zaehle(ana, 6, 20, 60, 4, GRUEN);
  const herz5 = [6 + 4 * 14 - 1, 5, 14, 14];
  const herzVor = await zaehle(ana, ...herz5, ROT);
  const herz4 = await zaehle(ana, 6 + 3 * 14 - 1, 5, 14, 14, ROT);
  const gelbVor = await zaehle(ana, 160, 90, 160, 50, GELB);
  const maxVor = za.ich.max;

  // --- Ana nimmt das Idol ---
  await ana.keyboard.press('e');
  await warte(500);
  za = await zustand(ana);
  const gelbNach = await zaehle(ana, 160, 90, 160, 50, GELB);
  // Gleich messen: nach dem Idol rollt die Steinkugel los und trifft Ana nach
  // gut 2 s — dann war das fünfte Herz in der vollen Runde schon wieder leer.
  const gruenNach = await zaehle(ana, 6, 20, 60, 4, GRUEN);
  const herzNach = await zaehle(ana, ...herz5, ROT);
  const zb = await zustand(ben);
  pruefe(za.ich.stufe === 3 && za.ich.erfahrung === 75 && za.stufenAnzeige.text === 'St. 3', `Ana: Stufe ${za.ich.stufe}, ${za.ich.erfahrung} Erfahrung, Anzeige „${za.stufenAnzeige.text}"`);
  pruefe(za.stufenAnzeige.aufstieg === 'Stufe 3!' && gelbNach > gelbVor + 150, `„Stufe 3!" in der Mitte: ${gelbVor} → ${gelbNach} gelbe Bildpunkte`);
  pruefe(za.ich.max === maxVor + 2 && za.ich.leben === za.ich.max, `ein Herz mehr, alle voll (${maxVor} → ${za.ich.max}, Leben ${za.ich.leben})`);
  pruefe(za.aufstiege >= 1, `Ana sieht ihr Funkeln (${za.aufstiege})`);
  pruefe(zb.ich.stufe === 3 && zb.stufenAnzeige.text === 'St. 3' && zb.gebiet === 'riftside', `Ben in ${zb.gebiet} steigt mit auf (Stufe ${zb.ich.stufe})`);
  // 75 Erfahrung: Stufe 3 beginnt bei 50, Stufe 4 bei 100 — halb voll.
  const soll3 = za.stufenAnzeige.voll * ((75 - t[2]) / (t[3] - t[2]));
  pruefe(Math.abs(za.stufenAnzeige.balken - soll3) <= 1 && gruenNach > 0, `Balken nach dem Aufstieg ${za.stufenAnzeige.balken} (Soll ${soll3.toFixed(0)}), grün am Bildpunkt ${gruenVor} → ${gruenNach}`);
  pruefe(herz4 > 40 && herzVor < 10 && herzNach > 40, `fünftes Herz am Bildpunkt: ${herzVor} → ${herzNach} rote Bildpunkte (viertes vorher ${herz4})`);

  // Neu laden: Stufe bleibt.
  await ana.close();
  const ana2 = await oeffnen('Ana');
  za = await zustand(ana2);
  pruefe(za.ich.stufe === 3 && za.stufenAnzeige.text === 'St. 3' && za.ich.max === maxVor + 2, `nach dem Neuladen: Stufe ${za.ich.stufe}, ${za.ich.max} halbe Herzen`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
