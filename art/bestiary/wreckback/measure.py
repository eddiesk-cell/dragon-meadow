"""Numbers for wreckback's idle CHECK (round-2 review): arm reach vs knee and mid-shin, feet flat, head gaze, bow tear.
  blender -b -P measure.py -- full.glb "Idle:0,10,24,40" "Walk:10,20"
Rest pose first, then each clip:frame. z is metres above the ground; head pitch = degrees the face looks above level."""
import bpy, sys, math, numpy as np
from mathutils import kdtree

a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); arm.animation_data_create()
me = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
names = [g.name for g in me.vertex_groups]
W = np.zeros((len(me.data.vertices), len(names)))
for v in me.data.vertices:
    for g in v.groups:
        W[v.index, g.group] = g.weight
dom = np.array(names)[W.argmax(1)]
grp = lambda *ps: W[:, [i for i, n in enumerate(names) if any(n.startswith(p) for p in ps)]].sum(1) > 0.5
claw = grp("rightHand")
lhand = grp("leftHand", "leftThumb", "leftIndex", "leftMiddle", "leftRing", "leftLittle")
feet = {s: grp(s + "Foot", s + "Toes") for s in ("left", "right")}
E = np.empty(len(me.data.edges) * 2, np.int32); me.data.edges.foreach_get("vertices", E); E = E.reshape(-1, 2)
ARMP = ("Shoulder", "Arm", "Hand", "Thumb", "Index", "Middle", "Ring", "Little")
limb = {s: np.array([n.startswith(s) and any(p in n for p in ("LowerArm", "Hand", "Thumb", "Index", "Middle", "Ring", "Little"))
                     for n in dom]) for s in ("left", "right")}
body = ~np.array([any(p in n for p in ARMP) for n in dom])   # legs, skirt, belly, hull, kelp
he = E[((dom[E[:, 0]] == "head") & (dom[E[:, 1]] == "upperChest")) | ((dom[E[:, 1]] == "head") & (dom[E[:, 0]] == "upperChest"))]


def verts():
    dg = bpy.context.evaluated_depsgraph_get(); ev = me.evaluated_get(dg); m = ev.to_mesh()
    c = np.empty(len(m.vertices) * 3); m.vertices.foreach_get("co", c); ev.to_mesh_clear()
    M = np.array(me.matrix_world); return c.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]


def P(b, end="head"):
    pb = arm.pose.bones[b]; return np.array(arm.matrix_world @ getattr(pb, end))


def ang(u, v):
    return math.degrees(math.acos(np.clip(u @ v / np.linalg.norm(u) / np.linalg.norm(v), -1, 1)))


def report(tag, rest_len=None):
    V = verts()
    knee = P("leftLowerLeg")[2]; shin = (knee + P("leftFoot")[2]) / 2
    out = [f"{tag:9s} claw {V[claw, 2].min():.3f} lhand {V[lhand, 2].min():.3f} knuckle {P('leftMiddleProximal')[2]:.3f}"
           f" knee {knee:.3f} midshin {shin:.3f}"]
    for s in ("left", "right"):
        u, f, h = P(s + "UpperArm"), P(s + "LowerArm"), P(s + "Hand")
        out.append(f"{s[0]}arm {ang(f - u, np.array([0, 0, -1.0])):.0f}/vert elbow {ang(f - u, h - f):.0f}")
    for s, m in feet.items():
        F = V[m]; fwd = P(s + "Toes") - P(s + "Foot"); fwd[2] = 0; fwd /= np.linalg.norm(fwd)
        t = (F - F.mean(0)) @ fwd; lo, hi = np.quantile(t, [0.12, 0.88])
        out.append(f"{s[0]}toe {F[t > hi, 2].min():+.3f} heel {F[t < lo, 2].min():+.3f}")
    d = P("head", "tail") - P("head"); out.append(f"head {90 - math.degrees(math.atan2(d[2], -d[1])):+.1f}")  # + = leans forward
    kd = kdtree.KDTree(int(body.sum()))
    for i, p in enumerate(V[body]):
        kd.insert(p, i)
    kd.balance()
    for sd, m in limb.items():   # forearm + hand to the nearest body/skirt/kelp point, and how many sit within 1 cm
        hit = [kd.find(p) for p in V[m]]; d = np.array([h[2] for h in hit]); j = int(d.argmin())
        what = dom[np.flatnonzero(body)[hit[j][1]]]          # what the hand comes nearest: thigh, hips (skirt), upperChest (kelp)
        out.append(f"{sd[0]}clear {d.min() * 100:.1f}cm n<1cm {(d < 0.01).sum()} by {what} z{V[m][j, 2]:.2f}")
    L = np.linalg.norm(V[he[:, 0]] - V[he[:, 1]], axis=1)
    if rest_len is not None:
        k = np.abs(L - rest_len).argmax(); w = V0[he[k]].mean(0)   # where, on the rest body
        out.append(f"bow-tear {np.abs(L - rest_len).max():.3f} at x{w[0]:+.2f} y{w[1]:+.2f} z{w[2]:.2f}")
    print("MEASURE", " | ".join(out)); return L


for t in arm.animation_data.nla_tracks:
    t.mute = True
arm.animation_data.action = None                          # the importer leaves a clip assigned
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
V0 = verts(); L0 = report("rest")
for spec in a[1:]:
    clip, frames = spec.split(":")
    act = next(x for x in bpy.data.actions if x.name.startswith(clip))
    arm.animation_data.action = act; arm.animation_data.action_slot = act.slots[0]
    for f in map(int, frames.split(",")):
        bpy.context.scene.frame_set(f); report(f"{clip[:5]}{f}", L0)
print(f"MEASURE head<->upperChest edges {len(he)}")
