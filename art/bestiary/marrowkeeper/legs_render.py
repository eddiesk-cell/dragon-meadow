"""Side view of the leg joints, coat and cape cut away: the check that hips, knees and ankles sit inside the bony leg at
rest and that the shins stay straight and hinge at the knee knob in motion. The cutaway keeps, on one side, the foot and
every vertex within 2 cm of the bony leg that fix_legs.py tracked up from the ankle (legs.json), carried up to the hip.
Camera at +X: the creature's front is LEFT. Green line = floor; magenta = left leg chain, cyan = right.
  blender -b -P legs_render.py -- full.glb legs.json $PWD/legs.png && venv/bin/python legs_render.py --sheet $PWD/legs.png"""
import sys, json, math
a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
W, S, CZ = 600, 1.3, 0.55  # ortho: S metres across W px (square), camera at height CZ
if a[0] == "--sheet":
    from PIL import Image, ImageDraw
    tiles = json.load(open(a[1] + ".json")); o = Image.new("RGB", (W * 3, W * ((len(tiles) + 2) // 3)))
    for i, (p, label, chains) in enumerate(tiles):
        x0, y0 = W * (i % 3), W * (i // 3)
        o.paste(Image.open(p).convert("RGB"), (x0, y0)); d = ImageDraw.Draw(o)
        d.line([(x0, y0 + W / 2 + CZ * W / S), (x0 + W, y0 + W / 2 + CZ * W / S)], fill=(0, 255, 0))
        for col, pts in zip(((255, 60, 255), (60, 255, 255)), chains):
            pts = [(x0 + u, y0 + v) for u, v in pts]
            d.line(pts, fill=col, width=2)
            for u, v in pts:
                d.ellipse([u - 5, v - 5, u + 5, v + 5], outline=(255, 255, 0), width=2)
        d.text((x0 + 8, y0 + 8), label, fill=(255, 255, 0))
    o.save(a[1]); sys.exit()
import bpy
import numpy as np
src, legs, out = a[:3]
L = json.load(open(legs))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); ad = arm.animation_data
body = next(o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() == arm)
for t in ad.nla_tracks: t.mute = True
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
sc.render.resolution_x = sc.render.resolution_y = W
w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = S; cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)

# the cutaway, decided once on the rest pose; a vertex group + Mask modifier keeps it through every pose
V = np.array([body.matrix_world @ v.co for v in body.data.vertices])
for side, s in (("Left", 1), ("Right", -1)):
    T = np.array(L[side]); hip = L["joints"][side + "UpLeg"]
    T = np.vstack([T, [hip[2] + 0.04, T[-1, 1], hip[1], T[-1, 3], T[-1, 4]]])   # the thigh carried up past the hip
    xc, yc, rx, ry = (np.interp(V[:, 2], T[:, 0], T[:, i]) for i in range(1, 5))
    inside = ((V[:, 0] - xc) / (rx + 0.02)) ** 2 + ((V[:, 1] - yc) / (ry + 0.02)) ** 2 <= 1
    keep = (V[:, 0] * s > 0) & (V[:, 2] <= T[-1, 0]) & ((V[:, 2] < T[0, 0]) | inside)
    body.vertex_groups.new(name=side).add(np.flatnonzero(keep).tolist(), 1.0, "REPLACE")
mask = body.modifiers.new("cut", "MASK"); mask.show_render = False

LEG = ("UpperLeg", "LowerLeg", "Foot", "Toes")
def chain(side):
    pb = arm.pose.bones; mw = arm.matrix_world
    pts = [mw @ pb["hips"].head] + [mw @ pb[side.lower() + n].head for n in LEG] + [mw @ pb[side.lower() + "Toes"].tail]
    return pts

for side in ("Left", "Right"):
    rest = {n: list(arm.matrix_world @ arm.data.bones[side.lower() + n].head_local) for n in LEG[:3]}
    print("LEGS", side, " ".join(f"{n} y {rest[n][1] * 1000:+.0f} mm (rig {L['joints'][side + k][1] * 1000:+.0f})"
                                 for n, k in zip(LEG[:3], ("UpLeg", "Leg", "Foot"))))
tiles = []
SHOTS = [("rest", None, 0, ("Left", "Right"), False), ("rest", None, 0, ("Left",), True), ("rest", None, 0, ("Right",), True),
         ("Walk", "Walk", 7, ("Left",), True), ("Run", "Run", 3, ("Right",), True),
         ("Run", "Run", 7, ("Left",), True), ("AoE", "AoE", 29, ("Left",), True), ("Death", "Death", 12, ("Left",), True),
         ("Hit", "Hit", 7, ("Right",), True)]   # Hit: the right leg is the one ground.py bends by IK
for name, act, f, sides, bare in SHOTS:
    if act:
        ac = next(x for x in bpy.data.actions if x.name.startswith(act)); ad.action = ac; ad.action_slot = ac.slots[0]; sc.frame_set(f)
    else:
        ad.action = None
        for pb in arm.pose.bones: pb.matrix_basis.identity()
        bpy.context.view_layer.update()
    mask.show_render = bare; mask.vertex_group = sides[0]
    ch = [chain(sd) for sd in sides]
    cy = float(np.mean([p.y for c in ch for p in c[1:4]]))
    cam.location = (6, cy, CZ)
    sc.render.filepath = f"{out}.{len(tiles):02d}.png"; bpy.ops.render.render(write_still=True)
    px = [[(W / 2 + (p.y - cy) * W / S, W / 2 - (p.z - CZ) * W / S) for p in c] for c in ch]
    tiles.append((sc.render.filepath, f"{name} f{f} {'/'.join(sides)} {'coat+cape cut away' if bare else 'full'}; front = left", px))
json.dump(tiles, open(out + ".json", "w"))
