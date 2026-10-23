// Zwei Browser, ein Server: sehen beide dasselbe?
//
//   node pruefstand/zwei-spieler.mjs        (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/zwei-spieler.mjs
//
// Gemessen wird, was im jeweils ANDEREN Browser ankommt — nicht, was der
// eigene glaubt. Am Ende steht, wie viel angesehen wurde; eine Prüfung, die
// aus Versehen leere Listen vergleicht, wäre sonst grün.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const wurzel = new URL('..', import.meta.url).pathname;
const PORT = 3457;
const bilder = `${wurzel}pruefstand/bilder/`;
mkdirSync(bilder, { recursive: true });

if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(PORT) } });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
await new Promise((gut, schlecht) => {
  const t = setTimeout(() => schlecht(new Error('Server startet nicht:\n' + serverLog)), 8000);
  server.stdout.on('data', () => serverLog.includes(`:${PORT}`) && (clearTimeout(t), gut()));
});

const fehler = [];
const zaehler = { pruefungen: 0, spielerGesehen: 0, gegnerVerglichen: 0 };
const pruefe = (bed, text) => {
  zaehler.pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
try {
  const seiten = [];
  for (const name of ['Anna', 'Ben']) {
    const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
    p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
    await p.goto(`http://localhost:${PORT}/`);
    await p.fill('#name', name);
    await p.click('button[type=submit]');
    await p.waitForFunction(() => window.__spiel?.zustand, null, { timeout: 10000 });
    seiten.push(p);
  }
  const [a, b] = seiten;
  const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
  await warte(400);

  // --- Beide sehen einander ---
  let za = await zustand(a), zb = await zustand(b);
  zaehler.spielerGesehen = za.andere.length + zb.andere.length;
  pruefe(za.andere.length === 1 && zb.andere.length === 1, `jeder sieht genau einen anderen (Anna: ${za.andere.length}, Ben: ${zb.andere.length})`);
  pruefe(za.andere[0]?.farbe !== undefined && za.andere[0]?.farbe !== zb.andere[0]?.farbe, `verschiedene Farben (${zb.andere[0]?.farbe} / ${za.andere[0]?.farbe})`);

  // --- Anna läuft nach unten bis an den Busch; Ben sieht sie dort ---
  const vorher = za.ich;
  await a.keyboard.down('ArrowDown');
  await warte(1300);
  await a.keyboard.up('ArrowDown');
  await warte(400);
  za = await zustand(a);
  zb = await zustand(b);
  const annaBeiBen = zb.andere.find((o) => o.id === za.ich.id);
  pruefe(za.ich.y - vorher.y > 50, `Anna ist gelaufen (${vorher.y.toFixed(0)} → ${za.ich.y.toFixed(0)})`);
  pruefe(Math.abs(za.ich.y - 512) < 1, `Anna steht am Busch an (y = ${za.ich.y.toFixed(1)}, erwartet 512)`);
  pruefe(annaBeiBen && Math.hypot(annaBeiBen.x - za.ich.x, annaBeiBen.y - za.ich.y) < 3,
    `Ben sieht Anna an derselben Stelle (Abstand ${annaBeiBen ? Math.hypot(annaBeiBen.x - za.ich.x, annaBeiBen.y - za.ich.y).toFixed(1) : '—'} px)`);

  // --- Schwerthieb schneidet den Busch, Ben erfährt es, der Bildpunkt ändert sich ---
  const BUSCH = 16 * 40 + 8;
  const ausschnitt = async (p, wx, wy, w, h) => {
    const r = await p.evaluate(([wx, wy]) => {
      const s = window.__spiel.szene, v = s.cameras.main.worldView, c = s.game.canvas.getBoundingClientRect();
      const f = c.width / s.scale.width;
      return { x: c.x + (wx - v.x) * f, y: c.y + (wy - v.y) * f, f };
    }, [wx, wy]);
    return p.screenshot({ clip: { x: r.x, y: r.y, width: w * r.f, height: h * r.f } });
  };
  const buschVorher = await ausschnitt(a, 8 * 32 + 4, 16 * 32 + 10, 24, 20);
  const grasVorher = await ausschnitt(a, 6 * 32 + 4, 16 * 32 + 10, 24, 20);
  pruefe(!zb.geschnitten.includes(BUSCH), 'Busch steht vor dem Hieb');
  await a.keyboard.press('Space');
  await warte(900);
  zb = await zustand(b);
  za = await zustand(a);
  pruefe(zb.geschnitten.includes(BUSCH), 'Ben weiß, dass der Busch geschnitten ist');
  const buschNachher = await ausschnitt(a, 8 * 32 + 4, 16 * 32 + 10, 24, 20);
  const grasNachher = await ausschnitt(a, 6 * 32 + 4, 16 * 32 + 10, 24, 20);
  pruefe(!buschVorher.equals(buschNachher), 'auf Annas Schirm ist der Busch weg (Bildpunkte geändert)');
  pruefe(grasVorher.equals(grasNachher), 'Gegenstück: das Gras daneben ist unverändert');

  // --- Anna kann jetzt durch, wo der Busch war ---
  await a.keyboard.down('ArrowDown');
  await warte(500);
  await a.keyboard.up('ArrowDown');
  za = await zustand(a);
  pruefe(za.ich.y > 530, `Anna läuft durch die Lücke (y = ${za.ich.y.toFixed(0)})`);

  // --- Gegner stehen in beiden Browsern an derselben Stelle ---
  await warte(300);
  za = await zustand(a);
  zb = await zustand(b);
  let groessterAbstand = 0;
  for (const g of za.gegner) {
    const h = zb.gegner.find((x) => x.id === g.id);
    if (!h || !g.sichtbar) continue;
    zaehler.gegnerVerglichen++;
    groessterAbstand = Math.max(groessterAbstand, Math.hypot(g.x - h.x, g.y - h.y));
  }
  pruefe(zaehler.gegnerVerglichen >= 5, `${zaehler.gegnerVerglichen} Gegner in beiden Browsern gefunden`);
  pruefe(groessterAbstand < 12, `Gegner liegen höchstens ${groessterAbstand.toFixed(1)} px auseinander`);

  // --- Wer sich 200 px weit versetzt, wird zurückgeholt ---
  // Das Ziel ist freies Gras: hier soll das Tempo-Guthaben greifen, nicht
  // die Wand. (Ins Wasser zu springen hätte beides zugleich geprüft — und
  // die Gegenprobe ohne Tempo-Prüfung blieb grün.)
  const vorSprung = (await zustand(b)).ich;
  await b.evaluate(() => {
    const s = window.__spiel.szene;
    s.ich.x = 30 * 32 + 16;
    s.ich.y = 12 * 32 + 24;
  });
  await warte(600);
  const nachSprung = (await zustand(b)).ich;
  pruefe(Math.hypot(nachSprung.x - vorSprung.x, nachSprung.y - vorSprung.y) < 2,
    `Sprung über 600 px wird vom Server zurückgesetzt (zurück bei ${nachSprung.x.toFixed(0)},${nachSprung.y.toFixed(0)})`);

  await a.screenshot({ path: bilder + 'anna.png' });
  await b.screenshot({ path: bilder + 'ben.png' });
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${zaehler.pruefungen} Prüfungen, ${zaehler.spielerGesehen} fremde Figuren gesehen, ${zaehler.gegnerVerglichen} Gegner verglichen.`);
console.log(`Bilder: ${bilder}anna.png, ben.png`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
