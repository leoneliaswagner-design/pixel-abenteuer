// Die Regeln des Servers ohne Browser und ohne Netz, mit eigener Uhr.
//   node pruefstand/server-regeln.mjs
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Spiel as EchtesSpiel } from '../server/spiel.js';

// Ohne Glück: kein Abprallen, Ausweichen oder kritischer Treffer, außer ein
// Prüfblock gibt seinen eigenen Zufall vor (der Krieger prallte sonst in jedem
// zehnten Lauf an einem Schleim ab, und eine Prüfung fiel aus).
class Spiel extends EchtesSpiel {
  constructor(karten, werte, optionen = {}) {
    super(karten, werte, { zufall: () => 0.99, ...optionen });
  }
}
import { Spielstand } from '../server/spielstand.js';
import { naechster } from '../server/gebiet.js';
import { bewege } from '../gemeinsam/welt.js';
import { ZUSATZDATEN, kaufpreis, stufeFuer, verkaufspreis, werteBerechnen } from '../gemeinsam/regeln.js';

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

// --- Der Riss in der Fischergasse führt in den Tempel; das Idol schließt ihn ---
// Riss auf Kachel (34,15) in Riftside = y 480…512; davor die Gasse.
const riftside = spiel4.gebiete.get('riftside');
const riss = riftside.uebergaenge.find((u) => u.eig.ziel === 'tempel');
const vorRiss = { x: 34 * 32 + 16, y: 16 * 32 + 24 };
const inRiss = 15 * 32 + 30;
spiel4.wechseln(bo, 'riftside', 'aus_tempel');
// Erst ein Treffer: im Rückstoß geht niemand hindurch.
Object.assign(bo, { ...vorRiss, unverwundbarBis: 0 });
const schleim = { x: bo.x, y: bo.y - 20, w: werte.monster.schleim };
spiel4.spielerTreffen(bo, schleim, uhr);
uhr += 100;
spiel4.nachricht(bo.id, { t: 'pos', x: bo.x, y: inRiss, r: 'oben', k: bo.korrektur });
pruefe(bo.gebiet === 'riftside', 'im Rückstoß in den Riss gedrückt: kein Gebietswechsel');
Object.assign(bo, { ...vorRiss, leben: 6 });
uhr += 500;
spiel4.nachricht(bo.id, { t: 'pos', x: bo.x, y: inRiss, r: 'oben', k: bo.korrektur });
pruefe(bo.gebiet === 'tempel', `durch den Riss in der Fischergasse: Bo ist im Tempel (${bo.gebiet}) — Riss nach ${riss?.eig.ziel}`);
postA.length = 0;
sprich(bo, 10 * 32 + 16, 5 * 32 + 16, 'oben');
pruefe(spiel4.gruppe().idol === 1 && spiel4.zustaende().tempel_geschlossen && spiel4.zustaende().idol_genommen, `Idol genommen: „idol_genommen" und „tempel_geschlossen" gesetzt`);
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
pruefe(ana2.inventar.gold === 20 && spiel5.gruppe().idol === 1, `nach dem Neustart: Ana hat noch 20 Gold, die Gruppe das Idol (${JSON.stringify(ana2.inventar)}, ${JSON.stringify(spiel5.gruppe())})`);
pruefe(spiel5.gebiete.get('hoehle').welt.geoeffnet.has('hoehle_tuer') && spiel5.zustaende().tempel_geschlossen, 'nach dem Neustart: Tür offen, Riss geschlossen');
{
  // Das Idol war schon weg: die Kugel liegt gleich unten und versperrt ihre Kacheln.
  const t5 = spiel5.gebiete.get('tempel'), kg = t5.fallen.kugel;
  pruefe(kg.z === 'liegt' && t5.welt.istFest(10, 27) && t5.welt.istFest(9, 26) && !t5.welt.istFest(10, 24), `nach dem Neustart liegt die Kugel in der Vorhalle (${kg.z})`);
}
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
pruefe(neuer.waehlt && post6[0].charakter === null && Object.keys(post6[0].auswahl.klassen).length === Object.keys(werte.klassen).length,
  `ohne Spielstand: erst Klasse wählen (${Object.keys(post6[0].auswahl.klassen).join(', ')})`);
spiel6.takt(0.05);
pruefe(!wald6.stand(uhr).spieler.some((x) => x.id === neuer.id), 'wer noch wählt, ist für die anderen nicht da');
spiel6.nachricht(neuer.id, { t: 'charakter', klasse: 'drache', spezies: 'mensch' });
pruefe(neuer.waehlt, 'eine Klasse, die es nicht gibt, wird nicht angenommen');
spiel6.nachricht(neuer.id, { t: 'charakter', klasse: 'gelehrter', spezies: 'zwerg' });
const wahl = post6.find((m) => m.t === 'charakter');
pruefe(!neuer.waehlt && wahl?.werte.maxLeben === 8 && neuer.leben === 8 && wahl.werte.attribute.konstitution === 14,
  `Zwergen-Gelehrter: KON 12+2 = ${wahl?.werte.attribute.konstitution}, ${wahl?.werte.maxLeben} halbe Herzen`);
spiel6.nachricht(neuer.id, { t: 'charakter', klasse: 'kaempfer', spezies: 'elf' });
pruefe(neuer.klasse === 'gelehrter', 'wer gewählt hat, kann nicht nachträglich umwählen');

// Schwertschaden aus der Stärke: Kämpfer (STÄ 16) trifft mit 2, Gelehrter mit 1.
const schleim6 = wald6.gegner[0];
const hauen = (wer) => {
  Object.assign(schleim6, { tot: false, leben: 2, vx: 0, vy: 0, getroffenBis: 0, x: wer.x, y: wer.y + 20, stossBis: uhr + 1e6 });
  wer.naechsterHieb = 0;
  uhr += 400;
  spiel6.nachricht(wer.id, { t: 'hieb', r: 'unten' });
  return schleim6.leben;
};
pruefe(hauen(anderer) <= 0, `Kämpfer besiegt einen Schleim mit einem Hieb (Schaden ${anderer.werte.schaden})`);
pruefe(hauen(neuer) === 1, `Gelehrter braucht zwei Hiebe (Schaden ${neuer.werte.schaden})`);

// Armbrustbolzen: fliegt, trifft den Schleim drei Kacheln weiter, mit seinem ganzen Schaden.
Object.assign(schleim6, { tot: false, leben: neuer.werte.faehigkeit.staerke, vx: 0, vy: 0, getroffenBis: 0, x: neuer.x + 96, y: neuer.y, stossBis: uhr + 1e6 });
spiel6.nachricht(neuer.id, { t: 'bereit' });
// Nach rechts: unter dem Gelehrten steht drei Kacheln weiter ein Baum.
spiel6.nachricht(neuer.id, { t: 'faehigkeit', r: 'rechts' });
const flug = wald6.geschosse.size;
spiel6.nachricht(neuer.id, { t: 'faehigkeit', r: 'rechts' });
pruefe(flug === 1 && wald6.geschosse.size === 1, 'Armbrustbolzen fliegt; ein zweiter sofort danach nicht (Abklingzeit)');
for (let i = 0; i < 20 && wald6.geschosse.size; i++) { uhr += 50; spiel6.schritt(0.05); }
pruefe(schleim6.tot, `der Bolzen trifft den Schleim drei Kacheln weiter (Leben ${schleim6.leben})`);

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

// Schurke knackt die Tür in der Höhle ohne Schlüssel; Gelehrter liest Runen.
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
  Object.assign(x, { x: 9 * 32 + 16, y: 7 * 32 + 24 });
  uhr += 300;
  spiel8.nachricht(x.id, { t: 'ansprechen', r: 'links' });
  spiel8.verlassen(x.id);
  return p.find((m) => m.t === 'dialog')?.seiten[0] ?? '';
};
const gelehrterLiest = lesen('gelehrter'), kaempferLiest = lesen('kaempfer');
pruefe(gelehrterLiest.startsWith('Eine Inschrift') && kaempferLiest.startsWith('Fremde'), `Runen: Gelehrter liest „${gelehrterLiest.slice(0, 20)}…", Kämpfer „${kaempferLiest.slice(0, 20)}…"`);

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

// ---------- Monster (monster.json) im tiefen Wald ----------
const tief = karten.tiefwald;
const tiefSpiel = new Spiel(karten, werteWald, { jetzt: () => uhr });
const tiefwald = tiefSpiel.gebiete.get('tiefwald');
const arten = tiefwald.gegner.map((g) => g.art);
pruefe(['riesenratte', 'wolf', 'goblin', 'skelett', 'riesenfledermaus'].every((a) => arten.includes(a)) && !arten.includes('schleim'),
  `tiefer Wald: ${arten.length} Monster (${[...new Set(arten)].join(', ')})`);
pruefe(tiefwald.gegner.find((g) => g.art === 'skelett').leben === 4, 'Monster bekommen ihre Werte aus monster.json (Skelett: 4 Leben)');

// Eine Arena: ein Spieler links in Zeile 9, alle Monster weg bis auf eins.
const K = 32, zeile9 = 9 * K + 24;
const arena = (art, abstand) => {
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr });
  const p = [];
  const s = mitCharakter(sp, 'Held', (m) => p.push(m), 'gelehrter', 'mensch');
  sp.wechseln(s, 'tiefwald', 'vom_inselwald');
  Object.assign(s, { x: 2 * K + 16, y: zeile9, unverwundbarBis: 0 });
  const gebiet = sp.gebiete.get('tiefwald');
  for (const g of gebiet.gegner) Object.assign(g, { tot: true, wiederBei: uhr + 1e9 });
  const m = gebiet.gegner.find((g) => g.art === art);
  Object.assign(m, { tot: false, x: s.x + abstand, y: zeile9, stossBis: 0, phase: null });
  const lauf = (ms, nachJedem) => {
    for (let t = 0; t < ms; t += 50) {
      uhr += 50;
      sp.schritt(0.05);
      nachJedem?.();
    }
  };
  return { sp, s, m, p, gebiet, lauf };
};

// Ratte: schneller als ein Schleim.
{
  const { s, m, lauf } = arena('riesenratte', 110);
  s.unverwundbarBis = uhr + 1e6;
  const x0 = m.x;
  lauf(500);
  const tempo = (x0 - m.x) / 0.5;
  pruefe(tempo > werte.monster.schleim.jagdGeschwindigkeit + 10, `Riesenratte jagt mit ${tempo.toFixed(0)} px/s (Schleim ${werte.monster.schleim.jagdGeschwindigkeit})`);
}
// Goblin: hält Abstand, schießt, und der Pfeil trifft.
{
  const { s, m, p, gebiet, lauf } = arena('goblin', 120);
  let naechster = Infinity, pfeile = 0;
  const leben0 = s.leben;
  lauf(400, () => (naechster = Math.min(naechster, Math.hypot(m.x - s.x, m.y - s.y))));
  const frueh = gebiet.geschosse.size;
  lauf(2600, () => {
    naechster = Math.min(naechster, Math.hypot(m.x - s.x, m.y - s.y));
    pfeile = Math.max(pfeile, [...gebiet.geschosse.values()].filter((g) => g.feind).length);
  });
  pruefe(frueh === 0, 'Goblin schießt nicht im ersten Augenblick');
  pruefe(pfeile >= 1 && s.leben < leben0 && p.some((x) => x.t === 'getroffen'), `Goblin-Pfeil trifft: ${leben0} → ${s.leben} Leben`);
  pruefe(naechster > 80, `Goblin bleibt auf Abstand (nie näher als ${naechster.toFixed(0)} px)`);
  Object.assign(m, { x: s.x + 40, stossBis: 0 });
  const d0 = Math.hypot(m.x - s.x, m.y - s.y);
  s.unverwundbarBis = uhr + 1e6;
  lauf(500);
  pruefe(Math.hypot(m.x - s.x, m.y - s.y) > d0 + 10, `zu nah: der Goblin weicht zurück (${d0.toFixed(0)} → ${Math.hypot(m.x - s.x, m.y - s.y).toFixed(0)} px)`);
}
// Wolf: duckt sich erst (steht still), dann springt er schnell.
{
  const { s, m, lauf } = arena('wolf', 80);
  s.unverwundbarBis = uhr + 1e6;
  const x0 = m.x;
  lauf(50);
  const geduckt = m.phase === 'laden';
  lauf(350);
  const still = Math.abs(m.x - x0);
  const x1 = m.x;
  lauf(250);
  pruefe(geduckt && still < 1 && x1 - m.x > 40, `Wolf: duckt sich (${still.toFixed(1)} px bewegt), springt dann ${(x1 - m.x).toFixed(0)} px in 0,25 s`);
}
// Skelett: zäh (4 Treffer mit Schaden 1) und haut doppelt zu.
{
  const { s, m, sp, lauf } = arena('skelett', 22);
  const leben0 = s.leben;
  lauf(300);
  pruefe(leben0 - s.leben === 2, `Skelett trifft mit 2 (${leben0} → ${s.leben})`);
  let hiebe = 0;
  s.unverwundbarBis = uhr + 1e6;
  while (!m.tot && hiebe < 8) {
    Object.assign(m, { x: s.x + 20, y: s.y, getroffenBis: 0 });
    s.richtung = 'rechts';
    s.naechsterHieb = 0;
    sp.nachricht(s.id, { t: 'hieb', r: 'rechts' });
    hiebe++;
  }
  pruefe(m.tot && hiebe === 4, `Gelehrter braucht ${hiebe} Hiebe für das Skelett`);
}
// Fledermaus: fliegt nicht gerade, sondern im Zickzack.
{
  const { s, m, lauf } = arena('riesenfledermaus', 130);
  s.unverwundbarBis = uhr + 1e6;
  let quer = 0;
  lauf(1200, () => (quer = Math.max(quer, Math.abs(m.y - zeile9))));
  pruefe(quer > 6, `Riesenfledermaus weicht ${quer.toFixed(0)} px von der geraden Linie ab`);
}
// Eine Art, die es nicht gibt, fällt beim Start auf.
{
  const kaputt = JSON.parse(JSON.stringify(tief));
  kaputt.layers.find((l) => l.objects).objects.find((o) => o.name === 'gegner').properties[0].value = 'drache';
  let f = '';
  try {
    new Spiel({ ...karten, tiefwald: kaputt }, werteWald);
  } catch (e) {
    f = e.message;
  }
  pruefe(f.includes('drache'), `unbekanntes Monster wird gemeldet („${f}")`);
}

// ---------- Weltkarte (welt.json) ----------
{
  const wk = new Spiel(karten, werte, { jetzt: () => uhr });
  const pw = [];
  const a = mitCharakter(wk, 'Karla', (m) => pw.push(m));
  const b = mitCharakter(wk, 'Bodo', () => {});
  const start = werte.welt.gebiete.riftside.region;
  pruefe(wk.entdeckt().length === 1 && wk.entdeckt()[0] === start && werte.welt.regionen[start].name === 'Startinsel',
    `beim ersten Beitreten entdeckt: ${wk.entdeckt().map((r) => werte.welt.regionen[r].name).join(', ')}`);
  wk.wechseln(b, 'tempel', 'von_riftside');
  pruefe(wk.entdeckt().length === 1, 'ein Riss deckt nichts auf der Weltkarte auf');
  pw.length = 0;
  wk.nachricht(a.id, { t: 'weltkarte' });
  const antwort = pw.find((m) => m.t === 'weltkarte');
  pruefe(antwort?.spieler.length === 2 && antwort.spieler.find((x) => x.name === 'Bodo')?.gebiet === 'tempel',
    `Weltkarte: alle Spieler mit Gebiet (${antwort?.spieler.map((x) => `${x.name}@${x.gebiet}`).join(', ')})`);
  // Ein Gebiet, das auf der Weltkarte fehlt, fällt beim Start auf.
  const ohne = { ...werte, welt: { ...werte.welt, gebiete: { ...werte.welt.gebiete } } };
  delete ohne.welt.gebiete.tiefwald;
  let f = '';
  try {
    new Spiel(karten, ohne);
  } catch (e) {
    f = e.message;
  }
  pruefe(f.includes('tiefwald') && f.includes('Weltkarte'), `fehlendes Gebiet wird gemeldet („${f.slice(0, 60)}…")`);
  // Eine neue Region wird für alle aufgedeckt und gemeldet.
  const pb = [];
  const c = mitCharakter(wk, 'Cleo', (m) => pb.push(m));
  const welt2 = { ...werte.welt.gebiete.tiefwald };
  werte.welt.gebiete.tiefwald = { region: 'nordwesten', punkt: [200, 200] };
  wk.wechseln(c, 'tiefwald', 'vom_inselwald');
  werte.welt.gebiete.tiefwald = welt2;
  pruefe(wk.entdeckt().includes('nordwesten') && pb.some((m) => m.t === 'entdeckt' && m.region === 'nordwesten') && pw.some((m) => m.t === 'nachricht' && m.text.includes('Nordwest')),
    'neue Region: aufgedeckt, alle bekommen es mit');
}

// ---------- Das Meer ----------
{
  const see = new Spiel(karten, werte, { jetzt: () => uhr });
  const ps = [];
  const kapitaen = mitCharakter(see, 'Kapitän', (m) => ps.push(m));
  see.nachricht(kapitaen.id, { t: 'bereit' });
  // Vom Steg in Riftside nach unten laufen, bis man im Boot sitzt.
  const steg = see.gebiete.get('riftside').ankuenfte.get('vom_meer');
  Object.assign(kapitaen, { gebiet: 'riftside', x: steg.x, y: steg.y + 8, budget: 0, zuletzt: uhr });
  for (let i = 0; i < 40 && kapitaen.gebiet === 'riftside'; i++) {
    uhr += 50;
    see.nachricht(kapitaen.id, { t: 'pos', x: kapitaen.x, y: kapitaen.y + 4, r: 'unten', l: true, k: kapitaen.korrektur });
  }
  const meer = see.gebiete.get('meer');
  pruefe(kapitaen.gebiet === 'meer' && meer.meer, `vom Steg aufs Meer (${kapitaen.gebiet}, Kachel ${Math.floor(kapitaen.x / 32)},${Math.floor(kapitaen.y / 32)})`);
  const w = meer.welt;
  const landKachel = w.boden.findIndex((g) => w.eig(g).name === 'land');
  const mitte = (i) => [(i % w.breite) * 32 + 16, Math.floor(i / w.breite) * 32 + 24];
  const draussen = meer.ankuenfte.get('hafen_riftside');
  pruefe(!w.frei(...mitte(landKachel)) && w.frei(draussen.x, draussen.y + 8) && w.eig(w.boden[w.index(Math.floor(draussen.x / 32), Math.floor(draussen.y / 32))]).name === 'see',
    'auf dem Meer: Land ist fest, die See vor dem Hafen befahrbar');
  // Auf See kein Schwert.
  const vorher = kapitaen.naechsterHieb;
  ps.length = 0;
  uhr += 1000;
  see.nachricht(kapitaen.id, { t: 'hieb', r: 'unten' });
  pruefe(kapitaen.naechsterHieb === vorher, 'im Boot kein Schwerthieb');
  // Sichten: nahe am Nordwest-Kontinent deckt er sich auf, weit weg nicht.
  const nw = werte.welt.regionen.nordwesten;
  pruefe(!see.entdeckt().includes('nordwesten'), 'Nordwest-Kontinent noch nicht entdeckt');
  // Hingesetzt, dann eine kleine echte Bewegung — wie beim Rudern.
  Object.assign(kapitaen, { x: (nw.box[2] / 4 + 5) * 32, y: (nw.mitte[1] / 4) * 32, budget: 40, zuletzt: uhr, zuletztGesichtet: 0 });
  uhr += 50;
  see.nachricht(kapitaen.id, { t: 'pos', x: kapitaen.x + 2, y: kapitaen.y, r: 'rechts', l: true, k: kapitaen.korrektur });
  pruefe(see.entdeckt().includes('nordwesten') && ps.some((m) => m.t === 'nachricht' && m.text.includes('Nordwest')), 'fünf Kacheln vor seiner Küste: Nordwest-Kontinent entdeckt');
  // Anlegen: von der Ankunft vor der Startinsel nach oben in den Anleger.
  const vorDemHafen = meer.ankuenfte.get('hafen_riftside');
  Object.assign(kapitaen, { x: vorDemHafen.x, y: vorDemHafen.y + 8, budget: 0, zuletzt: uhr });
  for (let i = 0; i < 40 && kapitaen.gebiet === 'meer'; i++) {
    uhr += 50;
    see.nachricht(kapitaen.id, { t: 'pos', x: kapitaen.x, y: kapitaen.y - 4, r: 'oben', l: true, k: kapitaen.korrektur });
  }
  pruefe(kapitaen.gebiet === 'riftside' && Math.abs(kapitaen.y - (steg.y + 8)) < 1, `angelegt: zurück am Steg von Riftside (${kapitaen.gebiet})`);
}

// ---------- Tageszeit ----------
{
  const tag = new Spiel(karten, werte, { jetzt: () => uhr });
  const z0 = tag.tageszeit();
  const halb = tag.tageszeit(uhr + werte.tag.dauer / 2);
  pruefe(Math.abs(z0 - werte.tag.beginn) < 0.001 && Math.abs(((halb - z0 + 1) % 1) - 0.5) < 0.001,
    `Tageszeit beginnt bei ${z0.toFixed(2)} und ist nach einem halben Tag bei ${halb.toFixed(2)}`);
  const pt = [];
  const t1 = mitCharakter(tag, 'Uhr', (m) => pt.push(m));
  tag.nachricht(t1.id, { t: 'bereit' });
  tag.takt(0.05);
  const st = pt.find((m) => m.t === 'stand');
  pruefe(Math.abs(pt[0].zeit - z0) < 0.001 && st && Math.abs(st.zeit - tag.tageszeit()) < 0.001, 'Willkommen und jeder Stand nennen die Tageszeit');
}

// ---------- Fallen und Steinkugel im Tempel ----------
{
  const sp = new Spiel(karten, werte, { jetzt: () => uhr });
  const ft = werte.fallen;
  const lauf = (ms, je) => {
    for (let t = 0; t < ms; t += 50) {
      uhr += 50;
      sp.schritt(0.05);
      je?.();
    }
  };
  const pt = [];
  const indy = mitCharakter(sp, 'Indy', (m) => pt.push(m));
  sp.wechseln(indy, 'tempel', 'von_riftside');
  const tempel = sp.gebiete.get('tempel');
  const f = tempel.fallen;
  pruefe(f.liste.filter((x) => x.art === 'stacheln').length === 6 && f.liste.filter((x) => x.art === 'pfeile').length === 3 && f.kugel?.z === 'ruht',
    `Tempel: ${f.liste.length} Fallen, Kugel ${f.kugel?.z}`);
  pruefe(tempel.welt.istFest(10, 1) && !tempel.welt.istFest(10, 27), 'die ruhende Kugel belegt ihre Nische, die Vorhalle ist frei');

  // Stacheln: oben tut es weh, unten nicht. Kachel (9,10) hat Versatz 0.
  const st = f.liste.find((x) => x.art === 'stacheln' && x.versatz === 0);
  const aufStacheln = () => Object.assign(indy, { x: st.x, y: st.y + 8, unverwundbarBis: 0, leben: 6, tot: false });
  uhr += ft.stacheln.periode - (uhr % ft.stacheln.periode) + ft.stacheln.oben + 50; // jetzt unten
  aufStacheln();
  lauf(50);
  const untenLeben = indy.leben;
  uhr += ft.stacheln.periode - (uhr % ft.stacheln.periode) + 50; // jetzt oben
  aufStacheln();
  lauf(50);
  pruefe(untenLeben === 6 && indy.leben === 6 - ft.stacheln.schaden, `Stacheln: unten ${6 - untenLeben}, oben ${6 - indy.leben} Schaden`);
  const stand = tempel.stand(uhr);
  pruefe(stand.fallen?.length === 9 && stand.fallen[f.liste.indexOf(st)] === 1, `der Stand nennt die Fallen (${stand.fallen?.join('')})`);

  // Druckplatte: Klick, kurz danach ein Pfeil aus der linken Wand.
  const platte = f.liste.find((x) => x.art === 'pfeile');
  Object.assign(indy, { x: platte.x, y: platte.y + 8, unverwundbarBis: 0, leben: 6 });
  pt.length = 0;
  lauf(50);
  const klick = pt.some((m) => m.t === 'falle' && m.art === 'klick');
  let pfeil = null;
  lauf(ft.pfeile.verzoegerung + 50, () => {
    const p = [...tempel.geschosse.values()].find((p) => p.von === 'falle');
    if (p && !pfeil) pfeil = { ...p };
  });
  lauf(800);
  pruefe(klick && pfeil && pfeil.x < 9 * 32 + 8 && pfeil.vx > 0 && indy.leben === 6 - ft.pfeile.schaden,
    `Druckplatte: Klick ${klick}, Pfeil aus der Wand bei x ${pfeil?.x.toFixed(0)}, trifft (${6 - indy.leben} Schaden)`);
  // Wer nach dem Klick weiterläuft, kommt davon.
  lauf(ft.pfeile.abklingzeit);
  Object.assign(indy, { x: platte.x, y: platte.y + 8, unverwundbarBis: 0, leben: 6 });
  lauf(50);
  indy.y += 40;
  lauf(800);
  pruefe(indy.leben === 6, `wer nach dem Klick weiterläuft, bleibt heil (${indy.leben})`);

  // Das Idol weckt die Kugel: erst Grollen, dann rollt sie den Gang hinab.
  Object.assign(indy, { x: 10 * 32 + 16, y: 5 * 32 + 16, unverwundbarBis: uhr + 1e6, leben: 6 });
  pt.length = 0;
  uhr += 300;
  sp.nachricht(indy.id, { t: 'ansprechen', r: 'oben' });
  pruefe(pt.some((m) => m.t === 'dialog' && m.seiten[0].includes('goldene Idol')) && pt.some((m) => m.t === 'truhe' && m.offen), 'Idol vom Sockel genommen');
  lauf(100);
  pruefe(f.kugel.z === 'grollt' && pt.some((m) => m.t === 'beben'), `die Kugel grollt (${f.kugel.z})`);
  lauf(ft.kugel.verzoegerung + 100);
  const y0 = f.kugel.y;
  lauf(1000);
  pruefe(f.kugel.z === 'rollt' && f.kugel.y > y0 && !tempel.welt.istFest(10, 1), `die Kugel rollt (${y0.toFixed(0)} → ${f.kugel.y.toFixed(0)})`);
  // Wer im Gang steht, wird überrollt.
  Object.assign(indy, { x: 10 * 32 + 16, y: f.kugel.y + 60, unverwundbarBis: 0, leben: 6 });
  lauf(1500);
  pruefe(indy.leben === 6 - ft.kugel.schaden, `überrollt: ${6 - indy.leben} Schaden`);
  // Unten bleibt sie liegen — mitten in der Vorhalle, der Weg zum Riss frei.
  Object.assign(indy, { x: 10 * 32 + 16, y: 27 * 32 + 24, unverwundbarBis: uhr + 1e6 });
  lauf(15000);
  pruefe(f.kugel.z === 'liegt' && tempel.welt.istFest(10, 27) && tempel.welt.istFest(11, 28), `die Kugel liegt (${f.kugel.z} bei y ${f.kugel.y})`);
  pruefe(tempel.welt.frei(indy.x, indy.y) && pt.some((m) => m.t === 'korrektur'), `wer, wo sie liegen bleibt, stand, wird zur Seite geschoben (${indy.x.toFixed(0)},${indy.y.toFixed(0)})`);
  pruefe(tempel.welt.frei(8 * 32 + 16, 25 * 32 + 24) && tempel.welt.frei(10 * 32 + 16, 32 * 32 + 24), 'um die Kugel herum geht es zum Riss');
}

// ---------- Akropolis: drei Platten öffnen das Tor, die Eule schließt den Riss ----------
{
  const datei = join(mkdtempSync(join(tmpdir(), 'spielstand-')), 'stand.json');
  let sp = new Spiel(karten, werte, { jetzt: () => uhr, spielstand: new Spielstand(datei) });
  const lauf = (ms) => {
    for (let t = 0; t < ms; t += 50) {
      uhr += 50;
      sp.schritt(0.05);
    }
  };
  const pa = [], pb = [];
  const ari = mitCharakter(sp, 'Ari', (m) => pa.push(m));
  const bea = mitCharakter(sp, 'Bea', (m) => pb.push(m));
  const rift = sp.gebiete.get('riftside');
  const risse = rift.uebergaenge.filter((u) => u.eig.art === 'riss');
  const zurAkropolis = risse.find((u) => u.eig.ziel === 'akropolis');
  pruefe(risse.length === 2 && zurAkropolis && risse.some((u) => u.eig.ziel === 'tempel'), `Riftside hat zwei Risse (${risse.map((u) => u.eig.ziel).join(', ')})`);
  // Durch den Riss in der Seilergasse: von unten hineinlaufen wie ein Spieler.
  const k = 32, rx = zurAkropolis.x + zurAkropolis.b / 2;
  Object.assign(ari, { x: rx, y: zurAkropolis.y + zurAkropolis.h + 20, unverwundbarBis: uhr + 1e6 });
  uhr += 500;
  sp.nachricht(ari.id, { t: 'pos', x: rx, y: zurAkropolis.y + zurAkropolis.h - 2, r: 'oben', k: ari.korrektur });
  pruefe(ari.gebiet === 'akropolis', `durch die Seilergasse auf die Akropolis (${ari.gebiet})`);
  sp.wechseln(bea, 'akropolis', 'von_riftside');
  bea.unverwundbarBis = uhr + 1e6;
  const ak = sp.gebiete.get('akropolis');
  const platten = ak.fallen.liste.filter((f) => f.art === 'platte');
  const tor = ak.welt.dinge.find((d) => d.name === 'tuer');
  pruefe(platten.length === 3 && tor && !ak.welt.geoeffnet.has(tor.schluessel), `drei Platten, Tor zu (${platten.length})`);
  // Das Tor ohne Rätsel: kein Schlüssel hilft.
  sp.gruppe().schluessel = 1;
  pa.length = 0;
  Object.assign(ari, { x: tor.x, y: tor.y + 32 });
  uhr += 300;
  sp.nachricht(ari.id, { t: 'ansprechen', r: 'oben' });
  pruefe(!ak.welt.geoeffnet.has(tor.schluessel) && sp.gruppe().schluessel === 1 && pa.some((m) => m.t === 'dialog' && m.seiten[0].includes('rührt sich nicht')),
    'das Tor geht nicht mit einem Schlüssel auf');
  const auf = (wer, f) => Object.assign(wer, { x: f.x, y: f.y + 8 });
  const weg = (wer) => Object.assign(wer, { x: 12 * k + 16, y: 19 * k + 24 });
  // Zu langsam: die erste Platte ist wieder oben, bis die dritte gedrückt ist.
  auf(ari, platten[0]);
  lauf(100);
  weg(ari);
  lauf(werte.fallen.platte.dauer / 2);
  auf(bea, platten[1]);
  lauf(100);
  weg(bea);
  lauf(werte.fallen.platte.dauer / 2 + 200);
  auf(ari, platten[2]);
  lauf(100);
  pruefe(!sp.zustaende().akropolis_tor, 'zu langsam: das Tor bleibt zu');
  pruefe(ak.stand(uhr).fallen.join('') === '011', `die erste Platte ist schon wieder oben (${ak.stand(uhr).fallen.join('')})`);
  // Zu zweit, rechtzeitig.
  pb.length = 0;
  auf(bea, platten[0]);
  lauf(100);
  auf(bea, platten[1]);
  lauf(100);
  pruefe(sp.zustaende().akropolis_tor && ak.welt.geoeffnet.has(tor.schluessel) && pb.some((m) => m.t === 'tuer' && m.ding === tor.schluessel && m.offen),
    'alle drei rechtzeitig: das Tor ist offen, und alle erfahren es');
  lauf(werte.fallen.platte.dauer + 500);
  pruefe(ak.stand(uhr).fallen.join('') === '111', 'gelöst: die Platten bleiben unten');
  // Durch das Tor zum Sockel, die Eule nehmen.
  pa.length = 0;
  const sockel = ak.welt.dinge.find((d) => d.name === 'sockel');
  Object.assign(ari, { x: sockel.x, y: sockel.y + 32 });
  pruefe(ak.welt.frei(tor.x, tor.y + 8), 'durch das offene Tor kommt man');
  uhr += 300;
  sp.nachricht(ari.id, { t: 'ansprechen', r: 'oben' });
  pruefe(sp.gruppe().eule === 1 && sp.zustaende().akropolis_geschlossen && !sp.zustaende().tempel_geschlossen, 'die Eule genommen: nur der Riss zur Akropolis ist zu');
  sp.wechseln(ari, 'riftside', 'aus_akropolis');
  Object.assign(ari, { x: rx, y: zurAkropolis.y + zurAkropolis.h + 20 });
  uhr += 500;
  sp.nachricht(ari.id, { t: 'pos', x: rx, y: zurAkropolis.y + zurAkropolis.h - 2, r: 'oben', k: ari.korrektur });
  pruefe(ari.gebiet === 'riftside', 'der Riss in der Seilergasse lässt niemanden mehr durch');
  // Nach dem Neustart steht das Tor offen.
  sp.verlassen(ari.id);
  sp.verlassen(bea.id);
  sp = new Spiel(karten, werte, { jetzt: () => uhr, spielstand: new Spielstand(datei) });
  pruefe(sp.gebiete.get('akropolis').welt.geoeffnet.has(tor.schluessel), 'nach dem Neustart steht das Tor offen');
}

// ---------- Stufen und Erfahrung ----------
{
  const st = werte.stufen;
  pruefe(stufeFuer(0, st) === 1 && stufeFuer(st.erfahrung[1] - 1, st) === 1 && stufeFuer(st.erfahrung[1], st) === 2 && stufeFuer(1e9, st) === st.erfahrung.length,
    `Erfahrung → Stufe nach der Tabelle (bis Stufe ${st.erfahrung.length})`);
  const datei = join(mkdtempSync(join(tmpdir(), 'spielstand-')), 'stand.json');
  let sp = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei) });
  const pa = [], pb = [], pc = [];
  const ana = mitCharakter(sp, 'Ana', (m) => pa.push(m));
  const bo = mitCharakter(sp, 'Bo', (m) => pb.push(m));
  const cleo = mitCharakter(sp, 'Cleo', (m) => pc.push(m));
  sp.wechseln(cleo, 'riftside', 'vom_wald');
  const wald = sp.gebiete.get('wald');
  const sieg = (wer) => {
    const g = wald.gegner.find((x) => !x.tot);
    wald.gegnerTreffen(g, wer, uhr, 99);
    return g;
  };
  const max1 = ana.werte.maxLeben, schaden1 = ana.werte.schaden;
  pa.length = pb.length = pc.length = 0;
  const g = sieg(ana);
  const xp = werte.monster[g.art].erfahrung;
  pruefe(xp > 0 && ana.erfahrung === xp && bo.erfahrung === xp && cleo.erfahrung === 0,
    `ein Sieg: Ana ${ana.erfahrung}, Bo ${bo.erfahrung} (im selben Gebiet), Cleo ${cleo.erfahrung} (anderswo)`);
  pruefe(pb.some((m) => m.t === 'erfahrung' && m.dazu === xp && m.stufe === 1 && m.fortschritt[0] === xp), 'Bo bekommt die Erfahrung gemeldet, mit Fortschritt für den Balken');
  // Kurz vor der nächsten Stufe: der nächste Sieg hebt Ana auf Stufe 2.
  ana.erfahrung = st.erfahrung[1] - 1;
  ana.leben = 1;
  pa.length = pb.length = 0;
  sieg(bo);
  pruefe(ana.stufe === 2 && ana.leben === ana.werte.maxLeben && pa.some((m) => m.t === 'erfahrung' && m.aufstieg),
    `Aufstieg auf Stufe ${ana.stufe}: Herzen wieder voll (${ana.leben}/${ana.werte.maxLeben})`);
  pruefe(pb.some((m) => m.t === 'aufstieg' && m.id === ana.id && m.stufe === 2) && pc.some((m) => m.t === 'nachricht' && m.text.includes('Stufe 2')),
    'Bo sieht den Aufstieg, Cleo liest die Meldung');
  // Was Stufen bringen: ein Herz auf 3, Schaden auf 5.
  ana.erfahrung = st.erfahrung[2] - 1;
  sieg(bo);
  const max3 = ana.werte.maxLeben;
  ana.erfahrung = st.erfahrung[4] - 1;
  sieg(bo);
  pruefe(ana.stufe === 5 && max3 === max1 + 2 && ana.werte.schaden === schaden1 + 1,
    `Stufe 3: ${max1} → ${max3} halbe Herzen; Stufe 5: Schaden ${schaden1} → ${ana.werte.schaden}`);
  // Spielstand: Erfahrung (und damit Stufe) bleibt.
  const merk = ana.erfahrung;
  for (const x of [ana, bo, cleo]) sp.verlassen(x.id);
  sp = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei) });
  const pa2 = [];
  const ana2 = mitCharakter(sp, 'Ana', (m) => pa2.push(m));
  const w = pa2.find((m) => m.t === 'willkommen');
  pruefe(ana2.erfahrung === merk && ana2.stufe === 5 && w?.charakter?.stufe === 5 && ana2.werte.schaden === schaden1 + 1,
    `nach dem Neustart: Stufe ${ana2.stufe}, ${ana2.erfahrung} Erfahrung, im Willkommen angegeben`);
  // Ein Riss schließt sich: Erfahrung für alle, auch in einem anderen Gebiet.
  const bo2 = mitCharakter(sp, 'Bo', () => {});
  sp.wechseln(ana2, 'tempel', 'von_riftside');
  const vor = bo2.erfahrung;
  Object.assign(ana2, { x: 10 * 32 + 16, y: 5 * 32 + 16 });
  uhr += 300;
  sp.nachricht(ana2.id, { t: 'ansprechen', r: 'oben' });
  pruefe(bo2.erfahrung === vor + 60 && bo2.gebiet !== 'tempel', `das Idol: ${bo2.erfahrung - vor} Erfahrung auch für Bo in ${bo2.gebiet}`);
}

// ---------- Krieger: Fähigkeiten je Stufe, Pfade, Attributspunkte ----------
{
  let wurf = 0.99;
  const datei = join(mkdtempSync(join(tmpdir(), 'spielstand-')), 'stand.json');
  let sp = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei), zufall: () => wurf });
  const t = werte.stufen.erfahrung;
  const lauf = (ms) => {
    for (let i = 0; i < ms; i += 50) {
      uhr += 50;
      sp.schritt(0.05);
    }
  };
  const pk = [], pm = [];
  const kurt = mitCharakter(sp, 'Kurt', (m) => pk.push(m));
  const mia = mitCharakter(sp, 'Mia', (m) => pm.push(m), 'gelehrter');
  const aufStufe = (wer, n) => {
    wer.erfahrung = t[n - 1] - 1;
    sp.erfahrungGeben(wer, 1);
  };
  const wald = sp.gebiete.get('wald');
  const schleim = { x: 0, y: 0, w: { schaden: 1 } };
  const treffen = (wer, art = 'nah') => {
    Object.assign(schleim, { x: wer.x, y: wer.y - 20 });
    wer.unverwundbarBis = 0;
    wer.leben = 6;
    pk.length = pm.length = 0;
    sp.spielerTreffen(wer, schleim, uhr, art);
    return 6 - wer.leben;
  };
  pruefe(kurt.werte.gelernt.map((g) => g.id).join(',') === 'kampfstil,kriegsdisziplin' && kurt.werte.aktionen[0]?.taste === 'F',
    `Krieger Stufe 1: ${kurt.werte.gelernt.map((g) => g.name).join(', ')}`);
  // Kampfstil: 10 % prallen ab — mit Wurf 0,05 prallt es ab, mit 0,5 nicht.
  wurf = 0.05;
  const ab = treffen(kurt);
  pruefe(ab === 0 && pk.some((m) => m.t === 'abgeprallt'), 'Kampfstil: ein Treffer prallt ab (Wurf 0,05 unter 10 %)');
  wurf = 0.5;
  pruefe(treffen(kurt) === 1, 'mit Wurf 0,5 trifft der Schleim');
  // Stufe 2: Gefahrensinn — gegen Fallen 35 %, gegen Nahkampf weiter 10 %.
  const tempo1 = kurt.werte.tempo;
  aufStufe(kurt, 2);
  wurf = 0.3;
  pruefe(treffen(kurt, 'falle') === 0 && treffen(kurt, 'nah') === 1 && kurt.werte.tempo > tempo1,
    `Stufe 2: Falle weicht aus, Schleim trifft; Tempo ${tempo1} → ${kurt.werte.tempo}`);
  // Kriegsdisziplin (F): +1 Schaden für 6 s, dann Abklingzeit.
  wurf = 0.99;
  const g = wald.gegner[0];
  const schlag = () => {
    Object.assign(g, { tot: false, leben: 50, getroffenBis: 0 });
    const vor = g.leben;
    Object.assign(kurt, { x: g.x, y: g.y + 20, richtung: 'oben' });
    kurt.naechsterHieb = 0;
    sp.hieb(kurt, { r: 'oben' });
    return vor - g.leben;
  };
  const normal = schlag();
  sp.aktion(kurt, { id: 'kriegsdisziplin' });
  uhr += 300;
  const imRausch = schlag();
  const zweites = kurt.aktionBereit.kriegsdisziplin;
  sp.aktion(kurt, { id: 'kriegsdisziplin' });
  pruefe(imRausch === normal + 1 && kurt.aktionBereit.kriegsdisziplin === zweites, `Kriegsdisziplin: Hieb ${normal} → ${imRausch}; zweimal hintereinander geht nicht`);
  uhr += 7000;
  pruefe(schlag() === normal, 'nach 6 s ist die Kriegsdisziplin vorbei');
  // Pfad: auf Stufe 2 nicht, auf 3 einmal.
  sp.pfadWaehlen(kurt, 'barbar');
  const zuFrueh = kurt.pfad;
  aufStufe(kurt, 3);
  const offen3 = pk.find((m) => m.t === 'erfahrung')?.offen;
  sp.pfadWaehlen(kurt, 'gibtsnicht');
  sp.pfadWaehlen(kurt, 'barbar');
  sp.pfadWaehlen(kurt, 'martial');
  pruefe(!zuFrueh && offen3?.pfad && kurt.pfad === 'barbar' && kurt.werte.aktionen.some((a) => a.id === 'kampfrausch' && a.taste === 'R'),
    `Pfad: auf Stufe 2 gesperrt, auf 3 offen, Barbar gewählt (Wechsel danach nicht mehr): ${kurt.werte.aktionen.map((a) => a.taste + ' ' + a.name).join(', ')}`);
  // Kampfrausch: die Hälfte prallt ab.
  wurf = 0.4;
  const ohneRausch = treffen(kurt);
  sp.aktion(kurt, { id: 'kampfrausch' });
  pruefe(ohneRausch === 1 && treffen(kurt) === 0, 'Kampfrausch: Wurf 0,4 trifft ohne, prallt mit Rausch ab');
  // Attributspunkte auf Stufe 4: zwei Stück.
  aufStufe(kurt, 4);
  const st0 = kurt.werte.attribute.staerke;
  for (let i = 0; i < 3; i++) sp.attributSetzen(kurt, 'staerke');
  sp.attributSetzen(kurt, 'gibtsnicht');
  pruefe(kurt.werte.attribute.staerke === st0 + 2 && kurt.attributPlus.staerke === 2, `Stufe 4: zwei Punkte auf Stärke (${st0} → ${kurt.werte.attribute.staerke}), der dritte geht nicht`);
  // Schutzaura auf Stufe 6: Mia neben Kurt prallt ab, weit weg nicht.
  aufStufe(kurt, 6);
  sp.wechseln(mia, 'wald', 'von_hoehle');
  sp.wechseln(kurt, 'wald', 'von_hoehle');
  Object.assign(mia, { x: kurt.x + 40, y: kurt.y });
  wurf = 0.05;
  const nah = treffen(mia);
  // Eine freie Stelle weit weg (mehr als drei Kacheln).
  const weit = [[300, 0], [-300, 0], [-160, 0], [0, -200], [200, 150], [-200, 150]].map(([dx, dy]) => ({ x: kurt.x + dx, y: kurt.y + dy })).find((o) => sp.gebiete.get('wald').welt.frei(o.x, o.y));
  Object.assign(mia, weit);
  const fern = weit ? treffen(mia) : -1;
  pruefe(nah === 0 && fern === 1, `Schutzaura: Mia neben Kurt ${nah} Schaden, weit weg ${fern}`);
  // Stufe 9: Unerbittlich. Stufe 13: standfest. Stufe 17: Präsenz und Krit.
  aufStufe(kurt, 9);
  wurf = 0.99;
  kurt.unverwundbarBis = 0;
  kurt.leben = 1;
  sp.spielerTreffen(kurt, schleim, uhr);
  const ersterTod = kurt.leben;
  uhr += 2000;
  kurt.unverwundbarBis = 0;
  kurt.leben = 1;
  sp.spielerTreffen(kurt, schleim, uhr);
  pruefe(ersterTod === 1 && kurt.tot, `Unerbittlich: der erste tödliche Treffer lässt ${ersterTod}, der zweite gleich danach nicht`);
  Object.assign(kurt, { tot: false, leben: 6 });
  aufStufe(kurt, 13);
  treffen(kurt);
  const stoss = pk.find((m) => m.t === 'getroffen');
  pruefe(stoss && stoss.vx === 0 && stoss.vy === 0, 'Unbeugsam: kein Rückstoß mehr');
  aufStufe(kurt, 17);
  uhr += 60000;
  const nahe = wald.gegner.find((x) => !x.tot);
  Object.assign(kurt, { x: nahe.x, y: nahe.y + 30 });
  sp.aktion(kurt, { id: 'kriegsdisziplin' });
  pruefe(uhr < (nahe.betaeubtBis ?? 0), 'Einschüchternde Präsenz: der Schleim neben Kurt erstarrt');
  uhr += 30000;
  const grund17 = schlag();
  wurf = 0;
  uhr += 1000;
  const krit = schlag();
  wurf = 0.99;
  pruefe(krit === grund17 * 3, `Brutaler kritischer Treffer: ${krit} Schaden statt ${grund17} (dreifach)`);
  // Betäubt: steht still und tut nichts.
  const b = wald.gegner.find((x) => !x.tot);
  // stossBis 0: sonst flog er noch vom letzten Hieb zurück.
  Object.assign(b, { betaeubtBis: uhr + 1000, stossBis: 0 });
  const bx = b.x, by = b.y;
  const neben = mitCharakter(sp, 'Neben', () => {});
  sp.wechseln(neben, 'wald', 'von_hoehle');
  Object.assign(neben, { x: b.x, y: b.y + 8, unverwundbarBis: 0, leben: 6 });
  lauf(500);
  pruefe(b.x === bx && b.y === by && neben.leben === 6, 'ein betäubter Schleim bewegt sich nicht und tut niemandem etwas');
  // Spielstand: Pfad und Attributspunkte bleiben.
  for (const x of [kurt, mia, neben]) sp.verlassen(x.id);
  sp = new Spiel(karten, werteWald, { jetzt: () => uhr, spielstand: new Spielstand(datei) });
  const k2 = mitCharakter(sp, 'Kurt', () => {});
  pruefe(k2.pfad === 'barbar' && k2.attributPlus.staerke === 2 && k2.werte.kampf.krit > 0, `nach dem Neustart: Pfad ${k2.pfad}, Stärke +${k2.attributPlus.staerke}`);
}
// Die anderen Pfade.
{
  let wurf = 0.99;
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr, zufall: () => wurf });
  const t = werte.stufen.erfahrung;
  const mk = (name, pfad, stufe) => {
    const x = mitCharakter(sp, name, () => {});
    x.erfahrung = t[2];
    sp.erfahrungGeben(x, 1);
    sp.pfadWaehlen(x, pfad);
    x.erfahrung = t[stufe - 1] - 1;
    sp.erfahrungGeben(x, 1);
    return x;
  };
  const schwert = mk('Sven', 'schwertkaempfer', 18);
  const kampf = mk('Mo', 'martial', 18);
  const normal = mitCharakter(sp, 'Nora', () => {});
  pruefe(kampf.werte.hiebAbstand < normal.werte.hiebAbstand && kampf.werte.aktionen.map((a) => a.taste).join('') === 'FRT',
    `Martial Artist: Hieb alle ${kampf.werte.hiebAbstand} statt ${normal.werte.hiebAbstand} ms, Tasten ${kampf.werte.aktionen.map((a) => a.taste).join(', ')}`);
  // Zweiter Atem und Überlebender.
  schwert.leben = 2;
  sp.aktion(schwert, { id: 'zweiteratem' });
  const nachAtem = schwert.leben;
  schwert.leben = 2;
  for (let i = 0; i < 100; i++) {
    uhr += 50;
    sp.schritt(0.05);
  }
  pruefe(nachAtem === 6 && schwert.leben === 3, `Zweiter Atem: 2 → ${nachAtem}; Überlebender: in 5 s ein halbes Herz (${schwert.leben})`);
  // Betäubender Schlag mit Wurf 0.
  const wald = sp.gebiete.get('wald');
  const g = wald.gegner[0];
  Object.assign(g, { tot: false, leben: 50, getroffenBis: 0 });
  Object.assign(kampf, { x: g.x, y: g.y + 20, naechsterHieb: 0 });
  wurf = 0.15;
  sp.hieb(kampf, { r: 'oben' });
  pruefe(uhr < (g.betaeubtBis ?? 0), 'Betäubender Schlag: der Schleim ist betäubt (Wurf 0,15 unter 20 %)');
}

// ---------- Bogenschütze ----------
{
  let wurf = 0.99;
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr, zufall: () => wurf });
  const t = werte.stufen.erfahrung;
  const wald = sp.gebiete.get('wald');
  const mk = (name, stufe, pfad) => {
    const x = mitCharakter(sp, name, () => {}, 'waldlaeufer');
    x.erfahrung = t[Math.min(stufe, 3) - 1] - 1;
    sp.erfahrungGeben(x, 1);
    if (pfad) sp.pfadWaehlen(x, pfad);
    x.erfahrung = t[stufe - 1] - 1;
    sp.erfahrungGeben(x, 1);
    sp.wechseln(x, 'wald', 'von_hoehle');
    return x;
  };
  const lauf = (ms) => {
    for (let i = 0; i < ms; i += 50) {
      uhr += 50;
      sp.schritt(0.05);
    }
  };
  // Zwei Schleime übereinander in einer Reihe, der Schütze darunter, Blick nach oben.
  const reihe = () => {
    const [a, b] = wald.gegner;
    const x = 30 * 32 + 16;
    // vx/vy 0 und wechselBei weit weg: der hintere Schleim wandert nicht aus
    // der Schussbahn (das tat er in jedem dritten Lauf).
    for (const [g, y] of [[a, 20 * 32 + 16], [b, 18 * 32 + 16]]) Object.assign(g, { x, y, tot: false, leben: 50, getroffenBis: 0, stossBis: 0, markiertBis: 0, betaeubtBis: 0, vx: 0, vy: 0, wechselBei: uhr + 1e6 });
    return [a, b, x];
  };
  const schiesse = (wer, art = 'q', id) => {
    const [a, b, x] = reihe();
    Object.assign(wer, { x, y: 23 * 32 + 16, richtung: 'oben', faehigkeitBereit: 0, aktionBereit: {} });
    wald.geschosse.clear();
    if (art === 'q') sp.faehigkeit(wer, { r: 'oben' });
    else sp.aktion(wer, { id, r: 'oben' });
    const pfeile = wald.geschosse.size;
    lauf(800);
    return { a: 50 - a.leben, b: 50 - b.leben, pfeile };
  };
  const frei = sp.gebiete.get('wald').welt.frei(30 * 32 + 16, 23 * 32 + 16) && sp.gebiete.get('wald').welt.frei(30 * 32 + 16, 18 * 32 + 16);
  const bo = mk('Bo', 2);
  pruefe(frei && bo.werte.faehigkeit.reichweite === Math.round(260 * 1.2) && bo.werte.aktionen[0]?.id === 'gezielt',
    `Bogenschütze Stufe 2: Reichweite ${bo.werte.faehigkeit.reichweite}, F ${bo.werte.aktionen[0]?.name} (Schussbahn frei: ${frei})`);
  // Fokussierter Schuss: stillstehend +1.
  bo.stehtSeit = uhr;
  const gelaufen = schiesse(bo).a;
  bo.stehtSeit = uhr - 2000;
  const gestanden = schiesse(bo).a;
  pruefe(gestanden === gelaufen + 1, `Fokussierter Schuss: gelaufen ${gelaufen}, gestanden ${gestanden} Schaden`);
  // Q trifft nur den ersten, der Gezielte Schuss beide.
  bo.stehtSeit = uhr;
  const q = schiesse(bo);
  const f = schiesse(bo, 'aktion', 'gezielt');
  pruefe(q.a > 0 && q.b === 0 && f.a > 0 && f.b > 0, `Durchschlag: Q trifft ${q.a}/${q.b}, Gezielter Schuss ${f.a}/${f.b}`);
  // Tarnung: stillstehend erst aus halber Sichtweite bemerkt.
  const g = wald.gegner[2];
  Object.assign(bo, { x: g.x + g.w.sichtweite * 0.7, y: g.y });
  bo.stehtSeit = uhr - 2000;
  const getarnt = naechster(g, [bo], uhr);
  bo.stehtSeit = uhr;
  const gesehen = naechster(g, [bo], uhr);
  pruefe(!getarnt && gesehen === bo, 'Tarnung: stillstehend bemerkt der Schleim Bo nicht, laufend schon');
  // Kräuterkunde: ein Herz heilt mehr.
  bo.leben = 2;
  wald.herzen.set('hx', { id: 'hx', x: bo.x, y: bo.y - 8, bis: uhr + 9999 });
  wald.herzenAufheben(bo);
  pruefe(bo.leben === 2 + werte.herz.heilung + 1, `Kräuterkunde: Herz heilt ${bo.leben - 2} halbe`);
  // Doppelschuss (9) und Schnellfeuer (17).
  const da = mk('Da', 17);
  const doppel = schiesse(da, 'aktion', 'gezielt');
  sp.aktion(da, { id: 'schnellfeuer' });
  da.faehigkeitBereit = 0;
  sp.faehigkeit(da, { r: 'oben' });
  pruefe(doppel.pfeile === 2 && da.faehigkeitBereit - uhr === Math.round(da.werte.faehigkeit.abklingzeit * 0.5),
    `Doppelschuss: ${doppel.pfeile} Pfeile; Schnellfeuer: Pfeil lädt in ${da.faehigkeitBereit - uhr} statt ${da.werte.faehigkeit.abklingzeit} ms`);
  // Jägerschütze: Markieren, alle treffen härter, die Markierung springt.
  const ja = mk('Ja', 10, 'jaeger');
  const helfer = mitCharakter(sp, 'Hel', () => {});
  sp.wechseln(helfer, 'wald', 'von_hoehle');
  const [ziel, zweiter] = reihe();
  Object.assign(ja, { x: ziel.x, y: ziel.y + 60, aktionBereit: {} });
  sp.aktion(ja, { id: 'markieren' });
  const markiert = uhr < ziel.markiertBis && wald.stand(uhr).gegner.find((x) => x.id === ziel.id)?.mk;
  Object.assign(helfer, { x: ziel.x, y: ziel.y + 20, naechsterHieb: 0 });
  const vor = ziel.leben;
  sp.hieb(helfer, { r: 'oben' });
  const mitMarke = vor - ziel.leben;
  pruefe(markiert && mitMarke === helfer.werte.schaden + 1, `Beute markiert: Helfers Hieb macht ${mitMarke} statt ${helfer.werte.schaden}`);
  wald.gegnerTreffen(ziel, helfer, uhr, 99);
  pruefe(uhr < (zweiter.markiertBis ?? 0), 'Beutezugriff: nach dem Tod springt die Markierung zum Nachbarn');
  // Trickschütze: der Blendpfeil betäubt.
  // Höchstens vier im Spiel: zwei gehen.
  sp.verlassen(bo.id);
  sp.verlassen(da.id);
  const tr = mk('Tri', 3, 'trickschuetze');
  const [b1] = reihe();
  schiesse(tr, 'aktion', 'blendpfeil');
  pruefe(uhr - 800 < (b1.betaeubtBis ?? 0), 'Blendpfeil: der getroffene Schleim ist betäubt');
}

// ---------- Dieb ----------
{
  let wurf = 0.99;
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr, zufall: () => wurf });
  const t = werte.stufen.erfahrung;
  const wald = sp.gebiete.get('wald');
  const lauf = (ms) => {
    for (let i = 0; i < ms; i += 50) {
      uhr += 50;
      sp.schritt(0.05);
    }
  };
  const mk = (name, stufe, pfad, klasse = 'schurke') => {
    const x = mitCharakter(sp, name, () => {}, klasse);
    x.erfahrung = t[Math.min(stufe, 3) - 1] - 1;
    sp.erfahrungGeben(x, 1);
    if (pfad) sp.pfadWaehlen(x, pfad);
    x.erfahrung = t[stufe - 1] - 1;
    sp.erfahrungGeben(x, 1);
    sp.wechseln(x, 'wald', 'von_hoehle');
    x.unverwundbarBis = 0;
    return x;
  };
  const g = wald.gegner[0];
  const still = (x) => Object.assign(x, { tot: false, leben: 50, getroffenBis: 0, stossBis: 0, betaeubtBis: 0, verwirrtBis: 0, markiertBis: 0, giftBei: 0, vx: 0, vy: 0, wechselBei: uhr + 1e6 });
  const hieb = (wer, zielId) => {
    still(g);
    g.zielId = zielId;
    Object.assign(wer, { x: g.x, y: g.y + 20, naechsterHieb: 0 });
    sp.hieb(wer, { r: 'oben' });
    return 50 - g.leben;
  };
  const dina = mk('Dina', 2);
  const ole = mk('Ole', 1, null, 'gelehrter');
  Object.assign(ole, { x: g.x + 200, y: g.y });
  const gegenMich = hieb(dina, dina.id);
  const gegenOle = hieb(dina, ole.id);
  pruefe(gegenOle === gegenMich + 1, `Hinterhältiger Schlag: jagt der Schleim Dina ${gegenMich}, jagt er Ole ${gegenOle}`);
  // Langfinger: mehr Gold.
  const vorher = dina.inventar.gold ?? 0;
  sp.beute(dina.id, { w: { gold: [4, 4] }, x: 0, y: 0 }, null);
  pruefe((dina.inventar.gold ?? 0) - vorher === 6, `Langfinger: 4 Gold Beute werden ${(dina.inventar.gold ?? 0) - vorher}`);
  // Stufe 9: Verbesserter Hinterhalt (überrascht doppelt), Doppelte Ablenkung.
  sp.verlassen(dina.id);
  const tom = mk('Tom', 9);
  const ueber = hieb(tom, null);
  const gegenTom = hieb(tom, tom.id);
  pruefe(ueber === gegenTom + 2, `Verbesserter Hinterhalt: überrascht ${ueber}, sonst ${gegenTom}`);
  const [a, b, c] = wald.gegner.filter((x) => !x.tot);
  for (const [x, dx] of [[a, 30], [b, 60], [c, 300]]) Object.assign(still(x), { x: tom.x + dx, y: tom.y });
  sp.aktion(tom, { id: 'ablenkung' });
  pruefe(uhr < a.verwirrtBis && uhr < b.verwirrtBis && !(uhr < (c.verwirrtBis ?? 0)), 'Doppelte Ablenkung: die zwei Nächsten sind abgelenkt, der Ferne nicht');
  Object.assign(a, { x: tom.x, y: tom.y - 2, wechselBei: uhr + 1e6 });
  tom.leben = 6;
  lauf(300);
  pruefe(tom.leben === 6, 'ein abgelenkter Schleim tut Tom nichts, auch wenn er ihn berührt');
  sp.verlassen(tom.id);
  // Stufe 13 und 15: Schattenentschwinden, Legendärer Coup.
  const una = mk('Una', 15);
  Object.assign(una, { leben: 6, unverwundbarBis: 0 });
  sp.spielerTreffen(una, { x: una.x, y: una.y - 20, w: { schaden: 1 } }, uhr);
  const weg = uhr < una.leereBis && uhr < una.unverwundbarBis && wald.stand(uhr).spieler.find((x) => x.id === una.id)?.e.includes('l');
  uhr += 5000;
  una.unverwundbarBis = 0;
  sp.spielerTreffen(una, { x: una.x, y: una.y - 20, w: { schaden: 1 } }, uhr);
  pruefe(weg && !(uhr < una.leereBis), 'Schattenentschwinden: nach dem Treffer kurz weg, gleich danach nicht noch einmal');
  const n = wald.gegner.find((x) => !x.tot);
  Object.assign(still(n), { x: una.x + 20, y: una.y });
  const gold0 = una.inventar.gold ?? 0;
  wurf = 0;
  sp.aktion(una, { id: 'coup' });
  wurf = 0.99;
  pruefe((una.inventar.gold ?? 0) - gold0 === 5 && uhr < n.betaeubtBis, `Legendärer Coup: ${(una.inventar.gold ?? 0) - gold0} Gold, der Schleim ist benommen`);
  sp.verlassen(una.id);
  // Assassine: Überraschung immer kritisch, Gift.
  const asa = mk('Asa', 10, 'assassine');
  const krit = hieb(asa, null);
  const normal = hieb(asa, asa.id);
  pruefe(krit >= normal * 2, `Tödlicher Überraschungsschlag: überrascht ${krit}, sonst ${normal}`);
  wurf = 0;
  const mitGift = hieb(asa, asa.id);
  wurf = 0.99;
  g.vx = g.vy = 0;
  lauf(1100);
  pruefe(50 - g.leben === mitGift + 1, `Gift: eine Sekunde später noch 1 (${mitGift} → ${50 - g.leben})`);
  sp.verlassen(asa.id);
  // Taktiker: Falle statt Ablenkung auf F, höchstens zwei, ein Schleim läuft hinein.
  const tak = mk('Tak', 10, 'taktiker');
  const f = tak.werte.aktionen.find((x) => x.taste === 'F');
  for (const dx of [0, 40, 80]) {
    Object.assign(tak, { x: tak.x + (dx ? 40 : 0), aktionBereit: {} });
    sp.aktion(tak, { id: f.id });
  }
  const fallen = wald.spielerFallen.filter((x) => x.von === tak.id);
  const ziel = Object.assign(still(wald.gegner.find((x) => !x.tot)), { x: fallen[0].x, y: fallen[0].y });
  lauf(100);
  pruefe(f.id === 'fallenstellen' && fallen.length === 2 && uhr < ziel.betaeubtBis && ziel.leben < 50 && wald.spielerFallen.length === 1,
    `Taktiker: F legt Fallen (${fallen.length} liegen), der Schleim darin ist betäubt (${50 - ziel.leben} Schaden)`);
  sp.verlassen(tak.id);
  // Schattenläufer: Sprung in Blickrichtung, nicht durch Wände; Tarnung im Laufen.
  const sch = mk('Sch', 10, 'schattenlaeufer');
  const x0 = sch.x, y0 = sch.y;
  sch.richtung = 'links';
  sp.aktion(sch, { id: 'schattenwandeln', r: 'links' });
  // Der ganze Weg muss frei sein — sonst wäre er durch ein Hindernis gesprungen.
  let wegFrei = true;
  for (let x = x0; x >= sch.x; x -= 4) wegFrei &&= wald.welt.frei(x, y0);
  pruefe(sch.x < x0 && x0 - sch.x <= 128 && sch.y === y0 && wegFrei, `Schattenwandeln: ${x0 - sch.x} Punkte nach links, der Weg dahin frei`);
  const sg = wald.gegner.find((x) => !x.tot);
  Object.assign(sch, { x: sg.x + sg.w.sichtweite * 0.7, y: sg.y, stehtSeit: uhr });
  pruefe(!naechster(sg, [sch], uhr), 'Lautloser Schritt: auch im Laufen erst aus halber Entfernung bemerkt');
  sp.verlassen(sch.id);
  // Trickbetrüger: feilschen.
  const tri = mk('Tri2', 3, 'trickbetrueger');
  const nor = mitCharakter(sp, 'Nor', () => {}, 'schurke');
  const laden = (wer) => {
    wer.laden = { id: 'kraemerin', gebiet: wer.gebiet, x: wer.x, y: wer.y };
    return sp.ladenAngabe(wer);
  };
  const lt = laden(tri), ln = laden(nor);
  const art = Object.keys(ln.waren).find((x) => ln.waren[x] >= 10);
  pruefe(art && lt.waren[art] < ln.waren[art] && lt.ankauf[art] > ln.ankauf[art], `Schnelllügner: ${art} kostet ${lt.waren[art]} statt ${ln.waren[art]}`);
}

// ---------- Arzt ----------
{
  let wurf = 0.99;
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr, zufall: () => wurf });
  const t = werte.stufen.erfahrung;
  const wald = sp.gebiete.get('wald');
  const lauf = (ms) => {
    for (let i = 0; i < ms; i += 50) {
      uhr += 50;
      sp.schritt(0.05);
    }
  };
  const mk = (name, stufe, pfad, klasse = 'kleriker') => {
    const x = mitCharakter(sp, name, () => {}, klasse);
    x.erfahrung = t[Math.min(stufe, 3) - 1] - 1;
    sp.erfahrungGeben(x, 1);
    if (pfad) sp.pfadWaehlen(x, pfad);
    x.erfahrung = t[stufe - 1] - 1;
    sp.erfahrungGeben(x, 1);
    sp.wechseln(x, 'wald', 'von_hoehle');
    x.unverwundbarBis = 0;
    return x;
  };
  const schlag = { x: 0, y: 0, w: { schaden: 99 } };
  const toeten = (wer) => {
    Object.assign(schlag, { x: wer.x, y: wer.y - 20 });
    wer.unverwundbarBis = 0;
    sp.spielerTreffen(wer, schlag, uhr);
  };
  const ana = mk('Ana', 13);
  const ben = mk('Ben', 1, null, 'kaempfer');
  const kleriker1 = werteBerechnen(werte.klassen.kleriker, werte.spezies.mensch, werte.spieler, [], 1, werte.stufen);
  pruefe(ana.werte.faehigkeit.name === 'Erste Hilfe' && kleriker1.faehigkeit.staerke === werte.klassen.kleriker.faehigkeit.heilung + 1 + 1,
    `Arzt Stufe 1: Erste Hilfe heilt ${kleriker1.faehigkeit.staerke} (2, +1 Weisheit, +1 Medizinisches Wissen)`);
  // Feldbehandlung: wer am meisten fehlt.
  Object.assign(ben, { x: ana.x + 30, y: ana.y, leben: 2 });
  ana.leben = ana.werte.maxLeben - 1;
  sp.aktion(ana, { id: 'feldbehandlung' });
  pruefe(ben.leben === 2 + 3 + 1 && ana.leben === ana.werte.maxLeben - 1, `Feldbehandlung: Ben (am meisten verletzt) 2 → ${ben.leben}, Ana bleibt`);
  // Lebensretter: Ben bleibt stehen, gleich danach nicht noch einmal.
  toeten(ben);
  const gehalten = !ben.tot && ben.leben === 1;
  uhr += 2000;
  toeten(ben);
  pruefe(gehalten && ben.tot, `Lebensretter: Ben hält sich (${gehalten}), beim zweiten Mal gleich danach nicht`);
  // Meister der Stabilisierung: Ben steht an Ort und Stelle wieder auf.
  const [bx, by] = [ben.x, ben.y];
  lauf(werte.spieler.wiederbelebung + 200);
  pruefe(!ben.tot && ben.gebiet === 'wald' && Math.hypot(ben.x - bx, ben.y - by) < 1 && ben.leben === Math.ceil(ben.werte.maxLeben / 2),
    `Stabilisierung: Ben steht dort auf, wo er fiel, mit ${ben.leben} halben Herzen`);
  // Schnellreanimation: ohne Besiegten keine Abklingzeit, mit sofort zurück.
  sp.aktion(ana, { id: 'reanimation' });
  const frei = !(uhr < (ana.aktionBereit.reanimation ?? 0));
  uhr += 61000;
  // Zweimal: beim ersten Mal hält ihn der Lebensretter (wieder geladen).
  toeten(ben);
  uhr += 2000;
  toeten(ben);
  const tot = ben.tot;
  sp.aktion(ana, { id: 'reanimation' });
  pruefe(frei && tot && !ben.tot && ben.leben === 2, `Schnellreanimation: nichts zu tun → keine Wartezeit; Ben sofort zurück mit ${ben.leben}`);
  // Chirurgisches Geschick: gegen Verletzte mehr.
  const g = wald.gegner[0];
  const hau = (leben) => {
    Object.assign(g, { tot: false, leben, getroffenBis: 0, stossBis: 0, zielId: ana.id });
    Object.assign(ana, { x: g.x, y: g.y + 20, naechsterHieb: 0 });
    const vor = g.leben;
    sp.hieb(ana, { r: 'oben' });
    return vor - g.leben;
  };
  const unverletzt = hau(g.w.leben), angeschlagen = hau(g.w.leben - 1 + 0.5);
  pruefe(angeschlagen === unverletzt + 3, `Chirurgisches Geschick (Stufe 13: +3): unverletzt ${unverletzt}, verletzt ${angeschlagen}`);
  pruefe(wald.stand(uhr).gegner[0].lm === g.w.leben && 'l' in wald.stand(uhr).gegner[0], 'der Stand nennt Leben und Höchstleben der Gegner (für die Diagnose)');
  sp.verlassen(ana.id);
  // Alchemist: Mixtur heilt dort, wo sie landet, und brennt Gegner.
  const al = mk('Al', 7, 'alchemist');
  Object.assign(ben, { x: al.x, y: al.y - 96, leben: 2 });
  const sg = wald.gegner[1];
  Object.assign(sg, { tot: false, x: al.x + 20, y: al.y - 96, leben: 5, stossBis: 0, getroffenBis: 0 });
  al.richtung = 'oben';
  const frei2 = wald.welt.frei(ben.x, ben.y);
  sp.aktion(al, { id: 'heilsalbe', r: 'oben' });
  pruefe(!frei2 || (ben.leben === 2 + 2 + 2 && sg.leben < 5), `Heilsalbe: Ben drei Kacheln vor Al 2 → ${ben.leben}, der Schleim daneben brennt (${5 - sg.leben})`);
  sp.verlassen(al.id);
  // Feldarzt: wen er heilt, an dem prallt es ab.
  const fe = mk('Fe', 10, 'feldarzt');
  Object.assign(ben, { x: fe.x + 20, y: fe.y, leben: 2 });
  sp.faehigkeit(fe, { r: 'unten' });
  wurf = 0.2;
  Object.assign(schlag, { w: { schaden: 1 } });
  const vor = ben.leben;
  ben.unverwundbarBis = 0;
  sp.spielerTreffen(ben, { x: ben.x, y: ben.y - 20, w: { schaden: 1 } }, uhr);
  wurf = 0.99;
  pruefe(ben.leben === vor, 'Frontlinienhilfe: gleich nach der Heilung prallt der Treffer an Ben ab (Wurf 0,2)');
  sp.verlassen(fe.id);
  // Toxikologe: Gift springt über.
  const tox = mk('Tox', 10, 'toxikologe');
  const [g1, g2] = wald.gegner;
  for (const [x, dx] of [[g1, 0], [g2, 30]]) Object.assign(x, { tot: false, leben: 50, x: tox.x + dx, y: tox.y - 40, giftBei: 0, stossBis: 0, getroffenBis: 0, vx: 0, vy: 0, wechselBei: uhr + 1e6, zielId: tox.id });
  Object.assign(g1, { giftBei: uhr + 50, giftVon: tox.id });
  lauf(100);
  const sprang = g2.giftBei > uhr;
  lauf(1200);
  pruefe(sprang && g2.leben < 50, `Ansteckende Wirkung: das Gift springt auf den Nachbarn (${50 - g2.leben} Schaden)`);
}

// ---------- Koch ----------
{
  let wurf = 0.99;
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr, zufall: () => wurf });
  const t = werte.stufen.erfahrung;
  const wald = sp.gebiete.get('wald');
  const mk = (name, stufe, pfad, klasse = 'koch') => {
    const x = mitCharakter(sp, name, () => {}, klasse);
    x.erfahrung = t[Math.min(stufe, 3) - 1] - 1;
    sp.erfahrungGeben(x, 1);
    if (pfad) sp.pfadWaehlen(x, pfad);
    x.erfahrung = t[stufe - 1] - 1;
    sp.erfahrungGeben(x, 1);
    sp.wechseln(x, 'wald', 'von_hoehle');
    x.unverwundbarBis = 0;
    return x;
  };
  const still = (g) => Object.assign(g, { tot: false, leben: 50, getroffenBis: 0, stossBis: 0, betaeubtBis: 0, verwirrtBis: 0, langsamBis: 0, markiertBis: 0, giftBei: 0, vx: 0, vy: 0, wechselBei: uhr + 1e6, zielId: 'x' });
  const kim = mk('Kim', 2);
  const ben = mk('Ben', 1, null, 'kaempfer');
  pruefe(kim.werte.faehigkeit.name === 'Messerwurf' && kim.werte.aktionen.map((a) => a.taste).join('') === 'FT', `Koch Stufe 2: Q ${kim.werte.faehigkeit.name}, ${kim.werte.aktionen.map((a) => a.taste + ' ' + a.name).join(', ')}`);
  // Mahl: Ben neben Kim heilt und schlägt 20 s lang härter.
  const g = wald.gegner[0];
  const hau = (wer) => {
    still(g);
    Object.assign(wer, { x: g.x, y: g.y + 20, naechsterHieb: 0 });
    sp.hieb(wer, { r: 'oben' });
    return 50 - g.leben;
  };
  const vorher = hau(ben);
  Object.assign(ben, { x: kim.x + 30, y: kim.y, leben: 2 });
  sp.aktion(kim, { id: 'kochkunst' });
  const geheilt = ben.leben;
  const satt = hau(ben);
  uhr += 21000;
  const spaeter = hau(ben);
  pruefe(geheilt === 4 && satt === vorher + 1 && spaeter === vorher, `Mahl: Ben 2 → ${geheilt}, Hieb ${vorher} → ${satt}, nach 20 s wieder ${spaeter}`);
  // Curry: brennt und verlangsamt dort, wo es landet.
  const c = wald.gegner[1];
  Object.assign(kim, { richtung: 'oben' });
  Object.assign(still(c), { x: kim.x, y: kim.y - 96 });
  sp.aktion(kim, { id: 'curry', r: 'oben' });
  pruefe(c.leben === 50 - 2 && uhr < c.langsamBis, `Explosives Curry: ${50 - c.leben} Schaden, der Schleim ist verlangsamt`);
  sp.verlassen(kim.id);
  // Gewürzmeister: Würzattacke vorn ja, hinten nein; auf 7 betäubt sie.
  const gew = mk('Gew', 7, 'gewuerzmeister');
  const [vorn, hinten] = wald.gegner;
  Object.assign(still(vorn), { x: gew.x, y: gew.y - 50 });
  Object.assign(still(hinten), { x: gew.x, y: gew.y + 50 });
  gew.richtung = 'oben';
  sp.aktion(gew, { id: 'wuerzattacke' });
  pruefe(vorn.leben === 48 && hinten.leben === 50 && uhr < vorn.verwirrtBis && uhr < vorn.betaeubtBis, `Würzattacke: vorn ${50 - vorn.leben} Schaden, betäubt und blind; hinten ${50 - hinten.leben}`);
  sp.verlassen(gew.id);
  // Festmahlkoch: Festmahl heilt alle im Gebiet, auch weit weg.
  const fest = mk('Fest', 15, 'festmahlkoch');
  Object.assign(ben, { x: fest.x - 160, y: fest.y, leben: 1 });
  sp.aktion(fest, { id: 'festmahl' });
  pruefe(ben.leben === ben.werte.maxLeben, `Himmlisches Festmahl: Ben fünf Kacheln weg 1 → ${ben.leben}`);
  // Mahl mit Delikaten Gerichten (+1) und Heimatküche (Schutz).
  sp.aktion(fest, { id: 'kochkunst' });
  Object.assign(ben, { x: fest.x + 30, y: fest.y });
  fest.aktionBereit = {};
  sp.aktion(fest, { id: 'kochkunst' });
  const satt2 = hau(ben);
  // Wurf 0,4: Bens Kampfstil (0,1) und die Auren des Kochs (0,1 + 0,15)
  // allein reichen nicht, erst mit dem Schutz aus dem Mahl (0,2) prallt es ab.
  wurf = 0.4;
  const vorL = ben.leben;
  ben.unverwundbarBis = 0;
  sp.spielerTreffen(ben, { x: ben.x, y: ben.y - 20, w: { schaden: 1 } }, uhr);
  wurf = 0.99;
  pruefe(satt2 === vorher + 2 && ben.leben === vorL, `Festmahlkoch-Mahl: Hieb ${vorher} → ${satt2}, ein Treffer prallt ab (Wurf 0,4)`);
}

// ---------- Musiker ----------
{
  let wurf = 0.99;
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr, zufall: () => wurf });
  const t = werte.stufen.erfahrung;
  const wald = sp.gebiete.get('wald');
  const mk = (name, stufe, pfad, klasse = 'musiker') => {
    const x = mitCharakter(sp, name, () => {}, klasse);
    x.erfahrung = t[Math.min(stufe, 3) - 1] - 1;
    sp.erfahrungGeben(x, 1);
    if (pfad) sp.pfadWaehlen(x, pfad);
    x.erfahrung = t[stufe - 1] - 1;
    sp.erfahrungGeben(x, 1);
    sp.wechseln(x, 'wald', 'von_hoehle');
    x.unverwundbarBis = 0;
    return x;
  };
  const still = (g) => Object.assign(g, { tot: false, leben: 50, getroffenBis: 0, stossBis: 0, betaeubtBis: 0, verwirrtBis: 0, langsamBis: 0, markiertBis: 0, giftBei: 0, vx: 0, vy: 0, wechselBei: uhr + 1e6, zielId: 'x' });
  const mia = mk('Mia', 2);
  const ben = mk('Ben', 1, null, 'kaempfer');
  pruefe(mia.werte.faehigkeit.name === 'Klangstoß' && mia.werte.aktionen.map((a) => a.taste).join('') === 'FT', `Musiker Stufe 2: Q ${mia.werte.faehigkeit.name}, ${mia.werte.aktionen.map((a) => a.taste + ' ' + a.name).join(', ')}`);
  const g = wald.gegner[0];
  const hau = (wer) => {
    still(g);
    Object.assign(wer, { x: g.x, y: g.y + 20, naechsterHieb: 0 });
    sp.hieb(wer, { r: 'oben' });
    return 50 - g.leben;
  };
  // Lied der Tapferen: Ben nah dabei schlägt härter, Cleo weit weg nicht.
  const vorher = hau(ben);
  const cleo = mk('Cleo', 1, null, 'kaempfer');
  Object.assign(ben, { x: mia.x + 40, y: mia.y });
  Object.assign(cleo, { x: mia.x + 200, y: mia.y });
  sp.aktion(mia, { id: 'tapfere' });
  const beschwingt = hau(ben), cleoHieb = hau(cleo);
  uhr += 13000;
  const verklungen = hau(ben);
  pruefe(beschwingt === vorher + 1 && cleoHieb === vorher && verklungen === vorher, `Lied der Tapferen: Ben ${vorher} → ${beschwingt}, Cleo weit weg ${cleoHieb}, nach 12 s wieder ${verklungen}`);
  sp.verlassen(cleo.id);
  // Das Lied stärkt auch Pfeile.
  const bo = mk('Bo', 1, null, 'waldlaeufer');
  Object.assign(bo, { x: mia.x + 20, y: mia.y, richtung: 'oben' });
  sp.faehigkeit(bo, { r: 'oben' });
  const pfeil1 = [...wald.geschosse.values()].find((p) => p.von === bo.id)?.schaden;
  wald.geschosse.clear();
  mia.aktionBereit = {};
  sp.aktion(mia, { id: 'tapfere' });
  bo.faehigkeitBereit = 0;
  sp.faehigkeit(bo, { r: 'oben' });
  const pfeil2 = [...wald.geschosse.values()].find((p) => p.von === bo.id)?.schaden;
  wald.geschosse.clear();
  pruefe(pfeil1 > 0 && pfeil2 === pfeil1 + 1, `Lied stärkt Pfeile: ${pfeil1} → ${pfeil2}`);
  sp.verlassen(bo.id);
  uhr += 13000;
  // Lied der Lethargie: nah langsam, weit weg nicht.
  const [nah, fern] = wald.gegner;
  Object.assign(still(nah), { x: mia.x + 60, y: mia.y });
  Object.assign(still(fern), { x: mia.x + 200, y: mia.y });
  sp.aktion(mia, { id: 'lethargie' });
  pruefe(uhr < nah.langsamBis && !(uhr < fern.langsamBis) && !(uhr < nah.betaeubtBis), 'Lied der Lethargie: der nahe Schleim ist langsam (nicht starr), der ferne nicht');
  // Klangstoß: vorn getroffen und weggestoßen, hinten nicht.
  Object.assign(still(nah), { x: mia.x, y: mia.y - 40 });
  Object.assign(still(fern), { x: mia.x, y: mia.y + 40 });
  mia.faehigkeitBereit = 0;
  sp.faehigkeit(mia, { r: 'oben' });
  pruefe(nah.leben < 50 && uhr < nah.stossBis && fern.leben === 50, `Klangstoß: vorn ${50 - nah.leben} Schaden und weggestoßen, hinten ${50 - fern.leben}`);
  sp.verlassen(mia.id);
  // Klangwirkung (Stufe 6): das Lied schützt. Wurf 0,15: Bens Kampfstil
  // (0,1) allein reicht nicht, mit dem Lied (0,1) prallt es ab.
  const mus6 = mk('Mus', 6);
  Object.assign(ben, { x: mus6.x + 30, y: mus6.y });
  const trifft = () => {
    wurf = 0.15;
    const l = (ben.leben = 4);
    ben.unverwundbarBis = 0;
    sp.spielerTreffen(ben, { x: ben.x, y: ben.y - 20, w: { schaden: 1 } }, uhr);
    wurf = 0.99;
    return ben.leben < l;
  };
  const ohne = trifft();
  sp.aktion(mus6, { id: 'tapfere' });
  const mit = trifft();
  pruefe(ohne && !mit, 'Klangwirkung: mit dem Lied prallt ein Treffer ab (Wurf 0,15), ohne nicht');
  sp.verlassen(mus6.id);
  uhr += 13000;
  // Geschichtenerzähler: das Lied heilt beim Anstimmen.
  const erz = mk('Erz', 3, 'geschichtenerzaehler');
  Object.assign(ben, { x: erz.x + 30, y: erz.y, leben: 2 });
  sp.aktion(erz, { id: 'tapfere' });
  pruefe(ben.leben === 3, `Inspirierende Erzählung: das Lied heilt Ben 2 → ${ben.leben}`);
  sp.verlassen(erz.id);
  // Epos des Augenblicks (R, Geschichtenerzähler 10): Schutz aus dem „mahl"
  // mit boni.schutz — vorher ging nur der Schaden des Koch-Mahls durch.
  uhr += 13000;
  const epos = mk('Epos', 10, 'geschichtenerzaehler');
  Object.assign(ben, { x: epos.x + 30, y: epos.y });
  const vorEpos = trifft();
  sp.aktion(epos, { id: 'epos' });
  pruefe(vorEpos && !trifft(), 'Epos des Augenblicks: ein Treffer prallt ab (Wurf 0,15), vorher nicht');
  sp.verlassen(epos.id);
  // Wandbrecher: Publikum adressieren (R) hält die Gegner an.
  const wb = mk('Wand', 7, 'wandbrecher');
  Object.assign(still(nah), { x: wb.x + 60, y: wb.y });
  sp.aktion(wb, { id: 'publikum_w' });
  pruefe(uhr < nah.betaeubtBis && uhr < nah.langsamBis, 'Publikum adressieren: der Schleim steht still');
}

// ---------- Gelehrter ----------
{
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr, zufall: () => 0.99 });
  const t = werte.stufen.erfahrung;
  const wald = sp.gebiete.get('wald');
  const mk = (name, stufe, pfad, klasse = 'gelehrter') => {
    const x = mitCharakter(sp, name, () => {}, klasse);
    x.erfahrung = t[Math.min(stufe, 3) - 1] - 1;
    sp.erfahrungGeben(x, 1);
    if (pfad) sp.pfadWaehlen(x, pfad);
    x.erfahrung = t[stufe - 1] - 1;
    sp.erfahrungGeben(x, 1);
    sp.wechseln(x, 'wald', 'von_hoehle');
    x.unverwundbarBis = uhr + 1e9;
    return x;
  };
  const still = (g) => Object.assign(g, { tot: false, leben: 50, getroffenBis: 0, stossBis: 0, betaeubtBis: 0, verwirrtBis: 0, langsamBis: 0, markiertBis: 0, giftBei: 0, vx: 0, vy: 0, wechselBei: uhr + 1e6, zielId: 'x', wiederBei: 0 });
  const alleWeg = () => { for (const g of wald.gegner) Object.assign(g, { tot: true, wiederBei: uhr + 1e9 }); };
  const gel = mk('Gil', 2);
  const ben = mk('Ben', 1, null, 'kaempfer');
  pruefe(gel.werte.faehigkeit.name === 'Armbrustbolzen' && gel.werte.aktionen.map((a) => a.taste).join('') === 'FT' && gel.werte.kampf.diagnose,
    `Gelehrter Stufe 2: Q ${gel.werte.faehigkeit.name}, ${gel.werte.aktionen.map((a) => a.taste + ' ' + a.name).join(', ')}, sieht Lebensbalken`);
  const g = wald.gegner[0];
  const hau = (wer) => {
    still(g);
    Object.assign(wer, { x: g.x, y: g.y + 20, naechsterHieb: 0 });
    sp.hieb(wer, { r: 'oben' });
    return 50 - g.leben;
  };
  // Analyseblick: der nächste Gegner — Bens Hieb macht +1.
  const vorher = hau(ben);
  alleWeg();
  Object.assign(still(g), { x: gel.x + 60, y: gel.y });
  sp.aktion(gel, { id: 'analyseblick' });
  const markiert = uhr < g.markiertBis;
  const g0 = g.markiertBis;
  const mitAnalyse = (() => { Object.assign(ben, { x: g.x, y: g.y + 20, naechsterHieb: 0 }); g.leben = 50; g.getroffenBis = 0; sp.hieb(ben, { r: 'oben' }); return 50 - g.leben; })();
  pruefe(markiert && g0 && mitAnalyse === vorher + 1, `Analyseblick: Bens Hieb ${vorher} → ${mitAnalyse}`);
  // Alchemiekrug: zwei Kacheln vor ihm Säure, verlangsamt.
  alleWeg();
  Object.assign(still(g), { x: gel.x, y: gel.y - 64 });
  sp.aktion(gel, { id: 'alchemiekrug', r: 'oben' });
  pruefe(g.leben === 49 && uhr < g.langsamBis, `Alchemiekrug: ${50 - g.leben} Schaden, der Schleim ist langsam`);
  sp.verlassen(gel.id);
  // Stufe 6: Gelehrtenhilfe (R) stärkt Ben; Stufe 5: Analyse +2.
  const g6 = mk('Gerd', 6);
  Object.assign(ben, { x: g6.x + 30, y: g6.y });
  sp.aktion(g6, { id: 'gelehrtenhilfe' });
  const beraten = hau(ben);
  alleWeg();
  Object.assign(still(g), { x: g6.x + 60, y: g6.y });
  sp.aktion(g6, { id: 'analyseblick' });
  const doppelt = (() => { Object.assign(ben, { x: g.x, y: g.y + 20, naechsterHieb: 0 }); g.leben = 50; g.getroffenBis = 0; sp.hieb(ben, { r: 'oben' }); return 50 - g.leben; })();
  pruefe(beraten === vorher + 1 && doppelt === vorher + 1 + 2, `Gelehrtenhilfe: Hieb ${vorher} → ${beraten}; mit Schwachstellen (Stufe 5) analysiert ${doppelt}`);
  sp.verlassen(g6.id);
  uhr += 11000;
  // Stufe 15: der Analyseblick erfasst drei Gegner.
  const g15 = mk('Greta', 15);
  alleWeg();
  const vier = wald.gegner.slice(0, 4);
  vier.forEach((x, i) => Object.assign(still(x), { x: g15.x + 40 + i * 30, y: g15.y }));
  sp.aktion(g15, { id: 'analyseblick' });
  const n = vier.filter((x) => uhr < x.markiertBis).length;
  pruefe(n === 3, `Kenne deinen Feind II: ${n} von 4 Gegnern analysiert`);
  sp.verlassen(g15.id);
  // Technologe 3: T ist jetzt der Schallblaster (Falle); 10: die Drohne schießt selbst.
  const tec = mk('Tec', 10, 'technologe');
  const tAktion = tec.werte.aktionen.find((a) => a.taste === 'T');
  alleWeg();
  // Betäubt, damit er stehen bleibt — sonst läuft er auf Tec zu, und der Bolzen geht vorbei.
  // Ein freier Fleck vor Riftside: am Höhlenausgang stehen Büsche im Schussweg.
  Object.assign(tec, { x: 272, y: 856 });
  Object.assign(still(g), { x: tec.x + 90, y: tec.y - 30, betaeubtBis: uhr + 1e6 });
  wald.geschosse.clear();
  let schuesse = 0;
  for (let i = 0; i < 20 && g.leben === 50; i++) {
    uhr += 50;
    sp.schritt(0.05);
    schuesse = Math.max(schuesse, [...wald.geschosse.values()].filter((p) => p.von === tec.id).length);
  }
  const stand = wald.stand(uhr).spieler.find((x) => x.id === tec.id);
  pruefe(tAktion?.art === 'falle' && schuesse === 1 && g.leben === 49 && stand.e.includes('d'),
    `Technologe: T ${tAktion?.name}; ${schuesse} Schuss, Schleim bei ${Math.round(g.x - tec.x)},${Math.round(g.y - tec.y)}, die Drohne trifft den Schleim schräg vorn (${50 - g.leben} Schaden), Stand „${stand.e}"`);
  // Dicht unter einer Hecke: auf Kopfhöhe (y - 30) flöge der Bolzen durch
  // die Hecke und bliebe hängen — auf Hüfthöhe trifft er. Die Stelle sucht
  // der Test in der Karte, wie sie der Server sieht.
  const ww = wald.welt, fest = (x, y) => ww.istFest(Math.floor(x / 32), Math.floor(y / 32));
  let hecke = null;
  for (let ty = 3; ty < ww.hoehe - 3 && !hecke; ty++) for (let tx = 2; tx < ww.breite - 5 && !hecke; tx++) for (const fy of [8, 14, 20, 26]) {
    const x = tx * 32 + 16, y = ty * 32 + fy;
    if (!ww.frei(x, y) || !ww.frei(x + 104, y)) continue;
    let unten = true, oben = false;
    for (let d = 8; d <= 88; d += 2) {
      if (fest(x + 14 + d, y - 14 + (d / 90) * 8)) unten = false;
      if (fest(x + 14 + d, y - 30 + (d / 90) * 24)) oben = true;
    }
    if (unten && oben) {
      hecke = { x, y };
      break;
    }
  }
  Object.assign(tec, hecke ?? {});
  Object.assign(still(g), { x: tec.x + 104, y: tec.y, betaeubtBis: uhr + 1e6 });
  uhr += 3000;
  for (let i = 0; i < 20 && g.leben === 50; i++) { uhr += 50; sp.schritt(0.05); }
  pruefe(hecke && g.leben === 49, `Drohne dicht unter einer Hecke (${hecke?.x}, ${hecke?.y}): trifft trotzdem (${50 - g.leben} Schaden)`);
  // Ohne Gegner in Reichweite schießt sie nicht.
  alleWeg();
  wald.geschosse.clear();
  for (let i = 0; i < 60; i++) { uhr += 50; sp.schritt(0.05); }
  pruefe(wald.geschosse.size === 0, 'Drohne: ohne Gegner in fünf Kacheln kein Schuss');
  sp.verlassen(tec.id);
  // Wissenschaftler 10: das Säurefeld ist doppelt so groß.
  const wis = mk('Wis', 10, 'wissenschaftler');
  alleWeg();
  Object.assign(still(g), { x: wis.x + 60, y: wis.y - 64 });
  sp.aktion(wis, { id: 'alchemiekrug', r: 'oben' });
  pruefe(g.leben === 48, `Reagenzienfeld: der Krug trifft auch eine Kachel daneben (${50 - g.leben} Schaden mit Formeln)`);
}

// ---------- Drachenreiter ----------
{
  const sp = new Spiel(karten, werteWald, { jetzt: () => uhr, zufall: () => 0.99 });
  const t = werte.stufen.erfahrung;
  const wald = sp.gebiete.get('wald');
  const mk = (name, stufe, pfad, klasse = 'drachenreiter') => {
    const x = mitCharakter(sp, name, () => {}, klasse);
    x.erfahrung = t[Math.min(stufe, 3) - 1] - 1;
    sp.erfahrungGeben(x, 1);
    if (pfad) sp.pfadWaehlen(x, pfad);
    x.erfahrung = t[stufe - 1] - 1;
    sp.erfahrungGeben(x, 1);
    sp.wechseln(x, 'wald', 'von_riftside');
    // Ein freier Fleck vor Riftside (s. Drohne): keine Hecke im Schussweg.
    Object.assign(x, { x: 272, y: 856, unverwundbarBis: uhr + 1e9 });
    return x;
  };
  const still = (g) => Object.assign(g, { tot: false, leben: 50, getroffenBis: 0, stossBis: 0, betaeubtBis: uhr + 1e6, verwirrtBis: 0, langsamBis: 0, markiertBis: 0, giftBei: 0, vx: 0, vy: 0, wechselBei: uhr + 1e6, zielId: 'x', wiederBei: 0 });
  const alleWeg = () => { for (const g of wald.gegner) Object.assign(g, { tot: true, wiederBei: uhr + 1e9 }); };
  const lauf = (ms) => { for (let i = 0; i < ms; i += 50) { uhr += 50; sp.schritt(0.05); } };
  const dora = mk('Dora', 2);
  const stand = () => wald.stand(uhr).spieler.find((x) => x.id === dora.id);
  pruefe(dora.werte.faehigkeit.name === 'Drachenfeuer' && dora.werte.aktionen.map((a) => a.taste + a.id).join(',') === 'Ffeueratem' && stand().e.includes('D') && !dora.werte.kampf.drache,
    `Drachenreiter Stufe 2: Q ${dora.werte.faehigkeit.name}, ${dora.werte.aktionen.map((a) => a.taste + ' ' + a.name).join(', ')}, Drache im Stand („${stand().e}"), greift noch nicht von selbst an`);
  // Feueratem: vorn 2 Schaden und eine Sekunde später noch einmal (brennt), hinten nichts.
  alleWeg();
  const [vorn, hinten] = wald.gegner;
  Object.assign(still(vorn), { x: dora.x, y: dora.y - 50 });
  Object.assign(still(hinten), { x: dora.x, y: dora.y + 50 });
  dora.richtung = 'oben';
  sp.aktion(dora, { id: 'feueratem' });
  const sofort = 50 - vorn.leben;
  lauf(1100);
  pruefe(sofort === 2 && vorn.leben === 47 && hinten.leben === 50, `Feueratem: vorn ${sofort} Schaden, nach einer Sekunde brennt es (${50 - vorn.leben}), hinten ${50 - hinten.leben}`);
  // Ohne Drachenbindung (Stufe 7) speit der Drache nicht von selbst.
  alleWeg();
  Object.assign(still(vorn), { x: dora.x + 60, y: dora.y - 20 });
  wald.geschosse.clear();
  lauf(1000);
  pruefe(wald.geschosse.size === 0 && vorn.leben === 50, 'Stufe 2: der Drache greift nicht von selbst an');
  sp.verlassen(dora.id);
  // Stufe 7: Drachenbindung — ein Feuerball von selbst, mit Natürlicher Entwicklung 2 Schaden.
  const d7 = mk('Drago', 7);
  alleWeg();
  Object.assign(still(vorn), { x: d7.x + 60, y: d7.y - 20 });
  wald.geschosse.clear();
  let baelle = 0;
  for (let i = 0; i < 30 && vorn.leben === 50; i++) {
    uhr += 50;
    sp.schritt(0.05);
    baelle = Math.max(baelle, [...wald.geschosse.values()].filter((p) => p.von === d7.id && p.art === 'feuerball').length);
  }
  pruefe(baelle === 1 && vorn.leben === 48, `Drachenbindung: der Drache speit von selbst einen Feuerball (${50 - vorn.leben} Schaden)`);
  sp.verlassen(d7.id);
  // Stufe 15: Drachenflug (R) und Sturzflug (T, vier Kacheln, nicht durch Wände).
  const d15 = mk('Flug', 15);
  sp.aktion(d15, { id: 'flugmeister' });
  const fliegt = uhr < d15.sprintBis;
  const x0 = d15.x;
  d15.richtung = 'rechts';
  sp.aktion(d15, { id: 'sturzflug', r: 'rechts' });
  pruefe(fliegt && d15.x - x0 > 64 && d15.x - x0 <= 128, `Drachenflug ${fliegt ? 'an' : 'aus'}; Sturzflug ${d15.x - x0} px nach rechts`);
  sp.verlassen(d15.id);
  // Zwei Körper, eine Seele 18: R ist die Verschmolzene Gestalt (statt Drachenflug).
  const zk = mk('Zwei', 18, 'zwei_koerper');
  const r = zk.werte.aktionen.find((a) => a.taste === 'R');
  sp.aktion(zk, { id: r.id });
  pruefe(r.id === 'verschmolzen' && uhr < zk.rauschBis, `Zwei Körper 18: R ${r.name}, wirkt`);
}

// ---------- Menü: Charakter neu, Welt zurücksetzen ----------
{
  const datei = join(mkdtempSync(join(tmpdir(), 'spielstand-')), 'stand.json');
  const sp = new Spiel(karten, werte, { jetzt: () => uhr, spielstand: new Spielstand(datei) });
  const pa = [], pb = [];
  const a = mitCharakter(sp, 'Alma', (m) => pa.push(m));
  const b = mitCharakter(sp, 'Bert', (m) => pb.push(m));
  sp.zustandSetzen('tempel_geschlossen');
  sp.nachricht(a.id, { t: 'neu_anfangen' });
  for (let i = 0; i < 200; i += 50) {
    uhr += 50;
    sp.schritt(0.05);
  }
  uhr += 60000;
  sp.schritt(0.05);
  const nachSpeichern = 'alma' in sp.spielstand.daten.spieler;
  sp.verlassen(a.id);
  const gespeichert = JSON.parse(readFileSync(datei, 'utf8'));
  pruefe(pa.some((m) => m.t === 'neustart') && !nachSpeichern && !('alma' in gespeichert.spieler) && 'bert' in gespeichert.spieler && gespeichert.welt.zustaende?.tempel_geschlossen,
    'Charakter neu: Alma ist aus dem Spielstand, auch nach dem Speichern und Gehen; Bert und die Welt bleiben');
  const a2 = sp.beitreten('Alma', () => {});
  pruefe(a2.waehlt, 'Alma kommt zurück und wählt neu');
  sp.verlassen(a2.id);
  // Welt zurücksetzen: mit Bert im Spiel nicht.
  pb.length = 0;
  const c = mitCharakter(sp, 'Cleo', () => {});
  sp.nachricht(b.id, { t: 'welt_zuruecksetzen' });
  pruefe(sp.zustaende().tempel_geschlossen && !pb.some((m) => m.t === 'neustart'), 'Welt zurücksetzen: nicht, solange noch jemand im Spiel ist');
  sp.verlassen(c.id);
  sp.gebiete.get('tempel').fallen.kugel.z = 'liegt';
  sp.nachricht(b.id, { t: 'welt_zuruecksetzen' });
  sp.verlassen(b.id);
  const leer = JSON.parse(readFileSync(datei, 'utf8'));
  pruefe(pb.some((m) => m.t === 'neustart') && !Object.keys(leer.spieler).length && !Object.keys(leer.welt.zustaende ?? {}).length && sp.gebiete.get('tempel').fallen.kugel.z === 'ruht',
    'allein: Welt zurückgesetzt — Spielstand leer, die Kugel im Tempel ruht wieder');
}

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
