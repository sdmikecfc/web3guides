# Round-2 S6 game art: key the white studio ground out, trim, resize.
# Same border flood-fill cutter as round 1 (threshold 232, filled inward from
# the frame edge) so enclosed chrome/crystal highlights are never punched out.
# `crop_bottom` drops the human forearm the gauntlet render came with.
from PIL import Image, ImageFilter
from collections import deque
import os

ROOT = r"C:/Users/Mike/Desktop/web3guides/public/s6-art/games"
THRESH = 232

JOBS = [
    # (game, raw name, out name, target px, square?, crop_bottom frac)
    ("ironjaw", "fist", "fist", 240, False, 0.17),
    ("strain", "prey1", "prey1", 96, True, 0.0),
    ("strain", "prey3", "prey3", 128, True, 0.0),
    ("strain", "prey5", "prey5", 176, True, 0.0),
    ("strain", "door", "door", 180, False, 0.0),
    ("stopclock", "foe", "hero", 420, False, 0.0),  # NOT wired: wrong camera
]

def cut(game, raw, out, target, square, crop_bottom):
    im = Image.open(f"{ROOT}/{game}/_raw/{raw}.png").convert("RGBA")
    if crop_bottom > 0:
        im = im.crop((0, 0, im.width, int(im.height * (1 - crop_bottom))))
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)
    q = deque()

    def light(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and r >= THRESH and g >= THRESH and b >= THRESH

    for x in range(w):
        for y in (0, h - 1):
            if not bg[y * w + x] and light(x, y):
                bg[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not bg[y * w + x] and light(x, y):
                bg[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx] and light(nx, ny):
                bg[ny * w + nx] = 1
                q.append((nx, ny))

    for y in range(h):
        row = y * w
        for x in range(w):
            if bg[row + x]:
                px[x, y] = (0, 0, 0, 0)

    im = im.crop(im.getbbox())
    if square:
        side = max(im.size)
        pad = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        pad.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        im = pad.resize((target, target), Image.LANCZOS)
    else:
        im = im.resize((target, max(1, round(im.height * target / im.width))), Image.LANCZOS)
    im.save(f"{ROOT}/{game}/{out}.png")
    print(f"{game}/{out}.png {im.size} {os.path.getsize(f'{ROOT}/{game}/{out}.png')//1024}KB")

for j in JOBS:
    cut(*j)

# The chamber floor is an opaque plate, not a cutout: darken it hard so the
# blob, the prey and the HUD stay the brightest things on screen, then webp.
fl = Image.open(f"{ROOT}/strain/_raw/floor.png").convert("RGB")
fl = fl.resize((540, 720), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
fl = fl.point(lambda v: int(v * 0.55))
fl.save(f"{ROOT}/strain/bg-vault.webp", quality=84, method=6)
print(f"strain/bg-vault.webp {os.path.getsize(f'{ROOT}/strain/bg-vault.webp')//1024}KB")
