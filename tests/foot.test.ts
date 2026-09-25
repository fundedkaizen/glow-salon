import { check } from './harness.ts'
import { inRegion } from '../src/core/geometry.ts'
import { alongToe, footAnatomy, footProfile, footProfileLevel, footShape, ingrownSpot, toeNail } from '../src/core/foot.ts'

// The pedicure geometry and conditions (core/foot.ts): seeded, deterministic, and the regions line up with
// the toes and nails the art paints on them.
for (const seed of [1, 7, 11, 42, 1234]) {
  const a = footAnatomy(seed), b = footAnatomy(seed)
  check(`foot ${seed}: same seed, same foot`, JSON.stringify(a.shape) === JSON.stringify(b.shape))
  const top = a.regions.top, sole = a.regions.sole
  a.shape.toes.forEach((t, i) => {
    const n = toeNail(t)
    const mid = { x: (n.base.x + n.tip.x) / 2, y: (n.base.y + n.tip.y) / 2 }
    check(`foot ${seed}: toe ${i} middle is in the foot`, inRegion(top.foot, alongToe(t, 0.5).x, alongToe(t, 0.5).y))
    check(`foot ${seed}: nail ${i} middle is in the nails`, inRegion(top.nails, mid.x, mid.y))
    check(`foot ${seed}: nail ${i} middle is on its toe`, inRegion(top.toes, mid.x, mid.y))
    check(`foot ${seed}: toe ${i} stays on the sheet`, t.tip.x > 0 && t.tip.x < 1024 && t.tip.y > 0 && t.tip.y < 1024)
  })
  check(`foot ${seed}: toes descend from the big toe to the little toe`, a.shape.toes[0].tip.y > a.shape.toes[4].tip.y)
  check(`foot ${seed}: the big toe is the widest`, a.shape.toes.every((t, i) => i === 0 || t.r0 < a.shape.toes[0].r0))
  check(`foot ${seed}: the heel is in the sole`, inRegion(sole.sole, 512, 880) && inRegion(sole.heel, 512 + (552 - 512) * a.shape.width, 862))
  check(`foot ${seed}: the arch is not a callus zone`, !inRegion(sole.calluses, 512 + (430 - 512) * a.shape.width, 620))
  const spot = ingrownSpot(a, 1)
  check(`foot ${seed}: the ingrown spot is on a nail fold`, inRegion(top.nailFolds, spot.x, spot.y))
}

// Seeded variation: some feet have bunions, long second toes, and each nail shape turns up.
const shapes = Array.from({ length: 200 }, (_, i) => footShape(i))
check('some feet have a bunion', shapes.some(f => f.bunion > 0) && shapes.some(f => f.bunion === 0))
check('some second toes are longer than the big toe', shapes.some(f => f.longSecond))
check('every nail shape turns up', ['square', 'round', 'fan'].every(k => shapes.some(f => f.nailShape === k)))

// Conditions follow the catalogue's ranges (content/treatments.json, feet family).
for (let seed = 0; seed < 300; seed++) {
  for (const disaster of [false, true]) {
    const p = footProfile(seed, disaster)
    const ok = p.calluses >= 0 && p.calluses <= 1 && p.cracks >= 0 && p.cracks <= 1 && p.dirt >= 0 && p.dirt <= 1 && p.hair >= 0 && p.hair <= 1
      && p.corns.length <= 3 && p.splinters.length <= 3 && p.fungus.filter(f => f > 0).length <= 5 && [-1, 0, 1].includes(p.ingrown)
    if (!ok) { check(`profile ${seed} in range`, false, p); break }
  }
}
check('profiles stay in range', true)
const d = footProfile(5, true)
check('a disaster has fungus, calluses and dirt', d.fungus[0] > 0 && d.calluses > 0.7 && d.dirt > 0.7)
const clean = footProfileLevel(5, 0), worst = footProfileLevel(5, 3)
check('level 0 is clean', clean.fungus.every(f => f === 0) && !clean.corns.length && !clean.splinters.length && !clean.polish)
check('levels get worse', footProfileLevel(5, 1).dirt < footProfileLevel(5, 2).dirt && footProfileLevel(5, 2).dirt <= worst.dirt)
