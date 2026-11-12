"""Give the Marrowkeeper LONG arms before the final rig (Eddie: big creatures get long arms, knuckles at the knees
hanging; BESTIARY: "arms reaching past its knees"). The paid mesh hangs its knuckles ~0.25 m above the knees.
Only the bone SHAFTS stretch: the elbow and wrist knobs, the hand, the claws and the scale coat keep their shape.
What is arm comes from the first rig's weights (rig.blend on the paid mesh), so the cape beside the arm never moves.
  blender -b -P long_arms.py -- clean-orig.glb rig.blend clean.glb [gain_m=0.25]
"""
import bpy, sys, numpy as np
from mathutils.kdtree import KDTree

a = sys.argv[sys.argv.index("--") + 1:]
src, rig, out = a[:3]
G = float(a[3]) if len(a) > 3 else 0.25
# |x| on the 1.80 m mesh, measured on skeleton.png per side (+1 = his left): the upper-arm shaft shows from a0, the
# elbow knob is a1..a2, the forearm shaft runs to the wrist knob at a3. Shafts stretch, everything else is carried.
KNOBS = {1: (0.32, 0.378, 0.418, 0.679), -1: (0.33, 0.384, 0.442, 0.700)}
GRID = np.linspace(0, 1.3, 2601)


def mesh():
    ob = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    M = np.array(ob.matrix_world)
    co = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", co)
    V = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    return ob, M, V


def stretch(s):   # |x| -> new |x| for side s: slope k on the shafts, 1 elsewhere, 1 cm smooth ramps
    a0, a1, a2, a3 = KNOBS[s]
    ramp = lambda e: np.clip((GRID - e) / 0.01 + 0.5, 0, 1)
    shaft = ramp(a0) * (1 - ramp(a1)) + ramp(a2) * (1 - ramp(a3))
    k = 1 + G / ((a1 - a0) + (a3 - a2))
    g = 1 + (k - 1) * shaft
    return k, np.concatenate([[0], np.cumsum((g[1:] + g[:-1]) / 2 * np.diff(GRID))])


# 1. the first rig says what is arm (upper arm, forearm, hand, fingers; not the clavicle) on each side
bpy.ops.wm.open_mainfile(filepath=rig)
ob, M, R = mesh()
R = (R - [0, 0, R[:, 2].min()]) * 1.8 / np.ptp(R[:, 2])
names = [g.name.split(":")[-1] for g in ob.vertex_groups]
W = np.zeros((len(R), len(names)))
for v in ob.data.vertices:
    for g in v.groups:
        W[v.index, g.group] = g.weight
W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
arm = {s: W[:, [i for i, n in enumerate(names) if n.startswith(p) and not n.startswith(p + "Shoulder")
                and ("Arm" in n or "Hand" in n)]].sum(1) for s, p in ((1, "Left"), (-1, "Right"))}
tree = KDTree(len(R))
for i, p in enumerate(R):
    tree.insert(p, i)
tree.balance()
print(f"LONGARMS rig x {R[:, 0].min():.3f}..{R[:, 0].max():.3f}, arm vertices L {(arm[1] > 0.5).sum()} R {(arm[-1] > 0.5).sum()}")

# 2. move the paid mesh's arm vertices outward along x
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob, M, V = mesh()
print(f"LONGARMS mesh x {V[:, 0].min():.3f}..{V[:, 0].max():.3f}, z {V[:, 2].min():.3f}..{V[:, 2].max():.3f}")
near = np.array([tree.find(p)[1] for p in V])
dx = np.zeros(len(V))
for s in (1, -1):
    k, f = stretch(s)
    u = np.maximum(s * V[:, 0], 0)
    dx += s * arm[s][near] * (np.interp(u, GRID, f) - u)
    a0, a1, a2, a3 = KNOBS[s]
    print(f"LONGARMS side {s:+d}: k={k:.2f}, elbow knob {(a1 + a2) / 2:.3f} -> {np.interp((a1 + a2) / 2, GRID, f):.3f},"
          f" wrist {a3 + 0.015:.3f} -> {np.interp(a3 + 0.015, GRID, f):.3f}, tip {np.interp(1.0, GRID, f) - 1:+.3f}")
_, gi, n = np.unique(np.round(V, 5), axis=0, return_inverse=True, return_counts=True)   # UV-seam copies move as one
gi = gi.ravel(); m = np.zeros(len(n)); np.add.at(m, gi, dx); dx = m[gi] / n[gi]
V2 = V.copy(); V2[:, 0] += dx
ob.data.vertices.foreach_set("co", ((V2 - M[:3, 3]) @ np.linalg.inv(M[:3, :3]).T).ravel()); ob.data.update()
H = np.ptp(V[:, 2])
print(f"LONGARMS span {np.ptp(V[:, 0]):.2f} -> {np.ptp(V2[:, 0]):.2f} m (x{np.ptp(V2[:, 0]) / H:.2f} of {H:.2f} m),"
      f" moved {(np.abs(dx) > 1e-4).sum()} vertices")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB")
