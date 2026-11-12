"""Town kit (PLAN.md, lane town-kit): Springwell's stacked-stone buildings, one glb, one node per piece.
  blender -b --python-exit-code 1 -P tools/world/town_kit.py -- public/models/world [shots]
Writes town-kit.glb. EVERY node sits at the origin: footprint centre on the ground (glTF y = 0), plinths run 1.5 m
below it so a piece can sit on a slope. Metres, glTF axes; the front door looks toward +Z.
  cottage_s  6.4 x 4.6 m, one storey, red clay roof, shuttered windows, chimney
  cottage_l  9.6 x 6.2 m, two storeys, red clay roof, arched door with a fanlight, porch hood, two chimneys
  house      7.0 x 6.6 m, two storeys + slate roof with a dormer, chimney stack up the +X gable
  market     12.8 x 6.8 m, open arcade of round arches (walk-through), hall above, hipped clay roof
  church     8 x 21 m: nave + a 17 m belfry tower (door in its base, front) and a slate spire to 27 m
  well       round stone well, timber posts, little clay roof, bucket
  lantern    3.1 m post lantern on a stone foot; its glass is the glow
  bridge     one stone arch module: road surface at y = 0, 12 m long along X (ends at x = +-6, chain modules
             12 m apart for a multi-arch bridge), 4.4 m wide, 10 m clear span, piers to y = -7
Materials: stone (coursed masonry texture, 2.4 m tile, + normal), clay / slate (roof tile textures + normals),
dressed (smooth quoins, sills, copings), timber, door, iron, shutter, window. UVs are world-scale per face (v = height
on walls), so courses line up between pieces standing at one height.
Glow mask (same as castle-kit): COLOR_0 rgb is white everywhere, alpha 1 on window panes, fanlights, belfry openings
and lantern glass, 0 elsewhere; those faces also carry material `window`.
Node extras (three: object.userData): smoke [[x, y, z], ...] chimney tops, light [[x, y, z], ...] lamp centres, both in
the node's own glTF frame (y up), for the settlements lane's chimney smoke and night lights.
With a second arg, renders <shots>/town-kit-{day,night,close,pieces}.png from the EXPORTED glb beside public/models/hero.glb.
"""
import bpy, sys, os, json, struct
import numpy as np
from math import pi, cos, sin
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out_dir, shots = args[0], (args[1] if len(args) > 1 else None)
GLB = os.path.join(out_dir, "town-kit.glb")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = np.random.default_rng(11)


# ---------- textures (numpy, periodic so they tile; rows run bottom to top = Blender image order) ----------
def blur(a, s):  # gaussian blur in the frequency domain wraps at the edges, so the result tiles
    f = np.fft.fftfreq(a.shape[0])[:, None] ** 2 + np.fft.fftfreq(a.shape[1])[None, :] ** 2
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * (pi * s) ** 2 * f)))


def noise(n, s):
    a = blur(rng.standard_normal((n, n)), s)
    return a / a.std()


def ss(e0, e1, x):
    x = np.clip((x - e0) / (e1 - e0), 0, 1)
    return x * x * (3 - 2 * x)


def cuts(tile, lo, hi):  # random lengths in [lo, hi] rescaled to sum to exactly one tile
    ls = []
    while sum(ls) < tile:
        ls.append(rng.uniform(lo, hi))
    return np.concatenate([[0], np.cumsum(np.array(ls) * tile / sum(ls))])


def blocks(n, tile, rows, lo, hi):
    """Running bond: per pixel the distance to the nearest joint (m), the block id and the fraction up its row."""
    p = (np.arange(n) + .5) * tile / n
    d, bid, t, base = np.zeros((n, n)), np.zeros((n, n), int), np.zeros((n, n)), 0
    for r in range(len(rows) - 1):
        m = (p >= rows[r]) & (p < rows[r + 1])
        eu = cuts(tile, lo, hi)
        uu = (p - rng.uniform(0, tile)) % tile
        i = np.searchsorted(eu, uu, "right") - 1
        dx = np.minimum(uu - eu[i], eu[i + 1] - uu)
        dy = np.minimum(p[m] - rows[r], rows[r + 1] - p[m])
        d[m] = np.minimum(dx[None, :], dy[:, None])
        bid[m] = (base + i)[None, :]
        t[m] = ((p[m] - rows[r]) / (rows[r + 1] - rows[r]))[:, None]
        base += len(eu)
    return d, bid, t, base


def normal_map(h, n, tile):  # height in metres -> tangent-space normal (OpenGL / glTF: green up)
    k = n / tile / 2
    gx, gy = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * k, (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * k
    v = np.stack([-gx, -gy, np.ones_like(h)], -1)
    return v / np.linalg.norm(v, axis=-1, keepdims=True) * .5 + .5


def masonry(n=1024, tile=2.4):
    """Village stone: courses of 0.16-0.38 m, stones 0.3-0.9 m with rounded arrises, deep mortar, warm
    honey / cream / grey per stone, weathered darker in broad patches."""
    d, bid, _, nb = blocks(n, tile, cuts(tile, .16, .38), .3, .9)
    pal = np.array([[.76, .66, .52], [.71, .62, .50], [.80, .71, .57], [.68, .62, .54], [.76, .64, .49], [.66, .59, .50]])
    col = pal[rng.integers(0, len(pal), nb)][bid] * (1 + .06 * rng.standard_normal(nb))[bid][..., None]
    bulge = rng.uniform(.5, 1, nb)[bid]
    h = ss(.008, .06, d) * bulge * (1 + .25 * noise(n, 4)) + .2 * ss(.01, .12, d) * noise(n, 12)
    col = col * (.55 + .45 * ss(.008, .07, d))[..., None]  # rounded arrises darken into the joint
    col = np.where((d < .009)[..., None], np.array([.46, .42, .36]) * (1 + .12 * noise(n, 2))[..., None], col)
    col = col * (1 + .035 * noise(n, 1.5))[..., None] * (1 + .06 * noise(n, 60))[..., None]
    return col, normal_map(h * .05, n, tile)


def dressed(n=256, tile=2.4):
    """Smooth sandstone for quoins, sills, copings: fine grain and broad weathering."""
    c = np.array([.72, .65, .54])[None, None, :] * (1 + .03 * noise(n, .8) + .05 * noise(n, 16))[..., None]
    return c, normal_map(.0015 * noise(n, 1.5), n, tile)


def tiles(base, n=512, tile=2.4, rows=10, var=.12, hue=.3, pan=.3):
    """Roof: `rows` courses, tiles 0.2-0.3 m wide; each thick at its bottom lip, rounded across (pantile `pan`)."""
    d, bid, t, nb = blocks(n, tile, np.linspace(0, tile, rows + 1), .2, .3)
    u = (np.arange(n) + .5) * tile / n
    h = np.where(d < .008, 0, 1 - .75 * t)
    tone = (1 + var * (rng.standard_normal((nb, 1)) + hue * rng.standard_normal((nb, 3))))[bid]
    col = np.array(base)[None, None, :] * tone * (.62 + .38 * ss(.006, .03, d))[..., None]
    col = col * (1 - .4 * ss(.75, 1, t))[..., None] * (1 + .05 * noise(n, 1))[..., None] * (1 + .06 * noise(n, 40))[..., None]
    return col, normal_map(h * .02 + pan * .02 * ss(0, 1, np.abs(np.sin(u * pi / .25)))[None, :], n, tile)


def image(name, rgb, non_color=False):
    n = rgb.shape[0]
    img = bpy.data.images.new(name, n, n, alpha=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.concatenate([np.clip(rgb, 0, 1), np.ones((n, n, 1))], 2).astype(np.float32).ravel())
    img.pack()
    return img


def mat(name, rgb=(1, 1, 1), rough=.85, metal=0., tex=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if tex:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = image(name, tex[0])
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = image(name + "_n", tex[1], True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


MATS = [mat("stone", rough=.92, tex=masonry()),
        mat("clay", rough=.8, tex=tiles([.70, .36, .22], var=.14)),
        mat("slate", rough=.6, tex=tiles([.25, .28, .33], var=.12, hue=.05, pan=0)),
        mat("dressed", rough=.85, tex=dressed()),
        mat("timber", (.10, .055, .028), .8),
        mat("door", (.15, .07, .03), .75),
        mat("iron", (.03, .03, .035), .5, .6),
        mat("shutter", (.05, .10, .09), .7),
        mat("window", (.04, .035, .03), .25),  # dark glass by day; the game lights it by the vertex alpha mask
        mat("flowers", (.50, .26, .55), .9)]
ST, CY, SL, DR, TB, DO, IR, SH, WI, FL = range(10)
TILE = {ST: 2.4, CY: 2.4, SL: 2.4, DR: 2.4}  # metres per texture repeat; other materials are untextured


# ---------- geometry: a piece is a list of faces (Blender Z up; fronts face -Y, which glTF writes as +Z) ----------
Z = Vector((0, 0, 1))


def newell(pts):
    n = Vector((0, 0, 0))
    for a, b in zip(pts, pts[1:] + pts[:1]):
        n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    return n.normalized() if n.length > 1e-12 else Vector(Z)


class Piece:
    def __init__(s, name):
        s.name, s.faces, s.smoke, s.light = name, [], [], []

    def f(s, pts, m, out=None):
        pts = [Vector(p) for p in pts]
        if out is not None and newell(pts).dot(Vector(out)) < 0:
            pts.reverse()
        s.faces.append((pts, m))

    def solid(s, loops, m, skip=()):
        """Prism between two equal loops (any 3D shape). Faces face away from the centroid; a face whose outward
        normal points along any `skip` direction (dot > .7) is left out."""
        a, b = [Vector(p) for p in loops[0]], [Vector(p) for p in loops[1]]
        c = sum(a + b, Vector()) / (len(a) * 2)
        k = len(a)
        for fs in [a, b] + [[a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]] for i in range(k)]:
            fc = sum(fs, Vector()) / len(fs)
            n = newell(fs)
            if n.dot(fc - c) < 0:
                fs, n = fs[::-1], -n
            if not any(n.dot(Vector(d)) > .7 for d in skip):
                s.faces.append((fs, m))

    def box(s, x0, x1, y0, y1, z0, z1, m, skip=()):
        s.solid(([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)],
                 [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]), m, skip)

    def cyl(s, cx, cy, r, z0, z1, k, m, r1=None, a0=0., skip=()):
        r1 = r if r1 is None else r1
        ring = lambda rr, z: [(cx + rr * cos(a0 + 2 * pi * i / k), cy + rr * sin(a0 + 2 * pi * i / k), z) for i in range(k)]
        s.solid((ring(r, z0), ring(r1, z1)), m, skip)

    def cone(s, cx, cy, r, z0, z1, k, m, a0=0.):
        ring = [Vector((cx + r * cos(a0 + 2 * pi * i / k), cy + r * sin(a0 + 2 * pi * i / k), z0)) for i in range(k)]
        tip = Vector((cx, cy, z1))
        for i in range(k):
            s.f([ring[i], ring[(i + 1) % k], tip], m, (ring[i] + ring[(i + 1) % k]) / 2 - Vector((cx, cy, z0 + (z1 - z0) / 3)))
        s.f(ring, m, -Z)

    def move(s, start, dx=0, dy=0, rot=0.):  # rotate (deg, about Z) then move faces[start:] and markers
        c, sn = cos(rot * pi / 180), sin(rot * pi / 180)
        tf = lambda p: Vector((p.x * c - p.y * sn + dx, p.x * sn + p.y * c + dy, p.z))
        s.faces[start:] = [([tf(p) for p in pts], m) for pts, m in s.faces[start:]]
        s.smoke = [tf(Vector(p)) for p in s.smoke]
        s.light = [tf(Vector(p)) for p in s.light]


class Wall:
    """A wall face in frame (o, t, n): o = bottom centre of the face, t = along it, n = out. u along t, d along n."""

    def __init__(s, P, o, n, w):
        s.P, s.o, s.n, s.w, s.holes = P, Vector(o), Vector(n).normalized(), w, []
        s.t = Z.cross(s.n)

    def at(s, u, d, z):
        return s.o + s.t * u + s.n * d + Z * z

    def box(s, u0, u1, d0, d1, z0, z1, m, back=False):
        s.P.solid(([s.at(u0, d0, z0), s.at(u1, d0, z0), s.at(u1, d1, z0), s.at(u0, d1, z0)],
                   [s.at(u0, d0, z1), s.at(u1, d0, z1), s.at(u1, d1, z1), s.at(u0, d1, z1)]), m,
                  () if back else (-s.n,))

    def poly(s, uz, d, m, out=None):
        s.P.f([s.at(u, d, z) for u, z in uz], m, s.n if out is None else out)

    @staticmethod
    def outline(h, k=6):  # (u, z) loop of a hole, CCW seen from outside; round head when h[4]
        u0, u1, zb, zt, arch = h[:5]
        if not arch:
            return [(u0, zb), (u1, zb), (u1, zt), (u0, zt)]
        r, uc = (u1 - u0) / 2, (u0 + u1) / 2
        return [(u0, zb), (u1, zb)] + [(uc + r * cos(a), zt - r + r * sin(a)) for a in np.linspace(0, pi, k + 1)]

    def build(s, z0, z1, m=ST, thick=0., depth=.22):
        """Wall face from z0 to z1 with its holes cut out; each hole gets reveals `depth` deep (or through a wall
        `thick` thick, which also gets an inner face: an open arcade). Holes: (u0, u1, zb, zt, arched[, depth]).
        A hole starting at the wall foot gets no sill reveal: the plinth top is its floor."""
        H = s.holes
        us = sorted({-s.w / 2, s.w / 2, *[h[0] for h in H], *[h[1] for h in H]})
        zs = sorted({z0, z1, *[h[2] for h in H], *[h[3] for h in H]})
        hole = lambda ua, ub, za, zb: any(h[0] <= ua + 1e-6 and ub <= h[1] + 1e-6 and h[2] <= za + 1e-6 and zb <= h[3] + 1e-6 for h in H)
        for d, sg in ((0., 1),) + (((-thick, -1),) if thick else ()):
            for za, zb in zip(zs, zs[1:]):
                run = None
                for ua, ub in list(zip(us, us[1:])) + [(None, None)]:
                    if ua is None or hole(ua, ub, za, zb):
                        if run:
                            s.poly([(run[0], za), (run[1], za), (run[1], zb), (run[0], zb)], d, m, s.n * sg)
                        run = None
                    else:
                        run = (run[0] if run else ua, ub)
            for h in H:  # wall left in the top corners of a round-headed hole
                if h[4]:
                    ol = Wall.outline(h)[2:]
                    half = len(ol) // 2
                    for corner, arc in (((h[1], h[3]), ol[:half + 1]), ((h[0], h[3]), ol[half:])):
                        for a, b in zip(arc, arc[1:]):
                            s.poly([corner, a, b], d, m, s.n * sg)
        for h in H:  # reveals face the hole's axis
            D = thick or (h[5] if len(h) > 5 else depth)
            ol = Wall.outline(h)
            cu, cz = (h[0] + h[1]) / 2, (h[2] + min(h[3], h[3] - (h[1] - h[0]) / 2 if h[4] else h[3])) / 2
            for a, b in zip(ol, ol[1:] + ol[:1]):
                if a[1] == b[1] == h[2] and h[2] <= z0 + .06:
                    continue
                mid = s.at((a[0] + b[0]) / 2, -D / 2, (a[1] + b[1]) / 2)
                s.P.f([s.at(a[0], 0, a[1]), s.at(b[0], 0, b[1]), s.at(b[0], -D, b[1]), s.at(a[0], -D, a[1])], m,
                      s.at(cu, -D / 2, cz) - mid)

    # --- openings: add before build(); each records its hole and adds its own trim right away
    def window(s, u, zb, w, h, arch=False, shut=False, depth=.22, lintel=TB):
        hl = (u - w / 2, u + w / 2, zb, zb + h, arch, depth)
        s.holes.append(hl)
        s.poly(Wall.outline(hl), -depth, WI)
        spring = zb + h - (w / 2 if arch else 0)
        s.box(u - .035, u + .035, -depth, -depth + .05, zb, zb + h - .04, TB)
        s.box(u - w / 2, u + w / 2, -depth, -depth + .05, zb + (spring - zb) * .6 - .035, zb + (spring - zb) * .6 + .035, TB)
        s.box(u - w / 2 - .1, u + w / 2 + .1, 0, .13, zb - .12, zb, DR)  # sill
        if arch:
            s.box(u - .13, u + .13, 0, .07, zb + h - .1, zb + h + .22, DR)  # keystone
        elif lintel is not None:
            s.box(u - w / 2 - .15, u + w / 2 + .15, 0, .09, zb + h, zb + h + .2, lintel)
        if shut:  # open shutters and a box of flowers
            for sg in (-1, 1):
                s.box(u + sg * (w / 2 + .03), u + sg * (w / 2 + .03 + w * .48), 0, .05, zb + .02, zb + h - .02, SH)
            s.box(u - w / 2 - .05, u + w / 2 + .05, .13, .36, zb - .36, zb - .12, TB)
            for i in range(6):  # mounds of bloom, uneven
                a = -.52 + i * .18
                s.box(u + a * w, u + (a + .22) * w, .15 + .03 * (i % 2), .36 - .03 * (i % 3), zb - .12,
                      zb + (.08, .15, .11, .17, .07, .13)[i], FL)

    def door(s, u, zb, w, h=2.0, arch=False, depth=.25):
        hl = (u - w / 2, u + w / 2, zb, zb + h + (w / 2 if arch else 0), arch, depth)
        s.holes.append(hl)
        s.poly([(u - w / 2, zb), (u + w / 2, zb), (u + w / 2, zb + h), (u - w / 2, zb + h)], -depth, DO)
        if arch:  # glazed fanlight in the round head: it glows at night
            s.poly([(u - w / 2, zb + h), (u + w / 2, zb + h)] +
                   [(u + w / 2 * cos(a), zb + h + w / 2 * sin(a)) for a in np.linspace(0, pi, 7)[1:-1]], -depth, WI)
            s.box(u - .14, u + .14, 0, .08, hl[3] - .1, hl[3] + .24, DR)  # keystone
            s.box(u - w / 2, u + w / 2, -depth, -depth + .06, zb + h, zb + h + .08, TB)  # transom
        else:
            s.box(u - w / 2 - .2, u + w / 2 + .2, 0, .1, hl[3], hl[3] + .22, TB)  # lintel
        for z in (zb + .45, zb + h - .55):  # iron strap hinges
            s.box(u - w / 2 + .04, u + w / 2 - .25, -depth, -depth + .03, z, z + .07, IR)
        s.box(u + w / 2 - .2, u + w / 2 - .12, -depth, -depth + .07, zb + 1.0, zb + 1.1, IR)  # latch
        return h


def house_walls(P, x0, x1, y0, y1):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return {"front": Wall(P, (cx, y0, 0), (0, -1, 0), x1 - x0), "back": Wall(P, (cx, y1, 0), (0, 1, 0), x1 - x0),
            "left": Wall(P, (x0, cy, 0), (-1, 0, 0), y1 - y0), "right": Wall(P, (x1, cy, 0), (1, 0, 0), y1 - y0)}


PL = .35  # plinth top: floors and thresholds stand here


def plinth(P, x0, x1, y0, y1, top=PL, out=.12, m=ST):
    P.box(x0 - out, x1 + out, y0 - out, y1 + out, -1.5, top, m, skip=(-Z,))


def quoins(P, x0, x1, y0, y1, z0, z1, size=.5, gap=.03):
    """Dressed corner stones, long and short in turn, standing 5 cm proud of both faces."""
    for i in range(int((z1 - z0) / size)):
        za = z0 + i * size
        a, b = (.7, .42) if i % 2 == 0 else (.42, .7)
        for x, y, sx, sy in ((x0, y0, -1, -1), (x1, y0, 1, -1), (x1, y1, 1, 1), (x0, y1, -1, 1)):
            P.box(*sorted((x - sx * a, x + sx * .05)), *sorted((y - sy * b, y + sy * .05)), za + gap, za + size, DR,
                  skip=((-sx, 0, 0), (0, -sy, 0), (0, 0, 1), (0, 0, -1)))


def gable_roof(P, x0, x1, y0, y1, ze, zr, m, over=.45, ox=.4, th=.22):
    """Ridge along X. Slabs from the eaves (over beyond the walls) to the ridge, bargeboards, ridge tiles, gables."""
    ym, s = (y0 + y1) / 2, (zr - ze) / ((y1 - y0) / 2)
    xa, xb = x0 - ox, x1 + ox
    for ye, sg in ((y0, -1), (y1, 1)):
        yo, zo = ye + sg * over, ze - over * s
        P.solid(([(xa, yo, zo), (xb, yo, zo), (xb, ym, zr), (xa, ym, zr)],
                 [(xa, yo, zo + th), (xb, yo, zo + th), (xb, ym, zr + th), (xa, ym, zr + th)]), m, skip=((0, -sg, 0),))
        for x in (xa - .07, xb + .07):  # bargeboards
            P.solid(([(x - .04, yo, zo - .16), (x - .04, ym, zr - .16), (x - .04, ym, zr + th + .04), (x - .04, yo, zo + th + .04)],
                     [(x + .04, yo, zo - .16), (x + .04, ym, zr - .16), (x + .04, ym, zr + th + .04), (x + .04, yo, zo + th + .04)]), TB)
    P.box(xa - .1, xb + .1, ym - .17, ym + .17, zr + th - .06, zr + th + .14, m)  # ridge tiles
    for x, n in ((x0, -1), (x1, 1)):  # gable ends, stone
        P.f([(x, y0, ze), (x, y1, ze), (x, ym, zr)], ST, (n, 0, 0))


def hip_roof(P, x0, x1, y0, y1, ze, zr, m, over=.5, th=.22):
    a, b, c, d = x0 - over, x1 + over, y0 - over, y1 + over
    z = ze - over * (zr - ze) / ((y1 - y0) / 2)
    rx = (b - a) / 2 - (d - c) / 2  # ridge half-length so all four slopes share one pitch
    cx, cy = (a + b) / 2, (c + d) / 2
    e, r = [(a, c, z), (b, c, z), (b, d, z), (a, d, z)], [(cx - rx, cy, zr + th), (cx + rx, cy, zr + th)]
    t = [(a, c, z + th), (b, c, z + th), (b, d, z + th), (a, d, z + th)]
    P.f(e, m, -Z)
    for i in range(4):
        P.f([e[i], e[(i + 1) % 4], t[(i + 1) % 4], t[i]], m, Vector(e[i]) + Vector(e[(i + 1) % 4]) - 2 * Vector((cx, cy, z)))
    P.f([t[0], t[1], r[1], r[0]], m, (0, -1, 1))
    P.f([t[2], t[3], r[0], r[1]], m, (0, 1, 1))
    P.f([t[1], t[2], r[1]], m, (1, 0, 1))
    P.f([t[3], t[0], r[0]], m, (-1, 0, 1))


def chimney(P, x, y, z0, z1, w=.8, d=.7):
    P.box(x - w / 2, x + w / 2, y - d / 2, y + d / 2, z0, z1, ST, skip=(-Z,))
    P.box(x - w / 2 - .1, x + w / 2 + .1, y - d / 2 - .1, y + d / 2 + .1, z1, z1 + .14, DR)
    for px in (x - w / 4, x + w / 4):
        P.cyl(px, y, .1, z1 + .14, z1 + .5, 6, CY, skip=(-Z,))
    P.smoke.append((x, y, z1 + .5))


# ---------- pieces ----------
def cottage_s():
    P = Piece("cottage_s")
    x0, x1, y0, y1, ze = -3.2, 3.2, -2.3, 2.3, 3.0
    plinth(P, x0, x1, y0, y1)
    W = house_walls(P, x0, x1, y0, y1)
    P.door_h = W["front"].door(-.9, PL, 1.0)
    for u in (1.5,):
        W["front"].window(u, 1.1, .95, 1.15, shut=True)
    W["front"].window(-2.05, 1.1, .55, 1.0)
    W["back"].window(-1.0, 1.2, .9, 1.0, shut=True)
    W["back"].window(1.6, 1.2, .9, 1.0, shut=True)
    W["left"].window(0, 1.2, .7, .9)
    for w in W.values():
        w.build(PL - .05, ze)
    P.box(-1.75, -.05, y0 - .7, y0 + 0, 0, PL - .17, DR, skip=((0, 1, 0), (0, 0, -1)))  # door step
    quoins(P, x0, x1, y0, y1, PL, ze)
    gable_roof(P, x0, x1, y0, y1, ze, 5.5, CY)
    chimney(P, x1 - .75, 0, 4.0, 6.3)
    return P


def cottage_l():
    P = Piece("cottage_l")
    x0, x1, y0, y1, ze = -4.8, 4.8, -3.1, 3.1, 5.4
    plinth(P, x0, x1, y0, y1)
    W = house_walls(P, x0, x1, y0, y1)
    f = W["front"]
    P.door_h = f.door(0, PL, 1.1, arch=True)
    for u in (-3.1, -1.7, 1.8, 3.1):
        f.window(u, 1.15, .9, 1.25, shut=abs(u) > 3)
    for u in (-3.2, -1.1, 1.1, 3.2):
        f.window(u, 3.45, .85, 1.25, arch=True)
    for u in (-3, 0, 3):
        W["back"].window(u, 1.2, .9, 1.2)
        W["back"].window(u, 3.45, .85, 1.25)
    for k in ("left", "right"):
        W[k].window(-.9, 3.45, .8, 1.2)
        W[k].window(.9, 1.2, .8, 1.1)
    for w in W.values():
        w.build(PL - .05, ze)
    for w in W.values():  # string course between the storeys
        w.box(-w.w / 2 - .05, w.w / 2 + .05, 0, .1, 2.95, 3.12, DR)
    P.box(-1.05, 1.05, y0 - .75, y0, 0, PL - .17, DR, skip=((0, 1, 0), (0, 0, -1)))
    # porch hood over the door on two timber brackets
    P.solid(([(-1.25, y0 - .05, 3.0), (1.25, y0 - .05, 3.0), (1.25, y0 - .95, 2.72), (-1.25, y0 - .95, 2.72)],
             [(-1.25, y0 - .05, 3.16), (1.25, y0 - .05, 3.16), (1.25, y0 - .95, 2.88), (-1.25, y0 - .95, 2.88)]), CY)
    for x in (-1.05, 1.05):
        P.solid(([(x - .06, y0, 2.2), (x - .06, y0, 2.95), (x - .06, y0 - .85, 2.75)],
                 [(x + .06, y0, 2.2), (x + .06, y0, 2.95), (x + .06, y0 - .85, 2.75)]), TB, skip=((0, 1, 0),))
    quoins(P, x0, x1, y0, y1, PL, ze, .55)
    gable_roof(P, x0, x1, y0, y1, ze, 8.6, CY)
    chimney(P, x0 + .8, .2, 6.6, 9.6)
    chimney(P, x1 - .8, .2, 6.6, 9.6)
    return P


def house():
    P = Piece("house")
    x0, x1, y0, y1, ze = -3.5, 3.5, -3.3, 3.3, 6.6
    plinth(P, x0, x1, y0, y1)
    W = house_walls(P, x0, x1, y0, y1)
    f = W["front"]
    P.door_h = f.door(-1.6, PL, 1.05, arch=True)
    f.window(.6, 1.15, .9, 1.4)
    f.window(2.2, 1.15, .9, 1.4)
    for u in (-2.1, 0, 2.1):
        f.window(u, 3.9, .85, 1.5, arch=True)
    for u in (-1.6, 1.6):
        W["back"].window(u, 1.2, .9, 1.3)
        W["back"].window(u, 3.9, .85, 1.4)
    W["left"].window(-1.2, 3.9, .8, 1.3)
    W["left"].window(1.2, 1.2, .8, 1.2)
    for w in W.values():
        w.build(PL - .05, ze)
    for w in W.values():
        w.box(-w.w / 2 - .05, w.w / 2 + .05, 0, .1, 3.35, 3.52, DR)
    P.box(-2.35, -.85, y0 - .75, y0, 0, PL - .17, DR, skip=((0, 1, 0), (0, 0, -1)))
    quoins(P, x0, x1, y0, y1, PL, ze, .55)
    zr = 11.0
    gable_roof(P, x0, x1, y0, y1, ze, zr, SL, over=.4, ox=.35)
    # dormer on the front slope: stone cheeks, a window, its own little slate gable
    s = (zr - ze) / ((y1 - y0) / 2)
    yd, zb, hd = y0 + .55, ze + .55 * s - .1, 1.7  # dormer foot sits 0.32 m inside the roof slab
    D = Wall(P, (.9, yd, 0), (0, -1, 0), 1.6)
    D.window(0, zb + .5, .7, 1.0, lintel=None)
    D.build(zb, zb + hd)
    for x in (.1, 1.7):  # cheeks follow the slope back into the roof
        P.f([(x, yd, zb), (x, yd, zb + hd), (x, yd + hd / s, zb + hd)], ST, (x - .9, 0, 0))
    T = Piece("dormer")  # its little gable roof, built with the ridge along X, then turned to run back into the roof
    gable_roof(T, yd, yd + hd / s + .4, -.8, .8, zb + hd, zb + hd + .7, SL, over=.2, ox=.2, th=.12)
    T.move(0, .9, 0, 90)
    P.faces += T.faces
    # chimney stack up the outside of the +X gable
    P.box(x1, x1 + .7, -.6, .6, -1.5, zr + .9, ST, skip=((-1, 0, 0),))
    P.box(x1 - .1, x1 + .8, -.7, .7, zr + .9, zr + 1.04, DR)
    for py in (-.3, .3):
        P.cyl(x1 + .35, py, .1, zr + 1.04, zr + 1.4, 6, CY, skip=(-Z,))
    P.smoke.append((x1 + .35, 0, zr + 1.4))
    return P


def market():
    P = Piece("market")
    x0, x1, y0, y1 = -6.4, 6.4, -3.4, 3.4
    zg, ze = 3.8, 6.4
    plinth(P, x0, x1, y0, y1, top=PL, out=.15)
    W = house_walls(P, x0, x1, y0, y1)
    for k, n in (("front", 4), ("back", 4), ("left", 2), ("right", 2)):
        w = W[k]
        for i in range(n):
            u = -w.w / 2 + .8 + i * 3.0 + 1.1
            w.holes.append((u - 1.1, u + 1.1, PL, 3.45, True))
        w.build(PL - .05, zg, thick=.6)
    lower = len(P.faces)
    W2 = house_walls(P, x0, x1, y0, y1)
    for k, n in (("front", 4), ("back", 4), ("left", 2), ("right", 2)):
        w = W2[k]
        for i in range(n):
            w.window(-w.w / 2 + 1.9 + i * 3.0, 4.5, .9, 1.25)
        w.build(zg, ze)
        w.box(-w.w / 2 - .08, w.w / 2 + .08, 0, .14, zg - .1, zg + .12, DR)  # string course over the arches
    P.f([(x0 + .6, y0 + .6, zg - .05), (x1 - .6, y0 + .6, zg - .05), (x1 - .6, y1 - .6, zg - .05), (x0 + .6, y1 - .6, zg - .05)],
        TB, -Z)  # ceiling of the hall
    for x in (-3.4, 0, 3.4):  # beams
        P.box(x - .15, x + .15, y0 + .6, y1 - .6, zg - .35, zg - .05, TB, skip=(Z,))
    hip_roof(P, x0, x1, y0, y1, ze, 9.0, CY)
    for x, y, a, b, h in ((-3.5, .3, .7, .5, .6), (-2.7, .6, .55, .55, .5), (2.8, -.2, 1.8, .8, .9)):  # crates, stall
        P.box(x - a / 2, x + a / 2, y - b / 2, y + b / 2, PL, PL + h, TB if h < .8 else DO, skip=(-Z,))
    for x, y in ((3.6, 1.2), (4.2, 1.5)):
        P.cyl(x, y, .3, PL, PL + .85, 8, TB, skip=(-Z,))
    P.door_h = 3.45 - PL
    return P


def church():
    """Built along X with the tower at -X (door facing -X), then turned so the door faces -Y."""
    P = Piece("church")
    nx0, nx1, ny0, ny1, ne, nr = -5.5, 10.5, -4, 4, 7.0, 11.6
    tx0, tx1, ty0, ty1, tz = -10.5, -5.5, -2.5, 2.5, 17.0
    plinth(P, nx0, nx1, ny0, ny1)
    plinth(P, tx0, tx1, ty0, ty1, out=.25)
    N = house_walls(P, nx0, nx1, ny0, ny1)
    for k in ("front", "back"):
        for u in (-4.6, -1.0, 2.6, 6.2):
            N[k].window(u, 2.4, 1.1, 3.4, arch=True, depth=.4)
    N["right"].window(0, 2.4, 1.5, 4.4, arch=True, depth=.4)
    for w in N.values():
        w.build(PL - .05, ne)
    for k in ("front", "back"):  # buttresses between the windows, sloped tops
        w = N[k]
        for u in (-6.4, -2.8, .8, 4.4, 8.0):
            w.P.solid(([w.at(u - .3, 0, -.5), w.at(u + .3, 0, -.5), w.at(u + .3, .75, -.5), w.at(u - .3, .75, -.5)],
                       [w.at(u - .3, 0, 5.6), w.at(u + .3, 0, 5.6), w.at(u + .3, .75, 4.6), w.at(u - .3, .75, 4.6)]),
                      ST, skip=(-w.n, -Z))
    gable_roof(P, nx0, nx1, ny0, ny1, ne, nr, SL, over=.4, ox=.3)
    T = house_walls(P, tx0, tx1, ty0, ty1)
    P.door_h = T["left"].door(0, PL, 1.8, h=2.6, arch=True, depth=.45)
    for k in ("front", "back"):  # the +X face is inside the nave up to 11 m
        T[k].window(0, 6.0, .55, 1.6, arch=True, depth=.4)
    T["left"].window(0, 8.6, .6, 1.6, arch=True, depth=.4)
    for w in T.values():  # belfry: two tall openings a side, glowing at night
        for u in (-.85, .85):
            w.holes.append((u - .45, u + .45, 13.0, 15.6, True, .6))
            w.poly(Wall.outline(w.holes[-1]), -.6, WI)
            w.box(u - .55, u + .55, 0, .14, 12.88, 13.0, DR)
        w.build(PL - .05, tz, depth=.6)
        w.box(-w.w / 2 - .25, w.w / 2 + .25, 0, .3, tz, tz + .45, DR)  # cornice
    quoins(P, tx0, tx1, ty0, ty1, PL, tz - .1, .75)
    cx, cy = (tx0 + tx1) / 2, (ty0 + ty1) / 2
    P.cyl(cx, cy, 3.3, tz + .45, tz + .9, 8, SL, a0=pi / 8, skip=(-Z,))
    P.cone(cx, cy, 3.0, tz + .9, 27.0, 8, SL, a0=pi / 8)
    for x, y in ((tx0, ty0), (tx1, ty0), (tx1, ty1), (tx0, ty1)):  # corner pinnacles
        P.box(x - .3, x + .3, y - .3, y + .3, tz + .45, tz + 1.4, DR, skip=(-Z,))
        P.cone(x, y, .42, tz + 1.4, tz + 3.2, 4, SL, a0=pi / 4)
    P.box(cx - .05, cx + .05, cy - .05, cy + .05, 26.5, 28.2, IR)  # cross upright
    P.box(cx - .05, cx + .05, cy - .4, cy + .4, 27.4, 27.5, IR)
    P.box(tx0 - .9, tx0 - .25, -1.6, 1.6, 0, PL - .17, DR, skip=((1, 0, 0), (0, 0, -1)))
    P.light.append((cx, cy, 14.3))
    P.move(0, 0, 0, 90)  # door to -Y; the footprint (x -10.5..10.5 before the turn) is already centred
    return P


def well():
    P = Piece("well")
    k = 14
    P.cyl(0, 0, .95, -.6, .85, k, ST, skip=(-Z, Z))  # outer wall
    ring_o = lambda r, z: [(r * cos(2 * pi * i / k), r * sin(2 * pi * i / k), z) for i in range(k)]
    o, i_ = ring_o(1.05, .85), ring_o(.68, .85)
    oo = ring_o(1.05, .98)
    io = ring_o(.68, .98)
    for a in range(k):  # coping ring: dressed stone with a lip
        b = (a + 1) % k
        P.f([oo[a], oo[b], io[b], io[a]], DR, Z)
        P.f([o[a], o[b], oo[b], oo[a]], DR, Vector(o[a]) + Vector(o[b]))
        P.f([i_[a], i_[b], io[b], io[a]], DR, -(Vector(i_[a]) + Vector(i_[b])))
        P.f([o[a], o[b], i_[b], i_[a]], DR, -Z)
    P.cyl(0, 0, .72, -.4, .85, k, ST, skip=(Z, -Z))  # inner shaft (faces turned inward below)
    start = len(P.faces) - k
    P.faces[start:] = [(pts[::-1], m) for pts, m in P.faces[start:]]
    P.f(ring_o(.72, .35), IR, Z)  # dark water
    for x in (-.95, .95):
        P.box(x - .09, x + .09, -.09, .09, .1, 3.15, TB)
    P.box(-1.3, 1.3, -.08, .08, 3.0, 3.15, TB)  # ridge beam
    P.box(-1.15, 1.15, -.07, .07, 2.0, 2.14, TB)  # windlass beam
    P.cyl(0, 0, .12, 1.45, 1.75, 8, TB)  # bucket
    P.box(-.012, .012, -.012, .012, 1.75, 2.0, TB)  # rope
    P.solid(([(-1.4, -1.0, 2.45), (1.4, -1.0, 2.45), (1.4, 0, 3.15), (-1.4, 0, 3.15)],
             [(-1.4, -1.0, 2.6), (1.4, -1.0, 2.6), (1.4, 0, 3.3), (-1.4, 0, 3.3)]), CY, skip=((0, 1, 0),))
    P.solid(([(-1.4, 1.0, 2.45), (1.4, 1.0, 2.45), (1.4, 0, 3.15), (-1.4, 0, 3.15)],
             [(-1.4, 1.0, 2.6), (1.4, 1.0, 2.6), (1.4, 0, 3.3), (-1.4, 0, 3.3)]), CY, skip=((0, -1, 0),))
    P.door_h = 0
    return P


def lantern():
    P = Piece("lantern")
    P.box(-.24, .24, -.24, .24, -.4, .55, ST, skip=(-Z,))
    P.box(-.28, .28, -.28, .28, .55, .66, DR)
    P.cyl(0, 0, .065, .66, 2.55, 8, IR)
    P.box(-.2, .2, -.2, .2, 2.55, 2.62, IR)
    P.box(-.15, .15, -.15, .15, 2.62, 2.98, WI)  # glass box: glows
    for x in (-.16, .16):
        for y in (-.16, .16):
            P.box(x - .02, x + .02, y - .02, y + .02, 2.62, 2.98, IR)
    P.cone(0, 0, .26, 2.98, 3.22, 4, IR, a0=pi / 4)
    P.cyl(0, 0, .03, 3.2, 3.32, 6, IR)
    P.light.append((0, 0, 2.8))
    P.door_h = 0
    return P


def bridge():
    """One arch: road on z = 0 along X, x -6..6; segmental arch, 10 m clear span, 3.5 m rise, crown 0.9 m under the road."""
    P = Piece("bridge")
    w, y0, y1 = 4.4, -2.2, 2.2
    span, rise, crown = 10.0, 3.5, -.9
    R = (span ** 2 / 4 + rise ** 2) / (2 * rise)
    zc, spring = crown - R, crown - rise
    a0 = np.arcsin(span / 2 / R)
    K = 12
    arc = [(R * sin(a), zc + R * cos(a)) for a in np.linspace(-a0, a0, K + 1)]  # x, z from -X springing to +X
    for y, n in ((y0, -1), (y1, 1)):  # spandrel faces: strips from the arch up to the parapet
        for (xa, za), (xb, zb) in zip(arc, arc[1:]):
            P.f([(xa, y, za), (xb, y, zb), (xb, y, 0), (xa, y, 0)], ST, (0, n, 0))
        for x0, x1 in ((-6, -5), (5, 6)):  # pier faces
            P.f([(x0, y, -7), (x1, y, -7), (x1, y, 0), (x0, y, 0)], ST, (0, n, 0))
        for i, ((xa, za), (xb, zb)) in enumerate(zip(arc, arc[1:])):  # voussoirs, 5 cm proud, joint between each
            g = .03 * (xb - xa)
            ua, ub = Vector((xa + g, 0, za)), Vector((xb - g, 0, zb))
            c = Vector((0, 0, zc))
            oa, ob = c + (ua - c) * ((R + .75) / R), c + (ub - c) * ((R + .75) / R)
            if i % 2:
                oa, ob = c + (ua - c) * ((R + .6) / R), c + (ub - c) * ((R + .6) / R)
            d0, d1 = (y, y + n * .06)
            P.solid(([(ua.x, d0, ua.z), (ub.x, d0, ub.z), (ob.x, d0, ob.z), (oa.x, d0, oa.z)],
                     [(ua.x, d1, ua.z), (ub.x, d1, ub.z), (ob.x, d1, ob.z), (oa.x, d1, oa.z)]), DR, skip=((0, -n, 0),))
    for (xa, za), (xb, zb) in zip(arc, arc[1:]):  # barrel vault soffit
        P.f([(xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)], ST, (0, 0, -1))
    for x0, x1, n in ((-6, -5, 1), (5, 6, -1)):  # pier faces under the springing (inside the arch)
        x = x1 if n > 0 else x0
        P.f([(x, y0, -7), (x, y1, -7), (x, y1, spring), (x, y0, spring)], ST, (n, 0, 0))
    for x0, x1 in ((-6, -5), (5, 6)):  # cutwaters both sides: halves that make one buttress where modules meet
        for y, n in ((y0, -1), (y1, 1)):
            P.box(x0, x1, *sorted((y, y + n * .9)), -7, spring + .6, ST, skip=((0, -n, 0), (0, 0, -1)))
            P.solid(([(x0, y, spring + .6), (x1, y, spring + .6), (x1, y + n * .9, spring + .6), (x0, y + n * .9, spring + .6)],
                     [(x0, y, spring + 1.6), (x1, y, spring + 1.6), (x1, y + n * .02, spring + 1.62), (x0, y + n * .02, spring + 1.62)]),
                    DR, skip=((0, -n, 0), (0, 0, -1)))
    P.f([(-6, y0 + .45, 0), (6, y0 + .45, 0), (6, y1 - .45, 0), (-6, y1 - .45, 0)], ST, Z)  # road
    for x in (-6, 6):  # end caps: buried in the bank, or back to back with the next module
        P.f([(x, y0, -7), (x, y1, -7), (x, y1, 0), (x, y0, 0)], ST, (x, 0, 0))
    for y, n in ((y0, -1), (y1, 1)):  # parapets with dressed coping, a string course under them
        ya, yb = sorted((y, y - n * .45))
        P.box(-6, 6, ya, yb, 0, .95, ST, skip=((0, 0, -1),))
        P.box(-6, 6, ya - .06, yb + .06, .95, 1.1, DR)
        P.box(-6, 6, *sorted((y, y + n * .12)), -.35, -.15, DR, skip=((-1, 0, 0), (1, 0, 0), (0, -n, 0)))
    P.door_h = 0
    return P


PIECES = [cottage_s(), cottage_l(), house(), market(), church(), well(), lantern(), bridge()]


# ---------- build objects, report, export ----------
def to_object(P):
    verts, faces, mats, uvs, glow = [], [], [], [], []
    for pts, m in P.faces:
        i0 = len(verts)
        verts += [tuple(p) for p in pts]
        faces.append(tuple(range(i0, i0 + len(pts))))
        mats.append(m)
        glow.append(1. if m == WI else 0.)
        n = newell(pts)
        t = Z.cross(n)
        t = t.normalized() if t.length > 1e-6 else Vector((1, 0, 0))
        b, s = n.cross(t), TILE.get(m, 1.)
        uvs.append([(p.dot(t) / s, p.dot(b) / s) for p in pts])
    me = bpy.data.meshes.new(P.name)
    me.from_pydata(verts, [], faces)
    for poly, m in zip(me.polygons, mats):
        poly.material_index = m
    for m in MATS:
        me.materials.append(m)
    uvl = me.uv_layers.new(name="UVMap")
    uvl.data.foreach_set("uv", [c for uv in uvs for p in uv for c in p])
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    ca.data.foreach_set("color", [c for (pts, _), g in zip(P.faces, glow) for _ in pts for c in (1, 1, 1, g)])
    ob = bpy.data.objects.new(P.name, me)
    bpy.context.scene.collection.objects.link(ob)
    gl = lambda p: [round(p[0], 3), round(p[2], 3), round(-p[1], 3)]  # Blender Z-up -> glTF Y-up
    if P.smoke:
        ob["smoke"] = [gl(p) for p in P.smoke]
    if P.light:
        ob["light"] = [gl(p) for p in P.light]
    return ob


tris = lambda P: sum(len(pts) - 2 for pts, _ in P.faces)
OBS = [to_object(P) for P in PIECES]
total = 0
for P, ob in zip(PIECES, OBS):
    vs = np.array([tuple(p) for pts, _ in P.faces for p in pts])
    lo, hi = vs.min(0), vs.max(0)
    t = tris(P)
    total += t
    above = vs[vs[:, 2] >= -.01]
    print(f"TOWNKIT {P.name:10s} {hi[0]-lo[0]:5.1f} x {hi[1]-lo[1]:5.1f} m footprint (glTF x by z), "
          f"{above[:, 2].max():5.2f} m tall, base {lo[2]:+.1f} m, tris {t:5d}"
          + (f", door {P.door_h:.2f} m" if P.door_h else "") + (f", smoke {len(P.smoke)}" if P.smoke else "")
          + (f", light {len(P.light)}" if P.light else ""))
    assert t <= 3000, f"{P.name} over 3k tris"
print(f"TOWNKIT total tris {total} (<= 25000), pieces {len(PIECES)}")
assert total <= 25000

os.makedirs(out_dir, exist_ok=True)
for ob in OBS:
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, use_selection=True, export_format="GLB", export_yup=True,
                          export_vertex_color="ACTIVE", export_extras=True, export_image_format="JPEG",
                          export_jpeg_quality=88, export_apply=True)

# self-check the file we wrote: every piece is a node at the origin, COLOR_0 has alpha, panes carry it
with open(GLB, "rb") as fh:
    head = fh.read(20)
    js = json.loads(fh.read(struct.unpack("<I", head[12:16])[0]))
names = {n["name"]: n for n in js["nodes"]}
for P in PIECES:
    n = names[P.name]
    assert not any(n.get("translation", [0, 0, 0])), P.name
    prims = js["meshes"][n["mesh"]]["primitives"]
    assert all(js["accessors"][p["attributes"]["COLOR_0"]]["type"] == "VEC4" for p in prims), "COLOR_0 lacks alpha"
    ex = n.get("extras", {})
    assert len(ex.get("smoke", [])) == len(P.smoke) and len(ex.get("light", [])) == len(P.light), (P.name, ex)
    assert all(len(v) == 3 for v in ex.get("smoke", []) + ex.get("light", [])), (P.name, ex)
print(f"TOWNKIT wrote {GLB} {os.path.getsize(GLB) / 1e6:.2f} MB, nodes {sorted(names)}, materials "
      f"{[m['name'] for m in js['materials']]}, images {len(js.get('images', []))}")


# ---------- renders from the exported glb, beside the hero ----------
if not shots:
    sys.exit(0)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


kit = {o.name: o for o in load(GLB) if o.type == "MESH"}


def glow_materials(strength):
    """Wire COLOR_0 alpha into emission (gold), the way the game's material will read the mask."""
    for m in {s.material for o in kit.values() for s in o.material_slots}:
        nt = m.node_tree
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        vc = next((n for n in nt.nodes if n.type == "VERTEX_COLOR"), None) or nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = next(iter(kit.values())).data.color_attributes[0].name
        mu = next((n for n in nt.nodes if n.name == "glow"), None) or nt.nodes.new("ShaderNodeMath")
        mu.name, mu.operation = "glow", "MULTIPLY"
        nt.links.new(vc.outputs["Alpha"], mu.inputs[0])
        mu.inputs[1].default_value = strength
        b.inputs["Emission Color"].default_value = (1.0, .32, .05, 1)
        nt.links.new(mu.outputs[0], b.inputs["Emission Strength"])


def place(name, x, y, z=0., rot=0.):
    src = kit[name]
    ob = src if not src.get("_used") else bpy.data.objects.new(name, src.data)
    if ob is not src:
        sc.collection.objects.link(ob)
    src["_used"] = 1
    ob.location, ob.rotation_euler = (x, y, z), (0, 0, rot * pi / 180)
    return ob


def ground(x0, x1, y0, y1, z0, z1, rgb, rough=.95):
    bpy.ops.mesh.primitive_cube_add(location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object
    o.scale = ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
    m = bpy.data.materials.new("g")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = rough
    o.data.materials.append(m)
    return o


# the scene: a stream crossed by a two-arch bridge, the town climbing the far bank, the hero on the road
GR = (.16, .3, .05)
ground(-200, -11, -200, 200, -10, 0, GR)
ground(11, 200, -200, 200, -10, 0, GR)
ground(-12, 12, -200, 200, -10, -3.6, (.03, .09, .11), .08)
for x in (-6, 6):
    place("bridge", x, 0)
L = [place("lantern", x, y) for x, y in ((-12.6, -2.6), (12.6, -2.6), (12.6, 2.6), (25, -3.2), (-19, -3.2))]
place("cottage_s", 21, -14)
place("well", 16, -2.5)
place("cottage_l", 31.5, -9)
place("house", 18, 9)
place("market", 30, 6)
place("church", 40, 24, 0, -90)  # nave side and buttresses toward the camera, tower to the left
place("cottage_s", -17, 7.5)
hero = load(os.path.join(ROOT, "public/models/hero.glb"))
for o in hero:
    if o.parent is None:
        o.location = (18.9, -17.4, 0)
        o.rotation_euler = (0, 0, pi * .85)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
sc.camera = cam
cam.data.lens = 30
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sc.collection.objects.link(sun)
sun.rotation_euler = (0.95, 0.15, -0.9)
w = bpy.data.worlds.new("w")
sc.world = w
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.eevee.taa_render_samples = 24
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
sc.view_settings.view_transform = "AgX"
for look in ("AgX - Punchy", "Punchy"):
    try:
        sc.view_settings.look = look
        break
    except TypeError:
        pass
lamps = []
for o in L:
    pt = bpy.data.objects.new("lamp", bpy.data.lights.new("lamp", "POINT"))
    pt.data.color, pt.data.shadow_soft_size, pt.data.use_shadow = (1, .6, .25), .1, False
    pt.location = o.location + Vector((0, 0, 2.8))
    sc.collection.objects.link(pt)
    lamps.append(pt)


def aim(pos, at, lens):
    cam.location, cam.data.lens = pos, lens
    cam.rotation_euler = (Vector(at) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()


def shoot(name, sky, sun_e, sun_c, glow, lamp_e):
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*sky, 1)
    sun.data.energy, sun.data.color = sun_e, sun_c
    glow_materials(glow)
    for pt in lamps:
        pt.data.energy = lamp_e
    sc.render.filepath = os.path.join(ROOT, shots, f"town-kit-{name}.png")
    bpy.ops.render.render(write_still=True)
    print("TOWNKIT rendered", sc.render.filepath)


aim((1.0, -31, 8.5), (19, 4, 4.5), 30)
shoot("day", (.42, .56, .78), 4.0, (1, .93, .8), 0., 0.)
shoot("night", (.09, .06, .16), .5, (.65, .5, 1), 1.6, 250.)  # dusk, like mix-settlements.png
aim((13, -29, 2.6), (21, -14.5, 2.4), 40)  # hero at the cottage door: scale and the stacked stone up close
shoot("close", (.42, .56, .78), 4.0, (1, .93, .8), 0., 0.)
# every piece in a row on the far bank, the hero at the front for scale
for name, x, rot, z in (("cottage_s", 20, 0, 0), ("well", 29, 0, 0), ("lantern", 33, 0, 0), ("cottage_l", 42, 0, 0),
                        ("house", 56, 0, 0), ("market", 72, 0, 0), ("church", 95, -90, 0), ("bridge", 118, 0, 7.0)):
    place(name, x, 100, z, rot)
for o in hero:
    if o.parent is None:
        o.location, o.rotation_euler = (25, 95, 0), (0, 0, 0)
sc.render.resolution_x = 2400
aim((67, 26, 24), (69, 100, 5), 22)
shoot("pieces", (.42, .56, .78), 4.0, (1, .93, .8), 0., 0.)
