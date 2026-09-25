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
 * nobody cuts through behind the desk; the others divide the lounge from the stations, and the two station rows.
 */
export const PARTITIONS: Rect[] = [
  { x: 306, y: 176, w: 20, h: 130 },
  { x: 680, y: 176, w: 20, h: 96 },
  { x: 1112, y: 500, w: 168, h: 20 },
]

export const SOFA = { x: 380, y: 196, w: 250, h: 92 }
export const SOFA_SEATS: Pt[] = [{ x: 420, y: 262 }, { x: 480, y: 262 }, { x: 540, y: 262 }, { x: 600, y: 262 }]
/** More customers than seats wait standing near the sofa. */
export const STANDING: Pt[] = [{ x: 360, y: 350 }, { x: 430, y: 360 }, { x: 500, y: 355 }, { x: 570, y: 360 }, { x: 640, y: 350 }]

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
  return { x: 180 + (Math.max(0, id) % 4) * 60, y: DESK_BOTTOM + 192 }
}
export const STATION_W = 150
export const STATION_H = 110

export function stationRect(slot: number): Rect {
  const p = SLOTS[slot]
  return { x: p.x - STATION_W / 2, y: p.y - STATION_H / 2, w: STATION_W, h: STATION_H }
}
/** Where the customer sits at a station. */
export function stationSeat(slot: number): Pt { const p = SLOTS[slot]; return { x: p.x + 10, y: p.y + 2 } }
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
}
const PROP_BLOCK: Record<string, Rect> = {
  plant: { x: 1180, y: 190, w: 70, h: 60 },
  aquarium: { x: 40, y: 380, w: 70, h: 90 },
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
  for (const slot of slots) if (slot >= 0 && slot < SLOTS.length) block(stationRect(slot), 4)
  for (const prop of props) if (PROP_BLOCK[prop]) block(PROP_BLOCK[prop])
  return grid
}

const cellOf = (p: Pt) => ({ cx: Math.max(0, Math.min(COLS - 1, Math.floor(p.x / CELL))), cy: Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / CELL))) })

/** Nearest open cell to a point (a target inside furniture walks to its edge). */
function openCellNear(grid: Uint8Array, p: Pt) {
  const { cx, cy } = cellOf(p)
  if (!grid[cy * COLS + cx]) return { cx, cy }
  for (let r = 1; r < 8; r++) {
    let best: { cx: number; cy: number } | null = null, bestD = Infinity
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || grid[y * COLS + x]) continue
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d < bestD) { bestD = d; best = { cx: x, cy: y } }
    }
    if (best) return best
  }
  return { cx, cy }
}

/**
 * A* over the grid, 8 directions without cutting corners. Returns waypoints from `from` to `to` (the exact
 * end point is appended so characters stop where they should), simplified to where the path turns.
 */
export function findPath(grid: Uint8Array, from: Pt, to: Pt): Pt[] {
  const start = openCellNear(grid, from), goal = openCellNear(grid, to)
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
      const cost = g[cur] + (dx && dy ? 1.414 : 1)
      if (cost < g[ni]) { g[ni] = cost; came[ni] = cur; open.push(ni) }
    }
  }
  if (!found) return [to]
  const cells: number[] = []
  for (let c = goalIndex; c !== -1; c = came[c]) cells.push(c)
  cells.reverse()
  const pts: Pt[] = []
  for (let i = 1; i < cells.length - 1; i++) {
    const a = cells[i - 1], b = cells[i], c = cells[i + 1]
    const d1 = [b % COLS - a % COLS, ((b / COLS) | 0) - ((a / COLS) | 0)], d2 = [c % COLS - b % COLS, ((c / COLS) | 0) - ((b / COLS) | 0)]
    if (d1[0] !== d2[0] || d1[1] !== d2[1]) pts.push({ x: (b % COLS) * CELL + CELL / 2, y: ((b / COLS) | 0) * CELL + CELL / 2 })
  }
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
