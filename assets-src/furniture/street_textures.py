"""
Textures for the street props (plain Python 3 + Pillow): the A-frame sign's chalkboard face, "Glow Salon / open" and
a flower, in chalk. Writes public/models/street/sign_chalk.png.

    python assets-src/furniture/street_textures.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'public', 'models', 'street')


def font(size, bold=False):
    for name in (('segoeprb.ttf', 'segoepr.ttf') if bold else ('segoepr.ttf', 'segoeprb.ttf')) + ('arialbd.ttf', 'arial.ttf'):
        p = os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts', name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def chalkboard(path, w=256, h=384):
    ss = 3
    W, H = w * ss, h * ss
    img = Image.new('RGB', (W, H), (46, 58, 54))
    d = ImageDraw.Draw(img)
    # a soft chalk haze
    haze = Image.effect_noise((W, H), 12).convert('L').filter(ImageFilter.GaussianBlur(6))
    img = Image.blend(img, Image.merge('RGB', (haze, haze, haze)), 0.08)
    d = ImageDraw.Draw(img)
    chalk = (246, 240, 232)
    pink = (247, 176, 200)
    d.text((W / 2, H * 0.17), 'Glow', font=font(int(H * 0.13), True), fill=pink, anchor='mm')
    d.text((W / 2, H * 0.31), 'Salon', font=font(int(H * 0.12), True), fill=pink, anchor='mm')
    d.line([W * 0.2, H * 0.4, W * 0.8, H * 0.4], fill=chalk, width=ss * 2)
    d.text((W / 2, H * 0.49), 'open', font=font(int(H * 0.1)), fill=chalk, anchor='mm')
    # a flower
    cx, cy, r = W / 2, H * 0.73, W * 0.1
    for i in range(5):
        a = 2 * math.pi * i / 5 - math.pi / 2
        px, py = cx + math.cos(a) * r, cy + math.sin(a) * r
        d.ellipse([px - r * 0.7, py - r * 0.7, px + r * 0.7, py + r * 0.7], outline=pink, width=ss * 3)
    d.ellipse([cx - r * 0.45, cy - r * 0.45, cx + r * 0.45, cy + r * 0.45], fill=(251, 231, 176))
    d.line([cx, cy + r * 1.3, cx, H * 0.93], fill=(169, 224, 180), width=ss * 3)
    d.ellipse([cx, H * 0.84, cx + r, H * 0.88], outline=(169, 224, 180), width=ss * 3)
    img.resize((w, h), Image.LANCZOS).save(path, optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    chalkboard(os.path.join(OUT, 'sign_chalk.png'))
    print('wrote', OUT)
