/**
 * Glow Salon's sound: close, dry, crisp. Every tool sound layers a real recording (the CC0 kit in
 * public/sounds, loaded on demand by group) with Web Audio synthesis: a transient, a body and some air.
 * Pitch, gain, filter and timing are randomised so a repeat never sounds identical, and the stereo pan
 * follows the tool across the screen. Continuous actions (rinsing, rubbing foam, the fan) are loops that
 * fade with the gesture's speed.
 */
export type Volumes = { master: number; music: number; sfx: number; ding: number }

type Clip = { file: string; offset?: number; dur?: number; gain?: number }

const BASE = (import.meta.env?.BASE_URL as string | undefined) ?? '/'
const url = (file: string) => `${BASE}sounds/${file}`
const range = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
const clips = (group: string, nums: number[], extra: Partial<Clip> = {}): Clip[] => nums.map(n => ({ file: `${group}/${group}-${n}.mp3`, ...extra }))

/** The recordings each sound uses. */
const KIT = {
  pop: clips('pop', [1, 2, 3, 4]),
  popBig: clips('pop', [9, 10], { gain: 0.5 }),
  suction: clips('suction', [2, 3]),
  drip: clips('drip', [1, 2, 3, 4, 5, 6, 8, 9, 10, 13, 15, 16]),
  sink: clips('drip', [17, 18, 19, 20]),
  bubbleTiny: clips('bubble', [6, 7, 9]),
  foamHiss: clips('foam', [2, 3, 7, 8, 9, 10]),
  cloth: clips('rub', [9, 10, 11, 12]),
  coat: clips('rub', [5, 6, 7, 8]),
  squeak: clips('rub', [13, 14, 16], { gain: 0.45 }),
  hands: clips('rub', [1, 2, 4]),
  horsehair: clips('brush', [5, 6, 7, 8]),
  softBrush: clips('brush', [13, 14, 15, 16]),
  toothbrush: clips('brush', [1, 2, 4]),
  tapeShort: clips('peel', [1, 2]),
  tapeLong: clips('peel', [5, 6]),
  peelSnap: clips('peel', [11]),
  paperRip: clips('rip', [9, 11, 12, 14]),
  snip: [{ file: 'scissors/scissors-2.mp3', offset: 0.3, dur: 0.16 }, { file: 'scissors/scissors-4.mp3', offset: 0.6, dur: 0.14 }, { file: 'scissors/scissors-1.mp3', offset: 0.84, dur: 0.14 }],
  gel: clips('gel', [1, 3, 4]),
  pot: clips('gel', [7, 8, 9, 10]),
  spray: clips('spray', [5, 6, 7, 9]),
  glass: clips('cap', [7, 8, 9, 10]),
  cap: clips('cap', [2, 3, 4, 5]),
  sparkle: clips('chime', [9, 18, 21, 16]),
  bell: clips('chime', [13, 20, 12]),
  reveal: clips('chime', [22, 23, 24]),
  dream: clips('chime', [5, 2]),
  coins: clips('cash', [7, 8, 9, 10]),
  beep: clips('cash', [2]),
  door: clips('door', [1]),
  counterBell: clips('door', [2, 3]),
  pen: clips('click', [1, 2, 3]),
  keys: clips('click', [5, 6, 7]),
  shutter: clips('click', [8, 9]),
  trackpad: clips('click', [4]),
}

const LOOPS = {
  foam: 'foam/foam-loop-11.mp3',
  water: 'water/water-loop-2.mp3',
  soak: 'water/water-loop-5.mp3',
  splash: 'water/water-loop-6.mp3',
  steam: 'steam/steam-loop-1.mp3',
  fan: 'dryer/dryer-loop-1.mp3',
}

export type LoopName = keyof typeof LOOPS | 'rasp' | 'scrape' | 'hum' | 'brushWet'

export class Sfx {
  ctx: AudioContext | null = null
  private master!: GainNode
  private sfxBus!: GainNode
  private dingBus!: GainNode
  musicBus!: GainNode
  private buffers = new Map<string, AudioBuffer>()
  /** Per-recording gain so every clip in a group peaks at the same level (random picks stay even). */
  private norm = new Map<string, number>()
  private loading = new Map<string, Promise<AudioBuffer | null>>()
  private noise: AudioBuffer | null = null
  volumes: Volumes = { master: 0.9, music: 0.55, sfx: 0.9, ding: 0.7 }
  private lastPlay = new Map<string, number>()

  /** Browsers start audio only after a gesture: call this from the first click or tap. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.attach(new Ctor({ latencyHint: 'interactive' }))
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** Build the buses on a context (the live one, or an OfflineAudioContext for sound checks). */
  attach(context: BaseAudioContext) {
    {
      const ctx = context as AudioContext
      this.ctx = ctx
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 8; limiter.attack.value = 0.003; limiter.release.value = 0.12
      this.master = ctx.createGain()
      this.master.connect(limiter).connect(ctx.destination)
      this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master)
      this.dingBus = ctx.createGain(); this.dingBus.connect(this.master)
      this.musicBus = ctx.createGain(); this.musicBus.connect(this.master)
      const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
      const d = n.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      this.noise = n
      this.applyVolumes()
      // Warm the most common groups so the first pop is not late.
      for (const list of [KIT.pop, KIT.bell, KIT.sparkle, KIT.pen, KIT.drip]) for (const c of list) void this.load(c.file)
    }
  }

  /** Load every recording and loop (sound checks). */
  async loadAll() {
    const files = new Set<string>()
    for (const list of Object.values(KIT)) for (const c of list) files.add(c.file)
    for (const f of Object.values(LOOPS)) files.add(f)
    await Promise.all([...files].map(f => this.load(f)))
    return files.size
  }

  setVolumes(v: Partial<Volumes>) { Object.assign(this.volumes, v); this.applyVolumes() }

  private applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.03)
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.03)
    this.dingBus.gain.setTargetAtTime(this.volumes.ding, t, 0.03)
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.03)
  }

  private load(file: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(file)
    if (have) return Promise.resolve(have)
    let p = this.loading.get(file)
    if (!p) {
      p = fetch(url(file)).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then(b => this.ctx!.decodeAudioData(b)).then(buf => {
        let peak = 0
        for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i += 2) { const a = Math.abs(d[i]); if (a > peak) peak = a } }
        this.norm.set(file, peak > 0.01 ? Math.min(4, 0.7 / peak) : 1)
        this.buffers.set(file, buf)
        return buf
      }).catch(() => null)
      this.loading.set(file, p)
    }
    return p
  }

  /** Warm a set of sounds before they are needed (a treatment's tools). */
  preload(names: (keyof typeof KIT)[], loops: (keyof typeof LOOPS)[] = []) {
    if (!this.ctx) return
    for (const n of names) for (const c of KIT[n]) void this.load(c.file)
    for (const l of loops) void this.load(LOOPS[l])
  }

  private out(pan: number, bus: 'sfx' | 'ding' = 'sfx'): AudioNode {
    const ctx = this.ctx!
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    p.connect(bus === 'ding' ? this.dingBus : this.sfxBus)
    return p
  }

  /** Play one recording from a group: random clip, pitch +-4%, gain +-2 dB, a few ms of timing jitter. */
  private clip(list: readonly Clip[], opts: { gain?: number; pan?: number; rate?: number; bus?: 'sfx' | 'ding'; delay?: number; lowpass?: number } = {}) {
    const ctx = this.ctx
    if (!ctx || !list.length) return
    const c = pick(list)
    const play = (buf: AudioBuffer) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = (opts.rate ?? 1) * range(0.96, 1.04)
      const g = ctx.createGain()
      g.gain.value = (opts.gain ?? 1) * (c.gain ?? 1) * (this.norm.get(c.file) ?? 1) * 10 ** (range(-2, 2) / 20)
      let node: AudioNode = src
      if (opts.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lowpass * range(0.85, 1.15); node.connect(f); node = f }
      node.connect(g).connect(this.out(opts.pan ?? 0, opts.bus))
      const when = ctx.currentTime + (opts.delay ?? 0) + range(0, 0.012)
      if (c.dur) {
        g.gain.setValueAtTime(g.gain.value, when + c.dur * 0.7)
        g.gain.linearRampToValueAtTime(0, when + c.dur)
        src.start(when, c.offset ?? 0, c.dur + 0.02)
      } else src.start(when, c.offset ?? 0)
    }
    const buf = this.buffers.get(c.file)
    if (buf) play(buf)
    else void this.load(c.file).then(b => { if (b) play(b) })
  }

  // ------------------------------------------------------------------ synthesis primitives

  private burst(o: { freq: number; q?: number; type?: BiquadFilterType; dur: number; gain: number; attack?: number; pan?: number; freqEnd?: number; delay?: number }) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = o.type ?? 'bandpass'
    const t = ctx.currentTime + (o.delay ?? 0)
    f.frequency.setValueAtTime(o.freq, t)
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur)
    f.Q.value = o.q ?? 1
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.002))
    g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur)
    src.connect(f).connect(g).connect(this.out(o.pan ?? 0))
    src.start(t, Math.random() * 1.5, o.dur + 0.05)
  }

  private tone(o: { freq: number; freqEnd?: number; type?: OscillatorType; dur: number; gain: number; attack?: number; pan?: number; bus?: 'sfx' | 'ding'; delay?: number; lowpass?: number }) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'sine'
    const t = ctx.currentTime + (o.delay ?? 0)
    osc.frequency.setValueAtTime(o.freq, t)
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur * 0.8)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(o.gain, t + (o.attack ?? 0.004))
    g.gain.exponentialRampToValueAtTime(0.0006, t + o.dur)
    let node: AudioNode = osc
    if (o.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lowpass; node.connect(f); node = f }
    node.connect(g).connect(this.out(o.pan ?? 0, o.bus))
    osc.start(t)
    osc.stop(t + o.dur + 0.05)
  }

  /** A soft glass bell: a few inharmonic partials, a gentle attack and a warm lowpass. */
  private bell(freq: number, gain: number, pan = 0, delay = 0, bus: 'sfx' | 'ding' = 'ding') {
    const partials: [number, number, number][] = [[1, 1, 1.1], [2.01, 0.28, 0.6], [3.02, 0.08, 0.35], [4.16, 0.04, 0.22]]
    for (const [ratio, amp, dur] of partials) this.tone({ freq: freq * ratio, dur, gain: gain * amp, attack: 0.006, pan, bus, delay, lowpass: 5200 })
  }

  private throttle(key: string, ms: number) {
    const now = performance.now()
    if (now - (this.lastPlay.get(key) ?? 0) < ms) return false
    this.lastPlay.set(key, now)
    return true
  }

  // ------------------------------------------------------------------ the sounds

  /**
   * The step-complete ding: a soft glass bell with its fifth. Each step climbs one note of a pentatonic
   * scale, so a whole treatment plays a gentle rising melody and the reveal resolves it.
   */
  ding(pan = 0, step = -1) {
    if (!this.ctx) return
    const scale = [880, 987.8, 1108.7, 1318.5, 1480.0, 1760, 1975.5]
    const a = step >= 0 ? scale[step % scale.length] : pick(scale)
    this.bell(a, 0.16, pan * 0.4)
    this.bell(a * 1.4983, 0.07, pan * 0.4, 0.07)
    this.clip(KIT.bell, { gain: 0.22, pan: pan * 0.4, bus: 'ding', lowpass: 9000, delay: 0.02 })
  }

  /** A tiny sparkle for a finished region or target. */
  sparkle(pan = 0) {
    if (!this.ctx || !this.throttle('sparkle', 60)) return
    this.clip(KIT.sparkle, { gain: 0.3, pan, bus: 'ding', lowpass: 11000 })
    this.tone({ freq: range(2600, 3400), dur: 0.25, gain: 0.025, pan, bus: 'ding' })
  }

  /** The before/after reveal: a cluster of chimes over a soft rising pad. */
  reveal() {
    if (!this.ctx) return
    this.clip(KIT.reveal, { gain: 0.55, bus: 'ding' })
    this.clip(KIT.dream, { gain: 0.3, bus: 'ding', delay: 0.4, lowpass: 9000 })
    for (const [f, d] of [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36]] as const) this.bell(f, 0.09, (d - 0.18) * 2, d)
  }

  /** Popping a whitehead: a crisp recorded pop, a wet synthetic body and a squelch. Bigger ones sound lower. */
  pop(size: number, pan = 0) {
    if (!this.ctx) return
    const rate = 1.18 - 0.3 * Math.min(1.4, size)
    this.clip(KIT.pop, { gain: 1.5, pan, rate })
    if (size > 1.1) this.clip(KIT.popBig, { gain: 0.35, pan, rate: 1.3 })
    this.tone({ freq: 340 * rate, freqEnd: 90, dur: 0.09, gain: 0.45, pan })
    this.burst({ freq: 900 * rate, freqEnd: 300, q: 2.2, dur: 0.12, gain: 0.22, pan, delay: 0.01 })
    this.burst({ freq: 6000, q: 0.8, type: 'highpass', dur: 0.03, gain: 0.08, pan })
  }

  /** Pressure building while a whitehead swells: a faint rising creak. */
  squeeze(progress: number, pan = 0) {
    if (!this.ctx || !this.throttle('squeeze', 90)) return
    this.burst({ freq: 500 + progress * 900, q: 5, dur: 0.1, gain: 0.12 + progress * 0.2, pan })
  }

  /** A blackhead coming out of its pore: a little suction pop. */
  extract(pan = 0) {
    if (!this.ctx) return
    this.clip(KIT.suction, { gain: 0.8, pan, rate: range(1.1, 1.35) })
    this.tone({ freq: 1400, freqEnd: 600, dur: 0.06, gain: 0.08, pan })
  }

  drip(pan = 0) {
    if (!this.ctx) return
    this.clip(KIT.drip, { gain: 0.55, pan })
    this.tone({ freq: range(1300, 1700), freqEnd: range(2600, 3200), dur: 0.07, gain: 0.05, pan, delay: 0.005 })
  }

  /** One rub or stroke of a tool: a short recorded texture every so often, scaled by speed (0 to 1). */
  stroke(sound: string, speed: number, pan = 0) {
    if (!this.ctx) return
    const s = Math.min(1, speed)
    if (s < 0.05) return
    switch (sound) {
      case 'foam':
        if (this.throttle('foamPop', 70 / (0.4 + s))) { this.clip(KIT.bubbleTiny, { gain: 0.25 + 0.3 * s, pan, rate: range(1, 1.6) }); this.burst({ freq: range(3000, 7000), q: 3, dur: 0.02, gain: 0.05 * s, pan }) }
        if (this.throttle('foamHiss', 420)) this.clip(KIT.foamHiss, { gain: 0.25 * s, pan, lowpass: 7000 })
        break
      case 'wipe':
        if (this.throttle('wipe', 150)) this.clip(Math.random() < 0.6 ? KIT.cloth : KIT.coat, { gain: 0.22 + 0.3 * s, pan })
        break
      case 'brush':
        if (this.throttle('brush', 170)) { this.clip(KIT.horsehair, { gain: 0.24 + 0.3 * s, pan }); this.burst({ freq: 700, q: 1.2, type: 'lowpass', dur: 0.12, gain: 0.05 * s, pan }) }
        break
      case 'cream':
        if (this.throttle('cream', 260)) this.clip(KIT.hands, { gain: 0.3 + 0.3 * s, pan, lowpass: 6000 })
        if (this.throttle('creamSquish', 120)) this.burst({ freq: range(500, 900), q: 3, dur: 0.07, gain: 0.05 * s, pan })
        break
      case 'scrub':
        if (this.throttle('scrub', 180)) this.clip(KIT.toothbrush, { gain: 0.25 + 0.3 * s, pan })
        if (this.throttle('grain', 40)) this.burst({ freq: range(2500, 5000), q: 4, dur: 0.015, gain: 0.05 * s, pan })
        break
      case 'buff':
        if (this.throttle('buff', 160)) this.clip(Math.random() < 0.25 ? KIT.squeak : KIT.coat, { gain: 0.35 + 0.3 * s, pan })
        break
      case 'polish':
        if (this.throttle('polish', 200)) this.clip(KIT.softBrush, { gain: 0.25 + 0.2 * s, pan, lowpass: 5000 })
        break
      case 'rasp':
        if (this.throttle('raspGrain', 35)) this.burst({ freq: range(2800, 4200), q: 2.5, dur: 0.03, gain: 0.07 + 0.08 * s, pan })
        if (this.throttle('rasp', 230)) this.clip(KIT.toothbrush, { gain: 0.2 * s, pan, rate: 1.4 })
        break
      case 'push':
        if (this.throttle('push', 70)) this.burst({ freq: range(1500, 2100), q: 3, dur: 0.06, gain: 0.05 + 0.05 * s, pan })
        break
      case 'loop':
        if (this.throttle('loopScrape', 60)) this.burst({ freq: range(3000, 4500), q: 6, dur: 0.04, gain: 0.03 + 0.04 * s, pan })
        break
      case 'water':
        if (this.throttle('splashDrip', 260)) this.clip(KIT.sink, { gain: 0.2, pan, rate: range(0.9, 1.3) })
        break
    }
  }

  /** A tool is picked up or a product opened, at the start of a step. */
  toolUp(tool: string) {
    if (!this.ctx) return
    if (tool === 'tonerPad') this.clip(KIT.spray, { gain: 0.5 })
    else if (tool === 'cream') this.clip(KIT.gel, { gain: 0.6 })
    else if (tool === 'dropper' || tool === 'polishBrush') this.clip(KIT.cap, { gain: 0.5 })
    else if (tool === 'maskBrush') this.clip(KIT.pot, { gain: 0.6 })
    else if (tool === 'uvLamp') this.clip(KIT.trackpad, { gain: 0.7 })
    else this.clip(KIT.glass, { gain: 0.25, rate: 1.2 })
  }

  snip(pan = 0) {
    if (!this.ctx) return
    this.clip(KIT.snip, { gain: 0.7, pan })
    this.burst({ freq: 5200, q: 1.5, type: 'highpass', dur: 0.025, gain: 0.25, pan })
    this.tone({ freq: range(3100, 3500), dur: 0.12, gain: 0.04, pan })
  }

  peelSnap(pan = 0) {
    if (!this.ctx) return
    this.clip(KIT.peelSnap, { gain: 0.9, pan })
    this.clip(KIT.paperRip, { gain: 0.45, pan, delay: 0.02, lowpass: 6000 })
    this.burst({ freq: 1800, freqEnd: 400, q: 0.7, dur: 0.3, gain: 0.12, pan })
  }

  /** The peel creeping: a short grain of tape every so often, faster with the pull. */
  peelCreep(speed: number, stuck: boolean, pan = 0) {
    if (!this.ctx) return
    if (stuck) { if (this.throttle('peelStuck', 140)) this.burst({ freq: range(180, 260), q: 8, dur: 0.12, gain: 0.08, pan }); return }
    if (speed > 0.02 && this.throttle('peel', Math.max(60, 220 - speed * 900))) this.clip(KIT.tapeShort, { gain: 0.35 + Math.min(0.5, speed * 2), pan, rate: range(0.9, 1.2) })
  }

  patch(pan = 0) {
    if (!this.ctx) return
    this.clip(KIT.tapeShort, { gain: 0.5, pan, rate: 1.2 })
    this.tone({ freq: 220, freqEnd: 120, dur: 0.08, gain: 0.12, pan, delay: 0.05 })
  }

  gem(pan = 0) {
    if (!this.ctx) return
    this.clip(KIT.glass, { gain: 0.85, pan, rate: 1.6 })
    this.bell(range(1800, 2400), 0.05, pan, 0.03, 'ding')
  }

  miss(pan = 0) { if (this.ctx && this.throttle('miss', 120)) this.tone({ freq: 300, freqEnd: 220, dur: 0.06, gain: 0.05, pan }) }

  cash() { if (!this.ctx) return; this.clip(KIT.coins, { gain: 0.7 }); this.clip(KIT.beep, { gain: 0.25, delay: 0.05 }) }
  door() { if (this.ctx) this.clip(KIT.door, { gain: 0.5 }) }
  bellDesk() { if (this.ctx) this.clip(KIT.counterBell, { gain: 0.5 }) }
  click() { if (this.ctx && this.throttle('click', 40)) this.clip(KIT.pen, { gain: 0.35 }) }
  type() { if (this.ctx && this.throttle('type', 50)) this.clip(KIT.keys, { gain: 0.5 }) }
  shutter() { if (this.ctx) this.clip(KIT.shutter, { gain: 0.8 }) }
  buy() { if (!this.ctx) return; this.clip(KIT.beep, { gain: 0.35 }); this.bell(1318.5, 0.1, 0, 0.05); this.bell(1760, 0.08, 0, 0.14) }
  whoosh() { if (this.ctx && this.throttle('whoosh', 300)) this.burst({ freq: 400, freqEnd: 1600, q: 0.6, dur: 0.35, gain: 0.05, attack: 0.12 }) }
  reviewPop(i = 0) { if (!this.ctx) return; this.tone({ freq: 880 * 1.1225 ** (i % 5), dur: 0.18, gain: 0.08, bus: 'ding' }); this.clip(KIT.sparkle, { gain: 0.15, bus: 'ding' }) }
  star(i = 0) { if (this.ctx) this.bell(1046.5 * 1.1225 ** i, 0.07, (i - 2) * 0.2, 0, 'ding') }
  flinch() { if (this.ctx) this.burst({ freq: 300, q: 1, type: 'lowpass', dur: 0.08, gain: 0.04 }) }

  // ------------------------------------------------------------------ loops

  /** A continuous sound following a gesture. Set its level every frame (0 is silent); stop() fades it out. */
  loop(name: LoopName, pan = 0): LoopVoice | null {
    if (!this.ctx) return null
    return new LoopVoice(this, name, pan)
  }

  /** Internal: build the source chain for a loop. */
  makeLoop(name: LoopName, pan: number) {
    const ctx = this.ctx!
    const gain = ctx.createGain()
    gain.gain.value = 0
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    gain.connect(panner).connect(this.sfxBus)
    const filter = ctx.createBiquadFilter()
    filter.connect(gain)
    const stoppers: (() => void)[] = []
    const rateParams: AudioParam[] = []
    if (name in LOOPS) {
      const file = LOOPS[name as keyof typeof LOOPS]
      filter.type = 'lowpass'
      filter.frequency.value = name === 'steam' ? 3500 : name === 'fan' ? 2400 : 9000
      void this.load(file).then(buf => {
        if (!buf) return
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        src.playbackRate.value = range(0.96, 1.04)
        rateParams.push(src.playbackRate)
        src.connect(filter)
        src.start(ctx.currentTime, Math.random() * buf.duration)
        stoppers.push(() => { try { src.stop(ctx.currentTime + 0.5) } catch { /* already stopped */ } })
      })
    } else {
      // Synthesised loops: noise shaped into a rasp, a scrape or a wet brush; the UV lamp's hum.
      if (name === 'hum') {
        filter.type = 'lowpass'; filter.frequency.value = 900
        for (const [f, a] of [[120, 0.5], [240, 0.25], [360, 0.08]] as const) {
          const o = ctx.createOscillator(); o.frequency.value = f
          const g = ctx.createGain(); g.gain.value = a
          o.connect(g).connect(filter); o.start()
          stoppers.push(() => o.stop(ctx.currentTime + 0.5))
        }
        const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6000; bp.Q.value = 2
        const g = ctx.createGain(); g.gain.value = 0.06
        src.connect(bp).connect(g).connect(gain); src.start()
        stoppers.push(() => src.stop(ctx.currentTime + 0.5))
      } else {
        const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true
        filter.type = 'bandpass'
        filter.frequency.value = name === 'rasp' ? 3600 : name === 'scrape' ? 2400 : 1100
        filter.Q.value = name === 'rasp' ? 2.2 : name === 'scrape' ? 4 : 0.9
        src.connect(filter); src.start(ctx.currentTime, Math.random())
        stoppers.push(() => src.stop(ctx.currentTime + 0.5))
      }
    }
    return { gain, panner, filter, stop: () => stoppers.forEach(s => s()), rateParams }
  }
}

export class LoopVoice {
  private chain: ReturnType<Sfx['makeLoop']>
  private stopped = false
  private sfx: Sfx
  readonly name: LoopName
  constructor(sfx: Sfx, name: LoopName, pan: number) {
    this.sfx = sfx
    this.name = name
    this.chain = sfx.makeLoop(name, pan)
  }
  /** 0 to 1: how hard the gesture is going. */
  set(level: number, pan?: number) {
    const ctx = this.sfx.ctx
    if (!ctx || this.stopped) return
    const t = ctx.currentTime
    const peak = LOOP_GAIN[this.name] ?? 0.5
    this.chain.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * peak, t, level > 0 ? 0.04 : 0.12)
    if (pan !== undefined) this.chain.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05)
    for (const p of this.chain.rateParams) p.setTargetAtTime(0.94 + level * 0.12, t, 0.1)
  }
  stop() {
    const ctx = this.sfx.ctx
    if (!ctx || this.stopped) return
    this.stopped = true
    this.chain.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1)
    setTimeout(() => this.chain.stop(), 400)
  }
}

const LOOP_GAIN: Partial<Record<LoopName, number>> = { foam: 0.55, water: 0.5, soak: 0.45, splash: 0.4, steam: 0.22, fan: 0.28, rasp: 0.08, scrape: 0.05, hum: 0.06, brushWet: 0.06 }

export const sfx = new Sfx()
