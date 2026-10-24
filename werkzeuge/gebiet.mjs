// Neue Gebiete anlegen und Karten pflegen — für alle, die selbst in Tiled
// (https://www.mapeditor.org) bauen wollen.
//
//   npm run gebiet -- neu <name> <breite> <höhe> <region> ["Titel"]
//       Legt inhalte/karten/<name>.json an (Wiese mit Baumrand und einer
//       Ankunft „start" in der Mitte), trägt das Gebiet in werte.json ein
//       und setzt es auf die Weltkarte (welt.json). <region> ist eine Region
//       aus welt.json (z. B. insel-047 = Startinsel) oder „riss" für einen
//       Ort hinter einem Dimensionsriss.
//
//   npm run gebiet -- kacheln
//       Erneuert den eingebetteten Kachelsatz in allen Karten — nötig, wenn
//       neue Kacheln dazugekommen sind (Phaser kennt nur eingebettete Sätze,
//       also steht er in jeder Karte einzeln).
//
// KARTEN_ZIEL / DATEN_ZIEL: andere Ordner (für den Prüfstand).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { karteBauen, kachelsatz } from './kartenbau.mjs';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const karten = process.env.KARTEN_ZIEL ?? join(wurzel, 'inhalte', 'karten');
const daten = process.env.DATEN_ZIEL ?? join(wurzel, 'inhalte', 'daten');
const lies = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fehler = (text) => {
  console.error(`Fehler: ${text}`);
  process.exit(1);
};

const [befehl, ...rest] = process.argv.slice(2);

if (befehl === 'neu') {
  const [name, b, h, region, titel] = rest;
  const breite = Number(b), hoehe = Number(h);
  if (!/^[a-z][a-z0-9_]*$/.test(name ?? '')) fehler('Name nur aus Kleinbuchstaben, Ziffern und _ (z. B. „leuchtturm").');
  if (!(breite >= 8 && breite <= 200 && hoehe >= 6 && hoehe <= 200)) fehler('Breite 8–200 und Höhe 6–200 Kacheln.');
  const werte = lies(join(daten, 'werte.json')), welt = lies(join(daten, 'welt.json'));
  if (werte.gebiete.includes(name) || existsSync(join(karten, `${name}.json`))) fehler(`„${name}" gibt es schon.`);
  if (region !== 'riss' && !welt.regionen[region])
    fehler(`Region „${region}" steht nicht in welt.json. Kontinente: ${Object.keys(welt.regionen).filter((r) => welt.regionen[r].art === 'kontinent').join(', ')}; Inseln: insel-001 …`);

  // Wiese mit Bäumen ringsum, die Ankunft „start" in der Mitte.
  const text = Array.from({ length: hoehe }, (_, y) =>
    Array.from({ length: breite }, (_, x) => {
      if (x === 0 || y === 0 || x === breite - 1 || y === hoehe - 1) return 'T';
      if (x === Math.floor(breite / 2) && y === Math.floor(hoehe / 2)) return 'a';
      return '.';
    }).join(''),
  ).join('\n');
  const karte = karteBauen(name, { titel: titel ?? name, grund: 'gras', ankuenfte: { a: { id: 'start', richtung: 'unten' } }, text });
  writeFileSync(join(karten, `${name}.json`), JSON.stringify(karte));
  werte.gebiete.push(name);
  writeFileSync(join(daten, 'werte.json'), JSON.stringify(werte, null, 2));
  welt.gebiete[name] = region === 'riss' ? { riss: true } : { region, punkt: welt.regionen[region].mitte };
  writeFileSync(join(daten, 'welt.json'), JSON.stringify(welt, null, 1));
  console.log(`${name}: ${breite}×${hoehe} angelegt (${region === 'riss' ? 'hinter einem Riss' : welt.regionen[region].name}).

Weiter in Tiled: inhalte/karten/${name}.json öffnen und malen.
  - Ebene „boden": Gras, Wege, Wasser …   Ebene „hindernisse": Bäume, Steine, Mauern
  - Ebene „orte": Punkte „ankunft" (id), „gegner" (art), „schild" (text),
    „figur" (name, text, aussehen), „truhe" (inhalt, id) und Rechtecke
    „uebergang" (ziel = Gebiet, ankunft = id dort)
Damit man hineinkommt, braucht ein anderes Gebiet einen „uebergang" mit
ziel ${name} und ankunft start.`);
} else if (befehl === 'kacheln') {
  let n = 0;
  for (const datei of readdirSync(karten).filter((d) => d.endsWith('.json'))) {
    const pfad = join(karten, datei), karte = lies(pfad);
    karte.tilesets = [{ ...kachelsatz(), firstgid: karte.tilesets?.[0]?.firstgid ?? 1 }];
    writeFileSync(pfad, JSON.stringify(karte));
    n++;
  }
  console.log(`Kachelsatz in ${n} Karten erneuert.`);
} else {
  console.log('Aufruf: npm run gebiet -- neu <name> <breite> <höhe> <region> ["Titel"]\n        npm run gebiet -- kacheln');
  process.exit(befehl ? 1 : 0);
}
