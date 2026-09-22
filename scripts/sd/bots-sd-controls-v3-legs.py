"""BATTLE BOTS / stable-diffusion: THE V3 LEG CONTROL MAPS (lane B, 2026-09-05).

    python scripts/sd/bots-sd-controls-v3-legs.py
    python scripts/sd/bots-sd-controls-v3-legs.py --only wheels
    python scripts/sd/bots-sd-controls-v3-legs.py --res 1024

Reads the leg shape rulers `node scripts/bots-bake-parts.mjs --out v3 --only
head,leg` writes to public/bots-art/_raw/parts/placeholders-v3/target and emits
their control maps into art-src/sd/controls/v3, in the layout every other tree
uses:

    art-src/sd/controls/v3/square/leg-<shape>/{depth,lineart,canny,alpha,hidden,joints}.png
    art-src/sd/controls/v3/contract/leg-<shape>/...          (the matte the cutter reads)
    art-src/sd/controls/v3/{square,contract}/manifest.json   (MERGED, see below)

── WHY THIS IS A SEPARATE FILE AND NOT A FLAG ON bots-sd-controls.py ──────
That file walks `every_part(c)`, which is slot x tier x design, and its
`--source` axis names a ruler tree per part key of the form <slot>-t<T>-<D>.
A v3 key is <slot>-<shape> and has no tier and no design, so teaching it the
v3 tree means changing the shape of its main loop, its `--only` parser and its
manifest keys. Two lanes are editing the art factory at once and that file is
the one both lanes' jobs are built from, so it is not the place for a
structural change made in a hurry.

What this file must NOT do, and does not, is re-derive the maps. The banding
trap, the chromaticity edge finder, the accent relief table, the noise floor
and the square placement are all HARD-WON and all measured, and a second copy
of them would drift from the first the moment either moved
(lesson_gates_must_import_not_reimplement). So every map here is built by
bots-sd-controls.py's OWN functions, imported by path because the module name
is hyphenated: build_maps, hidden_mask, joints_overlay, place_square,
place_contract, upscale and write_part. This file supplies exactly two things
that file cannot: which PNG to load, and what to call the part.

── ONE THING IT ADDS, AND WHY IT IS HERE AND NOT THERE (lane L, wave two) ──
coral_slab below stands the coral sole up in the depth map as its own block
(see its own docstring for the 68-of-96 measurement that bought it). It is an
ADDITION on top of what build_maps returned, not a second version of it: it
reads PROFILE_P, DEPTH_NEAR, DEPTH_RIM, ACCENT_DZ and LENS_DOME off that
module by attribute and retypes none of them, and it only ever raises the
depth. It lives here rather than in bots-sd-controls.py because ACCENT_DZ is
shared with the ship tree and the v2 tree and every other slot: moving the
coral's relief there would change maps two other lanes are rendering from
today. Here it can reach nothing but a v3 leg.

── THE MANIFEST IS MERGED, NEVER REPLACED ────────────────────────────────
The head shapes land in the same tree from the other lane. A manifest written
whole would delete whichever lane ran first, and the render script resolves a
job's placement out of it (bots-sd-render.py repoint()), so a lost entry is a
job that dies at load. Every run therefore reads the manifest on disk, drops
only the keys it is about to rewrite, and writes the union back.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from bots_sd_contract import classify, read_contract, read_law  # noqa: E402

RULERS = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v3", "target")
OUT = os.path.join(ROOT, "art-src", "sd", "controls", "v3")
MANIFEST_LEG = os.path.join(ROOT, "public", "bots-art", "_raw", "parts",
                            "placeholders-v3", "manifest-leg.json")


def _controls_module():
    """bots-sd-controls.py, imported by path: the module name is hyphenated so
    `import` cannot reach it, and this lane must use its functions rather than
    a second copy of them."""
    p = os.path.join(HERE, "bots-sd-controls.py")
    if not os.path.exists(p):
        sys.exit(f"bots-sd-controls-v3-legs: missing {p}")
    spec = importlib.util.spec_from_file_location("bots_sd_controls", p)
    mod = importlib.util.module_from_spec(spec)
    sys.argv = [sys.argv[0]]          # that module parses argv only under __main__
    spec.loader.exec_module(mod)
    return mod


def coral_slab(M, depth: np.ndarray, coral: np.ndarray) -> np.ndarray:
    """THE SOLE AS ITS OWN BLOCK IN THE DEPTH MAP. v3 legs only.

    bots-sd-controls.build_maps shapes the depth from ONE distance transform
    over the whole silhouette, so a part's depth is a single moulded dome and
    every accent is that dome plus a flat offset (ACCENT_DZ). For an eye lens
    on a head that is right: the lens IS on the face. For a rubber sole it is
    wrong, and wave one measured what wrong costs. On the wheel, the disc's
    distance transform peaks at the disc's centre and falls away through the
    tyre, so the depth map told the model the coral was the BOTTOM OF A BALL;
    the model painted it as the bottom of a ball, and 68 of 96 candidates were
    rejected CORAL SPILL with their coral running a median 16 rows on up the
    body in one unbroken blob.

    A thick rubber sole seen dead-on is not the bottom of the shoe. It is a
    SLAB STANDING IN FRONT OF IT, with its own rounded rim and its own top
    edge, and that is what this writes: the coral's own distance transform,
    through the module's OWN profile exponent, into the module's OWN near
    face for a coral accent. Every number is read off bots-sd-controls by
    attribute rather than retyped, because a second copy of PROFILE_P or
    ACCENT_DZ would drift the day either moved.

    It can only ever raise the depth (np.maximum), so nothing this touches can
    end up further back than build_maps already put it, and it is applied to
    the coral class ONLY, which no other slot's ruler carries: heads, torsos,
    arms and weapons are not reachable from this file at all.
    """
    if not coral.any():
        return depth
    body_top = M.DEPTH_NEAR - max(M.ACCENT_DZ.values()) - M.LENS_DOME
    near = body_top + M.ACCENT_DZ["coral"]
    edt = distance_transform_edt(coral)
    t = np.clip(edt / max(float(edt.max()), 1e-6), 0, 1)
    z = np.power(1.0 - np.power(1.0 - t, M.PROFILE_P), 1.0 / M.PROFILE_P)
    slab = M.DEPTH_RIM + (near - M.DEPTH_RIM) * z
    out = np.where(coral, np.maximum(depth, slab), depth)
    # the same 1.0 px smoothing build_maps finishes its own depth with, so the
    # slab's new top edge is as soft as every other edge in the map and no
    # single-pixel cliff reaches the ControlNet.
    ink = depth > 0
    return np.where(ink, gaussian_filter(out, 1.0), 0.0)


def shapes() -> list[str]:
    if os.path.exists(MANIFEST_LEG):
        return list(json.load(open(MANIFEST_LEG, encoding="utf-8"))["shapes"])
    sys.exit(f"bots-sd-controls-v3-legs: missing {MANIFEST_LEG}. Run "
             "`node scripts/bots-bake-parts.mjs --out v3 --only head,leg` first.")


def merge_manifest(path: str, layout: str, res: int, items: list[dict]) -> int:
    """Write the union of what is on disk and what this run made. Returns the
    number of entries that survived from the other lane."""
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


def build(M, c: dict, law: dict, shape: str, layout: str, res: int) -> tuple[dict, dict]:
    """One shape, one layout. The body of bots-sd-controls.build_one with its
    (slot, tier, design) source swapped for a shape ruler; every map is that
    module's own."""
    key = f"leg-{shape}"
    p = os.path.join(RULERS, f"legs-{shape}.png")
    if not os.path.exists(p):
        sys.exit(f"bots-sd-controls-v3-legs: missing ruler {p}")
    base = Image.open(p).convert("RGBA")
    w, h = base.size
    want = (c["rig"]["leg"]["w"], c["rig"]["leg"]["h"])
    if base.size != want:
        sys.exit(f"bots-sd-controls-v3-legs: {p} is {base.size}, the contract says {want}")

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
    maps["depth"] = coral_slab(M, maps["depth"], cls["coral"] & (rgba[..., 3] > 127))

    out: dict[str, np.ndarray] = {}
    for k, v in maps.items():
        canvas = np.zeros((H, W), dtype=float)
        canvas[oy:oy + v.shape[0], ox:ox + v.shape[1]] = v
        out[k] = canvas

    hid = M.hidden_mask(c, "leg", w, h)
    hid_big = np.asarray(Image.fromarray((hid * 255).astype(np.uint8), "L")
                         .resize(big.size, Image.NEAREST)) > 127
    canvas = np.zeros((H, W), dtype=float)
    canvas[oy:oy + hid_big.shape[0], ox:ox + hid_big.shape[1]] = hid_big & (np.asarray(big)[..., 3] > 127)
    out["hidden"] = canvas

    j_img, j_rec = M.joints_overlay(c, "leg", W, H, sx, sy, ox, oy)
    out["joints"] = j_img

    solid = rgba[..., 3] > 127
    stat = {
        "key": key, "slot": "leg", "shape": shape, "source": "v3",
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
    ap.add_argument("--only", default=None, help="a comma list of shapes")
    args = ap.parse_args()

    M = _controls_module()
    c, law = read_contract(), read_law()
    want = shapes()
    if args.only:
        pick = {s.strip() for s in args.only.split(",")}
        missing = pick - set(want)
        if missing:
            sys.exit(f"bots-sd-controls-v3-legs: no such leg shape {sorted(missing)}; have {want}")
        want = [s for s in want if s in pick]

    for layout in ("contract", "square"):
        items = []
        for shape in want:
            maps, stat = build(M, c, law, shape, layout, args.res)
            M.write_part(os.path.join(OUT, layout, stat["key"]), maps)
            items.append(stat)
            print(f"  {layout:<9} {stat['key']:<16} {stat['workingCanvas'][0]}x{stat['workingCanvas'][1]}"
                  f"  coral {stat['share']['coral']:.3f}  bands {stat['bands']}")
        kept = merge_manifest(os.path.join(OUT, layout, "manifest.json"), layout, args.res, items)
        print(f"  {layout}: wrote {len(items)} leg entries, kept {kept} from the other lane")
    print(f"bots-sd-controls-v3-legs: {len(want)} shapes -> {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
