# -*- coding: utf-8 -*-
"""Garage tank renders -> CARD-READY 1200x630 JPEGs for the share card.

WHY THIS EXISTS. The public garage's share card drew a hand-coded SVG tank: a
generic top-down box, the same silhouette for all twenty machines. Mike: "Its
really bad. Needs to have their actual tank and look like the S4 ones."

The real renders exist at /s5-art/tank/<key>[-<camo>].webp (1024x682) and are
excellent, but they cannot be used directly for two reasons:

  1. Satori (next/og) renders <img> from PNG, JPEG and SVG. NOT WebP.
  2. The renders are 3:2 and the card is 1.9:1. Cropping to fill (object-fit:
     cover) chops the gun barrel off the left edge and the tracks off the
     bottom -- measured, not guessed. On a card whose whole job is "this is MY
     tank", cutting the tank in half is the wrong trade.

So the framing is baked HERE, once, at exactly the card's size, and the route
draws it flat with nothing left to crop. The whole machine fits with a little
air, and the studio plate is extended sideways by blurring a cover-scaled copy
of the same source, so the background light matches the subject's own for free
and no tank has a hard edge behind it. Satori cannot blur or sample edges;
Pillow can, and this runs once.

JPEG, not PNG: photographic renders on an opaque plate, no alpha to keep, and
PNG would roughly quadruple the bytes underneath the card's gradient scrim.

Idempotent: skips a JPEG already newer than its source. Delete the output
directory to force a full rebuild after changing WIDTH/HEIGHT/FIT.
"""
import io
import os
import sys

from PIL import Image, ImageFilter

SRC = r"C:\Users\Mike\Desktop\web3guides\public\s5-art\tank"
DST = os.path.join(SRC, "card")
W, H = 1200, 630          # the og:image size, so the route never crops
FIT = 0.94                # a little air around the machine
BLUR = 42                 # plate extension; high enough to leave no ghost tank
QUALITY = 80

os.makedirs(DST, exist_ok=True)


def frame(im):
    """Whole tank centred, studio plate extended to the full card."""
    # Background: the source scaled to COVER, then blurred. Same plate, same
    # light, no second asset, and nothing recognisable survives the blur.
    cs = max(W / im.width, H / im.height)
    bg = im.resize((round(im.width * cs), round(im.height * cs)), Image.LANCZOS)
    bx, by = (bg.width - W) // 2, (bg.height - H) // 2
    bg = bg.crop((bx, by, bx + W, by + H)).filter(ImageFilter.GaussianBlur(BLUR))

    # Foreground: the whole render, CONTAINed, so nothing is ever cut off.
    s = min(W / im.width, H / im.height) * FIT
    fw, fh = round(im.width * s), round(im.height * s)
    bg.paste(im.resize((fw, fh), Image.LANCZOS), ((W - fw) // 2, (H - fh) // 2))
    return bg


sources = sorted(f for f in os.listdir(SRC) if f.lower().endswith(".webp"))
if not sources:
    print("no .webp renders found in %s" % SRC)
    sys.exit(1)

made = skipped = 0
total = 0
for name in sources:
    src = os.path.join(SRC, name)
    out = os.path.join(DST, os.path.splitext(name)[0] + ".jpg")
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        skipped += 1
        total += os.path.getsize(out)
        continue
    buf = io.BytesIO()
    frame(Image.open(src).convert("RGB")).save(
        buf, "JPEG", quality=QUALITY, optimize=True, progressive=True
    )
    data = buf.getvalue()
    with open(out, "wb") as fh:
        fh.write(data)
    made += 1
    total += len(data)

print("card frames: %d written, %d already current, %d total, %.1f MB (%dx%d)"
      % (made, skipped, made + skipped, total / 1024.0 / 1024.0, W, H))
