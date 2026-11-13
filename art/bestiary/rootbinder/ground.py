"""Stand every clip of a rigged glb on its feet, each foot landing at least once, nothing through the floor. The borrowed
clips move the hips by hip height alone and bend legs of the donor's proportions, so with these short thighs and long
shins one foot of a stance can hover all clip (Hit and Stagger's back foot 77 mm) while the other is down.
- every clip but Death: the hips drop (or rise) one constant amount so the HIGHER foot's lowest point over the clip
  meets the floor; the other foot, now through the floor by p, is raised by p in every frame with two-bone IK (hip, knee,
  ankle; the foot keeps its own angle), which always reaches -- raising only bends the knee more.
- Death: the hips are moved frame by frame so the lowest point of the bony body is the floor (it falls and lies down).
  Bony = skin led by any bone but hips, spine, chest, shoulders and thighs: those carry the coat and cape, which are
  cloth -- grounded on them it would stand on its cape tips instead of kneeling.
Floor = the rest pose's lowest foot point. Run after pose_offset (the foot offsets move the heel).
  blender -b -P ground.py -- in.glb out.glb"""
import bpy, sys
import numpy as np
from mathutils import Vector, Matrix

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
body = next(o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() == arm)  # not the importer's bone shape
FOOT = [[v.index for v in body.data.vertices for g in v.groups if g.weight > 0.5 and body.vertex_groups[g.group].name in
         (side + "Foot", side + "Toes")] for side in ("left", "right")]
assert min(map(len, FOOT)) > 20, list(map(len, FOOT))
CLOTH = {"hips", "spine", "chest", "upperChest", "leftShoulder", "rightShoulder", "leftUpperLeg", "rightUpperLeg"}
BONY = [v.index for v in body.data.vertices if v.groups and
        body.vertex_groups[max(v.groups, key=lambda g: g.weight).group].name not in CLOTH]
assert arm.matrix_world == Matrix.Identity(4)   # pose space = world below
M = np.array(body.matrix_world)
sc = bpy.context.scene; ad = arm.animation_data; PB = arm.pose.bones


def low():
    """Lowest point of the left foot, of the right foot, of the bony body (world z)."""
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co)
    z = co.reshape(-1, 3) @ M[2, :3] + M[2, 3]
    ev.to_mesh_clear()
    return np.array([z[FOOT[0]].min(), z[FOOT[1]].min(), z[BONY].min()])


def curves(act, bone, prop):
    return {c.array_index: c for layer in act.layers for strip in layer.strips for bag in strip.channelbags
            for c in bag.fcurves if c.data_path == f'pose.bones["{bone}"].{prop}'}


def shift_hips(act, dz):
    """Move the hips up by dz[j] metres at key j (one key per frame in these clips)."""
    fcs = curves(act, "hips", "location")
    assert len(fcs) == 3 and len(fcs[0].keyframe_points) == len(dz), act.name
    for i, c in fcs.items():
        for k, d in zip(c.keyframe_points, dz):
            k.co.y += UP[i] * d; k.handle_left.y += UP[i] * d; k.handle_right.y += UP[i] * d


def raise_foot(act, side, p):
    """At the current frame, lift this side's ankle by p with the knee bending in the leg's own plane; keyed."""
    up, lo, ft = (PB[side + n] for n in ("UpperLeg", "LowerLeg", "Foot"))
    H, K, A = up.head.copy(), lo.head.copy(), ft.head.copy()
    Mu, Ml, Mf = up.matrix.to_quaternion(), lo.matrix.to_quaternion(), ft.matrix.to_quaternion()
    a, b, A2 = (K - H).length, (A - K).length, A + Vector((0, 0, p))
    c = min((A2 - H).length, a + b - 1e-5)
    u = (A2 - H).normalized()
    v = (K - H) - u * (K - H).dot(u)                                # toward the knee, in the plane hip-knee-new ankle
    if v.length < 1e-4:
        v = Vector((0, -1, 0)) - u * -u.y                               # a straight leg bends its knee forward
    v.normalize()
    x = (a * a - b * b + c * c) / (2 * c)
    K2 = H + u * x + v * (max(a * a - x * x, 0) ** 0.5); A2 = H + u * c
    r1 = (K - H).rotation_difference(K2 - H)
    r2 = (r1 @ (A - K)).rotation_difference(A2 - K2)
    qs = []
    for pb, m in ((up, Matrix.Translation(H) @ (r1 @ Mu).to_matrix().to_4x4()),
                  (lo, Matrix.Translation(K2) @ (r2 @ r1 @ Ml).to_matrix().to_4x4()),
                  (ft, Matrix.Translation(A2) @ Mf.to_matrix().to_4x4())):
        pb.matrix = m; bpy.context.view_layer.update()       # parent first: the child's local depends on it
        qs.append((pb, pb.rotation_quaternion.copy()))
    j = sc.frame_current - int(act.frame_range[0])
    for pb, q in qs:                                          # keys only now: editing one re-evaluates the clip
        fcs = curves(act, pb.name, "rotation_quaternion")
        if sum(fcs[i].keyframe_points[j].co.y * q[i] for i in range(4)) < 0:
            q.negate()                                                  # same hemisphere as the key, or it spins
        for i, fc in fcs.items():
            k = fc.keyframe_points[j]; d = q[i] - k.co.y
            k.co.y += d; k.handle_left.y += d; k.handle_right.y += d


def sweep(act):
    f0, f1 = map(int, act.frame_range)
    out = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f); out.append(low())
    return np.array(out)


for t in ad.nla_tracks:
    t.mute = True
ad.action = None
for pb in PB:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
floor = low()[:2].min()
UP = (arm.data.bones["hips"].matrix_local.to_3x3()).inverted() @ Vector((0, 0, 1))

acts = list(bpy.data.actions)
for act in acts:
    ad.action = act; ad.action_slot = act.slots[0]
    zs = sweep(act)
    if act.name.startswith("Death"):
        shift_hips(act, floor - zs[:, 2])
        note = f"hips {(floor - zs[:, 2]).min() * 1000:+.0f}..{(floor - zs[:, 2]).max() * 1000:+.0f} mm frame by frame"
    else:
        m = zs[:, :2].min(0)                           # each foot's lowest point over the clip
        shift_hips(act, [floor - m.max()] * len(zs))
        side, p = ("left", "right")[m.argmin()], m.max() - m.min()
        note = f"hips {(floor - m.max()) * 1000:+.0f} mm"
        if p > 0.002:
            for f in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1):
                sc.frame_set(f); raise_foot(act, side, p)
            note += f", {side} foot raised {p * 1000:.0f} mm by IK"
    lo = (sweep(act).min(0) - floor) * 1000
    print(f"GROUND {act.name}: {note}; lowest point over the clip: left foot {lo[0]:+.0f} mm, right {lo[1]:+.0f}, bony body {lo[2]:+.0f}")

# One NLA track per clip, as tools/monster/pose_offset.py writes them.
ad.action = None
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
for act in acts:
    t = ad.nla_tracks.new(); t.name = act.name
    s = t.strips.new(act.name, int(act.frame_range[0]), act); s.action_slot = act.slots[0]
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animation_mode="NLA_TRACKS")
print("GROUND wrote", out, len(acts), "clips")
