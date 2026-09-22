"""THE RANKER'S OWN GATE. Proves scripts/sd/rank-part.py rather than asserting it.

    PYTHONIOENCODING=utf-8 python scripts/sd/rank-part-check.py
    ... --fast     skip the two checks that spawn the TypeScript gate

Why this file is Python and not .mts: it has to IMPORT the ranker, and the
ranker is Python for the reasons its own header gives. It still runs the
shipped TypeScript gate, as a subprocess, in check 3.

THE FIFTEEN CHECKS.

 1. IMPORT FIDELITY. Every number the ranker uses can be traced to a shipped
    file, and the ranker refuses when it cannot. Asserted by comparing the
    ranker's live values against the files themselves, and by proving the
    refusal path fires on a mangled copy rather than silently falling back.
    Since 2026-09-05 this also covers THE NORMALISATION: the ranker calls the
    importer's own find_eyes, draw_face, pin_coral, neutral_clay and the rest
    by name on scripts/bots-import-parts.py, and defines none of them itself;
    and THE EXPOSURE LEVEL, which is one line of the importer's process()
    and no function: the ranker's compiled copy must be built from that line
    (its code object is filed under the importer's path), and its target must
    be the measured median level of the shipped parts of the slot.
 2. THE RULER IS THE CONTRACT. The bake's own regenerated rig-points.ts is
    byte-identical to the shipped one, so every silhouette score is taken
    against the contract everything else reads.
 3. AGREEMENT WITH THE SHIPPED GATE. bots-art-check.mts passes all 40 shipped
    parts. The ranker must therefore raise none of its gate-class hard
    failures on those same 40. Any disagreement is a bug in one of the two,
    and this check names which part and which rule.
 4. DAMAGE IS DETECTED. A ranker that scores broken art the same as clean art
    is decoration. Nine known injuries are applied to a known-good part and
    each must cost composite in the axis that owns it, or raise a hard rule.
 5. THE RANKING MATCHES THE EYE. The orderings a human verified by looking at
    the catalogue on 2026-09-05, asserted as inequalities.
 6. SPEED. The ranker has to survive a sweep; this measures images per second
    and fails if it falls under a bar.
 7. NOTHING IN THE REPO MOVED. The ranker imports two modules that write files
    for a living. This hashes every shipped part before and after a full run.
 8. THE COMPOSITE IS A RANKING, NOT A PASS MARK. There are no PASS verdicts and
    no threshold anywhere; the clay ruler is REJECT in all 40 pools and can
    never be picked, however high its composite; a pool with no survivor
    picks nothing. This is the check the 2026-09-05 calibration demanded:
    the old composite let the featureless placeholder outscore 36 of 40 real
    parts, because it is perfect at geometry.
 9. THE JUDGE SCORES WHAT WOULD SHIP. Measured on the 4090 on 2026-09-05 the
    judge rejected 59 of 62 real heads for LENS CORE PAINTED on a lens colour
    the importer replaces before anything ships. So: a shipped head whose
    lens is repainted the saturated amber the model actually draws (hue 33 to
    57, saturation 0.5 to 1.0, outside the law's eye band) must SURVIVE, with
    the repair counted; a head with no eyes at all, and a featureless blob,
    must REJECT and say NO FACE FOUND, never LENS CORE PAINTED; a dark plate
    on the crown, which the importer's find_grille lights gold as the mouth,
    must REJECT as MOUTH MISPLACED; every shipped head, re-normalised, must
    keep its face and need little repair; and (f) THE EXPOSURE LEVEL: the
    importer's find_eyes sweeps fixed value thresholds (0.84 to 0.92) and its
    find_grille takes value at or under 0.32, so the face pass depends on
    the level it is handed, and the factory's cuts arrive at 110.8 to 154.1
    against shipped heads at 165.8 to 173.4. Every shipped head darkened to
    level 120 must keep its face, be levelled back to the shipped median with
    the level and gain in the report, count none of that levelling as repair,
    and raise no rule the undarkened head does not raise; and the control:
    the importer's own find_eyes, handed that dark head unlevelled, must find
    no pair, or the check proves nothing.
10. THE UNSHADED RULE. Measured on the v2 limb slice on 2026-09-05: a
    lineart-only render is often an OUTLINE DRAWING (white fill, black
    lines, no shading), the as-shipped normalisation turns that into clean
    uniform clay, and the judge ranked one FIRST for the arm. The rule is
    asked of the RAW cut. So: a synthetic outline drawing (the ruler's
    silhouette, white fill, black outline, no gradient) must REJECT as
    UNSHADED with its spread reported under the calibrated outline maximum,
    on a head and on an arm; every shaded shipped part (the 32 that are not
    the flat placeholder weapons) must raise no UNSHADED and read above the
    calibrated shaded minimum; the 8 shipped weapons, which ARE the flat
    vector placeholder, must read UNSHADED alongside IS THE PLACEHOLDER; the
    40 rulers, which carry the contract's own ramp, must raise none; the bar
    must sit in the calibrated gap at its geometric middle; the measure must
    not move with exposure (a head at 70 percent brightness reads the same
    spread); it must say it was measured on the raw cut; and the CSV must
    carry it.
11. THE CORAL SOLE. The 2026-09-05 production sweep installed eight legs
    whose coral was a rim plus drips, because pin_coral pins whatever coral
    it finds and nothing asked where. So: a synthetic leg made from a live
    leg with coral drips painted above its sole must REJECT as CORAL SPILL
    with the spill reported over the bar; the same live leg with its sole
    wiped to clay must REJECT as NO SOLE; the eight live legs, whose sole is
    one clean block, must raise neither and read under the bar; the bar
    must sit in the calibrated gap; and the CSV must carry the spill.
12. THE THIRD EYE AND THE EYE SIZE. The same sweep installed three heads
    that read as three-eyed (a cyclops lens above two lit side bolts, or a
    grille above the eyes), and two whose eyes are pinholes at fight size.
    So: a shipped head with a bright disc in a dark bezel drawn above the
    eye line must REJECT as THIRD EYE, and so must one with a small dark
    slotted grille there (small enough that find_grille still takes the
    real mouth, so MOUTH MISPLACED stays silent and THIRD EYE has to do the
    work); the eight shipped heads must raise no THIRD EYE and read under
    the bar; the bar must sit in the calibrated gap; the eye-size score must
    be 0 at its floor, 1 at full and monotone; every shipped head must carry
    an eyeSize block inside the calibrated shipped range and above the SMALL
    EYES line; a shipped head with its lenses shrunk to pinholes must keep
    its face, say SMALL EYES, and score lower on the fit axis than itself
    with its own eyes; and the CSV must carry both. (Since pass 3 the floor is
    also the hard rule EYE SIZE, check 13; the pinhole head here sits under it
    and is a REJECT, which changes nothing this check asserts.)
13. EYE SIZE IS A HARD RULE UNDER THE FLOOR. The 2026-09-05 pass 3 found the
    judge's blind spot: two cyclops heads (piston and anvil, a big lens LEVEL
    with two tiny lit side nubs) passed, because the importer's find_eyes
    took the nubs for the pair (0.024 and 0.026 of head width), SMALL EYES
    only warned, and THIRD EYE measured only above the eye line. So: the
    floor (0.03) must sit under the SMALL EYES line and under every shipped
    head, and the two cyclops pairs under it; a shipped head with its lenses
    shrunk to pinholes under the floor must keep its face (the importer
    would ship it, which is the point) and REJECT as EYE SIZE, still saying
    SMALL EYES; the same injury at a legal small size must stay RANKED with
    SMALL EYES only; the eight shipped heads must raise none; the CSV's
    firstFail must carry it; and, when the production pools are on this
    machine, the two false survivors must now REJECT as EYE SIZE and the
    four design-1 manifest winners must still be RANKED at the composite
    their manifests record, to the hundredth.
14. THE THIRD EYE ON THE EYE ROW. The other half of the blind spot: a lens
    sitting ON the eye row, between the pair the importer found, was never
    measured. third_eye's row block measures the eye row (keep-out radius
    either side of the eye centre, the central band, minus the keep-out
    discs, the lit grille and the drawn lenses), labels its dark pixels as
    drawn and closed, hole-fills them, keeps the disc-shaped blobs and
    reports the largest as a radius; it fires at or over 0.038 of head width
    when the found pair is under the floor or the disc is more than twice
    the found eye. So: the minimum must sit in the calibrated gap at its
    geometric middle; the eight shipped heads must raise nothing on the row;
    on the pinhole head a 20 px pupil ten rows down must REJECT as THIRD
    EYE with the row named and the above-line count under its bar (the row
    did the work), the pinhole head alone must raise no THIRD EYE, a 10 px
    pupil (under the minimum) and a 50 by 8 dark bar (not a disc) must raise
    none, and a lit glass in a dark bezel must fire through its bezel; with
    a legal small pair (0.034) a 36 px pupil must fire on the 2x arm with no
    EYE SIZE, and a 24 px one must not; the CSV must carry the row radius;
    and, when the production pools are on this machine, the two false
    survivors must fire on the row at the calibrated radii, no design-1
    survivor may fire on the row, and the two design-1 survivors under the
    floor must REJECT as EYE SIZE alone (the label stays honest: nothing on
    their row).
15. THE RULER SEAM. rank-part.py baked its comparison ruler from the SHIP
    TABLE, and measured here those forty rulers are FIVE shapes: the eight leg
    rulers and the eight torso rulers are pixel identical, the arms overlap
    0.98 and up, and the eight heads are one dome. So a bear head was scored
    against a dome and lost on shape distance, and the judge would have
    refused the shape table one shape at a time. The ruler now comes from the
    shape being judged. This check proves the default path is untouched
    (ruler_for is ruler() in all 40 pools, the row gains no field, the score is
    identical), that the swap moves the silhouette BOTH ways (a bear candidate
    gains against the bear and a dome candidate loses), that NO hard rule
    changes when the ruler does, that the bear's own clay drawing REJECTS as
    IS THE PLACEHOLDER against the bear and not against the dome (so the open
    seam would also have let every new shape's placeholder in as art), that a
    ruler on the wrong canvas, clipped, off the pivots or outside the bands is
    REFUSED rather than used, that an unknown shape, a missing table and a
    missing ruler file refuse instead of falling back to the dome, and that
    two shapes never share a pool. It also measures what an eared head SPENDS
    of the THIRD EYE budget, which does not move: the bar stays where it was
    calibrated, the shipped domes spend up to 70 px of it, and the ear is what
    has to fit.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
ROOT = os.path.dirname(SCRIPTS)
FAST = "--fast" in sys.argv

_spec = importlib.util.spec_from_file_location("rank_part", os.path.join(HERE, "rank-part.py"))
J = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(J)

fails: list[str] = []
notes: list[str] = []


def ok(cond, msg):
    if not cond:
        fails.append(msg)
    return bool(cond)


def part(slot, t, d):
    return os.path.join(ROOT, "public", "bots-art", "parts", slot, f"t{t}-{d}.png")


def tree_hash(root):
    h = {}
    for dp, _, ns in os.walk(root):
        for n in ns:
            p = os.path.join(dp, n)
            h[os.path.relpath(p, root)] = hashlib.sha1(open(p, "rb").read()).hexdigest()
    return h


# ── 1. import fidelity ────────────────────────────────────────────────────
print("1. import fidelity")
law = json.load(open(os.path.join(SCRIPTS, "bots-art-accents.json"), encoding="utf-8"))
ok(J.SHARE_MIN == law["gate"]["paintShareMin"]["value"], "paintShareMin is not the law's")
ok(J.SHARE_MAX == law["gate"]["paintShareMax"]["value"], "paintShareMax is not the law's")
ok(J.LEFT_MAX == law["gate"]["unmaskedBodyMax"]["value"], "unmaskedBodyMax is not the law's")
ok(sorted(J.CEILING_SLOTS) == ["head", "leg", "torso", "weapon"],
   f"the ceiling slots read as {J.CEILING_SLOTS}; the law names head, torso, leg and weapon and "
   f"excludes the arm")
rig_src = open(os.path.join(ROOT, "src", "app", "bots", "_view", "rig-points.ts"), encoding="utf-8").read()
ok(f"h: {J.RIG['head']['h']}" in rig_src and f"w: {J.RIG['head']['w']}" in rig_src,
   "the head canvas the ranker holds is not in rig-points.ts")
ok(f"neck: [{J.RIG['head']['neck'][0]}, {J.RIG['head']['neck'][1]}]" in rig_src,
   "the head neck pivot the ranker holds is not in rig-points.ts")
ok(f"burial: {J.JOIN['burial']}" in rig_src, "the JOIN burial the ranker holds is not in rig-points.ts")
ok(f"lateralMax: {J.LIGHT['lateralMax']}" in rig_src, "LIGHT.lateralMax is not in rig-points.ts")
gate_src = open(os.path.join(SCRIPTS, "bots-art-check.mts"), encoding="utf-8").read()
ok(f"const RADIUS = {J.RADIUS};" in gate_src, "RADIUS is not the gate's")
ok(J.GATE["OPAQUE"] == J.OPAQUE == 200, "the two definitions of a solid pixel disagree")
print(f"   share {J.SHARE_MIN}..{J.SHARE_MAX}  unmasked bar {J.LEFT_MAX}  radius {J.RADIUS}  "
      f"guard {J.GATE['guard']}px  ceiling slots {J.CEILING_SLOTS}")

# the normalisation is the importer's, called by name, never a copy
print("   the normalisation is imported, not re-implemented")
ranker_src = open(os.path.join(HERE, "rank-part.py"), encoding="utf-8").read()
ok(os.path.normcase(os.path.abspath(J._CUT.__file__))
   == os.path.normcase(os.path.join(SCRIPTS, "bots-import-parts.py")),
   f"the ranker's importer module is {J._CUT.__file__}, not scripts/bots-import-parts.py")
for fn in J.NORMALISE_FUNCS:
    ok(callable(getattr(J._CUT, fn, None)), f"bots-import-parts.py has no {fn}() for the ranker to call")
    ok(not re.search(r"^\s*def %s\(" % re.escape(fn), ranker_src, re.M),
       f"rank-part.py defines its own {fn}(); the normalisation must be the importer's")
for fn in ("neutralise", "find_grille", "light_grille", "draw_face", "lift_crevices", "pin_coral",
           "neutral_clay", "strip_brass", "draw_key", "largest_component"):
    ok(f"_CUT.{fn}(" in ranker_src, f"rank-part.py never calls _CUT.{fn}()")
print(f"   {len(J.NORMALISE_FUNCS)} importer functions present and called by name; none defined locally")

# the exposure level is the importer's own line, lifted, and its target is measured
print("   the exposure level is lifted from the importer, its target measured off the shipped parts")
imp_src = open(os.path.join(SCRIPTS, "bots-import-parts.py"), encoding="utf-8").read()
ok(J.EXPOSURE_LINE.strip() and J.EXPOSURE_LINE.strip() in imp_src,
   f"the exposure line the ranker applies ({J.EXPOSURE_LINE.strip()!r}) is not a line of bots-import-parts.py")
ok("level_target" in J.EXPOSURE_LINE and "np.clip(" in J.EXPOSURE_LINE,
   "the lifted line is not the importer's exposure step (rgb = np.clip(rgb * (level_target / ...)))")
ok(os.path.normcase(J.EXPOSE.__code__.co_filename).startswith(
    os.path.normcase(os.path.join(SCRIPTS, "bots-import-parts.py"))),
   f"the ranker's exposure function was compiled from {J.EXPOSE.__code__.co_filename}, not from the importer's line")
probe = np.full((4, 4, 3), 100.0, np.float32)
ok(np.allclose(J.EXPOSE(probe, 100.0, 150.0), 150.0) and np.allclose(J.EXPOSE(probe, 200.0, 100.0), 50.0)
   and float(J.EXPOSE(probe, 50.0, 400.0).max()) == 255.0,
   "the lifted exposure step does not scale by target over level and clip at 255")
head_levels = []
for t in J.TIERS:
    for d in J.DESIGNS:
        a1 = np.asarray(Image.open(part("head", t, d)).convert("RGBA"))
        head_levels.append(float(J._CUT.neutralise(a1[..., :3].astype(np.float32), J._CUT.largest_component(a1[..., 3]))[2]))
tgt_head, tinfo = J.shipped_level_target("head")
ok(tinfo["n"] == 8 and abs(tgt_head - float(np.median(head_levels))) < 1e-6,
   f"the head exposure target {tgt_head:.1f} over {tinfo['n']} parts is not the median of the 8 shipped heads' "
   f"own levels ({np.median(head_levels):.1f}), measured with the importer's neutralise")
ok(J.shipped_level_target("torso")[0] < tgt_head,
   "the torso target is not below the head's; the contract's own light law puts the torso in the head's shadow "
   "(headShadowOnTorso), so a torso levelled to a head's brightness would ship brighter than any torso")
try:
    J.shipped_level_target("no-such-slot")
    fails.append("the ranker took an exposure target for a slot with no shipped parts instead of refusing")
except SystemExit as e:
    ok("REFUSES" in str(e), f"the empty-slot refusal did not say so: {e}")
print(f"   line: {J.EXPOSURE_LINE.strip()}")
print(f"   targets: " + ", ".join(f"{s} {J.shipped_level_target(s)[0]:.1f} (n {J.shipped_level_target(s)[1]['n']}, "
                                   f"{J.shipped_level_target(s)[1]['min']} to {J.shipped_level_target(s)[1]['max']})"
                                   for s in ("head", "torso", "arm", "leg")))

# the refusal path must fire rather than fall back
print("   the refusal path")
tmp = tempfile.mkdtemp(prefix="ranker-refuse-")
try:
    shutil.copy2(os.path.join(SCRIPTS, "bots-paint-masks.py"), os.path.join(tmp, "bots-paint-masks.py"))
    src = open(os.path.join(tmp, "bots-paint-masks.py"), encoding="utf-8").read()
    open(os.path.join(tmp, "bots-paint-masks.py"), "w", encoding="utf-8").write(
        src.replace("targets = []", "TARGETS_RENAMED = []"))
    try:
        J._load_py(os.path.join(tmp, "bots-paint-masks.py"), "_probe", cut_at="targets = []")
        fails.append("the ranker accepted a deriver with no anchor instead of refusing")
    except SystemExit as e:
        ok("REFUSES" in str(e), f"the refusal did not say so: {e}")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# ── 2. the ruler is the contract ──────────────────────────────────────────
print("2. the ruler is the contract")
rd = J.ruler_dir()
baked = os.path.normpath(os.path.join(rd, "..", "..", "..", "src", "app", "bots", "_view", "rig-points.ts"))
ok(os.path.exists(baked), f"the ruler bake wrote no contract copy at {baked}")
if os.path.exists(baked):
    ok(open(baked, encoding="utf-8").read() == rig_src,
       "the ruler was drawn to a different contract than the one everything else reads")
n = sum(1 for s in J.SLOTS for t in J.TIERS for d in J.DESIGNS
        if os.path.exists(os.path.join(rd, s, f"t{t}-{d}.png")))
ok(n == 40, f"the ruler has {n} of 40 parts")
print("   40 placeholders, contract byte-identical to the shipped rig-points.ts")

# ── 3. agreement with the shipped gate ────────────────────────────────────
print("3. agreement with the shipped gate")
GATE_CLASS = ("CLIPPED", "AIR", "BURIAL", "HARDWARE", "BRASS BUDGET", "BRASS MISSING",
              "UNPAINTED BODY", "PAINT SHARE")
shipped = []
for s in J.SLOTS:
    for t in J.TIERS:
        for d in J.DESIGNS:
            shipped.append(J.score_image(part(s, t, d), s, t, d))
if FAST:
    notes.append("check 3 ran against the gate's last known verdict, not a live run (--fast)")
    gate_passes = True
else:
    r = subprocess.run(["npx", "tsx", os.path.join(SCRIPTS, "bots-art-check.mts")],
                       cwd=ROOT, capture_output=True, text=True, shell=(os.name == "nt"))
    gate_passes = r.returncode == 0
    print("   " + (r.stdout or r.stderr).strip().splitlines()[-1])
disagree = [(r["slot"], r["tier"], r["design"], f) for r in shipped for f in r["fail"]
            if f.split(":")[0].startswith(GATE_CLASS)]
if gate_passes:
    ok(not disagree,
       "the shipped gate passes all 40 and the ranker raises gate-class failures on: "
       + "; ".join(f"{a} t{b}-{c} {d[:60]}" for a, b, c, d in disagree[:6]))
print(f"   {len(disagree)} gate-class disagreements over 40 parts")
ranker_only = sorted({f.split(":")[0] for r in shipped for f in r["fail"]
                      if not f.split(":")[0].startswith(GATE_CLASS)})
print(f"   the ranker additionally rejects on: {ranker_only or 'nothing'}")

# ── 4. damage is detected ─────────────────────────────────────────────────
print("4. damage is detected")
BASE = ("head", 3, 2)
base_path = part(*BASE)
base = J.score_image(base_path, *BASE)
tmp = tempfile.mkdtemp(prefix="ranker-damage-")
a0 = np.asarray(Image.open(base_path).convert("RGBA"))


def save(a, name):
    p = os.path.join(tmp, name)
    Image.fromarray(a.astype(np.uint8), "RGBA").save(p)
    return p


def shifted(a, dx, dy):
    return np.roll(np.roll(a, dy, 0), dx, 1)


def zoomed(a, k):
    im = Image.fromarray(a, "RGBA")
    w, h = im.size
    s = im.resize((max(int(w * k), 1), max(int(h * k), 1)), Image.LANCZOS)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(s, ((w - s.width) // 2, (h - s.height) // 2))
    return np.asarray(out)


def bolt_at_joint(a):
    b = a.copy()
    px, py = J.RIG["head"]["neck"]
    yy, xx = np.ogrid[:b.shape[0], :b.shape[1]]
    m = (xx - px) ** 2 + (yy - py - 20) ** 2 <= 18 ** 2
    b[m] = [217, 164, 65, 255]              # the law's brass, #d9a441
    return b


def side_lit(a):
    b = a.astype(np.float32)
    w = b.shape[1]
    g = np.linspace(0.55, 1.45, w)[None, :, None]
    b[..., :3] = np.clip(b[..., :3] * g, 0, 255)
    return b


def stray_blob(a):
    b = a.copy()
    b[6:34, 6:34] = [180, 180, 186, 255]
    return b


def punch_hole(a):
    """A chroma key eating a light patch out of a light body, sized at what
    the keyer actually does (the shipped arms carry 129 to 175 pixels of
    enclosed transparency each)."""
    b = a.copy()
    cy, cx = b.shape[0] // 2, b.shape[1] // 2
    b[cy - 34:cy + 34, cx - 34:cx + 34, 3] = 0
    return b


def tinted(a):
    b = a.astype(np.float32)
    b[..., 0] *= 1.28
    b[..., 2] *= 0.72
    return np.clip(b, 0, 255)


def flattened(a):
    """all surface removed: the clay placeholder failure, in reverse"""
    b = a.astype(np.float32)
    v = b[..., :3].mean(axis=2, keepdims=True)
    b[..., :3] = np.clip(140 + (v - v.mean()) * 0.10, 0, 255)
    return b


def expect_bolt(b, r):
    """A brass bolt on a HEAD never ships as brass: the importer's
    neutral_clay keeps brass only on the torso, so the bolt goes to clay and
    the gate can no longer see it. What the judge must do instead is COUNT
    it: about 1,009 pixels of repair, and a lower paint axis. HARDWARE firing
    here would mean the judge is scoring the raw render again."""
    if any(f.startswith("HARDWARE") for f in r["fail"]):
        return "HARDWARE fired on a head; the importer turns brass on a head to clay, so the judge is judging the raw cut"
    added = r["normalise"]["repairPx"] - b["normalise"]["repairPx"]
    if added < 700:
        return f"the bolt is about 1,009 px and the repair count grew by only {added}"
    if b["axes"]["paint"] - r["axes"]["paint"] <= 0.002:
        return "the paint axis did not move for a 1,009 px repair"
    return None


INJURIES = [
    ("moved 30px right", shifted(a0, 30, 0), "fit", None),
    ("moved 26px down", shifted(a0, 0, 26), "fit", None),
    ("zoomed to 68 percent", zoomed(a0, 0.68), "fit", None),
    ("brass bolt on the neck joint", bolt_at_joint(a0), "paint", expect_bolt),
    ("lit from the side", side_lit(a0), "light", None),
    ("a stray blob in the corner", stray_blob(a0), "clean", None),
    ("a hole punched through it", punch_hole(a0), "clean", None),
    ("tinted warm instead of neutral", tinted(a0), "paint", None),
    ("all surface flattened out", flattened(a0), "style", None),
]
print(f"   baseline {os.path.basename(base_path)} composite {base['composite']:.1f} ({base['verdict']}), "
      f"repair {base['normalise']['repairShare']:.1%} of the ink")
ok(base["verdict"] == "RANKED", f"the shipped head t3-2 is {base['verdict']} ({(base['fail'] or [''])[0][:80]}); "
   f"a judge that rejects a head that ships is judging the wrong pixels")
for name, arr, axis, expect in INJURIES:
    p = save(arr, name.replace(" ", "-") + ".png")
    r = J.score_image(p, *BASE)
    drop = base["composite"] - r["composite"]
    ax_drop = base["axes"][axis] - r["axes"][axis]
    # NOTICING means either the composite moved or a hard rule fired that was
    # not firing before; an injury the importer REPAIRS carries its own
    # expectation instead (the repair must be counted).
    new_fail = [f.split(":")[0] for f in r["fail"]] != [f.split(":")[0] for f in base["fail"]]
    if expect is not None:
        why = expect(base, r)
        flag = "ok " if why is None else "MISS"
        if why:
            fails.append(f"damage undetected: '{name}': {why}")
    else:
        flag = "ok " if ((drop > 1.0 and ax_drop > 0.02) or (new_fail and ax_drop > 0.005)) else "MISS"
        if flag == "MISS":
            fails.append(f"damage undetected: '{name}' cost {drop:+.1f} composite and {ax_drop:+.3f} on the "
                         f"{axis} axis, which is the axis that owns it, and raised no new failure")
    extra = f"  repair {r['normalise']['repairShare']:.1%}" if r.get("normalise") else ""
    print(f"   {flag} {name:32s} composite {drop:+6.1f}   {axis} {ax_drop:+.3f}   "
          f"{r['verdict']}{'  ' + r['fail'][0].split(':')[0] if r['fail'] else ''}{extra}")
shutil.rmtree(tmp, ignore_errors=True)

# ── 5. the ranking matches the eye ────────────────────────────────────────
print("5. the ranking matches the eye")
arms = [r for r in shipped if r["slot"] == "arm"]
worst_arm = min(arms, key=lambda r: r["axes"]["fit"])
ok(worst_arm["tier"] == 1 and worst_arm["design"] == 1,
   f"a human called arm t1-1 the bent one; the ranker's worst arm on fit is "
   f"t{worst_arm['tier']}-{worst_arm['design']}")
print(f"   worst arm on fit is t{worst_arm['tier']}-{worst_arm['design']} "
      f"(fit {worst_arm['axes']['fit']:.2f}, iou {worst_arm['fit']['iou']:.3f}); the rest run "
      f"{min(r['axes']['fit'] for r in arms if r is not worst_arm):.2f} to "
      f"{max(r['axes']['fit'] for r in arms):.2f}")

weapons = [r for r in shipped if r["slot"] == "weapon"]
ok(all(r["verdict"] == "REJECT" and any("IS THE PLACEHOLDER" in f for f in r["fail"]) for r in weapons),
   "the eight shipped weapons are the untouched clay placeholder and the ranker did not reject them as such")
ok(all(r["axes"]["style"] < 0.1 for r in weapons) and all(r["fit"]["iou"] > 0.99 for r in weapons),
   "the weapons match the ruler exactly and should score near zero on style")
print(f"   all 8 weapons REJECT as IS THE PLACEHOLDER, style {max(r['axes']['style'] for r in weapons):.2f}, "
      f"iou {min(r['fit']['iou'] for r in weapons):.3f}")

rul = [J.score_image(os.path.join(rd, s, f"t{t}-{d}.png"), s, t, d)
       for s in J.SLOTS for t in J.TIERS for d in J.DESIGNS]
ok(np.mean([r["axes"]["fit"] for r in rul]) > np.mean([r["axes"]["fit"] for r in shipped]),
   "the contract's own placeholder must sit above the art on the geometry axis")
ok(np.mean([r["axes"]["style"] for r in rul]) < np.mean([r["axes"]["style"] for r in shipped]),
   "the contract's own placeholder must sit below the art on the style axis")
print(f"   ruler fit {np.mean([r['axes']['fit'] for r in rul]):.3f} against shipped "
      f"{np.mean([r['axes']['fit'] for r in shipped]):.3f}; ruler style "
      f"{np.mean([r['axes']['style'] for r in rul]):.3f} against shipped "
      f"{np.mean([r['axes']['style'] for r in shipped]):.3f}")

# ── 6. speed ──────────────────────────────────────────────────────────────
print("6. speed")
t0 = time.time()
N = 40
for s in J.SLOTS:
    for t in J.TIERS:
        for d in J.DESIGNS:
            J.score_image(part(s, t, d), s, t, d)
dt = time.time() - t0
rate = N / dt
# The bar is on ONE core and deliberately loose: measured 6.4 to 11.7 images
# per second across runs on this machine before the normalisation, and the
# importer's face pass costs about 250 ms on a head (find_eyes sweeps five
# thresholds, socket_radius twenty), so the 40-part mix now runs nearer 6/s.
# 600 candidates through `batch --jobs 8` ran at 26/s. Under 4/s on one core
# it has regressed.
ok(rate > 4, f"the ranker manages {rate:.1f} images per second on one core; under 4 it has regressed")
print(f"   {dt / N * 1000:.0f} ms per image, {rate:.1f}/s, {rate * 3600:,.0f}/hour on one core")

# ── 7. nothing in the repo moved ──────────────────────────────────────────
print("7. nothing in the repo moved")
after = tree_hash(os.path.join(ROOT, "public", "bots-art", "parts"))
before_path = os.path.join(HERE, ".parts-hash.json")
if os.path.exists(before_path):
    before = json.load(open(before_path, encoding="utf-8"))
    moved = [k for k in after if before.get(k) != after[k]]
    if moved:
        notes.append(f"{len(moved)} shipped part files changed since the last run of this check. "
                     f"Another lane owns that art, so this is a note, not a failure: {moved[:3]}")
json.dump(after, open(before_path, "w", encoding="utf-8"), indent=0)
ok(not os.path.exists(os.path.join(ROOT, "public", "bots-art", "parts", "head", "t1-1.png.tmp")),
   "a .tmp file was left in the shipped art")
print(f"   {len(after)} shipped files hashed; the ranker writes only under {os.path.relpath(HERE, ROOT)}")

# ── 8. the composite is a ranking, not a pass mark ────────────────────────
print("8. the composite is a ranking, not a pass mark")
ok(set(J.VERDICTS) == {"RANKED", "REJECT", "REFUSED"},
   f"the verdict set is {J.VERDICTS}; a PASS verdict is a pass mark by another name")
ranker_src = open(os.path.join(HERE, "rank-part.py"), encoding="utf-8").read()
ok(not re.search(r'"PASS(-WARN)?"', ranker_src), "rank-part.py still emits a PASS verdict string")
ok(not re.search(r"composite\s*(>=|>|<|<=)\s*\d", ranker_src),
   "rank-part.py compares the composite against a literal number somewhere; that is a threshold")
by = {}
for r in shipped:
    by[(r["slot"], r["tier"], r["design"])] = {"shipped": r}
for r in rul:
    by[(r["slot"], r["tier"], r["design"])]["ruler"] = r
ruler_rejected = ruler_picked = ruler_leads = pools = none_picked = 0
for key, d in by.items():
    pools += 1
    ru, sh = d["ruler"], d["shipped"]
    ruler_rejected += ru["verdict"] == "REJECT" and any("IS THE PLACEHOLDER" in f for f in ru["fail"])
    ruler_leads += ru["composite"] > sh["composite"]
    p = J.pick([ru, sh])
    ruler_picked += p is ru
    none_picked += p is None
ok(ruler_rejected == pools, f"the clay ruler is rejected as the placeholder in {ruler_rejected} of {pools} pools")
ok(ruler_picked == 0, f"select picked the clay ruler in {ruler_picked} pools")
# a pool with nothing surviving picks nothing, never the least-bad reject
ok(J.pick([ru for d in by.values() for ru in [d["ruler"]]]) is None, "pick() chose among rejected candidates")
# ranking inside a pool is by composite among survivors only
demo = [{"verdict": "RANKED", "composite": 50.0, "pool": "x"},
        {"verdict": "REJECT", "composite": 99.0, "pool": "x"},
        {"verdict": "RANKED", "composite": 61.5, "pool": "x"}]
ok(J.pick(demo)["composite"] == 61.5, "pick() did not take the top-composite SURVIVOR")
print(f"   {pools} pools: the ruler leads the composite in {ruler_leads} (diagnosis only), is REJECT as the "
      f"placeholder in {ruler_rejected}, is picked in {ruler_picked}; {none_picked} pools have no survivor")

# ── 9. the judge scores what would ship ───────────────────────────────────
print("9. the judge scores what would ship")
tmp = tempfile.mkdtemp(prefix="ranker-ships-")
a9 = np.asarray(Image.open(part("head", 3, 2)).convert("RGBA")).copy()
base9 = J.score_image(part("head", 3, 2), "head", 3, 2)
# the importer's own lens and ring mask on this head, for placing the injuries
_, _, m9 = J.normalise_as_shipped(a9, "head", 3)
eye9 = m9["eye"]
ok(eye9 is not None and eye9.sum() > 1000, "the importer finds no eye mask on the shipped head t3-2")
eye_law = law["accents"]["eye"]


def hsv_at(a, y, x):
    r, g, b = [float(c) / 255.0 for c in a[y, x, :3]]
    mx, mn = max(r, g, b), min(r, g, b)
    s = (mx - mn) / mx if mx > 0 else 0.0
    return s, mx


# a. THE AMBER LENS. The lens the model draws: hue about 43, saturation 0.9,
#    the sculpted value kept. Outside the law's eye band (satMax) and inside
#    the brass band, which is exactly the render the old judge threw away.
amber = a9.astype(np.float32)
v9 = amber[..., :3].max(2)
for c, k in enumerate((1.0, 0.75, 0.10)):
    amber[..., c] = np.where(eye9, v9 * k, amber[..., c])
p_amber = os.path.join(tmp, "amber-lens.png")
Image.fromarray(np.clip(amber, 0, 255).astype(np.uint8), "RGBA").save(p_amber)
raw9 = np.asarray(Image.open(p_amber).convert("RGBA"))
centres = base9["normalise"]["face"]["eyes"]
sats = [hsv_at(raw9, cy, cx)[0] for cy, cx in centres]
ok(all(s >= 0.5 for s in sats) and all(s > eye_law["satMax"] for s in sats),
   f"the injury is not the measured one: raw lens saturation at the eye centres reads {sats}, the case needs 0.5 or more")
r_amber = J.score_image(p_amber, "head", 3, 2)
ok(r_amber["verdict"] == "RANKED",
   f"a head with the model's own amber lens is {r_amber['verdict']} ({(r_amber['fail'] or [''])[0][:90]}); "
   f"the importer pins that lens before it ships, so the judge must not reject it")
ok(not any(f.startswith(("LENS CORE PAINTED", "BRASS BUDGET", "LENS NOT AN ACCENT")) for f in r_amber["fail"]),
   "the amber lens still raises a lens or brass rule after the importer's pin")
ok(r_amber["normalise"]["faceFound"] is True, "the importer lost the face when the lens went amber")
ok(r_amber["paint"]["lens"].get("lensMaskUnprotected", 1) == 0,
   f"after the pin {r_amber['paint']['lens'].get('lensMaskUnprotected')} lens pixels are still paintable clay")
added = r_amber["normalise"]["repairPx"] - base9["normalise"]["repairPx"]
ok(added >= 0.5 * int(eye9.sum()),
   f"the amber lens ({int(eye9.sum())} px) added only {added} repaired pixels; the repair must be counted")
ok(r_amber["composite"] < base9["composite"],
   f"the amber lens ranks {r_amber['composite']} against the shipped {base9['composite']}; more repair must rank lower")
print(f"   amber lens (sat {min(sats):.2f} to {max(sats):.2f} at the centres, band max {eye_law['satMax']}): "
      f"{r_amber['verdict']}, lens mask {r_amber['paint']['lens'].get('lensMaskPx')} px all protected, "
      f"repair +{added} px, composite {base9['composite']:.1f} -> {r_amber['composite']:.1f}")

# b. NO EYES. The same head with both sockets filled with cheek clay: no
#    level mirrored pair anywhere, so the importer refuses it and so must the
#    judge, under the rule's own name.
grown = J.ndimage.binary_dilation(eye9, iterations=10)
solid9 = a9[..., 3] >= J.OPAQUE
ring = J.ndimage.binary_dilation(grown, iterations=14) & ~grown & solid9
cheek = np.median(a9[ring][:, :3], axis=0) * 0.92
blind = a9.copy()
blind[grown, :3] = cheek.astype(np.uint8)
p_blind = os.path.join(tmp, "no-eyes.png")
Image.fromarray(blind, "RGBA").save(p_blind)
r_blind = J.score_image(p_blind, "head", 3, 2)
ok(r_blind["verdict"] == "REJECT", f"a head with no eyes is {r_blind['verdict']}")
ok(any(f.startswith("NO FACE FOUND") for f in r_blind["fail"]),
   f"a head with no eyes must say NO FACE FOUND; it says {[f.split(':')[0] for f in r_blind['fail']]}")
ok(not any(f.startswith("LENS CORE PAINTED") for f in r_blind["fail"]),
   "a head with no eyes must not be called LENS CORE PAINTED; there is no lens")
ok(r_blind["normalise"]["faceFound"] is False, "faceFound must be False on a head with no eyes")
print(f"   no eyes: {r_blind['verdict']}, first rule {r_blind['fail'][0].split(':')[0]}")

# c. A FEATURELESS BLOB: the ruler head's silhouette filled flat grey.
rul9 = np.asarray(Image.open(os.path.join(rd, "head", "t3-2.png")).convert("RGBA")).copy()
rul9[..., :3] = np.where((rul9[..., 3:] > 0), 150, rul9[..., :3])
p_blob = os.path.join(tmp, "blob.png")
Image.fromarray(rul9, "RGBA").save(p_blob)
r_blob = J.score_image(p_blob, "head", 3, 2)
ok(r_blob["verdict"] == "REJECT" and any(f.startswith("NO FACE FOUND") for f in r_blob["fail"]),
   f"a flat grey blob must REJECT as NO FACE FOUND; got {r_blob['verdict']} {[f.split(':')[0] for f in r_blob['fail']]}")
ok(not any(f.startswith("LENS CORE PAINTED") for f in r_blob["fail"]), "a blob is not LENS CORE PAINTED")
print(f"   flat blob: {r_blob['verdict']}, rules {[f.split(':')[0] for f in r_blob['fail']]}")

# c2. A DARK PLATE ON THE CROWN. The shipped head's mouth is already lit
#     brass, so a dark hatch on the crown becomes the darkest blob crossing
#     the centre line, find_grille takes it for the mouth and light_grille
#     pins it gold above the eyes. Seen on 6 of the 62 real cuts. The judge
#     must reject it under its own name, off the importer's own masks.
hat = a9.copy()
top = int(np.where(solid9.any(1))[0][0])
cx9 = int(J.RIG["head"]["neck"][0])
plate = np.zeros(solid9.shape, bool)
plate[top + 14:top + 40, cx9 - 70:cx9 + 70] = True
plate &= solid9
hat[plate, :3] = (38, 38, 40)
p_hat = os.path.join(tmp, "crown-plate.png")
Image.fromarray(hat, "RGBA").save(p_hat)
r_hat = J.score_image(p_hat, "head", 3, 2)
ok(r_hat["normalise"]["faceFound"] is True, "the crown plate cost the head its face; the eyes are untouched")
ok(r_hat["verdict"] == "REJECT" and any(f.startswith("MOUTH MISPLACED") for f in r_hat["fail"]),
   f"a dark plate on the crown must REJECT as MOUTH MISPLACED (the importer lights it gold as the mouth); "
   f"got {r_hat['verdict']} {[f.split(':')[0] for f in r_hat['fail']]}")
print(f"   crown plate: {r_hat['verdict']}, rules {[f.split(':')[0] for f in r_hat['fail']]}, grille rows "
      f"{r_hat['paint']['lens'].get('grilleRows')} against eye row {r_hat['normalise']['face']['eyes'][0][0]}")

# d. EVERY SHIPPED HEAD keeps its face and needs little repair when the
#    importer's pass is run on it again (measured 3.3 to 9.6 percent).
heads = [r for r in shipped if r["slot"] == "head"]
ok(all(r["normalise"]["faceFound"] is True for r in heads),
   "the importer's find_eyes loses the face on a shipped head: "
   + ", ".join(f"t{r['tier']}-{r['design']}" for r in heads if r["normalise"]["faceFound"] is not True))
ok(all(r["normalise"]["repairShare"] < 0.12 for r in heads),
   "re-normalising a shipped head repairs more than 12 percent of it: "
   + ", ".join(f"t{r['tier']}-{r['design']} {r['normalise']['repairShare']:.1%}" for r in heads
               if r["normalise"]["repairShare"] >= 0.12))
ok(all(r["paint"]["lens"].get("lensMaskUnprotected") == 0 for r in heads),
   "a shipped head's lens mask is not fully inside the accent set after the pin")
ok(not any(f.startswith("LENS CORE PAINTED") for r in heads for f in r["fail"]),
   "LENS CORE PAINTED fires on a shipped head; the rule is judging the cheek again")
print(f"   8 shipped heads: faces found on {sum(r['normalise']['faceFound'] is True for r in heads)}, repair "
      f"{min(r['normalise']['repairShare'] for r in heads):.1%} to {max(r['normalise']['repairShare'] for r in heads):.1%}, "
      f"lens mask unprotected {max(r['paint']['lens'].get('lensMaskUnprotected', 0) for r in heads)} px")
# f. THE EXPOSURE LEVEL. Every shipped head darkened to level 120 (the
#    middle of the factory's own range, 110.8 to 154.1, against shipped
#    heads at 165.8 to 173.4) keeps its face, is levelled back to the shipped
#    median with the level and gain reported, counts none of that levelling
#    as repair, and raises no rule the undarkened head does not raise. And
#    the CONTROL, so the check cannot pass by accident: the importer's own
#    find_eyes, handed the dark head unlevelled, finds no pair.
DARK = 120.0
tgt_head, _ = J.shipped_level_target("head")
kept = lost_unlevelled = 0
for r in heads:
    t, d = r["tier"], r["design"]
    af = np.asarray(Image.open(part("head", t, d)).convert("RGBA")).astype(np.float32)
    ink_f = J._CUT.largest_component(af[..., 3])
    lvl0 = float(J._CUT.neutralise(af[..., :3], ink_f)[2])
    af[..., :3] = np.clip(af[..., :3] * (DARK / lvl0), 0, 255)
    p_dark = os.path.join(tmp, f"dark-t{t}-{d}.png")
    Image.fromarray(af.astype(np.uint8), "RGBA").save(p_dark)
    rd = J.score_image(p_dark, "head", t, d)
    nd = rd["normalise"]
    name = f"t{t}-{d}"
    kept += nd["faceFound"] is True
    ok(nd["faceFound"] is True,
       f"shipped head {name} darkened to level {DARK:.0f} lost its face: the importer's exposure level is not "
       f"reaching the face pass ({(rd['fail'] or [''])[0][:80]})")
    ok(nd["level"] is not None and nd["level"] < 130,
       f"the darkening of {name} did not take: the importer measures its level at {nd['level']}")
    ex = nd.get("exposure") or {}
    ok(ex.get("target") == round(tgt_head, 1) and abs(float(ex.get("gain", 0)) - tgt_head / float(nd["level"])) < 2e-3,
       f"{name}: the report's exposure ({ex}) is not target {tgt_head:.1f} over level {nd['level']}")
    ok([f.split(":")[0] for f in rd["fail"]] == [f.split(":")[0] for f in r["fail"]],
       f"{name} darkened to {DARK:.0f} raises {[f.split(':')[0] for f in rd['fail']]} where the shipped head "
       f"raises {[f.split(':')[0] for f in r['fail']]}; the level costs it a rule")
    ok(nd["repairShare"] < 0.12,
       f"{name} darkened to {DARK:.0f} reads {nd['repairShare']:.1%} repair; the levelling (a gain of "
       f"{ex.get('gain')}) is being counted as repair")
    # the control: the importer's own find_eyes on the dark head, unlevelled
    rgb_d, _g, lvl_d = J._CUT.neutralise(af[..., :3], ink_f)
    core_d = ink_f & (np.arange(ink_f.shape[0])[:, None] <= int(J.RIG["head"]["neck"][1]))
    e_dark = J._CUT.find_eyes(core_d, J.hsv_full(rgb_d)[2], nd["centreX"])
    e_lvl = J._CUT.find_eyes(core_d, J.hsv_full(J.EXPOSE(rgb_d, lvl_d, tgt_head))[2], nd["centreX"])
    lost_unlevelled += e_dark is None
    ok(e_dark is None and e_lvl is not None,
       f"{name}: the control failed; unlevelled the importer's find_eyes returns "
       f"{'a pair' if e_dark else 'None'} and levelled {'a pair' if e_lvl else 'None'}, so the check would prove "
       f"nothing about the level")
print(f"   exposure level: 8 shipped heads darkened to {DARK:.0f} keep their face on {kept}; unlevelled the "
      f"importer's own find_eyes loses the face on {lost_unlevelled} of 8; target {tgt_head:.1f}")
# e. the temp normalised files are gone
left = [f for f in os.listdir(J.NORM_TMP)] if os.path.exists(J.NORM_TMP) else []
ok(not left, f"{len(left)} normalised temp files were left under {J.NORM_TMP}")
shutil.rmtree(tmp, ignore_errors=True)

# ── 10. the unshaded rule ─────────────────────────────────────────────────
print("10. the unshaded rule")
tmp = tempfile.mkdtemp(prefix="ranker-unshaded-")
rd10 = J.ruler_dir()
cal = J.UNSHADED_CALIBRATION
bar = J.UNSHADED_BAR


def rule_names(r):
    return [f.split(":")[0] for f in r["fail"]]


# a. the bar sits in the calibrated gap, at its geometric middle
mid = (cal["outlineMax"] * cal["shadedMin"]) ** 0.5
ok(cal["outlineMax"] < bar < cal["shadedMin"],
   f"the UNSHADED bar {bar} is not inside the calibrated gap {cal['outlineMax']} to {cal['shadedMin']}")
ok(abs(bar - mid) / mid < 0.1,
   f"the UNSHADED bar {bar} is not the geometric middle of the calibrated gap ({mid:.4f}); the header says it is")
print(f"   bar {bar}: outline drawings read up to {cal['outlineMax']}, the flattest shaded render {cal['shadedMin']}, "
      f"{cal['shadedMin'] / bar:.1f}x over and {bar / cal['outlineMax']:.1f}x under")


# b. a synthetic outline drawing: the ruler's silhouette, white fill, black
#    3 px outline, no gradient anywhere. Must REJECT as UNSHADED, on a head
#    and on an arm, with the spread reported under the outline maximum.
def outline_drawing(slot, t, d):
    r = np.asarray(Image.open(os.path.join(rd10, slot, f"t{t}-{d}.png")).convert("RGBA")).copy()
    solid = r[..., 3] > 0
    ring = solid & ~J.ndimage.binary_erosion(solid, iterations=3)
    r[..., :3] = 245
    r[ring, :3] = 20
    r[..., 3] = np.where(solid, 255, 0).astype(np.uint8)
    return r


for slot, t, d in (("head", 3, 2), ("arm", 2, 1)):
    p_out = os.path.join(tmp, f"outline-{slot}-t{t}-{d}.png")
    Image.fromarray(outline_drawing(slot, t, d), "RGBA").save(p_out)
    r_out = J.score_image(p_out, slot, t, d)
    u = r_out.get("unshaded") or {}
    ok(r_out["verdict"] == "REJECT" and "UNSHADED" in rule_names(r_out),
       f"a synthetic outline drawing of the {slot} is {r_out['verdict']} with rules {rule_names(r_out)}; it must "
       f"REJECT as UNSHADED")
    ok(u.get("spread") is not None and u["spread"] <= cal["outlineMax"],
       f"the synthetic outline {slot} reads spread {u.get('spread')}; the calibrated outline maximum is {cal['outlineMax']}")
    ok("raw cut" in (u.get("measuredOn") or ""), f"the UNSHADED block on the {slot} does not say it was measured on the raw cut")
    print(f"   synthetic outline {slot} t{t}-{d}: {r_out['verdict']}, rules {rule_names(r_out)}, spread {u.get('spread')}, "
          f"flat {u.get('flatShare')}, region {u.get('regionPx')} px")

# c. the shaded shipped parts raise no UNSHADED and read above the shaded minimum
shaded = [r for r in shipped if r["slot"] != "weapon"]
lost = [f"{r['slot']} t{r['tier']}-{r['design']}" for r in shaded if "UNSHADED" in rule_names(r)]
ok(not lost, "UNSHADED fires on shaded shipped parts: " + ", ".join(lost))
low = [(f"{r['slot']} t{r['tier']}-{r['design']}", r["unshaded"]["spread"]) for r in shaded
       if r["unshaded"]["spread"] is None or r["unshaded"]["spread"] <= cal["shadedMin"]]
ok(not low, f"shaded shipped parts read at or under the calibrated shaded minimum {cal['shadedMin']}: {low}")
spreads = [r["unshaded"]["spread"] for r in shaded]
print(f"   32 shaded shipped parts: UNSHADED on {len(lost)}, spread {min(spreads):.3f} to {max(spreads):.3f} "
      f"(bar {bar})")

# d. the eight shipped weapons ARE the flat vector placeholder (check 5) and
#    must now say so under this rule's name too, without losing the other
flat_w = [r for r in shipped if r["slot"] == "weapon"]
ok(all("UNSHADED" in rule_names(r) and "IS THE PLACEHOLDER" in rule_names(r) for r in flat_w),
   "a shipped weapon (the untouched flat placeholder) does not read UNSHADED alongside IS THE PLACEHOLDER: "
   + ", ".join(f"t{r['tier']}-{r['design']} {rule_names(r)}" for r in flat_w
               if not ("UNSHADED" in rule_names(r) and "IS THE PLACEHOLDER" in rule_names(r))))
print(f"   8 shipped weapons (flat vector clay): spread {max(r['unshaded']['spread'] for r in flat_w):.4f} at most, "
      f"UNSHADED and IS THE PLACEHOLDER on all {sum('UNSHADED' in rule_names(r) for r in flat_w)}")

# e. the 40 rulers carry the contract's own ramp and must raise none
rul_lost = [f"{r['slot']} t{r['tier']}-{r['design']}" for r in rul if "UNSHADED" in rule_names(r)]
ok(not rul_lost, "UNSHADED fires on the contract's own placeholder, which carries the light ramp: " + ", ".join(rul_lost))
print(f"   40 rulers: UNSHADED on {len(rul_lost)}, spread {min(r['unshaded']['spread'] for r in rul):.3f} and up")

# f. exposure does not move it: head t3-2 at 70 percent brightness
a10 = np.asarray(Image.open(part("head", 3, 2)).convert("RGBA")).astype(np.float32)
a10[..., :3] = np.clip(a10[..., :3] * 0.7, 0, 255)
p_dim = os.path.join(tmp, "dim-head.png")
Image.fromarray(a10.astype(np.uint8), "RGBA").save(p_dim)
s_full = base9["unshaded"]["spread"]
s_dim = J.score_image(p_dim, "head", 3, 2)["unshaded"]["spread"]
ok(abs(s_dim - s_full) / s_full < 0.03,
   f"the spread moved with exposure: {s_full:.4f} at the shipped level, {s_dim:.4f} at 70 percent; it is relative to "
   f"the median and must not")
print(f"   exposure: head t3-2 spread {s_full:.4f} shipped, {s_dim:.4f} at 70 percent brightness")

# g. the CSV carries the measure
out10 = os.path.join(tmp, "report")
J._report([r_out, base9], out10, False, None)
with open(os.path.join(out10, "report.csv"), encoding="utf-8") as fh:
    head_row = fh.readline().strip().split(",")
    body_rows = [l.strip().split(",") for l in fh if l.strip()]
ok("shadeSpread" in head_row and "shadeBar" in head_row and "shadeFlatShare" in head_row,
   f"report.csv has no shadeSpread / shadeBar / shadeFlatShare column: {head_row}")
if "shadeSpread" in head_row:
    col = head_row.index("shadeSpread")
    vals = sorted(float(r[col]) for r in body_rows)
    ok(vals[0] <= cal["outlineMax"] and vals[-1] > bar,
       f"report.csv shadeSpread reads {vals}; the outline arm should sit under {cal['outlineMax']} and the shipped head over {bar}")
print(f"   report.csv: shadeSpread column present, outline arm {vals[0]} and shipped head {vals[-1]}")
shutil.rmtree(tmp, ignore_errors=True)

# ── 11. the coral sole ────────────────────────────────────────────────────
print("11. the coral sole")
tmp = tempfile.mkdtemp(prefix="ranker-coral-")
ccal = J.CORAL_CALIBRATION
ok(ccal["liveSpillMax"] < J.CORAL_SPILL_BAR < ccal["factorySpillMin"],
   f"the CORAL SPILL bar {J.CORAL_SPILL_BAR} is not inside the calibrated gap {ccal['liveSpillMax']} to {ccal['factorySpillMin']}")
cmid = (ccal["liveSpillMax"] * ccal["factorySpillMin"]) ** 0.5
ok(abs(J.CORAL_SPILL_BAR - cmid) / cmid < 0.1,
   f"the CORAL SPILL bar {J.CORAL_SPILL_BAR} is not the geometric middle of the calibrated gap ({cmid:.4f})")
print(f"   bar {J.CORAL_SPILL_BAR}: live legs read up to {ccal['liveSpillMax']}, the cleanest production leg "
      f"{ccal['factorySpillMin']}, {ccal['factorySpillMin'] / J.CORAL_SPILL_BAR:.1f}x over and "
      f"{J.CORAL_SPILL_BAR / ccal['liveSpillMax']:.1f}x under")

# a. the eight live legs: one clean sole each, no rule
legs = [r for r in shipped if r["slot"] == "leg"]
lost = [f"t{r['tier']}-{r['design']} {rule_names(r)}" for r in legs
        if "CORAL SPILL" in rule_names(r) or "NO SOLE" in rule_names(r)]
ok(not lost, "CORAL SPILL or NO SOLE fires on a live leg: " + ", ".join(lost))
spills = [r["paint"]["coral"]["spill"] for r in legs]
soles = [r["paint"]["coral"]["soleFrac"] for r in legs]
ok(max(spills) <= ccal["liveSpillMax"] + 1e-9 and min(soles) >= J.SOLE_MIN,
   f"the live legs read spill {max(spills)} (calibrated max {ccal['liveSpillMax']}) and sole {min(soles)} (floor {J.SOLE_MIN})")
ok(all(r["paint"]["coral"]["blobs"] == 1 for r in legs),
   "a live leg's coral is not one blob: " + ", ".join(f"t{r['tier']}-{r['design']} {r['paint']['coral']['blobs']}" for r in legs))
print(f"   8 live legs: spill {min(spills):.4f} to {max(spills):.4f}, sole {min(soles):.2f} to {max(soles):.2f} of the leg, "
      f"one coral blob each, no rule")

# b. drips above the sole: the live leg t1-2 with three coral blobs and a rim
#    painted between the sole and the shaft, inside pin_coral's own band
#    (the lower 45 percent), so the importer pins them and they would ship
a11 = np.asarray(Image.open(part("leg", 1, 2)).convert("RGBA")).copy()
ink11 = J._CUT.largest_component(a11[..., 3])
ys11 = np.where(ink11.any(1))[0]
y0l, y1l = int(ys11[0]), int(ys11[-1])
hl = y1l - y0l + 1
base11 = J.score_image(part("leg", 1, 2), "leg", 1, 2)
sole_top = y1l - base11["paint"]["coral"]["soleRows"]
coral_rgb = np.array([0xB4, 0x6D, 0x52], np.uint8)
drip = np.zeros_like(ink11)
yy11, xx11 = np.mgrid[0:ink11.shape[0], 0:ink11.shape[1]]
xs11 = np.where(ink11[sole_top - 12].astype(bool))[0]
for k in range(3):
    cxk = int(xs11[0] + (xs11[-1] - xs11[0]) * (0.25 + 0.25 * k))
    drip |= (yy11 - (sole_top - 11)) ** 2 + (xx11 - cxk) ** 2 <= 8 ** 2
drip[sole_top - 22:sole_top - 19, xs11[0] + 4:xs11[-1] - 4] = True
drip &= ink11 & (yy11 >= y0l + 0.55 * hl) & (yy11 < sole_top - 2)
a11[drip, :3] = coral_rgb
p_drip = os.path.join(tmp, "coral-drips.png")
Image.fromarray(a11, "RGBA").save(p_drip)
r_drip = J.score_image(p_drip, "leg", 1, 2)
c_drip = r_drip["paint"]["coral"]
ok(int(drip.sum()) >= 300, f"the drip injury is only {int(drip.sum())} px; it has to be visible")
ok(r_drip["verdict"] == "REJECT" and "CORAL SPILL" in rule_names(r_drip),
   f"a live leg with coral drips above its sole is {r_drip['verdict']} with rules {rule_names(r_drip)}; it must REJECT as CORAL SPILL")
ok(c_drip["spill"] is not None and c_drip["spill"] > J.CORAL_SPILL_BAR and c_drip["rowsAbove"] >= 3,
   f"the drips read spill {c_drip['spill']} on {c_drip['rowsAbove']} rows above the sole; the bar is {J.CORAL_SPILL_BAR}")
ok(abs(c_drip["soleFrac"] - base11["paint"]["coral"]["soleFrac"]) < 0.03,
   f"the drips moved the sole band from {base11['paint']['coral']['soleFrac']} to {c_drip['soleFrac']}; the band is the bottom block, not the drips")
print(f"   drips ({int(drip.sum())} px painted): {r_drip['verdict']}, rules {rule_names(r_drip)}, spill {c_drip['spill']} on "
      f"{c_drip['rowsAbove']} rows above a {c_drip['soleFrac']:.2f} sole, {c_drip['blobs']} blobs")

# c. the sole wiped to clay: NO SOLE
a11b = np.asarray(Image.open(part("leg", 1, 2)).convert("RGBA")).copy()
_, _, m11 = J.normalise_as_shipped(a11b, "leg", 1)
shoe11 = m11["shoe"]
ok(shoe11 is not None and shoe11.sum() > 1000, "the importer finds no shoe on the live leg t1-2")
lum = a11b[..., :3].astype(np.float32).mean(2)
clay_ref = np.median(a11b[ink11 & ~shoe11][:, :3].astype(np.float32), axis=0)
k = np.clip(lum / max(float(np.median(lum[shoe11])), 1e-3), 0.4, 1.4)
for c in range(3):
    a11b[..., c] = np.where(shoe11, np.clip(clay_ref[c] * k, 0, 255), a11b[..., c]).astype(np.uint8)
p_bare = os.path.join(tmp, "no-sole.png")
Image.fromarray(a11b, "RGBA").save(p_bare)
r_bare = J.score_image(p_bare, "leg", 1, 2)
ok(r_bare["verdict"] == "REJECT" and "NO SOLE" in rule_names(r_bare),
   f"a live leg with its sole wiped to clay is {r_bare['verdict']} with rules {rule_names(r_bare)}; it must REJECT as NO SOLE")
print(f"   sole wiped: {r_bare['verdict']}, rules {rule_names(r_bare)}, coral {r_bare['paint']['coral']['coralPx']} px")

# d. the CSV carries it
out11 = os.path.join(tmp, "report")
J._report([r_drip, base11], out11, False, None)
with open(os.path.join(out11, "report.csv"), encoding="utf-8") as fh:
    head_row = fh.readline().strip().split(",")
    body_rows = [l.strip().split(",") for l in fh if l.strip()]
ok("coralSpill" in head_row and "soleFrac" in head_row, f"report.csv has no coralSpill / soleFrac column: {head_row}")
if "coralSpill" in head_row:
    col = head_row.index("coralSpill")
    vals = sorted(float(r[col]) for r in body_rows)
    ok(vals[0] <= ccal["liveSpillMax"] and vals[-1] > J.CORAL_SPILL_BAR,
       f"report.csv coralSpill reads {vals}; the live leg should sit under {ccal['liveSpillMax']} and the drips over {J.CORAL_SPILL_BAR}")
    print(f"   report.csv: coralSpill column present, live leg {vals[0]} and drips {vals[-1]}")
shutil.rmtree(tmp, ignore_errors=True)

# ── 12. the third eye and the eye size ────────────────────────────────────
print("12. the third eye and the eye size")
tmp = tempfile.mkdtemp(prefix="ranker-third-eye-")
tcal = J.THIRD_EYE_CALIBRATION
ok(max(tcal["liveMax"], tcal["factoryCleanMax"]) < J.THIRD_EYE_BAR < tcal["factoryThirdEyeMin"],
   f"the THIRD EYE bar {J.THIRD_EYE_BAR} is not inside the calibrated gap "
   f"{max(tcal['liveMax'], tcal['factoryCleanMax'])} to {tcal['factoryThirdEyeMin']}")
print(f"   bar {J.THIRD_EYE_BAR} px: shipped heads read up to {tcal['liveMax']}, clean production heads up to "
      f"{tcal['factoryCleanMax']}, three-eyed ones {tcal['factoryThirdEyeMin']} and up "
      f"({tcal['factoryThirdEyeMin'] / J.THIRD_EYE_BAR:.1f}x over, {J.THIRD_EYE_BAR / max(tcal['liveMax'], tcal['factoryCleanMax']):.1f}x under)")

# a. the eight shipped heads: no THIRD EYE, under the bar, eyes in the shipped range
heads12 = [r for r in shipped if r["slot"] == "head"]
lost = [f"t{r['tier']}-{r['design']}" for r in heads12 if "THIRD EYE" in rule_names(r)]
ok(not lost, "THIRD EYE fires on a shipped head: " + ", ".join(lost))
te_px = [r["paint"]["lens"]["thirdEye"]["px"] for r in heads12]
ok(max(te_px) <= tcal["liveMax"], f"a shipped head reads {max(te_px)} px above the eye line; the calibrated live max is {tcal['liveMax']}")
es = [r["fit"]["eyeSize"]["rOverW"] for r in heads12]
ok(all(e is not None and J.EYE_SIZE_WARN <= e <= J.EYE_SIZE_FULL + 0.01 for e in es),
   f"a shipped head's eye size is outside the calibrated shipped range or under the SMALL EYES line: {es}")
ok(not any("SMALL EYES" in w for r in heads12 for w in r["warn"]), "SMALL EYES fires on a shipped head")
print(f"   8 shipped heads: THIRD EYE on 0, {min(te_px)} to {max(te_px)} px above the eye line; eye size "
      f"{min(es):.3f} to {max(es):.3f} of head width")

# b. the score is calibrated and monotone
ok(J.eye_size_score(J.EYE_SIZE_FLOOR) == 0.0 and J.eye_size_score(J.EYE_SIZE_FULL) == 1.0
   and J.eye_size_score(None) == 0.0 and 0 < J.eye_size_score((J.EYE_SIZE_FLOOR + J.EYE_SIZE_FULL) / 2) < 1
   and J.eye_size_score(0.02) == 0.0 and J.eye_size_score(0.2) == 1.0,
   "eye_size_score is not 0 at the floor, 1 at full and clamped outside")

# c. a bright disc in a dark bezel above the eye line on the shipped head t3-2
a12 = np.asarray(Image.open(part("head", 3, 2)).convert("RGBA")).copy()
base12 = J.score_image(part("head", 3, 2), "head", 3, 2)
f12 = base12["normalise"]["face"]
# A SHIPPED HEAD'S MOUTH IS ALREADY LIT BRASS, so the darkest blob crossing the
# centre line is whatever the injury draws, find_grille takes THAT for the
# mouth and MOUTH MISPLACED rejects it before THIRD EYE is asked (the crown
# plate case in check 9 is exactly that). A factory cut arrives with a dark
# mouth. So both head injuries first put the real mouth back to dark (the
# importer's own grille mask, taken to value 0.15) so find_grille keeps it,
# light_grille re-lights it, and the thing above the eyes is left to THIRD EYE.
# (the importer's own find_grille finds no mouth on a SHIPPED head, because
# the shipped mouth is already lit: so the shipped mouth is read by the law's
# brass band, the band light_grille put it in, below the eyes on the centre line)
_h12, _s12, _v12 = J.hsv_full(a12[..., :3].astype(np.float64))
_bb = J.LAW["accents"]["brass"]
_metal12 = ((_h12 >= _bb["hueMin"]) & (_h12 <= _bb["hueMax"]) & (_s12 >= _bb["satMin"]) & (_v12 > _bb["valueMin"])
            & (a12[..., 3] >= J.OPAQUE))
_yy, _xx = np.mgrid[0:a12.shape[0], 0:a12.shape[1]]
_below = (_yy > f12["eyes"][0][0] + f12["r"]) & (np.abs(_xx - J.RIG["head"]["neck"][0]) < 90)
_lab, _n = J.ndimage.label(_metal12 & _below)
_sizes = np.bincount(_lab.ravel())[1:] if _n else np.array([])
mouth12 = (_lab == (int(_sizes.argmax()) + 1)) if _n else None
ok(mouth12 is not None and mouth12.sum() > 1000,
   f"no lit brass mouth found below the eyes on the shipped head t3-2 ({0 if mouth12 is None else int(mouth12.sum())} px)")
def dark_mouth(arr):
    arr = arr.copy()
    lum = arr[..., :3].astype(np.float32).mean(2)
    k = np.clip(lum / max(float(np.median(lum[mouth12])), 1e-3), 0.6, 1.4)
    for c in range(3):
        arr[..., c] = np.where(mouth12, np.clip(38 * k, 0, 255), arr[..., c]).astype(np.uint8)
    return arr
a12 = dark_mouth(a12)
r_dm = J.score_image((lambda q: (Image.fromarray(a12, "RGBA").save(q), q)[1])(os.path.join(tmp, "dark-mouth.png")), "head", 3, 2)
ok(r_dm["normalise"]["faceFound"] is True and "MOUTH MISPLACED" not in rule_names(r_dm)
   and "THIRD EYE" not in rule_names(r_dm),
   f"the control failed: the shipped head with its mouth taken back to dark reads {rule_names(r_dm)}; the injuries below "
   f"would prove nothing")
print(f"   control: t3-2 with its mouth taken back to dark: {r_dm['verdict']}, rules {rule_names(r_dm)}, "
      f"{r_dm['paint']['lens']['thirdEye']['px']} px above the eye line")
cx12 = int(J.RIG["head"]["neck"][0])
ink12 = J._CUT.largest_component(a12[..., 3])
top12 = int(np.where(ink12.any(1))[0][0])
ecy12 = int(f12["eyes"][0][0])
r12 = float(f12["r"])
lens_cy = int(round(ecy12 - r12 * J._CUT.EYE_RING_R - 0.9 * r12 - 8))
yy12, xx12 = np.mgrid[0:a12.shape[0], 0:a12.shape[1]]
d12 = np.hypot(yy12 - lens_cy, xx12 - cx12)
bezel = (d12 > 0.75 * r12) & (d12 <= 0.75 * r12 + 5) & ink12
glass = (d12 <= 0.75 * r12) & ink12
a12[glass, :3] = (236, 236, 232)
a12[bezel, :3] = (52, 50, 48)
p_lens = os.path.join(tmp, "third-lens.png")
Image.fromarray(a12, "RGBA").save(p_lens)
r_lens = J.score_image(p_lens, "head", 3, 2)
ok(r_lens["normalise"]["faceFound"] is True, "the third lens cost the head its own face; the eyes are untouched")
ok(r_lens["verdict"] == "REJECT" and "THIRD EYE" in rule_names(r_lens),
   f"a shipped head with a bezelled lens above the eyes is {r_lens['verdict']} with rules {rule_names(r_lens)}; it must REJECT as THIRD EYE")
te_lens = r_lens["paint"]["lens"].get("thirdEye") or {}
ok(te_lens.get("px", 0) >= J.THIRD_EYE_BAR, f"the third lens reads {te_lens.get('px')} px against the bar {J.THIRD_EYE_BAR}")
print(f"   third lens (glass r {0.75 * r12:.0f} px, 5 px bezel, {int(bezel.sum())} bezel px): {r_lens['verdict']}, rules "
      f"{rule_names(r_lens)}, {te_lens.get('px')} px above the eye line")

# d. a small slotted grille above the eyes, smaller than the mouth so the
#    importer's find_grille keeps the real mouth and MOUTH MISPLACED stays silent
a12g = dark_mouth(np.asarray(Image.open(part("head", 3, 2)).convert("RGBA")))
gy0 = lens_cy - 7
slot = np.zeros_like(ink12)
slot[gy0:gy0 + 14, cx12 - 30:cx12 + 30] = True
for k in range(4):
    slot[gy0 + 1 + k * 4:gy0 + 3 + k * 4, cx12 - 28:cx12 + 28] = False
slot &= ink12
a12g[slot, :3] = (40, 38, 36)
p_grille = os.path.join(tmp, "third-grille.png")
Image.fromarray(a12g, "RGBA").save(p_grille)
r_grille = J.score_image(p_grille, "head", 3, 2)
ok(r_grille["normalise"]["faceFound"] is True, "the small grille cost the head its face")
ok("MOUTH MISPLACED" not in rule_names(r_grille),
   f"the small grille was taken for the mouth ({rule_names(r_grille)}); the case needs THIRD EYE to do the work, make the slot smaller")
ok(r_grille["verdict"] == "REJECT" and "THIRD EYE" in rule_names(r_grille),
   f"a shipped head with a slotted grille above the eyes is {r_grille['verdict']} with rules {rule_names(r_grille)}; it must REJECT as THIRD EYE")
te_g = r_grille["paint"]["lens"].get("thirdEye") or {}
print(f"   small grille ({int(slot.sum())} px of slats): {r_grille['verdict']}, rules {rule_names(r_grille)}, {te_g.get('px')} px above the eye line")

# e. pinhole eyes: the shipped head's lenses filled with cheek clay and a
#    small lit dot in a dark ring drawn at each eye centre. The importer must
#    still find the pair, the report must say SMALL EYES, and the fit axis
#    must drop against the head with its own eyes.
a12p = np.asarray(Image.open(part("head", 3, 2)).convert("RGBA")).copy()
_, _, m12 = J.normalise_as_shipped(a12p, "head", 3)
grown = J.ndimage.binary_dilation(m12["eye"], iterations=8)
ring = J.ndimage.binary_dilation(grown, iterations=12) & ~grown & (a12p[..., 3] >= J.OPAQUE)
cheek = np.median(a12p[ring][:, :3], axis=0)
a12p[grown, :3] = cheek.astype(np.uint8)
for (ey, ex) in f12["eyes"]:
    dd = np.hypot(yy12 - ey, xx12 - ex)
    a12p[(dd <= 11) & ink12, :3] = (250, 244, 232)
    a12p[(dd > 11) & (dd <= 15) & ink12, :3] = (60, 58, 56)
p_pin = os.path.join(tmp, "pinhole-eyes.png")
Image.fromarray(a12p, "RGBA").save(p_pin)
r_pin = J.score_image(p_pin, "head", 3, 2)
ok(r_pin["normalise"]["faceFound"] is True,
   f"the importer lost the face on the pinhole head ({(r_pin['fail'] or [''])[0][:80]}); the case needs a found pair")
es_pin = (r_pin["fit"].get("eyeSize") or {})
ok(es_pin.get("rOverW") is not None and es_pin["rOverW"] < J.EYE_SIZE_WARN,
   f"the pinhole eyes read {es_pin.get('rOverW')} of head width; the case needs them under the SMALL EYES line {J.EYE_SIZE_WARN}")
ok(any(w.startswith("SMALL EYES") for w in r_pin["warn"]), f"the pinhole head does not say SMALL EYES: {r_pin['warn']}")
ok(r_pin["axes"]["fit"] < base12["axes"]["fit"] - 0.05,
   f"the pinhole head scores fit {r_pin['axes']['fit']} against the shipped {base12['axes']['fit']}; the soft term must cost it")
ok("THIRD EYE" not in rule_names(r_pin),
   f"THIRD EYE fires on the pinhole head ({rule_names(r_pin)}); its dark rings are the eyes' own bezels and must be kept out")
print(f"   pinhole eyes: face found, r {es_pin.get('r')} px = {es_pin.get('rOverW')} of head width (shipped "
      f"{base12['fit']['eyeSize']['rOverW']}), SMALL EYES said, fit {base12['axes']['fit']:.3f} -> {r_pin['axes']['fit']:.3f}, "
      f"rules {rule_names(r_pin)}")

# f. the CSV carries both
out12 = os.path.join(tmp, "report")
J._report([r_lens, base12, r_pin], out12, False, None)
with open(os.path.join(out12, "report.csv"), encoding="utf-8") as fh:
    head_row = fh.readline().strip().split(",")
    body_rows = [l.strip().split(",") for l in fh if l.strip()]
ok("thirdEyePx" in head_row and "eyeSize" in head_row, f"report.csv has no thirdEyePx / eyeSize column: {head_row}")
if "thirdEyePx" in head_row:
    col = head_row.index("thirdEyePx")
    vals = sorted(float(r[col]) for r in body_rows if r[col])
    ok(vals[0] <= tcal["liveMax"] and vals[-1] >= J.THIRD_EYE_BAR,
       f"report.csv thirdEyePx reads {vals}; the shipped head should sit under {tcal['liveMax']} and the third lens over {J.THIRD_EYE_BAR}")
    col2 = head_row.index("eyeSize")
    vals2 = sorted(float(r[col2]) for r in body_rows if r[col2])
    print(f"   report.csv: thirdEyePx {vals[0]} to {vals[-1]}, eyeSize {vals2[0]} to {vals2[-1]}")
shutil.rmtree(tmp, ignore_errors=True)

# ── 13. eye size is a hard rule under the floor ───────────────────────────
print("13. eye size is a hard rule under the floor")
tmp = tempfile.mkdtemp(prefix="ranker-eye-size-")
ecal = J.EYE_SIZE_CALIBRATION
ok(J.EYE_SIZE_FLOOR < J.EYE_SIZE_WARN < ecal["liveMin"],
   f"the floor {J.EYE_SIZE_FLOOR} does not sit under the SMALL EYES line {J.EYE_SIZE_WARN} and the shipped minimum {ecal['liveMin']}")
ok(all(v < J.EYE_SIZE_FLOOR for v in ecal["falseSurvivors"].values()),
   f"a cyclops pair that passed is not under the floor: {ecal['falseSurvivors']}")
heads13 = [r for r in shipped if r["slot"] == "head"]
es13 = [r["fit"]["eyeSize"]["rOverW"] for r in heads13]
ok(min(es13) >= J.EYE_SIZE_FLOOR and not any("EYE SIZE" in rule_names(r) for r in heads13),
   f"EYE SIZE fires on a shipped head, or one sits under the floor: {es13}")
print(f"   floor {J.EYE_SIZE_FLOOR}: the shipped heads read {min(es13):.3f} to {max(es13):.3f}, the SMALL EYES line is "
      f"{J.EYE_SIZE_WARN}, the two cyclops pairs that passed read {sorted(ecal['falseSurvivors'].values())}")

# the injuries below start from the shipped head t3-2 with its mouth back to
# dark (check 12's move: a shipped mouth is already lit, so find_grille would
# otherwise take whatever the injury draws for the mouth)
a13 = np.asarray(Image.open(part("head", 3, 2)).convert("RGBA")).copy()
base13 = J.score_image(part("head", 3, 2), "head", 3, 2)
f13 = base13["normalise"]["face"]
_h13, _s13, _v13 = J.hsv_full(a13[..., :3].astype(np.float64))
_bb13 = J.LAW["accents"]["brass"]
_metal13 = ((_h13 >= _bb13["hueMin"]) & (_h13 <= _bb13["hueMax"]) & (_s13 >= _bb13["satMin"])
            & (_v13 > _bb13["valueMin"]) & (a13[..., 3] >= J.OPAQUE))
yy13, xx13 = np.mgrid[0:a13.shape[0], 0:a13.shape[1]]
cx13 = int(J.RIG["head"]["neck"][0])
ecy13 = int(f13["eyes"][0][0])
_below13 = (yy13 > ecy13 + f13["r"]) & (np.abs(xx13 - cx13) < 90)
_lab13, _n13 = J.ndimage.label(_metal13 & _below13)
_sizes13 = np.bincount(_lab13.ravel())[1:] if _n13 else np.array([])
mouth13 = (_lab13 == (int(_sizes13.argmax()) + 1)) if _n13 else None
ok(mouth13 is not None and mouth13.sum() > 1000, "no lit brass mouth found below the eyes on the shipped head t3-2")
ink13 = J._CUT.largest_component(a13[..., 3])
_, _, m13 = J.normalise_as_shipped(a13, "head", 3)


def dark_mouth13(arr):
    arr = arr.copy()
    lum = arr[..., :3].astype(np.float32).mean(2)
    k = np.clip(lum / max(float(np.median(lum[mouth13])), 1e-3), 0.6, 1.4)
    for c in range(3):
        arr[..., c] = np.where(mouth13, np.clip(38 * k, 0, 255), arr[..., c]).astype(np.uint8)
    return arr


def pinholes13(arr, lit_r, ring_w):
    """the shipped lenses filled with cheek clay, a lit dot of radius lit_r in
    a dark ring ring_w wide drawn at each eye centre; the importer's
    socket_radius then measures the socket it finds"""
    arr = arr.copy()
    grown = J.ndimage.binary_dilation(m13["eye"], iterations=8)
    ring = J.ndimage.binary_dilation(grown, iterations=12) & ~grown & (arr[..., 3] >= J.OPAQUE)
    cheek = np.median(arr[ring][:, :3], axis=0)
    arr[grown, :3] = cheek.astype(np.uint8)
    for (ey, ex) in f13["eyes"]:
        dd = np.hypot(yy13 - ey, xx13 - ex)
        arr[(dd <= lit_r) & ink13, :3] = (250, 244, 232)
        arr[(dd > lit_r) & (dd <= lit_r + ring_w) & ink13, :3] = (60, 58, 56)
    return arr


# a dark drawn at value 0.36: over find_grille's 0.32, so it is never taken
# for the mouth, and 0.34 under the clay, past THIRD_EYE_DEPTH
DARK13 = (92, 90, 88)


def pupil13(arr, rad, dy=0):
    arr = arr.copy()
    dd = np.hypot(yy13 - (ecy13 + dy), xx13 - cx13)
    arr[(dd <= rad) & ink13, :3] = DARK13
    return arr


def bezel13(arr, rad, bezel, dy=0):
    arr = arr.copy()
    dd = np.hypot(yy13 - (ecy13 + dy), xx13 - cx13)
    arr[(dd <= rad) & ink13, :3] = (236, 236, 232)
    arr[(dd > rad) & (dd <= rad + bezel) & ink13, :3] = DARK13
    return arr


def bar13(arr, half_w, half_h, dy=0):
    arr = arr.copy()
    m = (np.abs(yy13 - (ecy13 + dy)) <= half_h) & (np.abs(xx13 - cx13) <= half_w) & ink13
    arr[m, :3] = DARK13
    return arr


def score13(name, arr):
    p = os.path.join(tmp, name + ".png")
    Image.fromarray(arr, "RGBA").save(p)
    return J.score_image(p, "head", 3, 2)


def row_of(r):
    return ((r.get("paint") or {}).get("lens") or {}).get("thirdEye", {}).get("row") or {}


base13d = dark_mouth13(a13)
r_ctl13 = score13("control", base13d)
ok(r_ctl13["verdict"] == "RANKED" and r_ctl13["normalise"]["faceFound"] is True,
   f"the control failed: t3-2 with its mouth taken back to dark reads {r_ctl13['verdict']} {rule_names(r_ctl13)}")

# b. pinholes under the floor: lit radius 11 in a 4 px ring reads about 0.023 of head width
r_pin13 = score13("pinholes-under-floor", pinholes13(base13d, 11, 4))
es_pin13 = (r_pin13["fit"].get("eyeSize") or {})
ok(r_pin13["normalise"]["faceFound"] is True,
   f"the importer lost the face on the pinhole head ({(r_pin13['fail'] or [''])[0][:80]}); the case needs a found pair, that is the point")
ok(es_pin13.get("rOverW") is not None and es_pin13["rOverW"] < J.EYE_SIZE_FLOOR,
   f"the pinhole eyes read {es_pin13.get('rOverW')} of head width; the case needs them under the floor {J.EYE_SIZE_FLOOR}")
ok(r_pin13["verdict"] == "REJECT" and "EYE SIZE" in rule_names(r_pin13),
   f"a head whose found pair is under the floor is {r_pin13['verdict']} with rules {rule_names(r_pin13)}; it must REJECT as EYE SIZE")
ok(any(w.startswith("SMALL EYES") for w in r_pin13["warn"]), "the pinhole head no longer says SMALL EYES")
ok("THIRD EYE" not in rule_names(r_pin13),
   f"THIRD EYE fires on the plain pinhole head ({rule_names(r_pin13)}); nothing sits on its row")
print(f"   pinholes under the floor: r {es_pin13.get('r')} px = {es_pin13.get('rOverW')} of head width, face found, "
      f"{r_pin13['verdict']}, rules {rule_names(r_pin13)}")

# c. the same injury at a legal small size: SMALL EYES only, still RANKED
r_leg13 = score13("pinholes-legal", pinholes13(base13d, 18, 4))
es_leg13 = (r_leg13["fit"].get("eyeSize") or {})
ok(es_leg13.get("rOverW") is not None and J.EYE_SIZE_FLOOR <= es_leg13["rOverW"] < J.EYE_SIZE_WARN,
   f"the legal small eyes read {es_leg13.get('rOverW')}; the case needs them between the floor and the SMALL EYES line")
ok(r_leg13["verdict"] == "RANKED" and "EYE SIZE" not in rule_names(r_leg13)
   and any(w.startswith("SMALL EYES") for w in r_leg13["warn"]),
   f"a head with legal small eyes is {r_leg13['verdict']} with rules {rule_names(r_leg13)}; it must stay RANKED with SMALL EYES only")
print(f"   legal small eyes: r {es_leg13.get('r')} px = {es_leg13.get('rOverW')}, {r_leg13['verdict']}, SMALL EYES said, no rule")

# d. the CSV's firstFail carries it
out13 = os.path.join(tmp, "report")
J._report([r_pin13, r_ctl13], out13, False, None)
with open(os.path.join(out13, "report.csv"), encoding="utf-8") as fh:
    head_row = fh.readline().strip().split(",")
    body_rows = [l.strip().split(",") for l in fh if l.strip()]
col = head_row.index("firstFail")
ok("EYE SIZE" in [r[col] for r in body_rows], f"report.csv firstFail carries no EYE SIZE: {[r[col] for r in body_rows]}")

# e. the production pools, when they are on this machine
PROD = os.path.join(ROOT, ".bots-preview", "sd-production")
CYCLOPS = {
    "piston": os.path.join(PROD, "renders", "stage4-heads-clear", "head-t3-2", "cut",
                           "head-t3-2_lineart_s0.70_e1.00_cfg5.0_st30_dpmpp_2m_karras_seed1003_ip0.60_head-2.png"),
    "anvil": os.path.join(PROD, "renders", "stage4-heads-clear", "head-t4-2", "cut",
                          "head-t4-2_lineart_s0.70_e1.00_cfg5.0_st30_dpmpp_2m_karras_seed1003_ip0.60_head-2.png"),
}
pools_here = all(os.path.exists(p) for p in CYCLOPS.values()) and all(
    os.path.exists(os.path.join(PROD, "manifest", f"head-t{t}-1.json")) for t in J.TIERS)
cyc13 = {}
if pools_here:
    for name, p in CYCLOPS.items():
        r = J.score_image(p, "head", int(os.path.basename(p)[6]), 2)
        cyc13[name] = r
        ok(r["verdict"] == "REJECT" and "EYE SIZE" in rule_names(r),
           f"the false survivor {name} is {r['verdict']} with rules {rule_names(r)}; it must REJECT as EYE SIZE")
        print(f"   {name} (the false survivor): {r['verdict']}, rules {rule_names(r)}, eye "
              f"{r['fit']['eyeSize']['rOverW']} of head width, composite {r['composite']}")
    for t in J.TIERS:
        m = json.load(open(os.path.join(PROD, "manifest", f"head-t{t}-1.json"), encoding="utf-8"))
        f = os.path.join(ROOT, m["proof"]["judgedFile"].replace("\\", "/"))
        if not os.path.exists(f):
            notes.append(f"check 13: the manifest winner head-t{t}-1's judged cut is not on this machine")
            continue
        r = J.score_image(f, "head", t, 1)
        ok(r["verdict"] == "RANKED" and abs(r["composite"] - m["proof"]["composite"]) < 0.005,
           f"the manifest winner head-t{t}-1 now reads {r['verdict']} {r['composite']} {rule_names(r)} against the "
           f"manifest's RANKED {m['proof']['composite']}")
        print(f"   manifest winner head-t{t}-1: {r['verdict']} at {r['composite']} (manifest {m['proof']['composite']}), "
              f"eye {r['fit']['eyeSize']['rOverW']}")
else:
    notes.append("checks 13 and 14: the production pools are not on this machine; the two false survivors, the "
                 "four manifest winners and the design-1 survivors were not re-judged")
shutil.rmtree(tmp, ignore_errors=True)

# ── 14. the third eye on the eye row ──────────────────────────────────────
print("14. the third eye on the eye row")
tmp = tempfile.mkdtemp(prefix="ranker-third-eye-row-")
rcal = J.THIRD_EYE_ROW_CALIBRATION
mid = (rcal["cleanMaxOverW"] * rcal["cyclopsOverW"][0]) ** 0.5
ok(rcal["cleanMaxOverW"] < J.THIRD_EYE_ROW_MIN < rcal["cyclopsOverW"][0],
   f"the row minimum {J.THIRD_EYE_ROW_MIN} is not inside the calibrated gap {rcal['cleanMaxOverW']} to {rcal['cyclopsOverW'][0]}")
ok(abs(J.THIRD_EYE_ROW_MIN - mid) / mid < 0.1,
   f"the row minimum {J.THIRD_EYE_ROW_MIN} is not the geometric middle of the gap ({mid:.4f}); the header says it is")
ok(J.THIRD_EYE_ROW_OVER_EYE == 2.0, "the row's second arm is not twice the found eye radius")
print(f"   minimum {J.THIRD_EYE_ROW_MIN} of head width: clean heads read up to {rcal['cleanMaxOverW']} on the row, the "
      f"cyclops that passed {rcal['cyclopsOverW'][0]} and up ({rcal['cyclopsOverW'][0] / J.THIRD_EYE_ROW_MIN:.2f}x over, "
      f"{J.THIRD_EYE_ROW_MIN / rcal['cleanMaxOverW']:.2f}x under); second arm {J.THIRD_EYE_ROW_OVER_EYE:g}x the found eye")

# a. the shipped heads: nothing on the row
rows14 = [row_of(r) for r in heads13]
ok(all(rw and rw.get("fires") is False for rw in rows14), "a shipped head fires on the eye row, or carries no row block")
disc14 = [rw["discR"] for rw in rows14 if rw.get("discR") is not None]
ok(all(rw["discR"] < rw["minR"] for rw in rows14 if rw.get("discR") is not None),
   f"a shipped head carries a disc on its row at or over the minimum: {[(rw['discR'], rw['minR']) for rw in rows14]}")
print(f"   8 shipped heads: none fires on the row; discs found read {sorted(disc14)} px against minimums "
      f"{sorted(set(rw['minR'] for rw in rows14))}")

# b. the under-floor arm: pinholes under the floor and a 20 px pupil ten rows down
p11 = pinholes13(base13d, 11, 4)
r_pupil = score13("pinholes-pupil-20", pupil13(p11, 20, 10))
rw = row_of(r_pupil)
te14 = r_pupil["paint"]["lens"]["thirdEye"]
ok(r_pupil["normalise"]["faceFound"] is True, "the pupil cost the pinhole head its face")
ok(r_pupil["verdict"] == "REJECT" and "THIRD EYE" in rule_names(r_pupil) and "EYE SIZE" in rule_names(r_pupil),
   f"a pinhole head with a 20 px pupil on its row is {r_pupil['verdict']} with rules {rule_names(r_pupil)}; it must REJECT as THIRD EYE and EYE SIZE")
ok(rw.get("fires") is True and rw.get("discR") is not None and rw["discR"] >= rw["minR"] and "floor" in (rw.get("why") or ""),
   f"the row block did not fire on the floor arm: {rw}")
ok(te14["px"] < J.THIRD_EYE_BAR, f"the above-line count {te14['px']} is over its bar; the row did not do the work")
ok(any("ON THE EYE ROW" in f for f in r_pupil["fail"]), "the THIRD EYE failure does not name the row")
print(f"   pinholes + 20 px pupil: {r_pupil['verdict']}, rules {rule_names(r_pupil)}, row disc {rw['discR']} px "
      f"({rw['discOverW']} of head width, {rw['discOverEye']}x the eye) against the minimum {rw['minR']}, "
      f"{te14['px']} px above the line")

# c. controls on the same pinhole head: nothing, a pupil under the minimum, a bar
for name, arr, what in (("pinholes-alone", p11, "the pinhole head alone"),
                        ("pinholes-pupil-10", pupil13(p11, 10), "a 10 px pupil, under the minimum"),
                        ("pinholes-bar", bar13(p11, 50, 8), "a 50 by 8 dark bar, not a disc")):
    r = score13(name, arr)
    rw2 = row_of(r)
    ok("THIRD EYE" not in rule_names(r) and rw2.get("fires") is False,
       f"{what} fires THIRD EYE ({rule_names(r)}, row {rw2.get('discR')} px); it must not")
    print(f"   {what}: rules {rule_names(r)}, row disc {rw2.get('discR')} px")

# d. a lit glass in a dark bezel fires through its bezel
r_bez = score13("pinholes-bezel", bezel13(p11, 15, 4, 9))
rwb = row_of(r_bez)
ok(r_bez["verdict"] == "REJECT" and "THIRD EYE" in rule_names(r_bez) and rwb.get("fires") is True
   and rwb["discR"] >= rwb["minR"] and r_bez["paint"]["lens"]["thirdEye"]["px"] < J.THIRD_EYE_BAR,
   f"a lit glass in a dark bezel on the row reads {r_bez['verdict']} {rule_names(r_bez)}, row {rwb}; it must fire through its bezel")
print(f"   lit glass r15 in a 4 px bezel: {r_bez['verdict']}, row disc {rwb.get('discR')} px (the bezel filled), "
      f"{r_bez['paint']['lens']['thirdEye']['px']} px above the line")

# e. the twice arm: a legal small pair (about 0.034) with a 36 px pupil fires, a 24 px one does not
p16 = pinholes13(base13d, 16, 4)
r_big = score13("legal-pupil-36", pupil13(p16, 36, 16))
r_mid = score13("legal-pupil-24", pupil13(p16, 24, 12))
es16 = r_big["fit"]["eyeSize"]
rwB, rwM = row_of(r_big), row_of(r_mid)
ok(es16["rOverW"] >= J.EYE_SIZE_FLOOR and "EYE SIZE" not in rule_names(r_big),
   f"the legal small pair reads {es16['rOverW']}; the case needs it over the floor with no EYE SIZE")
ok(r_big["verdict"] == "REJECT" and "THIRD EYE" in rule_names(r_big) and rwB.get("fires") is True
   and "over" in (rwB.get("why") or "") and rwB["discOverEye"] > J.THIRD_EYE_ROW_OVER_EYE
   and r_big["paint"]["lens"]["thirdEye"]["px"] < J.THIRD_EYE_BAR,
   f"a legal pair with a 36 px pupil reads {r_big['verdict']} {rule_names(r_big)}, row {rwB}; it must fire on the 2x arm")
ok(r_mid["verdict"] == "RANKED" and rwM.get("fires") is False and rwM.get("discR") is not None
   and rwM["discR"] >= rwM["minR"] and rwM["discOverEye"] < J.THIRD_EYE_ROW_OVER_EYE,
   f"a legal pair with a 24 px pupil reads {r_mid['verdict']} {rule_names(r_mid)}, row {rwM}; a disc over the minimum but under 2x must not fire")
print(f"   legal pair r {es16['r']} px ({es16['rOverW']}): 36 px pupil {r_big['verdict']} at {rwB['discOverEye']}x, "
      f"24 px pupil {r_mid['verdict']} at {rwM['discOverEye']}x")

# f. the CSV carries the row radius
out14 = os.path.join(tmp, "report")
J._report([r_pupil, r_ctl13], out14, False, None)
with open(os.path.join(out14, "report.csv"), encoding="utf-8") as fh:
    head_row = fh.readline().strip().split(",")
    body_rows = [l.strip().split(",") for l in fh if l.strip()]
ok("thirdEyeRowR" in head_row, f"report.csv has no thirdEyeRowR column: {head_row}")
if "thirdEyeRowR" in head_row:
    col = head_row.index("thirdEyeRowR")
    vals = sorted(float(r[col]) for r in body_rows if r[col])
    ok(vals and vals[-1] >= rw["minR"], f"report.csv thirdEyeRowR reads {vals}; the pupil should sit at or over {rw['minR']}")
    print(f"   report.csv: thirdEyeRowR present, the pupil row reads {vals[-1] if vals else None}")

# g. the production pools, when they are on this machine
if pools_here:
    for name, r in cyc13.items():
        rwc = row_of(r)
        ok("THIRD EYE" in rule_names(r) and rwc.get("fires") is True and rwc["discOverW"] >= J.THIRD_EYE_ROW_MIN,
           f"the false survivor {name} does not fire on the row: {rule_names(r)} {rwc}")
        print(f"   {name}: THIRD EYE on the row, disc {rwc.get('discR')} px ({rwc.get('discOverW')} of head width, "
              f"{rwc.get('discOverEye')}x the found eye), {r['paint']['lens']['thirdEye']['px']} px above the line")
    fired, under, kept, seen = [], [], [], 0
    for t in J.TIERS:
        rep = os.path.join(PROD, "judge", f"head-t{t}-1", "report.json")
        if not os.path.exists(rep):
            continue
        for x in json.load(open(rep, encoding="utf-8"))["rows"]:
            if x["verdict"] != "RANKED":
                continue
            f = x["file"].replace("\\", "/")
            f = f if os.path.isabs(f) else os.path.join(ROOT, f)
            if not os.path.exists(f):
                continue
            r = J.score_image(f, "head", t, 1)
            seen += 1
            rwx = row_of(r)
            if rwx.get("fires"):
                fired.append(os.path.basename(f))
            if r["fit"]["eyeSize"]["rOverW"] < J.EYE_SIZE_FLOOR:
                under.append((os.path.basename(f), r["verdict"], rule_names(r)))
            elif r["verdict"] == "RANKED":
                kept.append(os.path.basename(f))
    ok(seen > 0 and not fired, f"a design-1 survivor fires on the row: {fired}")
    ok(all(v == "REJECT" and rules == ["EYE SIZE"] for _, v, rules in under),
       f"a design-1 survivor under the floor is not an EYE SIZE-only reject: {under}")
    print(f"   {seen} design-1 survivors re-judged: none fires on the row; {len(under)} under the floor now REJECT as "
          f"EYE SIZE alone; {len(kept)} still RANKED")
shutil.rmtree(tmp, ignore_errors=True)

# -- 15. the ruler seam: a shape is judged against its own drawing ---------
#
# THE SEAM. Everything above bakes its ruler from the SHIP TABLE: forty
# placeholders keyed by slot, tier and design. Measured here, those forty are
# FIVE shapes: all eight leg rulers and all eight torso rulers are pixel
# identical, the eight arms overlap 0.98 and up, and the eight heads are one
# dome. So "the ruler for a head" has meant "the dome" for as long as this
# file has existed, and a bear head, a bell head or a bucket head measured
# against the dome loses on the FIT axis for the crime of being a bear. Judge
# the shape table with that seam open and it refuses the table one shape at a
# time, which is a broken instrument reporting a confident wrong number.
#
# WHAT THIS CHECK PROVES, in order:
#   (a) THE DEFAULT CANNOT MOVE. ruler_for with no shape and no ruler path is
#       ruler(), the same cached array, in all 40 pools; and a score taken
#       with the three new arguments spelled out as None is identical, key for
#       key, to a score taken without them.
#   (b) THE SEAM IS REAL, BOTH WAYS. A bear-shaped candidate gains silhouette
#       against the bear drawing and loses it against the dome; a dome-shaped
#       candidate does the exact opposite. If only one direction moved, the
#       ruler would not be what decides.
#   (c) NO BAR MOVED. The set of hard rules that fires is IDENTICAL under both
#       rulers for both candidates. Only the fit number moves. This is the
#       whole promise: the ruler changes, the law does not.
#   (d) THE LAW TRAVELS WITH THE RULER. The bear's own clay drawing, judged
#       against the bear, REJECTS as IS THE PLACEHOLDER exactly as the dome
#       does against the dome. Judged against the dome it does NOT fire, so
#       leaving the seam open would also have let every new shape's own
#       placeholder walk into the catalogue as art. One fix, both holes.
#   (e) THE INSTRUMENT IS CHECKED BEFORE IT IS USED. A ruler on the wrong
#       canvas, one with ink on the canvas edge, one that misses the pivots
#       and one outside the contract's own proportion bands are each REFUSED,
#       not used.
#   (f) NOTHING FALLS BACK. An unknown shape id, a missing table and a missing
#       ruler file all refuse. A judge that quietly substitutes the dome when
#       it cannot find the bear is the defect this section exists to remove.
#   (g) POOLS DO NOT MERGE. Two shapes never rank against each other.
print("15. the ruler seam: a shape is judged against its own drawing")
tmp = tempfile.mkdtemp(prefix="ranker-shape-")

# the ship table's forty rulers are five shapes: the measurement the seam is for
same = {}
for s_ in J.SLOTS:
    ms = [J.ruler(s_, t, d)[..., 3] > 0 for t in J.TIERS for d in J.DESIGNS]
    ious = [float((a & b).sum()) / max(int((a | b).sum()), 1)
            for i, a in enumerate(ms) for b in ms[i + 1:]]
    same[s_] = (min(ious), float(np.median(ious)))
print("   the ship table's 8 rulers per slot, pairwise silhouette: "
      + ", ".join(f"{k} {v[0]:.3f} to 1.000" for k, v in same.items()))
ok(same["leg"][0] > 0.99 and same["torso"][0] > 0.99,
   "the leg and torso rulers were expected to be one shape each; if that has changed, re-read this check")


def _ears(a, cx_l=130, cx_r=326, cy=66, rad=45, inset=7):
    """A synthetic BEAR: two cup ears at the crown, drawn in the source's own
    clay so the light ramp is the source's ramp, with the old crown rim that
    ends up INSIDE the new silhouette healed back to clay. That healing is not
    cosmetic: a real eared head is ONE outline around head and ears, and a
    dome with a line still drawn through it reads as a face with something on
    its forehead. This is a test fixture, not art: it exists to move the
    silhouette by a known amount so the seam can be measured."""
    from scipy import ndimage as _nd
    out = a.copy()
    old = a[..., 3] > 0
    h, w = old.shape
    ys, xs = np.ogrid[:h, :w]
    ear = (((xs - cx_l) ** 2 + (ys - cy) ** 2) <= rad * rad) | (((xs - cx_r) ** 2 + (ys - cy) ** 2) <= rad * rad)
    top = int(np.where(old.any(1))[0][0])
    for y in range(h):
        e = np.where(ear[y] & ~old[y])[0]
        if not len(e):
            continue
        src = y if old[y].any() else top
        sx = np.where(old[src])[0]
        lo, hi = int(sx[0]) + inset, int(sx[-1]) - inset
        for x in e:
            k = min(max(int(x), lo), hi)
            out[y, x] = a[src, int(sx[np.abs(sx - k).argmin()])]
    new = out[..., 3] > 0
    buried = (old & ~_nd.binary_erosion(old, iterations=3)) & _nd.binary_erosion(new, iterations=3)
    src_ok = new & ~buried
    for y, x in zip(*np.where(buried)):
        c = np.where(src_ok[y])[0]
        if len(c):
            out[y, x] = out[y, int(c[np.abs(c - x).argmin()])]
    return out


def _save(a, name):
    q = os.path.join(tmp, name)
    Image.fromarray(a, "RGBA").save(q)
    return q


BEARP = ("head", 3, 1)
dome_ruler = J.ruler(*BEARP)
bear_ruler_png = _save(_ears(dome_ruler), "head-bear.png")
dome_cand = part(*BEARP)
bear_cand = _save(_ears(np.asarray(Image.open(dome_cand).convert("RGBA"))), "cand-bear.png")

# (a) the default cannot move
sameobj = all(J.ruler_for(s_, t, d) is J.ruler(s_, t, d)
              for s_ in J.SLOTS for t in J.TIERS for d in J.DESIGNS)
ok(sameobj, "ruler_for with no shape and no ruler path is not ruler() in all 40 pools")
plain = J.score_image(dome_cand, *BEARP)
spelt = J.score_image(dome_cand, *BEARP, shape=None, ruler_path=None, table=None)
ok(plain == spelt, "naming the three new arguments as None changes the score")
ok("shape" not in plain and "rulerPath" not in plain,
   "a row with no shape named still carries a shape field; reports before and after this section "
   "would not be byte-identical")
print("   default path: ruler_for is ruler() in all 40 pools, the row carries no shape field, and "
      "spelling the three new arguments as None changes nothing")

# (b) and (c) the seam is real both ways, and no bar moved


def _seam(q, rp):
    r = J.score_image(q, *BEARP, ruler_path=rp)
    return r, r["fit"]["iou"], sorted({f.split(":")[0] for f in r["fail"]})


bd, bd_iou, bd_rules = _seam(bear_cand, None)
bb, bb_iou, bb_rules = _seam(bear_cand, bear_ruler_png)
dd, dd_iou, dd_rules = _seam(dome_cand, None)
db, db_iou, db_rules = _seam(dome_cand, bear_ruler_png)
ok(bb_iou > bd_iou, f"the bear candidate does not gain silhouette against the bear ruler "
                    f"({bd_iou:.4f} against the dome, {bb_iou:.4f} against the bear)")
ok(dd_iou > db_iou, f"the dome candidate does not lose silhouette against the bear ruler "
                    f"({dd_iou:.4f} against the dome, {db_iou:.4f} against the bear)")
ok(bd_rules == bb_rules, f"the bear candidate's hard rules changed with the ruler: "
                         f"{bd_rules} against the dome, {bb_rules} against the bear")
ok(dd_rules == db_rules, f"the dome candidate's hard rules changed with the ruler: "
                         f"{dd_rules} against the dome, {db_rules} against the bear")
print(f"   bear candidate: silhouette {bd_iou:.4f} against the dome, {bb_iou:.4f} against the bear "
      f"(+{(bb_iou - bd_iou) * 100:.1f} in 100), fit {bd['axes']['fit']:.4f} -> {bb['axes']['fit']:.4f}")
print(f"   dome candidate: silhouette {dd_iou:.4f} against the dome, {db_iou:.4f} against the bear "
      f"({(db_iou - dd_iou) * 100:+.1f} in 100), fit {dd['axes']['fit']:.4f} -> {db['axes']['fit']:.4f}")
print(f"   hard rules unchanged by the swap: bear {bd_rules}, dome {dd_rules}")

# (d) the law travels with the ruler
bs, _, bs_rules = _seam(bear_ruler_png, bear_ruler_png)
bs_dome, _, bsd_rules = _seam(bear_ruler_png, None)
ok("IS THE PLACEHOLDER" in bs_rules,
   f"the bear's own clay drawing does not REJECT as IS THE PLACEHOLDER against the bear ruler: {bs_rules}")
ok("IS THE PLACEHOLDER" not in bsd_rules,
   "the bear's own clay drawing fires IS THE PLACEHOLDER against the DOME ruler, so this check "
   "proves nothing about the seam")
print(f"   the bear's own clay drawing: IS THE PLACEHOLDER against the bear {bs_rules}, "
      f"NOT against the dome {bsd_rules}. Leaving the seam open would have let every new shape's "
      f"placeholder walk in as art.")

# THE THIRD EYE BUDGET FOR AN EARED HEAD. Not a new rule and not a moved bar:
# the bar is what it was and stays there. This measures what a SHAPE spends.
# Any silhouette that rises above the eye line brings its own outline with it,
# and that outline is darker than the clay beside it, which is what THIRD EYE
# counts. The eight shipped domes spend 0 to 70 px of it. Measured here on the
# same head with cup ears of a growing radius.
budget = []
for rad in (25, 35, 45, 50, 55):
    q = _save(_ears(np.asarray(Image.open(dome_cand).convert("RGBA")), rad=rad, cy=11 + rad),
              f"ear-r{rad}.png")
    rr = J.score_image(q, *BEARP)
    px = ((rr["paint"].get("lens") or {}).get("thirdEye") or {}).get("px")
    budget.append((rad, px, any("THIRD EYE" in f for f in rr["fail"])))
ok(not budget[0][2] and budget[-1][2],
   f"the ear sweep does not straddle the THIRD EYE bar, so it measures no budget: {budget}")
big = [r for r, _, f in budget if f]
small = [r for r, _, f in budget if not f]
bar = (((J.score_image(dome_cand, *BEARP)["paint"].get("lens") or {}).get("thirdEye")) or {}).get("bar")
print(f"   THIRD EYE budget for an eared head (bar {bar} px, shipped domes spend up to 70): "
      + ", ".join(f"ear r{r} = {px} px{' FIRES' if f else ''}" for r, px, f in budget))
print(f"   so a BEAR or CAT ear rim is legal up to about r{max(small)} and fires from r{min(big)}: "
      f"the bar does not move, the ear does")

# (e) the instrument is checked before it is used


def _refuses(a, why):
    q = _save(a, why + ".png")
    try:
        J.score_image(dome_cand, *BEARP, ruler_path=q)
    except SystemExit as e:
        return str(e)
    return ""


wrong_canvas = np.zeros((J.RIG["head"]["h"] - 8, J.RIG["head"]["w"], 4), np.uint8)
wrong_canvas[10:200, 10:400] = 200
clipped = dome_ruler.copy()
clipped[0, :] = clipped[40, :]
shifted_off = np.roll(dome_ruler, -120, axis=0)
tiny = np.zeros_like(dome_ruler)
tiny[150:230, 200:260] = dome_ruler[150:230, 200:260]
guards = {
    "wrong canvas": _refuses(wrong_canvas, "wrong-canvas"),
    "ink on the edge": _refuses(clipped, "clipped"),
    "off the pivots": _refuses(shifted_off, "off-pivots"),
    "outside the bands": _refuses(tiny, "out-of-band"),
}
for k, v in guards.items():
    ok(v.startswith("rank-part REFUSES"), f"a shape ruler {k} was accepted instead of refused: {v[:120]}")
print("   the instrument is checked: " + ", ".join(f"{k} refused" for k in guards))

# (f) nothing falls back
tbl = os.path.join(tmp, "shape-table.json")
json.dump({"shapes": [{"id": "bear", "slot": "head", "ruler": "head-bear.png", "name": "Bear"}]},
          open(tbl, "w", encoding="utf-8"))
byshape = J.score_image(bear_cand, *BEARP, shape="bear", table=tbl)
ok(abs(byshape["fit"]["iou"] - bb_iou) < 1e-9,
   "resolving the bear through the shape table gives a different silhouette than naming its PNG")
ok(byshape.get("shape") == "bear" and byshape["pool"] == "head-bear-t3-1",
   f"a shape row does not name its shape or its own pool: {byshape.get('shape')} {byshape['pool']}")
noflip = []
for why, kw in (("an unknown shape id", {"shape": "narwhal", "table": tbl}),
                ("a missing table", {"shape": "bear", "table": os.path.join(tmp, "nope.json")}),
                ("a missing ruler file", {"ruler_path": os.path.join(tmp, "nope.png")})):
    try:
        J.score_image(bear_cand, *BEARP, **kw)
        noflip.append(why)
    except SystemExit:
        pass
ok(not noflip, f"the judge fell back to the ship ruler instead of refusing on: {noflip}")
print("   nothing falls back: an unknown shape id, a missing table and a missing ruler file all refuse")

# (g) pools do not merge
ok(J._pool("head", 3, 1) == "head-t3-1" and J._pool("head", 3, 1, "bear") == "head-bear-t3-1",
   "the pool key does not separate two shapes of one slot")
print("   pools: head-t3-1 without a shape, head-bear-t3-1 with one, so two shapes never rank "
      "against each other")
shutil.rmtree(tmp, ignore_errors=True)

# -- report -───────────────────────────────────────────────────────────────
print()
for n in notes:
    print("NOTE " + n)
if fails:
    for f in fails:
        print("FAIL " + f)
    raise SystemExit(f"rank-part-check FAIL ({len(fails)})")
print("rank-part-check PASS")
