# python3 grid.py <png> : draw the world grid (0.1 m, labelled every 0.2 m) on an overlay.py render, using its .json frame.
import sys, json
from PIL import Image, ImageDraw
png = sys.argv[1]; f = json.load(open(png[:-4] + '.json'))
im = Image.open(png).convert('RGB'); dr = ImageDraw.Draw(im)
c, r, u, m, W, H = f['centre'], f['right'], f['up'], f['mpp'], f['W'], f['H']
ax = lambda v: max(range(3), key=lambda i: abs(v[i]))
ar, au = ax(r), ax(u); sr, su = (1 if r[ar] > 0 else -1), (1 if u[au] > 0 else -1)
name = 'xyz'
def px(w): return W / 2 + (w - c[ar]) * sr / m
def py(w): return H / 2 - (w - c[au]) * su / m
lo_r, hi_r = sorted([c[ar] - W / 2 * m, c[ar] + W / 2 * m]); lo_u, hi_u = sorted([c[au] - H / 2 * m, c[au] + H / 2 * m])
for k in range(int(lo_r * 10) - 1, int(hi_r * 10) + 2):
    x = px(k / 10); dr.line([(x, 0), (x, H)], fill=(90, 90, 90) if k % 5 else (200, 200, 200), width=1)
    if k % 2 == 0: dr.text((x + 2, H - 12), f'{name[ar]}{k / 10:+.1f}', fill=(255, 255, 0))
for k in range(int(lo_u * 10) - 1, int(hi_u * 10) + 2):
    y = py(k / 10); dr.line([(0, y), (W, y)], fill=(90, 90, 90) if k % 5 else (200, 200, 200), width=1)
    if k % 2 == 0: dr.text((2, y + 2), f'{name[au]}{k / 10:+.1f}', fill=(255, 255, 0))
im.save(png)
