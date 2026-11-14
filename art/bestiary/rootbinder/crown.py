"""The root crown as spring chains, the hero's convention (tools/hero/springs.py, read by src/springs.js):
spring_crown<k>_0..2 parented to `head` (connected), and spring_crown<k>_end (the last bone's tip, no weights).
Crown = skin led by the head, farther than R0 from the crown's base point (the head's top, above the mask). It is cut into
N sectors by its angle in the front plane (from straight up), one chain per main root; each chain's joints sit on the
centroid of its roots at 0, 1/3, 2/3 and 1 of its reach. Weights grow along the chain: 0 = head at the base, then each
bone in turn (linear blend between joints), smoothed over the mesh so neighbouring sectors do not tear apart; the old
(head) weights keep the remaining share, so the base stays put. The 9 clips gain no motion on these bones (the exporter
keys them at rest, as on the hero; src/springs.js sets them every frame).
With --check sheet.png: a front render at rest and with every chain bent 25 deg, side by side (base fixed, roots bend).
  blender -b -P crown.py -- in.glb out.glb [--check sheet.png]"""
import bpy, sys, math, numpy as np
from mathutils import Vector, Quaternion

a = sys.argv[sys.argv.index("--") + 1:]
src, out = a[:2]; check = a[a.index("--check") + 1] if "--check" in a else None
N, R0 = 6, 0.12   # chains; metres from the base point that stay on the head (the mask's own radius is ~0.08)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
body = next(o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() == arm)
assert arm.matrix_world.is_identity and body.matrix_world.is_identity
me = body.data; V = np.array([v.co for v in me.vertices])
names = [g.name for g in body.vertex_groups]
lead = np.array([names[max(v.groups, key=lambda g: g.weight).group] if v.groups else "" for v in me.vertices])
hb = arm.data.bones["head"]
onhead = lead == "head"
P0 = np.array([hb.head_local.x, np.median(V[onhead, 1]), np.quantile(V[onhead, 2], 0.5)])   # the crown's base, in the skull
r = np.linalg.norm(V - P0, axis=1)
th = np.arctan2(V[:, 0] - P0[0], V[:, 2] - P0[2])               # 0 = up, + = his left
face = (np.abs(V[:, 0] - P0[0]) < 0.1) & (V[:, 2] < 1.72)       # the mask, jaw and neck column: rigid on the head
crown = onhead & (r > R0) & ~face & (np.abs(th) < math.radians(115))
lo, hi = np.quantile(th[crown], [0.01, 0.99])
sec = np.clip(((th - lo) / (hi - lo) * N).astype(int), 0, N - 1)
print(f"CROWN base {P0.round(3)}, {crown.sum()} of {onhead.sum()} head verts, angle {math.degrees(lo):.0f}..{math.degrees(hi):.0f} deg")

# joints: centroid of the sector's crown at 4 reaches
chains = []
for k in range(N):
    m = crown & (sec == k)
    rmax = np.quantile(r[m], 0.97)
    J = []
    for f in (0, 1 / 3, 2 / 3, 1):
        rr = R0 + f * (rmax - R0); band = m & (np.abs(r - rr) < max(0.02, 0.08 * (rmax - R0)))
        J.append(V[band].mean(0) if band.sum() >= 5 else V[m][np.argsort(np.abs(r[m] - rr))[:20]].mean(0))
    J[0] = P0 + (J[1] - P0) / np.linalg.norm(J[1] - P0) * R0      # the chain starts on the head, pointing at its root
    chains.append(dict(m=m, J=J, rmax=rmax))

# bones
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
for k, c in enumerate(chains):
    prev = eb["head"]; J = c["J"]
    for i in range(3):
        b = eb.new(f"spring_crown{k}_{i}"); b.head, b.tail = Vector(J[i]), Vector(J[i + 1]); b.parent = prev; b.use_connect = i > 0; prev = b
    e = eb.new(f"spring_crown{k}_end"); e.head = Vector(J[3]); e.tail = Vector(J[3] + (J[3] - J[2]) * 0.3)
    e.parent = prev; e.use_connect = True; e.use_deform = False
bpy.ops.object.mode_set(mode="OBJECT")

# weights: columns [old (head) share, chain0 bone0..2, chain1 bone0..2, ...]
idx = np.nonzero(onhead)[0]; pos = {v: i for i, v in enumerate(idx)}
Wc = np.zeros((len(idx), 1 + 3 * N)); Wc[:, 0] = 1
for k, c in enumerate(chains):
    mi = np.array([pos[v] for v in np.nonzero(c["m"])[0]])
    mb = np.clip(3 * (r[c["m"]] - R0) / (c["rmax"] - R0), 0, 3)   # 0 head, 1/2/3 the joints at the end of bone 0/1/2
    Wc[mi, 0] = np.maximum(0, 1 - mb)
    Wc[mi, 1 + 3 * k:1 + 3 * k + 3] = np.stack([np.maximum(0, 1 - np.abs(mb - j)) for j in (1, 2, 3)], 1)
E = np.array([e.vertices[:] for e in me.edges])
E = E[onhead[E[:, 0]] & onhead[E[:, 1]]]; ea, eb_ = np.array([pos[v] for v in E[:, 0]]), np.array([pos[v] for v in E[:, 1]])
fixed = ~crown[idx]   # the mask, jaw and skull never move
for _ in range(15):   # smooth across sector seams; only the crown moves
    S = np.zeros_like(Wc); n = np.zeros(len(idx))
    np.add.at(S, ea, Wc[eb_]); np.add.at(S, eb_, Wc[ea]); np.add.at(n, ea, 1); np.add.at(n, eb_, 1)
    sm = (Wc + S) / (1 + n)[:, None]; Wc[~fixed] = sm[~fixed]
Wc /= Wc.sum(1, keepdims=True)
G = {}
for k in range(N):
    for i in range(3):
        G[(k, i)] = body.vertex_groups.new(name=f"spring_crown{k}_{i}")
gname = {g.index: g.name for g in body.vertex_groups}
for row, v in zip(Wc, idx):
    if row[0] > 0.999:
        continue
    for g in list(me.vertices[v].groups):
        body.vertex_groups[g.group].add([int(v)], g.weight * row[0], "REPLACE")
    for k in range(N):
        for i in range(3):
            if row[1 + 3 * k + i] > 1e-4:
                G[(k, i)].add([int(v)], float(row[1 + 3 * k + i]), "REPLACE")
for k, c in enumerate(chains):
    w = Wc[:, 1 + 3 * k:4 + 3 * k].sum(1)
    L = sum(np.linalg.norm(c["J"][i + 1] - c["J"][i]) for i in range(3))
    print(f"CROWN chain {k}: angle {math.degrees(lo + (k + 0.5) * (hi - lo) / N):+.0f} deg, {c['m'].sum()} verts, {(w > 0.5).sum()} mostly on the chain,"
          f" length {L:.3f} m, tip {np.round(c['J'][3], 3)}")

ad = arm.animation_data
for t in ad.nla_tracks:
    t.mute = True
ad.action = None
acts = list(bpy.data.actions)
for t in list(ad.nla_tracks):
    ad.nla_tracks.remove(t)
for act in acts:
    t = ad.nla_tracks.new(); t.name = act.name
    s = t.strips.new(act.name, int(act.frame_range[0]), act); s.action_slot = act.slots[0]
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animation_mode="NLA_TRACKS")
print("CROWN wrote", out, len(acts), "clips")

if check:   # front render at rest and with every chain bent, side by side
    for t in ad.nla_tracks:
        t.mute = True
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'; sc.display.shading.light = 'STUDIO'
    sc.render.resolution_x, sc.render.resolution_y = 700, 500
    w = bpy.data.worlds.new("w"); w.color = (0.35, 0.35, 0.38); sc.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.4; cam.location = (P0[0], -6, P0[2] + 0.05); cam.rotation_euler = (math.pi / 2, 0, 0)
    for tag, deg in (("rest", 0), ("bent", 25)):
        for k in range(N):
            for i in range(3):
                pb = arm.pose.bones[f"spring_crown{k}_{i}"]; pb.rotation_mode = "QUATERNION"
                pb.rotation_quaternion = Quaternion((1, 0, 0), math.radians(deg))   # bone-local X: bends each root
        bpy.context.view_layer.update()
        sc.render.filepath = f"{check}.{tag}.png"; bpy.ops.render.render(write_still=True)
    print("CROWN check", check)
