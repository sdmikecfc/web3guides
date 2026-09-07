/**
 * Battle Bots: THE WHOLE-BOT GENERATION DRIVER.
 *
 * The wave this file used to drive generated each body part alone on its own
 * canvas. That is the wave Mike rejected, and the reason is now measured: with
 * a 90x200 limb canvas beside a 200x240 torso canvas, the proportions were
 * decided before a pixel was drawn, and no prompt could recover them. Parts
 * drawn alone also never agreed on camera, light or limb length, so the pieces
 * looked fine one at a time and cheap once assembled.
 *
 * So nothing here generates a part any more. It generates ONE WHOLE TOY per
 * family, on the single shared plate that scripts/bots-gen-kit.mjs draws, and
 * scripts/bots-import-parts.py cuts the parts out of the finished toy along the
 * toy's own seams. One camera, one light, one set of limb lengths and one foot
 * line, by construction rather than by prompt discipline.
 *
 * THE GENERATOR. seedream_v5_pro, reached through the Higgsfield MCP tools, at
 * 3 credits a generation. It is the model that drew art-src/bots/concept/ in
 * the first place, it takes several reference images, and its is_inpaint flag
 * makes it EDIT the plate rather than invent a new picture. gpt-image-2 is not
 * an option: the key returns HTTP 429 "You have no credits remaining".
 *
 * WHY THIS FILE DOES NOT CALL THE MODEL ITSELF. Higgsfield is an MCP server,
 * not an HTTP API this repo holds a key for, so submission happens through the
 * agent's tool calls. What a script can own is everything around that, and it
 * does: building the exact request payload so it is reviewable and repeatable,
 * pushing the reference images to the presigned URLs, pulling the results down,
 * and refusing a result that is not usable before it reaches the cutter.
 *
 *   node scripts/bots-gen-parts.mjs --plan                  # the 8 request payloads, spend nothing
 *   node scripts/bots-gen-parts.mjs --plan --family kettle  # one of them
 *   node scripts/bots-gen-parts.mjs --put <file> --url <presigned>   # upload a reference
 *   node scripts/bots-gen-parts.mjs --fetch results.json    # download finished bots
 *   node scripts/bots-gen-parts.mjs --check                 # gate what was downloaded
 *
 * results.json is [{ "family": "kettle", "url": "https://..." }, ...], which is
 * what the batch tool returns.
 *
 * Writes public/bots-art/_raw/bots/<family>.png, the raw toy on its magenta
 * plate. scripts/bots-key-magenta.mjs keys it; nothing downstream reads the raw.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const KITS = path.join(ROOT, "public", "bots-art", "_raw", "kits");
const RAW = path.join(ROOT, "public", "bots-art", "_raw", "bots");

const MODEL = "seedream_v5_pro";
const CREDITS_PER_GEN = 3;

/** The request every family shares. Only the prompt changes between them. */
const PARAMS = {
  model: MODEL,
  resolution: "2k",
  aspect_ratio: "1:1",
  // EDIT the plate, do not invent a new picture. Without this the model draws
  // a bot it likes rather than the bot the contract asked for, and the joint
  // positions in the prompt become decoration.
  is_inpaint: true,
  use_unlim: false,
};

function loadPrompts() {
  const p = path.join(KITS, "prompts.json");
  if (!fs.existsSync(p)) throw new Error(`no prompts: run "node scripts/bots-gen-kit.mjs --prompts" first`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function plan(only) {
  const prompts = loadPrompts();
  const names = only ? [only] : Object.keys(prompts);
  const reqs = names.map((family, i) => {
    if (!prompts[family]) throw new Error(`unknown family ${family}`);
    return {
      index: i + 1,
      family,
      tier: prompts[family].tier,
      params: {
        ...PARAMS,
        prompt: prompts[family].prompt,
        // roles: IMAGE 1 is the plate, IMAGE 2 is the style reference, in that
        // order, because the prompt names them by number.
        medias: [
          { role: "image_references", value: "<media_id of kits/skeleton.png>" },
          { role: "image_references", value: "<media_id of kits/style-ref.png>" },
        ],
      },
    };
  });
  return { model: MODEL, count: reqs.length, credits: reqs.length * CREDITS_PER_GEN, requests: reqs };
}

async function put(file, url) {
  const body = fs.readFileSync(file);
  const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body });
  if (!r.ok) throw new Error(`PUT ${path.basename(file)} -> HTTP ${r.status}`);
  return `PUT ${path.basename(file)} HTTP ${r.status} (${body.length} bytes)`;
}

async function fetchResults(file) {
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.mkdirSync(RAW, { recursive: true });
  const out = [];
  for (const { family, url } of rows) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${family}: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const dst = path.join(RAW, `${family}.png`);
    fs.writeFileSync(dst, buf);
    out.push({ family, bytes: buf.length, file: dst });
  }
  return out;
}

/**
 * The gate on a raw generation, run BEFORE the cutter so a bad bot costs three
 * credits and not an afternoon. Every check is one the previous wave failed:
 * the plate came back with the arms merged into the body, and the cutter then
 * substituted a synthetic grey capsule and nobody noticed until the mixed bots
 * were rendered. A raw that fails here should be regenerated, not cut.
 */
function check() {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync("python", ["-", RAW, KITS], {
    input: CHECK_PY, encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  return JSON.parse(r.stdout);
}

const CHECK_PY = String.raw`
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage

RAW, KITS = sys.argv[1], sys.argv[2]
L = json.load(open(os.path.join(KITS, "skeleton.json")))

def subject(im):
    """The magenta key, SELF-CALIBRATED from the frame border exactly as
    scripts/bots-key-magenta.mjs does it.

    This gate used a fixed threshold of 150 to begin with, copied from the
    keyer's old constant, and it was wrong in a way that is worth recording:
    seedream renders the plate as a real surface, so its background sits 121 to
    134 from pure magenta instead of under 62. At a 150 cut, a wide band of
    BACKGROUND counted as subject, the figure's bounding box became the whole
    frame, and the tilt measure then compared background against background and
    reported six of eight bots tilted when four of them were straight. A gate
    that reads its subject differently from the tool that cuts it is not a gate.
    """
    a = np.asarray(im.convert("RGB")).astype(np.int32)
    d = (a[:,:,0]-255)**2 + a[:,:,1]**2 + (a[:,:,2]-255)**2
    b = 6
    border = np.concatenate([d[:b].ravel(), d[-b:].ravel(), d[:,:b].ravel(), d[:,-b:].ravel()])
    cut = (np.sqrt(border.max()) * 1.15) ** 2
    return d > cut

rows = []
for fn in sorted(os.listdir(RAW)):
    if not fn.endswith(".png"): continue
    fam = fn[:-4]
    im = Image.open(os.path.join(RAW, fn))
    ink = subject(im)
    # THE TOY, AND NOTHING ELSE. Some generations lay a cast shadow on the
    # background despite the prompt; keyed, that is a second blob, and a
    # bounding box drawn round both puts the figure off centre and reports a
    # straight bot as tilted. The cutter already takes the largest component,
    # so the gate has to as well or the two disagree about what the subject is.
    lab, n = ndimage.label(ink)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        ink = lab == (int(np.argmax(sizes)) + 1)
    S = im.size[0] / L["plate"]                  # render px per plate px
    ys = np.where(ink.sum(1) > 0)[0]; xs = np.where(ink.sum(0) > 0)[0]
    if len(ys) == 0:
        rows.append({"family": fam, "verdict": "FAIL", "why": "no subject: the whole frame keyed out"})
        continue
    H = ys[-1]-ys[0]+1
    # THE ARM CHANNEL, the check the previous wave did not have. Count the rows
    # across the arm's own span that show three separate runs of ink: left arm,
    # body, right arm. Below about half, the arms have merged into the body and
    # no cutter can find them.
    at = (L["shoulder_y"] - L["arm_w"]/2) * S
    ab = at + (L["arm_w"]/2 + L["arm_l"]) * S
    lo, hi = int(at + L["arm_w"]*0.6*S), int(ab - L["arm_w"]*0.6*S)
    three = 0
    for y in range(max(0,lo), min(ink.shape[0], hi)):
        if (np.diff(ink[y].astype(np.int8)) == 1).sum() == 3: three += 1
    span = max(1, min(ink.shape[0],hi) - max(0,lo))
    arm_ok = three / span
    # THE TILT, and it is the single most useful number here. The prompt asks
    # for a "perfectly straight-on front view, orthographic, no tilt" where
    # "left and right are mirror images". Whether the model obeyed is directly
    # measurable: intersection over union of the figure against its own mirror.
    #
    # MEASURED over a wave of eight: the four usable bots scored 0.986 to 0.992
    # and the four unusable ones 0.52 to 0.81, with nothing in between. It is
    # also the CAUSE of the failure further down the pipeline, which is why it
    # is worth catching here rather than there: a bot rotated into three quarter
    # view projects its feet wider, so its stance measured 0.80 H against a band
    # that stops at 0.662, its leg then needed 184 units of canvas where 113
    # exist, and the whole set would have had to shrink to fit it. Tilt also
    # breaks the rig outright, because the rig MIRRORS one stored limb to make
    # the pair, and a limb drawn in three quarter view cannot be mirrored.
    box = ink[ys[0]:ys[-1]+1, xs[0]:xs[-1]+1]
    mir = box[:, ::-1]
    sym = (box & mir).sum() / max(1, (box | mir).sum())
    # the feet must not touch on the centre line either
    fy = int((L["FLOOR"] - L["foot_h"]*0.5) * S)
    cx = int(L["CX"] * S)
    feet_split = not ink[min(fy, ink.shape[0]-1)][cx-2:cx+3].any()
    # THE SCALE CHECK, and it is the one that catches a model that stopped
    # editing and started drawing. The plate puts the figure at a known
    # fraction of the frame; a render that departs from it has re-composed the
    # picture, and everything else in the prompt went with it. Both bots that
    # failed this wave came back rescaled, both had grown ELBOWS, and both had
    # laid a cast shadow on the background the prompt forbids. One number
    # catches all three, and it does not fire on a good bot whose two arms
    # simply hang a little differently.
    fill = H / im.size[1]
    plate_fill = (L["FLOOR"] - L["APEX"]) / L["plate"]
    why, warn = [], []
    if sym < 0.95:
        why.append(f"tilted: mirror IoU {sym:.3f} against 0.95. The bot is in three quarter view, "
                   "so its stance projects too wide for the leg canvas and its limbs cannot be mirrored")
    if arm_ok < 0.50: why.append(f"arms merged into the body ({arm_ok:.0%} of arm rows separate, need 50%)")
    if not feet_split: why.append("the two feet touch on the centre line")
    # A UNIFORM RESCALE IS A WARNING, NOT A FAILURE, and the difference is
    # worth stating because it was tempting to fail it. The cutter registers on
    # landmarks it measures on this bot and scales by this bot's own ink height,
    # so a toy drawn larger in the frame is absorbed exactly. What is NOT
    # absorbed is a change to the bot's INTERNAL proportions, and frame fill
    # cannot see that; the contract's own bands can, and they are checked after
    # the cut where the parts can actually be measured. Past 0.12 the model has
    # stopped editing altogether and everything else in the prompt went with it,
    # which is the case that has to fail here rather than waste a cut.
    d = abs(fill - plate_fill)
    if d > 0.12:
        why.append(f"figure fills {fill:.0%} of the frame against the plate's {plate_fill:.0%}: "
                   "the model re-composed the picture instead of repainting it")
    elif d > 0.06:
        warn.append(f"figure fills {fill:.0%} against the plate's {plate_fill:.0%}: a uniform rescale, "
                    "which registration absorbs; proportion is judged after the cut")
    rows.append({"family": fam, "verdict": "FAIL" if why else ("warn" if warn else "ok"),
                 "why": "; ".join(why + warn) or None,
                 "mirror_iou": round(float(sym), 3),
                 "arm_rows_separate": round(arm_ok, 3), "feet_split": bool(feet_split),
                 "frame_fill": round(fill, 3), "plate_fill": round(plate_fill, 3),
                 "figure_h": int(H), "frame": im.size[0]})
print(json.dumps(rows, indent=1))
`;

// ── CLI ───────────────────────────────────────────────────────────────────
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);

if (argv.includes("--plan")) {
  console.log(JSON.stringify(plan(opt("--family", null)), null, 1));
} else if (argv.includes("--put")) {
  console.log(await put(opt("--put"), opt("--url")));
} else if (argv.includes("--fetch")) {
  console.table(await fetchResults(opt("--fetch")));
} else if (argv.includes("--check")) {
  const rows = check();
  console.log(JSON.stringify(rows, null, 1));
  // ONE SOURCE OF TRUTH for what may be cut. The cutter reads this rather than
  // recomputing the verdict, so a bot this gate refused can never reach the
  // parts folder because two files disagreed about the threshold.
  fs.writeFileSync(path.join(RAW, "usable.json"), JSON.stringify(
    rows.filter((r) => r.verdict !== "FAIL").map((r) => r.family), null, 1));
  const bad = rows.filter((r) => r.verdict === "FAIL");
  if (bad.length) {
    console.error(`\n${bad.length} of ${rows.length} raws are not usable: ${bad.map((b) => b.family).join(", ")}`);
    process.exit(1);
  }
  console.log(`\nall ${rows.length} raws usable`);
} else {
  console.error("usage: --plan [--family x] | --put <file> --url <u> | --fetch <json> | --check");
  process.exit(2);
}
