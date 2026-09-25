"""
The people's animation clips, named as the asset contract asks:

  walk                            Quaternius UAL mocap (CC0), in place (no root motion)
  idle, talk                      standing relaxed; chatting with one hand (the UAL idle is a hero's stance)
  sit_chair                       reclined in the facial chair, the legs forward along the leg rest
  sit_sofa, sit_stool             sunk into the sofa; perched on the nail stool with the hands forward on the desk
  sit_pedicure                    upright on the pedicure throne, the feet down in the basin
  work                            standing, hands busy at waist height
  wave, cheer                     a friendly wave; a happy hop with the arms up
  sleepy                          seated on the sofa, the head lolling

Every seated clip (sit_* and sleepy) puts the hips (the pelvis joint) exactly on the model's origin, facing the
model's front: the floor engine puts the character's origin on a station's `seat` node and turns it to face the
node's front. Poses are forward kinematics in degrees about the rig's rest axes (rig.set_pose): X is the character's
left, so +X bends a limb that hangs down backward and a spine bone forward; Y turns an arm down or up; Z swings an arm
forward or back.
"""
import math

import bpy

import rig

FPS = 30

def seated(pelvis_x, thigh, calf, foot=0.0, spine=(4, 3, 2), head=0.0, arms=None, spread=6):
    """A seated pose: pelvis lean (negative leans back), thigh and calf angles (the world angle of the thigh is
    pelvis_x + thigh; -90 is level and forward), toes (negative lifts them), and the arms."""
    p = {'hips': (0.0, 0.0, 0.0), 'pelvis': (pelvis_x, 0, 0),
         'spine_01': (spine[0], 0, 0), 'spine_02': (spine[1], 0, 0), 'spine_03': (spine[2], 0, 0),
         'neck_01': (head * 0.4, 0, 0), 'Head': (head * 0.6, 0, 0),
         'thigh_l': (thigh, 0, -spread), 'thigh_r': (thigh, 0, spread),
         'calf_l': (calf, 0, 0), 'calf_r': (calf, 0, 0), 'foot_l': (foot, 0, 0), 'foot_r': (foot, 0, 0)}
    p.update(arms or {})
    return p


aim = rig.aim


def arms(upper, lower, hand=(0, 0, 0)):
    """Both arms from the left arm's directions (x is mirrored for the right)."""
    ux, uy, uz = upper
    lx, ly, lz = lower
    hx, hy, hz = hand
    return {'upperarm_l': aim(ux, uy, uz), 'upperarm_r': aim(-ux, uy, uz), 'lowerarm_l': aim(lx, ly, lz), 'lowerarm_r': aim(-lx, ly, lz),
            'hand_l': (hx, hy, hz), 'hand_r': (hx, -hy, -hz)}


def lap_arms():
    """Hands resting together on the lap."""
    return arms((0.2, -0.3, -0.93), (-0.45, -0.85, -0.28), (0, 12, 0))


def rest_arms(back=0.1):
    """Forearms along armrests."""
    return arms((0.34, back, -0.94), (0.06, -1.0, -0.06), (0, 6, 0))


def desk_arms():
    """Both hands forward on a desk at about elbow height, palms down, for the manicure."""
    return arms((0.18, -0.5, -0.85), (-0.2, -0.98, 0.02), (0, -6, 0))


POSES = {
    # sunk into the sofa: leaning back, knees a touch higher than the hips, feet on the floor a little forward
    'sit_sofa': seated(-14, -80, 84, foot=-4, spine=(3, 2, 2), head=6, arms=lap_arms()),
    # perched upright on the nail stool, hands forward on the desk
    'sit_stool': seated(-2, -86, 88, foot=0, spine=(4, 3, 2), head=8, arms=desk_arms(), spread=8),
    # reclined in the facial chair: the back at about 35 degrees, thighs a little above level, shins along the leg rest
    'sit_chair': seated(-36, -64, 24, foot=-28, spine=(2, 1, -2), head=12, arms=rest_arms(0.25), spread=4),
    # upright on the pedicure throne, shins down and forward into the basin
    'sit_pedicure': seated(-6, -84, 64, foot=6, spine=(3, 2, 2), head=6, arms=rest_arms(0.05), spread=7),
}


def breathe(base, amount=1.5, head=2.0):
    """Two keys of a slow breath on top of a pose (a looped clip of 3 s)."""
    a = dict(base)
    b = dict(base)
    for k, d in (('spine_02', amount), ('spine_03', amount * 0.8)):
        x, y, z = b.get(k, (0, 0, 0))
        b[k] = (x - d, y, z)
    x, y, z = b.get('Head', (0, 0, 0))
    b['Head'] = (x - head * 0.5, y + head * 0.3, z + head)
    return [(0, a), (45, b), (90, a)]


# How much of the mocap's upper-body lean to keep: the realistic idle droops the spine, neck and head forward, which
# on our big-headed people seen from above hides the face. Keep the sway, lose most of the droop, lift the chin.
UPRIGHT = {'spine_02': 0.7, 'spine_03': 0.45, 'neck_01': 0.35, 'Head': 0.35}
CHIN_UP = -12.0


def chin_up(keys, deg=-14.0):
    """Lift every key's chin a little: the floor camera looks down at people, so their faces tilt up to it."""
    out = []
    for f, p in keys:
        p = dict(p)
        x, y, z = p.get('Head', (0, 0, 0))
        p['Head'] = (x + deg, y, z)
        out.append((f, p))
    return out


def straighten(arm, act, keep=UPRIGHT, chin=CHIN_UP):
    from mathutils import Quaternion
    by_bone = {}
    for fc in rig.fcurves(act):
        b = rig.bone_of(fc)
        if b in keep and fc.data_path.endswith('rotation_quaternion'):
            by_bone.setdefault(b, {})[fc.array_index] = fc
    lift = rig.local_q(arm, 'Head', rig.euler_q(chin, 0, 0))
    for b, chans in by_bone.items():
        if len(chans) != 4:
            continue
        n = len(chans[0].keyframe_points)
        for i in range(n):
            q = Quaternion([chans[c].keyframe_points[i].co[1] for c in range(4)])
            q = Quaternion().slerp(q, keep[b])
            if b == 'Head':
                q = lift @ q
            for c in range(4):
                k = chans[c].keyframe_points[i]
                k.co[1] = q[c]
                k.handle_left[1] = q[c]
                k.handle_right[1] = q[c]
        for c in range(4):
            chans[c].update()


RELAXED = {'upperarm_l': aim(0.2, 0.06, -1), 'upperarm_r': aim(-0.2, 0.06, -1), 'lowerarm_l': aim(0.07, -0.2, -1),
           'lowerarm_r': aim(-0.07, -0.2, -1), 'hand_l': (0, 8, 0), 'hand_r': (0, -8, 0), 'thigh_l': (0, 0, -2), 'thigh_r': (0, 0, 2)}


def gentle_idle(arm):
    """Standing relaxed (the mocap idle is a hero's fists-and-wide-stance): arms loose at the sides with a slight bend,
    a slow breath, the weight swaying a touch from hip to hip, the chin up to the camera."""
    keys = []
    for f, t in ((0, 0.0), (45, 1.0), (90, 0.0)):
        p = dict(RELAXED)
        p.update({'pelvis': (0, 1.6 * (2 * t - 1), 0), 'spine_01': (0, -1.0 * (2 * t - 1), 0), 'spine_03': (-1.2 * t, 0, 0),
                  'Head': (-16 + 1.5 * t, 1.5 * (2 * t - 1), 2 * (2 * t - 1)), 'neck_01': (-4, 0, 0),
                  'upperarm_l': aim(0.2, 0.06 - 0.02 * t, -1), 'upperarm_r': aim(-0.2, 0.06 - 0.02 * t, -1)})
        keys.append((f, p))
    return rig.author(arm, 'idle', keys)


def gentle_talk(arm):
    """Chatting: the relaxed stance, one hand talking, little nods."""
    keys = []
    for f, (fx, fz, nod) in ((0, (-0.12, -0.35, 0)), (20, (-0.18, -0.1, 4)), (40, (-0.1, -0.45, -1)), (60, (-0.2, -0.05, 3)), (80, (-0.12, -0.35, 0))):
        p = dict(RELAXED)
        p.update({'upperarm_r': aim(-0.22, -0.25, -1), 'lowerarm_r': aim(fx, -0.9, fz), 'hand_r': (0, -14, 0),
                  'Head': (-15 + nod, -3, 3), 'neck_01': (-4, 0, 0), 'spine_03': (0, 0, -2)})
        keys.append((f, p))
    return rig.author(arm, 'talk', keys)


def build_all(arm, gentle=False):
    """Author every clip on the rig; rename the mocap. Returns {name: action}."""
    clips = {}
    moc = dict(arm['mocap'])
    mocap = (('walk', 'Walk_Loop'),) if gentle else (('idle', 'Idle_Loop'), ('walk', 'Walk_Loop'), ('talk', 'Idle_Talking_Loop'))
    for ours, theirs in mocap:
        a = bpy.data.actions[moc[theirs]]
        a.name = ours
        straighten(arm, a, UPRIGHT if ours != 'walk' else {'spine_02': 0.8, 'spine_03': 0.6, 'neck_01': 0.4, 'Head': 0.4})
        clips[ours] = a
    if gentle:
        clips['idle'] = gentle_idle(arm)
        clips['talk'] = gentle_talk(arm)
        for n in list(moc.values()):
            a = bpy.data.actions.get(n)
            if a is not None and a not in clips.values():
                bpy.data.actions.remove(a)
    for name, pose in POSES.items():
        clips[name] = rig.author(arm, name, chin_up(breathe(pose)))
    # sleepy: on the sofa, the head drooping and lolling slowly side to side, a deep slow breath
    s = POSES['sit_sofa']
    keys = []
    for f, (hx, hy, hz, sp) in ((0, (26, 8, 6, 0)), (40, (32, -2, -4, -2)), (80, (24, -9, -8, 0)), (120, (30, 2, 3, -2)), (160, (26, 8, 6, 0))):
        p = dict(s)
        p['Head'] = (hx, hy, hz)
        p['neck_01'] = (10, 0, 0)
        p['spine_03'] = (2 + sp, 0, 0)
        keys.append((f, p))
    clips['sleepy'] = rig.author(arm, 'sleepy', keys)  # asleep: the head droops, no lift
    # work: standing, leaning in a touch, both hands at waist height, working in small alternating strokes
    keys = []
    for i, f in enumerate(range(0, 61, 10)):
        ph = 2 * math.pi * f / 60
        s1, s2 = math.sin(ph), math.sin(ph + math.pi)
        p = {'spine_01': (4, 0, 0), 'spine_02': (3, 0, 0), 'spine_03': (1, 0, 0), 'Head': (4, 0, 0), 'neck_01': (2, 0, 0),
             'upperarm_l': aim(0.22, -0.32 + 0.05 * s1, -0.92), 'upperarm_r': aim(-0.22, -0.32 + 0.05 * s2, -0.92),
             'lowerarm_l': aim(-0.28 + 0.12 * s1, -0.94, -0.12 + 0.1 * math.cos(ph)), 'lowerarm_r': aim(0.28 - 0.12 * s2, -0.94, -0.12 + 0.1 * math.cos(ph + math.pi)),
             'hand_l': (0, -10, 0), 'hand_r': (0, 10, 0), 'thigh_l': (0, 0, -3), 'thigh_r': (0, 0, 3)}
        keys.append((f, p))
    clips['work'] = rig.author(arm, 'work', chin_up(keys, -6))
    # wave: the right arm up, the forearm swinging side to side, a little lean
    keys = []
    for f, sw in ((0, 0), (8, 1), (16, -1), (24, 1), (32, -1), (40, 0)):
        p = dict(RELAXED)
        p.update({'upperarm_r': (0, 58, 12), 'lowerarm_r': (0, 38 + 22 * sw, 0), 'hand_r': (0, 10 * sw, 0), 'hand_l': (0, 8, 0),
                  'spine_03': (0, -3, 0), 'Head': (0, -4, 4), 'thigh_l': (0, 0, -3), 'thigh_r': (0, 0, 3)})
        keys.append((f, p))
    clips['wave'] = rig.author(arm, 'wave', chin_up(keys))
    # cheer: crouch, hop with both arms up, land, bounce
    rest = arm.data.bones['pelvis'].head_local.copy()
    def hop(dz, knee, arms_up, toes=0):
        th = -knee * 0.6
        p = {'hips': (rest.x, rest.y, rest.z + dz), 'thigh_l': (th, 0, -4), 'thigh_r': (th, 0, 4), 'calf_l': (knee, 0, 0), 'calf_r': (knee, 0, 0),
             'foot_l': (-knee * 0.4 + toes, 0, 0), 'foot_r': (-knee * 0.4 + toes, 0, 0), 'spine_01': (knee * 0.12, 0, 0)}
        if arms_up:
            p.update({'upperarm_l': (0, -58, -10), 'upperarm_r': (0, 58, 10), 'lowerarm_l': (0, -20, 0), 'lowerarm_r': (0, 20, 0), 'Head': (-8, 0, 0)})
        else:
            p.update({'upperarm_l': (0, 50, 10), 'upperarm_r': (0, -50, -10), 'lowerarm_l': (0, 0, -40), 'lowerarm_r': (0, 0, 40)})
        return p
    clips['cheer'] = rig.author(arm, 'cheer', [(0, hop(-0.05, 50, False)), (6, hop(0.12, 0, True, 18)), (11, hop(0.14, 4, True, 14)),
                                               (17, hop(-0.04, 44, True)), (23, hop(0.0, 10, True)), (30, hop(-0.05, 50, False))])
    # sit_down / stand_up: from standing in front of a sofa-height seat to sit_sofa (0.6 s), and back. Played like the
    # seated clips, with the origin on the seat node: the feet start on the floor sofa-height below the hips.
    rest = arm.data.bones['pelvis'].head_local.copy()
    below = 0.354  # PEOPLE.hipsAboveFeet.sit_sofa (the measured sofa seat)
    stand = dict(RELAXED)
    stand['hips'] = (0.0, -0.3, rest.z - below)
    mid = dict(POSES['sit_sofa'])
    mid.update({'hips': (0.0, -0.16, 0.08), 'pelvis': (22, 0, 0), 'spine_02': (8, 0, 0), 'thigh_l': (-100, 0, -6), 'thigh_r': (-100, 0, 6),
                'calf_l': (80, 0, 0), 'calf_r': (80, 0, 0)})
    seat = POSES['sit_sofa']
    clips['sit_down'] = rig.author(arm, 'sit_down', chin_up([(0, stand), (9, mid), (18, seat)]))
    clips['stand_up'] = rig.author(arm, 'stand_up', chin_up([(0, seat), (9, mid), (18, stand)]))
    return clips


def seated_clips():
    return ['sit_chair', 'sit_sofa', 'sit_stool', 'sit_pedicure', 'sleepy']
