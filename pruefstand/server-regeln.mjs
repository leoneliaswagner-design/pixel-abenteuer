// Die Regeln des Servers ohne Browser und ohne Netz, mit eigener Uhr.
//   node pruefstand/server-regeln.mjs
import { readFileSync } from 'node:fs';
import { Spiel } from '../server/spiel.js';

const lies = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const werte = lies('inhalte/daten/werte.json');
let uhr = 100000;
const spiel = new Spiel(lies('inhalte/karten/start.json'), werte, () => uhr);
const tick = (ms) => {
  for (let t = 0; t < ms; t += 50) {
    uhr += 50;
    spiel.schritt(0.05);
  }
};

const fehler = [];
let pruefungen = 0;
const pruefe = (bed, text) => {
  pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};

const post = [];
const s = spiel.beitreten('Test', (m) => post.push(m));
const g = spiel.gegner[0];
pruefe(spiel.gegner.length === 6, `${spiel.gegner.length} Gegner aus der Karte gelesen`);

// Den Gegner festhalten: er soll treffen, nicht weglaufen.
const festhalten = () => Object.assign(g, { x: s.x, y: s.y + 4, stossBis: uhr + 100000, vx: 0, vy: 0 });

// --- Schonfrist nach dem Beitreten ---
festhalten();
tick(50);
pruefe(s.leben === werte.spieler.leben, 'in der Schonfrist nach dem Beitreten kein Schaden');

// --- Treffer ---
tick(1500);
festhalten();
tick(50);
pruefe(s.leben === werte.spieler.leben - 1, `Gegner trifft: ${werte.spieler.leben} → ${s.leben} Leben`);
pruefe(post.some((m) => m.t === 'getroffen' && Math.hypot(m.vx, m.vy) > 100), 'Rückstoß wird an den Getroffenen geschickt');
const nachTreffer = s.leben;
festhalten();
tick(200);
pruefe(s.leben === nachTreffer, 'kurz danach unverwundbar');

// --- Tod und Wiederbelebung ---
for (let i = 0; i < 20 && !s.tot; i++) {
  tick(werte.spieler.unverwundbar + 50);
  festhalten();
  tick(50);
}
pruefe(s.tot && s.leben === 0, 'nach genug Treffern besiegt');
g.tot = true;
g.wiederBei = uhr + 1e9;
const k = s.korrektur;
tick(werte.spieler.wiederbelebung + 100);
pruefe(!s.tot && s.leben === werte.spieler.leben, 'nach der Wartezeit wieder da, mit vollem Leben');
pruefe(post.some((m) => m.t === 'wiederbelebt') && s.korrektur === k + 1, 'Browser erfährt die neue Position (Korrekturzähler +1)');

// --- Alte Positionen nach der Korrektur zählen nicht ---
const vorher = { x: s.x, y: s.y };
spiel.nachricht(s.id, { t: 'pos', x: s.x + 5, y: s.y, r: 'unten', k });
pruefe(s.x === vorher.x, 'Position mit altem Korrekturzähler wird verworfen');
tick(200);
spiel.nachricht(s.id, { t: 'pos', x: s.x + 5, y: s.y, r: 'unten', k: s.korrektur });
pruefe(s.x === vorher.x + 5, 'Position mit aktuellem Zähler wird übernommen');

// --- Ein kleiner Schritt ins Wasser, im Tempo erlaubt, aber nicht dorthin ---
Object.assign(s, { x: 530, y: 504 });
tick(500);
const amUfer = s.korrektur;
spiel.nachricht(s.id, { t: 'pos', x: 538, y: 504, r: 'rechts', k: s.korrektur });
pruefe(s.x === 538, 'Schritt ans Ufer wird übernommen');
spiel.nachricht(s.id, { t: 'pos', x: 550, y: 504, r: 'rechts', k: s.korrektur });
pruefe(s.x === 538 && s.korrektur === amUfer + 1, 'Schritt ins Wasser wird korrigiert');

// --- Herz heilt nur, wer nicht voll ist ---
s.leben = 3;
spiel.herzen.set('hx', { id: 'hx', x: s.x, y: s.y - 8, bis: uhr + 10000 });
tick(50);
pruefe(s.leben === 5 && !spiel.herzen.has('hx'), `Herz aufgehoben: 3 → ${s.leben} Leben`);
spiel.herzen.set('hy', { id: 'hy', x: s.x, y: s.y - 8, bis: uhr + 10000 });
s.leben = werte.spieler.leben;
tick(50);
pruefe(spiel.herzen.has('hy'), 'mit vollem Leben bleibt das Herz liegen (für die anderen)');

// --- Fünfter Spieler passt nicht ---
for (let i = 0; i < 3; i++) spiel.beitreten(`N${i}`, () => {});
pruefe(spiel.beitreten('Fünf', () => {}) === null, 'der fünfte Spieler wird abgewiesen');
const farben = new Set([...spiel.spieler.values()].map((x) => x.farbe));
pruefe(farben.size === 4, `vier Spieler, vier Farben (${[...farben].join(', ')})`);

console.log(`\n${pruefungen} Prüfungen.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
