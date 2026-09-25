"""
Download the free (CC0) source packs and tools the Blender builds use, into assets-src/vendor and assets-src/tools.

    python assets-src/fetch.py

- Quaternius, Universal Animation Library [Standard] (CC0 1.0), https://quaternius.itch.io/universal-animation-library
  The walk clip (and the rig the people's own clips are keyed on).
- Quaternius, Universal Base Characters [Standard] (CC0 1.0), https://quaternius.itch.io/universal-base-characters
  The free tier's two bodies (Superhero female and male) with their faces, eyes and brows, and its hairstyles.
- gltfpack 1.2 (MIT), https://github.com/zeux/meshoptimizer/releases: meshopt compression of every .glb.

Nothing here is committed (see assets-src/.gitignore); run this once on a fresh clone before build.sh.
"""
import http.cookiejar
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, 'vendor')
TOOLS = os.path.join(HERE, 'tools')


def itch_download(game: str, upload_id: str, dest: str) -> None:
    """A free itch.io download: the same requests the 'No thanks, just take me to the downloads' button makes."""
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [('User-Agent', 'Mozilla/5.0 (glow-salon asset fetch)')]
    post = lambda url, data: op.open(url, urllib.parse.urlencode(data).encode()).read()
    page = op.open(game).read().decode('utf8', 'replace')
    csrf = re.search(r'name="csrf_token" value="([^"]+)"', page).group(1)
    durl = json.loads(post(game + '/download_url', {'csrf_token': csrf}))['url']
    dpage = op.open(durl).read().decode('utf8', 'replace')
    m = re.search(r'name="csrf_token" value="([^"]+)"', dpage)
    if m:
        csrf = m.group(1)
    r = json.loads(post(f'{game}/file/{upload_id}?source=view_game&as_props=1&after_download_lightbox=true', {'csrf_token': csrf}))
    print('  downloading', game, '->', dest)
    urllib.request.urlretrieve(r['url'], dest)


def main() -> None:
    os.makedirs(VENDOR, exist_ok=True)
    os.makedirs(TOOLS, exist_ok=True)
    ual = os.path.join(VENDOR, 'ual')
    if not os.path.exists(os.path.join(ual, 'UAL1_Standard.glb')):
        z = os.path.join(VENDOR, 'ual.zip')
        itch_download('https://quaternius.itch.io/universal-animation-library', '17958403', z)
        os.makedirs(ual, exist_ok=True)
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                base = os.path.basename(n)
                if base in ('UAL1_Standard.glb', 'License.txt', 'README.txt'):
                    with open(os.path.join(ual, base), 'wb') as f:
                        f.write(zf.read(n))
        os.remove(z)
    ubc = os.path.join(VENDOR, 'ubc')
    if not os.path.exists(os.path.join(ubc, 'body', 'Superhero_Female_FullBody.gltf')):
        z = os.path.join(VENDOR, 'ubc.zip')
        itch_download('https://quaternius.itch.io/universal-base-characters', '15861669', z)
        want = {
            'Base Characters/Godot - UE/': 'body', 'Base Characters/Textures/T_Superhero_Female_Light_BaseColor.png': 'tex',
            'Base Characters/Textures/T_Superhero_Male_Ligh.png': 'tex', 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/': 'hair',
            'Hairstyles/Textures/': 'hair', 'License_Standard.txt': '.',
        }
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                rel = n.split('Universal Base Characters[Standard]/', 1)[-1]
                for prefix, sub in want.items():
                    if rel.startswith(prefix) and not rel.endswith('/') and '/' not in rel[len(prefix):]:
                        d = os.path.join(ubc, sub)
                        os.makedirs(d, exist_ok=True)
                        with open(os.path.join(d, os.path.basename(rel)), 'wb') as f:
                            f.write(zf.read(n))
        os.remove(z)
    exe = 'gltfpack.exe' if sys.platform == 'win32' else 'gltfpack'
    if not os.path.exists(os.path.join(TOOLS, exe)):
        plat = {'win32': 'windows', 'darwin': 'macos'}.get(sys.platform, 'ubuntu')
        z = os.path.join(TOOLS, 'gltfpack.zip')
        print('  downloading gltfpack')
        urllib.request.urlretrieve(f'https://github.com/zeux/meshoptimizer/releases/download/v1.2/gltfpack-{plat}.zip', z)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(TOOLS)
        os.remove(z)
        if sys.platform != 'win32':
            os.chmod(os.path.join(TOOLS, exe), 0o755)
    print('vendor ready:', sorted(os.listdir(VENDOR)), 'tools:', sorted(os.listdir(TOOLS)))


if __name__ == '__main__':
    main()
