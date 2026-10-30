// Tür, Gruppenschlüssel und Dimensionsriss mit echten Browsern:
//   Anna steht in der Höhle vor der verschlossenen Tür; die Gruppe hat einen
//   Schlüssel (laut Spielstand). Ben steht in Riftside vor dem Riss in der
//   Fischergasse, Dana daneben.
//   Anna schließt auf — sie geht durch, Ben sieht den Schlüssel verschwinden.
//   Ben geht in den Riss — er ist im Tempel.
//   Cora steht im Tempel vor dem Sockel und nimmt das Idol — Dana sieht
//   den Riss in der Gasse verschwinden.
//
//   node pruefstand/risse.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/risse.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3464;
const bilder = join(wurzel, 'pruefstand', 'bilder');
mkdirSync(bilder, { recursive: true });
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const stelle = (name, farbe, gebiet, x, y, richtung) => {
  const ort = { gebiet, x, y };
  return { name, farbe, klasse: 'kaempfer', spezies: 'mensch', richtung, ...ort, leben: 6, ankunft: ort };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: { gruppe: { schluessel: 1 } },
  spieler: {
    anna: stelle('Anna', 'gruen', 'hoehle', 20 * 32 + 16, 5 * 32 + 24, 'rechts'),
    ben: stelle('Ben', 'rot', 'riftside', 34 * 32 + 16, 16 * 32 + 24, 'oben'),
    cora: stelle('Cora', 'blau', 'tempel', 10 * 32 + 16, 5 * 32 + 16, 'oben'),
    dana: stelle('Dana', 'lila', 'riftside', 33 * 32 + 16, 13 * 32 + 24, 'rechts'),
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
    await anmelden(p, name);
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

  // Ben (in Riftside, ohne Schleime) zuerst: Anna steht in der Höhle neben
  // Schleimen und muss gleich nach dem Beitreten an die Tür — in ihrer
  // Schonfrist. Andersherum lief die Frist ab, während Bens Seite lud, und in
  // der vollen Runde (Maschine ausgelastet) stieß sie ein Schleim weg.
  const ben = await oeffnen('Ben');
  const anna = await oeffnen('Anna');
  let za = await zustand(anna), zb = await zustand(ben);
  pruefe(za.anzeige === 'schluessel 1' && zb.anzeige === 'schluessel 1', `beide sehen den Gruppenschlüssel, obwohl in verschiedenen Gebieten („${za.anzeige}" / „${zb.anzeige}")`);
  const riss = (z, ziel) => z.risse.find((r) => r.ziel === ziel);
  pruefe(zb.risse.length === 2 && riss(zb, 'tempel')?.sichtbar && riss(zb, 'akropolis')?.sichtbar, 'Ben sieht beide Risse: Fischergasse und Seilergasse');
  pruefe(za.hinweis, 'vor der Tür steht das „E"');

  await anna.keyboard.press('e');
  await warte(400);
  za = await zustand(anna);
  zb = await zustand(ben);
  pruefe(za.tueren.includes('hoehle_tuer'), 'die Tür ist offen');
  pruefe(za.anzeige === '' && zb.anzeige === '', `der Schlüssel ist bei beiden aus der Anzeige verschwunden („${za.anzeige}" / „${zb.anzeige}")`);
  pruefe(!za.dialog, 'aufschließen braucht keine Textbox');
  await laufeBis(anna, 'ArrowRight', (z) => z.ich.x >= 23 * 32);
  za = await zustand(anna);
  pruefe(za.ich.x > 22 * 32, `Anna ist durch die Tür gegangen (x = ${za.ich.x.toFixed(0)})`);

  // --- Ben geht in den Riss ---
  await laufeBis(ben, 'ArrowUp', (z) => z.gebiet === 'tempel');
  await warte(800);
  zb = await zustand(ben);
  pruefe(zb.gebiet === 'tempel', `Ben ist durch den Riss im Tempel (${zb.gebiet})`);
  pruefe(zb.gegner.length === 2 && zb.gegner.every((g) => g.id.startsWith('tempel-')), `im Tempel: ${zb.gegner.length} Tempel-Schleime`);
  await ben.screenshot({ path: join(bilder, 'tempel.png') });

  // --- Cora nimmt das Idol: der Riss in der Gasse schließt sich ---
  const dana = await oeffnen('Dana');
  let zd = await zustand(dana);
  pruefe(riss(zd, 'tempel')?.sichtbar, 'Dana in der Gasse sieht den Riss noch');
  // Sofort nach dem Beitreten, in der Schonfrist: früher standen Schleime in
  // Sichtweite der Truhe, und ein Treffer stieß Cora manchmal von ihr weg.
  const cora = await oeffnen('Cora', 150);
  await cora.keyboard.press('e');
  await warte(500);
  const zc = await zustand(cora);
  pruefe(zc.zustaende.tempel_geschlossen && zc.anzeige === 'idol 1',
    `Cora hat das Idol (Anzeige „${zc.anzeige}"; Cora bei ${zc.ich.x.toFixed(0)},${zc.ich.y.toFixed(0)}, Leben ${zc.ich.leben})`);
  await warte(1000);
  zd = await zustand(dana);
  pruefe(zd.zustaende.tempel_geschlossen && !riss(zd, 'tempel').sichtbar && riss(zd, 'akropolis').sichtbar, 'Dana sieht den Riss in der Fischergasse verschwinden — der in der Seilergasse bleibt');
  pruefe(zd.anzeige === 'idol 1', `Dana sieht das Idol der Gruppe („${zd.anzeige}")`);
  zb = await zustand(ben);
  pruefe(zb.risse.length === 1 && zb.risse[0].sichtbar, 'der Rückweg-Riss im Tempel bleibt offen');
  await dana.screenshot({ path: join(bilder, 'riftside.png') });
  // Dana ist seit gut 2 s spielbereit: die Schonfrist (1,5 s ab „bereit") ist vorbei.
  pruefe(!zd.ich.unverwundbar, 'die Schonfrist endet, nachdem der Browser „bereit" gemeldet hat');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
