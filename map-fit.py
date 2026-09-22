#!/usr/bin/env python
"""
MAP FIT — resolve the world's geography ONCE, for both drawing and collision.

  python map-fit.py --debug

WHY THIS OWNS THE MEANDER
The road and river polylines authored in world.ts are straight between their
control points. Drawing them straight looks like lines ruled on a painting, so
they get a wander applied. The first attempt applied that wander in the RENDERER
only — and immediately reintroduced the bug the authored network was supposed to
kill: the drawn river sat up to 0.010 away from the river the placement code was
testing against, which is enough to slide a stronghold into the water while the
tool cheerfully reported "0 in a river".

So the wander is computed HERE, once, and the resolved lines are what both the
renderer draws and the placement checks. There is exactly one river.

It also derives the CROSSINGS by intersecting the resolved roads with the
resolved rivers, rather than trusting a hand-typed guess at where they meet.

OUTPUT  src/lib/s5/world.fit.ts
  FIT_ROADS / FIT_RIVERS   resolved polylines (drawn AND collided against)
  FIT_CROSSINGS            true road x river intersections
  FIT_SITES / FIT_SLOTS    placements that clear all of it
"""
import argparse
import colorsys
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
ART = ROOT / "public" / "s5-art" / "world"
SRC_TS = ROOT / "src" / "lib" / "s5" / "world.ts"
OUT_TS = ROOT / "src" / "lib" / "s5" / "world.fit.ts"

NL = chr(10)
ASPECT_Y = 9 / 16

RIVER_CLEAR = 0.042   # buildings stay this far off the water
ROAD_CLEAR = 0.020    # ... and off the carriageway
ROAD_REACH = 0.100    # ... but within this of one, so places look connected

# Wander amplitude. Kept SMALL and low-frequency: the first values made the
# lines zigzag, and ambient units following them swung back and forth like a
# metronome instead of driving.
RIVER_MEANDER = 0.007
ROAD_MEANDER = 0.0022

# Obstacle grid read off the plate.
OW, OH = 256, 144
OBSTACLE_PAD = 2


def read_obstacles():
    """Cells the plate has something solid painted on: tree clumps and any
    residual dark mass. Deliberately NOT used to find roads (see the module
    docstring); only to stop a building being dropped into a wood."""
    try:
        from PIL import Image
    except Exception:
        return set()
    plate = ART / "bg-land.webp"
    if not plate.exists():
        return set()
    im = Image.open(plate).convert("RGB").resize((OW, OH), Image.LANCZOS)
    px = im.load()
    hits = set()
    for y in range(OH):
        for x in range(OW):
            r, g, b = px[x, y]
            h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            # Tree canopy: green, saturated, and clearly darker than open ground.
            if 0.18 < h < 0.46 and sat > 0.30 and v < 0.52:
                hits.add((x, y))
    # Grow slightly so a building does not tuck under a canopy edge.
    grown = set()
    for (x, y) in hits:
        for dx in range(-OBSTACLE_PAD, OBSTACLE_PAD + 1):
            for dy in range(-OBSTACLE_PAD, OBSTACLE_PAD + 1):
                if 0 <= x + dx < OW and 0 <= y + dy < OH:
                    grown.add((x + dx, y + dy))
    return grown


def on_obstacle(p, obstacles):
    if not obstacles:
        return False
    x = int(p[0] * OW)
    y = int(p[1] * OH)
    return (max(0, min(OW - 1, x)), max(0, min(OH - 1, y))) in obstacles


# ── geometry ────────────────────────────────────────────────────────────────
def seg_dist(p, a, b):
    px, py = p[0], p[1] * ASPECT_Y
    ax, ay = a["x"], a["y"] * ASPECT_Y
    bx, by = b["x"], b["y"] * ASPECT_Y
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def poly_dist(p, lines):
    best = math.inf
    for line in lines:
        for a, b in zip(line, line[1:]):
            d = seg_dist(p, a, b)
            if d < best:
                best = d
    return best


def wobbler(seed):
    a = 12.9898 + seed * 0.017
    b = 78.233 + seed * 0.031
    c = 43.758 + seed * 0.011
    return lambda t: (math.sin(t * a) * 0.5 + math.sin(t * b * 0.37 + 1.7) * 0.32
                      + math.sin(t * c * 0.11 + 3.1) * 0.18)


def densify(pts, n):
    """Chaikin-round then resample evenly. Mirrors WorldTerrain exactly."""
    p = [[q["x"], q["y"]] for q in pts]
    for _ in range(3):
        if len(p) < 3:
            break
        o = [p[0]]
        for i in range(len(p) - 1):
            ax, ay = p[i]
            bx, by = p[i + 1]
            o.append([ax * .75 + bx * .25, ay * .75 + by * .25])
            o.append([ax * .25 + bx * .75, ay * .25 + by * .75])
        o.append(p[-1])
        p = o
    cum = [0.0]
    for i in range(1, len(p)):
        cum.append(cum[-1] + math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]))
    total = cum[-1] or 1.0
    out = []
    for k in range(n):
        d = (k / (n - 1)) * total
        i = 1
        while i < len(cum) - 1 and cum[i] < d:
            i += 1
        t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) or 1)
        out.append([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t,
                    p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t])
    return out


def meander(pts, amp, seed):
    w = wobbler(seed)
    n = len(pts)
    out = []
    for i, q in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        t = i / (n - 1)
        k = w(t * 6) * amp * math.sin(math.pi * t)
        out.append({"x": q[0] + (-dy / L) * k, "y": q[1] + (dx / L) * k})
    return out


def intersections(roads, rivers):
    """True crossing points, so a bridge is drawn where a road ACTUALLY meets
    water rather than where somebody guessed it would."""
    hits = []
    for road in roads:
        for a, b in zip(road, road[1:]):
            for river in rivers:
                for c, d in zip(river, river[1:]):
                    x1, y1, x2, y2 = a["x"], a["y"], b["x"], b["y"]
                    x3, y3, x4, y4 = c["x"], c["y"], d["x"], d["y"]
                    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
                    if abs(den) < 1e-12:
                        continue
                    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
                    u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
                    if 0 <= t <= 1 and 0 <= u <= 1:
                        p = {"x": x1 + t * (x2 - x1), "y": y1 + t * (y2 - y1)}
                        if all(math.hypot(p["x"] - h["x"], p["y"] - h["y"]) > 0.02 for h in hits):
                            hits.append(p)
    return hits


# ── parsing ─────────────────────────────────────────────────────────────────
def parse_ts():
    s = SRC_TS.read_text(encoding="utf-8")

    def block(name):
        m = re.search(name + r":\s*\[(.*?)\n  \]", s, re.S)
        if not m:
            return []
        out, cur = [], []
        for line in m.group(1).splitlines():
            if "[" in line:
                cur = []
            pt = re.search(r"x:\s*([0-9.]+),\s*y:\s*([0-9.]+)", line)
            if pt:
                cur.append({"x": float(pt.group(1)), "y": float(pt.group(2))})
            if "]" in line and cur:
                out.append(cur)
                cur = []
        if cur:
            out.append(cur)
        return out

    sites = []
    for m in re.finditer(
        r'key:\s*"([a-z]+)",\s*kind:\s*"([a-z]+)",.*?pos:\s*\{\s*x:\s*([0-9.]+),\s*y:\s*([0-9.]+)\s*\},[^"]*?size:\s*([0-9.]+)',
        s, re.S,
    ):
        sites.append({"key": m.group(1), "kind": m.group(2), "x": float(m.group(3)),
                      "y": float(m.group(4)), "size": float(m.group(5))})
    sm = re.search(r"targetSlots:\s*\[(.*?)\n  \]", s, re.S)
    slots = [{"x": float(a), "y": float(b)} for a, b in
             re.findall(r"x:\s*([0-9.]+),\s*y:\s*([0-9.]+)", sm.group(1) if sm else "")]
    tsize = float((re.search(r"targetSize:\s*([0-9.]+)", s) or [0, "0.058"])[1])
    return block("roads"), block("rivers"), sites, slots, tsize



# ── plots ───────────────────────────────────────────────────────────────────
# Spacing of plots ALONG a road, and how far back from the carriageway a
# building stands. Setback is what makes a row of buildings look deliberate
# rather than scattered: they all sit the same distance off the road.
PLOT_STEP = 0.014
SETBACK = 0.036


def make_plots(roads, rivers, obstacles):
    """Frontage plots down both sides of every road."""
    plots = []
    for ri, road in enumerate(roads):
        # Walk by accumulated distance so plots are evenly spaced in space,
        # not evenly spaced in however densely that road was authored.
        acc = 0.0
        last = None
        for i in range(1, len(road)):
            a, b = road[i - 1], road[i]
            dx, dy = b["x"] - a["x"], (b["y"] - a["y"]) * ASPECT_Y
            seg = math.hypot(dx, dy)
            if seg <= 0:
                continue
            acc += seg
            if last is not None and acc - last < PLOT_STEP:
                continue
            last = acc
            nx, ny = -dy / seg, dx / seg
            for side in (-1, 1):
                q = (b["x"] + nx * SETBACK * side,
                     b["y"] + (ny * SETBACK * side) / ASPECT_Y)
                if not (0.035 <= q[0] <= 0.965 and 0.10 <= q[1] <= 0.885):
                    continue
                if rivers and poly_dist(q, rivers) < RIVER_CLEAR:
                    continue
                if poly_dist(q, roads) < ROAD_CLEAR:
                    continue
                if on_obstacle(q, obstacles):
                    continue
                plots.append({"x": q[0], "y": q[1], "frontage": True})

    # SECOND TIER: open ground. Road frontage alone does not have the capacity
    # for a full board - each placement deletes every plot inside its clearance,
    # so two dozen buildings exhaust a few hundred metres of verge and the rest
    # fall back to their illegal hints. These open plots are ranked WORSE than
    # frontage (see assign), so they are only ever used once the verge is full,
    # but they guarantee everything gets somewhere legal.
    step = 0.026
    y = 0.11
    while y < 0.88:
        x = 0.04
        while x < 0.96:
            q = (x, y)
            if (not (rivers and poly_dist(q, rivers) < RIVER_CLEAR)
                    and poly_dist(q, roads) >= ROAD_CLEAR
                    and not on_obstacle(q, obstacles)):
                plots.append({"x": x, "y": y, "frontage": False})
            x += step
        y += step * 1.6
    return plots




def nearest_on_roads(q, roads):
    """Closest point on any road to q, for running a track to it."""
    best, bp = None, None
    for road in roads:
        for a, b in zip(road, road[1:]):
            ax, ay = a["x"], a["y"] * ASPECT_Y
            bx, by = b["x"], b["y"] * ASPECT_Y
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy
            t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((q[0] - ax) * dx + (q[1] * ASPECT_Y - ay) * dy) / L2))
            px, py = ax + t * dx, ay + t * dy
            d = math.hypot(q[0] - px, q[1] * ASPECT_Y - py)
            if best is None or d < best:
                best, bp = d, (px, py / ASPECT_Y)
    return bp, (best or 0.0)


def make_pads_and_tracks(items, roads):
    """A worn pad for every building, and a track from it to the nearest road."""
    pads, tracks = [], []
    for it in items:
        q = (it["x"], it["y"])
        # Pad a little wider than the footprint, so trodden ground shows around
        # the walls rather than stopping exactly at them.
        pads.append({"x": q[0], "y": q[1], "r": round(it["size"] * 0.62 + 0.010, 4)})
        tgt, dist = nearest_on_roads(q, roads)
        # No track if the building already sits on the road, and none if the
        # road is so far that the spur would read as a second road.
        if tgt is None or dist < 0.012 or dist > 0.16:
            continue
        # Slight sag toward the pad so the spur curves in rather than spearing.
        mx = (q[0] + tgt[0]) / 2 + (tgt[1] - q[1]) * 0.06
        my = (q[1] + tgt[1]) / 2 + (q[0] - tgt[0]) * 0.06
        tracks.append([
            {"x": round(q[0], 4), "y": round(q[1], 4)},
            {"x": round(mx, 4), "y": round(my, 4)},
            {"x": round(tgt[0], 4), "y": round(tgt[1], 4)},
        ])
    return pads, tracks


def walk_road(road, n, t0=0.10, t1=0.90):
    """n evenly-spaced points along a road, by DISTANCE, between t0 and t1."""
    acc = [0.0]
    for i in range(1, len(road)):
        acc.append(acc[-1] + math.hypot(road[i]["x"] - road[i - 1]["x"],
                                        (road[i]["y"] - road[i - 1]["y"]) * ASPECT_Y))
    total = acc[-1] or 1.0
    out = []
    for k in range(n):
        f = t0 + (t1 - t0) * (k / max(1, n - 1))
        d = f * total
        i = 1
        while i < len(acc) - 1 and acc[i] < d:
            i += 1
        seg = (acc[i] - acc[i - 1]) or 1
        t = (d - acc[i - 1]) / seg
        a, b = road[i - 1], road[i]
        px = a["x"] + (b["x"] - a["x"]) * t
        py = a["y"] + (b["y"] - a["y"]) * t
        dx, dy = b["x"] - a["x"], (b["y"] - a["y"]) * ASPECT_Y
        L = math.hypot(dx, dy) or 1
        out.append((px, py, -dy / L, dx / L))
    return out


def place_sequence(items, road, roads, rivers, obstacles, offset, t0=0.10, t1=0.90, alternate=True):
    """March items along a road at an even stride, alternating sides.

    This is what makes a line of strongholds read as a FRONT rather than as
    scatter: equal stride, consistent setback, and a regular alternation that
    the eye picks up immediately.
    """
    pts = walk_road(road, len(items), t0, t1)
    for i, it in enumerate(items):
        px, py, nx, ny = pts[i]
        side = (1 if i % 2 == 0 else -1) if alternate else 1
        # Try the intended side first, then the other, then step the setback out.
        for mult in (1.0, 1.35, 1.75, 2.2):
            for sd in ([side, -side] if alternate else [side]):
                q = (px + nx * offset * mult * sd,
                     py + (ny * offset * mult * sd) / ASPECT_Y)
                if ok(q, roads, rivers, False, it["size"], obstacles):
                    it["x"], it["y"] = q
                    it["_done"] = True
                    break
            if it.get("_done"):
                break
    return [it for it in items if it.get("_done")], [it for it in items if not it.get("_done")]


def place_cluster(items, centre, roads, rivers, obstacles, radius):
    """Pack items tightly around a point, rings outward, biggest in the middle.

    Golden-angle rings so nothing lines up in an obvious spoke, and a small
    radius so the group reads as ONE place rather than several.
    """
    GOLD = math.pi * (3 - math.sqrt(5))
    done, fail = [], []
    for i, it in enumerate(sorted(items, key=lambda x: -x["size"])):
        if i == 0:
            cand = [centre]
        else:
            cand = []
            for ring in range(1, 7):
                r = radius * (0.42 + 0.30 * ring)
                for k in range(9):
                    a = (i * GOLD) + k * (2 * math.pi / 9)
                    cand.append((centre[0] + math.cos(a) * r,
                                 centre[1] + math.sin(a) * r / ASPECT_Y))
        got = None
        for q in cand:
            if not ok(q, roads, rivers, False, it["size"], obstacles):
                continue
            if any(math.hypot(q[0] - d["x"], (q[1] - d["y"]) * ASPECT_Y)
                   < (it["sep"] + d["sep"]) * 0.86 for d in done):
                continue
            got = q
            break
        if got:
            it["x"], it["y"] = got
            it["_done"] = True
            done.append(it)
        else:
            fail.append(it)
    return done, fail


def assign(items, plots, obstacles, rivers, roads):
    """Give each item the best free plot near where it belongs.

    Largest first: a big camp has the fewest plots that can hold it, so it must
    choose before the small huts eat the open ground. After each placement every
    plot inside that item's clearance is deleted, which is what makes overlap
    impossible rather than merely discouraged.

    THE DRIFT LEASH. Nearest-free-plot on its own loses the geography:
    strongholds wander off the front and the arcade ends up in the mountains,
    because "nearest" knows nothing about a place BELONGING somewhere. So the
    authored anchor is a preference with a leash - a building may only take a
    plot within `lim` of it, and the leash lengthens only if nothing nearer
    works. That keeps the season's intended layout while leaving the algorithm
    free to solve the packing.
    """
    free = list(plots)
    placed = []
    unplaced = []
    for it in sorted(items, key=lambda i: -i["size"]):
        wx, wy = it["x"], it["y"]
        chosen_i = -1
        for lim in (0.11, 0.17, 0.26, 0.40, 99.0):
            best = None
            for i, pl in enumerate(free):
                d = math.hypot(pl["x"] - wx, (pl["y"] - wy) * ASPECT_Y)
                if d > lim:
                    continue
                if not ok((pl["x"], pl["y"]), roads, rivers, False, it["size"], obstacles):
                    continue
                score = d + (0.0 if pl.get("frontage") else 0.14)
                if best is None or score < best:
                    best, chosen_i = score, i
            if chosen_i >= 0:
                break
        if chosen_i < 0:
            unplaced.append(it)
            continue
        chosen = free.pop(chosen_i)
        it["x"], it["y"] = chosen["x"], chosen["y"]
        placed.append(it)
        free = [pl for pl in free
                if math.hypot(pl["x"] - it["x"], (pl["y"] - it["y"]) * ASPECT_Y) >= it["sep"]]
    return placed, unplaced


# ── placement ───────────────────────────────────────────────────────────────
def footprint(p, size):
    """The ground a bottom-centre-anchored sprite actually covers. Testing only
    the anchor let a fort stand with half its wall across a road."""
    hw, hd = size * 0.5, size * 0.26
    return [(x, y)
            for x in (p[0] - hw, p[0] - hw * .5, p[0], p[0] + hw * .5, p[0] + hw)
            for y in (p[1] - hd, p[1], p[1] + hd * .4)]


def ok(p, roads, rivers, need_road=True, size=0.0, obstacles=None):
    if not (0.03 <= p[0] <= 0.97 and 0.09 <= p[1] <= 0.90):
        return False
    for q in (footprint(p, size) if size else [p]):
        if rivers and poly_dist(q, rivers) < RIVER_CLEAR:
            return False
        if roads and poly_dist(q, roads) < ROAD_CLEAR:
            return False
        if on_obstacle(q, obstacles):
            return False
    if roads and need_road and poly_dist(p, roads) > ROAD_REACH:
        return False
    return True


def settle(p, roads, rivers, size=0.0, obstacles=None):
    for need_road in (True, False):
        if ok(p, roads, rivers, need_road, size, obstacles):
            return p
        for step in range(1, 90):
            rad = step * 0.006
            for k in range(24):
                a = k * math.pi / 12
                q = (p[0] + math.cos(a) * rad, p[1] + math.sin(a) * rad / ASPECT_Y)
                if ok(q, roads, rivers, need_road, size, obstacles):
                    return q
    return None


def relax(items, roads, rivers, obstacles=None, rounds=110):
    for _ in range(rounds):
        moved = False
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                a, b = items[i], items[j]
                dx = b["x"] - a["x"]
                dy = (b["y"] - a["y"]) * ASPECT_Y
                d = math.hypot(dx, dy) or 1e-4
                need = (a["sep"] + b["sep"]) / 2
                if d < need:
                    push = (need - d) / 2
                    ux, uy = dx / d, dy / d
                    for s, sign in ((a, -1), (b, 1)):
                        for frac in (1.0, 0.6, 0.35, 0.18):
                            nx = s["x"] + sign * ux * push * frac
                            ny = s["y"] + sign * uy * push * frac / ASPECT_Y
                            if ok((nx, ny), roads, rivers, False, s.get("size", 0.0), obstacles):
                                s["x"], s["y"] = nx, ny
                                break
                    moved = True
        if not moved:
            break
    return items


def fmt_line(line):
    pts = ("," + NL).join('    { x: %.4f, y: %.4f }' % (q["x"], q["y"]) for q in line)
    return "  [" + NL + pts + "," + NL + "  ]"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    a_roads, a_rivers, sites, slots, tsize = parse_ts()
    if not a_roads:
        sys.exit("no roads parsed from world.ts")

    # RESOLVE the network once. These are the lines that get drawn AND collided.
    rivers = [meander(densify(r, 160), RIVER_MEANDER, 91 + i) for i, r in enumerate(a_rivers)]
    roads = [meander(densify(r, 190), ROAD_MEANDER, 17 + i) for i, r in enumerate(a_roads)]
    crossings = intersections(roads, rivers)
    print(f"resolved {len(roads)} roads, {len(rivers)} rivers, {len(crossings)} true crossings")

    obstacles = read_obstacles()
    print(f"plate obstacles: {len(obstacles)} cells of {OW*OH}")

    # AUTHORED LAYOUT: positions come from world.ts as designed, and this only
    # checks them. Solving for positions produced legal-but-ugly boards six
    # times running; a designer places them and the tool reports problems.
    for s_ in sites:
        s_["sep"] = s_["size"] * 1.10 + 0.016
    for t in slots:
        t["size"] = tsize
        t["sep"] = tsize * 1.10 + 0.016
    everything = sites + slots
    fs, ft = sites, slots
    pads, tracks = [], []
    problems = []
    # BOUNDED NUDGE. The authored layout is the design and must survive, but it
    # was composed without knowing where the trees and water actually are. So
    # each position is allowed to move by the MINIMUM needed to get clear, and
    # no further: a small local correction rather than a global re-solve. Under
    # a hard cap, so nothing can quietly wander out of the arrangement.
    NUDGE_MAX = 0.045

    def clean(q, size):
        for f in footprint(q, size):
            if rivers and poly_dist(f, rivers) < RIVER_CLEAR:
                return False
            if on_obstacle(f, obstacles):
                return False
        return True

    moved = 0
    for it in everything:
        if clean((it["x"], it["y"]), it["size"]):
            continue
        best = None
        r = 0.006
        while r <= NUDGE_MAX and best is None:
            for k in range(24):
                a = k * math.pi / 12
                q = (it["x"] + math.cos(a) * r, it["y"] + math.sin(a) * r / ASPECT_Y)
                if clean(q, it["size"]):
                    best = q
                    break
            r += 0.006
        if best:
            it["x"], it["y"] = best
            moved += 1
        else:
            problems.append(f'{it.get("key", "stronghold")} cannot clear water/trees')
    print(f"  nudged clear     : {moved} (cap {NUDGE_MAX})")
    pads, tracks = make_pads_and_tracks(everything, roads)
    print(f"  pads/tracks      : {len(pads)} pads, {len(tracks)} tracks")

    def worst_d(q, lines):
        return min(poly_dist(f, lines) for f in footprint((q["x"], q["y"]), q.get("size", 0.0)))

    in_river = sum(1 for q in everything if rivers and worst_d(q, rivers) < RIVER_CLEAR)
    on_road = 0  # buildings on roads are intentional now
    near = sum(1 for q in everything if poly_dist((q["x"], q["y"]), roads) <= ROAD_REACH)
    in_trees = sum(1 for q in everything
                   if any(on_obstacle(f, obstacles) for f in footprint((q["x"], q["y"]), q.get("size", 0.0))))
    gap = min((math.hypot(a["x"] - b["x"], (a["y"] - b["y"]) * ASPECT_Y) - (a["sep"] + b["sep"]) / 2)
              for i, a in enumerate(everything) for b in everything[i + 1:])

    hdr = ("/**" + NL
           + " * GENERATED by `python map-fit.py` - DO NOT HAND EDIT." + NL
           + " *" + NL
           + " * The RESOLVED world geography. The wander that makes roads and rivers" + NL
           + " * look painted is applied HERE, once, so the lines the renderer draws" + NL
           + " * and the lines placement is tested against are the same lines. Applying" + NL
           + " * it in the renderer alone put the drawn river up to 0.010 away from the" + NL
           + " * collided one, which was enough to stand a fort in the water." + NL
           + " */" + NL
           + 'import type { Vec2 } from "@/lib/world/types";' + NL + NL)

    body = ("export const FIT_RIVERS: Vec2[][] = [" + NL
            + ("," + NL).join(fmt_line(r) for r in rivers) + "," + NL + "];" + NL + NL
            + "export const FIT_ROADS: Vec2[][] = [" + NL
            + ("," + NL).join(fmt_line(r) for r in roads) + "," + NL + "];" + NL + NL
            + "export const FIT_CROSSINGS: Vec2[] = [" + NL
            + ("," + NL).join('  { x: %.4f, y: %.4f }' % (c["x"], c["y"]) for c in crossings)
            + ("," + NL if crossings else "") + "];" + NL + NL
            + "export const FIT_SITES: Record<string, Vec2> = {" + NL
            + ("," + NL).join('  %s: { x: %.4f, y: %.4f }' % (s["key"], s["x"], s["y"]) for s in fs)
            + "," + NL + "};" + NL + NL
            + "export const FIT_PADS: Array<Vec2 & { r: number }> = [" + NL
            + ("," + NL).join('  { x: %.4f, y: %.4f, r: %.4f }' % (d["x"], d["y"], d["r"]) for d in pads)
            + "," + NL + "];" + NL + NL
            + "export const FIT_TRACKS: Vec2[][] = [" + NL
            + ("," + NL).join(fmt_line(t) for t in tracks)
            + ("," + NL if tracks else "") + "];" + NL + NL
            + "export const FIT_SLOTS: Vec2[] = [" + NL
            + ("," + NL).join('  { x: %.4f, y: %.4f }' % (t["x"], t["y"]) for t in ft)
            + "," + NL + "];" + NL)

    OUT_TS.write_text(hdr + body, encoding="utf-8")

    print(f"  in a river      : {in_river}   (want 0)")
    print(f"  straddling road : {on_road}   (want 0)")
    print(f"  standing in trees: {in_trees}   (want 0)")
    print(f"  within reach    : {near}/{len(everything)}")
    print(f"  tightest gap    : {gap:+.4f} (want >= 0)")
    for p in problems:
        print("  WARNING could not place:", p)
    print(f"-> {OUT_TS}")


if __name__ == "__main__":
    main()
