// Die Weltkarte im Browser: Nebel über Unentdecktem (am Bildpunkt), der
// eigene Punkt auf der Startinsel, ein Mitspieler hinter einem Riss, die
// Umgebungsansicht mittig um einen herum.
//
//   node pruefstand/weltkarte.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/weltkarte.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anmelden } from './anmelden.mjs';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3490;
const welt = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/welt.json'), 'utf8'));
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const ort = (gebiet, x, y) => ({ gebiet, x: x * 32 + 16, y: y * 32 + 24 });
const spieler = (name, farbe, o) => ({ name, farbe, klasse: 'kaempfer', spezies: 'mensch', richtung: 'unten', ...o, leben: 8, ankunft: o, inventar: {} });
const datei = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
writeFileSync(datei, JSON.stringify({ version: 1, welt: { entdeckt: ['insel-047'] }, spieler: { ana: spieler('Ana', 'gruen', ort('riftside', 22, 9)), bodo: spieler('Bodo', 'rot', ort('tempel', 9, 9)) } }));
const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(PORT), SPIELSTAND: datei } });
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
const z = { pruefungen: 0, marken: 0, bildpunkte: 0 };
const pruefe = (bed, text) => {
  z.pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Helligkeit einer Stelle des Kartenbilds (Bildpunkte im 1024er-Bild), am Schirm gemessen.
async function hell(p, [kx, ky], r = 12) {
  const box = await p.locator('#fenster .weltkarte').boundingBox();
  const f = box.width / welt.breite;
  const clip = { x: box.x + (kx - r) * f, y: box.y + (ky - r) * f, width: 2 * r * f, height: 2 * r * f };
  const bild = await p.screenshot({ clip });
  z.bildpunkte += clip.width * clip.height;
  return p.evaluate(async (daten) => {
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
    const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
    c.drawImage(b, 0, 0);
    const d = c.getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) n += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    return n / (d.length / 4);
  }, bild.toString('base64'));
}

const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  const seiten = [];
  for (const name of ['Ana', 'Bodo']) {
    const p = await browser.newPage({ viewport: { width: 960, height: 720 } });
    p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
    await p.goto(`http://localhost:${PORT}/`);
    await anmelden(p, name);
    seiten.push(p);
  }
  const [ana] = seiten;
  await warte(600);

  // --- Knopf öffnet die Karte, Umgebung um Ana ---
  await ana.click('#karte-knopf');
  await ana.waitForFunction(() => window.__spiel.zustand().fenster === 'weltkarte', null, { timeout: 3000 }).catch(() => {});
  const stand = await ana.evaluate(() => {
    const k = document.querySelector('#fenster .weltkarte').getBoundingClientRect();
    const m = document.querySelector('#fenster .marke.ich')?.getBoundingClientRect();
    return {
      fenster: window.__spiel.zustand().fenster, marken: document.querySelectorAll('#fenster .marke').length,
      legende: [...document.querySelectorAll('#fenster .legende li')].map((l) => l.textContent),
      mitte: m && [(m.x + m.width / 2 - k.x) / k.width, (m.y + m.height / 2 - k.y) / k.height],
    };
  });
  z.marken = stand.marken;
  pruefe(stand.fenster === 'weltkarte', 'der Kartenknopf öffnet die Weltkarte');
  pruefe(stand.marken === 1 && stand.legende.some((l) => l.includes('Ana (du)') && l.includes('Startinsel')) && stand.legende.some((l) => l.includes('Bodo') && l.includes('Dimensionsriss')),
    `Ana auf der Startinsel, Bodo hinter einem Riss (${stand.legende.join(' | ')})`);
  pruefe(stand.mitte && Math.abs(stand.mitte[0] - 0.5) < 0.08 && Math.abs(stand.mitte[1] - 0.5) < 0.08,
    `Umgebung: Ana steht in der Mitte der Karte (${stand.mitte?.map((v) => v.toFixed(2)).join(', ')})`);

  // --- Ganze Welt: Nebel über dem Nordwest-Kontinent, die Startinsel klar ---
  await ana.click('#fenster [data-tun=zoom]');
  await warte(300);
  const insel = await hell(ana, welt.regionen['insel-047'].mitte, 8);
  const nordwest = await hell(ana, welt.regionen.nordwesten.mitte, 20);
  pruefe(insel > nordwest + 25, `Startinsel klar (${insel.toFixed(0)}), Nordwest-Kontinent im Nebel (${nordwest.toFixed(0)})`);
  await ana.screenshot({ path: `${wurzel}pruefstand/bilder/weltkarte.png` });

  // --- M schließt sie wieder ---
  await ana.keyboard.press('m');
  await warte(300);
  pruefe((await ana.evaluate(() => window.__spiel.zustand().fenster)) === null, 'M schließt die Karte');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${z.pruefungen} Prüfungen, ${z.marken} Marken, ${Math.round(z.bildpunkte)} Bildpunkte gemessen.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
