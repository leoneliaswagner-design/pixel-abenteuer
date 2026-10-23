// Was Klasse und Spezies aus einer Figur machen — wie in D&D: Attribute,
// daraus Modifikatoren, daraus Herzen, Tempo und Schaden. Server und Browser
// rechnen mit derselben Funktion; der Browser braucht das Tempo für die
// eigene Figur, der Server alles andere.

export const ATTRIBUTE = ['staerke', 'geschick', 'konstitution', 'intelligenz', 'weisheit', 'charisma'];
export const KURZ = { staerke: 'STÄ', geschick: 'GES', konstitution: 'KON', intelligenz: 'INT', weisheit: 'WEI', charisma: 'CHA' };

// Der Modifikator wie im Regelwerk: 10–11 → 0, 12–13 → +1, 8–9 → −1 …
export const modifikator = (wert) => Math.floor((wert - 10) / 2);

// Ein Attribut von +2 und mehr bringt einen Punkt mehr — so bleibt es bei
// Zahlen, die zu Herzen und Schleimen mit 2 Leben passen.
const bonus = (mod) => (mod >= 2 ? 1 : 0);

export function werteBerechnen(klasse, spezies, grund) {
  const attribute = {};
  for (const a of ATTRIBUTE) attribute[a] = (klasse.attribute?.[a] ?? 10) + (spezies.boni?.[a] ?? 0);
  const mod = Object.fromEntries(ATTRIBUTE.map((a) => [a, modifikator(attribute[a])]));
  const f = klasse.faehigkeit ?? null;
  return {
    attribute,
    mod,
    // Halbe Herzen: Grund plus Konstitutions-Modifikator, mindestens zwei Herzen.
    maxLeben: Math.max(4, grund.leben + mod.konstitution),
    // Geschick macht schneller: 4 % je Punkt Modifikator.
    tempo: Math.round(grund.geschwindigkeit * (1 + 0.04 * mod.geschick)),
    schaden: 1 + bonus(mod.staerke),
    faehigkeit: f && { ...f, staerke: (f.schaden ?? f.heilung ?? 0) + bonus(mod[f.attribut] ?? 0) },
    vorteile: klasse.vorteile ?? [],
  };
}
