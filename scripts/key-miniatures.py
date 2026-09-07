#!/usr/bin/env python
"""Key the S4 cast art into transparent character cutouts for the map (the S3
ship-cutout look), all LOCAL via rembg -- no SD server, no OpenAI. Writes
public/s4-art/cut/<name>.png (transparent, trimmed to the character bbox). The
map (HitListMap.tsx) prefers /s4-art/cut/<name>.png and falls back to the full
poster art, so only the looks players actually use need keying.

Setup (once):  python -m pip install rembg pillow onnxruntime
Run:           python scripts/key-miniatures.py           (from web3guides/)
Add looks:     extend NAMES below (starter files + any geared combos that show)
"""
import io, os
from rembg import remove
from PIL import Image

ART = os.path.join(os.path.dirname(__file__), "..", "public", "s4-art")
OUT = os.path.join(ART, "cut")
os.makedirs(OUT, exist_ok=True)

NAMES = set()
# per-team starter / base looks (what ungeared players show -- the common case)
for era in ("frontier", "agency", "singularity"):
    for v in ("1", "2", "3", "m1", "m2", "m3"):
        NAMES.add(f"cast-{era}-{v}")
# EVERY combo a player can wear: the full 125 female + 125 male grid, so NO agent
# on the map ever falls back to the rectangular poster (Mike 2026-07-15: "the
# characters don't look correct" = the un-keyed combos showed as full tiles).
for b in range(5):
    for d in range(5):
        for o in range(5):
            NAMES.add(f"cast-grid-b{b}d{d}o{o}")
            NAMES.add(f"cast-gridm-b{b}d{d}o{o}")

# Re-run friendly: pass FORCE=1 to re-key everything, else skip files already
# keyed so an interrupted batch resumes fast.
force = os.environ.get("FORCE") == "1"
done, skipped, already = [], [], 0
for n in sorted(NAMES):
    src = os.path.join(ART, n + ".png")
    if not os.path.exists(src):
        skipped.append(n)
        continue
    dst = os.path.join(OUT, n + ".png")
    if not force and os.path.exists(dst):
        already += 1
        continue
    im = Image.open(io.BytesIO(remove(open(src, "rb").read()))).convert("RGBA")
    bb = im.getbbox()          # trim transparent margins so it frames tight
    if bb:
        im = im.crop(bb)
    im.save(dst)
    done.append(n)
    if len(done) % 25 == 0:
        print(f"  ...keyed {len(done)} so far", flush=True)

print(f"keyed {len(done)} into public/s4-art/cut/  (already {already}, skipped {len(skipped)} missing)")
