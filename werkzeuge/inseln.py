# Erkennt Kontinente und Inseln auf der Weltkarte (konzept/weltkarte.webp)
# und schreibt sie nach inhalte/daten/welt.json — die Gebiete darin bleiben
# erhalten. Nur nötig, wenn sich das Kartenbild ändert.
#
#   python werkzeuge/inseln.py        (braucht Python 3 und Pillow)
#
# Land ist alles, was nicht blaugrün ist; der Pergamentrand zählt nicht.
import collections, json, os

from PIL import Image

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BILD = os.path.join(WURZEL, 'konzept', 'weltkarte.webp')
ZIEL = os.path.join(WURZEL, 'inhalte', 'daten', 'welt.json')
# Das Meer als Gebiet: eine Kachel je 4 Bildpunkte (karte.mjs baut daraus die
# Karte „meer"). # = Land, ~ = Wasser.
MASKE = os.path.join(WURZEL, 'inhalte', 'daten', 'meer-maske.txt')
MEER_SCHRITT = 4
S = 2  # halbe Auflösung reicht und geht schneller

# Die fünf größten Landmassen in der Reihenfolge ihrer Mitte — die Namen
# sind Lagen, keine erfundenen Namen (die vergibt der Spielleiter).
KONTINENTE = [
    ('nordwesten', 'Nordwest-Kontinent', lambda x, y: x < 512 and y < 512),
    ('nordosten', 'Nordost-Kontinent', lambda x, y: x >= 512 and y < 512),
    ('suedwesten', 'Südwest-Kontinent', lambda x, y: x < 512 and y >= 600),
    ('suedosten', 'Südost-Kontinent', lambda x, y: x >= 512 and y >= 512),
    ('mitte', 'Sichel-Insel in der Mitte', lambda x, y: True),
]


def wasser(r, g, b):
    return b >= r + 8 and (g - b) < 30


def landmassen(mit_maske=False):
    im = Image.open(BILD).convert('RGB')
    klein = im.resize((im.size[0] // S, im.size[1] // S))
    w, h = klein.size
    px = klein.load()
    land = [[not wasser(*px[x, y]) for x in range(w)] for y in range(h)]
    gesehen = [[False] * w for _ in range(h)]
    teile = []
    for y0 in range(h):
        for x0 in range(w):
            if not land[y0][x0] or gesehen[y0][x0]:
                continue
            q = collections.deque([(x0, y0)])
            gesehen[y0][x0] = True
            punkte, rand = [], False
            while q:
                x, y = q.popleft()
                punkte.append((x, y))
                if x <= 2 or y <= 2 or x >= w - 3 or y >= h - 3:
                    rand = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    a, b = x + dx, y + dy
                    if 0 <= a < w and 0 <= b < h and land[b][a] and not gesehen[b][a]:
                        gesehen[b][a] = True
                        q.append((a, b))
            if rand or len(punkte) < 6:
                continue  # Pergamentrand, Krümel
            xs, ys = [p[0] for p in punkte], [p[1] for p in punkte]
            mitte = [round(sum(xs) / len(xs) * S), round(sum(ys) / len(ys) * S)]
            # Die Kompassrose unten rechts ist kein Land.
            if 840 < mitte[0] < 960 and 740 < mitte[1] < 960:
                continue
            teile.append({'flaeche': len(punkte) * S * S, 'mitte': mitte,
                          'box': [min(xs) * S, min(ys) * S, max(xs) * S + S, max(ys) * S + S]})
    teile.sort(key=lambda t: -t['flaeche'])
    if not mit_maske:
        return teile
    # Maske fürs Meer: Land nur, wo eine echte Landmasse ist (kein Rand, kein
    # Kompass); eine Kachel ist Land, wenn die Hälfte ihrer Punkte Land ist.
    echt = [[False] * w for _ in range(h)]
    for t in teile:
        x0, y0, x1, y1 = [v // S for v in t['box']]
        for y in range(y0, y1):
            for x in range(x0, x1):
                if land[y][x]:
                    echt[y][x] = True
    n = MEER_SCHRITT // S
    zeilen = []
    for ty in range(h // n):
        zeile = ''
        for tx in range(w // n):
            summe = sum(echt[ty * n + j][tx * n + i] for j in range(n) for i in range(n))
            zeile += '#' if summe * 2 >= n * n else '~'
        zeilen.append(zeile)
    return teile, zeilen


def main():
    teile, maske = landmassen(mit_maske=True)
    with open(MASKE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(maske) + '\n')
    welt = json.load(open(ZIEL, encoding='utf-8')) if os.path.exists(ZIEL) else {}
    alte = welt.get('regionen', {})
    regionen = {}
    frei = KONTINENTE[:]
    for t in teile[:5]:
        rid, name, passt = next(k for k in frei if k[2](*t['mitte']))
        frei = [k for k in frei if k[0] != rid]
        regionen[rid] = {'name': alte.get(rid, {}).get('name', name), 'art': 'kontinent', 'mitte': t['mitte'], 'box': t['box']}
    for i, t in enumerate(sorted(teile[5:], key=lambda t: (t['mitte'][1] // 64, t['mitte'][0])), 1):
        rid = f'insel-{i:03d}'
        regionen[rid] = {'name': alte.get(rid, {}).get('name', 'Kleine Insel'), 'art': 'insel', 'mitte': t['mitte'], 'box': t['box']}
    welt['regionen'] = regionen
    json.dump(welt, open(ZIEL, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(regionen)} Regionen nach {ZIEL}')


if __name__ == '__main__':
    main()
