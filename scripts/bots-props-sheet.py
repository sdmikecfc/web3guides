"""Battle Bots: review contact sheet for the keyed props (and later the parts).

    python scripts/bots-props-sheet.py                # public/bots-art/props -> public/bots-art/_raw/props/_sheet.jpg
    python scripts/bots-props-sheet.py parts          # public/bots-art/parts -> public/bots-art/_raw/parts/_sheet.jpg

Composites every transparent PNG over the money-layer navy (#0d1120) with a
label and its pixel size, so fringe, holes and scale problems are visible in
one image (the contact-sheet.js pattern from the seas art, in Python because
the rest of the art checks here are Python). Run with PYTHONIOENCODING=utf-8.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
which = sys.argv[1] if len(sys.argv) > 1 else "props"
SRC = os.path.join(ROOT, "public", "bots-art", which)
OUT = os.path.join(ROOT, "public", "bots-art", "_raw", which, "_sheet.jpg")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

files = sorted(f for f in os.listdir(SRC) if f.endswith(".png") and not f.endswith(".mask.png"))
if not files:
    print("no keyed PNGs in", SRC)
    sys.exit(1)

TILE = 300
PAD = 16
COLS = 6
rows = (len(files) + COLS - 1) // COLS
W = COLS * (TILE + PAD) + PAD
H = rows * (TILE + PAD + 28) + PAD
sheet = Image.new("RGB", (W, H), (13, 17, 32))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 13)
except OSError:
    font = ImageFont.load_default()

for i, f in enumerate(files):
    im = Image.open(os.path.join(SRC, f)).convert("RGBA")
    w, h = im.size
    s = min(TILE / w, TILE / h, 1.0)
    thumb = im.resize((max(1, int(w * s)), max(1, int(h * s))))
    col, row = i % COLS, i // COLS
    x = PAD + col * (TILE + PAD)
    y = PAD + row * (TILE + PAD + 28)
    tile = Image.new("RGBA", (TILE, TILE), (13, 17, 32, 255))
    tile.alpha_composite(thumb, ((TILE - thumb.width) // 2, (TILE - thumb.height) // 2))
    sheet.paste(tile.convert("RGB"), (x, y))
    d.rectangle([x - 1, y - 1, x + TILE, y + TILE], outline=(28, 34, 54))
    d.text((x, y + TILE + 6), "%s  %dx%d" % (f[:-4], w, h), fill=(228, 232, 245), font=font)

sheet.save(OUT, quality=88)
print("sheet", OUT, sheet.size, len(files), "tiles")
