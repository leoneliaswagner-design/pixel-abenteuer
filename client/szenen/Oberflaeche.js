import Phaser from 'phaser';
import { FARBWERTE } from '../figur.js';
import { SCHRIFT } from '../schrift.js';

const DIALOG_ZEILEN = 3;
const BUCHSTABEN_PRO_SEKUNDE = 45;

// Herzen, Mitspieler und Meldungen — eine eigene Szene über dem Spiel, damit
// sie nicht mit der Kamera mitwandert.
export class Oberflaeche extends Phaser.Scene {
  constructor() {
    super('oberflaeche');
  }

  create() {
    const spiel = this.scene.get('spiel');
    const { width: b, height: h } = this.scale;
    const schrift = { fontFamily: SCHRIFT, fontSize: '8px', color: '#f4ecd8', stroke: '#1b1424', strokeThickness: 3 };

    this.herzen = [];
    this.liste = this.add.text(b - 6, 6, '', { ...schrift, align: 'right' }).setOrigin(1, 0);
    // Meldungen oben, nicht unten: unten steht die Textbox. Unter der Zeile
    // mit Herzen und Mitspielern, und umbrochen — eine lange Meldung lief
    // sonst über den Rand und über die Herzen.
    this.meldung = this.add.text(b / 2, 44, '', { ...schrift, align: 'center', lineSpacing: 4, wordWrap: { width: b - 60, useAdvancedWrap: true } }).setOrigin(0.5, 0).setAlpha(0);
    this.mitte = this.add.text(b / 2, h / 2, '', { ...schrift, align: 'center', lineSpacing: 6 }).setOrigin(0.5);
    this.dialogAufbauen(b, h);
    this.anzeige = [];
    this.anzeigen({ inventar: spiel.inventar ?? {}, gruppe: spiel.gruppe ?? {} });
    spiel.events.on('inventar', (i) => this.anzeigen(i));

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

  // ---------- Was man hat: unter den Herzen ----------
  // Gold gehört dem Spieler, Schlüssel und Risssteine der Gruppe — angezeigt
  // wird beides gleich; wem es gehört, merkt man daran, wer es ausgeben kann.
  anzeigen({ inventar, gruppe }) {
    for (const t of this.anzeige) t.destroy();
    this.anzeige = [];
    this.anzeigeStand = [];
    const eintraege = [['gold', 0, inventar.gold], ['schluessel', 1, gruppe.schluessel], ['rissstein', 2, gruppe.rissstein]];
    let x = 6;
    for (const [art, bild, anzahl] of eintraege) {
      if (!anzahl) continue;
      const symbol = this.add.image(x, 28, 'symbole', bild).setOrigin(0, 0.5);
      const zahl = this.add.text(x + 14, 28, String(anzahl), { fontFamily: SCHRIFT, fontSize: '8px', color: '#f4ecd8', stroke: '#1b1424', strokeThickness: 3 }).setOrigin(0, 0.5);
      this.anzeige.push(symbol, zahl);
      this.anzeigeStand.push(`${art} ${anzahl}`);
      x += 14 + zahl.width + 8;
    }
  }

  // Für den Prüfstand.
  anzeigeText() {
    return (this.anzeigeStand ?? []).join(', ');
  }

  // ---------- Textbox wie in Link's Awakening ----------

  dialogAufbauen(b, h) {
    const box = { x: 8, y: h - 76, b: b - 16, h: 68 };
    this.dialogBox = box;
    this.dialogRahmen = this.add.graphics();
    this.dialogRahmen.fillStyle(0x1b1424, 0.94).fillRoundedRect(box.x, box.y, box.b, box.h, 4);
    this.dialogRahmen.lineStyle(2, 0xf4ecd8).strokeRoundedRect(box.x + 1, box.y + 1, box.b - 2, box.h - 2, 4);
    this.dialogNameFeld = this.add.text(box.x + 10, box.y - 6, '', {
      fontFamily: SCHRIFT, fontSize: '8px', color: '#1b1424', backgroundColor: '#e8b84a', padding: { x: 4, y: 3 },
    }).setOrigin(0, 0.5);
    const stil = { fontFamily: SCHRIFT, fontSize: '8px', color: '#f4ecd8', lineSpacing: 8, wordWrap: { width: box.b - 28, useAdvancedWrap: true } };
    this.dialogTextFeld = this.add.text(box.x + 14, box.y + 14, '', stil);
    // Unsichtbares Messfeld: bricht den ganzen Text so um wie die Box,
    // damit die Seiten an Zeilen- statt an Buchstabengrenzen enden.
    this.messFeld = this.add.text(0, 0, '', stil).setVisible(false);
    this.dialogPfeil = this.add.text(box.x + box.b - 14, box.y + box.h - 8, '▼', { fontFamily: SCHRIFT, fontSize: '8px', color: '#e8b84a' }).setOrigin(1, 1);
    this.tweens.add({ targets: this.dialogPfeil, y: '+=2', duration: 300, yoyo: true, repeat: -1 });
    this.dialogSchliessen();
  }

  dialogZeigen(name, seiten) {
    this.dialogSeiten = [];
    for (const seite of seiten) {
      const zeilen = this.messFeld.getWrappedText(seite);
      for (let i = 0; i < zeilen.length; i += DIALOG_ZEILEN) this.dialogSeiten.push(zeilen.slice(i, i + DIALOG_ZEILEN).join('\n'));
    }
    if (!this.dialogSeiten.length) this.dialogSeiten = ['…'];
    this.dialogNameFeld.setText(name).setVisible(!!name);
    for (const t of [this.dialogRahmen, this.dialogTextFeld]) t.setVisible(true);
    this.dialogSeite = 0;
    this.seiteSchreiben();
  }

  seiteSchreiben() {
    const text = this.dialogSeiten[this.dialogSeite];
    this.dialogTextFeld.setText('');
    this.dialogPfeil.setVisible(false);
    this.schreiber?.remove();
    let n = 0;
    this.schreibtNoch = true;
    this.schreiber = this.time.addEvent({
      delay: 1000 / BUCHSTABEN_PRO_SEKUNDE,
      repeat: text.length - 1,
      callback: () => {
        this.dialogTextFeld.setText(text.slice(0, ++n));
        if (n >= text.length) this.seiteFertig();
      },
    });
  }

  seiteFertig() {
    this.schreiber?.remove();
    this.schreibtNoch = false;
    this.dialogTextFeld.setText(this.dialogSeiten[this.dialogSeite]);
    this.dialogPfeil.setVisible(true);
  }

  // Taste gedrückt: erst die Seite fertig zeigen, dann die nächste, dann zu.
  // Gibt zurück, ob die Box noch offen ist.
  weiter() {
    if (this.schreibtNoch) {
      this.seiteFertig();
      return true;
    }
    if (this.dialogSeite + 1 < this.dialogSeiten.length) {
      this.dialogSeite++;
      this.seiteSchreiben();
      return true;
    }
    this.dialogSchliessen();
    return false;
  }

  dialogSchliessen() {
    this.schreiber?.remove();
    this.schreibtNoch = false;
    for (const t of [this.dialogRahmen, this.dialogTextFeld, this.dialogNameFeld, this.dialogPfeil]) t?.setVisible(false);
  }

  // Für den Prüfstand: was gerade in der Box steht.
  dialogText() {
    return this.dialogRahmen.visible ? { name: this.dialogNameFeld.text, text: this.dialogTextFeld.text, seite: this.dialogSeite, seiten: this.dialogSeiten.length } : null;
  }

  melden(text) {
    this.tweens.killTweensOf(this.meldung);
    this.meldung.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.meldung, alpha: 0, delay: 2500, duration: 600 });
  }
}
