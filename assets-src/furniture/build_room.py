"""
The room shell: wall pieces with skirting and a top trim, a corner post, a low partition wall with rounded ends, an
arch panel with a sconce, a window, a glass double door, a wall sconce, and the wood floor (a tileable plank texture
made here, plus a 2 m floor tile using it).

    blender -b --python assets-src/furniture/build_room.py

Wall pieces are 1 m long along X (the door 1.4 m), 2.8 m high and 0.14 m thick, centred on the origin, their room
side facing -Y (glTF +Z). Materials: Wall (the paint, tintable), Skirting, Trim (gold), Glass, Wood; the floor uses
Floor with public/models/room/wood_floor.jpg (1024 px, 4 planks across 2 m, tiles seamlessly).
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'lib'), HERE]

import bpy  # noqa: E402

import furn  # noqa: E402
import gs  # noqa: E402
from build_stations import finish_station, mats  # noqa: E402

H, T = 2.8, 0.14


def room_mats():
    mats(dict(accent='blush', accent2='cream', trim='gold', base='white'))
    furn.material('Wall', color=0xfbf1ec, rough=0.8)
    furn.material('Skirting', color=0xf6e6de, rough=0.6)
    furn.material('Panel', color=0xf7e3db, rough=0.8)


def wall_base(parts, L=1.0, h=H):
    parts.append(furn.rbox('wall', (L, T, h), loc=(0, 0, 0), mat='Wall', r=0.004))
    parts.append(furn.rbox('skirt', (L, T + 0.03, 0.12), loc=(0, 0, 0), mat='Skirting', r=0.01))
    parts.append(furn.rbox('skirtline', (L, T + 0.036, 0.012), loc=(0, 0, 0.12), mat='Trim', r=0.004))
    if h >= H:
        parts.append(furn.rbox('crown', (L, T + 0.03, 0.06), loc=(0, 0, h - 0.06), mat='Skirting', r=0.01))


def wall():
    room_mats()
    parts = []
    wall_base(parts)
    return finish_station(parts, {}, 0)


def corner():
    room_mats()
    parts = [furn.rbox('post', (T, T, H), loc=(0, 0, 0), mat='Wall', r=0.004),
             furn.rbox('skirt', (T + 0.03, T + 0.03, 0.12), loc=(0, 0, 0), mat='Skirting', r=0.01)]
    return finish_station(parts, {}, 0)


def low_wall():
    """A low partition (0.95 m) with a rounded top and a gold rail, 1 m long; low-wall-end caps it with a half round."""
    room_mats()
    parts = []
    wall_base(parts, 1.0, 0.95)
    top = furn.cyl('round', T / 2 + 0.01, T / 2 + 0.01, 1.0, loc=(0, 0, 0), mat='Wall', seg=16)
    parts.append(furn.place(top, loc=(-0.5, 0, 0.95), rot=(0, 90, 0)))
    return finish_station(parts, {}, 0)


def low_wall_end():
    room_mats()
    parts = [furn.cyl('end', T / 2 + 0.01, T / 2 + 0.01, 0.95, loc=(0, 0, 0), mat='Wall', seg=24),
             furn.sphere('cap', T / 2 + 0.01, loc=(0, 0, 0.95), mat='Wall', seg=24, rings=12),
             furn.cyl('skirt', T / 2 + 0.025, T / 2 + 0.025, 0.12, loc=(0, 0, 0), mat='Skirting', seg=24)]
    return finish_station(parts, {}, 0)


def arch_panel():
    """A wall piece with a soft recessed arch panel and a gold line, and a sconce over it."""
    room_mats()
    parts = []
    wall_base(parts)
    parts.append(furn.rbox('panel', (0.6, 0.02, 1.5), loc=(0, -T / 2 - 0.005, 0.3), mat='Panel', r=0.004))
    top = furn.cyl('arch', 0.3, 0.3, 0.02, loc=(0, 0, 0), mat='Panel', seg=32)
    parts.append(furn.place(top, loc=(0, -T / 2 - 0.004, 1.8), rot=(90, 0, 0)))
    ring = furn.ring('archline', 0.3, 0.008, mat='Trim', seg=40)
    parts.append(furn.place(ring, loc=(0, -T / 2 - 0.018, 1.8), rot=(90, 0, 0)))
    for x in (-0.3, 0.3):
        parts.append(furn.rbox('line', (0.016, 0.02, 1.5), loc=(x, -T / 2 - 0.012, 0.3), mat='Trim', r=0.004))
    return finish_station(parts, {}, 0)


def sconce_parts(z=2.05):
    cup = furn.cyl('cup', 0.06, 0.1, 0.1, loc=(0, 0, 0), mat='Trim', seg=20)
    return [furn.rbox('plate', (0.1, 0.02, 0.16), loc=(0, -T / 2 - 0.01, z - 0.08), mat='Trim', r=0.01),
            furn.tube('arm', [(0, -T / 2 - 0.02, z), (0, -T / 2 - 0.12, z + 0.02)], 0.01, mat='Trim'),
            furn.place(cup, loc=(0, -T / 2 - 0.12, z)), furn.sphere('glow', 0.05, loc=(0, -T / 2 - 0.12, z + 0.1), mat='Lamp')]


def sconce():
    room_mats()
    return finish_station(sconce_parts(), {}, 0)


def window():
    """A wall piece with a tall window: frame, mullion, glass and a sill."""
    room_mats()
    parts = []
    L, w0, w1, z0, z1 = 1.0, -0.36, 0.36, 0.8, 2.3
    parts.append(furn.rbox('below', (L, T, z0), loc=(0, 0, 0), mat='Wall', r=0.004))
    parts.append(furn.rbox('above', (L, T, H - z1), loc=(0, 0, z1), mat='Wall', r=0.004))
    parts.append(furn.rbox('left', (L / 2 + w0, T, z1 - z0), loc=((w0 - L / 2) / 2, 0, z0), mat='Wall', r=0.004))
    parts.append(furn.rbox('right', (L / 2 - w1, T, z1 - z0), loc=((w1 + L / 2) / 2, 0, z0), mat='Wall', r=0.004))
    parts.append(furn.rbox('skirt', (L, T + 0.03, 0.12), loc=(0, 0, 0), mat='Skirting', r=0.01))
    parts.append(furn.rbox('crown', (L, T + 0.03, 0.06), loc=(0, 0, H - 0.06), mat='Skirting', r=0.01))
    for x in (w0, w1):
        parts.append(furn.rbox('jamb', (0.05, T + 0.02, z1 - z0), loc=(x, 0, z0), mat='Skirting', r=0.008))
    parts.append(furn.rbox('head', (w1 - w0 + 0.1, T + 0.02, 0.05), loc=(0, 0, z1 - 0.025), mat='Skirting', r=0.008))
    parts.append(furn.rbox('sill', (w1 - w0 + 0.16, T + 0.1, 0.04), loc=(0, -0.04, z0 - 0.02), mat='Skirting', r=0.01))
    parts.append(furn.rbox('mullion', (0.03, 0.04, z1 - z0), loc=(0, 0, z0), mat='Skirting', r=0.006))
    parts.append(furn.rbox('transom', (w1 - w0, 0.04, 0.03), loc=(0, 0, z0 + (z1 - z0) * 0.62), mat='Skirting', r=0.006))
    parts.append(furn.rbox('glass', (w1 - w0, 0.01, z1 - z0), loc=(0, 0, z0), mat='Glass', r=0.002))
    return finish_station(parts, {}, 0)


def door():
    """A 1.4 m wall piece with a glass double door (gold frames and round handles) in it."""
    room_mats()
    parts = []
    L, dw, dh = 1.4, 1.1, 2.3
    parts.append(furn.rbox('above', (L, T, H - dh), loc=(0, 0, dh), mat='Wall', r=0.004))
    for s in (1, -1):
        parts.append(furn.rbox('side', ((L - dw) / 2, T, dh), loc=(s * (dw / 2 + (L - dw) / 4), 0, 0), mat='Wall', r=0.004))
        parts.append(furn.rbox('skirt', ((L - dw) / 2, T + 0.03, 0.12), loc=(s * (dw / 2 + (L - dw) / 4), 0, 0), mat='Skirting', r=0.01))
        x = s * dw / 4
        parts.append(furn.rbox('leaf', (dw / 2 - 0.02, 0.04, dh - 0.02), loc=(x, 0, 0), mat='Trim', r=0.01))
        parts.append(furn.rbox('pane', (dw / 2 - 0.12, 0.05, dh - 0.2), loc=(x, 0, 0.1), mat='Glass', r=0.004))
        parts.append(furn.sphere('handle', 0.03, loc=(s * 0.06, -0.05, 1.05), mat='Trim'))
    parts.append(furn.rbox('crown', (L, T + 0.03, 0.06), loc=(0, 0, H - 0.06), mat='Skirting', r=0.01))
    parts.append(furn.rbox('lintel', (dw + 0.1, T + 0.03, 0.06), loc=(0, 0, dh), mat='Skirting', r=0.01))
    return finish_station(parts, {'work': ((0, -0.6, 0), 0)}, 0)


def floor_tile():
    room_mats()
    tex = os.path.join(gs.MODELS, 'room', 'wood_floor.jpg')  # made by floor_texture.py (plain Python, Pillow)
    img = bpy.data.images.load(tex)
    gs.mat('Floor', 0xffffff, rough=0.55, image=img)
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x + 1) / 2, (l.vert.co.y + 1) / 2)
    o = gs.mesh_obj('floor', bm, 'Floor')
    gs.white_vertex_colors(o)
    return o, []


ITEMS = [('wall', 'Wall', wall), ('wall-corner', 'Wall corner post', corner), ('wall-low', 'Low partition wall', low_wall),
         ('wall-low-end', 'Low wall round end', low_wall_end), ('wall-arch', 'Arch panel wall', arch_panel), ('wall-window', 'Window wall', window),
         ('wall-door', 'Door wall', door), ('sconce', 'Wall sconce', sconce)]


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for mid, name, fn in ITEMS:
        if not only or mid in only:
            furn.single(mid, name, 'room', 'room', fn)
    furn.new_model()
    body, _ = floor_tile()
    info = furn.export('floor-tile', None, 'room', body, [], thumb=True, recolour=())
    entry = {'id': 'floor-tile', 'name': 'Wood floor (2 m tile)', 'kind': 'room', **{k: info[k] for k in ('file', 'footprint', 'height', 'nodes', 'recolour', 'materials', 'tris')}, 'texture': 'room/wood_floor.jpg'}
    furn.write_manifest(entry)
    print('MODEL floor-tile')


if __name__ == '__main__':
    main()
