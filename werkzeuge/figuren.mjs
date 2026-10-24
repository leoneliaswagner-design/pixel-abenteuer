// Spielfiguren und Leute, 32×48 — schlanker als die alten 32×32 (großer Kopf
// wie in Link's Awakening). Der Stil soll eher Stardew Valley und Necesse
// sein: weiche Schattierung von links oben, Umriss in dunkler Eigenfarbe.
//
// Ein Blatt hat 4 Zeilen (unten, oben, links, rechts) × 4 Bilder:
// 0 Stehen, 1 Schritt links, 2 Schritt rechts, 3 Ausholen (Hieb, Wurf).
// „rechts" ist „links" gespiegelt.
import { Bild } from './pixel.mjs';

export const BREITE = 32, HOEHE = 48;

const HAUT = ['#f3c7a0', '#d99e78'];
const AUGE = '#2c2236';
const GUERTEL = '#5a3a20', SCHNALLE = '#e8b84a';
const STIEFEL = ['#6b4426', '#8c5d37'];

// o: Aussehen einer Figur
//   tunika   [grund, hell, dunkel]   hose [grund, dunkel]
//   haar, frisur ('kurz' | 'lang' | 'glatze'), bart (null | 'schnurr' | 'voll'), bartFarbe
//   kopf     null | { art: 'helm', farbe, dunkel, busch } | { art: 'kapuze', farben: [g, h, d] }
//            | { art: 'hut', farben: [g, h, d] }
//   robe, schal, symbol, schultern, schuerze, koecher (Farben oder true)
export function figur(o, richtung, bild) {
  const b = new Bild(BREITE, HOEHE);
  const s = bild === 1 ? -1 : bild === 2 ? 1 : 0;
  if (richtung === 'links') seite(b, o, s, bild === 3);
  else vorneHinten(b, o, s, bild === 3, richtung === 'oben');
  b.umriss('weich');
  return b;
}

export function blatt(o) {
  const bl = new Bild(BREITE * 4, HOEHE * 4);
  ['unten', 'oben', 'links'].forEach((r, zeile) => {
    for (let i = 0; i < 4; i++) bl.einfuegen(figur(o, r, i), i * BREITE, zeile * HOEHE);
  });
  for (let i = 0; i < 4; i++) bl.einfuegen(figur(o, 'links', i), i * BREITE, 3 * HOEHE, true);
  return bl;
}

function vorneHinten(b, o, s, holt, hinten) {
  const [t, th, td] = o.tunika;
  const [h, hd] = o.hose ?? ['#5a4a6a', '#443854'];
  // Hinten am Rücken: der Köcher liegt unter den Armen.
  if (hinten && o.koecher) koecherHinten(b);

  // Beine und Stiefel: der Fuß, der vorgeht, hebt sich ein Pixel.
  for (const [x, seitig] of [[12, -1], [17, 1]]) {
    const hoch = s === seitig ? 1 : 0;
    b.rechteck(x, 36 - hoch, 3, 7, x < 16 ? h : hd);
    b.rechteck(x - 1, 42 - hoch, 5, 4, STIEFEL[0]);
    b.rechteck(x - 1, 42 - hoch, 5, 1, STIEFEL[1]);
  }

  // Rumpf mit Rock, links heller, rechts dunkler.
  const unten = o.robe ? 44 : 37;
  b.rechteck(10, 21, 12, 12, t);
  b.rechteck(9, 31, 14, unten - 31, t);
  b.rechteck(10, 22, 2, 8, th);
  b.rechteck(19, 21, 3, unten - 21, td);
  b.rechteck(9, unten - 1, 14, 1, td);
  if (o.schuerze && !hinten) {
    b.rechteck(12, 25, 8, unten - 26, o.schuerze);
    b.rechteck(12, 25, 8, 1, '#fff8e8');
  }
  b.rechteck(10, 31, 12, 2, GUERTEL);
  if (!hinten) b.rechteck(15, 31, 2, 2, SCHNALLE);
  if (o.symbol && !hinten) {
    b.rechteck(15, 23, 2, 6, o.symbol);
    b.rechteck(13, 25, 6, 2, o.symbol);
  }
  if (o.koecher && !hinten) for (let i = 0; i < 9; i++) b.rechteck(11 + i, 22 + i, 2, 1, '#7a4a2a');

  // Arme: pendeln gegengleich zu den Beinen; beim Ausholen ist der rechte
  // (vom Betrachter aus) vorn und unten.
  const armL = -s, armR = s;
  b.rechteck(7, 22 + armL, 3, 9, th);
  b.rechteck(7, 31 + armL, 3, 3, HAUT[0]);
  if (holt && !hinten) {
    b.rechteck(21, 25, 3, 9, t);
    b.rechteck(21, 34, 3, 3, HAUT[0]);
  } else if (holt) {
    b.rechteck(22, 15, 3, 8, td);
    b.rechteck(22, 13, 3, 2, HAUT[0]);
  } else {
    b.rechteck(22, 22 + armR, 3, 9, td);
    b.rechteck(22, 31 + armR, 3, 3, HAUT[1]);
  }
  if (o.schultern) {
    b.rechteck(7, 21, 5, 3, o.schultern);
    b.rechteck(20, 21, 5, 3, o.schultern);
  }

  // Hals und Kopf
  b.rechteck(14, 19, 4, 3, HAUT[1]);
  kopfVorneHinten(b, o, hinten);
}

function kopfVorneHinten(b, o, hinten) {
  const k = o.kopf;
  if (k?.art === 'helm' && k.busch) b.rechteck(14, 0, 4, 6, k.busch);
  if (o.frisur === 'lang' && !k) {
    b.rechteck(8, 10, 3, hinten ? 14 : 13, o.haar);
    b.rechteck(21, 10, 3, hinten ? 14 : 13, o.haar);
    if (hinten) b.rechteck(10, 12, 12, 12, o.haar);
  }
  if (k?.art === 'kapuze') {
    const [g, hl, d] = k.farben;
    b.ellipse(16, 12.5, 8.5, 8.5, g);
    b.ellipse(13, 8, 3, 2, hl);
    b.rechteck(21, 10, 3, 10, d);
  }
  if (!hinten || !k || k.art !== 'kapuze') {
    b.ellipse(16, 13, 7, 7.5, hinten ? HAUT[1] : HAUT[0]);
    if (!hinten) b.ellipse(16, 13, 7, 7.5, HAUT[1], (x, y) => x >= 20 || y >= 19);
  }
  if (k?.art === 'kapuze' && !hinten) {
    // Gesicht im Kapuzenausschnitt: Rand der Kapuze darüber.
    b.ellipse(16, 9, 7, 3.5, k.farben[0], (x, y) => y <= 9);
  }
  if (hinten) {
    if (!k || k.art === 'hut') b.ellipse(16, 12.5, 7.5, 8, o.frisur === 'glatze' ? HAUT[1] : o.haar);
    if (o.frisur === 'glatze') b.rechteck(9, 13, 14, 4, o.haar);
  } else {
    // Gesicht: zwei Augen, ein Lichtpunkt, rote Wangen.
    b.rechteck(12, 13, 2, 3, AUGE);
    b.rechteck(18, 13, 2, 3, AUGE);
    b.setze(12, 13, '#ffffff');
    b.setze(18, 13, '#ffffff');
    b.setze(11, 17, '#f0a08a');
    b.setze(20, 17, '#f0a08a');
    b.rechteck(15, 18, 2, 1, '#c87868');
    if (!k) haarVorne(b, o);
    if (o.bart === 'voll') {
      b.ellipse(16, 19, 5.5, 4, o.bartFarbe ?? o.haar, (x, y) => y >= 17);
      b.rechteck(13, 22, 6, 2, o.bartFarbe ?? o.haar);
    }
    if (o.bart === 'schnurr') b.rechteck(13, 17, 6, 2, o.bartFarbe ?? o.haar);
    if (o.schal) b.rechteck(10, 16, 12, 4, o.schal);
  }
  if (k?.art === 'helm') {
    b.ellipse(16, 10, 8, 6.5, k.farbe, (x, y) => y <= (hinten ? 15 : 11));
    b.ellipse(13, 7, 2.5, 1.5, '#e8e8f4');
    b.rechteck(8, hinten ? 14 : 11, 16, 2, k.dunkel);
    if (!hinten) b.rechteck(15, 11, 2, 5, k.dunkel);
  }
  if (k?.art === 'hut') hut(b, k.farben, 16);
}

function haarVorne(b, o) {
  if (o.frisur === 'glatze') {
    b.rechteck(8, 11, 2, 6, o.haar);
    b.rechteck(22, 11, 2, 6, o.haar);
    return;
  }
  b.ellipse(16, 9.5, 7.5, 5, o.haar, (x, y) => y <= 11);
  b.rechteck(8, 9, 2, 6, o.haar);
  b.rechteck(22, 9, 2, 6, o.haar);
  // Pony in Strähnen, nicht als Balken
  for (let x = 10; x <= 21; x++) if (x % 3) b.setze(x, 12, o.haar);
  b.ellipse(13, 7, 2.5, 1.2, hell(o.haar));
}

function hut(b, [g, hl, d], mitte) {
  b.ellipse(mitte, 9, 12, 2.5, d);
  for (let y = 0; y < 8; y++) {
    const halb = 6 - y * 0.7;
    b.rechteck(Math.round(mitte - 1 - halb + y * 0.4), 8 - y, Math.round(halb * 2), 1, y > 4 ? hl : g);
  }
  b.rechteck(mitte + 3, 0, 4, 2, hl);
  b.rechteck(mitte - 4, 7, 8, 1, SCHNALLE);
}

function koecherHinten(b) {
  b.rechteck(19, 16, 4, 14, '#7a4a2a');
  b.rechteck(19, 16, 4, 1, '#9a6a3a');
  for (const x of [19, 21]) b.rechteck(x, 13, 1, 3, '#f4ecd8');
}

function seite(b, o, s, holt) {
  const [t, th, td] = o.tunika;
  const [h, hd] = o.hose ?? ['#5a4a6a', '#443854'];
  if (o.koecher) {
    b.rechteck(19, 17, 4, 13, '#7a4a2a');
    b.rechteck(20, 14, 1, 3, '#f4ecd8');
  }
  // Hinteres Bein dunkler; im Schritt gehen die Beine auseinander.
  const vorn = 2 * s, hinter = -2 * s;
  b.rechteck(15 + hinter, 36, 3, 7, hd);
  b.rechteck(14 + hinter, 42, 5, 4, STIEFEL[0]);
  b.rechteck(14 + vorn, 36, 3, 7, h);
  b.rechteck(13 + vorn, 42, 5, 4, STIEFEL[0]);
  b.rechteck(13 + vorn, 42, 5, 1, STIEFEL[1]);

  const unten = o.robe ? 44 : 37;
  b.rechteck(11, 21, 10, 12, t);
  b.rechteck(10, 31, 12, unten - 31, t);
  b.rechteck(18, 21, 3, unten - 21, td);
  b.rechteck(11, 22, 2, 8, th);
  b.rechteck(10, unten - 1, 12, 1, td);
  if (o.schuerze) b.rechteck(10, 25, 3, unten - 26, o.schuerze);
  b.rechteck(11, 31, 10, 2, GUERTEL);

  b.rechteck(14, 19, 4, 3, HAUT[1]);
  // Kopf, Blick nach links
  const k = o.kopf;
  if (k?.art === 'helm' && k.busch) b.rechteck(15, 1, 7, 4, k.busch);
  if (o.frisur === 'lang' && !k) b.rechteck(17, 10, 6, 14, o.haar);
  if (k?.art === 'kapuze') {
    const [g, hl, d] = k.farben;
    b.ellipse(16, 12.5, 8, 8.5, g);
    b.rechteck(22, 12, 3, 8, d);
    b.ellipse(14, 8, 3, 2, hl);
  }
  b.ellipse(15, 13, 6.5, 7.5, HAUT[0], k?.art === 'kapuze' ? (x) => x <= 15 : () => true);
  b.setze(8, 15, HAUT[0]);
  b.rechteck(10, 13, 2, 3, AUGE);
  b.setze(10, 13, '#ffffff');
  b.setze(11, 17, '#f0a08a');
  if (!k) {
    if (o.frisur === 'glatze') b.rechteck(17, 10, 4, 7, o.haar);
    else {
      b.ellipse(16, 10, 7, 5, o.haar, (x, y) => y <= 11 || x >= 17);
      b.rechteck(17, 10, 5, 8, o.haar);
      b.ellipse(13, 7, 2.5, 1.2, hell(o.haar));
    }
  }
  if (o.bart === 'voll') b.ellipse(11, 19, 4, 3.5, o.bartFarbe ?? o.haar);
  if (o.bart === 'schnurr') b.rechteck(8, 17, 5, 2, o.bartFarbe ?? o.haar);
  if (o.schal) b.rechteck(8, 16, 9, 4, o.schal);
  if (k?.art === 'kapuze') b.ellipse(15, 9, 6.5, 3, k.farben[0], (x, y) => y <= 9);
  if (k?.art === 'helm') {
    b.ellipse(15.5, 10, 7.5, 6.5, k.farbe, (x, y) => y <= 11 || x >= 17);
    b.ellipse(13, 7, 2.5, 1.5, '#e8e8f4');
    b.rechteck(8, 11, 16, 2, k.dunkel);
  }
  if (k?.art === 'hut') hut(b, k.farben, 15);
  if (o.schultern) b.rechteck(12, 21, 6, 3, o.schultern);

  // Der sichtbare Arm: pendelt vor und zurück; beim Ausholen nach vorn.
  if (holt) {
    b.rechteck(6, 25, 9, 3, t);
    b.rechteck(3, 25, 3, 3, HAUT[0]);
  } else {
    const a = -2 * s;
    b.rechteck(14 + a, 22, 3, 9, th);
    b.rechteck(14 + a, 31, 3, 3, HAUT[0]);
  }
}

// Ein hellerer Ton für Lichtkanten im Haar.
function hell(hex) {
  const n = parseInt(hex.slice(1), 16);
  const k = (v) => Math.min(255, Math.round(v + (255 - v) * 0.35));
  return [k((n >> 16) & 255), k((n >> 8) & 255), k(n & 255), 255];
}
