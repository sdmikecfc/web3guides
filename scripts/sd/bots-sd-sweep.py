"""BATTLE BOTS / stable-diffusion lane C: THE SWEEP PLAN, PRICED.

    python scripts/sd/bots-sd-sweep.py                   # print the plan and the cost table
    python scripts/sd/bots-sd-sweep.py --emit            # write the job files under art-src/sd/jobs
    python scripts/sd/bots-sd-sweep.py --worked head-t3-1  # write the worked example
    python scripts/sd/bots-sd-sweep.py --sec 4.8         # price it at a measured seconds-per-image
    python scripts/sd/bots-sd-sweep.py --emit --controls-root art-src/sd/controls/v2
                                                          # the same files against another controls
                                                          # tree, written as stage0.v2.jsonl and so on
    --emit also writes the two PRODUCTION files (stage4-heads.jsonl against the
    default controls, stage4-limbs-v2.jsonl against the v2 controls) from the
    recipe in production() below; their roots are fixed by the recipe and do
    not follow --controls-root.

Reads scripts/sd/bots-sd-prompts.json and turns it into runnable jobs. It does
NOT run anything: there is no GPU here, and every timing below is a formula
with lane R's measured seconds-per-image as its only input.

── WHY THIS IS STAGED AND NOT A GRID ──────────────────────────────────────
The full cross product of the axes in the matrix is

    4 checkpoints x 5 control stacks x 5 scales x 3 ends x 4 cfg x 3 steps
    x 3 samplers x 4 style weights x 3 style references x 4 plates
    x 3 prompt variants x 2 negatives x 40 parts x 8 seeds

which the table below prints (nine figures of renders, decades at five
seconds each). So
"hammer a thousand renders" is exactly the right instinct and a grid is
exactly the wrong shape for it. The axes are not independent: the checkpoint
decides the useful control-scale band, the control stack decides whether the
scale matters at all, and the plate and the seed do not interact with either.
So the sweep is a funnel. Each stage fixes what the stage before it decided
and only ever varies what is still open, every stage is scored by the same
gate, and the whole funnel is four figures of renders rather than nine.

── WHAT THE SCORER IS, AND WHY IT MATTERS MORE THAN THE PROMPT ────────────
A thousand renders are worthless without an automatic judge, because a person
cannot look at a thousand renders and will look at forty and pick wrong. We
are unusually well placed here: scripts/bots-art-check.mts already fails a
part for clipping, for a buried pivot, for hardware at a joint, for busting
the brass budget and for leaking paint, and scripts/bots-import-parts.py
already measures silhouette overlap against a ruler. Ten of those checks are
mechanical enough to run on a candidate before anything is written to disk.
gateTargets in the matrix lists them with the file each one comes from, plus
the three this lane adds (rim purity, a distinct eye lens, lateral symmetry).

The judge is scripts/sd/rank-part.py, and its name is the law: its HARD
failures (CLIPPED, AIR, BURIAL, STRAY INK, LENS CORE PAINTED, IS THE
PLACEHOLDER, ...) REJECT a candidate, and its composite number only RANKS the
survivors inside one part's candidate pool. THERE IS NO PASS MARK. The
composite is never compared across parts and never against a threshold.
Calibration on 2026-09-05 showed why: the featureless clay placeholder
outscored 36 of the 40 shipped parts on the old composite, because the
composite rewards geometry and the placeholder is perfect at geometry. It is a
good ranker inside a pool and a useless gate, so it is not used as one, and
`select` picks from the survivors only.

── THE PLATE, AND WHY KEYING GOES AWAY ────────────────────────────────────
The old pipeline drew on magenta and keyed the magenta out, and a cast shadow
once fooled the key. Both of those facts are consequences of one decision:
the alpha was RECOVERED from the render by a colour test. Under a conditioned
pipeline it does not have to be, because we already know the exact silhouette
- we handed it to the model as the control image. So:

    matte  = the control alpha, eroded by 2 px and feathered by 1
    gate   = rim purity, i.e. how many pixels just inside that matte still
             look like the plate

A cast shadow lands OUTSIDE the silhouette and is discarded by construction
rather than mistaken for the subject; there is no colour tolerance to tune and
no hue for a dark grey shadow to fall inside. What the plate colour still
decides is CONTAMINATION - how much of itself it bleeds into the subject's
edge pixels and its shading - and on that the answer is mid grey:

  * the parts must be stored colour neutral, because the game paints them
    through a mask in eight colours, and a saturated plate tints the rim and
    the shadowed side of a neutral part. Magenta is the worst possible choice
    on this axis and it is what we have been using;
  * an empty SD latent decodes to about mid grey, so a flat grey field is the
    cheapest thing the model can hold and the least likely to grow texture;
  * grey is everywhere in the training distribution as a studio sweep, where
    magenta is rare and drags the whole image toward a synthetic look.

Magenta stays in the sweep as a control arm, because that claim should be
measured on our own renders and not taken from this comment.

The cut itself is scripts/sd/bots_sd_matte.py, the runner writes it beside
every render, and rank-part.py judges the cut. The box confirmed the reason
on 2026-09-05: a colour key on the grey plate sat at IoU 0.30 to 0.37 whatever
the control did, so nothing in this lane keys by colour any more.

── THE IP-ADAPTER, AND WHY STAGE 1 CARRIES IT ─────────────────────────────
A hand test on the box (2026-09-05) settled that the look NEEDS the adapter:
with a concept crop as the style image at adapter 0.4 and control 0.6, the
head came back as warm pastel clay with chrome bezels, a coral lit lens, the
grille mouth and the ear cups, with the shape still bound; at 0.8 the
reference's own background leaked into the render. So stage 1 sweeps the
adapter scale at 0.3, 0.45 and 0.6 against the cleaned references
(art-src/sd/style/clean, backgrounds removed by bots-sd-stylerefs.py) as a
product with the control axes, because the useful control band and the
adapter pull are exactly the pair that interact. Style 0 stays the stage-0
control arm.

Does the model need to output alpha at all? No. Transparent-output diffusion
exists (LayerDiffuse / layered-diffusion, SD1.5 and SDXL variants) and would
be the right answer if we did not know the silhouette. We do know it, exactly,
so the extra model is complexity with no question to answer.

── LICENCES ───────────────────────────────────────────────────────────────
Recorded per candidate in CHECKPOINTS and CONTROLNETS below. Two things are
worth reading twice: FLUX.1 [dev] is NON-COMMERCIAL and FLUX.1 [schnell] is
Apache-2.0, so almost every good FLUX ControlNet is dev-derived and therefore
non-commercial; and the annotator licences that usually bite (Depth-Anything
V2 is CC-BY-NC) do not apply to us at all, because bots-sd-controls.py
synthesises the maps from our own geometry instead of running an annotator.
Every line below is from memory and must be confirmed on the model card
before anything ships.
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bots_sd_contract import ROOT, TIERS, every_part, part_key, read_contract  # noqa: E402
# THE PROMPT LIVES IN ONE PLACE. This file does not assemble prompt text; it
# asks bots_sd_prompt, and so do smoke.py and bots-sd-render.py, so the job
# files, the smoke test and production cannot disagree on a single word.
from bots_sd_prompt import (  # noqa: E402
    PROMPT_LIMIT,
    build_negative,
    build_prompt,
    build_weighted,
    chunks_needed,
    count_tokens,
    load_matrix,
)

from bots_sd_prompt import part_triple  # noqa: E402

# THE CONTROLS ROOT. The default is the tree every job file has always pointed
# at. --controls-root names another (art-src/sd/controls/v2, the tree with the
# richer limb placeholders, once bots-sd-controls.py has written it). Every job
# carries its root as `controlsRoot`; a file emitted against a non-default
# root gets the root's tag in its name (stage0.v2.jsonl) so the default jobs
# are never overwritten by it.
CONTROLS_REL = "art-src/sd/controls"
CONTROLS_V2_REL = "art-src/sd/controls/v2"
CONTROLS = os.path.join(ROOT, "art-src", "sd", "controls")
JOBS = os.path.join(ROOT, "art-src", "sd", "jobs")
WORKED = os.path.join(ROOT, "art-src", "sd", "worked-example")
STYLE_CLEAN = os.path.join(ROOT, "art-src", "sd", "style", "clean")

# what scripts/sd/bots-sd-render.py can actually run today; everything else
# in an axis is planned, printed, and NOT written into a job file
WIRED_CHECKPOINTS = ("sdxl-base-1.0",)
# stage 1's three parts: a head (the busiest), an arm (the worst aspect
# ratio, 0.46) and a weapon (the only horizontal one). The head is the stage-0
# part so the two stages share a baseline.
STAGE1_PARTS = ("head-t3-1", "arm-t2-1", "weapon-t2-1")
STAGE1_STYLE = (0.3, 0.45, 0.6)
# THE LIMB SLICES. Measured 2026-09-05: limbs and weapons fail because the
# model invents a character on them (an arm rendered as a whole robot with
# eyes and feet; a mallet that grew eyes). Two small files at the settings
# that worked for heads (control 0.7 and 0.85, end 0.8, adapter 0.3 and 0.45
# against bot-2, two seeds): stage1c on the default controls with the two
# stage-1 limbs, as before; stage1d on the v2 controls with one part of every
# slot that is not the head. The v2 file is written only when the v2 maps are
# on disk, and the emit says so plainly when not.
#
# THE LIMB STACKS. The slices used to vary lineart against depth+lineart. The
# v2 slice (64 renders, 2026-09-05) settled the face question and measured a
# second defect: lineart ALONE at adapter 0.3 often gives an OUTLINE DRAWING,
# a white fill with black lines and no shading, and the judge cannot see it
# (after the neutral-clay normalisation an outline is uniform clay with a
# perfect silhouette, so rank-part put one FIRST for the arm at composite
# 90.0). Depth plus lineart never did it. So the arm, the leg, the weapon and
# the torso carry only the stacks the matrix names for them in
# axes.controlStack.slot (depth, depth+lineart, depth+lineart+canny), in the
# stage-1 product and in the slices alike; the head keeps the whole axis. The
# measurement and its reason live in the matrix note; this file only reads it
# (slot_stacks below), so the matrix stays the one place the answer lives.
LIMB_PARTS_DEFAULT = ("arm-t2-1", "weapon-t2-1")
LIMB_PARTS_V2 = ("arm-t2-1", "leg-t2-1", "weapon-t2-1", "torso-t2-1")

# ── candidates, with licences ──────────────────────────────────────────────
CHECKPOINTS = {
    "sdxl-base-1.0": {
        "repo": "stabilityai/stable-diffusion-xl-base-1.0",
        "licence": "CreativeML Open RAIL++-M",
        "commercial": "yes, with the use restrictions attached",
        "modelCard": "RISK, recorded 2026-09-05: the model card's Intended Use says the model is "
                     "'intended for research purposes only'. That is a stated intended use on the "
                     "card, not a term of the licence, and the OpenRAIL++-M licence itself permits "
                     "commercial use. Anyone reading the card alone will call this research-only, "
                     "so the runbook (provision.sh, RISKS) carries the same note.",
        "res": 1024, "note": "the workhorse. Native 1024, bucket-trained, so odd aspects behave."},
    "sdxl-toy-finetune": {
        "repo": "a community SDXL finetune in the product/toy-render register (Juggernaut XL, RealVisXL and similar)",
        "licence": "usually OpenRAIL++ inherited from SDXL, but NOT always and some add their own terms",
        "commercial": "VERIFY PER MODEL - this is the row most likely to bite",
        "res": 1024, "note": "expected to reach the vinyl register with less style conditioning."},
    "sd15-base": {
        "repo": "runwayml/stable-diffusion-v1-5 (or a mirror; the original repo has moved)",
        "licence": "CreativeML OpenRAIL-M",
        "commercial": "yes, with the use restrictions attached",
        "res": 512, "note": "four to six times faster per image and the widest ControlNet ecosystem. "
                            "The right place to run the COARSE stage even if it does not win."},
    "flux1-schnell": {
        "repo": "black-forest-labs/FLUX.1-schnell",
        "licence": "Apache-2.0",
        "commercial": "yes",
        "res": 1024, "note": "FLUX.1-dev is NON-COMMERCIAL and most FLUX ControlNets are dev-derived, "
                             "so a schnell-compatible control is the blocker, not the checkpoint."},
}
CONTROLNETS = {
    "sdxl-union": {"repo": "xinsir/controlnet-union-sdxl-1.0", "licence": "Apache-2.0",
                   "note": "one model, depth + canny + softedge + more. The practical pick for SDXL."},
    "sdxl-depth": {"repo": "diffusers/controlnet-depth-sdxl-1.0", "licence": "OpenRAIL++"},
    "sdxl-canny": {"repo": "diffusers/controlnet-canny-sdxl-1.0", "licence": "OpenRAIL++"},
    "sd15-depth": {"repo": "lllyasviel/control_v11f1p_sd15_depth", "licence": "Apache-2.0 (openrail on some mirrors)"},
    "sd15-lineart": {"repo": "lllyasviel/control_v11p_sd15_lineart", "licence": "Apache-2.0"},
    "sd15-canny": {"repo": "lllyasviel/control_v11p_sd15_canny", "licence": "Apache-2.0"},
    "ip-adapter": {"repo": "h94/IP-Adapter (plus -sdxl variants)", "licence": "Apache-2.0",
                   "note": "inference-time style conditioning. Trains nothing, so it does not raise the "
                           "question of training on another vendor's model outputs."},
}
# NOT NEEDED, and worth writing down because it is the usual licence trap:
# every ControlNet ANNOTATOR (MiDaS, ZoeDepth, Depth-Anything, HED, the lineart
# nets). bots-sd-controls.py synthesises depth, lineart and canny from our own
# placeholder geometry, so Depth-Anything-V2's CC-BY-NC and the non-commercial
# anime-lineart annotators are simply not in the pipeline.

PARTS = 40


def n(m: dict, axis: str) -> int:
    return len(m["axes"][axis]["values"])


def slot_stacks(m: dict, slot: str) -> list[str]:
    """The control stacks a slot may carry: the matrix's axes.controlStack.slot
    entry when the slot has one, else the whole axis. The head has no entry
    on purpose. An entry naming a stack outside the axis is a matrix error."""
    axis = m["axes"]["controlStack"]
    per = axis.get("slot") or {}
    if slot in per and not slot.startswith("_"):
        off = [s for s in per[slot] if s not in axis["values"]]
        if off:
            sys.exit(f"matrix axes.controlStack.slot.{slot} names stacks outside the axis: {off}")
        return list(per[slot])
    return list(axis["values"])


def slot_stack_map(m: dict, parts) -> dict[str, list[str]]:
    """slot -> stacks for the slots the named parts cover; written into a
    stage's json so a reader sees the narrowing without opening the matrix."""
    return {sl: slot_stacks(m, sl) for sl in sorted({part_triple(p)[0] for p in parts})}


# ── the funnel ─────────────────────────────────────────────────────────────
# Each stage names what it VARIES and what it has FIXED, so a stage that
# cannot answer its question is obvious rather than expensive.
def stages(m: dict) -> list[dict]:
    return [
        {
            "id": 0, "name": "confirm",
            "asks": "does a conditioned render hold the silhouette at all",
            "parts": 1, "seeds": 8, "layout": "single",
            "vary": {"controlStack": ["depth", "depth+lineart"], "controlScale": [0.7, 1.0]},
            "fixed": {"checkpoint": "sdxl-base-1.0", "controlEnd": 1.0, "cfg": 5.0, "steps": 30,
                      "sampler": "dpmpp_2m_karras", "style": 0.0, "plate": "grey",
                      "promptVariant": "full", "negative": "short"},
            "why": "the whole first GPU hour. If silhouette IoU against the control alpha is not over "
                   "0.9 here, no amount of prompt sweeping will fix it and the control stack is wrong.",
        },
        {
            "id": 1, "name": "coarse",
            "asks": "which checkpoint and which control stack, where the useful scale band is, and how "
                    "hard the IP-Adapter may pull against which reference",
            "parts": 3, "seeds": 2, "layout": "single", "partKeys": list(STAGE1_PARTS),
            # the control-stack axis is the head's; the arm and the weapon carry
            # the matrix's per-slot list (slot_stacks, and the matrix note)
            "slotStacks": slot_stack_map(m, STAGE1_PARTS),
            "vary": {"checkpoint": m["axes"]["checkpoint"]["values"],
                     "controlStack": m["axes"]["controlStack"]["values"],
                     "controlScale": m["axes"]["controlScale"]["values"],
                     "controlEnd": m["axes"]["controlEnd"]["values"],
                     "style": list(STAGE1_STYLE),
                     "styleRef": m["axes"]["styleRef"]["values"]},
            "fixed": {"cfg": 5.0, "steps": 30, "sampler": "dpmpp_2m_karras",
                      "plate": "grey", "promptVariant": "full", "negative": "short"},
            "why": "three parts chosen to be maximally different: a head (the busiest), an arm (the "
                   "worst aspect ratio, 0.46) and a weapon (the only horizontal one). A recipe that "
                   "works on all three works. The adapter rides in this stage as a PRODUCT with the "
                   "control axes on purpose: the hand test showed the adapter pull and the control "
                   "scale trade against each other (0.4 against 0.6 held the shape and found the "
                   "finish; 0.8 let the reference take over), so they cannot be swept one at a time. "
                   "Only the wired checkpoint is written to stage1.jsonl; the other three arms are "
                   "counted here and refused by the runner until they are wired. The control-stack "
                   "axis is the head's: the arm and the weapon take only the stacks slotStacks "
                   "names for them, because lineart alone draws an outline on a limb (measured "
                   "2026-09-05, matrix axes.controlStack.slot), and renders counts them that way.",
        },
        {
            "id": 2, "name": "refine",
            "asks": "sampler, guidance, steps, style weight and reference, plate and prompt length",
            "parts": 5, "seeds": 4, "layout": "single", "mode": "coordinate", "passes": 2,
            "vary": {"cfg": m["axes"]["cfg"]["values"], "steps": m["axes"]["steps"]["values"],
                     "sampler": m["axes"]["sampler"]["values"], "style": m["axes"]["style"]["values"],
                     "styleRef": m["axes"]["styleRef"]["values"],
                     "plate": m["axes"]["plate"]["values"],
                     "promptVariant": m["axes"]["promptVariant"]["values"],
                     "negative": m["axes"]["negative"]["values"]},
            "fixed": {"checkpoint": "<stage 1 winner>", "controlStack": "<stage 1 winner>",
                      "controlScale": "<stage 1 winner>", "controlEnd": "<stage 1 winner>"},
            "why": "one part per slot, so every slot gets a vote before a recipe is frozen. "
                   "COORDINATE DESCENT, not a product: 4 x 3 x 3 x 3 x 4 x 3 x 2 is 2,592 combos and "
                   "51,840 renders, which would be a grid hiding inside a funnel and is the exact "
                   "mistake this plan is written against. These seven axes are close to independent - "
                   "the sampler does not change which plate is cleanest and the negative length does "
                   "not change the best step count - so each is swept alone against the current best, "
                   "then the whole thing is repeated once to catch the pairs that do interact. "
                   "22 settings instead of 2,592, and the second pass is the honesty check: if pass "
                   "two moves any axis, they are not independent and that axis pair needs a product.",
        },
        {
            "id": 3, "name": "layout AB",
            "asks": "one part per render, or a kit sheet",
            "parts": 8, "seeds": 6, "layout": "both",
            "vary": {"layout": ["single", "sheet"]},
            "fixed": {"everything else": "<stage 2 winner>"},
            "why": "a sheet enforces one camera and one light across five parts by construction and "
                   "scores five parts per render. The risk is attention bleed between neighbours. "
                   "Cheap to settle and it changes the cost of stage 4 by about five times.",
        },
        {
            "id": 4, "name": "production",
            "asks": "the best candidate for every part in the catalogue",
            "parts": PARTS, "seeds": 48, "layout": "<stage 3 winner>",
            "vary": {"seed": "48 per part"},
            "fixed": {"everything": "<stage 2 winner>"},
            "why": "seeds are the only axis left, and seeds are the axis a gate can exploit: keep the "
                   "highest-scoring survivor per part and discard the rest unseen. 48 is chosen so "
                   "that a 20 percent per-render pass rate still leaves about 10 survivors to rank.",
        },
    ]


def combos(s: dict, stacks: list[str] | None = None) -> int:
    """How many settings a stage visits. A PRODUCT stage crosses its axes; a
    COORDINATE stage walks each axis alone against the current best and then
    repeats, so its axes add instead of multiplying. `stacks` narrows the
    controlStack axis to one slot's list, for a stage whose parts do not all
    carry the same stacks."""
    vals = []
    for k, v in s["vary"].items():
        if not isinstance(v, list):
            continue
        if k == "controlStack" and stacks is not None:
            v = [x for x in v if x in stacks]
        vals.append(v)
    if s.get("mode") == "coordinate":
        return sum(len(v) for v in vals) * int(s.get("passes", 1))
    k = 1
    for v in vals:
        k *= len(v)
    return k


def stage_count(s: dict, m: dict | None = None) -> int:
    """Renders a stage plans. With the matrix and named parts, each part is
    counted at its own slot's control stacks; without, every part is counted
    at the stage's whole axis."""
    per_render_parts = 5 if s.get("layout") == "sheet" else 1
    if m is not None and s.get("partKeys") and isinstance(s["vary"].get("controlStack"), list):
        renders = sum(s["seeds"] * combos(s, slot_stacks(m, part_triple(p)[0])) for p in s["partKeys"])
    else:
        renders = s["parts"] * s["seeds"] * combos(s)
    return max(1, renders // per_render_parts)


def fmt_hours(x: float) -> str:
    return f"{x:5.1f} h" if x >= 1 else f"{x * 60:5.1f} m"


# ── the limb slices ────────────────────────────────────────────────────────

def limb_slice(m: dict, sid: str, name: str, parts: tuple[str, ...], root_rel: str) -> dict:
    """One limb slice as a stage dict expand() can run: the PRODUCT of the
    control stacks the matrix allows every one of its slots (the per-slot list
    in axes.controlStack.slot, so lineart alone is not among them), the two
    scales and the two adapter weights that worked for heads, two seeds, on
    the named parts, against one controls root."""
    per = slot_stack_map(m, parts)
    stacks = [s for s in m["axes"]["controlStack"]["values"]
              if all(s in allowed for allowed in per.values())]
    if not stacks:
        sys.exit(f"limb slice {sid}: no control stack is allowed on every one of {sorted(per)}")
    return {
        "id": sid, "name": name,
        "asks": "does a limb, a weapon or a torso stay one part with no face on it, and with volume",
        "parts": len(parts), "seeds": 2, "layout": "single", "partKeys": list(parts),
        "controlsRoot": root_rel, "slotStacks": per,
        "vary": {"controlStack": stacks, "controlScale": [0.7, 0.85],
                 "style": [0.3, 0.45]},
        "fixed": {"checkpoint": "sdxl-base-1.0", "controlEnd": 0.8, "cfg": 5.0, "steps": 30,
                  "sampler": "dpmpp_2m_karras", "styleRef": "bot-2", "plate": "grey",
                  "promptVariant": "full", "negative": "short"},
        "why": "the head recipe held still, so the only things that move are the slot negatives "
               "(matrix negative.slot: a face and a whole character forbidden on every slot but the "
               "head), the control stacks these slots are allowed (matrix axes.controlStack.slot: "
               "lineart alone came back as an outline drawing on the v2 slice of 2026-09-05, so "
               "every stack here carries depth) and, in the v2 file, the richer limb placeholders "
               "behind the control maps.",
    }


def slices(m: dict) -> list[dict]:
    return [limb_slice(m, "1c", "limbs", LIMB_PARTS_DEFAULT, CONTROLS_REL),
            limb_slice(m, "1d", "limbs-v2", LIMB_PARTS_V2, CONTROLS_V2_REL)]


# ── stage 4, production ────────────────────────────────────────────────────
# THE RECIPE, measured 2026-09-04/05 across stage 1, stage 1b and the two limb
# slices, and judged by rank-part.py. Seeds are the axis the judge reads for
# free, so production is FEW SETTINGS AND MANY SEEDS: 24 candidates per part.
#
#   HEADS      the default controls; lineart or depth+lineart; the two
#              settings the judge's keepers came from (scale 0.55 end 0.60,
#              scale 0.70 end 1.00), adapter 0.60 against head-2; 6 seeds.
#              2 stacks x 2 settings x 6 seeds = 24.
#   THE REST   the v2 controls (the placeholders with features); depth+lineart
#              and never lineart alone (the outline drawing, matrix note);
#              scale 0.85, end 0.8; adapter 0.3 and 0.45 against bot-2;
#              12 seeds. 1 stack x 2 adapters x 12 seeds = 24.
#
# The head's scale and end move TOGETHER (a coupled axis, written as the key
# "controlScale+controlEnd" with one [scale, end] pair per value): the two
# keepers are two points, not a two-by-two grid, and the off-diagonal pairs
# were measured worse. expand() unpacks the pair into the two job fields.
PRODUCTION_HEAD_SETTINGS = [[0.55, 0.60], [0.70, 1.00]]
PRODUCTION_HEAD_STACKS = ["lineart", "depth+lineart"]


def production(m: dict) -> list[dict]:
    """The two production runs as stage dicts expand() can run, one per
    controls root: the eight heads against the default root, the other
    thirty-two parts against the v2 root. Every part in the contract is in
    exactly one of them."""
    c = read_contract()
    heads = [part_key(*p) for p in every_part(c) if p[0] == "head"]
    rest = [part_key(*p) for p in every_part(c) if p[0] != "head"]
    common = {"checkpoint": "sdxl-base-1.0", "cfg": 5.0, "steps": 30, "sampler": "dpmpp_2m_karras",
              "plate": "grey", "promptVariant": "full", "negative": "short"}
    return [
        {
            "id": 4, "name": "heads",
            "asks": "24 candidates for every head, at the settings the judge's keepers came from",
            "parts": len(heads), "seeds": 6, "layout": "single", "partKeys": heads,
            "controlsRoot": CONTROLS_REL, "slotStacks": slot_stack_map(m, heads),
            "vary": {"controlStack": list(PRODUCTION_HEAD_STACKS),
                     "controlScale+controlEnd": [list(x) for x in PRODUCTION_HEAD_SETTINGS]},
            "fixed": {**common, "style": 0.6, "styleRef": "head-2"},
            "why": "the keepers came from lineart at scale 0.55 end 0.60 and at scale 0.70 end 1.00, "
                   "both at adapter 0.60 against head-2; depth+lineart rides beside lineart because "
                   "it held the face as often. Renders that come back side lit lose their face in "
                   "the judge, so the budget goes to seeds, not to more settings.",
        },
        {
            "id": 4, "name": "limbs-v2",
            "asks": "24 candidates for every torso, arm, leg and weapon, one part with no face on it",
            "parts": len(rest), "seeds": 12, "layout": "single", "partKeys": rest,
            "controlsRoot": CONTROLS_V2_REL, "slotStacks": slot_stack_map(m, rest),
            "vary": {"controlStack": ["depth+lineart"], "style": [0.3, 0.45]},
            "fixed": {**common, "controlScale": 0.85, "controlEnd": 0.8, "styleRef": "bot-2"},
            "why": "the v2 slice held every slot as one part with volume at depth+lineart, scale "
                   "0.85, end 0.8, adapter 0.3 and 0.45 against bot-2, with the slot negatives "
                   "forbidding a face; lineart alone is off these slots (an outline drawing). "
                   "Twelve seeds per adapter weight.",
        },
    ]


# ── the controls root ──────────────────────────────────────────────────────

def root_rel(path: str) -> str:
    """A controls root as the repo-relative, forward-slash string a job carries."""
    p = path if os.path.isabs(path) else os.path.join(ROOT, path)
    rel = os.path.relpath(os.path.normpath(p), ROOT).replace(os.sep, "/")
    if rel.startswith(".."):
        sys.exit(f"controls root {path} is outside the repo")
    return rel


def root_tag(rel: str) -> str:
    """'' for the default root, else the root's name under the default
    (art-src/sd/controls/v2 -> 'v2'); goes into file names and render ids."""
    if rel == CONTROLS_REL:
        return ""
    if rel.startswith(CONTROLS_REL + "/"):
        return rel[len(CONTROLS_REL) + 1:].replace("/", "-")
    return os.path.basename(rel.rstrip("/"))


def root_missing(rel: str, parts) -> list[str]:
    """Everything the named parts need under a controls root that is NOT on
    disk: the square manifest and its entries, the five square maps and the
    contract alpha per part. Empty means the root is ready for these parts."""
    root = os.path.join(ROOT, rel)
    manifest = os.path.join(root, "square", "manifest.json")
    need = [manifest]
    for part in parts:
        need += [os.path.join(root, "square", part, f"{k}.png")
                 for k in ("depth", "lineart", "canny", "alpha", "hidden")]
        need.append(os.path.join(root, "contract", part, "alpha.png"))
    missing = [os.path.relpath(x, ROOT).replace(os.sep, "/") for x in need if not os.path.exists(x)]
    if os.path.exists(manifest):
        keys = {it["key"] for it in json.load(open(manifest, encoding="utf-8"))["items"]}
        missing += [f"{rel}/square/manifest.json has no entry for {part}" for part in parts if part not in keys]
    return missing


# ── job rows ───────────────────────────────────────────────────────────────

_PLACEMENTS: dict[str, dict] = {}


def placements(rel: str = CONTROLS_REL) -> dict:
    """The square layout's own record of where each contract canvas was pasted,
    from the manifest bots-sd-controls.py wrote under the given controls root.
    Written into every job so the cut (bots_sd_matte.py) inverts the exact
    transform the control was built with, on any box, without the manifest."""
    if rel not in _PLACEMENTS:
        p = os.path.join(ROOT, rel, "square", "manifest.json")
        if not os.path.exists(p):
            sys.exit(f"missing {p}: run bots-sd-controls.py first")
        _PLACEMENTS[rel] = {it["key"]: {"cropBack": it["cropBack"], "contractCanvas": it["contractCanvas"],
                                        "workingCanvas": it["workingCanvas"]}
                            for it in json.load(open(p, encoding="utf-8"))["items"]}
    return _PLACEMENTS[rel]


def style_ref_path(name: str | None) -> str | None:
    if not name:
        return None
    p = os.path.join(STYLE_CLEAN, name + ".png")
    if not os.path.exists(p):
        sys.exit(f"style reference {name} is in the matrix but {os.path.relpath(p, ROOT)} is not on disk: "
                 f"run bots-sd-stylerefs.py")
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def job_row(m: dict, stage: dict, part: str, setting: dict, seed: int,
            rel: str = CONTROLS_REL) -> dict:
    """One runnable job: the stage's fixed values, this setting's varied ones,
    the prompt assembled by bots_sd_prompt (plain and weighted), the control
    paths under the controls root, the contract alpha for the cut, the
    placement, and the style reference resolved from its name."""
    slot, tier, design = part_triple(part)
    f = {**stage["fixed"], **setting}
    plate, variant, negset = f["plate"], f["promptVariant"], f["negative"]
    prompt = build_prompt(m, slot, tier, plate, variant)
    tokens, counter = count_tokens(prompt)
    style = float(f.get("style", 0.0))
    ref = f.get("styleRef") if style > 0.0 else None
    return {
        "part": part, "slot": slot, "tier": tier, "design": design,
        "controls": {k: f"{rel}/square/{part}/{k}.png"
                     for k in ("depth", "lineart", "canny", "alpha", "hidden")},
        "matte": f"{rel}/contract/{part}/alpha.png",
        "placement": placements(rel)[part],
        "controlsRoot": rel,
        "controlStack": f["controlStack"], "controlScale": f["controlScale"],
        "controlEnd": f["controlEnd"], "cfg": f["cfg"], "steps": f["steps"],
        "sampler": f["sampler"], "checkpoint": f["checkpoint"], "layout": stage["layout"],
        "plate": plate, "promptVariant": variant,
        "style": style, "styleRef": style_ref_path(ref), "styleRefName": ref,
        "seed": 1000 + seed,
        # `negative` in fixed names the SET; the runner wants the text too, and
        # checks the two agree with the matrix before rendering.
        # the slot's own groups ride in front for every slot but the head
        "negativeSet": negset, "negative": build_negative(m, negset, slot),
        # plain text for people and for token counts; the weighted form is what
        # the model is fed. Both come from bots_sd_prompt.
        "prompt": prompt,
        "promptCompel": build_weighted(m, slot, tier, plate, variant),
        "promptTokens": tokens, "promptChunks": chunks_needed(tokens), "tokenCounter": counter,
        "plateHex": m["plates"][plate]["hex"],
    }


def uncouple(setting: dict) -> dict:
    """A coupled axis ("controlScale+controlEnd": [0.55, 0.60]) becomes its
    fields; every other key passes through. The axis NAMES are joined with
    '+', which no single axis name contains (a control STACK value such as
    "depth+lineart" is a value, not a key, and is untouched)."""
    out = {}
    for k, v in setting.items():
        if "+" in k:
            names = k.split("+")
            if not isinstance(v, (list, tuple)) or len(v) != len(names):
                sys.exit(f"coupled axis {k} wants {len(names)} values per entry, got {v!r}")
            out.update(zip(names, v))
        else:
            out[k] = v
    return out


def expand(m: dict, stage: dict, parts: list[str], rel: str = CONTROLS_REL) -> tuple[list[dict], int]:
    """Every runnable job of a PRODUCT stage, in a stable order: settings, then
    parts, then seeds. Returns (rows, planned) where planned counts the whole
    product including the arms the runner cannot run yet, but never a control
    stack the part's slot does not carry (slot_stacks): that is not a job."""
    axes = [(k, v) for k, v in stage["vary"].items() if isinstance(v, list)]
    rows, planned = [], 0
    for values in itertools.product(*[v for _, v in axes]):
        setting = uncouple(dict(zip([k for k, _ in axes], values)))
        wired = setting.get("checkpoint", stage["fixed"].get("checkpoint")) in WIRED_CHECKPOINTS
        for part in parts:
            if "controlStack" in setting and setting["controlStack"] not in slot_stacks(m, part_triple(part)[0]):
                continue
            planned += stage["seeds"]
            if not wired:
                continue
            for seed in range(stage["seeds"]):
                rows.append(job_row(m, stage, part, setting, seed, rel))
    return rows, planned


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sec", type=float, default=None, help="measured seconds per image from lane R")
    ap.add_argument("--emit", action="store_true")
    ap.add_argument("--worked", default=None, metavar="PARTKEY")
    ap.add_argument("--controls-root", default=CONTROLS_REL, metavar="DIR",
                    help=f"the controls tree the emitted stage files point at (default {CONTROLS_REL}; "
                         f"{CONTROLS_V2_REL} once bots-sd-controls.py has written it). A non-default "
                         "root writes stage0.<tag>.jsonl and so on, never over the default files.")
    args = ap.parse_args()
    rel = root_rel(args.controls_root)
    tag = root_tag(rel)

    m = load_matrix()
    c = read_contract()

    # the grid nobody should run
    axes = [a for a, v in m["axes"].items() if isinstance(v, dict) and "values" in v and a != "layout"]
    grid = PARTS * 8
    for a in axes:
        grid *= n(m, a)
    print("THE FULL GRID, for scale")
    print(f"  {' x '.join(str(n(m, a)) for a in axes)} x {PARTS} parts x 8 seeds "
          f"= {grid:,} renders")
    print(f"  at 5 s each that is {grid * 5 / 3600 / 24 / 365:,.0f} years. The funnel below is the plan.\n")

    st = stages(m)
    total = 0
    print("THE FUNNEL")
    print(f"  {'stage':<16} {'parts':>5} {'seeds':>5} {'combos':>7} {'renders':>9}  asks")
    for s in st:
        cnt = stage_count(s, m)
        total += cnt
        mode = "+" if s.get("mode") == "coordinate" else " "
        print(f"  {s['id']}. {s['name']:<13} {s['parts']:>5} {s['seeds']:>5} "
              f"{combos(s):>6}{mode} {cnt:>9}  {s['asks']}")
    print("  (+ = coordinate descent: axes add, they do not multiply)")
    print(f"  {'':<16} {'':>5} {'':>5} {'TOTAL':>7} {total:>9}")
    for s in st:
        if s.get("slotStacks") and s.get("partKeys"):
            per = ", ".join(f"{sl} {len(stacks)} stacks / {combos(s, stacks)} settings"
                            for sl, stacks in s["slotStacks"].items())
            print(f"  stage {s['id']}: combos is the head's axis; per slot {per}. Lineart alone and "
                  "depth+canny are off every slot but the head (matrix axes.controlStack.slot: an "
                  "outline drawing, measured 2026-09-05)")
    print("\nTHE LIMB SLICES (not funnel stages: the head recipe held still on the parts that grow faces)")
    for sl in slices(m):
        print(f"  {sl['id']}. {sl['name']:<10} {sl['parts']} parts x {sl['seeds']} seeds x {combos(sl)} settings "
              f"= {stage_count(sl, m):>3} renders against {sl['controlsRoot']}  "
              f"({', '.join(sl['partKeys'])}; stacks {', '.join(sl['vary']['controlStack'])})")

    print("\nTHE PRODUCTION RUNS (stage 4 as measured: few settings, many seeds, one file per controls root)")
    prod = production(m)
    for pr in prod:
        per = combos(pr, slot_stacks(m, part_triple(pr["partKeys"][0])[0]))
        print(f"  4. {pr['name']:<10} {pr['parts']:>2} parts x {pr['seeds']:>2} seeds x {per:>2} settings "
              f"= {stage_count(pr, m):>4} renders against {pr['controlsRoot']}  "
              f"(stacks {', '.join(pr['vary']['controlStack'])}; adapter "
              f"{pr['vary'].get('style', [pr['fixed'].get('style')])} against {pr['fixed']['styleRef']})")
    print(f"  {'':<13} {'':>2} {'':>2} {'TOTAL':>17} {sum(stage_count(pr, m) for pr in prod):>4} "
          f"across {sum(pr['parts'] for pr in prod)} parts")

    print("\nTIME AND MONEY. Lane R measures the seconds per image; everything here is that number")
    print("times the render count. GPU prices are per-hour spot rates from memory and need checking.")
    secs = [args.sec] if args.sec else [1.0, 3.0, 5.0, 8.0]
    gpus = [("RTX 4090 spot", 0.34), ("L40S", 0.86), ("A100 80GB", 1.79)]
    print(f"  {'s/img':>6} {'total time':>12} " + " ".join(f"{g[0]:>16}" for g in gpus))
    for sec in secs:
        hrs = total * sec / 3600
        row = f"  {sec:>6.1f} {fmt_hours(hrs):>12} "
        row += " ".join(f"{'$' + format(hrs * g[1], '.2f'):>16}" for g in gpus)
        print(row)
    print("  for comparison: one Higgsfield part generation is 3 credits and the balance is about 12,")
    print("  i.e. four more attempts in total against the 40-part catalogue.")
    if not args.sec:
        print("\n  reference points, from memory and to be replaced by lane R's measurements:")
        print("    SD1.5   512px  20 steps  1 ControlNet   4090   about 0.8 - 1.2 s")
        print("    SDXL   1024px  30 steps  1 ControlNet   4090   about 3.5 - 4.5 s")
        print("    SDXL   1024px  30 steps  2 CN + adapter 4090   about 4.5 - 6.0 s")
        print("    batching 4 at a time typically saves 20 to 35 percent per image")

    print("\nPROMPT LENGTH, AND THE TRAP IT USED TO BE")
    print(f"  CLIP's context is {PROMPT_LIMIT} tokens. Plain diffusers TRUNCATES at it without a word,")
    print("  so a prompt that runs long does not get weaker, it gets its tail DELETED - and our tail")
    print("  is the finish, the light and the plate, i.e. everything the sweep is trying to control.")
    print("  Every render now goes through bots_sd_prompt.encode(), which embeds the WHOLE prompt in")
    print(f"  {PROMPT_LIMIT}-token chunks (compel) and weights the law clauses up; it refuses to run")
    print("  without compel rather than fall back to the cut. smoke.py renders the cut prompt and the")
    print("  full embedding at one seed and fails if they come out the same.")
    print(f"  {'variant':<14} {'slot':<8} {'tokens':>7} {'chunks':>7}  counter")
    worst = 0
    for variant in m["axes"]["promptVariant"]["values"]:
        for slot in ("head", "arm"):
            t, how = count_tokens(build_prompt(m, slot, 3, "grey", variant))
            worst = max(worst, t)
            print(f"  {variant:<14} {slot:<8} {t:>7} {chunks_needed(t):>7}  {how}")
    for which in ("short", "long"):
        t, how = count_tokens(build_negative(m, which))
        print(f"  {'negative:' + which:<14} {'-':<8} {t:>7} {chunks_needed(t):>7}  {how}")
    if worst > PROMPT_LIMIT:
        print(f"  the longest production prompt is {worst} tokens, {chunks_needed(worst)} chunks: without")
        print("  chunking `full` and `full+tier` would be silently the same prompt as `terse` plus a")
        print("  few form words, and the promptVariant axis would measure nothing.")

    print("\nPER-PART ECONOMICS AT STAGE 4")
    p4 = [s for s in st if s["id"] == 4][0]
    print(f"  {p4['seeds']} seeds x {PARTS} parts = {stage_count(p4, m)} renders as single parts,")
    print(f"  or {stage_count(p4, m) // 5} if the kit sheet wins stage 3.")
    print("  a 20 percent gate pass rate leaves about 10 survivors per part to rank on style distance.")
    print("\nHEADROOM. Seeds are the cheap axis and the gate reads them for free, so stage 4 should be")
    print("  over-provisioned rather than tuned. Ten times the seeds is ten times stage 4 only:")
    for mult in (1, 4, 10):
        r = total - stage_count(p4, m) + stage_count(p4, m) * mult
        print(f"    {p4['seeds'] * mult:>4} seeds/part  {r:>7,} renders   "
              f"{r * 5 / 3600:5.1f} h at 5 s   ${r * 5 / 3600 * 0.34:6.2f} on a 4090 spot")
    print("  which is the real headline: the entire catalogue, swept and scored, costs less than")
    print("  the four Higgsfield attempts the remaining credits would buy.")

    if args.emit or args.worked:
        os.makedirs(JOBS, exist_ok=True)
        for s in st:
            safe = s["name"].replace(" ", "-").replace("/", "-")
            path = os.path.join(JOBS, f"stage{s['id']}-{safe}.json")
            extra = ({"productionRuns": [{**pr, "renders": stage_count(pr, m)} for pr in production(m)]}
                     if s["id"] == 4 else {})
            with open(path, "w", encoding="utf-8") as f:
                json.dump({**s, "renders": stage_count(s, m),
                           "checkpoints": CHECKPOINTS, "controlnets": CONTROLNETS,
                           "gateTargets": m["gateTargets"], **extra}, f, indent=1)
        # stages 0 and 1 are the ones we can fully expand without a winner from
        # the stage before: stage 0 on the stage-0 part, stage 1 on its three.
        # Every row is self-describing (prompt text included) because the
        # runner checks each job against the matrix on its own, so a file is
        # big and repetitive rather than dependent on a header line.
        written = []
        stage_parts = [(st[0], ["head-t3-1"]), (st[1], st[1]["partKeys"])]
        if rel != CONTROLS_REL:
            miss = root_missing(rel, sorted({p for _, ps in stage_parts for p in ps}))
            if miss:
                sys.exit(f"--controls-root {rel} is not on disk for the stage parts ({len(miss)} missing, "
                         f"first {miss[0]}); run bots-sd-controls.py for that root first")
        suffix = f".{tag}" if tag else ""
        for s, parts in stage_parts:
            rows, planned = expand(m, s, parts, rel)
            fname = f"stage{s['id']}{suffix}.jsonl"
            with open(os.path.join(JOBS, fname), "w", encoding="utf-8") as f:
                for r in rows:
                    f.write(json.dumps(r) + "\n")
            n_style = sum(1 for r in rows if r["style"] > 0)
            refs = sorted({r["styleRefName"] for r in rows if r["styleRefName"]})
            written.append(f"{fname}: {len(rows)} jobs written of {planned} planned against {rel}"
                           + (f" (the {planned - len(rows)} for unwired checkpoints are not written)"
                              if planned != len(rows) else "")
                           + (f"; {n_style} carry the IP-Adapter against {refs}" if n_style else ""))
        # the limb slices: stage1c on the default root as before; stage1d on
        # the v2 root, or on --controls-root when one is given, and only when
        # that root's maps are on disk. A missing root is said plainly and the
        # file is skipped rather than the emit failing.
        for sl in slices(m):
            srel = sl["controlsRoot"]
            if rel != CONTROLS_REL and srel == CONTROLS_V2_REL:
                srel = rel
            stag = root_tag(srel)
            fname = f"stage{sl['id']}-limbs{('-' + stag) if stag else ''}.jsonl"
            miss = root_missing(srel, sl["partKeys"])
            if miss:
                written.append(f"{fname}: NOT written. The controls under {srel} are not on disk yet "
                               f"({len(miss)} missing, first: {miss[0]}). Run bots-sd-controls.py for "
                               "that root, then --emit again.")
                continue
            rows, planned = expand(m, sl, sl["partKeys"], srel)
            with open(os.path.join(JOBS, fname), "w", encoding="utf-8") as f:
                for r in rows:
                    f.write(json.dumps(r) + "\n")
            written.append(f"{fname}: {len(rows)} jobs written against {srel} "
                           f"for {', '.join(sl['partKeys'])} (stacks {', '.join(sl['vary']['controlStack'])}; "
                           f"adapter {sl['vary']['style']} against {sl['fixed']['styleRef']})")
        # the production runs: their roots are the recipe's (heads on the
        # default tree, the rest on v2), never --controls-root; a run whose
        # root is not on disk for its parts is said plainly and skipped.
        for pr in production(m):
            prel = pr["controlsRoot"]
            fname = f"stage{pr['id']}-{pr['name']}.jsonl"
            miss = root_missing(prel, pr["partKeys"])
            if miss:
                written.append(f"{fname}: NOT written. The controls under {prel} are not on disk for all "
                               f"{pr['parts']} of its parts ({len(miss)} missing, first: {miss[0]}). Run "
                               "bots-sd-controls.py for that root, then --emit again.")
                continue
            rows, planned = expand(m, pr, pr["partKeys"], prel)
            with open(os.path.join(JOBS, fname), "w", encoding="utf-8") as f:
                for r in rows:
                    f.write(json.dumps(r) + "\n")
            per_part = len(rows) // max(1, pr["parts"])
            written.append(f"{fname}: {len(rows)} jobs written against {prel} for {pr['parts']} parts, "
                           f"{per_part} per part (stacks {', '.join(pr['vary']['controlStack'])}; "
                           f"adapter {pr['vary'].get('style', [pr['fixed'].get('style')])} against "
                           f"{pr['fixed']['styleRef']}; {pr['seeds']} seeds)")
        print(f"\njob files written to {os.path.relpath(JOBS, ROOT)}")
        for w in written:
            print("  " + w)

    if args.worked:
        key = args.worked
        slot = key.split("-")[0]
        tier = int(key.split("-")[1][1:])
        design = int(key.split("-")[2])
        dst = os.path.join(WORKED, key)
        os.makedirs(dst, exist_ok=True)
        for layout in ("contract", "square"):
            src = os.path.join(ROOT, rel, layout, key)
            if not os.path.isdir(src):
                sys.exit(f"missing {src}: run bots-sd-controls.py first")
            for fn in os.listdir(src):
                shutil.copyfile(os.path.join(src, fn), os.path.join(dst, f"{layout}-{fn}"))
        prompt = build_prompt(m, slot, tier, "grey", "full+tier")
        weighted = build_weighted(m, slot, tier, "grey", "full+tier")
        neg = build_negative(m, "short", slot)
        ptok, pcounter = count_tokens(prompt)
        ntok, _ = count_tokens(neg)
        with open(os.path.join(dst, "prompt.txt"), "w", encoding="utf-8") as f:
            f.write(prompt + "\n")
        with open(os.path.join(dst, "prompt-compel.txt"), "w", encoding="utf-8") as f:
            f.write(weighted + "\n")
        with open(os.path.join(dst, "negative.txt"), "w", encoding="utf-8") as f:
            f.write(neg + "\n")
        with open(os.path.join(dst, "params.json"), "w", encoding="utf-8") as f:
            json.dump({
                "part": key, "canvas": c["rig"][slot],
                "workingCanvas": [1024, 1024], "controlsRoot": rel,
                "prompt": {"tokens": ptok, "chunks": chunks_needed(ptok), "counter": pcounter,
                           "negativeTokens": ntok,
                           "embedding": "the whole prompt, in 77-token chunks, law clauses weighted "
                                        "(prompt-compel.txt); assembled and embedded only by "
                                        "scripts/sd/bots_sd_prompt.py"},
                "checkpoint": CHECKPOINTS["sdxl-base-1.0"],
                "controlnet": CONTROLNETS["sdxl-union"],
                "controlStack": ["depth", "lineart"],
                "controlScale": [0.85, 0.55],
                "controlEnd": 1.0, "cfg": 5.0, "steps": 30, "sampler": "dpmpp_2m_karras",
                "style": 0.0, "plate": m["plates"]["grey"],
                "styleStage1": {"scales": list(STAGE1_STYLE), "references": m["axes"]["styleRef"]["values"],
                                "from": "art-src/sd/style/clean (bots-sd-stylerefs.py)"},
                "seeds": [1000 + i for i in range(8)],
                "matte": "the control alpha eroded 2px and feathered 1px (scripts/sd/bots_sd_matte.py); "
                         "NEVER a colour key",
                "gate": m["gateTargets"],
            }, f, indent=1)
        with open(os.path.join(dst, "expect.txt"), "w", encoding="utf-8") as f:
            f.write(EXPECT.strip() + "\n")
        # one image a person can take in at a glance: the placeholder we are
        # conditioning on, beside every map derived from it, on the plate the
        # render will use.
        from PIL import Image  # local: the rest of this file needs no imaging
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from bots_sd_source import load as _load, read_pre as _pre  # noqa: E402
        src = _load(c, _pre(), slot, tier, design, "unbias")
        panels = [("placeholder (unbias)", src.convert("RGB"))]
        for nm in ("depth", "lineart", "canny", "alpha", "hidden", "joints"):
            panels.append((nm, Image.open(os.path.join(dst, f"contract-{nm}.png")).convert("RGB")))
        w, h = src.size
        cols, pad = 4, 12
        rows = (len(panels) + cols - 1) // cols
        plate = tuple(int(m["plates"]["grey"]["hex"][i:i + 2], 16) for i in (1, 3, 5))
        sheet = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + pad) + pad), plate)
        for i, (nm, im) in enumerate(panels):
            r, cc = divmod(i, cols)
            sheet.paste(im, (pad + cc * (w + pad), pad + r * (h + pad)))
        sheet.save(os.path.join(dst, "_review.png"))
        print(f"\nworked example written to {os.path.relpath(dst, ROOT)}")
    return 0


EXPECT = """
WHAT TO EXPECT FROM THE FIRST EIGHT RENDERS, AND WHAT EACH FAILURE MEANS
part head-t3-1, contract canvas 456 x 384, generated on a 1024 square

The point of this folder is that the first GPU hour is spent CONFIRMING, not
exploring. Everything below is a prediction. Write down which ones came true.

WHAT SHOULD BE ON SCREEN
  A single robot head, dead-on, filling about 86 percent of the frame width,
  on flat mid grey. Wider than it is tall. A rounded crown, a low wide lug on
  each side at the cheek line, and an underside that continues as a dome
  rather than stopping flat. Two big round eyes set wide, each a pale cream
  lens the brightest thing in the picture, in a shallow bezel. A dark recessed
  slatted grille for a mouth. A shallow moulded panel on the crown, because
  tier 3. Nothing metal anywhere except, on this slot, nothing at all: the
  bot's one brass piece lives on the torso.

WHAT THE PROMPT IS TELLING THE MODEL
  prompt.txt is 234 CLIP tokens against a 77-token context (real tokenizer,
  2026-09-05). It is embedded WHOLE, in 77-token chunks, with the finish, the
  neutral colour law, the light law and the plate weighted up (prompt-compel.txt
  is the exact string the model sees). Plain diffusers would keep the first 77
  tokens, which end at "the underside is a continuous dome and is", and delete
  every house law after that without a word. That is what the eight shipped
  heads were rendered under. If a render ignores the finish or the light, check
  the run log says "embedded 4 chunks" before you touch the prompt.

WHAT THE CONTROL MAPS ARE TELLING THE MODEL
  contract-depth.png    the form. The crown is near, the rim falls away, the
                        two ear lugs read as separate spheres, THE EYES STAND
                        PROUD and THE GRILLE AND THE PUPILS ARE SUNK. That
                        relief is the difference between a face and an egg
                        with two discs painted on it, and it is information no
                        depth annotator run over a photo could have recovered.
  contract-lineart.png  every boundary the bake actually drew, and NOTHING
                        else. If you see faint horizontal stripes here, the
                        band veto has regressed; stop, because a lineart model
                        will paint those stripes onto the part.
  contract-canny.png    the same boundaries, hard.
  contract-alpha.png    THE MATTE. Not a key: this is the exact silhouette,
                        and the finished part is cut out with it.
  contract-hidden.png   the head skirt the torso covers, 10.8 percent of the
                        ink. Do not score it and do not repair it.
  contract-joints.png   one dot at the neck seat (228, 315). Review only. No
                        ControlNet reads a marker; the pivot is enforced by
                        the silhouette and the fixed canvas.

THE FAILURES TO WATCH FOR, IN THE ORDER THEY ARE LIKELY
  1. IT LOOKS LIKE THE PLACEHOLDER. Flat grey clay, no finish, correct shape.
     The control is too strong or it ran too late. Drop controlScale toward
     0.7 or controlEnd toward 0.8. This is the good failure: it means the
     geometry is locked and only the register is missing.
  2. IT LOOKS BEAUTIFUL AND IS THE WRONG SHAPE. The opposite. Raise the scale.
     Silhouette IoU against contract-alpha.png is the number, not the eye.
  3. A NECK, A BODY, OR A WHOLE ROBOT. The subject line lost. Move "on its
     own, no body, no neck stump" earlier in the prompt and raise the weight
     on the frame negative group.
  4. THREE-QUARTER VIEW OR A TILT. The named failure from the old pipeline.
     Should be almost impossible here, because the depth map is flat-symmetric
     and a three-quarter head cannot satisfy it. If it happens anyway the
     control is not being applied; check the plumbing before the prompt.
  5. BOLTS OR A COLLAR APPEAR. Stage 0 runs with style 0.0, so if they appear
     here the checkpoint's own prior is doing it: negative group `joints`. In
     stage 1 the adapter is on, fed the cleaned concept references only (the
     old B1 anchor, which carried a brass bolt at every joint, is out of the
     set by name); if bolts appear THERE, look at which reference and which
     adapter scale, before the prompt.
  6. THE EYES COME BACK THE SAME GREY AS THE FACE. This one already shipped:
     it is exactly what the eight generated heads on disk do today, and it
     matters because the paint mask then classifies the lens as body and the
     player's colour repaints the eyes. The depth map now makes the eyes
     proud, which is the structural fix; `lensDistinct` in the gate is the
     numeric one.
  7. STRIPES ACROSS THE FORM. A control-map artifact leaking through. Check
     contract-lineart.png first, not the prompt.

THE NUMBERS THAT DECIDE IT, NOT THE EYE
  silhouette IoU vs contract-alpha.png   over 0.90 to continue at all
  every pivot on ink                     hard fail otherwise
  no pixel on a canvas edge              hard fail otherwise
  lens at least 25 percent brighter than the body median, and classified as
                                         an accent by bots-art-accents.json
  rim edge recall (bots_sd_matte)        the share of the matte's boundary the
                                         render drew an edge on: the model
                                         filled the silhouette. No bar yet; the
                                         first cuts set it. Not a colour test,
                                         because the plate is the body's grey.
  metal at most 4 percent of the part    zero is correct for a head

IF SEVEN OF EIGHT SEEDS FAIL THE SAME WAY, IT IS THE RECIPE.
IF THEY FAIL EIGHT DIFFERENT WAYS, THE CONTROL IS TOO WEAK.
"""

if __name__ == "__main__":
    sys.exit(main())
