"""Battle Bots: turn each painted part into a BASE + PAINT MASK pair.

    python scripts/bots-paint-masks.py            # every public/bots-art/parts/<slot>/t<tier>-<design>.png
    python scripts/bots-paint-masks.py head-t2-1  # one part
    python scripts/bots-paint-masks.py --dry      # measure only

What the wave actually produced (2026-09-03): the style reference won over the
"leave grey clay" instruction, so parts came back painted in a body colour
(mint, coral, butter...) with brass, rubber and glass accents. That is fine:
the game paints the body at runtime through a mask, so here we
  1. find the part's dominant BODY hue (opaque, saturated, not in the brass
     band, not near black or white),
  2. mark every pixel within that hue band as paintable, plus any grey clay,
  3. rewrite the base so those pixels become matte clay at their own
     luminance (the renderer tints the mask layer at multiply over it), and
  4. save the mask as RGBA, white where paint applies, transparent elsewhere,
     the exact format the bake wrote and scripts/bots-art-check.mts requires
     (8-bit, colour type 6).
The coloured originals stay untouched in public/bots-art/_raw/parts/registered/
(copied there before the first run), so this is re-runnable. Run with
PYTHONIOENCODING=utf-8.
"""
import colorsys
import os
import sys
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTS = os.path.join(ROOT, "public", "bots-art", "parts")
REG = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "registered")

args = sys.argv[1:]
DRY = "--dry" in args
want = next((a for a in args if not a.startswith("--")), None)

BRASS = (25 / 360, 58 / 360)   # hue band reserved for brass fittings (never paintable)
HUE_TOL = 28 / 360             # half-width of the body hue band

def classify(px):
    r, g, b, a = px
    if a < 200:
        return "clear"
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if v < 0.22:
        return "dark"          # rubber, seams
    if s < 0.13:
        return "clay" if 0.27 <= v <= 0.86 else "white"   # grey clay, or glass/white highlights
    if BRASS[0] <= h <= BRASS[1] and v > 0.35:
        return "brass"
    return "color"

def hue_dist(a, b):
    d = abs(a - b)
    return min(d, 1 - d)

def process(name, src_path, out_path, mask_path):
    src = Image.open(src_path).convert("RGBA")
    w, h = src.size
    pix = src.load()
    # 1. dominant body hue among saturated pixels (36 bins). Brass is counted
    #    too: a butter-yellow body (the Peeper family) lives inside the brass
    #    hue band, and when that band wins the vote it IS the body, so the
    #    brass exclusion is lifted for that part (fittings get tinted along
    #    with it; acceptable on the three yellow parts).
    bins = [0] * 36
    for y in range(h):
        for x in range(w):
            c = classify(pix[x, y])
            if c in ("color", "brass"):
                r, g, b, _ = pix[x, y]
                hh, _, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                bins[int(hh * 36) % 36] += 1
    dom = (bins.index(max(bins)) + 0.5) / 36 if max(bins) > 0 else None
    body_is_brass_hue = dom is not None and BRASS[0] <= dom <= BRASS[1]
    # 2. paintable region
    m = Image.new("L", (w, h), 0)
    ml = m.load()
    opaque = 0
    for y in range(h):
        for x in range(w):
            c = classify(pix[x, y])
            if c != "clear":
                opaque += 1
            if c == "clay":
                ml[x, y] = 255
            elif (c == "color" or (c == "brass" and body_is_brass_hue)) and dom is not None:
                r, g, b, _ = pix[x, y]
                hh, _, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                if hue_dist(hh, dom) <= HUE_TOL:
                    ml[x, y] = 255
    # open then close (3px) so rivets and seams do not punch pinholes
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    # never let the morphology paint outside the base's opaque pixels (the art
    # check calls that a MASK LEAK): clamp to alpha >= 200
    ml = m.load()
    for y in range(h):
        for x in range(w):
            if ml[x, y] > 0 and pix[x, y][3] < 200:
                ml[x, y] = 0
    cover = sum(1 for y in range(h) for x in range(w) if ml[x, y] > 0)
    share = cover / opaque if opaque else 0.0
    if DRY:
        return share
    # 3. base: paintable pixels become matte clay at their own luminance, slightly cool
    base = src.copy()
    bl = base.load()
    for y in range(h):
        for x in range(w):
            if ml[x, y] > 0:
                r, g, b, a = bl[x, y]
                L = int(0.299 * r + 0.587 * g + 0.114 * b)
                L = max(60, min(225, int(L * 0.92 + 30)))   # lift shadows a little so the tint reads
                bl[x, y] = (L, L, min(255, L + 6), a)
    base.save(out_path)
    # 4. mask as RGBA white/transparent (bake format; art check needs colour type 6)
    mask = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    mask.putalpha(m)
    mask.save(mask_path)
    return share

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
            reg = os.path.join(REG, slot, f)
            src = reg if os.path.exists(reg) else os.path.join(d, f)   # always start from the coloured original
            targets.append((name, src, os.path.join(d, f), os.path.join(d, f[:-4] + ".mask.png")))

low = 0
for name, src, out, mask in targets:
    share = process(name, src, out, mask)
    flag = ""
    if not 0.25 <= share <= 0.9:
        flag = "   <- check: paintable share outside 25..90 percent"
        low += 1
    print(f"{name:16s} paintable {share:5.1%}{flag}")
print(f"{'measured' if DRY else 'written'} {len(targets)} parts, {low} flagged")
