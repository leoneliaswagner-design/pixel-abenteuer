// Die Spielrunde auf dem Server. Er entscheidet alles, worüber zwei Spieler
// sich einig sein müssen: Leben, Treffer, Gegner, Büsche, Herzen — und wer
// in welchem Gebiet steht.
//
// Nur die eigene Position meldet jeder Browser selbst — sonst fühlt sich das
// Laufen bei 80 ms Ping zäh an. Der Server prüft sie aber (Tempo und Wände)
// und schickt eine Korrektur, wenn sie nicht stimmen kann.
import { RICHTUNGEN } from '../gemeinsam/welt.js';
import { Gebiet, richtungZu } from './gebiet.js';

const FARBEN = ['gruen', 'rot', 'blau', 'lila'];
const MAX_SPIELER = FARBEN.length;
const SPEICHER_ABSTAND = 5000;

// Ein Spielstand ohne Datei — für Prüfstände und den Allein-Modus.
export const fluechtigerStand = () => ({ daten: { version: 1, spieler: {}, welt: {} }, speichern() {} });

export class Spiel {
  // karten: { gebietsname: tiled-json }
  constructor(karten, werte, { jetzt = () => Date.now(), spielstand = fluechtigerStand() } = {}) {
    this.w = werte;
    this.jetzt = jetzt;
    this.spielstand = spielstand;
    this.spieler = new Map();
    this.naechsteId = 1;
    this.gebiete = new Map(Object.entries(karten).map(([name, karte]) => [name, new Gebiet(name, karte, this)]));
    this.startGebiet = this.gebiete.get(werte.startGebiet);
    if (!this.startGebiet?.starts.length) throw new Error(`Startgebiet „${werte.startGebiet}" fehlt oder hat keinen Ort „spieler_start"`);
    for (const g of this.gebiete.values())
      for (const u of g.uebergaenge)
        if (!this.gebiete.get(u.eig.ziel)?.ankuenfte.has(u.eig.ankunft))
          throw new Error(`Übergang in „${g.name}" führt ins Leere: ${u.eig.ziel} / ${u.eig.ankunft}`);
    this.zuletztGespeichert = jetzt();
  }

  // ---------- Verbindungen ----------

  // Spieler werden am Namen erkannt — es gibt keine Konten. Wer mit
  // demselben Namen wiederkommt, steht da, wo er aufgehört hat.
  beitreten(name, senden) {
    name = String(name || 'Held').trim().slice(0, 14) || 'Held';
    const schluessel = name.toLowerCase();
    const da = [...this.spieler.values()];
    if (da.some((s) => s.schluessel === schluessel)) return { fehler: `„${name}" ist schon im Spiel. Nimm einen anderen Namen.` };
    if (da.length >= MAX_SPIELER) return { fehler: 'Das Spiel ist voll — es sind schon vier Leute da.' };

    const alt = this.spielstand.daten.spieler[schluessel];
    const farbe = alt && !da.some((s) => s.farbe === alt.farbe) ? alt.farbe : FARBEN.find((f) => !da.some((s) => s.farbe === f));
    let ort = alt && this.gebiete.get(alt.gebiet)?.welt.frei(alt.x, alt.y) ? { gebiet: alt.gebiet, x: alt.x, y: alt.y } : null;
    ort ??= this.startpunkt();
    const jetzt = this.jetzt();
    const s = {
      id: String(this.naechsteId++), name, schluessel, farbe, senden,
      gebiet: ort.gebiet, x: ort.x, y: ort.y, richtung: alt?.richtung ?? 'unten', laeuft: false,
      leben: Math.max(1, alt?.leben ?? this.w.spieler.leben), tot: false, wiederBei: 0,
      ankunft: alt?.ankunft && this.gebiete.has(alt.ankunft.gebiet) ? alt.ankunft : ort,
      unverwundbarBis: jetzt + 1500, naechsterHieb: 0,
      korrektur: 0, budget: 0, zuletzt: jetzt,
    };
    this.spieler.set(s.id, s);
    senden({ t: 'willkommen', id: s.id, farbe, wieder: !!alt, ...this.ortsangabe(s) });
    this.anAlle({ t: 'nachricht', text: alt ? `${name} ist zurück.` : `${name} ist da.` });
    this.merken(s);
    return s;
  }

  verlassen(id) {
    const s = this.spieler.get(id);
    if (!s) return;
    this.merken(s);
    this.speichern();
    this.spieler.delete(id);
    this.anAlle({ t: 'nachricht', text: `${s.name} ist gegangen.` });
  }

  // Was ein Browser braucht, um ein Gebiet aufzubauen.
  ortsangabe(s) {
    return { gebiet: s.gebiet, x: s.x, y: s.y, r: s.richtung, k: s.korrektur, leben: s.leben, geschnitten: [...this.gebiete.get(s.gebiet).welt.geschnitten] };
  }

  // Mehrere Spieler starten nicht auf demselben Punkt — sonst stehen sie
  // übereinander und man sieht nur einen.
  startpunkt() {
    const g = this.startGebiet;
    const n = g.spieler().length;
    const ort = g.starts[n % g.starts.length];
    const versatz = [[0, 0], [24, 0], [-24, 0], [0, 24]][Math.floor(n / g.starts.length) % 4];
    const x = ort.x + versatz[0], y = ort.y + 8 + versatz[1];
    return g.welt.frei(x, y) ? { gebiet: g.name, x, y } : { gebiet: g.name, x: ort.x, y: ort.y + 8 };
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
    const gebiet = this.gebiete.get(s.gebiet);
    const weg = Math.hypot(x - s.x, y - s.y);
    if (weg > s.budget + 2 || !gebiet.welt.frei(x, y)) {
      this.korrigiere(s);
      return;
    }
    s.budget -= weg;
    s.x = x;
    s.y = y;
    const u = gebiet.uebergangBei(x, y);
    if (u) this.wechseln(s, u.eig.ziel, u.eig.ankunft);
  }

  korrigiere(s) {
    s.korrektur++;
    s.budget = 0;
    s.senden({ t: 'korrektur', x: s.x, y: s.y, k: s.korrektur });
  }

  // In ein anderes Gebiet: der Server setzt die Figur um, und der Browser
  // baut die neue Karte auf. Der Korrekturzähler steigt, damit Positionen,
  // die noch aus dem alten Gebiet unterwegs sind, verworfen werden.
  wechseln(s, zielName, ankunftId) {
    const alt = this.gebiete.get(s.gebiet);
    const ziel = this.gebiete.get(zielName);
    const ort = ziel.ankuenfte.get(ankunftId);
    Object.assign(s, { gebiet: zielName, x: ort.x, y: ort.y + 8, budget: 0, laeuft: false });
    if (RICHTUNGEN[ort.eig.richtung]) s.richtung = ort.eig.richtung;
    s.korrektur++;
    s.ankunft = { gebiet: zielName, x: s.x, y: s.y };
    s.unverwundbarBis = Math.max(s.unverwundbarBis, this.jetzt() + 800);
    s.senden({ t: 'gebiet', ...this.ortsangabe(s) });
    alt.anAlle({ t: 'nachricht', text: `${s.name} geht nach ${ziel.titel}.` });
    ziel.anAlle({ t: 'nachricht', text: `${s.name} kommt dazu.` }, s.id);
    this.merken(s);
  }

  hieb(s, m) {
    const jetzt = this.jetzt();
    if (s.tot || jetzt < s.naechsterHieb) return;
    const ws = this.w.spieler;
    if (RICHTUNGEN[m.r]) s.richtung = m.r;
    s.naechsterHieb = jetzt + ws.hiebDauer + ws.hiebPause;
    const gebiet = this.gebiete.get(s.gebiet);
    gebiet.anAlle({ t: 'hieb', id: s.id, r: s.richtung }, s.id);
    gebiet.hieb(s, jetzt);
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

  // Wiederbelebt wird an der letzten Ankunft — dem Eingang des Gebiets, in
  // dem man zuletzt angekommen ist, wie die Raumeingänge in Zelda.
  wiederbeleben(s, jetzt) {
    const a = s.ankunft;
    const zurueck = this.gebiete.get(a.gebiet)?.welt.frei(a.x, a.y) ? a : this.startpunkt();
    const anderesGebiet = zurueck.gebiet !== s.gebiet;
    Object.assign(s, { tot: false, leben: this.w.spieler.leben, gebiet: zurueck.gebiet, x: zurueck.x, y: zurueck.y, unverwundbarBis: jetzt + 2000, budget: 0 });
    s.korrektur++;
    s.senden(anderesGebiet ? { t: 'gebiet', ...this.ortsangabe(s) } : { t: 'wiederbelebt', x: s.x, y: s.y, k: s.korrektur });
  }

  // ---------- Takt ----------

  schritt(dt) {
    const jetzt = this.jetzt();
    for (const g of this.gebiete.values()) g.schritt(dt, jetzt);
    for (const s of this.spieler.values()) if (s.tot && jetzt >= s.wiederBei) this.wiederbeleben(s, jetzt);
    if (jetzt - this.zuletztGespeichert >= SPEICHER_ABSTAND) {
      for (const s of this.spieler.values()) this.merken(s);
      this.speichern();
    }
  }

  // Ein Takt: rechnen, dann jedem Spieler den Stand seines Gebiets schicken.
  takt(dt) {
    this.schritt(dt);
    const jetzt = this.jetzt();
    const staende = new Map();
    for (const s of this.spieler.values()) {
      if (!staende.has(s.gebiet)) staende.set(s.gebiet, this.gebiete.get(s.gebiet).stand(jetzt));
      s.senden(staende.get(s.gebiet));
    }
  }

  // ---------- Spielstand ----------

  // Wer besiegt ist, wird mit vollem Leben an seiner Ankunft gespeichert —
  // sonst käme er nach einem Absturz mit 0 Herzen zurück.
  merken(s) {
    const tot = s.tot;
    this.spielstand.daten.spieler[s.schluessel] = {
      name: s.name, farbe: s.farbe, richtung: s.richtung,
      gebiet: tot ? s.ankunft.gebiet : s.gebiet, x: tot ? s.ankunft.x : s.x, y: tot ? s.ankunft.y : s.y,
      leben: tot ? this.w.spieler.leben : s.leben, ankunft: s.ankunft,
    };
    this.geaendert = true;
  }

  speichern() {
    this.zuletztGespeichert = this.jetzt();
    if (!this.geaendert) return;
    this.geaendert = false;
    this.spielstand.speichern();
  }

  anAlle(m, ausser) {
    for (const s of this.spieler.values()) if (s.id !== ausser) s.senden(m);
  }
}
