"""
Preview renders of the people from the exported .glb files (so the render also proves the export):

    blender -b --python assets-src/people/render_people.py -- <out.png> [lineup|poses|turn] [glb dir]

lineup: a row of customers, players and staff in different looks, standing in idle, walking, waving, working
poses:  one character in every clip
turn:   one character from four sides
Colours come from the game's palettes (src/art/palette.ts) the way the floor engine tints the materials.
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'lib'), HERE]

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import gs  # noqa: E402

SKIN = [(250, 222, 206), (243, 204, 178), (230, 180, 144), (204, 146, 106), (158, 104, 70), (112, 72, 48)]
HAIR = [(48, 36, 42), (82, 52, 40), (128, 80, 50), (168, 76, 48), (224, 186, 118), (236, 224, 206), (240, 160, 190), (182, 160, 226)]
OUTFIT = [0xf7b7c9, 0xa9e3cf, 0xcdbdf2, 0xfbd9a0, 0x9fd0f2, 0xf5a99a, 0xb6e39c, 0xf2c4e8]
STYLES = ['long', 'bob', 'bun', 'curly', 'crop', 'ponytail', 'braids']


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    parts = {o.name.split('.')[0]: o for o in new if o.type == 'MESH'}
    for o in parts.values():
        o.hide_render = True
    arm.hide_render = True
    return arm, parts


FACES = {}


def tint(o, colors):
    """Per-object material copies, tinted (as the floor engine does; the face painted for the skin tone)."""
    for i, slot in enumerate(o.material_slots):
        m = o.data.materials[i] if i < len(o.data.materials) else slot.material
        if m is None:
            continue
        base = m.name.split('.')[0]
        if base == 'Face' and 'tone' in colors:
            key = (colors['kind'], colors['tone'])
            if key not in FACES:
                FACES[key] = bpy.data.images.load(os.path.join(gs.OUT, 'faces', f'{key[0]}_{key[1]}.png'))
            m2 = m.copy()
            for n in m2.node_tree.nodes:
                if n.type == 'TEX_IMAGE':
                    n.image = FACES[key]
            slot.link = 'OBJECT'
            slot.material = m2
            continue
        if base in colors:
            m2 = m.copy()
            rgba = gs.rgb(colors[base])
            bsdf = next(n for n in m2.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            inp = bsdf.inputs['Base Color']
            textured = any(n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name != 'Non-Color' for n in m2.node_tree.nodes)
            for n in m2.node_tree.nodes:
                if n.type in ('MIX', 'MIX_RGB') and not textured:
                    for i2 in n.inputs:
                        if i2.type == 'RGBA' and not i2.is_linked:
                            i2.default_value = rgba
            if inp.is_linked and textured:
                # textured (texture x vertex colour): multiply the tint after it, as glTF's baseColorFactor does
                src = inp.links[0].from_socket
                mix = m2.node_tree.nodes.new('ShaderNodeMix')
                mix.data_type = 'RGBA'
                mix.blend_type = 'MULTIPLY'
                mix.inputs['Factor'].default_value = 1.0
                m2.node_tree.links.new(src, mix.inputs[6])
                mix.inputs[7].default_value = rgba
                m2.node_tree.links.new(mix.outputs[2], inp)
            elif not inp.is_linked:
                inp.default_value = rgba
            slot.link = 'OBJECT'
            slot.material = m2


def person(kit, x, y, outfit, style, acc, colors, clip, frame, rot=0.0):
    arm, parts = kit
    a = arm.copy()
    a.data = arm.data
    gs.link(a)
    a.hide_render = False
    # x runs along the iso camera's screen axis (the diagonal (1, 1)); y goes into the picture
    a.location = (x * 0.7071 - y * 0.7071, x * 0.7071 + y * 0.7071, 0)
    a.rotation_mode = 'XYZ'  # the glTF importer leaves objects in quaternion mode
    a.rotation_euler = (0, 0, math.radians(rot))
    a.animation_data_create()
    act = bpy.data.actions.get(clip)
    a.animation_data.action = act
    if act is not None and hasattr(a.animation_data, 'action_slot') and act.slots:
        a.animation_data.action_slot = act.slots[0]
    kind = 'fem' if 'head_fem' in parts else 'masc'
    colors = dict(colors, kind=kind)
    names = [f'outfit_{outfit}', f'head_{kind}', f'hair_{style}']
    if acc:
        names.append(acc if acc == 'glasses' else f'{acc}_{style}')
    made = []
    for n in names:
        src = parts.get(n)
        if src is None:
            print('missing part', n)
            continue
        o = src.copy()
        o.data = src.data
        gs.link(o)
        o.hide_render = False
        o.parent = a
        o.matrix_parent_inverse.identity()
        for m in o.modifiers:
            if m.type == 'ARMATURE':
                m.object = a
        tint(o, colors)
        made.append(o)
    return a, made, frame


def look(r, role='customer', tint_col=0xe7799c):
    tone = r.randrange(len(SKIN))
    skin = SKIN[tone]
    hair = r.choice(HAIR)
    main = r.choice(OUTFIT)
    second = r.choice(OUTFIT)
    c = {'Skin': skin, 'Hair': hair, 'Brows': tuple(int(v * 0.8) for v in hair), 'Eyes': r.choice([(122, 84, 60), (84, 124, 170), (96, 140, 96), (70, 50, 40)]), 'Top': main, 'Bottom': r.choice([(110, 142, 196), (86, 84, 112), (196, 170, 128)]),
         'Shoes': r.choice([(250, 250, 252), (70, 52, 58), (200, 120, 140)]), 'Shirt': (252, 246, 236), 'Detail': second,
         'Accessory': r.choice(OUTFIT), 'Apron': tint_col, 'Scrubs': (178, 228, 210) if role == 'staff' else (150, 206, 222), 'tone': tone}
    return c


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    out, mode = argv[0], (argv[1] if len(argv) > 1 else 'lineup')
    d = argv[2] if len(argv) > 2 else gs.OUT
    gs.reset()
    fem = load(os.path.join(d, 'people_fem.glb'))
    masc = load(os.path.join(d, 'people_masc.glb')) if os.path.exists(os.path.join(d, 'people_masc.glb')) else fem
    r = random.Random(4)
    placed = []
    if mode == 'lineup':
        cast = [
            (fem, 'dress', 'long', 'bow', 'idle', 1), (masc, 'suit', 'crop', 'glasses', 'idle', 1), (fem, 'player', 'ponytail', None, 'idle', 1),
            (fem, 'cardigan', 'bun', 'glasses', 'idle', 1), (masc, 'hoodie', 'curly', None, 'idle', 1), (fem, 'scrubs', 'braids', None, 'idle', 1),
            (fem, 'dungarees', 'bob', 'flower', 'idle', 1), (masc, 'jacket', 'bun', None, 'idle', 1), (fem, 'sporty', 'curly', None, 'idle', 1),
            (masc, 'chef', 'crop', None, 'idle', 1), (fem, 'jumper', 'long', None, 'idle', 1),
        ]
        n = len(cast)
        for i, (kit, o, s, acc, clip, f) in enumerate(cast):
            role = 'player' if o == 'player' else 'staff' if o == 'scrubs' and i == 5 else 'customer'
            col = look(r, role, 0xe7799c)
            if role == 'customer' and o == 'cardigan':
                col['Hair'] = (236, 224, 206)
            placed.append(person(kit, (i - (n - 1) / 2) * 0.7, 0, o, s, acc, col, clip, f, rot=40 + r.uniform(-8, 8)))
        res, cam = (2400, 900), dict(ortho=8.2)
        if len(argv) > 3 and argv[3] == 'game':
            # the size people have on the floor (about 150 px tall), for the side-by-side with Serenity's Spa
            res, cam = (1150, 260), dict(ortho=8.2 * 1150 / 1100)
    elif mode == 'poses':
        clips = ['idle', 'walk', 'talk', 'work', 'wave', 'cheer', 'sit_sofa', 'sit_stool', 'sit_chair', 'sit_pedicure', 'sleepy']
        for i, c in enumerate(clips):
            col = look(random.Random(i))
            z = 0.0
            p = person(fem, (i - (len(clips) - 1) / 2) * 0.7, 0, 'dress' if i % 2 else 'jumper', STYLES[i % 7], None, col, c, 10 if c != 'cheer' else 9, rot=-25)
            if c.startswith('sit') or c == 'sleepy':
                p[0].location.z = 0.45
            placed.append(p)
        res, cam = (2600, 800), dict(ortho=8.0)
    else:
        col = look(random.Random(2))
        for i, rot in enumerate((0, 90, 180, 270)):
            placed.append(person(fem, (i - 1.5) * 0.7, 0, 'dress', 'long', 'bow', col, 'idle', 1, rot=rot))
        res, cam = (1800, 800), dict(ortho=3.2)
    sc = bpy.context.scene
    gs.studio(res=res)
    # each character holds its own frame of its own clip: evaluate it, keep the pose, drop the action
    for a, parts, f in placed:
        ad = a.animation_data
        if not (ad and ad.action):
            continue
        sc.frame_set(f)
        bpy.context.view_layer.update()
        bases = {pb.name: pb.matrix_basis.copy() for pb in a.pose.bones}
        ad.action = None
        for pb in a.pose.bones:
            pb.matrix_basis = bases[pb.name]
    bpy.context.view_layer.update()
    if mode == 'lineup' or mode == 'poses':
        gs.game_view(target=(0, 0, 0.75), ortho=cam['ortho'])
    else:
        gs.camera((0, -8, 1.2), (0, 0, 0.8), ortho=cam['ortho'])
    gs.render(out)


main()
