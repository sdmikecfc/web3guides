"""BATTLE BOTS: DRAW THE SHEET MIKE DECIDES ON.

    python scripts/sd/bots-sd-shape-sheet.py
    python scripts/sd/bots-sd-shape-sheet.py --out .bots-preview/sd-shapes/DECIDE-SHAPES.png

WHAT IT DRAWS, in the order a person reads it:

  ROW ONE      every head look and every leg shape that survived the judge,
               at 120 px, in ONE paint, each labelled with its word. One paint
               because the question on this row is the SCULPT: colour is the
               thing that would flatter it.
  ROWS 2-4     eighteen mixed robots at ring size, one head look each, legs
               rotating through the leg shapes, every part in a different
               found colour, no hats and no stickers, with the same eighteen
               repeated beneath at 120 px so a person sees them at the size
               they actually appear on a card.
  LAST STRIP   the eighteen robots the live catalogue can build today against
               the eighteen above, side by side at the same size.

  EVERY ROW prints the closest pair outline overlap of the heads (or the legs)
  it shows, so nobody has to take this file's word for anything.

WHERE EVERY NUMBER COMES FROM. Not from here. The overlap numbers are
scripts/bots-lookalike-check.mts, the shipped look-alike gate, run as a
subprocess over a staged folder holding exactly the drawings that row shows,
read back from its own --json. The base and the paint mask of every part are
scripts/bots-paint-masks.py's own process(), loaded the way
scripts/sd/bots-sd-install.py loads it and called with explicit paths. The
paints are read out of src/app/bots/_ui/tokens.ts by bots-sd-install's own
read_paints, and a painted pixel is bots-sd-install's own tint, which is
rig.ts's base * (1 - a + a * paint). The winners are whatever
scripts/sd/rank-part.py ranked first in each pool, read out of
judge-summary.json. This file owns the LAYOUT and nothing else.

HOW A ROBOT IS PUT TOGETHER. Straight off the frozen contract in
src/app/bots/_view/rig-points.ts, read by import through a tiny reader: every
part's pivot lands on the torso's own socket point (the head's neck on the
torso's neck, a hip on a hip, a shoulder on a shoulder), the left limbs are
the mirrored sprite, and the draw order is JOIN.drawOrder. PART_SCALE in
rig.ts is 1 on every socket by design, so there is no scale to reproduce.
The torso and the arms are the LIVE shipped parts, read and never written:
this sheet asks what a new head and a new leg do to a bot, so everything else
has to stay still.

Writes only under .bots-preview/sd-shapes. Never touches public/bots-art.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
ROOT = os.path.dirname(SCRIPTS)
sys.path.insert(0, HERE)

PREVIEW = os.path.join(ROOT, ".bots-preview", "sd-shapes")
TABLE = os.path.join(PREVIEW, "shape-table.json")
SUMMARIES = [os.path.join(PREVIEW, "judge", "judge-summary.json"),
             os.path.join(PREVIEW, "judge-legs", "judge-summary.json"),
             os.path.join(PREVIEW, "judge-bear", "judge-summary.json")]
PAIRS = os.path.join(PREVIEW, "pairs")
LIVE = os.path.join(ROOT, "public", "bots-art", "parts")
GATE = os.path.join(SCRIPTS, "bots-lookalike-check.mts")
RIG_TS = os.path.join(ROOT, "src", "app", "bots", "_view", "rig-points.ts")

BOARD = (201, 187, 155)
DARK = (32, 34, 40)
PAPER = (243, 238, 226)


def die(msg: str) -> None:
    raise SystemExit("bots-sd-shape-sheet REFUSES: " + msg)


def load(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# ── the contract, read out of the frozen file rather than retyped ─────────

def rig_contract() -> dict:
    """RIG and JOIN.drawOrder out of src/app/bots/_view/rig-points.ts. A sheet
    that retyped the canvases would keep drawing the old rig the day they
    move, so they are read; the file is never written."""
    src = open(RIG_TS, encoding="utf-8").read()
    m = re.search(r"export const RIG\s*=\s*\{(.*?)\n\}\s*as const;", src, re.S)
    if not m:
        die("rig-points.ts no longer declares RIG the way this reader expects")
    rig: dict = {}
    for slot, body in re.findall(r"(\w+):\s*\{([^}]*)\}", m.group(1)):
        d: dict = {}
        for k, v in re.findall(r"(\w+):\s*(\[[^\]]*\]|\d+)", body):
            d[k] = json.loads(v)
        rig[slot] = d
    for slot in ("head", "torso", "arm", "leg"):
        if slot not in rig:
            die(f"rig-points.ts no longer declares a {slot}")
    m2 = re.search(r"drawOrder:\s*\[([^\]]*)\]", src)
    if not m2:
        die("rig-points.ts no longer declares JOIN.drawOrder")
    order = [s.strip().strip('"') for s in m2.group(1).split(",") if s.strip()]
    return {"rig": rig, "drawOrder": order}


# ── parts: the shipped deriver's own base and mask, at explicit paths ─────

def derive_pair(install, name: str, src: str, out_dir: str) -> tuple[str, str]:
    """scripts/bots-paint-masks.py's own process(), which takes explicit
    paths, exactly as bots-sd-install.py calls it. Nothing about the accent
    classification, the clay neutralisation or the RGBA mask format is
    re-implemented here."""
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.join(out_dir, name + ".png")
    mask = os.path.join(out_dir, name + ".mask.png")
    if not (os.path.exists(base) and os.path.exists(mask)):
        # install.derive_pair, not process() by hand: load_deriver pins DRY
        # True on purpose, and process() returns its numbers and writes
        # nothing while DRY is on. derive_pair is the shipped code that turns
        # it off around the one call and back on afterwards.
        install.derive_pair(name, src, base, mask)
    return base, mask


def read_pair(base: str, mask: str) -> tuple[np.ndarray, np.ndarray]:
    b = np.asarray(Image.open(base).convert("RGBA"))
    m = np.asarray(Image.open(mask).convert("RGBA"))[..., 3]
    return b, m


# ── the look-alike gate, run over exactly the drawings a row shows ────────

def row_overlap(files: dict[str, list[str]], table: str | None) -> dict:
    """Stage a catalogue holding exactly these drawings and ask the SHIPPED
    look-alike gate about it. `files` is slot -> list of PNG paths."""
    tmp = tempfile.mkdtemp(prefix="bots-lookalike-row-")
    try:
        for slot, paths in files.items():
            d = os.path.join(tmp, slot)
            os.makedirs(d, exist_ok=True)
            for p in paths:
                shutil.copy2(p, os.path.join(d, os.path.basename(p)))
        cmd = ["npx", "tsx", GATE, tmp, "--json"]
        if table:
            cmd += ["--shape-table", table]
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                           shell=(os.name == "nt"))
        txt = r.stdout.strip()
        i = txt.find("{")
        if i < 0:
            die(f"the look-alike gate printed no JSON:\n{(r.stdout + r.stderr)[:800]}")
        return json.loads(txt[i:])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def overlap_line(res: dict, slot: str) -> str:
    for r in res.get("results", []):
        if r["slot"] != slot or not r.get("closest"):
            continue
        c = r["closest"]
        return (f"closest pair {c['a']} / {c['b']} overlap {c['overlap']:.3f} "
                f"({(1 - c['overlap']) * 100:.1f} pixels in 100 apart), typical pair "
                f"{r['median']:.3f}, {r['distinct']} shape{'' if r['distinct'] == 1 else 's'} "
                f"of {r['n']}")
    return "not measurable (needs two shapes)"


# ── drawing ──────────────────────────────────────────────────────────────

def font(size: int):
    for n in ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(n, size)
        except Exception:
            continue
    return ImageFont.load_default()


def on_board(rgba: np.ndarray, board=BOARD) -> Image.Image:
    a = rgba[..., 3:4].astype(np.float64) / 255.0
    rgb = rgba[..., :3].astype(np.float64) * a + np.asarray(board, np.float64) * (1 - a)
    return Image.fromarray(np.clip(rgb + 0.5, 0, 255).astype(np.uint8), "RGB")


def crop_ink(a: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(a[..., 3])
    if not len(ys):
        die("a part has no ink")
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def fit_h(a: np.ndarray, h: int) -> Image.Image:
    im = Image.fromarray(a, "RGBA")
    w = max(1, int(round(im.width * h / im.height)))
    return im.resize((w, h), Image.LANCZOS)


def compose_robot(con: dict, parts: dict) -> np.ndarray:
    """One whole bot on one canvas, every part on the contract's own pivots.
    `parts` is socket -> painted RGBA on that slot's contract canvas."""
    rig = con["rig"]
    t = rig["torso"]
    place: dict = {}
    hx = t["neck"][0] - rig["head"]["neck"][0]
    hy = t["neck"][1] - rig["head"]["neck"][1]
    place["head"] = (False, hx, hy)
    place["torso"] = (False, 0, 0)
    aw, ah = rig["arm"]["w"], rig["arm"]["h"]
    place["armR"] = (False, t["shoulderR"][0] - rig["arm"]["shoulder"][0],
                     t["shoulderR"][1] - rig["arm"]["shoulder"][1])
    place["armL"] = (True, t["shoulderL"][0] - (aw - 1 - rig["arm"]["shoulder"][0]),
                     t["shoulderL"][1] - rig["arm"]["shoulder"][1])
    lw = rig["leg"]["w"]
    place["legR"] = (False, t["hipR"][0] - rig["leg"]["hip"][0],
                     t["hipR"][1] - rig["leg"]["hip"][1])
    place["legL"] = (True, t["hipL"][0] - (lw - 1 - rig["leg"]["hip"][0]),
                     t["hipL"][1] - rig["leg"]["hip"][1])

    xs, ys, xe, ye = [], [], [], []
    for sock, img in parts.items():
        _, x, y = place[sock]
        xs.append(x); ys.append(y)
        xe.append(x + img.shape[1]); ye.append(y + img.shape[0])
    x0, y0, x1, y1 = min(xs), min(ys), max(xe), max(ye)
    canvas = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    for sock in con["drawOrder"]:
        if sock not in parts:
            continue
        mirror, x, y = place[sock]
        im = Image.fromarray(parts[sock], "RGBA")
        if mirror:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        canvas.alpha_composite(im, (x - x0, y - y0))
    return crop_ink(np.asarray(canvas))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(PREVIEW, "DECIDE-SHAPES.png"))
    ap.add_argument("--ring", type=int, default=300, help="ring-size bot height in px")
    ap.add_argument("--small", type=int, default=120)
    a = ap.parse_args()

    install = load(os.path.join(HERE, "bots-sd-install.py"), "bots_sd_install")
    paints = install.read_paints()
    pnames = list(paints)
    con = rig_contract()

    table = json.load(open(TABLE, encoding="utf-8"))
    meta = {r["id"]: r for r in table["shapes"]}

    winners: dict = {}
    for s in SUMMARIES:
        if not os.path.exists(s):
            die(f"no judge summary at {s}. Run scripts/sd/bots-sd-shape-judge.py first.")
        for p in json.load(open(s, encoding="utf-8"))["pools"]:
            winners[p["pool"]] = p
    alive = {k: v for k, v in winners.items() if v["survivors"] and v["winnerNormalised"]}
    dead = sorted(k for k, v in winners.items() if not v["survivors"])

    # THE PART AS IT WOULD SHIP: the judge already wrote the importer's own
    # normalisation of each winner, and the deriver turns that into the pair
    # the rig draws. Both are the shipped code, called by name.
    pair: dict = {}
    for pool, rec in sorted(alive.items()):
        src = rec["winnerNormalised"]
        if not os.path.exists(src):
            die(f"{pool}: the judge's normalised winner {src} is not on disk")
        pair[pool] = derive_pair(install, pool, src, PAIRS)

    # the live parts, read and never written
    def live_pair(slot: str, tier: int, design: int) -> tuple[str, str]:
        b = os.path.join(LIVE, slot, f"t{tier}-{design}.png")
        m = os.path.join(LIVE, slot, f"t{tier}-{design}.mask.png")
        if not (os.path.exists(b) and os.path.exists(m)):
            die(f"the live catalogue has no {slot} t{tier}-{design}")
        return b, m

    def painted(pr: tuple[str, str], paint: str) -> np.ndarray:
        b, m = read_pair(*pr)
        return install.tint(b, m, paints[paint])

    head_looks = [r["id"] for r in table["shapes"] if r["slot"] == "head" and r["id"] in pair]
    leg_shapes = [r["id"] for r in table["shapes"] if r["slot"] == "leg" and r["id"] in pair]
    if not head_looks:
        die("no head look survived the judge; there is nothing to draw")

    # ROW ONE, one paint, the sculpt on its own. The two live head looks and
    # the live boot stand in it too: the row is the whole table, and a person
    # comparing a new shape to today should not have to scroll to do it.
    ONE = "cream"
    row1 = [(k, painted(pair[k], ONE), meta[k].get("name", k), meta[k].get("mouth"))
            for k in head_looks]
    row1 += [("live-round-grille", painted(live_pair("head", 3, 1), ONE), "Round grille", "live"),
             ("live-box-grille", painted(live_pair("head", 4, 1), ONE), "Box grille", "live")]
    row1leg = [(k, painted(pair[k], ONE), meta[k].get("name", k), None) for k in leg_shapes]
    row1leg += [("live-boot", painted(live_pair("leg", 1, 1), ONE), "Boot", "live")]

    # the eighteen robots. One head look each; the legs rotate through the leg
    # shapes; every part a different found colour.
    live_torso = [live_pair("torso", t, d) for t in (1, 2, 3, 4) for d in (1, 2)]
    live_arm = [live_pair("arm", t, d) for t in (1, 2, 3, 4) for d in (1, 2)]
    live_head = [live_pair("head", t, d) for t in (1, 2, 3, 4) for d in (1, 2)]
    live_leg = [live_pair("leg", t, d) for t in (1, 2, 3, 4) for d in (1, 2)]

    N = 18
    order = [head_looks[i % len(head_looks)] for i in range(N)]
    legs_order = [leg_shapes[i % len(leg_shapes)] for i in range(N)] if leg_shapes else []

    def bot(i: int, head_pr, leg_pr, torso_pr, arm_pr) -> np.ndarray:
        hp = pnames[i % 8]
        tp = pnames[(i + 3) % 8]
        apn = pnames[(i + 5) % 8]
        lp = pnames[(i + 6) % 8]
        parts = {
            "head": painted(head_pr, hp),
            "torso": painted(torso_pr, tp),
            "armL": painted(arm_pr, apn), "armR": painted(arm_pr, apn),
            "legL": painted(leg_pr, lp), "legR": painted(leg_pr, lp),
        }
        return compose_robot(con, parts)

    new_bots = []
    for i in range(N):
        hk = order[i]
        lk = legs_order[i] if legs_order else None
        leg_pr = pair[lk] if lk else live_leg[i % 8]
        new_bots.append((hk, lk, bot(i, pair[hk], leg_pr, live_torso[i % 8], live_arm[i % 8])))

    old_bots = []
    for i in range(N):
        old_bots.append(bot(i, live_head[i % 8], live_leg[(i + 1) % 8], live_torso[i % 8],
                            live_arm[i % 8]))

    # ── the overlap numbers, from the shipped gate ────────────────────────
    def head_files(keys: list[str]) -> list[str]:
        return [pair[k][0] for k in keys]

    # ROW ONE is measured over exactly what row one draws, the two live head
    # looks and the live boot included, so the number under the row answers
    # the question the row asks: can a player tell these apart from today's.
    ov_row1 = row_overlap({"head": head_files(head_looks)
                           + [live_pair("head", 3, 1)[0], live_pair("head", 4, 1)[0]]}, TABLE)
    ov_row1leg = row_overlap({"leg": [pair[k][0] for k in leg_shapes]
                              + [live_pair("leg", 1, 1)[0]]}, TABLE) if leg_shapes else {}
    ov_new = row_overlap({"head": head_files(sorted(set(order)))}, TABLE)
    ov_old = row_overlap({"head": [p[0] for p in live_head], "leg": [p[0] for p in live_leg]}, None)

    # ── layout ───────────────────────────────────────────────────────────
    f_title = font(30)
    f_h = font(19)
    f_lab = font(14)
    f_small = font(12)

    S = a.small
    R = a.ring
    PAD = 14
    per_row_small = 10
    cols_ring = 6

    def small_strip_size(n: int, per: int, h: int) -> tuple[int, int]:
        rows = (n + per - 1) // per
        return per * (h + PAD) + PAD, rows * (h + 26 + PAD) + PAD

    W = max(1500, cols_ring * (int(R * 0.75) + PAD) + 2 * PAD)
    blocks = []

    def head_block(title: str, sub: str) -> int:
        return 8 + 34 + 22

    y = 0
    y += 96                                   # title
    h1w, h1h = small_strip_size(len(row1) + len(row1leg), per_row_small, S)
    y += 56 + h1h
    ring_rows = (N + cols_ring - 1) // cols_ring
    y += 56 + ring_rows * (R + 30 + PAD)
    _, srh = small_strip_size(N, per_row_small, S)
    y += 40 + srh
    _, cmph = small_strip_size(N * 2, per_row_small, S)
    y += 56 + cmph + 40
    H = y + 180        # slack for the notes and the divider between the strips

    sheet = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(sheet)

    y = 22
    d.text((PAD, y), "BATTLE BOTS: THE SHAPE TABLE, FOR A DECISION", font=f_title, fill=DARK)
    y += 40
    d.text((PAD, y), f"{len(head_looks)} head looks and {len(leg_shapes)} leg shapes survived the "
                     f"judge with no rule relaxed. Nothing here is installed in the live catalogue; "
                     f"shipping is Mike's call.", font=f_lab, fill=(70, 72, 80))
    y += 20
    if dead:
        d.text((PAD, y), "did not work: " + ", ".join(dead), font=f_lab, fill=(150, 60, 50))
    y += 34

    def strip(items, y0, per, h, note=None):
        d.text((PAD, y0), note or "", font=f_small, fill=(90, 92, 100))
        y0 += 18 if note else 0
        for i, (key, img, name, mouth) in enumerate(items):
            cx = PAD + (i % per) * (h + PAD)
            cy = y0 + (i // per) * (h + 26 + PAD)
            im = fit_h(crop_ink(img), h)
            tile = on_board(np.asarray(im), PAPER)
            sheet.paste(tile, (cx + (h - tile.width) // 2, cy))
            lab = name if not mouth else f"{name} {mouth}"
            d.text((cx, cy + h + 3), lab[:18], font=f_lab, fill=DARK)
        rows = (len(items) + per - 1) // per
        return y0 + rows * (h + 26 + PAD)

    d.text((PAD, y), "ROW ONE: every head look and every leg shape, one paint, the sculpt on its own",
           font=f_h, fill=DARK)
    y += 24
    y = strip(row1 + row1leg, y, per_row_small, S,
              "heads: " + overlap_line(ov_row1, "head") +
              ("   |   legs: " + overlap_line(ov_row1leg, "leg") if leg_shapes else ""))
    y += 14

    d.text((PAD, y), f"{N} ROBOTS, ring size, one head look each, legs rotating through the shapes, "
                     f"every part a different found colour", font=f_h, fill=DARK)
    y += 24
    if len(head_looks) < N:
        d.text((PAD, y), f"only {len(head_looks)} head looks survived the judge, so the last "
                         f"{N - len(head_looks)} repeat the first {N - len(head_looks)} looks on "
                         f"different legs. Nothing is shown twice with the same legs.",
               font=f_small, fill=(150, 60, 50))
        y += 18
    d.text((PAD, y), "heads shown: " + overlap_line(ov_new, "head"), font=f_small, fill=(90, 92, 100))
    y += 18
    for i, (hk, lk, img) in enumerate(new_bots):
        cx = PAD + (i % cols_ring) * (int(R * 0.75) + PAD)
        cy = y + (i // cols_ring) * (R + 30 + PAD)
        im = fit_h(img, R)
        tile = on_board(np.asarray(im), PAPER)
        sheet.paste(tile, (cx + (int(R * 0.75) - tile.width) // 2, cy))
        nm = meta[hk].get("name", hk)
        mo = meta[hk].get("mouth") or ""
        ln = meta[lk].get("name", lk) if lk else "boot"
        d.text((cx, cy + R + 4), f"{nm} {mo}".strip()[:20], font=f_lab, fill=DARK)
        d.text((cx, cy + R + 18), f"legs {ln}", font=f_small, fill=(110, 112, 120))
    y += ring_rows * (R + 30 + PAD) + 8

    d.text((PAD, y), "the same eighteen at 120 px, the size they are on a card", font=f_h, fill=DARK)
    y += 24
    y = strip([(hk, img, meta[hk].get("name", hk), meta[hk].get("mouth"))
               for hk, lk, img in new_bots], y, per_row_small, S)
    y += 14

    d.line([(PAD, y), (W - PAD, y)], fill=(190, 184, 168), width=2)
    y += 12
    d.text((PAD, y), "TODAY against THE TABLE, the same size, the same paints, the same torso and arms",
           font=f_h, fill=DARK)
    y += 24
    d.text((PAD, y), "TODAY, eighteen the live catalogue builds: " + overlap_line(ov_old, "head")
           + "   |   legs: " + overlap_line(ov_old, "leg"), font=f_small, fill=(90, 92, 100))
    y += 20
    y = strip([(f"live{i}", img, "today", None) for i, img in enumerate(old_bots)], y,
              per_row_small, S)
    y += 6
    d.text((PAD, y), "THE TABLE, the same eighteen as above: " + overlap_line(ov_new, "head"),
           font=f_small, fill=(90, 92, 100))
    y += 20
    y = strip([(hk, img, meta[hk].get("name", hk), meta[hk].get("mouth"))
               for hk, lk, img in new_bots], y, per_row_small, S)

    # the height above is a budget with slack in it, so trim the paper that
    # nothing was drawn on rather than shipping a sheet with a blank foot
    arr = np.asarray(sheet)
    drawn = np.nonzero((arr != np.asarray(PAPER, np.uint8)).any(axis=(1, 2)))[0]
    if len(drawn):
        sheet = sheet.crop((0, 0, sheet.width, min(sheet.height, int(drawn[-1]) + 24)))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    sheet.save(a.out)
    print(f"wrote {a.out} ({sheet.width}x{sheet.height})")
    print(f"head looks drawn: {len(head_looks)}  leg shapes drawn: {len(leg_shapes)}")
    if dead:
        print("pools with no survivor, left off the sheet: " + ", ".join(dead))
    print("row one heads: " + overlap_line(ov_row1, "head"))
    if leg_shapes:
        print("row one legs:  " + overlap_line(ov_row1leg, "leg"))
    print("live heads:    " + overlap_line(ov_old, "head"))
    print("live legs:     " + overlap_line(ov_old, "leg"))
    with open(os.path.join(PREVIEW, "DECIDE-SHAPES.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"headLooks": head_looks, "legShapes": leg_shapes, "noSurvivor": dead,
                   "rowOneHeads": ov_row1, "rowOneLegs": ov_row1leg,
                   "newHeads": ov_new, "live": ov_old}, fh, indent=1)
        fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
