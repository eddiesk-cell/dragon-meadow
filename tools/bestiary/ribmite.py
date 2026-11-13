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
PROF = [(.015, .0025, .0485, .045, .044), (.05, .0065, .053, .045, .043), (.10, .010, .059, .045, .042),
        (.16, .0145, .066, .046, .041), (.22, .019, .073, .047, .040), (.27, .0235, .078, .048, .040),
        (.30, .026, .082, .049, .040), (.306, .025, .079, .052, .041),                        # head | pronotum seam
        (.312, .029, .082, .057, .040), (.37, .032, .084, .058, .040), (.435, .034, .085, .058, .040),
        (.441, .033, .083, .058, .041),                                                        # pronotum | elytra seam
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
        if k <= 8 and s < .305:  # head: a wedge of near-flat faces off a keel ridge
            x, z = hw * c, rim + (top - rim) * (1 - abs(c)) ** .85
        elif k <= 8:  # pronotum and elytra: domes, the elytra parted by a sunken suture
            x, z = hw * math.copysign(abs(c) ** .7, c), rim + (top - rim) * abs(sn) ** .9 - (.0025 if k == 4 and s > .445 else 0)
        else:       # belly, narrower than the shell
            x, z = .70 * hw * math.copysign(abs(c) ** .6, c), rim - (rim - bot) * abs(sn) ** .6
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
    uv = lambda j, i: (u0 + (u1 - u0) * j / sides, v0 + (v1 - v0) * i / (len(pts) - 1))  # v per station: joints land on fixed v
    for i in range(len(pts) - 1):
        a, b = out_rings[i], out_rings[i + 1]
        for j in range(sides):
            jj = (j + 1) % sides
            if len(b) == 1:
                face([a[j], a[jj], b[0]], [uv(j, i), uv(j + 1, i), uv(j + .5, i + 1)])
            else:
                face([a[j], a[jj], b[jj], b[j]], [uv(j, i), uv(j + 1, i), uv(j + 1, i + 1), uv(j, i + 1)])
    return out_rings


# --- legs: hip, coxa, knee, ankle, claw tip (x out, s, z) on the +X side, mirrored for the right. Stations between
#     them alternate thin shafts and bony knobs (coxa, knee, ankle, a tarsal joint), as the concept's legs do.
LEGS = [[(.015, .36, .044), (.027, .355, .047), (.050, .33, .056), (.060, .24, .020), (.071, .158, 0)],
        [(.020, .49, .042), (.033, .495, .046), (.054, .50, .058), (.077, .60, .020), (.092, .68, 0)],
        [(.020, .62, .042), (.033, .64, .046), (.052, .71, .058), (.064, .85, .020), (.077, .98, 0)]]
LEG_R = [.0035, .0050, .0024, .0052, .0021, .0038, .0016, .0028, .0014, .0013, 0]
for n, (hip, cox, knee, ank, tip) in enumerate(map(lambda k: [Vector(p) for p in k], LEGS)):
    pts = [hip, cox, (cox + knee) / 2 + Vector((0, 0, .003)), knee, (knee + ank) / 2 + Vector((.002, 0, 0)), ank,
           *(ank.lerp(tip, f) for f in (.3, .5, .7, .85)), tip]
    for side in (1, -1):
        tube([Vector((side * p.x, Y(p.y), p.z)) for p in pts], LEG_R, 5, 2 * n + (1 if side > 0 else 2), .905, .94)

# --- jaws: flattened hooks from under the head tip curving in, two teeth on the inner edge; and two glossy eyes.
for side in (1, -1):
    jaw = [Vector((side * x, Y(s), z)) for x, s, z in ((.009, .07, .043), (.014, .02, .040), (.016, -.02, .036),
                                                       (.012, -.05, .034), (.005, -.068, .038))]
    tube(jaw, [.005, .0045, .0035, .0025, 0], 5, 0, .86, .895, flat=.75, v1=.9)
    for s, z in ((.0, .0395), (-.035, .036)):  # teeth: three-sided spikes pointing inward
        base = Vector((side * (.016 if s == 0 else .015) - side * .003, Y(s), z))
        tip = base + Vector((-side * .006, -.002, .001))
        tri = [bm.verts.new(base + Vector((0, math.cos(a) * .0016, math.sin(a) * .0012))) for a in (0, 2.1, 4.2)]
        tv = bm.verts.new(tip)
        for v in tri + [tv]:
            v[L_LEG] = v[L_T] = 0
        for j in range(3):
            vs = [tri[j], tri[(j + 1) % 3], tv]
            face(vs if side > 0 else vs[::-1], [(.9, .55), (.91, .55), (.905, .8)][:: 1 if side > 0 else -1])
    eye = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=4, radius=.0065)["verts"]
    for v in eye:
        v.co += Vector((side * .0235, Y(.285), .053))
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
#     .61-.84 belly, .86-.895 jaws, .905-.94 legs (v = station / 10: knobs at .1 .3 .5 .7), .95+ eyes. Colours in sRGB.
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
och = np.where(s < .306, band(.6 + .05 * wob, .2) * ss(.03, .1, s),
      np.where(s < .447, band(.25 + .45 * ((s - .307) / .14) + .05 * wob, .12),
               np.maximum(band(.37 - .13 * e + .04 * wob, .09 * (1 - .45 * e)),
                          band(.70 - .14 * e + .04 * np.sin(np.pi * e) + .05 * wob, (.13 + .06 * np.sin(np.pi * e)) * (1 - .4 * e)))
               * ss(0, .05, e) * (1 - ss(.88, .98, e))))
red = mix((.60, .20, .09), (.40, .10, .05), (ss(.3, .8, n1) * .7 + (n2 - .5) * .5 + (n4 - .5) * .3).clip(0, 1))
shell = mix(red, mix((.80, .52, .21), (.66, .38, .14), (n2 * .8 + (n4 - .5) * .4).clip(0, 1)), och)
dark = np.maximum.reduce([ss(.03, 0, aa) * (s > .447) * .85, ss(.9, 1, p) * .45, ss(.006, 0, np.abs(s - .306)) * .7,
                          ss(.007, 0, np.abs(s - .443)) * .7, ss(.02, 0, aa) * (s < .3) * .25])
shell = mix(shell, (.16, .035, .02), dark)
b = ((UU - .61) / .23).clip(0, 1)
seg = ss(.72, 1, ((s - .45) / .075) % 1) * (s > .45)
belly = mix(mix((.80, .73, .59), (.50, .40, .30), (n2 * .5 + seg).clip(0, 1)), (.26, .13, .08), ss(.3, 0, np.minimum(b, 1 - b)))  # shadow under the lip
crev = ss(.009, 0, np.abs(s % .1 - .05)) * (s < .8) * (UU > .9)  # crevices either side of each leg knob
bone = mix(mix((.88, .82, .70), (.55, .46, .35), (n4 * .5 + ss(.08, 0, s) * .5 + crev * .8).clip(0, 1)), (.30, .14, .08), ss(.84, .95, s))
col = np.where((UU < .6)[..., None], shell, np.where((UU < .85)[..., None], belly,
               np.where((UU < .95)[..., None], bone, np.broadcast_to((.24, .055, .035), shell.shape))))
rough = np.where(UU < .6, .14 + .1 * n2 + .3 * dark, np.where(UU < .85, .6, np.where(UU < .95, .45 - .15 * ss(.84, .95, s), .05)))


def image(name, rgb, non_color=False):
    img = bpy.data.images.new(name, W, H)
    if non_color:  # before the pixels: changing it afterwards silently empties a generated image
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.dstack([rgb, np.ones((H, W))]).astype(np.float32).ravel())
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
mat.use_backface_culling = True  # closed shapes: single-sided in glTF
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
for im in gj["images"]:  # decode the shipped JPEGs: a generated image that lost its pixels ships as flat magenta
    bv = gj["bufferViews"][im["bufferView"]]
    path = os.path.join(bpy.app.tempdir, im["name"] + ".jpg")
    open(path, "wb").write(binc[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]])
    px = np.empty(W * H * 4, np.float32)
    bpy.data.images.load(path).pixels.foreach_get(px)
    shell_rgb = px.reshape(H, W, 4)[:, :int(.58 * W), :3].mean((0, 1))
    print(f"  {im['name']}: shell mean rgb {np.round(shell_rgb, 2)}")
    assert shell_rgb[0] > shell_rgb[1] > shell_rgb[2] if im["name"] == "ribmite_col" else .1 < shell_rgb[1] < .4, im["name"]
print("wrote", out)

# --- renders of the shipped glb (re-imported, so the JPEG atlas and exported normals are what is judged):
#     sheet.png — concept | top, side | three-quarter, lit by a hard blue sky over sand against the concept's grey;
#     swarm.png — 40 copies pouring across sand.
if render_dir:
    import random
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=out)
    mite = next(o for o in bpy.data.objects if o.type == "MESH")
    sc = bpy.context.scene
    sc.render.engine, sc.cycles.samples, sc.cycles.use_denoising = "CYCLES", 96, True
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    sc.world, nt = w, w.node_tree
    N = lambda t: nt.nodes.new(t)
    tco, sep, ramp, grey, mixs, lp = N("ShaderNodeTexCoord"), N("ShaderNodeSeparateXYZ"), N("ShaderNodeValToRGB"), \
        N("ShaderNodeBackground"), N("ShaderNodeMixShader"), N("ShaderNodeLightPath")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = .35, (.22, .14, .08, 1)   # sand below
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 1, (.12, .32, .95, 1)     # hard blue zenith
    for pos, c in ((.5, (.8, .8, .8, 1)), (.7, (.45, .6, .9, 1))):                                       # pale horizon, blue sky
        el = ramp.color_ramp.elements.new(pos)
        el.color = c
    m = N("ShaderNodeMath")
    m.operation, m.inputs[1].default_value = "MULTIPLY_ADD", .5
    m.inputs[2].default_value = .5
    bg = nt.nodes["Background"]
    nt.links.new(tco.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], m.inputs[0])
    nt.links.new(m.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.5
    grey.inputs["Color"].default_value = (.16, .16, .16, 1)
    nt.links.new(lp.outputs["Is Camera Ray"], mixs.inputs[0])
    nt.links.new(bg.outputs[0], mixs.inputs[1])
    nt.links.new(grey.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], nt.nodes["World Output"].inputs["Surface"])
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy, sun.data.angle, sun.data.color = 4, .05, (1, .96, .9)
    sun.rotation_euler = (math.radians(35), 0, math.radians(37))  # from above, ahead and on the side the side view sees
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    tmp = bpy.app.tempdir

    def shot(name, wpx, hpx, loc, look=None, rot=None, ortho=None, lens=50):
        cam.location = loc
        cam.data.type, cam.data.lens = ("ORTHO" if ortho else "PERSP"), lens
        if ortho:
            cam.data.ortho_scale = ortho
        cam.rotation_euler = rot or (Vector(look) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        sc.render.resolution_x, sc.render.resolution_y = wpx, hpx
        sc.render.filepath = os.path.join(tmp, name + ".png")
        bpy.ops.render.render(write_still=True)
        return load(sc.render.filepath)

    def load(path, size=None):
        im = bpy.data.images.load(path)
        if size:
            im.scale(*size)
        a = np.empty(im.size[0] * im.size[1] * 4, np.float32)
        im.pixels.foreach_get(a)
        return a.reshape(im.size[1], im.size[0], 4)[::-1]  # top row first

    def save(path, img):
        h, wd = img.shape[:2]
        im = bpy.data.images.new(os.path.basename(path), wd, h)
        im.pixels.foreach_set(np.ascontiguousarray(img[::-1]).ravel())
        im.filepath_raw, im.file_format = path, "PNG"
        im.save()
        print("wrote", path)

    os.makedirs(render_dir, exist_ok=True)
    sheet = np.ones((1100, 1800, 4), np.float32)
    sheet[:679, :1200] = load(os.path.join(render_dir, "concept.png"), (1200, 679))
    sheet[:679, 1200:] = shot("top", 600, 679, (0, 0, 1), rot=(0, 0, math.pi), ortho=.34)
    sheet[679:, :1200] = shot("side", 1200, 421, (1, 0, .047), rot=(math.pi / 2, 0, math.pi / 2), ortho=.34)
    sheet[679:, 1200:] = shot("three-quarter", 600, 421, (.34, -.36, .24), look=(0, -.01, .04), lens=60)
    save(os.path.join(render_dir, "sheet.png"), sheet)

    # swarm: 40 linked copies on rippled sand, heads mostly one way (a pour), the sky now seen by the camera too
    nt.links.new(bg.outputs[0], nt.nodes["World Output"].inputs["Surface"])
    bpy.ops.mesh.primitive_plane_add(size=12)
    sand = bpy.data.materials.new("sand")
    snt = sand.node_tree
    sb, nz, wv, bump, cr = snt.nodes["Principled BSDF"], snt.nodes.new("ShaderNodeTexNoise"), \
        snt.nodes.new("ShaderNodeTexWave"), snt.nodes.new("ShaderNodeBump"), snt.nodes.new("ShaderNodeValToRGB")
    cr.color_ramp.elements[0].color, cr.color_ramp.elements[1].color = (.26, .12, .045, 1), (.40, .22, .09, 1)
    nz.inputs["Scale"].default_value, wv.inputs["Scale"].default_value, wv.inputs["Distortion"].default_value = 6, 3, 6
    bump.inputs["Strength"].default_value, sb.inputs["Roughness"].default_value = .25, .95
    snt.links.new(nz.outputs["Fac"], cr.inputs[0])
    snt.links.new(cr.outputs["Color"], sb.inputs["Base Color"])
    snt.links.new(wv.outputs["Fac"], bump.inputs["Height"])
    snt.links.new(bump.outputs["Normal"], sb.inputs["Normal"])
    bpy.context.object.data.materials.append(sand)
    rnd, placed = random.Random(4), []
    while len(placed) < 40:
        x, y = rnd.uniform(-.5, .5), rnd.uniform(-1.1, 1.1)
        if (x / .5) ** 2 + (y / 1.1) ** 2 < 1 and all((x - a) ** 2 + (y - b) ** 2 > .12 ** 2 for a, b in placed):
            placed.append((x, y))
    for i, (x, y) in enumerate(placed):
        o = mite if i == 0 else mite.copy()
        if i:
            sc.collection.objects.link(o)
        o.rotation_mode = "XYZ"  # the glTF importer leaves objects in quaternion mode
        o.location, o.rotation_euler = (x, y, 0), (0, 0, math.radians(200) + rnd.gauss(0, .75))
        o.scale = (rnd.uniform(.9, 1.1),) * 3
    sc.cycles.samples = 64
    save(os.path.join(render_dir, "swarm.png"), shot("swarm", 1280, 720, (1.6, -1.9, 1.3), look=(0, .05, 0), lens=40))
