"""BATTLE BOTS / stable-diffusion: THE SHAPE TABLE'S JOB FILE.

    python scripts/sd/bots-sd-shape-jobs.py            # write art-src/sd/jobs/stage6-heads.jsonl
    python scripts/sd/bots-sd-shape-jobs.py --dry      # print the plan, write nothing

Emits one runnable job per candidate for every look in the head shape table,
against the v3 controls tree, THROUGH THE SWEEP'S OWN PRODUCTION RECIPE.

WHY A SEPARATE FILE AND NOT A FLAG ON THE SWEEP. scripts/sd/bots-sd-sweep.py
is built on one assumption from end to end: a part key is a slot, a tier and a
design (`part_triple`, `every_part`, `part_key`). The shape table is not on
that axis at all: its axis is SHAPE and MOUTH, and `head-bear-smile` has no
tier in it. Teaching the sweep two axes would have touched every stage it
prices, for one stage. So this file borrows the sweep rather than editing it:

  THE RECIPE IS NOT RE-AUTHORED HERE. It is read out of the sweep's own
  production() at import time, the heads run, verbatim: the same two control
  stacks, the same two coupled (scale, end) pairs, the same six seeds, the
  same checkpoint, cfg, steps, sampler, plate, prompt variant, negative set,
  adapter weight and style reference. 2 x 2 x 6 = 24 candidates per look, the
  number production() itself asks for. If the sweep retunes the head recipe,
  this file follows on its next run and cannot silently disagree.

  THE PROMPT IS NOT RE-AUTHORED HERE EITHER. It is bots_sd_prompt's own
  segment list for the head, with exactly two substitutions:

    form      the crown words of the shipped matrix are replaced by this
              shape's crown clause from scripts/bots-shapes.json
    features  the mouth words are replaced by this look's mouth clause

  Both substrings are named in bots-shapes.json (crownPhrase, mouthPhrase) and
  both must be found exactly once or this file REFUSES. That is the point: the
  day someone rewords the matrix, the emitter stops instead of quietly sending
  every bear the dome prompt, which is the failure the whole shape table
  exists to end (PROMPT CHANGES CANNOT BEAT WHAT THE RULER DRAWS, and a prompt
  that silently reverts to the dome is worse than no prompt at all).

WHAT A JOB CARRIES that a tier-and-design job does not: `shape` and `mouth`,
and a `pool` that is the look key. Everything else is the same row
scripts/sd/bots-sd-render.py already runs, field for field.
"""
from __future__ import annotations

import argparse
import importlib.util
import itertools
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from bots_sd_prompt import (  # noqa: E402
    _escape,
    build_prompt,
    build_weighted,
    chunks_needed,
    count_tokens,
    load_matrix,
    segments,
    weights_table,
)

SHAPES_JSON = os.path.join(ROOT, "scripts", "bots-shapes.json")
V3_RULERS = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v3")
CONTROLS_V3_REL = "art-src/sd/controls/v3"
JOBS = os.path.join(ROOT, "art-src", "sd", "jobs")
OUT_NAME = "stage6-heads.jsonl"


def die(msg: str) -> None:
    raise SystemExit("bots-sd-shape-jobs REFUSES: " + msg)


def load_sweep():
    """Import the sweep as a module. Its file name is hyphenated, so it cannot
    be `import`ed by name; loading it by path is the only way to read the
    recipe from the file that owns it instead of copying the numbers."""
    p = os.path.join(HERE, "bots-sd-sweep.py")
    spec = importlib.util.spec_from_file_location("bots_sd_sweep", p)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["bots_sd_sweep"] = mod
    spec.loader.exec_module(mod)
    return mod


# ── the prompt, with this look's two clauses spliced in ────────────────────

def look_segments(m: dict, table: dict, shape_prompt: str, mouth_prompt: str, plate: str, variant: str):
    """bots_sd_prompt's own head segments, with the crown and the mouth
    replaced. A missed substring is a breaker, never a fallback."""
    crown, mouth = table["crownPhrase"], table["mouthPhrase"]
    out = []
    hit = {"form": 0, "features": 0}
    for name, text in segments(m, "head", int(table["tier"]), plate, variant):
        if name == "form":
            hit["form"] = text.count(crown)
            text = text.replace(crown, shape_prompt)
        elif name == "features":
            hit["features"] = text.count(mouth)
            text = text.replace(mouth, mouth_prompt)
        out.append((name, text))
    if hit["form"] != 1:
        die(f"the matrix's head `form` clause contains the crown phrase {hit['form']} times, expected once. "
            f"bots-shapes.json crownPhrase is {crown!r}; fix one or the other, because a shape prompt that "
            f"silently keeps the dome is the defect the shape table exists to end.")
    if hit["features"] != 1:
        die(f"the matrix's head `features` clause contains the mouth phrase {hit['features']} times, expected "
            f"once. bots-shapes.json mouthPhrase is {mouth!r}.")
    return out


def plain_of(segs) -> str:
    return ", ".join(t for _, t in segs)


def weighted_of(m: dict, segs) -> str:
    w = weights_table(m)
    out = []
    for name, text in segs:
        k = w.get(name, 1.0)
        text = _escape(text)
        out.append(f"({text}){k:.2f}" if abs(k - 1.0) > 1e-9 else text)
    return ", ".join(out)


# ── the looks ──────────────────────────────────────────────────────────────

def looks() -> tuple[dict, list[dict]]:
    """The table, and every look the v3 bake actually drew. The manifest is
    the authority on what exists on disk; the table is the authority on what
    each one says. A look in the table with no ruler is a hard stop."""
    table = json.load(open(SHAPES_JSON, encoding="utf-8"))
    mp = os.path.join(V3_RULERS, "manifest-head.json")
    if not os.path.exists(mp):
        die(f"no {mp}. Run `node scripts/bots-bake-parts.mjs --out v3 --only head` first.")
    man = json.load(open(mp, encoding="utf-8"))
    rows = []
    for lk in man["looks"]:
        png = os.path.join(V3_RULERS, "target", lk["key"] + ".png")
        if not os.path.exists(png):
            die(f"the manifest lists {lk['key']} but {png} is not on disk")
        rows.append(lk)
    return table, rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="print the plan, write nothing")
    args = ap.parse_args()

    sweep = load_sweep()
    m = load_matrix()
    table, rows = looks()

    # THE RECIPE, READ FROM THE SWEEP. production() returns the two production
    # runs; the head run is the one this file follows.
    heads = [r for r in sweep.production(m) if r["name"] == "heads"]
    if len(heads) != 1:
        die("the sweep's production() no longer has exactly one run named `heads`")
    stage = heads[0]

    rel = CONTROLS_V3_REL
    missing = sweep.root_missing(rel, [r["key"] for r in rows])
    if missing:
        die("the v3 controls root is not ready:\n  " + "\n  ".join(missing[:8])
            + "\nRun `python scripts/sd/bots-sd-controls.py --source v3 --layout both` first.")
    place = sweep.placements(rel)

    axes = [(k, v) for k, v in stage["vary"].items() if isinstance(v, list)]
    fixed = stage["fixed"]
    jobs = []
    for values in itertools.product(*[v for _, v in axes]):
        setting = sweep.uncouple(dict(zip([k for k, _ in axes], values)))
        f = {**fixed, **setting}
        for lk in rows:
            segs = look_segments(m, table, lk["prompt"], lk["mouthPrompt"], f["plate"], f["promptVariant"])
            # THE SLOT IS THE LOOK (lane R, 2026-09-05). These jobs used to go
            # out as slot "head" carrying a spliced prompt, and the runner
            # refused all 384 of them: bots-sd-render.check_job rebuilds a
            # job's prompt with build_prompt(m, j["slot"], ...) and got the
            # dome back. So the look is its own slot in the matrix, exactly as
            # lane B's leg shapes are (`leg-wheels`), generated from the shape
            # table by scripts/sd/bots-sd-shape-slots.py. The splice above
            # stays the author; the two asserts below are the gate that the
            # matrix still says what the shape table says, so the day the two
            # drift this file stops instead of sending 384 dome prompts.
            slot = lk["key"]
            prompt = build_prompt(m, slot, int(table["tier"]), f["plate"], f["promptVariant"])
            compel = build_weighted(m, slot, int(table["tier"]), f["plate"], f["promptVariant"])
            if prompt != plain_of(segs):
                die(f"the matrix slot {slot!r} does not assemble the spliced prompt for this look. "
                    f"Run `python scripts/sd/bots-sd-shape-slots.py --write` and emit again.")
            if compel != weighted_of(m, segs):
                die(f"the matrix slot {slot!r} does not assemble the spliced weighted prompt for this look. "
                    f"Run `python scripts/sd/bots-sd-shape-slots.py --write` and emit again.")
            tokens, counter = count_tokens(prompt)
            style = float(f.get("style", 0.0))
            ref = f.get("styleRef") if style > 0.0 else None
            for seed in range(stage["seeds"]):
                jobs.append({
                    "part": lk["key"], "slot": slot,
                    "shape": lk["shape"], "mouth": lk["mouth"],
                    "tier": int(table["tier"]), "design": 1,
                    "pool": lk["key"],
                    "controls": {k: f"{rel}/square/{lk['key']}/{k}.png"
                                 for k in ("depth", "lineart", "canny", "alpha", "hidden")},
                    "matte": f"{rel}/contract/{lk['key']}/alpha.png",
                    "placement": place[lk["key"]],
                    "controlsRoot": rel,
                    "controlStack": f["controlStack"], "controlScale": f["controlScale"],
                    "controlEnd": f["controlEnd"], "cfg": f["cfg"], "steps": f["steps"],
                    "sampler": f["sampler"], "checkpoint": f["checkpoint"], "layout": stage["layout"],
                    "plate": f["plate"], "promptVariant": f["promptVariant"],
                    "style": style, "styleRef": sweep.style_ref_path(ref), "styleRefName": ref,
                    "seed": 1000 + seed,
                    "negativeSet": f["negative"],
                    # the look's negative groups are a copy of the head's, so
                    # this string is byte-identical to the one these jobs
                    # carried when the slot was "head" (checked, 384 of 384).
                    "negative": sweep.build_negative(m, f["negative"], slot),
                    "prompt": prompt,
                    "promptCompel": compel,
                    "promptTokens": tokens, "promptChunks": chunks_needed(tokens), "tokenCounter": counter,
                    "plateHex": m["plates"][f["plate"]]["hex"],
                })

    per = len(jobs) // max(len(rows), 1)
    print(f"the sweep's head recipe: stacks {stage['vary']['controlStack']}, "
          f"(scale, end) {stage['vary']['controlScale+controlEnd']}, {stage['seeds']} seeds, "
          f"adapter {fixed['style']} against {fixed['styleRef']}")
    print(f"{len(rows)} looks x {per} candidates = {len(jobs)} jobs against {rel}")
    worst = max(j["promptTokens"] for j in jobs)
    print(f"longest prompt {worst} tokens, {chunks_needed(worst)} chunks; counter {jobs[0]['tokenCounter']}")
    if args.dry:
        return 0
    os.makedirs(JOBS, exist_ok=True)
    out = os.path.join(JOBS, OUT_NAME)
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for j in jobs:
            fh.write(json.dumps(j) + "\n")
    print(f"wrote {os.path.relpath(out, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
