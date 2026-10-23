# Roadmap

## Steht (Prototyp, 23.10.2026)

- Karte 40×30 aus Tiled-Datei, Wasser animiert, Bäume als 2,5D-Sprites
  (Figuren verschwinden dahinter, die Krone wird dann durchsichtig).
- Held in 4 Farben, 4 Richtungen, Laufen, Schwerthieb; Ecken-Rutschen wie im Original.
- Schleime: wandern, jagen in Sichtweite, Rückstoß, Tod mit Rauch, erscheinen neu.
- Büsche lassen sich schneiden und wachsen nach; Herzen fallen und heilen.
- Bis zu 4 Spieler online; Leben, Treffer, Tod und Wiederbelebung.

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
9. **Hochladen**: Server bei einem Anbieter, damit Freunde per Link mitspielen.

## Gelernt

- Phaser verliert einen Tastendruck, wenn die Taste im selben Bild losgelassen
  wird (`Key.onUp` setzt `_justDown` zurück). Hieb hört deshalb auf das
  `keydown`-Ereignis.
- Positionen ungerundet senden: auf 0,1 gerundet stand eine Figur an der Wand
  für den Server 0,05 px darin, und er korrigierte.
- Weg-Guthaben statt fester Grenze pro Nachricht: Pakete kommen gebündelt an.
- Ein Teleport-Test ins Wasser prüfte nur die Tempo-Grenze, nie die Wand — erst
  die Gegenprobe hat das gezeigt. Jede Regel einzeln prüfen.
