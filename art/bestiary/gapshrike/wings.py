"""The Gapshrike's wings and tail fan (BESTIARY route B +S), in Blender on the Mac Studio (see build.sh).

The autorig reads a T-posed wing as an arm, and even with the arms hand-placed it puts the shoulder joint deep in the
wing root (the arm comes out 30 deg off the body's line) and skins the wing to the arms, so it tears when they drop.
So the rig is solved on a proxy whose wings are folded into a knot on the back, and the wings come back afterwards on
their own bone chains:

  fold    <clean-orig.glb> <clean.glb>              wings folded into the knot (same vertices, same UVs) for the autorig
  attach  <full.glb> <clean-orig.glb> <out.glb>     wings unfolded (vertices matched by position + UV), chains
                                                    spring_wing_l/r_0..3 on upperChest and spring_tail_0..2 on hips,
                                                    each vertex weighted down its chain; the clips are untouched, so
                                                    the chains hold their rest (wings raised) until a runtime drives them
  mask    <clean-orig.glb> <png>                    front / side / back, wing red, tail blue, roots marked: check by eye
"""
import bpy, sys, numpy as np
from mathutils import Vector, kdtree

a = sys.argv[sys.argv.index("--") + 1:]
MODE = a[0]
bpy.ops.wm.read_factory_settings(use_empty=True)
ROOT = {1: np.array([0.17, -0.28, 1.30]), -1: np.array([-0.17, -0.28, 1.30])}   # where each wing leaves the back
TAIL_ROOT = np.array([0.0, -0.33, 0.74])
NW, NT = 4, 3                                                                      # bones per wing / tail chain


def ss(e0, e1, t):
    t = np.clip((t - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def masks(P):
    """Wing and tail share per vertex, 0..1, from rest positions in the rig frame (x across, -y front, z up, 1.80 m)."""
    x, y, z = P.T; ax = np.abs(x)
    hw = np.interp(z, [1.2, 1.3, 1.45, 1.6], [0.22, 0.18, 0.15, 0.12])           # head + ruff half width
    wing = np.maximum.reduce([
        ss(-0.33, -0.24, y) * ss(1.12, 1.22, z),                                   # behind the back, chest up
        ss(1.24, 1.30, z) * ss(hw, hw + 0.05, ax) * ss(-0.45, -0.38, y),           # above the shoulders, beside the head
        ss(0.22, 0.27, ax) * ss(-0.34, -0.30, y) * ss(1.0, 1.06, z)])              # feathers hanging behind the arm
    tail = ss(-0.36, -0.28, y) * (1 - ss(0.62, 0.72, z)) * (1 - ss(0.13, 0.17, ax))
    return wing, tail * (1 - wing)


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    me = max((o for o in new if o.type == "MESH"), key=lambda o: len(o.data.vertices))   # not the importer's Icosphere
    arm = next((o for o in new if o.type == "ARMATURE"), None)
    return me, arm


def co(me):
    c = np.empty(len(me.data.vertices) * 3); me.data.vertices.foreach_get("co", c)
    M = np.array(me.matrix_world)
    return c.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]


def uvs(me):
    """One UV per vertex (glTF meshes are split on UV seams, so a vertex has exactly one)."""
    uv = np.empty(len(me.data.loops) * 2); me.data.uv_layers.active.data.foreach_get("uv", uv)
    vi = np.empty(len(me.data.loops), np.int32); me.data.loops.foreach_get("vertex_index", vi)
    out = np.zeros((len(me.data.vertices), 2)); out[vi] = uv.reshape(-1, 2)
    return out


def folded(P):
    wing, _ = masks(P)
    out = P.copy()
    for s, R in ROOT.items():
        side = np.sign(P[:, 0]) == s
        f = (wing * ss(0.06, 0.18, np.linalg.norm(P - R, axis=1)) * side)[:, None]   # the root itself stays put
        out += f * 0.97 * (R - P)
    return out


def chain(P, w, R, n):
    """Joints down a chain from R through the centroids of the masked vertices, banded by distance from R,
    and each masked vertex's share per bone (linear between neighbours, the first 12% eased onto the parent)."""
    d = np.linalg.norm(P - R, axis=1); on = w > 0.5
    D = np.percentile(d[on], 99)
    J = [R] + [P[on & (np.abs(d - D * k / n) < D / (2 * n))].mean(0) for k in range(1, n + 1)]
    u = np.clip(d / D, 0, 1)
    c = np.clip(u * n - 0.5, 0, n - 1); i0 = np.floor(c).astype(int); fr = c - i0
    B = np.zeros((len(P), n)); r = np.arange(len(P))
    B[r, i0] += 1 - fr; B[r, np.minimum(i0 + 1, n - 1)] += fr
    par = 1 - ss(0.02, 0.12, u)
    return J, B * (1 - par)[:, None], par


if MODE == "fold":
    me, _ = load(a[1])
    P = co(me); F = folded(P)
    assert me.matrix_world.is_identity
    me.data.vertices.foreach_set("co", F.ravel()); me.data.update()
    wing, _ = masks(P)
    print(f"WINGS fold: {(wing > 0.5).sum()} wing vertices of {len(P)}, max move {np.linalg.norm(F - P, axis=1).max():.2f} m")
    bpy.ops.object.select_all(action="DESELECT"); me.select_set(True)
    bpy.ops.export_scene.gltf(filepath=a[2], export_format="GLB", use_selection=True, export_skins=False,
                              export_animations=False)

elif MODE == "attach":
    me, arm = load(a[1])
    orig, _ = load(a[2])
    P0 = co(orig); F0 = folded(P0); U0 = uvs(orig)
    P = co(me); U = uvs(me)
    assert me.matrix_world.is_identity and arm.matrix_world.is_identity, "rig frame expected"
    kd = kdtree.KDTree(len(F0))
    for i, p in enumerate(F0):
        kd.insert(p, i)
    kd.balance()
    src = np.empty(len(P), int); err = np.empty(len(P))
    for i, p in enumerate(P):                       # folded copies sit together: the UV picks the right one
        hits = kd.find_n(p, 24)
        k = min(hits, key=lambda h: h[2] + 4 * np.abs(U0[h[1]] - U[i]).sum())
        src[i] = k[1]; err[i] = k[2] + np.abs(U0[k[1]] - U[i]).sum()
    print(f"WINGS matched {len(P)} vertices to {len(np.unique(src))} originals, worst {err.max():.4f}, "
          f"99% under {np.percentile(err, 99):.4f}")
    assert np.percentile(err, 99) < 1e-3, "the folded mesh does not match its original"
    Pr = P0[src]                                    # every vertex back where the paid mesh had it
    bpy.data.objects.remove(orig)
    wing, tail = masks(Pr)

    names = [g.name for g in me.vertex_groups]
    W = np.zeros((len(P), len(names)))
    for v in me.data.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    E = arm.data.edit_bones
    extra = []                                      # (bone names, per-vertex weights [N, n], share, parent, parent share)
    for s, tag in ((1, "l"), (-1, "r")):
        w = wing * (np.sign(Pr[:, 0]) == s)
        J, B, par = chain(Pr, w, ROOT[s], NW)
        extra.append(([f"spring_wing_{tag}_{k}" for k in range(NW)], J, B, w, "upperChest", par))
    J, B, par = chain(Pr, tail, TAIL_ROOT, NT)
    extra.append(([f"spring_tail_{k}" for k in range(NT)], J, B, tail, "hips", par))
    for bones, J, *_ , parent, _p in extra:
        prev = E[parent]
        for k, n in enumerate(bones):
            eb = E.new(n); eb.head, eb.tail = Vector(J[k]), Vector(J[k + 1])
            eb.parent, eb.use_connect = prev, k > 0
            prev = eb
        print(f"WINGS chain {bones[0][:-2]}: {len(bones)} bones on {parent}, "
              f"root {np.round(J[0], 2).tolist()} tip {np.round(J[-1], 2).tolist()}")
    bpy.ops.object.mode_set(mode="OBJECT")

    for bones, J, B, w, parent, par in extra:
        names += bones
        W = np.hstack([W * (1 - w)[:, None], w[:, None] * B])
        W[:, names.index(parent)] += w * par
        print(f"WINGS {bones[0][:-2]}: {(w > 0.5).sum()} vertices, per bone "
              f"{[int(((w[:, None] * B)[:, k] > 0.25).sum()) for k in range(len(bones))]}")
    for n in names[len(me.vertex_groups):]:
        me.vertex_groups.new(name=n)
    for v in me.data.vertices:                      # 4 strongest, normalised
        i = v.index; top = np.argsort(W[i])[-4:]; top = top[W[i, top] > 1e-4]; tot = W[i, top].sum()
        for g in list(v.groups):
            me.vertex_groups[g.group].remove([i])
        for j in top:
            me.vertex_groups[int(j)].add([i], float(W[i, j] / tot), "REPLACE")
    me.data.vertices.foreach_set("co", Pr.ravel()); me.data.update()

    ad = arm.animation_data; acts = list(bpy.data.actions)     # one NLA track per clip, as retarget.py exports them
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for act in acts:
        t = ad.nla_tracks.new(); t.name = act.name
        st = t.strips.new(act.name, int(act.frame_range[0]), act); st.action_slot = act.slots[0]
    ad.action = None
    print(f"WINGS clips {sorted(x.name for x in acts)}")
    bpy.ops.export_scene.gltf(filepath=a[3], export_format="GLB", export_animation_mode="NLA_TRACKS")

elif MODE == "mask":
    import math
    me, _ = load(a[1])
    P = co(me); wing, tail = masks(P)
    ca = me.data.color_attributes.new("m", "FLOAT_COLOR", "POINT")
    g = np.full(len(P), 0.55)
    col = np.stack([g + 0.45 * wing, g * (1 - wing) * (1 - tail), g + 0.45 * tail, np.ones(len(P))], 1)
    ca.data.foreach_set("color", col.ravel()); me.data.color_attributes.active_color = ca
    for s, R in list(ROOT.items()) + [(0, TAIL_ROOT)]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, location=R)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.color_type = "VERTEX"; sc.display.shading.light = "STUDIO"
    sc.render.resolution_x, sc.render.resolution_y = 800, 800
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.3
    for name, loc, rot in [("front", (0, -6, 0.95), (math.pi / 2, 0, 0)), ("side", (6, 0, 0.95), (math.pi / 2, 0, math.pi / 2)),
                           ("back", (0, 6, 0.95), (math.pi / 2, 0, math.pi))]:
        cam.location = loc; cam.rotation_euler = rot
        sc.render.filepath = f"{a[2]}.{name}.png"; bpy.ops.render.render(write_still=True)
