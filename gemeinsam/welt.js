// Die Welt aus Sicht der Regeln: welche Kachel ist fest, welcher Busch ist
// abgeschnitten. Server und Browser benutzen dieselbe Klasse — der Browser,
// damit sich die eigene Figur sofort bewegt, ohne auf den Server zu warten;
// der Server, damit niemand durch Wände läuft.

export const RICHTUNGEN = { unten: [0, 1], oben: [0, -1], links: [-1, 0], rechts: [1, 0] };

// Die Fußfläche einer Figur. Der Punkt (x, y) einer Figur ist die Mitte
// unter den Füßen — so sortiert sich die Zeichenreihenfolge einfach nach y.
export const KOERPER = { halbeBreite: 6, hoehe: 8 };

// Dinge, die man ansprechen kann. Sie stehen als Punkte in der Ebene „orte"
// und belegen die Kachel, auf der sie stehen — man läuft nicht durch eine Truhe.
export const DINGE = new Set(['schild', 'figur', 'truhe', 'tuer']);

// Ist eine Bedingung aus Tiled erfüllt? „tempel_geschlossen" verlangt den
// Weltzustand, „!tempel_geschlossen" sein Fehlen; mehrere mit Komma, alle
// müssen gelten. Leer heißt: immer. Server und Browser fragen hier — sonst
// sähe ein Spieler einen Riss, durch den der Server ihn nicht lässt.
export function erfuellt(bedingung, zustaende) {
  if (!bedingung) return true;
  return String(bedingung).split(',').map((t) => t.trim()).filter(Boolean).every((t) =>
    t.startsWith('!') ? !zustaende[t.slice(1)] : !!zustaende[t]);
}

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
    const eigenschaften = (liste) => Object.fromEntries((liste ?? []).map((p) => [p.name, p.value]));
    this.eigenschaftenKarte = eigenschaften(karte.properties);
    // Punkte (Start, Gegner, Ankunft) und Rechtecke (Übergänge) aus Tiled.
    // eig enthält die selbst vergebenen Eigenschaften, z. B. ziel/ankunft.
    this.orte = ebene('orte').objects.map((o) => {
      const eig = eigenschaften(o.properties);
      return { id: o.id, name: o.name, x: o.x, y: o.y, b: o.width ?? 0, h: o.height ?? 0, eig, art: eig.art };
    });
    this.geschnitten = new Set();
    // Schlüssel eines Dings: die eigene „id" aus Tiled, sonst die Objektnummer.
    // Unter diesem Schlüssel merkt sich der Spielstand z. B. offene Truhen —
    // wer Truhen später umsortiert, sollte ihnen deshalb eine id geben.
    this.dinge = this.orte
      .filter((o) => DINGE.has(o.name))
      .map((o) => ({ ...o, schluessel: String(o.eig.id ?? `${o.name}-${o.id}`), kachel: this.index(Math.floor(o.x / this.kachel), Math.floor(o.y / this.kachel)) }));
    this.belegt = new Map(this.dinge.map((d) => [d.kachel, d]));
    // Geöffnete Türen (Schlüssel der Dinge): sie bleiben stehen, sind aber
    // offen und lassen durch.
    this.geoeffnet = new Set();
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
    const ding = this.belegt.get(i);
    if (ding && !this.geoeffnet.has(ding.schluessel)) return true;
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

  // Das Ding direkt vor einer Figur — dort, wohin sie schaut. Gemessen ab
  // der Mitte der Fußfläche, eine gute halbe Kachel weit.
  dingVor(x, y, richtung) {
    const [dx, dy] = RICHTUNGEN[richtung] ?? [0, 1];
    const px = x + dx * 18, py = y - 4 + dy * 18;
    const k = this.kachel;
    if (px < 0 || py < 0) return null;
    const i = this.index(Math.floor(px / k), Math.floor(py / k));
    // Eine offene Tür ist nichts mehr, das man ansprechen könnte.
    return this.dinge.find((d) => d.kachel === i && !this.geoeffnet.has(d.schluessel)) ?? null;
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
        x = heranruecken(welt, x, y, sx, 0, k);
        if (!sy) y += eckeAusweichen(welt, x + sx, y, 0, 1, k, Math.abs(sx));
      }
    }
    if (sy) {
      if (welt.frei(x, y + sy, k)) y += sy;
      else {
        gestossen = true;
        y = heranruecken(welt, x, y, 0, sy, k);
        if (!sx) x += eckeAusweichen(welt, x, y + sy, 1, 0, k, Math.abs(sy));
      }
    }
  }
  return { x, y, gestossen };
}

// Passt der ganze Teilschritt nicht, bis an die Wand heran — in halben
// Schritten. Ohne das blieb eine Figur je nach Bildrate 0,2 bis 3 px vor
// der Wand stehen: bei wenigen Bildern pro Sekunde sind die Schritte größer.
function heranruecken(welt, x, y, dx, dy, k) {
  for (let rest = 0.5; Math.abs(dx || dy) * rest > 0.01; rest /= 2) {
    if (welt.frei(x + dx * rest, y + dy * rest, k)) {
      x += dx * rest;
      y += dy * rest;
    }
  }
  return dx ? x : y;
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
