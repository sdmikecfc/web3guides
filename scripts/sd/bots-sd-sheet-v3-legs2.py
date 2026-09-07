"""Lane L, wave two: .bots-preview/sd-shapes2/RULERS-LEGS2.png

    python scripts/sd/bots-sd-sheet-v3-legs2.py

The live boot, then every v3 leg ruler, at full size AND at RING SIZE, over the
two maps the production stack conditions on (depth+lineart), over the coral
block alone in white on black.

WHY THIS SHEET AND NOT LANE B's. RULERS-LEGS.png answered "is the coral one
clean block". Wave one's 96 renders said that was necessary and not enough:
every one of the four blocks WAS one clean block on the ruler and CORAL SPILL
still rejected 68 of 96, because the model kept painting on up the body. What
the spill actually tracked was the STEP: the body's ink width just above the
block over the block's own width. So that number is measured here, per shape,
straight off the drawing, beside the judge's own sole-band numbers.

The RING SIZE row is the other half. The whole shape table exists because
eight boots that looked different at 456 px were one boot at the size a person
watches a fight, so a ruler sheet that only shows 2x is a sheet that can pass
the shape it was built to catch.

Nothing here judges a render and nothing here moves a bar: the sole band and
the spill are computed the way rank-part.py computes them (SOLE_COVER 0.5,
three bare rows at the contact edge, spill is the coral outside the band), on
the CLAY RULER, which is a drawing and not a candidate. It writes one PNG
under .bots-preview/sd-shapes2 and nothing else.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
RUL = os.path.join(REPO, "public", "bots-art", "_raw", "parts", "placeholders-v3", "target")
CTL = os.path.join(REPO, "art-src", "sd", "controls", "v3", "contract")
LIVE = os.path.join(REPO, "public", "bots-art", "parts", "leg", "t2-1.png")
OUT = os.path.join(REPO, ".bots-preview", "sd-shapes2", "RULERS-LEGS2.png")
SHAPES = ["boot", "wheels", "springs", "sneakers", "pegs"]
K = 2
RING_H = 120           # the leg's own share of a 300 px bot, near enough to read at
SOLE_COVER, BARE = 0.5, 3
SPILL_BAR, SOLE_MIN = 0.013, 0.08

#: what wave one's 96 renders measured for each shape, so the sheet can show
#: what moved rather than only what is. Median CORAL SPILL over that shape's
#: 24 candidates, and the step ratio the ruler had at the time.
WAVE1 = {"wheels": (1.00, 0.075, 2), "springs": (0.72, 0.047, 6),
         "sneakers": (1.00, 0.122, 2), "pegs": (0.22, 0.015, 6)}


def font(sz):
    for p in (r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def coral_of(rgba):
    a = rgba[..., :3] / 255.0
    ink = rgba[..., 3] > 16
    mx, mn = a.max(2), a.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return ink & (a[..., 0] > a[..., 1]) & (a[..., 1] >= a[..., 2]) & (sat > 0.20), ink


#: rows to stand clear of the band's top edge when measuring the step. The
#: bake strokes every shape with a 2.2 px outline that overshoots by about 2,
#: so the block's own ink starts a couple of rows ABOVE its fill: measured at
#: yt-2 the wheel read 0.98, which is the block measured against itself.
STEP_ABOVE, STEP_BELOW = 5, 4


def band_stats(coral, ink):
    """The judge's sole band, its share, the spill outside it, the blob count,
    and THE STEP: the body's ink width just above the band over the band's own
    width just inside it. A step of 1.00 is a body flush with its block, which
    is what wave one's wheels and sneakers were."""
    ys = np.where(ink.any(1))[0]
    y0, y1 = int(ys[0]), int(ys[-1])
    hh = y1 - y0 + 1
    cov = np.zeros(ink.shape[0])
    for y in range(y0, y1 + 1):
        n = int(ink[y].sum())
        cov[y] = coral[y].sum() / n if n else 0
    yb = y1
    while yb > y0 and cov[yb] < SOLE_COVER and y1 - yb < BARE + 1:
        yb -= 1
    yt = yb
    while yt - 1 >= y0 and cov[yt - 1] >= SOLE_COVER:
        yt -= 1
    rows = yb - yt + 1 if cov[yb] >= SOLE_COVER else 0
    band = np.zeros_like(ink)
    if rows:
        band[yt:yb + 1] = True
        band &= ink
    tot = int(coral.sum())
    spill = 1 - int((coral & band).sum()) / max(tot, 1)
    blobs = 0
    if tot:
        lab, n = ndimage.label(ndimage.binary_closing(coral, np.ones((5, 5))) & ink)
        sizes = np.bincount(lab.ravel())[1:] if n else np.array([])
        blobs = int((sizes >= 30).sum())
    step = None
    if rows and yt - STEP_ABOVE >= y0 and yt + STEP_BELOW <= y1:
        above = int(ink[yt - STEP_ABOVE].sum())
        inside = int(ink[yt + STEP_BELOW].sum())
        step = above / inside if inside else None
    return rows, rows / hh, spill, blobs, step


def gray(p, w, h):
    if not os.path.exists(p):
        return Image.new("L", (w, h), 0).convert("RGB")
    return Image.open(p).convert("L").resize((w, h), Image.NEAREST).convert("RGB")


def main():
    live = Image.open(LIVE).convert("RGBA")
    W, H = live.size
    cw, ch = W * K, H * K
    rw = max(1, round(W * RING_H / H))
    cols = ["LIVE boot"] + SHAPES
    LAB, GUT, HEAD, FOOT = 140, 12, 66, 90
    rows = ["ruler", "ring size", "depth", "lineart", "coral only"]
    rh = {r: (RING_H + 8 if r == "ring size" else ch) for r in rows}
    sw = LAB + (cw + GUT) * len(cols) + GUT
    sh = HEAD + sum(rh[r] + 10 for r in rows) + FOOT
    sheet = Image.new("RGB", (sw, sh), (30, 31, 36))
    d = ImageDraw.Draw(sheet)
    f14, f12, f11 = font(15), font(13), font(12)
    d.rectangle([0, 0, sw, HEAD], fill=(20, 21, 25))
    d.text((12, 8), f"BATTLE BOTS  v3 LEG SHAPE RULERS, WAVE TWO   {W}x{H} at {K}x and at ring size"
                    f"   hip 70,63  foot 70,181", font=f14, fill=(255, 255, 255))
    d.text((12, 30), "the coral must be ONE block at the bottom, and the body must STAND ON it: "
                     "wave one's spill tracked the step and nothing else", font=f12, fill=(154, 160, 173))
    for i, c in enumerate(cols):
        d.text((LAB + i * (cw + GUT) + 4, 48), c, font=f12, fill=(154, 160, 173))

    stats = {}
    y = HEAD
    for row in rows:
        d.text((10, y + rh[row] // 2 - 7), row, font=f12, fill=(143, 214, 180))
        for ci, c in enumerate(cols):
            x = LAB + ci * (cw + GUT)
            tw = rw if row == "ring size" else cw
            th = RING_H if row == "ring size" else ch
            d.rectangle([x, y, x + tw, y + th], fill=(58, 59, 66))
            src = None
            if c == "LIVE boot":
                if row in ("ruler", "ring size"):
                    src = live
                elif row == "coral only":
                    cm, ink = coral_of(np.asarray(live))
                    stats[c] = band_stats(cm, ink)
                    src = Image.fromarray((cm * 255).astype(np.uint8)).convert("RGBA")
                else:
                    d.text((x + 8, y + th // 2), "shipped art:", font=f11, fill=(120, 124, 132))
                    d.text((x + 8, y + th // 2 + 14), "no control map", font=f11, fill=(120, 124, 132))
                    continue
            elif row in ("ruler", "ring size"):
                src = Image.open(os.path.join(RUL, f"legs-{c}.png")).convert("RGBA")
            elif row == "coral only":
                a = np.asarray(Image.open(os.path.join(RUL, f"legs-{c}.png")).convert("RGBA"))
                cm, ink = coral_of(a)
                stats[c] = band_stats(cm, ink)
                src = Image.fromarray((cm * 255).astype(np.uint8)).convert("RGBA")
            else:
                sheet.paste(gray(os.path.join(CTL, f"leg-{c}", f"{row}.png"), cw, ch), (x, y))
                continue
            im = src.resize((tw, th), Image.LANCZOS if row == "ring size" else Image.NEAREST)
            sheet.paste(im, (x, y), im)
        y += rh[row] + 10

    d.text((10, y + 4), "sole band", font=f12, fill=(240, 165, 143))
    d.text((10, y + 22), "step", font=f12, fill=(240, 165, 143))
    d.text((10, y + 44), "wave one", font=f12, fill=(150, 152, 162))
    for ci, c in enumerate(cols):
        x = LAB + ci * (cw + GUT)
        if c not in stats:
            continue
        r, frac, spill, blobs, step = stats[c]
        ok = r and frac >= SOLE_MIN and spill <= SPILL_BAR and blobs == 1
        d.text((x + 4, y + 4), f"{r} rows, {frac:.0%}, spill {spill:.2%}, {blobs} blob", font=f11,
               fill=(143, 214, 180) if ok else (240, 120, 110))
        d.text((x + 4, y + 22), "body / block " + ("n/a" if step is None else f"{step:.2f}"),
               font=f11, fill=(232, 233, 238))
        if c in WAVE1:
            s1, sp1, sur = WAVE1[c]
            d.text((x + 4, y + 44), f"step {s1:.2f}, spill {sp1:.3f}", font=f11, fill=(150, 152, 162))
            d.text((x + 4, y + 59), f"{sur} of 24 survived", font=f11, fill=(150, 152, 162))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print("wrote", OUT, sheet.size)
    print(f"  {'shape':<12} {'band':>9} {'share':>6} {'spill':>9} {'blobs':>6} {'step':>6}   wave one")
    for c in cols:
        if c not in stats:
            continue
        r, frac, spill, blobs, step = stats[c]
        w1 = f"   step {WAVE1[c][0]:.2f}, spill {WAVE1[c][1]:.3f}, {WAVE1[c][2]}/24" if c in WAVE1 else ""
        print(f"  {c:<12} {r:>6} rows {frac:>5.1%} {spill:>8.3%} {blobs:>6} "
              f"{'n/a' if step is None else format(step, '.2f'):>6}{w1}")


main()
