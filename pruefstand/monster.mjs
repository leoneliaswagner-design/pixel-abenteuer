// Die Monster aus monster.json im Browser: alle Bilder geladen und bewegt,
// der Goblin schießt und trifft, der Wolf duckt sich sichtbar vor dem Sprung.
//
//   node pruefstand/monster.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/monster.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anmelden } from './anmelden.mjs';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3465;
const monster = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/monster.json'), 'utf8'));
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

// Ida steht drei Kacheln über dem zweiten Goblin (Kachel 4,14), Wolfgang
// drei Kacheln links vom zweiten Wolf (Kachel 25,16).
const ort = (x, y) => ({ gebiet: 'tiefwald', x: x * 32 + 16, y: y * 32 + 24 });
const spieler = (name, farbe, o) => ({ name, farbe, klasse: 'kaempfer', spezies: 'zwerg', richtung: 'unten', ...o, leben: 9, ankunft: o, inventar: {} });
const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
writeFileSync(spielstand, JSON.stringify({ version: 1, welt: {}, spieler: { ida: spieler('Ida', 'gruen', ort(4, 11)), wolfgang: spieler('Wolfgang', 'rot', ort(22, 16)) } }));

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
const z = { pruefungen: 0, monster: 0, blicke: 0, bildpunkte: 0 };
const pruefe = (bed, text) => {
  z.pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const zustand = (p) => p.evaluate(() => window.__spiel.zustand());

// Bildpunkte einer Farbe in einem Weltausschnitt, aus dem Bildschirmfoto.
async function farbeZaehlen(p, wx, wy, w, h, [r0, g0, b0], toleranz = 16) {
  const r = await p.evaluate(([wx, wy]) => {
    const s = window.__spiel.szene, v = s.cameras.main.worldView, c = s.game.canvas.getBoundingClientRect();
    const f = c.width / s.scale.width;
    return { x: c.x + (wx - v.x) * f, y: c.y + (wy - v.y) * f, f };
  }, [wx, wy]);
  const bild = await p.screenshot({ clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: w * r.f, height: h * r.f } });
  z.bildpunkte += w * r.f * h * r.f;
  return p.evaluate(async ([daten, farbe, tol]) => {
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
    const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
    c.drawImage(b, 0, 0);
    const d = c.getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - farbe[0]) <= tol && Math.abs(d[i + 1] - farbe[1]) <= tol && Math.abs(d[i + 2] - farbe[2]) <= tol) n++;
    return n;
  }, [bild.toString('base64'), [r0, g0, b0], toleranz]);
}

const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  const ida = await browser.newPage({ viewport: { width: 960, height: 540 } });
  ida.on('pageerror', (e) => fehler.push(`Ida: Seitenfehler ${e.message}`));
  await ida.goto(`http://localhost:${PORT}/`);
  await anmelden(ida, 'Ida');
  await warte(600);

  // --- Alle Monster mit ihrem eigenen Bild ---
  let s = await zustand(ida);
  z.monster = s.gegner.length;
  const arten = [...new Set(s.gegner.map((g) => g.art))];
  const falsch = s.gegner.filter((g) => g.textur !== g.art || g.bilder < 2);
  pruefe(s.gebiet === 'tiefwald' && arten.length === 5 && Object.keys(monster).filter((a) => a !== 'schleim').every((a) => arten.includes(a)),
    `${z.monster} Monster im tiefen Wald, ${arten.length} Arten: ${arten.join(', ')}`);
  pruefe(falsch.length === 0, `jedes Monster hat sein Bild (falsch: ${falsch.map((g) => `${g.art}→${g.textur}`).join(', ') || 'keins'})`);
  pruefe(s.gegner.find((g) => g.art === 'wolf')?.bilder === 3, 'der Wolf hat drei Bilder (das dritte: geduckt)');

  // Bewegt sich das Bild? Zwei Blicke, irgendein Monster hat das Bild gewechselt.
  const vorher = Object.fromEntries(s.gegner.map((g) => [g.id, g.bild]));
  await warte(350);
  s = await zustand(ida);
  pruefe(s.gegner.some((g) => g.bild !== vorher[g.id]), 'die Monster laufen (Bildwechsel)');

  // Gespiegelt wird, wer nach rechts schaut — über einige Blicke, bis
  // beide Richtungen vorkamen.
  let rechts = 0, links = 0, verkehrt = 0;
  for (let i = 0; i < 40 && !(rechts && links); i++) {
    for (const g of (await zustand(ida)).gegner.filter((g) => g.sichtbar && g.blick)) {
      if (g.gespiegelt !== (g.blick === 'rechts')) verkehrt++;
      g.blick === 'rechts' ? rechts++ : links++;
    }
    z.blicke++;
    await warte(50);
  }
  pruefe(rechts > 0 && links > 0 && verkehrt === 0, `nach rechts gespiegelt, nach links nicht (${rechts}× rechts, ${links}× links, ${verkehrt} verkehrt)`);
  s = await zustand(ida);

  // Der Goblin auf Idas Schirm: grüne Haut am Bildpunkt.
  const goblin = s.gegner.filter((g) => g.art === 'goblin').sort((a, b) => Math.hypot(a.x - s.ich.x, a.y - s.ich.y) - Math.hypot(b.x - s.ich.x, b.y - s.ich.y))[0];
  const gruen = await farbeZaehlen(ida, goblin.x - 16, goblin.y - 32, 32, 34, [124, 174, 74]);
  pruefe(gruen > 30, `Goblin-Haut auf Idas Schirm (${gruen} Bildpunkte)`);

  // --- Der Goblin schießt: Ida sieht den Pfeil und verliert Leben ---
  const leben0 = s.ich.leben;
  let pfeil = null;
  for (let i = 0; i < 160 && !(pfeil && s.ich.leben < leben0); i++) {
    await warte(50);
    s = await zustand(ida);
    z.blicke++;
    pfeil ??= s.geschosse.find((g) => g.art === 'pfeil');
  }
  // Der Goblin steht unter Ida: der Pfeil fliegt nach oben, also −90°.
  pruefe(!!pfeil && Math.abs(pfeil.winkel + 90) < 15, `Ida sieht einen Pfeil nach oben fliegen (Winkel ${pfeil?.winkel?.toFixed(0)}°)`);
  pruefe(s.ich.leben < leben0, `Ida wird getroffen: ${leben0} → ${s.ich.leben}`);

  // --- Der Wolf duckt sich bei Wolfgang, bevor er springt ---
  const wo = await browser.newPage({ viewport: { width: 960, height: 540 } });
  wo.on('pageerror', (e) => fehler.push(`Wolfgang: Seitenfehler ${e.message}`));
  await wo.goto(`http://localhost:${PORT}/`);
  await anmelden(wo, 'Wolfgang');
  let geduckt = null;
  for (let i = 0; i < 120 && !geduckt; i++) {
    await warte(40);
    const w = await zustand(wo);
    z.blicke++;
    geduckt = w.gegner.find((g) => g.art === 'wolf' && g.duckt && g.bild === 2);
  }
  pruefe(!!geduckt, 'Wolfgang sieht den Wolf geduckt (drittes Bild) vor dem Sprung');
  await wo.screenshot({ path: `${wurzel}pruefstand/bilder/wolf.png` });
  await ida.screenshot({ path: `${wurzel}pruefstand/bilder/goblin.png` });
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${z.pruefungen} Prüfungen, ${z.monster} Monster, ${z.blicke} Blicke, ${z.bildpunkte.toFixed(0)} Bildpunkte gezählt.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
