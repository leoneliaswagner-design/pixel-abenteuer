// Fallen und die Steinkugel — zuerst für den Dschungeltempel. Alles steht
// als Punkte in der Karte („falle", „kugel_start", „kugel_ende"), die Zahlen
// in werte.json unter „fallen". Der Server entscheidet, wann Stacheln oben
// sind und wen etwas trifft; der Browser bekommt nur den Stand und malt.
import { erfuellt } from '../gemeinsam/welt.js';

export class Fallen {
  constructor(gebiet) {
    this.gebiet = gebiet;
    this.w = gebiet.w.fallen ?? {};
    const welt = gebiet.welt, k = welt.kachel;
    const kachelVon = (o) => welt.index(Math.floor(o.x / k), Math.floor(o.y / k));
    this.liste = welt.orte.filter((o) => o.name === 'falle').map((o) => ({
      art: o.eig.art, kachel: kachelVon(o), x: o.x, y: o.y, versatz: Number(o.eig.versatz ?? 0),
      richtung: o.eig.richtung ?? 'rechts', bereit: 0, schussBei: 0, gedruecktBis: 0, setzt: o.eig.setzt, meldung: o.eig.meldung,
      zurueck: o.eig.zurueck, offenBis: 0, faelltBei: 0, gefallenBis: 0,
    }));
    for (const f of this.liste) if (!this.w[f.art]) throw new Error(`Unbekannte Falle „${f.art}" in „${gebiet.name}"`);

    const start = welt.orte.find((o) => o.name === 'kugel_start');
    const ende = welt.orte.find((o) => o.name === 'kugel_ende');
    this.kugel = null;
    if (start && ende) {
      // War das Idol schon weg (Spielstand), liegt die Kugel gleich unten.
      const schon = erfuellt(start.eig.ausloeser, gebiet.spiel.zustaende());
      this.kugel = { start, ende, ausloeser: start.eig.ausloeser, z: schon ? 'liegt' : 'ruht', x: ende.x, y: schon ? ende.y : start.y, v: 0, winkel: 0, bis: 0 };
      this.kugelSperren();
    }
  }

  stachelnOben(f, jetzt) {
    const s = this.w.stacheln;
    return (((jetzt + f.versatz) % s.periode) + s.periode) % s.periode < s.oben;
  }

  kugelSperren() {
    this.gebiet.welt.kugelSperren(this.kugel.x, this.kugel.y, this.kugel.z);
  }

  schritt(dt, jetzt, hier) {
    const g = this.gebiet, welt = g.welt, k = welt.kachel;
    const fussKachel = (s) => welt.index(Math.floor(s.x / k), Math.floor((s.y - 2) / k));
    for (const f of this.liste) {
      if (f.art === 'stacheln') {
        if (!this.stachelnOben(f, jetzt)) continue;
        for (const s of hier)
          if (!s.tot && jetzt >= s.unverwundbarBis && fussKachel(s) === f.kachel)
            // Der Stoß geht von der Kachelmitte weg — man fliegt dorthin zurück, woher man kam.
            g.spiel.spielerTreffen(s, { x: f.x, y: f.y + 6 + (s.y - 8 < f.y ? 4 : -4), w: { schaden: this.w.stacheln.schaden } }, jetzt, 'falle');
      } else if (f.art === 'pfeile') {
        const p = this.w.pfeile;
        if (f.schussBei && jetzt >= f.schussBei) {
          f.schussBei = 0;
          this.pfeilAbfeuern(f, p);
        }
        if (jetzt < f.bereit) continue;
        const s = hier.find((s) => !s.tot && fussKachel(s) === f.kachel);
        if (!s) continue;
        // Kurz nach dem Klick, auf der Höhe dessen, der draufsteht: wer
        // das Klicken hört und weiterläuft, kommt davon.
        f.bereit = jetzt + p.abklingzeit;
        f.schussBei = jetzt + p.verzoegerung;
        f.gedruecktBis = jetzt + 500;
        f.zielY = s.y - 10;
        g.anAlle({ t: 'falle', art: 'klick', x: f.x, y: f.y });
      } else if (f.art === 'grube') {
        // Fallgrube (Grabmal): sieht aus wie Boden. Wer hineintritt, fällt,
        // nimmt Schaden und klettert am Anfang des Gangs wieder heraus
        // (Ankunft „zurueck"); offen bleibt sie eine Weile sichtbar.
        for (const s of hier) {
          if (s.tot || jetzt < s.unverwundbarBis || fussKachel(s) !== f.kachel) continue;
          f.offenBis = jetzt + this.w.grube.offen;
          g.anAlle({ t: 'falle', art: 'grube', x: f.x, y: f.y });
          g.spiel.spielerTreffen(s, { x: s.x, y: s.y, w: { schaden: this.w.grube.schaden } }, jetzt, 'gift');
          const ziel = welt.orte.find((o) => o.name === 'ankunft' && o.eig.id === f.zurueck);
          if (!s.tot && ziel) {
            [s.x, s.y] = [ziel.x, ziel.y + 8];
            g.spiel.korrigiere(s);
          }
        }
      } else if (f.art === 'einsturz') {
        // Einsturz (die falschen Gänge): ein Tritt, ein Knirschen, dann
        // kommt die Decke herunter — auf alle im Umkreis, nicht nur auf den,
        // der ausgelöst hat. Wer das Beben spürt und rennt, kommt davon.
        const e = this.w.einsturz;
        if (f.faelltBei && jetzt >= f.faelltBei) {
          f.faelltBei = 0;
          f.gefallenBis = jetzt + e.liegt;
          g.anAlle({ t: 'beben', dauer: 300, stark: 0.014 });
          for (const s of hier)
            if (!s.tot && Math.hypot(s.x - f.x, s.y - 8 - f.y) <= e.radius) {
              s.unverwundbarBis = 0;
              g.spiel.spielerTreffen(s, { x: f.x, y: f.y - 20, w: { schaden: e.schaden } }, jetzt, 'falle');
            }
        }
        if (jetzt >= f.bereit && !f.faelltBei && hier.some((s) => !s.tot && fussKachel(s) === f.kachel)) {
          f.bereit = jetzt + e.abklingzeit;
          f.faelltBei = jetzt + e.verzoegerung;
          g.anAlle({ t: 'beben', dauer: e.verzoegerung, stark: 0.004 });
        }
      } else if (f.art === 'schlund') {
        // Der Schlund des Teufelsgesichts: wer hineingeht, ist fort. Kein
        // Schutz, kein Ausweichen — nur ein Lebensretter in der Nähe.
        for (const s of hier) {
          if (s.tot || fussKachel(s) !== f.kachel) continue;
          g.anAlle({ t: 'nachricht', text: `${s.name} verschwindet im Schlund des Teufelsgesichts.` });
          g.spiel.spielerTreffen(s, { x: s.x, y: s.y, w: { schaden: 999 } }, jetzt, 'gift');
        }
      } else if (f.art === 'platte') {
        if (hier.some((s) => !s.tot && fussKachel(s) === f.kachel)) {
          if (jetzt >= f.gedruecktBis) g.anAlle({ t: 'falle', art: 'klick', x: f.x, y: f.y });
          f.gedruecktBis = jetzt + this.w.platte.dauer;
        }
      }
    }
    this.plattenPruefen(jetzt);
    if (this.kugel) this.kugelSchritt(dt, jetzt, hier);
  }

  // Bodenplatten (Akropolis): wer drauftritt, drückt sie für „dauer"
  // Millisekunden. Sind alle Platten mit demselben „setzt" zugleich unten,
  // gilt der Weltzustand — für immer, auch wenn sie wieder hochgehen.
  plattenPruefen(jetzt) {
    const platten = this.liste.filter((f) => f.art === 'platte' && f.setzt);
    for (const setzt of new Set(platten.map((f) => f.setzt))) {
      if (this.gebiet.spiel.zustaende()[setzt]) continue;
      const gruppe = platten.filter((f) => f.setzt === setzt);
      if (gruppe.every((f) => jetzt < f.gedruecktBis)) this.gebiet.spiel.zustandSetzen(setzt, gruppe.find((f) => f.meldung)?.meldung);
    }
  }

  // Der Pfeil kommt aus der Wand gegenüber seiner Flugrichtung.
  pfeilAbfeuern(f, p) {
    const welt = this.gebiet.welt, k = welt.kachel;
    const [dx, dy] = { rechts: [1, 0], links: [-1, 0], unten: [0, 1], oben: [0, -1] }[f.richtung];
    let tx = Math.floor(f.x / k), ty = Math.floor(f.y / k);
    while (!welt.istFest(tx - dx, ty - dy) && tx > 0 && ty > 0 && tx < welt.breite && ty < welt.hoehe) [tx, ty] = [tx - dx, ty - dy];
    const x = dx ? tx * k + (dx > 0 ? 2 : k - 2) : f.x;
    const y = dy ? ty * k + (dy > 0 ? 2 : k - 2) : f.zielY;
    this.gebiet.geschossAbfeuern({
      von: 'falle', feind: true, art: 'pfeil', x, y, vx: dx * p.tempo, vy: dy * p.tempo, rest: p.weite * k, schaden: p.schaden, richtung: f.richtung,
    });
  }

  kugelSchritt(dt, jetzt, hier) {
    const kg = this.kugel, w = this.w.kugel, g = this.gebiet;
    if (kg.z === 'ruht') {
      if (!erfuellt(kg.ausloeser, g.spiel.zustaende())) return;
      kg.z = 'grollt';
      kg.bis = jetzt + w.verzoegerung;
      g.anAlle({ t: 'beben', dauer: w.verzoegerung, stark: 0.004 });
      return;
    }
    if (kg.z === 'grollt') {
      if (jetzt < kg.bis) return;
      kg.z = 'rollt';
      kg.v = w.anfang;
      this.kugelSperren();
    }
    if (kg.z !== 'rollt') return;
    kg.v = Math.min(w.tempo, kg.v + w.beschleunigung * dt);
    kg.y += kg.v * dt;
    // Abrollen: Umfang 2πr — der Browser dreht die Zeichnung danach.
    kg.winkel = (kg.y - kg.start.y) / w.radius;
    if (kg.y >= kg.ende.y) {
      kg.y = kg.ende.y;
      kg.z = 'liegt';
      this.kugelSperren();
      g.anAlle({ t: 'beben', dauer: 350, stark: 0.012 });
      // Wer gerade dort steht, wo sie liegen bleibt, wird zur Seite geschoben —
      // sonst stünde er in gesperrten Kacheln fest.
      for (const s of hier) if (!g.welt.frei(s.x, s.y)) g.spiel.freiSchieben(s);
    }
    for (const s of hier) {
      if (s.tot || jetzt < s.unverwundbarBis) continue;
      if (Math.abs(s.x - kg.x) > w.radius || Math.abs(s.y - 8 - kg.y) > w.radius) continue;
      // Getroffen wird man nach vorn, in Rollrichtung — weg von der Kugel.
      g.spiel.spielerTreffen(s, { x: s.x, y: s.y - 12, w: { schaden: w.schaden } }, jetzt, 'falle');
    }
  }

  stand(jetzt) {
    const kg = this.kugel;
    return {
      // Eine Platte, deren Rätsel gelöst ist, bleibt unten.
      fallen: this.liste.map((f) => (f.art === 'stacheln' ? this.stachelnOben(f, jetzt)
        : f.art === 'grube' ? jetzt < f.offenBis
          : f.art === 'einsturz' ? jetzt < f.gefallenBis
            : f.art === 'schlund' ? false
              : jetzt < f.gedruecktBis || (f.art === 'platte' && this.gebiet.spiel.zustaende()[f.setzt])) ? 1 : 0),
      kugel: kg && { x: kg.x, y: Math.round(kg.y * 10) / 10, z: kg.z, w: Math.round(kg.winkel * 100) / 100 },
    };
  }
}
