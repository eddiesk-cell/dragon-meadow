"""Hands against the ground, every clip of a rigged glb: per frame the lowest point of each hand (skin led by the hand or
a finger bone) above the floor (the rest pose's lowest foot point, which ground.py puts on the plinth). Prints per clip
the lowest over the clip and the mean, in mm at rig scale and in cm at the gallery's 4.0 m (x2.22); BELOW = a hand more
than 2 cm (gallery) under the floor.
With an out.glb: in every clip but Idle (its reach is the arm length, long_arms.py) and Death (ground.py lays the body on
the floor), a hand that dips under the floor gets its upper arm swung out (about the armature's Y, as pose_offset's
arm offsets) by one constant angle for that clip, the least that keeps it above (bisected); then the clips are written
back as NLA tracks.
  blender -b -P hands.py -- rootbinder.glb [out.glb]"""
import bpy, sys, math, numpy as np
from mathutils import Quaternion, Vector

a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); ad = arm.animation_data
me = next(o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() == arm)
names = [g.name for g in me.vertex_groups]
lead = [names[max(v.groups, key=lambda g: g.weight).group] if v.groups else "" for v in me.data.vertices]
FING = ("Thumb", "Index", "Middle", "Ring", "Little")
hand = {s: np.array([n == s + "Hand" or (n.startswith(s) and any(f in n for f in FING)) for n in lead]) for s in ("left", "right")}
foot = np.array([n in ("leftFoot", "rightFoot", "leftToes", "rightToes") for n in lead])
assert min(m.sum() for m in hand.values()) > 20 and foot.sum() > 20, ({s: int(m.sum()) for s, m in hand.items()}, int(foot.sum()))
M = np.array(me.matrix_world); GAL = 4.0 / 1.8; sc = bpy.context.scene


def z():
    ev = me.evaluated_get(bpy.context.evaluated_depsgraph_get()); m = ev.to_mesh()
    c = np.empty(len(m.vertices) * 3); m.vertices.foreach_get("co", c); ev.to_mesh_clear()
    return c.reshape(-1, 3) @ M[2, :3] + M[2, 3]


def sweep(act):   # frames x (left, right): each hand's lowest point above the floor, metres
    ad.action = act; ad.action_slot = act.slots[0]; out = []
    for f in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1):
        sc.frame_set(f); Z = z() - floor; out.append([Z[hand["left"]].min(), Z[hand["right"]].min()])
    return np.array(out)


def report(act, R):
    R = R * 1000; lo = R.min()
    print(f"HANDS {act.name}: lowest L {R[:, 0].min():+.0f} R {R[:, 1].min():+.0f} mm (gallery {lo * GAL / 10:+.1f} cm),"
          f" mean L {R[:, 0].mean():+.0f} R {R[:, 1].mean():+.0f} mm{'  BELOW' if lo * GAL < -20 else ''}")


def keys(act, bone):
    q = {c.array_index: c for layer in act.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves
         if c.data_path == f'pose.bones["{bone}"].rotation_quaternion'}
    assert len(q) == 4, (act.name, bone)
    return q, np.array([[k.co[1] for k in q[i].keyframe_points] for i in range(4)])


def set_out(act, side, deg, base):   # the clip's own keys turned out by deg (left: -Y, right: +Y), as pose_offset does
    bone = side + "UpperArm"; q, _ = keys(act, bone)
    L = Quaternion(arm.data.bones[bone].matrix_local.to_quaternion().inverted() @ Vector((0, 1, 0)), math.radians(deg * (-1 if side == "left" else 1)))
    for j in range(base.shape[1]):
        r = L @ Quaternion(base[:, j])
        for i in range(4):
            q[i].keyframe_points[j].co[1] = r[i]


for t in ad.nla_tracks:
    t.mute = True
ad.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
floor = z()[foot].min()
acts = sorted(bpy.data.actions, key=lambda x: x.name)
for act in acts:
    R = sweep(act)
    if len(a) > 1 and act.name != "Idle" and not act.name.startswith("Death"):
        for k, side in enumerate(("left", "right")):
            if R[:, k].min() >= 0.002:
                continue
            _, base = keys(act, side + "UpperArm"); lo, hi = 0.0, 40.0
            for _ in range(7):   # least swing (to 0.3 deg) that lifts this hand 2 mm clear over the whole clip
                mid = (lo + hi) / 2; set_out(act, side, mid, base)
                lo, hi = (mid, hi) if sweep(act)[:, k].min() < 0.002 else (lo, mid)
            set_out(act, side, hi, base)
            print(f"HANDS {act.name}: {side} upper arm out {hi:.1f} deg (hand was {R[:, k].min() * 1000:+.0f} mm)")
        R = sweep(act)
    report(act, R)
if len(a) > 1:
    ad.action = None
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for act in acts:
        t = ad.nla_tracks.new(); t.name = act.name
        s = t.strips.new(act.name, int(act.frame_range[0]), act); s.action_slot = act.slots[0]
    bpy.ops.export_scene.gltf(filepath=a[1], export_format="GLB", export_animation_mode="NLA_TRACKS")
    print("HANDS wrote", a[1], len(acts), "clips")
