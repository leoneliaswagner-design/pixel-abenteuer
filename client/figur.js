// Eine Spielfigur auf dem Schirm: Schatten, Körper, Schwert, Name.
// Ob sie dem eigenen Spieler gehört oder einem anderen, ist ihr egal —
// das Spiel setzt nur x, y, richtung, laeuft und ruft hieb().

export const FARBEN = ['gruen', 'rot', 'blau', 'lila'];
export const FARBWERTE = { gruen: '#6fd16a', rot: '#ef7a6a', blau: '#6fa0f0', lila: '#c07fe6' };
const ZEILE = { unten: 0, oben: 1, links: 2, rechts: 3 };

// Wo die Hand sitzt (vom Fußpunkt aus) und wohin das Schwert in der Mitte
// des Hiebs zeigt (Grad, 0 = nach oben, im Uhrzeigersinn).
const SCHWERT = {
  unten: { dx: 5, dy: -6, winkel: 180 },
  oben: { dx: 7, dy: -18, winkel: 0 },
  links: { dx: -8, dy: -10, winkel: 270 },
  rechts: { dx: 8, dy: -10, winkel: 90 },
};

export function animationenAnlegen(szene) {
  for (const f of FARBEN)
    for (const [r, z] of Object.entries(ZEILE))
      szene.anims.create({
        key: `${f}-${r}`,
        frames: szene.anims.generateFrameNumbers(`held-${f}`, { frames: [z * 4 + 1, z * 4, z * 4 + 2, z * 4] }),
        frameRate: 9,
        repeat: -1,
      });
  szene.anims.create({ key: 'schleim', frames: szene.anims.generateFrameNumbers('schleim', { frames: [0, 1] }), frameRate: 4, repeat: -1 });
  szene.anims.create({ key: 'rauch', frames: szene.anims.generateFrameNumbers('rauch', { frames: [0, 1, 2] }), frameRate: 14 });
}

export class Figur {
  constructor(szene, farbe, name) {
    this.szene = szene;
    this.farbe = farbe;
    this.x = 0;
    this.y = 0;
    this.richtung = 'unten';
    this.laeuft = false;
    this.hiebBis = 0;
    this.unverwundbar = false;
    this.tot = false;
    this.schatten = szene.add.image(0, 0, 'schatten');
    this.koerper = szene.add.sprite(0, 0, `held-${farbe}`, 0).setOrigin(0.5, 1);
    this.schwert = szene.add.image(0, 0, 'schwert').setOrigin(0.5, 0.9).setVisible(false);
    this.schild = name
      ? szene.add.text(0, 0, name, { fontFamily: 'monospace', fontSize: '8px', color: FARBWERTE[farbe], stroke: '#1b1424', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(5000)
      : null;
  }

  hieb(richtung, dauer) {
    this.richtung = richtung;
    this.hiebBis = this.szene.time.now + dauer;
    const s = SCHWERT[richtung];
    this.schwert.setVisible(true);
    this.szene.tweens.killTweensOf(this.schwert);
    this.szene.tweens.add({ targets: this.schwert, angle: { from: s.winkel - 100, to: s.winkel + 35 }, duration: dauer * 0.55, ease: 'Quad.Out' });
  }

  aktualisieren(jetzt) {
    const { x, y } = this;
    const z = ZEILE[this.richtung];
    this.schatten.setPosition(x, y).setDepth(9);
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
      if (this.laeuft) this.koerper.anims.play(`${this.farbe}-${this.richtung}`, true);
      else {
        this.koerper.anims.stop();
        this.koerper.setFrame(z * 4);
      }
    }
    if (!this.tot) this.koerper.setAlpha(this.unverwundbar && Math.floor(jetzt / 70) % 2 ? 0.25 : 1);
    this.schild?.setPosition(Math.round(x), Math.round(y - 32));
  }

  zerstoeren() {
    this.szene.tweens.killTweensOf(this.schwert);
    for (const t of [this.schatten, this.koerper, this.schwert, this.schild]) t?.destroy();
  }
}
