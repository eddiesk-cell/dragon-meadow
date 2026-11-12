"""The Rime Warden's fixes the generic rig pipeline cannot make (Blender on the Mac Studio, see build.sh).

  fix   <full.glb> <out.glb>   the icicles under the arms ride the arm (the autorig took them for a hanging skirt and
                               pinned them to the hips: they stretched into blades); the pinnacle crown rides upperChest
                               rigidly (BESTIARY route +R); the head sunk in the crown keeps HEADKEEP of each clip's turn.
  mask  <glb> <png>            front + side of the rest pose: crown red, repaired icicles green -- check the masks by eye.
  sheet <glb> <png>            every clip at 1/4, 1/2 and 3/4 of its length, front view, one contact sheet.
"""
import bpy, sys, numpy as np
from mathutils import Quaternion, kdtree

a = sys.argv[sys.argv.index("--") + 1:]
MODE, SRC, OUT = a
HEADKEEP = 0.25   # the face sits boxed in the rigid crown: it keeps a quarter of the borrowed head turn
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
me = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
M = np.array(me.matrix_world)
V = np.array([v.co for v in me.data.vertices]) @ M[:3, :3].T + M[:3, 3]
H = np.ptp(V[:, 2])
x, y, z = (V[:, 0] - V[:, 0].mean()) * 1.8 / H, V[:, 1] * 1.8 / H, (V[:, 2] - V[:, 2].min()) * 1.8 / H  # 1.80 m rig frame
names = [g.name for g in me.vertex_groups]
W = np.zeros((len(V), len(names)))
for v in me.data.vertices:
    for g in v.groups:
        W[v.index, g.group] = g.weight
W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
ARMB = ("UpperArm", "LowerArm", "Hand", "Thumb", "Index", "Middle", "Ring", "Little")


def armw(side):
    return W[:, [i for i, n in enumerate(names) if n.startswith(side) and any(p in n for p in ARMB)]].sum(1)


def masks():
    # out past the shoulder everything is arm; what the arms do not own there is the icicles the autorig mistook for cloth
    icicle = np.zeros(len(V), bool); donor = {}
    for side, s in (("left", 1), ("right", -1)):
        out = s * x > 0.55
        aw = armw(side)
        icicle |= out & (aw < 0.95)
        donor[side] = np.flatnonzero(out & (aw > 0.999))
    # the crown: every pinnacle above the shoulder line, but not the face under the brow, and not what an arm carries
    face = (np.abs(x) < 0.14) & (y < -0.08) & (z < 1.50)
    aw = armw("left") + armw("right")
    crown = np.clip((z - 1.44) / 0.04, 0, 1) * ~face * (1 - aw) * (np.abs(x) < 0.55)
    return icicle, donor, crown


icicle, donor, crown = masks()
print(f"MASK icicles {icicle.sum()} (left {(icicle & (x > 0)).sum()}, right {(icicle & (x < 0)).sum()}), "
      f"crown {(crown > 0.5).sum()} of {len(V)}")

if MODE == "fix":
    up = names.index("upperChest")
    P = np.c_[x, y, z]
    for side in ("left", "right"):
        kd = kdtree.KDTree(len(donor[side]))
        for j, i in enumerate(donor[side]):
            kd.insert(P[i], j)
        kd.balance()
        bad = np.flatnonzero(icicle & ((x > 0) if side == "left" else (x < 0)))
        for i in bad:
            W[i] = W[donor[side][kd.find(P[i])[1]]]
    W = (1 - crown)[:, None] * W; W[:, up] += crown
    for v in me.data.vertices:                    # rewrite each vertex's groups: 4 strongest, normalised
        i = v.index; top = np.argsort(W[i])[-4:]; top = top[W[i, top] > 0.01]; tot = W[i, top].sum()
        for j in [g.group for g in v.groups]:      # indices first: removing invalidates the live group elements
            me.vertex_groups[j].remove([i])
        for j in top:
            me.vertex_groups[j].add([i], float(W[i, j] / tot), "REPLACE")
    acts = list(bpy.data.actions)
    for act in acts:
        cs = [c for layer in act.layers for st in layer.strips for bag in st.channelbags for c in bag.fcurves]
        for bone in ("neck", "head"):
            q = {c.array_index: c for c in cs if c.data_path == f'pose.bones["{bone}"].rotation_quaternion'}
            for i in range(len(q[0].keyframe_points)):
                r = Quaternion().slerp(Quaternion([q[k].keyframe_points[i].co[1] for k in range(4)]), HEADKEEP)
                for k in range(4):
                    q[k].keyframe_points[i].co[1] = r[k]
            for c in q.values():
                c.update()
    ad = arm.animation_data or arm.animation_data_create()   # one NLA track per clip, as retarget.py exports them
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for act in acts:
        tr = ad.nla_tracks.new(); tr.name = act.name
        st = tr.strips.new(act.name, int(act.frame_range[0]), act); st.action_slot = act.slots[0]
    ad.action = None
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animation_mode="NLA_TRACKS")
    print("FIX wrote", OUT, len(acts), "clips:", ", ".join(x.name for x in acts))
    raise SystemExit

sc = bpy.context.scene; sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"
w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"
k = H / 1.8
if MODE == "mask":
    col = me.data.color_attributes.new("mask", "FLOAT_COLOR", "POINT")
    c = np.c_[0.35 + 0.65 * crown, 0.35 + 0.65 * icicle - 0.3 * crown, 0.35 - 0.3 * crown - 0.3 * icicle, np.ones(len(V))]
    col.data.foreach_set("color", np.clip(c, 0, 1).ravel()); me.data.color_attributes.active_color = col
    sc.display.shading.color_type = "VERTEX"
    if arm.animation_data:
        arm.animation_data.action = None
        for tr in arm.animation_data.nla_tracks:
            tr.mute = True
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    sc.render.resolution_x, sc.render.resolution_y = 1800, 900
    cam.data.ortho_scale = 3.7 * k
    for tag, loc, rz in (("", (V[:, 0].mean(), -10, V[:, 2].min() + 0.9 * k), 0), ("-side", (10, 0, V[:, 2].min() + 0.9 * k), np.pi / 2)):
        cam.location = loc; cam.rotation_euler = (np.pi / 2, 0, rz)
        sc.render.filepath = OUT.replace(".png", tag + ".png"); bpy.ops.render.render(write_still=True)
elif MODE == "sheet":
    import os, tempfile
    sc.display.shading.color_type = "TEXTURE"
    from mathutils import Vector
    T = 450; sc.render.resolution_x = sc.render.resolution_y = T
    cam.data.ortho_scale = 3.6
    aim = Vector((0, 0, 0.9)); cam.location = aim + Vector((2.4, -4.6, 1.2))   # front three-quarter, a little high
    cam.rotation_euler = (aim - cam.location).to_track_quat("-Z", "Y").to_euler()
    ad = arm.animation_data
    for tr in ad.nla_tracks:
        tr.mute = True
    tmp = tempfile.mkdtemp(); tiles = []
    for act in sorted(bpy.data.actions, key=lambda x: x.name):
        ad.action = act; ad.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        for q in (0.25, 0.5, 0.75):
            sc.frame_set(int(f0 + q * (f1 - f0)))
            p = os.path.join(tmp, f"{len(tiles)}.png"); sc.render.filepath = p; bpy.ops.render.render(write_still=True)
            tiles.append((act.name, p))
    import subprocess
    subprocess.run([os.path.expanduser("~/dm-rig/venv/bin/python"), "-c", f"""
from PIL import Image, ImageDraw
t = {tiles!r}; n = len(t) // 3; o = Image.new('RGB', (3 * {T}, {T} * n), (60, 60, 64)); d = ImageDraw.Draw(o)
for i, (name, p) in enumerate(t):
    o.paste(Image.open(p), ((i % 3) * {T}, (i // 3) * {T}))
    if i % 3 == 0: d.text((6, (i // 3) * {T} + 6), name, fill=(255, 255, 120))
o.save({OUT!r})"""], check=True)
    print("SHEET wrote", OUT, len(tiles) // 3, "clips")
