"""Battle Bots: register keyed painted parts into the placeholder contract.

    python scripts/bots-import-parts.py             # every public/bots-art/_raw/parts/keyed/<slot>-t<tier>-<design>.png
    python scripts/bots-import-parts.py torso-t2-1  # one part
    python scripts/bots-import-parts.py --dry       # measure and report, write nothing

Why: the rig (src/app/bots/_view/rig.ts) and the art check draw every part on
its CONTRACT canvas with authored pivots (src/app/bots/_view/rig-points.ts,
written by the bake). A keyed painted part is a tight crop at generation
resolution. This step scales the crop so its alpha bounding box matches the
placeholder's bounding box and pastes it at the same position on a canvas of
the placeholder's size, so every pivot lands where the bake put it. Masked
inpaint keeps the outline, so the match is near exact; the report prints the
overlap so a drifted part is visible before it ships (the DK lesson:
register against the committed baseline, measure on denoised alpha).

Reads  public/bots-art/_raw/parts/keyed/<slot>-t<tier>-<design>.png
       public/bots-art/parts/<slot>/t<tier>-<design>.png   (the baked placeholder, the ruler)
Writes public/bots-art/parts/<slot>/t<tier>-<design>.png   (replaced with the painted part)
       public/bots-art/_raw/parts/placeholders/<slot>-t<tier>-<design>.png (a copy of the ruler, kept once)
Then run: python scripts/bots-paint-masks.py  and  npx tsx scripts/bots-art-check.mts
Run with PYTHONIOENCODING=utf-8.
"""
import os
import shutil
import sys
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYED = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "keyed")
RULERS = os.path.join(ROOT, "public", "bots-art", "_raw", "parts", "placeholders")
PARTS = os.path.join(ROOT, "public", "bots-art", "parts")
os.makedirs(RULERS, exist_ok=True)

args = [a for a in sys.argv[1:]]
DRY = "--dry" in args
want = next((a for a in args if not a.startswith("--")), None)

def denoised_bbox(im):
    a = im.getchannel("A").filter(ImageFilter.MinFilter(3))
    return a.point(lambda v: 255 if v > 24 else 0).getbbox()

def iou(a, b):
    a = a.getchannel("A").point(lambda v: 255 if v > 96 else 0).load()
    b = b.getchannel("A").point(lambda v: 255 if v > 96 else 0).load()
    w, h = a_im.size
    inter = union = 0
    for y in range(h):
        for x in range(w):
            pa = a[x, y] > 0; pb = b[x, y] > 0
            inter += pa and pb; union += pa or pb
    return inter / union if union else 0.0

names = sorted(f[:-4] for f in os.listdir(KEYED) if f.endswith(".png")) if os.path.isdir(KEYED) else []
if want:
    names = [n for n in names if n == want]
if not names:
    print("nothing to import in", KEYED); sys.exit(1)

done = 0
for name in names:
    slot, rest = name.split("-", 1)                      # head-t2-1 -> head, t2-1
    # pair slots are baked under the rig's singular folder (arms -> arm, legs -> leg)
    folder = slot if os.path.isdir(os.path.join(PARTS, slot)) else slot.rstrip("s")
    target = os.path.join(PARTS, folder, rest + ".png")
    ruler_copy = os.path.join(RULERS, name + ".png")
    if not os.path.exists(ruler_copy):
        if not os.path.exists(target):
            print(f"{name:16s} no placeholder ruler at {target}; skipped"); continue
        shutil.copy(target, ruler_copy)                   # keep the bake's placeholder once, forever
    ruler = Image.open(ruler_copy).convert("RGBA")
    painted = Image.open(os.path.join(KEYED, name + ".png")).convert("RGBA")
    rb = denoised_bbox(ruler); pb = denoised_bbox(painted)
    if not rb or not pb:
        print(f"{name:16s} empty alpha; skipped"); continue
    rw, rh = rb[2] - rb[0], rb[3] - rb[1]
    crop = painted.crop(pb).resize((rw, rh), Image.LANCZOS)
    canvas = Image.new("RGBA", ruler.size, (0, 0, 0, 0))
    canvas.alpha_composite(crop, (rb[0], rb[1]))
    a_im = canvas
    score = iou(canvas, ruler)
    pw, ph = pb[2] - pb[0], pb[3] - pb[1]
    aspect_drift = abs((pw / ph) - (rw / rh)) / (rw / rh)
    flag = "" if score >= 0.9 and aspect_drift <= 0.06 else "   <- check: outline drift"
    print(f"{name:16s} canvas {ruler.size[0]}x{ruler.size[1]}  overlap {score:.3f}  aspect drift {aspect_drift:5.1%}{flag}")
    if not DRY:
        canvas.save(target)
        done += 1
print(f"{'measured' if DRY else 'imported'} {len(names)}; written {done}")
