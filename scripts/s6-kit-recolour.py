# -*- coding: utf-8 -*-
"""s6-kit-recolour: turns CraftPix kit creatures into MACHINES, and publishes
kit tiles to public. Mike, 2026-08-15, on the roguelike kit's goblins vs the
all-machines season fiction: "Recolor creatures to machines."

THE LICENSE LINE THIS SCRIPT WALKS: CraftPix allows modification and forbids
AI processing. Everything here is deterministic numpy/PIL - HSV band remaps
(the recovered s5-camo/s6-mech-recolour method) - no model ever sees a pixel.
Inputs and intermediates stay in gitignored art-src/kits/; the ONLY outputs
that cross into public/ are the tile webps (chars cross via s6-kit-atlas.mjs,
run AFTER this so the atlases pack the recolored strips).

  python scripts/s6-kit-recolour.py            remap strips in place + publish tiles
  python scripts/s6-kit-recolour.py --dry      report matched pixels, write nothing
  python scripts/s6-kit-recolour.py --only strain/prey1     one char

Strips:  art-src/kits/strips/<game>/<char>/<anim>.png   (remapped IN PLACE;
         the pristine cut is one s6-kit-ingest.mjs re-run away, so in-place
         is safe - ingest is the generator, strips are derived)
Tiles:   art-src/kits/tiles/<game>/<name>.png
      -> public/s6-art/games/<game>/tiles/<name>.webp   (q90, RGBA)

RECIPES are authored per char/tile below once the real zips are open - band
edges are measured off the actual sprites (paste a frame into the --measure
helper), never guessed. The two house palettes:
  machine  greens + skin -> gunmetal steel, warm accents -> season amber,
           leaving darks alone (outlines survive)
  hostile  everything saturated -> the stopclock red the void reads by
"""
import argparse
import glob
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
STRIPS = os.path.join(ROOT, "art-src", "kits", "strips")
TILES = os.path.join(ROOT, "art-src", "kits", "tiles")
PUB = os.path.join(ROOT, "public", "s6-art", "games")

# ── the two palettes, as band-remap rule lists ──────────────────────────────
# rule = (hue_lo, hue_hi, target_hue|None, sat_mul, val_mul)  hues 0..1
# target None = desaturate toward gunmetal (hue kept, sat crushed)
MACHINE = [
    (0.16, 0.45, None, 0.12, 0.92),    # goblin greens -> gunmetal
    (0.02, 0.11, 0.093, 0.85, 1.00),   # skin/leather warms -> season amber
    (0.90, 1.00, 0.55, 0.70, 0.95),    # reds -> cyan LED accents
    (0.00, 0.02, 0.55, 0.70, 0.95),    # (red band wraps 0)
]
HOSTILE = [
    (0.00, 1.00, 0.995, 1.15, 0.96),   # everything -> stopclock red
]
PALETTES = {"machine": MACHINE, "hostile": HOSTILE}

# ── RECIPES: authored per char once the zip is OPEN and measured ────────────
# key "<game>/<char>" -> palette name; absent = strip passes through untouched
CHAR_RECIPES = {
    # roguelike-kit creatures -> machines (rat greys pass the sat gate
    # untouched and read as steel already; goblin greens hit the first band)
    "strain/prey1": "machine",
    "strain/prey2": "machine",
    "strain/prey3": "machine",
    "strain/hunter": "machine",
    # shootemup-kit creatures -> the red the stopclock void reads by
    "stopclock/rusher": "hostile",
    "stopclock/pistol": "hostile",
    "stopclock/rocketeer": "hostile",
}
# key "<game>/<tilefile>" (no ext) -> palette name or None (publish as-is)
TILE_RECIPES = {
    # the kit's grey-blue stone already sits inside strain's navy/cyan world;
    # the floor TilingSprite draws at alpha 0.55, which darkens it in place
    "strain/floor": None,
    "strain/wall": None,
}

SAT_FLOOR = 0.08  # below this a pixel is grey/outline: never remapped
SMOOTH = 0.02     # band edge feather in hue units


def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / max(1e-6, hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def remap_rgba(img, rules):
    rgba = np.asarray(img.convert("RGBA")).copy()
    alpha = rgba[..., 3]
    hsv = np.asarray(Image.fromarray(rgba[..., :3], "RGB").convert("HSV")).astype(np.float32) / 255.0
    h, s, v = hsv[..., 0].copy(), hsv[..., 1].copy(), hsv[..., 2].copy()
    sat_ok = smoothstep(SAT_FLOOR, SAT_FLOOR + 0.08, s)  # outlines/greys pass through
    touched = np.zeros_like(h)
    for lo, hi, target, sat_mul, val_mul in rules:
        band = smoothstep(lo - SMOOTH, lo, h) * (1.0 - smoothstep(hi, hi + SMOOTH, h))
        w = band * sat_ok * (1.0 - touched)  # first matching rule wins per pixel
        if target is not None:
            h = h * (1.0 - w) + target * w
        s = s * (1.0 - w) + (s * sat_mul) * w
        v = v * (1.0 - w) + np.clip(v * val_mul, 0.0, 1.0) * w
        touched = np.clip(touched + w, 0.0, 1.0)
    out = np.stack([h, np.clip(s, 0, 1), np.clip(v, 0, 1)], axis=-1)
    rgb = Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), "HSV").convert("RGB")
    res = np.dstack([np.asarray(rgb), alpha])
    return Image.fromarray(res, "RGBA"), float(touched[alpha > 0].mean()) if (alpha > 0).any() else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--only")
    args = ap.parse_args()

    did = 0
    for key, pal in CHAR_RECIPES.items():
        if args.only and key != args.only:
            continue
        game, char = key.split("/")
        cdir = os.path.join(STRIPS, game, char)
        if not os.path.isdir(cdir):
            print(f"  !! {key}: no strips (run s6-kit-ingest first)")
            continue
        for p in sorted(glob.glob(os.path.join(cdir, "*.png"))):
            img = Image.open(p)
            out, frac = remap_rgba(img, PALETTES[pal])
            print(f"  {key}/{os.path.basename(p)}: {pal}, {frac * 100:.0f}% of pixels touched")
            if not args.dry:
                out.save(p)
        did += 1

    for key, pal in TILE_RECIPES.items():
        if args.only and key != args.only:
            continue
        game, name = key.split("/")
        src = os.path.join(TILES, game, f"{name}.png")
        if not os.path.exists(src):
            print(f"  !! tile {key}: missing (run s6-kit-ingest first)")
            continue
        img = Image.open(src).convert("RGBA")
        if pal:
            img, frac = remap_rgba(img, PALETTES[pal])
            print(f"  tile {key}: {pal}, {frac * 100:.0f}% touched")
        else:
            print(f"  tile {key}: published as-is")
        if not args.dry:
            dest_dir = os.path.join(PUB, game, "tiles")
            os.makedirs(dest_dir, exist_ok=True)
            img.save(os.path.join(dest_dir, f"{name}.webp"), "WEBP", quality=90)
        did += 1

    if not did:
        print("no recipes authored yet - open the zips, measure the bands, add CHAR_RECIPES/TILE_RECIPES rows")
    else:
        print("done" + (" (dry)" if args.dry else ""))


if __name__ == "__main__":
    main()
