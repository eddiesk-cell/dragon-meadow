# Smoke flipbook bake: Blender's smoke solver (cached as OpenVDB) -> 64 side-view frames -> art/smoke/frames/.
# Run unsandboxed:  blender -b -P art/smoke/bake.py   then   python3 art/smoke/atlas.py
# Deterministic (no random seed is used by the solver settings below), so a rebuild gives the same look.
import bpy, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE, FRAMES = os.path.join(HERE, 'cache'), os.path.join(HERE, 'frames')
PRE, N, TILE = 60, 64 + 16, 256  # pre-roll frames, frames rendered (16 extra are cross-faded into the start), tile px

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.frame_start, sc.frame_end = 1, PRE + N

bpy.ops.mesh.primitive_ico_sphere_add(radius=0.35, location=(0, 0, 0.4))
em = bpy.context.object
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 3))
dom = bpy.context.object
dom.scale = (4, 4, 6)

fm = em.modifiers.new('Fluid', 'FLUID'); fm.fluid_type = 'FLOW'
f = fm.flow_settings
f.flow_type, f.flow_behavior, f.density, f.temperature = 'SMOKE', 'INFLOW', 0.8, 1.2
f.use_initial_velocity, f.velocity_normal = True, 0.8

dm = dom.modifiers.new('Fluid', 'FLUID'); dm.fluid_type = 'DOMAIN'
d = dm.domain_settings
d.domain_type, d.resolution_max = 'GAS', 96
d.use_noise, d.noise_scale = True, 2
d.vorticity, d.alpha, d.beta = 0.4, 1.0, 1.2  # curl, density buoyancy, heat buoyancy
d.use_dissolve_smoke, d.dissolve_speed = True, 30  # gone before it reaches the domain's ceiling
d.cache_directory, d.cache_type, d.cache_data_format = CACHE, 'ALL', 'OPENVDB'
d.cache_frame_start, d.cache_frame_end = 1, PRE + N

bpy.context.view_layer.objects.active = dom
with bpy.context.temp_override(object=dom, active_object=dom):
    bpy.ops.fluid.bake_all()

# Proof that the cache is OpenVDB and readable from Blender's bundled module
import glob
vdbs = sorted(glob.glob(os.path.join(CACHE, '**', '*.vdb'), recursive=True))
print('VDBCHECK files', len(vdbs), 'MB', round(sum(os.path.getsize(p) for p in vdbs) / 1e6, 1))
try:
    import openvdb
    g = openvdb.readAllGridMetadata(vdbs[len(vdbs) // 2])
    print('VDBCHECK grids', [x.name for x in g])
except Exception as e:
    print('VDBCHECK import failed:', e)

# Look: soft grey-white smoke lit from the upper left, transparent background, straight-on orthographic camera
mat = bpy.data.materials.new('smoke'); mat.use_nodes = True
nt = mat.node_tree; nt.nodes.clear()
vol, out = nt.nodes.new('ShaderNodeVolumePrincipled'), nt.nodes.new('ShaderNodeOutputMaterial')
vol.inputs['Color'].default_value = (0.82, 0.82, 0.85, 1)
vol.inputs['Density'].default_value = 2.5  # thin enough for light to reach inside; 9 rendered pitch black
nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
dom.data.materials.append(mat)
em.hide_render = True

sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 7; sun.rotation_euler = (0.9, 0, -0.9)
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 2.5

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type, cam.data.ortho_scale = 'ORTHO', 6
cam.location, cam.rotation_euler = (0, -12, 3), (1.5708, 0, 0)

for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try: sc.render.engine = eng; break
    except TypeError: pass
sc.render.resolution_x = sc.render.resolution_y = TILE
sc.render.film_transparent = True
sc.render.image_settings.file_format, sc.render.image_settings.color_mode = 'PNG', 'RGBA'
os.makedirs(FRAMES, exist_ok=True)
for i in range(N):
    sc.frame_set(PRE + 1 + i)
    sc.render.filepath = os.path.join(FRAMES, f'f{i:03d}.png')
    bpy.ops.render.render(write_still=True)
print('BAKE done', N, 'frames at', TILE, 'px, engine', sc.render.engine)
