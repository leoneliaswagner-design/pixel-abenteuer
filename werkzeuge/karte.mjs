// Schreibt die Startkarte als Tiled-Datei (inhalte/karten/start.json).
// Aufruf: npm run karte
//
// Die Textkarte unten ist nur der Anfang. Sobald jemand die Karte in Tiled
// (https://www.mapeditor.org) bearbeitet, ist start.json die Quelle — dann
// dieses Skript nicht mehr laufen lassen, es würde die Arbeit überschreiben.
//
// Ebenen, die das Spiel erwartet:
//   boden        – Gras, Weg, Wasser, Brücke (Wasser ist fest)
//   hindernisse  – Steine, Büsche, Bäume, Mauern (Eigenschaft „fest")
//   orte         – Punkte: „spieler_start" und „gegner" (Eigenschaft „art")
import { writeFileSync } from 'node:fs';
import { KACHELN, GROESSE, SPALTEN, nummer } from './kacheln.mjs';

const TEXT = `
TTTTTTTTTTTTTTTTTT~~~~TTTTTTTTTTTTTTTTTT
T........,....b...~~~~....,....b.......T
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
T........,.......~~~~...o..............T
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
T..b....=.....g........~~~~...=.#...#..T
T.......=..,...........~~~~...=.#.*.#..T
T.*..T..=....*..........~~~~..=.#####..T
TTTTTTTT=TTTTTTTTTTTTTTT~~~~TTTTTTTTTTTT
`.trim().split('\n');

const breite = TEXT[0].length, hoehe = TEXT.length;
TEXT.forEach((z, i) => {
  if (z.length !== breite) throw new Error(`Zeile ${i} hat ${z.length} statt ${breite} Zeichen`);
});

const nachZeichen = Object.fromEntries(KACHELN.map((k, i) => [k.zeichen, i]).filter(([z]) => z));
const boden = [], hindernisse = [], orte = [];
let id = 1;

TEXT.forEach((zeile, y) =>
  [...zeile].forEach((z, x) => {
    let grund = nummer('gras');
    let oben = -1;
    if (z === 'S' || z === 'g') {
      orte.push({
        id: id++, name: z === 'S' ? 'spieler_start' : 'gegner', type: '', point: true, visible: true, rotation: 0,
        width: 0, height: 0, x: x * GROESSE + GROESSE / 2, y: y * GROESSE + GROESSE / 2,
        properties: z === 'g' ? [{ name: 'art', type: 'string', value: 'schleim' }] : [],
      });
    } else {
      const n = nachZeichen[z];
      if (n === undefined) throw new Error(`Unbekanntes Zeichen '${z}' bei ${x},${y}`);
      if (KACHELN[n].hindernis) oben = n;
      else grund = n;
    }
    // Gras-Abwechslung, damit die Wiese nicht wie Tapete aussieht.
    if (grund === nummer('gras') && (x * 7 + y * 13) % 5 === 0) grund = nummer('gras2');
    boden.push(grund + 1);
    hindernisse.push(oben + 1);
  }),
);

const zeilen = Math.ceil(KACHELN.length / SPALTEN);
const karte = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
  width: breite, height: hoehe, tilewidth: GROESSE, tileheight: GROESSE, infinite: false,
  nextlayerid: 4, nextobjectid: id,
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
        { name: 'name', type: 'string', value: k.name },
        ...['fest', 'schneidbar', 'baum'].filter((e) => k[e]).map((e) => ({ name: e, type: 'bool', value: true })),
      ],
    })),
  }],
};

writeFileSync(new URL('../inhalte/karten/start.json', import.meta.url), JSON.stringify(karte));
console.log(`Karte ${breite}×${hoehe}, ${orte.length} Orte geschrieben.`);
