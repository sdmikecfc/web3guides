#!/usr/bin/env python
"""
MAP ANCHORS — find the clearings a map offers as building sites.

  python map-anchors.py --debug
  python map-anchors.py --plate public/s5-art/world/_raw/variant-b.png --debug

WHY THIS ONE WORKS WHERE ROAD DETECTION DID NOT
An earlier attempt tried to find ROADS by colour and failed, permanently: a
sandy road and a sandy field are the same material, and what separates them is
shape, which colour cannot see.

A CLEARING is a different kind of thing. It is defined by AREA — a large,
contiguous, bounded patch of open ground — and area is exactly what a distance
transform measures. So this asks the only question colour can answer well
("is this cell open ground or is it tree/rock/water?") and then does the real
work geometrically: how far is this cell from the nearest obstruction? The
local maxima of that distance field ARE the centres of the clearings, and the
distance itself is how big a building fits there.

That is why the map must now be GENERATED with clearings in it. This tool finds
what the painter put there; it cannot invent somewhere good to stand.

OUTPUT
  map-anchors.json   ranked anchors: {x, y, r} normalized, r = fit radius
  map-anchors.png    debug overlay (--debug)
"""
import argparse
import colorsys
import json
import math
import pathlib
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).parent
DEFAULT_PLATE = ROOT / "public" / "s5-art" / "world" / "bg-land.webp"
OUT_JSON = ROOT / "map-anchors.json"
OUT_PNG = ROOT / "map-anchors.png"

# Working grid. Fine enough to resolve a clearing's edge, coarse enough that the
# distance transform is instant in pure Python.
GW, GH = 320, 180
ASPECT_Y = 9 / 16

# Texture ceiling in the 3-14px band: smooth enough to be a built platform.
# Measured on this season's plate - platforms 5.4-9.2, lawn 11.0-30.6. This is
# the threshold that shifts with a season's art style, so it is exposed on the
# command line; re-measure it when the biome changes.
TEX_MAX = 10.0
# Deep-shadow floor. A secondary guard now, not the main test.
V_MIN = 0.34

# A building needs a real amount of room; anything under this is a gap between
# trees, not a site. In grid cells. A painted road is ~2 cells wide, so this
# also excludes roads by geometry rather than by colour.
MIN_R = 4.0
# Anchors closer together than this (in grid cells) are the same clearing.
MIN_SEP = 11.0
# How far past its platform a sprite may overhang, as a multiple of the strict
# radius. Stops a small platform in the middle of a big lawn claiming the lawn.
ROOM_CAP = 2.1


def open_mask(im: Image.Image, vmin=V_MIN):
    """True only on a BUILDING PLATFORM: bare, sunlit, unvegetated ground.

    THE EARLIER VERSION OF THIS FUNCTION WAS THE BUG. It asked "is this cell
    NOT tree, water or shadow?" and called everything else open — which made
    sunlit GRASS and the pale dirt ROADS buildable. 76% of the plate came back
    "open", the distance transform then found the widest gaps in the lawn and
    the road junctions, and the anchors largely missed the kerbed staging areas
    the plate was generated to provide. Mike's read: "you have a lot of places
    on the road... it's almost like you avoided the areas given for buildings."

    COLOUR CANNOT DO THIS JOB, and that was worth measuring twice to learn.
    Sunlit lawn and a sand platform are the same paint:

        sand platform    h 0.10-0.13   v 0.63-0.95
        sunlit lawn      h 0.12-0.14   v 0.64-0.70

    That is the road-detection trap again - two things made of the same
    material, told apart only by shape. A brightness threshold does separate
    SHADED grass from platforms, but it throws away every platform with a grass
    or dark-stone surface, and it lets bright lawn straight through.

    TEXTURE AT THE SCALE OF A GRASS TUFT IS THE DISCRIMINATOR. A platform is a
    smooth painted surface; grass and foliage are covered in small marks. The
    scale matters and is why the first attempt at this failed: measured against
    a 2px blur it picks up the dry-brush grain that platforms have too, and
    everything reads as textured. Measured as the band between a 3px and a 14px
    blur - roughly the size of a painted tuft - the classes separate cleanly:

        platforms                5.4 - 9.2
        lawn                    11.0 - 30.6
        foliage                        16.3
        mountain rock             high

    Roads are smooth and DO pass this test. They are excluded by GEOMETRY
    instead: a painted road is about two grid cells wide, so MIN_R rejects it.
    That is deliberate - nothing about a road's appearance distinguishes it
    from a plaza, only its width does.

    `vmin` survives as a deep-shadow floor, not as the main test.
    """
    rgb = im.convert("RGB")
    px = rgb.resize((GW, GH), Image.LANCZOS).load()
    g = rgb.convert("L")
    band = ImageChops.difference(g.filter(ImageFilter.GaussianBlur(3.0)),
                                 g.filter(ImageFilter.GaussianBlur(14.0)))
    tx = band.resize((GW, GH), Image.BOX).load()

    m = [[True] * GW for _ in range(GH)]
    for y in range(GH):
        for x in range(GW):
            r, g_, b = px[x, y]
            _h, _s, v = colorsys.rgb_to_hsv(r / 255, g_ / 255, b / 255)
            water = b >= r + 8 and b >= g_ - 6
            if tx[x, y] > TEX_MAX or v < vmin or water:
                m[y][x] = False
    return m


def clear_mask(im: Image.Image):
    """True anywhere a sprite may OVERHANG: everything except a hard obstacle.

    Two masks, two jobs, and conflating them is what made the radii wrong.

      open_mask   answers WHERE A BUILDING BELONGS. Strict, platforms only.
      clear_mask  answers HOW BIG IT MAY BE. Permissive - grass and road count
                  as clear, because a keep whose wall overhangs its kerb onto
                  the verge looks normal, while one scaled down to fit inside
                  the sunlit half of its own platform looks like a doll's house.

    Using the strict mask for both undersized every anchor, because the shaded
    side of each platform falls under the brightness floor and the distance
    transform stopped there.
    """
    px = im.convert("RGB").resize((GW, GH), Image.LANCZOS).load()
    m = [[True] * GW for _ in range(GH)]
    for y in range(GH):
        for x in range(GW):
            r, g, b = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            canopy = 0.17 < h < 0.50 and s > 0.30 and v < 0.52
            water = b >= r + 8 and b >= g - 6
            rock = v < 0.30
            if canopy or water or rock:
                m[y][x] = False
    return m


def distance_field(mask):
    """Chamfer distance to the nearest blocked cell (two passes, 3-4 metric).

    Cheap, exact enough, and no scipy — which this repo does not have.
    """
    INF = 10**6
    d = [[0 if not mask[y][x] else INF for x in range(GW)] for y in range(GH)]
    # Edges of the map count as blocked, so nothing anchors half off-board.
    for x in range(GW):
        d[0][x] = 0
        d[GH - 1][x] = 0
    for y in range(GH):
        d[y][0] = 0
        d[y][GW - 1] = 0
    for y in range(1, GH):
        for x in range(1, GW - 1):
            d[y][x] = min(d[y][x], d[y - 1][x] + 3, d[y][x - 1] + 3,
                          d[y - 1][x - 1] + 4, d[y - 1][x + 1] + 4)
    for y in range(GH - 2, -1, -1):
        for x in range(GW - 2, 0, -1):
            d[y][x] = min(d[y][x], d[y + 1][x] + 3, d[y][x + 1] + 3,
                          d[y + 1][x + 1] + 4, d[y + 1][x - 1] + 4)
    return [[v / 3.0 for v in row] for row in d]


def find_anchors(dist, room=None):
    """Local maxima of the distance field: the middle of each clearing.

    `dist` is the STRICT field and decides where the centres are. `room` is the
    permissive field and decides how much space each one really has. The radius
    is capped at a multiple of the strict value so a small platform sitting in
    a wide lawn cannot claim the whole lawn.
    """
    cands = []
    for y in range(2, GH - 2):
        for x in range(2, GW - 2):
            r = dist[y][x]
            if r < MIN_R:
                continue
            # Strict-ish local maximum in a 5x5 window.
            best = True
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    if dist[y + dy][x + dx] > r:
                        best = False
                        break
                if not best:
                    break
            if best:
                cands.append((r, x, y))
    # Biggest first, then suppress anything inside an already-taken clearing.
    cands.sort(reverse=True)
    out = []
    for r, x, y in cands:
        if any(math.hypot(x - ax, y - ay) < max(MIN_SEP, (r + ar) * 0.75)
               for ar, ax, ay in out):
            continue
        out.append((min(room[y][x], r * ROOM_CAP) if room else r, x, y))
    out.sort(reverse=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plate", default=str(DEFAULT_PLATE))
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--top", type=int, default=40, help="keep the N largest")
    ap.add_argument("--vmin", type=float, default=V_MIN,
                    help="deep-shadow floor")
    ap.add_argument("--tex", type=float, default=TEX_MAX,
                    help="texture ceiling for smooth built ground")
    ap.add_argument("--minr", type=float, default=MIN_R,
                    help="smallest platform worth reporting, in grid cells")
    ap.add_argument("--sep", type=float, default=MIN_SEP,
                    help="two anchors closer than this are one platform")
    args = ap.parse_args()

    plate = pathlib.Path(args.plate)
    if not plate.exists():
        sys.exit(f"no plate at {plate}")
    im = Image.open(plate)

    globals()['TEX_MAX'] = args.tex
    globals()['MIN_R'] = args.minr
    globals()['MIN_SEP'] = args.sep
    mask = open_mask(im, args.vmin)
    openpct = sum(1 for row in mask for c in row if c) / (GW * GH)
    dist = distance_field(mask)
    room = distance_field(clear_mask(im))
    anchors = find_anchors(dist, room)[: args.top]

    # Normalized, with the fit radius expressed as a fraction of map WIDTH so it
    # can be compared directly against a site's `size`.
    js = [{"x": round(x / GW, 4), "y": round(y / GH, 4), "r": round(r / GW, 4)}
          for r, x, y in anchors]
    OUT_JSON.write_text(json.dumps({"anchors": js}, indent=2), encoding="utf-8")

    # A site's sprite is `size` wide, so it needs a radius of about size/2.
    # These are the sizes S5 actually uses.
    big = sum(1 for a in js if a["r"] >= 0.052)    # fits the camp (0.104 wide)
    med = sum(1 for a in js if 0.032 <= a["r"] < 0.052)  # fits a game place
    small = sum(1 for a in js if a["r"] < 0.032)

    # This should be SMALL. The platforms are a minority of the board; if this
    # reads 70%+ the mask has fallen back to "anything not a tree" and the
    # anchors will land on lawn and roads.
    print(f"plate      : {plate.name}  platform ground {openpct*100:.0f}%")
    if openpct > 0.35:
        print("  WARNING: too much ground counts as platform - raise --vmin")
    print(f"anchors    : {len(js)}  (large {big}, medium {med}, small {small})")
    print(f"largest r  : {js[0]['r'] if js else 0}")
    fits_fort = sum(1 for a in js if a["r"] >= 0.0238)  # 0.058 sprite, 0.82 slack
    print(f"fit a fort : {fits_fort}  (need 11 + 4 games + base + facilities)")
    # Distribution matters as much as count: a map with 30 clearings all in one
    # corner is no better than one with none.
    quad = [0, 0, 0, 0]
    for a in js:
        quad[(0 if a["x"] < 0.5 else 1) + (0 if a["y"] < 0.5 else 2)] += 1
    print(f"per quadrant: TL {quad[0]}  TR {quad[1]}  BL {quad[2]}  BR {quad[3]}")
    if min(quad) < 3:
        print("  WARNING: a quadrant has under 3 anchors - this plate is unevenly usable")
    if big < 2:
        print("  WARNING: fewer than 2 large clearings - the camp may not fit")

    if args.debug:
        W, H = 1280, 720
        dbg = im.convert("RGB").resize((W, H), Image.LANCZOS)
        d = ImageDraw.Draw(dbg, "RGBA")
        for y in range(GH):
            for x in range(GW):
                if not mask[y][x]:
                    d.rectangle([x * W / GW, y * H / GH, (x + 1) * W / GW, (y + 1) * H / GH],
                                fill=(200, 40, 40, 46))
        for i, a in enumerate(js):
            cx, cy = a["x"] * W, a["y"] * H
            rr = a["r"] * W
            col = (80, 255, 120, 255) if a["r"] >= 0.052 else (
                255, 220, 60, 255) if a["r"] >= 0.032 else (255, 255, 255, 200)
            d.ellipse([cx - rr, cy - rr * 0.9, cx + rr, cy + rr * 0.9], outline=col, width=3)
            d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=col)
        dbg.save(OUT_PNG)
        print(f"debug      -> {OUT_PNG}")
    print(f"-> {OUT_JSON}")


if __name__ == "__main__":
    main()
