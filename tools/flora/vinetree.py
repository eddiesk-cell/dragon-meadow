"""Vine tree: pale buttressed trunk, broad canopy, dense curtains of hanging vine strands. Vertex colour alpha = glow mask (1 on vines).
  blender -b -P tools/flora/vinetree.py -- public/models/flora [render.png [dark]]
Origin = trunk base, +Z up in Blender (+Y up in glTF). One mesh, one material (base colour = vertex colour).
"""
import bpy, bmesh, sys, random
from math import pi, sin, cos, exp, sqrt
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = args[0]
rnd = random.Random(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
col = bm.loops.layers.color.new("Col")


def paint(face, rgb, a=0.0):
    for l in face.loops:
        l[col] = (*rgb, a)


def mix(c1, c2, t):
    return tuple(a + (b - a) * t for a, b in zip(c1, c2))


BARK = (0.62, 0.58, 0.50)
BARK_D = (0.40, 0.36, 0.32)
LEAF = [(0.20, 0.42, 0.14), (0.34, 0.55, 0.16), (0.50, 0.64, 0.18)]
VINE = (0.62, 0.78, 0.18)


def tube(pts, radii, sides, cfun):
    """Closed-ish tube along points; returns nothing, paints with cfun(i_ring)."""
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.cross(Vector((0, 0, 1)))
        if a.length < 1e-3:
            a = Vector((1, 0, 0))
        a.normalize()
        b = t.cross(a)
        r = radii[i]
        rings.append([bm.verts.new(p + (a * cos(2 * pi * k / sides) + b * sin(2 * pi * k / sides)) * r) for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
            paint(f, *cfun(i))
    return rings


# --- trunk: fluted, twisting, big root buttresses; domed top (no flat cap) ---
H = 32.0
forkz = 17.0
NR, NS, K = 26, 48, 7
phase = rnd.uniform(0, 6)
rings = []
for i in range(NR):
    h = forkz * (i / (NR - 1)) ** 1.4
    base = 3.4 - 1.2 * (h / forkz)
    ring = []
    for k in range(NS):
        th = 2 * pi * k / NS + 0.045 * h  # twist
        bt = max(0.0, cos(K * th + phase)) ** 3
        r = base * (1 + 2.3 * bt * exp(-h / 5.5)) + 0.8 * exp(-h / 1.5)
        r *= 1 + 0.05 * sin(11 * th + h * 0.25) + 0.04 * sin(3 * th + h * 0.4)
        ring.append(bm.verts.new((r * cos(th), r * sin(th), h)))
    rings.append(ring)
for sc_, dz in ((0.7, 1.2), (0.35, 2.2)):  # shoulder
    rings.append([bm.verts.new((v.co.x * sc_, v.co.y * sc_, forkz + dz)) for v in rings[NR - 1]])
for i in range(len(rings) - 1):
    for k in range(NS):
        f = bm.faces.new((rings[i][k], rings[i][(k + 1) % NS], rings[i + 1][(k + 1) % NS], rings[i + 1][k]))
        paint(f, mix(BARK_D, BARK, min(1, i / 8 + (k % 4) * 0.08)))
paint(bm.faces.new(list(reversed(rings[-1]))), BARK)

# --- limbs: 6 thick boughs spreading sideways; canopy rides ABOVE them so they show from below ---
clumps = []
tips = []
for n in range(6):
    az = 2 * pi * n / 6 + rnd.uniform(-0.25, 0.25)
    L = rnd.uniform(17, 23)
    rise = rnd.uniform(3, 6)
    pts, rad = [], []
    for i in range(11):
        t = i / 10
        wob = 0.12 * sin(5 * t + n)
        r = L * t
        pts.append(Vector((cos(az + wob) * r, sin(az + wob) * r, forkz + 1.0 + rise * sin(pi * 0.6 * t) - 3.0 * t * t)))
        rad.append(max(0.35, 2.6 * (1 - t) ** 0.8))
    tube(pts, rad, 10, lambda i: (mix(BARK, BARK_D, i / 10 * 0.8), 0))
    tips.append(pts)
    for i, jit in ((3, 0), (4, 0), (5, 0), (6, 1), (7, 1), (8, 2), (9, 2), (10, 3)):
        clumps.append((pts[i] + Vector((rnd.uniform(-2, 2), rnd.uniform(-2, 2), 5.0 + rnd.uniform(0, 1.5))), 5.6 - 0.2 * i + rnd.uniform(0, 1)))
for _ in range(8):  # crown fill over the fork
    a = rnd.uniform(0, 2 * pi)
    clumps.append((Vector((cos(a) * rnd.uniform(1, 8), sin(a) * rnd.uniform(1, 8), forkz + rnd.uniform(7, 10))), rnd.uniform(4.5, 6)))

# --- canopy: broad flat umbrella of subdivided noisy clumps, colour per vertex (no faceting) ---
for c, s in clumps:
    g = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    vs = g["verts"]
    ph = [rnd.uniform(0, 6) for _ in range(3)]
    for v in vs:
        u = v.co.copy()
        n = 1 + 0.16 * sin(5 * u.x + ph[0]) * cos(4 * u.y + ph[1]) + 0.10 * sin(7 * u.z + ph[2])
        v.co = c + Vector((u.x * s * 1.3 * n, u.y * s * 1.3 * n, u.z * s * 0.55 * n))
    base = rnd.choice(LEAF)
    for f in {f for v in vs for f in v.link_faces}:
        for l in f.loops:
            up = (l.vert.co.z - c.z) / (s * 0.5)
            l[col] = (*mix(base, LEAF[2], max(0, min(1, up * 0.7 + 0.3))), 0.0)

# --- vines: leafy curtains, 3-6 strands per anchor under the canopy edge, varied lengths, glow = 1 ---
anchors = []
for pts in tips:
    for i in (5, 6, 7, 8, 9, 10):
        anchors.append(pts[i])
strands = 0
for ai, A in enumerate(anchors):
    for _ in range(rnd.randint(2, 3)):
        j = strands
        strands += 1
        p0 = A + Vector((rnd.uniform(-2.2, 2.2), rnd.uniform(-2.2, 2.2), 1.0))
        L = rnd.choice((6, 9, 12, 15, 19)) + rnd.uniform(-1.5, 1.5)
        n = 10
        sway = Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0))
        pts = [p0 + sway * (i / n) ** 2 * 2 - Vector((0, 0, L * i / n)) for i in range(n + 1)]
        tube(pts, [0.12 * (1 - 0.4 * i / n) for i in range(n + 1)], 3, lambda i: (VINE, 1.0))
        for i in range(1, n + 1):
            for sgn in (-1, 1):
                for q in (0, 1):
                    p = pts[i] - Vector((0, 0, 0.35 * q))
                    ang = i * 2.1 + j + q * 1.57
                    side = Vector((cos(ang) * sgn, sin(ang) * sgn, 0)) * 0.95
                    tip = p + side - Vector((0, 0, 0.5))
                    w = Vector((-side.y, side.x, 0)).normalized() * 0.34
                    vs = [bm.verts.new(x) for x in (p, p + side * 0.5 + w - Vector((0, 0, 0.1)), tip, p + side * 0.5 - w - Vector((0, 0, 0.1)))]
                    paint(bm.faces.new(vs), mix(VINE, (0.45, 0.72, 0.15), ((i + q) % 3) / 2), 1.0)

me = bpy.data.meshes.new("vinetree")
bm.to_mesh(me)
bm.free()
me.color_attributes.active_color = me.color_attributes["Col"]
ob = bpy.data.objects.new("vinetree", me)
bpy.context.collection.objects.link(ob)
for p in me.polygons:
    p.use_smooth = True

m = bpy.data.materials.new("vinetree")
m.use_nodes = True
b = m.node_tree.nodes["Principled BSDF"]
b.inputs["Roughness"].default_value = 0.85
vc = m.node_tree.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Col"
m.node_tree.links.new(vc.outputs["Color"], b.inputs["Base Color"])
me.materials.append(m)

bpy.context.view_layer.update()
tris = sum(len(p.vertices) - 2 for p in me.polygons)
zs = [v.co.z for v in me.vertices]
print(f"vinetree height={max(zs):.1f} m triangles={tris} vines={strands} glow_verts={sum(1 for l in me.color_attributes['Col'].data if l.color[3] > .5)}")

bpy.ops.export_scene.gltf(filepath=f"{out_dir}/vinetree.glb", export_format="GLB", export_vertex_color="NAME", export_vertex_color_name="Col")

# --- optional render of the SHIPPED glb beside the 1.8 m hero at true scale, outside the flare ---
if len(args) > 1:
    dark = len(args) > 2
    bpy.data.objects.remove(ob)
    bpy.ops.import_scene.gltf(filepath=f"{out_dir}/vinetree.glb")
    tree = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bpy.ops.import_scene.gltf(filepath=f"{out_dir}/../hero.glb")
    for o in bpy.context.scene.objects:
        if o not in tree and o.parent is None:
            o.location.x += 2.5
            o.location.y -= 13
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "FLAT"
    sh.color_type = "VERTEX"
    sc.world = bpy.data.worlds.new("w")
    if dark:  # emission driven by the glb's own COLOR_0 alpha: a lost mask lights everything
        for o in tree:
            ca = o.data.color_attributes
            print("glb color attrs", [(c.name, c.data_type, c.domain) for c in ca])
            src = ca.active_color or ca[0]
            dk = ca.new("dk", "FLOAT_COLOR", "CORNER")
            for a, d in zip(src.data, dk.data):
                r_, g_, b_, al = a.color
                d.color = (0.62, 1.0, 0.45, 1) if al > .5 else (r_ * .12, g_ * .12, b_ * .2, 1)
            ca.active_color = dk
        sc.world.color = (0.03, 0.03, 0.12)
    else:
        sc.world.color = (0.7, 0.82, 0.95)
    sh.background_type = "WORLD"
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.location = (0, -38, 1.7)
    cam.rotation_euler = (1.86, 0, 0)
    cam.data.lens = 22
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1280, 900
    sc.render.filepath = args[1]
    bpy.ops.render.render(write_still=True)
