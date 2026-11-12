"""Give the Driftwight LONG arms before rigging (Eddie: golems and big creatures get long arms, span ~1.5x height,
knuckles at the knees hanging). The paid concept/mesh has human-length arms (span 0.98x), so stretch the T-pose arms
along x from the shoulder out; the hand stretches less. Nets under the arms widen with them. Feet are left alone.
  blender -b -P long_arms.py -- clean-orig.glb clean.glb [span_ratio=1.5]
Run on the Studio in ~/dm-rig/bestiary/driftwight after prep, then `studio-rig.sh driftwight rig` (it keeps clean.glb).
"""
import bpy, sys, numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
src, out, ratio = a[0], a[1], float(a[2]) if len(a) > 2 else 1.5
X0, RAMP, WRIST, K_HAND = 0.31, 0.06, 0.74, 1.3   # metres on the 1.80 m mesh: torso edge, blend, where the hand starts

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob = next(o for o in bpy.data.objects if o.type == "MESH")
co = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
H, tip0 = co[:, 2].max(), np.abs(co[:, 0]).max()

grid = np.linspace(0, tip0, 2000)
def stretch(k):   # |x| -> new |x|: slope 1 on the torso, k along the arm, K_HAND on the hand, smooth at the shoulder
    s = np.clip((grid - X0) / RAMP, 0, 1); s = s * s * (3 - 2 * s)
    g = np.where(grid < WRIST, 1 + (k - 1) * s, K_HAND)
    return np.concatenate([[0], np.cumsum((g[1:] + g[:-1]) / 2 * np.diff(grid))])
t1, t2 = stretch(1)[-1], stretch(2)[-1]
k = 1 + (ratio * H / 2 - t1) / (t2 - t1)          # the tip is linear in k
f = stretch(k)
w = np.clip((co[:, 2] - 0.30) / 0.10, 0, 1)       # 0 at the feet (z < 0.30), 1 from the knees up
ax = np.abs(co[:, 0])
co[:, 0] = np.sign(co[:, 0]) * (ax + w * (np.interp(ax, grid, f) - ax))
ob.data.vertices.foreach_set("co", co.ravel()); ob.data.update()
print(f"LONGARMS k={k:.2f} span {2 * tip0:.2f} -> {2 * np.abs(co[:, 0]).max():.2f} m (x{2 * np.abs(co[:, 0]).max() / H:.2f} of {H:.2f} m)")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False)
