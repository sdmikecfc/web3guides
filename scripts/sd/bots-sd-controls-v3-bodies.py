"""BATTLE BOTS / stable-diffusion: THE V3 BODY CONTROL MAPS (lane T, 2026-09-05).

    python scripts/sd/bots-sd-controls-v3-bodies.py
    python scripts/sd/bots-sd-controls-v3-bodies.py --only torso-teapot,arm-pincers
    python scripts/sd/bots-sd-controls-v3-bodies.py --res 1024

Reads the torso and arm shape rulers `node scripts/bots-bake-parts.mjs --out v3
--only torso,arm` writes to public/bots-art/_raw/parts/placeholders-v3/target
and emits their control maps into art-src/sd/controls/v3, in the layout every
other tree uses:

    art-src/sd/controls/v3/square/torso-<shape>/{depth,lineart,canny,alpha,hidden,joints}.png
    art-src/sd/controls/v3/square/arm-<shape>/...
    art-src/sd/controls/v3/contract/<key>/...                (the matte the cutter reads)
    art-src/sd/controls/v3/{square,contract}/manifest.json   (MERGED, see below)

── WHY THIS IS A SEPARATE FILE AND NOT A FLAG ON bots-sd-controls.py ──────
That file DOES already know how to build a v3 shape: `--source v3` walks the
`looks` list of every manifest named in its V3_MANIFESTS tuple. What it does
not do is MERGE: it writes `manifest.json` whole, from the keys it just built.
Run it today and the leg lane's entries vanish, because manifest-leg.json
carries `shapes` and not `looks` and is skipped with a note. The render script
resolves a job's placement out of that manifest (bots-sd-render.py repoint()),
so a lost entry is a job that dies at load after it has been paid for.

Three lanes are writing into one controls tree this afternoon. The safe shape
is the one lane B already proved: a small file per lane that builds its own
keys and writes the UNION back. When the three lanes have landed, folding all
of this into bots-sd-controls.py behind a merging manifest is a ten-line
change and a much better place to be; doing it now, mid-flight, is not.

What this file must NOT do, and does not, is re-derive the maps. The banding
trap, the chromaticity edge finder, the accent relief table, the noise floor
and the square placement are all HARD-WON and all measured, and a second copy
of them would drift from the first the moment either moved
(lesson_gates_must_import_not_reimplement). So every map here is built by
bots-sd-controls.py's OWN functions, imported by path because the module name
is hyphenated: build_maps, hidden_mask, joints_overlay, place_square,
place_contract, upscale and write_part. This file supplies exactly two things
that file cannot: which PNG to load, and what to call the part.

── THE TORSO HAS NO PLATE, AND THAT IS NOT AN OVERSIGHT ──────────────────
PRE_SLOTS in the bake is arms and legs: the torso carries no measured
generator bias, so the v3 tree holds one torso flavour and it is ON TARGET.
The control maps are built from the target ruler for both slots anyway, which
is right for a ControlNet: it does not carry the unconditioned generator's
bias, so conditioning it on a pre-compensated plate would bias it twice.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from bots_sd_contract import classify, read_contract, read_law  # noqa: E402

RULERS = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v3", "target")
V3_ROOT = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v3")
OUT = os.path.join(ROOT, "art-src", "sd", "controls", "v3")
# the ruler file stem per slot: the v3 tree kept the bake's own plural for the
# pair slots (arms-mitts.png), while the KEY is singular so it reads like every
# other matrix slot (arm-mitts, beside leg-wheels and head-bear-smile)
STEM = {"torso": "torso", "arm": "arms"}
MANIFEST = {"torso": "manifest-torso.json", "arm": "manifest-arm.json"}


def _controls_module():
    """bots-sd-controls.py, imported by path: the module name is hyphenated so
    `import` cannot reach it, and this lane must use its functions rather than
    a second copy of them."""
    p = os.path.join(HERE, "bots-sd-controls.py")
    if not os.path.exists(p):
        sys.exit(f"bots-sd-controls-v3-bodies: missing {p}")
    spec = importlib.util.spec_from_file_location("bots_sd_controls", p)
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [sys.argv[0]]   # that module parses argv only under __main__
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


def keys() -> list[tuple[str, str]]:
    """(slot, shape) for every body shape the v3 bake declares, in table order.
    READ from the manifests, never guessed: a copy of the shape list kept here
    would drift from the bake the day a shape is added, and every control map
    built from the stale copy would condition on a ruler that is not there
    with nothing anywhere complaining."""
    out = []
    for slot in ("torso", "arm"):
        p = os.path.join(V3_ROOT, MANIFEST[slot])
        if not os.path.exists(p):
            sys.exit(f"bots-sd-controls-v3-bodies: missing {p}. Run "
                     "`node scripts/bots-bake-parts.mjs --out v3 --only torso,arm` first.")
        man = json.load(open(p, encoding="utf-8"))
        for row in man["shapeRows"]:
            out.append((slot, row["shape"]))
    return out


def merge_manifest(path: str, layout: str, res: int, items: list[dict]) -> int:
    """Write the union of what is on disk and what this run made. Returns the
    number of entries that survived from the other lanes."""
    old = {"layout": layout, "res": res, "source": "v3", "items": []}
    if os.path.exists(path):
        try:
            old = json.load(open(path, encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    mine = {it["key"] for it in items}
    kept = [it for it in old.get("items", []) if it["key"] not in mine]
    out = dict(old)
    out.update({"layout": layout, "res": res, "source": "v3"})
    out["items"] = sorted(kept + items, key=lambda it: it["key"])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, "w", encoding="utf-8"), indent=1)
    return len(kept)


def build(M, c: dict, law: dict, slot: str, shape: str, layout: str, res: int) -> tuple[dict, dict]:
    """One shape, one layout. The body of bots-sd-controls.build_one with its
    (slot, tier, design) source swapped for a shape ruler; every map is that
    module's own."""
    key = f"{slot}-{shape}"
    p = os.path.join(RULERS, f"{STEM[slot]}-{shape}.png")
    if not os.path.exists(p):
        sys.exit(f"bots-sd-controls-v3-bodies: missing ruler {p}")
    base = Image.open(p).convert("RGBA")
    w, h = base.size
    want = (c["rig"][slot]["w"], c["rig"][slot]["h"])
    if base.size != want:
        sys.exit(f"bots-sd-controls-v3-bodies: {p} is {base.size}, the contract says {want}")

    if layout == "contract":
        W, H, sx, sy, ox, oy = M.place_contract(w, h, res)
    else:
        W, H, sx, sy, ox, oy = M.place_square(w, h, res)

    big = M.upscale(base, sx, sy)
    rgba = np.asarray(big).astype(np.uint8)
    cls = classify(rgba, law, float(c["figure"]["metalSatMin"]))

    ink_rows = np.where(rgba[..., 3] > 0)[0]
    span = (ink_rows.max() - ink_rows.min() + 1) if ink_rows.size else h
    n_bands = max(6, min(24, round(span / (20 * sy))))
    maps = M.build_maps(rgba, cls, span / max(n_bands, 1))

    out: dict[str, np.ndarray] = {}
    for k, v in maps.items():
        canvas = np.zeros((H, W), dtype=float)
        canvas[oy:oy + v.shape[0], ox:ox + v.shape[1]] = v
        out[k] = canvas

    hid = M.hidden_mask(c, slot, w, h)
    hid_big = np.asarray(Image.fromarray((hid * 255).astype(np.uint8), "L")
                         .resize(big.size, Image.NEAREST)) > 127
    canvas = np.zeros((H, W), dtype=float)
    canvas[oy:oy + hid_big.shape[0], ox:ox + hid_big.shape[1]] = hid_big & (np.asarray(big)[..., 3] > 127)
    out["hidden"] = canvas

    j_img, j_rec = M.joints_overlay(c, slot, W, H, sx, sy, ox, oy)
    out["joints"] = j_img

    solid = rgba[..., 3] > 127
    stat = {
        "key": key, "slot": slot, "shape": shape, "source": "v3",
        "contractCanvas": [w, h], "workingCanvas": [W, H],
        "placement": {"scaleX": round(sx, 6), "scaleY": round(sy, 6), "offsetX": ox, "offsetY": oy},
        "cropBack": [ox, oy, ox + round(w * sx), oy + round(h * sy)],
        "bands": n_bands, "joints": j_rec,
        "share": {k: round(float((cls[k] & solid).sum()) / max(1, int(solid.sum())), 4)
                  for k in ("body", "accent", "metal", "grille", "lens", "rubber", "coral")},
        "hiddenShare": round(float(canvas.sum()) / max(1, int(solid.sum())), 4),
    }
    return out, stat


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", type=int, default=1024)
    ap.add_argument("--only", default=None, help="a comma list of keys like torso-teapot,arm-tube")
    args = ap.parse_args()

    M = _controls_module()
    c, law = read_contract(), read_law()
    want = keys()
    if args.only:
        pick = {s.strip() for s in args.only.split(",")}
        have = {f"{s}-{sh}" for s, sh in want}
        missing = pick - have
        if missing:
            sys.exit(f"bots-sd-controls-v3-bodies: no such body shape {sorted(missing)}; have {sorted(have)}")
        want = [(s, sh) for s, sh in want if f"{s}-{sh}" in pick]

    for layout in ("contract", "square"):
        items = []
        for slot, shape in want:
            maps, stat = build(M, c, law, slot, shape, layout, args.res)
            M.write_part(os.path.join(OUT, layout, stat["key"]), maps)
            items.append(stat)
            print(f"  {layout:<9} {stat['key']:<16} {stat['workingCanvas'][0]}x{stat['workingCanvas'][1]}"
                  f"  metal {stat['share']['metal']:.4f}  hidden {stat['hiddenShare']:.3f}"
                  f"  bands {stat['bands']}")
        kept = merge_manifest(os.path.join(OUT, layout, "manifest.json"), layout, args.res, items)
        print(f"  {layout}: wrote {len(items)} body entries, kept {kept} from the other lanes")
    print(f"bots-sd-controls-v3-bodies: {len(want)} shapes -> {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
