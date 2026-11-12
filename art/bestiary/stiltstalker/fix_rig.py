"""Two joints the autorig cannot place on the Stiltstalker, moved by hand in its FBX (same file layout autorig.py writes):
- ankles: the autorig puts the foot joint 22% of the knee height up the leg, which on these long shins is 5 cm above
  the splay of the toes. Move it down onto the splay (measured on the mesh: x 0.225, y 0.295, z 0.115) and hand the
  shin skin between the old and new joint back to the shin, so the toes turn about the ankle and the shin stays straight.
- upper chest: the long neck lifts the chin so far that Spine2 starts ABOVE the neck and points down, which turns every
  borrowed chest rotation inside out. Put Spine2 between Spine1 and the neck, pointing up at the neck.
  blender -b -P fix_rig.py -- rig.fbx rig.fbx
"""
import bpy, sys
import numpy as np
from mathutils import Vector

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
ANKLE, SPINE2_Z, RAMP = Vector((0.225, 0.295, 0.115)), 1.35, 0.035
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, ignore_leaf_bones=False)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
ob = next(o for o in bpy.data.objects if o.type == "MESH")
P = next(b.name for b in arm.data.bones if b.name.endswith("Hips"))[:-4]          # "mixamorig:"
M = arm.matrix_world.copy(); Mi = M.inverted()
before = {b.name: (M @ b.head_local).copy() for b in arm.data.bones}

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
E = arm.data.edit_bones
def move_head(name, world, tail_world=None):
    eb = E[P + name]; z = eb.z_axis.copy()
    eb.head = Mi @ world
    if tail_world is not None: eb.tail = Mi @ tail_world
    eb.align_roll(z)                                   # keep the roll the autorig gave it
for side, s in (("Left", 1), ("Right", -1)):
    a = Vector((s * ANKLE.x, ANKLE.y, ANKLE.z))
    leg = E[P + side + "Leg"]; z = leg.z_axis.copy(); leg.tail = Mi @ a; leg.align_roll(z)
    move_head(side + "Foot", a)
s1, nk = M @ E[P + "Spine1"].head, M @ E[P + "Neck"].head
t = (SPINE2_Z - s1.z) / (nk.z - s1.z); s2 = s1.lerp(nk, t)
sp1 = E[P + "Spine1"]; z = sp1.z_axis.copy(); sp1.tail = Mi @ s2; sp1.align_roll(z)
move_head("Spine2", s2, nk)
bpy.ops.object.mode_set(mode="OBJECT")
for b in arm.data.bones:
    d = (M @ b.head_local - before[b.name]).length
    if d > 1e-4: print(f"FIXRIG {b.name}: {before[b.name].z:.3f} -> {(M @ b.head_local).z:.3f} (moved {d:.3f} m)")
print(f"FIXRIG Spine2 now points {'UP' if (M @ arm.data.bones[P + 'Spine2'].tail_local).z > s2.z else 'DOWN'}")

# skin between the new ankle and the old one belonged to the foot; ramp it back onto the shin
G = {g.name: g for g in ob.vertex_groups}
co = np.array([(ob.matrix_world @ v.co)[:] for v in ob.data.vertices])
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

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.fbx(filepath=out, use_selection=True, add_leaf_bones=False, bake_anim=False,
                         path_mode="COPY", embed_textures=True, apply_scale_options="FBX_SCALE_NONE",
                         axis_forward="-Z", axis_up="Y", primary_bone_axis="Y", secondary_bone_axis="X",
                         mesh_smooth_type="FACE", armature_nodetype="NULL")
