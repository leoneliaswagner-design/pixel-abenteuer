// Startet den Spielserver: WebSocket unter /ws, und — wenn `npm run build`
// gelaufen ist — liefert er auch das fertige Spiel aus dist/ aus. Dann reicht
// ein einziger Port, um mit Freunden zu spielen.
import { createServer } from 'node:http';
import { readFileSync, existsSync, createReadStream, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { Spiel } from './spiel.js';
import { Spielstand } from './spielstand.js';
import { fileURLToPath } from 'node:url';

// fileURLToPath statt .pathname: unter Windows ergibt .pathname „/C:/…“,
// und der Server fand seine eigenen Dateien nicht.
const wurzel = fileURLToPath(new URL('..', import.meta.url));
const lies = (p) => JSON.parse(readFileSync(join(wurzel, p), 'utf8'));
const PORT = Number(process.env.PORT) || 3001;
const TAKT = 50;

const werte = lies('inhalte/daten/werte.json');
werte.klassen = lies('inhalte/daten/klassen.json');
werte.spezies = lies('inhalte/daten/spezies.json');
// Für Prüfstände und zum Ausprobieren: in einem anderen Gebiet beginnen
// (z. B. STARTGEBIET=wald, wo es Schleime und Büsche gibt).
if (process.env.STARTGEBIET) werte.startGebiet = process.env.STARTGEBIET;
const karten = Object.fromEntries(werte.gebiete.map((g) => [g, lies(`inhalte/karten/${g}.json`)]));
// Die Spielstände liegen neben dem Spiel, nicht im Repo (.gitignore). Mit
// SPIELSTAND=… lässt sich eine andere Datei wählen — eine pro Kampagne,
// oder eine Wegwerf-Datei für die Prüfstände.
const spielstand = new Spielstand(process.env.SPIELSTAND || join(wurzel, 'spielstaende', 'spielstand.json'));
const spiel = new Spiel(karten, werte, { spielstand });
console.log(`Spielstand: ${spielstand.pfad} (${Object.keys(spielstand.daten.spieler).length} bekannte Spieler)`);

const ARTEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const dist = join(wurzel, 'dist');

const http = createServer((req, res) => {
  if (!existsSync(dist)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Spielserver läuft. Zum Spielen im Entwicklungsmodus http://localhost:5173 öffnen,\noder vorher „npm run build" ausführen, dann liefert dieser Server das Spiel selbst aus.');
    return;
  }
  const pfad = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let datei = join(dist, pfad);
  if (!datei.startsWith(dist) || !existsSync(datei) || statSync(datei).isDirectory()) datei = join(dist, 'index.html');
  res.writeHead(200, { 'content-type': ARTEN[extname(datei)] ?? 'application/octet-stream' });
  createReadStream(datei).pipe(res);
});

// Unsere Nachrichten sind kleiner als 200 Bytes. Der Standard von ws erlaubt
// 100 MB — über den Tunnel ist der Server offen im Internet erreichbar.
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  let ich = null;
  ws.lebt = true;
  ws.on('pong', () => (ws.lebt = true));
  const senden = (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));

  ws.on('message', (roh) => {
    let m;
    try {
      m = JSON.parse(roh);
    } catch {
      return;
    }
    if (!ich) {
      if (m.t !== 'hallo') return;
      const ergebnis = spiel.beitreten(m.name, senden);
      if (ergebnis.fehler) {
        senden({ t: 'abgelehnt', text: ergebnis.fehler });
        ws.close();
        return;
      }
      ich = ergebnis;
      return;
    }
    spiel.nachricht(ich.id, m);
  });
  ws.on('close', () => ich && spiel.verlassen(ich.id));
});

// Verbindungen, die ohne „close" abreißen (Handy im Funkloch), würden sonst
// ewig einen der vier Plätze belegen.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.lebt) ws.terminate();
    ws.lebt = false;
    ws.ping();
  }
}, 10000);

let zuletzt = Date.now();
setInterval(() => {
  const jetzt = Date.now();
  spiel.takt(Math.min(0.1, (jetzt - zuletzt) / 1000));
  zuletzt = jetzt;
}, TAKT);

// Beim Beenden (Strg+C) noch einmal speichern. Unter Windows kommt Strg+C
// als SIGINT auch beim Server an, den `npm run online` gestartet hat.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const s of spiel.spieler.values()) spiel.merken(s);
    spiel.speichern();
    process.exit(0);
  });

http.listen(PORT, () => console.log(`Spielserver auf http://localhost:${PORT}`));
