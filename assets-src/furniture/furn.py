"""
Furniture helpers: chunky rounded solids, tufted cushions, gold pedestals, and the export of one model (a .glb, its
manifest entry for the catalogue, and a 256 px thumbnail from the floor camera's angle).

Style (Serenity's Spa): chunky, rounded, glossy, saturated upholstery with gold trims. Every model keeps a clean,
readable silhouette in flat grey (the floor engine shows unbought items as a soft grey ghost), so no tiny floating
parts: small things sit on or touch a bigger part.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import gs  # noqa: E402

THUMBS = os.path.join(gs.MODELS, 'thumbs')
MODELS_OUT = os.path.join(gs.OUT, 'models')
MANIFEST = os.path.join(gs.OUT, 'manifest')

# Material presets: (colour, roughness, metallic). Upholstery is glossy (a soft sheen), gold is a warm polished metal.
M = {
    'gold': (0xe6b85c, 0.28, 1.0), 'rosegold': (0xe7a98e, 0.3, 1.0), 'chrome': (0xe8e8ee, 0.18, 1.0),
    'white': (0xfbf7f2, 0.45, 0.0), 'cream': (0xf6ecdc, 0.5, 0.0), 'marble': (0xf4f1ee, 0.22, 0.0),
    'wood': (0xc8905c, 0.55, 0.0), 'woodlight': (0xe2bb8a, 0.55, 0.0), 'wooddark': (0x7a5038, 0.5, 0.0),
    'black': (0x3a3238, 0.35, 0.0), 'glass': (0xe8f6fa, 0.05, 0.0), 'water': (0x7fd6e6, 0.05, 0.0),
    'leaf': (0x5cae6e, 0.6, 0.0), 'leafdark': (0x3f8a54, 0.6, 0.0), 'soil': (0x6e4a36, 0.9, 0.0),
    'pink': (0xf28aa8, 0.42, 0.0), 'rose': (0xe8627f, 0.4, 0.0), 'blush': (0xf7c6d4, 0.45, 0.0),
    'mint': (0x8fd8c0, 0.42, 0.0), 'teal': (0x4fb8a8, 0.4, 0.0), 'lilac': (0xb49ae6, 0.4, 0.0),
    'purple': (0x8e6ad0, 0.38, 0.0), 'yellow': (0xf6c945, 0.38, 0.0), 'butter': (0xfbe7b0, 0.45, 0.0),
    'blue': (0x6fb6ec, 0.4, 0.0), 'sky': (0xa8d8f4, 0.42, 0.0), 'coral': (0xf5907a, 0.4, 0.0),
    'ivory': (0xfff8ea, 0.45, 0.0), 'grey': (0xb8b2b6, 0.5, 0.0), 'lamp': (0xfff4d6, 0.3, 0.0),
    'navy': (0x3e4a7a, 0.4, 0.0), 'sage': (0xa9c49a, 0.5, 0.0), 'terracotta': (0xd98a62, 0.7, 0.0),
    'stone': (0xc9c2b8, 0.75, 0.0), 'bottleA': (0xf5a0b8, 0.15, 0.0), 'bottleB': (0x9fd0f2, 0.15, 0.0),
    'bottleC': (0xb6e39c, 0.15, 0.0), 'bottleD': (0xfbd9a0, 0.15, 0.0), 'screen': (0x9ec8e8, 0.2, 0.0),
}


def material(name, preset=None, color=None, rough=None, metal=None, emit=None, alpha=None):
    """A named material (the name is what the engine reads: Accent, Trim, Base... or a plain part name)."""
    c, r, m = M[preset] if preset else (0xffffff, 0.5, 0.0)
    return gs.mat(name, color if color is not None else c, rough=rough if rough is not None else r, metal=metal if metal is not None else m, emit=emit, alpha=alpha)


def new_model():
    gs.reset()


def rbox(name, size, loc=(0, 0, 0), mat='Accent', r=0.03, seg=3, subdiv=0):
    """A rounded box by its full size, standing on loc (loc is the middle of its bottom)."""
    sx, sy, sz = size
    r = min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4)
    o = gs.box(name, size, loc=loc, mat_name=mat)
    if r > 0:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = r
        b.segments = seg
        b.limit_method = 'NONE'
        b.harden_normals = False
    if subdiv:
        s = o.modifiers.new('sub', 'SUBSURF')
        s.levels = subdiv
    gs.apply_all(o)
    gs.shade_smooth(o)
    return o


def cushion(name, size, loc=(0, 0, 0), mat='Accent', puff=0.35, tufts=None, button_mat=None, seg=2):
    """
    A soft cushion: a rounded box, subdivided and puffed up in the middle; tufts=(nx, ny) presses diamond-pattern
    buttons into the top face (the look of a tufted recliner).
    """
    sx, sy, sz = size
    o = rbox(name, size, loc, mat, r=min(sz * 0.45, 0.05), seg=3)
    s = o.modifiers.new('sub', 'SUBSURF')
    s.levels = 1
    gs.apply_all(o)
    c = Vector(loc) + Vector((0, 0, sz / 2))
    me = o.data
    for v in me.vertices:
        p = v.co - c
        u, w = p.x / (sx / 2), p.y / (sy / 2)
        top = max(0.0, p.z / (sz / 2))
        bulge = max(0.0, 1 - u * u) * max(0.0, 1 - w * w)
        v.co.z += puff * sz * 0.35 * bulge * top
    buttons = []
    if tufts:
        nx, ny = tufts
        pts = []
        for i in range(nx):
            for j in range(ny):
                if (i + j) % 2:
                    continue
                pts.append((-sx / 2 + sx * (i + 0.5) / nx, -sy / 2 + sy * (j + 0.5) / ny))
        topz = c.z + sz / 2
        for v in me.vertices:
            p = v.co - c
            if p.z < sz * 0.1:
                continue
            for bx, by in pts:
                d2 = ((p.x - bx) / (sx / nx * 0.55)) ** 2 + ((p.y - by) / (sy / ny * 0.55)) ** 2
                if d2 < 1:
                    v.co.z -= sz * 0.28 * (1 - d2) ** 2
        for bx, by in pts:
            b = gs.uv_sphere(name + '_btn', min(sx / nx, sy / ny) * 0.09, 8, 6, loc=(c.x + bx, c.y + by, topz + puff * sz * 0.35 * max(0, 1 - (bx / (sx / 2)) ** 2) * max(0, 1 - (by / (sy / 2)) ** 2) - sz * 0.26))
            gs.set_mats(b, [button_mat or mat])
            buttons.append(b)
    me.update()
    gs.shade_smooth(o)
    return gs.join([o, *buttons], name) if buttons else o


def cyl(name, r1, r2, h, loc=(0, 0, 0), mat='Trim', seg=24, bevel=0.0):
    o = gs.cylinder(name, r1, r2, h, seg=seg, loc=loc, mat_name=mat)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = 2
        b.limit_method = 'ANGLE'
        gs.apply_all(o)
    gs.shade_smooth(o)
    auto_smooth(o)
    return o


def auto_smooth(o, angle=40):
    """Smooth shading with crisp edges past angle (so cylinders keep their rims)."""
    try:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
        gs.apply_all(o)
    except Exception:
        gs.shade_smooth(o)


def sphere(name, r, loc=(0, 0, 0), mat='Accent', scale=(1, 1, 1), seg=20, rings=12):
    o = gs.uv_sphere(name, r, seg, rings, loc=(0, 0, 0), mat_name=mat)
    o.scale = scale
    o.location = loc
    gs.apply_all(o)
    gs.shade_smooth(o)
    return o


def tube(name, pts, r, mat='Trim', seg=10):
    """A round bar through points (a lamp arm, a frame, a rail)."""
    parts = []
    for a, b in zip(pts, pts[1:]):
        parts.append(gs.limb(name, Vector(a), Vector(b), [(0, r), (1, r)], seg=seg))
    o = gs.join(parts, name)
    gs.set_mats(o, [mat])
    gs.shade_smooth(o)
    return o


def ring(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), mat='Trim', seg=32, rseg=8):
    o = gs.torus(name, R, r, seg, rseg, loc=loc, rot=rot)
    gs.set_mats(o, [mat])
    return o


def place(o, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    o.rotation_euler = [math.radians(v) for v in rot]
    o.location = loc
    if scale:
        o.scale = scale
    gs.apply_all(o)
    return o


def mirror_x(o):
    c = o.copy()
    c.data = o.data.copy()
    gs.link(c)
    c.scale = (-1, 1, 1)
    gs.apply_all(c)
    bm = bmesh.new()
    bm.from_mesh(c.data)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(c.data)
    bm.free()
    return c


def bottle(name, h, r, loc, mat, cap='Trim'):
    b = cyl(name, r, r, h * 0.72, loc=loc, mat=mat, seg=12)
    n = cyl(name + 'n', r * 0.45, r * 0.4, h * 0.14, loc=(loc[0], loc[1], loc[2] + h * 0.72), mat=mat, seg=10)
    c = cyl(name + 'c', r * 0.5, r * 0.5, h * 0.14, loc=(loc[0], loc[1], loc[2] + h * 0.86), mat=cap, seg=10)
    return gs.join([b, n, c], name)


# ---------------------------------------------------------------------------------------------- export

def nodes_info(empties):
    """Helper nodes in glTF terms: position (x, y up, z front) and the turn about the up axis in degrees."""
    out = {}
    for e in empties:
        p = e.matrix_world.translation
        rz = math.degrees(e.matrix_world.to_euler().z)
        out[e.name] = {'pos': [round(p.x, 4), round(p.z, 4), round(-p.y, 4)], 'rotY': round(rz, 1)}
    return out


def finish(meshes, ao=True, ao_distance=0.25, ao_strength=0.7, target=3200):
    """Join the parts, decimate to the triangle budget, bake soft occlusion (with a floor) into the vertex colours."""
    meshes = [m for m in meshes if m is not None]
    # one UV layer by the same name on every part, so a textured part keeps its UVs through the join
    if any(m.data.uv_layers for m in meshes):
        for m in meshes:
            if not m.data.uv_layers:
                m.data.uv_layers.new(name='UVMap')
            else:
                m.data.uv_layers[0].name = 'UVMap'
    body = gs.join(meshes, 'body')
    if target:
        gs.decimate(body, target)
        gs.shade_smooth(body)
    if ao:
        gs.bake_vertex_ao([body], samples=96, distance=ao_distance, strength=ao_strength, floor=True)
    else:
        gs.white_vertex_colors(body)
    return body


def export(model_id, style_id, folder, body, empties=(), meta=None, thumb=True, recolour=('Accent', 'Trim')):
    """Write one style of one model: public .glb (packed by build.sh), its manifest entry, and its thumbnail."""
    fname = f'{model_id}.glb' if style_id is None else f'{model_id}-{style_id}.glb'
    body.name = model_id if style_id is None else f'{model_id}-{style_id}'
    body.data.name = body.name
    for e in empties:
        e.parent = None
    path = os.path.join(MODELS_OUT, folder, fname)
    gs.export_glb(path, [body, *empties])
    bb = [body.matrix_world @ Vector(c) for c in body.bound_box]
    xs, ys, zs = [p.x for p in bb], [p.y for p in bb], [p.z for p in bb]
    info = {
        'file': f'{folder}/{fname}', 'footprint': [round(max(xs) - min(xs), 3), round(max(ys) - min(ys), 3)],
        'height': round(max(zs), 3), 'nodes': nodes_info(empties), 'materials': sorted({m.name for m in body.data.materials}),
        'tris': gs.tris(body), 'recolour': [r for r in recolour if r in {m.name for m in body.data.materials}],
    }
    if meta:
        info.update(meta)
    tpath = None
    if thumb:
        tname = f'{model_id}.png' if style_id is None else f'{model_id}-{style_id}.png'
        tpath = render_thumb(body, os.path.join(THUMBS, tname))
        info['thumb'] = f'thumbs/{tname}'
    return info


def render_thumb(body, path, size=256):
    """The item alone, transparent background, from the floor camera's angle (yaw 45, pitch 35, orthographic)."""
    sc = bpy.context.scene
    hidden = []
    for o in sc.objects:
        if o is not body and o.type in ('MESH', 'EMPTY') and not o.name.startswith('__'):
            if not o.hide_render:
                hidden.append(o)
                o.hide_render = True
    if not any(o.name == '__sun' for o in sc.objects):
        gs.studio(res=(size, size))
        bpy.data.objects['__floor'].hide_render = True
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    bb = [body.matrix_world @ Vector(c) for c in body.bound_box]
    center = sum(bb, Vector()) / 8
    # fit: project the box corners on the camera's screen axes
    cam = gs.game_view(target=center, ortho=1.0)
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ p for p in bb]
    span = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
    cam.data.ortho_scale = span * 1.12
    gs.render(path)
    for o in hidden:
        o.hide_render = False
    return path


def write_manifest(entry):
    os.makedirs(MANIFEST, exist_ok=True)
    with open(os.path.join(MANIFEST, f"{entry['id']}.json"), 'w') as f:
        json.dump(entry, f, indent=1)


def styled(model_id, name, kind, folder, styles, build, meta=None):
    """
    Build every style of a purchasable item. build(style) returns (body, empties); styles is a list of
    (style_id, style_name, params). Writes one manifest entry with the three styles (the first is the default).
    """
    out_styles = []
    first = None
    for sid, sname, params in styles:
        new_model()
        body, empties = build(params)
        info = export(model_id, sid, folder, body, empties, meta=None)
        if first is None:
            first = info
        out_styles.append({'id': sid, 'name': sname, 'file': info['file'], 'thumb': info['thumb']})
        print(f'MODEL {model_id}-{sid} tris={info["tris"]} footprint={info["footprint"]} h={info["height"]}')
    entry = {'id': model_id, 'name': name, 'kind': kind, 'file': first['file'], 'footprint': first['footprint'], 'height': first['height'],
             'nodes': first['nodes'], 'recolour': first['recolour'], 'materials': first['materials'], 'tris': first['tris'], 'styles': out_styles}
    if meta:
        entry.update(meta)
    write_manifest(entry)
    return entry


def single(model_id, name, kind, folder, build, meta=None):
    new_model()
    body, empties = build()
    info = export(model_id, None, folder, body, empties)
    entry = {'id': model_id, 'name': name, 'kind': kind, **{k: info[k] for k in ('file', 'footprint', 'height', 'nodes', 'recolour', 'materials', 'tris')}}
    if meta:
        entry.update(meta)
    write_manifest(entry)
    print(f'MODEL {model_id} tris={info["tris"]} footprint={info["footprint"]} h={info["height"]}')
    return entry
