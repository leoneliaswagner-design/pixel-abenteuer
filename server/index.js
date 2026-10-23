// Startet den Spielserver: WebSocket unter /ws, und — wenn `npm run build`
// gelaufen ist — liefert er auch das fertige Spiel aus dist/ aus. Dann reicht
// ein einziger Port, um mit Freunden zu spielen.
import { createServer } from 'node:http';
import { readFileSync, existsSync, createReadStream, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { WebSocketServer } from 'ws';
import { Spiel } from './spiel.js';

const wurzel = new URL('..', import.meta.url).pathname;
const lies = (p) => JSON.parse(readFileSync(join(wurzel, p), 'utf8'));
const PORT = Number(process.env.PORT) || 3001;
const TAKT = 50;

const spiel = new Spiel(lies('inhalte/karten/start.json'), lies('inhalte/daten/werte.json'));

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

const wss = new WebSocketServer({ server: http, path: '/ws' });

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
      ich = spiel.beitreten(m.name, senden);
      if (!ich) {
        senden({ t: 'voll' });
        ws.close();
      }
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
  spiel.schritt(Math.min(0.1, (jetzt - zuletzt) / 1000));
  zuletzt = jetzt;
  const stand = JSON.stringify(spiel.stand());
  for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(stand);
}, TAKT);

http.listen(PORT, () => console.log(`Spielserver auf http://localhost:${PORT}`));
