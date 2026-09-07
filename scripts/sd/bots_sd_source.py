"""BATTLE BOTS / stable-diffusion lane: WHICH IMAGE DO WE CONDITION ON.

Imported by scripts/sd/bots-sd-controls.py. Answers one question and shows its
working, because getting it wrong silently poisons every render in the sweep.

── WHAT IS ACTUALLY ON DISK, MEASURED 2026-09-05 ─────────────────────────
scripts/bots-bake-parts.mjs says it writes two renders of every part:

    public/bots-art/parts/<slot>/t<t>-<d>.png            ON TARGET (the game's placeholder)
    public/bots-art/_raw/parts/placeholders/<n>-t<t>-<d>.png   PRE-COMPENSATED (the ruler)

That is true the moment the bake runs. It is NOT true now. Checked all 40
parts: not one of them is pixel-identical to its ruler, INCLUDING the torsos
and the weapons, whose slots have no pre-compensation at all and so must be
identical if they are bake output. They are not, because
scripts/bots-import-parts.py writes the registered GENERATED art over the top
of the same path. Confirmed visually: the shipped head is a rendered clay head
with grey glass eyes, the ruler head is flat clay with cream lens eyes.

So the ON-TARGET clay placeholder does not exist on disk anywhere, and the
only geometry that is purely the contract is the ruler, which is deliberately
wrong on the arm and the leg.

── THE THREE SOURCES, AND WHY THE DEFAULT IS `unbias` ─────────────────────
  ship    public/bots-art/parts. This is generated art from the wave Mike
          rejected. Conditioning on it teaches the sweep the defects it is
          supposed to remove, and it is being rewritten by another lane while
          we work. Use it only to A/B against.

  ruler   the pre-compensated placeholder. Correct on head, torso and weapon
          (PRE has no entry for them, so plate == target there) and wrong by
          construction on the arm and the leg. The bias it carries was
          MEASURED ON AN UNCONDITIONED GENERATOR: text prompt plus a reference
          picture, no control. A ControlNet at strength 0.8 does not invent
          proportions, it fills a silhouette we hand it, so it does not have
          that bias, and pre-compensating it would bake a 16 percent narrow
          arm in on purpose. Correct for the old pipeline, wrong for this one.

  unbias  the ruler with the bake's own PRE table divided back out. DEFAULT.

── THE UN-BIAS, AND WHY IT IS NOT ONE AFFINE ──────────────────────────────
PRE is per FEATURE, not per axis:

    armW  0.150/0.126 = 1.1905   the plate draws the arm WIDER
    armL  0.216/0.255 = 0.8471   and SHORTER
    legH  0.89                   the leg SHORTER
    footH 0.89
    footW 1.10                   the foot WIDER

The arm is a clean affine about its shoulder: x by 1/armW, y by 1/armL.
The leg is not, because footW widens the FOOT and nothing widens the shaft. A
uniform x scale of 1/1.10 would take 9 percent off the shaft too, and the
shaft has no ratio in the contract to justify that; it is authored at 1.02 x
the arm. So the leg gets a piecewise x remap: everything inside the shaft's
own half width is left alone, everything outboard of it is pulled in by
1/footW, continuous at the boundary. y is a straight 1/legH about the hip,
which fixes footH at the same time because the bake gives them one factor.

PRE is PARSED out of scripts/bots-bake-parts.mjs rather than retyped here, and
`--verify` re-measures the result against the contract's own targets and
against the gate's own pivot test. A number this file invented would be a
number nothing checks.
"""
from __future__ import annotations

import os
import re
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bots_sd_contract import (  # noqa: E402
    ROOT,
    die,
    every_part,
    part_key,
    part_path,
    read_contract,
    rig_points_named,
    ruler_path,
)

BAKE = os.path.join(ROOT, "scripts", "bots-bake-parts.mjs")
SAFE = re.compile(r"^[\d\s./*+-]+$")


def read_pre() -> dict[str, float]:
    """Parse `const PRE = { ... }` out of the bake. One source of truth."""
    if not os.path.exists(BAKE):
        die(f"missing {BAKE}")
    src = open(BAKE, encoding="utf-8").read()
    m = re.search(r"const PRE = \{(.*?)\n\};", src, re.S)
    if not m:
        die("could not find `const PRE` in bots-bake-parts.mjs")
    out: dict[str, float] = {}
    for k, expr in re.findall(r"(\w+):\s*([^,\n]+),", m.group(1)):
        e = expr.strip()
        if not SAFE.match(e):
            die(f"PRE.{k} is not simple arithmetic: {e!r}")
        out[k] = float(eval(e, {"__builtins__": {}}, {}))  # noqa: S307 - guarded by SAFE
    for need in ("armW", "armL", "legH", "footW"):
        if need not in out:
            die(f"PRE.{need} not found in the bake")
    return out


def _remap(img: Image.Image, xs: np.ndarray, ys: np.ndarray) -> Image.Image:
    """Sample `img` at the given source coordinates, one output pixel each.
    Bilinear, alpha carried, out-of-range transparent."""
    a = np.asarray(img.convert("RGBA")).astype(np.float64)
    h, w = a.shape[:2]
    X, Y = np.meshgrid(xs, ys)
    ok = (X >= 0) & (X <= w - 1) & (Y >= 0) & (Y <= h - 1)
    x0 = np.clip(np.floor(X), 0, w - 1).astype(int)
    y0 = np.clip(np.floor(Y), 0, h - 1).astype(int)
    x1 = np.clip(x0 + 1, 0, w - 1)
    y1 = np.clip(y0 + 1, 0, h - 1)
    fx = np.clip(X - x0, 0, 1)[..., None]
    fy = np.clip(Y - y0, 0, 1)[..., None]
    out = (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x1] * fx * (1 - fy)
           + a[y1, x0] * (1 - fx) * fy + a[y1, x1] * fx * fy)
    out[~ok] = 0
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), "RGBA")


def unbias(c: dict, pre: dict, slot: str, tier: int, design: int) -> Image.Image:
    """The ruler with PRE divided back out, on the contract's own canvas."""
    im = Image.open(ruler_path(slot, tier, design)).convert("RGBA")
    w, h = im.size
    ox = np.arange(w, dtype=np.float64)
    oy = np.arange(h, dtype=np.float64)

    if slot == "arm":
        px, py = c["rig"]["arm"]["shoulder"]
        sx, sy = pre["armW"], pre["armL"]          # source = pivot + (out - pivot) * PRE
        return _remap(im, px + (ox - px) * sx, py + (oy - py) * sy)

    if slot == "leg":
        px, py = c["rig"]["leg"]["hip"]
        # the shaft's own half width: the bake makes it 1.02 x the arm's ink
        shaft_half = (c["rig"]["arm"]["w"] - 2 * c["figure"]["margin"]) * 1.02 / 2
        dx = ox - px
        inner = np.abs(dx) <= shaft_half
        # inside the shaft: identity. Outside: pull in by footW, continuous.
        srcx = np.where(inner, dx,
                        np.sign(dx) * (shaft_half + (np.abs(dx) - shaft_half) * pre["footW"]))
        return _remap(im, px + srcx, py + (oy - py) * pre["legH"])

    return im   # head, torso, weapon: PRE is identity, the ruler IS on target


def load(c: dict, pre: dict, slot: str, tier: int, design: int, source: str) -> Image.Image:
    if source == "ship":
        return Image.open(part_path(slot, tier, design)).convert("RGBA")
    if source == "ruler":
        return Image.open(ruler_path(slot, tier, design)).convert("RGBA")
    if source == "unbias":
        return unbias(c, pre, slot, tier, design)
    die(f"unknown source {source!r}")


# ── verification ───────────────────────────────────────────────────────────

def ink_box(a: np.ndarray, thr: int = 16):
    m = a[..., 3] > thr
    if not m.any():
        return None
    ys, xs = np.where(m)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def measure(c: dict, im: Image.Image, slot: str) -> dict[str, float]:
    """The contract ratios this slot can be measured for, in H units."""
    a = np.asarray(im)
    H = c["figure"]["H"]
    b = ink_box(a)
    if not b:
        return {}
    l, t, r, bo = b
    out: dict[str, float] = {}
    if slot == "arm":
        py = c["rig"]["arm"]["shoulder"][1]
        out["armW"] = (r - l + 1) / H
        out["armL"] = (c["rig"]["arm"]["hand"][1] - py) / H   # pivot to pivot, fixed
        out["armInkBelowPivot"] = (bo - py) / H
    elif slot == "leg":
        py = c["rig"]["leg"]["hip"][1]
        rows = a[..., 3] > 16
        foot_top = int(round(py + 0.75 * (bo - py)))
        fr = rows[foot_top:bo + 1]
        cols = np.where(fr.any(axis=0))[0]
        out["legH"] = (bo - py) / H
        out["footW"] = ((cols.max() - cols.min() + 1) / H) if cols.size else 0.0
    elif slot == "head":
        out["headFullW"] = (r - l + 1) / H
        out["headH"] = (c["rig"]["head"]["neck"][1] - t) / H
    elif slot == "torso":
        out["bodyW"] = (r - l + 1) / H
        out["bodyH"] = (bo - c["rig"]["torso"]["neck"][1]) / H
    return out


def verify(c: dict, pre: dict, source: str = "unbias") -> int:
    fig = c["figure"]["ratio"]
    print(f"PRE parsed from the bake: " + ", ".join(f"{k}={v:.4f}" for k, v in pre.items()))
    print(f"\nsource={source}: measured ratio against the contract band "
          f"(H={c['figure']['H']:.0f})")
    print(f"  {'part':<14} {'ratio':<12} {'measured':>9} {'target':>9} {'band':>17}  ok")
    bad = 0
    for slot, t, d in every_part(c):
        im = load(c, pre, slot, t, d, source)
        got = measure(c, im, slot)
        for k, v in got.items():
            if k not in fig:
                continue
            band = fig[k]
            ok = band["min"] <= v <= band["max"]
            near_t = abs(v - band["target"]) / band["target"]
            if not ok:
                bad += 1
            if d == 1:   # one design per tier is enough to read
                print(f"  {part_key(slot, t, d):<14} {k:<12} {v:9.4f} {band['target']:9.4f} "
                      f"{band['min']:7.3f}..{band['max']:<7.3f} {'ok' if ok else 'OUT'}"
                      f"  ({near_t * 100:+.0f}% off target)")
    # the gate's own pivot test
    off = 0
    for slot, t, d in every_part(c):
        a = np.asarray(load(c, pre, slot, t, d, source))
        h, w = a.shape[:2]
        for n, (x, y) in rig_points_named(c, slot):
            if n in c["off_canvas"]:
                continue
            if not (0 <= x < w and 0 <= y < h) or a[max(0, y - 6):y + 7, max(0, x - 6):x + 7, 3].max() == 0:
                off += 1
                print(f"  PIVOT OFF INK: {part_key(slot, t, d)}.{n} at ({x},{y})")
    # the gate's own edge test
    clipped = 0
    for slot, t, d in every_part(c):
        a = np.asarray(load(c, pre, slot, t, d, source))
        h, w = a.shape[:2]
        b = ink_box(a)
        if b and (b[0] <= 0 or b[1] <= 0 or b[2] >= w - 1 or b[3] >= h - 1):
            clipped += 1
            print(f"  EDGE CLIP: {part_key(slot, t, d)} box={b} canvas=({w},{h})")
    print(f"\n  {bad} ratio readings outside the band, {off} pivots off the ink, "
          f"{clipped} parts clipped by their canvas")
    return 0 if (off == 0 and clipped == 0) else 1


if __name__ == "__main__":
    c = read_contract()
    pre = read_pre()
    src = sys.argv[1] if len(sys.argv) > 1 else "unbias"
    sys.exit(verify(c, pre, src))
