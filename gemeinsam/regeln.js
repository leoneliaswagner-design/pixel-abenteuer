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

// ausruestung: die angelegten Gegenstände (aus gegenstaende.json) mit ihren
// „boni" — schaden, leben (halbe Herzen), tempo, faehigkeit.
export function werteBerechnen(klasse, spezies, grund, ausruestung = []) {
  const attribute = {};
  for (const a of ATTRIBUTE) attribute[a] = (klasse.attribute?.[a] ?? 10) + (spezies.boni?.[a] ?? 0);
  const mod = Object.fromEntries(ATTRIBUTE.map((a) => [a, modifikator(attribute[a])]));
  const f = klasse.faehigkeit ?? null;
  const plus = (b) => ausruestung.reduce((n, g) => n + (g?.boni?.[b] ?? 0), 0);
  return {
    attribute,
    mod,
    // Halbe Herzen: Grund plus Konstitutions-Modifikator, mindestens zwei Herzen.
    maxLeben: Math.max(4, grund.leben + mod.konstitution) + plus('leben'),
    // Geschick macht schneller: 4 % je Punkt Modifikator.
    tempo: Math.round(grund.geschwindigkeit * (1 + 0.04 * mod.geschick)) + plus('tempo'),
    schaden: 1 + bonus(mod.staerke) + plus('schaden'),
    faehigkeit: f && { ...f, staerke: (f.schaden ?? f.heilung ?? 0) + bonus(mod[f.attribut] ?? 0) + plus('faehigkeit') },
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
