"""Vine tree: pale buttressed trunk, broad canopy, 36 hanging vine strands. Vertex colour alpha = glow mask (1 on vines).
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


# --- trunk: lofted rings, buttress flare at the base ---
H = 32.0
NR, NS = 18, 24
K = 6  # buttress count
phase = rnd.uniform(0, 6)
rings = []
for i in range(NR):
    h = H * 0.55 * (i / (NR - 1)) ** 1.25  # trunk proper ends at the limb fork
    base = 3.0 - 1.0 * (h / (H * 0.55))
    ring = []
    for k in range(NS):
        th = 2 * pi * k / NS
        bt = max(0.0, cos(K * th + phase)) ** 2
        r = base * (1 + 1.6 * bt * exp(-h / 4.5)) + 0.6 * exp(-h / 1.5)
        r *= 1 + 0.06 * sin(3 * th + h * 0.4)
        z = h - 1.2 * bt * exp(-h / 2.0) * 0  # keep base flat on the ground
        ring.append(bm.verts.new((r * cos(th), r * sin(th), z)))
    rings.append(ring)
for i in range(NR - 1):
    for k in range(NS):
        f = bm.faces.new((rings[i][k], rings[i][(k + 1) % NS], rings[i + 1][(k + 1) % NS], rings[i + 1][k]))
        paint(f, mix(BARK_D, BARK, min(1, i / 6 + (k % 2) * 0.1)))
top = bm.faces.new(list(reversed(rings[-1])))
paint(top, BARK)
forkz = H * 0.55

# --- limbs: 6 curving boughs; canopy clumps ride on them ---
clumps = []
tips = []
for n in range(6):
    az = 2 * pi * n / 6 + rnd.uniform(-0.3, 0.3)
    L = rnd.uniform(15, 20)
    rise = rnd.uniform(3, 8)
    pts, rad = [], []
    for i in range(9):
        t = i / 8
        r = 0.4 * 0 + L * t
        pts.append(Vector((cos(az) * r * 0.9, sin(az) * r * 0.9, forkz - 1 + rise * sin(pi * 0.55 * t) + 2.0 * t * t * (1 if n % 2 else -0.3))))
        rad.append(max(0.3, 2.0 * (1 - t) ** 0.9))
    tube(pts, rad, 8, lambda i: (mix(BARK, BARK_D, i / 8), 0))
    tips.append(pts)
    for i in (3, 4, 5, 6, 7, 8):
        clumps.append((pts[i] + Vector((0, 0, 2.0)), 5.5 - 0.2 * i + rnd.uniform(0, 1.5)))
for _ in range(14):  # crown fill
    a = rnd.uniform(0, 2 * pi)
    clumps.append((Vector((cos(a) * rnd.uniform(0, 7), sin(a) * rnd.uniform(0, 7), forkz + rnd.uniform(3, 9))), rnd.uniform(5, 7.5)))

# --- canopy: flattened noisy icospheres ---
for c, s in clumps:
    g = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    vs = g["verts"]
    base = rnd.choice(LEAF)
    for v in vs:
        n = 1 + rnd.uniform(-0.22, 0.22)
        v.co = c + Vector((v.co.x * s * 1.25 * n, v.co.y * s * 1.25 * n, v.co.z * s * 0.75 * n))
    for f in {f for v in vs for f in v.link_faces}:
        up = f.calc_center_median().z - c.z
        paint(f, mix(base, LEAF[2], max(0, min(1, up / (s * 0.5)))))

# --- vines: 36 strands hanging from limbs/canopy edge, tube + paired leaves, glow = 1 ---
anchors = []
for pts in tips:
    for i in (4, 5, 6, 7, 8):
        anchors.append(pts[i])
for j in range(48):
    p0 = anchors[j % len(anchors)] + Vector((rnd.uniform(-2.5, 2.5), rnd.uniform(-2.5, 2.5), -0.8))
    L = rnd.uniform(8, 20)
    n = 9
    sway = Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), 0))
    pts = [p0 + sway * (i / n) ** 2 * 2 - Vector((0, 0, L * i / n)) for i in range(n + 1)]
    tube(pts, [0.11 * (1 - 0.4 * i / n) for i in range(n + 1)], 3, lambda i: (VINE, 1.0))
    for i in range(1, n + 1):
        for sgn in (-1, 1):
            p = pts[i]
            side = Vector((cos(i * 2.1 + j) * sgn, sin(i * 2.1 + j) * sgn, 0)) * 0.8
            tip = p + side - Vector((0, 0, 0.35))
            w = Vector((-side.y, side.x, 0)).normalized() * 0.22
            vs = [bm.verts.new(x) for x in (p, p + side * 0.5 + w - Vector((0, 0, 0.1)), tip, p + side * 0.5 - w - Vector((0, 0, 0.1)))]
            paint(bm.faces.new(vs), mix(VINE, (0.45, 0.72, 0.15), (i % 3) / 2), 1.0)

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
print(f"vinetree height={max(zs):.1f} m triangles={tris} vines=48 glow_verts={sum(1 for l in me.color_attributes['Col'].data if l.color[3] > .5)}")

bpy.ops.export_scene.gltf(filepath=f"{out_dir}/vinetree.glb", export_format="GLB", export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True)

# --- optional render beside the 1.8 m hero at true scale ---
if len(args) > 1:
    dark = len(args) > 2
    hero = f"{out_dir}/../hero.glb"
    bpy.ops.import_scene.gltf(filepath=hero)
    for o in bpy.context.scene.objects:
        if o is not ob:
            o.location.x += 4.5
            o.location.y -= 3
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "FLAT"
    sh.color_type = "VERTEX"
    if dark:  # glow mask lit: dark trunk/canopy, vines bright
        for v in me.color_attributes["Col"].data:
            r, g, bb, a = v.color
            v.color = (0.62, 1.0, 0.45, 1) if a > .5 else (r * .12, g * .12, bb * .2, 1)
        sc.world = bpy.data.worlds.new("w")
        sc.world.color = (0.03, 0.03, 0.12)
    else:
        sc.world = bpy.data.worlds.new("w")
        sc.world.color = (0.7, 0.82, 0.95)
    sh.background_type = "WORLD"
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.location = (0, -70, 16)
    cam.rotation_euler = (1.43, 0, 0)
    cam.data.lens = 28
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 1280, 900
    sc.render.filepath = args[1]
    bpy.ops.render.render(write_still=True)
