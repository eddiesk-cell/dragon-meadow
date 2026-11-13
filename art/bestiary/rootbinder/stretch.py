"""Worst bark stretch per clip of a rigged glb: at every frame each edge's length over its rest length. A spike or a tear
shows as edges past 3x; a bend at a joint stays under about 2x.   blender -b -P stretch.py -- in.glb"""
import bpy, sys, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[sys.argv.index("--") + 1])
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
body = next(o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() == arm)
ad = arm.animation_data
for t in ad.nla_tracks: t.mute = True
E = np.empty(len(body.data.edges) * 2, np.int64); body.data.edges.foreach_get("vertices", E); E = E.reshape(-1, 2)


def lengths():
    global C
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    c = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", c); ev.to_mesh_clear()
    C = c.reshape(-1, 3) @ np.array(body.matrix_world)[:3, :3].T + np.array(body.matrix_world)[:3, 3]
    return np.linalg.norm(C[E[:, 0]] - C[E[:, 1]], axis=1)


ad.action = None
for pb in arm.pose.bones: pb.matrix_basis.identity()
bpy.context.view_layer.update()
L0 = lengths()
V0 = np.array([v.co for v in body.data.vertices])
G = [body.vertex_groups[max(v.groups, key=lambda g: g.weight).group].name if v.groups else "-" for v in body.data.vertices]
keep = L0 > 0.2 * np.median(L0)        # a sliver edge doubles from a hair's move: not a tear
sc = bpy.context.scene
for act in sorted(bpy.data.actions, key=lambda a: a.name):
    ad.action = act; ad.action_slot = act.slots[0]
    worst, peak = np.zeros(len(L0)), (0, 0, None)
    for f in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1):
        sc.frame_set(f); r = np.where(keep, lengths() / np.maximum(L0, 1e-9), 0); worst = np.maximum(worst, r)
        if r.max() > peak[0]:
            peak = (r.max(), f, C[E[r.argmax()]].mean(0).round(2))
    w = worst[keep]
    bad = E[keep][w > 3][:, 0]                          # where: the bones leading the torn edges, and their rest height
    names, n = np.unique([G[i] for i in bad], return_counts=True)
    top = ", ".join(f"{a} {b}" for b, a in sorted(zip(n, names), reverse=True)[:4])
    print(f"STRETCH {act.name}: worst {w.max():.2f}x, edges past 2x {(w > 2).sum()}, past 3x {(w > 3).sum()} of {keep.sum()}"
          f" -- past 3x led by {top or 'none'}; worst at f{peak[1]} near {peak[2]}")
