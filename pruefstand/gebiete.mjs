// Gebietswechsel und Spielstand mit echten Browsern:
//   Anna steht (laut Spielstand) in der Ruine über der Treppe, Ben ist neu.
//   Anna geht hinunter in die Höhle — Ben bleibt oben und sieht sie nicht mehr.
//   Dann wird der Server neu gestartet: Anna kommt zurück und steht in der Höhle.
//
//   node pruefstand/gebiete.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/gebiete.mjs
//
// Gemessen wird auch der Bildpunkt: die Höhle ist dunkel, die Wiese hell.
// Ohne das wäre grün, wenn der Browser zwar „hoehle" glaubt, aber noch die
// Oberwelt zeigt.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3461;
const bilder = join(wurzel, 'pruefstand', 'bilder');
mkdirSync(bilder, { recursive: true });
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const ruine = { gebiet: 'wald', x: 34 * 32 + 16, y: 26 * 32 + 24 };
writeFileSync(spielstand, JSON.stringify({
  version: 1, welt: {},
  spieler: {
    anna: { name: 'Anna', farbe: 'gruen', richtung: 'unten', ...ruine, leben: 5, ankunft: ruine },
    // Ben steht im Wald (neue Spieler beginnen in Riftside — hier soll er
    // aber im selben Gebiet wie Anna anfangen und dort bleiben).
    ben: { name: 'Ben', farbe: 'rot', richtung: 'unten', gebiet: 'wald', x: 8 * 32 + 16, y: 13 * 32 + 24, leben: 6, ankunft: { gebiet: 'wald', x: 8 * 32 + 16, y: 13 * 32 + 24 } },
  },
}));

async function serverStarten() {
  const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(PORT), SPIELSTAND: spielstand } });
  let log = '';
  await new Promise((gut, schlecht) => {
    const t = setTimeout(() => schlecht(new Error('Server startet nicht:\n' + log)), 8000);
    const lesen = (d) => {
      log += d;
      if (log.includes(`:${PORT}`)) {
        clearTimeout(t);
        gut();
      }
    };
    server.stdout.on('data', lesen);
    server.stderr.on('data', lesen);
  });
  return server;
}

const fehler = [];
const zaehler = { pruefungen: 0, gegnerGeprueft: 0 };
const pruefe = (bed, text) => {
  zaehler.pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Ohne Drosselung: alle Seiten laufen in einem Fenster, und Chromium zeichnet
// Tabs im Hintergrund nur noch selten. Anna kam dann nach Bens Beitritt in
// 1,8 s nicht mehr bis zum Busch — das Spiel war in Ordnung, der Tab schlief.
const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
let server = await serverStarten();
try {
  const oeffnen = async (name) => {
    const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
    p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
    await p.goto(`http://localhost:${PORT}/`);
    await p.fill('#name', name);
    await p.click('button[type=submit]');
    await p.waitForFunction(() => window.__spiel?.zustand, null, { timeout: 10000 });
    await warte(400);
    return p;
  };
  const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
  // Mittlere Helligkeit des Spielbilds, aus Phasers eigenem Schnappschuss —
  // der WebGL-Puffer selbst ist nach dem Zeichnen leer.
  const helligkeit = (p) => p.evaluate(() => new Promise((gut) => {
    window.__spiel.szene.game.renderer.snapshot((bild) => {
      const c = document.createElement('canvas');
      c.width = bild.width;
      c.height = bild.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bild, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let summe = 0;
      for (let i = 0; i < d.length; i += 4) summe += (d[i] + d[i + 1] + d[i + 2]) / 3;
      gut(summe / (d.length / 4));
    });
  }));

  let anna = await oeffnen('Anna');
  const ben = await oeffnen('Ben');
  let za = await zustand(anna), zb = await zustand(ben);
  pruefe(za.gebiet === 'wald' && Math.abs(za.ich.x - ruine.x) < 1 && Math.abs(za.ich.y - ruine.y) < 1,
    `Anna beginnt dort, wo ihr Spielstand sie hingestellt hat (${za.ich.x}, ${za.ich.y})`);
  pruefe(za.ich.leben === 5, `…mit den gespeicherten 5 Leben (${za.ich.leben})`);

  // --- Anna geht die Treppe hinunter ---
  await anna.keyboard.down('ArrowDown');
  for (let t = 0; t < 4000; t += 100) {
    await warte(100);
    if ((await zustand(anna).catch(() => ({}))).gebiet === 'hoehle') break;
  }
  await anna.keyboard.up('ArrowDown');
  await warte(800);
  za = await zustand(anna);
  zb = await zustand(ben);
  pruefe(za.gebiet === 'hoehle', `Anna ist in der Höhle (${za.gebiet})`);
  pruefe(za.gegner.length === 5 && za.gegner.every((g) => g.id.startsWith('hoehle-')), `Anna sieht die 5 Höhlen-Schleime (${za.gegner.length})`);
  pruefe(zb.gebiet === 'wald' && zb.andere.length === 0, `Ben ist oben geblieben und sieht Anna nicht mehr (${zb.andere.length} andere)`);
  pruefe(zb.gegner.every((g) => g.id.startsWith('wald-')), 'Ben sieht weiter nur die Oberwelt-Schleime');
  zaehler.gegnerGeprueft = za.gegner.length + zb.gegner.length;

  const hellA = await helligkeit(anna), hellB = await helligkeit(ben);
  pruefe(hellA < 100, `Annas Bild ist dunkel wie die Höhle (Helligkeit ${hellA.toFixed(0)})`);
  pruefe(hellB > 110, `Gegenstück: Bens Bild ist hell wie die Wiese (Helligkeit ${hellB.toFixed(0)})`);

  // Die Oberfläche lief über den Wechsel weiter: Herzen nicht doppelt, Zuhörer nicht doppelt.
  const ober = await anna.evaluate(() => {
    const s = window.__spiel.szene;
    return { herzen: s.scene.get('oberflaeche').herzen.length, zuhoerer: s.events.listenerCount('stand') };
  });
  pruefe(ober.herzen === 3 && ober.zuhoerer === 1, `Oberfläche nach dem Wechsel: ${ober.herzen} Herzen, ${ober.zuhoerer} Zuhörer`);

  // Laufen in der Höhle: der Server darf nicht mehr nach Oberwelt-Wänden korrigieren.
  const vorLauf = za.ich;
  await anna.keyboard.down('ArrowLeft');
  await warte(700);
  await anna.keyboard.up('ArrowLeft');
  await warte(500);
  za = await zustand(anna);
  pruefe(vorLauf.x - za.ich.x > 20 && za.gebiet === 'hoehle', `Anna läuft in der Höhle (${vorLauf.x.toFixed(0)} → ${za.ich.x.toFixed(0)})`);
  await anna.screenshot({ path: join(bilder, 'hoehle.png') });

  // --- Server neu starten: Anna kommt zurück in die Höhle ---
  const stelle = za.ich;
  await anna.close();
  await warte(300);
  server.kill('SIGINT');
  await new Promise((r) => server.once('exit', r));
  server = await serverStarten();
  anna = await oeffnen('Anna');
  za = await zustand(anna);
  pruefe(za.gebiet === 'hoehle' && Math.hypot(za.ich.x - stelle.x, za.ich.y - stelle.y) < 2,
    `nach dem Neustart: Anna wieder in der Höhle, an derselben Stelle (${za.ich.x.toFixed(0)}, ${za.ich.y.toFixed(0)})`);
  pruefe((await helligkeit(anna)) < 100, 'und ihr Bild zeigt die Höhle');
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${zaehler.pruefungen} Prüfungen, ${zaehler.gegnerGeprueft} Gegner auf Gebiet geprüft.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
