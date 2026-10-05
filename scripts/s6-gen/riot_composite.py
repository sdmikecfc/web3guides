"""RIOT level-1 composite at the Client's exact layout math.

Reproduces drawStatics() + the parallax assignment from Client.tsx so the
facade row can be judged (meets the ground? right size?) without a browser.
Renders three camera positions: 0, mid, right edge.
"""

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ART = Path(r"C:\Users\Mike\Desktop\web3guides\public\s6-art\games\riot")
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("riot_facades_v2.png")

# ── constants lifted from sim.ts / Client.tsx ────────────────────────────────
DESIGN_W, DESIGN_H = 640, 400
FLOOR_TOP, FLOOR_BOT = 252, 388
LEVEL_W = 1920  # levels.ts set 0 level 1 w
SKINS = dict(
    streets=dict(skyTop=0x1C110C, skyHz=0x8A4520, ground=0x271C14, groundLine=0x3A2A1C,
                 under=0x180F0A, far=0x2C1A12, mid=0x382216, accent=0xE8A33D),
    forest=dict(skyTop=0x081512, skyHz=0x1F5244, ground=0x122019, groundLine=0x1F3428,
                under=0x0A130E, far=0x14302A, mid=0x1B3D34, accent=0x58D6C2),
    facility=dict(skyTop=0x110818, skyHz=0x4C1C5A, ground=0x1A0F22, groundLine=0x2C1C3A,
                  under=0x100918, far=0x241031, mid=0x321845, accent=0xD45AE0),
)

CFG = json.loads((Path(__file__).parent / "riot_cfg.json").read_text())
LVL = CFG.get("LEVEL", 1)
SKIN = SKINS[CFG.get("SKIN", "streets")]
BLD_SCALE = CFG["BLD_SCALE"]              # Client.tsx const
BLD_BASE_Y = CFG["BLD_BASE_Y"]            # sprite y (anchor 0,1)
BLD_JITTER = CFG.get("BLD_JITTER", [1.0])  # per-piece height multipliers
FACADES = CFG["FACADES"]
SPRITE_SCALE_HERO = 1.7
SPRITE_ANCHOR_Y = (96 - 6) / 96


def h01(i: float) -> float:
    v = math.sin(i * 127.1 + 311.7) * 43758.5453
    return v - math.floor(v)


def lerpc(a: int, b: int, t: float) -> int:
    ar, ag, ab = (a >> 16) & 255, (a >> 8) & 255, a & 255
    br, bg, bb = (b >> 16) & 255, (b >> 8) & 255, b & 255
    return (round(ar + (br - ar) * t) << 16) | (round(ag + (bg - ag) * t) << 8) | round(ab + (bb - ab) * t)


def rgb(n: int):
    return ((n >> 16) & 255, (n >> 8) & 255, n & 255)


def tint(im: Image.Image, col: int) -> Image.Image:
    r, g, b = rgb(col)
    src = im.split()
    lut_r = src[0].point(lambda v: v * r // 255)
    lut_g = src[1].point(lambda v: v * g // 255)
    lut_b = src[2].point(lambda v: v * b // 255)
    return Image.merge("RGBA", (lut_r, lut_g, lut_b, src[3]))


# ── assets ──────────────────────────────────────────────────────────────────
bg = Image.open(ART / f"bg-l{LVL}-far.webp").convert("RGBA")
blds = [Image.open(ART / f"{n}.webp").convert("RGBA") for n in FACADES]
W_TINT = lerpc(0xFFFFFF, SKIN["far"], 0.15)
blds_t = [tint(b, W_TINT) for b in blds]

hero_sheet = Image.open(ART / "chars/hero.png").convert("RGBA")
hero_meta = json.loads((ART / "chars/hero.json").read_text())
f = hero_meta["frames"]["idle_0"]["frame"]
hero_cell = hero_sheet.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))


def render(cam_x: float) -> Image.Image:
    canvas = Image.new("RGBA", (DESIGN_W, DESIGN_H), (0, 0, 0, 255))

    # ── skyFar: painted plate, fitCover(DESIGN_W + .15*(levelW-DESIGN_W)+40, DESIGN_H)
    sky_w = DESIGN_W + 0.15 * max(0, LEVEL_W - DESIGN_W) + 40
    sc = max(sky_w / bg.width, DESIGN_H / bg.height)
    plate = bg.resize((max(1, round(bg.width * sc)), max(1, round(bg.height * sc))), Image.LANCZOS)
    canvas.alpha_composite(plate, (round(-cam_x * 0.15), 0))

    # ── mid: sparse silhouettes, parallax .45, alpha .55
    mid = Image.new("RGBA", (DESIGN_W + 400, DESIGN_H), (0, 0, 0, 0))
    md = ImageDraw.Draw(mid)
    mid_w = DESIGN_W + 0.45 * max(0, LEVEL_W - DESIGN_W) + 40
    mid_off = -cam_x * 0.45
    x, i = 30.0, 0
    while x < mid_w:
        ht = 150 + h01(i * 11) * 70
        sx = x + mid_off
        md.rectangle([sx, FLOOR_TOP - ht, sx + 46, FLOOR_TOP], fill=rgb(SKIN["mid"]) + (140,))
        md.rectangle([sx + 8, FLOOR_TOP - ht + 8, sx + 38, FLOOR_TOP - ht + 12], fill=rgb(SKIN["accent"]) + (51,))
        x += 150 + h01(i * 13 + 4) * 100
        i += 1
    canvas.alpha_composite(mid, (0, 0))

    # ── play/wallC: contiguous facades, parallax 1.0
    x, i, prev = -20.0, 0, -1
    wall_end = LEVEL_W + 60
    tops = []
    while x < wall_end:
        pick = math.floor(h01(i * 7 + 3) * len(blds_t)) % len(blds_t)
        if pick == prev and len(blds_t) > 1:
            pick = (pick + 1) % len(blds_t)
        prev = pick
        tex = blds_t[pick]
        jit = BLD_JITTER[math.floor(h01(i * 5 + 11) * len(BLD_JITTER)) % len(BLD_JITTER)]
        dw = max(1, round(tex.width * BLD_SCALE))
        dh = max(1, round(tex.height * BLD_SCALE * jit))
        sx = round(x - cam_x)
        if -dw < sx < DESIGN_W:
            spr = tex.resize((dw, dh), Image.LANCZOS)
            canvas.alpha_composite(spr, (sx, BLD_BASE_Y - dh))
            tops.append(BLD_BASE_Y - dh)
        x += max(24, tex.width * BLD_SCALE - 1)
        i += 1

    # ── play/groundG: the belt band
    g = Image.new("RGBA", (DESIGN_W, DESIGN_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    gd.rectangle([0, FLOOR_TOP, DESIGN_W, DESIGN_H], fill=rgb(SKIN["ground"]) + (255,))
    for k in (1, 2, 3):
        y = FLOOR_TOP + ((FLOOR_BOT - FLOOR_TOP) / 4) * k
        gd.rectangle([0, y, DESIGN_W, y + 1.5], fill=rgb(SKIN["groundLine"]) + (204,))
    wx = 0
    while wx < LEVEL_W + 80:
        sx = wx - cam_x
        gd.line([sx, FLOOR_TOP, sx - 26, FLOOR_BOT], fill=rgb(SKIN["groundLine"]) + (115,), width=1)
        wx += 84
    gd.rectangle([0, FLOOR_BOT, DESIGN_W, DESIGN_H], fill=rgb(SKIN["under"]) + (255,))
    gd.rectangle([0, FLOOR_TOP, DESIGN_W, FLOOR_TOP + 2], fill=rgb(SKIN["accent"]) + (89,))
    canvas.alpha_composite(g, (0, 0))

    # ── hero at real scale (idle_0, scale 1.7, feet at cell-6)
    hw = round(hero_cell.width * SPRITE_SCALE_HERO)
    hh = round(hero_cell.height * SPRITE_SCALE_HERO)
    hero = hero_cell.resize((hw, hh), Image.NEAREST)
    hero_y = 330  # a typical belt y
    hx = round(200 - hw * 0.5)
    hy = round(hero_y - hh * SPRITE_ANCHOR_Y)
    canvas.alpha_composite(hero, (hx, hy))

    return canvas, min(tops) if tops else 0


rows = []
labels = []
for cam in (0, (LEVEL_W - DESIGN_W) / 2, LEVEL_W - DESIGN_W):
    im, top = render(cam)
    rows.append(im)
    labels.append(f"camX={cam:.0f}  tallest roof y={top}  band {FLOOR_TOP}-{FLOOR_BOT}")
    print(labels[-1])

SCALE = 2
pad = 22
out = Image.new("RGB", (DESIGN_W * SCALE, (DESIGN_H * SCALE + pad) * len(rows)), (18, 18, 18))
try:
    font = ImageFont.truetype("consola.ttf", 15)
except Exception:
    font = ImageFont.load_default()
d = ImageDraw.Draw(out)
for k, (im, lab) in enumerate(zip(rows, labels)):
    y = (DESIGN_H * SCALE + pad) * k
    d.text((6, y + 3), lab, fill=(230, 230, 230), font=font)
    out.paste(im.convert("RGB").resize((DESIGN_W * SCALE, DESIGN_H * SCALE), Image.NEAREST), (0, y + pad))
OUT.parent.mkdir(parents=True, exist_ok=True)
out.save(OUT)
print("wrote", OUT, out.size)
