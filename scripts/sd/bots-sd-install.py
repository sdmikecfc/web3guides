"""Battle Bots factory: INSTALL a judged, normalised candidate as the shipped pair.

    python scripts/sd/bots-sd-install.py --part head 3 1 <normalised.png> [--part ...]
        [--target DIR] [--ship] [--unjudged] [--gate] [--render] [--sandbox DIR]

WHAT THIS IS. The factory renders a part on a rented GPU, the matte cuts it to
the contract canvas, and the judge (scripts/sd/rank-part.py) normalises it the
way the shipped importer does and writes the normalised PNG beside its report.
What ships is not that PNG. What ships is a PAIR in
public/bots-art/parts/<slot>/t<tier>-<design>.png (the BASE: neutral clay with
the accents) and .mask.png (the PAINT MASK: RGBA white where the player's
colour lands). Until this file there was no path from the judge's output to
that pair: scripts/bots-paint-masks.py reads the live parts tree and writes
every mask at module scope, so it cannot be pointed at a scratch file.

THE ONE RULE. The mask and the base are made by THE SHIPPED DERIVER'S OWN
process(): scripts/bots-paint-masks.py is executed down to its "targets = []"
anchor (the last line before it starts walking the live tree and writing),
exactly the way rank-part.py loads it, and process(name, src, out, mask) is
called on the candidate with explicit paths. Nothing in the accent
classification, the opening, the closing, the rim, the clay neutralisation or
the RGBA mask format is re-implemented here. process() takes explicit paths,
so the deriver's functions do NOT need the parts-tree layout for derivation;
the tree layout is needed only by the GATE, and that is handled by staging a
shadow tree (below).

THE LIVE FOLDER. The target defaults to a scratch tree,
.bots-preview/sd-install/parts, and anything under public/bots-art is refused
unless --ship is passed. --ship is refused unless every candidate carries a
RANKED proof: either a sidecar <candidate>.judge.json with verdict RANKED (and
a matching sha256 when it carries one), or a row in the judge's own
report.json, one directory above the candidate's normalised/ folder, whose
normalisedFile is this candidate, whose verdict is RANKED, and whose slot,
tier and design are the ones being installed. A scratch install looks for the
same proof and refuses without it too, unless --unjudged is passed; --unjudged
is never accepted together with --ship.

THE GATE (--gate). scripts/bots-art-check.mts resolves its inputs as
join(process.cwd(), "public") and join(process.cwd(), "scripts",
"bots-art-accents.json") and imports the contract relative to its own file.
So it is run, unmodified, with cwd set to a SHADOW TREE:
<sandbox>/public/bots-art is a copy of the live public/bots-art (minus _raw)
with the installed pairs laid over it, and <sandbox>/scripts holds a copy of
the law. That is the same staging rank-part.py's gate mode uses. The proof
that the gate read the installed files and not the live ones is printed: the
sha256 of every installed file in the shadow tree against the live file of the
same name (they differ), and the count of shadow files that differ from live
(exactly two per installed part). scripts/sd/bots-sd-install-check.py adds the
negative control: blank one installed base in the shadow tree and the gate
fails NO INK on that file.

THE RENDER (--render). Each installed pair is drawn the way the rig draws it
(src/app/bots/_view/rig.ts: the base sprite, then the mask sprite tinted with
the paint at multiply, so a pixel becomes base * (1 - a + a * paint)) in all
eight paints read from src/app/bots/_ui/tokens.ts, and composed into one
sheet, with the per-accent count of solid pixels the mask touches.

Never commits, never deploys, never touches the live tree without --ship.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import time
import types

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
ROOT = os.path.dirname(SCRIPTS)

DERIVER_PY = os.path.join(SCRIPTS, "bots-paint-masks.py")
GATE_MTS = os.path.join(SCRIPTS, "bots-art-check.mts")
LAW_JSON = os.path.join(SCRIPTS, "bots-art-accents.json")
TOKENS_TS = os.path.join(ROOT, "src", "app", "bots", "_ui", "tokens.ts")

LIVE_ART = os.path.join(ROOT, "public", "bots-art")
LIVE_PARTS = os.path.join(LIVE_ART, "parts")

INSTALL_ROOT = os.path.join(ROOT, ".bots-preview", "sd-install")
DEFAULT_TARGET = os.path.join(INSTALL_ROOT, "parts")
DEFAULT_SANDBOX = os.path.join(INSTALL_ROOT, "gate-sandbox")
MANIFEST_DIR = os.path.join(INSTALL_ROOT, "manifest")
RENDER_DIR = os.path.join(INSTALL_ROOT, "render")

SLOTS = ("head", "torso", "arm", "leg", "weapon")
TIERS = (1, 2, 3, 4)
DESIGNS = (1, 2)


def _refuse(why: str):
    """A BREAKER, never a clamp: nothing is written past a refusal."""
    raise SystemExit("bots-sd-install REFUSES: " + why)


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _norm(path: str) -> str:
    return os.path.normcase(os.path.realpath(os.path.abspath(path)))


def _under(path: str, folder: str) -> bool:
    p, f = _norm(path), _norm(folder)
    return p == f or p.startswith(f.rstrip("\\/") + os.sep)


# ── 0. THE CORAL SOLE, authored: a leg-only step that runs BEFORE the judge ─
#
#     python scripts/sd/bots-sd-install.py --author-sole leg-t2-2 --cut-dir <cut> --out-dir <authored>
#
# WHY IT EXISTS (2026-09-05). The judge (rank-part.py) asks the importer's own
# pin_coral where the coral landed on a leg and rejects a sole band under 8
# percent of the leg or more than 1.3 percent of the coral outside it. The
# 1.3 is calibrated on the live legs, whose coral is a block the importer
# pinned with a dead-straight top edge (they read 0.0 to 0.34 percent, all of
# it anti-aliasing). A diffusion render does not draw a straight edge: even
# the cleanest production leg read 5.3 percent, a plate plus a rim, and the
# other 191 ran to 100. The contract says the coral is a FIXED accent, the
# same on every bot in the range, exactly as the eye lens, its catch light
# and the wind-up key are, and the importer draws those rather than trusting
# the model with them (draw_face, draw_key). This step does the same for the
# sole: it fills the contract's sole region, read off the v2 ruler's own coral
# class, with the authored coral as ONE block, on the cut, so the judge sees
# the coral that will ship. The judge still decides everything else, and it
# still rejects any coral the render put anywhere else on the leg (a rim, a
# panel, a drip), because nothing here removes a pixel outside the region.
# The render only has to keep the rest of the leg clean.
#
# What is written: <out-dir>/<same name>.png with the cut's own PNG metadata
# (the matte's rim numbers, which the judge reads off the file) and the .json
# beside it copied unchanged, plus <out-dir>/_author-sole.json saying what was
# filled. Nothing under public/ is read but the v2 ruler, and nothing there is
# written.

V2_RULERS = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders-v2", "target")
SOLE_CORAL = (0xB4, 0x6D, 0x52)   # the importer's CORAL (scripts/bots-import-parts.py), hue 16.5, sat 0.54
SOLE_GROW_PX = 2                  # the block grows over the ruler's own outline stroke so no grey seam is left
SOLE_SHADE = (0.80, 1.15)         # the render's own soft light, kept, clamped: one block, not a flat decal
SOLE_SIGMA = 6.0                  # px of smoothing on that light, so no panel line survives inside the block


def sole_region(tier: int, design: int) -> np.ndarray:
    """The contract's sole region on the leg canvas: the coral class of the v2
    ruler, read through the same classifier scripts/sd/bots-sd-controls.py
    builds the control maps with, so the block the judge measures is the
    block the model was conditioned on."""
    sys.path.insert(0, HERE)
    from bots_sd_contract import classify, read_contract, read_law  # noqa: E402
    from scipy import ndimage
    p = os.path.join(V2_RULERS, f"legs-t{tier}-{design}.png")
    if not os.path.exists(p):
        _refuse(f"no v2 leg ruler at {p}; run node scripts/bots-bake-parts.mjs --out v2")
    rgba = np.asarray(Image.open(p).convert("RGBA"))
    c = read_contract()
    cls = classify(rgba, read_law(), float(c["figure"]["metalSatMin"]))
    sole = cls["coral"] & (rgba[..., 3] > 127)
    if int(sole.sum()) < 200:
        _refuse(f"the v2 ruler {os.path.basename(p)} carries no coral sole ({int(sole.sum())} px); "
                "it predates MAT.coral in bots-bake-parts.mjs, re-run node scripts/bots-bake-parts.mjs --out v2")
    sole = ndimage.binary_closing(sole, iterations=2)
    sole = ndimage.binary_dilation(sole, iterations=SOLE_GROW_PX)
    return sole


def author_sole(cut_png: str, out_png: str, sole: np.ndarray) -> dict:
    """Fill the sole region of one cut with the authored coral, keeping the
    render's own smoothed light inside it, and write it with the cut's PNG
    metadata and its .json sidecar intact."""
    from scipy import ndimage
    sys.path.insert(0, HERE)
    import bots_sd_matte as MATTE  # noqa: E402
    im = Image.open(cut_png)
    raw_info = im.info.get(MATTE.PNG_KEY)
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    if a.shape[:2] != sole.shape:
        _refuse(f"{cut_png} is {a.shape[1]}x{a.shape[0]}, the leg ruler is {sole.shape[1]}x{sole.shape[0]}")
    ink = a[..., 3] > 127
    region = sole & ink
    if not region.any():
        _refuse(f"{cut_png}: the sole region holds no ink; this is not a leg cut on the contract canvas")
    lum = a[..., :3].mean(2)
    # the render's own light inside the region, smoothed with a normalised
    # blur so the region's edge borrows nothing from outside it
    w = region.astype(np.float32)
    sm = ndimage.gaussian_filter(lum * w, SOLE_SIGMA) / np.maximum(ndimage.gaussian_filter(w, SOLE_SIGMA), 1e-3)
    ref = float(np.median(sm[region]))
    k = np.clip(sm / max(ref, 1e-3), SOLE_SHADE[0], SOLE_SHADE[1])
    # the render's own warm paint in the region, before it is covered (for the record)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a[..., :3].max(2)
    sat = np.where(mx > 0, (mx - a[..., :3].min(2)) / np.maximum(mx, 1e-6), 0.0)
    warm_in = int(((r >= b) & (sat > 0.18) & region).sum())
    out = a.copy()
    for ch, v in enumerate(SOLE_CORAL):
        out[..., ch][region] = np.clip(v * k[region], 0, 255)
    rows = np.where(region.any(1))[0]
    img = Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), "RGBA")
    os.makedirs(os.path.dirname(out_png) or ".", exist_ok=True)
    from PIL import PngImagePlugin
    info = PngImagePlugin.PngInfo()
    if raw_info:
        info.add_text(MATTE.PNG_KEY, raw_info)
    img.save(out_png, pnginfo=info)
    side = os.path.splitext(cut_png)[0] + ".json"
    if os.path.exists(side):
        shutil.copy2(side, os.path.splitext(out_png)[0] + ".json")
    return {"file": os.path.basename(cut_png), "filledPx": int(region.sum()),
            "rows": [int(rows[0]), int(rows[-1])], "renderWarmPxInRegion": warm_in,
            "shadeRef": round(ref, 1), "metadataKept": bool(raw_info)}


def mode_author_sole(part: str, cut_dir: str, out_dir: str) -> int:
    m = re.fullmatch(r"leg-t([1-4])-([12])", part)
    if not m:
        _refuse(f"--author-sole takes a leg part key like leg-t2-2, not {part!r}: the sole is a leg accent")
    tier, design = int(m.group(1)), int(m.group(2))
    cut_dir, out_dir = os.path.abspath(cut_dir), os.path.abspath(out_dir)
    if _under(out_dir, os.path.join(ROOT, "public")):
        _refuse(f"--out-dir {out_dir} is inside public/; the authored cuts are judge input, never art")
    if _norm(out_dir) == _norm(cut_dir):
        _refuse("--out-dir is the cut folder itself; the cuts are the runner's and are never overwritten")
    files = sorted(f for f in os.listdir(cut_dir) if f.lower().endswith(".png") and ".mask." not in f.lower())
    if not files:
        _refuse(f"no cuts in {cut_dir}")
    sole = sole_region(tier, design)
    os.makedirs(out_dir, exist_ok=True)
    recs = [author_sole(os.path.join(cut_dir, f), os.path.join(out_dir, f), sole) for f in files]
    rec = {"part": part, "cutDir": cut_dir, "outDir": out_dir, "ruler": os.path.join(V2_RULERS, f"legs-t{tier}-{design}.png"),
           "coral": "#%02X%02X%02X" % SOLE_CORAL, "growPx": SOLE_GROW_PX, "shade": list(SOLE_SHADE),
           "sigma": SOLE_SIGMA, "regionPx": int(sole.sum()), "cuts": recs,
           "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    with open(os.path.join(out_dir, "_author-sole.json"), "w", encoding="utf-8") as f:
        json.dump(rec, f, indent=1)
    warm = [r["renderWarmPxInRegion"] for r in recs]
    print(f"author-sole {part}: {len(recs)} cuts, sole region {int(sole.sum())} px (rows {recs[0]['rows'][0]} to "
          f"{recs[0]['rows'][1]}), the render's own warm paint inside it ran {min(warm)} to {max(warm)} px; "
          f"-> {out_dir}")
    return 0


# ── 1. the shipped deriver, imported the way the judge imports it ─────────

def _load_py(path: str, name: str, cut_at: str | None = None) -> types.ModuleType:
    """Execute a shipped Python file as a module, truncated at an anchor when
    its top level does work. This is rank-part.py's loader, line for line in
    behaviour: bots-paint-masks.py walks the live parts tree and WRITES every
    mask at module scope, so the source is cut at "targets = []", the last line
    before the walk. Everything above it is definitions, process() included."""
    if not os.path.exists(path):
        _refuse(f"{path} is missing; there is nothing to import")
    src = open(path, encoding="utf-8").read()
    if cut_at is not None:
        i = src.find(cut_at)
        if i < 0:
            _refuse(f"{os.path.basename(path)} no longer contains the anchor {cut_at!r}; "
                    "this installer will not guess where the pure region ends and will not "
                    "carry its own copy of the deriver")
        src = src[:i]
    mod = types.ModuleType(name)
    mod.__file__ = path
    code = compile(src, path, "exec")
    # the deriver reads sys.argv at module scope ("--dry", a part name); hand it
    # an empty argv so this installer's own flags cannot leak into it
    saved = sys.argv
    sys.argv = [saved[0]]
    try:
        exec(code, mod.__dict__)
    finally:
        sys.argv = saved
    return mod


_MASKS: types.ModuleType | None = None
_CEILING_SLOTS: tuple[str, ...] | None = None
_CANVAS: dict[str, tuple[int, int]] | None = None


def load_canvas() -> dict[str, tuple[int, int]]:
    """The contract canvas per slot, through scripts/bots-import-parts.py's
    load_contract(), the shipped reader of rig-points.ts that the judge uses.
    (The deriver carries its own CANVAS table, but its regex holds a literal
    0x08 byte where a word boundary was meant, so that table is always empty
    and its registered-original branch is dead; measured 2026-09-05. Not fixed
    here: that file is law. Read the contract through the importer instead.)
    main() is guarded there, so the file imports whole."""
    global _CANVAS
    if _CANVAS is not None:
        return _CANVAS
    cut_py = os.path.join(SCRIPTS, "bots-import-parts.py")
    spec = importlib.util.spec_from_file_location("_bb_cut_install", cut_py)
    if spec is None or spec.loader is None:
        _refuse(f"cannot import {cut_py}")
    mod = importlib.util.module_from_spec(spec)
    saved = sys.argv
    sys.argv = [saved[0]]
    try:
        sys.modules["_bb_cut_install"] = mod
        spec.loader.exec_module(mod)
    finally:
        sys.argv = saved
    if not hasattr(mod, "RIG"):
        _refuse("bots-import-parts.py no longer provides RIG (load_contract)")
    canvas = {}
    for slot in SLOTS:
        d = mod.RIG.get(slot) or {}
        if "w" not in d or "h" not in d:
            _refuse(f"load_contract() has no canvas for {slot}")
        canvas[slot] = (int(d["w"]), int(d["h"]))
    _CANVAS = canvas
    return canvas


def load_deriver() -> types.ModuleType:
    """The SHIPPED deriver, with the same safety proof the judge demands before
    trusting the cut: process() must still have its DRY early return and must
    not write above it, and it must still provide the names this file calls."""
    global _MASKS, _CEILING_SLOTS
    if _MASKS is not None:
        return _MASKS
    m = _load_py(DERIVER_PY, "_bb_masks_install", cut_at="targets = []")
    src = open(DERIVER_PY, encoding="utf-8").read()
    body = src[src.find("def process("):src.find("targets = []")]
    if "if DRY:" not in body:
        _refuse("bots-paint-masks.py process() no longer has a DRY early return")
    if any(0 <= body.find(tok) < body.find("if DRY:") for tok in (".save(", "os.replace(")):
        _refuse("bots-paint-masks.py process() writes before its DRY return")
    for need in ("process", "accents_of", "accent_mask", "ACC", "LAW",
                 "OPAQUE", "RIM", "SHARE_MIN", "SHARE_MAX", "LEFT_MAX"):
        if not hasattr(m, need):
            _refuse(f"bots-paint-masks.py no longer provides {need}")
    # The deriver's own breaker names the slots its paint-share CEILING applies
    # to, below the anchor. Read it out of the shipped source by its own name;
    # never retyped, and refused if it moves.
    mm = re.search(r"^CEILING_SLOTS\s*=\s*\(([^)]*)\)", src, re.M)
    if not mm:
        _refuse("bots-paint-masks.py no longer declares CEILING_SLOTS; the installer will not guess the ceiling")
    _CEILING_SLOTS = tuple(re.findall(r'"(\w+)"', mm.group(1)))
    m.DRY = True
    _MASKS = m
    return m


def derive_pair(name: str, candidate: str, out_png: str, out_mask: str) -> tuple[float, int]:
    """Run the shipped deriver FOR REAL on one candidate into explicit paths.
    Returns (paint share, unmasked body) exactly as the deriver measures them."""
    m = load_deriver()
    m.DRY = False
    try:
        return m.process(name, candidate, out_png, out_mask)
    finally:
        m.DRY = True


def deriver_breaker(slot: str, share: float, left: int) -> list[str]:
    """The deriver's own refusal rules (paint share floor, the ceiling on the
    slots that carry an accent, the unmasked-body bar), applied to the numbers
    the deriver returned. Copies nothing but the comparison."""
    m = load_deriver()
    bad = []
    capped = slot in (_CEILING_SLOTS or ())
    if share < m.SHARE_MIN or (capped and share > m.SHARE_MAX):
        hi = f"{m.SHARE_MAX:.0%}" if capped else "no ceiling"
        bad.append(f"paintable share {share:.1%}, deriver says {m.SHARE_MIN:.0%} to {hi}")
    if left > m.LEFT_MAX:
        bad.append(f"{left} unmasked body pixels, deriver bar is {m.LEFT_MAX}")
    return bad


# ── 2. the RANKED proof ───────────────────────────────────────────────────

def find_proof(candidate: str, slot: str, tier: int, design: int) -> dict | None:
    """Where the judge said RANKED about THIS file, or None.

    1. sidecar: <candidate>.judge.json beside the file. verdict must be RANKED;
       sha256, slot, tier, design are checked when present.
    2. report: the judge writes <out>/normalised/<name>.png and <out>/report.json,
       so a candidate whose parent folder is named "normalised" is looked up in
       the report one level up, by normalisedFile basename, and the row must be
       RANKED for the same slot, tier and design.
    """
    cand = os.path.abspath(candidate)
    sha = _sha256(cand)
    side = cand + ".judge.json"
    if os.path.exists(side):
        try:
            j = json.load(open(side, encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            _refuse(f"sidecar {side} is not JSON: {e}")
        if j.get("verdict") != "RANKED":
            return None
        if j.get("sha256") and j["sha256"] != sha:
            _refuse(f"sidecar {side} carries sha256 {j['sha256'][:12]}... but the candidate is {sha[:12]}...; "
                    "the file changed after it was judged")
        for k, v in (("slot", slot), ("tier", tier), ("design", design)):
            if k in j and str(j[k]) != str(v):
                _refuse(f"sidecar {side} says {k}={j[k]}, install asked for {k}={v}")
        return {"source": "sidecar", "path": side, "verdict": "RANKED", "sha256": sha,
                "composite": j.get("composite"), "rankInPool": j.get("rankInPool")}
    parent = os.path.dirname(cand)
    if os.path.basename(parent) == "normalised":
        rep = os.path.join(os.path.dirname(parent), "report.json")
        if os.path.exists(rep):
            try:
                rows = json.load(open(rep, encoding="utf-8")).get("rows", [])
            except Exception as e:  # noqa: BLE001
                _refuse(f"{rep} is not JSON: {e}")
            base = os.path.basename(cand)
            for r in rows:
                nf = r.get("normalisedFile") or ""
                if os.path.basename(nf.replace("\\", "/")) != base:
                    continue
                if r.get("verdict") != "RANKED":
                    return None
                if r.get("slot") != slot or int(r.get("tier", 0)) != tier or int(r.get("design", 0)) != design:
                    _refuse(f"{rep} judged {base} as {r.get('slot')}-t{r.get('tier')}-{r.get('design')}, "
                            f"install asked for {slot}-t{tier}-{design}")
                return {"source": "report", "path": rep, "verdict": "RANKED", "sha256": sha,
                        "composite": r.get("composite"), "rankInPool": r.get("rankInPool"),
                        "judgedFile": r.get("file")}
    return None


# ── 3. install ────────────────────────────────────────────────────────────

def install_one(slot: str, tier: int, design: int, candidate: str, target: str,
                proof: dict | None, shipping: bool, manifest_dir: str = MANIFEST_DIR) -> dict:
    m = load_deriver()
    cand = os.path.abspath(candidate)
    if not os.path.exists(cand):
        _refuse(f"candidate {cand} does not exist")
    with Image.open(cand) as im:
        if im.mode != "RGBA":
            _refuse(f"{cand} is {im.mode}, not RGBA; the judge's normalised output is RGBA and nothing is converted here")
        size = im.size
    want = load_canvas()[slot]
    if size != want:
        _refuse(f"{cand} is {size[0]}x{size[1]}, the contract canvas for {slot} is {want[0]}x{want[1]}; "
                "the installer never resizes")
    name = f"{slot}-t{tier}-{design}"
    out_dir = os.path.join(target, slot)
    os.makedirs(out_dir, exist_ok=True)
    out_png = os.path.join(out_dir, f"t{tier}-{design}.png")
    out_mask = os.path.join(out_dir, f"t{tier}-{design}.mask.png")
    # derive into a staging folder first so the breaker can refuse before
    # anything lands in the target
    stage_root = os.path.join(INSTALL_ROOT, f"stage-{os.getpid()}")
    stage = os.path.join(stage_root, name)
    if os.path.exists(stage):
        shutil.rmtree(stage)
    os.makedirs(stage)
    s_png, s_mask = os.path.join(stage, "base.png"), os.path.join(stage, "mask.png")
    share, left = derive_pair(name, cand, s_png, s_mask)
    bad = deriver_breaker(slot, share, left)
    if bad:
        shutil.rmtree(stage_root, ignore_errors=True)
        _refuse(f"{name}: the deriver's breaker fires on this candidate: " + "; ".join(bad))
    with Image.open(s_mask) as mk:
        if mk.mode != "RGBA" or mk.size != want:
            shutil.rmtree(stage_root, ignore_errors=True)
            _refuse(f"{name}: the deriver wrote a {mk.mode} {mk.size} mask; the art gate needs RGBA at {want}")
    # back to back, as the deriver does it: a base without its mask draws as a
    # black rectangle for anyone viewing mid-install
    os.replace(s_png, out_png)
    os.replace(s_mask, out_mask)
    shutil.rmtree(stage_root, ignore_errors=True)
    rec = {
        "part": name, "slot": slot, "tier": tier, "design": design,
        "candidate": cand, "candidateSha256": _sha256(cand),
        "proof": proof, "shipped": shipping,
        "base": out_png, "baseSha256": _sha256(out_png),
        "mask": out_mask, "maskSha256": _sha256(out_mask),
        "paintShare": round(share, 4), "unmaskedBody": int(left),
        "deriver": DERIVER_PY, "deriverSha256": _sha256(DERIVER_PY),
        "law": LAW_JSON, "lawSha256": _sha256(LAW_JSON),
        "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    os.makedirs(manifest_dir, exist_ok=True)
    rec["manifest"] = os.path.join(manifest_dir, name + ".json")
    with open(rec["manifest"], "w", encoding="utf-8") as f:
        json.dump(rec, f, indent=1)
    return rec


# ── 4. the shipped gate, on a shadow tree ─────────────────────────────────

def stage_sandbox(target: str, sandbox: str, installed: list[dict]) -> dict:
    """<sandbox>/public/bots-art = live bots-art minus _raw, then the installed
    pairs laid over parts/<slot>/; <sandbox>/scripts/bots-art-accents.json =
    the law. Returns the proof table: per installed file, its sha256 in the
    shadow tree and the live file's sha256, plus the count of shadow part
    files that differ from live."""
    if _under(sandbox, LIVE_ART) or _under(sandbox, os.path.join(ROOT, "public")):
        _refuse(f"the gate sandbox {sandbox} is inside public/; it must be a scratch tree")
    pub = os.path.join(sandbox, "public")
    if os.path.exists(pub):
        shutil.rmtree(pub, ignore_errors=True)
    os.makedirs(os.path.join(sandbox, "scripts"), exist_ok=True)
    shutil.copy2(LAW_JSON, os.path.join(sandbox, "scripts", "bots-art-accents.json"))
    shutil.copytree(LIVE_ART, os.path.join(pub, "bots-art"), ignore=shutil.ignore_patterns("_raw"))
    rows = []
    for rec in installed:
        for kind in ("base", "mask"):
            src = rec[kind]
            rel = os.path.join("parts", rec["slot"], os.path.basename(src))
            dst = os.path.join(pub, "bots-art", rel)
            live = os.path.join(LIVE_ART, rel)
            shutil.copy2(src, dst)
            rows.append({"file": rel.replace("\\", "/"), "shadowSha256": _sha256(dst),
                         "liveSha256": _sha256(live) if os.path.exists(live) else None})
    differ = 0
    total = 0
    for slot in SLOTS:
        d = os.path.join(pub, "bots-art", "parts", slot)
        for f in sorted(os.listdir(d)):
            if not f.endswith(".png"):
                continue
            total += 1
            live = os.path.join(LIVE_PARTS, slot, f)
            if not os.path.exists(live) or _sha256(os.path.join(d, f)) != _sha256(live):
                differ += 1
    return {"sandbox": sandbox, "installed": rows, "shadowPartFiles": total, "differFromLive": differ}


def run_gate(sandbox: str) -> dict:
    """scripts/bots-art-check.mts, unmodified, cwd = the sandbox. shell=True on
    Windows because npx is a .cmd there (the judge does the same)."""
    t0 = time.time()
    r = subprocess.run(["npx", "tsx", GATE_MTS], cwd=sandbox, capture_output=True, text=True,
                       shell=(os.name == "nt"))
    out = (r.stdout or "") + (r.stderr or "")
    with open(os.path.join(sandbox, "gate.txt"), "w", encoding="utf-8") as f:
        f.write(f"$ npx tsx {GATE_MTS}   (cwd {sandbox})\n{out}\nexit {r.returncode}\n")
    return {"pass": r.returncode == 0, "exit": r.returncode, "seconds": round(time.time() - t0, 2),
            "output": out, "fails": [l for l in out.splitlines() if l.startswith("FAIL ")]}


# ── 5. render the way the rig does ────────────────────────────────────────

def read_paints() -> dict[str, tuple[int, int, int]]:
    """The eight paints, read out of src/app/bots/_ui/tokens.ts by name."""
    src = open(TOKENS_TS, encoding="utf-8").read()
    mm = re.search(r"export const PAINTS\s*=\s*\{([^}]*)\}", src)
    if not mm:
        _refuse("tokens.ts no longer declares PAINTS")
    paints = {}
    for k, hx in re.findall(r"(\w+):\s*\"#([0-9a-fA-F]{6})\"", mm.group(1)):
        paints[k] = (int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16))
    if len(paints) != 8:
        _refuse(f"tokens.ts PAINTS has {len(paints)} entries, the game has eight")
    return paints


def tint(base: np.ndarray, mask_a: np.ndarray, paint: tuple[int, int, int]) -> np.ndarray:
    """rig.ts: the mask sprite is tinted with the paint and drawn at MULTIPLY
    over the base, so out = base * (1 - a + a * paint), alpha from the base."""
    a = mask_a.astype(np.float64)[..., None] / 255.0
    p = np.asarray(paint, np.float64)[None, None, :] / 255.0
    rgb = base[..., :3].astype(np.float64) * (1.0 - a + a * p)
    out = base.copy()
    out[..., :3] = np.clip(rgb + 0.5, 0, 255).astype(np.uint8)
    return out


def accent_touch(base: np.ndarray, mask_a: np.ndarray) -> dict:
    """Per accent band in the law: solid pixels of the BASE in that band alone
    (the shipped classifier, run with the table cut to one band), and how many
    of them the mask touches (alpha over zero). The eye count is the gate's
    EYE PAINTED question asked of every eye-band pixel, not only the two blobs."""
    m = load_deriver()
    solid = base[..., 3] >= m.OPAQUE
    out = {}
    full = m.ACC
    try:
        for band in full:
            if band.startswith("_"):
                continue
            m.ACC = {band: full[band]}
            hit = m.accent_mask(base) & solid
            out[band] = {"solid": int(hit.sum()), "underMask": int((hit & (mask_a > 0)).sum())}
    finally:
        m.ACC = full
    return out


def _on_board(rgba: np.ndarray, board=(201, 187, 155)) -> Image.Image:
    a = rgba[..., 3:4].astype(np.float64) / 255.0
    rgb = rgba[..., :3].astype(np.float64) * a + np.asarray(board, np.float64) * (1 - a)
    return Image.fromarray(np.clip(rgb + 0.5, 0, 255).astype(np.uint8), "RGB")


def render_sheet(installed: list[dict], out_png: str, scale: float = 0.5) -> dict:
    paints = read_paints()
    os.makedirs(RENDER_DIR, exist_ok=True)
    cols = ["BASE", "MASK"] + list(paints)
    tiles = []
    stats = {}
    for rec in installed:
        base = np.asarray(Image.open(rec["base"]).convert("RGBA"))
        mk = np.asarray(Image.open(rec["mask"]).convert("RGBA"))
        ma = mk[..., 3]
        stats[rec["part"]] = accent_touch(base, ma)
        row = [_on_board(base)]
        mvis = np.zeros_like(base)
        mvis[..., :3] = 255
        mvis[..., 3] = ma
        row.append(_on_board(mvis, (40, 40, 48)))
        for pname, prgb in paints.items():
            t = tint(base, ma, prgb)
            Image.fromarray(t, "RGBA").save(os.path.join(RENDER_DIR, f"{rec['part']}-{pname}.png"))
            row.append(_on_board(t))
        tiles.append((rec["part"], row))
    cw = max(im.width for _, row in tiles for im in row)
    cw = int(cw * scale)
    label_h = 18
    heights = [int(max(im.height for im in row) * scale) for _, row in tiles]
    W = 90 + len(cols) * (cw + 8)
    H = label_h + sum(h + label_h + 8 for h in heights)
    sheet = Image.new("RGB", (W, H), (201, 187, 155))
    d = ImageDraw.Draw(sheet)
    for i, c in enumerate(cols):
        d.text((90 + i * (cw + 8), 2), c, fill=(30, 30, 30))
    y = label_h
    for (part, row), h in zip(tiles, heights):
        d.text((4, y + 2), part, fill=(30, 30, 30))
        for i, im in enumerate(row):
            t = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
            sheet.paste(t, (90 + i * (cw + 8), y + label_h))
        y += h + label_h + 8
    sheet.save(out_png)
    return {"sheet": out_png, "paints": list(paints), "accentTouch": stats}


# ── 6. main ───────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Install a judged, normalised factory candidate as the "
                                             "shipped base + paint-mask pair, in a scratch tree by default.")
    ap.add_argument("--part", nargs=4, action="append", metavar=("SLOT", "TIER", "DESIGN", "PNG"),
                    help="slot tier design candidate.png (repeatable)")
    ap.add_argument("--author-sole", metavar="PART",
                    help="leg only: fill the contract's sole region of every cut in --cut-dir with the "
                         "authored coral, into --out-dir, for the judge to read (see the header of section 0)")
    ap.add_argument("--cut-dir", help="--author-sole: the runner's cut folder for that part")
    ap.add_argument("--out-dir", help="--author-sole: where the authored cuts go (never the cut folder, never public/)")
    ap.add_argument("--target", default=DEFAULT_TARGET,
                    help=f"where <slot>/t<tier>-<design>.png lands (default {DEFAULT_TARGET})")
    ap.add_argument("--ship", action="store_true",
                    help="allow the target to be the live public/bots-art/parts; needs a RANKED proof per part")
    ap.add_argument("--unjudged", action="store_true",
                    help="scratch only: install a candidate that carries no RANKED proof")
    ap.add_argument("--gate", action="store_true", help="stage a shadow tree and run scripts/bots-art-check.mts on it")
    ap.add_argument("--sandbox", default=DEFAULT_SANDBOX, help=f"the shadow tree for --gate (default {DEFAULT_SANDBOX})")
    ap.add_argument("--render", action="store_true", help="render the pairs in the eight paints and write a sheet")
    ap.add_argument("--sheet", default=os.path.join(INSTALL_ROOT, "PAINT-SHEET.png"))
    ap.add_argument("--manifest-dir", default=MANIFEST_DIR,
                    help=f"where the per-part install record lands, never inside the target (default {MANIFEST_DIR})")
    a = ap.parse_args()

    if a.author_sole:
        if a.part or not (a.cut_dir and a.out_dir):
            _refuse("--author-sole runs alone and needs --cut-dir and --out-dir")
        return mode_author_sole(a.author_sole, a.cut_dir, a.out_dir)
    if not a.part:
        _refuse("nothing to do: pass --part SLOT TIER DESIGN PNG (repeatable) or --author-sole PART")

    target = os.path.abspath(a.target)
    live = _under(target, LIVE_ART) or _under(target, os.path.join(ROOT, "public"))
    if live and not a.ship:
        _refuse(f"target {target} is the live art tree (public/bots-art/parts); pass --ship to mean it, "
                "and only with judged, RANKED candidates")
    if a.ship and not live:
        print(f"note: --ship given but the target {target} is a scratch tree; installing there")
    if a.ship and _norm(target) != _norm(LIVE_PARTS) and live:
        _refuse(f"--ship targets exactly {LIVE_PARTS}, not {target}")
    if a.ship and a.unjudged:
        _refuse("--unjudged is never accepted with --ship: nothing unjudged reaches the live tree")
    if _under(a.manifest_dir, os.path.join(ROOT, "public")):
        _refuse(f"the manifest dir {a.manifest_dir} is inside public/; only the pair itself ever lands there")

    parts = []
    for slot, tier, design, png in a.part:
        if slot not in SLOTS:
            _refuse(f"slot {slot!r} is not one of {SLOTS}")
        try:
            tier_i, design_i = int(tier), int(design)
        except ValueError:
            _refuse(f"tier/design must be integers, got {tier!r} {design!r}")
        if tier_i not in TIERS or design_i not in DESIGNS:
            _refuse(f"tier {tier_i} design {design_i} is outside the contract's {TIERS} x {DESIGNS}")
        parts.append((slot, tier_i, design_i, png))

    # every proof first, then every write: a refusal on the third part must not
    # leave the first two installed
    proofs = []
    for slot, tier, design, png in parts:
        if not os.path.exists(png):
            _refuse(f"candidate {png} does not exist")
        proof = find_proof(png, slot, tier, design)
        if proof is None:
            if a.ship or not a.unjudged:
                _refuse(f"{slot}-t{tier}-{design}: no RANKED proof for {png} (no sidecar .judge.json, and no "
                        "RANKED row for it in a report.json one level above its normalised/ folder)"
                        + ("" if a.ship else "; pass --unjudged to install it into scratch anyway"))
            print(f"warning: {slot}-t{tier}-{design} installs UNJUDGED into scratch: {png}")
        proofs.append(proof)

    load_deriver()
    installed = []
    for (slot, tier, design, png), proof in zip(parts, proofs):
        rec = install_one(slot, tier, design, png, target, proof, shipping=live,
                          manifest_dir=os.path.abspath(a.manifest_dir))
        installed.append(rec)
        pr = "unjudged" if proof is None else (f"RANKED via {proof['source']} "
                                               f"(rank {proof.get('rankInPool')}, composite {proof.get('composite')})")
        print(f"installed {rec['part']:12s} paintable {rec['paintShare']:6.1%}  unmasked body {rec['unmaskedBody']:4d}"
              f"  {pr}\n   base {rec['base']}\n   mask {rec['mask']}")

    rc = 0
    if a.gate:
        st = stage_sandbox(target, os.path.abspath(a.sandbox), installed)
        print(f"\nshadow tree {st['sandbox']}: {st['shadowPartFiles']} part files, "
              f"{st['differFromLive']} differ from live (expected {2 * len(installed)})")
        for r in st["installed"]:
            same = "SAME AS LIVE" if r["shadowSha256"] == r["liveSha256"] else "differs from live"
            print(f"   {r['file']:32s} shadow {r['shadowSha256'][:12]}  live {(r['liveSha256'] or '-')[:12]}  {same}")
        g = run_gate(st["sandbox"])
        print(f"\n$ npx tsx {GATE_MTS}   (cwd {st['sandbox']})")
        print(g["output"].strip())
        print(f"gate {'PASS' if g['pass'] else 'FAIL'} in {g['seconds']}s, {len(g['fails'])} rule(s) fired, exit {g['exit']}")
        with open(os.path.join(INSTALL_ROOT, "gate-result.json"), "w", encoding="utf-8") as f:
            json.dump({"staging": st, "gate": {k: v for k, v in g.items() if k != "output"}}, f, indent=1)
        if not g["pass"]:
            rc = 2
    if a.render:
        rs = render_sheet(installed, os.path.abspath(a.sheet))
        print(f"\nrendered {a.sheet} in {len(rs['paints'])} paints: {', '.join(rs['paints'])}")
        for part, bands in rs["accentTouch"].items():
            line = "  ".join(f"{b}: {v['solid']} solid, {v['underMask']} under mask" for b, v in bands.items())
            print(f"   {part:12s} {line}")
        with open(os.path.join(INSTALL_ROOT, "render-result.json"), "w", encoding="utf-8") as f:
            json.dump(rs, f, indent=1)
    return rc


if __name__ == "__main__":
    sys.exit(main())
