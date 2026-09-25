"""
The decor sets' hero pieces (one per set in glow-salon-docs/content/world.json, in the set's own palette from
src/core/decor.ts) and the 31 regulars' gifts (src/core/decor.ts GIFTS, by regular id).

    blender -b --python assets-src/furniture/build_decor.py [-- id ...]

Every model stands on the floor at the origin (a wall piece has its back on y = 0 and hangs at a fixed height; the
chandelier hangs from 2.9 m). Materials: Accent / Accent2 / Trim take the set's palette and can be recoloured.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'lib'), HERE]

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import furn  # noqa: E402
import gs  # noqa: E402
from build_front import plant, seat_unit  # noqa: E402
from build_life import style as life_style  # noqa: E402
from build_stations import finish_station, mats  # noqa: E402

# src/core/decor.ts PALETTES: main, second, accent, trim
PAL = {
    'pastel-pop': (0xf7b7cc, 0xa9e3cf, 0xcdbdf2, 0xfbe0a0), 'zen-garden': (0xb9cfa4, 0xd9c29a, 0xa9a39b, 0xf6efe0),
    'luxe-gold': (0x8e4a78, 0xe6c068, 0xf4efe9, 0xf1dcae), 'tropical': (0x6cc08e, 0xd8b27c, 0xf59a82, 0x7fd4d4),
    'retro-diner': (0xe25a64, 0xfbeedd, 0x7fd0c0, 0xcfd6de), 'cottagecore': (0xf3dde0, 0xa9c49a, 0xb88a64, 0xc7b3e6),
    'neon-night': (0x3a2f4d, 0xff5fa8, 0x5fe3f0, 0xa98bff),
}


def palette(set_id, trim_metal=True):
    life_style()
    a, b, c, t = PAL[set_id]
    furn.material('Accent', color=a, rough=0.42)
    furn.material('Accent2', color=b, rough=0.45)
    furn.material('Accent3', color=c, rough=0.4)
    furn.material('Trim', 'gold' if trim_metal else None, color=None if trim_metal else t)
    furn.material('Glow', color=b, emit=b)
    furn.material('Glow2', color=c, emit=c)
    furn.material('Silver', 'chrome')
    furn.material('Paper', 'ivory')


def base_mats(**kw):
    s = dict(accent='pink', accent2='mint', trim='gold', base='white')
    s.update(kw)
    life_style()
    mats(s)
    furn.material('Accent3', 'lilac')
    furn.material('Glow', color=0xff5fa8, emit=0xff5fa8)
    furn.material('Glow2', color=0x5fe3f0, emit=0x5fe3f0)
    furn.material('Yellow', 'yellow')
    furn.material('Red', color=0xd9534f, rough=0.4)
    furn.material('Paper', 'ivory')
    furn.material('Silver', 'chrome')


def plinth(parts, w=0.36, h=0.5):
    """A small display plinth for the gifts that are too small to stand on the floor by themselves."""
    parts.append(furn.rbox('plinth', (w, w, h), loc=(0, 0, 0), mat='Base', r=0.03))
    parts.append(furn.rbox('plinthtop', (w + 0.03, w + 0.03, 0.03), loc=(0, 0, h), mat='Trim', r=0.01))
    return h + 0.03


def frame(parts, w, h, z, mat='Trim', inner='Paper', depth=0.04, ornate=False):
    """A picture frame hanging on the wall (its back at y = 0), its middle at height z."""
    parts.append(furn.rbox('frame', (w, depth, h), loc=(0, -depth / 2, z - h / 2), mat=mat, r=0.02 if not ornate else 0.035))
    parts.append(furn.rbox('pic', (w - 0.1, depth + 0.004, h - 0.1), loc=(0, -depth / 2 - 0.002, z - h / 2 + 0.05), mat=inner, r=0.004))


# ---------------------------------------------------------------------------------------------- decor heroes

def candy_sofa():
    palette('pastel-pop')
    return seat_unit(dict(shape='shell', accent='pink', accent2='mint', trim='gold'), 2)


def floral_armchair():
    palette('cottagecore')
    return seat_unit(dict(shape='roll', accent='blush', accent2='sage', trim='gold', tufted=True), 1)


def hammock():
    palette('tropical')
    parts = []
    for sx in (1, -1):
        parts.append(furn.cyl('post', 0.05, 0.045, 1.5, loc=(sx * 1.1, 0, 0), mat='Accent2', seg=12))
        parts.append(furn.sphere('cap', 0.06, loc=(sx * 1.1, 0, 1.5), mat='Accent2'))
    pts = []
    for i in range(13):
        t = i / 12
        x = -1.0 + 2.0 * t
        z = 1.25 - 0.55 * math.sin(math.pi * t)
        pts.append((x, 0, z))
    for dy in (-0.25, -0.12, 0.0, 0.12, 0.25):
        stripe = furn.tube('net', [(p[0], dy * math.sin(math.pi * (p[0] + 1) / 2), p[2] + abs(dy) * 0.3) for p in pts], 0.035, mat='Accent' if dy else 'Accent3', seg=8)
        parts.append(stripe)
    return finish_station(parts, {'seat': ((0, 0, 0.75), 0)}, 0)


def stone_fountain():
    palette('zen-garden')
    parts = [furn.cyl('basin', 0.45, 0.4, 0.25, loc=(0, 0, 0), mat='Stone', seg=32, bevel=0.03),
             furn.cyl('water', 0.4, 0.4, 0.01, loc=(0, 0, 0.23), mat='Water', seg=32),
             furn.cyl('rock', 0.18, 0.12, 0.35, loc=(0.15, 0.15, 0.1), mat='Accent3', seg=8, bevel=0.03),
             furn.cyl('bowl', 0.14, 0.1, 0.08, loc=(0.15, 0.15, 0.45), mat='Stone', seg=16)]
    bamboo = furn.tube('bamboo', [(0.2, 0.35, 0.3), (0.2, 0.35, 0.85), (0.17, 0.2, 0.8)], 0.028, mat='Accent', seg=10)
    parts.append(bamboo)
    parts.append(furn.tube('stream', [(0.16, 0.18, 0.78), (0.15, 0.15, 0.5)], 0.008, mat='Water', seg=6))
    for i in range(5):
        a = i * 1.25
        parts.append(furn.sphere('pebble', 0.05, loc=(0.52 * math.cos(a), 0.52 * math.sin(a), 0.03), mat='Accent3', scale=(1.2, 1, 0.6)))
    return finish_station(parts, {}, 0)


def chandelier():
    """A gold chandelier: its top on the ceiling at 2.9 m (the origin stays on the floor below its middle)."""
    palette('luxe-gold')
    parts = [furn.cyl('canopy', 0.1, 0.1, 0.04, loc=(0, 0, 2.86), mat='Trim', seg=20),
             furn.tube('chain', [(0, 0, 2.86), (0, 0, 2.45)], 0.012, mat='Trim'),
             furn.ring('ring', 0.36, 0.02, loc=(0, 0, 2.3), mat='Trim', seg=40),
             furn.sphere('hub', 0.08, loc=(0, 0, 2.38), mat='Trim')]
    for i in range(8):
        a = 2 * math.pi * i / 8
        x, y = math.cos(a) * 0.36, math.sin(a) * 0.36
        parts.append(furn.tube('arm', [(0, 0, 2.38), (x * 0.6, y * 0.6, 2.33), (x, y, 2.3)], 0.01, mat='Trim', seg=6))
        parts.append(furn.cyl('cup', 0.03, 0.04, 0.03, loc=(x, y, 2.3), mat='Trim', seg=10))
        parts.append(furn.cyl('candle', 0.016, 0.016, 0.1, loc=(x, y, 2.33), mat='Accent3', seg=8))
        parts.append(furn.sphere('flame', 0.018, loc=(x, y, 2.45), mat='Lamp', scale=(1, 1, 1.5)))
        parts.append(furn.sphere('drop', 0.025, loc=(x, y, 2.22), mat='Glass', scale=(1, 1, 1.6)))
    return finish_station(parts, {}, 0)


def jukebox():
    palette('retro-diner')
    parts = [furn.rbox('body', (0.7, 0.5, 1.1), loc=(0, 0, 0), mat='Accent', r=0.06)]
    arch = furn.cyl('arch', 0.35, 0.35, 0.5, loc=(0, 0, 0), mat='Accent', seg=32)
    parts.append(furn.place(arch, loc=(0, 0.25, 1.1), rot=(90, 0, 0)))
    glow = furn.ring('glow', 0.3, 0.03, mat='Glow2', seg=32)
    parts.append(furn.place(glow, loc=(0, -0.26, 1.1), rot=(90, 0, 0)))
    parts.append(furn.rbox('window', (0.5, 0.02, 0.3), loc=(0, -0.25, 0.7), mat='Glass', r=0.02))
    parts.append(furn.rbox('grille', (0.5, 0.02, 0.3), loc=(0, -0.25, 0.25), mat='Accent2', r=0.02))
    for x in (-0.3, 0.3):
        parts.append(furn.rbox('neon', (0.04, 0.03, 0.9), loc=(x, -0.255, 0.15), mat='Glow', r=0.012))
    return finish_station(parts, {}, 0)


def arcade():
    palette('neon-night')
    parts = [furn.rbox('cab', (0.7, 0.75, 1.75), loc=(0, 0, 0), mat='Accent', r=0.03),
             furn.rbox('marquee', (0.72, 0.1, 0.22), loc=(0, -0.33, 1.53), mat='Glow', r=0.02)]
    scr = furn.rbox('screen', (0.54, 0.03, 0.42), loc=(0, 0, 0), mat='Glow2', r=0.02)
    parts.append(furn.place(scr, loc=(0, -0.3, 1.0), rot=(-15, 0, 0)))
    parts.append(furn.rbox('panel', (0.7, 0.3, 0.06), loc=(0, -0.45, 0.88), mat='Accent3', r=0.02))
    parts.append(furn.cyl('stick', 0.012, 0.012, 0.08, loc=(-0.15, -0.47, 0.94), mat='Silver', seg=8))
    parts.append(furn.sphere('ball', 0.03, loc=(-0.15, -0.47, 1.02), mat='Glow'))
    for i, x in enumerate((0.05, 0.13, 0.21)):
        parts.append(furn.cyl('btn', 0.025, 0.025, 0.015, loc=(x, -0.47, 0.94), mat='Glow' if i % 2 else 'Glow2', seg=10))
    for s in (1, -1):
        parts.append(furn.rbox('stripe', (0.02, 0.6, 1.4), loc=(s * 0.355, 0, 0.2), mat='Glow2', r=0.005))
    return finish_station(parts, {}, 0)


# ---------------------------------------------------------------------------------------------- gifts

def g_lemon_tree():
    base_mats(accent='terracotta')
    parts = plant(0, 0, 0, 2.0, 'round', pot='Accent')
    for i in range(7):
        a = i * 0.9
        parts.append(furn.sphere('lemon', 0.045, loc=(math.cos(a) * 0.3, math.sin(a) * 0.27, 0.62 + (i % 3) * 0.08), mat='Yellow', scale=(1, 1, 1.2)))
    return finish_station(parts, {}, 0)


def g_polish():
    base_mats(accent='rosegold')
    parts = []
    top = plinth(parts)
    parts.append(furn.bottle('bottle', 0.3, 0.07, (0, 0, top), 'Accent', cap='Trim'))
    return finish_station(parts, {}, 0)


def g_tool(kind):
    base_mats(accent='blush')
    parts = []
    top = plinth(parts)
    parts.append(furn.cyl('dome', 0.14, 0.14, 0.02, loc=(0, 0, top), mat='Accent', seg=24))
    if kind == 'razor':
        parts.append(furn.rbox('handle', (0.03, 0.2, 0.02), loc=(0, 0.02, top + 0.02), mat='Silver', r=0.008))
        parts.append(furn.rbox('head', (0.09, 0.03, 0.03), loc=(0, -0.09, top + 0.02), mat='Silver', r=0.01))
    else:
        parts.append(furn.rbox('rasp', (0.05, 0.22, 0.015), loc=(0, 0, top + 0.02), mat='Accent2', r=0.006))
        parts.append(furn.rbox('grip', (0.05, 0.08, 0.03), loc=(0, 0.1, top + 0.02), mat='Red', r=0.01))
    return finish_station(parts, {}, 0)


def g_product(kind):
    base_mats(accent='butter', accent2='mint')
    parts = []
    top = plinth(parts)
    if kind == 'honey':
        parts.append(furn.cyl('jar', 0.08, 0.08, 0.13, loc=(0, 0, top), mat='Yellow', seg=20, bevel=0.01))
        parts.append(furn.cyl('lid', 0.085, 0.085, 0.03, loc=(0, 0, top + 0.13), mat='Accent2', seg=20))
        parts.append(furn.tube('dipper', [(0.02, 0, top + 0.1), (0.08, 0.02, top + 0.26)], 0.008, mat='Wood'))
    elif kind == 'soap':
        for k in range(3):
            parts.append(furn.rbox('soap', (0.14, 0.09, 0.05), loc=(0.01 * k, 0, top + 0.05 * k), mat='Paper' if k % 2 else 'Accent', r=0.018))
    else:
        parts.append(furn.cyl('gel', 0.06, 0.06, 0.16, loc=(-0.05, 0, top), mat='Accent2', seg=16, bevel=0.01))
        parts.append(furn.cyl('gcap', 0.065, 0.065, 0.03, loc=(-0.05, 0, top + 0.16), mat='Paper', seg=16))
        parts.append(furn.cyl('pot', 0.05, 0.05, 0.05, loc=(0.08, 0.02, top), mat='Paper', seg=16))
    return finish_station(parts, {}, 0)


def g_ring_light():
    base_mats()
    parts = [furn.tube('tripod', [(0, 0, 0.9), (0.2, 0, 0)], 0.012), furn.tube('tripod2', [(0, 0, 0.9), (-0.1, 0.17, 0)], 0.012),
             furn.tube('tripod3', [(0, 0, 0.9), (-0.1, -0.17, 0)], 0.012), furn.tube('pole', [(0, 0, 0.9), (0, 0, 1.45)], 0.012)]
    ring = furn.ring('ring', 0.22, 0.03, mat='Lamp', seg=40)
    parts.append(furn.place(ring, loc=(0, 0, 1.65), rot=(90, 0, 0)))
    return finish_station(parts, {}, 0)


def g_clock():
    base_mats(accent='wood')
    parts = [furn.rbox('case', (0.45, 0.3, 1.7), loc=(0, 0, 0), mat='Wood', r=0.03),
             furn.rbox('hood', (0.52, 0.34, 0.12), loc=(0, 0, 1.7), mat='Wood', r=0.03)]
    face = furn.cyl('face', 0.17, 0.17, 0.02, loc=(0, 0, 0), mat='Paper', seg=28)
    parts.append(furn.place(face, loc=(0, -0.155, 1.45), rot=(90, 0, 0)))
    parts.append(furn.place(furn.ring('bezel', 0.18, 0.015, mat='Trim', seg=28), loc=(0, -0.165, 1.45), rot=(90, 0, 0)))
    parts.append(furn.rbox('hand', (0.012, 0.005, 0.12), loc=(0, -0.172, 1.45), mat='Black', r=0.002))
    parts.append(furn.rbox('window', (0.25, 0.01, 0.6), loc=(0, -0.152, 0.5), mat='Glass', r=0.02))
    parts.append(furn.tube('pendulum', [(0, -0.14, 1.1), (0, -0.14, 0.7)], 0.006, mat='Trim'))
    parts.append(furn.sphere('bob', 0.05, loc=(0, -0.14, 0.68), mat='Trim', scale=(1, 0.3, 1)))
    return finish_station(parts, {}, 0)


def g_surfboard():
    base_mats(accent='sky', accent2='coral')
    board = furn.sphere('board', 1.0, mat='Accent', scale=(0.25, 0.05, 1.0), seg=24, rings=16)
    stripe = furn.sphere('stripe', 1.0, mat='Accent2', scale=(0.06, 0.052, 0.9), seg=12, rings=12)
    b = gs.join([board, stripe], 'board')
    return finish_station([furn.place(b, loc=(0, 0.1, 1.0), rot=(-12, 0, 0))], {}, 0)


def g_easel(content='painting'):
    base_mats(accent='wood')
    parts = [furn.tube('leg1', [(-0.3, -0.1, 0), (0, 0, 1.6)], 0.018, mat='Wood'), furn.tube('leg2', [(0.3, -0.1, 0), (0, 0, 1.6)], 0.018, mat='Wood'),
             furn.tube('leg3', [(0, 0.35, 0), (0, 0, 1.5)], 0.018, mat='Wood'), furn.rbox('ledge', (0.6, 0.06, 0.03), loc=(0, -0.08, 0.6), mat='Wood', r=0.01)]
    canvas = furn.rbox('canvas', (0.62, 0.03, 0.8), loc=(0, 0, 0), mat='Paper', r=0.008)
    parts.append(furn.place(canvas, loc=(0, -0.05, 0.63), rot=(-8, 0, 0)))
    if content == 'painting':
        for i, (x, z, r, m) in enumerate(((-0.1, 1.15, 0.12, 'Accent'), (0.12, 0.95, 0.1, 'Accent2'), (0.0, 0.8, 0.08, 'Yellow'))):
            s = furn.cyl('blob', r, r, 0.01, mat=m, seg=16)
            parts.append(furn.place(s, loc=(x, -0.075 - (z - 0.63) * 0.14, z), rot=(82, 0, 0)))
    else:
        for i, (x, h) in enumerate(((-0.12, 0.3), (0.1, 0.4), (0.0, 0.22))):
            tri = furn.cyl('peak', 0.16, 0.0, h, mat='Accent3' if i != 1 else 'Accent2', seg=3)
            parts.append(furn.place(tri, loc=(x, -0.08 - 0.02 * i, 0.7), rot=(-8, 0, 0)))
    return finish_station(parts, {}, 0)


def g_espresso():
    base_mats(accent='rose')
    parts = []
    top = plinth(parts, 0.45, 0.8)
    parts += [furn.rbox('machine', (0.32, 0.26, 0.3), loc=(0, 0.02, top), mat='Accent', r=0.04),
              furn.rbox('chrometop', (0.34, 0.28, 0.03), loc=(0, 0.02, top + 0.3), mat='Silver', r=0.01),
              furn.cyl('group', 0.035, 0.035, 0.06, loc=(0, -0.13, top + 0.14), mat='Silver', seg=12),
              furn.cyl('cup', 0.03, 0.025, 0.05, loc=(0, -0.13, top + 0.02), mat='Paper', seg=12)]
    return finish_station(parts, {}, 0)


def g_orchid():
    base_mats(accent='white')
    parts = [furn.cyl('pot', 0.1, 0.08, 0.18, loc=(0, 0, 0), mat='Accent', seg=20, bevel=0.01),
             furn.tube('stem', [(0, 0, 0.18), (0.02, 0, 0.6), (0.12, -0.02, 0.72)], 0.008, mat='Leaf', seg=6)]
    for i in range(3):
        leaf = furn.sphere('leaf', 0.1, mat='Leafdark', scale=(1.0, 0.35, 0.12))
        parts.append(furn.place(leaf, loc=(math.cos(i * 2.1) * 0.08, math.sin(i * 2.1) * 0.08, 0.2), rot=(0, -15, math.degrees(i * 2.1))))
    for i in range(5):
        t = i / 4
        parts.append(furn.sphere('bloom', 0.035, loc=(0.02 + 0.1 * t, -0.03, 0.6 + 0.1 * math.sin(t * 2.5)), mat='Accent3', scale=(1.2, 0.4, 1.0)))
    return finish_station(parts, {}, 0)


def g_belt():
    base_mats(accent='wooddark')
    parts = [furn.rbox('stand', (0.5, 0.2, 0.9), loc=(0, 0.05, 0), mat='Wooddark', r=0.03)]
    belt = furn.ring('belt', 0.18, 0.04, mat='Black', seg=28, rseg=6)
    parts.append(furn.place(belt, loc=(0, -0.08, 1.05), rot=(90, 0, 0)))
    plate = furn.cyl('plate', 0.1, 0.1, 0.02, mat='Trim', seg=20)
    parts.append(furn.place(plate, loc=(0, -0.13, 0.92), rot=(90, 0, 0)))
    return finish_station(parts, {}, 0)


def g_ballet():
    base_mats(accent='blush')
    parts = []
    top = plinth(parts)
    parts.append(furn.cushion('cush', (0.3, 0.22, 0.05), loc=(0, 0, top), mat='Accent3', puff=0.6))
    for s in (1, -1):
        parts.append(furn.sphere('shoe', 0.1, loc=(s * 0.06, 0, top + 0.08), mat='Accent', scale=(0.4, 1.0, 0.35)))
        parts.append(furn.tube('ribbon', [(s * 0.06, 0.05, top + 0.1), (s * 0.12, 0.1, top + 0.02)], 0.006, mat='Accent'))
    return finish_station(parts, {}, 0)


def g_plushie():
    base_mats(accent='butter', accent2='blush')
    parts = [furn.sphere('body', 0.18, loc=(0, 0, 0.18), mat='Accent', scale=(1, 0.9, 1.05)),
             furn.sphere('head', 0.14, loc=(0, -0.02, 0.45), mat='Accent'),
             furn.sphere('snout', 0.05, loc=(0, -0.14, 0.42), mat='Paper')]
    for s in (1, -1):
        parts.append(furn.sphere('ear', 0.05, loc=(s * 0.1, 0, 0.57), mat='Accent'))
        parts.append(furn.sphere('eye', 0.015, loc=(s * 0.05, -0.13, 0.48), mat='Black'))
        parts.append(furn.sphere('arm', 0.06, loc=(s * 0.16, -0.05, 0.24), mat='Accent', scale=(0.8, 0.8, 1.2)))
        parts.append(furn.sphere('leg', 0.07, loc=(s * 0.09, -0.12, 0.06), mat='Accent'))
    parts.append(furn.sphere('bow', 0.04, loc=(0, -0.12, 0.33), mat='Accent2', scale=(1.6, 0.5, 0.8)))
    return finish_station(parts, {}, 0)


def g_sign(neon=False):
    base_mats(accent='rose', accent2='butter')
    parts = []
    if neon:
        frame(parts, 0.7, 0.6, 1.5, mat='Black', inner='Black')
        for s in (1, -1):
            parts.append(furn.tube('heart', [(0, -0.05, 1.3), (s * 0.18, -0.05, 1.5), (s * 0.12, -0.05, 1.62), (0, -0.05, 1.54)], 0.02, mat='Glow', seg=8))
    else:
        parts.append(furn.rbox('board', (0.8, 0.05, 0.45), loc=(0, -0.025, 1.3), mat='Accent', r=0.05))
        parts.append(furn.rbox('border', (0.72, 0.052, 0.37), loc=(0, -0.027, 1.34), mat='Accent2', r=0.04))
        parts.append(furn.rbox('inner', (0.64, 0.054, 0.29), loc=(0, -0.028, 1.38), mat='Accent', r=0.03))
    return finish_station(parts, {}, 0)


def g_music():
    base_mats(accent='wood')
    parts = []
    top = plinth(parts, 0.45, 0.6)
    parts += [furn.rbox('player', (0.4, 0.34, 0.1), loc=(0, 0, top), mat='Wood', r=0.02),
              furn.cyl('platter', 0.13, 0.13, 0.01, loc=(-0.03, 0, top + 0.1), mat='Black', seg=28),
              furn.cyl('label', 0.04, 0.04, 0.012, loc=(-0.03, 0, top + 0.1), mat='Accent2', seg=16),
              furn.tube('arm', [(0.15, 0.12, top + 0.13), (0.08, -0.05, top + 0.12)], 0.008, mat='Silver')]
    return finish_station(parts, {}, 0)


def g_vanity():
    base_mats(accent='blush')
    parts = [furn.rbox('desk', (0.9, 0.42, 0.72), loc=(0, 0, 0), mat='Accent', r=0.03),
             furn.rbox('top', (0.94, 0.46, 0.03), loc=(0, 0, 0.72), mat='Trim', r=0.01)]
    for x in (-0.25, 0.25):
        parts.append(furn.rbox('drawer', (0.3, 0.02, 0.2), loc=(x, -0.22, 0.45), mat='Paper', r=0.01))
    mirror = furn.rbox('mirror', (0.55, 0.03, 0.65), loc=(0, 0.16, 0.75), mat='Glass', r=0.2)
    parts += [mirror, furn.rbox('mback', (0.62, 0.02, 0.72), loc=(0, 0.18, 0.72), mat='Trim', r=0.24)]
    for i in range(6):
        parts.append(furn.sphere('bulb', 0.025, loc=(-0.3 + i * 0.12, 0.13, 1.44), mat='Lamp'))
    return finish_station(parts, {}, 0)


def g_bookshelf():
    base_mats(accent='woodlight')
    # an open case: back, sides and top, so the books show
    parts = [furn.rbox('back', (0.9, 0.03, 1.6), loc=(0, 0.135, 0), mat='Woodlight', r=0.01),
             furn.rbox('side', (0.04, 0.3, 1.6), loc=(-0.43, 0, 0), mat='Woodlight', r=0.01),
             furn.rbox('side', (0.04, 0.3, 1.6), loc=(0.43, 0, 0), mat='Woodlight', r=0.01),
             furn.rbox('top', (0.94, 0.32, 0.04), loc=(0, 0, 1.6), mat='Woodlight', r=0.01)]
    cols = ['Accent', 'Accent2', 'Accent3', 'Yellow', 'Red']
    for sh in range(4):
        z = 0.08 + sh * 0.38
        parts.append(furn.rbox('shelf', (0.84, 0.28, 0.025), loc=(0, -0.01, z), mat='Paper', r=0.006))
        x = -0.38
        k = 0
        while x < 0.34:
            w = 0.05 + (k * 37 % 5) * 0.01
            h = 0.22 + (k * 13 % 4) * 0.03
            parts.append(furn.rbox('book', (w, 0.2, h), loc=(x + w / 2, -0.03, z + 0.025), mat=cols[(k + sh) % 5], r=0.006))
            x += w + 0.008
            k += 1
    return finish_station(parts, {}, 0)


def g_globe():
    base_mats(accent='sky')
    parts = [furn.cyl('base', 0.14, 0.16, 0.05, loc=(0, 0, 0), mat='Wood', seg=20), furn.cyl('stem', 0.02, 0.02, 0.9, loc=(0, 0, 0.05), mat='Trim', seg=10)]
    parts.append(furn.sphere('globe', 0.2, loc=(0, 0, 1.15), mat='Accent', seg=24, rings=16))
    for i in range(4):
        a = i * 1.6
        parts.append(furn.sphere('land', 0.08, loc=(math.cos(a) * 0.17, math.sin(a) * 0.17, 1.15 + 0.08 * math.sin(i)), mat='Leaf', scale=(1, 0.4, 0.8)))
    meridian = furn.ring('meridian', 0.23, 0.012, mat='Trim', seg=32)
    parts.append(furn.place(meridian, loc=(0, 0, 1.15), rot=(90, 0, 20)))
    parts.append(furn.tube('hold', [(0, 0, 0.95), (0, 0, 0.92)], 0.02, mat='Trim'))
    return finish_station(parts, {}, 0)


def g_cushions():
    base_mats(accent='coral', accent2='sage')
    parts = []
    for i, m in enumerate(('Accent', 'Accent2', 'Accent3')):
        c = furn.cushion('cush', (0.42, 0.42, 0.12), loc=(0, 0, 0), mat=m, puff=0.8, tufts=(2, 2), button_mat='Paper')
        parts.append(furn.place(c, loc=(0.02 * i, 0.01 * i, 0.12 * i), rot=(0, 0, i * 12)))
    return finish_station(parts, {}, 0)


def g_guitar():
    base_mats(accent='rose')
    body = furn.sphere('body', 0.18, mat='Red', scale=(1.0, 0.25, 1.2))
    parts = [furn.place(body, loc=(0, 0, 0.5)), furn.rbox('neck', (0.05, 0.03, 0.55), loc=(0, -0.01, 0.68), mat='Wood', r=0.01),
             furn.rbox('head', (0.08, 0.03, 0.12), loc=(0, -0.01, 1.22), mat='Black', r=0.02),
             furn.rbox('guard', (0.16, 0.02, 0.2), loc=(0.02, -0.05, 0.35), mat='Paper', r=0.04)]
    parts += [furn.tube('stand1', [(0, 0.1, 0.9), (-0.18, 0.2, 0)], 0.012, mat='Black'), furn.tube('stand2', [(0, 0.1, 0.9), (0.18, 0.2, 0)], 0.012, mat='Black'),
              furn.tube('cradle', [(-0.16, -0.06, 0.28), (0.16, -0.06, 0.28)], 0.012, mat='Black'),
              furn.tube('cradle2', [(-0.16, -0.06, 0.28), (-0.18, 0.2, 0.0)], 0.012, mat='Black'), furn.tube('cradle3', [(0.16, -0.06, 0.28), (0.18, 0.2, 0.0)], 0.012, mat='Black')]
    return finish_station(parts, {}, 0)


def g_desk_plant():
    base_mats(accent='mint')
    parts = []
    top = plinth(parts)
    parts += plant(0, 0, top, 1.0, 'palm', pot='Accent')
    return finish_station(parts, {}, 0)


def g_frame(kind):
    base_mats(accent='navy')
    parts = []
    if kind == 'diploma':
        frame(parts, 0.55, 0.42, 1.5, mat='Wooddark', inner='Paper')
        parts.append(furn.cyl('seal', 0.04, 0.04, 0.01, loc=(0, 0, 0), mat='Red', seg=16))
        parts[-1] = furn.place(parts[-1], loc=(0.15, -0.045, 1.4), rot=(90, 0, 0))
    else:
        frame(parts, 0.75, 0.95, 1.55, mat='Trim', inner='Accent3', ornate=True, depth=0.06)
        parts.append(furn.sphere('face', 0.11, loc=(0, -0.065, 1.62), mat='Paper', scale=(1, 0.3, 1.2)))
        parts.append(furn.sphere('crown', 0.07, loc=(0, -0.066, 1.78), mat='Yellow', scale=(1.2, 0.3, 0.6)))
        parts.append(furn.sphere('robe', 0.2, loc=(0, -0.066, 1.3), mat='Red', scale=(1.1, 0.3, 0.9)))
    return finish_station(parts, {}, 0)


HEROES = [
    ('pastel-pop:candy-sofa', 'Candy sofa', 'pastel-pop', candy_sofa, 'sit_sofa'),
    ('cottagecore:floral-armchair', 'Floral armchair', 'cottagecore', floral_armchair, 'sit_sofa'),
    ('tropical:hammock', 'Hammock', 'tropical', hammock, None),
    ('zen-garden:stone-fountain', 'Stone fountain', 'zen-garden', stone_fountain, None),
    ('luxe-gold:chandelier', 'Chandelier', 'luxe-gold', chandelier, None),
    ('retro-diner:jukebox', 'Jukebox', 'retro-diner', jukebox, None),
    ('neon-night:arcade-cabinet', 'Arcade cabinet', 'neon-night', arcade, None),
]

GIFTS = {
    'rosa': g_lemon_tree, 'maya': g_polish, 'leo': lambda: g_tool('rasp'), 'jade': g_ring_light, 'gus': g_clock, 'priya': lambda: g_product('gel'),
    'kai': g_surfboard, 'mira': lambda: g_easel('painting'), 'tomas': g_espresso, 'hazel': g_orchid, 'rex': g_belt, 'elise': g_ballet,
    'dev': arcade, 'bea': lambda: g_product('honey'), 'otto': lambda: g_tool('razor'), 'lulu': g_plushie, 'ivan': g_sign, 'sol': g_music,
    'yuki': g_vanity, 'bruno': lambda: g_product('soap'), 'celeste': chandelier, 'pip': hammock, 'noor': g_bookshelf,
    'finn': lambda: g_easel('mountains'), 'stella': lambda: g_sign(neon=True), 'ahmed': g_globe, 'greta': g_cushions, 'zane': g_guitar,
    'iris': g_desk_plant, 'marco': lambda: g_frame('diploma'), 'lady-v': lambda: g_frame('royal'),
}


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for mid, name, set_id, fn, clip in HEROES:
        fid = mid.replace(':', '--')
        if only and fid not in only:
            continue
        meta = {'set': set_id}
        if clip:
            meta['sitClip'] = clip
        e = furn.single(fid, name, 'decor', 'decor', fn, meta=meta)
    for reg, fn in GIFTS.items():
        gid = f'gift-{reg}'
        if only and gid not in only:
            continue
        furn.single(gid, f"Gift from {reg}", 'gift', 'gifts', fn, meta={'regular': reg})


if __name__ == '__main__':
    main()
