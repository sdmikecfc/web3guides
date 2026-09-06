# Key + trim the STRAIN prey bot and hunter machine (same border flood-fill
# cutter as the IRONJAW opponents, so enclosed highlights survive).
from PIL import Image
from collections import deque
import os

BASE = r"C:/Users/Mike/Desktop/web3guides/public/s6-art/games/strain"
JOBS = [("bot", 140), ("hunter", 200)]
THRESH = 232

def cut(name, target_w):
    im = Image.open(f"{BASE}/_raw/{name}.png").convert("RGBA")
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
    # square-pad so the sprite's own center is the rotation/anchor center
    side = max(im.size)
    pad = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    pad.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    pad = pad.resize((target_w, target_w), Image.LANCZOS)
    pad.save(f"{BASE}/{name}.png")
    print(f"{name}.png {pad.size} {os.path.getsize(f'{BASE}/{name}.png')//1024}KB")

for n, tw in JOBS:
    cut(n, tw)
