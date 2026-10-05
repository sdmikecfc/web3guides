# CUT OUT THE S6 PILOTS (2026-08-15, Mike: "the characters aren't cut out,
# its just wrong").
#
# S5's commander art is RGBA, background removed, and TRIMMED TO THE ALPHA
# BBOX at 900px tall - which is why its widths vary 293..528. The S6 renders
# were baked straight from the generator: RGB, no alpha, uniform 410x900 with
# a painted hangar background. Dropped into SceneCommander they become opaque
# rectangles with a drop-shadow outlining the box, exactly as the CSS comment
# in HqScene warns.
#
# The S5 recipe, reproduced: rembg -> RGBA -> trim to alpha bbox -> normalize
# height to 900. Originals are preserved under _raw/preCut/ first.
import io, os, shutil, sys
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SRC = r"C:/Users/Mike/Desktop/web3guides/public/s6-art/pilot"
KEEP = os.path.join(SRC, "_raw", "preCut")
# bigmike is already an RGBA cutout carried over from S5 - leave it alone.
KEYS = ["compass", "diesel", "forge", "granite", "havoc", "jackal", "vega", "wrench"]
TARGET_H = 900

os.makedirs(KEEP, exist_ok=True)
from rembg import remove, new_session

session = new_session("isnet-general-use")

for key in KEYS:
    p = os.path.join(SRC, f"{key}.png")
    src = Image.open(p)
    if src.mode == "RGBA" and src.getchannel("A").getextrema()[0] < 255:
        print(f"{key}: already cut, skipping")
        continue
    # keep the original exactly once
    backup = os.path.join(KEEP, f"{key}.png")
    if not os.path.exists(backup):
        shutil.copy2(p, backup)

    cut = remove(src.convert("RGBA"), session=session)
    bbox = cut.getbbox()
    if not bbox:
        print(f"{key}: !! cutout is empty, leaving the original in place")
        continue
    cut = cut.crop(bbox)
    # normalize to the S5 convention: 900 tall, width follows the figure
    w = max(1, round(cut.width * TARGET_H / cut.height))
    cut = cut.resize((w, TARGET_H), Image.LANCZOS)
    cut.save(p)

    a = cut.getchannel("A")
    lo, hi = a.getextrema()
    clear = sum(1 for px in a.getdata() if px == 0) / (cut.width * cut.height)
    print(f"{key}: {cut.width}x{cut.height} alpha[{lo},{hi}] transparent={clear*100:.1f}% "
          f"({os.path.getsize(p)//1024}KB)")
print("done")
