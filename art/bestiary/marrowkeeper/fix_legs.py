#!/usr/bin/env python3
"""The house autorig's core with the Marrowkeeper's hips and knees put on the bony leg, then skinned there.

core.skeleton() takes a leg joint's depth from the biggest solid island on that side at that height. Behind these
shins hangs a cape that is a bigger island than the shin, so the knees landed 15 cm back inside the cape, and at hip
height thigh, coat and cape are one island, so the hips went 13 cm back too: the shins bowed instead of hinging. Here
the bony leg is followed up from the ankle (which core gets right) island by island until it disappears into the
coat; the knee takes that track's depth at knee height, the hip the thigh's own depth centre. x and z stay as placed.
core.solve() then skins on those joints. Also writes legs.json (the track, world metres) for legs_render.py.

Used as autorig's python (autorig runs `$AUTORIG_PY core.py in.npz out.npz markers.json`):
  PATH=~/dm-rig/venv/bin:$PATH AUTORIG_PY=$PWD/fix_legs.py ~/dm-rig/tools/rig/autorig.sh clean.glb rig.fbx --markers m.json
"""
import sys, os, json
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[1])))
import core

TRACK = {}


def bony_leg(g, s, foot):
    """[(z, x, y, rx, ry)] of this side's leg, island by island up from the ankle joint, until the island it continues
    into is 2.5x the leg's usual cross-section (it has joined the coat)."""
    out, prev, area = [], None, []
    half = (np.sign(g.x(np.arange(g.solid.shape[0]))) == s)[:, None]
    for k in range(g.k(foot[2]), g.solid.shape[2]):
        lab, _ = ndimage.label(g.solid[:, :, k] & half)
        if prev is None:
            l = lab[g.i(foot[0]), int((foot[1] - g.lo[1]) / g.h)]
            assert l, "fix_legs: the ankle joint is not inside the leg"
        else:
            hit = lab[prev]; hit = hit[hit > 0]
            if not len(hit):
                break
            l = np.bincount(hit).argmax()
        cur = lab == l
        if area and cur.sum() > 2.5 * np.median(area):
            break
        ii, jj = np.nonzero(cur)
        x, y = g.x(ii), g.y(jj)
        out.append((g.z(k), x.mean(), (y.min() + y.max()) / 2, (x.max() - x.min() + g.h) / 2, (y.max() - y.min() + g.h) / 2))
        area.append(cur.sum()); prev = cur
    return np.array(out)


def skeleton(g, m, P, truth=None, rec=None, _orig=core.skeleton):
    J = _orig(g, m, P, truth, rec)
    knee, hip = [], []
    for side, s in core.SIDES:
        t = TRACK[side] = bony_leg(g, s, J[side + "Foot"])
        kz = J[side + "Leg"][2]
        assert t[-1, 0] > kz + 0.05, f"fix_legs: {side} leg lost below the thigh (track ends at {t[-1, 0]:.3f}, knee {kz:.3f})"
        knee.append(np.interp(kz, t[:, 0], t[:, 2]))
        # shortcut: the hip takes the median depth of the thigh between knee and coat -- right while the thigh is upright
        # in depth (here: -3 mm all the way up, +-6 mm); a creature with a leaning thigh needs a line fit instead.
        hip.append(np.median(t[t[:, 0] > kz, 2]))
    for side, _ in core.SIDES:                   # symmetric, as core makes every other joint
        J[side + "Leg"][1], J[side + "UpLeg"][1] = float(np.mean(knee)), float(np.mean(hip))
    return J


core.skeleton = skeleton
src, dst, mk = sys.argv[2], sys.argv[3], sys.argv[4]          # the rest is core.py's own __main__
d = np.load(src)
r = core.solve(d["verts"], d["tris"], json.load(open(mk)) if mk != "-" else None, png=os.path.splitext(dst)[0] + "_markers.png")
np.savez(dst, weights=r["weights"], meta=np.array(json.dumps({k: r[k] for k in ("joints", "markers", "notes", "frame", "bones")})))
fr = r["frame"]
json.dump({side: (t[:, :5] * fr["H"] + [fr["zb"], fr["cx"], 0, 0, 0]).round(4).tolist() for side, t in TRACK.items()} |
          {"joints": r["joints"]}, open("legs.json", "w"))
for side, _ in core.SIDES:
    print(f"autorig note: fix_legs {side}: knee depth {r['joints'][side + 'Leg'][1] * 1000:+.0f} mm, hip {r['joints'][side + 'UpLeg'][1] * 1000:+.0f} mm "
          f"(bony leg tracked {TRACK[side][0, 0] * fr['H']:.2f}-{TRACK[side][-1, 0] * fr['H']:.2f} m)")
