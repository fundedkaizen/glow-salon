/**
 * The salon floor as plain data: where the walls, the sofa, the desk and the station slots are, and a grid
 * pathfinder so customers and players walk around the furniture. World units are pixels of a 1280 x 800 room.
 */
export const FLOOR_W = 1280
export const FLOOR_H = 800
/** The back wall ends here; the floor starts. */
export const WALL_H = 176

export type Rect = { x: number; y: number; w: number; h: number }
export type Pt = { x: number; y: number }

/** Customers come in and leave by the door on the left wall. */
export const DOOR: Pt = { x: -30, y: 610 }
export const DOOR_INSIDE: Pt = { x: 70, y: 610 }

/**
 * The reception desk stands out from the back wall, with a staff gap behind it: the computer's screen faces the
 * gap, the player uses it standing behind the desk, and customers come to the front.
 */
export const DESK = { x: 100, y: 256, w: 206, h: 80 }
const DESK_BOTTOM = DESK.y + DESK.h
/** Where a player stands to use the salon computer: behind the desk, facing the screen. */
export const COMPUTER_SPOT: Pt = { x: 200, y: 208 }

/**
 * Low partition walls with rounded ends that split the salon into zones. They block walking. The first closes
 * the staff gap behind the desk on the lounge side, so the gap is a nook entered from the door side only and
 * nobody cuts through behind the desk; the others divide the lounge from the stations (free-standing, so the
 * strip behind the station row stays connected), and the two station rows.
 */
export const PARTITIONS: Rect[] = [
  { x: 306, y: 176, w: 20, h: 130 },
  { x: 680, y: 232, w: 20, h: 60 },
  { x: 1112, y: 500, w: 168, h: 20 },
  // Behind the gap between the second and third chairs of the back row: the third chair's treatment nook.
  { x: 1062, y: 232, w: 20, h: 60 },
]

/**
 * Fixed furniture with a footprint (it blocks walking): two armchairs round a coffee table facing the sofa (the
 * lounge group, clear of the desk and of the way in from the door), and a little fountain planter in the front
 * right corner.
 */
export const FIXTURES: Record<'waiting' | 'planter', Rect> = {
  waiting: { x: 330, y: 405, w: 235, h: 100 },
  planter: { x: 1190, y: 702, w: 74, h: 86 },
}

export const SOFA = { x: 380, y: 196, w: 250, h: 92 }
export const SOFA_SEATS: Pt[] = [{ x: 420, y: 262 }, { x: 480, y: 262 }, { x: 540, y: 262 }, { x: 600, y: 262 }]
/** More customers than seats wait standing near the sofa. */
export const STANDING: Pt[] = [{ x: 385, y: 336 }, { x: 445, y: 340 }, { x: 505, y: 338 }, { x: 565, y: 340 }, { x: 620, y: 336 }]

/** Station slots: two rows of three on the right, then two more along the front of the salon. */
export const SLOTS: Pt[] = [
  { x: 760, y: 360 }, { x: 960, y: 360 }, { x: 1160, y: 360 },
  { x: 760, y: 610 }, { x: 960, y: 610 }, { x: 1160, y: 610 },
  { x: 330, y: 690 }, { x: 540, y: 690 },
]

/**
 * Where a player appears at the start of a day: in front of the reception desk, side by side. Far enough
 * down that the whole figure and its name tag stand clear of the desk (the tag sits about 60 px below it).
 */
export function spawnPoint(id: number): Pt {
  return { x: 306 + (Math.max(0, id) % 4) * 60, y: DESK_BOTTOM + 192 }
}
export const STATION_W = 150
export const STATION_H = 110

export function stationRect(slot: number): Rect {
  const p = SLOTS[slot]
  return { x: p.x - STATION_W / 2, y: p.y - STATION_H / 2, w: STATION_W, h: STATION_H }
}
/** Where the customer sits at a station. */
export function stationSeat(slot: number): Pt { const p = SLOTS[slot]; return { x: p.x + 10, y: p.y + 2 } }
/** Where a customer comes up to a station before sitting: in front of it, on the aisle side. */
export function stationFront(slot: number): Pt { const p = SLOTS[slot]; return { x: p.x + 10, y: p.y + (p.y < 500 ? STATION_H / 2 + 28 : -STATION_H / 2 - 28) } }
/** In front of the reception desk, where arriving customers say hello on the way to the sofa. */
export const DESK_FRONT: Pt = { x: DESK.x + DESK.w / 2 + 20, y: DESK.y + DESK.h + 40 }
/** Where the player stands to work at a station. */
export function stationSpot(slot: number): Pt { const p = SLOTS[slot]; return { x: p.x - 100, y: p.y + 30 } }

/** Fixed spots for decor props, by prop name. */
export const PROP_SPOTS: Record<string, Pt> = {
  plant: { x: 1215, y: 205 },
  candles: { x: 285, y: 205 },
  rug: { x: 420, y: 560 },
  lights: { x: 640, y: 30 },
  art: { x: 960, y: 70 },
  neon: { x: 505, y: 80 },
  aquarium: { x: 70, y: 420 },
  chandelier: { x: 640, y: 210 },
  // The fountain garden (a salon upgrade, unlocks.ts): the little planter in the front right corner grows into it.
  'up-fountain': { x: 1202, y: 734 },
}
export const PROP_BLOCK: Record<string, Rect> = {
  plant: { x: 1180, y: 190, w: 70, h: 60 },
  aquarium: { x: 40, y: 380, w: 70, h: 90 },
  'up-fountain': { x: 1140, y: 684, w: 124, h: 100 },
}

// ------------------------------------------------------------------ pathfinding
export const CELL = 32
export const COLS = Math.ceil(FLOOR_W / CELL)
export const ROWS = Math.ceil(FLOOR_H / CELL)

/** Which grid cells are blocked, given the stations' slots and the props. */
export function blockedGrid(slots: number[], props: string[]): Uint8Array {
  const grid = new Uint8Array(COLS * ROWS)
  const block = (r: Rect, pad = 6) => {
    const x0 = Math.max(0, Math.floor((r.x - pad) / CELL)), x1 = Math.min(COLS - 1, Math.floor((r.x + r.w + pad) / CELL))
    const y0 = Math.max(0, Math.floor((r.y - pad) / CELL)), y1 = Math.min(ROWS - 1, Math.floor((r.y + r.h + pad) / CELL))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * COLS + x] = 1
  }
  // Walls: the back wall and the room's edges.
  block({ x: 0, y: 0, w: FLOOR_W, h: WALL_H + 4 }, 0)
  block({ x: 0, y: FLOOR_H - 12, w: FLOOR_W, h: 12 }, 0)
  block({ x: FLOOR_W - 16, y: 0, w: 16, h: FLOOR_H }, 0)
  block(DESK)
  block(SOFA)
  for (const p of PARTITIONS) block(p, 4)
  for (const f of Object.values(FIXTURES)) block(f, 4)
  for (const slot of slots) if (slot >= 0 && slot < SLOTS.length) block(stationRect(slot), 4)
  for (const prop of props) if (PROP_BLOCK[prop]) block(PROP_BLOCK[prop])
  return grid
}

const cellOf = (p: Pt) => ({ cx: Math.max(0, Math.min(COLS - 1, Math.floor(p.x / CELL))), cy: Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / CELL))) })

/**
 * Nearest open cell to a point (a target inside furniture walks to its edge): the nearest, and among near ones the
 * one in front (larger y, the side seats and stations face) rather than a gap behind or beside the furniture.
 */
function openCellNear(grid: Uint8Array, p: Pt) {
  const { cx, cy } = cellOf(p)
  if (!grid[cy * COLS + cx]) return { cx, cy }
  for (let r = 1; r < 8; r++) {
    let best: { cx: number; cy: number } | null = null, bestD = Infinity
    for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || grid[y * COLS + x]) continue
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) - (y > cy ? 0.6 : 0)
      if (d < bestD) { bestD = d; best = { cx: x, cy: y } }
    }
    if (best) return best
  }
  return { cx, cy }
}

/**
 * How much each open cell costs to cross, besides its length: a lot right beside a wall or a piece of furniture,
 * a little one cell further out, nothing in the open. People then keep to the middle of the room and walk round
 * furniture with a little room to spare, instead of scraping along the wall behind the sofa. Cached per grid.
 */
const PENALTY = [0, 4, 0.5, 0.2]
const costs = new WeakMap<Uint8Array, Float32Array>()
export function costField(grid: Uint8Array): Float32Array {
  let c = costs.get(grid)
  if (c) return c
  // Distance (in cells, 8 directions) to the nearest blocked cell or the edge of the floor, by breadth-first rings.
  const dist = new Int16Array(COLS * ROWS).fill(-1)
  let ring: number[] = []
  for (let i = 0; i < COLS * ROWS; i++) if (grid[i]) { dist[i] = 0; ring.push(i) }
  for (let x = 0; x < COLS; x++) for (const y of [0, ROWS - 1]) { const i = y * COLS + x; if (dist[i] < 0) { dist[i] = 1; ring.push(i) } }
  for (let y = 0; y < ROWS; y++) for (const x of [0, COLS - 1]) { const i = y * COLS + x; if (dist[i] < 0) { dist[i] = 1; ring.push(i) } }
  while (ring.length) {
    const next: number[] = []
    for (const i of ring) {
      const x = i % COLS, y = (i / COLS) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
        const ni = ny * COLS + nx
        if (dist[ni] >= 0) continue
        dist[ni] = dist[i] + 1
        next.push(ni)
      }
    }
    ring = next
  }
  c = new Float32Array(COLS * ROWS)
  for (let i = 0; i < c.length; i++) c[i] = PENALTY[dist[i]] ?? 0
  costs.set(grid, c)
  return c
}

/**
 * Whether the straight line between two cells crosses no blocked cell, and in its middle no cell dearer than the
 * cheaper end (near each end, no dearer than that end): a shortcut never scrapes along furniture the path avoided.
 */
function clearLine(grid: Uint8Array, cost: Float32Array, a: number, b: number): boolean {
  const ax = (a % COLS) + 0.5, ay = ((a / COLS) | 0) + 0.5, bx = (b % COLS) + 0.5, by = ((b / COLS) | 0) + 0.5
  const len = Math.hypot(bx - ax, by - ay)
  const n = Math.ceil(len * 4)
  for (let k = 1; k < n; k++) {
    const t = k / n
    const limit = t * len < 1.5 ? cost[a] : (1 - t) * len < 1.5 ? cost[b] : Math.min(cost[a], cost[b])
    // The line and its two neighbours a third of a cell to each side, so the body does not clip corners.
    for (const o of [-0.3, 0, 0.3]) {
      const px = ax + (bx - ax) * t + o * (by - ay) / Math.max(1e-6, Math.hypot(bx - ax, by - ay)), py = ay + (by - ay) * t - o * (bx - ax) / Math.max(1e-6, Math.hypot(bx - ax, by - ay))
      const i = Math.floor(py) * COLS + Math.floor(px)
      if (grid[i] || cost[i] > limit) return false
    }
  }
  return true
}

/**
 * A* over the grid (8 directions, never cutting a corner), each step weighted by the cells' closeness to walls and
 * furniture (costField), so paths run through the open middle. The cells are then string-pulled into straight runs
 * across open floor. Returns waypoints from `from` to `to`, ending exactly at `to`. Deterministic, so the host and
 * every guest walk the same path.
 */
export function findPath(grid: Uint8Array, from: Pt, to: Pt): Pt[] {
  const start = openCellNear(grid, from), goal = openCellNear(grid, to)
  const cost = costField(grid)
  const idx = (x: number, y: number) => y * COLS + x
  const g = new Float32Array(COLS * ROWS).fill(Infinity)
  const came = new Int32Array(COLS * ROWS).fill(-1)
  const closed = new Uint8Array(COLS * ROWS)
  const open: number[] = [idx(start.cx, start.cy)]
  g[open[0]] = 0
  const h = (i: number) => { const x = i % COLS, y = (i / COLS) | 0; const dx = Math.abs(x - goal.cx), dy = Math.abs(y - goal.cy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy) }
  const goalIndex = idx(goal.cx, goal.cy)
  let found = false
  while (open.length) {
    let bi = 0, bf = Infinity
    for (let i = 0; i < open.length; i++) { const f = g[open[i]] + h(open[i]); if (f < bf) { bf = f; bi = i } }
    const cur = open[bi]
    open[bi] = open[open.length - 1]; open.pop()
    if (cur === goalIndex) { found = true; break }
    if (closed[cur]) continue
    closed[cur] = 1
    const x = cur % COLS, y = (cur / COLS) | 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
      const ni = idx(nx, ny)
      if (grid[ni] || closed[ni]) continue
      if (dx && dy && (grid[idx(x + dx, y)] || grid[idx(x, y + dy)])) continue
      const step = (dx && dy ? 1.414 : 1) * (1 + cost[ni])
      if (g[cur] + step < g[ni]) { g[ni] = g[cur] + step; came[ni] = cur; open.push(ni) }
    }
  }
  if (!found) return [to]
  const cells: number[] = []
  for (let c = goalIndex; c !== -1; c = came[c]) cells.push(c)
  cells.reverse()
  // String-pulling: from each corner, run straight to the furthest cell in clear view.
  const pts: Pt[] = []
  let i = 0
  while (i < cells.length - 1) {
    let j = cells.length - 1
    while (j > i + 1 && !clearLine(grid, cost, cells[i], cells[j])) j--
    if (j < cells.length - 1) pts.push({ x: (cells[j] % COLS) * CELL + CELL / 2, y: ((cells[j] / COLS) | 0) * CELL + CELL / 2 })
    i = j
  }
  // A goal inside furniture (a seat, a work spot tucked in): step up to its edge on open floor first.
  const end = cellOf(to)
  if (end.cx !== goal.cx || end.cy !== goal.cy) pts.push({ x: goal.cx * CELL + CELL / 2, y: goal.cy * CELL + CELL / 2 })
  pts.push(to)
  return pts
}

/** Move a point along a path by `step` pixels; returns the remaining path. */
export function walk(pos: Pt, path: Pt[], step: number): Pt[] {
  let left = step
  while (path.length && left > 0) {
    const next = path[0]
    const d = Math.hypot(next.x - pos.x, next.y - pos.y)
    if (d <= left) { pos.x = next.x; pos.y = next.y; left -= d; path = path.slice(1) }
    else { pos.x += ((next.x - pos.x) / d) * left; pos.y += ((next.y - pos.y) / d) * left; left = 0 }
  }
  return path
}
