// Ein Gebiet ist eine Karte mit allem, was darauf lebt: Gegner, Büsche,
// Herzen. Jedes Gebiet läuft für sich; Spieler können sich aufteilen —
// einer in der Höhle, zwei auf der Oberwelt.
import { Welt, bewege, hiebFlaeche, imRechteck, RICHTUNGEN } from '../gemeinsam/welt.js';

export class Gebiet {
  constructor(name, karte, spiel) {
    this.name = name;
    this.spiel = spiel;
    this.w = spiel.w;
    this.welt = new Welt(karte);
    this.titel = this.welt.eigenschaftenKarte.titel ?? name;
    this.starts = this.welt.orte.filter((o) => o.name === 'spieler_start');
    this.uebergaenge = this.welt.orte.filter((o) => o.name === 'uebergang');
    this.ankuenfte = new Map(this.welt.orte.filter((o) => o.name === 'ankunft').map((o) => [o.eig.id, o]));
    for (const u of this.uebergaenge)
      if (!u.eig.ziel || !u.eig.ankunft) throw new Error(`Übergang in „${name}" ohne „ziel" oder „ankunft"`);
    this.gegner = this.welt.orte.filter((o) => o.name === 'gegner').map((o, i) => this.neuerGegner(`${name}-g${i}`, o));
    this.herzen = new Map();
    this.nachwachsen = new Map();
    // Wohin Figuren gerade schauen (nachdem jemand sie angesprochen hat).
    // Nicht im Spielstand — nach einem Neustart schauen sie wieder geradeaus.
    this.blicke = new Map();
  }

  // Offene Truhen stehen im Spielstand unter „gebiet:schlüssel", damit zwei
  // Karten dieselbe Objektnummer haben dürfen.
  truhenSchluessel(ding) {
    return `${this.name}:${ding.schluessel}`;
  }

  istOffen(ding) {
    return !!this.spiel.spielstand.daten.welt.truhen?.[this.truhenSchluessel(ding)];
  }

  oeffnen(ding) {
    const welt = this.spiel.spielstand.daten.welt;
    welt.truhen ??= {};
    welt.truhen[this.truhenSchluessel(ding)] = true;
    this.spiel.geaendert = true;
  }

  offeneTruhen() {
    return this.welt.dinge.filter((d) => d.name === 'truhe' && this.istOffen(d)).map((d) => d.schluessel);
  }

  neuerGegner(id, ort) {
    const art = ort.art ?? 'schleim';
    const w = this.w.gegner[art];
    if (!w) throw new Error(`Unbekannte Gegnerart „${art}" in „${this.name}"`);
    return { id, art, w, start: ort, x: ort.x, y: ort.y + 8, leben: w.leben, tot: false, vx: 0, vy: 0, wechselBei: 0, stossBis: 0, getroffenBis: 0 };
  }

  spieler() {
    return [...this.spiel.spieler.values()].filter((s) => s.gebiet === this.name);
  }

  anAlle(m, ausser) {
    for (const s of this.spieler()) if (s.id !== ausser) s.senden(m);
  }

  // Der Fußpunkt zählt: wer mit den Zehen auf der Treppe steht, geht.
  uebergangBei(x, y) {
    return this.uebergaenge.find((u) => x >= u.x && x < u.x + u.b && y >= u.y && y < u.y + u.h);
  }

  hieb(s, jetzt) {
    const f = hiebFlaeche(s.x, s.y, s.richtung, this.w.spieler);
    for (const g of this.gegner) {
      if (g.tot || jetzt < g.getroffenBis) continue;
      if (!imRechteck(f, g.x, g.y - 6, 8)) continue;
      this.gegnerTreffen(g, s, jetzt);
    }
    for (const i of this.welt.kachelnIn(f)) {
      if (!this.welt.istSchneidbar(i)) continue;
      this.welt.geschnitten.add(i);
      this.nachwachsen.set(i, jetzt + this.w.busch.nachwachsen);
      this.anAlle({ t: 'busch', i, weg: true });
      const t = this.welt.kachel;
      this.vielleichtHerz((i % this.welt.breite) * t + t / 2, Math.floor(i / this.welt.breite) * t + t / 2, this.w.busch.herzChance);
    }
  }

  gegnerTreffen(g, s, jetzt) {
    g.leben -= 1;
    g.getroffenBis = jetzt + 250;
    const [rx, ry] = richtungZu(s.x, s.y - 8, g.x, g.y - 6, RICHTUNGEN[s.richtung]);
    g.vx = rx * g.w.stossGeschwindigkeit;
    g.vy = ry * g.w.stossGeschwindigkeit;
    g.stossBis = jetzt + g.w.stossDauer;
    if (g.leben > 0) {
      this.anAlle({ t: 'gegner_treffer', id: g.id });
      return;
    }
    g.tot = true;
    g.wiederBei = jetzt + g.w.neuErscheinen;
    this.anAlle({ t: 'gegner_tot', id: g.id, x: g.x, y: g.y });
    this.vielleichtHerz(g.x, g.y, g.w.herzChance);
  }

  vielleichtHerz(x, y, chance) {
    if (Math.random() >= chance) return;
    const id = `h${this.spiel.naechsteId++}`;
    this.herzen.set(id, { id, x, y, bis: this.spiel.jetzt() + this.w.herz.verschwinden });
  }

  // Ein Gebiet ohne Spieler steht still — Gegner laufen nicht weg, Büsche
  // wachsen nicht nach. Bei einer großen Welt wären sonst alle Karten
  // ständig in Bewegung, obwohl niemand hinsieht.
  schritt(dt, jetzt) {
    const hier = this.spieler();
    if (!hier.length) return;
    for (const g of this.gegner) this.gegnerSchritt(g, dt, jetzt, hier);
    for (const s of hier) this.herzenAufheben(s);

    for (const [i, bei] of this.nachwachsen) {
      if (jetzt < bei) continue;
      // Nicht in jemandem nachwachsen — der säße sonst im Busch fest.
      const t = this.welt.kachel, bx = (i % this.welt.breite) * t, by = Math.floor(i / this.welt.breite) * t;
      const besetzt = [...hier, ...this.gegner].some((e) => !e.tot && e.x > bx - 8 && e.x < bx + t + 8 && e.y > by && e.y < by + t + 10);
      if (besetzt) continue;
      this.nachwachsen.delete(i);
      this.welt.geschnitten.delete(i);
      this.anAlle({ t: 'busch', i, weg: false });
    }
    for (const h of this.herzen.values()) if (jetzt >= h.bis) this.herzen.delete(h.id);
  }

  herzenAufheben(s) {
    if (s.tot) return;
    for (const h of this.herzen.values()) {
      if (Math.hypot(h.x - s.x, h.y - (s.y - 8)) > 16) continue;
      if (s.leben >= this.w.spieler.leben) continue;
      s.leben = Math.min(this.w.spieler.leben, s.leben + this.w.herz.heilung);
      this.herzen.delete(h.id);
      this.anAlle({ t: 'herz_genommen', id: h.id, von: s.id });
    }
  }

  gegnerSchritt(g, dt, jetzt, hier) {
    if (g.tot) {
      if (jetzt < g.wiederBei) return;
      const nah = hier.some((s) => Math.hypot(s.x - g.start.x, s.y - g.start.y) < 96);
      if (nah) return;
      Object.assign(g, { tot: false, leben: g.w.leben, x: g.start.x, y: g.start.y + 8, stossBis: 0 });
      this.anAlle({ t: 'gegner_neu', id: g.id });
      return;
    }
    let vx, vy;
    if (jetzt < g.stossBis) {
      vx = g.vx;
      vy = g.vy;
    } else {
      const ziel = naechster(g, hier);
      if (ziel) {
        const d = Math.hypot(ziel.x - g.x, ziel.y - g.y) || 1;
        vx = ((ziel.x - g.x) / d) * g.w.jagdGeschwindigkeit;
        vy = ((ziel.y - g.y) / d) * g.w.jagdGeschwindigkeit;
      } else {
        if (jetzt >= g.wechselBei) {
          const r = Object.values(RICHTUNGEN)[Math.floor(Math.random() * 4)];
          const steht = Math.random() < 0.35;
          g.vx = steht ? 0 : r[0] * g.w.geschwindigkeit;
          g.vy = steht ? 0 : r[1] * g.w.geschwindigkeit;
          g.wechselBei = jetzt + 700 + Math.random() * 1200;
        }
        vx = g.vx;
        vy = g.vy;
      }
    }
    const neu = bewege(this.welt, g.x, g.y, vx * dt, vy * dt);
    if (neu.gestossen && jetzt >= g.stossBis) g.wechselBei = 0;
    g.x = neu.x;
    g.y = neu.y;

    for (const s of hier) {
      if (s.tot || jetzt < s.unverwundbarBis) continue;
      if (Math.hypot(s.x - g.x, s.y - 8 - (g.y - 6)) > 16) continue;
      this.spiel.spielerTreffen(s, g, jetzt);
    }
  }

  stand(jetzt) {
    return {
      t: 'stand',
      spieler: this.spieler().map((s) => ({
        id: s.id, name: s.name, farbe: s.farbe, x: rund(s.x), y: rund(s.y), r: s.richtung, l: s.laeuft,
        leben: s.leben, tot: s.tot, unv: jetzt < s.unverwundbarBis,
      })),
      gegner: this.gegner.map((g) => ({ id: g.id, art: g.art, x: rund(g.x), y: rund(g.y), tot: g.tot })),
      herzen: [...this.herzen.values()].map((h) => ({ id: h.id, x: h.x, y: h.y })),
    };
  }
}

function naechster(g, hier) {
  let bester = null, abstand = g.w.sichtweite;
  for (const s of hier) {
    if (s.tot) continue;
    const d = Math.hypot(s.x - g.x, s.y - g.y);
    if (d < abstand) { bester = s; abstand = d; }
  }
  return bester;
}

function rund(v) {
  return Math.round(v * 10) / 10;
}

export function richtungZu(vonX, vonY, nachX, nachY, sonst) {
  const d = Math.hypot(nachX - vonX, nachY - vonY);
  return d < 0.5 ? sonst : [(nachX - vonX) / d, (nachY - vonY) / d];
}
