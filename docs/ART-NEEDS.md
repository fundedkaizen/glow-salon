# Art needs from the systems round (for builder A)

The step logic below is done and tested; each item plays today with a stand-in look. Everything is data in
`src/core/treatments/facial.ts` and `nails.ts` (step ids, tools, layers, tints), so the art can be wired
without touching the logic. A customer's own step list comes from `plan.ts` (`session.def.steps`, as before).

## Close-up: facial masks (one of four per customer)

All four paint the existing `mask` layer. Each step now carries `tint` (a hex number) saying what colour the
product is; the view only needs to apply it.

| Mask | Steps (ids) | Stand-in today | Needs |
|---|---|---|---|
| Clay (as before) | `mask`, `dry`, `peel` | the clay | nothing |
| Sheet mask | `sheet`, `soakIn`, `peel` (tint `0xf3f6fa`) | green clay | a translucent white sheet with a wet sheen and cut-outs for eyes and lips; the peel flap in white |
| Bubble mask | `bubble`, `fizz` (foam layer), `rinseMask` (tint `0x6b6770`) | green clay, then the real foam | charcoal grey mask that fizzes into grey-white bubbles; foam tinted grey during `fizz` |
| Gold foil | `gold`, `dry`, `peel` (tint `0xe8c46a`) | green clay | gold foil with crinkles and glints; the peel flap in gold |

Wiring, in `treatment-view.ts` / `surface.ts`:
- `enterStep`: `if (step.tint && step.layer) surface.setLayerTint(step.layer, step.tint)`; the `dry` visuals and
  `drawPeel` flap colour should use the tint of the current mask (the flap is mint for every mask now).
- `applySnapshot` sets the dried-mask look with `step > 7`; with shuffled steps use the index of the `dry` step
  in `session.def.steps` instead (the constructor already does this right).
- A bug seen while testing (also with the plain clay mask): when a paint step finishes, `surface.resolve(layer, 1)`
  fills the whole render texture, so the mask art shows as green rectangles above the face in the top corners
  (artifacts/sys2/33-guest-treating.png). A resumed treatment (`initFromGrid`) is clipped correctly; resolve to 1
  should fill only the step's region (the session's grid), the same way.

## Close-up: the extras (one or two per facial)

| Step id | What | Stand-in | Needs |
|---|---|---|---|
| `brows` (region `brows`, layer `glow`) | Brow tidy | gloved fingers, a sheen on the brows | tool art `browBrush` (a spoolie); brows brushed up (maybe a tidier brow texture) |
| `lips` (region `lips`, layer `cream`) | Lip scrub | the sugar scrub tub, white cream on the lips | a pink sugar-scrub texture on the lips |
| `eyePatches` (targets `patch`, `tag: 'eye'`) | Under-eye patches | the round pimple patch, bigger | a crescent gel patch (pink or gold), placed under each eye |
| `jade` (layer `serum`) | Jade roller | gloved fingers | tool art `jadeRoller` (a green stone roller on a gold frame) |
| `sheet` tool | Sheet mask | gloved fingers | tool art `sheetMask` (a folded sheet held by its corner) |

New tool ids fall back to the gloved fingers (`toolArt` does that already), so adding a painter under the same
id is all it takes.

## Close-up: manicures

| Step id | What | Stand-in | Needs |
|---|---|---|---|
| `repair0` to `repair4` (regions `nail0` to `nail4`, layer `base`, tint `0xfbe4ec`) | Repair a broken nail | clear base coat on that nail | the broken nail should look mended after the step (a silk wrap or a smooth, filled tip) |
| `airDry` (hold, tool `fan`) | Classic polish drying | the fan | fine; maybe a soft shine sweep over the polish while held |
| `oil` (layer `wet`, region `cuticles`) | Cuticle oil | the dropper, wet sheen | a golden oil tint on the cuticles |
| `massage` (layer `wet`, region `hand`) | Hand massage | cream, wet sheen | fine |
| gel: `cure` twice | UV after colour and after top | the UV lamp, twice | fine |

## Floor

- Regulars' gifts are real items now (`gift:<regular>` in `owned`). They stand in the gift spots
  (`GIFT_SLOTS` in `core/decor.ts`) using the closest existing piece (`GIFT_ART` in `render/floor-view.ts`) with a
  little bow. Each needs its own small painted piece (about 56 px): lemon tree, rose gold polish, ring light,
  painting, espresso machine, orchid, arcade cabinet, honey mask jar, plushie, vintage sign, record player,
  chandelier, bookshelf, royal portrait, and the rest in `content/regulars.ts`.
- Front of the salon: a runner rug (the base rug scaled and tinted mint), a reading lamp and the magazine table
  fill the lower half. A proper runner rug piece would look better than the scaled base rug.
- Staff at work show a small bubble with the treatment icon and foam puffs or sparkles at the customer. A proper
  "working" pose (tools in hand) would be nicer than the current busy arms.

## People (the new look fields)

`Look` (core/customers.ts) now has `gender: 'female' | 'male'` and `age: 'young' | 'adult' | 'older'`, set for every
customer, regular and staff member so they agree with the name and archetype (a grandma is an older woman, a
student is young). Looks made by the game also carry your `figure` (`figureFor(gender, age)`: masc from gender,
age young 0.1 to 0.25, adult 0.3 to 0.6, older 0.85 to 1), so `withFigure` keeps it. Players keep the old
default figure (young adult) until avatars can be chosen.
