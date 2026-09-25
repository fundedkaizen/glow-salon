import { check, near } from './harness.ts'
import { Vector3 } from 'three'
import { COMPUTER_SPOT, DESK, FLOOR_H, FLOOR_W, SLOTS, SOFA_SEATS, spawnPoint, stationSpot, WALL_H } from '../src/core/floor.ts'
import { DEPTH_K, lenX, lenZ, ROOM3, toSim, toWorld, turnTo, UNITS_PER_M, wallHeight, yawFor } from '../src/render3d/mapping.ts'
import { CameraRig } from '../src/render3d/camera.ts'

/** The 3D floor's coordinate mapping and camera framing (the sim never changes; only how it is drawn). */
export function run() {
  // ---- mapping
  const o = toWorld(FLOOR_W / 2, WALL_H)
  near('the back wall centre is the origin (x)', o.x, 0)
  near('the back wall centre is the origin (z)', o.z, 0)
  const c = toWorld(0, FLOOR_H)
  near('the front left corner x', c.x, -ROOM3.w / 2)
  near('the front left corner z', c.z, ROOM3.d)
  near('room width in metres', ROOM3.w, FLOOR_W / UNITS_PER_M)
  near('room depth in metres', ROOM3.d, ((FLOOR_H - WALL_H) / UNITS_PER_M) * DEPTH_K)
  for (const p of [{ x: 0, y: 0 }, { x: 640, y: 400 }, { x: 1280, y: 800 }, { x: 213.7, y: 555.5 }]) {
    const w = toWorld(p.x, p.y)
    const b = toSim(w.x, w.z)
    near(`round trip x ${p.x}`, b.x, p.x, 1e-9)
    near(`round trip y ${p.y}`, b.y, p.y, 1e-9)
  }
  near('lenX matches the mapping', lenX(88), toWorld(88 + 640, 0).x - toWorld(640, 0).x, 1e-12)
  near('lenZ matches the mapping', lenZ(100), toWorld(0, 300).z - toWorld(0, 200).z, 1e-12)
  check('a person (1.7 m) is about as tall as the 2D floor draws one (128 units x 1.28)', Math.abs(1.7 * UNITS_PER_M - 128 * 1.28) < 20, 1.7 * UNITS_PER_M)
  // Everything the sim places inside the room lands inside the 3D room.
  const inside = (x: number, y: number) => { const w = toWorld(x, y); return w.x > -ROOM3.w / 2 && w.x < ROOM3.w / 2 && w.z > 0 && w.z < ROOM3.d }
  check('every station slot is inside the room', SLOTS.every(s => inside(s.x, s.y)))
  check('every work spot is inside the room', SLOTS.every((_, i) => { const p = stationSpot(i); return inside(p.x, p.y) }))
  check('sofa seats, the computer and the spawn points are inside', [...SOFA_SEATS, COMPUTER_SPOT, spawnPoint(0), spawnPoint(3)].every(p => inside(p.x, p.y)))
  check('the desk stands against the back wall', toWorld(DESK.x, DESK.y).z < 0.5)
  // Wall pieces hang between the floor and the top of the wall; higher on the 2D band means higher on the wall.
  check('wall height is inside the wall', [0, 40, 66, 120, 176].every(y => wallHeight(y) > 0.2 && wallHeight(y) < ROOM3.wallH))
  check('wall height falls as the band goes down', wallHeight(40) > wallHeight(66) && wallHeight(66) > wallHeight(120))
  // Facing: a model's front is +Z (towards the front of the room).
  near('walking down the screen faces the front', yawFor(0, 10), 0)
  near('walking right faces +X', yawFor(10, 0), Math.PI / 2)
  near('walking left faces -X', yawFor(-10, 0), -Math.PI / 2)
  near('walking up faces the back', Math.abs(yawFor(0, -10)), Math.PI)
  near('the short way round, across PI', turnTo(3, -3), 2 * Math.PI - 6, 1e-9)
  near('the short way round, small', turnTo(0.2, 0.5), 0.3, 1e-9)

  // ---- camera framing
  const rig = new CameraRig()
  const corners = [new Vector3(-ROOM3.w / 2, 0, 0), new Vector3(ROOM3.w / 2, 0, 0), new Vector3(-ROOM3.w / 2, 0, ROOM3.d), new Vector3(ROOM3.w / 2, 0, ROOM3.d)]
  const onScreen = (p: Vector3, m = 1.001) => { const v = p.clone().project(rig.camera); return Math.abs(v.x) <= m && Math.abs(v.y) <= m && v.z < 1 }
  // Desktop: the whole floor shows, under the HUD.
  rig.frame({ w: 1280, h: 800, top: 62, bottom: 12, side: 10 }, false)
  rig.update(1, toWorld(640, 500))
  check('desktop: the whole floor is on screen', corners.every(p => onScreen(p)))
  const yaw = rig.yaw, pitch = rig.pitch
  // Phone portrait: the room is followed; wherever the player walks, they stay on screen.
  rig.frame({ w: 390, h: 844, top: 110, bottom: 70, side: 10 }, false)
  const spots = [spawnPoint(0), COMPUTER_SPOT, ...SLOTS.map((_, i) => stationSpot(i)), { x: 60, y: 610 }, { x: 1240, y: 780 }]
  let allSeen = true
  for (const s of spots) {
    for (let i = 0; i < 90; i++) rig.update(1 / 30, toWorld(s.x, s.y))
    const w = toWorld(s.x, s.y)
    if (!onScreen(new Vector3(w.x, 0.9, w.z), 0.98)) allSeen = false
  }
  check('phone: the player stays on screen anywhere in the salon', allSeen)
  check('the camera never turns (fixed yaw and pitch)', rig.yaw === yaw && rig.pitch === pitch)
  // Phone portrait: the whole depth of the room fits (only sideways panning is needed).
  rig.update(1, toWorld(640, 500))
  const depth = [new Vector3(0, 0, 0.1), new Vector3(0, 0, ROOM3.d - 0.1)].map(p => p.clone().project(rig.camera).y)
  check('phone: the room is framed front to back', depth.every(y => Math.abs(y) <= 1.001), depth)
}
