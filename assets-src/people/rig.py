"""
The people's skeleton tools: the Universal Animation Library clips (CC0) loaded onto the UBC rig (the same bone
names), and the pose tools the authored clips use.
"""
import math
import os

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
UAL = os.path.join(os.path.dirname(HERE), 'vendor', 'ual', 'UAL1_Standard.glb')

# The bones we keep (the finger chains go: a mitten hand reads better at floor scale and halves the animation data).
KEEP = ['root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head',
        'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
        'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']

# Mocap clips we reuse, by their Quaternius names.
MOCAP = {'idle': 'Idle_Loop', 'walk': 'Walk_Loop', 'sit_base': 'Sitting_Idle_Loop', 'talk': 'Idle_Talking_Loop',
         'interact': 'Interact', 'jump': 'Jump_Start', 'dance': 'Dance_Loop', 'sit_talk': 'Sitting_Talking_Loop'}


def channelbags(act):
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.append(cb)
    return out


def fcurves(act):
    return [fc for cb in channelbags(act) for fc in cb.fcurves]


def bone_of(fc):
    p = fc.data_path
    return p.split('"')[1] if p.startswith('pose.bones["') else None


def load_mocap(arm, keep=None):
    """Import the UAL clips for an armature with the same bone names (the UBC bodies): keep the named clips, only
    our bones, rotations (and the pelvis position); drop the UAL armature."""
    keep = keep or set(MOCAP.values())
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=UAL)
    for o in [o for o in bpy.data.objects if o not in before]:
        bpy.data.objects.remove(o)
    mine = [a for a in bpy.data.actions if a not in acts_before]
    for a in list(mine):
        if a.name.split('.')[0] not in keep:
            mine.remove(a)
            bpy.data.actions.remove(a)
    for a in mine:
        for cb in channelbags(a):
            for fc in list(cb.fcurves):
                b = bone_of(fc)
                if b not in KEEP or fc.data_path.endswith('.scale') or (fc.data_path.endswith('.location') and b not in ('root', 'pelvis')):
                    cb.fcurves.remove(fc)
        a.use_fake_user = True
    arm['mocap'] = {a.name.split('.')[0]: a.name for a in mine}
    return mine


def joints(arm):
    """Rest-pose joint positions (armature space) by bone name: head, tail."""
    return {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}


# ---------------------------------------------------------------------------------------------- posing

def rest_q(arm, name) -> Quaternion:
    return arm.data.bones[name].matrix_local.to_quaternion()


def local_q(arm, name, rot_world: Quaternion) -> Quaternion:
    """A rotation given in the armature's rest frame, as the bone's local pose rotation."""
    r = rest_q(arm, name)
    return r.conjugated() @ rot_world @ r


def euler_q(x=0.0, y=0.0, z=0.0) -> Quaternion:
    """Degrees about the armature axes (X: the character's left, Y: back, Z: up), applied X then Y then Z."""
    return Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion()


class Aim(tuple):
    """A pose value that points the bone along a world (armature space) direction, whatever its parents do."""


def aim(x, y, z):
    return Aim((x, y, z))


def set_pose(arm, pose: dict, base: dict | None = None):
    """
    pose: bone -> (x, y, z) degrees in the rest frame, relative to the parent (plain forward kinematics), or
    aim(x, y, z) to point the bone along a direction; plus 'hips': (x, y, z) metres for the pelvis position relative
    to the rig origin. base: another pose underneath (a pose's own entry for a bone replaces the base's).
    """
    merged = dict(base or {})
    merged.update(pose)
    acc = {}  # the rotation each bone has picked up relative to its rest (armature axes), parents first
    for b in arm.data.bones:  # bones come parents-first
        name = b.name
        parent = acc.get(b.parent.name, Quaternion()) if b.parent else Quaternion()
        v = merged.get(name)
        if isinstance(v, Aim):
            rest_dir = (b.tail_local - b.head_local).normalized()
            now = parent @ rest_dir
            world = now.rotation_difference(Vector(v).normalized()) @ parent
            rc = parent.inverted() @ world
        elif v is not None:
            rc = euler_q(*v)
        else:
            rc = Quaternion()
        acc[name] = parent @ rc
        pb = arm.pose.bones[name]
        pb.rotation_quaternion = local_q(arm, name, rc)
        pb.location = Vector()
    hips = pose.get('hips', (base or {}).get('hips'))
    if hips is not None:
        pb = arm.pose.bones['pelvis']
        rest = arm.data.bones['pelvis'].head_local
        # pose location is in the bone's rest frame
        m = arm.data.bones['pelvis'].matrix_local.to_3x3().inverted()
        pb.location = m @ (Vector(hips) - rest)


def key_pose(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
        if pb.name == 'pelvis':
            pb.keyframe_insert('location', frame=frame, group=pb.name)


def new_action(arm, name):
    a = bpy.data.actions.new(name)
    a.use_fake_user = True
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = a
    return a


def author(arm, name, frames: list[tuple[int, dict]], base=None, cyclic=True, interp='BEZIER'):
    """Key a clip from (frame, pose) pairs."""
    a = new_action(arm, name)
    for f, p in frames:
        set_pose(arm, p, base)
        key_pose(arm, f)
    for fc in fcurves(a):
        for k in fc.keyframe_points:
            k.interpolation = interp
    arm.animation_data.action = None
    return a


def world_pos(arm, bone, frame=None, action=None):
    """Where a bone's head is (armature space) in the current pose."""
    if action is not None:
        arm.animation_data.action = action
    if frame is not None:
        bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    return arm.pose.bones[bone].head.copy()

