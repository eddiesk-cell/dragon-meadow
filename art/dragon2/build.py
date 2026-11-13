# blender -b -P art/dragon2/build.py -- public/models/dragon-winter.glb art/dragon2/hunyuan.glb public/models/dragon.glb
# dragon2: the Hunyuan3D body of concept-b on the winter dragon's 50-bone rig and clips. Blender coords: +Z up, head at -Y.
# 1. The rig is refitted to the new body (neck, head, jaw, legs measured from art/dragon2 slices/overlays; wings moved
#    from over the hind legs to just behind the saddle, parented to chest). Only root carries translation keys, so the
#    clips' rotations carry over onto the new rest.
# 2. The body is cut to a web budget and skinned from the old body's weights: the old body is first posed onto the new
#    rest (so its weights sit where the new bones are), then copied by nearest surface. The saddle rides chest rigidly.
# 3. New wings: a strut along every wing bone, claws, and a membrane between the fingers, skinned to wing bones only.
import bpy, bmesh, sys, math, os
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

src, hy, out = sys.argv[sys.argv.index('--') + 1:][:3]
HERE = os.path.dirname(os.path.abspath(__file__))
S, T = 3.6, Vector((0, -0.99, 0))       # Hunyuan units -> the old body's size (4.09 m nose to tail), feet on z 0
TRIS = 52000                             # body budget (wings add ~4k)
rng = np.random.default_rng(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)  # the importer's bone-display shape
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for pb in arm.pose.bones: pb.custom_shape = None
old_body = bpy.data.objects['winter-dragon-body']
for n in ('winter-dragon-mouth', 'wing-l-bones', 'wing-r-bones', 'wing-l-membrane', 'wing-r-membrane'):
    bpy.data.objects.remove(bpy.data.objects[n])
arm.data.pose_position = 'REST'; bpy.context.view_layer.update()
seat0 = bpy.data.objects['rider-seat'].matrix_world.translation.copy()
old_bvh = BVHTree.FromObject(old_body, bpy.context.evaluated_depsgraph_get())
old_seat_gap = seat0.z - old_bvh.ray_cast(Vector((0, seat0.y, 3)), Vector((0, 0, -1)))[0].z

# The old body's copy rig: old rest, later posed onto the new rest to carry its weights to the new bones.
arm0 = arm.copy(); arm0.data = arm.data.copy(); bpy.context.scene.collection.objects.link(arm0); arm0.animation_data_clear()
for m in old_body.modifiers:
    if m.type == 'ARMATURE': m.object = arm0

# ---- 1. refit the rig ----
V = Vector
FIT = { # bone: (head, tail), left side; right is mirrored. Measured on the body (slices at 5 cm steps, side overlays).
    'neck1': (V((0, -1.60, 1.10)), V((0, -1.66, 1.19))), 'neck2': (None, V((0, -1.69, 1.28))),
    'neck3': (None, V((0, -1.70, 1.37))), 'neck4': (None, V((0, -1.70, 1.46))),
    'head': (V((0, -1.70, 1.46)), V((0, -1.843, 1.466))), 'jaw': (V((0, -1.74, 1.45)), V((0, -1.97, 1.43))),
    'fore-l-upper': (V((-0.25, -1.42, 0.92)), V((-0.27, -1.50, 0.58))), 'fore-l-lower': (None, V((-0.27, -1.52, 0.19))),
    'fore-l-foot': (None, V((-0.33, -1.88, -0.01))),
    'hind-l-thigh': (V((-0.26, -0.72, 0.90)), V((-0.27, -0.86, 0.56))), 'hind-l-shin': (None, V((-0.28, -0.57, 0.29))),
    'hind-l-foot': (None, V((-0.36, -0.82, 0.0))),
}
ROOT = V((-0.18, -0.95, 1.04))           # left wing root: on the mound just behind the saddle, over the fore shoulder
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
for name, (h, t) in list(FIT.items()) + [(k.replace('-l-', '-r-'), v) for k, v in FIT.items() if '-l-' in k]:
    mir = (lambda p: V((-p.x, p.y, p.z))) if '-r-' in name else (lambda p: p)
    b = eb[name]
    b.head = mir(h) if h else b.parent.tail.copy()
    b.tail = mir(t)
for side, sx in (('l', 1), ('r', -1)):
    d = V((ROOT.x * sx, ROOT.y, ROOT.z)) - eb[f'wing-{side}-shoulder'].head
    for b in [b for b in eb if b.name.startswith(f'wing-{side}-')]: b.head, b.tail = b.head + d, b.tail + d
    eb[f'wing-{side}-shoulder'].parent = eb['chest']
P = {b.name: (b.head.copy(), b.tail.copy()) for b in eb}
bpy.ops.object.mode_set(mode='OBJECT')

# Pose the old rig onto the new rest and freeze the old body there: its weights now sit around the new bones.
for pb in sorted(arm0.pose.bones, key=lambda p: len(p.parent_recursive)):
    pb.matrix = arm.data.bones[pb.name].matrix_local
    bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
src_mesh = bpy.data.meshes.new_from_object(old_body.evaluated_get(dg))
ref = bpy.data.objects.new('old-ref', src_mesh); bpy.context.scene.collection.objects.link(ref)
ref.matrix_world = old_body.matrix_world.copy()
for g in old_body.vertex_groups: ref.vertex_groups.new(name=g.name)
for v in old_body.data.vertices:
    for g in v.groups: ref.vertex_groups[g.group].add([v.index], g.weight, 'REPLACE')
bpy.data.objects.remove(old_body); bpy.data.objects.remove(arm0)

# ---- 2. the body ----
bpy.ops.import_scene.gltf(filepath=hy, merge_vertices=True)
body = next(o for o in bpy.context.selected_objects if o.type == 'MESH')
body.name = body.data.name = 'dragon2-body'
body.data.transform(Matrix.Translation(T) @ Matrix.Scale(S, 4) @ body.matrix_world); body.matrix_world = Matrix()
dec = body.modifiers.new('dec', 'DECIMATE'); dec.ratio = TRIS / len(body.data.polygons)
bpy.context.view_layer.objects.active = body; bpy.ops.object.modifier_apply(modifier='dec')
for p in body.data.polygons: p.use_smooth = True
print('BODY tris', sum(len(p.vertices) - 2 for p in body.data.polygons), 'verts', len(body.data.vertices))

dt = body.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = ref
dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
bpy.ops.object.datalayout_transfer(modifier='dt'); bpy.ops.object.modifier_apply(modifier='dt')
bpy.data.objects.remove(ref)

# Texture: 2k base colour; the glowing cyan spots become an emissive mask (mask², the flora convention).
mat = body.data.materials[0]; mat.name = 'dragon2-body'
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
img = next(n.image for n in nt.nodes if n.type == 'TEX_IMAGE'); img.scale(2048, 2048); img.name = 'dragon2-body'
W = 2048; px = np.empty(W * W * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(W, W, 4)
r, g, b = px[..., 0], px[..., 1], px[..., 2]; gb = np.minimum(g, b)
spot = (np.clip((gb - r - 0.2) / 0.2, 0, 1) * np.clip((gb - 0.42) / 0.2, 0, 1)) ** 2
em = np.zeros_like(px); em[..., 0], em[..., 1], em[..., 2], em[..., 3] = spot * 0.35, spot, spot * 0.95, 1
emi = bpy.data.images.new('dragon2-glow', W, W); emi.pixels.foreach_set(em.ravel())
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = emi
nt.links.new(tn.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0
bsdf.inputs['Roughness'].default_value = 0.5; bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Specular IOR Level'].default_value = 0.5; mat.use_backface_culling = True
print('GLOW texels', int((spot > 0.25).sum()))

# Per-vertex colour from the texture (saddle detection) and weights cleanup.
uv = body.data.uv_layers.active.data
vcol = np.zeros((len(body.data.vertices), 3)); cnt = np.zeros(len(body.data.vertices))
for poly in body.data.polygons:
    for li, vi in zip(poly.loop_indices, poly.vertices):
        u, v = uv[li].uv; vcol[vi] += px[min(W - 1, int(v * W)), min(W - 1, int(u * W)), :3]; cnt[vi] += 1
vcol /= np.maximum(cnt, 1)[:, None]
gi = {g.name: g.index for g in body.vertex_groups}
wing_g = {gi[n] for n in gi if n.startswith('wing-')}
saddle = 0
for v in body.data.vertices:
    c = vcol[v.index]; co = v.co
    brown = c[0] > c[1] * 1.12 and c[1] >= c[2] * 0.95 and max(c) < 0.62 and max(c) > 0.06
    if brown and -1.62 < co.y < -0.92 and co.z > 0.72 and abs(co.x) < 0.42:   # saddle, its flaps and pouch: rigid on chest
        for gg in list(v.groups): body.vertex_groups[gg.group].remove([v.index])
        body.vertex_groups['chest'].add([v.index], 1.0, 'REPLACE'); saddle += 1; continue
    ws = [(gg.group, gg.weight) for gg in v.groups if gg.group not in wing_g and gg.weight > 1e-4]
    for gg in list(v.groups):
        if gg.group in wing_g: body.vertex_groups[gg.group].remove([v.index])
    if not ws: body.vertex_groups['spine'].add([v.index], 1.0, 'REPLACE')
print('SADDLE verts', saddle)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
body.parent = arm; body.matrix_parent_inverse = arm.matrix_world.inverted()
body.modifiers.new('Armature', 'ARMATURE').object = arm

# Rider seat: the dip of the new saddle, as high over it as the old seat was over the old saddle.
bpy.context.view_layer.update()
bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
tops = [(bvh.ray_cast(V((0, y, 3)), V((0, 0, -1)))[0], y) for y in np.arange(-1.35, -1.1, 0.01)]
print('TOPS', [(round(y, 2), round(h.z, 3)) for h, y in tops if h]); low = min((h.z, y) for h, y in tops if h)
seat = V((0, low[1], low[0] + old_seat_gap)); dseat = seat - seat0
for e in [o for o in bpy.data.objects if o.name.startswith('rider-')]:
    e.matrix_world = Matrix.Translation(e.matrix_world.translation + dseat) @ e.matrix_world.to_3x3().to_4x4()
bpy.data.objects['mouth'].matrix_world = Matrix.Translation(V((0, -2.03, 1.45))) @ bpy.data.objects['mouth'].matrix_world.to_3x3().to_4x4()
print('SEAT', [round(x, 3) for x in seat], 'old', [round(x, 3) for x in seat0])

# ---- 3. the wings ----
def mat_solid(name, col, rough=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; return m
M_BONE, M_CLAW = mat_solid('dragon2-wing-bone', (0.05, 0.09, 0.16), 0.45), mat_solid('dragon2-claw', (0.80, 0.74, 0.62), 0.35)

def resample(pts, n):
    pts = [V(p) for p in pts]; L = [0]
    for a, b in zip(pts, pts[1:]): L.append(L[-1] + (b - a).length)
    out = []
    for k in range(n + 1):
        s = L[-1] * k / n; i = max(0, min(len(pts) - 2, next((j for j in range(len(L) - 1) if L[j + 1] >= s), len(pts) - 2)))
        f = (s - L[i]) / max(1e-9, L[i + 1] - L[i]); out.append((pts[i].lerp(pts[i + 1], f), i, f, s / L[-1]))
    return out

def membrane_tex(name, trail, bones, lo, size):
    # Painted in the wing's top-view UV: dusk violet by the body and the bones, ember orange at the trailing edge, veins.
    N = 1024; ys, xs = np.mgrid[0:N, 0:N]; P2 = np.stack([lo[0] + (xs + 0.5) / N * size, lo[1] + (ys + 0.5) / N * size], -1)
    def dist(segs):
        d = np.full((N, N), 1e9)
        for a, b in segs:
            a, b = np.array(a), np.array(b); ab = b - a; t = np.clip(((P2 - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
            d = np.minimum(d, np.linalg.norm(P2 - (a + t[..., None] * ab), axis=-1))
        return d
    dt_, db = dist(trail), dist(bones)
    e = np.clip(1 - dt_ / 0.85, 0, 1) ** 1.6; nb = np.clip(1 - db / 0.18, 0, 1) ** 2
    violet, rose, ember = np.array([0.30, 0.13, 0.52]), np.array([0.66, 0.28, 0.58]), np.array([1.0, 0.56, 0.26])
    col = np.where(e[..., None] < 0.5, violet + (rose - violet) * (e[..., None] * 2), rose + (ember - rose) * (e[..., None] * 2 - 1))
    col *= (1 - 0.35 * nb)[..., None]
    noise = rng.random((N // 8, N // 8)).repeat(8, 0).repeat(8, 1); col *= (0.93 + 0.1 * noise)[..., None]
    vein = np.zeros((N, N))
    def walk(p, d, length, w, depth):
        steps = int(length / (size / N) / 2)
        for _ in range(steps):
            d = d + rng.normal(0, 0.18, 2) * 0.5; d /= np.linalg.norm(d); p = p + d * size / N * 2
            i, j = int((p[1] - lo[1]) / size * N), int((p[0] - lo[0]) / size * N)
            if not (1 <= i < N - 1 and 1 <= j < N - 1): return
            vein[i - w:i + w + 1, j - w:j + w + 1] = np.maximum(vein[i - w:i + w + 1, j - w:j + w + 1], 1.0 - 0.25 * depth)
            if depth < 3 and rng.random() < 0.012: walk(p.copy(), d + rng.normal(0, 0.9, 2), length * 0.5, 0, depth + 1)
    for a, b in bones:
        a, b = np.array(a), np.array(b); ab = b - a; L = np.linalg.norm(ab); n = np.array([-ab[1], ab[0]]) / L
        for s in np.arange(0.12, L, 0.13):
            for sg in (1, -1): walk(a + ab * s / L, n * sg + ab / L * rng.normal(0.3, 0.2), rng.uniform(0.3, 0.8), 1, 0)
    col *= (1 - 0.42 * vein)[..., None]; col[..., 0] *= 1 + 0.15 * vein
    im = bpy.data.images.new(name, N, N); im.pixels.foreach_set(np.concatenate([np.clip(col, 0, 1), np.ones((N, N, 1))], -1).astype(np.float32).ravel())
    return im

def wing(side, sx):
    p = lambda n, i: P[f'wing-{side}-{n}'][i]
    Wr, B = p('fore', 1), V((0.12 * -sx, -0.30, 0.86))       # wrist; where the inner trailing edge meets the back
    spars = {'hand': [Wr, p('hand', 1)], **{f'f{k}': [Wr, p(f'finger-{k}-a', 1), p(f'finger-{k}-b', 1)] for k in range(4)},
             'arm': [Wr, p('fore', 0), p('shoulder', 0), B]}
    bones = {'hand': ['hand'], **{f'f{k}': [f'finger-{k}-a', f'finger-{k}-b'] for k in range(4)}, 'arm': ['fore', 'shoulder', None]}
    panels = [('hand', 'f0', 0.03, Wr), ('f0', 'f1', 0.20, Wr), ('f1', 'f2', 0.20, Wr), ('f2', 'f3', 0.20, Wr), ('f3', 'arm', 0.24, p('fore', 0))]
    NU, NV = 18, 10
    bm = bmesh.new(); vw = []; trail = []
    def spar_w(name, rec):
        pt, i, f, s = rec; bl = bones[name]
        if name == 'arm' and i == 2: return {'chest': 1 - f, 'spine': f}
        w = {f'wing-{side}-{bl[i]}': 1.0}
        if i + 1 < len(bl) and f > 0.85 and bl[i + 1]: k = (f - 0.85) / 0.3; w = {f'wing-{side}-{bl[i]}': 1 - k, f'wing-{side}-{bl[i + 1]}': k}
        if i > 0 and f < 0.15 and bl[i]: k = 0.5 - f / 0.3; w = {f'wing-{side}-{bl[i - 1]}': k, f'wing-{side}-{bl[i]}': 1 - k}
        if name == 'arm' and i == 1 and f > 0.85: k = (f - 0.85) / 0.3; w = {f'wing-{side}-shoulder': 1 - k, 'chest': k}
        return w
    for a, b_, depth, C in panels:
        ra, rb = resample(spars[a], NU), resample(spars[b_], NU); grid = []
        for i in range(NU + 1):
            row = []
            for j in range(NV + 1):
                v = j / NV; base = ra[i][0].lerp(rb[i][0], v)
                u = i / NU; pull = depth * math.sin(math.pi * v) * (u ** 2.5)
                co = C + (base - C) * (1 - pull); row.append(bm.verts.new(co))
                wa, wb = spar_w(a, ra[i]), spar_w(b_, rb[i]); w = {}
                for k_, x in wa.items(): w[k_] = w.get(k_, 0) + x * (1 - v)
                for k_, x in wb.items(): w[k_] = w.get(k_, 0) + x * v
                vw.append(w)
                if i == NU: trail.append(co)
            grid.append(row)
        for i in range(NU):
            for j in range(NV): bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bm.verts.index_update()
    mem = bpy.data.meshes.new(f'wing-{side}-membrane'); bm.to_mesh(mem); bm.free()
    mo = bpy.data.objects.new(f'wing-{side}-membrane', mem); bpy.context.scene.collection.objects.link(mo)
    for vi, w in enumerate(vw):
        for k_, x in w.items():
            if x > 1e-4: (mo.vertex_groups.get(k_) or mo.vertex_groups.new(name=k_)).add([vi], x, 'ADD')
    # merge the shared spar edges (identical points, identical weights)
    bm = bmesh.new(); bm.from_mesh(mem); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(mem); bm.free()
    co2 = np.array([(abs(v.co.x), v.co.y) for v in mem.vertices]); lo = co2.min(0) - 0.05; size = (co2.max(0) - lo).max() + 0.05
    uvl = mem.uv_layers.new(name='UVMap')
    for l in mem.loops:
        c = mem.vertices[l.vertex_index].co; uvl.data[l.index].uv = ((abs(c.x) - lo[0]) / size, (c.y - lo[1]) / size)
    for poly in mem.polygons: poly.use_smooth = True
    if sx < 0: mem.flip_normals()
    ab2 = lambda q: (abs(q.x), q.y)
    trail2 = [(ab2(a), ab2(b)) for a, b in zip(trail, trail[1:])]
    bone2 = [(ab2(P[f'wing-{side}-{n}'][0]), ab2(P[f'wing-{side}-{n}'][1])) for n in
             ['shoulder', 'fore', 'hand'] + [f'finger-{k}-{x}' for k in range(4) for x in 'ab']]
    key = 'dragon2-membrane'
    if key not in bpy.data.images: membrane_tex(key, trail2, bone2, lo, size)
    m = bpy.data.materials.get(key) or bpy.data.materials.new(key)
    if not m.node_tree or 'tex' not in m.node_tree.nodes:
        m.use_nodes = True; m.use_backface_culling = False; nt = m.node_tree; b = nt.nodes['Principled BSDF']
        t = nt.nodes.new('ShaderNodeTexImage'); t.name = 'tex'; t.image = bpy.data.images[key]
        nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = 0.22; b.inputs['Roughness'].default_value = 0.6
    mem.materials.append(m)

    # struts, knuckles and claws, each rigid on its bone
    bm = bmesh.new(); groups = []
    def tube(a, b_, r0, r1, bone, mi=0, seg=8):
        d = b_ - a; geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=d.length,
                                                  matrix=Matrix.Translation((a + b_) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
        for v in geom['verts']: groups.append((v, bone))
        for f in {f for v in geom['verts'] for f in v.link_faces}: f.material_index = mi
    def ball(c, r, bone):
        geom = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r, matrix=Matrix.Translation(c))
        for v in geom['verts']: groups.append((v, bone))
    def claw(base, d, L, r, bone):
        tube(base, base + d.normalized() * L, r, 0.002, bone, 1, 6)
    tube(p('shoulder', 0), p('shoulder', 1), 0.075, 0.05, 'shoulder'); ball(p('shoulder', 1), 0.065, 'fore')
    tube(p('fore', 0), p('fore', 1), 0.05, 0.035, 'fore'); ball(Wr, 0.05, 'hand')
    tube(p('hand', 0), p('hand', 1), 0.035, 0.014, 'hand')
    for k in range(4):
        tube(p(f'finger-{k}-a', 0), p(f'finger-{k}-a', 1), 0.03, 0.02, f'finger-{k}-a'); ball(p(f'finger-{k}-a', 1), 0.024, f'finger-{k}-b')
        tube(p(f'finger-{k}-b', 0), p(f'finger-{k}-b', 1), 0.02, 0.008, f'finger-{k}-b')
        tip = p(f'finger-{k}-b', 1); claw(tip, tip - p(f'finger-{k}-b', 0) + V((0, 0, -0.4)) * (tip - p(f'finger-{k}-b', 0)).length, 0.07, 0.016, f'finger-{k}-b')
    ht = p('hand', 1); claw(ht, (ht - Wr).normalized() + V((0, 0, 0.5)), 0.13, 0.025, 'hand')
    claw(Wr, V((0, -1, 0.6)), 0.12, 0.028, 'hand')                                     # thumb claw at the wrist
    bm.verts.index_update(); idx = [(v.index, bone) for v, bone in groups]
    sm = bpy.data.meshes.new(f'wing-{side}-bones'); bm.to_mesh(sm); bm.free()
    so = bpy.data.objects.new(f'wing-{side}-bones', sm); bpy.context.scene.collection.objects.link(so)
    sm.materials.append(M_BONE); sm.materials.append(M_CLAW)
    for vi, bone in idx: (so.vertex_groups.get(f'wing-{side}-{bone}') or so.vertex_groups.new(name=f'wing-{side}-{bone}')).add([vi], 1.0, 'REPLACE')
    for o in (mo, so):
        o.parent = arm; o.matrix_parent_inverse = arm.matrix_world.inverted(); o.modifiers.new('Armature', 'ARMATURE').object = arm
    print('WING', side, 'membrane tris', sum(len(p.vertices) - 2 for p in mem.polygons), 'strut tris', sum(len(p.vertices) - 2 for p in sm.polygons))

wing('l', 1); wing('r', -1)
arm.data.pose_position = 'POSE'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='ACTIONS', export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=88, export_optimize_animation_size=True,
                          export_optimize_animation_keep_anim_armature=False)
print('WROTE', out, os.path.getsize(out))
