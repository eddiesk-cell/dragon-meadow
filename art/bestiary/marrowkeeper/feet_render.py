"""Feet close-up, rest pose vs Idle frame 10, front and side, green line = the floor (z=0): the check that the feet
stand flat on the ground.
  blender -b -P feet_render.py -- full.glb $PWD/feet.png && venv/bin/python feet_render.py --sheet $PWD/feet.png"""
import sys, math, json
a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
W, H, S, CZ = 1200, 400, 1.2, 0.15 # ortho: S metres across W px, camera at height CZ
FLOOR = round(H / 2 + CZ * W / S)  # pixel row of z = 0
if a[0] == "--sheet":                # Blender's python has no PIL: the venv tiles the four renders
    from PIL import Image, ImageDraw
    tiles = json.load(open(a[1] + ".json")); o = Image.new("RGB", (W * 2, H * 2))
    for i, (p, label) in enumerate(tiles):
        x, y = W * (i % 2), H * (i // 2)
        o.paste(Image.open(p).convert("RGB"), (x, y)); d = ImageDraw.Draw(o)
        d.line([(x, y + FLOOR), (x + W, y + FLOOR)], fill=(0, 255, 0)); d.text((x + 8, y + 8), label, fill=(255, 255, 0))
    o.save(a[1]); sys.exit()
import bpy
src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); ad = arm.animation_data
for t in ad.nla_tracks: t.mute = True
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
sc.render.resolution_x, sc.render.resolution_y = W, H
w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = S
idle = next(x for x in bpy.data.actions if x.name.startswith("Idle"))
tiles = []
for pose in ("rest", "idle"):
    if pose == "idle":
        ad.action = idle; ad.action_slot = idle.slots[0]; sc.frame_set(10)
    else:
        ad.action = None
        for pb in arm.pose.bones: pb.matrix_basis.identity()
        bpy.context.view_layer.update()
    for name, loc, rot in [("front", (0, -6, CZ), (math.pi / 2, 0, 0)), ("side", (6, 0, CZ), (math.pi / 2, 0, math.pi / 2))]:
        cam.location = loc; cam.rotation_euler = rot
        sc.render.filepath = f"{out}.{pose}.{name}.png"; bpy.ops.render.render(write_still=True)
        tiles.append((sc.render.filepath, f"{'REST' if pose == 'rest' else 'IDLE f10'} {name}  green = floor z=0, front of creature = left in side view"))
json.dump(tiles, open(out + ".json", "w"))
