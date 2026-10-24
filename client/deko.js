// Kleinkram auf den Wiesen (grafik/deko.png): Grasbüschel, Blumen, Kiesel,
// Pilze. Verteilt nach der Kachel, nicht zufällig — so sieht jeder Spieler
// dieselbe Wiese, auch nach einem Gebietswechsel. Ohne Phaser, wie kanten.js.

const WIESE = new Set(['gras', 'gras2']);
// Bild in deko.png → wie oft (von 1000 Würfen)
const HAEUFIGKEIT = [[0, 140], [1, 110], [2, 120], [3, 22], [4, 22], [5, 18], [6, 30], [7, 6]];

function hash(x, y, n) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(n, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function dekoBerechnen(welt) {
  const k = welt.kachel, teile = [];
  for (let y = 0; y < welt.hoehe; y++)
    for (let x = 0; x < welt.breite; x++) {
      const i = welt.index(x, y);
      if (welt.hindernisse[i] || !WIESE.has(welt.eig(welt.boden[i]).name)) continue;
      for (let n = 0; n < 2; n++) {
        let w = hash(x, y, n) * 1000;
        const treffer = HAEUFIGKEIT.find(([, h]) => (w -= h) < 0);
        if (!treffer) continue;
        // 16er-Bild, innerhalb der Kachel verschoben (Fuß des Bildes unten).
        teile.push({ x: x * k + Math.floor(hash(x, y, n + 7) * 18), y: y * k + Math.floor(hash(x, y, n + 13) * 18), bild: treffer[0] });
      }
    }
  return teile;
}
