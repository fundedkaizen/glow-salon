// Browser check helpers for the salon floor (the game page, not ?view=). Load once per page:
//   npx agent-browser --session sys2 eval --stdin < scripts/browser/salon-drive.js
// then load scripts/browser/play-treatment.js too, and use:
//   window.__st()               a short JSON summary of the salon (day, phase, money, stations, customers, staff, goal)
//   window.__act(action)        a player action, as the floor would send it
//   window.__serve(stationId)   start the treatment at a station (the player walks there first), play it through with
//                               real pointer events and press Done; poll window.__serving (false when back on the floor)
//   window.__serveNext()        serve the first seated customer nobody is working on (returns the station id or '')
//   window.__walk(x, y)         walk the local player to a spot by tapping the floor
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const g = () => window.salonGame
  const view = () => g().host ?? g().snap
  // core/floor.ts SLOTS
  const SLOTS = [[760, 360], [960, 360], [1160, 360], [760, 610], [960, 610], [1160, 610], [330, 690], [540, 690]]
  window.__st = () => {
    const s = view()
    if (!s) return 'no salon'
    return JSON.stringify({
      day: s.day, phase: s.phase, money: s.money, rating: s.rating, served: s.stats.served,
      stations: s.stations.map(x => `${x.id}:${x.kind}@${x.slot} c=${x.customer} lead=${x.lead}`),
      customers: s.customers.map(c => `${c.id}:${c.plan.name}/${c.plan.treatment}${c.plan.disaster ? '!' : ''}/${c.state}`),
      staff: (s.ext?.staff ?? []).map(m => `${m.name}@${m.station} served=${m.served} task=${m.task ? m.task.station : '-'}`),
      goal: s.ext?.today.goal ? `${s.ext.today.goal.text} done=${s.ext.today.goal.done}` : null,
    })
  }
  window.__act = a => { g().act(a); return 'ok' }
  window.__walk = (x, y) => { const f = g().floor; f.walkTo({ x, y }); return 'walking' }

  async function serve(stationId) {
    const s = view()
    const st = s.stations.find(x => x.id === stationId)
    const c = st && s.customers.find(x => x.id === st.customer)
    if (!st || !c) return 'nobody there'
    // Walk over like a player: the floor's own goTo walks and then starts the treatment.
    const f = g().floor
    const [sx, sy] = SLOTS[st.slot]
    f.goTo({ kind: 'station', id: stationId, x: sx - 100, y: sy + 30 })
    const t0 = performance.now()
    while (!window.__treatment?.session || g().screen?.station !== stationId) { await sleep(150); if (performance.now() - t0 > 15000) return 'did not start' }
    await sleep(600)
    await window.__play(99)
    // The reveal: wait for the Done button, press it.
    const t1 = performance.now()
    while (!document.querySelector('.reveal-done') && performance.now() - t1 < 20000) await sleep(200)
    await sleep(1500)
    document.querySelector('.reveal-done')?.click()
    await sleep(800)
    return window.__playLog?.join(' ') ?? ''
  }
  window.__serve = id => { window.__serving = true; window.__serveLog = ''; serve(id).then(r => { window.__serveLog = r; window.__serving = false }, e => { window.__serveLog = 'ERR ' + e; window.__serving = false }); return 'started' }
  window.__serveNext = () => {
    const s = view()
    const st = s.stations.find(x => (!window.__only || x.id === window.__only) && x.id !== window.__skip && x.lead === null && x.customer !== null && s.customers.find(c => c.id === x.customer)?.state === 'seated' && x.slot >= 0)
    if (!st) return ''
    window.__serve(st.id)
    return st.id
  }
  return 'salon-drive ready'
})()
