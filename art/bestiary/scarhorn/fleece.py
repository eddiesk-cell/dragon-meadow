"""Scarhorn's weight fix, run on the clipped glb: the autorig reads the icicle fringe hanging under the forearms as a
garment panel and gives it to the thighs, so in every clip a fringe strand stretches from the hand down to the leg.
Out on the arms (rest |x| > 0.6, above the hips) only that side's arm bones may hold a vertex.
And the moss hump behind the horns sits on the head bone, so when the head bows (Hit, Stagger) the crease between skull
and hump tears open: behind the horns (rest y > 0.05) the head's weight hands over to the neck, fully by y = 0.30.
  blender -b -P fleece.py -- in.glb out.glb"""
import bpy, sys, numpy as np
from mathutils import kdtree

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
me = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
M = np.array(me.matrix_world)
V = np.array([v.co[:] for v in me.data.vertices]) @ M[:3, :3].T + M[:3, 3]
G = {g.index: g.name for g in me.vertex_groups}
PARTS = ("Shoulder", "UpperArm", "LowerArm", "Hand", "Thumb", "Index", "Middle", "Ring", "Little")
own = lambda n, x: n.startswith("left" if x > 0 else "right") and any(p in n for p in PARTS)

zone = (np.abs(V[:, 0]) > 0.6) & (V[:, 2] > 0.75)
clean, bad = [], []
for i in map(int, np.flatnonzero(zone)):
    gs = me.data.vertices[i].groups
    (bad if any(g.weight > 0 and not own(G[g.group], V[i, 0]) for g in gs) else clean).append(i)
kd = kdtree.KDTree(len(clean))
for k, i in enumerate(clean):
    kd.insert(V[i], k)
kd.balance()
nn = 0
for i in bad:
    v = me.data.vertices[i]
    keep = {G[g.group]: g.weight for g in v.groups if own(G[g.group], V[i, 0]) and g.weight > 0}
    if sum(keep.values()) < 0.05:         # all leg: take the nearest clean arm vertex's weights
        j = clean[kd.find(V[i])[1]]; nn += 1
        keep = {G[g.group]: g.weight for g in me.data.vertices[j].groups if g.weight > 0}
    for gi in [g.group for g in v.groups]:   # read the indices first: removing invalidates v.groups
        me.vertex_groups[gi].remove([i])
    s = sum(keep.values())
    for n, w in keep.items():
        me.vertex_groups[n].add([i], w / s, 'REPLACE')
assert len(clean) > 1000, "arm zone empty: the rest pose is not a T-pose"
print(f"FLEECE {len(bad)} arm-fringe vertices back on the arm, {nn} of them from the nearest clean one ({len(clean)} were clean)")

hd, nk = me.vertex_groups["head"], me.vertex_groups["neck"]
moved = 0
for i in map(int, np.flatnonzero((V[:, 2] > 1.3) & (V[:, 1] > 0.05))):
    w = next((g.weight for g in me.data.vertices[i].groups if g.group == hd.index), 0.0)
    if w > 0:
        k = min((V[i, 1] - 0.05) / 0.25, 1.0) * w           # the share that moves to the neck
        hd.add([i], w - k, 'REPLACE'); nk.add([i], k, 'ADD'); moved += 1
print(f"FLEECE {moved} hump vertices eased from head to neck")

# One NLA track per clip, as pose_offset.py exports them.
ad = arm.animation_data or arm.animation_data_create()
acts = list(bpy.data.actions)
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
for act in acts:
    t = ad.nla_tracks.new(); t.name = act.name
    s = t.strips.new(act.name, int(act.frame_range[0]), act); s.action_slot = act.slots[0]
ad.action = None
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animation_mode="NLA_TRACKS")
print("FLEECE wrote", out, len(acts), "clips")
