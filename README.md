# Pixel-Abenteuer

Ein Koop-Abenteuer für 2–4 Leute im Browser: gespielt wie *Link's Awakening*,
im Aussehen eher wie *Stardew Valley* oder *Necesse*. Das Spiel zur D&D-Kampagne: Es beginnt in
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
E oder Enter zum Lesen, Ansprechen und Öffnen (und zum Weiterblättern),
Q oder K für die Fähigkeit der Klasse, I für den Rucksack (oder der Knopf
unten rechts), 1 trinkt einen Heiltrank, Esc schließt Fenster.

## Weltkarte

Mit **M** (oder dem Kartenknopf unten rechts) öffnet sich die Karte der
Welt: das Bild aus `konzept/weltkarte.webp`, darüber Nebel, wo die Gruppe
noch nicht war. Jeder Spieler ist ein Punkt in seiner Farbe; wer hinter
einem Dimensionsriss steckt, steht in der Liste darunter. „Umgebung"
vergrößert um einen herum, „Ganze Welt" zeigt alles.

`inhalte/daten/welt.json` sagt, wo was liegt:
- `regionen`: die fünf Kontinente und 195 Inseln — erkannt aus dem
  Kartenbild (`python werkzeuge/inseln.py`, braucht Python und Pillow, nur
  nötig, wenn sich das Bild ändert). Namen darf man hier ändern, sie bleiben
  beim nächsten Lauf erhalten. Die Startinsel ist `insel-047`.
- `gebiete`: zu jedem Gebiet die Region und der Punkt im Kartenbild, oder
  `riss: true`. Ein Gebiet, das hier fehlt, meldet der Server beim Start.

## Segeln

Zwischen den Inseln fährt man Boot — und muss sich selbst zurechtfinden:

- Am Ende des **mittleren Stegs in Riftside** steigt man ins Ruderboot.
- Das **Meer** ist ein eigenes Gebiet, gebaut aus der Weltkarte: jede Insel
  und jeder Kontinent liegt dort, wo er auf dem Bild liegt (eine Kachel = 4
  Bildpunkte, 256×256 Kacheln).
- Das Boot nimmt langsam Fahrt auf und gleitet nach. Schwert und Fähigkeit
  ruhen, solange man rudert.
- Über dem Wasser liegt **Dunst** — man sieht nur ein Stück weit. Unten
  links zeigt ein **Kompass** den Kurs. Die **Weltkarte** (M) zeigt auf See
  keinen eigenen Punkt: wo man ist, findet man heraus, indem man Küsten mit
  der Karte vergleicht. Was man ansegelt, deckt sich auf der Karte auf.
- Anlegen kann man, wo ein Gebiet einen Hafen hat (`welt.json` →
  `gebiete.<name>.hafen` = id der Ankunft dort); das Meer bekommt an der
  nächsten Küste automatisch eine Anlegestelle (`npm run karte -- meer`).
  Inseln ohne Gebiet sind vorerst nur Küste.

Zahlen in `werte.json` → `boot`: Tempo, Beschleunigung, wie weit man
Inseln erkennt (`sicht`), wie dicht der Dunst ist (`dunst`).

## Eigene Gebiete bauen

```sh
npm run gebiet -- neu leuchtturm 30 20 insel-047 "den Leuchtturm"
```

legt `inhalte/karten/leuchtturm.json` an (Wiese mit Baumrand, Ankunft
`start` in der Mitte), trägt das Gebiet in `werte.json` ein und setzt es
auf die Weltkarte. Dann die Datei in [Tiled](https://www.mapeditor.org)
öffnen und malen:

| Ebene | Was hinein kommt |
|---|---|
| `boden` | Gras, Wege, Wasser, Sand, Pflaster, Dielen … |
| `hindernisse` | Bäume, Büsche, Steine, Mauern, Häuser (alles mit `fest`) |
| `orte` | Punkte `ankunft` (`id`), `gegner` (`art`), `schild` (`text`), `figur` (`name`, `text`, `aussehen`), `truhe` (`inhalt`, `id`), `spieler_start`; Rechtecke `uebergang` (`ziel`, `ankunft`, optional `bedingung`, `art: riss`) |

Damit man hineinkommt, braucht ein anderes Gebiet einen `uebergang` mit
`ziel` = dem neuen Gebiet und `ankunft` = `start`. Nach neuen Kacheln:
`npm run gebiet -- kacheln` erneuert den Kachelsatz in allen Karten.
Karten, die man in Tiled bearbeitet hat, nicht mehr mit `npm run karte`
erzeugen — die Textkarten in `werkzeuge/karte.mjs` sind nur der Anfang.

## Tag und Nacht

Ein Tag dauert 24 Minuten (`werte.json` → `tag.dauer`) und ist für alle
Spieler gleich. Abends wird es golden, nachts dunkel; Laternen, Fenster,
Risse und die Spieler selbst leuchten. Höhle und Tempel sind immer dunkel,
Häuser innen immer hell (Karteneigenschaft `licht`). Zum Ausprobieren:
`TAGESZEIT=0.9` (Windows: `set TAGESZEIT=0.9`) vor `npm start` beginnt nachts.

## Monster

Östlich vom Inselwald liegt **der tiefe Wald** — dort wohnen die Monster.
Sie sind an das D&D-SRD angelehnt (System Reference Document 5.1,
CC BY 4.0) und stehen als Daten in `inhalte/daten/monster.json`:

| Monster | SRD | Verhalten |
|---|---|---|
| Schleim | — | jagt langsam (Inselwald, Höhle, Tempel) |
| Riesenratte | Giant Rat | jagt schnell, hält wenig aus |
| Wolf | Wolf | duckt sich kurz (zittert), dann springt er — ausweichen! |
| Goblin | Goblin | hält Abstand und schießt Pfeile |
| Skelett | Skeleton | langsam, zäh (4 Treffer), trifft doppelt |
| Riesenfledermaus | Giant Bat | fliegt im Zickzack auf einen zu |

Jedes Monster hat Leben, Schaden, Tempo, Sichtweite, Beute (`gold`),
Herz-Chance und ein `verhalten`: `jagen`, `fernkampf`, `anspringen` oder
`flattern`. Ein neues Monster ist ein Eintrag dort und ein Bild
`inhalte/grafik/<name>.png` (32×32, zwei Bilder nebeneinander, Blick nach
links). Auf einer Karte ist ein Gegner ein Punkt `gegner` mit der
Eigenschaft `art`; im Kartengenerator nimmt die Liste `gegner` die Arten
der `g` der Reihe nach.

## Rucksack, Ausrüstung, Laden

- **Rucksack** (I): 12 Plätze, jede Art Gegenstand belegt einen, egal wie
  viele. Gold hat einen eigenen Beutel; Schlüssel und Risssteine gehören der
  Gruppe und zählen nicht mit. Ist er voll, bleibt eine Truhe zu.
- **Ausrüstung**: Waffe, Rüstung, Schmuck. Was man anlegt, ändert die Werte
  (Schwertschaden, Herzen, Tempo, Stärke der Fähigkeit). Manches dürfen nur
  bestimmte Klassen tragen — der Knopf sagt dann, wer.
- **Laden**: die Krämerin auf dem Markt in Riftside (E). Charisma macht die
  Preise: je Punkt Modifikator 5 % billiger, und man bekommt mehr beim
  Verkaufen (sonst die Hälfte).
- Besiegte Schleime geben dem, der sie besiegt hat, 1–3 Gold.

Gegenstände stehen in `inhalte/daten/gegenstaende.json` (Name, Bild, Platz,
`boni`, `klassen`, `preis`, `wirkung`), Läden in `laeden.json`. Ein Händler
ist eine Figur mit der Eigenschaft `laden`. Platzzahl und Handel in
`werte.json` (`inventar`, `handel`).

## Klassen und Spezies

Beim ersten Beitreten wählt jeder Klasse und Spezies; danach gilt sie für
diesen Namen. Wie in D&D bestimmen sechs Attribute die Werte: Konstitution
gibt Herzen, Geschick Tempo, Stärke Schwertschaden, das Attribut der Klasse
die Stärke ihrer Fähigkeit.

| Klasse | Fähigkeit (Q) | Vorteil |
|---|---|---|
| Kämpfer | Schildstoß: Sprung nach vorn, trifft, wer im Weg steht | viel Stärke und Leben |
| Schurke | Dolchwurf | öffnet verschlossene Türen ohne Schlüssel |
| Magier | Feuerball (langsam, Schaden 3) | liest magische Schrift |
| Kleriker | Heilendes Wort: heilt sich und alle in der Nähe | — |
| Waldläufer | Pfeil (schnell, weit) | — |

Spezies: Mensch (+1 auf alles), Elf, Zwerg, Halbling. Alles steht in
`inhalte/daten/klassen.json` und `spezies.json` — eine Homebrew-Klasse ist
ein neuer Eintrag dort (Fähigkeit: `geschoss`, `ansturm` oder `heilung`).
Ohne eigenes Bild läuft sie im Umhang der Spielerfarbe; ein Bild bekommt sie
in `werkzeuge/grafik.mjs` (`KLASSEN`).

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
egal): Gebiet, Stelle, Leben, Klasse und Spezies, Rucksack und Ausrüstung; dazu, welche Truhen offen sind. Wer mit demselben Namen wiederkommt, steht da,
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
| `gemeinsam/` | Was Browser und Server beide brauchen: Kollision, Schwert-Trefferfläche, Werte aus Klasse und Spezies (`regeln.js`). |
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
      `schluessel`). Eine `id` geben. Mit `oeffnet_bei` = Weltzustand ist es
      ein Tor ohne Schloss: es geht auf, sobald der Zustand gilt (`text` =
      was man liest, solange es zu ist).
    - `sockel` — wie eine Truhe ohne Deckel (`inhalt`, `setzt`, `meldung`);
      `aussehen` = `marmor` für den hellen Sockel der Akropolis.
  - **Fallen** (Punkte `falle`, Zahlen in `werte.json` unter `fallen`):
    `art` = `stacheln` (heben und senken sich, `versatz` in ms verschiebt den
    Takt), `pfeile` (Druckplatte: kurz nach dem Klick fliegt ein Pfeil aus der
    Wand gegenüber `richtung`), `platte` (bleibt `dauer` ms gedrückt; sind
    alle Platten mit demselben `setzt` zugleich unten, gilt der Zustand).
  - **Steinkugel**: Punkte `kugel_start` (mit `ausloeser` = Bedingung) und
    `kugel_ende`. Sie grollt, rollt senkrecht hinab, überrollt, wen sie
    erwischt, und bleibt am Ende liegen (3×3 Kacheln fest).
  - **Weltzustände** (z. B. `tempel_geschlossen`) merkt sich der Spielstand für
    die ganze Runde. Gesetzt werden sie von Truhen und Figuren mit der
    Eigenschaft `setzt` (dazu optional `meldung` = Text für alle; mehrere
    Zustände mit Komma: das Idol setzt `idol_genommen,tempel_geschlossen`).
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
  - Haustüren: Kachel `eingang` (sieht aus wie eine Tür, ist begehbar) mit
    einem Übergang darauf; im Haus führt die `fussmatte` unten in der Wand
    wieder hinaus. Im Kartengenerator dürfen Übergänge und Ankünfte Listen
    sein — das n-te „N" auf der Karte nimmt den n-ten Eintrag.
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
node pruefstand/stufen.mjs          # Erfahrung, Aufstieg, Balken und Herzen am Bildpunkt
node pruefstand/tempel.mjs          # Stacheln, Idol, Beben, Kugel rollt, Flucht, Kugel liegt am Bildpunkt
node pruefstand/riftside.mjs        # Start in Riftside, Hafenmeisterin, durchs Stadttor in den Wald
node pruefstand/klassen.mjs         # Charakterwahl (auch am Handy), Aussehen, Feuerball, Heilung, Tempo
node pruefstand/inventar.mjs        # Laden, Kaufen, Anlegen, Trank, Spielstand, Ladenfenster am Handy
node pruefstand/monster.mjs         # Monsterbilder, Goblin-Pfeil trifft, Wolf duckt sich sichtbar
node pruefstand/optik.mjs           # Tag und Nacht am Bildpunkt, Höhle, Innenräume, Deko, Wind, Figuren 32×48
node pruefstand/weltkarte.mjs       # Weltkarte: Nebel am Bildpunkt, eigener Punkt, Mitspieler hinter dem Riss
node pruefstand/meer.mjs            # Segeln: Boot, Dunst, Schwung, Kompass, Karte ohne Punkt, Anlegen
node pruefstand/karten.mjs          # Kartengenerator: Boden unter Dingen, jeder Übergang kommt an
UEBER_HTTPS=1 node pruefstand/zwei-spieler.mjs   # dasselbe hinter https, wie im Tunnel
sh pruefstand/gegenprobe.sh         # macht absichtlich etwas kaputt — die Prüfungen müssen anschlagen
```
