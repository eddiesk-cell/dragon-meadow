"""The Barrow Troll's club — a standing stone ripped out of the Old Ring — and the low boulder it sleeps on.
  blender -b -P tools/monster/club.py -- public/models/club.glb
Nodes: "club" (origin = middle of the grip, stone along +Y, 2.3 m long; the torn-out foot with its clod of soil and
chalk is the head) and "seat" (origin = centre of its footprint on the ground, top ~0.6 m). Metres, vertex-coloured
in the same palette as the ring's stones (src/ring.js stoneGeo), so the club reads as one of them.
"""
import bpy, bmesh, sys
from mathutils import Vector, noise

out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

ss = lambda a, b, x: (lambda k: k * k * (3 - 2 * k))(min(1, max(0, (x - a) / (b - a))))
lerp = lambda a, b, k: a + (b - a) * k
pw = lambda v, e: (1 if v >= 0 else -1) * abs(v) ** e
n01 = lambda p, o=3: noise.fractal(p, 1.0, 2.0, o, noise_basis='PERLIN_ORIGINAL') * 0.5 + 0.5  # ~[0,1]

mat = bpy.data.materials.new("sarsen")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
attr = mat.node_tree.nodes.new("ShaderNodeVertexColor")
attr.layer_name = "Col"
mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.92


def stone(name, subdiv, shape, colour, seed):
    """An icosphere pushed into shape(x, y, z) -> (pos, v) and lumped by noise along its sphere normal."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    o = Vector((seed, seed * 0.37, seed * 0.71))
    info = {}
    for vert in bm.verts:
        n = vert.co.normalized()
        p, v = shape(n.x, n.y, n.z)
        n1, n2, n3 = n01(p * 0.9 + o), n01(p * 3.2 + o), noise.noise(p * 11 + o) * 0.5 + 0.5
        d = (n1 - 0.5) * 0.16 + (n2 - 0.5) * 0.06 + (n3 - 0.5) * 0.015 - 0.035 * ss(0.62, 0.8, n2)  # lumps, chips, grain, pits
        vert.co = p + n * d * shape.rough(v)
        info[vert.index] = (p, v, n1, n2, d)
    col = bm.loops.layers.float_color.new("Col")
    for f in bm.faces:
        f.smooth = True
        for loop in f.loops:
            loop[col] = (*colour(*info[loop.vert.index], o), 1)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    return ob


def sarsen(p, v, n1, n2, d, o, worn=0.0, soil=0.0):
    """Linear RGB: grey sarsen, pale lichen crust, gold lichen specks, moss low, dark pits; plus grip polish / soil."""
    lich = ss(0.5, 0.66, n01(p * 1.1 + o + Vector((0, 0, 9))))
    gold = ss(0.72, 0.8, n01(p * 3.5 + o))
    m = 0.7 + 0.55 * n2
    r, g, b = 0.27 * m, 0.26 * m, 0.23 * m
    k = lich * 0.75 * (1 - worn)
    r, g, b = lerp(r, 0.48, k), lerp(g, 0.5, k), lerp(b, 0.42, k)
    k = gold * 0.85 * (1 - worn)
    r, g, b = lerp(r, 0.55, k), lerp(g, 0.4, k), lerp(b, 0.1, k)
    r, g, b = lerp(r, 0.15, worn), lerp(g, 0.135, worn), lerp(b, 0.12, worn)  # hand-greased grip
    chalk = ss(0.55, 0.7, n01(p * 6 + o))  # the torn foot: dark earth with lumps of chalk and a little moss
    r, g, b = lerp(r, lerp(0.075, 0.62, chalk), soil), lerp(g, lerp(0.055, 0.6, chalk), soil), lerp(b, lerp(0.035, 0.52, chalk), soil)
    shade = 0.45 + 0.55 * ss(-0.08, 0.05, d)
    return r * shade, g * shade, b * shade


# --- club: built along +Z (the exporter turns Z-up into +Y). Grip centre at the origin, head at +1.95 m.
L0, L = -0.34, 2.3
def club_shape(x, y, z):
    v = (pw(z, 0.45) + 1) / 2                       # 0 = pommel end (the stone's old crown), 1 = torn-out foot
    grow = ss(0.1, 0.78, v)
    w, t = lerp(0.115, 0.31, grow), lerp(0.1, 0.23, grow)
    bend = 0.05 * ss(0.3, 1, v)                     # a slight warp, as a real slab has
    return Vector((pw(x, 0.4) * w + bend, pw(y, 0.4) * t, L0 + v * L)), v
club_shape.rough = lambda v: 0.25 + 0.75 * ss(0.17, 0.4, v)  # the grip is worn smooth
club = stone("club", 5, club_shape,
             lambda p, v, n1, n2, d, o: sarsen(p, v, n1, n2, d, o, worn=0.8 * (1 - ss(0.12, 0.24, v)) * ss(0.0, 0.05, v),
                                               soil=ss(0.86, 0.97, v + (n1 - 0.5) * 0.12)), 3.1)

# --- seat: a low broad boulder at the barrow door, half sunk; top ~0.6 m above the ground.
def seat_shape(x, y, z):
    return Vector((pw(x, 0.5) * 0.85, pw(y, 0.5) * 0.6, z * 0.5 + 0.1)), (z + 1) / 2
seat_shape.rough = lambda v: 1.4
seat = stone("seat", 4, seat_shape, lambda p, v, n1, n2, d, o: (lambda c, k: tuple(lerp(ci, mi, k) for ci, mi in zip(c, (0.07, 0.1, 0.035))))(
    sarsen(p, v, n1, n2, d, o), ss(0.55, 0.15, v) * ss(0.4, 0.6, n1) * 0.8), 8.4)

for ob, (vmin, vmax) in ((club, (L0, L0 + L)), (seat, (-0.4, 0.6))):
    zs = [v.co.z for v in ob.data.vertices]
    print(f"{ob.name}: {len(ob.data.vertices)} verts, z {min(zs):.2f}..{max(zs):.2f} (want ~{vmin}..{vmax}), "
          f"x {min(v.co.x for v in ob.data.vertices):.2f}..{max(v.co.x for v in ob.data.vertices):.2f}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format="GLB", export_yup=True, export_vertex_color="ACTIVE")
print("wrote", out)
