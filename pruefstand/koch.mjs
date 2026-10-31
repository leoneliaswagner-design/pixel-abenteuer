// Der Koch mit echten Browsern:
//   Ben (Krieger, verletzt) steht in Riftside am Start. Kim meldet sich neu an und
//   wählt den Koch: Ben sieht Kochmütze und Schürze (Bild des Kochs). Kim
//   serviert ein Mahl (F) neben Ben: Bens Herzen steigen, es funkelt.
//   (Curry, Würzattacke, Festmahl prüft server-regeln.)
//
//   node pruefstand/koch.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/koch.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { Welt } from '../gemeinsam/welt.js';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3502;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

// Ein freier Fleck zwischen der Ankunft von Riftside und dem Schleim davor.
const wald = JSON.parse(readFileSync(join(wurzel, 'inhalte/karten/wald.json'), 'utf8'));
const welt = new Welt(wald);
const schleim = welt.orte.filter((o) => o.name === 'gegner').sort((a, b) => Math.hypot(a.x - 272, a.y - 880) - Math.hypot(b.x - 272, b.y - 880))[0];
let fleck = null;
// Weit genug weg, dass der Schleim die beiden nicht sieht: sonst lief er Dina
// nach, trat in ihre Falle und starb daran, bevor Tom sie zu sehen bekam.
for (let f = 0.95; f >= 0.6 && !fleck; f -= 0.05) {
  const x = Math.round(schleim.x + (272 - schleim.x) * f), y = Math.round(schleim.y + 8 + (888 - schleim.y - 8) * f);
  if (welt.frei(x, y) && welt.frei(x + 30, y)) fleck = { x, y };
}

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
// Riftside, neben dem Start: dort kommt Kim als Neue an.
const ort = { gebiet: 'riftside', x: 23 * 32 + 16, y: 20 * 32 + 24 };
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: { ben: { name: 'Ben', farbe: 'rot', klasse: 'kaempfer', spezies: 'mensch', richtung: 'unten', ...ort, leben: 2, ankunft: ort } },
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
  // Kim ist neu: Wahl der Klasse im Browser, Koch.
  const kim = await browser.newPage({ viewport: { width: 960, height: 540 } });
  kim.on('pageerror', (e) => fehler.push(`Kim: Seitenfehler ${e.message}`));
  await kim.goto(`http://localhost:${PORT}/`);
  const gewaehlt = await anmelden(kim, 'Kim', { klasse: 'koch' });
  await warte(800);
  let zk = await zustand(kim);
  pruefe(gewaehlt?.klasse === 'koch' && zk.ich.klasse === 'koch' && zk.ich.textur.startsWith('held-koch-'), `Kim wählt den Koch (${zk.ich.textur})`);
  pruefe(zk.stufenAnzeige.zeilen.join('|') === 'Q Messerwurf|F Kochkunst', `Kim, Stufe 1: ${zk.stufenAnzeige.zeilen.join(', ')}`);
  let zb = await zustand(ben);
  const kimBeiBen = zb.andere.find((a) => a.textur.startsWith('held-koch-'));
  pruefe(!!kimBeiBen, `Ben sieht Kim als Koch (${zb.andere.map((a) => a.textur).join(', ')})`);
  // Weiß der Kochmütze am Bildpunkt, oben auf Kims Kopf bei Ben — erst nach
  // Kims Schonfrist: solange blinkt die Figur, und es waren 0 Bildpunkte.
  await warte(2500);
  const weiss = kimBeiBen ? await zaehle(ben, kimBeiBen.x - 8, kimBeiBen.y - 48, 16, 10, 'r > 225 && g > 225 && b > 215') : 0;
  pruefe(weiss > 40, `Kochmütze bei Ben am Bildpunkt: ${weiss} weiße Bildpunkte`);
  // --- Mahl (F): Ben steht daneben, seine Herzen steigen, es funkelt ---
  zb = await zustand(ben);
  const [lebenVor, funkenVor] = [zb.ich.leben, zb.funken];
  await kim.keyboard.press('f');
  for (let t = 0; t < 1000 && (await zustand(ben)).ich.leben === lebenVor; t += 50) await warte(50);
  zb = await zustand(ben);
  pruefe(zb.ich.leben === lebenVor + 2 && zb.funken > funkenVor, `Mahl: Bens Herzen ${lebenVor} → ${zb.ich.leben} halbe, ${zb.funken - funkenVor} Funken`);
  await kim.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
