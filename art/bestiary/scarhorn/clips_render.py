"""Contact sheet: every clip of a rigged glb at 3 moments (20/50/80 % through), seen from the front-left, textured.
  blender -b -P clips_render.py -- full.glb out_dir     -> out_dir/clip_<n>_<k>.png (tiled by the caller)"""
import bpy, sys, math, os
a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); arm.animation_data_create()
for t in arm.animation_data.nla_tracks:
    t.mute = True
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
sc.render.resolution_x = sc.render.resolution_y = 420
w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.5
cam.location = (-4.2, -4.2, 1.0); cam.rotation_euler = (math.radians(88), 0, math.radians(-45))
for n, act in enumerate(sorted(bpy.data.actions, key=lambda x: x.name)):
    arm.animation_data.action = act; arm.animation_data.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    for k, u in enumerate((0.2, 0.5, 0.8)):
        sc.frame_set(int(f0 + (f1 - f0) * u))
        sc.render.filepath = os.path.join(out, f"clip_{n}_{k}.png"); bpy.ops.render.render(write_still=True)
    print("CLIP", n, act.name, int(f0), int(f1))
