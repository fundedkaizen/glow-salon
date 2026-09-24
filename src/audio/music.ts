import { sfx } from './sfx.ts'

/**
 * The salon and menu playlist: public/music/playlist.json lists the files, played in order, streamed one
 * track at a time (never all preloaded), cross-fading between tracks. Music never plays in a treatment:
 * `quiet(true)` fades it out there. Dropping a new mp3 in and listing it is all it takes to add a song.
 */
type Track = { file: string; title: string; by?: string }

const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/'
const FADE = 3

export class Music {
  private tracks: Track[] = []
  private index = -1
  private current: { el: HTMLAudioElement; gain: GainNode } | null = null
  private quietened = false
  private started = false
  private timer = 0
  onTrack: (track: Track) => void = () => {}

  async load() {
    try {
      const r = await fetch(`${BASE}music/playlist.json`)
      const data = await r.json()
      this.tracks = Array.isArray(data.tracks) ? data.tracks.filter((t: Track) => t && typeof t.file === 'string') : []
    } catch { this.tracks = [] }
  }

  get track(): Track | null { return this.tracks[this.index] ?? null }

  /** Start after the first gesture (audio needs one). */
  start() {
    if (this.started || !sfx.ctx || !this.tracks.length) return
    this.started = true
    this.index = Math.floor(Math.random() * Math.min(3, this.tracks.length)) - 1
    this.next()
    this.timer = window.setInterval(() => this.watch(), 500)
  }

  /** Cross-fade to the next track. */
  next() {
    const ctx = sfx.ctx
    if (!ctx || !this.tracks.length) return
    this.index = (this.index + 1) % this.tracks.length
    const track = this.tracks[this.index]
    const el = new Audio()
    el.preload = 'auto'
    el.src = `${BASE}music/${track.file}`
    el.crossOrigin = 'anonymous'
    const gain = ctx.createGain()
    gain.gain.value = 0
    try { ctx.createMediaElementSource(el).connect(gain).connect(sfx.musicBus) } catch { return }
    const old = this.current
    this.current = { el, gain }
    if (!this.quietened) { void el.play().catch(() => {}); gain.gain.setTargetAtTime(1, ctx.currentTime, FADE / 3) }
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 3)
      setTimeout(() => { old.el.pause(); old.el.src = '' }, FADE * 1000 + 500)
    }
    this.onTrack(track)
  }

  private watch() {
    const cur = this.current
    if (!cur || this.quietened) return
    const d = cur.el.duration
    if (Number.isFinite(d) && d > 0 && cur.el.currentTime > d - FADE) this.next()
    else if (cur.el.ended || cur.el.error) this.next()
  }

  /** Fade the music out (a treatment) or back in (the salon floor). */
  quiet(on: boolean) {
    const ctx = sfx.ctx
    this.quietened = on
    const cur = this.current
    if (!ctx || !cur) return
    if (on) {
      cur.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
      setTimeout(() => { if (this.quietened) cur.el.pause() }, 1800)
    } else {
      void cur.el.play().catch(() => {})
      cur.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8)
    }
  }

  stop() { clearInterval(this.timer) }
}

export const music = new Music()
