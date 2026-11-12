# blender -b -P tools/flora/beside_hero.py -- <plant.glb> public/models/hero.glb <out_prefix>   (sandbox off: Metal)
# Renders the SHIPPED glb beside the hero at true scale: day (sun) and night (emission = violet * alpha^2, the glb's own mask).
import bpy, sys
from math import radians
fern, hero, out = sys.argv[sys.argv.index("--") + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 1200, 900
sc.view_settings.view_transform = "AgX"

bpy.ops.import_scene.gltf(filepath=fern)
fobs = [o for o in bpy.context.selected_objects if o.type == "MESH"]
bpy.ops.import_scene.gltf(filepath=hero)
for o in bpy.context.selected_objects:
    if o.parent is None:
        o.location = (1.5, 0.4, 0)
        o.rotation_euler[2] = radians(-20)

m = bpy.data.materials.new("fernlit"); m.use_nodes = True; nt = m.node_tree
b = nt.nodes["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.6
at = nt.nodes.new("ShaderNodeAttribute"); at.attribute_name = fobs[0].data.color_attributes[0].name
sq = nt.nodes.new("ShaderNodeMath"); sq.operation = "POWER"; sq.inputs[1].default_value = 2.0
em = nt.nodes.new("ShaderNodeMath"); em.operation = "MULTIPLY"
nt.links.new(at.outputs["Color"], b.inputs["Base Color"])
nt.links.new(at.outputs["Alpha"], sq.inputs[0]); nt.links.new(sq.outputs[0], em.inputs[0])
nt.links.new(em.outputs[0], b.inputs["Emission Strength"])
b.inputs["Emission Color"].default_value = (0.55, 0.25, 1.0, 1)
for o in fobs:
    o.data.materials.clear(); o.data.materials.append(m)

ground = bpy.data.meshes.new("g"); ground.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new("g", ground); sc.collection.objects.link(g)
gm = bpy.data.materials.new("gm"); gm.use_nodes = True; g.data.materials.append(gm)

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sc.collection.objects.link(sun)
sun.rotation_euler = (radians(50), 0, radians(35))
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]

def shot(name, loc, rot):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name)); sc.collection.objects.link(cam)
    cam.location, cam.rotation_euler = loc, rot
    cam.data.lens = 40; sc.camera = cam
    for mode in ("day", "night"):
        night = mode == "night"
        em.inputs[1].default_value = 3.0 if night else 0.0
        sun.data.energy = 0.25 if night else 4.0
        sun.data.color = (0.5, 0.6, 1.0) if night else (1.0, 0.92, 0.8)
        bg.inputs[0].default_value = (0.02, 0.03, 0.08, 1) if night else (0.55, 0.65, 0.85, 1)
        bg.inputs[1].default_value = 0.6 if night else 1.0
        gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02, 0.05, 0.04, 1) if night else (0.25, 0.4, 0.15, 1)
        sc.render.filepath = f"{out}-{name}-{mode}.png"
        bpy.ops.render.render(write_still=True)

shot("side", (0.3, -5.2, 1.0), (radians(88), 0, 0))
shot("quarter", (3.6, -3.8, 1.5), (radians(80), 0, radians(42)))
