import { sfx } from './sfx.ts'

/**
 * Salon-floor sounds the shared kit does not have: the cat's purr (a warm, slowly pulsing rumble) and a
 * soft pop for UI bubbles. They follow the player's effects volume.
 */
function out(gain: number): { ctx: AudioContext; node: GainNode } | null {
  const ctx = sfx.ctx
  if (!ctx) return null
  const node = ctx.createGain()
  node.gain.value = gain * sfx.volumes.master * sfx.volumes.sfx
  node.connect(ctx.destination)
  return { ctx, node }
}

/** About 1.6 seconds of purring. */
export function purr() {
  const o = out(0.22)
  if (!o) return
  const { ctx, node } = o
  const t = ctx.currentTime
  const len = 1.7
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) {
    const time = i / ctx.sampleRate
    // Breathing in and out at about 1.3 Hz, each breath a rumble of pulses at 26 Hz.
    const breath = 0.55 + 0.45 * Math.sin(time * Math.PI * 2 * 1.3)
    const pulse = Math.max(0, Math.sin(time * Math.PI * 2 * 26)) ** 3
    d[i] = (Math.random() * 2 - 1) * pulse * breath
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 420
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(1, t + 0.25)
  env.gain.setValueAtTime(1, t + len - 0.4)
  env.gain.linearRampToValueAtTime(0, t + len)
  src.connect(lp).connect(env).connect(node)
  src.start(t)
  src.stop(t + len + 0.05)
}

/** A soft bubbly pop for things appearing (a mood bubble, a review card). */
export function softPop(pitch = 1) {
  const o = out(0.12)
  if (!o) return
  const { ctx, node } = o
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(520 * pitch, t)
  osc.frequency.exponentialRampToValueAtTime(980 * pitch, t + 0.07)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(1, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
  osc.connect(g).connect(node)
  osc.start(t)
  osc.stop(t + 0.16)
}

/** A soft tick for counters rolling up on the receipt. */
export function tick(pitch = 1) {
  const o = out(0.08)
  if (!o) return
  const { ctx, node } = o
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = 1800 * pitch
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.9, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.035)
  osc.connect(g).connect(node)
  osc.start(t)
  osc.stop(t + 0.05)
}
