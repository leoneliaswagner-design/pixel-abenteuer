// Der Krieger mit echten Browsern:
//   Kurt (Stufe 4, noch ohne Pfad) und Lea stehen in Riftside.
//   Kurt sieht den Hinweis „C: Pfad, +2", öffnet mit C das Charakterfenster,
//   wählt den Barbaren und setzt zwei Punkte auf Stärke. Unten links stehen
//   jetzt Q, F und R. Er startet den Kampfrausch (R): bei Lea ist seine
//   Figur am Bildpunkt rot. Das Fenster bricht bei 360 Punkten nicht über
//   den Rand.
//
//   node pruefstand/krieger.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/krieger.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3498;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });
const werte = JSON.parse(readFileSync(join(wurzel, 'inhalte/daten/werte.json'), 'utf8'));

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const stelle = (name, farbe, x, y, erfahrung) => {
  const ort = { gebiet: 'riftside', x, y };
  return { name, farbe, klasse: 'kaempfer', spezies: 'mensch', richtung: 'unten', ...ort, leben: 8, ankunft: ort, erfahrung };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1,
  welt: {},
  spieler: {
    // Stufe 4: Pfad offen (ab 3) und zwei Attributspunkte (auf 4).
    kurt: stelle('Kurt', 'blau', 21 * 32 + 16, 20 * 32 + 24, werte.stufen.erfahrung[3]),
    lea: stelle('Lea', 'gruen', 23 * 32 + 16, 20 * 32 + 24, 0),
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
let pruefungen = 0, bildpunkte = 0, knoepfe = 0;
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
  const oeffnen = async (name, breite = 960, hoehe = 540) => {
    const p = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
    await p.goto(`http://localhost:${PORT}/`);
    await anmelden(p, name);
    await warte(700);
    return p;
  };
  const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
  // Rote Bildpunkte um eine Figur (Weltkoordinaten), aus dem Bildschirmfoto.
  const rotUm = async (p, wx, wy) => {
    const r = await p.evaluate(([wx, wy]) => {
      const s = window.__spiel.szene, v = s.cameras.main.worldView, c = s.game.canvas.getBoundingClientRect();
      const f = c.width / s.scale.width;
      return { x: c.x + (wx - 16 - v.x) * f, y: c.y + (wy - 48 - v.y) * f, f };
    }, [wx, wy]);
    const png = await p.screenshot({ clip: { x: r.x, y: r.y, width: 32 * r.f, height: 50 * r.f } });
    bildpunkte += 32 * 50 * r.f * r.f;
    return p.evaluate(async (daten) => {
      const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
      const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
      c.drawImage(b, 0, 0);
      const d = c.getImageData(0, 0, b.width, b.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] > d[i + 1] * 1.8 && d[i] > d[i + 2] * 1.8) n++;
      return n;
    }, png.toString('base64'));
  };

  const lea = await oeffnen('Lea');
  const kurt = await oeffnen('Kurt');
  let zk = await zustand(kurt);
  pruefe(zk.ich.stufe === 4 && zk.ich.offen?.pfad && zk.ich.offen?.punkte === 2, `Kurt: Stufe ${zk.ich.stufe}, Pfad offen, ${zk.ich.offen?.punkte} Punkte`);
  pruefe(zk.stufenAnzeige.wahl === 'C: Pfad, +2', `Hinweis oben: „${zk.stufenAnzeige.wahl}"`);
  pruefe(zk.stufenAnzeige.zeilen.join('|') === 'Q Schildstoß|F Kriegsdisziplin', `unten links: ${zk.stufenAnzeige.zeilen.join(', ')}`);

  // --- Charakterfenster: Pfad wählen ---
  await kurt.keyboard.press('c');
  await warte(200);
  const pfadKnoepfe = await kurt.$$eval('#fenster [data-tun="pfad"]', (l) => l.map((b) => b.textContent));
  knoepfe += pfadKnoepfe.length;
  pruefe((await zustand(kurt)).fenster === 'charakter' && pfadKnoepfe.length === 3, `C öffnet das Charakterfenster mit ${pfadKnoepfe.length} Wegen (${pfadKnoepfe.join(', ')})`);
  await kurt.click('#fenster [data-tun="pfad"][data-art="barbar"]');
  await warte(400);
  zk = await zustand(kurt);
  const nochPfade = await kurt.$$eval('#fenster [data-tun="pfad"]', (l) => l.length);
  const kann = await kurt.$eval('#fenster', (f) => f.textContent);
  pruefe(zk.ich.pfad === 'barbar' && !zk.ich.offen.pfad && nochPfade === 0 && kann.includes('Kampfrausch'), `Barbar gewählt: Wahl weg, „Kampfrausch" unter „Das kannst du"`);
  // --- Zwei Punkte auf Stärke ---
  const st0 = zk.ich.attribute.staerke;
  for (let i = 0; i < 2; i++) {
    await kurt.click('#fenster [data-tun="attribut"][data-art="staerke"]');
    await warte(300);
  }
  zk = await zustand(kurt);
  const plusNoch = await kurt.$$eval('#fenster [data-tun="attribut"]', (l) => l.length);
  pruefe(zk.ich.attribute.staerke === st0 + 2 && zk.ich.offen.punkte === 0 && plusNoch === 0, `Stärke ${st0} → ${zk.ich.attribute.staerke}, keine Punkte und keine +1-Knöpfe mehr`);
  await kurt.keyboard.press('Escape');
  await warte(250);
  zk = await zustand(kurt);
  pruefe(zk.stufenAnzeige.wahl === '' && zk.stufenAnzeige.zeilen.join('|') === 'Q Schildstoß|F Kriegsdisziplin|R Kampfrausch', `Hinweis weg, unten links: ${zk.stufenAnzeige.zeilen.join(', ')}`);

  // --- Kampfrausch: bei Lea wird Kurt rot ---
  const kurtBeiLea = async () => (await zustand(lea)).andere.find((a) => a.farbe === 'blau');
  let k = await kurtBeiLea();
  const rotVor = await rotUm(lea, k.x, k.y);
  await kurt.keyboard.press('r');
  await warte(400);
  k = await kurtBeiLea();
  const rotIm = await rotUm(lea, k.x, k.y);
  zk = await zustand(kurt);
  const r = zk.ich.aktionen.find((a) => a.taste === 'R');
  pruefe(k.effekt === 'r' && rotIm > rotVor + 100, `Kampfrausch bei Lea sichtbar: ${rotVor} → ${rotIm} rote Bildpunkte an Kurt`);
  pruefe(zk.ich.effekt === 'r' && r.bereitIn > 30000, `bei Kurt selbst: Rausch, R lädt noch ${(r.bereitIn / 1000).toFixed(0)} s`);
  await warte(9000);
  k = await kurtBeiLea();
  const rotNach = await rotUm(lea, k.x, k.y);
  pruefe(k.effekt === '' && rotNach < rotVor + 30, `nach 8 s vorbei: ${rotNach} rote Bildpunkte`);

  // --- Am Handy: das Fenster bricht nicht über den Rand ---
  const handy = await oeffnen('Kurt2', 360, 640);
  await handy.keyboard.press('c');
  await warte(200);
  const rand = await handy.evaluate(() => {
    const k = document.querySelector('#fenster .kasten');
    return { breit: k.scrollWidth, sichtbar: k.clientWidth, raus: [...k.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length, alle: k.querySelectorAll('*').length };
  });
  pruefe(rand.breit <= rand.sichtbar && rand.raus === 0, `bei 360 Punkten: ${rand.raus} von ${rand.alle} Elementen über den Rand`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${knoepfe} Wege-Knöpfe, ${bildpunkte} Bildpunkte angesehen.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
