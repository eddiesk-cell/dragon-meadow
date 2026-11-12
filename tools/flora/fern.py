"""Giant spiral fern, built from code (the foreground ferns of refs/world/mix-day.png, the violet ferns of night.png).
  blender -b -P tools/flora/fern.py -- public/models/flora
Writes fern.glb: origin = base on the ground, +Y up in glTF, ~1.7 m tall. Three tall croziers rise and roll into fat
leafy spirals (clothoid curl, ~2 turns, ~0.6 m across with the fringe) that hang outside the clump; four open
feathery fronds spread below. Vertex colour RGB = leaf colour; alpha = glow mask, linear 0..1 (rachis, coil fringe
and leaflet midribs carry it). flora.js should light it as alpha^2 so a midrib reads as a thin vein, not a lit blade.
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
        if acc >= min(0.05, 0.3 / k) or s + h > L:
            out.append((p.copy(), UP * cos(phi) + rd * sin(phi), UP * -sin(phi) + rd * cos(phi), s, k)); acc = 0.0
        phi += k * h
        p += (UP * cos(phi) + rd * sin(phi)) * h
        s += h; acc += h
    return out


def leaflet(p, d, w_axis, nrm, ln, wid, c, glow):
    """Folded leaflet: base, widest pair at 40%, midrib vertex raised into a shallow V, tip. 4 triangles."""
    m = p + d * 0.4 * ln
    add([(p, c, glow), (m - w_axis * wid, c, 0), (m + nrm * wid * 0.3, c, glow), (m + w_axis * wid, c, 0), (p + d * ln, c, glow * 0.6)],
        [(0, 1, 2), (0, 2, 3), (1, 4, 2), (2, 4, 3)])


def crozier(az, L_stem, tilt, r0, r1, turns):
    sd = Vector((-sin(az), 0, cos(az)))
    k_s, k0, k1 = 0.35 / L_stem, 1 / r0, 1 / r1
    LC = 2 * (2 * pi * turns) / (k0 + k1)  # linear curvature k0 -> k1 winds `turns` turns
    ramp = 0.18
    kap = lambda s: k_s if s < L_stem else (k_s + (k0 - k_s) * min(1, (s - L_stem) / ramp) if s < L_stem + ramp else k0 + (k1 - k0) * (s - L_stem - ramp) / LC)
    pts = rachis(az, L_stem + ramp + LC, tilt, kap)
    tot = pts[-1][3]
    rows, faces = [], []
    for i, (p, t, n, s, k) in enumerate(pts):  # 4-sided tube, glowing
        r = 0.024 - 0.008 * min(1, s / L_stem) - 0.010 * max(0, (s - L_stem) / (tot - L_stem))
        c = mix(STEM, COIL, min(1, s / tot * 1.4))
        rows += [(p + (n * cos(a) + sd * sin(a)) * r, c, 1.0) for a in (pi / 4, 3 * pi / 4, 5 * pi / 4, 7 * pi / 4)]
        if i:
            b = 4 * (i - 1)
            faces += [(b + j, b + (j + 1) % 4, b + 4 + (j + 1) % 4, b + 4 + j) for j in range(4)]
    add(rows, faces)
    for ii, (p, t, n, s, k) in enumerate(pts):
        if 0.25 * L_stem < s < L_stem + ramp:  # pinnate leaflets up the stem, shrinking toward the coil
            u = (s - 0.25 * L_stem) / (0.75 * L_stem + ramp)
            ln = 0.2 * (1 - 0.5 * u) * min(1, 0.45 + u * 3)
            for sg in (-1, 1):
                d = (sd * sg * 0.8 + t * 0.6 - n * 0.15).normalized()
                leaflet(p, d, (t - d * t.dot(d)).normalized(), n, ln, ln * 0.24, mix(DEEP, LIGHT, 0.4 + 0.4 * u), 0.35)
        elif s >= L_stem + ramp:  # the fringe that makes the roll fat: 3 short teeth on the outside of the curl
            ln = max(0.04, min(0.13, 0.5 / k)) * (1.15 if ii % 2 else 0.85)
            for b in (-0.6, 0.6):
                d = (-n * cos(b) + sd * sin(b) - t * 0.45).normalized()  # leaning back along the curl: overlapping scales
                w = (t - d * t.dot(d)).normalized() * ln * 0.38
                q = p + d * ln * 0.45
                add([(p, COIL, 0.9), (q - w, COIL, 0.2), (p + d * ln, LIGHT, 0.5), (q + w, COIL, 0.2)], [(0, 1, 2), (0, 2, 3)])


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
    for j in range(18):
        u = 0.1 + 0.87 * j / 17
        s = u * L
        i = max(i for i, q in enumerate(pts) if q[3] <= s)
        p, t, n = pts[i][0], pts[i][1], pts[i][2]
        ln = 0.27 * sin(pi * (0.12 + 0.88 * u)) ** 0.8 + 0.03
        for sg in (-1, 1):
            d = (sd * sg * 0.8 + t * 0.55 - n * 0.1).normalized()
            leaflet(p, d, (t - d * t.dot(d)).normalized(), n, ln, ln * 0.24, mix(DEEP, LIGHT, 0.2 + 0.6 * u), 0.35)


for i, az in enumerate((15, 135, 250)):  # az deg, then stem length, lean, coil start radius, tip radius, turns
    crozier(radians(az + random.uniform(-10, 10)), (1.3, 1.15, 1.4)[i], (0.16, 0.1, 0.2)[i], (0.32, 0.28, 0.34)[i], 0.05, 1.8)
for i, az in enumerate((75, 190, 305, 350)):
    open_frond(radians(az + random.uniform(-12, 12)), (1.25, 1.1, 1.35, 1.0)[i], (0.55, 0.65, 0.5, 0.7)[i])

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
