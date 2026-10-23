# Pixel-Abenteuer

Ein Koop-Abenteuer für 2–4 Leute im Browser, im Stil von *Link's Awakening* —
mit 32er- statt 16er-Kacheln.

## Starten

```sh
npm install
npm run dev
```

Dann http://localhost:5173 öffnen, gern in zwei Fenstern nebeneinander.
Andere im selben WLAN kommen über `http://<deine-IP>:5173` dazu.

**Steuerung:** Pfeiltasten oder WASD zum Laufen, Leertaste oder J für das Schwert.

## Mit Freunden übers Internet

```sh
npm run build
npm start          # ein einziger Port (3001, oder PORT=…)
```

`npm start` liefert das gebaute Spiel und den Spielserver über denselben
Port aus. Den Rechner/Server, auf dem das läuft, müssen die anderen
erreichen — z. B. ein kleiner Server bei Fly.io, Render oder Hetzner.

## Aufbau

| Ordner | Was drin ist |
|---|---|
| `client/` | Das Spiel im Browser (Phaser 3). `szenen/Spiel.js` ist die Welt, `szenen/Oberflaeche.js` Herzen und Meldungen, `figur.js` eine Spielfigur. |
| `server/` | Node-Server mit WebSockets. `spiel.js` entscheidet über Leben, Treffer, Gegner, Büsche, Herzen. |
| `gemeinsam/` | Was Browser und Server beide brauchen: Kollision, Schwert-Trefferfläche. |
| `inhalte/grafik/` | Alle Bilder (PNG). |
| `inhalte/karten/` | Karten im Format von [Tiled](https://www.mapeditor.org). |
| `inhalte/daten/werte.json` | Zahlen zum Feinschleifen: Tempo, Leben, Schaden, Wartezeiten. |
| `werkzeuge/` | Skripte, die die Platzhalter-Grafiken und die erste Karte erzeugt haben. |
| `pruefstand/` | Automatische Prüfungen, s. u. |

## Grafik und Karten selbst bearbeiten

- **Karte:** `inhalte/karten/start.json` in Tiled öffnen. Ebenen: `boden`,
  `hindernisse`, `orte` (Punkte `spieler_start` und `gegner`). Ob eine
  Kachel fest ist, steht als Eigenschaft im Kachelsatz.
  Danach **nicht mehr** `npm run karte` ausführen — das überschreibt die Karte.
- **Grafik:** Die PNGs in `inhalte/grafik/` lassen sich mit jedem
  Pixelprogramm (Aseprite, LibreSprite, Piskel) übermalen. Danach **nicht mehr**
  `npm run grafik` ausführen. Raster: Kacheln 32×32, Held 32×32 (Zeilen:
  unten, oben, links, rechts; Spalten: stehen, Schritt, Schritt, Hieb).

## Prüfen

```sh
node pruefstand/server-regeln.mjs   # Regeln des Servers, ohne Browser
node pruefstand/zwei-spieler.mjs    # zwei echte Browser gegen einen Server
sh pruefstand/gegenprobe.sh         # macht absichtlich etwas kaputt — die Prüfungen müssen anschlagen
```
