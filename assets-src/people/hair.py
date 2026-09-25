"""
Hair helpers shared by the hair styles (ubc_hair.py): the accessories that sit on a hair style's own surface (the bow
and the flower clip), and the boolean cutters the made-here pieces use.
"""
import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import gs


def _box_below(C, z, y_from=-0.5):
    """A cutter taking away everything below z (and behind y_from)."""
    return gs.box('below', (1.0, 1.0, 1.0), loc=(0, y_from + 0.5, C.z + z - 1.0))


def _boolean(obj, cutters):
    for cutter in cutters:
        m = obj.modifiers.new('cut', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.object = cutter
        m.solver = 'EXACT'
        gs.apply_all(obj)
        bpy.data.objects.remove(cutter)
    return obj


def surface_point(obj, origin: Vector, toward: Vector) -> Vector:
    """Where a ray from outside toward a point first meets the mesh."""
    bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    d = (toward - origin).normalized()
    hit = bvh.ray_cast(origin, d)
    return hit[0] if hit[0] is not None else toward


def bow(name, at: Vector, normal: Vector):
    """A two-loop bow, its knot on the hair surface."""
    parts = []
    for s in (1, -1):
        parts.append(gs.ellipsoid('loop', Vector((s * 0.03, 0, 0.004)), (0.03, 0.012, 0.019), rot=(0, s * 18, 0), seg=10, rings=6))
    parts.append(gs.uv_sphere('knot', 0.013, 8, 6))
    for s in (1, -1):
        parts.append(gs.ellipsoid('tail', Vector((s * 0.012, 0.002, -0.022)), (0.008, 0.005, 0.02), rot=(0, s * 25, 0), seg=6, rings=4))
    o = gs.join(parts, name)
    gs.set_mats(o, ['Accessory'])
    _orient(o, at, normal)
    gs.shade_smooth(o)
    return o


def flower(name, at: Vector, normal: Vector):
    parts = []
    for i in range(5):
        a = 2 * math.pi * i / 5
        p = gs.ellipsoid('petal', Vector((math.cos(a) * 0.017, 0, math.sin(a) * 0.017)), (0.015, 0.006, 0.013), rot=(0, -math.degrees(a), 0), seg=8, rings=5)
        parts.append(p)
    o = gs.join(parts, name)
    gs.set_mats(o, ['Accessory'])
    c = gs.uv_sphere('centre', 0.008, 8, 4, loc=(0, -0.004, 0))
    gs.set_mats(c, ['FlowerCentre'])
    o = gs.join([o, c], name)
    _orient(o, at, normal)
    gs.shade_smooth(o)
    return o


def _orient(o, at, normal):
    """Turn the part so its -Y faces out along the surface normal, and sit it on the point."""
    q = (-normal).to_track_quat('Y', 'Z')
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = q
    o.location = at + normal * 0.004
    gs.apply_all(o)
