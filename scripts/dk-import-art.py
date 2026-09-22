#!/usr/bin/env python3
"""
DOMAIN KITCHEN AI ART IMPORTER (M11, Track A).

Takes a raw AI generation (a piece painted on a solid near-white ground),
cuts it, registers it onto the exact canvas the renderer expects, validates
it hard, quantizes it, and writes it into public/chef-art. The judging loop
stays dk-preview -> dk-shot -> dk-art-check; this tool only makes "drop the
raw file in the right place" a one-liner that cannot silently ship a
mis-registered or overweight sprite.

THE FLOOD-FILL LAW (from scripts/s7-key-white.py, recovered in S7): key ONLY
near-white pixels connected to the image BORDER. A chroma-key would eat the
tablecloth, the plates and every white highlight; border-connected flood fill
cannot reach them.

REGISTRATION BY MATCHING: img2img keeps the source silhouette, so the surest
way to land the cut at the right size and anchor is to align its bounding box
with the ORIGINAL procedural piece's bounding box. No eyeballing, no per-piece
offsets; --anchor-shift exists for the rare manual nudge.

  python scripts/dk-import-art.py --in raw.png --theme trattoria --piece table
  python scripts/dk-import-art.py --in raw.png --theme trattoria --piece floor --mode floor
  ... --dry            judge without writing
  ... --no-quant       skip palette quantization (debugging only)

Contract dims (@2x, from _engine/iso.ts, duplicated here the same way
dk-preview.mjs duplicates them):
  furn 192x224 anchor (96,208) | counter 320x240 anchor (208,216)
  rug 256x128 | doormat/floor 128x64 | dishes 96x64 | char cell 128x128
"""

import argparse, os, sys
from collections import deque
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "public", "chef-art", "room")
# the pre-AI procedural art commit: the immutable registration ruler
BASELINE = "a953fbe"

# piece -> (canvas w, canvas h). Anchor math only matters for furn/counter;
# everything else fills or centers.
CONTRACT = {
    "table": (192, 224), "chair": (192, 224), "stove": (192, 224),
    "plant": (192, 224), "bench": (192, 224), "toilet": (192, 224),
    "toilet-broken": (192, 224),
    # trash is a small floor splat, not standing furniture
    "trash": (128, 64),
    "counter": (320, 240),
    "rug": (256, 128), "doormat": (128, 64), "dishes": (96, 64),
    "floor": (128, 64), "floor-alt": (128, 64),
}

def die(msg):
    print(f"FAIL  {msg}")
    sys.exit(1)

def flood_key(im, tol):
    """Border-connected near-white -> transparent. Never touches interior whites."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()
    def near_white(p):
        # Background AND the faint gray halos the model paints despite "no
        # shadows" are NEUTRAL (r~g~b); the clay style's cream furniture is
        # WARM (channel spread 15-35). Brightness alone cannot separate them
        # (both live around 238-252), saturation can. Measured on anchor B:
        # tol 18 ate the rug (0.62 -> 0.08 coverage), tol 7 kept the halos.
        r, g, b = p[0], p[1], p[2]
        bright = r >= 255 - tol and g >= 255 - tol and b >= 255 - tol
        neutral = max(r, g, b) - min(r, g, b) <= 12
        return bright and neutral
    for x in range(w):
        for y in (0, h - 1):
            if near_white(px[x, y]) and not seen[y * w + x]:
                seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near_white(px[x, y]) and not seen[y * w + x]:
                seen[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and near_white(px[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return im

def feather(im):
    """1px alpha feather so the cut edge does not read as a paper sticker."""
    a = im.getchannel("A").filter(ImageFilter.GaussianBlur(0.7))
    im.putalpha(a)
    return im

def bbox_of(im):
    """
    The registration bbox, measured on a DENOISED alpha. One stray un-keyed
    background speck anywhere in the frame inflates a raw bbox to the whole
    canvas, and scale-to-fit then shrinks the real object to a fraction of its
    footprint (measured: every anchor-B piece collapsing to ~30% coverage from
    exactly this). A 5px erosion cannot survive isolated specks but leaves any
    real object's box within 2px; the CUT keeps its full un-eroded alpha.
    """
    a = im.getchannel("A").filter(ImageFilter.MinFilter(5))
    b = a.getbbox()
    if not b:
        b = im.getchannel("A").getbbox()
    if not b:
        die("nothing survived the key: the cut is empty (wrong --tolerance or a non-white ground?)")
    return b

def coverage(im):
    a = im.getchannel("A").getdata()
    op = sum(1 for v in a if v > 8)
    return op / (im.width * im.height)



CELL = 128
FEET_Y = 116
FEET_TOL = 4


def char_feet(f):
    """
    Feet measured on a DENOISED alpha. remove_bg leaves 1px semi-transparent
    dregs along cell edges; a raw bbox reads those as the feet (measured: a
    frame with true feet at 117 reporting 127, then getting "corrected" 11px
    into the floor). MinFilter(3) cannot survive a 1px line; real feet lose at
    most a pixel, inside FEET_TOL.
    """
    a = f.getchannel("A").point(lambda v: v if v >= 24 else 0).filter(ImageFilter.MinFilter(3))
    b = a.getbbox()
    if not b:
        b = f.getchannel("A").getbbox()
    return b

def import_char(args):
    """
    Slice a repainted character sheet back into 128px animation strips.

    LAW: no per-frame bbox rescale. Each generated cell is downscaled as a
    whole and lands at its own cell position, so whatever tiny drift the model
    introduced stays WITHIN a cell and never compounds into frame-to-frame
    jitter. The feet line is validated instead: a walk cycle whose feet bounce
    more than FEET_TOL px would read as hopping, so it hard-fails here rather
    than shipping.
    """
    if not (args.variant and args.anims):
        die("char mode needs --variant and --anims")
    anims = []
    for part in args.anims.split(","):
        n, c = part.split(":")
        anims.append((n, int(c)))
    total = sum(c for _, c in anims)
    cols = args.cols
    rows = (total + cols - 1) // cols

    raw = Image.open(args.src).convert("RGBA")
    # normalize to the exact grid the prep sheet used
    raw = raw.resize((cols * 512, rows * 512), Image.LANCZOS)
    keyed = raw if args.bg == "alpha" else feather(flood_key(raw, args.tolerance))

    frames = []
    for i in range(total):
        x = (i % cols) * 512
        y = (i // cols) * 512
        cell = keyed.crop((x, y, x + 512, y + 512)).resize((CELL, CELL), Image.LANCZOS)
        frames.append(cell)

    # ── feet snap ──────────────────────────────────────────────────────────
    # The character baker's own law: feet sit at EXACTLY y=116 in every frame;
    # the walk bob lives in the body, never the feet (BASE=116 in
    # dk-bake-chars.mjs). So the correct normalization is per-frame: translate
    # each frame so its lowest opaque row is 116. This replaced two failed
    # subtler schemes (per-sheet and per-row medians) — the model's size drift
    # is not consistent along any axis, and it does not need to be, because
    # the contract never asked feet to carry motion in the first place. If a
    # shift would push a head off the top, that frame downscales about its
    # feet first.
    for i, f in enumerate(frames):
        b = char_feet(f)
        if not b:
            die(f"frame {i} came back empty after the key")
        feet = b[3] - 1
        dy = FEET_Y - feet
        if dy == 0:
            continue
        top = b[1]
        if top + dy < 0:
            factor = FEET_Y / max(1, feet - top)
            size = max(1, round(CELL * factor))
            small = f.resize((size, size), Image.LANCZOS)
            # denoised, like every other feet read: the raw bbox sees the same
            # 1px remove_bg dregs here and places the frame 10px too high
            sb = char_feet(small)
            c = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            c.paste(small, ((CELL - size) // 2, FEET_Y - (sb[3] - 1)), small)
            frames[i] = c
        else:
            c = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            c.paste(f, (0, dy), f)
            frames[i] = c

    # validation AFTER normalization: residual spread must be motion-safe
    bad = []
    for i, f in enumerate(frames):
        b = char_feet(f)
        if not b:
            die(f"frame {i} vanished in normalization")
        feet = b[3] - 1
        if abs(feet - FEET_Y) > FEET_TOL:
            bad.append((i, feet))
    if bad:
        die(f"feet line off on frames {bad} (want {FEET_Y}±{FEET_TOL}): would jitter in motion")

    outdir = os.path.join(ROOT, "public", "chef-art", "_raw", "strips", args.variant)
    os.makedirs(outdir, exist_ok=True)
    k = 0
    for name, count in anims:
        strip = Image.new("RGBA", (CELL * count, CELL), (0, 0, 0, 0))
        for j in range(count):
            strip.paste(frames[k], (j * CELL, 0), frames[k])
            k += 1
        if not args.no_quant:
            strip = strip.quantize(256, method=Image.Quantize.FASTOCTREE).convert("RGBA")
        strip.save(os.path.join(outdir, f"{name}.png"))
    print(f"ok    {args.variant}: {total} frames -> {outdir}")
    print(f"      rebuild: node scripts/dk-atlas.mjs")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--theme", required=True)
    ap.add_argument("--piece", default="table", choices=sorted(CONTRACT))
    ap.add_argument("--mode", default="auto", choices=["auto", "floor", "char"])
    ap.add_argument("--variant", help="char mode: strips dir name, e.g. chef0")
    ap.add_argument("--anims", help="char mode: name:frames list, e.g. idle_b:2,walk_f:4,walk_b:4,cook:2")
    ap.add_argument("--cols", type=int, default=4, help="char mode: sheet grid columns")
    ap.add_argument("--tolerance", type=int, default=18)
    ap.add_argument("--bg", default="key", choices=["key", "alpha"], help="alpha: the source already carries transparency (model-side remove_bg); skip the flood key")
    ap.add_argument("--anchor-shift", default="0,0")
    ap.add_argument("--no-quant", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--force", action="store_true", help="judge a failing cut: print validation failures instead of dying (only with --dry)")
    args = ap.parse_args()

    if args.mode == "char":
        import_char(args)
        return

    cw, ch = CONTRACT[args.piece]
    dst = os.path.join(ART, args.theme, f"{args.piece}.png")
    # Register and validate against the COMMITTED procedural baseline, never
    # the file on disk. The disk copy is whatever the last import wrote, so
    # using it as the ruler means every import moves the ruler: a tol-7 pass
    # that kept white halo boxes inflated "original coverage", and the next,
    # properly keyed import then failed against those inflated numbers.
    import subprocess
    rel = f"public/chef-art/room/{args.theme}/{args.piece}.png"
    try:
        blob = subprocess.run(
            ["git", "show", f"{BASELINE}:{rel}"],
            cwd=ROOT, capture_output=True, check=True
        ).stdout
        import io as _io
        orig = Image.open(_io.BytesIO(blob)).convert("RGBA")
    except subprocess.CalledProcessError:
        if not os.path.exists(dst):
            die(f"no baseline {BASELINE}:{rel} and no file on disk")
        orig = Image.open(dst).convert("RGBA")
    if orig.size != (cw, ch):
        die(f"original is {orig.size}, contract says {(cw, ch)} — check CONTRACT")

    raw = Image.open(args.src)

    if args.mode == "floor" or args.piece.startswith("floor"):
        # A seamless square texture, affine-projected onto the 2:1 diamond and
        # masked by the ORIGINAL floor tile's alpha, so tiling geometry is
        # guaranteed by construction rather than asked of the model.
        tex = raw.convert("RGBA").resize((cw, cw), Image.LANCZOS)
        # squash to the diamond's height, then rotate the grain 45deg is wrong
        # for dimetric: the original tile already IS the projection, so we
        # project by plain vertical squash which preserves the seams.
        proj = tex.resize((cw, ch), Image.LANCZOS)
        out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        out.paste(proj, (0, 0), orig.getchannel("A"))
    else:
        cut = raw.convert("RGBA") if args.bg == "alpha" else feather(flood_key(raw, args.tolerance))
        cb = bbox_of(cut)
        ob = bbox_of(orig)
        cut = cut.crop(cb)
        ow, oh = ob[2] - ob[0], ob[3] - ob[1]
        scale = min(ow / cut.width, oh / cut.height)
        cut = cut.resize((max(1, round(cut.width * scale)), max(1, round(cut.height * scale))), Image.LANCZOS)
        dx, dy = (int(v) for v in args.anchor_shift.split(","))
        # align: same center-x as the original's bbox, same BOTTOM (the ground
        # contact line is what registration is about)
        px = ob[0] + (ow - cut.width) // 2 + dx
        py = ob[3] - cut.height + dy
        out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        out.paste(cut, (px, py), cut)

    # ── hard validation ────────────────────────────────────────────────────
    if out.size != (cw, ch):
        die(f"output is {out.size}, contract {(cw, ch)}")
    edge = out.crop((0, 0, cw, 1)).getchannel("A").getextrema()[1]
    edge = max(edge, out.crop((0, ch - 1, cw, ch)).getchannel("A").getextrema()[1]) if args.mode != "floor" and not args.piece.startswith("floor") else 0
    if edge > 8:
        die("opaque pixels touch the canvas edge: the piece is clipped or oversized")
    cov, ocov = coverage(out), coverage(orig)
    if not (ocov * 0.55 <= cov <= min(1.0, ocov * 1.8)):
        msg = f"coverage {cov:.2f} vs original {ocov:.2f}: cut looks wrong (empty, doubled, or un-keyed)"
        if args.force and args.dry:
            print(f"warn  {msg}")
        else:
            die(msg)

    if not args.no_quant:
        out = out.quantize(256, method=Image.Quantize.FASTOCTREE).convert("RGBA")

    before = os.path.getsize(dst)
    if args.dry:
        tmp = os.path.join(os.path.dirname(args.src), f"_import-{args.piece}.png")
        out.save(tmp)
        print(f"ok    DRY  {args.piece} -> {tmp} ({os.path.getsize(tmp):,}b, was {before:,}b, coverage {cov:.2f})")
    else:
        out.save(dst)
        after = os.path.getsize(dst)
        theme_total = sum(
            os.path.getsize(os.path.join(ART, args.theme, f))
            for f in os.listdir(os.path.join(ART, args.theme)) if f.endswith(".png")
        )
        print(f"ok    {args.piece} -> {dst}")
        print(f"      {before:,}b -> {after:,}b · theme total {theme_total/1024:.0f}KB (warn 4MB, fail 6MB boot-wide)")
    print(f"      judge: node scripts/dk-preview.mjs --theme {args.theme} --only {args.piece}")

if __name__ == "__main__":
    main()
