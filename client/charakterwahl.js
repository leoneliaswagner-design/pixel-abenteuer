import { ATTRIBUTE, KURZ, werteBerechnen } from '../gemeinsam/regeln.js';

// Die Wahl von Klasse und Spezies beim ersten Beitreten. Als HTML, nicht in
// Phaser: Beschreibungen umbrechen von selbst, und am Handy lässt sich die
// Seite scrollen. Was angeboten wird, schickt der Server (klassen.json,
// spezies.json) — Homebrew taucht hier ohne Code auf.
const ART = { geschoss: 'Fernkampf', ansturm: 'Nahkampf', heilung: 'Heilung' };

export function charakterWaehlen(auswahl, farbe) {
  const form = document.getElementById('wahl');
  const { klassen, spezies, grund } = auswahl;
  const html = (t) => String(t).replace(/[&<>"]/g, (z) => `&#${z.charCodeAt(0)};`);
  const bild = (k) => `background-image:url(grafik/held-${html(k)}-${html(farbe)}.png)`;
  const karten = (name, liste, mitBild) =>
    Object.entries(liste)
      .map(([id, x], i) => `<label><input type="radio" name="${name}" value="${html(id)}" ${i ? '' : 'checked'} />
        <span class="karte">${mitBild ? `<span class="bild" style="${bild(id)}"></span>` : ''}<b>${html(x.name)}</b>${html(x.beschreibung ?? '')}</span></label>`)
      .join('');
  form.innerHTML = `
    <h1>Wer bist du?</h1>
    <p>Klasse und Spezies gelten für dieses Abenteuer — wer mit demselben Namen wiederkommt, behält sie.</p>
    <h2>Klasse</h2><div class="karten">${karten('klasse', klassen, true)}</div>
    <h2>Spezies</h2><div class="karten">${karten('spezies', spezies, false)}</div>
    <div id="vorschau" aria-live="polite"></div>
    <button type="submit">Abenteuer beginnen</button>`;
  form.hidden = false;
  document.getElementById('anmelden').hidden = true;

  const gewaehlt = () => ({ klasse: form.elements.klasse.value, spezies: form.elements.spezies.value });
  const zeigen = () => {
    const { klasse, spezies: sp } = gewaehlt();
    const w = werteBerechnen(klassen[klasse], spezies[sp], grund);
    const f = w.faehigkeit;
    const vorz = (n) => (n >= 0 ? `+${n}` : `${n}`);
    form.querySelector('#vorschau').innerHTML = `
      <span class="bild" style="${bild(klasse)}"></span>
      <div>
        <b>${html(spezies[sp].name)}, ${html(klassen[klasse].name)}</b><br />
        ${w.maxLeben / 2} Herzen · Schwert ${w.schaden} · Tempo ${w.tempo}<br />
        ${f ? `Fähigkeit (Q): ${html(f.name)} — ${ART[f.art] ?? ''}, Stärke ${f.staerke}<br />` : ''}
        <div class="attribute">${ATTRIBUTE.map((a) => `<span>${KURZ[a]} ${w.attribute[a]} (${vorz(w.mod[a])})</span>`).join('')}</div>
      </div>`;
  };
  form.addEventListener('change', zeigen);
  zeigen();
  return new Promise((gut) =>
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const knopf = form.querySelector('button');
      knopf.disabled = true;
      knopf.textContent = 'Einen Moment …';
      gut(gewaehlt());
    }, { once: true }));
}
