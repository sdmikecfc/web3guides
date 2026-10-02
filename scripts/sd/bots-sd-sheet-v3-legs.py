"""Lane B: .bots-preview/sd-shapes/RULERS-LEGS.png

The live boot, then every v3 leg ruler, and under each one the two maps the
production stack actually conditions on (depth+lineart). Under those, the
coral block ALONE, in white on black, because the point of this sheet is the
one question the shape table can fail on: is the coral one clean block at the
bottom, or is it a rim, a ring or a drip. Numbers under each column are the
judge's own: the sole band's rows, its share of the leg's height, and the
share of the coral outside it.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = r"C:\Users\Mike\Desktop\web3guides"
RUL = os.path.join(REPO, "public", "bots-art", "_raw", "parts", "placeholders-v3", "target")
CTL = os.path.join(REPO, "art-src", "sd", "controls", "v3", "contract")
LIVE = os.path.join(REPO, "public", "bots-art", "parts", "leg", "t2-1.png")
OUT = os.path.join(REPO, ".bots-preview", "sd-shapes", "RULERS-LEGS.png")
SHAPES = ["boot", "wheels", "springs", "sneakers", "pegs"]
K = 2
SOLE_COVER, BARE = 0.5, 3


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


def band_stats(coral, ink):
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
        from scipy import ndimage
        lab, n = ndimage.label(ndimage.binary_closing(coral, np.ones((5, 5))) & ink)
        sizes = np.bincount(lab.ravel())[1:] if n else np.array([])
        blobs = int((sizes >= 30).sum())
    return rows, rows / hh, spill, blobs


def gray(p, w, h):
    if not os.path.exists(p):
        return Image.new("L", (w, h), 0).convert("RGB")
    return Image.open(p).convert("L").resize((w, h), Image.NEAREST).convert("RGB")


def main():
    live = Image.open(LIVE).convert("RGBA")
    W, H = live.size
    cw, ch = W * K, H * K
    cols = ["LIVE boot"] + SHAPES
    LAB, GUT, HEAD, FOOT = 130, 12, 60, 46
    rows = ["ruler", "depth", "lineart", "coral only"]
    sw = LAB + (cw + GUT) * len(cols)
    sh = HEAD + (ch + 10) * len(rows) + FOOT
    sheet = Image.new("RGB", (sw, sh), (30, 31, 36))
    d = ImageDraw.Draw(sheet)
    f14, f12, f11 = font(15), font(13), font(12)
    d.rectangle([0, 0, sw, HEAD], fill=(20, 21, 25))
    d.text((12, 8), f"BATTLE BOTS  v3 LEG SHAPE RULERS   {W}x{H} at {K}x   "
                    f"hip 70,63  foot 70,181   the coral must be ONE block at the bottom",
           font=f14, fill=(255, 255, 255))
    for i, c in enumerate(cols):
        d.text((LAB + i * (cw + GUT) + 4, 36), c, font=f12, fill=(154, 160, 173))

    stats = {}
    for ri, row in enumerate(rows):
        y = HEAD + ri * (ch + 10)
        d.text((10, y + ch // 2 - 7), row, font=f12, fill=(143, 214, 180))
        for ci, c in enumerate(cols):
            x = LAB + ci * (cw + GUT)
            d.rectangle([x, y, x + cw, y + ch], fill=(58, 59, 66))
            if c == "LIVE boot":
                src = live if row == "ruler" else None
                if row == "coral only":
                    cm, ink = coral_of(np.asarray(live))
                    stats[c] = band_stats(cm, ink)
                    src = Image.fromarray((cm * 255).astype(np.uint8)).convert("RGBA")
                if src is None:
                    d.text((x + 8, y + ch // 2), "shipped art:", font=f11, fill=(120, 124, 132))
                    d.text((x + 8, y + ch // 2 + 14), "no control map", font=f11, fill=(120, 124, 132))
                    continue
                im = src.resize((cw, ch), Image.NEAREST)
                sheet.paste(im, (x, y), im)
                continue
            if row == "ruler":
                im = Image.open(os.path.join(RUL, f"legs-{c}.png")).convert("RGBA").resize((cw, ch), Image.NEAREST)
                sheet.paste(im, (x, y), im)
            elif row == "coral only":
                a = np.asarray(Image.open(os.path.join(RUL, f"legs-{c}.png")).convert("RGBA"))
                cm, ink = coral_of(a)
                stats[c] = band_stats(cm, ink)
                im = Image.fromarray((cm * 255).astype(np.uint8)).convert("RGBA").resize((cw, ch), Image.NEAREST)
                sheet.paste(im, (x, y), im)
            else:
                sheet.paste(gray(os.path.join(CTL, f"leg-{c}", f"{row}.png"), cw, ch), (x, y))

    y = HEAD + len(rows) * (ch + 10)
    d.text((10, y + 4), "sole band", font=f12, fill=(240, 165, 143))
    for ci, c in enumerate(cols):
        x = LAB + ci * (cw + GUT)
        if c not in stats:
            continue
        r, frac, spill, blobs = stats[c]
        ok = r and frac >= 0.08 and spill <= 0.013 and blobs == 1
        d.text((x + 4, y + 4), f"{r} rows, {frac:.0%}", font=f11, fill=(232, 233, 238))
        d.text((x + 4, y + 19), f"spill {spill:.2%}  {blobs} blob", font=f11,
               fill=(143, 214, 180) if ok else (240, 120, 110))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print("wrote", OUT, sheet.size)
    for c in cols:
        if c in stats:
            r, frac, spill, blobs = stats[c]
            print(f"  {c:<12} band {r:>3} rows {frac:>5.1%}   spill {spill:>7.3%}   blobs {blobs}")


main()
