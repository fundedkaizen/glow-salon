# Glow Salon

A cozy, no-rush, ASMR-satisfying beauty salon for the browser, made to be played together. Work one
customer at a time in a big close-up (a facial or a manicure, step by step with tools from a tray), then run
the salon: customers arrive, pay, tip and leave Google-style reviews; buy tools, stations, decor and
marketing at the salon computer. Up to four players share one salon through an invite link.

## Run it

```sh
npm install
npm run dev        # http://127.0.0.1:5195  (the co-op relay rides on the dev server at /coop)
npm test           # every tests/*.test.ts in Node, fails loudly
npx tsc --noEmit   # typecheck
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ at http://127.0.0.1:4195 (with the relay)
```

Always check the built copy (`npm run build` then `npm run preview`) as well as dev.

### Builds for GitHub Pages and the shared relay

```sh
VITE_COOP_URL=wss://coop.kaizenbot.cloud/coop npx vite build --mode pages
```

`--mode pages` sets the base to `/glow-salon/` (in `vite.config.ts`, because Git Bash rewrites a `--base /x/`
argument into a Windows path). `VITE_COOP_URL` points co-op at the relay on the owner's server; without it
the game uses `/coop` on its own host. Room codes keep games apart on a shared relay.

The relay can also run on its own: `PORT=8787 node server/coop-relay.mjs`.

### Trying things directly

- `/?view=facial` or `/?view=nails` opens a treatment close-up straight away. Add `&seed=12` (a different
  customer), `&step=5` (start at a later step), `&tier=3` (luxe tools) or `&disaster`.
- Four hands: open `/?view=facial&coop=host` in one tab, read the room code in the corner, then open
  `/?view=facial&coop=CODE` in another. The second player helps: on extraction steps they hold the
  magnifier lamp, which doubles the lead's speed.

## Music and sounds

- Music plays only on the salon floor and in menus, never during a treatment. The playlist is
  `public/music/playlist.json`: drop an mp3 into `public/music/` and add its file name to the list. Tracks
  stream one at a time and cross-fade.
- Tool sounds layer real recordings from `public/sounds/` (see its README and `kit.json`) with Web Audio
  synthesis, with random pitch, gain and timing so repeats never sound identical.

## Credits

- Additional sounds: Joseph SARDIN - BigSoundBank.com (CC0)
- Music (CC0, OpenGameArt): tad (A cup of tea, Bartender, Cat caffe, Countryside, Cue, Florist, Morning
  rain, Oceanside, Rainy forest, Since 2 a.m.), omfgdude (Chill lofi, Lofi hip hop, Lofi again), Tarush
  Singhal (Happy lofi day), cynicmusic (November snow)
- All art is drawn in code.
