import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Sprite, SpriteMaterial, Vector3, Box3, type Texture } from 'three'
import { paintGift } from '../art/salon/gift-art.ts'
import { paintFillerFrame, paintWallArt, type Piece } from '../art/salon/furniture.ts'
import { DECOR_ITEM_BY_ID, GIFT_BY_ID, placeDecor } from '../core/decor.ts'
import type { StationKind } from '../core/economy.ts'
import { DESK, FIXTURES, PROP_BLOCK, PROP_SPOTS, SLOTS, SOFA, SOFA_SEATS } from '../core/floor.ts'
import { starsOwned, tierOf } from '../core/unlocks.ts'
import { aquarium, bigPlant, decorItem, desk, facialChair, floorDecal, floorLamp, fountainGarden, giftStand, glowSign, lounge, nailDesk, pedicureChair, pendantLight, succulent, topiary, trophyShelf, waitingCorner, welcomeSign, type Build, type Node3, type StationNodes } from './furniture.ts'
import { G, Kit, piece, tf } from './kit.ts'
import { AQUARIUM_SPOT, ART, BOTTLES, CURTAIN_Y, decorSpot, DESK_TOP, FLOOR_SLOTS, FRONT_LAMP, GIFT_R, GIFT_SPOTS, LIGHTS, NEON, onWall, PLANT_SPOT, TOPIARIES, TROPHY, WALL_SLOTS, WELCOME, WINDOW_SPOTS } from './layout.ts'
import { lenX, lenZ, ROOM3, toWorld, type V2 } from './mapping.ts'
import { stationKeys, stylable } from './pieces.ts'
import { armchairsModel, decorModel, deskModel, loungeModel, placeModel, stationModel } from './model-pieces.ts'
import { setPalette, styleColor } from './styles.ts'
import { fromCanvas, glowTexture, plaqueTexture, rugTexture, slotTexture, tex } from './textures.ts'

/**
 * Everything that stands in the salon for a given state, built into one batch: the reception, the lounge, the
 * stations, the starter pieces, the decor sets, the upgrades and the gifts. Pure three.js (no Pixi), so the mesh
 * layout check (tests/floor3d-mesh.test.ts) builds exactly what the floor view shows, piece by named piece.
 */
export type FurnishSpec = {
  owned: readonly string[]
  stations: readonly { id: string; kind: StationKind; slot: number }[]
  styles: Record<string, number>
  decorOrder: readonly string[]
  salonName: string
  /** Stations waiting for a slot: empty slots show as glowing pads to tap. */
  placing: boolean
  /** The piece being restyled: built into `iso` so it can pop on its own. */
  isoKey: string | null
}
export type StylePiece = { key: string; box: Box3; at: Vector3 }
export type Furnished = {
  deskC: V2; deskW: number; deskD: number
  sofaSeats: Node3[]
  stations: { id: string; kind: StationKind; slot: number; key: string; at: V2; nodes: StationNodes }[]
  /** The glowing pads of empty slots while a station waits to be placed. */
  pads: { slot: number; mesh: Mesh }[]
  stylePieces: StylePiece[]
  isoAt: Vector3 | null
  glows: { s: Sprite; base: number; ph: number }[]
  twinkle: Points | null
  neon: Mesh | null
  fish: InstancedMesh | null
  fishAt: Vector3
}

export function furnish(b: Build, iso: Build, spec: FurnishSpec): Furnished {
  const { owned: ownedList, styles } = spec
  const owned = new Set(ownedList)
  const decor = placeDecor(ownedList, spec.decorOrder)
  const w = (x: number, y: number) => toWorld(x, y)
  const out: Furnished = { deskC: { x: 0, z: 0 }, deskW: 0, deskD: 0, sofaSeats: [], stations: [], pads: [], stylePieces: [], isoAt: null, glows: [], twinkle: null, neon: null, fish: null, fishAt: new Vector3() }
  // The piece being restyled is built on its own pivot, so it can squash and stretch as its style changes.
  const into = <T>(key: string, x: number, z: number, box: Box3, fn: (bb: Build) => T, name = key): T => piece(name, () => {
    if (stylable(key)) out.stylePieces.push({ key, box, at: new Vector3(x, 0, z) })
    if (key !== spec.isoKey) return fn(b)
    out.isoAt = new Vector3(x, 0, z)
    return fn(iso)
  })
  const boxAt = (x: number, z: number, rx: number, rz: number, h: number) => new Box3(new Vector3(x - rx, 0, z - rz), new Vector3(x + rx, h, z + rz))
  const glow = (color: number, opacity: number, size: number, x: number, y: number, z: number) => {
    const s = new Sprite(new SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, toneMapped: false }))
    s.renderOrder = 3
    s.scale.setScalar(size)
    s.position.set(x, y, z)
    b.extra.add(s)
    return s
  }
  const lampGlow = (x: number, y: number, z: number, size: number) => glow(0xffe2b0, 0.55, size, x, y, z)

  // ---- front of house: the reception out from the wall (the computer faces the staff gap behind it)
  const deskC = w(DESK.x + DESK.w / 2, DESK.y + DESK.h / 2)
  const deskW = lenX(DESK.w) - 0.1, deskD = Math.min(0.85, lenZ(DESK.h) - 0.1)
  Object.assign(out, { deskC, deskW, deskD })
  into('desk', deskC.x, deskC.z, boxAt(deskC.x, deskC.z, deskW / 2, deskD / 2, 1.4), bb => deskModel(bb, deskC.x, deskC.z, deskW, styles.desk ?? 0, tierOf(ownedList, 'desk')) || desk(bb, deskC.x, deskC.z, deskW, deskD, styleColor(styles, 'desk'), tierOf(ownedList, 'desk')))
  const plaque = plaqueTexture(spec.salonName)
  const pw = Math.min(deskW - 0.8, 0.2 * plaque.aspect)
  const pm = new Mesh(new PlaneGeometry(pw, pw / plaque.aspect), new MeshBasicMaterial({ map: plaque.tex, transparent: true, toneMapped: false }))
  pm.position.set(deskC.x - 0.35, 0.8, deskC.z + deskD / 2 + 0.012)
  b.extra.add(pm)
  // The lounge: a teal cloud sofa against the back wall, and facing it across one big round rug, two armchairs
  // round a coffee table.
  const sofaZ = 0.62
  const lc = w(SOFA.x + SOFA.w / 2, 0)
  out.sofaSeats = into('lounge', lc.x, sofaZ, boxAt(lc.x, sofaZ + 0.3, lenX(SOFA.w) / 2, 0.6, 1.1), bb => loungeModel(bb, lc.x, sofaZ + 0.16, styles.lounge ?? 0, tierOf(ownedList, 'lounge')) ?? lounge(bb, sofaZ, SOFA_SEATS.map(s => w(s.x, s.y).x), styleColor(styles, 'lounge'), tierOf(ownedList, 'lounge')))
  const wc = FIXTURES.waiting, wa = w(wc.x + wc.w / 2, wc.y + wc.h / 2)
  const rugZ0 = sofaZ - 0.45, rugZ1 = wa.z + lenZ(wc.h) / 2 + 0.35
  floorDecal(b, rugTexture('round', '#bfeee4', '#7fd4c2', '#ffffff'), lc.x, (rugZ0 + rugZ1) / 2, lenX(SOFA.w) + 0.5, rugZ1 - rugZ0, 0.004)
  piece('armchairs', () => armchairsModel(b, wa.x, wa.z, lenX(wc.w), 0) || waitingCorner(b, wa.x, wa.z, lenX(wc.w), lenZ(wc.h)))
  piece('welcome', () => placeModel(b, 'a-frame-sign', WELCOME.x, WELCOME.z, 0.87 - Math.PI, { style: 0 }) || welcomeSign(b, WELCOME.x, WELCOME.z, 1.1))
  piece('frontLamp', () => placeModel(b, 'floor-lamp', FRONT_LAMP.x, FRONT_LAMP.z, 0, { style: 2 }) || floorLamp(b, FRONT_LAMP.x, FRONT_LAMP.z, 0xfbe0e8))
  lampGlow(FRONT_LAMP.x, 1.5, FRONT_LAMP.z, 0.6)
  // The little fountain planter in the front right corner (the fountain garden upgrade grows there).
  if (!owned.has('up-fountain')) { const pc = FIXTURES.planter, pa = w(pc.x + pc.w / 2, pc.y + pc.h / 2); piece('planter', () => placeModel(b, 'plant-floor', pa.x - 0.04, pa.z, 0, { fit: 0.7 }) || fountainGarden(b, pa.x, pa.z, lenX(pc.w), lenZ(pc.h))) }
  // A wall shelf of bottles on the right wall, and topiaries along the walls and at the partitions' ends.
  piece('mount:bottles', () => { const p = onWall(BOTTLES.wall, BOTTLES.u); decorItem(b, 'shelf', [0xffffff, 0xcdbdf2, 0xf6a9c2, 0xfbe0a0], p.x, BOTTLES.y, p.z, p.ry) })
  TOPIARIES.forEach((t, i) => piece(`topiary${i}`, () => placeModel(b, 'plant-floor', t.x, t.z, 0, { k: 0.62 * t.k }) || topiary(b, t.x, t.z, t.k)))
  // A runner by the front.
  const runner = w(440, 700)
  floorDecal(b, rugTexture('runner', '#fff3e6', '#ffc94d', '#f7a9bd'), runner.x, runner.z, 3.4, 1.1, 0.005)

  // ---- stations, and the glowing pads of empty slots while a new station waits to be placed
  const used = new Set(spec.stations.map(s => s.slot))
  if (spec.placing) SLOTS.forEach((p, i) => {
    if (used.has(i)) return
    const at = w(p.x, p.y)
    out.pads.push({ slot: i, mesh: floorDecal(b, slotTexture(true), at.x, at.z, lenX(160), lenZ(112), 0.012, 0, true) })
  })
  const keys = stationKeys(ownedList)
  for (const st of spec.stations) {
    if (st.slot < 0) continue
    const p = SLOTS[st.slot]
    const at = w(p.x, p.y)
    const key = keys[Number(st.id.slice(1))] ?? 'facial-chair-1'
    const color = styleColor(styles, key), tier = tierOf(ownedList, st.kind)
    const nodes = into(key, at.x, at.z, boxAt(at.x, at.z, 1.0, 0.7, 1.4), bb => stationModel(bb, st.kind, at.x, at.z, styles[key] ?? 0, tier) ?? (st.kind === 'facial' ? facialChair(bb, at.x, at.z, color, tier) : st.kind === 'feet' ? pedicureChair(bb, at.x, at.z, color, tier) : nailDesk(bb, at.x, at.z, color, tier)), `station${st.slot}:${key}`)
    if (tierOf(ownedList, 'lights') >= 2) piece(`pendant${st.slot}`, () => pendantLight(b, at.x + 0.1, at.z))
    out.stations.push({ ...st, key, at, nodes })
  }

  // ---- empty decor slots get a little filler until something is bought for them
  const taken = new Set(decor.map(d => `${d.place}:${d.slot}`))
  /** A painted picture flat on the back wall at `u`, no wider than `maxW`. */
  const wallPic = (pic: Piece, u: number, y: number, maxW: number) => {
    const k = Math.min(maxW / (lenX(pic.w) * 1.1), 1.6)
    const m = new Mesh(new PlaneGeometry(lenX(pic.w) * 1.1 * k, lenX(pic.h) * 1.1 * k), new MeshBasicMaterial({ map: fromCanvas(pic.canvas), transparent: true, toneMapped: false }))
    ;(m.material as MeshBasicMaterial).color.setScalar(0.94)
    m.position.set(onWall('back', u).x, y, 0.012)
    b.extra.add(m)
  }
  WALL_SLOTS.forEach((u, i) => { if (!taken.has(`wall:${i}`)) wallPic(cachedPiece(`filler${i}`, () => paintFillerFrame(i)), u, 1.7, 0.7) })
  FLOOR_SLOTS.forEach((s, i) => { if (!taken.has(`floor:${i}`) && i !== 3) piece(`succulent${i}`, () => placeModel(b, 'plant-small', s.x, s.z) || succulent(b, s.x, s.z)) })

  // ---- starter decor
  if (owned.has('rug')) { const a = w(PROP_SPOTS.rug.x, PROP_SPOTS.rug.y); const c = css(styleColor(styles, 'rug')); into('rug', a.x, a.z, boxAt(a.x, a.z, 1.2, 0.85, 0.2), bb => placeModel(bb, 'rug', a.x, a.z, 0, { style: styles.rug ?? 0, k: 1.15 }) || floorDecal(bb, rugTexture('cloud', '#fdf6fb', c, c), a.x, a.z, 2.6, 1.9, 0.006)) }
  if (owned.has('plant')) into('plant', PLANT_SPOT.x, PLANT_SPOT.z, boxAt(PLANT_SPOT.x, PLANT_SPOT.z, 0.45, 0.45, 1.9), bb => placeModel(bb, 'plant-pot', PLANT_SPOT.x, PLANT_SPOT.z, 0, { style: styles.plant ?? 0 }) || bigPlant(bb, PLANT_SPOT.x, PLANT_SPOT.z, styleColor(styles, 'plant'), PLANT_SPOT.k))
  // ---- the salon's upgrades (core/unlocks.ts): the fountain garden and the trophy shelf of stars
  if (owned.has('up-fountain')) {
    const r = PROP_BLOCK['up-fountain'], a = w(r.x + r.w / 2, r.y + r.h / 2)
    piece('up-fountain', () => placeModel(b, 'fountain', a.x, a.z, 0, { fit: lenX(r.w) }) || fountainGarden(b, a.x, a.z, lenX(r.w), lenZ(r.h)))
  }
  const stars = starsOwned(ownedList)
  if (stars) piece('mount:trophies', () => { const p = onWall(TROPHY.wall, TROPHY.u); trophyShelf(b, p.x, TROPHY.y, p.z, p.ry, stars) })
  if (owned.has('candles')) piece('candles', () => {
    const a = { x: deskC.x + 0.75, z: deskC.z + 0.12 }
    for (const [dx, h] of [[0, 0.16], [0.08, 0.11], [-0.07, 0.09]] as const) {
      b.kit.add(G.cyl(0.03, 0.03, h, 10), 0xfff4e6, 'satin', tf(a.x + dx, DESK_TOP + h / 2, a.z))
      b.kit.add(G.sphere(0.014, 6), 0xffc27a, 'glow', tf(a.x + dx, DESK_TOP + 0.015 + h, a.z, 0, 0, 0, 0.8, 1.4, 0.8))
    }
    lampGlow(a.x, 1.25, a.z, 0.25)
  })
  if (owned.has('art')) wallPic(cachedPiece('art', paintWallArt), ART.u, (ART.y0 + ART.y1) / 2, ART.w)
  if (owned.has('lights')) piece('mount:lights', () => {
    // Fairy lights swag along the top of the back wall; each bulb's halo twinkles on its own.
    const halo: number[] = []
    for (let i = 0; i <= 40; i++) {
      const x = -ROOM3.w / 2 + 0.3 + (i / 40) * (ROOM3.w - 0.6)
      const sag = 0.18 * Math.sin(((i % 8) / 8) * Math.PI)
      b.kit.add(G.sphere(0.028, 6), i % 3 ? 0xffd9a0 : 0xffc0d0, 'glow', tf(x, LIGHTS.y1 - 0.02 - sag * 0.25, 0.05))
      halo.push(x, LIGHTS.y1 - 0.02 - sag * 0.25, 0.07)
    }
    const hg = new BufferGeometry()
    hg.setAttribute('position', new Float32BufferAttribute(halo, 3))
    out.twinkle = new Points(hg, new PointsMaterial({ map: glowTex(), size: 0.22, transparent: true, depthWrite: false, blending: AdditiveBlending, color: 0xffc27a, opacity: 0.5, toneMapped: false }))
    b.extra.add(out.twinkle)
  })
  if (owned.has('neon')) out.neon = glowSign(b, neonTexture(), onWall('back', NEON.u).x, (NEON.y0 + NEON.y1) / 2, 0.01, NEON.w, NEON.y1 - NEON.y0)
  if (owned.has('aquarium')) piece('aquarium', () => {
    const { x, z } = AQUARIUM_SPOT
    aquarium(b, x, z, Math.PI / 2)
    const fish = new InstancedMesh(G.sphere(0.03, 8), new MeshBasicMaterial({ toneMapped: false }), 3)
    ;[0xffa46b, 0xffd35a, 0xf48fb1].forEach((c, i) => fish.setColorAt(i, new Color(c)))
    out.fish = fish
    out.fishAt.set(x, 0.98, z)
    b.extra.add(fish)
  })
  if (owned.has('chandelier')) piece('chandelier', () => {
    const a = w(PROP_SPOTS.chandelier.x, 0)
    if (!placeModel(b, 'luxe-gold--chandelier', a.x, 1.7, 0, { k: 0.9, y: ROOM3.wallH - 2.9 * 0.9 - 0.02 })) decorItem(b, 'chandelier', [0xf7c6d4, 0xffffff, 0xffffff, 0xfbe0a0], a.x, 2.45, 1.7)
    out.glows.push({ s: glow(0xfff0d0, 0.5, 1.4, a.x, 2.45, 1.7), base: 0.5, ph: 1 })
  })
  // ---- decor sets, in their slots
  for (const d of decor) {
    const item = DECOR_ITEM_BY_ID[d.id]
    const pal = setPalette(styles, d.id)
    const sp = decorSpot(item.place, d.slot, item.kind)
    const hung = item.place === 'wall' || item.place === 'window'
    const bx = hung ? boxAt(sp.x, 0.15, 0.6, 0.3, 2.6) : item.place === 'ceiling' ? boxAt(sp.x, sp.z, 0.5, 0.5, 2.8) : boxAt(sp.x, sp.z, 0.6, 0.5, 1.6)
    out.stylePieces.push({ key: d.id, box: bx, at: new Vector3(sp.x, 0, hung ? 0.2 : sp.z) })
    piece(`${item.place === 'wall' || item.place === 'window' ? 'mount:' : ''}${d.id}@${item.place}${d.slot}`, () => {
      if (item.place === 'window') for (const wsp of WINDOW_SPOTS) { const p = onWall(wsp.wall, wsp.u); decorItem(b, 'curtains', pal, p.x, CURTAIN_Y, p.z, p.ry) }
      else if (item.place === 'rug') floorDecal(b, rugTexture(item.kind === 'sand' ? 'plain' : 'round', css(pal[0]), css(pal[1]), css(pal[2])), sp.x, sp.z, item.size === 2 ? 3.0 : 2.3, item.size === 2 ? 2.0 : 1.5, 0.007)
      else if (!decorModel(b, d.id, item.place, d.slot, sp)) decorItem(b, item.kind, pal, sp.x, sp.y, sp.z, sp.ry, sp.k)
    })
  }
  // ---- gifts from friends, on little stands in the gift spots
  ownedList.filter(id => GIFT_BY_ID[id]).slice(0, GIFT_SPOTS.length).forEach((id, i) => {
    const spot = GIFT_SPOTS[i]
    const regular = GIFT_BY_ID[id]?.regular ?? ''
    const pic = cachedPiece(`gift:${regular}`, () => paintGift(regular) ?? paintFillerFrame(i))
    piece(`gift${i}`, () => placeModel(b, `gift-${regular}`, spot.x, spot.z, spot.ry, { fit: GIFT_R }) || giftStand(b, fromCanvas(pic.canvas), spot.x, spot.z, spot.ry))
  })
  return out
}

/** A fresh batch to build into. */
export const newBuild = (): Build => ({ kit: new Kit(), extra: new Group(), blobs: [] })

export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`

const pieceCache = new Map<string, Piece>()
function cachedPiece(key: string, make: () => Piece): Piece { let p = pieceCache.get(key); if (!p) { p = make(); pieceCache.set(key, p) } return p }

let glowT: Texture | null = null
export const glowTex = () => (glowT ??= glowTexture())

/** The neon sign: "glow" in a pink tube with a soft halo. */
function neonTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const ctx = c.getContext('2d')!
  ctx.font = 'italic 700 150px Fredoka, Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(255,110,170,0.95)'
  ctx.shadowBlur = 40
  ctx.strokeStyle = '#ff8cc0'
  ctx.lineWidth = 12
  ctx.strokeText('glow', 256, 132)
  ctx.shadowBlur = 12
  ctx.strokeStyle = '#ffe3f0'
  ctx.lineWidth = 4
  ctx.strokeText('glow', 256, 132)
  return tex(c)
}
