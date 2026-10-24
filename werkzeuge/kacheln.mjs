// Die Kacheln des Kachelsatzes, in der Reihenfolge, in der sie in
// inhalte/grafik/kacheln.png liegen (8 pro Zeile). grafik.mjs malt sie,
// karte.mjs schreibt ihre Eigenschaften in die Tiled-Karte — von dort liest
// sie das Spiel. Die Zeichen sind die der Textkarte in karte.mjs.
export const GROESSE = 32;
export const SPALTEN = 8;

export const KACHELN = [
  { name: 'gras', zeichen: '.' },
  { name: 'gras2', zeichen: ',' },
  { name: 'blumen', zeichen: '*' },
  { name: 'weg', zeichen: '=' },
  { name: 'wasser', zeichen: '~', fest: true },
  { name: 'wasser2', fest: true },
  { name: 'bruecke', zeichen: 'H' },
  { name: 'hohes_gras', zeichen: '"' },
  { name: 'stein', zeichen: 'o', fest: true, hindernis: true },
  { name: 'busch', zeichen: 'b', fest: true, hindernis: true, schneidbar: true },
  { name: 'busch_rest' },
  { name: 'baum', zeichen: 'T', fest: true, hindernis: true, baum: true },
  { name: 'mauer', zeichen: '#', fest: true, hindernis: true },
  // Neue Kacheln immer hinten anhängen: die Karten speichern Nummern, und
  // eine eingeschobene Kachel verschöbe alle dahinter.
  { name: 'hoehlenboden', zeichen: ':' },
  { name: 'fels', zeichen: 'X', fest: true, hindernis: true },
  { name: 'treppe_runter', zeichen: 'E' },
  { name: 'treppe_hoch', zeichen: 'A' },
  { name: 'tempelboden', zeichen: ';' },
  { name: 'tempelwand', zeichen: 'W', fest: true, hindernis: true },
  // Riftside. Kiste, Fass, Laterne und Brunnen haben einen durchsichtigen
  // Hintergrund — sie stehen auf Pflaster wie auf Gras.
  { name: 'pflaster', zeichen: 'p' },
  { name: 'sand', zeichen: 's' },
  { name: 'dach', zeichen: 'r', fest: true, hindernis: true },
  { name: 'dachkante', zeichen: 'q', fest: true, hindernis: true },
  { name: 'hauswand', zeichen: 'h', fest: true, hindernis: true },
  { name: 'fenster', zeichen: 'f', fest: true, hindernis: true },
  { name: 'haustuer', zeichen: 'n', fest: true, hindernis: true },
  { name: 'brunnen', zeichen: 'B', fest: true, hindernis: true },
  { name: 'kiste', zeichen: 'k', fest: true, hindernis: true },
  { name: 'fass', zeichen: 'v', fest: true, hindernis: true },
  { name: 'laterne', zeichen: 'l', fest: true, hindernis: true },
  // Häuser betreten: „eingang" sieht aus wie die Haustür, ist aber begehbar
  // (ein Übergang liegt darauf). Innenräume: Dielen, Wand, Möbel.
  { name: 'eingang', zeichen: 'N' },
  { name: 'dielen', zeichen: 'd' },
  { name: 'innenwand', zeichen: 'I', fest: true, hindernis: true },
  { name: 'wandkante', zeichen: 'J', fest: true, hindernis: true },
  { name: 'teppich', zeichen: 'c' },
  { name: 'fussmatte', zeichen: 'u' },
  { name: 'tisch', zeichen: 'm', fest: true, hindernis: true },
  { name: 'bett', zeichen: 'y', fest: true, hindernis: true },
  { name: 'regal', zeichen: 'x', fest: true, hindernis: true },
  // Das Meer (Gebiet „meer"): Küsten der Inseln. Fest — ein Boot fährt nicht
  // an Land; angelegt wird nur an einer Anlegestelle (Übergang).
  { name: 'strand', zeichen: '_', fest: true },
  { name: 'land', zeichen: '^', fest: true },
  // Offenes Meer: sieht aus wie Wasser, ist aber befahrbar (das Boot ist
  // die Figur). „wasser" ist überall sonst fest, damit niemand hineinläuft.
  { name: 'see', zeichen: '&' },
  { name: 'see2' },
];

export const nummer = (name) => KACHELN.findIndex((k) => k.name === name);
