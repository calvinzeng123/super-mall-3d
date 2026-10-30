"""Warp the concept aerial onto the game plan (x east, z south) using the four
plot corners, then overlay current layout outlines for a gap review.

Usage (repo root):
  python3 docs/planning/2026-10-29-p1-concept-fidelity/rectify-concept.py \
    docs/planning/2026-10-28-p1-expansion/aerial-concept-a.png \
    docs/planning/2026-10-29-p1-concept-fidelity/design-data.json out.png
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1]
DATA = sys.argv[2]
OUT = sys.argv[3]
# image pixel of plot corners (NW, NE, SE, SW) measured on the 1672x941 aerial
IMG = np.array([[343, 104], [1297, 90], [1492, 805], [207, 806]], float)
GAME = np.array([[-286, -256], [-16, -256], [-16, -20], [-286, -20]], float)

def homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.array(A))
    h = vt[-1].reshape(3, 3)
    return h / h[2, 2]

H = homography(GAME, IMG)  # game -> image
S = 4.0  # px per metre in the output plan
X0, Z0, X1, Z1 = -306, -276, 4, 0
W, Hh = int((X1 - X0) * S), int((Z1 - Z0) * S)
xs = X0 + (np.arange(W) + .5) / S
zs = Z0 + (np.arange(Hh) + .5) / S
gx, gz = np.meshgrid(xs, zs)
pts = np.stack([gx.ravel(), gz.ravel(), np.ones(gx.size)])
uvw = H @ pts
u = (uvw[0] / uvw[2]).reshape(Hh, W)
v = (uvw[1] / uvw[2]).reshape(Hh, W)
src = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
h, w = src.shape[:2]
u0 = np.clip(np.floor(u).astype(int), 0, w - 2); v0 = np.clip(np.floor(v).astype(int), 0, h - 2)
fu = np.clip(u - u0, 0, 1)[..., None]; fv = np.clip(v - v0, 0, 1)[..., None]
img = (src[v0, u0] * (1 - fu) * (1 - fv) + src[v0, u0 + 1] * fu * (1 - fv) + src[v0 + 1, u0] * (1 - fu) * fv + src[v0 + 1, u0 + 1] * fu * fv)
out = Image.fromarray(img.astype(np.uint8))
out.save(OUT.replace('.png', '-plain.png'))

d = json.load(open(DATA))
dr = ImageDraw.Draw(out, 'RGBA')
P = lambda p: ((p[0] - X0) * S, (p[1] - Z0) * S)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception:
    font = ImageFont.load_default()
for b in d['buildings']:
    dr.polygon([P(q) for q in b['ground']], outline=(0, 255, 255, 255), width=3)
    cx = sum(q[0] for q in b['ground']) / len(b['ground']); cz = sum(q[1] for q in b['ground']) / len(b['ground'])
    dr.text(P((cx, cz)), b['id'], fill=(0, 255, 255, 255), font=font)
for r in d['existingRamps']:
    col = (255, 60, 60, 255) if r['type'].startswith('street') else (255, 200, 0, 255)
    dr.polygon([P(q) for q in r['poly']], outline=col, width=3)
for k in d['kiosks']:
    dr.polygon([P(q) for q in k['poly']], outline=(255, 0, 255, 255), width=2)
for p in d['bridges']:
    for poly in p['polys']:
        dr.polygon([P(q) for q in poly], outline=(255, 255, 255, 200), width=1)
# 20 m grid with labels
for x in range(-300, 1, 20):
    dr.line([P((x, Z0)), P((x, Z1))], fill=(255, 255, 255, 50), width=1)
    dr.text(P((x + .5, -275)), str(x), fill=(255, 255, 255, 200))
for z in range(-270, 1, 20):
    dr.line([P((X0, z)), P((X1, z))], fill=(255, 255, 255, 50), width=1)
    dr.text(P((-305, z + .5)), str(z), fill=(255, 255, 255, 200))
out.save(OUT)
print('saved', OUT, out.size)
# also emit the inverse mapping for later tracing: image px -> game
Hi = np.linalg.inv(H)
json.dump({'game_to_image': H.tolist(), 'image_to_game': (Hi / Hi[2, 2]).tolist()}, open(OUT.replace('.png', '-h.json'), 'w'))
