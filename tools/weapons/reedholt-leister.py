"""Reedholt Leister (WEAPONS.md #3): ash pole, three barbed iron tines, turquoise ribbon, back sling.
  blender -b -P tools/weapons/reedholt-leister.py -- public/models/weapons [shots]
Writes reedholt-leister.glb with nodes `weapon` (origin = rear-hand grip, tines +Y) and `carrier`
(origin = top anchor, body down -Y). With a second arg, also renders shots/weapon-reedholt-leister.png
beside public/models/sword.glb. Parts are built Y-up and rotated by upright() like tools/props/sword.py.
"""
import bpy, bmesh, sys, os, random
from math import pi, cos, sin

out_dir = sys.argv[sys.argv.index("--") + 1]
shots = sys.argv[sys.argv.index("--") + 2] if len(sys.argv) > sys.argv.index("--") + 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(3)


def mat(name, rgb, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    return m

ASH = mat("ash", (0.55, 0.42, 0.27), 0.0, 0.7)
IRON = mat("iron", (0.30, 0.31, 0.33), 0.9, 0.45)
TAR = mat("tar", (0.07, 0.05, 0.04), 0.0, 0.85)
RIBBON = mat("ribbon", (0.45, 0.85, 0.82), 0.0, 0.6)  # lake turquoise #72D9D1, a touch muted
LEATHER = mat("leather", (0.20, 0.11, 0.06), 0.0, 0.65)


def lofted(name, sections, material, cap=True):
    """sections: [(y, [(x, z), ...]), ...] — same point count each; returns a closed tube object."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for x, z in pts] for y, pts in sections]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    bpy.context.collection.objects.link(ob)
    return ob


def ring(r, k=10, dx=0.0, dz=0.0):
    return [(dx + r * cos(2 * pi * i / k), dz + r * sin(2 * pi * i / k)) for i in range(k)]


def rect(dx, w, t, dz=0.0):  # flat section: w wide in x, t thick in z
    return [(dx - w, dz - t), (dx + w, dz - t), (dx + w, dz + t), (dx - w, dz + t)]


def box(name, size, loc, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(material)
    return ob


def upright(objs):
    from mathutils import Matrix
    R = Matrix.Rotation(pi / 2, 4, "X")
    for o in objs:
        o.matrix_world = R @ o.matrix_world


def finish(objs, name):
    """Turn Y-up parts upright, join them into one object called `name`, return it."""
    upright(objs)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    bpy.ops.object.shade_flat()
    return ob


# --- weapon: grip at origin, butt tip y -0.50, tine tips y +1.60.
w = []
Y0, Y1 = -0.45, 1.30
n = 12
secs = []
for i in range(n + 1):
    y = Y0 + (Y1 - Y0) * i / n
    r = 0.018 - 0.003 * i / n
    bend = 0.01 * sin(pi * i / n) + random.uniform(-0.002, 0.002) * (0 < i < n)
    secs.append((y, ring(r, 10, bend, bend * 0.5)))
w.append(lofted("pole", secs, ASH))
w.append(lofted("buttcap", [(-0.45, ring(0.021)), (-0.47, ring(0.021)), (-0.50, ring(0.004))], IRON))
w.append(lofted("cord", [(1.26, ring(0.0185)), (1.34, ring(0.0185))], TAR))
w.append(lofted("socket", [(1.30, ring(0.017)), (1.33, ring(0.012))], IRON))
for tip in (-0.05, 0.0, 0.05):  # three flat tines, splaying in X-Y; the middle one runs straight
    sec = [(1.30 + (1.60 - 1.30) * t, rect(tip * t * t, 0.006 * (1 - 0.85 * t), 0.002 * (1 - 0.6 * t))) for t in (0, .25, .5, .75, 1)]
    w.append(lofted("tine", sec, IRON))
    for s in (-1, 1):  # two backward barbs, 0.03 m
        for yb in (1.50, 1.42):
            t = (yb - 1.30) / 0.30
            cx = tip * t * t
            w.append(lofted("barb", [(yb, rect(cx + s * 0.005, 0.003, 0.002)),
                                     (yb - 0.03, rect(cx + s * 0.022, 0.0015, 0.0015))], IRON))
rib = []
for i in range(7):  # wavy hanging strip 0.25 x 0.03
    y = 1.24 - 0.25 * i / 6
    rib.append((y, rect(0.045 + 0.012 * i / 6, 0.015, 0.0008, 0.02 * sin(i * 0.9))))
w.append(lofted("ribbon", rib, RIBBON))
weapon = finish(w, "weapon")

# --- carrier: top anchor at origin, two leather loops (r 0.03) at y 0 and -0.90, a 0.04 m strap between.
c = []
for y in (0.0, -0.90):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.03, minor_radius=0.007, major_segments=14, minor_segments=6, location=(0, y, 0))
    t = bpy.context.object
    t.rotation_euler = (-pi / 2, 0, 0)  # axis Z -> Y so upright() leaves it around the pole
    bpy.ops.object.transform_apply(rotation=True)
    t.data.materials.append(LEATHER)
    c.append(t)
c.append(box("strap", (0.04, 0.90, 0.006), (0, -0.45, -0.03), LEATHER))
carrier = finish(c, "carrier")

# glTF export (Y-up); report sizes from evaluated meshes.
for ob in (weapon, carrier):
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "reedholt-leister.glb"), use_selection=True,
                          export_format="GLB", export_yup=True)


def extent(ob, axis):  # after export_yup the glTF Y is Blender Z
    zs = [(ob.matrix_world @ v.co)[axis] for v in ob.data.vertices]
    return min(zs), max(zs)

lo, hi = extent(weapon, 2)
clo, chi = extent(carrier, 2)
tris = lambda ob: sum(len(p.vertices) - 2 for p in ob.data.polygons)
print(f"WEAPON total_length={hi - lo:.3f} m (butt {lo:.3f} .. tips {hi:.3f}); grip_to_tip={hi:.3f} m; tris={tris(weapon)}")
print(f"CARRIER length={chi - clo:.3f} m (top {chi:.3f} .. end {clo:.3f}); tris={tris(carrier)}")
print("seat: weapon origin at carrier y -0.95, tines up; tips", round(-0.95 + hi, 3), "above top anchor; butt", round(-0.95 + lo - clo - 0.0, 3), "from carrier end")

if shots:  # side-by-side render with the sword, same camera
    from mathutils import Vector
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.import_scene.gltf(filepath=os.path.join(out_dir, "reedholt-leister.glb"))
    for o in bpy.context.selected_objects:
        o.location.x = 0.0
    w_ = [o for o in bpy.context.scene.objects if o.name.startswith("weapon")]
    for o in w_:
        o.location = (-0.15, 0, 0.5 + 0.0)
    cr = [o for o in bpy.context.scene.objects if o.name.startswith("carrier")]
    for o in cr:
        o.location = (0.25, 0, 0.95 + 0.5)
    bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(out_dir.rstrip("/")), "sword.glb"))
    for o in bpy.context.selected_objects:
        if o.parent is None:
            o.location = (0.75, 0, 0.5)
    sc = bpy.context.scene
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.86, 0.9, 0.9, 1)
    sc.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    for loc, e in (((2, -3, 3), 3.0), ((-3, -2, 1), 1.2)):
        bpy.ops.object.light_add(type="SUN", location=loc)
        bpy.context.object.data.energy = e
        bpy.context.object.rotation_euler = (1.0, 0.2, 0.5)
    bpy.ops.object.camera_add(location=(0.3, -4.2, 1.1))
    cam = bpy.context.object
    cam.rotation_euler = (pi / 2, 0, 0)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 3.6
    sc.camera = cam
    sc.render.engine = "BLENDER_EEVEE_NEXT" if hasattr(bpy.types, "SceneEEVEE") and "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 1400, 900
    sc.render.filepath = os.path.join(shots, "weapon-reedholt-leister.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", sc.render.filepath)
