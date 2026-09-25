"""Contact sheets: screenshot a list of close-up URLs with agent-browser and tile them, labelled, and report
how much each tile differs from the first (so a layer that does not show is caught).

    python scripts/sheet.py OUT.png COLS W H "label|/?view=feet&..." "label|..." ...

Needs the dev (5195) or preview (4195) server running; BASE picks it (default http://127.0.0.1:5195).
Uses the agent-browser session "art1". Each tile is shot at W x H after the page has settled (SETTLE seconds);
HIDE_UI=1 hides the HUD first.
"""
import os
import subprocess
import sys
import time

from PIL import Image, ImageDraw, ImageFont

BASE = os.environ.get('BASE', 'http://127.0.0.1:5195')
SESSION = ['--session', os.environ.get('AB_SESSION', 'art1')]


def find_ab():
    # npx.cmd is a batch file, and cmd.exe cuts URLs at '&': run agent-browser's own executable instead.
    if os.name != 'nt':
        return ['npx', 'agent-browser']
    import glob
    exe = glob.glob(os.path.join(os.environ.get('LOCALAPPDATA', ''), 'npm-cache', '_npx', '*', 'node_modules', 'agent-browser', 'bin', 'agent-browser-win32-x64.exe'))
    if not exe:
        sys.exit('agent-browser not found in the npx cache: run "npx agent-browser --help" once')
    return [exe[0]]


AB = find_ab() + SESSION


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
        if os.environ.get('HIDE_UI'):
            ab('eval', "document.getElementById('ui').style.display='none'; 1")
            time.sleep(0.2)
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
    # Each tile must differ from the first (a layer that does not show, or a URL that did not load, would not).
    from PIL import ImageChops, ImageStat
    base = tiles[0][1]
    for label, im in tiles[1:]:
        diff = sum(ImageStat.Stat(ImageChops.difference(base, im)).mean) / 3
        print(f'  {label}: mean diff {diff:.2f}' + ('  <-- SAME AS FIRST' if diff < 0.5 else ''))


if __name__ == '__main__':
    main()
