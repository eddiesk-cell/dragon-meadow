"""The hero's broadsword and its scabbard, built from code (matches art/hero/hero-front-v1.png).
  blender -b -P tools/props/sword.py -- public/models
Writes sword.glb (origin = middle of the grip, blade along +Y) and scabbard.glb (origin = the mouth,
body along -Y), both in metres. Total sword length ~1.40 m for a 1.8 m hero.
"""
import bpy, bmesh, sys, os
from math import pi

out_dir = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, rgb, metal, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    return m

STEEL = mat("steel", (0.78, 0.80, 0.83), 1.0, 0.28)
BRASS = mat("brass", (0.80, 0.58, 0.26), 1.0, 0.35)
WRAP = mat("grip", (0.30, 0.12, 0.08), 0.0, 0.75)
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


def diamond(w, t):  # blade cross-section: flat hexagon with a central ridge
    return [(-w, 0), (-w * 0.55, -t), (w * 0.55, -t), (w, 0), (w * 0.55, t), (-w * 0.55, t)]


def ring(r, k=12, sx=1.0):
    from math import cos, sin
    return [(r * sx * cos(2 * pi * i / k), r * sin(2 * pi * i / k)) for i in range(k)]


def cyl(name, y0, y1, r, material, k=12):
    return lofted(name, [(y0, ring(r, k)), (y1, ring(r, k))], material)


def box(name, size, loc, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(material)
    return ob


def export(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    bpy.ops.object.shade_flat()
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_yup=True)
    for o in bpy.context.selected_objects:
        bpy.data.objects.remove(o)


def upright(objs):
    """Rotate parts about the WORLD origin (not their own), so positions turn with them."""
    from mathutils import Matrix
    R = Matrix.Rotation(pi / 2, 4, "X")
    for o in objs:
        o.matrix_world = R @ o.matrix_world


# --- sword: Blender is Z-up, so build along +Z and let the glTF exporter turn it into +Y.
parts = []
blade = [(0.12, diamond(0.040, 0.009)), (0.20, diamond(0.042, 0.009)), (0.90, diamond(0.036, 0.008)),
         (1.05, diamond(0.026, 0.007)), (1.13, diamond(0.004, 0.002))]
parts.append(lofted("blade", blade, STEEL))
parts.append(box("guard", (0.30, 0.035, 0.045), (0, 0.105, 0), BRASS))
for s in (-1, 1):  # curled guard ends
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.026, location=(s * 0.155, 0.115, 0))
    o = bpy.context.object; o.data.materials.append(BRASS); parts.append(o)
parts.append(lofted("grip", [(-0.13, ring(0.019)), (-0.06, ring(0.021)), (0.0, ring(0.019)), (0.06, ring(0.021)), (0.09, ring(0.019))], WRAP))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.034, location=(0, -0.16, 0))
o = bpy.context.object; o.scale = (1, 0.85, 0.75); o.data.materials.append(BRASS); parts.append(o)
upright(parts)  # long axis Y -> Z so the exporter (Z-up -> Y-up) yields +Y
export(parts, os.path.join(out_dir, "sword.glb"))

# --- scabbard: mouth at the origin, body down -Y, a little wider than the blade.
parts = []
sc = [(0.00, diamond(0.050, 0.016)), (-0.06, diamond(0.050, 0.016)), (-0.90, diamond(0.044, 0.014)),
      (-1.02, diamond(0.034, 0.012)), (-1.06, diamond(0.020, 0.010))]
parts.append(lofted("sheath", sc, LEATHER))
parts.append(lofted("throat", [(0.01, diamond(0.056, 0.020)), (-0.07, diamond(0.056, 0.020))], BRASS))
parts.append(lofted("chape", [(-0.96, diamond(0.040, 0.016)), (-1.075, diamond(0.012, 0.010))], BRASS))
upright(parts)
export(parts, os.path.join(out_dir, "scabbard.glb"))
print("wrote sword.glb + scabbard.glb to", out_dir)
