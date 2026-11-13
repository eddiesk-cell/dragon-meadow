# blender -b -P rest_render.py -- <dragon.glb> <out_prefix>: the dragon's body in its rig's rest pose, plain grey on white,
# 3/4 front and side — the pose a new concept must be drawn in so the new mesh binds to the same skeleton.
import bpy, sys, math
from mathutils import Vector
glb, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for o in bpy.data.objects:
    if o.type == 'ARMATURE': o.data.pose_position = 'REST'
    if o.type == 'MESH' and not o.name.startswith('winter-dragon-body') and not o.name.startswith('winter-dragon-mouth'): o.hide_render = True
grey = bpy.data.materials.new('grey'); grey.use_nodes = True
grey.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.55, 0.55, 1)
grey.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
for o in bpy.data.objects:
    if o.type == 'MESH': o.data.materials.clear(); o.data.materials.append(grey)
body = bpy.data.objects['winter-dragon-body']
bpy.context.view_layer.update()
pts = [body.matrix_world @ v.co for v in body.data.vertices]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
c = (lo + hi) / 2; R = (hi - lo).length
print('BBOX', [round(v, 2) for v in lo], [round(v, 2) for v in hi])
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc.view_settings.view_transform = 'Standard'
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.7, 0.2, 0.6); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
for name, d in (('quarter', Vector((1.0, -1.1, 0.45))), ('side', Vector((1, 0, 0.08))), ('front', Vector((0, -1, 0.15)))):
    cam.location = c + d.normalized() * R * 1.25
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}-{name}.png'; bpy.ops.render.render(write_still=True)
