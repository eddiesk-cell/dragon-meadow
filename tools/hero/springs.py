"""Add spring-bone chains for the hero's cloth: two bandana tails (on `head`) and six hem panels below the belt (on `hips`).
  blender -b --python-exit-code 1 -P tools/hero/springs.py -- <rigged-vrm.glb> <out.glb>
Cloth is found by position + the base-colour texture (bandana = green above the neck, hem = anything not the olive
trousers between the belt and the hem). Weights fall off smoothly from the knot / belt line, which stay on head / body.
Bones: spring_<chain>_<n> (simulated by src/springs.js) and spring_<chain>_end (the last bone's tip, no weights).
Prints one line per chain (name, bones, vertices); a chain with 0 vertices is a failure.
"""
import bpy, sys, math
import numpy as np

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
body = max((o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm), key=lambda o: len(o.data.vertices))
assert arm.matrix_world.is_identity and body.matrix_world.is_identity, "expects applied transforms (kimodo_glb.py output)"
me = body.data
N = len(me.vertices)
B = {b.name: b for b in arm.data.bones}
print(f"SPRINGS in: {len(B)} bones, {N} verts")

# --- per-vertex position, base colour (hue/sat), neighbours
co = np.empty(N * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
img = next(n for n in me.materials[0].node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].links[0].from_node.image
W, H = img.size
px = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)[..., :3]
uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get("uv", uv)
li = np.empty(len(me.loops), np.int64); me.loops.foreach_get("vertex_index", li)
vuv = np.zeros((N, 2), np.float32); vuv[li] = uv.reshape(-1, 2)
rgb = px[np.clip((vuv[:, 1] % 1) * H, 0, H - 1).astype(int), np.clip((vuv[:, 0] % 1) * W, 0, W - 1).astype(int)]
mx, mn = rgb.max(1), rgb.min(1); d = np.maximum(mx - mn, 1e-6)
r_, g_, b_ = rgb.T
hue = np.where(mx == r_, ((g_ - b_) / d) % 6, np.where(mx == g_, (b_ - r_) / d + 2, (r_ - g_) / d + 4)) * 60
sat = (mx - mn) / np.maximum(mx, 1e-6)
ed = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get("vertices", ed); ed = ed.reshape(-1, 2)
deg = np.bincount(ed.ravel(), minlength=N).astype(np.float32)


def smooth(s, region, iters=4):
    """Average s with its mesh neighbours inside region (outside stays 0): the falloff has no hard edge on the surface."""
    s = s * region
    for _ in range(iters):
        acc = np.zeros(N, np.float32); np.add.at(acc, ed[:, 0], s[ed[:, 1]]); np.add.at(acc, ed[:, 1], s[ed[:, 0]])
        s = (0.5 * s + 0.5 * acc / np.maximum(deg, 1)) * region
    return s


sstep = lambda a, b, x: (lambda k: k * k * (3 - 2 * k))(np.clip((x - a) / (b - a), 0, 1))
hat = lambda u, n: np.maximum(0, 1 - np.abs(u[:, None] * n - (np.arange(n) + 0.5)))  # bone k of n along u in [0,1]

chains = {}  # name -> dict(parent, joints[list of xyz], verts idx, weights [len(idx) x bones], s [len(idx)])

# --- bandana: green from just under the neck joint up (the lower tail's tip hangs 2 cm under it; lower still is the
# vest, whose folds read olive); the knot sits on the side of the head the tails stick out from. Hue 48+ catches the
# ribbon's darker folds.
above = co[:, 2] > B["neck"].head_local.z - 0.03
bd = (hue > 48) & (hue < 95) & (sat > 0.2) & above
# Shaded folds of the ribbon read off-green: let the mesh neighbours vote, or those vertices stay on the head and the tail
# tears into spikes around them when it swings.
vote = smooth(bd.astype(np.float32), above, 6)
print(f"SPRINGS bandana by hue {bd.sum()}, after neighbour vote {(bd | (vote > 0.45)).sum()}")
bd = bd | (vote > 0.45)
side = np.sign(co[bd, 0].mean())
lat = co[:, 0] * side
K = co[bd & (lat > 0.09) & (lat < 0.14)].mean(0)
tail = bd & (lat > K[0] * side + 0.01)
print(f"SPRINGS bandana: {bd.sum()} green verts, knot at {np.round(K, 3)}, {tail.sum()} in the tails")
ang = np.arctan2(co[:, 2] - K[2], lat - K[0] * side)  # in the front plane: 0 = straight out sideways, <0 = down
far = tail & (lat > K[0] * side + 0.05)
c = np.percentile(ang[far], [80, 20])  # 2-means on angle, seeded high / low
for _ in range(20):
    lab = np.abs(ang[far] - c[0]) > np.abs(ang[far] - c[1])
    c = np.array([ang[far][~lab].mean(), ang[far][lab].mean()])
cut = c.mean()
# Label by mesh connectivity from the clearly separated far ends, so the two ribbons never share vertices where they
# pass close to each other near the knot (angle alone interleaves them there, and they tear into spikes when bent).
lab = np.full(N, -1); lab[far] = (ang[far] < cut).astype(int)
front_ = np.nonzero(lab >= 0)[0]
while len(front_):
    a_, b_ = np.concatenate([ed[:, 0], ed[:, 1]]), np.concatenate([ed[:, 1], ed[:, 0]])
    hit = (lab[a_] >= 0) & (lab[b_] < 0) & tail[b_]
    lab[b_[hit]] = lab[a_[hit]]; front_ = b_[hit]
lab[tail & (lab < 0)] = (ang[tail & (lab < 0)] < cut).astype(int)  # anything the flood could not reach
print(f"SPRINGS bandana tails at {np.degrees(c).round(0)} deg, split at {np.degrees(cut):.0f}, by connectivity {(lab[tail] == 0).sum()} / {(lab[tail] == 1).sum()}")
for nm, m in (("bandana_upper", tail & (lab == 0)), ("bandana_lower", tail & (lab == 1))):
    dist = np.linalg.norm(co - K, axis=1)
    dmax = np.percentile(dist[m], 98)
    J = [K] + [co[m & (np.abs(dist - dmax * k / 3) < dmax / 8)].mean(0) for k in (1, 2)] + [co[m & (dist > 0.9 * dmax)].mean(0)]
    # u: position along the polyline J0..J3, 0 at the knot, 1 at the tip
    idx = np.nonzero(bd)[0]; P = co[idx]; L = [np.linalg.norm(J[k + 1] - J[k]) for k in range(3)]; cum = np.cumsum([0] + L)
    best = np.full(len(idx), 1e9); u = np.zeros(len(idx))
    for k in range(3):
        a, e = J[k], J[k + 1]; t = np.clip(((P - a) @ (e - a)) / L[k] ** 2, 0, 1)
        dd = np.linalg.norm(P - (a + t[:, None] * (e - a)), axis=1)
        sel = dd < best; best[sel] = dd[sel]; u[sel] = (cum[k] + t[sel] * L[k]) / cum[-1]
    s0 = np.zeros(N, np.float32); s0[idx] = sstep(0.0, 0.35, u) * m[idx]
    s = smooth(s0, m | (bd & (dist < 0.03)))  # spreads a little into the knot, never into hair or face
    chains[nm] = dict(parent="head", joints=J, base={"head": 1.0}, idx=idx[s[idx] > 1e-3], u=u[s[idx] > 1e-3], s=s[idx][s[idx] > 1e-3], nb=3)

# --- hem: everything that is not the olive trousers, from the belt (spine root) down to the shirt tails
z_root = B["spine"].head_local.z
pants = (hue >= 40) & (hue < 62) & (sat > 0.3)
band = (co[:, 2] < z_root) & (co[:, 2] > z_root - 0.35) & (np.abs(co[:, 0]) < 0.3)
# Shadowed creases in the trousers fall outside the olive hue: vote with the mesh neighbours so a stray dark vertex
# on the trousers does not get cloth weights (those tear the trouser tops into spikes when the hem swings).
pv = smooth(pants.astype(np.float32), np.ones(N, bool), 6)
print(f"SPRINGS trousers by hue {(band & pants).sum()}, after neighbour vote {(band & (pv > 0.3)).sum()}")
pants = pants | (pv > 0.3)
cloth = band & ~pants
C = np.array([(co[band, 0].min() + co[band, 0].max()) / 2, (co[band, 1].min() + co[band, 1].max()) / 2])
theta = np.arctan2(co[:, 0] - C[0], -(co[:, 1] - C[1]))  # 0 = front (-Y), + toward his left (+X)
rad = np.hypot(co[:, 0] - C[0], co[:, 1] - C[1])
HEM = {"fl": 30, "l": 90, "bl": 150, "br": -150, "r": -90, "fr": -30}
wang = {}
for nm, deg_ in HEM.items():
    da = np.abs((theta - math.radians(deg_) + math.pi) % (2 * math.pi) - math.pi)
    wang[nm] = np.maximum(0, 1 - da / math.radians(60))
    win = cloth & (da < math.radians(20))
    z_tip = np.percentile(co[win, 2], 3)
    J = []
    for zl in (z_root, (z_root + z_tip) / 2, z_tip):
        r = np.median(rad[win & (np.abs(co[:, 2] - zl) < 0.025)])
        J.append(np.array([C[0] + 0.92 * r * math.sin(math.radians(deg_)), C[1] - 0.92 * r * math.cos(math.radians(deg_)), zl]))
    chains["hem_" + nm] = dict(parent="hips", joints=J, z_tip=z_tip)
wsum = sum(wang.values())
z_tip_v = sum(wang[n] * chains["hem_" + n]["z_tip"] for n in HEM) / np.maximum(wsum, 1e-6)
u = np.clip((z_root - co[:, 2]) / (z_root - z_tip_v), 0, 1)
# Smoothed inside the cloth only: s eases to 0 where the shirt's edge is welded to the trousers, so that seam never
# opens and the trousers keep their leg weights (spreading s into them tore their top into spikes when bent).
s = smooth(0.75 * sstep(0.0, 0.55, u) * cloth, cloth, 6)  # ≤ 75 % spring at the hem; the rest stays on legs/hips
hem_idx = np.nonzero(s > 1e-3)[0]
print(f"SPRINGS hem: belt z {z_root:.3f}, {cloth.sum()} cloth + {(band & pants).sum()} trouser verts in the band, {len(hem_idx)} weighted")
for nm in HEM:
    ch = chains["hem_" + nm]
    sel = hem_idx[wang[nm][hem_idx] > 0]
    ch.update(base=None, idx=sel, u=u[sel], s=s[sel] * wang[nm][sel] / wsum[sel], nb=2)

# --- bones
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
for nm, ch in chains.items():
    J = ch["joints"]; prev = eb[ch["parent"]]
    for k in range(len(J) - 1):
        b = eb.new(f"spring_{nm}_{k}"); b.head, b.tail = J[k], J[k + 1]; b.parent = prev; b.use_connect = k > 0; prev = b
    e = eb.new(f"spring_{nm}_end"); e.head = J[-1]; e.tail = J[-1] + (J[-1] - J[-2]) * 0.3; e.parent = prev; e.use_connect = True; e.use_deform = False
bpy.ops.object.mode_set(mode="OBJECT")

# --- weights: new = (1 - s) * old + s * chain, ≤ 4 influences, normalised
gname = {g.index: g.name for g in body.vertex_groups}
new = {}  # vert -> {bone: w}
for nm, ch in chains.items():
    w = hat(ch["u"], ch["nb"]); w /= w.sum(1, keepdims=True)
    for i, ui, si, wi in zip(ch["idx"], ch["u"], ch["s"], w):
        acc = new.setdefault(int(i), {})
        for k in range(ch["nb"]):
            if wi[k] * si > 1e-4:
                acc[f"spring_{nm}_{k}"] = acc.get(f"spring_{nm}_{k}", 0) + float(wi[k] * si)
bset = set(np.nonzero(bd)[0].tolist())
for i, acc in new.items():
    sp = sum(acc.values())
    old = {"head": 1.0} if i in bset else {gname[g.group]: g.weight for g in me.vertices[i].groups if g.weight > 0}
    tot = sum(old.values()) or 1
    for k, v in old.items():
        acc[k] = acc.get(k, 0) + (1 - sp) * v / tot
for i in bset - set(new):  # the knot and the headband ride the head only
    new[i] = {"head": 1.0}
# The two ribbons are welded where they cross near the knot: average each bandana vertex's weights with its bandana
# neighbours so that weld stretches smoothly instead of tearing into shards when the tails part.
cols = ["head"] + [f"spring_{nm}_{k}" for nm in ("bandana_upper", "bandana_lower") for k in range(3)]
Wd = np.zeros((N, len(cols)), np.float32)
for i in bset:
    Wd[i] = [new[i].get(c_, 0) for c_ in cols]
eb_ = ed[bd[ed[:, 0]] & bd[ed[:, 1]]]
dg = np.maximum(np.bincount(eb_.ravel(), minlength=N), 1)[:, None]
for _ in range(4):
    acc = np.zeros_like(Wd); np.add.at(acc, eb_[:, 0], Wd[eb_[:, 1]]); np.add.at(acc, eb_[:, 1], Wd[eb_[:, 0]])
    Wd = np.where(bd[:, None], 0.5 * Wd + 0.5 * acc / dg, Wd)
for i in bset:
    new[i] = {c_: float(w) for c_, w in zip(cols, Wd[i] / Wd[i].sum()) if w > 1e-4}
vg = {g.name: g for g in body.vertex_groups}
for nm in chains:
    for k in range(chains[nm]["nb"]):
        vg[f"spring_{nm}_{k}"] = body.vertex_groups.new(name=f"spring_{nm}_{k}")
for i, acc in new.items():
    top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]; t = sum(w for _, w in top)
    for gi in [g.group for g in me.vertices[i].groups]:
        body.vertex_groups[gi].remove([i])
    for nm, w in top:
        vg[nm].add([i], w / t, "REPLACE")

bad = []
for nm, ch in chains.items():
    nv = sum(1 for i in ch["idx"] if any(n.startswith(f"spring_{nm}_") for n, _ in sorted(new[int(i)].items(), key=lambda kv: -kv[1])[:4]))
    J = ch["joints"]
    print(f"SPRINGS chain spring_{nm}: bones {ch['nb']}, verts {nv}, root {np.round(J[0], 3)}, tip {np.round(J[-1], 3)}, length {sum(np.linalg.norm(J[k + 1] - J[k]) for k in range(len(J) - 1)):.3f} m")
    if nv == 0:
        bad.append(nm)
assert not bad, f"chains with no vertices: {bad}"
assert all(len(v.groups) <= 4 for v in me.vertices if v.index in new)

for o in bpy.data.objects:
    o.select_set(o in (arm, body))
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_skins=True, export_animations=False)
print(f"SPRINGS out: {len(arm.data.bones)} bones ({len(arm.data.bones) - len(B)} added), {len(new)} verts reweighted -> {out}")
