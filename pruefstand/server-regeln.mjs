// Die Regeln des Servers ohne Browser und ohne Netz, mit eigener Uhr.
//   node pruefstand/server-regeln.mjs
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Spiel } from '../server/spiel.js';
import { Spielstand } from '../server/spielstand.js';
import { bewege } from '../gemeinsam/welt.js';
import { ZUSATZDATEN, kaufpreis, verkaufspreis, werteBerechnen } from '../gemeinsam/regeln.js';

const lies = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const werte = lies('inhalte/daten/werte.json');
for (const d of ZUSATZDATEN) werte[d] = lies(`inhalte/daten/${d}.json`);
const karten = Object.fromEntries(werte.gebiete.map((g) => [g, lies(`inhalte/karten/${g}.json`)]));
let uhr = 100000;
// Die meisten Prüfungen spielen im Inselwald (Schleime, Büsche, Ruine);
// Riftside, das echte Startgebiet, hat eigene Prüfungen weiter unten.
const werteWald = { ...werte, startGebiet: 'wald' };
const spiel = new Spiel(karten, werteWald, { jetzt: () => uhr });
const oberwelt = spiel.gebiete.get('wald');
const hoehle = spiel.gebiete.get('hoehle');
const tick = (ms) => {
  for (let t = 0; t < ms; t += 50) {
    uhr += 50;
    spiel.schritt(0.05);
  }
};

// Beitreten und gleich einen Charakter wählen — ohne Klasse wartet ein
// Spieler auf die Auswahl und zählt im Spiel nicht mit.
const mitCharakter = (sp, name, senden, klasse = 'kaempfer', spezies = 'mensch') => {
  const x = sp.beitreten(name, senden);
  if (x.waehlt) sp.nachricht(x.id, { t: 'charakter', klasse, spezies });
  return x;
};

const fehler = [];
let pruefungen = 0;
const pruefe = (bed, text) => {
  pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};

const post = [];
const s = mitCharakter(spiel, 'Test', (m) => post.push(m));
const g = oberwelt.gegner[0];
pruefe(oberwelt.gegner.length === 6 && hoehle.gegner.length === 5,
  `Gegner aus den Karten gelesen (Oberwelt ${oberwelt.gegner.length}, Höhle ${hoehle.gegner.length})`);

// Den Gegner festhalten: er soll treffen, nicht weglaufen.
const festhalten = () => Object.assign(g, { x: s.x, y: s.y + 4, stossBis: uhr + 100000, vx: 0, vy: 0 });

// --- Schonfrist nach dem Beitreten: solange der Browser lädt, und danach 1,5 s ---
festhalten();
tick(4000);
pruefe(s.leben === spiel.maxLeben(s), 'solange der Browser noch lädt (4 s), kein Schaden');
spiel.nachricht(s.id, { t: 'bereit' });
festhalten();
tick(50);
pruefe(s.leben === spiel.maxLeben(s), 'in der Schonfrist nach „bereit" kein Schaden');

// --- Treffer ---
tick(1500);
festhalten();
tick(50);
pruefe(s.leben === spiel.maxLeben(s) - 1, `Gegner trifft: ${spiel.maxLeben(s)} → ${s.leben} Leben`);
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
pruefe(!s.tot && s.leben === spiel.maxLeben(s), 'nach der Wartezeit wieder da, mit vollem Leben');
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
s.leben = spiel.maxLeben(s);
tick(50);
pruefe(oberwelt.herzen.has('hy'), 'mit vollem Leben bleibt das Herz liegen (für die anderen)');

// --- Fünfter Spieler passt nicht ---
for (let i = 0; i < 3; i++) mitCharakter(spiel, `N${i}`, () => {});
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
pruefe(s.gebiet === 'wald' && Math.abs(s.y - (26 * 32 + 24)) < 1, `Treppe hinauf: zurück in der Oberwelt, in der Ruine (y ${s.y})`);

// --- Spielstand: wer geht und wiederkommt, steht wieder dort ---
const ordner = mkdtempSync(join(tmpdir(), 'spielstand-'));
const datei = join(ordner, 'stand.json');
const stand = new Spielstand(datei);
const spiel2 = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: stand });
const mia = mitCharakter(spiel2, 'Mia', () => {});
spiel2.wechseln(mia, 'hoehle', 'von_oben');
mia.x += 20;
mia.leben = 3;
spiel2.verlassen(mia.id);
pruefe(existsSync(datei), 'beim Verlassen wird die Datei geschrieben');
const spiel3 = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei) });
const nachricht3 = [];
const mia2 = mitCharakter(spiel3, 'MIA', (m) => nachricht3.push(m));
pruefe(mia2.gebiet === 'hoehle' && mia2.x === mia.x && mia2.leben === 3,
  `nach dem Neustart: Mia wieder in der Höhle, gleiche Stelle, 3 Leben (${mia2.gebiet}, ${mia2.x}, ${mia2.leben})`);
pruefe(nachricht3[0]?.t === 'willkommen' && nachricht3[0].gebiet === 'hoehle' && nachricht3[0].wieder, 'Willkommen nennt das gespeicherte Gebiet');
const neu = mitCharakter(spiel3, 'Jonas', () => {});
pruefe(neu.gebiet === 'wald', 'ein neuer Name beginnt in der Oberwelt');

// --- Ohne Sonderwerte beginnt jeder in Riftside, am Hafen ---
const echt = new Spiel(karten, werte, { jetzt: () => uhr });
const neuling = mitCharakter(echt, 'Neu', () => {});
pruefe(neuling.gebiet === 'riftside' && echt.gebiete.get('riftside').welt.frei(neuling.x, neuling.y), `neue Spieler beginnen in Riftside (${neuling.gebiet}, ${neuling.x}, ${neuling.y})`);
pruefe(echt.gebiete.get('riftside').gegner.length === 0, 'in der Stadt gibt es keine Gegner');
// Durchs Stadttor in den Wald und zurück
Object.assign(neuling, { x: 21 * 32 + 16, y: 1 * 32 + 24 });
uhr += 500;
echt.nachricht(neuling.id, { t: 'pos', x: neuling.x, y: 0 * 32 + 28, r: 'oben', k: neuling.korrektur });
pruefe(neuling.gebiet === 'wald', `durchs Stadttor: im Inselwald (${neuling.gebiet})`);
Object.assign(neuling, { x: 8 * 32 + 16, y: 28 * 32 + 24 });
uhr += 500;
echt.nachricht(neuling.id, { t: 'pos', x: neuling.x, y: 29 * 32 + 10, r: 'unten', k: neuling.korrektur });
pruefe(neuling.gebiet === 'riftside' && neuling.y < 4 * 32, `vom Wald nach Süden: zurück in Riftside, unter dem Tor (${neuling.gebiet}, y ${neuling.y})`);

// --- Ins Rathaus und wieder hinaus ---
// Tür auf Kachel (17,5) = y 160…192, davor (17,6); im Rathaus der Ausgang (7,9).
Object.assign(neuling, { x: 17 * 32 + 16, y: 6 * 32 + 24 });
uhr += 500;
echt.nachricht(neuling.id, { t: 'pos', x: neuling.x, y: 5 * 32 + 28, r: 'oben', k: neuling.korrektur });
pruefe(neuling.gebiet === 'rathaus', `durch die Tür ins Rathaus (${neuling.gebiet})`);
Object.assign(neuling, { x: 7 * 32 + 16, y: 8 * 32 + 24 });
uhr += 500;
echt.nachricht(neuling.id, { t: 'pos', x: neuling.x, y: 9 * 32 + 4, r: 'unten', k: neuling.korrektur });
pruefe(neuling.gebiet === 'riftside' && neuling.x === 17 * 32 + 16 && neuling.y === 6 * 32 + 24,
  `über die Fußmatte hinaus: vor der Rathaustür (${neuling.gebiet}, ${neuling.x}, ${neuling.y})`);
pruefe(!echt.gebiete.get('riftside').welt.frei(5 * 32 + 16, 5 * 32 + 24), 'die anderen Haustüren sind zu (man läuft nicht hinein)');

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
const spiel4 = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei4) });
const postA = [], postB = [];
const ana = mitCharakter(spiel4, 'Ana', (m) => postA.push(m));
const bo = mitCharakter(spiel4, 'Bo', (m) => postB.push(m));
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

// --- Der Riss in der Fischergasse führt in den Tempel; der Rissstein schließt ihn ---
// Riss auf Kachel (34,15) in Riftside = y 480…512; davor die Gasse.
const riftside = spiel4.gebiete.get('riftside');
const riss = riftside.uebergaenge.find((u) => u.eig.art === 'riss');
const vorRiss = { x: 34 * 32 + 16, y: 16 * 32 + 24 };
const inRiss = 15 * 32 + 30;
spiel4.wechseln(bo, 'riftside', 'aus_tempel');
// Erst ein Treffer: im Rückstoß geht niemand hindurch.
Object.assign(bo, { ...vorRiss, unverwundbarBis: 0 });
const schleim = { x: bo.x, y: bo.y - 20, w: werte.gegner.schleim };
spiel4.spielerTreffen(bo, schleim, uhr);
uhr += 100;
spiel4.nachricht(bo.id, { t: 'pos', x: bo.x, y: inRiss, r: 'oben', k: bo.korrektur });
pruefe(bo.gebiet === 'riftside', 'im Rückstoß in den Riss gedrückt: kein Gebietswechsel');
Object.assign(bo, { ...vorRiss, leben: 6 });
uhr += 500;
spiel4.nachricht(bo.id, { t: 'pos', x: bo.x, y: inRiss, r: 'oben', k: bo.korrektur });
pruefe(bo.gebiet === 'tempel', `durch den Riss in der Fischergasse: Bo ist im Tempel (${bo.gebiet}) — Riss nach ${riss?.eig.ziel}`);
postA.length = 0;
sprich(bo, 9 * 32 + 16, 3 * 32 + 16, 'oben');
pruefe(spiel4.gruppe().rissstein === 1 && spiel4.zustaende().tempel_geschlossen, `Rissstein genommen: Zustand „tempel_geschlossen" gesetzt`);
pruefe(postA.some((m) => m.t === 'zustand' && m.name === 'tempel_geschlossen') && postA.some((m) => m.t === 'nachricht' && m.text.includes('schließt sich')),
  'Ana in der Höhle erfährt es — mit Meldung');
spiel4.wechseln(bo, 'riftside', 'aus_tempel');
Object.assign(bo, vorRiss);
uhr += 500;
spiel4.nachricht(bo.id, { t: 'pos', x: bo.x, y: inRiss, r: 'oben', k: bo.korrektur });
pruefe(bo.gebiet === 'riftside', 'der geschlossene Riss lässt niemanden mehr durch');
spiel4.wechseln(ana, 'wald', 'von_hoehle');
sprich(ana, 12 * 32 + 16, 13 * 32 + 16, 'oben');
pruefe(dialogVon(postA)?.seiten[0].startsWith('Man erzählt sich'), `der alte Mann sagt jetzt etwas anderes („${dialogVon(postA)?.seiten[0].slice(0, 30)}…")`);
// Der Bürgermeister in Riftside auch — Bo steht unter ihm (18,13) und schaut hoch.
const postBvorher = postB.length;
sprich(bo, 18 * 32 + 16, 14 * 32 + 16, 'oben');
pruefe(dialogVon(postB)?.name === 'Bürgermeister Aldric' && dialogVon(postB).seiten[0].startsWith('Der Riss in der Fischergasse ist geschlossen'),
  `der Bürgermeister bedankt sich („${dialogVon(postB)?.seiten[0].slice(0, 36)}…")`);
void postBvorher;

spiel4.verlassen(ana.id);
spiel4.verlassen(bo.id);
const spiel5 = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei4) });
const postC = [];
const ana2 = mitCharakter(spiel5, 'Ana', (m) => postC.push(m));
pruefe(ana2.inventar.gold === 20 && spiel5.gruppe().rissstein === 1, `nach dem Neustart: Ana hat noch 20 Gold, die Gruppe den Rissstein (${JSON.stringify(ana2.inventar)}, ${JSON.stringify(spiel5.gruppe())})`);
pruefe(spiel5.gebiete.get('hoehle').welt.geoeffnet.has('hoehle_tuer') && spiel5.zustaende().tempel_geschlossen, 'nach dem Neustart: Tür offen, Riss geschlossen');
spiel5.wechseln(ana2, 'wald', 'von_hoehle');
const wechsel5 = postC.find((m) => m.t === 'gebiet');
pruefe(wechsel5?.offen.includes('oberwelt_gold'), 'nach dem Neustart steht die Truhe oben noch offen');

// --- Klassen und Spezies ---
const spiel6 = new Spiel(karten, werteWald, { jetzt: () => uhr });
const wald6 = spiel6.gebiete.get('wald');
const post6 = [];
const neuer = spiel6.beitreten('Wahl', (m) => post6.push(m));
const anderer = mitCharakter(spiel6, 'Zeuge', () => {});
spiel6.nachricht(anderer.id, { t: 'bereit' });
pruefe(neuer.waehlt && post6[0].charakter === null && Object.keys(post6[0].auswahl.klassen).length === 5,
  `ohne Spielstand: erst Klasse wählen (${Object.keys(post6[0].auswahl.klassen).join(', ')})`);
spiel6.takt(0.05);
pruefe(!wald6.stand(uhr).spieler.some((x) => x.id === neuer.id), 'wer noch wählt, ist für die anderen nicht da');
spiel6.nachricht(neuer.id, { t: 'charakter', klasse: 'drache', spezies: 'mensch' });
pruefe(neuer.waehlt, 'eine Klasse, die es nicht gibt, wird nicht angenommen');
spiel6.nachricht(neuer.id, { t: 'charakter', klasse: 'magier', spezies: 'zwerg' });
const wahl = post6.find((m) => m.t === 'charakter');
pruefe(!neuer.waehlt && wahl?.werte.maxLeben === 9 && neuer.leben === 9 && wahl.werte.attribute.konstitution === 16,
  `Zwergen-Magier: KON 14+2 = ${wahl?.werte.attribute.konstitution}, ${wahl?.werte.maxLeben} halbe Herzen`);
spiel6.nachricht(neuer.id, { t: 'charakter', klasse: 'kaempfer', spezies: 'elf' });
pruefe(neuer.klasse === 'magier', 'wer gewählt hat, kann nicht nachträglich umwählen');

// Schwertschaden aus der Stärke: Kämpfer (STÄ 16) trifft mit 2, Magier mit 1.
const schleim6 = wald6.gegner[0];
const hauen = (wer) => {
  Object.assign(schleim6, { tot: false, leben: 2, vx: 0, vy: 0, getroffenBis: 0, x: wer.x, y: wer.y + 20, stossBis: uhr + 1e6 });
  wer.naechsterHieb = 0;
  uhr += 400;
  spiel6.nachricht(wer.id, { t: 'hieb', r: 'unten' });
  return schleim6.leben;
};
pruefe(hauen(anderer) <= 0, `Kämpfer besiegt einen Schleim mit einem Hieb (Schaden ${anderer.werte.schaden})`);
pruefe(hauen(neuer) === 1, `Magier braucht zwei Hiebe (Schaden ${neuer.werte.schaden})`);

// Feuerball: fliegt, trifft den Schleim drei Kacheln weiter, mit Schaden 3.
Object.assign(schleim6, { tot: false, leben: 3, vx: 0, vy: 0, getroffenBis: 0, x: neuer.x + 96, y: neuer.y, stossBis: uhr + 1e6 });
spiel6.nachricht(neuer.id, { t: 'bereit' });
// Nach rechts: unter dem Magier steht drei Kacheln weiter ein Baum.
spiel6.nachricht(neuer.id, { t: 'faehigkeit', r: 'rechts' });
const flug = wald6.geschosse.size;
spiel6.nachricht(neuer.id, { t: 'faehigkeit', r: 'rechts' });
pruefe(flug === 1 && wald6.geschosse.size === 1, 'Feuerball fliegt; ein zweiter sofort danach nicht (Abklingzeit)');
for (let i = 0; i < 20 && wald6.geschosse.size; i++) { uhr += 50; spiel6.schritt(0.05); }
pruefe(schleim6.tot, `der Feuerball trifft den Schleim drei Kacheln weiter (Leben ${schleim6.leben})`);

// Kleriker heilt, wer in der Nähe steht — nicht den, der weit weg ist.
const kleriker = mitCharakter(spiel6, 'Heiler', () => {}, 'kleriker', 'mensch');
spiel6.nachricht(kleriker.id, { t: 'bereit' });
Object.assign(kleriker, { x: anderer.x + 30, y: anderer.y });
anderer.leben = 2;
neuer.leben = 2;
Object.assign(neuer, { x: anderer.x + 300, y: anderer.y });
spiel6.nachricht(kleriker.id, { t: 'faehigkeit', r: 'links' });
pruefe(anderer.leben === 2 + kleriker.werte.faehigkeit.staerke && neuer.leben === 2,
  `Heilendes Wort: nah ${anderer.leben}, fern ${neuer.leben} halbe Herzen`);

// Kämpfer: Schildstoß schiebt die eigene Figur nach vorn und trifft, wer dort steht.
const post7 = [];
const kaempfer = mitCharakter(spiel6, 'Schild', (m) => post7.push(m));
spiel6.nachricht(kaempfer.id, { t: 'bereit' });
Object.assign(schleim6, { tot: false, leben: 2, vx: 0, vy: 0, getroffenBis: 0, x: kaempfer.x, y: kaempfer.y + 40, stossBis: uhr + 1e6 });
spiel6.nachricht(kaempfer.id, { t: 'faehigkeit', r: 'unten' });
pruefe(post7.some((m) => m.t === 'stoss' && m.vy > 0) && schleim6.leben <= 0, 'Schildstoß: Schub nach vorn, der Schleim davor ist besiegt');

// Schurke knackt die Tür in der Höhle ohne Schlüssel; Magier liest Runen.
const spiel8 = new Spiel(karten, werteWald, { jetzt: () => uhr });
const post8 = [];
const schurke = mitCharakter(spiel8, 'Dieb', (m) => post8.push(m), 'schurke', 'halbling');
spiel8.wechseln(schurke, 'hoehle', 'von_oben');
Object.assign(schurke, { x: 20 * 32 + 16, y: 5 * 32 + 24 });
uhr += 300;
spiel8.nachricht(schurke.id, { t: 'ansprechen', r: 'rechts' });
pruefe(spiel8.gebiete.get('hoehle').welt.geoeffnet.has('hoehle_tuer') && !spiel8.gruppe().schluessel, 'der Schurke knackt die Tür — ohne Schlüssel');
const lesen = (klasse) => {
  const p = [];
  const x = mitCharakter(spiel8, `Leser${klasse}`, (m) => p.push(m), klasse, 'mensch');
  spiel8.wechseln(x, 'tempel', 'von_riftside');
  Object.assign(x, { x: 9 * 32 + 16, y: 8 * 32 + 24 });
  uhr += 300;
  spiel8.nachricht(x.id, { t: 'ansprechen', r: 'links' });
  spiel8.verlassen(x.id);
  return p.find((m) => m.t === 'dialog')?.seiten[0] ?? '';
};
const magierLiest = lesen('magier'), kaempferLiest = lesen('kaempfer');
pruefe(magierLiest.startsWith('Eine Inschrift') && kaempferLiest.startsWith('Fremde'), `Runen: Magier liest „${magierLiest.slice(0, 20)}…", Kämpfer „${kaempferLiest.slice(0, 20)}…"`);

// Klasse und Spezies stehen im Spielstand.
const datei9 = join(mkdtempSync(join(tmpdir(), 'spielstand-')), 'stand.json');
const spiel9 = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei9) });
const p9 = [];
const elfe = spiel9.beitreten('Elfe', () => {});
spiel9.nachricht(elfe.id, { t: 'charakter', klasse: 'waldlaeufer', spezies: 'elf' });
spiel9.verlassen(elfe.id);
const spiel10 = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei9) });
const elfe2 = spiel10.beitreten('Elfe', (m) => p9.push(m));
pruefe(!elfe2.waehlt && elfe2.klasse === 'waldlaeufer' && p9[0].charakter?.spezies === 'elf', 'nach dem Neustart: Elfen-Waldläuferin, ohne neu zu wählen');
// Wer mit Klasse aus dem Spielstand kommt, wählt nicht — die Schonfrist bis
// „bereit" muss dann schon beim Beitreten gelten (die Wahl setzt sie sonst).
const schleim10 = spiel10.gebiete.get(elfe2.gebiet).gegner[0];
for (let i = 0; i < 80; i++) {
  Object.assign(schleim10, { tot: false, x: elfe2.x, y: elfe2.y + 4, vx: 0, vy: 0, stossBis: uhr + 1e6 });
  uhr += 50;
  spiel10.schritt(0.05);
}
pruefe(elfe2.leben === elfe2.werte.maxLeben, `wiederkehrend, noch nicht bereit: 4 s neben dem Schleim ohne Schaden (${elfe2.leben} Leben)`);

// ---------- Inventar, Ausrüstung, Laden ----------
const laden = new Spiel(karten, werte, { jetzt: () => uhr });
const markt = laden.gebiete.get('riftside');
const kraemerin = markt.welt.dinge.find((d) => d.eig.laden === 'kraemerin');
pruefe(!!kraemerin, 'die Krämerin steht in Riftside');
const vorDerKraemerin = (x) => Object.assign(x, { x: kraemerin.x - 32 + 4, y: Math.floor(kraemerin.y / 32) * 32 + 24, richtung: 'rechts' });
const pk = [];
const kunde = mitCharakter(laden, 'Kunde', (m) => pk.push(m), 'kaempfer', 'mensch');
laden.nachricht(kunde.id, { t: 'bereit' });
kunde.inventar.gold = 100;
vorDerKraemerin(kunde);
laden.nachricht(kunde.id, { t: 'ansprechen', r: 'rechts' });
const angebot = pk.find((m) => m.t === 'laden');
pruefe(angebot?.waren.heiltrank === 12 && angebot.waren.langschwert === 40, `Laden öffnet: Heiltrank ${angebot?.waren.heiltrank}, Langschwert ${angebot?.waren.langschwert} Gold`);
// Charisma: ein Halbling-Schurke (CHA 14+1, Mod. +2) zahlt 10 % weniger.
const pk2 = [];
const feilscher = mitCharakter(laden, 'Feilscher', (m) => pk2.push(m), 'schurke', 'halbling');
vorDerKraemerin(feilscher);
uhr += 300;
laden.nachricht(feilscher.id, { t: 'ansprechen', r: 'rechts' });
const angebot2 = pk2.find((m) => m.t === 'laden');
pruefe(angebot2?.waren.langschwert === 36 && angebot2.ankauf.langschwert > angebot.ankauf.langschwert,
  `Charisma: der Halbling zahlt ${angebot2?.waren.langschwert} statt 40 und bekommt ${angebot2?.ankauf.langschwert} statt ${angebot?.ankauf.langschwert}`);

const schadenVorher = kunde.werte.schaden;
laden.nachricht(kunde.id, { t: 'kaufen', art: 'langschwert' });
pruefe(kunde.inventar.gold === 60 && kunde.inventar.langschwert === 1, `Langschwert gekauft (Gold ${kunde.inventar.gold})`);
laden.nachricht(kunde.id, { t: 'anlegen', art: 'langschwert' });
pruefe(kunde.ausruestung.waffe === 'langschwert' && !kunde.inventar.langschwert && kunde.werte.schaden === schadenVorher + 1,
  `angelegt: Schwertschaden ${schadenVorher} → ${kunde.werte.schaden}, nicht mehr im Rucksack`);
const meldungInventar = pk.filter((m) => m.t === 'inventar').at(-1);
pruefe(meldungInventar?.ausruestung.waffe === 'langschwert' && meldungInventar.werte.schaden === kunde.werte.schaden, 'der Browser bekommt Ausrüstung und neue Werte');

// Klassen-Beschränkung: der Schurke darf kein Kettenhemd tragen.
feilscher.inventar.kettenhemd = 1;
laden.nachricht(feilscher.id, { t: 'anlegen', art: 'kettenhemd' });
pruefe(!feilscher.ausruestung.ruestung && feilscher.inventar.kettenhemd === 1, 'Schurke kann kein Kettenhemd anlegen');

// Kettenhemd: ein Herz mehr, etwas langsamer; ablegen nimmt das Herz wieder.
const ohneHemd = { max: kunde.werte.maxLeben, tempo: kunde.werte.tempo };
kunde.inventar.kettenhemd = 1;
laden.nachricht(kunde.id, { t: 'anlegen', art: 'kettenhemd' });
pruefe(kunde.werte.maxLeben === ohneHemd.max + 2 && kunde.werte.tempo === ohneHemd.tempo - 6, `Kettenhemd: ${ohneHemd.max} → ${kunde.werte.maxLeben} halbe Herzen, Tempo ${ohneHemd.tempo} → ${kunde.werte.tempo}`);
kunde.leben = kunde.werte.maxLeben;
laden.nachricht(kunde.id, { t: 'ablegen', platz: 'ruestung' });
pruefe(!kunde.ausruestung.ruestung && kunde.inventar.kettenhemd === 1 && kunde.leben === ohneHemd.max, `abgelegt: Leben wieder höchstens ${ohneHemd.max} (${kunde.leben})`);
// Das Tempo des Spielers prüft der Server nach den neuen Werten.
pruefe(kunde.werte.tempo === ohneHemd.tempo, 'ohne Kettenhemd wieder das alte Tempo');

// Heiltrank: bei vollem Leben nicht, verletzt schon.
laden.nachricht(kunde.id, { t: 'kaufen', art: 'heiltrank' });
laden.nachricht(kunde.id, { t: 'benutzen', art: 'heiltrank' });
pruefe(kunde.inventar.heiltrank === 1, 'Heiltrank bei vollem Leben wird nicht verbraucht');
kunde.leben = 2;
laden.nachricht(kunde.id, { t: 'benutzen', art: 'heiltrank' });
pruefe(!kunde.inventar.heiltrank && kunde.leben === 6, `Heiltrank: 2 → ${kunde.leben} Leben`);

// Verkaufen: halber Preis; Schlüssel gehören der Gruppe und sind unverkäuflich.
const goldVorher = kunde.inventar.gold;
laden.nachricht(kunde.id, { t: 'verkaufen', art: 'kettenhemd' });
pruefe(kunde.inventar.gold === goldVorher + 25 && !kunde.inventar.kettenhemd, `Kettenhemd für ${kunde.inventar.gold - goldVorher} Gold verkauft`);
kunde.inventar.schluessel = 1;
laden.nachricht(kunde.id, { t: 'verkaufen', art: 'schluessel' });
pruefe(kunde.inventar.schluessel === 1, 'einen Schlüssel kauft niemand');
delete kunde.inventar.schluessel;

// Weggegangen: kein Handel mehr.
kunde.x += 200;
laden.nachricht(kunde.id, { t: 'kaufen', art: 'heiltrank' });
pruefe(!kunde.inventar.heiltrank, 'wer nicht mehr vor der Krämerin steht, kauft nichts');
laden.nachricht(kunde.id, { t: 'kaufen', art: 'gibtsnicht' });
laden.nachricht(kunde.id, { t: 'anlegen', art: '__proto__' });
pruefe(!kunde.ausruestung.__proto__?.length, 'Unsinn wird ignoriert');

// Rucksack voll (hier 2 Plätze): kein Kauf, und die Truhe bleibt zu.
const knapp = { ...werte, inventar: { plaetze: 2 } };
const karteRing = JSON.parse(JSON.stringify(karten.riftside));
const truheRing = karteRing.layers.find((l) => l.objects).objects.find((o) => o.properties?.some((p) => p.value === 'riftside_gold'));
truheRing.properties.find((p) => p.name === 'inhalt').value = 'flinkring';
const voll = new Spiel({ ...karten, riftside: karteRing }, knapp, { jetzt: () => uhr });
const pv = [];
const packer = mitCharakter(voll, 'Packer', (m) => pv.push(m));
Object.assign(packer.inventar, { gold: 100, heiltrank: 2, lederruestung: 1 });
vorDerKraemerin(packer);
voll.nachricht(packer.id, { t: 'ansprechen', r: 'rechts' });
voll.nachricht(packer.id, { t: 'kaufen', art: 'langschwert' });
voll.nachricht(packer.id, { t: 'kaufen', art: 'heiltrank' });
pruefe(!packer.inventar.langschwert && packer.inventar.heiltrank === 3, `voller Rucksack: kein neues Ding, aber mehr vom selben (Heiltränke ${packer.inventar.heiltrank})`);
const truhe = voll.gebiete.get('riftside').welt.dinge.find((d) => d.schluessel === 'riftside_gold');
Object.assign(packer, { x: truhe.x, y: Math.floor(truhe.y / 32) * 32 + 32 + 12, richtung: 'oben' });
uhr += 300;
voll.nachricht(packer.id, { t: 'ansprechen', r: 'oben' });
pruefe(!voll.gebiete.get('riftside').istOffen(truhe) && pv.some((m) => m.t === 'dialog' && m.seiten[0].includes('voll')),
  'volle Truhe bei vollem Rucksack: bleibt zu, mit Begründung');

// Beute: ein besiegter Schleim gibt Gold.
const spiel13 = new Spiel(karten, werteWald, { jetzt: () => uhr });
const jaeger = mitCharakter(spiel13, 'Jäger', () => {});
spiel13.nachricht(jaeger.id, { t: 'bereit' });
const schleim13 = spiel13.gebiete.get('wald').gegner[0];
Object.assign(schleim13, { vx: 0, vy: 0, tot: false, leben: 2, getroffenBis: 0, x: jaeger.x, y: jaeger.y + 20, stossBis: uhr + 1e6 });
uhr += 400;
spiel13.nachricht(jaeger.id, { t: 'hieb', r: 'unten' });
pruefe(schleim13.tot && jaeger.inventar.gold >= 1 && jaeger.inventar.gold <= 3, `besiegter Schleim gibt ${jaeger.inventar.gold} Gold`);

// Ausrüstung im Spielstand: nach dem Neustart noch angelegt, Werte stimmen.
const datei11 = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const spiel11 = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei11) });
const ritter = mitCharakter(spiel11, 'Ritter', () => {});
ritter.inventar.langschwert = 1;
spiel11.nachricht(ritter.id, { t: 'anlegen', art: 'langschwert' });
const schaden11 = ritter.werte.schaden;
spiel11.verlassen(ritter.id);
const spiel12 = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei11) });
const ritter2 = spiel12.beitreten('Ritter', () => {});
pruefe(ritter2.ausruestung.waffe === 'langschwert' && ritter2.werte.schaden === schaden11, `nach dem Neustart: Langschwert angelegt, Schaden ${ritter2.werte.schaden}`);

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
