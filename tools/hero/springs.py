"""Add spring-bone chains for the hero's cloth: two bandana tails (on `head`) and six hem panels below the belt (on `hips`).
  blender -b --python-exit-code 1 -P tools/hero/springs.py -- <rigged-vrm.glb> <out.glb>
Cloth is found by position + the base-colour texture (bandana = green above the neck, hem = anything not the olive
trousers between the belt and the hem). Weights fall off smoothly from the headband / belt line, which stay on head / body.
The generated mesh welds the two bandana ribbons together in places; they are ripped apart (vertices split) so each tail
moves on its own chain, and every bandana vertex is weighted along ONE chain in order: head -> 0 -> 1 -> 2.
Bones: spring_<chain>_<n> (simulated by src/springs.js) and spring_<chain>_end (the last bone's tip, no weights).
Prints one line per chain (name, bones, vertices); a chain with 0 vertices is a failure.
"""
import bpy, bmesh, sys, math
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


def topo():
    ed = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get("vertices", ed); ed = ed.reshape(-1, 2)
    return ed, np.bincount(ed.ravel(), minlength=N).astype(np.float32)


ed, deg = topo()


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

# The mesh welds the ribbons where they touch (out to ~9 cm from the knot). One vertex cannot follow two tails, so rip the
# mesh along the seam between upper-ribbon and lower-ribbon faces: each side keeps its own copy of the seam vertices.
fv = np.empty(len(me.polygons) * 3, np.int64); me.polygons.foreach_get("vertices", fv); fv = fv.reshape(-1, 3)
lv = np.where(tail, lab, -1)
fl = np.where((lv[fv] >= 0).all(1), (lv[fv] == 1).sum(1) >= 2, -1).astype(int)  # a ribbon face goes with most of its corners
bm = bmesh.new(); bm.from_mesh(me); bm.edges.ensure_lookup_table()
seam = [e for e in bm.edges if {fl[f.index] for f in e.link_faces} >= {0, 1}]
cut_v, n_seam = np.unique([v.index for e in seam for v in e.verts]), len(seam)
bmesh.ops.split_edges(bm, edges=seam)
bm.to_mesh(me); bm.free()
N0, N = N, len(me.vertices)
co0 = co; co = np.empty(N * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
assert np.allclose(co[:N0], co0), "rip renumbered the vertices"
src = np.arange(N)  # each new vertex is a copy of a seam vertex: find which, and copy every per-vertex fact from it
for j in range(N0, N):
    src[j] = cut_v[np.argmin(np.linalg.norm(co0[cut_v] - co[j], axis=1))]
hue, sat, bd, tail, lab, lat, above, ang = (a[src] for a in (hue, sat, bd, tail, lab, lat, above, ang))
ed, deg = topo()
fv = np.empty(len(me.polygons) * 3, np.int64); me.polygons.foreach_get("vertices", fv); fv = fv.reshape(-1, 3)
for lb in (0, 1):  # a vertex on ribbon faces only takes that ribbon's label
    on = np.zeros(N, bool); on[fv[fl == lb].ravel()] = True; off_ = np.zeros(N, bool); off_[fv[fl == 1 - lb].ravel()] = True
    lab[tail & on & ~off_] = lb
cross = tail[ed[:, 0]] & tail[ed[:, 1]] & (lab[ed[:, 0]] != lab[ed[:, 1]])
print(f"SPRINGS bandana: ripped {n_seam} seam edges ({N - N0} vertices split), upper-lower edges left {cross.sum()}")


def spread(f, region, iters, fixed=None):
    """Average f over mesh neighbours inside region only (outside neighbours do not count); `fixed` vertices keep f."""
    e = ed[region[ed[:, 0]] & region[ed[:, 1]]]
    cnt = np.maximum(np.bincount(e.ravel(), minlength=N), 1)
    for _ in range(iters):
        acc = np.zeros(N); np.add.at(acc, e[:, 0], f[e[:, 1]]); np.add.at(acc, e[:, 1], f[e[:, 0]])
        g = np.where(np.bincount(e.ravel(), minlength=N) > 0, 0.5 * f + 0.5 * acc / cnt, f)
        f = np.where(region if fixed is None else region & ~fixed, g, f)
    return f


# Weights as one number per vertex, mb: 0 = head, 1 = bone 0, 2 = bone 1, 3 = bone 2, and a vertex between two whole
# numbers blends just those two bones, so every bandana vertex is weighted along ONE chain, in order. mb is smoothed over
# the surface with the headband held at 0 and the tips at 3, so neighbours never differ much and a swing spreads over the
# ribbon. The knot near the tails is cloth too and gives a little (the mesh sews it to the ribbons with long slivers that
# tear when the knot stays rigid); the band round his head rides the head.
dK = np.linalg.norm(co - K, axis=1)
band = bd & ~tail & (dK > 0.07)
free = bd & ~tail & ~band
mb, own, fix, uu = np.zeros(N), np.full(N, -1), band.copy(), np.zeros(N)
ind = []
for lb in (0, 1):
    m = tail & (lab == lb)
    ind.append(spread(m.astype(float), m | free, 12, fixed=m))  # which tail a knot vertex hangs nearer to
    e = ed[(m[ed[:, 0]] & free[ed[:, 1]]) | (m[ed[:, 1]] & free[ed[:, 0]])]
    A = co[np.unique(e[free[e]])].mean(0)  # pivot: where the ribbon is sewn to the knot
    dist = np.linalg.norm(co - A, axis=1); dmax = np.percentile(dist[m], 98)
    uu[m] = dist[m] / dmax; mb[m] = 3 * np.minimum(uu[m], 1); fix |= m & (uu > 0.9); own[m] = lb
    chains[("bandana_upper", "bandana_lower")[lb]] = dict(parent="head", A=A, m=m, nb=3)
own[free] = np.argmax(ind, 0)[free]
# where the knot switches from hanging off one tail to the other it gives with neither: neighbours there would otherwise
# follow different tails and split apart
seam_k = free & (np.abs(ind[0] - ind[1]) < 0.25 * (ind[0] + ind[1]))
mb = spread(mb, bd, 150, fixed=fix | seam_k)
print(f"SPRINGS bandana: band {band.sum()} verts on the head, knot {free.sum()} verts give with the tails (max mb {mb[free].max():.2f}), {seam_k.sum()} between the tails hold still")
for lb, nm in enumerate(("bandana_upper", "bandana_lower")):
    ch = chains[nm]; m = ch["m"]
    J = [ch["A"]] + [co[m & (np.abs(mb - c) < 0.25)].mean(0) for c in (1.5, 2.5)] + [co[m & (uu > 0.9)].mean(0)]  # joints mid-blend
    idx = np.nonzero((own == lb) & (mb > 1e-3))[0]
    ch.update(joints=J, idx=idx, u=(np.clip(mb[idx] - 1, 0, 2) + 0.5) / 3, s=np.minimum(mb[idx], 1).astype(np.float32))

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
bset = bset_all = set(np.nonzero(bd)[0].tolist())
for i, acc in new.items():
    old = {"head": 1.0} if i in bset else {gname[g.group]: g.weight for g in me.vertices[i].groups if g.weight > 0}
    tot = sum(old.values()) or 1
    if i not in bset:  # where the cloth lies on a thigh it keeps following that leg: less spring, so the leg never pokes through
        f = 1 - sum(w for k, w in old.items() if "Leg" in k) / tot
        for k in acc:
            acc[k] *= f
    sp = sum(acc.values())
    for k, v in old.items():
        if (1 - sp) * v / tot > 1e-4:
            acc[k] = acc.get(k, 0) + (1 - sp) * v / tot
for i in bset - set(new):  # the knot and the headband ride the head only
    new[i] = {"head": 1.0}
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

# Proof the bandana is weighted in order: no vertex mixes the head with a tail's last bone, or the two tails.
bw = {i: new[i] for i in bset_all if i in new}
mixh = sum(1 for w in bw.values() if "head" in w and any(k.endswith("_2") for k in w))
mixt = sum(1 for w in bw.values() if any("upper" in k for k in w) and any("lower" in k for k in w))
print(f"SPRINGS bandana weights: {len(bw)} verts, head+tip-bone {mixh}, upper+lower {mixt}")
assert mixh == 0 and mixt == 0, "bandana weights out of order"
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
