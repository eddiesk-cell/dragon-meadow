# python3 art/dragon2/beside.py <render.png> <concept.png> <out.png>: the render and the concept side by side, 1024 high.
import sys
from PIL import Image
a, b = (Image.open(p).convert('RGB') for p in sys.argv[1:3])
a, b = (im.resize((im.width * 1024 // im.height, 1024)) for im in (a, b))
s = Image.new('RGB', (a.width + b.width, 1024), 'white'); s.paste(a, (0, 0)); s.paste(b, (a.width, 0)); s.save(sys.argv[3])
