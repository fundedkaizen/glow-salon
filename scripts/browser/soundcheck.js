// Sound check: renders every Glow Salon sound offline (OfflineAudioContext, so nothing needs to be heard)
// and measures it: peak and RMS in dBFS, and how long it rings. Page: /?view=facial (debug build exposes
// window.__Sfx). Usage: npx agent-browser --session glow1 eval --stdin < scripts/browser/soundcheck.js
// then: npx agent-browser --session glow1 eval "window.__soundcheck()"  (resolves with a JSON table)
// window.__soundreel() renders one WAV of all the sounds in a row and returns it as base64.
(() => {
  const SR = 44100
  const db = v => (v > 0 ? 20 * Math.log10(v) : -120)
  function stats(buf) {
    let peak = 0, sum = 0, n = 0, last = 0
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; if (a > 0.003) last = Math.max(last, i) }
    }
    return { peakDb: +db(peak).toFixed(1), rmsDb: +db(Math.sqrt(sum / n)).toFixed(1), ringsMs: Math.round((last / SR) * 1000) }
  }
  async function render(seconds, play) {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR)
    const s = new window.__Sfx()
    s.attach(ctx)
    await s.loadAll()
    await play(s, ctx)
    return ctx.startRendering()
  }
  const SOUNDS = {
    pop: s => s.pop(0.8), popBig: s => s.pop(1.4), squeeze: s => s.squeeze(0.7), extract: s => s.extract(), drip: s => s.drip(),
    ding: s => s.ding(), sparkle: s => s.sparkle(), reveal: s => s.reveal(), snip: s => s.snip(), peelSnap: s => s.peelSnap(), patch: s => s.patch(), gem: s => s.gem(),
    cash: s => s.cash(), door: s => s.door(), click: s => s.click(), buy: s => s.buy(), star: s => s.star(2), reviewPop: s => s.reviewPop(1),
    'stroke:foam': s => s.stroke('foam', 0.8), 'stroke:wipe': s => s.stroke('wipe', 0.8), 'stroke:brush': s => s.stroke('brush', 0.8), 'stroke:cream': s => s.stroke('cream', 0.8),
    'stroke:scrub': s => s.stroke('scrub', 0.8), 'stroke:buff': s => s.stroke('buff', 0.8), 'stroke:polish': s => s.stroke('polish', 0.8), 'stroke:rasp': s => s.stroke('rasp', 0.8),
    'toolUp:cream': s => s.toolUp('cream'), 'toolUp:tonerPad': s => s.toolUp('tonerPad'),
  }
  const LOOPS = ['foam', 'water', 'soak', 'steam', 'fan', 'hum', 'rasp', 'scrape']
  window.__soundcheck = async () => {
    const out = {}
    for (const [name, play] of Object.entries(SOUNDS)) out[name] = stats(await render(3, s => play(s)))
    for (const name of LOOPS) out['loop:' + name] = stats(await render(2.5, async (s) => { const v = s.loop(name); v.set(1) }))
    return JSON.stringify(out)
  }
  // All the sounds one after another, for a person to listen to.
  window.__soundreel = async () => {
    const order = ['pop', 'pop', 'popBig', 'extract', 'drip', 'drip', 'ding', 'sparkle', 'snip', 'snip', 'peelSnap', 'patch', 'gem', 'cash', 'buy', 'reveal']
    const gap = 0.7
    const total = order.length * gap + 3.5
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * total), SR)
    const s = new window.__Sfx()
    s.attach(ctx)
    await s.loadAll()
    // The Sfx schedules at ctx.currentTime, so step through time with suspend/resume.
    order.forEach((name, i) => ctx.suspend(i * gap).then(() => { SOUNDS[name](s); ctx.resume() }))
    const buf = await ctx.startRendering()
    // 16-bit WAV.
    const n = buf.length, ch = 2, bytes = 44 + n * ch * 2
    const view = new DataView(new ArrayBuffer(bytes))
    const w = (o, str) => { for (let i = 0; i < str.length; i++) view.setUint8(o + i, str.charCodeAt(i)) }
    w(0, 'RIFF'); view.setUint32(4, bytes - 8, true); w(8, 'WAVE'); w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true)
    view.setUint32(24, SR, true); view.setUint32(28, SR * ch * 2, true); view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, n * ch * 2, true)
    const L = buf.getChannelData(0), R = buf.getChannelData(1)
    for (let i = 0; i < n; i++) { view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true) }
    const u8 = new Uint8Array(view.buffer)
    let bin = ''
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    window.__reel = btoa(bin)
    return window.__reel.length
  }
  return 'soundcheck ready'
})()
