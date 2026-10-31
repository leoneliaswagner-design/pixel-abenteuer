// Was Klasse und Spezies aus einer Figur machen — wie in D&D: Attribute,
// daraus Modifikatoren, daraus Herzen, Tempo und Schaden. Server und Browser
// rechnen mit derselben Funktion; der Browser braucht das Tempo für die
// eigene Figur, der Server alles andere.

// Daten neben werte.json, die Server und Browser beide laden und unter
// diesem Namen an die Werte hängen — eine neue Datei: hier eintragen.
export const ZUSATZDATEN = ['klassen', 'spezies', 'gegenstaende', 'laeden', 'monster', 'welt'];

export const ATTRIBUTE = ['staerke', 'geschick', 'konstitution', 'intelligenz', 'weisheit', 'charisma'];
export const KURZ = { staerke: 'STÄ', geschick: 'GES', konstitution: 'KON', intelligenz: 'INT', weisheit: 'WEI', charisma: 'CHA' };

// Der Modifikator wie im Regelwerk: 10–11 → 0, 12–13 → +1, 8–9 → −1 …
export const modifikator = (wert) => Math.floor((wert - 10) / 2);

// Ein Attribut von +2 und mehr bringt einen Punkt mehr — so bleibt es bei
// Zahlen, die zu Herzen und Schleimen mit 2 Leben passen.
const bonus = (mod) => (mod >= 2 ? 1 : 0);

// ---------- Stufen ----------
// Erfahrung → Stufe, nach der Tabelle in werte.json („stufen.erfahrung":
// so viel Erfahrung braucht Stufe 1, 2, 3 …). Höchstens so viele Stufen,
// wie die Tabelle Einträge hat.
export function stufeFuer(erfahrung, stufen) {
  const t = stufen?.erfahrung ?? [0];
  let n = 1;
  while (n < t.length && erfahrung >= t[n]) n++;
  return n;
}

// Wie viel bis zur nächsten Stufe: [schon geschafft, nötig] für den Balken.
export function stufenFortschritt(erfahrung, stufen) {
  const t = stufen?.erfahrung ?? [0], n = stufeFuer(erfahrung, stufen);
  if (n >= t.length) return [1, 1];
  return [erfahrung - t[n - 1], t[n] - t[n - 1]];
}

// Was eine Stufe bringt: ein Herz mehr auf den Stufen in „herzAb", einen
// Punkt Schaden auf „schadenAb" (wie Extra Attack auf 5, 11, 20), die
// Fähigkeit wird auf „faehigkeitAb" stärker. Was die Klassen auf ihren
// Stufen Eigenes lernen, kommt mit den Homebrew-Klassen dazu.
const erreicht = (liste, stufe) => (liste ?? []).filter((s) => stufe >= s).length;

// Was eine Klasse bis zu einer Stufe gelernt hat: ihre „stufen" und die
// ihres Pfads (ab „pfadAb"), in Stufenfolge. Jede Fähigkeit hat „boni"
// (passiv, werden zusammengezählt) oder eine „aktion" (eigene Taste).
export function gelernteFaehigkeiten(klasse, stufe, pfad) {
  const aus = (liste) => Object.entries(liste ?? {}).flatMap(([ab, fs]) => (stufe >= Number(ab) ? fs.map((f) => ({ ...f, ab: Number(ab) })) : []));
  return [...aus(klasse?.stufen), ...aus(klasse?.pfade?.[pfad]?.stufen)].sort((a, b) => a.ab - b.ab);
}

// Offene Entscheidungen beim Aufstieg: ein Pfad (einmal, ab „pfadAb") und
// Attributspunkte (zwei je Stufe in „attributAb", wie die ASI in D&D).
export function offeneWahl(klasse, stufe, pfad, attributPlus = {}) {
  const verteilt = Object.values(attributPlus).reduce((n, v) => n + v, 0);
  return {
    pfad: !!(klasse?.pfade && stufe >= (klasse.pfadAb ?? 3) && !klasse.pfade[pfad]),
    punkte: Math.max(0, 2 * (klasse?.attributAb ?? []).filter((s) => stufe >= s).length - verteilt),
  };
}
export const ATTRIBUT_HOECHSTENS = 20;

// ausruestung: die angelegten Gegenstände (aus gegenstaende.json) mit ihren
// „boni" — schaden, leben (halbe Herzen), tempo, faehigkeit.
// pfad und attributPlus ({staerke: 2 …}) kommen aus dem Spielstand.
export function werteBerechnen(klasse, spezies, grund, ausruestung = [], stufe = 1, stufen = null, pfad = null, attributPlus = {}) {
  const attribute = {};
  for (const a of ATTRIBUTE) attribute[a] = Math.min(ATTRIBUT_HOECHSTENS + 4, (klasse.attribute?.[a] ?? 10) + (spezies.boni?.[a] ?? 0) + (attributPlus?.[a] ?? 0));
  const gelernt = gelernteFaehigkeiten(klasse, stufe, pfad);
  // Passive Boni aus dem Gelernten zusammenzählen (Zahlen addieren sich).
  const p = {};
  for (const g of gelernt) for (const [k, v] of Object.entries(g.boni ?? {})) p[k] = (p[k] ?? 0) + v;
  const mod = Object.fromEntries(ATTRIBUTE.map((a) => [a, modifikator(attribute[a])]));
  const f = klasse.faehigkeit ?? null;
  const plus = (b) => ausruestung.reduce((n, g) => n + (g?.boni?.[b] ?? 0), 0) + (p[b] ?? 0);
  // Aktive Fähigkeiten: länger mit „aktionDauer", schneller geladen mit
  // „aktionAbkling" (beides in Prozent).
  // Zwei auf derselben Taste: die später gelernte ersetzt die frühere
  // (Taktiker: die Falle auf F statt der Doppelten Ablenkung).
  const proTaste = new Map();
  for (const g of gelernt.filter((x) => x.aktion)) proTaste.set(g.aktion.taste, g);
  // Immer F, R, T — nicht nach Lernstufe: beim Dieb kommt R (Pfad, Stufe 7)
  // vor F (Stufe 9), und die Leiste sprang in der Reihenfolge.
  const aktionen = [...proTaste.values()].sort((a, b) => 'FRT'.indexOf(a.aktion.taste) - 'FRT'.indexOf(b.aktion.taste)).map((g) => ({
    id: g.id, name: g.name, ...g.aktion,
    dauer: g.aktion.dauer && Math.round(g.aktion.dauer * (1 + (p.aktionDauer ?? 0) / 100)),
    abklingzeit: Math.round(g.aktion.abklingzeit * (1 - Math.min(80, p.aktionAbkling ?? 0) / 100)),
  }));
  // Hiebe: „hiebTempo" in Prozent kürzer, aber nie kürzer als 80 % des
  // Schwungs selbst — sonst begänne der nächste, bevor der erste vorbei ist.
  const hiebAbstand = Math.max(Math.round((grund.hiebDauer ?? 260) * 0.8), Math.round(((grund.hiebDauer ?? 260) + (grund.hiebPause ?? 120)) * (1 - (p.hiebTempo ?? 0) / 100)));
  return {
    attribute,
    mod,
    // Halbe Herzen: Grund plus Konstitutions-Modifikator, mindestens zwei Herzen.
    maxLeben: Math.max(4, grund.leben + mod.konstitution) + plus('leben') + 2 * erreicht(stufen?.herzAb, stufe),
    // Geschick macht schneller: 4 % je Punkt Modifikator.
    tempo: Math.round(grund.geschwindigkeit * (1 + 0.04 * mod.geschick + (p.tempoProzent ?? 0) / 100)) + plus('tempo'),
    schaden: 1 + bonus(mod.staerke) + plus('schaden') + erreicht(stufen?.schadenAb, stufe),
    faehigkeit: f && {
      ...f, staerke: (f.schaden ?? f.heilung ?? 0) + bonus(mod[f.attribut] ?? 0) + plus('faehigkeit') + erreicht(stufen?.faehigkeitAb, stufe),
      abklingzeit: Math.round(f.abklingzeit * (1 - Math.min(80, p.qAbkling ?? 0) / 100)),
      ...(f.reichweite && { reichweite: Math.round(f.reichweite * (1 + (p.reichweite ?? 0) / 100)) }),
    },
    vorteile: klasse.vorteile ?? [],
    stufe,
    pfad: klasse.pfade?.[pfad] ? pfad : null,
    gelernt: gelernt.map((g) => ({ id: g.id, name: g.name, text: g.text, ab: g.ab, aktiv: !!g.aktion })),
    aktionen,
    hiebAbstand,
    // Was im Kampf zählt — Wahrscheinlichkeiten 0…1, Zeiten in ms.
    kampf: {
      schutz: Math.min(0.75, p.schutz ?? 0), ausweichen: Math.min(0.75, p.ausweichen ?? 0), krit: Math.min(0.75, p.krit ?? 0),
      kritFaktor: 2 + (p.kritFaktor ?? 0), betaeuben: p.betaeuben ?? 0, verlangsamen: p.verlangsamen ?? 0, standfest: !!p.standfest,
      zaeh: p.zaeh ?? 0, erholung: p.erholung ?? 0, aura: p.aura ?? 0, haltung: p.haltung ?? 0, schreck: p.schreck ?? 0,
      // Bogenschütze: wer stillsteht (Ruhe), schießt härter, trifft öfter
      // kritisch, ist besser geschützt und schwerer zu entdecken; wer läuft,
      // hat „laufSchutz". Pfeile: Reichweite (Prozent), Durchschlag (Gegner).
      ruheSchuss: p.ruheSchuss ?? 0, ruheKrit: p.ruheKrit ?? 0, ruheSchutz: p.ruheSchutz ?? 0, laufSchutz: p.laufSchutz ?? 0,
      reichweite: p.reichweite ?? 0, durchschlag: p.durchschlag ?? 0, mehrPfeile: p.mehrPfeile ?? 0, schussKrit: !!p.schussKrit,
      herzPlus: p.herzPlus ?? 0, tarnung: !!p.tarnung, blendFlaeche: p.blendFlaeche ?? 0, markeSpringt: !!p.markeSpringt, markeSchaden: 1 + (p.markeSchaden ?? 0),
      // Dieb: Hinterhalt (Gegner jagt jemand anderen oder ist umzingelt),
      // Überraschung (jagt noch niemanden), Gift, Entschwinden, Gold, Feilschen.
      hinterhalt: p.hinterhalt ?? 0, ueberraschung: !!p.ueberraschung, ueberraschKrit: !!p.ueberraschKrit, goldPlus: p.goldPlus ?? 0,
      entschwinden: p.entschwinden ?? 0, entschwindenDauer: 1500 + (p.entschwindenDauer ?? 0), gift: p.gift ?? 0, lautlos: !!p.lautlos,
      laufSchlag: p.laufSchlag ?? 0, tarnungLaufen: !!p.tarnungLaufen, dunkelSchutz: p.dunkelSchutz ?? 0, feilschen: p.feilschen ?? 0, ablenkWeit: !!p.ablenkWeit,
    },
  };
}

// ---------- Ausrüstung und Handel ----------

export const PLAETZE = ['waffe', 'ruestung', 'schmuck'];
export const PLATZ_NAME = { waffe: 'Waffe', ruestung: 'Rüstung', schmuck: 'Schmuck' };

// Ohne „klassen" darf jede Klasse den Gegenstand tragen.
export const darfTragen = (g, klasse) => !g?.klassen || g.klassen.includes(klasse);

// Was in den Rucksack zählt: Gold hat seinen eigenen Beutel, Gemeinsames
// (Schlüssel, Risssteine) gehört der Gruppe. Jede Art belegt einen Platz,
// egal wie viele davon.
export function belegtePlaetze(inventar, gegenstaende) {
  return Object.entries(inventar).filter(([art, n]) => n > 0 && art !== 'gold' && !gegenstaende[art]?.gemeinsam).length;
}

export function passtHinein(inventar, art, gegenstaende, plaetze) {
  if (art === 'gold' || gegenstaende[art]?.gemeinsam || inventar[art] > 0) return true;
  return belegtePlaetze(inventar, gegenstaende) < plaetze;
}

// Charisma macht Preise: je Punkt Modifikator ein paar Prozent billiger
// beim Kaufen und mehr beim Verkaufen.
// feilschen: Prozent besser in beide Richtungen (Trickbetrüger).
export function kaufpreis(g, mod, handel, feilschen = 0) {
  return Math.max(1, Math.round(g.preis * (1 - handel.charismaRabatt * mod.charisma) * (1 - feilschen / 100)));
}
export function verkaufspreis(g, mod, handel, feilschen = 0) {
  return Math.max(1, Math.floor(g.preis * handel.ankauf * (1 + handel.charismaRabatt * mod.charisma) * (1 + feilschen / 100)));
}
