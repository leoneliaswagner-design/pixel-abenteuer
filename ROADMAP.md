# Roadmap

## Steht (Prototyp, 23.10.2026)

- Karte 40×30 aus Tiled-Datei, Wasser animiert, Bäume als 2,5D-Sprites
  (Figuren verschwinden dahinter, die Krone wird dann durchsichtig).
- Held in 4 Farben, 4 Richtungen, Laufen, Schwerthieb; Ecken-Rutschen wie im Original.
- Schleime: wandern, jagen in Sichtweite, Rückstoß, Tod mit Rauch, erscheinen neu.
- Büsche lassen sich schneiden und wachsen nach; Herzen fallen und heilen.
- Bis zu 4 Spieler online; Leben, Treffer, Tod und Wiederbelebung.
- `npm run online`: eigener Rechner als Server, Cloudflare-Tunnel ohne Konto (23.10.2026).
  Hinter https/wss geprüft mit einem nachgebauten Tunnel; der echte Tunnel ist
  aus der Cloud-Sitzung gesperrt und **noch nicht von Hand getestet**.

- Allein-Modus (`?allein`, oder `VITE_ALLEIN=1` beim Bauen): die Regeln aus
  `server/spiel.js` laufen im Browser. Daraus ist die Vorschau-Seite gebaut.

## Als Nächstes (Vorschlag — Reihenfolge offen)

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
