// Der Dieb mit echten Browsern:
//   Dina (Taktikerin, Stufe 10) und Tom (Stufe 9) stehen im Inselwald, ein
//   Stück vor einem Schleim. Bei Dina liegt auf F die Falle statt der Ablenkung.
//   Sie legt eine Falle: Tom sieht sie (violette Bildpunkte). Tom lenkt mit
//   F ab: bei Dina steht über dem Schleim ein gelbes Fragezeichen.
//
//   node pruefstand/dieb.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/dieb.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { Welt } from '../gemeinsam/welt.js';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3500;
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
const stelle = (name, farbe, x, y, erfahrung, pfad) => {
  const ort = { gebiet: 'wald', x, y };
  return { name, farbe, klasse: 'schurke', spezies: 'mensch', richtung: 'oben', ...ort, leben: 6, ankunft: ort, erfahrung, pfad };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    tom: stelle('Tom', 'rot', fleck.x, fleck.y, werte.stufen.erfahrung[8], 'akrobat'),
    // Grün, nicht lila: die Messung sucht violette Bildpunkte (die Falle), und
    // eine lila Tunika daneben zählte mit — auch ganz ohne Falle.
    dina: stelle('Dina', 'gruen', fleck.x + 30, fleck.y, werte.stufen.erfahrung[9], 'taktiker'),
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

  pruefe(!!fleck, `freier Fleck vor dem Schleim bei ${schleim.x},${schleim.y}: ${fleck?.x},${fleck?.y}`);
  const tom = await oeffnen('Tom');
  const dina = await oeffnen('Dina');
  let zd = await zustand(dina), zt = await zustand(tom);
  pruefe(zd.stufenAnzeige.zeilen.join('|') === 'Q Dolchwurf|F Vorbereitete Positionen|R Hintergrundinformationen' && zt.stufenAnzeige.zeilen.join('|') === 'Q Dolchwurf|F Doppelte Ablenkung|R Wandlauf',
    `Dina: ${zd.stufenAnzeige.zeilen.join(', ')}; Tom: ${zt.stufenAnzeige.zeilen.join(', ')}`);

  // Drücken, bis es wirkt: unter Last trifft der Schleim die beiden, und im
  // Rückstoß geht ein Tastendruck verloren (wie bei einem Spieler auch).
  const druecken = async (p, taste, bis) => {
    // Alle 50 ms nachsehen, nicht erst nach 400: der Schleim läuft Dina nach
    // und tritt in die Falle — dann war sie weg, bevor Tom sie sah.
    for (let i = 0; i < 5; i++) {
      await p.keyboard.press(taste);
      for (let t = 0; t < 400; t += 50) {
        if (await bis()) return i + 1;
        await warte(50);
      }
    }
    return 0;
  };
  // --- Dina legt eine Falle, Tom sieht sie ---
  const versuche1 = await druecken(dina, 'f', async () => (await zustand(tom)).spielerFallen >= 1);
  // Wo die Falle liegt (vor Dinas Füßen), dann geht Dina zur Seite: auf der
  // Falle stehend verdeckte sie sie, und es blieben 16 violette Bildpunkte.
  const ich = (await zustand(dina)).ich;
  await dina.keyboard.down('ArrowUp');
  await warte(450);
  await dina.keyboard.up('ArrowUp');
  await warte(200);
  zt = await zustand(tom);
  const violett = await zaehle(tom, ich.x - 16, ich.y - 20, 32, 32, 'r > 120 && b > 150 && g < r && g < b');
  pruefe(zt.spielerFallen === 1 && violett > 40, `bei Tom: ${zt.spielerFallen} Falle, ${violett} violette Bildpunkte dort (${versuche1}. Druck)`);

  // --- Tom lenkt ab, Dina sieht das Fragezeichen ---
  // Der Schleim wandert; Tom geht erst auf vier Kacheln an den nächsten heran.
  const naeherAn = async (p) => {
    for (let i = 0; i < 20; i++) {
      const z = await zustand(p);
      const g = z.gegner.filter((x) => x.sichtbar).sort((a, b) => Math.hypot(a.x - z.ich.x, a.y - z.ich.y) - Math.hypot(b.x - z.ich.x, b.y - z.ich.y))[0];
      if (!g) return -1;
      const dx = g.x - z.ich.x, dy = g.y - z.ich.y;
      if (Math.hypot(dx, dy) < 90) return Math.round(Math.hypot(dx, dy));
      const taste = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp';
      await p.keyboard.down(taste);
      await warte(150);
      await p.keyboard.up(taste);
    }
    return -2;
  };
  const abstand = await naeherAn(tom);
  const versuche2 = await druecken(tom, 'f', async () => (await zustand(dina)).gegner.some((g) => g.verwirrt));
  zd = await zustand(dina);
  const verwirrt = zd.gegner.filter((g) => g.verwirrt);
  const g = verwirrt[0];
  const gelb = g ? await zaehle(dina, g.x + 2, g.y - 38, 16, 16, 'r > 220 && g > 200 && b < 160') : 0;
  const daneben = g ? await zaehle(dina, g.x - 30, g.y - 38, 16, 16, 'r > 220 && g > 200 && b < 160') : 0;
  pruefe(verwirrt.length >= 1 && verwirrt.length <= 2 && gelb > 20 && daneben < 5, `bei Dina: ${verwirrt.length} abgelenkt, ${gelb} gelbe Bildpunkte beim Fragezeichen, ${daneben} daneben (Schleim ${abstand} Punkte weg, ${versuche2}. Druck)`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
