"""RIOT wall buildings - cut the three Seedream lineup plates into 15 pieces.

Mike 2026-08-16: "render 5 building varieties for each level and use them as
the backdrop instead of these assets blown up in resolution." Each lineup is
five distinct buildings on one shared ground line, isolated on a flat
off-white plate, generated in the locked HD-pixel register.

THE CUT (the flood-fill law, key_ironjaw_opponents lineage): background is
removed by BORDER FLOOD FILL at threshold, never by global threshold - the
neon arcade sign and lit windows contain near-white pixels that a global
threshold would punch holes in. The five pieces are split by transparent
column runs - scanned ABOVE the floor band, because the facility lineup's
five segments share one continuous floor rail (no fully-empty column exists
at the bottom), and the cut then runs straight down through the rail at each
gap's center.

SCALE LAW: relative heights within a lineup are preserved - every piece of
a level ships scaled by the SAME factor (lineup tallest -> SHIP_TALLEST px),
so the tenement stays taller than the arcade exactly as generated, and the
Client draws all pieces of a level at one uniform scale.

Output: ../bld-l{1,2,3}-{a..e}.webp  (linear-filter assets; the Client must
NOT set nearest on these - they are painted, not pixel-cell art).
Verify: python cut_bldrows.py   (re-runs are deterministic; sizes printed)
"""

import sys
from pathlib import Path

from PIL import Image, ImageFilter

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
OUT = HERE.parent
# The plate tone is SAMPLED from the corners, not assumed: L1 came back warm
# cream (~243,230,209 with dips to 201) and every fixed floor either missed
# the plate or ate lit set dressing. Background = within +-TOL of the mean
# corner color, reached by border flood.
TOL = 20
SHIP_TALLEST = 410  # px: lineup tallest ships at this; Client draws at 0.5
FLOOR_SKIP = 0.14  # ignore the bottom 14% of the CONTENT when scanning gaps
# (a faint baseline stroke runs between the buildings on every plate, and the
# facility lineup shares a literal floor rail - both live in that band)
SPECK = 3  # px: opening kernel. See content_box - the L1 plate's stray sky
# pixels are 1-2px, every real chimney/fire-escape on a 3120px plate is 10px+.


def flood_alpha(im: Image.Image) -> Image.Image:
    """Border flood fill: background -> alpha 0; enclosed pockets survive."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    ref = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def bg(p):
        return abs(p[0] - ref[0]) <= TOL and abs(p[1] - ref[1]) <= TOL and abs(p[2] - ref[2]) <= TOL

    seen = bytearray(w * h)
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if bg(px[x, y]):
                stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bg(px[x, y]):
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        p = px[x, y]
        if not bg(p):
            continue
        seen[y * w + x] = 1
        px[x, y] = (p[0], p[1], p[2], 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def solid_mask(im: Image.Image) -> Image.Image:
    """Alpha, morphologically OPENED: 1-2px specks erased, buildings intact.

    THE FLOATING BUG (Mike 2026-08-16: "the buildings are floating and not
    big enough"). The L1 lineup plate carries a sparse dusting of stray
    non-plate pixels out in the empty sky - 1 to 7 per row, invisible, but
    NOT within TOL of the corner tone, so the border flood cannot reach or
    clear them. `Image.getbbox()` counts any alpha>0, so it returned rows
    2..1314 of a 1328-row plate when the real art lived in 230..1072: every
    shipped piece carried ~230 transparent rows UNDER its base and ~200 over
    its roof. The Client sets each sprite's BOTTOM on the floor line, so
    that dead band became a 28px gap between the art and the ground, and the
    ~26% of every piece that was padding is height the buildings never got
    (bld-l1-d rendered 56px tall - hero height). Opening at 3x3 removes any
    run thinner than the kernel; on a 3120px-wide plate every real chimney,
    lamp arm and fire escape is 10px+ and survives untouched.
    """
    a = im.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    return a.filter(ImageFilter.MinFilter(SPECK)).filter(ImageFilter.MaxFilter(SPECK))


def content_box(im: Image.Image) -> tuple[int, int, int, int] | None:
    """Bbox of REAL art - never of the plate's speckle. Use INSTEAD of
    getbbox() everywhere a piece is cropped."""
    return solid_mask(im).getbbox()


def split_columns(im: Image.Image) -> list[tuple[int, int]]:
    """Piece x-ranges, split on transparent column runs ABOVE the floor band."""
    w, h = im.size
    a = solid_mask(im).load()
    box = content_box(im)
    top, bot = (box[1], box[3]) if box else (0, h)
    ys = range(top, bot - int((bot - top) * FLOOR_SKIP))
    occupied = [any(a[x, y] > 8 for y in ys) for x in range(w)]
    ranges = []
    x = 0
    while x < w:
        if not occupied[x]:
            x += 1
            continue
        x0 = x
        while x < w and occupied[x]:
            x += 1
        ranges.append([x0, x])
    # stray plate marks narrower than 40px are noise, not pieces - drop them
    # outright (one 6px mark at L1's left edge stole a piece slot and forced
    # two real buildings to fuse)
    ranges = [r for r in ranges if r[1] - r[0] >= 40]
    # The real gaps measured 8-25px (the buildings almost touch), so no fixed
    # width threshold survives: keep merging across the SMALLEST gap until
    # exactly five pieces remain - slivers (lamp arms, sign overhangs) sit
    # beside tiny gaps and reabsorb first by construction.
    while len(ranges) > 5:
        gi = min(range(len(ranges) - 1), key=lambda i: ranges[i + 1][0] - ranges[i][1])
        ranges[gi][1] = ranges[gi + 1][1]
        del ranges[gi + 1]
    return [(int(r[0]), int(r[1])) for r in ranges]


total = 0
for n in (1, 2, 3):
    src = HERE / f"bldrow-l{n}.png"
    im = flood_alpha(Image.open(src))
    pieces = split_columns(im)
    if len(pieces) != 5:
        print(f"  !! l{n}: {len(pieces)} pieces (want 5) - ranges {pieces}")
        raise SystemExit(1)
    # crop full-height per range, then bbox each piece
    crops = []
    for x0, x1 in pieces:
        c = im.crop((max(0, x0 - 2), 0, min(im.width, x1 + 2), im.height))
        box = content_box(c)
        if box is None:
            print(f"  !! l{n}: empty piece at x{x0}-{x1}")
            raise SystemExit(1)
        crops.append(c.crop(box))
    tallest = max(c.height for c in crops)
    sc = SHIP_TALLEST / tallest
    for c, tag in zip(crops, "abcde"):
        c = c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.LANCZOS)
        out = OUT / f"bld-l{n}-{tag}.webp"
        c.save(out, "WEBP", quality=85, method=6)
        # GATE (verify mode is the default, recover-lost-pipelines law): a
        # piece with transparent rows at its foot floats by construction once
        # the Client puts its bottom on the floor line - that was the bug.
        # Measure the bottom BAND, not the last row: every lineup's true base
        # carries 1-4 rows of antialiased edge (l1-a's last row is 12% and its
        # next-but-one is 100%), while the bug left ~60 rows at flat zero.
        # Re-read the shipped webp - the encoder is part of the pipeline.
        shipped = Image.open(out).convert("RGBA")
        a = shipped.getchannel("A")
        cover = max(
            sum(1 for v in a.crop((0, shipped.height - 1 - k, shipped.width, shipped.height - k)).getdata() if v > 128)
            / shipped.width
            for k in range(3)
        )
        if cover < 0.60:
            print(f"  !! bld-l{n}-{tag}: foot band only {cover:.0%} opaque - it would float")
            raise SystemExit(1)
        kb = out.stat().st_size // 1024
        total += kb
        print(f"  ok bld-l{n}-{tag}.webp {c.width}x{c.height} base{cover:.0%} {kb}KB")
print(f"total {total}KB")
