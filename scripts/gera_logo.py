"""Gera a marca reboka como SVG puro (letras convertidas em contorno a partir da Unbounded 800).
O "k" fica sobre uma placa âmbar, como placa de sinalização. Assim a logo não depende de carregar fonte.
Uso: python3 scripts/gera_logo.py caminho/unbounded-latin-800-normal.woff"""
import sys, json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
f = TTFont(sys.argv[1]); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
k = 1000 / upm
def glifo(ch, x):
    nome = cmap[ord(ch)]; pen = SVGPathPen(gs, lambda v: f"{v:.0f}")
    gs[nome].draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))   # y invertido: SVG cresce para baixo
    b = BoundsPen(gs); gs[nome].draw(b)
    return pen.getCommands(), gs[nome].width * k, b.bounds
ESP = -60                      # aperto entre letras
PAD = 95                       # folga da placa em volta do k
_, _, bk = glifo("k", 0); asc = bk[3] * k        # altura do k (ascendente)
topo = -asc - PAD; base = PAD; ALT = base - topo  # placa: do topo do k até abaixo da linha de base
def placa(x0, larg): return f"M{x0:.0f},{topo:.0f}H{x0+larg:.0f}V{base:.0f}H{x0:.0f}Z"
x = 0; letras = []
for ch in "rebo":
    d, av, b = glifo(ch, x); letras.append(d); x += av + ESP
x += 70
lk = (bk[2] - bk[0]) * k; larg = lk + 2 * PAD
p = placa(x, larg); dk, _, _ = glifo("k", x + PAD - bk[0] * k); x += larg + 70
_, _, ba = glifo("a", 0)
da, ava, _ = glifo("a", x - ba[0] * k); x += (ba[2] - ba[0]) * k
M = 20
vb = f"{-M} {topo-M:.0f} {x+2*M:.0f} {ALT+2*M:.0f}"
# ícone: só a placa com o k
pi = placa(0, larg); dki, _, _ = glifo("k", PAD - bk[0] * k)
out = dict(vb=vb, razao=round((x + 2 * M) / (ALT + 2 * M), 4), letras=" ".join(letras), s=da, colchetes=p, k=dk,
           iconeVb=f"0 {topo:.0f} {larg:.0f} {ALT:.0f}", iconeLarg=round(larg), iconeS="", iconeColchetes=pi, iconeK=dki, topo=round(topo), alt=round(ALT))
open("src/data/logo.json", "w").write(json.dumps(out))
print(out["vb"], out["razao"], len(json.dumps(out)), "bytes")
