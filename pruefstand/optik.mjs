// Der neue Stil im Browser: Tag und Nacht (am Bildpunkt gemessen), Licht der
// Laternen, dunkle Höhle, helle Innenräume, Deko auf den Wiesen, Wind in den
// Bäumen, Figuren 32×48, und dieselbe Uhrzeit bei zwei Spielern.
//
//   node pruefstand/optik.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/optik.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anmelden } from './anmelden.mjs';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const fehler = [];
const z = { pruefungen: 0, server: 0, bildpunkte: 0 };
const pruefe = (bed, text) => {
  z.pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

// Ein Server mit fester Tageszeit und Spielern an bestimmten Stellen.
async function mitServer(tageszeit, spieler, fn) {
  const port = 3480 + z.server++;
  const datei = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
  const eintraege = Object.fromEntries(spieler.map(([name, gebiet, x, y], i) => {
    const ort = { gebiet, x: x * 32 + 16, y: y * 32 + 24 };
    return [name.toLowerCase(), { name, farbe: ['gruen', 'rot'][i], klasse: 'kaempfer', spezies: 'mensch', richtung: 'unten', ...ort, leben: 8, ankunft: ort, inventar: {} }];
  }));
  writeFileSync(datei, JSON.stringify({ version: 1, welt: {}, spieler: eintraege }));
  const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(port), SPIELSTAND: datei, TAGESZEIT: String(tageszeit) } });
  let log = '';
  await new Promise((gut, schlecht) => {
    const t = setTimeout(() => schlecht(new Error('Server startet nicht:\n' + log)), 8000);
    const lesen = (d) => {
      log += d;
      if (log.includes(`:${port}`)) clearTimeout(t), gut();
    };
    server.stdout.on('data', lesen);
    server.stderr.on('data', lesen);
  });
  const seiten = [];
  try {
    for (const [name] of spieler) {
      const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
      p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
      await p.goto(`http://localhost:${port}/`);
      await anmelden(p, name);
      seiten.push(p);
    }
    await warte(700);
    await fn(...seiten);
  } finally {
    for (const p of seiten) await p.close();
    server.kill();
  }
}

// Mittlere Helligkeit eines Weltausschnitts (Kachel tx, ty; w×h Kacheln).
async function helligkeit(p, tx, ty, w = 1, h = 1) {
  const r = await p.evaluate(([wx, wy]) => {
    const s = window.__spiel.szene, v = s.cameras.main.worldView, c = s.game.canvas.getBoundingClientRect();
    const f = c.width / s.scale.width;
    return { x: c.x + (wx - v.x) * f, y: c.y + (wy - v.y) * f, f };
  }, [tx * 32, ty * 32]);
  const bild = await p.screenshot({ clip: { x: r.x, y: r.y, width: w * 32 * r.f, height: h * 32 * r.f } });
  z.bildpunkte += w * h * 32 * 32 * r.f * r.f;
  return p.evaluate(async (daten) => {
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
    const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
    c.drawImage(b, 0, 0);
    const d = c.getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) n += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    return n / (d.length / 4);
  }, bild.toString('base64'));
}

try {
  // --- Nacht in Riftside: Laterne hell, abseits dunkel; zwei Spieler, eine Uhr ---
  await mitServer(0.92, [['Nora', 'riftside', 22, 9], ['Olaf', 'riftside', 23, 9]], async (nora, olaf) => {
    const s = await zustand(nora), t = await zustand(olaf);
    pruefe(s.licht.art === 'draussen' && s.licht.dunkelheit > 0.6, `Nacht: Dunkelheit ${s.licht.dunkelheit.toFixed(2)} (Uhr ${s.licht.zeit.toFixed(2)})`);
    pruefe(Math.abs(s.licht.zeit - t.licht.zeit) < 0.003, `beide Spieler haben dieselbe Uhrzeit (${s.licht.zeit.toFixed(3)} / ${t.licht.zeit.toFixed(3)})`);
    const laterne = await helligkeit(nora, 20, 7), abseits = await helligkeit(nora, 28, 12);
    pruefe(abseits < 70 && laterne > abseits + 30, `an der Laterne hell (${laterne.toFixed(0)}), abseits dunkel (${abseits.toFixed(0)})`);
    await nora.screenshot({ path: `${wurzel}pruefstand/bilder/nacht.png` });
  });

  // --- Tag: dieselbe Stelle hell, keine Verdunklung; Wind und Figuren ---
  await mitServer(0.5, [['Pia', 'riftside', 22, 9]], async (p) => {
    const s = await zustand(p);
    const abseits = await helligkeit(p, 28, 12);
    pruefe(s.licht.dunkelheit < 0.01 && abseits > 110, `Tag: Dunkelheit ${s.licht.dunkelheit.toFixed(2)}, dieselbe Stelle hell (${abseits.toFixed(0)})`);
    const hoehe = await p.evaluate(() => {
      const sz = window.__spiel.szene;
      return { ich: sz.ich.koerper.frame.height, leute: [...sz.dinge.values()].filter((d) => d.ding.name === 'figur').map((d) => d.bild.frame.height) };
    });
    pruefe(s.schatten > 20, `Schatten unter den Hauswänden: ${s.schatten} Kacheln`);
    pruefe(hoehe.ich === 48 && hoehe.leute.length > 3 && hoehe.leute.every((h) => h === 48), `Figuren 32×48 (ich ${hoehe.ich}, ${hoehe.leute.length} Leute: ${[...new Set(hoehe.leute)].join(', ')})`);
  });

  // --- Inselwald: Deko und Wind ---
  await mitServer(0.5, [['Quin', 'wald', 9, 10]], async (p) => {
    const s = await zustand(p);
    pruefe(s.deko > 200, `Deko auf den Wiesen: ${s.deko} Teile`);
    const winkel = () => p.evaluate(() => window.__spiel.szene.baeume.map((b) => b.bild.angle));
    const a = await winkel();
    await warte(600);
    const b = await winkel();
    const bewegt = a.filter((w, i) => Math.abs(w - b[i]) > 0.01).length;
    pruefe(a.length > 10 && bewegt > a.length / 2, `Wind: ${bewegt} von ${a.length} Bäumen haben sich bewegt`);
  });

  // --- Höhle am Mittag dunkel, Rathaus um Mitternacht hell ---
  await mitServer(0.5, [['Rena', 'hoehle', 11, 9]], async (p) => {
    const s = await zustand(p);
    pruefe(s.gebiet === 'hoehle' && s.licht.art === 'dunkel' && s.licht.dunkelheit > 0.5, `Höhle am Mittag dunkel (${s.licht.dunkelheit.toFixed(2)})`);
  });
  // Drinnen ist es um Mitternacht so hell wie am Mittag (dieselbe Stelle).
  let mittag = 0;
  await mitServer(0.5, [['Sami', 'rathaus', 7, 6]], async (p) => (mittag = await helligkeit(p, 4, 6, 2, 1)));
  await mitServer(0.0, [['Sami', 'rathaus', 7, 6]], async (p) => {
    const s = await zustand(p);
    const nacht = await helligkeit(p, 4, 6, 2, 1);
    pruefe(s.gebiet === 'rathaus' && s.licht.art === 'innen' && nacht > mittag * 0.85, `Rathaus um Mitternacht fast so hell wie mittags (${nacht.toFixed(0)} / ${mittag.toFixed(0)})`);
  });
} finally {
  await browser.close();
}

console.log(`\n${z.pruefungen} Prüfungen, ${z.server} Server, ${Math.round(z.bildpunkte)} Bildpunkte gemessen.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
