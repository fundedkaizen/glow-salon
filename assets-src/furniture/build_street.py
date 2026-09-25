"""
Street props, three styles each: the bike rack with a bike leaning in it, and the A-frame chalkboard sign.

    python assets-src/furniture/street_textures.py      (the chalkboard face, once)
    blender -b --python assets-src/furniture/build_street.py

The bike: a real frame (top tube, down tube, seat tube, stays, fork), two wheels with tyres, rims, spokes and hubs,
handlebars, a saddle and a front basket; both tyres touch the ground, the front wheel in the rack's hoop. The sign:
two boards meeting on a hinge at the top, legs splayed evenly, a chalkboard face ("Glow Salon, open", a flower).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'lib'), HERE]

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import furn  # noqa: E402
import gs  # noqa: E402
from build_stations import finish_station, mats  # noqa: E402

R = 0.3  # wheel radius (tyre outside)


def wheel(cx, cz, parts):
    """A wheel in the YZ plane (the bike runs along Y): tyre, rim, 12 spokes, hub."""
    parts.append(furn.ring('tyre', R - 0.02, 0.022, loc=(0, cx, cz), rot=(0, 90, 0), mat='Tyre', seg=36, rseg=8))
    parts.append(furn.ring('rim', R - 0.045, 0.009, loc=(0, cx, cz), rot=(0, 90, 0), mat='Silver', seg=36, rseg=6))
    for i in range(12):
        a = 2 * math.pi * i / 12
        parts.append(furn.tube('spoke', [(0, cx, cz), (0, cx + math.cos(a) * (R - 0.05), cz + math.sin(a) * (R - 0.05))], 0.0022, mat='Silver', seg=4))
    hub = furn.cyl('hub', 0.025, 0.025, 0.06, loc=(0, 0, 0), mat='Silver', seg=12)
    parts.append(furn.place(hub, loc=(-0.03, cx, cz), rot=(0, 90, 0)))


def bike(parts, y0=0.0, x=0.0, lean=0.0):
    """The bike along Y, the front (basket) toward -Y; its parts in parts. Returns nothing (parts extended)."""
    sub = []
    fy, by = y0 - 0.52, y0 + 0.52  # the wheel centres
    wheel(fy, R, sub)
    wheel(by, R, sub)
    bb = Vector((0, y0 + 0.08, R - 0.02))  # bottom bracket
    seat = Vector((0, y0 + 0.24, R + 0.5))
    head_top = Vector((0, fy + 0.14, R + 0.52))
    head_bot = Vector((0, fy + 0.1, R + 0.36))
    for a, b in ((bb, seat), (bb, head_bot), (seat - Vector((0, 0.03, 0.06)), head_top), (bb, Vector((0, by, R))), (seat - Vector((0, 0, 0.04)), Vector((0, by, R)))):
        sub.append(furn.tube('frame', [a, b], 0.018, mat='Accent', seg=10))
    for s in (1, -1):
        sub.append(furn.tube('fork', [head_bot + Vector((s * 0.02, 0, 0)), Vector((s * 0.035, fy, R))], 0.012, mat='Accent', seg=8))
    sub.append(furn.tube('headtube', [head_bot, head_top + Vector((0, -0.01, 0.1))], 0.02, mat='Accent', seg=10))
    bar = head_top + Vector((0, -0.01, 0.1))
    sub.append(furn.tube('bar', [bar + Vector((-0.24, 0.04, 0)), bar + Vector((0.24, 0.04, 0))], 0.012, mat='Silver', seg=8))
    for s in (1, -1):
        sub.append(furn.tube('grip', [bar + Vector((s * 0.2, 0.04, 0)), bar + Vector((s * 0.26, 0.05, 0))], 0.018, mat='Tyre', seg=8))
    sub.append(furn.tube('post', [seat, seat + Vector((0, 0.02, 0.1))], 0.012, mat='Silver', seg=8))
    saddle = furn.sphere('saddle', 0.09, mat='Saddle', scale=(0.6, 1.2, 0.3))
    sub.append(furn.place(saddle, loc=seat + Vector((0, 0.02, 0.12))))
    # the front basket on the handlebars
    basket = furn.cyl('basket', 0.14, 0.12, 0.16, loc=(0, 0, 0), mat='Basket', seg=16)
    sub.append(furn.place(basket, loc=bar + Vector((0, -0.2, -0.16))))
    sub.append(furn.ring('basketrim', 0.14, 0.01, loc=bar + Vector((0, -0.2, 0.0)), mat='Basket', seg=20))
    sub.append(furn.tube('basketarm', [bar + Vector((0, -0.02, -0.02)), bar + Vector((0, -0.08, -0.08))], 0.01, mat='Silver', seg=6))
    # pedals and chainring
    sub.append(furn.ring('chainring', 0.08, 0.01, loc=bb + Vector((-0.035, 0, 0)), rot=(0, 90, 0), mat='Silver', seg=20))
    for s in (1, -1):
        crank = bb + Vector((s * 0.06, s * 0.1, -s * 0.06))
        sub.append(furn.tube('crank', [bb + Vector((s * 0.05, 0, 0)), crank], 0.01, mat='Silver', seg=6))
        sub.append(furn.rbox('pedal', (0.08, 0.05, 0.02), loc=crank + Vector((s * 0.03, 0, -0.01)), mat='Tyre', r=0.006))
    b = gs.join(sub, 'bike')
    b.rotation_euler = (0, math.radians(lean), 0)
    b.location = (x, 0, 0)
    gs.apply_all(b)
    # after leaning, put both tyres back on the ground
    dz = min((b.matrix_world @ v.co).z for v in b.data.vertices)
    for v in b.data.vertices:
        v.co.z -= dz
    parts.append(b)


def rack(style):
    mats(dict(accent=style['frame'], accent2='cream', trim='gold', base='white'))
    furn.material('Tyre', color=0x3a3436, rough=0.7)
    furn.material('Silver', 'chrome' if style['metal'] == 'chrome' else 'gold')
    furn.material('Saddle', color=0x7a5038, rough=0.5)
    furn.material('Basket', color=0xd8b27c, rough=0.8)
    furn.material('RackMetal', style['metal'])
    parts = [furn.rbox('plate', (0.34, 1.1, 0.02), loc=(0.12, 0, 0), mat='Base', r=0.008)]
    if style['rack'] == 'hoop':
        # an inverted-U hoop, stainless, bolted to the plate
        pts = [(0.12, -0.35, 0.02), (0.12, -0.35, 0.62)] + [(0.12, -0.35 + 0.35 * (1 - math.cos(a)), 0.62 + 0.35 * math.sin(a)) for a in [i * math.pi / 10 for i in range(1, 10)]] + [(0.12, 0.35, 0.62), (0.12, 0.35, 0.02)]
        parts.append(furn.tube('hoop', pts, 0.028, mat='RackMetal', seg=12))
    else:
        # a low wave rack
        pts = [(0.12, -0.5 + i * 0.05, 0.02 + 0.3 * abs(math.sin(i * math.pi / 10))) for i in range(21)]
        parts.append(furn.tube('wave', pts, 0.024, mat='RackMetal', seg=10))
    for y in (-0.45, 0.45):
        parts.append(furn.cyl('bolt', 0.03, 0.03, 0.03, loc=(0.12, y, 0.0), mat='RackMetal', seg=10))
    bike(parts, y0=0.0, x=-0.02, lean=6)
    return finish_station(parts, {}, 0)


def sign(style):
    mats(dict(accent=style['frame'], accent2='cream', trim='gold', base='white'))
    img = bpy.data.images.load(os.path.join(gs.MODELS, 'street', 'sign_chalk.png'))
    gs.mat('Chalk', 0xffffff, rough=0.85, image=img)
    parts = []
    Hs, Ws, a = 0.95, 0.56, math.radians(14)
    for s in (1, -1):
        # each board hangs from the hinge line at the top and splays out to its legs
        board = furn.rbox('board', (Ws, 0.03, Hs), loc=(0, 0, -Hs), mat='Accent', r=0.012)
        parts.append(furn.place(board, loc=(0, -s * 0.02, Hs + 0.02), rot=(math.degrees(s * a), 0, 0)))
        if s < 0:
            # (rotating by -a swings a board toward -Y: this is the front one) the chalkboard face on the front board (the one splaying toward the street, -Y), on its outside
            bm = bmesh.new()
            vs = [bm.verts.new(v) for v in ((-Ws / 2 + 0.05, -0.017, -Hs + 0.09), (Ws / 2 - 0.05, -0.017, -Hs + 0.09), (Ws / 2 - 0.05, -0.017, -0.07), (-Ws / 2 + 0.05, -0.017, -0.07))]
            f = bm.faces.new(vs)
            uv = bm.loops.layers.uv.new('UVMap')
            for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                l[uv].uv = t
            face = gs.mesh_obj('chalk', bm, 'Chalk')
            for p in face.data.polygons:
                if p.normal.y > 0:
                    p.flip()
            face.data.update()
            parts.append(furn.place(face, loc=(0, 0.02, Hs + 0.02), rot=(math.degrees(-a), 0, 0)))
    hinge = furn.cyl('hinge', 0.018, 0.018, Ws + 0.02, loc=(0, 0, 0), mat='Trim', seg=10)
    parts.append(furn.place(hinge, loc=(-Ws / 2 - 0.01, 0, Hs + 0.02), rot=(0, 90, 0)))
    # a chain between the boards keeps the legs even
    ly = math.tan(a) * Hs * 0.55
    parts.append(furn.tube('chain', [(Ws / 2 - 0.03, -ly, Hs * 0.45), (Ws / 2 - 0.03, ly, Hs * 0.45)], 0.005, mat='Trim', seg=6))
    return finish_station(parts, {}, 0)


ITEMS = [
    ('bike-rack', 'Bike and rack', rack, [
        ('chrome', 'Stainless hoop, mint bike', dict(rack='hoop', metal='chrome', frame='mint')),
        ('gold', 'Gold wave, pink bike', dict(rack='wave', metal='gold', frame='pink')),
        ('white', 'White hoop, lilac bike', dict(rack='hoop', metal='white', frame='lilac')),
    ]),
    ('a-frame-sign', 'A-frame sign', sign, [
        ('wood', 'Natural wood', dict(frame='woodlight')),
        ('white', 'White', dict(frame='white')),
        ('pink', 'Pink', dict(frame='pink')),
    ]),
]


def main():
    for mid, name, fn, styles in ITEMS:
        furn.styled(mid, name, 'life', 'street', styles, fn)


if __name__ == '__main__':
    main()
