"""Lanternstring: yew longbow + quiver (carrier) + arrow, built from code. See WEAPONS.md "## 2. Lanternstring".
  blender -b -P tools/weapons/lanternstring.py -- public/models/weapons [shots/weapon-lanternstring.png]
Writes lanternstring.glb with nodes weapon (origin = grip centre, limbs along +-Y, string at x=-0.15),
carrier (quiver, origin = mouth, body down -Y) and arrow (origin = nock, head +Y). Metres.
"""
import bpy, bmesh, sys, os
from math import pi, cos, sin

args = sys.argv[sys.argv.index("--") + 1:]
out_dir, render_to = args[0], (args[1] if len(args) > 1 else None)
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, rough, metal=0.0, glow=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if glow:
        b.inputs["Emission Color"].default_value = (*glow, 1)
        b.inputs["Emission Strength"].default_value = 1.5
    return m

YEW = mat("yew", (0.24, 0.13, 0.07), 0.6)
MOSS = mat("moss_leather", (0.20, 0.30, 0.12), 0.8)
HORN = mat("horn", (0.84, 0.78, 0.64), 0.45)
STRING = mat("string", (0.55, 0.85, 0.20), 0.5, glow=(0.78, 1.0, 0.35))
LEATHER = mat("leather", (0.22, 0.13, 0.07), 0.7)
GREY = mat("grey_fletch", (0.55, 0.56, 0.55), 0.9)
IRON = mat("iron", (0.40, 0.41, 0.43), 0.45, 0.9)
ASH = mat("ash", (0.62, 0.50, 0.34), 0.7)


def ring(rx, rz, k=10):
    return [(rx * cos(2 * pi * i / k), rz * sin(2 * pi * i / k)) for i in range(k)]


def link(bm, rings, closed_ends=True):
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if closed_ends:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def obj(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    bpy.context.collection.objects.link(ob)
    return ob


def tube(name, secs, material, k=10):
    """secs: [(y, rx, rz, xoff, zoff)] -> lofted tube along Y."""
    bm = bmesh.new()
    rings = [[bm.verts.new((xo + x, y, zo + z)) for x, z in ring(rx, rz, k)] for y, rx, rz, xo, zo in secs]
    link(bm, rings)
    return obj(name, bm, material)


def quad(name, pts, material):  # double-sided flat quad
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in pts]); bm.faces.new([bm.verts.new(p) for p in pts[::-1]])
    return obj(name, bm, material)


def bend(y):  # tips curve back toward -X, 0.15 m at |y| = 0.80
    return -0.15 * (abs(y) / 0.80) ** 2


def limb(s):
    ys = [0.06, 0.2, 0.4, 0.6, 0.76]
    f = lambda y: 0.032 + (0.012 - 0.032) * (y - 0.06) / 0.70
    g = lambda y: 0.022 + (0.009 - 0.022) * (y - 0.06) / 0.70
    return tube("limb", [(s * y, f(y), g(y), bend(y), 0) for y in ys], YEW)


def arrow_parts(y0):  # nock at y0, head toward +Y
    p = [tube("shaft", [(y0, .004, .004, 0, 0), (y0 + .75, .004, .004, 0, 0)], ASH, 6)]
    for a in (pi / 2, pi / 2 + 2 * pi / 3, pi / 2 + 4 * pi / 3):
        c, s = cos(a), sin(a)
        p.append(quad("fletch", [(.004 * c, y0 + .03, .004 * s), (.016 * c, y0 + .03, .016 * s),
                                 (.016 * c, y0 + .13, .016 * s), (.004 * c, y0 + .11, .004 * s)], GREY))
    p.append(tube("head", [(y0 + .75, .004, .004, 0, 0), (y0 + .765, .011, .004, 0, 0), (y0 + .80, .0, .0005, 0, 0)][:2]
                  + [(y0 + .80, .0005, .0005, 0, 0)], IRON, 6))
    return p


def finish(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.ops.object.shade_flat()
    from mathutils import Matrix
    o.data.transform(Matrix.Rotation(pi / 2, 4, "X"))  # builder +Y -> Blender +Z -> glTF +Y
    return o


# --- weapon: bow, origin = grip centre
w = [tube("grip", [(-.06, .018, .018, 0, 0), (0, .020, .020, 0, 0), (.06, .018, .018, 0, 0)], MOSS, 12), limb(1), limb(-1)]
for s in (1, -1):
    w.append(tube("nock", [(s * .76, .012, .009, bend(.76), 0), (s * .80, .004, .004, bend(.80), 0)], HORN, 8))
w.append(tube("string", [(-.80, .002, .002, -.15, 0), (.80, .002, .002, -.15, 0)], STRING, 6))
weapon = finish(w, "weapon")

# --- carrier: quiver, mouth at origin, down -Y
c = [tube("quiver", [(0, .06, .06, 0, 0), (-.62, .05, .05, 0, 0)], LEATHER, 14),
     tube("rim", [(.01, .064, .064, 0, 0), (-.04, .064, .064, 0, 0)], MOSS, 14)]
for i in range(8):
    a = 2 * pi * i / 8
    dx, dz = .028 * cos(a), .028 * sin(a)
    c.append(tube("qa", [(-.2, .003, .003, dx, dz), (.12, .003, .003, dx, dz)], ASH, 5))
    c.append(quad("qf", [(dx, .02, dz), (dx + .012 * cos(a), .02, dz + .012 * sin(a)),
                         (dx + .012 * cos(a), .12, dz + .012 * sin(a)), (dx, .11, dz)], GREY))
carrier = finish(c, "carrier")

# --- arrow: nock at origin, head +Y
arrow = finish(arrow_parts(0), "arrow")

os.makedirs(out_dir, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
glb = os.path.join(out_dir, "lanternstring.glb")
bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format="GLB", export_yup=True)


def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def span(o, ax):
    v = [q[ax] for q in (o.matrix_world @ vv.co for vv in o.data.vertices)]
    return max(v) - min(v)  # blender Z == glTF Y
print(f"bow tip-to-tip {span(weapon,2):.3f} m | grip->tip {span(weapon,2)/2:.3f} m | carrier {span(carrier,2):.3f} m "
      f"(top->end 0.62 + fletch) | arrow {span(arrow,2):.3f} m | tris weapon {tris(weapon)} carrier {tris(carrier)} arrow {tris(arrow)}")

if render_to:  # picture beside the broadsword, same camera
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    def load(path, dx, dy=0):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        for o in set(bpy.data.objects) - before:
            if o.parent is None: o.location.x += dx; o.location.z += dy
    root = os.path.dirname(out_dir.rstrip("/"))
    load(os.path.join(root, "sword.glb"), -0.6)
    load(glb, 0.3)  # weapon, carrier and arrow all at their own origins
    for o in bpy.data.objects:
        if o.name.startswith("carrier"): o.location.x += 0.8; o.location.z += 0.62
        if o.name.startswith("arrow"): o.location.x += 1.4; o.location.z += 0.2
        if o.name.startswith("weapon"): o.location.z += 0.0
    bpy.ops.object.light_add(type="SUN", location=(2, -4, 4)); bpy.context.object.data.energy = 3
    bpy.context.object.rotation_euler = (0.9, 0.2, 0.5)
    bpy.context.scene.world = bpy.data.worlds.new("w"); bpy.context.scene.world.color = (0.55, 0.57, 0.58)
    bpy.ops.object.camera_add(location=(0.55, -4.6, 0.55)); cam = bpy.context.object
    cam.rotation_euler = (pi / 2, 0, 0); cam.data.lens = 35
    sc = bpy.context.scene; sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "MATERIAL"
    sc.render.resolution_x, sc.render.resolution_y = 1400, 900
    sc.render.filepath = render_to
    bpy.ops.render.render(write_still=True)
