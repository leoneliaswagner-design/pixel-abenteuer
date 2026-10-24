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
// Die Karte selbst hat die Eigenschaft „titel" (für Meldungen) und „licht":
// ohne = draußen (Tag und Nacht), „innen" = immer hell, „dunkel" = Höhle.
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { karteBauen } from './kartenbau.mjs';

const KARTEN = {
  // Die Hafenstadt auf der Startinsel. Die Textkarte hier ist die Quelle,
  // bis die Stadt in Tiled weitergebaut wird.
  riftside: {
    titel: 'Riftside',
    grund: 'pflaster',
    uebergaenge: {
      P: { ziel: 'wald', ankunft: 'von_riftside' },
      // Am Ende des mittleren Stegs liegen die Boote: hinaus aufs Meer.
      M: { ziel: 'meer', ankunft: 'hafen_riftside', kachel: 'bruecke' },
      // Die Fischergasse: ein Riss in den Dschungeltempel.
      R: { ziel: 'tempel', ankunft: 'von_riftside', art: 'riss', bedingung: '!tempel_geschlossen' },
      // Begehbare Haustüren, zeilenweise gelesen.
      N: [
        { ziel: 'rathaus', ankunft: 'eingang' },
        { ziel: 'hafenmeisterei', ankunft: 'eingang' },
        { ziel: 'haus_pip', ankunft: 'eingang' },
      ],
    },
    ankuenfte: {
      w: { id: 'vom_wald', richtung: 'unten' },
      Y: { id: 'vom_meer', richtung: 'oben' },
      z: { id: 'aus_tempel', richtung: 'unten' },
      e: [
        { id: 'aus_rathaus', richtung: 'unten' },
        { id: 'aus_hafenmeisterei', richtung: 'unten' },
        { id: 'aus_haus_pip', richtung: 'unten' },
      ],
    },
    dinge: {
      '@': [
        { name: 'Torwache Bruno', aussehen: 'wache', richtung: 'unten',
          text: 'Halt! … Ach, ihr seid es.\n\nHinter dem Tor liegt der Inselwald. Seit die Risse aufgetaucht sind, wimmelt es dort von Schleimen.' },
        // Händlerin: „laden" verweist auf inhalte/daten/laeden.json.
        { name: 'Krämerin', aussehen: 'kraemerin', richtung: 'unten', laden: 'kraemerin' },
        { name: 'Pip', aussehen: 'kind', richtung: 'links',
          text: 'Ich hab es gesehen! In der Fischergasse ist die Luft aufgerissen, und dahinter war ein Dschungel!\n\nMama sagt, ich darf da nicht hin.',
          text_wenn_tempel_geschlossen: 'Der Riss in der Fischergasse ist weg! Wart ihr das? Ihr seid echte Helden!' },
        { name: 'Bürgermeister Aldric', aussehen: 'buergermeister', richtung: 'unten',
          text: 'Willkommen in Riftside! Ich bin Aldric, der Bürgermeister.\n\nSeit einigen Tagen reißt die Welt in unseren Gassen auf. Wer hineingeht, kommt an Orten heraus, die es hier gar nicht gibt.\n\nIn der Fischergasse, östlich vom Markt, flimmert so ein Riss. Bitte seht nach, was dahinter ist!',
          text_wenn_tempel_geschlossen: 'Der Riss in der Fischergasse ist geschlossen! Ihr habt Riftside einen großen Dienst erwiesen.\n\nAber ich fürchte, es war nicht der letzte …' },
        { name: 'Hafenmeisterin Mara', aussehen: 'hafenmeisterin', richtung: 'oben',
          text: 'Kein Schiff legt mehr an, seit die Risse da sind.\n\nDie Kapitäne sagen, der ganze Hafen flimmert schon von weitem.' },
      ],
      '!': [{ text: 'Riftside\n\nNorden: Stadttor zum Inselwald\nSüden: Hafen\nOsten: Fischergasse' }],
      '$': [{ inhalt: 'gold:10', id: 'riftside_gold' }],
    },
    text: `
TTTTTTTTTTTTTTTTTTTTTPPTTTTTTTTTTTTTTTTTTTTT
T.......*..........@.pp..........*.........T
T.............rrrrrrrwp....................T
T..rrrrr.rrrrrrrrrrrrpp....T.rrrrr.rrrrr...T
TT.qqqqq.qqqqqqqqqqqqpp......qqqqq.qqqqq..TT
TT.hfnfh.hfnfhhfhNhfhpp......hfnfh.hfnfh...T
T....p.....p.....e...pp........p.....p.....T
T....p.....p.....p..lppl.......p.....p.....T
T.b..p..b..p....pppppppppppp...p.....p..b..T
T....p.....p..**pppppppp@pppb..p.....p.....T
T....p.....p....ppBppppp!ppp...p.....p.....T
T.pppppppppppppppppppppppppppppppppppppppp.T
T.pppppppppppppppppppppppppppp@ppppppppppp.T
T.l.............pp@ppppppppp......p......l.T
T...............pppppppppppp......p........T
T..rrrrr.rrrrr......lppl.....rrrrrRrrrrr...T
T..qqqqq.qqqqq.......pp......qqqqqpqqqqq...T
T.*hfnfh.hfNfhb......pp...*..hfNfhphfnfh.b.T
T....p.....e...b.....pp........e..z..p.....T
T$...p.....p.........pp........p..p..p.....T
T....pkv...p.........SS..kkv...p..p..p.v...T
T.pppppppppppppppppppppppppppppppppppppppp.T
T.pppppppppppppppppppppp@ppppppppppppppppp.T
TssssssssssssssssssssssssssssssssssssssssssT
~~~~~~~~HH~~~~~~~~~~~HH~~~~~~~~~~HH~~~~~~~~~
~~~~~~~~HH~~~~~~~~~~~HH~~~~~~~~~~HH~~~~~~~~~
~~~~~~~~HH~~~~~~~~~~~YH~~~~~~~~~~HH~~~~~~~~~
~~~~~~~~HH~~~~~~~~~~~HH~~~~~~~~~~HH~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~MM~~~~~~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
`,
  },
  // ---------- Innenräume von Riftside ----------
  // Rand „J", Wand „I" oben, Dielen „d", Ausgang „u" unten in der Wand.
  rathaus: {
    titel: 'das Rathaus',
    licht: 'innen',
    grund: 'dielen',
    uebergaenge: { u: { ziel: 'riftside', ankunft: 'aus_rathaus', kachel: 'fussmatte' } },
    ankuenfte: { a: { id: 'eingang', richtung: 'oben' } },
    dinge: {
      '@': [{
        name: 'Ratsschreiber Theo', aussehen: 'schreiber', richtung: 'unten',
        text: 'Ah, Besucher. Ich führe Buch über die Risse.\n\nDer in der Fischergasse ist der erste, den wir gefunden haben. Ich fürchte, nicht der letzte.',
        text_wenn_tempel_geschlossen: 'Die Fischergasse ist wieder eine Gasse! Ich trage es gleich ein.\n\nBleiben noch die anderen …',
      }],
      '!': [{ text: 'Bekanntmachung des Rates:\n\nWer einen Riss betritt, tut dies auf eigene Gefahr. Kinder bleiben den Gassen fern!' }],
    },
    text: `
JJJJJJJJJJJJJJJJ
JIIIIIIIIIIIIIIJ
JxxdddddddddddxJ
JdddmmmmmmmddddJ
Jddd@dddd!dddddJ
JddddddddddddddJ
JcccccccccccccdJ
JddddddadddddddJ
JddddddddddddddJ
JJJJJJJuJJJJJJJJ
`,
  },
  hafenmeisterei: {
    titel: 'die Hafenmeisterei',
    licht: 'innen',
    grund: 'dielen',
    uebergaenge: { u: { ziel: 'riftside', ankunft: 'aus_hafenmeisterei', kachel: 'fussmatte' } },
    ankuenfte: { a: { id: 'eingang', richtung: 'oben' } },
    dinge: {
      '!': [{ text: 'Eine Seekarte. Fünf große Inseln, dazwischen unzählige kleine.\n\nIm Nordwesten ein Land mit Schneegebirgen. Südöstlich davon, klein eingezeichnet: Riftside.' }],
      '$': [{ inhalt: 'gold:5', id: 'hafenmeisterei_gold' }],
    },
    text: `
JJJJJJJJJJJJ
JIIIIIIIIIIJ
Jxx!ddddd$xJ
JddddddddddJ
JdmmddcccddJ
JdddddcccddJ
JvddddaddddJ
JkddddddddvJ
JJJJJJuJJJJJ
`,
  },
  haus_pip: {
    titel: 'Pips Haus',
    licht: 'innen',
    grund: 'dielen',
    uebergaenge: { u: { ziel: 'riftside', ankunft: 'aus_haus_pip', kachel: 'fussmatte' } },
    ankuenfte: { a: { id: 'eingang', richtung: 'oben' } },
    dinge: {
      '@': [{
        name: 'Elsa', aussehen: 'mutter', richtung: 'unten',
        text: 'Habt ihr Pip gesehen? Wenn er wieder an der Fischergasse herumlungert …\n\nSeit da dieser Riss flimmert, schlafe ich keine Nacht mehr.',
        text_wenn_tempel_geschlossen: 'Ihr habt den Riss geschlossen? Den Göttern sei Dank.\n\nJetzt kann ich endlich wieder ruhig schlafen.',
      }],
    },
    text: `
JJJJJJJJJJJJ
JIIIIIIIIIIJ
JyydddddxxdJ
JddddddddddJ
Jddd@dddmmdJ
JdccccddddvJ
JdccccadddkJ
JddddddddddJ
JJJJJJuJJJJJ
`,
  },
  wald: {
    titel: 'den Inselwald',
    grund: 'gras',
    // E: Treppe in der Ruine hinunter in die Höhle; a: dort kommt man zurück an.
    uebergaenge: {
      E: { ziel: 'hoehle', ankunft: 'von_oben' },
      P: { ziel: 'riftside', ankunft: 'vom_wald', kachel: 'weg' },
      // Q: nach Osten in den tiefen Wald, wo die Monster aus monster.json wohnen.
      Q: { ziel: 'tiefwald', ankunft: 'vom_inselwald', kachel: 'gras' },
    },
    ankuenfte: { a: { id: 'von_hoehle', richtung: 'unten' }, w: { id: 'von_riftside', richtung: 'oben' }, z: { id: 'vom_tiefwald', richtung: 'links' } },
    // Dinge in der Reihenfolge, in der sie in der Textkarte stehen (zeilenweise).
    dinge: {
      '!': [{ text: 'Willkommen, Abenteurer!\n\nIm Südosten liegt eine alte Ruine. Man sagt, unter ihr beginne eine Höhle.' }],
      '@': [{
        name: 'Alter Mann', aussehen: 'alter_mann', richtung: 'unten',
        text: 'Ah, Besuch aus Riftside! Mit der Leertaste schwingst du dein Schwert.\n\nBüsche kann man schneiden. Manchmal steckt ein Herz darin.\n\nIn der alten Ruine im Südosten führt eine Treppe in eine Höhle. Dort soll hinter einer verschlossenen Tür ein Schatz liegen.',
        text_wenn_tempel_geschlossen: 'Man erzählt sich, der Riss in der Fischergasse sei fort. Warst du das?\n\nRiftside wird Leute wie dich brauchen.',
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
T.T....*.........~~~~......*...........Q
T....b....o......~~~~..........b....Tz.Q
T.....!..,..@....~~~~...o..............Q
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
T.......w..,...........~~~~...=.#.E.#..T
T.*..T..=....*..........~~~~..=.#####..T
TTTTTTTTPTTTTTTTTTTTTTTT~~~~TTTTTTTTTTTT
`,
  },
  hoehle: {
    titel: 'die Höhle',
    licht: 'dunkel',
    grund: 'hoehlenboden',
    uebergaenge: {
      A: { ziel: 'wald', ankunft: 'von_hoehle' },
    },
    ankuenfte: { a: { id: 'von_oben', richtung: 'oben' } },
    dinge: {
      '$': [{ inhalt: 'schluessel', id: 'hoehle_schluessel' }, { inhalt: 'gold:50', id: 'hoehle_gold' }],
      D: [{ id: 'hoehle_tuer' }],
    },
    text: `
XXXXXXXXXXXXXXXXXXXXXXXXXXXX
X:$::::::XXXX::::::::X:::::X
X::g:::::XXXX::::g:::X::$::X
X::::::::::::::::::::X:::::X
X:::XX::::::::::XX:::X:::::X
X:::XX::::g:::::XX:::D:::::X
X::::::::::::::::::::X:::::X
X::::::::XXXX::::::::X:::::X
X::g:::::XXXX::::g:::XXXXXXX
X::::::::::::::::::::XXXXXXX
X::::::::::a:::::::::XXXXXXX
XXXXXXXXXXXAXXXXXXXXXXXXXXXX
`,
  },
  // Östlich vom Inselwald: hier stehen die Monster aus monster.json, damit
  // Wald und Höhle ruhig bleiben (und die Prüfstände dort vorhersehbar).
  tiefwald: {
    titel: 'den tiefen Wald',
    grund: 'gras',
    uebergaenge: { Q: { ziel: 'wald', ankunft: 'vom_tiefwald', kachel: 'gras' } },
    ankuenfte: { z: { id: 'vom_inselwald', richtung: 'rechts' } },
    gegner: ['riesenratte', 'riesenratte', 'goblin', 'wolf', 'riesenfledermaus', 'riesenfledermaus', 'skelett', 'goblin', 'wolf', 'skelett'],
    dinge: {
      '!': [{ text: 'Vorsicht!\n\nHinter diesem Schild beginnt der tiefe Wald.' }],
      '$': [{ inhalt: 'heiltrank', id: 'tiefwald_trank' }],
    },
    text: `
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
T....b.......T.......,....b.$T
T..g.....,.......g.......T...T
T......T.....""""".....g.....T
T.,..........""""".......,...T
T......o...........T.........T
T...b......,..........o....g.T
T........T.......~~~~........T
Q.z.!............~~~~...T....T
Q.......g........~~~~........T
Q........,...T...~~~~....,...T
T.....b..........~~~~.g......T
T..T........o.........b...g..T
T.........,......T...........T
T...g.......""""".......T....T
T.......T...""""".....,......T
T.,..............b.......g...T
T......b.....g........o......T
T...T.............,......b...T
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
`,
  },
  tempel: {
    titel: 'den Dschungeltempel',
    licht: 'dunkel',
    grund: 'tempelboden',
    uebergaenge: { R: { ziel: 'riftside', ankunft: 'aus_tempel', art: 'riss' } },
    ankuenfte: { a: { id: 'von_riftside', richtung: 'oben' } },
    dinge: {
      '$': [{
        inhalt: 'rissstein', id: 'tempel_rissstein', setzt: 'tempel_geschlossen',
        meldung: 'Ein Beben geht durch Riftside — der Riss in der Fischergasse schließt sich!',
      }],
      // Magische Schrift: nur ein Magier kann sie lesen (Vorteil „magie").
      '!': [{ magisch: true, text: 'Eine Inschrift in leuchtenden Runen:\n\n„Wer den Stein nimmt, schließt das Tor."' }],
    },
    text: `
WWWWWWWWWWWWWWWWWW
W;;;;;;;;;;;;;;;;W
W;WW;;;;;$;;;;WW;W
W;WW;;;;;;;;;;WW;W
W;;;;g;;;;;;;g;;;W
W;;;;;;;;;;;;;;;;W
W;WW;;;;;;;;;;WW;W
W;WW;;g;;;;;g;;W;W
W;;;;;;;!a;;;;;;;W
W;;;;;;;;;;;;;;;;W
W;;;;;;;;R;;;;;;;W
WWWWWWWWWWWWWWWWWW
`,
  },
};

// ---------- Das Meer ----------
// Aus der Land-Wasser-Maske der Weltkarte (inseln.py → meer-maske.txt): eine
// Kachel je 4 Bildpunkte. Anlegestellen entstehen aus welt.json: jedes Gebiet
// mit „hafen" bekommt an der nächsten Küste einen Übergang dorthin und davor
// eine Ankunft „hafen_<gebiet>".
function meerBauen() {
  const daten = fileURLToPath(new URL('../inhalte/daten/', import.meta.url));
  const maske = readFileSync(join(daten, 'meer-maske.txt'), 'utf8').trim().split('\n');
  const welt = JSON.parse(readFileSync(join(daten, 'welt.json'), 'utf8'));
  const SCHRITT = 4;
  const h = maske.length, b = maske[0].length;
  const istLand = (x, y) => maske[y]?.[x] === '#';
  const zeilen = maske.map((z, y) =>
    [...z].map((c, x) => {
      if (c !== '#') return '&';
      const kueste = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => !istLand(x + dx, y + dy));
      return kueste ? '_' : '^';
    }));
  // Rand der Welt: dort ist Schluss (Fels statt Wasser, sonst segelte man
  // aus der Karte).
  for (let y = 0; y < h; y++) for (const x of [0, b - 1]) zeilen[y][x] = 'X';
  for (let x = 0; x < b; x++) for (const y of [0, h - 1]) zeilen[y][x] = 'X';
  const anleger = [], ankuenfte = [];
  for (const [gebiet, o] of Object.entries(welt.gebiete)) {
    if (!o.hafen || !o.punkt) continue;
    const px = o.punkt[0] / SCHRITT, py = o.punkt[1] / SCHRITT;
    let best = null;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < b - 1; x++) {
        if (zeilen[y][x] !== '&') continue;
        const land = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => istLand(x + dx, y + dy));
        if (!land) continue;
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        // Die Ankunft liegt zwei Kacheln weiter draußen, und dort muss Wasser sein.
        const ax = x - land[0] * 2, ay = y - land[1] * 2;
        if (zeilen[ay]?.[ax] !== '&' || zeilen[y - land[1]]?.[x - land[0]] !== '&') continue;
        if (!best || d < best.d) best = { x, y, ax, ay, d };
      }
    if (!best) throw new Error(`meer: kein Platz für den Anleger von „${gebiet}"`);
    // Drei Kacheln breit (quer zur Küste): mit Schwung trifft man eine
    // einzelne Kachel schwer — im Prüfstand fuhr das Boot daran vorbei.
    const quer = best.ax === best.x ? [1, 0] : [0, 1];
    for (const n of [-1, 0, 1]) {
      const x = best.x + quer[0] * n, y = best.y + quer[1] * n;
      if (zeilen[y]?.[x] === '&' || n === 0) {
        zeilen[y][x] = 'Z';
        anleger.push({ gebiet, hafen: o.hafen, x, y, ankunft: n === 0 });
      }
    }
    zeilen[best.ay][best.ax] = 'a';
    ankuenfte.push({ gebiet, x: best.ax, y: best.ay });
  }
  // Listen in der Reihenfolge, in der die Zeichen zeilenweise vorkommen.
  const zeilenweise = (liste) => [...liste].sort((p, q) => p.y - q.y || p.x - q.x);
  return {
    titel: 'das Meer', grund: 'see', meer: true,
    uebergaenge: { Z: zeilenweise(anleger).map((a) => ({ ziel: a.gebiet, ankunft: a.hafen, kachel: 'see' })) },
    ankuenfte: { a: zeilenweise(ankuenfte).map((a) => ({ id: `hafen_${a.gebiet}`, richtung: 'unten' })) },
    text: zeilen.map((z) => z.join('')).join('\n'),
  };
}
KARTEN.meer = meerBauen();

const nur = process.argv.slice(2);
for (const [name, def] of Object.entries(KARTEN)) {
  if (nur.length && !nur.includes(name)) continue;
  const karte = karteBauen(name, def);
  // KARTEN_ZIEL: anderer Ordner — für den Prüfstand, der die echten Karten
  // nicht überschreiben darf.
  const ziel = process.env.KARTEN_ZIEL ? join(process.env.KARTEN_ZIEL, `${name}.json`) : new URL(`../inhalte/karten/${name}.json`, import.meta.url);
  writeFileSync(ziel, JSON.stringify(karte));
  console.log(`${name}: ${karte.width}×${karte.height}, ${karte.layers[2].objects.length} Orte`);
}
