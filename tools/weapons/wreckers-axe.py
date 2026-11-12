"""Wrecker's Axe (WEAPONS.md #5): a one-handed bearded boarding axe plus its leather frog.
  blender -b -P tools/weapons/wreckers-axe.py -- public/models/weapons
Writes wreckers-axe.glb with nodes `weapon` (origin = grip centre, head up +Y, edge toward +X) and
`carrier` (origin = top anchor, body down -Y). Seat = weapon origin at carrier (0,-0.43,0), head up.
Also renders shots/weapon-wreckers-axe.png beside public/models/sword.glb when a 2nd arg gives that dir.
"""
import bpy, bmesh, sys, os
from math import pi, sin, cos

out_dir = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
SEAT_Y = -0.43


def hexc(h):  # sRGB hex -> linear rgb
    return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (1, 3, 5))


def mat(name, h, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*hexc(h), 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    return m

SLATE = mat("slate", "#3A3F45", 0.7, 0.5)
EDGE = mat("edge", "#C9CED4", 1.0, 0.3)
ASH = mat("ash", "#6B4A2B", 0.0, 0.7)
TAR = mat("tar", "#1A1714", 0.0, 0.85)
BRASS = mat("brass", "#B08A45", 1.0, 0.35)
LEATHER = mat("leather", "#4A2E1C", 0.0, 0.7)


def mk(name, bm, material):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    bpy.context.collection.objects.link(ob)
    return ob


def loft(name, sections, material, cap=True):
    """sections: list of rings, each a list of (x, y, z); same point count."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in s] for s in sections]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    return mk(name, bm, material)


def S(y):  # haft centre line: S-curve, zero at the grip centre, +-0.012 m
    return 0.012 * sin(2 * pi * y / 0.8)


def oval(y, rx, rz, k=10, cx=None):
    cx = S(y) if cx is None else cx
    return [(cx + rx * cos(2 * pi * i / k), y, rz * sin(2 * pi * i / k)) for i in range(k)]


def tube(name, y0, y1, rin, rout, cx, material, k=14):
    """hollow band: outer wall, inner wall, annular end faces."""
    bm = bmesh.new()
    ring = lambda r, y: [bm.verts.new((cx + r * cos(2 * pi * i / k), y, r * sin(2 * pi * i / k))) for i in range(k)]
    oa, ob_, ia, ib = ring(rout, y0), ring(rout, y1), ring(rin, y0), ring(rin, y1)
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((oa[i], oa[j], ob_[j], ob_[i]))
        bm.faces.new((ia[i], ib[i], ib[j], ia[j]))
        bm.faces.new((oa[i], ia[i], ia[j], oa[j]))
        bm.faces.new((ob_[i], ob_[j], ib[j], ib[i]))
    return mk(name, bm, material)


def sphere(name, r, loc, material, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=12, ring_count=8)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.data.materials.append(material)
    return o


# ---- weapon (built Y-up in these coords; see export())
W = []
# haft: oval loft 0.030 x 0.022 half-widths, butt -0.18 to eye top +0.62
ys = [-0.18 + 0.05 * i for i in range(17)] + [0.62]
W.append(loft("haft", [oval(y, 0.030 if y > -0.17 else 0.024, 0.022 if y > -0.17 else 0.018) for y in ys], ASH))
W.append(sphere("butt", 0.022, (S(-0.18), -0.18, 0), BRASS))
# tar-twine wrap -0.10..+0.10, ridged
tw = [oval(-0.10 + 0.02 * i, 0.034 if i % 2 else 0.031, 0.026 if i % 2 else 0.023) for i in range(11)]
W.append(loft("twine", tw, TAR))
# brass ring at +0.40 (a 0.02 m tall band; the frog hides it when seated)
W.append(loft("ring", [oval(0.39, 0.036, 0.028, 12), oval(0.41, 0.036, 0.028, 12)], BRASS))
# head eye (wraps haft 0.48..0.62)
W.append(loft("eye", [oval(y, 0.038, 0.030, 12) for y in (0.48, 0.50, 0.60, 0.62)], SLATE))


def head_ring(xu, yu, xl, yl, t):
    return [(xu, yu, -t), (xu, yu, t), (xl, yl, t), (xl, yl, -t)]

# slate body poll -> inset, then bright ground edge band (outer 0.02 m), thickness 0.024 -> 0.003
body = [head_ring(-0.04, 0.615, -0.04, 0.48, 0.012), head_ring(0.00, 0.618, 0.00, 0.47, 0.012),
        head_ring(0.06, 0.620, 0.05, 0.455, 0.007), head_ring(0.13, 0.620, 0.10, 0.385, 0.0045)]
W.append(loft("head", body, SLATE))
W.append(loft("edge", [head_ring(0.13, 0.620, 0.10, 0.385, 0.0045), head_ring(0.15, 0.620, 0.12, 0.380, 0.0015)], EDGE))

# ---- carrier: leather frog, origin = top anchor, body down -Y (seat y = SEAT_Y)
cx = S(0.43 - 0.09)  # haft centre where the frog sits (carrier y -0.09 -> weapon y 0.34)
C = [tube("frog", -0.18, 0.0, 0.034, 0.042, cx, LEATHER), tube("frogrim", -0.03, 0.0, 0.034, 0.048, cx, LEATHER)]
# stitched stud tab on the back so the strap has something to pin to
bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, -0.06, -0.046))
tab = bpy.context.object; tab.scale = (0.03, 0.10, 0.012); tab.data.materials.append(LEATHER); C.append(tab)


def finish(objs, name, shift_y=0.0):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    # bake world transforms (cube/sphere primitives carry location/scale), then origin at world 0
    me = ob.data
    me.transform(ob.matrix_world)
    ob.matrix_world.identity()
    bpy.ops.object.shade_flat()
    return ob

wob = finish(W, "weapon")
cob = finish(C, "carrier")


def tri(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

ws = [v.co.y for v in wob.data.vertices]
cs = [v.co.y for v in cob.data.vertices]
wt, ct = tri(wob), tri(cob)
print(f"total length {max(ws) - min(ws):.3f} m | grip->tip {max(ws):.3f} m | butt {min(ws):.3f} | "
      f"carrier length {max(cs) - min(cs):.3f} m (top {max(cs):.3f}) | tris weapon {wt} carrier {ct} | "
      f"seat carrier y {SEAT_Y}, head up | trail base [0.13,0.40,0] tip [0.15,0.64,0]")
assert wt <= 4000 and ct <= 2000

# glTF exporter turns Blender +Z into +Y, so rotate our Y-up build about X first.
from mathutils import Matrix
R = Matrix.Rotation(pi / 2, 4, "X")
for o in (wob, cob):
    o.data.transform(R)
os.makedirs(out_dir, exist_ok=True)
glb = os.path.join(out_dir, "wreckers-axe.glb")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format="GLB", export_yup=True)
print("wrote", glb)

# ---- preview: sword | axe | axe seated in its frog, one camera
shots = os.path.normpath(os.path.join(out_dir, "..", "..", "..", "shots"))
sword = os.path.join(out_dir, "..", "sword.glb")
if os.path.exists(sword):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.import_scene.gltf(filepath=sword)
    for o in bpy.context.selected_objects:
        o.location.x = -0.35
    for dx, dz, keep in ((0.0, 0.0, "weapon"), (0.38, 0.0, "weapon"), (0.38, -SEAT_Y, "carrier")):
        bpy.ops.import_scene.gltf(filepath=glb)  # seated copy: carrier raised so the weapon origin sits at carrier y -0.43
        for o in bpy.context.selected_objects:
            if o.name.startswith(keep):
                o.location = (dx, 0.0, dz)
            else:
                bpy.data.objects.remove(o)
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 4))
    bpy.context.object.data.energy = 3
    bpy.context.object.rotation_euler = (0.9, 0.3, 0.6)
    w = bpy.data.worlds.new("w"); w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.82, 0.85, 1)
    bpy.context.scene.world = w
    cam = bpy.data.cameras.new("c"); cam.type = "ORTHO"; cam.ortho_scale = 1.9
    co = bpy.data.objects.new("c", cam); bpy.context.collection.objects.link(co)
    co.location = (0.0, -5, 0.45); co.rotation_euler = (pi / 2, 0, 0)
    bpy.context.scene.camera = co
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = 1000, 1000
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    os.makedirs(shots, exist_ok=True)
    sc.render.filepath = os.path.join(shots, "weapon-wreckers-axe.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath)
