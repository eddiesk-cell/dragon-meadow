"""How far the bell tips: worst tilt of the `head` bone's up axis off rest (world vertical) per clip, with the spine chain's
local turn at that frame; then front + side renders of the worst frame of each named clip (the check for bell.py's damping).
  blender -b -P tilt.py -- in.glb [out_prefix "Hit (Front)" "Stagger"]   -> TILT lines, <out_prefix>.<clip>.<front|side>.png
"""
import bpy, sys, math
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]; src, out, show = a[0], (a[1:2] or [None])[0], a[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); ad = arm.animation_data or arm.animation_data_create()
for t in ad.nla_tracks: t.mute = True
sc = bpy.context.scene; head = arm.pose.bones["head"]
rest = (arm.matrix_world @ head.bone.matrix_local).to_3x3().inverted()
CHAIN = ("hips", "spine", "chest", "upperChest", "neck", "head")

def tilt():
    up = (arm.matrix_world @ head.matrix).to_3x3() @ rest @ Vector((0, 0, 1))
    return math.degrees(up.angle(Vector((0, 0, 1))))

def play(act, f):
    ad.action = act; ad.action_slot = act.slots[0]; sc.frame_set(f)

worst = {}
for act in bpy.data.actions:
    f0, f1 = map(int, act.frame_range)
    worst[act.name] = max((play(act, f) or tilt(), f) for f in range(f0, f1 + 1))
    play(act, worst[act.name][1])
    turns = " ".join(f"{b} {math.degrees(arm.pose.bones[b].rotation_quaternion.angle):.0f}" for b in CHAIN)
    print(f"TILT {act.name!r}: {worst[act.name][0]:.1f} deg at frame {worst[act.name][1]}  ({turns})")

if out and show:
    sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "TEXTURE"; sc.display.shading.light = "STUDIO"
    sc.render.resolution_x = sc.render.resolution_y = 900
    w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.6
    for name in show:
        act = bpy.data.actions[name]; play(act, worst[name][1])
        for view, loc, rot in [("front", (0, -6, 0.9), (math.pi / 2, 0, 0)), ("side", (6, 0, 0.9), (math.pi / 2, 0, math.pi / 2))]:
            cam.location = loc; cam.rotation_euler = rot
            sc.render.filepath = f"{out}.{name}.{view}.png"; bpy.ops.render.render(write_still=True)
