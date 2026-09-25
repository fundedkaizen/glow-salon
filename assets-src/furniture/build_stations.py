"""
The treatment stations, three styles each (the Customize strip): the facial chair, the pedicure throne with its
basin, the nail desk with the customer's stool, and the brow bar chair.

    blender -b --python assets-src/furniture/build_stations.py

Every seat is fitted to its clip (assets-src/out/seats.json, measured on the people): the `seat` node is where the
hips go, facing the node's front. Nodes: seat, work (where the worker stands, facing the customer), tool (where a
tool rests), feet (the pedicure basin), lookat (the customer's face, for the camera).
"""
import json
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

SEATS = json.load(open(os.path.join(gs.OUT, 'seats.json')))


def mats(style):
    """The palette of a style: Accent (upholstery), Trim (metal), Base (frame), plus the fixed ones."""
    furn.material('Accent', style['accent'])
    furn.material('Trim', style.get('trim', 'gold'))
    furn.material('Base', style.get('base', 'white'))
    furn.material('Accent2', style.get('accent2', style['accent']))
    for n in ('glass', 'water', 'lamp', 'marble', 'wood', 'woodlight', 'bottleA', 'bottleB', 'bottleC', 'bottleD', 'cream', 'leaf', 'terracotta', 'soil', 'stone', 'white', 'black', 'screen'):
        furn.material(n.capitalize(), n)
    furn.material('Glass', 'glass', alpha=0.35)
    furn.material('Water', 'water', alpha=0.8)
    furn.material('Lamp', 'lamp', emit=0xfff4d6)


def slab(name, a, b, width, thick, mat='Accent', tufts=None, puff=0.35, x=0.0, r=0.04):
    """A cushion whose top surface runs from a to b (points in the YZ plane), its thickness below and behind."""
    a, b = Vector((x, a[0], a[1])), Vector((x, b[0], b[1]))
    L = (b - a).length
    o = furn.cushion(name, (width, L, thick), loc=(0, L / 2, -thick), mat=mat, puff=puff, tufts=tufts, button_mat='Trim' if tufts else None)
    ang = math.atan2(b.z - a.z, b.y - a.y)
    return furn.place(o, loc=a, rot=(math.degrees(ang), 0, 0))


def finish_station(parts, nodes, hips):
    """Join the parts, bake the soft occlusion, move the footprint's centre to the origin, place the nodes."""
    body = furn.finish(parts, ao_distance=0.3, ao_strength=0.65)
    bb = [body.matrix_world @ Vector(c) for c in body.bound_box]
    cx = (min(p.x for p in bb) + max(p.x for p in bb)) / 2
    cy = (min(p.y for p in bb) + max(p.y for p in bb)) / 2
    for v in body.data.vertices:
        v.co.x -= cx
        v.co.y -= cy
    body.data.update()
    empties = []
    for name, (p, rot) in nodes.items():
        empties.append(gs.empty(name, (p[0] - cx, p[1] - cy, p[2]), (0, 0, rot)))
    return body, empties


# ---------------------------------------------------------------------------------------------- facial chair

def facial_chair(style):
    """A reclining facial chair on a pedestal: seat, backrest and leg rest cushions, armrests, a magnifier lamp over
    the face and a product trolley. The hips sit H above the floor."""
    mats(style)
    S = SEATS['sit_chair']
    H = 0.6
    z = lambda rel: H + rel
    parts = []
    shape = style['shape']
    tufts = (3, 3) if style.get('tufted') else None
    W = 0.54
    seat_top = z(S['seat_z'])
    parts.append(slab('seat', (-0.26, seat_top - 0.005), (0.16, seat_top), W, 0.12, tufts=tufts))
    back_a, back_b = (0.14, seat_top + 0.01), (0.42, z(0.44))
    parts.append(slab('back', back_a, back_b, W - 0.02, 0.13, tufts=(3, 4) if tufts else None))
    leg_a, leg_b = (-0.78, z(-0.13)), (-0.26, z(-0.03))
    parts.append(slab('legrest', leg_a, leg_b, W - 0.06, 0.1, tufts=(3, 2) if tufts else None))
    if shape == 'throne':
        # a scalloped high back in a gold frame
        crest = furn.cushion('crest', (W + 0.06, 0.12, 0.2), loc=(0, 0, 0), mat='Accent', puff=0.6)
        parts.append(furn.place(crest, loc=(0, back_b[0] + 0.02, back_b[1] - 0.06), rot=(-30, 0, 0)))
        parts.append(furn.ring('frame', 0.36, 0.018, loc=(0, back_b[0] - 0.04, back_b[1] - 0.12), rot=(60, 0, 0), mat='Trim'))
    # the frame under the cushions: a chunky shell (Base) with a gold lip
    fr = 'Base'
    parts.append(slab('seatframe', (-0.26, seat_top - 0.12), (0.16, seat_top - 0.115), W + 0.04, 0.05, mat=fr, puff=0.0, r=0.02))
    parts.append(slab('legframe', (leg_b[0] - 0.52, leg_a[1] - 0.1), (leg_b[0], leg_b[1] - 0.1), W - 0.02, 0.04, mat=fr, puff=0.0, r=0.02))
    # armrests
    for s in (1, -1):
        x = s * (W / 2 + 0.05)
        top = z(0.16)
        arm = furn.rbox('arm', (0.085, 0.42, 0.07), loc=(x, 0.14, top - 0.07), mat='Accent' if shape != 'mint' else 'Base', r=0.03)
        parts.append(arm)
        parts.append(furn.rbox('armpost', (0.05, 0.05, top - 0.07 - (seat_top - 0.12)), loc=(x, 0.04, seat_top - 0.12), mat='Trim', r=0.015))
        if shape != 'mint':
            parts.append(furn.rbox('armtrim', (0.09, 0.02, 0.075), loc=(x, -0.075, top - 0.072), mat='Trim', r=0.008))
    # the base
    if shape == 'throne':
        for sx in (1, -1):
            for sy in (1, -1):
                y = 0.05 if sy > 0 else -0.55
                parts.append(furn.tube('leg', [(sx * 0.2, y, seat_top - 0.14), (sx * 0.24, y + sy * 0.04, 0.12), (sx * 0.27, y + sy * 0.07, 0.0)], 0.028, mat='Trim'))
                parts.append(furn.sphere('foot', 0.04, loc=(sx * 0.27, y + sy * 0.07, 0.03), mat='Trim'))
    elif shape == 'mint':
        parts.append(furn.rbox('plinth', (0.44, 0.5, seat_top - 0.12), loc=(0, -0.08, 0), mat='Base', r=0.05))
        parts.append(furn.rbox('plinthtrim', (0.46, 0.52, 0.03), loc=(0, -0.08, 0), mat='Trim', r=0.012))
    else:
        parts.append(furn.cyl('disc', 0.3, 0.3, 0.045, loc=(0, -0.12, 0), mat='Trim', seg=36, bevel=0.012))
        parts.append(furn.cyl('column', 0.075, 0.06, seat_top - 0.16, loc=(0, -0.12, 0.04), mat='Trim', seg=24))
        parts.append(furn.cyl('collar', 0.12, 0.09, 0.05, loc=(0, -0.12, seat_top - 0.18), mat='Trim', seg=24))
    # the magnifier lamp: a stand beside the head, an arm over the face, a lens ring
    lx, ly = -0.48, 0.48
    parts.append(furn.cyl('lampbase', 0.13, 0.15, 0.04, loc=(lx, ly, 0), mat='Trim', seg=24, bevel=0.01))
    # the lens hovers in front of and above the face, tilted toward it, on an arm from the pole
    face = Vector((0.0, S['head'][1] - 0.12, z(S['head'][2] + 0.22)))
    lens = face + Vector((0.0, -0.3, 0.2))
    top = lens.z + 0.12
    parts.append(furn.tube('lamppole', [(lx, ly, 0.03), (lx, ly, top)], 0.018, mat='Trim'))
    # a tidy arm: straight up the pole, a level arm out over the chair, a short drop to the lens's top
    parts.append(furn.tube('lamparm', [(lx, ly, top), (lens.x, lens.y, top), (lens.x, lens.y + 0.06, lens.z + 0.1)], 0.014, mat='Trim'))
    parts.append(furn.sphere('joint', 0.024, loc=(lx, ly, top), mat='Trim'))
    parts.append(furn.sphere('joint2', 0.02, loc=(lens.x, lens.y, top), mat='Trim'))
    ring = furn.ring('lens', 0.11, 0.02, mat='Trim' if shape != 'mint' else 'Base')
    glass = furn.cyl('lensglass', 0.1, 0.1, 0.008, loc=(0, 0, -0.004), mat='Glass', seg=24)
    lensobj = gs.join([ring, glass], 'lens')
    parts.append(furn.place(lensobj, loc=lens, rot=(-55, 0, 0)))
    # the trolley behind the worker's side: two round tiers of products
    tx, ty = 0.66, 0.5
    parts.append(furn.cyl('tier1', 0.17, 0.17, 0.035, loc=(tx, ty, 0.3), mat='Base', seg=28, bevel=0.01))
    parts.append(furn.cyl('tier2', 0.17, 0.17, 0.035, loc=(tx, ty, 0.62), mat='Base', seg=28, bevel=0.01))
    parts.append(furn.cyl('tierpost', 0.02, 0.02, 0.62, loc=(tx, ty, 0.0), mat='Trim', seg=12))
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        parts.append(furn.sphere('wheel', 0.03, loc=(tx + 0.12 * math.cos(a), ty + 0.12 * math.sin(a), 0.03), mat='Trim'))
        parts.append(furn.tube('tleg', [(tx + 0.12 * math.cos(a), ty + 0.12 * math.sin(a), 0.05), (tx + 0.14 * math.cos(a), ty + 0.14 * math.sin(a), 0.3)], 0.012, mat='Trim'))
    for i, (dx, dy, m, h) in enumerate(((-0.07, -0.05, 'Bottlea', 0.13), (0.05, -0.07, 'Bottleb', 0.1), (0.0, 0.07, 'Bottlec', 0.12), (0.08, 0.04, 'Bottled', 0.08))):
        parts.append(furn.bottle('b', h, 0.028, (tx + dx, ty + dy, 0.655), m, cap='Trim'))
    for dx, dy in ((-0.06, 0.02), (0.06, 0.0)):
        parts.append(furn.cyl('jar', 0.04, 0.04, 0.05, loc=(tx + dx, ty + dy, 0.335), mat='Cream', seg=16, bevel=0.008))
    nodes = {
        'seat': ((0, 0, H), 0),
        'work': ((0.52, 0.12, 0), -90),
        'tool': ((tx, ty, 0.66), 0),
        'lookat': ((0, S['head'][1], H + S['head'][2] + 0.2), 0),
    }
    return finish_station(parts, nodes, H)


# ---------------------------------------------------------------------------------------------- pedicure throne

def pedicure_chair(style):
    """A throne on a step with a basin of water in front, where the feet go."""
    mats(style)
    S = SEATS['sit_pedicure']
    basin_floor = 0.07
    H = basin_floor + (-S['heel_z_min'])
    z = lambda rel: H + rel
    shape = style['shape']
    parts = []
    step_h = 0.17
    W = 0.6
    # the step
    parts.append(furn.rbox('step', (W + 0.3, 0.72, step_h), loc=(0, 0.12, 0), mat='Base', r=0.04))
    parts.append(furn.rbox('steptrim', (W + 0.32, 0.74, 0.025), loc=(0, 0.12, step_h - 0.012), mat='Trim', r=0.01))
    seat_top = z(S['seat_z'])
    # the throne body: a box from the step to under the seat cushion
    parts.append(furn.rbox('throne', (W, 0.56, seat_top - 0.1 - step_h), loc=(0, 0.1, step_h), mat='Accent2', r=0.05))
    parts.append(furn.cushion('seat', (W - 0.08, 0.5, 0.12), loc=(0, 0.06, seat_top - 0.12), mat='Accent', puff=0.45, tufts=(3, 2) if style.get('tufted') else None, button_mat='Trim'))
    # the tall rounded back, a little reclined
    bh = 0.8 if shape != 'spa' else 0.62
    back = furn.cushion('back', (W - 0.02, 0.14, bh), loc=(0, 0, 0), mat='Accent', puff=0.5, tufts=(3, 4) if style.get('tufted') else None, button_mat='Trim')
    parts.append(furn.place(back, loc=(0, 0.33, seat_top - 0.02), rot=(-8, 0, 0)))
    crown_z = seat_top + bh * 0.97
    if shape == 'lilac' or shape == 'gold':
        crest = furn.sphere('crest', 0.5, loc=(0, 0.38, crown_z - 0.12), mat='Accent', scale=(0.62, 0.15, 0.24))
        parts.append(crest)
    if shape == 'gold':
        parts.append(furn.ring('crown', 0.3, 0.02, loc=(0, 0.4, crown_z - 0.1), rot=(80, 0, 0), mat='Trim'))
    # armrests: rolled arms at the forearms' height
    for s in (1, -1):
        x = s * (W / 2 + 0.02)
        top = z(0.25)
        arm = furn.cushion('arm', (0.12, 0.5, top - (seat_top - 0.1)), loc=(x, 0.05, seat_top - 0.1), mat='Accent2' if shape != 'spa' else 'Wood', puff=0.3)
        parts.append(arm)
        roll = furn.cyl('roll', 0.065, 0.065, 0.12, loc=(0, 0, 0), mat='Accent', seg=20)
        parts.append(furn.place(roll, loc=(x - 0.06 * s * 0 - 0.06, -0.2, top), rot=(0, 90, 0)) if s > 0 else furn.place(roll, loc=(x - 0.06, -0.2, top), rot=(0, 90, 0)))
        parts.append(furn.rbox('armtrim', (0.13, 0.025, 0.12), loc=(x, -0.215, top - 0.13), mat='Trim', r=0.01))
    # the basin: a bowl with a rim, water with a few petals, the feet's spot inside
    by = -0.52
    outer = furn.cyl('bowl', 0.2, 0.25, 0.27, loc=(0, by, 0), mat='Accent2' if shape != 'spa' else 'Stone', seg=36, bevel=0.015)
    inner = furn.cyl('bowlcut', 0.2, 0.2, 0.3, loc=(0, by, basin_floor), mat='Base', seg=36)
    m = outer.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.object = inner
    m.solver = 'EXACT'
    gs.apply_all(outer)
    bpy.data.objects.remove(inner)
    gs.shade_smooth(outer)
    parts.append(outer)
    parts.append(furn.ring('rim', 0.225, 0.022, loc=(0, by, 0.27), mat='Trim', seg=40))
    water = furn.cyl('water', 0.2, 0.2, 0.012, loc=(0, by, 0.2), mat='Water', seg=36)
    parts.append(water)
    for i in range(5):
        a = i * 1.3
        p = furn.sphere('petal', 0.022, loc=(0.12 * math.cos(a), by + 0.12 * math.sin(a), 0.214), mat='Accent', scale=(1, 0.6, 0.25))
        parts.append(p)
    # a small side table with towels and a bowl of salts
    tx, ty = 0.52, -0.5
    parts.append(furn.cyl('table', 0.13, 0.13, 0.03, loc=(tx, ty, 0.42), mat='Base', seg=24, bevel=0.008))
    parts.append(furn.cyl('tpost', 0.02, 0.03, 0.42, loc=(tx, ty, 0.0), mat='Trim', seg=12))
    parts.append(furn.cyl('tfoot', 0.1, 0.1, 0.02, loc=(tx, ty, 0.0), mat='Trim', seg=20))
    for k in range(2):
        parts.append(furn.rbox('towel', (0.14, 0.1, 0.035), loc=(tx - 0.02, ty + 0.01, 0.45 + k * 0.035), mat='Cream', r=0.015))
    parts.append(furn.cyl('salts', 0.045, 0.035, 0.04, loc=(tx + 0.07, ty - 0.05, 0.45), mat='Accent', seg=16, bevel=0.006))
    nodes = {
        'seat': ((0, 0, H), 0),
        'feet': ((0, by, basin_floor + 0.08), 0),
        'work': ((0, by - 0.46, 0), 180),
        'tool': ((tx, ty, 0.52), 0),
        'lookat': ((0, S['head'][1], H + S['head'][2] + 0.2), 0),
    }
    return finish_station(parts, nodes, H)


# ---------------------------------------------------------------------------------------------- nail desk

def nail_desk(style):
    """A desk with a polish rack and a lamp, the customer's stool behind it (she faces the front), the manicurist in
    front facing her."""
    mats(style)
    S = SEATS['sit_stool']
    H = -S['heel_z_min']
    shape = style['shape']
    parts = []
    top_z = H + S['wrist_l'][2] - 0.025
    D, Wd = 0.5, 1.0
    dy = -0.4  # the desk's middle, in front of the customer's hips
    top_mat = 'Marble' if shape == 'marble' else ('Accent' if shape == 'pastel' else 'Woodlight')
    parts.append(furn.rbox('top', (Wd, D, 0.045), loc=(0, dy, top_z - 0.045), mat=top_mat, r=0.018))
    parts.append(furn.rbox('edge', (Wd + 0.01, D + 0.01, 0.018), loc=(0, dy, top_z - 0.06), mat='Trim', r=0.006))
    if shape == 'marble':
        for sx in (1, -1):
            for sy in (1, -1):
                parts.append(furn.tube('leg', [(sx * 0.44, dy + sy * 0.19, top_z - 0.06), (sx * 0.46, dy + sy * 0.21, 0.0)], 0.018, mat='Trim'))
    else:
        # a cabinet with drawers under the desk's right side, a panel leg on the left
        parts.append(furn.rbox('cabinet', (0.42, D - 0.04, top_z - 0.07), loc=(0.27, dy, 0.0), mat='Base' if shape == 'pastel' else 'Woodlight', r=0.03))
        for k in range(3):
            parts.append(furn.rbox('drawer', (0.36, 0.02, (top_z - 0.1) / 3 - 0.03), loc=(0.27, dy - D / 2 + 0.02, 0.04 + k * (top_z - 0.1) / 3), mat='Accent' if shape == 'pastel' else 'Base', r=0.012))
            parts.append(furn.sphere('knob', 0.014, loc=(0.27, dy - D / 2 + 0.002, 0.04 + k * (top_z - 0.1) / 3 + ((top_z - 0.1) / 3 - 0.03) / 2), mat='Trim'))
        parts.append(furn.rbox('panel', (0.05, D - 0.06, top_z - 0.07), loc=(-0.46, dy, 0.0), mat='Base' if shape == 'pastel' else 'Woodlight', r=0.02))
    # the polish rack: two small steps of bottles at the left end
    rx = -0.34
    parts.append(furn.rbox('rack', (0.22, 0.12, 0.05), loc=(rx, dy + 0.1, top_z), mat='Base', r=0.012))
    parts.append(furn.rbox('rack2', (0.22, 0.06, 0.1), loc=(rx, dy + 0.14, top_z), mat='Base', r=0.012))
    cols = ['Bottlea', 'Bottleb', 'Bottlec', 'Bottled', 'Accent']
    for i in range(5):
        x = rx - 0.085 + i * 0.042
        parts.append(furn.bottle('p', 0.06, 0.013, (x, dy + 0.075, top_z + 0.05), cols[i % 5], cap='Trim'))
        parts.append(furn.bottle('p', 0.06, 0.013, (x, dy + 0.14, top_z + 0.1), cols[(i + 2) % 5], cap='Trim'))
    # the lamp: a round base, a bent arm, a cone shade with a glowing disc
    lx = 0.38
    parts.append(furn.cyl('lbase', 0.07, 0.08, 0.025, loc=(lx, dy + 0.12, top_z), mat='Trim', seg=20))
    parts.append(furn.tube('larm', [(lx, dy + 0.12, top_z + 0.02), (lx, dy + 0.12, top_z + 0.34), (lx - 0.14, dy, top_z + 0.4)], 0.012, mat='Trim'))
    shade = furn.cyl('shade', 0.05, 0.085, 0.09, loc=(0, 0, 0), mat='Accent' if shape != 'marble' else 'Trim', seg=20)
    parts.append(furn.place(shade, loc=(lx - 0.16, dy - 0.02, top_z + 0.32), rot=(15, 0, 0)))
    parts.append(furn.place(furn.cyl('bulb', 0.05, 0.05, 0.01, loc=(0, 0, 0), mat='Lamp', seg=16), loc=(lx - 0.16, dy - 0.02, top_z + 0.325), rot=(15, 0, 0)))
    # the hand cushion and a nail file on the desk
    parts.append(furn.cushion('handrest', (0.2, 0.12, 0.04), loc=(0, dy + 0.02, top_z), mat='Accent', puff=0.5))
    parts.append(furn.rbox('file', (0.02, 0.14, 0.006), loc=(0.14, dy - 0.02, top_z), mat='Accent2', r=0.002))
    # the customer's stool
    seat_top = H + S['seat_z']
    parts.append(furn.cushion('stool', (0.38, 0.38, 0.1), loc=(0, 0.02, seat_top - 0.1), mat='Accent', puff=0.6, tufts=(2, 2) if style.get('tufted') else None, button_mat='Trim'))
    parts.append(furn.cyl('stoolring', 0.2, 0.2, 0.03, loc=(0, 0.02, seat_top - 0.13), mat='Trim', seg=32))
    parts.append(furn.cyl('stoolpost', 0.03, 0.03, seat_top - 0.13, loc=(0, 0.02, 0), mat='Trim', seg=12))
    parts.append(furn.cyl('stoolfoot', 0.17, 0.19, 0.03, loc=(0, 0.02, 0), mat='Trim', seg=28, bevel=0.008))
    parts.append(furn.ring('footring', 0.15, 0.01, loc=(0, 0.02, 0.2), mat='Trim', seg=28))
    nodes = {
        'seat': ((0, 0.0, H), 0),
        'work': ((0, dy - D / 2 - 0.3, 0), 180),
        'tool': ((0.14, dy - 0.02, top_z + 0.01), 0),
        'lookat': ((0, S['head'][1], H + S['head'][2] + 0.2), 0),
    }
    return finish_station(parts, nodes, H)


# ---------------------------------------------------------------------------------------------- brow bar

def brow_chair(style):
    """A salon chair on a hydraulic base (reclined like the facial chair), with a gold-framed round mirror on a stand
    and a small cart of brow tools."""
    mats(style)
    S = SEATS['sit_chair']
    H = 0.58
    z = lambda rel: H + rel
    parts = []
    W = 0.56
    seat_top = z(S['seat_z'])
    tuft = (3, 3) if style.get('tufted') else None
    parts.append(slab('seat', (-0.26, seat_top - 0.005), (0.16, seat_top), W, 0.13, tufts=tuft, puff=0.5))
    parts.append(slab('back', (0.14, seat_top + 0.01), (0.4, z(0.42)), W, 0.14, tufts=(3, 4) if tuft else None, puff=0.5))
    parts.append(slab('legrest', (-0.72, z(-0.14)), (-0.26, z(-0.03)), W - 0.1, 0.09, puff=0.4))
    # rounded side panels that wrap seat and back (the bucket shape of a salon chair)
    for s in (1, -1):
        x = s * (W / 2 + 0.04)
        side = furn.cushion('side', (0.08, 0.5, 0.26), loc=(0, 0, 0), mat='Accent', puff=0.3)
        parts.append(furn.place(side, loc=(x, 0.06, seat_top - 0.1), rot=(-12, 0, 0)))
        parts.append(furn.rbox('armtop', (0.1, 0.36, 0.04), loc=(x, 0.1, z(0.13)), mat='Trim' if style['shape'] != 'blush' else 'Accent2', r=0.018))
    parts.append(furn.cyl('base', 0.27, 0.3, 0.05, loc=(0, -0.08, 0), mat='Trim', seg=36, bevel=0.015))
    parts.append(furn.cyl('column', 0.06, 0.06, seat_top - 0.2, loc=(0, -0.08, 0.05), mat='Trim', seg=20))
    parts.append(furn.cyl('pump', 0.1, 0.08, 0.1, loc=(0, -0.08, seat_top - 0.25), mat='Trim', seg=20))
    parts.append(slab('frame', (-0.26, seat_top - 0.13), (0.16, seat_top - 0.125), W + 0.02, 0.04, mat='Base', puff=0.0))
    # the mirror on a stand beside the chair, facing the customer
    mx, my = -0.62, -0.1
    parts.append(furn.cyl('mbase', 0.14, 0.16, 0.04, loc=(mx, my, 0), mat='Trim', seg=24, bevel=0.01))
    parts.append(furn.tube('mpole', [(mx, my, 0.04), (mx, my, 1.05)], 0.02, mat='Trim'))
    mirror = furn.cyl('mglass', 0.2, 0.2, 0.012, loc=(0, 0, 0), mat='Glass', seg=32)
    parts.append(furn.place(mirror, loc=(mx, my, 1.25), rot=(90, 0, 60)))
    parts.append(furn.place(furn.ring('mframe', 0.21, 0.025, loc=(0, 0, 0), mat='Trim', seg=40), loc=(mx, my, 1.25), rot=(90, 0, 60)))
    # a small tool cart
    tx, ty = 0.62, 0.35
    parts.append(furn.rbox('cart', (0.3, 0.26, 0.5), loc=(tx, ty, 0.05), mat='Base', r=0.04))
    parts.append(furn.rbox('carttop', (0.32, 0.28, 0.03), loc=(tx, ty, 0.55), mat='Accent2', r=0.012))
    for k in range(2):
        parts.append(furn.rbox('cdrawer', (0.26, 0.02, 0.18), loc=(tx, ty - 0.14, 0.1 + k * 0.22), mat='Accent2', r=0.012))
    for sx in (1, -1):
        for sy in (1, -1):
            parts.append(furn.sphere('caster', 0.025, loc=(tx + sx * 0.11, ty + sy * 0.09, 0.025), mat='Trim'))
    parts.append(furn.bottle('b', 0.1, 0.022, (tx - 0.06, ty + 0.02, 0.58), 'Bottlea', cap='Trim'))
    parts.append(furn.cyl('cup', 0.03, 0.028, 0.08, loc=(tx + 0.07, ty + 0.03, 0.58), mat='Cream', seg=14))
    nodes = {
        'seat': ((0, 0, H), 0),
        'work': ((0.52, 0.1, 0), -90),
        'tool': ((tx, ty, 0.6), 0),
        'lookat': ((0, S['head'][1], H + S['head'][2] + 0.2), 0),
    }
    return finish_station(parts, nodes, H)


STATIONS = [
    ('facial-chair', 'Facial chair', facial_chair, 'sit_chair', [
        ('rose', 'Rose tufted', dict(shape='rose', accent='pink', accent2='blush', trim='gold', base='white', tufted=True)),
        ('throne', 'Gold throne', dict(shape='throne', accent='ivory', accent2='cream', trim='gold', base='cream', tufted=True)),
        ('mint', 'Minimal mint', dict(shape='mint', accent='mint', accent2='mint', trim='chrome', base='white')),
    ]),
    ('pedicure-chair', 'Pedicure throne', pedicure_chair, 'sit_pedicure', [
        ('lilac', 'Lilac throne', dict(shape='lilac', accent='lilac', accent2='purple', trim='gold', base='white', tufted=True)),
        ('gold', 'Royal gold', dict(shape='gold', accent='ivory', accent2='yellow', trim='gold', base='cream', tufted=True)),
        ('spa', 'Teal spa', dict(shape='spa', accent='teal', accent2='sage', trim='chrome', base='woodlight')),
    ]),
    ('nail-desk', 'Nail desk', nail_desk, 'sit_stool', [
        ('marble', 'Marble and gold', dict(shape='marble', accent='blush', accent2='rose', trim='gold', base='white', tufted=True)),
        ('pastel', 'Pastel pink', dict(shape='pastel', accent='pink', accent2='lilac', trim='gold', base='white')),
        ('wood', 'Natural wood', dict(shape='wood', accent='sage', accent2='coral', trim='chrome', base='white')),
    ]),
    ('brow-bar', 'Brow bar chair', brow_chair, 'sit_chair', [
        ('sunny', 'Sunny yellow', dict(shape='sunny', accent='yellow', accent2='butter', trim='gold', base='white', tufted=True)),
        ('blush', 'Blush', dict(shape='blush', accent='blush', accent2='rose', trim='rosegold', base='white')),
        ('noir', 'Noir and gold', dict(shape='noir', accent='black', accent2='black', trim='gold', base='black', tufted=True)),
    ]),
]


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for mid, name, fn, clip, styles in STATIONS:
        if only and mid not in only:
            continue
        furn.styled(mid, name, 'station', 'stations', styles, fn, meta={'sitClip': clip})


if __name__ == '__main__':
    main()
