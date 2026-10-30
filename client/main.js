import Phaser from 'phaser';
import { Netz } from './netz.js';
import { LokalNetz } from './lokal.js';
import { SpielSzene } from './szenen/Spiel.js';
import { Oberflaeche } from './szenen/Oberflaeche.js';
import { charakterWaehlen } from './charakterwahl.js';

// 480×270 ist 16:9 und zeigt 15×8,5 Kacheln — etwas mehr Welt als Link's
// Awakening (10×8), bei doppelter Kachelauflösung.
export const BREITE = 480;
export const HOEHE = 270;

// Allein spielen, ohne Server: mit ?allein in der Adresse, oder fest
// eingebaut (VITE_ALLEIN=1 beim Bauen) für die Vorschau-Seite.
const ALLEIN = import.meta.env.VITE_ALLEIN === '1' || new URLSearchParams(location.search).has('allein');
if (ALLEIN) {
  document.getElementById('hinweis').textContent =
    'Vorschau zum Alleinspielen — ein Tag dauert hier 4 Minuten. Mit Freunden geht es über „npm run online". Laufen mit Pfeiltasten oder WASD, Schwert mit Leertaste oder J, ansprechen und öffnen mit E, Klassen-Fähigkeit mit Q, Rucksack mit I, Weltkarte mit M, Trank mit 1.';
}

const form = document.getElementById('anmelden');
const feld = document.getElementById('name');
const fehler = document.getElementById('fehler');
try {
  feld.value = localStorage.getItem('name') ?? '';
} catch {
  /* privates Fenster: dann eben ohne gemerkten Namen */
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = feld.value.trim() || 'Held';
  try {
    localStorage.setItem('name', name);
  } catch {
    /* s. o. */
  }
  const knopf = form.querySelector('button');
  knopf.disabled = true;
  knopf.textContent = 'Verbinde …';
  fehler.textContent = '';
  const netz = ALLEIN ? new LokalNetz() : new Netz();
  try {
    // Phaser malt Text einmal und merkt ihn sich — ist die Pixelschrift dann
    // noch nicht da, bleibt der Text in der Ersatzschrift. Also vorher laden,
    // aber nicht ewig warten (offline gibt es sie nicht).
    await Promise.race([document.fonts.load('8px "Press Start 2P"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
    const willkommen = await netz.verbinden(name);
    if (!willkommen.charakter) {
      const wahl = await charakterWaehlen(willkommen.auswahl, willkommen.farbe);
      // Erst zuhören, dann senden: allein (LokalNetz) kommt die Antwort
      // noch während senden() zurück.
      const antwort = netz.warteAuf('charakter');
      netz.senden({ t: 'charakter', ...wahl });
      const c = await antwort;
      willkommen.charakter = { klasse: c.klasse, spezies: c.spezies, werte: c.werte, stufe: c.stufe, erfahrung: c.erfahrung, fortschritt: c.fortschritt };
      willkommen.leben = c.leben;
    }
    willkommen.name = name;
    document.getElementById('start').remove();
    starten(netz, willkommen);
  } catch (err) {
    fehler.textContent = err.message;
    knopf.disabled = false;
    knopf.textContent = 'Losspielen';
  }
});

function starten(netz, willkommen) {
  const spiel = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'spiel',
    width: BREITE,
    height: HOEHE,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#1b1424',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
  });
  spiel.scene.add('spiel', SpielSzene, true, { netz, willkommen });
  spiel.scene.add('oberflaeche', Oberflaeche, false);
  window.__phaser = spiel;
}
