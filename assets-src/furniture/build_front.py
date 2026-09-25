"""
Front of house, three styles each (the Customize strip): the reception desk with its computer and bell, the waiting
sofa, the armchair, the coffee table, the floor lamp, the rug, the wall mirror and the plant pot.

    blender -b --python assets-src/furniture/build_front.py [-- id ...]

Seats fit the sit_sofa clip (assets-src/out/seats.json): each `seat`, `seat2`... node is where a sitter's hips go.
The reception desk's front (-Y in Blender, +Z in glTF) faces the customers; its screen faces the back, where the
staff stand (`work`).
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'lib'), HERE]

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import furn  # noqa: E402
import gs  # noqa: E402
from build_stations import finish_station, mats  # noqa: E402

SEATS = json.load(open(os.path.join(gs.OUT, 'seats.json')))
SOFA = SEATS['sit_sofa']
H_SOFA = -SOFA['heel_z_min']  # the hips' height above the floor


def plant(x, y, z, size=1.0, kind='round', pot='Accent'):
    """A potted plant: a pot and a leafy crown (round bush, tall cone, or spiky palm)."""
    parts = [furn.cyl('pot', 0.1 * size, 0.08 * size, 0.18 * size, loc=(x, y, z), mat=pot, seg=20, bevel=0.01),
             furn.cyl('potrim', 0.108 * size, 0.108 * size, 0.025 * size, loc=(x, y, z + 0.17 * size), mat='Trim', seg=20),
             furn.cyl('soil', 0.095 * size, 0.095 * size, 0.01, loc=(x, y, z + 0.18 * size), mat='Soil', seg=16)]
    top = z + 0.19 * size
    if kind == 'round':
        for i, (dx, dy, dz, r) in enumerate(((0, 0, 0.14, 0.13), (0.07, 0.03, 0.1, 0.09), (-0.07, -0.02, 0.11, 0.09), (0.0, -0.06, 0.2, 0.08))):
            parts.append(furn.sphere('leaves', r * size, loc=(x + dx * size, y + dy * size, top + dz * size), mat='Leaf', seg=14, rings=9))
    elif kind == 'cone':
        o = furn.cyl('cone', 0.13 * size, 0.02 * size, 0.55 * size, loc=(x, y, top), mat='Leaf', seg=16)
        parts.append(o)
        parts.append(furn.sphere('cbase', 0.13 * size, loc=(x, y, top + 0.05 * size), mat='Leaf', scale=(1, 1, 0.6)))
    else:
        # a palm: arching fronds on stems that all grow from the pot (nothing floats: it must read as a grey ghost)
        parts.append(furn.cyl('trunk', 0.03 * size, 0.022 * size, 0.2 * size, loc=(x, y, top), mat='Wood', seg=10))
        crown = top + 0.2 * size
        for i in range(7):
            a = 2 * math.pi * i / 7
            mid = (x + math.cos(a) * 0.12 * size, y + math.sin(a) * 0.12 * size, crown + 0.12 * size)
            tip = (x + math.cos(a) * 0.27 * size, y + math.sin(a) * 0.27 * size, crown + 0.02 * size)
            parts.append(furn.tube('stem', [(x, y, crown), mid, tip], 0.008 * size, mat='Leaf', seg=6))
            leaf = furn.sphere('frond', 0.1 * size, mat='Leaf', scale=(1.0, 0.35, 0.1))
            parts.append(furn.place(leaf, loc=((mid[0] + tip[0]) / 2, (mid[1] + tip[1]) / 2, (mid[2] + tip[2]) / 2), rot=(0, 20, math.degrees(a))))
    return parts


# ---------------------------------------------------------------------------------------------- reception desk

def reception(style):
    mats(style)
    shape = style['shape']
    parts = []
    W, D, Ht = 1.5, 0.6, 1.02
    if shape == 'curve':
        # a curved front: a quarter-ring counter
        body = furn.cyl('counter', 1.0, 1.0, Ht, loc=(0, 0.75, 0), mat='Base', seg=48, bevel=0.02)
        inner = furn.cyl('cut', 0.55, 0.55, Ht + 0.2, loc=(0, 0.75, -0.1), mat='Base', seg=48)
        for o, op in ((inner, 'DIFFERENCE'),):
            m = body.modifiers.new('c', 'BOOLEAN'); m.operation = op; m.object = o; m.solver = 'EXACT'
        gs.apply_all(body); bpy.data.objects.remove(inner)
        box = furn.rbox('keep', (2.4, 1.2, 2), loc=(0, -0.6 + 0.75 - 0.6 + 0.6, -0.5), mat='Base', r=0)
        m = body.modifiers.new('k', 'BOOLEAN'); m.operation = 'INTERSECT'; m.object = box; m.solver = 'EXACT'
        gs.apply_all(body); bpy.data.objects.remove(box)
        gs.shade_smooth(body)
        parts.append(body)
        top = furn.cyl('top', 1.03, 1.03, 0.04, loc=(0, 0.75, Ht), mat='Accent', seg=48, bevel=0.01)
        cut = furn.cyl('topcut', 0.52, 0.52, 0.2, loc=(0, 0.75, Ht - 0.05), mat='Accent', seg=48)
        m = top.modifiers.new('c', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cut; m.solver = 'EXACT'
        gs.apply_all(top); bpy.data.objects.remove(cut)
        keep = furn.rbox('keep2', (2.4, 1.2, 1), loc=(0, 0.15, Ht - 0.2), mat='Accent', r=0)
        m = top.modifiers.new('k', 'BOOLEAN'); m.operation = 'INTERSECT'; m.object = keep; m.solver = 'EXACT'
        gs.apply_all(top); bpy.data.objects.remove(keep)
        parts.append(top)
        top_y, top_z = 0.1, Ht
    else:
        parts.append(furn.rbox('counter', (W, D, Ht), loc=(0, 0, 0), mat='Base', r=0.04))
        parts.append(furn.rbox('top', (W + 0.06, D + 0.06, 0.04), loc=(0, 0, Ht), mat='Accent' if shape == 'wood' else 'Marble', r=0.015))
        parts.append(furn.rbox('kick', (W - 0.04, D - 0.04, 0.06), loc=(0, 0.01, 0), mat='Trim', r=0.01))
        if shape == 'panel':
            for i in range(7):
                x = -W / 2 + 0.1 + i * (W - 0.2) / 6
                parts.append(furn.rbox('flute', (0.1, 0.03, Ht - 0.14), loc=(x, -D / 2 - 0.01, 0.08), mat='Accent', r=0.014))
        else:
            parts.append(furn.rbox('band', (W + 0.01, 0.02, 0.05), loc=(0, -D / 2 - 0.005, Ht - 0.14), mat='Trim', r=0.006))
        top_y, top_z = 0.0, Ht + 0.04
    # a lower work shelf at the back for the computer (staff side, +Y)
    shelf_z = 0.78
    parts.append(furn.rbox('shelf', (1.1, 0.4, 0.04), loc=(0, top_y + 0.42, shelf_z), mat='Accent2', r=0.012))
    parts.append(furn.rbox('shelfleg', (1.05, 0.05, shelf_z), loc=(0, top_y + 0.6, 0), mat='Accent2', r=0.01))
    # the computer: the screen faces the back (the staff)
    parts.append(furn.rbox('monitor', (0.46, 0.035, 0.3), loc=(-0.15, top_y + 0.36, shelf_z + 0.13), mat='Black', r=0.012))
    parts.append(furn.rbox('screen', (0.42, 0.006, 0.26), loc=(-0.15, top_y + 0.38, shelf_z + 0.15), mat='Screen', r=0.004))
    parts.append(furn.rbox('stand', (0.05, 0.05, 0.13), loc=(-0.15, top_y + 0.33, shelf_z + 0.04), mat='Trim', r=0.01))
    parts.append(furn.rbox('keyboard', (0.36, 0.12, 0.02), loc=(-0.15, top_y + 0.52, shelf_z + 0.04), mat='White', r=0.006))
    # a bell, a card stand and a small plant on the counter
    parts.append(furn.cyl('bellbase', 0.05, 0.05, 0.012, loc=(0.4, top_y - 0.05, top_z), mat='Black', seg=16))
    parts.append(furn.sphere('bell', 0.04, loc=(0.4, top_y - 0.05, top_z + 0.012), mat='Trim', scale=(1, 1, 0.8)))
    parts.append(furn.rbox('cards', (0.12, 0.06, 0.06), loc=(0.15, top_y - 0.08, top_z), mat='Accent2', r=0.01))
    parts += plant(-0.55, top_y - 0.02, top_z, 0.55, 'round', pot='White')
    nodes = {'work': ((0, top_y + 0.85, 0), 180), 'lookat': ((0, top_y, 1.3), 0), 'tool': ((0.4, top_y - 0.05, top_z + 0.05), 0)}
    return finish_station(parts, nodes, 0)


# ---------------------------------------------------------------------------------------------- sofa and armchair

def seat_unit(style, seats=2):
    """A plump sofa (or an armchair when seats is 1): cushions sized so the sit_sofa clip sinks in right."""
    mats(style)
    shape = style['shape']
    parts = []
    per = 0.62
    W = per * seats + 0.24
    seat_top = H_SOFA + SOFA['seat_z']
    base_z = 0.1
    parts.append(furn.rbox('base', (W, 0.8, seat_top - 0.13 - base_z), loc=(0, 0.05, base_z), mat='Accent2', r=0.06))
    for i in range(seats):
        x = -per * (seats - 1) / 2 + i * per
        parts.append(furn.cushion('cush', (per - 0.03, 0.66, 0.14), loc=(x, -0.02, seat_top - 0.14), mat='Accent', puff=0.6,
                                  tufts=(2, 2) if style.get('tufted') else None, button_mat='Trim'))
        back = furn.cushion('back', (per - 0.03, 0.18, 0.5 if shape != 'shell' else 0.46), loc=(0, 0, 0), mat='Accent', puff=0.6,
                            tufts=(2, 3) if style.get('tufted') else None, button_mat='Trim')
        parts.append(furn.place(back, loc=(x, 0.34, seat_top - 0.06), rot=(-12, 0, 0)))
    if shape == 'shell':
        # a scalloped shell back: fluted lobes over the top
        n = seats * 3
        for i in range(n):
            x = -W / 2 + 0.14 + i * (W - 0.28) / max(n - 1, 1)
            parts.append(furn.sphere('lobe', 0.12, loc=(x, 0.43, seat_top + 0.36), mat='Accent', scale=(1.0, 0.55, 0.7)))
    for s in (1, -1):
        arm_h = seat_top + 0.18
        arm = furn.cushion('arm', (0.15, 0.76, arm_h - base_z), loc=(s * (W / 2 - 0.02), 0.04, base_z), mat='Accent2' if shape != 'shell' else 'Accent', puff=0.3)
        parts.append(arm)
        if shape == 'roll':
            roll = furn.cyl('roll', 0.09, 0.09, 0.76, loc=(0, 0, 0), mat='Accent2', seg=20)
            parts.append(furn.place(roll, loc=(s * (W / 2 - 0.02), 0.42, arm_h), rot=(90, 0, 0)))
    # legs: gold tapered (tufted), short wood (roll), gold plinth (shell)
    for sx in (1, -1):
        for sy in (1, -1):
            x, y = sx * (W / 2 - 0.08), 0.05 + sy * 0.32
            if shape == 'roll':
                parts.append(furn.cyl('leg', 0.03, 0.022, base_z, loc=(x, y, 0), mat='Wood', seg=12))
            elif shape == 'shell':
                pass
            else:
                parts.append(furn.cyl('leg', 0.022, 0.028, base_z + 0.02, loc=(x, y, 0), mat='Trim', seg=12))
    if shape == 'shell':
        parts.append(furn.rbox('plinth', (W - 0.1, 0.7, base_z), loc=(0, 0.05, 0), mat='Trim', r=0.02))
    if style.get('pillow'):
        parts.append(furn.place(furn.cushion('pillow', (0.3, 0.1, 0.28), loc=(0, 0, 0), mat='Accent3' if 'Accent3' in bpy.data.materials else 'Trim', puff=0.9),
                                loc=(-W / 2 + 0.3, 0.2, seat_top + 0.02), rot=(-20, 0, 10)))
    nodes = {}
    for i in range(seats):
        x = -per * (seats - 1) / 2 + i * per
        nodes['seat' if i == 0 else f'seat{i + 1}'] = ((x, -0.02 + (0.33 - 0.66 / 2), H_SOFA), 0)
    return finish_station(parts, nodes, H_SOFA)


def sofa(style):
    return seat_unit(style, 2)


def armchair(style):
    return seat_unit(style, 1)


# ---------------------------------------------------------------------------------------------- small pieces

def coffee_table(style):
    mats(style)
    shape = style['shape']
    parts = []
    h = 0.4
    if shape == 'oval':
        top = furn.cyl('top', 0.5, 0.5, 0.045, loc=(0, 0, h - 0.045), mat='Accent', seg=40, bevel=0.012)
        top.scale = (1, 0.55, 1); gs.apply_all(top); parts.append(top)
        for sx in (1, -1):
            for sy in (1, -1):
                parts.append(furn.tube('leg', [(sx * 0.3, sy * 0.13, h - 0.045), (sx * 0.34, sy * 0.16, 0)], 0.016, mat='Trim'))
    elif shape == 'round':
        parts.append(furn.cyl('top', 0.4, 0.4, 0.05, loc=(0, 0, h - 0.05), mat='Marble', seg=40, bevel=0.012))
        parts.append(furn.cyl('ring', 0.405, 0.405, 0.014, loc=(0, 0, h - 0.06), mat='Trim', seg=40))
        parts.append(furn.cyl('base', 0.16, 0.22, h - 0.06, loc=(0, 0, 0), mat='Trim', seg=28))
    else:
        parts.append(furn.rbox('top', (0.9, 0.5, 0.05), loc=(0, 0, h - 0.05), mat='Accent', r=0.02))
        parts.append(furn.rbox('shelf', (0.8, 0.42, 0.03), loc=(0, 0, 0.1), mat='Accent', r=0.012))
        for sx in (1, -1):
            for sy in (1, -1):
                parts.append(furn.rbox('leg', (0.05, 0.05, h - 0.05), loc=(sx * 0.4, sy * 0.19, 0), mat='Accent2', r=0.012))
    # a magazine and a small plant
    parts.append(furn.rbox('mag', (0.18, 0.13, 0.012), loc=(0.14, 0.02, h), mat='Accent2', r=0.004))
    parts += plant(-0.15, 0.0, h, 0.45, 'round', pot='White')
    return finish_station(parts, {}, 0)


def floor_lamp(style):
    mats(style)
    shape = style['shape']
    parts = [furn.cyl('base', 0.15, 0.17, 0.04, loc=(0, 0, 0), mat='Trim', seg=28, bevel=0.01)]
    if shape == 'globe':
        parts.append(furn.tube('pole', [(0, 0, 0.04), (0, 0, 1.35)], 0.016, mat='Trim'))
        parts.append(furn.sphere('globe', 0.15, loc=(0, 0, 1.47), mat='Lamp', seg=24, rings=16))
    elif shape == 'arc':
        pts = [(0, 0, 0.04), (0, 0, 1.2), (0.15, 0, 1.55), (0.45, 0, 1.6), (0.6, 0, 1.45)]
        parts.append(furn.tube('arc', pts, 0.016, mat='Trim'))
        shade = furn.cyl('shade', 0.08, 0.17, 0.16, loc=(0, 0, 0), mat='Accent', seg=24)
        parts.append(furn.place(shade, loc=(0.6, 0, 1.28)))
        parts.append(furn.cyl('bulb', 0.07, 0.07, 0.01, loc=(0.6, 0, 1.3), mat='Lamp', seg=16))
    else:
        parts.append(furn.tube('pole', [(0, 0, 0.04), (0, 0, 1.25)], 0.016, mat='Trim'))
        parts.append(furn.cyl('shade', 0.2, 0.14, 0.3, loc=(0, 0, 1.22), mat='Accent', seg=28))
        parts.append(furn.cyl('glow', 0.13, 0.13, 0.01, loc=(0, 0, 1.23), mat='Lamp', seg=20))
    return finish_station(parts, {}, 0)


def rug(style):
    mats(style)
    shape = style['shape']
    if shape == 'oval':
        o = furn.cyl('rug', 1.0, 1.0, 0.015, loc=(0, 0, 0), mat='Accent', seg=48, bevel=0.006)
        o.scale = (1, 0.62, 1); gs.apply_all(o)
        b = furn.cyl('border', 1.03, 1.03, 0.012, loc=(0, 0, 0), mat='Accent2', seg=48)
        b.scale = (1, 0.64, 1); gs.apply_all(b)
        parts = [o, b]
    elif shape == 'flower':
        parts = [furn.cyl('centre', 0.35, 0.35, 0.016, loc=(0, 0, 0), mat='Accent2', seg=32)]
        for i in range(6):
            a = 2 * math.pi * i / 6
            parts.append(furn.cyl('petal', 0.42, 0.42, 0.014, loc=(math.cos(a) * 0.5, math.sin(a) * 0.5, 0), mat='Accent', seg=32))
    else:
        parts = [furn.rbox('rug', (2.0, 1.3, 0.015), loc=(0, 0, 0), mat='Accent', r=0.006),
                 furn.rbox('inner', (1.6, 0.9, 0.018), loc=(0, 0, 0), mat='Accent2', r=0.006)]
    return finish_station(parts, {}, 0)


def mirror(style):
    """A wall mirror: its back against the wall at y=0 (the wall is behind, +Y), hanging with its middle at 1.4 m."""
    mats(style)
    shape = style['shape']
    parts = []
    zc = 1.4
    if shape == 'arch':
        g = furn.rbox('glass', (0.6, 0.02, 0.8), loc=(0, -0.03, zc - 0.5), mat='Glass', r=0.005)
        top = furn.cyl('glasstop', 0.3, 0.3, 0.02, loc=(0, 0, 0), mat='Glass', seg=32)
        parts += [g, furn.place(top, loc=(0, -0.02, zc + 0.3), rot=(90, 0, 0))]
        parts.append(furn.rbox('frameL', (0.05, 0.05, 0.8), loc=(-0.32, -0.02, zc - 0.5), mat='Trim', r=0.015))
        parts.append(furn.rbox('frameR', (0.05, 0.05, 0.8), loc=(0.32, -0.02, zc - 0.5), mat='Trim', r=0.015))
        parts.append(furn.rbox('frameB', (0.69, 0.05, 0.05), loc=(0, -0.02, zc - 0.53), mat='Trim', r=0.015))
        arc = furn.ring('arc', 0.32, 0.025, mat='Trim', seg=40)
        arc = furn.place(arc, loc=(0, -0.02, zc + 0.3), rot=(90, 0, 0))
        parts.append(arc)
    elif shape == 'round':
        g = furn.cyl('glass', 0.38, 0.38, 0.02, loc=(0, 0, 0), mat='Glass', seg=40)
        parts.append(furn.place(g, loc=(0, -0.01, zc), rot=(90, 0, 0)))
        parts.append(furn.place(furn.ring('frame', 0.4, 0.035, mat='Trim', seg=48), loc=(0, -0.02, zc), rot=(90, 0, 0)))
    else:
        g = furn.rbox('glass', (0.5, 0.02, 0.9), loc=(0, -0.02, zc - 0.45), mat='Glass', r=0.2)
        parts.append(g)
        parts.append(furn.rbox('back', (0.62, 0.03, 1.02), loc=(0, 0.0, zc - 0.51), mat='Accent', r=0.25))
        for i in range(8):
            a = 2 * math.pi * i / 8
            parts.append(furn.sphere('bulb', 0.025, loc=(math.cos(a) * 0.3, -0.03, zc + math.sin(a) * 0.48), mat='Lamp'))
    return finish_station(parts, {}, 0)


def pot(style):
    mats(style)
    return finish_station(plant(0, 0, 0, 2.2, style['plant'], pot='Accent'), {}, 0)


FRONT = [
    ('reception-desk', 'Reception desk', reception, None, [
        ('white', 'White and gold', dict(shape='flat', accent='marble', accent2='blush', trim='gold', base='white')),
        ('curve', 'Curved counter', dict(shape='curve', accent='pink', accent2='pink', trim='gold', base='white')),
        ('wood', 'Fluted wood', dict(shape='panel', accent='woodlight', accent2='wood', trim='gold', base='cream')),
    ]),
    ('sofa', 'Waiting sofa', sofa, 'sit_sofa', [
        ('blush', 'Blush tufted', dict(shape='tufted', accent='blush', accent2='pink', trim='gold', tufted=True)),
        ('teal', 'Teal shell', dict(shape='shell', accent='teal', accent2='mint', trim='gold')),
        ('cream', 'Cream roll arm', dict(shape='roll', accent='cream', accent2='ivory', trim='gold')),
    ]),
    ('armchair', 'Armchair', armchair, 'sit_sofa', [
        ('lilac', 'Lilac tufted', dict(shape='tufted', accent='lilac', accent2='lilac', trim='gold', tufted=True)),
        ('mint', 'Mint shell', dict(shape='shell', accent='mint', accent2='mint', trim='gold')),
        ('butter', 'Butter roll arm', dict(shape='roll', accent='butter', accent2='yellow', trim='gold')),
    ]),
    ('coffee-table', 'Coffee table', coffee_table, None, [
        ('oval', 'Oval wood', dict(shape='oval', accent='woodlight', trim='gold')),
        ('round', 'Round marble', dict(shape='round', accent='marble', trim='gold')),
        ('pastel', 'Pastel two-tier', dict(shape='tier', accent='blush', accent2='pink', trim='gold')),
    ]),
    ('floor-lamp', 'Floor lamp', floor_lamp, None, [
        ('globe', 'Gold globe', dict(shape='globe', accent='ivory', trim='gold')),
        ('arc', 'Arc lamp', dict(shape='arc', accent='pink', trim='gold')),
        ('drum', 'Drum shade', dict(shape='drum', accent='cream', trim='gold')),
    ]),
    ('rug', 'Rug', rug, None, [
        ('oval', 'Oval blush', dict(shape='oval', accent='blush', accent2='pink')),
        ('flower', 'Flower', dict(shape='flower', accent='butter', accent2='coral')),
        ('rect', 'Framed sage', dict(shape='rect', accent='sage', accent2='cream')),
    ]),
    ('mirror', 'Wall mirror', mirror, None, [
        ('arch', 'Gold arch', dict(shape='arch', accent='white', trim='gold')),
        ('round', 'Round gold', dict(shape='round', accent='white', trim='gold')),
        ('vanity', 'Vanity lights', dict(shape='vanity', accent='pink', trim='gold')),
    ]),
    ('plant-pot', 'Plant pot', pot, None, [
        ('round', 'Round bush', dict(accent='terracotta', trim='gold', plant='round')),
        ('cone', 'Topiary cone', dict(accent='white', trim='gold', plant='cone')),
        ('palm', 'Palm', dict(accent='blush', trim='gold', plant='palm')),
    ]),
]


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for mid, name, fn, clip, styles in FRONT:
        if only and mid not in only:
            continue
        furn.styled(mid, name, 'front', 'front', styles, fn, meta={'sitClip': clip} if clip else None)


if __name__ == '__main__':
    main()
