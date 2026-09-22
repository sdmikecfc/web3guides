"""BATTLE BOTS / stable-diffusion lane C: THE STYLE SET.

    python scripts/sd/bots-sd-stylecut.py              # cut, caption, contact sheet
    python scripts/sd/bots-sd-stylecut.py --report     # measure only, write nothing

Cuts a training and reference set out of the concept scenes, writes one .txt
caption beside each crop, and reports the ONE number that decides what the set
can be used for: native resolution. The RAW crops land here; the cleaned
references the IP-Adapter is actually fed (background removed, on a flat
neutral plate, square) are made from them by scripts/sd/bots-sd-stylerefs.py
into art-src/sd/style/clean, which reads this file's index.json for the boxes.

── WHERE THE CROPS COME FROM, AND WHY ─────────────────────────────────────
art-src/bots/concept/6-shop.png is a parts shelf. Four shelf boards carrying,
top to bottom, torsos with wind-up keys and a row of weapons, a row of arms, a
row of TEN heads seen dead-on, and a row of feet. It is the single most useful
image we own for this lane, because it is already the composition we want to
generate: separate parts, one camera, one light, one scale, on a plain ground.
The rows are found by density rather than typed in, because a shelf of ten
heads is ten chances to mistype a rectangle.

The shelf crops this file detects on the arm, foot, torso and weapon rows are
RAW MATERIAL only (2026-09-05): those rows stand in touching pairs and the
top shelf's background is the bright shop window, so arm-shelfNN and
leg-shelfNN each hold two or three parts and a slice of a neighbour, and
torso-shelf01 is the arm hanging beside the blue torso, not the torso. The
clean limb, torso and weapon references carry their OWN boxes, authored in
bots-sd-stylerefs.py and named for what they are (arm-coral, leg-boot-red,
weapon-hammer). Do not tune the detector to split the pairs; the authored
table over there is the source of truth for those slots, and the head row,
which stands apart, is the one this detector serves.

art-src/bots/anchors/B1.png and B2.png are the OLD anchors and are NOT cut
any more (2026-09-05): the concept art is the law, and anything named b1 in
the style folder was deleted for the same reason. The first version of this
file cut eleven crops off B1 because it was 2048 square and a head off it was
450 px native; that was the right size argument for a LoRA and the wrong
picture. B1 carries a brass bolt at each shoulder and each hip and brass
bezels round both eyes, the JOIN law deletes every ring, cup, collar and bolt
from every joint, and a style reference that argues for bolts on every render
it touches undoes the one structural decision this rebuild is built on. The
hero bot in 2-build.png is 750 x 980 native, which is plenty for an adapter
(CLIP sees 224) and enough for a LoRA at 512, so nothing was lost.

── THE HERO CROPS ARE AUTHORED, AND THE FIRST ONES WERE WRONG ─────────────
The first version put the 2-build hero at (0.11, 0.05, 0.36, 0.75): that box
is the garage wall and a barrel, with the bot's left arm and its key at the
right edge, and its head crop was pure wall. The boxes below were re-measured
off the scene on 2026-09-05 and previewed before being written down. If a
scene is ever re-rendered, re-measure; do not trust these numbers on a new
picture.

── WHAT THE SET IS ACTUALLY FOR ───────────────────────────────────────────
Two different consumers with two different resolution needs:

  IP-ADAPTER (or any inference-time style reference) encodes the reference
  through CLIP at 224 x 224. Every crop here clears that with room, so the
  whole set is usable and no training happens at all. Prefer this first: it
  costs nothing, it iterates in seconds, and it does not train anything on
  another vendor's model output (see the licence note at the bottom).

  A LoRA trains at 512 or 768. A crop smaller than the training resolution is
  upscaled, and a LoRA trained on upscaled crops learns the upscaling. So the
  script reports the native size of every crop and splits the set at 320 px:
  the big half is the honest LoRA set, the whole set is the adapter set.

── LICENCE, AND THIS ONE NEEDS A HUMAN ────────────────────────────────────
Every image here was produced by seedream_v5_pro through Higgsfield. Using one
vendor's model outputs to TRAIN another model is the clause that generative
image ToS most often restricts, and it is not a question this script can
answer. Feeding the same images to an IP-Adapter at inference time is not
training and does not touch that clause. So: adapter first, and get the
training question answered by a person before any LoRA is trained on these.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d, label

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONCEPT = os.path.join(ROOT, "art-src", "bots", "concept")
ANCHORS = os.path.join(ROOT, "art-src", "bots", "anchors")
OUT = os.path.join(ROOT, "art-src", "sd", "style")

LORA_MIN = 320          # native px below which a crop only earns its place in the adapter set
PAD = 0.06              # breathing room round a detected box, as a share of its size

# ── the shop shelf, found by density ───────────────────────────────────────
# Row bands measured off the foreground-density profile of 6-shop.png, which
# drops to under 0.05 across each shelf board: boards at y 500-570, 800-880 and
# 1120-1200. The bands below sit inside the gaps.
SHELF_BANDS = {
    "torso":  (150, 500,  150, 420),
    "arm":    (575, 795,  110, 300),
    "head":   (890, 1115, 130, 260),
    "leg":    (1210, 1480, 110, 320),
}
# The cabinet's own timber frame is bright warm wood and passes the foreground
# test, so it is detected as an object at both ends of every row. Everything
# outside this column range is cabinet.
SHELF_X = (200, 2500)
# The top shelf runs torsos on the left and a rack of weapons on the right; one
# density band cannot tell them apart, and this is where they change over.
SHELF_WEAPON_X = 1900
# Every item on the shelf stands on a turned wooden plinth with a price tag on
# it. The plinth is shop dressing, not the part, and an adapter fed a plinth
# will happily put one under a generated arm. Keep the top of each box.
SHELF_KEEP_TOP = {"torso": 0.80, "arm": 0.74, "head": 0.72, "leg": 0.84}

# ── the hero figures, authored ─────────────────────────────────────────────
# Big crops off big images. Authored rather than detected because there is one
# subject per frame and a detector would only find the one thing already known.
# Coordinates are fractions of the source, so they survive a re-render at a
# different size. The anchors (B1, B2) are deliberately absent: see the header.
AUTHORED: dict[str, list] = {}
HERO = {
    # the hero on the scissor lift: whole figure with its key, and its head
    # (ear cup to ear cup, crown to grille). Measured 2026-09-05.
    "2-build.png": [("bot", (0.275, 0.115, 0.550, 0.755)), ("head", (0.315, 0.115, 0.540, 0.375)),
                    ("tray", (0.51, 0.42, 0.88, 0.70))],
    # 1-garage and 5-street are scenes, not parts: no crop off them shows a
    # part at a usable size, and a set diorama is not what the sweep generates.
    # the mint bot swinging its hammer, crowd behind it (removed by stylerefs)
    "3-arena.png": [("bot", (0.225, 0.195, 0.515, 0.775))],
    # the winner, arms up, confetti round it (removed by stylerefs)
    "4-knockout.png": [("bot", (0.350, 0.330, 0.540, 0.715))],
}

# ── captions ───────────────────────────────────────────────────────────────
# Tag-style, comma separated, trigger token first: the phrasing SD-family text
# encoders were trained on and the phrasing kohya expects for a LoRA. Each one
# names the SUBJECT, the VIEW, the FINISH and the LIGHT, because those are the
# four things the sweep needs to be able to ask for and vary independently.
TRIGGER = "bbclay"
FINISH = ("designer vinyl toy finish, slightly glossy moulded clay, crisp clean seams, "
          "soft rounded forms, no sharp edges")
LIGHT = "one soft key light from directly above, gentle cool shadow underneath, centred highlight"

CAPTION = {
    "bot": "a small wind-up robot toy, whole figure, standing, dead-on front view, "
           "big round head wider than its body, two round lamp eyes, a slatted grille mouth, "
           "stubby arms, stubby legs, big rounded feet, a brass wind-up key on the body",
    "head": "a robot toy HEAD alone, dead-on front view, rounded dome crown, wider than it is tall, "
            "two big round lamp eyes, a dark slatted grille mouth, a low wide lug on each side, "
            "the underside is a dome and is not cut flat",
    "face": "the face of a robot toy, dead-on front view, two big round lamp eyes with a bezel ring, "
            "a dark slatted grille mouth",
    "eye": "the eye of a robot toy, a round glass lamp lens with a metal bezel ring, "
           "the lens is the brightest thing on the whole toy",
    "torso": "a robot toy TORSO alone, dead-on front view, wider than it is tall, rounded barrel form, "
             "a single brass wind-up key and nothing else made of metal",
    "key": "a brass wind-up key on a robot toy body, a figure-eight handle and a small shaft, "
           "the only metal piece on the whole toy",
    "arm": "a robot toy ARM alone, one stubby limb, dead-on side-on view, straight up and down, "
           "a plain rounded cap at the shoulder end, a simple rounded hand at the other, "
           "no ball joint and no socket and no collar and no bolt",
    "hand": "the hand of a robot toy, a simple rounded mitt, no separate fingers",
    "leg": "a robot toy LEG alone, one stubby limb, dead-on front view, straight up and down, "
           "a plain rounded cap at the hip end, a big rounded shoe at the bottom, "
           "no ball joint and no socket and no collar and no bolt",
    "foot": "the foot of a robot toy, a big rounded shoe, coral coloured, seen dead-on from the front",
    "weapon": "a tiny toy hammer prop for a robot toy, seen side-on, a plain handle and a blunt head",
    "tray": "a metal tray of loose robot toy parts, heads and torsos and feet laid out separately",
    "bay": "a miniature garage workshop diorama with a small robot toy on a scissor lift",
}
# Anything the caption should name so a LoRA binds it to a word rather than to
# the style itself. Empty now that the bolted anchors are out of the set; kept
# as the hook, because the next source with a defect to name goes here.
DISCLAIM: dict[str, str] = {}


def foreground(a: np.ndarray) -> np.ndarray:
    mx, mn = a.max(2), a.min(2)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return (mx > 0.30) & (s > 0.22)


def split_runs(profile: np.ndarray, x0: int, x1: int, minw: int, maxw: int) -> list[tuple[int, int]]:
    """Cut one wide run at its deepest interior minima until every piece fits.

    The head row separates on its own because the heads do not touch. The torso
    and foot rows do touch, so a plain threshold gives one run 1,700 px wide.
    Cutting at the deepest minimum and recursing splits them where the picture
    itself is darkest, which is the gap between two objects.
    """
    if x1 - x0 <= maxw:
        return [(x0, x1)] if x1 - x0 >= minw else []
    lo = x0 + minw // 2
    hi = x1 - minw // 2
    if hi <= lo:
        return [(x0, x1)]
    cut = lo + int(np.argmin(profile[lo:hi]))
    return split_runs(profile, x0, cut, minw, maxw) + split_runs(profile, cut, x1, minw, maxw)


def shelf_boxes(a: np.ndarray) -> list[tuple[str, tuple[int, int, int, int]]]:
    fg = foreground(a)
    out = []
    for slot, (y0, y1, minw, maxw) in SHELF_BANDS.items():
        band = fg[y0:y1]
        cols = gaussian_filter1d(band.mean(0).astype(float), 5)
        on = cols > cols.max() * 0.28
        on[:SHELF_X[0]] = False
        on[SHELF_X[1]:] = False
        lab, n = label(on)
        for i in range(1, n + 1):
            xs = np.where(lab == i)[0]
            if xs.size < 40:
                continue
            for bx0, bx1 in split_runs(cols, int(xs.min()), int(xs.max()), minw, maxw):
                sub = band[:, bx0:bx1]
                rows = np.where(sub.any(axis=1))[0]
                if rows.size < 30:
                    continue
                iy0, iy1 = y0 + int(rows.min()), y0 + int(rows.max())
                iy1 = iy0 + int((iy1 - iy0) * SHELF_KEEP_TOP.get(slot, 1.0))
                name = "weapon" if (slot == "torso" and bx0 >= SHELF_WEAPON_X) else slot
                out.append((name, (bx0, iy0, bx1, iy1)))
    return out


def pad_box(b, w, h, pad=PAD):
    x0, y0, x1, y1 = b
    dx, dy = int((x1 - x0) * pad), int((y1 - y0) * pad)
    return (max(0, x0 - dx), max(0, y0 - dy), min(w, x1 + dx), min(h, y1 + dy))


def caption_for(slot: str, source: str) -> str:
    body = CAPTION.get(slot, f"a robot toy {slot}")
    bits = [TRIGGER, body, FINISH, LIGHT]
    if source in DISCLAIM:
        bits.append(DISCLAIM[source])
    if source == "6-shop.png":
        bits.append("on a dark wooden shop shelf")
    else:
        bits.append("plain background")
    return ", ".join(bits)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="measure, write nothing")
    args = ap.parse_args()

    jobs: list[tuple[str, str, str, tuple[int, int, int, int]]] = []

    shop = os.path.join(CONCEPT, "6-shop.png")
    a = np.asarray(Image.open(shop).convert("RGB")).astype(float) / 255
    h, w = a.shape[:2]
    counts: dict[str, int] = {}
    for slot, b in shelf_boxes(a):
        counts[slot] = counts.get(slot, 0) + 1
        jobs.append((shop, "6-shop.png", f"{slot}-shelf{counts[slot]:02d}", pad_box(b, w, h)))

    for fname, specs in AUTHORED.items():
        p = os.path.join(ANCHORS, fname)
        iw, ih = Image.open(p).size
        for slot, (fx0, fy0, fx1, fy1) in specs:
            jobs.append((p, fname, f"{slot}-{fname[:2].lower()}",
                         (int(fx0 * iw), int(fy0 * ih), int(fx1 * iw), int(fy1 * ih))))
    for fname, specs in HERO.items():
        p = os.path.join(CONCEPT, fname)
        iw, ih = Image.open(p).size
        for slot, (fx0, fy0, fx1, fy1) in specs:
            jobs.append((p, fname, f"{slot}-{fname.split('-')[0]}",
                         (int(fx0 * iw), int(fy0 * ih), int(fx1 * iw), int(fy1 * ih))))

    if not args.report:
        os.makedirs(OUT, exist_ok=True)
    recs = []
    thumbs = []
    for path, source, name, box in jobs:
        im = Image.open(path).convert("RGB").crop(box)
        native = min(im.size)
        slot = name.split("-")[0]
        rec = {"name": name, "slot": slot, "source": source, "box": list(box),
               "size": list(im.size), "native": native,
               "set": "lora+adapter" if native >= LORA_MIN else "adapter",
               "caption": caption_for(slot, source)}
        recs.append(rec)
        if not args.report:
            im.save(os.path.join(OUT, name + ".png"))
            with open(os.path.join(OUT, name + ".txt"), "w", encoding="utf-8") as f:
                f.write(rec["caption"] + "\n")
        t = im.copy()
        t.thumbnail((190, 190))
        thumbs.append((name, native, t))

    by_slot: dict[str, list[int]] = {}
    for r in recs:
        by_slot.setdefault(r["slot"], []).append(r["native"])
    print(f"{len(recs)} crops")
    print(f"  {'slot':<8} {'n':>3}  {'native px (min side)':<26} for LoRA at 512")
    for slot in sorted(by_slot):
        v = sorted(by_slot[slot])
        big = sum(1 for x in v if x >= LORA_MIN)
        print(f"  {slot:<8} {len(v):>3}  {v[0]:>4} .. {v[-1]:<4} median {v[len(v) // 2]:<8} "
              f"{big} of {len(v)} at or over {LORA_MIN}px")
    big = [r for r in recs if r["native"] >= LORA_MIN]
    print(f"\n  adapter set (all):        {len(recs)} images, smallest side {min(r['native'] for r in recs)}px")
    print(f"  LoRA set (>= {LORA_MIN}px):     {len(big)} images, smallest side "
          f"{min((r['native'] for r in big), default=0)}px")
    print(f"  a style LoRA wants 20-100 images; a 512 crop upscaled from {LORA_MIN}px is 1.6x, "
          f"from 190px is 2.7x and teaches softness")

    if not args.report:
        with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
            json.dump({"trigger": TRIGGER, "loraMinPx": LORA_MIN, "crops": recs}, f, indent=1)
        cols = 8
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 200, rows * 200), (18, 18, 22))
        for i, (n, nat, t) in enumerate(thumbs):
            r, c = divmod(i, cols)
            sheet.paste(t, (c * 200 + (200 - t.width) // 2, r * 200 + (200 - t.height) // 2))
        sheet.save(os.path.join(OUT, "_contact.jpg"), quality=88)
        print(f"\nwritten to {os.path.relpath(OUT, ROOT)} (+ _contact.jpg, index.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
