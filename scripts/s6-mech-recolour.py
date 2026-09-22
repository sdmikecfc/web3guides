# -*- coding: utf-8 -*-
"""S6 mech recolour: the recovered S5 HSV remap (s5-camo-recolour.py, ADR-0099
method) pointed at the 20 RGBA mech cutouts, with ONE addition: an AMBER
PROTECT mask so the cockpit visor and brass fittings keep their identity in
every scheme (on tanks nothing was amber; on mechs amber IS the brand).

  python scripts/s6-mech-recolour.py           write missing variants
  python scripts/s6-mech-recolour.py --force   rewrite all
  python scripts/s6-mech-recolour.py --one scout desert   single test

Writes tank/<key>-<scheme>.webp (heroes) + map/tanks/<key>-<scheme>.png
(battlefield minis). Keys from model.ts TANK_ART_ON_DISK, the same file
tankArt() resolves through. RGBA-safe: alpha passes through untouched.
"""
import argparse
import io
import os
import re

import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
HERO = os.path.join(ROOT, "public", "s6-art", "tank")
MINI = os.path.join(ROOT, "public", "s6-art", "map", "tanks")
MODEL_TS = os.path.join(ROOT, "src", "lib", "s6", "model.ts")

SAT_FLOOR = 0.10
SAT_FULL = 0.26

SCHEMES = {
    #           hue     sat (gain, offset)   val (gain, offset)   (S5 recovered fits)
    "desert": (0.1020, (0.831, 0.0772), (1.094, 0.0432)),
    "winter": (0.2471, (0.045, 0.0258), (1.104, 0.2777)),
    "night":  (0.5333, (0.704, 0.0302), (0.611, -0.0004)),
    "urban":  (0.4392, (0.248, 0.0361), (0.936, 0.0348)),
    "gold":   (0.1176, (0.925, 0.3152), (1.147, 0.0594)),
}


def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / max(1e-6, hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def recolour_rgba(img, scheme):
    target_h, (sg, so), (vg, vo) = SCHEMES[scheme]
    rgba = np.asarray(img.convert("RGBA"))
    alpha = rgba[..., 3]
    rgb = Image.fromarray(rgba[..., :3], "RGB")
    hsv = np.asarray(rgb.convert("HSV")).astype(np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    w = smoothstep(SAT_FLOOR, SAT_FULL, s)
    # AMBER PROTECT: warm bright saturated pixels (visor glass, brass glow)
    # keep their color in every scheme. Hue band measured off the renders.
    amber = smoothstep(0.55, 0.75, s) * smoothstep(0.45, 0.65, v) * (
        smoothstep(0.035, 0.055, h) * (1.0 - smoothstep(0.115, 0.145, h))
    )
    w = w * (1.0 - amber)
    # gold scheme: amber protect off - parade gold WANTS the whole machine gilded
    if scheme == "gold":
        w = smoothstep(SAT_FLOOR, SAT_FULL, s)

    d = (target_h - h + 0.5) % 1.0 - 0.5
    h2 = (h + d * w) % 1.0
    s2 = np.clip(s + (np.clip(s * sg + so, 0.0, 1.0) - s) * w, 0.0, 1.0)
    v2 = np.clip(v + (np.clip(v * vg + vo, 0.0, 1.0) - v) * w, 0.0, 1.0)

    out = np.stack([h2, s2, v2], axis=-1)
    rgb2 = Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), mode="HSV").convert("RGB")
    final = np.dstack([np.asarray(rgb2), alpha])
    return Image.fromarray(final, "RGBA")


def roster_keys():
    src = io.open(MODEL_TS, encoding="utf-8").read()
    m = re.search(r"TANK_ART_ON_DISK[^=]*=\s*new Set\(\[(.*?)\]\)", src, re.S)
    return sorted(set(re.findall(r'"([a-z0-9]+)"', m.group(1)))) if m else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--one", nargs=2, metavar=("KEY", "SCHEME"))
    args = ap.parse_args()

    todo = [tuple(args.one)] if args.one else [(k, s) for k in roster_keys() for s in SCHEMES]
    n = 0
    for key, scheme in todo:
        hero_src = os.path.join(HERO, key + ".webp")
        mini_src = os.path.join(MINI, key + ".png")
        for src, dst in [
            (hero_src, os.path.join(HERO, "%s-%s.webp" % (key, scheme))),
            (mini_src, os.path.join(MINI, "%s-%s.png" % (key, scheme))),
        ]:
            if not os.path.exists(src):
                print("MISSING base:", src)
                continue
            if not args.force and os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src):
                continue
            out = recolour_rgba(Image.open(src), scheme)
            if dst.endswith(".webp"):
                out.save(dst, quality=90)
            else:
                out.save(dst)
            n += 1
    print("wrote %d variants" % n)


if __name__ == "__main__":
    main()
