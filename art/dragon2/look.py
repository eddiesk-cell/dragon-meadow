# blender -b -P look.py -- <mesh.glb> <out_prefix>: textured mesh in the rest-render cameras (quarter, side, front).
import bpy, sys
from mathutils import Vector
glb, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.context.view_layer.update()
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
print('MESHES', [(o.name, len(o.data.vertices), len(o.data.polygons)) for o in ms], 'BBOX', [round(v, 3) for v in lo], [round(v, 3) for v in hi])
c = (lo + hi) / 2; R = (hi - lo).length
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
sc.view_settings.view_transform = 'Standard'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
for name, d in (('x+', Vector((1, 0, 0.1))), ('y-', Vector((0, -1, 0.1))), ('x-', Vector((-1, 0, 0.1))), ('y+', Vector((0, 1, 0.1)))):
    cam.location = c + d.normalized() * R * 1.2
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}-{name}.png'; bpy.ops.render.render(write_still=True)
