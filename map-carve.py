#!/usr/bin/env python
"""
MAP CARVE — cut guaranteed building clearings into a generated terrain plate.

  python map-carve.py --plate <jungle.png> --out public/s5-art/world/bg-land.webp --debug

WHY THIS EXISTS
Five renders confirmed it: an image model will paint a gorgeous dense jungle,
and will NOT reliably honour "include 30 evenly distributed clearings". It
treats the count as flavour. Measured results: one variant yielded 12 usable
clearings, the next 7. The map needs at least 21 (16 domains + base + 4 games)
and every season will need the same again.

That is not a prompt problem, it is a division-of-labour problem. So:

    THE MODEL PAINTS TERRAIN. THE CODE CUTS THE CLEARINGS.

Each clearing is carved at exactly the position the master layout asks for, at
exactly the size the building needs. The count is guaranteed because it is a
loop, not a hope.

HOW A CARVE IS MADE TO LOOK PAINTED, not stamped:
  * the ground colour is SAMPLED FROM THE PLATE ITSELF, from open ground near
    that spot, so a jungle plate yields jungle-floor clearings and a desert
    plate yields sand ones with no extra work. That is what makes it
    season-portable rather than a jungle-specific hack.
  * the outline is an irregular closed spline, never a circle
  * the rim gets a ring of darker shade where the canopy would overhang, and a
    lighter inner lip where sun reaches the edge
  * a light noise wash keeps the interior from reading as flat paint

Run this AFTER generating terrain and BEFORE map-anchors.py; the anchors will
then find exactly the clearings that were cut.
"""
import argparse
import colorsys
import json
import math
import pathlib
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).parent
LAYOUT = ROOT / "map-layout.json"


def is_open(r, g, b):
    """Same test map-anchors uses: not canopy, not water, not deep shadow."""
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    tree = 0.18 < h < 0.46 and s > 0.30 and v < 0.52
    water = b >= r + 8 and b >= g - 6
    return not (tree or water or v < 0.28)


def sample_ground(im, cx, cy, radius):
    """Average colour of nearby OPEN ground, so the carve matches the biome.

    Widens its search until it finds enough open pixels; falls back to a warm
    neutral only if the neighbourhood is entirely canopy or water.
    """
    W, H = im.size
    px = im.load()
    for mult in (1.6, 2.6, 4.0, 6.0):
        rr = int(radius * mult)
        acc, n = [0, 0, 0], 0
        for _ in range(1400):
            a = random.random() * math.tau
            d = math.sqrt(random.random()) * rr
            x = int(cx + math.cos(a) * d)
            y = int(cy + math.sin(a) * d * 0.6)
            if not (0 <= x < W and 0 <= y < H):
                continue
            r, g, b = px[x, y][:3]
            if is_open(r, g, b):
                acc[0] += r; acc[1] += g; acc[2] += b; n += 1
        if n > 150:
            return tuple(v // n for v in acc)
    return (176, 158, 112)


def blob(cx, cy, rx, ry, seed, lobes=13, rough=0.30):
    """An irregular closed outline. A circle reads as stamped; this reads cut."""
    rnd = random.Random(seed)
    pts = []
    amps = [1.0 + rnd.uniform(-rough, rough) for _ in range(lobes)]
    for i in range(120):
        t = i / 120 * math.tau
        f = t / math.tau * lobes
        k = int(f) % lobes
        k2 = (k + 1) % lobes
        u = f - int(f)
        u = u * u * (3 - 2 * u)  # smoothstep between lobe amplitudes
        a = amps[k] * (1 - u) + amps[k2] * u
        pts.append((cx + math.cos(t) * rx * a, cy + math.sin(t) * ry * a))
    return pts


def carve(im, spots, debug=False):
    W, H = im.size
    base = im.convert("RGB")
    out = base.copy()

    for i, s in enumerate(spots):
        cx, cy = s["x"] * W, s["y"] * H
        # r is a fraction of WIDTH, matching how site sizes are expressed.
        rx = s["r"] * W
        ry = rx * 0.62  # oblique view: ground reads wider than deep
        ground = sample_ground(base, cx, cy, rx)
        seed = int(s["x"] * 9973) ^ int(s["y"] * 7919) ^ i

        # 1. SHADE RING first, slightly larger, so the canopy edge feels like it
        #    overhangs the clearing rather than being cut with scissors.
        shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shade).polygon(
            blob(cx, cy, rx * 1.20, ry * 1.20, seed + 1), fill=(28, 44, 24, 120))
        shade = shade.filter(ImageFilter.GaussianBlur(max(2, rx * 0.05)))
        out = Image.alpha_composite(out.convert("RGBA"), shade).convert("RGB")

        # 2. THE CLEARING itself, in ground sampled from this very plate.
        fill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(fill).polygon(blob(cx, cy, rx, ry, seed), fill=ground + (255,))
        mask = fill.split()[3].filter(ImageFilter.GaussianBlur(max(1.5, rx * 0.022)))
        flat = Image.new("RGB", (W, H), ground)
        out = Image.composite(flat, out, mask)

        # 3. TEXTURE so the interior is not flat paint: a soft noise wash keyed
        #    off the sampled colour.
        noise = Image.effect_noise((W, H), 46).convert("L")
        tint = Image.new("RGB", (W, H), tuple(min(255, int(c * 1.10)) for c in ground))
        inner = Image.new("L", (W, H), 0)
        ImageDraw.Draw(inner).polygon(blob(cx, cy, rx * 0.94, ry * 0.94, seed + 2), fill=190)
        inner = inner.filter(ImageFilter.GaussianBlur(max(2, rx * 0.05)))
        out = Image.composite(Image.blend(out, tint, 0.62), out,
                              Image.composite(noise, Image.new("L", (W, H), 0), inner))

        # 4. SUNLIT LIP on the upper-left rim, matching the 10 o'clock sun that
        #    every asset in this world is lit by.
        lip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(lip).polygon(
            blob(cx - rx * 0.05, cy - ry * 0.07, rx * 1.02, ry * 1.02, seed + 3),
            outline=(255, 240, 200, 90), width=max(2, int(rx * 0.10)))
        out = Image.alpha_composite(out.convert("RGBA"),
                                    lip.filter(ImageFilter.GaussianBlur(max(2, rx * 0.035)))).convert("RGB")

    if debug:
        d = ImageDraw.Draw(out)
        for s in spots:
            cx, cy, rr = s["x"] * W, s["y"] * H, s["r"] * W
            d.ellipse([cx - rr, cy - rr * 0.62, cx + rr, cy + rr * 0.62],
                      outline=(255, 0, 200), width=3)
    return out


def default_layout():
    """A spread of 24 clearings if no map-layout.json exists yet.

    Deliberately generous and even: 16 domains along two ranks, a large base,
    four game sites and three utility spots. Sizes are radii as a fraction of
    map width, matching the `size` values S5 uses.
    """
    spots = []
    # Two ranks of 8 across the top two-thirds: the front.
    for rank, y in ((0, 0.150), (1, 0.330)):
        for i in range(8):
            x = 0.075 + i * (0.855 / 7)
            spots.append({"x": round(x, 4), "y": y + (0.028 if i % 2 else 0), "r": 0.040})
    # Base, large, bottom right.
    spots.append({"x": 0.845, "y": 0.800, "r": 0.072})
    # Four game sites along the bottom.
    for i, x in enumerate((0.115, 0.290, 0.465, 0.640)):
        spots.append({"x": x, "y": 0.845 - (0.03 if i % 2 else 0), "r": 0.050})
    # Utility: board, kit, trophies clustered near the base.
    for x, y in ((0.700, 0.680), (0.930, 0.640), (0.760, 0.930)):
        spots.append({"x": x, "y": y, "r": 0.038})
    return spots


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plate", required=True)
    ap.add_argument("--out", default=str(ROOT / "public" / "s5-art" / "world" / "bg-land.webp"))
    ap.add_argument("--layout", default=str(LAYOUT))
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    src = pathlib.Path(args.plate)
    if not src.exists():
        sys.exit(f"no plate at {src}")
    im = Image.open(src).convert("RGB")

    lp = pathlib.Path(args.layout)
    if lp.exists():
        spots = json.loads(lp.read_text(encoding="utf-8"))["clearings"]
        print(f"layout     : {lp.name} ({len(spots)} clearings)")
    else:
        spots = default_layout()
        lp.write_text(json.dumps({"clearings": spots}, indent=2), encoding="utf-8")
        print(f"layout     : wrote default {lp.name} ({len(spots)} clearings)")

    out = carve(im, spots, debug=args.debug)
    dst = pathlib.Path(args.out)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.suffix == ".webp":
        out.save(dst, "WEBP", quality=86, method=6)
    else:
        out.save(dst)
    far = dst.with_name(dst.stem + "-far" + dst.suffix)
    out.resize((768, round(768 * out.height / out.width)), Image.LANCZOS).save(
        far, "WEBP", quality=80, method=6)
    print(f"carved     : {len(spots)} clearings -> {dst.name} ({dst.stat().st_size//1024} KB)")
    print(f"             + {far.name}")


if __name__ == "__main__":
    main()
