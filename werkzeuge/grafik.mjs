// Malt alle Platzhalter-Grafiken nach inhalte/grafik/. Aufruf: npm run grafik
//
// Stil: eher Stardew Valley und Necesse als Link's Awakening — weiche
// Schattierung von links oben, Ränder in dunkler Eigenfarbe statt Schwarz,
// Texturen, die über den Kachelrand weiterlaufen. Figuren: figuren.mjs.
import { Bild, zufall } from './pixel.mjs';
import { blatt as figurenBlatt } from './figuren.mjs';
import { KACHELN, GROESSE as K, SPALTEN } from './kacheln.mjs';
import { fileURLToPath } from 'node:url';

const ziel = fileURLToPath(new URL('../inhalte/grafik/', import.meta.url));
const UMRISS = '#2a1e2e';
// Ränder in dunkler Eigenfarbe statt Schwarz (s. pixel.mjs umriss) — moderner,
// eher Stardew Valley als Gameboy.
const RAND = 'weich';

const P = {
  gras: '#68ad45', grasDunkel: '#518f36', grasHell: '#8cc65a',
  weg: '#d8bf87', wegDunkel: '#bfa36c', wegHell: '#e8d6a6',
  wasser: '#3f86d0', wasserHell: '#7ab8f0', wasserDunkel: '#2f6aae',
  holz: '#a8743f', holzDunkel: '#7a4f2a', holzHell: '#c99560',
  stein: '#9a9aa8', steinHell: '#c6c6d0', steinDunkel: '#6c6c7c',
  blatt: '#3f8c3a', blattHell: '#62b452', blattDunkel: '#2c6a2e', blattUmriss: '#1d3a20',
  haut: '#f2c49b', hautDunkel: '#d39a72', haare: '#e8c15a', auge: '#2a1e2e',
  stiefel: '#6b4426', stiefelHell: '#8c5d37', guertel: '#5a3a1e', gold: '#e8b84a',
};

// ---------- Helfer für den neuen Stil ----------
// Blätter in fünf Tönen, Licht von links oben.
const BL = { tief: '#22492a', dunkel: '#2d6433', mitte: '#3d853d', hell: '#58a548', licht: '#86c862' };

// Ein Blätterklumpen: dunkler Grund, darüber die Mitte, oben links Licht, und
// kleine Blattbögen als Struktur. Bäume und Büsche sind Haufen davon.
function klumpen(b, cx, cy, r, z) {
  b.ellipse(cx, cy, r, r * 0.9, BL.dunkel);
  b.ellipse(cx - r * 0.12, cy - r * 0.16, r * 0.84, r * 0.74, BL.mitte);
  b.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.46, r * 0.36, BL.hell);
  for (let i = 0; i < r * 2.2; i++) {
    const w = z() * Math.PI * 2, d = Math.sqrt(z()) * r * 0.85;
    const x = Math.round(cx + Math.cos(w) * d), y = Math.round(cy + Math.sin(w) * d * 0.88);
    const oben = y - cy < -r * 0.25 && x - cx < r * 0.3;
    b.setze(x, y, oben ? BL.licht : y > cy + r * 0.2 ? BL.tief : BL.dunkel);
    b.setze(x + 1, y + 1, oben ? BL.hell : BL.tief);
  }
}

// Ein weicher Schatten am Boden (halbdurchsichtig, ohne Rand).
function bodenschatten(b, cx, cy, rx, ry, staerke = 60) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d <= 1) b.setze(x, y, [30, 22, 40, Math.round(staerke * (1 - d * d))]);
    }
}

// Kachelbares Rauschen: Wert an (x, y), über den Kachelrand fortgesetzt.
function rauschen(saat, zellen = 4) {
  const z = zufall(saat), g = Array.from({ length: zellen * zellen }, () => z());
  const w = (i, j) => g[((j % zellen) + zellen) % zellen * zellen + ((i % zellen) + zellen) % zellen];
  return (x, y) => {
    const fx = (x / K) * zellen, fy = (y / K) * zellen, i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = w(i, j) + (w(i + 1, j) - w(i, j)) * sx, c = w(i, j + 1) + (w(i + 1, j + 1) - w(i, j + 1)) * sx;
    return a + (c - a) * sy;
  };
}

// ---------- Kacheln ----------

// Gras: viele kurze Halme in drei Tönen statt einer Fläche mit Tupfen. Die
// Halme laufen über den Rand hinweg auf der anderen Seite weiter (modulo),
// so sieht man das Kachelraster nicht — das verriet die alte Wiese sofort.
function grasGrund(b, saat, buescheln = 8) {
  const z = zufall(saat);
  const um = (x, y, f) => b.setze(((x % K) + K) % K, ((y % K) + K) % K, f);
  b.rechteck(0, 0, K, K, P.gras);
  // Große, weiche Flecken (kühler und wärmer), auch über den Rand.
  for (let i = 0; i < 4; i++) {
    const cx = z() * K, cy = z() * K, r = 4 + z() * 5, f = i % 2 ? '#72b44c' : '#62a340';
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if ((x * x) / (r * r) + (y * y) / (r * r * 0.5) <= 1) um(Math.round(cx + x), Math.round(cy + y), f);
  }
  for (let i = 0; i < 26 + buescheln * 2; i++) {
    const x = Math.floor(z() * K), y = Math.floor(z() * K), l = 1 + Math.floor(z() * 3);
    const dunkel = z() < 0.6;
    for (let k = 0; k < l; k++) um(x, y - k, dunkel ? P.grasDunkel : P.grasHell);
    if (dunkel) um(x + 1, y, '#5c9a3e');
  }
}

function blume(b, x, y, bluete) {
  b.setze(x, y - 1, bluete); b.setze(x - 1, y, bluete); b.setze(x + 1, y, bluete); b.setze(x, y + 1, bluete);
  b.setze(x, y, '#f4d24a');
  b.setze(x, y + 2, P.grasDunkel);
}

function wasser(b, versatz) {
  // Tiefe Flecken (Rauschen), darauf kleine Wellenbögen und Glitzern; die
  // Bögen wandern mit dem zweiten Bild (versatz), so bewegt sich das Wasser.
  const n = rauschen(6, 4), z = zufall(7);
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      const v = n(x, y);
      b.setze(x, y, v < 0.35 ? '#3274ba' : v < 0.7 ? '#3a82c6' : '#4590d2');
    }
  const um = (x, y, f) => b.setze(((x % K) + K) % K, ((y % K) + K) % K, f);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(z() * K) + versatz * 3, y = Math.floor(z() * K);
    um(x, y, '#78b8ec');
    um(x + 1, y - 1, '#a8d4f6');
    um(x + 2, y - 1, '#a8d4f6');
    um(x + 3, y, '#78b8ec');
  }
  um(9 + versatz * 4, 11, '#e8f6ff');
  um(24 - versatz * 3, 25, '#e8f6ff');
}

// Ein Felsbrocken mit Flächen: oben hell, rechts unten dunkel, ein Riss und
// ein Moosfleck.
function stein(b) {
  grasGrund(b, 31, 4);
  bodenschatten(b, 17, 26, 13, 4.5, 80);
  const s = new Bild(K, K);
  s.ellipse(16, 18, 12, 9.5, '#8e8c9c');
  s.ellipse(14, 15, 9, 6, '#b2b0be');
  s.ellipse(12, 13, 5, 3, '#d0ced8');
  s.ellipse(20, 22, 7, 4, '#706e80', (x, y) => y > 20);
  s.linie(18, 12, 21, 18, '#6e6c7e');
  s.linie(21, 18, 20, 22, '#6e6c7e');
  s.ellipse(9, 20, 3, 2, '#6a9a48');
  s.setze(8, 19, '#8cc062');
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
}

function busch(b) {
  grasGrund(b, 41, 4);
  bodenschatten(b, 16, 26, 13, 4, 85);
  const s = new Bild(K, K);
  const z = zufall(43);
  for (const [x, y, r] of [[9, 19, 7], [23, 19, 7], [16, 21, 8], [12, 13, 7], [20, 13, 7]]) klumpen(s, x, y, r, z);
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
}

function buschRest(b) {
  grasGrund(b, 41, 4);
  for (const [x, y] of [[10, 20], [20, 18], [15, 23]]) {
    b.rechteck(x, y, 3, 2, BL.dunkel);
    b.setze(x + 1, y - 1, BL.hell);
    b.setze(x + 2, y + 1, '#7a5a3a');
  }
}

// Ruinenmauer: unregelmäßige Quader, oben Moos, das herunterhängt.
function mauer(b) {
  const z = zufall(91), n = rauschen(92, 4);
  b.rechteck(0, 0, K, K, '#5e5348');
  for (let reihe = 0; reihe < 4; reihe++) {
    const y = reihe * 8, v = reihe % 2 ? 5 : 0;
    for (let x = -v; x < K; x += 11 + Math.floor(z() * 3)) {
      const ton = ['#9b8b7a', '#a6968a', '#8e7f70'][Math.floor(z() * 3)];
      b.rechteck(x + 1, y + 1, 10, 6, ton);
      b.rechteck(x + 1, y + 1, 10, 1, '#bcae9c');
      b.rechteck(x + 1, y + 6, 10, 1, '#7a6c5e');
    }
  }
  for (let x = 0; x < K; x++) {
    const l = Math.floor(n(x, 0) * 6) + (x % 5 === 0 ? 3 : 0);
    for (let y = 0; y < l; y++) b.setze(x, y, y === l - 1 ? '#4f7a36' : '#64983f');
  }
}

// Erdweg: warm, mit weichen Flecken und Kieseln, ohne harte Kanten.
function weg(b) {
  const z = zufall(11);
  const um = (x, y, f) => b.setze(((x % K) + K) % K, ((y % K) + K) % K, f);
  b.rechteck(0, 0, K, K, P.weg);
  for (let i = 0; i < 5; i++) {
    const cx = z() * K, cy = z() * K, r = 3 + z() * 4, f = i % 2 ? P.wegDunkel : '#e2cc98';
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y * 1.6 <= r * r) um(Math.round(cx + x), Math.round(cy + y), f);
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(z() * K), y = Math.floor(z() * K);
    um(x, y, '#a88e5e');
    um(x + 1, y, '#a88e5e');
    um(x, y - 1, P.wegHell);
  }
}

function bruecke(b) {
  wasser(b, 0);
  for (let x = 0; x < K; x += 8) {
    b.rechteck(x, 2, 8, 28, P.holz);
    b.rechteck(x, 2, 1, 28, P.holzDunkel);
    b.rechteck(x + 1, 2, 7, 1, P.holzHell);
  }
  b.rechteck(0, 0, K, 2, P.holzDunkel);
  b.rechteck(0, 30, K, 2, P.holzDunkel);
}

// Hohes Gras: dichte Halmbüschel in mehreren Höhen und Tönen.
function hohesGras(b) {
  grasGrund(b, 51, 2);
  const z = zufall(52);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(z() * K), y = 8 + Math.floor(z() * (K - 6)), l = 5 + Math.floor(z() * 6), neig = z() < 0.5 ? -1 : 1;
    for (let k = 0; k < l; k++) {
      const f = k > l - 3 ? BL.licht : k > l / 2 ? '#6aae48' : BL.mitte;
      b.setze(((x + Math.round((neig * k * k) / (l * 3))) % K + K) % K, y - k, f);
    }
  }
}

function baumKachel(b) {
  // Nur für Tiled sichtbar: das Spiel ersetzt diese Kachel durch baum.png.
  grasGrund(b, 61, 3);
  b.ellipse(16, 12, 12, 10, P.blatt);
  b.rechteck(14, 20, 4, 9, P.holz);
}

// Höhlenboden: dunkle Erde mit weichen Flecken und Steinchen.
function hoehlenboden(b) {
  const z = zufall(71), n = rauschen(72, 4);
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      const v = n(x, y);
      b.setze(x, y, v < 0.35 ? '#3e3546' : v < 0.7 ? '#4a4054' : '#554a60');
    }
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(z() * (K - 2)), y = Math.floor(z() * (K - 2));
    b.rechteck(x, y, 2, 2, '#6a6076');
    b.setze(x, y, '#857a92');
    b.setze(x + 1, y + 1, '#2e2836');
  }
}

// Höhlenwand: Gestein in senkrechten Schichten, oben eine helle Kante,
// unten dunkel — man liest sie sofort als Wand.
function fels(b) {
  const n = rauschen(82, 4), z = zufall(81);
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      const v = n(x * 2, y * 0.5) + (y / K) * 0.35;
      b.setze(x, y, v < 0.5 ? '#7a6c84' : v < 0.8 ? '#665a72' : '#52485e');
    }
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(z() * K);
    b.linie(x, 4 + Math.floor(z() * 8), x + (z() < 0.5 ? -1 : 1), 20 + Math.floor(z() * 10), '#463e52');
  }
  b.rechteck(0, 0, K, 2, '#958aa0');
  b.rechteck(0, 2, K, 1, '#7a6e86');
}

function treppe(b, runter) {
  b.rechteck(0, 0, K, K, runter ? '#2a1e2e' : '#4a4050');
  for (let stufe = 0; stufe < 5; stufe++) {
    const y = 3 + stufe * 6;
    // Abwärts werden die Stufen dunkler (sie führen ins Dunkle), aufwärts heller.
    const hell = runter ? ['#b8a895', '#9b8b7a', '#7d6e60', '#5e5146', '#433a32'][stufe] : ['#5e5146', '#7d6e60', '#9b8b7a', '#b8a895', '#d0c2ae'][stufe];
    b.rechteck(3, y, K - 6, 5, hell);
    b.rechteck(3, y + 4, K - 6, 1, '#2a1e2e');
  }
  b.rechteck(0, 0, 3, K, '#5e5146');
  b.rechteck(K - 3, 0, 3, K, '#5e5146');
}

function tempelboden(b) {
  // Große, leicht verschobene Steinplatten mit Moos in den Fugen.
  b.rechteck(0, 0, K, K, '#8a8a6a');
  for (const [x, y, w, h] of [[0, 0, 15, 15], [16, 0, 16, 10], [16, 11, 16, 21], [0, 16, 15, 16]]) {
    b.rechteck(x + 1, y + 1, w - 1, h - 1, '#9c9c78');
    b.rechteck(x + 1, y + 1, w - 1, 1, '#b0b08a');
  }
  const z = zufall(91);
  for (let i = 0; i < 9; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), z() < 0.6 ? '#5e8a3e' : '#76767a');
  for (const [x, y] of [[15, 4], [15, 20], [22, 10], [5, 15]]) b.rechteck(x, y, 2, 2, '#4f7a34');
}

function tempelwand(b) {
  // Behauene Quader, oben dunkle Kante, Ranken hängen herab.
  b.rechteck(0, 0, K, K, '#6e6a52');
  for (let reihe = 0; reihe < 3; reihe++) {
    const y = 2 + reihe * 10;
    const v = reihe % 2 ? 10 : 0;
    for (let x = -v; x < K; x += 20) {
      b.rechteck(x + 1, y, 18, 9, '#86825f');
      b.rechteck(x + 1, y, 18, 1, '#a09c74');
      b.rechteck(x + 1, y + 8, 18, 1, '#57533f');
    }
  }
  b.rechteck(0, 0, K, 2, '#2a1e2e');
  for (const [x, l] of [[6, 14], [21, 9], [27, 18]]) {
    b.linie(x, 2, x, 2 + l, '#3f8c3a');
    b.setze(x + 1, 6, '#62b452');
    b.setze(x - 1, 10, '#62b452');
  }
}

// ---------- Riftside ----------

// Kopfsteinpflaster aus unregelmäßigen Steinen: jeder Bildpunkt gehört zum
// nächsten von 16 verwackelten Mittelpunkten (Abstand über den Rand hinweg —
// so passt die Kachel an ihre Nachbarn). Fugen, wo zwei Steine gleich nah
// sind; Licht oben links, Schatten unten rechts in jedem Stein.
function pflaster(b) {
  const z = zufall(111);
  const punkte = [];
  for (let gy = 0; gy < 4; gy++)
    for (let gx = 0; gx < 4; gx++)
      punkte.push({ x: gx * 8 + 2 + z() * 4 + (gy % 2) * 2, y: gy * 8 + 2 + z() * 4, ton: ['#b3a690', '#ab9e88', '#b8aa93', '#a69a85'][Math.floor(z() * 4)] });
  const ab = (a, x, y) => {
    let dx = Math.abs(a.x - x), dy = Math.abs(a.y - y);
    dx = Math.min(dx, K - dx);
    dy = Math.min(dy, K - dy);
    return Math.hypot(dx, dy * 1.15);
  };
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      const d = punkte.map((p) => [ab(p, x + 0.5, y + 0.5), p]).sort((a, c) => a[0] - c[0]);
      const [d1, p] = d[0], d2 = d[1][0];
      if (d2 - d1 < 1.3) { b.setze(x, y, '#857a69'); continue; }
      let f = p.ton;
      // Wo im Stein: oben links Licht, unten rechts Schatten.
      let rx = x + 0.5 - p.x, ry = y + 0.5 - p.y;
      if (rx > K / 2) rx -= K; if (rx < -K / 2) rx += K;
      if (ry > K / 2) ry -= K; if (ry < -K / 2) ry += K;
      if (d2 - d1 < 2.4 && rx + ry > 0) f = '#988c78';
      else if (d2 - d1 < 2.6 && rx + ry < -1) f = '#c6b9a2';
      b.setze(x, y, f);
    }
}

// Sand: feines Korn, sanfte Rippeln, hin und wieder eine Muschel.
function sand(b) {
  const z = zufall(121), n = rauschen(122, 4);
  for (let y = 0; y < K; y++)
    for (let x = 0; x < K; x++) {
      const v = n(x, y);
      b.setze(x, y, v < 0.4 ? '#e2cd98' : v < 0.75 ? '#e8d5a4' : '#efdeb2');
    }
  for (let i = 0; i < 22; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), z() < 0.5 ? '#cfb983' : '#f6e8c4');
  for (const y of [9, 23]) for (let x = 0; x < K; x++) if ((x + y) % 7 < 4) b.setze(x, y + Math.round(Math.sin(x * 0.4) * 1.2), '#d6c08c');
  b.ellipse(22, 15, 2, 1.5, '#f4d8d0');
  b.setze(21, 15, '#d8a8a0');
}

// Dachziegel: Reihen von Schindeln mit runder Unterkante, jede etwas anders
// getönt, oben Licht — so wirkt das Dach geneigt und nicht wie eine Wand.
const DACH = { grund: '#a8483a', dunkel: '#6e2a24', hell: '#c8604a' };
function dach(b) {
  const z = zufall(131);
  b.rechteck(0, 0, K, K, DACH.dunkel);
  for (let reihe = 0; reihe < 4; reihe++) {
    const y = reihe * 8, v = reihe % 2 ? 4 : 0;
    for (let x = -v; x < K + 8; x += 8) {
      const ton = ['#a8483a', '#b0503e', '#9c4236', '#b45a44'][Math.floor(z() * 4)];
      const s = new Bild(K, K);
      s.ellipse(x + 4, y + 3, 3.8, 4.5, ton, (xx, yy) => yy >= y);
      s.rechteck(x + 1, y, 6, 1, DACH.hell);
      s.setze(x + 1, y + 1, DACH.hell);
      b.einfuegen(s, 0, 0);
      if (x < 0 || x + 8 > K) {
        const t = new Bild(K, K);
        t.einfuegen(s, x < 0 ? K : -K, 0);
        b.einfuegen(t, 0, 0);
      }
    }
  }
}

function dachkante(b) {
  dach(b);
  b.rechteck(0, 20, K, 4, '#5a2a22');
  b.rechteck(0, 24, K, 8, '#e8dcc0');
  b.rechteck(0, 24, K, 2, '#b8aa90');
}

function hauswand(b, mitte) {
  // Fachwerk: helle Wand, dunkle Balken, unten ein Sockel aus Stein.
  b.rechteck(0, 0, K, K, '#e8dcc0');
  b.rechteck(0, 0, K, 3, '#7a4f2a');
  b.rechteck(0, 0, 3, 26, '#7a4f2a');
  b.rechteck(29, 0, 3, 26, '#7a4f2a');
  b.rechteck(0, 26, K, 6, '#9a8a7a');
  b.rechteck(0, 26, K, 1, '#b8a895');
  for (let x = 4; x < K; x += 8) b.rechteck(x, 29, 1, 3, '#7d6e60');
  if (!mitte) {
    b.linie(3, 25, 13, 3, '#7a4f2a');
    b.linie(4, 25, 14, 3, '#7a4f2a');
  }
}

function fenster(b) {
  hauswand(b, true);
  b.rechteck(7, 7, 18, 14, '#4e3420');
  b.rechteck(9, 9, 14, 10, '#5a8ac0');
  b.rechteck(9, 9, 6, 3, '#9ac0e8');
  b.rechteck(15, 9, 2, 10, '#4e3420');
  b.rechteck(9, 13, 14, 2, '#4e3420');
  b.rechteck(6, 21, 20, 2, '#7a4f2a');
  for (const x of [8, 13, 20]) b.rechteck(x, 19, 3, 2, x === 13 ? '#e05a7a' : '#f4d24a');
}

function haustuer(b) {
  hauswand(b, true);
  b.ellipse(16, 10, 9, 6, '#4e3420', (x, y) => y <= 10);
  b.rechteck(7, 10, 18, 22, '#4e3420');
  b.ellipse(16, 11, 7, 5, P.holz, (x, y) => y <= 11);
  b.rechteck(9, 11, 14, 21, P.holz);
  b.rechteck(15, 8, 2, 24, P.holzDunkel);
  b.rechteck(19, 20, 2, 2, P.gold);
}

function brunnen(b) {
  b.ellipse(16, 25, 15, 5, [0, 0, 0, 60]);
  const s = new Bild(K, K);
  s.ellipse(16, 20, 14, 9, '#9a9aa8');
  s.ellipse(16, 19, 11, 6, '#4a8ad0');
  s.ellipse(13, 17, 4, 2, '#8ac0f0');
  s.rechteck(14, 6, 4, 13, '#b4b4c0');
  s.rechteck(12, 4, 8, 3, '#9a9aa8');
  s.rechteck(15, 1, 2, 4, '#8ac0f0');
  s.setze(12, 9, '#8ac0f0');
  s.setze(19, 9, '#8ac0f0');
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
}

function kiste(b) {
  b.ellipse(16, 28, 12, 3, [0, 0, 0, 70]);
  const s = new Bild(K, K);
  s.rechteck(5, 8, 22, 20, P.holz);
  s.rechteck(5, 8, 22, 2, P.holzHell);
  s.rechteck(5, 8, 2, 20, P.holzDunkel);
  s.rechteck(25, 8, 2, 20, P.holzDunkel);
  s.rechteck(5, 26, 22, 2, P.holzDunkel);
  s.linie(7, 10, 24, 25, P.holzDunkel);
  s.linie(7, 25, 24, 10, P.holzDunkel);
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
}

function fass(b) {
  b.ellipse(16, 28, 10, 3, [0, 0, 0, 70]);
  const s = new Bild(K, K);
  s.ellipse(16, 18, 10, 11, P.holz);
  s.rechteck(6, 9, 21, 19, P.holz);
  s.ellipse(16, 8, 10, 3, P.holzHell);
  s.ellipse(16, 8, 7, 1.5, P.holzDunkel);
  for (const y of [12, 23]) s.rechteck(6, y, 21, 2, '#5e5146');
  s.rechteck(9, 10, 2, 17, P.holzHell);
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
}

function laterne(b) {
  b.ellipse(16, 29, 6, 2, [0, 0, 0, 70]);
  const s = new Bild(K, K);
  s.rechteck(15, 10, 3, 19, '#3a3440');
  s.rechteck(12, 27, 9, 2, '#3a3440');
  s.rechteck(11, 2, 11, 9, '#3a3440');
  s.rechteck(13, 4, 7, 5, '#f4d24a');
  s.rechteck(14, 4, 2, 2, '#fff2b0');
  s.rechteck(10, 1, 13, 2, '#3a3440');
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
}

// ---------- Innenräume ----------

// Dielen: breite Bretter, versetzte Stöße, Maserung und Nägel.
function dielen(b) {
  const z = zufall(141);
  for (let reihe = 0; reihe < 4; reihe++) {
    const y = reihe * 8, stoss = (reihe * 13) % K;
    const ton = ['#b57e4a', '#ad7744', '#bb8550', '#a87240'][reihe];
    b.rechteck(0, y, K, 8, ton);
    b.rechteck(0, y, K, 1, '#c99360');
    b.rechteck(0, y + 7, K, 1, '#734a2a');
    b.rechteck(stoss, y, 1, 7, '#734a2a');
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(z() * K), l = 4 + Math.floor(z() * 8), yy = y + 2 + Math.floor(z() * 4);
      for (let k = 0; k < l; k++) b.setze((x + k) % K, yy, '#9a6838');
    }
    b.setze((stoss + 2) % K, y + 3, '#5e3c22');
    b.setze((stoss + K - 3) % K, y + 3, '#5e3c22');
  }
}

function innenwand(b) {
  // Tapete oben, Holzvertäfelung unten — die Wand, auf die man von vorn schaut.
  b.rechteck(0, 0, K, K, '#d8c8a0');
  for (let x = 2; x < K; x += 8) b.rechteck(x, 0, 2, 18, '#c8b48a');
  b.rechteck(0, 18, K, 2, '#7a5030');
  b.rechteck(0, 20, K, 12, '#9a6a40');
  for (let x = 0; x < K; x += 8) b.rechteck(x, 20, 1, 12, '#7a5030');
  b.rechteck(0, 30, K, 2, '#5e3e22');
}

function wandkante(b) {
  b.rechteck(0, 0, K, K, '#3a2a30');
  b.rechteck(0, 0, K, 2, '#2a1e2e');
  const z = zufall(141);
  for (let i = 0; i < 6; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), '#4a3840');
}

function teppich(b) {
  // Ohne Rand pro Kachel: mehrere Teppichkacheln nebeneinander sahen sonst
  // aus wie einzelne Fliesen. Das Muster läuft über die Kachelgrenzen weiter.
  b.rechteck(0, 0, K, K, '#a83a4a');
  for (let y = 4; y < K; y += 8)
    for (let x = (y % 16 === 4 ? 4 : 0); x < K; x += 8) {
      b.rechteck(x, y, 2, 2, '#e8b84a');
      b.setze(x + 1, y + 2, '#8a2a3a');
    }
}

function fussmatte(b) {
  // Der Ausgang unten in der Wand: Dielen, darauf eine Matte, nach unten dunkel.
  dielen(b);
  b.rechteck(0, 22, K, 10, '#3a2a30');
  b.rechteck(4, 4, 24, 16, '#6a5a3a');
  b.rechteck(6, 6, 20, 12, '#8a7a4a');
  for (let x = 8; x < 26; x += 3) b.rechteck(x, 7, 1, 10, '#6a5a3a');
}

function moebel(b, art) {
  b.ellipse(16, 28, 13, 3, [0, 0, 0, 70]);
  const s = new Bild(K, K);
  if (art === 'tisch') {
    s.rechteck(3, 8, 26, 14, P.holz);
    s.rechteck(3, 8, 26, 2, P.holzHell);
    s.rechteck(3, 20, 26, 2, P.holzDunkel);
    s.rechteck(5, 22, 3, 6, P.holzDunkel);
    s.rechteck(24, 22, 3, 6, P.holzDunkel);
    s.rechteck(12, 11, 8, 6, '#f4ecd8');
    s.rechteck(13, 12, 6, 1, '#9a9aa8');
  } else if (art === 'bett') {
    s.rechteck(4, 2, 24, 27, P.holzDunkel);
    s.rechteck(6, 4, 20, 23, '#e8e8f0');
    s.rechteck(8, 5, 16, 6, '#ffffff');
    s.rechteck(6, 13, 20, 14, '#3f74d6');
    s.rechteck(6, 13, 20, 2, '#6fa0f0');
  } else {
    s.rechteck(3, 1, 26, 28, P.holzDunkel);
    for (const y of [3, 12, 21]) {
      s.rechteck(5, y, 22, 7, '#4e3420');
      let x = 6;
      for (const [farbe, breite] of [['#d04848', 3], ['#3f74d6', 2], ['#3fae4a', 3], ['#e8b84a', 2], ['#9a52c8', 3]]) {
        s.rechteck(x, y + 1 + (x % 2), breite, 6 - (x % 2), farbe);
        x += breite + 1;
      }
    }
  }
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
}

const maler = {
  gras: (b) => grasGrund(b, 1),
  gras2: (b) => grasGrund(b, 2, 14),
  blumen: (b) => { grasGrund(b, 3, 4); blume(b, 7, 8, '#ffffff'); blume(b, 22, 13, '#f78fb3'); blume(b, 12, 24, '#ffffff'); },
  weg,
  wasser: (b) => wasser(b, 0),
  wasser2: (b) => wasser(b, 3),
  bruecke,
  hohes_gras: hohesGras,
  stein,
  busch,
  busch_rest: buschRest,
  baum: baumKachel,
  mauer,
  hoehlenboden,
  fels,
  treppe_runter: (b) => treppe(b, true),
  treppe_hoch: (b) => treppe(b, false),
  tempelboden,
  tempelwand,
  pflaster,
  sand,
  dach,
  dachkante,
  hauswand: (b) => hauswand(b, false),
  fenster,
  haustuer,
  brunnen,
  kiste,
  fass,
  laterne,
  eingang: haustuer,
  dielen,
  innenwand,
  wandkante,
  teppich,
  fussmatte,
  tisch: (b) => moebel(b, 'tisch'),
  bett: (b) => moebel(b, 'bett'),
  regal: (b) => moebel(b, 'regal'),
  // Auf See: Strand an der Küste, Land dahinter (dunkleres Gras mit Wald-
  // tupfen — aus der Ferne gesehen, nicht zum Betreten).
  strand: sand,
  see: (b) => wasser(b, 0),
  see2: (b) => wasser(b, 1),
  land: (b) => {
    grasGrund(b, 7, 4);
    const z = zufall(77);
    for (let i = 0; i < 3; i++) klumpen(b, 6 + z() * 20, 6 + z() * 20, 4 + z() * 2, z);
  },
};

const zeilen = Math.ceil(KACHELN.length / SPALTEN);
const satz = new Bild(SPALTEN * K, zeilen * K);
KACHELN.forEach((k, i) => {
  const b = new Bild(K, K);
  maler[k.name](b);
  satz.einfuegen(b, (i % SPALTEN) * K, Math.floor(i / SPALTEN) * K);
});
satz.speichern(ziel + 'kacheln.png');

// ---------- Automatische Kanten (s. client/kanten.js) ----------
// Je ein Bild für „oben" und „Ecke oben-links", die anderen gedreht.
{
  // Ufer: ein heller Saum am Land, davor weicher Schaum in Flecken.
  const schaumOben = new Bild(K, K);
  for (let x = 0; x < K; x++) {
    const welle = Math.round(1.5 + Math.sin(x * 0.45) * 1.2 + Math.sin(x * 1.3) * 0.6);
    for (let y = 0; y < 2 + welle; y++) schaumOben.setze(x, y, y < 2 ? '#2a6aa8' : '#5a9edc');
    schaumOben.setze(x, 2 + welle, (x * 5) % 11 > 2 ? '#e4f4ff' : '#b0d8f4');
    if ((x * 7) % 13 < 3) schaumOben.setze(x, 4 + welle, [228, 244, 255, 150]);
  }
  const schaumEcke = new Bild(K, K);
  schaumEcke.ellipse(0, 0, 5.5, 5.5, '#5a9edc');
  for (let w = 0; w <= 90; w += 8) {
    const r = (w * Math.PI) / 180;
    schaumEcke.setze(Math.round(Math.cos(r) * 6), Math.round(Math.sin(r) * 6), '#e4f4ff');
  }

  // Grasrand über Weg und Pflaster: runde Büschel, darunter ein weicher
  // Schatten auf dem Weg — das Gras liegt sichtbar höher. Der alte Rand war
  // eine gerade Kante mit Zacken.
  const grasOben = new Bild(K, K);
  const hoehe = (x) => 3 + Math.round(2 * Math.sin(x * 0.39 + 1) + 1.2 * Math.sin(x * 0.93));
  for (let x = 0; x < K; x++) {
    const h = hoehe(x);
    for (let y = h + 1; y < h + 4; y++) grasOben.setze(x, y, [40, 30, 20, 55 - (y - h) * 14]);
    for (let y = 0; y <= h; y++) grasOben.setze(x, y, y === h ? P.grasDunkel : y === h - 1 && x % 3 === 0 ? P.grasHell : P.gras);
  }
  const grasEcke = new Bild(K, K);
  grasEcke.ellipse(0, 0, 6, 6, [40, 30, 20, 45]);
  grasEcke.ellipse(0, 0, 5, 5, P.gras);
  for (let w = 0; w <= 90; w += 10) {
    const r = (w * Math.PI) / 180;
    grasEcke.setze(Math.round(Math.cos(r) * 4.6), Math.round(Math.sin(r) * 4.6), P.grasDunkel);
  }

  const blatt = new Bild(8 * K, 3 * K);
  const reihe = (oben, ecke, zeile) => {
    [oben, oben.gedreht(2), oben.gedreht(3), oben.gedreht(1), ecke, ecke.gedreht(1), ecke.gedreht(3), ecke.gedreht(2)]
      .forEach((b, i) => blatt.einfuegen(b, i * K, zeile * K));
  };
  reihe(schaumOben, schaumEcke, 0);
  reihe(grasOben, grasEcke, 1);
  // Zeile 2: Schatten unter einer Wand (Licht von oben links) — nur „oben"
  // wird gebraucht; ohne ihn klebten die Häuser flach am Boden.
  const schatten = new Bild(K, K);
  for (let y = 0; y < 10; y++) schatten.rechteck(0, y, K, 1, [30, 20, 40, Math.round(90 * (1 - y / 10) ** 1.5)]);
  blatt.einfuegen(schatten, 0, 2 * K);
  blatt.speichern(ziel + 'kanten.png');
}

// ---------- Deko (16×16, s. client/deko.js) ----------
// Kleinkram, der auf Wiesen verstreut liegt: drei Grasbüschel, drei Blumen,
// ein Kiesel, ein Pilz. Der Browser verteilt ihn nach Kachel — fest, nicht
// zufällig, damit alle Spieler dieselbe Wiese sehen.
{
  const teile = [];
  const neu = () => new Bild(16, 16);
  for (const [n, breite] of [[5, 2], [7, 3], [4, 1]]) {
    const b = neu();
    for (let i = 0; i < n; i++) {
      const x = 8 - Math.floor(n / 2) * breite / 2 + i * breite * 0.8, l = 3 + ((i * 7) % 4);
      for (let k = 0; k < l; k++) b.setze(Math.round(x + (i - n / 2) * 0.25 * k / l), 14 - k, k > l - 2 ? P.grasHell : i % 2 ? P.grasDunkel : '#5f9e3e');
    }
    teile.push(b);
  }
  for (const bluete of ['#ffffff', '#f4d24a', '#f78fb3']) {
    const b = neu();
    b.rechteck(8, 10, 1, 5, P.grasDunkel);
    b.setze(7, 12, P.grasDunkel);
    b.setze(8, 8, bluete); b.setze(7, 9, bluete); b.setze(9, 9, bluete); b.setze(8, 10, bluete);
    b.setze(8, 9, bluete === '#f4d24a' ? '#e07a2a' : '#f4d24a');
    teile.push(b);
  }
  const kiesel = neu();
  kiesel.ellipse(8, 13, 3, 2, '#a8a8b4');
  kiesel.setze(7, 12, '#d0d0dc');
  kiesel.umriss(RAND);
  teile.push(kiesel);
  const pilz = neu();
  pilz.rechteck(7, 11, 2, 4, '#efe4d0');
  pilz.ellipse(8, 10, 3.5, 2.5, '#c84040', (x, y) => y <= 10);
  pilz.setze(7, 9, '#ffffff');
  pilz.umriss(RAND);
  teile.push(pilz);
  const blatt = new Bild(16 * teile.length, 16);
  teile.forEach((t, i) => blatt.einfuegen(t, i * 16, 0));
  blatt.speichern(ziel + 'deko.png');
}

// ---------- Baum (64×80, steht mit dem Stamm auf seiner Kachel) ----------
// Eine volle Krone aus Klumpen, hinten dunkler, vorn heller; der Stamm mit
// Wurzeln und Rinde; darunter ein weicher Schatten.
{
  const z = zufall(9);
  const b = new Bild(64, 80);
  bodenschatten(b, 33, 75, 22, 5, 90);
  const s = new Bild(64, 80);
  s.rechteck(27, 50, 11, 25, '#8a5a32');
  s.rechteck(34, 50, 4, 25, '#6a4226');
  s.rechteck(29, 54, 2, 14, '#a8743f');
  for (const [x, w] of [[22, 6], [37, 6]]) s.rechteck(x, 71, w, 4, '#7a4e2c');
  s.rechteck(24, 73, 17, 2, '#6a4226');
  for (let i = 0; i < 6; i++) s.setze(30 + Math.floor(z() * 6), 56 + Math.floor(z() * 14), '#5a3820');
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
  const k = new Bild(64, 80);
  // Hintere Klumpen zuerst (unten, dunkler wirkend), dann die oberen.
  for (const [x, y, r] of [[18, 42, 13], [46, 42, 13], [32, 46, 14], [12, 30, 12], [52, 30, 12], [24, 26, 14], [42, 26, 14], [32, 34, 15], [32, 14, 14], [20, 16, 10], [44, 16, 10]])
    klumpen(k, x, y, r, z);
  k.umriss(RAND);
  b.einfuegen(k, 0, 0);
  b.speichern(ziel + 'baum.png');
}

// ---------- Spielfiguren und Leute (32×48, s. figuren.mjs) ----------
// Die Tunika hat die Spielerfarbe, die Klasse bestimmt, was man am Kopf und
// am Körper trägt — zwei Kämpfer unterscheidet man so an der Farbe.
const TUNIKEN = {
  gruen: ['#3fae4a', '#6fd16a', '#2b7d35'],
  rot: ['#d04848', '#ef7a6a', '#932f36'],
  blau: ['#3f74d6', '#6fa0f0', '#2b4f9a'],
  lila: ['#9a52c8', '#c07fe6', '#6a3790'],
};
// Ohne Klasse (Homebrew ohne Bild): Kapuze in der Spielerfarbe.
for (const [name, t] of Object.entries(TUNIKEN)) figurenBlatt({ tunika: t, haar: P.haare, kopf: { art: 'kapuze', farben: t } }).speichern(ziel + `held-${name}.png`);

const KLASSEN = {
  kaempfer: (t) => ({ tunika: t, haar: '#5a3a22', kopf: { art: 'helm', farbe: '#b8b8c8', dunkel: '#6a6a7a', busch: t[0] }, schultern: '#b8b8c8' }),
  schurke: (t) => ({ tunika: t, haar: '#3a2a1a', kopf: { art: 'kapuze', farben: ['#3a3446', '#55506a', '#24202e'] }, schal: '#24202e' }),
  magier: (t) => ({ tunika: t, haar: '#d8d8e0', bart: 'voll', kopf: { art: 'hut', farben: t }, robe: true }),
  kleriker: (t) => ({ tunika: t, haar: P.haare, kopf: { art: 'kapuze', farben: ['#ece6d6', '#ffffff', '#b8ae98'] }, symbol: P.gold }),
  waldlaeufer: (t) => ({ tunika: t, haar: '#a0602a', kopf: { art: 'kapuze', farben: ['#4a6a2a', '#6a8a3a', '#2e4618'] }, koecher: true }),
};
for (const [klasse, aussehen] of Object.entries(KLASSEN))
  for (const [farbe, t] of Object.entries(TUNIKEN)) figurenBlatt(aussehen(t)).speichern(ziel + `held-${klasse}-${farbe}.png`);

// Leute in der Welt: ohne Kapuze — die tragen nur Spieler, so verwechselt
// man einen Bewohner nicht mit einem Mitspieler.
const LEUTE = {
  alter_mann: { tunika: ['#6a6a9a', '#8c8cc0', '#4a4a72'], haar: '#e0e0e8', frisur: 'glatze', bart: 'voll' },
  buergermeister: { tunika: ['#8a2a3a', '#b04a5a', '#5a1a26'], haar: '#5a3a22', bart: 'schnurr' },
  hafenmeisterin: { tunika: ['#2a4a7a', '#4a6a9a', '#1a2a4a'], haar: '#a0402a', frisur: 'lang' },
  wache: { tunika: ['#6a6a7a', '#8a8a9a', '#4a4a5a'], haar: '#3a2a1a', kopf: { art: 'helm', farbe: '#a8a8b8', dunkel: '#5a5a6a' } },
  kind: { tunika: ['#d0a030', '#e8c050', '#9a7020'], haar: '#e8c15a' },
  schreiber: { tunika: ['#4a6a3a', '#6a8a5a', '#2e4a24'], haar: '#9a9aa8', bart: 'schnurr' },
  mutter: { tunika: ['#7a4a8a', '#9a6aaa', '#4e2e5a'], haar: '#6a4020', frisur: 'lang' },
  kraemerin: { tunika: ['#b07a3a', '#d09a5a', '#7a5220'], haar: '#2a2a3a', frisur: 'lang', schuerze: '#e8dcc0' },
};
for (const [name, o] of Object.entries(LEUTE)) figurenBlatt(o).speichern(ziel + `figur-${name}.png`);

// ---------- Geschosse und Funken ----------
// Alle zeigen nach rechts; der Browser dreht sie in die Flugrichtung.
// Bild 0 Dolch, 1 Pfeil, 2–3 Feuerball (flackert).
{
  const blatt = new Bild(64, 16);
  const dolch = new Bild(16, 16);
  dolch.rechteck(2, 7, 3, 2, P.holzDunkel);
  dolch.rechteck(5, 6, 1, 4, P.gold);
  dolch.rechteck(6, 7, 7, 2, '#d8d8e4');
  dolch.rechteck(6, 7, 7, 1, '#ffffff');
  dolch.setze(13, 7, '#d8d8e4');
  dolch.umriss(RAND);
  blatt.einfuegen(dolch, 0, 0);
  const pfeil = new Bild(16, 16);
  pfeil.rechteck(1, 7, 11, 1, P.holz);
  pfeil.rechteck(1, 6, 3, 1, '#f4ecd8');
  pfeil.rechteck(1, 8, 3, 1, '#f4ecd8');
  pfeil.rechteck(12, 6, 2, 3, '#b8b8c8');
  pfeil.setze(14, 7, '#b8b8c8');
  pfeil.umriss(RAND);
  blatt.einfuegen(pfeil, 16, 0);
  for (const [n, flamme] of [[2, 0], [3, 1]]) {
    const f = new Bild(16, 16);
    f.ellipse(5 - flamme, 8, 5, 3 + flamme, '#d04818');
    f.ellipse(9, 8, 5, 5, '#f07828');
    f.ellipse(10, 8, 3, 3, '#f8c848');
    f.ellipse(10.5, 7.5, 1.5, 1.5, '#fff4c0');
    blatt.einfuegen(f, n * 16, 0);
  }
  blatt.speichern(ziel + 'geschosse.png');

  const funke = new Bild(8, 8);
  funke.rechteck(3, 0, 2, 8, '#fff4b0');
  funke.rechteck(0, 3, 8, 2, '#fff4b0');
  funke.rechteck(3, 3, 2, 2, '#ffffff');
  funke.speichern(ziel + 'funke.png');
}

// ---------- Gegenstände (16×16, für Inventar und Laden) ----------
// Reihenfolge = „bild" in gegenstaende.json: 0 Gold, 1 Schlüssel,
// 2 Rissstein, 3 Heiltrank, 4 Langschwert, 5 Lederrüstung, 6 Kettenhemd,
// 7 Zauberstab, 8 Ring, 9 Karte (nur für den Knopf).
{
  const symbol = [];
  const neu = () => new Bild(16, 16);
  let b = neu(); // Gold: kleiner Münzstapel
  for (const [x, y] of [[3, 9], [8, 10], [5, 5]]) {
    b.ellipse(x + 2.5, y + 2.5, 3, 2.5, P.gold);
    b.rechteck(x + 1, y + 1, 2, 1, '#fff0b0');
  }
  symbol.push(b);
  b = neu(); // Schlüssel
  b.ellipse(5, 5, 3.5, 3.5, P.gold);
  b.loeschen(4, 4, 2, 2);
  b.rechteck(7, 7, 2, 7, P.gold);
  b.rechteck(9, 11, 3, 1, P.gold);
  b.rechteck(9, 13, 2, 1, P.gold);
  symbol.push(b);
  b = neu(); // Rissstein: violetter Splitter
  for (let y = 2; y < 14; y++) {
    const w = y < 8 ? (y - 1) * 0.8 : (14 - y) * 0.9;
    b.rechteck(Math.round(8 - w / 2), y, Math.max(1, Math.round(w)), 1, y < 6 ? '#e0b0ff' : '#9a52c8');
  }
  symbol.push(b);
  b = neu(); // Heiltrank
  b.rechteck(6, 2, 4, 2, P.holz);
  b.rechteck(7, 4, 2, 2, '#d8e4f0');
  b.ellipse(8, 10, 5, 4.5, '#d8e4f0');
  b.ellipse(8, 10.5, 4, 3.5, '#d03040');
  b.rechteck(6, 8, 2, 2, '#ff8a90');
  symbol.push(b);
  b = neu(); // Langschwert, schräg
  for (let i = 0; i < 9; i++) b.rechteck(4 + i, 11 - i, 2, 1, i > 6 ? '#ffffff' : '#c8c8d8');
  b.rechteck(2, 10, 5, 2, P.gold);
  b.rechteck(3, 12, 2, 3, P.holzDunkel);
  symbol.push(b);
  b = neu(); // Lederrüstung
  b.rechteck(3, 3, 10, 10, '#9a6a3a');
  b.rechteck(1, 3, 3, 4, '#9a6a3a');
  b.rechteck(12, 3, 3, 4, '#9a6a3a');
  b.loeschen(6, 3, 4, 2);
  b.rechteck(3, 9, 10, 1, '#6a4420');
  b.rechteck(7, 9, 2, 1, P.gold);
  symbol.push(b);
  b = neu(); // Kettenhemd
  b.rechteck(3, 3, 10, 11, '#9a9aaa');
  b.rechteck(1, 3, 3, 5, '#9a9aaa');
  b.rechteck(12, 3, 3, 5, '#9a9aaa');
  b.loeschen(6, 3, 4, 2);
  for (let y = 4; y < 14; y += 2) for (let x = 3 + (y % 4 ? 1 : 0); x < 13; x += 2) b.setze(x, y, '#d0d0e0');
  symbol.push(b);
  b = neu(); // Zauberstab
  for (let i = 0; i < 10; i++) b.rechteck(3 + i, 13 - i, 1, 1, P.holz);
  b.ellipse(12.5, 3.5, 2.5, 2.5, '#6fd0ff');
  b.setze(12, 3, '#ffffff');
  symbol.push(b);
  b = neu(); // Ring
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 10);
      if (d <= 4.6 && d > 2.6) b.setze(x, y, y < 9 ? '#ffffff' : '#c8c8d8');
    }
  b.ellipse(8, 4.5, 2, 2, '#6fe0a0');
  symbol.push(b);
  b = neu(); // Karte (Knopf der Weltkarte): Pergament, halb aufgerollt
  b.rechteck(2, 3, 12, 10, '#f0dca8');
  b.rechteck(2, 3, 2, 10, '#c8a870');
  b.rechteck(12, 3, 2, 10, '#c8a870');
  b.ellipse(7, 7, 2.5, 2, '#6aa848');
  b.ellipse(10, 9, 1.5, 1.2, '#6aa848');
  b.linie(5, 10, 9, 6, '#a04030');
  b.setze(9, 6, '#d04030');
  symbol.push(b);
  const blatt = new Bild(16 * symbol.length, 16);
  symbol.forEach((sy, i) => {
    sy.umriss(RAND);
    blatt.einfuegen(sy, i * 16, 0);
  });
  blatt.speichern(ziel + 'gegenstaende.png');
}

// ---------- Boot (48×48): 0 Bug nach oben, 1 Bug nach rechts ----------
// Ein Ruderboot von oben; die Figur sitzt darin (der Rumpf liegt über ihren
// Beinen). Nach unten und links spiegelt der Browser.
{
  const boot = new Bild(48, 48);
  const breite = (y) => (y < 8 || y > 44 ? 0 : y < 18 ? 10 * Math.sqrt((y - 7) / 11) : 10 - Math.max(0, (y - 38) * 0.9));
  for (let y = 8; y <= 44; y++) {
    const w = breite(y);
    if (w <= 0) continue;
    boot.rechteck(Math.round(24 - w), y, Math.round(w * 2), 1, '#6e4426');
    if (w > 3) boot.rechteck(Math.round(24 - w + 2), y, Math.max(0, Math.round(w * 2) - 4), 1, y % 5 === 0 ? '#8a5a32' : '#a8743f');
    if (w > 3) boot.setze(Math.round(24 - w + 2), y, '#c99560');
  }
  for (const y of [22, 33]) boot.rechteck(15, y, 18, 2, '#5a3820');
  // Ruder links und rechts
  for (const seite of [-1, 1]) {
    boot.linie(24 + seite * 10, 28, 24 + seite * 20, 32, '#8a5a32');
    boot.rechteck(seite < 0 ? 2 : 42, 31, 4, 3, '#a8743f');
  }
  boot.umriss(RAND);
  const blatt = new Bild(96, 48);
  blatt.einfuegen(boot, 0, 0);
  blatt.einfuegen(boot.gedreht(1), 48, 0);
  blatt.speichern(ziel + 'boot.png');
}

// ---------- Schild und Truhe ----------
{
  const b = new Bild(32, 32);
  b.ellipse(16, 29, 8, 2.5, [0, 0, 0, 70]);
  const s = new Bild(32, 32);
  s.rechteck(14, 17, 4, 12, P.holzDunkel);
  s.rechteck(4, 5, 24, 13, P.holz);
  s.rechteck(4, 5, 24, 1, P.holzHell);
  s.rechteck(4, 17, 24, 1, P.holzDunkel);
  for (const y of [9, 13]) s.linie(7, y, 24, y, P.holzDunkel);
  s.setze(6, 7, P.holzDunkel);
  s.setze(25, 7, P.holzDunkel);
  s.umriss(RAND);
  b.einfuegen(s, 0, 0);
  b.speichern(ziel + 'schild.png');

  const truhen = new Bild(64, 32);
  [false, true].forEach((offen, i) => {
    const t = new Bild(32, 32);
    t.ellipse(16, 29, 12, 3, [0, 0, 0, 70]);
    const k = new Bild(32, 32);
    k.rechteck(4, 14, 24, 14, P.holz);
    k.rechteck(4, 26, 24, 2, P.holzDunkel);
    if (offen) {
      k.rechteck(4, 4, 24, 8, P.holzDunkel);
      k.rechteck(6, 6, 20, 5, '#5a3820');
      k.rechteck(6, 14, 20, 4, UMRISS);
    } else {
      k.rechteck(4, 8, 24, 7, P.holzDunkel);
      k.rechteck(4, 8, 24, 1, P.holzHell);
      k.rechteck(14, 13, 4, 6, P.gold);
      k.setze(15, 15, UMRISS);
      k.setze(16, 15, UMRISS);
    }
    for (const x of [7, 23]) k.rechteck(x, offen ? 14 : 8, 2, offen ? 14 : 20, P.gold);
    k.umriss(RAND);
    t.einfuegen(k, 0, 0);
    truhen.einfuegen(t, i * 32, 0);
  });
  truhen.speichern(ziel + 'truhe.png');
}

// ---------- Tür (zu, offen) ----------
{
  const blatt = new Bild(64, 32);
  [false, true].forEach((offen, i) => {
    const t = new Bild(32, 32);
    // Steinrahmen wie die Höhlenwand, damit die Tür in der Wand sitzt.
    t.rechteck(0, 0, 32, 32, '#6b5e72');
    t.rechteck(0, 0, 32, 2, '#2a1e2e');
    t.rechteck(4, 4, 24, 28, '#4e4456');
    if (offen) {
      t.rechteck(6, 6, 20, 26, '#1b1424');
      t.rechteck(6, 6, 20, 2, '#2a1e2e');
    } else {
      t.rechteck(6, 6, 20, 26, P.holz);
      for (const x of [11, 16, 21]) t.rechteck(x, 6, 1, 26, P.holzDunkel);
      t.rechteck(6, 6, 20, 1, P.holzHell);
      t.rechteck(6, 12, 20, 2, '#5e5146');
      t.rechteck(6, 24, 20, 2, '#5e5146');
      t.rechteck(13, 15, 6, 7, P.gold);
      t.rechteck(15, 17, 2, 3, UMRISS);
    }
    blatt.einfuegen(t, i * 32, 0);
  });
  blatt.speichern(ziel + 'tuer.png');
}

// ---------- Dimensionsriss: 4 Bilder, 32×48 ----------
// Ein senkrechter Spalt in der Luft, violett mit türkisem Kern, der flackert.
{
  const blatt = new Bild(128, 48);
  for (let bild = 0; bild < 4; bild++) {
    const r = new Bild(32, 48);
    const z = zufall(100 + bild);
    for (let y = 4; y < 46; y++) {
      const t = (y - 4) / 42;
      const breite = Math.sin(t * Math.PI) * (7 + Math.sin(t * 9 + bild * 1.6) * 2);
      const mitte = 16 + Math.sin(t * 6 + bild) * 2;
      for (let x = Math.floor(mitte - breite); x <= Math.ceil(mitte + breite); x++) {
        const d = Math.abs(x - mitte) / Math.max(breite, 0.5);
        r.setze(x, y, d < 0.35 ? '#c8fff4' : d < 0.65 ? '#5ad8e0' : d < 0.9 ? '#8a4ad0' : [90, 40, 150, 160]);
      }
    }
    for (let i = 0; i < 10; i++) {
      const x = 4 + Math.floor(z() * 24), y = 4 + Math.floor(z() * 40);
      r.setze(x, y, z() < 0.5 ? '#e8d0ff' : '#5ad8e0');
    }
    blatt.einfuegen(r, bild * 32, 0);
  }
  blatt.speichern(ziel + 'riss.png');
}

// ---------- Symbole für die Anzeige (12×12): Gold, Schlüssel, Rissstein ----------
{
  const blatt = new Bild(36, 12);
  const gold = new Bild(12, 12);
  gold.ellipse(6, 6, 4.5, 4.5, P.gold);
  gold.ellipse(5, 5, 2, 2, '#f8e08a');
  gold.rechteck(6, 4, 1, 4, '#b08a2a');
  gold.umriss(RAND);
  const schl = new Bild(12, 12);
  schl.ellipse(4, 4, 2.6, 2.6, P.gold);
  schl.setze(4, 4, UMRISS);
  schl.linie(5, 5, 9, 9, P.gold);
  schl.linie(6, 5, 10, 9, P.gold);
  schl.setze(8, 10, P.gold);
  schl.setze(9, 11, P.gold);
  schl.umriss(RAND);
  const stein = new Bild(12, 12);
  stein.muster(2, 1, ['   pp   ', '  pttp  ', ' pttttp ', 'pttwtttp', ' pttttp ', '  pttp  ', '   pp   '], { p: '#8a4ad0', t: '#5ad8e0', w: '#c8fff4' });
  stein.umriss(RAND);
  [gold, schl, stein].forEach((b, i) => blatt.einfuegen(b, i * 12, 0));
  blatt.speichern(ziel + 'symbole.png');
}

// ---------- Schwert (12×32, Griff unten; gedreht wird um den Griff) ----------
{
  const b = new Bild(12, 32);
  b.rechteck(5, 2, 2, 19, '#dfe6ee');
  b.rechteck(6, 3, 1, 18, '#a9b4c2');
  b.setze(5, 1, '#dfe6ee');
  b.rechteck(1, 21, 10, 2, P.gold);
  b.rechteck(5, 23, 2, 5, P.guertel);
  b.rechteck(4, 28, 4, 2, P.gold);
  b.umriss(RAND);
  b.speichern(ziel + 'schwert.png');
}

// ---------- Schleim: 2 Bilder (rund, gestaucht) ----------
{
  const blatt = new Bild(64, 32);
  [[16, 21, 11, 9], [16, 23, 13, 7]].forEach(([cx, cy, rx, ry], i) => {
    const s = new Bild(32, 32);
    s.ellipse(cx, cy, rx, ry, '#d9506e');
    s.ellipse(cx, cy + 2, rx - 1, ry - 2, '#a3344f', (x, y) => y > cy + 2);
    s.ellipse(cx - 5, cy - ry + 4, 3, 2, '#f08aa0');
    s.rechteck(cx - 6, cy - ry + 3, 2, 2, '#ffffff');
    s.rechteck(cx - 4, cy - 1, 2, 4, UMRISS);
    s.rechteck(cx + 3, cy - 1, 2, 4, UMRISS);
    s.setze(cx - 4, cy - 1, '#ffffff');
    s.setze(cx + 3, cy - 1, '#ffffff');
    s.umriss(RAND);
    blatt.einfuegen(s, i * 32, 0);
  });
  blatt.speichern(ziel + 'schleim.png');
}

// ---------- Monster aus monster.json: Seitenansicht, Blick nach links ----------
// Der Browser spiegelt sie, wenn sie nach rechts laufen. Zwei Laufbilder;
// der Wolf hat ein drittes (geduckt, kurz vor dem Sprung).
function monsterBlatt(name, bilder) {
  const blatt = new Bild(32 * bilder.length, 32);
  bilder.forEach((zeichnen, i) => {
    const b = new Bild(32, 32);
    zeichnen(b);
    b.umriss(RAND);
    blatt.einfuegen(b, i * 32, 0);
  });
  blatt.speichern(ziel + `${name}.png`);
}

{
  const fell = '#8a7a6a', fellDunkel = '#5e5248', rosa = '#e8a0a8';
  const ratte = (schritt) => (b) => {
    b.rechteck(24, 22, 4, 1, rosa); // Schwanz
    b.rechteck(27, 19, 1, 3, rosa);
    b.rechteck(28, 18, 2, 1, rosa);
    b.ellipse(17, 23, 8, 4.5, fell);
    b.ellipse(17, 25, 7, 2.5, fellDunkel, (x, y) => y > 25);
    b.ellipse(9, 21, 4.5, 3.5, fell);
    b.rechteck(4, 21, 3, 2, fell);
    b.setze(3, 21, rosa);
    b.ellipse(10, 17.5, 2, 2, rosa);
    b.rechteck(8, 20, 2, 1, UMRISS);
    for (const [x, d] of [[11, schritt], [15, -schritt], [20, schritt], [23, -schritt]]) b.rechteck(x + d, 27, 2, 2, fellDunkel);
  };
  monsterBlatt('riesenratte', [ratte(0), ratte(1)]);
}

{
  const grau = '#8c8c98', hell = '#b8b8c4', dunkel = '#5c5c6a';
  const wolf = (schritt, geduckt = false) => (b) => {
    const tief = geduckt ? 3 : 0;
    b.rechteck(26, 12 + tief, 3, 7, grau); // Schwanz
    b.rechteck(28, 10 + tief, 2, 3, hell);
    b.ellipse(18, 18 + tief, 10, 5.5, grau);
    b.ellipse(18, 21 + tief, 8, 2.5, hell, (x, y) => y > 20 + tief);
    b.ellipse(8, 14 + tief, 5, 4.5, grau);
    b.rechteck(1, 15 + tief, 5, 3, grau); // Schnauze
    b.setze(1, 15 + tief, UMRISS);
    b.rechteck(7, 7 + tief, 2, 4, dunkel); // Ohren
    b.rechteck(10, 7 + tief, 2, 4, dunkel);
    b.rechteck(6, 13 + tief, 2, 2, '#f0d040');
    if (!geduckt)
      for (const [x, d] of [[10, schritt], [14, -schritt], [21, schritt], [25, -schritt]]) b.rechteck(x + d, 23, 2, 6, dunkel);
    else for (const x of [9, 13, 21, 25]) b.rechteck(x, 26, 3, 3, dunkel);
  };
  monsterBlatt('wolf', [wolf(0), wolf(1), wolf(0, true)]);
}

{
  const haut = '#7cae4a', hautDunkel = '#557a32', tunika = '#7a5a3a';
  const goblin = (schritt) => (b) => {
    b.rechteck(12 + schritt, 25, 3, 4, P.stiefel);
    b.rechteck(17 - schritt, 25, 3, 4, P.stiefel);
    b.rechteck(11, 17, 10, 9, tunika);
    b.rechteck(11, 22, 10, 1, P.guertel);
    b.ellipse(15, 11, 6.5, 6, haut);
    b.rechteck(5, 8, 4, 2, haut); // spitzes Ohr
    b.rechteck(3, 7, 2, 1, haut);
    b.rechteck(21, 8, 3, 2, hautDunkel);
    b.rechteck(10, 10, 2, 2, '#f8e040');
    b.setze(10, 10, UMRISS);
    b.rechteck(9, 14, 4, 1, hautDunkel);
    // Bogen in der vorderen Hand
    b.rechteck(7, 16, 3, 3, haut);
    for (let y = 12; y < 26; y++) b.setze(5 - (y > 15 && y < 22 ? 1 : 0), y, P.holz);
    for (let y = 13; y < 25; y++) b.setze(6, y, '#e0e0d0');
  };
  monsterBlatt('goblin', [goblin(0), goblin(1)]);
}

{
  const knochen = '#e8e4d4', schatten = '#a8a494';
  const skelett = (schritt) => (b) => {
    b.rechteck(12 + schritt, 21, 2, 8, knochen);
    b.rechteck(18 - schritt, 21, 2, 8, knochen);
    b.rechteck(11, 27, 3, 2, knochen);
    b.rechteck(17, 27, 3, 2, knochen);
    b.rechteck(15, 13, 2, 9, knochen); // Wirbelsäule
    for (const y of [14, 16, 18]) b.rechteck(11, y, 10, 1, knochen);
    b.rechteck(12, 20, 8, 2, schatten);
    b.rechteck(8, 14 - schritt, 2, 7, knochen); // Arme
    b.rechteck(22, 14 + schritt, 2, 7, knochen);
    b.ellipse(15, 8, 6, 5.5, knochen);
    b.rechteck(11, 11, 8, 2, knochen);
    b.rechteck(11, 7, 3, 3, UMRISS);
    b.rechteck(16, 7, 3, 3, UMRISS);
    b.setze(12, 8, '#e04040');
    b.rechteck(12, 12, 6, 1, schatten);
  };
  monsterBlatt('skelett', [skelett(0), skelett(1)]);
}

{
  const fluegel = '#5a3a6a', koerper = '#3e2a4a', haut = '#8a6a9a';
  const fledermaus = (oben) => (b) => {
    // Höher im Bild: sie fliegt. Darunter malt der Browser den Schatten.
    b.ellipse(16, 12, 4.5, 5, koerper);
    b.rechteck(13, 5, 2, 3, koerper);
    b.rechteck(18, 5, 2, 3, koerper);
    b.rechteck(13, 10, 2, 2, '#ff4040');
    b.rechteck(17, 10, 2, 2, '#ff4040');
    for (const seite of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        const x = 16 + seite * (5 + i);
        const y = oben ? 10 - Math.round(i * 0.6) : 12 + Math.round(i * 0.4);
        b.rechteck(Math.min(x, x + seite), y, 1, 4 - (i % 3 === 2 ? 2 : 0), fluegel);
        if (i % 3 === 0) b.setze(x, y, haut);
      }
    }
  };
  monsterBlatt('riesenfledermaus', [fledermaus(true), fledermaus(false)]);
}

// ---------- Herzen 16×16: voll, halb, leer ----------
{
  const form = [
    ' rr   rr ',
    'rwrr rrrr',
    'rwrrrrrrr',
    'rrrrrrrrr',
    ' rrrrrrr ',
    '  rrrrr  ',
    '   rrr   ',
    '    r    ',
  ];
  const blatt = new Bild(48, 16);
  ['voll', 'halb', 'leer'].forEach((art, i) => {
    const s = new Bild(16, 16);
    const leer = '#5a3a4a';
    s.muster(3, 4, form, { r: art === 'leer' ? leer : '#e8384f', w: art === 'leer' ? leer : '#ffb0b8' });
    if (art === 'halb') for (let y = 0; y < 16; y++) for (let x = 8; x < 16; x++) if (s.hole(x, y)[3]) s.setze(x, y, leer);
    s.umriss(RAND);
    blatt.einfuegen(s, i * 16, 0);
  });
  blatt.speichern(ziel + 'herz.png');
}

// ---------- Kleinkram ----------
{
  const s = new Bild(20, 8);
  s.ellipse(10, 4, 9, 3.5, [0, 0, 0, 90]);
  s.speichern(ziel + 'schatten.png');

  const rauch = new Bild(72, 24);
  [5, 8, 10].forEach((r, i) => {
    const w = new Bild(24, 24);
    // Das letzte Bild ist ein Ring: die Wolke reißt auf.
    const ring = (x, y) => i < 2 || Math.hypot(x + 0.5 - 12, y + 0.5 - 12) > r - 4;
    w.ellipse(12, 12, r, r, i === 2 ? '#e8e8f0' : '#ffffff', ring);
    w.umriss('#9a9ab0');
    rauch.einfuegen(w, i * 24, 0);
  });
  rauch.speichern(ziel + 'rauch.png');

  const blaetter = new Bild(24, 8);
  [[' gg ', 'gGgg', 'ggG ', ' g  '], ['  g ', ' gGg', 'gGg ', ' g  '], ['gg  ', 'gGgg', ' ggG', '  g ']].forEach((m, i) =>
    blaetter.muster(i * 8 + 2, 2, m, { g: P.blattHell, G: P.blattDunkel }));
  blaetter.speichern(ziel + 'blaetter.png');
}

console.log('Grafiken geschrieben nach', ziel);
