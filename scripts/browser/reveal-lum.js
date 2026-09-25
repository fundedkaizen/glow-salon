// Browser check: after a close-up has finished and its reveal is showing, compare the After photo's skin
// luminance with the same face with every layer taken off (the clean skin, no dewy sheen). The finished look
// should lift the skin a little, never blow it out or grey it: the ratio must stay between 0.92 and 1.12.
// Usage (after play-treatment.js has played a whole facial and the reveal is up):
//   npx agent-browser --session glow1 eval --stdin < scripts/browser/reveal-lum.js
(() => {
  const tv = window.__treatment
  if (!tv || !tv.afterRT) return JSON.stringify({ error: 'no reveal yet' })
  const renderer = tv.opts.app.renderer
  const K = 768 / 1024
  // Cheeks, forehead, chin: skin only, away from the eyes, brows and lips.
  const spots = tv.opts.treatment === 'facial'
    ? [[380, 650, 40], [644, 650, 40], [512, 420, 34], [512, 860, 22]]
    : [[520, 800, 60], [470, 700, 30]]
  const lum = rt => {
    const { pixels, width } = renderer.extract.pixels(rt)
    let sum = 0, n = 0
    for (const [x, y, r] of spots) {
      for (let py = Math.round((y - r) * K); py <= (y + r) * K; py++) {
        for (let px = Math.round((x - r) * K); px <= (x + r) * K; px++) {
          const i = (py * width + px) * 4
          sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]; n++
        }
      }
    }
    return sum / n
  }
  const after = lum(tv.afterRT)
  // The clean baseline: hide every layer, drop the dewy sheen and the wet film, capture again.
  const s = tv.surface
  const vis = [...s.layers.values()].map(l => l.mesh.visible)
  const u = s.skin.uniforms.uniforms.uSkin, saved = [...u]
  for (const l of s.layers.values()) l.mesh.visible = false
  u[0] = 0; u[1] = 0; u[3] = 0
  const hidden = []
  for (const c of tv.overFx.children) { hidden.push([c, c.visible]); c.visible = false }
  const cleanRT = tv.capture()
  const clean = lum(cleanRT)
  cleanRT.destroy(true)
  ;[...s.layers.values()].forEach((l, i) => { l.mesh.visible = vis[i] })
  saved.forEach((v, i) => { u[i] = v })
  for (const [c, v] of hidden) c.visible = v
  const ratio = after / clean
  return JSON.stringify({ after: Math.round(after), clean: Math.round(clean), ratio: Math.round(ratio * 1000) / 1000, ok: ratio >= 0.92 && ratio <= 1.12 })
})()
