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

## Grundgerüst — als Nächstes

1. **Häuser betreten**: Haustüren als Übergänge in Innenräume (Rathaus,
   Hafenmeisterei, Wohnhäuser). Braucht Innenraum-Kacheln (Dielen, Wände,
   Möbel).
2. **Klassen und Spezies als Daten** (`inhalte/daten/klassen.json`): Aussehen
   und eine Sonderfähigkeit je Klasse — für die Homebrew-Klassen der Kampagne.
3. **Töne.**
4. **Handy-Steuerung.**
5. **Weltkarte der Kampagne** in Gebiete zerlegen (Karte liegt in `konzept/`).
6. Dinge mit `bedingung` (eine Figur erscheint erst nach einem Ereignis) —
   dafür muss `welt.belegt` vom Zustand abhängen.

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
