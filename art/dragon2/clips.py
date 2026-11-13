# blender -b -P art/dragon2/clips.py -- <dragon.glb> <out_dir>: every clip at its two extremes (the frame furthest from the
# clip's mean pose, and the frame furthest from that), from two angles, plus the worst edge stretch per clip (posed edge
# length / rest edge length over every frame, every mesh). Writes <out_dir>/<clip>-<A|B>-<quarter|side>.png and stats.json.
import bpy, sys, json, os
import numpy as np
from mathutils import Vector
glb, out = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
sc = bpy.context.scene

def verts():
    dg = bpy.context.evaluated_depsgraph_get(); r = {}
    for o in meshes:
        e = o.evaluated_get(dg); m = e.to_mesh(); a = np.empty(len(m.vertices) * 3); m.vertices.foreach_get('co', a)
        r[o.name] = (np.array(e.matrix_world) @ np.c_[a.reshape(-1, 3), np.ones(len(m.vertices))].T).T[:, :3]; e.to_mesh_clear()
    return r
edges = {o.name: np.array([e.vertices[:] for e in o.data.edges]) for o in meshes}
arm.data.pose_position = 'REST'; bpy.context.view_layer.update()
rest = verts(); L0 = {k: np.linalg.norm(v[edges[k][:, 0]] - v[edges[k][:, 1]], axis=1) for k, v in rest.items()}
arm.data.pose_position = 'POSE'

sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = sc.render.resolution_y = 512
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1); sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.8
sc.view_settings.view_transform = 'Standard'
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.7, 0.2, 0.6); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
stats = {}
clips = [a for a in bpy.data.actions if not a.name.startswith('winter-dragon')]
for act in clips:
    arm.animation_data.action = act
    f0, f1 = map(int, act.frame_range); frames = list(range(f0, f1 + 1))
    poses, worst = [], {}
    for f in frames:
        sc.frame_set(f); vs = verts()
        poses.append(np.concatenate([np.array(pb.matrix.translation) for pb in arm.pose.bones] + [np.array(pb.tail) for pb in arm.pose.bones]))
        for k, v in vs.items():
            r = np.linalg.norm(v[edges[k][:, 0]] - v[edges[k][:, 1]], axis=1) / np.maximum(L0[k], 1e-5)
            i = int(r.argmax())
            if r[i] > worst.get(k, (0,))[0]: worst[k] = (float(r[i]), f, int(i))
    poses = np.array(poses); A = int(np.linalg.norm(poses - poses.mean(0), axis=1).argmax()); B = int(np.linalg.norm(poses - poses[A], axis=1).argmax())
    stats[act.name] = {'frames': [f0, f1], 'A': frames[A], 'B': frames[B], 'stretch': {k: round(v[0], 2) for k, v in worst.items()},
                       'worst': max(v[0] for v in worst.values()), 'worstAt': max(worst.items(), key=lambda kv: kv[1][0])[0]}
    print('CLIP', act.name, json.dumps(stats[act.name]))
    for tag, fi in (('A', frames[A]), ('B', frames[B])):
        sc.frame_set(fi); vs = np.concatenate(list(verts().values())); c = Vector(((vs.min(0) + vs.max(0)) / 2).tolist())
        for name, d in (('quarter', Vector((1.0, -1.1, 0.45))), ('side', Vector((1, 0, 0.08)))):
            cam.location = c + d.normalized() * 9.5; cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = f'{out}/{act.name}-{tag}-{name}.png'; bpy.ops.render.render(write_still=True)
json.dump(stats, open(f'{out}/stats.json', 'w'), indent=1)
print('WORST', max((s['worst'], k) for k, s in stats.items()))
