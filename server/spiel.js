// Die Spielrunde auf dem Server. Er entscheidet alles, worüber zwei Spieler
// sich einig sein müssen: Leben, Treffer, Gegner, Büsche, Herzen — und wer
// in welchem Gebiet steht.
//
// Nur die eigene Position meldet jeder Browser selbst — sonst fühlt sich das
// Laufen bei 80 ms Ping zäh an. Der Server prüft sie aber (Tempo und Wände)
// und schickt eine Korrektur, wenn sie nicht stimmen kann.
import { RICHTUNGEN, erfuellt, hiebFlaeche, imRechteck } from '../gemeinsam/welt.js';
import { PLAETZE, darfTragen, kaufpreis, passtHinein, verkaufspreis, werteBerechnen } from '../gemeinsam/regeln.js';
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
    // Klassen und Spezies (inhalte/daten/klassen.json, spezies.json) — vom
    // Aufrufer an die Werte gehängt, damit Homebrew nur eine Datei ist.
    this.klassen = werte.klassen ?? {};
    this.spezies = werte.spezies ?? {};
    this.gegenstaende = werte.gegenstaende ?? {};
    this.laeden = werte.laeden ?? {};
  }

  // Klasse und Spezies festlegen und die Werte daraus berechnen.
  charakterSetzen(s, klasse, spezies) {
    s.klasse = klasse;
    s.spezies = spezies;
    this.werteNeu(s);
  }

  // Nach jeder Änderung an Klasse oder Ausrüstung: Werte neu, und wer
  // eine Rüstung ablegt, hat danach nicht mehr Leben als Herzen.
  werteNeu(s) {
    const an = PLAETZE.map((p) => this.gegenstaende[s.ausruestung[p]]).filter(Boolean);
    s.werte = werteBerechnen(this.klassen[s.klasse], this.spezies[s.spezies], this.w.spieler, an);
    s.leben = Math.min(s.leben, s.werte.maxLeben);
  }

  gegenstand(art) {
    return typeof art === 'string' && Object.hasOwn(this.gegenstaende, art) ? this.gegenstaende[art] : null;
  }

  charakterGueltig(klasse, spezies) {
    return Object.hasOwn(this.klassen, klasse ?? '') && Object.hasOwn(this.spezies, spezies ?? '');
  }

  maxLeben(s) {
    return s.werte?.maxLeben ?? this.w.spieler.leben;
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
      inventar: { ...(alt?.inventar ?? {}) }, zuletztAngesprochen: 0,
      // Nur, was es (noch) gibt und an den richtigen Platz gehört — ein
      // umbenannter Gegenstand im Spielstand soll nichts kaputt machen.
      ausruestung: Object.fromEntries(PLAETZE.filter((p) => this.gegenstand(alt?.ausruestung?.[p])?.platz === p).map((p) => [p, alt.ausruestung[p]])),
      // Unverwundbar, bis der Browser „bereit" meldet (höchstens 15 s), dann
      // noch 1,5 s. Die Schonfrist lief früher ab dem Beitreten — und war
      // vorbei, während der Browser noch Karte und Bilder lud.
      unverwundbarBis: jetzt + 15000, naechsterHieb: 0, faehigkeitBereit: 0, stossBis: 0,
      korrektur: 0, budget: 0, zuletzt: jetzt,
    };
    // Wer noch keine Klasse hat, wählt erst — bis dahin ist er für die
    // anderen nicht da (kein Stand, keine Gegner, kein Schaden).
    if (this.charakterGueltig(alt?.klasse, alt?.spezies)) this.charakterSetzen(s, alt.klasse, alt.spezies);
    else s.waehlt = true;
    s.leben = Math.min(s.leben, this.maxLeben(s));
    this.spieler.set(s.id, s);
    senden({
      t: 'willkommen', id: s.id, farbe, wieder: !!alt, ...this.ortsangabe(s),
      charakter: s.waehlt ? null : this.charakterAngabe(s),
      // grund: damit die Wahl im Browser Herzen und Tempo vorab zeigen kann.
      auswahl: { klassen: this.klassen, spezies: this.spezies, grund: { leben: this.w.spieler.leben, geschwindigkeit: this.w.spieler.geschwindigkeit } },
    });
    if (!s.waehlt) this.anAlle({ t: 'nachricht', text: alt ? `${name} ist zurück.` : `${name} ist da.` });
    this.merken(s);
    return s;
  }

  charakterAngabe(s) {
    return { klasse: s.klasse, spezies: s.spezies, werte: s.werte };
  }

  charakterWaehlen(s, m) {
    if (!s.waehlt || !this.charakterGueltig(m.klasse, m.spezies)) return;
    this.charakterSetzen(s, m.klasse, m.spezies);
    s.waehlt = false;
    s.leben = s.werte.maxLeben;
    s.unverwundbarBis = this.jetzt() + 15000;
    s.senden({ t: 'charakter', ...this.charakterAngabe(s), leben: s.leben });
    this.anAlle({ t: 'nachricht', text: `${s.name} ist da — ${this.spezies[m.spezies].name}, ${this.klassen[m.klasse].name}.` }, s.id);
    this.merken(s);
    this.speichern();
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
    const g = this.gebiete.get(s.gebiet);
    return {
      gebiet: s.gebiet, x: s.x, y: s.y, r: s.richtung, k: s.korrektur, leben: s.leben, inventar: s.inventar, ausruestung: s.ausruestung,
      geschnitten: [...g.welt.geschnitten], offen: g.offeneTruhen(), tueren: [...g.welt.geoeffnet],
      blicke: Object.fromEntries(g.blicke), zustaende: this.zustaende(), gruppe: this.gruppe(),
    };
  }

  // ---------- Weltzustände und Gruppen-Inventar ----------
  // Beides gehört der ganzen Runde, nicht einem Spieler, und steht im
  // Spielstand unter „welt".

  zustaende() {
    return (this.spielstand.daten.welt.zustaende ??= {});
  }

  zustandSetzen(name, meldung) {
    if (!name || this.zustaende()[name]) return;
    this.zustaende()[name] = true;
    this.geaendert = true;
    this.anAlle({ t: 'zustand', name, wert: true });
    if (meldung) this.anAlle({ t: 'nachricht', text: meldung });
  }

  gruppe() {
    return (this.spielstand.daten.welt.gruppe ??= {});
  }

  gruppeGeaendert() {
    this.geaendert = true;
    this.anAlle({ t: 'gruppe', inventar: this.gruppe() });
  }

  // Der Text eines Schilds oder einer Figur: „text_wenn_<zustand>" gewinnt,
  // sobald der Zustand gilt (in der Reihenfolge aus Tiled), sonst „text".
  textFuer(e) {
    for (const [k, v] of Object.entries(e)) if (k.startsWith('text_wenn_') && erfuellt(k.slice(10), this.zustaende())) return v;
    return e.text ?? '…';
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
    if (m.t === 'charakter') return this.charakterWaehlen(s, m);
    if (s.waehlt) return;
    if (m.t === 'pos') this.position(s, m);
    else if (m.t === 'faehigkeit') this.faehigkeit(s, m);
    else if (m.t === 'hieb') this.hieb(s, m);
    else if (m.t === 'ansprechen') this.ansprechen(s, m);
    else if (m.t === 'anlegen') this.anlegen(s, m.art);
    else if (m.t === 'ablegen') this.ablegen(s, m.platz);
    else if (m.t === 'benutzen') this.benutzen(s, m.art);
    else if (m.t === 'kaufen') this.kaufen(s, m.art);
    else if (m.t === 'verkaufen') this.verkaufen(s, m.art);
    else if (m.t === 'bereit') s.unverwundbarBis = Math.min(s.unverwundbarBis, this.jetzt() + this.w.spieler.schonfrist);
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
    const tempo = Math.max(s.werte?.tempo ?? this.w.spieler.geschwindigkeit, this.w.spieler.stossGeschwindigkeit, this.w.spieler.ansturmTempo);
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
    // Ein geschlossener Riss ist für den Server kein Übergang mehr. Und wer
    // gerade zurückgestoßen wird, geht nicht hindurch: ein Schleim schob
    // sonst Spieler rückwärts in den Riss, durch den sie gerade kamen.
    if (u && erfuellt(u.eig.bedingung, this.zustaende()) && jetzt >= (s.stossBis ?? 0)) this.wechseln(s, u.eig.ziel, u.eig.ankunft);
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
    // Bis die neue Karte steht, kann niemand ausweichen — s. beitreten.
    s.unverwundbarBis = Math.max(s.unverwundbarBis, this.jetzt() + 15000);
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

  // Schild lesen, mit einer Figur reden, eine Truhe öffnen. Der Server
  // entscheidet, was gesagt wird — später hängt das von Aufgaben und
  // Fortschritt ab, und den kennt nur er.
  ansprechen(s, m) {
    const jetzt = this.jetzt();
    if (s.tot || jetzt - s.zuletztAngesprochen < 200) return;
    s.zuletztAngesprochen = jetzt;
    if (RICHTUNGEN[m.r]) s.richtung = m.r;
    const gebiet = this.gebiete.get(s.gebiet);
    const ding = gebiet.welt.dingVor(s.x, s.y, s.richtung);
    if (!ding) return;
    const e = ding.eig;

    if (ding.name === 'schild') {
      // Magische Schrift: nur wer Magie lesen kann, versteht sie.
      if (e.magisch && !s.werte?.vorteile.includes('magie')) {
        s.senden({ t: 'dialog', seiten: ['Fremde, leuchtende Zeichen. Du kannst sie nicht lesen.', 'Vielleicht kann ein Magier etwas damit anfangen.'] });
        return;
      }
      s.senden({ t: 'dialog', seiten: seiten(this.textFuer(e)) });
    } else if (ding.name === 'figur' && this.laeden[e.laden]) {
      // Händler: statt Text das Ladenfenster. Gekauft wird nur, solange man
      // davor steht (s. imLaden).
      const blick = { oben: 'unten', unten: 'oben', links: 'rechts', rechts: 'links' }[s.richtung];
      gebiet.blicke.set(ding.schluessel, blick);
      gebiet.anAlle({ t: 'blick', ding: ding.schluessel, r: blick });
      s.laden = { id: e.laden, gebiet: s.gebiet, x: ding.x, y: ding.y };
      s.senden(this.ladenAngabe(s));
    } else if (ding.name === 'figur') {
      // Die Figur dreht sich zum Sprecher — für alle im Gebiet sichtbar.
      const blick = { oben: 'unten', unten: 'oben', links: 'rechts', rechts: 'links' }[s.richtung];
      gebiet.blicke.set(ding.schluessel, blick);
      gebiet.anAlle({ t: 'blick', ding: ding.schluessel, r: blick });
      s.senden({ t: 'dialog', name: e.name ?? '', seiten: seiten(this.textFuer(e)) });
      this.zustandSetzen(e.setzt, e.meldung);
    } else if (ding.name === 'truhe') {
      if (gebiet.istOffen(ding)) {
        s.senden({ t: 'dialog', seiten: ['Die Truhe ist leer.'] });
        return;
      }
      const [art, anzahl] = inhaltLesen(e.inhalt);
      const g = this.gegenstaende[art];
      // Voll: die Truhe bleibt zu — sonst wäre ihr Inhalt verloren.
      if (art && !passtHinein(s.inventar, art, this.gegenstaende, this.w.inventar.plaetze)) {
        s.senden({ t: 'dialog', seiten: ['Dein Rucksack ist voll. Verkauf oder benutz erst etwas.'] });
        return;
      }
      gebiet.oeffnen(ding);
      // Schlüssel und Ähnliches („gemeinsam" in werte.json) landen im
      // Gruppen-Inventar: sonst müsste immer der Finder zur Tür laufen.
      if (art && g?.gemeinsam) {
        this.gruppe()[art] = (this.gruppe()[art] ?? 0) + anzahl;
        this.gruppeGeaendert();
      } else if (art) s.inventar[art] = (s.inventar[art] ?? 0) + anzahl;
      gebiet.anAlle({ t: 'truhe', ding: ding.schluessel, offen: true });
      // Grammatik steht in den Daten („einzeln" im Akkusativ): „einen kleinen
      // Schlüssel", „eine Goldmünze" — aus Name und Artikel ließe sich das
      // nicht zuverlässig bauen.
      const was = !art ? 'nichts' : anzahl === 1 ? (g?.einzeln ?? art) : `${anzahl} ${g?.mehrzahl ?? art}`;
      s.senden({ t: 'dialog', seiten: [`Du findest ${was}!`] });
      this.inventarSenden(s);
      gebiet.anAlle({ t: 'nachricht', text: `${s.name} öffnet eine Truhe.` }, s.id);
      this.zustandSetzen(e.setzt, e.meldung);
      this.merken(s);
      this.speichern();
    } else if (ding.name === 'tuer') {
      const art = e.schluessel ?? 'schluessel';
      // Ein Schurke knackt das Schloss — ohne Schlüssel, und keiner geht verloren.
      const knackt = s.werte?.vorteile.includes('schloesser') && !e.zauber;
      if (!knackt && !(this.gruppe()[art] > 0)) {
        const g = this.gegenstaende[art];
        s.senden({ t: 'dialog', seiten: [`Verschlossen. Ihr braucht ${g?.einzeln ?? art}.`] });
        return;
      }
      if (!knackt) this.gruppe()[art]--;
      gebiet.tuerOeffnen(ding);
      gebiet.anAlle({ t: 'tuer', ding: ding.schluessel, offen: true });
      gebiet.anAlle({ t: 'nachricht', text: knackt ? `${s.name} knackt das Schloss.` : `${s.name} schließt eine Tür auf.` });
      this.gruppeGeaendert();
      this.speichern();
    }
  }

  // ---------- Inventar ----------
  // Der Browser zeigt an, was geht, und sperrt Knöpfe mit Begründung; der
  // Server prüft trotzdem alles selbst und schickt danach den neuen Stand.

  inventarSenden(s) {
    s.senden({ t: 'inventar', inventar: s.inventar, ausruestung: s.ausruestung, werte: s.werte, leben: s.leben });
    this.merken(s);
  }

  dazu(s, art, n) {
    s.inventar[art] = (s.inventar[art] ?? 0) + n;
    if (s.inventar[art] <= 0) delete s.inventar[art];
  }

  anlegen(s, art) {
    const g = this.gegenstand(art);
    if (s.tot || !g?.platz || !(s.inventar[art] > 0) || !darfTragen(g, s.klasse)) return;
    const vorher = s.ausruestung[g.platz];
    this.dazu(s, art, -1);
    if (vorher) this.dazu(s, vorher, 1);
    s.ausruestung[g.platz] = art;
    this.werteNeu(s);
    this.inventarSenden(s);
  }

  ablegen(s, platz) {
    const art = PLAETZE.includes(platz) ? s.ausruestung[platz] : null;
    if (!art || !passtHinein(s.inventar, art, this.gegenstaende, this.w.inventar.plaetze)) return;
    delete s.ausruestung[platz];
    this.dazu(s, art, 1);
    this.werteNeu(s);
    this.inventarSenden(s);
  }

  benutzen(s, art) {
    const g = this.gegenstand(art);
    if (s.tot || g?.art !== 'verbrauch' || !(s.inventar[art] > 0)) return;
    const heilung = g.wirkung?.heilung ?? 0;
    // Ein Trank bei vollem Leben wäre verschenkt.
    if (heilung && s.leben >= this.maxLeben(s)) {
      s.senden({ t: 'nachricht', text: 'Du bist nicht verletzt.' });
      return;
    }
    this.dazu(s, art, -1);
    s.leben = Math.min(this.maxLeben(s), s.leben + heilung);
    this.gebiete.get(s.gebiet).anAlle({ t: 'heilung', von: s.id, ziele: [s.id] });
    this.inventarSenden(s);
  }

  // Nur, wer noch vor dem Händler steht, kann handeln.
  imLaden(s) {
    const l = s.laden;
    return l && l.gebiet === s.gebiet && Math.hypot(l.x - s.x, l.y - s.y) < 72 ? this.laeden[l.id] : null;
  }

  ladenAngabe(s) {
    const l = this.laeden[s.laden.id];
    const preise = (liste, f) => Object.fromEntries(liste.filter((a) => this.gegenstand(a)?.preis).map((a) => [a, f(this.gegenstaende[a], s.werte.mod, this.w.handel)]));
    return {
      t: 'laden', name: l.name, gruss: l.gruss ?? '',
      waren: preise(l.waren, kaufpreis),
      ankauf: preise(Object.keys(this.gegenstaende).filter((a) => !this.gegenstaende[a].gemeinsam && a !== 'gold'), verkaufspreis),
    };
  }

  kaufen(s, art) {
    const l = this.imLaden(s);
    const g = this.gegenstand(art);
    if (!l || !g?.preis || !l.waren.includes(art)) return;
    const preis = kaufpreis(g, s.werte.mod, this.w.handel);
    if ((s.inventar.gold ?? 0) < preis || !passtHinein(s.inventar, art, this.gegenstaende, this.w.inventar.plaetze)) return;
    this.dazu(s, 'gold', -preis);
    this.dazu(s, art, 1);
    this.inventarSenden(s);
  }

  verkaufen(s, art) {
    const g = this.gegenstand(art);
    if (!this.imLaden(s) || !g?.preis || g.gemeinsam || !(s.inventar[art] > 0)) return;
    this.dazu(s, art, -1);
    this.dazu(s, 'gold', verkaufspreis(g, s.werte.mod, this.w.handel));
    this.inventarSenden(s);
  }

  // Ein besiegter Gegner gibt dem, der ihn besiegt hat, etwas Gold.
  beute(id, g) {
    const s = this.spieler.get(id);
    const [von, bis] = g.w.gold ?? [0, 0];
    if (!s || !bis) return;
    const n = von + Math.floor(Math.random() * (bis - von + 1));
    if (!n) return;
    this.dazu(s, 'gold', n);
    s.senden({ t: 'beute', art: 'gold', anzahl: n, x: g.x, y: g.y });
    this.inventarSenden(s);
  }

  // Die Klassenfähigkeit (Taste Q). Welche Art es ist, steht in klassen.json.
  faehigkeit(s, m) {
    const f = s.werte?.faehigkeit;
    const jetzt = this.jetzt();
    if (!f || s.tot || jetzt < s.faehigkeitBereit) return;
    if (RICHTUNGEN[m.r]) s.richtung = m.r;
    s.faehigkeitBereit = jetzt + f.abklingzeit;
    const gebiet = this.gebiete.get(s.gebiet);
    const [dx, dy] = RICHTUNGEN[s.richtung];
    gebiet.anAlle({ t: 'faehigkeit', id: s.id, art: f.art, r: s.richtung }, s.id);

    if (f.art === 'geschoss') {
      gebiet.geschossAbfeuern({ von: s.id, art: f.geschoss, x: s.x + dx * 10, y: s.y - 10 + dy * 8, vx: dx * f.tempo, vy: dy * f.tempo, rest: f.reichweite, schaden: f.staerke, richtung: s.richtung });
    } else if (f.art === 'heilung') {
      const ziele = gebiet.spieler().filter((p) => !p.tot && Math.hypot(p.x - s.x, p.y - s.y) <= f.umkreis);
      for (const p of ziele) p.leben = Math.min(this.maxLeben(p), p.leben + f.staerke);
      gebiet.anAlle({ t: 'heilung', von: s.id, ziele: ziele.map((p) => p.id) });
    } else if (f.art === 'ansturm') {
      // Der Browser bewegt die eigene Figur — er bekommt den Schub wie einen
      // Rückstoß, nur nach vorn. Getroffen wird, wer auf dem Weg steht.
      const dauer = (f.weite / this.w.spieler.ansturmTempo) * 1000;
      s.senden({ t: 'stoss', vx: dx * this.w.spieler.ansturmTempo, vy: dy * this.w.spieler.ansturmTempo, dauer });
      s.stossBis = jetzt + dauer + 250;
      s.unverwundbarBis = Math.max(s.unverwundbarBis, jetzt + dauer + 100);
      const vorn = hiebFlaeche(s.x + dx * f.weite / 2, s.y + dy * f.weite / 2, s.richtung, { hiebReichweite: f.weite / 2 + 20, hiebBreite: 32 });
      for (const g of gebiet.gegner) if (!g.tot && imRechteck(vorn, g.x, g.y - 6, 8)) gebiet.gegnerTreffen(g, s, jetzt, f.staerke);
    }
  }

  spielerTreffen(s, g, jetzt) {
    const ws = this.w.spieler;
    s.leben = Math.max(0, s.leben - g.w.schaden);
    s.unverwundbarBis = jetzt + ws.unverwundbar;
    const [rx, ry] = richtungZu(g.x, g.y - 6, s.x, s.y - 8, [0, 1]);
    // Den Rückstoß rechnet der Browser des Getroffenen selbst — er bewegt
    // seine Figur ja ohnehin. Das Weg-Guthaben oben lässt ihn zu.
    s.senden({ t: 'getroffen', vx: rx * ws.stossGeschwindigkeit, vy: ry * ws.stossGeschwindigkeit, dauer: ws.stossDauer });
    // Etwas länger als der Stoß selbst: die letzten Positionen davon sind
    // noch unterwegs, wenn er beim Browser schon vorbei ist.
    s.stossBis = jetzt + ws.stossDauer + 250;
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
    Object.assign(s, { tot: false, leben: this.maxLeben(s), gebiet: zurueck.gebiet, x: zurueck.x, y: zurueck.y, unverwundbarBis: jetzt + 2000, budget: 0 });
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
      if (s.waehlt) continue;
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
      leben: tot ? this.maxLeben(s) : s.leben, ankunft: s.ankunft, inventar: s.inventar, ausruestung: s.ausruestung,
      klasse: s.klasse, spezies: s.spezies,
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

// Seiten eines Textes: Leerzeilen trennen Seiten (in Tiled: zweimal Enter).
// Zu lange Seiten bricht der Browser selbst weiter um.
function seiten(text) {
  return String(text).split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
}

// „gold:20" → ['gold', 20]; „schluessel" → ['schluessel', 1]
function inhaltLesen(inhalt) {
  if (!inhalt) return [null, 0];
  const [art, zahl] = String(inhalt).split(':');
  return [art.trim(), Math.max(1, parseInt(zahl, 10) || 1)];
}
