// Spielen übers Internet ohne eigenen Server: dein Rechner ist der Server,
// und ein kostenloser Cloudflare-Tunnel (ohne Konto) macht ihn unter einem
// https-Link erreichbar — auch hinter jedem Router, ohne Portfreigabe.
//
//   npm run online
//
// Der Link ändert sich bei jedem Start. Solange das Fenster offen ist, läuft
// das Spiel; Strg+C beendet Server und Tunnel.
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Tunnel, bin, install } from 'cloudflared';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

console.log('1/3  Baue das Spiel …');
execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

console.log('2/3  Starte den Spielserver …');
const server = spawn(process.execPath, ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(PORT) } });
let serverText = '';
await new Promise((gut, schlecht) => {
  const lesen = (d) => {
    serverText += d;
    if (serverText.includes(`:${PORT}`)) gut();
    if (serverText.includes('EADDRINUSE'))
      schlecht(new Error(`Port ${PORT} ist schon belegt — läuft noch „npm run dev" oder ein anderes „npm run online"?`));
  };
  server.stdout.on('data', lesen);
  server.stderr.on('data', lesen);
  server.on('exit', () => schlecht(new Error('Der Spielserver ist sofort wieder ausgegangen:\n' + serverText)));
}).catch((e) => {
  console.error('\n' + e.message);
  process.exit(1);
});

// Das npm-Paket lädt cloudflared beim Installieren herunter. Ist das
// schiefgegangen (z. B. offline beim npm install), hier nachholen.
if (!existsSync(bin)) {
  console.log('     Lade cloudflared herunter (einmalig) …');
  await install(bin);
}

console.log('3/3  Öffne den Tunnel …');
const tunnel = Tunnel.quick(`http://127.0.0.1:${PORT}`);
let link = null;

const ende = () => {
  tunnel.stop();
  server.kill();
  process.exit(0);
};
process.on('SIGINT', ende);
process.on('SIGTERM', ende);
server.on('exit', () => {
  console.error('\nDer Spielserver ist ausgegangen:\n' + serverText.slice(-2000));
  tunnel.stop();
  process.exit(1);
});

const zuLangsam = setTimeout(() => {
  if (link) return;
  console.log('\n     Der Tunnel kommt nicht zustande. Ist der Rechner online? Eine Firewall oder ein');
  console.log('     Firmen-/Schulnetz kann Cloudflare sperren. Ich versuche es weiter …');
}, 30000);

// Den Link selbst aus der Ausgabe lesen, nicht über das 'url'-Ereignis des
// Pakets: das nimmt den ersten trycloudflare-Link, den es sieht — und als
// Cloudflare nicht erreichbar war, war das „https://api.trycloudflare.com"
// aus der Fehlermeldung. Das Skript meldete dann einen Link, der nie ging.
let letzteZeilen = [];
const ausgabe = (text) => {
  letzteZeilen = [...letzteZeilen, ...text.split('\n').filter((z) => z.trim())].slice(-6);
  const treffer = text.match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/);
  if (treffer && !link) linkGefunden(treffer[0]);
};
tunnel.on('stdout', ausgabe);
tunnel.on('stderr', ausgabe);

async function linkGefunden(url) {
  link = url;
  clearTimeout(zuLangsam);
  const rahmen = '═'.repeat(url.length + 4);
  console.log(`\n╔${rahmen}╗\n║  ${url}  ║\n╚${rahmen}╝\n`);
  // Cloudflare meldet den Link, bevor er überall erreichbar ist. Deshalb
  // nachsehen und sagen, ab wann er antwortet — sonst schickt man Freunden
  // einen Link, der „Seite nicht gefunden" zeigt, und alle glauben, es geht nicht.
  process.stdout.write('Wird freigeschaltet ');
  const bis = Date.now() + 90000;
  let erreichbar = false;
  while (!erreichbar && Date.now() < bis) {
    try {
      const antwort = await fetch(url, { signal: AbortSignal.timeout(3000) });
      erreichbar = antwort.ok && (await antwort.text()).includes('Pixel-Abenteuer');
    } catch {
      /* noch nicht da */
    }
    if (!erreichbar) {
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log(erreichbar
    ? ' ✓\n\nDer Link funktioniert. Schick ihn deinen Freunden und öffne ihn selbst — bis zu 4 spielen mit.'
    : '\n\nDer Link antwortet von hier aus noch nicht. Manchmal dauert es eine Minute — einfach im Browser probieren.');
  console.log('Fenster offen lassen, solange gespielt wird. Beenden mit Strg+C.\n');
}
tunnel.on('error', (e) => console.error('Tunnel-Fehler:', e.message));
tunnel.on('exit', (code) => {
  if (code) {
    console.error('\n\nDer Tunnel ließ sich nicht öffnen. Letzte Meldungen von cloudflared:');
    for (const z of letzteZeilen) console.error('  ' + z.replace(/^\S+Z (ERR|INF|WRN) /, ''));
    console.error('\nMeist heißt das: kein Internet, oder eine Firewall/ein Firmen- oder Schulnetz sperrt Cloudflare.');
  }
  server.kill();
  process.exit(code ?? 0);
});
