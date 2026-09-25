"""
Shared helpers for the Glow Salon Blender builds (run inside Blender 5.2: `blender -b --python <script>`).

Conventions (the asset contract in glow-salon-docs/3D-PLAN.md):
- Blender works Z up with the model's front toward -Y; the glTF exporter writes Y up with the front toward +Z.
- Metres. The origin sits on the floor in the middle of the footprint.
- Materials are flat PBR colours named by their role (Skin, Top, Accent, Trim...); soft ambient occlusion is baked
  into the vertex colours (COLOR_0), which three.js multiplies with the material colour.
"""
import math
import os
import subprocess

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
ROOT = os.path.dirname(SRC)
MODELS = os.path.join(ROOT, 'public', 'models')
OUT = os.path.join(SRC, 'out')
ART = os.path.join(ROOT, 'artifacts', 'assets')
GLTFPACK = os.path.join(SRC, 'tools', 'gltfpack.exe' if os.name == 'nt' else 'gltfpack')


# ---------------------------------------------------------------------------------------------- scene

def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30
    sc.unit_settings.system = 'METRIC'


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def activate(obj, *others):
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    for o in (obj, *others):
        o.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_all(obj) -> None:
    """Apply every modifier and the object transform."""
    activate(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def join(objs, name=None):
    objs = [o for o in objs if o is not None]
    activate(objs[0], *objs[1:])
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    if name:
        o.name = name
        o.data.name = name
    return o


def tris(obj) -> int:
    me = obj.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


# ---------------------------------------------------------------------------------------------- colour and materials

def srgb_to_lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hex_or_tuple):
    """0xRRGGBB or (r, g, b) 0-255 sRGB, to a linear RGBA tuple for Blender."""
    if isinstance(hex_or_tuple, int):
        h = hex_or_tuple
        t = ((h >> 16) & 255, (h >> 8) & 255, h & 255)
    else:
        t = hex_or_tuple
    return tuple(srgb_to_lin(v / 255) for v in t) + (1.0,)


def mat(name, color=0xffffff, rough=0.6, metal=0.0, emit=None, alpha=None, image=None, sheen=0.0, coat=0.0):
    """A Principled material with an exact name (the contract reads materials by name)."""
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True if hasattr(m, 'use_nodes') else None
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = rgb(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if sheen:
        bsdf.inputs['Sheen Weight'].default_value = sheen
        bsdf.inputs['Sheen Roughness'].default_value = 0.35
        bsdf.inputs['Sheen Tint'].default_value = (1, 1, 1, 1)
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.25
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = rgb(emit)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    m.diffuse_color = rgb(color)
    return m


def set_mats(obj, names):
    """Give the object these material slots, in order."""
    obj.data.materials.clear()
    for n in names:
        obj.data.materials.append(bpy.data.materials[n] if isinstance(n, str) else n)


def mat_index(obj, name) -> int:
    for i, m in enumerate(obj.data.materials):
        if m and m.name == name:
            return i
    obj.data.materials.append(bpy.data.materials[name])
    return len(obj.data.materials) - 1


# ---------------------------------------------------------------------------------------------- mesh building

def mesh_obj(name, bm, mat_name=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o)
    if mat_name:
        o.data.materials.append(bpy.data.materials[mat_name] if isinstance(mat_name, str) else mat_name)
    return o


def uv_sphere(name, radius=1.0, seg=24, rings=16, loc=(0, 0, 0), scale=(1, 1, 1), mat_name=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return mesh_obj(name, bm, mat_name)


def cylinder(name, r1, r2, depth, seg=24, loc=(0, 0, 0), caps=True, mat_name=None):
    """A (truncated) cone standing on its base: the base at loc, the top at loc + depth along Z."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.translate(bm, vec=Vector(loc) + Vector((0, 0, depth / 2)), verts=bm.verts)
    return mesh_obj(name, bm, mat_name)


def box(name, size, loc=(0, 0, 0), mat_name=None, bevel=0.0, bevel_seg=3):
    """A box by its full size, standing on loc (loc is the middle of its bottom face)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc) + Vector((0, 0, size[2] / 2)), verts=bm.verts)
    o = mesh_obj(name, bm, mat_name)
    if bevel > 0:
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width = bevel
        m.segments = bevel_seg
        m.limit_method = 'NONE'
        apply_all(o)
    return o


def round_cone(name, a, b, ra, rb, seg=16, mat_name=None):
    """A capsule whose two ends have different radii: a sphere at each end and the frustum between (unioned later)."""
    a, b = Vector(a), Vector(b)
    parts = [uv_sphere(name + '_a', ra, seg, max(8, seg // 2), loc=a), uv_sphere(name + '_b', rb, seg, max(8, seg // 2), loc=b)]
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=ra, radius2=rb, depth=d.length)
    bmesh.ops.translate(bm, vec=Vector((0, 0, d.length / 2)), verts=bm.verts)
    rot = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(a) @ rot, verts=bm.verts)
    parts.append(mesh_obj(name + '_c', bm))
    o = join(parts, name)
    if mat_name:
        o.data.materials.append(bpy.data.materials[mat_name])
    return o


def ellipsoid(name, center, radii, rot=None, seg=24, rings=14, mat_name=None):
    o = uv_sphere(name, 1.0, seg, rings, mat_name=mat_name)
    o.scale = radii
    if rot:
        o.rotation_euler = [math.radians(v) for v in rot]
    o.location = center
    apply_all(o)
    return o


def voxel_union(objs, name, voxel=0.006, smooth_iter=8, smooth_factor=0.6, target_tris=None):
    """Fuse overlapping parts into one clean skin: voxel remesh, a volume-keeping smooth, then decimate."""
    o = join(objs, name)
    m = o.modifiers.new('remesh', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.use_smooth_shade = True
    apply_all(o)
    if smooth_iter:
        s = o.modifiers.new('smooth', 'LAPLACIANSMOOTH')
        s.iterations = smooth_iter
        s.lambda_factor = smooth_factor
        s.use_volume_preserve = True
        apply_all(o)
    if target_tris:
        decimate(o, target_tris)
    shade_smooth(o)
    return o


def decimate(o, target_tris):
    t = tris(o)
    if t > target_tris:
        d = o.modifiers.new('decimate', 'DECIMATE')
        d.ratio = target_tris / t
        d.use_collapse_triangulate = False
        apply_all(o)


def shade_smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def shade_flat(o):
    for p in o.data.polygons:
        p.use_smooth = False


def bisect(o, co, no):
    """Cut the mesh with a plane (no fill), so a material edge can follow a clean loop."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no))
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()


def empty(name, loc=(0, 0, 0), rot_deg=(0, 0, 0), parent=None, size=0.1):
    """A helper node (seat, work, feet, tool, lookat). Its -Y axis (the model's front) is the facing direction."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = size
    e.location = loc
    e.rotation_euler = [math.radians(v) for v in rot_deg]
    link(e)
    if parent:
        e.parent = parent
    return e


# ---------------------------------------------------------------------------------------------- ambient occlusion

def bake_vertex_ao(objs, samples=64, distance=0.35, strength=0.75, floor=True):
    """
    Bake soft ambient occlusion into a byte colour attribute on each mesh (glTF COLOR_0). strength 0 keeps it white,
    1 keeps the raw occlusion. A temporary floor plane darkens the parts near the ground.
    """
    sc = bpy.context.scene
    prev = sc.render.engine
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.device = 'GPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
    except Exception:
        sc.cycles.device = 'CPU'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = distance
    ground = None
    if floor:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
        ground = mesh_obj('__ao_floor', bm)
    for o in objs:
        me = o.data
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        ca = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = 0
    for o in objs:
        activate(o)
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
    for o in objs:
        ca = o.data.color_attributes['AO']
        for d in ca.data:
            c = d.color
            v = c[0]
            v = 1.0 - strength * (1.0 - v)
            d.color = (v, v, v, 1.0)
    if ground:
        bpy.data.objects.remove(ground)
    sc.render.engine = prev


# ---------------------------------------------------------------------------------------------- export

def export_glb(path, objects, animations=False, anim_mode='NLA_TRACKS'):
    """Write a .glb of just these objects (and their children), Y up, with the AO colours."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    activate(objects[0], *objects[1:])
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
        export_animations=animations,
        export_animation_mode=anim_mode,
        export_skins=True,
        export_def_bones=True,
        export_leaf_bone=False,
        export_morph=False,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_image_format='AUTO',
        export_optimize_animation_size=True,
        export_force_sampling=True,
        export_reset_pose_bones=True,
        export_current_frame=False,
        export_rest_position_armature=True,
    )
    return path


def pack(src, dst, extra=()):
    """gltfpack: meshopt compression, keeping every named node and material (the contract reads them by name)."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = [GLTFPACK, '-i', src, '-o', dst, '-cc', '-kn', '-km', '-ke', *extra]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'gltfpack failed: {r.stderr or r.stdout}')
    return os.path.getsize(dst)


# ---------------------------------------------------------------------------------------------- preview renders

def studio(floor_color=0xe9cdb4, world=0xf6ece6, sun_energy=3.2, size=600, res=(1200, 800)):
    """A soft preview stage: warm floor, sun key light, bright world fill, EEVEE with soft shadows."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items_static] else 'None'
    try:
        sc.eevee.use_shadows = True
        sc.eevee.shadow_ray_count = 2
        sc.eevee.use_raytracing = True
        sc.eevee.fast_gi_method = 'GLOBAL_ILLUMINATION'
    except Exception:
        pass
    w = bpy.data.worlds.new('World') if sc.world is None else sc.world
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = rgb(world)
    bg.inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects.new('__sun', bpy.data.lights.new('__sun', 'SUN'))
    sun.data.energy = sun_energy
    sun.data.angle = math.radians(12)
    sun.data.color = (1.0, 0.96, 0.9)
    sun.rotation_euler = (math.radians(50), math.radians(8), math.radians(-35))
    link(sun)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    fl = mesh_obj('__floor', bm, mat('__floor', floor_color, rough=0.7))
    return sun, fl


def camera(loc, target, ortho=None, lens=50):
    sc = bpy.context.scene
    cam = sc.camera
    if cam is None:
        cam = bpy.data.objects.new('__cam', bpy.data.cameras.new('__cam'))
        link(cam)
        sc.camera = cam
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'
        cam.data.lens = lens
    cam.data.clip_end = 200
    return cam


def render(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def game_view(target=(0, 0, 0.8), dist=30.0, elev=35, azim=45, ortho=4.0):
    """
    The floor camera (as the owner set it, like Serenity's Spa): the room turned 45 degrees so you look into a back
    corner, pitched 35 degrees down, orthographic. Models face -Y, so azim 45 sees the front and the right side.
    """
    t = Vector(target)
    e, a = math.radians(elev), math.radians(azim)
    loc = t + Vector((math.sin(a) * math.cos(e) * dist, -math.cos(a) * math.cos(e) * dist, math.sin(e) * dist))
    return camera(loc, t, ortho=ortho)


def loft(name, sections, seg=24, cap=True, power=2.0):
    """
    A tube through cross-sections. Each section: (center Vector, rx, front, back[, up_axis, side_axis]) where rx is the
    half width along the side axis (default X), front/back the depth toward -Y/+Y (or along -fwd/+fwd for a limb).
    power > 2 makes the section a little boxier (a superellipse).
    """
    bm = bmesh.new()
    rings = []
    for sec in sections:
        c, rx, fr, bk = sec[:4]
        side = Vector(sec[4]) if len(sec) > 4 else Vector((1, 0, 0))
        fwd = Vector(sec[5]) if len(sec) > 5 else Vector((0, -1, 0))
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ca, sa = math.cos(a), math.sin(a)
            e = 2.0 / power
            cx = math.copysign(abs(ca) ** e, ca)
            sy = math.copysign(abs(sa) ** e, sa)
            depth = fr if sy > 0 else bk
            p = Vector(c) + side * (rx * cx) + fwd * (depth * sy)
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm)


def limb(name, a, b, radii, fwd=(0, -1, 0), offsets=None, seg=16):
    """A tapered limb from a to b: radii is a list of (t, r) or (t, rx, rfront, rback) along it, rounded caps."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    f = Vector(fwd)
    f = (f - axis * f.dot(axis)).normalized()
    side = axis.cross(f).normalized()
    secs = []
    for k, item in enumerate(radii):
        t = item[0]
        rx, fr, bk = (item[1], item[1], item[1]) if len(item) == 2 else item[1:4]
        off = Vector(offsets[k]) if offsets else Vector()
        secs.append((a.lerp(b, t) + off, rx, fr, bk, side, f))
    body = loft(name + '_tube', secs, seg=seg, cap=True)
    r0, r1 = radii[0][1], radii[-1][1]
    ends = [uv_sphere(name + '_ea', r0, seg, max(8, seg // 2), loc=a.lerp(b, radii[0][0])),
            uv_sphere(name + '_eb', r1, seg, max(8, seg // 2), loc=a.lerp(b, radii[-1][0]))]
    return join([body, *ends], name)


def torus(name, R, r, seg=24, rseg=8, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A ring lying in the XY plane (rot in degrees turns it)."""
    bm = bmesh.new()
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(rseg):
            b = 2 * math.pi * j / rseg
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            ring.append(bm.verts.new(p))
        verts.append(ring)
    for i in range(seg):
        for j in range(rseg):
            a, b = verts[i][j], verts[(i + 1) % seg][j]
            c, d = verts[(i + 1) % seg][(j + 1) % rseg], verts[i][(j + 1) % rseg]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm)
    o.rotation_euler = [math.radians(v) for v in rot]
    o.location = loc
    apply_all(o)
    shade_smooth(o)
    return o


def white_vertex_colors(o):
    """A plain white COLOR_0, so every model in a file has the same attributes (and tinting is just the colour)."""
    me = o.data
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    ca = me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = ca
    me.color_attributes.render_color_index = 0
    for d in ca.data:
        d.color = (1.0, 1.0, 1.0, 1.0)
