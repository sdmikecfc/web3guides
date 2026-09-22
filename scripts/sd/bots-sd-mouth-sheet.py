"""BATTLE BOTS, LANE M: THE FIVE AUTHORED MOUTHS ON THE EIGHT HEAD SHAPES.

    python scripts/sd/bots-sd-mouth-sheet.py

    Writes .bots-preview/sd-shapes2/MOUTHS.png and MOUTHS.json.
    Costs no GPU: every head here is a wave one render that already exists.

WHAT THIS ANSWERS. Wave one asked the renderer for five mouths and got one
back: smile, grille and zigzag all returned the same slatted mouth. So the
mouth moved into scripts/bots-mouths.json and scripts/bots-import-parts.py
draws it. This sheet is the proof that the table works on every head shape,
and it is the thing a person reads before any of it is kept.

HOW A CELL IS MADE, and every step is shipped code called by name:

  1. the wave one CUT of that shape's winning render, off disk;
  2. the importer's own neutralise and the judge's own exposure line, so the
     face is measured in the space find_eyes and find_grille are calibrated in;
  3. the importer's own face_geometry, so the mouth is placed from the same
     eyes draw_face will draw;
  4. the importer's own author_mouth, which heals the mouth the render drew
     and cuts the table's shape into the clay;
  5. that written back into the cut as a RAW candidate, scaled so the judge's
     OWN normalisation of it lands back on the importer's levelled head (a four
     line fixed point; the residual is reported per cell and runs under 2.5
     levels of 255);
  6. scripts/sd/rank-part.py's own score_image, which normalises it through
     the importer's find_grille, light_grille and draw_face and then judges it.
     MOUTH MISPLACED is its rule, read off its verdict, with no bar moved and
     not one line of it re-implemented here;
  7. scripts/bots-paint-masks.py's own process() for the base and paint mask,
     and bots-sd-install's own tint and the sheet's own compose_robot for the
     card-size bot, so the small view is the rig's own arithmetic.

THE PICTURE AND THE VERDICT COME FROM TWO PLACES, on purpose, and shipped_head
below says why in full: judging a FILE makes the judge measure the exposure
again, which on two of these eight heads re-rolls a knife edge eye finder. The
verdict is the judge's, on the authored candidate. The picture is built the way
the shipped order builds it, which finds the eyes once.

Nothing under public/bots-art is written. The whole output lives under
.bots-preview/sd-shapes2.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
ROOT = os.path.dirname(SCRIPTS)
sys.path.insert(0, HERE)

WAVE1 = os.path.join(ROOT, ".bots-preview", "sd-shapes")
OUT = os.path.join(ROOT, ".bots-preview", "sd-shapes2")
PICK = os.path.join(WAVE1, "pick.json")
TABLE = os.path.join(WAVE1, "shape-table.json")
RENDERS = os.path.join(WAVE1, "renders")
LIVE = os.path.join(ROOT, "public", "bots-art", "parts")

BOARD = (201, 187, 155)
DARK = (32, 34, 40)
GREY = (110, 112, 120)
RED = (168, 58, 46)
PAPER = (243, 238, 226)
HEAD_H = 600          # the big view: one head, 600 px tall
CARD_H = 120          # the small view: a whole bot at the size it is on a card
PAD = 28


def die(msg: str) -> None:
    raise SystemExit("bots-sd-mouth-sheet REFUSES: " + msg)


def load(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def raw_cut(look: str, candidate: str) -> str:
    """The RAW cut behind a judged winner. pick.json names the NORMALISED file
    the judge wrote; the cut it was normalised from carries the same basename
    under renders/<stage>/<look>/cut/."""
    base = os.path.basename(candidate)
    for stage in sorted(os.listdir(RENDERS)):
        p = os.path.join(RENDERS, stage, look, "cut", base)
        if os.path.exists(p):
            return p
    die(f"no raw cut for {look} / {base} under {RENDERS}")


def author_into_cut(CUT, RP, cut_png: str, mouth_id: str, out_png: str) -> dict:
    """One authored candidate, written as a RAW cut.

    The mouth is drawn in the LEVELLED space the importer's thresholds are
    calibrated in, and the file is then written so that the JUDGE'S OWN
    normalisation of it lands back on that same levelled head. See the block
    comment below for why that is not optional."""
    im = Image.open(cut_png)
    info = dict(im.info)
    a = np.asarray(im.convert("RGBA")).astype(np.uint8)
    ink = CUT.largest_component(a[..., 3])
    if ink is None:
        die(f"{cut_png} has no ink")
    raw = a[..., :3].astype(np.float32)
    lev, gain, level = CUT.neutralise(raw, ink)
    target, _info = RP.shipped_level_target("head")
    egain = float(target) / max(float(level), 1e-3)
    lev = RP.EXPOSE(lev, level, target)
    xs = np.where(ink.sum(0) > 0)[0]
    M = {"cx": float((xs[0] + xs[-1]) / 2)}
    core = ink & (np.arange(ink.shape[0])[:, None] <= int(RP.RIG["head"]["neck"][1]))
    geom = CUT.face_geometry(lev, core, M)
    if geom is None:
        return {"ok": False, "why": "no symmetric pair of eyes on this cut"}
    lev2, mask, rep = CUT.author_mouth(lev, core, M, geom, mouth_id)
    if mask is None:
        return {"ok": False, "why": rep.get("why"), **rep}
    # THE CANDIDATE IS WRITTEN SO THE JUDGE RE-NORMALISES IT BACK TO THIS HEAD,
    # and that is the only way the judge can be handed it honestly.
    #
    # process() measures the cast gain and the exposure level ONCE, off the raw
    # bot, and authors the mouth inside that fixed space. The judge cannot: it
    # measures both again on whatever candidate it is given, and the heal turns
    # thousands of dark mouth pixels into clay, which moves the clay's own mean
    # and so moves the level. Writing the mouth back into the render's original
    # exposure and letting the judge re-level cost the cone head its FACE on all
    # five mouths: find_eyes pairs its eyes at exactly one threshold in its
    # sweep, and a two percent shift in level is enough to lose them. Nothing
    # about that is the mouth's doing, and it is not something the judge should
    # be asked to forgive.
    #
    # So the whole cut is scaled, per channel, by the factor that makes the
    # judge's own neutralise and exposure land back on this levelled head. The
    # factor depends on the image it is applied to, so it is a fixed point:
    # six passes, and the residual is then checked by running the judge's own
    # two steps on what was written. It comes back under 2.5 levels of 255 on
    # all forty, which is the uint8 rounding and nothing else.
    want = np.asarray(gain, np.float64) * float(egain)
    moved = np.abs(lev2 - lev).max(2) > 0.5
    base = a[..., :3].astype(np.float64)
    base[moved] = (lev2.astype(np.float64) / want[None, None, :])[moved]
    c = np.ones(3)
    for _ in range(6):
        trial = np.clip(base * c[None, None, :], 0, 255)
        _n, g2, l2 = CUT.neutralise(trial.astype(np.float32), ink)
        f = c * (np.asarray(g2, np.float64) * (float(target) / max(float(l2), 1e-3)))
        c = c * (want / np.maximum(f, 1e-9))
    out = a.copy()
    out[..., :3] = np.clip(base * c[None, None, :] + 0.5, 0, 255).astype(np.uint8)
    chk, _g3, l3 = CUT.neutralise(out[..., :3].astype(np.float32), ink)
    chk = RP.EXPOSE(chk, l3, target)
    resid = float(np.abs(chk - lev2)[ink].max())
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    # THE MATTE'S OWN NUMBERS RIDE IN THE PNG'S TEXT CHUNKS and the judge reads
    # them off the file, so they are carried across unchanged.
    from PIL import PngImagePlugin
    meta = PngImagePlugin.PngInfo()
    for k, v in info.items():
        if isinstance(v, str):
            meta.add_text(k, v)
    Image.fromarray(out, "RGBA").save(out_png, pnginfo=meta)
    return {"ok": True, "movedPx": int(moved.sum()), "roundTripResid": round(resid, 2), **rep}


def shipped_head(CUT, RP, cut_png: str, mouth_id: str, tier: int):
    """THE HEAD AS IT WOULD SHIP, and the picture on the sheet.

    WHY THIS IS NOT THE JUDGED FILE. The verdict below comes from handing the
    judge an authored candidate, which makes it measure the cast gain and the
    exposure again. It has to: it is judging a file. But find_eyes is a
    threshold sweep, and on two of the eight shapes the real pair only wins at
    ONE threshold in it. Measured: with the authored candidate reproducing the
    importer's own levelled head to within 1.4 levels out of 255, the bell head
    still swapped its eyes for two lit side nubs of radius 10.5 px and the bear
    lost its face outright. Nothing there is the mouth's doing, and a sheet that
    showed it would be asking a person to judge five mouths through four broken
    faces.

    The shipped pipeline never re-rolls that dice: it finds the eyes once and
    authors the mouth inside the exposure it already fixed. So the picture is
    made the same way, out of the same shipped calls in the same order: the
    judge's own normalise on the ORIGINAL cut (which every one of the eight
    passed in wave one, eyes drawn), then the importer's own author_mouth,
    find_grille and light_grille on top of it. The eyes are drawn once and never
    looked for again."""
    a_raw = np.asarray(Image.open(cut_png).convert("RGBA")).astype(np.uint8)
    norm, rep, masks = RP.normalise_as_shipped(a_raw, "head", tier)
    if not rep.get("faceFound"):
        return None, {"ok": False, "why": "the original cut has no face"}
    rgb = norm[..., :3].astype(np.float32)
    alpha = norm[..., 3]
    ink = CUT.largest_component(alpha)
    core = ink & (np.arange(ink.shape[0])[:, None] <= int(RP.RIG["head"]["neck"][1]))
    xs = np.where(ink.sum(0) > 0)[0]
    M = {"cx": float((xs[0] + xs[-1]) / 2)}
    face = rep["face"]
    geom = {"centres": [(float(e[0]), float(e[1])) for e in face["eyes"]], "r": float(face["r"])}
    rgb2, mask, mrep = CUT.author_mouth(rgb, core, M, geom, mouth_id, grille=masks.get("grille"))
    if mask is None:
        return None, {"ok": False, **mrep}
    _h, _s, _v = CUT.hsv_full(rgb2)
    g = CUT.find_grille(core, _v, M)
    rgb2, g, _grep = CUT.light_grille(rgb2, core, g)
    mrep["foundShare"] = round(float((g & mask).sum()) / max(float(mask.sum()), 1.0), 4)
    out = np.dstack([np.clip(rgb2 + 0.5, 0, 255).astype(np.uint8), alpha])
    return out, {"ok": True, **mrep}


def crop_ink(a: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(a[..., 3])
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(OUT, "MOUTHS.png"))
    ap.add_argument("--paint", default=None, help="one paint name; the first in tokens.ts by default")
    args = ap.parse_args()

    CUT = load(os.path.join(SCRIPTS, "bots-import-parts.py"), "_bb_cut_mouth")
    RP = load(os.path.join(HERE, "rank-part.py"), "rank_part")
    SHEET = load(os.path.join(HERE, "bots-sd-shape-sheet.py"), "bots_sd_shape_sheet")
    install = load(os.path.join(HERE, "bots-sd-install.py"), "bots_sd_install")

    T = CUT.load_mouths()
    mouths = T["order"]
    plan = [p for p in json.load(open(PICK, encoding="utf-8"))["plan"] if p["slot"] == "head"]
    if len(plan) != 8:
        die(f"pick.json names {len(plan)} head shapes, this sheet wants the eight")

    paints = install.read_paints()
    paint = args.paint or list(paints)[0]
    con = SHEET.rig_contract()
    os.makedirs(OUT, exist_ok=True)
    AUTH = os.path.join(OUT, "authored")
    NORM = os.path.join(OUT, "normalised")
    # THE INSTALL TARGET FOR THIS LANE. public/bots-art/parts is the live
    # catalogue and nothing here goes near it. Its own folder rather than
    # parts/head, because a head look and a MOUTH on a head look share their
    # names (head-bear-smile is both a wave one ruler and this lane's bear with
    # a smile) and another lane is installing shape rulers into this same tree.
    PAIRS = os.path.join(OUT, "parts", "head-mouths")

    def live_pair(slot, tier, design):
        b = os.path.join(LIVE, slot, f"t{tier}-{design}.png")
        m = os.path.join(LIVE, slot, f"t{tier}-{design}.mask.png")
        if not (os.path.exists(b) and os.path.exists(m)):
            die(f"the live catalogue has no {slot} t{tier}-{design}")
        return b, m

    def painted(pr, p):
        b, m = SHEET.read_pair(*pr)
        return install.tint(b, m, paints[p])

    body = {"torso": painted(live_pair("torso", 1, 1), paint),
            "arm": painted(live_pair("arm", 1, 1), paint),
            "leg": painted(live_pair("leg", 1, 1), paint)}

    rows = []
    for p in plan:
        cut = raw_cut(p["look"], p["candidate"])
        cells = []
        for mid in mouths:
            name = f"head-{p['shape']}-{mid}"
            auth = os.path.join(AUTH, name + ".png")
            rep = author_into_cut(CUT, RP, cut, mid, auth)
            cell = {"shape": p["shape"], "look": p["look"], "mouth": mid, "author": rep}
            if rep["ok"]:
                # THE VERDICT: the judge's own rules on the authored candidate.
                sc = RP.score_image(auth, "head", p["tier"], p["design"],
                                    normalised_out=os.path.join(NORM, name + ".png"),
                                    shape=p["look"], table=TABLE)
                fails = sc.get("fail", []) or []
                cell["verdict"] = sc.get("verdict")
                cell["composite"] = round(float(sc.get("composite", 0.0)), 2)
                cell["fail"] = fails
                cell["mouthMisplaced"] = any("MOUTH MISPLACED" in f for f in fails)
                cell["reJudgedEyes"] = any(("NO FACE FOUND" in f or "EYE SIZE" in f) for f in fails)
                # THE PICTURE: the head as the shipped order would build it.
                ship, srep = shipped_head(CUT, RP, cut, mid, p["tier"])
                cell["shipped"] = srep
                if ship is not None:
                    os.makedirs(PAIRS, exist_ok=True)
                    shp = os.path.join(PAIRS, name + ".shipped.png")
                    Image.fromarray(ship, "RGBA").save(shp)
                    b, m = os.path.join(PAIRS, name + ".png"), os.path.join(PAIRS, name + ".mask.png")
                    install.derive_pair(name, shp, b, m)
                    cell["head"] = painted((b, m), paint)
            cells.append(cell)
        rows.append({"shape": p["shape"], "look": p["look"], "cells": cells})

    # ── the sheet ────────────────────────────────────────────────────────
    f_h = SHEET.font(34)
    f_t = SHEET.font(22)
    f_s = SHEET.font(18)
    f_c = SHEET.font(26)

    def big(cell):
        return SHEET.fit_h(crop_ink(cell["head"]), HEAD_H) if "head" in cell else None

    def card(cell):
        parts = {"head": cell["head"], "torso": body["torso"],
                 "armL": body["arm"], "armR": body["arm"],
                 "legL": body["leg"], "legR": body["leg"]}
        return SHEET.fit_h(SHEET.compose_robot(con, parts), CARD_H)

    shots = {}
    cw = 0
    for r in rows:
        for c in r["cells"]:
            if "head" in c:
                b = big(c)
                s = card(c)
                shots[(r["shape"], c["mouth"])] = (b, s)
                cw = max(cw, b.width, s.width)
    if not shots:
        die("no cell survived; nothing to draw")
    cell_w = cw + 30
    cell_h = HEAD_H + 14 + CARD_H + 46
    grid_w = cell_w * len(mouths)
    top = 200
    LABEL = 32               # the shape's own name, drawn above each row
    GAP = 34
    W = PAD * 2 + max(grid_w, 1400)
    H = top + len(rows) * (LABEL + cell_h + GAP) + 150
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    d.text((PAD, 24), "BATTLE BOTS: THE AUTHORED MOUTH, FIVE SHAPES ON EIGHT HEADS", font=f_h, fill=DARK)
    d.text((PAD, 68),
           "Every head is a wave one render. The mouth the render drew is healed back to clay and the "
           "table's mouth is cut in its place, then lit by the importer's own light_grille. No GPU was spent.",
           font=f_t, fill=GREY)
    d.text((PAD, 98),
           "Big view: the head 600 px tall. Small view under it: the whole bot at 120 px, the size it is on "
           "a card, on the live torso, arms and legs in one paint.", font=f_t, fill=GREY)
    y = 150
    for i, mid in enumerate(mouths):
        x = PAD + i * cell_w
        d.text((x, y), T["by"][mid]["name"], font=f_c, fill=DARK)
        d.text((x, y + 30), T["by"][mid]["reads"][:74], font=f_s, fill=GREY)
    y = top
    for r in rows:
        d.text((PAD, y - 2), r["shape"].upper(), font=f_c, fill=DARK)
        y += LABEL
        for i, c in enumerate(r["cells"]):
            x = PAD + i * cell_w
            key = (r["shape"], c["mouth"])
            if key not in shots:
                d.text((x, y + 40), "REFUSED", font=f_c, fill=RED)
                d.text((x, y + 74), (c["author"].get("why") or "")[:60], font=f_s, fill=RED)
                continue
            b, s = shots[key]
            img.paste(SHEET.on_board(np.asarray(b), BOARD), (x + (cw - b.width) // 2, y))
            img.paste(SHEET.on_board(np.asarray(s), BOARD),
                      (x + (cw - s.width) // 2, y + HEAD_H + 14))
            lab = f"{c['mouth']}  MOUTH MISPLACED: " + ("YES" if c.get("mouthMisplaced") else "no")
            lab += f"   judge {c.get('verdict', '?')} {c.get('composite', 0):.1f}"
            if c.get("reJudgedEyes"):
                lab += "  (its EYES, re-found on re-judging)"
            d.text((x, y + HEAD_H + 14 + CARD_H + 8), lab, font=f_s,
                   fill=RED if c.get("mouthMisplaced") else GREY)
        y += cell_h + GAP

    n = len(rows) * len(mouths)
    n_bad = sum(1 for r in rows for c in r["cells"] if c.get("mouthMisplaced"))
    n_ref = sum(1 for r in rows for c in r["cells"] if not c["author"]["ok"])
    n_eye = sum(1 for r in rows for c in r["cells"] if c.get("reJudgedEyes"))
    d.text((PAD, H - 96),
           f"MOUTH MISPLACED fired on {n_bad} of {n} heads. The importer refused {n_ref}. "
           f"No bar was moved and no rule was relaxed.",
           font=f_c, fill=RED if (n_bad or n_ref) else DARK)
    d.text((PAD, H - 62),
           f"{n_eye} of {n} were re-judged down on their EYES, not their mouth: judging a file makes the "
           f"judge measure the exposure again, and two of these eight heads pair their eyes at exactly one "
           f"threshold in find_eyes' sweep. The pictures are built the way the shipped order builds them, "
           f"which finds the eyes once.", font=f_s, fill=GREY)
    img.save(args.out)

    summary = {"paint": paint, "mouths": mouths,
               "shapes": [r["shape"] for r in rows],
               "mouthMisplaced": n_bad, "refused": n_ref,
               "cells": [{k: v for k, v in c.items() if k != "head"}
                         for r in rows for c in r["cells"]]}
    with open(os.path.join(OUT, "MOUTHS.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(summary, fh, indent=1)
        fh.write("\n")
    print(f"wrote {args.out} ({img.width}x{img.height})")
    print(f"MOUTH MISPLACED: {n_bad} of {len(rows) * len(mouths)}   refused by the importer: {n_ref}")
    for r in rows:
        line = "  ".join(f"{c['mouth']}:{c.get('verdict', 'REFUSED')[:4]}" for c in r["cells"])
        print(f"  {r['shape']:8s} {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
