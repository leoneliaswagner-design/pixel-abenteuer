// Zwei Browser, ein Server: sehen beide dasselbe?
//
//   node pruefstand/zwei-spieler.mjs        (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/zwei-spieler.mjs
//   UEBER_HTTPS=1 node pruefstand/zwei-spieler.mjs   (wie hinter dem Cloudflare-Tunnel)
//
// Gemessen wird, was im jeweils ANDEREN Browser ankommt — nicht, was der
// eigene glaubt. Am Ende steht, wie viel angesehen wurde; eine Prüfung, die
// aus Versehen leere Listen vergleicht, wäre sonst grün.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3457;
const bilder = `${wurzel}pruefstand/bilder/`;
mkdirSync(bilder, { recursive: true });

if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

// Eigener Wegwerf-Spielstand: der Prüfstand darf nie die echte Kampagne
// anfassen — und soll mit leerer Welt beginnen.
const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, ZUFALL: '0.99', PORT: String(PORT), SPIELSTAND: spielstand, STARTGEBIET: 'wald' } });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
await new Promise((gut, schlecht) => {
  const t = setTimeout(() => schlecht(new Error('Server startet nicht:\n' + serverLog)), 8000);
  server.stdout.on('data', () => serverLog.includes(`:${PORT}`) && (clearTimeout(t), gut()));
});

// Hinter einem https-Weiterleiter, so wie `npm run online` es mit Cloudflare macht.
const weiterleiter = process.env.UEBER_HTTPS
  ? await (await import('./https-weiterleiter.mjs')).starteWeiterleiter(PORT, PORT + 1)
  : null;
const adresse = weiterleiter?.url ?? `http://localhost:${PORT}/`;
console.log(`Spiel unter ${adresse}`);

const fehler = [];
const zaehler = { pruefungen: 0, spielerGesehen: 0, gegnerVerglichen: 0 };
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
try {
  const seiten = [];
  for (const name of ['Anna', 'Ben']) {
    const p = await browser.newPage({ viewport: { width: 960, height: 540 }, ignoreHTTPSErrors: true });
    p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
    await p.goto(adresse);
    await anmelden(p, name);
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
  // Laufen, bis die Figur steht — nicht eine feste Zeit. Chromium ohne
  // Grafikkarte schafft mal 60, mal 8 Bilder pro Sekunde; mit fester Zeit
  // kam Anna hinter dem https-Weiterleiter nicht ganz bis zum Busch.
  const laufeBisAnschlag = async (p, taste, hoechstens = 5000) => {
    await p.keyboard.down(taste);
    // Zweimal hintereinander still: ein einzelner Ruckler von 250 ms sah
    // sonst schon wie „steht" aus, und Anna blieb 2 px vor dem Busch stehen.
    let letztes = null, still = 0;
    for (let t = 0; t < hoechstens && still < 2; t += 250) {
      await warte(250);
      const { x, y } = (await zustand(p)).ich;
      still = letztes && Math.hypot(x - letztes.x, y - letztes.y) < 0.01 ? still + 1 : 0;
      letztes = { x, y };
    }
    await p.keyboard.up(taste);
  };
  const vorher = za.ich;
  // Mitschreiben, was unterwegs passiert — wenn Anna zu kurz kommt, soll
  // die Meldung sagen, warum (Treffer? Korrektur? zu wenige Bilder?).
  await a.evaluate(() => {
    window.__unterwegs = { bilder: 0, meldungen: [] };
    const s = window.__spiel.szene;
    s.events.on('postupdate', () => window.__unterwegs.bilder++);
    for (const t of ['korrektur', 'getroffen']) s.netz.bei(t, (m) => window.__unterwegs.meldungen.push(m.t));
  });
  const startZeit = Date.now();
  await laufeBisAnschlag(a, 'ArrowDown');
  await warte(400);
  za = await zustand(a);
  zb = await zustand(b);
  const annaBeiBen = zb.andere.find((o) => o.id === za.ich.id);
  pruefe(za.ich.y - vorher.y > 50, `Anna ist gelaufen (${vorher.y.toFixed(0)} → ${za.ich.y.toFixed(0)})`);
  const unterwegs = await a.evaluate(() => window.__unterwegs);
  const bps = (unterwegs.bilder / ((Date.now() - startZeit) / 1000)).toFixed(0);
  pruefe(Math.abs(za.ich.y - 512) < 0.1,
    `Anna steht am Busch an (y = ${za.ich.y.toFixed(1)}, erwartet 512; ${bps} Bilder/s, Meldungen: ${unterwegs.meldungen.join(', ') || 'keine'})`);
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
  for (let t = 0; t < 3000 && (await zustand(a)).ich.y <= 530; t += 100) await warte(100);
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

  if (weiterleiter) {
    const z = weiterleiter.zaehler;
    pruefe(z.websockets === 2, `beide Verbindungen liefen als wss:// durch den Weiterleiter (${z.websockets} WebSockets, ${z.anfragen} Dateien)`);
  }

  await a.screenshot({ path: bilder + 'anna.png' });
  await b.screenshot({ path: bilder + 'ben.png' });
} finally {
  await browser.close();
  weiterleiter?.schliessen();
  server.kill();
}

console.log(`\n${zaehler.pruefungen} Prüfungen, ${zaehler.spielerGesehen} fremde Figuren gesehen, ${zaehler.gegnerVerglichen} Gegner verglichen.`);
console.log(`Bilder: ${bilder}anna.png, ben.png`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
