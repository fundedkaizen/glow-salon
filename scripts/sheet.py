"""Contact sheets: screenshot a list of close-up URLs with agent-browser and tile them, labelled.

    python scripts/sheet.py OUT.png COLS W H "label|/?view=feet&..." "label|..." ...

Needs the dev (5195) or preview (4195) server running; BASE picks it (default http://127.0.0.1:5195).
Uses the agent-browser session "art1". Each tile is shot at W x H after the page has settled.
"""
import os
import subprocess
import sys
import time

from PIL import Image, ImageDraw, ImageFont

BASE = os.environ.get('BASE', 'http://127.0.0.1:5195')
# No shell: cmd.exe would cut the URLs at '&'.
AB = ['npx.cmd' if os.name == 'nt' else 'npx', 'agent-browser', '--session', os.environ.get('AB_SESSION', 'art1')]


def ab(*args):
    return subprocess.run(AB + list(args), capture_output=True, text=True).stdout


def main():
    out, cols, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    items = [a.split('|', 1) for a in sys.argv[5:]]
    ab('set', 'viewport', str(w), str(h))
    tiles = []
    tmp = out + '.tile.png'
    for label, url in items:
        ab('open', BASE + url)
        time.sleep(float(os.environ.get('SETTLE', '3.2')))
        ab('screenshot', tmp)
        tiles.append((label, Image.open(tmp).convert('RGB').resize((w, h))))
    os.remove(tmp)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w, rows * h), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('arialbd.ttf', 22)
    except OSError:
        font = ImageFont.load_default()
    for i, (label, im) in enumerate(tiles):
        x, y = (i % cols) * w, (i // cols) * h
        sheet.paste(im, (x, y))
        draw.rectangle([x + 6, y + 6, x + 14 + draw.textlength(label, font=font), y + 36], fill=(255, 255, 255))
        draw.text((x + 10, y + 8), label, fill=(90, 58, 82), font=font)
    sheet.save(out)
    print(out, sheet.size)


if __name__ == '__main__':
    main()
