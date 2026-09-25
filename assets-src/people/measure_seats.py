"""
Measure the seated clips on the built rig, so the furniture fits them (run on the saved .blend):

    blender -b assets-src/out/people_fem.blend --python assets-src/people/measure_seats.py

For each seated clip, in Blender axes relative to the hips (the model origin): where the knees, heels and toes are,
the lowest point of the body under the hips (the seat's surface), the back's contact point, and the elbows and wrists
(armrests, the nail desk). Writes assets-src/out/manifest/seats.json.
"""
import json
import os

import bpy
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'out', 'seats.json')

arm = bpy.data.objects['rig']
body = bpy.data.objects['outfit_jumper']
ad = arm.animation_data
for t in ad.nla_tracks:
    t.mute = True
res = {}
for clip in ('sit_chair', 'sit_sofa', 'sit_stool', 'sit_pedicure', 'sleepy'):
    act = bpy.data.actions[clip]
    ad.action = act
    if act.slots:
        ad.action_slot = act.slots[0]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    P = lambda n, tail=False: (arm.pose.bones[n].tail if tail else arm.pose.bones[n].head).copy()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    vs = [ev.matrix_world @ v.co for v in ev.to_mesh().vertices]
    ev.to_mesh_clear()
    hips = P('pelvis')
    under = [v for v in vs if abs(v.x) < 0.12 and abs(v.y - hips.y) < 0.12]
    seat_z = min(v.z for v in under) if under else None
    back = [v for v in vs if abs(v.x) < 0.08 and hips.z + 0.1 < v.z < hips.z + 0.45]
    r = lambda v: [round(v.x, 3), round(v.y, 3), round(v.z, 3)]
    res[clip] = {
        'hips': r(hips), 'seat_z': round(seat_z, 3) if seat_z is not None else None,
        'back_y_max': round(max(v.y for v in back), 3) if back else None,
        'knee_l': r(P('calf_l')), 'ankle_l': r(P('foot_l')), 'toe_l': r(P('ball_l', True)), 'heel_z_min': round(min(v.z for v in vs), 3),
        'elbow_l': r(P('lowerarm_l')), 'wrist_l': r(P('hand_l')), 'head': r(P('Head')), 'shoulder_l': r(P('upperarm_l')),
        'y_min': round(min(v.y for v in vs), 3), 'y_max': round(max(v.y for v in vs), 3), 'x_max': round(max(v.x for v in vs), 3),
    }
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(res, open(OUT, 'w'), indent=1)
for k, v in res.items():
    print('SEAT', k, json.dumps(v))
