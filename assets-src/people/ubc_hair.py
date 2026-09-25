"""
The seven hair styles of the Look (long, bob, bun, curly, crop, ponytail, braids) on the UBC heads: Quaternius'
sculpted pieces (CC0) over a short scalp cap, plus the pieces the free tier lacks, made here and textured with the
same strand texture so they match: a bob cut from the long hair, a ponytail, two braids and a cloud of curls.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector, noise

import gs
import hair as proc

STYLES = ['long', 'bob', 'bun', 'curly', 'crop', 'ponytail', 'braids']
CAP = {'fem': 'Hair_BuzzedFemale', 'masc': 'Hair_Buzzed'}


def head_info(head):
    """The head's centre, half width, half depth and crown height (from the head mesh above the neck cut)."""
    vs = [head.matrix_world @ v.co for v in head.data.vertices]
    xs, ys, zs = [p.x for p in vs], [p.y for p in vs], [p.z for p in vs]
    top = max(zs)
    # the skull: the upper two thirds (the neck stub below would skew the centre)
    lo = min(zs) + (top - min(zs)) * 0.35
    sk = [p for p in vs if p.z > lo]
    cx = 0.0
    cy = (min(p.y for p in sk) + max(p.y for p in sk)) / 2
    w = (max(p.x for p in sk) - min(p.x for p in sk)) / 2
    d = (max(p.y for p in sk) - min(p.y for p in sk)) / 2
    cz = top - w * 1.15
    return dict(C=Vector((cx, cy, cz)), w=w, d=d, up=top - cz, down=cz - min(zs), top=top, front=min(p.y for p in sk), back=max(p.y for p in sk))


def copy(o, name):
    c = o.copy()
    c.data = o.data.copy()
    c.name = c.data.name = name
    gs.link(c)
    for m in list(c.modifiers):
        c.modifiers.remove(m)
    c.parent = None
    return c


def cyl_uv(o, center, scale=6.0):
    """Strands run down: u around the head, v down the length (the strand texture's direction)."""
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            a = math.atan2(co.x - center.x, co.y - center.y)
            uv.data[li].uv = ((a / (2 * math.pi) + 0.5) * 2.0, (co.z - center.z) * scale)


def cut_below(o, z, fill=False):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(o.data)
    bm.free()


def tail(info, name='tail'):
    C, D = info['C'], info['d']
    tie = Vector((0, info['back'] - 0.01, C.z + 0.02))
    a = gs.limb(name, tie + Vector((0, 0.02, 0.01)), tie + Vector((0, 0.08, -0.14)), [(0, 0.042), (0.5, 0.05), (1, 0.04)], fwd=(0, 1, 0), seg=18)
    b = gs.limb(name + '2', tie + Vector((0, 0.08, -0.14)), tie + Vector((0, 0.06, -0.3)), [(0, 0.04), (1, 0.012)], fwd=(0, 1, 0), seg=18)
    o = gs.join([a, b], name)
    rem = o.modifiers.new('r', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = 0.005
    gs.apply_all(o)
    s = o.modifiers.new('s', 'LAPLACIANSMOOTH')
    s.iterations = 4
    s.lambda_factor = 0.5
    gs.apply_all(o)
    gs.decimate(o, 700)
    band = gs.torus('tie', 0.03, 0.008, 16, 6, loc=tie + Vector((0, 0.022, 0.012)), rot=(90 - 20, 0, 0))
    gs.set_mats(band, ['Accessory'])
    return o, band


def braids(info):
    C, W = info['C'], info['w']
    parts = []
    ties = []
    for s in (1, -1):
        a = Vector((s * W * 0.82, C.y + 0.03, C.z - info['down'] * 0.35))
        b = Vector((s * W * 0.98, C.y - 0.015, C.z - info['down'] - 0.2))
        for i in range(9):
            t = i / 8
            parts.append(gs.ellipsoid('lobe', a.lerp(b, t), (0.03 - 0.008 * t, 0.028 - 0.006 * t, 0.028), rot=(0, (1 if i % 2 else -1) * 28, 0), seg=14, rings=8))
        parts.append(gs.limb('tuft', b + Vector((0, 0, -0.02)), b + Vector((0, 0, -0.065)), [(0, 0.017), (1, 0.006)], seg=10))
        ties.append(gs.torus('tie', 0.018, 0.006, 14, 6, loc=b + Vector((0, 0, -0.018))))
    o = gs.join(parts, 'braids')
    rem = o.modifiers.new('r', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = 0.0045
    gs.apply_all(o)
    gs.decimate(o, 1100)
    t = gs.join(ties, 'ties')
    gs.set_mats(t, ['Accessory'])
    return o, t


def curls(info):
    """A soft cloud of curls around the crown and sides, a curly texture pressed in with noise."""
    C, W, D, U = info['C'], info['w'], info['d'], info['up']
    rnd = random.Random(7)
    parts = [gs.ellipsoid('cap', C + Vector((0, 0.01, 0.01)), (W + 0.03, D + 0.034, U + 0.03), seg=36, rings=22)]
    for i in range(16):
        a = 2 * math.pi * i / 16 + rnd.uniform(-0.15, 0.15)
        e = rnd.uniform(0.05, 0.8)
        cz, cr = math.sin(e * math.pi / 2), math.cos(e * math.pi / 2)
        p = C + Vector((math.sin(a) * cr * (W + 0.02), math.cos(a) * cr * (D + 0.02) + 0.012, cz * (U + 0.02) + 0.01))
        if p.y < C.y - D * 0.5 and p.z < C.z + U * 0.45:
            continue
        parts.append(gs.uv_sphere('lobe', rnd.uniform(0.065, 0.085), 16, 10, loc=p))
    o = gs.join(parts, 'curly')
    rem = o.modifiers.new('r', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = 0.006
    gs.apply_all(o)
    # the face opening and the nape
    cut = gs.ellipsoid('cut', C + Vector((0, -D * 0.95, U * 0.5 - 0.2)), (W * 0.86, D * 1.05, 0.2), seg=32, rings=20)
    proc._boolean(o, [cut, proc._box_below(C, -info['down'] * 0.55, y_from=-0.1)])
    s = o.modifiers.new('s', 'LAPLACIANSMOOTH')
    s.iterations = 6
    s.lambda_factor = 0.5
    s.use_volume_preserve = True
    gs.apply_all(o)
    for v in o.data.vertices:
        n = noise.noise(v.co * 24.0)
        v.co = v.co + v.normal * (0.009 * max(-0.4, n))
    gs.decimate(o, 1300)
    gs.shade_smooth(o)
    return o


def build_all(kind, pieces, head):
    """pieces: the loaded UBC hair meshes by name (rest pose, unskinned copies are made). Returns {style: mesh}."""
    info = head_info(head)
    C = info['C']
    cap = pieces[CAP[kind]]
    out = {}
    def styled(style, parts, extra_mats=()):
        o = gs.join(parts, 'hair_' + style)
        o.name = o.data.name = 'hair_' + style
        return o
    # long
    out['long'] = styled('long', [copy(cap, 'c'), copy(pieces['Hair_Long'], 'l')])
    # bob: the long hair cut at the jaw
    bob = copy(pieces['Hair_Long'], 'b')
    cut_below(bob, C.z - info['down'] * 0.55)
    out['bob'] = styled('bob', [copy(cap, 'c'), bob])
    out['bun'] = styled('bun', [copy(cap, 'c'), copy(pieces['Hair_Buns'], 'u')])
    cr = curls(info)
    cyl_uv(cr, C, 8.0)
    gs.set_mats(cr, ['Hair'])
    out['curly'] = styled('curly', [cr])
    if kind == 'masc':
        out['crop'] = styled('crop', [copy(cap, 'c'), copy(pieces['Hair_SimpleParted'], 's')])
    else:
        out['crop'] = styled('crop', [copy(cap, 'c')])
    tl, band = tail(info)
    cyl_uv(tl, Vector((0, info['back'] + 0.07, C.z)), 5.0)
    gs.set_mats(tl, ['Hair'])
    out['ponytail'] = styled('ponytail', [copy(cap, 'c'), tl, band])
    br, ties = braids(info)
    cyl_uv(br, C, 7.0)
    gs.set_mats(br, ['Hair'])
    out['braids'] = styled('braids', [copy(cap, 'c'), br, ties])
    for o in out.values():
        # smooth shading everywhere: drop the imported split normals (they kept every facet hard)
        gs.activate(o)
        try:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        except Exception:
            pass
        for p in o.data.polygons:
            p.use_smooth = True
        for e in o.data.edges:
            e.use_edge_sharp = False
    return out, info


def glasses(eyes, info):
    """Round glasses in front of the eyes (the two eye balls' centres), temples back to the ears."""
    vs = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
    parts, lens = [], []
    centres = []
    for s in (1, -1):
        side = [p for p in vs if p.x * s > 0]
        c = sum(side, Vector()) / len(side)
        r = (max(p.x for p in side) - min(p.x for p in side)) / 2
        front = min(p.y for p in side)
        centres.append((c, r, front))
    ny = min(f for _, _, f in centres) - 0.012
    gap = abs(centres[0][0].x - centres[1][0].x)
    # each lens about the eye socket's size, never touching the other one (a bridge spans the gap over the nose)
    R = min(r for _, r, _ in centres) * 1.2
    R = min(R, gap / 2 - 0.009)
    for (c, r, front), s in zip(centres, (1, -1)):
        parts.append(gs.torus('rim', R, 0.0022, 24, 5, loc=(c.x, ny, c.z), rot=(90, 0, 0)))
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=14, radius=R * 0.96)
        ln = gs.mesh_obj('lens', bm)
        ln.rotation_euler = (math.radians(90), 0, 0)
        ln.location = (c.x, ny + 0.001, c.z)
        gs.apply_all(ln)
        lens.append(ln)
    (c1, r1, _), (c2, r2, _) = centres
    parts.append(gs.limb('bridge', Vector((c2.x + R, ny, c2.z + 0.006)), Vector((c1.x - R, ny, c1.z + 0.006)), [(0, 0.002), (1, 0.002)], seg=5))
    for (c, r, _), s in zip(centres, (1, -1)):
        a = Vector((c.x + s * R, ny + 0.004, c.z + 0.002))
        b = Vector((s * (info['w'] + 0.004), info['C'].y + 0.02, c.z + 0.01))
        parts.append(gs.limb('temple', a, b, [(0, 0.0022), (1, 0.0022)], seg=4))
    frame = gs.join(parts, 'glasses')
    gs.set_mats(frame, ['Glasses'])
    gs.shade_smooth(frame)
    lenses = gs.join(lens, 'glasses_lens')
    gs.set_mats(lenses, ['Lens'])
    return gs.join([frame, lenses], 'glasses')
