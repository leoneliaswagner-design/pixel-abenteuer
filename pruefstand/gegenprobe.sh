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
probe server/spiel.js "this.wechseln(s, u.eig.ziel, u.eig.ankunft);" "void 0;" pruefstand/server-regeln.mjs \
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
probe gemeinsam/welt.js "    if (ding && !this.geoeffnet.has(ding.schluessel)) return true;" "" pruefstand/server-regeln.mjs \
  "man läuft durch Truhen, Figuren und Türen"
probe server/gebiet.js "    this.welt.geoeffnet.add(ding.schluessel);
    this.spiel.geaendert = true;" "    this.spiel.geaendert = true;" pruefstand/server-regeln.mjs \
  "aufgeschlossene Tür bleibt fest"
probe server/spiel.js "      if (art && g?.gemeinsam) {" "      if (false) {" pruefstand/server-regeln.mjs \
  "Schlüssel gehört nur dem Finder"
probe server/spiel.js "if (u && erfuellt(u.eig.bedingung, this.zustaende()) && " "if (u && " pruefstand/server-regeln.mjs \
  "geschlossener Riss lässt trotzdem durch"
probe server/spiel.js " && jetzt >= (s.stossBis ?? 0)) this.wechseln" ") this.wechseln" pruefstand/server-regeln.mjs \
  "Rückstoß schiebt durch den Riss"
probe server/spiel.js "    for (const [k, v] of Object.entries(e)) if (k.startsWith('text_wenn_')" "    for (const [k, v] of []) if (k.startsWith('text_wenn_')" pruefstand/server-regeln.mjs \
  "Figuren sagen immer dasselbe"
probe client/szenen/Spiel.js "      const offen = erfuellt(r.ort.eig.bedingung, this.zustaende);" "      const offen = true;" pruefstand/risse.mjs \
  "Riss bleibt im Browser sichtbar, obwohl geschlossen"
probe client/szenen/Spiel.js "      ich.aktualisieren(jetzt);
      return;
    }" "      ich.aktualisieren(jetzt);
    }" pruefstand/interaktion.mjs \
  "Figur läuft während der Textbox weiter"
probe client/szenen/Spiel.js "    this.wechselt = false;" "" pruefstand/gebiete.mjs \
  "Figur bleibt nach dem Gebietswechsel stehen"
probe server/spiel.js "      unverwundbarBis: jetzt + 15000, naechsterHieb: 0," "      unverwundbarBis: jetzt + 1500, naechsterHieb: 0," pruefstand/server-regeln.mjs \
  "Schonfrist läuft ab dem Beitreten, nicht ab „bereit\""
probe server/spiel.js "    else if (m.t === 'bereit') s.unverwundbarBis" "    else if (m.t === 'bereit') void s.unverwundbarBis" pruefstand/server-regeln.mjs \
  "„bereit\" beendet die lange Schonfrist nicht"
probe client/szenen/Spiel.js "        } else if (this.getippt) ich.richtung = this.getippt;" "        }" pruefstand/riftside.mjs \
  "Antippen dreht die Figur nicht"
probe client/szenen/Spiel.js "    else this.load.once('filecomplete-json-werte', (schluessel, art, werte) => leuteLaden(werte));" "" pruefstand/riftside.mjs \
  "alle Bewohner sehen aus wie der alte Mann"
probe werkzeuge/karte.mjs "    return e[n];" "    return e[0];" pruefstand/karten.mjs \
  "alle Haustüren führen ins selbe Haus"
probe client/szenen/Spiel.js "kamera.setBounds(Math.min(0, (kb - sb) / 2)" "kamera.setBounds(0" pruefstand/riftside.mjs \
  "kleine Räume kleben links am Bildrand"
probe client/kanten.js "  { auf: 'wasser', neben: (a) => a && a !== 'wasser', erstesBild: 0 }," "  { auf: 'wasser', neben: () => false, erstesBild: 0 }," pruefstand/karten.mjs \
  "kein Schaum am Ufer"
probe client/kanten.js "  { auf: 'wasser', neben: (a) => a && a !== 'wasser', erstesBild: 0 }," "  { auf: 'wasser', neben: (a) => a !== 'wasser', erstesBild: 0 }," pruefstand/karten.mjs \
  "Schaum auch zur Brücke und am Kartenrand"
probe client/szenen/Spiel.js "    for (const kk of kanten) this.kantenBild.create(kk.x * k0, kk.y * k0, kk.bild);" "" pruefstand/riftside.mjs \
  "Kanten berechnet, aber nicht gezeichnet"
probe client/szenen/Spiel.js "    this.netz.senden({ t: 'bereit' });" "" pruefstand/risse.mjs \
  "Browser meldet sich nie bereit"
probe werkzeuge/karte.mjs "  const grundBei = (x, y) => {" "  const grundBei = (x, y) => {
    return nummer(def.grund);" pruefstand/karten.mjs \
  "Kisten und Truhen stehen auf Pflasterflecken"
probe server/gebiet.js "if (s.tot || jetzt < s.unverwundbarBis) continue;" "if (s.tot) continue;" pruefstand/server-regeln.mjs \
  "keine Unverwundbarkeit nach einem Treffer"
probe server/gebiet.js "if (s.leben >= this.spiel.maxLeben(s)) continue;" "" pruefstand/server-regeln.mjs \
  "Herz wird auch mit vollem Leben verbraucht"

# Klassen und Spezies
probe server/spiel.js "if (!s.waehlt || !this.charakterGueltig(m.klasse, m.spezies)) return;" "if (!s.waehlt) return;" pruefstand/server-regeln.mjs \
  "Server nimmt jede Klasse an, auch erfundene"
probe server/gebiet.js "s.gebiet === this.name && !s.waehlt" "s.gebiet === this.name" pruefstand/server-regeln.mjs \
  "wer noch wählt, steht schon im Spiel"
probe gemeinsam/regeln.js "grund.leben + mod.konstitution" "grund.leben" pruefstand/server-regeln.mjs \
  "Konstitution bringt keine Herzen"
probe server/spiel.js "if (!f || s.tot || jetzt < s.faehigkeitBereit) return;" "if (!f || s.tot) return;" pruefstand/server-regeln.mjs \
  "Fähigkeit ohne Abklingzeit"
probe server/spiel.js "Math.hypot(p.x - s.x, p.y - s.y) <= f.umkreis" "true" pruefstand/server-regeln.mjs \
  "Heilung reicht über die ganze Karte"
probe server/spiel.js "const knackt = s.werte?.vorteile.includes('schloesser') && !e.zauber;" "const knackt = !e.zauber;" pruefstand/server-regeln.mjs \
  "jeder knackt Schlösser"
probe server/spiel.js "if (e.magisch && !s.werte?.vorteile.includes('magie')) {" "if (false) {" pruefstand/server-regeln.mjs \
  "jeder liest magische Schrift"
probe client/main.js "if (!willkommen.charakter) {" "if (false) {" pruefstand/klassen.mjs \
  "Browser lässt die Charakterwahl aus"
probe client/figur.js "this.textur = klasse && szene" "this.textur = false && szene" pruefstand/klassen.mjs \
  "alle Klassen sehen gleich aus"
probe client/szenen/Spiel.js "this.tempo = wk.charakter?.werte.tempo ?? this.w.spieler.geschwindigkeit;" "this.tempo = this.w.spieler.geschwindigkeit;" pruefstand/klassen.mjs \
  "Browser läuft ohne Geschick-Bonus"
probe client/szenen/Spiel.js "    this.geschosseUebernehmen(m.geschosse ?? []);" "" pruefstand/klassen.mjs \
  "Geschosse werden nicht gezeichnet"
probe client/szenen/Spiel.js "        if (f) this.funkeln(f.x, f.y);" "" pruefstand/klassen.mjs \
  "Heilung ohne Funken"
probe client/szenen/Spiel.js "for (const taste of ['Q', 'K'])" "for (const taste of [])" pruefstand/klassen.mjs \
  "Q tut nichts"
probe client/index.html "#start { position: fixed; inset: 0; display: flex;" "#start { position: fixed; inset: 0; display: flex; min-width: 720px;" pruefstand/klassen.mjs \
  "Charakterwahl am Handy rechts abgeschnitten"

echo
if [ $fehlt -gt 0 ]; then echo "$fehlt Gegenproben ohne Wirkung."; exit 1; fi
echo "Gegenproben in Ordnung."
