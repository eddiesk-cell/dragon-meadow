"""Windgap Warden greatsword + back frame (WEAPONS.md "6. Windgap Warden").
  blender -b -P tools/weapons/windgap-warden.py -- public/models/weapons
Writes windgap-warden.glb with nodes `weapon` (origin = upper grip, blade +Y, edge +X) and `carrier`
(origin = top anchor, body down -Y). Seat: weapon origin at carrier y +0.25, blade DOWN, 0.03 m in front.
Also renders shots/weapon-windgap-warden.png beside public/models/sword.glb when "--render" follows.
"""
import bpy, bmesh, sys, os
from math import pi, cos, sin

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = args[0]
bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x ** 2.2 for x in c)


def mat(name, hexc, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    rgb = srgb(hexc)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m

STEEL = mat("steel", "#A8B2BE", 1.0, 0.3)
GRANITE = mat("granite", "#66686C", 0.0, 0.8)
PINE = mat("pine", "#2A4030", 0.0, 0.8)
LEATHER = mat("leather", "#4A3322", 0.0, 0.65)
BRASS = mat("brass", "#B08A3E", 1.0, 0.4)


def lofted(name, sections, material):
    """sections: [(y, [(x, z), ...])] same point count each; closed tube along Y."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for x, z in pts] for y, pts in sections]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    bpy.context.collection.objects.link(ob)
    return ob


def dia(w, t):  # diamond section, half-width w, half-thickness t
    return [(-w, 0), (0, -t), (w, 0), (0, t)]


def ring(r, k=12):
    return [(r * cos(2 * pi * i / k), r * sin(2 * pi * i / k)) for i in range(k)]


def box(name, size, loc, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(material)
    return ob


def finish(objs, name):
    """Rotate Y->Z about world origin (exporter turns Z back into Y), join into one object `name`."""
    from mathutils import Matrix
    R = Matrix.Rotation(pi / 2, 4, "X")
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.matrix_world = R @ o.matrix_world
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    bpy.ops.object.shade_flat()
    return ob


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# --- weapon (build frame: long axis Y, edge on X)
w = []
bpy.ops.mesh.primitive_cylinder_add(radius=0.045, depth=0.03, location=(0, -0.265, 0), vertices=16)  # wheel pommel, axis = blade thickness, touches grip end -0.22
pom = bpy.context.object; pom.name = "pommel"; pom.data.materials.append(BRASS)
w.append(lofted("grip", [(-0.22, ring(0.017)), (0.16, ring(0.017))], PINE))
w.append(box("guard", (0.40, 0.03, 0.035), (0, 0.18, 0), GRANITE))
w.append(lofted("ricasso", [(0.20, dia(0.025, 0.0055)), (0.32, dia(0.025, 0.0055))], LEATHER))
for s in (-1, 1):  # parrying lugs, 0.06 m spikes along +-X
    w.append(lofted("lug", [(0.32, [(s * 0.025, -0.006), (s * 0.025, 0.006), (s * 0.025, 0.006), (s * 0.025, -0.006)]),
                            (0.32, [(s * 0.085, 0), (s * 0.085, 0), (s * 0.085, 0), (s * 0.085, 0)])], STEEL)
             if False else box("lug", (0.06, 0.012, 0.012), (s * 0.055, 0.32, 0), STEEL))
w.append(lofted("blade", [(0.32, dia(0.030, 0.005)), (0.34, dia(0.030, 0.005)), (1.25, dia(0.0225, 0.005)),
                          (1.48, dia(0.0015, 0.0015))], STEEL))
w.append(pom)  # not first: finish() joins into objs[0], which must have identity location
weapon = finish(w, "weapon")

# --- carrier: strip down -Y from the top anchor, clasps at y 0, -0.45, -0.90
c = [box("strip", (0.08, 1.00, 0.01), (0, -0.45, 0), LEATHER)]
for y in (0, -0.45, -0.90):
    c.append(box("clasp", (0.10, 0.03, 0.03), (0, y, 0.0), BRASS))
carrier = finish(c, "carrier")

# glTF: Y-up; carrier clasps sit in front of the strip (the blade is 0.03 m in front of it).
bpy.ops.object.select_all(action="DESELECT")
weapon.select_set(True); carrier.select_set(True)
os.makedirs(out_dir, exist_ok=True)
path = os.path.join(out_dir, "windgap-warden.glb")
bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_yup=True)

zs = [v.co.y for v in weapon.data.vertices]
ys = [v.co.y for v in carrier.data.vertices]
print(f"weapon total length {max(zs) - min(zs):.3f} m (spec 1.79), grip->tip {max(zs):.3f} m (spec 1.48), pommel bottom {min(zs):.3f}")
print(f"carrier top->end {max(ys) - min(ys):.3f} m (spec strip 1.00)  tip past hips anchor {1.48 - 0.25 - 0.97:.2f} m (spec 0.26)")
print(f"triangles: weapon {tris(weapon)} (limit 4000), carrier {tris(carrier)} (limit 2000)")
print("wrote", path)

if "--render" in args:
    import mathutils
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    def load(p):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=p)
        return [o for o in bpy.data.objects if o not in before]
    def move(objs, x, y=0.0, z=0.0, rx=0.0):
        for o in objs:
            if o.parent is None:
                o.location.x += x; o.location.y += y; o.location.z += z
                o.rotation_euler.x += rx
    sw = load(os.path.join(root, "public/models/sword.glb")); move(sw, -0.6)
    ww = load(path)
    for o in ww:
        if o.name.startswith("carrier"): o.location.x = 0.55; o.location.z = 1.2  # carrier top anchor
    for o in ww:
        if o.name.startswith("weapon"): o.location.x = 0.0; o.location.z = 0.31
    # sword.glb origin is mid-grip; lift so it stands near the same floor
    for o in sw:
        if o.parent is None: o.location.z = 0.14
    bpy.ops.object.light_add(type="SUN", location=(2, -3, 4)); L = bpy.context.object; L.data.energy = 4; L.rotation_euler = (0.9, 0.2, 0.6)
    bpy.ops.object.light_add(type="SUN"); L2 = bpy.context.object; L2.data.energy = 1.5; L2.rotation_euler = (1.2, 0, -2.2)
    sc = bpy.context.scene
    sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.62, 0.66, 0.68)
    bpy.ops.object.camera_add(location=(0.0, -6, 0.95)); cam = bpy.context.object
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4; cam.rotation_euler = (pi / 2, 0, 0)
    sc.camera = cam
    sc.render.engine = "CYCLES"; sc.cycles.samples = 6; sc.cycles.device = "CPU"
    sc.render.resolution_x = 1000; sc.render.resolution_y = 1000
    sc.render.filepath = os.path.join(root, "shots", "weapon-windgap-warden.png")
    os.makedirs(os.path.dirname(sc.render.filepath), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath)
