// Baut eine Tiled-Karte (JSON) aus einer Textkarte — für karte.mjs (die
// ersten Karten) und gebiet.mjs (neue, leere Gebiete). Die Zeichen sind die
// aus kacheln.mjs, dazu S, g, !, @, $, D und die Übergänge/Ankünfte der Karte.
import { KACHELN, GROESSE, SPALTEN, nummer } from './kacheln.mjs';

const DING_ZEICHEN = { '!': 'schild', '@': 'figur', '$': 'truhe', D: 'tuer', '?': 'sockel' };
const nachZeichen = Object.fromEntries(KACHELN.map((k, i) => [k.zeichen, i]).filter(([z]) => z));
const eigenschaft = (name, wert) => ({ name, type: typeof wert === 'boolean' ? 'bool' : 'string', value: wert });

export function karteBauen(name, def) {
  const text = def.text.trim().split('\n');
  const breite = text[0].length, hoehe = text.length;
  text.forEach((z, i) => {
    if (z.length !== breite) throw new Error(`${name}: Zeile ${i} hat ${z.length} statt ${breite} Zeichen`);
  });

  const boden = [], hindernisse = [], orte = [];
  const gezaehlt = {};
  // Übergänge und Ankünfte dürfen Listen sein: das n-te Vorkommen des
  // Zeichens (zeilenweise gelesen) nimmt den n-ten Eintrag — so führt jede
  // Haustür „N" in ein anderes Haus.
  const nimm = (tabelle, z, x, y) => {
    const e = tabelle?.[z];
    if (!Array.isArray(e)) return e;
    const schluessel = `${tabelle === def.uebergaenge ? 'u' : 'a'}${z}`;
    const n = (gezaehlt[schluessel] = (gezaehlt[schluessel] ?? 0) + 1) - 1;
    if (!e[n]) throw new Error(`${name}: '${z}' Nr. ${n + 1} bei ${x},${y} hat keinen Eintrag`);
    return e[n];
  };
  let id = 1;
  const ort = (o) => orte.push({ id: id++, type: '', visible: true, rotation: 0, width: 0, height: 0, properties: [], ...o });
  const mitte = (x, y) => ({ x: x * GROESSE + GROESSE / 2, y: y * GROESSE + GROESSE / 2 });

  // Boden unter Hindernissen, Dingen und Sonderzeichen: der eines Nachbarn
  // (oben, unten, links, rechts — Straßen laufen meist senkrecht durch einen
  // Startpunkt), sonst der Grund der Karte. Mit immer dem
  // Grund standen Kisten und Figuren in Riftside auf einem Pflasterfleck
  // mitten im Gras.
  const bodenZeichen = (z) => nachZeichen[z] !== undefined && !KACHELN[nachZeichen[z]].hindernis;
  const grundBei = (x, y) => {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const z = text[y + dy]?.[x + dx];
      if (z && bodenZeichen(z) && !KACHELN[nachZeichen[z]].fest && !def.uebergaenge?.[z]) return nachZeichen[z];
    }
    return nummer(def.grund);
  };

  text.forEach((zeile, y) =>
    [...zeile].forEach((z, x) => {
      let grund = grundBei(x, y);
      let oben = -1;
      if (z === 'S') ort({ name: 'spieler_start', point: true, ...mitte(x, y) });
      else if (DING_ZEICHEN[z]) {
        const n = (gezaehlt[z] = (gezaehlt[z] ?? 0) + 1) - 1;
        const eig = def.dinge?.[z]?.[n];
        if (!eig) throw new Error(`${name}: Ding '${z}' Nr. ${n + 1} bei ${x},${y} hat keine Angaben in „dinge"`);
        ort({ name: DING_ZEICHEN[z], point: true, ...mitte(x, y), properties: Object.entries(eig).map(([k, v]) => eigenschaft(k, typeof v === 'number' ? String(v) : v)) });
      } else if (def.punkte?.[z]) {
        // Weitere Punkte mit Namen und Eigenschaften — Fallen, Start und Ende
        // der Steinkugel. Liste: das n-te Vorkommen nimmt den n-ten Eintrag.
        const n = (gezaehlt[z] = (gezaehlt[z] ?? 0) + 1) - 1;
        const p = Array.isArray(def.punkte[z]) ? def.punkte[z][n] : def.punkte[z];
        if (!p) throw new Error(`${name}: Punkt '${z}' Nr. ${n + 1} bei ${x},${y} hat keinen Eintrag`);
        const { name: pname, ...eig } = p;
        ort({ name: pname, point: true, ...mitte(x, y), properties: Object.entries(eig).map(([k, v]) => eigenschaft(k, typeof v === 'number' ? String(v) : v)) });
      } else if (z === 'g') {
        // „gegner": Liste der Arten in der Reihenfolge der „g" (zeilenweise);
        // ohne Liste sind es Schleime.
        const n = (gezaehlt.g = (gezaehlt.g ?? 0) + 1) - 1;
        const art = def.gegner ? def.gegner[n] : 'schleim';
        if (!art) throw new Error(`${name}: Gegner Nr. ${n + 1} bei ${x},${y} hat keine Art in „gegner"`);
        ort({ name: 'gegner', point: true, ...mitte(x, y), properties: [eigenschaft('art', art)] });
      }
      else if (def.ankuenfte?.[z]) {
        const a = nimm(def.ankuenfte, z, x, y);
        ort({ name: 'ankunft', point: true, ...mitte(x, y), properties: [eigenschaft('id', a.id), ...(a.richtung ? [eigenschaft('richtung', a.richtung)] : [])] });
      } else {
        const u = nimm(def.uebergaenge, z, x, y);
        const n = nachZeichen[z];
        // Ein Übergang ohne eigene Kachel (ein Riss) steht auf dem Grund.
        if (n === undefined && !u) throw new Error(`${name}: unbekanntes Zeichen '${z}' bei ${x},${y}`);
        if (n !== undefined && KACHELN[n].hindernis) oben = n;
        else if (n !== undefined) grund = n;
        if (u?.kachel) grund = nummer(u.kachel);
        if (u)
          ort({
            name: 'uebergang', x: x * GROESSE, y: y * GROESSE, width: GROESSE, height: GROESSE,
            properties: Object.entries(u).filter(([k]) => k !== 'kachel').map(([k, v]) => eigenschaft(k, v)),
          });
      }
      // Gras-Abwechslung, damit die Wiese nicht wie Tapete aussieht.
      if (grund === nummer('gras') && (x * 7 + y * 13) % 5 === 0) grund = nummer('gras2');
      boden.push(grund + 1);
      hindernisse.push(oben + 1);
    }),
  );

  return {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
    width: breite, height: hoehe, tilewidth: GROESSE, tileheight: GROESSE, infinite: false,
    nextlayerid: 4, nextobjectid: id,
    properties: [eigenschaft('titel', def.titel), ...(def.licht ? [eigenschaft('licht', def.licht)] : []), ...(def.meer ? [eigenschaft('meer', true)] : [])],
    layers: [
      { id: 1, name: 'boden', type: 'tilelayer', width: breite, height: hoehe, x: 0, y: 0, opacity: 1, visible: true, data: boden },
      { id: 2, name: 'hindernisse', type: 'tilelayer', width: breite, height: hoehe, x: 0, y: 0, opacity: 1, visible: true, data: hindernisse },
      { id: 3, name: 'orte', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: orte },
    ],
    // Eingebettet, nicht als .tsx — Phaser liest nur eingebettete Kachelsätze.
    tilesets: [kachelsatz()],
  };
}

// Der Kachelsatz mit den Eigenschaften jeder Kachel (name, fest, …). Steht in
// jeder Karte eingebettet; `npm run gebiet -- kacheln` erneuert ihn in allen.
export function kachelsatz() {
  const zeilen = Math.ceil(KACHELN.length / SPALTEN);
  return {
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
  };
}
