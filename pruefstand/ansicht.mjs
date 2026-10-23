// Ein Bild von einer Stelle im Spiel — zum Vergleichen vor und nach einer
// Grafik-Änderung.
//   node pruefstand/ansicht.mjs <gebiet> <kachel-x> <kachel-y> <datei.png> [weitere: gebiet x y datei …]
//   OHNE_BAU=1 node pruefstand/ansicht.mjs wald 19 14 bilder/wald.png
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const auftraege = [];
const a = process.argv.slice(2);
for (let i = 0; i + 3 < a.length; i += 4) auftraege.push({ gebiet: a[i], x: Number(a[i + 1]), y: Number(a[i + 2]), datei: resolve(a[i + 3]) });
if (!auftraege.length) {
  console.log('Aufruf: node pruefstand/ansicht.mjs <gebiet> <kachel-x> <kachel-y> <datei.png> …');
  process.exit(1);
}
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const PORT = 3470;
const browser = await chromium.launch();
try {
  for (const [n, auftrag] of auftraege.entries()) {
    const spielstand = join(mkdtempSync(join(tmpdir(), 'ansicht-')), 'stand.json');
    const ort = { gebiet: auftrag.gebiet, x: auftrag.x * 32 + 16, y: auftrag.y * 32 + 24 };
    writeFileSync(spielstand, JSON.stringify({ version: 1, welt: {}, spieler: { blick: { name: 'Blick', farbe: 'gruen', richtung: 'unten', ...ort, leben: 6, ankunft: ort } } }));
    const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(PORT + n), SPIELSTAND: spielstand } });
    await new Promise((gut) => server.stdout.on('data', (d) => String(d).includes(`:${PORT + n}`) && gut()));
    const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
    await p.goto(`http://localhost:${PORT + n}/`);
    await p.fill('#name', 'Blick');
    await p.click('button[type=submit]');
    await p.waitForFunction(() => window.__spiel?.zustand, null, { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1800));
    mkdirSync(dirname(auftrag.datei), { recursive: true });
    await p.screenshot({ path: auftrag.datei });
    console.log(`${auftrag.gebiet} (${auftrag.x},${auftrag.y}) → ${auftrag.datei}`);
    await p.close();
    server.kill();
  }
} finally {
  await browser.close();
}
