import type { Region, Shape } from '../geometry.ts'

/**
 * The body parts, as geometry in art space (1024 x 1024). The code-drawn art paints these shapes and the
 * treatment logic measures coverage inside them, so replacing the art with painted images later only
 * needs the images to line up with these shapes.
 */
export type BodyPartId = 'face' | 'hand'

export type Point = { x: number; y: number }

// ---------------------------------------------------------------- face
export const FACE = {
  cx: 512,
  cy: 520,
  /** The face outline: an egg with a softer jaw, 72 points. */
  outline: faceOutline(),
  hairCap: { t: 'ellipse', cx: 512, cy: 196, rx: 372, ry: 138 } as Shape,
  eyes: [{ x: 398, y: 516 }, { x: 626, y: 516 }] as Point[],
  brows: [{ x: 392, y: 446 }, { x: 632, y: 446 }] as Point[],
  nose: { x: 512, y: 636 },
  lips: { x: 512, y: 762 },
  ears: [{ x: 226, y: 548 }, { x: 798, y: 548 }] as Point[],
}

function faceOutline(): number[] {
  const pts: number[] = []
  const cx = 512, cy = 520
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2
    const s = Math.sin(t), c = Math.cos(t)
    const top = c > 0
    const ry = top ? 372 : 388
    // The lower half narrows into a soft jaw and chin; the temples narrow a little too.
    const jaw = top ? 1 - 0.07 * c ** 4 : 1 - 0.28 * (-c) ** 2.4
    const cheek = 1 + 0.03 * Math.exp(-(((t % Math.PI) - Math.PI / 2) ** 2) * 6)
    pts.push(cx + 282 * s * jaw * cheek, cy - ry * c)
  }
  return pts
}

const faceShape: Shape = { t: 'poly', pts: FACE.outline }
const eyeShapes: Shape[] = FACE.eyes.map(e => ({ t: 'ellipse', cx: e.x, cy: e.y + 2, rx: 78, ry: 34 }))
const browShapes: Shape[] = FACE.brows.map((b, i) => ({ t: 'ellipse', cx: b.x, cy: b.y, rx: 80, ry: 24, rot: i ? -0.1 : 0.1 }))
const lipShape: Shape = { t: 'ellipse', cx: FACE.lips.x, cy: FACE.lips.y, rx: 92, ry: 40 }
const noseShape: Shape = { t: 'ellipse', cx: FACE.nose.x, cy: FACE.nose.y, rx: 78, ry: 64 }

// ---------------------------------------------------------------- hand
export type Finger = { name: string; base: Point; tip: Point; r0: number; r1: number; nailLength: number }

/** A right hand, palm down, fingers pointing up and away; the thumb on the left. */
export const HAND = {
  palm: [388, 1060, 356, 900, 338, 760, 352, 640, 398, 586, 480, 566, 572, 572, 650, 598, 704, 650, 716, 760, 690, 900, 650, 1060],
  fingers: [
    { name: 'thumb', base: { x: 392, y: 780 }, tip: { x: 212, y: 566 }, r0: 56, r1: 40, nailLength: 88 },
    { name: 'index', base: { x: 420, y: 612 }, tip: { x: 382, y: 300 }, r0: 44, r1: 35, nailLength: 80 },
    { name: 'middle', base: { x: 505, y: 596 }, tip: { x: 505, y: 238 }, r0: 45, r1: 36, nailLength: 84 },
    { name: 'ring', base: { x: 590, y: 608 }, tip: { x: 622, y: 282 }, r0: 42, r1: 34, nailLength: 78 },
    { name: 'pinky', base: { x: 664, y: 648 }, tip: { x: 728, y: 402 }, r0: 36, r1: 29, nailLength: 64 },
  ] as Finger[],
}

/** A finger's unit direction (base to tip). */
export function fingerDir(f: Finger): Point {
  const dx = f.tip.x - f.base.x, dy = f.tip.y - f.base.y, l = Math.hypot(dx, dy)
  return { x: dx / l, y: dy / l }
}

/** The nail on a finger: from its base (the cuticle) to the fingertip. */
export function nailOf(f: Finger) {
  const d = fingerDir(f)
  const tip = { x: f.tip.x - d.x * 10, y: f.tip.y - d.y * 10 }
  const base = { x: tip.x - d.x * f.nailLength, y: tip.y - d.y * f.nailLength }
  return { base, tip, halfWidth: f.r1 * 0.8, dir: d }
}

/** Where an overgrown nail ends (before clipping): past the fingertip. */
export function freeEdgeOf(f: Finger, grown = 34) {
  const n = nailOf(f)
  return { x: n.tip.x + n.dir.x * grown, y: n.tip.y + n.dir.y * grown }
}

const fingerShapes: Shape[] = HAND.fingers.map(f => ({ t: 'capsule', x0: f.base.x, y0: f.base.y, x1: f.tip.x, y1: f.tip.y, r0: f.r0, r1: f.r1 }))
const nailShapes: Shape[] = HAND.fingers.map(f => {
  const n = nailOf(f)
  return { t: 'capsule', x0: n.base.x, y0: n.base.y, x1: n.tip.x, y1: n.tip.y, r0: n.halfWidth * 0.94, r1: n.halfWidth }
})
/** The band at each nail's free edge, which the file smooths after clipping. */
const tipShapes: Shape[] = HAND.fingers.map(f => {
  const n = nailOf(f)
  return { t: 'capsule', x0: n.tip.x - n.dir.x * 22, y0: n.tip.y - n.dir.y * 22, x1: n.tip.x + n.dir.x * 4, y1: n.tip.y + n.dir.y * 4, r0: n.halfWidth * 1.05, r1: n.halfWidth * 0.95 }
})
const cuticleShapes: Shape[] = HAND.fingers.map(f => {
  const n = nailOf(f)
  return { t: 'ellipse', cx: n.base.x + n.dir.x * 6, cy: n.base.y + n.dir.y * 6, rx: n.halfWidth * 1.25, ry: 22, rot: Math.atan2(n.dir.y, n.dir.x) + Math.PI / 2 }
})

// ---------------------------------------------------------------- regions
export type RegionId = 'face' | 'skin' | 'nose' | 'tzone' | 'hand' | 'nails' | 'tips' | 'cuticles' | 'everywhere'

export const REGIONS: Record<RegionId, Region> = {
  face: { include: [faceShape], exclude: [FACE.hairCap] },
  skin: { include: [faceShape], exclude: [FACE.hairCap, ...eyeShapes, ...browShapes, lipShape] },
  nose: { include: [noseShape] },
  tzone: { include: [{ t: 'ellipse', cx: 512, cy: 388, rx: 210, ry: 78 }, noseShape, { t: 'ellipse', cx: 512, cy: 850, rx: 90, ry: 40 }], exclude: [FACE.hairCap, ...browShapes] },
  hand: { include: [{ t: 'poly', pts: HAND.palm }, ...fingerShapes] },
  nails: { include: nailShapes },
  tips: { include: tipShapes },
  cuticles: { include: cuticleShapes },
  everywhere: { include: [{ t: 'poly', pts: [0, 0, 1024, 0, 1024, 1024, 0, 1024] }] },
}

export const SHAPES = { faceShape, eyeShapes, browShapes, lipShape, noseShape, fingerShapes, nailShapes, tipShapes, cuticleShapes }
