// Der Drachenreiter mit echten Browsern:
//   Ben (Krieger, grün) und Dora (Drachenreiterin, Stufe 9) stehen in
//   Riftside. Ben sieht links neben Dora den roten Drachen mit gelbem Bauch
//   (Bildpunkte, bei Ben selbst keinen) und ihren Drachenfeuer-Ball orange auf
//   seinem Schirm. Doras Leiste: Q, F, R.
//   (Feueratem, Drachenbindung, Sturzflug, Pfade prüft server-regeln.)
//
//   node pruefstand/drachenreiter.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/drachenreiter.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3505;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const ort = { gebiet: 'riftside', x: 23 * 32 + 16, y: 20 * 32 + 24 };
const ort2 = { ...ort, x: ort.x + 64 };
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    // Grün: Bens rote Tunika läge im Farbbereich des Drachen.
    ben: { name: 'Ben', farbe: 'gruen', klasse: 'kaempfer', spezies: 'mensch', richtung: 'unten', ...ort, leben: 6, ankunft: ort },
    dora: { name: 'Dora', farbe: 'blau', klasse: 'drachenreiter', spezies: 'mensch', richtung: 'unten', ...ort2, leben: 6, ankunft: ort2, erfahrung: werte.stufen.erfahrung[8], pfad: 'drachenfluesterer' },
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

  const ben = await oeffnen('Ben');
  const dora = await oeffnen('Dora');
  const zd = await zustand(dora);
  pruefe(zd.ich.klasse === 'drachenreiter' && zd.ich.stufe === 9, `Dora ist Drachenreiterin, Stufe ${zd.ich.stufe}`);
  pruefe(zd.stufenAnzeige.zeilen.join('|') === 'Q Drachenfeuer|F Feueratem|R Flugmeister', `Doras Leiste: ${zd.stufenAnzeige.zeilen.join(', ')}`);
  // Erst nach Doras Schonfrist: solange blinkt die Figur.
  await warte(2500);
  let zb = await zustand(ben);
  const doraBeiBen = zb.andere.find((a) => a.textur.startsWith('held-drachenreiter-'));
  pruefe(!!doraBeiBen && doraBeiBen.effekt.includes('D'), `Ben sieht Dora als Drachenreiterin mit Drachen (${doraBeiBen?.textur}, e = „${doraBeiBen?.effekt}")`);
  // Rote Schuppen und gelber Bauch, links neben Dora — neben Ben nichts davon.
  const schuppen = 'Math.abs(r - 200) < 20 && Math.abs(g - 58) < 20 && Math.abs(b - 42) < 20';
  const bauch = 'Math.abs(r - 240) < 16 && Math.abs(g - 192) < 16 && Math.abs(b - 96) < 20';
  const links = (z) => [z.x - 34, z.y - 46, 32, 34];
  const [rotDora, gelbDora] = doraBeiBen ? [await zaehle(ben, ...links(doraBeiBen), schuppen), await zaehle(ben, ...links(doraBeiBen), bauch)] : [0, 0];
  const rotBen = await zaehle(ben, ...links(zb.ich), schuppen);
  pruefe(rotDora > 30 && gelbDora > 5 && rotBen === 0, `Drache bei Ben am Bildpunkt: ${rotDora} rote, ${gelbDora} gelbe neben Dora, ${rotBen} rote neben Ben`);
  // --- Drachenfeuer (Q): Ben sieht den Ball orange auf dem Schirm ---
  // Ganzer Schirm, vorher und im Flug: ein kleiner Ausschnitt um den Ball verfehlte
  // ihn (s. klassen.mjs, als es noch den Magier gab).
  const orange = 'Math.abs(r - 240) < 30 && Math.abs(g - 120) < 30 && Math.abs(b - 40) < 30';
  const ganz = async () => {
    const v = await ben.evaluate(() => window.__spiel.szene.cameras.main.worldView);
    return zaehle(ben, v.x, v.y, v.width, v.height, orange);
  };
  const vorher = await ganz();
  await dora.keyboard.press('ArrowRight');
  await dora.keyboard.press('q');
  let gesehen = 0, mehr = 0;
  for (let i = 0; i < 30; i++) {
    zb = await zustand(ben);
    const f = zb.geschosse.filter((g) => g.art === 'feuerball');
    if (f.length) {
      gesehen++;
      if (!mehr) mehr = (await ganz()) - vorher;
    }
    if (gesehen && !f.length) break;
    await warte(30);
  }
  pruefe(gesehen > 0 && mehr > 5, `Ben sieht Doras Drachenfeuer (${gesehen}× im Stand, ${mehr} orange Bildpunkte mehr als vorher)`);
  if (process.env.BILDER) await ben.screenshot({ path: wurzel + 'pruefstand/bilder/drachenreiter-ben.png' });
  await dora.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
