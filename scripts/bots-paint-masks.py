"""Battle Bots: turn each painted part into a BASE + PAINT MASK pair.

    python scripts/bots-paint-masks.py            # every public/bots-art/parts/<slot>/t<tier>-<design>.png
    python scripts/bots-paint-masks.py head-t2-1  # one part
    python scripts/bots-paint-masks.py --dry      # measure only

WHAT A PAINT MASK IS. The rig draws each part twice: the grey BASE, and the
white MASK tinted with the card's colour at multiply. So the mask is the
answer to one question, asked of every pixel: does the player's colour land
here? A pixel the mask misses keeps whatever the art was drawn in, for ever,
in all eight paints.

THE LAW (ADR-0142 section 1, one copy in scripts/bots-art-accents.json, read
here and by scripts/bots-art-check.mts): "Brass is the only metal. Balls,
cups, collars, rivets, bolts and trim are brass #d9a441. Rubber #3a3a3f and
glass #bfe9ff are the other two accents; everything else is paintable clay."

So the mask is THE WHOLE PART MINUS THOSE THREE. It never asks what colour
the body is.

WHY THAT CHANGED (verifier defect 2, 2026-09-04). What stood here before kept
a HUE BAND around the part's own dominant colour, grown off a histogram. Every
part in the game is drawn in the anchor's mint, so the band was fitted to mint
and mint is the one colour it was never tested against: measured across the 40
parts, 60,597 opaque body pixels on the 32 BODY parts fell outside their own
band and kept the anchor's mint whatever the player bought. Torso t1-1 lost
3,247 of them down its right side and across its top; head t4-1 was worse
still, because the vote counts brass and that head is 45 percent brass, so the
band centred on the BRASS and painted the fittings instead of the body.
An allowlist tuned on one colour cannot be right for the other seven. A
denylist of the three authored accents has no colour to be tuned to.

The coloured originals stay in public/bots-art/_raw/parts/registered/, so this
is re-runnable. Run with PYTHONIOENCODING=utf-8.
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTS = os.path.join(ROOT, "public", "bots-art", "parts")
REG = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "registered")

# The contract's canvas per slot, read out of the shipped rig points rather than
# retyped, so "is this original still on the contract" is answered by the
# contract itself. The folder name here is the art folder (arm/leg/...), which
# is the RIG slot name.
import re as _re
_RIG_SRC = open(os.path.join(ROOT, "src", "app", "bots", "_view", "rig-points.ts"), encoding="utf-8").read()
CANVAS = {}
for _slot in ("head", "torso", "arm", "leg", "weapon"):
    _m = _re.search(r"%s:\s*\{([^}]*)\}" % _slot, _RIG_SRC)
    if _m:
        _w = _re.search(r"w:\s*(\d+)", _m.group(1))
        _h = _re.search(r"h:\s*(\d+)", _m.group(1))
        if _w and _h:
            CANVAS[_slot] = (int(_w.group(1)), int(_h.group(1)))

args = sys.argv[1:]
DRY = "--dry" in args
want = next((a for a in args if not a.startswith("--")), None)

# ── the paintable law, read, never retyped ─────────────────────────────────
LAW = json.load(open(os.path.join(ROOT, "scripts", "bots-art-accents.json"), encoding="utf-8"))
ACC = LAW["accents"]
HOLE_CLOSE = LAW["accentHoleClose"]["value"]
SHARE_MIN = LAW["gate"]["paintShareMin"]["value"]
SHARE_MAX = LAW["gate"]["paintShareMax"]["value"]
LEFT_MAX = LAW["gate"]["unmaskedBodyMax"]["value"]

OPAQUE = 200        # the art gate's own idea of a solid pixel
RIM = 2             # how far the mask reaches onto the anti-aliased edge


def accent_mask(a):
    """True where the pixel is one of the accents THE LAW FILE NAMES. The only
    question the mask asks, vectorised. HSV by hand so the whole part is one
    pass.

    EVERY BAND IN THE TABLE, READ FROM THE TABLE, and that is a correctness
    requirement rather than tidiness. What stood here before named its four
    bands one at a time -- rubber, brass, glass, coral -- so a band added to
    bots-art-accents.json was honoured by scripts/bots-art-check.mts, which
    loops over the table, and silently ignored HERE. The two readers would then
    disagree about the same file: the gate would call a pixel an accent and the
    deriver would paint it, and nothing in the build would say so. The law says
    two files and one table; this is what makes that true.

    Each band is hue AND saturation AND value together, and any bound may be
    left out. A band with only a value ceiling (rubber, "dark enough that a tint
    would not read on it anyway") is a value test on its own."""
    rgb = a[..., :3].astype(np.float64) / 255.0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    v = rgb.max(axis=-1)
    d = v - rgb.min(axis=-1)
    s = np.where(v > 0, d / np.maximum(v, 1e-9), 0.0)
    h = np.zeros_like(v)
    lit = d > 0
    rm = lit & (v == r)
    gm = lit & ~rm & (v == g)
    bm = lit & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = ((b - r)[gm] / d[gm]) + 2
    h[bm] = ((r - g)[bm] / d[bm]) + 4
    h *= 60.0
    out = np.zeros(v.shape, bool)
    for name, k in ACC.items():
        if name.startswith("_"):
            continue
        band = np.ones(v.shape, bool)
        if "hueMin" in k:
            band &= (h >= k["hueMin"]) & (h <= k["hueMax"])
        if "satMin" in k:
            band &= s >= k["satMin"]
        if "satMax" in k:
            band &= s <= k["satMax"]
        if "valueMin" in k:
            band &= v > k["valueMin"]
        if "valueMax" in k:
            band &= v < k["valueMax"]
        out |= band
    return out


def _grow(flags, times=1):
    """One 3x3 dilation of a bool array, through PIL so the whole file uses
    one morphology."""
    im = Image.fromarray((flags * 255).astype(np.uint8), "L")
    for _ in range(times):
        im = im.filter(ImageFilter.MaxFilter(3))
    return np.asarray(im) > 0


def _close(flags, times=1):
    """Dilate `times`, then erode `times`: fills holes up to 2 x times wide."""
    im = Image.fromarray((flags * 255).astype(np.uint8), "L")
    for _ in range(times):
        im = im.filter(ImageFilter.MaxFilter(3))
    for _ in range(times):
        im = im.filter(ImageFilter.MinFilter(3))
    return np.asarray(im) > 0


def accents_of(a):
    """The accent set the whole pipeline agrees on, and the exact thing
    scripts/bots-art-check.mts recomputes off the shipped PNGs.

    Three steps, in this order:
      1. the three bands (rubber, brass, glass);
      2. OR everything OUTSIDE the part. A pixel with no part in it is not
         body, and saying so here rather than leaving it to whatever RGB a
         transparent pixel happens to carry is what lets the gate agree with
         this file pixel for pixel;
      3. one hole close. A blown specular on a brass ball has almost no
         saturation left, so the hue test cannot see it; without the close it
         is stranded as a painted freckle inside the brass and the gate reads
         it as unmasked body.
    """
    acc = accent_mask(a) | (a[..., 3] == 0)
    if HOLE_CLOSE:
        acc = _close(acc, HOLE_CLOSE)
    return acc


def process(name, src_path, out_path, mask_path):
    src = Image.open(src_path).convert("RGBA")
    w, h = src.size
    a = np.asarray(src)
    alpha = a[..., 3]
    visible = alpha > 0
    solid = alpha >= OPAQUE
    opaque = int(visible.sum())               # every visible pixel, rim included

    # 1. PAINTABLE = solid and not one of the three accents. No hue vote, no
    #    band, nothing that depends on the colour the art happens to be in.
    acc = accents_of(a)
    raw = solid & ~acc

    # 2. Open (erode then dilate) to drop a stray speck on a brass face that
    #    would otherwise become a painted freckle, then PUT BACK every raw
    #    pixel that touches what survived.
    #
    #    The put-back is the point. Opening alone also eats the one pixel line
    #    where the body meets the brass and the one pixel line round the whole
    #    silhouette, because both are thinner than the 3x3 window. Measured on
    #    torso t1-1: 667 real body pixels lost that way, 263 of them on the
    #    outer rim, which is exactly the "mint halo round the whole
    #    silhouette" this wave is here to fix. A speck in the middle of a
    #    brass face has no surviving paint to touch, so it stays dropped; a
    #    hairline along the body does, so it comes back.
    opened = Image.fromarray((raw * 255).astype(np.uint8), "L")
    opened = opened.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    kept = raw & _grow(np.asarray(opened) > 0)

    # 3. close (3px) so a rivet does not punch a pinhole in the paint
    m = Image.fromarray((kept * 255).astype(np.uint8), "L")
    m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    flags = np.asarray(m) > 0

    # 4. THE ANTI-ALIASED RIM. Stopping at alpha 200 leaves a one or two pixel
    #    ring of the ORIGINAL body colour round every part, which shows as a
    #    mint halo the moment a bot is painted coral. So carry the mask onto
    #    any edge pixel (alpha 1..199) that has solid paint within RIM.
    #    FULLY transparent pixels are never painted: that is the art check's
    #    MASK OUTSIDE rule and it still holds exactly.
    near = _grow(flags & solid, RIM)
    flags = (flags | (near & visible & ~solid)) & visible

    cover = int(flags.sum())
    share = cover / opaque if opaque else 0.0
    # the number the gate will read back off the shipped PNGs
    left = int((solid & ~flags & ~acc).sum())
    if DRY:
        return share, left

    # 5. base: paintable pixels become matte clay at their own luminance,
    #    slightly cool. The renderer tints the mask over this at multiply, so
    #    everything the mask covers must be NEUTRAL or the tint carries the
    #    old colour through with it.
    out = a.astype(np.int32).copy()
    lum = 0.299 * out[..., 0] + 0.587 * out[..., 1] + 0.114 * out[..., 2]
    lum = np.clip((lum * 0.92 + 30).astype(np.int32), 60, 225)   # lift shadows a little so the tint reads
    out[..., 0] = np.where(flags, lum, out[..., 0])
    out[..., 1] = np.where(flags, lum, out[..., 1])
    out[..., 2] = np.where(flags, np.minimum(255, lum + 6), out[..., 2])
    base = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
    # 6. mask as RGBA white/transparent (bake format; art check needs colour type 6)
    mask = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    mask.putalpha(Image.fromarray((flags * 255).astype(np.uint8), "L"))
    # write both to temp names, then swap them in back to back: the rig multiplies
    # the mask sprite over the base, so a base without its mask (or the reverse)
    # draws as a black rectangle for anyone viewing mid-import (verifier defect 3)
    base.save(out_path + ".tmp", format="PNG")
    mask.save(mask_path + ".tmp", format="PNG")
    os.replace(out_path + ".tmp", out_path)
    os.replace(mask_path + ".tmp", mask_path)
    return share, left


targets = []
for slot in sorted(os.listdir(PARTS)):
    d = os.path.join(PARTS, slot)
    if not os.path.isdir(d):
        continue
    for f in sorted(os.listdir(d)):
        if f.endswith(".png") and not f.endswith(".mask.png"):
            name = f"{slot}-{f[:-4]}"
            if want and name != want:
                continue
            # START FROM THE COLOURED ORIGINAL, BUT ONLY IF IT IS ONE.
            #
            # This used to take _raw/parts/registered unconditionally, so the
            # mask run could be repeated without the colour drifting. That was
            # right while those files WERE the shipped art. They are not any
            # more: the concept contract moved every canvas (arm 90x200 to
            # 128x280, leg to 192x280, head to 456x384) and the registered
            # folder still holds the superseded set at the old sizes. Taken
            # blindly, this line quietly replaced all 40 freshly cut parts with
            # the old ones and the art gate then failed 80 checks on SIZE.
            # Nothing is deleted; a stale original is simply not used.
            reg = os.path.join(REG, slot, f)
            src = os.path.join(d, f)
            if os.path.exists(reg):
                with Image.open(reg) as probe:
                    if probe.size == CANVAS.get(slot):
                        src = reg
            targets.append((name, src, os.path.join(d, f), os.path.join(d, f[:-4] + ".mask.png")))

# WHICH SLOTS THE CEILING APPLIES TO, and why not the arm.
#
# The ceiling asks one question: "has the mask swallowed this part's accent".
# That is only a question where the contract PUTS an accent, and under the JOIN
# law it names exactly where: the torso carries the bot's one brass key, the
# head its two lenses and its grille, the leg its coral shoes, and a weapon its
# metal. THE ARM CARRIES NOTHING. Every ball, cup, collar, ring and bolt it
# used to wear is deleted from the art, so a 99.7 percent paintable arm is the
# fix and not the defect, and five of the eight arms measured 99.0 to 99.7 the
# moment the hardware came off. scripts/bots-art-check.mts met the same wall
# from the other side and dropped its own copy of this ceiling for the same
# reason; what still asks the question there is the brass budget plus the
# requirement that the torso carry its key.
#
# The FLOOR stays on every slot, arms included: a part whose whole body was
# mistaken for an accent takes no paint at all, and that is what reaches a
# player.
CEILING_SLOTS = ("head", "torso", "leg", "weapon")

bad = []
worst = 0
for name, src, out, mask in targets:
    share, left = process(name, src, out, mask)
    worst = max(worst, left)
    flag = ""
    capped = name.split("-")[0] in CEILING_SLOTS
    if share < SHARE_MIN or (capped and share > SHARE_MAX):
        hi = f"{SHARE_MAX:.0%}" if capped else "no ceiling: this slot carries no accent"
        flag = f"   <- paintable share outside {SHARE_MIN:.0%}..{hi}"
        bad.append(f"{name}: paintable share {share:.1%}, law says {SHARE_MIN:.0%} to {hi}")
    if left > LEFT_MAX:
        flag += f"   <- {left} unmasked body pixels, bar is {LEFT_MAX}"
        bad.append(f"{name}: {left} unmasked body pixels, bar is {LEFT_MAX}")
    print(f"{name:16s} paintable {share:5.1%}  unmasked body {left:5d}{flag}")
print(f"{'measured' if DRY else 'written'} {len(targets)} parts, worst unmasked body {worst}, bar {LEFT_MAX}")
# A BREAKER, never a clamp. A part that leaves body unpainted or takes no paint
# at all is refused here as well as by the gate, so nobody can ship one by
# running the deriver and skipping bots-art-check.
if bad:
    for line in bad:
        print("FAIL " + line)
    raise SystemExit("bots-paint-masks FAIL (%d)" % len(bad))
