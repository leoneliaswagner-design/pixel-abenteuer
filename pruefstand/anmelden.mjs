// Anmelden im Browser, für alle Prüfstände gleich. Wer im Spielstand eine
// Klasse hat, ist gleich im Spiel; wer neu ist, bekommt erst die Wahl —
// dann wird gewählt (ohne Angabe: was vorausgewählt ist).
export async function anmelden(p, name, { klasse, spezies } = {}) {
  await p.fill('#name', name);
  await p.click('#anmelden button[type=submit]');
  await p.waitForFunction(() => window.__spiel?.zustand || document.getElementById('wahl')?.hidden === false, null, { timeout: 10000 });
  const gewaehlt = await p.evaluate(({ klasse, spezies }) => {
    const form = document.getElementById('wahl');
    if (!form || form.hidden) return null;
    for (const [feld, wert] of [['klasse', klasse], ['spezies', spezies]])
      if (wert) form.querySelector(`input[name=${feld}][value=${wert}]`).checked = true;
    form.dispatchEvent(new Event('change'));
    return { klasse: form.elements.klasse.value, spezies: form.elements.spezies.value };
  }, { klasse, spezies });
  if (gewaehlt) await p.click('#wahl button[type=submit]');
  await p.waitForFunction(() => window.__spiel?.zustand, null, { timeout: 10000 });
  return gewaehlt;
}
