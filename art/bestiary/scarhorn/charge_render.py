"""The ram_charge seen from the side, and its feet measured. Floor = the lowest foot point over Idle (bestiary.js grounds
on Idle), so "sink" is how far a foot goes under the plinth. A foot is planted while its ball (toes joint) is within 3 cm
of its lowest; "back" is how far a planted ball moves against the charge (forward is glTF +Z, Blender -Y).
  blender -b -P charge_render.py -- scarhorn.glb out_dir [n_frames=6 [clip]]  -> out_dir/charge_<k>.png, FEET / SHOT lines"""
import bpy, sys, math, os
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]; src, out = a[0], a[1]; N = int(a[2]) if len(a) > 2 else 6
CLIP = a[3] if len(a) > 3 else "Kimodo: ram_charge"  # another clip: proves the feet check finds plants and slides
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); arm.animation_data_create()
for t in arm.animation_data.nla_tracks:
    t.mute = True
body = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
sc = bpy.context.scene
FOOT = {s: np.array([v.index for v in body.data.vertices for g in v.groups if g.weight > 0.5
                     and body.vertex_groups[g.group].name in (s + "Foot", s + "Toes")]) for s in ("left", "right")}
assert all(len(v) > 20 for v in FOOT.values()), {k: len(v) for k, v in FOOT.items()}

def use(name):
    act = bpy.data.actions[name]; arm.animation_data.action = act; arm.animation_data.action_slot = act.slots[0]
    return [int(f) for f in act.frame_range]

def world(f):
    sc.frame_set(f)
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    M = np.array(body.matrix_world); return co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]

i0, i1 = use("Idle")
floor = min(world(f)[FOOT[s], 2].min() for f in range(i0, i1 + 1, 4) for s in FOOT)
f0, f1 = use(CLIP)
low, sole, body_low = {s: [] for s in FOOT}, {s: [] for s in FOOT}, []
for f in range(f0, f1 + 1):
    W = world(f); body_low.append(W[:, 2].min() - floor)
    for s, ix in FOOT.items():
        low[s].append(W[ix, 2].min() - floor)
        sole[s].append((arm.matrix_world @ arm.pose.bones[s + "Toes"].head)[1:])  # the ball of the foot: y, z
fps = sc.render.fps
for s in FOOT:
    L, (Y, Zb) = np.array(low[s]), np.array(sole[s]).T
    planted = Zb < Zb.min() + 0.03; planted = planted[1:] & planted[:-1]  # the ball within 3 cm of its lowest
    dy = np.diff(Y) * planted; back, fwd = np.clip(dy, 0, None), np.clip(-dy, 0, None)  # +Y is backwards (charge runs -Y)
    print(f"FEET {s}: sink {-min(L.min(), 0) * 100:.1f} cm (lowest point {L.min() * 100:+.1f} cm); ball planted "
          f"{planted.sum()} of {len(planted)} steps, slides back {back.sum() * 100:.1f} cm (worst {back.max() * fps:.2f} m/s), "
          f"forward {fwd.sum() * 100:.1f} cm")
print(f"BODY lowest skin {min(body_low) * 100:+.1f} cm (frame {int(np.argmin(body_low))}): hands or fleece under the floor if negative")
hy = []
for f in range(f0, f1 + 1):
    sc.frame_set(f); hy.append(-(arm.matrix_world @ arm.pose.bones["hips"].head).y)
v = np.diff(hy) * fps
print(f"TRAVEL {hy[-1] - hy[0]:.2f} m forward in {(f1 - f0) / fps:.2f} s at {fps} fps; floor {floor * 100:+.1f} cm; "
      f"hips m/s every 4th frame: {' '.join(f'{x:.1f}' for x in v[::4])}; biggest jump {np.abs(np.diff(v)).max():.2f} m/s in a frame")

sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
sc.view_settings.exposure = 0.7  # the fleece is dark: lift it so the pose reads
sc.render.resolution_x, sc.render.resolution_y = 480, 440
w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -6, floor - 0.002)); bpy.context.object.scale = (3, 30, 1)
for k in range(-4, 30):  # a dark stud every half metre along the charge line: feet that slide show against them
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.9, 1 - k * 0.5, floor + 0.015)); bpy.context.object.scale = (0.06, 0.06, 0.03)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.9
cam.rotation_euler = (math.radians(80), 0, math.radians(-90))  # from his right, 10 deg down: the charge runs left to right
for k in range(N):
    f = round(f0 + (f1 - f0) * k / (N - 1)); sc.frame_set(f)
    hip = arm.matrix_world @ arm.pose.bones["hips"].head
    cam.location = (-6 * math.cos(math.radians(10)), hip.y, floor + 1.0 + 6 * math.sin(math.radians(10)))
    sc.render.filepath = os.path.join(out, f"charge_{k}.png"); bpy.ops.render.render(write_still=True)
    j = f - f0; a, b = max(j - 2, 0), min(j + 2, len(hy) - 1)
    print("SHOT", k, f, f"{(f - f0) / fps:.2f}s", f"{(hy[b] - hy[a]) / (b - a) * fps:.1f}m/s", f"hips {hip.z - floor:.2f} m up")
