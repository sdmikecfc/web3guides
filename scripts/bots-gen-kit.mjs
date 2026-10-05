/**
 * Battle Bots: THE WHOLE-BOT PLATE.
 *
 * Draws ONE shared grey-clay skeleton on a flat magenta plate and writes one
 * prompt per family against it, so every family is generated as a WHOLE TOY
 * under one camera, one light, one set of limb lengths and one foot line. The
 * per-part waves that came before this drew each part alone on its own canvas,
 * and that is what produced the bot Mike rejected: a 90x200 limb beside a
 * 200x240 torso cannot be stubby, and a 160 head against a 200 torso cannot be
 * big. Proportion was decided by the canvas sizes before a pixel was drawn.
 *
 * WHAT CHANGED ON 2026-09-04, and why the old prompt in this file was deleted.
 * It ordered "a large round BALL", "a brass COLLAR RING" and "a sunk dark hole"
 * at every joint. Eight joints cropped out of art-src/bots/concept/ carry none
 * of that: a plain rounded cap in the limb's own colour, overlapped by the body,
 * one soft occlusion wash, and no hardware anywhere. It reads because the head
 * is wider than the body, so the HEAD hides the shoulder. There is no joint to
 * solve, so the prompt now forbids the hardware it used to demand.
 *
 * THE ONE DELIBERATE DEPARTURE FROM THE CONTRACT, and it is the reason this
 * wave works at all. The plate is a DRAWING AID, not the finished composition.
 * At the contract's target numbers the arm's inner edge lands 0.009 H from the
 * torso edge, and once the arm is pre-compensated for the model's own bias it
 * OVERLAPS the torso outright. The previous wave accepted that and cut the arm
 * on a guessed vertical line; the result was that four of seven bots came back
 * with no separable arm at all (arm_w measured 0.000) and the mixed bots wore
 * synthetic grey capsules where their arms should be. So the plate holds the
 * arms at the band's OUTER edge and narrows the body toward the band's inner
 * edge, opening a real magenta channel about 0.04 H wide between arm and body.
 * Every number stays inside the contract's measured band. The channel is what
 * lets scripts/bots-import-parts.py find three runs on a belly row -- left arm,
 * body, right arm -- instead of guessing. Registration, not the plate, is what
 * puts the arm back on the contract pivot, and it moves INBOARD when it lands,
 * further under the head.
 *
 *   node scripts/bots-gen-kit.mjs --list                 # families and tiers, spend nothing
 *   node scripts/bots-gen-kit.mjs --plate                # draw the plate + landmarks, spend nothing
 *   node scripts/bots-gen-kit.mjs --prompts              # plate, then one prompt per family
 *   node scripts/bots-gen-kit.mjs --prompts --family kettle   # print one prompt
 *
 * Outputs, all under public/bots-art/_raw/kits:
 *   skeleton.png        the grey-clay whole bot on the magenta plate
 *   skeleton-mask.png   editable = transparent, for an inpaint model
 *   skeleton.json       every landmark in plate pixels, for the cutter
 *   prompts.json        one prompt per family, built off skeleton.json
 *
 * Nothing here calls a generator or spends a credit. scripts/bots-gen-parts.mjs
 * is the driver that submits these prompts.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "bots-art", "_raw", "kits");

// ── the contract, READ OUT OF THE SHIPPED FILE ────────────────────────────
// src/app/bots/_view/rig-points.ts is what the bake, the rig and the art gate
// all read. Parsing it here rather than retyping the numbers is the same law
// the gates follow: a plate that carries its own copy of the contract is a
// plate that can silently disagree with the thing it is drawing for.
const RIG_TS = fs.readFileSync(path.join(ROOT, "src", "app", "bots", "_view", "rig-points.ts"), "utf8");

function figureBand(name) {
  const m = RIG_TS.match(new RegExp(`\\b${name}:\\s*\\{\\s*min:\\s*(-?[\\d.]+),\\s*target:\\s*(-?[\\d.]+),\\s*max:\\s*(-?[\\d.]+)`));
  if (!m) throw new Error(`contract: no band '${name}' in rig-points.ts`);
  return { min: +m[1], target: +m[2], max: +m[3] };
}
function figureNum(name) {
  const m = RIG_TS.match(new RegExp(`^\\s*${name}:\\s*(-?[\\d.]+),`, "m"));
  if (!m) throw new Error(`contract: no FIGURE.${name} in rig-points.ts`);
  return +m[1];
}
function rigSlot(slot) {
  const m = RIG_TS.match(new RegExp(`\\b${slot}:\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`contract: no RIG.${slot} in rig-points.ts`);
  const o = {};
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*(\[[^\]]*\]|-?[\d.]+)/g)) o[k] = JSON.parse(v);
  return o;
}

const H = figureNum("H");
const SKIRT = figureNum("skirt");
const MARGIN = figureNum("margin");
const BANDS = [
  "headsTall", "headH", "headCoreW", "headFullW", "headCoreOverH", "headOverBody",
  "bodyH", "bodyW", "bodyWOverH", "legH", "footH", "footW", "stanceW",
  "armW", "armL", "armLOverW", "shoulderW", "shoulderY", "hipY",
].reduce((a, k) => ((a[k] = figureBand(k)), a), {});
const RIG = ["head", "torso", "arm", "leg", "weapon"].reduce((a, k) => ((a[k] = rigSlot(k)), a), {});

// ── the eight authored family and tier pairs ──────────────────────────────
// One pair per tier, straight off src/app/bots/_engine/catalog.ts. The motif is
// the ONLY thing that changes between two bots on the same plate, and it lives
// in moulded shape, never in added fittings.
const FAMILIES = {
  sprocket:  { tier: 1, motif: "gear-tooth edges around the head's crown, a hub with spokes moulded into the chest, chain-link seams" },
  peeper:    { tier: 1, motif: "extra lens rings moulded around the eyes, a small periscope nub on the crown, fine dial markings" },
  kettle:    { tier: 2, motif: "rounded kettle shapes, a spout-like ridge on one side of the head, a lid-rim seam across the crown" },
  lantern:   { tier: 2, motif: "a lantern glass window moulded into the chest, a small hanging ring on the crown, warm inner glow" },
  hornet:    { tier: 3, motif: "sleek tapered shapes, one fine stripe seam around the body, small moulded fin edges" },
  piston:    { tier: 3, motif: "cylinder and piston shapes, banded rings moulded into the clay, low bolt-head bumps moulded in clay" },
  bulldozer: { tier: 4, motif: "wide flat plates, a blade-like brow moulded over the eyes, tread-like grooves" },
  anvil:     { tier: 4, motif: "heavy flat-topped blocks, a horn-like edge on the head, thick square corners" },
};
const TIER_FINISH = {
  1: "plain and a little worn, almost no moulded detail",
  2: "clean and tidy, one small moulded seam",
  3: "crisp and finely moulded, a fine seam line",
  4: "premium, deeply moulded, the crispest edges",
};

// ── the plate, drawn in PIL ───────────────────────────────────────────────
const PLATE_PY = String.raw`
import json, sys, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

cfg = json.load(open(sys.argv[1]))
B, RIG, H = cfg["bands"], cfg["rig"], cfg["H"]
OUT = cfg["out"]

PLATE = 1024
HR    = 800          # the figure's height, in plate pixels
CX    = PLATE // 2
APEX  = 108
FLOOR = APEX + HR

# PRE-COMPENSATION, AND WHY IT IS NOW ALMOST NOTHING.
#
# The wave before this one measured a large, consistent model bias and corrected
# for it: arm width came back 16 percent narrower than asked, arm length 18
# percent longer, leg 27 percent longer, foot 21 percent smaller. So the plate
# asked for target/bias, which meant asking for an arm 19 percent FATTER and 15
# percent SHORTER than the contract wants.
#
# THAT BIAS IS GONE, and it is worth knowing why, because it is the same cause
# as everything else in this file. The model was drawing thin arms because the
# plate had the arms touching the body: it could not tell where the arm ended,
# so it drew what it thought a robot arm looks like. Once the plate opened a
# real magenta channel and the prompt said do not thin it and do not flatten it,
# the model started drawing the plate. Re-measured over all eight bots of the
# first channelled wave, asked against drawn:
#     arm width   x1.11    arm length  x1.08    foot width  x1.06
#     stance      x0.99    head full   x1.03
# It now draws slightly MORE than asked, uniformly, instead of much less.
#
# Leaving the old numbers in place cost a whole wave: they asked for a fat short
# arm, the model drew it faithfully, and every family came back with an arm
# aspect near 1.0 against a contract band that starts at 1.07. So the correction
# below is now just the measured over-draw, inverted.
PRE = {"armW": 1/1.11, "armL": 1/1.08, "footW": 1/1.06, "legH": 0.95, "footH": 0.95}

def band(k):   return B[k]
def t(k):      return band(k)["target"] * PRE.get(k, 1.0)

# THE CHANNEL. shoulderW rides the band's OUTER edge and bodyW the inner, so a
# real magenta gap opens between arm and body and the cutter can find three
# runs on a belly row. Both stay inside the measured band; see the file header.
SHOULDER_W = band("shoulderW")["max"] - 0.004      # 0.645 of 0.375..0.649
BODY_W     = band("bodyW")["min"] + 0.006          # 0.385 of 0.379..0.474
# THE HEAD RIDES THE BAND, IT DOES NOT SIT ON THE CEILING. The first wave asked
# for 0.775 against a band max of 0.780, the model drew 1.03 of it as it always
# does, and four of eight heads came back too wide for the head canvas and were
# clipped at the ear lug. Ask for a head that is still big but leaves the model
# its own overshoot to spend.
HEAD_FULL  = band("headFullW")["max"] / 1.03 - 0.028   # about 0.729

G = dict(
    head_h      = t("headH")      * HR,
    head_core_w = t("headCoreW")  * HR,
    head_full_w = HEAD_FULL       * HR,
    body_h      = t("bodyH")      * HR,
    body_w      = BODY_W          * HR,
    leg_h       = t("legH")       * HR,
    foot_h      = t("footH")      * HR,
    foot_w      = t("footW")      * HR,
    arm_w       = t("armW")       * HR,
    arm_l       = t("armL")       * HR,
    shoulder_w  = SHOULDER_W      * HR,
    shoulder_y  = APEX + band("shoulderY")["target"] * HR,
)
G["crease"] = APEX + G["head_h"]
# the hip is wherever the pre-compensated leg reaches the floor from, never a
# free number: leg_h and hip_y have to agree or the landmark file is lying
# about the leg it drew.
G["hip_y"]  = FLOOR - G["leg_h"]
# the leg shafts sit on the torso's own hip points, in contract units
G["hip_dx"] = abs(RIG["torso"]["hipR"][0] - RIG["torso"]["neck"][0]) / H * HR
G["arm_cx"] = G["shoulder_w"] / 2
# THE FEET: splayed outward so a clear channel opens on the centre line, because
# a cut cannot split two feet that touch, but splayed only as far as THE LEG
# CANVAS CAN ACTUALLY HOLD. That budget is read off the contract, not chosen:
# the leg canvas is HANDED, with the hip pivot off centre, and the room from the
# hip out to the toe is all the toe gets. The first wave splayed the feet to a
# stance of 0.64 and let two families reach 0.82 and 0.86, and the leg then
# needed 193 units where the canvas offers 113. Absorbing that would have meant
# scaling the entire shelf to 59 percent.
lc, lpiv = RIG["leg"], RIG["leg"]["hip"]
hip_to_toe_room = (max(lpiv[0], lc["w"] - 1 - lpiv[0]) - cfg["margin"]) / H
# spend 88 percent of it, so the model's measured 1.06 over-draw still lands inside
G["hip_to_toe"] = hip_to_toe_room * 0.88 * HR
G["foot_in"] = G["hip_to_toe"] + G["hip_dx"] - G["foot_w"]
if G["foot_in"] < 0.018 * HR:
    # the toe budget cannot pay for a foot this wide AND a centre gap; take the
    # gap, because without it the two legs cannot be cut apart at all. 0.018 H
    # is about 29 px on the plate and 58 px on a 2K render, which is the same
    # order as the arm channel that worked on all eight bots.
    G["foot_in"] = 0.018 * HR
    G["foot_w"] = G["hip_to_toe"] + G["hip_dx"] - G["foot_in"]
G["foot_cx"] = G["foot_in"] + G["foot_w"] / 2
G["stance_w"] = 2 * (G["foot_in"] + G["foot_w"])
G["arm_gap"] = (G["arm_cx"] - G["arm_w"] / 2) - G["body_w"] / 2

CLAY  = (176, 176, 176)
EYE   = (238, 238, 226)
DARK  = (58, 52, 46)
FOOT  = (196, 128, 106)
BRASS = (198, 152, 66)

def mul(c, k): return tuple(min(255, max(0, round(v * k))) for v in c)
def new():     return Image.new("RGBA", (PLATE, PLATE), (0, 0, 0, 0))

def ramp(layer, y0, y1, top, bot):
    """the contract's measured vertical light ramp, applied ONCE over one form.
    Purely vertical, so it is identical whatever family a part came from and it
    survives the rig mirroring a limb."""
    a = np.array(layer).astype(np.float32)
    yy = np.arange(a.shape[0], dtype=np.float32)
    tt = np.clip((yy - y0) / max(1.0, y1 - y0), 0, 1)
    g = np.where(tt < 0.25, top, top + (bot - top) * (tt - 0.25) / 0.75)
    a[:, :, :3] *= g[:, None, None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def spec(im, cx, top, w):
    sp = new()
    ImageDraw.Draw(sp).ellipse([cx - w*.15, top + w*.10, cx + w*.15, top + w*.28],
                               fill=(250, 248, 240, 165))
    im.alpha_composite(sp.filter(ImageFilter.GaussianBlur(w * .07)))
    return im

def build_head():
    im = new(); d = ImageDraw.Draw(im)
    cw, hh, fw = G["head_core_w"], G["head_h"], G["head_full_w"]
    sy  = G["crease"]; top = sy - hh
    er  = (fw - cw) / 2
    # EAR LUGS are STRUCTURE, not trim: lower edge on the crease, outer edge at
    # full head width. They are what hides the arm's buried cap. Drawn bold,
    # because a faint lug reads as shading and the model paints it away.
    # Two tones only. An earlier plate drew three concentric rings here and that
    # is a picture of a socket: the one thing the contract forbids at a joint,
    # drawn at exactly the place the model looks for one.
    for s in (-1, 1):
        lx = CX + s * (cw/2 - er*.10)
        d.ellipse([lx - er, sy - er*2.15, lx + er, sy + er*.10], fill=mul(CLAY, .88))
        d.ellipse([lx - er*.58, sy - er*1.70, lx + er*.58, sy - er*.42], fill=mul(CLAY, .76))
    # THE DOME, and its underside is a DOME TOO. The ellipse runs past the
    # crease by the contract's skirt, so the head's buried edge is curved. Every
    # collage failure in the study had a head cut flat at its widest row, which
    # laid a straight bar across the chest.
    skirt = cfg["skirt"] / H * HR
    d.ellipse([CX - cw/2, top, CX + cw/2, top + hh + skirt], fill=CLAY)
    d.rounded_rectangle([CX - cw*.10, top + hh*.035, CX + cw*.10, top + hh*.12],
                        radius=10, fill=mul(CLAY, .88))
    ey, eR = top + hh*.44, cw*.155
    for s in (-1, 1):
        ex = CX + s * cw*.215
        d.ellipse([ex-eR, ey-eR, ex+eR, ey+eR], fill=EYE, outline=mul(CLAY, .58), width=6)
        d.ellipse([ex-eR*.55, ey-eR*.55, ex+eR*.2, ey+eR*.2], fill=(255, 255, 250))
    d.ellipse([CX - cw*.028, top + hh*.565, CX + cw*.028, top + hh*.625], fill=mul(CLAY, .80))
    gy = top + hh*.70
    d.rounded_rectangle([CX - cw*.185, gy, CX + cw*.185, gy + hh*.105], radius=10, fill=DARK)
    for i in range(-3, 4):
        gx = CX + i * cw*.048
        d.line([gx, gy+3, gx, gy + hh*.105 - 3], fill=mul(CLAY, .62), width=4)
    return spec(ramp(im, top, sy + skirt, 1.00, 0.60), CX, top, cw)

def build_torso():
    im = new(); d = ImageDraw.Draw(im)
    bw = G["body_w"]
    top = G["crease"] - cfg["skirt"] / H * HR    # buried above the crease, under the head
    bot = G["hip_y"]
    d.rounded_rectangle([CX - bw/2, top, CX + bw/2, bot], radius=bw*.33, fill=CLAY)
    # THE ONE BRASS PIECE ON THE WHOLE FIGURE: the wind-up key, on the chest and
    # nowhere near a joint.
    ky = top + (bot - top)*.60; kr = bw*.105
    for s in (-1, 1):
        d.ellipse([CX + s*kr*.95 - kr*.62, ky - kr*.62, CX + s*kr*.95 + kr*.62, ky + kr*.62],
                  outline=BRASS, width=9)
    d.ellipse([CX - kr*.62, ky - kr*1.55, CX + kr*.62, ky - kr*.31], outline=BRASS, width=9)
    d.ellipse([CX - kr*.30, ky - kr*.30, CX + kr*.30, ky + kr*.30], fill=BRASS)
    # the head shades the torso: it starts at roughly half the head's value.
    # The strongest one-body cue available, and it costs nothing.
    return ramp(im, top, bot, 0.52, 0.66)

def build_arm(side):
    im = new(); d = ImageDraw.Draw(im)
    aw, al = G["arm_w"], G["arm_l"]
    cx  = CX + side * G["arm_cx"]
    top = G["shoulder_y"] - aw/2
    bot = top + aw/2 + al
    d.rounded_rectangle([cx-aw/2, top, cx+aw/2, bot], radius=aw/2, fill=mul(CLAY, .95))
    d.ellipse([cx-aw*.56, bot-aw*.98, cx+aw*.56, bot+aw*.12], fill=mul(CLAY, .90))
    return ramp(im, top, bot + aw*.12, 0.95, 0.56)

def build_leg(side):
    im = new(); d = ImageDraw.Draw(im)
    lw = G["arm_w"] * 1.02
    fw, fh = G["foot_w"], G["foot_h"]
    cx = CX + side * G["hip_dx"]
    top = G["hip_y"] - lw/2
    d.rounded_rectangle([cx-lw/2, top, cx+lw/2, FLOOR - fh*.45], radius=lw/2, fill=mul(CLAY, .92))
    im = ramp(im, top, FLOOR, 0.92, 0.58); d = ImageDraw.Draw(im)
    x0 = CX + side * G["foot_in"]; x1 = CX + side * (G["foot_in"] + fw)
    # A shoe, not a slab: the toe end is fully rounded and the sole is a thin
    # darker welt, which is what every foot in the concept scenes is.
    d.rounded_rectangle([min(x0,x1), FLOOR-fh, max(x0,x1), FLOOR-fh*.12], radius=fh*.48, fill=FOOT)
    d.rounded_rectangle([min(x0,x1), FLOOR-fh*.26, max(x0,x1), FLOOR], radius=fh*.13, fill=mul(FOOT, .82))
    return im

fig = new()
for lay in (build_leg(-1), build_leg(1), build_arm(-1), build_arm(1), build_torso(), build_head()):
    fig.alpha_composite(lay)
plate = Image.new("RGBA", (PLATE, PLATE), (255, 0, 255, 255))
plate.alpha_composite(fig)

a = np.array(fig)[:, :, 3]
edit = Image.fromarray(np.where(a > 8, 255, 0).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
mask = Image.new("RGBA", (PLATE, PLATE), (0, 0, 0, 255))
mask.putalpha(Image.fromarray(255 - np.array(edit)))

os.makedirs(OUT, exist_ok=True)
plate.convert("RGB").save(os.path.join(OUT, "skeleton.png"))
mask.save(os.path.join(OUT, "skeleton-mask.png"))

# THE CHANNEL GATE. The whole wave depends on there being clear background
# between each arm and the body, and between the two feet. If the plate does
# not have it the generations cannot be cut, so refuse to write a plate that
# would waste credits.
ink = a > 16
# Check the ARM'S OWN span, not the whole belly: the arm is short and stops
# well above the hip by design, so rows below it show one run and always would.
arm_top = G["shoulder_y"] - G["arm_w"]/2
arm_bot = arm_top + G["arm_w"]/2 + G["arm_l"]
belly = slice(int(arm_top + G["arm_w"]*0.6), int(arm_bot - G["arm_w"]*0.6))
runs_ok = 0
for y in range(belly.start, belly.stop):
    edges = np.diff(ink[y].astype(np.int8))
    if (edges == 1).sum() == 3: runs_ok += 1
share = runs_ok / max(1, belly.stop - belly.start)
if share < 0.90:
    sys.exit(f"PLATE REFUSED: only {share:.0%} of arm rows show three runs "
             f"(left arm, body, right arm). The arm channel is {G['arm_gap']:.1f} px.")
foot_row = ink[int(FLOOR - G["foot_h"]*0.5)]
if foot_row[CX-2:CX+3].any():
    sys.exit("PLATE REFUSED: the two feet touch on the centre line, so a cut cannot split them.")

land = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in G.items()}
land.update(plate=PLATE, HR=HR, CX=CX, APEX=APEX, FLOOR=FLOOR, H=H,
            k_plate_per_unit=round(HR / H, 5))
json.dump(land, open(os.path.join(OUT, "skeleton.json"), "w"), indent=1)

ys, xs = np.where(ink.sum(1) > 0)[0], np.where(ink.sum(0) > 0)[0]
print(json.dumps({
    "ink": [int(xs[0]), int(ys[0]), int(xs[-1]), int(ys[-1])],
    "figure_h": int(ys[-1] - ys[0] + 1), "figure_w": int(xs[-1] - xs[0] + 1),
    "arm_channel_px": round(G["arm_gap"], 1),
    "foot_gap_px": round(2 * G["foot_in"], 1),
    "asks": {k: round(v / HR, 3) for k, v in
             (("armW", G["arm_w"]), ("armL", G["arm_l"]), ("footW", G["foot_w"]),
              ("stanceW", G["stance_w"]), ("headFullW", G["head_full_w"]),
              ("hipToToe", G["hip_to_toe"]))},
    "arm_rows_with_three_runs": f"{share:.0%}",
    "heads_tall": round((ys[-1] - ys[0] + 1) / G["head_h"], 3),
}, indent=1))
`;

function buildPlate() {
  fs.mkdirSync(OUT, { recursive: true });
  const cfgPath = path.join(OUT, ".plate-cfg.json");
  fs.writeFileSync(cfgPath, JSON.stringify({ bands: BANDS, rig: RIG, H, skirt: SKIRT, margin: MARGIN, out: OUT }));
  const r = spawnSync("python", ["-", cfgPath], {
    input: PLATE_PY, encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  fs.rmSync(cfgPath, { force: true });
  if (r.status !== 0) throw new Error(`plate failed:\n${r.stdout || ""}${r.stderr || ""}`);
  return JSON.parse(r.stdout);
}

// ── the prompt ────────────────────────────────────────────────────────────
// Every joint number in the words is read back out of skeleton.json, so the
// prompt can never disagree with the plate it ships beside.
function prompts() {
  const L = JSON.parse(fs.readFileSync(path.join(OUT, "skeleton.json"), "utf8"));
  const f = (v) => +(v / L.plate).toFixed(3);

  const SHAPE =
    "THE JOINTS ARE FIXED AND MUST NOT MOVE. As fractions of the frame, from the top left: " +
    `the top of the head is at y=${f(L.APEX)}; the head meets the body on a horizontal line at y=${f(L.crease)}; ` +
    `the two shoulders are on a line at y=${f(L.shoulder_y)}, at x=${f(L.CX - L.shoulder_w / 2)} and x=${f(L.CX + L.shoulder_w / 2)}; ` +
    `the two hips are on a line at y=${f(L.hip_y)}, at x=${f(L.CX - L.hip_dx)} and x=${f(L.CX + L.hip_dx)}; ` +
    `both feet stand flat on ONE floor line at y=${f(L.FLOOR)}. ` +
    "Keep every one of them exactly where IMAGE 1 puts it. The head is half the whole figure and wider than it is tall, " +
    "the body is a small wide box, and each arm is barely longer than it is thick. " +
    "EACH ARM IS A SHORT FAT SAUSAGE ending in a soft round mitt: its length is only about one and a third times its width. " +
    "Do not lengthen it, do not thin it, do not flatten it into a paddle or a blade, do not give it an elbow, and do not let " +
    "it reach past the bottom of the body. " +
    "THE HEAD CARRIES TWO LOW ROUND SIDE LUGS like ear muffs: their lower edge sits on the line where the head meets the body, " +
    "and their outer edge is the widest point of the whole toy above the shoes. Keep both; they are part of the head's shape.";

  const CHANNEL =
    "KEEP THE BACKGROUND GAPS OPEN. In IMAGE 1 a clear stripe of flat magenta background runs down between each arm and the " +
    "body, and another between the two feet. Those gaps are part of the drawing. Do not close them, do not bridge them with " +
    "clay or shadow, and do not tuck an arm behind the body. Each arm is a separate rounded form standing clear of the body " +
    "with background visible on both sides of it, from the shoulder down to the mitt.";

  // THE FRAMING CLAUSE. Two of the first eight bots came back re-composed: the
  // model stopped editing the plate and drew its own toy photograph, larger in
  // the frame, with a cast shadow behind it and an ELBOW in each arm. All three
  // arrive together, because they are one decision. Naming the framing is what
  // holds the model in edit mode.
  const FRAMING =
    "THE FRAMING IS IMAGE 1's FRAMING. The toy must cover the same part of the frame it covers in IMAGE 1, no larger and no " +
    "smaller, in the same place, with the same empty margin all around it. Do not zoom in, do not enlarge the toy, do not " +
    "re-centre it and do not re-crop. Do not lay a cast shadow, a reflection or a pool of light on the background. " +
    "NO ELBOW AND NO WRIST: each arm is ONE single stubby form running straight from the shoulder to the mitt, with no bend, " +
    "no joint and no taper in the middle of it.";

  const NO_HARDWARE =
    "NO JOINT HARDWARE ANYWHERE ON THIS TOY: no ring, cup, collar, socket, ball, bolt, washer or screw, and no metal of any " +
    "kind at any shoulder, hip, elbow, knee, wrist or neck. Each arm and leg simply ends in a plain rounded cap in its own " +
    "colour, the way a soft toy's limbs meet its body. Do not draw a seam, a line, a glow or a shadow ring where a limb meets " +
    "the body.";

  const ACCENTS =
    "ONLY FOUR THINGS ARE NOT CLAY, and they are the same on every bot in this range: two big round warm-cream glass lamp " +
    "eyes, the brightest thing on the toy; one dark recessed grille mouth, the darkest thing on the toy; ONE small brass " +
    "wind-up key on the chest; and both shoes in the same soft coral colour. Nothing else on the whole figure is brass or " +
    "metal, and the coral belongs to the shoes alone.";

  // THE TILT CLAUSE. Four of the eight bots in the corrected wave came back
  // rotated into three quarter view, scoring 0.51 to 0.80 on mirror IoU against
  // 0.99 for the four that obeyed. Tilt is not a small blemish here: the rig
  // MIRRORS one stored limb to make the pair, so a limb drawn in three quarter
  // view cannot be used at all, and a tilted bot projects its feet wider than
  // the leg canvas can hold. The old wording, "perfectly straight-on front view
  // at eye level, orthographic, no perspective and no tilt", was evidently not
  // enough on its own, so the requirement is now stated as a test the model can
  // check its own output against.
  //
  // 2026-09-04, SECOND STRENGTHENING. The clause above shipped and the wave it
  // drove still lost THREE of eight to tilt, at mirror IoU 0.514 (sprocket),
  // 0.685 (piston) and anvil, against 0.986 to 0.992 for the five that obeyed.
  // Re-reading the three failures against the five passes, the tell is always
  // the SHOES: a tilted bot shows the inner side of the far shoe and the outer
  // side of the near one, and the whole body follows the feet. So the test the
  // model is asked to check itself against is now named on the part that
  // actually rotates first, and three-quarter view is named and forbidden by
  // its own name rather than described. The prohibition is also restated as a
  // property of IMAGE 1 -- which IS square -- because the failure mode is the
  // model leaving edit mode and drawing its own photograph of a toy, and every
  // clause that ties the output back to the plate pulls it back into editing.
  const SYMMETRY =
    "THE TOY FACES THE CAMERA DEAD ON, SQUARE TO IT. IMAGE 1 is already square to the camera and its outlines are already " +
    "correct: keep every outline exactly where IMAGE 1 puts it. Fold the picture down its centre line and the two halves " +
    "must match: both ear lugs the same size and the same shape, both eyes the same size, both arms the same length and " +
    "thickness, both shoes the same size, and the same amount of background on the left as on the right. BOTH SHOES SHOW " +
    "THE SAME FACE: you see the front of each shoe and the side of neither, and the two shoes are the same width as each " +
    "other. NOT A THREE QUARTER VIEW. Do not turn, rotate, angle, swivel or twist the toy even slightly, do not show one " +
    "side of it more than the other, and do not show the side or the back of any part.";

  const LIGHT =
    "ONE soft warm key light directly above, no second light and no rim light, so every form is brightest on top and falls to " +
    "about half that value at its bottom, and the head casts a soft shadow down onto the body. Perfectly straight-on front " +
    "view at eye level, orthographic, no perspective and no tilt. Left and right are mirror images, so the highlights are " +
    "centred and symmetric.";

  const FINISH =
    "Designer vinyl-clay toy in the material and finish of IMAGE 2: soft satin clay with a slight sheen, gently rounded " +
    "edges, shallow moulded seams, a little honest wear on the high points. Not plastic, not chrome, not glossy. Paint the " +
    "whole toy in ONE pale bone-cream clay so its colour can be changed later; keep it near neutral, not yellow and not pink.";

  const CHROMA =
    "BACKGROUND: one perfectly flat, solid, uniform bright magenta (#FF00FF) filling the whole frame, with no gradient, no " +
    "shadow on the background, no drawn ground or floor, no text, no logos, no letters and no digits.";

  const out = {};
  for (const [name, { tier, motif }] of Object.entries(FAMILIES)) {
    out[name] = {
      tier,
      prompt: [
        "Repaint IMAGE 1, a grey clay mock-up of ONE small robot toy standing straight on, on a flat magenta plate, into a " +
        "finished toy in the style of IMAGE 2. Keep the EXACT silhouette, size and position of every grey shape: the same " +
        "head, the same small body, the same two short thick arms, the same two short legs and the same two feet, in the " +
        "same places at the same sizes. Do not move, resize, slim, rotate, re-pose or crop anything, and do not add a part " +
        "that is not there. The result is ONE toy moulded out of one piece of clay.",
        `This is the ${name.toUpperCase()} model: ${motif}. Tier ${tier} of four: ${TIER_FINISH[tier]}. Its character lives ` +
        "in the moulded shapes of the head and the body, never in added fittings.",
        SHAPE, SYMMETRY, FRAMING, CHANNEL, NO_HARDWARE, ACCENTS, LIGHT, FINISH, CHROMA,
      ].join(" "),
    };
  }
  fs.writeFileSync(path.join(OUT, "prompts.json"), JSON.stringify(out, null, 1));
  return out;
}

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

if (argv.includes("--list") || argv.length === 0) {
  console.log("family     tier  motif");
  for (const [k, v] of Object.entries(FAMILIES)) console.log(k.padEnd(11), v.tier, "  ", v.motif);
  console.log(`\ncontract H=${H} skirt=${SKIRT}; run --plate to draw, --prompts to write the prompts.`);
} else if (argv.includes("--plate")) {
  console.log(JSON.stringify(buildPlate(), null, 1));
} else if (argv.includes("--prompts")) {
  console.log(JSON.stringify(buildPlate(), null, 1));
  const p = prompts();
  const only = opt("--family", null);
  if (only) console.log("\n" + (p[only]?.prompt ?? `unknown family ${only}`));
  else console.log("\nwrote", path.join(OUT, "prompts.json"), Object.keys(p).length, "prompts");
} else {
  console.error("usage: --list | --plate | --prompts [--family <name>]");
  process.exit(2);
}
