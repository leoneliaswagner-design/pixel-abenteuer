# Roadmap

## Steht (Prototyp, 23.10.2026)

- Karte 40×30 aus Tiled-Datei, Wasser animiert, Bäume als 2,5D-Sprites
  (Figuren verschwinden dahinter, die Krone wird dann durchsichtig).
- Held in 4 Farben, 4 Richtungen, Laufen, Schwerthieb; Ecken-Rutschen wie im Original.
- Schleime: wandern, jagen in Sichtweite, Rückstoß, Tod mit Rauch, erscheinen neu.
- Büsche lassen sich schneiden und wachsen nach; Herzen fallen und heilen.
- Bis zu 4 Spieler online; Leben, Treffer, Tod und Wiederbelebung.
- `npm run online`: eigener Rechner als Server, Cloudflare-Tunnel ohne Konto (23.10.2026).
  Unter Windows von Hand getestet: funktioniert (23.10.2026).

- Allein-Modus (`?allein`, oder `VITE_ALLEIN=1` beim Bauen): die Regeln aus
  `server/spiel.js` laufen im Browser. Daraus ist die Vorschau-Seite gebaut.

- Gebiete mit Übergängen (Oberwelt ↔ Höhle über die Treppe in der Ruine);
  Spieler können sich aufteilen.
- Spielstände: am Namen erkannt, Gebiet/Stelle/Leben, alle 5 s und beim
  Verlassen/Beenden gespeichert, mit Sicherung (.bak). Wiederbelebung an der
  letzten Ankunft.

- Interaktion mit E: Schilder, Figuren (drehen sich zum Sprecher, für alle
  sichtbar), Truhen (offen für alle, im Spielstand). Textbox mit Namen,
  Buchstabe für Buchstabe, blättern mit E/Leertaste. Pixelschrift Press Start 2P.
  Inventar pro Spieler im Spielstand (noch ohne Anzeige).

- Weltzustände (`setzt`, `bedingung`, `text_wenn_…`), Gruppen-Inventar
  (Schlüssel, Risssteine), verschlossene Türen, Anzeige unter den Herzen.
- Erster Dimensionsriss: Höhle (hinter der Tür) → Dschungeltempel; der
  Rissstein schließt ihn, der alte Mann sagt danach etwas anderes.

- **Riftside** als Startgebiet: Hafen mit Stegen, Marktplatz mit Brunnen,
  Rathaus, Fachwerkhäuser, Stadttor nach Norden in den Inselwald (die alte
  Wiese). Bewohner (Platzhalter): Torwache Bruno, Pip, Bürgermeister Aldric,
  Hafenmeisterin Mara. Der Riss zum Tempel liegt jetzt in der Fischergasse.
- Schonfrist ab „bereit" statt ab Beitreten; Antippen einer Richtung dreht.

- Grafik-Durchgang 1: automatische Kanten (Schaum am Ufer, Grasbüschel an
  Wegen und Pflaster) aus der Karte berechnet (`client/kanten.js`); Gras mit
  Farbflecken, Wasser mit Lichtstreifen, Wege mit Kieseln.
  Werkzeug `pruefstand/ansicht.mjs` für Vorher-/Nachher-Bilder.

- **Klassen und Spezies** (D&D-artig, als Daten): Wahl beim ersten
  Beitreten, sechs Attribute → Herzen, Tempo, Schwertschaden, Stärke der
  Fähigkeit. Fünf Klassen mit Fähigkeit auf Q (Schildstoß, Dolchwurf +
  Schlösser knacken, Feuerball + magische Schrift, Heilung, Pfeil), vier
  Spezies. Jede Klasse mit eigener Kopfbedeckung, Tunika in Spielerfarbe.
  Prüfstand `klassen.mjs`.
- **Inventar**: Rucksack (12 Plätze) mit Ausrüstung (Waffe, Rüstung,
  Schmuck; manche nur für bestimmte Klassen), Heiltrank auf Taste 1,
  Krämerin in Riftside mit Charisma-Preisen, Gold von Schleimen. Alles als
  Daten (`gegenstaende.json`, `laeden.json`). Prüfstand `inventar.mjs`.
- **Monster als Daten** (`monster.json`, an das SRD angelehnt): Riesenratte,
  Wolf, Goblin, Skelett, Riesenfledermaus mit vier Verhalten (jagen,
  fernkampf, anspringen, flattern). Neues Gebiet „tiefer Wald" östlich vom
  Inselwald. Prüfstand `monster.mjs`.

- **Neuer Stil** (eher Stardew Valley / Necesse): Figuren 32×48, Ränder in
  Eigenfarbe, Gras ohne Raster, Pflaster aus Steinen, runder Grasrand,
  Schatten unter Wänden, neue Bäume, Büsche, Wasser, Dach, Höhle, Dielen;
  Tag und Nacht mit Licht; Deko und Wind; Textbox, Rucksack und Laden aus
  Holz und Pergament. Prüfstand `optik.mjs`.

- **Weltkarte**: `welt.json` mit 5 Kontinenten und 195 Inseln aus dem
  Kartenbild; Karte im Spiel (M) mit Nebel, Spielerpunkten, Umgebung/ganze
  Welt; Entdecken gehört der Gruppe. Werkzeug `npm run gebiet -- neu/kacheln`
  für eigene Gebiete in Tiled. Prüfstand `weltkarte.mjs`.

- **Segeln**: Meer als Gebiet aus der Weltkarte (256×256), Ruderboot am
  Steg von Riftside, Schwung, Dunst, Kompass, Karte ohne eigenen Punkt,
  Entdecken beim Ansegeln, Anlegestellen aus `hafen` in welt.json.
  Prüfstand `meer.mjs`.

- **Mehr Risse in Riftside** (24.10.2026):
  - Fischergasse → **Dschungeltempel** nach dem Anfang von *Indiana Jones*:
    Fackeln, Stachelfallen im Takt, Druckplatten mit Pfeilen aus der Wand,
    goldenes Idol auf dem Sockel. Wer es nimmt, schließt den Riss und weckt
    die Steinkugel — sie rollt den Gang hinab und bleibt in der Vorhalle
    liegen. Prüfstand `tempel.mjs`.
  - Seilergasse (neu, westlich vom Markt) → **Akropolis**: Marmor, Säulen,
    Skelette; drei Bodenplatten, die nur ein paar Sekunden halten, öffnen
    das Tor (zu zweit leicht, allein ein Wettlauf); die silberne Eule auf
    dem Sockel schließt den Riss.

- **Stufen und Erfahrung** (30.10.2026): Stufe 1–20 nach einer Tabelle in
  `werte.json`; Erfahrung für Siege (alle im Gebiet) und geschlossene Risse
  (alle). Stufen bringen Herzen (3, 6, 9 …), Schaden (5, 11, 20) und eine
  stärkere Fähigkeit (5, 11, 17). Anzeige „St. n" mit Balken, „Stufe n!"
  und Funkeln beim Aufstieg. Prüfstand `stufen.mjs`.

- **Krieger** (30.10.2026): die erste Homebrew-Klasse, ersetzt den Kämpfer.
  Alle 15 Stufen-Fähigkeiten und die drei Pfade (Barbar, Schwertkämpfer,
  Martial Artist) aus Foundry, fürs Echtzeit-Spiel übersetzt: Abprallen,
  Ausweichen, Krit, Betäuben, Verlangsamen, Rausch, Zweiter Atem, Sprint,
  Leerer Körper, Schutzaura, Unerbittlich, Unbeugsam. Pfadwahl auf Stufe 3
  und Attributspunkte (4, 6, 8, 12, 14, 16, 19) im Charakterfenster (C).
  Tasten F/R/T. Prüfstand `krieger.mjs`.

- **Bogenschütze** (31.10.2026): ersetzt den Waldläufer. Alle Stufen-
  Fähigkeiten und die Pfade Meisterschütze, Trickschütze, Jägerschütze:
  Fokussierter Schuss (Ruhe), Reichweite, Tarnung, Gezielter Schuss
  (Durchschlag, F), Doppelschuss, Schnellfeuer (T), Beute markieren (R, für
  die ganze Gruppe), Blendpfeil, Beutezugriff u. a. Prüfstand `bogen.mjs`.
- **Dieb** (31.10.2026): ersetzt den Schurken. Hinterhältiger Schlag (wenn
  der Gegner jemand anderen jagt oder umzingelt ist), Überraschung, mehr
  Gold, Ablenken (F), Schattenentschwinden, Legendärer Coup (T); Pfade
  Assassine (Überraschung kritisch, Gift, Gegnerkenntnis), Akrobat
  (Wandlauf, Ausweichrolle, Sprungangriff), Taktiker (eigene Fallen auf F,
  Schachmeister-Aura), Schattenläufer (Tarnung, Schattenwandeln-Sprung,
  Schutz im Dunkeln), Trickbetrüger (Feilschen, Illusion für alle).
  Soziale Fähigkeiten (Verkleidung, Lügen) sind als Mechanik übersetzt.
  Prüfstand `dieb.mjs`.
- **Menü** (Esc, Knopf ≡): Weiterspielen, Spiel verlassen, Charakter neu
  beginnen, ganze Welt zurücksetzen (nur allein) — mit Rückfrage.

## Grundgerüst — als Nächstes

1. ~~Häuser betreten~~ — Rathaus (Ratsschreiber Theo), Hafenmeisterei
   (Seekarte), Pips Haus (Elsa). Weitere Türen sind noch zu.
2. ~~Klassen und Spezies~~ — offen: die Homebrew-Klassen und -Spezies der
   Kampagne eintragen; Stufen/Erfahrung; Charisma wirkt erst mit Läden.
   Spezies sehen noch alle gleich aus (nur die Klasse hat ein eigenes Bild).
3. ~~Inventar~~ — offen: Ausrüstung sieht man der Figur noch nicht an;
   Gegenstände fallen nur aus Truhen und aus dem Laden (keine Funde auf dem
   Boden, kein Tauschen zwischen Spielern); Gegenstände der Kampagne eintragen.
4. ~~Monster~~ — offen: Monster der Kampagne eintragen; Fledermäuse fliegen
   noch nicht über Hindernisse; kein Sichtlinien-Test (ein Goblin schießt
   auch, wenn ein Baum dazwischen steht — der Pfeil bleibt dann am Baum
   hängen); Bosse.
5. **Töne.**
6. **Handy-Steuerung.**
7. ~~Weltkarte~~, ~~Reisen~~ (Boote, selbst navigieren) — offen: **größere
   Schiffe** (gemeinsam fahren, einer steuert?), Häfen auf anderen Inseln
   (sobald es dort Gebiete gibt), Wetter/Strömung, Karten zu kaufen oder zu
   finden (statt der ganzen Weltkarte von Anfang an?); Namen der Kontinente und Inseln (welt.json); die Startinsel als Ganzes
   (Strände, Leuchtturm …), sobald die Kampagne dazu etwas sagt.
8. Dinge mit `bedingung` (eine Figur erscheint erst nach einem Ereignis) —
   dafür muss `welt.belegt` vom Zustand abhängen.
9. **Homebrew-Klassen** (`konzept/klassen.md`, `konzept/foundry/homebrew.json`):
   Krieger, Bogenschütze, Dieb stehen. Offen: Drachenreiter, Arzt, Koch,
   Musiker, Gelehrter — nach demselben Muster in `klassen.json`. Danach
   fallen Magier und Kleriker weg. Die Spezies aus
   Foundry (18) ersetzen die vier. Beim Krieger mit dem Spielleiter
   abstimmen, ob die Übersetzungen passen (z. B. „Verlässliches Talent" →
   schnellere Abklingzeiten).
10. **Weitere Risse** — welche Orte, sagt die Kampagne. Offen auch: was
   passiert, wenn alle Risse zu sind (die Stadt „gerettet")? Die Leute in
   Riftside kennen bisher nur die Fischergasse; Texte für die Seilergasse
   (`text_wenn_akropolis_geschlossen`) fehlen noch.
11. Die Akropolis-Platten prüft nur server-regeln; ein Browser-Prüfstand
   (Platte am Bildpunkt gedrückt, Tor geht beim anderen auf) fehlt.

## Später (Vorschlag — Reihenfolge offen)

1. **Bildschirmweise Kamera wie im Original** oder bleibt es beim Mitlaufen?
   Mit mehreren Spielern ist Mitlaufen einfacher; eine Mischform wäre: Räume
   mit Grenzen, Kamera folgt innerhalb.
2. **Töne und Musik** (Hieb, Treffer, Herz, Busch).
3. **Handy**: Steuerkreuz und Knöpfe auf dem Schirm.
4. **Zweite Gegnerart** mit anderem Verhalten (z. B. Fernkampf).
5. **Hausbereich/Höhle**: zweite Karte und Übergänge zwischen Karten.
6. **Gegenstände**: Schild, Bomben, Fackeln — und Rätsel, die man nur zu zweit löst.
7. **Räume/Lobbys**: Mehrere Gruppen gleichzeitig auf einem Server.
8. **Echte Grafik**: Die Platzhalter durch handgemalte Pixel ersetzen.
9. **Ohne laufenden Rechner spielen** — zwei Wege:
   - Peer-to-Peer: Seite auf GitHub Pages, ein Browser ist Gastgeber
     (`server/spiel.js` ist reines JS und läuft auch im Browser).
     Braucht einen Vermittlungsdienst zum Kennenlernen; in manchen Netzen
     kommt keine direkte Verbindung zustande.
   - Server bei einem Anbieter (Fly.io, Render, Hetzner).

## Gelernt

- Phaser verliert einen Tastendruck, wenn die Taste im selben Bild losgelassen
  wird (`Key.onUp` setzt `_justDown` zurück). Hieb hört deshalb auf das
  `keydown`-Ereignis.
- Positionen ungerundet senden: auf 0,1 gerundet stand eine Figur an der Wand
  für den Server 0,05 px darin, und er korrigierte.
- Weg-Guthaben statt fester Grenze pro Nachricht: Pakete kommen gebündelt an.
- Ein Teleport-Test ins Wasser prüfte nur die Tempo-Grenze, nie die Wand — erst
  die Gegenprobe hat das gezeigt. Jede Regel einzeln prüfen.
- Das npm-Paket `cloudflared` meldet als Link den ersten trycloudflare-Treffer
  in der Ausgabe — ohne Netz war das `https://api.trycloudflare.com` aus der
  Fehlermeldung. `online.mjs` liest den Link deshalb selbst aus.
- `new URL(…, import.meta.url).pathname` ergibt unter Windows `/C:/…`. Immer
  `fileURLToPath` nehmen.
- Feste Wartezeiten im Prüfstand brechen, sobald Chromium langsamer rendert
  (hinter https: 8 statt 60 Bilder/s). Laufen, bis die Figur steht.
- Neuere npm-Versionen führen Installationsskripte nicht mehr ohne Freigabe aus
  (`allowScripts`). cloudflared kam dadurch beim `npm install` nicht mit herunter;
  `online.mjs` lädt es deshalb selbst nach, wenn es fehlt.
- Wer in Windows „Node.js“ aus dem Startmenü öffnet, landet in der Node-Konsole
  (`>`), nicht in `cmd` — dort scheitert schon `cd`. GitHub-ZIPs entpacken in
  einen Unterordner `pixel-abenteuer-main`.
- `scene.restart()` benutzt dasselbe Szenen-Objekt. Eine beim Gebietswechsel
  gesetzte Sperre blieb stehen, die Figur ließ sich in der Höhle nicht
  bewegen. Zustand in `create` zurücksetzen.
- `bewege()` blieb einen Teilschritt vor der Wand stehen — bei 8 Bildern/s
  bis zu 3 px. Jetzt rückt sie in halben Schritten heran.
- Chromium drosselt Hintergrund-Tabs; im Prüfstand mit zwei Seiten in einem
  Fenster schlief so der erste Spieler. Startargumente gegen die Drosselung.
- Phaser malt Text einmal und merkt ihn sich. Eine Webschrift muss vor dem
  Start geladen sein (`document.fonts.load`), sonst bleibt die Ersatzschrift.
- Text in Seiten teilen: `getWrappedText()` auf einem unsichtbaren Messfeld
  mit demselben Stil wie die Box — dann enden Seiten an Zeilengrenzen.
- Ein Schleim stieß eine Spielerin rückwärts in den Riss, durch den sie
  gerade gekommen war. Ankünfte liegen jetzt zwei Kacheln vor einem
  Übergang, und im Rückstoß gibt es keinen Gebietswechsel.
- Unter Hindernissen und Dingen lag immer der Grund der Karte — in Riftside
  standen Kisten auf Pflasterflecken im Gras. Jetzt der Boden des Nachbarn.
- Eine Schonfrist ab dem Beitreten war vorbei, bevor der Browser Karte und
  Bilder geladen hatte; Spieler wurden getroffen, ohne steuern zu können.
- Kurzes Antippen einer Pfeiltaste ging verloren (wie beim Schwert): Taste
  im selben Bild losgelassen, `isDown` sieht sie nie. Auf `keydown` hören.
- Spielstände von vor dem 24.10.2026 nennen das Gebiet „start" — das heißt
  jetzt „wald"; solche Spieler beginnen neu in Riftside.
- Die Szene lud Bewohner-Bilder nach der Liste in werte.json, bevor
  werte.json geladen war — alle sahen aus wie der alte Mann. Die Prüfstände
  zählten nur Figuren. Jetzt prüft riftside.mjs die Textur jeder Figur.
- Phaser zentriert eine Karte nicht, die kleiner ist als der Bildschirm —
  Innenräume klebten links. Kamera-Grenzen selbst mittig setzen.
- Eine Phaser-RenderTexture über der Karte legte einen dunklen Schleier über
  alles (und verdeckte die Figur). Für viele kleine Bildchen: Blitter.
- Ein Prüfstand schoss den Feuerball nach unten — drei Kacheln weiter stand
  ein Baum, und der Schleim war vom letzten Rückstoß noch in Fahrt. Ziel
  und Weg im Prüfstand aus der Karte wählen, Gegner vorher anhalten.
- Bildpunkte einer Figur in der Schonfrist zählen: sie blinkt, jedes zweite
  Bild ist sie fast durchsichtig. Mehrmals messen. Schnelle Geschosse
  fliegen während des Bildschirmfotos aus einem kleinen Ausschnitt — den
  ganzen Schirm gegen ein Bild vor dem Wurf vergleichen.
- Tempo im Browser messen: Weg durch die Summe der `delta` aus
  `postupdate` — nicht durch Uhrzeit (`setTimeout` oder `time`): Phaser
  glättet delta, gegen die Uhr schwankte es um ±5 %, mehr als der Bonus.
- Die Vorschau-Seite liegt nicht an der Wurzel ihres Servers. Mit Vites
  Standard (`/assets/…`) fand sie ihr Skript nicht, „Losspielen" tat nichts —
  der eigene Test lief an der Wurzel und merkte es nicht. Jetzt `base: './'`
  in vite.config.js; Vorschau vor dem Veröffentlichen unter einem Unterordner
  testen.
- Enter auf dem ✕ des Ladenfensters schloss es — und Phaser sah dasselbe
  Enter einen Augenblick später als „ansprechen": der Laden ging sofort
  wieder auf. Nach dem Schließen zählen Tasten 200 ms lang nicht.
- Ein Prüfstand erwartete, der Heiltrank sei „bei vollem Leben" gesperrt —
  aber das neue Kettenhemd hatte die Herzen erhöht, Kai war gar nicht voll.
  Der Prüfstand irrte, nicht das Spiel; jetzt prüft er das Trinken.
- Jeder Gegner war ein Schleim, auch wenn die Karte etwas anderes sagte:
  `neuerGegner` las `ort.art`, die Art steht aber in `ort.eig.art`. Fiel
  nicht auf, solange es nur Schleime gab. Jetzt prüft server-regeln die Arten.
- Phaser rechnet Winkel in −180…180 um: `setAngle(270)` liest sich als −90.
  Ein Prüfstand, der Winkel vergleicht, muss das wissen.
- `server/spiel.js` läuft im Alleinspiel auch im Browser — dort gibt es kein
  `process`. Umgebungsvariablen nur über `globalThis.process?.env`.
- Der erste Tag begann um 0,3 — mitten im Morgenrot. Bildpunkt-Prüfungen
  (Gras unverändert, Helligkeit der Wiese) schwankten, weil das Licht sich
  während des Prüfstands änderte. Jetzt beginnt der Tag um 0,4.
- Größere Figuren verdecken, was über ihnen steht: der alte Mann im Wald
  trug plötzlich einen Stein als Hut. Beim Bau von Karten eine Kachel Luft
  über Figuren lassen.
- Phaser kennt nur eingebettete Kachelsätze. Damit Tiled-Karten neue
  Kacheln bekommen, erneuert `npm run gebiet -- kacheln` den Satz in allen
  Karten — sonst fehlten in alten Karten die Eigenschaften neuer Kacheln.
- „Dimensionsriss" enthält „riss", nicht „Riss": ein Prüfstand suchte groß
  und schlug an, obwohl das Spiel richtig war. Erst die Prüfung prüfen.
- Ein Messpunkt im Prüfstand lag plötzlich unter dem neuen Kartenknopf (HTML über dem Spiel) — die „Nacht" dort war hell. Messstellen nicht in die Ecken legen, wo Knöpfe sitzen.
- Eine Helligkeitsmessung auf der Weltkarte traf den hellen Spielerpunkt statt der Karte — die Gegenprobe (Nebel überall) biss nicht. Was man misst, darf nicht von etwas anderem verdeckt sein.
- Wasser ist überall `fest` — auf dem Meer konnte deshalb niemand sein, der
  Server setzte jeden, der dort ankam, zurück nach Riftside. Eigene Kachel
  `see`, befahrbar.
- Eine Anlegestelle von einer Kachel trifft man mit Schwung kaum. Drei
  Kacheln breit. Der Prüfstand steuert wie ein Spieler (erst quer, dann
  hinein) — und zielte zuerst auf die falsche Stelle (die nach dem Rudern
  statt der Ankunft).
- risse.mjs scheiterte in der vollen Runde an der Höhlentür: Anna trat zuerst bei, und während Bens Seite lud (langsamer, seit es mehr Bilder gibt), lief ihre Schonfrist ab — ein Schleim stieß sie weg. Wer neben Gegnern geprüft wird, tritt als Letzter bei.
- Eine Gegenprobe („Kompass an Land") simulierte einen Fehler, der nicht vorkommen kann — die Grafik war ohnehin unsichtbar. Der echte Fehler wäre ein Kompass, der nach dem Anlegen stehen bleibt; das prüft meer.mjs jetzt.
- Die Steinkugel sollte erst im Gang liegen bleiben und ihn versperren. Wer
  überrollt wurde, säße dann dahinter fest — sie bleibt jetzt mitten in der
  Vorhalle liegen, und wer genau dort steht, wird zur Seite geschoben.
- Bildpunkt-Messung im Tempel: die mittlere Farbe unterschied Kugel und
  Boden im Dunkeln kaum; der ganze Schirm mit/ohne Kugel zählte flackernde
  Fackeln und hüpfende Schleime mit, und einmal war jeder Bildpunkt anders.
  Jetzt: Szene angehalten (zeichnet weiter, rechnet nicht), ohne Lichtfläche,
  nur im Umkreis, mit Ober- und Untergrenze der Anzahl.
- Ein Stand mit Reihenfolge (Fallen als Liste ohne Namen) funktioniert nur,
  weil Server und Browser dieselben Orte in derselben Reihenfolge filtern.
- Die Vorschau (Version 14) war ohne `VITE_ALLEIN=1` gebaut und suchte einen
  Server — beim Spieler kam nur „Keine Verbindung zum Spielserver". Die
  Prüfstände merken das nicht (sie laufen mit Server); vor dem Veröffentlichen
  gehört eine Anmeldung auf der Vorschau ohne Server dazu.
- In der vollen Runde (Maschine ausgelastet) schlugen einmal `zwei-spieler`
  (Gras neben dem Busch Byte für Byte gleich) und `monster` (Pfeilwinkel)
  fehl, einzeln liefen beide grün. Beide messen bewegte Welt — offen, ob sie
  robuster werden sollten.
- stufen.mjs maß das neue Herz erst, nachdem die Steinkugel (vom Idol
  geweckt) Ana schon getroffen hatte: gemessen wird jetzt gleich nach dem
  Aufstieg.
- dieb.mjs hat drei Mal in die falsche Richtung gemessen: Dinas lila Tunika
  zählte als violette Falle, ein Schleim lief ihr nach, trat in die Falle und
  starb, bevor Tom sie sah, und auf der Falle stehend verdeckte Dina sie.
  Jetzt: grüne Tunika, Start außer Sichtweite, zur Seite treten, alle 50 ms
  nachsehen. Ein Prüfstand, der Gegner in der Nähe hat, muss mit ihnen rechnen.
