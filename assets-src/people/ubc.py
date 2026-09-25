"""
The people's bodies, faces and hair on Quaternius' Universal Base Characters (CC0; the free Standard tier: the
Superhero female and male bodies with their eyes and brows, and five sculpted hairstyles), restyled for Glow Salon:
slimmer limbs, shorter legs and arms, a narrower chest, the muscles smoothed away and a bigger head, so they read
like Serenity's Spa's cute stylized people from the high floor camera. Their faces are Quaternius' own.

The rig is the Universal Animation Library's (the same bone names), cut down to 23 bones: the fingers' weights go to
the hands, which stay relaxed and open.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

import gs
import rig

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.join(os.path.dirname(HERE), 'vendor', 'ubc')
TEX = os.path.join(gs.OUT, 'ubc_tex')
BODY = {'fem': 'Superhero_Female_FullBody.gltf', 'masc': 'Superhero_Male_FullBody.gltf'}

# Proportions: (thickness, length) of the leg and arm chains, the head's scale, the chest's width.
PROFILE = {
    'fem': dict(leg=(0.9, 0.8), arm=(0.84, 0.85), head=1.8, chest=(0.94, 0.94), smooth=10),
    'masc': dict(leg=(0.86, 0.81), arm=(0.76, 0.85), head=1.72, chest=(0.86, 0.9), smooth=12),
}


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o)
            new.remove(o)
    return new


def load(kind):
    """The body, its eyes and brows on their armature (renamed rig, body, eyes, brows)."""
    new = imp(os.path.join(V, 'body', BODY[kind]))
    arm = next(o for o in new if o.type == 'ARMATURE')
    arm.name = arm.data.name = 'rig'
    parts = {}
    for o in new:
        if o.type != 'MESH':
            continue
        key = 'eyes' if o.name.startswith('Eyes') else 'brows' if o.name.startswith('Eyebrows') else 'body'
        o.name = o.data.name = key
        parts[key] = o
    if arm.animation_data:
        arm.animation_data.action = None
        for tr in list(arm.animation_data.nla_tracks):
            arm.animation_data.nla_tracks.remove(tr)
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return arm, parts


def load_hair(name, arm):
    """One of the sculpted hairstyles (rigged to the head bone), moved onto our rig."""
    new = imp(os.path.join(V, 'hair', name + '.gltf'))
    mesh = next(o for o in new if o.type == 'MESH')
    for o in new:
        if o.type == 'ARMATURE':
            mesh.parent = None
            bpy.data.objects.remove(o)
    mesh.parent = arm
    mesh.matrix_parent_inverse.identity()
    for m in mesh.modifiers:
        if m.type == 'ARMATURE':
            m.object = arm
    if not any(m.type == 'ARMATURE' for m in mesh.modifiers):
        m = mesh.modifiers.new('rig', 'ARMATURE')
        m.object = arm
    mesh.name = mesh.data.name = name
    return mesh


def restyle(arm, meshes, kind):
    """Pose the new proportions (bone scales), bake them into the meshes and make that pose the rest pose."""
    p = PROFILE[kind]
    gs.activate(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for n in ('neck_01', 'clavicle_l', 'clavicle_r'):
        arm.data.edit_bones[n].inherit_scale = 'NONE'
    bpy.ops.object.mode_set(mode='OBJECT')
    pb = arm.pose.bones
    for s in ('l', 'r'):
        t, l = p['leg']
        pb['thigh_' + s].scale = (t, l, t)
        t, l = p['arm']
        pb['upperarm_' + s].scale = (t, l, t)
    h = p['head']
    pb['Head'].scale = (h, h, h)
    cx, cz = p['chest']
    pb['spine_03'].scale = (cx, 1.0, cz)
    pb['spine_02'].scale = (1.0 - (1 - cx) * 0.5, 1.0, 1.0 - (1 - cz) * 0.5)
    bpy.context.view_layer.update()
    for o in meshes:
        gs.activate(o)
        for m in list(o.modifiers):
            if m.type == 'ARMATURE':
                bpy.ops.object.modifier_apply(modifier=m.name)
    gs.activate(arm)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # the shorter legs lifted the feet: bring everything down to the floor (the root stays at the origin)
    body = next(o for o in meshes if o.name == 'body')
    dz = min((body.matrix_world @ v.co).z for v in body.data.vertices)
    for o in meshes:
        for v in o.data.vertices:
            v.co.z -= dz
    gs.activate(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in arm.data.edit_bones:
        if b.name != 'root':
            b.head.z -= dz
            b.tail.z -= dz
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in meshes:
        m = o.modifiers.new('rig', 'ARMATURE')
        m.object = arm
    return dz


def merge_fingers(arm, meshes):
    """Fold the finger (and leaf) bones' weights into the hands and feet, then drop those bones."""
    keep = set(rig.KEEP)
    parent_of = {}
    for b in arm.data.bones:
        if b.name in keep:
            continue
        a = b
        while a.parent and a.name not in keep:
            a = a.parent
        parent_of[b.name] = a.name
    for o in meshes:
        groups = {vg.name: vg for vg in o.vertex_groups}
        for v in o.data.vertices:
            add = {}
            for g in v.groups:
                name = o.vertex_groups[g.group].name
                if name in parent_of:
                    add[parent_of[name]] = add.get(parent_of[name], 0) + g.weight
            for target, w in add.items():
                if target not in groups:
                    groups[target] = o.vertex_groups.new(name=target)
                groups[target].add([v.index], w, 'ADD')
        for name in list(parent_of):
            if name in o.vertex_groups:
                o.vertex_groups.remove(o.vertex_groups[name])
    gs.activate(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for b in list(arm.data.edit_bones):
        if b.name not in keep:
            arm.data.edit_bones.remove(b)
    bpy.ops.object.mode_set(mode='OBJECT')


def smooth_muscles(body, iterations=10):
    """Smooth away the superhero muscle definition on the torso and limbs; the head, hands and feet stay as sculpted."""
    vg = body.vertex_groups.new(name='__smooth')
    keepers = {'Head': 1.0, 'neck_01': 0.7, 'hand_l': 1.0, 'hand_r': 1.0, 'foot_l': 0.8, 'foot_r': 0.8, 'ball_l': 1.0, 'ball_r': 1.0}
    idx = {g.index: g.name for g in body.vertex_groups}
    for v in body.data.vertices:
        k = 0.0
        for g in v.groups:
            k += keepers.get(idx.get(g.group), 0.0) * g.weight
        vg.add([v.index], max(0.0, 1.0 - min(1.0, k)), 'REPLACE')
    # (no volume preservation: it rescales the whole mesh, which would push the scalp through the hair; the slight
    # shrink of the smoothed torso and limbs is the slimming we want anyway)
    m = body.modifiers.new('smooth', 'LAPLACIANSMOOTH')
    m.iterations = iterations
    m.lambda_factor = 0.45
    m.use_volume_preserve = False
    m.vertex_group = '__smooth'
    gs.activate(body)
    bpy.ops.object.modifier_move_to_index(modifier='smooth', index=0)
    bpy.ops.object.modifier_apply(modifier='smooth')
    body.vertex_groups.remove(body.vertex_groups['__smooth'])


def image(name):
    img = bpy.data.images.load(os.path.join(TEX, name))
    img.name = name
    return img


def materials(kind):
    """Skin (textured, tinted), Eyes (grey iris), Brows and Hair (strand texture, tinted), and the flat cloth ones."""
    gs.mat('Skin', 0xffffff, rough=0.55, image=image(f'skin_{kind}.jpg'), sheen=0.3)
    eye = image('eye.jpg')
    gs.mat('Eyes', 0x7a5438, rough=0.1, image=eye)
    gs.mat('EyeWhite', 0xffffff, rough=0.1, image=eye)
    _multiply(bpy.data.materials['Eyes'])
    hair_img = image('hair.jpg')
    gs.mat('Hair', 0xffffff, rough=0.4, image=hair_img, coat=0.3)
    gs.mat('Brows', 0xffffff, rough=0.6, image=hair_img)
    _normal(bpy.data.materials['Hair'], image('hair_n.jpg'))


def _multiply(m):
    """Base colour = texture x colour (the glTF way: the exporter writes the colour as baseColorFactor)."""
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    nt.links.new(tex.outputs['Color'], mix.inputs[6])
    mix.inputs[7].default_value = bsdf.inputs['Base Color'].default_value
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])


def _normal(m, img):
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    img.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = 0.8
    nt.links.new(tex.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])


def assign_eyes(eyes):
    """Iris and pupil (the middle of the eye texture) get 'Eyes', tinted with the Look's eye colour; the white of
    the eye gets 'EyeWhite', left as it is."""
    eyes.data.materials.clear()
    eyes.data.materials.append(bpy.data.materials['EyeWhite'])
    eyes.data.materials.append(bpy.data.materials['Eyes'])
    uv = eyes.data.uv_layers.active
    for p in eyes.data.polygons:
        u = sum(uv.data[i].uv.x for i in p.loop_indices) / p.loop_total
        v = sum(uv.data[i].uv.y for i in p.loop_indices) / p.loop_total
        p.material_index = 1 if ((u - 0.5) ** 2 + (v - 0.5) ** 2) ** 0.5 < 0.13 else 0


def assign(o, mat_name):
    o.data.materials.clear()
    o.data.materials.append(bpy.data.materials[mat_name])
    for p in o.data.polygons:
        p.material_index = 0


def split_head(body, J):
    """Split the body at the neck: 'head' (the face and scalp, shared by every outfit) and the rest (dressed per outfit).
    The cut is a loop just under the jaw; both halves keep the original normals along it, so no seam shows."""
    neck = J['neck_01'][0]
    head_j = J['Head'][0]
    cut_z = neck.z + (head_j.z - neck.z) * 0.55
    bm = bmesh.new()
    bm.from_mesh(body.data)
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, cut_z), plane_no=(0, 0, 1))
    bm.to_mesh(body.data)
    bm.free()
    head = body.copy()
    head.data = body.data.copy()
    gs.link(head)
    head.name = head.data.name = 'head'
    for o, above in ((head, True), (body, False)):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        drop = [f for f in bm.faces if (f.calc_center_median().z > cut_z) != above or (above and abs(f.calc_center_median().x) > 0.3)]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        bm.to_mesh(o.data)
        bm.free()
    return head, cut_z


def keep_normals(dst, src):
    """Copy the unsplit body's smooth normals onto a split piece, so the neck seam never shows."""
    m = dst.modifiers.new('nt', 'DATA_TRANSFER')
    m.object = src
    m.use_loop_data = True
    m.data_types_loops = {'CUSTOM_NORMAL'}
    m.loop_mapping = 'POLYINTERP_NEAREST'
    gs.activate(dst)
    bpy.ops.object.modifier_move_to_index(modifier='nt', index=0)
    bpy.ops.object.modifier_apply(modifier='nt')


def enlarge_eyes(body, eyes, brows, factor=1.35, reach=2.3, open_lids=1.3):
    """Bigger, cuter eyes: the eyeballs grow about their centres, and the face around them (lids, lashes, brows)
    follows with a soft falloff, the way a stylized game face is drawn."""
    vs = [v.co for v in eyes.data.vertices]
    centres = []
    for s in (1, -1):
        side = [p for p in vs if p.x * s > 0]
        c = sum(side, Vector()) / len(side)
        r = (max(p.x for p in side) - min(p.x for p in side)) / 2
        centres.append((c, r))

    def warp(p, full=False):
        out = p.copy()
        for c, r in centres:
            R = r * reach
            d = (p - c).length
            if full and (p - c).length < r * 1.2:
                return c + (p - c) * factor
            if d < R and p.y < c.y + r:
                k = (1 - (d / R) ** 2) ** 2
                out = out + (p - c) * (factor - 1) * k
                if not full:
                    # open the lids: the skin around the eye stretches up and down a little more than sideways
                    out.z += (p.z - c.z) * (open_lids - 1) * k
        return out

    for v in eyes.data.vertices:
        v.co = warp(v.co, full=True)
    for o in (body, brows):
        for v in o.data.vertices:
            v.co = warp(v.co)
    for o in (body, eyes, brows):
        o.data.update()
