"""Front + side orthographic render of a rigged glb's Idle (frame 10), textured, one sheet — the check that hanging
arms clear the body and the head looks ahead.   blender -b -P idle_render.py -- in.glb out.png"""
import bpy, sys, math
a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); arm.animation_data_create()
for t in arm.animation_data.nla_tracks: t.mute = True
act = next(x for x in bpy.data.actions if x.name.startswith("Idle"))
arm.animation_data.action = act; arm.animation_data.action_slot = act.slots[0]
sc = bpy.context.scene; sc.frame_set(10)
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
sc.render.resolution_x, sc.render.resolution_y = 900, 900
w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.3
for name, loc, rot in [("front", (0, -6, 0.95), (math.pi / 2, 0, 0)), ("side", (6, 0, 0.95), (math.pi / 2, 0, math.pi / 2))]:
    cam.location = loc; cam.rotation_euler = rot
    sc.render.filepath = f"{out}.{name}.png"; bpy.ops.render.render(write_still=True)
