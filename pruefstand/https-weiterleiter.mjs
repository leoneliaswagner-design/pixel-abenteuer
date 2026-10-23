// Ein kleiner HTTPS-Weiterleiter, der sich verhält wie der Cloudflare-Tunnel:
// außen https/wss mit Zertifikat, innen http/ws zum Spielserver. So lässt
// sich `npm run online` prüfen, ohne dass Cloudflare erreichbar sein muss.
// Er zählt, was durch ihn lief — sonst wäre unbemerkt, wenn der Browser ihn
// umgeht (z. B. weil irgendwo „ws://" fest im Code steht).
import { createServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function starteWeiterleiter(zielPort, port) {
  const ordner = mkdtempSync(join(tmpdir(), 'weiterleiter-'));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${ordner}/k.pem -out ${ordner}/c.pem -days 1 -subj /CN=localhost`, { stdio: 'ignore' });
  const zaehler = { anfragen: 0, websockets: 0 };

  const server = createServer({ key: readFileSync(`${ordner}/k.pem`), cert: readFileSync(`${ordner}/c.pem`) }, (req, res) => {
    zaehler.anfragen++;
    const innen = httpRequest({ port: zielPort, path: req.url, method: req.method, headers: req.headers }, (antwort) => {
      res.writeHead(antwort.statusCode, antwort.headers);
      antwort.pipe(res);
    });
    req.pipe(innen);
  });
  server.on('upgrade', (req, sock, kopf) => {
    zaehler.websockets++;
    const innen = connect(zielPort, '127.0.0.1', () => {
      innen.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
      innen.write(kopf);
      innen.pipe(sock);
      sock.pipe(innen);
    });
    innen.on('error', () => sock.destroy());
    sock.on('error', () => innen.destroy());
  });
  await new Promise((r) => server.listen(port, r));
  return { url: `https://localhost:${port}/`, zaehler, schliessen: () => server.close() };
}
