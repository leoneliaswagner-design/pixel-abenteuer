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

# Inventar, Ausrüstung, Laden
probe server/spiel.js "|| !(s.inventar[art] > 0) || !darfTragen(g, s.klasse)) return;" "|| !(s.inventar[art] > 0)) return;" pruefstand/server-regeln.mjs \
  "jede Klasse trägt alles"
probe gemeinsam/regeln.js "(1 - handel.charismaRabatt * mod.charisma)" "1" pruefstand/server-regeln.mjs \
  "Charisma macht nichts billiger"
probe server/spiel.js "Math.hypot(l.x - s.x, l.y - s.y) < 72" "true" pruefstand/server-regeln.mjs \
  "Handel von überall"
probe server/spiel.js "if (art && !passtHinein(s.inventar, art, this.gegenstaende, this.w.inventar.plaetze)) {" "if (false) {" pruefstand/server-regeln.mjs \
  "Truhe öffnet trotz vollem Rucksack"
probe server/spiel.js "    s.leben = Math.min(s.leben, s.werte.maxLeben);" "" pruefstand/server-regeln.mjs \
  "nach dem Ablegen mehr Leben als Herzen"
probe gemeinsam/regeln.js "1 + bonus(mod.staerke) + plus('schaden')" "1 + bonus(mod.staerke)" pruefstand/server-regeln.mjs \
  "Waffe macht keinen Schaden"
probe server/gebiet.js "    this.spiel.beute(s.id, g);" "" pruefstand/server-regeln.mjs \
  "Schleime geben kein Gold"
probe server/spiel.js "ankunft: s.ankunft, inventar: s.inventar, ausruestung: s.ausruestung," "ankunft: s.ankunft, inventar: s.inventar," pruefstand/inventar.mjs \
  "Ausrüstung fehlt im Spielstand"
probe server/spiel.js "if (heilung && s.leben >= this.maxLeben(s)) {" "if (false) {" pruefstand/server-regeln.mjs \
  "Trank bei vollem Leben verschenkt"
probe client/szenen/Spiel.js "if (this.fenster.offen || jetzt - this.fensterZu < 200) {" "if (this.fenster.offen) {" pruefstand/inventar.mjs \
  "Enter auf ✕ öffnet den Laden gleich wieder"
probe client/szenen/Spiel.js "      this.fenster.aktualisieren();" "" pruefstand/inventar.mjs \
  "Fenster zeigt nach dem Kauf den alten Stand"
probe client/fenster.js '${gesperrt ? `<small class="grund">${html(gesperrt)}</small>` : '"''"'}' "" pruefstand/inventar.mjs \
  "gesperrte Knöpfe ohne Begründung"
probe client/szenen/Spiel.js "      this.maxLeben = m.werte.maxLeben;" "" pruefstand/inventar.mjs \
  "Kettenhemd: kein Herz mehr oben links"
probe client/szenen/Spiel.js "this.input.keyboard.on('keydown-ONE'" "this.input.keyboard.on('keydown-NINE'" pruefstand/inventar.mjs \
  "Taste 1 trinkt nicht"
probe client/index.html "#fenster .kasten { margin: auto; width: 100%; max-width: 560px;" "#fenster .kasten { margin: auto; width: 100%; min-width: 560px;" pruefstand/inventar.mjs \
  "Ladenfenster am Handy rechts abgeschnitten"
probe client/index.html "      .symbol.leer { background-image: none; }" "" pruefstand/inventar.mjs \
  "leere Plätze zeigen das Bildblatt gekachelt"

# Monster (monster.json)
probe server/gebiet.js "    const art = ort.eig?.art ?? 'schleim';" "    const art = 'schleim';" pruefstand/server-regeln.mjs \
  "jedes Monster wird ein Schleim"
probe server/gebiet.js "if (!g.sieht) g.schussBereit = Math.max(g.schussBereit, jetzt + 700);" "" pruefstand/server-regeln.mjs \
  "Goblin schießt im selben Augenblick, in dem er einen sieht"
probe server/gebiet.js "const s = this.spieler().find((s) => !s.tot && jetzt >= s.unverwundbarBis && Math.hypot(s.x - p.x, s.y - 10 - p.y) < 12);" "const s = null;" pruefstand/monster.mjs \
  "Goblin-Pfeile treffen niemanden"
probe server/gebiet.js "    if (d < s.abstand - 24) return zu(g, z, -g.w.jagdGeschwindigkeit);" "" pruefstand/server-regeln.mjs \
  "Goblin weicht nicht zurück"
probe server/gebiet.js "    if (g.phase === 'laden' || g.phase === 'ruhe') return [0, 0];" "    if (g.phase === 'ruhe') return [0, 0];" pruefstand/server-regeln.mjs \
  "Wolf springt ohne sich zu ducken"
probe server/gebiet.js "const quer = Math.sin(jetzt / 1000 * 7 + g.takt) * (g.w.zickzack ?? 1);" "const quer = 0;" pruefstand/server-regeln.mjs \
  "Fledermaus fliegt geradeaus"
probe server/gebiet.js "tot: g.tot, b: g.blick, z: g.phase })" "tot: g.tot, b: g.blick })" pruefstand/monster.mjs \
  "der Browser erfährt nicht, dass der Wolf sich duckt"
probe client/szenen/Spiel.js "        if (!this.textures.exists(art)) this.load.spritesheet(art," "        if (art === 'schleim') this.load.spritesheet(art," pruefstand/monster.mjs \
  "Monsterbilder werden nicht geladen"
probe client/szenen/Spiel.js "      if (e.duckt && e.sprite.texture.has(2)) e.sprite.anims.stop(), e.sprite.setFrame(2);" "      if (false) e.sprite.anims.stop();" pruefstand/monster.mjs \
  "geduckter Wolf sieht aus wie ein laufender"
probe client/szenen/Spiel.js "      e.sprite.setFlipX(g.b === 'rechts');" "" pruefstand/monster.mjs \
  "Monster laufen rückwärts nach rechts"

# Optik: Licht, Tageszeit, Deko, Wind, Figuren 32×48
probe client/licht.js "    if (this.art === 'innen') return INNEN;" "" pruefstand/optik.mjs \
  "Innenräume werden nachts dunkel"
probe client/licht.js "    if (this.art === 'dunkel') return HOEHLE;" "" pruefstand/optik.mjs \
  "Höhle mittags hell"
probe client/szenen/Spiel.js "if (name === 'laterne') this.licht.fest(x, y + 8, 84, 0xffd890, 20);" "if (false) void 0;" pruefstand/optik.mjs \
  "Laternen leuchten nicht"
probe server/gebiet.js "      zeit: this.spiel.tageszeit(jetzt)," "" pruefstand/server-regeln.mjs \
  "der Stand nennt keine Tageszeit"
probe server/spiel.js "globalThis.process?.env?.TAGESZEIT ?? " "" pruefstand/optik.mjs \
  "TAGESZEIT wird nicht beachtet (keine Nacht im Prüfstand)"
probe client/szenen/Spiel.js "    for (const d of dekoBerechnen(this.welt)) this.dekoBild.create(d.x, d.y, d.bild);" "" pruefstand/optik.mjs \
  "keine Deko auf den Wiesen"
probe client/kanten.js "kanten.push({ x, y, bild: 16 });" "void 0;" pruefstand/optik.mjs \
  "keine Schatten unter Wänden"
probe client/szenen/Spiel.js "      this.tweens.add({ targets: bild, angle: { from: -0.8, to: 0.8 }" "      void ({ targets: bild, angle: { from: -0.8, to: 0.8 }" pruefstand/optik.mjs \
  "Bäume stehen still im Wind"
probe client/szenen/Spiel.js "const FIGURBILD = { frameWidth: 32, frameHeight: 48 };" "const FIGURBILD = { frameWidth: 32, frameHeight: 32 };" pruefstand/optik.mjs \
  "Figuren werden mit der alten Höhe geschnitten"

# Weltkarte und Gebiets-Werkzeug
probe server/spiel.js "    this.entdecken(zielName);" "" pruefstand/server-regeln.mjs \
  "neue Gebiete decken die Weltkarte nicht auf"
probe server/spiel.js "if (!o || (!o.riss && !this.welt.regionen?.[o.region]))" "if (false)" pruefstand/server-regeln.mjs \
  "Gebiet ohne Platz auf der Weltkarte fällt nicht auf"
probe client/fenster.js "    g.globalCompositeOperation = 'destination-out';" "" pruefstand/weltkarte.mjs \
  "Nebel liegt auch über Entdecktem"
probe client/fenster.js "    const z = this.nah && hier.punkt ? 5 : 1;" "    const z = 1;" pruefstand/weltkarte.mjs \
  "Umgebungsansicht zeigt die ganze Welt"
probe client/fenster.js "const wo = o.riss ? 'hinter einem Dimensionsriss' : o.see ? 'auf See' : w.regionen[o.region]?.name ?? '?';" "const wo = o.see ? 'auf See' : w.regionen[o.region]?.name ?? '?';" pruefstand/weltkarte.mjs \
  "wer hinter einem Riss ist, steht nirgends"
probe werkzeuge/gebiet.mjs "  welt.gebiete[name] = region === 'riss' ? { riss: true } : { region, punkt: welt.regionen[region].mitte };" "" pruefstand/karten.mjs \
  "neues Gebiet fehlt auf der Weltkarte"
probe werkzeuge/gebiet.mjs "    karte.tilesets = [{ ...kachelsatz(), firstgid: karte.tilesets?.[0]?.firstgid ?? 1 }];" "" pruefstand/karten.mjs \
  "kacheln erneuert nichts"

# Das Meer
probe client/szenen/Spiel.js "    if (this.meer && !ich.tot) return this.rudern(jetzt, dt);" "" pruefstand/meer.mjs \
  "auf See läuft man wie an Land"
probe client/szenen/Spiel.js "    const q = 1 - Math.exp(-wb.beschleunigung * dt);" "    const q = 1;" pruefstand/meer.mjs \
  "Boot ohne Schwung"
probe client/szenen/Spiel.js "    if (this.meer) this.dunstAufbauen();" "" pruefstand/meer.mjs \
  "kein Dunst auf See"
probe client/szenen/Oberflaeche.js "    g.setVisible(an);" "    g.setVisible(true);" pruefstand/meer.mjs \
  "Kompass bleibt nach dem Anlegen stehen"
probe client/fenster.js "o.see ? 'auf See' : " "" pruefstand/meer.mjs \
  "auf See ein Punkt auf der Weltkarte"
probe server/spiel.js "    if (gebiet.meer) this.sichten(s, jetzt);" "" pruefstand/server-regeln.mjs \
  "beim Segeln wird nichts entdeckt"
probe server/spiel.js "    if (s.tot || jetzt < s.naechsterHieb || this.gebiete.get(s.gebiet).meer) return;" "    if (s.tot || jetzt < s.naechsterHieb) return;" pruefstand/server-regeln.mjs \
  "Schwerthieb aus dem Boot"

# Tempel: Fallen, Idol, Steinkugel
probe server/fallen.js "    return (((jetzt + f.versatz) % s.periode) + s.periode) % s.periode < s.oben;" "    return false;" pruefstand/server-regeln.mjs \
  "Stacheln kommen nie hoch"
probe server/fallen.js "          this.pfeilAbfeuern(f, p);" "" pruefstand/server-regeln.mjs \
  "Druckplatte schießt keinen Pfeil"
probe server/fallen.js "        f.zielY = s.y - 10;" "        f.zielY = s.y - 10 + 40;" pruefstand/server-regeln.mjs \
  "Pfeil fliegt an dem vorbei, der auf der Platte steht"
probe server/spiel.js "    const neu = String(namen ?? '').split(',')" "    const neu = [String(namen ?? '')]" pruefstand/server-regeln.mjs \
  "mehrere Weltzustände mit Komma werden nicht getrennt"
probe server/fallen.js "      if (!erfuellt(kg.ausloeser, g.spiel.zustaende())) return;" "      return;" pruefstand/tempel.mjs \
  "das Idol weckt die Kugel nicht"
probe server/fallen.js "    if (Math.abs(s.x - kg.x) > w.radius" "    if (true || Math.abs(s.x - kg.x) > w.radius" pruefstand/server-regeln.mjs \
  "die Kugel überrollt niemanden"
probe gemeinsam/welt.js "    if (this.eig(this.boden[i]).fest || this.gesperrt.has(i)) return true;" "    if (this.eig(this.boden[i]).fest) return true;" pruefstand/server-regeln.mjs \
  "durch die liegende Kugel kann man laufen"
probe client/szenen/Spiel.js "      this.welt.kugelSperren(k.x, m.kugel.y, k.z);" "" pruefstand/tempel.mjs \
  "Browser weiß nicht, dass die Kugel liegt"
probe server/fallen.js "      for (const s of hier) if (!g.welt.frei(s.x, s.y)) g.spiel.freiSchieben(s);" "" pruefstand/server-regeln.mjs \
  "wer unter der Kugel stand, steckt fest"
probe client/szenen/Spiel.js "      kg.bild.setPosition(kg.x, kg.y)" "      kg.bild.setPosition(kg.x, kg.y - 200)" pruefstand/tempel.mjs \
  "Kugel liegt im Bild woanders als im Stand"
probe client/szenen/Spiel.js "'sockel', (d.eig.aussehen === 'marmor' ? 2 : 0) + (offen.includes(d.schluessel) ? 1 : 0));" "'sockel', (d.eig.aussehen === 'marmor' ? 2 : 0));" pruefstand/tempel.mjs \
  "nach dem Neuladen steht das Idol wieder auf dem Sockel"
probe server/fallen.js "      const schon = erfuellt(start.eig.ausloeser, gebiet.spiel.zustaende());" "      const schon = false;" pruefstand/server-regeln.mjs \
  "nach dem Neustart liegt die Kugel wieder oben"

# Akropolis: Platten, Tor, zweiter Riss
probe server/fallen.js "      if (gruppe.every((f) => jetzt < f.gedruecktBis))" "      if (gruppe.some((f) => jetzt < f.gedruecktBis))" pruefstand/server-regeln.mjs \
  "eine Platte allein öffnet das Tor"
probe server/spiel.js "    for (const g of this.gebiete.values()) g.zustaendeGeaendert();" "" pruefstand/server-regeln.mjs \
  "das Tor merkt nicht, dass die Platten gedrückt sind"
probe server/spiel.js "    } else if (ding.name === 'tuer' && e.oeffnet_bei) {" "    } else if (false) {" pruefstand/server-regeln.mjs \
  "das Tor der Akropolis geht mit einem Schlüssel auf"
probe server/gebiet.js "    this.zustaendeGeaendert(false);" "" pruefstand/server-regeln.mjs \
  "nach dem Neustart ist das Tor wieder zu"
probe werkzeuge/karte.mjs "        { ziel: 'akropolis', ankunft: 'von_riftside', art: 'riss', bedingung: '!akropolis_geschlossen' }," "        { ziel: 'akropolis', ankunft: 'von_riftside', bedingung: '!akropolis_geschlossen' }," pruefstand/karten.mjs \
  "die Seilergasse ist kein Riss, sondern eine Haustür"

# Stufen und Erfahrung
probe gemeinsam/regeln.js "  while (n < t.length && erfahrung >= t[n]) n++;" "  while (n < t.length && erfahrung > t[n] * 2) n++;" pruefstand/server-regeln.mjs \
  "Stufen kommen zu spät"
probe server/spiel.js "    for (const s of gebiet.spieler()) if (!s.tot) this.erfahrungGeben(s, n);" "    void gebiet;" pruefstand/server-regeln.mjs \
  "Siege bringen keine Erfahrung"
probe server/spiel.js "      s.leben = s.werte.maxLeben;
      this.gebiete" "      this.gebiete" pruefstand/server-regeln.mjs \
  "Aufstieg füllt die Herzen nicht"
probe server/spiel.js "      klasse: s.klasse, spezies: s.spezies, erfahrung: s.erfahrung," "      klasse: s.klasse, spezies: s.spezies," pruefstand/server-regeln.mjs \
  "Spielstand vergisst die Erfahrung"
probe server/spiel.js "      if (e.erfahrung) for (const p of this.spieler.values())" "      if (e.erfahrung) for (const p of [s])" pruefstand/server-regeln.mjs \
  "ein geschlossener Riss bringt nur dem Finder Erfahrung"
probe gemeinsam/regeln.js " + 2 * erreicht(stufen?.herzAb, stufe)," "," pruefstand/stufen.mjs \
  "Stufen bringen keine Herzen"
probe client/szenen/Oberflaeche.js "    this.balken.width = Math.round((breite - 2) * Math.min(1, hat / braucht));" "    this.balken.width = breite - 2;" pruefstand/stufen.mjs \
  "Erfahrungsbalken immer voll"
probe client/szenen/Oberflaeche.js "      if (st.aufstieg) this.aufstiegZeigen(st.stufe);" "" pruefstand/stufen.mjs \
  "keine Aufstiegs-Schrift in der Mitte"
probe client/szenen/Spiel.js "      this.maxLeben = m.werte.maxLeben;
      this.events.emit('stufe'" "      this.events.emit('stufe'" pruefstand/stufen.mjs \
  "Browser zeigt die neuen Herzen erst nach dem Neuladen"

# Krieger: Fähigkeiten je Stufe, Pfade, Attribute, Kampfeffekte
probe server/spiel.js "    if (this.zufall() < this.schutzGegen(s, art, jetzt)) {" "    if (false) {" pruefstand/server-regeln.mjs \
  "nichts prallt ab"
probe server/spiel.js "    if (art === 'geschoss' || art === 'falle') p += k.ausweichen;" "" pruefstand/server-regeln.mjs \
  "Gefahrensinn hilft nicht gegen Fallen"
probe server/spiel.js "    if (jetzt < s.rauschBis) schaden += s.rauschBoni?.schaden ?? 0;" "" pruefstand/server-regeln.mjs \
  "Kriegsdisziplin bringt keinen Schaden"
probe server/spiel.js "    if (!a || s.tot || jetzt < (s.aktionBereit[a.id] ?? 0) || gebiet.meer) return;" "    if (!a || s.tot || gebiet.meer) return;" pruefstand/server-regeln.mjs \
  "aktive Fähigkeiten ohne Abklingzeit"
probe server/spiel.js "    if (!offeneWahl(k, s.stufe, s.pfad, s.attributPlus).pfad || !Object.hasOwn(k.pfade ?? {}, pfad ?? '')) return;" "    if (!Object.hasOwn(k.pfade ?? {}, pfad ?? '')) return;" pruefstand/server-regeln.mjs \
  "Pfad lässt sich zu früh und mehrmals wählen"
probe server/spiel.js "    if (!ATTRIBUTE.includes(attribut) || !(offeneWahl(k, s.stufe, s.pfad, s.attributPlus).punkte > 0)) return;" "    if (!ATTRIBUTE.includes(attribut)) return;" pruefstand/server-regeln.mjs \
  "beliebig viele Attributspunkte"
probe server/spiel.js "      klasse: s.klasse, spezies: s.spezies, erfahrung: s.erfahrung, pfad: s.pfad, attributPlus: s.attributPlus," "      klasse: s.klasse, spezies: s.spezies, erfahrung: s.erfahrung," pruefstand/server-regeln.mjs \
  "Spielstand vergisst Pfad und Attribute"
probe server/spiel.js "    if (s.leben <= 0 && zaeh && jetzt >= s.zaehBereit) {" "    if (s.leben <= 0 && zaeh) {" pruefstand/server-regeln.mjs \
  "Unerbittlich ohne Pause"
probe server/spiel.js "    const stoss = s.werte?.kampf.standfest ? 0 : ws.stossGeschwindigkeit;" "    const stoss = ws.stossGeschwindigkeit;" pruefstand/server-regeln.mjs \
  "Unbeugsam wird trotzdem zurückgestoßen"
probe server/gebiet.js "    if (jetzt < (g.betaeubtBis ?? 0) && jetzt >= g.stossBis) return;" "" pruefstand/server-regeln.mjs \
  "betäubte Gegner laufen weiter"
probe server/spiel.js "    if (krit) schaden *= k.kritFaktor;" "" pruefstand/server-regeln.mjs \
  "kritische Treffer ohne Wirkung"
probe server/spiel.js "    const aura = Math.max(0, ...this.gebiete" "    const aura = 0 * Math.max(0, ...this.gebiete" pruefstand/server-regeln.mjs \
  "Schutzaura wirkt nicht"
probe gemeinsam/regeln.js "  return [...aus(klasse?.stufen), ...aus(klasse?.pfade?.[pfad]?.stufen)]" "  return [...aus(klasse?.stufen)]" pruefstand/krieger.mjs \
  "der gewählte Pfad bringt nichts"
probe client/figur.js "    if (rot) this.koerper.setTint(0xff6a50);" "" pruefstand/krieger.mjs \
  "Rausch ist beim anderen nicht zu sehen"
probe client/szenen/Spiel.js "    for (const taste of ['F', 'R', 'T']) this.input.keyboard.on" "    for (const taste of []) this.input.keyboard.on" pruefstand/krieger.mjs \
  "Tasten F, R, T tun nichts"
probe client/fenster.js "    if (offen.pfad) {" "    if (false) {" pruefstand/krieger.mjs \
  "das Charakterfenster bietet keine Pfade an"

echo
if [ $fehlt -gt 0 ]; then echo "$fehlt Gegenproben ohne Wirkung."; exit 1; fi
echo "Gegenproben in Ordnung."
