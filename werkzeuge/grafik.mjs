// Malt alle Platzhalter-Grafiken nach inhalte/grafik/. Aufruf: npm run grafik
//
// Maßstab: Link's Awakening hat 16er-Kacheln, wir 32er — doppelte Auflösung,
// aber dieselben Proportionen (großer Kopf, kleiner Körper, dunkler Umriss).
import { Bild, zufall } from './pixel.mjs';
import { KACHELN, GROESSE as K, SPALTEN } from './kacheln.mjs';
import { fileURLToPath } from 'node:url';

const ziel = fileURLToPath(new URL('../inhalte/grafik/', import.meta.url));
const UMRISS = '#2a1e2e';

const P = {
  gras: '#68b04f', grasDunkel: '#4f9440', grasHell: '#84c868',
  weg: '#d8bf87', wegDunkel: '#bfa36c', wegHell: '#e8d6a6',
  wasser: '#3f86d0', wasserHell: '#7ab8f0', wasserDunkel: '#2f6aae',
  holz: '#a8743f', holzDunkel: '#7a4f2a', holzHell: '#c99560',
  stein: '#9a9aa8', steinHell: '#c6c6d0', steinDunkel: '#6c6c7c',
  blatt: '#3f8c3a', blattHell: '#62b452', blattDunkel: '#2c6a2e', blattUmriss: '#1d3a20',
  haut: '#f2c49b', hautDunkel: '#d39a72', haare: '#e8c15a', auge: '#2a1e2e',
  stiefel: '#6b4426', stiefelHell: '#8c5d37', guertel: '#5a3a1e', gold: '#e8b84a',
};

// ---------- Kacheln ----------

function grasGrund(b, saat, buescheln = 8) {
  const z = zufall(saat);
  b.rechteck(0, 0, K, K, P.gras);
  // Weiche Flecken in zwei Tönen, damit eine Wiese nicht wie Tapete wirkt.
  // Nur innen (Abstand zum Rand), sonst sähe man an Kachelkanten Schnitte.
  for (let i = 0; i < 3; i++) {
    const x = 6 + z() * 20, y = 6 + z() * 20, r = 3 + z() * 3;
    b.ellipse(x, y, r, r * 0.7, i % 2 ? '#72b858' : '#61a849');
  }
  for (let i = 0; i < buescheln; i++) {
    const x = Math.floor(z() * (K - 4)) + 1, y = Math.floor(z() * (K - 4)) + 2;
    b.setze(x, y + 1, P.grasDunkel);
    b.setze(x + 1, y, P.grasDunkel);
    b.setze(x + 2, y + 1, P.grasDunkel);
    if (z() < 0.5) b.setze(x + 1, y - 1, P.grasHell);
  }
  for (let i = 0; i < 6; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), P.grasHell);
}

function blume(b, x, y, bluete) {
  b.setze(x, y - 1, bluete); b.setze(x - 1, y, bluete); b.setze(x + 1, y, bluete); b.setze(x, y + 1, bluete);
  b.setze(x, y, '#f4d24a');
  b.setze(x, y + 2, P.grasDunkel);
}

function wasser(b, versatz) {
  b.rechteck(0, 0, K, K, P.wasser);
  // Schräge Lichtstreifen und ein Glitzerpunkt; sie wandern mit dem
  // zweiten Bild (versatz), so bewegt sich das Wasser.
  for (let i = 0; i < 3; i++) {
    const x0 = (i * 11 + versatz * 2) % K;
    for (let d = 0; d < 6; d++) b.setze((x0 + d) % K, 6 + i * 9 + Math.floor(d / 2), '#4a92da');
  }
  b.setze((19 + versatz * 3) % K, 21, '#d8f0ff');
  const z = zufall(7);
  for (let i = 0; i < 7; i++) {
    const x = (Math.floor(z() * K) + versatz) % K, y = Math.floor(z() * (K - 2)) + 1;
    for (let d = 0; d < 5; d++) b.setze((x + d) % K, y, d === 0 || d === 4 ? P.wasserDunkel : P.wasserHell);
  }
}

function stein(b) {
  grasGrund(b, 31, 4);
  b.ellipse(16, 27, 12, 4, [0, 0, 0, 70]);
  const s = new Bild(K, K);
  s.ellipse(16, 18, 12, 10, P.stein);
  s.ellipse(16, 21, 11, 7, P.steinDunkel, (x, y) => y > 21);
  s.ellipse(12, 14, 5, 3.5, P.steinHell);
  s.linie(18, 12, 21, 17, P.steinDunkel);
  s.umriss(UMRISS);
  b.einfuegen(s, 0, 0);
}

function busch(b) {
  grasGrund(b, 41, 4);
  b.ellipse(16, 27, 13, 4, [0, 0, 0, 70]);
  const s = new Bild(K, K);
  for (const [x, y, r] of [[10, 17, 7], [22, 17, 7], [16, 12, 8], [16, 21, 8]]) s.ellipse(x, y, r, r, P.blatt);
  const z = zufall(5);
  for (let i = 0; i < 18; i++) {
    const x = 5 + Math.floor(z() * 22), y = 6 + Math.floor(z() * 20);
    if (s.hole(x, y)[3]) s.setze(x, y, z() < 0.5 ? P.blattHell : P.blattDunkel);
  }
  s.ellipse(12, 10, 3, 2, P.blattHell);
  s.umriss(P.blattUmriss);
  b.einfuegen(s, 0, 0);
}

function buschRest(b) {
  grasGrund(b, 41, 4);
  for (const [x, y] of [[10, 20], [20, 18], [15, 23]]) {
    b.rechteck(x, y, 3, 2, P.blattDunkel);
    b.setze(x + 1, y - 1, P.blattHell);
  }
}

function mauer(b) {
  b.rechteck(0, 0, K, K, '#9b8b7a');
  for (let reihe = 0; reihe < 4; reihe++) {
    const y = reihe * 8;
    b.rechteck(0, y + 7, K, 1, '#5e5146');
    const v = reihe % 2 ? 8 : 0;
    for (let x = v; x < K + 16; x += 16) {
      b.rechteck(x % K, y, 1, 7, '#5e5146');
      b.rechteck((x + 1) % K, y, 13, 1, '#b8a895');
    }
  }
}

function weg(b) {
  const z = zufall(11);
  b.rechteck(0, 0, K, K, P.weg);
  for (let i = 0; i < 14; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), P.wegDunkel);
  for (let i = 0; i < 8; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), P.wegHell);
  // Ein paar Kiesel mit Licht oben.
  for (let i = 0; i < 4; i++) {
    const x = 3 + Math.floor(z() * 26), y = 3 + Math.floor(z() * 26);
    b.rechteck(x, y, 2, 2, '#a88e5e');
    b.setze(x, y, P.wegHell);
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

function hohesGras(b) {
  grasGrund(b, 51, 2);
  for (let x = 2; x < K; x += 5)
    for (const y0 of [12, 24]) {
      b.linie(x, y0, x - 1, y0 - 7, P.grasDunkel);
      b.linie(x + 2, y0, x + 3, y0 - 6, P.blattDunkel);
      b.setze(x + 1, y0 - 4, P.grasHell);
    }
}

function baumKachel(b) {
  // Nur für Tiled sichtbar: das Spiel ersetzt diese Kachel durch baum.png.
  grasGrund(b, 61, 3);
  b.ellipse(16, 12, 12, 10, P.blatt);
  b.rechteck(14, 20, 4, 9, P.holz);
}

function hoehlenboden(b) {
  const z = zufall(71);
  b.rechteck(0, 0, K, K, '#4a4050');
  for (let i = 0; i < 16; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), z() < 0.5 ? '#3a3240' : '#5a5062');
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(z() * (K - 4)), y = Math.floor(z() * (K - 3));
    b.rechteck(x, y, 3, 2, '#5a5062');
    b.rechteck(x + 1, y + 2, 3, 1, '#2e2834');
  }
}

function fels(b) {
  // Höhlenwand: oben die dunkle Kante, darunter Gestein mit Lichtkante —
  // wie die Klippen in Link's Awakening, damit man sie als Wand liest.
  b.rechteck(0, 0, K, K, '#6b5e72');
  const z = zufall(81);
  for (const [x, y, w, h] of [[1, 3, 14, 12], [17, 2, 14, 13], [2, 17, 12, 13], [15, 18, 16, 12]]) {
    b.rechteck(x, y, w, h, '#7d7084');
    b.rechteck(x, y, w, 1, '#9a8ea2');
    b.rechteck(x, y + h - 1, w, 1, '#4e4456');
  }
  for (let i = 0; i < 10; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), '#4e4456');
  b.rechteck(0, 0, K, 2, '#2a1e2e');
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

function pflaster(b) {
  // Kopfsteine in versetzten Reihen; jeder Stein oben heller, unten dunkler.
  b.rechteck(0, 0, K, K, '#857766');
  const z = zufall(111);
  for (let reihe = 0; reihe < 4; reihe++) {
    const y = reihe * 8, v = reihe % 2 ? 4 : 0;
    for (let x = -v; x < K; x += 8) {
      const ton = ['#a89a86', '#b2a48e', '#9e907c'][Math.floor(z() * 3)];
      b.rechteck(x + 1, y + 1, 6, 6, ton);
      b.rechteck(x + 1, y + 1, 6, 1, '#c4b6a0');
      b.rechteck(x + 1, y + 6, 6, 1, '#8e806e');
    }
  }
}

function sand(b) {
  const z = zufall(121);
  b.rechteck(0, 0, K, K, '#e6d3a0');
  for (let i = 0; i < 18; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), z() < 0.5 ? '#d4bf88' : '#f2e4bc');
  for (let i = 0; i < 2; i++) {
    const x = 4 + Math.floor(z() * 22), y = 4 + Math.floor(z() * 22);
    b.rechteck(x, y, 3, 1, '#c8b07a');
  }
}

const DACH = { grund: '#a8483a', dunkel: '#7a3028', hell: '#c8604a' };
function dach(b) {
  // Ziegel in Reihen, jede Reihe mit Schatten unten — so liest man Schräge.
  b.rechteck(0, 0, K, K, DACH.grund);
  for (let reihe = 0; reihe < 4; reihe++) {
    const y = reihe * 8, v = reihe % 2 ? 4 : 0;
    b.rechteck(0, y + 6, K, 2, DACH.dunkel);
    for (let x = -v; x < K; x += 8) {
      b.rechteck(x, y, 1, 6, DACH.dunkel);
      b.rechteck(x + 2, y + 1, 4, 1, DACH.hell);
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
  s.umriss(UMRISS);
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
  s.umriss(UMRISS);
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
  s.umriss(UMRISS);
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
  s.umriss(UMRISS);
  b.einfuegen(s, 0, 0);
}

// ---------- Innenräume ----------

function dielen(b) {
  b.rechteck(0, 0, K, K, '#b07a48');
  for (let reihe = 0; reihe < 4; reihe++) {
    const y = reihe * 8;
    b.rechteck(0, y + 7, K, 1, '#7a5030');
    b.rechteck(0, y, K, 1, '#c48e5a');
    const fuge = (reihe * 13) % 24 + 4;
    b.rechteck(fuge, y, 1, 7, '#7a5030');
  }
  const z = zufall(131);
  for (let i = 0; i < 6; i++) b.setze(Math.floor(z() * K), Math.floor(z() * K), '#966238');
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
  s.umriss(UMRISS);
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
  const schaumOben = new Bild(K, K);
  for (let x = 0; x < K; x++) {
    const welle = Math.round(1.5 + Math.sin(x * 0.55) * 1.2);
    for (let y = 0; y < 3 + welle; y++) schaumOben.setze(x, y, '#5aa0e0');
    if ((x + 3) % 9 > 1) schaumOben.setze(x, 3 + welle, '#e0f4ff');
    if (x % 7 === 2) schaumOben.setze(x, 6 + welle, '#a8d4f4');
  }
  const schaumEcke = new Bild(K, K);
  schaumEcke.ellipse(0, 0, 6, 6, '#5aa0e0');
  for (let w = 0; w <= 90; w += 9) {
    const r = (w * Math.PI) / 180;
    schaumEcke.setze(Math.round(Math.cos(r) * 6.5), Math.round(Math.sin(r) * 6.5), '#e0f4ff');
  }

  const grasOben = new Bild(K, K);
  grasOben.rechteck(0, 0, K, 2, P.gras);
  for (let x = 0; x < K; x += 2) {
    const l = [2, 4, 1, 3, 5, 2, 3, 1][(x / 2) % 8];
    for (let y = 2; y < 2 + l; y++) grasOben.setze(x, y, P.gras);
    grasOben.setze(x, 2 + l, P.grasDunkel);
    if (l > 2) grasOben.setze(x + 1, 2 + l - 2, P.grasDunkel);
  }
  const grasEcke = new Bild(K, K);
  grasEcke.ellipse(0, 0, 4, 4, P.gras);
  for (const [x, y] of [[4, 1], [3, 3], [1, 4], [5, 3]]) grasEcke.setze(x, y, P.grasDunkel);

  const blatt = new Bild(8 * K, 2 * K);
  const reihe = (oben, ecke, zeile) => {
    [oben, oben.gedreht(2), oben.gedreht(3), oben.gedreht(1), ecke, ecke.gedreht(1), ecke.gedreht(3), ecke.gedreht(2)]
      .forEach((b, i) => blatt.einfuegen(b, i * K, zeile * K));
  };
  reihe(schaumOben, schaumEcke, 0);
  reihe(grasOben, grasEcke, 1);
  blatt.speichern(ziel + 'kanten.png');
}

// ---------- Baum (64×80, steht mit dem Stamm auf seiner Kachel) ----------
{
  const b = new Bild(64, 80);
  b.ellipse(32, 75, 20, 5, [0, 0, 0, 80]);
  const s = new Bild(64, 80);
  s.rechteck(26, 54, 12, 22, P.holz);
  s.rechteck(34, 54, 4, 22, P.holzDunkel);
  s.rechteck(28, 58, 2, 10, P.holzHell);
  s.rechteck(23, 72, 18, 4, P.holz);
  s.umriss(UMRISS);
  b.einfuegen(s, 0, 0);
  const k = new Bild(64, 80);
  for (const [x, y, r] of [[32, 18, 16], [17, 30, 14], [47, 30, 14], [24, 44, 14], [40, 44, 14], [32, 32, 18]])
    k.ellipse(x, y, r, r * 0.95, P.blatt);
  k.ellipse(32, 44, 26, 12, P.blattDunkel, (x, y) => y > 44);
  const z = zufall(9);
  for (let i = 0; i < 70; i++) {
    const x = 4 + Math.floor(z() * 56), y = 4 + Math.floor(z() * 52);
    if (k.hole(x, y)[3]) {
      const f = y < 30 && z() < 0.7 ? P.blattHell : P.blattDunkel;
      k.setze(x, y, f);
      k.setze(x + 1, y, f);
    }
  }
  for (const [x, y, r] of [[25, 14, 5], [13, 26, 4], [36, 24, 4]]) k.ellipse(x, y, r, r * 0.8, P.blattHell);
  k.umriss(P.blattUmriss);
  b.einfuegen(k, 0, 0);
  b.speichern(ziel + 'baum.png');
}

// ---------- Held: 4 Zeilen (unten, oben, links, rechts) × 4 Bilder ----------
// Bilder: 0 stehen, 1 und 2 Schritte, 3 Hieb.
const TUNIKEN = {
  gruen: ['#3fae4a', '#6fd16a', '#2b7d35'],
  rot: ['#d04848', '#ef7a6a', '#932f36'],
  blau: ['#3f74d6', '#6fa0f0', '#2b4f9a'],
  lila: ['#9a52c8', '#c07fe6', '#6a3790'],
};

function beine(b, links, rechts) {
  for (const [x, y] of [links, rechts]) {
    b.rechteck(x, y, 4, 4, P.stiefel);
    b.rechteck(x, y, 4, 1, P.stiefelHell);
  }
}

// kapuze: eigene Farben für die Kapuze (Schurke dunkel, Kleriker weiß);
// sonst hat sie die Farbe der Tunika.
function held(t, richtung, bild, kapuze = t, umriss = true) {
  const [tu, hell, dunkel] = t;
  const [ku, khell, kdunkel] = kapuze;
  const b = new Bild(32, 32);
  const schritt = bild === 1 ? -1 : bild === 2 ? 1 : 0;

  if (richtung === 'links') {
    if (bild === 1) beine(b, [10, 26], [18, 25]);
    else if (bild === 2) beine(b, [12, 25], [16, 26]);
    else beine(b, [12, 26], [16, 26]);
    b.rechteck(11, 18, 10, 6, tu);
    b.rechteck(10, 23, 12, 4, tu);
    b.rechteck(19, 18, 2, 9, dunkel);
    b.rechteck(10, 26, 12, 1, dunkel);
    b.rechteck(11, 22, 10, 1, P.guertel);
    if (bild === 3) {
      b.rechteck(7, 20, 7, 3, tu);
      b.rechteck(4, 20, 3, 3, P.haut);
    } else {
      const a = schritt * 2;
      b.rechteck(14 + a, 19, 3, 5, hell);
      b.rechteck(14 + a, 24, 3, 2, P.haut);
    }
    b.ellipse(15, 11.5, 8, 7.5, P.haut);
    b.ellipse(16, 10.5, 9, 8, ku, (x, y) => y <= 8 || x >= 18);
    b.ellipse(13, 6, 3, 2, khell);
    b.rechteck(24, 6, 3, 3, ku);
    b.rechteck(26, 8, 3, 3, ku);
    b.rechteck(28, 10, 2, 2, kdunkel);
    for (let x = 8; x <= 17; x++) {
      b.setze(x, 9, P.haare);
      if (x % 2 === 0) b.setze(x, 10, P.haare);
    }
    b.rechteck(10, 12, 2, 3, P.auge);
    b.setze(10, 12, '#ffffff');
    b.setze(6, 14, P.haut);
    b.rechteck(17, 13, 1, 2, P.hautDunkel);
  } else {
    const hinten = richtung === 'oben';
    beine(b, [11, 26 + (schritt === -1 ? -1 : 0)], [17, 26 + (schritt === 1 ? -1 : 0)]);
    b.rechteck(10, 18, 12, 6, tu);
    b.rechteck(9, 23, 14, 4, tu);
    b.rechteck(20, 18, 2, 9, dunkel);
    b.rechteck(9, 26, 14, 1, dunkel);
    b.rechteck(10, 18, 1, 5, hell);
    b.rechteck(10, 22, 12, 1, P.guertel);
    if (!hinten) b.rechteck(15, 22, 2, 1, P.gold);
    const aL = -schritt, aR = schritt;
    b.rechteck(7, 19 + aL, 3, 5, tu);
    b.rechteck(7, 24 + aL, 3, 2, P.haut);
    if (bild === 3 && !hinten) {
      b.rechteck(20, 21, 3, 6, tu);
      b.rechteck(20, 27, 3, 2, P.haut);
    } else if (bild === 3) {
      b.rechteck(22, 15, 3, 6, tu);
      b.rechteck(22, 13, 3, 2, P.haut);
    } else {
      b.rechteck(22, 19 + aR, 3, 5, tu);
      b.rechteck(22, 24 + aR, 3, 2, P.haut);
    }
    if (hinten) {
      // Von hinten deckt die Kapuze den ganzen Kopf; nur unten an den
      // Seiten schaut Haar heraus. Mehr Haar sah aus wie eine Maske.
      b.ellipse(16, 11.5, 8.5, 7.5, ku);
      for (const x of [9, 10, 11, 20, 21, 22]) b.rechteck(x, 14 + (x % 2), 1, 3 - (x % 2), P.haare);
      b.rechteck(14, 13, 4, 5, kdunkel);
      b.rechteck(15, 13, 2, 4, ku);
      b.rechteck(15, 18, 2, 1, kdunkel);
      b.ellipse(12, 6, 3, 2, khell);
    } else {
      b.ellipse(16, 11.5, 8.5, 7.5, P.haut);
      b.ellipse(16, 9, 9.5, 6.5, ku, (x, y) => y <= 8);
      b.ellipse(12, 5, 3, 2, khell);
      for (let x = 9; x <= 23; x++) {
        b.setze(x, 9, P.haare);
        if (x % 2) b.setze(x, 10, P.haare);
      }
      b.rechteck(12, 12, 2, 3, P.auge);
      b.rechteck(18, 12, 2, 3, P.auge);
      b.setze(12, 12, '#ffffff');
      b.setze(18, 12, '#ffffff');
      b.setze(11, 16, '#f0a08a');
      b.setze(20, 16, '#f0a08a');
    }
    b.rechteck(24, 6, 3, 3, ku);
    b.rechteck(26, 8, 2, 3, ku);
    b.rechteck(27, 10, 2, 2, kdunkel);
  }
  if (umriss) b.umriss(UMRISS);
  return b;
}

for (const [name, t] of Object.entries(TUNIKEN)) {
  const blatt = new Bild(128, 128);
  ['unten', 'oben', 'links'].forEach((r, zeile) => {
    for (let bild = 0; bild < 4; bild++) blatt.einfuegen(held(t, r, bild), bild * 32, zeile * 32);
  });
  for (let bild = 0; bild < 4; bild++) blatt.einfuegen(held(t, 'links', bild), bild * 32, 96, true);
  blatt.speichern(ziel + `held-${name}.png`);
}

// ---------- Figuren (Leute in der Welt) ----------
// Körper vom Helden, Kopf eigen: der Held hat die Kapuze, die anderen nicht —
// so verwechselt man einen Dorfbewohner nicht mit einem Mitspieler.
function kopfAlterMann(richtung) {
  const k = new Bild(32, 32);
  const grau = '#c8c8d4', grauDunkel = '#9a9aa8', bart = '#ececf2';
  if (richtung === 'oben') {
    k.ellipse(16, 11.5, 8.5, 7.5, grau);
    k.ellipse(16, 14, 7, 4, grauDunkel, (x, y) => y > 14);
    k.ellipse(13, 7, 3, 2, '#e0e0e8');
  } else if (richtung === 'links') {
    k.ellipse(15, 11.5, 8, 7.5, P.haut);
    k.ellipse(17, 10, 7, 6.5, grau, (x, y) => y <= 6 || x >= 18);
    k.rechteck(9, 9, 4, 1, grau);
    k.rechteck(10, 11, 2, 2, P.auge);
    k.setze(6, 13, P.haut);
    k.ellipse(11, 17, 5, 4.5, bart);
    k.rechteck(10, 20, 3, 3, bart);
  } else {
    k.ellipse(16, 11.5, 8.5, 7.5, P.haut);
    k.ellipse(16, 8, 9, 5, grau, (x, y) => y <= 6 || x <= 9 || x >= 23);
    k.ellipse(16, 4.5, 4, 2, P.haut);
    k.rechteck(11, 9, 4, 1, grau);
    k.rechteck(17, 9, 4, 1, grau);
    k.rechteck(12, 11, 2, 2, P.auge);
    k.rechteck(18, 11, 2, 2, P.auge);
    k.ellipse(16, 17, 6.5, 4.5, bart);
    k.rechteck(13, 20, 6, 3, bart);
    k.rechteck(15, 23, 2, 1, bart);
    k.rechteck(14, 15, 4, 1, '#c8a090');
  }
  k.umriss(UMRISS);
  return k;
}

// Ein Kopf für die Leute in Riftside: Haare (kurz oder lang), Schnurrbart,
// oder ein Helm. Bewusst ohne Kapuze — die tragen nur die Spieler.
function kopfMensch(richtung, { haar, lang = false, schnurr = false, helm = null }) {
  const k = new Bild(32, 32);
  const dunkel = helm ? '#5a5a6a' : haar;
  if (richtung === 'oben') {
    if (lang) k.rechteck(9, 12, 14, 8, haar);
    k.ellipse(16, 11.5, 8.5, 7.5, helm ?? haar);
    if (helm) k.rechteck(7, 11, 18, 2, dunkel);
  } else if (richtung === 'links') {
    if (lang) k.rechteck(17, 10, 7, 10, haar);
    k.ellipse(15, 11.5, 8, 7.5, P.haut);
    k.ellipse(16, 9.5, 8.5, 7, helm ?? haar, (x, y) => y <= (helm ? 9 : 6) || (!helm && x >= 18 && y <= 14));
    if (helm) k.rechteck(7, 9, 18, 2, dunkel);
    k.rechteck(10, 12, 2, 2, P.auge);
    k.setze(6, 14, P.haut);
    if (schnurr) k.rechteck(7, 15, 4, 1, haar);
  } else {
    if (lang) {
      k.rechteck(7, 10, 3, 10, haar);
      k.rechteck(22, 10, 3, 10, haar);
    }
    k.ellipse(16, 11.5, 8.5, 7.5, P.haut);
    k.ellipse(16, 9, 9.5, 6, helm ?? haar, (x, y) => y <= (helm ? 9 : 7) || (!helm && (x <= 8 || x >= 24) && y <= 12));
    if (helm) {
      k.rechteck(7, 9, 18, 2, dunkel);
      k.rechteck(15, 9, 2, 5, dunkel);
    }
    k.rechteck(12, 12, 2, 2, P.auge);
    k.rechteck(18, 12, 2, 2, P.auge);
    if (schnurr) k.rechteck(12, 15, 8, 2, haar);
    else {
      k.setze(11, 15, '#f0a08a');
      k.setze(20, 15, '#f0a08a');
    }
  }
  k.umriss(UMRISS);
  return k;
}

const LEUTE = {
  alter_mann: { tunika: ['#6a6a9a', '#8c8cc0', '#4a4a72'], kopf: kopfAlterMann },
  buergermeister: { tunika: ['#8a2a3a', '#b04a5a', '#5a1a26'], kopf: (r) => kopfMensch(r, { haar: '#5a3a22', schnurr: true }) },
  hafenmeisterin: { tunika: ['#2a4a7a', '#4a6a9a', '#1a2a4a'], kopf: (r) => kopfMensch(r, { haar: '#a0402a', lang: true }) },
  wache: { tunika: ['#6a6a7a', '#8a8a9a', '#4a4a5a'], kopf: (r) => kopfMensch(r, { haar: '#3a2a1a', helm: '#a8a8b8' }) },
  kind: { tunika: ['#d0a030', '#e8c050', '#9a7020'], kopf: (r) => kopfMensch(r, { haar: '#e8c15a' }) },
  schreiber: { tunika: ['#4a6a3a', '#6a8a5a', '#2e4a24'], kopf: (r) => kopfMensch(r, { haar: '#9a9aa8', schnurr: true }) },
  mutter: { tunika: ['#7a4a8a', '#9a6aaa', '#4e2e5a'], kopf: (r) => kopfMensch(r, { haar: '#6a4020', lang: true }) },
};
for (const [name, l] of Object.entries(LEUTE)) {
  const blatt = new Bild(128, 128);
  const zeichnen = (r, bild) => {
    const b = held(l.tunika, r, bild);
    b.loeschen(0, 0, 32, 17);
    b.einfuegen(l.kopf(r), 0, 0);
    return b;
  };
  ['unten', 'oben', 'links'].forEach((r, zeile) => {
    for (let bild = 0; bild < 4; bild++) blatt.einfuegen(zeichnen(r, bild), bild * 32, zeile * 32);
  });
  for (let bild = 0; bild < 4; bild++) blatt.einfuegen(zeichnen('links', bild), bild * 32, 96, true);
  blatt.speichern(ziel + `figur-${name}.png`);
}

// ---------- Klassen ----------
// Jede Klasse trägt etwas Eigenes am Kopf (und am Körper), die Tunika
// behält die Spielerfarbe: zwei Kämpfer sind so noch zu unterscheiden.
// Klassen ohne eigenes Bild (Homebrew) bekommen im Spiel held-<farbe>.
function kopfHut(richtung, [tu, hell, dunkel]) {
  const k = new Bild(32, 32);
  if (richtung === 'oben') {
    k.ellipse(16, 11.5, 8.5, 7.5, P.haare);
  } else if (richtung === 'links') {
    k.ellipse(15, 11.5, 8, 7.5, P.haut);
    k.rechteck(16, 9, 7, 9, P.haare);
    k.rechteck(10, 12, 2, 2, P.auge);
    k.setze(6, 14, P.haut);
  } else {
    k.ellipse(16, 11.5, 8.5, 7.5, P.haut);
    k.rechteck(8, 9, 2, 8, P.haare);
    k.rechteck(22, 9, 2, 8, P.haare);
    k.rechteck(12, 12, 2, 2, P.auge);
    k.rechteck(18, 12, 2, 2, P.auge);
    // Bart, wie es sich für einen Magier gehört
    k.ellipse(16, 17, 4.5, 2.5, '#d8d8e0');
  }
  // Breite Krempe, darüber der spitze Hut mit geknickter Spitze.
  k.ellipse(16, 9, 12, 2.5, dunkel);
  for (let y = 0; y < 8; y++) {
    const halb = 6 - y * 0.7;
    k.rechteck(Math.round(15 - halb + y * 0.4), 8 - y, Math.round(halb * 2), 1, y < 2 ? tu : y < 5 ? tu : hell);
  }
  k.rechteck(19, 0, 4, 2, hell);
  k.rechteck(12, 7, 8, 1, P.gold);
  k.umriss(UMRISS);
  return k;
}

const KLASSEN = {
  kaempfer: {
    kopf: (r, t) => {
      // Helmbusch in der Spielerfarbe, hinter dem Helm
      const k = new Bild(32, 32);
      if (r === 'links') k.rechteck(15, 1, 7, 3, t[0]);
      else k.rechteck(14, 0, 4, 4, t[0]);
      k.umriss(UMRISS);
      k.einfuegen(kopfMensch(r, { haar: '#5a3a22', helm: '#b8b8c8' }), 0, 0);
      return k;
    },
    koerper: (b, r) => {
      // Schulterstücke aus Stahl
      if (r === 'links') b.rechteck(13, 18, 6, 2, '#b8b8c8');
      else {
        b.rechteck(8, 18, 4, 2, '#b8b8c8');
        b.rechteck(20, 18, 4, 2, '#b8b8c8');
      }
    },
  },
  schurke: {
    kapuze: ['#3a3446', '#55506a', '#24202e'],
    koerper: (b, r) => {
      // Tuch vor dem Mund
      if (r === 'unten') b.rechteck(10, 15, 12, 3, '#24202e');
      if (r === 'links') b.rechteck(6, 14, 7, 3, '#24202e');
    },
  },
  magier: {
    kopf: (r, t) => kopfHut(r, t),
    koerper: (b, r, t) => {
      // Langes Gewand bis über die Stiefel
      b.rechteck(9, 26, 14, 2, t[0]);
      b.rechteck(9, 28, 14, 1, t[2]);
    },
  },
  kleriker: {
    kapuze: ['#ece6d6', '#ffffff', '#b8ae98'],
    koerper: (b, r) => {
      if (r === 'unten') {
        b.rechteck(15, 18, 2, 4, P.gold);
        b.rechteck(13, 19, 6, 1, P.gold);
      }
    },
  },
  waldlaeufer: {
    kapuze: ['#4a6a2a', '#6a8a3a', '#2e4618'],
    koerper: (b, r) => {
      const leder = '#7a4a2a';
      if (r === 'oben') {
        // Köcher auf dem Rücken, Federn schauen oben heraus
        b.rechteck(18, 13, 3, 11, leder);
        b.rechteck(18, 11, 1, 2, '#f4ecd8');
        b.rechteck(20, 11, 1, 2, '#f4ecd8');
      } else if (r === 'links') {
        b.rechteck(20, 14, 3, 10, leder);
        b.rechteck(21, 12, 1, 2, '#f4ecd8');
      } else for (let i = 0; i < 6; i++) b.rechteck(11 + i * 2, 18 + i, 2, 1, leder);
    },
  },
};

for (const [klasse, k] of Object.entries(KLASSEN))
  for (const [farbe, t] of Object.entries(TUNIKEN)) {
    const zeichnen = (r, bild) => {
      // Umriss erst nach der Ausrüstung, sonst läge er unter dem Köcher.
      const b = held(t, r, bild, k.kapuze, false);
      k.koerper?.(b, r, t);
      if (k.kopf) b.loeschen(0, 0, 32, 17);
      b.umriss(UMRISS);
      if (k.kopf) b.einfuegen(k.kopf(r, t), 0, 0);
      return b;
    };
    const blatt = new Bild(128, 128);
    ['unten', 'oben', 'links'].forEach((r, zeile) => {
      for (let bild = 0; bild < 4; bild++) blatt.einfuegen(zeichnen(r, bild), bild * 32, zeile * 32);
    });
    for (let bild = 0; bild < 4; bild++) blatt.einfuegen(zeichnen('links', bild), bild * 32, 96, true);
    blatt.speichern(ziel + `held-${klasse}-${farbe}.png`);
  }

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
  dolch.umriss(UMRISS);
  blatt.einfuegen(dolch, 0, 0);
  const pfeil = new Bild(16, 16);
  pfeil.rechteck(1, 7, 11, 1, P.holz);
  pfeil.rechteck(1, 6, 3, 1, '#f4ecd8');
  pfeil.rechteck(1, 8, 3, 1, '#f4ecd8');
  pfeil.rechteck(12, 6, 2, 3, '#b8b8c8');
  pfeil.setze(14, 7, '#b8b8c8');
  pfeil.umriss(UMRISS);
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
  s.umriss(UMRISS);
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
    k.umriss(UMRISS);
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
  gold.umriss(UMRISS);
  const schl = new Bild(12, 12);
  schl.ellipse(4, 4, 2.6, 2.6, P.gold);
  schl.setze(4, 4, UMRISS);
  schl.linie(5, 5, 9, 9, P.gold);
  schl.linie(6, 5, 10, 9, P.gold);
  schl.setze(8, 10, P.gold);
  schl.setze(9, 11, P.gold);
  schl.umriss(UMRISS);
  const stein = new Bild(12, 12);
  stein.muster(2, 1, ['   pp   ', '  pttp  ', ' pttttp ', 'pttwtttp', ' pttttp ', '  pttp  ', '   pp   '], { p: '#8a4ad0', t: '#5ad8e0', w: '#c8fff4' });
  stein.umriss(UMRISS);
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
  b.umriss(UMRISS);
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
    s.umriss(UMRISS);
    blatt.einfuegen(s, i * 32, 0);
  });
  blatt.speichern(ziel + 'schleim.png');
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
    s.umriss(UMRISS);
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
