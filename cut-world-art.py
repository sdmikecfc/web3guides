#!/usr/bin/env python
"""
CUT WORLD-MAP SPRITES — raw render -> transparent 512px PNG.

  python cut-world-art.py site-basecamp site-workshop
  python cut-world-art.py --all

Reads public/s5-art/world/_raw/<name>.png and writes
public/s5-art/world/<name>.png, which is exactly where src/lib/s5/world.ts
resolves `art` to. Idempotent: re-running just re-cuts.

WHY NOT key-s5-games.js: that cutter keys a MAGENTA plate, and the world
renders use a plain white backdrop instead. Magenta is unusable here for the
reason the game-art run documented — at low CFG the plate colour leaks into
the subject without ever filling the background (an olive tank came back acid
yellow). White + rembg is the working path.

WHY NOT key-nano.py: it is hardcoded to public/s5-art/games/<game>/ and its
largest-connected-component filter is actively wrong for these subjects. A
camp is legitimately several detached pieces — the tent, a crate stack, a
separate campfire — and keeping only the biggest blob throws the campfire away.
This keeps every component above a small area threshold instead.

CONTRACT (ADR-0078/0079): sprites are PNG with alpha, longest side 512. The
bg-* ground plates are WebP and are handled separately; a plate saved as PNG
404s silently into the vector fallback, so the extension matters.
"""
import argparse
import pathlib
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "public" / "s5-art" / "world"
RAW = OUT / "_raw"
MAX_DIM = 512
# Drop specks below this share of the frame, keep everything real. Tuned so a
# separate campfire (~0.4% of frame) survives while JPEG-ish noise does not.
MIN_AREA_FRAC = 0.0015


def components(mask: np.ndarray) -> list[np.ndarray]:
    """Label connected regions with a simple iterative flood fill.

    scipy.ndimage.label would be one line, but scipy is not a dependency of
    this repo and this runs a handful of times per season.
    """
    h, w = mask.shape
    seen = np.zeros((h, w), dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        comp = np.zeros((h, w), dtype=bool)
        while stack:
            y, x = stack.pop()
            comp[y, x] = True
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        out.append(comp)
    return out


def cut(name: str) -> bool:
    src = RAW / f"{name}.png"
    if not src.exists():
        print(f"  {name}: no raw at {src}")
        return False

    from rembg import remove

    im = Image.open(src).convert("RGBA")
    cutout = remove(im)
    a = np.array(cutout)[:, :, 3]

    # Downsample the mask before labelling: full-res flood fill on 1024x1024 is
    # slow in pure Python and the component test does not need that precision.
    small = np.array(Image.fromarray(a).resize((256, 256), Image.NEAREST)) > 40
    keep_small = np.zeros_like(small)
    total = small.size
    kept = 0
    for c in components(small):
        if c.sum() / total >= MIN_AREA_FRAC:
            keep_small |= c
            kept += 1
    if not keep_small.any():
        print(f"  {name}: rembg produced nothing")
        return False

    keep = np.array(Image.fromarray(keep_small.astype(np.uint8) * 255).resize(im.size, Image.NEAREST)) > 127
    arr = np.array(cutout)
    arr[:, :, 3] = np.where(keep, arr[:, :, 3], 0)
    cut_im = Image.fromarray(arr)

    bbox = cut_im.getbbox()
    if bbox:
        cut_im = cut_im.crop(bbox)
    w, h = cut_im.size
    scale = MAX_DIM / max(w, h)
    if scale < 1:
        cut_im = cut_im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

    OUT.mkdir(parents=True, exist_ok=True)
    # WebP, not PNG: a map loads its whole cast at once, and the same 18 sprites
    # are 4.96 MB as PNG vs 0.83 MB as WebP with alpha intact. src/lib/world
    # resolves every world asset to .webp to match.
    dst = OUT / f"{name}.webp"
    cut_im.save(dst, "WEBP", quality=88, method=6)
    print(f"  {name}: {cut_im.size[0]}x{cut_im.size[1]}, {kept} part(s), {dst.stat().st_size // 1024} KB")
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    names = (
        [p.stem for p in sorted(RAW.glob("*.png")) if not p.stem.startswith(("_", "bg-"))]
        if args.all
        else args.names
    )
    if not names:
        ap.error("give names, or --all")
    ok = sum(cut(n) for n in names)
    print(f"{ok}/{len(names)} cut")


if __name__ == "__main__":
    main()
