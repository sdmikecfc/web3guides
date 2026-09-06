#!/usr/bin/env python
"""
MAP PLACE — snap the authored layout onto the clearings the plate actually has.

  python map-place.py            # place, report, write world.fit.ts
  python map-place.py --dry      # report only

WHY THIS REPLACES map-fit.py's PLACEMENT HALF
map-fit.py tried to SOLVE placement: given roads and rivers, compute where 24
structures should stand. Eight rounds of that produced, in Mike's words, "a
fucked up menu bar with random shit everywhere". The reason was not the solver.
It was that the plates were painted as ILLUSTRATIONS and offered nowhere good
to stand, so the solver was optimising legality (off water, off trees, not
overlapping) on terrain that had no right answer.

The plate is now GENERATED WITH STAGING AREAS IN IT — open kerbed platforms,
in three sizes, spread across the board. So placement stops being a search and
becomes an ASSIGNMENT:

    the authored layout says WHERE EACH THING WANTS TO BE  (intent)
    map-anchors.py says WHERE A BUILDING CAN LEGALLY STAND (ground truth)
    this script matches one to the other                   (assignment)

Hardest-to-fit first, each structure taking the cheapest anchor that is big
enough and far enough from what is already placed. Intent survives because the
cost is distance-from-desired; legality is guaranteed because only real
clearings are ever candidates.

SEASON PORTABILITY. A new season regenerates the plate, re-runs map-anchors,
and re-runs this. The DESIRED table below is the thing that stays fixed — the
base is always bottom-right, the arcade always strung along the near band, the
front always across the top. Players keep their muscle memory; the art changes
underneath them.
"""
import argparse
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
ANCHORS = ROOT / "map-anchors.json"
PLATE = ROOT / "public" / "s5-art" / "world" / "bg-land.webp"
OUT = ROOT / "src" / "lib" / "s5" / "world.fit.ts"

# 16:9. Normalized y is compressed relative to x, so every distance below is
# measured in X-UNITS with y scaled up, otherwise "far apart" means something
# different horizontally than vertically.
ASPECT = 16 / 9

# A sprite of width `size` needs a clearing of radius size/2. SLACK below 1.0
# lets a building slightly overhang the kerb of its platform, which reads as
# occupying the site rather than floating in the middle of it.
SLACK = 0.82
# Two structures must not visually collide: centres at least this multiple of
# their combined half-widths apart.
SEP = 1.0
# The board splits here: strongholds above, base and arcade below. It is the
# one number that decides how the map reads as a campaign.
FRONT_Y = 0.60
# ABSOLUTE minimum distance between any two structures, in x-units, on top of
# the no-overlap rule. SEP alone only stops sprites touching, which let three
# buildings sit shoulder to shoulder on one wide plaza while empty platforms
# went unused - legal, and visually a huddle. Spacing has to be its own rule.
MIN_GAP = 0.062

# ── THE AUTHORED LAYOUT. Intent, not final coordinates. Sizes mirror
#    src/lib/s5/world.ts; if one changes there, change it here.
#    (key, size, desired x, desired y, group)
SITES = [
    ("basecamp",     0.104, 0.815, 0.720, "home"),
    ("commandpost",  0.044, 0.665, 0.700, "near"),
    ("muster",       0.040, 0.945, 0.480, "edge"),
    ("powerstation", 0.040, 0.690, 0.520, "edge"),
    ("convoyroad",   0.052, 0.115, 0.780, "game"),
    ("airfield",     0.052, 0.265, 0.800, "game"),
    ("arena",        0.052, 0.420, 0.830, "game"),
    ("ridgepass",    0.052, 0.560, 0.800, "game"),
]

# THE ADVANCE, in listing order. Serpentine so the campaign reads as moving up
# the board: 1-6 left to right along the near rank, 7-11 doubling back.
# Fixed by INDEX and never by status (ADR-0008) - a stronghold that falls must
# not jump across the map.
TARGET_SIZE = 0.046
TARGETS = [
    (0.089, 0.378), (0.150, 0.157), (0.230, 0.352), (0.319, 0.174),
    (0.418, 0.324), (0.511, 0.153), (0.594, 0.341), (0.665, 0.126),
    (0.744, 0.318), (0.836, 0.144), (0.940, 0.293),
]


def sep_dist(ax, ay, bx, by):
    """Separation distance that KNOWS SPRITES ARE TALL.

    A sprite is anchored bottom-centre and is roughly twice as tall as it is
    wide, so one standing behind another is hidden by it even when their
    ground-contact points are a legal width apart. Plain distance said those two
    were fine; the render showed them overlapping.

    Weighting the depth axis DOWN means real vertical separation has to be about
    twice as large before it counts, which is what the art actually needs.
    """
    return math.hypot(ax - bx, (ay - by) * ASPECT * 0.5)


def dist(ax, ay, bx, by):
    """Distance in x-units, with y scaled so it is isotropic in image space."""
    return math.hypot(ax - bx, (ay - by) * ASPECT)


WATER_LEFT = {"convoyroad"}


def water_to_the_left(plate, anchors):
    """Which anchors have river within reach on their WEST side.

    Some art depicts terrain rather than just standing on it. The convoy-road
    sprite is a bridge; dropped on a dry platform it reads as a mistake no
    amount of good spacing can fix.
    """
    from PIL import Image
    import colorsys
    GW, GH = 320, 180
    px = Image.open(plate).convert("RGB").resize((GW, GH), Image.LANCZOS).load()
    wet = [[False] * GW for _ in range(GH)]
    for y in range(GH):
        for x in range(GW):
            r, g, b = px[x, y]
            wet[y][x] = b >= r + 8 and b >= g - 6
    ok = set()
    for i, a in enumerate(anchors):
        cy = int(a["y"] * GH)
        x0 = int(a["x"] * GW)
        for x in range(max(0, x0 - int(0.14 * GW)), x0):
            if any(wet[y][x] for y in range(max(0, cy - 6), min(GH, cy + 7))):
                ok.add(i)
                break
    return ok


def assign(anchors, wants):
    """Give each ROLE a region of the board, then fill it from that region.

    THE FIRST VERSION OF THIS SNAPPED EACH STRUCTURE TO THE ANCHOR NEAREST ITS
    AUTHORED COORDINATE, and it recreated the exact failure this whole rebuild
    was meant to end. When no platform exists near where a thing was authored,
    "nearest" quietly becomes "anywhere": one stronghold moved 1.067 across a
    board 2.04 wide - to the far side of the map - and the front stopped
    reading as a front. Snapping preserves LEGALITY while silently destroying
    COMPOSITION, which is what made every earlier map look scattered.

    So intent is expressed as REGIONS AND ORDERING rather than as coordinates:

        base        the one platform big enough, preferring the bottom-right
        front       the strongholds take the upper band, then are numbered
                    serpentine BY WHERE THEY ACTUALLY LANDED, so the campaign
                    reads left-to-right then back regardless of the terrain
        arcade      four well-spread platforms across the lower band
        facilities  whatever is closest to the base

    A structure can now only ever move within its own region, so a plate with
    platforms in different places yields a different-looking but still
    correctly-composed board. That is what makes this survive a reskin.
    """
    placed, failed = {}, []
    sites = {k: (s, dx, dy, g) for k, s, dx, dy, g in wants}
    wet = water_to_the_left(PLATE, anchors) if PLATE.exists() else set()
    free = sorted(range(len(anchors)), key=lambda i: -anchors[i]["r"])

    def take(i, key, size):
        free.remove(i)
        placed[key] = (anchors[i], size)

    def fits(i, size):
        a = anchors[i]
        return (a["r"] >= size / 2 * SLACK
                and all(sep_dist(a["x"], a["y"], p["x"], p["y"])
                        >= max((size + ps) / 2 * SEP, MIN_GAP)
                        for p, ps in placed.values()))

    # 1. BASE. The largest platform that works, tie-broken toward bottom-right.
    size = sites["basecamp"][0]
    cands = [i for i in free if fits(i, size)]
    if cands:
        top_r = max(anchors[i]["r"] for i in cands)
        take(max((i for i in cands if anchors[i]["r"] >= top_r * 0.9),
                 key=lambda i: anchors[i]["x"] + anchors[i]["y"]), "basecamp", size)
    else:
        failed.append(("basecamp", size, 0.815, 0.72))

    # 2. THE FRONT, from the upper band, biggest first so the forts get the
    #    strongest platforms; numbering comes afterwards.
    n_t = sum(1 for k in sites if k.startswith("__t"))
    won = []
    for i in list(free):
        if len(won) >= n_t:
            break
        if anchors[i]["y"] <= FRONT_Y and fits(i, TARGET_SIZE):
            won.append(i)
            take(i, f"__won{len(won)}", TARGET_SIZE)
    # Serpentine: split what was won into two ranks by y, near rank left to
    # right, far rank right to left. The advance reads as an advance.
    won.sort(key=lambda i: anchors[i]["y"])
    far, near = won[: len(won) // 2], won[len(won) // 2:]
    order = sorted(near, key=lambda i: anchors[i]["x"]) + \
        sorted(far, key=lambda i: -anchors[i]["x"])
    for n in range(1, len(won) + 1):
        placed.pop(f"__won{n}", None)
    for n, i in enumerate(order):
        placed[f"__t{n}"] = (anchors[i], TARGET_SIZE)
    for n in range(n_t):
        if f"__t{n}" not in placed:
            failed.append((f"__t{n}", TARGET_SIZE, 0.5, 0.25))

    # 3. THE ARCADE. Four platforms across the lower band, chosen for SPREAD -
    #    picking the four biggest would cluster them wherever the plate happens
    #    to be generous.
    games = [(k, sites[k][0]) for k in sites if sites[k][3] == "game"]
    lower = [i for i in free if anchors[i]["y"] > FRONT_Y]
    for n, (key, size) in enumerate(sorted(games, key=lambda g: sites[g[0]][1])):
        band = 0.5 + (n + 0.5) / len(games) * 0.5  # target x, evenly spaced
        cands = [i for i in lower if i in free and fits(i, size)]
        if key in WATER_LEFT:
            cands = [i for i in cands if i in wet] or cands
        if not cands:
            failed.append((key, size, band, 0.8))
            continue
        take(min(cands, key=lambda i: abs(anchors[i]["x"] - (n + 0.5) / len(games))),
             key, size)

    # 4. FACILITIES, nearest the base, smallest first so the big ones are not
    #    stranded by a small one taking the only platform that fits them.
    if "basecamp" in placed:
        bx, by = placed["basecamp"][0]["x"], placed["basecamp"][0]["y"]
    else:
        bx, by = 0.815, 0.72
    rest = [(k, sites[k][0]) for k in sites
            if k != "basecamp" and not k.startswith("__t") and sites[k][3] != "game"]
    for key, size in sorted(rest, key=lambda r: -r[1]):
        cands = [i for i in free if fits(i, size)]
        if not cands:
            failed.append((key, size, bx, by))
            continue
        take(min(cands, key=lambda i: dist(anchors[i]["x"], anchors[i]["y"], bx, by)),
             key, size)
    return placed, failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    if not ANCHORS.exists():
        sys.exit("no map-anchors.json - run: python map-anchors.py --debug")
    anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))["anchors"]

    wants = list(SITES) + [
        (f"__t{i}", TARGET_SIZE, x, y, "target") for i, (x, y) in enumerate(TARGETS)
    ]
    placed, failed = assign(anchors, wants)

    print(f"anchors    : {len(anchors)}")
    print(f"placed     : {len(placed)}/{len(wants)}")
    front = [placed[f"__t{i}"][0] for i in range(len(TARGETS)) if f"__t{i}" in placed]
    if front:
        print(f"front      : {len(front)} strongholds, "
              f"x {min(a['x'] for a in front):.2f}-{max(a['x'] for a in front):.2f}, "
              f"y {min(a['y'] for a in front):.2f}-{max(a['y'] for a in front):.2f}")
    games = [k for k in placed if k in ("convoyroad", "airfield", "arena", "ridgepass")]
    if games:
        xs = sorted(placed[k][0]["x"] for k in games)
        print(f"arcade     : {len(games)} places at x " + ", ".join(f"{x:.2f}" for x in xs))
    if failed:
        print("FAILED to place (no clearing big enough or all too close):")
        taken = {(p["x"], p["y"]) for p, _ps in placed.values()}
        free_r = max((a["r"] for a in anchors if (a["x"], a["y"]) not in taken),
                     default=0)
        for k, s, dx, dy in failed:
            print(f"  {k}  needs r>={s/2*SLACK:.4f}  largest FREE r={free_r:.4f}")

    # Tightest gap actually achieved, as a check on SEP rather than a promise.
    ks = list(placed)
    tight = None
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            a, sa = placed[ks[i]]
            b, sb = placed[ks[j]]
            gap = dist(a["x"], a["y"], b["x"], b["y"]) - (sa + sb) / 2
            if tight is None or gap < tight[0]:
                tight = (gap, ks[i], ks[j])
    if tight:
        print(f"tightest   : {tight[0]:+.4f} between {tight[1]} and {tight[2]}")

    if args.dry:
        return

    # A sprite anchors BOTTOM-CENTRE, so its ground-contact point sits below the
    # clearing's centre; otherwise the building floats in the upper half of its
    # own platform. r is an x-fraction, hence the aspect conversion.
    def contact(a):
        return a["x"], a["y"] + 0.10 * a["r"] * ASPECT

    sites_ts = "\n".join(
        f"  {k}: {{ x: {contact(p)[0]:.4f}, y: {contact(p)[1]:.4f} }},"
        for k, (p, _s) in placed.items() if not k.startswith("__t"))
    slots_ts = "\n".join(
        f"  {{ x: {contact(placed[f'__t{i}'][0])[0]:.4f}, y: {contact(placed[f'__t{i}'][0])[1]:.4f} }},"
        for i in range(len(TARGETS)) if f"__t{i}" in placed)

    OUT.write_text(f'''/**
 * GENERATED by `python map-place.py` - DO NOT HAND EDIT.
 *
 * Every position below is the centre of a STAGING AREA that map-anchors.py
 * measured on the painted plate, nudged down so the sprite's bottom-centre
 * ground-contact point lands in the lower half of the platform.
 *
 * ROADS, RIVERS AND BRIDGES ARE NOT HERE ANY MORE. They are painted into
 * bg-land.webp. Drawing vector ones on top drew a second, disagreeing network
 * over the first. The engine still supports them for a season whose plate has
 * none; this season's plate has them, so these stay empty.
 */
import type {{ Vec2 }} from "@/lib/world/types";

export const FIT_RIVERS: Vec2[][] = [];
export const FIT_ROADS: Vec2[][] = [];
export const FIT_CROSSINGS: Vec2[] = [];
export const FIT_TRACKS: Vec2[][] = [];
export const FIT_PADS: {{ x: number; y: number; r: number }}[] = [];

export const FIT_SITES: Record<string, Vec2> = {{
{sites_ts}
}};

export const FIT_SLOTS: Vec2[] = [
{slots_ts}
];
''', encoding="utf-8")
    print(f"-> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
