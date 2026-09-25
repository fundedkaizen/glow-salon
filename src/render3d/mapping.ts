import { FLOOR_H, FLOOR_W, WALL_H } from '../core/floor.ts'

/**
 * The sim's flat 1280 x 800 floor (src/core/floor.ts) and the 3D room, in metres. The sim never changes: its
 * (x, y) lands on the ground plane as (X, Z), Y is up, and the back wall's inner face is Z = 0 (sim y = WALL_H).
 * The 2D floor draws a person 1.28 times their 128 grid units (about 164 units), and so does this room: 88 units
 * make a metre, so a 1.7 m person stands about 150 units tall and reads at the same size against the room.
 * The 2D art drew the floor foreshortened in y, so depth gets a little stretch (DEPTH_K) for true 3D.
 * Pure (no three.js), so tests run it in plain Node.
 */
export const UNITS_PER_M = 88
export const DEPTH_K = 1.12

/** The room's inside, in metres: X from -W/2 (the door wall) to W/2, Z from 0 (the back wall) to D (the front). */
export const ROOM3 = {
  w: FLOOR_W / UNITS_PER_M,
  d: ((FLOOR_H - WALL_H) / UNITS_PER_M) * DEPTH_K,
  wallH: 2.75,
  wallT: 0.22,
  /** The cut-away front and right walls stand this high. */
  lowWallH: 0.42,
}

export type V2 = { x: number; z: number }

/** A sim point on the ground plane. */
export function toWorld(x: number, y: number): V2 {
  return { x: (x - FLOOR_W / 2) / UNITS_PER_M, z: ((y - WALL_H) / UNITS_PER_M) * DEPTH_K }
}

/** A ground point back in sim units (what a tap on the floor means to the sim). */
export function toSim(x: number, z: number): { x: number; y: number } {
  return { x: x * UNITS_PER_M + FLOOR_W / 2, y: (z / DEPTH_K) * UNITS_PER_M + WALL_H }
}

/** A sim length along x in metres. */
export const lenX = (units: number) => units / UNITS_PER_M
/** A sim length along y in metres. */
export const lenZ = (units: number) => (units / UNITS_PER_M) * DEPTH_K

/**
 * The 2D art drew the back wall face-on as the band y 0 (the top) to WALL_H (the floor). A wall piece at band
 * height y hangs this high on the 3D back wall.
 */
export function wallHeight(y: number): number {
  return Math.max(0.3, Math.min(ROOM3.wallH - 0.2, (1 - y / WALL_H) * ROOM3.wallH))
}

/**
 * The way a person faces when moving by (dx, dy) in sim units, as a rotation about Y: a model's front is +Z,
 * so 0 faces the front of the room (the camera) and PI/2 faces +X.
 */
export function yawFor(dx: number, dy: number): number {
  return Math.atan2(dx / UNITS_PER_M, (dy / UNITS_PER_M) * DEPTH_K)
}

/** The shortest turn from angle a to angle b (radians, -PI..PI). */
export function turnTo(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
