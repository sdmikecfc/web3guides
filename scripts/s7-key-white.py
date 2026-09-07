#!/usr/bin/env python
"""
S7 WHITE-KEY CUTTER - turns white-background character renders into keyed
game cutouts, the flood-fill law (reference: the S6 pilot cutters): alpha is
carved by FLOOD FILL FROM THE IMAGE BORDERS, never by global color distance,
so white teeth, bone, pale ghosts and highlights INSIDE the figure survive.

  python scripts/s7-key-white.py            # key everything with defaults
  python scripts/s7-key-white.py --force    # re-key even if outputs exist

Inputs -> outputs (skips missing input dirs):
  public/s7-art/legion/_raw/side/*.png  -> public/s7-art/legion/side/<n>.png   (max 256px tall)
  public/s7-art/legion/_raw/front/*.png -> public/s7-art/legion/front/<n>.png  (max 512px tall)
  public/s7-art/class/_raw/*-v1.png     -> public/s7-art/class/hero/<n>.png    (max 512px tall)

Method per image: flood fill from every border pixel across near-white
(luma >= WHITE_LUMA, low saturation), feather the mask edge 1px, trim the
bounding box with a small margin, resize. Idempotent unless --force.
"""
import os
import pathlib
import sys
from collections import deque

from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public" / "s7-art"
WHITE_LUMA = 234
SAT_MAX = 26
MARGIN = 6

JOBS = [
    (ROOT / "legion" / "_raw" / "side", ROOT / "legion" / "side", 256),
    (ROOT / "legion" / "_raw" / "front", ROOT / "legion" / "front", 512),
    (ROOT / "class" / "_raw", ROOT / "class" / "hero", 512),
    (ROOT / "class" / "_raw" / "stages", ROOT / "class" / "stage", 512),
    (ROOT / "keeps" / "_raw", ROOT / "keeps", 640),
    (ROOT / "front-units" / "_raw", ROOT / "front-units", 256),
]

FORCE = "--force" in sys.argv


def keyable(px):
    r, g, b = px[0], px[1], px[2]
    luma = (r * 299 + g * 587 + b * 114) // 1000
    sat = max(r, g, b) - min(r, g, b)
    return luma >= WHITE_LUMA and sat <= SAT_MAX


def key_image(src: pathlib.Path, dst: pathlib.Path, max_h: int, flip: bool = False) -> str:
    im = Image.open(src).convert("RGB")
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)  # 1 = background
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if keyable(px[x, y]) and not bg[y * w + x]:
                bg[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if keyable(px[x, y]) and not bg[y * w + x]:
                bg[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not bg[i] and keyable(px[nx, ny]):
                    bg[i] = 1
                    q.append((nx, ny))
    # ENCLOSED BACKGROUND POCKETS (2026-08-25, the guild cast): the border
    # flood cannot reach background trapped inside a figure - between legs,
    # inside a cape's crook - because the renderer's soft ground shadow seals
    # the opening with darker pixels. Those pockets shipped as pale blobs on
    # the dark HQ panel.
    # TWO GUARDS keep this from eating real art. A pocket is cleared only if
    # (1) every pixel is PALE AND NEUTRAL (luma >= 205, sat <= 70) - painted
    # material has colour or depth - and (2) it reaches into the LOWER HALF of
    # the frame, where ground shadow and leg gaps live. Guard 2 is what
    # protects big cartoon eye-whites and pale highlights, which sit high in
    # the frame: Big Mike is a frog with two very large white eyes.
    lower_gate = int(h * 0.55)
    pocket_seen = bytearray(w * h)
    for sy in range(h):
        for sx in range(w):
            i0 = sy * w + sx
            if bg[i0] or pocket_seen[i0]:
                continue
            r, g, b = px[sx, sy][0], px[sx, sy][1], px[sx, sy][2]
            if (r * 299 + g * 587 + b * 114) // 1000 < 205 or max(r, g, b) - min(r, g, b) > 70:
                continue
            comp, stack = [], [(sx, sy)]
            pocket_seen[i0] = 1
            bottom = sy
            while stack:
                cx, cy = stack.pop()
                comp.append(cy * w + cx)
                if cy > bottom:
                    bottom = cy
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        ni = ny * w + nx
                        if pocket_seen[ni] or bg[ni]:
                            continue
                        qr, qg, qb = px[nx, ny][0], px[nx, ny][1], px[nx, ny][2]
                        if (qr * 299 + qg * 587 + qb * 114) // 1000 >= 205 and max(qr, qg, qb) - min(qr, qg, qb) <= 70:
                            pocket_seen[ni] = 1
                            stack.append((nx, ny))
            if len(comp) >= 1500 and bottom >= lower_gate:
                for ci in comp:
                    bg[ci] = 1

    mask = Image.frombytes("L", (w, h), bytes(255 - v * 255 for v in bg))
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert("RGBA")
    out.putalpha(mask)
    box = mask.getbbox()
    if box:
        l, t, r, b = box
        out = out.crop((max(0, l - MARGIN), max(0, t - MARGIN), min(w, r + MARGIN), min(h, b + MARGIN)))
    if out.height > max_h:
        nw = round(out.width * max_h / out.height)
        out = out.resize((nw, max_h), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)
    return f"{out.width}x{out.height}"


def main() -> None:
    total = 0
    for src_dir, dst_dir, max_h in JOBS:
        if not src_dir.is_dir():
            continue
        for src in sorted(src_dir.glob("*.png")):
            if src.name.startswith("_"):
                continue
            name = src.stem.replace("-v1", "")
            dst = dst_dir / f"{name}.png"
            if dst.exists() and not FORCE:
                continue
            # THE FACING LAW (scene.ts): all unit art is authored facing EAST;
            # the renderer mirrors by the sim's facing. Legion renders arrive
            # facing west (they march on the guild), so bake the mirror here.
            flip = dst_dir.name == "front-units" and name.startswith("legion-")
            size = key_image(src, dst, max_h, flip)
            total += 1
            print(f"keyed {dst.relative_to(ROOT)} {size}")
    print(f"done: {total} keyed")


if __name__ == "__main__":
    main()
