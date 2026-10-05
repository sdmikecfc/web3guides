# CUT OUT THE S6 PILOTS, round 2.
#
# Round 1 used rembg's generic isnet model and it barely bit: these renders sit
# on a near-BLACK studio background, so a general matting model reads the dark
# jacket and the dark backdrop as one mass and only nibbles the rim. Result was
# 6-24% transparency where S5's cutouts run 24-47%.
#
# u2net_human_seg is trained on people specifically, which is exactly the
# subject here. Always restore from the preserved original first so this is
# re-runnable and never compounds a previous bad cut.
import os, shutil, sys
from PIL import Image, ImageFilter

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SRC = r"C:/Users/Mike/Desktop/web3guides/public/s6-art/pilot"
KEEP = os.path.join(SRC, "_raw", "preCut")
KEYS = ["compass", "diesel", "forge", "granite", "havoc", "jackal", "vega", "wrench"]
TARGET_H = 900

from rembg import remove, new_session

session = new_session("u2net_human_seg")

for key in KEYS:
    p = os.path.join(SRC, f"{key}.png")
    backup = os.path.join(KEEP, f"{key}.png")
    if not os.path.exists(backup):
        print(f"{key}: !! no preserved original, skipping")
        continue
    src = Image.open(backup).convert("RGBA")

    cut = remove(
        src,
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=250,
        alpha_matting_background_threshold=15,
        alpha_matting_erode_size=8,
    )
    # kill the speckle a matting pass leaves in the dark field: anything under
    # a quarter alpha is background, then feather the edge back by half a pixel
    a = cut.getchannel("A").point(lambda v: 0 if v < 64 else v)
    a = a.filter(ImageFilter.GaussianBlur(0.5))
    cut.putalpha(a)

    bbox = cut.getbbox()
    if not bbox:
        print(f"{key}: !! empty cutout, leaving original")
        continue
    cut = cut.crop(bbox)
    w = max(1, round(cut.width * TARGET_H / cut.height))
    cut = cut.resize((w, TARGET_H), Image.LANCZOS)
    cut.save(p)

    ax = cut.getchannel("A")
    clear = ax.histogram()[0] / (cut.width * cut.height)
    print(f"{key}: {cut.width}x{cut.height} transparent={clear*100:.1f}% ({os.path.getsize(p)//1024}KB)")
print("done")
