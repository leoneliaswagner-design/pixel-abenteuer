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

    // Die Klassen-Fähigkeit unten links: Taste und Name, darunter ein Balken,
    // der sich füllt, bis sie wieder geht.
    this.faehigkeitText = this.add.text(6, h - 10, '', schrift).setOrigin(0, 1);
    this.faehigkeitBalken = this.add.rectangle(6, h - 6, 0, 2, 0xe8c15a).setOrigin(0, 0.5);
    this.faehigkeit = spiel.faehigkeitAngabe?.() ?? null;
    spiel.events.on('faehigkeit', (f) => (this.faehigkeit = f));

    // Kompass (nur auf See): unten links, wo sonst die Fähigkeit steht.
    this.kompass = this.add.graphics().setVisible(false);
    this.kompassText = this.add.text(72, h - 38, '', schrift).setOrigin(0, 0.5).setVisible(false);
    this.kompassZeichen = ['N', 'O', 'S', 'W'].map((z) => this.add.text(0, 0, z, { ...schrift, color: '#3e2a1c', stroke: '#f4e4c0' }).setOrigin(0.5).setVisible(false));

    // Stufe neben den Herzen, darunter ein Balken bis zur nächsten.
    this.stufeText = this.add.text(0, 12, '', schrift).setOrigin(0, 0.5);
    this.balkenGrund = this.add.rectangle(6, 22, 60, 3, 0x1b1424).setOrigin(0, 0.5);
    this.balken = this.add.rectangle(7, 22, 0, 1, 0x8ee05a).setOrigin(0, 0.5);
    this.aufstiegText = this.add.text(b / 2, h / 2 - 30, '', { ...schrift, fontSize: '16px', color: '#ffd84a', strokeThickness: 4 }).setOrigin(0.5).setAlpha(0);
    const c = spiel.charakter;
    this.stufe = { stufe: c?.stufe ?? 1, fortschritt: c?.fortschritt ?? [0, 1] };
    spiel.events.on('stufe', (st) => {
      this.stufe = st;
      this.stufeZeigen();
      if (st.aufstieg) this.aufstiegZeigen(st.stufe);
    });
    spiel.events.on('stand', (s) => this.zeigen(s));
    spiel.events.on('nachricht', (text) => this.melden(text));
    spiel.events.on('getrennt', () => {
      this.mitte.setText('Verbindung verloren.\nSeite neu laden, um weiterzuspielen.').setAlign('center');
    });
  }

  zeigen({ leben, max, tot, spieler, meineId }) {
    const anzahl = Math.ceil(max / 2);
    while (this.herzen.length < anzahl) this.herzen.push(this.add.image(12 + this.herzen.length * 14, 12, 'herz', 0));
    // Weniger Herzen (Rüstung abgelegt): die überzähligen ausblenden.
    this.herzen.forEach((herz, i) => herz.setVisible(i < anzahl).setFrame(leben >= (i + 1) * 2 ? 0 : leben === i * 2 + 1 ? 1 : 2));
    if (this.herzAnzahl !== anzahl) {
      this.herzAnzahl = anzahl;
      this.stufeZeigen();
    }

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

  stufeZeigen() {
    const breite = Math.max(48, (this.herzAnzahl ?? 3) * 14 - 2);
    this.stufeText.setPosition(6 + (this.herzAnzahl ?? 3) * 14 + 2, 12).setText(`St. ${this.stufe.stufe}`);
    const [hat, braucht] = this.stufe.fortschritt;
    this.balkenGrund.width = breite;
    this.balken.width = Math.round((breite - 2) * Math.min(1, hat / braucht));
  }

  aufstiegZeigen(stufe) {
    this.tweens.killTweensOf(this.aufstiegText);
    this.aufstiegText.setText(`Stufe ${stufe}!`).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: this.aufstiegText, scale: 1, duration: 250, ease: 'Back.Out' });
    this.tweens.add({ targets: this.aufstiegText, alpha: 0, delay: 1800, duration: 500 });
  }

  // Für den Prüfstand: Stufe, Balken in Bildpunkten, ob die Aufstiegs-Schrift steht.
  stufenStand() {
    return { text: this.stufeText.text, balken: this.balken.width, voll: this.balkenGrund.width - 2, aufstieg: this.aufstiegText.alpha > 0.5 ? this.aufstiegText.text : '' };
  }

  update() {
    const spiel = this.scene.get('spiel');
    const meer = !!spiel.meer;
    this.kompassMalen(meer, spiel.kurs ?? 0, spiel.ich && Math.hypot(spiel.bootV?.x ?? 0, spiel.bootV?.y ?? 0) > 8);
    const f = meer ? null : this.faehigkeit;
    this.faehigkeitText.setVisible(!!f);
    this.faehigkeitBalken.setVisible(!!f);
    if (!f) return;
    const rest = Math.max(0, f.bereitBis - this.scene.get('spiel').time.now);
    this.faehigkeitText.setText(`Q ${f.name}`).setAlpha(rest ? 0.5 : 1);
    this.faehigkeitBalken.width = this.faehigkeitText.width * (1 - rest / f.dauer);
  }

  // Ein Kompass: Rose mit N oben, die Nadel zeigt den Kurs des Boots.
  // Norden ist auf dem Schirm immer oben — der Kompass sagt also, wohin man
  // fährt, und die Weltkarte (ohne eigenen Punkt) muss man selbst lesen.
  kompassMalen(an, kurs, faehrt) {
    const g = this.kompass, cx = 40, cy = this.scale.height - 38, r = 22;
    g.setVisible(an);
    this.kompassText.setVisible(an);
    this.kompassZeichen.forEach((t) => t.setVisible(an));
    if (!an) return;
    g.clear();
    g.fillStyle(0x5a3820).fillCircle(cx, cy, r + 3);
    g.fillStyle(0xf4e4c0).fillCircle(cx, cy, r);
    g.lineStyle(1, 0xc99560).strokeCircle(cx, cy, r - 6);
    const w = ((kurs - 90) * Math.PI) / 180;
    g.lineStyle(3, 0xc84030).lineBetween(cx, cy, cx + Math.cos(w) * (r - 5), cy + Math.sin(w) * (r - 5));
    g.lineStyle(3, 0x3e2a1c).lineBetween(cx, cy, cx - Math.cos(w) * (r - 10), cy - Math.sin(w) * (r - 10));
    g.fillStyle(0x3e2a1c).fillCircle(cx, cy, 2);
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], i) => this.kompassZeichen[i].setPosition(cx + dx * (r + 9), cy + dy * (r + 9)));
    const himmel = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((((kurs % 360) + 360) % 360) / 45) % 8];
    this.kompassText.setPosition(cx + r + 22, cy).setText(faehrt ? `Kurs ${himmel}` : 'treibt');
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
    // Der Heiltrank mit seiner Taste: so sieht man, dass 1 ihn trinkt.
    const eintraege = [['gold', 0, inventar.gold], ['schluessel', 1, gruppe.schluessel], ['rissstein', 2, gruppe.rissstein], ['idol', 10, gruppe.idol], ['eule', 11, gruppe.eule], ['heiltrank', 3, inventar.heiltrank]];
    let x = 6;
    for (const [art, bild, anzahl] of eintraege) {
      if (!anzahl) continue;
      const symbol = art === 'heiltrank' || art === 'idol' || art === 'eule'
        ? this.add.image(x - 2, 28, 'gegenstaende', bild).setOrigin(0, 0.5)
        : this.add.image(x, 28, 'symbole', bild).setOrigin(0, 0.5);
      const zahl = this.add.text(x + 14, 28, art === 'heiltrank' ? `${anzahl} [1]` : String(anzahl), { fontFamily: SCHRIFT, fontSize: '8px', color: '#f4ecd8', stroke: '#1b1424', strokeThickness: 3 }).setOrigin(0, 0.5);
      this.anzeige.push(symbol, zahl);
      this.anzeigeStand.push(`${art} ${anzahl}`);
      x += 14 + zahl.width + 8;
    }
  }

  // Für den Prüfstand.
  anzeigeText() {
    return (this.anzeigeStand ?? []).join(', ');
  }

  // ---------- Textbox: Holzrahmen mit Pergament ----------

  dialogAufbauen(b, h) {
    const box = { x: 8, y: h - 76, b: b - 16, h: 68 };
    this.dialogBox = box;
    // Holzrahmen mit Pergament, wie in Stardew Valley: außen dunkles Holz,
    // eine helle Kante innen, dann das Papier mit einem Schatten oben.
    const r = this.add.graphics();
    this.dialogRahmen = r;
    r.fillStyle(0x000000, 0.25).fillRoundedRect(box.x + 2, box.y + 3, box.b, box.h, 5);
    r.fillStyle(0x5a3820).fillRoundedRect(box.x, box.y, box.b, box.h, 5);
    r.fillStyle(0x8a5a32).fillRoundedRect(box.x + 2, box.y + 2, box.b - 4, box.h - 4, 4);
    r.fillStyle(0xc99560).fillRect(box.x + 4, box.y + 3, box.b - 8, 1);
    r.fillStyle(0x5a3820).fillRect(box.x + 5, box.y + 5, box.b - 10, box.h - 10);
    r.fillStyle(0xf4e4c0).fillRect(box.x + 6, box.y + 6, box.b - 12, box.h - 12);
    r.fillStyle(0xe2cc9c).fillRect(box.x + 6, box.y + 6, box.b - 12, 2);
    this.dialogNameFeld = this.add.text(box.x + 12, box.y - 4, '', {
      fontFamily: SCHRIFT, fontSize: '8px', color: '#fbeed0', backgroundColor: '#5a3820', padding: { x: 5, y: 4 },
    }).setOrigin(0, 0.5);
    const stil = { fontFamily: SCHRIFT, fontSize: '8px', color: '#3e2a1c', lineSpacing: 8, wordWrap: { width: box.b - 28, useAdvancedWrap: true } };
    this.dialogTextFeld = this.add.text(box.x + 14, box.y + 14, '', stil);
    // Unsichtbares Messfeld: bricht den ganzen Text so um wie die Box,
    // damit die Seiten an Zeilen- statt an Buchstabengrenzen enden.
    this.messFeld = this.add.text(0, 0, '', stil).setVisible(false);
    this.dialogPfeil = this.add.text(box.x + box.b - 14, box.y + box.h - 8, '▼', { fontFamily: SCHRIFT, fontSize: '8px', color: '#8a5a32' }).setOrigin(1, 1);
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
