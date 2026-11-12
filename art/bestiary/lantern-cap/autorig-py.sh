#!/bin/sh
# AUTORIG_PY shim for the lantern-cap: the house autorig's core.py, with arm cross-sections sampled within 0.054 m
# instead of 0.16 m. The cap hangs 0.12 m above the arms and reaches 0.66 m behind the neck, so the stock window
# averaged cap into the shoulder and pulled it 0.18 m behind the body (and its weights onto the cap). And the finger
# finder takes every triangle past the wrist, so the cap rim above the hand became a 'pinky': only the hand's own
# height band (wrist z +-0.126 m) goes to it.
# Run on the Studio: AUTORIG_PY=$PWD/autorig-py.sh ~/dm-rig/tools/rig/autorig.sh clean.glb rig.fbx --markers markers-fixed.json
# shortcut: the 0.03 (of height) window fits limbs thinner than ~0.1 m only; drop this shim if core.py learns to skip a hat.
exec ~/dm-rig/venv/bin/python - "$@" <<'PY'
import sys, os, json, numpy as np
sys.path.insert(0, os.path.dirname(sys.argv[1])); import core
arm = core.arm_section
core.arm_section = lambda g, x, z, rad=0.09: arm(g, x, z, 0.03)
fd = core.find_digits
core.find_digits = lambda V, T, J, side, s: fd(V, T[(abs(V[T][:, :, 2] - J[side + "Hand"][2]) < 0.07).all(1)], J, side, s)
src, dst, mk = sys.argv[2:5]
d = np.load(src)
r = core.solve(d["verts"], d["tris"], json.load(open(mk)) if mk != "-" else None, png=os.path.splitext(dst)[0] + "_markers.png")
np.savez(dst, weights=r["weights"], meta=np.array(json.dumps({k: r[k] for k in ("joints", "markers", "notes", "frame", "bones")})))
PY
