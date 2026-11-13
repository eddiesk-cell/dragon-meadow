# blender -b -P clipsheet.py -- <rig.glb> <outdir> <Clip> [Clip...]: N frames of each clip, side + front, workbench.
import bpy, sys, math
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; glb, out, clips = a[0], a[1], a[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
print('CLIPS', sorted(x.name for x in bpy.data.actions))
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'; sc.render.resolution_x, sc.render.resolution_y = 360, 480
sc.world = bpy.data.worlds.new('w'); sc.world.color = (1, 1, 1)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.4
N = 8
for name in clips:
    act = next((x for x in bpy.data.actions if x.name.lower().startswith(name.lower())), None)
    if not act: print('MISSING', name); continue
    arm.animation_data.action = act
    f0, f1 = act.frame_range
    for i in range(N):
        f = f0 + (f1 - f0) * i / N; sc.frame_set(int(f), subframe=f % 1)
        hip = arm.matrix_world @ arm.pose.bones[0].head
        for view, d in (('side', Vector((1, 0, 0))), ('front', Vector((0, -1, 0)))):
            c = Vector((hip.x, hip.y, 0.95)); cam.location = c + d * 5
            cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = f'{out}/{name}-{view}-{i}.png'; bpy.ops.render.render(write_still=True)
    print('CLIP', name, f0, f1)
