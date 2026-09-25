// Browser check: plays the open treatment close-up with real pointer events dispatched on the canvas.
// Page: /?view=facial, /?view=nails or /?view=pedicure (or any page where window.__treatment is a TreatmentView).
// Usage: npx agent-browser --session glow1 eval --stdin < scripts/browser/play-treatment.js
// It defines window.__play(n) (plays n steps, or all when n is omitted, resolving with a log) and
// window.__playLog. Call it with: npx agent-browser --session glow1 eval "window.__play(3)"
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const canvas = () => document.querySelector('#app canvas')
  const send = (type, p, id = 1) => canvas().dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, pointerId: id, pointerType: 'mouse', bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }))
  const tv = () => window.__treatment
  const scr = (x, y) => tv().artToScreen(x, y)

  async function drag(points, stepMs = 16) {
    send('pointerdown', scr(points[0][0], points[0][1]))
    for (const [x, y] of points) { send('pointermove', scr(x, y)); await sleep(stepMs) }
    send('pointerup', scr(points[points.length - 1][0], points[points.length - 1][1]))
  }

  /** A zigzag over a box, as a person scrubbing would. */
  function zigzag(x0, y0, x1, y1, gap) {
    const pts = []
    let dir = 1
    for (let y = y0; y <= y1; y += gap) {
      const a = dir > 0 ? x0 : x1, b = dir > 0 ? x1 : x0
      for (let k = 0; k <= 12; k++) pts.push([a + (b - a) * (k / 12), y + Math.sin(k) * 6])
      dir = -dir
    }
    return pts
  }

  async function hold(x, y, ms) {
    send('pointerdown', scr(x, y))
    const t0 = performance.now()
    while (performance.now() - t0 < ms) { send('pointermove', scr(x + Math.sin(performance.now() / 50) * 2, y)); await sleep(30) }
    send('pointerup', scr(x, y))
  }

  const BOX = { face: [300, 330, 724, 900], skin: [300, 330, 724, 900], tzone: [380, 340, 644, 880], nose: [450, 590, 574, 690], brows: [310, 420, 715, 475], lips: [415, 700, 610, 800], hand: [230, 300, 740, 980], nails: [200, 250, 760, 700], tips: [200, 220, 760, 560], cuticles: [220, 300, 760, 680], nail0: [170, 560, 330, 760], nail1: [350, 290, 450, 440], nail2: [450, 230, 560, 380], nail3: [560, 270, 670, 420], nail4: [650, 380, 760, 520],
    // Feet (the customer's own foot varies a little; the touch-ups find whatever is left).
    'top.foot': [230, 220, 820, 930], 'top.toes': [180, 560, 820, 930], 'top.nails': [180, 640, 800, 910], 'top.tips': [180, 680, 800, 920], 'top.cuticles': [180, 630, 800, 860],
    'top.fungal': [180, 640, 800, 910], 'top.treated': [200, 600, 820, 900], 'sole.sole': [340, 130, 740, 980], 'sole.calluses': [360, 300, 720, 970], 'sole.heelRim': [420, 740, 690, 980] }
  const HOLD_KINDS = ['whitehead', 'hangnail', 'corn', 'splinter', 'ingrown']

  async function playStep(log) {
    const s = tv().session
    const step = s.current
    if (!step) return false
    const i = s.step
    log.push(`${i}:${step.id}`)
    if (step.choice && s.choices[i] === undefined) {
      ;(document.querySelector('.swatch.wish') ?? document.querySelector('.swatch'))?.click()
      await sleep(200)
    }
    const t0 = performance.now()
    while (s.step === i && !s.finished && performance.now() - t0 < 25000) {
      if (step.optional) {
        const t = s.stepTargets().find(x => !x.done)
        if (t) { const p = scr(t.x, t.y); send('pointerdown', p); await sleep(60); send('pointerup', p); await sleep(300) }
        document.querySelector('.thud-finish')?.click()
        await sleep(400)
        continue
      }
      if (s.ready) { await sleep(200); continue }
      switch (step.gesture) {
        case 'hold': await hold(512, 560, 1200); break
        case 'peel': {
          const pts = []
          const [from, to] = s.peelRange ?? [915, 262]
          for (let k = 0; k <= 60; k++) pts.push([512, from - 60 - k * ((from - to) / 60)])
          await drag(pts, 40)
          break
        }
        case 'targets': {
          const t = s.stepTargets().find(x => !x.done)
          if (!t) { await sleep(100); break }
          if (HOLD_KINDS.includes(t.kind)) await hold(t.x, t.y, 1300)
          else { const p = scr(t.x, t.y); send('pointerdown', p); await sleep(50); send('pointerup', p); await sleep(250) }
          break
        }
        case 'sweep': {
          const t = s.stepTargets().find(x => !x.done)
          if (!t) { await sleep(100); break }
          await drag([[t.x - 30, t.y], [t.x - 10, t.y + 2], [t.x + 10, t.y - 2], [t.x + 30, t.y], [t.x, t.y]], 30)
          break
        }
        default: {
          // First a broad zigzag like a person would do, then touch up whatever is left.
          if (performance.now() - t0 < 2500) {
            const b = BOX[step.region] ?? BOX.face
            await drag(zigzag(b[0], b[1], b[2], b[3], (step.radius ?? 50) * 1.1))
          } else {
            const cells = tv().cellsToWork(60)
            for (const [x, y] of cells.slice(0, 20)) await drag([[x - 14, y], [x, y + 4], [x + 14, y]], 16)
          }
        }
      }
    }
    // Let the auto-advance happen.
    const t1 = performance.now()
    while (s.step === i && !s.finished && performance.now() - t1 < 3000) await sleep(100)
    return true
  }

  window.__play = async (n = 99) => {
    const log = []
    for (let k = 0; k < n; k++) { const more = await playStep(log); if (!more || tv().session.finished) break }
    window.__playLog = log
    return log.join(' ')
  }
  // Start playing without waiting (long runs outlast a single eval); poll window.__playing.
  window.__run = n => { window.__playing = true; window.__play(n).then(() => { window.__playing = false }, e => { window.__playing = false; window.__playError = String(e) }); return 'started' }
  window.__doneStatus = () => ({ step: tv().session.step, finished: tv().session.finished, status: tv().session.status.join(',') })
  return 'ready'
})()
