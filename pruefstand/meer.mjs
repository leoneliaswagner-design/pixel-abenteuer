// Segeln im Browser: vom Steg ins Boot, Boot und Dunst am Bildpunkt, Schwung
// (das Boot gleitet nach), Kompass mit Kurs, Weltkarte ohne eigenen Punkt,
// und zurück an den Steg.
//
//   node pruefstand/meer.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/meer.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anmelden } from './anmelden.mjs';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3495;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

// Kim steht am Ende des mittleren Stegs (Ankunft „vom_meer").
const riftside = JSON.parse(readFileSync(join(wurzel, 'inhalte/karten/riftside.json'), 'utf8'));
const steg = riftside.layers[2].objects.find((o) => o.name === 'ankunft' && o.properties.some((p) => p.value === 'vom_meer'));
const ort = { gebiet: 'riftside', x: steg.x, y: steg.y + 8 };
const datei = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
writeFileSync(datei, JSON.stringify({ version: 1, welt: {}, spieler: { kim: { name: 'Kim', farbe: 'blau', klasse: 'waldlaeufer', spezies: 'mensch', richtung: 'unten', ...ort, leben: 8, ankunft: ort, inventar: {} } } }));
const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(PORT), SPIELSTAND: datei, TAGESZEIT: '0.5' } });
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
const z = { pruefungen: 0, blicke: 0, bildpunkte: 0 };
const pruefe = (bed, text) => {
  z.pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Bildpunkte am Schirm (Bildschirmkoordinaten): Anzahl in Farbe bzw. Helligkeit.
async function messen(p, clip, farbe = null, tol = 20) {
  const bild = await p.screenshot({ clip });
  z.bildpunkte += clip.width * clip.height;
  return p.evaluate(async ([daten, farbe, tol]) => {
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
    const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
    c.drawImage(b, 0, 0);
    const d = c.getImageData(0, 0, b.width, b.height).data;
    let n = 0, hell = 0;
    for (let i = 0; i < d.length; i += 4) {
      hell += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      if (farbe && Math.abs(d[i] - farbe[0]) <= tol && Math.abs(d[i + 1] - farbe[1]) <= tol && Math.abs(d[i + 2] - farbe[2]) <= tol) n++;
    }
    return { n, hell: hell / (d.length / 4) };
  }, [bild.toString('base64'), farbe, tol]);
}

const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => fehler.push(`Seitenfehler ${e.message}`));
  await p.goto(`http://localhost:${PORT}/`);
  await anmelden(p, 'Kim');
  await warte(500);
  const zustand = () => p.evaluate(() => window.__spiel.zustand());
  // Der Kompass (Pergament unten links) gehört nur aufs Meer.
  const kompassFeld = { x: 20, y: 400, width: 120, height: 130 };
  const kompassLand = await messen(p, kompassFeld, [244, 228, 192], 12);

  // --- Vom Steg nach unten: ins Boot ---
  await p.keyboard.down('ArrowDown');
  for (let i = 0; i < 80 && (await zustand()).gebiet !== 'meer'; i++) await warte(50);
  await p.keyboard.up('ArrowDown');
  await warte(700);
  let s = await zustand();
  const anleger = { x: s.ich.x, y: s.ich.y }; // die Ankunft liegt vor der Anlegestelle
  pruefe(s.gebiet === 'meer' && s.meer && s.imBoot && s.dunst, `vom Steg aufs Meer: im Boot, mit Dunst (${s.gebiet})`);
  const kompassMeer = await messen(p, kompassFeld, [244, 228, 192], 12);
  pruefe(kompassLand.n === 0 && kompassMeer.n > 200, `Kompass nur auf See (an Land ${kompassLand.n}, auf See ${kompassMeer.n} Bildpunkte)`);
  // Das Boot (Holz) um die eigene Figur, der Dunst am Rand heller als das Wasser innen.
  const boot = await messen(p, { x: 430, y: 200, width: 100, height: 120 }, [168, 116, 63], 22);
  const rand = await messen(p, { x: 0, y: 0, width: 60, height: 60 }), innen = await messen(p, { x: 560, y: 300, width: 60, height: 60 });
  pruefe(boot.n > 40, `das Boot ist zu sehen (${boot.n} Bildpunkte Holz)`);
  pruefe(rand.hell > innen.hell + 40, `Dunst: am Rand hell (${rand.hell.toFixed(0)}), innen Wasser (${innen.hell.toFixed(0)})`);

  // --- Schwung: nach Westen rudern, loslassen, das Boot gleitet weiter ---
  await p.keyboard.down('ArrowLeft');
  await warte(1400);
  s = await zustand();
  const kursText = await p.evaluate(() => window.__phaser.scene.getScene('oberflaeche').kompassText.text);
  pruefe(s.fahrt > 100 && kursText === 'Kurs W', `volle Fahrt nach Westen (${s.fahrt.toFixed(0)} px/s, Kompass „${kursText}")`);
  await p.keyboard.up('ArrowLeft');
  const x0 = s.ich.x;
  await warte(400);
  s = await zustand();
  pruefe(s.fahrt > 20 && s.ich.x < x0 - 10, `losgelassen: das Boot gleitet weiter (${s.fahrt.toFixed(0)} px/s, ${(x0 - s.ich.x).toFixed(0)} px)`);
  for (let i = 0; i < 80 && s.fahrt > 0; i++, z.blicke++) {
    await warte(50);
    s = await zustand();
  }
  pruefe(s.fahrt === 0, 'und kommt zur Ruhe');

  // --- Weltkarte auf See: kein eigener Punkt ---
  await p.keyboard.press('m');
  await p.waitForFunction(() => window.__spiel.zustand().fenster === 'weltkarte', null, { timeout: 3000 }).catch(() => {});
  const karte = await p.evaluate(() => ({ ich: document.querySelectorAll('#fenster .marke.ich').length, legende: document.querySelector('#fenster .legende')?.textContent ?? '' }));
  pruefe(karte.ich === 0 && karte.legende.includes('auf See'), `Weltkarte auf See: kein eigener Punkt, „${karte.legende.trim()}"`);
  await p.keyboard.press('m');
  await warte(300);

  // --- Zurück in den Anleger: steuern wie ein Spieler — erst quer auf die
  // Anlegestelle zu (mit Schwung, also früh gegensteuern), dann hinein. ---
  const ziel = anleger.x;
  const gedrueckt = new Set();
  const halte = async (tasten) => {
    for (const t of gedrueckt) if (!tasten.includes(t)) await p.keyboard.up(t), gedrueckt.delete(t);
    for (const t of tasten) if (!gedrueckt.has(t)) await p.keyboard.down(t), gedrueckt.add(t);
  };
  for (let i = 0; i < 300 && (await zustand()).gebiet === 'meer'; i++) {
    const t = await zustand();
    const abweichung = ziel - t.ich.x;
    await halte(Math.abs(abweichung) > 10 ? [abweichung > 0 ? 'ArrowRight' : 'ArrowLeft'] : ['ArrowUp']);
    z.blicke++;
    await warte(40);
  }
  await halte([]);
  await warte(600);
  s = await zustand();
  pruefe(s.gebiet === 'riftside' && !s.imBoot, `angelegt: wieder in Riftside, zu Fuß (${s.gebiet}, Kachel ${Math.floor(s.ich.x / 32)},${Math.floor(s.ich.y / 32)})`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${z.pruefungen} Prüfungen, ${z.blicke} Blicke, ${Math.round(z.bildpunkte)} Bildpunkte gemessen.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
