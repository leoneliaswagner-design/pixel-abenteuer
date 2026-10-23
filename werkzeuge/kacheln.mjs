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
];

export const nummer = (name) => KACHELN.findIndex((k) => k.name === name);
