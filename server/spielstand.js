// Der Spielstand als JSON-Datei auf dem Rechner, der den Server startet.
//
// Geschrieben wird erst in eine Zwischendatei, dann umbenannt: stürzt der
// Rechner mitten im Schreiben ab, bleibt die alte Datei heil. Die vorige
// Fassung liegt zusätzlich als .bak daneben — falls doch etwas schiefgeht,
// ist höchstens ein paar Sekunden Spiel weg, nicht die Kampagne.
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const LEER = () => ({ version: 1, spieler: {}, welt: {} });

export class Spielstand {
  constructor(pfad) {
    this.pfad = pfad;
    this.daten = this.laden();
  }

  laden() {
    for (const p of [this.pfad, this.pfad + '.bak']) {
      if (!existsSync(p)) continue;
      try {
        const d = JSON.parse(readFileSync(p, 'utf8'));
        if (p !== this.pfad) console.warn(`Spielstand war kaputt — nehme die Sicherung ${p}`);
        return { ...LEER(), ...d };
      } catch (e) {
        console.warn(`Spielstand ${p} nicht lesbar: ${e.message}`);
      }
    }
    return LEER();
  }

  speichern() {
    mkdirSync(dirname(this.pfad), { recursive: true });
    const text = JSON.stringify(this.daten, null, 2);
    const zwischen = this.pfad + '.neu';
    writeFileSync(zwischen, text);
    try {
      if (existsSync(this.pfad)) copyFileSync(this.pfad, this.pfad + '.bak');
      renameSync(zwischen, this.pfad);
    } catch {
      // Unter Windows hält manchmal OneDrive oder ein Virenscanner die Datei
      // fest, dann schlägt das Umbenennen fehl. Lieber direkt schreiben als
      // gar nicht.
      writeFileSync(this.pfad, text);
    }
  }
}
