// Die Spielrunde auf dem Server. Er entscheidet alles, worüber zwei Spieler
// sich einig sein müssen: Leben, Treffer, Gegner, Büsche, Herzen.
//
// Nur die eigene Position meldet jeder Browser selbst — sonst fühlt sich das
// Laufen bei 80 ms Ping zäh an. Der Server prüft sie aber (Tempo und Wände)
// und schickt eine Korrektur, wenn sie nicht stimmen kann.
import { Welt, bewege, hiebFlaeche, imRechteck, RICHTUNGEN } from '../gemeinsam/welt.js';

const FARBEN = ['gruen', 'rot', 'blau', 'lila'];
const MAX_SPIELER = FARBEN.length;

export class Spiel {
  constructor(karte, werte, jetzt = () => Date.now()) {
    this.welt = new Welt(karte);
    this.w = werte;
    this.jetzt = jetzt;
    this.spieler = new Map();
    this.starts = this.welt.orte.filter((o) => o.name === 'spieler_start');
    if (!this.starts.length) throw new Error('Karte hat keinen Ort „spieler_start"');
    this.gegner = this.welt.orte
      .filter((o) => o.name === 'gegner')
      .map((o, i) => this.neuerGegner(`g${i}`, o));
    this.herzen = new Map();
    this.nachwachsen = new Map();
    this.naechsteId = 1;
  }

  neuerGegner(id, ort) {
    const art = ort.art ?? 'schleim';
    const w = this.w.gegner[art];
    if (!w) throw new Error(`Unbekannte Gegnerart „${art}"`);
    return { id, art, w, start: ort, x: ort.x, y: ort.y + 8, leben: w.leben, tot: false, vx: 0, vy: 0, wechselBei: 0, stossBis: 0, getroffenBis: 0 };
  }

  // ---------- Verbindungen ----------

  beitreten(name, senden) {
    if (this.spieler.size >= MAX_SPIELER) return null;
    const farbe = FARBEN.find((f) => ![...this.spieler.values()].some((s) => s.farbe === f));
    const id = String(this.naechsteId++);
    const start = this.startpunkt();
    const s = {
      id, name: String(name || 'Held').slice(0, 14), farbe, senden,
      x: start.x, y: start.y, richtung: 'unten', laeuft: false,
      leben: this.w.spieler.leben, tot: false, wiederBei: 0,
      unverwundbarBis: this.jetzt() + 1500, naechsterHieb: 0,
      korrektur: 0, budget: 0, zuletzt: this.jetzt(),
    };
    this.spieler.set(id, s);
    senden({
      t: 'willkommen', id, farbe, x: s.x, y: s.y, k: s.korrektur,
      geschnitten: [...this.welt.geschnitten],
    });
    this.anAlle({ t: 'nachricht', text: `${s.name} ist da.` });
    return s;
  }

  verlassen(id) {
    const s = this.spieler.get(id);
    if (!s) return;
    this.spieler.delete(id);
    this.anAlle({ t: 'nachricht', text: `${s.name} ist gegangen.` });
  }

  // Mehrere Spieler starten nicht auf demselben Punkt — sonst stehen sie
  // übereinander und man sieht nur einen.
  startpunkt() {
    const n = this.spieler.size;
    const ort = this.starts[n % this.starts.length];
    const versatz = [[0, 0], [24, 0], [-24, 0], [0, 24]][Math.floor(n / this.starts.length) % 4];
    const x = ort.x + versatz[0], y = ort.y + 8 + versatz[1];
    return this.welt.frei(x, y) ? { x, y } : { x: ort.x, y: ort.y + 8 };
  }

  nachricht(id, m) {
    const s = this.spieler.get(id);
    if (!s || !m || typeof m.t !== 'string') return;
    if (m.t === 'pos') this.position(s, m);
    else if (m.t === 'hieb') this.hieb(s, m);
  }

  position(s, m) {
    if (s.tot || m.k !== s.korrektur) return;
    const x = Number(m.x), y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (RICHTUNGEN[m.r]) s.richtung = m.r;
    s.laeuft = !!m.l;
    // Weg-Guthaben statt fester Grenze pro Nachricht: Pakete kommen im Netz
    // oft gebündelt an, dann liegen zwei Schritte in 5 ms — das ist kein
    // Schummeln. Das Guthaben füllt sich mit der Zeit und ist gedeckelt.
    const jetzt = this.jetzt();
    const tempo = Math.max(this.w.spieler.geschwindigkeit, this.w.spieler.stossGeschwindigkeit);
    s.budget = Math.min(48, s.budget + ((jetzt - s.zuletzt) / 1000) * tempo * 1.2);
    s.zuletzt = jetzt;
    const weg = Math.hypot(x - s.x, y - s.y);
    if (weg > s.budget + 2 || !this.welt.frei(x, y)) {
      this.korrigiere(s);
      return;
    }
    s.budget -= weg;
    s.x = x;
    s.y = y;
  }

  korrigiere(s) {
    s.korrektur++;
    s.budget = 0;
    s.senden({ t: 'korrektur', x: s.x, y: s.y, k: s.korrektur });
  }

  hieb(s, m) {
    const jetzt = this.jetzt();
    if (s.tot || jetzt < s.naechsterHieb) return;
    const ws = this.w.spieler;
    if (RICHTUNGEN[m.r]) s.richtung = m.r;
    s.naechsterHieb = jetzt + ws.hiebDauer + ws.hiebPause;
    this.anAlle({ t: 'hieb', id: s.id, r: s.richtung }, s.id);

    const f = hiebFlaeche(s.x, s.y, s.richtung, ws);
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
    const id = `h${this.naechsteId++}`;
    this.herzen.set(id, { id, x, y, bis: this.jetzt() + this.w.herz.verschwinden });
  }

  // ---------- Takt ----------

  schritt(dt) {
    const jetzt = this.jetzt();
    for (const g of this.gegner) this.gegnerSchritt(g, dt, jetzt);
    for (const s of this.spieler.values()) this.spielerSchritt(s, jetzt);

    for (const [i, bei] of this.nachwachsen) {
      if (jetzt < bei) continue;
      // Nicht in jemandem nachwachsen — der säße sonst im Busch fest.
      const t = this.welt.kachel, bx = (i % this.welt.breite) * t, by = Math.floor(i / this.welt.breite) * t;
      const besetzt = [...this.spieler.values(), ...this.gegner].some((e) => !e.tot && e.x > bx - 8 && e.x < bx + t + 8 && e.y > by && e.y < by + t + 10);
      if (besetzt) continue;
      this.nachwachsen.delete(i);
      this.welt.geschnitten.delete(i);
      this.anAlle({ t: 'busch', i, weg: false });
    }
    for (const h of this.herzen.values()) if (jetzt >= h.bis) this.herzen.delete(h.id);
  }

  spielerSchritt(s, jetzt) {
    if (s.tot) {
      if (jetzt < s.wiederBei) return;
      const start = this.startpunkt();
      Object.assign(s, { tot: false, leben: this.w.spieler.leben, x: start.x, y: start.y, unverwundbarBis: jetzt + 2000, budget: 0 });
      s.korrektur++;
      s.senden({ t: 'wiederbelebt', x: s.x, y: s.y, k: s.korrektur });
      return;
    }
    for (const h of this.herzen.values()) {
      if (Math.hypot(h.x - s.x, h.y - (s.y - 8)) > 16) continue;
      if (s.leben >= this.w.spieler.leben) continue;
      s.leben = Math.min(this.w.spieler.leben, s.leben + this.w.herz.heilung);
      this.herzen.delete(h.id);
      this.anAlle({ t: 'herz_genommen', id: h.id, von: s.id });
    }
  }

  gegnerSchritt(g, dt, jetzt) {
    if (g.tot) {
      if (jetzt < g.wiederBei) return;
      const nah = [...this.spieler.values()].some((s) => Math.hypot(s.x - g.start.x, s.y - g.start.y) < 96);
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
      const ziel = this.naechsterSpieler(g);
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

    for (const s of this.spieler.values()) {
      if (s.tot || jetzt < s.unverwundbarBis) continue;
      if (Math.hypot(s.x - g.x, s.y - 8 - (g.y - 6)) > 16) continue;
      this.spielerTreffen(s, g, jetzt);
    }
  }

  naechsterSpieler(g) {
    let bester = null, abstand = g.w.sichtweite;
    for (const s of this.spieler.values()) {
      if (s.tot) continue;
      const d = Math.hypot(s.x - g.x, s.y - g.y);
      if (d < abstand) { bester = s; abstand = d; }
    }
    return bester;
  }

  spielerTreffen(s, g, jetzt) {
    const ws = this.w.spieler;
    s.leben = Math.max(0, s.leben - g.w.schaden);
    s.unverwundbarBis = jetzt + ws.unverwundbar;
    const [rx, ry] = richtungZu(g.x, g.y - 6, s.x, s.y - 8, [0, 1]);
    // Den Rückstoß rechnet der Browser des Getroffenen selbst — er bewegt
    // seine Figur ja ohnehin. Das Weg-Guthaben oben lässt ihn zu.
    s.senden({ t: 'getroffen', vx: rx * ws.stossGeschwindigkeit, vy: ry * ws.stossGeschwindigkeit, dauer: ws.stossDauer });
    if (s.leben > 0) return;
    s.tot = true;
    s.wiederBei = jetzt + ws.wiederbelebung;
    this.anAlle({ t: 'nachricht', text: `${s.name} wurde besiegt.` });
  }

  // ---------- Senden ----------

  stand() {
    const jetzt = this.jetzt();
    return {
      t: 'stand',
      spieler: [...this.spieler.values()].map((s) => ({
        id: s.id, name: s.name, farbe: s.farbe, x: rund(s.x), y: rund(s.y), r: s.richtung, l: s.laeuft,
        leben: s.leben, tot: s.tot, unv: jetzt < s.unverwundbarBis,
      })),
      gegner: this.gegner.map((g) => ({ id: g.id, art: g.art, x: rund(g.x), y: rund(g.y), tot: g.tot })),
      herzen: [...this.herzen.values()].map((h) => ({ id: h.id, x: h.x, y: h.y })),
    };
  }

  anAlle(m, ausser) {
    for (const s of this.spieler.values()) if (s.id !== ausser) s.senden(m);
  }
}

function rund(v) {
  return Math.round(v * 10) / 10;
}

function richtungZu(vonX, vonY, nachX, nachY, sonst) {
  const d = Math.hypot(nachX - vonX, nachY - vonY);
  return d < 0.5 ? sonst : [(nachX - vonX) / d, (nachY - vonY) / d];
}
