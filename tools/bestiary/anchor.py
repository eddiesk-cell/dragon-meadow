"""The Tolling Warden's ship's anchor and its rust chain (BESTIARY "## 8").
  blender -b -P tools/bestiary/anchor.py -- public/models/props/anchor.glb
Hanging pose, metres, Z-up in Blender (Y-up in the glb). The grip (the last link, where the fist holds it) is at the
origin; the chain runs down from it 8 links to the ring, and the anchor hangs below the ring (~2.2 m in all, built for the
1.8 m rig: it reads huge in a fist and its flukes drag the ground). Armature: chain_1 (at the ring) .. chain_8 (grip link),
each child above its parent; the anchor is weighted to chain_1. Empty "grip" sits in the middle of chain_8.
Also the shared helpers (tube, mesh, colour) that reed_spear.py imports.
"""
import bpy, bmesh, sys
from math import cos, sin, pi, radians
from mathutils import Vector, Matrix, noise

n01 = lambda p, o=3: noise.fractal(p, 1.0, 2.0, o, noise_basis='PERLIN_ORIGINAL') * 0.5 + 0.5
ss = lambda a, b, x: (lambda k: k * k * (3 - 2 * k))(min(1, max(0, (x - a) / (b - a))))
lerp = lambda a, b, k: a + (b - a) * k


def tube(bm, path, r, ref=(1, 0, 0), closed=False, seg=8):
    """A tube of radius r (number or fn(0..1)) along path; ref is any vector not parallel to the path (planar: its normal)."""
    n, ref, rings = len(path), Vector(ref), []
    for i, p in enumerate(path):
        t = (path[(i + 1) % n] - path[i - 1]) if closed else (path[min(i + 1, n - 1)] - path[max(i - 1, 0)])
        u = t.cross(ref).normalized(); v = t.normalized().cross(u)
        rr = r(i / (n - 1)) if callable(r) else r
        rings.append([bm.verts.new(p + (u * cos(k * 2 * pi / seg) + v * sin(k * 2 * pi / seg)) * rr) for k in range(seg)])
    for i in range(n if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    if not closed:
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])


def mesh(name, bm, colour, mat):
    """bmesh -> linked object, vertex colour from colour(co) -> (r,g,b) linear."""
    col = bm.loops.layers.float_color.new("Col")
    for f in bm.faces:
        f.smooth = True
        for lp in f.loops:
            lp[col] = (*colour(lp.vert.co), 1)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    return ob


def vcol_material():
    mat = bpy.data.materials.new("vcol"); mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    attr = mat.node_tree.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return mat


def oval(a, b, n=20, plane="xz", c=Vector()):
    """Stadium-ish closed path: half-length a along z, half-width b in x (plane xz) or y (plane yz)."""
    pts = []
    for k in range(n):
        t = k * 2 * pi / n
        w, h = b * (abs(cos(t)) ** 0.7) * (1 if cos(t) >= 0 else -1), a * (abs(sin(t)) ** 0.7) * (1 if sin(t) >= 0 else -1)
        pts.append(c + (Vector((w, 0, h)) if plane == "xz" else Vector((0, w, h))))
    return pts


def build(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = vcol_material()
    P, WR, ZR = 0.14, 0.03, -8 * 0.14  # chain pitch, link wire radius, ring height (grip at 0)

    def iron(co):  # black-green iron, rust blooming in the pits, salt crust near the crown
        o = Vector((3.1, 1.7, 0.4)); n = n01(co * 7 + o); m = 0.6 + 0.8 * n01(co * 2.5 + o)
        c = (0.018 * m, 0.04 * m, 0.032 * m)
        k = ss(0.62, 0.75, n) * 0.7
        c = tuple(lerp(a, b, k) for a, b in zip(c, (0.2, 0.07, 0.025)))
        k = ss(0.7, 0.8, n01(co * 9 + o + Vector((5, 0, 0)))) * ss(ZR - 0.6, ZR - 1.1, co.z) * 0.8
        return tuple(lerp(a, b, k) for a, b in zip(c, (0.55, 0.58, 0.5)))

    def rust(co):
        m = 0.55 + 0.9 * n01(co * 8 + Vector((9, 2, 1)))
        return (0.2 * m, 0.065 * m, 0.02 * m)

    # --- anchor body, hanging below the ring
    bm = bmesh.new()
    cz = ZR - 1.0                                                    # the crown
    ring_c = Vector((0, 0, ZR - 0.02))
    tube(bm, oval(0.12, 0.11, 24, "yz", ring_c), 0.026, ref=(1, 0, 0), closed=True)        # the ring, perpendicular to link 1
    tube(bm, [Vector((0, 0, ZR - 0.12 - 0.88 * i / 10)) for i in range(11)], lambda t: lerp(0.048, 0.065, t), seg=10)  # shank
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.085, matrix=Matrix.Translation((0, 0, cz)))   # crown
    s = ZR - 0.3                                                     # the stock, along X, fat knobs at each end
    tube(bm, [Vector((-0.42 + 0.84 * i / 8, 0, s)) for i in range(9)], lambda t: 0.03 + 0.03 * (abs(2 * t - 1) ** 3), ref=(0, 1, 0), seg=8)
    bmesh.ops.create_cube(bm, size=0.14, matrix=Matrix.Translation((0, 0, s)))              # the collar clamping it on
    for sg in (-1, 1):                                               # the two arms, curving out and up, palms at the tips
        arc = [Vector((0, sg * 0.5 * sin(radians(75 * i / 10)), cz + 0.5 * (1 - cos(radians(75 * i / 10))))) for i in range(11)]
        tube(bm, arc, lambda t: lerp(0.06, 0.036, t), ref=(1, 0, 0), seg=8)
        d = (arc[-1] - arc[-2]).normalized(); x = Vector((1, 0, 0))
        M = Matrix(((x.x, d.cross(x).x, d.x, 0), (x.y, d.cross(x).y, d.y, 0), (x.z, d.cross(x).z, d.z, 0), (0, 0, 0, 1)))
        M = Matrix.Translation(arc[-1] + d * 0.06) @ M @ Matrix.Diagonal((0.28, 1.1, 1, 1))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=3, radius1=0.2, radius2=0.0, depth=0.34, matrix=M)
    body = mesh("anchor", bm, iron, mat)

    # --- chain: link i centre sits at ZR + (i-0.5)*P; odd links in the XZ plane, even in YZ
    links = []
    for i in range(1, 9):
        b = bmesh.new()
        pl = "xz" if i % 2 else "yz"
        tube(b, oval(0.1, 0.065, 20, pl, Vector((0, 0, ZR + (i - 0.5) * P))), WR, ref=(0, 1, 0) if i % 2 else (1, 0, 0), closed=True)
        ob = mesh(f"link{i}", b, rust, mat)
        ob.vertex_groups.new(name=f"chain_{i}").add(range(len(ob.data.vertices)), 1, "REPLACE")
        links.append(ob)
    body.vertex_groups.new(name="chain_1").add(range(len(body.data.vertices)), 1, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    for o in links + [body]: o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()

    # --- armature
    arm = bpy.data.objects.new("rig", bpy.data.armatures.new("rig")); bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    prev = None
    for i in range(1, 9):
        eb = arm.data.edit_bones.new(f"chain_{i}")
        eb.head, eb.tail, eb.parent = (0, 0, ZR + (i - 1) * P), (0, 0, ZR + i * P), prev
        prev = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    body.parent = arm
    body.modifiers.new("Armature", "ARMATURE").object = arm
    g = bpy.data.objects.new("grip", None); g.empty_display_type = "ARROWS"; g.location = (0, 0, ZR + 7.5 * P)
    bpy.context.collection.objects.link(g)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format="GLB", export_yup=True, export_vertex_color="ACTIVE", export_skins=True)
    zs = [v.co.z for v in body.data.vertices]
    print(f"anchor: {len(body.data.vertices)} verts, z {min(zs):.2f}..{max(zs):.2f}; wrote {out}")


if __name__ == "__main__":
    build(sys.argv[sys.argv.index("--") + 1])
