"""The Stiltstalker's reed spear (BESTIARY "## 7"), and the props sheet.
  blender -b -P tools/bestiary/reed_spear.py -- public/models/props/reed-spear.glb          (build)
  blender -b -P tools/bestiary/reed_spear.py -- --sheet art/bestiary/props.png               (render anchor + spear beside a 1.8 m figure)
Z-up in Blender (Y-up in the glb). Shaft 3.6 m of twisted reed, flint leaf head up; the "grip" empty is at the origin,
1.2 m below the head (one third down the shaft), so the butt is 2.4 m behind the hand.
"""
import bpy, bmesh, sys, os
from math import cos, sin, pi
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from anchor import tube, mesh, vcol_material, n01, ss, lerp

arg = sys.argv[sys.argv.index("--") + 1:]
Z0, Z1 = -2.4, 1.2  # butt, tip of the shaft (grip at 0)


def build(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = vcol_material()

    def reed(co):  # reed gold, paler at the cut ends, darker in the twist grooves
        m = 0.75 + 0.5 * n01(co * Vector((30, 30, 4)) + Vector((1, 2, 3)))
        return (0.55 * m, 0.36 * m, 0.09 * m)

    def cord(co):
        m = 0.8 + 0.4 * n01(co * 25)
        return (0.7 * m, 0.38 * m, 0.06 * m)

    def flint(co):
        m = 0.8 + 0.6 * n01(co * 14 + Vector((4, 4, 4)))
        k = ss(0.62, 0.74, n01(co * 5 + Vector((8, 1, 1))))  # pale cortex
        return tuple(lerp(a * m, b, k) for a, b in zip((0.045, 0.05, 0.055), (0.45, 0.42, 0.36)))

    taper = lambda t: 0.5 + 0.5 * min(1, t * 14, (1 - t) * 14)  # blunt at both ends
    bm = bmesh.new()
    N = 80
    tube(bm, [Vector((0, 0, lerp(Z0, Z1, i / N))) for i in range(N + 1)], lambda t: 0.024 * taper(t), ref=(1, 0, 0), seg=8)  # core
    for s in range(5):  # five reed strands twisted round it, one turn per 0.45 m
        ph = s * 2 * pi / 5
        tube(bm, [Vector((0.022 * cos(ph + 2 * pi * z / 0.45), 0.022 * sin(ph + 2 * pi * z / 0.45), z))
                  for z in (lerp(Z0, Z1, i / N) for i in range(N + 1))], lambda t: 0.014 * taper(t), ref=(0, 0, 1) if False else (1, 1, 0), seg=6)
    shaft = mesh("shaft", bm, reed, mat)

    bm = bmesh.new()
    for z, n in ((1.02, 6), (-0.05, 3), (-1.1, 3), (-2.2, 3)):  # reed-gold bindings: a head wrap and three along the shaft
        for k in range(n):
            tube(bm, [Vector((0.04 * cos(a), 0.04 * sin(a), z + 0.022 * k)) for a in (j * 2 * pi / 14 for j in range(14))], 0.011, ref=(0, 0, 1), closed=True, seg=5)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.036, radius2=0.03, depth=0.1, matrix=Matrix.Translation((0, 0, 1.14)))  # socket
    bind = mesh("bindings", bm, cord, mat)

    bm = bmesh.new()  # flint leaf head: a flat two-cone diamond, thin in X
    flat = Matrix.Diagonal((0.28, 1, 1, 1))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.014, radius2=0.052, depth=0.1, matrix=Matrix.Translation((0, 0, 1.25)) @ flat)
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.052, radius2=0.0, depth=0.3, matrix=Matrix.Translation((0, 0, 1.45)) @ flat)
    head = mesh("head", bm, flint, mat)

    g = bpy.data.objects.new("grip", None); g.empty_display_type = "ARROWS"
    bpy.context.collection.objects.link(g)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format="GLB", export_yup=True, export_vertex_color="ACTIVE")
    zs = [v.co.z for o in (shaft, bind, head) for v in o.data.vertices]
    print(f"spear: z {min(zs):.2f}..{max(zs):.2f}, shaft {Z1 - Z0:.1f} m; wrote {out}")


def sheet(out):
    """Anchor (left), a 1.8 m figure, the spear (right): front view then side view, side by side."""
    import numpy as np
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "models", "props")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for f, x, y, z in (("anchor.glb", -1.5, -1.5, 2.2), ("reed-spear.glb", 1.2, 1.5, 2.4)):
        bpy.ops.import_scene.gltf(filepath=os.path.join(d, f))
        roots = [o for o in bpy.context.selected_objects if o.parent is None]
        for o in roots: o.location += Vector((x, y, z))  # ground the lowest point (grip->butt/anchor tip)
    mat = bpy.data.materials.new("fig"); mat.diffuse_color = (0.55, 0.55, 0.6, 1)
    for kind, loc, dim in (("cyl", (0, 0, 0.7), (0.2, 0.12, 1.4)), ("sph", (0, 0, 1.65), (0.2, 0.2, 0.3))):
        (bpy.ops.mesh.primitive_cylinder_add if kind == "cyl" else bpy.ops.mesh.primitive_uv_sphere_add)(location=loc)
        o = bpy.context.object; o.dimensions = dim; o.data.materials.append(mat)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading; sh.light = "STUDIO"; sh.color_type = "VERTEX"; sh.show_cavity = True
    sc.display.render_aa = "8"
    w = bpy.data.worlds.new("w"); w.color = (0.78, 0.78, 0.82); sc.world = w
    sc.render.resolution_x, sc.render.resolution_y = 1000, 1000
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 5.2; sc.camera = cam
    imgs = []
    for name, loc, rot in (("front", (0, -20, 2.1), (90, 0, 0)), ("side", (20, 0, 2.1), (90, 0, 90))):
        cam.location = loc; cam.rotation_euler = [r * pi / 180 for r in rot]
        p = os.path.join(os.environ.get("TMPDIR", "/tmp"), f"props-{name}.png")
        sc.render.filepath = p; bpy.ops.render.render(write_still=True)
        imgs.append(bpy.data.images.load(p))
    w_, h_ = imgs[0].size
    px = np.concatenate([np.array(i.pixels[:]).reshape(h_, w_, 4) for i in imgs], axis=1)
    o = bpy.data.images.new("sheet", 2 * w_, h_, alpha=True); o.pixels = px.ravel().tolist()
    o.filepath_raw = out; o.file_format = "PNG"; o.save()
    print("wrote", out)


if arg[0] == "--sheet":
    sheet(arg[1])
else:
    build(arg[0])
