"""
Our own cartoon head, replacing the sculpted Quaternius face: a smooth, round shell with the same skull (so every
hair style still fits), full cheeks, a soft small chin, no sculpted features, simple ears, and the painted face
(face_paint.py) on a planar face UV.

The face frame (painter units around the head centre, as face_paint.FRAME): x -12..12, y -10.5 (top) .. 13.5.
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

import gs

FRAME = (-12.0, -10.5, 12.0, 13.5)
FACE_SCALE = 12.0  # painter units per head half width (people.ts draws its head at 15: the 3D face is 25% bolder)


def build(ubc_head, kind, faces_dir):
    """The head mesh (Skin on the back and ears, Face on the front) and the face frame's placement."""
    vs = [ubc_head.matrix_world @ v.co for v in ubc_head.data.vertices]
    top = max(v.z for v in vs)
    bot = min(v.z for v in vs)
    skull = [v for v in vs if v.z > bot + (top - bot) * 0.3]
    x0, x1 = min(v.x for v in skull), max(v.x for v in skull)
    y0, y1 = min(v.y for v in skull), max(v.y for v in skull)
    w, d = (x1 - x0) / 2 * 0.86, (y1 - y0) / 2  # without the ears
    chin = min(v.z for v in vs if v.y < y0 + d * 0.6)
    c = Vector((0.0, (y0 + y1) / 2 + d * 0.06, (top + chin) / 2 + (top - chin) * 0.02))
    up, down = top - c.z, c.z - chin
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=24, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        # a round head, a little wider at the cheeks, a soft small chin
        if z < 0:
            t = (-z) ** 1.6
            x *= 1 - 0.28 * t
            y *= 1 - 0.2 * t
        cheek = math.exp(-((z + 0.35) / 0.35) ** 2) * max(0.0, -y)
        x *= 1 + 0.06 * cheek
        if y < 0:
            y *= 0.9  # a flatter face: a clean canvas for the painted features
        v.co = Vector((x * w, y * d * 1.02, z * (up if z > 0 else down)))
    bmesh.ops.translate(bm, vec=c, verts=bm.verts)
    head = gs.mesh_obj(f'head_{kind}', bm)
    gs.set_mats(head, ['Skin', 'Face'])
    unit = w / FACE_SCALE
    # the painter's centre (cy) sits 15 units above the chin, like people.ts paints it (R = 15)
    fc = Vector((0.0, c.y, chin + 15.0 * unit))
    fx0, fx1 = fc.x + FRAME[0] * unit, fc.x + FRAME[2] * unit
    ftop, fbot = fc.z - FRAME[1] * unit, fc.z - FRAME[3] * unit
    me = head.data
    uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        cen = p.center
        front = p.normal.y < -0.25 and fbot - 0.01 < cen.z < ftop + 0.01 and fx0 < cen.x < fx1
        p.material_index = 1 if front else 0
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((co.x - fx0) / (fx1 - fx0), (co.z - fbot) / (ftop - fbot)) if front else (0.5, 0.5)
    gs.shade_smooth(head)
    ears = []
    for s in (1, -1):
        e = gs.ellipsoid('ear', (s * w * 0.98, c.y + d * 0.08, fc.z - 1.5 * unit), (w * 0.12, w * 0.16, w * 0.22), rot=(0, 0, -s * 15), seg=14, rings=9)
        gs.set_mats(e, ['Skin'])
        eu = e.data.uv_layers.new(name='UVMap')
        for dd in eu.data:
            dd.uv = (0.5, 0.5)
        gs.shade_smooth(e)
        ears.append(e)
    head = gs.join([head, *ears], f'head_{kind}')
    info = dict(C=c, w=w, d=d, up=up, down=down, top=top, front=y0, back=y1, face_center=fc, unit=unit, chin=chin)
    return head, info


def eye_points(head, info):
    """Where the painted eyes land on the head surface (for the glasses): centre and radius, per eye."""
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(head, bpy.context.evaluated_depsgraph_get())
    fc, u = info['face_center'], info['unit']
    out = []
    for s in (1, -1):
        x, z = fc.x + (0.8 + s * 5.8) * u, fc.z - 1.2 * u
        hit = bvh.ray_cast(Vector((x, fc.y - 1.0, z)), Vector((0, 1, 0)))
        out.append((hit[0] if hit[0] is not None else Vector((x, fc.y - info['d'], z)), 3.9 * u, s))
    return out


def glasses(head, info):
    """Round glasses over the painted eyes: two separate rims, a bridge over the nose, temples to the ears."""
    pts = eye_points(head, info)
    ny = min(p.y for p, r, s in pts) - 0.01
    gap = abs(pts[0][0].x - pts[1][0].x)
    R = min(pts[0][1], gap / 2 - 0.008)
    parts, lens = [], []
    for p, r, s in pts:
        parts.append(gs.torus('rim', R, 0.0026, 24, 5, loc=(p.x, ny, p.z), rot=(90, 0, 0)))
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=16, radius=R * 0.96)
        ln = gs.mesh_obj('lens', bm)
        ln.rotation_euler = (math.radians(90), 0, 0)
        ln.location = (p.x, ny + 0.001, p.z)
        gs.apply_all(ln)
        lens.append(ln)
    (p1, _, _), (p2, _, _) = pts
    parts.append(gs.limb('bridge', Vector((p2.x + R, ny, p2.z + 0.006)), Vector((p1.x - R, ny, p1.z + 0.006)), [(0, 0.0024), (1, 0.0024)], seg=5))
    for p, r, s in pts:
        parts.append(gs.limb('temple', Vector((p.x + s * R, ny + 0.004, p.z + 0.004)), Vector((s * (info['w'] * 0.98), info['C'].y + 0.02, p.z + 0.01)), [(0, 0.0024), (1, 0.0024)], seg=5))
    frame = gs.join(parts, 'glasses')
    gs.set_mats(frame, ['Glasses'])
    gs.shade_smooth(frame)
    ll = gs.join(lens, 'glasses_lens')
    gs.set_mats(ll, ['Lens'])
    return gs.join([frame, ll], 'glasses')
