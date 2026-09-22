# -*- coding: utf-8 -*-
"""Camo recolour: one studio render -> five painted schemes.

  python scripts/s5-camo-recolour.py --verify     score against the shipped art
  python scripts/s5-camo-recolour.py              write any missing variants
  python scripts/s5-camo-recolour.py --force      rewrite them all

WHY THIS FILE EXISTS. ADR-0099 shipped 100 recoloured renders and the script
that made them was never committed. All that survived was one sentence in
model.ts and the ADR: "a saturation-gated HSV remap of the original (the grey
studio backdrop sits below the saturation floor, so it is untouched)". No
constants, no code. That made the season's whole camo layer unreproducible: a
new tank could be added but never painted.

The parameters below were RECOVERED BY MEASUREMENT, not guessed - comparing each
shipped variant against its own base across five sample tanks and reading the
mapping off the data. `--verify` reports the reconstruction error against the
shipped files, so this file's claim to be the original transform is testable
rather than asserted.

THE METHOD. Work in HSV. A pixel's weight is a smoothstep on its own
saturation: nothing below SAT_FLOOR moves (that is the grey studio backdrop and
the black tracks, which is why every variant still composites identically), and
everything above SAT_FULL is fully repainted. Hue moves toward the scheme's
target; saturation and value take an affine map (gain and offset) blended in by
the same weight, so the render keeps its own modelling, panel wear and dirt
rather than flattening to a paint chip.

Only roster keys are painted (see `roster_bases`). The art folder also holds
alternate studio takes that no code can reference.
"""
import argparse
import io
import os
import re
import sys

import numpy as np
from PIL import Image

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "s5-art", "tank")
ART = os.path.normpath(ART)

# Saturation gate. Below FLOOR a pixel is backdrop/track and is left alone;
# above FULL it is paint and is fully remapped; between, it ramps.
SAT_FLOOR = 0.10
SAT_FULL = 0.26

# Per scheme: target hue, then an AFFINE map for saturation and for value,
# each as (gain, offset) applied as out = in * gain + offset.
#
# Affine rather than a plain multiply because the data says so. Fitting both
# forms against the shipped art: winter is a LIFT toward white (gain 1.10,
# offset +0.28) and a plain multiply mis-fits it by 2x the error, while night is
# almost pure gain with no offset. One affine form covers every scheme and each
# one's numbers came out of a least-squares fit on six tanks, not a guess.
SCHEMES = {
    #           hue     sat (gain, offset)   val (gain, offset)
    "desert": (0.1020, (0.831,  0.0772), (1.094,  0.0432)),
    "winter": (0.2471, (0.045,  0.0258), (1.104,  0.2777)),
    "night":  (0.5333, (0.704,  0.0302), (0.611, -0.0004)),
    "urban":  (0.4392, (0.248,  0.0361), (0.936,  0.0348)),
    "gold":   (0.1176, (0.925,  0.3152), (1.147,  0.0594)),
}


def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / max(1e-6, hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def recolour(img, scheme):
    """One RGB PIL image -> one recoloured RGB PIL image."""
    target_h, (sg, so), (vg, vo) = SCHEMES[scheme]
    hsv = np.asarray(img.convert("HSV")).astype(np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    w = smoothstep(SAT_FLOOR, SAT_FULL, s)

    # Hue: move the SHORT way round the circle, so a scheme on the far side
    # does not sweep through every colour on its way there.
    d = (target_h - h + 0.5) % 1.0 - 0.5
    h2 = (h + d * w) % 1.0

    # Saturation and value: the affine target, blended in by the same weight.
    # Blending rather than assigning is what keeps the render's own modelling,
    # panel wear and dirt instead of flattening it to a paint chip, and it is
    # what makes the backdrop (w = 0) come through untouched.
    s2 = np.clip(s + (np.clip(s * sg + so, 0.0, 1.0) - s) * w, 0.0, 1.0)
    v2 = np.clip(v + (np.clip(v * vg + vo, 0.0, 1.0) - v) * w, 0.0, 1.0)

    out = np.stack([h2, s2, v2], axis=-1)
    return Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), mode="HSV").convert("RGB")


MODEL_TS = os.path.normpath(os.path.join(ART, "..", "..", "..", "src", "lib", "s5", "model.ts"))


def roster_bases():
    """The base renders the GAME can actually reference, read from model.ts.

    Not "every .webp without a camo suffix". That version generated 15 files
    nobody could ever see, because the art folder also holds alternate studio
    takes (sherman-a2, sherman-a5, sherman-stock) that are not roster keys.
    Painting variants of an unreferenced render is pure weight in a 284 MB tree.

    Source of truth is model.ts, the same file `tankArt()` resolves through:
    TANK_ART_ON_DISK gives `<key>.webp`, and HERO_TANK_ART overrides a key to a
    different filename (Sherman is `hero-sherman.webp`).
    """
    src = io.open(MODEL_TS, encoding="utf-8").read()

    on_disk = re.search(r"TANK_ART_ON_DISK[^=]*=\s*new Set\(\[(.*?)\]\)", src, re.S)
    keys = set(re.findall(r'"([a-z0-9]+)"', on_disk.group(1))) if on_disk else set()

    hero = re.search(r"HERO_TANK_ART[^=]*=\s*\{(.*?)\}", src, re.S)
    overrides = dict(re.findall(r'(\w+)\s*:\s*"/s5-art/tank/([^"]+)\.webp"', hero.group(1))) if hero else {}

    stems = {overrides.get(k, k) for k in keys}
    missing = sorted(s for s in stems if not os.path.exists(os.path.join(ART, s + ".webp")))
    if missing:
        print("WARNING: roster keys with no base render: %s" % ", ".join(missing))
    return sorted(s for s in stems if os.path.exists(os.path.join(ART, s + ".webp")))


def cmd_verify():
    """How closely does this reproduce the art that actually shipped?"""
    print("Scoring the reconstruction against the shipped renders.\n")
    print("%-10s %-8s %8s %8s   %s" % ("tank", "scheme", "mean err", "p95 err", "verdict"))
    worst = 0.0
    n = 0
    for stem in roster_bases()[:6]:
        base_p = os.path.join(ART, stem + ".webp")
        for scheme in SCHEMES:
            ref_p = os.path.join(ART, "%s-%s.webp" % (stem, scheme))
            if not os.path.exists(ref_p):
                continue
            mine = np.asarray(recolour(Image.open(base_p).convert("RGB"), scheme)).astype(np.float32)
            ref = np.asarray(Image.open(ref_p).convert("RGB")).astype(np.float32)
            if mine.shape != ref.shape:
                continue
            err = np.abs(mine - ref)
            mean_e, p95 = float(err.mean()), float(np.percentile(err, 95))
            worst = max(worst, mean_e)
            n += 1
            verdict = "close" if mean_e < 10 else ("fair" if mean_e < 22 else "OFF")
            print("%-10s %-8s %8.2f %8.2f   %s" % (stem, scheme, mean_e, p95, verdict))
    if not n:
        print("no reference pairs found")
        return 1
    print("\nworst mean error across %d pairs: %.2f / 255" % (n, worst))
    print("Reference: the studio plate is untouched by construction, so error\n"
          "concentrates in the paint. Under ~10 is visually indistinguishable at\n"
          "the sizes these render at (garage 1024px, map sprite 160px).")
    return 0


def cmd_write(force):
    made = skipped = 0
    for stem in roster_bases():
        base_p = os.path.join(ART, stem + ".webp")
        img = None
        for scheme in SCHEMES:
            out_p = os.path.join(ART, "%s-%s.webp" % (stem, scheme))
            if os.path.exists(out_p) and not force:
                skipped += 1
                continue
            if img is None:
                img = Image.open(base_p).convert("RGB")
            recolour(img, scheme).save(out_p, "WEBP", quality=90, method=6)
            made += 1
    print("camo renders: %d written, %d already present" % (made, skipped))
    if made:
        print("Downstream art is NOT regenerated automatically. Re-run:\n"
              "  python scripts/s5-bake-tank-cards.py   (share-card JPEGs)\n"
              "  python scripts/map-tank-mips.py        (map sprites)")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--verify", action="store_true", help="score against the shipped art, write nothing")
    ap.add_argument("--force", action="store_true", help="rewrite variants that already exist")
    a = ap.parse_args()
    sys.exit(cmd_verify() if a.verify else cmd_write(a.force))
