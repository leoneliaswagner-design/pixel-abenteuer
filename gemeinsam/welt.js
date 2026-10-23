// Die Welt aus Sicht der Regeln: welche Kachel ist fest, welcher Busch ist
// abgeschnitten. Server und Browser benutzen dieselbe Klasse — der Browser,
// damit sich die eigene Figur sofort bewegt, ohne auf den Server zu warten;
// der Server, damit niemand durch Wände läuft.

export const RICHTUNGEN = { unten: [0, 1], oben: [0, -1], links: [-1, 0], rechts: [1, 0] };

// Die Fußfläche einer Figur. Der Punkt (x, y) einer Figur ist die Mitte
// unter den Füßen — so sortiert sich die Zeichenreihenfolge einfach nach y.
export const KOERPER = { halbeBreite: 6, hoehe: 8 };

export class Welt {
  constructor(karte) {
    this.kachel = karte.tilewidth;
    this.breite = karte.width;
    this.hoehe = karte.height;
    this.eigenschaften = [];
    for (const satz of karte.tilesets)
      for (const t of satz.tiles ?? []) {
        const e = {};
        for (const p of t.properties ?? []) e[p.name] = p.value;
        this.eigenschaften[satz.firstgid + t.id] = e;
      }
    const ebene = (name) => {
      const l = karte.layers.find((l) => l.name === name);
      if (!l) throw new Error(`Karte hat keine Ebene „${name}"`);
      return l;
    };
    this.boden = ebene('boden').data;
    this.hindernisse = ebene('hindernisse').data;
    this.orte = ebene('orte').objects.map((o) => ({
      name: o.name,
      x: o.x,
      y: o.y,
      art: o.properties?.find((p) => p.name === 'art')?.value,
    }));
    this.geschnitten = new Set();
  }

  eig(gid) {
    return this.eigenschaften[gid] ?? {};
  }

  gidVon(name) {
    return this.eigenschaften.findIndex((e) => e?.name === name);
  }

  index(tx, ty) {
    return ty * this.breite + tx;
  }

  istFest(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.breite || ty >= this.hoehe) return true;
    const i = this.index(tx, ty);
    if (this.eig(this.boden[i]).fest) return true;
    const h = this.hindernisse[i];
    if (!h || this.geschnitten.has(i)) return false;
    return !!this.eig(h).fest;
  }

  istSchneidbar(i) {
    return !!this.eig(this.hindernisse[i]).schneidbar && !this.geschnitten.has(i);
  }

  // Ist die Fußfläche an (x, y) frei? Die Ränder zählen halb offen, sonst
  // bleibt eine Figur, die genau an einer Kachelkante steht, daran hängen.
  frei(x, y, k = KOERPER) {
    const t = this.kachel;
    const x0 = Math.floor((x - k.halbeBreite) / t), x1 = Math.floor((x + k.halbeBreite - 0.001) / t);
    const y0 = Math.floor((y - k.hoehe) / t), y1 = Math.floor((y - 0.001) / t);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.istFest(tx, ty)) return false;
    return true;
  }

  // Kacheln, die ein Rechteck berührt — für den Schwerthieb gegen Büsche.
  kachelnIn(r) {
    const t = this.kachel, aus = [];
    for (let ty = Math.floor(r.y / t); ty <= Math.floor((r.y + r.h - 0.001) / t); ty++)
      for (let tx = Math.floor(r.x / t); tx <= Math.floor((r.x + r.b - 0.001) / t); tx++)
        if (tx >= 0 && ty >= 0 && tx < this.breite && ty < this.hoehe) aus.push(this.index(tx, ty));
    return aus;
  }
}

// Bewegt eine Fußfläche um (dx, dy), erst waagerecht, dann senkrecht, in
// kleinen Schritten — ein ganzer Sprung von 8 px könnte durch eine Ecke
// tunneln, wenn der Browser einmal ruckelt.
//
// Wer knapp an einer Ecke hängenbleibt, wird um sie herumgeschoben (wie in
// Link's Awakening). Ohne das blieb man in Lücken zwischen zwei Bäumen
// schon bei 3 px Versatz stecken.
export function bewege(welt, x, y, dx, dy, k = KOERPER) {
  const schritte = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  const sx = dx / schritte, sy = dy / schritte;
  let gestossen = false;
  for (let i = 0; i < schritte; i++) {
    if (sx) {
      if (welt.frei(x + sx, y, k)) x += sx;
      else {
        gestossen = true;
        if (!sy) y += eckeAusweichen(welt, x + sx, y, 0, 1, k, Math.abs(sx));
      }
    }
    if (sy) {
      if (welt.frei(x, y + sy, k)) y += sy;
      else {
        gestossen = true;
        if (!sx) x += eckeAusweichen(welt, x, y + sy, 1, 0, k, Math.abs(sy));
      }
    }
  }
  return { x, y, gestossen };
}

function eckeAusweichen(welt, x, y, ax, ay, k, tempo) {
  for (let d = 1; d <= 10; d++)
    for (const s of [-1, 1])
      if (welt.frei(x + ax * d * s, y + ay * d * s, k)) return s * Math.min(tempo, d);
  return 0;
}

// Wo der Schwerthieb trifft. Rechteck {x, y, b, h} in Weltpunkten.
export function hiebFlaeche(x, y, richtung, w) {
  const r = w.hiebReichweite, b = w.hiebBreite, mitte = y - 10;
  switch (richtung) {
    case 'unten': return { x: x - b / 2, y: y - 6, b, h: r + 4 };
    case 'oben': return { x: x - b / 2, y: y - 14 - r, b, h: r + 4 };
    case 'links': return { x: x - 6 - r, y: mitte - b / 2, b: r + 2, h: b };
    default: return { x: x + 4, y: mitte - b / 2, b: r + 2, h: b };
  }
}

export function imRechteck(r, x, y, rand = 0) {
  return x >= r.x - rand && x <= r.x + r.b + rand && y >= r.y - rand && y <= r.y + r.h + rand;
}
