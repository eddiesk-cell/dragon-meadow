"""The Crest Stone (PLAN.md Phase 6, lane landmarks; WORLD.md Dragon Meadow): a leaning standing stone on the cliff top,
its seaward side carved into a giant stone face. Original design: a serene sleeper's face — heavy brow, closed almond
eyes, long straight nose, closed lips — with carved lines (eye rims, a ring sigil on the brow, the mouth)
that glow at night.
  blender -b --python-exit-code 1 -P tools/world/stoneface.py -- public/models/world
Writes stoneface.glb, one node `stone`: metres, glTF axes, origin at the bottom centre on the ground (root to y = -3),
the face looks toward +z (landmarks.js turns it to the sea and leans it), 22 m tall.
COLOR_0 rgb = albedo (linear); alpha 1 = carved glow line, ~0.6 = stone that may carry night veins, lower on lichen.
"""
import bpy, sys, os, json, struct
import numpy as np
from math import pi, cos, sin, sqrt, exp, copysign
from mathutils import Vector, noise

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = args[0]
GLB = os.path.join(out_dir, "stoneface.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)


def ss(a, b, x):
    k = min(1., max(0., (x - a) / (b - a)))
    return k * k * (3 - 2 * k)


def fbm(x, y, z, s, o=0., oct=4):
    return noise.fractal(Vector((x * s + o, y * s, z * s)), 1.0, 2.0, oct) * .6


def mix(a, b, t):
    t = min(1., max(0., t))
    return [p + (q - p) * t for p, q in zip(a, b)]


g = lambda u: exp(-u * u)
H, FACE_Y, FACE_H, FACE_W = 22., 12.6, 6.6, 4.4  # face: chin at y ~6, forehead ~19, +-4.4 m wide


def relief(X, Y):
    """Outward relief (m) and carved-line mask (0..1) in face units: X across (-1..1), Y up (-1 chin .. 1 brow top)."""
    ax = abs(X)
    oval = ss(1.15, .85, sqrt(X * X + (Y * .9) ** 2))
    d = .3 * oval
    d += .75 * g((Y - .36) / .085) * ss(1., .7, ax) * (1 - .35 * g(X / .1))                  # brow
    d -= .95 * g(sqrt(((ax - .36) / .2) ** 2 + ((Y - .17) / .075) ** 2))                     # eye sockets, almond-wide
    d += .5 * g(sqrt(((ax - .36) / .16) ** 2 + ((Y - .16) / .035) ** 2))                     # closed lids
    tip = ss(.3, -.2, Y)
    d += (.25 + 1.35 * tip) * g(X / (.09 + .08 * tip)) * ss(-.34, -.22, Y) * ss(.42, .3, Y)  # nose: bridge to tip
    d += .45 * g(sqrt(((ax - .15) / .07) ** 2 + ((Y + .24) / .05) ** 2))                     # nostril wings
    d += .4 * g(sqrt(((ax - .55) / .2) ** 2 + ((Y + .05) / .2) ** 2))                        # cheekbones
    ym = -.535 + .02 * (ax / .3) ** 2  # the mouth's line: corners lifted a hair, at peace
    d += .25 * g((Y - ym - .065) / .04) * ss(.34, .24, ax) + .3 * g((Y - ym + .07) / .05) * ss(.3, .2, ax)  # lips
    d += .55 * g(sqrt((X / .3) ** 2 + ((Y + .83) / .12) ** 2))                              # chin
    ex, ey, ea, eb = (ax - .36) * FACE_W, (Y - .17) * FACE_H, .25 * FACE_W, .1 * FACE_H  # in metres
    e = sqrt((ex / ea) ** 2 + (ey / eb) ** 2) + 1e-6
    rim = abs(e - 1) / (sqrt((ex / ea ** 2) ** 2 + (ey / eb ** 2) ** 2) / e + 1e-6)  # ~ metres from the almond's edge
    line = max(ss(.2, .1, rim),                                                                # almond eye rims
               ss(.065, .03, abs(sqrt(X * X + (Y - .68) ** 2) - .12)), ss(.05, .02, sqrt(X * X + (Y - .68) ** 2)),  # brow sigil
               ss(.05, .025, abs(Y - ym)) * ss(.3, .24, ax))                                # the mouth
    d -= .5 * g((Y - ym) / .02) * ss(.34, .26, ax)                                             # mouth groove
    return d * oval - .12 * line, line * oval


# ---------- the slab: rings of a rounded-rectangle section, dense across the face ----------
P = 2.4  # superellipse exponent: a rounded slab, not a box
sg = lambda v, e: copysign(abs(v) ** e, v)
front = list(np.linspace(pi / 2 - 1.15, pi / 2 + 1.15, 121)[:-1])
back = list(np.linspace(pi / 2 + 1.15, pi / 2 + 2 * pi - 1.15, 73)[:-1])
PHI = front + back
ys = list(np.arange(-3., 4., .4)) + list(np.arange(4., 20., .12)) + list(np.arange(20., 21.95, .3))
V, C, A = [], [], []
for y in ys:
    t = y / H
    crown = sqrt(max(.04, 1 - ((y - 18.) / 4.2) ** 2)) if y > 18 else 1.
    a, b = (5.6 - 1.0 * t) * crown, (3.6 - .6 * t) * crown
    for phi in PHI:
        c, s = cos(phi), sin(phi)
        x, z = a * sg(c, 2 / P), b * sg(s, 2 / P)
        n = Vector((sg(c, 2 - 2 / P) / a, 0, sg(s, 2 - 2 / P) / b)).normalized()  # section normal
        wf = ss(.55, .85, z / b) * ss(4.5, 6., y)
        d, line = relief(x / FACE_W, (y - FACE_Y) / FACE_H) if wf > 0 else (0., 0.)
        rough = fbm(x, y, z, .07) * 1.3 + fbm(x, y, z, .2, 5.) * .45 + fbm(x, y, z, .7, 3.) * .12  # weathered lumps
        k = d * wf + rough * (1 - .75 * wf)
        if y < 0:
            k *= .5
        V.append((x + n.x * k, y, z + n.z * k))
        A.append(line * wf)
V.append((0., H + .15 * fbm(0, H, 0, .3), 0.))  # crown pole
A.append(0.)
# Fracture planes, as on the ring's sarsens: flat chipped faces off the back, the sides and one shoulder of the crown,
# so it reads as a standing stone that a face was cut into, not a carved head. None touches the face (+z).
CUTS = [((.94, .34, -.1), 4.4, 12), ((-.9, .2, -.4), 4.3, 9), ((.3, -.1, -.95), 2.7, 6), ((-.25, .4, -.88), 2.8, 15),
        ((.45, .89, 0.), 3.0, 19), ((-.7, -.15, -.7), 3.8, 3), ((.8, -.2, -.57), 4.0, 4)]
for k, v in enumerate(V):
    q = Vector(v)
    for n, o, cy in CUTS:  # plane through (n * o) about a centre at height cy
        n = Vector(n).normalized()
        sd = (q - Vector((0, cy, 0))).dot(n) - o
        if sd > 0:
            q -= n * sd
    V[k] = tuple(q)
NA, NR = len(PHI), len(ys)
F = [(i * NA + j, i * NA + (j + 1) % NA, (i + 1) * NA + (j + 1) % NA, (i + 1) * NA + j)[::-1]
     for i in range(NR - 1) for j in range(NA)]
F += [((NR - 1) * NA + j, (NR - 1) * NA + (j + 1) % NA, NR * NA)[::-1] for j in range(NA)]

me = bpy.data.meshes.new("stone")
me.from_pydata([(v[0], -v[2], v[1]) for v in V], [], F)  # three -> Blender axes
me.update()
for p in me.polygons:
    p.use_smooth = True
me.materials.append(bpy.data.materials.new("crest"))
ob = bpy.data.objects.new("stone", me)
bpy.context.scene.collection.objects.link(ob)
nn = np.zeros(len(me.vertices) * 3, np.float32)
me.vertex_normals.foreach_get("vector", nn)
nn = nn.reshape(-1, 3)
UP = nn[:, 2]
assert UP[-1] > .7 and nn[(NR // 2) * NA + 60][1] < -.5, "stone normals point inward (front should face +z = Blender -y)"

STONE, STONE_D, LICHEN, MOSS, CARVE = (.12, .118, .11), (.06, .06, .058), (.34, .35, .3), (.06, .11, .035), (.05, .06, .055)
cols = []
for k, (x, y, z) in enumerate(V):
    m = .5 + fbm(x, y, z, .35, 2.)
    c = mix(STONE_D, STONE, .4 + .9 * m)
    lich = ss(.1, .5, fbm(x, y, z, .22, 9.)) * (.4 + .6 * ss(-.2, .6, UP[k])) * (1 - A[k])
    c = mix(c, LICHEN, lich * .75)
    c = mix(c, MOSS, ss(2.5, 0., y) * .8 + ss(.6, .9, UP[k]) * .5)  # turf at the foot, moss on the crown
    c = mix(c, CARVE, A[k])
    cols.append((*c, max(A[k], .6 - .4 * lich)))
ca = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
me.color_attributes.active_color = ca
vi = np.zeros(len(me.loops), np.int64)
me.loops.foreach_get("vertex_index", vi)
ca.data.foreach_set("color", np.asarray(cols, np.float32)[vi].ravel())

vs = np.array(V)
tris = sum(len(p.vertices) - 2 for p in me.polygons)
print(f"CRESTSTONE stone {np.ptp(vs[:, 0]):.1f} wide x {np.ptp(vs[:, 2]):.1f} deep, y {vs[:, 1].min():+.1f}..{vs[:, 1].max():.1f} m, "
      f"tris {tris}, carved-line verts {sum(a > .5 for a in A)}, nose out {vs[:, 2].max() - 3.6:.2f} m past the slab")
assert 20 <= vs[:, 1].max() <= 23 and sum(a > .5 for a in A) > 300

os.makedirs(out_dir, exist_ok=True)
ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=GLB, use_selection=True, export_format="GLB", export_yup=True,
                          export_vertex_color="ACTIVE", export_extras=True, export_apply=True)
with open(GLB, "rb") as fh:
    head = fh.read(20)
    js = json.loads(fh.read(struct.unpack("<I", head[12:16])[0]))
prims = js["meshes"][js["nodes"][0]["mesh"]]["primitives"]
assert js["nodes"][0]["name"] == "stone" and js["accessors"][prims[0]["attributes"]["COLOR_0"]]["type"] == "VEC4"
print(f"CRESTSTONE wrote {GLB} {os.path.getsize(GLB) / 1e6:.2f} MB")
