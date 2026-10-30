import { SCHRIFT } from './schrift.js';

// Eine Spielfigur auf dem Schirm: Schatten, Körper, Schwert, Name.
// Ob sie dem eigenen Spieler gehört oder einem anderen, ist ihr egal —
// das Spiel setzt nur x, y, richtung, laeuft und ruft hieb().

export const FARBEN = ['gruen', 'rot', 'blau', 'lila'];
export const FARBWERTE = { gruen: '#6fd16a', rot: '#ef7a6a', blau: '#6fa0f0', lila: '#c07fe6' };
export const ZEILE = { unten: 0, oben: 1, links: 2, rechts: 3 };

// Wo die Hand sitzt (vom Fußpunkt aus) und wohin das Schwert in der Mitte
// des Hiebs zeigt (Grad, 0 = nach oben, im Uhrzeigersinn).
const SCHWERT = {
  unten: { dx: 6, dy: -12, winkel: 180 },
  oben: { dx: 8, dy: -26, winkel: 0 },
  links: { dx: -9, dy: -20, winkel: 270 },
  rechts: { dx: 9, dy: -20, winkel: 90 },
};

// Animationen gehören dem ganzen Spiel, nicht der Szene — nach einem
// Gebietswechsel sind sie schon da.
export function animationenAnlegen(szene) {
  if (szene.anims.exists('rauch')) return;
  szene.anims.create({ key: 'rauch', frames: szene.anims.generateFrameNumbers('rauch', { frames: [0, 1, 2] }), frameRate: 14 });
  szene.anims.create({ key: 'riss', frames: szene.anims.generateFrameNumbers('riss', { frames: [0, 1, 2, 3] }), frameRate: 7, repeat: -1 });
}

// Laufbilder für ein Blatt anlegen, sobald es zum ersten Mal gebraucht wird
// — welche Klassen es gibt, steht erst zur Laufzeit fest.
function laufenAnlegen(szene, textur) {
  if (szene.anims.exists(`${textur}-unten`)) return;
  for (const [r, z] of Object.entries(ZEILE))
    szene.anims.create({
      key: `${textur}-${r}`,
      frames: szene.anims.generateFrameNumbers(textur, { frames: [z * 4 + 1, z * 4, z * 4 + 2, z * 4] }),
      frameRate: 9,
      repeat: -1,
    });
}

export class Figur {
  constructor(szene, farbe, name, klasse = null) {
    this.szene = szene;
    this.farbe = farbe;
    // Klassen ohne eigenes Bild (Homebrew) laufen im Kapuzenumhang der Farbe.
    this.textur = klasse && szene.textures.exists(`held-${klasse}-${farbe}`) ? `held-${klasse}-${farbe}` : `held-${farbe}`;
    laufenAnlegen(szene, this.textur);
    this.x = 0;
    this.y = 0;
    this.richtung = 'unten';
    this.laeuft = false;
    this.hiebBis = 0;
    this.unverwundbar = false;
    this.tot = false;
    this.schatten = szene.add.image(0, 0, 'schatten');
    this.koerper = szene.add.sprite(0, 0, this.textur, 0).setOrigin(0.5, 1);
    this.schwert = szene.add.image(0, 0, 'schwert').setOrigin(0.5, 0.9).setVisible(false);
    this.schild = name
      ? szene.add.text(0, 0, name, { fontFamily: SCHRIFT, fontSize: '8px', color: FARBWERTE[farbe], stroke: '#1b1424', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(5000)
      : null;
  }

  // Auf See sitzt die Figur im Ruderboot: man sieht sie nur bis zum Gürtel
  // (Bild zugeschnitten), darunter das Boot — vorn/hinten senkrecht,
  // seitlich waagerecht.
  imBoot(an) {
    this.boot?.destroy();
    this.boot = an ? this.szene.add.sprite(0, 0, 'boot', 0) : null;
    if (an) this.koerper.setCrop(0, 0, 32, 31);
    else this.koerper.setCrop();
    this.schatten.setVisible(!an);
  }

  hieb(richtung, dauer) {
    this.richtung = richtung;
    this.hiebBis = this.szene.time.now + dauer;
    const s = SCHWERT[richtung];
    this.schwert.setVisible(true);
    this.szene.tweens.killTweensOf(this.schwert);
    this.szene.tweens.add({ targets: this.schwert, angle: { from: s.winkel - 100, to: s.winkel + 35 }, duration: dauer * 0.55, ease: 'Quad.Out' });
  }

  // Arm ausgestreckt, ohne Schwert — beim Werfen, Zaubern, Heilen.
  ausholen(richtung, dauer) {
    this.richtung = richtung;
    this.hiebBis = this.szene.time.now + dauer;
    this.schwert.setVisible(false);
  }

  aktualisieren(jetzt) {
    const { x, y } = this;
    const z = ZEILE[this.richtung];
    this.schatten.setPosition(x, y).setDepth(9);
    if (this.boot) {
      // Leichtes Schaukeln; die Figur sitzt (Stehbild, kein Laufen).
      const wippen = Math.round(Math.sin(jetzt / 320 + x * 0.01));
      const seitlich = this.richtung === 'links' || this.richtung === 'rechts';
      this.boot.setFrame(seitlich ? 1 : 0).setFlipX(this.richtung === 'links').setFlipY(this.richtung === 'unten');
      this.boot.setPosition(x, y - 12 + wippen).setDepth(10 + y - 0.5);
      this.koerper.anims.stop();
      this.koerper.setFrame(ZEILE[this.richtung] * 4).setAngle(0).setAlpha(1);
      this.koerper.setPosition(x, y + 2 + wippen + 8).setDepth(10 + y);
      this.schwert.setVisible(false);
      this.schild?.setPosition(Math.round(x), Math.round(y - 40));
      return;
    }
    this.koerper.setPosition(x, y + 2).setDepth(10 + y);

    if (this.tot) {
      this.koerper.anims.stop();
      this.koerper.setFrame(0).setAngle(90).setAlpha(0.6);
      this.schwert.setVisible(false);
    } else if (jetzt < this.hiebBis) {
      this.koerper.anims.stop();
      this.koerper.setFrame(z * 4 + 3).setAngle(0);
      const s = SCHWERT[this.richtung];
      this.schwert.setPosition(x + s.dx, y + s.dy).setDepth(10 + y + (this.richtung === 'oben' ? -0.5 : 0.5));
    } else {
      this.schwert.setVisible(false);
      this.koerper.setAngle(0);
      if (this.laeuft) this.koerper.anims.play(`${this.textur}-${this.richtung}`, true);
      else {
        this.koerper.anims.stop();
        this.koerper.setFrame(z * 4);
      }
    }
    // Leerer Körper: durchscheinend statt Blinken. Rausch: rot getönt —
    // für alle sichtbar, der Stand schickt es mit („e").
    const leer = this.effekt?.includes('l'), rot = this.effekt?.includes('r');
    if (!this.tot) this.koerper.setAlpha(leer ? 0.35 : this.unverwundbar && Math.floor(jetzt / 70) % 2 ? 0.25 : 1);
    if (rot) this.koerper.setTint(0xff6a50);
    else if (this.getoent) this.koerper.clearTint();
    this.getoent = rot;
    this.schild?.setPosition(Math.round(x), Math.round(y - 48));
  }

  zerstoeren() {
    this.szene.tweens.killTweensOf(this.schwert);
    for (const t of [this.schatten, this.koerper, this.schwert, this.schild, this.boot]) t?.destroy();
  }
}
