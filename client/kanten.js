// Automatische Kanten: wo Wasser an Land grenzt, liegt Schaum auf dem
// Wasser; wo ein Weg an Gras grenzt, hängen Grasbüschel über den Weg.
// Berechnet aus der Karte — wer in Tiled eine Küste malt, muss keine
// Kantenkacheln setzen. Ohne Phaser, damit der Prüfstand es direkt fragen kann.
//
// Bilder in grafik/kanten.png: 0–7 Schaum, 8–15 Gras, je in der Reihenfolge
// oben, unten, links, rechts, Ecke oben-links, oben-rechts, unten-links, unten-rechts.

const ARTEN = {
  wasser: new Set(['wasser', 'wasser2']),
  weg: new Set(['weg', 'sand', 'pflaster']),
  gras: new Set(['gras', 'gras2', 'blumen', 'hohes_gras', 'busch_rest']),
};
// Worauf eine Kante liegt, und welcher Nachbar sie auslöst.
const REGELN = [
  { auf: 'wasser', neben: (a) => a && a !== 'wasser', erstesBild: 0 },
  { auf: 'weg', neben: (a) => a === 'gras', erstesBild: 8 },
];
const SEITEN = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const ECKEN = [[-1, -1, 0, 2], [1, -1, 0, 3], [-1, 1, 1, 2], [1, 1, 1, 3]]; // dx, dy, Seite1, Seite2

export function kantenBerechnen(welt) {
  const art = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= welt.breite || ty >= welt.hoehe) return null;
    const name = welt.eig(welt.boden[welt.index(tx, ty)]).name;
    for (const [a, namen] of Object.entries(ARTEN)) if (namen.has(name)) return a;
    return null;
  };
  const kanten = [];
  for (let y = 0; y < welt.hoehe; y++)
    for (let x = 0; x < welt.breite; x++) {
      const hier = art(x, y);
      const regel = REGELN.find((r) => r.auf === hier);
      if (!regel) continue;
      const seite = SEITEN.map(([dx, dy]) => regel.neben(art(x + dx, y + dy)));
      seite.forEach((ja, i) => ja && kanten.push({ x, y, bild: regel.erstesBild + i }));
      // Innere Ecke: nur schräg grenzt etwas an, die beiden Seiten nicht.
      ECKEN.forEach(([dx, dy, s1, s2], i) => {
        if (!seite[s1] && !seite[s2] && regel.neben(art(x + dx, y + dy))) kanten.push({ x, y, bild: regel.erstesBild + 4 + i });
      });
    }
  return kanten;
}
