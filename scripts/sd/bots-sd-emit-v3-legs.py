"""BATTLE BOTS / stable-diffusion: THE V3 LEG JOBS (lane B, 2026-09-05;
wave two, lane L, the same day).

    python scripts/sd/bots-sd-emit-v3-legs.py
    python scripts/sd/bots-sd-emit-v3-legs.py --out art-src/sd/jobs/stage6-legs.jsonl

Emits 24 candidates for each of the four NEW leg shapes (wheels, springs,
sneakers, pegs) against art-src/sd/controls/v3. `boot` is in the shape table as
the comparison ruler and is NOT rendered: it is the live shape and the factory
already has 24 candidates of it.

── THE RULERS ARE GATED BEFORE A LINE OF THIS FILE IS WRITTEN ────────────
Wave one proved twice that renders can only be as different as the rulers
behind them: the bear head gave zero survivors with its ears grazing the crown
and fifteen with them seated on it, on the same prompt, and the mouth swap
gave one mouth out of five because a thin line on a ruler cannot argue with
the model's one idea of a robot mouth. So the look-alike gate, which the
factory only ever ran on rendered parts, now runs on the CLAY RULERS here,
first, through scripts/sd/bots-sd-gate-rulers.py. A shape that fails is ten
minutes of drawing; the same shape failing after a render is forty minutes of
rented 4090. No bar moves and none is added: it is the shipped gate at its own
two bars, and if it refuses, this file writes nothing.

── THE SETTINGS ARE THE PRODUCTION RECIPE, NOT A NEW GUESS ───────────────
Everything but the shape and the two axes below comes out of
scripts/sd/bots-sd-sweep.py's own production() "limbs-v2" entry, read at run
time rather than copied: the v2 slice measured depth+lineart at scale 0.85,
end 0.8, cfg 5.0, 30 steps, dpmpp_2m_karras on sdxl-base-1.0, and that is what
these legs get.

── WHAT WAVE ONE'S 96 RENDERS SAID ABOUT THE OTHER TWO AXES ──────────────
Wave one spent its 24 on 2 adapter weights x 3 references x 4 seeds and kept
16 of 96. Sliced by axis, that run measured two things clearly enough to spend
on, and both point the same way, at the coral:

  adapter weight   0.30: 11 survivors of 48, CORAL SPILL 0.023 at the median
                   0.45:  5 survivors of 48, CORAL SPILL 0.104, 4.5x worse
  reference        leg-boot-yellow:  8 of 32, spill 0.019
                   leg-boot-teal:    5 of 24, spill 0.083
                   leg-boot-red:     2 of 32, spill 0.089
                   leg-wheel-blue:   1 of  8, spill 0.083

The reference order is not luck. Measured on the cuts themselves, the share of
each reference that is WARM PAINT ABOVE ITS OWN SOLE runs teal 20 percent,
yellow 24, wheel-blue 39, red 48: leg-boot-red is a red boot, and an adapter
argues for what it is shown. So wave two shows the two references whose only
warm block is the sole, at the weight that measured cleanest, and spends
everything it saves on SEEDS, which is the axis the judge reads for free:
1 adapter weight x 2 references x 12 seeds.

── WHY THE SLOT KEY IS `leg-wheels` AND NOT `leg` ────────────────────────
scripts/sd/bots-sd-render.py verifies every job before it spends a second of
GPU on it: it rebuilds the prompt, the weighted prompt and the negative from
the matrix using the job's OWN `slot`, and refuses the job if any of the three
differs. So a job whose slot says `leg` must carry the boot's prompt, or it is
refused. The shapes therefore ride as slot keys the matrix answers for
(subject."leg-wheels", negative.slot."leg-wheels" in bots-sd-prompts.json),
which needs no change to bots_sd_prompt.py at all and makes the render's own
check the proof that a shape's prompt is the one the matrix holds. `shape` and
`slot` are both on the row, so anything grouping by real slot still can.

This file runs that verify itself, on every row, before it writes anything.

── THE STYLE REFERENCES ──────────────────────────────────────────────────
The adapter argues for what it is shown, so a shape is shown a foot, never a
whole toy, and every shape is shown the SAME two feet: leg-boot-yellow and
leg-boot-teal. Both carry a clean coral block at the bottom, which is the one
thing every v3 leg has in common, and both are the boots whose UPPERS are
cool, which is the thing wave one measured as deciding the run. leg-boot-red
is dropped for being red above its sole (2 survivors of 32), and
leg-wheel-blue with it: it was carried for the rolling-foot vocabulary, it has
no coral block at all (its tyre is dark rubber, see THE CORAL TYRE in
bots-sd-stylerefs.py), and it returned one survivor of eight. The wheel
vocabulary is the ruler's job and the redrawn ruler now does it.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from bots_sd_prompt import (  # noqa: E402
    build_negative, build_prompt, build_weighted, chunks_needed, count_tokens, load_matrix,
)

CONTROLS_V3_REL = "art-src/sd/controls/v3"
SHAPES = ["wheels", "springs", "sneakers", "pegs"]
#: 1 weight x 2 references x 12 seeds = 24 a shape, the same 24 a shape wave
#: one spent on 2 x 3 x 4. See the header for the numbers that moved them.
SEEDS = 12
STYLE_WEIGHT = 0.30
REFS = ["leg-boot-yellow", "leg-boot-teal"]


def _by_path(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [sys.argv[0]]
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join("art-src", "sd", "jobs", "stage7-legs.jsonl"))
    ap.add_argument("--skip-ruler-gate", action="store_true",
                    help="do not use: the gate is the point of running this file at all")
    args = ap.parse_args()

    # THE RULERS, FIRST. Nothing below runs if the shapes are not different as
    # drawn, because nothing below can make them different.
    if not args.skip_ruler_gate:
        G = _by_path("bots_sd_gate_rulers", "bots-sd-gate-rulers.py")
        G.require("leg")

    S = _by_path("bots_sd_sweep", "bots-sd-sweep.py")
    R = _by_path("bots_sd_render", "bots-sd-render.py")
    m = load_matrix()

    prod = [p for p in S.production(m) if p["name"] == "limbs-v2"][0]
    fixed = dict(prod["fixed"])
    styles = list(prod["vary"]["style"])
    stack = prod["vary"]["controlStack"][0]
    # the weight is CHOSEN from production's own list, never invented: if that
    # list ever stops offering it, this stops rather than quietly rendering at
    # a weight nothing measured.
    if STYLE_WEIGHT not in styles:
        sys.exit(f"bots-sd-emit-v3-legs: production() limbs-v2 offers style weights {styles} and "
                 f"this file asks for {STYLE_WEIGHT}, which is not among them. Wave one measured "
                 f"{STYLE_WEIGHT} at 11 survivors of 48 against 0.45 at 5; do not substitute a "
                 f"weight nothing has measured.")
    styles = [STYLE_WEIGHT]

    man = os.path.join(ROOT, CONTROLS_V3_REL, "square", "manifest.json")
    if not os.path.exists(man):
        sys.exit(f"bots-sd-emit-v3-legs: no square manifest at {man}. Run "
                 "scripts/sd/bots-sd-controls-v3-legs.py first.")
    place = {it["key"]: it for it in json.load(open(man, encoding="utf-8"))["items"]}

    rows = []
    for shape in SHAPES:
        key = f"leg-{shape}"
        if key not in place:
            sys.exit(f"bots-sd-emit-v3-legs: the v3 square manifest has no entry for {key}. "
                     "Re-run scripts/sd/bots-sd-controls-v3-legs.py (the other lane's control "
                     "run overwrites the manifest instead of merging it).")
        it = place[key]
        for style in styles:
            for ref in REFS:
                for seed in range(SEEDS):
                    prompt = build_prompt(m, key, 1, fixed["plate"], fixed["promptVariant"])
                    tokens, counter = count_tokens(prompt)
                    rows.append({
                        "part": key, "slot": key, "realSlot": "leg", "shape": shape,
                        "tier": 1, "design": 1, "pool": key,
                        "controls": {k: f"{CONTROLS_V3_REL}/square/{key}/{k}.png"
                                     for k in ("depth", "lineart", "canny", "alpha", "hidden")},
                        "matte": f"{CONTROLS_V3_REL}/contract/{key}/alpha.png",
                        "placement": {"cropBack": it["cropBack"],
                                      "contractCanvas": it["contractCanvas"],
                                      "workingCanvas": it["workingCanvas"]},
                        "controlsRoot": CONTROLS_V3_REL,
                        "controlStack": stack,
                        "controlScale": fixed["controlScale"], "controlEnd": fixed["controlEnd"],
                        "cfg": fixed["cfg"], "steps": fixed["steps"], "sampler": fixed["sampler"],
                        "checkpoint": fixed["checkpoint"], "layout": "single",
                        "plate": fixed["plate"], "promptVariant": fixed["promptVariant"],
                        "style": float(style), "styleRef": S.style_ref_path(ref), "styleRefName": ref,
                        "seed": 1000 + seed,
                        "negativeSet": fixed["negative"],
                        "negative": build_negative(m, fixed["negative"], key),
                        "prompt": prompt,
                        "promptCompel": build_weighted(m, key, 1, fixed["plate"], fixed["promptVariant"]),
                        "promptTokens": tokens, "promptChunks": chunks_needed(tokens),
                        "tokenCounter": counter,
                        "plateHex": m["plates"][fixed["plate"]]["hex"],
                    })

    # THE RUNNER'S OWN CHECK, HERE, BEFORE ANYTHING IS WRITTEN. bots-sd-render
    # verifies each job against the matrix and the controls tree and refuses
    # what does not match; running it at emit time means a bad job file never
    # reaches the box and never costs an hour of rented GPU to discover.
    bad = []
    for r in rows:
        for msg in R.check_job(m, r):
            bad.append((r["part"], r["seed"], r["styleRefName"], msg))
    if bad:
        for b in bad[:12]:
            print("  REFUSED", b)
        sys.exit(f"bots-sd-emit-v3-legs: {len(bad)} problems over {len(rows)} jobs; wrote nothing")

    out = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")

    per = {}
    for r in rows:
        per.setdefault(r["part"], 0)
        per[r["part"]] += 1
    print(f"{os.path.relpath(out, ROOT)}: {len(rows)} jobs, {len(per)} shapes x "
          f"{len(rows) // len(per)} candidates, every one verified by bots-sd-render.check_job")
    print(f"  stack {stack}  scale {fixed['controlScale']}  end {fixed['controlEnd']}  "
          f"adapter {styles}  seeds {SEEDS}  root {CONTROLS_V3_REL}")
    print(f"  refs {REFS}")
    for shape in SHAPES:
        r = next(x for x in rows if x["shape"] == shape)
        print(f"  {r['part']:<14} prompt {r['promptTokens']} tok / {r['promptChunks']} chunks, "
              f"negative {count_tokens(r['negative'])[0]} tok "
              f"/ {chunks_needed(count_tokens(r['negative'])[0])} chunks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
