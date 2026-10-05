# Key the near-white studio background out of the IRONJAW opponent renders,
# trim to the subject, and write game-sized PNGs. Same shape as the S6 front
# set-piece cutter: flood-fill from the border so enclosed light pixels INSIDE
# the robot (highlights, chrome) are never punched out.
from PIL import Image
from collections import deque
import os

SRC = r"C:/Users/Mike/Desktop/web3guides/public/s6-art/games/ironjaw/_raw"
DST = r"C:/Users/Mike/Desktop/web3guides/public/s6-art/games/ironjaw"
KEYS = ["rusty", "volt", "piston", "k88"]
THRESH = 232          # a pixel is "background" only if every channel is above this
TARGET_W = 420        # the arena draws the opponent about 200 sim px wide; 2x for dpr

def cut(name):
    im = Image.open(f"{SRC}/{name}.png").convert("RGBA")
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
    scale = TARGET_W / im.width
    im = im.resize((TARGET_W, max(1, round(im.height * scale))), Image.LANCZOS)
    im.save(f"{DST}/opp-{name}.png")
    print(f"opp-{name}.png {im.size} {os.path.getsize(f'{DST}/opp-{name}.png')//1024}KB")

for k in KEYS:
    cut(k)
