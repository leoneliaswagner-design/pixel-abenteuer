// Das Grabmal (frei nach dem Grab der Schrecken) mit echten Browsern, die
// Gegner stehen still (GEGNER_STILL=1) — gemessen werden Räume und Fallen:
//   Ana vor dem Teufelsgesicht sieht es grün am Bildpunkt; Ben klopft im
//   linken Gang an die Wand, Dora daneben sieht die Geheimtür aufgehen
//   (dunkle Öffnung am Bildpunkt); Cleo in der Gruft sieht den Lebensbalken
//   des Demilich, Ana nicht; Ana geht in den Mund — besiegt, Dora sieht es.
//
//   node pruefstand/grabmal.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/grabmal.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3507;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const spieler = (name, farbe, x, y, richtung) => {
  const ort = { gebiet: 'grabmal', x: x * 32 + 16, y: y * 32 + 24 };
  return { name, farbe, klasse: 'kaempfer', spezies: 'mensch', richtung, ...ort, leben: 6, ankunft: ort };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    ana: spieler('Ana', 'blau', 20, 12, 'oben'),
    ben: spieler('Ben', 'gruen', 5, 26, 'rechts'),
    cleo: spieler('Cleo', 'lila', 11, 5, 'oben'),
    dora: spieler('Dora', 'rot', 4, 29, 'oben'),
  },
}));

const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, ZUFALL: '0.99', GEGNER_STILL: '1', PORT: String(PORT), SPIELSTAND: spielstand } });
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

  const ana = await oeffnen('Ana');
  const ben = await oeffnen('Ben');
  const cleo = await oeffnen('Cleo');
  await warte(2000);
  // --- Das Teufelsgesicht über dem Schlund, grün auf Anas Schirm ---
  let za = await zustand(ana);
  // Im Dunkeln ist das Grün matt: kein Mindestwert für g, nur „grüner als rot
  // und blau" — mit g > 50 blieben im Fackelschein 152 von 24 000 übrig.
  const gruen = 'g > r + 8 && g > b + 8';
  const gesicht = await zaehle(ana, 20 * 32 - 32, 7 * 32, 96, 64, gruen);
  pruefe(za.gebiet === 'grabmal' && gesicht > 3000, `Teufelsgesicht bei Ana am Bildpunkt: ${gesicht} grüne Bildpunkte`);
  // --- Lebensbalken des Demilich: Cleo in der Gruft ja, Ana nein ---
  const zc = await zustand(cleo);
  const lila = 'r > 150 && b > 190 && g < 110';
  const balken = await cleo.evaluate(() => {
    const s = window.__spiel.szene, c = s.game.canvas.getBoundingClientRect(), f = c.width / s.scale.width;
    return { x: c.x + (s.scale.width / 2 - 100) * f, y: c.y + 49 * f, b: 200 * f, h: 6 * f };
  });
  const png = await cleo.screenshot({ clip: { x: balken.x, y: balken.y, width: balken.b, height: balken.h } });
  bildpunkte += balken.b * balken.h;
  const lilaPunkte = await cleo.evaluate(async ([daten, bed]) => {
    const pruef = new Function('r', 'g', 'b', `return ${bed}`);
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
    const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
    c.drawImage(b, 0, 0);
    const d = c.getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (pruef(d[i], d[i + 1], d[i + 2])) n++;
    return n;
  }, [png.toString('base64'), lila]);
  pruefe(zc.boss?.art === 'demilich' && zc.boss.breite === 200 && lilaPunkte > 500 && za.boss === null,
    `Lebensbalken: Cleo sieht ${zc.boss?.art} (${lilaPunkte} lila Bildpunkte), Ana in einem anderen Raum keinen (${za.boss})`);
  // Höchstens drei Fenster zugleich: mit vier kam das vierte auf vier Kernen
  // nicht in zehn Sekunden hoch (die dunkle Karte mit Licht ist teuer).
  await cleo.close();
  const dora = await oeffnen('Dora');
  await warte(1500);
  // --- Geheimtür: Ben klopft, Dora sieht die dunkle Öffnung ---
  const tuer = [6 * 32 + 8, 26 * 32 + 6, 16, 22];
  const dunkel = 'r < 30 && g < 26 && b < 30';
  const vorher = await zaehle(dora, ...tuer, dunkel);
  // Vorher sieht sie aus wie Wand: kein Holz der gewöhnlichen Tür.
  const holz = await zaehle(dora, ...tuer, 'r > g + 25 && g > b + 15 && r > 60');
  await ben.keyboard.press('e');
  for (let i = 0; i < 20 && !(await zustand(dora)).tueren.includes('grabmal_geheim1'); i++) await warte(50);
  await warte(150);
  const nachher = await zaehle(dora, ...tuer, dunkel);
  pruefe(holz < 20 && (await zustand(dora)).tueren.includes('grabmal_geheim1') && nachher > vorher + 100, `Geheimtür: vorher wie Wand (${holz} Holz-Bildpunkte), bei Dora offen, dunkle Bildpunkte ${vorher} → ${nachher}`);
  // --- Ana geht in den Mund des Teufelsgesichts ---
  await ana.keyboard.down('ArrowUp');
  let weg = false;
  for (let i = 0; i < 40 && !weg; i++) {
    await warte(50);
    weg = (await zustand(dora)).andere.find((a) => a.textur?.includes('blau'))?.tot || (await zustand(ana)).ich.tot;
  }
  await ana.keyboard.up('ArrowUp');
  za = await zustand(ana);
  pruefe(za.ich.tot, `Ana geht in den Schlund: besiegt (${za.ich.tot})`);
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
