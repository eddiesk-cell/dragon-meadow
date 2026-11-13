# blender -b -P art/dragon2/build.py -- public/models/dragon-winter.glb public/models/dragon.glb
# dragon2: the winter dragon's 50-bone rig and clips, its wings moved from over the hind legs to the shoulders (parented
# to chest). Blender coords: +Z up, head at -Y.
import bpy, sys
from mathutils import Vector
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'): bpy.data.objects.remove(o) # the importer's bone-display shape
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for pb in arm.pose.bones: pb.custom_shape = None

# Wing roots: just behind and above the front-leg shoulder (fore-*-upper head y -1.22, z 1.0), on the back.
ROOT = Vector((0.22, -1.05, 1.28))
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
moves = {}
for side, sx in (('l', -1), ('r', 1)):
    old = eb[f'wing-{side}-shoulder'].head.copy()
    d = Vector((ROOT.x * sx, ROOT.y, ROOT.z)) - old
    moves[side] = d
    for b in [b for b in eb if b.name.startswith(f'wing-{side}-')]:
        b['h'], b['t'] = b.head + d, b.tail + d
    for b in [b for b in eb if b.name.startswith(f'wing-{side}-')]:
        b.head, b.tail = Vector(b['h']), Vector(b['t'])
        del b['h'], b['t']
    eb[f'wing-{side}-shoulder'].parent = eb['chest']
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.data.objects:
    for side in moves:
        if o.type == 'MESH' and o.name.startswith(f'wing-{side}-'):
            for v in o.data.vertices: v.co += o.matrix_world.inverted().to_3x3() @ moves[side]
print('WING MOVE', {k: [round(x, 3) for x in v] for k, v in moves.items()})
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='ACTIONS', export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=88, export_optimize_animation_size=True,
                          export_optimize_animation_keep_anim_armature=False)
