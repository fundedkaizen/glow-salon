import { DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Vector3, type Texture } from 'three'
import type { DecorKind } from '../core/decor.ts'
import { G, Kit, shade, tf } from './kit.ts'
import { COLORS } from './room.ts'
import type { ShadeBlob } from './textures.ts'

/**
 * Stand-in furniture, built from the kit's rounded primitives until the modelled pieces arrive: the reception
 * desk, the waiting sofa, the three stations, lamps, tables, plants and every decor kind. Each piece adds itself
 * to the batch (one mesh per finish for the whole salon), a soft contact shadow to the floor's shade layer,
 * and, for seats and stations, the helper points the modelled pieces will carry by name (seat, work, feet).
 */
export type Build = { kit: Kit; extra: Group; blobs: ShadeBlob[] }

/** A helper point in the room: where a seated person's hips go and which way they face, or where a worker stands. */
export type Node3 = { x: number; y: number; z: number; yaw: number }
export type StationNodes = { seat: Node3; work: Node3; feet?: Node3; recline: number; seatKind: 'chair' | 'pedicure' | 'stool' }

export const C = {
  pink: 0xf4a3bd,
  pinkDeep: 0xe58aa8,
  blush: 0xf8cad8,
  mint: 0xa9e3cf,
  mintDeep: 0x7fcfb3,
  lilac: 0xcdbdf2,
  cream: 0xfff4ec,
  white: 0xffffff,
  marble: 0xf8f3f1,
  wood: 0xc99a74,
  woodDark: 0x9c6f52,
  gold: COLORS.gold,
  leaf: 0x7cc47a,
  leafDark: 0x5caa62,
  pot: 0xf2e6df,
  ink: 0x5a3a52,
}

const node = (frame: { x: number; z: number; ry: number }, lx: number, ly: number, lz: number, yaw: number): Node3 => {
  const v = new Vector3(lx, ly, lz).applyAxisAngle(new Vector3(0, 1, 0), frame.ry)
  return { x: frame.x + v.x, y: ly, z: frame.z + v.z, yaw: yaw + frame.ry }
}

// ------------------------------------------------------------------ front of house

/** The reception desk: a mint fluted counter with a marble top, the salon computer and a little plant. */
export function desk(b: Build, x: number, z: number, w: number) {
  const { kit } = b
  kit.at(tf(x, 0, z), () => {
    const d = 0.78, h = 1.02
    kit.add(G.box(w, h - 0.06, d, 0.08), C.mint, 'satin', tf(0, (h - 0.06) / 2, 0))
    // Flutes down the front.
    for (let fx = -w / 2 + 0.12; fx < w / 2 - 0.08; fx += 0.12) kit.add(G.cyl(0.035, 0.035, h - 0.26, 8), shade(C.mint, 0.18), 'satin', tf(fx, (h - 0.06) / 2 + 0.02, d / 2 + 0.005))
    kit.add(G.box(w - 0.1, 0.06, 0.06, 0.02), C.gold, 'metal', tf(0, 0.06, d / 2))
    kit.add(G.box(w + 0.08, 0.07, d + 0.1, 0.03), C.marble, 'gloss', tf(0, h, 0))
    kit.add(G.box(w + 0.02, 0.02, 0.02, 0.008), C.gold, 'metal', tf(0, h - 0.045, d / 2 + 0.05))
    // The computer: a slim monitor facing the front, a keyboard, a pen pot and a bell.
    kit.add(G.box(0.62, 0.4, 0.04, 0.03), 0xf2f0f4, 'satin', tf(0.15, h + 0.38, -0.08, -0.08, 0, 0))
    kit.add(G.box(0.56, 0.33, 0.01, 0.005), 0x9fd8f0, 'glow', tf(0.15, h + 0.39, -0.055, -0.08, 0, 0))
    kit.add(G.box(0.06, 0.16, 0.05, 0.02), 0xf2f0f4, 'satin', tf(0.15, h + 0.12, -0.1))
    kit.add(G.box(0.22, 0.02, 0.14, 0.01), 0xf2f0f4, 'satin', tf(0.15, h + 0.045, -0.12))
    kit.add(G.box(0.44, 0.02, 0.14, 0.01), 0xffffff, 'satin', tf(0.15, h + 0.045, 0.14))
    kit.add(G.cyl(0.05, 0.06, 0.03, 14), C.gold, 'metal', tf(-0.45, h + 0.05, 0.16))
    kit.add(G.sphere(0.012, 6), C.gold, 'metal', tf(-0.45, h + 0.08, 0.16))
    kit.add(G.cyl(0.05, 0.04, 0.12, 12), C.pink, 'gloss', tf(0.7, h + 0.1, 0.1))
    plantInPot(kit, -w / 2 + 0.22, h + 0.035, 0.02, 0.65)
  })
  b.blobs.push({ x, z, rx: w / 2 + 0.3, rz: 0.7, a: 0.35 })
}

/** The waiting sofa: a long blush sofa, tufted, on gold feet, with cushions. Returns the seats' hip points. */
export function sofa(b: Build, x: number, z: number, w: number, seatsX: number[], color = C.pink): Node3[] {
  const { kit } = b
  const d = 0.9
  kit.at(tf(x, 0, z), () => {
    kit.add(G.box(w, 0.26, d, 0.08), shade(color, -0.04), 'satin', tf(0, 0.26, 0))
    kit.add(G.box(w - 0.1, 0.62, 0.26, 0.12), color, 'satin', tf(0, 0.66, -d / 2 + 0.15, -0.12, 0, 0))
    kit.add(G.box(0.24, 0.52, d, 0.1), color, 'satin', tf(-w / 2 + 0.12, 0.44, 0.02))
    kit.add(G.box(0.24, 0.52, d, 0.1), color, 'satin', tf(w / 2 - 0.12, 0.44, 0.02))
    const n = Math.max(2, Math.round((w - 0.5) / 0.75))
    const cw = (w - 0.5) / n
    for (let i = 0; i < n; i++) {
      kit.add(G.box(cw - 0.03, 0.14, d - 0.3, 0.06), shade(color, 0.12), 'satin', tf(-w / 2 + 0.25 + cw * (i + 0.5), 0.44, 0.07))
      // Tufting buttons on the back.
      for (const by of [0.6, 0.8]) kit.add(G.sphere(0.018, 6), shade(color, -0.2), 'satin', tf(-w / 2 + 0.25 + cw * (i + 0.5), by, -d / 2 + 0.26 - (by - 0.6) * 0.12))
    }
    // Throw cushions.
    kit.add(G.box(0.36, 0.34, 0.12, 0.06), C.mint, 'matte', tf(-w / 2 + 0.45, 0.66, -0.12, -0.25, 0.3, 0))
    kit.add(G.box(0.34, 0.32, 0.12, 0.06), C.cream, 'matte', tf(w / 2 - 0.45, 0.66, -0.12, -0.25, -0.3, 0))
    for (const fx of [-w / 2 + 0.12, w / 2 - 0.12]) for (const fz of [-d / 2 + 0.1, d / 2 - 0.08]) kit.add(G.cyl(0.03, 0.02, 0.14, 8), C.gold, 'metal', tf(fx, 0.07, fz))
  })
  b.blobs.push({ x, z, rx: w / 2 + 0.2, rz: 0.62, a: 0.35 })
  return seatsX.map(sx => ({ x: sx, y: 0.5, z: z + 0.1, yaw: 0 }))
}

/** A floor lamp with a fabric shade and a warm bulb. */
export function floorLamp(b: Build, x: number, z: number, shadeColor = C.cream) {
  const { kit } = b
  kit.at(tf(x, 0, z), () => {
    kit.add(G.cyl(0.18, 0.2, 0.04, 20), C.gold, 'metal', tf(0, 0.02, 0))
    kit.add(G.cyl(0.015, 0.015, 1.5, 8), C.gold, 'metal', tf(0, 0.78, 0))
    kit.add(G.cyl(0.17, 0.25, 0.3, 20), shadeColor, 'matte', tf(0, 1.58, 0))
    kit.add(G.sphere(0.07, 10), 0xfff0cf, 'glow', tf(0, 1.47, 0))
  })
  b.blobs.push({ x, z, rx: 0.3, rz: 0.3, a: 0.3 })
}

/** A round side table with magazines. */
export function sideTable(b: Build, x: number, z: number, top = C.marble) {
  const { kit } = b
  kit.at(tf(x, 0, z), () => {
    kit.add(G.cyl(0.3, 0.3, 0.04, 24), top, 'gloss', tf(0, 0.55, 0))
    kit.add(G.cyl(0.03, 0.05, 0.53, 10), C.gold, 'metal', tf(0, 0.27, 0))
    kit.add(G.cyl(0.18, 0.2, 0.03, 20), C.gold, 'metal', tf(0, 0.015, 0))
    kit.add(G.box(0.24, 0.015, 0.18, 0.004), 0xf6a9c2, 'satin', tf(-0.05, 0.58, 0.02, 0, 0.3, 0))
    kit.add(G.box(0.22, 0.015, 0.16, 0.004), 0xa9d9ef, 'satin', tf(0.02, 0.595, -0.03, 0, -0.2, 0))
  })
  b.blobs.push({ x, z, rx: 0.36, rz: 0.36, a: 0.3 })
}

/** The tea corner: a two-tier trolley with a teapot and cups. */
export function teaCart(b: Build, x: number, z: number, ry = 0) {
  const { kit } = b
  kit.at(tf(x, 0, z, 0, ry, 0), () => {
    for (const y of [0.3, 0.72]) kit.add(G.box(0.7, 0.04, 0.42, 0.02), C.white, 'satin', tf(0, y, 0))
    for (const fx of [-0.32, 0.32]) for (const fz of [-0.18, 0.18]) kit.add(G.cyl(0.015, 0.015, 0.72, 6), C.gold, 'metal', tf(fx, 0.37, fz))
    kit.add(G.sphere(0.1, 12), C.mint, 'gloss', tf(-0.12, 0.83, 0, 0, 0, 0, 1, 0.8, 1))
    kit.add(G.cyl(0.02, 0.012, 0.1, 6), C.mint, 'gloss', tf(-0.02, 0.84, 0, 0, 0, -1))
    for (const cx of [0.12, 0.24]) kit.add(G.cyl(0.04, 0.03, 0.06, 10), C.white, 'gloss', tf(cx, 0.77, 0.05))
    kit.add(G.box(0.3, 0.1, 0.2, 0.03), C.blush, 'satin', tf(0, 0.37, 0))
  })
  b.blobs.push({ x, z, rx: 0.42, rz: 0.3, a: 0.3 })
}

/** An A-frame chalkboard by the door. */
export function welcomeSign(b: Build, x: number, z: number, ry = 0.5) {
  const { kit } = b
  kit.at(tf(x, 0, z, 0, ry, 0), () => {
    kit.add(G.box(0.5, 0.72, 0.04, 0.02), C.wood, 'matte', tf(0, 0.37, 0.12, -0.2, 0, 0))
    kit.add(G.box(0.42, 0.58, 0.01, 0.005), 0x3f4a4c, 'matte', tf(0, 0.39, 0.145, -0.2, 0, 0))
    kit.add(G.box(0.3, 0.03, 0.01, 0.005), 0xffffff, 'matte', tf(0, 0.52, 0.17, -0.2, 0, 0))
    kit.add(G.box(0.22, 0.03, 0.01, 0.005), 0xf6a9c2, 'matte', tf(0, 0.44, 0.155, -0.2, 0, 0))
    kit.add(G.box(0.26, 0.03, 0.01, 0.005), 0xffffff, 'matte', tf(0, 0.36, 0.14, -0.2, 0, 0))
    kit.add(G.box(0.5, 0.72, 0.04, 0.02), C.wood, 'matte', tf(0, 0.37, -0.12, 0.2, 0, 0))
  })
  b.blobs.push({ x, z, rx: 0.3, rz: 0.25, a: 0.25 })
}

// ------------------------------------------------------------------ plants

export function plantInPot(kit: Kit, x: number, y: number, z: number, k = 1, pot = C.pot) {
  kit.add(G.lathe('pot', [[0, 0], [0.13, 0], [0.16, 0.2], [0.17, 0.22], [0.15, 0.23], [0, 0.23]]), pot, 'gloss', tf(x, y, z, 0, 0, 0, k))
  const leaves: [number, number, number, number][] = [[0, 0.42, 0, 0.16], [0.1, 0.34, 0.06, 0.13], [-0.1, 0.35, 0.05, 0.12], [0.02, 0.33, -0.1, 0.13], [-0.05, 0.5, -0.02, 0.1]]
  leaves.forEach(([lx, ly, lz, r], i) => kit.add(G.sphere(r, 10), i % 2 ? C.leafDark : C.leaf, 'matte', tf(x + lx * k, y + ly * k, z + lz * k, 0, 0, 0, k)))
}

/** A big potted plant (a fiddle-leaf fig in a tall pot). */
export function bigPlant(b: Build, x: number, z: number, pot = C.pot, k = 1) {
  const { kit } = b
  kit.at(tf(x, 0, z, 0, 0, 0, k), () => {
    kit.add(G.lathe('bigpot', [[0, 0], [0.18, 0], [0.24, 0.42], [0.26, 0.45], [0.23, 0.46], [0, 0.46]]), pot, 'gloss', tf(0, 0, 0))
    kit.add(G.cyl(0.02, 0.025, 0.7, 6), C.woodDark, 'matte', tf(0, 0.8, 0))
    const leaves: [number, number, number, number][] = [[0, 1.3, 0, 0.26], [0.2, 1.1, 0.1, 0.22], [-0.2, 1.12, 0.06, 0.22], [0.05, 0.95, -0.2, 0.2], [-0.1, 1.45, -0.1, 0.18], [0.18, 1.38, -0.05, 0.17], [-0.05, 0.9, 0.2, 0.18]]
    leaves.forEach(([lx, ly, lz, r], i) => kit.add(G.sphere(r, 10), i % 2 ? C.leafDark : C.leaf, 'matte', tf(lx, ly, lz, 0, i, 0, 1, 0.85, 1)))
  })
  b.blobs.push({ x, z, rx: 0.4 * k, rz: 0.4 * k, a: 0.35 })
}

export function succulent(b: Build, x: number, z: number) {
  const { kit } = b
  kit.at(tf(x, 0, z), () => {
    kit.add(G.cyl(0.14, 0.11, 0.24, 14), 0xf1d6de, 'gloss', tf(0, 0.12, 0))
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; kit.add(G.sphere(0.06, 8), i % 2 ? 0x9fd3a6 : 0x86c592, 'matte', tf(Math.cos(a) * 0.06, 0.27, Math.sin(a) * 0.06, 0, 0, 0, 1, 0.7, 1)) }
    kit.add(G.sphere(0.05, 8), 0xf6a9c2, 'matte', tf(0, 0.31, 0))
  })
  b.blobs.push({ x, z, rx: 0.2, rz: 0.2, a: 0.25 })
}

// ------------------------------------------------------------------ stations

/**
 * The facial chair: a tufted recliner on a gold pedestal, head end to the left (where the therapist stands),
 * legs along the leg rest to the right, with a magnifier lamp and a trolley.
 */
export function facialChair(b: Build, x: number, z: number, color = C.pink): StationNodes {
  const { kit } = b
  const f = { x, z, ry: 0 }
  kit.at(tf(x, 0, z), () => {
    // Pedestal.
    kit.add(G.cyl(0.32, 0.38, 0.05, 24), C.gold, 'metal', tf(0.05, 0.025, 0))
    kit.add(G.cyl(0.09, 0.12, 0.36, 14), C.gold, 'metal', tf(0.05, 0.22, 0))
    kit.add(G.box(1.2, 0.08, 0.5, 0.03), C.gold, 'metal', tf(0.1, 0.4, 0))
    // Seat, reclined back and leg rest.
    kit.add(G.box(0.6, 0.16, 0.62, 0.07), color, 'satin', tf(0.05, 0.5, 0))
    kit.add(G.box(0.8, 0.14, 0.6, 0.07), color, 'satin', tf(-0.52, 0.72, 0, 0, 0, -0.62))
    kit.add(G.box(0.24, 0.12, 0.3, 0.06), shade(color, 0.15), 'satin', tf(-0.86, 1.0, 0, 0, 0, -0.62))
    kit.add(G.box(0.78, 0.13, 0.56, 0.06), color, 'satin', tf(0.72, 0.47, 0, 0, 0, 0.1))
    // Tufting.
    for (let i = 0; i < 3; i++) kit.add(G.sphere(0.02, 6), shade(color, -0.2), 'satin', tf(-0.32 - i * 0.16, 0.66 + i * 0.12, 0, 0, 0, -0.62))
    // Arm rests.
    for (const s of [-1, 1]) kit.add(G.box(0.46, 0.06, 0.08, 0.03), C.gold, 'metal', tf(0.02, 0.66, s * 0.34))
    for (const s of [-1, 1]) kit.add(G.box(0.4, 0.07, 0.1, 0.04), shade(color, 0.1), 'satin', tf(0.02, 0.7, s * 0.34))
    // Magnifier lamp on an arm over the head end, and a trolley.
    kit.add(G.cyl(0.14, 0.16, 0.04, 16), 0xf2f0f4, 'satin', tf(-1.0, 0.02, -0.55))
    kit.add(G.cyl(0.015, 0.015, 1.5, 8), 0xf2f0f4, 'satin', tf(-1.0, 0.77, -0.55))
    kit.add(G.cyl(0.012, 0.012, 0.6, 8), 0xf2f0f4, 'satin', tf(-0.82, 1.52, -0.35, 0.7, 0, -0.9))
    kit.add(G.torus(0.13, 0.025, Math.PI * 2, 20), 0xf2f0f4, 'satin', tf(-0.62, 1.42, -0.12, 1.2, 0, 0.3))
    kit.add(G.cyl(0.12, 0.12, 0.01, 18), 0xdff3ff, 'glass', tf(-0.62, 1.42, -0.12, 1.2 - Math.PI / 2, 0, 0.3))
    trolley(kit, -1.05, 0.62)
  })
  b.blobs.push({ x: x + 0.05, z, rx: 1.1, rz: 0.55, a: 0.32 })
  return { seat: node(f, 0.05, 0.56, 0, Math.PI / 2), work: node(f, -1.33, 0, 0.5, Math.PI / 2 - 0.3), recline: 1.0, seatKind: 'chair' }
}

function trolley(kit: Kit, x: number, z: number) {
  kit.at(tf(x, 0, z), () => {
    for (const y of [0.25, 0.55, 0.82]) kit.add(G.box(0.46, 0.035, 0.34, 0.015), C.white, 'satin', tf(0, y, 0))
    for (const fx of [-0.2, 0.2]) for (const fz of [-0.14, 0.14]) kit.add(G.cyl(0.012, 0.012, 0.82, 6), C.gold, 'metal', tf(fx, 0.42, fz))
    const bottles: [number, number, number][] = [[-0.12, 0.05, 0xa9e3cf], [0, -0.04, 0xf6a9c2], [0.12, 0.06, 0xcdbdf2]]
    for (const [bx, bz, c] of bottles) { kit.add(G.cyl(0.035, 0.035, 0.13, 10), c, 'gloss', tf(bx, 0.9, bz)); kit.add(G.cyl(0.015, 0.015, 0.04, 6), C.white, 'satin', tf(bx, 0.98, bz)) }
    kit.add(G.box(0.3, 0.06, 0.2, 0.02), C.blush, 'satin', tf(0, 0.6, 0))
  })
}

/** The pedicure throne: a padded armchair on a step, facing left into a round foot basin. */
export function pedicureChair(b: Build, x: number, z: number, color = C.lilac): StationNodes {
  const { kit } = b
  const f = { x, z, ry: 0 }
  kit.at(tf(x, 0, z), () => {
    // The step and platform.
    kit.add(G.box(0.95, 0.3, 0.9, 0.05), C.white, 'satin', tf(0.3, 0.15, 0))
    kit.add(G.box(0.97, 0.03, 0.92, 0.015), C.gold, 'metal', tf(0.3, 0.3, 0))
    // The chair, facing -X: seat, back, arms.
    kit.add(G.box(0.62, 0.18, 0.66, 0.08), color, 'satin', tf(0.28, 0.48, 0))
    kit.add(G.box(0.2, 0.8, 0.7, 0.1), color, 'satin', tf(0.62, 0.86, 0, 0, 0, 0.12))
    kit.add(G.box(0.12, 0.2, 0.64, 0.06), shade(color, 0.15), 'satin', tf(0.66, 1.3, 0, 0, 0, 0.12))
    for (const s of [-1, 1]) {
      kit.add(G.box(0.56, 0.28, 0.12, 0.06), shade(color, -0.05), 'satin', tf(0.3, 0.64, s * 0.38))
      kit.add(G.cyl(0.02, 0.02, 0.56, 8), C.gold, 'metal', tf(0.3, 0.79, s * 0.38, 0, 0, Math.PI / 2))
    }
    // Buttons on the back.
    for (const by of [0.8, 1.05]) for (const bz of [-0.15, 0.15]) kit.add(G.sphere(0.02, 6), shade(color, -0.25), 'satin', tf(0.52, by, bz))
    // The basin in front, on the floor, with water.
    kit.add(G.lathe('basin', [[0, 0], [0.28, 0], [0.33, 0.22], [0.34, 0.26], [0.3, 0.26], [0.26, 0.05], [0, 0.05]], 24), C.white, 'gloss', tf(-0.42, 0, 0))
    kit.add(G.cyl(0.3, 0.3, 0.01, 24), 0x9fdcef, 'gloss', tf(-0.42, 0.2, 0))
    kit.add(G.torus(0.335, 0.015, Math.PI * 2, 28), C.gold, 'metal', tf(-0.42, 0.26, 0, Math.PI / 2, 0, 0))
    // A little stool for the therapist, and a towel.
    kit.add(G.cyl(0.18, 0.16, 0.08, 16), shade(color, 0.2), 'satin', tf(-1.05, 0.42, 0.28))
    kit.add(G.cyl(0.02, 0.02, 0.38, 6), C.gold, 'metal', tf(-1.05, 0.19, 0.28))
    kit.add(G.box(0.3, 0.06, 0.2, 0.03), C.white, 'matte', tf(0.3, 0.33, 0.52))
  })
  b.blobs.push({ x: x + 0.05, z, rx: 0.95, rz: 0.55, a: 0.32 })
  return { seat: node(f, 0.3, 0.6, 0, -Math.PI / 2), work: node(f, -1.33, 0, 0.45, Math.PI / 2 - 0.4), feet: node(f, -0.42, 0.12, 0, 0), recline: 0.15, seatKind: 'pedicure' }
}

/** The nail desk: a marble-topped desk with a lamp and a polish rack, a stool for the customer on the right. */
export function nailDesk(b: Build, x: number, z: number, color = C.mint): StationNodes {
  const { kit } = b
  const f = { x, z, ry: 0 }
  kit.at(tf(x, 0, z), () => {
    const dx = -0.55
    kit.add(G.box(0.62, 0.7, 1.15, 0.05), C.white, 'satin', tf(dx, 0.35, 0))
    kit.add(G.box(0.56, 0.5, 0.02, 0.01), color, 'satin', tf(dx, 0.35, 0.58))
    kit.add(G.box(0.72, 0.05, 1.25, 0.02), C.marble, 'gloss', tf(dx, 0.73, 0))
    kit.add(G.box(0.74, 0.015, 1.27, 0.006), C.gold, 'metal', tf(dx, 0.7, 0))
    // A hand cushion, a lamp and a rack of polish.
    kit.add(G.box(0.22, 0.06, 0.16, 0.03), C.pink, 'satin', tf(dx + 0.12, 0.78, 0))
    kit.add(G.cyl(0.08, 0.1, 0.02, 14), C.gold, 'metal', tf(dx - 0.18, 0.76, -0.45))
    kit.add(G.cyl(0.01, 0.01, 0.42, 6), C.gold, 'metal', tf(dx - 0.18, 0.96, -0.45))
    kit.add(G.cyl(0.02, 0.1, 0.12, 14), C.white, 'satin', tf(dx - 0.08, 1.15, -0.4, 0, 0, -0.6))
    kit.add(G.sphere(0.04, 8), 0xfff0cf, 'glow', tf(dx - 0.05, 1.11, -0.4))
    kit.add(G.box(0.1, 0.36, 0.5, 0.02), C.white, 'satin', tf(dx - 0.28, 0.93, 0.28))
    const polish = [0xf07aa0, 0xe2729a, 0xcdbdf2, 0xa9e3cf, 0xfbd9a0, 0xf5a99a, 0x9f86e0, 0x6fd3ad]
    polish.forEach((c, i) => kit.add(G.cyl(0.018, 0.018, 0.05, 8), c, 'gloss', tf(dx - 0.24, 0.84 + Math.floor(i / 4) * 0.13, 0.12 + (i % 4) * 0.1)))
    // The customer's stool.
    kit.add(G.cyl(0.2, 0.18, 0.1, 18), color, 'satin', tf(0.14, 0.52, 0))
    kit.add(G.cyl(0.025, 0.025, 0.45, 8), C.gold, 'metal', tf(0.14, 0.24, 0))
    kit.add(G.torus(0.14, 0.012, Math.PI * 2, 18), C.gold, 'metal', tf(0.14, 0.2, 0, Math.PI / 2, 0, 0))
    kit.add(G.cyl(0.16, 0.18, 0.02, 16), C.gold, 'metal', tf(0.14, 0.01, 0))
    // The therapist's chair on the far side.
    kit.add(G.cyl(0.19, 0.17, 0.09, 16), shade(color, -0.1), 'satin', tf(-1.2, 0.5, 0))
    kit.add(G.box(0.08, 0.36, 0.34, 0.04), shade(color, -0.1), 'satin', tf(-1.4, 0.72, 0))
    kit.add(G.cyl(0.025, 0.025, 0.45, 8), C.gold, 'metal', tf(-1.2, 0.24, 0))
    kit.add(G.cyl(0.16, 0.18, 0.02, 16), C.gold, 'metal', tf(-1.2, 0.01, 0))
  })
  b.blobs.push({ x: x - 0.4, z, rx: 1.0, rz: 0.7, a: 0.3 })
  return { seat: node(f, 0.14, 0.58, 0, -Math.PI / 2), work: node(f, -1.2, 0, 0, Math.PI / 2), recline: 0, seatKind: 'stool' }
}

/** Where a station will go: a folding screen with a little sign (more room is coming). */
export function soonScreen(b: Build, x: number, z: number) {
  const { kit } = b
  kit.at(tf(x, 0, z), () => {
    const panels = [[-0.62, 0.35], [0, 0], [0.62, -0.35]]
    for (const [px, rot] of panels) {
      kit.add(G.box(0.6, 1.5, 0.04, 0.03), C.cream, 'satin', tf(px, 0.8, Math.abs(rot) * 0.4, 0, rot, 0))
      kit.add(G.box(0.5, 1.3, 0.05, 0.02), C.blush, 'matte', tf(px, 0.82, Math.abs(rot) * 0.4, 0, rot, 0))
    }
    kit.add(G.box(0.46, 0.24, 0.02, 0.02), C.white, 'satin', tf(0, 0.95, 0.06))
    kit.add(G.box(0.3, 0.05, 0.01, 0.01), C.pinkDeep, 'matte', tf(0, 0.98, 0.075))
    kit.add(G.box(0.2, 0.04, 0.01, 0.01), C.mintDeep, 'matte', tf(0, 0.9, 0.075))
  })
  b.blobs.push({ x, z: z + 0.1, rx: 1.0, rz: 0.4, a: 0.25 })
}

// ------------------------------------------------------------------ pictures and textured bits

/** A framed picture on the wall (or standing), showing a painted canvas. */
export function framed(b: Build, texture: Texture, x: number, y: number, z: number, w: number, h: number, ry = 0, frame = C.gold) {
  const { kit } = b
  kit.at(tf(x, y, z, 0, ry, 0), () => {
    kit.add(G.box(w + 0.1, h + 0.1, 0.05, 0.02), frame, frame === C.gold ? 'metal' : 'satin', tf(0, 0, 0.025))
  })
  const pic = new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: texture, roughness: 0.7, transparent: true }))
  pic.position.set(x, y, z)
  pic.rotation.y = ry
  pic.translateZ(0.053)
  b.extra.add(pic)
}

/** A flat textured decal lying on the floor (a rug). */
export function floorDecal(b: Build, texture: Texture, x: number, z: number, w: number, d: number, y = 0.006, rot = 0, unlit = false) {
  const mat = unlit ? new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }) : new MeshStandardMaterial({ map: texture, roughness: 0.95, transparent: true, depthWrite: false })
  const m = new Mesh(new PlaneGeometry(w, d), mat)
  m.rotation.x = -Math.PI / 2
  m.rotation.z = rot
  m.position.set(x, y, z)
  m.receiveShadow = true
  m.renderOrder = 0
  b.extra.add(m)
  return m
}

/** A glowing sign on the wall (neon). */
export function glowSign(b: Build, texture: Texture, x: number, y: number, z: number, w: number, h: number, ry = 0): Mesh {
  const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide }))
  m.position.set(x, y, z)
  m.rotation.y = ry
  m.translateZ(0.02)
  b.extra.add(m)
  return m
}

// ------------------------------------------------------------------ decor kinds

/**
 * One decor item, in its set's colours (main, second, accent, trim). `place` decides the frame: floor pieces
 * stand at (x, z); wall pieces hang on the back wall at height y; ceiling pieces hang at y; table pieces sit on
 * a surface at y.
 */
export function decorItem(b: Build, kind: DecorKind, pal: number[], x: number, y: number, z: number, ry = 0) {
  const { kit } = b
  const [main, second, accent, trim] = pal
  const metalTrim = trim === 0xfbe0a0 || trim === 0xf1dcae ? C.gold : trim
  kit.at(tf(x, y, z, 0, ry, 0), () => {
    switch (kind) {
      case 'armchair':
        kit.add(G.box(0.8, 0.22, 0.75, 0.08), main, 'satin', tf(0, 0.3, 0))
        kit.add(G.box(0.8, 0.6, 0.2, 0.1), main, 'satin', tf(0, 0.62, -0.3, -0.15, 0, 0))
        for (const s of [-1, 1]) kit.add(G.box(0.16, 0.42, 0.75, 0.07), shade(main, -0.06), 'satin', tf(s * 0.37, 0.42, 0))
        kit.add(G.box(0.6, 0.1, 0.5, 0.05), shade(main, 0.12), 'satin', tf(0, 0.45, 0.05))
        kit.add(G.box(0.3, 0.26, 0.1, 0.05), second, 'matte', tf(0, 0.64, -0.14, -0.2, 0, 0))
        for (const fx of [-0.32, 0.32]) for (const fz of [-0.28, 0.28]) kit.add(G.cyl(0.025, 0.018, 0.2, 6), metalTrim, 'metal', tf(fx, 0.1, fz))
        b.blobs.push({ x, z, rx: 0.5, rz: 0.45, a: 0.3 })
        break
      case 'sofa':
        kit.add(G.box(1.6, 0.26, 0.8, 0.08), main, 'satin', tf(0, 0.28, 0))
        kit.add(G.box(1.6, 0.56, 0.22, 0.1), main, 'satin', tf(0, 0.64, -0.3, -0.12, 0, 0))
        for (const s of [-1, 1]) kit.add(G.box(0.2, 0.46, 0.8, 0.08), shade(main, -0.06), 'satin', tf(s * 0.78, 0.4, 0))
        for (const s of [-1, 1]) kit.add(G.box(0.62, 0.12, 0.56, 0.05), shade(main, 0.12), 'satin', tf(s * 0.33, 0.46, 0.06))
        kit.add(G.box(0.34, 0.3, 0.1, 0.05), second, 'matte', tf(-0.5, 0.66, -0.12, -0.2, 0.25, 0))
        kit.add(G.box(0.34, 0.3, 0.1, 0.05), accent, 'matte', tf(0.5, 0.66, -0.12, -0.2, -0.25, 0))
        for (const fx of [-0.72, 0.72]) for (const fz of [-0.3, 0.3]) kit.add(G.cyl(0.025, 0.018, 0.16, 6), metalTrim, 'metal', tf(fx, 0.08, fz))
        b.blobs.push({ x, z, rx: 0.95, rz: 0.5, a: 0.3 })
        break
      case 'bench':
        kit.add(G.box(1.3, 0.08, 0.42, 0.03), main, 'satin', tf(0, 0.42, 0))
        kit.add(G.box(1.2, 0.08, 0.36, 0.03), second, 'matte', tf(0, 0.49, 0))
        for (const fx of [-0.55, 0.55]) kit.add(G.box(0.08, 0.4, 0.38, 0.02), shade(main, -0.15), 'satin', tf(fx, 0.2, 0))
        b.blobs.push({ x, z, rx: 0.75, rz: 0.3, a: 0.28 })
        break
      case 'lamp':
        kit.add(G.cyl(0.16, 0.18, 0.04, 18), metalTrim, 'metal', tf(0, 0.02, 0))
        kit.add(G.cyl(0.014, 0.014, 1.2, 8), metalTrim, 'metal', tf(0, 0.62, 0))
        kit.add(G.sphere(0.24, 16), main, 'glow', tf(0, 1.35, 0))
        kit.add(G.sphere(0.12, 12), shade(main, 0.5), 'glow', tf(0, 1.35, 0.14))
        b.blobs.push({ x, z, rx: 0.3, rz: 0.3, a: 0.25 })
        break
      case 'lantern':
        kit.add(G.cyl(0.004, 0.004, 1.2, 4), 0x8a6a80, 'matte', tf(0, 0.6, 0))
        kit.add(G.sphere(0.22, 14), main, 'glow', tf(0, 0, 0, 0, 0, 0, 1, 1.25, 1))
        for (const ry2 of [-0.12, 0.12]) kit.add(G.cyl(0.12, 0.12, 0.03, 12), second, 'satin', tf(0, ry2 * 2.3, 0))
        break
      case 'chandelier':
        kit.add(G.cyl(0.006, 0.006, 1.0, 4), metalTrim, 'metal', tf(0, 0.55, 0))
        kit.add(G.torus(0.34, 0.025, Math.PI * 2, 24), metalTrim, 'metal', tf(0, 0, 0, Math.PI / 2, 0, 0))
        kit.add(G.torus(0.2, 0.02, Math.PI * 2, 20), metalTrim, 'metal', tf(0, 0.16, 0, Math.PI / 2, 0, 0))
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; kit.add(G.sphere(0.045, 8), 0xfff2d6, 'glow', tf(Math.cos(a) * 0.34, 0.06, Math.sin(a) * 0.34)); kit.add(G.sphere(0.03, 6), 0xf6f0ff, 'glass', tf(Math.cos(a) * 0.3, -0.12, Math.sin(a) * 0.3)) }
        kit.add(G.sphere(0.08, 10), main, 'gloss', tf(0, -0.12, 0))
        break
      case 'disco':
        kit.add(G.cyl(0.004, 0.004, 1.0, 4), 0xcccccc, 'metal', tf(0, 0.55, 0))
        kit.add(G.sphere(0.26, 10), 0xe8e8f4, 'metal', tf(0, 0, 0))
        break
      case 'shelf':
        kit.add(G.box(1.1, 0.05, 0.24, 0.015), main, 'satin', tf(0, -0.2, 0.12))
        kit.add(G.box(1.1, 0.05, 0.24, 0.015), main, 'satin', tf(0, 0.2, 0.12))
        for (let i = 0; i < 5; i++) {
          const c = [second, accent, trim, main, second][i]
          kit.add(G.cyl(0.05, 0.05, 0.14 + (i % 2) * 0.05, 10), c, 'gloss', tf(-0.4 + i * 0.2, -0.1 + (i % 2) * 0.025, 0.14))
          kit.add(G.sphere(0.055, 8), [accent, main, second, accent, trim][i], 'gloss', tf(-0.45 + i * 0.2, 0.28, 0.14, 0, 0, 0, 1, 0.8, 1))
        }
        break
      case 'mirror':
        kit.add(G.torus(0.34, 0.05, Math.PI * 2, 32), metalTrim, 'metal', tf(0, 0, 0.05))
        kit.add(G.cyl(0.33, 0.33, 0.02, 32), 0xdfeaf2, 'metal', tf(0, 0, 0.03, Math.PI / 2, 0, 0))
        kit.add(G.sphere(0.06, 8), main, 'satin', tf(0, 0.4, 0.07))
        break
      case 'neon':
        kit.add(G.box(0.9, 0.5, 0.03, 0.02), shade(main, -0.4), 'satin', tf(0, 0, 0.02))
        kit.add(G.torus(0.14, 0.018, Math.PI * 1.4, 18), accent, 'glow', tf(-0.18, 0.02, 0.06, 0, 0, 0.3))
        kit.add(G.torus(0.14, 0.018, Math.PI * 1.4, 18), second, 'glow', tf(0.2, 0.02, 0.06, 0, 0, 2.2))
        break
      case 'frame':
        kit.add(G.box(0.62, 0.8, 0.05, 0.02), metalTrim, 'metal', tf(0, 0, 0.025))
        kit.add(G.box(0.5, 0.68, 0.02, 0.01), main, 'matte', tf(0, 0, 0.05))
        kit.add(G.sphere(0.12, 10), second, 'matte', tf(-0.06, 0.08, 0.06, 0, 0, 0, 1, 1, 0.2))
        kit.add(G.box(0.4, 0.14, 0.02, 0.02), accent, 'matte', tf(0, -0.2, 0.06))
        break
      case 'wreath':
        kit.add(G.torus(0.3, 0.08, Math.PI * 2, 24), 0xb9a58a, 'matte', tf(0, 0, 0.06))
        for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; kit.add(G.sphere(0.06, 8), [main, second, accent][i % 3], 'matte', tf(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.12)) }
        break
      case 'clock':
        kit.add(G.cyl(0.3, 0.3, 0.06, 28), main, 'satin', tf(0, 0, 0.03, Math.PI / 2, 0, 0))
        kit.add(G.cyl(0.25, 0.25, 0.02, 28), 0xfffaf4, 'satin', tf(0, 0, 0.065, Math.PI / 2, 0, 0))
        kit.add(G.box(0.02, 0.18, 0.01, 0.005), C.ink, 'matte', tf(0, 0.07, 0.08))
        kit.add(G.box(0.14, 0.02, 0.01, 0.005), C.ink, 'matte', tf(0.06, 0, 0.08))
        kit.add(G.torus(0.3, 0.02, Math.PI * 2, 28), accent, 'glow', tf(0, 0, 0.06))
        break
      case 'screen':
        for (const [px, rot] of [[-0.45, 0.3], [0, 0], [0.45, -0.3]] as const) {
          kit.add(G.box(0.44, 1.5, 0.04, 0.02), main, 'matte', tf(px, 0.78, Math.abs(rot) * 0.3, 0, rot, 0))
          for (let yy = 0.2; yy < 1.5; yy += 0.18) kit.add(G.box(0.4, 0.02, 0.05, 0.005), second, 'satin', tf(px, yy, Math.abs(rot) * 0.3, 0, rot, 0))
        }
        b.blobs.push({ x, z, rx: 0.7, rz: 0.3, a: 0.25 })
        break
      case 'fountain':
        kit.add(G.cyl(0.6, 0.66, 0.34, 28), main, 'satin', tf(0, 0.17, 0))
        kit.add(G.cyl(0.54, 0.54, 0.02, 28), 0x8fd3ef, 'gloss', tf(0, 0.3, 0))
        kit.add(G.cyl(0.08, 0.1, 0.5, 12), second, 'satin', tf(0, 0.55, 0))
        kit.add(G.cyl(0.28, 0.14, 0.12, 20), main, 'satin', tf(0, 0.8, 0))
        kit.add(G.cyl(0.24, 0.24, 0.02, 20), 0x8fd3ef, 'gloss', tf(0, 0.85, 0))
        kit.add(G.cyl(0.05, 0.07, 0.25, 10), second, 'satin', tf(0, 0.98, 0))
        kit.add(G.sphere(0.06, 8), 0xbfe9f7, 'glass', tf(0, 1.12, 0))
        b.blobs.push({ x, z, rx: 0.75, rz: 0.75, a: 0.3 })
        break
      case 'plant': case 'palm': case 'bonsai':
        if (kind === 'bonsai') {
          kit.add(G.box(0.36, 0.1, 0.24, 0.03), main, 'gloss', tf(0, 0.05, 0))
          kit.add(G.cyl(0.02, 0.03, 0.22, 6), C.woodDark, 'matte', tf(0, 0.2, 0, 0, 0, 0.3))
          for (const [lx, ly, r] of [[-0.08, 0.32, 0.1], [0.08, 0.36, 0.09], [0, 0.42, 0.08]] as const) kit.add(G.sphere(r, 10), C.leafDark, 'matte', tf(lx, ly, 0, 0, 0, 0, 1, 0.7, 1))
        } else if (kind === 'palm') {
          kit.add(G.lathe('palmpot', [[0, 0], [0.18, 0], [0.22, 0.36], [0, 0.36]]), main, 'gloss', tf(0, 0, 0))
          kit.add(G.cyl(0.04, 0.06, 1.0, 8), 0xb08a64, 'matte', tf(0, 0.85, 0))
          for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; kit.add(G.box(0.7, 0.02, 0.18, 0.01), i % 2 ? C.leaf : C.leafDark, 'matte', tf(Math.cos(a) * 0.3, 1.35, Math.sin(a) * 0.3, 0, -a, -0.45)) }
          b.blobs.push({ x, z, rx: 0.45, rz: 0.45, a: 0.3 })
        } else {
          kit.add(G.lathe('decorpot', [[0, 0], [0.16, 0], [0.2, 0.34], [0, 0.34]]), main, 'gloss', tf(0, 0, 0))
          for (const [lx, ly, lz, r] of [[0, 0.62, 0, 0.2], [0.14, 0.5, 0.05, 0.16], [-0.14, 0.52, 0.03, 0.16], [0, 0.48, -0.12, 0.15]] as const) kit.add(G.sphere(r, 10), C.leaf, 'matte', tf(lx, ly, lz))
          kit.add(G.sphere(0.05, 8), accent, 'matte', tf(0.1, 0.7, 0.1))
          b.blobs.push({ x, z, rx: 0.3, rz: 0.3, a: 0.28 })
        }
        break
      case 'counter':
        kit.add(G.box(1.3, 0.9, 0.55, 0.05), main, 'satin', tf(0, 0.45, 0))
        kit.add(G.box(1.36, 0.05, 0.6, 0.02), second, 'gloss', tf(0, 0.92, 0))
        for (const px of [-0.32, 0.32]) kit.add(G.box(0.56, 0.7, 0.02, 0.02), shade(main, 0.12), 'satin', tf(px, 0.45, 0.28))
        for (const px of [-0.08, 0.08]) kit.add(G.sphere(0.025, 6), metalTrim, 'metal', tf(px, 0.5, 0.3))
        kit.add(G.cyl(0.08, 0.06, 0.18, 12), accent, 'gloss', tf(0.4, 1.03, 0))
        b.blobs.push({ x, z, rx: 0.8, rz: 0.42, a: 0.3 })
        break
      case 'cart':
        for (const yy of [0.3, 0.75]) kit.add(G.box(0.6, 0.04, 0.4, 0.02), main, 'satin', tf(0, yy, 0))
        for (const fx of [-0.27, 0.27]) for (const fz of [-0.17, 0.17]) kit.add(G.cyl(0.014, 0.014, 0.75, 6), metalTrim, 'metal', tf(fx, 0.38, fz))
        for (const cx of [-0.15, 0, 0.15]) kit.add(G.cyl(0.03, 0.02, 0.2, 8), second, 'glass', tf(cx, 0.87, 0))
        kit.add(G.cyl(0.06, 0.06, 0.26, 10), accent, 'gloss', tf(0.2, 0.9, 0.08))
        b.blobs.push({ x, z, rx: 0.4, rz: 0.3, a: 0.28 })
        break
      case 'hammock':
        for (const fx of [-0.9, 0.9]) kit.add(G.cyl(0.04, 0.05, 1.2, 8), shade(main, -0.3), 'matte', tf(fx, 0.6, 0))
        kit.add(G.box(1.5, 0.05, 0.6, 0.03), main, 'matte', tf(0, 0.55, 0, 0, 0, 0))
        kit.add(G.box(1.2, 0.08, 0.5, 0.04), second, 'matte', tf(0, 0.5, 0))
        b.blobs.push({ x, z, rx: 1.0, rz: 0.4, a: 0.25 })
        break
      case 'bowl':
        kit.add(G.lathe('bowl', [[0, 0], [0.08, 0], [0.16, 0.08], [0.17, 0.1], [0, 0.03]]), main, 'gloss', tf(0, 0, 0))
        for (const [fx, fz, c] of [[-0.05, 0, accent], [0.05, 0.03, second], [0, -0.05, trim]] as const) kit.add(G.sphere(0.05, 8), c, 'satin', tf(fx, 0.1, fz))
        break
      case 'teapot':
        kit.add(G.sphere(0.1, 12), main, 'gloss', tf(0, 0.08, 0, 0, 0, 0, 1, 0.8, 1))
        kit.add(G.cyl(0.02, 0.012, 0.1, 6), main, 'gloss', tf(0.12, 0.1, 0, 0, 0, -1))
        kit.add(G.sphere(0.025, 6), second, 'gloss', tf(0, 0.17, 0))
        for (const cx of [-0.18, 0.2]) kit.add(G.cyl(0.035, 0.028, 0.05, 10), second, 'gloss', tf(cx, 0.025, 0.1))
        break
      case 'cabinet':
        kit.add(G.box(0.7, 1.6, 0.6, 0.05), main, 'satin', tf(0, 0.8, 0))
        kit.add(G.box(0.56, 0.45, 0.02, 0.02), 0x221b33, 'gloss', tf(0, 1.2, 0.3, -0.2, 0, 0))
        kit.add(G.box(0.5, 0.38, 0.01, 0.01), accent, 'glow', tf(0, 1.2, 0.31, -0.2, 0, 0))
        kit.add(G.box(0.6, 0.08, 0.2, 0.02), second, 'satin', tf(0, 0.9, 0.35))
        kit.add(G.sphere(0.035, 8), 0xff5fa8, 'gloss', tf(-0.1, 0.96, 0.38))
        kit.add(G.box(0.62, 0.14, 0.02, 0.02), second, 'glow', tf(0, 1.54, 0.3))
        b.blobs.push({ x, z, rx: 0.45, rz: 0.4, a: 0.3 })
        break
      case 'jukebox':
        kit.add(G.box(0.8, 1.2, 0.5, 0.06), main, 'satin', tf(0, 0.6, 0))
        kit.add(G.cyl(0.4, 0.4, 0.5, 20, ), main, 'satin', tf(0, 1.2, 0, Math.PI / 2, 0, 0))
        kit.add(G.torus(0.34, 0.03, Math.PI, 20), accent, 'glow', tf(0, 1.2, 0.26))
        kit.add(G.box(0.5, 0.3, 0.02, 0.02), second, 'glow', tf(0, 0.9, 0.26))
        kit.add(G.box(0.5, 0.3, 0.02, 0.02), shade(main, -0.3), 'satin', tf(0, 0.4, 0.26))
        b.blobs.push({ x, z, rx: 0.5, rz: 0.36, a: 0.3 })
        break
      case 'curtains':
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) kit.add(G.cyl(0.07, 0.1, 1.9, 8), i % 2 ? main : shade(main, -0.06), 'matte', tf(s * (0.72 + i * 0.1), -0.95, 0.08))
          kit.add(G.torus(0.1, 0.02, Math.PI * 2, 12), second, 'satin', tf(s * 0.8, -1.2, 0.18))
        }
        kit.add(G.cyl(0.02, 0.02, 2.0, 8), metalTrim, 'metal', tf(0, 0.02, 0.1, 0, 0, Math.PI / 2))
        break
      case 'vinyl':
        for (let i = 0; i < 4; i++) {
          kit.add(G.cyl(0.18, 0.18, 0.015, 24), 0x1f1b24, 'gloss', tf(-0.45 + i * 0.3, (i % 2) * 0.12, 0.03, Math.PI / 2, 0, 0))
          kit.add(G.cyl(0.07, 0.07, 0.02, 16), [main, second, accent, trim][i], 'satin', tf(-0.45 + i * 0.3, (i % 2) * 0.12, 0.035, Math.PI / 2, 0, 0))
        }
        break
      case 'sign':
        kit.add(G.box(0.9, 0.36, 0.05, 0.1), main, 'satin', tf(0, 0, 0.03))
        kit.add(G.box(0.7, 0.07, 0.02, 0.02), second, 'matte', tf(0, 0.05, 0.06))
        kit.add(G.box(0.5, 0.05, 0.02, 0.02), accent, 'matte', tf(0, -0.07, 0.06))
        break
      case 'rug': case 'sand':
        // Rugs are floor decals (see the view); a thin pad under them.
        break
    }
  })
}

/** A gift from a regular, while it has no model: its painted picture in a little frame on a stand, with a bow. */
export function giftStand(b: Build, texture: Texture, x: number, z: number, ry: number) {
  const { kit } = b
  kit.at(tf(x, 0, z, 0, ry, 0), () => {
    kit.add(G.cyl(0.2, 0.22, 0.5, 18), C.white, 'satin', tf(0, 0.25, 0))
    kit.add(G.cyl(0.23, 0.23, 0.03, 18), C.gold, 'metal', tf(0, 0.51, 0))
    kit.add(G.box(0.05, 0.4, 0.04, 0.01), C.gold, 'metal', tf(0, 0.72, -0.08, -0.25, 0, 0))
    // The bow on top of the frame.
    kit.add(G.sphere(0.05, 8), 0xf07aa0, 'satin', tf(-0.05, 0.98, 0.01, 0, 0, 0, 1, 0.7, 0.5))
    kit.add(G.sphere(0.05, 8), 0xf07aa0, 'satin', tf(0.05, 0.98, 0.01, 0, 0, 0, 1, 0.7, 0.5))
    kit.add(G.sphere(0.025, 6), 0xffd35a, 'satin', tf(0, 0.98, 0.02))
  })
  b.blobs.push({ x, z, rx: 0.28, rz: 0.28, a: 0.3 })
  const f = new Group()
  f.position.set(x, 0, z)
  f.rotation.y = ry
  b.extra.add(f)
  // The picture, leaning back a little on the stand.
  const pic = new Mesh(new PlaneGeometry(0.42, 0.42), new MeshStandardMaterial({ map: texture, roughness: 0.7, transparent: true, alphaTest: 0.05 }))
  pic.position.set(0, 0.76, 0.01)
  pic.rotation.x = -0.12
  f.add(pic)
}

/** The aquarium on its cabinet: a glass tank with water, sand and a plant. The fish swim separately. */
export function aquarium(b: Build, x: number, z: number, ry: number) {
  const { kit } = b
  kit.at(tf(x, 0, z, 0, ry, 0), () => {
    kit.add(G.box(1.1, 0.7, 0.5, 0.04), C.white, 'satin', tf(0, 0.35, 0))
    kit.add(G.box(1.06, 0.06, 0.46, 0.02), 0xf3e2c6, 'matte', tf(0, 0.74, 0))
    kit.add(G.box(1.04, 0.5, 0.44, 0.01), 0x9fdcef, 'glass', tf(0, 0.98, 0))
    kit.add(G.box(1.1, 0.04, 0.5, 0.01), C.white, 'satin', tf(0, 1.25, 0))
    kit.add(G.sphere(0.08, 8), C.leafDark, 'matte', tf(-0.3, 0.84, 0, 0, 0, 0, 0.6, 1.6, 0.6))
    kit.add(G.sphere(0.07, 8), C.leaf, 'matte', tf(0.32, 0.82, -0.05, 0, 0, 0, 0.6, 1.4, 0.6))
  })
  b.blobs.push({ x, z, rx: 0.65, rz: 0.35, a: 0.3 })
}
