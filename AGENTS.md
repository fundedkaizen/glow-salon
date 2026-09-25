# Glow Salon: notes for coding agents

TypeScript + Vite + PixiJS v8 (WebGL). No backend besides the small WebSocket relay for co-op.

## Commands

```sh
npm test                    # node scripts/test.mjs: every tests/*.test.ts, prints counts, exits 1 on any failure
node scripts/test.mjs coop  # only files whose name contains "coop"
npx tsc --noEmit            # must stay clean
npm run dev                 # 127.0.0.1:5195 (use this port; 5173/4173 belong to other projects)
npm run build && npm run preview   # the built copy at 127.0.0.1:4195; always check it too
```

Tests run in plain Node (it strips the types), so everything under `src/core` must use erasable TypeScript
only (`erasableSyntaxOnly` is on: no enums, no parameter properties) and import with `.ts` extensions.

## Layout

- `src/core/`: pure game logic, no DOM or Pixi, all unit-tested.
  - `treatments/`: the data-driven step pipeline. `types.ts` (a treatment is data: layers + steps),
    `facial.ts`, `nails.ts` (the data), `session.ts` (runs any treatment from ops; emits events),
    `profile.ts` (every customer's problem, seeded: pimples, grime, polish, damage, personality),
    `anatomy.ts` (face and hand geometry shared by logic and art), `grid.ts` (coverage grids).
    A new treatment is a data file plus its art; see "Adding a treatment".
  - `salon.ts` (the day loop reducer, host-authoritative), `economy.ts`, `customers.ts`, `reviews.ts`,
    `floor.ts` (layout and pathfinding), `save.ts` (localStorage and GLOW1 save codes), `coop/protocol.ts`.
- `src/art/`: the asset layer. Everything is painted in code on canvases (`face.ts`, `hand.ts`, `pimples.ts`,
  `backdrop.ts`, `props.ts`, `tools.ts`, `bits.ts`) and turned into textures in `assets.ts`. Painted images
  can replace any sheet later without touching logic, as long as they line up with `core/treatments/anatomy.ts`
  on the 1024 x 1024 art sheet.
- `src/render/`: `surface.ts` (lit skin mesh + one mesh per layer, each shown through a render-texture mask
  that tools stamp into), `shaders.ts` (skin and layer GLSL), `treatment-view.ts` (the close-up: input,
  camera, tools, targets, reactions, particles, peel, reveal and photo), `foam.ts`, `particles.ts`.
- `src/audio/`: `sfx.ts` (recorded clips from `public/sounds/` layered with synthesis; loops follow
  gestures; pan follows the tool), `music.ts` (playlist from `public/music/playlist.json`).
- `src/ui/`: DOM overlay (`treatment-hud.ts`, `style.css`, and the salon screens).
- `src/net/coop-link.ts`: the relay client. `server/coop-relay.mjs`: the relay (also a Vite plugin in dev).
- `src/game/`: thin glue. `treatment-glue.ts` opens a close-up for a station and names the co-op hooks.
- `src/main.ts`: boot, plus the `?view=` debug close-ups.
- `scripts/browser/*.js`: browser checks run with `npx agent-browser --session glow1 eval --stdin < file`.
- `artifacts/`: screenshots and evidence (git-ignored).

## Co-op

The host runs the salon state; guests send actions (`act`) and treatment ops (`ops`); the host routes ops
to the rest of a station's crew and broadcasts snapshots. Treatment sessions are deterministic from their
ops, so partners at one station mirror each other; a late joiner asks the lead for a snapshot (`syncReq`,
`sync`, run-length encoded grids, a few KB). The relay's frame limit is 256 KB; `CoopLink.send` refuses
anything over 200 KB, so a big message can never take the shared relay down.

## Browser checks

- One agent-browser session at a time (`--session glow1`), and close it when done. Tabs are `t1`, `t2`.
  A hidden tab pauses rendering, so switch to a tab before checking it.
- `scripts/browser/play-treatment.js` plays a close-up with real pointer events: load it, then
  `window.__run(n)` and poll `window.__playing` (long plays outlast one eval). `window.__doneStatus()`.
- `scripts/browser/soundcheck.js` renders every sound offline and reports peak and RMS levels;
  `window.__soundreel()` renders them all into one WAV.
- Look at every screenshot; passing checks are not proof of a good picture.

## Gotchas

- Rendering a lone Sprite into a RenderTexture ignores the sprite's own position in Pixi v8: put it in a
  container first (`Surface.renderOne`).
- Canvas textures need mipmaps (`art/tex.ts`) or fine detail shimmers when the camera pulls back.
- The skin shader derives its normals from the height map (fine ones for the wet shine, soft mip-biased ones
  for diffuse light, or the skin reads as grain). Do not compute normal maps on the CPU: reading a painted
  canvas back (getImageData) at treatment start once cost 3.7 s. `TreatmentView.buildMs` reports the art
  build time (about 0.3 s for a face).
- In Git Bash, write multi-line edits with files, not heredocs containing backticks.

## Adding a treatment

1. A data file in `src/core/treatments/` (layers, steps with tool, gesture, region, camera, reaction, sound,
   and `need` so steps drop out when a customer does not need them), registered in `registry.ts`.
2. Anatomy for a new body part in `anatomy.ts`, and a profile generator in `profile.ts`.
3. Art: a painter for the base and each layer sheet, wired in `art/assets.ts`.
4. Tests in `tests/session.test.ts` that play it through with ops.
