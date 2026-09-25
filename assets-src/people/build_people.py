"""
Build a character model: one body kind per run.

    blender -b --python assets-src/people/build_people.py -- fem
    blender -b --python assets-src/people/build_people.py -- masc

The bodies, faces, eyes, brows and sculpted hair are Quaternius' Universal Base Characters (CC0, free tier),
restyled (ubc.py); the clips are Quaternius' Universal Animation Library walk plus our own idle, talk, seated clips,
work, wave, cheer and sleepy (anims.py); the outfits are ours (outfits.py).

Writes assets-src/out/people_<kind>.glb (uncompressed; build.sh packs it into public/models/people/<kind>.glb) and a
manifest for the catalogue. The .glb holds the rig (23 bones, UAL naming), every outfit body (outfit_<outfit>, the
body below the neck, dressed), the head (head_<kind>, with Quaternius' textured face), the eyes, the brows, the
seven hair styles (hair_<style>), the bow and flower clip placed for each hair style (bow_<style>, flower_<style>),
the glasses, and every clip. Show one outfit, the head, eyes, brows, one hair and at most one accessory.
"""
import json
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(os.path.dirname(HERE), 'lib'), HERE]

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import anims  # noqa: E402
import gs  # noqa: E402
import hair  # noqa: E402
import outfits  # noqa: E402
import rig  # noqa: E402
import ubc  # noqa: E402
import ubc_hair  # noqa: E402

# Preview colours only: the floor engine tints every material from the Look.
PREVIEW = {
    'Top': (0xf7b7c9, 0.8), 'Bottom': ((110, 142, 196), 0.85), 'Shoes': ((250, 250, 252), 0.45), 'Shirt': ((252, 246, 236), 0.75),
    'Detail': (0xcdbdf2, 0.6), 'Apron': (0xe7799c, 0.75), 'Scrubs': ((178, 228, 210), 0.8), 'Accessory': (0xf5a99a, 0.5),
    'FlowerCentre': (0xfbe7b0, 0.6), 'Glasses': ((86, 56, 76), 0.3),
}
SHEEN = {'Top': 0.5, 'Bottom': 0.45, 'Shirt': 0.45, 'Scrubs': 0.5, 'Apron': 0.5, 'Detail': 0.3}
HAIR_PIECES = ['Hair_BuzzedFemale', 'Hair_Buzzed', 'Hair_Long', 'Hair_Buns', 'Hair_SimpleParted']


def materials(kind):
    ubc.materials(kind)
    for n, (c, r) in PREVIEW.items():
        gs.mat(n, c, rough=r, sheen=SHEEN.get(n, 0.0))
    gs.mat('Lens', 0xffffff, rough=0.05, alpha=0.18)


def transfer_weights(src, dst):
    """Give dst the nearest weights of src (for the parts that sit on the body: a skirt, a hood, an apron)."""
    for vg in src.vertex_groups:
        if vg.name not in dst.vertex_groups:
            dst.vertex_groups.new(name=vg.name)
    m = dst.modifiers.new('dt', 'DATA_TRANSFER')
    m.object = src
    m.use_vert_data = True
    m.data_types_verts = {'VGROUP_WEIGHTS'}
    m.vert_mapping = 'POLYINTERP_NEAREST'
    m.layers_vgroup_select_src = 'ALL'
    m.layers_vgroup_select_dst = 'NAME'
    gs.activate(dst)
    bpy.ops.object.modifier_apply(modifier=m.name)


def rigid(o, bone='Head'):
    for name in [vg.name for vg in o.vertex_groups]:
        o.vertex_groups.remove(o.vertex_groups[name])
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')


def bind(o, arm):
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    o.parent = arm
    o.matrix_parent_inverse.identity()
    m = o.modifiers.new('rig', 'ARMATURE')
    m.object = arm


def clean_groups(o, arm):
    """Drop empty groups and ones that are not bones (the glTF skin only needs the bones)."""
    bones = {b.name for b in arm.data.bones}
    used = set()
    for v in o.data.vertices:
        for g in v.groups:
            if g.weight > 1e-4:
                used.add(g.group)
    drop = [vg.name for vg in o.vertex_groups if vg.name not in bones or vg.index not in used]
    for name in drop:  # by name: removing a group renumbers the ones after it
        o.vertex_groups.remove(o.vertex_groups[name])


def unskin(o):
    """Drop the armature link (the meshes are already baked into the new rest pose)."""
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw


def decimate_protected(o, target, protect_group=None):
    """Decimate to about target triangles, sparing the vertices of protect_group (the face)."""
    t = gs.tris(o)
    if t <= target:
        return
    d = o.modifiers.new('dec', 'DECIMATE')
    d.ratio = target / t
    if protect_group and protect_group in o.vertex_groups:
        d.vertex_group = protect_group
        d.invert_vertex_group = True
        d.vertex_group_factor = 0.9
    gs.activate(o)
    bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
    bpy.ops.object.modifier_apply(modifier='dec')


def build(kind):
    gs.reset()
    materials(kind)
    arm, parts = ubc.load(kind)
    pieces = {n: ubc.load_hair(n, arm) for n in HAIR_PIECES}
    body, eyes, brows = parts['body'], parts['eyes'], parts['brows']
    ubc.restyle(arm, [body, eyes, brows, *pieces.values()], kind)
    ubc.merge_fingers(arm, [body, eyes, brows, *pieces.values()])
    ubc.smooth_muscles(body, ubc.PROFILE[kind]['smooth'])
    for o in (body, eyes, brows):
        unskin(o)
    ubc.enlarge_eyes(body, eyes, brows, 1.4, open_lids=1.32)
    rig.load_mocap(arm)
    J = rig.joints(arm)
    for o in (body, eyes, brows, *pieces.values()):
        unskin(o)
    ubc.assign(body, 'Skin')
    ubc.assign_eyes(eyes)
    ubc.assign(brows, 'Brows')
    for p in pieces.values():
        ubc.assign(p, 'Hair')
    # lighter: the body to ~7k triangles (the face spared), the brows to a few hundred
    decimate_protected(body, 7000, 'Head')
    gs.decimate(brows, 500)
    for p in ('Hair_Long', 'Hair_Buns'):
        gs.decimate(pieces[p], 2000)
    head, cut_z = ubc.split_head(body, J)
    head.name = head.data.name = f'head_{kind}'
    eyes.name = eyes.data.name = 'eyes'
    brows.name = brows.data.name = 'brows'
    M = outfits.marks(J)
    meshes = []
    for name in outfits.OUTFITS:
        if kind == 'masc' and name in outfits.MASC_SKIP:
            continue
        spec = dict(outfits.SPEC[name])
        if kind == 'masc' and spec['legs'] == 'skirt':
            spec['legs'] = 'trousers'
        o = outfits.dress_body(body, M, spec, 'outfit_' + name)
        ex = outfits.extras(body, M, spec, kind) + outfits.shoes(body, M)
        for e in ex:
            transfer_weights(body, e)
        if ex:
            o = gs.join([o, *ex], 'outfit_' + name)
        meshes.append(o)
    meshes += [head, eyes, brows]
    hairs, info = ubc_hair.build_all(kind, pieces, head)
    for style in ubc_hair.STYLES:
        hr = hairs[style]
        rigid(hr)
        meshes.append(hr)
        C = info['C']
        for acc, fn, off in (('bow', hair.bow, Vector((-0.6, -0.25, 0.8))), ('flower', hair.flower, Vector((0.62, -0.3, 0.6)))):
            d = Vector((off.x * info['w'], off.y * info['d'], off.z * info['up']))
            p = hair.surface_point(hr, C + d * 4, C)
            n = (p - C).normalized()
            a = fn(f'{acc}_{style}', p, n)
            rigid(a)
            meshes.append(a)
    gl = ubc_hair.glasses(eyes, info)
    rigid(gl)
    meshes.append(gl)
    rigid(eyes)
    rigid(brows)
    for p in pieces.values():
        bpy.data.objects.remove(p)
    bpy.data.objects.remove(body)
    for o in meshes:
        clean_groups(o, arm)
    hairs_l = [o for o in meshes if o.name.startswith('hair_')]
    gs.bake_vertex_ao(hairs_l, samples=96, distance=0.02, strength=0.45, floor=False)
    for o in meshes:
        if o not in hairs_l:
            gs.white_vertex_colors(o)
    for o in meshes:
        bind(o, arm)
    clips = anims.build_all(arm, gentle=True)
    arm['walk_speed'] = walk_speed(arm, clips['walk'])  # before the NLA tracks, which would blend every clip
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    for name, act in sorted(clips.items()):
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, int(act.frame_range[0]), act)
        st.name = name
    for a in list(bpy.data.actions):
        if a not in clips.values():
            bpy.data.actions.remove(a)
    report = {o.name: gs.tris(o) for o in meshes}
    return arm, meshes, clips, info, report


def walk_speed(arm, act):
    """How fast the in-place walk carries a person (m/s): the planted foot's backward speed under the hips."""
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if act.slots:
        ad.action_slot = act.slots[0]
    sc = bpy.context.scene
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    prev, v = None, []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        bpy.context.view_layer.update()
        low = min((arm.pose.bones[n].head.copy() for n in ('ball_l', 'ball_r')), key=lambda p: p.z)
        if prev is not None and abs(low.z - prev.z) < 0.01:
            v.append((low.y - prev.y) * sc.render.fps)
        prev = low
    ad.action = None
    return round(statistics.median([x for x in v if x > 0.05]), 3) if v else None


def manifest(kind, arm, meshes, clips, info, report):
    fps = bpy.context.scene.render.fps
    data = {
        'kind': kind, 'file': f'people/{kind}.glb', 'bones': [b.name for b in arm.data.bones],
        'meshes': {o.name: {'tris': report[o.name], 'materials': [m.name for m in o.data.materials]} for o in meshes},
        'clips': {n: round((a.frame_range[1] - a.frame_range[0]) / fps, 3) for n, a in clips.items()},
        'height': round(max((o.matrix_world @ v.co).z for o in meshes if o.name.startswith('hair_') for v in o.data.vertices), 3),
        'headCenter': [round(info['C'].x, 4), round(info['C'].z, 4), round(-info['C'].y, 4)],
        'walkSpeed': arm['walk_speed'],
    }
    os.makedirs(os.path.join(gs.OUT, 'manifest'), exist_ok=True)
    with open(os.path.join(gs.OUT, 'manifest', f'people_{kind}.json'), 'w') as f:
        json.dump(data, f, indent=1)
    return data


def export(kind, arm, meshes):
    path = os.path.join(gs.OUT, f'people_{kind}.glb')
    gs.export_glb(path, [arm, *meshes], animations=True, anim_mode='NLA_TRACKS')
    return path


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['fem']
    kind = argv[0]
    arm, meshes, clips, info, report = build(kind)
    for k, v in report.items():
        print(f'TRIS {k} {v}')
    print('CLIPS', sorted(clips))
    print('EXPORTED', export(kind, arm, meshes))
    print('MANIFEST', json.dumps({k: v for k, v in manifest(kind, arm, meshes, clips, info, report).items() if k in ('height', 'walkSpeed', 'clips')}))
    if len(argv) > 1 and argv[1] == 'blend':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(gs.OUT, f'people_{kind}.blend'))
