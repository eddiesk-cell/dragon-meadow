"""Tidebell Maul (WEAPONS.md #4): a bronze bell-clapper lashed crosswise onto a broken oar, plus its rope sling.
  blender -b -P tools/weapons/tidebell-maul.py -- public/models/weapons
Writes tidebell-maul.glb with nodes "weapon" (origin = lower grip, business end +Y, striking faces +-X, 1.33 m) and
"carrier" (origin = top anchor, body down -Y, two rope loops at y 0 and -0.70). Seat: weapon origin at carrier y -0.70.
Also renders shots/weapon-tidebell-maul.png: sword | maul | maul seated in its sling, same camera.
"""
import bpy, sys, os
from math import pi, cos, sin
from mathutils import Vector, noise

out_dir = sys.argv[sys.argv.index("--") + 1]
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
bpy.ops.wm.read_factory_settings(use_empty=True)

ss = lambda a, b, x: (lambda k: k * k * (3 - 2 * k))(min(1, max(0, (x - a) / (b - a))))
lerp = lambda a, b, k: a + (b - a) * k
n01 = lambda p, o=3: noise.fractal(p, 1.0, 2.0, o, noise_basis='PERLIN_ORIGINAL') * 0.5 + 0.5

# two vertex-coloured materials: wood/rope (dielectric) and metal (bronze, verdigris, iron)
def mat(name, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    vc = m.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
    m.node_tree.links.new(vc.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m
M, MM = mat("maul", 0.0, 0.7), mat("maul_metal", 0.85, 0.45)

BRONZE, VERD = (0.386, 0.162, 0.042), (0.076, 0.342, 0.227)
WOOD, IRON, ROPE = (0.30, 0.25, 0.19), (0.07, 0.07, 0.08), (0.09, 0.06, 0.035)


def finish(ob, colour, smooth=False, metal=False):
    """Bake scale in, paint vertex colour (colour(local_co) -> rgb), give it the shared material."""
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    ob.select_set(False)
    me = ob.data
    ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    flat = []
    for lp in me.loops:
        flat += [*colour(me.vertices[lp.vertex_index].co, lp.vertex_index), 1]
    ca.data.foreach_set("color", flat)
    me.materials.append(MM if metal else M)
    for p in me.polygons:
        p.use_smooth = smooth
    return ob


def cyl(z0, z1, rx, ry, colour, loc=(0, 0), v=12, metal=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=1, depth=z1 - z0, location=(loc[0], loc[1], (z0 + z1) / 2))
    ob = bpy.context.object
    ob.scale = (rx, ry, 1)
    return finish(ob, colour, metal=metal)


def torus(R, r, loc, rot, colour, seg=16, minor=6, metal=False):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=minor, location=loc, rotation=rot)
    return finish(bpy.context.object, colour, metal=metal)


def solid(c):
    return lambda co, *_: c


def join(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")  # join leaves the origin on the first part
    return ob


# --- weapon: built along +Z (exporter turns Z-up into +Y); head's striking faces on +-X.
W = []
W.append(cyl(-0.25, 1.0, 0.013, 0.010, lambda co, *_: tuple(c * (0.8 + 0.4 * n01(Vector((co.x * 9, co.y * 9, co.z * 3)))) for c in WOOD)))  # oar loom
W.append(cyl(-0.27, -0.25, 0.019, 0.015, solid(WOOD)))                      # butt knob where the oar blade snapped
W.append(cyl(-0.05, 0.05, 0.0175, 0.0145, solid(ROPE)))                     # tarred grip wrap
W.append(cyl(0.78, 0.86, 0.0175, 0.0145, solid(ROPE)))                      # lashing under the head
for z in (0.835, 0.875):                                                    # iron bands holding head to shaft
    W.append(cyl(z - 0.01, z + 0.01, 0.0195, 0.0165, solid(IRON), metal=True))
for sx in (-1, 1):                                                          # iron straps down both sides of the shaft, up into the head loops
    W.append(cyl(0.80, 0.90, 0.006, 0.014, solid(IRON), (sx * 0.022, 0), 6, metal=True))

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1, location=(0, 0, 0.95))
head = bpy.context.object
head.scale = (0.11, 0.08, 0.08)                                              # 0.22 along X, 0.16 across
D = {}
for v in head.data.vertices:                                                 # egg: fuller toward +X; lumpy cast bronze
    n = v.co.normalized()
    t = 1 + 0.18 * n.x
    v.co.y *= t; v.co.z *= t
    D[v.index] = n01(v.co * 2.4 + Vector((3, 1, 7)))
    v.co += n * (D[v.index] - 0.5) * 1.1 * 0.12
bpy.context.view_layer.objects.active = head
head.select_set(True); bpy.ops.object.transform_apply(location=False, rotation=True, scale=True); head.select_set(False)
def head_col(co, vi):
    d = D[vi]
    k = max(ss(0.44, 0.36, d), 0.7 * ss(0.72, 0.8, n01(co * 40, 2)))           # verdigris only in pits + fine speckle
    c = tuple(lerp(a, bb, k) for a, bb in zip(BRONZE, VERD))
    s = 0.7 + 0.3 * n01(co * 14)
    return tuple(x * s for x in c)
W.append(finish(head, head_col, smooth=True, metal=True))
W.append(torus(0.05, 0.012, (0, 0, 1.018), (0, pi / 2, 0), solid(IRON), metal=True))  # iron ring, plane across the shaft (YZ)
for x in (-0.05, 0.05):                                                     # iron straps over the head
    W.append(torus(0.083, 0.010, (x, 0, 0.95), (0, pi / 2, 0), solid(IRON), 24, 6, metal=True))
for x in (-0.02, 0.0, 0.02):                                                # tarred rope crossings
    W.append(torus(0.086, 0.007, (x, 0, 0.95), (0, pi / 2, 0), solid(ROPE), 24, 5))
weapon = join(W, "weapon")

# --- carrier: top anchor at the origin, body down -Z (-Y after export); two rope loops the shaft passes through + a strap.
C = [torus(0.04, 0.009, (0, 0, z), (0, 0, 0), solid(ROPE), 14, 6) for z in (0.0, -0.70)]
C.append(cyl(-0.97, 0.0, 0.012, 0.012, solid(ROPE), (-0.045, 0), 8))
for z in (0.0, -0.70):                                                      # knot where each loop meets the strap
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=0.024, location=(-0.045, 0, z))
    C.append(finish(bpy.context.object, solid(ROPE)))
bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=0.02, location=(-0.045, 0, -0.97))
C.append(finish(bpy.context.object, solid(ROPE)))                            # knot at the hips anchor
carrier = join(C, "carrier")

# --- report against the entry (+-10 %) and the limits
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
zs = [v.co.z for v in weapon.data.vertices]
xs = [v.co.x for v in weapon.data.vertices]
cz = [v.co.z for v in carrier.data.vertices]
print(f"weapon: total {max(zs)-min(zs):.3f} m (want 1.33), z {min(zs):.3f}..{max(zs):.3f} (butt -0.25, ring top 1.08), "
      f"grip->tip {max(zs):.3f}, head width x {min(xs):.3f}..{max(xs):.3f} (want 0.22), tris {tris(weapon)} (<=4000)")
print(f"carrier: top->end {max(cz)-min(cz):.3f} m (want ~0.97), tris {tris(carrier)} (<=2000)")

glb = os.path.join(out_dir, "tidebell-maul.glb")
os.makedirs(out_dir, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format="GLB", export_yup=True, export_vertex_color="ACTIVE")
print("wrote", glb)

# --- comparison render: sword | maul | maul seated in sling, one camera
bpy.ops.wm.read_factory_settings(use_empty=True)
def load(path, dx, dz, only=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is None:
            o.location += Vector((dx, 0, dz))
        if only and o.type == "MESH" and not o.name.startswith(only):
            bpy.data.objects.remove(o)
    return new
load(os.path.join(root, "public/models/sword.glb"), -0.55, 1.0)
load(glb, 0.0, 1.0, only="weapon")
load(glb, 0.55, 1.0, only="weapon")
for o in load(glb, 0.55, 1.0 + 0.70, only="carrier"):
    pass
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = 1100, 800
sc.render.filepath = os.path.join(root, "shots", "weapon-tidebell-maul.png")
w = bpy.data.worlds.new("w"); w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.58, 0.6, 1); sc.world = w
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.6
cam.location = (0.0, -4, 1.45); cam.rotation_euler = (pi / 2, 0, 0)
for loc, e in (((2, -3, 4), 3.0), ((-3, -2, 2), 1.2)):
    l = bpy.data.objects.new("l", bpy.data.lights.new("l", "SUN")); l.data.energy = e
    l.location = loc; l.rotation_euler = (0.9, 0.2, 0.6); sc.collection.objects.link(l)
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng; break
    except TypeError:
        pass
sc.view_settings.view_transform = "Standard"
os.makedirs(os.path.dirname(sc.render.filepath), exist_ok=True)
bpy.ops.render.render(write_still=True)
print("rendered", sc.render.filepath)
