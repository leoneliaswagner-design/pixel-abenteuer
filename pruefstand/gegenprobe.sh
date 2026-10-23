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

probe server/gebiet.js "this.anAlle({ t: 'busch', i, weg: true });" "" pruefstand/zwei-spieler.mjs \
  "Server meldet geschnittene Büsche nicht weiter"
probe server/spiel.js "|| !gebiet.welt.frei(x, y)" "" pruefstand/server-regeln.mjs \
  "Server glaubt Positionen im Wasser"
probe server/spiel.js "weg > s.budget + 2 ||" "" pruefstand/zwei-spieler.mjs \
  "Server glaubt jedes Tempo"
probe client/netz.js "location.protocol === 'https:' ? 'wss' : 'ws'" "'ws'" pruefstand/zwei-spieler.mjs \
  "Browser verbindet fest über ws:// (hinter dem Tunnel gesperrt)" UEBER_HTTPS=1
probe server/spiel.js "if (u) this.wechseln(s, u.eig.ziel, u.eig.ankunft);" "" pruefstand/server-regeln.mjs \
  "Treppe führt nirgendwohin"
probe server/spiel.js "gebiet: tot ? s.ankunft.gebiet : s.gebiet," "gebiet: 'start'," pruefstand/server-regeln.mjs \
  "Spielstand vergisst das Gebiet"
probe server/gebiet.js "if (!hier.length) return;" "" pruefstand/server-regeln.mjs \
  "Gebiete ohne Spieler laufen weiter"
probe server/spiel.js "if (!staende.has(s.gebiet)) staende.set(s.gebiet, this.gebiete.get(s.gebiet).stand(jetzt));" "if (!staende.has(s.gebiet)) staende.set(s.gebiet, this.startGebiet.stand(jetzt));" pruefstand/server-regeln.mjs \
  "alle bekommen den Stand der Oberwelt"
probe gemeinsam/welt.js "        y = heranruecken(welt, x, y, 0, sy, k);" "" pruefstand/server-regeln.mjs \
  "Figur bleibt je nach Bildrate vor der Wand stehen"
probe server/spiel.js "      if (gebiet.istOffen(ding)) {" "      if (false) {" pruefstand/server-regeln.mjs \
  "Truhe lässt sich zweimal plündern"
probe server/spiel.js "      gebiet.anAlle({ t: 'blick', ding: ding.schluessel, r: blick });" "      s.senden({ t: 'blick', ding: ding.schluessel, r: blick });" pruefstand/server-regeln.mjs \
  "Figur dreht sich nur für den, der spricht"
probe gemeinsam/welt.js "|| this.belegt.has(i)" "" pruefstand/server-regeln.mjs \
  "man läuft durch Truhen und Figuren"
probe client/szenen/Spiel.js "      ich.aktualisieren(jetzt);
      return;
    }" "      ich.aktualisieren(jetzt);
    }" pruefstand/interaktion.mjs \
  "Figur läuft während der Textbox weiter"
probe client/szenen/Spiel.js "    this.wechselt = false;" "" pruefstand/gebiete.mjs \
  "Figur bleibt nach dem Gebietswechsel stehen"
probe server/gebiet.js "if (s.tot || jetzt < s.unverwundbarBis) continue;" "if (s.tot) continue;" pruefstand/server-regeln.mjs \
  "keine Unverwundbarkeit nach einem Treffer"
probe server/gebiet.js "if (s.leben >= this.w.spieler.leben) continue;" "" pruefstand/server-regeln.mjs \
  "Herz wird auch mit vollem Leben verbraucht"

echo
if [ $fehlt -gt 0 ]; then echo "$fehlt Gegenproben ohne Wirkung."; exit 1; fi
echo "Gegenproben in Ordnung."
