"""BATTLE BOTS: GATE THE RULERS BEFORE SPENDING GPU (lane L, 2026-09-05).

    python scripts/sd/bots-sd-gate-rulers.py --slot leg
    python scripts/sd/bots-sd-gate-rulers.py --slot leg --json

WHY THIS RUNS BEFORE A JOB FILE IS WRITTEN, AND NOT AFTER A RENDER.

Wave one proved, twice, that a render can only be as different from another
render as the two RULERS behind them are. The bear head came back with zero
survivors and two loose balls floating over the crown with its ears grazing
the dome; with the ears SEATED on the crown and not one word of the prompt
changed, the same 48 renders gave fifteen. The mouth swap ran the other way:
five mouths were asked for on a ruler that changed by a thin line, and four of
the five came back as the same slatted mouth, because the model has one idea
of a robot mouth and a thin line does not argue with it.

So the look-alike gate, which the factory only ever ran on rendered parts, is
worth far more one step earlier. Run on the CLAY RULERS it answers the same
question the catalogue is judged on - are these different from each other - at
the only moment the answer is cheap to act on. A shape that fails here is ten
minutes of drawing. The same shape failing after a render is forty minutes of
rented 4090 and a contact sheet nobody wants to look at twice.

WHAT IT DOES NOT DO. It does not move a bar and it does not add one. It stages
the rulers in a catalogue laid out the way scripts/bots-lookalike-check.mts
expects and runs THAT FILE, unmodified, as a subprocess, exactly as
scripts/sd/bots-sd-shape-sheet.py already runs it over the rendered winners.
Both bars (closest pair 0.90, typical pair 0.80) are the gate's own and are
read out of its own JSON. A ruler set that needs a bar moved is refused, which
is the whole point: the judge does not bend, and neither does this.

WHAT PASSING HERE DOES AND DOES NOT PROMISE. It promises the SHAPES ARE
DIFFERENT AS DRAWN. It promises nothing about whether the renders will be
good, whether they will be different from each other, or whether the model
will honour the ruler at all: those are scripts/sd/rank-part.py's questions
and they are asked afterwards, of the renders, at the bars they were
calibrated at. This gate only closes the door on the one failure that is free
to catch and expensive to miss.

Writes nothing outside a temporary directory it deletes.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
GATE = os.path.join(ROOT, "scripts", "bots-lookalike-check.mts")
V3_TARGET = os.path.join(ROOT, "public", "bots-art", "_raw", "parts",
                         "placeholders-v3", "target")

#: where each slot's authored shape rulers live, and how their files are named.
#: `--out v3` writes `legs-<shape>.png` and `head-<shape>-<mouth>.png`, and the
#: gate names a row after the file, so the prefix comes off: a row called
#: `sneakers` is readable in a failure message and `legs-sneakers` is not.
RULER_SETS = {
    "leg": {"dir": V3_TARGET, "prefix": "legs-"},
    "head": {"dir": V3_TARGET, "prefix": "head-"},
}


def die(msg: str) -> None:
    raise SystemExit("bots-sd-gate-rulers REFUSES: " + msg)


def ruler_files(slot: str, ruler_dir: str | None = None) -> list[str]:
    if slot not in RULER_SETS:
        die(f"no ruler set is declared for slot {slot}; have {sorted(RULER_SETS)}")
    spec = RULER_SETS[slot]
    d = ruler_dir or spec["dir"]
    if not os.path.isdir(d):
        die(f"no ruler tree at {d}. Run `node scripts/bots-bake-parts.mjs --out v3 "
            f"--only {slot}` first.")
    files = sorted(os.path.join(d, f) for f in os.listdir(d)
                   if f.startswith(spec["prefix"]) and f.lower().endswith(".png"))
    if len(files) < 2:
        die(f"{d} holds {len(files)} {slot} ruler(s). A slot with one shape in it is a "
            f"slot with no choice in it, which is the thing this gate measures.")
    return files


def gate(slot: str, files: list[str], table: str | None = None) -> dict:
    """Stage exactly these rulers as a one-slot catalogue and ask the SHIPPED
    look-alike gate about it. The rulers are copied under their SHAPE name,
    with the bake's slot prefix removed, so the gate's own failure text names
    the shape a person would have to redraw."""
    prefix = RULER_SETS[slot]["prefix"]
    tmp = tempfile.mkdtemp(prefix="bots-ruler-gate-")
    try:
        d = os.path.join(tmp, slot)
        os.makedirs(d, exist_ok=True)
        for p in files:
            name = os.path.basename(p)
            shutil.copy2(p, os.path.join(d, name[len(prefix):] if name.startswith(prefix) else name))
        cmd = ["npx", "tsx", GATE, tmp, "--json"]
        if table:
            cmd += ["--shape-table", table]
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                           shell=(os.name == "nt"))
        txt = r.stdout.strip()
        i = txt.find("{")
        if i < 0:
            die("the look-alike gate printed no JSON:\n" + (r.stdout + r.stderr)[:1200])
        return json.loads(txt[i:])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def require(slot: str, ruler_dir: str | None = None, table: str | None = None,
            quiet: bool = False) -> dict:
    """Gate the slot's rulers and REFUSE if they do not pass. This is the call
    an emitter makes: it either returns the numbers or it stops the run."""
    files = ruler_files(slot, ruler_dir)
    res = gate(slot, files, table)
    row = next((r for r in res.get("results", []) if r["slot"] == slot), None)
    if not quiet:
        print(f"ruler gate: {slot}, {len(files)} clay rulers, "
              f"bars {res.get('pairBar')} closest / {res.get('medianBar')} typical")
        if row and row.get("closest"):
            c, f = row["closest"], row["furthest"]
            print(f"  closest  {c['a']} / {c['b']}  {c['overlap']:.3f}  "
                  f"({(1 - c['overlap']) * 100:.1f} pixels in 100 apart)")
            print(f"  typical  {row['median']:.3f}   furthest  {f['a']} / {f['b']}  "
                  f"{f['overlap']:.3f}   {row['distinct']} shapes of {row['n']}")
            for t in row.get("tooClose", []):
                print(f"  TOO CLOSE  {t['a']} / {t['b']}  {t['overlap']:.3f}")
    if not res.get("pass"):
        for line in res.get("fails", []):
            print("  " + line, file=sys.stderr)
        die(f"the {slot} rulers do not pass the look-alike gate, so no job file is written. "
            f"Redraw the shapes it names; do not relax a bar and do not render them.")
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slot", default="leg", help="the slot whose rulers to gate")
    ap.add_argument("--rulers", default=None, help="a ruler tree other than the v3 target tree")
    ap.add_argument("--shape-table", default=None, help="group files by the shape they claim")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    res = require(a.slot, a.rulers, a.shape_table, quiet=a.json)
    if a.json:
        print(json.dumps(res, indent=1))
    else:
        print(f"ruler gate PASSED for {a.slot}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
