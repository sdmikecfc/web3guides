#!/usr/bin/env python
"""
CUT THE RIOT PLATES - raw seedream renders -> shipped webp/png (ADR-0124).

  python public/s6-art/games/riot/_raw/cut.py            # everything
  python public/s6-art/games/riot/_raw/cut.py bg-l1-far  # one

THIS FILE IS THE PIPELINE (recover-lost-pipelines law). Only Seedream
ORIGINALS pass through here - CraftPix material never enters _raw (its
license forbids AI processing AND redistribution; it lives in gitignored
art-src/riot and ships only as riot-atlas output).

THREE KINDS OF ASSET, THREE PATHS:
  FAR PLATES (bg-l*-far) - full-frame paintings. Center-cropped to 16:9,
    resized 2048w, webp q80 at FULL CONTRAST: riot dims them in-scene with
    a tint, unlike stopclock there is NO pale blend baked into the file
    (stopclock's arena is near-white; riot's scenes are night streets).
  NEAR PLATES (bg-l*-near) - parallax layers, sky must be TRANSPARENT.
    The gens came back on flat white sky, so the house border FLOOD-FILL
    cutter keys them (threshold 232, fill inward from the top/side edges
    only - enclosed whites like lit windows are NOT punched out, the
    lesson the naive luminance pass teaches). A despeckle pass then drops
    tiny orphan islands the seedream white-noise texture leaves floating
    (bg-l3-near ships them otherwise).
  CARD + BLD - subjects. card = center-crop square 512 webp q90.
    bld-riot = rembg isnet-general-use cutout, alpha<64 -> 0 (the grey
    fringe rule), bbox crop, resized to the front-set's uniform 380px
    width, -> public/s6-art/front/set/bld-riot.png beside its siblings.
"""
import pathlib
import sys
from collections import deque

import numpy as np
from PIL import Image

RAW = pathlib.Path(__file__).parent
OUT = RAW.parent
SET = RAW.parents[2] / "front" / "set"  # public/s6-art/front/set
PLATE_W = 2048
CARD_PX = 512
BLD_W = 380  # every bld-*.png in the set is exactly this wide
ALPHA_FLOOR = 64
FLOOD_T = 232  # house flood-fill cutter threshold
SPECK_PX = 500  # opaque islands smaller than this are seedream noise
ENCLOSED_SKY_PX = 400  # white pockets this big trapped between antennas = sky
ENCLOSED_T = 190  # pockets/stripes are SHADED white (haze) so their bar sits
#                   lower than FLOOD_T; lit windows are warm (min ~150), safe
TOUCH_PX = 12  # pale fragments this big touching cleared sky are sky rims

FAR = ["bg-l1-far", "bg-l2-far", "bg-l3-far"]
NEAR = ["bg-l1-near", "bg-l2-near", "bg-l3-near"]


def crop_16x9(im: Image.Image) -> Image.Image:
    w, h = im.size
    th = w * 9 // 16
    if h >= th:
        y0 = (h - th) // 2
        return im.crop((0, y0, w, y0 + th))
    tw = h * 16 // 9
    x0 = (w - tw) // 2
    return im.crop((x0, 0, x0 + tw, h))


def far_plate(name: str) -> None:
    im = Image.open(RAW / f"{name}.png").convert("RGB")
    im = crop_16x9(im).resize((PLATE_W, PLATE_W * 9 // 16), Image.LANCZOS)
    dst = OUT / f"{name}.webp"
    im.save(dst, "WEBP", quality=80, method=6)
    print(f"  {name}: {im.size[0]}x{im.size[1]} opaque, {dst.stat().st_size // 1024} KB")


def components(mask: np.ndarray):
    """4-connected components of a bool mask -> list of pixel-index lists."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    comps = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            comp = [(sy, sx)]
            while q:
                y, x = q.popleft()
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
                        comp.append((ny, nx))
            comps.append(comp)
    return comps


def flood_sky(arr: np.ndarray) -> np.ndarray:
    """alpha mask: fill white inward from top+side edges, then clear LARGE
    white pockets the fill could not reach (sky trapped between antenna
    lines) - small enclosed whites (lit windows, highlights) survive."""
    h, w = arr.shape[:2]
    light = arr[:, :, :3].min(axis=2) >= FLOOD_T
    sky = np.zeros((h, w), dtype=bool)
    q: deque = deque()
    for x in range(w):
        if light[0, x]:
            q.append((0, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x]:
                q.append((y, x))
    while q:
        y, x = q.popleft()
        if sky[y, x] or not light[y, x]:
            continue
        sky[y, x] = True
        if y > 0 and not sky[y - 1, x]:
            q.append((y - 1, x))
        if y < h - 1 and not sky[y + 1, x]:
            q.append((y + 1, x))
        if x > 0 and not sky[y, x - 1]:
            q.append((y, x - 1))
        if x < w - 1 and not sky[y, x + 1]:
            q.append((y, x + 1))
    # enclosed pockets + their antialiased rims: a pale component becomes sky
    # if it is big, or if it TOUCHES sky (stripes floating in cleared sky,
    # pocket rims around a cleared core) - iterate to absorb layer by layer.
    # Fully-enclosed pale content (lit windows, rack highlights, awning
    # stripes) touches no sky and survives.
    pale = arr[:, :, :3].min(axis=2) >= ENCLOSED_T
    for _ in range(10):
        changed = False
        for comp in components(pale & ~sky):
            big = len(comp) >= ENCLOSED_SKY_PX
            touches = len(comp) >= TOUCH_PX and any(
                sky[max(0, y - 1):y + 2, max(0, x - 1):x + 2].any() for y, x in comp
            )
            if big or touches:
                for y, x in comp:
                    sky[y, x] = True
                changed = True
        if not changed:
            break
    return ~sky


def despeckle(keep: np.ndarray) -> np.ndarray:
    """drop opaque islands under SPECK_PX (floating white-noise dots)."""
    h, w = keep.shape
    seen = np.zeros_like(keep)
    out = np.zeros_like(keep)
    for sy in range(h):
        for sx in range(w):
            if not keep[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            comp = [(sy, sx)]
            while q:
                y, x = q.popleft()
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and keep[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
                        comp.append((ny, nx))
            if len(comp) >= SPECK_PX:
                for y, x in comp:
                    out[y, x] = True
    return out


def near_plate(name: str) -> None:
    im = Image.open(RAW / f"{name}.png").convert("RGBA")
    arr = np.array(im)
    keep = despeckle(flood_sky(arr))
    arr[:, :, 3] = np.where(keep, 255, 0)
    im2 = Image.fromarray(arr)
    im2 = crop_16x9(im2).resize((PLATE_W, PLATE_W * 9 // 16), Image.LANCZOS)
    a = np.array(im2)
    a[:, :, 3][a[:, :, 3] < ALPHA_FLOOR] = 0  # resample fringe off the sky line
    im2 = Image.fromarray(a)
    dst = OUT / f"{name}.webp"
    im2.save(dst, "WEBP", quality=80, method=6)
    cut = 100 * (1 - keep.mean())
    print(f"  {name}: {im2.size[0]}x{im2.size[1]} sky {cut:.0f}% transparent, {dst.stat().st_size // 1024} KB")


def card() -> None:
    im = Image.open(RAW / "card.png").convert("RGB")
    w, h = im.size
    side = min(w, h)
    im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    im = im.resize((CARD_PX, CARD_PX), Image.LANCZOS)
    dst = OUT / "card.webp"
    im.save(dst, "WEBP", quality=90, method=6)
    print(f"  card: {CARD_PX}px square, {dst.stat().st_size // 1024} KB")


def bld() -> None:
    from rembg import new_session, remove

    im = Image.open(RAW / "bld-riot.png").convert("RGBA")
    out = remove(im, session=new_session("isnet-general-use"))
    arr = np.array(out)
    a = arr[:, :, 3]
    a[a < ALPHA_FLOOR] = 0
    arr[:, :, 3] = a
    im2 = Image.fromarray(arr)
    box = im2.getbbox()
    if not box:
        print("  bld-riot: rembg produced nothing")
        return
    im2 = im2.crop(box)
    w, h = im2.size
    im2 = im2.resize((BLD_W, round(h * BLD_W / w)), Image.LANCZOS)
    dst = SET / "bld-riot.png"
    im2.save(dst, "PNG", optimize=True)
    print(f"  bld-riot: {w}x{h} -> {im2.size[0]}x{im2.size[1]}, {dst.stat().st_size // 1024} KB -> {dst}")


def main() -> None:
    names = sys.argv[1:] or FAR + NEAR + ["card", "bld-riot"]
    for n in names:
        if n in FAR:
            far_plate(n)
        elif n in NEAR:
            near_plate(n)
        elif n == "card":
            card()
        elif n == "bld-riot":
            bld()
        else:
            print(f"  {n}: unknown (far {FAR} / near {NEAR} / card / bld-riot)")


if __name__ == "__main__":
    main()
