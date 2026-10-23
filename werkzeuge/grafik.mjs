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
};

const zeilen = Math.ceil(KACHELN.length / SPALTEN);
const satz = new Bild(SPALTEN * K, zeilen * K);
KACHELN.forEach((k, i) => {
  const b = new Bild(K, K);
  maler[k.name](b);
  satz.einfuegen(b, (i % SPALTEN) * K, Math.floor(i / SPALTEN) * K);
});
satz.speichern(ziel + 'kacheln.png');

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

function held(t, richtung, bild) {
  const [tu, hell, dunkel] = t;
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
    b.ellipse(16, 10.5, 9, 8, tu, (x, y) => y <= 8 || x >= 18);
    b.ellipse(13, 6, 3, 2, hell);
    b.rechteck(24, 6, 3, 3, tu);
    b.rechteck(26, 8, 3, 3, tu);
    b.rechteck(28, 10, 2, 2, dunkel);
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
      b.ellipse(16, 11.5, 8.5, 7.5, tu);
      for (const x of [9, 10, 11, 20, 21, 22]) b.rechteck(x, 14 + (x % 2), 1, 3 - (x % 2), P.haare);
      b.rechteck(14, 13, 4, 5, dunkel);
      b.rechteck(15, 13, 2, 4, tu);
      b.rechteck(15, 18, 2, 1, dunkel);
      b.ellipse(12, 6, 3, 2, hell);
    } else {
      b.ellipse(16, 11.5, 8.5, 7.5, P.haut);
      b.ellipse(16, 9, 9.5, 6.5, tu, (x, y) => y <= 8);
      b.ellipse(12, 5, 3, 2, hell);
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
    b.rechteck(24, 6, 3, 3, tu);
    b.rechteck(26, 8, 2, 3, tu);
    b.rechteck(27, 10, 2, 2, dunkel);
  }
  b.umriss(UMRISS);
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

const LEUTE = {
  alter_mann: { tunika: ['#6a6a9a', '#8c8cc0', '#4a4a72'], kopf: kopfAlterMann },
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
