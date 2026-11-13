"""Feet flat in a clip: per foot, over every frame, the lowest toe point (front 12% of the foot) and lowest heel point (rear
half: the rearmost sliver is the heel's rounded back, which rises as the foot tilts) above the rest floor, and the foot's
pitch against the rest pose (the foot->toes bone line, degrees; + = toes up).
  blender -b -P feet.py -- rootbinder.glb Idle"""
import bpy, sys, math, numpy as np

src, clip = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); ad = arm.animation_data
me = next(o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() == arm)
names = [g.name for g in me.vertex_groups]
W = np.zeros((len(me.data.vertices), len(names)))
for v in me.data.vertices:
    for g in v.groups:
        W[v.index, g.group] = g.weight
feet = {s: W[:, [i for i, n in enumerate(names) if n in (s + "Foot", s + "Toes")]].sum(1) > 0.5 for s in ("left", "right")}
M = np.array(me.matrix_world)


def verts():
    ev = me.evaluated_get(bpy.context.evaluated_depsgraph_get()); m = ev.to_mesh()
    c = np.empty(len(m.vertices) * 3); m.vertices.foreach_get("co", c); ev.to_mesh_clear()
    return c.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]


def P(b):
    return np.array(arm.matrix_world @ arm.pose.bones[b].head)


def toe_heel():
    V = verts(); out = []
    for s, m in feet.items():
        F = V[m]; fwd = P(s + "Toes") - P(s + "Foot"); fwd[2] = 0; fwd /= np.linalg.norm(fwd)
        t = F @ fwd; lo, hi = np.quantile(t, [0.5, 0.88]); d = P(s + "Toes") - P(s + "Foot")
        out.append((F[t > hi, 2].min(), F[t < lo, 2].min(), math.degrees(math.atan2(d[2], math.hypot(d[0], d[1])))))
    return out


for t in ad.nla_tracks:
    t.mute = True
ad.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
REST = toe_heel(); floor = min(verts()[feet["left"] | feet["right"], 2])
for s, r in zip(("left", "right"), REST):
    print(f"FEET rest {s}: toe {r[0] - floor:.3f} heel {r[1] - floor:.3f} bone {r[2]:+.1f} deg")
act = bpy.data.actions[clip]; ad.action = act; ad.action_slot = act.slots[0]
rows = []
for f in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1):
    bpy.context.scene.frame_set(f)
    rows.append([(r[0] - floor, r[1] - floor, r[2] - r0[2]) for r, r0 in zip(toe_heel(), REST)])
R = np.array(rows)   # frame, side, (toe, heel, pitch)
for i, s in enumerate(("left", "right")):
    print(f"FEET {clip} {s}: toe {R[:, i, 0].min():.3f}..{R[:, i, 0].max():.3f} heel {R[:, i, 1].min():.3f}..{R[:, i, 1].max():.3f}"
          f" gap {np.abs(R[:, i, 0] - R[:, i, 1]).max():.3f} m pitch {R[:, i, 2].min():+.1f}..{R[:, i, 2].max():+.1f} deg")
