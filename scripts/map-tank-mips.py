"""Pre-resample the map tanks so they stop turning to mush at map scale.

THE PROBLEM, measured rather than guessed. public/s5-art/map/tanks/*.png are
~360px wide painted renders. The world map draws them at `--w: 0.030` -- three
percent of the map's width -- which lands around 25 to 60 CSS pixels depending on
the container. That is a 6x to 15x downscale performed by the browser with a
cheap box filter and no mipmap chain, so every panel line and track link aliases
into grey porridge. It is the same defect that made Armor Clash's 512px sprites
unreadable at 28px, and it has the same cause: art delivered at many times the
size it is displayed at.

THE FIX: do the downscale OFFLINE with a real filter. Pillow's LANCZOS keeps the
silhouette and the highlights that a browser's cheap path throws away.

SIZE CHOICE. 160px, not 60px. The map ZOOMS, so the tank is sometimes drawn much
larger than its default size -- resampling all the way down to the default would
look crisp at rest and terrible the moment anyone zoomed in. 160 is roughly 2.7x
the default draw size: a mild, good-looking downscale at rest, and still enough
pixels to survive a couple of zoom steps.

Masters are preserved. Originals move to _full/ rather than being overwritten,
because a resample is lossy and a transform that destroys its own input is one
bad run away from losing art (learned the hard way earlier this season).

    python scripts/map-tank-mips.py
"""
import os
import shutil
import sys

try:
    from PIL import Image
except ImportError:
    print("Pillow is required:  python -m pip install Pillow")
    sys.exit(1)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "public", "s5-art", "map", "tanks")
FULL = os.path.join(SRC, "_full")
TARGET_W = 160

os.makedirs(FULL, exist_ok=True)

done = skipped = 0
for name in sorted(os.listdir(SRC)):
    if not name.lower().endswith(".png"):
        continue
    path = os.path.join(SRC, name)
    if os.path.isdir(path):
        continue

    master = os.path.join(FULL, name)
    # Keep the master exactly once. A re-run must resample from the ORIGINAL,
    # never from an already-resampled file -- resampling a resample compounds
    # the softness every time.
    if not os.path.exists(master):
        shutil.copy2(path, master)

    im = Image.open(master).convert("RGBA")
    if im.width <= TARGET_W:
        print(f"  skip {name}: already {im.width}px")
        skipped += 1
        continue

    h = round(im.height * (TARGET_W / im.width))
    out = im.resize((TARGET_W, h), Image.LANCZOS)
    out.save(path, "PNG", optimize=True)
    print(f"  ok   {name}: {im.width}x{im.height} -> {TARGET_W}x{h}")
    done += 1

print(f"\n{done} resampled, {skipped} already small. Masters in {os.path.relpath(FULL, ROOT)}/")
print("Re-runs resample from the masters, so this is safe to run again.")
