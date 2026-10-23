// Schreibt die ersten Karten als Tiled-Dateien (inhalte/karten/<gebiet>.json).
// Aufruf: npm run karte            – alle
//         npm run karte -- hoehle  – nur diese
//
// Die Textkarten unten sind nur der Anfang. Sobald jemand eine Karte in Tiled
// (https://www.mapeditor.org) bearbeitet, ist die .json die Quelle — dann
// dieses Skript für diese Karte nicht mehr laufen lassen.
//
// Ebenen, die das Spiel erwartet:
//   boden        – Gras, Weg, Wasser, Brücke, Höhlenboden, Treppen
//   hindernisse  – Steine, Büsche, Bäume, Mauern, Fels (Eigenschaft „fest")
//   orte         – Punkte „spieler_start", „gegner" (Eigenschaft „art"),
//                  „ankunft" (Eigenschaft „id", optional „richtung") und
//                  Rechtecke „uebergang" (Eigenschaften „ziel" = Gebiet,
//                  „ankunft" = id der Ankunft dort)
// Die Karte selbst hat die Eigenschaft „titel" (für Meldungen).
import { writeFileSync } from 'node:fs';
import { KACHELN, GROESSE, SPALTEN, nummer } from './kacheln.mjs';

const KARTEN = {
  start: {
    titel: 'die Oberwelt',
    grund: 'gras',
    // E: Treppe in der Ruine hinunter in die Höhle; a: dort kommt man zurück an.
    uebergaenge: { E: { ziel: 'hoehle', ankunft: 'von_oben' } },
    ankuenfte: { a: { id: 'von_hoehle', richtung: 'unten' } },
    // Dinge in der Reihenfolge, in der sie in der Textkarte stehen (zeilenweise).
    dinge: {
      '!': [{ text: 'Willkommen, Abenteurer!\n\nIm Südosten liegt eine alte Ruine. Man sagt, unter ihr beginne eine Höhle.' }],
      '@': [{
        name: 'Alter Mann', aussehen: 'alter_mann', richtung: 'unten',
        text: 'Ah, Besuch! Mit der Leertaste schwingst du dein Schwert.\n\nBüsche kann man schneiden. Manchmal steckt ein Herz darin.\n\nUnten in der Höhle soll eine Truhe stehen. Sei vorsichtig!',
      }],
      '$': [{ inhalt: 'gold:20', id: 'oberwelt_gold' }],
    },
    text: `
TTTTTTTTTTTTTTTTTT~~~~TTTTTTTTTTTTTTTTTT
T........,....b...~~~~....,....b.....$.T
T..*....T.........~~~~.........T....*..T
T...,.......b....~~~~~...g....,........T
T.T.....g....,...~~~~...........bb..T..T
T.......o........~~~~..*...............T
T..,..............~~~~.......""""".....T
T.....b..T........~~~~...T....""""".,..T
T..*..............~~~~........"""""....T
T.........,...b..~~~~~...,.....g...o...T
T.T....*.........~~~~......*...........T
T....b......o....~~~~..........b....T..T
T.....!..,..@....~~~~...o..............T
T..T....S........~~~~....,........*....T
T...=============HHHH=============.....T
T...=......S.....~~~~..........=.......T
T...=...b........~~~~...b......=...g...T
T...=..*....T....~~~~..........=.......T
T...=.............~~~~....T....=.....,.T
T.T.=.....,.......~~~~.......*.=.......T
T...=..g...........~~~~........=..b....T
T...=...............~~~~.......=.......T
T..o=......*...b....~~~~...,...=..T....T
T...=...............~~~~.......=.......T
T...=====....T.......~~~~.....===......T
T.......=.............~~~~....=.##.##..T
T..b....=.....g........~~~~...=.#.a.#..T
T.......=..,...........~~~~...=.#.E.#..T
T.*..T..=....*..........~~~~..=.#####..T
TTTTTTTT=TTTTTTTTTTTTTTT~~~~TTTTTTTTTTTT
`,
  },
  hoehle: {
    titel: 'die Höhle',
    grund: 'hoehlenboden',
    uebergaenge: { A: { ziel: 'start', ankunft: 'von_hoehle' } },
    ankuenfte: { a: { id: 'von_oben', richtung: 'oben' } },
    dinge: { '$': [{ inhalt: 'schluessel', id: 'hoehle_schluessel' }] },
    text: `
XXXXXXXXXXXXXXXXXXXXXX
X:$::::::XXXX::::::::X
X::g:::::XXXX::::g:::X
X::::::::::::::::::::X
X:::XX::::::::::XX:::X
X:::XX::::g:::::XX:::X
X::::::::::::::::::::X
X::::::::XXXX::::::::X
X::g:::::XXXX::::g:::X
X::::::::::::::::::::X
X::::::::::a:::::::::X
XXXXXXXXXXXAXXXXXXXXXX
`,
  },
};

const DING_ZEICHEN = { '!': 'schild', '@': 'figur', '$': 'truhe' };
const nachZeichen = Object.fromEntries(KACHELN.map((k, i) => [k.zeichen, i]).filter(([z]) => z));
const eigenschaft = (name, wert) => ({ name, type: typeof wert === 'boolean' ? 'bool' : 'string', value: wert });

function karteBauen(name, def) {
  const text = def.text.trim().split('\n');
  const breite = text[0].length, hoehe = text.length;
  text.forEach((z, i) => {
    if (z.length !== breite) throw new Error(`${name}: Zeile ${i} hat ${z.length} statt ${breite} Zeichen`);
  });

  const boden = [], hindernisse = [], orte = [];
  const gezaehlt = {};
  let id = 1;
  const ort = (o) => orte.push({ id: id++, type: '', visible: true, rotation: 0, width: 0, height: 0, properties: [], ...o });
  const mitte = (x, y) => ({ x: x * GROESSE + GROESSE / 2, y: y * GROESSE + GROESSE / 2 });

  text.forEach((zeile, y) =>
    [...zeile].forEach((z, x) => {
      let grund = nummer(def.grund);
      let oben = -1;
      if (z === 'S') ort({ name: 'spieler_start', point: true, ...mitte(x, y) });
      else if (DING_ZEICHEN[z]) {
        const n = (gezaehlt[z] = (gezaehlt[z] ?? 0) + 1) - 1;
        const eig = def.dinge?.[z]?.[n];
        if (!eig) throw new Error(`${name}: Ding '${z}' Nr. ${n + 1} bei ${x},${y} hat keine Angaben in „dinge"`);
        ort({ name: DING_ZEICHEN[z], point: true, ...mitte(x, y), properties: Object.entries(eig).map(([k, v]) => eigenschaft(k, v)) });
      } else if (z === 'g') ort({ name: 'gegner', point: true, ...mitte(x, y), properties: [eigenschaft('art', 'schleim')] });
      else if (def.ankuenfte?.[z]) {
        const a = def.ankuenfte[z];
        ort({ name: 'ankunft', point: true, ...mitte(x, y), properties: [eigenschaft('id', a.id), ...(a.richtung ? [eigenschaft('richtung', a.richtung)] : [])] });
      } else {
        const n = nachZeichen[z];
        if (n === undefined) throw new Error(`${name}: unbekanntes Zeichen '${z}' bei ${x},${y}`);
        if (KACHELN[n].hindernis) oben = n;
        else grund = n;
        const u = def.uebergaenge?.[z];
        if (u)
          ort({
            name: 'uebergang', x: x * GROESSE, y: y * GROESSE, width: GROESSE, height: GROESSE,
            properties: [eigenschaft('ziel', u.ziel), eigenschaft('ankunft', u.ankunft)],
          });
      }
      // Gras-Abwechslung, damit die Wiese nicht wie Tapete aussieht.
      if (grund === nummer('gras') && (x * 7 + y * 13) % 5 === 0) grund = nummer('gras2');
      boden.push(grund + 1);
      hindernisse.push(oben + 1);
    }),
  );

  const zeilen = Math.ceil(KACHELN.length / SPALTEN);
  return {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
    width: breite, height: hoehe, tilewidth: GROESSE, tileheight: GROESSE, infinite: false,
    nextlayerid: 4, nextobjectid: id,
    properties: [eigenschaft('titel', def.titel)],
    layers: [
      { id: 1, name: 'boden', type: 'tilelayer', width: breite, height: hoehe, x: 0, y: 0, opacity: 1, visible: true, data: boden },
      { id: 2, name: 'hindernisse', type: 'tilelayer', width: breite, height: hoehe, x: 0, y: 0, opacity: 1, visible: true, data: hindernisse },
      { id: 3, name: 'orte', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: orte },
    ],
    // Eingebettet, nicht als .tsx — Phaser liest nur eingebettete Kachelsätze.
    tilesets: [{
      firstgid: 1, name: 'kacheln', image: '../grafik/kacheln.png',
      imagewidth: SPALTEN * GROESSE, imageheight: zeilen * GROESSE,
      tilewidth: GROESSE, tileheight: GROESSE, columns: SPALTEN, tilecount: KACHELN.length, margin: 0, spacing: 0,
      tiles: KACHELN.map((k, i) => ({
        id: i,
        properties: [
          eigenschaft('name', k.name),
          ...['fest', 'schneidbar', 'baum'].filter((e) => k[e]).map((e) => eigenschaft(e, true)),
        ],
      })),
    }],
  };
}

const nur = process.argv.slice(2);
for (const [name, def] of Object.entries(KARTEN)) {
  if (nur.length && !nur.includes(name)) continue;
  const karte = karteBauen(name, def);
  writeFileSync(new URL(`../inhalte/karten/${name}.json`, import.meta.url), JSON.stringify(karte));
  console.log(`${name}: ${karte.width}×${karte.height}, ${karte.layers[2].objects.length} Orte`);
}
