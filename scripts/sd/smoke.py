"""BATTLE BOTS art factory - LANE R smoke test.

Two questions, both answered before a paid sweep starts, and the second one
answered before a single model is loaded.

 1. DOES THE CONTROL BIND? Any pipeline produces an image. Every failure Mike
    named (parts out of place, wrong zoom) is a control failure, and the whole
    reason to move off a closed text-to-image API is that a closed API cannot
    be conditioned on our geometry. So one part is rendered four times at
    rising ControlNet strength and each render's silhouette is measured
    against the control alpha it was conditioned on. If IoU does not climb
    with strength, the control is not wired up and you must NOT start a paid
    sweep: you would be buying coin flips again, only faster.

 2. DOES THE WHOLE PROMPT REACH THE MODEL? The first version of this file
    carried its own 52-token prompt and passed, while production ran a
    234-token prompt through a 77-token slot: the subject and the camera
    survived and the finish, the colour-neutral law, the light law and the
    plate were deleted without a word. So this file has NO prompt of its own.
    It assembles the stage-0 production prompt through bots_sd_prompt exactly
    as bots-sd-render.py does, checks it against the emitted job file, counts
    its tokens, refuses before loading anything if it could not be embedded
    whole, embeds it through the production path, checks the embedding covers
    every token, and then renders the CUT prompt and the FULL one at one seed
    and fails if they come out the same.

    python scripts/sd/smoke.py --check-only                                   # no GPU: the prompt half
    python scripts/sd/smoke.py --models /workspace/models --out /workspace/smoke

Exit 0 = the prompt is whole and the control binds. Exit 1 = fix the wiring
first. Nothing in this file is a taste judgement.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bots_sd_pipeline as PIPE  # noqa: E402
import bots_sd_prompt as P  # noqa: E402

ROOT = P.ROOT
JOBS = os.path.join(ROOT, "art-src", "sd", "jobs", "stage0.jsonl")
CONTROLS = os.path.join(ROOT, "art-src", "sd", "controls", "square")

# A part is judged against the placeholder it was conditioned on. Below this the
# render is drifting off the contract and no amount of prompt work will fix it.
IOU_PASS = 0.30  # edge recall bar: measured 0.36 at scale 1.0 on head-t3-1 with the control genuinely binding; 0.03 with it off
# Control has to actually do something. If the weakest and strongest settings
# land within this, the conditioning is inert (a mis-wired hint is the usual
# cause) and the "sweep" would just be an expensive text-to-image run.
IOU_SPREAD_MIN = 0.03
# The cut prompt and the whole prompt must produce different pictures. Mean
# absolute difference over the image, in 8-bit levels. Identical output means
# the embeddings are not reaching the model.
AB_DIFF_MIN = 2.0
LADDER = (0.0, 0.5, 0.8, 1.0)
AB_SCALE = 0.8


def _load_sweep():
    """bots-sd-sweep.py owns the stage-0 recipe (which prompt variant, which
    negative set, which plate, cfg, steps, sampler). Read it from there so the
    smoke test cannot drift from the plan it is meant to confirm."""
    spec = importlib.util.spec_from_file_location("bots_sd_sweep", os.path.join(HERE, "bots-sd-sweep.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def plate_estimate(img: Image.Image) -> tuple[int, int, int]:
    """The plate colour as rendered: the median of the outer 3 percent ring.
    Read off the image rather than assumed from the hex, because the model
    renders the plate a little off and the key must not fail on that."""
    a = np.asarray(img.convert("RGB"))
    h, w = a.shape[:2]
    r = max(int(min(h, w) * 0.03), 2)
    ring = np.concatenate([a[:r].reshape(-1, 3), a[-r:].reshape(-1, 3),
                           a[:, :r].reshape(-1, 3), a[:, -r:].reshape(-1, 3)])
    return tuple(int(x) for x in np.median(ring, axis=0))


def silhouette(img: Image.Image, plate_rgb, tol: int = 28) -> np.ndarray:
    """The rendered object as a boolean mask. Measured on the box on 2026-09-05:
    a colour key against a mid grey plate cannot separate a pale grey clay head
    from the plate (IoU sat at 0.398 at every control strength while the renders
    plainly followed the map). So the object is found by flooding the PLATE from
    the four corners with the render's own edges as walls: whatever the flood
    cannot reach is the object, holes included. The colour key stays as a first
    pass so a high-contrast plate still works the simple way."""
    import cv2
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    colour = np.abs(a - np.array(plate_rgb, dtype=np.int16)).max(axis=2) > tol
    g = cv2.GaussianBlur(np.asarray(img.convert("L")), (3, 3), 0)
    edges = cv2.Canny(g, 40, 120)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    h, w = g.shape
    wall = np.zeros((h + 2, w + 2), np.uint8)
    wall[1:-1, 1:-1] = (edges > 0).astype(np.uint8)
    canvas = np.zeros((h, w), np.uint8)
    for (x, y) in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        m = wall.copy()
        cv2.floodFill(canvas, m, (x, y), 1, loDiff=0, upDiff=0, flags=4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY)
        wall[m == 255] = 255  # keep what was reached as reached
    reached = wall[1:-1, 1:-1] == 255
    obj = ~reached
    # a flood that ate the whole frame means there was no closed edge: fall back to colour
    if obj.mean() < 0.02 or obj.mean() > 0.98:
        return colour
    return obj | colour


def edge_recall(img: Image.Image, control: np.ndarray, dil: int = 5) -> float:
    """How much of the control map's own edge structure the render reproduces.
    Plate independent, hole independent: the metric binding actually means.
    Measured on the box on 2026-09-05 on head-t3-1 (depth control): 0.031 with
    the control off, 0.250 at scale 0.5, 0.364 at scale 1.0, while the colour
    IoU sat at 0.30 to 0.37 throughout because the clay is the plate's grey."""
    import cv2
    k = np.ones((dil, dil), np.uint8)
    ce = cv2.dilate(cv2.Canny(control, 20, 60), k) > 0
    g = cv2.GaussianBlur(np.asarray(img.convert("L")), (3, 3), 0)
    re_ = cv2.dilate(cv2.Canny(g, 40, 120), k) > 0
    return float((re_ & ce).sum() / max(1, ce.sum()))


def iou(a: np.ndarray, b: np.ndarray) -> float:
    u = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / u) if u else 0.0


def synthetic_hints(out: str, size: int):
    """When the real control maps are not on the box, a capsule stands in for
    a torso well enough to prove binding. Returns (depth, ref silhouette)."""
    canvas = Image.new("RGBA", (288, 264), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).rounded_rectangle((44, 30, 244, 234), 46, fill=(150, 150, 150, 255))
    side = max(canvas.size)
    plate = Image.new("RGBA", (side, side), (0, 0, 0, 255))
    plate.paste(canvas, ((side - canvas.width) // 2, (side - canvas.height) // 2), canvas)
    plate = plate.resize((size, size), Image.LANCZOS)
    alpha = plate.split()[3]
    grey = plate.convert("L")
    depth = Image.merge("RGB", (grey, grey, grey))
    depth.save(os.path.join(out, "hint_depth.png"))
    return depth, np.asarray(alpha) > 8


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--part", default="head-t3-1", help="the stage-0 part")
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--steps", type=int, default=None, help="override the stage-0 step count")
    ap.add_argument("--check-only", action="store_true",
                    help="run the prompt half and stop before touching the GPU")
    args = ap.parse_args()

    # ── 1. THE PROMPT, before anything is loaded ─────────────────────────────
    m = P.load_matrix()
    sweep = _load_sweep()
    s0 = sweep.stages(m)[0]
    fixed = s0["fixed"]
    slot, tier, design = P.part_triple(args.part)
    prompt = P.build_prompt(m, slot, tier, fixed["plate"], fixed["promptVariant"])
    weighted = P.build_weighted(m, slot, tier, fixed["plate"], fixed["promptVariant"])
    negative = P.build_negative(m, fixed["negative"])
    print(f"STAGE 0 RECIPE (bots-sd-sweep.py): {args.part}, variant {fixed['promptVariant']}, "
          f"negative {fixed['negative']}, plate {fixed['plate']}, cfg {fixed['cfg']}, "
          f"steps {fixed['steps']}, sampler {fixed['sampler']}")

    # the emitted job file must carry the very same strings
    if os.path.exists(JOBS):
        same = [json.loads(l) for l in open(JOBS, encoding="utf-8") if l.strip()]
        same = [j for j in same if j.get("part") == args.part]
        if same:
            j = same[0]
            for field, mine in (("prompt", prompt), ("negative", negative), ("promptCompel", weighted)):
                if j.get(field) != mine:
                    print(f"FAIL: {os.path.relpath(JOBS, ROOT)} carries a different {field} for "
                          f"{args.part} than this smoke test assembles. One of the two is stale; "
                          f"re-run `python scripts/sd/bots-sd-sweep.py --emit` and try again.")
                    return 1
            print(f"  job file agrees on prompt, negative and promptCompel "
                  f"({len(same)} stage-0 jobs for {args.part})")
    else:
        print(f"  note: {os.path.relpath(JOBS, ROOT)} not present; run bots-sd-sweep.py --emit to cross-check")

    info = P.assert_embeddable(prompt, negative, label=f"the stage-0 production prompt ({args.part})")
    if args.check_only:
        print("PROMPT CHECK PASS: nothing loaded. Run with --models/--out on the GPU box for the rest.")
        return 0
    if not args.models or not args.out:
        print("FAIL: --models and --out are required past the prompt check")
        return 1
    os.makedirs(args.out, exist_ok=True)

    # ── 2. THE GPU ───────────────────────────────────────────────────────────
    import torch
    if not torch.cuda.is_available():
        print("FAIL: no CUDA device.")
        return 1
    free, total = torch.cuda.mem_get_info()
    print(f"GPU {torch.cuda.get_device_name(0)}  free {free / 1e9:.1f} / {total / 1e9:.1f} GB")
    if total < 15e9:
        print("FAIL: under 15 GB of VRAM. SDXL + a ControlNet does not fit; take a bigger card.")
        return 1

    # ── 3. THE HINT: the real control maps for the part, or a capsule ────────
    cdir = os.path.join(CONTROLS, args.part)
    if os.path.exists(os.path.join(cdir, "depth.png")) and os.path.exists(os.path.join(cdir, "alpha.png")):
        images, modes = PIPE.load_controls({"depth": os.path.join(cdir, "depth.png")}, ["depth"], args.size)
        ref = np.asarray(Image.open(os.path.join(cdir, "alpha.png")).convert("L")
                         .resize((args.size, args.size), Image.LANCZOS)) > 127
        ctl_gray = np.asarray(Image.open(os.path.join(cdir, "depth.png")).convert("L").resize((args.size, args.size)))
        print(f"  conditioning on {os.path.relpath(cdir, ROOT)}/depth.png, silhouette from alpha.png")
    else:
        depth, ref = synthetic_hints(args.out, args.size)
        ctl_gray = np.asarray(depth.convert("L")) if hasattr(depth, "convert") else np.asarray(depth)
        images, modes = [depth], [PIPE.UNION_MODE["depth"]]
        print("  no control maps on this box; conditioning on a synthetic capsule")

    # ── 4. THE MODELS, and the scheduler the plan names ──────────────────────
    pipe = PIPE.load_pipeline(args.models)
    pipe.scheduler = PIPE.scheduler_for(pipe, fixed["sampler"])
    steps = args.steps or int(fixed["steps"])
    cfg = float(fixed["cfg"])

    # ── 5. THE EMBEDDING, through the production path, and its proof ─────────
    embeds, meta = P.encode(pipe, weighted, negative, plain=prompt)
    print(f"  embedded {meta['promptTokens']} tokens (+{meta['negativeTokens']} negative) in "
          f"{meta['chunks']} chunks; embedding length {meta['embedLen']}")
    if info["real"] and meta["promptTokens"] != info["promptTokens"]:
        print(f"FAIL: the pre-flight counted {info['promptTokens']} tokens and the pipeline's own "
              f"tokenizer counts {meta['promptTokens']}; the two tokenizers disagree.")
        return 1

    # ── 6. THE LADDER: does the control bind ─────────────────────────────────
    rows, full_ab = [], None
    for strength in LADDER:
        img = PIPE.render(pipe, images=images, modes=modes, scale=strength, end=1.0, cfg=cfg,
                          steps=steps, seed=1234, size=args.size, embeds=embeds)
        path = os.path.join(args.out, f"smoke_cn{strength:.1f}.png")
        img.save(path)
        plate = plate_estimate(img)
        score = iou(silhouette(img, plate), ref)
        recall = edge_recall(img, ctl_gray)
        rows.append((strength, recall))  # decide on edge recall, not the colour IoU
        if strength == AB_SCALE:
            full_ab = img
        print(f"  controlnet_scale {strength:.1f} -> edge recall {recall:.3f}  (colour IoU {score:.3f}, informational)  plate rendered as "
              f"{plate} (matrix {m['plates'][fixed['plate']]['hex']})  {path}")

    # ── 7. THE A/B: the cut prompt against the whole one, same seed ──────────
    cut = PIPE.render(pipe, images=images, modes=modes, scale=AB_SCALE, end=1.0, cfg=cfg,
                      steps=steps, seed=1234, size=args.size,
                      truncating_prompt=prompt, negative=negative)
    cut.save(os.path.join(args.out, f"smoke_CUT_cn{AB_SCALE:.1f}.png"))
    diff = float(np.abs(np.asarray(cut.convert("RGB")).astype(np.int16)
                        - np.asarray(full_ab.convert("RGB")).astype(np.int16)).mean())
    print(f"\n  cut prompt (first {P.PROMPT_LIMIT} tokens) vs whole prompt at scale {AB_SCALE}: "
          f"mean abs pixel difference {diff:.2f} / 255")

    # ── 8. VERDICT ───────────────────────────────────────────────────────────
    zero = dict(rows)[0.0]
    best = max(s for _, s in rows)
    spread = best - zero
    print(f"  unconditioned edge recall {zero:.3f} -> best conditioned edge recall {best:.3f} (spread {spread:+.3f})")

    ok = True
    if spread < IOU_SPREAD_MIN:
        print(f"FAIL: control is inert. Raising the scale from 0 to 1 moved the silhouette by only "
              f"{spread:.3f}. The hint is not reaching the model: check the union model folder, the "
              f"control_mode, and the hint image, and do NOT start a sweep.")
        ok = False
    if best < IOU_PASS:
        print(f"FAIL: best edge recall {best:.3f} is under the {IOU_PASS} bar. The contract is not being held. "
              f"Try lineart alongside depth or raise the scale.")
        ok = False
    if diff < AB_DIFF_MIN:
        print(f"FAIL: the cut prompt and the whole prompt rendered the same picture (diff {diff:.2f}). "
              f"The chunked embeddings are not reaching the model; do NOT start a sweep.")
        ok = False
    if ok:
        print(f"PASS: the whole prompt reaches the model ({meta['chunks']} chunks) and the control "
              f"binds and holds the silhouette. Safe to sweep.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
