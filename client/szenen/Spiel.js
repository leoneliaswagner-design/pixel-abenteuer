import Phaser from 'phaser';
import { Welt, bewege, erfuellt } from '../../gemeinsam/welt.js';
import { Figur, FARBEN, ZEILE, animationenAnlegen } from '../figur.js';
import { SCHRIFT } from '../schrift.js';
import { kantenBerechnen } from '../kanten.js';
import { Fenster } from '../fenster.js';

const SENDE_ABSTAND = 50;
// Geschosse zeigen im Bild nach rechts; so weit werden sie gedreht.
const WINKEL = { rechts: 0, unten: 90, links: 180, oben: 270 };
const GESCHOSS_BILD = { dolch: 0, pfeil: 1, feuerball: 2 };

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
    this.load.json('gegenstaende', 'daten/gegenstaende.json');
    this.load.spritesheet('gegenstaende', 'grafik/gegenstaende.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('kacheln', 'grafik/kacheln.png');
    for (const n of ['baum', 'schatten', 'schwert', 'schild']) this.load.image(n, `grafik/${n}.png`);
    this.load.spritesheet('truhe', 'grafik/truhe.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('kanten', 'grafik/kanten.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('tuer', 'grafik/tuer.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('riss', 'grafik/riss.png', { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('symbole', 'grafik/symbole.png', { frameWidth: 12, frameHeight: 12 });
    // Aussehen der Leute in der Welt — welche es gibt, steht in werte.json.
    // Die lädt beim ersten Mal im selben Durchgang; also erst nachladen,
    // wenn sie da ist. (Vorher wurde nur der alte Mann geladen, und alle
    // Bewohner von Riftside sahen aus wie er.)
    const leuteLaden = (werte) => {
      for (const a of werte.aussehen ?? [])
        if (!this.textures.exists(`figur-${a}`)) this.load.spritesheet(`figur-${a}`, `grafik/figur-${a}.png`, { frameWidth: 32, frameHeight: 32 });
    };
    if (this.cache.json.exists('werte')) leuteLaden(this.cache.json.get('werte'));
    else this.load.once('filecomplete-json-werte', (schluessel, art, werte) => leuteLaden(werte));
    for (const f of FARBEN) this.load.spritesheet(`held-${f}`, `grafik/held-${f}.png`, { frameWidth: 32, frameHeight: 32 });
    // Ein Blatt je Klasse und Farbe. Eine Homebrew-Klasse ohne Bild lädt
    // ins Leere und läuft dann im Umhang der Farbe (s. Figur).
    for (const k of Object.keys(this.willkommen.auswahl?.klassen ?? {}))
      for (const f of FARBEN)
        if (!this.textures.exists(`held-${k}-${f}`)) this.load.spritesheet(`held-${k}-${f}`, `grafik/held-${k}-${f}.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('geschosse', 'grafik/geschosse.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('funke', 'grafik/funke.png');
    // Monster: welche es gibt, steht in monster.json — geladen wie die Leute.
    this.load.json('monster', 'daten/monster.json');
    const monsterLaden = (liste) => {
      for (const art of Object.keys(liste))
        if (!this.textures.exists(art)) this.load.spritesheet(art, `grafik/${art}.png`, { frameWidth: 32, frameHeight: 32 });
    };
    if (this.cache.json.exists('monster')) monsterLaden(this.cache.json.get('monster'));
    else this.load.once('filecomplete-json-monster', (schluessel, art, liste) => monsterLaden(liste));
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
    this.charakter = wk.charakter;
    this.ich = new Figur(this, wk.farbe, null, wk.charakter?.klasse);
    // Tempo und Herzen aus Klasse und Spezies; ohne (alter Spielstand im
    // Prüfstand) die Grundwerte.
    this.tempo = wk.charakter?.werte.tempo ?? this.w.spieler.geschwindigkeit;
    this.maxLeben = wk.charakter?.werte.maxLeben ?? this.w.spieler.leben;
    // Nicht in create zurücksetzen: sonst wäre die Abklingzeit nach jedem
    // Gebietswechsel vorbei.
    this.faehigkeitBereit ??= 0;
    this.geschosse = new Map();
    this.funken = 0;
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
    this.zustaende = wk.zustaende ?? {};
    for (const t of wk.tueren ?? []) this.welt.geoeffnet.add(t);
    this.dingeAufbauen(wk.offen ?? [], wk.blicke ?? {});
    this.risseAufbauen();
    this.inventar = wk.inventar ?? {};
    this.ausruestung = wk.ausruestung ?? {};
    this.gruppe = wk.gruppe ?? {};
    // Ein Fenster für das ganze Spiel: die Szene startet bei jedem
    // Gebietswechsel neu, das HTML darunter bleibt.
    this.fenster ??= new Fenster(() => this.fensterDaten(), (m) => this.netz.senden(m), () => (this.fensterZu = this.time.now));
    this.fenster.schliessen();
    this.fensterZu = 0;
    const knopf = document.getElementById('rucksack-knopf');
    if (knopf) {
      knopf.hidden = false;
      knopf.onclick = () => this.rucksackUmschalten();
    }
    this.dialogOffen = false;
    this.oberflaeche()?.dialogSchliessen?.();

    this.andere = new Map();
    this.gegner = new Map();
    this.herzen = new Map();

    const kamera = this.cameras.main;
    // Ein Raum, der kleiner ist als der Bildschirm, steht in der Mitte —
    // Phaser macht das nicht von selbst; die Hafenmeisterei klebte links.
    const kb = this.welt.breite * this.welt.kachel, kh = this.welt.hoehe * this.welt.kachel;
    const { width: sb, height: sh } = this.scale;
    kamera.setBounds(Math.min(0, (kb - sb) / 2), Math.min(0, (kh - sh) / 2), Math.max(kb, sb), Math.max(kh, sh));
    kamera.startFollow(this.ich.koerper, true, 0.2, 0.2, 0, 16);

    this.tasten = this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D');
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    // Der Hieb hört auf das Ereignis, nicht auf JustDown: Phaser vergisst
    // einen Tastendruck, wenn die Taste im selben Bild wieder losgelassen
    // wird — bei 30 Bildern pro Sekunde verschluckte das schnelles Tippen.
    this.hiebGewuenscht = false;
    for (const taste of ['SPACE', 'J']) this.input.keyboard.on(`keydown-${taste}`, (e) => !e.repeat && (this.hiebGewuenscht = true));
    // Kurz eine Richtung antippen dreht die Figur — auch wenn die Taste im
    // selben Bild wieder losgelassen ist (dann sieht isDown sie nie, und man
    // kam vor einer Figur nicht dazu, sich ihr zuzuwenden).
    this.getippt = null;
    const RICHTUNG_DER_TASTE = { UP: 'oben', W: 'oben', DOWN: 'unten', S: 'unten', LEFT: 'links', A: 'links', RIGHT: 'rechts', D: 'rechts' };
    for (const [taste, r] of Object.entries(RICHTUNG_DER_TASTE)) this.input.keyboard.on(`keydown-${taste}`, () => (this.getippt = r));
    this.faehigkeitGewuenscht = false;
    for (const taste of ['Q', 'K']) this.input.keyboard.on(`keydown-${taste}`, (e) => !e.repeat && (this.faehigkeitGewuenscht = true));
    this.input.keyboard.on('keydown-I', (e) => !e.repeat && this.rucksackUmschalten());
    this.input.keyboard.on('keydown-ESC', () => this.fenster.schliessen());
    // Schnelltaste 1: der erste Trank im Rucksack.
    this.input.keyboard.on('keydown-ONE', (e) => {
      const g = this.cache.json.get('gegenstaende');
      const art = Object.keys(this.inventar).find((a) => this.inventar[a] > 0 && g[a]?.art === 'verbrauch');
      if (!e.repeat && art && !this.ich.tot) this.netz.senden({ t: 'benutzen', art });
    });
    this.ansprechGewuenscht = false;
    for (const taste of ['E', 'ENTER']) this.input.keyboard.on(`keydown-${taste}`, (e) => !e.repeat && (this.ansprechGewuenscht = true));
    // Kleines „E" über dem Ding, vor dem man steht — damit man weiß, dass es
    // etwas zu lesen oder zu öffnen gibt.
    this.hinweis = this.add.text(0, 0, 'E', {
      fontFamily: SCHRIFT, fontSize: '8px', color: '#1b1424', backgroundColor: '#f4ecd8', padding: { x: 2, y: 2 },
    }).setOrigin(0.5, 1).setDepth(6000).setVisible(false);

    this.netzAnschliessen();
    // Die Oberfläche läuft über Gebietswechsel hinweg weiter; ein zweites
    // launch hängte ihre Zuhörer doppelt an.
    if (!this.scene.isActive('oberflaeche')) this.scene.launch('oberflaeche');
    this.cameras.main.fadeIn(180, 27, 20, 36);
    // Nach einem Gebietswechsel läuft die Oberfläche schon — sie muss den
    // Stand neu bekommen; beim ersten Start holt sie ihn sich selbst.
    this.events.emit('inventar', { inventar: this.inventar, gruppe: this.gruppe });
    this.events.emit('faehigkeit', this.faehigkeitAngabe());
    this.netz.bereit();
    // Dem Server sagen, dass man jetzt steuern kann: ab hier läuft die
    // Schonfrist (nach dem Beitreten und nach jedem Gebietswechsel).
    this.netz.senden({ t: 'bereit' });

    // Für den Prüfstand: was der Browser glaubt, ohne Pixel raten zu müssen.
    window.__spiel = {
      szene: this,
      zustand: () => ({
        gebiet: this.gebiet,
        kanten: this.kantenZahl,
        ich: {
          id: this.meineId, x: this.ich.x, y: this.ich.y, leben: this.leben, max: this.maxLeben, tot: this.ich.tot,
          richtung: this.ich.richtung, unverwundbar: this.ich.unverwundbar, klasse: this.charakter?.klasse, textur: this.ich.koerper.texture.key,
          tempo: this.tempo, faehigkeitBereit: Math.max(0, this.faehigkeitBereit - this.time.now),
        },
        andere: [...this.andere.entries()].map(([id, f]) => ({ id, x: f.x, y: f.y, farbe: f.farbe, textur: f.koerper.texture.key })),
        geschosse: [...this.geschosse.values()].map((g) => ({ art: g.art, x: g.bild.x, y: g.bild.y, winkel: g.bild.angle })),
        funken: this.funken,
        gegner: [...this.gegner.entries()].map(([id, g]) => ({
          id, x: g.x, y: g.y, sichtbar: g.sprite.visible, art: g.art, textur: g.sprite.texture.key,
          bilder: g.sprite.texture.frameTotal - 1, bild: g.sprite.frame.name, gespiegelt: g.sprite.flipX, blick: g.blick, duckt: !!g.duckt,
        })),
        geschnitten: [...this.welt.geschnitten],
        dialog: this.dialogOffen ? this.oberflaeche().dialogText() : null,
        hinweis: this.hinweis.visible,
        inventar: this.inventar,
        ausruestung: this.ausruestung,
        fenster: this.fenster.art,
        gruppe: this.gruppe,
        zustaende: this.zustaende,
        tueren: [...this.welt.geoeffnet],
        risse: this.risse.map((r) => ({ ziel: r.ort.eig.ziel, sichtbar: r.bild.visible })),
        anzeige: this.oberflaeche().anzeigeText?.(),
        truhen: [...this.dinge.values()].filter((d) => d.ding.name === 'truhe').map((d) => ({ schluessel: d.ding.schluessel, offen: d.bild.frame.name === 1 })),
        figuren: [...this.dinge.values()].filter((d) => d.ding.name === 'figur').map((d) => ({
          schluessel: d.ding.schluessel, bild: d.bild.frame.name, name: d.ding.eig.name,
          aussehen: d.ding.eig.aussehen ?? 'alter_mann', textur: d.bild.texture.key,
        })),
      }),
    };
  }

  karteAufbauen() {
    const karte = this.make.tilemap({ key: this.kartenSchluessel });
    const satz = karte.addTilesetImage('kacheln', 'kacheln');
    this.bodenEbene = karte.createLayer('boden', satz).setDepth(0);
    this.hindernisEbene = karte.createLayer('hindernisse', satz).setDepth(1);

    // Ufer und Wegränder über dem Boden. Ein Blitter ist für viele gleiche
    // Bildchen gemacht; eine RenderTexture hier legte einen dunklen Schleier
    // über die ganze Karte.
    const kanten = kantenBerechnen(this.welt);
    const k0 = this.welt.kachel;
    this.kantenBild = this.add.blitter(0, 0, 'kanten').setDepth(0.5);
    for (const kk of kanten) this.kantenBild.create(kk.x * k0, kk.y * k0, kk.bild);
    // Gezählt wird, was wirklich gezeichnet ist — nicht, was berechnet wurde.
    this.kantenZahl = this.kantenBild.children.length;

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

  fensterDaten() {
    const wk = this.willkommen, c = this.charakter;
    return {
      gegenstaende: this.cache.json.get('gegenstaende'), inventar: this.inventar, ausruestung: this.ausruestung,
      gruppe: this.gruppe, charakter: c, leben: this.leben, plaetze: this.w.inventar?.plaetze ?? 12,
      klassen: wk.auswahl?.klassen ?? {}, name: wk.name ?? '',
      klassenName: wk.auswahl?.klassen?.[c?.klasse]?.name ?? '', speziesName: wk.auswahl?.spezies?.[c?.spezies]?.name ?? '',
    };
  }

  rucksackUmschalten() {
    if (this.fenster.offen) this.fenster.schliessen();
    else if (!this.dialogOffen && !this.wechselt) this.fenster.rucksack();
  }

  oberflaeche() {
    return this.scene.get('oberflaeche');
  }

  // Schilder, Figuren, Truhen: Bilder auf der Karte, nach y sortiert wie
  // alles, was steht. Was sie sagen oder enthalten, weiß nur der Server.
  dingeAufbauen(offen, blicke) {
    this.dinge = new Map();
    const k = this.welt.kachel;
    for (const d of this.welt.dinge) {
      const fuss = Math.floor(d.y / k) * k + k;
      let bild;
      if (d.name === 'schild') bild = this.add.image(d.x, fuss, 'schild');
      else if (d.name === 'truhe') bild = this.add.image(d.x, fuss, 'truhe', offen.includes(d.schluessel) ? 1 : 0);
      else if (d.name === 'tuer') bild = this.add.image(d.x, fuss, 'tuer', this.welt.geoeffnet.has(d.schluessel) ? 1 : 0);
      else {
        const art = `figur-${d.eig.aussehen ?? 'alter_mann'}`;
        const schluessel = this.textures.exists(art) ? art : 'figur-alter_mann';
        this.add.image(d.x, fuss - 2, 'schatten').setDepth(9);
        bild = this.add.image(d.x, fuss, schluessel, ZEILE[blicke[d.schluessel] ?? d.eig.richtung ?? 'unten'] * 4);
      }
      bild.setOrigin(0.5, 1).setDepth(10 + fuss - 4);
      this.dinge.set(d.schluessel, { ding: d, bild });
    }
  }

  // Dimensionsrisse: Übergänge mit art „riss" bekommen ein flimmerndes
  // Bild. Sichtbar nur, solange ihre Bedingung gilt — dieselbe Prüfung wie
  // auf dem Server, sonst sähe man einen Riss, der einen nicht durchlässt.
  risseAufbauen() {
    this.risse = this.welt.orte
      .filter((o) => o.name === 'uebergang' && o.eig.art === 'riss')
      .map((ort) => {
        const fuss = ort.y + ort.h;
        const bild = this.add.sprite(ort.x + ort.b / 2, fuss + 4, 'riss').setOrigin(0.5, 1).setDepth(10 + fuss).play('riss');
        this.tweens.add({ targets: bild, alpha: 0.7, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        bild.setVisible(erfuellt(ort.eig.bedingung, this.zustaende));
        return { ort, bild };
      });
  }

  risseAktualisieren() {
    for (const r of this.risse) {
      const offen = erfuellt(r.ort.eig.bedingung, this.zustaende);
      if (offen || !r.bild.visible) {
        r.bild.setVisible(offen);
        continue;
      }
      // Er schließt sich: zusammenziehen, dann weg.
      this.tweens.add({ targets: r.bild, scaleX: 0, duration: 700, ease: 'Back.In', onComplete: () => r.bild.setVisible(false).setScale(1) });
    }
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

  funkeln(x, y) {
    for (let i = 0; i < 6; i++) {
      const w = (i / 6) * Math.PI * 2;
      const f = this.add.image(x + Math.cos(w) * 10, y - 12 + Math.sin(w) * 6, 'funke').setDepth(10 + y + 2);
      this.funken++;
      this.tweens.add({ targets: f, y: f.y - 18, alpha: 0, duration: 700, delay: i * 40, onComplete: () => f.destroy() });
    }
  }

  faehigkeitAngabe() {
    const f = this.charakter?.werte.faehigkeit;
    return f ? { name: f.name, bereitBis: this.faehigkeitBereit, dauer: f.abklingzeit } : null;
  }

  geschosseUebernehmen(liste) {
    const da = new Set();
    for (const p of liste) {
      da.add(p.id);
      let g = this.geschosse.get(p.id);
      if (!g) {
        // Gedreht nach der Flugrichtung — Goblins schießen auch schräg.
        const winkel = p.vx || p.vy ? (Math.atan2(p.vy, p.vx) * 180) / Math.PI : WINKEL[p.r] ?? 0;
        const bild = this.add.image(p.x, p.y, 'geschosse', GESCHOSS_BILD[p.art] ?? 0).setAngle(winkel);
        g = { art: p.art, bild };
        this.geschosse.set(p.id, g);
      }
      // Der Stand kommt nur alle 50 ms; dazwischen rechnet der Browser mit
      // vx/vy weiter (ein Pfeil sprang sonst 16 px auf einmal).
      Object.assign(g, { vx: p.vx ?? 0, vy: p.vy ?? 0 });
      g.bild.setPosition(p.x, p.y);
    }
    for (const [id, g] of this.geschosse)
      if (!da.has(id)) {
        g.bild.destroy();
        this.geschosse.delete(id);
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
    // Schildstoß: der Server schickt den Schub nach vorn wie einen Rückstoß.
    n.bei('stoss', (m) => (this.stoss = { vx: m.vx, vy: m.vy, bis: this.time.now + m.dauer }));
    n.bei('faehigkeit', (m) => {
      const f = this.andere.get(m.id);
      if (f && m.art !== 'ansturm') f.ausholen(m.r, 200);
    });
    n.bei('heilung', (m) => {
      for (const id of m.ziele) {
        const f = id === this.meineId ? this.ich : this.andere.get(id);
        if (f) this.funkeln(f.x, f.y);
      }
    });
    n.bei('geschoss_weg', (m) => {
      const g = this.geschosse.get(m.id);
      g?.bild.destroy();
      this.geschosse.delete(m.id);
      if (m.art === 'feuerball') this.rauch(m.x, m.y + 10);
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
    n.bei('truhe', (m) => {
      const d = this.dinge.get(m.ding);
      if (!d) return;
      d.bild.setFrame(m.offen ? 1 : 0);
      if (m.offen) this.tweens.add({ targets: d.bild, y: d.bild.y - 3, duration: 90, yoyo: true });
    });
    n.bei('blick', (m) => this.dinge.get(m.ding)?.bild.setFrame(ZEILE[m.r] * 4));
    n.bei('tuer', (m) => {
      if (m.offen) this.welt.geoeffnet.add(m.ding);
      this.dinge.get(m.ding)?.bild.setFrame(m.offen ? 1 : 0);
    });
    n.bei('zustand', (m) => {
      this.zustaende[m.name] = m.wert;
      this.risseAktualisieren();
    });
    n.bei('gruppe', (m) => {
      this.gruppe = m.inventar;
      this.events.emit('inventar', { inventar: this.inventar, gruppe: this.gruppe });
    });
    n.bei('inventar', (m) => {
      this.inventar = m.inventar;
      this.ausruestung = m.ausruestung;
      this.leben = m.leben;
      // Dasselbe Objekt wie in willkommen: so stimmen Tempo und Herzen auch
      // nach dem nächsten Gebietswechsel.
      if (this.charakter) this.charakter.werte = m.werte;
      this.tempo = m.werte.tempo;
      this.maxLeben = m.werte.maxLeben;
      this.events.emit('inventar', { inventar: this.inventar, gruppe: this.gruppe });
      this.fenster.aktualisieren();
    });
    n.bei('laden', (m) => {
      this.ich.laeuft = false;
      this.fenster.laden(m);
    });
    n.bei('beute', (m) => {
      const t = this.add.text(m.x, m.y - 24, `+${m.anzahl}`, { fontFamily: SCHRIFT, fontSize: '8px', color: '#ffd84a', stroke: '#1b1424', strokeThickness: 3 }).setOrigin(0.5).setDepth(6000);
      this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    });
    n.bei('dialog', (m) => {
      if (m.inventar) {
        this.inventar = m.inventar;
        this.events.emit('inventar', { inventar: this.inventar, gruppe: this.gruppe });
      }
      this.dialogOffen = true;
      this.ich.laeuft = false;
      this.oberflaeche().dialogZeigen(m.name ?? '', m.seiten);
    });
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
    this.fenster.schliessen();
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
        if (s.tot) this.fenster.schliessen();
        continue;
      }
      gesehen.add(s.id);
      let f = this.andere.get(s.id);
      if (!f) {
        f = new Figur(this, s.farbe, s.name, s.klasse);
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
        if (!this.anims.exists(g.art))
          this.anims.create({ key: g.art, frames: this.anims.generateFrameNumbers(g.art, { frames: [0, 1] }), frameRate: this.cache.json.get('monster')?.[g.art]?.bildTempo ?? 6, repeat: -1 });
        const sprite = this.add.sprite(g.x, g.y, g.art).setOrigin(0.5, 1).play(g.art);
        e = { x: g.x, y: g.y, art: g.art, sprite, schatten };
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
      // Die Bilder schauen nach links; nach rechts wird gespiegelt.
      e.blick = g.b;
      e.sprite.setFlipX(g.b === 'rechts');
      // Der Wolf duckt sich vor dem Sprung — drittes Bild, und er zittert.
      // So sieht man den Sprung kommen und kann ausweichen.
      e.duckt = g.z === 'laden';
      if (e.duckt && e.sprite.texture.has(2)) e.sprite.anims.stop(), e.sprite.setFrame(2);
      else if (!e.sprite.anims.isPlaying) e.sprite.play(g.art);
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

    this.geschosseUebernehmen(m.geschosse ?? []);
    this.events.emit('stand', { leben: this.leben, max: this.maxLeben, tot: this.ich.tot, spieler: m.spieler, meineId: this.meineId });
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
    for (const g of this.geschosse.values()) {
      g.bild.x += g.vx * dt;
      g.bild.y += g.vy * dt;
      g.bild.setDepth(20 + g.bild.y);
      if (g.art === 'feuerball') g.bild.setFrame(2 + (Math.floor(jetzt / 90) % 2));
    }
    for (const g of this.gegner.values()) {
      gleiten(g);
      g.sprite.setPosition(g.x + (g.duckt ? Math.sin(jetzt / 25) : 0), g.y + 2).setDepth(10 + g.y);
      g.schatten.setPosition(g.x, g.y).setDepth(9);
    }
  }

  eigeneFigur(jetzt, dt) {
    const ich = this.ich, t = this.tasten, ws = this.w.spieler;
    let dx = 0, dy = 0, laeuft = false;

    // Im Gespräch steht die Figur; Leertaste und E blättern weiter. Das
    // Spiel läuft für die anderen weiter — anhalten ginge online nicht.
    // Rucksack oder Laden offen: die Figur steht. Und gleich nach dem
    // Schließen zählen Tasten nicht — Enter auf „✕" sprach sonst die
    // Krämerin wieder an, und der Laden ging sofort wieder auf.
    if (this.fenster.offen || jetzt - this.fensterZu < 200) {
      this.ansprechGewuenscht = this.hiebGewuenscht = this.faehigkeitGewuenscht = false;
      this.getippt = null;
    }
    if (this.fenster.offen) {
      this.hinweis.setVisible(false);
      ich.laeuft = false;
      ich.aktualisieren(jetzt);
      return;
    }
    if (this.dialogOffen) {
      if (this.ansprechGewuenscht || this.hiebGewuenscht) this.dialogOffen = this.oberflaeche().weiter();
      this.ansprechGewuenscht = this.hiebGewuenscht = this.faehigkeitGewuenscht = false;
      this.getippt = null;
      this.hinweis.setVisible(false);
      ich.laeuft = false;
      ich.aktualisieren(jetzt);
      return;
    }

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
          dx = (ix / l) * this.tempo * dt;
          dy = (iy / l) * this.tempo * dt;
        } else if (this.getippt) ich.richtung = this.getippt;
        const ding = this.welt.dingVor(ich.x, ich.y, ich.richtung);
        if (this.ansprechGewuenscht && ding) {
          // Erst die eigene Position, dann die Frage: der Server soll vom
          // selben Fleck aus suchen wie der Browser, nicht von dem vor 50 ms.
          this.positionSenden(jetzt, false);
          this.netz.senden({ t: 'ansprechen', r: ich.richtung });
          laeuft = false;
          dx = dy = 0;
        }
        if (this.hiebGewuenscht && jetzt >= this.naechsterHieb) {
          ich.hieb(ich.richtung, ws.hiebDauer);
          this.naechsterHieb = jetzt + ws.hiebDauer + ws.hiebPause;
          this.netz.senden({ t: 'hieb', r: ich.richtung });
          laeuft = false;
          dx = dy = 0;
        }
        const f = this.charakter?.werte.faehigkeit;
        if (this.faehigkeitGewuenscht && f && jetzt >= this.faehigkeitBereit) {
          // Wie beim Ansprechen: der Server soll vom selben Fleck aus werfen.
          this.positionSenden(jetzt, false);
          this.netz.senden({ t: 'faehigkeit', r: ich.richtung });
          this.faehigkeitBereit = jetzt + f.abklingzeit;
          this.events.emit('faehigkeit', this.faehigkeitAngabe());
          if (f.art !== 'ansturm') {
            ich.ausholen(ich.richtung, 200);
            laeuft = false;
            dx = dy = 0;
          }
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
    this.ansprechGewuenscht = false;
    this.faehigkeitGewuenscht = false;
    this.getippt = null;
    ich.laeuft = laeuft;
    ich.aktualisieren(jetzt);

    const vor = !ich.tot && this.welt.dingVor(ich.x, ich.y, ich.richtung);
    this.hinweis.setVisible(!!vor);
    if (vor) this.hinweis.setPosition(vor.x, Math.floor(vor.y / this.welt.kachel) * this.welt.kachel - 2);

    this.positionSenden(jetzt, true);
  }

  positionSenden(jetzt, nurNachAbstand) {
    const ich = this.ich, g = this.gesendet;
    const anders = g.x !== ich.x || g.y !== ich.y || g.r !== ich.richtung || g.l !== ich.laeuft;
    if (!anders || (nurNachAbstand && jetzt - g.zeit < SENDE_ABSTAND)) return;
    // Ungerundet: auf 0,1 gerundet konnte eine Figur, die an einer Wand
    // lehnt, beim Server 0,05 px in der Wand stehen — und er korrigierte.
    this.netz.senden({ t: 'pos', x: ich.x, y: ich.y, r: ich.richtung, l: ich.laeuft, k: this.korrektur });
    Object.assign(g, { zeit: jetzt, x: ich.x, y: ich.y, r: ich.richtung, l: ich.laeuft });
  }
}
