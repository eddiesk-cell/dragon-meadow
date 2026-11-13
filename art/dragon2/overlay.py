# blender -b -P overlay.py -- <rig.glb> <mesh.glb> <out_prefix> [s tx ty tz]: the mesh (textured, scaled s and moved t) over the
# rig's bones (red sticks) in rest pose, side / front / top — to see whether head, feet and tail sit on their bones.
import bpy, sys
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
rig_glb, mesh_glb, out = a[:3]
s, tx, ty, tz = (map(float, a[3:7]) if len(a) >= 7 else (1, 0, 0, 0))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=rig_glb)
for o in list(bpy.data.objects):
    if o.type == 'MESH': bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.data.pose_position = 'REST'
bpy.ops.import_scene.gltf(filepath=mesh_glb)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
for o in ms: o.scale = (s, s, s); o.location = (tx, ty, tz)
bpy.context.view_layer.update()
pts = [o.matrix_world @ v.co for o in ms for v in o.data.vertices]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
print('MESHBOX', [round(v, 3) for v in lo], [round(v, 3) for v in hi])
red = bpy.data.materials.new('red'); red.use_nodes = True
bs = red.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (1, 0, 0, 1)
bs.inputs['Emission Color'].default_value = (1, 0, 0, 1); bs.inputs['Emission Strength'].default_value = 5
for b in arm.data.bones:
    h, t = arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local
    d = t - h
    bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=d.length, location=(h + t) / 2)
    c = bpy.context.object; c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = d.to_track_quat('Z', 'Y'); c.data.materials.append(red)
    c.show_in_front = True
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=h); bpy.context.object.data.materials.append(red)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_xray = True; sc.display.shading.xray_alpha = 0.55
sc.render.resolution_x = 1400; sc.render.resolution_y = 900
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 5.2
c = Vector((0, 0, 1.1))
for name, d in (('side', Vector((1, 0, 0))), ('front', Vector((0, -1, 0))), ('top', Vector((0, 0, 1)))):
    cam.location = c + d * 10
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y' if name != 'top' else 'Y').to_euler()
    sc.render.filepath = f'{out}-{name}.png'; bpy.ops.render.render(write_still=True)
