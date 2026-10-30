// Bogenschütze und Menü mit echten Browsern:
//   Jana (Bogenschützin, Stufe 10, Jägerschütze) und Paul stehen im Inselwald
//   nahe einem Schleim. Unten links bei Jana: Q Pfeil, F Gezielter Schuss,
//   R Beute markieren. Sie markiert (R): bei Paul steht über dem Schleim ein
//   rotes Dreieck (Bildpunkte).
//   Menü (Esc) bei Paul: „Welt zurücksetzen" ist gesperrt, mit Grund (zwei im
//   Spiel). Paul beginnt seinen Charakter neu: Rückfrage, Neuladen, beim
//   Anmelden kommt die Wahl wieder; im Spielstand ist er weg. Jana verlässt
//   das Spiel über das Menü: zurück auf der Startseite, ihr Stand bleibt.
//
//   node pruefstand/bogen.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/bogen.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { Welt } from '../gemeinsam/welt.js';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3499;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

// Ein freier Fleck zwischen der Ankunft von Riftside und dem Schleim davor.
const wald = JSON.parse(readFileSync(join(wurzel, 'inhalte/karten/wald.json'), 'utf8'));
const welt = new Welt(wald);
const schleim = welt.orte.filter((o) => o.name === 'gegner').sort((a, b) => Math.hypot(a.x - 272, a.y - 880) - Math.hypot(b.x - 272, b.y - 880))[0];
let fleck = null;
for (let f = 0.5; f <= 0.9 && !fleck; f += 0.05) {
  const x = Math.round(schleim.x + (272 - schleim.x) * f), y = Math.round(schleim.y + 8 + (888 - schleim.y - 8) * f);
  if (welt.frei(x, y) && welt.frei(x + 30, y)) fleck = { x, y };
}

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const stelle = (name, farbe, klasse, x, y, erfahrung, pfad) => {
  const ort = { gebiet: 'wald', x, y };
  return { name, farbe, klasse, spezies: 'mensch', richtung: 'oben', ...ort, leben: 6, ankunft: ort, erfahrung, pfad };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    jana: stelle('Jana', 'gruen', 'waldlaeufer', fleck.x, fleck.y, werte.stufen.erfahrung[9], 'jaeger'),
    paul: stelle('Paul', 'rot', 'kaempfer', fleck.x + 30, fleck.y, 0),
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
  // Rote Bildpunkte über einem Gegner (Weltkoordinaten), wo das Dreieck sitzt.
  const rotUeber = async (p, wx, wy) => {
    const r = await p.evaluate(([wx, wy]) => {
      const s = window.__spiel.szene, v = s.cameras.main.worldView, c = s.game.canvas.getBoundingClientRect();
      const f = c.width / s.scale.width;
      return { x: c.x + (wx - 10 - v.x) * f, y: c.y + (wy - 42 - v.y) * f, f };
    }, [wx, wy]);
    const png = await p.screenshot({ clip: { x: r.x, y: r.y, width: 20 * r.f, height: 16 * r.f } });
    bildpunkte += 20 * 16 * r.f * r.f;
    return p.evaluate(async (daten) => {
      const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
      const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
      c.drawImage(b, 0, 0);
      const d = c.getImageData(0, 0, b.width, b.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 110 && d[i + 2] < 100) n++;
      return n;
    }, png.toString('base64'));
  };

  pruefe(!!fleck, `freier Fleck vor dem Schleim bei ${schleim.x},${schleim.y}: ${fleck?.x},${fleck?.y}`);
  const paul = await oeffnen('Paul');
  const jana = await oeffnen('Jana', 150);
  let zj = await zustand(jana);
  pruefe(zj.ich.stufe === 10 && zj.stufenAnzeige.zeilen.join('|') === 'Q Pfeil|F Gezielter Schuss|R Beute markieren',
    `Jana, Stufe ${zj.ich.stufe}: ${zj.stufenAnzeige.zeilen.join(', ')}`);

  // --- Beute markieren: Paul sieht das Dreieck ---
  await jana.keyboard.press('r');
  await warte(400);
  const zp = await zustand(paul);
  const ziel = zp.gegner.find((g) => g.markiert);
  const rot = ziel ? await rotUeber(paul, ziel.x, ziel.y) : 0;
  // Gegenstück: dieselbe Höhe, 40 Punkte daneben — dort ist kein Dreieck.
  const rotDaneben = ziel ? await rotUeber(paul, ziel.x + 40, ziel.y) : 0;
  pruefe(ziel && rot > 40 && rotDaneben < 10, `bei Paul: ein Schleim markiert, ${rot} rote Bildpunkte über ihm, ${rotDaneben} daneben`);

  // --- Menü bei Paul ---
  await paul.keyboard.press('Escape');
  await warte(250);
  const menue = await paul.evaluate(() => ({
    art: window.__spiel.zustand().fenster,
    welt: document.querySelector('#fenster [data-art="welt_zuruecksetzen"]')?.disabled,
    grund: document.querySelector('#fenster .grund')?.textContent ?? '',
    knoepfe: [...document.querySelectorAll('#fenster .menue button')].map((b) => b.textContent),
  }));
  pruefe(menue.art === 'menue' && menue.welt === true && menue.grund.includes('niemand'), `Esc öffnet das Menü (${menue.knoepfe.join(' | ')}); Welt zurücksetzen gesperrt: „${menue.grund}"`);
  await paul.click('#fenster [data-art="neu_anfangen"]');
  await warte(200);
  const frage = await paul.$eval('#fenster', (f) => f.textContent);
  pruefe(frage.includes('nicht rückgängig'), 'Charakter neu beginnen fragt nach');
  await Promise.all([paul.waitForNavigation({ timeout: 10000 }), paul.click('#fenster [data-tun="neu_anfangen"]')]);
  await warte(300);
  const start = await paul.evaluate(() => !!document.getElementById('start') && !window.__spiel);
  await paul.fill('#name', 'Paul');
  await paul.click('#anmelden button[type=submit]');
  await paul.waitForFunction(() => document.getElementById('wahl')?.hidden === false || window.__spiel, null, { timeout: 10000 });
  const wahl = await paul.evaluate(() => document.getElementById('wahl')?.hidden === false);
  pruefe(start && wahl, 'nach dem Neuladen: Startseite, und Paul wählt Klasse und Spezies neu');
  const stand = JSON.parse(readFileSync(spielstand, 'utf8'));
  pruefe(!stand.spieler.paul && stand.spieler.jana?.pfad === 'jaeger', 'im Spielstand: Paul weg, Jana mit Pfad noch da');

  // --- Jana verlässt das Spiel ---
  await jana.keyboard.press('Escape');
  await warte(200);
  await Promise.all([jana.waitForNavigation({ timeout: 10000 }), jana.click('#fenster [data-tun="verlassen"]')]);
  await warte(500);
  const draussen = await jana.evaluate(() => !!document.getElementById('start') && !window.__spiel);
  const stand2 = JSON.parse(readFileSync(spielstand, 'utf8'));
  pruefe(draussen && stand2.spieler.jana?.erfahrung === werte.stufen.erfahrung[9], 'Spiel verlassen: zurück auf der Startseite, Janas Stand gespeichert');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
