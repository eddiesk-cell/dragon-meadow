"""One contact sheet of every clip in a rigged glb: two frames per clip (40 % and 75 % through), seen from the front
three-quarter, textured, each tile labelled -- the check that every clip plays and nothing tears.
  blender -b -P clips_render.py -- full.glb $PWD/sheet.png && venv/bin/python clips_render.py --sheet $PWD/sheet.png
"""
import sys, math, json
a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
if a[0] == "--sheet":                      # python clips_render.py --sheet sheet.png  (after the Blender pass)
    from PIL import Image, ImageDraw
    tiles = json.load(open(a[1] + ".json")); o = Image.new("RGB", (400 * 4, 400 * ((len(tiles) + 3) // 4)))
    for i, (p, label) in enumerate(tiles):
        o.paste(Image.open(p).convert("RGB"), (400 * (i % 4), 400 * (i // 4)))
        ImageDraw.Draw(o).text((400 * (i % 4) + 8, 400 * (i // 4) + 8), label, fill=(255, 255, 0))
    o.save(a[1]); sys.exit()
import bpy
src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); ad = arm.animation_data or arm.animation_data_create()
for t in ad.nla_tracks: t.mute = True
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
sc.render.resolution_x, sc.render.resolution_y = 400, 400
w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.9
cam.location = (3.5, -5.0, 1.0); cam.rotation_euler = (math.pi / 2, 0, math.radians(35))
tiles = []
for act in sorted(bpy.data.actions, key=lambda x: x.name):
    ad.action = act; ad.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    for p in (0.4, 0.75):
        f = int(f0 + p * (f1 - f0)); sc.frame_set(f)
        sc.render.filepath = f"{out}.{len(tiles):02d}.png"; bpy.ops.render.render(write_still=True)
        tiles.append((sc.render.filepath, f"{act.name}  f{f}"))
    print(f"CLIPS {act.name}: frames {f0:.0f}-{f1:.0f}")
json.dump(tiles, open(out + ".json", "w"))   # Blender's python has no PIL: the venv tiles them (--sheet, above)
