# blender -b -P overlay.py -- <rig.glb> <mesh.glb> <out_prefix> s tx ty tz [view cy cz ortho half]
# The mesh (textured, scaled s and moved t) over the rig's bones (red sticks) in rest pose. view: side (from +X), lside (from
# -X), front, top; cy cz centre the frame, ortho its width in metres; half = l|r keeps only that side's mesh and bones.
# Writes <out>-<view>.png and <out>-<view>.json (frame mapping for grid.py, which draws a 0.1 m grid with labels).
import bpy, sys, json
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
rig_glb, mesh_glb, out = a[:3]
s, tx, ty, tz = map(float, a[3:7])
view = a[7] if len(a) > 7 else 'side'
cy, cz, ortho = map(float, a[8:11]) if len(a) > 10 else (0, 1.1, 5.2)
half = a[11] if len(a) > 11 else ''
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=rig_glb)
for o in list(bpy.data.objects):
    if o.type == 'MESH': bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); arm.data.pose_position = 'REST'
bpy.ops.import_scene.gltf(filepath=mesh_glb)
ms = [o for o in bpy.data.objects if o.type == 'MESH']
for o in ms:
    if o.scale[0] == 1 and s != 1: o.scale = (s, s, s); o.location = (tx, ty, tz)
bpy.context.view_layer.update()
if half:
    import bmesh
    for o in ms:
        bm = bmesh.new(); bm.from_mesh(o.data); mw = o.matrix_world
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if ((mw @ v.co).x > 0.02) == (half == 'l')], context='VERTS')
        bm.to_mesh(o.data); bm.free()
red = bpy.data.materials.new('red'); red.use_nodes = True
img = bpy.data.images.new('red', 1, 1); img.pixels = [1, 0, 0, 1]
red.node_tree.nodes.new('ShaderNodeTexImage').image = img # workbench TEXTURE mode shows only textures
for b in arm.data.bones:
    h, t = arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local
    if half and abs(h.x) > 0.05 and (h.x < 0) != (half == 'l'): continue
    d = t - h
    bpy.ops.mesh.primitive_cylinder_add(radius=0.006 * ortho / 5.2 * 2, depth=d.length, location=(h + t) / 2)
    c = bpy.context.object; c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = d.to_track_quat('Z', 'Y'); c.data.materials.append(red)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012 * ortho / 5.2 * 2, location=h); bpy.context.object.data.materials.append(red)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_xray = True; sc.display.shading.xray_alpha = 0.6
W, H = 1400, 1000
sc.render.resolution_x, sc.render.resolution_y = W, H
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
c = Vector((0, cy, cz))
d, up = {'side': ((1, 0, 0), (0, 0, 1)), 'lside': ((-1, 0, 0), (0, 0, 1)), 'front': ((0, -1, 0), (0, 0, 1)), 'top': ((0, 0, 1), (0, -1, 0))}[view]
d, up = Vector(d), Vector(up)
cam.location = c + d * 10
right = (-d).cross(up)
cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler() if view != 'top' else Vector((0, 0, 3.14159265)).to_tuple()
bpy.context.view_layer.update()
right, upv = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)), cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
sc.render.filepath = f'{out}-{view}.png'; bpy.ops.render.render(write_still=True)
json.dump({'centre': list(c), 'right': list(right), 'up': list(upv), 'mpp': ortho / W, 'W': W, 'H': H}, open(f'{out}-{view}.json', 'w'))
