import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
// Alle PNGs im Ordner — eine feste Liste hätte neue Grafiken verschwiegen.
const namen = readdirSync(dir).filter((n) => n.endsWith('.png')).map((n) => n.slice(0, -4)).filter((n) => !/^held-(blau|lila)$/.test(n));
const imgs = namen.map(n => `<div><img src="data:image/png;base64,${readFileSync(dir+n+'.png').toString('base64')}"></div>`).join('');
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1400,height:900}});
await p.setContent(`<body style="background:#556;display:flex;flex-wrap:wrap;gap:16px;margin:8px">${imgs}<style>img{zoom:4;image-rendering:pixelated}</style></body>`);
await p.screenshot({path: process.argv[3], fullPage:true});
await b.close();
