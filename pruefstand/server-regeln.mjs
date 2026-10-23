// Die Regeln des Servers ohne Browser und ohne Netz, mit eigener Uhr.
//   node pruefstand/server-regeln.mjs
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Spiel } from '../server/spiel.js';
import { Spielstand } from '../server/spielstand.js';
import { bewege } from '../gemeinsam/welt.js';

const lies = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const werte = lies('inhalte/daten/werte.json');
const karten = Object.fromEntries(werte.gebiete.map((g) => [g, lies(`inhalte/karten/${g}.json`)]));
let uhr = 100000;
const spiel = new Spiel(karten, werte, { jetzt: () => uhr });
const oberwelt = spiel.gebiete.get('start');
const hoehle = spiel.gebiete.get('hoehle');
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
const g = oberwelt.gegner[0];
pruefe(oberwelt.gegner.length === 6 && hoehle.gegner.length === 5,
  `Gegner aus den Karten gelesen (Oberwelt ${oberwelt.gegner.length}, Höhle ${hoehle.gegner.length})`);

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
oberwelt.herzen.set('hx', { id: 'hx', x: s.x, y: s.y - 8, bis: uhr + 10000 });
tick(50);
pruefe(s.leben === 5 && !oberwelt.herzen.has('hx'), `Herz aufgehoben: 3 → ${s.leben} Leben`);
oberwelt.herzen.set('hy', { id: 'hy', x: s.x, y: s.y - 8, bis: uhr + 10000 });
s.leben = werte.spieler.leben;
tick(50);
pruefe(oberwelt.herzen.has('hy'), 'mit vollem Leben bleibt das Herz liegen (für die anderen)');

// --- Fünfter Spieler passt nicht ---
for (let i = 0; i < 3; i++) spiel.beitreten(`N${i}`, () => {});
pruefe(!!spiel.beitreten('Fünf', () => {}).fehler, 'der fünfte Spieler wird abgewiesen');
const farben = new Set([...spiel.spieler.values()].map((x) => x.farbe));
pruefe(farben.size === 4, `vier Spieler, vier Farben (${[...farben].join(', ')})`);

for (const x of [...spiel.spieler.values()]) if (x !== s) spiel.verlassen(x.id);
pruefe(!!spiel.beitreten('test', () => {}).fehler, 'derselbe Name zweimal (auch anders geschrieben) wird abgewiesen');

// --- Treppe in der Ruine führt in die Höhle ---
// Treppe „E" auf Kachel (34,27) = y 864…896; die Ankunft „a" darüber.
Object.assign(s, { tot: false, leben: 6, x: 34 * 32 + 16, y: 26 * 32 + 24 });
tick(500);
post.length = 0;
const kVorher = s.korrektur;
spiel.nachricht(s.id, { t: 'pos', x: s.x, y: 27 * 32 + 4, r: 'unten', k: s.korrektur });
const wechsel = post.find((m) => m.t === 'gebiet');
pruefe(s.gebiet === 'hoehle' && wechsel?.gebiet === 'hoehle', `Schritt auf die Treppe: jetzt in „${s.gebiet}"`);
const ankunft = hoehle.ankuenfte.get('von_oben');
pruefe(wechsel && wechsel.x === ankunft.x && wechsel.y === ankunft.y + 8 && s.korrektur === kVorher + 1,
  'Browser bekommt die Ankunft in der Höhle und einen neuen Korrekturzähler');
spiel.nachricht(s.id, { t: 'pos', x: 34 * 32 + 16, y: 27 * 32 + 10, r: 'unten', k: kVorher });
pruefe(s.gebiet === 'hoehle' && s.x === ankunft.x, 'Nachzügler-Position aus der Oberwelt wird verworfen');

// --- Was in einem Gebiet passiert, bleibt dort ---
post.length = 0;
tick(100);
spiel.takt(0.05);
const meinStand = post.filter((m) => m.t === 'stand').at(-1);
pruefe(meinStand && meinStand.gegner.every((x) => x.id.startsWith('hoehle-')) && meinStand.gegner.length === 5,
  `Stand zeigt nur die Gegner der Höhle (${meinStand?.gegner.length})`);
const ruhe = oberwelt.gegner.map((x) => [x.x, x.y]);
tick(2000);
pruefe(oberwelt.gegner.every((x, i) => x.x === ruhe[i][0] && x.y === ruhe[i][1]), 'die Oberwelt ohne Spieler steht still');

// --- Besiegt in der Höhle: zurück an der Höhlen-Ankunft ---
s.leben = 0;
s.tot = true;
s.wiederBei = uhr;
s.x += 40;
tick(100);
pruefe(!s.tot && s.gebiet === 'hoehle' && s.x === ankunft.x, 'Wiederbelebung an der letzten Ankunft (in der Höhle)');

// --- Treppe hinauf zurück ---
tick(500);
spiel.nachricht(s.id, { t: 'pos', x: s.x, y: s.y + 10, r: 'unten', k: s.korrektur });
pruefe(s.gebiet === 'start' && Math.abs(s.y - (26 * 32 + 24)) < 1, `Treppe hinauf: zurück in der Oberwelt, in der Ruine (y ${s.y})`);

// --- Spielstand: wer geht und wiederkommt, steht wieder dort ---
const ordner = mkdtempSync(join(tmpdir(), 'spielstand-'));
const datei = join(ordner, 'stand.json');
const stand = new Spielstand(datei);
const spiel2 = new Spiel(karten, werte, { jetzt: () => uhr, spielstand: stand });
const mia = spiel2.beitreten('Mia', () => {});
spiel2.wechseln(mia, 'hoehle', 'von_oben');
mia.x += 20;
mia.leben = 3;
spiel2.verlassen(mia.id);
pruefe(existsSync(datei), 'beim Verlassen wird die Datei geschrieben');
const spiel3 = new Spiel(karten, werte, { jetzt: () => uhr, spielstand: new Spielstand(datei) });
const nachricht3 = [];
const mia2 = spiel3.beitreten('MIA', (m) => nachricht3.push(m));
pruefe(mia2.gebiet === 'hoehle' && mia2.x === mia.x && mia2.leben === 3,
  `nach dem Neustart: Mia wieder in der Höhle, gleiche Stelle, 3 Leben (${mia2.gebiet}, ${mia2.x}, ${mia2.leben})`);
pruefe(nachricht3[0]?.t === 'willkommen' && nachricht3[0].gebiet === 'hoehle' && nachricht3[0].wieder, 'Willkommen nennt das gespeicherte Gebiet');
const neu = spiel3.beitreten('Jonas', () => {});
pruefe(neu.gebiet === 'start', 'ein neuer Name beginnt in der Oberwelt');

// --- Regelmäßig speichern, nicht nur beim Verlassen ---
const vorSpeichern = readFileSync(datei, 'utf8');
mia2.x += 8;
uhr += 6000;
spiel3.schritt(0.05);
pruefe(readFileSync(datei, 'utf8') !== vorSpeichern, 'nach 5 Sekunden wird von selbst gespeichert');

// --- Kaputte Datei: die Sicherung springt ein ---
writeFileSync(datei, '{ kaputt');
const gerettet = new Spielstand(datei);
pruefe(!!gerettet.daten.spieler.mia, 'kaputter Spielstand → Sicherung (.bak) wird geladen');

// --- Ansprechen: Schild, Figur, Truhe ---
const datei4 = join(mkdtempSync(join(tmpdir(), 'spielstand-')), 'stand.json');
const spiel4 = new Spiel(karten, werte, { jetzt: () => uhr, spielstand: new Spielstand(datei4) });
const postA = [], postB = [];
const ana = spiel4.beitreten('Ana', (m) => postA.push(m));
const bo = spiel4.beitreten('Bo', (m) => postB.push(m));
const sprich = (wer, x, y, r) => {
  Object.assign(wer, { x, y });
  uhr += 300;
  postA.length = postB.length = 0;
  spiel4.nachricht(wer.id, { t: 'ansprechen', r });
};
const dialogVon = (post) => post.find((m) => m.t === 'dialog');

sprich(ana, 6 * 32 + 16, 13 * 32 + 16, 'oben');
pruefe(dialogVon(postA)?.seiten.length === 2 && dialogVon(postA).seiten[0].startsWith('Willkommen'),
  `Schild: zwei Seiten, „${dialogVon(postA)?.seiten[0]}"`);
pruefe(!dialogVon(postB), 'den Text des Schilds bekommt nur, wer liest');

sprich(ana, 6 * 32 + 16, 13 * 32 + 16, 'unten');
pruefe(!postA.length, 'wer vom Schild wegschaut, liest nichts');

sprich(ana, 12 * 32 + 16, 13 * 32 + 16, 'oben');
pruefe(dialogVon(postA)?.name === 'Alter Mann' && dialogVon(postA).seiten.length === 3, `Figur: „${dialogVon(postA)?.name}", ${dialogVon(postA)?.seiten.length} Seiten`);
pruefe(postB.some((m) => m.t === 'blick' && m.r === 'unten'), 'die Figur dreht sich zu Ana — auch Bo sieht das');

const truheOben = oberwelt.welt.dinge.find((d) => d.schluessel === 'oberwelt_gold');
pruefe(!oberwelt.welt.frei(truheOben.x, truheOben.y + 10), 'durch eine Truhe läuft man nicht');
sprich(ana, 37 * 32 + 16, 2 * 32 + 16, 'oben');
pruefe(dialogVon(postA)?.seiten[0] === 'Du findest 20 Goldmünzen!' && ana.inventar.gold === 20, `Truhe: „${dialogVon(postA)?.seiten[0]}", Gold ${ana.inventar.gold}`);
pruefe(postB.some((m) => m.t === 'truhe' && m.ding === 'oberwelt_gold' && m.offen), 'Bo sieht die Truhe aufgehen');
sprich(bo, 37 * 32 + 16, 2 * 32 + 16, 'oben');
pruefe(dialogVon(postB)?.seiten[0] === 'Die Truhe ist leer.' && !bo.inventar.gold, 'zweimal öffnen geht nicht: leer, und Bo bekommt nichts');

spiel4.wechseln(ana, 'hoehle', 'von_oben');
sprich(ana, 2 * 32 + 16, 2 * 32 + 16, 'oben');
pruefe(dialogVon(postA)?.seiten[0] === 'Du findest einen kleinen Schlüssel!' && spiel4.gruppe().schluessel === 1 && !ana.inventar.schluessel,
  `Höhlentruhe: „${dialogVon(postA)?.seiten[0]}" — der Schlüssel gehört der Gruppe`);
pruefe(postB.some((m) => m.t === 'gruppe' && m.inventar.schluessel === 1), 'Bo (oben) erfährt vom Schlüssel der Gruppe');

// --- Die Tür in der Höhle: mit dem Gruppenschlüssel, auch wenn Bo aufschließt ---
// Tür auf Kachel (21,5); davor steht man auf (20,5) und schaut nach rechts.
const tuer = hoehle.welt.dinge.find((d) => d.schluessel === 'hoehle_tuer');
const vorTuer = [20 * 32 + 16, 5 * 32 + 24];
pruefe(!spiel4.gebiete.get('hoehle').welt.frei(21 * 32 + 16, 5 * 32 + 24), 'die Tür ist zu und lässt niemanden durch');
spiel4.wechseln(bo, 'hoehle', 'von_oben');
const gruppeVorher = spiel4.gruppe().schluessel;
spiel4.gruppe().schluessel = 0;
sprich(bo, ...vorTuer, 'rechts');
pruefe(dialogVon(postB)?.seiten[0] === 'Verschlossen. Ihr braucht einen kleinen Schlüssel.', `ohne Schlüssel: „${dialogVon(postB)?.seiten[0]}"`);
spiel4.gruppe().schluessel = gruppeVorher;
sprich(bo, ...vorTuer, 'rechts');
const welt4 = spiel4.gebiete.get('hoehle').welt;
pruefe(welt4.frei(21 * 32 + 16, 5 * 32 + 24) && spiel4.gruppe().schluessel === 0, 'Bo schließt mit dem Gruppenschlüssel auf — Tür offen, Schlüssel weg');
pruefe(postA.some((m) => m.t === 'tuer' && m.offen) && postA.some((m) => m.t === 'gruppe' && m.inventar.schluessel === 0), 'Ana (auch in der Höhle) sieht die Tür aufgehen und den Schlüssel fehlen');
sprich(bo, ...vorTuer, 'rechts');
pruefe(!postB.length, 'eine offene Tür spricht man nicht mehr an');
void tuer;

// --- Der Riss führt in den Tempel; der Rissstein schließt ihn ---
const riss = hoehle.uebergaenge.find((u) => u.eig.art === 'riss');
// Riss auf Kachel (24,2) = y 64…96. Erst ein Treffer: im Rückstoß geht
// niemand hindurch.
Object.assign(bo, { x: 24 * 32 + 16, y: 3 * 32 + 24, unverwundbarBis: 0 });
const schleim = { x: bo.x, y: bo.y - 20, w: werte.gegner.schleim };
spiel4.spielerTreffen(bo, schleim, uhr);
uhr += 100;
spiel4.nachricht(bo.id, { t: 'pos', x: bo.x, y: 2 * 32 + 30, r: 'oben', k: bo.korrektur });
pruefe(bo.gebiet === 'hoehle', 'im Rückstoß in den Riss gedrückt: kein Gebietswechsel');
Object.assign(bo, { x: 24 * 32 + 16, y: 3 * 32 + 24, leben: 6 });
uhr += 500;
spiel4.nachricht(bo.id, { t: 'pos', x: bo.x, y: 2 * 32 + 30, r: 'oben', k: bo.korrektur });
pruefe(bo.gebiet === 'tempel', `durch den Riss: Bo ist im Tempel (${bo.gebiet}) — Riss ${riss?.eig.ziel}`);
postA.length = 0;
sprich(bo, 9 * 32 + 16, 3 * 32 + 16, 'oben');
pruefe(spiel4.gruppe().rissstein === 1 && spiel4.zustaende().tempel_geschlossen, `Rissstein genommen: Zustand „tempel_geschlossen" gesetzt`);
pruefe(postA.some((m) => m.t === 'zustand' && m.name === 'tempel_geschlossen') && postA.some((m) => m.t === 'nachricht' && m.text.includes('schließt sich')),
  'Ana in der Höhle erfährt es — mit Meldung');
spiel4.wechseln(bo, 'hoehle', 'von_tempel');
Object.assign(bo, { x: 24 * 32 + 16, y: 3 * 32 + 24 });
uhr += 500;
spiel4.nachricht(bo.id, { t: 'pos', x: bo.x, y: 2 * 32 + 30, r: 'oben', k: bo.korrektur });
pruefe(bo.gebiet === 'hoehle', 'der geschlossene Riss lässt niemanden mehr durch');
spiel4.wechseln(ana, 'start', 'von_hoehle');
sprich(ana, 12 * 32 + 16, 13 * 32 + 16, 'oben');
pruefe(dialogVon(postA)?.seiten[0].startsWith('Das Flimmern'), `der alte Mann sagt jetzt etwas anderes („${dialogVon(postA)?.seiten[0].slice(0, 30)}…")`);

spiel4.verlassen(ana.id);
spiel4.verlassen(bo.id);
const spiel5 = new Spiel(karten, werte, { jetzt: () => uhr, spielstand: new Spielstand(datei4) });
const postC = [];
const ana2 = spiel5.beitreten('Ana', (m) => postC.push(m));
pruefe(ana2.inventar.gold === 20 && spiel5.gruppe().rissstein === 1, `nach dem Neustart: Ana hat noch 20 Gold, die Gruppe den Rissstein (${JSON.stringify(ana2.inventar)}, ${JSON.stringify(spiel5.gruppe())})`);
pruefe(spiel5.gebiete.get('hoehle').welt.geoeffnet.has('hoehle_tuer') && spiel5.zustaende().tempel_geschlossen, 'nach dem Neustart: Tür offen, Riss geschlossen');
spiel5.wechseln(ana2, 'start', 'von_hoehle');
const wechsel5 = postC.find((m) => m.t === 'gebiet');
pruefe(wechsel5?.offen.includes('oberwelt_gold'), 'nach dem Neustart steht die Truhe oben noch offen');

// --- An die Wand heran, egal bei welcher Bildrate ---
// Der Busch auf Kachel (8,16) beginnt bei y = 512.
const anWand = [60, 20, 8].map((bps) => {
  let p = { x: 272, y: 440 };
  for (let i = 0; i < 3 * bps; i++) p = bewege(oberwelt.welt, p.x, p.y, 0, 90 / bps);
  return p.y;
});
pruefe(anWand.every((y) => Math.abs(y - 512) < 0.05), `Figur steht dicht am Busch bei 60/20/8 Bildern/s (${anWand.map((y) => y.toFixed(2)).join(' / ')})`);

// --- Ein Übergang ins Leere fällt beim Start auf, nicht erst beim Spielen ---
const kaputteKarte = JSON.parse(JSON.stringify(karten.hoehle));
kaputteKarte.layers[2].objects.find((o) => o.name === 'uebergang').properties.find((p) => p.name === 'ankunft').value = 'gibtsnicht';
let meldung = '';
try {
  new Spiel({ ...karten, hoehle: kaputteKarte }, werte);
} catch (e) {
  meldung = e.message;
}
pruefe(meldung.includes('ins Leere'), `Übergang ins Leere wird beim Start gemeldet („${meldung}")`);

console.log(`\n${pruefungen} Prüfungen.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
