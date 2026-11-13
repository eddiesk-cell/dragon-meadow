# python3 art/dragon2/sheet.py <clips_dir> <out.png>: clips.py's renders as one sheet, a row per clip (A quarter, A side,
# B quarter, B side), labelled with the frames and the clip's worst edge stretch.
import sys, json
from PIL import Image, ImageDraw
d, out = sys.argv[1:3]
st = json.load(open(f'{d}/stats.json')); T = 400
sheet = Image.new('RGB', (4 * T, len(st) * T), 'white'); dr = ImageDraw.Draw(sheet)
for r, (clip, s) in enumerate(st.items()):
    for c, (tag, view) in enumerate([(t, v) for t in 'AB' for v in ('quarter', 'side')]):
        sheet.paste(Image.open(f'{d}/{clip}-{tag}-{view}.png').convert('RGB').resize((T, T)), (c * T, r * T))
    dr.text((6, r * T + 4), f"{clip}  A=f{s['A']} B=f{s['B']}  worst stretch {s['worst']:.2f}x ({s['worstAt']})", fill=(0, 0, 0))
sheet.save(out)
