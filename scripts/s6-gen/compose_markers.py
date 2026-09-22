# Screen-space proof of the rebuilt markers: the whole 2600x1080 world at a
# 1200px viewport (ws=0.4615, camK=1 -> inv=2.167), buildings at real scaled
# size, PLAY pills on all four arenas (today = biggest), ATTACK on the active
# fortress. Mirrors mkMarker's pill/casing math exactly.
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = r"C:\Users\Mike\Desktop\web3guides"
OUT = r"C:\Users\Mike\AppData\Local\Temp\claude\C--Users-Mike-Desktop-trading-bot--claude-worktrees-clever-clarke-50cbb4\447c6f2b-c4f9-4db6-af73-7917a13a8086\scratchpad\markers_screen.png"
WS = 1200 / 2600.0
INV = max(1.0, min(3.0, 1 / WS))  # 2.167

src = open(ROOT + r"\src\app\s6\front\setdressing.ts", encoding="utf-8").read()
items = re.findall(r'\{ key: "(bld-[\w-]+|prop-[\w-]+)", x: (\d+), y: (\d+), s: ([\d.]+)', src)
spots = re.findall(r"\{ x: (\d+), y: (\d+) \}", src.split("MILESTONE_SPOTS")[1].split("];")[0])

W, H = 1200, int(1080 * WS)
wash = Image.open(ROOT + r"\public\s6-art\front\wash.webp").convert("RGBA").resize((W, H))
canvas = wash.copy()

def paste_world(img, wx, wy, ww, wh):
    sp = img.resize((max(1, int(ww * WS)), max(1, int(wh * WS))), Image.LANCZOS)
    canvas.alpha_composite(sp, (int(wx * WS - sp.width / 2), int(wy * WS - sp.height)))

# buildings + shadows (world space, scaled to screen)
for key, x, y, s in items:
    x, y, s = int(x), int(y), float(s)
    try:
        t = Image.open(ROOT + rf"\public\s6-art\front\set\{key}.png").convert("RGBA")
    except FileNotFoundError:
        continue
    ww, wh = t.width * 0.5 * s, t.height * 0.5 * s
    if key.startswith("bld-"):
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        rx, ry = ww * 0.46 * WS, max(2, ww * 0.13 * WS)
        cx, cy = x * WS, (y - 3) * WS
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(0, 0, 0, 71))
        canvas = Image.alpha_composite(canvas, sh)
    paste_world(t, x, y, ww, wh)

# fortresses at milestone spots (fw=118 world)
fort_h = {}
for i, (sx, sy) in enumerate(spots):
    sx, sy = int(sx), int(sy)
    ft = Image.open(ROOT + rf"\public\s6-art\front\fortress{(i % 3) + 1}.png").convert("RGBA")
    fh = 118 * ft.height / ft.width
    fort_h[i] = fh
    paste_world(ft, sx, sy, 118, fh)

try:
    F_BIG = ImageFont.truetype("segoeuib.ttf", 19)
    F_SM = ImageFont.truetype("segoeuib.ttf", 15)
except OSError:
    F_BIG = F_SM = ImageFont.load_default()

def marker(d, sx, sy, label, color, text_fill, big, scale):
    k = (1.0 if big else 0.8) * scale
    # chevron: tip at (sx, sy), casing then colour
    pts = [(sx - 14 * k, sy - 17 * k), (sx, sy), (sx + 14 * k, sy - 17 * k)]
    d.line(pts, fill=(12, 16, 20, 217), width=int(11 * k), joint="curve")
    d.line(pts, fill=color, width=int(5.5 * k), joint="curve")
    f = F_BIG if big else F_SM
    tw = d.textlength(label, font=f) * scale
    th = 22 * scale if big else 18 * scale
    pw, ph = tw + 20 * k, th + 9 * k
    py1 = sy - 24 * k + 4.5 * k
    d.rounded_rectangle([sx - pw / 2, py1 - ph, sx + pw / 2, py1], radius=ph / 2,
                        fill=(12, 16, 20, 219), outline=color, width=3)
    d.text((sx, py1 - ph / 2), label, font=f, fill=text_fill, anchor="mm")

ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
GAME_KEYS = ["bld-ironjaw", "bld-strain", "bld-stopclock", "bld-riot"]
lay = {k: (int(x), int(y), float(s)) for k, x, y, s in items}
today = GAME_KEYS[0]  # representative
for key in GAME_KEYS:
    x, y, s = lay[key]
    t = Image.open(ROOT + rf"\public\s6-art\front\set\{key}.png")
    top = y - t.height * 0.5 * s
    is_today = key == today
    marker(d, x * WS, (top - 8 * INV) * WS, "PLAY", (240, 179, 64, 255), (255, 217, 138, 255),
           is_today, INV * WS * (1.0 if is_today else 0.9))
# pulse ring on today's
x, y, s = lay[today]
t = Image.open(ROOT + rf"\public\s6-art\front\set\{today}.png")
top = y - t.height * 0.5 * s
cx, cy, r = x * WS, (top - 30 * INV) * WS, 55 * INV * WS
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(240, 179, 64, 150), width=4)
# ATTACK on the active fortress (spot 0)
sx, sy = int(spots[0][0]), int(spots[0][1])
marker(d, sx * WS, (sy - fort_h[0] - 10 * INV) * WS, "ATTACK", (255, 59, 48, 255),
       (255, 255, 255, 255), True, INV * WS)
canvas = Image.alpha_composite(canvas, ov)
canvas.convert("RGB").save(OUT)
print("written", OUT)
