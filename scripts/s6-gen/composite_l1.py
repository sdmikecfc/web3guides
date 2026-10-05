"""L1 composite: candidate BLD_SCALE / tint options + the new asphalt ground.

Replicates the Client's drawStatics wall math (h01 picks, no-twin rule,
width-1 advance, foot at FLOOR_TOP+BLD_TUCK) so the composite decides the
shipped numbers instead of taste.
"""
import math
import pathlib
import sys

from PIL import Image, ImageDraw

ART = pathlib.Path(r"C:\Users\Mike\Desktop\web3guides\public\s6-art\games\riot")
SCRATCH = pathlib.Path(__file__).parent

DESIGN_W, DESIGN_H = 640, 400
FLOOR_TOP, FLOOR_BOT = 252, 388
BLD_TUCK = 3
LEVEL_W = 1920

SKIN_FAR = (0x2C, 0x1A, 0x12)
ACCENT = (0xE8, 0xA3, 0x3D)


def h01(i: float) -> float:
    v = math.sin(i * 127.1 + 311.7) * 43758.5453
    return v - math.floor(v)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def tinted(im: Image.Image, tint) -> Image.Image:
    r, g, b, a = im.split()
    r = r.point(lambda v: v * tint[0] // 255)
    g = g.point(lambda v: v * tint[1] // 255)
    b = b.point(lambda v: v * tint[2] // 255)
    return Image.merge("RGBA", (r, g, b, a))


def draw_ground(dr: ImageDraw.ImageDraw, cam_x: float, ground, style="asphalt"):
    W = DESIGN_W
    if style == "old-wood":
        gl = (0x3A, 0x2A, 0x1C)
        dr.rectangle([0, FLOOR_TOP, W, DESIGN_H], fill=(0x27, 0x1C, 0x14))
        for i in range(1, 4):
            y = FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) / 4 * i
            dr.rectangle([0, y, W, y + 1.5], fill=gl)
        x = -(cam_x % 84)
        while x < W:
            dr.line([x, FLOOR_TOP, x - 26, FLOOR_BOT], fill=gl, width=1)
            x += 84
        dr.rectangle([0, FLOOR_BOT, W, DESIGN_H], fill=(0x18, 0x0F, 0x0A))
        dr.rectangle([0, FLOOR_TOP, W, FLOOR_TOP + 2], fill=ACCENT)
        return

    # asphalt street
    dr.rectangle([0, FLOOR_TOP, W, DESIGN_H], fill=ground)
    SW = 22
    side = lerp(ground, (255, 255, 255), 0.10)
    dr.rectangle([0, FLOOR_TOP, W, FLOOR_TOP + SW], fill=side)
    x = -(cam_x % 46)
    while x < W:
        dr.rectangle([x, FLOOR_TOP, x + 1.5, FLOOR_TOP + SW], fill=lerp(side, (0, 0, 0), 0.25))
        x += 46
    kerb = lerp(ground, (255, 255, 255), 0.25)
    dr.rectangle([0, FLOOR_TOP + SW, W, FLOOR_TOP + SW + 2.5], fill=kerb)
    dr.rectangle([0, FLOOR_TOP + SW + 2.5, W, FLOOR_TOP + SW + 5.5], fill=lerp(ground, (0, 0, 0), 0.35))
    # lane dashes
    lane_y = FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) * 0.62
    x = -(cam_x % 64)
    while x < W:
        dr.rectangle([x, lane_y, x + 30, lane_y + 3], fill=lerp(ground, (0xD8, 0xD2, 0xC4), 0.16))
        x += 64
    # patches / manholes / cracks
    i0 = int(cam_x // 90)
    for i in range(i0 - 1, i0 + int(W / 90) + 2):
        px = i * 90 + h01(i * 3) * 50 - cam_x
        py = FLOOR_TOP + SW + 12 + h01(i * 7 + 1) * (FLOOR_BOT - FLOOR_TOP - SW - 34)
        if h01(i * 11 + 2) > 0.6:
            dr.rectangle([px, py, px + 34 + h01(i) * 30, py + 14 + h01(i * 5) * 10], fill=lerp(ground, (0, 0, 0), 0.10))
        if h01(i * 13 + 3) > 0.72:
            dr.ellipse([px - 11, py - 4.5, px + 11, py + 4.5], fill=lerp(ground, (0, 0, 0), 0.3), outline=lerp(ground, (255, 255, 255), 0.18))
        if h01(i * 17 + 4) > 0.62:
            cx, cy = px - 14, py + 6
            for k in range(4):
                nx = cx + 7 + h01(i * 19 + k) * 8
                ny = cy + (h01(i * 23 + k) - 0.5) * 8
                dr.line([cx, cy, nx, ny], fill=lerp(ground, (0, 0, 0), 0.28), width=1)
                cx, cy = nx, ny
    # depth lanes (kept, fainter)
    for i in range(1, 4):
        y = FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) / 4 * i
        dr.rectangle([0, y, W, y + 1], fill=lerp(ground, (255, 255, 255), 0.05))
    dr.rectangle([0, FLOOR_BOT, W, DESIGN_H], fill=lerp(ground, (0, 0, 0), 0.45))
    dr.rectangle([0, FLOOR_TOP, W, FLOOR_TOP + 2], fill=lerp(ground, ACCENT, 0.35))


def panel(bld_scale: float, tint_t: float, cam_x: float, ground, ground_style="asphalt") -> Image.Image:
    img = Image.new("RGBA", (DESIGN_W, DESIGN_H), (20, 16, 12, 255))
    # far plate at 0.15 parallax
    plate = Image.open(ART / "bg-l1-far.webp").convert("RGBA")
    sky_w = DESIGN_W + 0.15 * (LEVEL_W - DESIGN_W) + 40
    sc = max(sky_w / plate.width, DESIGN_H / plate.height)
    plate = plate.resize((round(plate.width * sc), round(plate.height * sc)), Image.LANCZOS)
    ox = int(cam_x * 0.15)
    img.alpha_composite(plate, (-ox, 0))

    dr = ImageDraw.Draw(img)

    # wall facades (parallax 1, same math as drawStatics)
    tex = [Image.open(ART / f"bld-l1-{c}.webp").convert("RGBA") for c in "abcde"]
    tint = lerp((255, 255, 255), SKIN_FAR, tint_t)
    tex = [tinted(t, tint) for t in tex]
    wall = Image.new("RGBA", (DESIGN_W, DESIGN_H), (0, 0, 0, 0))
    x = -20.0
    i = 0
    prev = -1
    while x < LEVEL_W + 60:
        pick = int(h01(i * 7 + 3) * 5) % 5
        if pick == prev:
            pick = (pick + 1) % 5
        prev = pick
        t = tex[pick]
        w = t.width * bld_scale
        h = t.height * bld_scale
        sx = x - cam_x
        if sx < DESIGN_W and sx + w > 0:
            ts = t.resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)
            wall.alpha_composite(ts, (round(sx), round(FLOOR_TOP + BLD_TUCK - h)))
        x += max(24, w - 1)
        i += 1
    img.alpha_composite(wall)

    dr = ImageDraw.Draw(img)
    draw_ground(dr, cam_x, ground, ground_style)

    # hero + a thug for scale (idle frame from the atlas, 1.7x, feet at CELL-6)
    try:
        import json

        meta = json.load(open(ART / "chars" / "hero.json"))
        sheet = Image.open(ART / "chars" / "hero.png").convert("RGBA")
        fr = meta["frames"][meta["animations"]["idle"][0]]["frame"]
        cell = sheet.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"]))
        cell = cell.resize((round(cell.width * 1.7), round(cell.height * 1.7)), Image.NEAREST)
        # anchor (0.5, 90/96)
        hx, hy = 300, 330
        img.alpha_composite(cell, (hx - cell.width // 2, round(hy - cell.height * (90 / 96))))
        meta2 = json.load(open(ART / "chars" / "thug-a.json"))
        sheet2 = Image.open(ART / "chars" / "thug-a.png").convert("RGBA")
        fr2 = meta2["frames"][meta2["animations"]["idle"][0]]["frame"]
        cell2 = sheet2.crop((fr2["x"], fr2["y"], fr2["x"] + fr2["w"], fr2["y"] + fr2["h"]))
        cell2 = cell2.resize((round(cell2.width * 1.7), round(cell2.height * 1.7)), Image.NEAREST)
        tx, ty = 420, 310
        img.alpha_composite(cell2, (tx - cell2.width // 2, round(ty - cell2.height * (90 / 96))))
    except Exception as e:
        print("actor paste failed:", e)

    return img


def main():
    cam = 320.0
    ground_asphalt = (0x26, 0x24, 0x2A)
    opts = [
        ("current: scale .50 tint .15 wood", 0.50, 0.15, (0x27, 0x1C, 0x14), "old-wood"),
        ("scale .50 tint .08 asphalt", 0.50, 0.08, ground_asphalt, "asphalt"),
        ("scale .58 tint .08 asphalt", 0.58, 0.08, ground_asphalt, "asphalt"),
        ("scale .66 tint .08 asphalt", 0.66, 0.08, ground_asphalt, "asphalt"),
    ]
    out = Image.new("RGBA", (DESIGN_W * 2 + 30, DESIGN_H * 2 + 50), (12, 10, 8, 255))
    dr = ImageDraw.Draw(out)
    for k, (label, sc, tt, g, gs) in enumerate(opts):
        p = panel(sc, tt, cam, g, gs)
        px = (k % 2) * (DESIGN_W + 30)
        py = (k // 2) * (DESIGN_H + 50)
        out.alpha_composite(p, (px, py + 20))
        dr.text((px + 4, py + 4), label, fill=(240, 233, 218, 255))
    out.save(SCRATCH / "l1_options.png")
    print("wrote", SCRATCH / "l1_options.png")


if __name__ == "__main__":
    main()
