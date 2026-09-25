"""
The wood floor texture (plain Python 3 + Pillow): public/models/room/wood_floor.jpg, 1024 px, 4 planks across 2 m.

    python assets-src/furniture/floor_texture.py
"""
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'public', 'models', 'room', 'wood_floor.jpg')


def floor_texture(path, size=1024):
    """Warm light wood planks, 4 across 2 m, staggered joins, soft grain; tiles seamlessly."""
    from PIL import Image, ImageDraw, ImageFilter
    rnd = random.Random(3)
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    planks = 4
    pw = size // planks
    base = [(228, 188, 150), (222, 180, 140), (232, 196, 158), (218, 176, 138), (226, 186, 146)]
    for i in range(planks):
        # each plank column: one colour, and a second board from `off` for half the height (wrapping), so the joins
        # stagger and the texture tiles
        c1, c2 = rnd.sample(base, 2)
        d.rectangle([i * pw, 0, (i + 1) * pw - 1, size - 1], fill=c1)
        off = rnd.randrange(size)
        for y0 in (off, off - size):
            d.rectangle([i * pw, y0, (i + 1) * pw - 1, y0 + size // 2 - 1], fill=c2)
    g = Image.effect_noise((size, size), 18).convert('L').filter(ImageFilter.GaussianBlur(1))
    g = g.resize((size // 8, size), Image.BILINEAR).resize((size, size), Image.BILINEAR)
    img = Image.blend(img, Image.merge('RGB', (g, g, g)).point(lambda v: v), 0.06)
    d = ImageDraw.Draw(img)
    for i in range(planks + 1):
        d.line([i * pw, 0, i * pw, size], fill=(176, 132, 98), width=3)
    rnd = random.Random(3)
    for i in range(planks):
        rnd.sample(base, 2)
        off = rnd.randrange(size)
        for y in (off % size, (off + size // 2) % size):
            d.line([i * pw, y, (i + 1) * pw, y], fill=(186, 142, 106), width=3)
    img.save(path, quality=88, optimize=True)



if __name__ == '__main__':
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    floor_texture(OUT)
    print('wrote', OUT)
