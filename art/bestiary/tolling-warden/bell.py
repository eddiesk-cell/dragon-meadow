"""The Tolling Warden's bell, after the generic rig (BESTIARY route +R +S; run in Blender on the Mac Studio, see build.sh).
  blender -b -P bell.py -- <full.glb> <out.glb>
- The bell is one rigid piece on `head`: every vertex above the tilted rim and inside its radius (rig frame, 1.80 m),
  with a 2 cm blend into the stone just under the rim. The auto weights split the rim over neck, upperChest and the
  shoulders, so it bent when the arms rose.
- The clapper (its own loose piece inside the mouth) hangs on one bone, `spring_clapper_0`, parented to `head`.
- A bell cannot nod like a man's head: each clip keeps HEADKEEP of its neck/head turn (Hit and Stagger threw it 60 deg off
  the shoulders; the Idle tipped it back). Hit and Stagger still threw the whole chest back and the bell 62 deg off rest
  (tilt.py), so there the spine, chest and upperChest keep 40 % of their turn and the neck/head 10 % (hips alone tilt it 15).
"""
import bpy, sys, numpy as np
from mathutils import Quaternion

HEADKEEP = 0.3
HIT = {"spine": 0.4, "chest": 0.4, "upperChest": 0.4, "neck": 0.1, "head": 0.1}
HITKEEP = {"Hit (Front)": HIT, "Stagger": HIT}
src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
me = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
M = np.array(me.matrix_world)
V = np.array([v.co for v in me.data.vertices]) @ M[:3, :3].T + M[:3, 3]
x, y, z = V[:, 0], V[:, 1], V[:, 2] - V[:, 2].min()
ss = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))

# the clapper: the one loose piece (the mesh is split along UV seams, so weld by position before walking edges)
_, g = np.unique(np.round(V, 5), axis=0, return_inverse=True); g = g.ravel()
e = np.empty(len(me.data.edges) * 2, np.int32); me.data.edges.foreach_get("vertices", e)
p = np.arange(g.max() + 1)
def root(i):
    while p[i] != i:
        p[i] = p[p[i]]; i = p[i]
    return i
for a, b in g[e.reshape(-1, 2)]:
    ra, rb = root(a), root(b)
    if ra != rb: p[ra] = rb
r = np.array([root(i) for i in g]); ids, n = np.unique(r, return_counts=True)
clap = r == ids[np.argsort(n)[-2]]                            # second-largest piece
assert 50 < clap.sum() < 2000 and abs(x[clap].mean()) < 0.05, f"clapper not found ({clap.sum()} verts)"

# the bell: above the rim (front lip z 1.37, back lip 1.26: the bell tips its mouth forward) and inside its 0.34 m radius
rim = 1.315 - 0.175 * y
bell = ss((z - rim + 0.02) / 0.02) * ss((0.38 - np.hypot(x, y)) / 0.04) * ~clap

names = [gr.name for gr in me.vertex_groups]
W = np.zeros((len(V), len(names)))
for v in me.data.vertices:
    for gw in v.groups: W[v.index, gw.group] = gw.weight
W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
W = (1 - bell)[:, None] * W; W[:, names.index("head")] += bell
cg = me.vertex_groups.new(name="spring_clapper_0"); names.append(cg.name)
W = np.c_[W, np.zeros(len(V))]; W[clap] = 0; W[clap, -1] = 1
for v in me.data.vertices:                                    # each vertex: 4 strongest groups, normalised
    i = v.index; top = np.argsort(W[i])[-4:]; top = top[W[i, top] > 1e-4]; tot = W[i, top].sum()
    for gw in list(v.groups): me.vertex_groups[gw.group].remove([i])
    for j in top: me.vertex_groups[j].add([i], float(W[i, j] / tot), "REPLACE")
print(f"BELL rigid on head: {(bell > 0.99).sum()} verts (+{((bell > 0.01) & (bell < 0.99)).sum()} blended); clapper {clap.sum()}")

# the clapper bone: from inside the bell's mouth down through the ball
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones; hb = eb["head"]
c = V[clap]; inv = np.linalg.inv(np.array(arm.matrix_world))
to_arm = lambda q: (inv @ np.r_[q, 1])[:3]
b = eb.new("spring_clapper_0"); b.parent = hb
b.head = to_arm([c[:, 0].mean(), c[:, 1].mean(), V[:, 2].min() + 1.40]); b.tail = to_arm([c[:, 0].mean(), c[:, 1].mean(), c[:, 2].min()])
bpy.ops.object.mode_set(mode="OBJECT")

acts = list(bpy.data.actions)
for act in acts:
    cs = [cv for layer in act.layers for st in layer.strips for bag in st.channelbags for cv in bag.fcurves]
    for bone, kp in ({"neck": HEADKEEP, "head": HEADKEEP} | HITKEEP.get(act.name, {})).items():
        q = {cv.array_index: cv for cv in cs if cv.data_path == f'pose.bones["{bone}"].rotation_quaternion'}
        assert len(q) == 4, f"{act.name}: {bone} has {len(q)} rotation curves"
        for i in range(len(q[0].keyframe_points)):
            rq = Quaternion().slerp(Quaternion([q[k].keyframe_points[i].co[1] for k in range(4)]), kp)
            for k in range(4): q[k].keyframe_points[i].co[1] = rq[k]
        for cv in q.values(): cv.update()
ad = arm.animation_data or arm.animation_data_create()       # one NLA track per clip, as retarget.py exports them
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
for act in acts:
    tr = ad.nla_tracks.new(); tr.name = act.name
    st = tr.strips.new(act.name, int(act.frame_range[0]), act); st.action_slot = act.slots[0]
ad.action = None
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animation_mode="NLA_TRACKS")
print("BELL wrote", out, len(acts), "clips")
