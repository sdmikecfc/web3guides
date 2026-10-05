#!/usr/bin/env python
"""
RIOT floor props generator (ADR-0124). Procedural PIL drawings so the
integrate phase has SOMETHING for every slot before CraftPix lands:
hitspark flipbook (5f), pickup icons (pipe, blaster), 3 door sprites
(closed/open, one palette per level). THIS FILE IS THE PIPELINE
(recover-lost-pipelines law) - rerunning it reproduces the pack.

Out: art-src/riot/packs/procedural/<anim>/<frame>.png  (per-frame PNGs,
     the ingest script's form-A path). Then:
       node scripts/riot-ingest.mjs procedural
       node scripts/riot-atlas.mjs
Run: python public/s6-art/games/riot/_raw/gen_props.py
"""
import math
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[5]  # web3guides/
OUT = ROOT / "art-src" / "riot" / "packs" / "procedural"

# level palettes (plan: L1 streets amber/teal, L2 forest cyan/green,
# L3 facility steel/magenta - magenta is the Warden's hostile color)
DOORS = {
    "door1": {"frame": (58, 44, 36), "panel": (172, 108, 44), "trim": (64, 176, 168), "dark": (26, 18, 14)},
    "door2": {"frame": (40, 52, 38), "panel": (96, 128, 74), "trim": (110, 220, 210), "dark": (14, 20, 12)},
    "door3": {"frame": (44, 46, 58), "panel": (108, 114, 132), "trim": (232, 92, 240), "dark": (12, 12, 20)},
}


def px_save(im: Image.Image, path: pathlib.Path, scale: int = 2) -> None:
    """author at half-res, 2x nearest = chunky pixel look, never blurry."""
    path.parent.mkdir(parents=True, exist_ok=True)
    im.resize((im.width * scale, im.height * scale), Image.NEAREST).save(path)


def hitspark() -> None:
    """5-frame white star burst, 64px cells: grow bright -> shatter -> fade."""
    for f in range(5):
        im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        t = f / 4.0
        r = 4 + 11 * t
        cx = cy = 16
        if f < 3:  # solid 8-point star, alternating spike lengths
            pts = []
            for i in range(16):
                a = i * math.pi / 8 - math.pi / 2
                rr = r if i % 2 == 0 else r * 0.42
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
            d.polygon(pts, fill=(255, 255, 255, 255))
            core = max(1, int(r * 0.3))
            d.ellipse([cx - core, cy - core, cx + core, cy + core], fill=(255, 244, 180, 255))
        else:  # fragments flying outward on the 8 spike lanes
            a0 = 255 if f == 3 else 140
            for i in range(8):
                a = i * math.pi / 4 - math.pi / 2
                fr = r * (1.0 + 0.25 * (f - 2))
                x, y = cx + fr * math.cos(a), cy + fr * math.sin(a)
                s = 2 if f == 3 else 1
                d.rectangle([x - s, y - s, x + s, y + s], fill=(255, 255, 255, a0))
        px_save(im, OUT / "hitspark" / f"{f}.png")


def pipe() -> None:
    """steel pipe, diagonal, threaded ends."""
    im = Image.new("RGBA", (28, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(19):  # shaft lower-left -> upper-right
        x, y = 4 + i, 22 - i
        d.rectangle([x, y - 1, x + 2, y + 1], fill=(148, 152, 160, 255))
        d.point((x + 1, y - 1), fill=(210, 214, 222, 255))  # top highlight
        d.point((x + 1, y + 1), fill=(92, 96, 104, 255))  # bottom shade
    for cx, cy in ((4, 22), (23, 3)):  # threaded couplings
        d.rectangle([cx - 2, cy - 2, cx + 3, cy + 3], fill=(108, 112, 122, 255))
        d.rectangle([cx - 2, cy - 2, cx + 3, cy - 1], fill=(164, 168, 178, 255))
    px_save(im, OUT / "pipe" / "0.png")


def blaster() -> None:
    """boxy energy pistol, teal cell glow."""
    im = Image.new("RGBA", (28, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([3, 8, 22, 13], fill=(70, 74, 86, 255))  # body
    d.rectangle([3, 8, 22, 9], fill=(112, 118, 134, 255))  # top light
    d.rectangle([20, 9, 25, 12], fill=(52, 56, 66, 255))  # muzzle
    d.rectangle([24, 10, 25, 11], fill=(110, 230, 220, 255))  # muzzle glow
    d.rectangle([6, 13, 11, 22], fill=(58, 62, 72, 255))  # grip
    d.rectangle([6, 13, 7, 22], fill=(88, 92, 104, 255))
    d.rectangle([12, 11, 16, 14], fill=(110, 230, 220, 255))  # energy cell
    d.rectangle([13, 12, 15, 13], fill=(196, 255, 250, 255))
    px_save(im, OUT / "blaster" / "0.png")


def doors() -> None:
    """closed(0)/open(1) per level palette; 60x88 content, feet on bottom."""
    for name, c in DOORS.items():
        for state in (0, 1):
            im = Image.new("RGBA", (30, 44), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.rectangle([0, 0, 29, 43], fill=c["frame"])  # jamb
            if state == 0:
                d.rectangle([3, 3, 26, 43], fill=c["panel"])
                shade = tuple(int(v * 0.72) for v in c["panel"])
                d.rectangle([3, 3, 26, 5], fill=tuple(min(255, int(v * 1.25)) for v in c["panel"]))
                for yy in (14, 26, 38):  # panel seams
                    d.rectangle([3, yy, 26, yy], fill=shade)
                d.rectangle([5, 20, 7, 24], fill=c["trim"])  # keypad/handle
            else:
                d.rectangle([3, 3, 26, 43], fill=c["dark"])  # the opening
                d.polygon([(3, 3), (10, 3), (3, 43)], fill=tuple(min(255, v + 18) for v in c["dark"]))
            d.rectangle([0, 0, 29, 1], fill=c["trim"])  # lintel strip
            px_save(im, OUT / name / f"{state}.png")


if __name__ == "__main__":
    hitspark()
    pipe()
    blaster()
    doors()
    n = sum(1 for _ in OUT.rglob("*.png"))
    print(f"procedural pack -> {OUT} ({n} frames)")
