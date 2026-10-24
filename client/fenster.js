import { PLAETZE, PLATZ_NAME, darfTragen, passtHinein } from '../gemeinsam/regeln.js';

// Rucksack, Laden und Weltkarte: HTML über dem Spiel, nicht in Phaser — Beschreibungen
// brechen von selbst um, Knöpfe gehen mit Maus, Finger und Enter, und am
// Handy lässt sich das Fenster scrollen.
//
// Das Fenster zeigt nur an und fragt den Server. Was geht, entscheidet er;
// gesperrte Knöpfe sagen hier aber schon, warum — eine graue Fläche allein
// erklärt nichts.

const html = (t) => String(t).replace(/[&<>"]/g, (z) => `&#${z.charCodeAt(0)};`);
const BONI = { schaden: 'Schwertschaden', leben: 'halbe Herzen', tempo: 'Tempo', faehigkeit: 'Stärke der Fähigkeit' };

export class Fenster {
  // daten() liefert, was gezeigt wird: gegenstaende, inventar, ausruestung,
  // gruppe, charakter, klassen, plaetze, name. senden(m) schickt an den Server.
  constructor(daten, senden, schliessen) {
    this.daten = daten;
    this.senden = senden;
    this.beimSchliessen = schliessen;
    this.wurzel = document.getElementById('fenster');
    this.art = null; // 'rucksack' | 'laden' | 'weltkarte'
    this.nah = true; // Weltkarte: Umgebung (vergrößert) oder ganze Welt
    this.gewaehlt = null;
    this.angebot = null;
    this.wurzel.addEventListener('click', (e) => this.klick(e));
  }

  get offen() {
    return !!this.art;
  }

  rucksack() {
    this.art = 'rucksack';
    this.zeichnen();
  }

  laden(angebot) {
    this.art = 'laden';
    this.angebot = angebot;
    this.gewaehlt = null;
    this.zeichnen();
  }

  // stand: { entdeckt: [Region…], spieler: [{ id, name, farbe, gebiet }] }
  weltkarte(stand) {
    this.art = 'weltkarte';
    this.karte = stand;
    this.zeichnen();
  }

  schliessen() {
    if (!this.art) return;
    this.art = null;
    this.gewaehlt = null;
    this.wurzel.hidden = true;
    this.wurzel.innerHTML = '';
    this.beimSchliessen?.();
  }

  // Neuer Stand vom Server: neu zeichnen, die Auswahl bleibt, solange es
  // das Ding noch gibt.
  aktualisieren() {
    if (this.art) this.zeichnen();
  }

  klick(e) {
    const k = e.target.closest('[data-tun]');
    if (!k || k.disabled) return;
    const { tun, art, platz } = k.dataset;
    if (tun === 'schliessen') this.schliessen();
    else if (tun === 'zoom') {
      this.nah = !this.nah;
      this.zeichnen();
    }
    else if (tun === 'waehlen') {
      this.gewaehlt = art;
      this.zeichnen();
    } else this.senden({ t: tun, art, platz });
  }

  symbol(art, gross = false) {
    const g = this.daten().gegenstaende[art];
    const n = Math.max(...Object.values(this.daten().gegenstaende).map((x) => x.bild ?? 0)) + 1;
    const f = gross ? 3 : 2;
    return `<span class="symbol${gross ? ' gross' : ''}" style="background-size:${n * 16 * f}px ${16 * f}px;background-position:-${(g?.bild ?? 0) * 16 * f}px 0"></span>`;
  }

  zeichnen() {
    const d = this.daten();
    this.wurzel.hidden = false;
    if (this.gewaehlt && !(d.inventar[this.gewaehlt] > 0) && !Object.values(d.ausruestung).includes(this.gewaehlt)) this.gewaehlt = null;
    const inhalt = { laden: () => this.ladenHtml(d), weltkarte: () => this.weltkarteHtml(d), rucksack: () => this.rucksackHtml(d) }[this.art]();
    const titel = { laden: 'Laden', weltkarte: 'Weltkarte', rucksack: 'Rucksack' }[this.art];
    this.wurzel.innerHTML = `<div class="kasten${this.art === 'weltkarte' ? ' breit' : ''}" role="dialog" aria-label="${titel}">${inhalt}</div>`;
    if (this.art === 'weltkarte') this.nebelMalen(d);
    // Fokus in das Fenster, damit Enter die Knöpfe trifft und nicht das Spiel.
    (this.wurzel.querySelector('[data-fokus]') ?? this.wurzel.querySelector('button'))?.focus({ preventScroll: true });
  }

  kopf(titel, d) {
    return `<div class="kopf"><h2>${html(titel)}</h2><span class="gold">${this.symbol('gold')} ${d.inventar.gold ?? 0}</span>
      <button data-tun="schliessen" class="zu" aria-label="Schließen">✕</button></div>`;
  }

  rucksackHtml(d) {
    const w = d.charakter?.werte;
    const zeilen = [];
    zeilen.push(this.kopf('Rucksack', d));
    if (w)
      zeilen.push(`<p class="wer">${html(d.name)} — ${html(d.speziesName)}, ${html(d.klassenName)}</p>
        <p class="werte"><span>♥ ${w.maxLeben / 2} Herzen</span><span>Schwert ${w.schaden}</span><span>Tempo ${w.tempo}</span>${w.faehigkeit ? `<span>${html(w.faehigkeit.name)} ${w.faehigkeit.staerke}</span>` : ''}</p>`);
    zeilen.push('<h3>Ausrüstung</h3><div class="plaetze">');
    for (const p of PLAETZE) {
      const art = d.ausruestung[p];
      zeilen.push(art
        ? `<button class="platz voll${this.gewaehlt === art ? ' an' : ''}" data-tun="waehlen" data-art="${html(art)}">${this.symbol(art)}<span><small>${PLATZ_NAME[p]}</small>${html(d.gegenstaende[art]?.name ?? art)}</span></button>`
        : `<div class="platz leer"><span class="symbol leer"></span><span><small>${PLATZ_NAME[p]}</small>leer</span></div>`);
    }
    zeilen.push('</div>');
    const dinge = Object.entries(d.inventar).filter(([a, n]) => n > 0 && a !== 'gold' && !d.gegenstaende[a]?.gemeinsam);
    zeilen.push(`<h3>Rucksack <small>${dinge.length} von ${d.plaetze} Plätzen</small></h3><div class="raster">`);
    for (let i = 0; i < d.plaetze; i++) {
      const [art, n] = dinge[i] ?? [];
      zeilen.push(art
        ? `<button class="feld${this.gewaehlt === art ? ' an' : ''}" data-tun="waehlen" data-art="${html(art)}" aria-label="${html(d.gegenstaende[art]?.name ?? art)}, ${n}">${this.symbol(art)}${n > 1 ? `<b>${n}</b>` : ''}</button>`
        : '<span class="feld"></span>');
    }
    zeilen.push('</div>');
    const gruppe = Object.entries(d.gruppe).filter(([, n]) => n > 0);
    if (gruppe.length)
      zeilen.push(`<h3>Gehört der Gruppe</h3><p class="gruppe">${gruppe.map(([a, n]) => `<span>${this.symbol(a)} ${n} × ${html(d.gegenstaende[a]?.name ?? a)}</span>`).join('')}</p>`);
    zeilen.push(this.gewaehlt ? this.einzelheiten(d, this.gewaehlt) : '<p class="tipp">Tippe auf einen Gegenstand.</p>');
    return zeilen.join('');
  }

  // Was ein Gegenstand kann, und was man damit tun darf.
  einzelheiten(d, art) {
    const g = d.gegenstaende[art] ?? { name: art };
    const angelegt = PLAETZE.find((p) => d.ausruestung[p] === art);
    const knoepfe = [];
    if (angelegt) {
      const passt = passtHinein(d.inventar, art, d.gegenstaende, d.plaetze);
      knoepfe.push(this.knopf('Ablegen', { tun: 'ablegen', platz: angelegt }, passt ? null : 'Der Rucksack ist voll.'));
    } else if (g.platz) {
      const darf = darfTragen(g, d.charakter?.klasse);
      const wer = (g.klassen ?? []).map((k) => d.klassen[k]?.name ?? k).join(', ');
      const statt = d.ausruestung[g.platz] ? ` (statt ${d.gegenstaende[d.ausruestung[g.platz]]?.name})` : '';
      knoepfe.push(this.knopf(`Anlegen${statt}`, { tun: 'anlegen', art }, darf ? null : `Nur für: ${wer}.`));
    } else if (g.art === 'verbrauch') {
      const voll = g.wirkung?.heilung && d.leben >= d.charakter?.werte.maxLeben;
      knoepfe.push(this.knopf('Benutzen', { tun: 'benutzen', art }, voll ? 'Du bist nicht verletzt.' : null));
    }
    const boni = Object.entries(g.boni ?? {}).map(([b, n]) => `${n > 0 ? '+' : ''}${n} ${BONI[b] ?? b}`);
    if (g.wirkung?.heilung) boni.push(`heilt ${g.wirkung.heilung / 2} Herzen`);
    return `<div class="einzeln">${this.symbol(art, true)}<div><b>${html(g.name)}</b>
      <p>${html(g.beschreibung ?? '')}</p>${boni.length ? `<p class="boni">${boni.map(html).join(' · ')}</p>` : ''}
      <div class="knoepfe">${knoepfe.join('')}</div></div></div>`;
  }

  knopf(text, { tun, art = '', platz = '' }, gesperrt) {
    return `<span class="knopf"><button data-tun="${tun}" data-art="${html(art)}" data-platz="${html(platz)}" ${gesperrt ? 'disabled' : 'data-fokus'}>${html(text)}</button>${gesperrt ? `<small class="grund">${html(gesperrt)}</small>` : ''}</span>`;
  }

  ladenHtml(d) {
    const a = this.angebot;
    const gold = d.inventar.gold ?? 0;
    const zeilen = [this.kopf(a.name, d), `<p class="gruss">„${html(a.gruss)}"</p><h3>Kaufen</h3><div class="liste">`];
    for (const [art, preis] of Object.entries(a.waren)) {
      const g = d.gegenstaende[art] ?? { name: art };
      const grund = gold < preis ? `Dir fehlen ${preis - gold} Gold.`
        : !passtHinein(d.inventar, art, d.gegenstaende, d.plaetze) ? 'Der Rucksack ist voll.' : null;
      const fremd = g.klassen && !darfTragen(g, d.charakter?.klasse) ? `<small class="grund">Nur für: ${g.klassen.map((k) => html(d.klassen[k]?.name ?? k)).join(', ')}</small>` : '';
      zeilen.push(`<div class="ware">${this.symbol(art)}<span><b>${html(g.name)}</b><small>${html(g.beschreibung ?? '')}</small>${fremd}</span>
        ${this.knopf(`${preis} Gold`, { tun: 'kaufen', art }, grund)}</div>`);
    }
    zeilen.push('</div><h3>Verkaufen</h3><div class="liste">');
    const eigenes = Object.entries(d.inventar).filter(([art, n]) => n > 0 && a.ankauf[art]);
    if (!eigenes.length) zeilen.push('<p class="tipp">Nichts zum Verkaufen. Angelegtes erst im Rucksack ablegen.</p>');
    for (const [art, n] of eigenes)
      zeilen.push(`<div class="ware">${this.symbol(art)}<span><b>${html(d.gegenstaende[art]?.name ?? art)}</b><small>du hast ${n}</small></span>
        ${this.knopf(`${a.ankauf[art]} Gold`, { tun: 'verkaufen', art }, null)}</div>`);
    zeilen.push('</div>');
    return zeilen.join('');
  }

  // ---------- Weltkarte ----------
  // Das Kartenbild des Spielleiters, darüber Nebel, wo die Gruppe noch nicht
  // war. Die Punkte stehen in Bildpunkten des Kartenbilds (welt.json).

  weltkarteHtml(d) {
    const w = d.welt, k = this.karte;
    const ort = (g) => w.gebiete[g] ?? {};
    const ich = k.spieler.find((p) => p.id === d.meineId);
    const hier = ort(ich?.gebiet ?? d.gebiet);
    const z = this.nah && hier.punkt ? 5 : 1;
    this.zoom = z;
    // Ausschnitt um den eigenen Punkt, aber nie über den Kartenrand hinaus.
    const [fx, fy] = z > 1 ? [hier.punkt[0] / w.breite, hier.punkt[1] / w.hoehe] : [0.5, 0.5];
    const rand = (v) => Math.min(0, Math.max((1 - z) * 100, (0.5 - v * z) * 100));
    const nachGebiet = {};
    for (const p of k.spieler) (nachGebiet[p.gebiet] ??= []).push(p);
    const marken = [], legende = [];
    for (const [gebiet, leute] of Object.entries(nachGebiet)) {
      const o = ort(gebiet);
      leute.forEach((p, i) => {
        const wo = o.riss ? 'hinter einem Dimensionsriss' : w.regionen[o.region]?.name ?? '?';
        legende.push(`<li><span class="punkt ${html(p.farbe)}"></span>${html(p.name)}${p.id === d.meineId ? ' (du)' : ''} — ${html(wo)}</li>`);
        if (!o.punkt) return;
        // Mehrere im selben Gebiet nebeneinander, nicht übereinander.
        const x = o.punkt[0] + (i - (leute.length - 1) / 2) * (6 / z), y = o.punkt[1];
        marken.push(`<span class="marke ${html(p.farbe)}${p.id === d.meineId ? ' ich' : ''}" data-name="${html(p.name)}" style="left:${(x / w.breite) * 100}%;top:${(y / w.hoehe) * 100}%;transform:translate(-50%,-50%) scale(${1 / z})"></span>`);
      });
    }
    return `<div class="kopf"><h2>Weltkarte</h2>
      <button data-tun="zoom">${z > 1 ? 'Ganze Welt' : 'Umgebung'}</button>
      <button data-tun="schliessen" class="zu" aria-label="Schließen">✕</button></div>
      <div class="weltkarte"><div class="weltinhalt" style="transform:translate(${rand(fx)}%,${rand(fy)}%) scale(${z})">
        <img src="${html(w.bild)}" alt="Karte der Welt" draggable="false" />
        <canvas class="nebel" width="${w.breite}" height="${w.hoehe}"></canvas>
        ${marken.join('')}
      </div></div>
      <ul class="legende">${legende.join('')}</ul>
      <p class="tipp">Wo ihr gewesen seid, lichtet sich der Nebel — für die ganze Gruppe.</p>`;
  }

  nebelMalen(d) {
    const w = d.welt, c = this.wurzel.querySelector('canvas.nebel');
    if (!c) return;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(58, 40, 24, 0.82)';
    g.fillRect(0, 0, c.width, c.height);
    // Entdeckt: ein weiches Loch um die Region (Mitte der Box, etwas größer).
    g.globalCompositeOperation = 'destination-out';
    for (const id of this.karte.entdeckt) {
      const r = w.regionen[id];
      if (!r) continue;
      const [x0, y0, x1, y1] = r.box;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.max(x1 - x0, y1 - y0) / 2 + 22;
      const v = g.createRadialGradient(cx, cy, rad * 0.55, cx, cy, rad);
      v.addColorStop(0, 'rgba(0,0,0,1)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
}
