"""Giant spiral fern, built from code (matches the ferns in refs/world/mix-day.png and night.png).
  blender -b -P tools/flora/fern.py -- public/models/flora
Writes fern.glb: origin = base on the ground, +Y up in glTF, ~1.6 m tall. Vertex colour RGB = leaf colour,
alpha = glow mask (1 on veins, 0 on the blade) so one material drives day and night.
"""
import bpy, bmesh, sys, os, random
from math import pi, sin, cos, radians
from mathutils import Vector

out_dir = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(7)

bm = bmesh.new()
col = bm.loops.layers.color.new("Col")


# loop colours are set per face below; keep (vertex, rgb, glow) tuples and paint after face creation


def quad_strip(rows):
    """rows: list of [(pos, rgb, glow), ...] same width each; builds faces between consecutive rows."""
    vs = [[bm.verts.new((p[0], -p[2], p[1])) for p, _, _ in r] for r in rows]  # my Y-up -> Blender Z-up
    cs = [[(c, g) for _, c, g in r] for r in rows]
    for i in range(len(rows) - 1):
        for j in range(len(rows[0]) - 1):
            idx = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
            f = bm.faces.new([vs[a][b] for a, b in idx])
            for loop, (a, b) in zip(f.loops, idx):
                c, g = cs[a][b]
                loop[col] = (*c, g)


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))

DEEP = (0.09, 0.36, 0.07)   # linear-ish colours: jade-yellow green, lighter toward the tips
LIGHT = (0.42, 0.66, 0.07)
VEIN = (0.20, 0.50, 0.08)   # vein tint by day; the violet glow colour comes from the material at night

N = 26  # rachis samples


def clamp01(x):
    return max(0.0, min(1.0, x))


def frond(az, L, k_arch, k_curl, tilt):
    """One frond: rachis in a vertical plane at azimuth az; rises upright, arches a little, then rolls into a fat spiral."""
    r_dir = Vector((cos(az), 0, sin(az)))
    pts, tans = [], []
    p = Vector((0, 0, 0))
    ds = L / (N - 1)
    for i in range(N):
        s = i / (N - 1)
        phi = tilt + k_arch * s + k_curl * clamp01((s - 0.5) / 0.5) ** 2   # angle from vertical, toward r_dir
        t = Vector((0, 1, 0)) * cos(phi) + r_dir * sin(phi)
        pts.append(p.copy()); tans.append(t)
        p = p + t * ds
    side = Vector((-sin(az), 0, cos(az)))
    rows = []  # glowing midrib, 2 verts wide
    for i, (p, t) in enumerate(zip(pts, tans)):
        w = 0.012 * (1 - i / N) + 0.004
        rows.append([(p - side * w, DEEP, 1), (p + side * w, DEEP, 1)])
    quad_strip(rows)
    M = 24
    for m in range(M):
        s = 0.05 + 0.92 * m / (M - 1)
        i = min(int(s * (N - 1)), N - 2); f = s * (N - 1) - i
        p = pts[i].lerp(pts[i + 1], f); t = tans[i].lerp(tans[i + 1], f).normalized()
        # full size mid-frond, only gently smaller toward the coil so the roll reads thick
        size = 0.46 * (1 - 0.68 * clamp01((s - 0.4) / 0.55)) * (0.55 + 0.45 * clamp01(s / 0.2))
        for sg in (-1, 1):
            d = (side * sg * 0.9 + t * 0.55 + Vector((0, -0.15, 0)) + r_dir * 0.1).normalized()
            w_axis = (t - d * t.dot(d)).normalized()
            wid = size * 0.24
            blade, vein = [], []
            for u in range(3):
                x = u / 2
                width = wid * sin(pi * (0.12 + 0.88 * x) ** 0.9) * (1 - 0.3 * x) + 0.004
                c = p + d * x * size + Vector((0, 0.03 * size * sin(pi * x), 0))
                shade = lerp(DEEP, LIGHT, 0.5 * s + 0.5 * x)
                blade.append([(c - w_axis * width, shade, 0), (c + w_axis * width, shade, 0)])
                vw = 0.13 * width  # thin vein on top of the midline carries the glow
                cv = c + Vector((0, 0.006 + 0.012 * size, 0))
                vein.append([(cv - w_axis * vw, VEIN, 1), (cv + w_axis * vw, VEIN, 1)])
            quad_strip(blade)
            quad_strip(vein)


# 7 upright fronds, each rolling into a fat spiral at the top
specs = [  # azimuth deg, length, arch, curl, initial tilt
    (0, 2.9, 0.50, 7.0, 0.14), (50, 2.5, 0.45, 6.8, 0.30), (100, 2.8, 0.55, 7.2, 0.20), (155, 2.3, 0.45, 6.8, 0.34),
    (205, 2.7, 0.50, 7.0, 0.24), (255, 2.4, 0.45, 6.8, 0.32), (310, 2.6, 0.50, 7.0, 0.27),
]
for a, L, ka, kc, t0 in specs:
    frond(radians(a + random.uniform(-8, 8)), L, ka, kc, t0)

me = bpy.data.meshes.new("fern")
bm.to_mesh(me)
tris = sum(len(p.vertices) - 2 for p in me.polygons)
ob = bpy.data.objects.new("fern", me)
bpy.context.collection.objects.link(ob)

m = bpy.data.materials.new("fern")
m.use_nodes = True
m.use_backface_culling = False
nt = m.node_tree
b = nt.nodes["Principled BSDF"]
b.inputs["Roughness"].default_value = 0.6
a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "Col"
nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
nt.links.new(a.outputs["Alpha"], b.inputs["Alpha"])  # makes the exporter write COLOR_0 as RGBA
me.materials.append(m)
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
ys = [v.co.z for v in me.vertices]  # Blender Z = height
xs=[v.co.x for v in me.vertices]; zs=[v.co.y for v in me.vertices]
print(f"FERN height={max(ys):.2f} m width={max(xs)-min(xs):.2f} depth={max(zs)-min(zs):.2f} triangles={tris}")
os.makedirs(out_dir, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "fern.glb"), export_format="GLB", export_yup=True, export_vertex_color="ACTIVE")

# The alpha link above only exists to get RGBA exported; the glow mask must not make the leaf transparent.
import json, struct
path = os.path.join(out_dir, "fern.glb")
d = open(path, "rb").read()
n = struct.unpack("<I", d[12:16])[0]
j = json.loads(d[20:20 + n])
for mt in j["materials"]:
    mt.pop("alphaMode", None)
js = json.dumps(j, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
rest = d[20 + n:]
open(path, "wb").write(d[:8] + struct.pack("<I", 12 + 8 + len(js) + len(rest)) + struct.pack("<I", len(js)) + b"JSON" + js + rest)
