"""Stand every clip of a rigged glb on its feet: one constant hips lift per clip, so the lowest foot point over the clip
sits where the rest pose's does. The borrowed clips move the hips by hip height alone, and with these legs Idle and Walk
sank 17 mm while the fighting stances floated up to 68 mm. Run after pose_offset (the foot offsets move the heel).
  blender -b -P ground.py -- in.glb out.glb"""
import bpy, sys
import numpy as np
from mathutils import Vector

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
body = next(o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() == arm)  # not the importer's bone shape
FEET = ("leftFoot", "leftToes", "rightFoot", "rightToes")
FOOT = [v.index for v in body.data.vertices for g in v.groups if g.weight > 0.5 and body.vertex_groups[g.group].name in FEET]
assert len(FOOT) > 40, len(FOOT)
M = np.array(body.matrix_world)


def low():
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co)
    z = float((co.reshape(-1, 3)[FOOT] @ M[2, :3]).min() + M[2, 3])
    ev.to_mesh_clear()
    return z


ad = arm.animation_data
for t in ad.nla_tracks:
    t.mute = True
ad.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
floor = low()
up = (arm.matrix_world.to_3x3() @ arm.data.bones["hips"].matrix_local.to_3x3()).inverted() @ Vector((0, 0, 1))

acts = list(bpy.data.actions)
for act in acts:
    ad.action = act; ad.action_slot = act.slots[0]
    f0, f1 = map(int, act.frame_range)
    zs = []
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f); zs.append(low())
    dz = floor - min(zs)
    fcs = {c.array_index: c for layer in act.layers for strip in layer.strips for bag in strip.channelbags
           for c in bag.fcurves if c.data_path == 'pose.bones["hips"].location'}
    assert len(fcs) == 3, f"{act.name}: hips has {len(fcs)} location curves"
    for i, c in fcs.items():
        for k in c.keyframe_points:
            k.co.y += up[i] * dz; k.handle_left.y += up[i] * dz; k.handle_right.y += up[i] * dz
    print(f"GROUND {act.name}: hips {dz * 1000:+.1f} mm")

# One NLA track per clip, as tools/monster/pose_offset.py writes them.
ad.action = None
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
for act in acts:
    t = ad.nla_tracks.new(); t.name = act.name
    s = t.strips.new(act.name, int(act.frame_range[0]), act); s.action_slot = act.slots[0]
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animation_mode="NLA_TRACKS")
print("GROUND wrote", out, len(acts), "clips")
