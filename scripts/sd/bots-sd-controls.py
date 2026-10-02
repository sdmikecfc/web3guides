"""BATTLE BOTS / stable-diffusion lane C: THE CONTROL MAPS.

    python scripts/sd/bots-sd-controls.py                      # every part, contract canvas + 1024 square
    python scripts/sd/bots-sd-controls.py --only head-t3-1     # one part
    python scripts/sd/bots-sd-controls.py --layout sheet       # the parts-tray sheets
    python scripts/sd/bots-sd-controls.py --res 768            # SD1.5-native working size
    python scripts/sd/bots-sd-controls.py --contact            # write review contact sheets
    python scripts/sd/bots-sd-controls.py --source v3 --layout both --contact
                                                               # the v3 shape-table rulers, into a
                                                               # separate art-src/sd/controls/v3 tree
    python scripts/sd/bots-sd-controls.py --source v2 --layout all --contact
                                                               # the v2 featured rulers, into a
                                                               # separate art-src/sd/controls/v2 tree

Writes art-src/sd/controls/<layout>/<key>/{depth,lineart,canny,alpha,hidden,
joints}.png plus one manifest.json per layout. Nothing here touches the repo's
existing art: it READS public/bots-art and writes only under art-src/sd.

── THE V2 SOURCE (2026-09-05) ─────────────────────────────────────────────
`--source v2` reads public/bots-art/_raw/parts/placeholders-v2/target, the
rulers `node scripts/bots-bake-parts.mjs --out v2` writes: the same canvases
and pivots, but the limbs, weapons and torso carry the features the concept
shelf shows (elbow ball and band, cuff, mitt or claw; knee band, ankle cuff,
boot with a thick sole; mallet bands and bolt; wrench jaws; torso panel line,
rivets and key seat). The old arm control was a featureless capsule, so the
model invented a robot inside it. v2 is ON TARGET already (a ControlNet does
not carry the unconditioned generator's bias), so it is loaded as is with no
un-bias. Everything v2 goes under art-src/sd/controls/v2/<layout>/ and its
contact sheets under art-src/sd/controls/v2/_contact/, so the current
controls and the jobs built from them are untouched.

── THE V3 SOURCE (2026-09-05) ─────────────────────────────────────────────
`--source v3` reads public/bots-art/_raw/parts/placeholders-v3/target, the
SHAPE TABLE rulers `node scripts/bots-bake-parts.mjs --out v3` writes. Same
canvas and same pivots again, but the part axis is no longer tier and design:
it is SHAPE and MOUTH, and a part key looks like `head-bear-smile`. Which
keys exist is READ from the v3 manifests on disk (manifest-head.json, and
manifest-leg.json once the leg lane has written one), never carried here, so
a key can only exist if a ruler exists and a shape added to the table cannot
be missed. v3 is ON TARGET, so it is loaded as is. Everything v3 goes under
art-src/sd/controls/v3/<layout>/ and its contact sheets under
art-src/sd/controls/v3/_contact/, so the default and v2 trees, and the jobs
built from them, are untouched.

── WHY THE MAPS ARE SYNTHESISED, NOT ANNOTATED ────────────────────────────
The normal ControlNet workflow runs an annotator (MiDaS, HED, lineart) over a
photo to GUESS a depth or an edge map. We do not have to guess. Every
placeholder in public/bots-art/parts was drawn by scripts/bots-bake-parts.mjs
out of primitives at coordinates the contract fixes, so the geometry is known
exactly and the maps below are DERIVED from it. Three things follow, and they
are the reason this lane is cheap:

  1. no annotator model is downloaded, run or licensed. Every annotator
     licence question (Depth-Anything-V2 is CC-BY-NC, some lineart annotators
     are non-commercial) is simply moot for us;
  2. the maps are exact rather than estimated, so a failure in the sweep is
     the generator's failure and never the annotator's;
  3. the maps carry SEMANTICS an annotator could never recover: this file
     knows which pixels are the eye lens (a dome, pushed forward), which are
     the grille (a hole, pushed back) and which are the one brass key,
     because it reads the same paintable law the shipped mask deriver reads.

── THE BANDING TRAP, AND WHY EDGES ARE FOUND IN CHROMA ────────────────────
The bake shades every part with a QUANTIZED vertical ramp: 6 to 24 stepped
bands per part, by the clay law. Run any ordinary edge detector over that and
you get a BARCODE: one horizontal line per band, every one of them an artifact
of the shading rather than a feature of the form. Condition a render on that
and the model paints stripes onto the part.

The ramp is a pure multiply (`mulHex`: each channel scaled by the same
factor), so it changes VALUE and leaves CHROMATICITY exactly alone. Measured
on head t3-1: 95,112 opaque pixels, of which 82,019 fall in just two
chromaticity bins. So edges are found in chromaticity, where the banding does
not exist at all, fused with the alpha boundary and with a luminance channel
the ramp has been divided out of. Zero stripes, and every real boundary
(clay against brass, clay against grille, and the soft cool outline stroke the
bake draws at every shape edge) survives at full strength.

── WHICH IMAGE WE CONDITION ON ────────────────────────────────────────────
See scripts/sd/bots_sd_source.py, which owns that question and shows its
working. The short version: the bake's ON-TARGET clay placeholder is not on
disk any more (the import wrote the generated art over it, all 40 parts), the
surviving ruler is deliberately mis-proportioned for an UNCONDITIONED
generator, and a ControlNet does not have that bias. So the default source is
`unbias`: the ruler with the bake's own PRE table divided back out, which
measures 0 ratios outside the contract band, 0 pivots off the ink and 0 parts
clipped. `--source ship` and `--source ruler` exist to A/B against.

── A NOTE FOR THE BAKE'S OWNER (do not action here) ───────────────────────
scripts/bots-bake-parts.mjs rasterises its SVG in memory and writes only the
PNG. One line beside the existing writeFileSync, dumping the svgText, would
let this file build control maps at ANY working resolution with no resampling
at all, instead of Lanczos-upscaling a 128 px arm to 880 px. Worth it if the
sweep ends up running at 1024 or above. Not changed here: that file belongs to
another lane.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, gaussian_filter1d, sobel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bots_sd_contract import (  # noqa: E402
    DESIGNS,
    TIERS,
    classify,
    every_part,
    part_key,
    read_contract,
    read_law,
    rig_points_named,
    verify_against_disk,
)
from bots_sd_source import load as load_source, read_pre  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "art-src", "sd", "controls")
# the v2 featured rulers (see the header) and where their controls go
V2_RULERS = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v2", "target")
V2_RULER_NAME = {"head": "head", "torso": "torso", "arm": "arms", "leg": "legs", "weapon": "weapon"}
OUT_V2 = os.path.join(OUT, "v2")
# the v3 shape-table rulers (see the header) and where their controls go
V3_RULERS = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v3", "target")
V3_MANIFESTS = ("manifest-head.json", "manifest-leg.json")
OUT_V3 = os.path.join(OUT, "v3")


def v3_keys() -> list[tuple[str, str]]:
    """(slot, key) for every look the v3 manifests on disk declare, in table
    order. READ, never guessed: a shape table this file carried its own copy
    of would drift from the bake the day a shape is added, and every control
    map built from the stale copy would be conditioned on a ruler that is not
    there, with nothing anywhere complaining."""
    root = os.path.dirname(V3_RULERS)
    out: list[tuple[str, str]] = []
    for name in V3_MANIFESTS:
        p = os.path.join(root, name)
        if not os.path.exists(p):
            continue
        m = json.load(open(p, encoding="utf-8"))
        looks = m.get("looks")
        if not looks:
            # LOUD, NEVER SILENT. A v3 manifest that declares no `looks` list
            # is a lane whose rulers this file cannot name, and skipping it
            # quietly would build a controls tree that is missing half the
            # table with nothing anywhere saying so.
            print(f"  note: {name} declares no `looks` list, so its rulers get no control maps here. "
                  f"Each entry needs a `key` naming its ruler PNG under target/.")
            continue
        for look in looks:
            out.append((m["slot"], look["key"]))
    if not out:
        sys.exit(f"bots-sd-controls --source v3: no v3 manifest under {root}. "
                 f"Run `node scripts/bots-bake-parts.mjs --out v3` first.")
    return out


def load_any(c: dict, pre: dict, slot: str, tier: int, design: int, source: str,
             key: str | None = None) -> Image.Image:
    """`v2` and `v3` are loaded here, on target and un-resampled; every other
    source is bots_sd_source's. A ruler on the wrong canvas is a hard exit,
    because a control map on the wrong canvas is a silhouette the game cannot
    use. `key` names a v3 look (head-bear-smile) and is required for v3,
    whose parts are not on the tier and design axis at all."""
    if source == "v3":
        if not key:
            sys.exit("bots-sd-controls: --source v3 needs a look key")
        p = os.path.join(V3_RULERS, f"{key}.png")
        if not os.path.exists(p):
            sys.exit(f"bots-sd-controls: missing v3 ruler {p}. "
                     f"Run `node scripts/bots-bake-parts.mjs --out v3` first.")
        im = Image.open(p).convert("RGBA")
        want = (c["rig"][slot]["w"], c["rig"][slot]["h"])
        if im.size != want:
            sys.exit(f"bots-sd-controls: v3 ruler {p} is {im.size}, the contract says {want}")
        return im
    if source != "v2":
        return load_source(c, pre, slot, tier, design, source)
    p = os.path.join(V2_RULERS, f"{V2_RULER_NAME[slot]}-t{tier}-{design}.png")
    if not os.path.exists(p):
        sys.exit(f"bots-sd-controls: missing v2 ruler {p}. Run `node scripts/bots-bake-parts.mjs --out v2` first.")
    im = Image.open(p).convert("RGBA")
    want = (c["rig"][slot]["w"], c["rig"][slot]["h"])
    if im.size != want:
        sys.exit(f"bots-sd-controls: v2 ruler {p} is {im.size}, the contract says {want}")
    return im

# ── the shape of the relief ────────────────────────────────────────────────
# A vinyl toy is not a hemisphere and it is not a flat card. Profile exponent
# p in z = (1 - (1 - t)^p)^(1/p): p = 2 is a true hemisphere (a balloon), p = 4
# is nearly a flat top with a fast rounded rim, which is what a moulded vinyl
# part actually is. 3.0 sits between and matches the anchor's read.
PROFILE_P = 3.0
# The part's nearest surface sits at this depth, its silhouette rim at the
# floor. Background is 0. Keeping the rim off 0 stops the depth ControlNet
# reading the rim as a second, deeper object.
DEPTH_NEAR = 1.00
DEPTH_RIM = 0.30
# Accent relief, in depth units, added on top of the body form. A grille is a
# HOLE and a lens is a DOME; this is the single most valuable thing the maps
# carry, because it is what makes a generated head read as a face rather than
# as a blank egg with two flat discs painted on it.
# THE CORAL SOLE STANDS PROUD (2026-09-05). The v2 leg ruler draws its sole in
# the coral material (bots-bake-parts.mjs MAT.coral, --out v2 only); at 0.0 it
# reached the depth map as part of the boot's own dome and the model painted
# it as a grey base with coral rims elsewhere (192 of 192 production legs
# rejected for NO SOLE or CORAL SPILL). A thick rubber sole seen dead-on is a
# lip in front of the boot, so it gets the key's relief and a little more: one
# step, one block, one straight top edge. Under the lens (+0.09), so body_top
# and every other part's depth map are unchanged.
ACCENT_DZ = {"grille": -0.20, "lens": +0.09, "metal": +0.05, "rubber": -0.03, "coral": +0.06}
# The lens gets its own little dome on top of the offset.
LENS_DOME = 0.07

# CANNY THRESHOLDS, ABSOLUTE, in the normalised fused-gradient space, and
# absolute rather than percentile ON PURPOSE. A percentile threshold asks "what
# are the top N percent of gradients in THIS image", so it moves with how much
# of a part happens to be edge: a plain tier-1 torso and a busy tier-4 head do
# not agree about what a line is, and the tier-4's faint crown decal is thrown
# away for being in the bottom 82 percent of a busy image. The measured gap is
# stable instead: a shading band lands at 0.009 and the bake's own outline
# stroke at 0.145, so a hysteresis pair inside that gap holds for every part.
CANNY_LO, CANNY_HI = 0.035, 0.090
# the chromaticity shift that separates the bake's outline stroke from an
# 8-bit rounding artifact of the light ramp. See real_line_veto().
STROKE_CHROMA_MIN = 0.003
LINEART_GAMMA = 0.65
# THE NOISE FLOOR, and it is not a taste number.
# The bake's light ramp is a per-channel multiply that ROUNDS TO 8 BITS, so it
# is not quite chromaticity-preserving and each band boundary leaves a tiny
# chroma step. Measured down a plain clay column of head t3-1: a band step
# moves the red chromaticity by 0.0005 to 0.0015, giving a Sobel response of
# 0.0087 once normalised. The weakest thing that is a REAL feature is the
# bake's own outline stroke, rgba(52,58,78,0.34) composited over clay, which
# moves it by 0.0063 for a normalised response of 0.145. So there is a clean
# 16x gap, and a floor in the middle of it removes every band and keeps every
# line. It matters because LINEART_GAMMA lifts small values hard: without the
# floor an 0.0087 band comes out of the gamma at 0.05, faint but visible, and
# a lineart ControlNet paints faint visible stripes onto the part.
NOISE_FLOOR = 0.05

SLOT_ORDER = ("head", "torso", "arm", "leg", "weapon")


# ── helpers ────────────────────────────────────────────────────────────────

def to_u8(x: np.ndarray) -> np.ndarray:
    return np.clip(x * 255.0 + 0.5, 0, 255).astype(np.uint8)


def save_gray(path: str, x: np.ndarray) -> None:
    Image.fromarray(to_u8(x), "L").save(path)


def upscale(im: Image.Image, sx: float, sy: float) -> Image.Image:
    w, h = im.size
    return im.resize((max(1, round(w * sx)), max(1, round(h * sy))), Image.LANCZOS)


def chroma(rgb: np.ndarray, val: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """r and g as a share of the total. Undefined near black, so anything
    darker than the rubber ceiling is pinned to neutral rather than left to
    produce noise: rubber is 3 percent of a part and 100 percent of the noise."""
    s = rgb.sum(axis=-1) + 1e-6
    cr, cg = rgb[..., 0] / s, rgb[..., 1] / s
    dark = val < 0.10
    cr = np.where(dark, 1 / 3, cr)
    cg = np.where(dark, 1 / 3, cg)
    return cr, cg


def deband(val: np.ndarray, ink: np.ndarray, band_px: float) -> np.ndarray:
    """Take the bake's vertical ramp out of the luminance by ROW MEDIAN.

    First attempt here subtracted a vertical low pass wider than a band, on the
    reasoning that the blur would swallow the staircase. It does the opposite:
    a band boundary is a step, a step is high frequency, and subtracting a low
    pass KEEPS the high frequencies. The result was a lineart map with one
    bright horizontal stripe per band, i.e. exactly the barcode this was
    written to prevent. Kept as a comment because it looks right and is not.

    What is actually true of the ramp is that it is CONSTANT ALONG A ROW: the
    bake emits `<rect>` bands spanning each shape's full bbox width, filled
    with one multiply of the base colour. So the row median over the ink is the
    ramp value for that row, whatever the band count, and dividing it out is
    exact rather than approximate. It also removes any feature that genuinely
    spans a whole row at one value, which on these parts is only the head
    crease; every material seam survives in the chroma channel regardless.
    """
    v = np.where(ink, val, np.nan)
    empty = ~ink.any(axis=1)
    v[empty, 0] = 1.0                      # a fully transparent row has no median
    with np.errstate(invalid="ignore"):
        rowmed = np.nanmedian(v, axis=1)
    rowmed = np.where(np.isnan(rowmed), 1.0, rowmed)
    out = np.where(ink, val / np.maximum(rowmed[:, None], 1e-3), 1.0)
    return np.clip(out, 0.0, 2.0) * 0.5


def grad_mag(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    gy, gx = sobel(x, axis=0, mode="nearest"), sobel(x, axis=1, mode="nearest")
    return np.hypot(gx, gy), np.arctan2(gy, gx)


def canny(mag: np.ndarray, ang: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Non-maximum suppression + hysteresis, the back half of Canny, run on a
    gradient we FUSED ourselves rather than on raw luminance. Written out
    because opencv is not installed and adding it for forty small images would
    be the wrong trade."""
    q = (np.round(ang / (math.pi / 4)) % 4).astype(np.int8)
    keep = np.zeros_like(mag, dtype=bool)
    pad = np.pad(mag, 1, mode="edge")
    nb = {
        0: ((1, 2), (1, 0)),   # 0 deg   -> compare left/right
        1: ((0, 2), (2, 0)),   # 45 deg
        2: ((0, 1), (2, 1)),   # 90 deg
        3: ((0, 0), (2, 2)),   # 135 deg
    }
    H, W = mag.shape
    for d, ((ay, ax), (by, bx)) in nb.items():
        m = q == d
        a = pad[ay:ay + H, ax:ax + W]
        b = pad[by:by + H, bx:bx + W]
        keep |= m & (mag >= a) & (mag >= b)
    strong = keep & (mag >= hi)
    weak = keep & (mag >= lo)
    # hysteresis: grow strong through weak until it stops moving
    out = strong.copy()
    for _ in range(64):
        grown = out.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                grown |= np.roll(np.roll(out, dy, 0), dx, 1)
        nxt = grown & weak
        if nxt.sum() == out.sum():
            break
        out = nxt | strong
    return out


def dilate(b: np.ndarray, n: int = 1) -> np.ndarray:
    out = b.copy()
    for _ in range(n):
        g = out.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                g |= np.roll(np.roll(out, dy, 0), dx, 1)
        out = g
    return out


# ── the maps for one part ──────────────────────────────────────────────────

def real_line_veto(rgba: np.ndarray, cls: dict[str, np.ndarray], ink: np.ndarray) -> np.ndarray:
    """Where a line is ALLOWED to be. Everything else in the edge map is a
    shading band and is deleted.

    Every line the bake actually draws is one of exactly two things, and
    neither of them is a gradient question:

      1. a MATERIAL BOUNDARY - clay against the lens, the grille, the brass
         key, the rubber grip or the coral shoe. Those are label changes, so
         the boundary of the label image finds them with no threshold at all;

      2. the bake's own OUTLINE STROKE, `rgba(52,58,78,0.34)` over clay, which
         is how one clay shape reads against another. It is a COLOUR, not a
         gradient: it pulls the red chromaticity of clay from 0.3220 down to
         0.3157 at full light and to 0.3123 at half light, a shift of 0.006 to
         0.010. The shading bands, by contrast, are a per-channel multiply and
         move chromaticity only by 8-bit rounding, at most 0.0015. So a flat
         chromaticity-distance test at 0.003 sits with a 2x margin on both
         sides and separates them everywhere, at every point of the ramp,
         which is exactly what no gradient threshold could do.
    """
    rgb = rgba[..., :3].astype(np.float64) / 255.0
    val = rgb.max(axis=-1)
    cr, _ = chroma(rgb, val)

    label = np.zeros(rgba.shape[:2], dtype=np.int8)
    for i, k in enumerate(("lens", "grille", "metal", "rubber", "coral"), start=1):
        label[cls[k] & ink] = i
    boundary = np.zeros_like(ink)
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        boundary |= (label != np.roll(np.roll(label, dy, 0), dx, 1))
    boundary &= ink

    clay = cls["body"] & ink
    base_cr = float(np.median(cr[clay])) if clay.any() else 1 / 3
    stroke = clay & (np.abs(cr - base_cr) > STROKE_CHROMA_MIN)

    return dilate(boundary | stroke | ~ink, 2)


def build_maps(rgba: np.ndarray, cls: dict[str, np.ndarray], band_px: float) -> dict[str, np.ndarray]:
    a = rgba[..., 3].astype(np.float64) / 255.0
    rgb = rgba[..., :3].astype(np.float64) / 255.0
    val = rgb.max(axis=-1)
    ink = a > 0.5

    # ---- DEPTH -------------------------------------------------------------
    # Distance to the outside of the silhouette, shaped into a moulded relief.
    edt = distance_transform_edt(ink)
    mx = edt.max()
    t = np.clip(edt / max(mx, 1e-6), 0, 1)
    z = (1.0 - np.power(1.0 - t, PROFILE_P)) ** (1.0 / PROFILE_P)
    # The BODY form stops short of DEPTH_NEAR so the proud accents have
    # somewhere to go. Without this headroom the eye lens sits in the middle of
    # a dome that is already at 1.0, its +0.09 clips, and the depth map tells
    # the model the eye is flush with the face: a blank egg with two decals,
    # which is one of the failures the sweep exists to remove.
    body_top = DEPTH_NEAR - max(ACCENT_DZ.values()) - LENS_DOME
    depth = np.where(ink, DEPTH_RIM + (body_top - DEPTH_RIM) * z, 0.0)

    # accents are geometry, not paint: the grille sinks, the lens and the key
    # stand proud. Without this a generated head is an egg with two decals.
    for name, dz in ACCENT_DZ.items():
        m = cls[name] & ink
        if dz and m.any():
            depth = depth + dz * m
    if cls["lens"].any():
        ledt = distance_transform_edt(cls["lens"] & ink)
        if ledt.max() > 0:
            lt = np.clip(ledt / ledt.max(), 0, 1)
            depth = depth + LENS_DOME * np.sqrt(np.clip(1 - (1 - lt) ** 2, 0, 1))
    depth = np.where(ink, np.clip(depth, 0.05, 1.0), 0.0)
    depth = np.where(ink, gaussian_filter(depth, 1.0), 0.0)

    # ---- EDGES -------------------------------------------------------------
    cr, cg = chroma(rgb, val)
    vd = deband(val, ink, band_px)
    inside = distance_transform_edt(ink) > 1.5   # ignore chroma noise on the rim

    mr, ar = grad_mag(gaussian_filter(cr, 0.8))
    mg, ag = grad_mag(gaussian_filter(cg, 0.8))
    mv, av = grad_mag(gaussian_filter(vd, 0.8))
    ma, aa = grad_mag(gaussian_filter(a, 0.8))

    def norm(x: np.ndarray, m: np.ndarray, floor: float = 0.0) -> np.ndarray:
        sel = x[m] if m.any() else x.ravel()
        p = np.percentile(sel, 99.0) if sel.size else 1.0
        y = np.clip(x / max(p, 1e-6), 0, 1)
        return np.clip((y - floor) / max(1e-6, 1 - floor), 0, 1) if floor else y

    chroma_e = np.maximum(norm(mr, inside, NOISE_FLOOR), norm(mg, inside, NOISE_FLOOR)) * inside
    value_e = norm(mv, inside, NOISE_FLOOR) * inside * 0.55
    alpha_e = norm(ma, np.ones_like(ink, bool))

    fused = np.maximum(np.maximum(chroma_e, value_e), alpha_e)
    # angle of whichever source won, for the NMS
    stack = np.stack([chroma_e, value_e, alpha_e])
    angs = np.stack([np.where(mr >= mg, ar, ag), av, aa])
    ang = np.take_along_axis(angs, stack.argmax(0)[None], 0)[0]

    edges = canny(fused, ang, CANNY_LO, CANNY_HI) & real_line_veto(rgba, cls, ink)
    edges |= (ma > np.percentile(ma[ma > 0], 60)) & (a > 0.15) & (a < 0.85)  # the silhouette, always

    # LINEART = the soft profile of the fused gradient, GATED BY CANNY.
    #
    # The soft map on its own still carries the shading bands, and the reason
    # is worth writing down because it defeated two earlier fixes. The bake's
    # ramp is a per-channel multiply ROUNDED TO 8 BITS, so a band boundary
    # leaves a chroma step of about 0.0015 and a value step of about 0.008 -
    # tiny, an order of magnitude under the weakest real line, but LINEART_GAMMA
    # lifts 0.009 to 0.05 and a lineart ControlNet will happily paint a faint
    # stripe. Subtracting a vertical low pass made it worse (a band edge is a
    # step, and subtracting a low pass keeps steps). A row-median divide and a
    # normalised noise floor both help and neither is sufficient, because the
    # bake gives every overlapping SHAPE its own band grid, so the ramp is not
    # row-constant across a part and no single threshold separates all of them.
    #
    # Canny already answers the question correctly: its non-maximum suppression
    # and hysteresis accept the real lines and reject every band. So the
    # decision about WHAT is a line is canny's, and the soft map only shapes
    # HOW that line falls off. Gating one by the other gives a stripe-free
    # softedge map that still carries a gradient a lineart model can read.
    gate = dilate(edges, 3).astype(float)
    gate = np.clip(gaussian_filter(gate, 1.2) * 1.6, 0, 1)
    lineart = np.power(np.clip(gaussian_filter(fused, 0.9) * 1.35, 0, 1), LINEART_GAMMA) * gate
    lineart = np.maximum(lineart, edges.astype(float) * 0.9)

    return {
        "depth": depth,
        "canny": edges.astype(float),
        "lineart": lineart,
        "alpha": a,
    }


def hidden_mask(c: dict, slot: str, w: int, h: int) -> np.ndarray:
    """The rows the assembled bot COVERS: the limb cap the body group buries,
    and the head skirt the torso hides. Nothing in this band ever reaches a
    player's eye, so a candidate must not be scored on it and a repair pass
    must never be asked to paint it."""
    m = np.zeros((h, w), dtype=bool)
    if slot in ("arm", "leg"):
        # scripts/bots-art-check.mts measures burial as (pivotY - inkTop) / inkWidth
        # and requires 0.35..0.60, i.e. the ink ABOVE the pivot is the cap the
        # body group covers. Everything below the pivot is on show.
        pivot_y = c["rig"][slot]["shoulder" if slot == "arm" else "hip"][1]
        m[:pivot_y, :] = True
    elif slot == "torso":
        m[: int(c["rig"]["torso"]["neck"][1]), :] = True          # under the head
    elif slot == "head":
        m[int(c["rig"]["head"]["neck"][1]):, :] = True            # the buried skirt
    return m


def joints_overlay(c: dict, slot: str, w: int, h: int, sx: float, sy: float,
                   ox: int, oy: int) -> tuple[np.ndarray, list]:
    """A REVIEW image and a JSON record, and deliberately NOT a control input.

    There is no ControlNet that reads a marker dot. OpenPose comes closest and
    is the wrong tool twice over: it wants a whole human skeleton, and every
    part here is generated alone on its own canvas. What actually forces a
    joint into the right place is the geometry the depth and lineart maps
    already carry (a cap of known radius at a known pixel) plus the fixed
    canvas, so the pivot is enforced by construction. This overlay exists so a
    person can see that at a glance, and the JSON so the scorer can measure it.
    """
    img = np.zeros((h, w), dtype=float)
    rec = []
    yy, xx = np.mgrid[0:h, 0:w]
    for name, (px, py) in rig_points_named(c, slot):
        X, Y = ox + px * sx, oy + py * sy
        rec.append({"name": name, "contract": [px, py], "working": [round(X, 1), round(Y, 1)],
                    "onCanvas": 0 <= X < w and 0 <= Y < h})
        if not (0 <= X < w and 0 <= Y < h):
            continue
        d = np.hypot(xx - X, yy - Y)
        img = np.maximum(img, np.clip(1.4 - d / 7.0, 0, 1))
    return img, rec


# ── layouts ────────────────────────────────────────────────────────────────

def place_contract(w: int, h: int, res: int) -> tuple[int, int, float, float, int, int]:
    return w, h, 1.0, 1.0, 0, 0


def place_square(w: int, h: int, res: int, fill: float = 0.86):
    k = fill * res / max(w, h)
    # snap so the part lands on a whole pixel grid; SD works in units of 8
    tw, th = round(w * k), round(h * k)
    return res, res, tw / w, th / h, (res - tw) // 2, (res - th) // 2


def build_one(c: dict, law: dict, pre: dict, slot: str, tier: int, design: int,
              layout: str, res: int, source: str, key: str | None = None) -> tuple[dict, dict]:
    base = load_any(c, pre, slot, tier, design, source, key)
    w, h = base.size

    if layout == "contract":
        W, H, sx, sy, ox, oy = place_contract(w, h, res)
    else:
        W, H, sx, sy, ox, oy = place_square(w, h, res)

    big = upscale(base, sx, sy)
    rgba = np.asarray(big).astype(np.uint8)
    cls = classify(rgba, law, float(c["figure"]["metalSatMin"]))

    # one band is about (ink span / bandCount) rows in the SOURCE; the bake
    # uses one band per 20 source px, clamped 6..24.
    ink_rows = np.where(rgba[..., 3] > 0)[0]
    span = (ink_rows.max() - ink_rows.min() + 1) if ink_rows.size else h
    n_bands = max(6, min(24, round(span / (20 * sy))))
    band_px = span / max(n_bands, 1)

    maps = build_maps(rgba, cls, band_px)

    # paste into the working canvas
    out: dict[str, np.ndarray] = {}
    for k, v in maps.items():
        canvas = np.zeros((H, W), dtype=float)
        canvas[oy:oy + v.shape[0], ox:ox + v.shape[1]] = v
        out[k] = canvas

    hid = hidden_mask(c, slot, w, h)
    hid_big = np.asarray(Image.fromarray((hid * 255).astype(np.uint8), "L")
                         .resize((big.size[0], big.size[1]), Image.NEAREST)) > 127
    canvas = np.zeros((H, W), dtype=float)
    canvas[oy:oy + hid_big.shape[0], ox:ox + hid_big.shape[1]] = hid_big & (np.asarray(big)[..., 3] > 127)
    out["hidden"] = canvas

    j_img, j_rec = joints_overlay(c, slot, W, H, sx, sy, ox, oy)
    out["joints"] = j_img

    stat = {
        "key": key or part_key(slot, tier, design),
        "slot": slot, "tier": tier, "design": design,
        "source": source,
        "contractCanvas": [w, h],
        "workingCanvas": [W, H],
        "placement": {"scaleX": round(sx, 6), "scaleY": round(sy, 6), "offsetX": ox, "offsetY": oy},
        "cropBack": [ox, oy, ox + round(w * sx), oy + round(h * sy)],
        "bands": n_bands,
        "joints": j_rec,
        "share": {k: round(float((cls[k] & (rgba[..., 3] > 127)).sum())
                           / max(1, int((rgba[..., 3] > 127).sum())), 4)
                  for k in ("body", "accent", "metal", "grille", "lens", "rubber", "coral")},
        "hiddenShare": round(float(canvas.sum()) / max(1, int((rgba[..., 3] > 127).sum())), 4),
    }
    return out, stat


def write_part(dst: str, maps: dict[str, np.ndarray]) -> None:
    os.makedirs(dst, exist_ok=True)
    for k, v in maps.items():
        save_gray(os.path.join(dst, f"{k}.png"), v)


# ── the tray sheets ────────────────────────────────────────────────────────
# One square canvas carrying several parts at ONE scale under ONE light, which
# is the composition concept scene 6 (the parts shelf) and scene 2 (the parts
# tray) already use. Three reasons it is the recommended sweep layout:
#   * an arm's canvas is 128 x 280, an aspect of 0.46. Letterboxed alone into a
#     square it fills 40 percent of the frame and the model has 60 percent of
#     empty plate to invent something in;
#   * every part on a sheet shares one camera and one key light BY
#     CONSTRUCTION, which is the mixability law, rather than by hoping two
#     separate renders agreed;
#   * it scores N parts per render. At eight per sheet the sweep costs an
#     eighth as much per part.
# The risk is attention bleed between neighbours (a head's eyes turning up on
# a torso). Gutters below are deliberately wide, and single-vs-sheet is the
# first A/B the GPU lane should run.

TRAYS = {
    # one family's whole kit, the thing a player actually sees together
    **{f"kit-t{t}-{d}": [(s, t, d) for s in SLOT_ORDER] for t in TIERS for d in DESIGNS},
    # one slot across all tiers: the shop shelf row, for tier-consistency work
    **{f"row-{s}": [(s, t, d) for t in TIERS for d in DESIGNS] for s in SLOT_ORDER},
}


def shelf_pack(sizes: list[tuple[int, int]], res: int, gutter: int, k: float):
    """Place boxes scaled by ONE shared factor k, left to right, wrapping into
    rows. Returns the placements, or None if they do not fit in res x res."""
    place, x, y, row_h = [], gutter, gutter, 0
    for w, h in sizes:
        tw, th = max(1, round(w * k)), max(1, round(h * k))
        if x + tw + gutter > res and row_h:
            x, y, row_h = gutter, y + row_h + gutter, 0
        if y + th + gutter > res:
            return None
        place.append((x, y, tw, th))
        x += tw + gutter
        row_h = max(row_h, th)
    return place if y + row_h + gutter <= res else None


def build_tray(c: dict, law: dict, pre: dict, name: str, items: list, res: int, source: str,
               gutter: int = 28) -> tuple[dict, dict]:
    # ONE SHARED SCALE ACROSS THE WHOLE TRAY, AS LARGE AS WILL FIT.
    #
    # One scale is not negotiable: per-cell scaling would re-create the "wrong
    # zoom" defect inside our own packer, and the whole reason to put five
    # parts on one canvas is that they then share a camera by construction.
    #
    # But an equal-cell grid picks that scale badly. A kit is a 456x384 head, a
    # 288x264 torso, a 128x280 arm, a 192x280 leg and a 240x136 weapon; a 3x2
    # grid of equal cells is sized by the head and then the arm gets 8 percent
    # of the canvas, so the model is handed a mostly empty frame and 85 px of
    # arm to put a vinyl finish on. Measured on the first version of this
    # function: the five parts covered 14 percent of the 1024 square.
    #
    # So: shelf-pack at one scale and binary search for the largest scale that
    # still fits. Same guarantee, several times the pixels per part.
    sizes = [(c["rig"][s]["w"], c["rig"][s]["h"]) for s, _, _ in items]
    lo, hi = 0.05, 8.0
    best = None
    for _ in range(40):
        mid = (lo + hi) / 2
        p = shelf_pack(sizes, res, gutter, mid)
        if p:
            best, lo = (mid, p), mid
        else:
            hi = mid
    if not best:
        sys.exit(f"tray {name}: nothing fits in {res}x{res}")
    k, place = best

    out = {kk: np.zeros((res, res), dtype=float) for kk in
           ("depth", "canny", "lineart", "alpha", "hidden", "joints")}
    boxes = []

    for i, (slot, tier, design) in enumerate(items):
        w, h = c["rig"][slot]["w"], c["rig"][slot]["h"]
        ox, oy, tw, th = place[i]

        big = upscale(load_any(c, pre, slot, tier, design, source), tw / w, th / h)
        rgba = np.asarray(big).astype(np.uint8)
        cls = classify(rgba, law, float(c["figure"]["metalSatMin"]))
        ink_rows = np.where(rgba[..., 3] > 0)[0]
        span = (ink_rows.max() - ink_rows.min() + 1) if ink_rows.size else th
        band_px = span / max(6, min(24, round(span / (20 * th / h))))
        maps = build_maps(rgba, cls, band_px)

        for kk, v in maps.items():
            out[kk][oy:oy + v.shape[0], ox:ox + v.shape[1]] = np.maximum(
                out[kk][oy:oy + v.shape[0], ox:ox + v.shape[1]], v)
        hid = hidden_mask(c, slot, w, h)
        hb = np.asarray(Image.fromarray((hid * 255).astype(np.uint8), "L")
                        .resize((tw, th), Image.NEAREST)) > 127
        out["hidden"][oy:oy + th, ox:ox + tw] = np.maximum(
            out["hidden"][oy:oy + th, ox:ox + tw], (hb & (rgba[..., 3] > 127)).astype(float))
        ji, jr = joints_overlay(c, slot, res, res, tw / w, th / h, ox, oy)
        out["joints"] = np.maximum(out["joints"], ji)
        boxes.append({"key": part_key(slot, tier, design), "slot": slot, "tier": tier,
                      "design": design, "box": [ox, oy, ox + tw, oy + th],
                      "contractCanvas": [w, h], "joints": jr})

    fill = sum(b[2] * b[3] for b in place) / (res * res)
    stat = {"key": name, "layout": "sheet", "workingCanvas": [res, res],
            "scale": round(k, 6), "gutter": gutter, "canvasFill": round(fill, 4),
            "parts": boxes}
    return out, stat


# ── contact sheet, for a person ────────────────────────────────────────────

def contact(paths: list[tuple[str, str]], dst: str, cell: int = 210) -> None:
    cols = 6
    rows = math.ceil(len(paths) / cols)
    sheet = Image.new("RGB", (cols * cell, rows * cell), (16, 16, 18))
    for i, (label, p) in enumerate(paths):
        im = Image.open(p).convert("RGB")
        im.thumbnail((cell - 8, cell - 8))
        r, cc = divmod(i, cols)
        sheet.paste(im, (cc * cell + (cell - im.width) // 2, r * cell + (cell - im.height) // 2))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    sheet.save(dst, quality=90)


# ── main ───────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", default="both", choices=["contract", "square", "sheet", "both", "all"])
    ap.add_argument("--res", type=int, default=1024)
    ap.add_argument("--source", default="unbias", choices=["unbias", "ruler", "ship", "v2", "v3"])
    ap.add_argument("--only", default=None, help="a part key like head-t3-1, or a tray name")
    ap.add_argument("--contact", action="store_true")
    args = ap.parse_args()

    c = read_contract()
    law = read_law()
    verify_against_disk(c)

    layouts = {"both": ["contract", "square"], "all": ["contract", "square", "sheet"]}.get(
        args.layout, [args.layout])
    pre = read_pre()
    # v2 and v3 get their own trees, so the current controls and jobs are
    # untouched; every other non-default source keeps its `-<source>` suffix
    out_root = {"v2": OUT_V2, "v3": OUT_V3}.get(args.source, OUT)
    suffix = "" if args.source in ("unbias", "v2", "v3") else "-" + args.source
    # THE V3 PART AXIS IS SHAPE AND MOUTH, NOT TIER AND DESIGN. Its looks are
    # read off the bake's own manifests; the tier the table is authored at
    # rides along so the stat rows keep the same columns every other layout
    # has. There is no v3 tray: a tray packs several slots of one family and
    # the shape table is one slot with sixteen looks of it.
    v3 = v3_keys() if args.source == "v3" else []
    v3_tier = 1
    if args.source == "v3":
        mp = os.path.join(os.path.dirname(V3_RULERS), "manifest-head.json")
        if os.path.exists(mp):
            v3_tier = int(json.load(open(mp, encoding="utf-8")).get("tier", 1))
        if "sheet" in layouts:
            sys.exit("bots-sd-controls --source v3: there is no tray layout for the shape table")

    total = 0
    for layout in layouts:
        base = os.path.join(out_root, layout + suffix)
        os.makedirs(base, exist_ok=True)
        manifest = {"layout": layout, "res": args.res, "source": args.source,
                    "sourceDir": {"v2": os.path.relpath(V2_RULERS, ROOT),
                                  "v3": os.path.relpath(V3_RULERS, ROOT)}.get(args.source),
                    "profileP": PROFILE_P, "accentDz": ACCENT_DZ, "items": []}

        if args.source == "v3":
            for slot, key in v3:
                if args.only and args.only != key:
                    continue
                maps, stat = build_one(c, law, pre, slot, v3_tier, 1, layout, args.res,
                                       args.source, key)
                write_part(os.path.join(base, key), maps)
                manifest["items"].append(stat)
                total += 1
                W, H = stat["workingCanvas"]
                print(f"  {layout:<9} {key:<24} {W}x{H}  hidden {stat['hiddenShare'] * 100:4.1f}%  "
                      f"lens {stat['share']['lens'] * 100:4.1f}%  grille {stat['share']['grille'] * 100:4.1f}%")
        elif layout == "sheet":
            items = {k: v for k, v in TRAYS.items() if not args.only or k == args.only}
            for name, spec in items.items():
                maps, stat = build_tray(c, law, pre, name, spec, args.res, args.source)
                write_part(os.path.join(base, name), maps)
                manifest["items"].append(stat)
                total += 1
                print(f"  {layout:<9} {name:<14} {args.res}x{args.res}  {len(spec)} parts  "
                      f"scale {stat['scale']:.2f}  canvas fill {stat['canvasFill'] * 100:.0f}%")
        else:
            for slot, t, d in every_part(c):
                key = part_key(slot, t, d)
                if args.only and args.only != key:
                    continue
                maps, stat = build_one(c, law, pre, slot, t, d, layout, args.res, args.source)
                write_part(os.path.join(base, key), maps)
                manifest["items"].append(stat)
                total += 1
                W, H = stat["workingCanvas"]
                print(f"  {layout:<9} {key:<14} {W}x{H}  hidden {stat['hiddenShare'] * 100:4.1f}%  "
                      f"lens {stat['share']['lens'] * 100:4.1f}%  metal {stat['share']['metal'] * 100:4.1f}%")

        with open(os.path.join(base, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=1)

        if args.contact and manifest["items"]:
            for m in ("depth", "lineart", "canny"):
                contact([(i["key"], os.path.join(base, i["key"], f"{m}.png"))
                         for i in manifest["items"]],
                        os.path.join(out_root, "_contact", f"{layout}{suffix}-{m}.jpg"))

    print(f"\n{total} control sets written under {os.path.relpath(out_root, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
