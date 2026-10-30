// Die Spielrunde auf dem Server. Er entscheidet alles, worüber zwei Spieler
// sich einig sein müssen: Leben, Treffer, Gegner, Büsche, Herzen — und wer
// in welchem Gebiet steht.
//
// Nur die eigene Position meldet jeder Browser selbst — sonst fühlt sich das
// Laufen bei 80 ms Ping zäh an. Der Server prüft sie aber (Tempo und Wände)
// und schickt eine Korrektur, wenn sie nicht stimmen kann.
import { RICHTUNGEN, erfuellt, hiebFlaeche, imRechteck } from '../gemeinsam/welt.js';
import { ATTRIBUTE, ATTRIBUT_HOECHSTENS, PLAETZE, darfTragen, kaufpreis, offeneWahl, passtHinein, stufeFuer, stufenFortschritt, verkaufspreis, werteBerechnen } from '../gemeinsam/regeln.js';
import { Gebiet, richtungZu } from './gebiet.js';

const FARBEN = ['gruen', 'rot', 'blau', 'lila'];
const MAX_SPIELER = FARBEN.length;
const SPEICHER_ABSTAND = 5000;

// Ein Spielstand ohne Datei — für Prüfstände und den Allein-Modus.
export const fluechtigerStand = () => ({ daten: { version: 1, spieler: {}, welt: {} }, speichern() {} });

export class Spiel {
  // karten: { gebietsname: tiled-json }
  // zufall: für Abprallen, Ausweichen, kritische Treffer — Prüfstände geben
  // eine feste Zahl vor, sonst wären ihre Ergebnisse Glückssache.
  constructor(karten, werte, { jetzt = () => Date.now(), spielstand = fluechtigerStand(), zufall = Math.random } = {}) {
    this.w = werte;
    this.jetzt = jetzt;
    this.zufall = zufall;
    this.spielstand = spielstand;
    this.spieler = new Map();
    this.naechsteId = 1;
    this.karten = karten;
    this.gebieteAufbauen();
    if (!this.startGebiet?.starts.length) throw new Error(`Startgebiet „${werte.startGebiet}" fehlt oder hat keinen Ort „spieler_start"`);
    for (const g of this.gebiete.values())
      for (const u of g.uebergaenge)
        if (!this.gebiete.get(u.eig.ziel)?.ankuenfte.has(u.eig.ankunft))
          throw new Error(`Übergang in „${g.name}" führt ins Leere: ${u.eig.ziel} / ${u.eig.ankunft}`);
    this.zuletztGespeichert = jetzt();
    // Weltkarte (welt.json): jedes Gebiet muss dort stehen — sonst fällt
    // ein neues Gebiet erst auf, wenn jemand die Karte öffnet.
    this.welt = werte.welt ?? null;
    if (this.welt)
      for (const name of this.gebiete.keys()) {
        const o = this.welt.gebiete?.[name];
        if (!o || (!o.riss && !o.see && !this.welt.regionen?.[o.region]))
          throw new Error(`Gebiet „${name}" fehlt auf der Weltkarte (inhalte/daten/welt.json → gebiete) oder hat eine unbekannte Region`);
      }
    // Tageszeit 0…1 (0 Mitternacht, 0,5 Mittag): für alle gleich, der
    // Browser malt danach Tag und Nacht. TAGESZEIT=0.8 beim Start für
    // Prüfstände und Bilder vom Abend. (globalThis.process: dieselbe Datei
    // läuft im Alleinspiel im Browser, und dort gibt es kein process.)
    this.tagBeginn = jetzt() - (Number(globalThis.process?.env?.TAGESZEIT ?? this.w.tag?.beginn ?? 0.4) * (this.w.tag?.dauer ?? 1440000));
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
    s.werte = werteBerechnen(this.klassen[s.klasse], this.spezies[s.spezies], this.w.spieler, an, s.stufe ?? 1, this.w.stufen, s.pfad, s.attributPlus);
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
      // Die Stufe wird aus der Erfahrung gerechnet, nicht gespeichert: so
      // passt sie auch dann, wenn jemand die Tabelle in werte.json ändert.
      erfahrung: Math.max(0, Number(alt?.erfahrung) || 0),
      // Pfad und verteilte Attributspunkte. Nur, was es gibt — ein
      // umbenannter Pfad im Spielstand darf nichts kaputt machen.
      pfad: typeof alt?.pfad === 'string' ? alt.pfad : null,
      attributPlus: Object.fromEntries(ATTRIBUTE.filter((a) => Number.isInteger(alt?.attributPlus?.[a]) && alt.attributPlus[a] > 0).map((a) => [a, alt.attributPlus[a]])),
      aktionBereit: {}, rauschBis: 0, rauschBoni: null, sprintBis: 0, leereBis: 0, zaehBereit: 0, erholtBei: 0, stehtSeit: jetzt,
      // Nur, was es (noch) gibt und an den richtigen Platz gehört — ein
      // umbenannter Gegenstand im Spielstand soll nichts kaputt machen.
      ausruestung: Object.fromEntries(PLAETZE.filter((p) => this.gegenstand(alt?.ausruestung?.[p])?.platz === p).map((p) => [p, alt.ausruestung[p]])),
      // Unverwundbar, bis der Browser „bereit" meldet (höchstens 15 s), dann
      // noch 1,5 s. Die Schonfrist lief früher ab dem Beitreten — und war
      // vorbei, während der Browser noch Karte und Bilder lud.
      unverwundbarBis: jetzt + 15000, naechsterHieb: 0, faehigkeitBereit: 0, stossBis: 0,
      korrektur: 0, budget: 0, zuletzt: jetzt,
    };
    s.stufe = stufeFuer(s.erfahrung, this.w.stufen);
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
    this.entdecken(s.gebiet);
    this.merken(s);
    return s;
  }

  charakterAngabe(s) {
    return { klasse: s.klasse, spezies: s.spezies, werte: s.werte, ...this.stufenAngabe(s) };
  }

  stufenAngabe(s) {
    return {
      stufe: s.stufe, erfahrung: s.erfahrung, fortschritt: stufenFortschritt(s.erfahrung, this.w.stufen),
      pfad: s.werte?.pfad ?? null, attributPlus: s.attributPlus, offen: offeneWahl(this.klassen[s.klasse], s.stufe, s.pfad, s.attributPlus),
    };
  }

  // Neue Werte an den Spieler — nach Erfahrung, Pfad- oder Attributswahl.
  werteSenden(s, extra = {}) {
    s.senden({ t: 'erfahrung', dazu: 0, aufstieg: false, ...extra, werte: s.werte, leben: s.leben, ...this.stufenAngabe(s) });
  }

  // Pfad wählen: einmal, ab der Stufe der Klasse („pfadAb").
  pfadWaehlen(s, pfad) {
    const k = this.klassen[s.klasse];
    if (!offeneWahl(k, s.stufe, s.pfad, s.attributPlus).pfad || !Object.hasOwn(k.pfade ?? {}, pfad ?? '')) return;
    s.pfad = pfad;
    this.werteNeu(s);
    this.werteSenden(s);
    this.anAlle({ t: 'nachricht', text: `${s.name} geht den Weg: ${k.pfade[pfad].name}.` });
    this.merken(s);
  }

  // Einen Attributspunkt setzen, solange welche offen sind.
  attributSetzen(s, attribut) {
    const k = this.klassen[s.klasse];
    if (!ATTRIBUTE.includes(attribut) || !(offeneWahl(k, s.stufe, s.pfad, s.attributPlus).punkte > 0)) return;
    if (s.werte.attribute[attribut] >= ATTRIBUT_HOECHSTENS) return;
    s.attributPlus[attribut] = (s.attributPlus[attribut] ?? 0) + 1;
    const vorher = s.werte.maxLeben;
    this.werteNeu(s);
    // Mehr Konstitution, mehr Herzen: die neuen sind gleich voll.
    s.leben = Math.min(s.werte.maxLeben, s.leben + Math.max(0, s.werte.maxLeben - vorher));
    this.werteSenden(s);
    this.merken(s);
  }

  // Eine aktive Fähigkeit (Tasten F, R, T). Was sie tut, steht in
  // klassen.json unter „aktion"; der Server zählt die Abklingzeit.
  aktion(s, m) {
    const a = s.werte?.aktionen?.find((x) => x.id === m.id);
    const jetzt = this.jetzt();
    const gebiet = this.gebiete.get(s.gebiet);
    if (!a || s.tot || jetzt < (s.aktionBereit[a.id] ?? 0) || gebiet.meer) return;
    s.aktionBereit[a.id] = jetzt + a.abklingzeit;
    if (a.art === 'rausch') {
      s.rauschBis = jetzt + a.dauer;
      s.rauschBoni = a.boni ?? {};
    } else if (a.art === 'heilen') {
      s.leben = Math.min(this.maxLeben(s), s.leben + (a.menge ?? 2));
      gebiet.anAlle({ t: 'heilung', von: s.id, ziele: [s.id] });
    } else if (a.art === 'sprint') s.sprintBis = jetzt + a.dauer;
    else if (a.art === 'schuss') {
      // Wie der Pfeil auf Q, aber stärker; wer auf Q keinen Bogen hat, schießt trotzdem einen Pfeil.
      if (RICHTUNGEN[m.r]) s.richtung = m.r;
      const f = s.werte.faehigkeit?.art === 'geschoss' ? s.werte.faehigkeit : { geschoss: 'pfeil', tempo: 330, reichweite: 260, staerke: 1 };
      this.schiessen(s, gebiet, {
        art: f.geschoss, tempo: f.tempo, reichweite: Math.round(f.reichweite * (a.reichweiteFaktor ?? 1)), schaden: f.staerke + (a.schadenPlus ?? 0),
        pfeile: 1 + s.werte.kampf.mehrPfeile, durchschlag: a.durchschlag ?? 0, betaeuben: a.betaeuben ?? 0, krit: s.werte.kampf.schussKrit,
      }, jetzt);
    } else if (a.art === 'markieren') {
      // Der nächste Gegner in Reichweite; die Markierung zählt für alle.
      const ziel = gebiet.gegner.filter((g) => !g.tot && Math.hypot(g.x - s.x, g.y - s.y) <= 240).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      if (ziel) gebiet.markieren(ziel, s, jetzt + a.dauer);
    }
    else if (a.art === 'leere') {
      s.leereBis = jetzt + a.dauer;
      s.unverwundbarBis = Math.max(s.unverwundbarBis, s.leereBis);
    }
    // Einschüchternde Präsenz: wer eine Fähigkeit startet, lässt Gegner
    // in der Nähe erstarren.
    const schreck = s.werte.kampf.schreck;
    if (schreck) for (const g of gebiet.gegner) if (!g.tot && Math.hypot(g.x - s.x, g.y - s.y) < 96) g.betaeubtBis = jetzt + schreck;
    gebiet.anAlle({ t: 'aktion', id: s.id, art: a.art, dauer: a.dauer ?? 0 });
  }

  ruhig(s, jetzt) {
    return jetzt - s.stehtSeit >= 600;
  }

  // Pfeile, Dolche, Feuerbälle des Spielers. schuss: { art, tempo,
  // reichweite, schaden, pfeile, durchschlag, krit (immer kritisch),
  // betaeuben (ms, fest) }. Was im Ziel passiert, rechnet gebiet.js beim
  // Treffer — je Gegner neu gewürfelt.
  schiessen(s, gebiet, schuss, jetzt) {
    const k = s.werte.kampf, ruhe = this.ruhig(s, jetzt);
    const [dx, dy] = RICHTUNGEN[s.richtung];
    const schaden = schuss.schaden + (jetzt < s.rauschBis ? s.rauschBoni?.faehigkeit ?? 0 : 0) + (ruhe ? k.ruheSchuss : 0);
    const n = schuss.pfeile ?? 1;
    for (let i = 0; i < n; i++) {
      // Mehrere Pfeile fliegen nebeneinander, quer zur Richtung versetzt.
      const quer = (i - (n - 1) / 2) * 12;
      gebiet.geschossAbfeuern({
        von: s.id, art: schuss.art, richtung: s.richtung, rest: schuss.reichweite, schaden,
        x: s.x + dx * 10 - dy * quer, y: s.y - 10 + dy * 8 + dx * quer, vx: dx * schuss.tempo, vy: dy * schuss.tempo,
        kritChance: schuss.krit ? 1 : k.krit + (ruhe ? k.ruheKrit : 0), kritFaktor: k.kritFaktor,
        betaeubenChance: k.betaeuben, betaeubenFest: schuss.betaeuben ?? 0, blend: schuss.betaeuben ? k.blendFlaeche : 0,
        verlangsamen: k.verlangsamen, durch: (schuss.durchschlag ?? 0) + k.durchschlag, getroffen: new Set(),
      });
    }
  }

  // Der Schaden eines Hiebs: Grundwert, Rausch, Kampfhaltung (wer kurz
  // stillstand), dann vielleicht kritisch. Dazu, was er beim Gegner auslöst.
  hiebSchaden(s, jetzt) {
    const k = s.werte.kampf;
    let schaden = s.werte.schaden;
    if (jetzt < s.rauschBis) schaden += s.rauschBoni?.schaden ?? 0;
    if (k.haltung && jetzt - s.stehtSeit >= 600) schaden += k.haltung;
    const kc = k.krit + (this.ruhig(s, jetzt) ? k.ruheKrit : 0);
    const krit = kc > 0 && this.zufall() < kc;
    if (krit) schaden *= k.kritFaktor;
    return {
      schaden, krit,
      betaeuben: k.betaeuben > 0 && this.zufall() < k.betaeuben ? 1500 : 0,
      verlangsamen: k.verlangsamen,
    };
  }

  // Wie wahrscheinlich ein Treffer abprallt: eigener Schutz, Rausch, die
  // Schutzaura eines Mitspielers in der Nähe (die stärkste zählt), gegen
  // Fallen und Geschosse dazu das Ausweichen.
  schutzGegen(s, art, jetzt) {
    const k = s.werte?.kampf;
    if (!k) return 0;
    let p = k.schutz;
    if (jetzt < s.rauschBis) p += s.rauschBoni?.schutz ?? 0;
    p += this.ruhig(s, jetzt) ? k.ruheSchutz : jetzt - s.stehtSeit < 300 ? k.laufSchutz : 0;
    const aura = Math.max(0, ...this.gebiete.get(s.gebiet).spieler().filter((x) => x !== s && !x.tot && Math.hypot(x.x - s.x, x.y - s.y) <= 96).map((x) => x.werte?.kampf.aura ?? 0));
    p += aura;
    if (art === 'geschoss' || art === 'falle') p += k.ausweichen;
    return Math.min(0.9, p);
  }

  // Erfahrung für einen Spieler. Beim Aufstieg: Werte neu, Herzen voll,
  // und alle sehen es (Funkeln bei der Figur, Meldung).
  erfahrungGeben(s, n) {
    if (!n || s.waehlt) return;
    s.erfahrung += n;
    const vorher = s.stufe;
    s.stufe = stufeFuer(s.erfahrung, this.w.stufen);
    const auf = s.stufe > vorher;
    if (auf) {
      this.werteNeu(s);
      s.leben = s.werte.maxLeben;
      this.gebiete.get(s.gebiet).anAlle({ t: 'aufstieg', id: s.id, stufe: s.stufe });
      this.anAlle({ t: 'nachricht', text: `${s.name} erreicht Stufe ${s.stufe}!` });
    }
    s.senden({ t: 'erfahrung', dazu: n, aufstieg: auf, werte: s.werte, leben: s.leben, ...this.stufenAngabe(s) });
    this.geaendert = true;
  }

  // Erfahrung für einen Sieg bekommen alle im Gebiet, nicht nur wer zuletzt
  // zugeschlagen hat — wie in D&D die Gruppe; sonst lohnte es sich nicht,
  // den Heiler zu spielen. Wer in einem anderen Gebiet ist, war nicht dabei.
  erfahrungFuerGebiet(gebiet, n) {
    for (const s of gebiet.spieler()) if (!s.tot) this.erfahrungGeben(s, n);
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

  // Alle Gebiete frisch aus den Karten — beim Start und wenn die Welt
  // zurückgesetzt wird (offene Truhen, Türen, die liegende Kugel stehen in
  // den Gebieten und kämen sonst aus dem alten Stand).
  gebieteAufbauen() {
    this.gebiete = new Map(Object.entries(this.karten).map(([name, karte]) => [name, new Gebiet(name, karte, this)]));
    this.startGebiet = this.gebiete.get(this.w.startGebiet);
  }

  // ---------- Menü: von vorn ----------

  // Den eigenen Charakter vergessen. Der Browser lädt danach neu und meldet
  // sich unter demselben Namen an — dann ohne Spielstand, also mit neuer Wahl.
  neuAnfangen(s) {
    delete this.spielstand.daten.spieler[s.schluessel];
    s.geloescht = true;
    this.geaendert = true;
    this.speichern();
    this.anAlle({ t: 'nachricht', text: `${s.name} beginnt von vorn.` }, s.id);
    s.senden({ t: 'neustart', grund: 'charakter' });
  }

  // Die ganze Welt und alle Figuren zurück auf Anfang. Nur, wenn niemand
  // sonst im Spiel ist: den anderen verschwänden sonst mitten im Spiel
  // Truhen, Risse und ihre eigene Figur.
  weltZuruecksetzen(s) {
    if (this.spieler.size > 1) {
      s.senden({ t: 'nachricht', text: 'Die Welt lässt sich nur zurücksetzen, wenn sonst niemand im Spiel ist.' });
      return;
    }
    this.spielstand.daten = { version: 1, spieler: {}, welt: {} };
    s.geloescht = true;
    this.gebieteAufbauen();
    this.geaendert = true;
    this.speichern();
    s.senden({ t: 'neustart', grund: 'welt' });
  }

  // Was ein Browser braucht, um ein Gebiet aufzubauen.
  ortsangabe(s) {
    const g = this.gebiete.get(s.gebiet);
    return {
      gebiet: s.gebiet, x: s.x, y: s.y, r: s.richtung, k: s.korrektur, leben: s.leben, inventar: s.inventar, ausruestung: s.ausruestung,
      geschnitten: [...g.welt.geschnitten], offen: g.offeneTruhen(), tueren: [...g.welt.geoeffnet],
      blicke: Object.fromEntries(g.blicke), zustaende: this.zustaende(), gruppe: this.gruppe(), zeit: this.tageszeit(), entdeckt: this.entdeckt(),
    };
  }

  // ---------- Weltkarte ----------
  // Was die Gruppe gesehen hat, deckt sich auf der Karte auf — für alle,
  // wie Schlüssel und Weltzustände.
  entdeckt() {
    return (this.spielstand.daten.welt.entdeckt ??= []);
  }

  entdecken(gebiet) {
    this.regionEntdecken(this.welt?.gebiete?.[gebiet]?.region);
  }

  regionEntdecken(region) {
    if (!region || !this.welt?.regionen?.[region] || this.entdeckt().includes(region)) return;
    this.entdeckt().push(region);
    this.geaendert = true;
    this.anAlle({ t: 'entdeckt', region });
    this.anAlle({ t: 'nachricht', text: `Neu auf der Weltkarte: ${this.welt.regionen[region].name}` });
  }

  // Auf See: was in Sichtweite kommt, deckt sich auf. Eine Meerkachel sind
  // 4 Bildpunkte der Weltkarte; gemessen wird bis zum Rand der Region.
  sichten(s, jetzt) {
    if (jetzt - (s.zuletztGesichtet ?? 0) < 400) return;
    s.zuletztGesichtet = jetzt;
    const k = this.gebiete.get(s.gebiet).welt.kachel, schritt = 4;
    const px = (s.x / k) * schritt, py = (s.y / k) * schritt, sicht = this.w.boot?.sicht ?? 28;
    for (const [id, r] of Object.entries(this.welt?.regionen ?? {})) {
      const [x0, y0, x1, y1] = r.box;
      if (Math.hypot(Math.max(x0 - px, 0, px - x1), Math.max(y0 - py, 0, py - y1)) <= sicht) this.regionEntdecken(id);
    }
  }

  weltkarte(s) {
    s.senden({
      t: 'weltkarte', entdeckt: this.entdeckt(),
      spieler: [...this.spieler.values()].filter((p) => !p.waehlt).map((p) => ({ id: p.id, name: p.name, farbe: p.farbe, gebiet: p.gebiet })),
    });
  }

  tageszeit(jetzt = this.jetzt()) {
    return (((jetzt - this.tagBeginn) / (this.w.tag?.dauer ?? 1440000)) % 1 + 1) % 1;
  }

  // ---------- Weltzustände und Gruppen-Inventar ----------
  // Beides gehört der ganzen Runde, nicht einem Spieler, und steht im
  // Spielstand unter „welt".

  zustaende() {
    return (this.spielstand.daten.welt.zustaende ??= {});
  }

  // Mehrere mit Komma: das Idol setzt „idol_genommen,tempel_geschlossen" —
  // das eine weckt die Kugel, das andere schließt den Riss in Riftside.
  zustandSetzen(namen, meldung) {
    const neu = String(namen ?? '').split(',').map((n) => n.trim()).filter((n) => n && !this.zustaende()[n]);
    if (!neu.length) return;
    for (const name of neu) {
      this.zustaende()[name] = true;
      this.anAlle({ t: 'zustand', name, wert: true });
    }
    this.geaendert = true;
    for (const g of this.gebiete.values()) g.zustaendeGeaendert();
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
    else if (m.t === 'weltkarte') this.weltkarte(s);
    else if (m.t === 'aktion') this.aktion(s, m);
    else if (m.t === 'neu_anfangen') this.neuAnfangen(s);
    else if (m.t === 'welt_zuruecksetzen') this.weltZuruecksetzen(s);
    // Aus dem Charakterfenster kommt die Wahl als „art" (wie bei Gegenständen).
    else if (m.t === 'pfad') this.pfadWaehlen(s, m.pfad ?? m.art);
    else if (m.t === 'attribut') this.attributSetzen(s, m.attribut ?? m.art);
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
    // Für die Kampfhaltung: seit wann die Figur auf der Stelle steht.
    if (weg > 0.5) s.stehtSeit = jetzt;
    s.x = x;
    s.y = y;
    if (gebiet.meer) this.sichten(s, jetzt);
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

  // Jemand steht, wo plötzlich etwas fest ist (die liegende Steinkugel):
  // zur nächsten freien Stelle, in wachsenden Ringen gesucht.
  freiSchieben(s) {
    const welt = this.gebiete.get(s.gebiet).welt;
    for (let r = 8; r <= 160; r += 8)
      for (let a = 0; a < 16; a++) {
        const x = s.x + Math.cos((a / 16) * Math.PI * 2) * r, y = s.y + Math.sin((a / 16) * Math.PI * 2) * r;
        if (!welt.frei(x, y)) continue;
        [s.x, s.y] = [x, y];
        this.korrigiere(s);
        return;
      }
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
    this.entdecken(zielName);
    s.senden({ t: 'gebiet', ...this.ortsangabe(s) });
    alt.anAlle({ t: 'nachricht', text: `${s.name} geht nach ${ziel.titel}.` });
    ziel.anAlle({ t: 'nachricht', text: `${s.name} kommt dazu.` }, s.id);
    this.merken(s);
  }

  hieb(s, m) {
    const jetzt = this.jetzt();
    // Im Boot hat man die Hände an den Rudern.
    if (s.tot || jetzt < s.naechsterHieb || this.gebiete.get(s.gebiet).meer) return;
    const ws = this.w.spieler;
    if (RICHTUNGEN[m.r]) s.richtung = m.r;
    s.naechsterHieb = jetzt + (s.werte?.hiebAbstand ?? ws.hiebDauer + ws.hiebPause);
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
    } else if (ding.name === 'truhe' || ding.name === 'sockel') {
      // Ein Sockel ist eine Truhe ohne Deckel: einmal nehmen, dann leer.
      const sockel = ding.name === 'sockel';
      if (gebiet.istOffen(ding)) {
        s.senden({ t: 'dialog', seiten: [sockel ? 'Der Sockel ist leer.' : 'Die Truhe ist leer.'] });
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
      s.senden({ t: 'dialog', seiten: [sockel ? `Du nimmst ${was}!` : `Du findest ${was}!`] });
      this.inventarSenden(s);
      gebiet.anAlle({ t: 'nachricht', text: sockel ? `${s.name} nimmt ${was} vom Sockel.` : `${s.name} öffnet eine Truhe.` }, s.id);
      this.zustandSetzen(e.setzt, e.meldung);
      // Einen Riss zu schließen ist ein Erfolg der ganzen Gruppe — auch für
      // die, die gerade in Riftside warten.
      if (e.erfahrung) for (const p of this.spieler.values()) this.erfahrungGeben(p, Number(e.erfahrung));
      this.merken(s);
      this.speichern();
    } else if (ding.name === 'tuer' && e.oeffnet_bei) {
      // Ein Tor ohne Schloss: es geht nur über sein Rätsel auf.
      if (!gebiet.welt.geoeffnet.has(ding.schluessel)) s.senden({ t: 'dialog', seiten: seiten(e.text ?? 'Es rührt sich nicht.') });
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

  // Ein besiegter Gegner gibt dem, der ihn besiegt hat, etwas Gold — und
  // allen im Gebiet Erfahrung.
  beute(id, g, gebiet) {
    const s = this.spieler.get(id);
    if (g.w.erfahrung && gebiet) this.erfahrungFuerGebiet(gebiet, g.w.erfahrung);
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
    if (!f || s.tot || jetzt < s.faehigkeitBereit || this.gebiete.get(s.gebiet).meer) return;
    if (RICHTUNGEN[m.r]) s.richtung = m.r;
    // Schnellfeuer: im Rausch mit „qTempo" lädt Q schneller.
    s.faehigkeitBereit = jetzt + Math.round(f.abklingzeit * (1 - (jetzt < s.rauschBis ? s.rauschBoni?.qTempo ?? 0 : 0) / 100));
    const gebiet = this.gebiete.get(s.gebiet);
    const [dx, dy] = RICHTUNGEN[s.richtung];
    gebiet.anAlle({ t: 'faehigkeit', id: s.id, art: f.art, r: s.richtung }, s.id);

    if (f.art === 'geschoss') {
      this.schiessen(s, gebiet, { art: f.geschoss, tempo: f.tempo, reichweite: f.reichweite, schaden: f.staerke }, jetzt);
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

  // art: 'nah' (Gegner berührt), 'geschoss' oder 'falle' — gegen die
  // letzten beiden hilft Ausweichen.
  spielerTreffen(s, g, jetzt, art = 'nah') {
    const ws = this.w.spieler;
    // Abgeprallt: kein Schaden, aber kurz unverwundbar — sonst prallte derselbe
    // Schleim im nächsten Takt gleich noch einmal an.
    if (this.zufall() < this.schutzGegen(s, art, jetzt)) {
      s.unverwundbarBis = jetzt + 400;
      this.gebiete.get(s.gebiet).anAlle({ t: 'abgeprallt', id: s.id });
      return;
    }
    s.leben = Math.max(0, s.leben - g.w.schaden);
    s.unverwundbarBis = jetzt + ws.unverwundbar;
    // Unerbittlich: ein tödlicher Treffer lässt ein halbes Herz, mit Pause.
    const zaeh = s.werte?.kampf.zaeh;
    if (s.leben <= 0 && zaeh && jetzt >= s.zaehBereit) {
      s.leben = 1;
      s.zaehBereit = jetzt + zaeh;
      this.gebiete.get(s.gebiet).anAlle({ t: 'nachricht', text: `${s.name} gibt nicht auf!` });
    }
    const [rx, ry] = richtungZu(g.x, g.y - 6, s.x, s.y - 8, [0, 1]);
    // Den Rückstoß rechnet der Browser des Getroffenen selbst — er bewegt
    // seine Figur ja ohnehin. Das Weg-Guthaben oben lässt ihn zu. Wer
    // standfest ist, bekommt nur das Wackeln, keinen Stoß.
    const stoss = s.werte?.kampf.standfest ? 0 : ws.stossGeschwindigkeit;
    s.senden({ t: 'getroffen', vx: rx * stoss, vy: ry * stoss, dauer: stoss ? ws.stossDauer : 0 });
    // Etwas länger als der Stoß selbst: die letzten Positionen davon sind
    // noch unterwegs, wenn er beim Browser schon vorbei ist.
    if (stoss) s.stossBis = jetzt + ws.stossDauer + 250;
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
    for (const s of this.spieler.values()) {
      if (s.tot && jetzt >= s.wiederBei) this.wiederbeleben(s, jetzt);
      // Überlebender: mit höchstens halben Herzen langsam heilen.
      const e = s.werte?.kampf.erholung;
      if (e && !s.tot && !s.waehlt && s.leben <= this.maxLeben(s) / 2) {
        if (!s.erholtBei) s.erholtBei = jetzt + e;
        else if (jetzt >= s.erholtBei) {
          s.leben = Math.min(this.maxLeben(s), s.leben + 1);
          s.erholtBei = jetzt + e;
        }
      } else s.erholtBei = 0;
    }
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
    // Gelöscht (Menü: von vorn): nicht wieder hineinschreiben, auch nicht
    // beim regelmäßigen Speichern, bevor die Verbindung zugeht.
    if (s.geloescht) return;
    const tot = s.tot;
    this.spielstand.daten.spieler[s.schluessel] = {
      name: s.name, farbe: s.farbe, richtung: s.richtung,
      gebiet: tot ? s.ankunft.gebiet : s.gebiet, x: tot ? s.ankunft.x : s.x, y: tot ? s.ankunft.y : s.y,
      leben: tot ? this.maxLeben(s) : s.leben, ankunft: s.ankunft, inventar: s.inventar, ausruestung: s.ausruestung,
      klasse: s.klasse, spezies: s.spezies, erfahrung: s.erfahrung, pfad: s.pfad, attributPlus: s.attributPlus,
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
