"""
Life and the outside: plants in several sizes, the fountain planter, the bin, the salon cat (rigged, with idle and
walk), and for the street outside hedges, a tree, a flower bed, a bench, a street lamp and an awning.

    blender -b --python assets-src/furniture/build_life.py [-- id ...]
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'lib'), HERE]

import bpy  # noqa: E402
from mathutils import Quaternion, Vector  # noqa: E402

import furn  # noqa: E402
import gs  # noqa: E402
from build_front import plant  # noqa: E402
from build_stations import finish_station, mats  # noqa: E402

BASE = dict(accent='terracotta', accent2='cream', trim='gold', base='white')


def style(**kw):
    s = dict(BASE)
    s.update(kw)
    mats(s)
    furn.material('Leafdark', 'leafdark')
    furn.material('Flower', 'pink')
    furn.material('Flower2', 'butter')
    furn.material('Stone', 'stone')
    furn.material('Wooddark', 'wooddark')
    return s


def bush(x, y, z, r, mat='Leaf'):
    return [furn.sphere('bush', r, loc=(x, y, z + r * 0.8), mat=mat, seg=14, rings=9),
            furn.sphere('bush', r * 0.75, loc=(x + r * 0.55, y + r * 0.2, z + r * 0.6), mat=mat, seg=12, rings=8),
            furn.sphere('bush', r * 0.7, loc=(x - r * 0.5, y - r * 0.25, z + r * 0.55), mat=mat, seg=12, rings=8)]


def flowers(parts, n, seed=1):
    """Blossoms sitting on the bushes' surfaces (never floating): each on a random point of a random bush."""
    import random
    rnd = random.Random(seed)
    bushes = [p for p in parts if p.name.startswith(('bush', 'hedge'))]
    out = []
    for i in range(n):
        b = rnd.choice(bushes)
        vs = b.data.vertices
        v = vs[rnd.randrange(len(vs))]
        p = b.matrix_world @ v.co
        if p.z < b.matrix_world.translation.z + 0.02:
            p = b.matrix_world @ max(vs, key=lambda q: q.co.z).co
        out.append(furn.sphere('flower', 0.03, loc=p, mat='Flower' if i % 3 else 'Flower2', scale=(1, 1, 0.6), seg=8, rings=5))
    return out


def m_plant_small():
    style(accent='blush')
    return finish_station(plant(0, 0, 0, 1.2, 'round', pot='Accent'), {}, 0)


def m_plant_tall():
    style(accent='white')
    return finish_station(plant(0, 0, 0, 3.0, 'cone', pot='Accent'), {}, 0)


def m_plant_floor():
    style(accent='terracotta')
    parts = plant(0, 0, 0, 2.6, 'round', pot='Accent')
    return finish_station(parts, {}, 0)


def m_fountain():
    """The indoor fountain garden: a rounded planter full of greenery and flowers around a two-tier fountain."""
    style(accent='white', accent2='stone')
    parts = [furn.rbox('planter', (1.6, 1.2, 0.3), loc=(0, 0, 0), mat='Base', r=0.12),
             furn.rbox('lip', (1.64, 1.24, 0.04), loc=(0, 0, 0.3), mat='Base', r=0.02),
             furn.rbox('soil', (1.5, 1.1, 0.02), loc=(0, 0, 0.31), mat='Soil', r=0.05)]
    for x, y, r in ((-0.5, -0.3, 0.22), (0.5, 0.3, 0.24), (-0.45, 0.35, 0.2), (0.5, -0.32, 0.2), (0.0, -0.4, 0.16)):
        parts += bush(x, y, 0.32, r, 'Leaf' if x < 0 else 'Leafdark')
    parts += flowers(parts, 18)
    parts.append(furn.cyl('basin', 0.3, 0.26, 0.2, loc=(0.05, 0.0, 0.32), mat='Accent2', seg=32, bevel=0.02))
    parts.append(furn.cyl('water1', 0.27, 0.27, 0.01, loc=(0.05, 0.0, 0.5), mat='Water', seg=32))
    parts.append(furn.cyl('stem', 0.06, 0.05, 0.3, loc=(0.05, 0.0, 0.5), mat='Accent2', seg=16))
    parts.append(furn.cyl('bowl2', 0.16, 0.1, 0.08, loc=(0.05, 0.0, 0.78), mat='Accent2', seg=24, bevel=0.01))
    parts.append(furn.cyl('water2', 0.14, 0.14, 0.01, loc=(0.05, 0.0, 0.85), mat='Water', seg=24))
    parts.append(furn.cyl('spout', 0.02, 0.02, 0.12, loc=(0.05, 0.0, 0.85), mat='Water', seg=10))
    return finish_station(parts, {'lookat': ((0.05, 0, 0.8), 0)}, 0)


def m_bin():
    style(accent='cream')
    parts = [furn.cyl('bin', 0.16, 0.14, 0.38, loc=(0, 0, 0), mat='Accent', seg=24, bevel=0.01),
             furn.cyl('binrim', 0.165, 0.165, 0.03, loc=(0, 0, 0.36), mat='Trim', seg=24),
             furn.cyl('pedal', 0.05, 0.05, 0.02, loc=(0, -0.15, 0.02), mat='Trim', seg=12)]
    return finish_station(parts, {}, 0)


def m_hedge():
    style()
    parts = [furn.rbox('box', (1.2, 0.5, 0.2), loc=(0, 0, 0), mat='Stone', r=0.04)]
    for i in range(4):
        parts.append(furn.sphere('hedge', 0.26, loc=(-0.45 + i * 0.3, 0, 0.42), mat='Leaf' if i % 2 else 'Leafdark', scale=(1.2, 0.95, 0.95), seg=14, rings=9))
    parts += flowers(parts, 8, 3)
    return finish_station(parts, {}, 0)


def m_tree():
    style()
    parts = [furn.cyl('trunk', 0.09, 0.06, 1.3, loc=(0, 0, 0), mat='Wooddark', seg=12)]
    for dx, dy, dz, r in ((0, 0, 1.65, 0.55), (0.35, 0.1, 1.45, 0.38), (-0.32, -0.12, 1.5, 0.4), (0.05, 0.3, 1.9, 0.36)):
        parts.append(furn.sphere('crown', r, loc=(dx, dy, dz), mat='Leaf' if dx >= 0 else 'Leafdark', seg=16, rings=10))
    return finish_station(parts, {}, 0)


def m_flowerbed():
    style(accent='wood')
    parts = [furn.rbox('bed', (1.4, 0.6, 0.22), loc=(0, 0, 0), mat='Wood', r=0.03),
             furn.rbox('soil', (1.3, 0.5, 0.02), loc=(0, 0, 0.22), mat='Soil', r=0.02)]
    for i in range(6):
        parts += bush(-0.55 + i * 0.22, 0.05 * ((-1) ** i), 0.22, 0.1, 'Leaf')
    parts += flowers(parts, 20, 5)
    return finish_station(parts, {}, 0)


def m_bench():
    style(accent='wood')
    parts = []
    for i in range(3):
        parts.append(furn.rbox('slat', (1.4, 0.12, 0.035), loc=(0, -0.14 + i * 0.14, 0.42), mat='Wood', r=0.012))
    for i in range(2):
        slat = furn.rbox('back', (1.4, 0.1, 0.035), loc=(0, 0, 0), mat='Wood', r=0.012)
        parts.append(furn.place(slat, loc=(0, 0.26, 0.58 + i * 0.14), rot=(80, 0, 0)))
    for sx in (1, -1):
        parts.append(furn.tube('frame', [(sx * 0.62, -0.2, 0), (sx * 0.62, -0.18, 0.42), (sx * 0.62, 0.22, 0.42), (sx * 0.62, 0.3, 0.86)], 0.025, mat='Black'))
        parts.append(furn.tube('frame2', [(sx * 0.62, 0.22, 0.42), (sx * 0.62, 0.22, 0)], 0.025, mat='Black'))
    return finish_station(parts, {'seat': ((0, -0.02, 0.47), 0)}, 0)


def m_streetlamp():
    style()
    parts = [furn.cyl('base', 0.14, 0.18, 0.2, loc=(0, 0, 0), mat='Black', seg=16),
             furn.cyl('post', 0.05, 0.04, 2.6, loc=(0, 0, 0.2), mat='Black', seg=12),
             furn.cyl('cap', 0.12, 0.05, 0.12, loc=(0, 0, 2.95), mat='Black', seg=16),
             furn.sphere('globe', 0.16, loc=(0, 0, 2.95), mat='Lamp', seg=16, rings=10)]
    return finish_station(parts, {}, 0)


def m_awning():
    """A striped shop awning over the entrance: its back against the wall (at y = 0), hanging 2.3 m up."""
    style(accent='pink', accent2='white')
    parts = []
    n = 8
    for i in range(n):
        x = -1.0 + (i + 0.5) * 2.0 / n
        stripe = furn.rbox('stripe', (2.0 / n, 0.9, 0.02), loc=(0, 0, 0), mat='Accent' if i % 2 else 'Accent2', r=0.005)
        parts.append(furn.place(stripe, loc=(x, -0.45, 2.3), rot=(22, 0, 0)))
        scal = furn.cyl('scallop', 2.0 / n / 2, 2.0 / n / 2, 0.02, loc=(0, 0, 0), mat='Accent' if i % 2 else 'Accent2', seg=12)
        parts.append(furn.place(scal, loc=(x, -0.87, 2.12), rot=(90, 0, 0)))
    parts.append(furn.tube('bar', [(-1.02, -0.02, 2.46), (1.02, -0.02, 2.46)], 0.02, mat='Trim'))
    return finish_station(parts, {}, 0)


# ---------------------------------------------------------------------------------------------- the cat

def m_cat():
    """The salon cat: a round, cream-and-ginger cat on a small rig (body, head, tail, four legs), with idle (a slow
    breath, a tail swish, an ear twitch) and walk clips."""
    style()
    furn.material('Fur', color=0xf2b27a, rough=0.7)
    furn.material('Fur2', color=0xfff2e2, rough=0.7)
    furn.material('Nose', color=0xe8828f, rough=0.5)
    furn.material('Eye', color=0x3b2e2a, rough=0.2)
    arm = bpy.data.armatures.new('catrig')
    rig = bpy.data.objects.new('catrig', arm)
    gs.link(rig)
    gs.activate(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(n, h, t, parent=None):
        b = arm.edit_bones.new(n)
        b.head, b.tail = Vector(h), Vector(t)
        if parent:
            b.parent = arm.edit_bones[parent]
        return b
    bone('body', (0, 0.12, 0.2), (0, -0.1, 0.21))
    bone('head', (0, -0.12, 0.25), (0, -0.2, 0.33), 'body')
    bone('tail1', (0, 0.16, 0.2), (0, 0.26, 0.27), 'body')
    bone('tail2', (0, 0.26, 0.27), (0, 0.3, 0.4), 'tail1')
    for n, x, y in (('leg_fl', 0.05, -0.08), ('leg_fr', -0.05, -0.08), ('leg_bl', 0.05, 0.1), ('leg_br', -0.05, 0.1)):
        bone(n, (x, y, 0.16), (x, y, 0.0), 'body')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts = []
    def rigid(o, b):
        vg = o.vertex_groups.new(name=b)
        vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        return o
    body = furn.sphere('cbody', 0.12, loc=(0, 0.02, 0.2), mat='Fur', scale=(0.8, 1.35, 0.8))
    belly = furn.sphere('cbelly', 0.1, loc=(0, -0.02, 0.17), mat='Fur2', scale=(0.75, 1.1, 0.7))
    parts += [rigid(gs.join([body, belly], 'cbody'), 'body')]
    head = furn.sphere('chead', 0.085, loc=(0, -0.16, 0.3), mat='Fur', scale=(1.1, 0.95, 0.95))
    muz = furn.sphere('muzzle', 0.04, loc=(0, -0.235, 0.28), mat='Fur2', scale=(1.2, 0.8, 0.8))
    nose = furn.sphere('nose', 0.012, loc=(0, -0.268, 0.292), mat='Nose')
    eyes = [furn.sphere('eye', 0.014, loc=(s * 0.035, -0.235, 0.318), mat='Eye') for s in (1, -1)]
    ears = []
    for s in (1, -1):
        e = furn.cyl('ear', 0.03, 0.004, 0.06, loc=(0, 0, 0), mat='Fur', seg=4)
        ears.append(furn.place(e, loc=(s * 0.05, -0.15, 0.36), rot=(0, -s * 20, 45)))
    parts.append(rigid(gs.join([head, muz, nose, *eyes, *ears], 'chead'), 'head'))
    parts.append(rigid(furn.tube('tail1', [(0, 0.15, 0.2), (0, 0.26, 0.27)], 0.022, mat='Fur'), 'tail1'))
    parts.append(rigid(furn.tube('tail2', [(0, 0.26, 0.27), (0, 0.3, 0.4)], 0.02, mat='Fur2'), 'tail2'))
    for n, x, y in (('leg_fl', 0.05, -0.08), ('leg_fr', -0.05, -0.08), ('leg_bl', 0.05, 0.1), ('leg_br', -0.05, 0.1)):
        leg = furn.tube(n, [(x, y, 0.17), (x, y, 0.03)], 0.022, mat='Fur')
        paw = furn.sphere('paw', 0.025, loc=(x, y - 0.01, 0.022), mat='Fur2', scale=(1, 1.3, 0.8))
        parts.append(rigid(gs.join([leg, paw], n), n))
    body = gs.join(parts, 'cat')
    gs.decimate(body, 2600)
    gs.shade_smooth(body)
    gs.white_vertex_colors(body)
    body.parent = rig
    m = body.modifiers.new('rig', 'ARMATURE')
    m.object = rig
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    def q(x=0, y=0, z=0):
        from mathutils import Euler
        return Euler((math.radians(x), math.radians(y), math.radians(z))).to_quaternion()
    def key(name, frames):
        a = bpy.data.actions.new(name)
        rig.animation_data_create()
        rig.animation_data.action = a
        for f, pose in frames:
            for pb in rig.pose.bones:
                pb.rotation_quaternion = pose.get(pb.name, Quaternion())
                pb.location = Vector()
                pb.keyframe_insert('rotation_quaternion', frame=f)
            if 'lift' in pose:
                pb = rig.pose.bones['body']
                pb.location = Vector((0, 0, 0))
        rig.animation_data.action = None
        return a
    idle = key('idle', [(0, {'tail1': q(0, 0, 15), 'tail2': q(20, 0, 10)}), (30, {'tail1': q(0, 0, -15), 'tail2': q(20, 0, -15), 'head': q(0, 0, 6)}),
                        (60, {'tail1': q(0, 0, 15), 'tail2': q(20, 0, 10)})])
    walk = key('walk', [(f, {'leg_fl': q(25 * math.sin(p), 0, 0), 'leg_br': q(25 * math.sin(p), 0, 0), 'leg_fr': q(-25 * math.sin(p), 0, 0),
                             'leg_bl': q(-25 * math.sin(p), 0, 0), 'tail1': q(10, 0, 8 * math.sin(p)), 'head': q(3 * math.sin(2 * p), 0, 0)})
                        for f, p in ((i * 5, i * 5 / 20 * 2 * math.pi) for i in range(5))])
    ad = rig.animation_data
    for a in (idle, walk):
        tr = ad.nla_tracks.new()
        tr.name = a.name
        tr.strips.new(a.name, 0, a)
    return rig, body


def export_cat():
    furn.new_model()
    rig, body = m_cat()
    path = os.path.join(furn.MODELS_OUT, 'life', 'cat.glb')
    gs.export_glb(path, [rig, body], animations=True, anim_mode='NLA_TRACKS')
    thumb = furn.render_thumb(body, os.path.join(furn.THUMBS, 'cat.png'))
    entry = {'id': 'cat', 'name': 'Salon cat', 'kind': 'life', 'file': 'life/cat.glb', 'footprint': [0.25, 0.6], 'height': 0.4, 'nodes': {},
             'recolour': ['Fur', 'Fur2'], 'materials': sorted({m.name for m in body.data.materials}), 'tris': gs.tris(body),
             'animations': ['idle', 'walk'], 'walkSpeed': 0.45}
    furn.write_manifest(entry)
    print('MODEL cat', entry['tris'])


ITEMS = [
    ('plant-small', 'Small plant', 'plant', m_plant_small), ('plant-tall', 'Tall topiary', 'plant', m_plant_tall),
    ('plant-floor', 'Floor plant', 'plant', m_plant_floor), ('fountain', 'Fountain garden', 'life', m_fountain), ('bin', 'Bin', 'life', m_bin),
    ('hedge', 'Hedge planter', 'plant', m_hedge), ('tree', 'Tree', 'plant', m_tree), ('flower-bed', 'Flower bed', 'plant', m_flowerbed),
    ('bench', 'Street bench', 'life', m_bench), ('street-lamp', 'Street lamp', 'life', m_streetlamp), ('awning', 'Awning', 'room', m_awning),
]


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for mid, name, kind, fn in ITEMS:
        if only and mid not in only:
            continue
        furn.single(mid, name, kind, 'life', fn)
    if not only or 'cat' in only:
        export_cat()


if __name__ == '__main__':
    main()
