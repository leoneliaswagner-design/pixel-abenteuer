// Der Musiker mit echten Browsern:
//   Ben (Krieger) steht in Riftside am Start. Mia meldet sich neu an und
//   wählt den Musiker: Ben sieht das weinrote Barett (Bild des Musikers). Mia
//   stimmt das Lied der Tapferen an (F): über Ben und Mia schwebt bei Ben
//   eine goldene Note. (Lethargie, Klangstoß und Pfade prüft server-regeln.)
//
//   node pruefstand/musiker.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/musiker.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3503;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
// Riftside, neben dem Start: dort kommt Mia als Neue an.
const ort = { gebiet: 'riftside', x: 23 * 32 + 16, y: 20 * 32 + 24 };
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: { ben: { name: 'Ben', farbe: 'rot', klasse: 'kaempfer', spezies: 'mensch', richtung: 'unten', ...ort, leben: 6, ankunft: ort } },
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
  // Mia ist neu: Wahl der Klasse im Browser, Musiker.
  const mia = await browser.newPage({ viewport: { width: 960, height: 540 } });
  mia.on('pageerror', (e) => fehler.push(`Mia: Seitenfehler ${e.message}`));
  await mia.goto(`http://localhost:${PORT}/`);
  const gewaehlt = await anmelden(mia, 'Mia', { klasse: 'musiker' });
  await warte(800);
  const zm = await zustand(mia);
  pruefe(gewaehlt?.klasse === 'musiker' && zm.ich.klasse === 'musiker' && zm.ich.textur.startsWith('held-musiker-'), `Mia wählt den Musiker (${zm.ich.textur})`);
  pruefe(zm.stufenAnzeige.zeilen.join('|') === 'Q Klangstoß|F Lied der Tapferen', `Mia, Stufe 1: ${zm.stufenAnzeige.zeilen.join(', ')}`);
  let zb = await zustand(ben);
  let miaBeiBen = zb.andere.find((a) => a.textur.startsWith('held-musiker-'));
  pruefe(!!miaBeiBen, `Ben sieht Mia als Musiker (${zb.andere.map((a) => a.textur).join(', ')})`);
  // Weinrot des Baretts am Bildpunkt, oben auf Mias Kopf bei Ben — erst
  // nach Mias Schonfrist, sonst blinkt die Figur.
  await warte(2500);
  const barett = miaBeiBen ? await zaehle(ben, miaBeiBen.x - 10, miaBeiBen.y - 50, 20, 12, 'r > 110 && r < 200 && g < 90 && b > 50 && b < 130 && r > b + 30') : 0;
  pruefe(barett > 25, `Barett bei Ben am Bildpunkt: ${barett} weinrote Bildpunkte`);
  // --- Lied (F): goldene Note über beiden, bei Ben gemessen ---
  const gold = 'r > 225 && g > 190 && g < 235 && b < 120';
  const noteBen = () => zaehle(ben, zb.ich.x + 4, zb.ich.y - 66, 16, 20, gold);
  const vorher = await noteBen();
  await mia.keyboard.press('f');
  for (let t = 0; t < 1000 && !(await zustand(ben)).ich.effekt.includes('n'); t += 50) await warte(50);
  await warte(100);
  zb = await zustand(ben);
  miaBeiBen = zb.andere.find((a) => a.textur.startsWith('held-musiker-'));
  const nachher = await noteBen();
  const noteMia = miaBeiBen ? await zaehle(ben, miaBeiBen.x + 4, miaBeiBen.y - 66, 16, 20, gold) : 0;
  pruefe(zb.ich.effekt.includes('n') && miaBeiBen?.effekt.includes('n'), `Lied: Ben und Mia sind beschwingt (e = „${zb.ich.effekt}" / „${miaBeiBen?.effekt}")`);
  pruefe(vorher < 3 && nachher > 10 && noteMia > 10, `Note am Bildpunkt bei Ben: über Ben ${vorher} → ${nachher}, über Mia ${noteMia} goldene Bildpunkte`);
  await mia.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
