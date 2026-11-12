"""Textured front + side renders of a rigged glb at any clip:frame, over a ground plane, for spot checks by eye
(idle_render.py only does Idle 10).   blender -b -P sheet.py -- in.glb out_dir "Idle:40" "Walk:20" ...
-> out_dir/<n>.front.png, <n>.side.png, one pair per spec, in order (tile them with PIL)."""
import bpy, sys, math, os
a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); ad = arm.animation_data or arm.animation_data_create()
for t in ad.nla_tracks: t.mute = True
bpy.ops.mesh.primitive_plane_add(size=8)                  # the ground: a hand through the floor disappears into it
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
sc.render.resolution_x = sc.render.resolution_y = 400
w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = float(os.environ.get("ORTHO", 3.0))   # ORTHO=1.0 CZ=1.45: the bow
os.makedirs(out, exist_ok=True); CZ = float(os.environ.get("CZ", 1.0))
for n, spec in enumerate(a[2:]):
    clip, f = spec.split(":")
    act = next(x for x in bpy.data.actions if x.name.startswith(clip))
    ad.action = act; ad.action_slot = act.slots[0]; sc.frame_set(int(f))
    for view, loc, rot in [("front", (0, -6, CZ), (math.radians(88), 0, 0)), ("side", (6, 0, CZ), (math.radians(88), 0, math.pi / 2))]:
        cam.location = loc; cam.rotation_euler = rot      # 2 deg down, so the ground plane shows as a thin band
        sc.render.filepath = f"{out}/{n}.{view}.png"; bpy.ops.render.render(write_still=True)
