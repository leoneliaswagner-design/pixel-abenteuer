// Der Gelehrte mit echten Browsern:
//   Ben (Krieger) und Tec (Gelehrter, Technologe, Stufe 10) stehen in
//   Riftside. Ben sieht Tecs Doktorhut und neben ihm die Drohne — türkises
//   Auge am Bildpunkt, bei Ben selbst keins. Tecs Leiste: Q, F, R, T.
//   (Analyse, Alchemiekrug, Drohnenschüsse, Pfade prüft server-regeln.)
//
//   node pruefstand/gelehrter.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/gelehrter.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3504;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const ort = { gebiet: 'riftside', x: 23 * 32 + 16, y: 20 * 32 + 24 };
const ort2 = { ...ort, x: ort.x + 64 };
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    ben: { name: 'Ben', farbe: 'rot', klasse: 'kaempfer', spezies: 'mensch', richtung: 'unten', ...ort, leben: 6, ankunft: ort },
    tec: { name: 'Tec', farbe: 'blau', klasse: 'gelehrter', spezies: 'mensch', richtung: 'unten', ...ort2, leben: 6, ankunft: ort2, erfahrung: werte.stufen.erfahrung[9], pfad: 'technologe' },
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
  const tec = await oeffnen('Tec');
  const zt = await zustand(tec);
  pruefe(zt.ich.klasse === 'gelehrter' && zt.ich.stufe === 10 && zt.ich.pfad === 'technologe', `Tec ist Gelehrter, Stufe ${zt.ich.stufe}, Pfad ${zt.ich.pfad}`);
  pruefe(zt.stufenAnzeige.zeilen.join('|') === 'Q Armbrustbolzen|F Analyseblick|R Gelehrtenhilfe|T Erfinderwerkstatt', `Tecs Leiste: ${zt.stufenAnzeige.zeilen.join(', ')}`);
  // Erst nach Tecs Schonfrist: solange blinkt die Figur (und die Drohne nicht).
  await warte(2500);
  const zb = await zustand(ben);
  const tecBeiBen = zb.andere.find((a) => a.textur.startsWith('held-gelehrter-'));
  pruefe(!!tecBeiBen && tecBeiBen.effekt.includes('d'), `Ben sieht Tec als Gelehrten mit Drohne (${tecBeiBen?.textur}, e = „${tecBeiBen?.effekt}")`);
  const hut = tecBeiBen ? await zaehle(ben, tecBeiBen.x - 12, tecBeiBen.y - 48, 24, 10, 'Math.abs(r - 42) < 12 && Math.abs(g - 42) < 12 && Math.abs(b - 58) < 12') : 0;
  pruefe(hut > 20, `Doktorhut bei Ben am Bildpunkt: ${hut} dunkle Bildpunkte`);
  // Türkises Auge der Drohne: rechts an Tecs Schulter, nicht bei Ben selbst.
  const tuerkis = 'r < 140 && g > 190 && b > 200';
  const drohne = tecBeiBen ? await zaehle(ben, tecBeiBen.x + 4, tecBeiBen.y - 38, 20, 20, tuerkis) : 0;
  const beiBen = await zaehle(ben, zb.ich.x + 4, zb.ich.y - 38, 20, 20, tuerkis);
  pruefe(drohne > 3 && beiBen === 0, `Drohne bei Ben am Bildpunkt: neben Tec ${drohne} türkise Bildpunkte, neben Ben ${beiBen}`);
  if (process.env.BILDER) await ben.screenshot({ path: wurzel + 'pruefstand/bilder/gelehrter-ben.png' });
  await tec.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
