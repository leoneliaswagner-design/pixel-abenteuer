// Tür, Gruppenschlüssel und Dimensionsriss mit echten Browsern:
//   Anna steht in der Höhle vor der verschlossenen Tür; die Gruppe hat einen
//   Schlüssel (laut Spielstand). Ben steht auch in der Höhle.
//   Anna schließt auf — beide sehen die Tür offen und den Schlüssel weg.
//   Anna geht durch die Tür und in den Riss — sie ist im Tempel.
//   Cora steht im Tempel vor der Truhe und nimmt den Rissstein — Ben sieht
//   den Riss in der Höhle verschwinden.
//
//   node pruefstand/risse.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/risse.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3464;
const bilder = join(wurzel, 'pruefstand', 'bilder');
mkdirSync(bilder, { recursive: true });
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const stelle = (name, farbe, gebiet, x, y, richtung) => {
  const ort = { gebiet, x, y };
  return { name, farbe, richtung, ...ort, leben: 6, ankunft: ort };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: { gruppe: { schluessel: 1 } },
  spieler: {
    anna: stelle('Anna', 'gruen', 'hoehle', 20 * 32 + 16, 5 * 32 + 24, 'rechts'),
    ben: stelle('Ben', 'rot', 'hoehle', 18 * 32 + 16, 6 * 32 + 24, 'rechts'),
    cora: stelle('Cora', 'blau', 'tempel', 9 * 32 + 16, 3 * 32 + 16, 'oben'),
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
  const oeffnen = async (name, nachher = 500) => {
    const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
    p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
    await p.goto(`http://localhost:${PORT}/`);
    await p.fill('#name', name);
    await p.click('button[type=submit]');
    await p.waitForFunction(() => window.__spiel?.zustand, null, { timeout: 10000 });
    await warte(nachher);
    return p;
  };
  const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
  // Laufen, bis eine Bedingung über den Zustand gilt (höchstens ms).
  const laufeBis = async (p, taste, bedingung, ms = 4000) => {
    await p.keyboard.down(taste);
    for (let t = 0; t < ms; t += 50) {
      await warte(50);
      if (bedingung(await zustand(p).catch(() => ({ ich: {} })))) break;
    }
    await p.keyboard.up(taste);
    await warte(150);
  };

  const anna = await oeffnen('Anna');
  const ben = await oeffnen('Ben');
  let za = await zustand(anna), zb = await zustand(ben);
  pruefe(za.anzeige === 'schluessel 1' && zb.anzeige === 'schluessel 1', `beide sehen den Gruppenschlüssel in der Anzeige („${za.anzeige}" / „${zb.anzeige}")`);
  pruefe(zb.risse.length === 1 && zb.risse[0].sichtbar, 'Ben sieht den Riss hinter der Tür');
  pruefe(za.hinweis, 'vor der Tür steht das „E"');

  await anna.keyboard.press('e');
  await warte(400);
  za = await zustand(anna);
  zb = await zustand(ben);
  pruefe(za.tueren.includes('hoehle_tuer') && zb.tueren.includes('hoehle_tuer'), 'die Tür ist bei beiden offen');
  pruefe(za.anzeige === '' && zb.anzeige === '', `der Schlüssel ist bei beiden aus der Anzeige verschwunden („${za.anzeige}")`);
  pruefe(!za.dialog, 'aufschließen braucht keine Textbox');

  // Durch die Tür nach rechts bis unter den Riss (Spalte 24), dann hinauf.
  await laufeBis(anna, 'ArrowRight', (z) => z.ich.x >= 24 * 32 + 10);
  za = await zustand(anna);
  pruefe(za.ich.x > 22 * 32, `Anna ist durch die Tür gegangen (x = ${za.ich.x.toFixed(0)})`);
  await laufeBis(anna, 'ArrowUp', (z) => z.gebiet === 'tempel');
  await warte(800);
  za = await zustand(anna);
  pruefe(za.gebiet === 'tempel', `Anna ist durch den Riss im Tempel (${za.gebiet})`);
  pruefe(za.gegner.length === 4 && za.gegner.every((g) => g.id.startsWith('tempel-')), `im Tempel: ${za.gegner.length} Tempel-Schleime`);
  await anna.screenshot({ path: join(bilder, 'tempel.png') });

  // --- Cora nimmt den Rissstein: der Riss in der Höhle schließt sich ---
  // Sofort nach dem Beitreten, in der Schonfrist: zwei Schleime stehen in
  // Sichtweite der Truhe, und ein Treffer stieß Cora manchmal von ihr weg.
  const cora = await oeffnen('Cora', 150);
  await cora.keyboard.press('e');
  await warte(500);
  const zc = await zustand(cora);
  pruefe(zc.zustaende.tempel_geschlossen && zc.anzeige === 'rissstein 1',
    `Cora hat den Rissstein (Anzeige „${zc.anzeige}"; Cora bei ${zc.ich.x.toFixed(0)},${zc.ich.y.toFixed(0)} ${zc.ich.richtung}, Leben ${zc.ich.leben}, Hinweis ${zc.hinweis}, Box ${zc.dialog?.text ?? '–'})`);
  await warte(1000);
  zb = await zustand(ben);
  pruefe(zb.zustaende.tempel_geschlossen && !zb.risse[0].sichtbar, 'Ben in der Höhle sieht den Riss verschwinden');
  pruefe(zb.anzeige === 'rissstein 1', `Ben sieht den Rissstein der Gruppe („${zb.anzeige}")`);
  za = await zustand(anna);
  pruefe(za.risse.length === 1 && za.risse[0].sichtbar, 'der Rückweg-Riss im Tempel bleibt offen');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
