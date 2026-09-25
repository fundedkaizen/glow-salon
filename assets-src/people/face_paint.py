"""
The cartoon face painter (plain Python 3 + Pillow): a port of src/art/salon/people.ts `paintFace`, drawn a little
bigger and bolder for the 3D heads, into the head's face UV frame (body frame below).

    python assets-src/people/face_paint.py            defaults into public/models/people/faces/
    python assets-src/people/face_paint.py preview     also every skin tone into assets-src/out/faces/ (renders)

The frame: people.ts head units around the head centre (R = 15): x from -12 to +12, y from -10.5 (forehead, the
image top) to +13.5 (under the chin). The floor engine can paint the same faces live with people.ts paintFace into a
canvas with that frame (background = the skin's base colour), or tint these defaults.
Expressions: smile, happy, blink, sleepy, wow.
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'public', 'models', 'people', 'faces')
PREVIEW = os.path.join(os.path.dirname(HERE), 'out', 'faces')
SIZE, SS = 256, 4
FRAME = (-12.0, -10.5, 12.0, 13.5)
EXPRESSIONS = ['smile', 'happy', 'blink', 'sleepy', 'wow']

# people.ts SKIN: base, light, shadow, blush, lip
TONES = [
    ((250, 222, 206), (255, 238, 228), (222, 168, 150), (246, 150, 150), (226, 128, 132)),
    ((243, 204, 178), (252, 226, 206), (212, 148, 122), (240, 136, 128), (214, 112, 112)),
    ((230, 180, 144), (244, 206, 174), (192, 128, 96), (228, 122, 104), (196, 98, 94)),
    ((204, 146, 106), (224, 174, 134), (160, 100, 70), (206, 104, 84), (172, 84, 78)),
    ((158, 104, 70), (186, 132, 94), (118, 72, 46), (170, 86, 70), (132, 68, 62)),
    ((112, 72, 48), (140, 96, 68), (80, 48, 32), (134, 66, 56), (102, 54, 50)),
]
INK = (64, 36, 50)


def P(x, y):
    x0, y0, x1, y1 = FRAME
    W = SIZE * SS
    return ((x - x0) / (x1 - x0) * W, (y - y0) / (y1 - y0) * W)


def S(v):
    return v / (FRAME[2] - FRAME[0]) * SIZE * SS


def ell(d, cx, cy, rx, ry, fill):
    (a, b), (c, e) = P(cx - rx, cy - ry), P(cx + rx, cy + ry)
    d.ellipse([a, b, c, e], fill=fill)


def curve(d, pts, fill, w):
    d.line([P(x, y) for x, y in pts], fill=fill, width=max(1, int(S(w))), joint='curve')


def arcpts(cx, cy, rx, ry, a0, a1, n=20):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / n), cy + ry * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def paint(expr='smile', masc=False, tone=1, iris=(122, 84, 60), brow=(96, 60, 74), freckles=False):
    base, light, shadow, blush, lip = TONES[tone]
    W = SIZE * SS
    img = Image.new('RGBA', (W, W), base + (255,))
    # blush discs, soft
    lay = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lay)
    for sx in (-7.6, 9.2):
        ell(ld, sx, 5.6, 3.4, 2.3, blush + (int(255 * (0.55 if not masc else 0.3)),))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(S(1.3))))
    d = ImageDraw.Draw(img)
    if freckles:
        for fx, fy in ((-9, 3.2), (-6.8, 4.3), (-8.2, 5.4), (8.4, 3.2), (10.6, 4.3), (8.0, 5.4)):
            ell(d, fx + 0.8, fy, 0.45, 0.45, shadow + (170,))
    cx, eyeY, ex = 0.8, 1.2, 5.8
    for s in (-1, 1):
        x = cx + s * ex
        if expr in ('smile', 'wow'):
            h = 3.9 if expr == 'wow' else 3.5
            ell(d, x + s * 0.3, eyeY, 2.9, h, (255, 255, 255, 255))
            # the iris: a gradient, dark at the top, with a darker ring and a pupil
            ir = 2.35
            (ax, ay), (bx, by) = P(x - ir, eyeY + 0.3 - h * 0.92), P(x + ir, eyeY + 0.3 + h * 0.92)
            gw, gh = int(bx - ax), int(by - ay)
            grad = Image.new('RGBA', (gw, gh))
            gd = ImageDraw.Draw(grad)
            for yy in range(gh):
                t = yy / max(1, gh - 1)
                k = 0.45 + 0.85 * t
                gd.line([0, yy, gw, yy], fill=tuple(min(255, int(c * k)) for c in iris) + (255,))
            mask = Image.new('L', (gw, gh), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, gw - 1, gh - 1], fill=255)
            img.paste(grad, (int(ax), int(ay)), mask)
            d = ImageDraw.Draw(img)
            ImageDraw.Draw(img).ellipse([ax, ay, bx, by], outline=tuple(int(c * 0.35) for c in iris) + (255,), width=int(S(0.35)))
            ell(d, x, eyeY + 0.5, 1.05, 1.5, (28, 20, 26, 255))
            ell(d, x - 0.8, eyeY - 1.3, 1.05, 1.05, (255, 255, 255, 255))
            ell(d, x + 0.9, eyeY + 1.5, 0.5, 0.5, (255, 255, 255, 220))
            # the upper lid: a thick line, a flick of lashes on feminine faces
            curve(d, arcpts(x, eyeY + 0.7, 3.0, 3.4, math.pi * 1.1, math.pi * 1.9), INK + (255,), 1.0 if masc else 1.35)
            if not masc:
                for l, dy, w in ((1.7, 0.0, 1.25), (1.1, -0.9, 0.9)):
                    x0, y0 = x + s * (2.7 - dy * 0.6), eyeY - 1.6 + dy
                    curve(d, [(x0, y0), (x0 + s * l, y0 - l * 0.85)], INK + (255,), w)
        elif expr == 'happy':
            curve(d, arcpts(x, eyeY + 1.6, 2.7, 2.3, math.pi * 1.15, math.pi * 1.85), INK + (255,), 1.3)
        else:
            curve(d, arcpts(x, eyeY - 1.0, 2.7, 1.8, math.pi * 0.15, math.pi * 0.85), INK + (255,), 1.25)
            if not masc:
                curve(d, [(x + s * 2.4, eyeY), (x + s * 3.3, eyeY + 0.5)], INK + (255,), 0.9)
    # soft arched brows in the hair's colour
    bw = 1.35 if masc else 0.95
    raise_ = 0.9 if expr in ('happy', 'wow') else 0.0
    for s in (-1, 1):
        x, y = cx + s * ex, eyeY - 6.0 - raise_
        pts = [(x - 2.5 + 5.0 * t, y + 0.5 - 1.3 * 4 * t * (1 - t) + (0.25 * (1 - t) if s > 0 else 0.25 * t)) for t in [i / 14 for i in range(15)]]
        curve(d, pts, brow + (235,), bw)
    # the nose: just a soft shading dot and a highlight
    lay = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ell(ImageDraw.Draw(lay), cx + 0.5, 5.4, 0.95, 0.65, shadow + (150,))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(S(0.35))))
    d = ImageDraw.Draw(img)
    ell(d, cx - 0.2, 4.5, 0.45, 0.45, light + (220,))
    # the mouth
    my = 8.6
    if expr in ('smile', 'blink', 'sleepy'):
        # a small closed smile, a pink lower lip tint under it
        ell(d, cx, my + 0.9, 1.9, 0.75, lip + (150,))
        curve(d, [(cx - 2.2 + 4.4 * t, my - 0.1 + 1.4 * 4 * t * (1 - t)) for t in [i / 16 for i in range(17)]], (130, 52, 72, 245), 0.95)
    elif expr == 'happy':
        pts = [(cx - 2.8 + 5.6 * t, my - 0.4 + 3.4 * 4 * t * (1 - t) * 0.6) for t in [i / 16 for i in range(17)]]
        d.polygon([P(*p) for p in pts], fill=(170, 70, 100, 255))
        ell(d, cx, my + 1.3, 1.4, 0.7, (243, 154, 169, 255))
    else:
        ell(d, cx, my + 0.6, 1.4, 1.8, (150, 60, 88, 255))
    return img.resize((SIZE, SIZE), Image.LANCZOS).convert('RGB')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for kind, masc in (('fem', False), ('masc', True)):
        for e in EXPRESSIONS:
            paint(e, masc).save(os.path.join(OUT, f'{kind}_{e}.png'), optimize=True)
    if len(sys.argv) > 1 and sys.argv[1] == 'preview':
        os.makedirs(PREVIEW, exist_ok=True)
        irises = [(84, 124, 170), (122, 84, 60), (96, 140, 96), (70, 50, 40), (120, 110, 170), (84, 124, 170)]
        brows = [(90, 64, 40), (60, 40, 36), (150, 110, 70), (40, 30, 34), (110, 70, 50), (60, 40, 36)]
        for t in range(6):
            for kind, masc in (('fem', False), ('masc', True)):
                paint('smile', masc, t, irises[t], brows[t], freckles=t == 2).save(os.path.join(PREVIEW, f'{kind}_{t}.png'))
    print('faces written')
