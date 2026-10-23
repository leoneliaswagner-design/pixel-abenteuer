// Kleines Malwerkzeug für Pixelgrafik: ein RGBA-Puffer, ein paar Formen und
// ein PNG-Schreiber ohne Abhängigkeiten. Die Grafiken entstehen so als Code —
// reproduzierbar, und jede PNG lässt sich später in Aseprite o. ä. von Hand
// weitermalen (dann das Skript für diese Datei nicht mehr laufen lassen).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function farbe(hex, a = 255) {
  if (Array.isArray(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

// Feste Zufallsfolge, damit `npm run grafik` immer dieselben Bilder malt —
// sonst zeigt git bei jedem Lauf alle PNGs als geändert.
export function zufall(saat) {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Bild {
  constructor(b, h) {
    this.b = b;
    this.h = h;
    this.d = new Uint8ClampedArray(b * h * 4);
  }

  hole(x, y) {
    if (x < 0 || y < 0 || x >= this.b || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.b + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }

  setze(x, y, f) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (f == null || x < 0 || y < 0 || x >= this.b || y >= this.h) return;
    const [r, g, bl, a] = farbe(f);
    const i = (y * this.b + x) * 4;
    if (a === 255 || this.d[i + 3] === 0) {
      this.d.set([r, g, bl, a], i);
      return;
    }
    const q = a / 255;
    this.d[i] = r * q + this.d[i] * (1 - q);
    this.d[i + 1] = g * q + this.d[i + 1] * (1 - q);
    this.d[i + 2] = bl * q + this.d[i + 2] * (1 - q);
    this.d[i + 3] = Math.max(this.d[i + 3], a);
  }

  loeschen(x, y, b, h) {
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(this.b, x + b); xx++) this.d.fill(0, (yy * this.b + xx) * 4, (yy * this.b + xx) * 4 + 4);
  }

  rechteck(x, y, b, h, f) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + b; xx++) this.setze(xx, yy, f);
  }

  ellipse(cx, cy, rx, ry, f, nur = () => true) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && nur(x, y)) this.setze(x, y, f);
      }
  }

  linie(x0, y0, x1, y1, f) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.setze(x0, y0, f);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Ein Muster aus Textzeilen; jedes Zeichen ist ein Schlüssel der Palette,
  // Leerzeichen und '.' bleiben durchsichtig.
  muster(x, y, zeilen, palette) {
    zeilen.forEach((zeile, yy) => {
      [...zeile].forEach((z, xx) => {
        if (z !== ' ' && z !== '.') this.setze(x + xx, y + yy, palette[z]);
      });
    });
  }

  // Dunkler Rand um alles Gemalte — der eigentliche Pixel-Look. Nur
  // waagerecht/senkrecht, sonst werden die Ecken klobig.
  umriss(f, schwelle = 128) {
    const neu = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.b; x++) {
        if (this.hole(x, y)[3] >= schwelle) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.hole(x + dx, y + dy)[3] >= schwelle);
        if (n) neu.push([x, y]);
      }
    for (const [x, y] of neu) this.setze(x, y, f);
  }

  einfuegen(quelle, x, y, spiegeln = false) {
    for (let yy = 0; yy < quelle.h; yy++)
      for (let xx = 0; xx < quelle.b; xx++) {
        const p = quelle.hole(spiegeln ? quelle.b - 1 - xx : xx, yy);
        if (p[3] > 0) this.setze(x + xx, y + yy, p);
      }
  }

  // Um 90° im Uhrzeigersinn, n-mal — für Kanten, die es in vier Richtungen gibt.
  gedreht(n = 1) {
    let b = this;
    for (let k = 0; k < ((n % 4) + 4) % 4; k++) {
      const neu = new Bild(b.h, b.b);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.b; x++) neu.setze(b.h - 1 - y, x, b.hole(x, y));
      b = neu;
    }
    return b;
  }

  gespiegelt() {
    const neu = new Bild(this.b, this.h);
    neu.einfuegen(this, 0, 0, true);
    return neu;
  }

  speichern(pfad) {
    mkdirSync(dirname(pfad), { recursive: true });
    writeFileSync(pfad, png(this.b, this.h, this.d));
  }
}

const crcTafel = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTafel[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function stueck(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const td = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([laenge, td, crc]);
}
function png(b, h, rgba) {
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(b, 0);
  kopf.writeUInt32BE(h, 4);
  kopf.set([8, 6, 0, 0, 0], 8);
  const roh = Buffer.alloc((b * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    roh[y * (b * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * b * 4, b * 4).copy(roh, y * (b * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    stueck('IHDR', kopf),
    stueck('IDAT', deflateSync(roh)),
    stueck('IEND', Buffer.alloc(0)),
  ]);
}
