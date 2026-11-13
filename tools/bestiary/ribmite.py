"""Ribmite — one rigid beetle for the Redwaste swarm (BESTIARY.md ## 11, rig route I: no bones, instanced in game).
  blender -b -P tools/bestiary/ribmite.py -- public/models/bestiary/ribmite.glb                    build + check
  blender -b -P tools/bestiary/ribmite.py -- public/models/bestiary/ribmite.glb art/bestiary/ribmite-swarm   + renders
Metres: 0.30 m from jaw tips to tail, head toward glTF +Z, feet on y = 0, origin under the body. One mesh, one
material "ribmite" (512² colour + roughness atlas: polished rust shell with ochre stripes, bone legs and jaws).
Vertex attributes for the TSL leg wiggle (glTF `_LEG`, `_LEGT`; three's GLTFLoader names them `_leg`, `_legt`):
  leg  — 0 body, jaws, eyes; 1..6 legs: odd = left (+X), even = right; 1-2 front, 3-4 middle, 5-6 hind
         (tripod gait: {1, 4, 5} against {2, 3, 6})
  legT — 0 at the hip -> 1 at the claw tip
"""
import bpy, bmesh, sys, os, math, json, struct
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out, render_dir = args[0], (args[1] if len(args) > 1 else None)
bpy.ops.wm.read_factory_settings(use_empty=True)
ss = lambda a, b, x: (lambda k: k * k * (3 - 2 * k))(np.clip((x - a) / (b - a), 0, 1))
Y = lambda s: -0.13 + 0.28 * s  # body station s (0 head tip .. 1 tail) -> Blender Y (head toward -Y = glTF +Z)

bm = bmesh.new()
L_LEG, L_T = bm.verts.layers.float.new("_leg"), bm.verts.layers.float.new("_legT")
uvl = bm.loops.layers.uv.new("UVMap")


def face(vs, uvs):
    f = bm.faces.new(vs)
    f.smooth = True
    for lp, uv in zip(f.loops, uvs):
        lp[uvl].uv = uv
    return f


# --- body: a loft of 16-vertex rings, k 0..8 the shell (k 4 on top), 8..16 the bone belly, tucked in under a lip.
K = 16
#        s      hw     top    rim    belly
PROF = [(.015, .0025, .0485, .046, .044), (.05, .0065, .052, .047, .043), (.10, .010, .058, .049, .042),
        (.16, .0145, .065, .051, .041), (.22, .019, .071, .053, .040), (.27, .0235, .076, .055, .040),
        (.30, .026, .079, .056, .040), (.307, .0235, .074, .055, .041),                       # head | pronotum crease
        (.315, .029, .079, .057, .040), (.37, .032, .082, .058, .040), (.435, .034, .083, .058, .040),
        (.441, .032, .080, .058, .041),                                                        # pronotum | elytra crease
        (.447, .037, .089, .063, .040), (.52, .041, .093, .062, .039), (.62, .044, .095, .060, .039),
        (.72, .043, .093, .057, .040), (.81, .039, .087, .054, .041), (.88, .032, .078, .051, .042),
        (.93, .024, .069, .049, .043), (.97, .013, .059, .048, .045)]
CREASES = {6, 7, 10, 11}  # ring indices whose ring edges are sharp


def ring_uv(k, s):
    return (.01 + .58 * k / 8, s) if k <= 8 else (.61 + .23 * (k - 8) / 8, s)


rings = []
for s, hw, top, rim, bot in PROF:
    ring = []
    for k in range(K):
        th = 2 * math.pi * k / K
        c, sn = math.cos(th), math.sin(th)
        if k <= 8:  # shell dome
            x, z = hw * math.copysign(abs(c) ** .7, c), rim + (top - rim) * abs(sn) ** .9
            if k == 4:
                z += .0015 if s < .3 else (-.0025 if s > .445 else 0)  # head keel, elytra suture
        else:       # belly, narrower than the shell
            x, z = .78 * hw * math.copysign(abs(c) ** .6, c), rim - (rim - bot) * abs(sn) ** .6
        v = bm.verts.new((x, Y(s), z))
        v[L_LEG] = v[L_T] = 0
        ring.append(v)
    rings.append(ring)
for i in range(len(rings) - 1):
    a, b, sa, sb = rings[i], rings[i + 1], PROF[i][0], PROF[i + 1][0]
    for k in range(K):
        kk = (k + 1) % K  # the uv of corner kk uses k + 1, so k 16 lands on the belly's far rim, not back on the shell
        face([a[k], a[kk], b[kk], b[k]], [ring_uv(k, sa), ring_uv(k + 1, sa), ring_uv(k + 1, sb), ring_uv(k, sb)])
for pole_s, z, ring, flip in ((0, .046, rings[0], True), (1, .050, rings[-1], False)):
    p = bm.verts.new((0, Y(pole_s), z))
    p[L_LEG] = p[L_T] = 0
    for k in range(K):
        kk = (k + 1) % K
        vs, uvs = [ring[k], ring[kk], p], [ring_uv(k, PROF[0 if flip else -1][0]), ring_uv(k + 1, PROF[0 if flip else -1][0]),
                                           ring_uv(k + .5, pole_s)]
        face(vs[::-1] if flip else vs, uvs[::-1] if flip else uvs)
bm.edges.ensure_lookup_table()
for i in CREASES:  # sharp ring edges at the two plate joints
    for k in range(K):
        bm.edges.get((rings[i][k], rings[i][(k + 1) % K])).smooth = False
for i in range(len(rings) - 1):  # sharp shell lip (k 0 and 8), head keel and elytra suture (k 4)
    for k in (0, 8) + ((4,) if PROF[i][0] < .3 or PROF[i][0] > .445 else ()):
        bm.edges.get((rings[i][k], rings[i + 1][k])).smooth = False


def tube(pts, rads, sides, leg, u0, u1, flat=1.0, v0=0.0, v1=1.0):
    """A tapering tube through pts (last radius 0 = a pointed tip), frames by parallel transport; legT = arc length 0..1."""
    acc = [0.0]
    for p, q in zip(pts, pts[1:]):
        acc.append(acc[-1] + (q - p).length)
    T = [x / acc[-1] for x in acc]
    nrm, out_rings = None, []
    for i, (p, r) in enumerate(zip(pts, rads)):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        nrm = (t.cross(Vector((0, 0, 1))) if nrm is None else nrm - t * nrm.dot(t)).normalized()
        b = t.cross(nrm)
        ring = [bm.verts.new(p)] if r == 0 else \
               [bm.verts.new(p + (nrm * math.cos(a) + b * math.sin(a) * flat) * r) for a in (2 * math.pi * j / sides for j in range(sides))]
        for v in ring:
            v[L_LEG], v[L_T] = leg, (T[i] if leg else 0)  # jaws are body: legT 0
        out_rings.append(ring)
    uv = lambda j, i: (u0 + (u1 - u0) * j / sides, v0 + (v1 - v0) * T[i])
    for i in range(len(pts) - 1):
        a, b = out_rings[i], out_rings[i + 1]
        for j in range(sides):
            jj = (j + 1) % sides
            if len(b) == 1:
                face([a[j], a[jj], b[0]], [uv(j, i), uv(j + 1, i), uv(j + .5, i + 1)])
            else:
                face([a[j], a[jj], b[jj], b[j]], [uv(j, i), uv(j + 1, i), uv(j + 1, i + 1), uv(j, i + 1)])
    return out_rings


# --- legs (x out, s, z), the +X side; mirrored for the right. Bulged rings are the coxa, knee, ankle and a tarsus joint.
LEGS = [[(.017, .36, .044), (.027, .355, .046), (.040, .345, .049), (.050, .33, .047), (.055, .29, .034), (.058, .25, .022),
         (.064, .20, .010), (.068, .175, .004), (.071, .158, 0)],
        [(.024, .49, .042), (.033, .495, .045), (.043, .497, .049), (.052, .50, .050), (.064, .55, .036), (.075, .60, .022),
         (.084, .645, .009), (.089, .665, .004), (.092, .68, 0)],
        [(.024, .62, .042), (.033, .64, .045), (.042, .675, .049), (.050, .71, .050), (.056, .78, .036), (.062, .85, .022),
         (.069, .92, .009), (.073, .955, .004), (.077, .98, 0)]]
LEG_R = [.0035, .0042, .0028, .0040, .0024, .0031, .0019, .0015, 0]
for n, key in enumerate(LEGS):
    for side in (1, -1):
        tube([Vector((side * x, Y(s), z)) for x, s, z in key], LEG_R, 5, 2 * n + (1 if side > 0 else 2), .86, .94)

# --- jaws: flattened hooks from under the head tip curving in, two teeth on the inner edge; and two glossy eyes.
for side in (1, -1):
    jaw = [Vector((side * x, Y(s), z)) for x, s, z in ((.009, .07, .043), (.014, .02, .042), (.016, -.02, .041),
                                                       (.013, -.05, .039), (.006, -.07, .037))]
    tube(jaw, [.0045, .004, .0033, .0022, 0], 5, 0, .86, .94, flat=.6, v1=.9)
    for s, z in ((.0, .0415), (-.035, .040)):  # teeth: three-sided spikes pointing inward
        base = Vector((side * (.016 if s == 0 else .015) - side * .003, Y(s), z))
        tip = base + Vector((-side * .006, -.002, .001))
        tri = [bm.verts.new(base + Vector((0, math.cos(a) * .0016, math.sin(a) * .0012))) for a in (0, 2.1, 4.2)]
        tv = bm.verts.new(tip)
        for v in tri + [tv]:
            v[L_LEG] = v[L_T] = 0
        for j in range(3):
            vs = [tri[j], tri[(j + 1) % 3], tv]
            face(vs if side > 0 else vs[::-1], [(.9, .55), (.91, .55), (.905, .8)][:: 1 if side > 0 else -1])
    eye = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=.0055)["verts"]
    for v in eye:
        v.co += Vector((side * .0235, Y(.285), .057))
        v[L_LEG] = v[L_T] = 0
    for f in {f for v in eye for f in v.link_faces}:
        f.smooth = True
        for lp in f.loops:
            lp[uvl].uv = (.975, .5)

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("ribmite")
bm.to_mesh(me)
bm.free()
ob = bpy.data.objects.new("ribmite", me)
bpy.context.collection.objects.link(ob)

# --- textures, painted in numpy in the atlas: u .01-.59 shell (|2u'-1| = 0 on the midline .. 1 at the lip, v = s),
#     .61-.84 belly, .86-.94 legs and jaws (v = legT), .95+ eyes. Colours in sRGB.
H = W = 512
rng = np.random.default_rng(11)
UU, VV = np.meshgrid((np.arange(W) + .5) / W, (np.arange(H) + .5) / H)


def vnoise(gy, gx):
    g = rng.random((gy + 2, gx + 2))
    y, x = VV * gy, UU * gx
    yi, xi = y.astype(int), x.astype(int)
    fy, fx = ss(0, 1, y - yi), ss(0, 1, x - xi)
    return (g[yi, xi] * (1 - fx) + g[yi, xi + 1] * fx) * (1 - fy) + (g[yi + 1, xi] * (1 - fx) + g[yi + 1, xi + 1] * fx) * fy


n1, n2, n3, n4 = vnoise(10, 14), vnoise(40, 160), vnoise(14, 50), vnoise(120, 300)
mix = lambda a, b, k: np.asarray(a) * (1 - k[..., None]) + np.asarray(b) * k[..., None]
s = VV
aa = np.abs((UU - .01) / .58 * 2 - 1).clip(0, 1)
p = np.sin(aa * np.pi / 2) ** .7  # where across the half-shell a texel lands, as seen from above
e = ((s - .447) / .553).clip(0, 1)
band = lambda c, w: 1 - ss(w * .65, w, np.abs(p - c))
wob = n3 - .5
och = np.where(s < .307, band(.6 + .05 * wob, .14) * ss(.03, .1, s),
      np.where(s < .447, band(.25 + .45 * ((s - .307) / .14) + .05 * wob, .12),
               np.maximum(band(.37 - .13 * e + .04 * wob, .065 * (1 - .5 * e)),
                          band(.70 - .14 * e + .04 * np.sin(np.pi * e) + .05 * wob, (.085 + .05 * np.sin(np.pi * e)) * (1 - .4 * e)))
               * ss(0, .05, e) * (1 - ss(.88, .98, e))))
red = mix((.56, .17, .09), (.36, .075, .045), (ss(.3, .8, n1) * .7 + (n2 - .5) * .5 + (n4 - .5) * .3).clip(0, 1))
shell = mix(red, mix((.80, .52, .21), (.66, .38, .14), (n2 * .8 + (n4 - .5) * .4).clip(0, 1)), och)
dark = np.maximum.reduce([ss(.03, 0, aa) * (s > .447) * .85, ss(.9, 1, p) * .45, ss(.006, 0, np.abs(s - .307)) * .7,
                          ss(.007, 0, np.abs(s - .443)) * .7, ss(.02, 0, aa) * (s < .3) * .25])
shell = mix(shell, (.16, .035, .02), dark)
b = ((UU - .61) / .23).clip(0, 1)
seg = ss(.72, 1, ((s - .45) / .075) % 1) * (s > .45)
belly = mix(mix((.80, .73, .59), (.62, .52, .40), (n2 * .6 + seg * .7).clip(0, 1)), (.38, .15, .09), ss(.18, 0, np.minimum(b, 1 - b)))
bone = mix(mix((.88, .82, .70), (.70, .62, .50), (n4 * .6 + ss(.08, 0, s) * .5).clip(0, 1)), (.30, .14, .08), ss(.84, .95, s))
col = np.where((UU < .6)[..., None], shell, np.where((UU < .85)[..., None], belly,
               np.where((UU < .95)[..., None], bone, np.broadcast_to((.24, .055, .035), shell.shape))))
rough = np.where(UU < .6, .14 + .1 * n2 + .3 * dark, np.where(UU < .85, .6, np.where(UU < .95, .45 - .15 * ss(.84, .95, s), .05)))


def image(name, rgb, non_color=False):
    img = bpy.data.images.new(name, W, H)
    img.pixels.foreach_set(np.dstack([rgb, np.ones((H, W))]).astype(np.float32).ravel())
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pack()
    return img


mat = bpy.data.materials.new("ribmite")

nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
tc, tr, sep = nt.nodes.new("ShaderNodeTexImage"), nt.nodes.new("ShaderNodeTexImage"), nt.nodes.new("ShaderNodeSeparateColor")
tc.image = image("ribmite_col", col)
tr.image = image("ribmite_rough", np.dstack([np.ones((H, W)), rough, np.zeros((H, W))]), True)
nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(tr.outputs["Color"], sep.inputs["Color"])
nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
bsdf.inputs["Metallic"].default_value = 0
me.materials.append(mat)

tris = sum(len(f.vertices) - 2 for f in me.polygons)
xs, ys, zs = zip(*(v.co for v in me.vertices))
print(f"ribmite: {tris} tris, {len(me.vertices)} verts; length {max(ys) - min(ys):.3f} m, legspan {max(xs) - min(xs):.3f} m, "
      f"height {max(zs) - min(zs):.3f} m, feet at z {min(zs):.4f}")
bpy.ops.object.select_all(action="SELECT")
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format="GLB", export_yup=True, export_attributes=True,
                          export_image_format="JPEG", export_image_quality=88)

# --- check what shipped: read the attributes back out of the glb itself.
d = open(out, "rb").read()
jl = struct.unpack("<I", d[12:16])[0]
gj, binc = json.loads(d[20:20 + jl]), d[20 + jl + 8:]


def acc(i):
    a = gj["accessors"][i]
    bv = gj["bufferViews"][a["bufferView"]]
    return np.frombuffer(binc, np.float32, a["count"], bv.get("byteOffset", 0) + a.get("byteOffset", 0))


prims = gj["meshes"][0]["primitives"]
at = prims[0]["attributes"]
leg, legt = acc(at["_LEG"]), acc(at["_LEGT"])
for n in range(7):
    m = leg == n
    print(f"  leg {n}: {m.sum()} verts, legT {legt[m].min():.2f}..{legt[m].max():.2f}")
size = os.path.getsize(out)
print(f"glb {size / 1024:.0f} KB, {len(prims)} primitive(s), attributes {sorted(at)}")
assert len(prims) == 1 and tris <= 1500 and size <= 300 * 1024, "over budget"
assert all((leg == n).sum() > 0 and legt[leg == n].min() == 0 and legt[leg == n].max() == 1 for n in range(1, 7)), "leg tags"
assert abs(min(zs)) < 1e-4, "feet not on the ground"
print("wrote", out)
