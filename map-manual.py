#!/usr/bin/env python
"""
MAP MANUAL — place every building by hand, from a numbered grid.

  python map-manual.py --grid     # draw map-grid.png: the plate + a coordinate
                                  # grid + where everything currently stands
  python map-manual.py            # read map-layout.txt, check it, write the fit

WHY BY HAND
Automatic placement got the map legal but never got it COMPOSED. Every rule
added to fix one complaint (spacing, overlap, bridge-needs-water) cost a
building somewhere else, and the measured ceiling on this plate was 22 crammed
/ 19 decent / 16 well-spaced against a roster of 19. A level designer moving
things by eye beats a solver on a board this small, and it takes ten minutes
ONCE per season rather than a tuning session per complaint.

The tool's whole job is to make "by hand" cheap:
  * --grid prints the board with coordinates on it, so a position can be READ
    OFF rather than guessed
  * map-layout.txt is one line per building, `key x y`
  * this script CHECKS the result and says what is wrong in plain words -
    off the board, on water, overlapping, not on a platform - but never
    overrides the decision. A warning is advice; the layout is the authority.

COORDINATES are normalized 0..1, x left to right, y top to bottom, and are the
GROUND-CONTACT point of the building (bottom-centre of the sprite), not its
middle. Put the coordinate where the building's feet should land.
"""
import argparse
import json
import math
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).parent
PLATE = ROOT / "public" / "s5-art" / "world" / "bg-land.webp"
ANCHORS = ROOT / "map-anchors.json"
LAYOUT = ROOT / "map-layout.txt"
GRID_PNG = ROOT / "map-grid.png"
OUT = ROOT / "src" / "lib" / "s5" / "world.fit.ts"

ASPECT = 2 / 1  # the 2026-08-01 plate is 2:1 (1920x960); was 16/9

# key -> (width as a fraction of board width, human label for the grid image).
# Widths mirror src/lib/s5/world.ts; change them together.
ROSTER = {
    "basecamp":     (0.104, "YOUR BASE"),
    "commandpost":  (0.044, "Leaderboards"),
    "muster":       (0.040, "Other Commanders"),
    "powerstation": (0.040, "Power Station (locked)"),
    "convoyroad":   (0.052, "Mini Game: Warpath (BRIDGE - needs river)"),
    "airfield":     (0.052, "Mini Game: Warhawks"),
    "arena":        (0.052, "Mini Game: Armorclash"),
    "ridgepass":    (0.052, "Mini Game: Breakthrough"),
}
TARGET_SIZE = 0.046
N_TARGETS = 10  # t0..t9, in listing order: t0 is stronghold #1 (the Aug-3 ten)

# A sprite is about twice as tall as it is wide and anchors bottom-centre, so
# the one behind is hidden by the one in front unless they are separated in
# DEPTH by roughly twice what they need side to side.
DEPTH_WEIGHT = 0.5
EDGE = 0.02  # keep a sprite's feet this far inside the board


def seed_layout():
    """Write a starting map-layout.txt from whatever is placed today."""
    lines = [
        "# LAUNCH WARS - WORLD LAYOUT",
        "#",
        "# One building per line:   key   x   y",
        "# x and y are 0..1 (x left->right, y top->bottom) and mark the",
        "# building's FEET, not its middle. Read them off map-grid.png.",
        "#",
        "#   python map-manual.py --grid   redraw the grid with your changes",
        "#   python map-manual.py          apply this file",
        "#",
        "# t0..t10 are the strongholds IN LISTING ORDER - t0 is the first",
        "# domain in the season, t10 the last. Keep that order meaningful:",
        "# the map should read as an advance, not a scatter.",
        "#",
    ]
    fit = {}
    if OUT.exists():
        import re
        txt = OUT.read_text(encoding="utf-8")
        for k, x, y in re.findall(r"(\w+): \{ x: ([0-9.]+), y: ([0-9.]+) \}", txt):
            fit[k] = (float(x), float(y))
        slots = re.findall(r"\{ x: ([0-9.]+), y: ([0-9.]+) \}", txt.split("FIT_SLOTS")[-1])
        for i, (x, y) in enumerate(slots):
            fit[f"t{i}"] = (float(x), float(y))
    for k, (_w, label) in ROSTER.items():
        x, y = fit.get(k, (0.5, 0.5))
        lines.append(f"{k:<14} {x:.3f} {y:.3f}    # {label}")
    lines.append("")
    for i in range(N_TARGETS):
        x, y = fit.get(f"t{i}", (0.1 + i * 0.08, 0.25))
        lines.append(f"{'t%d' % i:<14} {x:.3f} {y:.3f}    # stronghold {i + 1}")
    LAYOUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def platform_mask():
    """The same platform test map-anchors.py uses, so the tool and the detector
    can never disagree about what counts as buildable ground."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("ma", ROOT / "map-anchors.py")
    ma = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ma)
    ma.TEX_MAX = 12.0
    m = ma.open_mask(Image.open(PLATE), 0.34)
    GW, GH = ma.GW, ma.GH

    def under_feet(nx, ny):
        gx, gy = min(GW - 1, int(nx * GW)), min(GH - 1, int(ny * GH))
        return sum(1 for dy in range(-2, 3) for dx in range(-3, 4)
                   if 0 <= gx + dx < GW and 0 <= gy + dy < GH and m[gy + dy][gx + dx])
    return under_feet


def read_layout():
    """Returns (buildings, paths, camps). A `road` line is a tank route, not a
    building: `road 0.12,0.80 0.30,0.78 0.55,0.74`. A `camp` line is a PLAYER
    SAFE AREA - an ellipse camped commanders scatter inside:
    `camp cx cy rx ry`. WRITE AS MANY AS THE PLATE NEEDS: one oval rarely
    covers every piece of rear ground worth standing on, and the crowd is
    dealt across the zones by area so density matches in all of them."""
    out = {}
    paths = []
    camps = []
    for n, raw in enumerate(LAYOUT.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.split("#")[0].strip()
        if not line:
            continue
        bits = line.split()
        if bits[0] == "camp":
            try:
                camps.append((float(bits[1]), float(bits[2]), float(bits[3]), float(bits[4])))
            except (ValueError, IndexError):
                print(f"  line {n}: camp looks like `camp cx cy rx ry` - got: {raw.strip()}")
            continue
        if bits[0] == "road":
            pts = []
            for tok in bits[1:]:
                try:
                    a, b = tok.split(",")
                    pts.append((float(a), float(b)))
                except ValueError:
                    print(f"  line {n}: road points look like x,y - got {tok}")
            if len(pts) >= 2:
                paths.append(pts)
            continue
        if len(bits) < 3:
            print(f"  line {n}: expected `key x y`, got: {raw.strip()}")
            continue
        try:
            out[bits[0]] = (float(bits[1]), float(bits[2]))
        except ValueError:
            print(f"  line {n}: x and y must be numbers: {raw.strip()}")
    return out, paths, camps


def size_of(key):
    return ROSTER[key][0] if key in ROSTER else TARGET_SIZE


def check(layout, paths=(), camps=()):
    """Say what is wrong, in plain words. Never refuse to write."""
    warn = []
    for camp in camps or ():
        cx, cy, rx, ry = camp
        if cx - rx < 0.0 or cx + rx > 1.0 or cy - ry < 0.0 or cy + ry > 1.0:
            warn.append(f"camp at {cx:.2f},{cy:.2f} r {rx:.2f}x{ry:.2f} hangs off the board")
        # Forts INSIDE the camp are a DESIGN, not a defect (Mike 2026-08-01:
        # "I put the players with the domains since they are technically
        # fighting them") - the scatter itself guarantees nobody stands ON a
        # building, so there is nothing to warn about here.
    for k in list(ROSTER) + [f"t{i}" for i in range(N_TARGETS)]:
        if k not in layout:
            warn.append(f"{k} is missing - it will not appear on the map")
    wet = water_mask()
    feet = platform_mask() if PLATE.exists() else None
    for k, (x, y) in layout.items():
        # 35 cells are sampled under the feet. Below a third of them and the
        # building is mostly standing on grass, which reads as dropped rather
        # than sited - the single commonest thing to get wrong by hand.
        if feet and feet(x, y) < 12:
            warn.append(f"{k} at {x:.3f},{y:.3f} is off a platform "
                        f"({feet(x, y)}/35 cells) - it will look like it is on grass")
        s = size_of(k)
        if not (EDGE <= x <= 1 - EDGE) or not (EDGE <= y <= 1 - EDGE):
            warn.append(f"{k} at {x:.3f},{y:.3f} is off the edge of the board")
        if wet and wet(x, y):
            warn.append(f"{k} at {x:.3f},{y:.3f} is standing in water")
        for k2, (x2, y2) in layout.items():
            if k2 <= k:
                continue
            need = (s + size_of(k2)) / 2
            d = math.hypot(x - x2, (y - y2) * ASPECT * DEPTH_WEIGHT)
            if d < need:
                warn.append(f"{k} and {k2} overlap (gap {d - need:+.3f})")
    return warn


def water_mask():
    if not PLATE.exists():
        return None
    import colorsys
    GW, GH = 320, 180
    px = Image.open(PLATE).convert("RGB").resize((GW, GH), Image.LANCZOS).load()

    def wet(nx, ny):
        x, y = min(GW - 1, int(nx * GW)), min(GH - 1, int(ny * GH))
        r, g, b = px[x, y]
        return b >= r + 8 and b >= g - 6
    return wet


def font(sz):
    """PIL's built-in font is unreadably small at 1920 wide. Fall back to it
    only if Windows has no Arial, which it always does."""
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, sz)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_grid(layout, paths=(), camps=()):
    # Sized from ASPECT, not hardcoded 16:9 - the 2026-08-01 plate is 2:1 and
    # a hardcoded (1920, 1080) quietly stretched it 12.5% tall.
    im = Image.open(PLATE).convert("RGB").resize((1920, round(1920 / ASPECT)), Image.LANCZOS)
    d = ImageDraw.Draw(im, "RGBA")
    for camp in camps or ():
        cx, cy, rx, ry = camp
        W0, H0 = im.size
        d.ellipse([(cx - rx) * W0, (cy - ry) * H0, (cx + rx) * W0, (cy + ry) * H0],
                  outline=(255, 210, 60, 220), width=3, fill=(255, 210, 60, 26))
        d.text(((cx - rx) * W0 + 8, (cy - ry) * H0 + 6), "PLAYER CAMP",
               fill=(255, 220, 120, 235), font=font(15))
    f_axis, f_name = font(19), font(17)
    W, H = im.size
    # Minor every 0.025 so a position can be eyeballed to about half a step;
    # major every 0.05 because that is the step worth typing.
    for i in range(41):
        x = i / 40
        col = (255, 255, 255, 190) if i % 2 == 0 else (255, 255, 255, 70)
        d.line([(x * W, 0), (x * W, H)], fill=col, width=2 if i % 2 == 0 else 1)
    for i in range(41):
        y = i / 40
        col = (255, 255, 255, 190) if i % 2 == 0 else (255, 255, 255, 70)
        d.line([(0, y * H), (W, y * H)], fill=col, width=2 if i % 2 == 0 else 1)
    for i in range(0, 41, 2):
        t = f"{i / 40:.2f}"
        x, y = i / 40 * W, i / 40 * H
        d.rectangle([x + 2, 2, x + 56, 26], fill=(0, 0, 0, 205))
        d.text((x + 6, 4), t, fill=(255, 240, 60, 255), font=f_axis)
        d.rectangle([2, y + 2, 56, y + 26], fill=(0, 0, 0, 205))
        d.text((6, y + 4), t, fill=(110, 235, 255, 255), font=f_axis)
    for pts in paths:
        d.line([(x * W, y * H) for x, y in pts], fill=(255, 60, 200, 230), width=5)
        for x, y in pts:
            d.ellipse([x * W - 6, y * H - 6, x * W + 6, y * H + 6],
                      fill=(255, 60, 200, 255))

    # Where each building currently stands, with its footprint, so a clash is
    # visible rather than something to be discovered after a re-render.
    feet = platform_mask() if PLATE.exists() else None
    bad = {k for k, (x, y) in layout.items() if feet and feet(x, y) < 12}
    for k2, (x2, y2) in layout.items():
        for k3, (x3, y3) in layout.items():
            if k3 <= k2:
                continue
            if math.hypot(x2 - x3, (y2 - y3) * ASPECT * DEPTH_WEIGHT) <                     (size_of(k2) + size_of(k3)) / 2:
                bad.add(k2)
                bad.add(k3)
    for k, (x, y) in sorted(layout.items()):
        sz = size_of(k)
        cx, cy = x * W, y * H
        rx, ry = sz / 2 * W, sz / 2 * W * 0.55
        # A flagged building is drawn in alarm red whatever its type, so the
        # things that need editing are findable without reading the log.
        col = (255, 60, 60, 255) if k in bad else (
            (255, 140, 70, 255) if k == "basecamp" else
            (90, 255, 140, 255) if k.startswith("t") else (255, 210, 60, 255))
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=col, width=4)
        d.line([(cx - 11, cy), (cx + 11, cy)], fill=col, width=4)
        d.line([(cx, cy - 11), (cx, cy + 11)], fill=col, width=4)
        # The KEY is what gets typed into map-layout.txt, so it leads; the
        # friendly name follows so the map can be read without the file open.
        if k.startswith("t"):
            label = f"{k} - Stronghold {int(k[1:]) + 1}"
        else:
            label = f"{k} - {ROSTER[k][1]}"
        if k in bad:
            label += "  <-- FIX"
        w0, _h0, w1, h1 = d.textbbox((0, 0), label, font=f_name)
        tw, th = w1 - w0, h1
        ty = cy + ry + 6
        d.rectangle([cx - tw / 2 - 5, ty - 2, cx + tw / 2 + 5, ty + th + 4],
                    fill=(0, 0, 0, 215))
        d.text((cx - tw / 2, ty), label, fill=col, font=f_name)
    im.save(GRID_PNG)
    print(f"-> {GRID_PNG.name}   grid every 0.025, labelled every 0.05")


def write_fit(layout, paths=(), camps=()):
    camp_ts = (
        "[\n"
        + "".join(
            f"  {{ x: {c[0]:.4f}, y: {c[1]:.4f}, rx: {c[2]:.4f}, ry: {c[3]:.4f} }},\n"
            for c in camps
        )
        + "]"
        if camps else "[]"
    )
    paths_ts = "\n".join(
        "  [" + ", ".join(f"{{ x: {x:.4f}, y: {y:.4f} }}" for x, y in pts) + "],"
        for pts in paths)
    sites = "\n".join(f"  {k}: {{ x: {layout[k][0]:.4f}, y: {layout[k][1]:.4f} }},"
                      for k in ROSTER if k in layout)
    slots = "\n".join(f"  {{ x: {layout[f't{i}'][0]:.4f}, y: {layout[f't{i}'][1]:.4f} }},"
                      for i in range(N_TARGETS) if f"t{i}" in layout)
    OUT.write_text(f'''/**
 * GENERATED by `python map-manual.py` from map-layout.txt - DO NOT HAND EDIT.
 * Edit map-layout.txt and re-run instead.
 *
 * Placement here is AUTHORED, not solved. Automatic placement kept the map
 * legal and never got it composed; on this plate its ceiling was 16 buildings
 * well-spaced against a roster of 19. Hand placement has no such ceiling.
 *
 * ROADS, RIVERS AND BRIDGES ARE PAINTED INTO bg-land.webp, so the vector
 * network stays empty - drawing one would put a second, disagreeing set of
 * roads over the painting.
 */
import type {{ Vec2 }} from "@/lib/world/types";

export const FIT_RIVERS: Vec2[][] = [];
export const FIT_ROADS: Vec2[][] = [];
export const FIT_CROSSINGS: Vec2[] = [];
export const FIT_TRACKS: Vec2[][] = [];
export const FIT_PADS: {{ x: number; y: number; r: number }}[] = [];

export const FIT_SITES: Record<string, Vec2> = {{
{sites}
}};

export const FIT_SLOTS: Vec2[] = [
{slots}
];

/**
 * TANK ROUTES. Traced by hand over the painted roads, and NEVER DRAWN - the
 * roads already exist in the plate. These exist so rolling units have a
 * centreline to follow. Automatic extraction was tried and measured:
 * subtracting platforms from smooth ground left 836 fragments, largest holding
 * 13% of the network, because a road and a plaza are the same paint. Tracing
 * onto the picture cannot disagree with the picture.
 */
export const FIT_PATHS: Vec2[][] = [
{paths_ts}
];

/**
 * THE PLAYER SAFE AREAS - where camped commanders (holding nothing) scatter.
 * Authored as `camp cx cy rx ry` lines in map-layout.txt / dragged in
 * map-editor.html, AS MANY AS THE PLATE NEEDS. Campers are dealt across them
 * by area, so a big zone takes proportionally more tanks than a small one and
 * both end up the same density. Empty = derive from the muster sign (the
 * fallback), so old layouts keep working.
 */
export const FIT_CAMPS: {{ x: number; y: number; rx: number; ry: number }}[] = {camp_ts};
''', encoding="utf-8")
    print(f"-> {OUT.relative_to(ROOT)}   {len(layout)} buildings")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", action="store_true", help="draw map-grid.png")
    args = ap.parse_args()

    if not PLATE.exists():
        sys.exit(f"no plate at {PLATE}")
    if not LAYOUT.exists():
        seed_layout()
        print(f"seeded {LAYOUT.name} from the current layout")

    layout, paths, camps = read_layout()
    warn = check(layout, paths, camps)
    if paths:
        print(f"roads      : {len(paths)} traced route(s), "
              f"{sum(len(p) for p in paths)} points")
    for i, camp in enumerate(camps):
        print(f"player camp {i + 1}: {camp[0]:.3f},{camp[1]:.3f} r {camp[2]:.3f}x{camp[3]:.3f}")
    if warn:
        print(f"{len(warn)} thing(s) to look at:")
        for w in warn[:14]:
            print(f"  {w}")
        if len(warn) > 14:
            print(f"  ...and {len(warn) - 14} more")
    else:
        print("layout checks clean")

    if args.grid:
        draw_grid(layout, paths, camps)
    else:
        write_fit(layout, paths, camps)


if __name__ == "__main__":
    main()
