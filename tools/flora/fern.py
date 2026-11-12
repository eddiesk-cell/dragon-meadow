"""Giant spiral fern, built from code (the foreground ferns of refs/world/mix-day.png, the violet ferns of night.png).
  blender -b -P tools/flora/fern.py -- public/models/flora
Writes fern.glb: origin = base on the ground, +Y up in glTF, ~1.5 m tall. Three tall croziers rise and roll into fat
leafy spirals (clothoid curl, ~1.6 turns, ~0.45 m across; their leaflets fold in to fill the roll) that hang outside
the clump; six open feathery fronds (32 leaflet pairs each) spread below. Vertex colour RGB = leaf colour; alpha = glow mask, linear 0..1 (rachis 1, coil leaflets
0.85, other leaflet midribs 0.55, leaf edges 0). flora.js should light it as alpha^2 so a midrib reads as a thin vein, not a lit blade.
"""
import bpy, bmesh, sys, os, random, json, struct
from math import pi, sin, cos, radians
from mathutils import Vector

out_dir = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(7)
bm = bmesh.new()
col = bm.loops.layers.color.new("Col")
UP = Vector((0, 1, 0))
DEEP, LIGHT, STEM, COIL = (0.07, 0.30, 0.05), (0.40, 0.64, 0.07), (0.20, 0.46, 0.06), (0.36, 0.60, 0.08)


def add(verts, faces):
    """verts: [(pos Y-up, rgb, glow)], faces: index tuples. Blender is Z-up."""
    vs = [bm.verts.new((p.x, -p.z, p.y)) for p, _, _ in verts]
    for fi in faces:
        f = bm.faces.new([vs[i] for i in fi])
        for loop, i in zip(f.loops, fi):
            loop[col] = (*verts[i][1], verts[i][2])


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def rachis(az, L, tilt, kappa):
    """Centre line in the vertical plane at azimuth az, curvature kappa(s) bending it outward. Returns samples
    (pos, tangent, inward normal, s, k); segments are short where it curls tight (<= 0.3 rad each)."""
    rd = Vector((cos(az), 0, sin(az)))
    out, p, phi, s, acc, h = [], Vector(), tilt, 0.0, 9.0, 0.002
    while s <= L:
        k = kappa(s)
        if acc >= min(0.12, 0.25 / k) or s + h > L:
            out.append((p.copy(), UP * cos(phi) + rd * sin(phi), UP * -sin(phi) + rd * cos(phi), s, k)); acc = 0.0
        phi += k * h
        p += (UP * cos(phi) + rd * sin(phi)) * h
        s += h; acc += h
    return out


def leaflet(p, d, w_axis, ln, wid, c, glow):
    """Diamond leaflet, 2 triangles: base and tip carry the glow, the two side corners none, so under alpha^2 the lit
    part is a thin midrib line between them."""
    q = p + d * 0.42 * ln
    add([(p, c, glow), (q - w_axis * wid, c, 0), (p + d * ln, c, glow * 0.8), (q + w_axis * wid, c, 0)], [(0, 1, 2), (0, 2, 3)])


def along(pts, s):
    """(pos, tangent, inward normal) at arc length s on a rachis polyline."""
    i = max(0, min(len(pts) - 2, max(j for j, q in enumerate(pts) if q[3] <= s)))
    f = (s - pts[i][3]) / max(1e-6, pts[i + 1][3] - pts[i][3])
    return pts[i][0].lerp(pts[i + 1][0], f), pts[i][1].lerp(pts[i + 1][1], f).normalized(), pts[i][2].lerp(pts[i + 1][2], f).normalized()


def tube(pts, sd, radius, colour):
    """3-sided glowing rachis tube."""
    rows, faces = [], []
    for i, (p, t, n, s, k) in enumerate(pts):
        r, c = radius(s), colour(s)
        rows += [(p + (n * cos(a) + sd * sin(a)) * r, c, 1.0) for a in (0, 2 * pi / 3, 4 * pi / 3)]
        if i:
            b = 3 * (i - 1)
            faces += [(b + j, b + (j + 1) % 3, b + 3 + (j + 1) % 3, b + 3 + j) for j in range(3)]
    add(rows, faces)


def crozier(az, L_stem, tilt, r0, r1, turns):
    sd = Vector((-sin(az), 0, cos(az)))
    k_s, k0, k1 = 0.35 / L_stem, 1 / r0, 1 / r1
    LC = 2 * (2 * pi * turns) / (k0 + k1)  # linear curvature k0 -> k1 winds `turns` turns
    ramp = 0.18
    kap = lambda s: k_s if s < L_stem else (k_s + (k0 - k_s) * min(1, (s - L_stem) / ramp) if s < L_stem + ramp else k0 + (k1 - k0) * (s - L_stem - ramp) / LC)
    pts = rachis(az, L_stem + ramp + LC, tilt, kap)
    tot, c0 = pts[-1][3], L_stem + ramp
    tube(pts, sd, lambda s: 0.026 - 0.006 * min(1, s / tot), lambda s: mix(STEM, COIL, min(1, s / tot * 1.4)))
    s = 0.22 * L_stem
    while s < tot - 0.02:  # pinnate leaflets the whole way: up the stem, then on into the coil, folding inward
        p, t, n = along(pts, s)
        u = min(1, (s - 0.22 * L_stem) / (c0 - 0.22 * L_stem))  # 0..1 up the stem
        v = max(0, (s - c0) / (tot - c0))  # 0..1 round the coil
        if v == 0:
            ln, glow, fold, step = 0.17 * (1 - 0.35 * u) * min(1, 0.5 + u * 2.5), 0.55, 0.0, 0.045
        else:  # inside the roll: short, dense, folded toward the centre so the coil is a thick leafy band
            ln, glow, fold, step = 0.11 * (1 - 0.6 * v) + 0.025, 0.85, 0.85, 0.028
        for sg in (-1, 1):
            d = (sd * sg * (0.8 - 0.45 * fold) + n * fold * 0.9 + t * (0.55 - 0.25 * fold) - UP * 0.12 * (1 - fold)).normalized()
            leaflet(p, d, (t - d * t.dot(d)).normalized(), ln, ln * 0.17, mix(DEEP, LIGHT, 0.35 + 0.45 * max(u, v)) if v == 0 else COIL, glow)
        if v > 0:  # and a short tooth on the outside of the curl, so the roll's rim is leafy too
            d = (-n + sd * (0.35 if int(s / step) % 2 else -0.35) - t * 0.4).normalized()
            leaflet(p, d, (t - d * t.dot(d)).normalized(), ln * 0.75, ln * 0.2, LIGHT, 0.75)
        s += step


def open_frond(az, L, tilt):
    sd = Vector((-sin(az), 0, cos(az)))
    pts = rachis(az, L, tilt, lambda s: 1.15 / L + (3.5 * ((s / L - 0.8) / 0.2) if s > 0.8 * L else 0))
    rows, faces = [], []
    for i, (p, t, n, s, k) in enumerate(pts):  # flat glowing midrib ribbon
        w = 0.010 * (1 - 0.6 * s / L)
        rows += [(p - sd * w, STEM, 1.0), (p + sd * w, STEM, 1.0)]
        if i:
            faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    add(rows, faces)
    J = 32  # many short narrow leaflets: feathery, not a cycad's saw edge
    for j in range(J):
        u = 0.08 + 0.9 * j / (J - 1)
        p, t, n = along(pts, u * L)
        ln = 0.16 * sin(pi * (0.12 + 0.88 * u)) ** 0.7 + 0.025
        for sg in (-1, 1):
            d = (sd * sg * 0.85 + t * 0.5 - UP * (0.1 + 0.35 * u)).normalized()  # droops more toward the tip
            leaflet(p, d, (t - d * t.dot(d)).normalized(), ln, ln * 0.15, mix(DEEP, LIGHT, 0.2 + 0.6 * u), 0.55)


for i, az in enumerate((15, 135, 250)):  # az deg, then stem length, lean, coil start radius, tip radius, turns
    crozier(radians(az + random.uniform(-10, 10)), (1.15, 1.0, 1.25)[i], (0.16, 0.1, 0.2)[i], (0.45, 0.4, 0.48)[i], 0.08, 1.6)
for i, az in enumerate((60, 110, 190, 230, 305, 350)):
    open_frond(radians(az + random.uniform(-12, 12)), (1.25, 1.0, 1.1, 0.95, 1.35, 1.0)[i], (0.55, 0.75, 0.65, 0.8, 0.5, 0.7)[i])

me = bpy.data.meshes.new("fern")
bm.to_mesh(me)
for p in me.polygons:
    p.use_smooth = True
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
nt.links.new(a.outputs["Alpha"], b.inputs["Alpha"])  # makes the exporter write COLOR_0 as RGBA (alphaMode removed below)
me.materials.append(m)
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
zs, xs, ys = [v.co.z for v in me.vertices], [v.co.x for v in me.vertices], [v.co.y for v in me.vertices]
print(f"FERN height={max(zs):.2f} m width={max(xs)-min(xs):.2f} depth={max(ys)-min(ys):.2f} triangles={tris}")
assert tris <= 4000 and 1.0 <= max(zs) <= 2.0, "fern budget: <= 4k triangles, 1-2 m tall"
os.makedirs(out_dir, exist_ok=True)
path = os.path.join(out_dir, "fern.glb")
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_vertex_color="ACTIVE")

# The alpha link only exists to get RGBA exported; the glow mask must not make the leaf transparent.
d = open(path, "rb").read()
n = struct.unpack("<I", d[12:16])[0]
j = json.loads(d[20:20 + n])
for mt in j["materials"]:
    mt.pop("alphaMode", None)
assert j["accessors"][j["meshes"][0]["primitives"][0]["attributes"]["COLOR_0"]]["type"] == "VEC4", "glow mask lost"
js = json.dumps(j, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
rest = d[20 + n:]
open(path, "wb").write(d[:8] + struct.pack("<I", 12 + 8 + len(js) + len(rest)) + struct.pack("<I", len(js)) + b"JSON" + js + rest)
