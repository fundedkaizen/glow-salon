"""
Prepare Quaternius' Universal Base Characters textures (CC0) for tinting (plain Python 3 + Pillow):

    python assets-src/people/prep_ubc_textures.py

- skin_<kind>.png (1024): the body texture divided by its own median skin colour, so the skin reads near white and
  the floor engine's Skin colour (the Look's skin tone) multiplies in; lips, eyelids and blush keep their relative hue.
- hair.png / hair_n.png (512): the strand texture made neutral grey (tinted by the Hair colour) and its normal map.
- eye.png (256): the eye with a grey iris (the engine recolours the iris; see src/art3d/catalog.ts).
Writes assets-src/out/ubc_tex/.
"""
import os

import json
import sys

from PIL import Image, ImageDraw, ImageOps, ImageStat

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
V = os.path.join(SRC, 'vendor', 'ubc')
OUT = os.path.join(SRC, 'out', 'ubc_tex')


def skin(src, dst, size=1024):
    im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
    px = im.load()
    # the median of the warm (skin) pixels: skip the grey underwear regions
    samples = []
    for y in range(0, size, 8):
        for x in range(0, size, 8):
            r, g, b = px[x, y]
            if r > g + 12 and g > b:
                samples.append((r, g, b))
    samples.sort(key=lambda c: c[0] + c[1] + c[2])
    mr, mg, mb = samples[len(samples) // 2]
    k = 0.9
    out = Image.new('RGB', im.size)
    op = out.load()
    for y in range(size):
        for x in range(size):
            r, g, b = px[x, y]
            if not (r > g + 6 and g >= b - 4):
                # underwear and other non-skin areas: plain light grey (always covered by clothes)
                v = int(0.9 * 255)
                op[x, y] = (v, v, v)
                continue
            op[x, y] = (min(255, int(r / mr * k * 255)), min(255, int(g / mg * k * 255)), min(255, int(b / mb * k * 255)))
    # flatten the broad tone (the face region is paler than the body in the source): divide by a heavy blur, so one
    # Skin tint matches everywhere while lips, blush and lids keep their local detail
    from PIL import ImageFilter
    import numpy as np
    a = np.asarray(out, dtype=np.float32)
    grey = np.asarray(out.filter(ImageFilter.GaussianBlur(size / 24)), dtype=np.float32)
    flat = a / np.maximum(grey, 1.0) * (k * 255)
    mask = np.asarray(im, dtype=np.int16)
    skinmask = (mask[:, :, 0] > mask[:, :, 1] + 6) & (mask[:, :, 1] >= mask[:, :, 2] - 4)
    a[skinmask] = flat[skinmask]
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(dst, quality=88, optimize=True)
    return (mr, mg, mb)


def hair(src, dst, size=512):
    im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
    g = ImageOps.grayscale(im)
    st = ImageStat.Stat(g)
    mean = st.mean[0]
    g = g.point(lambda v: max(0, min(255, int(v / mean * 0.82 * 255))))
    Image.merge('RGB', (g, g, g)).save(dst, quality=88, optimize=True)


def eye(src, dst, size=256, iris=0.115):
    """A cartoon eye for the eyeball's front (its UV centre): a white sclera and a big iris, dark at the top and light
    at the bottom, a dark ring at its rim and a pupil. Grey, so the Eyes material's colour tints it; the catchlight is
    a separate white card in front of the eye (the tint would colour a painted one)."""
    ss = 4
    W = size * ss
    im = Image.new('RGB', (W, W), (248, 244, 242))
    d = ImageDraw.Draw(im)
    cx = cy = W / 2
    R = iris * W
    for k in range(int(R), 0, -1):
        t = k / R
        # radial: rim dark, middle light; vertical: top darker
        v = 0.72 + 0.28 * (1 - t) ** 0.6
        d.ellipse([cx - k, cy - k, cx + k, cy + k], fill=(int(255 * v),) * 3)
    grad = Image.new('L', (W, W), 0)
    gd = ImageDraw.Draw(grad)
    for y in range(W):
        gd.line([0, y, W, y], fill=int(max(0, min(255, 150 - (y - (cy - R)) / (2 * R) * 150))))
    shade = Image.new('RGB', (W, W), (40, 40, 40))
    mask = Image.new('L', (W, W), 0)
    ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
    im.paste(shade, (0, 0), Image.composite(grad, Image.new('L', (W, W), 0), mask))
    d = ImageDraw.Draw(im)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(60, 60, 60), width=int(R * 0.09))
    pr = R * 0.36
    d.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], fill=(28, 28, 30))
    im.resize((size, size), Image.LANCZOS).save(dst, quality=94, optimize=True)


def lighten_sockets(path, spots, radius=0.045, amount=0.55):
    """Lift the dark shading round the eyes in the face texture (spots are UV centres, v up)."""
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    for (u, v) in spots:
        cx, cy = u * W, (1 - v) * H
        r = radius * W
        for y in range(int(cy - r), int(cy + r)):
            for x in range(int(cx - r), int(cx + r)):
                if not (0 <= x < W and 0 <= y < H):
                    continue
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / r
                if d >= 1:
                    continue
                k = amount * (1 - d * d) ** 2
                c = px[x, y]
                target = 0.9 * 255
                px[x, y] = tuple(int(ch + (target - ch) * k) if ch < target else ch for ch in c)
    im.save(path, quality=88, optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    print('fem skin median', skin(os.path.join(V, 'tex', 'T_Superhero_Female_Light_BaseColor.png'), os.path.join(OUT, 'skin_fem.jpg')))
    print('masc skin median', skin(os.path.join(V, 'tex', 'T_Superhero_Male_Ligh.png'), os.path.join(OUT, 'skin_masc.jpg')))
    hair(os.path.join(V, 'hair', 'T_Hair_2_BaseColor.png'), os.path.join(OUT, 'hair.jpg'))
    hair(os.path.join(V, 'hair', 'T_Hair_1_BaseColor.png'), os.path.join(OUT, 'hair1.jpg'))
    Image.open(os.path.join(V, 'hair', 'T_Hair_2_Normal.png')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'hair_n.jpg'), quality=90)
    Image.open(os.path.join(V, 'hair', 'T_Hair_1_Normal.png')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'hair1_n.jpg'), quality=90)
    eye(os.path.join(V, 'body', 'T_Eye_Brown.png'), os.path.join(OUT, 'eye.jpg'))
    # the eye sockets' UV spots, measured by the Blender build (assets-src/out/eye_uv.json), when known
    spots = os.path.join(os.path.dirname(OUT), 'eye_uv.json')
    if os.path.exists(spots):
        for kind, uv in json.load(open(spots)).items():
            lighten_sockets(os.path.join(OUT, f'skin_{kind}.jpg'), uv)
    print('wrote', sorted(os.listdir(OUT)))
