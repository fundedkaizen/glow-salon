#!/bin/sh
# Rebuild every 3D model from source, pack it, and regenerate the catalogue.
#
#   sh assets-src/build.sh            everything
#   sh assets-src/build.sh people     just the people
#   sh assets-src/build.sh furniture  just the furniture (stations, front of house, room, plants, life, decor)
#
# Needs Blender 5.2 (BLENDER=path overrides the default), Python 3 with Pillow, and `python assets-src/fetch.py` once.
set -e
cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
GP=assets-src/tools/gltfpack.exe
[ -x "$GP" ] || GP=assets-src/tools/gltfpack
WHAT="${1:-all}"
mkdir -p assets-src/out public/models

pack() { # pack <src.glb> <dst under public/models> [extra gltfpack flags]
  mkdir -p "public/models/$(dirname "$2")"
  "$GP" -i "$1" -o "public/models/$2" -cc -kn -km -ke $3
}

if [ "$WHAT" = all ] || [ "$WHAT" = people ]; then
  python assets-src/people/prep_ubc_textures.py
  "$BLENDER" -b --python assets-src/people/build_people.py -- fem blend > assets-src/out/build_fem.log 2>&1 &
  P=$!
  "$BLENDER" -b --python assets-src/people/build_people.py -- masc > assets-src/out/build_masc.log 2>&1
  wait $P
  grep -h EXPORTED assets-src/out/build_fem.log assets-src/out/build_masc.log
  # float UVs: the face texture needs them (quantized UVs smear it)
  pack assets-src/out/people_fem.glb people/fem.glb -vtf
  pack assets-src/out/people_masc.glb people/masc.glb -vtf
  "$BLENDER" -b assets-src/out/people_fem.blend --python assets-src/people/measure_seats.py > assets-src/out/seats.log 2>&1
fi

if [ "$WHAT" = all ] || [ "$WHAT" = furniture ]; then
  for s in assets-src/furniture/build_*.py; do
    [ -f "$s" ] || continue
    echo "building $s"
    "$BLENDER" -b --python "$s" > "assets-src/out/$(basename "$s" .py).log" 2>&1 || { tail -20 "assets-src/out/$(basename "$s" .py).log"; exit 1; }
  done
  # every exported furniture file keeps its folder: assets-src/out/models/<dir>/<id>.glb -> public/models/<dir>/<id>.glb
  if [ -d assets-src/out/models ]; then
    (cd assets-src/out/models && find . -name '*.glb') | while read -r f; do pack "assets-src/out/models/$f" "${f#./}"; done
  fi
fi

python assets-src/catalog_gen.py
du -sh public/models
