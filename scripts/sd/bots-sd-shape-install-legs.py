"""BATTLE BOTS: MERGE THE LEG RULERS INTO THE SHAPE TABLE.

    python scripts/sd/bots-sd-shape-install-legs.py           # merge and verify
    python scripts/sd/bots-sd-shape-install-legs.py --check   # verify only, write nothing

WHY THIS EXISTS. scripts/sd/bots-sd-shape-install.py builds the shape table
from the v3 bake's manifests, and it reads a `looks` list off each one. The
head lane's manifest carries `looks`; the leg lane's manifest carries a bare
`shapes` list of words instead, so the installer prints its note and leaves
the legs out. A leg candidate judged with no leg row in the table is judged
against the SHIP ruler, and every one of the ship table's eight leg rulers is
the same boot, so a wheel would be marked down for failing to be a boot. That
is the exact seam section 4a of the judge exists to close, and closing it for
the heads while leaving it open for the legs would be a judge that bends for
one slot.

WHAT IT DOES, AND WHAT IT WILL NOT DO. It reads manifest-leg.json, copies
each `target/legs-<shape>.png` into the preview parts tree as
parts/leg/leg-<shape>.png, and MERGES a row per shape into the table the head
installer wrote. Merge, never overwrite: the head rows are read back and
written out untouched, in their original order, and a re-run is idempotent.
It refuses rather than guesses if a ruler PNG is missing, and it verifies
every row it writes by importing the judge's own reader (rank_part.shape_ruler
runs the canvas, ink, pivot and proportion-band guards; rank_part.infer_shape
proves a real candidate path resolves to exactly one row).

THE ID IS `leg-<shape>`, not `<shape>` and not `legs-<shape>`. The renderer
wrote every leg candidate under out/stage6-legs/leg-<shape>/cut/, so
`leg-wheels` is a whole path segment and resolves with no guess. A bare
`boot` would also match the token `boot` inside a style-reference name such
as `..._ip0.30_leg-boot-red_v3.png`, which is two rows for one candidate and
an ambiguity refusal from the judge.

Nothing here ships. public/bots-art/parts is the live catalogue and is never
read, never written and never staged by this file.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

V3 = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v3")
PREVIEW = os.path.join(ROOT, ".bots-preview", "sd-shapes")
PARTS = os.path.join(PREVIEW, "parts")
TABLE = os.path.join(PREVIEW, "shape-table.json")
MANIFEST = os.path.join(V3, "manifest-leg.json")

NAMES = {"boot": "Boot", "wheels": "Wheels", "springs": "Springs",
         "sneakers": "Sneakers", "pegs": "Pegs"}
NOTES = {
    "boot": "the shipped leg. It is in the table as the comparison shape, so a new leg is measured "
            "against its own drawing and the boot is measured against the boot.",
    "wheels": "one wheel a side: a clay disc with a recessed hub, flattened where it meets the "
              "ground, standing on a coral tread block.",
    "springs": "a clay coil of four turns leaning out onto a coral pad.",
    "sneakers": "a low upper with a heel counter and a tongue on a coral sole.",
    "pegs": "a thin peg off a step, standing on a round coral pad.",
}


def die(msg: str) -> None:
    raise SystemExit("bots-sd-shape-install-legs REFUSES: " + msg)


def load_judge():
    """rank-part.py by path. Importing the judge is the whole point: a check
    that re-implements its reader reproduces its author's assumptions."""
    p = os.path.join(HERE, "rank-part.py")
    spec = importlib.util.spec_from_file_location("rank_part", p)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["rank_part"] = mod
    spec.loader.exec_module(mod)
    return mod


def rows() -> list[dict]:
    if not os.path.exists(MANIFEST):
        die(f"no {MANIFEST}. Run `node scripts/bots-bake-parts.mjs --out v3 --only head,leg` first.")
    man = json.load(open(MANIFEST, encoding="utf-8"))
    slot = man["slot"]
    if slot != "leg":
        die(f"{MANIFEST} declares slot {slot!r}, not 'leg'")
    shapes = man.get("looks") or man.get("shapes")
    if not shapes:
        die(f"{MANIFEST} lists neither `looks` nor `shapes`")
    out = []
    for s in shapes:
        shape = s["key"].replace("legs-", "") if isinstance(s, dict) else str(s)
        src = os.path.join(V3, "target", f"legs-{shape}.png")
        if not os.path.exists(src):
            die(f"{os.path.basename(MANIFEST)} lists {shape} but {src} is not on disk. "
                f"Run `node scripts/bots-bake-parts.mjs --out v3 --only head,leg` first.")
        out.append({"key": f"leg-{shape}", "shape": shape, "slot": slot, "src": src,
                    "name": NAMES.get(shape, shape.title()), "notes": NOTES.get(shape)})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify only, write nothing")
    args = ap.parse_args()

    legs = rows()
    if not os.path.exists(TABLE):
        die(f"no shape table at {TABLE}. Run scripts/sd/bots-sd-shape-install.py first: this file "
            f"MERGES into that table and will not author one on its own.")
    table = json.load(open(TABLE, encoding="utf-8"))

    if not args.check:
        dst_dir = os.path.join(PARTS, "leg")
        os.makedirs(dst_dir, exist_ok=True)
        for lk in legs:
            shutil.copy2(lk["src"], os.path.join(dst_dir, lk["key"] + ".png"))
        kept = [r for r in table["shapes"] if r.get("slot") != "leg"]
        merged = kept + [
            {
                "id": lk["key"],
                "slot": "leg",
                "ruler": f"parts/leg/{lk['key']}.png",
                "name": lk["name"],
                "shape": lk["shape"],
                "mouth": None,
                "prompt": None,
                "mouthPrompt": None,
                "notes": lk["notes"],
            }
            for lk in legs
        ]
        table["shapes"] = merged
        with open(TABLE, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(table, fh, indent=1, ensure_ascii=False)
            fh.write("\n")

    judge = load_judge()
    t = judge.shape_table(TABLE)
    bad = []
    for lk in legs:
        try:
            judge.shape_ruler("leg", lk["key"], TABLE)
        except SystemExit as e:
            bad.append(f"{lk['key']}: {e}")
        p = os.path.join("out", "stage6-legs", lk["key"], "cut",
                         f"{lk['key']}_depth+lineart_s0.85_ip0.30_leg-boot-red_v3.png")
        got = judge.infer_shape(p, TABLE)
        if got != lk["key"]:
            bad.append(f"{lk['key']}: a candidate under {p} infers shape {got!r}")
    if bad:
        die("the judge refused merged leg rulers:\n  " + "\n  ".join(bad))
    per_slot: dict = {}
    for (slot, _sid) in t["byKey"]:
        per_slot[slot] = per_slot.get(slot, 0) + 1
    print(f"shape table at {os.path.relpath(TABLE, ROOT)}: {len(t['byKey'])} looks "
          + ", ".join(f"{n} {s}" for s, n in sorted(per_slot.items())))
    print("every merged leg ruler passed rank-part's own verify_shape_ruler (canvas, ink, pivots, "
          "proportion bands) and infers its own shape from a candidate path")
    return 0


if __name__ == "__main__":
    sys.exit(main())
