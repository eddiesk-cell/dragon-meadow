"""Castle kit (PLAN.md, lane castle-kit): grey stacked-stone pieces for Castle Crestwatch and Asterhaven.
  blender -b -P tools/world/castle_kit.py -- public/models/world [shots]
Writes castle-kit.glb, one node per piece, EVERY node at the origin: base centre on the ground (glTF y = 0), foundations
run 3 m below it so a piece can sit on a slope. Metres, glTF axes (the outer face of a piece looks toward +Z):
  wall          10 m segment along X (ends at x = +-5), 4 m thick, walkway at 14 m, merlons on the outer (+Z) side
  tower_round   r 5.5 m, battlements to 28.4 m, conical slate roof to ~38 m
  tower_square  9 x 9 m, battlements to 29.4 m
  gatehouse     20 m wide (walls butt on at x = +-10), arched passage 5 x 8.5 m running along Z, portcullis half up
  keep          28 x 22 m hall, upper tower with battlements at ~50 m, corner turrets, slate spire to 60 m
  banner        3 x 10 m hanging banner, origin = its top bar; it hangs down -Y with the cloth facing +Z
Materials: stone (masonry texture, 4 m tile, + normal map), slate (shingle texture), iron, window, cloth, emblem.
UVs are world-scale per face (v = height on walls), so stone courses line up across pieces standing at one height.
Window glow mask: COLOR_0 rgb is white everywhere, alpha 1 on window panes and 0 elsewhere; the panes also carry
material `window`. One material can mix gold in by ctx.night.
With a second arg, renders <shots>/castle-kit-{day,night,close,pieces}.png: a test castle (keep, 4 round towers,
2 square towers, walls, gatehouse, banners) built from the EXPORTED glb, beside public/models/hero.glb.
"""
import bpy, bmesh, sys, os
import numpy as np
from math import pi, cos, sin, atan2, hypot, sqrt
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out_dir, shots = args[0], (args[1] if len(args) > 1 else None)
GLB = os.path.join(out_dir, "castle-kit.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = np.random.default_rng(7)


# ---------- textures (numpy, periodic so they tile) ----------
def blur(a, s):  # gaussian blur in the frequency domain: wraps at the edges, so the result tiles
    f = np.fft.fftfreq(a.shape[0])[:, None] ** 2 + np.fft.fftfreq(a.shape[1])[None, :] ** 2
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * (pi * s) ** 2 * f)))


def noise(n, s):
    a = blur(rng.standard_normal((n, n)), s)
    return a / a.std()


def cuts(tile, lo, hi):  # random lengths in [lo, hi] rescaled to sum to exactly one tile -> edges 0..tile
    ls = []
    while sum(ls) < tile:
        ls.append(rng.uniform(lo, hi))
    return np.concatenate([[0], np.cumsum(np.array(ls) * tile / sum(ls))])


def blocks(n, tile, rows, lo, hi):
    """Running-bond blocks: per pixel the distance to the nearest joint (m), the block id, and the row fraction t."""
    p = (np.arange(n) + .5) * tile / n
    d, bid, t = np.zeros((n, n)), np.zeros((n, n), int), np.zeros((n, n))
    ev, base = rows, 0
    for r in range(len(ev) - 1):
        m = (p >= ev[r]) & (p < ev[r + 1])
        eu, ph = cuts(tile, lo, hi), rng.uniform(0, tile)
        uu = (p - ph) % tile
        i = np.searchsorted(eu, uu, "right") - 1
        dx = np.minimum(uu - eu[i], eu[i + 1] - uu)
        dy = np.minimum(p[m] - ev[r], ev[r + 1] - p[m])
        d[m] = np.minimum(dx[None, :], dy[:, None])
        bid[m] = (base + i)[None, :]
        t[m] = ((p[m] - ev[r]) / (ev[r + 1] - ev[r]))[:, None]
        base += len(eu)
    return d, bid, t, base


def smooth(e0, e1, x):
    x = np.clip((x - e0) / (e1 - e0), 0, 1)
    return x * x * (3 - 2 * x)


def normal_map(h, n, tile, amp):  # height (m) -> tangent-space normal, rows run bottom to top (Blender image order)
    k = n / tile
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * k / 2 * amp
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * k / 2 * amp
    v = np.stack([-gx, -gy, np.ones_like(h)], -1)
    return v / np.linalg.norm(v, axis=-1, keepdims=True) * .5 + .5


def masonry(n=1024, tile=4.0):
    """Coursed ashlar: 8 courses of ~0.5 m, blocks 0.7-1.5 m, recessed mortar, per-block tone, weathering."""
    d, bid, _, nb = blocks(n, tile, cuts(tile, .42, .62), .7, 1.5)
    tone = 1 + .11 * rng.standard_normal(nb)
    warm = .035 * rng.standard_normal(nb)
    h = smooth(.012, .05, d) * (1 + .15 * noise(n, 3)) + .25 * smooth(.02, .3, d) * noise(n, 18) * .3
    stone = np.array([.58, .56, .52])[None, None, :] * tone[bid][..., None]
    stone[..., 0] += warm[bid]
    stone[..., 2] -= warm[bid]
    col = np.where((d < .012)[..., None], np.array([.34, .33, .31]), stone)
    col = col * (.78 + .22 * smooth(.012, .06, d))[..., None]
    col = col * (1 + .07 * noise(n, 1.2))[..., None] * (1 + .08 * noise(n, 60))[..., None]
    return col, normal_map(h * .03, n, tile, 1.0)


def shingles(n=512, tile=2.0):
    """Slate: 8 rows of 0.25 m, shingles 0.28-0.42 m wide, each thickest at its bottom (exposed) edge."""
    d, bid, t, nb = blocks(n, tile, np.linspace(0, tile, 9), .28, .42)
    tone = 1 + .13 * rng.standard_normal(nb)
    h = np.where(d < .01, 0, 1 - .7 * t)
    col = np.array([.29, .31, .35])[None, None, :] * tone[bid][..., None]
    col = col * (.55 + .45 * smooth(.008, .03, d))[..., None] * (1 - .35 * smooth(.8, 1, t))[..., None]
    col = col * (1 + .06 * noise(n, 1.0))[..., None]
    return col, normal_map(h * .012, n, tile, 1.0)


def image(name, rgb, non_color=False):
    n = rgb.shape[0]
    img = bpy.data.images.new(name, n, n, alpha=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    px = np.concatenate([np.clip(rgb, 0, 1), np.ones((n, n, 1))], 2).astype(np.float32)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def mat(name, rgb=(1, 1, 1), rough=.85, metal=0., tex=None, nrm=None, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if tex:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = tex
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if nrm:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = nrm
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    m.use_backface_culling = not double
    return m


sc, sn = masonry()
lc, ln = shingles()
MATS = [mat("stone", rough=.9, tex=image("stone", sc), nrm=image("stone_n", sn, True)),
        mat("slate", rough=.6, tex=image("slate", lc), nrm=image("slate_n", ln, True)),
        mat("iron", (.035, .035, .04), .5, .6),
        mat("window", (.03, .035, .045), .25),  # dark glass by day; the game lights it by the vertex alpha mask
        mat("cloth", (.25, .028, .026), .9, double=True),
        mat("emblem", (.70, .52, .22), .6)]
S, SL, IR, WI, CL, EM = range(6)
TILE = [4.0, 2.0, 1, 1, 1, 1]  # metres per texture repeat, per material


# ---------- geometry (Blender: Z up, outer faces toward -Y, which glTF writes as +Z) ----------
bm = None


def face(vs, m):
    f = bm.faces.new(vs)
    f.material_index = m
    f.smooth = True  # sharp edges come from set_sharp_from_angle, so cylinders shade round and boxes stay crisp
    return f


def loft(rings, m, bottom=True, top=True):
    """rings: lists of (x, y, z), equal length, CCW seen from above -> closed tube, normals outward."""
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    k = len(vs[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(k):
            face((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]), m)
    if bottom:
        face(list(reversed(vs[0])), m)
    if top:
        face(vs[-1], m)


def circle(r, k, z, cx=0, cy=0, a0=0.):
    return [(cx + r * cos(a0 + 2 * pi * i / k), cy + r * sin(a0 + 2 * pi * i / k), z) for i in range(k)]


def rect(cx, cy, hx, hy, z, rot=0.):
    c, s = cos(rot), sin(rot)
    return [(cx + x * c - y * s, cy + x * s + y * c, z) for x, y in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]


def box(cx, cy, z0, z1, hx, hy, m=S, rot=0.):
    loft([rect(cx, cy, hx, hy, z0, rot), rect(cx, cy, hx, hy, z1, rot)], m)


def cone(cx, cy, r, z0, h, k, m=SL):
    ring = [bm.verts.new(p) for p in circle(r, k, z0, cx, cy)]
    tip = bm.verts.new((cx, cy, z0 + h))
    for i in range(k):
        face((ring[i], ring[(i + 1) % k], tip), m)
    face(list(reversed(ring)), m)


def slab(o, t, prof, d0, d1, m, back=False):
    """Profile [(u, v)] CCW in the vertical plane through o (u along t, v = height), pushed out along n = t x Z."""
    o, t = Vector(o), Vector(t).normalized()
    n, up = t.cross(Vector((0, 0, 1))), Vector((0, 0, 1))
    a = [bm.verts.new(o + t * u + up * v + n * d0) for u, v in prof]
    b = [bm.verts.new(o + t * u + up * v + n * d1) for u, v in prof]
    k = len(prof)
    face(b, m)
    if back:
        face(list(reversed(a)), m)
    for i in range(k):
        face((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]), m)


def arch(w, z0, z1, pointed=True, k=3):
    """Window/door outline: w wide, straight sides z0..z1, then a pointed (lancet) or round head."""
    if pointed:  # two arcs of radius w meeting at the apex
        right = [(-w / 2 + w * cos(a), z1 + w * sin(a)) for a in np.linspace(0, pi / 3, k + 1)]
    else:
        right = [(w / 2 * cos(a), z1 + w / 2 * sin(a)) for a in np.linspace(0, pi / 2, k + 1)]
    left = [(-u, v) for u, v in reversed(right[:-1])]
    return [(-w / 2, z0), (w / 2, z0)] + right + left


def window(o, t, w, z0, z1, pointed=True, out=.12):
    slab(o, t, arch(w, z0, z1, pointed) if z1 - z0 > w * .6 else [(-w / 2, z0), (w / 2, z0), (w / 2, z1), (-w / 2, z1)],
         -.15, out, WI)


def on_circle(cx, cy, r, a):  # point on a round wall and its CCW tangent (so t x Z is the outward normal)
    return (cx + r * cos(a), cy + r * sin(a), 0), (-sin(a), cos(a), 0)


def merlons(poly, z, inset=.4, w=1.1, h=1.3, pitch=2.0, d=.8):
    """Merlon blocks along every edge of a CCW polygon (corners included), sitting `inset` inside the edge."""
    for (x0, y0, _), (x1, y1, _) in zip(poly, poly[1:] + poly[:1]):
        L = hypot(x1 - x0, y1 - y0)
        ex, ey = (x1 - x0) / L, (y1 - y0) / L
        n = max(1, round(L / pitch))
        for i in range(n):
            f = (i + .5) / n
            box(x0 + (x1 - x0) * f - ey * inset, y0 + (y1 - y0) * f + ex * inset, z, z + h, w / 2, d / 2, S, atan2(ey, ex))


def round_tower(cx, cy, r, zc, roof=1.7, k=24, slits=(), corbels=True):
    """Battered drum to zc, corbelled parapet (floor zc+1.2, top zc+2.6), merlons, optional cone roof (h = roof*r)."""
    ro, ri = r + .8, r - .1
    loft([circle(r + .9, k, -3, cx, cy), circle(r, k, 4, cx, cy), circle(r, k, zc, cx, cy),
          circle(ro, k, zc + 1.2, cx, cy), circle(ro, k, zc + 2.6, cx, cy), circle(ri, k, zc + 2.6, cx, cy),
          circle(ri, k, zc + 1.2, cx, cy)], S, bottom=False)
    km = max(6, round(2 * pi * (r + .35) / 2.0))
    merlons(circle(r + .35 / cos(pi / km), km, 0, cx, cy), zc + 2.6, inset=0, d=.9)
    if corbels:
        for i in range(km * 2):
            a = 2 * pi * (i + .5) / (km * 2)
            box(cx + (r + .25) * cos(a), cy + (r + .25) * sin(a), zc - .9, zc + .4, .3, .22, S, a)
    if roof:
        cone(cx, cy, r + .2, zc + 2.3, roof * r, k)
        box(cx, cy, zc + 2.3 + roof * r - .3, zc + 2.3 + roof * r + 1.6, .06, .06, IR)  # finial
    for z, n, a0 in slits:
        for i in range(n):
            o, t = on_circle(cx, cy, r, a0 + 2 * pi * i / n)
            window(o, t, .45, z, z + 1.9)


def square_tower(cx, cy, hw, zc, windows=True):
    ho, hi = hw + .6, hw - .3
    loft([rect(cx, cy, hw + .9, hw + .9, -3), rect(cx, cy, hw, hw, 4), rect(cx, cy, hw, hw, zc),
          rect(cx, cy, ho, ho, zc + 1.0), rect(cx, cy, ho, ho, zc + 2.4), rect(cx, cy, hi, hi, zc + 2.4),
          rect(cx, cy, hi, hi, zc + 1.0)], S, bottom=False)
    merlons(rect(cx, cy, ho, ho, 0), zc + 2.4)
    for i in range(4):  # one face per side: slits low, a lancet window high
        a = -pi / 2 + i * pi / 2
        o, t = (cx + hw * cos(a), cy + hw * sin(a), 0), (-sin(a), cos(a), 0)
        for u in (-hw / 2, hw / 2):
            window((o[0] + t[0] * u, o[1] + t[1] * u, 0), t, .45, 9, 10.9)
        if windows:
            window(o, t, 1.1, zc - 7, zc - 4)


# ---------- pieces ----------
def begin():
    global bm
    bm = bmesh.new()


def finish(name):
    bm.normal_update()
    uv = bm.loops.layers.uv.new("UVMap")
    col = bm.loops.layers.float_color.new("Color")
    Z = Vector((0, 0, 1))
    for f in bm.faces:
        n = f.normal
        t = Vector((1, 0, 0)) if abs(n.z) > .999 else Z.cross(n).normalized()
        b, s = n.cross(t), TILE[f.material_index]
        for l in f.loops:
            l[uv].uv = (l.vert.co.dot(t) / s, l.vert.co.dot(b) / s)
            l[col] = (1, 1, 1, 1. if f.material_index == WI else 0.)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in MATS:
        me.materials.append(m)
    me.set_sharp_from_angle(angle=.6)
    me.color_attributes.active_color = me.color_attributes["Color"]
    me.color_attributes.render_color_index = 0
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def wall():
    begin()
    loft([rect(0, 0, 5, 2.6, -3), rect(0, 0, 5, 2, 3), rect(0, 0, 5, 2, 14)], S, bottom=False)
    box(0, -2.1, 12.8, 14, 5, .5)            # corbel band under the outer parapet
    box(0, -1.65, 14, 15.2, 5, .75)          # outer parapet
    box(0, 1.75, 14, 15.0, 5, .3)            # low inner parapet
    for x in (-4, -2, 0, 2, 4):
        box(x, -1.65, 15.2, 16.5, .55, .75)  # merlons, outer side
    for x in (-2.5, 2.5):
        window((x, -2, 0), (1, 0, 0), .45, 7.5, 9.4)
    return finish("wall")


def tower_round():
    begin()
    round_tower(0, 0, 5.5, 24, roof=1.7, slits=((8, 4, pi / 4), (14, 4, 0), (19.5, 4, pi / 4)))
    return finish("tower_round")


def tower_square():
    begin()
    square_tower(0, 0, 4.5, 26)
    return finish("tower_square")


def gatehouse():
    begin()
    # central block, passage through Y: a U-shaped profile with a round arch, extruded 10 m deep
    prof = [(-6, -3), (-2.5, -3)] + [(2.5 * cos(a), 6 + 2.5 * sin(a)) for a in np.linspace(pi, 0, 9)] + \
           [(2.5, -3), (6, -3), (6, 18), (-6, 18)]
    slab((0, 0, 0), (1, 0, 0), prof, -5, 5, S, back=True)
    box(0, 0, -3, 0, 2.6, 5)                                   # passage floor fill below ground
    merlons(rect(0, 0, 6, 5, 0), 18, inset=.4)
    box(0, -5.5, 12.2, 14.2, 4, .6)                            # machicolation over the gate
    for x in (-3.2, -1.6, 0, 1.6, 3.2):
        box(x, -5.4, 11.4, 12.3, .25, .5)
    for x in (-3.5, 0, 3.5):                                   # lit windows front and back
        window((x, -5, 0), (1, 0, 0), .9, 15, 16.4)
        window((x, 5, 0), (-1, 0, 0), .9, 15, 16.4)
    for sx in (-1, 1):                                         # flanking drums, crenellated, no roofs
        round_tower(sx * 8, -1.5, 4.5, 20, roof=0, k=20, slits=((9, 3, -pi / 2 - sx * .5), (14.5, 3, -pi / 2)))
    # portcullis, half raised, just inside the front arch (bars stop at the arch)
    y = -4.2
    for x in np.linspace(-2.1, 2.1, 7):
        box(x, y, 3.4, 6 + sqrt(2.5 ** 2 - x * x) - .05, .07, .07, IR)
    for z in (3.8, 4.9, 6.0, 7.1):
        hx = 2.45 if z <= 6 else sqrt(2.5 ** 2 - (z - 6) ** 2) - .05
        box(0, y, z, z + .14, hx, .06, IR)
    return finish("gatehouse")


def keep():
    begin()
    hx, hy, zc = 14, 11, 30
    loft([rect(0, 0, hx + 1, hy + 1, -3), rect(0, 0, hx, hy, 3), rect(0, 0, hx, hy, zc),
          rect(0, 0, hx + .6, hy + .6, zc + 1.2), rect(0, 0, hx + .6, hy + .6, zc + 2.6),
          rect(0, 0, hx - .3, hy - .3, zc + 2.6), rect(0, 0, hx - .3, hy - .3, zc + 1.2)], S, bottom=False)
    merlons(rect(0, 0, hx + .6, hy + .6, 0), zc + 2.6)
    for z in (13, 22):                                         # string courses at the floor lines
        box(0, 0, z, z + .5, hx + .25, hy + .25)
    for side, (o, t, half, xs) in enumerate((((0, -hy, 0), (1, 0, 0), hx, (-11, -5.5, 0, 5.5, 11)),
                                              ((0, hy, 0), (-1, 0, 0), hx, (-11, -5.5, 0, 5.5, 11)),
                                              ((hx, 0, 0), (0, 1, 0), hy, (-5, 0, 5)),
                                              ((-hx, 0, 0), (0, -1, 0), hy, (-5, 0, 5)))):
        for u in xs:
            p = (o[0] + t[0] * u, o[1] + t[1] * u, 0)
            if side or u:                                      # the front centre is the door
                window(p, t, 1.8, 7, 10.5)
            window(p, t, 1.8, 16, 19.5)
            window(p, t, 1.4, 25, 27)
    slab((0, -hy, 0), (1, 0, 0), arch(4.4, -.5, 5.5, pointed=True), -.2, .25, IR)  # great door
    for sx in (-1, 1):                                         # corner turrets, full height
        for sy in (-1, 1):
            round_tower(sx * hx, sy * hy, 3.0, zc + 5, roof=2.2, k=16, corbels=False,
                        slits=((12, 2, atan2(sy, sx) - .5), (24, 2, atan2(sy, sx) - .5)))
    # upper tower
    uh, uz = 7, 47
    loft([rect(0, 1, uh, uh, zc), rect(0, 1, uh, uh, uz), rect(0, 1, uh + .6, uh + .6, uz + 1.2),
          rect(0, 1, uh + .6, uh + .6, uz + 2.6), rect(0, 1, uh - .3, uh - .3, uz + 2.6),
          rect(0, 1, uh - .3, uh - .3, uz + 1.2)], S, bottom=False)
    merlons(rect(0, 1, uh + .6, uh + .6, 0), uz + 2.6)
    for o, t in (((0, 1 - uh, 0), (1, 0, 0)), ((0, 1 + uh, 0), (-1, 0, 0)), ((uh, 1, 0), (0, 1, 0)), ((-uh, 1, 0), (0, -1, 0))):
        for u in (-2.6, 2.6):
            window((o[0] + t[0] * u, o[1] + t[1] * u, 0), t, 1.6, 36, 41)
    for sx in (-1, 1):
        for sy in (-1, 1):
            round_tower(sx * uh, 1 + sy * uh, 1.7, uz + 2, roof=2.4, k=12, corbels=False)
    cone(0, 1, 5.6, uz + 1.6, 60 - uz - 1.6, 8)               # octagonal slate spire, tip at 60 m
    box(0, 1, 59.6, 62, .08, .08, IR)
    return finish("keep")


def banner():
    begin()
    box(0, -.05, -.15, .15, 1.8, .08, IR)                      # top bar
    W, H, cols, rows = 1.5, 10, 6, 12
    surf = lambda x, z: (x, -.16 - .18 * sin(pi * min(1, -z / H)) - .04 * sin(4 * pi * x / W), z)
    bottom = lambda x: -H + 1.3 * abs(x) / W                   # pointed tail
    vs = [[bm.verts.new(surf(x, -.15 + (bottom(x) + .15) * j / rows)) for x in np.linspace(-W, W, cols + 1)]
          for j in range(rows + 1)]
    for j in range(rows):
        for i in range(cols):  # facing -Y
            face((vs[j + 1][i], vs[j + 1][i + 1], vs[j][i + 1], vs[j][i]), CL)
    # the tree of Asterholm, laid on the cloth 3 cm proud
    on = lambda pts: [bm.verts.new(Vector(surf(x, z)) + Vector((0, -.03, 0))) for x, z in pts]
    face(list(reversed(on([(.85 * cos(a), -3.6 + .75 * sin(a)) for a in np.linspace(0, 2 * pi, 14)[:-1]]))), EM)
    face(list(reversed(on([(-.13, -6.0), (.13, -6.0), (.13, -4.3), (-.13, -4.3)]))), EM)
    face(list(reversed(on([(-.6, -6.3), (.6, -6.3), (.15, -5.9), (-.15, -5.9)]))), EM)
    return finish("banner")


os.makedirs(out_dir, exist_ok=True)
pieces = [wall(), tower_round(), tower_square(), gatehouse(), keep(), banner()]
total = 0
for ob in pieces:
    me = ob.data
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    total += tris
    xs, ys, zs = zip(*[v.co[:] for v in me.vertices])
    print(f"PIECE {ob.name:13s} {max(xs) - min(xs):5.1f} x {max(zs) - min(zs):5.1f} x {max(ys) - min(ys):5.1f} m "
          f"(w x h x d, top {max(zs):5.1f} m)  {tris:6d} tris")
print(f"KIT total {total} tris (budget 40000)")
assert total <= 40000, total

bpy.ops.object.select_all(action="DESELECT")
for ob in pieces:
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", use_selection=True, export_image_format="JPEG",
                          export_jpeg_quality=88, export_vertex_color="ACTIVE", export_yup=True)
print("wrote", GLB, os.path.getsize(GLB) // 1024, "KB")

if not shots:
    sys.exit(0)

# ---------- render: a test castle from the EXPORTED file, beside the hero ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=GLB)
kit = {o.name: o for o in scn.objects}
for o in kit.values():
    o.hide_render = o.hide_viewport = True
placed = []


def put(name, x, y, z=0., rot=0.):
    o = bpy.data.objects.new(name + "_i", kit[name].data)
    o.location, o.rotation_euler = (x, y, z), (0, 0, rot)
    scn.collection.objects.link(o)
    placed.append(o)
    return o


CY, FY, BY, SX = 15, -35, 55, 45                     # keep centre y, front / back wall y, side wall x
put("keep", 0, CY)
put("gatehouse", 0, FY)
for sx in (-SX, SX):
    for sy in (FY, BY):
        put("tower_round", sx, sy)
    put("tower_square", sx, 10)
for x in (15, 25, 35):
    for s in (-1, 1):
        put("wall", s * x, FY)
for x in range(-35, 36, 10):
    put("wall", x, BY, rot=pi)
for y in range(-25, 46, 10):
    put("wall", SX, y, rot=pi / 2)
    put("wall", -SX, y, rot=-pi / 2)
for x in (-8.25, 8.25):
    put("banner", x, CY - 11, 29)
for x in (-4.6, 4.6):
    put("banner", x, FY - 5, 17.6)

bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(out_dir.rstrip("/")), "hero.glb"))
hero = [o for o in scn.objects if o not in kit.values() and o not in placed and o.parent is None]
hz = [(o.matrix_world @ Vector(c)).z for o in scn.objects if o.type == "MESH" and o not in kit.values()
      and o not in placed for c in o.bound_box]
print(f"HERO height {max(hz) - min(hz):.2f} m")

ground = bpy.data.meshes.new("ground")
ground.from_pydata([(-3000, -3000, 0), (3000, -3000, 0), (3000, 3000, 0), (-3000, 3000, 0)], [], [(0, 1, 2, 3)])
ground.materials.append(mat("grass", (.10, .16, .035), .95))
scn.collection.objects.link(bpy.data.objects.new("ground", ground))
road = bpy.data.meshes.new("road")
road.from_pydata([(-3, -400, .02), (3, -400, .02), (3, -36, .02), (-3, -36, .02)], [], [(0, 1, 2, 3)])
road.materials.append(mat("dirt", (.22, .17, .11), .95))
scn.collection.objects.link(bpy.data.objects.new("road", road))

sun_d = bpy.data.lights.new("sun", "SUN")
sun = bpy.data.objects.new("sun", sun_d)
scn.collection.objects.link(sun)
world = bpy.data.worlds.new("w")
world.use_nodes = True
scn.world = world
bg = world.node_tree.nodes["Background"]
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scn.collection.objects.link(cam)
scn.camera = cam
scn.render.engine = "BLENDER_EEVEE"
scn.eevee.taa_render_samples = 32
scn.render.resolution_x, scn.render.resolution_y = 1600, 900


def aim(loc, target, lens=22):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens


def place_hero(x, y):
    for o in hero:
        o.location.x, o.location.y = x, y


def render(name):
    scn.render.filepath = os.path.join(shots, f"castle-kit-{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", scn.render.filepath)


def day():
    sun.rotation_euler = (1.12, 0, -.55)                      # low golden afternoon light from front-left
    sun_d.energy, sun_d.color, sun_d.angle = 4.5, (1, .88, .72), .02
    bg.inputs["Color"].default_value, bg.inputs["Strength"].default_value = (.50, .60, .85, 1), 1.0
    win.inputs["Emission Strength"].default_value = 0


win = bpy.data.materials["window"].node_tree.nodes["Principled BSDF"]
win.inputs["Emission Color"].default_value = (1, .58, .2, 1)
day()
place_hero(-10, -75)
aim((-13, -86, 2.0), (0, 10, 15))
render("day")
place_hero(-4, -52)
aim((-9, -62, 1.7), (0, -38, 9.5), 24)
render("close")

sun.rotation_euler = (.9, 0, 2.6)                            # moonlight from behind
sun_d.energy, sun_d.color = .35, (.55, .65, 1)
bg.inputs["Color"].default_value, bg.inputs["Strength"].default_value = (.02, .03, .07, 1), 1.0
win.inputs["Emission Strength"].default_value = 14
place_hero(-10, -75)
aim((-13, -86, 2.0), (0, 10, 15))
render("night")

# lineup: every piece in a row, front elevation, hero at the left end
day()
for o in placed:
    o.hide_render = True
x = -70.
for name in ("banner", "wall", "tower_square", "tower_round", "gatehouse", "keep"):
    xs = [v.co.x for v in kit[name].data.vertices]
    w = max(xs) - min(xs)
    put(name, x + w / 2, 0, 10 if name == "banner" else 0)
    x += w + 6
place_hero(-74, -2)
cam.data.type, cam.data.ortho_scale = "ORTHO", x + 80
aim(((x - 74) / 2, -400, 28), ((x - 74) / 2, 0, 28))
render("pieces")
