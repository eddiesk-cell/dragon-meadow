"""Lower (or raise) the whole body in one clip by moving the hips: the borrowed Idle stands the Stiltstalker's feet a
few cm above the ground once their pitch is corrected (pose_offset.py only turns bones, it cannot move them).
  blender -b -P drop.py -- in.glb out.glb Idle -0.03      (metres, armature Z = up)
"""
import bpy, sys
from mathutils import Vector

src, out, clip, dz = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
d = arm.data.bones["hips"].matrix_local.to_quaternion().inverted() @ Vector((0, 0, float(dz)))  # into the hips' rest frame
act = bpy.data.actions[clip]
loc = {c.array_index: c for layer in act.layers for strip in layer.strips for bag in strip.channelbags
       for c in bag.fcurves if c.data_path == 'pose.bones["hips"].location'}
assert len(loc) == 3, f"{clip}: hips has {len(loc)} location curves"
for k, c in loc.items():
    for p in c.keyframe_points:
        p.co[1] += d[k]; p.handle_left[1] += d[k]; p.handle_right[1] += d[k]
print(f"DROP {clip}: hips {float(dz):+.3f} m")

# One NLA track per clip, as pose_offset.py writes them.
ad = arm.animation_data
acts = list(bpy.data.actions)
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
for a in acts:
    t = ad.nla_tracks.new(); t.name = a.name
    s = t.strips.new(a.name, int(a.frame_range[0]), a); s.action_slot = a.slots[0]
ad.action = None
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animation_mode="NLA_TRACKS")
print("DROP wrote", out, len(acts), "clips")
