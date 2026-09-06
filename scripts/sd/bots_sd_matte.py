"""BATTLE BOTS / stable-diffusion lane: THE MATTE. Cut a render to alpha with
the control alpha it was conditioned on. Never a colour key.

    python scripts/sd/bots_sd_matte.py --selftest
    python scripts/sd/bots_sd_matte.py <render.png> --part head-t3-1 --out <cut.png>

── WHY THERE IS NO COLOUR KEY IN THIS LANE ────────────────────────────────
The old pipeline drew on magenta and keyed it out, and a cast shadow once
fooled the key. This lane draws on the body's own mid grey ON PURPOSE (see
bots-sd-sweep.py, THE PLATE), so a colour key cannot work here even in
principle, and the box proved it on 2026-09-05: keying a pale grey clay head
off a mid grey plate sat at IoU 0.30 to 0.37 whatever the control did, and an
edge-bounded flood fill grabbed the cast shadow instead of the head.

We do not need to recover the silhouette from the picture, because we handed
the silhouette TO the model as the control image. So:

    matte = the contract alpha (art-src/sd/controls/contract/<part>/alpha.png),
            eroded by ERODE_PX and feathered by FEATHER_PX, placed back on the
            contract canvas through the square layout's own placement record.

A cast shadow lands OUTSIDE the silhouette and is discarded by construction.
There is no tolerance to tune and no hue for a shadow to fall inside.

── WHAT IS MEASURED AT CUT TIME, AND WHY HERE ─────────────────────────────
Two edge numbers, both plate independent, both taken from the RAW render
before anything is thrown away, because after the cut the pixels outside the
matte are gone and nothing can be measured about them:

  rimEdgeRecall      the share of the matte's own boundary that has a render
                     edge within RIM_PX of it. If the model drew the part
                     smaller than the silhouette, its outline sits inside the
                     matte, the rim of the cut is plate, and this number drops.
                     This is "rim purity" from the sweep plan, done without a
                     colour: the sweep's own phrase was "pixels just inside
                     that matte that still look like the plate", and on a grey
                     plate nothing can say what looks like the plate.
  controlEdgeRecall  the share of the contract canny map's edges the render
                     reproduces, dilated RIM_PX. The same metric smoke.py
                     decides on (0.031 with the control off, 0.364 at full
                     strength on head-t3-1), on the contract canvas.

Both are written into the cut PNG as a text chunk (key `bb_matte`) and into a
sidecar .json, so scripts/sd/rank-part.py can read the rim number off the
file it is judging without re-deriving it from pixels that are no longer
there. Bars for these numbers are NOT set here: nothing has been measured on
a real cut yet. The ranker scores the rim number softly and says so.

Everything here runs without a GPU, and --selftest proves the placement
inverts the square layout exactly (a synthetic render made from the control's
own source cuts back to the control alpha at IoU 0.98 or better) and that the
rim number moves the right way (a render that ignored the control, or drew
the part at 80 percent, reads low).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, PngImagePlugin
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CONTROLS = os.path.join(ROOT, "art-src", "sd", "controls")

ERODE_PX = 2       # the sweep plan's numbers, stated there and used here
FEATHER_PX = 1
RIM_PX = 3         # how far from the matte boundary a render edge may sit and still count
CANNY_LO, CANNY_HI = 40, 120   # smoke.py's thresholds, so the two agree on what an edge is
PNG_KEY = "bb_matte"


def die(msg: str) -> None:
    raise SystemExit("bots_sd_matte REFUSES: " + msg)


# ── the placement, read not retyped ───────────────────────────────────────

_MANIFEST: dict = {}


def placement(part: str, layout: str = "square", root: str | None = None) -> dict:
    """The square layout's own record of where the contract canvas was pasted:
    {cropBack, contractCanvas, workingCanvas}. Read from the manifest
    bots-sd-controls.py wrote, so the cut inverts the exact transform the
    control maps were built with."""
    root = root or ROOT
    key = (root, layout)
    if key not in _MANIFEST:
        p = os.path.join(root, "art-src", "sd", "controls", layout, "manifest.json")
        if not os.path.exists(p):
            die(f"no {layout} manifest at {p} (run bots-sd-controls.py)")
        m = json.load(open(p, encoding="utf-8"))
        _MANIFEST[key] = {it["key"]: it for it in m["items"]}
    it = _MANIFEST[key].get(part)
    if it is None:
        die(f"the {layout} manifest has no entry for {part}")
    return {"cropBack": list(it["cropBack"]), "contractCanvas": list(it["contractCanvas"]),
            "workingCanvas": list(it["workingCanvas"])}


def contract_alpha(part: str, root: str | None = None) -> np.ndarray:
    p = os.path.join(root or ROOT, "art-src", "sd", "controls", "contract", part, "alpha.png")
    if not os.path.exists(p):
        die(f"contract alpha missing: {p} (run bots-sd-controls.py)")
    return np.asarray(Image.open(p).convert("L")) > 127


def contract_canny(part: str, root: str | None = None) -> np.ndarray | None:
    p = os.path.join(root or ROOT, "art-src", "sd", "controls", "contract", part, "canny.png")
    return np.asarray(Image.open(p).convert("L")) if os.path.exists(p) else None


# ── the matte ──────────────────────────────────────────────────────────────

def matte_from_alpha(alpha: np.ndarray, erode: int = ERODE_PX, feather: int = FEATHER_PX) -> np.ndarray:
    """Boolean control alpha -> float matte in 0..1: eroded, then softened by
    about one pixel so the cut edge does not alias against the arena floor."""
    m = ndimage.binary_erosion(alpha, iterations=erode) if erode > 0 else alpha
    f = m.astype(np.float64)
    if feather > 0:
        f = ndimage.gaussian_filter(f, feather * 0.7)
        f = np.where(ndimage.binary_dilation(m, iterations=feather), f, 0.0)   # never grow past the erosion + feather
    return np.clip(f, 0.0, 1.0)


def _edges(rgb_u8: np.ndarray) -> np.ndarray:
    import cv2
    g = cv2.GaussianBlur(cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2GRAY), (3, 3), 0)
    return cv2.Canny(g, CANNY_LO, CANNY_HI) > 0


def rim_edge_recall(rgb_u8: np.ndarray, alpha: np.ndarray, k: int = RIM_PX) -> float:
    """Share of the alpha's one-pixel boundary ring that has a render edge
    within k px. Plate independent. See the header for what a low value means."""
    ring = alpha & ~ndimage.binary_erosion(alpha, iterations=1)
    if not ring.any():
        return 0.0
    near = ndimage.binary_dilation(_edges(rgb_u8), iterations=k)
    return float((near & ring).sum() / ring.sum())


def control_edge_recall(rgb_u8: np.ndarray, canny_map_u8: np.ndarray, dil: int = 5) -> float:
    """smoke.py's edge_recall, on the contract canvas: how much of the control
    map's own edge structure the render reproduces."""
    import cv2
    k = np.ones((dil, dil), np.uint8)
    ce = cv2.dilate(cv2.Canny(canny_map_u8, 20, 60), k) > 0
    re_ = cv2.dilate(_edges(rgb_u8).astype(np.uint8) * 255, k) > 0
    return float((re_ & ce).sum() / max(1, ce.sum()))


def cut(render: Image.Image, part: str, job: dict | None = None, root: str | None = None,
        erode: int = ERODE_PX, feather: int = FEATHER_PX) -> tuple[Image.Image, dict]:
    """The one cut. `render` is the raw square output of the pipeline; `job`
    may carry the placement (the sweep writes it) else it is read from the
    square manifest. Returns the RGBA part on the contract canvas, RGB kept
    everywhere (nothing is blanked under alpha 0), plus the measurements."""
    root = root or ROOT
    pl = (job or {}).get("placement") or placement(part, "square", root)
    cw, ch = pl["contractCanvas"]
    W, H = pl["workingCanvas"]
    rw, rh = render.size
    if rw != rh:
        die(f"the render is {rw}x{rh}; the square layout renders squares")
    k = rw / W    # the runner may render at a size other than the manifest's res
    x0, y0, x1, y1 = [v * k for v in pl["cropBack"]]
    rgb = render.convert("RGB").crop((int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))))
    rgb = rgb.resize((cw, ch), Image.LANCZOS)
    rgb_u8 = np.asarray(rgb).astype(np.uint8)

    alpha = contract_alpha(part, root)
    if alpha.shape != (ch, cw):
        die(f"contract alpha for {part} is {alpha.shape[::-1]}, the placement says {(cw, ch)}")
    matte = matte_from_alpha(alpha, erode, feather)

    metrics = {
        "part": part, "erodePx": erode, "featherPx": feather, "rimPx": RIM_PX,
        "renderSize": [rw, rh], "contractCanvas": [cw, ch], "cropBack": pl["cropBack"],
        "rimEdgeRecall": round(rim_edge_recall(rgb_u8, alpha), 4),
        "inkPx": int((matte > 0.5).sum()),
    }
    cm = contract_canny(part, root)
    if cm is not None:
        metrics["controlEdgeRecall"] = round(control_edge_recall(rgb_u8, cm), 4)

    out = np.dstack([rgb_u8, np.clip(matte * 255.0 + 0.5, 0, 255).astype(np.uint8)])
    return Image.fromarray(out, "RGBA"), metrics


def save_cut(img: Image.Image, metrics: dict, out_png: str) -> None:
    """Write the cut with its measurements inside it (PNG text chunk) and
    beside it (.json), so the ranker can read the rim number off the file."""
    os.makedirs(os.path.dirname(out_png) or ".", exist_ok=True)
    info = PngImagePlugin.PngInfo()
    info.add_text(PNG_KEY, json.dumps(metrics))
    img.save(out_png, pnginfo=info)
    with open(os.path.splitext(out_png)[0] + ".json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=1)


def read_metrics(path: str) -> dict | None:
    """The cut-time measurements stored in a PNG by save_cut, or None."""
    try:
        raw = Image.open(path).info.get(PNG_KEY)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def cut_file(render_png: str, part: str, out_png: str, job: dict | None = None,
             root: str | None = None) -> dict:
    img, metrics = cut(Image.open(render_png), part, job, root)
    metrics["render"] = render_png
    save_cut(img, metrics, out_png)
    return metrics


# ── selftest: no GPU, no model, the geometry and the metric alone ──────────

def _synthetic_render(part: str, root: str, plate=(128, 128, 128), scale: float = 1.0,
                      flat: bool = False) -> Image.Image:
    """What a render that obeyed the control exactly would look like: the
    control's own source pasted on the plate at the square placement. scale
    shrinks the part about its centre (the model drew it small); flat draws
    nothing at all (the model ignored the control)."""
    sys.path.insert(0, HERE)
    from bots_sd_contract import read_contract  # noqa: E402
    from bots_sd_prompt import part_triple  # noqa: E402
    from bots_sd_source import load as load_source, read_pre  # noqa: E402
    pl = placement(part, "square", root)
    W, H = pl["workingCanvas"]
    canvas = Image.new("RGB", (W, H), plate)
    if flat:
        return canvas
    c = read_contract()
    slot, tier, design = part_triple(part)
    src = load_source(c, read_pre(), slot, tier, design, "unbias")
    x0, y0, x1, y1 = pl["cropBack"]
    tw, th = x1 - x0, y1 - y0
    big = src.resize((max(1, round(tw * scale)), max(1, round(th * scale))), Image.LANCZOS)
    ox = x0 + (tw - big.width) // 2
    oy = y0 + (th - big.height) // 2
    canvas.paste(big, (ox, oy), big)
    return canvas


def selftest(part: str = "head-t3-1", root: str | None = None) -> int:
    root = root or ROOT
    alpha = contract_alpha(part, root)
    ok = True

    def iou(a, b):
        u = (a | b).sum()
        return float((a & b).sum() / u) if u else 0.0

    print(f"bots_sd_matte selftest on {part}")
    full, m_full = cut(_synthetic_render(part, root), part, root=root)
    a_cut = np.asarray(full)[..., 3] > 127
    j = iou(a_cut, ndimage.binary_erosion(alpha, iterations=ERODE_PX))
    print(f"  placement inverts the square layout: cut ink vs eroded control alpha IoU {j:.4f} (bar 0.98)")
    ok &= j >= 0.98
    # the synthetic render is the placeholder itself, so its outline IS the alpha boundary
    print(f"  rimEdgeRecall on a render that obeyed the control: {m_full['rimEdgeRecall']:.3f} (bar 0.85)")
    ok &= m_full["rimEdgeRecall"] >= 0.85
    small, m_small = cut(_synthetic_render(part, root, scale=0.8), part, root=root)
    print(f"  rimEdgeRecall on a render that drew the part at 80 percent: {m_small['rimEdgeRecall']:.3f} "
          f"(must be under the obeyed one by 0.4)")
    ok &= m_small["rimEdgeRecall"] <= m_full["rimEdgeRecall"] - 0.4
    flat, m_flat = cut(_synthetic_render(part, root, flat=True), part, root=root)
    print(f"  rimEdgeRecall on a flat plate (control ignored): {m_flat['rimEdgeRecall']:.3f} (bar under 0.05)")
    ok &= m_flat["rimEdgeRecall"] < 0.05
    if "controlEdgeRecall" in m_full:
        print(f"  controlEdgeRecall obeyed {m_full['controlEdgeRecall']:.3f}  flat {m_flat['controlEdgeRecall']:.3f}")
        ok &= m_full["controlEdgeRecall"] > m_flat["controlEdgeRecall"] + 0.3
    # the rgb under alpha 0 is kept, so nothing downstream can mistake the matte edge for a drawn edge
    rgb_out = np.asarray(full)[..., :3][~a_cut]
    print(f"  RGB kept under alpha 0: {len(rgb_out)} px, mean {rgb_out.mean():.1f} (a blanked cut would read 0)")
    ok &= rgb_out.mean() > 1.0
    # round trip through the PNG text chunk
    tmp = os.path.join(HERE, ".gate-sandbox", "_matte_selftest.png")
    save_cut(full, m_full, tmp)
    back = read_metrics(tmp)
    ok &= bool(back) and back.get("rimEdgeRecall") == m_full["rimEdgeRecall"]
    print(f"  metrics round trip through the PNG text chunk: {'ok' if back else 'FAILED'}")
    print("bots_sd_matte selftest " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("render", nargs="?")
    ap.add_argument("--part")
    ap.add_argument("--out")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--selftest-part", default="head-t3-1")
    args = ap.parse_args()
    if args.selftest:
        return selftest(args.selftest_part)
    if not (args.render and args.part and args.out):
        die("usage: bots_sd_matte.py <render.png> --part <key> --out <cut.png>, or --selftest")
    m = cut_file(args.render, args.part, args.out)
    print(json.dumps(m, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
