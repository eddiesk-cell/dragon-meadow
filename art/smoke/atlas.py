# frames/f000..f079.png -> public/fx/smoke.webp: an 8x8 atlas of 64 frames that loops (the 16 extra frames are
# cross-faded over the first 16, so frame 63 flows into frame 0). Run: python3 art/smoke/atlas.py
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
N, X, G = 64, 16, 8
fr = [Image.open(os.path.join(HERE, 'frames', f'f{i:03d}.png')).convert('RGBA') for i in range(N + X)]
T = fr[0].width
atlas = Image.new('RGBA', (G * T, G * T))
for i in range(N):
    im = Image.blend(fr[N + i], fr[i], i / X) if i < X else fr[i]  # start of the loop fades in over the tail
    atlas.paste(im, ((i % G) * T, (i // G) * T))
out = os.path.join(HERE, '..', '..', 'public', 'fx', 'smoke.webp')
os.makedirs(os.path.dirname(out), exist_ok=True)
atlas.save(out, 'WEBP', quality=80, method=6)
a = atlas.getchannel('A')
assert a.getextrema()[1] > 100, 'atlas is empty: no smoke was rendered'
print('ATLAS', atlas.size, round(os.path.getsize(out) / 1024), 'KB, alpha max', a.getextrema()[1])
