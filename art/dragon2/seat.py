# blender -b -P art/dragon2/seat.py -- public/models/dragon.glb public/models/hero.glb art/dragon2/seat
# The hero in Ride Idle with his hips on `rider-seat`, as ride.js puts him, at game scale (dragon x3, rest pose); renders
# <out>-{side,quarter,head,chase}.png (chase = ride.js's camera: behind and above) and prints the saddle under his hips.
import bpy, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
dr, he, out = sys.argv[sys.argv.index('--') + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=dr)
darm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); darm.data.pose_position = 'REST'
for o in bpy.data.objects:
    if o.parent is None: o.scale = (3, 3, 3)
old = {o.name for o in bpy.data.objects}
bpy.ops.import_scene.gltf(filepath=he)
for o in [o for o in bpy.data.objects if o.name.startswith('Icosphere')]: bpy.data.objects.remove(o)  # importer's bone shapes
new = [o for o in bpy.data.objects if o.name not in old]
harm = next(o for o in new if o.type == 'ARMATURE')
act = next(a for a in bpy.data.actions if a.name.startswith('Ride Idle'))
harm.animation_data_create(); harm.animation_data.action = act
if act.slots: harm.animation_data.action_slot = act.slots[0]
bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
seat = bpy.data.objects['rider-seat'].matrix_world.translation.copy()
d = seat - harm.matrix_world @ harm.pose.bones['hips'].head
for o in new:
    if o.parent is None: o.location += d
bpy.context.view_layer.update()
body = bpy.data.objects['dragon2-body'] if 'dragon2-body' in bpy.data.objects else next(o for o in bpy.data.objects if 'body' in o.name)
bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get()); inv = body.matrix_world.inverted()
hit = bvh.ray_cast(inv @ (seat + Vector((0, 0, 0.6))), Vector((0, 0, -1)))   # from his chest down: the saddle under his hips
hd = harm.matrix_world @ harm.pose.bones['head'].center; near = body.matrix_world @ bvh.find_nearest(inv @ hd)[0]
print('SEAT hips', [round(x, 3) for x in seat], 'saddle under them', round((body.matrix_world @ hit[0]).z - seat.z, 3), 'm above the hips;',
      'head centre to the nearest dragon surface (the mane)', round((near - hd).length, 3), 'm; head centre from hips', [round(x, 3) for x in hd - seat])
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 1000, 800
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.78, 0.82, 1)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (0.7, 0.2, 0.9); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
for name, off, aim, ortho in (('side', (6, 0, 0.4), (0, 0, 0.3), 3.2), ('quarter', (4.5, 3.5, 2.5), (0, 0, 0.3), 3.2),
                              ('head', (2.2, -0.6, 0.9), (0, 0, 0.55), 1.4), ('chase', (0, 4.5, 2.8), (0, -12, 0.6), 0)):
    cam.location = seat + Vector(off); cam.rotation_euler = (seat + Vector(aim) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'ORTHO' if ortho else 'PERSP'; cam.data.ortho_scale = ortho or 1; cam.data.lens = 24
    sc.render.filepath = f'{out}-{name}.png'; bpy.ops.render.render(write_still=True)

# In every clip (the rider only ever sees it posed): the saddle under his hips, and his head's clearance from the dragon
# (mane, neck, wings), as ride.js seats him: hips on the seat, upright in the dragon's frame.
darm.data.pose_position = 'POSE'; hips0 = harm.pose.bones['hips']; hd0 = harm.pose.bones['head']
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.name not in {n.name for n in new}]
CLIPS = ('fly', 'hover', 'idle', 'idle_fire', 'idle_look', 'idle_roar', 'idle_shake', 'idle_wings', 'land', 'takeoff', 'walk')
for act in [bpy.data.actions[n] for n in CLIPS]:
    darm.animation_data.action = act
    if act.slots: darm.animation_data.action_slot = act.slots[0]
    f0, f1 = act.frame_range; worst = (9, None); under = []
    for i in range(13):
        sc.frame_set(int(f0 + (f1 - f0) * i / 12)); bpy.context.view_layer.update()
        harm.animation_data.action = next(a for a in bpy.data.actions if a.name.startswith('Ride Idle'))
        s_ = bpy.data.objects['rider-seat'].matrix_world.translation; dd = s_ - harm.matrix_world @ hips0.head
        for o in new:
            if o.parent is None: o.location += dd
        bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); h = harm.matrix_world @ hd0.center
        for o in parts:
            t = BVHTree.FromObject(o, dg); iv = o.matrix_world.inverted(); n, _, fi, _ = t.find_nearest(iv @ h)
            if n is not None and (o.matrix_world @ n - h).length < worst[0]:   # which part: the face's rest centre and its main bone
                vg = max(o.data.vertices[o.data.polygons[fi].vertices[0]].groups, key=lambda g: g.weight, default=None)
                worst = ((o.matrix_world @ n - h).length, f'{o.name} rest {[round(x, 2) for x in o.data.polygons[fi].center]} '
                         f'{vg and o.vertex_groups[vg.group].name} f{sc.frame_current}')
        t = BVHTree.FromObject(body, dg); r = t.ray_cast(inv @ (s_ + Vector((0, 0, 0.6))), Vector((0, 0, -1)))
        under.append((body.matrix_world @ r[0]).z - s_.z if r[0] else None)
    u = [x for x in under if x is not None]
    print('CLIP', act.name, 'head clearance', round(worst[0], 3), 'm from', worst[1], '| saddle above hips', round(min(u), 3), '..', round(max(u), 3), 'm')
