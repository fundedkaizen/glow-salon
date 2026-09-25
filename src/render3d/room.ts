import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, MultiplyBlending, PlaneGeometry, type Object3D } from 'three'
import { DOOR_Y0, DOOR_Y1 } from '../art/salon/room.ts'
import { G, Kit, piece, tf } from './kit.ts'
import { PARTITIONS } from '../core/floor.ts'
import { lenX, lenZ, ROOM3, toWorld } from './mapping.ts'
import { buildGarden } from './garden.ts'
import { onWall, SCONCE_SPOTS, WALL_SLOTS, WIN, WINDOW_SPOTS } from './layout.ts'
import { herringboneTexture, marbleTexture, paintShade, wallTexture, windowView, woodTexture, type ShadeBlob } from './textures.ts'

/**
 * The salon's shell, seen dollhouse style from the front left: a warm wood floor, two tall walls (the back wall
 * and the right wall, blush over a cream wainscot, with windows), the front and left walls cut down to a low
 * ledge, and the glass door in the left wall. Outside: a pavement to the door, a lawn and a hedge.
 */
export const COLORS = {
  wallCut: 0xfdf3ee,
  cap: 0xfffaf6,
  trim: 0xfff6ef,
  frame: 0xffffff,
  hedge: 0x7cc06e,
  hedgeDark: 0x62ad5c,
  gold: 0xe6bd6a,
  brass: 0xd9a84e,
}

export type RoomParts = {
  group: Group
  /** The door leaf, turning about its hinge (rotation.y). */
  door: Object3D
  /** The shop bell over the door (rotation.x swings it). */
  bell: Object3D
  /** Repaint the floor's shade layer (corner occlusion and contact shadows) for the furniture there now. */
  setShade: (blobs: ShadeBlob[]) => void
  /** The floor and wall upgrades (unlocks.ts tiers): oak, herringbone or marble; plaster or silk. */
  setTiers: (floor: number, walls: number) => void
  /** The garden's breeze and butterflies, and the salon's name on the sign at the gate. */
  garden: ReturnType<typeof buildGarden>
}

const { w: W, d: D, wallH: H, wallT: T, lowWallH: LOW } = ROOM3

export function buildRoom(): RoomParts { return piece('room', buildShell) }

function buildShell(): RoomParts {
  const group = new Group()
  group.name = 'room'
  const kit = new Kit()

  // ---- floor
  const wood = woodTexture()
  wood.repeat.set(W / 2, D / 2)
  const floor = new Mesh(new PlaneGeometry(W, D), new MeshStandardMaterial({ map: wood, roughness: 0.74, metalness: 0, envMapIntensity: 0.3 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, D / 2)
  floor.receiveShadow = true
  floor.name = 'floor'
  group.add(floor)

  // The shade layer, multiplied over the floor.
  const shadeCanvas = document.createElement('canvas')
  const shadeTex = new CanvasTexture(shadeCanvas)
  const shade = new Mesh(new PlaneGeometry(W, D), new MeshBasicMaterial({ map: shadeTex, blending: MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, toneMapped: false }))
  shade.rotation.x = -Math.PI / 2
  shade.position.set(0, 0.004, D / 2)
  shade.renderOrder = 1
  group.add(shade)
  const setShade = (blobs: ShadeBlob[]) => {
    paintShade(shadeCanvas, W, D, blobs, { back: true, right: true, left: false })
    shadeTex.needsUpdate = true
  }
  setShade([])

  // ---- outside: the street-front garden (garden.ts, from the layout)
  const garden = buildGarden()
  group.add(garden.group)
  const doorZ0 = toWorld(0, DOOR_Y0).z, doorZ1 = toWorld(0, DOOR_Y1).z

  // ---- the tall walls
  // Back wall: its inner face is Z = 0, from the left wall's outer face to the right wall's outer face.
  kit.add(G.box(W + 2 * T, H, T, 0.01), COLORS.wallCut, 'matte', tf(0, H / 2, -T / 2))
  // Right wall: inner face X = W/2, from the back wall to the front ledge.
  kit.add(G.box(T, H, D + T, 0.01), COLORS.wallCut, 'matte', tf(W / 2 + T / 2, H / 2, (D - T) / 2 + T / 2))
  // Painted inner faces.
  // Arched niches: behind the reception, around the wall decor spots, between the windows.
  const backArches = WALL_SLOTS
  const backFace = new Mesh(new PlaneGeometry(W, H), new MeshStandardMaterial({ map: wallTexture(W, H, 'right', backArches), roughness: 0.92 }))
  const rightArches: number[] = []
  backFace.position.set(0, H / 2, 0.002)
  backFace.receiveShadow = true
  group.add(backFace)
  const rightFace = new Mesh(new PlaneGeometry(D, H), new MeshStandardMaterial({ map: wallTexture(D, H, 'left', rightArches), roughness: 0.92 }))
  rightFace.rotation.y = -Math.PI / 2
  rightFace.position.set(W / 2 - 0.002, H / 2, D / 2)
  rightFace.receiveShadow = true
  group.add(rightFace)
  // Chunky white caps along the tops, a skirting board and a chair rail.
  kit.add(G.box(W + 2 * T + 0.06, 0.1, T + 0.08, 0.04), COLORS.cap, 'satin', tf(0, H + 0.03, -T / 2))
  kit.add(G.box(T + 0.08, 0.1, D + T + 0.06, 0.04), COLORS.cap, 'satin', tf(W / 2 + T / 2, H + 0.03, (D - T) / 2 + T / 2))
  kit.add(G.box(W, 0.14, 0.035, 0.012), COLORS.trim, 'satin', tf(0, 0.07, 0.018))
  kit.add(G.box(0.035, 0.14, D, 0.012), COLORS.trim, 'satin', tf(W / 2 - 0.018, 0.07, D / 2))
  // Crown moulding.
  kit.add(G.box(W, 0.07, 0.06, 0.02), COLORS.trim, 'satin', tf(0, H - 0.05, 0.03))
  kit.add(G.box(0.06, 0.07, D, 0.02), COLORS.trim, 'satin', tf(W / 2 - 0.03, H - 0.05, D / 2))

  // ---- the low walls (cut away): the left wall with the door gap, and the front
  const lowWall = (x: number, z: number, w: number, d: number) => {
    kit.add(G.box(w, LOW, d, 0.02), COLORS.wallCut, 'matte', tf(x, LOW / 2, z))
    kit.add(G.box(w + 0.05, 0.07, d + 0.05, 0.03), COLORS.cap, 'satin', tf(x, LOW + 0.02, z))
  }
  lowWall(-W / 2 - T / 2, doorZ0 / 2, T, doorZ0 + 0.001)
  lowWall(-W / 2 - T / 2, (doorZ1 + D + T) / 2, T, D + T - doorZ1)
  lowWall(0, D + T / 2, W + 2 * T, T)
  // The left wall's join with the back wall rises as a short pillar, so the cut reads as a cut.
  kit.add(G.box(T + 0.06, H + 0.1, T + 0.06, 0.04), COLORS.cap, 'satin', tf(-W / 2 - T / 2, (H + 0.1) / 2, -T / 2))

  // ---- the entrance: the cut wall opens between two round pillars; a low glass gate swings in as people pass
  const postH = 1.25
  for (const z of [doorZ0 - 0.06, doorZ1 + 0.06]) {
    kit.add(G.cyl(0.13, 0.15, postH, 20), COLORS.frame, 'satin', tf(-W / 2 - T / 2, postH / 2, z))
    kit.add(G.cyl(0.16, 0.16, 0.06, 20), COLORS.gold, 'metal', tf(-W / 2 - T / 2, postH + 0.03, z))
    kit.add(G.sphere(0.09, 12), COLORS.gold, 'metal', tf(-W / 2 - T / 2, postH + 0.12, z))
  }
  // A doormat.
  kit.add(G.box(0.8, 0.015, doorZ1 - doorZ0 - 0.2, 0.01), 0xd98fa6, 'matte', tf(-W / 2 + 0.45, 0.008, (doorZ0 + doorZ1) / 2))
  const door = new Group()
  door.position.set(-W / 2 - T / 2, 0, doorZ0 + 0.08)
  const leafLen = doorZ1 - doorZ0 - 0.16
  const leaf = new Kit()
  piece('skip:door', () => {
  leaf.add(G.box(0.06, 0.9, 0.08, 0.03), COLORS.frame, 'satin', tf(0, 0.5, 0.04))
  leaf.add(G.box(0.06, 0.9, 0.08, 0.03), COLORS.frame, 'satin', tf(0, 0.5, leafLen - 0.04))
  leaf.add(G.box(0.07, 0.08, leafLen, 0.03), COLORS.frame, 'satin', tf(0, 0.94, leafLen / 2))
  leaf.add(G.box(0.07, 0.08, leafLen, 0.03), COLORS.frame, 'satin', tf(0, 0.1, leafLen / 2))
  leaf.add(G.box(0.02, 0.76, leafLen - 0.12, 0.005), 0xcfe8f4, 'glass', tf(0, 0.52, leafLen / 2))
  leaf.add(G.box(0.03, 0.02, leafLen - 0.1, 0.005), COLORS.gold, 'metal', tf(0.02, 0.52, leafLen / 2))
  })
  door.add(leaf.build())
  group.add(door)
  // The shop bell, on a little gold bracket from the inner pillar.
  const bell = new Group()
  bell.position.set(-W / 2 + 0.1, postH + 0.02, doorZ0 - 0.06)
  const bk = new Kit()
  piece('skip:bell', () => {
  bk.add(G.lathe('bell', [[0, -0.16], [0.07, -0.16], [0.065, -0.12], [0.045, -0.06], [0.03, -0.03], [0, -0.02]]), COLORS.gold, 'metal')
  bk.add(G.sphere(0.018, 8), COLORS.brass, 'metal', tf(0, -0.17, 0))
  bk.add(G.cyl(0.004, 0.004, 0.02, 6), COLORS.brass, 'metal', tf(0, -0.01, 0))
  })
  bell.add(bk.build(false))
  kit.add(G.box(0.26, 0.025, 0.025, 0.01), COLORS.gold, 'metal', tf(-W / 2 - T / 2 + 0.13, postH + 0.03, doorZ0 - 0.06))
  group.add(bell)

  // ---- windows (arched, inside the wall's height) and sconces, where the layout puts them
  const winW = WIN.w, winBottom = WIN.bottom, winH = WIN.h
  const addWindow = (cx: number, cz: number, ry: number) => {
    const f = tf(cx, 0, cz, 0, ry, 0)
    kit.at(f, () => {
      // Frame: sides, sill, the arch and a mullion.
      kit.add(G.box(0.08, winH, 0.07, 0.02), COLORS.frame, 'satin', tf(-winW / 2, winBottom + winH / 2, 0.03))
      kit.add(G.box(0.08, winH, 0.07, 0.02), COLORS.frame, 'satin', tf(winW / 2, winBottom + winH / 2, 0.03))
      kit.add(G.box(winW + 0.24, 0.07, 0.18, 0.025), COLORS.frame, 'satin', tf(0, winBottom - 0.02, 0.07))
      kit.add(G.torus(winW / 2, 0.04, Math.PI, 24), COLORS.frame, 'satin', tf(0, winBottom + winH, 0.03))
      kit.add(G.box(0.04, winH + winW / 2 - 0.06, 0.04, 0.01), COLORS.frame, 'satin', tf(0, winBottom + (winH + winW / 2) / 2, 0.02))
      kit.add(G.box(winW, 0.04, 0.04, 0.01), COLORS.frame, 'satin', tf(0, winBottom + winH * 0.62, 0.02))
    })
    const glass = new Mesh(new PlaneGeometry(winW, winH + winW / 2), new MeshBasicMaterial({ map: windowView(true), transparent: true, toneMapped: false, side: DoubleSide }))
    glass.material.color.setScalar(0.96)
    glass.position.set(cx, winBottom + (winH + winW / 2) / 2, cz)
    glass.rotation.y = ry
    glass.translateZ(0.006)
    group.add(glass)
  }
  WINDOW_SPOTS.forEach((w, i) => { const p = onWall(w.wall, w.u); piece(`mount:window${i}`, () => addWindow(p.x, p.z, p.ry)) })
  const sconce = (x: number, z: number, ry: number) => kit.at(tf(x, 0, z, 0, ry, 0), () => {
    kit.add(G.box(0.12, 0.2, 0.05, 0.02), COLORS.gold, 'metal', tf(0, 1.96, 0.025))
    kit.add(G.sphere(0.09, 12), 0xfff1d6, 'glow', tf(0, 2.04, 0.11, 0, 0, 0, 1, 0.8, 1))
    kit.add(G.cyl(0.11, 0.06, 0.1, 14), COLORS.gold, 'metal', tf(0, 1.96, 0.11))
  })
  SCONCE_SPOTS.forEach((sp, i) => { const p = onWall(sp.wall, sp.u); piece(`mount:sconce${i}`, () => sconce(p.x, p.z, p.ry)) })

  // ---- partitions: low white walls with rounded ends that split the salon into zones
  PARTITIONS.forEach((p, i) => piece(`mount:partition${i}`, () => {
    const a = toWorld(p.x + p.w / 2, p.y + p.h / 2)
    const alongX = p.w >= p.h
    const len = alongX ? lenX(p.w) : lenZ(p.h)
    const th = 0.2, ph = 0.95
    const ry = alongX ? 0 : Math.PI / 2
    kit.at(tf(a.x, 0, a.z, 0, ry, 0), () => {
      kit.add(G.box(len - th, ph, th, 0.03), COLORS.cap, 'satin', tf(0, ph / 2, 0))
      for (const s of [-1, 1]) kit.add(G.cyl(th / 2, th / 2, ph, 16), COLORS.cap, 'satin', tf(s * (len - th) / 2, ph / 2, 0))
      kit.add(G.box(len - th, 0.05, th + 0.04, 0.02), 0xf6d2c8, 'satin', tf(0, ph + 0.01, 0))
      for (const s of [-1, 1]) kit.add(G.cyl(th / 2 + 0.02, th / 2 + 0.02, 0.05, 16), 0xf6d2c8, 'satin', tf(s * (len - th) / 2, ph + 0.01, 0))
      kit.add(G.box(len - th, 0.03, th + 0.01, 0.01), COLORS.gold, 'metal', tf(0, 0.12, 0))
    })
  }))

  group.add(kit.build())
  let tiers = '1,1'
  const setTiers = (floorTier: number, wallTier: number) => {
    const key = `${floorTier},${wallTier}`
    if (key === tiers) return
    const [f0, w0] = tiers.split(',').map(Number)
    tiers = key
    const fm = floor.material as MeshStandardMaterial
    if (floorTier !== f0) {
      fm.map?.dispose()
      const t = floorTier >= 3 ? marbleTexture() : floorTier === 2 ? herringboneTexture() : woodTexture()
      t.repeat.set(W / 2, D / 2)
      fm.map = t
      fm.roughness = floorTier >= 3 ? 0.28 : 0.74
      fm.needsUpdate = true
    }
    if (wallTier !== w0) {
      for (const [m, w, corner, arches] of [[backFace, W, 'right', backArches], [rightFace, D, 'left', rightArches]] as const) {
        const mat = m.material as MeshStandardMaterial
        mat.map?.dispose()
        mat.map = wallTexture(w, H, corner, [...arches], wallTier >= 2)
        mat.needsUpdate = true
      }
    }
  }
  return { group, door, bell, setShade, setTiers, garden }
}
