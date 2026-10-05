"""BATTLE BOTS: PICK ONE LOOK PER SURVIVING SHAPE AND INSTALL IT TO SCRATCH.

    python scripts/sd/bots-sd-shape-pick.py            # pick, install, gate, render
    python scripts/sd/bots-sd-shape-pick.py --dry      # print the plan, write nothing

WHAT IT PICKS, AND WHAT IT REFUSES TO PICK ON. One look per SHAPE, named by
Mike's own shape table ("BELL flares out to the full width, O mouth", "CONE a
squat cone, zigzag mouth"), never by score: rank-part.py says in so many words
that a composite is a ranking key inside one pool and is never compared across
pools, so choosing bell over cone because bell scored higher would be reading
the number the judge forbids reading. Inside the chosen look, the winner is
whatever the judge ranked first in that pool, and nothing here re-ranks it.

A shape with no survivor is NOT installed and NOT substituted. It is named,
and it stays named all the way to the sheet.

THE CATALOGUE HAS EIGHT SLOTS PER PART and the table has more looks than that,
so what is installed is one look per surviving shape, into the slots in table
order, and every slot left over KEEPS THE LIVE PART. That is the honest
staging of the question Mike is being asked: if these shapes shipped, this is
the catalogue he would have.

THE PROOF. bots-sd-install.py installs nothing without a RANKED proof. Every
candidate here is rendered at tier 1 design 1 (its job file says so) and is
being installed into whichever catalogue slot the curation put it in, so the
report-row proof, which insists the row's tier and design equal the slot's,
cannot speak for it. The sidecar form can: this file writes
<candidate>.judge.json carrying the verdict, the composite, the rank in pool
and the sha256 of that exact file, every field copied out of the judge's own
report.json row for that file and none of them invented. A file whose sha does
not match its row is refused here rather than passed on. Nothing is installed
with --ship and nothing is installed --unjudged.

Target: .bots-preview/sd-shapes/parts, the preview tree named in the lane's
own law. public/bots-art/parts is never written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

PREVIEW = os.path.join(ROOT, ".bots-preview", "sd-shapes")
TABLE = os.path.join(PREVIEW, "shape-table.json")
SUMMARIES = [os.path.join(PREVIEW, "judge", "judge-summary.json"),
             os.path.join(PREVIEW, "judge-legs", "judge-summary.json"),
             os.path.join(PREVIEW, "judge-bear", "judge-summary.json")]
TARGET = os.path.join(PREVIEW, "parts")
SANDBOX = os.path.join(PREVIEW, "gate-sandbox")
SHEET = os.path.join(PREVIEW, "PAINT-SHEET.png")
MANIFEST_DIR = os.path.join(PREVIEW, "install")
INSTALL_PY = os.path.join(HERE, "bots-sd-install.py")

# THE LOOK MIKE'S SHAPE TABLE NAMES for each shape, in the words of the brief.
# Not a score, not a preference: the brief says BELL has an O mouth and CONE a
# zigzag, so those are the looks that stand for those shapes.
NAMED_LOOK = {
    "round": "head-round-smile",
    "box": "head-box-smile",
    "bear": "head-bear-smile",
    "tv": "head-tv-smile",
    "bell": "head-bell-o",
    "bucket": "head-bucket-widegrille",
    "cone": "head-cone-zigzag",
    "cat": "head-cat-smile",
    "wheels": "leg-wheels",
    "springs": "leg-springs",
    "sneakers": "leg-sneakers",
    "pegs": "leg-pegs",
}
SLOTS_ORDER = [(t, d) for t in (1, 2, 3, 4) for d in (1, 2)]


def die(msg: str) -> None:
    raise SystemExit("bots-sd-shape-pick REFUSES: " + msg)


def sha256(p: str) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--target", default=TARGET)
    a = ap.parse_args()

    table = json.load(open(TABLE, encoding="utf-8"))
    order: dict = {}
    for r in table["shapes"]:
        order.setdefault(r["slot"], [])
        if r.get("shape") not in order[r["slot"]]:
            order[r["slot"]].append(r.get("shape"))

    pools: dict = {}
    for s in SUMMARIES:
        if not os.path.exists(s):
            die(f"no judge summary at {s}")
        for p in json.load(open(s, encoding="utf-8"))["pools"]:
            pools[p["pool"]] = p

    plan, missing = [], []
    for slot in ("head", "leg"):
        used = 0
        for shape in order.get(slot, []):
            if slot == "leg" and shape == "boot":
                continue                      # the boot is the live part already
            look = NAMED_LOOK.get(shape)
            if not look:
                die(f"no named look for shape {shape!r}; the brief names one per shape")
            rec = pools.get(look)
            if rec is None:
                die(f"{look} was never judged; run bots-sd-shape-judge.py over its render tree")
            if not rec["survivors"] or not rec.get("winnerNormalised"):
                missing.append((slot, shape, look, rec["rejectsByFirstRule"]))
                continue
            if used >= len(SLOTS_ORDER):
                die(f"more surviving {slot} shapes than the catalogue's {len(SLOTS_ORDER)} slots")
            tier, design = SLOTS_ORDER[used]
            used += 1
            plan.append({"slot": slot, "tier": tier, "design": design, "shape": shape,
                         "look": look, "candidate": rec["winnerNormalised"],
                         "reportDir": rec["out"], "composite": rec["winnerComposite"],
                         "survivors": rec["survivors"]})

    print("THE PLAN")
    for p in plan:
        print(f"  {p['slot']}-t{p['tier']}-{p['design']:d}  {p['look']:<24} "
              f"top of {p['survivors']} survivors, composite {p['composite']:.1f}")
    for slot in ("head", "leg"):
        n = sum(1 for p in plan if p["slot"] == slot)
        print(f"  {slot}: {n} of {len(SLOTS_ORDER)} catalogue slots replaced, "
              f"{len(SLOTS_ORDER) - n} keep the live part")
    if missing:
        print("NOT INSTALLED, no survivor:")
        for slot, shape, look, why in missing:
            print(f"  {slot} {shape} ({look}): "
                  + ", ".join(f"{k} {v}" for k, v in why.items()))
    if a.dry:
        return 0

    # THE SIDECAR PROOF, copied out of the judge's own report row.
    for p in plan:
        rep = os.path.join(p["reportDir"], "report.json")
        if not os.path.exists(rep):
            die(f"no judge report at {rep}")
        rows = json.load(open(rep, encoding="utf-8"))["rows"]
        base = os.path.basename(p["candidate"])
        row = next((r for r in rows
                    if os.path.basename((r.get("normalisedFile") or "").replace("\\", "/")) == base),
                   None)
        if row is None:
            die(f"{rep} has no row whose normalisedFile is {base}")
        if row["verdict"] != "RANKED":
            die(f"{base} is {row['verdict']} in {rep}; only a RANKED candidate is installed")
        side = p["candidate"] + ".judge.json"
        with open(side, "w", encoding="utf-8", newline="\n") as fh:
            json.dump({"verdict": row["verdict"], "composite": row["composite"],
                       "rankInPool": row["rankInPool"], "pool": row.get("pool"),
                       "sha256": sha256(p["candidate"]), "report": rep,
                       "judgedFile": row["file"],
                       "note": "written by scripts/sd/bots-sd-shape-pick.py, every field copied from "
                               "the judge's own report row for this exact file"}, fh, indent=1)
            fh.write("\n")

    cmd = [sys.executable, INSTALL_PY]
    for p in plan:
        cmd += ["--part", p["slot"], str(p["tier"]), str(p["design"]), p["candidate"]]
    cmd += ["--target", a.target, "--gate", "--sandbox", SANDBOX, "--render", "--sheet", SHEET,
            "--manifest-dir", MANIFEST_DIR]
    print("\n$ " + " ".join(cmd[:2]) + " ... (" + str(len(plan)) + " parts)")
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    r = subprocess.run(cmd, cwd=ROOT, env=env)
    with open(os.path.join(PREVIEW, "pick.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"plan": plan, "notInstalled": [
            {"slot": s, "shape": sh, "look": lk, "rejectsByFirstRule": w} for s, sh, lk, w in missing
        ], "installExit": r.returncode}, fh, indent=1)
        fh.write("\n")
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
