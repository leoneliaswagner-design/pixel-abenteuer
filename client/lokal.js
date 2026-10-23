// Allein spielen ohne Server: dieselben Regeln (server/spiel.js) laufen im
// Browser, und statt über WebSocket gehen die Nachrichten direkt hin und her.
// Für die Vorschau-Seite, die ohne laufenden Rechner auskommen muss — und ein
// erster Schritt zum Gastgeber-im-Browser (Peer-to-Peer, s. ROADMAP).
import { Netz } from './netz.js';
import { Spiel } from '../server/spiel.js';

const TAKT = 50;

export class LokalNetz extends Netz {
  async verbinden(name) {
    const lade = (pfad) => fetch(pfad).then((r) => {
      if (!r.ok) throw new Error(`${pfad} fehlt (${r.status})`);
      return r.json();
    });
    const werte = await lade('daten/werte.json');
    const karten = Object.fromEntries(await Promise.all(werte.gebiete.map(async (g) => [g, await lade(`karten/${g}.json`)])));
    this.spiel = new Spiel(karten, werte);
    let willkommen = null;
    // Kopie über JSON, wie beim echten Netz: sonst teilten sich Spiel und
    // Szene dieselben Objekte, und was die Szene ändert, änderte die Regeln.
    const ich = this.spiel.beitreten(name, (m) => {
      const kopie = JSON.parse(JSON.stringify(m));
      if (kopie.t === 'willkommen') willkommen = kopie;
      else this.verteilen(kopie);
    });
    this.ichId = ich.id;
    let zuletzt = Date.now();
    setInterval(() => {
      const jetzt = Date.now();
      this.spiel.takt(Math.min(0.1, (jetzt - zuletzt) / 1000));
      zuletzt = jetzt;
    }, TAKT);
    return willkommen;
  }

  senden(m) {
    this.spiel?.nachricht(this.ichId, JSON.parse(JSON.stringify(m)));
  }
}
