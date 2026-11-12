"""Numbers for scarhorn's idle CHECK: hand height vs knee, arm clearance, hands not crossing, head pitch vs rest,
feet flat, and which bone holds the horns and the moss hump.
  blender -b -P measure.py -- full.glb "Idle:0,10,24,40" "Walk:10,20"
z is metres above the ground; head = degrees the head bone tips forward of its rest pitch (+ = looks down)."""
import bpy, sys, math, numpy as np
from collections import Counter
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
FING = ("Thumb", "Index", "Middle", "Ring", "Little")
hand = {s: np.array([n.startswith(s) and ("Hand" in n or any(f in n for f in FING)) for n in dom]) for s in ("left", "right")}
limb = {s: hand[s] | (dom == s + "LowerArm") for s in ("left", "right")}
body = ~np.array([any(p in n for p in ("Shoulder", "Arm", "Hand") + FING) for n in dom])


def verts():
    dg = bpy.context.evaluated_depsgraph_get(); ev = me.evaluated_get(dg); m = ev.to_mesh()
    c = np.empty(len(m.vertices) * 3); m.vertices.foreach_get("co", c); ev.to_mesh_clear()
    M = np.array(me.matrix_world); return c.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]


def P(b, end="head"):
    return np.array(arm.matrix_world @ getattr(arm.pose.bones[b], end))


def pitch():
    d = P("head", "tail") - P("head"); return math.degrees(math.atan2(-d[1], d[2]))   # forward of vertical


def ang(u, v):
    return math.degrees(math.acos(np.clip(u @ v / np.linalg.norm(u) / np.linalg.norm(v), -1, 1)))


def report(tag, p0):
    V = verts(); knee = P("leftLowerLeg")[2]
    out = [f"{tag:8s} hands {V[hand['left'], 2].min():.2f}/{V[hand['right'], 2].min():.2f} knee {knee:.2f}",
           f"handx L{V[hand['left'], 0].min():+.2f} R{V[hand['right'], 0].max():+.2f}"]
    for s in ("left", "right"):
        u, f, h = P(s + "UpperArm"), P(s + "LowerArm"), P(s + "Hand")
        out.append(f"{s[0]}arm {ang(f - u, np.array([0, 0, -1.0])):.0f}/vert elbow {ang(f - u, h - f):.0f}")
    out.append(f"head {pitch() - p0:+.0f}")
    for s in ("left", "right"):
        F = V[dom == s + "Foot"]; out.append(f"{s[0]}foot z {F[:, 2].min():+.3f}..{np.quantile(F[:, 2], .1):+.3f}")
    kd = kdtree.KDTree(int(body.sum()))
    for i, p in enumerate(V[body]):
        kd.insert(p, i)
    kd.balance()
    for s, m in limb.items():
        hit = [kd.find(p) for p in V[m]]; d = np.array([h[2] for h in hit]); j = int(d.argmin())
        out.append(f"{s[0]}clear {d.min() * 100:.1f}cm n<1cm {(d < 0.01).sum()} by {dom[np.flatnonzero(body)[hit[j][1]]]}")
    print("MEASURE", " | ".join(out))


for t in arm.animation_data.nla_tracks:
    t.mute = True
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
bpy.context.view_layer.update()
V0 = verts(); p0 = pitch()
top = V0[:, 2] > 1.42
for tag, m in (("horns+face y<0", top & (V0[:, 1] < 0)), ("hump y>0.15", top & (V0[:, 1] > 0.15))):
    print("MEASURE bones", tag, Counter(dom[m]).most_common(5))
report("rest", p0)
for spec in a[1:]:
    clip, frames = spec.split(":")
    act = next(x for x in bpy.data.actions if x.name.startswith(clip))
    arm.animation_data.action = act; arm.animation_data.action_slot = act.slots[0]
    for f in map(int, frames.split(",")):
        bpy.context.scene.frame_set(f); report(f"{clip[:5]}{f}", p0)
