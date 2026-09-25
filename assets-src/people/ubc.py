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
    'fem': dict(leg=(0.9, 0.8), arm=(0.84, 0.85), head=2.25, chest=(0.94, 0.94), smooth=10),
    'masc': dict(leg=(0.86, 0.81), arm=(0.76, 0.85), head=2.15, chest=(0.86, 0.9), smooth=12),
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
    gs.mat('Eyes', 0x6a9fd0, rough=0.08, image=eye)
    gs.mat('EyeWhite', 0xffffff, rough=0.08, image=eye)
    _multiply(bpy.data.materials['Eyes'])
    gs.mat('EyeShine', 0xffffff, rough=0.2, emit=0xffffff)
    gs.mat('Lashes', 0x2e2228, rough=0.5)
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
        p.material_index = 1 if ((u - 0.5) ** 2 + (v - 0.5) ** 2) ** 0.5 < 0.215 else 0


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
                    # open the lids: the skin around the eye stretches up and down a little more than sideways, and
                    # the upper lid lifts further (round, open cartoon eyes rather than a sleepy lid)
                    out.z += (p.z - c.z) * (open_lids - 1) * k
                    if p.z > c.z:
                        out.z += (p.z - c.z) * 0.45 * k
        return out

    for v in eyes.data.vertices:
        v.co = warp(v.co, full=True)
    for o in (body, brows):
        for v in o.data.vertices:
            v.co = warp(v.co)
    for o in (body, eyes, brows):
        o.data.update()


def eye_centres(eyes):
    vs = [v.co for v in eyes.data.vertices]
    out = []
    for s in (1, -1):
        side = [p for p in vs if p.x * s > 0]
        c = sum(side, Vector()) / len(side)
        r = (max(p.x for p in side) - min(p.x for p in side)) / 2
        out.append((c, r, s))
    return out


def eye_extras(eyes, lashes=True):
    """A white catchlight card on each eye (emissive, so it reads at game size and the iris tint never colours it) and,
    on the feminine faces, a dark lash line along each upper lid with a flick at the outer corner."""
    shine, lash = [], []
    for c, r, s in eye_centres(eyes):
        # the catchlight: up and to the viewer's left on both eyes, on the eyeball's surface
        dx, dz = -0.32 * r, 0.34 * r
        dy = -math.sqrt(max(0.0, (r * 1.02) ** 2 - dx * dx - dz * dz))
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, segments=10, radius=r * 0.17)
        o = gs.mesh_obj('shine', bm)
        o.rotation_euler = (math.radians(90), 0, 0)
        o.location = c + Vector((dx, dy - 0.0008, dz))
        gs.apply_all(o)
        gs.set_mats(o, ['EyeShine'])
        shine.append(o)
        if lashes:
            bm = bmesh.new()
            rows = []
            n = 9
            for i in range(n + 1):
                t = i / n
                a = math.radians(160 - 140 * t) if s > 0 else math.radians(20 + 140 * t)
                x, z = math.cos(a) * r * 1.0, math.sin(a) * r * 0.62 + r * 0.12
                y = -math.sqrt(max(0.0, (r * 1.12) ** 2 - x * x - (z - r * 0.1) ** 2))
                outer = (x * s) > 0.6 * r
                h = r * (0.14 + (0.22 if outer else 0.0) * max(0.0, (x * s / r - 0.6) / 0.4))
                p0 = c + Vector((x, y, z))
                p1 = c + Vector((x * (1.08 if outer else 1.0), y - r * 0.05, z + h))
                rows.append((bm.verts.new(p0), bm.verts.new(p1)))
            for (a0, b0), (a1, b1) in zip(rows, rows[1:]):
                bm.faces.new((a0, a1, b1, b0))
            o = gs.mesh_obj('lash', bm)
            sol = o.modifiers.new('sol', 'SOLIDIFY')
            sol.thickness = 0.0015
            gs.apply_all(o)
            gs.set_mats(o, ['Lashes'])
            lash.append(o)
    return shine, lash


def lighten_sockets(head, eyes, kind, radius=0.05, amount=0.6):
    """Lift the painted dark shading round the eyes in the face texture, so the eyes never sit in dark holes."""
    import numpy as np
    img = bpy.data.materials['Skin'].node_tree.nodes['Image Texture'].image
    uv = head.data.uv_layers.active
    spots = []
    for c, r, s in eye_centres(eyes):
        best = None
        for p in head.data.polygons:
            d = (p.center - c).length
            if p.center.y < c.y and (best is None or d < best[0]):
                best = (d, p)
        p = best[1]
        u = sum(uv.data[i].uv.x for i in p.loop_indices) / p.loop_total
        v = sum(uv.data[i].uv.y for i in p.loop_indices) / p.loop_total
        spots.append((u, v))
    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    yy, xx = np.mgrid[0:H, 0:W]
    for u, v in spots:
        d = np.sqrt((xx - u * W) ** 2 + (yy - v * H) ** 2) / (radius * W)
        k = np.clip(1 - d * d, 0, 1) ** 2 * amount
        target = 0.86
        for ch in range(3):
            c = px[:, :, ch]
            px[:, :, ch] = np.where(c < target, c + (target - c) * k, c)
    img.pixels[:] = px.ravel()
    path = os.path.join(TEX, f'skin_{kind}_lit.jpg')
    img.filepath_raw = path
    img.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.quality = 88
    img.save()
    return spots


def soften_brows(brows, lift=0.007, thin=0.65):
    """Friendlier brows: thinner and a little higher (the sculpted ones sit low and heavy, which reads as a frown)."""
    for s in (1, -1):
        vs = [v for v in brows.data.vertices if v.co.x * s > 0]
        if not vs:
            continue
        cz = sum(v.co.z for v in vs) / len(vs)
        for v in vs:
            v.co.z = cz + (v.co.z - cz) * thin + lift
    brows.data.update()
