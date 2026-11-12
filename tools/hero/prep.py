"""Clean a generated character mesh for the rigger: one mesh, no loose specks, web-sized, 1.80 m, feet on 0.
  blender -b -P tools/hero/prep.py -- <in.glb> <out.glb> [target_tris=60000]
Prints the counts it changed, so a silent no-op is visible.
"""
import bpy, bmesh, sys

args = sys.argv[sys.argv.index("--") + 1:]
src, out = args[:2]
target = int(args[2]) if len(args) > 2 else 60000
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
ob = bpy.context.object
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Drop loose shells under 0.5% of the vertices: a speck no bone reaches makes the rigger give up.
bm = bmesh.new(); bm.from_mesh(ob.data)
bm.verts.ensure_lookup_table()
seen, shells = set(), []
for v in bm.verts:
    if v.index in seen: continue
    stack, shell = [v], []
    seen.add(v.index)
    while stack:
        u = stack.pop(); shell.append(u)
        for e in u.link_edges:
            w = e.other_vert(u)
            if w.index not in seen:
                seen.add(w.index); stack.append(w)
    shells.append(shell)
n = len(bm.verts)
drop = [v for s in shells if len(s) < 0.005 * n for v in s]
bmesh.ops.delete(bm, geom=drop, context="VERTS")
bm.to_mesh(ob.data); bm.free()
print(f"PREP shells {len(shells)}, dropped {len(drop)} verts in {sum(len(s) < 0.005 * n for s in shells)} specks")

tris0 = sum(len(p.vertices) - 2 for p in ob.data.polygons)
if tris0 > target:
    m = ob.modifiers.new("dec", "DECIMATE"); m.ratio = target / tris0
    bpy.ops.object.modifier_apply(modifier="dec")
tris1 = sum(len(p.vertices) - 2 for p in ob.data.polygons)

# 1.80 m tall, feet at z = 0, centred on x/y.
zs = [v.co.z for v in ob.data.vertices]; xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]
h = max(zs) - min(zs); k = 1.80 / h
for v in ob.data.vertices:
    v.co.x = (v.co.x - (max(xs) + min(xs)) / 2) * k
    v.co.y = (v.co.y - (max(ys) + min(ys)) / 2) * k
    v.co.z = (v.co.z - min(zs)) * k
print(f"PREP tris {tris0} -> {tris1}, height {h:.3f} -> 1.80, width {(max(xs) - min(xs)) * k:.2f} m (T-pose span)")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False)
