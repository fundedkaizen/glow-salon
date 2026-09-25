import { PerspectiveCamera, Vector3 } from 'three'
import { ROOM3 } from './mapping.ts'

/**
 * The salon camera: tilted down at the room from the front left, the way Serenity's Spa looks at its salon, with
 * a long lens so furniture keeps its shape across the room. `frame()` fits the room to the screen (under the
 * HUD) in landscape and on a portrait phone; when the fit would make people too small to read, it moves in and
 * follows the local player, never showing past the room. `focus()` glides in on something new for a moment.
 */
export type Frame = { w: number; h: number; top: number; bottom: number; side: number }

const _v = new Vector3()

export class CameraRig {
  readonly camera = new PerspectiveCamera(28, 1, 0.5, 200)
  /** The camera's bearing around the room: negative puts it at the front left. */
  yaw = -0.3
  /** How steeply it looks down (radians above the horizon). */
  pitch = 0.9
  private target = new Vector3()
  private dist = 30
  private view: Frame = { w: 1280, h: 800, top: 70, bottom: 12, side: 12 }
  // Fitted framing for the current screen: the room's centre, the fit distance, and how far it may pan.
  private fitT = new Vector3()
  private fitD = 30
  private useD = 30
  private panR: [number, number] = [0, 0]
  private panF: [number, number] = [0, 0]
  private pan = { r: 0, f: 0 }
  private focusAt: { p: Vector3; t: number; dur: number } | null = null
  /** The points that must show: the floor's corners, the tall walls' tops, the door path outside. */
  private points: Vector3[]

  constructor() {
    const { w: W, d: D, wallH: H } = ROOM3
    this.points = [
      new Vector3(-W / 2 - 0.3, 0, 0), new Vector3(W / 2, 0, 0), new Vector3(-W / 2 - 0.3, 0, D + 0.3), new Vector3(W / 2, 0, D + 0.3),
      new Vector3(-W / 2, H * 0.72, 0), new Vector3(W / 2, H * 0.72, 0), new Vector3(W / 2, H * 0.72, D * 0.5),
    ]
  }

  private right = new Vector3()
  private fwd = new Vector3()
  /** Towards the back wall on the ground (panning this way moves the room down the screen). */
  private back = new Vector3()

  private place(target: Vector3, d: number) {
    const cp = Math.cos(this.pitch)
    this.camera.position.set(target.x + Math.sin(this.yaw) * cp * d, target.y + Math.sin(this.pitch) * d, target.z + Math.cos(this.yaw) * cp * d)
    this.camera.lookAt(target)
    this.camera.updateMatrixWorld(true)
  }

  /** The room's bounds on screen (NDC) from a target and distance. */
  private bounds(target: Vector3, d: number) {
    this.place(target, d)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of this.points) {
      _v.copy(p).project(this.camera)
      x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y)
    }
    return { x0, x1, y0, y1 }
  }

  /** The screen's usable area in NDC (the HUD at the top, a little margin elsewhere). */
  private area() {
    const { w, h, top, bottom, side } = this.view
    return { x0: -1 + (2 * side) / w, x1: 1 - (2 * side) / w, y0: -1 + (2 * bottom) / h, y1: 1 - (2 * top) / h }
  }

  /** New screen size: fit the room again. `demo`: the title backdrop (cover the screen, no player to follow). */
  frame(view: Frame, demo: boolean) {
    this.view = view
    this.camera.aspect = view.w / Math.max(1, view.h)
    this.camera.updateProjectionMatrix()
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    this.fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    this.back.copy(this.fwd).negate()
    const a = this.area()
    // Fit: centre the room's bounds in the usable area, and find the distance at which they just fit.
    const t = new Vector3(0, 0.4, ROOM3.d / 2)
    const fitAt = (mode: 'all' | 'cover' | 'depth') => {
      let lo = 4, hi = 120
      for (let i = 0; i < 26; i++) {
        const d = (lo + hi) / 2
        this.centre(t, d, a)
        const b = this.bounds(t, d)
        const kx = (b.x1 - b.x0) / (a.x1 - a.x0), ky = (b.y1 - b.y0) / (a.y1 - a.y0)
        const k = mode === 'cover' ? Math.min(kx, ky) : mode === 'depth' ? ky : Math.max(kx, ky)
        if (k > 1) lo = d; else hi = d
      }
      return hi
    }
    this.fitD = fitAt('all')
    this.centre(t, this.fitD, a)
    this.fitT.copy(t)
    // A phone (portrait, or a short landscape screen) frames the room front to back and pans sideways with the
    // player, as the 2D floor does; a desktop sees the whole room. The angle never changes.
    const small = view.h > view.w * 1.2 || view.h < 560
    this.useD = demo ? Math.min(this.fitD, fitAt('cover')) : small ? Math.min(this.fitD, fitAt('depth')) : this.fitD
    this.useD = Math.max(this.useD, 9)
    // How far the camera may pan (sideways and in depth) at that distance without showing past the room.
    this.panR = this.panRange(this.right, a, 'x')
    this.panF = this.panRange(this.back, a, 'y')
  }

  /** Nudge the target so the room's bounds sit centred in the usable area. */
  private centre(t: Vector3, d: number, a: ReturnType<CameraRig['area']>) {
    for (let i = 0; i < 4; i++) {
      const b = this.bounds(t, d)
      const ox = (b.x0 + b.x1) / 2 - (a.x0 + a.x1) / 2, oy = (b.y0 + b.y1) / 2 - (a.y0 + a.y1) / 2
      const halfW = Math.tan((this.camera.fov * Math.PI) / 360) * d * this.camera.aspect
      const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * d
      t.addScaledVector(this.right, ox * halfW)
      // Moving the target along the ground's forward axis moves it on screen by about sin(pitch).
      t.addScaledVector(this.fwd, (-oy * halfH) / Math.sin(this.pitch))
    }
  }

  /** The range of pans along an axis that keeps the room filling the screen (or centred, when it is smaller). */
  private panRange(axis: Vector3, a: ReturnType<CameraRig['area']>, ndc: 'x' | 'y'): [number, number] {
    const d = this.useD
    const at = (p: number) => { const t = this.fitT.clone().addScaledVector(axis, p); const b = this.bounds(t, d); return ndc === 'x' ? [b.x0, b.x1] : [b.y0, b.y1] }
    const [c0, c1] = at(0)
    const lo = ndc === 'x' ? a.x0 : a.y0, hi = ndc === 'x' ? a.x1 : a.y1
    if (c1 - c0 <= hi - lo + 1e-3) return [0, 0]
    // Panning along +axis moves the room towards -x on screen (right) or -y (back).
    const solve = (f: (p: number) => boolean) => { let l = -30, r = 30; for (let i = 0; i < 30; i++) { const m = (l + r) / 2; if (f(m)) r = m; else l = m } return r }
    const pMin = solve(p => at(p)[0] <= lo)
    const pMax = solve(p => at(p)[1] < hi)
    return pMin <= pMax ? [pMin, pMax] : [(pMin + pMax) / 2, (pMin + pMax) / 2]
  }

  /** A glide in on a spot for a moment (a purchase, a new station). */
  focus(x: number, z: number, dur = 2.6) { this.focusAt = { p: new Vector3(x, 0.5, z), t: 0, dur } }

  get focusing() { return !!this.focusAt }

  /** The point the camera looks at. */
  get focusPoint() { return this.target }

  /** Follow a ground point (the local player), eased; null holds the fitted view. */
  update(dt: number, follow: { x: number; z: number } | null) {
    let pr = 0, pf = 0
    if (follow) {
      const off = new Vector3(follow.x, 0, follow.z).sub(this.fitT)
      pr = off.dot(this.right)
      pf = off.dot(this.back)
    }
    pr = Math.max(this.panR[0], Math.min(this.panR[1], pr))
    pf = Math.max(this.panF[0], Math.min(this.panF[1], pf))
    const k = Math.min(1, dt * 4)
    this.pan.r += (pr - this.pan.r) * k
    this.pan.f += (pf - this.pan.f) * k
    this.target.copy(this.fitT).addScaledVector(this.right, this.pan.r).addScaledVector(this.back, this.pan.f)
    let d = this.useD
    const f = this.focusAt
    if (f) {
      f.t += dt
      const e = f.t < 0.6 ? ease(f.t / 0.6) : f.t > f.dur - 0.7 ? ease(Math.max(0, (f.dur - f.t) / 0.7)) : 1
      this.target.lerp(f.p, e)
      d = d * (1 - 0.38 * e)
      if (f.t >= f.dur) this.focusAt = null
    }
    this.dist = d
    this.place(this.target, this.dist)
  }

  /** Metres per CSS pixel at a point (for sizing what floats over the scene). */
  pixelScale(p: Vector3) {
    const d = this.camera.position.distanceTo(p)
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * d
    return (2 * halfH) / this.view.h
  }
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
