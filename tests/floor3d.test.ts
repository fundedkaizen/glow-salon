import { check, near } from './harness.ts'
import { Vector3 } from 'three'
import { blockedGrid, CELL, COLS, COMPUTER_SPOT, DESK, DESK_FRONT, DOOR_INSIDE, stationFront, findPath, FLOOR_H, FLOOR_W, PARTITIONS, SLOTS, SOFA_SEATS, spawnPoint, STANDING, stationSeat, stationSpot, WALL_H, type Pt } from '../src/core/floor.ts'
import { DEPTH_K, lenX, lenZ, ROOM3, toSim, toWorld, turnTo, UNITS_PER_M, wallHeight, yawFor } from '../src/render3d/mapping.ts'
import { CameraRig } from '../src/render3d/camera.ts'
import { reachable } from './unlocks.test.ts'

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
  // ---- the reception: the desk stands out from the wall; the computer is used from behind it
  check('the desk stands out from the back wall, with a gap behind', DESK.y - WALL_H >= 64)
  check('the computer spot is behind the desk', COMPUTER_SPOT.y < DESK.y && COMPUTER_SPOT.x > DESK.x && COMPUTER_SPOT.x < DESK.x + DESK.w)
  const allSlots = SLOTS.map((_, i) => i)
  for (const [label, grid] of [['empty salon', blockedGrid([0], [])], ['full salon', blockedGrid(allSlots, ['plant', 'aquarium'])]] as const) {
    const cellOpen = (p: Pt) => !grid[Math.floor(p.y / CELL) * COLS + Math.floor(p.x / CELL)]
    check(`${label}: the computer spot is open floor`, cellOpen(COMPUTER_SPOT))
    // The player gets there from anywhere they start the day.
    const toPc = findPath(grid, spawnPoint(0), COMPUTER_SPOT)
    // findPath answers [to] alone when there is no way through.
    check(`${label}: a path from the spawn point to the computer`, toPc.length > 1 && toPc.every(p => p === COMPUTER_SPOT || cellOpen(p)), toPc)
    // Customers never cut through behind the desk: no path of theirs enters the staff gap.
    const behind = (p: Pt) => p.y < DESK.y && p.x > DESK.x - 4 && p.x < DESK.x + DESK.w + 4
    const trips: [Pt, Pt][] = []
    for (const seat of [...SOFA_SEATS, ...STANDING]) trips.push([DOOR_INSIDE, seat])
    for (const i of allSlots) { trips.push([DOOR_INSIDE, stationSeat(i)]); for (const seat of SOFA_SEATS) trips.push([seat, stationSeat(i)]); trips.push([stationSeat(i), DOOR_INSIDE]) }
    const cut = trips.filter(([a, b]) => findPath(grid, a, b).some(behind))
    check(`${label}: no customer route passes behind the desk`, cut.length === 0, cut.slice(0, 3))
    // Every seat and work spot can be reached from the door and from the lounge (no sealed pockets).
    const from = [DOOR_INSIDE, ...SOFA_SEATS, spawnPoint(0)]
    const to = [...allSlots.map(i => stationSeat(i)), ...allSlots.map(i => stationSpot(i)), ...SOFA_SEATS, ...STANDING, COMPUTER_SPOT]
    const sealed = from.flatMap(a => to.filter(b => !reachable(grid, a, b)).map(b => [a, b]))
    check(`${label}: every seat and work spot is reachable`, sealed.length === 0, sealed.slice(0, 3))
    // Staff and players still reach every station's work spot.
    check(`${label}: every work spot is reachable`, allSlots.every(i => { const w = stationSpot(i); const path = findPath(grid, spawnPoint(0), w); return path.length > 0 && cellOpen(path[Math.max(0, path.length - 2)]) }))
  }
  check('partitions stand inside the room', PARTITIONS.every(p => p.x >= 0 && p.x + p.w <= FLOOR_W && p.y >= WALL_H && p.y + p.h <= FLOOR_H))
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

  // ---- natural paths: people keep off the walls when there is an open way round (the cost field keeps them
  // off furniture too, as far as the aisles allow)
  const pathBad: string[] = []
  let pathChecked = 0
  // Day one, a middling salon and a full one (a full salon's aisles are narrow: there is often no open way round).
  for (const slots of [[0], [0, 1, 3], SLOTS.map((_, i) => i)]) {
    const all = slots
    const grid = blockedGrid(all, [])
    const idx = (p: Pt) => Math.floor(p.y / CELL) * COLS + Math.floor(p.x / CELL)
    // A wall cell: the room's walls (the back wall, the front, the sides) and the partitions.
    const wall = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= COLS || y >= FLOOR_H / CELL) return true
      const px = x * CELL + CELL / 2, py = y * CELL + CELL / 2
      if (py < WALL_H + 4 || py > FLOOR_H - 12 || px > FLOOR_W - 16 || px < 12) return true
      return PARTITIONS.some(r => px > r.x - 4 && px < r.x + r.w + 4 && py > r.y - 4 && py < r.y + r.h + 4)
    }
    // Cells right beside a wall: the ones to keep off.
    const hugs = (i: number) => { const x = i % COLS, y = (i / COLS) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (wall(x + dx, y + dy) && !grid[i]) return true; return false }
    // The nearest open cell to one inside furniture (a seat, a tucked-in work spot).
    const openNear = (i: number) => { if (!grid[i]) return i; let best = i, bd = Infinity; for (let j = 0; j < COLS * Math.ceil(FLOOR_H / CELL); j++) { if (grid[j]) continue; const d = Math.hypot((j % COLS) - (i % COLS), ((j / COLS) | 0) - ((i / COLS) | 0)); if (d < bd) { bd = d; best = j } } return best }
    // Shortest length over open cells (Dijkstra), optionally keeping off the hugging cells except near the ends.
    const shortest = (a: Pt, b: Pt, open: boolean) => {
      const n = COLS * Math.ceil(FLOOR_H / CELL), dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n)
      const s = openNear(idx(a)), t = openNear(idx(b)), near = (i: number) => Math.hypot((i % COLS) - (s % COLS), ((i / COLS) | 0) - ((s / COLS) | 0)) < 3.5 || Math.hypot((i % COLS) - (t % COLS), ((i / COLS) | 0) - ((t / COLS) | 0)) < 3.5
      dist[s] = 0
      for (;;) {
        let u = -1, best = Infinity
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i }
        if (u < 0 || u === t) break
        done[u] = 1
        const x = u % COLS, y = (u / COLS) | 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, v = ny * COLS + nx
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= COLS || v >= n || grid[v]) continue
          if (dx && dy && (grid[y * COLS + nx] || grid[ny * COLS + x])) continue
          if (open && hugs(v) && !near(v)) continue
          const d = dist[u] + (dx && dy ? 1.414 : 1)
          if (d < dist[v]) dist[v] = d
        }
      }
      return dist[t]
    }
    const len = (a: Pt, path: Pt[]) => { let l = 0, p = a; for (const q of path) { l += Math.hypot(q.x - p.x, q.y - p.y); p = q } return l / CELL }
    const trips: [string, Pt, Pt][] = []
    // Arrivals go door, desk front, sofa (salon.ts); called customers go sofa, station front, seat.
    trips.push(['door to the desk', DOOR_INSIDE, DESK_FRONT])
    for (const [i, seat] of SOFA_SEATS.entries()) trips.push([`desk to sofa ${i}`, DESK_FRONT, seat])
    for (const i of all) trips.push([`${all.length} stations: sofa to station ${i}`, SOFA_SEATS[1], stationFront(i)], [`${all.length} stations: start to work spot ${i}`, spawnPoint(0), stationSpot(i)])
    const bad = pathBad
    for (const [name, a, b] of trips) {
      const plain = shortest(a, b, false), open = shortest(a, b, true)
      if (process.env.PATH_DEBUG) console.log(name, plain.toFixed(1), open.toFixed(1))
      if (!Number.isFinite(open) || open > plain * 1.3) continue
      pathChecked++
      const path = findPath(grid, a, b)
      // Walk the path in small steps; away from its two ends, no point may lie in a cell hugging a wall or furniture.
      let p = a
      const total = len(a, path)
      let walked = 0
      for (const q of path) {
        const d = Math.hypot(q.x - p.x, q.y - p.y)
        for (let k = 0; k < d; k += 4) {
          const x = p.x + ((q.x - p.x) * k) / d, y = p.y + ((q.y - p.y) * k) / d, at = walked + k / CELL
          if (at > 2.5 && at < total - 2.5 && hugs(idx({ x, y }))) { bad.push(`${name} scrapes by (${Math.round(x)}, ${Math.round(y)})`); break }
        }
        walked += d / CELL
        p = q
      }
    }
    const arrive = findPath(grid, DOOR_INSIDE, SOFA_SEATS[0])
    check('paths: the same path every time (host and guests agree)', JSON.stringify(arrive) === JSON.stringify(findPath(grid, DOOR_INSIDE, SOFA_SEATS[0])))
  }
  check('paths: enough trips have an open route to compare', pathChecked >= 10, pathChecked)
  check('paths: no route runs along a wall when an open way exists within 30% longer', pathBad.length === 0, [...new Set(pathBad)].slice(0, 5))

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
  // Phone portrait: close in (people read at a good size) with the player near the middle of the screen.
  for (let i = 0; i < 90; i++) rig.update(1 / 30, toWorld(640, 500))
  let seen = 0, all = 0
  for (let x = 40; x < FLOOR_W; x += 80) for (let y = WALL_H + 20; y < FLOOR_H; y += 60) { all++; const w = toWorld(x, y); if (onScreen(new Vector3(w.x, 0, w.z))) seen++ }
  check('phone: close in (a fifth to three fifths of the floor at once)', seen / all >= 0.2 && seen / all <= 0.6, seen / all)
  const mid = new Vector3(toWorld(640, 500).x, 0.9, toWorld(640, 500).z).project(rig.camera)
  check('phone: the player is near the middle of the screen', Math.abs(mid.x) < 0.25 && Math.abs(mid.y) < 0.3, { x: mid.x, y: mid.y })
}
