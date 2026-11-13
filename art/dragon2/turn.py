# blender -b -P art/dragon2/turn.py -- <dragon.glb> <out_prefix> [action frame]: the dragon textured, in its rig's rest pose
# (or in <action> at <frame>), from the rest_render.py cameras (quarter, side, front) plus top, soft daylight on white.
import bpy, sys
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
glb, out = a[:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if len(a) > 3:
    arm.animation_data.action = bpy.data.actions[a[2]]; bpy.context.scene.frame_set(int(a[3]))
else: arm.data.pose_position = 'REST'
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = 1024; sc.render.film_transparent = False
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.8
sc.view_settings.view_transform = 'Standard'
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.7, 0.2, 0.6); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
c, R = Vector((0, 0, 1.0)), 5.2 if len(a) <= 3 else 8.0
for name, d in (('quarter', Vector((1.0, -1.1, 0.45))), ('side', Vector((1, 0, 0.08))), ('front', Vector((0, -1, 0.15))), ('top', Vector((0.001, 0.2, 1)))):
    cam.location = c + d.normalized() * R * 1.25
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}-{name}.png'; bpy.ops.render.render(write_still=True)
