"""Lane T: .bots-preview/sd-shapes2/RULERS-BODIES.png

The live shipped part, then every v3 body ruler, and under each one the two
maps the production stack actually conditions on (depth and lineart). Under
those, THE SILHOUETTE AT RING SIZE, white on black, blown back up so a person
can see it: that is the one question this table can fail on, because the gate
measures outlines at the size a bot is on the ring and nothing else about a
ruler matters if two of them are the same blob down there.

EVERY NUMBER ON THIS SHEET COMES FROM THE GATE, not from this file. The pair
overlaps, the median and the per-pair table are read out of
scripts/bots-lookalike-check.mts --json, run here once per slot and once per
pair. A sheet that recomputed them would be a second implementation of the
measurement it exists to show, and it would agree with the gate right up until
the day it did not (lesson_gates_must_import_not_reimplement). The ring
silhouette drawn here is a PICTURE and says so; the numbers beside it are the
gate's.

    python scripts/sd/bots-sd-sheet-v3-bodies.py
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PREVIEW = os.path.join(REPO, ".bots-preview", "sd-shapes2")
PARTS = os.path.join(PREVIEW, "parts")
TABLE = os.path.join(PREVIEW, "shape-table.json")
CTL = os.path.join(REPO, "art-src", "sd", "controls", "v3", "contract")
OUT = os.path.join(PREVIEW, "RULERS-BODIES.png")
GATE = os.path.join(REPO, "scripts", "bots-lookalike-check.mts")
LIVE = {"torso": os.path.join(REPO, "public", "bots-art", "parts", "torso", "t1-1.png"),
        "arm": os.path.join(REPO, "public", "bots-art", "parts", "arm", "t1-1.png")}

BG = (38, 39, 44)
PANEL = (58, 59, 66)
INK = (232, 233, 238)
DIM = (154, 160, 173)
GOOD = (143, 214, 180)
WARN = (240, 165, 143)


def font(sz, bold=False):
    for p in ((r"C:\Windows\Fonts\segoeuib.ttf",) if bold else ()) + (
            r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def gate(catalogue: str, table: str | None = None) -> dict:
    cmd = ["npx", "tsx", GATE, catalogue, "--json"]
    if table:
        cmd += ["--shape-table", table]
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, shell=(os.name == "nt"))
    if r.returncode not in (0, 1):
        sys.exit(f"the gate failed on {catalogue}:\n{r.stderr[-2000:]}")
    return json.loads(r.stdout)


def pair_overlaps(slot: str, ids: list[str]) -> list[tuple[float, str, str]]:
    """Every pair's overlap, each one measured by the gate itself on a
    two-file catalogue. Slow and correct beats fast and re-implemented."""
    out = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            with tempfile.TemporaryDirectory() as d:
                sd = os.path.join(d, slot)
                os.makedirs(sd)
                for k in (ids[i], ids[j]):
                    shutil.copyfile(os.path.join(PARTS, slot, k + ".png"), os.path.join(sd, k + ".png"))
                g = gate(d)
            got = [r for r in g["results"] if r["slot"] == slot and r.get("closest")]
            out.append((got[0]["closest"]["overlap"], ids[i], ids[j]))
    out.sort(reverse=True)
    return out


def ring_size(canvas: tuple[int, int], ring_scale: float, cell_w: int) -> tuple[int, int, int]:
    """(width, height, zoom) of the ring picture for a canvas, with the zoom
    chosen so the picture FITS its column. The first cut fixed the zoom at 3
    and the 154 px wide torso silhouette came out 462 px in a 210 px cell,
    over the top of its neighbours."""
    rw = max(1, round(canvas[0] * ring_scale))
    rh = max(1, round(canvas[1] * ring_scale))
    z = max(1, (cell_w - 8) // rw)
    return rw * z, rh * z, z


def ring_picture(path: str, ring_scale: float, zoom: int) -> Image.Image:
    """A PICTURE of the silhouette at ring size: the canvas shrunk by the
    gate's own reported scale, thresholded, then blown back up with nearest
    so the blocks a ring pixel actually is are visible. Not a measurement."""
    a = np.asarray(Image.open(path).convert("RGBA"))
    h, w = a.shape[:2]
    rw, rh = max(1, round(w * ring_scale)), max(1, round(h * ring_scale))
    cov = np.asarray(Image.fromarray((a[..., 3] > 0).astype(np.uint8) * 255, "L")
                     .resize((rw, rh), Image.BOX))
    m = (cov > 127).astype(np.uint8) * 255
    return Image.fromarray(m, "L").convert("RGB").resize((rw * zoom, rh * zoom), Image.NEAREST)


def wrap(text: str, fnt, width: int, lines: int) -> list[str]:
    """Greedy wrap to `lines` lines that each fit `width`, ellipsis on the
    last. A caption that runs into the next column is a caption nobody can
    read, which is the whole job of this sheet."""
    words, out, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if fnt.getlength(t) <= width or not cur:
            cur = t
        else:
            out.append(cur)
            cur = w
            if len(out) == lines:
                break
    if len(out) < lines and cur:
        out.append(cur)
    if len(out) == lines and len(" ".join(out)) < len(text):
        last = out[-1]
        while last and fnt.getlength(last + "...") > width:
            last = last[:-1]
        out[-1] = last + "..."
    return out[:lines]


def load_fit(path: str, box: tuple[int, int]) -> Image.Image | None:
    if not os.path.exists(path):
        return None
    im = Image.open(path).convert("RGBA")
    s = min(box[0] / im.width, box[1] / im.height)
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)


def main() -> int:
    table = json.load(open(TABLE, encoding="utf-8"))
    rows = [r for r in table["shapes"] if r["slot"] in ("torso", "arm")]

    # GATE THIS LANE'S TWO SLOTS, AND ONLY THOSE. .bots-preview/sd-shapes2 is
    # wave two's shared tray and the head lane is installing 117 files into
    # parts/head of it while this runs; a verdict taken over the whole tree
    # would report their work in progress as this sheet's result. The brief
    # asks for the torso set and the arm set, separately, so the catalogue
    # gated here is a copy of exactly those two folders.
    with tempfile.TemporaryDirectory() as mine:
        for slot in ("torso", "arm"):
            shutil.copytree(os.path.join(PARTS, slot), os.path.join(mine, slot))
        g_all = gate(mine, TABLE)
    res = {r["slot"]: r for r in g_all["results"]}
    scale = g_all["ringScale"]

    f_h1, f_h2, f_lab, f_num = font(30, True), font(19, True), font(16, True), font(14)
    GUT, PAD = 16, 22
    CW, CH = 210, 210          # the ruler cell
    MW = 100                   # a control map cell
    RINGZ = 3

    blocks = []
    for slot in ("torso", "arm"):
        ids = [r["id"] for r in rows if r["slot"] == slot]
        blocks.append((slot, ids, res[slot], pair_overlaps(slot, ids)))

    ncol = 1 + max(len(b[1]) for b in blocks)
    W = PAD * 2 + ncol * (CW + GUT) - GUT
    CANVAS = {"torso": (288, 264), "arm": (128, 280)}
    ring = {s2: ring_size(CANVAS[s2], scale, CW) for s2, _, _, _ in blocks}
    CAPL = 5                                   # caption lines under a column
    block_h = {s2: 20 + CH + 6 + MW + 6 + ring[s2][1] + 8 + CAPL * 18 + 26 for s2, _, _, _ in blocks}
    H = 82 + sum(30 + block_h[s2] for s2, _, _, _ in blocks) + 30         + len(blocks) * (20 + 7 * 19 + 10) + PAD

    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 64], fill=(27, 28, 32))
    d.text((PAD, 14), "BATTLE BOTS: THE BODY SHAPE TABLE, GATED BEFORE ANY GPU WAS SPENT",
           font=f_h1, fill=(255, 255, 255))
    d.text((PAD, 46),
           f"outline overlap per slot at ring size (a bot stands {g_all['ringBotH']} px, so a contract "
           f"canvas shrinks by {scale:.4f}).  bars: closest pair under {g_all['pairBar']:.2f}, "
           f"typical pair under {g_all['medianBar']:.2f}.  every number here is "
           f"scripts/bots-lookalike-check.mts's own, run on the torso set and the arm set.",
           font=f_num, fill=DIM)

    y = 82
    for slot, ids, r, pairs in blocks:
        ok = r["closest"]["overlap"] < g_all["pairBar"] and r["median"] < g_all["medianBar"]
        d.text((PAD, y), f"{slot.upper()}  {r['n']} shapes", font=f_h2, fill=INK)
        d.text((PAD + 150, y + 2),
               f"closest pair {r['closest']['a']} / {r['closest']['b']} at {r['closest']['overlap']:.3f} "
               f"({(1 - r['closest']['overlap']) * 100:.1f} pixels in 100 apart)   "
               f"typical pair {r['median']:.3f}   furthest {r['furthest']['overlap']:.3f}   "
               f"the slot reads as {r['distinct']} of {r['n']} shapes",
               font=f_num, fill=GOOD if ok else WARN)
        y += 30

        cells = [("LIVE " + slot + " t1-1", LIVE[slot], None)] + [
            (next(x["name"] for x in rows if x["id"] == i), os.path.join(PARTS, slot, i + ".png"), i)
            for i in ids]
        worst = {i: max(o for o, a, b in pairs if i in (a, b)) for i in ids}

        for c, (label, path, key) in enumerate(cells):
            x = PAD + c * (CW + GUT)
            d.text((x, y), label, font=f_lab, fill=INK if key else DIM)
            yy = y + 20
            d.rectangle([x, yy, x + CW, yy + CH], fill=PANEL)
            im = load_fit(path, (CW - 8, CH - 8))
            if im:
                img.paste(im, (x + (CW - im.width) // 2, yy + (CH - im.height) // 2), im)
            yy += CH + 6
            for mi, mname in enumerate(("depth", "lineart")):
                mx = x + mi * (MW + 6)
                d.rectangle([mx, yy, mx + MW, yy + MW], fill=(24, 25, 28))
                mp = os.path.join(CTL, key or "", f"{mname}.png") if key else ""
                mm = load_fit(mp, (MW - 4, MW - 4)) if key else None
                if mm:
                    img.paste(mm.convert("RGB"), (mx + (MW - mm.width) // 2, yy + (MW - mm.height) // 2))
                d.text((mx + 3, yy + MW - 16), mname, font=f_num, fill=DIM)
            yy += MW + 6
            rw, rh, rz = ring[slot]
            d.rectangle([x, yy, x + CW, yy + rh], fill=(16, 16, 18))
            if key:
                rp = ring_picture(os.path.join(PARTS, slot, key + ".png"), scale, rz)
                img.paste(rp, (x + (CW - rp.width) // 2, yy))
                d.text((x + 3, yy + rh - 16), f"ring size x{rz}", font=f_num, fill=(120, 124, 134))
            yy += rh + 6
            if key:
                row = next(x2 for x2 in rows if x2["id"] == key)
                for bi, (k, v) in enumerate(row["ratios"].items()):
                    d.text((x, yy + bi * 18), f"{k} {v}", font=f_num, fill=DIM)
                yy2 = yy + 3 * 18
                d.text((x, yy2), f"closest sibling {worst[key]:.3f}", font=f_num,
                       fill=GOOD if worst[key] < g_all["pairBar"] else WARN)
                for li, ln in enumerate(wrap(row["notes"], f_num, CW - 2, 1)):
                    d.text((x, yy2 + 18 + li * 18), ln, font=f_num, fill=DIM)
            else:
                for li, ln in enumerate(wrap("the shipped part, for comparison; not a row in the table",
                                             f_num, CW - 2, 2)):
                    d.text((x, yy + li * 18), ln, font=f_num, fill=DIM)
        y += block_h[slot]

    d.text((PAD, y), "EVERY PAIR, MEASURED BY THE GATE (a two-file catalogue per pair)",
           font=f_h2, fill=INK)
    y += 26
    for slot, ids, r, pairs in blocks:
        d.text((PAD, y), slot, font=f_lab, fill=INK)
        y += 20
        # (six pairs per slot; the block height above reserves seven lines)
        for o, a, b in pairs:
            d.text((PAD + 18, y), f"{o:.4f}", font=f_num, fill=GOOD if o < g_all["pairBar"] else WARN)
            d.text((PAD + 84, y), f"{a} / {b}", font=f_num, fill=DIM)
            d.text((PAD + 300, y), f"{(1 - o) * 100:.1f} pixels in 100 apart", font=f_num, fill=DIM)
            y += 19
        y += 10

    img.save(OUT)
    print(f"wrote {os.path.relpath(OUT, REPO)}  ({img.width}x{img.height})")
    for slot, ids, r, pairs in blocks:
        print(f"  {slot}: closest {r['closest']['overlap']:.3f} "
              f"({r['closest']['a']} / {r['closest']['b']}), typical {r['median']:.3f}, "
              f"{r['distinct']} of {r['n']} shapes")
    print(f"  gate verdict: {'PASS' if g_all['pass'] else 'FAIL'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
