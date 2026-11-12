"""Ribfire Staff (WEAPONS.md #7): bone-rib staff, three tines cradling an ember salt-glass crystal, plus a two-loop sling.
  blender -b -P tools/weapons/ribfire-staff.py -- public/models/weapons
Origin = grip centre, 0.70 m above the foot; head along +Y. Nodes: weapon, carrier (origin = top anchor, body down -Y,
staff seat at carrier (0,-0.55,0)).
"""
import bpy, bmesh, sys, os
from math import pi, sin, cos

out_dir = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.8 if name == "iron" else 0.0
    if emit:
        b.inputs["Emission Color"].default_value = (*rgb, 1)
        b.inputs["Emission Strength"].default_value = emit
    return m

BONE = mat("bone", (0.72, 0.60, 0.40), 0.7)
RUST = mat("rust", (0.30, 0.10, 0.045), 0.8)
CLOTH = mat("cloth", (0.36, 0.09, 0.05), 0.9)
IRON = mat("iron", (0.18, 0.17, 0.17), 0.45)
GLASS = mat("saltglass", (0.90, 0.80, 0.72), 0.3)
EMBER = mat("ember", (1.0, 0.24, 0.045), 0.5, emit=3.0)
LEATHER = mat("leather", (0.20, 0.11, 0.06), 0.65)


def tube(name, path, material, k=10, cap=True):
    """path: [(x, y, z, rx, rz)] -> closed tube; elliptical sections in the XZ plane around each centre."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x + rx * cos(2 * pi * i / k), y, z + rz * sin(2 * pi * i / k))) for i in range(k)]
             for x, y, z, rx, rz in path]
    for a, b in zip(rings, rings[1:]):
        for i in range(k):
            bm.faces.new((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]))
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


def add(fn, material, **kw):
    fn(**kw)
    o = bpy.context.object
    o.data.materials.append(material)
    return o


def bow(y):  # a rib's curve: 0.06 m at mid-shaft, straight at both ends
    return 0.06 * (1 - ((y - 0.08) / 0.78) ** 2)


def shaft_section(y):  # oval 0.034x0.026 at the foot thinning to 0.024x0.020 at +0.85 (full widths -> radii)
    t = (y + 0.60) / 1.45
    return (bow(y), y, 0, 0.017 - 0.005 * t, 0.013 - 0.003 * t)


Y0, Y1 = -0.62, 0.86
ys = [Y0 + (Y1 - Y0) * i / 12 for i in range(13)]
weapon = [tube("shaft", [shaft_section(y) for y in ys], BONE)]
# shortcut: rust stains are two slightly fatter end sleeves, not noise-driven; upgrade to vertex colours if a close-up needs it
for a, b in ((-0.62, -0.50), (0.66, 0.86)):
    sy = [a + (b - a) * i / 3 for i in range(4)]
    weapon.append(tube("stain", [(x, y, z, rx + 0.0015, rz + 0.0015) for x, y, z, rx, rz in map(shaft_section, sy)], RUST))
for a, b in ((-0.06, 0.06), (0.80, 0.86)):
    sy = [a + (b - a) * i / 3 for i in range(4)]
    weapon.append(tube("wrap", [(x, y, z, rx + 0.004, rz + 0.004) for x, y, z, rx, rz in map(shaft_section, sy)], CLOTH))
# iron ferrule cone, foot at -0.70
weapon.append(tube("ferrule", [(bow(-0.70), -0.70, 0, 0.003, 0.003), (bow(-0.64), -0.64, 0, 0.0185, 0.0145),
                               (bow(-0.58), -0.58, 0, 0.0185, 0.0145)], IRON))
# three curled bone tines, 120 degrees apart
for n in range(3):
    a = 2 * pi * n / 3 + pi / 6
    pts = []
    for i in range(7):
        t = i / 6
        r = 0.02 + 0.07 * sin(pi * 0.85 * t)
        pts.append((r * cos(a), 0.86 + 0.19 * t, r * sin(a), 0.012 - 0.009 * t, 0.012 - 0.009 * t))
    weapon.append(tube(f"tine{n}", pts, BONE, k=6))
weapon.append(add(bpy.ops.mesh.primitive_ico_sphere_add, GLASS, radius=0.05, subdivisions=2, location=(0, 1.0, 0)))
weapon.append(add(bpy.ops.mesh.primitive_ico_sphere_add, EMBER, radius=0.025, subdivisions=2, location=(0, 1.0, 0)))

# carrier: two strap loops (r 0.03) at y 0 and -0.85, seat = staff origin at carrier y -0.55, plus a thin back strip
SEAT = -0.55
carrier = []
for cy in (0.0, -0.85):
    sy = cy - SEAT  # staff-frame height of this strap
    o = add(bpy.ops.mesh.primitive_torus_add, LEATHER, major_radius=0.03, minor_radius=0.005, major_segments=14,
            minor_segments=5, location=(bow(sy), cy, 0), rotation=(pi / 2, 0, 0))
    o.scale = (1.1, 1, 0.9)
    carrier.append(o)
carrier.append(tube("strip", [(0, 0.0, -0.034, 0.010, 0.003), (0, -0.85, -0.034, 0.010, 0.003)], LEATHER, k=4))

def upright(objs):
    from mathutils import Matrix
    R = Matrix.Rotation(pi / 2, 4, "X")
    for o in objs:
        o.matrix_world = R @ o.matrix_world


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob


# weapon is built in its own frame, carrier in carrier coords; the glb nodes stay separate (seat = carrier (0,-0.55,0)).
upright(weapon + carrier)
w = join(weapon, "weapon")
c = join(carrier, "carrier")
bpy.ops.object.select_all(action="DESELECT")
w.select_set(True); c.select_set(True)
bpy.ops.object.shade_flat()
os.makedirs(out_dir, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "ribfire-staff.glb"), use_selection=True, export_format="GLB",
                          export_yup=True)


def span(ob, axis):  # glTF Y = Blender Z
    zs = [(ob.matrix_world @ v.co)[axis] for v in ob.data.vertices]
    return min(zs), max(zs)

lo, hi = span(w, 2)
clo, chi = span(c, 2)
print(f"ribfire-staff: total length {hi - lo:.3f} m (foot {lo:+.2f}, tines top {hi:+.2f}); "
      f"grip->tip {hi:.3f} m; carrier top->end {chi - clo:.3f} m (top {chi:+.2f}, end {clo:+.2f}); "
      f"tris weapon {sum(len(p.vertices) - 2 for p in w.data.polygons)} "
      f"carrier {sum(len(p.vertices) - 2 for p in c.data.polygons)}")
