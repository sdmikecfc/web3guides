"""BATTLE BOTS PART RANKER. Reject any candidate that breaks a hard rule, rank
the survivors inside one part's candidate pool, and pick the top survivor.

    python scripts/sd/rank-part.py score  <img> --slot arm --tier 2 --design 1
    python scripts/sd/rank-part.py batch  <dir> [--out <dir>] [--sheet]
    python scripts/sd/rank-part.py select <dir> --slot arm --tier 2 --design 1
    python scripts/sd/rank-part.py calibrate            # the shipped 40 + the rulers

WHAT THE COMPOSITE IS, AND IS NOT. Two outputs per candidate, and they must
never be confused:

  verdict     REJECT when any HARD rule fires (CLIPPED, AIR, BURIAL, HARDWARE,
              BRASS BUDGET, BRASS MISSING, PAINT SHARE, UNPAINTED BODY, NO
              FACE FOUND, LENS CORE PAINTED, MOUTH MISPLACED, THIRD EYE,
              EYE SIZE, CORAL SPILL, NO SOLE, STRAY INK, SEE THROUGH, IS
              THE PLACEHOLDER, UNSHADED), else RANKED; REFUSED
              (NO ALPHA) for a raw render that was never cut, see CLEAN below.
              Hard rules are trustworthy: each one names a defect that has
              actually shipped or that the contract forbids in so many words.
              A REJECT is never selected, whatever its composite.

WHAT IS JUDGED: THE PART AS IT WOULD SHIP, NOT THE RAW CUT. Measured on the
rented 4090 on 2026-09-05: the factory's heads came back bound to the
placeholder with lit lamp eyes, and this judge rejected 29 of 30 and 30 of 32
of them, nearly all for LENS CORE PAINTED, because the rendered lens sat at
hue 33 to 57 and saturation 0.5 to 1.0 while the law's eye band wants 30 to
42 and 0.13 to 0.52. But the shipped importer, scripts/bots-import-parts.py,
never ships a lens in the colour the model drew it: it finds the two eyes by
GEOMETRY, PINS the ring and the glass to the law's authored eye colours (all
three channels scaled together so the sculpted dome survives), pins the coral
shoes the same way, takes the body to neutral clay, and adds one authored
catch light in both lenses. That step is what puts every shipped head's eye
inside the band, and the judge was scoring a colour the pipeline would have
replaced anyway. So before any hard rule runs, every candidate goes through
THE IMPORTER'S OWN FUNCTIONS (normalise_as_shipped below, which calls them by
name and re-implements none of them), the rules are asked of the result, the
mask deriver is handed the result, and the count of pixels the repair had to
move is reported and ranks a heavily repaired candidate below a lightly
repaired one, all else equal. A head on which the importer's find_eyes finds
no level, mirrored pair is a head the importer refuses to ship ("refusing to
ship a faceless bot"), and that is the hard rule NO FACE FOUND. A head on
which the importer's find_grille lit something ABOVE the eyes as the mouth (a
dark crown hatch, a dark brow band: seen on 6 of the 62 real cuts) would ship
in a gold hat, and that is the hard rule MOUTH MISPLACED. Three things are
deliberately measured on the raw cut, and say so in the report: the STYLE
axis (the surface the model drew; the pass adds the same authored face to
everything), the ruler it is measured against, and the UNSHADED rule below,
which the normalisation would otherwise hide.
  composite   a RANKING KEY for the survivors inside ONE part's candidate
              pool (one slot, tier and design). It is not a pass mark. It is
              never compared across pools, never against the ruler, never
              against a threshold, and there is no number above which a part
              is "good". `select` takes the top survivor; a pool with no
              survivor selects nothing.

WHY IT IS SHAPED THIS WAY. Calibration on 2026-09-05 (the 40 shipped parts
against the 40 clay rulers) had the featureless grey placeholder outscoring
36 of the 40 real parts on the old composite, and the old verdicts called it
PASS. The composite rewards geometry, and the placeholder is perfect at
geometry: it IS the ruler the geometry is measured against. The same run
showed the composite ordering real parts the way a person does inside a pool
(the bent arm is the worst arm, the weapons are bare clay). So: a good ranker
within a pool, a useless gate, and it is not used as one. The placeholder
itself is a hard REJECT (IS THE PLACEHOLDER: a candidate that matches the
ruler's silhouette at 0.97 or better and carries no more surface than the
ruler is not art, it is the drawing the art was meant to replace).

WHY THIS EXISTS. Every part in public/bots-art/parts PASSES scripts/bots-
art-check.mts today (measured 2026-09-05: "checked 40 parts ... PASS") and
Mike still rejected the result on sight: "parts out of place, wrong zoom,
looks bad". A pass/fail floor that everything clears cannot rank, and ranking
is the whole job when a sweep hands you a thousand renders. So this file does
not replace the gate. It runs the gate's rules (and a few of its own) for the
VERDICT and adds continuous, signed measurements for the COMPOSITE, which only
ever ranks.

WHY PYTHON AND NOT .mjs. Three reasons, in order of weight.

 1. The gates-must-import law. The two things this judge must not re-implement
    are the paintable law's accent classifier and the contract's numbers. Both
    are already Python and both are importable in process:
    scripts/bots-paint-masks.py (accent_mask / accents_of, the exact function
    that derives every shipped mask) and scripts/bots-import-parts.py, whose
    load_contract() parses src/app/bots/_view/rig-points.ts. A .mjs judge could
    import rig-points.ts natively but would have had to carry its own copy of
    the accent classifier, which is the forbidden thing: a judge that
    re-implements what it checks reproduces the author's assumptions and passes
    everything.
 2. Speed. numpy measures a 456x384 RGBA part in single-digit milliseconds; the
    gate's pure-JS per-pixel loops take about 32 ms and its process start about
    2.7 s. This has to survive thousands of candidates per sweep.
 3. The one thing Python cannot do, running the shipped TypeScript gate, it
    does not need to do in process: the gate is a script, not a module, so no
    language could import it. It is run as a subprocess against a staged
    sandbox instead, which executes the shipped bytes exactly.

WHAT IS IMPORTED, AND FROM WHERE. Nothing below retypes a contract number.

  src/app/bots/_view/rig-points.ts   canvases, pivots, FIGURE, the 19 ratio
                                     bands, JOIN, LIGHT. Reached through
                                     load_contract() in bots-import-parts.py,
                                     the shipped reader, so this file does not
                                     even own the parser.
  scripts/bots-art-accents.json      the paintable law. Reached through the
                                     paint-masks module's own constants.
  scripts/bots-paint-masks.py        accents_of, _grow, _close, and process()
                                     ITSELF, the function that derives every
                                     shipped mask. Loaded by executing the
                                     shipped source down to "targets = []",
                                     which is the last line before the file
                                     starts writing, and then run with DRY set
                                     so paint share and unmasked body come from
                                     the deriver instead of from a copy of it.
                                     If that anchor moves, or a write ever
                                     appears above the DRY return, this file
                                     REFUSES rather than guessing.
  scripts/bots-import-parts.py       hsv_full and runs, and THE NORMALISATION
                                     IT SHIPS: largest_component, neutralise,
                                     THE EXPOSURE LEVEL (one line of its
                                     process(), lifted by anchor and compiled,
                                     never retyped: see EXPOSE; its target is
                                     the shipped parts' own median level per
                                     slot, see shipped_level_target),
                                     find_grille, light_grille, draw_face
                                     (which is find_eyes, socket_radius, the
                                     ring and glass pin, the glow and the
                                     catch light), lift_crevices, pin_coral,
                                     neutral_clay, strip_brass and draw_key.
                                     Called by name on a copy of the cut, see
                                     normalise_as_shipped. Import safe:
                                     main() is guarded. Its is_metal is
                                     deliberately NOT used; see gate_is_metal
                                     below for the measured reason.
  scripts/bots-art-check.mts         RADIUS, OPAQUE and the joint-point table
                                     are read out of its source by name, and
                                     the whole file is RUN for the verdict.
  scripts/bots-bake-parts.mjs        run with cwd redirected into a cache to
                                     bake the clay RULER, the placeholder that
                                     obeys the contract exactly. Its own
                                     regenerated rig-points.ts is diffed
                                     against the shipped one every time: if
                                     they differ the ruler is stale and this
                                     file refuses. A ruler nobody re-measures
                                     is a ruler that has drifted.

THE FIVE AXES, and what each one caught.

  FIT     silhouette IoU against the ruler, pivot solidity, the JOIN burial,
          canvas-edge clearance, and the per-part proportion bands. This is
          "parts out of place, wrong zoom" measured instead of eyeballed.
  LIGHT   the contract's own LIGHT law: one key from directly above, so the
          row-mean value must fall from rampTop to rampBottom and the
          left-to-right ratio must stay under lateralMax. A limb cut out of a
          side-lit render fails this and nothing else was asking.
  PAINT   the paintable law, predicted BEFORE the mask exists: paint share,
          unmasked body, the brass budget, no metal inside a joint's guard,
          the eye lens present, inside the law's eye band and NOT painted
          (asked on the importer's own lens and ring mask, after the pin),
          and the REPAIR: how many pixels the importer's normalisation had
          to move to get there.
  CLEAN   how cleanly the part was cut: stray components, interior holes,
          alpha fringe width, and the RIM. The rim is NOT a colour test any
          more. This lane draws on the body's own mid grey by design and the
          box proved on 2026-09-05 that no colour key finds pale grey clay on
          a mid grey plate (IoU 0.30 to 0.37 whatever the control did), so a
          render is cut with the CONTROL ALPHA it was conditioned on
          (scripts/sd/bots_sd_matte.py) and the rim question becomes "did the
          model draw its outline where the matte's boundary is": the share of
          the boundary with a render edge next to it, measured at cut time
          from the raw pixels and carried inside the cut PNG. A candidate
          with no alpha channel at all is a raw render and is REFUSED, not
          keyed. The old magenta residue count is gone with the magenta.
  STYLE   Laplacian energy inside the silhouette against the ruler's own. The
          eight shipped weapons ARE the untouched clay placeholder, and on
          geometry alone they score better than any real art in the catalogue.
          Without this axis the judge's taste is exactly inverted on a fifth of
          the set.

THE UNSHADED RULE, measured on the RAW cut. Measured on the v2 limb slice on
2026-09-05: lineart-only control at adapter 0.3 often yields an OUTLINE
DRAWING, a white fill with black lines and no shading (four of the sixteen
arms, all eight lineart torsos, three grey heads in stage1b and one in the
stage-1 sample: sixteen in all). A person rejects those on sight, they have
no volume, and this judge ranked one FIRST for the arm (composite 90.0),
because after the as-shipped normalisation a flat white outline becomes
uniform neutral clay with a perfect silhouette and no repair, and every rule
above is asked of the normalised part. So this one rule is asked of the
render as drawn: a rendered part must carry the shading its control's depth
map implies. The measure is the BODY'S VALUE SPREAD: inside the solid ink
eroded by 4 px, minus the shipped accent classifier's pixels (the eye, key,
coral and grille are pinned or replaced by the importer, and an outline
drawing with a shaded brass key is still an outline drawing), dark lines
narrower than 7 px are filled from their surroundings (a grey closing), the
result is smoothed, and its interquartile range is taken over its median, so
the number is the same at any exposure. Calibrated on the four v2 pools and
both head pools, with the 40 shipped parts and 40 rulers as the control: the
sixteen outline drawings read 0.000 to 0.0074, the flattest shaded render
0.0348 (a low-relief torso), the shipped parts 0.18 and up, the rulers 0.14
and up. The bar, 0.016, is the geometric middle: 2.2x either side, 4.7x end
to end. Measures tried and set aside, with their margins: the same spread
over the whole interior, accents included, 2.6x; that spread divided by the
depth map's own spread over the same region (the picture a headlight makes
of the surface, so "the shading the depth implies" literally), 2.7x, because
the depth's spread runs 0.08 to 0.17 on every part in the contract and
dividing by it only adds the depth's variation to the measure; the tenth to
ninetieth percentile spread, 1.5x (the coral band and the joint lines of an
outline arm reach it); the share of near-flat pixels, 1.4x; correlation of
the value with the depth or with a top-lit shade derived from it, no
separation at all (every render carries a dark rim exactly where the depth
falls away, and the rim decides the sign). The depth's spread and the share
of it the render carries are still in the report, as the reference.

THE CORAL SOLE (CORAL SPILL, NO SOLE), measured on the normalised leg. The
production sweep of 2026-09-05 installed eight legs whose coral was a thin
rim along the boot panels plus drips and smears between and above the boots,
worst on the design-2 legs, visible at 600 and 830. Nothing asked where the
coral was: the importer's pin_coral pins whatever warm saturated pixels sit
in the lower 45 percent of the leg, and the paint rules only ask that the
pinned coral is an accent. The live catalogue's boot is ONE clean coral
block at the bottom, and so is the shoe on every concept boot in
art-src/sd/style/clean. So the judge asks the importer's own shoe mask where
it landed: the SOLE BAND is the run of rows at the bottom of the leg whose
coral covers at least half the row (three bare rows allowed under it, the
contact edge), and CORAL SPILL is the share of the coral outside that band.
Calibrated on the eight live legs (0.000 to 0.0034), the 192 production cuts
(0.053, a plate plus a rim, to 1.000, a rim and nothing else) and the eight
concept boots: the bar, 0.013, is the geometric middle, 3.8x either side.
NO SOLE fires when pin_coral found no coral at all, or the band is under 8
percent of the leg's height (the live legs run 33 to 36 percent; the
production legs 14 to 28 where a plate exists and 0 to 5 where only a rim
does). A leg with no coral sole is not on the contract, whatever else it
has. The blob count and the rows above the band are in the report.

THE THIRD EYE, measured on the normalised head after the importer drew the
face. The same sweep installed three heads (lantern, piston, anvil) that
read as three-eyed: on a cyclops render the importer's find_eyes, which
wants a level mirrored PAIR, took the two side bolts, lit them, and left the
big lens above them as drawn; on others a slotted grille sits above the
eyes. MOUTH MISPLACED only sees what find_grille lit as the mouth, so it was
silent. The rule: in the central band above the eye sockets (the head
eroded 6 px, rows above eye centre minus r times EYE_RING_R, within a
quarter head width of the centre line, minus a disc round each eye for its
own bezel and minus the lit grille) count the pixels that sit 25 percent
darker than the clay within 20 px of them (a black top-hat). A grille is
dark slats, a lens carries a dark bezel ring or a dark pupil; the one bright
thing every top-lit head carries, the crown specular, has no dark edge,
which is why only the dark side is measured, and said so in third_eye.
Calibrated on the eight shipped heads (0 to 70 px, the crown hatch on t4-2
the most), the 25 production design-1 survivors with nothing above the eyes
(up to 38) and the 17 design-2 survivors a person called three-eyed (785 to
5065; a slotted vent on the crown of one design-1 head reads 1204): the bar
is 230 px, the geometric middle, 3.3x either side. The pinhole-eyed head
whose dark sockets ring eyes a third the shipped size reads 225, just under
the bar, and EYE SIZE handles it. Alongside it EYE SIZE, a term on the fit
axis for heads only: the eye radius the importer will draw over the head's
ink width, 0 at 0.03 and 1 at 0.09 (the shipped heads read 0.063 to 0.094,
the concept about 0.08 to 0.10, the production heads a person called small
at fight size 0.015 to 0.056). On a head the burial term, a limb question,
and a tenth of the silhouette term carry it. Under 0.05 the report says
SMALL EYES. Under the floor, 0.03, it is a HARD rule, EYE SIZE; see below.

THE JUDGE'S BLIND SPOT, closed 2026-09-05 (pass 3). The design-2 head
rulers are drawn as a cyclops (one big lens on the forehead), so every
render of lantern, piston and anvil came back a cyclops, and two of them
passed this judge: a big lens LEVEL with two tiny lit side nubs. The
importer's find_eyes took the nubs for the pair (radius 0.024 and 0.026 of
head width), SMALL EYES only warned, and THIRD EYE measured only ABOVE the
eye line, so a lens sitting on the eye row itself stayed silent. Two rules
close it. EYE SIZE: a found pair whose radius is under the floor (0.03 of
head width, 12 px on the contract canvas) is a hard REJECT; a pair the
importer would draw at pinhole size is a pair that is not the eyes. THIRD
EYE ON THE ROW: third_eye also measures the eye row itself, the rows within
the eye keep-out radius either side of the eye centre, inside the central
band, minus the keep-out disc round each found eye, the lit grille and the
drawn lenses. It takes the dark pixels there (the same black top-hat as
above the line, plus anything 25 percent under the clay outright, so a
pupil wider than the top-hat's reach still counts), labels them both as
drawn and closed by 4 px (the closing joins a bezel ring broken by its own
highlight; as drawn, a clean pupil the closing would bridge to a socket's
shadow sliver keeps its shape), fills each blob's holes (a lit glass disc
inside a dark bezel becomes the disc), keeps the blobs
that are disc-shaped (filled area at least half the box, box aspect at most
1.8: a brow seam or a mouth is a bar, a socket's spill past the keep-out is
an arc) and reports the largest as a radius. It fires when that radius is
at least 0.038 of head width (15 px on the contract canvas) AND either the
found pair is under the eye floor or the disc is more than twice the found
eye radius. Only
the dark side is measured, for the reason given above: on a top-lit dome
the brow reads brighter than the clay on every head, cyclops or not, so a
lit disc with no bezel and no pupil cannot be told from the light.
Calibrated on the eight shipped heads and the 25 design-1 survivors (0 to
11.8 px on the row, a nose loop at 0.029 of head width the most) against
the two cyclops survivors (20.2 and 21.7 px, 0.050 and 0.054, 1.9x and 2.3x
their found eye); 0.038 is the geometric middle, 1.3x clear either side.
The third cyclops, whose nubs sit low, reads 10.7 px on the row and 3996
px above the line, where the older rule holds it.

A HARD FAIL sets the verdict to REJECT. The composite is still computed for a
rejected candidate, and reported below the survivors, so a person can see how
near a miss was; it is never a reason to select one.
"""
from __future__ import annotations

import argparse
import csv
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
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
ROOT = os.path.dirname(SCRIPTS)
sys.path.insert(0, HERE)
import bots_sd_matte as _MATTE  # noqa: E402  the cut, and the rim number it stores in a cut PNG

RIG_TS = os.path.join(ROOT, "src", "app", "bots", "_view", "rig-points.ts")
GATE_MTS = os.path.join(SCRIPTS, "bots-art-check.mts")
BAKE_MJS = os.path.join(SCRIPTS, "bots-bake-parts.mjs")
PARTS = os.path.join(ROOT, "public", "bots-art", "parts")

SLOTS = ("head", "torso", "arm", "leg", "weapon")
TIERS = (1, 2, 3, 4)
DESIGNS = (1, 2)


def _refuse(why: str):
    """A BREAKER, never a fallback. Every place this file could guess instead
    of reading the shipped value ends here. The one Domain Kitchen module with
    no direct-import gate carried three money bugs, all of them returning a
    plausible partial answer instead of throwing."""
    raise SystemExit("rank-part REFUSES: " + why)


# ── 1. the shipped modules, imported ──────────────────────────────────────

def _load_py(path: str, name: str, cut_at: str | None = None) -> types.ModuleType:
    """Execute a shipped Python file as a module.

    cut_at truncates the source at a named anchor, for a file whose top level
    does work. bots-paint-masks.py builds its target list and WRITES every mask
    at module scope, so importing it whole would overwrite the art another lane
    owns. Everything above "def process(" is pure definitions, so the anchor is
    the boundary and the truncation is exact. The alternative, copying those
    forty lines of accent classifier into this file, is the thing the
    gates-must-import law exists to forbid."""
    if not os.path.exists(path):
        _refuse(f"{path} is missing; the judge has nothing to import")
    src = open(path, encoding="utf-8").read()
    if cut_at is not None:
        i = src.find(cut_at)
        if i < 0:
            _refuse(
                f"{os.path.basename(path)} no longer contains the anchor {cut_at!r}. "
                "The judge will not guess where the pure region ends, and it will not "
                "carry its own copy of that code. Re-point the anchor deliberately."
            )
        src = src[:i]
    mod = types.ModuleType(name)
    mod.__file__ = path
    code = compile(src, path, "exec")
    exec(code, mod.__dict__)
    return mod


def _import_whole(path: str, name: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        _refuse(f"cannot import {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# The mask deriver, cut at the first line that does work: everything above
# "targets = []" is definitions, and that includes process(), the function that
# derives every shipped mask. process() returns (share, left) and writes
# nothing when DRY is set, so this judge asks the SHIPPED deriver what a
# candidate's paint share and unmasked body would be rather than predicting
# them with a copy. The two numbers then cannot disagree with the deriver by
# sharing a mistake, because they come from it.
_MASKS = _load_py(os.path.join(SCRIPTS, "bots-paint-masks.py"), "_bb_masks", cut_at="targets = []")
# ... and prove the cut is safe before trusting it. If a write ever moves above
# the DRY return, importing this file would overwrite art another lane owns.
_MSRC = open(os.path.join(SCRIPTS, "bots-paint-masks.py"), encoding="utf-8").read()
_MBODY = _MSRC[_MSRC.find("def process("):_MSRC.find("targets = []")]
if "if DRY:" not in _MBODY:
    _refuse("bots-paint-masks.py process() no longer has a DRY early return; a scoring run would write masks")
if any(_MBODY.find(tok) < _MBODY.find("if DRY:") and _MBODY.find(tok) >= 0
       for tok in (".save(", "os.replace(")):
    _refuse("bots-paint-masks.py process() writes before its DRY return; the judge will not import it")
_MASKS.DRY = True
# The cutter. main() is guarded, so this one imports whole, and with it comes
# load_contract(), which parses rig-points.ts.
_CUT = _import_whole(os.path.join(SCRIPTS, "bots-import-parts.py"), "_bb_cut")

for _need, _where in (
    ("accents_of", _MASKS), ("accent_mask", _MASKS), ("_close", _MASKS), ("_grow", _MASKS),
    ("process", _MASKS), ("OPAQUE", _MASKS), ("RIM", _MASKS), ("SHARE_MIN", _MASKS),
    ("SHARE_MAX", _MASKS), ("LEFT_MAX", _MASKS),
    ("hsv_full", _CUT), ("is_metal", _CUT), ("is_law_brass", _CUT), ("runs", _CUT),
    ("RIG", _CUT), ("FIG", _CUT), ("BAND", _CUT), ("JOIN", _CUT),
):
    if not hasattr(_where, _need):
        _refuse(f"{os.path.basename(_where.__file__)} no longer provides {_need}")

# THE NORMALISATION THE IMPORTER SHIPS, by name. Every one of these is called
# on a candidate before a hard rule sees it (normalise_as_shipped below). If
# the importer stops providing one, this judge refuses rather than carrying a
# copy: a judge that re-implements the repair it scores would score its own
# assumptions.
NORMALISE_FUNCS = ("largest_component", "neutralise", "find_grille", "light_grille", "draw_face",
                   "find_eyes", "socket_radius", "lift_crevices", "pin_coral", "neutral_clay",
                   "strip_brass", "draw_key")
for _need in NORMALISE_FUNCS:
    if not callable(getattr(_CUT, _need, None)):
        _refuse(f"bots-import-parts.py no longer provides {_need}(); the judge will not carry its own "
                f"copy of the normalisation it scores")


# THE EXPOSURE LEVEL THE IMPORTER SHIPS. It is not a function the importer
# exports: it is ONE LINE of process(), the line right after neutralise,
#     rgb = np.clip(rgb * (level_target / max(level, 1e-3)), 0, 255)
# and the target it is handed is main()'s median of neutralise()'s level over
# the set ("ONE exposure target for the whole set"). Measured 2026-09-05: the
# importer's find_eyes sweeps FIXED value thresholds (0.84 to 0.92) and its
# find_grille takes value at or under 0.32, so both answer differently
# depending on the exposure they are handed. The 62 real stage-1 cuts sit at
# level 110.8 to 154.1 and the eight shipped heads at 165.8 to 173.4, and
# skipping this step cost 6 of the 62 their face (NO FACE FOUND on heads whose
# eyes the importer finds cleanly once levelled) and moved 30 of 62 verdicts
# in both directions. So the step is applied, and it is applied the way the
# rest of the normalisation is: the line is LIFTED out of the shipped source
# by anchor and compiled into a function, never retyped, and the judge refuses
# if the anchor is gone or the line has left the order it ships in (after
# neutralise, before measure). The target is read off the shipped parts, see
# shipped_level_target.
def _exposure_from_importer():
    src = open(_CUT.__file__, encoding="utf-8").read()
    i = src.find("def process(")
    if i < 0:
        _refuse("bots-import-parts.py no longer has process(); the exposure level the judge applies lives there")
    body = src[i:]
    m = re.search(r"^[ \t]+(rgb\s*=\s*np\.clip\(\s*rgb\s*\*\s*\(\s*level_target\s*/[^\n]*)$", body, re.M)
    if not m:
        _refuse("bots-import-parts.py process() no longer levels the exposure with the line this judge lifts "
                "(rgb = np.clip(rgb * (level_target / ...), 0, 255)); the judge will not carry its own copy "
                "of the importer's exposure step. Re-point the anchor deliberately.")
    line = m.group(1).rstrip()
    i_neu = body.find("neutralise(")
    m_meas = re.search(r"^\s*M\s*,\s*why\s*=\s*measure\(", body, re.M)
    if i_neu < 0 or m_meas is None or not (i_neu < m.start() < m_meas.start()):
        _refuse("the importer's exposure line no longer sits between neutralise and measure in process(); "
                "the order the judge applies it in would be a guess")
    ns = {"np": np}
    exec(compile("def expose(rgb, level, level_target):\n    " + line + "\n    return rgb\n",
                 _CUT.__file__ + " (process, the exposure line)", "exec"), ns)
    return ns["expose"], line


EXPOSE, EXPOSURE_LINE = _exposure_from_importer()

_LEVEL_TARGET: dict = {}


def shipped_level_target(slot: str) -> tuple[float, dict]:
    """The exposure target for one slot: the MEDIAN clay level of the shipped
    parts of that slot in public/bots-art/parts, each measured with the
    importer's own largest_component and neutralise, which is exactly how the
    importer's main() takes its set median (over whole bots there; over the
    shipped parts of one slot here, because a lone part has no bot).

    PER SLOT, not one number, and measured, not typed. The importer applies
    one gain per BOT, and the parts cut from that bot then sit at their own
    levels under the contract's one key light from above: measured
    2026-09-05 the shipped heads sit at 165.8 to 173.4 (median 169.1), the
    torsos, in the head's shadow, at 127.3 to 144.3, the arms at 157.6 to
    188.9 and the legs at 137.8 to 160.5. Pushing a torso candidate to the
    head's level would ship it brighter than any torso in the catalogue. So
    a candidate is levelled to where the shipped parts of ITS slot sit, and
    the report says which parts and how many. A slot with no shipped part
    REFUSES: the importer's own fallback for an empty set (180.0) is a guess,
    and this judge does not take it."""
    if slot not in _LEVEL_TARGET:
        levels = {}
        for t in TIERS:
            for d in DESIGNS:
                p = os.path.join(PARTS, slot, f"t{t}-{d}.png")
                if not os.path.exists(p):
                    continue
                a = np.asarray(Image.open(p).convert("RGBA"))
                ink = _CUT.largest_component(a[..., 3])
                if ink is None:
                    continue
                levels[f"t{t}-{d}"] = float(_CUT.neutralise(a[..., :3].astype(np.float32), ink)[2])
        if not levels:
            _refuse(f"no shipped {slot} under {PARTS} to read an exposure target from; the importer's own "
                    f"fallback for an empty set (180.0) is a guess and the judge will not take it")
        vals = list(levels.values())
        _LEVEL_TARGET[slot] = (float(np.median(vals)), {
            "n": len(vals), "min": round(min(vals), 1), "max": round(max(vals), 1),
            "source": f"median clay level of the {len(vals)} shipped {slot} parts in public/bots-art/parts, each "
                      f"measured with the importer's own largest_component and neutralise, the way its main() "
                      f"takes the set median"})
    return _LEVEL_TARGET[slot]

_ACC_MEMO: dict = {}
_ACC_RAW = _MASKS.accents_of      # the shipped function, captured before rebinding


def accents_of(a: "np.ndarray") -> "np.ndarray":
    """The SHIPPED accent classifier, memoised on the exact pixels.

    scripts/bots-paint-masks.py calls accents_of() inside process(), and this
    judge needs the same answer outside it, so an unmemoised run classifies
    every candidate twice. The memo is keyed on the image bytes, so it can only
    ever return the shipped function's own answer for those exact pixels."""
    k = hashlib.blake2b(a.tobytes(), digest_size=16).digest()
    v = _ACC_MEMO.get(k)
    if v is None:
        v = _ACC_RAW(a)
        if len(_ACC_MEMO) > 8:
            _ACC_MEMO.clear()
        _ACC_MEMO[k] = v
    return v


_MASKS.accents_of = accents_of      # so the shipped process() shares the memo
accent_mask = _MASKS.accent_mask
derive = _MASKS.process        # the SHIPPED derivation, in DRY mode
hsv_full = _CUT.hsv_full
runs = _CUT.runs

RIG = _CUT.RIG            # canvases and pivots, from rig-points.ts
FIG = _CUT.FIG            # FIGURE.<name>
BAND = _CUT.BAND          # FIGURE.ratio.<name> -> min/target/max
JOIN = _CUT.JOIN          # the join law
LAW = _MASKS.LAW          # scripts/bots-art-accents.json
OPAQUE = _MASKS.OPAQUE
RIM = _MASKS.RIM
SHARE_MIN = _MASKS.SHARE_MIN
SHARE_MAX = _MASKS.SHARE_MAX
LEFT_MAX = _MASKS.LEFT_MAX

H = FIG("H")
MARGIN = FIG("margin")
SKIRT = FIG("skirt")
BRASS_BUDGET = FIG("brassBudget")

# The paint-share CEILING is asked only of the slots that carry an accent. That
# list lives below the cut in the deriver, so rather than retype it, derive it:
# a slot is capped when the law says a ceiling exists and the slot is not the
# arm. Read from the deriver when it is above the cut, else from the law's own
# note, which names the four.
# The law's own sentence names them and then names the exception: "asked only
# of the slots the contract puts an accent on: head ... torso ... leg ... and
# weapon ... NOT the arm". Read the clause BEFORE the exception, or the word
# "arm" inside "NOT the arm" gets counted as a capped slot, which is what
# happened on the first run: the clay placeholder arm is 100 percent paintable
# by design and was refused by its own judge.
_CAP_TXT = LAW["gate"]["paintShareMax"]["_"].split("NOT")[0]
CEILING_SLOTS = tuple(s for s in SLOTS if re.search(r"\b%s\b" % s, _CAP_TXT))
if len(CEILING_SLOTS) != 4 or "arm" in CEILING_SLOTS:
    _refuse(
        f"the paintable law's ceiling clause now reads as {CEILING_SLOTS}. It named four slots and "
        "excluded the arm when this judge was written; a changed list has to be read deliberately, "
        "not pattern matched."
    )


def gate_is_metal(rgb: np.ndarray, hsv=None) -> np.ndarray:
    """METAL as the ART GATE counts it, composed from the two shipped tables.

    Every number here is read, not typed: the hue band and the value floor come
    from the paintable law's brass entry, the saturation floor from the
    contract's FIGURE.metalSatMin. That is exactly the composition
    scripts/bots-art-check.mts performs in its isMetal().

    WHY NOT bots-import-parts.py's is_metal(). Measured 2026-09-05 on head
    t1-1: the cutter's is_metal has NO value floor, so 35 near-black pixels
    (value 0.02 to 0.07, warm hue, high saturation) inside the neck's guard
    radius count as brass to it and as nothing to the gate. Judging with the
    cutter's version reports HARDWARE on a part the gate passes. The gate is
    the authority on the verdict, so the judge composes the gate's test. The
    divergence itself is worth someone's attention: the cutter uses is_metal to
    decide WHICH of the four accents a pixel is, and a dark seam being filed as
    brass is a wrong answer there too."""
    b = LAW["accents"]["brass"]
    h, s, v = hsv if hsv is not None else hsv_full(rgb)
    return (h >= b["hueMin"]) & (h <= b["hueMax"]) & (s >= FIG("metalSatMin")) & (v > b["valueMin"])


# ── 2. the LIGHT law, which the Python contract reader does not expose ────
# load_contract() lifts RIG, the FIGURE scalars, the ratio bands and JOIN. It
# does not lift LIGHT, because the cutter never needed it. Read it here from
# the same file with the same shape of parser, and REFUSE if a key is gone.
def _light_from_contract() -> dict:
    src = open(RIG_TS, encoding="utf-8").read()
    i = src.find("export const LIGHT")
    if i < 0:
        _refuse("rig-points.ts no longer exports LIGHT; the light axis has no contract to check")
    block = src[i:src.find("export const", i + 10)]
    out = {}
    for k, v in re.findall(r"(\w+):\s*(-?[\d.]+),", block):
        out[k] = float(v)
    for k in ("rampTop", "rampBottom", "lateralMax", "headShadowOnTorso"):
        if k not in out:
            _refuse(f"rig-points.ts LIGHT has no {k}")
    return out


LIGHT = _light_from_contract()


# ── 3. the gate's own constants, read out of the gate ─────────────────────
# RADIUS, OPAQUE and the joint-point table are the gate's, not the contract's.
# Read them by name from scripts/bots-art-check.mts so a change there moves this
# judge too, and refuse if the name is gone.
def _gate_consts() -> dict:
    src = open(GATE_MTS, encoding="utf-8").read()

    def num(name):
        m = re.search(r"^const %s = (\d+);" % name, src, re.M)
        if not m:
            _refuse(f"bots-art-check.mts no longer declares const {name}")
        return int(m.group(1))

    m = re.search(r"JOINT_POINTS[^=]*=\s*\{(.*?)\n\};", src, re.S)
    if not m:
        _refuse("bots-art-check.mts no longer declares JOINT_POINTS")
    joints = {}
    for slot, body in re.findall(r"(\w+):\s*\[([^\]]*)\]", m.group(1)):
        joints[slot] = [x.strip().strip('"') for x in body.split(",") if x.strip()]
    if set(joints) != set(SLOTS):
        _refuse(f"bots-art-check.mts JOINT_POINTS covers {sorted(joints)}, not the five slots")
    guard = re.search(r"limbW\s*=\s*Math\.round\(FIGURE\.ratio\.(\w+)\.(\w+)\s*\*\s*FIGURE\.H\)", src)
    frac = re.search(r"guard\s*=\s*Math\.round\(limbW\s*\*\s*([\d.]+)\)", src)
    if not guard or not frac:
        _refuse("bots-art-check.mts no longer computes the joint guard radius the way this judge reads it")
    limb_w = round(BAND(guard.group(1))[guard.group(2)] * H)
    return {
        "RADIUS": num("RADIUS"),
        "OPAQUE": num("OPAQUE"),
        "joints": joints,
        "guard": round(limb_w * float(frac.group(1))),
    }


GATE = _gate_consts()
if GATE["OPAQUE"] != OPAQUE:
    _refuse(
        f"the gate calls a pixel solid at alpha {GATE['OPAQUE']} and the mask deriver at {OPAQUE}. "
        "Two definitions of solid is a defect in the pipeline, not something for the judge to average."
    )
RADIUS = GATE["RADIUS"]


# ── 4. the RULER: the clay placeholder that obeys the contract exactly ────

def ruler_dir(cache: str | None = None) -> str:
    """Bake the shipped placeholder into a cache and return its parts dir.

    Runs scripts/bots-bake-parts.mjs UNMODIFIED with cwd redirected: the bake
    resolves its own output as join(process.cwd(), "public", "bots-art") and its
    rig-points target as join(process.cwd(), "src", ...), so a redirected cwd
    writes nothing into the repo. The bake also regenerates rig-points.ts, and
    that copy is diffed against the shipped one: identical means the ruler was
    drawn to the contract every consumer is reading. Different means the bake
    and the contract have drifted apart and the ruler is a lie, so refuse.
    Measured cost: 0.85 s, cached after the first call."""
    cache = cache or os.path.join(HERE, ".ruler-cache")
    parts = os.path.join(cache, "public", "bots-art", "parts")
    stamp = os.path.join(cache, "src", "app", "bots", "_view", "rig-points.ts")
    fresh = (
        os.path.exists(stamp)
        and os.path.getmtime(stamp) >= os.path.getmtime(BAKE_MJS)
        and os.path.getmtime(stamp) >= os.path.getmtime(RIG_TS)
    )
    if not fresh:
        os.makedirs(cache, exist_ok=True)
        r = subprocess.run(["node", BAKE_MJS], cwd=cache, capture_output=True, text=True,
                           shell=(os.name == "nt"))
        if r.returncode != 0:
            _refuse("the shipped bake refused to draw the ruler:\n" + (r.stderr or r.stdout))
    if not os.path.exists(stamp):
        _refuse("the bake wrote no contract copy; the ruler cannot be verified")
    if open(stamp, encoding="utf-8").read() != open(RIG_TS, encoding="utf-8").read():
        _refuse(
            "the ruler's own rig-points.ts differs from the shipped one. The clay placeholder was "
            "drawn to a contract nothing else is reading, so every silhouette score taken against "
            "it would be measured with the wrong ruler. Re-run scripts/bots-bake-parts.mjs."
        )
    return parts


_RULER_CACHE: dict = {}


def ruler(slot: str, tier: int, design: int, cache: str | None = None) -> np.ndarray:
    """The clay placeholder AS THE BAKE DRAWS IT, and deliberately NOT put
    through the importer's normalisation. Tried on 2026-09-05 and reverted
    the same hour: the pass gives the flat placeholder two glowing authored
    eyes, which multiplies its Laplacian energy, and the style reference then
    called 14 of 32 real heads IS THE PLACEHOLDER (1 of 32 before). The three
    things read off the ruler are all pre-pass quantities: the silhouette
    (unchanged by the pass), the light ramp the contract's own drawing
    carries (the calibrated pairing is a shipped head, which HAS been through
    the pass, against this raw ruler), and the surface detail the model drew,
    which STYLE measures on the raw candidate for the same reason, see
    score_image."""
    key = (slot, tier, design)
    if key not in _RULER_CACHE:
        p = os.path.join(ruler_dir(cache), slot, f"t{tier}-{design}.png")
        if not os.path.exists(p):
            _refuse(f"no ruler for {slot} t{tier}-{design}")
        _RULER_CACHE[key] = np.asarray(Image.open(p).convert("RGBA"))
    return _RULER_CACHE[key]


# ── 4a. THE SHAPE RULER: the ruler for the SHAPE being judged ─────────────
#
# THE SEAM THIS CLOSES. Everything above bakes its ruler from the SHIP TABLE:
# forty placeholders keyed by slot, tier and design, one silhouette per head
# pool, and that silhouette is the dome. A bear head, a bell head or a bucket
# head measured against the dome loses on the FIT axis for being a bear, and
# the judge would refuse the whole shape table one shape at a time. That is a
# broken instrument, not a standard: the ruler is supposed to be the drawing
# the art replaces, and for a bear the drawing the art replaces is a bear.
#
# WHAT DOES NOT MOVE, and this is the whole point. Not one rule and not one
# bar. NO FACE FOUND, MOUTH MISPLACED, IS THE PLACEHOLDER, UNSHADED, CORAL
# SPILL, NO SOLE, THIRD EYE, EYE SIZE, the symmetry term, the brass budget
# and the hardware guard are asked exactly as they were asked of a dome, at
# exactly the numbers they were calibrated at. The LIGHT target stays per
# SLOT, read off the ship rulers as before (slot_light_target), because the
# light law is a property of the key light and the slot, not of the outline.
# What changes is one thing: WHICH DRAWING the silhouette, the fit centring
# and the STYLE reference are taken against.
#
# THE INSTRUMENT IS CHECKED BEFORE IT IS USED. A shape ruler that is the
# wrong canvas, carries no ink, hangs off the pivots, or sits outside the
# contract's own proportion bands would quietly mis-measure every candidate
# judged against it, so verify_shape_ruler refuses it instead. This is the
# same guard the ship ruler already gets from the rig-points diff in
# ruler_dir: a ruler nobody re-measures is a ruler that has drifted.
#
# PRECEDENCE, and why the default cannot move. ruler_for falls straight
# through to ruler() when no shape and no --ruler are named, so every call
# that existed before this section reaches exactly the pixels it did before.
# Proved by scoring the 40 shipped parts, the 40 rulers and the 1546 cuts in
# the existing pools before and after: the two reports are byte-identical.

# Where a shape table is looked for when --shape is used and --shape-table is
# not given, in order. These are PREVIEW paths on purpose: nothing about the
# shape lane ships, and hard law 1 says the install target is
# .bots-preview/sd-shapes/parts, never public/bots-art/parts.
SHAPE_TABLE_PATHS = (
    os.path.join(ROOT, ".bots-preview", "sd-shapes", "shape-table.json"),
    os.path.join(ROOT, ".bots-preview", "sd-shapes", "shapes.json"),
    os.path.join(ROOT, "art-src", "bots", "shapes", "shape-table.json"),
)

_SHAPE_TABLE: dict = {}


def shape_table(path: str | None = None) -> dict:
    """The shape table, as lane A authors it, read and nothing more.

    THE SHAPE THAT IS ASKED FOR IS THE SHAPE THAT IS READ. This file does not
    invent shapes, does not fall back to the dome when a shape is missing and
    does not guess a ruler path from a name; every one of those ends in
    _refuse, because a judge that quietly substitutes a different ruler is
    the exact defect this section exists to remove.

    THE SHAPE OF THE FILE. One JSON object with a "shapes" list. Every entry
    names its slot, its id and the ruler PNG that IS that shape, drawn on the
    contract canvas:

        {"shapes": [
           {"id": "bear", "slot": "head", "ruler": "parts/head/bear.png",
            "name": "Bear", "mouth": "smile"},
           ...
        ]}

    A "ruler" is resolved against the table's own directory, so the table and
    its drawings travel together. A "slot" must be one of the contract's. An
    entry may carry anything else it likes (name, mouth, notes); this file
    reads the three keys above and ignores the rest, so lane A can grow the
    table without touching the judge."""
    p = path
    if p is None:
        for c in SHAPE_TABLE_PATHS:
            if os.path.exists(c):
                p = c
                break
    if p is None:
        _refuse("a shape was named but no shape table was found. Looked in:\n  "
                + "\n  ".join(SHAPE_TABLE_PATHS)
                + "\nPass --shape-table <path>, or judge against an explicit drawing with --ruler <png>.")
    p = os.path.abspath(p)
    if p in _SHAPE_TABLE:
        return _SHAPE_TABLE[p]
    if not os.path.exists(p):
        _refuse(f"no shape table at {p}")
    try:
        raw = json.load(open(p, encoding="utf-8"))
    except Exception as e:
        _refuse(f"the shape table at {p} is not readable JSON: {e}")
    rows = raw.get("shapes") if isinstance(raw, dict) else raw
    if not isinstance(rows, list) or not rows:
        _refuse(f"the shape table at {p} carries no shapes list")
    base = os.path.dirname(p)
    out: dict = {"path": p, "byKey": {}, "bySlot": {}, "ids": set()}
    for i, s in enumerate(rows):
        if not isinstance(s, dict):
            _refuse(f"shape {i} in {p} is not an object")
        sid, slot, rp = s.get("id"), s.get("slot"), s.get("ruler")
        if not sid or not slot or not rp:
            _refuse(f"shape {i} in {p} needs id, slot and ruler; got {json.dumps(s)[:120]}")
        if slot not in SLOTS:
            _refuse(f"shape {sid} in {p} names slot {slot}, not one of the contract's slots {SLOTS}")
        full = rp if os.path.isabs(rp) else os.path.normpath(os.path.join(base, rp))
        key = (slot, str(sid))
        if key in out["byKey"]:
            _refuse(f"shape {sid} is listed twice for {slot} in {p}")
        rec = dict(s)
        rec["id"] = str(sid)
        rec["rulerPath"] = full
        out["byKey"][key] = rec
        out["bySlot"].setdefault(slot, []).append(rec)
        out["ids"].add(str(sid))
    _SHAPE_TABLE[p] = out
    return out


def verify_shape_ruler(a: np.ndarray, slot: str, where: str) -> dict:
    """Check the INSTRUMENT before anything is measured with it. Nothing here
    is a new law: the canvas is the contract's canvas, the pivots are the
    contract's pivots at the contract's own RADIUS, and the proportion bands
    are the same bands _band_score asks of a candidate. A drawing that fails
    any of them is not a ruler for this rig, and every score taken against it
    would be a confident wrong number."""
    cw, ch = RIG[slot]["w"], RIG[slot]["h"]
    if a.shape[1] != cw or a.shape[0] != ch:
        _refuse(f"the shape ruler {where} is {a.shape[1]}x{a.shape[0]}; the contract says {cw}x{ch} "
                f"for a {slot}. A ruler on the wrong canvas mis-measures every candidate.")
    ink = a[..., 3] > 0
    solid = a[..., 3] >= OPAQUE
    if not ink.any():
        _refuse(f"the shape ruler {where} carries no ink")
    if int(solid.sum()) < 200:
        _refuse(f"the shape ruler {where} carries {int(solid.sum())} solid pixels; STYLE reads its "
                f"surface energy off the ruler's own clay and cannot read that from nothing")
    b = _box(ink)
    y0, y1, x0, x1 = b
    margin = min(x0, cw - 1 - x1, y0, ch - 1 - y1)
    if margin < 0 or any((ink[0].any(), ink[-1].any(), ink[:, 0].any(), ink[:, -1].any())):
        _refuse(f"the shape ruler {where} has ink on the canvas edge; the contract carries a "
                f"{MARGIN} px margin and a ruler that is clipped teaches every candidate to be clipped")
    dist = ndimage.distance_transform_edt(~ink)
    air = []
    for name, pt in RIG[slot].items():
        if name in ("w", "h") or not isinstance(pt, list):
            continue
        px, py = int(pt[0]), int(pt[1])
        if px < 0 or py < 0 or px >= cw or py >= ch:
            continue
        d = float(dist[py, px])
        if d > RADIUS:
            air.append(f"{name} ({px},{py}) nearest ink {d:.1f}px")
    if air:
        _refuse(f"the shape ruler {where} does not hang on the rig: " + "; ".join(air)
                + f". The pivots and the JOIN bands are frozen; a new shape hangs on the same pivots "
                  f"or the rig will not draw it.")
    ratios = _ratios(slot, ink, solid)
    out = []
    for k, got in ratios.items():
        _, info = _band_score(k, got)
        if not info["inBand"]:
            out.append(f"{k} = {info['got']}, outside {info['min']}..{info['max']}")
    if out:
        _refuse(f"the shape ruler {where} sits outside the contract's own proportion bands: "
                + "; ".join(out)
                + ". Every candidate judged against it would be marked down for matching it.")
    return {"inkBox": [y0, y1, x0, x1], "inkW": x1 - x0 + 1, "inkH": y1 - y0 + 1,
            "margin": int(margin), "solidPx": int(solid.sum()),
            "bands": {k: round(v, 4) for k, v in ratios.items()}}


_SHAPE_RULER_CACHE: dict = {}


def shape_ruler(slot: str, shape: str, table: str | None = None) -> np.ndarray:
    """The drawing that IS this shape, on the contract canvas, verified."""
    t = shape_table(table)
    key = (slot, str(shape))
    if key not in t["byKey"]:
        have = sorted(r["id"] for r in t["bySlot"].get(slot, []))
        _refuse(f"the shape table {t['path']} has no {slot} shape {shape!r}. It lists: "
                + (", ".join(have) if have else "nothing for this slot"))
    rec = t["byKey"][key]
    ck = (t["path"], slot, rec["id"])
    if ck not in _SHAPE_RULER_CACHE:
        p = rec["rulerPath"]
        if not os.path.exists(p):
            _refuse(f"the shape table names {p} as the ruler for {slot} {rec['id']}, and it is not there")
        a = np.asarray(Image.open(p).convert("RGBA"))
        verify_shape_ruler(a, slot, f"for {slot} {rec['id']} ({p})")
        _SHAPE_RULER_CACHE[ck] = a
    return _SHAPE_RULER_CACHE[ck]


_RULER_PATH_CACHE: dict = {}


def ruler_from_path(path: str, slot: str) -> np.ndarray:
    """--ruler <png>: judge against this exact drawing. Verified the same way
    a table shape is, because an unverified ruler is worse than no ruler."""
    p = os.path.abspath(path)
    if p not in _RULER_PATH_CACHE:
        if not os.path.exists(p):
            _refuse(f"no ruler at {p}")
        a = np.asarray(Image.open(p).convert("RGBA"))
        verify_shape_ruler(a, slot, f"at {p}")
        _RULER_PATH_CACHE[p] = a
    return _RULER_PATH_CACHE[p]


def ruler_for(slot: str, tier: int, design: int, cache: str | None = None,
              shape: str | None = None, ruler_path: str | None = None,
              table: str | None = None) -> np.ndarray:
    """THE ONE PLACE that decides which drawing a candidate is measured
    against. --ruler beats --shape beats the ship table, and with neither
    named this is ruler() and nothing else."""
    if ruler_path and shape:
        _refuse("--ruler and --shape both name a drawing to judge against; name one")
    if ruler_path:
        return ruler_from_path(ruler_path, slot)
    if shape:
        return shape_ruler(slot, shape, table)
    return ruler(slot, tier, design, cache)


def infer_shape(path: str, table: str | None) -> str | None:
    """Which shape a candidate under a shape sweep belongs to, taken from its
    path and ONLY when a table was explicitly named. A shape id that appears
    as a whole path segment or as a whole token in the filename is that
    candidate's shape; two different ones matching is ambiguous and refuses,
    because picking one would be a guess about which ruler to use."""
    if not table:
        return None
    t = shape_table(table)
    toks = set()
    for seg in re.split(r"[\\/]+", path):
        toks.add(seg.lower())
        for tok in re.split(r"[-_. ]+", seg):
            toks.add(tok.lower())
    hit = sorted({i for i in t["ids"] if i.lower() in toks})
    if len(hit) > 1:
        _refuse(f"{path} names more than one shape from the table ({', '.join(hit)}); "
                f"the judge will not guess which ruler to measure it against")
    return hit[0] if hit else None


# ── 4b. the normalisation the importer ships, applied to a candidate ──────

# WHAT COUNTS AS A REPAIR. The importer moves nearly every pixel a little:
# neutral_clay re-warms the clay by a whisper and the eye glow is re-blended,
# so "any channel moved at all" reads 98 percent on the shipped heads
# themselves and says nothing. A REPAIR is a move a person can see. Both
# numbers are CALIBRATED on 2026-09-05, not contract numbers, and say so:
# the eight shipped heads, re-normalised, repair 3.3 to 9.6 percent of their
# ink (the eye re-pin and the crevice lift); the 62 real stage-1 cuts repair
# 2.7 to 29 percent (the leaked reference colour, the amber lens, the mouth).
CHANGED_LEVELS = 2      # of 255: past rounding, counted as CHANGED
REPAIR_LEVELS = 24      # of 255: about a tenth of full scale, counted as a REPAIR
REPAIR_FULL = 0.40      # the repair term reaches zero when this share of the ink was repaired
REPAIR_WARN = 0.25      # above this share the report says HEAVY REPAIR

# THE UNSHADED RULE. See the header. Every number here is CALIBRATED on
# 2026-09-05 (the four v2 pools, both head pools, the shipped 40 and the 40
# rulers), not a contract number, and the report says so. The bar is the
# geometric middle of the two extremes recorded in UNSHADED_CALIBRATION, so
# it sits the same factor from each: change one and re-measure the other.
# Measured cost: about 45 ms on a head (the shipped accent classifier on the
# raw cut, 30 ms, and the closing, 13 ms), and the 40-part mix in check 6 of
# rank-part-check.py went from about 6/s to 4.5/s on one core (bar 4/s).
UNSHADED_BAR = 0.016        # body value spread (p75 - p25 over the median) under this is an outline drawing
UNSHADED_ERODE = 4          # px of solid ink left out at the rim, where the matte feather and the outline sit
UNSHADED_LINE_PX = 3        # radius of the closing disc: a dark line narrower than 7 px is filled from its sides
UNSHADED_SMOOTH = 1.5       # gaussian sigma after the closing, so a single pixel decides nothing
UNSHADED_FLAT = 0.02        # "flat" for the flatShare diagnostic: within 2 percent of the median
UNSHADED_MIN_PX = 100       # under this many body pixels the measure is not taken and the rule stays silent
UNSHADED_CALIBRATION = {
    "date": "2026-09-05",
    "outlineMax": 0.0074,   # torso-t2-1 lineart s0.70 seed1001 ip0.45 v2, the least flat of the 16 outline drawings
    "outlineMaxOf": "16 outline drawings: arm-t2-1 lineart seed1000 (4), torso-t2-1 lineart (8), head-t3-1 "
                    "stage1b lineart ip0.45 grey s0.70 seed1001, s0.85 seed1000, s0.85 seed1001 (3), head-t3-1 "
                    "stage-1 sample lineart s0.85 e1.00 seed1000 ip0.45 (1); they read 0.000 to 0.0074",
    "shadedMin": 0.0348,    # torso-t2-1 depth+lineart s0.70 seed1000 ip0.30 v2, the flattest shaded render
    "shadedMinOf": "the 174 shaded renders in the six pools; the flattest is a low-relief torso at 0.0348, then "
                   "0.0411 to 0.0457 for two more torsos and a weapon; the 32 shipped non-weapon parts read 0.18 "
                   "and up and the 40 rulers 0.14 and up",
    "flatPlaceholders": "the 8 shipped weapons are the untouched flat vector placeholder and read 0.000; they were "
                        "already REJECT as IS THE PLACEHOLDER and now carry UNSHADED as well",
    "marginEachSide": 2.2,
    "marginEndToEnd": 4.7,
    "pools": ".bots-preview/sd-stage1d/stage1d-v2/{arm,leg,weapon,torso}-t2-1/cut, "
             ".bots-preview/sd-stage1-sample/stage1-sample/head-t3-1/cut, "
             ".bots-preview/sd-stage1b/stage1b-eyes/head-t3-1/cut",
}
DEFAULT_CONTROLS = "art-src/sd/controls"   # where bots-sd-controls.py builds the maps a cut does not name a root for

# THE CORAL SOLE (CORAL SPILL and NO SOLE). See the header. Asked of the
# shoe mask the importer's own pin_coral returns, on the normalised leg, so
# the question is "where did the coral that will ship land". Every number
# here is CALIBRATED on 2026-09-05 on the eight live legs (which pass by
# eye), the 192 production leg cuts (8 pools of 24) and the eight concept
# boots, not a contract number, and the report says so.
SOLE_COVER = 0.5          # a row belongs to the sole band when coral covers at least half of its ink
SOLE_BARE_ROWS = 3        # bare rows allowed at the very bottom of the leg (the contact edge)
SOLE_MIN = 0.08           # NO SOLE: the band must be at least this share of the leg's own height
CORAL_SPILL_BAR = 0.013   # CORAL SPILL: share of the coral that sits outside the sole band
CORAL_CALIBRATION = {
    "date": "2026-09-05",
    "liveSpillMax": 0.0034,   # the eight live legs read 0.000 to 0.0034 (an anti-aliased top edge)
    "factorySpillMin": 0.053, # the cleanest production leg (leg-t2-2 seed1008 ip0.45): a sole plate plus a thin
                              # coral rim along the boot panels; the rest run 0.054 to 1.000
    "liveSoleFrac": [0.33, 0.36],
    "factorySoleFrac": "0.14 to 0.28 where the model drew a sole plate, 0.00 to 0.05 where it drew only a rim",
    "conceptBoots": "art-src/sd/style/clean/leg-*.png: the warm shoe is one block at the bottom of the boot on all 8 "
                    "(1 to 3 blobs by the importer's own colour rule, on saturated paint that rule was never meant for)",
    "marginEachSide": 3.8,    # 0.013 is the geometric middle of 0.0034 and 0.053 (0.0134): 3.8x over the live max, 4.1x under
    "pools": ".bots-preview/sd-production/renders/stage4-limbs-v2/leg-*/cut, public/bots-art/parts/leg",
}

# THE THIRD EYE. See the header. A dark slot, a bezel ring or a pupil ABOVE
# the eye line is measured as the pixels that sit THIRD_EYE_DEPTH darker
# than the clay within THIRD_EYE_REACH of them (a black top-hat over a square
# window, the square because it is 70x faster than a disc of the same reach
# and measures the same thing on these heads), inside the zone below.
THIRD_EYE_REACH = 20       # px: the clay a pixel is compared against
THIRD_EYE_DEPTH = 0.25     # of value 1.0: how much darker counts as a slot, a bezel or a pupil
THIRD_EYE_ERODE = 6        # px of the silhouette left out, where the outline and the matte feather sit
THIRD_EYE_CENTRAL = 0.25   # half-width of the central band, as a share of head width (the ear lugs sit past it)
THIRD_EYE_KEEP_OUT = (2.0, 0.12)   # a disc round each eye centre of max(2 r, 0.12 head width): the eye's own bezel
THIRD_EYE_BAR = 230        # px of such pixels in the zone; CALIBRATED, see THIRD_EYE_CALIBRATION
THIRD_EYE_CALIBRATION = {
    "date": "2026-09-05",
    "liveMax": 70,            # the eight shipped heads: 0 to 70 px (the crown hatch on t4-2 is the most)
    "factoryCleanMax": 38,    # the 25 production design-1 survivors with nothing above the eyes: up to 38 px
    "factoryThirdEyeMin": 785, # the 17 production design-2 survivors (a cyclops lens with the side bolts lit as
                               # eyes, or a grille above the eyes): 785 to 5065 px
    "alsoFires": "head-t4-1 dl s0.70 seed1001, a slotted vent on the crown, 1204 px; the pinhole-eyed head-t4-1 "
                 "l s0.70 seed1004, whose dark sockets ring eyes a third the shipped size, reads 225 and sits just "
                 "under the bar, where EYE SIZE handles it (score 0.05)",
    "marginEachSide": 3.3,    # 230 is the geometric middle of 70 and 785 (234): 3.3x over the live max, 3.4x under
    "pools": ".bots-preview/sd-production/renders/stage4-heads/head-*/cut, public/bots-art/parts/head",
}

# EYE SIZE. The eye radius the importer will draw (draw_face's r, the socket
# it measured) over the head's own ink width. CALIBRATED 2026-09-05: the
# eight shipped heads read 0.063 to 0.094, the concept bot in
# art-src/bots/concept/1-garage.png about 0.08 to 0.10 (ears in or out), the
# production heads a person called large 0.097 to 0.111 and the ones called
# small at fight size 0.015 to 0.056. The score is 0 at the floor, 1 at full,
# linear between. UNDER THE FLOOR IT IS A HARD RULE (EYE SIZE, since the
# 2026-09-05 pass 3): the two cyclops survivors' lit side nubs read 0.024 and
# 0.026, and a pair the importer would draw at pinhole size is not the eyes.
EYE_SIZE_FLOOR = 0.03     # under this EYE SIZE rejects
EYE_SIZE_FULL = 0.09
EYE_SIZE_WARN = 0.05      # under this the report says SMALL EYES
EYE_SIZE_CALIBRATION = {
    "date": "2026-09-05",
    "liveMin": 0.063, "liveMax": 0.094,       # the eight shipped heads
    "falseSurvivors": {"head-t3-2 lineart s0.70 seed1003": 0.0235,   # piston, a cyclops with lit side nubs
                       "head-t4-2 lineart s0.70 seed1003": 0.026},   # anvil, the same
    "alsoUnder": "two design-1 survivors the floor now rejects: head-t2-1 dl s0.70 seed1005 (0.0146) and "
                 "head-t3-1 l s0.70 seed1005 (0.0292); the four manifest winners read 0.0752 to 0.101",
    "pools": ".bots-preview/sd-production/renders/stage4-heads*/head-*/cut, public/bots-art/parts/head",
}

# THE THIRD EYE ON THE EYE ROW. See the header (THE JUDGE'S BLIND SPOT). The
# eye row is measured over the rows within the eye keep-out radius either side
# of the eye centre; the dark pixels there are the top-hat above plus anything
# THIRD_EYE_DEPTH under the clay outright; they are closed, hole-filled and
# kept only when disc-shaped; the largest is reported as a radius.
THIRD_EYE_ROW_CLOSE = 4          # px: joins a bezel ring broken by its own highlight
THIRD_EYE_ROW_FILL = 0.5         # filled area over its box: a disc is 0.785, an arc or a bar is under this
THIRD_EYE_ROW_ASPECT = 1.8       # box aspect: a disc is 1.0, a brow seam or a mouth is 4 and up
THIRD_EYE_ROW_OVER_EYE = 2.0     # fires when the disc is more than this times the found eye radius
THIRD_EYE_ROW_MIN = 0.038        # of head width; CALIBRATED, the geometric middle of the gap below
THIRD_EYE_ROW_CALIBRATION = {
    "date": "2026-09-05",
    "cleanMaxPx": 11.8,           # the eight shipped heads and the 25 design-1 survivors: 0 to 11.8 px on the row
    "cleanMaxOverW": 0.029,       # (a nose loop on two survivors; the live heads read up to 9.6 px, 0.023)
    "cyclopsPx": [20.2, 21.7],    # the two cyclops that passed (anvil and piston t*-2 lineart s0.70 seed1003)
    "cyclopsOverW": [0.050, 0.054],
    "cyclopsOverEye": [1.9, 2.3],
    "alsoCaught": "head-t4-2 l s0.70 seed1002, a cyclops whose nubs sit low: 10.7 px on the row (0.026, under "
                  "the minimum) and 3996 px above the line, where the older rule holds it",
    "notCounted": "the design-2 rejects whose real eyes the importer found (0.078 to 0.111) with a crown lens "
                  "above read up to 54 px on the row, 1.4x to 1.7x their eye, under the 2x arm; THIRD EYE "
                  "above the line or MOUTH MISPLACED holds every one of them",
    "marginEachSide": 1.3,        # 0.038 is the geometric middle of 0.029 and 0.050 (0.0381): 1.3x over, 1.3x under
    "pools": ".bots-preview/sd-production/renders/stage4-heads*/head-*/cut, public/bots-art/parts/head",
}


def eye_size_score(r_over_w: float | None) -> float:
    """0 at EYE_SIZE_FLOOR, 1 at EYE_SIZE_FULL, linear between; 0 for no face."""
    if r_over_w is None:
        return 0.0
    return _clamp01((float(r_over_w) - EYE_SIZE_FLOOR) / max(EYE_SIZE_FULL - EYE_SIZE_FLOOR, 1e-6))


def coral_sole(ink: np.ndarray, shoe: np.ndarray | None) -> dict:
    """WHERE THE CORAL LANDED, on the normalised leg. `shoe` is the mask the
    importer's own pin_coral returned (the coral that will ship); nothing
    here re-finds coral by colour.

      sole band   the run of rows at the BOTTOM of the leg whose coral covers
                  at least SOLE_COVER of the row's ink; up to SOLE_BARE_ROWS
                  bare rows are allowed under it (the contact edge)
      soleFrac    the band's height over the leg's own height
      spill       the share of the coral that sits OUTSIDE the band: drips,
                  smears, a rim along a panel, a second blob. THE NUMBER
                  CORAL SPILL IS ASKED OF.
      rowsAbove   rows above the band that carry any coral (2 px or more)
      blobs       coral blobs of 30 px or more after a 5 px closing
    Returns the block; the caller applies the bars."""
    ys = np.where(ink.any(1))[0]
    y0, y1 = int(ys[0]), int(ys[-1])
    hh = y1 - y0 + 1
    out = {"measuredOn": "the normalised leg: the shoe mask the importer's own pin_coral returned",
           "rule": f"NO SOLE fires with no coral or a sole band under {SOLE_MIN:.0%} of the leg's height; "
                   f"CORAL SPILL fires when more than {CORAL_SPILL_BAR:.1%} of the coral sits outside the sole band",
           "spillBar": CORAL_SPILL_BAR, "soleMin": SOLE_MIN, "legH": hh,
           "coralPx": 0, "soleRows": 0, "soleFrac": 0.0, "spill": None, "spillPx": 0, "rowsAbove": 0, "blobs": 0,
           "soleCover": None, "coralTop": None, "calibrated": CORAL_CALIBRATION}
    if shoe is None or not np.ndim(shoe) or not (shoe & ink).any():
        return out
    coral = shoe & ink
    out["coralPx"] = int(coral.sum())
    cov = np.zeros(ink.shape[0])
    for y in range(y0, y1 + 1):
        n = int(ink[y].sum())
        cov[y] = coral[y].sum() / n if n else 0.0
    yb = y1
    while yb > y0 and cov[yb] < SOLE_COVER and y1 - yb < SOLE_BARE_ROWS + 1:
        yb -= 1
    yt = yb
    while yt - 1 >= y0 and cov[yt - 1] >= SOLE_COVER:
        yt -= 1
    rows = yb - yt + 1 if cov[yb] >= SOLE_COVER else 0
    sole = np.zeros_like(ink)
    if rows:
        sole[yt:yb + 1] = True
        sole &= ink
    in_band = int((coral & sole).sum())
    lab, n = ndimage.label(ndimage.binary_closing(coral, _disc(2)) & ink)
    sizes = np.bincount(lab.ravel())[1:] if n else np.array([])
    cys = np.where(coral.any(1))[0]
    per_row = coral.sum(1)
    out.update({
        "soleRows": int(rows), "soleFrac": round(rows / hh, 4),
        "spill": round(1.0 - in_band / max(int(coral.sum()), 1), 4), "spillPx": int(coral.sum()) - in_band,
        "rowsAbove": int(((per_row >= 2) & (np.arange(len(per_row)) < yt)).sum()) if rows else int((per_row >= 2).sum()),
        "blobs": int((sizes >= 30).sum()),
        "soleCover": round(float(coral[sole].mean()), 4) if rows else None,
        "coralTop": round((int(cys[0]) - y0) / hh, 4),
    })
    return out


def third_eye(a: np.ndarray, core: np.ndarray, face: dict, eye_mask: np.ndarray,
              grille: np.ndarray | None, cx: float) -> dict:
    """ANYTHING DARK ABOVE THE EYES THAT IS NOT THE EYES, and ANY DISC ON THE
    EYE ROW THAT IS NOT ONE OF THEM, on the normalised head, after the
    importer drew the face. A grille reads as dark slats, a lens as a dark
    bezel ring round bright glass or a dark pupil inside it; a crown
    specular, the one bright thing every top-lit head carries, has no dark
    edge, which is why the bright side is not measured (a highlight with no
    bezel and no pupil is what a crown specular is, and no rule can tell the
    two apart; a person would not call it a lens either).

    ABOVE THE LINE
      zone      the head core eroded THIRD_EYE_ERODE px, rows above the top
                of the eye sockets (eye centre row minus r times the
                importer's EYE_RING_R), inside the central band of
                THIRD_EYE_CENTRAL head widths either side of the centre
                line, minus a disc round each eye (its own bezel) and the
                grille the importer lit
      depth     black top-hat: the clay within THIRD_EYE_REACH minus the
                pixel, on the value channel
      px        pixels of the zone deeper than THIRD_EYE_DEPTH. THE NUMBER
                THIRD EYE IS ASKED OF.

    ON THE ROW (the `row` block; the judge's blind spot, closed 2026-09-05:
    a cyclops lens LEVEL with two lit side nubs the importer took for the
    pair sat under the line above and was never measured)
      zone      the same core, rows within the eye keep-out radius either
                side of the eye centre row, the same central band, minus
                the keep-out discs, the lit grille and the drawn lenses
      dark      the top-hat above, or the pixel THIRD_EYE_DEPTH under the
                clay outright (a pupil wider than the top-hat's reach)
      disc      the dark pixels, as drawn and closed by THIRD_EYE_ROW_CLOSE
                px, each blob hole-filled (a lit glass inside a dark bezel
                becomes the disc), kept when its filled area is at least
                THIRD_EYE_ROW_FILL of its box and the box aspect is at most
                THIRD_EYE_ROW_ASPECT; the largest is reported as a radius,
                discR, in px, over the head width and over the found eye
      fires     discR at least THIRD_EYE_ROW_MIN of head width AND (the found
                pair under EYE_SIZE_FLOOR, or discR more than
                THIRD_EYE_ROW_OVER_EYE times the found eye radius)
    Returns the block; the caller applies the bar and the row's verdict."""
    xs = np.where(core.any(0))[0]
    ys = np.where(core.any(1))[0]
    hw = int(xs[-1] - xs[0] + 1)
    hh = int(ys[-1] - ys[0] + 1)
    r = float(face["r"])
    ecy = float(face["eyes"][0][0])
    yy, xx = np.mgrid[0:core.shape[0], 0:core.shape[1]]
    inner = ndimage.binary_erosion(core, _disc(THIRD_EYE_ERODE))
    eye_top = ecy - r * _CUT.EYE_RING_R
    keep_r = max(THIRD_EYE_KEEP_OUT[0] * r, THIRD_EYE_KEEP_OUT[1] * hw)
    keep_out = np.zeros_like(core)
    for (ey, ex) in face["eyes"]:
        keep_out |= (yy - ey) ** 2 + (xx - ex) ** 2 <= keep_r ** 2
    central = np.abs(xx - cx) <= THIRD_EYE_CENTRAL * hw
    zone = inner & (yy < eye_top) & ~keep_out & central
    if grille is not None:
        zone &= ~grille
    rzone = inner & (np.abs(yy - ecy) <= keep_r) & central & ~keep_out
    if grille is not None:
        rzone &= ~grille
    if eye_mask is not None:
        rzone &= ~eye_mask
    row = {"measuredOn": "the eye row of the normalised head: rows within the eye keep-out radius of the eye "
                         "centre, inside the central band, minus the keep-out discs, the lit grille and the "
                         "drawn lenses; only the dark side, a lit disc counts through its bezel",
           "rule": f"counts a dark disc (or a lit disc in a dark bezel) whose radius is at least "
                   f"{THIRD_EYE_ROW_MIN} of the head's width when the found pair is under the eye floor "
                   f"{EYE_SIZE_FLOOR} or the disc is more than {THIRD_EYE_ROW_OVER_EYE:g}x the found eye radius",
           "band": [int(round(ecy - keep_r)), int(round(ecy + keep_r))], "zonePx": int(rzone.sum()),
           "minR": round(THIRD_EYE_ROW_MIN * hw, 1), "eyeR": r, "eyeOverW": round(r / hw, 4),
           "darkPx": 0, "discR": None, "discOverEye": None, "discOverW": None, "box": None,
           "fill": None, "aspect": None, "fires": False, "why": None, "calibrated": THIRD_EYE_ROW_CALIBRATION}
    out = {"measuredOn": "the normalised head, after the importer's draw_face and light_grille",
           "rule": f"THIRD EYE fires when {THIRD_EYE_BAR} px or more of the zone above the eye line sit "
                   f"{THIRD_EYE_DEPTH:.0%} darker than the clay within {THIRD_EYE_REACH} px of them, or when "
                   f"the row block below fires",
           "bar": THIRD_EYE_BAR, "depth": THIRD_EYE_DEPTH, "reach": THIRD_EYE_REACH,
           "zonePx": int(zone.sum()), "eyeTopRow": int(round(eye_top)), "keepOutR": round(keep_r, 1),
           "headW": hw, "headH": hh, "px": 0, "box": None, "rowFrac": None, "calibrated": THIRD_EYE_CALIBRATION,
           "row": row}
    if not zone.any() and not rzone.any():
        return out
    v = a[..., :3].astype(np.float64).max(2) / 255.0
    vv = v.copy()
    vv[~core] = float(np.median(v[core]))
    win = 2 * THIRD_EYE_REACH + 1
    if zone.any():
        # only the rows the zone can reach, padded by the reach: the closing is the whole cost
        y_lo = max(int(ys[0]) - THIRD_EYE_REACH, 0)
        y_hi = min(int(round(eye_top)) + THIRD_EYE_REACH + 1, core.shape[0])
        depth = ndimage.grey_closing(vv[y_lo:y_hi], size=(win, win)) - vv[y_lo:y_hi]
        deep = np.zeros_like(core)
        deep[y_lo:y_hi] = depth > THIRD_EYE_DEPTH
        deep &= zone
        out["px"] = int(deep.sum())
        if deep.any():
            b = _box(deep)
            out["box"] = [b[0], b[1], b[2], b[3]]
            out["rowFrac"] = round((0.5 * (b[0] + b[1]) - ys[0]) / hh, 3)
    if rzone.any():
        clay = float(np.median(v[inner])) if inner.any() else float(np.median(v[core]))
        y_lo = max(int(ecy - keep_r) - THIRD_EYE_REACH, 0)
        y_hi = min(int(ecy + keep_r) + THIRD_EYE_REACH + 1, core.shape[0])
        depth = ndimage.grey_closing(vv[y_lo:y_hi], size=(win, win)) - vv[y_lo:y_hi]
        dark = np.zeros_like(core)
        dark[y_lo:y_hi] = (depth > THIRD_EYE_DEPTH) | (vv[y_lo:y_hi] < clay - THIRD_EYE_DEPTH)
        dark &= rzone
        row["darkPx"] = int(dark.sum())
        if dark.any():
            # Measured both AS DRAWN and AFTER THE CLOSING. The closing joins a
            # bezel ring broken by its own highlight, so its glass fills to a
            # disc; but it can also bridge a clean pupil to a socket's shadow
            # sliver at the keep-out edge, and the merged blob loses the disc
            # shape (measured 2026-09-05: a 20 px pupil read fill 0.75 as
            # drawn and 0.49 bridged). The largest disc either way is the
            # answer. Blobs under 60 px are skipped: no disc that small can
            # reach the floor.
            joined = (ndimage.binary_closing(dark, _disc(THIRD_EYE_ROW_CLOSE)) & rzone) | dark
            comps = []
            for m in (dark, joined):
                lab, n = ndimage.label(m)
                sizes = np.bincount(lab.ravel())
                comps += [lab == i for i in range(1, n + 1) if sizes[i] >= 60]
            best = None
            for comp in comps:
                filled = ndimage.binary_fill_holes(comp)
                area = int(filled.sum())
                b = _box(filled)
                bh, bw = b[1] - b[0] + 1, b[3] - b[2] + 1
                fill = area / max(bh * bw, 1)
                aspect = max(bh, bw) / max(min(bh, bw), 1)
                if fill < THIRD_EYE_ROW_FILL or aspect > THIRD_EYE_ROW_ASPECT:
                    continue
                rr = float(np.sqrt(area / np.pi))
                if best is None or rr > best[0]:
                    best = (rr, [int(x) for x in b], fill, aspect)
            if best is not None:
                rr, b, fill, aspect = best
                row.update({"discR": round(rr, 1), "discOverEye": round(rr / max(r, 1e-6), 2),
                            "discOverW": round(rr / hw, 4), "box": b, "fill": round(fill, 2),
                            "aspect": round(aspect, 2)})
                if rr >= THIRD_EYE_ROW_MIN * hw:
                    if r / hw < EYE_SIZE_FLOOR:
                        row["fires"] = True
                        row["why"] = (f"the pair the importer found is under the eye floor ({r / hw:.3f} of head "
                                      f"width against {EYE_SIZE_FLOOR})")
                    elif rr > THIRD_EYE_ROW_OVER_EYE * r:
                        row["fires"] = True
                        row["why"] = (f"the disc is {rr / r:.1f}x the found eye radius, over "
                                      f"{THIRD_EYE_ROW_OVER_EYE:g}x")
    return out


def normalise_as_shipped(a: np.ndarray, slot: str, tier: int) -> tuple[np.ndarray, dict, dict]:
    """Put a cut through the SAME normalisation scripts/bots-import-parts.py
    applies before a part ships, by calling the importer's own functions on a
    copy, in the importer's own order (its process(), lines "THE FACE" to
    "THE CLAY GOES NEUTRAL", then the torso's strip_brass and draw_key).
    Nothing here is re-implemented; the one thing supplied is the centre
    line, computed the way the importer's measure() computes it, as the
    middle of the ink's own column span, because a cut part has no whole bot
    to measure it from.

    Per slot, exactly these calls:
      every slot   largest_component (the importer's own definition of the
                   toy: alpha over 16, largest blob), neutralise (the one
                   cast gain) and THE EXPOSURE LEVEL (process()'s own line,
                   lifted: rgb times target over level, with the target the
                   median level of the shipped parts of this slot, see
                   shipped_level_target). Until 2026-09-05 the level was
                   skipped as harmless; it is not: find_eyes and find_grille
                   sweep fixed value thresholds, and a cut at level 120
                   handed to them unlevelled has no face. The level found
                   and the gain applied are in the report (level, exposure).
      head         find_grille, light_grille, draw_face (inside it: find_eyes
                   by geometry, socket_radius, the ring and glass pin, the
                   glow, the catch light), lift_crevices, neutral_clay
      torso        neutral_clay (the one kept brass blob), strip_brass,
                   draw_key (the authored key at the contract's anchor)
      leg          pin_coral, neutral_clay
      arm          neutral_clay
      weapon       nothing: the importer produces no weapon, so nothing it
                   does can be said to ship on one.
    NOT applied, and said so here: the importer's placement, dome_underside,
    round_cap and desidelight. Those are geometry and light finishing on a
    whole-bot cut; a factory candidate is already on the contract canvas
    under the control alpha, and its FIT and LIGHT are judged as drawn.

    Returns (rgba uint8, report, masks). report["faceFound"] is True, False
    or None (not a head). A head with faceFound False is the importer's own
    refusal ("no symmetric pair of eyes on the head; refusing to ship a
    faceless bot"): the remaining face-less steps still run so the composite
    stays diagnostic, and the caller raises NO FACE FOUND."""
    alpha = a[..., 3]
    ink_any = alpha > 0
    empty = {"applied": [], "faceFound": None, "face": None, "changedPx": 0, "changedShare": 0.0,
             "repairPx": 0, "repairShare": 0.0, "meanDelta": 0.0, "byRegion": {}, "rawClaySat": None,
             "gain": None, "level": None, "exposure": None, "centreX": None, "changedLevels": CHANGED_LEVELS,
             "repairLevels": REPAIR_LEVELS, "calibrated": "CHANGED_LEVELS, REPAIR_LEVELS and REPAIR_FULL "
             "are calibrated on the shipped heads and the stage-1 cuts, not contract numbers"}
    no_masks = {"eye": None, "grille": None, "shoe": None}
    if slot == "weapon":
        empty["applied"] = []
        empty["note"] = "the importer produces no weapon; nothing is applied"
        return a, empty, no_masks
    ink = _CUT.largest_component(alpha)
    if ink is None:
        return a, empty, no_masks
    rgb = a[..., :3].astype(np.float32)
    applied = ["largest_component"]
    rgb, gain, level = _CUT.neutralise(rgb, ink)
    applied.append("neutralise")
    # THE EXPOSURE LEVEL, the importer's own line, to the level the shipped
    # parts of this slot sit at. Applied here because this is where the
    # importer applies it: after the cast gain, before anything that reads a
    # value threshold (find_grille, find_eyes, pin_coral, neutral_clay,
    # is_metal all do).
    target, target_info = shipped_level_target(slot)
    exposure_gain = float(target / max(float(level), 1e-3))
    rgb = EXPOSE(rgb, level, target)
    applied.append(f"exposure level (process()'s own line, lifted: level {float(level):.1f} to the shipped "
                   f"{slot} median {target:.1f}, gain {exposure_gain:.3f})")
    xs = np.where(ink.sum(0) > 0)[0]
    ys = np.where(ink.sum(1) > 0)[0]
    M = {"cx": float((xs[0] + xs[-1]) / 2)}     # measure()'s own definition, on this canvas
    zeros = np.zeros_like(ink)
    masks = {"head": zeros, "torso": zeros}
    coral = zeros
    eye_mask = None
    grille = None
    face = None
    face_found = None
    wedge = None
    if slot == "head":
        # THE FACE PASS SEES THE HEAD ABOVE ITS SEAT, exactly as the importer
        # does. process() cuts the head mask at the crease, runs find_grille,
        # draw_face and lift_crevices on that, and only afterwards draws the
        # skirt below the seat with dome_underside. A factory cut carries the
        # contract's whole silhouette, skirt included, and the model draws a
        # shadowed underside there; handed the whole thing, find_grille took
        # that shadow for "the darkest thing on the centre line" and
        # light_grille pinned a gold bib under the chin on the top candidate
        # of both stage-1 samples. The seat is the contract's own neck row.
        core = ink & (np.arange(ink.shape[0])[:, None] <= int(RIG["head"]["neck"][1]))
        masks["head"] = core
        _h, _s, _v = hsv_full(rgb)
        grille = _CUT.find_grille(core, _v, M)
        rgb, grille, _grille_rep = _CUT.light_grille(rgb, core, grille)
        rgb, eye_mask, face = _CUT.draw_face(rgb, core, M, grille)
        applied += ["find_grille", "light_grille",
                    "draw_face (find_eyes, socket_radius, ring and glass pin, glow, catch light)"]
        face_found = face is not None
        if face_found:
            rgb, wedge = _CUT.lift_crevices(rgb, core, eye_mask | grille)
            applied.append("lift_crevices")
        else:
            eye_mask = None
    elif slot == "torso":
        masks["torso"] = ink
    elif slot == "leg":
        rgb, shoe = _CUT.pin_coral(rgb, ink, RIG["leg"]["hip"][1], int(ys[-1]))
        if np.ndim(shoe):
            coral = shoe
        applied.append("pin_coral")
    rgb, _acc_px = _CUT.neutral_clay(rgb, ink, masks, M, coral, eye_mask=eye_mask, grille_mask=grille)
    applied.append("neutral_clay")
    out = np.dstack([np.clip(rgb + 0.5, 0, 255).astype(np.uint8), alpha])
    key_px = None
    if slot == "torso":
        img = Image.fromarray(out, "RGBA")
        img = _CUT.strip_brass(img)
        img, key_px = _CUT.draw_key(img, tier)
        out = np.asarray(img).copy()
        applied += ["strip_brass", "draw_key"]

    # WHICH PIXELS MOVED, as a count, so a candidate that needed a lot of
    # repair ranks below one that needed little, all else equal. Counted
    # AGAINST THE LEVELLED CUT, not the raw one: the exposure level is one
    # scalar on every pixel, the importer's cross-set levelling and not a
    # repair of anything drawn wrong, and counted as repair it reads as
    # "every pixel moved" on any cut whose level is a fifth off the shipped
    # one (a 1.3 gain on a level-130 clay is 39 levels, past REPAIR_LEVELS).
    # The cast gain, the lens, the mouth, the shoes and the key are still
    # counted, because the baseline carries none of them. The level itself
    # is reported alongside (level, exposure) so a sweep can still see how
    # far off the render's exposure was.
    base = EXPOSE(a[..., :3].astype(np.float32), level, target)
    d = np.abs(out[..., :3].astype(np.int16) - np.clip(base + 0.5, 0, 255).astype(np.int16)).max(2)
    changed = (d > CHANGED_LEVELS) & ink_any
    repaired = (d > REPAIR_LEVELS) & ink_any
    n_ink = max(int(ink_any.sum()), 1)
    region = {}
    rest = repaired.copy()
    for name, m in (("eye", eye_mask), ("grille", grille), ("shoe", coral if coral is not zeros else None)):
        if m is not None and m.any():
            region[name] = int((repaired & m).sum())
            rest &= ~m
    region["clay"] = int(rest.sum())
    # the render's own body colour, before the clay pass took it away: the
    # NOT NEUTRAL question is asked of THIS number, since after the pass the
    # clay is neutral by construction.
    keep = np.zeros_like(ink)
    for m in (eye_mask, grille, coral if coral is not zeros else None):
        if m is not None:
            keep |= m
    raw_clay = (alpha >= OPAQUE) & ink & ~keep
    raw_sat = None
    if raw_clay.sum() > 200:
        px = a[..., :3][raw_clay].astype(np.float64)
        mx = px.max(1)
        raw_sat = float(np.where(mx > 0, (mx - px.min(1)) / np.maximum(mx, 1e-6), 0.0).mean())
    rep = {
        "applied": applied, "faceFound": face_found, "face": face,
        "changedPx": int(changed.sum()), "changedShare": round(float(changed.sum()) / n_ink, 5),
        "repairPx": int(repaired.sum()), "repairShare": round(float(repaired.sum()) / n_ink, 5),
        "meanDelta": round(float(d[ink_any].mean()), 3) if ink_any.any() else 0.0,
        "byRegion": region, "rawClaySat": round(raw_sat, 4) if raw_sat is not None else None,
        "gain": [round(float(g), 4) for g in gain], "level": round(float(level), 1),
        "exposure": {"target": round(target, 1), "gain": round(exposure_gain, 4),
                     "targetFrom": target_info["source"], "targetN": target_info["n"],
                     "targetRange": [target_info["min"], target_info["max"]],
                     "step": "the importer's own line, lifted from process(): " + EXPOSURE_LINE.strip()},
        "centreX": M["cx"], "wedgePx": wedge, "keyPx": key_px,
        "changedLevels": CHANGED_LEVELS, "repairLevels": REPAIR_LEVELS,
        "calibrated": empty["calibrated"],
    }
    return out, rep, {"eye": eye_mask, "grille": grille, "shoe": coral if coral is not zeros else None}


# inside .gate-sandbox, which scripts/sd/.gitignore already ignores; the matte
# selftest keeps its temp there too
NORM_TMP = os.path.join(HERE, ".gate-sandbox", "normalised-tmp")


def _normalised_path(path: str, out: str | None) -> str:
    """Where the normalised pixels are written so the SHIPPED deriver, which
    reads a candidate from its path, sees what would ship. A caller that
    wants to keep them names the file; otherwise it is a per-process temp
    under scripts/sd that is removed after scoring."""
    if out:
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        return out
    os.makedirs(NORM_TMP, exist_ok=True)
    return os.path.join(NORM_TMP, f"{os.getpid()}-{hashlib.blake2b(path.encode('utf-8'), digest_size=6).hexdigest()}.png")


# ── 5. measurement helpers ────────────────────────────────────────────────

def _box(m: np.ndarray):
    ys = np.where(m.any(1))[0]
    xs = np.where(m.any(0))[0]
    if not len(ys):
        return None
    return int(ys[0]), int(ys[-1]), int(xs[0]), int(xs[-1])


def _band_score(name: str, got: float) -> tuple[float, dict]:
    """One proportion band, scored as a continuous distance rather than a
    boolean. 1.0 at target, 0.5 at the band edge, 0 at twice the band's own
    half width. Expressing it against the band's OWN width is what lets a slack
    band (headFullW runs 0.529 to 0.780) and a tight one (hipY runs 0.757 to
    0.815) both mean the same thing to the total."""
    b = BAND(name)
    lo, tgt, hi = b["min"], b["target"], b["max"]
    half = max(tgt - lo, hi - tgt, 1e-6)
    d = abs(got - tgt) / half
    inside = lo <= got <= hi
    return max(0.0, 1.0 - 0.5 * d), {"got": round(got, 4), "min": lo, "target": tgt, "max": hi,
                                     "inBand": bool(inside), "z": round(d, 3)}


def _ratios(slot: str, ink: np.ndarray, solid: np.ndarray) -> dict:
    """The proportion bands that a SINGLE part canvas can answer. The other
    eleven (headsTall, headOverBody, shoulderY, hipY, stanceW ...) are
    assembly-level: they need two parts or the whole figure, so batch mode asks
    headOverBody across a set and the shipped gate asks it worst case against
    worst case. Measuring an assembly band off one canvas would report a number
    that means nothing, which is worse than not reporting it."""
    b = _box(ink)
    if b is None:
        return {}
    y0, y1, x0, x1 = b
    w = x1 - x0 + 1
    out = {}
    if slot == "head":
        neck_y = RIG["head"]["neck"][1]
        out["headH"] = (neck_y - y0) / H
        out["headFullW"] = w / H
    elif slot == "torso":
        # the torso's art carries FIGURE.skirt above its neck, so the BODY is
        # what is left once that overlap is taken off the top.
        out["bodyH"] = (y1 - (y0 + SKIRT)) / H
        out["bodyW"] = w / H
        out["bodyWOverH"] = out["bodyW"] / max(out["bodyH"], 1e-6)
    elif slot == "arm":
        sh_y = RIG["arm"]["shoulder"][1]
        out["armW"] = w / H
        out["armL"] = (y1 - sh_y) / H
        out["armLOverW"] = out["armL"] / max(out["armW"], 1e-6)
    elif slot == "leg":
        hip_y = RIG["leg"]["hip"][1]
        out["legH"] = (y1 - hip_y) / H
        lo = int(y1 - (y1 - y0) * 0.25)
        widest = 0
        for y in range(max(lo, 0), y1 + 1):
            for a, bb in runs(ink[y]):
                widest = max(widest, bb - a)
        out["footW"] = widest / H
        # footH is deliberately NOT reported. Measuring it as "the bottom
        # quarter of the leg box" is circular, and it put the contract's own
        # placeholder leg outside its own band at 0.073 against a floor of
        # 0.100. A band nobody can measure without inventing the answer is a
        # band this judge stays out of.
    return out


def _light(rgb: np.ndarray, clay: np.ndarray) -> dict:
    """THE LIGHT LAW, measured. One soft key from directly above means the
    row-mean value of the CLAY falls from rampTop to rampBottom over the part's
    own height, and the left-to-right ratio stays inside lateralMax. A limb cut
    out of a side-lit render passes silhouette, passes paint and fails here,
    and before this axis nothing in the pipeline was asking."""
    if clay.sum() < 200:
        return {"ok": False}
    v = rgb.max(axis=2) / 255.0
    ys = np.where(clay.any(1))[0]
    xs = np.where(clay.any(0))[0]
    y0, y1, x0, x1 = ys[0], ys[-1], xs[0], xs[-1]
    hh = max(y1 - y0 + 1, 1)
    ww = max(x1 - x0 + 1, 1)

    def mean_in(sel):
        m = clay & sel
        return float(v[m].mean()) if m.sum() >= 40 else float("nan")

    band = np.zeros_like(clay)
    band[y0:y0 + max(hh // 4, 1)] = True
    v_top = mean_in(band)
    band = np.zeros_like(clay)
    band[y1 - max(hh // 4, 1) + 1:y1 + 1] = True
    v_bot = mean_in(band)
    band = np.zeros_like(clay)
    band[:, x0:x0 + max(ww // 4, 1)] = True
    v_left = mean_in(band)
    band = np.zeros_like(clay)
    band[:, x1 - max(ww // 4, 1) + 1:x1 + 1] = True
    v_right = mean_in(band)

    # the whole ramp, not just its ends: the row means must go DOWN.
    rows = []
    for y in range(y0, y1 + 1):
        m = clay[y]
        if m.sum() >= 8:
            rows.append((y, float(v[y][m].mean())))
    slope_r = 0.0
    if len(rows) > 8:
        yy = np.array([r[0] for r in rows], float)
        vv = np.array([r[1] for r in rows], float)
        yy = (yy - yy.mean()) / (yy.std() + 1e-9)
        vv = (vv - vv.mean()) / (vv.std() + 1e-9)
        slope_r = float((yy * vv).mean())

    # THE RAMP IS APPLIED ONCE ACROSS A WHOLE PART, NEVER PER SHAPE, and it is
    # purely vertical: the contract's own words. So take the clay's value, strip
    # the row mean out of it, and whatever is left is shading that is NOT the
    # one key light. A part with a shadow baked under every moulded feature, or
    # a nostril the cutter carried in from a face, keeps a large residual; the
    # contract's own placeholder keeps a small one. Measured across the 40
    # shipped parts and the 40 placeholders: ruler 0.16 to 0.55, shipped 0.53 to
    # 0.94, and the eight untouched placeholder weapons read 0.000 because flat
    # vector clay has no shading at all.
    resid = np.zeros_like(v)
    for y in range(y0, y1 + 1):
        m = clay[y]
        if m.sum() >= 8:
            resid[y][m] = v[y][m] - v[y][m].mean()
    lateral_resid = float(np.std(resid[clay])) / max(float(np.std(v[clay])), 1e-6)

    want = LIGHT["rampBottom"] / LIGHT["rampTop"]
    got = v_bot / v_top if v_top == v_top and v_top > 1e-6 else float("nan")
    lat = (max(v_left, v_right) / max(min(v_left, v_right), 1e-6)
           if v_left == v_left and v_right == v_right else float("nan"))
    return {
        "ok": True,
        "vTop": round(v_top, 4), "vBottom": round(v_bot, 4),
        "rampRatio": round(got, 4) if got == got else None,
        "rampWant": round(want, 4),
        "rampCorr": round(slope_r, 3),
        "rampResidual": round(lateral_resid, 4),
        "lateralRatio": round(lat, 4) if lat == lat else None,
        "lateralMax": LIGHT["lateralMax"],
    }


def _clean(a: np.ndarray, ink: np.ndarray, matte_info: dict | None = None) -> dict:
    """HOW CLEANLY THE PART WAS CUT. Four questions: a second blob (a cast
    shadow, a stray tooth, a piece of the neighbouring limb), a hole punched
    through the body, a fat semi-transparent halo, and the RIM.

    THE RIM IS READ, NOT KEYED. `matte_info` is what bots_sd_matte stored in
    the cut PNG: rimEdgeRecall, the share of the matte's boundary that had a
    render edge beside it, measured on the raw render before the pixels
    outside the matte were discarded. It cannot be re-derived here, because
    after the cut the outside pixels are gone, and it must not be derived by
    colour, because the plate is the body's own grey. A part with no stored
    number (the shipped set, cut by the old magenta key) reports None and is
    scored neutral on this term; the report says so."""
    lab, n = ndimage.label(ink)
    sizes = np.bincount(lab.ravel())[1:] if n else np.array([])
    big = int((sizes >= 32).sum()) if n else 0
    largest = float(sizes.max() / max(ink.sum(), 1)) if n else 0.0
    filled = ndimage.binary_fill_holes(ink)
    holes = int((filled & ~ink).sum())
    alpha = a[..., 3]
    fringe = int(((alpha > 0) & (alpha < 250)).sum())
    rim = None
    if matte_info and isinstance(matte_info.get("rimEdgeRecall"), (int, float)):
        rim = float(matte_info["rimEdgeRecall"])
    return {"components": big, "largestShare": round(largest, 5), "holes": holes,
            "fringePx": fringe, "fringeShare": round(fringe / max(int(ink.sum()), 1), 5),
            "rimEdgeRecall": rim,
            "rimSource": "bots_sd_matte (stored in the cut PNG)" if rim is not None else
                         "not measured: no cut-time record in this PNG (an old-pipeline part, or a cut made outside bots_sd_matte)",
            "controlEdgeRecall": (matte_info or {}).get("controlEdgeRecall")}


def _detail(rgb: np.ndarray, solid: np.ndarray, ref: np.ndarray | None) -> dict:
    """STYLE, as the one thing that separates finished art from clean clay.

    The eight shipped weapons ARE the untouched placeholder: same silhouette,
    same pivots, same paint, and on every geometric axis they beat real art. A
    judge without this measure has its taste exactly inverted on a fifth of the
    catalogue. Laplacian energy inside the eroded silhouette (eroded so the
    outline itself is not counted as detail) separates them cleanly: the clay
    ruler runs flat, a concept-derived part carries surface."""
    inner = ndimage.binary_erosion(solid, iterations=3)
    if inner.sum() < 200:
        inner = solid
    v = (rgb.max(axis=2) / 255.0)
    lap = ndimage.laplace(v)
    e = float(np.abs(lap)[inner].mean()) if inner.sum() else 0.0
    out = {"laplacian": round(e, 6)}
    if ref is not None:
        out["vsRuler"] = round(e / max(ref_energy(ref), 1e-9), 3)
    return out


_LIGHT_TARGET: dict = {}


def slot_light_target(slot: str, cache=None) -> tuple[float, float, float]:
    """What the vertical ramp should measure ON THIS SLOT, taken from the
    contract's own placeholder.

    The contract states one global ramp, rampTop 1.00 falling to rampBottom
    0.48, and then states the exception in the same block: the torso's top band
    sits at headShadowOnTorso of the head's base value "because the head shades
    it". A torso therefore gets BRIGHTER downward by design, and scoring it
    against the global ramp marked every torso in the catalogue at 0.01 out of
    1, including the contract's own drawing of one. A judge that fails the
    placeholder is measuring the wrong thing.

    A leg is the same story for a different reason: the instep faces the key, so
    the contract's own leg placeholder measures a ratio of 0.94, not 0.48.

    So the per-slot target is READ OFF THE RULER, the drawing the bake makes
    from the contract, and the global law is kept alongside it in the report as
    the cross-check. One consequence worth saying out loud: this axis can only
    ever say "this part carries the light the contract's own placeholder
    carries", which is exactly the question a mixable catalogue needs answered,
    and it re-derives itself the day the bake changes."""
    if slot not in _LIGHT_TARGET:
        rs, cs, xs = [], [], []
        for t in TIERS:
            for d in DESIGNS:
                r = ruler(slot, t, d, cache)
                a = r
                acc = accents_of(a)
                clay = (a[..., 3] >= OPAQUE) & ~acc
                li = _light(a[..., :3].astype(np.float64), clay)
                if li.get("ok") and li["rampRatio"]:
                    rs.append(li["rampRatio"])
                    cs.append(li["rampCorr"])
                    xs.append(li["rampResidual"])
        if not rs:
            _refuse(f"the ruler for {slot} carries no clay to read a light target from")
        _LIGHT_TARGET[slot] = (float(np.median(rs)), float(np.median(cs)), float(np.median(xs)))
    return _LIGHT_TARGET[slot]


_REF_E: dict = {}


def ref_energy(ref: np.ndarray) -> float:
    k = id(ref)
    if k not in _REF_E:
        solid = ref[..., 3] >= OPAQUE
        inner = ndimage.binary_erosion(solid, iterations=3)
        if inner.sum() < 200:
            inner = solid
        v = ref[..., :3].max(axis=2) / 255.0
        _REF_E[k] = float(np.abs(ndimage.laplace(v))[inner].mean()) if inner.sum() else 1e-9
    return _REF_E[k]


def _disc(r: int) -> np.ndarray:
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


_DEPTH_CACHE: dict = {}


def depth_map(slot: str, tier: int, design: int, controls_root: str | None = None) -> tuple:
    """The depth control map for one part ON THE CONTRACT CANVAS, read from
    the controls root the cut itself names (bots_sd_matte stores controlsRoot
    in the cut PNG; the v2 slice names art-src/sd/controls/v2) or, for a cut
    that names none, from DEFAULT_CONTROLS. Returns (map as float 0..1 or
    None, the path looked at).

    A MISSING map is reported, not refused: art-src is not in the repo
    (gitignored; scripts/sd/bots-sd-controls.py builds it), the UNSHADED bar
    is calibrated on the render's OWN spread, and the depth's spread is the
    reference the report carries beside it. A map of the WRONG SIZE is
    refused: that is a broken control set, not an absent one, and a
    reference taken off the wrong canvas would be a confident wrong number."""
    root = controls_root or DEFAULT_CONTROLS
    part = f"{slot}-t{tier}-{design}"
    key = (root, part)
    if key not in _DEPTH_CACHE:
        p = os.path.join(ROOT, *root.replace("\\", "/").split("/"), "contract", part, "depth.png")
        if not os.path.exists(p):
            _DEPTH_CACHE[key] = (None, p)
        else:
            d = np.asarray(Image.open(p).convert("L")).astype(np.float64) / 255.0
            cw, ch = RIG[slot]["w"], RIG[slot]["h"]
            if d.shape != (ch, cw):
                _refuse(f"the depth map {p} is {d.shape[1]}x{d.shape[0]} and the contract canvas for the {slot} "
                        f"is {cw}x{ch}. The UNSHADED reference would be read off the wrong canvas; rebuild the "
                        f"controls with scripts/sd/bots-sd-controls.py")
            _DEPTH_CACHE[key] = (d, p)
    return _DEPTH_CACHE[key]


def _value_spread(v: np.ndarray, region: np.ndarray) -> tuple[float, float]:
    """Interquartile range of v over the region, divided by its median, and
    the median. Relative to the median so a dark render and a bright one
    measure the same; quartiles so a small bright accent or a leftover
    line cannot reach it the way the 10th and 90th percentiles can."""
    x = v[region]
    med = float(np.median(x))
    return float((np.percentile(x, 75) - np.percentile(x, 25)) / max(med, 1e-6)), med


def unshaded_measure(a_raw: np.ndarray, slot: str, tier: int, design: int,
                     matte_info: dict | None = None) -> dict:
    """THE UNSHADED MEASURE, on the raw cut. See the header for why it exists
    and how the bar was set. Returns the report block; the caller applies the
    bar. Nothing here reads the normalised part.

      value     the file's own value channel, max(r, g, b) / 255
      filled    dark lines narrower than 2 * UNSHADED_LINE_PX + 1 px filled
                from their surroundings by a grey closing, then smoothed, so
                the ink of an outline drawing does not count as shading
      region    solid ink eroded by UNSHADED_ERODE, minus the SHIPPED accent
                classifier's pixels (accents_of, the same function the mask
                deriver runs): the body only. Falls back to the eroded ink
                when that leaves under UNSHADED_MIN_PX, and says so.
      spread    interquartile range of the filled value over the region,
                divided by its median. THE NUMBER THE RULE IS ASKED OF.
      flatShare share of the region within UNSHADED_FLAT of the median: the
                plain-words diagnostic ("86 percent of the body is one tone")
      depthSpread, shadeShare
                the same spread taken on the depth control map over the same
                region (a depth map is the picture a headlight makes of the
                surface, so its spread is the shading the control implies),
                and the render's spread as a share of it. Reference only;
                the header records why the rule is not asked of the share."""
    alpha = a_raw[..., 3]
    solid = alpha >= OPAQUE
    value = a_raw[..., :3].astype(np.float64).max(axis=2) / 255.0
    filled = ndimage.gaussian_filter(ndimage.grey_closing(value, footprint=_disc(UNSHADED_LINE_PX)),
                                     UNSHADED_SMOOTH)
    inner = ndimage.binary_erosion(solid, iterations=UNSHADED_ERODE)
    region = inner & ~accents_of(a_raw)
    region_is = (f"the body: solid ink eroded {UNSHADED_ERODE} px, minus the shipped accent classifier's pixels "
                 f"(scripts/bots-paint-masks.py accents_of, on the raw cut)")
    if int(region.sum()) < UNSHADED_MIN_PX:
        region = inner
        region_is = (f"the solid ink eroded {UNSHADED_ERODE} px, accents included: the accent set left under "
                     f"{UNSHADED_MIN_PX} px of body")
    out = {
        "measuredOn": "the raw cut, before the importer's normalisation (which turns a flat white outline into "
                      "uniform clay and hides it)",
        "rule": f"UNSHADED fires when spread is under {UNSHADED_BAR}",
        "bar": UNSHADED_BAR, "region": region_is, "regionPx": int(region.sum()),
        "lineFillPx": 2 * UNSHADED_LINE_PX + 1, "erodePx": UNSHADED_ERODE, "smoothSigma": UNSHADED_SMOOTH,
        "spread": None, "median": None, "flatShare": None,
        "depthSpread": None, "shadeShare": None, "depthMap": None,
        "calibrated": UNSHADED_CALIBRATION,
    }
    if int(region.sum()) < UNSHADED_MIN_PX:
        out["note"] = f"not measured: under {UNSHADED_MIN_PX} px of solid ink inside the rim; the rule stays silent"
        return out
    spread, med = _value_spread(filled, region)
    out["spread"] = round(spread, 5)
    out["median"] = round(med, 4)
    out["flatShare"] = round(float((np.abs(filled[region] - med) < UNSHADED_FLAT * med).mean()), 4)
    d, dpath = depth_map(slot, tier, design, (matte_info or {}).get("controlsRoot"))
    out["depthMap"] = os.path.relpath(dpath, ROOT).replace("\\", "/") if d is not None else None
    if d is None:
        out["depthNote"] = (f"no depth map at {os.path.relpath(dpath, ROOT)} (art-src is built locally by "
                            f"scripts/sd/bots-sd-controls.py); the reference is not reported, the rule is unchanged")
    else:
        d_filled = ndimage.gaussian_filter(ndimage.grey_closing(d, footprint=_disc(UNSHADED_LINE_PX)),
                                           UNSHADED_SMOOTH)
        d_spread, _ = _value_spread(d_filled, region)
        out["depthSpread"] = round(d_spread, 5)
        out["shadeShare"] = round(spread / d_spread, 4) if d_spread > 1e-6 else None
    return out


def derive_shipped(path: str) -> tuple[float, int]:
    """Paint share and unmasked body for a candidate that has no mask yet,
    answered by the SHIPPED deriver in DRY mode. Writes nothing."""
    return derive(os.path.basename(path), path, None, None)


def write_mask(path: str, out_png: str, out_mask: str) -> None:
    """Run the shipped deriver for real, into a staging path. Used only to give
    the gate something to read; never points at the repo."""
    _MASKS.DRY = False
    try:
        derive(os.path.basename(path), path, out_png, out_mask)
    finally:
        _MASKS.DRY = True


def eye_lenses(a: np.ndarray, acc: np.ndarray, solid: np.ndarray, slot: str, hsv=None) -> dict:
    """THE EYE LENS, which is the one thing on a head that must never take the
    body colour, and which nothing in the pipeline was checking.

    Measured 2026-09-05 on the shipped set: paint every head coral through its
    own shipped mask and THE EYES GO CORAL. The law's glass band wants
    saturation 0.15 or more; the lenses on all eight heads are a near-white
    dome highlight at saturation 0.08, so the law classifies them as paintable
    clay, the mask covers them, and the gate cannot see it because the gate
    only ever asks whether the mask agrees with the law. It does agree. The law
    is what is not seeing the lens.
    (That was the old cyan `glass` band, which no pixel in the game ever
    matched. The law now carries an `eye` band for the warm white bulb, and it
    is read below BY NAME, exactly as the gate's FACE check reads it; if the
    band is missing this ranker refuses rather than guessing a lens colour.)

    So this asks two questions, not one:
      1. is there law-classified GLASS on this head, as one or two round blobs
         in the upper part of the face (the contract's designs run one eye and
         two);
      2. is there a bright round disc there that is NOT an accent, which is a
         lens the paint is about to land on.
    A head that answers no to 1 and yes to 2 is the shipped failure exactly."""
    g = LAW["accents"].get("eye")
    if g is None:
        _refuse('the paintable law has no "eye" band. The shipped gate (bots-art-check.mts FACE) '
                'refuses on the same absence, and this ranker reads that band rather than guessing '
                'a lens colour.')
    h, s, v = hsv if hsv is not None else hsv_full(a[..., :3].astype(np.float64))
    glass = solid & (h >= g["hueMin"]) & (h <= g["hueMax"]) & (s >= g["satMin"]) & (v > g["valueMin"])
    if "satMax" in g:
        glass &= s <= g["satMax"]
    ink = a[..., 3] > 0
    b = _box(ink)
    out = {"eyeBandPx": int(glass.sum()), "lensBlobs": 0, "suspectPx": 0, "suspectBlobs": 0}
    if b is None:
        return out
    y0, y1, x0, x1 = b
    face = np.zeros_like(ink)
    face[y0:int(y0 + (y1 - y0) * 0.65) + 1, :] = True

    def round_blobs(m, lo=400):
        # bincount plus find_objects, not a full-canvas comparison per label:
        # a head can carry two hundred specks and the naive loop cost more than
        # every other measurement in this file put together.
        lab, n = ndimage.label(m)
        if not n:
            return 0, 0
        sizes = np.bincount(lab.ravel(), minlength=n + 1)
        keep = px = 0
        for i, sl in enumerate(ndimage.find_objects(lab), start=1):
            k = int(sizes[i])
            if k < lo or sl is None:
                continue
            ar = (sl[1].stop - sl[1].start) / max(sl[0].stop - sl[0].start, 1)
            if 0.45 <= ar <= 2.2:
                keep += 1
                px += k
        return keep, px

    # THE EYE IS AN ACCENT, and the law does not say which one. The contract's
    # own placeholder draws a cream lens that the law catches in its BRASS band,
    # not its eye band, and asking specifically for the eye band refused the ruler:
    # a judge that fails the contract's own drawing is measuring the wrong
    # thing. What actually has to be true is that the eye is in the accent set,
    # because that is what makes the paint skip it. So the eye is looked for in
    # ACCENTS, and the eye-band count is kept only as a diagnostic.
    out["lensBlobs"], out["lensPx"] = round_blobs(acc & solid & face)
    out["eyeBandBlobs"], _ = round_blobs(glass & face)

    # THE LENS CORE IS NO LONGER GUESSED FROM A BOX ROUND THE BLOB. This
    # function used to grow each eye-shaped accent blob's box by a third and
    # count the clay in it that was bright against its own row, calling that
    # the unprotected lens. Measured 2026-09-05 against the eight SHIPPED
    # heads, whose eyes the importer had already pinned entirely inside the
    # law's band: it read 0.40 to 0.83, because what sits in a box a third
    # bigger than the eye is the CHEEK, and a cheek beside a lit bulb is bright
    # against its row. A rule that rejects every head that ships is not a
    # rule. The question is now asked in score_image on the importer's own
    # lens and ring mask, after the importer's own pin: the share of that mask
    # the accent set does not hold. That is the exact set of pixels the paint
    # would land on.

    clay = solid & ~acc
    if clay.sum() > 500:
        med = float(np.median(v[clay]))
        bright = clay & face & (v > med + 0.14)
        out["suspectBlobs"], out["suspectPx"] = round_blobs(bright, 500)
    return out


# ── 6. the judge ──────────────────────────────────────────────────────────

WEIGHTS = {
    "fit": 34.0,     # "parts out of place, wrong zoom" is the named defect
    "light": 18.0,   # the one-key law, and the only axis that sees a side-lit cut
    "paint": 18.0,   # eight paints have to land, and the lens must survive them
    "clean": 12.0,   # keying leftovers
    "style": 18.0,   # clean clay is not finished art
}


VERDICTS = ("RANKED", "REJECT", "REFUSED")   # there is no PASS

NOTE = ("THE COMPOSITE IS A RANKING, NOT A PASS MARK. It orders the survivors inside ONE part's "
        "candidate pool (one slot, tier and design) and means nothing across pools, against the "
        "ruler, or against a threshold. A candidate with any hard failure is REJECT and is never "
        "selected, whatever its composite. There is no number above which a part is good.")


def _clamp01(x: float) -> float:
    return 0.0 if x != x else max(0.0, min(1.0, x))


def _pool(slot: str, tier: int, design: int, shape: str | None = None) -> str:
    """A pool is a set of candidates that compete with each other, and two
    shapes never do: a bear head and a bell head are different drawings for
    different buyers, so ranking them against each other would pick a winner
    for a slot instead of a winner for a shape. With no shape named this is
    the string it always was."""
    return f"{slot}-t{tier}-{design}" if not shape else f"{slot}-{shape}-t{tier}-{design}"


def score_image(path: str, slot: str, tier: int, design: int,
                cache: str | None = None, fit: bool = False,
                normalised_out: str | None = None,
                shape: str | None = None, ruler_path: str | None = None,
                table: str | None = None) -> dict:
    """Judge one candidate AS IT WOULD SHIP. `normalised_out` names a PNG to
    keep the normalised pixels in (batch and select write one per candidate
    under <out>/normalised so the contact sheets show what ships); with none
    given the file is a temp that is removed once the deriver has read it.

    `shape` / `ruler_path` / `table` choose WHICH DRAWING the silhouette, the
    fit centring and the STYLE reference are measured against; see section 4a.
    With all three None this is the ship-table ruler and every number below is
    the number it was before that section existed. No rule and no bar reads
    them: they change the ruler, never the law."""
    if slot not in SLOTS:
        _refuse(f"{slot} is not one of the contract's slots {SLOTS}")
    cw, ch = RIG[slot]["w"], RIG[slot]["h"]
    im0 = Image.open(path)
    # A RAW RENDER IS NOT A CANDIDATE. Without an alpha channel every pixel is
    # ink, every edge is CLIPPED and the plate is scored as body: a wrong
    # answer with a confident number on it. And the silhouette cannot be
    # recovered here by colour, because the plate is the body's own grey by
    # design. Refuse, and say where the cut comes from.
    has_alpha = ("A" in im0.getbands()) or (im0.mode == "P" and "transparency" in im0.info)
    if not has_alpha:
        return {"file": path, "slot": slot, "tier": tier, "design": design,
                "verdict": "REFUSED", "composite": 0.0, "pool": _pool(slot, tier, design, shape),
                "fail": ["NO ALPHA: this is a raw render, not a cut part. Nothing here keys a render off "
                         "its plate (the plate is the body's own grey). Cut it against the control alpha "
                         "with scripts/sd/bots_sd_matte.py, which bots-sd-render.py does into "
                         "<out>/<part>/cut/, and judge the cut."], "warn": [], "axes": {}}
    matte_info = None
    raw = im0.info.get(_MATTE.PNG_KEY)
    if raw:
        try:
            matte_info = json.loads(raw)
        except Exception:
            matte_info = None
    im = im0.convert("RGBA")
    # THE RULER FOR THE SHAPE BEING JUDGED, resolved and verified BEFORE
    # anything is measured or written. With no shape and no --ruler this is
    # ruler(slot, tier, design, cache), the ship-table placeholder, exactly as
    # it always was; see section 4a. It is resolved here rather than beside
    # its first use because a bad instrument must refuse before the
    # normalisation writes its temp file, and rank-part-check's "nothing in
    # the repo moved" caught exactly that leak on 2026-09-05.
    r = ruler_for(slot, tier, design, cache, shape=shape, ruler_path=ruler_path, table=table)
    fitted = None
    if (im.width, im.height) != (cw, ch):
        if not fit:
            return {"file": path, "slot": slot, "tier": tier, "design": design,
                    "verdict": "REFUSED", "composite": 0.0, "pool": _pool(slot, tier, design, shape),
                    "fail": [f"canvas is {im.width}x{im.height}, the contract says {cw}x{ch}. "
                             f"Pass --fit to scale and centre a raw render before scoring, and read "
                             f"the score knowing it was fitted, not registered."]}
        im, fitted = _fit_to_canvas(im, slot, tier, design, cache,
                                    shape=shape, ruler_path=ruler_path, table=table)
    a_raw = np.asarray(im).astype(np.uint8)
    if not (a_raw[..., 3] > 0).any():
        return {"file": path, "slot": slot, "tier": tier, "design": design,
                "verdict": "REJECT", "composite": 0.0, "pool": _pool(slot, tier, design, shape),
                "fail": ["the canvas is empty"]}

    # THE IMPORTER'S OWN NORMALISATION, on a copy, before any rule looks. From
    # here on every measurement is of the part as it would ship; the raw cut
    # survives only as the thing the repair count is taken against.
    a, norm, nmasks = normalise_as_shipped(a_raw, slot, tier)
    norm_png = _normalised_path(path, normalised_out)
    Image.fromarray(a, "RGBA").save(norm_png, compress_level=1)
    rgb = a[..., :3].astype(np.float64)
    hsv = hsv_full(rgb)                 # ONE pass, handed to every consumer
    alpha = a[..., 3]
    ink = alpha > 0
    solid = alpha >= OPAQUE
    r_ink = r[..., 3] > 0

    fail: list[str] = []
    warn: list[str] = []
    parts: dict = {}

    # ── FIT ───────────────────────────────────────────────────────────────
    inter = int((ink & r_ink).sum())
    union = int((ink | r_ink).sum())
    iou = inter / max(union, 1)
    cy, cx = ndimage.center_of_mass(ink)
    ry, rx = ndimage.center_of_mass(r_ink)
    dy, dx = int(round(ry - cy)), int(round(rx - cx))
    shifted = np.roll(np.roll(ink, dy, axis=0), dx, axis=1)
    iou_shift = int((shifted & r_ink).sum()) / max(int((shifted | r_ink).sum()), 1)

    b = _box(ink)
    y0, y1, x0, x1 = b
    edge = {"top": int(ink[0].sum()), "bottom": int(ink[-1].sum()),
            "left": int(ink[:, 0].sum()), "right": int(ink[:, -1].sum())}
    margin = min(x0, cw - 1 - x1, y0, ch - 1 - y1)
    if any(edge.values()):
        fail.append(f"CLIPPED: ink on the canvas edge ({', '.join(f'{k} {v}' for k, v in edge.items() if v)}); "
                    f"the contract carries a {MARGIN} px margin for exactly this")

    # THE GATE'S OWN TEST, on the gate's own pixels. Its helper is called
    # opaqueNear but it asks alphaAt(...) > 0, which is ANY ink, not solid ink.
    # Judging the pivot on solid instead reported AIR on arm t1-1 (nearest
    # solid pixel 7.8px, nearest ink pixel inside the radius) against a gate
    # that passes it, and the gate is the authority on the verdict. The naming
    # is worth someone's attention; the behaviour is what is copied.
    dist = ndimage.distance_transform_edt(~ink)
    pivots = {}
    for name, pt in RIG[slot].items():
        if name in ("w", "h") or not isinstance(pt, list):
            continue
        px, py = int(pt[0]), int(pt[1])
        if px < 0 or py < 0 or px >= cw or py >= ch:
            pivots[name] = {"offCanvas": True}
            continue
        d = float(dist[py, px])
        pivots[name] = {"dist": round(d, 2)}
        if d > RADIUS:
            fail.append(f"AIR: rig point {name} ({px},{py}) has no solid pixel within {RADIUS}px "
                        f"(nearest is {d:.1f}px)")

    burial = None
    if slot in ("arm", "leg"):
        pivot_y = RIG[slot]["shoulder" if slot == "arm" else "hip"][1]
        run = int(solid[pivot_y].sum())
        burial = (pivot_y - y0) / run if run else 0.0
        if burial < JOIN["burialMin"] or burial > JOIN["burialMax"]:
            fail.append(f"BURIAL: the pivot sits {burial:.2f} of the limb's own width ({run}px) below "
                        f"its ink top; the join law says {JOIN['burialMin']} to {JOIN['burialMax']}")

    ratios = _ratios(slot, ink, solid)
    band_scores = {}
    for k, got in ratios.items():
        s, info = _band_score(k, got)
        band_scores[k] = s
        info["score"] = round(s, 3)
        ratios[k] = info
        if not info["inBand"]:
            warn.append(f"BAND {k} = {info['got']}, outside {info['min']}..{info['max']}")

    margin_score = _clamp01(margin / max(MARGIN, 1))
    pivot_score = _clamp01(
        1.0 - max([p.get("dist", 0.0) for p in pivots.values() if "dist" in p] or [0.0]) / max(RADIUS, 1)
    )
    if burial is not None:
        lo, tg, hi = JOIN["burialMin"], JOIN["burial"], JOIN["burialMax"]
        burial_score = _clamp01(1.0 - abs(burial - tg) / max(max(tg - lo, hi - tg), 1e-6))
    else:
        burial_score = 1.0
    band_mean = float(np.mean(list(band_scores.values()))) if band_scores else 1.0
    eye_size = None
    if slot == "head":
        # EYE SIZE, the soft term. On a head the burial term (a limb question)
        # and a tenth of the silhouette term become the size of the eye the
        # importer will draw, over the head's own width: the concept eyes are
        # large and low, and a head whose eyes are pinholes at fight size is a
        # proportion defect the bands do not see. Never a rule; see
        # eye_size_score and its calibration.
        core_ink = ink & (np.arange(ink.shape[0])[:, None] <= int(RIG["head"]["neck"][1]))
        cxs = np.where(core_ink.any(0))[0]
        head_w = int(cxs[-1] - cxs[0] + 1) if len(cxs) else 1
        r_over_w = (float(norm["face"]["r"]) / head_w) if norm.get("face") else None
        eye_size = {"r": norm["face"]["r"] if norm.get("face") else None, "headW": head_w,
                    "rOverW": round(r_over_w, 4) if r_over_w is not None else None,
                    "score": round(eye_size_score(r_over_w), 4),
                    "floor": EYE_SIZE_FLOOR, "full": EYE_SIZE_FULL, "warnUnder": EYE_SIZE_WARN,
                    "calibrated": "the eight shipped heads read 0.063 to 0.094, the concept about 0.08 to 0.10, "
                                  "production heads called large 0.097 to 0.111 and small 0.015 to 0.056"}
        if r_over_w is not None and r_over_w < EYE_SIZE_FLOOR:
            # THE HARD RULE. A pair the importer would draw at pinhole size is
            # not the eyes. Measured 2026-09-05: two cyclops heads passed this
            # judge because find_eyes took two lit side nubs for the pair
            # (0.024 and 0.026 of head width) and this was only a warning.
            fail.append(f"EYE SIZE: the eye the importer will draw has radius {norm['face']['r']} px, "
                        f"{r_over_w:.3f} of the head's width, under the floor {EYE_SIZE_FLOOR}; the shipped heads "
                        f"run {EYE_SIZE_CALIBRATION['liveMin']} to {EYE_SIZE_CALIBRATION['liveMax']}. A pair the "
                        f"importer would draw at pinhole size is not the eyes: on 2026-09-05 two cyclops heads "
                        f"passed this judge because find_eyes took two lit side nubs for the pair (0.024 and "
                        f"0.026) and the size was only a warning.")
        if r_over_w is not None and r_over_w < EYE_SIZE_WARN:
            warn.append(f"SMALL EYES: the eye the importer will draw has radius {norm['face']['r']} px, "
                        f"{r_over_w:.3f} of the head's width; the shipped heads run 0.063 to 0.094 and the "
                        f"concept about 0.08 to 0.10. At fight size these read as pinholes. A soft term, "
                        f"scored {eye_size['score']:.2f} of 1 on the fit axis")
        fit_score = (0.32 * iou + 0.10 * iou_shift + 0.16 * band_mean
                     + 0.14 * pivot_score + 0.20 * eye_size["score"] + 0.08 * margin_score)
    else:
        fit_score = (0.42 * iou + 0.10 * iou_shift + 0.16 * band_mean
                     + 0.14 * pivot_score + 0.10 * burial_score + 0.08 * margin_score)
    parts["fit"] = _clamp01(fit_score)

    # ── PAINT ─────────────────────────────────────────────────────────────
    acc = accents_of(a)
    visible = int(ink.sum())
    # the SHIPPED deriver, DRY, handed the NORMALISED pixels: it reads a
    # candidate from its path, so the path it gets is the one that would ship
    try:
        share, unmasked = derive_shipped(norm_png)
    finally:
        if not normalised_out:
            try:
                os.remove(norm_png)
            except OSError:
                pass
    metal = solid & gate_is_metal(rgb, hsv)
    metal_share = int(metal.sum()) / max(visible, 1)

    # THE FACE FIRST. A head the importer cannot give a face to ships nothing,
    # so NO FACE FOUND leads every other paint rule on it: the paint share of a
    # part that never reaches the parts folder is a footnote.
    hh, ss, vv = hsv
    clay = solid & ~acc
    clay_sat = float(ss[clay].mean()) if clay.sum() > 200 else 0.0
    clay_v = float(vv[clay].mean()) if clay.sum() > 200 else 0.0
    eye = eye_lenses(a, acc, solid, slot, hsv)
    lens_ok = True
    if slot == "head":
        eye_m = nmasks.get("eye")
        if norm["faceFound"] is False or eye_m is None:
            # THE IMPORTER'S OWN REFUSAL. Its find_eyes found no pair of bright
            # blobs that are level, mirrored about the centre line and of
            # comparable size, so process() would return FAIL "no symmetric
            # pair of eyes on the head; refusing to ship a faceless bot" and
            # nothing of this head would reach the parts folder. A genuine
            # reject, named as such, and never LENS CORE PAINTED: there is no
            # lens to paint. The lens rules below are not asked of it; they
            # would be a second name for the same absence.
            lens_ok = False
            fail.append(
                f"NO FACE FOUND: the shipped importer's find_eyes (scripts/bots-import-parts.py) finds no "
                f"level, mirrored pair of lit eyes on this head (face band {_CUT.EYE_BAND['fyMin']} to "
                f"{_CUT.EYE_BAND['fyMax']} of head height down, {_CUT.EYE_BAND['fxMin']} to "
                f"{_CUT.EYE_BAND['fxMax']} out, level within {_CUT.EYE_BAND['levelMax']}, mirrored within "
                f"{_CUT.EYE_BAND['mirrorMax']}), so the importer would refuse to ship it as a faceless "
                f"bot. {eye['eyeBandPx']} pixels sit in the law's eye band and {eye['suspectPx']} in a "
                f"bright disc where an eye belongs; neither is a pair."
            )
        else:
            # THE LENS CORE, asked on the importer's own lens and ring mask
            # AFTER the importer's own pin: which of those pixels does the
            # accent set still not hold. That is exactly the set the paint
            # would land on, and on the eight shipped heads it is zero.
            eye_solid = eye_m & solid
            unprot = int((eye_solid & ~acc).sum())
            eye["lensMaskPx"] = int(eye_solid.sum())
            eye["lensMaskUnprotected"] = unprot
            eye["lensMaskShare"] = round(unprot / max(int(eye_solid.sum()), 1), 4)
            if eye["lensMaskShare"] > 0.15:
                lens_ok = False
                fail.append(
                    f"LENS CORE PAINTED: after the importer's own pin, {unprot} pixels of its lens and "
                    f"ring mask ({eye['lensMaskShare']:.0%} of it) are still classified as paintable clay. "
                    f"Painted, this head looks out of coral eyes. The eye lens and its bezel must never "
                    f"take the body colour. The law's eye band wants hue {LAW['accents']['eye']['hueMin']} "
                    f"to {LAW['accents']['eye']['hueMax']} and saturation {LAW['accents']['eye']['satMin']} "
                    f"to {LAW['accents']['eye'].get('satMax', 1.0)}; the pin puts every eye pixel there, so "
                    f"this can only happen if the law and the importer's authored colours have drifted "
                    f"apart.")
            elif eye["lensBlobs"] == 0:
                # The old LENS NOT AN ACCENT rule asked for an eye-SHAPED accent
                # blob. Once the mask test above has said every lens pixel is
                # an accent, a missing eye-shaped blob only means the eye's
                # accent touches another accent (the lit mouth, on a head whose
                # eyes sit low) and the two label as one wide blob. Measured on
                # stage1b: one head, mask 100 percent protected, rejected for
                # it. So it is a warning, not a rule.
                warn.append(f"EYE TOUCHES ANOTHER ACCENT: the lens mask ({eye['lensMaskPx']} px) is fully "
                            f"protected but no accent blob in the face zone is eye-shaped on its own; the "
                            f"eye's accent runs into a neighbouring one (the mouth, usually)")
            # THE MOUTH THE IMPORTER LIT, checked against the eyes it found.
            # find_grille takes the darkest blob that crosses the centre line
            # for the mouth, which held on every head the shipped generator
            # made. On the factory's renders it does not always hold: measured
            # on both stage-1 samples, 3 of 12 and 3 of 10 survivors carried a
            # dark crown hatch or two dark bezels joined by a dark brow band,
            # find_grille took THAT for the mouth, and light_grille span-filled
            # it into a pale gold cap on the crown or a gold band across the
            # eyes. The gate passes it (pale gold is the brass band, an
            # accent) and the player gets a bot in a gold hat. So the grille
            # the importer lit must sit BELOW the eye centres the importer
            # found; a mouth above the eyes is not a mouth. Nothing here is
            # re-implemented: both masks are the importer's, this only reads
            # where they landed. (find_grille has an eyes_y parameter it never
            # uses; the constraint belongs there, and that is the importer's
            # owner's call, not the judge's.)
            g_m = nmasks.get("grille")
            if g_m is not None and g_m.any():
                gy = np.where(g_m.any(1))[0]
                ecy = int(norm["face"]["eyes"][0][0])
                eye["grillePx"] = int(g_m.sum())
                eye["grilleRows"] = [int(gy[0]), int(gy[-1])]
                eye["grilleAboveEyes"] = bool(gy[0] < ecy)
                if gy[0] < ecy:
                    lens_ok = False
                    fail.append(
                        f"MOUTH MISPLACED: the importer's find_grille took a dark region at rows {int(gy[0])} to "
                        f"{int(gy[-1])} for the mouth and light_grille pinned it pale gold, but the eye centres "
                        f"it found sit at row {ecy}: the lit 'mouth' is on the brow or the crown, and would "
                        f"ship as a gold band there on all eight paints. The mouth must be the darkest thing "
                        f"on the centre line, below the eyes.")
            # THE THIRD EYE. The importer finds the eyes by geometry: the best
            # level, mirrored pair of lit blobs. On a cyclops render it finds
            # the two side bolts and lights them, and the big lens above stays
            # as drawn: a head with three eyes. On other renders a grille sits
            # above the eyes. Neither is a mouth, so MOUTH MISPLACED is silent,
            # and a person sees it at once. Measured on the importer's own face
            # and grille masks, see third_eye.
            core_m = ink & (np.arange(ink.shape[0])[:, None] <= int(RIG["head"]["neck"][1]))
            te = third_eye(a, core_m, norm["face"], eye_m, g_m, norm["centreX"])
            eye["thirdEye"] = te
            above = te["px"] >= THIRD_EYE_BAR
            on_row = bool((te.get("row") or {}).get("fires"))
            if above or on_row:
                lens_ok = False
                why = []
                if above:
                    where = (f"rows {te['box'][0]} to {te['box'][1]}, columns {te['box'][2]} to {te['box'][3]}, "
                             f"{te['rowFrac']:.2f} of head height down" if te["box"] else "in the zone")
                    why.append(
                        f"{te['px']} px above the eye line ({where}) sit {THIRD_EYE_DEPTH:.0%} darker than "
                        f"the clay within {THIRD_EYE_REACH} px of them, and they are not one of the two eyes the "
                        f"importer found (eye centres at row {int(norm['face']['eyes'][0][0])}, radius "
                        f"{norm['face']['r']}): a lens bezel, a pupil or a grille slot, so the head reads as "
                        f"three-eyed. Calibrated bar {THIRD_EYE_BAR} px: the shipped heads read up to "
                        f"{THIRD_EYE_CALIBRATION['liveMax']}, production heads with nothing above the eyes up to "
                        f"{THIRD_EYE_CALIBRATION['factoryCleanMax']}, and the ones a person called three-eyed "
                        f"{THIRD_EYE_CALIBRATION['factoryThirdEyeMin']} and up")
                if on_row:
                    # THE ROW. A cyclops lens LEVEL with two lit side nubs the
                    # importer took for the pair: the case that passed this
                    # judge on 2026-09-05. See third_eye's row block.
                    rw = te["row"]
                    why.append(
                        f"ON THE EYE ROW ITSELF a dark disc (a pupil, or a lit lens through its bezel) of radius "
                        f"{rw['discR']} px ({rw['discOverW']:.3f} of head width, {rw['discOverEye']:.1f}x the "
                        f"{norm['face']['r']} px eye the importer found; rows {rw['box'][0]} to {rw['box'][1]}, "
                        f"columns {rw['box'][2]} to {rw['box'][3]}) sits between the pair the importer found, "
                        f"and {rw['why']}: a cyclops lens level with two lit side nubs. The disc must be at least "
                        f"{THIRD_EYE_ROW_MIN} of head width across its radius ({rw['minR']} px here); the shipped "
                        f"heads and the design-1 survivors read up to {THIRD_EYE_ROW_CALIBRATION['cleanMaxPx']} px "
                        f"on the row, the cyclops that passed {THIRD_EYE_ROW_CALIBRATION['cyclopsPx'][0]} and up")
                fail.append("THIRD EYE: " + "; and ".join(why) + ".")

    coral = None
    if slot == "leg":
        # THE CORAL SOLE. pin_coral pins whatever coral it finds in the lower
        # 45 percent of the leg and never asks where; a render with a coral
        # rim along every panel and drips between the boots ships them all,
        # pinned. The live catalogue's boot is one clean coral block at the
        # bottom, and so is every concept boot. See coral_sole.
        coral = coral_sole(_CUT.largest_component(alpha), nmasks.get("shoe"))
        if coral["coralPx"] == 0 or coral["soleFrac"] < SOLE_MIN:
            lens_ok = False
            fail.append(
                f"NO SOLE: " + ("the importer's pin_coral found no coral on this leg" if coral["coralPx"] == 0 else
                                f"the sole band (rows at the bottom where coral covers at least {SOLE_COVER:.0%} of "
                                f"the row) is {coral['soleRows']} rows, {coral['soleFrac']:.1%} of the leg's height; "
                                f"the bar is {SOLE_MIN:.0%} and the live legs run "
                                f"{CORAL_CALIBRATION['liveSoleFrac'][0]:.0%} to {CORAL_CALIBRATION['liveSoleFrac'][1]:.0%}")
                + ". Coral is reserved for the feet and every shipped leg carries a coral sole.")
        elif coral["spill"] > CORAL_SPILL_BAR:
            lens_ok = False
            fail.append(
                f"CORAL SPILL: {coral['spill']:.1%} of the coral ({coral['spillPx']} px) sits outside the sole band "
                f"({coral['soleRows']} rows at the bottom, {coral['soleFrac']:.0%} of the leg), on {coral['rowsAbove']} "
                f"rows above it, in {coral['blobs']} blob{'s' if coral['blobs'] != 1 else ''}: drips, smears or a rim "
                f"that read as spilled paint. Coral must be one clean band at the bottom of the leg. Calibrated bar "
                f"{CORAL_SPILL_BAR:.1%}: the live legs read up to {CORAL_CALIBRATION['liveSpillMax']:.1%} and the "
                f"cleanest production leg {CORAL_CALIBRATION['factorySpillMin']:.1%}, "
                f"{CORAL_CALIBRATION['marginEachSide']}x either side.")

    if share < SHARE_MIN:
        fail.append(f"PAINT SHARE {share:.1%} is under the law's floor {SHARE_MIN:.0%}: a family whose "
                    f"whole body was mistaken for an accent takes no paint at all")
    if slot in CEILING_SLOTS and share > SHARE_MAX:
        fail.append(f"PAINT SHARE {share:.1%} is over {SHARE_MAX:.0%}: the mask has swallowed this "
                    f"slot's accent")
    if unmasked > LEFT_MAX:
        fail.append(f"UNPAINTED BODY {unmasked} solid pixels are neither masked nor an accent "
                    f"(bar {LEFT_MAX}); each keeps the colour it was drawn in, in all eight paints")
    if metal_share > BRASS_BUDGET:
        fail.append(f"BRASS BUDGET metal covers {metal_share:.1%}, budget is {BRASS_BUDGET:.0%}")
    if slot == "torso" and metal.sum() == 0:
        fail.append("BRASS MISSING: the torso carries the bot's one brass piece, the wind-up key")

    hardware = 0
    for name in GATE["joints"].get(slot, []):
        pt = RIG[slot].get(name)
        if not isinstance(pt, list):
            continue
        px, py = int(pt[0]), int(pt[1])
        if px < 0 or py < 0 or px >= cw or py >= ch:
            continue
        yy, xx = np.ogrid[:ch, :cw]
        near = (xx - px) ** 2 + (yy - py) ** 2 <= GATE["guard"] ** 2
        n = int((metal & near).sum())
        hardware += n
        if n:
            fail.append(f"HARDWARE {n} brass pixels within {GATE['guard']}px of the {name} joint; "
                        f"a joint that needs hardware to read is a joint drawn at the wrong size")

    bezel_painted = 0  # brass is an accent by the law, so a bezel can only be lost to a band change
    if int((metal & ~acc).sum()):
        bezel_painted = int((metal & ~acc).sum())
        warn.append(f"BEZEL AT RISK: {bezel_painted} metal pixels are not in the accent set")

    # COLOUR NEUTRALITY, asked of the RENDER, not of the normalised part.
    # After the importer's clay pass the clay is neutral by construction
    # (measured 0.057 on everything), so the question "did the model leak the
    # reference's colour into the body" is asked of the raw clay's saturation
    # and answered by the repair count: every leaked pixel is a pixel the
    # importer had to move. The old band (clay saturation 0.02 to 0.07,
    # calibrated on the shipped set) is kept as the warning's bar.
    raw_sat = norm.get("rawClaySat")
    if raw_sat is not None and raw_sat > 0.16:
        warn.append(f"NOT NEUTRAL: the render's clay carried {raw_sat:.2f} saturation before the importer's "
                    f"clay pass took it to neutral; counted as repair "
                    f"({norm['byRegion'].get('clay', 0)} clay pixels moved by more than {REPAIR_LEVELS} levels)")
    # THE REPAIR. The importer will move these pixels whatever the judge says;
    # the count is what separates a render that arrived nearly right from one
    # the importer had to rebuild. Scored against REPAIR_FULL, calibrated.
    repair_share = float(norm.get("repairShare", 0.0))
    repair_score = _clamp01(1.0 - repair_share / REPAIR_FULL)
    if repair_share > REPAIR_WARN:
        warn.append(f"HEAVY REPAIR: the importer's normalisation moved {norm['repairPx']} pixels "
                    f"({repair_share:.0%} of the ink) by more than {REPAIR_LEVELS} levels "
                    f"({', '.join(f'{k} {v}' for k, v in norm['byRegion'].items())}); the part ships, but a "
                    f"render that needed less would rank above it")

    share_score = _clamp01((share - SHARE_MIN) / max(0.75 - SHARE_MIN, 1e-6)) if share < 0.75 else 1.0
    if slot in CEILING_SLOTS and share > SHARE_MAX:
        share_score *= 0.4
    unmasked_score = _clamp01(1.0 - unmasked / max(LEFT_MAX, 1))
    brass_score = _clamp01(1.0 - abs(metal_share) / max(BRASS_BUDGET, 1e-6)) if metal_share > BRASS_BUDGET else 1.0
    # HARDWARE AT A JOINT had a hard failure and no score. Check 4 caught it:
    # a brass bolt dropped on the neck cost 0.000 on the axis that owns it, so
    # a sweep ranking near misses would have ranked a bolted joint level with a
    # clean one. Scored now against the guard disc's own area. (After the
    # importer's pass a bolt on a HEAD is clay, not brass, and shows up in the
    # repair count instead; on a torso strip_brass removes it before the key
    # is drawn. The rule stays for what the pass cannot reach.)
    guard_area = max(3.14159 * GATE["guard"] ** 2, 1.0)
    hardware_score = _clamp01(1.0 - hardware / (guard_area * 0.25))
    # the accent-placement term: the face on a head (lens, mouth, no third
    # eye) and the sole on a leg; 1.0 on a slot with nothing to place
    lens_score = 1.0 if lens_ok else 0.0
    parts["paint"] = _clamp01(0.24 * share_score + 0.20 * unmasked_score + 0.14 * brass_score
                              + 0.14 * hardware_score + 0.14 * lens_score + 0.14 * repair_score)

    # ── LIGHT ─────────────────────────────────────────────────────────────
    li = _light(rgb, clay)
    want_ramp, want_corr, want_res = slot_light_target(slot, cache)
    li["rampWantSlot"] = round(want_ramp, 4)
    li["corrWantSlot"] = round(want_corr, 3)
    li["residualWantSlot"] = round(want_res, 4)
    if li.get("ok") and li["rampRatio"] is not None and li["lateralRatio"] is not None:
        ramp_err = abs(np.log(max(li["rampRatio"], 1e-3) / max(want_ramp, 1e-3)))
        ramp_score = _clamp01(1.0 - ramp_err / 0.55)
        corr_score = _clamp01(1.0 - abs(li["rampCorr"] - want_corr) / 1.2)
        lat_score = _clamp01(1.0 - max(0.0, li["lateralRatio"] - 1.0) / max(LIGHT["lateralMax"] - 1.0, 1e-6))
        if li["lateralRatio"] > LIGHT["lateralMax"]:
            extra = (" The rig mirrors arms and legs, so a lateral ramp flips its light on the bot's "
                     "other side." if slot in ("arm", "leg") else "")
            warn.append(f"SIDE LIT: left to right value ratio is {li['lateralRatio']:.2f}, the light law "
                        f"allows {LIGHT['lateralMax']}. The key is one soft light from directly above, "
                        f"so a part cut from a side-lit render never matches its neighbours." + extra)
        if abs(li["rampCorr"] - want_corr) > 0.7:
            warn.append(f"WRONG RAMP: value runs {li['rampCorr']:+.2f} down this part and the contract's "
                        f"own placeholder for the {slot} runs {want_corr:+.2f}")
        # the residual is scored as distance from the placeholder's own, in
        # BOTH directions: too noisy is shading baked per shape, too flat is
        # vector clay with no shading at all.
        res_score = _clamp01(1.0 - abs(li["rampResidual"] - want_res) / 0.45)
        parts["light"] = _clamp01(0.32 * ramp_score + 0.18 * corr_score + 0.26 * lat_score
                                  + 0.24 * res_score)
    else:
        parts["light"] = 0.0
        warn.append("LIGHT UNMEASURABLE: too little clay to read a ramp")

    # ── CLEAN ─────────────────────────────────────────────────────────────
    cl = _clean(a, ink, matte_info)
    if cl["components"] > 1:
        fail.append(f"STRAY INK: {cl['components']} separate blobs of 32px or more; the largest holds "
                    f"{cl['largestShare']:.1%} of the part. A cutter that left a second blob left a cast "
                    f"shadow, a neighbour's limb, or a tooth")
    # SEE THROUGH. The contract's own placeholder carries ZERO interior holes on
    # all forty parts; the shipped art carries 129 to 175 on every arm and 614
    # on a head, which is the chroma key eating a light patch out of a light
    # body. The bar is set above the worst shipped part (1.75 percent) with
    # headroom, and it is CALIBRATED, not a contract number, so it says so.
    hole_share = cl["holes"] / max(visible, 1)
    cl["holeShare"] = round(hole_share, 5)
    if hole_share > 0.025:
        fail.append(f"SEE THROUGH: {cl['holes']} pixels of enclosed transparency, "
                    f"{hole_share:.1%} of the part. The key ate a patch out of the body and the "
                    f"arena floor will show through it. Calibrated bar 2.5 percent: the contract's "
                    f"own placeholder carries zero and the worst shipped part carries 1.75 percent")
    # THE RIM, read off the cut (see _clean). PROVISIONAL: no bar has been
    # measured on a real cut yet, so a low number is a WARN and a soft term,
    # never a hard rule. bots_sd_matte's own selftest reads 1.00 on a render
    # that obeyed the control, 0.02 on one that drew the part at 80 percent
    # and 0.00 on a flat plate; the first real renders decide where the bar
    # sits, and this comment is where that number goes.
    rim = cl["rimEdgeRecall"]
    if rim is not None and rim < 0.5:
        warn.append(f"RIM UNFILLED: the render drew an edge on only {rim:.0%} of the matte's boundary, "
                    f"so the cut's rim is plate, not part (the model drew inside the silhouette). "
                    f"Provisional bar 50 percent, unmeasured on real renders")
    # A second blob is a cutter leaving a cast shadow, a neighbour's limb or a
    # tooth behind, and it is binary: the part is either one object or it is
    # not. Scoring it as "the largest blob's share" made a 780 pixel speck cost
    # 0.004, which check 4 called a miss and was right to.
    comp_score = 1.0 if cl["components"] <= 1 else _clamp01(0.35 / (cl["components"] - 1))
    hole_score = 1.0 / (1.0 + hole_share / 0.002)
    fringe_score = _clamp01(1.0 - max(0.0, cl["fringeShare"] - 0.06) / 0.20)
    rim_score = 1.0 if rim is None else _clamp01((rim - 0.2) / 0.6)
    parts["clean"] = _clamp01(0.34 * comp_score + 0.30 * hole_score + 0.20 * fringe_score
                              + 0.16 * rim_score)

    # ── STYLE ─────────────────────────────────────────────────────────────
    # ON THE RAW DRAWING, deliberately. Style asks what the MODEL drew inside
    # the silhouette. The importer's pass adds the same authored eye and
    # catch light to every candidate and to nothing else, and takes nothing
    # away that a Laplacian sees; measured after the pass the ruler gained two
    # lamps and 14 of 32 real heads read as the placeholder. Every other axis
    # is measured on the normalised part; this one is measured on the
    # candidate as drawn, against the ruler as baked.
    det = _detail(a_raw[..., :3].astype(np.float64), a_raw[..., 3] >= OPAQUE, r)
    det["measuredOn"] = "the raw cut (the model's own surface), not the normalised part"
    vs = det.get("vsRuler", 1.0)
    # UNSHADED, on the raw cut too, and for the same reason turned inside
    # out: the normalisation does not add shading to a flat white outline,
    # it takes the white away, so a candidate with no volume comes out of it
    # as clean uniform clay with a perfect silhouette and no repair, and
    # ranked FIRST for the arm on the v2 slice. See the header.
    sh = unshaded_measure(a_raw, slot, tier, design, matte_info)
    if sh["spread"] is not None and sh["spread"] < UNSHADED_BAR:
        ref = (f" The depth control implies a spread of {sh['depthSpread']:.3f} over the same body; this render "
               f"carries {sh['shadeShare']:.0%} of it." if sh.get("shadeShare") is not None else "")
        fail.append(
            f"UNSHADED: the render carries no shading inside its silhouette. Its body's value spread (the "
            f"interquartile range over the median, thin lines filled) is {sh['spread']:.4f} against a bar of "
            f"{UNSHADED_BAR}, and {sh['flatShare']:.0%} of the body is within {UNSHADED_FLAT:.0%} of one tone: "
            f"an outline drawing, a flat fill with lines and no volume, which the importer's normalisation "
            f"would have turned into clean uniform clay. Calibrated bar: the 16 outline drawings on the v2 "
            f"and head sheets read 0.000 to {UNSHADED_CALIBRATION['outlineMax']} and the flattest shaded "
            f"render {UNSHADED_CALIBRATION['shadedMin']}, {UNSHADED_CALIBRATION['marginEachSide']}x either "
            f"side of the bar.{ref}")
    # IS THE PLACEHOLDER. A candidate that matches the ruler's silhouette at
    # 0.97 or better AND carries no more surface than the ruler is the clay
    # drawing itself, or a trace of it with no finish (the sweep's own first
    # named failure: "it looks like the placeholder"). It is not art and it is
    # never a candidate. This is a HARD rule, not a style penalty, because the
    # placeholder is perfect on every geometry axis and a soft penalty let it
    # outrank 36 of 40 real parts on 2026-09-05. Real art measures 0.53 to
    # 0.86 against the ruler; nothing finished gets near 0.97.
    unstyled = iou > 0.97 and vs < 1.30
    if unstyled:
        fail.append(f"IS THE PLACEHOLDER: this is the clay ruler, not art. Silhouette matches the ruler "
                    f"at {iou:.3f} and it carries {vs:.2f}x the ruler's surface detail. The drawing the "
                    f"art is meant to replace is never a candidate")
    parts["style"] = 0.05 if unstyled else _clamp01((vs - 1.0) / 2.5)

    total = sum(WEIGHTS[k] * parts[k] for k in WEIGHTS)
    verdict = "REJECT" if fail else "RANKED"
    # The row names its ruler ONLY when one was named. A report produced with
    # no shape and no --ruler is byte-identical to the same report produced
    # before section 4a existed, which is how that section is proved harmless.
    ruler_named = {}
    if shape:
        ruler_named["shape"] = shape
    if ruler_path:
        ruler_named["rulerPath"] = ruler_path
    return {
        "file": path, "slot": slot, "tier": tier, "design": design,
        **ruler_named,
        "pool": _pool(slot, tier, design, shape),
        "verdict": verdict, "composite": round(total, 2),
        "axes": {k: round(v, 4) for k, v in parts.items()},
        "fit": {"iou": round(iou, 4), "iouCentred": round(iou_shift, 4),
                "offsetToRuler": [dx, dy], "margin": int(margin), "edge": edge,
                "burial": round(burial, 3) if burial is not None else None,
                "pivots": pivots, "ratios": ratios, "fitted": fitted,
                "eyeSize": eye_size},
        "paint": {"share": round(share, 4), "unmaskedBody": unmasked,
                  "metalShare": round(metal_share, 5), "hardwareAtJoint": hardware,
                  "lens": eye, "bezelAtRisk": bezel_painted,
                  "claySat": round(clay_sat, 4), "clayValue": round(clay_v, 4),
                  "repairScore": round(repair_score, 4), "coral": coral},
        "normalise": norm,
        "normalisedFile": norm_png if normalised_out else None,
        "light": li, "clean": cl, "style": det, "unshaded": sh,
        "fail": fail, "warn": warn,
    }


def _fit_to_canvas(im: Image.Image, slot: str, tier: int, design: int, cache,
                   shape: str | None = None, ruler_path: str | None = None,
                   table: str | None = None):
    """Scale a raw render's ink to the ruler's ink height and centre it on the
    ruler's ink centroid. This is NOT registration: the cutter
    (scripts/bots-import-parts.py) places a part properly, off measured
    landmarks. This is only so a sweep can rank raw output at all, and every
    report that used it says so."""
    a = np.asarray(im.convert("RGBA"))
    ink = a[..., 3] > 0
    b = _box(ink)
    if b is None:
        _refuse("cannot fit an empty render")
    r = ruler_for(slot, tier, design, cache, shape=shape, ruler_path=ruler_path, table=table)
    rb = _box(r[..., 3] > 0)
    s = (rb[1] - rb[0] + 1) / max(b[1] - b[0] + 1, 1)
    crop = im.crop((b[2], b[0], b[3] + 1, b[1] + 1))
    nw, nh = max(int(round(crop.width * s)), 1), max(int(round(crop.height * s)), 1)
    crop = crop.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (RIG[slot]["w"], RIG[slot]["h"]), (0, 0, 0, 0))
    ry, rx = ndimage.center_of_mass(r[..., 3] > 0)
    ca = np.asarray(crop)
    ci = ca[..., 3] > 0
    if not ci.any():
        _refuse("the fitted render has no ink")
    cy, cx = ndimage.center_of_mass(ci)
    out.alpha_composite(crop, (int(round(rx - cx)), int(round(ry - cy))))
    return out, {"scale": round(s, 4)}


# ── 7. the authoritative verdict: run the shipped gate ────────────────────

def run_shipped_gate(assign: dict, sandbox: str, quiet: bool = False) -> dict:
    """Run scripts/bots-art-check.mts, unmodified, over a staged set.

    The gate resolves its inputs as join(process.cwd(), "public") and
    join(process.cwd(), "scripts", "bots-art-accents.json") but imports the
    contract relative to its own file, so running it from a sandbox cwd points
    it at staged art while it still reads the shipped contract. Nothing is
    re-implemented and nothing in the repo is touched.

    assign maps "slot/tN-D" to a candidate PNG. Everything unassigned is
    filled from the shipped set so the gate's whole-set checks (the head over
    torso overhang, the lift) still have something to measure. Masks are
    derived here with the shipped classifier, because a fresh render has none.
    """
    pub = os.path.join(sandbox, "public")
    if os.path.exists(pub):
        shutil.rmtree(pub, ignore_errors=True)
    os.makedirs(os.path.join(sandbox, "scripts"), exist_ok=True)
    shutil.copy2(os.path.join(SCRIPTS, "bots-art-accents.json"),
                 os.path.join(sandbox, "scripts", "bots-art-accents.json"))
    shutil.copytree(os.path.join(ROOT, "public", "bots-art"),
                    os.path.join(pub, "bots-art"),
                    ignore=shutil.ignore_patterns("_raw"))
    for key, src in assign.items():
        slot, tn = key.split("/")
        dst = os.path.join(pub, "bots-art", "parts", slot, tn + ".png")
        # the SHIPPED deriver writes both the base and its mask, into the
        # sandbox. This is the same call the real pipeline makes, so what the
        # gate reads is what the pipeline would have handed it.
        write_mask(src, dst, os.path.join(pub, "bots-art", "parts", slot, tn + ".mask.png"))
    t0 = time.time()
    r = subprocess.run(["npx", "tsx", GATE_MTS], cwd=sandbox, capture_output=True, text=True,
                       shell=(os.name == "nt"))
    out = (r.stdout or "") + (r.stderr or "")
    if not quiet:
        print(out.strip())
    return {"pass": r.returncode == 0, "seconds": round(time.time() - t0, 2),
            "fails": [l for l in out.splitlines() if l.startswith("FAIL ")]}


# ── 8. modes ──────────────────────────────────────────────────────────────

NAME_RE = re.compile(r"(head|torso|arm|leg|weapon)[-_ ]?t?(\d)[-_](\d)", re.I)


def infer(path: str):
    m = NAME_RE.search(os.path.basename(path)) or NAME_RE.search(path.replace("\\", "/"))
    if not m:
        return None
    return m.group(1).lower(), int(m.group(2)), int(m.group(3))


def pool_key(r: dict) -> str:
    return r.get("pool") or f"{r.get('slot')}-t{r.get('tier')}-{r.get('design')}"


def order(rows: list[dict]) -> list[dict]:
    """Pool by pool: survivors first, by composite; then the rejected, by
    composite, for diagnosis only. Stamps rankInPool on every survivor and
    None on everything else. This is the only ordering any mode prints."""
    rows = sorted(rows, key=lambda r: (pool_key(r), 0 if r["verdict"] == "RANKED" else 1,
                                       -float(r.get("composite", 0.0))))
    seen: dict[str, int] = {}
    for r in rows:
        if r["verdict"] == "RANKED":
            seen[pool_key(r)] = seen.get(pool_key(r), 0) + 1
            r["rankInPool"] = seen[pool_key(r)]
        else:
            r["rankInPool"] = None
    return rows


def pick(rows: list[dict]) -> dict | None:
    """select's whole rule: the survivor with the highest composite, or None
    when nothing survived. A rejected candidate is never returned, however
    high its composite."""
    ok = [r for r in rows if r.get("verdict") == "RANKED"]
    return max(ok, key=lambda r: float(r.get("composite", 0.0))) if ok else None


def _report(rows: list[dict], out_dir: str, sheet: bool, cache):
    os.makedirs(out_dir, exist_ok=True)
    rows = order(rows)
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump({"note": NOTE, "rows": rows}, f, indent=1)
    with open(os.path.join(out_dir, "README.txt"), "w", encoding="utf-8") as f:
        f.write(NOTE + "\n\nreport.csv: one row per candidate, grouped by pool; rankInPool is blank "
                "for a REJECT. Columns after `composite` are the axis sub-scores and the raw "
                "measurements behind them.\n")
    cols = ["pool", "rankInPool", "verdict", "composite", "slot", "tier", "design", "fit", "light",
            "paint", "clean", "style", "iou", "iouCentred", "margin", "burial", "paintShare",
            "unmaskedBody", "metalShare", "lensBlobs", "lensMaskUnprotected", "faceFound",
            "level", "exposureGain", "repairPx", "repairShare", "changedPx", "rawClaySat",
            "rampRatio", "rampResidual", "lateralRatio",
            "components", "rimEdgeRecall", "detailVsRuler",
            "shadeSpread", "shadeBar", "shadeFlatShare", "shadeDepthSpread", "shadeShare",
            "coralSpill", "soleFrac", "thirdEyePx", "thirdEyeRowR", "eyeSize",
            "nFail", "firstFail", "nWarn", "normalisedFile", "file"]
    with open(os.path.join(out_dir, "report.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in rows:
            ax = r.get("axes", {})
            nm = r.get("normalise") or {}
            w.writerow([pool_key(r), r.get("rankInPool") or "", r["verdict"], r["composite"],
                        r.get("slot"), r.get("tier"), r.get("design"),
                        ax.get("fit"), ax.get("light"), ax.get("paint"), ax.get("clean"), ax.get("style"),
                        r.get("fit", {}).get("iou"), r.get("fit", {}).get("iouCentred"),
                        r.get("fit", {}).get("margin"), r.get("fit", {}).get("burial"),
                        r.get("paint", {}).get("share"), r.get("paint", {}).get("unmaskedBody"),
                        r.get("paint", {}).get("metalShare"),
                        (r.get("paint", {}).get("lens") or {}).get("lensBlobs"),
                        (r.get("paint", {}).get("lens") or {}).get("lensMaskUnprotected"),
                        nm.get("faceFound"), nm.get("level"), (nm.get("exposure") or {}).get("gain"),
                        nm.get("repairPx"), nm.get("repairShare"),
                        nm.get("changedPx"), nm.get("rawClaySat"),
                        r.get("light", {}).get("rampRatio"), r.get("light", {}).get("rampResidual"),
                        r.get("light", {}).get("lateralRatio"),
                        r.get("clean", {}).get("components"), r.get("clean", {}).get("rimEdgeRecall"),
                        r.get("style", {}).get("vsRuler"),
                        (r.get("unshaded") or {}).get("spread"), (r.get("unshaded") or {}).get("bar"),
                        (r.get("unshaded") or {}).get("flatShare"), (r.get("unshaded") or {}).get("depthSpread"),
                        (r.get("unshaded") or {}).get("shadeShare"),
                        ((r.get("paint") or {}).get("coral") or {}).get("spill"),
                        ((r.get("paint") or {}).get("coral") or {}).get("soleFrac"),
                        (((r.get("paint") or {}).get("lens") or {}).get("thirdEye") or {}).get("px"),
                        ((((r.get("paint") or {}).get("lens") or {}).get("thirdEye") or {}).get("row") or {}).get("discR"),
                        ((r.get("fit") or {}).get("eyeSize") or {}).get("rOverW"),
                        len(r.get("fail", [])), (r.get("fail") or [""])[0].split(":")[0],
                        len(r.get("warn", [])), r.get("normalisedFile") or "", r["file"]])
    if sheet and rows:
        contact_sheet(rows, os.path.join(out_dir, "top.png"), "TOP", cache)
        contact_sheet(rows[::-1], os.path.join(out_dir, "bottom.png"), "BOTTOM", cache)
    return rows


def contact_sheet(rows: list[dict], out: str, label: str, cache, n: int = 24, cell: int = 210):
    """A person has to be able to overrule the machine's taste, and they cannot
    do that from a CSV. Each cell shows the candidate AS IT WOULD SHIP (the
    normalised file, when the run kept one) so the eye judges what the rules
    judged; the raw cut is shown only when no normalised file was kept."""
    rows = rows[:n]
    cols = min(8, max(1, len(rows)))
    r_n = (len(rows) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, r_n * (cell + 46) + 30), (26, 26, 30))
    d = ImageDraw.Draw(sheet)
    shown = "as shipped (importer normalisation applied)" if any(
        r.get("normalisedFile") and os.path.exists(r["normalisedFile"]) for r in rows) else "raw cut"
    d.text((8, 8), f"{label} {len(rows)} of the run, shown {shown}; #n = rank among the pool's survivors, "
           f"a composite is a ranking not a pass mark", fill=(255, 210, 110))
    for i, r in enumerate(rows):
        cx, cy = (i % cols) * cell, 30 + (i // cols) * (cell + 46)
        src = r.get("normalisedFile") if r.get("normalisedFile") and os.path.exists(r["normalisedFile"]) else r["file"]
        try:
            im = Image.open(src).convert("RGBA")
        except Exception:
            continue
        im.thumbnail((cell - 12, cell - 12), Image.LANCZOS)
        bg = Image.new("RGBA", (cell, cell), (68, 68, 76, 255))
        bg.alpha_composite(im, ((cell - im.width) // 2, (cell - im.height) // 2))
        sheet.paste(bg.convert("RGB"), (cx, cy))
        col = {"RANKED": (140, 240, 150), "REJECT": (250, 130, 120)}.get(r["verdict"], (170, 170, 180))
        rk = f"#{r['rankInPool']} " if r.get("rankInPool") else ""
        d.text((cx + 5, cy + cell + 2), f"{rk}{r['composite']:.1f}  {r['verdict']}", fill=col)
        d.text((cx + 5, cy + cell + 15),
               f"{r.get('slot')} t{r.get('tier')}-{r.get('design')}  iou {r.get('fit', {}).get('iou')}",
               fill=(190, 190, 200))
        nm = r.get("normalise") or {}
        third = (f"repair {nm.get('repairShare', 0.0):.0%}  face {nm.get('faceFound')}"
                 if nm else "")
        if r["verdict"] != "RANKED" and r.get("fail"):
            third = (r["fail"][0].split(":")[0])[:24] + "  " + third
        d.text((cx + 5, cy + cell + 28), third[:40], fill=(150, 150, 165))
    sheet.save(out)
    return out


def _score_one(job):
    path, slot, tier, design, cache, fit, norm_out, shape, ruler_path, table = job
    try:
        return score_image(path, slot, tier, design, cache=cache, fit=fit, normalised_out=norm_out,
                           shape=shape, ruler_path=ruler_path, table=table)
    except SystemExit as e:
        return {"file": path, "slot": slot, "tier": tier, "design": design,
                "verdict": "REFUSED", "composite": 0.0, "pool": _pool(slot, tier, design, shape),
                "fail": [str(e)], "warn": [], "axes": {}}


def _norm_out(out_dir: str | None, base_dir: str, path: str) -> str | None:
    """<out>/normalised/<path relative to the scanned dir, separators
    flattened>.png: one kept normalised file per candidate, for the sheets."""
    if not out_dir:
        return None
    rel = os.path.relpath(path, base_dir).replace("\\", "__").replace("/", "__")
    return os.path.join(out_dir, "normalised", rel)


def mode_batch(args):
    files = []
    for dirpath, _, names in os.walk(args.dir):
        if os.path.basename(dirpath) == "normalised":
            continue          # never re-judge a previous run's normalised copies
        for nm in names:
            if nm.lower().endswith(".png") and ".mask." not in nm.lower():
                files.append(os.path.join(dirpath, nm))
    out = args.out or os.path.join(args.dir, "_judge")
    jobs, skipped = [], []
    for p in files:
        got = infer(p) if not args.slot else (args.slot, args.tier, args.design)
        if not got:
            skipped.append(p)
            continue
        sh = getattr(args, "shape", None) or infer_shape(p, getattr(args, "shape_table", None))
        jobs.append((p, got[0], got[1], got[2], args.cache, args.fit, _norm_out(out, args.dir, p),
                     sh, getattr(args, "ruler", None), getattr(args, "shape_table", None)))
    t0 = time.time()
    # A SWEEP IS EMBARRASSINGLY PARALLEL and a thousand candidates at 100 ms
    # each is a hundred seconds on one core. Each worker pays the module import
    # and one ruler bake, which is why --jobs is opt in and pointless under a
    # few hundred images.
    if args.jobs and args.jobs > 1 and len(jobs) > 60:
        import multiprocessing as mp
        with mp.Pool(args.jobs) as pool:
            rows = pool.map(_score_one, jobs, chunksize=8)
    else:
        rows = [_score_one(j) for j in jobs]
    dt = time.time() - t0
    rows = _report(rows, out, args.sheet, args.cache)
    print(NOTE)
    print(f"judged {len(rows)} images in {dt:.2f}s "
          f"({dt / max(len(rows), 1) * 1000:.1f} ms each, {len(rows) / max(dt, 1e-6):.0f}/s, "
          f"{len(rows) / max(dt, 1e-6) * 3600:,.0f}/hour)")
    if skipped:
        print(f"skipped {len(skipped)} with no slot in the name (use --slot/--tier/--design)")
    print(f"report: {os.path.join(out, 'report.csv')}")
    return rows


def mode_select(args):
    """Pick the top SURVIVOR of one part's candidate pool. Rejected candidates
    are never eligible; a pool with no survivor selects nothing and exits 1."""
    files = [os.path.join(args.dir, f) for f in sorted(os.listdir(args.dir))
             if f.lower().endswith(".png") and ".mask." not in f.lower()]
    if not files:
        _refuse(f"no candidates in {args.dir}")
    rows = [score_image(p, args.slot, args.tier, args.design, cache=args.cache, fit=args.fit,
                        normalised_out=_norm_out(args.out, args.dir, p),
                        shape=getattr(args, "shape", None),
                        ruler_path=getattr(args, "ruler", None),
                        table=getattr(args, "shape_table", None))
            for p in files]
    rows = order(rows)
    survivors = [r for r in rows if r["verdict"] == "RANKED"]
    rejected = [r for r in rows if r["verdict"] != "RANKED"]
    print(NOTE)
    win = pick(rows)
    if win is None:
        print(f"NO SURVIVOR: all {len(rows)} candidates for {args.slot} t{args.tier}-{args.design} "
              f"failed a hard rule. Nothing is selected; the best-composite reject is not a winner.")
        for r in rows[:8]:
            print(f"  {os.path.basename(r['file'])}  composite {r['composite']:.1f}  "
                  f"{(r['fail'] or ['?'])[0][:110]}")
        if args.out:
            _report(rows, args.out, args.sheet, args.cache)
        raise SystemExit(1)
    up = survivors[1] if len(survivors) > 1 else None
    why = []
    if up:
        for ax in sorted(WEIGHTS, key=lambda k: -(win["axes"][k] - up["axes"][k]) * WEIGHTS[k]):
            gap = (win["axes"][ax] - up["axes"][ax]) * WEIGHTS[ax]
            if abs(gap) >= 0.25:
                why.append(f"{ax} {gap:+.1f} ({win['axes'][ax]:.2f} against {up['axes'][ax]:.2f})")
    print(f"TOP SURVIVOR  {os.path.basename(win['file'])}  composite {win['composite']:.1f}  "
          f"rank 1 of {len(survivors)} survivors ({len(rejected)} rejected)")
    print("  ahead on " + ("; ".join(why[:3]) if why else "nothing: it is the only survivor"))
    print(f"  iou {win['fit']['iou']}  light {win['axes']['light']:.2f}  style {win['axes']['style']:.2f}  "
          f"repair {win.get('normalise', {}).get('repairShare', 0.0):.0%} of the ink "
          f"({win.get('normalise', {}).get('repairPx')} px)")
    for w in win["warn"][:4]:
        print("  warn  " + w)
    if up:
        print(f"RUNNER UP     {os.path.basename(up['file'])}  composite {up['composite']:.1f}")
    if rejected:
        print(f"REJECTED ({len(rejected)}), first rule each:")
        for r in rejected[:6]:
            print(f"  {os.path.basename(r['file'])}  {(r['fail'] or ['?'])[0].split(':')[0]}")
    if args.out:
        _report(rows, args.out, args.sheet, args.cache)
    return {"winner": win, "runnerUp": up, "all": rows}


def mode_score(args):
    got = (args.slot, args.tier, args.design) if args.slot else None
    out = []
    for p in args.images:
        g = got or infer(p)
        if not g:
            _refuse(f"cannot tell which slot {p} is for; pass --slot/--tier/--design")
        out.append(score_image(p, *g, cache=args.cache, fit=args.fit,
                               normalised_out=_norm_out(args.out, os.path.dirname(p) or ".", p),
                               shape=(getattr(args, "shape", None)
                                      or infer_shape(p, getattr(args, "shape_table", None))),
                               ruler_path=getattr(args, "ruler", None),
                               table=getattr(args, "shape_table", None)))
    print(json.dumps(out if len(out) > 1 else out[0], indent=1))
    return out


def mode_calibrate(args):
    """Judge the 40 shipped parts and the 40 clay rulers, pool by pool, and
    say plainly what the ruler wins. The claim this exists to demonstrate:
    the placeholder is REJECT everywhere and is never picked; it leads only
    on the sub-scores it is the ruler for."""
    rows = []
    for slot in SLOTS:
        for t in TIERS:
            for d in DESIGNS:
                p = os.path.join(PARTS, slot, f"t{t}-{d}.png")
                if os.path.exists(p):
                    r = score_image(p, slot, t, d, cache=args.cache)
                    r["set"] = "shipped"
                    rows.append(r)
                q = os.path.join(ruler_dir(args.cache), slot, f"t{t}-{d}.png")
                r = score_image(q, slot, t, d, cache=args.cache)
                r["set"] = "ruler"
                rows.append(r)
    out = args.out or os.path.join(HERE, ".calibration")
    rows = _report(rows, out, True, args.cache)
    print(NOTE)
    by: dict = {}
    for r in rows:
        by.setdefault(pool_key(r), {})[r["set"]] = r
    axes = ("fit", "light", "paint", "clean", "style")
    lead = {a: 0 for a in axes}
    comp = picked = ruler_rej = ruler_ph = ship_rej = n = 0
    ship_rules: dict = {}
    print(f"\n{'pool':<14} {'ruler':<28} {'shipped':<28} picked")
    for pool, d in sorted(by.items()):
        if "ruler" not in d or "shipped" not in d:
            continue
        n += 1
        ru, sh = d["ruler"], d["shipped"]
        for a in axes:
            lead[a] += ru["axes"][a] > sh["axes"][a]
        comp += ru["composite"] > sh["composite"]
        p = pick([ru, sh])
        picked += p is ru
        ruler_rej += ru["verdict"] == "REJECT"
        ruler_ph += any("IS THE PLACEHOLDER" in f for f in ru["fail"])
        if sh["verdict"] == "REJECT":
            ship_rej += 1
            k = sh["fail"][0].split(":")[0]
            ship_rules[k] = ship_rules.get(k, 0) + 1
        who = "nothing" if p is None else ("RULER" if p is ru else "shipped")
        rf = (ru["fail"] or [""])[0].split(":")[0]
        sf = (sh["fail"] or [""])[0].split(":")[0]
        print(f"{pool:<14} {ru['verdict']:<7} {ru['composite']:5.1f} {rf[:13]:<13} "
              f"{sh['verdict']:<7} {sh['composite']:5.1f} {sf[:13]:<13} {who}")
    print(f"\n{n} pools.")
    print(f"  the ruler is REJECT in {ruler_rej} of {n} (IS THE PLACEHOLDER fires on {ruler_ph}; on the "
          f"rest a paint rule fires first and IS THE PLACEHOLDER follows it) and is picked in {picked}.")
    print(f"  the ruler's composite is higher than the shipped part's in {comp} of {n}: diagnosis only, "
          f"a rejected candidate is never selected and the composite is never a pass mark.")
    print("  sub-scores where the ruler leads: " +
          ", ".join(f"{a} {lead[a]}/{n}" for a in axes) +
          "  (fit, light, paint and clean are the laws the ruler is drawn to; style is the one "
          "axis that measures what the ruler lacks)")
    print(f"  shipped parts rejected: {ship_rej} of {n}, by first rule: "
          + ", ".join(f"{k} {v}" for k, v in sorted(ship_rules.items(), key=lambda kv: -kv[1])))
    print(f"\nreport: {os.path.join(out, 'report.csv')}")
    return rows


def main():
    ap = argparse.ArgumentParser(description="Battle Bots part ranker: hard rules reject, the "
                                             "composite ranks survivors inside one part's pool")
    ap.add_argument("mode", choices=["score", "batch", "select", "calibrate", "gate"])
    ap.add_argument("images", nargs="*")
    ap.add_argument("--dir")
    ap.add_argument("--slot", choices=list(SLOTS))
    ap.add_argument("--tier", type=int, default=1)
    ap.add_argument("--design", type=int, default=1)
    ap.add_argument("--out")
    ap.add_argument("--cache", help="where the clay ruler is baked")
    # THE SHAPE SEAM, section 4a. None of these three moves a rule or a bar;
    # they choose WHICH drawing the silhouette, the fit centring and the STYLE
    # reference are measured against. Name none and this is the ship table.
    ap.add_argument("--shape", help="judge against this shape's ruler from the shape table "
                                    "(a bear head against the bear drawing, not against the dome)")
    ap.add_argument("--ruler", help="judge against this exact ruler PNG; beats --shape")
    ap.add_argument("--shape-table", dest="shape_table",
                    help=f"the shape table JSON. Default search: {' , '.join(SHAPE_TABLE_PATHS)}. "
                         f"Given without --shape, batch and score read each candidate's shape "
                         f"off its own path.")
    ap.add_argument("--sheet", action="store_true", help="write top/bottom contact sheets")
    ap.add_argument("--fit", action="store_true",
                    help="scale and centre an off-canvas render before scoring; the report says so")
    ap.add_argument("--sandbox", help="gate mode: staging directory")
    ap.add_argument("--jobs", type=int, default=1, help="batch mode: worker processes")
    a = ap.parse_args()
    if a.mode in ("batch", "select") and not a.dir:
        a.dir = a.images[0] if a.images else None
        if not a.dir:
            _refuse(f"{a.mode} needs a directory")
    if a.mode == "score":
        mode_score(a)
    elif a.mode == "batch":
        mode_batch(a)
    elif a.mode == "select":
        mode_select(a)
    elif a.mode == "calibrate":
        mode_calibrate(a)
    elif a.mode == "gate":
        assign = {}
        for p in a.images:
            g = infer(p) if not a.slot else (a.slot, a.tier, a.design)
            if not g:
                _refuse(f"cannot tell which slot {p} is for")
            assign[f"{g[0]}/t{g[1]}-{g[2]}"] = p
        sb = a.sandbox or os.path.join(HERE, ".gate-sandbox")
        os.makedirs(sb, exist_ok=True)
        res = run_shipped_gate(assign, sb)
        print(json.dumps({"pass": res["pass"], "seconds": res["seconds"],
                          "fails": len(res["fails"])}, indent=1))
        sys.exit(0 if res["pass"] else 1)


if __name__ == "__main__":
    main()
