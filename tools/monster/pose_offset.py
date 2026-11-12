"""Add a fixed rotation to bones in EVERY clip of a rigged glb — for bodies the borrowed human clips don't fit
(the troll's arms hang into his belly; his head tips back).
  blender -b -P tools/monster/pose_offset.py -- in.glb out.glb leftUpperArm=Y,-28 rightUpperArm=Y,28 head=X,12
Axis is in armature space (Blender: X = his left, Y = back, Z = up); degrees by the right-hand rule.
The offset turns the animated limb about that axis, through the bone's own rest frame, after the clip's rotation.
"""
import bpy, sys, math
from mathutils import Quaternion, Vector

args = sys.argv[sys.argv.index("--") + 1:]
src, out, specs = args[0], args[1], [s.split("=") for s in args[2:]]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
AX = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}
offsets = {}
for bone, v in specs:
    ax, deg = v.split(",")
    rest = arm.data.bones[bone].matrix_local.to_quaternion()
    offsets[bone] = Quaternion(rest.inverted() @ AX[ax], math.radians(float(deg)))

acts = list(bpy.data.actions)
for act in acts:
    curves = [c for layer in act.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
    for bone, L in offsets.items():
        q = {c.array_index: c for c in curves if c.data_path == f'pose.bones["{bone}"].rotation_quaternion'}
        assert len(q) == 4, f"{act.name}: {bone} has {len(q)} rotation curves"
        n = len(q[0].keyframe_points)
        assert all(len(c.keyframe_points) == n for c in q.values()), f"{act.name}: {bone} keys differ"
        for i in range(n):
            r = L @ Quaternion([q[k].keyframe_points[i].co[1] for k in range(4)])
            for k in range(4):
                q[k].keyframe_points[i].co[1] = r[k]
    print(f"OFFSET {act.name}: {', '.join(offsets)}")

# One NLA track per clip, as tools/retarget.py exports them.
ad = arm.animation_data or arm.animation_data_create()
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
for act in acts:
    t = ad.nla_tracks.new(); t.name = act.name
    s = t.strips.new(act.name, int(act.frame_range[0]), act); s.action_slot = act.slots[0]
ad.action = None
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animation_mode="NLA_TRACKS")
print("OFFSET wrote", out, len(acts), "clips")
