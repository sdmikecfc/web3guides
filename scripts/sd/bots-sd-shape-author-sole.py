"""BATTLE BOTS: AUTHOR THE CORAL SOLE ON A NEW LEG SHAPE, BEFORE THE JUDGE.

    python scripts/sd/bots-sd-shape-author-sole.py
    python scripts/sd/bots-sd-shape-author-sole.py --shape leg-wheels

WHY THIS RUNS AT ALL, AND WHY IT IS NOT A RELAXATION. scripts/sd/bots-sd-install.py
section 0 already ships this step for the legs, and its own header says why:
the coral sole is a FIXED accent that the shipped importer draws, exactly like
the eye lens, its catch light and the wind-up key, and a diffusion render
never draws it as the straight-edged block the CORAL SPILL bar was calibrated
on. Measured there: the cleanest production boot read 5.3 percent spill and
the other 191 ran to 100. So every leg the factory has ever put in front of
the judge went through this step first. Measured here on 2026-09-05, on the
96 raw cuts of the four new shapes: sole fraction 0.000 at the median and
coral spill 1.000 at the median, which is 91 of 96 rejected NO SOLE or CORAL
SPILL before any rule about the SHAPE was ever reached.

Judging a new shape's raw cut while the boot's cut was authored first would be
the judge bending AGAINST the new shapes, which is the same defect as bending
for them. This file gives them the identical step.

WHAT MOVES AND WHAT DOES NOT. No rule and no bar moves. The pixels are written
by bots-sd-install.author_sole, the shipped function, called unchanged: the
same authored coral, the same 2 px growth over the outline stroke, the same
clamped smoothed light, the same PNG metadata and sidecar carried across. The
judge afterwards still asks NO SOLE of the region and still rejects every
coral pixel the render put anywhere else on the leg.

THE ONE THING THAT HAS TO DIFFER. bots-sd-install.sole_region reads the region
off the v2 SHIP ruler, legs-t<tier>-<design>.png, and every one of those is
the boot. The boot's sole on a wheel is the wrong block, so the region here is
read off the v3 SHAPE ruler instead, through the same classifier
(bots_sd_contract.classify with the law and the contract's own metalSatMin)
and the same closing and dilation, at the shipped module's own constants. That
is the ruler seam again, one directory down: the drawing a candidate is
measured against is the drawing of ITS OWN SHAPE.

PROVED, NOT ASSERTED. Before it writes anything, this file builds the region
for the v2 boot ruler with its own code and compares it pixel for pixel with
bots-sd-install.sole_region(1, 1). They must be identical, or it refuses: a
region builder that has drifted from the shipped one would author a block the
judge was never calibrated on.

Writes only under .bots-preview/sd-shapes/authored. Reads public/bots-art only
for the rulers, and writes nothing there.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import sys
import time

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

V3_TARGET = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v3", "target")
V2_TARGET = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v2", "target")
PREVIEW = os.path.join(ROOT, ".bots-preview", "sd-shapes")
RENDERS = os.path.join(PREVIEW, "renders", "stage6-legs")
OUT_TREE = os.path.join(PREVIEW, "authored", "stage6-legs")


def die(msg: str) -> None:
    raise SystemExit("bots-sd-shape-author-sole REFUSES: " + msg)


def load(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def region_from(install, ruler_png: str) -> np.ndarray:
    """The contract's sole region on ONE ruler: its own coral class, through
    the same classifier the control maps were built with, closed and grown by
    the shipped module's own constants."""
    from bots_sd_contract import classify, read_contract, read_law  # noqa: E402
    if not os.path.exists(ruler_png):
        die(f"no ruler at {ruler_png}")
    rgba = np.asarray(Image.open(ruler_png).convert("RGBA"))
    c = read_contract()
    cls = classify(rgba, read_law(), float(c["figure"]["metalSatMin"]))
    sole = cls["coral"] & (rgba[..., 3] > 127)
    if int(sole.sum()) < 200:
        die(f"{os.path.basename(ruler_png)} carries no coral sole ({int(sole.sum())} px)")
    sole = ndimage.binary_closing(sole, iterations=2)
    sole = ndimage.binary_dilation(sole, iterations=install.SOLE_GROW_PX)
    return sole


def prove_no_drift(install) -> None:
    """This file's region builder against the shipped one, on the boot the
    shipped one was written for. Identical, or nothing is authored."""
    mine = region_from(install, os.path.join(V2_TARGET, "legs-t1-1.png"))
    theirs = install.sole_region(1, 1)
    if mine.shape != theirs.shape or not np.array_equal(mine, theirs):
        diff = int(np.logical_xor(mine, theirs).sum()) if mine.shape == theirs.shape else -1
        die(f"this file's sole region differs from bots-sd-install.sole_region on the v2 boot "
            f"ruler ({diff} pixels). The shipped region builder has moved; do not author against a "
            f"block the judge was not calibrated on.")
    print(f"no drift: this file's region and bots-sd-install.sole_region(1, 1) are identical on the "
          f"v2 boot ruler ({int(mine.sum())} px)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shape", action="append", help="a leg pool such as leg-wheels; default all found")
    ap.add_argument("--renders", default=RENDERS)
    ap.add_argument("--out", default=OUT_TREE)
    a = ap.parse_args()

    install = load(os.path.join(HERE, "bots-sd-install.py"), "bots_sd_install")
    prove_no_drift(install)

    pools = a.shape or sorted(p for p in os.listdir(a.renders)
                              if os.path.isdir(os.path.join(a.renders, p, "cut")))
    if not pools:
        die(f"no leg pools under {a.renders}")

    all_recs = {}
    for pool in pools:
        cut = os.path.join(a.renders, pool, "cut")
        if not os.path.isdir(cut):
            die(f"no cut folder for {pool} at {cut}")
        shape = pool[4:] if pool.startswith("leg-") else pool
        ruler = os.path.join(V3_TARGET, f"legs-{shape}.png")
        sole = region_from(install, ruler)
        out_dir = os.path.join(a.out, pool, "cut")
        os.makedirs(out_dir, exist_ok=True)
        files = sorted(f for f in os.listdir(cut)
                       if f.lower().endswith(".png") and ".mask." not in f.lower())
        if not files:
            die(f"no cuts in {cut}")
        recs = [install.author_sole(os.path.join(cut, f), os.path.join(out_dir, f), sole)
                for f in files]
        warm = [r["renderWarmPxInRegion"] for r in recs]
        all_recs[pool] = {"ruler": ruler, "regionPx": int(sole.sum()), "cuts": len(recs),
                          "rows": recs[0]["rows"], "renderWarmPxInRegion": [min(warm), max(warm)],
                          "outDir": out_dir}
        print(f"{pool:14s} region {int(sole.sum()):5d} px, rows {recs[0]['rows'][0]} to "
              f"{recs[0]['rows'][1]}, {len(recs)} cuts authored; the render's own warm paint inside "
              f"the region ran {min(warm)} to {max(warm)} px  ->  {out_dir}")

    with open(os.path.join(a.out, "_author-sole-shapes.json"), "w", encoding="utf-8",
              newline="\n") as fh:
        json.dump({"coral": "#%02X%02X%02X" % install.SOLE_CORAL, "growPx": install.SOLE_GROW_PX,
                   "shade": list(install.SOLE_SHADE), "sigma": install.SOLE_SIGMA,
                   "at": time.strftime("%Y-%m-%dT%H:%M:%S"), "pools": all_recs}, fh, indent=1)
        fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
