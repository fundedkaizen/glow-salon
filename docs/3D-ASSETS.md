# 3D assets: how they are made and rebuilt

Every model in `public/models/` is built by Blender Python scripts in `assets-src/`, so nothing is hand-edited and
everything can be rebuilt from source. The floor engine (`src/render3d/`) reads models only through the generated
catalogue `src/art3d/catalog.ts`. Licences and sources: `public/models/CREDITS.md` (CC0 packs and our own work only).

## Rebuild

```sh
python assets-src/fetch.py       # once: the CC0 packs (Quaternius UBC and UAL) into assets-src/vendor, gltfpack into assets-src/tools
sh assets-src/build.sh           # everything: people, furniture, packing, catalogue
sh assets-src/build.sh people    # just the people
sh assets-src/build.sh furniture # just the furniture
npx tsc --noEmit                 # the catalogue must type-check
```

Needs Blender 5.2 (set `BLENDER=` if it is not at the default Windows path), Python 3 with Pillow, and a GPU helps
(Cycles bakes the soft occlusion). Intermediate files go to `assets-src/out/` (git-ignored), with a log per build.

## The pipeline

- `assets-src/lib/gs.py`: shared Blender helpers: scene reset, named PBR materials, primitives (rounded boxes, lofts,
  tapered limbs, tori), voxel unions, decimation, soft occlusion baked into vertex colours (`COLOR_0`), glTF export,
  gltfpack, and the preview studio and camera (the floor camera: yaw 45, pitch 35, orthographic).
- Exported `.glb` files are packed with **gltfpack 1.2** (meshopt, `-cc -kn -km -ke`: every named node and material is
  kept, since the engine reads them by name). Load them with `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)`.
- `assets-src/catalog_gen.py` merges the build manifests (`assets-src/out/manifest/*.json`: measured footprint, nodes,
  materials, triangles) with hand-kept metadata and writes `src/art3d/catalog.ts`.

## People (`assets-src/people/`)

Built on Quaternius' **Universal Base Characters** (CC0, the free tier: the Superhero female and male bodies with their
faces, eyes and brows, and five sculpted hair pieces) and the **Universal Animation Library** rig (CC0).

1. `prep_ubc_textures.py` (plain Python): the body texture divided by its median skin colour (tintable), the hair
   strand texture made neutral grey, the eye with a grey iris; 1024 px or less, JPEG.
2. `build_people.py -- fem|masc` (Blender), using:
   - `ubc.py`: load the body, eyes, brows and hair pieces; restyle through the rig (thinner, shorter legs and arms, a
     narrower chest, a head about 1.8x, applied as the new rest pose, feet back on the floor); fold the finger bones
     into the hands (23 bones); smooth away the superhero muscles; enlarge and open the eyes; split the head off at
     the neck so every outfit shares it.
   - `outfits.py`: each outfit is the body with garment regions cut on clean loops (bisect planes), coloured by
     material, lifted a little with a lip at every hem, plus the silhouette parts (a flared skirt with folds, a hood,
     collars, lapels and a tie, a dungaree bib, an apron, pockets) and chunky shoes. Extra parts get their weights
     from the body by nearest-surface transfer.
   - `ubc_hair.py` + `hair.py`: the seven styles (long, bob, bun, curly, crop, ponytail, braids) from the UBC pieces over
     a scalp cap, with a bob cut from the long hair and a ponytail, braids and curls made here and textured with the
     same strands; the bow and flower clip placed on each style's surface; round glasses in front of the eyes.
   - `anims.py` + `rig.py`: the clips. Walk is the UAL mocap (straightened a little so faces read from above);
     everything else is keyed here with a small forward-kinematics pose language (`rig.set_pose`, with `aim()` to point a
     limb in a direction). Every seated clip puts the hips on the model's origin.
3. `measure_seats.py`: measures where knees, feet, elbows and wrists land in each seated clip, so furniture seats fit
   (`assets-src/out/seats.json`, also summarised in the catalogue as `hipsAboveFeet`).
4. `render_people.py`: preview renders from the exported files (`lineup`, `poses`, `turn`, and `lineup ... game` at
   in-game size), tinted like the engine does. Renders go to `artifacts/assets/` (git-ignored).

## Furniture (`assets-src/furniture/`)

`furn.py` has the helpers (chunky rounded solids, tufted cushions, gold pedestals, bottles), the export of one model
(its `.glb`, its manifest entry and its 256 px transparent thumbnail from the floor camera's angle into
`public/models/thumbs/`), and `styled()` for purchasable items with three styles. Each `build_*.py` builds one group of
models. Conventions: Y up, metres, +Z (Blender -Y) is the model's front, origin on the floor in the middle of the
footprint; helper empties `seat`, `work`, `feet`, `tool`, `lookat` (a seat node's front is the way the sitter faces);
recolourable materials `Accent` (the main colour) and `Trim` (usually gold). Silhouettes stay clean and readable in
flat grey, with no tiny floating parts (unbought items show as a grey ghost).

## The viewer

`assets-src/viewer/` is a tiny three.js page that loads every catalogue model and both people files, shows them from
the floor camera, plays the clips and toggles the grey ghost look. `window.__viewer` reports what loaded or failed.

```sh
npx vite --host 127.0.0.1 --port 5203 --strictPort
# then open http://127.0.0.1:5203/assets-src/viewer/?view=people&clip=idle  (view: people, all, station, front, ...)
```

## Budgets

About 3k triangles per furniture piece and about 6k per character in the plan; the people are heavier (a visible
character is about 11 to 13k: the UBC faces need the geometry), which the lead accepted for this base. Textures are
1024 px or less; all models together stay under 12 MB after compression (`du -sh public/models`).
