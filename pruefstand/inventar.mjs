// Rucksack und Laden im Browser: bei der Krämerin kaufen, gesperrte Knöpfe
// mit Grund, anlegen, und was davon im Spielstand ankommt. Dazu das
// Ladenfenster bei 360 Punkten Breite.
//
//   node pruefstand/inventar.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/inventar.mjs
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anmelden } from './anmelden.mjs';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3463;
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

// Vor der Krämerin auf dem Markt (Kachel 24,9), Blick nach rechts.
const vorKraemerin = { gebiet: 'riftside', x: 23 * 32 + 20, y: 9 * 32 + 24 };
const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const kunde = (name, farbe, gold) => ({ name, farbe, klasse: 'kaempfer', spezies: 'mensch', richtung: 'rechts', ...vorKraemerin, leben: 8, ankunft: vorKraemerin, inventar: { gold } });
writeFileSync(spielstand, JSON.stringify({ version: 1, welt: {}, spieler: { kai: kunde('Kai', 'gruen', 120), lu: kunde('Lu', 'rot', 5) } }));

const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, ZUFALL: '0.99', PORT: String(PORT), SPIELSTAND: spielstand } });
let log = '';
await new Promise((gut, schlecht) => {
  const t = setTimeout(() => schlecht(new Error('Server startet nicht:\n' + log)), 8000);
  const lesen = (d) => {
    log += d;
    if (log.includes(`:${PORT}`)) clearTimeout(t), gut();
  };
  server.stdout.on('data', lesen);
  server.stderr.on('data', lesen);
});

const fehler = [];
const z = { pruefungen: 0, waren: 0, knoepfe: 0, bildpunkte: 0 };
const pruefe = (bed, text) => {
  z.pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
const bis = async (p, bed, ms = 3000) => {
  for (let t = 0; t < ms; t += 50) {
    if (bed(await zustand(p))) return true;
    await warte(50);
  }
  return false;
};
// Leere Herzen oben links zählen — am Bildpunkt (ihre Farbe 90,58,74),
// nicht an der Zahl in der Oberfläche.
const leereHerzen = async (p) => {
  const bild = await p.screenshot({ clip: { x: 0, y: 0, width: 200, height: 44 } });
  z.bildpunkte += 200 * 44;
  return p.evaluate(async (daten) => {
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
    const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
    c.drawImage(b, 0, 0);
    const d = c.getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 90) < 8 && Math.abs(d[i + 1] - 58) < 8 && Math.abs(d[i + 2] - 74) < 8) n++;
    return n;
  }, bild.toString('base64'));
};

const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => fehler.push(`Kai: Seitenfehler ${e.message}`));
  await p.goto(`http://localhost:${PORT}/`);
  await anmelden(p, 'Kai');
  await warte(500);

  // --- Laden auf ---
  await p.keyboard.press('e');
  pruefe(await bis(p, (s) => s.fenster === 'laden'), 'E vor der Krämerin öffnet den Laden');
  z.waren = await p.locator('#fenster [data-tun=kaufen]').count();
  pruefe(z.waren === 6, `${z.waren} Waren im Laden`);
  await p.screenshot({ path: `${wurzel}pruefstand/bilder/laden.png` });

  await p.click('#fenster [data-tun=kaufen][data-art=langschwert]');
  pruefe(await bis(p, (s) => s.inventar.langschwert === 1 && s.inventar.gold === 80), 'Langschwert gekauft: im Rucksack, 80 Gold übrig');
  const goldImFenster = await p.textContent('#fenster .gold');
  pruefe(goldImFenster.trim() === '80', `das Fenster zeigt den neuen Stand (${goldImFenster.trim()} Gold)`);
  const stab = await p.locator('#fenster .ware', { hasText: 'Zauberstab' }).textContent();
  pruefe(stab.includes('Nur für: Magier'), 'beim Zauberstab steht, wer ihn tragen darf');
  await p.click('#fenster [data-tun=kaufen][data-art=heiltrank]');
  await bis(p, (s) => s.inventar.heiltrank === 1);
  await p.click('#fenster [data-tun=kaufen][data-art=kettenhemd]');
  pruefe(await bis(p, (s) => s.inventar.kettenhemd === 1 && s.inventar.heiltrank === 1 && s.inventar.gold === 18), 'Heiltrank und Kettenhemd gekauft, 18 Gold übrig');
  const ring = p.locator('#fenster .ware', { hasText: 'Ring der Eile' });
  const ringGesperrt = await ring.locator('button').isDisabled();
  const ringGrund = (await ring.locator('.grund').textContent().catch(() => '')) ?? '';
  z.knoepfe = await p.locator('#fenster button').count();
  pruefe(ringGesperrt && ringGrund.includes('fehlen'), `Ring gesperrt, mit Grund („${ringGrund}")`);

  // Mit Enter auf ✕ schließen — der Laden darf nicht gleich wieder aufgehen.
  await p.focus('#fenster [data-tun=schliessen]');
  await p.keyboard.press('Enter');
  await warte(500);
  pruefe((await zustand(p)).fenster === null, 'Enter auf ✕ schließt den Laden, und er bleibt zu');

  // --- Rucksack: anlegen ---
  const herzenVorher = await leereHerzen(p);
  await p.keyboard.press('i');
  pruefe(await bis(p, (s) => s.fenster === 'rucksack'), 'I öffnet den Rucksack');
  // Leere Plätze: kein Bild. Gemessen am Bildschirm — anfangs lag dort das
  // ganze Bildblatt gekachelt.
  const leerKasten = await p.locator('#fenster .platz.leer').first().boundingBox();
  const leerBild = await p.screenshot({ clip: { x: leerKasten.x + 8, y: leerKasten.y + 8, width: 32, height: 32 } });
  const goldImLeeren = await p.evaluate(async (daten) => {
    const b = await createImageBitmap(await (await fetch(`data:image/png;base64,${daten}`)).blob());
    const c = new OffscreenCanvas(b.width, b.height).getContext('2d');
    c.drawImage(b, 0, 0);
    const d = c.getImageData(0, 0, b.width, b.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 120) n++;
    return n;
  }, leerBild.toString('base64'));
  z.bildpunkte += 32 * 32;
  pruefe(goldImLeeren === 0, `leerer Ausrüstungsplatz ohne Bild (${goldImLeeren} goldene Bildpunkte)`);
  const schadenVorher = await p.evaluate(() => window.__spiel.szene.charakter.werte.schaden);
  await p.click('#fenster [data-tun=waehlen][data-art=langschwert]');
  await p.click('#fenster [data-tun=anlegen][data-art=langschwert]');
  await p.click('#fenster [data-tun=waehlen][data-art=kettenhemd]');
  await p.click('#fenster [data-tun=anlegen][data-art=kettenhemd]');
  pruefe(await bis(p, (s) => s.ausruestung.waffe === 'langschwert' && s.ausruestung.ruestung === 'kettenhemd'), 'Langschwert und Kettenhemd angelegt');
  const nachher = await p.evaluate(() => ({ schaden: window.__spiel.szene.charakter.werte.schaden, text: document.querySelector('#fenster .werte').textContent }));
  pruefe(nachher.schaden === schadenVorher + 1 && nachher.text.includes(`Schwert ${schadenVorher + 1}`), `Schwertschaden ${schadenVorher} → ${nachher.schaden}, im Fenster: ${nachher.text.trim()}`);
  await p.keyboard.press('Escape');
  await warte(400);
  const herzenNachher = await leereHerzen(p);
  // Kettenhemd: ein Herz mehr, und das ist leer — Leben wächst nicht mit.
  const st = await zustand(p);
  pruefe(st.ich.max === 10 && herzenVorher === 0 && herzenNachher > 100, `ein leeres Herz mehr oben links (Bildpunkte ${herzenVorher} → ${herzenNachher})`);

  // Mit 8 von 10 ist Kai verletzt: Taste 1 trinkt den Trank, das Herz füllt sich.
  await p.keyboard.press('1');
  pruefe(await bis(p, (s) => s.ich.leben === 10 && !s.inventar.heiltrank), 'Taste 1 trinkt den Heiltrank: 8 → 10');
  await warte(300);
  const herzenGetrunken = await leereHerzen(p);
  pruefe(herzenGetrunken === 0, `danach kein leeres Herz mehr (Bildpunkte ${herzenGetrunken})`);
  await p.keyboard.press('i');
  await bis(p, (s) => s.fenster === 'rucksack');
  pruefe(await p.locator('#fenster [data-art=heiltrank]').count() === 0, 'der Trank ist aus dem Rucksack verschwunden');
  await p.keyboard.press('Escape');

  // --- Handy: Lu öffnet den Laden bei 360 Punkten ---
  const h = await browser.newPage({ viewport: { width: 360, height: 640 } });
  h.on('pageerror', (e) => fehler.push(`Lu: Seitenfehler ${e.message}`));
  await h.goto(`http://localhost:${PORT}/`);
  await anmelden(h, 'Lu');
  await warte(500);
  await h.keyboard.press('e');
  pruefe(await bis(h, (s) => s.fenster === 'laden'), 'am Handy: Laden offen');
  const breite = await h.evaluate(() => {
    const f = document.getElementById('fenster');
    const raus = [...f.querySelectorAll('button, .grund, b')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length;
    return { ueber: f.scrollWidth - f.clientWidth, raus, zahl: f.querySelectorAll('button, .grund, b').length };
  });
  pruefe(breite.ueber <= 0 && breite.raus === 0 && breite.zahl > 10, `am Handy nichts rechts abgeschnitten (${breite.zahl} Elemente geprüft, ${breite.raus} ragen hinaus)`);
  const luGrund = await h.locator('#fenster .ware', { hasText: 'Heiltrank' }).locator('.grund').textContent();
  pruefe(luGrund.includes('fehlen 7'), `Lu hat 5 Gold: „${luGrund}"`);
  await h.screenshot({ path: `${wurzel}pruefstand/bilder/laden-handy.png`, fullPage: true });
  await h.close();

  // --- Was im Spielstand steht (der Server speichert beim Verlassen) ---
  await p.close();
  await warte(500);
  const stand = JSON.parse(readFileSync(spielstand, 'utf8')).spieler.kai;
  pruefe(stand.ausruestung?.waffe === 'langschwert' && stand.ausruestung?.ruestung === 'kettenhemd' && !stand.inventar.heiltrank && !stand.inventar.langschwert && stand.leben === 10,
    `Spielstand: ${JSON.stringify(stand.ausruestung)}, Rucksack ${JSON.stringify(stand.inventar)}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${z.pruefungen} Prüfungen, ${z.waren} Waren, ${z.knoepfe} Knöpfe im Laden, ${z.bildpunkte} Bildpunkte gezählt.`);
if (fehler.length) {
  console.log(`${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
