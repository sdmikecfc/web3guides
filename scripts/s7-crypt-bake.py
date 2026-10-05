# -*- coding: utf-8 -*-
"""S7 CRYPT wall-perspective bake: flat seamless wall paintings -> pre-baked
keyed WebP corridor pieces + meta.json for the Canvas 2D dungeon renderer.

WHY THIS EXISTS. CRYPT is a grid crawler in the Eye of the Beholder /
Grimrock mould, but the runtime is Canvas 2D and must NEVER do 3D math on a
phone every frame. So the perspective is baked HERE, once: every wall the
player can see in a centered 1-cell corridor is pre-warped into a keyed WebP
piece, and the renderer just drawImage()s pieces painter's-order back to
front with flat rgba fog fills between depth slices. The renderer is
data-driven from day one: it reads walls/meta.json for the exact pixel rect
of every piece, so retuning the geometry means re-running this script, not
touching runtime code.

GEOMETRY. 800x600 design viewport, vanishing point dead center (400,300).
A "plane" is a corridor cross-section at a cell boundary; plane k is scaled
by PLANES[k] about the vanishing point:

    plane   scale   rect (x,y,w,h)
    0       1.00    (  0,   0, 800, 600)   player cell edge = screen edge
    1       0.62    (152, 114, 496, 372)
    2       0.40    (240, 180, 320, 240)
    3       0.27    (292, 219, 216, 162)
    4       0.19    (324, 243, 152, 114)   far cap; fill fog beyond this

The ladder shrinks faster than a true camera would (a real projection would
give ~1.0/.62/.45/.35): that is deliberate EOB drama, tuned so the pieces
nest without the far cells collapsing to nothing. Per depth z in 0..3 we
emit, for every wall variant:

  FRONT z  - the flat texture resized to plane rect z (a wall right in the
             player's face at z0 fills the whole screen).
  LEFT z   - the left side wall of cell z, spanning plane z -> z+1. Baked
             with the classic vertical-strip fake done properly: each 1px
             destination column is one strip; column height is linear in x
             (exact for a vertical wall: screen scale s=(vp.x - x)/vp.x),
             while the texture u for the strip is sampled hyperbolically
             (u ~ 1/s), i.e. per-column perspective-correct texturing.
             Column ends carry fractional-coverage alpha so the diagonal
             edges are antialiased and never sparkle against the plates.
  RIGHT    - NOT emitted. The runtime mirrors LEFT horizontally and draws it
             at x = viewport.w - (x + w). The bake keeps side shading flat
             (0.80 of the front brightness, lit-from-the-player look) so the
             mirror is exact and no cross-slice gradient can seam.

Plus one FLOOR and one CEILING plate per floor/ceiling variant: the same
strip shear rotated 90 degrees (1px rows), running plane 0 -> plane 4, with
the texture tiling once per cell so a grid painted on the flat lands on the
real cell boundaries.

FOG LADDER (runtime contract, baked into the proof): dark-blue-grey
rgba(22,26,36) fills drawn far-to-near over the OPENING rect of each plane:
alpha 0.40 over plane 3 after ALL slice-3 content (side z3, and a closing
front wall at z3 counts as slice-3 content), 0.25 over plane 2, 0.12 over
plane 1, nothing at z0. Fills stack, so the deepest wall sits under
.40+.25+.12 (about 60% attenuated) and the falloff reads continuous
without any per-piece tinting. Proven in iteration: fogging the closing
wall only .25+.12 left it as bright as the near walls and the depth died.

INPUT. public/s7-art/crypt/_flat/ holding 1024px seamless flats named
wall-*.png, floor-*.png, ceiling-*.png. If the directory is missing or a
category is absent the script GENERATES grey placeholders (flat #666 brick
grid wall-a + #555 wall-b, flagstone floor, slab ceiling) so the tool and
the day-3 composition gate never wait on painted art. decal-*.png files are
accepted but ignored for now: decals ship later as separate keyed pieces.

OUTPUT. public/s7-art/crypt/walls/*.webp + walls/meta.json, and the proof
composite public/s7-art/crypt/_proof-corridor.png: a full closed corridor
(ceiling + floor + left/right sides z0..z3 + front wall at z3 + fog ladder)
composed purely from the baked pieces, exactly as the runtime would.

  python scripts/s7-crypt-bake.py            bake stale pieces + proof
  python scripts/s7-crypt-bake.py --force    rebake everything
  python scripts/s7-crypt-bake.py --verify   check outputs + geometry, write nothing

Idempotent: a piece is skipped when newer than both its source flat and this
script (geometry lives here, so editing the ladder invalidates everything).
"""
import argparse
import json
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
CRYPT = os.path.join(ROOT, "public", "s7-art", "crypt")
FLAT = os.path.join(CRYPT, "_flat")
OUT = os.path.join(CRYPT, "walls")
META = os.path.join(OUT, "meta.json")
PROOF = os.path.join(CRYPT, "_proof-corridor.png")

VIEW_W, VIEW_H = 800, 600
VPX, VPY = VIEW_W // 2, VIEW_H // 2
PLANES = [1.00, 0.62, 0.40, 0.27, 0.19]   # cross-section scale at cell boundaries
DEPTHS = 4                                # z0..z3 front+left pieces
SIDE_SHADE = 0.80                         # sides lit dimmer than fronts, flat
FOG_RGB = (22, 26, 36)                    # dark-blue-grey
FOG_LADDER = [(1, 0.12), (2, 0.25), (3, 0.40)]  # (plane opening, alpha), stacking
WEBP_Q = 90
TILE = 1024


def plane_rect(s):
    """Pixel rect of the corridor cross-section at scale s, centered on VP."""
    w, h = round(VIEW_W * s), round(VIEW_H * s)
    return (VPX - w // 2, VPY - h // 2, w, h)


PLANE_RECTS = [plane_rect(s) for s in PLANES]


# ---------------------------------------------------------------- placeholders

def _noise(im, amp, seed):
    rng = np.random.default_rng(seed)
    a = np.asarray(im, dtype=np.int16)
    a[..., :3] = np.clip(a[..., :3] + rng.integers(-amp, amp + 1, a[..., :3].shape), 0, 255)
    return Image.fromarray(a.astype(np.uint8))


def _blocks(base, mortar_drop, bw, bh, jitter, seed, stagger=True):
    """Grey block grid (bricks / flagstones / slabs) with bevels + jitter."""
    rnd = random.Random(seed)
    im = Image.new("RGB", (TILE, TILE), (base - mortar_drop,) * 3)
    d = ImageDraw.Draw(im)
    m = 6  # mortar gap
    for row in range(TILE // bh):
        off = (bw // 2) if (stagger and row % 2) else 0
        for x0 in range(-bw, TILE + bw, bw):
            x, y = x0 + off, row * bh
            v = max(0, min(255, base + rnd.randint(-jitter, jitter)))
            d.rectangle([x + m, y + m, x + bw - m, y + bh - m], fill=(v,) * 3)
            d.rectangle([x + m, y + m, x + bw - m, y + m + 2], fill=(min(255, v + 10),) * 3)
            d.rectangle([x + m, y + bh - m - 2, x + bw - m, y + bh - m], fill=(max(0, v - 12),) * 3)
    return _noise(im, 4, seed)


def gen_placeholders(have):
    """Fill any missing flat category with deterministic grey placeholders."""
    made = []
    plan = {
        "wall": [("wall-a.png", lambda: _blocks(0x66, 18, 256, 128, 7, 71)),
                 ("wall-b.png", lambda: _blocks(0x55, 16, 256, 128, 7, 72))],
        "floor": [("floor-a.png", lambda: _blocks(0x52, 14, 256, 256, 8, 73, stagger=False))],
        "ceiling": [("ceiling-a.png", lambda: _blocks(0x44, 12, 512, 256, 6, 74))],
    }
    os.makedirs(FLAT, exist_ok=True)
    for cat, items in plan.items():
        if have.get(cat):
            continue
        for name, make in items:
            path = os.path.join(FLAT, name)
            if not os.path.exists(path):
                make().save(path)
                made.append(name)
            have.setdefault(cat, []).append(name)
    if made:
        print("placeholder flats generated:", ", ".join(made))


def scan_flats():
    have = {"wall": [], "floor": [], "ceiling": []}
    if os.path.isdir(FLAT):
        for f in sorted(os.listdir(FLAT)):
            for cat in have:
                if f.startswith(cat + "-") and f.lower().endswith(".png"):
                    have[cat].append(f)
    gen_placeholders(have)
    return have


# ------------------------------------------------------------ sampling helpers

def _cumsum_axis(a, axis):
    """Prefix-sum with a leading zero so integral lookups are one subtraction."""
    pad = [(1, 0) if i == axis else (0, 0) for i in range(a.ndim)]
    return np.pad(np.cumsum(a, axis=axis, dtype=np.float64), pad)


def _box_avg(cs, src, a, b, axis):
    """Box-filtered average of `src` over the float range [a,b] along axis.

    cs = _cumsum_axis(src, axis). a/b in pixel units, 0..N, a < b.
    Exact fractional integration: handles both magnification and the heavy
    minification at the far end of a strip without aliasing.
    """
    n = src.shape[axis]
    a = np.clip(a, 0.0, n)
    b = np.clip(b, a + 1e-6, n)

    def integ(x):
        ix = np.minimum(x.astype(np.int64), n - 1)
        fx = x - ix
        base = np.take(cs, ix, axis=axis)
        part = np.take(src, ix, axis=axis) * (fx if src.ndim == 1 else fx[..., None])
        return base + part

    return (integ(b) - integ(a)) / ((b - a) if src.ndim == 1 else (b - a)[..., None])


def _cell_t(s, s_near, s_far):
    """Perspective-correct position within one cell: screen scale -> 0..1."""
    u, u0, u1 = 1.0 / s, 1.0 / s_near, 1.0 / s_far
    return np.clip((u - u0) / (u1 - u0), 0.0, 1.0)


# ------------------------------------------------------------------ piece bake

def bake_front(flat, z):
    x, y, w, h = PLANE_RECTS[z]
    return flat.resize((w, h), Image.LANCZOS).convert("RGBA")


def bake_left(flat, z):
    """Left side wall of cell z: vertical strips from plane z to plane z+1."""
    src = np.asarray(flat.convert("RGB"), dtype=np.float64)
    th, tw = src.shape[:2]
    cs_x = _cumsum_axis(src, 1)

    s_near, s_far = PLANES[z], PLANES[z + 1]
    bx, by, bw, bh = PLANE_RECTS[z][0], PLANE_RECTS[z][1], \
        PLANE_RECTS[z + 1][0] - PLANE_RECTS[z][0], PLANE_RECTS[z][3]
    out = np.zeros((bh, bw, 4), dtype=np.float64)

    cs_col_cache = None
    for i in range(bw):
        xa, xb = bx + i, bx + i + 1.0            # this destination column
        sa, sb = (VPX - xa) / VPX, (VPX - xb) / VPX
        ta, tb = _cell_t(sa, s_near, s_far), _cell_t(sb, s_near, s_far)
        col = _box_avg(cs_x, src, np.float64(ta * tw), np.float64(tb * tw), 1)  # (th,3)

        s_c = (VPX - (xa + 0.5)) / VPX           # column center scale
        col_h = VIEW_H * s_c
        top = VPY * (s_near - s_c)               # float offset inside bbox
        j0, j1 = int(np.floor(top)), int(np.ceil(top + col_h))
        j1 = min(j1, bh)
        rows = np.arange(j0, j1, dtype=np.float64)
        cover = np.minimum(rows + 1, top + col_h) - np.maximum(rows, top)
        cover = np.clip(cover, 0.0, 1.0)
        va = (np.maximum(rows, top) - top) / col_h * th
        vb = (np.minimum(rows + 1, top + col_h) - top) / col_h * th
        cs_y = _cumsum_axis(col, 0)
        rgb = _box_avg(cs_y, col, va, vb, 0) * SIDE_SHADE
        out[j0:j1, i, :3] = rgb
        out[j0:j1, i, 3] = cover * 255.0

    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), "RGBA")


def bake_plate(flat, kind):
    """Floor/ceiling plate: horizontal strips, plane 0 -> plane 4, texture
    tiling once per cell so painted grids land on real cell boundaries."""
    src = np.asarray(flat.convert("RGB"), dtype=np.float64)
    th, tw = src.shape[:2]
    cs_y = _cumsum_axis(src, 0)

    plate_h = VIEW_H - (PLANE_RECTS[-1][1] + PLANE_RECTS[-1][3]) if kind == "floor" else PLANE_RECTS[-1][1]
    out = np.zeros((plate_h, VIEW_W, 4), dtype=np.float64)

    for j in range(plate_h):
        if kind == "floor":
            ya = (PLANE_RECTS[-1][1] + PLANE_RECTS[-1][3]) + j   # abs y of row top
            sa, sb = (ya - VPY) / VPY, (ya + 1 - VPY) / VPY
        else:
            ya = j
            sa, sb = (VPY - ya) / VPY, (VPY - (ya + 1)) / VPY
        s_c = 0.5 * (sa + sb)
        s_c = min(max(s_c, PLANES[-1]), PLANES[0])
        z = next(k for k in range(len(PLANES) - 1)
                 if PLANES[k + 1] <= s_c <= PLANES[k] + 1e-9)
        s_near, s_far = PLANES[z], PLANES[z + 1]
        ta = _cell_t(min(max(abs(sa), s_far), s_near), s_near, s_far)
        tb = _cell_t(min(max(abs(sb), s_far), s_near), s_near, s_far)
        lo, hi = (ta, tb) if ta <= tb else (tb, ta)
        row = _box_avg(cs_y, src, np.float64(lo * th), np.float64(max(hi, lo + 1e-4) * th), 0)  # (tw,3)

        row_w = VIEW_W * s_c
        left = VPX - row_w / 2.0
        i0, i1 = int(np.floor(left)), min(int(np.ceil(left + row_w)), VIEW_W)
        cols = np.arange(i0, i1, dtype=np.float64)
        cover = np.clip(np.minimum(cols + 1, left + row_w) - np.maximum(cols, left), 0, 1)
        ua = (np.maximum(cols, left) - left) / row_w * tw
        ub = (np.minimum(cols + 1, left + row_w) - left) / row_w * tw
        cs_row = _cumsum_axis(row, 0)
        rgb = _box_avg(cs_row, row, ua, ub, 0)
        out[j, i0:i1, :3] = rgb
        out[j, i0:i1, 3] = cover * 255.0

    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), "RGBA")


def plate_rect(kind):
    top4, h4 = PLANE_RECTS[-1][1], PLANE_RECTS[-1][3]
    if kind == "floor":
        return (0, top4 + h4, VIEW_W, VIEW_H - (top4 + h4))
    return (0, 0, VIEW_W, top4)


# ------------------------------------------------------------------ meta/proof

def piece_rects():
    ps = []
    for z in range(DEPTHS):
        fx, fy, fw, fh = PLANE_RECTS[z]
        ps.append({"z": z, "kind": "front", "x": fx, "y": fy, "w": fw, "h": fh})
        lx, ly = PLANE_RECTS[z][0], PLANE_RECTS[z][1]
        lw, lh = PLANE_RECTS[z + 1][0] - lx, PLANE_RECTS[z][3]
        ps.append({"z": z, "kind": "left", "x": lx, "y": ly, "w": lw, "h": lh})
    return ps


def write_meta(have):
    meta = {
        "viewport": {"w": VIEW_W, "h": VIEW_H},
        "vanishingPoint": {"x": VPX, "y": VPY},
        "planes": [{"z": i, "scale": PLANES[i], "rect": list(PLANE_RECTS[i])}
                   for i in range(len(PLANES))],
        "pieces": piece_rects(),
        "filePattern": "{variant}-z{z}-{kind}.webp",
        "right": "mirror of left: flip horizontally, draw at x = viewport.w - (x + w)",
        "plates": {
            "floor": {"rect": list(plate_rect("floor")), "filePattern": "{variant}-plate.webp"},
            "ceiling": {"rect": list(plate_rect("ceiling")), "filePattern": "{variant}-plate.webp"},
        },
        "capRect": list(PLANE_RECTS[-1]),
        "fog": {
            "color": list(FOG_RGB),
            "steps": [{"overPlane": p, "alpha": a, "rect": list(PLANE_RECTS[p])}
                      for p, a in FOG_LADDER],
            "order": "paint far to near; fill each fog step over its plane opening "
                     "after ALL of that slice's content (a closing front wall at z "
                     "is slice-z content and goes under the plane-z fog step) and "
                     "before the nearer slice's pieces",
        },
        "variants": {k: [os.path.splitext(f)[0] for f in v] for k, v in have.items()},
    }
    with open(META, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    return meta


def _fog_fill(canvas, rect, alpha):
    x, y, w, h = rect
    layer = Image.new("RGBA", (w, h), FOG_RGB + (round(alpha * 255),))
    canvas.alpha_composite(layer, (x, y))


def _paste(canvas, im, xy):
    canvas.alpha_composite(im, xy)


def compose_proof(have):
    """Closed 4-deep corridor from the baked pieces, exactly runtime order."""
    wall = os.path.splitext(have["wall"][0])[0]
    floor = os.path.splitext(have["floor"][0])[0]
    ceil = os.path.splitext(have["ceiling"][0])[0]
    L = lambda n: Image.open(os.path.join(OUT, n)).convert("RGBA")

    view = Image.new("RGBA", (VIEW_W, VIEW_H), FOG_RGB + (255,))
    _paste(view, L("%s-plate.webp" % floor), (0, plate_rect("floor")[1]))
    _paste(view, L("%s-plate.webp" % ceil), (0, 0))

    sides = {z: (L("%s-z%d-left.webp" % (wall, z)), r)
             for z, r in [(z, [p for p in piece_rects()
                               if p["z"] == z and p["kind"] == "left"][0])
                          for z in range(DEPTHS)]}

    def draw_side(z):
        im, r = sides[z]
        _paste(view, im, (r["x"], r["y"]))
        _paste(view, im.transpose(Image.FLIP_LEFT_RIGHT),
               (VIEW_W - (r["x"] + r["w"]), r["y"]))

    draw_side(3)                                     # occluded by the z3 front
    fr = PLANE_RECTS[3]
    _paste(view, L("%s-z3-front.webp" % wall), (fr[0], fr[1]))
    _fog_fill(view, PLANE_RECTS[3], dict(FOG_LADDER)[3])
    draw_side(2)
    _fog_fill(view, PLANE_RECTS[2], dict(FOG_LADDER)[2])
    draw_side(1)
    _fog_fill(view, PLANE_RECTS[1], dict(FOG_LADDER)[1])
    draw_side(0)

    view.convert("RGB").save(PROOF)
    print("proof composite ->", os.path.relpath(PROOF, ROOT))


# ------------------------------------------------------------------ bake/verify

def bake(force):
    os.makedirs(OUT, exist_ok=True)
    have = scan_flats()
    script_mt = os.path.getmtime(os.path.abspath(__file__))
    made = skipped = 0

    def stale(dst, src_path):
        if force or not os.path.exists(dst):
            return True
        return os.path.getmtime(dst) < max(os.path.getmtime(src_path), script_mt)

    for f in have["wall"]:
        src_path = os.path.join(FLAT, f)
        name = os.path.splitext(f)[0]
        flat = None
        for z in range(DEPTHS):
            for kind, fn in (("front", bake_front), ("left", bake_left)):
                dst = os.path.join(OUT, "%s-z%d-%s.webp" % (name, z, kind))
                if not stale(dst, src_path):
                    skipped += 1
                    continue
                flat = flat or Image.open(src_path)
                fn(flat, z).save(dst, quality=WEBP_Q)
                made += 1
    for cat in ("floor", "ceiling"):
        for f in have[cat]:
            src_path = os.path.join(FLAT, f)
            dst = os.path.join(OUT, "%s-plate.webp" % os.path.splitext(f)[0])
            if not stale(dst, src_path):
                skipped += 1
                continue
            bake_plate(Image.open(src_path), cat).save(dst, quality=WEBP_Q)
            made += 1

    write_meta(have)
    compose_proof(have)
    print("pieces: %d baked, %d already current" % (made, skipped))


def verify():
    ok = True

    def check(cond, msg):
        nonlocal ok
        if not cond:
            ok = False
            print("FAIL:", msg)

    check(os.path.exists(META), "meta.json missing")
    check(os.path.exists(PROOF), "_proof-corridor.png missing")
    if not os.path.exists(META):
        sys.exit(1)
    meta = json.load(open(META, encoding="utf-8"))
    pr = {p["z"]: p for p in meta["planes"]}
    for p in meta["pieces"]:
        z = p["z"]
        if p["kind"] == "front":
            check(list((p["x"], p["y"], p["w"], p["h"])) == pr[z]["rect"],
                  "front z%d rect != plane rect" % z)
        else:
            check(p["x"] + p["w"] == pr[z + 1]["rect"][0],
                  "left z%d does not reach plane %d (gap)" % (z, z + 1))
            check(p["y"] == pr[z]["rect"][1] and p["h"] == pr[z]["rect"][3],
                  "left z%d vertical extent != plane %d" % (z, z))
    for cat, variants in meta["variants"].items():
        for v in variants:
            if cat == "wall":
                for p in meta["pieces"]:
                    fp = os.path.join(OUT, "%s-z%d-%s.webp" % (v, p["z"], p["kind"]))
                    check(os.path.exists(fp), "missing " + os.path.basename(fp))
                    if os.path.exists(fp):
                        check(Image.open(fp).size == (p["w"], p["h"]),
                              "%s size != meta rect" % os.path.basename(fp))
            else:
                fp = os.path.join(OUT, "%s-plate.webp" % v)
                check(os.path.exists(fp), "missing " + os.path.basename(fp))
                if os.path.exists(fp):
                    r = meta["plates"][cat]["rect"]
                    check(Image.open(fp).size == (r[2], r[3]),
                          "%s size != plate rect" % os.path.basename(fp))
    print("verify:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rebake all pieces")
    ap.add_argument("--verify", action="store_true", help="check outputs, write nothing")
    args = ap.parse_args()
    if args.verify:
        verify()
    else:
        bake(args.force)


if __name__ == "__main__":
    main()
