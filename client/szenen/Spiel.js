import Phaser from 'phaser';
import { Welt, bewege } from '../../gemeinsam/welt.js';
import { Figur, FARBEN, animationenAnlegen } from '../figur.js';

const SENDE_ABSTAND = 50;

export class SpielSzene extends Phaser.Scene {
  constructor() {
    super('spiel');
  }

  init({ netz, willkommen }) {
    this.netz = netz;
    this.willkommen = willkommen;
  }

  preload() {
    // Jedes Gebiet hat seine eigene Karte; geladen wird nur, wo man steht.
    // Beim Wechsel startet die Szene neu und lädt die nächste dazu.
    this.kartenSchluessel = `karte-${this.willkommen.gebiet}`;
    if (!this.cache.tilemap.exists(this.kartenSchluessel))
      this.load.tilemapTiledJSON(this.kartenSchluessel, `karten/${this.willkommen.gebiet}.json`);
    this.load.json('werte', 'daten/werte.json');
    this.load.image('kacheln', 'grafik/kacheln.png');
    for (const n of ['baum', 'schatten', 'schwert']) this.load.image(n, `grafik/${n}.png`);
    for (const f of FARBEN) this.load.spritesheet(`held-${f}`, `grafik/held-${f}.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('schleim', 'grafik/schleim.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('herz', 'grafik/herz.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('rauch', 'grafik/rauch.png', { frameWidth: 24, frameHeight: 24 });
    this.load.spritesheet('blaetter', 'grafik/blaetter.png', { frameWidth: 8, frameHeight: 8 });
  }

  create() {
    // restart() benutzt dasselbe Szenen-Objekt wieder: alles, was beim
    // Wechsel gesetzt wurde, hier zurücksetzen. (wechselt blieb einmal
    // stehen — die Figur ließ sich in der Höhle nicht mehr bewegen.)
    this.wechselt = false;
    this.w = this.cache.json.get('werte');
    this.welt = new Welt(this.cache.tilemap.get(this.kartenSchluessel).data);
    animationenAnlegen(this);
    this.karteAufbauen();

    const wk = this.willkommen;
    this.meineId = wk.id;
    this.ich = new Figur(this, wk.farbe, null);
    this.ich.x = wk.x;
    this.ich.y = wk.y;
    this.ich.richtung = wk.r ?? 'unten';
    this.korrektur = wk.k;
    this.leben = wk.leben ?? this.w.spieler.leben;
    this.gebiet = wk.gebiet;
    this.naechsterHieb = 0;
    this.stoss = null;
    this.gesendet = { zeit: 0, x: 0, y: 0, r: '', l: false };
    for (const i of wk.geschnitten) this.buschSetzen(i, true, false);

    this.andere = new Map();
    this.gegner = new Map();
    this.herzen = new Map();

    const kamera = this.cameras.main;
    kamera.setBounds(0, 0, this.welt.breite * this.welt.kachel, this.welt.hoehe * this.welt.kachel);
    kamera.startFollow(this.ich.koerper, true, 0.2, 0.2, 0, 16);

    this.tasten = this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D');
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    // Der Hieb hört auf das Ereignis, nicht auf JustDown: Phaser vergisst
    // einen Tastendruck, wenn die Taste im selben Bild wieder losgelassen
    // wird — bei 30 Bildern pro Sekunde verschluckte das schnelles Tippen.
    this.hiebGewuenscht = false;
    for (const taste of ['SPACE', 'J']) this.input.keyboard.on(`keydown-${taste}`, (e) => !e.repeat && (this.hiebGewuenscht = true));

    this.netzAnschliessen();
    // Die Oberfläche läuft über Gebietswechsel hinweg weiter; ein zweites
    // launch hängte ihre Zuhörer doppelt an.
    if (!this.scene.isActive('oberflaeche')) this.scene.launch('oberflaeche');
    this.cameras.main.fadeIn(180, 27, 20, 36);
    this.netz.bereit();

    // Für den Prüfstand: was der Browser glaubt, ohne Pixel raten zu müssen.
    window.__spiel = {
      szene: this,
      zustand: () => ({
        gebiet: this.gebiet,
        ich: { id: this.meineId, x: this.ich.x, y: this.ich.y, leben: this.leben, tot: this.ich.tot, richtung: this.ich.richtung },
        andere: [...this.andere.entries()].map(([id, f]) => ({ id, x: f.x, y: f.y, farbe: f.farbe })),
        gegner: [...this.gegner.entries()].map(([id, g]) => ({ id, x: g.x, y: g.y, sichtbar: g.sprite.visible })),
        geschnitten: [...this.welt.geschnitten],
      }),
    };
  }

  karteAufbauen() {
    const karte = this.make.tilemap({ key: this.kartenSchluessel });
    const satz = karte.addTilesetImage('kacheln', 'kacheln');
    this.bodenEbene = karte.createLayer('boden', satz).setDepth(0);
    this.hindernisEbene = karte.createLayer('hindernisse', satz).setDepth(1);

    // Bäume sind höher als eine Kachel und müssen sich mit den Figuren nach
    // y sortieren — wer hinter einem Baum steht, verschwindet unter der Krone.
    // Das ist das „2,5D". Dafür wird die Kachel zum Sprite.
    const k = this.welt.kachel;
    this.baeume = [];
    this.welt.hindernisse.forEach((gid, i) => {
      if (!this.welt.eig(gid).baum) return;
      const tx = i % this.welt.breite, ty = Math.floor(i / this.welt.breite);
      this.hindernisEbene.removeTileAt(tx, ty);
      const fuss = ty * k + k;
      const bild = this.add.image(tx * k + k / 2, fuss + 2, 'baum').setOrigin(0.5, 76 / 80).setDepth(10 + fuss - 6);
      this.baeume.push({ bild, x: tx * k + k / 2, fuss });
    });

    const a = this.welt.gidVon('wasser'), b = this.welt.gidVon('wasser2');
    this.time.addEvent({ delay: 550, loop: true, callback: () => this.bodenEbene.swapByIndex(a, b) });
    this.gidBusch = this.welt.gidVon('busch');
    this.gidBuschRest = this.welt.gidVon('busch_rest');
  }

  buschSetzen(i, weg, mitBlaettern = true) {
    const tx = i % this.welt.breite, ty = Math.floor(i / this.welt.breite), k = this.welt.kachel;
    if (weg) this.welt.geschnitten.add(i);
    else this.welt.geschnitten.delete(i);
    this.hindernisEbene.putTileAt(weg ? this.gidBuschRest : this.gidBusch, tx, ty);
    if (weg && mitBlaettern) this.blaetter(tx * k + k / 2, ty * k + k / 2);
  }

  blaetter(x, y) {
    for (let n = 0; n < 7; n++) {
      const b = this.add.image(x, y, 'blaetter', n % 3).setDepth(10 + y + 20);
      const w = (n / 7) * Math.PI * 2;
      this.tweens.add({
        targets: b, x: x + Math.cos(w) * 22, y: y + Math.sin(w) * 14 - 6, angle: 180 * (n % 2 ? 1 : -1), alpha: 0,
        duration: 450, ease: 'Quad.Out', onComplete: () => b.destroy(),
      });
    }
  }

  rauch(x, y) {
    const r = this.add.sprite(x, y - 8, 'rauch').setDepth(10 + y + 1);
    r.play('rauch');
    r.once('animationcomplete', () => r.destroy());
  }

  netzAnschliessen() {
    const n = this.netz;
    n.bei('stand', (m) => this.standUebernehmen(m));
    n.bei('hieb', (m) => this.andere.get(m.id)?.hieb(m.r, this.w.spieler.hiebDauer));
    n.bei('getroffen', (m) => {
      this.stoss = { vx: m.vx, vy: m.vy, bis: this.time.now + m.dauer };
      this.cameras.main.shake(120, 0.006);
    });
    const zurueckSetzen = (m) => {
      this.ich.x = m.x;
      this.ich.y = m.y;
      this.korrektur = m.k;
      this.stoss = null;
    };
    n.bei('korrektur', zurueckSetzen);
    n.bei('wiederbelebt', (m) => {
      zurueckSetzen(m);
      this.ich.tot = false;
      this.cameras.main.flash(250, 255, 255, 255);
    });
    n.bei('gebiet', (m) => this.gebietWechseln(m));
    n.bei('busch', (m) => this.buschSetzen(m.i, m.weg));
    n.bei('gegner_treffer', (m) => this.aufblitzen(this.gegner.get(m.id)?.sprite));
    n.bei('gegner_tot', (m) => {
      const g = this.gegner.get(m.id);
      if (g) g.sprite.setVisible(false);
      this.rauch(m.x, m.y);
    });
    n.bei('herz_genommen', (m) => {
      this.herzen.get(m.id)?.destroy();
      this.herzen.delete(m.id);
    });
    n.bei('nachricht', (m) => this.events.emit('nachricht', m.text));
    n.bei('getrennt', () => this.events.emit('getrennt'));
  }

  // Ab sofort gehört alles, was vom Server kommt, zum neuen Gebiet. Deshalb
  // die Zuhörer gleich abhängen (sonst setzte ein Stand aus der Höhle noch
  // Gegner in die Oberwelt) und erst nach dem Abblenden neu starten.
  gebietWechseln(m) {
    this.netz.zuruecksetzen();
    this.ich.laeuft = false;
    this.wechselt = true;
    this.cameras.main.fadeOut(180, 27, 20, 36);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.restart({ netz: this.netz, willkommen: { ...this.willkommen, ...m, leben: this.leben } }));
  }

  aufblitzen(sprite) {
    if (!sprite) return;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(90, () => sprite.clearTint());
  }

  standUebernehmen(m) {
    const gesehen = new Set();
    for (const s of m.spieler) {
      if (s.id === this.meineId) {
        if (s.leben < this.leben) this.aufblitzen(this.ich.koerper);
        this.leben = s.leben;
        this.ich.unverwundbar = s.unv;
        this.ich.tot = s.tot;
        continue;
      }
      gesehen.add(s.id);
      let f = this.andere.get(s.id);
      if (!f) {
        f = new Figur(this, s.farbe, s.name);
        f.x = s.x;
        f.y = s.y;
        this.andere.set(s.id, f);
      }
      Object.assign(f, { zielX: s.x, zielY: s.y, richtung: s.r, laeuft: s.l, unverwundbar: s.unv, tot: s.tot });
    }
    for (const [id, f] of this.andere)
      if (!gesehen.has(id)) {
        f.zerstoeren();
        this.andere.delete(id);
      }

    for (const g of m.gegner) {
      let e = this.gegner.get(g.id);
      if (!e) {
        const schatten = this.add.image(g.x, g.y, 'schatten');
        const sprite = this.add.sprite(g.x, g.y, g.art).setOrigin(0.5, 1).play(g.art);
        e = { x: g.x, y: g.y, sprite, schatten };
        this.gegner.set(g.id, e);
      }
      // Ein Gegner, der wieder erscheint, springt an seinen Startpunkt —
      // nicht dorthin gleiten.
      if (!e.sprite.visible && !g.tot) {
        e.x = g.x;
        e.y = g.y;
      }
      e.zielX = g.x;
      e.zielY = g.y;
      e.sprite.setVisible(!g.tot);
      e.schatten.setVisible(!g.tot);
    }

    const da = new Set(m.herzen.map((h) => h.id));
    for (const [id, h] of this.herzen)
      if (!da.has(id)) {
        h.destroy();
        this.herzen.delete(id);
      }
    for (const h of m.herzen)
      if (!this.herzen.has(h.id)) {
        const bild = this.add.image(h.x, h.y, 'herz', 0).setDepth(10 + h.y);
        this.tweens.add({ targets: bild, y: h.y - 3, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        this.herzen.set(h.id, bild);
      }

    this.events.emit('stand', { leben: this.leben, max: this.w.spieler.leben, tot: this.ich.tot, spieler: m.spieler, meineId: this.meineId });
  }

  update(jetzt, delta) {
    if (this.wechselt) return;
    const dt = Math.min(delta, 100) / 1000;
    this.eigeneFigur(jetzt, dt);

    // Fremde Figuren gleiten zum letzten Stand vom Server. Der kommt nur
    // 20-mal pro Sekunde; ohne Gleiten ruckeln sie sichtbar.
    const f = 1 - Math.exp(-dt * 14);
    const gleiten = (e) => {
      if (e.zielX === undefined) return;
      if (Math.hypot(e.zielX - e.x, e.zielY - e.y) > 64) {
        e.x = e.zielX;
        e.y = e.zielY;
      }
      e.x += (e.zielX - e.x) * f;
      e.y += (e.zielY - e.y) * f;
    };
    for (const a of this.andere.values()) {
      gleiten(a);
      a.aktualisieren(jetzt);
    }
    // Steht jemand hinter einer Krone, wird sie durchsichtig. Sonst ist man
    // dort ganz verschwunden — nur die Kapuzenspitze schaute noch heraus.
    const figuren = [this.ich, ...this.andere.values()];
    for (const b of this.baeume) {
      const dahinter = figuren.some((f) => Math.abs(f.x - b.x) < 30 && f.y < b.fuss - 6 && f.y > b.fuss - 76);
      b.bild.setAlpha(dahinter ? 0.55 : 1);
    }
    for (const g of this.gegner.values()) {
      gleiten(g);
      g.sprite.setPosition(g.x, g.y + 2).setDepth(10 + g.y);
      g.schatten.setPosition(g.x, g.y).setDepth(9);
    }
  }

  eigeneFigur(jetzt, dt) {
    const ich = this.ich, t = this.tasten, ws = this.w.spieler;
    let dx = 0, dy = 0, laeuft = false;

    if (!ich.tot) {
      if (this.stoss && jetzt < this.stoss.bis) {
        dx = this.stoss.vx * dt;
        dy = this.stoss.vy * dt;
      } else if (jetzt >= ich.hiebBis) {
        this.stoss = null;
        const ix = (t.RIGHT.isDown || t.D.isDown ? 1 : 0) - (t.LEFT.isDown || t.A.isDown ? 1 : 0);
        const iy = (t.DOWN.isDown || t.S.isDown ? 1 : 0) - (t.UP.isDown || t.W.isDown ? 1 : 0);
        if (ix || iy) {
          laeuft = true;
          // Schräg laufen behält die Blickrichtung, wenn sie zu einer der
          // beiden Tasten passt — sonst dreht sich die Figur bei jedem
          // Tastenwechsel, und der Hieb geht in die falsche Richtung.
          const passt = (ich.richtung === 'links' && ix < 0) || (ich.richtung === 'rechts' && ix > 0) ||
            (ich.richtung === 'oben' && iy < 0) || (ich.richtung === 'unten' && iy > 0);
          if (!passt) ich.richtung = iy ? (iy < 0 ? 'oben' : 'unten') : ix < 0 ? 'links' : 'rechts';
          const l = Math.hypot(ix, iy);
          dx = (ix / l) * ws.geschwindigkeit * dt;
          dy = (iy / l) * ws.geschwindigkeit * dt;
        }
        if (this.hiebGewuenscht && jetzt >= this.naechsterHieb) {
          ich.hieb(ich.richtung, ws.hiebDauer);
          this.naechsterHieb = jetzt + ws.hiebDauer + ws.hiebPause;
          this.netz.senden({ t: 'hieb', r: ich.richtung });
          laeuft = false;
          dx = dy = 0;
        }
      }
      if (dx || dy) {
        const neu = bewege(this.welt, ich.x, ich.y, dx, dy);
        ich.x = neu.x;
        ich.y = neu.y;
      }
    }
    // Ein Druck während des Hiebs zählt nicht für den nächsten — sonst
    // schlägt die Figur nach, ohne dass man es will.
    this.hiebGewuenscht = false;
    ich.laeuft = laeuft;
    ich.aktualisieren(jetzt);

    const g = this.gesendet;
    const anders = g.x !== ich.x || g.y !== ich.y || g.r !== ich.richtung || g.l !== laeuft;
    if (jetzt - g.zeit >= SENDE_ABSTAND && anders) {
      // Ungerundet: auf 0,1 gerundet konnte eine Figur, die an einer Wand
      // lehnt, beim Server 0,05 px in der Wand stehen — und er korrigierte.
      this.netz.senden({ t: 'pos', x: ich.x, y: ich.y, r: ich.richtung, l: laeuft, k: this.korrektur });
      Object.assign(g, { zeit: jetzt, x: ich.x, y: ich.y, r: ich.richtung, l: laeuft });
    }
  }
}
