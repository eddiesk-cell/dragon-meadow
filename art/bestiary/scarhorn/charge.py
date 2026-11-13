"""Scarhorn's Kimodo ram_charge: the Kimodo BVH retargeted onto the rigged Scarhorn and exported as a skeleton-only glb
holding that one clip. The transfer is ~/ai-stack/kimodo/retarget/retarget.py (world delta + rest alignment) run as
is, cut before its render section. Then it is grounded and its feet locked (below). Root motion stays in: the
clip travels forward along glTF +Z.
  KIMODO_ADDUCT=0 blender -b -P charge.py -- full.glb motion.bvh out.glb"""
import bpy, os

RT = os.path.expanduser("~/ai-stack/kimodo/retarget/retarget.py")
code = open(RT).read().split("# ---------------- scene, light, camera, render")
assert len(code) == 2, "retarget.py changed: its render section marker is gone"
exec(compile(code[0], RT, "exec"))  # leaves the baked action `act` on the armature `tgt`, frames f0..f1 at 30 fps

import numpy as np
from mathutils import Vector
assert tgt.matrix_world.is_identity  # the hips moves below are in armature space, which is then world space
body = max(meshes, key=lambda o: len(o.data.vertices))
FOOT = [np.array([v.index for v in body.data.vertices for g in v.groups if g.weight > 0.5
                  and body.vertex_groups[g.group].name in (s + "Foot", s + "Toes")]) for s in ("left", "right")]
Mw = np.array(body.matrix_world)
floor = min((np.array([body.data.vertices[i].co[:] for i in ix]) @ Mw[:3, :3].T + Mw[:3, 3])[:, 2].min() for ix in FOOT)
hb = tgt.pose.bones["hips"]
Z, S, H = [], [], []  # per frame: each foot's lowest point above the rest floor, its ball, the hips' position
for f in range(f0, f1 + 1):
    scn.frame_set(f)
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); ev.to_mesh_clear()
    W = co.reshape(-1, 3) @ Mw[:3, :3].T + Mw[:3, 3]
    Z.append([W[ix, 2].min() - floor for ix in FOOT])
    S.append([tgt.pose.bones[b].head[:] for b in ("leftToes", "rightToes")])  # the ball of each foot
    H.append(hb.matrix.translation[:])
Z, H = np.array(Z), np.array(H); n = len(Z)
# Ground like tools/retarget.py's run mode: each foot meets the floor at its own dips, the hips' correction is
# interpolated between them so a stride's flight survives, and no foot is pushed through the floor. (The root came in
# scaled from Kimodo's first frame, a crouch, so contacts floated 5-13 cm.)
low = {0: Z[0].min(), n - 1: Z[-1].min()}
for k in (0, 1):
    for j in range(1, n - 1):
        if Z[j, k] <= Z[j - 1, k] and Z[j, k] < Z[j + 1, k] and Z[j, k] < Z[:, k].mean():
            low[j] = min(low.get(j, 9.0), Z[j, k])
drop = np.minimum(np.interp(np.arange(n), sorted(low), [low[j] for j in sorted(low)]), Z.min(1))
# The same crouch, and the Scarhorn's shorter legs, make the hips outrun the feet, so planted feet skate. Lock them: while
# a foot is in stance (its ball, once grounded, within 3 cm of its lowest and passing back under the body) the hips move
# exactly as far as it passes back, so it stays put; in flight they keep Kimodo's travel, scaled by the least-squares
# factor that best holds the stance feet still. (The ball, not the lowest skin: a rolling foot's contact patch travels
# heel to toe on its own.)
S = np.array(S); bz = S[:, :, 2] - drop[:, None]
h = H[:, :2] - H[0, :2]
dr, dh = np.diff(S[:, :, :2] - H[:, None, :2], axis=0), np.diff(h, axis=0)
fwd = h[-1] / np.linalg.norm(h[-1])
low_ = bz < bz.min(0) + 0.03
pl = low_[1:] & low_[:-1] & (dr @ fwd < 0)
assert pl.sum() > 10, f"only {pl.sum()} stance steps: the grounding found no contacts"
dh2 = dh[:, None].repeat(2, 1)
c = -(dr * dh2).sum(-1)[pl].sum() / (dh2 * dh2).sum(-1)[pl].sum()
step = np.array([-dr[j][pl[j]].mean(0) if pl[j].any() else c * dh[j] for j in range(n - 1)])
h = np.vstack([[0, 0], np.cumsum(step, 0)])
for j, f in enumerate(range(f0, f1 + 1)):
    scn.frame_set(f)
    m = hb.matrix.copy(); m.translation = Vector((H[0, 0] + h[j, 0], H[0, 1] + h[j, 1], H[j, 2] - drop[j]))
    hb.matrix = m; hb.keyframe_insert("location", frame=f)
print(f"RETARGET grounded at {len(low)} contacts: hips moved {-drop.max() * 100:+.0f}..{-drop.min() * 100:+.0f} cm; "
      f"{pl.any(1).sum()} of {n - 1} steps on a locked foot, flight travel x{c:.3f}; travel {np.linalg.norm(h[-1]):.2f} m")

act.name = "Kimodo: ram_charge"
ad = tgt.animation_data
t = ad.nla_tracks.new(); t.name = act.name
s = t.strips.new(act.name, f0, act); s.action_slot = act.slots[0]
ad.action = None
for o in meshes:  # the skin is not needed to carry the clip; merge.py joins it to the full glb by bone name
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animation_mode="NLA_TRACKS")
print("RETARGET wrote", OUT, f"{f1 - f0 + 1} frames at {scn.render.fps} fps")
