#!/bin/sh
# AUTORIG_PY shim for the Rootbinder: the house autorig's core.py with two changes.
# 1. The torso centre: core.canon takes the middle of the 0.45-0.70 height band's x extent, and a root tendril hanging
#    off the left arm reaches into that band at x 0.48, so the spine, hips and head went 0.15 m to the left of the body.
#    Here the band's 2nd..98th percentile x decides (the tendril is a few dozen vertices).
# 2. No garment pass: the legs are twisted root trunks, and the gaps between the roots read as hanging panels, so roots
#    below the knee followed the thigh. Every root wraps its own limb; nothing on it hangs from the waist.
# Run on the Studio: AUTORIG_PY=$PWD/autorig-py.sh ~/dm-rig/tools/rig/autorig.sh clean.glb rig.fbx --markers markers-fixed.json
exec ~/dm-rig/venv/bin/python - "$@" <<'PY'
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(sys.argv[1])); import core

def canon(V):
    zb = float(V[:, 2].min()); H = float(np.ptp(V[:, 2]))
    band = V[(V[:, 2] > zb + 0.45 * H) & (V[:, 2] < zb + 0.70 * H), 0]
    cx = float(np.percentile(band, [2, 98]).mean())
    print(f"autorig shim: torso centre x {cx:+.3f} (stock {(band.min() + band.max()) / 2:+.3f})")
    return (V - [cx, 0, zb]) / H, dict(cx=cx, zb=zb, H=H)

core.canon = canon
core.garment_voxels = lambda g, J, r=0.012: np.zeros_like(g.solid)
src, dst, mk = sys.argv[2:5]
d = np.load(src)
r = core.solve(d["verts"], d["tris"], json.load(open(mk)) if mk != "-" else None, png=os.path.splitext(dst)[0] + "_markers.png")
np.savez(dst, weights=r["weights"], meta=np.array(json.dumps({k: r[k] for k in ("joints", "markers", "notes", "frame", "bones")})))
PY
