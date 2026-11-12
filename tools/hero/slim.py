#!/usr/bin/env python3.12
"""Shrink a .glb: re-encode embedded images to <= max_px as JPEG, rebuild the BIN chunk.
python3.12 tools/hero/slim.py <in.glb> <out.glb> [max_px=2048]"""
import io, json, struct, sys
from PIL import Image

def read(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF', 'not a glb'
    jl, jt = struct.unpack('<II', b[12:20]); assert jt == 0x4E4F534A
    j = json.loads(b[20:20 + jl])
    o = 20 + jl; bl, bt = struct.unpack('<II', b[o:o + 8]); assert bt == 0x004E4942
    return j, b[o + 8:o + 8 + bl]

def counts(j):
    return {k: len(j.get(k, [])) for k in ('nodes', 'meshes', 'skins', 'animations', 'accessors')}

def pad(b, fill):
    return b + fill * (-len(b) % 4)

def slim(src, dst, max_px=2048):
    j, bin_ = read(src)
    normal = {t['source'] for m in j.get('materials', []) for k in [m.get('normalTexture')] if k
              for t in [j['textures'][k['index']]] if 'source' in t}
    new = {}
    for i, im in enumerate(j.get('images', [])):
        if 'bufferView' not in im: continue
        bv = j['bufferViews'][im['bufferView']]
        img = Image.open(io.BytesIO(bin_[bv.get('byteOffset', 0):][:bv['byteLength']]))
        img.load()
        if max(img.size) > max_px:
            s = max_px / max(img.size)
            img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
        if img.mode in ('RGBA', 'LA') and img.getchannel('A').getextrema()[0] < 255:
            fmt, kw, mime = 'PNG', {'optimize': True}, 'image/png'  # real transparency: JPEG would lose it
        else:
            fmt, kw, mime = 'JPEG', {'quality': 95 if i in normal else 88}, 'image/jpeg'
            img = img.convert('RGB')
        out = io.BytesIO(); img.save(out, fmt, **kw)
        new[im['bufferView']] = out.getvalue(); im['mimeType'] = mime
        print(f'image {i}: {"normal" if i in normal else "colour"} -> {img.size[0]}x{img.size[1]} {fmt} {len(new[im["bufferView"]])/1e6:.2f} MB')
    chunks, off = [], 0
    for i, bv in enumerate(j['bufferViews']):
        data = new.get(i, bin_[bv.get('byteOffset', 0):][:bv['byteLength']])
        bv['byteOffset'], bv['byteLength'] = off, len(data)
        padded = pad(data, b'\0'); chunks.append(padded); off += len(padded)
    body = b''.join(chunks)
    j['buffers'][0]['byteLength'] = len(body)
    js = pad(json.dumps(j, separators=(',', ':')).encode(), b' ')
    bn = pad(body, b'\0')
    glb = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(bn)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bn), 0x004E4942) + bn
    open(dst, 'wb').write(glb)
    j0, _ = read(src); j1, b1 = read(dst)
    assert counts(j0) == counts(j1), (counts(j0), counts(j1))
    assert len(b1) == len(bn)
    print(f'{len(open(src,"rb").read())/1e6:.1f} MB -> {len(glb)/1e6:.1f} MB; {counts(j1)}')

if __name__ == '__main__':
    slim(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2048)
