"""Wreckback's two fixes the generic rig pipeline cannot make (run in Blender on the Mac Studio, see build.sh).

  longarms  <rig.blend> <out.glb> <K>   stretch upper arm + forearm of the T-posed mesh by K along the arm (Eddie: golems
                                        and big creatures have LONG arms -- hanging, the knuckles reach the knees). The
                                        first autorig's weights say what is arm; hand, claw, hull and kelp keep their shape.
  shell     <full.glb> <out.glb>        the hull and its kelp ride the upper chest rigidly (BESTIARY route +R), and the
                                        claw is one rigid piece on the right hand (its auto "fingers" would melt it).
  mask      <rig.blend|full.glb> <png>  front render with the shell mask in red, to check the mask by eye.
"""
import bpy, sys, colorsys, numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
MODE, SRC, OUT = a[0], a[1], a[2]
if SRC.endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=SRC)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
me = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))  # not the importer's Icosphere
M = np.array(me.matrix_world)
co = np.array([v.co for v in me.data.vertices])
V = co @ M[:3, :3].T + M[:3, 3]
H = V[:, 2].max() - V[:, 2].min()
x, y, z = (V[:, 0] - V[:, 0].mean()) * 1.8 / H, V[:, 1] * 1.8 / H, (V[:, 2] - V[:, 2].min()) * 1.8 / H  # the 1.80 m rig frame


def vertex_colours():
    img = next(i for i in bpy.data.images if i.size[0] and not i.name.endswith("normal"))
    img = img.copy(); img.scale(512, 512)                 # a copy: the real texture must leave at full size
    px = np.empty(512 * 512 * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(512, 512, 4)
    uv = np.empty(len(me.data.loops) * 2, np.float32); me.data.uv_layers.active.data.foreach_get("uv", uv)
    uv = (np.clip(uv.reshape(-1, 2), 0, 0.9999) * 512).astype(int)
    vi = np.empty(len(me.data.loops), np.int32); me.data.loops.foreach_get("vertex_index", vi)
    c = np.zeros((len(V), 3)); n = np.zeros(len(V))
    np.add.at(c, vi, px[uv[:, 1], uv[:, 0], :3]); np.add.at(n, vi, 1)
    return c / np.maximum(n, 1)[:, None]


def shell_mask(W, names):
    """1 = carried by the shell (hull planks, gunwales, kelp), 0 = body. Rig-frame metres, smooth edges."""
    hsv = np.array([colorsys.rgb_to_hsv(*c) for c in vertex_colours()])
    ax = np.abs(x)
    zmin = np.where(ax > 0.30, 0.82, 0.95)                # the rope belt and the skirt's glass floats sit lower
    ok = (z > zmin) & (ax < 0.62) & ~((x < -0.44) & (z > 1.08))   # past 0.44 above 1.08 is the claw and its cuff
    kelp = ((hsv[:, 0] > 45 / 360) & (hsv[:, 0] < 80 / 360) & (hsv[:, 1] > 0.4) & (hsv[:, 2] > 0.12)
            | (z < 1.16) & (ax > 0.30)) & ok              # under a T-posed arm, outside the torso, only kelp hangs
    e = np.empty(len(me.data.edges) * 2, np.int32); me.data.edges.foreach_get("vertices", e); e = e.reshape(-1, 2)
    for _ in range(2):                                    # two rings more, so a strand goes whole, not in patches
        k = kelp.copy(); k[e[:, 0]] |= kelp[e[:, 1]]; k[e[:, 1]] |= kelp[e[:, 0]]; kelp = k & ok
    face = (ax < 0.15) & (z < 1.45) & (y < 0.0)           # the head pokes out under the bow
    armw = W[:, [i for i, n in enumerate(names) if any(p in n for p in ("Arm", "Hand", "Thumb", "Index", "Middle",
             "Ring", "Pinky", "Little"))]].sum(1)
    hull = np.clip((z - 1.31) / 0.05, 0, 1) * ~face
    # what the arm carries goes with the arm (deltoid under the rim, the claw's cuff, kelp stuck to the skin):
    # a rigid patch on a moving arm tears into long blades
    s = np.maximum(hull, kelp.astype(float)) * (1 - armw)
    print(f"MASK kelp {kelp.sum()} hull {(hull > 0.5).sum()} face-kept {(face & (z > 1.31)).sum()} of {len(V)}")
    return s


def weights():
    names = [g.name.split(":")[-1] for g in me.vertex_groups]
    W = np.zeros((len(V), len(names)))
    for v in me.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9), names


if MODE == "longarms":
    K = float(a[3])
    W, names = weights()
    s = shell_mask(W, names)
    head = {b.name.split(":")[-1]: np.array(arm.matrix_world @ b.head_local) for b in arm.data.bones}
    d = np.zeros_like(V)
    for side in ("Left", "Right"):
        S, E, Wr = head[side + "Arm"], head[side + "ForeArm"], head[side + "Hand"]
        t = lambda p, q: np.clip((V - p) @ (q - p) / ((q - p) @ (q - p)), 0, 1)[:, None]
        for i, n in enumerate(names):
            if n == side + "Arm":
                D = t(S, E) * (K - 1) * (E - S)
            elif n == side + "ForeArm":
                D = (K - 1) * (E - S) + t(E, Wr) * (K - 1) * (Wr - E)
            elif n.startswith(side + "Hand"):
                D = np.broadcast_to((K - 1) * (Wr - S), V.shape)
            else:
                continue
            d += W[:, i:i + 1] * D
    d *= (1 - s)[:, None]
    _, g, n = np.unique(np.round(V, 5), axis=0, return_inverse=True, return_counts=True)   # the mesh is split along UV
    g = g.ravel(); m = np.zeros((len(n), 3)); np.add.at(m, g, d); d = m[g] / n[g, None]  # seams: copies move as one
    V2 = V + d
    me.data.vertices.foreach_set("co", ((V2 - M[:3, 3]) @ np.linalg.inv(M[:3, :3]).T).ravel())
    print(f"LONGARMS K={K} max move {np.linalg.norm(d, axis=1).max():.3f} m, x span {V[:, 0].min():.3f}..{V[:, 0].max():.3f}"
          f" -> {V2[:, 0].min():.3f}..{V2[:, 0].max():.3f}")
    me.modifiers.clear(); bpy.ops.object.select_all(action="DESELECT")
    me.select_set(True); bpy.context.view_layer.objects.active = me
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM"); bpy.ops.object.transform_apply()
    me.vertex_groups.clear()
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=False, export_animations=False)
    print("LONGARMS wrote", OUT)

elif MODE == "shell":
    W, names = weights()
    s = shell_mask(W, names)
    up = names.index("upperChest")
    claw = [i for i, n in enumerate(names) if n.startswith("right") and any(f in n for f in ("Thumb", "Index", "Middle", "Ring", "Little"))]
    W[:, names.index("rightHand")] += W[:, claw].sum(1); W[:, claw] = 0
    W = (1 - s)[:, None] * W; W[:, up] += s
    for v in me.data.vertices:                            # rewrite each vertex's groups: 4 strongest, normalised
        i = v.index; top = np.argsort(W[i])[-4:]; top = top[W[i, top] > 1e-4]; tot = W[i, top].sum()
        for g in list(v.groups):
            me.vertex_groups[g.group].remove([i])
        for j in top:
            me.vertex_groups[j].add([i], float(W[i, j] / tot), "REPLACE")
    print(f"SHELL rigid on upperChest: {(s > 0.5).sum()} vertices; claw bones folded into rightHand: {[names[i] for i in claw]}")
    acts = list(bpy.data.actions)                         # one NLA track per clip, as retarget.py exports them
    ad = arm.animation_data or arm.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for act in acts:
        tr = ad.nla_tracks.new(); tr.name = act.name
        st = tr.strips.new(act.name, int(act.frame_range[0]), act); st.action_slot = act.slots[0]
    ad.action = None
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animation_mode="NLA_TRACKS")
    print("SHELL wrote", OUT, len(acts), "clips")

elif MODE == "mask":
    s = shell_mask(*weights())
    col = me.data.color_attributes.new("mask", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", np.c_[0.3 + 0.7 * s, 0.3 * (1 - s) + 0.2, 0.3 * (1 - s) + 0.2, np.ones(len(V))].ravel())
    me.data.color_attributes.active_color = col
    if arm.animation_data:
        arm.animation_data.action = None
        for tr in arm.animation_data.nla_tracks: tr.mute = True
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    sc = bpy.context.scene; sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.color_type = "VERTEX"; sc.display.shading.light = "STUDIO"
    sc.render.resolution_x = sc.render.resolution_y = 900
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = max(np.ptp(V[:, 0]), H) * 1.05
    cam.location = (V[:, 0].mean(), -6, V[:, 2].min() + H / 2); cam.rotation_euler = (np.pi / 2, 0, 0)
    sc.render.filepath = OUT; bpy.ops.render.render(write_still=True)
