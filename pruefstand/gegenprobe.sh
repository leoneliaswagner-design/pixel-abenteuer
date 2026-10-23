#!/bin/sh
# Macht absichtlich etwas kaputt und sieht nach, ob die Prüfstände anschlagen.
# Eine Prüfung, die bei einem Fehler grün bleibt, ist keine.
#   sh pruefstand/gegenprobe.sh
cd "$(dirname "$0")/.." || exit 1
fehlt=0

probe() { # Datei, Suchtext, Ersatz, Prüfstand, Beschreibung, [Umgebung]
  cp "$1" "$1.gegenprobe"
  python3 - "$1" "$2" "$3" <<'PY'
import sys
p, alt, neu = sys.argv[1:]
s = open(p).read()
assert alt in s, f"Gegenprobe greift nicht mehr: {alt!r} fehlt in {p}"
open(p, 'w').write(s.replace(alt, neu, 1))
PY
  if [ $? -ne 0 ]; then mv "$1.gegenprobe" "$1"; fehlt=$((fehlt+1)); return; fi
  # Änderungen am Browser-Code brauchen einen neuen Bau, die am Server nicht.
  case "$1" in client/*) bau="" ;; *) bau="OHNE_BAU=1" ;; esac
  if env $bau $6 node "$4" >/dev/null 2>&1; then
    echo "  BISS NICHT  $5"; fehlt=$((fehlt+1))
  else
    echo "  beißt       $5"
  fi
  mv "$1.gegenprobe" "$1"
}

probe server/spiel.js "this.anAlle({ t: 'busch', i, weg: true });" "" pruefstand/zwei-spieler.mjs \
  "Server meldet geschnittene Büsche nicht weiter"
probe server/spiel.js "|| !this.welt.frei(x, y)" "" pruefstand/server-regeln.mjs \
  "Server glaubt Positionen im Wasser"
probe server/spiel.js "weg > s.budget + 2 ||" "" pruefstand/zwei-spieler.mjs \
  "Server glaubt jedes Tempo"
probe client/netz.js "location.protocol === 'https:' ? 'wss' : 'ws'" "'ws'" pruefstand/zwei-spieler.mjs \
  "Browser verbindet fest über ws:// (hinter dem Tunnel gesperrt)" UEBER_HTTPS=1
probe server/spiel.js "if (s.tot || jetzt < s.unverwundbarBis) continue;" "if (s.tot) continue;" pruefstand/server-regeln.mjs \
  "keine Unverwundbarkeit nach einem Treffer"
probe server/spiel.js "if (s.leben >= this.w.spieler.leben) continue;" "" pruefstand/server-regeln.mjs \
  "Herz wird auch mit vollem Leben verbraucht"

echo
if [ $fehlt -gt 0 ]; then echo "$fehlt Gegenproben ohne Wirkung."; exit 1; fi
echo "Gegenproben in Ordnung."
