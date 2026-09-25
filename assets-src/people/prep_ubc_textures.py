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

from PIL import Image, ImageOps, ImageStat

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
    out.save(dst, quality=88, optimize=True)
    return (mr, mg, mb)


def hair(src, dst, size=512):
    im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
    g = ImageOps.grayscale(im)
    st = ImageStat.Stat(g)
    mean = st.mean[0]
    g = g.point(lambda v: max(0, min(255, int(v / mean * 0.82 * 255))))
    Image.merge('RGB', (g, g, g)).save(dst, quality=88, optimize=True)


def eye(src, dst):
    im = Image.open(src).convert('RGBA')
    px = im.load()
    w, h = im.size
    cx, cy = w / 2, h / 2
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d < w * 0.12:
                v = int(0.3 * r + 0.59 * g + 0.11 * b)
                v = min(255, int(v * 2.3 + 20))
                px[x, y] = (v, v, v, a)
            else:
                # the pink surround reads as a blush on the lids; make it a neutral soft white
                if r > g + 20:
                    px[x, y] = (238, 232, 230, a)
    im.convert('RGB').save(dst, quality=92, optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    print('fem skin median', skin(os.path.join(V, 'tex', 'T_Superhero_Female_Light_BaseColor.png'), os.path.join(OUT, 'skin_fem.jpg')))
    print('masc skin median', skin(os.path.join(V, 'tex', 'T_Superhero_Male_Ligh.png'), os.path.join(OUT, 'skin_masc.jpg')))
    hair(os.path.join(V, 'hair', 'T_Hair_2_BaseColor.png'), os.path.join(OUT, 'hair.jpg'))
    hair(os.path.join(V, 'hair', 'T_Hair_1_BaseColor.png'), os.path.join(OUT, 'hair1.jpg'))
    Image.open(os.path.join(V, 'hair', 'T_Hair_2_Normal.png')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'hair_n.jpg'), quality=90)
    Image.open(os.path.join(V, 'hair', 'T_Hair_1_Normal.png')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'hair1_n.jpg'), quality=90)
    eye(os.path.join(V, 'body', 'T_Eye_Brown.png'), os.path.join(OUT, 'eye.jpg'))
    print('wrote', sorted(os.listdir(OUT)))
