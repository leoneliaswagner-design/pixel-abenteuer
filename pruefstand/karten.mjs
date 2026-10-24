// Der Kartengenerator: erzeugt alle Karten in einen Wegwerf-Ordner und
// sieht nach, ob sie zusammenpassen.
//   node pruefstand/karten.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KACHELN } from '../werkzeuge/kacheln.mjs';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const ordner = mkdtempSync(join(tmpdir(), 'karten-'));
execFileSync(process.execPath, ['werkzeuge/karte.mjs'], { cwd: wurzel, env: { ...process.env, KARTEN_ZIEL: ordner } });
const karten = Object.fromEntries(readdirSync(ordner).map((d) => [d.replace('.json', ''), JSON.parse(readFileSync(join(ordner, d), 'utf8'))]));

const fehler = [];
let pruefungen = 0;
const pruefe = (bed, text) => {
  pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const boden = (karte, x, y) => {
  const gid = karte.layers[0].data[y * karte.width + x];
  return karte.tilesets[0].tiles[gid - 1].properties.find((p) => p.name === 'name').value;
};

const r = karten.riftside;
pruefe(['gras', 'gras2'].includes(boden(r, 25, 20)), `unter der Kiste am Hafen liegt Gras (${boden(r, 25, 20)})`);
pruefe(['gras', 'gras2'].includes(boden(r, 1, 19)), `unter der Truhe liegt Gras (${boden(r, 1, 19)})`);
pruefe(boden(r, 21, 20) === 'pflaster', `der Startpunkt liegt auf der Straße (${boden(r, 21, 20)})`);
pruefe(boden(r, 34, 15) === 'pflaster', `der Riss liegt in der gepflasterten Gasse (${boden(r, 34, 15)})`);

// Die begehbaren Haustüren führen in verschiedene Häuser — nicht alle ins erste.
const tueren = r.layers[2].objects.filter((o) => o.name === 'uebergang' && o.properties.some((p) => p.name === 'ziel' && !['wald', 'meer'].includes(p.value)) && !o.properties.some((p) => p.name === 'art' && p.value === 'riss'));
const hausZiele = new Set(tueren.map((o) => o.properties.find((p) => p.name === 'ziel').value));
pruefe(tueren.length === 3 && hausZiele.size === 3, `${tueren.length} Haustüren, ${hausZiele.size} verschiedene Häuser (${[...hausZiele].join(', ')})`);

// Automatische Kanten (client/kanten.js) auf den echten Karten.
const { kantenBerechnen } = await import('../client/kanten.js');
const { Welt } = await import('../gemeinsam/welt.js');
const kantenBei = (karte, x, y) => kantenBerechnen(new Welt(karte)).filter((k) => k.x === x && k.y === y).map((k) => k.bild);
pruefe(kantenBei(r, 5, 24).includes(0), `Wasser am Strand bekommt oben Schaum (${kantenBei(r, 5, 24)})`);
pruefe(kantenBei(r, 21, 1).includes(10), `Pflaster neben Gras bekommt links Grasbüschel (${kantenBei(r, 21, 1)})`);
pruefe(!kantenBei(r, 7, 25).includes(3), `kein Schaum zur Brücke hin (${kantenBei(r, 7, 25)})`);
pruefe(!kantenBei(r, 5, 27).length, 'mitten im Wasser keine Kante');

// Jeder Übergang führt zu einer Ankunft, die es gibt.
let uebergaenge = 0;
for (const [name, k] of Object.entries(karten))
  for (const o of k.layers[2].objects.filter((o) => o.name === 'uebergang')) {
    uebergaenge++;
    const eig = Object.fromEntries(o.properties.map((p) => [p.name, p.value]));
    const ziel = karten[eig.ziel];
    const da = ziel?.layers[2].objects.some((a) => a.name === 'ankunft' && a.properties.some((p) => p.name === 'id' && p.value === eig.ankunft));
    pruefe(da, `${name} → ${eig.ziel} / ${eig.ankunft}`);
  }

// ---------- Werkzeug für neue Gebiete (werkzeuge/gebiet.mjs) ----------
// In Wegwerf-Ordnern: die echten werte.json, welt.json und Karten bleiben unberührt.
{
  const { copyFileSync, writeFileSync } = await import('node:fs');
  const datenOrdner = mkdtempSync(join(tmpdir(), 'daten-'));
  for (const d of readdirSync(join(wurzel, 'inhalte', 'daten'))) copyFileSync(join(wurzel, 'inhalte', 'daten', d), join(datenOrdner, d));
  const kartenOrdner = mkdtempSync(join(tmpdir(), 'karten-neu-'));
  for (const d of readdirSync(join(wurzel, 'inhalte', 'karten'))) copyFileSync(join(wurzel, 'inhalte', 'karten', d), join(kartenOrdner, d));
  const umgebung = { ...process.env, KARTEN_ZIEL: kartenOrdner, DATEN_ZIEL: datenOrdner };
  const werkzeug = (...a) => {
    try {
      return { aus: execFileSync(process.execPath, ['werkzeuge/gebiet.mjs', ...a], { cwd: wurzel, env: umgebung, stdio: 'pipe' }).toString(), ok: true };
    } catch (e) {
      return { aus: String(e.stderr), ok: false };
    }
  };
  const neu = werkzeug('neu', 'leuchtturm', '20', '12', 'insel-047', 'den Leuchtturm');
  const lies = (o, d) => JSON.parse(readFileSync(join(o, d), 'utf8'));
  const werteNeu = lies(datenOrdner, 'werte.json'), weltNeu = lies(datenOrdner, 'welt.json'), karteNeu = lies(kartenOrdner, 'leuchtturm.json');
  pruefe(neu.ok && werteNeu.gebiete.includes('leuchtturm') && weltNeu.gebiete.leuchtturm?.region === 'insel-047',
    'neues Gebiet: Karte geschrieben, in werte.json und auf der Weltkarte eingetragen');
  const { Spiel } = await import('../server/spiel.js');
  const { ZUSATZDATEN } = await import('../gemeinsam/regeln.js');
  for (const d of ZUSATZDATEN) werteNeu[d] = lies(datenOrdner, `${d}.json`);
  const alle = Object.fromEntries(werteNeu.gebiete.map((g) => [g, lies(kartenOrdner, `${g}.json`)]));
  let spielFehler = '';
  try {
    const sp = new Spiel(alle, werteNeu);
    const g = sp.gebiete.get('leuchtturm');
    const rand = [0, 19].every((x) => g.welt.istFest(x, 5)) && [0, 11].every((y) => g.welt.istFest(5, y));
    pruefe(g.titel === 'den Leuchtturm' && g.ankuenfte.has('start') && rand && g.welt.frei(10 * 32 + 16, 6 * 32 + 24),
      `das Spiel lädt es: Titel, Ankunft „start", Baumrand fest, Mitte frei`);
  } catch (e) {
    spielFehler = e.message;
  }
  pruefe(!spielFehler, `der Server startet mit dem neuen Gebiet${spielFehler ? ` („${spielFehler}")` : ''}`);
  pruefe(karteNeu.tilesets[0].tilecount === KACHELN.length, `Kachelsatz vollständig (${karteNeu.tilesets[0].tilecount} Kacheln)`);
  const doppelt = werkzeug('neu', 'leuchtturm', '20', '12', 'insel-047');
  const falsch = werkzeug('neu', 'irgendwo', '20', '12', 'atlantis');
  pruefe(!doppelt.ok && doppelt.aus.includes('gibt es schon') && !falsch.ok && falsch.aus.includes('atlantis'), 'doppelter Name und unbekannte Region werden abgelehnt');
  // „kacheln": ein veralteter Kachelsatz (wie nach dem Anhängen neuer Kacheln) wird erneuert.
  const alt = lies(kartenOrdner, 'wald.json');
  alt.tilesets[0].tiles = alt.tilesets[0].tiles.slice(0, 5);
  alt.tilesets[0].tilecount = 5;
  writeFileSync(join(kartenOrdner, 'wald.json'), JSON.stringify(alt));
  const auffrischen = werkzeug('kacheln');
  const frisch = lies(kartenOrdner, 'wald.json');
  pruefe(auffrischen.ok && frisch.tilesets[0].tiles.length === KACHELN.length && frisch.layers[0].data.length === alt.layers[0].data.length,
    `kacheln: Kachelsatz erneuert (${frisch.tilesets[0].tiles.length}), Karte selbst unverändert`);
}

console.log(`\n${pruefungen} Prüfungen, ${Object.keys(karten).length} Karten, ${uebergaenge} Übergänge.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
