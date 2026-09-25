# Feet: wiring the pedicure art to steps

**Wired (round 4).** The steps live in `core/treatments/feet.ts` (the step library, layers with a `top.`/`sole.`
prefix, `FOOT_VARIANTS`), each customer's own list in `plan.ts` (`feetPlan`: Classic Pedicure, Foot Clinic or Spa
Pedicure from the foot's problems), the per-customer regions and foot seeding in `session.ts` (`mask()`,
`footRegion()`, `seedFoot()`), and the close-up in `render/treatment-view.ts` (the `feet` block: two surfaces, the
turn-over, the bath, shards, plasters, the peel). Play one with `/?view=pedicure&seed=N` (`&disaster`, `&step=`).
Tests: `tests/feet.test.ts`. The tables below are the original map and still describe the art.

Preview everything with the dev view: `/?view=feet` (see `src/render/foot-preview.ts`):

| Param | Meaning |
|---|---|
| `&side=top` or `&side=sole` | which view |
| `&sev=0..3` | severity: 0 clean, 1 mild, 2 bad, 3 disaster (default 2) |
| `&layers=a,b` | exactly these layers, fully on (empty: the bare foot) |
| `&after` | the finished foot: clean, polished, moisturised sheen (`&polish=N` picks the colour) |
| `&pins` | debug pins: every region outlined and labelled, toe axes, root and tip points |
| `&seed=`, `&skin=0..5` | the customer |

Contact sheets: `python scripts/sheet.py OUT.png COLS W H "label|/?view=feet&..." ...` (see `artifacts/sheets/feet-*`).

## Files

| File | What |
|---|---|
| `src/core/foot.ts` | Pure geometry and conditions: `footShape(seed)`, `footAnatomy(seed)` (regions for both views), `footProfile(seed, disaster)`, `footProfileLevel(seed, 0..3)`, `ingrownSpot()`, `toeNail()`, `toeFreeEdge()`. Tested in `tests/foot.test.ts`. Lives outside `core/treatments/` (another builder's lane this round); move it next to `anatomy.ts` when wiring. |
| `src/art/foot.ts` | `paintFoot(look, seed, profile, view)`: base, height/gloss, layer painters, overgrown tips, spot art, shards. `FOOT_LAYERS[view]` is the layer order. |
| `src/art/assets.ts` | `footAssetsFor(look, seed, profile, view, order?, eager?)` returns `PartAssets` plus `anatomy`, `footTips`, `spots`, `shards`; `destroyFootAssets()`. Layer materials are `FOOT_STYLES`. |
| `src/art/backdrop.ts` | `paintBackdrop('feet' \| 'sole', look)`: a towelled footrest on blurred salon tiles; `'feet'` adds the foot bath rim below the toes. |
| `src/art/tools.ts` | Tool art: `footBrush`, `callusRasp` (pumice), `creamTube` (antifungal), `tweezers`, plus the existing `clipper`, `file`, `pusher`, `nipper`, `buffer`, `scrub`, `cream`, `sponge`, `towel`, `polishBrush`, `baseCoat`, `topCoat`, `uvLamp`, `dropper`, `cottonPad`, `maskBrush`, `patch`. |

## Two views of one foot

Every customer's right foot, seeded (toe lengths and widths, sometimes a longer second toe, the foot's width,
square, round or fan nails, a bunion about one foot in five):

- **top**: the top of the foot, toes pointing down the screen, the big toe on the right, framed close like the
  reference (the forefoot fills the sheet, `TOP_SCALE` 1.42 about a point near the toe tips). A terry towel is
  draped over the ankle; its hem is `drapeY(x)` and every top layer stops above it. Nails, toes, knuckles, instep.
- **sole**: the sole, toes up, the big toe on the left, heel at the bottom. Toe pads, ball, arch, heel. Soles
  are paler and pinker than the top on every tone (`soleTone`).

A step needs to say which view it plays in (suggested: a `view: 'top' | 'sole'` field on the step, default
`'top'`). Two ways to switch:

1. Build both views' assets when the close-up opens (`footAssetsFor(..., 'top')` and `(..., 'sole')`; the
   layers are lazy; the bases cost about 200 ms for the top and 150 ms for the sole, measured in the preview)
   and two `Surface`s; show one, and turn the foot
   over (a quick squash through the middle and a camera punch) when a step's view differs from the last.
2. Or rebuild the one surface on a view change. Option 1 keeps both views' layer grids alive, which the
   session needs anyway (a scrub on the sole must not wipe the top's dirt).

Each view has its own layer grids: prefix the layer ids per view in the treatment data (`top.dirt`,
`sole.dirt`) or keep one `layers` record per view in the session.

## Regions

`footAnatomy(seed).regions.top` and `.sole` are `Region`s in art space (1024), like `REGIONS` in `anatomy.ts`,
but per customer (the foot is seeded). `regionMask()` in the session is keyed by a fixed `RegionId`
today; give it a per-session region source (the facial's shared outline trick does not work here: the toes move).

| View | Region | Where | Used by |
|---|---|---|---|
| top | `foot` | the whole foot below the towel, toes included | foot-bath, scrub, salt-scrub, foot-cream, foot-mask, foot-massage, antiseptic (broad) |
| top | `toes` | the five toes | fungus-cream (with `betweenToes`) |
| top | `nails` | the five nail plates (capsules close to the painted nails) | colour, top-coat, file (tops), remove polish |
| top | `tips` | a band at each nail's free edge | clip (targets), file |
| top | `cuticles` | an arc at each nail's base | cuticle-push |
| top | `nailFolds` | both folds along the big toenail | ingrown-lift, antiseptic after it |
| top | `knuckles` | the middle joint on top of toes 2 to 5, and the little toe's outer side | corn-removal area |
| top | `betweenToes` | the four clefts | fungus-cream, dirt |
| top | `instep` | the middle of the top of the foot | hair, massage |
| top | `ankle` | the band just under the towel | hot-towel edge, massage |
| sole | `sole` | the whole sole, toes included | scrub, salt-scrub, foot-cream, foot-mask, foot-massage |
| sole | `toePads` | the pad of each toe | dirt, calluses on the big toe |
| sole | `ball` | the ball of the foot | callus-rasp, dirt |
| sole | `arch` | the inner arch (unworn skin) | massage, cream (no calluses here) |
| sole | `heel` | the heel pad | callus-rasp, cracks |
| sole | `heelRim` | the heel minus its middle | cracks (the fissures run in from here) |
| sole | `calluses` | heel, ball and the big toe pad together | callus-rasp (the whole job) |

## Conditions (profile) to layers

`FootProfile` follows the `feet` conditions in `treatments.json`; `footProfile()` seeds them.

| Condition (json) | Profile field | Layers it seeds | Targets / crops |
|---|---|---|---|
| calluses 0..1 | `calluses` | sole `callus`; top `callus` (inner side of the big toe and its joint, outer side of the little toe) | |
| corns 0..3 | `corns` (spots, top view) | top `redness` round each | `spots.corn` + `spots.cornCore`, then `spots.cornMark` |
| ingrown 0/1 | `ingrown` (-1, 0, 1: which fold) | top `swelling`, `redness` | lift at `ingrownSpot(anatomy, side)` |
| fungus 0..5 | `fungus[toe]` 0..1 (nails affected) | top `fungus` (per nail, severity scales cracks and colour), `redness` | fungal `footTips` (thick, ochre), `shards.fungal` |
| cracks 0..1 | `cracks` | sole `cracks` | |
| dirt 0..1 | `dirt` | top `dirt`, sole `dirt` | |
| splinters 0..3 | `splinters` (spots, sole view) | | `spots.splinter` + `spots.splinterHalo`, then `spots.splinterMark` |
| oldPolish 0..1 | `polish` (colour, chips) | top `oldPolish` (none on crumbling fungal nails) | polished `footTips` |
| hair 0..1 | `hair` | top `hair` | |
| (art only) | `grown[toe]` px past the toe | | `footTips[toe]` (null when short) |
| (art only) | `cuticle` 0.2..1 | top `cuticle` | |
| (art only) | `dry` 0..1 | sole `dry` | |

Seed the layers from the profile the way `seedLayer` does for faces and hands: `full` over their region for
the condition layers whose art already scales with severity (`fungus`, `oldPolish`, `swelling`, `callus`,
`cracks`, `cuticle`, `hair`), and a patchy seed for `dirt`, `dry` and `redness`.

## Layers

Order is `FOOT_LAYERS` (bottom to top). Material (gloss, relief, brush) is `FOOT_STYLES` in `assets.ts`.

### Top view

| Layer | Kind | Art | Steps that serve it (gesture) |
|---|---|---|---|
| `redness` | damage | inflamed skin round sick nails, corns, the ingrown fold, between the toes | fungus-cream and foot-cream clear it (`clears`) |
| `swelling` | damage | the red, shiny swollen fold over the big toenail's edge | ingrown-lift (targets) resolves it to 0 |
| `callus` | damage | yellowish rough patches on the big toe's inner side and joint, the little toe's outer side | callus-rasp (erase) |
| `fungus` | damage | yellow nails broken into raised plates by cracks, stained at the base, crumbling edge | file (erase, `nails`), then fungus-cream |
| `oldPolish` | dirt | chipped, scuffed old polish, bare at the grown-out cuticle | a remove-polish step (erase, `nails`; not in the json variants yet, suggest adding `remove-polish?` before `clip`) |
| `cuticle` | damage | pale papery crescents creeping onto each nail | cuticle-push (erase, `cuticles`) |
| `dirt` | dirt | grime growing with severity: patches, smudges, toe creases and clefts, under the nails | foot-bath (hold, loosens), scrub/salt-scrub (erase while foaming) |
| `hair` | damage | a tuft on the big toe, fine hair toward the ankle | none in the json yet (a wax or shave step could erase it) |
| `wet` | wet | water film and droplets | foot-bath, rinses, hot-towel |
| `antiseptic` | paint | amber iodine wash | antiseptic (paint, `nailFolds` or corn spots) |
| `cream` | paint | thick white foot cream with swirls | foot-cream (rub), foot-massage |
| `antifungal` | paint | dense white cream over the toes | fungus-cream (paint, `toes` + `betweenToes`), tool `creamTube` |
| `oil` | glow | golden massage oil sheen | foot-massage (rub) |
| `mask` | paint | lavender peel-off gel | foot-mask (paint), then a peel |
| `scrub` | paint | white foam with big clear bubbles | scrub (rub, tool `footBrush`) |
| `salt` | paint | pink salt crystals in oil | salt-scrub (rub, tool `scrub`) |
| `base` | paint | clear base coat | a base-coat step before colour |
| `color` | paint | polish at 90% grey; the shader tints it (`setLayerTint('color', hex)`) | colour (paint, `nails`, `choice: 'polish'`) |
| `top` | paint | clear glossy top coat | top-coat (paint, `nails`) |
| `water` | wet | looking down through bath water: tint, caustics, rising bubbles, foam rafts | foot-bath (hold): fade it in, then out when the foot comes out |

### Sole view

| Layer | Kind | Art | Steps that serve it |
|---|---|---|---|
| `callus` | damage | waxy yellow thick skin on heel, ball, big toe pad, outer edge | callus-rasp (erase, `calluses`, tool `callusRasp`) |
| `dry` | damage | pale flaking patches on heel and ball | scrub, foot-cream |
| `cracks` | damage | thin branching fissures in from the heel rim (red where deep, flaky pale edges) | callus-rasp softens, foot-cream / foot-mask clear it |
| `dirt` | dirt | grime on everything that touches the floor; the arch stays clean | foot-bath, scrub |
| `wet`, `antiseptic`, `cream`, `oil`, `mask`, `scrub`, `salt`, `water` | | as on top, for the sole | as on top |

## Targets and spot art

| Target | View | Position | Art (`FootAssets`) | Suggested step |
|---|---|---|---|---|
| overgrown tip | top | `toeNail(toe).tip`, grows toward `toeFreeEdge(toe, grown)` | `footTips[toe]` (anchored like the hand's tips: rotate to the nail's direction, anchor y = `1 - tip.y / height`) | clip (targets, tool `clipper`): fly off; spawn `shards.clean` or `shards.fungal` (the reference's falling bits) |
| corn | top | `profile.corns[i]` | `spots.corn` (scale `size / 40`) and `spots.cornCore`; after: `spots.cornMark` | corn-removal (hold to lift the core, tool `tweezers` or a corn blade) |
| ingrown edge | top | `ingrownSpot(anatomy, profile.ingrown)` | the `swelling` layer | ingrown-lift (hold, tool `pusher`) |
| splinter | sole | `profile.splinters[i]` (angle is the sliver's direction) | `spots.splinterHalo` + `spots.splinter` (scale `size / 60`, rotate by `angle`); after: `spots.splinterMark` | splinter-tweeze (hold and pull, tool `tweezers`) |
| plaster | either | on a lifted corn or a pulled splinter | `spots.plaster` | bandage (targets, tool `patch`) |

## The json steps

| Step (json) | View | Gesture | Tool | Layer / region | Reaction |
|---|---|---|---|---|---|
| foot-bath | top | hold | `sponge` (or a jug) | `water` over `everywhere`, loosens `dirt` (also) | content |
| scrub | top, then sole | rub | `footBrush` | `scrub` on `foot` / `sole`; also `dirt` and `dry` down | tickle (feet are ticklish: use `personality`) |
| salt-scrub | top, then sole | rub | `scrub` | `salt` | tickle |
| callus-rasp | sole (top for the toe calluses) | erase | `callusRasp` | `callus` on `calluses`; also `cracks` down | neutral |
| clip | top | targets | `clipper` | tips | flinch on the big fungal ones |
| file | top | erase | `file` | `fungus` on `nails` (thins it), `tips` | neutral |
| cuticle-push | top | erase | `pusher` | `cuticle` on `cuticles` | neutral |
| corn-removal | top | targets | `tweezers` | corns | flinch |
| ingrown-lift | top | targets | `pusher` | ingrown spot, `swelling` resolves to 0 | flinch |
| splinter-tweeze | sole | targets | `tweezers` | splinters | flinch |
| fungus-cream | top | paint | `creamTube` | `antifungal` on `toes`; clears `redness` | content |
| antiseptic | top | paint | `cottonPad` | `antiseptic` on `nailFolds` / corn spots | flinch (it stings) |
| bandage | top or sole | targets | `patch` | plasters | content |
| foot-cream | top, then sole | rub | `cream` | `cream`; clears `dry`, `cracks` (sole) | content |
| foot-mask | top | paint | `maskBrush` | `mask` on `foot`, then peel | content |
| hot-towel | top | hold | `towel` | `wet`; art not made yet (a towel wrapped over the foot, like the facial steam towel) | content |
| foot-massage | top | rub | `cream` (hands) | `oil` on `foot` | content |
| colour | top | paint | `polishBrush` | `color` on `nails` (`choice: 'polish'`) | neutral |
| top-coat | top | paint | `topCoat` | `top` on `nails` | neutral |

## Still open for the art

- The hot towel wrapped over the foot (for `hot-towel`) is not painted; the facial's `paintSteamTowel` is the
  pattern.
- The flip between the top and the sole view is a view animation, not art.
- Hair has no step in the json; if one is added (wax or shave), the `hair` layer is ready.
