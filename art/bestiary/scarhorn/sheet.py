"""Tile clips_render.py's frames into one labelled sheet: python sheet.py frames_dir log.txt out.png"""
import sys
from PIL import Image, ImageDraw
d, log, out = sys.argv[1:4]
names = [l.split(None, 2)[2].rsplit(None, 2)[0] for l in open(log) if l.startswith("CLIP ")]
T = Image.open(f"{d}/clip_0_0.png").width
o = Image.new("RGB", (T * 6, T * ((len(names) * 3 + 5) // 6)), (80, 80, 85)); g = ImageDraw.Draw(o)
for n, name in enumerate(names):
    for k in range(3):
        i = n * 3 + k; x, y = (i % 6) * T, (i // 6) * T
        o.paste(Image.open(f"{d}/clip_{n}_{k}.png"), (x, y)); g.text((x + 6, y + 6), f"{name} {(20, 50, 80)[k]}%", fill=(255, 255, 255))
o.save(out)
