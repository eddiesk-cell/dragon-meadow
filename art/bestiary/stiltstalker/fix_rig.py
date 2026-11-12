"""What the autorig cannot place on the Stiltstalker, fixed by hand in its FBX (same file layout autorig.py writes):
- ankles: the autorig puts the foot joint 22% of the knee height up the leg, which on these long shins is 5 cm above
  the splay of the toes. Move it down onto the splay (measured on the mesh: x 0.225, y 0.295, z 0.115) and hand the
  shin skin between the old and new joint back to the shin, so the toes turn about the ankle and the shin stays straight.
- neck and head joints: the autorig sets them on the torso's centre line, 16 cm BEHIND this heron's forward S-neck.
  Move them onto the neck's own centre (ring centres read off z-slices of the mesh), so the neck and head turn about themselves.
- upper chest: the long neck lifts the chin so far that Spine2 starts ABOVE the neck and points down, which turns every
  borrowed chest rotation inside out. Put Spine2 between Spine1 and the neck base.
- rest axes: clips are copied as local rotations, so the torso-to-head bones get the Drifter's own rest axes (the
  joints stay on this body's bends); every clip then turns them in the world exactly as it turns him.
- head, beak and crest ride the head bone rigidly. The autorig gave the crest to the neck and the beak's far half to
  other bones, so every borrowed head turn bent the beak like a banana and left the crest behind on the neck. The
  generated head also looks 22 deg to his left; it is turned to face ahead.
  blender -b -P fix_rig.py -- rig.fbx rig.fbx
"""
import bpy, sys
import numpy as np
from mathutils import Vector

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
ANKLE, SPINE2_Z, RAMP = Vector((0.225, 0.295, 0.115)), 1.35, 0.035
HEAD_Z0, HEAD_Z1, LOW, R_CORE = 1.57, 1.625, 1.47, 0.075   # throat ramp, lowest crest, neck tube (neck radius <= 6 cm)
HEAD_YAW = 22                                               # degrees the generated head looks to his left
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, ignore_leaf_bones=False)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
ob = next(o for o in bpy.data.objects if o.type == "MESH")
P = next(b.name for b in arm.data.bones if b.name.endswith("Hips"))[:-4]          # "mixamorig:"
M = arm.matrix_world.copy(); Mi = M.inverted()
before = {b.name: (M @ b.head_local).copy() for b in arm.data.bones}
co = np.array([(ob.matrix_world @ v.co)[:] for v in ob.data.vertices])

# the neck tube: ring centres (x, y) read off top-down slices of the mesh (the neck is an S: forward-left at the collar,
# back-right under the head); the core is everything within R_CORE of the centre line
NECK = {1.40: (0.046, -0.050), 1.46: (0.046, -0.044), 1.50: (0.044, -0.031), 1.54: (0.006, 0.013),
        1.58: (-0.038, 0.050), 1.61: (-0.053, 0.075), 1.64: (-0.054, 0.090)}
NZ = np.array(list(NECK)); NC = np.array(list(NECK.values()))
def on_neck(z): return Vector((np.interp(z, NZ, NC[:, 0]), np.interp(z, NZ, NC[:, 1]), z))
cz = np.stack([np.interp(co[:, 2], NZ, NC[:, i]) for i in (0, 1)], 1)
core = (co[:, 2] > 1.38) & (co[:, 2] < HEAD_Z1 + 0.01) & (np.linalg.norm(co[:, :2] - cz, axis=1) < R_CORE)

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
E = arm.data.edit_bones
for eb in E: eb.use_connect = False                    # a moved tail must not drag the child's joint with it
def place(name, head=None, tail=None):
    eb = E[P + name]; z = eb.z_axis.copy()
    if head is not None: eb.head = Mi @ head
    if tail is not None: eb.tail = Mi @ tail
    eb.align_roll(z)                                   # keep the roll the autorig gave it
for side, s in (("Left", 1), ("Right", -1)):
    a = Vector((s * ANKLE.x, ANKLE.y, ANKLE.z))
    place(side + "Leg", tail=a); place(side + "Foot", head=a)
s1, nk0 = M @ E[P + "Spine1"].head, M @ E[P + "Neck"].head
s2 = s1.lerp(nk0, (SPINE2_Z - s1.z) / (nk0.z - s1.z))
place("Spine1", tail=s2); place("Spine2", head=s2, tail=nk0)
nk, hj = on_neck(nk0.z), on_neck((M @ E[P + "Head"].head).z)
place("Neck", head=nk, tail=hj); place("Head", head=hj)
# Clips are copied as local rotations (retarget.py), so a bone turned differently at rest from the donor's moves
# differently: the heron's forward-leaning chest and back-leaning neck bent the borrowed Idle 28 deg backwards at the
# chest (Spine2's roll had flipped) and tipped the head 43 deg up. The joints stay where the body bends; only the
# torso-to-head bones' rest axes are set to the Drifter's own (read from its glb), so every clip moves them as it
# moves him. Bone length plays no part in skinning or clips: Spine2 and Neck are kept short so the skeleton picture
# does not draw them through empty air beside the S-neck, and the head-top marker sits on the crown above the head joint.
for name, x, y in (("Spine", (1, 0, 0), (0, -0.1993, 0.9799)), ("Spine1", (1, 0, 0), (0, 0.1202, 0.9928)),
                   ("Spine2", (1, 0, 0), (0, 0.1099, 0.9939)), ("Neck", (1, 0, 0), (0, -0.3153, 0.949)),
                   ("Head", (1, 0, 0), (0, -0.299, 0.9543))):
    eb = E[P + name]; h = M @ eb.head; x, y = Vector(x), Vector(y).normalized()
    eb.tail = Mi @ (h + y * {"Spine2": 0.04, "Neck": 0.06}.get(name, (M @ eb.tail - h).length))
    eb.align_roll(Mi.to_3x3() @ x.cross(y))
top = E[P + "HeadTop_End"]; d = top.tail - top.head
top.head = E[P + "Head"].tail; top.tail = top.head + d
bpy.ops.object.mode_set(mode="OBJECT")
for n in ("Spine", "Spine1", "Spine2", "Neck", "Head"):
    m = (M.to_3x3() @ arm.data.bones[P + n].matrix_local.to_3x3()).normalized()
    print(f"FIXRIG {n} rest axes X {tuple(round(v, 2) for v in m.col[0])} Y {tuple(round(v, 2) for v in m.col[1])}")
for b in arm.data.bones:
    d = (M @ b.head_local - before[b.name]).length
    if d > 1e-4: print(f"FIXRIG {b.name.split(':')[-1]}: {tuple(round(v, 3) for v in before[b.name])} -> "
                       f"{tuple(round(v, 3) for v in M @ b.head_local)} (moved {d:.3f} m)")
print(f"FIXRIG Spine2 now points {'UP' if (M @ arm.data.bones[P + 'Spine2'].tail_local).z > s2.z else 'DOWN'}")

# skin between the new ankle and the old one belonged to the foot; ramp it back onto the shin
G = {g.name: g for g in ob.vertex_groups}
for side, s in (("Left", 1), ("Right", -1)):
    foot, shin = G[P + side + "Foot"], G[P + side + "Leg"]
    n = 0
    for v in ob.data.vertices:
        w = next((g.weight for g in v.groups if g.group == foot.index), 0.0)
        if w <= 0 or np.sign(co[v.index, 0]) != s: continue
        k = float(np.clip((co[v.index, 2] - ANKLE.z + 0.005) / RAMP, 0, 1))
        if k <= 0: continue
        foot.add([v.index], w * (1 - k), "REPLACE"); shin.add([v.index], w * k, "ADD"); n += 1
    print(f"FIXRIG {side} ankle: {n} vertices handed from foot to shin")

# rigid head: every vertex the head reaches without crossing the neck tube (beak, crest) is all head; on the tube the
# head weight ramps in over the throat
nbr = [[] for _ in co]
for e in ob.data.edges:
    i, j = e.vertices; nbr[i].append(j); nbr[j].append(i)
head = co[:, 2] > HEAD_Z1 + 0.02
stack = list(np.flatnonzero(head))
while stack:
    i = stack.pop()
    for j in nbr[i]:
        if not head[j] and co[j, 2] > LOW and not core[j]:
            head[j] = True; stack.append(j)
HG = G[P + "Head"]
hw0 = np.array([next((g.weight for g in v.groups if g.group == HG.index), 0.0) for v in ob.data.vertices])
head |= ~core & (co[:, 2] > 1.50) & (hw0 > 0.5)        # crest tips the flood misses (decimation cut their edges)
ramp = core & (co[:, 2] > HEAD_Z0) & ~head
k = np.clip((co[:, 2] - HEAD_Z0) / (HEAD_Z1 - HEAD_Z0), 0, 1); k = k * k * (3 - 2 * k)
for i in np.flatnonzero(head | ramp):
    v = ob.data.vertices[int(i)]; f = 1.0 if head[i] else float(k[i])
    for g in list(v.groups):
        if g.group != HG.index: g.weight *= 1 - f
    hw = next((g.weight for g in v.groups if g.group == HG.index), 0.0)
    HG.add([int(i)], hw * (1 - f) + f, "REPLACE")
tip = int(np.argmin(np.where(head, co[:, 1], 9))); dv = co[tip] - np.array(hj[:])
print(f"FIXRIG head rigid: {int(head.sum())} vertices all head (lowest z {co[head, 2].min():.3f}), {int(ramp.sum())} ramped on "
      f"the throat, neck tube {int(core.sum())}; beak tip {np.round(co[tip], 3)}, {np.degrees(np.arctan2(dv[0], -dv[1])):.0f} deg to his left")

# the generated head looks 22 deg to his left (measured beak base -> tip): turn it to face ahead about the head joint,
# the throat turning with it as far as its head weight, so the T-pose and every clip look where he walks
f = np.where(head, 1.0, np.where(ramp, k, 0.0)) * np.radians(-HEAD_YAW)
x, y = co[:, 0] - hj.x, co[:, 1] - hj.y
new = co.copy(); new[:, 0] = hj.x + x * np.cos(f) - y * np.sin(f); new[:, 1] = hj.y + x * np.sin(f) + y * np.cos(f)
Wi = ob.matrix_world.inverted()
for i in np.flatnonzero(f):
    ob.data.vertices[int(i)].co = Wi @ Vector(new[i])
dv = new[tip] - np.array(hj[:])
print(f"FIXRIG custom normals {ob.data.has_custom_normals}; head turned {-HEAD_YAW} deg: beak tip now {np.degrees(np.arctan2(dv[0], -dv[1])):.0f} deg to his left")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.fbx(filepath=out, use_selection=True, add_leaf_bones=False, bake_anim=False,
                         path_mode="COPY", embed_textures=True, apply_scale_options="FBX_SCALE_NONE",
                         axis_forward="-Z", axis_up="Y", primary_bone_axis="Y", secondary_bone_axis="X",
                         mesh_smooth_type="FACE", armature_nodetype="NULL")
