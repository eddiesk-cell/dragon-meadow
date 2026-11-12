"""Sky islands (lane skyisles): three floating islands of pale skystone in one glb — isle_a (broad mesa, three falls),
isle_b (tall, long cliffs, two falls), isle_c (small, round, one fall). Grass cap with umbrella trees and rim bushes,
streams running to the lips, moss and vine curtains over striated cliffs, a tapering underside with stone spikes,
hanging roots and hanging vines. Vertex colour alpha = glow mask (1 on vines), as the flora lanes do.
Each island carries empties fall_<n> on its spring lips, extras {w: width m, drop: fall length m}; falls drop straight down.
  blender -b -P tools/flora/skyisle.py -- public/models/flora [render.png [dark]]
Native size ~100 m across (the game scales each copy), origin at the centre of the rim, +Z up (+Y up in glTF).
"""
import bpy, bmesh, sys, random
from math import pi, sin, cos
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = args[0]
bpy.ops.wm.read_factory_settings(use_empty=True)


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(a + (b - a) * t for a, b in zip(c1, c2))


GRASS, GRASS_D = (0.46, 0.64, 0.17), (0.27, 0.46, 0.12)
STONE, STONE_D, STONE_W = (0.84, 0.80, 0.75), (0.56, 0.52, 0.56), (0.91, 0.85, 0.74)
UNDER, UNDER_D = (0.64, 0.60, 0.58), (0.46, 0.43, 0.46)
MOSS = (0.33, 0.50, 0.17)
WET = (0.40, 0.44, 0.47)
LEAF = [(0.20, 0.42, 0.14), (0.32, 0.54, 0.16), (0.48, 0.64, 0.18)]
BARK = (0.62, 0.58, 0.52)
VINE = (0.52, 0.72, 0.20)
ROOT = (0.34, 0.29, 0.24)
WATER = (0.60, 0.80, 0.90)
NS = 96  # sides round the island


def isle(name, seed, Hc, Hd, stretch, nfalls, ntrees, ncurtains):
    rnd = random.Random(seed)
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    vcol = []  # colour per vertex, keyed by v.index (bmesh hands out a fresh Python wrapper per access)

    def setc(v, c, a=0.0):
        v.index = len(vcol)
        vcol.append((*c, a))

    def V(p, c, a=0.0):
        v = bm.verts.new(p)
        setc(v, c, a)
        return v

    ph = [rnd.uniform(0, 2 * pi) for _ in range(10)]
    f0 = rnd.uniform(0, 2 * pi)
    falls = [f0 + 2 * pi * i / max(nfalls, 1) + rnd.uniform(-0.3, 0.3) for i in range(nfalls)]

    def near_fall(th, w):  # 1 on a lip's line, 0 beyond w radians
        m = min((abs((th - f + pi) % (2 * pi) - pi) for f in falls), default=9)
        return max(0.0, 1 - m / w)

    def R(th):  # outline radius
        return 50 * (1 + 0.10 * sin(2 * th + ph[0]) + 0.07 * sin(3 * th + ph[1]) + 0.04 * sin(5 * th + ph[2]) + 0.02 * sin(9 * th + ph[3]))

    def P(th, r, z, off=(0.0, 0.0)):
        return Vector((r * cos(th) * stretch + off[0], r * sin(th) / stretch + off[1], z))

    def capz(th, f):  # domed top, gentle bumps, a channel to each lip
        return 4.5 * (1 - f * f) + (1.2 * sin(3 * th + ph[4]) + 0.8 * sin(7 * th + ph[5])) * sin(pi * f) - 1.6 * near_fall(th, 0.07) * f * f

    def cliffr(th, t, z):  # fluted columns, strata, ledges every ~11 m, leaning in a little toward the base
        flute = 0.028 * cos(31 * th + 0.8 * sin(z * 0.07 + ph[7])) + 0.012 * cos(67 * th + ph[8])
        strata = 0.018 * sin(z * 0.55 + ph[9]) + (0.02 if (z / 11 + ph[3]) % 1 < 0.12 else 0)
        return R(th) * (1 - 0.07 * t + flute + strata)

    lob = lambda th: 0.5 + 0.5 * sin(3 * th + ph[1])
    drift = (12 * cos(ph[0]), 12 * sin(ph[0]))  # the underside's point hangs off-centre

    def under(th, t):
        r = R(th) * 0.93 * (1 - t) ** 0.7 * (1 + 0.35 * t * (lob(th) - 0.5) + 0.09 * sin(7 * th + 6 * t + ph[4]) + 0.06 * sin(13 * th - 9 * t + ph[8])
                                             + 0.07 * abs(sin(9.5 * th + 2 * t + ph[2])) ** 3 - 0.03)  # rock ribs running down
        z = -Hc - (Hd - Hc) * t * (1 - 0.15 * lob(th) * t)
        return P(th, r, z, (drift[0] * t * t, drift[1] * t * t))

    ths = [2 * pi * k / NS for k in range(NS)]
    rings = []

    # --- cap rings, centre outward ---
    for f in (0.12, 0.25, 0.38, 0.5, 0.62, 0.73, 0.82, 0.89, 0.94, 0.975, 1.0):
        ring = []
        for th in ths:
            stream = f > 0.3 and near_fall(th, 2.4 / (50 * f)) > 0
            c = WATER if stream else mix(GRASS_D, GRASS, 0.5 + 0.5 * sin(5 * th + 11 * f + ph[6]))
            ring.append(V(P(th, R(th) * f, capz(th, f)), c, 0.0))
        rings.append(ring)
    rings.append([V(P(th, R(th) * 1.03, -1.8 - 1.0 * near_fall(th, 0.07)), mix(GRASS_D, MOSS, 0.5)) for th in ths])  # grass lip
    # --- cliff ---
    NC = 16
    for i in range(NC):
        t = i / (NC - 1)
        z = -2.5 - (Hc - 2.5) * t
        ring = []
        for th in ths:
            groove = 0.5 + 0.5 * cos(31 * th + 0.8 * sin(z * 0.07 + ph[7]))
            c = mix(STONE_D, mix(STONE, STONE_W, 0.5 + 0.5 * sin(z * 0.3 + ph[2])), 0.35 + 0.65 * groove)
            c = mix(c, MOSS, min(1.0, max(0.0, 1 - t * 4 + 0.6 * sin(13 * th + ph[5]))) * 0.8)
            c = mix(c, WET, near_fall(th, 0.06) * 0.7)
            ring.append(V(P(th, cliffr(th, t, z), z), c))
        rings.append(ring)
    # --- underside ---
    NU = 14
    for i in range(1, NU):
        t = i / NU
        rings.append([V(under(th, t), mix(mix(UNDER, UNDER_D, t), STONE_D, 0.3 + 0.3 * sin(23 * th + ph[6]))) for th in ths])

    centre = V(Vector((0, 0, 4.5)), GRASS)
    tip = V(P(0, 0, -Hd, drift), UNDER_D)
    for k in range(NS):
        k1 = (k + 1) % NS
        bm.faces.new((centre, rings[0][k], rings[0][k1]))
        for a, b in zip(rings, rings[1:]):
            bm.faces.new((a[k], b[k], b[k1], a[k1]))
        bm.faces.new((rings[-1][k], tip, rings[-1][k1]))

    def tube(pts, radii, sides, c0, c1, a=0.0):
        rs = []
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            u = t.cross(Vector((0, 0, 1)))
            u = u.normalized() if u.length > 1e-3 else Vector((1, 0, 0))
            w = t.cross(u)
            c = mix(c0, c1, i / (len(pts) - 1))
            rs.append([V(p + (u * cos(2 * pi * k / sides) + w * sin(2 * pi * k / sides)) * radii[i], c, a) for k in range(sides)])
        for r0, r1 in zip(rs, rs[1:]):
            for k in range(sides):
                bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))

    def ribbon(pts, outs, widths, c0, c1, a):  # a strip hanging down pts, facing outs; glow a·(0.5→1) brightening to the tip
        prev = None
        for i, (p, o, w) in enumerate(zip(pts, outs, widths)):
            s = Vector((-o.y, o.x, 0)).normalized() * (w / 2)
            c = mix(c0, c1, i / (len(pts) - 1))
            g = a * (0.5 + 0.5 * i / (len(pts) - 1))
            cur = (V(p - s, c, g), V(p + s, c, g))
            if prev:
                bm.faces.new((prev[0], prev[1], cur[1], cur[0]))
            prev = cur

    def blob(c, s, squash, base, sub=2):
        g = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        q = [rnd.uniform(0, 6) for _ in range(3)]
        for v in g["verts"]:
            u = v.co.copy()
            n = 1 + 0.16 * sin(5 * u.x + q[0]) * cos(4 * u.y + q[1]) + 0.10 * sin(7 * u.z + q[2])
            v.co = c + Vector((u.x * s * n, u.y * s * n, u.z * s * squash * n))
            setc(v, mix(base, LEAF[2], u.z * 0.45 + 0.4))

    # --- cliff vine curtains (glow), never in front of a fall ---
    curtains = 0
    while curtains < ncurtains:
        th = rnd.uniform(0, 2 * pi)
        if near_fall(th, 0.12) > 0:
            continue
        curtains += 1
        L = min(Hc - 3, rnd.choice((8, 12, 16, 22, 30, 40)) * rnd.uniform(0.8, 1.2))
        n = max(3, int(L / 3))
        pts, outs, ws = [], [], []
        w0 = rnd.uniform(2.0, 5.0)
        for i in range(n + 1):
            d = L * i / n
            t = d / Hc
            r = cliffr(th, t, -1.5 - d) + 0.9
            pts.append(P(th + 0.012 * sin(0.9 * i + th * 40), r, -1.5 - d))
            outs.append(Vector((cos(th) / stretch, sin(th) * stretch, 0)).normalized())
            ws.append(w0 * (1 - 0.75 * (i / n) ** 2))
        ribbon(pts, outs, ws, mix(VINE, (0.70, 0.80, 0.24), rnd.random() * 0.6), (0.38, 0.62, 0.16), rnd.uniform(0.4, 1.0))

    # --- underside: stone spikes, roots (dark), hanging vines (glow) ---
    for _ in range(int(16 * Hd / 100)):
        th, t = rnd.uniform(0, 2 * pi), rnd.uniform(0.15, 0.65)
        p = under(th, t)
        L, rb = rnd.uniform(8, 30), rnd.uniform(2.5, 6.5)
        dx = Vector((rnd.uniform(-2, 2), rnd.uniform(-2, 2), 0))
        n = 5
        tube([p + Vector((0, 0, 3)) + dx * (i / n) ** 2 - Vector((0, 0, L * i / n)) for i in range(n + 1)],
             [rb * (1 - i / n) ** 1.2 + 0.05 for i in range(n + 1)], 7, UNDER, UNDER_D)
    for j in range(int(24 * Hd / 100)):
        th, t = rnd.uniform(0, 2 * pi), rnd.uniform(0.05, 0.8)
        p = under(th, t)
        L = rnd.uniform(10, 38)
        n = 7
        curl = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * rnd.uniform(2, 6)
        pts = [p + curl * sin(pi * i / n * 1.3) - Vector((0, 0, L * i / n)) for i in range(n + 1)]
        if j % 2:
            tube(pts, [0.9 * (1 - 0.8 * i / n) + 0.1 for i in range(n + 1)], 5, ROOT, mix(ROOT, UNDER_D, 0.5))
        else:
            out = Vector((cos(th), sin(th), 0))
            ribbon(pts, [out] * len(pts), [1.4 * (1 - 0.6 * i / n) for i in range(n + 1)], VINE, (0.38, 0.62, 0.16), rnd.uniform(0.5, 1.0))

    # --- trees: umbrella canopies on a pale trunk; bushes on the rim break the silhouette ---
    placed = []
    while len(placed) < ntrees:
        th, f = rnd.uniform(0, 2 * pi), rnd.uniform(0.08, 0.82) ** 0.7
        if near_fall(th, 3.5 / (50 * f)) > 0 or any((P(th, R(th) * f, 0) - q).length < 11 for q in placed):
            continue
        b = P(th, R(th) * f, capz(th, f))
        placed.append(Vector((b.x, b.y, 0)))
        H = rnd.uniform(9, 17) * (0.75 + 0.25 * (1 - f))
        lean = Vector((cos(th), sin(th), 0)) * rnd.uniform(0, 0.25) * f
        top = b + Vector((0, 0, H)) + lean * H
        n = 5
        tube([b - Vector((0, 0, 1)) + (top - b + Vector((0, 0, 1))) * (i / n) for i in range(n + 1)],
             [1.4 * (1 - 0.5 * i / n) + 0.4 * (i == 0) for i in range(n + 1)], 7, mix(BARK, STONE_D, 0.4), BARK)
        base = rnd.choice(LEAF)
        blob(top + Vector((0, 0, 1.5)), rnd.uniform(5.5, 7.5), 0.5, base)
        for k in range(3):
            a = rnd.uniform(0, 2 * pi)
            arm = Vector((cos(a), sin(a), 0)) * rnd.uniform(4, 7)
            tube([top - Vector((0, 0, 2)), top + arm * 0.6 + Vector((0, 0, 0.5)), top + arm + Vector((0, 0, 1.2))], [0.7, 0.45, 0.25], 5, BARK, BARK)
            blob(top + arm + Vector((0, 0, 2.2)), rnd.uniform(4, 6), 0.55, base)
    for _ in range(26):
        th = rnd.uniform(0, 2 * pi)
        if near_fall(th, 0.08) > 0:
            continue
        f = rnd.uniform(0.93, 1.01)
        blob(P(th, R(th) * f, capz(th, min(f, 1.0)) + 0.5), rnd.uniform(2.5, 4.8), 0.7, rnd.choice(LEAF[1:]) if rnd.random() < .5 else GRASS, sub=1)

    for fa in bm.faces:
        for l in fa.loops:
            l[col] = vcol[l.vert.index]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.color_attributes.active_color = me.color_attributes["Col"]
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    for i, fa in enumerate(falls):
        e = bpy.data.objects.new(f"fall_{i}", None)
        e.location = P(fa, R(fa) * 1.035 + 0.6, -1.2 - 1.0)
        e["w"] = round(rnd.uniform(7, 12) * (1.2 if Hd > 100 else 1), 2)
        e["drop"] = round(Hd + rnd.uniform(60, 140), 1)
        e.parent = ob
        bpy.context.collection.objects.link(e)
    zs = [v.co.z for v in me.vertices]
    xs = [v.co.x for v in me.vertices]
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    glow = sum(1 for d in me.color_attributes["Col"].data if d.color[3] > .05)
    print(f"{name}: across={max(xs) - min(xs):.0f} m top={max(zs):.1f} bottom={min(zs):.1f} tris={tris} trees={len(placed)} curtains={curtains} falls={len(falls)} glow_loops={glow}")
    return tris


mat = bpy.data.materials.new("skyisle")
vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Col"
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.9
mat.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])

total = isle("isle_a", 11, Hc=30, Hd=80, stretch=1.12, nfalls=3, ntrees=20, ncurtains=50)
total += isle("isle_b", 23, Hc=46, Hd=110, stretch=0.85, nfalls=2, ntrees=13, ncurtains=40)
total += isle("isle_c", 37, Hc=18, Hd=58, stretch=1.0, nfalls=1, ntrees=9, ncurtains=26)
print(f"skyisle kit triangles={total}")
bpy.ops.export_scene.gltf(filepath=f"{out_dir}/skyisle.glb", export_format="GLB", export_extras=True,
                          export_vertex_color="NAME", export_vertex_color_name="Col")

# --- optional render of the SHIPPED glb: the three islands in a row, by day or with the glow mask lit ---
if len(args) > 1:
    dark = len(args) > 2
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.import_scene.gltf(filepath=f"{out_dir}/skyisle.glb")
    isles = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in isles:
        o.location.x = {"isle_a": -130, "isle_b": 0, "isle_c": 115}[o.name]
    for o in bpy.context.scene.objects:
        if o.name.startswith("fall_"):
            print("marker", o.name, o.parent.name, tuple(round(x, 1) for x in o.matrix_world.translation), dict(o.items()))
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "VERTEX"
    sc.world = bpy.data.worlds.new("w")
    if dark:
        for o in isles:
            ca = o.data.color_attributes
            src = ca.active_color or ca[0]
            dk = ca.new("dk", "FLOAT_COLOR", "CORNER")
            for a, d in zip(src.data, dk.data):
                r_, g_, b_, al = a.color
                d.color = (0.3, 1.0, 0.75, 1) if al > .5 else (r_ * .15, g_ * .15, b_ * .25, 1)
            ca.active_color = dk
        sc.world.color = (0.02, 0.02, 0.08)
    else:
        sc.world.color = (0.6, 0.72, 0.92)
    sh.background_type = "WORLD"
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.location = (0, -420, -25)
    cam.rotation_euler = (1.5, 0, 0)
    cam.data.lens = 35
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1400, 800
    sc.render.filepath = args[1]
    bpy.ops.render.render(write_still=True)
