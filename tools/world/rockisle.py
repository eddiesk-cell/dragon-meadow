"""The rock island (PLAN.md Phase 6, lane landmarks): a fallen skystone isle standing out of a pond near the start.
  blender -b --python-exit-code 1 -P tools/world/rockisle.py -- public/models/world
Writes rockisle.glb. Metres, glTF axes (y up, -z north). Every node sits at the origin, built in island-local metres:
  rock   the body: a grassy apron (y 0..10, skirt to y = -3; landmarks.js conforms it to the meadow), a cliff of piled
         boulders to a south terrace at y ~21, a tapering summit block set back north to y ~74 with a grassy dome
  trees  round puff trees (lumpy cloud pads on crooked trunks) on the summit, the terrace and the apron, plus bushes
  egg    the egg stone, its own origin at its foot (sunk 0.8 m), 18 m tall; landmarks.js stands it on the shore
  boulders  grey rocks bedded in the terrace and ledge turf (material rock, like the body)
COLOR_0 rgb = albedo (linear), alpha = night-vein mask (1 bare rock, 0.3 turf, 0 leaves). Material names: rock, leaf, egg.
Node extras on `rock`: cottage = [x, y, z, yaw] (the terrace spot for town-kit's cottage_l, front toward the start),
top = rock summit height, r = apron radius.
"""
import bpy, bmesh, sys, os, json, struct
import numpy as np
from math import pi, cos, sin, atan2, sqrt
from mathutils import Vector, noise

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = args[0]
GLB = os.path.join(out_dir, "rockisle.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
rng = np.random.default_rng(23)


def ss(a, b, x):
    k = min(1., max(0., (x - a) / (b - a)))
    return k * k * (3 - 2 * k)


def nz(x, y, z, s, o=0.):  # perlin, ~[-1, 1]
    return noise.noise(Vector((x * s + o, y * s + o * .7, z * s)))


def fbm(x, y, z, s, o=0., oct=4):
    return noise.fractal(Vector((x * s + o, y * s, z * s)), 1.0, 2.0, oct) * .6


def dome(x, y, z, s):  # rounded rock masses: 1 at a cell's heart, ~0.7 in the creases
    d = noise.voronoi(Vector((x * s, y * s, z * s)), distance_metric="DISTANCE")[0][0]
    return sqrt(max(0., 1 - (d / .85) ** 2))


def slabs(x, y, z, s):  # tall rock slabs: (1 on a slab's face, 0 in the crack between two; a per-slab value in -1..1)
    ds, ps = noise.voronoi(Vector((x * s, y * s * .6, z * s)), distance_metric="DISTANCE")
    return ss(0., .16, ds[1] - ds[0]), noise.noise(ps[0] * 3.1)


def mix(a, b, t):
    t = min(1., max(0., t))
    return [p + (q - p) * t for p, q in zip(a, b)]


# ---------- the body: a lathe of noisy rings (island-local, three axes: x east, y up, z south) ----------
CZ = -10.  # the summit block stands 10 m north of the apron's centre, which leaves a broad south terrace
rings = [(-3, 40., 0, 3), (0, 39., 0, 3), (1.5, 37., 0, 3), (3, 35., 0, 3), (4.5, 33.3, 0, 3), (5.8, 32., 0, 2),
         (6.6, 31.3, 0, 2)]  # a short lumpy apron, rock breaking through the turf
rings += [(7.4 + i * 1.1, 30.6 - 1.6 * i / 10 + .5 * sin(i * .9), 0, 1) for i in range(11)]  # cliff 1, 7.4 -> 18.4 m
rings += [(19.4, 28., 0, 2), (20., 27.2, 0, 2)]
rings += [(20.2 + .3 * k, 26.5 + (20.5 - 26.5) * k / 4, CZ * k / 4, 0) for k in range(5)]  # the south terrace
rings += [(22.2 + i * 1.2, 20. - 3. * i / 19, CZ - i / 40, 1) for i in range(20)]  # cliff 2 lower, to 45 m
rings += [(45.8, 16.6, CZ - .5, 2), (46.2, 15.4, CZ - .55, 0), (46.7, 14.8, CZ - .6, 2)]  # a mossy mid ledge
rings += [(47.6 + i * 1.25, 15. - 3.5 * i / 15, CZ - .6 - .4 * i / 15, 1) for i in range(16)]  # cliff 2 upper, to 66.4
rings += [(67.2, 11., CZ - 1, 2), (68.5, 10.2, CZ - 1, 0), (70, 9., CZ - 1, 0), (71.5, 7.2, CZ - 1, 0),
          (72.8, 5., CZ - 1, 0), (73.6, 2.8, CZ - 1, 0), (74., 1., CZ - 1, 0)]
POLE = (0., 74.15, CZ - 1)
N = 240
TH = np.arange(N) * 2 * pi / N
LOBE = 1 + .07 * np.sin(2 * TH + .6) + .05 * np.sin(3 * TH + 2.1) + .03 * np.sin(5 * TH + 1.)  # not a round tower
AMP = {0: (.5, 0., 0.), 1: (2.6, 5.0, 1.), 2: (1.4, 2.4, .3), 3: (.8, 2.2, 0.)}  # zone: (fractal, rock mass, ribs) in m

V, zone_of, DISP = [], [], []
for i, (h, r, cz, zone) in enumerate(rings):
    a, b = rings[max(i - 1, 0)], rings[min(i + 1, len(rings) - 1)]
    nr, nh = b[0] - a[0], -(b[1] - a[1])  # outward profile normal: (radial, up) = (dh, -dr)
    ln = sqrt(nr * nr + nh * nh) or 1.
    nr, nh = nr / ln, nh / ln
    fa, fd, fc = AMP[zone]
    for j in range(N):
        c, s_, R = cos(TH[j]), sin(TH[j]), r * LOBE[j]
        x, z = R * c, cz + R * s_
        if zone == 1:  # cliffs: slabs standing proud by different amounts, cracks between them
            sl, sv = slabs(x, h, z, .07)
            mass = .6 * sl + .4 * sv - .3
        else:
            mass = dome(x, h, z, .07) - .45
        d = fa * fbm(x, h, z, .045) + fd * mass + fc * nz(x, h, z, .3) * .5 \
            + fc * nz(x * 6, h * .4, z * 6, .05, 9.)
        if h < 0:
            d *= .3
        V.append((x + c * nr * d, h + nh * d, z + s_ * nr * d))
        zone_of.append(zone)
        DISP.append(d)
V.append(POLE)
nring = len(rings)
F = [(i * N + j, i * N + (j + 1) % N, (i + 1) * N + (j + 1) % N, (i + 1) * N + j)
     for i in range(nring - 1) for j in range(N)]
F += [((nring - 1) * N + j, (nring - 1) * N + (j + 1) % N, nring * N) for j in range(N)]
# ring j runs from +x toward +z (south), so this winding faces inward: flip it
F = [f[::-1] for f in F]


def to_blender(v):  # three (x, y up, z south) -> Blender (x, y north, z up)
    return (v[0], -v[2], v[1])


def make(name, verts, faces, matname):
    me = bpy.data.meshes.new(name)
    me.from_pydata([to_blender(v) for v in verts], [], faces)
    me.update()
    m = bpy.data.materials.get(matname) or bpy.data.materials.new(matname)
    me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def paint(ob, cols):  # cols: per vertex (r, g, b, a), linear
    me = ob.data
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = ca
    vi = np.zeros(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", vi)
    ca.data.foreach_set("color", np.asarray(cols, np.float32)[vi].ravel())


def normals(ob):  # per vertex, three axes
    n = np.zeros(len(ob.data.vertices) * 3, np.float32)
    ob.data.vertex_normals.foreach_get("vector", n)
    n = n.reshape(-1, 3)
    return np.stack([n[:, 0], n[:, 2], -n[:, 1]], 1)


rock = make("rock", V, F, "rock")
NR = normals(rock)
assert NR[nring * N - N // 4][1] > -.5 and np.mean(NR[N * 14:N * 15, 1]) < .5, "rock normals point inward"
GRASS, GRASS_Y, GRASS_D = (.16, .36, .03), (.3, .43, .04), (.07, .2, .02)
ROCK, ROCK_D, MOSS = (.5, .47, .4), (.22, .2, .17), (.07, .14, .035)
cols = []
for k, (x, y, z) in enumerate(V):
    up = NR[k][1]
    zone = zone_of[k] if k < len(zone_of) else 0
    turf = {0: ss(.2, .45, up), 1: ss(.6, .8, up), 2: ss(.45, .7, up), 3: ss(.5, .72, up)}[zone]  # cliffs stay bare rock
    g = mix(mix(GRASS, GRASS_Y, .5 + fbm(x, y, z, .06, 3.)), GRASS_D, ss(.1, .5, fbm(x, y, z, .17, 7.)))
    crack, tone = slabs(x, y, z, .07)  # the slabs the shape was pushed by: each its own tone, dark cracks between
    hollow = .5 + .5 * ss(-2.2, 1.6, DISP[k] if k < len(DISP) else 0.)  # recesses in shade: the flat light hides the shape otherwise
    bed = .86 + .14 * sin(y * .85 + 2.5 * fbm(x, y, z, .05, 5.))  # bedding layers
    rc = [c * hollow * (.82 + .18 * tone) for c in mix([c * .45 for c in ROCK_D], [c * bed for c in ROCK], crack)]
    moss = ss(.05, .5, nz(x * .3, y * .022, z * .3, 1., 4.)) * (1 - ss(.5, .9, up)) * .55  # green tongues down the cliffs
    rc = mix(rc, MOSS, moss)
    c = mix(rc, g, turf)
    cols.append((*c, (1. - turf) * (1. - .3 * moss)))  # veins in bare rock only
paint(rock, cols)
top = max(v[1] for v in V)


# ---------- surface queries on the finished rock (ray down) ----------
def surface(x, z):
    ok, loc, n, _ = rock.ray_cast(Vector((x, -z, 300.)), Vector((0, 0, -1)))
    return (loc.z, n.z) if ok else (None, 0.)


# the cottage spot: on the terrace, on the line toward the start; front (+z) faces the start
# shortcut: assumes the island stands at landmarks.js's (50, -105) and the start at the origin; re-run if either moves.
to_start = Vector((-50., 109.5)).normalized()
cx, cz, yaw = to_start.x * 20., to_start.y * 20., atan2(to_start.x, to_start.y)
corners = [surface(cx + dx * cos(yaw) + dz * sin(yaw), cz - dx * sin(yaw) + dz * cos(yaw))
           for dx in (-5.2, 5.2) for dz in (-3.5, 3.5)]
assert all(h is not None for h, _ in corners), corners
hs = [h for h, _ in corners]
cy = min(hs)
print(f"ROCKISLE cottage spot ({cx:.1f}, {cy:.2f}, {cz:.1f}) yaw {yaw:.3f}, terrace under its corners {min(hs):.2f}..{max(hs):.2f} m")
assert max(hs) - min(hs) < 2.5, "terrace too rough for the cottage"
rock["cottage"] = [round(cx, 3), round(cy, 3), round(cz, 3), round(yaw, 4)]
rock["top"] = round(top, 2)
rock["r"] = 40.


# ---------- puff trees: crooked trunks, lumpy cloud pads ----------
def ico(sub):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.)
    v = np.array([tuple(p.co) for p in bm.verts])
    f = [tuple(p.index for p in fa.verts) for fa in bm.faces]
    bm.free()
    return v, f


ICO = {2: ico(2), 3: ico(3)}
TV, TF, TC = [], [], []
LEAF, LEAF_Y, LEAF_D = (.1, .26, .04), (.22, .36, .05), (.02, .06, .018)
BARK = (.1, .075, .05)


def pad(c, r, squash, sub, seed):
    v, f = ICO[sub]
    i0 = len(TV)
    for p in v:
        k = 1 + .14 * nz(p[0], p[1], p[2], 2.2, seed) + .06 * nz(p[0], p[1], p[2], 5., seed + 3)
        q = (c[0] + p[0] * r * k, c[1] + p[2] * r * squash * k, c[2] + p[1] * r * k)  # icosphere z -> up
        n = Vector((p[0], p[2] / squash, p[1])).normalized()
        up = n.y
        col = mix(mix(LEAF, LEAF_Y, .5 + .9 * nz(q[0], q[1], q[2], .5, seed)), LEAF_D, ss(.35, -.75, up))
        TV.append(q)
        TC.append((*col, 0.))
    TF.extend(tuple(i0 + i for i in fa) for fa in f)


def tube(pts, r0, r1, sides=7):
    i0 = len(TV)
    for k, p in enumerate(pts):
        t = k / (len(pts) - 1)
        a = Vector(pts[min(k + 1, len(pts) - 1)]) - Vector(pts[max(k - 1, 0)])
        a.normalize()
        u = a.cross(Vector((0, 0, 1))) if abs(a.z) < .9 else a.cross(Vector((1, 0, 0)))
        u.normalize()
        w = a.cross(u)
        r = r0 + (r1 - r0) * t
        for s in range(sides):
            o = u * cos(2 * pi * s / sides) * r + w * sin(2 * pi * s / sides) * r
            TV.append((p[0] + o.x, p[1] + o.y, p[2] + o.z))
            TC.append((*[c * (.8 + .4 * t) for c in BARK], 0.))
    for k in range(len(pts) - 1):
        for s in range(sides):
            a, b = i0 + k * sides + s, i0 + k * sides + (s + 1) % sides
            TF.append((a, b, b + sides, a + sides))


def tree(x, y, z, h, pr, seed):
    lean = rng.uniform(0, 2 * pi)
    ln = rng.uniform(.05, .22) * h
    pts = [(x + cos(lean) * ln * (k / 6) ** 1.6 + .6 * sin(k * 1.3 + seed), y - .6 + h * k / 6,
            z + sin(lean) * ln * (k / 6) ** 1.6) for k in range(7)]
    tube(pts, .055 * h, .022 * h)
    top = pts[-1]
    pad((top[0], top[1] + pr * .25, top[2]), pr, .62, 3, seed)
    for b in range(rng.integers(2, 5)):
        k = rng.integers(3, 6)
        a = lean + pi + rng.uniform(-1.3, 1.3) + b * 2.1
        L = pr * rng.uniform(.9, 1.4)
        root = pts[k]
        end = (root[0] + cos(a) * L, root[1] + L * rng.uniform(.2, .5), root[2] + sin(a) * L)
        tube([root, ((root[0] + end[0]) / 2, (root[1] + end[1]) / 2 + .3, (root[2] + end[2]) / 2), end], .022 * h, .012 * h, 5)
        pad(end, pr * rng.uniform(.45, .7), .6, 3, seed + b * 7)


placed = []


def scatter(n, rmin, rmax, ymin, ymax, pr, flat, gap, put, tries=900):
    """n things on the rock's own surface: ring rmin..rmax round the apron centre (the summit's above 40 m),
    surface height ymin..ymax, slope up-normal >= flat, `gap` m clear of everything placed before."""
    got = 0
    for _ in range(tries):
        if got == n:
            break
        a, d = rng.uniform(0, 2 * pi), rng.uniform(rmin, rmax)
        x, z = cos(a) * d, sin(a) * d + (CZ if ymin > 40 else 0.)
        y, up = surface(x, z)
        if y is None or not (ymin <= y <= ymax) or up < flat:
            continue
        rr = rng.uniform(*pr)
        if any((x - p[0]) ** 2 + (z - p[1]) ** 2 < (gap + rr + p[2]) ** 2 for p in placed):
            continue
        put(x, y, z, rr, got)
        placed.append((x, z, rr))
        got += 1
    return got


BV, BF, BC = [], [], []


def boulder(x, y, z, rr, k):  # a grey rock bedded a third deep in the turf, mossy on top
    v, f = ICO[2 if rr < 1.8 else 3]  # bmesh subdivisions: 2 -> 80 faces, 3 -> 320
    i0, sq = len(BV), rng.uniform(.5, .8)
    for p in v:
        kk = 1 + .25 * nz(p[0], p[1], p[2], 1.3, k * 5.) + .08 * nz(p[0], p[1], p[2], 4., k)
        q = (x + p[0] * rr * kk, y - rr * sq * .35 + p[2] * rr * sq * kk, z + p[1] * rr * kk)
        c = mix(ROCK_D, ROCK, .5 + .45 * p[2] + .25 * nz(q[0], q[1], q[2], .7, k))
        BV.append(q)
        BC.append((*mix(c, MOSS, ss(.4, .9, p[2]) * ss(0., .6, nz(q[0], q[1], q[2], .4, k)) * .7), 1.))
    BF.extend(tuple(i0 + i for i in fa) for fa in f)


tree_of = lambda h: lambda x, y, z, rr, k: tree(x, y, z, rng.uniform(*h), rr, k * 1.7)
bush = lambda x, y, z, rr, k: pad((x, y + rr * .25, z), rr, .7, 3, k * 3.1)
clump = lambda x, y, z, rr, k: pad((x, y + rr * .1, z), rr, .75, 3, k * 2.3)
placed.append((cx, cz, 6.))  # keep the cottage's terrace spot clear
counts = {
    "summit trees": scatter(5, 0, 8.5, 62, 80, (3.4, 4.6), .6, -2.5, tree_of((8, 11))),
    "terrace trees": scatter(9, 14, 27, 19, 26, (3., 4.4), .75, -1., tree_of((6, 9))),
    "ledge trees": scatter(5, 13, 18, 44, 50, (2.6, 3.6), .65, -.5, tree_of((6, 9))),
    "apron trees": scatter(8, 28, 38, 0, 8, (3.4, 4.8), .55, 1., tree_of((6, 10))),
    "boulders": scatter(30, 10, 30, 12, 50, (.9, 2.6), .45, -.5, boulder),  # terrace and ledges
    "shore bushes": scatter(25, 32, 40, -1, 4, (1.6, 2.8), .45, -.4, bush),
    "bushes": scatter(45, 12, 40, 0, 80, (1.4, 2.8), .55, -.4, bush),
    "cliff bushes": scatter(40, 0, 32, 8, 70, (1.2, 2.4), .45, -.3, bush),
    "cliff clumps": scatter(110, 0, 34, 6, 72, (1.8, 3.6), .15, -2.4, clump, tries=4000),  # green masses hugging the rock
}
print("ROCKISLE", ", ".join(f"{k} {v}" for k, v in counts.items()))
assert counts["summit trees"] >= 4 and counts["terrace trees"] >= 6 and counts["boulders"] >= 20 and counts["cliff clumps"] >= 60, counts
trees = make("trees", TV, TF, "leaf")
paint(trees, TC)
boulders = make("boulders", BV, BF, "rock")
paint(boulders, BC)


# ---------- the egg stone: smooth pale skystone, wider low, 14 m tall, foot sunk 0.6 m ----------
EV, EC = [], []
NU, NV, H, R = 64, 40, 18.8, 6.2


def egg_vertex(u, a):  # u: -1 bottom .. 1 top
    r = R * sqrt(max(0., 1 - u * u)) * (1 - .13 * u)
    x, y, z = r * cos(a), (u + 1) * H / 2 - .8, r * sin(a)
    sp = ss(.55, .75, nz(x, y, z, 1.7, 2.))  # speckles
    c = mix(mix((.6, .58, .52), (.7, .69, .64), .5 + nz(x, y, z, .25, 1.)), (.36, .35, .32), sp * .6)
    EV.append((x, y, z))
    EC.append((*mix(c, (.3, .36, .2), ss(1.2, 0., y) * .7), 1.))  # a little green at the foot


egg_vertex(-1, 0)
for i in range(1, NV):
    for j in range(NU):
        egg_vertex(-cos(pi * i / NV), 2 * pi * j / NU)
egg_vertex(1, 0)
ring = lambda i, j: 1 + (i - 1) * NU + j % NU
EF = [(0, ring(1, j + 1), ring(1, j)) for j in range(NU)]
EF += [(ring(i, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j)) for i in range(1, NV - 1) for j in range(NU)]
EF += [(ring(NV - 1, j), ring(NV - 1, j + 1), len(EV) - 1) for j in range(NU)]
EF = [f[::-1] for f in EF]  # same handedness as the rock: flip to face out
egg = make("egg", EV, EF, "egg")
assert normals(egg)[len(EV) - 1][1] > .9, "egg normals point inward"
paint(egg, EC)

# ---------- report, export, self-check ----------
tris = lambda ob: sum(len(p.vertices) - 2 for p in ob.data.polygons)
tt = max(v[1] for v in TV)
for ob in (rock, boulders, trees, egg):
    vs = np.array([tuple(v.co) for v in ob.data.vertices])
    lo, hi = vs.min(0), vs.max(0)
    print(f"ROCKISLE {ob.name:8s} {hi[0]-lo[0]:6.1f} x {hi[1]-lo[1]:6.1f} m footprint, y {lo[2]:+6.1f}..{hi[2]:6.1f} m, tris {tris(ob):6d}")
print(f"ROCKISLE island height: rock {top:.1f} m, with trees {tt:.1f} m (PLAN: 80-120)")
assert 80 <= tt <= 120
os.makedirs(out_dir, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
for ob in (rock, boulders, trees, egg):
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, use_selection=True, export_format="GLB", export_yup=True,
                          export_vertex_color="ACTIVE", export_extras=True, export_apply=True)
with open(GLB, "rb") as fh:
    head = fh.read(20)
    js = json.loads(fh.read(struct.unpack("<I", head[12:16])[0]))
names = {n["name"]: n for n in js["nodes"]}
for nm in ("rock", "boulders", "trees", "egg"):
    prims = js["meshes"][names[nm]["mesh"]]["primitives"]
    assert all(js["accessors"][p["attributes"]["COLOR_0"]]["type"] == "VEC4" for p in prims), nm + " COLOR_0 lacks alpha"
assert len(names["rock"]["extras"]["cottage"]) == 4
print(f"ROCKISLE wrote {GLB} {os.path.getsize(GLB) / 1e6:.2f} MB, nodes {sorted(names)}, rock extras {names['rock']['extras']}")
