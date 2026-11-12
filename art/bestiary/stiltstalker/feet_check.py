"""Are the Stiltstalker's feet flat in Idle? Lowest front-toe and back-toe z (m) of the deformed mesh, per foot.
  blender -b -P feet_check.py -- full.glb [Idle] [1 10 24 40]
Front toes = foot vertices ahead of the ankle (toward the beak), back toe = behind it. Flat = both within ~2 cm of 0.
"""
import bpy, sys
args = sys.argv[sys.argv.index("--") + 1:]
src, clip = args[0], (args[1] if len(args) > 1 else "Idle")
frames = [int(f) for f in args[2:]] or [1, 10, 24, 40]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]  # not the bone-shape icosphere
ad = arm.animation_data
for t in ad.nla_tracks:
    t.mute = True
act = bpy.data.actions[clip]
ad.action = act; ad.action_slot = act.slots[0]

def verts(frame):
    if frame is not None:
        bpy.context.scene.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    out = []
    for o in meshes:
        e = o.evaluated_get(dg); m = e.to_mesh()
        out += [e.matrix_world @ v.co for v in m.vertices]
        e.to_mesh_clear()
    return out

arm.data.pose_position = "REST"
rest = verts(None)
arm.data.pose_position = "POSE"
fwd = -1 if min(rest, key=lambda v: v.y if v.z > 1.3 else 9).y < 0 else 1  # the beak points to fwd*Y
# rest ankle y per side, from the foot bones
ank = {s: (arm.matrix_world @ arm.data.bones[f"{s}Foot"].head_local).y for s in ("left", "right")}
sets = {}
for i, v in enumerate(rest):
    if v.z < 0.10:
        s = "left" if v.x > 0 else "right"
        d = (v.y - ank[s]) * fwd
        if d > 0.04: sets.setdefault((s, "front"), []).append(i)
        elif d < -0.04: sets.setdefault((s, "back"), []).append(i)
rows = [("rest", rest)] + [(f, verts(f)) for f in frames]
for f, vs in rows:
    print("FEET", clip, f, "  ".join(f"{s[0]}{k[0]}={min(vs[i].z for i in ix):.3f}" for (s, k), ix in sorted(sets.items())))
