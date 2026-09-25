# The 3D salon floor

The salon floor is a real 3D room in the style of Serenity's Spa: an isometric view (yaw 45 degrees, pitch 35,
orthographic, fixed), two tall back walls in a V, the front and door walls cut low, partitions making zones, and a
street-front garden. It is the default floor; `?floor=2d` (or a browser without WebGL2) gets the 2D floor.

Code: `src/render3d/` (Helper A). Models: `public/models/`, `src/art3d/catalog.ts`, `docs/3D-ASSETS.md` (Helper B).

## How it fits together

- **One canvas.** three.js renders into Pixi's own WebGL2 context (`stage.ts`), then Pixi draws the overlays (bubbles,
  tags, rings, prompts, coins) on top, each pinned to a projected 3D point. While a close-up is open the floor's Pixi
  root is hidden and the 3D pauses.
- **Same API as the 2D floor.** `FloorView3D` (`floor-view-3d.ts`) takes the same state, hooks and calls as
  `render/floor-view.ts`; `game/salon-app.ts makeFloor` picks one. The sim never changes: sim (x, y) maps to the
  ground plane by `mapping.ts` (100 units a metre, depth stretched 1.12).
- **Layout as data.** `layout.ts` holds every wall piece, floor piece, clear zone and the garden in metres;
  `furnish.ts` builds the salon for a state from it (pure three.js, no Pixi, so the tests build exactly what shows).
- **Few draw calls.** Every static piece, stand-in or Helper B's model, is baked into one batch per finish (matte,
  satin, gloss, metal, glass, glow) by `kit.ts`: a model's vertices move to where it stands and its material colour
  (or its style's) times its baked occlusion becomes the vertex colour (`models.ts`, `model-pieces.ts`). People are
  four or five skinned meshes each (`model-person.ts`) with live painted faces.
- **Stand-ins until the models load.** The kit's own primitives (`furniture.ts`, `garden.ts`) show for the first
  moment; when the models arrive the salon and the garden rebuild with them. Gifts load when first owned.

## Parity with the 2D floor (what matters in play)

| Feature | 2D | 3D | Checked |
|---|---|---|---|
| Walk: keys (WASD, arrows), tap/click to walk, pathfinding round furniture | yes | yes | desktop and phone, real input |
| Stations: tap or walk up, prompt (F / Enter / tap), start the treatment close-up | yes | yes | full day served with real pointer play |
| Computer at the desk (from behind the counter), shop tabs | yes | yes | morning shopping |
| Customers: arrive by the door, queue, sit on the sofas, walk to stations, leave | yes | yes | full day |
| Mood bubbles, wait dots, speech, name tags, station labels and progress rings | yes | yes | full day |
| Staff: walk, work at stations (tools), tea breaks, countdowns | yes | yes | staff day |
| The cat: wanders, sits, sleeps, petting | yes | yes | |
| Events: coins, hearts, sparkles, floats, bell and door | yes | yes | full day |
| Empty-slot placing of a new station (glowing pads) | yes | yes | |
| Decor sets, gifts, starter decor, upgrades on the floor | yes | yes (Helper B's models) | mesh validator, every item in every slot |
| Progression: grey ghosts with prices, buy card, three styles, Decorate, level bar, level-up | no | yes | |
| Co-op: other players, their tags and moves | yes | yes | two tabs |
| Title-screen demo salon | yes | yes | |
| Receipt and reviews after closing | yes | yes | full day |
| Phone 390 x 844 | yes | yes | real taps, framing test |
| Close-up pause (3D stops while a treatment is open) | n/a | yes | |

Not in 3D (nice-to-haves): the 2D floor's paper-doll faces up close on the floor (the 3D heads carry the same
painted faces instead), the tree canopies' sway once the tree models load (the stand-in trees sway).

## Layout rules and the validators

- `tests/floor3d-layout.test.ts`: footprints. Nothing on a wall crosses a window, a door or another piece, or reaches
  the top trim; no two floor pieces overlap; the desk front, the computer, the door, the start spots and every work
  spot keep clear floor; the entrance path is clear; every decor piece fits every slot of its kind.
- `tests/floor3d-mesh.test.ts`: the real meshes. It loads Helper B's models from disk, builds the room, the garden
  and the furniture for five salons (day one, full salons of each station kind, every upgrade) and every decor piece
  in every slot, and tests every triangle of every piece against every other piece. Allowed contacts only: things
  stand on the floor, wall pieces (`mount:`) touch the wall, curtains hang over window frames. People at their work
  spots, the computer, the queue, the start spots and the doorway must stand clear of everything but the stool they
  sit on. The entrance set (pots, gate posts, path) must be symmetric about the door.
- `tests/floor3d.test.ts`: mapping, facing, the reception and computer placement, paths (customers never cut behind
  the desk), the camera (fixed angle, the room fits on desktop, the player stays on screen on a phone).
- `tests/unlocks.test.ts`: the unlock order and pacing, level-up events, styles (saved, co-op synced), ghost picks.

## Progression (Serenity style)

Salon level comes from lifetime earnings (`core/unlocks.ts`, data): 16 authored levels (Little salon at 0, then
Reception glow-up 400, Cosy lounge 1000, Garden corner 2000, Plush chairs 3300, Nail bar glam 5000, Foot spa glam
7000, Sunlit floor 9500, Crystal lights 12500, Gold reception 16000, Grand lounge 20500, Luxe facial beds 26000,
Crystal nail bar 33000, Royal foot thrones 41000, Marble floor 51000, Silk walls 63000), then stars growing 1.22x a
level to level 40, paced for about 100 hours. There is always a next goal. At most three solid grey ghosts show the
next affordable things, never sharing a slot, each with a price badge; tap, confirm and it is bought through the
shop's own actions. Every stylable piece has three styles (Helper B's model styles), saved per item and synced.

## Performance

Measured in Chrome with CDP CPU throttling at 390 x 844 (see the table in the final report and below). The GPU of the
test machine is an RTX 4060 Ti, so only the CPU cost is throttled.

PERF_TABLE

## Credits

- Studio light: "Brown Photostudio 02" by Sergej Majboroda, Poly Haven, CC0 (`public/env/studio_512.hdr`, downsized).
- Models: see `public/models/CREDITS.md` (Quaternius' Universal Base Characters and Animation Library, CC0; the rest
  built by Helper B's scripts).
- Everything else in `src/render3d/` is our own.

## Notes

- Tone mapping is Neutral (not ACES or AgX): it keeps the pastels saturated. `?tm=aces|agx` and `?exp=` compare.
- No awning over the door: at this camera anything tall enough to walk under projects over the reception on screen.
- The 2D floor draws the 3D-only fixtures (the lounge armchairs, the front planter) as blocked floor only.

## Asks for B

- Add the Poly Haven studio HDRI to `public/models/CREDITS.md`.
- The reception desk's work node faces away from the desk (rotY -180 at -Z); the floor turns the player itself.
- The facial chair's work node sits inside its base's side panel; the floor moves it out to 0.78 m.
