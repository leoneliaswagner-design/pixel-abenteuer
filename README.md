# Pixel-Abenteuer

Ein Koop-Abenteuer für 2–4 Leute im Browser, im Stil von *Link's Awakening* —
mit 32er- statt 16er-Kacheln. Das Spiel zur D&D-Kampagne: Es beginnt in
**Riftside**, einer Hafenstadt, in deren Gassen sich Dimensionsrisse öffnen
(mehr in `konzept/KONZEPT.md`).

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 22.

```sh
npm install
npm run dev
```

Dann http://localhost:5173 öffnen, gern in zwei Fenstern nebeneinander.
Andere im selben WLAN kommen über `http://<deine-IP>:5173` dazu.

Allein, ganz ohne Server-Verbindung: `http://localhost:5173/?allein` — die
Spielregeln laufen dann im Browser (`client/lokal.js`).

**Steuerung:** Pfeiltasten oder WASD zum Laufen, Leertaste oder J für das Schwert,
E oder Enter zum Lesen, Ansprechen und Öffnen (und zum Weiterblättern).

## Mit Freunden übers Internet

```sh
npm run online
```

Baut das Spiel, startet den Server auf deinem Rechner und öffnet einen
kostenlosen Cloudflare-Tunnel (ohne Konto). Nach ein paar Sekunden steht ein
Link wie `https://irgendwas-mit-woertern.trycloudflare.com` im Fenster — den
schickst du deinen Freunden und öffnest ihn selbst.

- Das Fenster muss offen bleiben, solange gespielt wird. Strg+C beendet alles.
- Der Link ist bei jedem Start neu.
- Kein Router-Umbau nötig. Ein Firmen- oder Schulnetz kann Cloudflare aber sperren;
  dann sagt das Skript das.

### Ganz ohne Tunnel (nur mit eigener öffentlicher IP)

Wenn dein Internetanschluss eine eigene öffentliche IPv4-Adresse hat (bei
vielen Kabel-/Glasfaser-Anschlüssen nicht — Stichwort „DS-Lite"):

1. `npm run build` und dann `npm start` (Port 3001).
2. Im Router Port 3001 (TCP) an deinen Rechner weiterleiten
   (FritzBox: Internet → Freigaben → Portfreigaben).
3. Deine öffentliche IP z. B. auf https://ifconfig.me nachsehen; Freunde öffnen
   `http://<diese-IP>:3001`.

Die IP ändert sich meist einmal am Tag.

## Spielstände

Der Server merkt sich jeden Spieler an seinem **Namen** (Groß-/Kleinschreibung
egal): Gebiet, Stelle, Leben, Gegenstände; dazu, welche Truhen offen sind. Wer mit demselben Namen wiederkommt, steht da,
wo er aufgehört hat. Gespeichert wird alle 5 Sekunden, beim Verlassen und
beim Beenden mit Strg+C.

- Datei: `spielstaende/spielstand.json` neben dem Spiel (nicht im Repo).
  Daneben liegt `spielstand.json.bak` mit der vorigen Fassung.
- Andere Datei, z. B. eine pro Kampagne: `set SPIELSTAND=C:\Pfad\kampagne.json`
  (Windows) bzw. `SPIELSTAND=… npm run online`.
- Neu anfangen: die Datei löschen oder umbenennen.

Wer besiegt wird, steht an der Stelle wieder auf, an der er das Gebiet
zuletzt betreten hat.

Zum Ausprobieren in einem anderen Gebiet beginnen: `STARTGEBIET=wald`
(Windows: `set STARTGEBIET=wald`) vor `npm run online` bzw. `npm start`.

## Aufbau

| Ordner | Was drin ist |
|---|---|
| `client/` | Das Spiel im Browser (Phaser 3). `szenen/Spiel.js` ist die Welt, `szenen/Oberflaeche.js` Herzen und Meldungen, `figur.js` eine Spielfigur. |
| `server/` | Node-Server mit WebSockets. `spiel.js`: Spieler, Übergänge, Spielstand. `gebiet.js`: eine Karte mit ihren Gegnern, Büschen, Herzen. `spielstand.js`: die Datei. |
| `gemeinsam/` | Was Browser und Server beide brauchen: Kollision, Schwert-Trefferfläche. |
| `inhalte/grafik/` | Alle Bilder (PNG). |
| `inhalte/karten/` | Karten im Format von [Tiled](https://www.mapeditor.org). |
| `inhalte/daten/werte.json` | Zahlen zum Feinschleifen: Tempo, Leben, Schaden, Wartezeiten. |
| `werkzeuge/` | Skripte, die die Platzhalter-Grafiken und die erste Karte erzeugt haben. |
| `pruefstand/` | Automatische Prüfungen, s. u. |

## Grafik und Karten selbst bearbeiten

- **Karten:** Jedes Gebiet ist eine Datei in `inhalte/karten/` (jetzt:
  `riftside.json` = Startgebiet, `wald.json` = Inselwald, `hoehle.json`, `tempel.json`), in Tiled zu öffnen. Welche es gibt,
  steht in `inhalte/daten/werte.json` unter `gebiete`.
  - Ebenen: `boden`, `hindernisse`, `orte`. Ob eine Kachel fest ist, steht
    als Eigenschaft im Kachelsatz.
  - In `orte`: Punkte `spieler_start` (nur im Startgebiet), `gegner`
    (Eigenschaft `art`), `ankunft` (Eigenschaft `id`, optional `richtung`)
    und Rechtecke `uebergang` (Eigenschaften `ziel` = Gebiet, `ankunft` = id
    der Ankunft dort). Wer mit den Füßen in einen Übergang tritt, wechselt.
  - Dinge zum Ansprechen, ebenfalls Punkte in `orte` (sie belegen ihre Kachel):
    - `schild` — Eigenschaft `text`
    - `figur` — `name`, `text`, `aussehen` (z. B. `alter_mann`; die Liste steht
      in `werte.json` unter `aussehen`), `richtung`
    - `truhe` — `inhalt` (z. B. `gold:20` oder `schluessel`) und am besten eine
      eigene `id`, unter der sich der Spielstand merkt, dass sie offen ist.
    - `tuer` — verschlossen; geht mit einem Schlüssel der Gruppe auf (E davor)
      und bleibt offen. Optional `schluessel` = welche Art (Standard
      `schluessel`). Eine `id` geben.
  - **Weltzustände** (z. B. `tempel_geschlossen`) merkt sich der Spielstand für
    die ganze Runde. Gesetzt werden sie von Truhen und Figuren mit der
    Eigenschaft `setzt` (dazu optional `meldung` = Text für alle).
    Abhängig davon:
    - Übergänge mit `bedingung` (z. B. `!tempel_geschlossen` = nur solange
      der Tempel offen ist; mehrere mit Komma). Mit `art` = `riss` bekommt
      ein Übergang das flimmernde Riss-Bild — sichtbar nur, solange er offen ist.
    - Schilder und Figuren mit `text_wenn_<zustand>`: dieser Text gilt,
      sobald der Zustand gesetzt ist; sonst `text`.
    Texte: eine Leerzeile beginnt eine neue Seite; lange Seiten bricht die
    Textbox selbst um. Was es an Gegenständen gibt (mit Name und Grammatik),
    steht in `werte.json` unter `gegenstaende`; `"gemeinsam": true` heißt,
    er gehört der Gruppe (Schlüssel, Risssteine), sonst dem Finder (Gold).
  - Die Karte selbst hat die Eigenschaft `titel` („die Höhle") für Meldungen.
  - Ein Übergang, dessen Ziel es nicht gibt, fällt schon beim Serverstart auf.
  - Nach Handarbeit an einer Karte **nicht mehr** `npm run karte` ausführen —
    das überschreibt sie (`npm run karte -- hoehle` schreibt nur die Höhle).
- **Grafik:** Die PNGs in `inhalte/grafik/` lassen sich mit jedem
  Pixelprogramm (Aseprite, LibreSprite, Piskel) übermalen. Danach **nicht mehr**
  `npm run grafik` ausführen. Raster: Kacheln 32×32, Held 32×32 (Zeilen:
  unten, oben, links, rechts; Spalten: stehen, Schritt, Schritt, Hieb).

## Prüfen

```sh
node pruefstand/server-regeln.mjs   # Regeln des Servers, ohne Browser
node pruefstand/zwei-spieler.mjs    # zwei echte Browser gegen einen Server
node pruefstand/gebiete.mjs         # Treppe in die Höhle, Spielstand über einen Neustart
node pruefstand/interaktion.mjs     # Textbox, Figur dreht sich, Truhe öffnet für alle
node pruefstand/risse.mjs           # Gruppenschlüssel, Tür, Riss in den Tempel, Riss schließt sich
node pruefstand/riftside.mjs        # Start in Riftside, Hafenmeisterin, durchs Stadttor in den Wald
node pruefstand/karten.mjs          # Kartengenerator: Boden unter Dingen, jeder Übergang kommt an
UEBER_HTTPS=1 node pruefstand/zwei-spieler.mjs   # dasselbe hinter https, wie im Tunnel
sh pruefstand/gegenprobe.sh         # macht absichtlich etwas kaputt — die Prüfungen müssen anschlagen
```
