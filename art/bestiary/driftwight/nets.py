"""Hang the Driftwight's nets from its arms, baked into every clip. The autorig skins the nets below the hips to the
hips and thighs (it reads them as a coat), so when the long arms come down the nets stay out in T-pose shelves.
Instead: columns of bones along each arm (net_l_0..7, net_r_0..7), parented to the arm, pointing down; every net
vertex rides the two columns beside it; in each frame of each clip every column is turned back to hang straight down
(gravity, no swing) and squashed if it would go through the ground (it crumples on the shingle).
  blender -b -P nets.py -- full.glb full.glb
"""
import bpy, sys, numpy as np
from mathutils import Matrix

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
COLS = np.linspace(0.33, 0.95, 8)      # |x| of the columns on the stretched mesh: shoulder to the end of the nets
GROUND = 0.03
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
ob = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
assert arm.matrix_world.is_identity and ob.matrix_world.is_identity
co = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
ax = np.abs(co[:, 0])
net = (ax > 0.30) & (ax < 1.05) & (co[:, 2] < 1.37) & (co[:, 2] > 0.30)    # above the feet, below the arm
wood = (ax > 0.33) & (co[:, 2] >= 1.37)                                     # the arm and the knots tied on it

# the rest of the arm keeps only arm weights: a knot that kept a little hips weight is dragged back to the T-pose
# and sticks out of the lowered forearm like a fin
G = {g.index: g.name for g in ob.vertex_groups}
ARMY = ("Shoulder", "UpperArm", "LowerArm", "Hand", "Thumb", "Index", "Middle", "Ring", "Little")
fixed = 0
for i in np.flatnonzero(wood):
    v = ob.data.vertices[int(i)]; side = "left" if co[i, 0] > 0 else "right"
    keep = {G[g.group]: g.weight for g in v.groups if G[g.group].startswith(side) and any(k in G[g.group] for k in ARMY)}
    if len(keep) == len(v.groups) or not v.groups: continue
    for g in list(v.groups): ob.vertex_groups[g.group].remove([int(i)])
    tot = sum(keep.values())
    if tot < 1e-3: keep, tot = {side + ("UpperArm" if ax[i] < abs(arm.data.bones[side + "LowerArm"].head_local.x) else "LowerArm"): 1.0}, 1.0
    for n, w in keep.items(): ob.vertex_groups[n].add([int(i)], w / tot, "REPLACE")
    fixed += 1
print(f"NETS arm vertices cleaned of body weights: {fixed}")

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
E = arm.data.edit_bones
cols = []                                # (name, side sign, attach z, parent bone name, length)
for side, s in (("left", 1), ("right", -1)):
    up, lo = E[side + "UpperArm"], E[side + "LowerArm"]
    mine = net & (np.sign(co[:, 0]) == s)
    for i, xc in enumerate(COLS):
        b = up if xc < abs(lo.head.x) else lo
        t = (s * xc - b.head.x) / (b.tail.x - b.head.x)
        h = b.head.lerp(b.tail, t)
        near = mine & (np.abs(ax - xc) < 0.06)
        L = h.z - co[near, 2].min() if near.any() else 0.3
        eb = E.new(f"net_{side[0]}_{i}"); eb.head = (s * xc, h.y, h.z); eb.tail = (s * xc, h.y, h.z - L)
        eb.parent, eb.use_connect = b, False
        cols.append((eb.name, s, h.z, b.name, L))
bpy.ops.object.mode_set(mode="OBJECT")

# weights: two columns by x, blended into the arm itself within 12 cm of the pivot so the net stays on the wood
for g in ob.vertex_groups:
    g.remove([int(i) for i in np.flatnonzero(net)])
VG = {n: ob.vertex_groups.new(name=n) for n, *_ in cols}
for side, s in (("l", 1), ("r", -1)):
    C = [c for c in cols if c[1] == s]
    for i in np.flatnonzero(net & (np.sign(co[:, 0]) == s)):
        k = float(np.clip(np.interp(ax[i], COLS, np.arange(len(COLS))), 0, len(COLS) - 1))
        a, f = int(k), k - int(k)
        b = min(a + 1, len(C) - 1)
        wa = float(np.clip(1 - (C[a][2] - co[i, 2]) / 0.12, 0, 1))
        if wa > 0: ob.vertex_groups[C[a][3]].add([int(i)], wa, "ADD")
        VG[C[a][0]].add([int(i)], (1 - wa) * (1 - f), "ADD")
        if f > 0: VG[C[b][0]].add([int(i)], (1 - wa) * f, "ADD")

# bake: every frame of every clip, each column hangs straight down from wherever the arm put its top
sc = bpy.context.scene
ad = arm.animation_data
acts = list(bpy.data.actions)
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
for act in acts:
    ad.action = act; ad.action_slot = act.slots[0]
    for f in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1):
        sc.frame_set(f)
        for n, s, z, par, L in cols:
            pb = arm.pose.bones[n]
            h = pb.matrix.to_translation()
            k = min(1.0, max(0.05, (h.z - GROUND) / L))
            pb.matrix = Matrix.Translation(h) @ pb.bone.matrix_local.to_3x3().to_4x4() @ Matrix.Diagonal((1, k, 1, 1))
            pb.keyframe_insert("rotation_quaternion", frame=f); pb.keyframe_insert("scale", frame=f)
    print(f"NETS {act.name}: frames {act.frame_range[0]:.0f}-{act.frame_range[1]:.0f}")

# one NLA track per clip, as retarget.py / pose_offset.py export them
for act in acts:
    t = ad.nla_tracks.new(); t.name = act.name
    st = t.strips.new(act.name, int(act.frame_range[0]), act); st.action_slot = act.slots[0]
ad.action = None
print(f"NETS {len(cols)} columns, {int(net.sum())} net vertices")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animation_mode="NLA_TRACKS")
