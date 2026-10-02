#!/usr/bin/env python
"""
MAP ROADS — trace the painted roads into tank routes automatically.

  python map-roads.py --debug     # trace, draw map-roads.png, print the lines
  python map-roads.py --write     # ...and replace the ROADS block in map-layout.txt

WHY THIS WORKS NOW WHEN IT DID NOT BEFORE
Two earlier attempts failed and both failures were informative:

  1. DETECT ROADS BY COLOUR. Impossible. A sandy road and a sandy plaza are
     the same paint - measured at h 0.10-0.13 for both. Colour cannot see the
     difference and never will.
  2. SMOOTH GROUND MINUS PLATFORMS. Gave 836 fragments, largest holding 13% of
     the network, because it subtracted anchor ELLIPSES - which do not cover
     the platforms they sit in, so ragged platform edges survived as debris.

The thing that separates a road from a plaza is WIDTH, and morphology is the
tool that sees width:

    smooth = bright, flat ground        (platforms AND roads - same material)
    opened = smooth eroded then dilated (platforms only - roads are too narrow
                                         to survive the erosion)
    roads  = smooth minus opened        (what only the roads could be)

That is an opening, and unlike ellipse subtraction it removes each platform in
exactly its own shape, leaving no rim behind. The result is then thinned to a
one-pixel skeleton and walked into polylines.

The routes are NEVER DRAWN. The roads are already painted into the plate;
these exist so rolling units have a centreline to follow, and because they are
derived FROM the painting they cannot disagree with it.
"""
import argparse
import importlib.util
import math
import pathlib
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).parent
PLATE = ROOT / "public" / "s5-art" / "world" / "bg-land.webp"
LAYOUT = ROOT / "map-layout.txt"
DEBUG_PNG = ROOT / "map-roads.png"

# Half-width, in grid cells, of the widest thing that still counts as a road.
# Anything that survives being eroded this much is a platform.
OPEN_R = 3
# Skeleton fragments shorter than this are speckle, not a route.
MIN_LEN = 14
# A traced route is resampled to about this spacing so the emitted line has a
# handful of readable points rather than one per pixel.
STEP = 7


def load_masks():
    spec = importlib.util.spec_from_file_location("ma", ROOT / "map-anchors.py")
    ma = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ma)
    ma.TEX_MAX = 12.0
    return ma, ma.open_mask(Image.open(PLATE), 0.34), ma.GW, ma.GH


def erode(m, GW, GH, r):
    for _ in range(r):
        n = [[False] * GW for _ in range(GH)]
        for y in range(1, GH - 1):
            for x in range(1, GW - 1):
                if m[y][x] and m[y - 1][x] and m[y + 1][x] and m[y][x - 1] and m[y][x + 1]:
                    n[y][x] = True
        m = n
    return m


def dilate(m, GW, GH, r):
    for _ in range(r):
        n = [row[:] for row in m]
        for y in range(1, GH - 1):
            for x in range(1, GW - 1):
                if m[y][x]:
                    n[y - 1][x] = n[y + 1][x] = n[y][x - 1] = n[y][x + 1] = True
        m = n
    return m


def thin(m, GW, GH):
    """Zhang-Suen thinning: reduce the road blob to a one-cell centreline."""
    img = [row[:] for row in m]
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            drop = []
            for y in range(1, GH - 1):
                for x in range(1, GW - 1):
                    if not img[y][x]:
                        continue
                    p = [img[y - 1][x], img[y - 1][x + 1], img[y][x + 1], img[y + 1][x + 1],
                         img[y + 1][x], img[y + 1][x - 1], img[y][x - 1], img[y - 1][x - 1]]
                    b = sum(p)
                    if b < 2 or b > 6:
                        continue
                    a = sum(1 for i in range(8) if not p[i] and p[(i + 1) % 8])
                    if a != 1:
                        continue
                    if step == 0:
                        if (p[0] and p[2] and p[4]) or (p[2] and p[4] and p[6]):
                            continue
                    else:
                        if (p[0] and p[2] and p[6]) or (p[0] and p[4] and p[6]):
                            continue
                    drop.append((x, y))
            for x, y in drop:
                img[y][x] = False
            changed = changed or bool(drop)
    return img


def trace(sk, GW, GH):
    """Walk the skeleton into polylines, cutting at junctions and endpoints."""
    def nbrs(x, y):
        return [(x + dx, y + dy)
                for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                if (dx or dy) and 0 <= x + dx < GW and 0 <= y + dy < GH and sk[y + dy][x + dx]]

    deg = {(x, y): len(nbrs(x, y))
           for y in range(GH) for x in range(GW) if sk[y][x]}
    nodes = [p for p, d in deg.items() if d != 2]
    used = set()
    lines = []

    def walk(start, second):
        line = [start, second]
        used.add(frozenset((start, second)))
        cur, prev = second, start
        while deg.get(cur, 0) == 2:
            nxt = [n for n in nbrs(*cur) if n != prev]
            if not nxt:
                break
            # A RING ROAD HAS NO ENDPOINT AND NO JUNCTION, so every cell on it
            # has degree 2 and this walk would circle it forever - it ran until
            # the process died of MemoryError. Stopping on an edge already
            # walked closes the loop exactly once.
            edge = frozenset((cur, nxt[0]))
            if edge in used:
                break
            used.add(edge)
            prev, cur = cur, nxt[0]
            line.append(cur)
        return line

    for n in nodes:
        for s in nbrs(*n):
            if frozenset((n, s)) not in used:
                lines.append(walk(n, s))
    # Closed loops have no endpoint or junction to start from.
    for p in deg:
        for s in nbrs(*p):
            if frozenset((p, s)) not in used:
                lines.append(walk(p, s))
    return [l for l in lines if len(l) >= MIN_LEN]


def resample(line, GW, GH):
    pts = [line[i] for i in range(0, len(line), STEP)]
    if pts[-1] != line[-1]:
        pts.append(line[-1])
    return [(round(x / GW, 3), round(y / GH, 3)) for x, y in pts]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--openr", type=int, default=OPEN_R)
    ap.add_argument("--straight", type=int, default=0,
                    help="emit N verified straight segments instead of traced curves")
    args = ap.parse_args()
    if not PLATE.exists():
        sys.exit(f"no plate at {PLATE}")

    _ma, smooth, GW, GH = load_masks()
    opened = dilate(erode(smooth, GW, GH, args.openr), GW, GH, args.openr)
    roads = [[smooth[y][x] and not opened[y][x] for x in range(GW)] for y in range(GH)]
    if args.straight:
        out = list(straight_segments(roads, GW, GH, args.straight))
    else:
        sk = thin(roads, GW, GH)
        lines = trace(sk, GW, GH)
        lines.sort(key=len, reverse=True)
        out = [resample(l, GW, GH) for l in lines]

    print(f"smooth ground : {sum(map(sum, smooth))} cells")
    print(f"platforms     : {sum(map(sum, opened))} cells (survived erosion {args.openr})")
    print(f"road pixels   : {sum(map(sum, roads))} cells")
    print(f"routes        : {len(out)}  ({sum(len(p) for p in out)} points)")
    for p in out[:12]:
        print("road " + " ".join(f"{x},{y}" for x, y in p))

    if args.debug:
        im = Image.open(PLATE).convert("RGB").resize((1920, 1080), Image.LANCZOS)
        d = ImageDraw.Draw(im, "RGBA")
        for y in range(GH):
            for x in range(GW):
                if roads[y][x]:
                    d.rectangle([x * 6, y * 6, x * 6 + 5, y * 6 + 5], fill=(255, 0, 200, 70))
        for p in out:
            d.line([(x * 1920, y * 1080) for x, y in p], fill=(60, 255, 255, 255), width=5)
        im.save(DEBUG_PNG)
        print(f"-> {DEBUG_PNG.name}")

    if args.write:
        s = LAYOUT.read_text(encoding="utf-8").split("\n# ── ROADS")[0].rstrip()
        s += ("\n\n# ── ROADS ─ generated by `python map-roads.py --write` ─────────────\n"
              "# Traced from the painted roads themselves, so they cannot disagree\n"
              "# with the picture. Never drawn - only followed. Edit or delete any\n"
              "# line freely; re-running this replaces the whole block.\n")
        for p in out:
            s += "road " + " ".join(f"{x},{y}" for x, y in p) + "\n"
        LAYOUT.write_text(s, encoding="utf-8")
        print(f"-> {LAYOUT.name}  ({len(out)} routes)")




def straight_segments(roads, GW, GH, want=6):
    """Find STRAIGHT runs that lie entirely on painted road.

    Tracing curves by eye put armour near the sand but not on it - Mike's read
    was "driving slightly close to roads but not close enough". A straight
    segment can be VERIFIED rather than eyeballed: every sampled point along it
    either sits on road or the candidate is thrown away. Short and provably on
    the sand beats long and approximately right.
    """
    import random
    random.seed(7)
    cells = [(x, y) for y in range(GH) for x in range(GW) if roads[y][x]]
    if not cells:
        return []

    def on_road(x, y):
        xi, yi = int(round(x)), int(round(y))
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if 0 <= xi + dx < GW and 0 <= yi + dy < GH and roads[yi + dy][xi + dx]:
                    return True
        return False

    cands = []
    for _ in range(40000):
        ax, ay = random.choice(cells)
        bx, by = random.choice(cells)
        L = math.hypot(bx - ax, by - ay)
        if L < 26 or L > 150:
            continue
        n = int(L)
        if all(on_road(ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n + 1)):
            cands.append((L, ax, ay, bx, by))
    cands.sort(reverse=True)

    picked = []
    for L, ax, ay, bx, by in cands:
        mx, my = (ax + bx) / 2, (ay + by) / 2
        ang = math.atan2(by - ay, bx - ax) % math.pi
        if any(math.hypot(mx - pm[0], my - pm[1]) < 34 and
               min(abs(ang - pa), math.pi - abs(ang - pa)) < 0.5
               for pm, pa in picked):
            continue
        picked.append(((mx, my), ang))
        yield [(round(ax / GW, 3), round(ay / GH, 3)), (round(bx / GW, 3), round(by / GH, 3))]
        if len(picked) >= want:
            return

if __name__ == "__main__":
    main()
