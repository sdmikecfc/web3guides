#!/usr/bin/env python
"""
WORLD MAP CONTACT SHEET — composite every sprite onto the ground plate at its
real on-map position and scale, exactly as the engine does.

  python map-preview.py            -> scratch/map-preview.png

This is the ONLY view in which "these do not belong together" is obvious
before deploying. Tiling cutouts on a neutral background hides the problem;
seeing them at true relative size on the actual ground does not. Run it after
every art batch.

It reads positions straight out of src/lib/s5/world.ts, so the preview can
never drift from what the map actually renders. Placement mirrors
WorldSprite's CSS: width = size * worldWidth, anchored BOTTOM-CENTRE on the
ground-contact point.
"""
import pathlib
import re
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).parent
ART = ROOT / "public" / "s5-art" / "world"
SRC = (ROOT / "src" / "lib" / "s5" / "world.ts").read_text(encoding="utf-8")
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "map-preview.png"


def num(pat: str, default: float) -> float:
    m = re.search(pat, SRC)
    return float(m.group(1)) if m else default


target_size = num(r"targetSize:\s*([0-9.]+)", 0.094)

# Sites: key / pos / size / art, in declaration order.
sites = []
for m in re.finditer(
    # `[^"]*?` between the fields, not `\s*`: the descriptor carries trailing
    # `//` comments on some size lines (the basecamp explains why it is the
    # biggest thing on the board) and a whitespace-only gap silently drops it.
    r'key:\s*"([a-z]+)",.*?pos:\s*\{\s*x:\s*([0-9.]+),\s*y:\s*([0-9.]+)\s*\},[^"]*?size:\s*([0-9.]+),[^"]*?art:\s*"([a-z0-9-]+)"',
    SRC,
    re.S,
):
    sites.append((m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(4)), m.group(5)))

# Target slots, in listing order.
slots_block = re.search(r"targetSlots:\s*\[(.*?)\]", SRC, re.S)
slots = [
    (float(a), float(b))
    for a, b in re.findall(r"x:\s*([0-9.]+),\s*y:\s*([0-9.]+)", slots_block.group(1) if slots_block else "")
]
# Every archetype's intact name, in declaration order. Targets cycle through
# them by listing index, exactly as targetArtFor() does at runtime.
archetypes = re.findall(r"intact:\s*\"([a-z0-9-]+)\"", SRC) or ["fort-intact"]

plate_path = ART / "bg-land.webp"
if not plate_path.exists():
    sys.exit(f"no ground plate at {plate_path}")
plate = Image.open(plate_path).convert("RGB")
W, H = plate.size


def place(name: str, x: float, y: float, size: float) -> str:
    p = ART / f"{name}.webp"
    if not p.exists():
        return f"  MISSING {name}"
    sp = Image.open(p).convert("RGBA")
    w = max(1, round(size * W))
    h = max(1, round(w * sp.height / sp.width))
    sp = sp.resize((w, h), Image.LANCZOS)
    plate.paste(sp, (round(x * W - w / 2), round(y * H - h)), sp)
    return f"  {name:22s} {w:4d}px wide"


log = []
# Strongholds first so the player's own ground sits in front of the front line.
for i, (x, y) in enumerate(slots):
    log.append(place(archetypes[i % len(archetypes)], x, y, target_size))
for key, x, y, size, art in sites:
    log.append(place(art, x, y, size))

plate.save(OUT)
print("\n".join(dict.fromkeys(log)))
print(f"{len(slots)} strongholds + {len(sites)} sites -> {OUT}")
