// Riftside mit echten Browsern: wer neu ist, beginnt am Hafen der Stadt,
// sieht die Leute dort, spricht die Hafenmeisterin an und läuft die
// Hauptstraße hinauf durchs Stadttor in den Inselwald.
//
//   node pruefstand/riftside.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/riftside.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3465;
const bilder = join(wurzel, 'pruefstand', 'bilder');
mkdirSync(bilder, { recursive: true });
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
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

const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
let schritte = 0;
try {
  const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => fehler.push(`Seitenfehler ${e.message}`));
  await p.goto(`http://localhost:${PORT}/`);
  await anmelden(p, 'Neu');
  await warte(500);
  const zustand = () => p.evaluate(() => window.__spiel.zustand());
  const laufeBis = async (taste, bedingung, ms = 12000) => {
    await p.keyboard.down(taste);
    for (let t = 0; t < ms; t += 50) {
      await warte(50);
      schritte++;
      if (bedingung(await zustand().catch(() => ({ ich: {} })))) break;
    }
    await p.keyboard.up(taste);
    await warte(200);
  };

  let z = await zustand();
  pruefe(z.gebiet === 'riftside', `neu: Start in Riftside (${z.gebiet})`);
  pruefe(z.figuren.length === 4, `${z.figuren.length} Leute in der Stadt`);
  // Jeder sieht aus wie er soll — nicht nur „irgendeine Figur ist da".
  const falsch = z.figuren.filter((f) => f.textur !== `figur-${f.aussehen}`);
  pruefe(!falsch.length, `alle tragen ihr eigenes Aussehen (${z.figuren.map((f) => `${f.name}: ${f.textur}`).join(', ')})`);
  pruefe(z.gegner.length === 0, 'keine Gegner in der Stadt');
  pruefe(z.kanten > 300, `${z.kanten} Ufer- und Wegkanten gezeichnet`);
  pruefe(z.risse.length === 1 && z.risse[0].sichtbar, 'der Riss in der Fischergasse flimmert');
  await p.screenshot({ path: join(bilder, 'riftside-hafen.png') });

  // Zur Hafenmeisterin (24,22): nach rechts bis Spalte 24, sie steht dann
  // unterhalb — runter schauen und ansprechen.
  await laufeBis('ArrowDown', (s) => s.ich.y >= 21 * 32 + 20, 2000);
  await laufeBis('ArrowRight', (s) => s.ich.x >= 24 * 32 + 10, 3000);
  await p.keyboard.press('ArrowDown');
  await warte(150);
  z = await zustand();
  pruefe(z.hinweis, `vor der Hafenmeisterin erscheint das „E" (bei ${z.ich.x.toFixed(0)},${z.ich.y.toFixed(0)}, ${z.ich.richtung})`);
  await p.keyboard.press('e');
  await warte(300);
  z = await zustand();
  pruefe(z.dialog?.name === 'Hafenmeisterin Mara', `Hafenmeisterin spricht („${z.dialog?.name}")`);
  for (let i = 0; i < 10 && (await zustand()).dialog; i++) {
    await p.keyboard.press('e');
    await warte(120);
  }

  // In die Hafenmeisterei (Tür auf Kachel 11,17) und wieder hinaus.
  await laufeBis('ArrowLeft', (s) => s.ich.x <= 11 * 32 + 20, 5000);
  await laufeBis('ArrowUp', (s) => s.gebiet === 'hafenmeisterei', 4000);
  await warte(800);
  z = await zustand();
  pruefe(z.gebiet === 'hafenmeisterei', `durch die Tür in die Hafenmeisterei (${z.gebiet})`);
  const raum = await p.evaluate(() => {
    const s = window.__spiel.szene, v = s.cameras.main.worldView;
    return { links: -v.x, rechts: v.right - s.welt.breite * s.welt.kachel };
  });
  pruefe(Math.abs(raum.links - raum.rechts) <= 2, `der kleine Raum steht in der Bildmitte (Rand links ${raum.links.toFixed(0)}, rechts ${raum.rechts.toFixed(0)} px)`);
  await p.screenshot({ path: join(bilder, 'hafenmeisterei.png') });
  await laufeBis('ArrowDown', (s) => s.gebiet === 'riftside', 4000);
  await warte(800);
  z = await zustand();
  pruefe(z.gebiet === 'riftside' && Math.abs(z.ich.x - (11 * 32 + 16)) < 1, `über die Fußmatte wieder hinaus, vor der Tür (${z.gebiet}, x ${z.ich.x.toFixed(0)})`);

  // Hinunter zur Straße, nach rechts zur Hauptstraße, hinauf und durchs Tor.
  await laufeBis('ArrowDown', (s) => s.ich.y >= 21 * 32 + 10, 2000);
  await laufeBis('ArrowRight', (s) => s.ich.x >= 21 * 32 + 10, 5000);
  await laufeBis('ArrowUp', (s) => s.gebiet === 'wald', 15000);
  await warte(800);
  z = await zustand();
  pruefe(z.gebiet === 'wald', `durchs Stadttor in den Inselwald (${z.gebiet}, nach ${schritte} Messungen)`);
  pruefe(z.gegner.length === 6, `im Wald: ${z.gegner.length} Schleime`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
