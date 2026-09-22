#!/usr/bin/env python
"""
CUT THE STOPCLOCK SPRITES - raw seedream render -> in-arena WEBP.

  python public/s6-art/games/stopclock/_raw/cut.py            # everything
  python public/s6-art/games/stopclock/_raw/cut.py rusher     # one

THIS FILE IS THE PIPELINE (the recover-lost-pipelines lesson: a generated
asset with no committed generator is a one-way door). Re-running it against
the same raws reproduces the shipped sprites byte-for-byte modulo the encoder.

TWO KINDS OF ASSET, TWO PATHS:
  SPRITES (pistol/rusher/rocketeer/player) - a subject on a white studio
    plate. rembg cuts it, alpha below 64 is forced to 0 (a soft matte edge
    over a NEAR-WHITE arena reads as grey fringe, which is exactly the
    contrast this game cannot spend), then crop to the bbox and PAD BACK TO A
    SQUARE so the sprite's anchor 0.5 sits on the subject's centre - the page
    rotates these to face the player and an off-centre pivot makes a machine
    orbit its own feet. isnet-general-use for ALL FOUR. The project recipe
    reaches for u2net_human_seg on people and the player IS a person, so that
    is what ran first - and it came back with the two ARMS and nothing else,
    having thrown the helmet and both shoulders away. A straight-down camera
    shows a helmet, not a face, and the human model is looking for the second
    one. HUMAN is kept below, empty, as the record of that: to a segmenter
    this camera has no people in it.
  PLATES (floor/cover) - full-frame dressing, never cut. Centre-cropped
    square, resized, and BLENDED TOWARD THE ARENA'S OWN PALE so the SUPERHOT
    void survives: a 2026-08-14 attempt at a real painted backdrop had to be
    reverted for greying exactly this. The page then draws the floor at alpha
    0.3 on top of that, so the plate is a suggestion of a floor, not a floor.
"""
import pathlib
import sys

import numpy as np
from PIL import Image

RAW = pathlib.Path(__file__).parent
OUT = RAW.parent
SPRITE_PX = 384
PLATE_PX = 512
ALPHA_FLOOR = 64
# the arena's own two greys (Client.tsx C.void / C.barrier)
VOID = (0xEC, 0xEA, 0xE4)
BARRIER = (0xC9, 0xC5, 0xBA)
# how far each plate is pulled toward that flat colour (0 = raw, 1 = flat)
PLATES = {"floor": (VOID, 0.62), "cover": (BARRIER, 0.55)}
HUMAN: set[str] = set()  # see the docstring: the player is not one of these
SPRITES = ["pistol", "rusher", "rocketeer", "player"]


def cut_sprite(name: str) -> None:
    from rembg import new_session, remove

    src = RAW / f"{name}.png"
    im = Image.open(src).convert("RGBA")
    session = new_session("u2net_human_seg" if name in HUMAN else "isnet-general-use")
    out = remove(im, session=session)

    arr = np.array(out)
    a = arr[:, :, 3]
    a[a < ALPHA_FLOOR] = 0  # kill the grey fringe before it reaches the void
    arr[:, :, 3] = a
    im2 = Image.fromarray(arr)

    box = im2.getbbox()
    if not box:
        print(f"  {name}: rembg produced nothing")
        return
    im2 = im2.crop(box)
    w, h = im2.size
    side = max(w, h)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(im2, ((side - w) // 2, (side - h) // 2))
    square = square.resize((SPRITE_PX, SPRITE_PX), Image.LANCZOS)

    dst = OUT / f"{name}.webp"
    square.save(dst, "WEBP", quality=90, method=6)
    print(f"  {name}: {w}x{h} -> {SPRITE_PX}px square, {dst.stat().st_size // 1024} KB")


def flatten_plate(name: str) -> None:
    target, mix = PLATES[name]
    im = Image.open(RAW / f"{name}.png").convert("RGB")
    w, h = im.size
    side = min(w, h)
    im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    im = im.resize((PLATE_PX, PLATE_PX), Image.LANCZOS)
    arr = np.array(im).astype(np.float32)
    flat = np.array(target, dtype=np.float32)
    arr = arr * (1 - mix) + flat * mix
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    dst = OUT / f"{name}.webp"
    im.save(dst, "WEBP", quality=88, method=6)
    lo, hi = np.array(im).min(), np.array(im).max()
    print(f"  {name}: plate {PLATE_PX}px, range {lo}-{hi}, {dst.stat().st_size // 1024} KB")


def main() -> None:
    names = sys.argv[1:] or SPRITES + list(PLATES)
    for n in names:
        if n in PLATES:
            flatten_plate(n)
        else:
            cut_sprite(n)


if __name__ == "__main__":
    main()
