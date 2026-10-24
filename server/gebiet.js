// Ein Gebiet ist eine Karte mit allem, was darauf lebt: Gegner, Büsche,
// Herzen. Jedes Gebiet läuft für sich; Spieler können sich aufteilen —
// einer in der Höhle, zwei auf der Oberwelt.
import { Fallen } from './fallen.js';
import { erfuellt, Welt, bewege, hiebFlaeche, imRechteck, RICHTUNGEN } from '../gemeinsam/welt.js';

export class Gebiet {
  constructor(name, karte, spiel) {
    this.name = name;
    this.spiel = spiel;
    this.w = spiel.w;
    this.welt = new Welt(karte);
    this.titel = this.welt.eigenschaftenKarte.titel ?? name;
    // Auf dem Meer fährt man Boot (s. Spiel.sichten, client Spiel.eigeneFigur).
    this.meer = !!this.welt.eigenschaftenKarte.meer;
    this.starts = this.welt.orte.filter((o) => o.name === 'spieler_start');
    this.uebergaenge = this.welt.orte.filter((o) => o.name === 'uebergang');
    this.ankuenfte = new Map(this.welt.orte.filter((o) => o.name === 'ankunft').map((o) => [o.eig.id, o]));
    for (const u of this.uebergaenge)
      if (!u.eig.ziel || !u.eig.ankunft) throw new Error(`Übergang in „${name}" ohne „ziel" oder „ankunft"`);
    this.gegner = this.welt.orte.filter((o) => o.name === 'gegner').map((o, i) => this.neuerGegner(`${name}-g${i}`, o));
    this.herzen = new Map();
    this.geschosse = new Map();
    this.nachwachsen = new Map();
    // Wohin Figuren gerade schauen (nachdem jemand sie angesprochen hat).
    // Nicht im Spielstand — nach einem Neustart schauen sie wieder geradeaus.
    this.blicke = new Map();
    for (const d of this.welt.dinge)
      if (d.name === 'tuer' && spiel.spielstand.daten.welt.tueren?.[this.truhenSchluessel(d)]) this.welt.geoeffnet.add(d.schluessel);
    this.fallen = new Fallen(this);
    this.zustaendeGeaendert(false);
  }

  // Tore, die ein Weltzustand öffnet („oeffnet_bei"), nicht ein Schlüssel.
  // Nicht im Spielstand unter „tueren": der Zustand selbst ist gespeichert.
  zustaendeGeaendert(melden = true) {
    for (const d of this.welt.dinge) {
      if (d.name !== 'tuer' || !d.eig.oeffnet_bei || this.welt.geoeffnet.has(d.schluessel)) continue;
      if (!erfuellt(d.eig.oeffnet_bei, this.spiel.zustaende())) continue;
      this.welt.geoeffnet.add(d.schluessel);
      if (melden) this.anAlle({ t: 'tuer', ding: d.schluessel, offen: true });
    }
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

  tuerOeffnen(ding) {
    const welt = this.spiel.spielstand.daten.welt;
    welt.tueren ??= {};
    welt.tueren[this.truhenSchluessel(ding)] = true;
    this.welt.geoeffnet.add(ding.schluessel);
    this.spiel.geaendert = true;
  }

  offeneTruhen() {
    return this.welt.dinge.filter((d) => (d.name === 'truhe' || d.name === 'sockel') && this.istOffen(d)).map((d) => d.schluessel);
  }

  neuerGegner(id, ort) {
    // Die Art steht in den Eigenschaften des Punkts. (Lange las das hier
    // ort.art — das gab es nie, und jeder Gegner wurde ein Schleim.)
    const art = ort.eig?.art ?? 'schleim';
    const w = this.w.monster?.[art];
    if (!w) throw new Error(`Unbekannte Gegnerart „${art}" in „${this.name}"`);
    return { id, art, w, start: ort, x: ort.x, y: ort.y + 8, leben: w.leben, tot: false, vx: 0, vy: 0, wechselBei: 0, stossBis: 0, getroffenBis: 0, phase: null, phaseBis: 0, schussBereit: 0, blick: 'links', takt: Math.random() * 10 };
  }

  // Wer noch Klasse und Spezies wählt, ist für das Gebiet nicht da.
  spieler() {
    return [...this.spiel.spieler.values()].filter((s) => s.gebiet === this.name && !s.waehlt);
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
      this.gegnerTreffen(g, s, jetzt, s.werte?.schaden ?? 1);
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

  // s ist, wer trifft — oder ein Geschoss: gebraucht werden x, y und
  // richtung für den Rückstoß, und id für die Beute.
  gegnerTreffen(g, s, jetzt, schaden = 1) {
    g.leben -= schaden;
    g.getroffenBis = jetzt + 250;
    const [rx, ry] = richtungZu(s.x, s.y - 8, g.x, g.y - 6, RICHTUNGEN[s.richtung]);
    g.vx = rx * g.w.stossGeschwindigkeit;
    g.vy = ry * g.w.stossGeschwindigkeit;
    g.stossBis = jetzt + g.w.stossDauer;
    // Ein Treffer unterbricht den Sprung des Wolfs.
    g.phase = null;
    if (g.leben > 0) {
      this.anAlle({ t: 'gegner_treffer', id: g.id });
      return;
    }
    g.tot = true;
    g.wiederBei = jetzt + g.w.neuErscheinen;
    this.anAlle({ t: 'gegner_tot', id: g.id, x: g.x, y: g.y });
    this.spiel.beute(s.id, g);
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
    this.geschosseBewegen(dt, jetzt);
    this.fallen.schritt(dt, jetzt, hier);

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

  // ---------- Geschosse (Dolch, Feuerball, Pfeil) ----------

  geschossAbfeuern(g) {
    const id = `p${this.spiel.naechsteId++}`;
    this.geschosse.set(id, { id, ...g });
  }

  geschosseBewegen(dt, jetzt) {
    const t = this.welt.kachel;
    for (const p of this.geschosse.values()) {
      // In kleinen Schritten, sonst flöge ein schneller Pfeil durch einen
      // Schleim hindurch (330 px/s sind 16 px pro Takt).
      const schritte = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 6));
      let weg = null;
      for (let i = 0; i < schritte && !weg; i++) {
        p.x += (p.vx * dt) / schritte;
        p.y += (p.vy * dt) / schritte;
        p.rest -= (Math.hypot(p.vx, p.vy) * dt) / schritte;
        if (this.welt.istFest(Math.floor(p.x / t), Math.floor(p.y / t))) weg = 'wand';
        else if (p.rest <= 0) weg = 'weit';
        else if (p.feind) {
          // Pfeil eines Gegners: trifft Spieler. Wer gerade unverwundbar ist,
          // den fliegt er durch — wie das Blinken nach einem Treffer.
          const s = this.spieler().find((s) => !s.tot && jetzt >= s.unverwundbarBis && Math.hypot(s.x - p.x, s.y - 10 - p.y) < 12);
          if (s) {
            this.spiel.spielerTreffen(s, { x: p.x - p.vx * 0.05, y: p.y - p.vy * 0.05 + 6, w: { schaden: p.schaden } }, jetzt);
            weg = 'treffer';
          }
        } else {
          const g = this.gegner.find((g) => !g.tot && Math.hypot(g.x - p.x, g.y - 6 - p.y) < 14);
          if (g) {
            this.gegnerTreffen(g, { id: p.von, x: p.x - p.vx * 0.05, y: p.y - p.vy * 0.05 + 8, richtung: p.richtung }, jetzt, p.schaden);
            weg = 'treffer';
          }
        }
      }
      if (weg) {
        this.geschosse.delete(p.id);
        this.anAlle({ t: 'geschoss_weg', id: p.id, x: p.x, y: p.y, art: p.art, grund: weg });
      }
    }
  }

  herzenAufheben(s) {
    if (s.tot) return;
    for (const h of this.herzen.values()) {
      if (Math.hypot(h.x - s.x, h.y - (s.y - 8)) > 16) continue;
      if (s.leben >= this.spiel.maxLeben(s)) continue;
      s.leben = Math.min(this.spiel.maxLeben(s), s.leben + this.w.herz.heilung);
      this.herzen.delete(h.id);
      this.anAlle({ t: 'herz_genommen', id: h.id, von: s.id });
    }
  }

  gegnerSchritt(g, dt, jetzt, hier) {
    if (g.tot) {
      if (jetzt < g.wiederBei) return;
      const nah = hier.some((s) => Math.hypot(s.x - g.start.x, s.y - g.start.y) < 96);
      if (nah) return;
      Object.assign(g, { tot: false, leben: g.w.leben, x: g.start.x, y: g.start.y + 8, stossBis: 0, phase: null, sieht: false });
      this.anAlle({ t: 'gegner_neu', id: g.id });
      return;
    }
    let vx, vy;
    const ziel = jetzt < g.stossBis ? null : naechster(g, hier);
    if (jetzt < g.stossBis) {
      vx = g.vx;
      vy = g.vy;
    } else {
      if (ziel) [vx, vy] = (VERHALTEN[g.w.verhalten] ?? VERHALTEN.jagen).call(this, g, ziel, jetzt);
      else {
        g.phase = null;
        g.sieht = false;
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
    // Ein Sprung gegen die Wand ist zu Ende.
    if (neu.gestossen && g.phase === 'springen') g.phaseBis = jetzt;
    // Blickrichtung fürs Bild: wohin er läuft, sonst zum Ziel.
    const blickX = Math.abs(vx) > 1 ? vx : ziel ? ziel.x - g.x : 0;
    if (blickX) g.blick = blickX < 0 ? 'links' : 'rechts';
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
      zeit: this.spiel.tageszeit(jetzt),
      spieler: this.spieler().map((s) => ({
        id: s.id, name: s.name, farbe: s.farbe, x: rund(s.x), y: rund(s.y), r: s.richtung, l: s.laeuft,
        leben: s.leben, tot: s.tot, unv: jetzt < s.unverwundbarBis, klasse: s.klasse, max: this.spiel.maxLeben(s),
      })),
      // vx/vy: der Browser rechnet zwischen zwei Ständen weiter, und schräg
      // fliegende Pfeile der Goblins dreht er danach.
      geschosse: [...this.geschosse.values()].map((p) => ({ id: p.id, art: p.art, x: rund(p.x), y: rund(p.y), r: p.richtung, vx: rund(p.vx), vy: rund(p.vy) })),
      gegner: this.gegner.map((g) => ({ id: g.id, art: g.art, x: rund(g.x), y: rund(g.y), tot: g.tot, b: g.blick, z: g.phase })),
      herzen: [...this.herzen.values()].map((h) => ({ id: h.id, x: h.x, y: h.y })),
      ...this.fallen.stand(jetzt),
    };
  }
}

// Wie ein Gegner sich bewegt, wenn er jemanden sieht — „verhalten" in
// monster.json. Jede Funktion gibt die Geschwindigkeit [vx, vy] zurück.
const VERHALTEN = {
  jagen(g, z) {
    return zu(g, z, g.w.jagdGeschwindigkeit);
  },

  // Goblin: hält Abstand und schießt. Der erste Schuss kommt nicht sofort,
  // sonst träfe er jeden, der gerade um die Ecke kommt.
  fernkampf(g, z, jetzt) {
    const s = g.w.schuss, d = Math.hypot(z.x - g.x, z.y - g.y);
    if (!g.sieht) g.schussBereit = Math.max(g.schussBereit, jetzt + 700);
    g.sieht = true;
    if (jetzt >= g.schussBereit && d <= s.reichweite) {
      g.schussBereit = jetzt + s.abklingzeit;
      const dx = (z.x - g.x) / (d || 1), dy = (z.y - g.y) / (d || 1);
      this.geschossAbfeuern({
        von: g.id, feind: true, art: s.art, x: g.x + dx * 10, y: g.y - 10 + dy * 10, vx: dx * s.tempo, vy: dy * s.tempo,
        rest: s.reichweite, schaden: s.schaden, richtung: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'links' : 'rechts') : dy < 0 ? 'oben' : 'unten',
      });
    }
    if (d < s.abstand - 24) return zu(g, z, -g.w.jagdGeschwindigkeit);
    if (d > s.abstand + 24) return zu(g, z, g.w.jagdGeschwindigkeit);
    return [0, 0];
  },

  // Wolf: schleicht heran, duckt sich (laden — der Browser zeigt es), springt
  // geradeaus und verschnauft. Wer das Ducken sieht, kann ausweichen.
  anspringen(g, z, jetzt) {
    const s = g.w.sprung;
    if (g.phase && jetzt >= g.phaseBis) {
      if (g.phase === 'laden') [g.phase, g.phaseBis] = ['springen', jetzt + s.dauer];
      else if (g.phase === 'springen') [g.phase, g.phaseBis] = ['ruhe', jetzt + s.pause];
      else g.phase = null;
    }
    if (g.phase === 'laden' || g.phase === 'ruhe') return [0, 0];
    if (g.phase === 'springen') return [g.sprungX * s.tempo, g.sprungY * s.tempo];
    const d = Math.hypot(z.x - g.x, z.y - g.y);
    if (d < s.abstand) {
      [g.phase, g.phaseBis] = ['laden', jetzt + s.laden];
      [g.sprungX, g.sprungY] = [(z.x - g.x) / (d || 1), (z.y - g.y) / (d || 1)];
      return [0, 0];
    }
    return zu(g, z, g.w.jagdGeschwindigkeit);
  },

  // Fledermaus: auf das Ziel zu, aber im Zickzack quer dazu.
  flattern(g, z, jetzt) {
    const [vx, vy] = zu(g, z, g.w.jagdGeschwindigkeit);
    const quer = Math.sin(jetzt / 1000 * 7 + g.takt) * (g.w.zickzack ?? 1);
    return [vx - vy * quer, vy + vx * quer];
  },
};

function zu(g, z, tempo) {
  const d = Math.hypot(z.x - g.x, z.y - g.y) || 1;
  return [((z.x - g.x) / d) * tempo, ((z.y - g.y) / d) * tempo];
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
