"""Glowing bell flower: a 3 m stem arching over, drooping lilac/peach bells, leaves. Vertex colour alpha = glow mask (1 glows).
  blender -b -P tools/flora/bellflower.py -- public/models/flora   [--render out.png]
Glow mask = glb attribute _GLOW (float, 1 glows); COLOR_0 is plain RGB.
Origin = base of the stem, +Y up (glTF), metres. One material reads COLOR_0 for both day and night."""
import bpy, bmesh, sys, os, random
from math import pi, sin, cos, radians
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
out_dir = argv[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(7)
bm = bmesh.new()
col = bm.loops.layers.float_color.new("Col")
glow = bm.loops.layers.float.new("_GLOW")  # glow mask; glb keeps it as _GLOW (COLOR_0 loses alpha on export)


def lerp(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))
def sm(t): t = max(0, min(1, t)); return t * t * (3 - 2 * t)


def grid(pts, colors, wrap=False):
    """pts[i][j] rows x cols of Vector, colors same shape of RGBA; quads between rows."""
    vs = [[bm.verts.new(p) for p in row] for row in pts]
    n = len(vs[0]); m = n if wrap else n - 1
    for a, b, ca, cb in zip(vs, vs[1:], colors, colors[1:]):
        for j in range(m):
            k = (j + 1) % n
            try: f = bm.faces.new((a[j], a[k], b[k], b[j]))
            except ValueError: continue
            for lp, c in zip(f.loops, (ca[j], ca[k], cb[k], cb[j])): lp[col] = (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, c[3]); lp[glow] = c[3]  # authored sRGB, stored linear
    return vs


def curve(az, length, bend0, bend1, n=24, p=2.0, origin=Vector()):
    """planar arc in the vertical plane at azimuth az; heading starts bend0 deg from +Z, ends bend1 (>90 = pointing down)."""
    d = Vector((cos(az), sin(az), 0)); pts = [Vector(origin)]; ang = []
    for i in range(n):
        t = i / (n - 1); a = radians(bend0 + (bend1 - bend0) * t ** p); ang.append(a)
        if i: pts.append(pts[-1] + (d * sin(a) + Vector((0, 0, cos(a)))) * (length / (n - 1)))
    return pts, ang, d


def tube(pts, ang, d, r0, r1, color_fn, k=6):
    rows, cols = [], []
    for i, (p, a) in enumerate(zip(pts, ang)):
        t = i / (len(pts) - 1); r = r0 + (r1 - r0) * t
        T = d * sin(a) + Vector((0, 0, cos(a))); S = T.cross(Vector((d.y, -d.x, 0)).normalized() * -1 if False else Vector((-d.y, d.x, 0))).normalized()
        B = Vector((-d.y, d.x, 0))
        rows.append([p + (B * cos(2 * pi * j / k) + S * sin(2 * pi * j / k)) * r for j in range(k)])
        cols.append([color_fn(t)] * k)
    grid(rows, cols, wrap=True)


GREEN = (0.16, 0.42, 0.10, 0); DGREEN = (0.08, 0.28, 0.08, 0); LGREEN = (0.45, 0.65, 0.18, 0)


def bell(tip, d, ang_end, L, R, seed=0):
    """bell hanging from tip; axis follows the stem's end heading (pointing down). Rim flares into 5 petal lobes."""
    a = radians(ang_end); T = d * sin(a) + Vector((0, 0, cos(a)))
    ax = T.normalized(); B = Vector((-d.y, d.x, 0)); S = ax.cross(B).normalized()
    rows, cols = [], []; N = 20; U = 10
    lilac = (0.50, 0.38, 0.82, 0); orchid = (0.72, 0.45, 0.86, 0); peach = (1.0, 0.62, 0.52, 0); cream = (1.0, 0.80, 0.55, 0)
    for i in range(U + 1):
        u = i / U
        for_r = R * (0.12 + 0.62 * sin(u * pi * 0.5) ** 0.9 * (1 - 0.25 * u) + 0.45 * u ** 4)  # round shoulder, flared mouth
        row, crow = [], []
        for j in range(N):
            th = 2 * pi * j / N + seed
            lobe = cos(5 * th)
            r = for_r * (1 + 0.10 * lobe * u ** 3)
            along = L * u + 0.06 * L * max(0, lobe) * u ** 4  # petal tips a little longer
            flare = 0.0
            row.append(tip + ax * along + (B * cos(th) + S * sin(th)) * r + ax * (-0.05 * L * u ** 5 * 0))
            c = lerp(lilac, orchid, sm(u * 1.5)); c = lerp(c, peach, sm((u - 0.6) * 2.5) * (0.4 + 0.6 * max(0, lobe)))
            glow = sm((u - 0.08) * 6) * (1 - sm((u - 0.94) * 14))
            c = lerp(c, cream, glow * 0.12 * sm((u - 0.3) * 3))
            crow.append((c[0], c[1], c[2], glow))
        rows.append(row); cols.append(crow)
    grid(rows, cols, wrap=True)
    # calyx cap + sepals
    rs = [[tip + ax * (-0.02 * L * (1 - s)) + (B * cos(2 * pi * j / 8) + S * sin(2 * pi * j / 8)) * (R * 0.22 * (0.4 + 0.6 * s)) for j in range(8)] for s in (0, 0.5, 1)]
    grid([[tip - ax * 0.03 * L + (B * cos(2 * pi * j / 8) + S * sin(2 * pi * j / 8)) * R * 0.1 for j in range(8)]] + [[p + ax * 0.08 * L * k for p in rs[1]] for k in (0.6,)] + [[p + ax * 0.2 * L for p in rs[2]]],
         [[GREEN] * 8] * 3, wrap=True)
    # clapper and stamens: glowing filaments with bead tips (the dripping lights in night.png)
    for k in range(5):
        th = 2 * pi * k / 5 + seed; off = (B * cos(th) + S * sin(th)) * R * (0.0 if k == 0 else 0.22)
        top = tip + ax * L * 0.25; bot = tip + ax * L * (1.3 if k == 0 else 1.1 + 0.07 * (k % 3)) + off
        rows = []; cl = []
        for s in (0, 0.5, 1):
            c0 = top + (bot - top) * s; rr = R * 0.026 * (1.2 - 0.3 * s)
            rows.append([c0 + (B * cos(2 * pi * j / 4) + S * sin(2 * pi * j / 4)) * rr for j in range(4)])
            cl.append([(1.0, 0.85, 0.45, 1.0)] * 4)
        grid(rows, cl, wrap=True)
        bead = [[bot + ax * R * 0.04 * z + (B * cos(2 * pi * j / 4) + S * sin(2 * pi * j / 4)) * R * 0.07 * w for j in range(4)] for z, w in ((0, 0.3), (1, 1), (3, 0.9), (5, 0.1))]
        grid(bead, [[(1.0, 0.9, 0.5, 1.0)] * 4] * 4, wrap=True)


def leaf(az, base, length, width, lift, droop):
    d = Vector((cos(az), sin(az), 0)); rows, cols = [], []; n = 9
    for i in range(n):
        t = i / (n - 1)
        p = Vector(base) + d * (length * t) + Vector((0, 0, lift * sin(pi * min(t, 1) * 0.6) * length - droop * t * t * length))
        w = width * sin(pi * (0.15 + 0.85 * t) ** 0.9) * (1 - 0.3 * t) if t < 1 else 0
        w = max(w, 0.003); side = Vector((-d.y, d.x, 0))
        rows.append([p - side * w + Vector((0, 0, w * 0.5)), p + Vector((0, 0, -w * 0.08)), p + side * w + Vector((0, 0, w * 0.5))])
        c = lerp(DGREEN, LGREEN, t * 0.6); mid = lerp(c, (0.6, 0.78, 0.35, 0), 0.5)
        cols.append([c, mid, c])
    grid(rows, cols)


# main stem: up, then arching over to point down; thick base
pts, ang, d = curve(radians(10), 4.6, 2, 172, n=30, p=4.0)
tube(pts, ang, d, 0.045, 0.02, lambda t: lerp(GREEN, LGREEN, t * 0.5))
tip0 = pts[-1]
bell(tip0, d, 172, 0.8, 0.55, 0.0)
# side stalks: peel off the stem at different heights, each arching to a smaller bell
side = [(0.72, 2.3, 0.42, 150, 0.17, 175), (0.62, -1.5, 0.36, 140, 0.14, 1.0), (0.5, 1.2, 0.32, 130, 0.13, 2.0)]
for t0, azo, ln, e, br, _ in side[:3]:
    i = int(t0 * (len(pts) - 1)); base = pts[i]
    azs = radians(10) + azo
    sp, sa, sd = curve(azs, ln * 3.2, 55, 178, n=14, p=1.8, origin=base)
    tube(sp, sa, sd, 0.012, 0.008, lambda t: GREEN, k=5)
    bell(sp[-1], sd, 178, ln * 1.3, br * 2.4, azo)
# leaves round the foot
for k, (az, ln, w, lift, dr) in enumerate([(0.3, 1.9, 0.26, 0.6, 0.6), (1.9, 1.6, 0.22, 0.55, 0.6), (3.4, 1.8, 0.26, 0.55, 0.5), (4.7, 1.4, 0.2, 0.5, 0.55), (5.6, 1.2, 0.18, 0.55, 0.5)]):
    leaf(az, (0, 0, 0.05 + 0.25 * k / 5), ln, w, lift, dr)
# small stem leaves
for t, az in ((0.25, 2.2), (0.4, 5.0)):
    leaf(az, pts[int(t * 29)], 0.8, 0.1, 0.3, 0.35)

me = bpy.data.meshes.new("bellflower"); bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new("bellflower", me); bpy.context.collection.objects.link(ob)
m = bpy.data.materials.new("bellflower"); m.use_nodes = True; m.use_backface_culling = False
nt = m.node_tree; b = nt.nodes["Principled BSDF"]
a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "Col"
nt.links.new(a.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.6
me.materials.append(m)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
dg = bpy.context.evaluated_depsgraph_get(); ob.data.calc_loop_triangles()
bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
print("BELLFLOWER height %.2f m, width %.2f m, triangles %d" % (max(v.z for v in bb), max(v.x for v in bb) - min(v.x for v in bb), len(me.loop_triangles)))
os.makedirs(out_dir, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "bellflower.glb"), export_format='GLB', use_selection=True,
                          export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True, export_apply=True, export_attributes=True)
if "--render" in argv:
    out = argv[argv.index("--render") + 1]
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.view_settings.view_transform = 'Standard'; sc.render.resolution_x = 900; sc.render.resolution_y = 1100
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.6, -9, 2.0); cam.rotation_euler = (radians(88), 0, 0); cam.data.lens = 40
    w = bpy.data.worlds.new("w"); w.use_nodes = True; sc.world = w
    dark = "--dark" in argv
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.03, 0.03, 0.1, 1) if dark else (0.7, 0.8, 0.95, 1)
    if dark:  # glow: show alpha mask as emission
        nt.links.new(a.outputs["Alpha"], b.inputs["Emission Strength"]); nt.links.new(a.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Base Color"].default_value = (0.02, 0.03, 0.05, 1); [nt.links.remove(l) for l in list(nt.links) if l.to_socket == b.inputs["Base Color"]]
        b.inputs["Emission Strength"].default_value = 3
    else:
        s = bpy.data.lights.new("s", 'SUN'); s.energy = 4; so = bpy.data.objects.new("s", s); so.rotation_euler = (radians(50), 0, radians(30)); sc.collection.objects.link(so)
    # 1.8 m hero stand-in
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=1.8, location=(-1.3, -1.0, 0.9))
    sc.render.filepath = out; bpy.ops.render.render(write_still=True)
