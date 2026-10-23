import Phaser from 'phaser';
import { FARBWERTE } from '../figur.js';

// Herzen, Mitspieler und Meldungen — eine eigene Szene über dem Spiel, damit
// sie nicht mit der Kamera mitwandert.
export class Oberflaeche extends Phaser.Scene {
  constructor() {
    super('oberflaeche');
  }

  create() {
    const spiel = this.scene.get('spiel');
    const { width: b, height: h } = this.scale;
    const schrift = { fontFamily: 'monospace', fontSize: '8px', color: '#f4ecd8', stroke: '#1b1424', strokeThickness: 3 };

    this.herzen = [];
    this.liste = this.add.text(b - 6, 6, '', { ...schrift, align: 'right' }).setOrigin(1, 0);
    this.meldung = this.add.text(b / 2, h - 10, '', schrift).setOrigin(0.5, 1).setAlpha(0);
    this.mitte = this.add.text(b / 2, h / 2, '', { ...schrift, fontSize: '12px' }).setOrigin(0.5);

    spiel.events.on('stand', (s) => this.zeigen(s));
    spiel.events.on('nachricht', (text) => this.melden(text));
    spiel.events.on('getrennt', () => {
      this.mitte.setText('Verbindung verloren.\nSeite neu laden, um weiterzuspielen.').setAlign('center');
    });
  }

  zeigen({ leben, max, tot, spieler, meineId }) {
    const anzahl = Math.ceil(max / 2);
    while (this.herzen.length < anzahl) this.herzen.push(this.add.image(12 + this.herzen.length * 14, 12, 'herz', 0));
    this.herzen.forEach((herz, i) => herz.setFrame(leben >= (i + 1) * 2 ? 0 : leben === i * 2 + 1 ? 1 : 2));

    // Phaser-Text kennt keine Farbe pro Zeile; deshalb steht vor jedem
    // Namen ein Punkt in der Farbe seiner Tunika.
    if (spieler.length > 1) {
      this.liste.setText(spieler.map((s) => `${s.name}${s.id === meineId ? ' (du)' : ''} ${'♥'.repeat(Math.ceil(s.leben / 2))}`).join('\n'));
      this.listePunkte(spieler);
    } else {
      this.liste.setText('');
      this.listePunkte([]);
    }
    if (!this.mitte.text.startsWith('Verbindung')) this.mitte.setText(tot ? 'Besiegt — gleich geht es weiter …' : '');
  }

  listePunkte(spieler) {
    this.punkte ??= [];
    while (this.punkte.length < spieler.length) this.punkte.push(this.add.rectangle(0, 0, 4, 4, 0xffffff));
    this.punkte.forEach((p, i) => {
      const s = spieler[i];
      p.setVisible(!!s);
      if (!s) return;
      p.setFillStyle(Phaser.Display.Color.HexStringToColor(FARBWERTE[s.farbe]).color);
      p.setPosition(this.liste.x - this.liste.width - 6, this.liste.y + 6 + i * (this.liste.height / spieler.length));
    });
  }

  melden(text) {
    this.tweens.killTweensOf(this.meldung);
    this.meldung.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.meldung, alpha: 0, delay: 2500, duration: 600 });
  }
}
