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

// ausruestung: die angelegten Gegenstände (aus gegenstaende.json) mit ihren
// „boni" — schaden, leben (halbe Herzen), tempo, faehigkeit.
export function werteBerechnen(klasse, spezies, grund, ausruestung = [], stufe = 1, stufen = null) {
  const attribute = {};
  for (const a of ATTRIBUTE) attribute[a] = (klasse.attribute?.[a] ?? 10) + (spezies.boni?.[a] ?? 0);
  const mod = Object.fromEntries(ATTRIBUTE.map((a) => [a, modifikator(attribute[a])]));
  const f = klasse.faehigkeit ?? null;
  const plus = (b) => ausruestung.reduce((n, g) => n + (g?.boni?.[b] ?? 0), 0);
  return {
    attribute,
    mod,
    // Halbe Herzen: Grund plus Konstitutions-Modifikator, mindestens zwei Herzen.
    maxLeben: Math.max(4, grund.leben + mod.konstitution) + plus('leben') + 2 * erreicht(stufen?.herzAb, stufe),
    // Geschick macht schneller: 4 % je Punkt Modifikator.
    tempo: Math.round(grund.geschwindigkeit * (1 + 0.04 * mod.geschick)) + plus('tempo'),
    schaden: 1 + bonus(mod.staerke) + plus('schaden') + erreicht(stufen?.schadenAb, stufe),
    faehigkeit: f && { ...f, staerke: (f.schaden ?? f.heilung ?? 0) + bonus(mod[f.attribut] ?? 0) + plus('faehigkeit') + erreicht(stufen?.faehigkeitAb, stufe) },
    vorteile: klasse.vorteile ?? [],
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
export function kaufpreis(g, mod, handel) {
  return Math.max(1, Math.round(g.preis * (1 - handel.charismaRabatt * mod.charisma)));
}
export function verkaufspreis(g, mod, handel) {
  return Math.max(1, Math.floor(g.preis * handel.ankauf * (1 + handel.charismaRabatt * mod.charisma)));
}
