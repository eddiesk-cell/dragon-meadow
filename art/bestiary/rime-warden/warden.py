"""The Rime Warden's fixes the generic rig pipeline cannot make (Blender on the Mac Studio, see build.sh).

  fix   <full.glb> <out.glb>   the icicles under the arms ride the arm (the autorig took them for a hanging skirt and
                               pinned them to the hips: they stretched into blades); the pinnacle crown rides upperChest
                               rigidly (BESTIARY route +R); the head sunk in the crown keeps HEADKEEP of each clip's turn;
                               the fist's lower block rides the hand; the neck joint goes under the jaw. Also writes
                               <out>-skel.blend (Mixamo names) for skel_tex.py -> skeleton.png of the FINAL rig.
  mask  <glb> <png>            front + side of the rest pose: crown red, repaired icicles green -- check the masks by eye.
  sheet <glb> <png>            every clip at 1/4, 1/2 and 3/4 of its length, front view, one contact sheet.
  gap   <glb> <clip>           each forearm+hand's nearest gap (m) to the trunk, legs and feet, and how many of its
                               vertices sit behind that surface, every frame of the clip.
"""
import bpy, sys, numpy as np
from mathutils import Quaternion, Vector, kdtree

a = sys.argv[sys.argv.index("--") + 1:]
MODE, SRC, OUT = a
HEADKEEP = 0.25   # the face sits boxed in the rigid crown: it keeps a quarter of the borrowed head turn
NECKDROP = 0.04   # m, neck joint under the head joint: the head block's foot on the chest (the chest juts out below 1.26)
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
    # icicle: what hangs under an arm (below the armpit the torso is narrower than 0.42 m) and, out past the shoulder,
    # anything the arm does not own (the autorig took the icicles and the fist's lower block for cloth and pinned them
    # to the hips). It copies the weights of the arm's own surface right above it (donor).
    icicle = np.zeros(len(V), bool); donor = {}
    for side, s in (("left", 1), ("right", -1)):
        out, sx = s * x > 0.45, s * x
        foreign = (sx > 0.55) & (armw(side) + W[:, names.index(side + "Shoulder")] < 0.95)
        hang = out & (z > 0.8) & (z < np.where(sx < 1.2, 1.06, 0.99))   # the fist's own underside reaches 1.0; feet below
        icicle |= foreign | hang
        donor[side] = np.flatnonzero(out & ~foreign & ~hang)
    # the crown: every pinnacle above the shoulder line, but not the face under the brow, and not what an arm carries
    face = (np.abs(x) < 0.14) & (y < -0.08) & (z < 1.50)
    aw = armw("left") + armw("right")
    crown = np.clip((z - 1.44) / 0.04, 0, 1) * ~face * (1 - aw) * (np.abs(x) < 0.55)
    return icicle, donor, crown


icicle, donor, crown = masks()
print(f"MASK icicles {icicle.sum()} (left {(icicle & (x > 0)).sum()}, right {(icicle & (x < 0)).sum()}), "
      f"crown {(crown > 0.5).sum()} of {len(V)}")

if MODE == "gap":   # OUT = a clip: per frame, each forearm+hand's nearest gap to trunk/legs/feet, and verts behind it
    dom = W.argmax(1)
    BODY = ("hips", "spine", "chest", "upperChest", "UpperLeg", "LowerLeg", "Foot", "Toes")
    body = np.flatnonzero([any(n == p or (p[0].isupper() and p in n) for p in BODY) for n in np.array(names)[dom]])
    hand = {s: np.flatnonzero([n.startswith(s) and any(p in n for p in ARMB[1:]) for n in np.array(names)[dom]])
            for s in ("left", "right")}
    ad = arm.animation_data
    for tr in ad.nla_tracks:
        tr.mute = True
    act = next(x for x in bpy.data.actions if x.name.startswith(OUT)); ad.action = act; ad.action_slot = act.slots[0]
    from mathutils.bvhtree import BVHTree   # nearest point on the body's SURFACE (its faces), not its nearest vertex
    isbody = np.zeros(len(V), bool); isbody[body] = True
    F = [p.vertices[:] for p in me.data.polygons if isbody[list(p.vertices)].all()]
    worst = {s: (9, 0) for s in hand}
    for f in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1):
        bpy.context.scene.frame_set(f)
        m = me.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        P = np.empty(len(m.vertices) * 3); m.vertices.foreach_get("co", P); P = P.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
        bvh = BVHTree.FromPolygons(P.tolist(), F)
        row = []
        for s, hi in hand.items():
            d, inside = 9, 0
            for i in hi:
                q, n, _, dist = bvh.find_nearest(P[i]); dist *= 1.8 / H; d = min(d, dist)
                inside += dist < 0.03 and np.dot(P[i] - np.array(q), np.array(n)) < 0
            worst[s] = (min(worst[s][0], d), max(worst[s][1], inside)); row.append(f"{s} {d:.3f} m / {inside} behind")
        print(f"GAP {OUT} f{f}: " + ", ".join(row))
    print("GAP worst", {s: (round(g, 3), n) for s, (g, n) in worst.items()})
    raise SystemExit

if MODE == "fix":
    up = names.index("upperChest")
    # the belly and the chest under the face carry stray hip, foot, shoulder, arm and head weight (geodesic leaks
    # through the boulders frozen in the ice): the trunk rides the spine chain, blended by height, edges feathered
    spine = ["hips", "spine", "chest", "upperChest"]
    bz = [(np.array(arm.matrix_world @ arm.data.bones[n].head_local)[2] - V[:, 2].min()) * 1.8 / H for n in spine]
    ax, c = np.abs(x), lambda v: np.clip(v / 0.06, 0, 1)
    m = np.maximum(c(0.40 - ax) * c(1.12 - z), c(0.30 - ax) * c(1.28 - z)) * c(z - 0.80)
    si = np.array([names.index(n) for n in spine])
    t = np.interp(z, bz, range(4)); lo = np.minimum(t.astype(int), 2); f = t - lo
    S = np.zeros_like(W); r = np.arange(len(V)); S[r, si[lo]] = 1 - f; S[r, si[lo + 1]] += f
    W = (1 - m)[:, None] * W + m[:, None] * S
    print(f"TORSO {(m > 0.5).sum()} trunk vertices onto the spine chain (bones at z {np.round(bz, 2)})")
    P = np.c_[x, y, 0.3 * z]                      # nearest in plan first: the arm surface right above the icicle
    for side in ("left", "right"):
        kd = kdtree.KDTree(len(donor[side]))
        for j, i in enumerate(donor[side]):
            kd.insert(P[i], j)
        kd.balance()
        bad = np.flatnonzero(icicle & ((x > 0) if side == "left" else (x < 0)))
        for i in bad:
            W[i] = W[donor[side][kd.find(P[i])[1]]]
        # past the wrist it is the fist's lower block (the inner side once the arm hangs): solid ice, rigid on the
        # hand -- per-vertex finger donors crumpled it into shards and folded it into the knee
        hx = abs(np.array(arm.matrix_world @ arm.data.bones[side + "Hand"].head_local)[0] - V[:, 0].mean()) * 1.8 / H
        blk = bad[np.abs(x[bad]) > hx]; W[blk] = 0; W[blk, names.index(side + "Hand")] = 1
        print(f"FIST {side}: {len(blk)} lower-block vertices past the wrist ({hx:.2f} m) rigid on {side}Hand")
    W = (1 - crown)[:, None] * W; W[:, up] += crown
    for v in me.data.vertices:                    # rewrite each vertex's groups: 4 strongest, normalised
        i = v.index; top = np.argsort(W[i])[-4:]; top = top[W[i, top] > 0.01]; tot = W[i, top].sum()
        for j in [g.group for g in v.groups]:      # indices first: removing invalidates the live group elements
            me.vertex_groups[j].remove([i])
        for j in top:
            me.vertex_groups[j].add([i], float(W[i, j] / tot), "REPLACE")
    # shortcut: core.py hangs the Neck 6 cm above the shoulders whatever the chin says, and this head sits sunk between
    # them, so the neck came out ABOVE the head joint: upside down in the face, its x axis flipped, and every nod that
    # retarget.py copies verbatim from the donor's (upright) neck played mirrored. It moves under the jaw (NECKDROP below
    # the head joint, where the head block meets the chest) and points up with the donor's frame (x across, z forward),
    # so the copied keys mean what they did on the donor. Drop this once core.py keeps Neck below Head.
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode="EDIT")
    E = arm.data.edit_bones; nk, hd, uc = E["neck"], E["head"], E["upperChest"]
    nk.head = hd.head - Vector((0, 0, NECKDROP * H / 1.8)); nk.tail = hd.head.copy(); nk.align_roll(Vector((0, -1, 0)))
    uc.tail = uc.head + (uc.tail - uc.head).normalized() * (nk.head - uc.head).length   # same direction, ends at the neck
    print(f"NECK neck joint now at z {nk.head.z:.3f} (x axis {tuple(round(c, 2) for c in nk.x_axis)}), head {hd.head.z:.3f}, "
          f"upperChest {uc.head.z:.3f}")
    bpy.ops.object.mode_set(mode="OBJECT")
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
    # the fixed rig, renamed back to Mixamo's names, for the shared skel_tex.py + overlay_draw.py (skeleton.png)
    MIX = {"hips": "Hips", "spine": "Spine", "chest": "Spine1", "upperChest": "Spine2", "neck": "Neck", "head": "Head"}
    for L in ("Left", "Right"):
        l = L.lower()
        MIX |= {l + a: L + b for a, b in (("Shoulder", "Shoulder"), ("UpperArm", "Arm"), ("LowerArm", "ForeArm"), ("Hand", "Hand"),
                                          ("UpperLeg", "UpLeg"), ("LowerLeg", "Leg"), ("Foot", "Foot"), ("Toes", "ToeBase"))}
        MIX |= {f"{l}{v}{p}": f"{L}Hand{f}{i + 1}" for f, v in (("Thumb", "Thumb"), ("Index", "Index"), ("Middle", "Middle"),
                ("Ring", "Ring"), ("Pinky", "Little")) for i, p in enumerate(("Proximal", "Intermediate", "Distal", "Tip"))}
    for b in arm.data.bones:
        b.name = MIX.get(b.name, b.name)
    arm.animation_data_clear()                    # saved at rest: a blend keeps the last evaluated pose
    for o in [o for o in bpy.data.objects if o.type == "MESH" and o != me]:   # the importer's bone-shape sphere
        print("SKEL drops", o.name); bpy.data.objects.remove(o)
    for pb in arm.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
    bpy.ops.wm.save_as_mainfile(filepath=OUT.replace(".glb", "-skel.blend"))
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
