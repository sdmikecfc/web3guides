"""BATTLE BOTS: JUDGE THE SHAPE POOLS, ONE POOL PER SHAPE.

    python scripts/sd/bots-sd-shape-judge.py                 # judge both render trees
    python scripts/sd/bots-sd-shape-judge.py --tree <dir>     # judge one tree
    python scripts/sd/bots-sd-shape-judge.py --jobs 8

WHAT THIS IS. A DRIVER, not a second judge. Every number it prints comes out
of scripts/sd/rank-part.py, imported by path and called by name:
rank_part.infer_shape decides which shape a candidate is, rank_part._score_one
scores it, rank_part.order ranks it inside its own pool, rank_part.pick takes
the winner and rank_part._report writes report.json, report.csv and the
normalised PNGs. NOT ONE RULE, NOT ONE BAR AND NOT ONE THRESHOLD LIVES HERE.
There is no per-shape relaxation anywhere in this file, and there is nowhere
one could be added: this file never looks at a verdict except to count it.

WHY A DRIVER IS NEEDED AT ALL. rank-part's own batch mode reads a candidate's
slot, tier and design out of its FILENAME (`head-t3-1`), and the shape lane's
renderer writes `head-bear-o_depth+lineart_..._seed1000_...png` under
out/stage6-heads/head-bear-o/cut/, which carries no such token. Batch would
skip all 480. So the slot comes from the render tree's own manifest (the job
file each pool was rendered from says slot, tier and design) and the shape
comes from the judge's own infer_shape on the candidate's path.

WHAT IS JUDGED. Only the cuts. A raw 1024x1024 render on its grey plate is
not a candidate and the judge says so; judging one would fill the report with
REFUSED rows that mean nothing. The cut tree is <pool>/cut/*.png.

THE OUTPUT. One directory per pool under .bots-preview/sd-shapes/judge/,
carrying report.json, report.csv, README.txt and normalised/, which is the
exact layout scripts/sd/bots-sd-install.py looks for when it asks a candidate
for its RANKED proof. Plus judge-summary.json, one row per pool: how many
survived, which candidate won, and the first reject reason of every loser
counted by rule.

Nothing here ships and nothing here writes to public/bots-art.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

PREVIEW = os.path.join(ROOT, ".bots-preview", "sd-shapes")
RENDERS = os.path.join(PREVIEW, "renders")
JUDGE_OUT = os.path.join(PREVIEW, "judge")
TABLE = os.path.join(PREVIEW, "shape-table.json")
JOBS = {
    "stage6-heads": os.path.join(ROOT, "art-src", "sd", "jobs", "stage6-heads.jsonl"),
    "stage6-legs": os.path.join(ROOT, "art-src", "sd", "jobs", "stage6-legs.jsonl"),
    # the bear re-render of 2026-09-05, after its ears were seated in the crown
    "stage6-bear": os.path.join(ROOT, "art-src", "sd", "jobs", "stage6-bear.jsonl"),
}


def die(msg: str) -> None:
    raise SystemExit("bots-sd-shape-judge REFUSES: " + msg)


_JUDGE = None


def load_judge():
    """rank-part.py by path, once per process. Its file name is hyphenated, so
    it is not importable by name, and THAT is why the worker below re-loads it
    on its own instead of the pool pickling one of its functions: on Windows a
    pool worker unpickles a function by importing its module, `import
    rank_part` raises ModuleNotFoundError inside the worker loop where nothing
    catches it, and the run hangs forever with idle workers. Measured on
    2026-09-05: 480 cuts, twenty minutes, 0.2 seconds of CPU per worker."""
    global _JUDGE
    if _JUDGE is None:
        p = os.path.join(HERE, "rank-part.py")
        spec = importlib.util.spec_from_file_location("rank_part", p)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["rank_part"] = mod
        spec.loader.exec_module(mod)
        _JUDGE = mod
    return _JUDGE


def _work(job):
    """One candidate, scored by the judge's own _score_one. The job is a plain
    tuple of strings and numbers, so nothing that crosses the process boundary
    needs rank_part to be importable."""
    return load_judge()._score_one(job)


def pool_specs(tree: str) -> dict:
    """slot, tier and design per pool, READ OFF THE JOB FILE THE POOL WAS
    RENDERED FROM. Never guessed from a name: a wrong tier would ask the
    importer's normalisation for the wrong accent budget and every number
    after it would be a confident wrong number."""
    jf = JOBS.get(os.path.basename(tree))
    if not jf or not os.path.exists(jf):
        die(f"no job file for {tree}; looked for {jf}")
    out: dict = {}
    for line in open(jf, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        j = json.loads(line)
        pool = j.get("pool") or j.get("part")
        slot = j.get("realSlot") or j.get("slot")
        # the head lane makes each look its own matrix slot (`head-bear-o`),
        # so the contract slot is the first word of it when no realSlot is set
        if slot not in ("head", "torso", "arm", "leg", "weapon"):
            slot = slot.split("-")[0]
        rec = (slot, int(j["tier"]), int(j["design"]))
        if pool in out and out[pool] != rec:
            die(f"{pool} carries two different slot/tier/design in {jf}: {out[pool]} and {rec}")
        out[pool] = rec
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tree", action="append", help="a render tree; default both")
    ap.add_argument("--out", default=JUDGE_OUT)
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 4) - 1))
    ap.add_argument("--sheet", action="store_true", help="write rank-part's contact sheets per pool")
    a = ap.parse_args()

    trees = a.tree or [os.path.join(RENDERS, t) for t in JOBS]
    judge = load_judge()
    if not os.path.exists(TABLE):
        die(f"no shape table at {TABLE}. Run bots-sd-shape-install.py then "
            f"bots-sd-shape-install-legs.py first.")

    work: list[tuple] = []
    pools: dict = {}
    for tree in trees:
        if not os.path.isdir(tree):
            die(f"no render tree at {tree}")
        spec = pool_specs(tree)
        for pool in sorted(os.listdir(tree)):
            cut = os.path.join(tree, pool, "cut")
            if not os.path.isdir(cut):
                continue
            if pool not in spec:
                die(f"{pool} is on disk under {tree} but its job file never names it")
            slot, tier, design = spec[pool]
            files = sorted(f for f in os.listdir(cut)
                           if f.lower().endswith(".png") and ".mask." not in f.lower())
            if not files:
                die(f"{cut} holds no cuts")
            out_dir = os.path.join(a.out, pool)
            # THE JUDGE NAMES THE POOL, not this file: rank_part._pool builds
            # `head-bear-o-t1-1` from the slot, the shape and the tier, and a
            # second spelling of it here would silently group nothing.
            pools[pool] = {"slot": slot, "tier": tier, "design": design, "out": out_dir,
                           "n": len(files),
                           "judgeKey": judge._pool(slot, tier, design, pool)}
            for f in files:
                p = os.path.join(cut, f)
                shape = judge.infer_shape(p, TABLE)
                if shape != pool:
                    die(f"{p} infers shape {shape!r}, not its own pool {pool!r}. The judge would "
                        f"measure it against the wrong drawing.")
                work.append((p, slot, tier, design, None, False,
                             judge._norm_out(out_dir, cut, p), shape, None, TABLE))

    print(f"judging {len(work)} cuts in {len(pools)} pools against {os.path.relpath(TABLE, ROOT)}")
    t0 = time.time()
    if a.jobs > 1 and len(work) > 60:
        import multiprocessing as mp
        with mp.Pool(a.jobs) as pool:
            rows = pool.map(_work, work, chunksize=4)
    else:
        rows = [_work(j) for j in work]
    dt = time.time() - t0
    print(f"{len(rows)} judged in {dt:.1f}s ({dt / max(len(rows), 1) * 1000:.0f} ms each)")

    by: dict = {}
    for r in rows:
        by.setdefault(judge.pool_key(r), []).append(r)

    summary = []
    for pool in sorted(pools):
        info = pools[pool]
        prs = by.get(info["judgeKey"], [])
        if len(prs) != info["n"]:
            die(f"{pool}: {info['n']} cuts went in and {len(prs)} rows came back under the judge's "
                f"own pool name {info['judgeKey']!r}. Nothing may be dropped between the two.")
        prs = judge._report(prs, info["out"], a.sheet, None)
        win = judge.pick(prs)
        survivors = [r for r in prs if r["verdict"] == "RANKED"]
        rejects: dict = {}
        for r in prs:
            if r["verdict"] != "RANKED":
                k = (r.get("fail") or ["?"])[0].split(":")[0]
                rejects[k] = rejects.get(k, 0) + 1
        summary.append({
            "pool": pool, "slot": info["slot"], "tier": info["tier"], "design": info["design"],
            "candidates": len(prs), "survivors": len(survivors),
            "winner": (win or {}).get("file"),
            "winnerNormalised": (win or {}).get("normalisedFile"),
            "winnerComposite": (win or {}).get("composite"),
            "winnerIoU": ((win or {}).get("fit") or {}).get("iou"),
            "rejectsByFirstRule": dict(sorted(rejects.items(), key=lambda kv: -kv[1])),
            "out": info["out"],
        })

    with open(os.path.join(a.out, "judge-summary.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"table": TABLE, "pools": summary}, fh, indent=1)
        fh.write("\n")

    print()
    print(f"{'pool':<24} {'n':>3} {'survive':>7}  {'top':>6}  first reject reasons")
    for s in summary:
        why = ", ".join(f"{k} {v}" for k, v in s["rejectsByFirstRule"].items()) or "none"
        top = f"{s['winnerComposite']:.1f}" if s["winnerComposite"] is not None else "-"
        print(f"{s['pool']:<24} {s['candidates']:>3} {s['survivors']:>7}  {top:>6}  {why[:96]}")
    dead = [s["pool"] for s in summary if s["survivors"] == 0]
    print(f"\n{len(summary) - len(dead)} of {len(summary)} pools have a survivor.")
    if dead:
        print("NO SURVIVOR: " + ", ".join(dead))
    print(f"summary: {os.path.join(a.out, 'judge-summary.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
