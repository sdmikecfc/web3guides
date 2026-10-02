"""BATTLE BOTS / stable-diffusion: THE V3 BODY JOBS (lane T, 2026-09-05).

    python scripts/sd/bots-sd-emit-v3-bodies.py
    python scripts/sd/bots-sd-emit-v3-bodies.py --out art-src/sd/jobs/stage7-bodies.jsonl

Emits 24 candidates for each of the four torso shapes and each of the four arm
shapes against art-src/sd/controls/v3, one matrix slot per shape.

WHY THE LIVE SHAPES ARE STILL RENDERED HERE, unlike lane B's `boot`. The
barrel IS the live torso outline and the factory already holds 24 candidates
of it, so on lane B's reasoning it would be skipped. It is not, for one
measured reason: the factory's barrel candidates were rendered against slot
`torso`, whose prompt says "a rounded barrel" and nothing about corners, and
the four shapes are compared to each other on the SAME recipe or the
comparison is not a comparison. Twenty-four cheap candidates are worth less
than a contact sheet whose columns can be read against each other. The arms
have no live row at all: the v2 arm rulers measure armL 0.268 against a band
that stops at 0.263, so neither is in the table.

── THE SETTINGS ARE THE PRODUCTION RECIPE, NOT A NEW GUESS ───────────────
Everything but the shape and the style reference comes out of
scripts/sd/bots-sd-sweep.py's own production() "limbs-v2" entry, read at run
time rather than copied: depth+lineart at scale 0.85, end 0.8, cfg 5.0, 30
steps, dpmpp_2m_karras on sdxl-base-1.0, adapter 0.3 and 0.45. The torso and
the arm are both in that entry's own part list, so this is literally the
recipe those two slots ship on today.

── THE STYLE REFERENCES, AND THE ONE DEVIATION FROM THE RECIPE ───────────
production() sends every limbs-v2 part to `bot-2`, a whole robot. The adapter
argues for what it is shown, and lane B measured on the legs that a part is
better shown a part: so a torso is shown TORSOS and an arm is shown ARMS,
three each, and the 24 candidates are 2 adapter weights x 3 references x 4
seeds instead of 2 x 12. Nothing else moves.

  torso, all four    torso-teal, torso-cream, torso-red. Every torso on the
                     concept shelf is a barrel, so none of them argues for a
                     toolbox or a teapot, and that is fine and on purpose: the
                     RULER carries the shape, the adapter carries the finish.
                     torso-blue is left out on its own entry's advice ("its
                     shadowed lower-left corner mattes soft under every model
                     we have; prefer torso-teal").
  mitts              arm-mitt-teal, arm-mitt-pale, arm-white-cuff: the fist
                     end of an arm, three finishes.
  claws              arm-claw-red, arm-pincer-teal, arm-mitt-teal. The first
                     two are the gripper vocabulary; the third keeps a closed
                     hand in the argument so the fingers do not run away.
  pincers            arm-pincer-red, arm-pincer-teal, arm-elbow-white. The
                     white two-segment arm is the only SLIM limb on the shelf
                     and this is the only slim shape in the table.
  tube               arm-bent-teal, arm-teal-cuffs, arm-white-cuff.
                     arm-bent-teal is the shelf's ring teacher ("a chrome ball
                     at each end, teal rings between"), which is the bellows.

  arm-hand-chrome and arm-coral are deliberately unused: the first is a
  five-finger hand and its own entry says use it last, and the second's
  shoulder ball "holds a red lens in a chrome ring and can read as an eye",
  which is the failure every limb slot's negative already carries `face` for.

── WHY THE SLOT KEY IS `torso-teapot` AND NOT `torso` ────────────────────
scripts/sd/bots-sd-render.py verifies every job before it spends a second of
GPU on it: it rebuilds the prompt, the weighted prompt and the negative from
the matrix using the job's OWN `slot`, and refuses the job if any of the three
differs. So a job whose slot says `torso` must carry the barrel's prompt or it
is refused, which is how lane R lost 384 head jobs. The shapes therefore ride
as slot keys the matrix answers for, generated from the shape table by
scripts/sd/bots-sd-body-slots.py.

This file runs the runner's own verify itself, on every row, before it writes
anything: a bad job file never reaches the box and never costs an hour of
rented GPU to discover.
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
V3_ROOT = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v3")
MANIFEST = {"torso": "manifest-torso.json", "arm": "manifest-arm.json"}
SEEDS = 4
REFS = {
    "torso-barrel":  ["torso-teal", "torso-cream", "torso-red"],
    "torso-toolbox": ["torso-teal", "torso-cream", "torso-red"],
    "torso-teapot":  ["torso-teal", "torso-cream", "torso-red"],
    "torso-engine":  ["torso-teal", "torso-cream", "torso-red"],
    "arm-mitts":     ["arm-mitt-teal", "arm-mitt-pale", "arm-white-cuff"],
    "arm-claws":     ["arm-claw-red", "arm-pincer-teal", "arm-mitt-teal"],
    "arm-pincers":   ["arm-pincer-red", "arm-pincer-teal", "arm-elbow-white"],
    "arm-tube":      ["arm-bent-teal", "arm-teal-cuffs", "arm-white-cuff"],
}


def die(msg: str) -> None:
    raise SystemExit("bots-sd-emit-v3-bodies REFUSES: " + msg)


def _by_path(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [sys.argv[0]]
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


def shapes() -> list[tuple[str, str]]:
    """(slot, shape) for every body shape the v3 bake declares, read off the
    manifests it writes. The bake is the authority on what exists on disk."""
    out = []
    for slot in ("torso", "arm"):
        p = os.path.join(V3_ROOT, MANIFEST[slot])
        if not os.path.exists(p):
            die(f"no {p}. Run `node scripts/bots-bake-parts.mjs --out v3 --only torso,arm` first.")
        for row in json.load(open(p, encoding="utf-8"))["shapeRows"]:
            out.append((slot, row["shape"]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join("art-src", "sd", "jobs", "stage7-bodies.jsonl"))
    args = ap.parse_args()

    S = _by_path("bots_sd_sweep", "bots-sd-sweep.py")
    R = _by_path("bots_sd_render", "bots-sd-render.py")
    m = load_matrix()

    prod = [p for p in S.production(m) if p["name"] == "limbs-v2"]
    if len(prod) != 1:
        die("the sweep's production() no longer has exactly one run named `limbs-v2`")
    prod = prod[0]
    fixed = dict(prod["fixed"])
    styles = list(prod["vary"]["style"])
    stack = prod["vary"]["controlStack"][0]

    man = os.path.join(ROOT, CONTROLS_V3_REL, "square", "manifest.json")
    if not os.path.exists(man):
        die(f"no square manifest at {man}. Run scripts/sd/bots-sd-controls-v3-bodies.py first.")
    place = {it["key"]: it for it in json.load(open(man, encoding="utf-8"))["items"]}

    rows = []
    for slot, shape in shapes():
        key = f"{slot}-{shape}"
        if key not in place:
            die(f"the v3 square manifest has no entry for {key}. Re-run "
                "scripts/sd/bots-sd-controls-v3-bodies.py (another lane's control run may have "
                "overwritten the manifest instead of merging it).")
        if key not in REFS:
            die(f"no style references named for {key}; add a row to REFS above and say why")
        it = place[key]
        for style in styles:
            for ref in REFS[key]:
                for seed in range(SEEDS):
                    prompt = build_prompt(m, key, 1, fixed["plate"], fixed["promptVariant"])
                    tokens, counter = count_tokens(prompt)
                    rows.append({
                        "part": key, "slot": key, "realSlot": slot, "shape": shape,
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

    # THE RUNNER'S OWN CHECK, HERE, BEFORE ANYTHING IS WRITTEN.
    bad = []
    for r in rows:
        for msg in R.check_job(m, r):
            bad.append((r["part"], r["seed"], r["styleRefName"], msg))
    if bad:
        for b in bad[:12]:
            print("  REFUSED", b)
        die(f"{len(bad)} problems over {len(rows)} jobs; wrote nothing")

    out = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")

    per = {}
    for r in rows:
        per[r["part"]] = per.get(r["part"], 0) + 1
    print(f"{os.path.relpath(out, ROOT)}: {len(rows)} jobs, {len(per)} shapes x "
          f"{len(rows) // len(per)} candidates, every one verified by bots-sd-render.check_job")
    print(f"  stack {stack}  scale {fixed['controlScale']}  end {fixed['controlEnd']}  "
          f"adapter {styles}  seeds {SEEDS}  root {CONTROLS_V3_REL}")
    for key in per:
        r = next(x for x in rows if x["part"] == key)
        print(f"  {key:<14} refs {REFS[key]}  prompt {r['promptTokens']} tok "
              f"/ {r['promptChunks']} chunks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
