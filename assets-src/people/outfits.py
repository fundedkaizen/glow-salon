"""
The outfits (src/art/salon/people.ts OutfitKind, plus the player's apron): each one is the body with its garment
regions cut on clean loops and given their material, a little volume and a lip at every hem, plus the parts that
make the silhouette (a flared skirt with folds, a hood, a collar, lapels and a tie, a dungaree bib, an apron...).

Materials, tinted by the floor engine from the Look (see src/art3d/catalog.ts for which colour goes where):
Skin, Top, Bottom, Shoes, Shirt (the layer under an open jacket or cardigan), Detail (a tie, a sash, a stripe),
Apron (players), Scrubs (staff and nurses).
"""
import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import gs

OUTFITS = ['dress', 'jumper', 'dungarees', 'suit', 'hoodie', 'sporty', 'cardigan', 'jacket', 'scrubs', 'chef', 'player']
MASC_SKIP = {'dress'}


def marks(J):
    """Heights and reaches on the rest pose the garment edges are measured from."""
    g = lambda n: J[n][0]
    sh, el, wr = g('upperarm_l'), g('lowerarm_l'), g('hand_l')
    hip, kn, an = g('thigh_l'), g('calf_l'), g('foot_l')
    neck = g('neck_01')
    return dict(
        shx=sh.x, shz=sh.z, elx=el.x, wrx=wr.x, neck=neck.z, hip=hip.z, knee=kn.z, ankle=an.z,
        waist=g('spine_01').z + 0.01, spine2=g('spine_02').z, chest=g('spine_03').z,
        armx=sh.x - 0.018, crotch=hip.z - 0.05,
    )


# Garment specs: sleeve ('none', 'cap', 'short', 'three', 'long'), the top's hem height ('waist', 'hip', 'low',
# 'full' = down into the skirt), neckline ('round', 'v', 'scoop', 'high'), legs ('trousers', 'shorts', 'skirt', 'bare').
SPEC = {
    'dress': dict(top='Top', sleeve='cap', hem='full', neck='scoop', legs='skirt', skirt='Top', skirt_len=0.72, sash='Detail'),
    'jumper': dict(top='Top', sleeve='long', hem='hip', neck='round', legs='trousers', collar=True, rib=True),
    'dungarees': dict(top='Top', sleeve='short', hem='waist', neck='round', legs='trousers', bib=True),
    'suit': dict(top='Top', sleeve='long', hem='low', neck='v', legs='trousers', lapels=True, tie=True),
    'hoodie': dict(top='Top', sleeve='long', hem='hip', neck='round', legs='trousers', hood=True, pocket=True, rib=True),
    'sporty': dict(top='Top', sleeve='none', hem='waist', neck='scoop', legs='shorts', stripe=True),
    'cardigan': dict(top='Top', sleeve='long', hem='hip', neck='v', legs='skirt', skirt='Bottom', skirt_len=0.55, open=True, buttons=True),
    'jacket': dict(top='Top', sleeve='long', hem='hip', neck='v', legs='trousers', open=True, collar_up=True),
    'scrubs': dict(top='Scrubs', bottom='Scrubs', sleeve='short', hem='hip', neck='v', legs='trousers', pocket_chest=True),
    'chef': dict(top='Top', sleeve='long', hem='low', neck='high', legs='trousers', kerchief=True, buttons2=True),
    'player': dict(top='Top', sleeve='three', hem='hip', neck='round', legs='trousers', apron=True),
}


def _region(M, spec, p: Vector, n: Vector):
    """Which material a point of the body wears, by where it is on the T-pose."""
    ax = abs(p.x)
    top, bottom = spec['top'], spec.get('bottom', 'Bottom')
    # shoes
    if p.z < M['ankle'] + 0.028 and ax < M['armx']:
        return 'Shoes'
    # arms (horizontal in the T-pose)
    if ax > M['armx'] and p.z > M['shz'] - 0.12:
        if ax > M['wrx'] + 0.004:
            return 'Skin'
        reach = {'none': M['armx'] - 0.004, 'cap': M['shx'] + 0.3 * (M['elx'] - M['shx']), 'short': M['shx'] + 0.58 * (M['elx'] - M['shx']),
                 'three': M['elx'] + 0.55 * (M['wrx'] - M['elx']), 'long': M['wrx'] - 0.012}[spec['sleeve']]
        return top if ax < reach else 'Skin'
    # legs
    if p.z < M['crotch']:
        legs = spec['legs']
        if legs == 'trousers':
            return bottom
        if legs == 'shorts':
            return bottom if p.z > M['knee'] + 0.45 * (M['hip'] - M['knee']) else 'Skin'
        return 'Skin'
    # neck and neckline
    neckz = M['neck'] - 0.012
    if spec['neck'] == 'high':
        neckz = M['neck'] + 0.02
    if p.z > neckz and (p.x ** 2 + (p.y - 0.008) ** 2) ** 0.5 < 0.062:
        return 'Skin'
    front = p.y < -0.01
    if spec['neck'] == 'scoop' and front and p.z > neckz - 0.05 * max(0.0, 1 - (ax / 0.085) ** 2):
        return 'Skin'
    if spec['neck'] == 'v' and front:
        depth = 0.11 if spec.get('open') or spec.get('lapels') else 0.065
        if p.z > neckz - depth * max(0.0, 1 - ax / (0.055 if not spec.get('open') else 0.05)):
            return 'Shirt' if (spec.get('open') or spec.get('lapels')) else 'Skin'
    if spec.get('open') and front and ax < 0.028 and p.z > {'hip': M['hip'] + 0.05, 'low': M['hip'] - 0.02}.get(spec['hem'], M['waist']):
        return 'Shirt'
    # the top's hem, then what is under it
    hem = {'waist': M['waist'] - 0.02, 'hip': M['hip'] + 0.04, 'low': M['hip'] - 0.03, 'full': -1}[spec['hem']]
    if p.z > hem:
        return top
    if spec['legs'] == 'skirt':
        return spec.get('skirt', 'Bottom') if spec['hem'] != 'full' else top
    return bottom


def _cuts(M, spec):
    """The planes each garment edge follows (so the material changes along a clean loop)."""
    planes = [((0, 0, M['ankle'] + 0.028), (0, 0, 1))]
    reach = {'none': None, 'cap': M['shx'] + 0.3 * (M['elx'] - M['shx']), 'short': M['shx'] + 0.58 * (M['elx'] - M['shx']),
             'three': M['elx'] + 0.55 * (M['wrx'] - M['elx']), 'long': M['wrx'] - 0.012}[spec['sleeve']]
    for s in (1, -1):
        planes.append(((s * (M['wrx'] + 0.004), 0, 0), (1, 0, 0)))
        if reach:
            planes.append(((s * reach, 0, 0), (1, 0, 0)))
        else:
            planes.append(((s * (M['armx'] - 0.004), 0, 0), (1, 0, 0)))
    hem = {'waist': M['waist'] - 0.02, 'hip': M['hip'] + 0.04, 'low': M['hip'] - 0.03, 'full': None}[spec['hem']]
    if hem:
        planes.append(((0, 0, hem), (0, 0, 1)))
    if spec['legs'] == 'shorts':
        planes.append(((0, 0, M['knee'] + 0.45 * (M['hip'] - M['knee'])), (0, 0, 1)))
    if spec['legs'] in ('skirt', 'bare', 'shorts'):
        planes.append(((0, 0, M['crotch']), (0, 0, 1)))
    planes.append(((0, 0, M['neck'] - 0.012 if spec['neck'] != 'high' else M['neck'] + 0.02), (0, 0, 1)))
    neckz = M['neck'] - 0.012
    if spec['neck'] == 'v':
        depth = 0.11 if spec.get('open') or spec.get('lapels') else 0.065
        w = 0.055 if not spec.get('open') else 0.05
        for s in (1, -1):
            n = Vector((s * depth / w, 0, -1)).normalized()
            planes.append(((0, 0, neckz - depth), tuple(n), 'front+' if s > 0 else 'front-'))
    if spec.get('open'):
        for s in (1, -1):
            planes.append(((s * 0.028, 0, 0), (1, 0, 0), 'front'))
    return planes


def dress_body(body, M, spec, name):
    """A copy of the body wearing the garment: cut, coloured, with volume and hem lips."""
    o = body.copy()
    o.data = body.data.copy()
    o.name = name
    o.data.name = name
    gs.link(o)
    for cut in _cuts(M, spec):
        _bisect_band(o, cut[0], cut[1], M, cut[2] if len(cut) > 2 else None)
    mats = ['Skin', 'Top', 'Bottom', 'Shoes', 'Shirt', 'Detail', 'Apron', 'Scrubs']
    gs.set_mats(o, mats)
    me = o.data
    idx = {m: i for i, m in enumerate(mats)}
    for p in me.polygons:
        p.material_index = idx[_region(M, spec, p.center, p.normal)]
    _puff(o, idx, M)
    _drop_unused(o)
    return o


def _bisect_band(o, co, no, M, where=None):
    """Bisect only the part of the mesh the plane is meant for (arms for X planes, the torso/legs for Z planes,
    or the front of the torso for the open-front and V-neck edges)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    co, no = Vector(co), Vector(no)
    if where:
        side = {'front': 0, 'front+': 1, 'front-': -1}[where]
        faces = [f for f in bm.faces if f.calc_center_median().y < 0.0 and abs(f.calc_center_median().x) < M['armx'] - 0.01
                 and f.calc_center_median().z > M['crotch'] and (side == 0 or f.calc_center_median().x * side >= -0.002)]
    elif abs(no.x) > 0.5:
        faces = [f for f in bm.faces if abs(f.calc_center_median().x) > M['armx'] - 0.03 and f.calc_center_median().z > M['shz'] - 0.12 and (f.calc_center_median().x > 0) == (co.x > 0)]
    else:
        faces = [f for f in bm.faces if abs(f.calc_center_median().x) < M['armx'] + 0.01 or f.calc_center_median().z < M['shz'] - 0.12]
    edges = list({e for f in faces for e in f.edges})
    verts = list({v for f in faces for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=verts + edges + faces, plane_co=co, plane_no=no)
    bm.to_mesh(o.data)
    bm.free()


# The details sit on the dressed surface, which stands PUFF off the skin: they are lifted by LIFT on top of their own
# offset (they are measured on the bare body).
LIFT = 0.011
PUFF = {'Top': 0.009, 'Bottom': 0.009, 'Shirt': 0.006, 'Scrubs': 0.01, 'Apron': 0.009, 'Detail': 0.007, 'Shoes': 0.004, 'Skin': 0.0}


def _puff(o, idx, M=None):
    """Clothes stand off the skin with real thickness, a touch more at their edges (a hem lip); trousers loosen toward
    the ankle and tops toward the waist, so nothing reads as painted on."""
    me = o.data
    names = {i: m for m, i in idx.items()}
    vmat = [set() for _ in me.vertices]
    for p in me.polygons:
        for v in p.vertices:
            vmat[v].add(names[p.material_index])
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    edge_v = set()
    for v in bm.verts:
        if len(vmat[v.index]) > 1:
            edge_v.add(v.index)
    near = set()
    for i in edge_v:
        for e in bm.verts[i].link_edges:
            near.add(e.other_vert(bm.verts[i]).index)
    for v in bm.verts:
        ms = vmat[v.index]
        if not ms:
            continue
        d = max(PUFF.get(m, 0) for m in ms)
        if M and 'Skin' not in ms:
            z = v.co.z
            if ('Bottom' in ms or 'Scrubs' in ms) and z < M['crotch']:
                d += 0.012 * max(0.0, min(1.0, (M['crotch'] - z) / (M['crotch'] - M['ankle'])))
            if ('Top' in ms or 'Scrubs' in ms) and M['waist'] - 0.08 < z < M['chest'] and abs(v.co.x) < M['armx']:
                d += 0.006 * max(0.0, 1 - abs(z - (M['waist'] - 0.02)) / 0.1)
        if v.index in edge_v:
            d = min(PUFF.get(m, 0) for m in ms) * 0.5 + d * 0.5
        elif v.index in near and 'Skin' not in ms:
            d += 0.004
        v.co += v.normal * d
    bm.to_mesh(me)
    bm.free()


def _drop_unused(o):
    me = o.data
    used = {p.material_index for p in me.polygons}
    # keep slot order stable (the contract reads names, not indices); empty slots are harmless but we drop them
    for i in reversed(range(len(me.materials))):
        if i not in used:
            me.materials.pop(index=i)  # Blender shifts the faces' indices itself


# ---------------------------------------------------------------------------------------------- the extra parts

def _torso_ring(body, z, grow=0.0, seg=32):
    """The body's cross-section at height z (the torso only), as (angle -> radius point) samples, pushed out by grow."""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    pts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        d = Vector((math.sin(a), -math.cos(a), 0))
        origin = Vector((0, 0.01, z))
        hit = bvh.ray_cast(origin, d, 0.4)
        p = hit[0] if hit[0] is not None else Vector((0, 0.01, z)) + d * 0.1
        pts.append(p + d * grow)
    return pts


def skirt(body, M, top_z, length, mat, folds=11, flare=0.07, name='skirt'):
    """A flared skirt from top_z down by length, with soft folds that deepen toward the hem, and a thin hem edge."""
    seg = 36
    rings = 6
    bm = bmesh.new()
    top = _torso_ring(body, top_z, 0.004 + LIFT, seg)
    center = Vector((0, 0.012, top_z))
    # the widest the hips get under the skirt, so the skirt always clears them
    clear = [0.0] * seg
    for zz in [top_z - k * 0.012 for k in range(1, 16)]:
        if zz < M['crotch'] + 0.01:
            break
        for i, p in enumerate(_torso_ring(body, zz, 0.01 + LIFT, seg)):
            q = p - center
            q.z = 0
            clear[i] = max(clear[i], q.length)
    rows = []
    for r in range(rings):
        t = r / (rings - 1)
        z = top_z - length * t
        row = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            base = top[i] - center
            base.z = 0
            rad = base.length * (1 + (flare / 0.12) * t ** 1.2) + 0.004 * t
            if r > 0:
                rad = max(rad, clear[i] + 0.004 * t)
            fold = 1 + 0.07 * t ** 1.3 * math.sin(folds * a + 0.6)
            d = base.normalized()
            p = Vector((0, center.y, z)) + d * rad * fold
            row.append(bm.verts.new(p))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = gs.mesh_obj(name, bm)
    for f in o.data.polygons:
        f.use_smooth = True
    # make sure normals point out
    o.data.update()
    sol = o.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.005
    sol.offset = 1.0
    sol.use_even_offset = True
    gs.apply_all(o)
    gs.set_mats(o, [mat])
    gs.shade_smooth(o)
    return o


def front_patch(body, poly, offset, thickness, mat, name, back=False, cuts=4):
    """
    A garment piece with a clean outline: the polygon poly [(x, z), ...] drawn on a plane in front of (or behind)
    the body, filled, subdivided, and projected onto the body along Y, lifted by offset, with a thin edge.
    """
    bm = bmesh.new()
    y0 = 0.5 if back else -0.5
    vs = [bm.verts.new(Vector((x, y0, z))) for x, z in poly]
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    o = gs.mesh_obj(name, bm)
    sw = o.modifiers.new('wrap', 'SHRINKWRAP')
    sw.target = body
    sw.wrap_method = 'PROJECT'
    sw.use_project_y = True
    sw.use_negative_direction = back
    sw.use_positive_direction = not back
    sw.offset = offset + LIFT
    offset = offset + LIFT
    gs.apply_all(o)
    # where the projection missed the body (beside the neck), snap to the nearest surface instead
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    for v in o.data.vertices:
        if abs(v.co.y - y0) < 1e-4:
            hit = bvh.find_nearest(v.co)
            if hit[0] is not None:
                v.co = hit[0] + hit[1] * offset
    for p in o.data.polygons:
        if (p.normal.y > 0) != back:
            p.flip()
    o.data.update()
    sol = o.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = thickness
    sol.offset = -1.0
    gs.apply_all(o)
    gs.set_mats(o, [mat])
    gs.shade_smooth(o)
    return o


def band(body, z, grow, height, mat, name):
    """A band around the torso at height z (a sash, a ribbed hem, a stripe, a collar)."""
    r = gs.torus(name, 1.0, 0.1, 36, 4)
    _fit_ring(r, body, z, grow + LIFT, height)
    gs.set_mats(r, [mat])
    gs.shade_smooth(r)
    return r


def extras(body, M, spec, kind):
    """The parts beyond the painted body, for one outfit."""
    out = []
    nz = M['neck']
    if spec['legs'] == 'skirt' and kind == 'fem':
        top_z = M['waist'] + 0.01 if spec['hem'] == 'full' else M['hip'] + 0.045
        length = (top_z - M['knee']) * spec['skirt_len'] / 0.72 * 0.86
        out.append(skirt(body, M, top_z, length, spec['skirt'], flare=0.075 if spec['hem'] == 'full' else 0.05))
    if spec.get('sash'):
        out.append(band(body, M['waist'] + 0.01, 0.006, 0.02, spec['sash'], 'sash'))
    if spec.get('collar'):
        out.append(band(body, nz - 0.012, 0.005, 0.014, spec['top'], 'collar'))
    if spec.get('rib'):
        out.append(band(body, M['hip'] + 0.05, 0.006, 0.02, spec['top'], 'rib'))
    if spec.get('hood'):
        h = gs.ellipsoid('hood', (0, 0.07, nz + 0.005), (0.1 if kind == 'fem' else 0.115, 0.05, 0.055), rot=(-20, 0, 0))
        gs.set_mats(h, [spec['top']])
        out.append(h)
        for s in (1, -1):
            st = gs.limb('string', _front(body, Vector((s * 0.022, 0, nz - 0.015))) + Vector((0, -0.006, 0)), _front(body, Vector((s * 0.026, 0, nz - 0.1))) + Vector((0, -0.006, 0)), [(0, 0.004), (1, 0.004)], seg=6)
            gs.set_mats(st, ['Shirt'])
            out.append(st)
    if spec.get('pocket'):
        z0, z1 = M['hip'] + 0.07, M['hip'] + 0.15
        out.append(front_patch(body, [(-0.075, z0), (0.075, z0), (0.06, z1), (-0.06, z1)], 0.009, 0.004, spec['top'], 'pocket'))
    if spec.get('bib'):
        z0, z1 = M['waist'] - 0.03, M['chest'] + 0.015
        out.append(front_patch(body, [(-0.078, z0), (0.078, z0), (0.07, z1), (-0.07, z1)], 0.011, 0.004, 'Bottom', 'bib'))
        for s in (1, -1):
            xa, xb = sorted((s * 0.05, s * 0.072))
            out.append(front_patch(body, [(xa, z1 - 0.01), (xb, z1 - 0.01), (xb + s * 0.004, nz - 0.015), (xa + s * 0.004, nz - 0.015)], 0.006, 0.003, 'Bottom', 'strap'))
            out.append(front_patch(body, [(s * 0.03 - 0.012, M['waist']), (s * 0.03 + 0.012, M['waist']), (s * 0.066 + 0.012, nz - 0.015), (s * 0.066 - 0.012, nz - 0.015)], 0.006, 0.003, 'Bottom', 'strapback', back=True))
            b = gs.uv_sphere('button', 0.008, 10, 6, loc=_front(body, Vector((s * 0.058, 0, z1 - 0.01))) + Vector((0, -0.008, 0)))
            gs.set_mats(b, ['Detail'])
            out.append(b)
    if spec.get('lapels'):
        for s in (1, -1):
            zb, zt = M['chest'] - 0.075, nz - 0.018
            pts = [(s * 0.004, zb), (s * 0.05, zt - 0.03), (s * 0.058, zt), (s * 0.03, zt)]
            if s < 0:
                pts.reverse()
            out.append(front_patch(body, pts, 0.0075, 0.003, 'Top', 'lapel'))
    if spec.get('tie'):
        top = Vector((0, 0, nz - 0.03))
        out.append(_tie(body, top, M['waist'] + 0.02))
    if spec.get('stripe'):
        out.append(band(body, M['chest'] - 0.03, 0.006, 0.016, 'Detail', 'stripe'))
    if spec.get('open') and spec.get('buttons'):
        for k in range(4):
            z = M['chest'] - 0.02 - k * 0.055
            b = gs.uv_sphere('button', 0.007, 8, 6, loc=_front(body, Vector((-0.036, 0, z))) + Vector((0, -0.006, 0)))
            gs.set_mats(b, ['Detail'])
            out.append(b)
    if spec.get('collar_up'):
        out.append(band(body, nz - 0.008, 0.01, 0.024, spec['top'], 'collar'))
    if spec.get('kerchief'):
        out.append(band(body, nz + 0.012, 0.007, 0.018, 'Detail', 'kerchief'))
        knot = gs.ellipsoid('knot', _front(body, Vector((0, 0, nz - 0.005))) + Vector((0, -0.01, 0)), (0.018, 0.012, 0.014))
        gs.set_mats(knot, ['Detail'])
        out.append(knot)
    if spec.get('buttons2'):
        for k in range(3):
            for s in (1, -1):
                b = gs.uv_sphere('button', 0.006, 8, 6, loc=_front(body, Vector((s * 0.03, 0, M['chest'] - k * 0.05))) + Vector((0, -0.005, 0)))
                gs.set_mats(b, ['Shirt'])
                out.append(b)
    if spec.get('pocket_chest'):
        z0, z1 = M['chest'] - 0.035, M['chest'] + 0.01
        out.append(front_patch(body, [(0.03, z0), (0.074, z0), (0.074, z1), (0.03, z1)], 0.0075, 0.003, spec['top'], 'pocket'))
    if spec.get('apron'):
        out += _apron(body, M, kind)
    return out


def _front(body, p: Vector) -> Vector:
    """The dressed front surface at (x, z): the body's, brought forward by the cloth's lift."""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    hit = bvh.ray_cast(Vector((p.x, -0.5, p.z)), Vector((0, 1, 0)))
    return (hit[0] + Vector((0, -LIFT, 0))) if hit[0] is not None else Vector((p.x, -0.08 - LIFT, p.z))


def _fit_ring(ring, body, z, grow, height):
    """Wrap a unit torus around the body's section at height z: radius from the body, the tube as a flat band."""
    pts = _torso_ring(body, z, grow, 64)
    center = Vector((0, 0.012, z))
    for v in ring.data.vertices:
        a = math.atan2(v.co.x, -v.co.y)
        k = (a % (2 * math.pi)) / (2 * math.pi) * 64
        i0 = int(k) % 64
        t = k - int(k)
        p = pts[i0].lerp(pts[(i0 + 1) % 64], t)
        base = Vector((p.x, p.y, 0)) - Vector((center.x, center.y, 0))
        r = math.hypot(v.co.x, v.co.y)
        out = (r - 1.0) / 0.1  # -1..1 across the tube
        v.co = Vector((center.x, center.y, z)) + base.normalized() * (base.length + out * 0.004 + 0.002) + Vector((0, 0, (v.co.z / 0.1) * height * 0.5))
    ring.data.update()


def _tie(body, top: Vector, bottom_z: float):
    pts = []
    for k in range(6):
        t = k / 5
        z = top.z + (bottom_z - top.z) * t
        f = _front(body, Vector((0, 0, z)))
        pts.append((f + Vector((0, -0.007, 0)), 0.011 + 0.007 * math.sin(t * math.pi * 0.9)))
    bm = bmesh.new()
    rows = []
    for p, w in pts:
        rows.append([bm.verts.new(p + Vector((-w, 0, 0))), bm.verts.new(p + Vector((w, 0, 0)))])
    tip = bm.verts.new(pts[-1][0] + Vector((0, 0, -0.02)))
    for r0, r1 in zip(rows, rows[1:]):
        bm.faces.new((r0[0], r0[1], r1[1], r1[0]))
    bm.faces.new((rows[-1][0], rows[-1][1], tip))
    o = gs.mesh_obj('tie', bm)
    sol = o.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.004
    gs.apply_all(o)
    gs.set_mats(o, ['Detail'])
    return o


def _apron(body, M, kind):
    """The player's apron: a bib on the chest with straps, a panel hanging in front of the legs, a waist tie."""
    z0, z1 = M['waist'] - 0.01, M['chest'] + 0.03
    parts = [front_patch(body, [(-0.068, z0), (0.068, z0), (0.062, z1), (-0.062, z1)], 0.009, 0.004, 'Apron', 'apronbib')]
    for s in (1, -1):
        xa, xb = sorted((s * 0.046, s * 0.064))
        parts.append(front_patch(body, [(xa, z1 - 0.01), (xb, z1 - 0.01), (xb + s * 0.004, M['neck'] - 0.012), (xa + s * 0.004, M['neck'] - 0.012)], 0.008, 0.003, 'Apron', 'apronstrap'))
    # the panel: the front arc of the waist, falling to above the knee and flaring a little
    top = M['waist'] - 0.01
    length = top - (M['knee'] + 0.09)
    seg, rings = 14, 6
    ring = _torso_ring(body, top, 0.012 + LIFT, 48)
    center = Vector((0, 0.012, top))
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    bm = bmesh.new()
    rows = []
    for r in range(rings):
        t = r / (rings - 1)
        z = top - length * t
        row = []
        for i in range(seg + 1):
            k = int(round(48 * (-0.2 + 0.4 * i / seg))) % 48  # the front arc, about -72 to +72 degrees
            base = ring[k] - center
            base.z = 0
            d = base.normalized()
            rad = base.length + 0.035 * t ** 1.3
            # never inside the thighs: cast in from outside and keep clear of the first surface met
            hit = bvh.ray_cast(Vector((0, center.y, z)) + d * 0.5, -d, 0.5)
            if hit[0] is not None:
                q = hit[0] - Vector((0, center.y, z))
                q.z = 0
                rad = max(rad, q.length + 0.02 + LIFT)
            row.append(bm.verts.new(Vector((0, center.y, z)) + d * rad))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(seg):
            bm.faces.new((r0[i], r0[i + 1], r1[i + 1], r1[i]))
    o = gs.mesh_obj('apronskirt', bm)
    for f in o.data.polygons:
        if f.normal.y > 0:
            f.flip()
    o.data.update()
    sol = o.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = 0.004
    sol.offset = -1.0
    gs.apply_all(o)
    gs.set_mats(o, ['Apron'])
    gs.shade_smooth(o)
    parts.append(o)
    parts.append(band(body, M['waist'] - 0.01, 0.01, 0.014, 'Apron', 'apronTie'))
    parts.append(front_patch(body, [(-0.05, top - 0.07), (0.05, top - 0.07), (0.05, top - 0.02), (-0.05, top - 0.02)], 0.028, 0.003, 'Apron', 'apronpocket'))
    return parts


def shoes(body, M):
    """A chunky pair of shoes over the feet (the bodies are barefoot): a rounded upper and a thick sole per foot,
    fitted to the foot's own size."""
    out = []
    for s in (1, -1):
        vs = [v.co for v in body.data.vertices if v.co.z < M['ankle'] + 0.005 and v.co.x * s > 0.01]
        if not vs:
            continue
        x0, x1 = min(v.x for v in vs), max(v.x for v in vs)
        y0, y1 = min(v.y for v in vs), max(v.y for v in vs)
        z1 = max(v.z for v in vs)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        w, l = (x1 - x0) / 2 + 0.01, (y1 - y0) / 2 + 0.008
        upper = gs.ellipsoid('upper', (cx, cy - 0.004, z1 * 0.45), (w, l, z1 * 0.6 + 0.012), seg=24, rings=14)
        sole = gs.box('sole', (w * 2.04, l * 2.0, 0.026), loc=(cx, cy - 0.004, 0.0), bevel=0.011, bevel_seg=3)
        o = gs.join([upper, sole], 'shoe')
        rem = o.modifiers.new('r', 'REMESH')
        rem.mode = 'VOXEL'
        rem.voxel_size = 0.005
        gs.apply_all(o)
        sm = o.modifiers.new('s', 'LAPLACIANSMOOTH')
        sm.iterations = 3
        sm.lambda_factor = 0.4
        gs.apply_all(o)
        gs.decimate(o, 420)
        gs.shade_smooth(o)
        gs.set_mats(o, ['Shoes', 'Sole'])
        for p in o.data.polygons:
            p.material_index = 1 if p.center.z < 0.024 else 0
        out.append(o)
    return out
