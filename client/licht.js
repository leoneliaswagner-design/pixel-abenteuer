import Phaser from 'phaser';

// Licht wie in Necesse und Stardew: draußen Tag und Nacht, in Höhlen immer
// dunkel; Laternen, Fenster, Feuerbälle, Risse und die Spieler selbst
// leuchten. Technik: eine Fläche in Bildschirmgröße über der Welt, die das
// Bild mit der Nachtfarbe MULTIPLIZIERT. Wo Licht ist, wird weiß in die
// Fläche gestempelt — weiß mal Bild bleibt Bild.
// (Eine RenderTexture über der Karte gab es schon einmal — damals als
// Versehen, sie legte einen Schleier über alles. Hier ist das der Zweck.)

// Nachtfarbe über den Tag: 0 Mitternacht, 0,25 Morgen, 0,5 Mittag, 0,75 Abend.
const VERLAUF = [
  [0, [42, 48, 96]],
  [0.2, [42, 48, 96]],
  [0.27, [232, 160, 140]],
  [0.33, [255, 255, 255]],
  [0.68, [255, 255, 255]],
  [0.74, [240, 170, 120]],
  [0.8, [96, 80, 140]],
  [0.86, [42, 48, 96]],
  [1, [42, 48, 96]],
];
const HOEHLE = [58, 50, 84];
const INNEN = [255, 244, 228];

export function nachtfarbe(zeit) {
  for (let i = 1; i < VERLAUF.length; i++) {
    const [t1, f1] = VERLAUF[i];
    if (zeit > t1) continue;
    const [t0, f0] = VERLAUF[i - 1];
    const q = (zeit - t0) / (t1 - t0 || 1);
    return f0.map((v, k) => Math.round(v + (f1[k] - v) * q));
  }
  return VERLAUF[0][1];
}

export class Licht {
  constructor(szene, art) {
    this.szene = szene;
    this.art = art ?? 'draussen';
    if (!szene.textures.exists('lichtfleck')) {
      const c = szene.textures.createCanvas('lichtfleck', 128, 128);
      const g = c.context;
      const v = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      v.addColorStop(0, 'rgba(255,255,255,1)');
      v.addColorStop(0.45, 'rgba(255,255,255,0.75)');
      v.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = v;
      g.fillRect(0, 0, 128, 128);
      c.refresh();
    }
    const { width, height } = szene.scale;
    this.flaeche = szene.add.renderTexture(0, 0, width, height).setOrigin(0).setScrollFactor(0).setDepth(7000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.stempel = szene.make.image({ key: 'lichtfleck', add: false });
    this.quellen = [];
    this.schein = [];
    this.dunkelheit = 0;
  }

  // Feste Lichter (Laternen, Fenster): leuchten nachts, und um sie liegt ein
  // warmer Schein (ADD), der am Tag verschwindet.
  fest(x, y, radius, farbe, schein = 0) {
    this.quellen.push({ x, y, radius, farbe });
    if (schein) this.schein.push(this.szene.add.image(x, y, 'lichtfleck').setScale(schein / 64).setTint(farbe).setBlendMode(Phaser.BlendModes.ADD).setDepth(6999).setAlpha(0));
  }

  farbe(zeit) {
    if (this.art === 'innen') return INNEN;
    if (this.art === 'dunkel') return HOEHLE;
    return nachtfarbe(zeit);
  }

  // bewegte: [{x, y, radius, farbe}] — Spieler, Feuerbälle, Risse.
  zeichnen(zeit, bewegte) {
    const f = this.farbe(zeit);
    // 0 = Mittag, 1 = tiefste Nacht
    this.dunkelheit = 1 - (f[0] * 0.3 + f[1] * 0.59 + f[2] * 0.11) / 255;
    // Der Schein ist ADD: auf Gras wurde er mit voller Stärke neongrün.
    for (const s of this.schein) s.setAlpha(Math.min(0.3, this.dunkelheit * 0.45));
    if (this.dunkelheit < 0.01) {
      this.flaeche.setVisible(false);
      return;
    }
    const v = this.szene.cameras.main.worldView;
    this.flaeche.setVisible(true).clear().fill(Phaser.Display.Color.GetColor(...f));
    for (const q of [...this.quellen, ...bewegte]) {
      if (q.x + q.radius < v.x || q.x - q.radius > v.right || q.y + q.radius < v.y || q.y - q.radius > v.bottom) continue;
      this.stempel.setScale(q.radius / 64).setTint(q.farbe ?? 0xffffff).setAlpha(q.staerke ?? 1);
      this.flaeche.draw(this.stempel, q.x - v.x, q.y - v.y);
    }
  }
}
