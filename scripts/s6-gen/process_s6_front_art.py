# Process the three front pieces: wash -> cover-cropped webp underlay;
# citadel/walker -> rembg cutouts trimmed + downsized (S5 pipeline contract:
# sprites are cutout PNGs, plates are webp).
import io
import pathlib

from PIL import Image
from rembg import remove

RAW = pathlib.Path(r"C:/Users/Mike/Desktop/web3guides/public/s6-art/front/_raw")
OUT = pathlib.Path(r"C:/Users/Mike/Desktop/web3guides/public/s6-art/front")

# 1) WASH: crop the sky band (top ~14% is clouds/horizon), cover-fit 2600x1080.
im = Image.open(RAW / "wash.png").convert("RGB")
w, h = im.size
im = im.crop((0, int(h * 0.14), w, h))
tw, th = 2600, 1080
scale = max(tw / im.width, th / im.height)
im = im.resize((int(im.width * scale) + 1, int(im.height * scale) + 1), Image.LANCZOS)
x0 = (im.width - tw) // 2
y0 = (im.height - th) // 2
im = im.crop((x0, y0, x0 + tw, y0 + th))
im.save(OUT / "wash.webp", quality=86)
print("wash.webp", im.size)

# 2) CUTOUTS
for name, target_w in [("citadel", 640), ("walker", 512)]:
    src = (RAW / f"{name}.png").read_bytes()
    cut = Image.open(io.BytesIO(remove(src))).convert("RGBA")
    bbox = cut.getbbox()
    cut = cut.crop(bbox)
    if cut.width > target_w:
        cut = cut.resize((target_w, int(cut.height * target_w / cut.width)), Image.LANCZOS)
    cut.save(OUT / f"{name}.png")
    print(f"{name}.png", cut.size)
