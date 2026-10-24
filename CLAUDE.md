# Arbeitsweise in diesem Projekt

## Was es ist

Koop-Abenteuer für 2–4 Spieler im Browser, Stil *Link's Awakening*, 32er-Kacheln.
Phaser 3 im Browser, Node + `ws` auf dem Server. Ein späterer Umzug nach Godot
ist möglich — deshalb liegen Inhalte als Daten vor (Tiled-Karten, PNGs,
`werte.json`), nicht im Code.

## Wer entscheidet was

- **Der Server** entscheidet alles, worüber sich Spieler einig sein müssen:
  Leben, Treffer, Gegner, Büsche, Herzen.
- **Der Browser** bewegt nur die eigene Figur sofort selbst (sonst fühlt sich
  das Laufen bei Ping zäh an). Der Server prüft Tempo und Wände und schickt
  `korrektur`. Jede Korrektur zählt `k` hoch; Positionen mit altem `k` verwirft
  er — sonst würden Pakete von vor der Korrektur sie wieder rückgängig machen.
- **Gebiete**: jede Karte ein `Gebiet` (server/gebiet.js) mit eigenen Gegnern,
  Büschen, Herzen. Jeder Spieler hat `gebiet`; Stand und Ereignisse gehen nur
  an die im selben Gebiet. Gebiete ohne Spieler stehen still.
  Wechsel: Server erkennt den Übergang am Fußpunkt, setzt um, `k` steigt,
  Browser startet die Szene neu (`scene.restart` — dasselbe Objekt! Alles,
  was beim Wechsel gesetzt wird, in `create` zurücksetzen).
- **Spielstand**: Spieler am Namen erkannt, `spielstaende/spielstand.json`
  (oder `SPIELSTAND=…`). Prüfstände nehmen **immer** eine Wegwerf-Datei.
- **Dinge** (Schild, Figur, Truhe): Punkte in `orte`, belegen ihre Kachel
  (`welt.belegt`), gefunden mit `welt.dingVor()` — dieselbe Funktion für das
  „E" im Browser und die Antwort des Servers. Was sie sagen, schickt der
  Server (`dialog`); offene Truhen und Inventar stehen im Spielstand.
- **Weltzustände** (`spielstand.welt.zustaende`) und **Gruppen-Inventar**
  (`welt.gruppe`) gehören der Runde; Änderungen gehen an alle Spieler, egal
  in welchem Gebiet. Bedingungen prüft `erfuellt()` in gemeinsam/welt.js —
  Server (lässt durch) und Browser (zeigt den Riss) fragen dieselbe Funktion.
- Wer zurückgestoßen wird, geht durch keinen Übergang (`s.stossBis`).
- **Schonfrist**: unverwundbar ab Beitreten/Gebietswechsel, bis der Browser
  `bereit` meldet (max. 15 s), dann noch `spieler.schonfrist` (1,5 s).
- **Startgebiet** ist Riftside (keine Gegner). Prüfstände, die Schleime und
  Büsche brauchen, starten den Server mit `STARTGEBIET=wald`.
- **Klassen/Spezies**: `werteBerechnen()` in `gemeinsam/regeln.js` — der
  Server rechnet damit alles, der Browser Tempo und die Vorschau der Wahl.
  Wer noch wählt (`s.waehlt`), ist für die anderen nicht da. Fähigkeiten
  entscheidet der Server; der Schildstoß kommt als `stoss` wie ein Rückstoß.
- **Inventar**: Rucksack (`s.inventar`, Anzahl je Art) und `s.ausruestung`
  ({waffe, ruestung, schmuck}). Jede Änderung geht über den Server und kommt
  als `inventar` (mit neuen Werten) zurück; der Browser rechnet nichts
  selbst. Regeln, die beide brauchen (Platz, Preise, wer was tragen darf),
  stehen in `gemeinsam/regeln.js`. Neue Daten-Dateien in `ZUSATZDATEN`.
- **Monster**: `monster.json`, Verhalten in `VERHALTEN` (server/gebiet.js).
  Gegner-Pfeile sind Geschosse mit `feind: true` und treffen Spieler. Neue
  Monster nur in Gebieten, die kein Prüfstand für Ruhe braucht — der tiefe
  Wald ist dafür da; Wald und Höhle bleiben bei Schleimen.
- Kollision und Trefferfläche stehen **einmal** in `gemeinsam/welt.js` und
  werden von beiden Seiten benutzt. Nicht doppelt schreiben.

## Regeln

- Deutsch in Oberfläche und Bezeichnern.
- Gespielt wird vermutlich unter Windows: Pfade mit `fileURLToPath`, keine
  Shell-Skripte für Spieler (nur für Prüfstände).
- Kommentare erklären, **warum** — gern mit dem Fehler, der dazu geführt hat.
- Zahlen zum Feinschleifen gehören nach `inhalte/daten/werte.json`.
- `npm run grafik` / `npm run karte` überschreiben die Inhalte. Sobald
  jemand eine PNG oder die Karte von Hand bearbeitet hat, laufen sie für diese
  Datei nicht mehr.

## Prüfen

- `node pruefstand/server-regeln.mjs` — schnell, ohne Browser.
- `node pruefstand/zwei-spieler.mjs` — baut, startet einen Server und zwei
  Chromium-Fenster und misst, was im **anderen** Browser ankommt (und
  Bildpunkte, nicht nur Zustände).
- `node pruefstand/gebiete.mjs` — Treppe in die Höhle, zweiter Spieler bleibt
  oben, Server-Neustart mit Spielstand; misst die Helligkeit des Bildes.
- Chromium in Prüfständen ohne Hintergrund-Drosselung starten (s. dort):
  sonst schläft der Tab des ersten Spielers, sobald der zweite aufgeht.
- `node pruefstand/interaktion.mjs` — Textbox (Helligkeit unten im Bild),
  blättern, Figur dreht sich beim anderen Spieler, Truhe öffnet für alle.
- `node pruefstand/risse.mjs` — Gruppenschlüssel, Tür, Riss in den Tempel;
  ein dritter Spieler nimmt den Rissstein, der zweite sieht den Riss vergehen.
- Schleime machen Prüfstände zufällig: wer in einem Gebiet mit Gegnern etwas
  prüft, tut es in der Schonfrist nach dem Beitreten (1,5 s).
- `node pruefstand/riftside.mjs` — Start in der Stadt, Ansprechen, Stadttor.
- `node pruefstand/klassen.mjs` — Charakterwahl bei 360 Punkten, Klassenbild
  beim anderen Spieler (Bildpunkte), Feuerball, Heilung, gemessenes Tempo.
- `node pruefstand/inventar.mjs` — Krämerin, kaufen, gesperrte Knöpfe mit
  Grund, anlegen, Trank auf 1, leere Herzen am Bildpunkt, Spielstand-Datei,
  Ladenfenster bei 360 Punkten.
- `node pruefstand/monster.mjs` — alle Monsterbilder geladen und gespiegelt,
  Goblin-Pfeil trifft im Browser, Wolf duckt sich sichtbar.
- Browser-Prüfstände melden sich mit `anmelden()` aus `pruefstand/anmelden.mjs`
  an (wählt, falls nötig); Spielstände darin brauchen `klasse` und `spezies`.
- `node pruefstand/karten.mjs` — erzeugt die Karten in einen Wegwerf-Ordner
  (`KARTEN_ZIEL`) und prüft Boden unter Dingen und alle Übergänge.
- Nach `gegenprobe.sh` ist `dist/` mit absichtlich kaputtem Code gebaut —
  vor dem nächsten `OHNE_BAU=1` neu bauen.
- `UEBER_HTTPS=1` vor `zwei-spieler.mjs` setzt einen https-Weiterleiter
  davor (wie der Cloudflare-Tunnel von `npm run online`). Der echte Tunnel ist
  aus der Cloud-Sitzung nicht erreichbar.
- Jede neue Regel bekommt eine Zeile in `pruefstand/gegenprobe.sh`: absichtlich
  kaputt machen, Prüfung muss anschlagen.
- Ein Prüfstand sagt, wie viel er angesehen hat (Zähler am Ende).
- Wie eine Stelle im Spiel aussieht: `node pruefstand/ansicht.mjs <gebiet> <x> <y> bild.png`
  (Kacheln; mehrere Viererpaare hintereinander möglich).
- Grafiken ansehen: `node pruefstand/grafik-vorschau.mjs inhalte/grafik/ bild.png`
  legt alle PNGs vierfach vergrößert auf ein Bild.

## Berichten

Kurz: was gebaut, was gemessen, was offen. Offenes und Gelerntes ins `ROADMAP.md`.
