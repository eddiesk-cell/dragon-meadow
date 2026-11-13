"""Old Glim (BESTIARY.md "## 6"), the Mirrormere eel, built from code (rig route C, no paid mesh).
  blender -b -P tools/bestiary/old_glim.py -- public/models/bestiary/old-glim.glb [art/bestiary/old-glim]
Real scale, metres: 16 m from the lower-jaw tip (-Y in Blender, +Z in the glb) to the tail tip, 1.3 m thick. Origin under
the middle of her length, lowest rest vertex (the belly fin) at 0, spine axis at ZA (printed: the waterline).
One skinned mesh "old-glim", materials glim-skin, glim-fin (double-sided), glim-jaw, glim-teeth, glim-eye and glim-lamps
(the flank spots, emissive orange: the game raises emissiveIntensity at night).
Bones: spine_00 (the head, snout tip -> neck, rigid) .. spine_23 (tail tip), one connected chain, plus jaw (child of
spine_00, hinged behind the mouth corner) = 25. Clips: Swim (2 s loop, a travelling S-wave, head steady) and Coil (3 s
loop, the front reared into an S, jaw open, ready to lunge). The fight states stay procedural in game code.
With the art dir it re-imports the glb and renders sheet.png (side / top / front at rest beside concept.png),
swim.png (8 frames of Swim from above) and coil.png (side), and prints the worst edge stretch per clip.
"""
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:]
OUT, ART = argv[0], (argv[1] if len(argv) > 1 else None)
TMP = os.environ.get("TMPDIR", "/tmp")
bpy.ops.wm.read_factory_settings(use_empty=True)

L, S0, NECK, NB = 16.0, 0.17, 2.6, 24        # length, snout tip, neck joint (arc length s from the jaw tip), spine bones
BL = (L - NECK) / (NB - 1)                   # 0.583 m, each body bone
ss = lambda a, b, x: (lambda k: k * k * (3 - 2 * k))(np.clip((np.asarray(x, float) - a) / (b - a), 0, 1))
mix = lambda a, b, k: a + (b - a) * k
lin = lambda c: tuple((np.asarray(c, float) / 255) ** 2.2)        # sRGB byte -> linear
cap = lambda d, w: np.sqrt(np.clip(1 - (1 - np.clip(d / w, 0, 1)) ** 2, 0, 1))   # a round end over w metres


def prof(pts, blur=0.1):
    """Knots (s, value), linear between, Gaussian-blurred along s so no knot shows as a crease."""
    g = np.linspace(-1, L + 1, 3601)
    y = np.interp(g, *zip(*pts))
    k = np.exp(-0.5 * (np.arange(-120, 121) * (g[1] - g[0]) / blur) ** 2)
    y = np.convolve(np.pad(y, 120, mode="edge"), k / k.sum(), "valid")
    return lambda s: np.interp(s, g, y)


# ---- shape (side profile measured off concept.png, scaled to 16 m x 1.3 m) ----
TOP = prof([(.17, 0), (.3, .3), (.5, .42), (.75, .55), (1, .64), (1.25, .7), (1.5, .74), (1.75, .78), (2, .8), (2.4, .78),
            (3, .74), (4, .7), (5.5, .65), (8, .56), (10.5, .47), (13, .34), (14.3, .27), (15.3, .17), (16, .02)])
BOT = prof([(.17, .06), (.4, .12), (.7, .17), (1, .21), (1.2, .24), (1.34, .26), (1.4, .45), (1.55, .66), (1.75, .73), (2.2, .74), (3, .74),
            (4, .7), (5.5, .65), (8, .56), (10.5, .47), (13, .34), (14.3, .27), (15.3, .17), (16, .02)], 0.06)
WID = prof([(.17, .1), (.3, .24), (.5, .32), (.75, .38), (1, .43), (1.5, .51), (2, .56), (2.6, .55), (3.1, .53), (5.5, .45),
            (8, .37), (10.5, .29), (13, .18), (14.3, .13), (15.3, .07), (16, .01)])
QB = lambda s: 0.25 + 0.55 * ss(1.25, 1.8, s)       # lower-half exponent: a flat palate in front, a round belly behind
QT, PX = 0.8, 0.85
FD = prof([(2.3, 0), (3.5, .36), (5.5, .45), (8, .38), (10.5, .3), (13, .24), (14.3, .2), (15.3, .14), (16, 0)])  # fins
FV = prof([(2.6, 0), (4, .3), (5.5, .32), (8, .33), (10.5, .33), (13, .26), (14.3, .2), (15.3, .13), (16, 0)])
GAP = lambda s: 0.1 * (1 - ss(0.3, 1.3, s))       # the mouth stands a little open, as drawn
RIMJ = lambda s: mix(-BOT(s) - GAP(s), -0.28, ss(1.2, 1.4, s))   # the jaw's top (mouth floor) line
CHIN = prof([(0, -.3), (.1, -.39), (.3, -.49), (.5, -.56), (.75, -.63), (1, -.68), (1.25, -.7), (1.4, -.69), (1.55, -.64),
             (1.75, -.56), (2.15, -.48)], 0.06)
WJ = prof([(0, .14), (.15, .24), (.5, .33), (1, .42), (1.4, .48), (1.7, .45), (2.15, .32)], 0.06)


def body_ring(s, th):
    c, sn, k = np.cos(th), np.sin(th), cap(s - S0, 0.2)
    return (WID(s) * k * np.sign(c) * np.abs(c) ** PX,
            np.where(sn > 0, TOP(s) * k * np.abs(sn) ** QT, -BOT(s) * k * np.abs(sn) ** QB(s)))


def jaw_ring(s, th):
    c, sn, k = np.cos(th), np.sin(th), cap(s, 0.18) * cap(2.15 - s, 0.12)
    return (WJ(s) * k * np.sign(c) * np.abs(c) ** 0.8,
            RIMJ(s) + np.where(sn > 0, 0.05 * k * np.abs(sn) ** 0.5, (CHIN(s) - RIMJ(s)) * k * np.abs(sn) ** 0.75))


# The lamps: a row down each flank just above the widest line, shrinking and crowding toward the tail.
NL = 30
LS = 3.0 + 12.7 * (np.arange(NL) / (NL - 1)) ** 0.85
LR = (0.095 - 0.073 * (np.arange(NL) / (NL - 1)) ** 0.9) * np.random.default_rng(6).choice([1, 1, .85, .7], NL)
LZ = 0.15 * TOP(LS)                                   # just under the dark back
LX = WID(LS) * np.sqrt(1 - 0.15 ** (2 / QT)) ** PX     # the flank's x at that height


# ---- textures, painted in (s, around) space ----
def ramp(x, pts):
    xs, cs = zip(*pts); cs = np.array(cs, float) / 255
    return np.stack([np.interp(x, xs, cs[:, i]) for i in range(3)], -1)


def worley(X, Y, ny):
    """F2 - F1 of jittered cells (0 on the cell walls), periodic in Y over ny cells: the caustic vein net."""
    ix, iy = np.floor(X), np.floor(Y)
    f1 = np.full(X.shape, 9.0); f2 = f1.copy()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            cx, cy = ix + dx, iy + dy
            h = lambda a: np.modf(np.abs(np.sin(cx * 127.1 + np.mod(cy, ny) * 311.7 + a) * 43758.5453))[0]
            d = np.hypot(X - cx - h(0.0), Y - cy - h(1.7))
            f2 = np.where(d < f1, f1, np.minimum(f2, d)); f1 = np.minimum(f1, d)
    return f2 - f1


def image(name, rgb):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h)
    img.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], -1).astype(np.float32).ravel())
    img.filepath_raw = f"{TMP}/{name}.png"; img.file_format = "PNG"; img.save()
    return img


def paint_skin(TW=2048, TH=512):
    S = np.broadcast_to(((np.arange(TW) + 0.5) / TW * L)[None], (TH, TW))
    th = np.broadcast_to(np.radians(-90 + 360 * (np.arange(TH) + 0.5) / TH)[:, None], (TH, TW))
    sn = np.sin(th)
    zeta = np.where(sn > 0, np.abs(sn) ** QT, -np.abs(sn) ** QB(S))      # -1 belly .. 1 back
    z = np.where(sn > 0, TOP(S), BOT(S)) * zeta
    col = mix(ramp(zeta, [(-1, (180, 160, 100)), (-.8, (170, 160, 105)), (-.55, (150, 160, 115)), (-.25, (128, 158, 128)),
                          (0, (140, 150, 122)), (.15, (128, 150, 125)), (.35, (80, 135, 125)), (.55, (45, 105, 104)),
                          (.8, (32, 90, 94)), (1, (25, 72, 75))]),
              ramp(zeta, [(-1, (165, 150, 110)), (-.5, (150, 150, 115)), (0, (125, 158, 140)), (.5, (95, 150, 148)),
                          (1, (70, 128, 135))]), ss(2.7, 1.9, S)[..., None])   # the head is a lighter blue-teal
    u = (th + np.pi / 2) / (2 * np.pi)
    v1 = 1 - ss(0, .04, worley(S / .32 + .6 * np.sin(3 * th + 1.1 * S) + .25 * np.sin(7 * th - 2.3 * S),
                                u * 14 + .5 * np.sin(1.7 * S) + .2 * np.sin(4.1 * S + 2), 14))
    v2 = 1 - ss(0, .03, worley(S / .13 + .4 * np.sin(5 * th + 2.7 * S), u * 30 + .35 * np.sin(3.3 * S), 30))
    vein = np.maximum(v1, .6 * v2) * (1 - .3 * ss(.7, 1, zeta))
    col = mix(col, mix(ramp(0, [(0, (235, 205, 130))]), ramp(0, [(0, (175, 230, 220))]), ss(-.3, .2, zeta)[..., None]),
              (.6 * vein)[..., None])
    col *= (1 + .06 * np.sin(1.3 * S + 2 * th) + .05 * np.sin(3.7 * S - 3 * th + 1.7) + .04 * np.sin(9.1 * S + 7 * th))[..., None]
    mouth = ss(1.6, 1.45, S)                       # palate dark, a pale lip round it
    col = mix(col, ramp(0, [(0, (195, 180, 145))]), (ss(-.55, -.75, zeta) * mouth)[..., None])
    col = mix(col, ramp(0, [(0, (95, 42, 45))]), (ss(-.82, -.9, zeta) * mouth)[..., None])
    line = np.exp(-((z - .15 * TOP(S)) / .018) ** 2) * ss(2.6, 3.0, S) * ss(15.95, 15.6, S)   # lateral line
    col = mix(col, ramp(0, [(0, (225, 125, 55))]), (.8 * line)[..., None])
    col *= 1 - .55 * np.exp(-((np.hypot(S - .97, z - .23) - .085) / .025) ** 2)[..., None]   # the eye socket
    halo = np.zeros(S.shape)
    for s, r, zl in zip(LS, LR, LZ):              # each lamp warms the skin round it
        halo = np.maximum(halo, .85 * np.exp(-(np.hypot(S - s, z - zl) / (3.2 * r)) ** 2))
    return mix(col, ramp(0, [(0, (240, 150, 70))]), halo[..., None])


def paint_fin(TW=2048, TH=128):
    S = np.broadcast_to(((np.arange(TW) + 0.5) / TW * L)[None], (TH, TW))
    T = np.broadcast_to(((np.arange(TH) + 0.5) / TH)[:, None], (TH, TW))     # 0 at the body, 1 at the edge
    col = ramp(T, [(0, (100, 150, 140)), (.35, (100, 155, 146)), (.75, (140, 182, 168)), (.9, (185, 200, 165)), (1, (240, 224, 168))])
    r = S - .4 * T                                 # rays slant back toward the edge
    col *= (.86 + .14 * (.5 + .5 * np.cos(2 * np.pi * r / .045)) - .15 * np.exp(-((np.mod(r / .32, 1) - .5) / .04) ** 2))[..., None]
    vein = 1 - ss(0, .06, worley(S / .3, T * 3 + .2 * np.sin(2 * S), 10 ** 6))
    return mix(col, ramp(0, [(0, (200, 225, 210))]), (.3 * vein)[..., None])


# ---- materials ----
def material(name, rgb=None, img=None, vcol=False, rough=.5, emit=None, two_sided=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    if img: n = nt.nodes.new("ShaderNodeTexImage"); n.image = img; nt.links.new(n.outputs["Color"], b.inputs["Base Color"])
    elif vcol: n = nt.nodes.new("ShaderNodeVertexColor"); n.layer_name = "Col"; nt.links.new(n.outputs["Color"], b.inputs["Base Color"])
    else: b.inputs["Base Color"].default_value = (*lin(rgb), 1)
    if emit: b.inputs["Emission Color"].default_value = (*lin(emit), 1); b.inputs["Emission Strength"].default_value = 1.0
    b.inputs["Roughness"].default_value = rough
    m.use_backface_culling = not two_sided
    return m


M = dict(skin=material("glim-skin", img=image("glim-skin", paint_skin()), rough=.38),
         fin=material("glim-fin", img=image("glim-fin", paint_fin()), rough=.5, two_sided=True),
         jaw=material("glim-jaw", vcol=True, rough=.5), teeth=material("glim-teeth", (232, 224, 198), rough=.3, two_sided=True),
         eye=material("glim-eye", vcol=True, rough=.1), lamps=material("glim-lamps", (255, 190, 100), rough=.3, emit=(255, 130, 40)))


# ---- geometry: each piece is its own object (part id, material), joined at the end ----
def mk(name, V, F, mat, part, uv=None, col=None, closed=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.asarray(V, float).tolist(), [], [tuple(int(i) for i in f) for f in F]); me.update()
    if uv is not None:
        lv = np.empty(len(me.loops), np.int64); me.loops.foreach_get("vertex_index", lv)
        me.uv_layers.new(name="UVMap").data.foreach_set("uv", uv(lv).astype(np.float32).ravel())
    col = np.ones((len(me.vertices), 3)) if col is None else col    # white where unused: a missing one joins as black
    me.color_attributes.new("Col", "FLOAT_COLOR", "POINT").data.foreach_set("color", np.c_[col, np.ones(len(col))].astype(np.float32).ravel())
    me.attributes.new("part", "INT", "POINT").data.foreach_set("value", np.full(len(me.vertices), part, np.int32))
    if closed:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    me.shade_smooth(); me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    return ob


def tube(name, rows, ring, K, mat, part, col=None):
    """Closed loft: rows[0] and rows[-1] are poles, ring(s, th) -> (x, z). UV u = s / L, v = around (seam on the belly)."""
    th = np.radians(-90 + 360 * np.arange(K) / K)
    R = len(rows) - 2
    X, Z = ring(rows[1:-1, None], th[None])
    V = np.stack([X, np.broadcast_to(rows[1:-1, None] - 8, X.shape), Z], -1).reshape(-1, 3)
    poles = [(0, rows[i] - 8, np.mean(ring(np.full((1, K), rows[i]), th[None])[1])) for i in (0, -1)]
    V = np.vstack([V, poles]); n0, n1 = R * K, R * K + 1
    F = [(r * K + j, (r + 1) * K + j, (r + 1) * K + (j + 1) % K, r * K + (j + 1) % K) for r in range(R - 1) for j in range(K)]
    F += [(n0, j, (j + 1) % K) for j in range(K)] + [(n1, (R - 1) * K + (j + 1) % K, (R - 1) * K + j) for j in range(K)]
    pv = np.r_[np.c_[np.repeat(rows[1:-1], K) / L, np.tile(np.arange(K), R) / K], [[rows[0] / L, .5], [rows[-1] / L, .5]]]

    def uv(lv):
        out = pv[lv].copy(); i = 0
        for f in F:                                # the face that closes the ring takes v = 1 on its j = 0 side
            js = [v % K if v < n0 else -1 for v in f]
            if 0 in js and K - 1 in js: out[i:i + len(f)][np.array(js) == 0, 1] = 1.0
            if -1 in js: out[i + js.index(-1), 1] = np.mean([out[i + k, 1] for k in range(len(f)) if js[k] >= 0])
            i += len(f)
        return out
    return mk(name, V, F, mat, part, uv, col(rows[1:-1, None], th[None]) if col else None)


rows = np.r_[S0 + .3 * (np.arange(12) / 12) ** 2, np.linspace(S0 + .3, NECK, 46, endpoint=False),
             np.linspace(NECK, 15.88, 190), 16 - .12 * (np.arange(3, -1, -1) / 4) ** 2]
pieces = [tube("body", rows, body_ring, 48, M["skin"], 0)]


def jaw_col(s, th):
    c, sn = np.abs(np.cos(th)) + 0 * s, np.sin(th) + 0 * s
    zeta = np.where(sn > 0, np.abs(sn) ** .5, -np.abs(sn) ** .75)
    k_m = ss(.5, .7, zeta) * ss(.8, .66, c ** .8) * ss(.12, .3, s)   # mouth floor, inside the lip
    k_l = ss(-.2, .2, zeta) * (1 - k_m)                       # the pale lip
    rgb = mix(mix(np.array(lin((190, 168, 120))), np.array(lin((175, 155, 105))), ss(0, -1, zeta)[..., None]),
              np.array(lin((215, 196, 155))), k_l[..., None])
    rgb = mix(rgb, np.array(lin((100, 45, 48))), k_m[..., None])
    return np.r_[rgb.reshape(-1, 3), [lin((215, 196, 155))] * 2]


jrows = np.r_[.18 * (np.arange(9) / 8) ** 2, np.linspace(.2, 2.0, 45), 2.15 - .15 * (np.arange(5, -1, -1) / 6) ** 2]
pieces.append(tube("jaw", jrows, jaw_ring, 32, M["jaw"], 2, jaw_col))

for name, base_z, edge_z, h, s1, ph in (("fin-back", lambda s: .9 * TOP(s), lambda s: TOP(s), FD, 2.3, 0),
                                        ("fin-belly", lambda s: -.9 * BOT(s), lambda s: -BOT(s), FV, 2.6, 1.9)):
    fs = np.r_[rows[(rows > s1) & (rows < 15.97)], 15.99]
    T = np.array([0, .15, .35, .6, .82, 1])
    hs = h(fs) * (1 + .08 * np.sin(2 * np.pi * fs / 1.5 + ph) + .025 * np.sin(2 * np.pi * fs / .8 + 2 + ph))
    sgn = np.sign(edge_z(5.0))
    Z = base_z(fs)[:, None] + T[None] * (edge_z(fs) + sgn * hs - base_z(fs))[:, None]
    X = ((.025 * np.sin(2 * np.pi * fs / .9 + ph) + .01 * np.sin(2 * np.pi * fs / .4 + 1.3)) * h(fs) / .45)[:, None] * T[None] ** 2
    V = np.stack([X, np.broadcast_to(fs[:, None] - 8, X.shape), Z], -1).reshape(-1, 3)
    m = len(T)
    F = [(r * m + j, r * m + j + 1, (r + 1) * m + j + 1, (r + 1) * m + j) for r in range(len(fs) - 1) for j in range(m - 1)]
    uvv = np.c_[np.repeat(fs, m) / L, np.tile(T, len(fs))]
    pieces.append(mk(name, V, F, M["fin"], 1, lambda lv, uvv=uvv: uvv[lv], closed=False))


def ico(sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1)
    V = np.array([v.co[:] for v in bm.verts]); F = [[v.index for v in f.verts] for f in bm.faces]; bm.free()
    return V, F


def cone(base, d, length, r, n=5):
    d = d / np.linalg.norm(d); a = np.cross(d, [0, 0, 1] if abs(d[2]) < .9 else [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(d, a)
    ring = [base + r * (np.cos(t) * a + np.sin(t) * b) for t in np.linspace(0, 2 * np.pi, n, endpoint=False)]
    return ring + [base + length * d], [(i, (i + 1) % n, n) for i in range(n)]


def merge(parts):
    V, F = [], []
    for v, f in parts: F += [[i + len(V) for i in ff] for ff in f]; V += list(v)
    return V, F


sv, sf = ico(2)
lamps = merge([(np.array([side * (x - .25 * r), s - 8, z]) + sv * [.55 * r, r, r], sf)
               for side in (1, -1) for s, r, z, x in zip(LS, LR, LZ, LX)])
pieces.append(mk("lamps", *lamps, M["lamps"], 5))

se, ze, re = .97, .23, .07                          # the eyes, high on the head, bulging a little
xe = WID(se) * np.sqrt(1 - (ze / TOP(se)) ** (2 / QT)) ** PX
EV, EF = merge([(np.array([side * (xe - .02), se - 8, ze]) + sv * re, sf) for side in (1, -1)])
o = np.array(EV) - np.array([[np.sign(v[0]) * (xe - .02), se - 8, ze] for v in EV])
dot = (np.abs(o[:, 0]) * .97 + o[:, 2] * .24) / re
ecol = np.where((dot > .95)[:, None], lin((8, 10, 12)), np.where((dot > .45)[:, None], lin((165, 215, 200)), lin((20, 40, 40))))
pieces.append(mk("eyes", EV, EF, M["eye"], 4, col=ecol))

# Needle teeth: long ones line the jutting lower jaw and point up (they ride the jaw bone), short ones hang from the palate.
low = [cone(np.array([side * .8 * WJ(s), s - 8, RIMJ(s) + .03]), np.array([side * .25, -.14, 1.0]),
            .11 - .06 * (s - .12) / 1.23, .011 - .003 * (s - .12) / 1.23) for side in (1, -1) for s in np.linspace(.12, 1.25, 20)]
low += [cone(np.array([side * .07, .06 - 8, RIMJ(.06) + .01]), np.array([side * .15, -.25, 1.0]), .15, .017) for side in (1, -1)]
up = [cone(np.array([side * .82 * WID(s), s - 8, -.86 * BOT(s)]) * [cap(s - S0, .3), 1, cap(s - S0, .3)], np.array([side * .1, .1, -1.0]),
           .06 - .025 * (s - .3) / 1.1, .009) for side in (1, -1) for s in np.linspace(.3, 1.25, 16)]
pieces.append(mk("teeth-low", *merge(low), M["teeth"], 2, closed=False))
pieces.append(mk("teeth-up", *merge(up), M["teeth"], 3, closed=False))

for ob in pieces: ob.select_set(True)
bpy.context.view_layer.objects.active = pieces[0]
bpy.ops.object.join()
ob = pieces[0]; ob.name = ob.data.name = "old-glim"
me = ob.data; n = len(me.vertices)
co = np.empty(n * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
ZA = -co[:, 2].min()                                  # lift so the lowest rest vertex sits at 0
co[:, 2] += ZA; me.vertices.foreach_set("co", co.ravel()); me.update()
part = np.empty(n, np.int32); me.attributes["part"].data.foreach_get("value", part)
print(f"GLIM mesh {n} verts {sum(len(p.vertices) - 2 for p in me.polygons)} tris, length {np.ptp(co[:, 1]):.2f} m, "
      f"thickness {TOP(5.5) + BOT(5.5):.2f} m mid-body (s 5.5), {(TOP(rows) + BOT(rows)).max():.2f} m at the head, fins to {np.ptp(co[part == 1, 2]):.2f} m, spine axis ZA {ZA:.3f} m")

# ---- rig: spine_00 (head) .. spine_23, connected, all pointing +Y (tailward); jaw under spine_00 ----
ad = bpy.data.armatures.new("old-glim-rig"); arm = bpy.data.objects.new("old-glim-rig", ad)
bpy.context.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
J = [Vector((0, S0 - 8, ZA))] + [Vector((0, NECK - 8 + i * BL, ZA)) for i in range(NB)]
prev = None
for i in range(NB):
    eb = ad.edit_bones.new(f"spine_{i:02d}"); eb.head, eb.tail, eb.roll = J[i], J[i + 1], 0
    if prev: eb.parent, eb.use_connect = prev, True
    prev = eb
eb = ad.edit_bones.new("jaw"); eb.head, eb.tail = Vector((0, 1.65 - 8, ZA - .3)), Vector((0, .05 - 8, ZA - .2))
eb.parent = ad.edit_bones["spine_00"]
bpy.ops.object.mode_set(mode="OBJECT")

# Smooth weights along the chain: quadratic B-spline over bone index b(s) (C1 skin, <= 3 bones a vertex). The head is
# rigid to s = 2.0, then blends over the neck; the jaw and its teeth ride the jaw bone alone.
B2 = lambda x: np.where(np.abs(x) <= .5, .75 - x * x, np.where(np.abs(x) <= 1.5, .5 * (1.5 - np.abs(x)) ** 2, 0))
s = co[:, 1] + 8
b = np.where(s < 2.89, np.interp(s, [2.0, 2.89], [0, 1.5]), 1.5 + (s - 2.89) / BL)
W = B2(b[:, None] - np.arange(NB)[None] - .5); W /= W.sum(1, keepdims=True)
jaw = part == 2
for k in range(NB):
    vg = ob.vertex_groups.new(name=f"spine_{k:02d}")
    for i in np.nonzero((W[:, k] > 1e-4) & ~jaw)[0]: vg.add([int(i)], float(W[i, k]), "REPLACE")
ob.vertex_groups.new(name="jaw").add(np.nonzero(jaw)[0].tolist(), 1.0, "REPLACE")
ob.parent = arm; ob.modifiers.new("Armature", "ARMATURE").object = arm

# ---- clips ----
FPS = 30
bpy.context.scene.render.fps = FPS
P = arm.pose.bones
for pb in P: pb.rotation_mode = "QUATERNION"
R = {bn.name: bn.matrix_local.to_quaternion() for bn in ad.bones}
LENS = [NECK - S0] + [BL] * (NB - 1)
SMID = np.r_[(S0 + NECK) / 2, NECK + (np.arange(NB - 1) + .5) * BL]


def solve(dirs, anchor_tail, gape):
    """Tailward unit direction per spine bone -> local quaternions and the root's location (rest = straight along +Y)."""
    Wq = [Vector((0, 1, 0)).rotation_difference(Vector(d)) for d in dirs]
    J0 = J[0] + (Vector((0, 8, ZA)) - J[0] - sum((Vector(d) * l for d, l in zip(dirs, LENS)), Vector()) if anchor_tail else Vector())
    q = [R["spine_00"].inverted() @ Wq[0] @ R["spine_00"]]
    q += [R[f"spine_{i:02d}"].inverted() @ Wq[i - 1].inverted() @ Wq[i] @ R[f"spine_{i:02d}"] for i in range(1, NB)]
    qj = R["jaw"].inverted() @ Quaternion((1, 0, 0), gape) @ R["jaw"]
    return q, R["spine_00"].inverted() @ (J0 - J[0]), qj


def lateral(s, A, k, ph):
    """Heading of a lateral wave y = A(s) sin(k s - ph): the bone's tailward direction (sin phi, cos phi)."""
    eps = 1e-3
    y = lambda x: A(x) * np.sin(k * x - ph)
    return np.arctan((y(s + eps) - y(s - eps)) / (2 * eps))


def swim(t):
    phi = lateral(SMID, lambda x: 1.1 * np.clip((x - NECK) / (L - NECK), 0, 1) ** 1.3, 2 * np.pi / 9, 2 * np.pi * t)
    phi[0] = 0                                      # the head holds its line; the wave runs back from the neck
    return np.c_[np.sin(phi), np.cos(phi), 0 * phi], False, math.radians(5 + 3 * math.sin(2 * math.pi * t))


def coil(t):
    w = 2 * math.pi * t
    sig = L - SMID                                  # arc length from the tail
    rise = lambda a, b, x: .5 * np.clip((x - a) / (b - a), 0, 1) + .5 * ss(a, b, x)   # gentler peak bend than smoothstep
    alpha = np.radians((75 + 3 * math.sin(w)) * rise(4.8, 9.4, sig) - (90 + 4 * math.sin(w + .6)) * rise(9.4, 13.4, sig))
    phi = lateral(SMID, lambda x: .35 * ss(9, 16, x), 2 * np.pi / 9, w)
    return np.c_[np.sin(phi) * np.cos(alpha), np.cos(phi) * np.cos(alpha), -np.sin(alpha)], True, math.radians(14 + 3 * math.sin(w + 1))


arm.animation_data_create()
for name, frames, fn in (("Swim", 60, swim), ("Coil", 90, coil)):
    act = bpy.data.actions.new(name); act.use_fake_user = True
    arm.animation_data.action = act
    for f in range(frames + 1):
        q, loc, qj = solve(*fn(f / frames))
        for i in range(NB):
            P[f"spine_{i:02d}"].rotation_quaternion = q[i]; P[f"spine_{i:02d}"].keyframe_insert("rotation_quaternion", frame=f)
        P["spine_00"].location = loc; P["spine_00"].keyframe_insert("location", frame=f)
        P["jaw"].rotation_quaternion = qj; P["jaw"].keyframe_insert("rotation_quaternion", frame=f)
    print(f"GLIM clip {name}: {frames + 1} frames at {FPS} fps, slots {[sl.identifier for sl in act.slots]}")
arm.animation_data.action = None
for pb in P: pb.rotation_quaternion, pb.location = (1, 0, 0, 0), (0, 0, 0)

bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); ob.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_animation_mode="ACTIONS",
                          export_yup=True, export_image_format="JPEG", export_jpeg_quality=90, export_vertex_color="MATERIAL",
                          export_optimize_animation_size=False)
print(f"GLIM wrote {OUT} {os.path.getsize(OUT) / 1e6:.2f} MB, {len(ad.bones)} bones")
if not ART: sys.exit(0)

# ---- checks and pictures, all from the exported glb ----
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OUT)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
ob = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
print(f"GLIM glb: {len(arm.data.bones)} bones, clips {sorted(a.name for a in bpy.data.actions)}, "
      f"materials {sorted(m.name for m in ob.data.materials)}")
ad = arm.animation_data or arm.animation_data_create()
for t in ad.nla_tracks: t.mute = True
sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get()


def use(clip, f):
    act = bpy.data.actions[clip]; ad.action = act; ad.action_slot = act.slots[0]; sc.frame_set(f)


def posed():
    e = ob.evaluated_get(dg); m = e.to_mesh()
    p = np.empty(len(m.vertices) * 3); m.vertices.foreach_get("co", p); e.to_mesh_clear()
    return p.reshape(-1, 3)


me = ob.data
rest = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", rest); rest = rest.reshape(-1, 3)
mi = np.array([p.material_index for p in me.polygons]); names = [m.name for m in me.materials]
for mat in ("glim-skin", "glim-fin"):
    E = np.array(sorted({tuple(sorted(e)) for p, k in zip(me.polygons, mi) if names[k] == mat for e in p.edge_keys}))
    L0 = np.linalg.norm(rest[E[:, 0]] - rest[E[:, 1]], axis=1); ok = L0 > 1e-4
    for clip in ("Swim", "Coil"):
        lo, hi = 9.0, 0.0
        for f in range(0, int(bpy.data.actions[clip].frame_range[1]) + 1, 3):
            use(clip, f); p = posed(); r = np.linalg.norm(p[E[ok, 0]] - p[E[ok, 1]], axis=1) / L0[ok]
            if r.min() < lo: lo, flo, slo = r.min(), f, rest[E[ok][r.argmin(), 0], 1] + 8
            if r.max() > hi: hi, fhi, shi = r.max(), f, rest[E[ok][r.argmax(), 0], 1] + 8
        print(f"GLIM stretch {mat} {clip}: shortest edge x{lo:.2f} (frame {flo}, s {slo:.1f} m), longest x{hi:.2f} (frame {fhi}, s {shi:.1f} m)")

w = bpy.data.worlds.new("w"); w.color = (.18, .18, .18); sc.world = w
sc.render.engine = "BLENDER_EEVEE"; sc.render.film_transparent = True; sc.view_settings.view_transform = "Standard"; sc.eevee.taa_render_samples = 16
for d, e in (((-.7, .3, -1.3), 3.5), ((-.3, .1, 1), 1.2)):     # key from above the camera side, a soft fill from below
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = e; sc.collection.objects.link(sun)
    sun.rotation_euler = Vector(d).to_track_quat("-Z", "Y").to_euler()
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
BG = (.39, .39, .39, 1.0)                               # concept.png's backdrop
cam.data.type = "ORTHO"; za = (rest[:, 2].max() + rest[:, 2].min()) / 2
VIEWS = dict(side=((30, 0, za), (math.pi / 2, 0, math.pi / 2)), top=((0, 0, 30), (0, 0, math.pi / 2)),
             front=((0, -30, za), (math.pi / 2, 0, 0)))


def render(path, view, ortho, w, h, lift=0.0):
    loc, rot = VIEWS[view]; cam.location = (loc[0], loc[1], loc[2] + lift); cam.rotation_euler = rot
    cam.data.ortho_scale = ortho; sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path); a = np.array(img.pixels[:]).reshape(h, w, 4)[::-1]; bpy.data.images.remove(img)
    a[..., :3] = a[..., :3] * a[..., 3:] + np.array(BG[:3]) * (1 - a[..., 3:]); a[..., 3] = 1
    return a


def save(path, a):
    img = bpy.data.images.new("out", a.shape[1], a.shape[0]); img.pixels.foreach_set(a[::-1].astype(np.float32).ravel())
    img.filepath_raw = path; img.file_format = "PNG"; img.save(); bpy.data.images.remove(img)


ad.action = None
for pb in arm.pose.bones: pb.location, pb.rotation_quaternion = (0, 0, 0), (1, 0, 0, 0)
con = bpy.data.images.load(os.path.join(ART, "concept.png")); con.scale(1600, 686)
sheet = np.full((1446, 2000, 4), BG)
sheet[:686, :1600] = np.array(con.pixels[:]).reshape(686, 1600, 4)[::-1]
sheet[686:1046, :1600] = render(f"{TMP}/glim-side.png", "side", 17, 1600, 360)
sheet[1046:, :1600] = render(f"{TMP}/glim-top.png", "top", 17, 1600, 400)
sheet[686:1086, 1600:] = render(f"{TMP}/glim-front.png", "front", 3.2, 400, 400)
save(os.path.join(ART, "sheet.png"), sheet)
sw = np.zeros((1360, 2000, 4))
for i, f in enumerate(np.linspace(0, 60, 8, endpoint=False).round().astype(int)):
    use("Swim", f); sw[340 * (i // 2):340 * (i // 2 + 1), 1000 * (i % 2):1000 * (i % 2 + 1)] = render(f"{TMP}/glim-swim.png", "top", 17, 1000, 340)
save(os.path.join(ART, "swim.png"), sw)
use("Coil", 0); save(os.path.join(ART, "coil.png"), render(f"{TMP}/glim-coil.png", "side", 17, 1600, 640, 2.0))
print("GLIM pictures in", ART)
