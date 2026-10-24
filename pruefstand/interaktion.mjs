// Ansprechen mit echten Browsern:
//   Anna steht links neben dem alten Mann und spricht ihn an — die Textbox
//   erscheint, blättert, schließt; der Mann dreht sich zu ihr, auch bei Cora.
//   Cora steht vor der Truhe oben rechts und öffnet sie — Anna sieht sie offen.
//
//   node pruefstand/interaktion.mjs          (baut vorher mit vite)
//   OHNE_BAU=1 node pruefstand/interaktion.mjs
//
// Gemessen wird auch der Bildpunkt: solange die Textbox offen ist, ist der
// untere Streifen des Bildes dunkel; davor und danach ist dort Wiese.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { anmelden } from './anmelden.mjs';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3463;
const bilder = join(wurzel, 'pruefstand', 'bilder');
mkdirSync(bilder, { recursive: true });
if (!process.env.OHNE_BAU) execSync('npx vite build --logLevel error', { cwd: wurzel, stdio: 'inherit' });

const spielstand = join(mkdtempSync(join(tmpdir(), 'pruefstand-')), 'stand.json');
const stelle = (name, x, y, richtung) => {
  const ort = { gebiet: 'wald', x, y };
  return { name, farbe: name === 'Anna' ? 'gruen' : 'blau', klasse: 'kaempfer', spezies: 'mensch', richtung, ...ort, leben: 6, ankunft: ort };
};
writeFileSync(spielstand, JSON.stringify({
  version: 1, welt: {},
  spieler: {
    anna: stelle('Anna', 11 * 32 + 16, 12 * 32 + 24, 'rechts'),
    cora: stelle('Cora', 37 * 32 + 16, 2 * 32 + 16, 'oben'),
  },
}));

const server = spawn('node', ['server/index.js'], { cwd: wurzel, env: { ...process.env, PORT: String(PORT), SPIELSTAND: spielstand } });
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
let pruefungen = 0, blaetterungen = 0;
const pruefe = (bed, text) => {
  pruefungen++;
  console.log(`${bed ? '  ok ' : '  FEHLER'}  ${text}`);
  if (!bed) fehler.push(text);
};
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Ohne Drosselung — s. zwei-spieler.mjs.
const browser = await chromium.launch({
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
try {
  const oeffnen = async (name) => {
    const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
    p.on('pageerror', (e) => fehler.push(`${name}: Seitenfehler ${e.message}`));
    await p.goto(`http://localhost:${PORT}/`);
    await anmelden(p, name);
    await warte(500);
    return p;
  };
  const zustand = (p) => p.evaluate(() => window.__spiel.zustand());
  // Helligkeit des unteren Streifens (dort steht die Textbox), aus Phasers Schnappschuss.
  const untenHell = (p) => p.evaluate(() => new Promise((gut) => {
    window.__spiel.szene.game.renderer.snapshot((bild) => {
      const c = document.createElement('canvas');
      c.width = bild.width;
      c.height = bild.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(bild, 0, 0);
      const f = bild.width / 480;
      const d = ctx.getImageData(20 * f, 205 * f, 440 * f, 50 * f).data;
      let summe = 0;
      for (let i = 0; i < d.length; i += 4) summe += (d[i] + d[i + 1] + d[i + 2]) / 3;
      gut(summe / (d.length / 4));
    });
  }));

  const anna = await oeffnen('Anna');
  const cora = await oeffnen('Cora');

  let za = await zustand(anna);
  pruefe(za.hinweis, 'vor dem alten Mann steht das „E" als Hinweis');
  const hellVorher = await untenHell(anna);

  await anna.keyboard.press('e');
  await warte(150);
  za = await zustand(anna);
  pruefe(za.dialog?.name === 'Alter Mann', `Textbox mit Namen „${za.dialog?.name}"`);
  pruefe(za.dialog && za.dialog.text.length > 0 && za.dialog.seiten === 3, `Text wird geschrieben („${za.dialog?.text}"), ${za.dialog?.seiten} Seiten`);
  const hellOffen = await untenHell(anna);
  // Die Box ist Pergament auf Holz — heller als die Wiese; früher war sie dunkel.
  pruefe(Math.abs(hellOffen - hellVorher) > 30, `unten im Bild ist die Box zu sehen (Helligkeit ${hellVorher.toFixed(0)} → ${hellOffen.toFixed(0)})`);

  await anna.keyboard.press('e');
  await warte(100);
  za = await zustand(anna);
  pruefe(za.dialog?.seite === 0 && za.dialog.text.endsWith('Schwert.'), `erster Druck zeigt die Seite ganz („…${za.dialog?.text.slice(-20)}")`);

  await anna.screenshot({ path: join(bilder, 'dialog.png') });
  const xVorher = za.ich.x;
  await anna.keyboard.down('ArrowLeft');
  await warte(400);
  await anna.keyboard.up('ArrowLeft');
  za = await zustand(anna);
  pruefe(za.ich.x === xVorher && za.dialog, 'während der Textbox steht die Figur still');

  for (let i = 0; i < 12 && (await zustand(anna)).dialog; i++) {
    await anna.keyboard.press(i % 2 ? 'Space' : 'e');
    blaetterungen++;
    await warte(120);
  }
  za = await zustand(anna);
  pruefe(!za.dialog, `Textbox nach ${blaetterungen} Tastendrücken zu (mit E und Leertaste)`);
  await warte(300);
  const hellNachher = await untenHell(anna);
  pruefe(Math.abs(hellNachher - hellVorher) < 8, `Gegenstück: unten wieder Wiese (Helligkeit ${hellNachher.toFixed(0)})`);
  const zc = await zustand(cora);
  pruefe(zc.figuren.some((f) => f.bild === 8), `Cora sieht den alten Mann nach links schauen (Bild ${zc.figuren.map((f) => f.bild)})`);

  // --- Cora öffnet die Truhe ---
  await cora.keyboard.press('e');
  await warte(400);
  let c = await zustand(cora);
  pruefe(c.dialog?.seiten === 1 && c.inventar.gold === 20, `Cora findet Gold (${JSON.stringify(c.inventar)})`);
  await cora.keyboard.press('e');
  await cora.keyboard.press('e');
  await warte(200);
  za = await zustand(anna);
  c = await zustand(cora);
  pruefe(c.truhen.find((t) => t.schluessel === 'oberwelt_gold')?.offen, 'bei Cora ist die Truhe offen');
  pruefe(za.truhen.find((t) => t.schluessel === 'oberwelt_gold')?.offen, 'bei Anna auch');
  pruefe(!c.dialog, 'Coras Textbox ist wieder zu');
  await cora.screenshot({ path: join(bilder, 'truhe.png') });
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pruefungen} Prüfungen, ${blaetterungen} Mal geblättert.`);
if (fehler.length) {
  console.log(`\n${fehler.length} Fehler:\n- ${fehler.join('\n- ')}`);
  process.exit(1);
}
