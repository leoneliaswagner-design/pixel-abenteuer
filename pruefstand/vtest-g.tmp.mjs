import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const fehler = [];
p.on('pageerror', (e) => fehler.push(e.message));
await p.goto('http://localhost:3516/index.html');
await p.fill('#name', 'Probe');
await p.click('#anmelden button[type=submit]');
await p.waitForFunction(() => window.__spiel?.zustand || document.getElementById('wahl')?.hidden === false, null, { timeout: 15000 });
const klassen = await p.evaluate(() => [...document.querySelectorAll('#wahl input[name=klasse]')].map((i) => i.closest('label')?.textContent.trim().split('\n')[0]).join(' | '));
if (await p.evaluate(() => !window.__spiel)) { await p.check('#wahl input[name=klasse][value=gelehrter]', { force: true }); await p.click('#wahl button[type=submit]'); await p.waitForFunction(() => window.__spiel?.zustand, null, { timeout: 15000 }); }
await new Promise((r) => setTimeout(r, 1500));
await p.keyboard.press('t'); await new Promise((r) => setTimeout(r, 300)); console.log('effekt', (await p.evaluate(() => window.__spiel.zustand())).ich); await p.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));
const z = await p.evaluate(() => window.__spiel.zustand());
console.log('gebiet', z.gebiet, 'fenster', z.fenster, 'fehler', fehler.length, 'klassen:', klassen.slice(0, 200));
await b.close();
