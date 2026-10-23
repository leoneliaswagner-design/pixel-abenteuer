// Der Kartengenerator: erzeugt alle Karten in einen Wegwerf-Ordner und
// sieht nach, ob sie zusammenpassen.
//   node pruefstand/karten.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

console.log(`\n${pruefungen} Prüfungen, ${Object.keys(karten).length} Karten, ${uebergaenge} Übergänge.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
