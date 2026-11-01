// Der Arzt mit echten Browsern:
//   Alma (Ärztin, Stufe 7, Alchemistin) und Ben (Krieger, verletzt) stehen im
//   Inselwald. Unten links bei Alma: Q Erste Hilfe, F Feldbehandlung,
//   R Heilsalbe. Alma wirft die Heilsalbe zu Ben: bei Ben platzt ein grüner
//   Kreis, und seine Herzen steigen. Dann sieht Alma über dem Schleim einen
//   Lebensbalken (Diagnose, rot am Bildpunkt), Ben nicht.
//
//   node pruefstand/arzt.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/arzt.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { Welt } from '../gemeinsam/welt.js';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3501;
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

// Ben drei Kacheln über Alma, wenn dort frei ist, sonst darunter.
const oben = welt.frei(fleck.x, fleck.y - 96);
const ben = { x: fleck.x, y: fleck.y + (oben ? -96 : 96) };
const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const stelle = (name, farbe, klasse, x, y, erfahrung, pfad, leben, richtung) => {
  const ort = { gebiet: 'wald', x, y };
  return { name, farbe, klasse, spezies: 'mensch', richtung, ...ort, leben, ankunft: ort, erfahrung, pfad };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    // Grün, nicht rot: die rote Tunika (208,72,72) liegt in der Toleranz des
    // Lebensbalkens — stand Ben nah am Schleim, zählte sie als Balken (volle Runde, 1.11.).
    ben: stelle('Ben', 'gruen', 'kaempfer', ben.x, ben.y, 0, null, 2, 'unten'),
    alma: stelle('Alma', 'blau', 'kleriker', fleck.x, fleck.y, werte.stufen.erfahrung[6], 'alchemist', 8, oben ? 'oben' : 'unten'),
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

  pruefe(!!fleck && welt.frei(ben.x, ben.y), `Alma bei ${fleck?.x},${fleck?.y}, Ben ${oben ? 'darüber' : 'darunter'}`);
  const benSeite = await oeffnen('Ben');
  const alma = await oeffnen('Alma');
  let za = await zustand(alma);
  pruefe(za.stufenAnzeige.zeilen.join('|') === 'Q Erste Hilfe|F Feldbehandlung|R Heilsalbe', `Alma: ${za.stufenAnzeige.zeilen.join(', ')}`);

  // Erst die Heilsalbe (Alma steht noch vor Ben), dann geht sie für die
  // Diagnose zum Schleim — umgekehrt flog die Salbe ins Leere.
  // --- Heilsalbe zu Ben ---
  const lebenVor = (await zustand(benSeite)).ich.leben;
  const gruen = 'g > 180 && r > 100 && r < 200 && b < 170';
  const bz = (await zustand(benSeite)).ich;
  const gruenVor = await zaehle(benSeite, bz.x - 24, bz.y - 32, 48, 40, gruen);
  await alma.keyboard.press('r');
  let gruenIm = 0;
  for (let t = 0; t < 600 && !gruenIm; t += 50) {
    await warte(50);
    if ((await zustand(benSeite)).mixturen) gruenIm = await zaehle(benSeite, bz.x - 24, bz.y - 32, 48, 40, gruen);
  }
  await warte(300);
  const zb = await zustand(benSeite);
  pruefe(zb.mixturen === 1 && gruenIm > gruenVor + 100, `bei Ben platzt die Mixtur: ${gruenVor} → ${gruenIm} grüne Bildpunkte`);
  pruefe(zb.ich.leben > lebenVor, `Bens Herzen: ${lebenVor} → ${zb.ich.leben} halbe`);
  // --- Diagnose: Alma sieht Lebensbalken, Ben nicht ---
  const imBild = async (p) => {
    const z = await zustand(p);
    const v = await p.evaluate(() => { const w = window.__spiel.szene.cameras.main.worldView; return { x: w.x, y: w.y, b: w.width, h: w.height }; });
    return z.gegner.filter((g) => g.sichtbar && g.x > v.x + 20 && g.x < v.x + v.b - 20 && g.y > v.y + 40 && g.y < v.y + v.h);
  };
  // Der Schleim wandert: Alma geht heran, bis er nah ist, wartet, bis die
  // Kamera steht, und misst dann. Wandert er dabei aus dem Bild, noch einmal
  // (in der vollen Runde fehlte er zweimal, einmal stand die Kamera noch nicht).
  // Genau die Farbe des Balkens (0xe04848): ein bloßes „rot" zählte den Kopf
  // des Schleims mit, der knapp unter dem Balken sitzt.
  const rot = 'Math.abs(r - 224) < 24 && Math.abs(g - 72) < 24 && Math.abs(b - 72) < 24';
  let ga = null, balkenAlma = -1;
  for (let versuch = 0; versuch < 5 && balkenAlma <= 20; versuch++) {
    for (let i = 0; i < 20; i++) {
      const z = await zustand(alma);
      const g = z.gegner.filter((x) => x.sichtbar).sort((a, b) => Math.hypot(a.x - z.ich.x, a.y - z.ich.y) - Math.hypot(b.x - z.ich.x, b.y - z.ich.y))[0];
      if (!g || Math.hypot(g.x - z.ich.x, g.y - z.ich.y) < 100) break;
      const dx = g.x - z.ich.x, dy = g.y - z.ich.y;
      const taste = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp';
      await alma.keyboard.down(taste);
      await warte(200);
      await alma.keyboard.up(taste);
    }
    await warte(700);
    ga = (await imBild(alma))[0];
    balkenAlma = ga ? await zaehle(alma, ga.x - 14, ga.y - 33, 28, 10, rot) : -1;
  }
  // Ben: kein Balken über irgendeinem Gegner; ist einer in seinem Bild, auch am Bildpunkt.
  const gb = (await imBild(benSeite))[0];
  const balkenBen = gb ? await zaehle(benSeite, gb.x - 14, gb.y - 33, 28, 10, rot) : 0;
  const keinerBeiBen = (await zustand(benSeite)).gegner.every((g) => g.balken === null);
  pruefe(ga?.balken > 0 && balkenAlma > 20 && keinerBeiBen && balkenBen < 5, `Diagnose: über dem Schleim bei Alma ${balkenAlma} rote Bildpunkte, bei Ben keine Balken (${gb ? balkenBen + ' am Bildpunkt' : 'kein Schleim in seinem Bild'})`);

} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
