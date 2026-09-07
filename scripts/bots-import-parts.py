"""Battle Bots: CUT ONE FINISHED TOY INTO FOUR PARTS, AND REGISTER THEM.

Reads  public/bots-art/_raw/bots/keyed/<family>.png   one whole toy, keyed
       public/bots-art/_raw/kits/skeleton.json        the plate's landmarks
       src/app/bots/_view/rig-points.ts               canvases and pivots
       scripts/bots-parts-manifest.json               family -> slot, tier, design
Writes public/bots-art/parts/<slot>/t<tier>-<design>.png

WHAT THIS FILE USED TO DO, and why none of it survived. It registered a part by
MEASURING BRASS on the contract points: every limb carried a brass ball at its
pivot, so finding the brass found the pivot. The contract that replaced it has
no brass on any contract point at all, because eight joints cropped out of
art-src/bots/concept/ carry no hardware of any kind. The old registration would
now find nothing and place every part on a guess.

THE ONE THING THAT MATTERS HERE, stated plainly. The previous wave's cutter
looked for the arm on a GUESSED vertical line, 12 px inboard of where it
believed the torso edge to be, and where it found nothing it substituted a
synthetic grey capsule. Four of seven bots came back that way, and the mixed
bots in the study were wearing fake arms; that is a large part of what read as
cheap. So this cutter never guesses and never substitutes. It finds the arm by
the magenta channel the plate deliberately opens between arm and body: on a row
across the arm's own span the ink falls into THREE runs, left arm, body, right
arm, and the middle one is the body. If the runs are not there, the bot is
refused and reported, not filled in.

THE THREE LAWS THE STUDY PROVED, all three implemented below:

 1. ONE SHARED SCALE. Every part of every family is scaled by the same factor,
    the one that takes this bot's own ink height to the contract's H. Eleven of
    twelve mixed bots read as one toy under this rule. Normalising each part
    into its own slot instead tore holes at the joins, so it is not offered.

 2. THE HEAD'S UNDERSIDE IS A DOME. Every collage failure in the study had a
    head cut flat at its widest row, which lays a straight bar across the chest.
    The head's buried skirt is drawn as an ellipse in the head's own edge
    colour, so the buried edge is curved whatever the pairing.

 3. NEUTRALISE THE WARM LIGHT ONCE PER BOT, NEVER PER PART. One gain triple,
    measured on the bot's clay only and applied to the whole bot. Per part, a
    leg that is mostly coral shoe lifts 1.41 against a head's 1.02 and the coral
    goes white, which is the accent that makes a mixed bot read as one toy.

WHAT IS SYNTHESISED, and it is only ever what the contract says is BURIED:
the head's skirt and the limbs' proximal caps. Both sit behind the body group
in the shipped draw order and are never visible on an assembled bot. Every
other pixel in every part is model pixels.

  python scripts/bots-import-parts.py                 # every family
  python scripts/bots-import-parts.py --family kettle # one
  python scripts/bots-import-parts.py --dry-run       # measure, write nothing
"""
import argparse, json, os, re, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYED = os.path.join(ROOT, "public", "bots-art", "_raw", "bots", "keyed")
KITS = os.path.join(ROOT, "public", "bots-art", "_raw", "kits")
PARTS = os.path.join(ROOT, "public", "bots-art", "parts")
RIG_TS = os.path.join(ROOT, "src", "app", "bots", "_view", "rig-points.ts")
MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bots-parts-manifest.json")


# ── the contract, read out of the shipped file ────────────────────────────
def load_contract():
    """RIG canvases and pivots, plus the FIGURE numbers the cut needs, parsed
    out of src/app/bots/_view/rig-points.ts. Never retyped here: a cutter that
    carries its own copy of the contract is a cutter that can place a part
    where nothing else expects it."""
    src = open(RIG_TS, encoding="utf-8").read()
    rig = {}
    for slot in ("head", "torso", "arm", "leg", "weapon"):
        m = re.search(r"\b%s:\s*\{([^}]*)\}" % slot, src)
        if not m:
            sys.exit(f"contract: no RIG.{slot} in rig-points.ts")
        d = {}
        for k, v in re.findall(r"(\w+):\s*(\[[^\]]*\]|-?[\d.]+)", m.group(1)):
            d[k] = json.loads(v)
        rig[slot] = d

    def num(name):
        m = re.search(r"^\s*%s:\s*(-?[\d.]+)," % name, src, re.M)
        if not m:
            sys.exit(f"contract: no FIGURE.{name} in rig-points.ts")
        return float(m.group(1))

    def band(name):
        m = re.search(r"\b%s:\s*\{\s*min:\s*(-?[\d.]+),\s*target:\s*(-?[\d.]+),\s*max:\s*(-?[\d.]+)" % name, src)
        if not m:
            sys.exit(f"contract: no band {name} in rig-points.ts")
        return dict(min=float(m.group(1)), target=float(m.group(2)), max=float(m.group(3)))

    join = {}
    jb = src[src.index("export const JOIN"):src.index("export const LIGHT")]
    for k, v in re.findall(r"(\w+):\s*([\d.]+),", jb):
        join[k] = float(v)
    return rig, num, band, join


RIG, FIG, BAND, JOIN = load_contract()
H_CONTRACT = FIG("H")
SKIRT = FIG("skirt")
MARGIN = FIG("margin")


# ── helpers ───────────────────────────────────────────────────────────────
def largest_component(alpha):
    """The toy, and nothing else. Two of the generations came back with a cast
    shadow painted onto the background; keyed, that is a second blob, and a
    bounding box taken over both puts every landmark in the wrong place."""
    lab, n = ndimage.label(alpha > 16)
    if n == 0:
        return None
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def runs(row):
    """[(start, end_exclusive), ...] of the True runs in a boolean row."""
    d = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def resample_rgba(im, size):
    """Resample with the colour of transparent pixels carried by their opaque
    neighbours. A straight LANCZOS on RGBA lets a transparent pixel's colour
    bleed into the edge, and on a keyed plate that colour is magenta."""
    a = np.asarray(im).astype(np.float32)
    al = a[:, :, 3:4] / 255.0
    prem = Image.fromarray(np.clip(a[:, :, :3] * al, 0, 255).astype(np.uint8)).resize(size, Image.LANCZOS)
    alr = Image.fromarray(a[:, :, 3].astype(np.uint8)).resize(size, Image.LANCZOS)
    p = np.asarray(prem).astype(np.float32)
    q = np.asarray(alr).astype(np.float32) / 255.0
    rgb = np.where(q[:, :, None] > 1e-3, p / np.maximum(q[:, :, None], 1e-3), 0)
    out = np.dstack([np.clip(rgb, 0, 255), np.asarray(alr)]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def hsv_of(rgb):
    a = rgb.astype(np.float32) / 255.0
    mx, mn = a.max(2), a.min(2)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return s, v


# ── 1. neutralise the warm render light, ONCE PER BOT ─────────────────────
def neutralise(rgb, ink):
    """One gain triple for the whole toy.

    The scene grade in the concept renders is warm, about R:G:B = 1.51:1.27:1.00,
    and the same mint clay reads across a 4:1 luminance range between scenes. Bake
    that warmth into a part and the eight runtime paint colours become eight muds.

    Measured on the CLAY ONLY. The coral shoes, the brass key, the lit eye lenses
    and the dark grille are fixed accents that do not vary by family, so including
    them would let a bot that happens to be mostly shoe pull its own body colour
    around. Clay is what is left after the four accents are excluded, and it is
    what the runtime repaints."""
    s, v = hsv_of(rgb)
    body = ink & (v > 0.30) & (v < 0.95) & (s < 0.32)
    if body.sum() < 500:
        body = ink & (v > 0.25) & (v < 0.97)
    mean = np.array([rgb[:, :, c][body].mean() for c in range(3)], dtype=np.float32)
    # target: the same mean on all three channels, at the level the clay already
    # sits at, so this removes the CAST and never the exposure. Exposure is
    # levelled separately and across bots, below.
    gain = mean.mean() / np.maximum(mean, 1e-3)
    out = np.clip(rgb.astype(np.float32) * gain[None, None, :], 0, 255)
    return out, gain, float(mean.mean())


# ── 2. find the toy's own landmarks ───────────────────────────────────────
def measure(ink, L):
    """Landmarks in RENDER pixels. The plate's landmarks are the PRIOR; every
    one of them is then confirmed against the drawn ink, because the model
    redraws rather than repaints and a landmark taken on faith is a part cut in
    the wrong place."""
    ys = np.where(ink.sum(1) > 0)[0]
    xs = np.where(ink.sum(0) > 0)[0]
    apex, floor = int(ys[0]), int(ys[-1])
    Hr = floor - apex + 1
    # plate row -> render row
    def P2R(y): return apex + (y - L["APEX"]) * Hr / (L["FLOOR"] - L["APEX"])
    cx = float((xs[0] + xs[-1]) / 2)

    # THE ARM BAND and the three runs in it. This has to come FIRST, because
    # the crease can only be measured once the arms are known: a width profile
    # taken across the whole silhouette is the head plus two arms, and its
    # narrowest row is wherever the arms happen to be, not the waist.
    at, ab = P2R(L["shoulder_y"] - L["arm_w"] / 2), P2R(L["shoulder_y"] - L["arm_w"] / 2 + L["arm_w"] / 2 + L["arm_l"])
    band_lo = int(at + (ab - at) * 0.25)
    band_hi = int(at + (ab - at) * 0.75)
    lefts, rights, torso_l, torso_r = [], [], [], []
    for y in range(max(0, band_lo), min(ink.shape[0], band_hi)):
        rr = runs(ink[y])
        if len(rr) != 3:
            continue
        lefts.append(rr[0]); torso_l.append(rr[1][0]); torso_r.append(rr[1][1]); rights.append(rr[2])
    if len(lefts) < 8:
        return None, f"only {len(lefts)} rows show three runs across the arm band: the arms are not separable"
    tl, tr = float(np.median(torso_l)), float(np.median(torso_r))
    lcx = float(np.median([(a + b) / 2 for a, b in lefts]))
    rcx = float(np.median([(a + b) / 2 for a, b in rights]))
    arm_w = float(np.median([b - a for a, b in lefts] + [b - a for a, b in rights]))

    # THE CREASE, measured on the BODY COLUMN ONLY: the waist where the big head
    # meets the small body. Restricted to the central band the torso runs in, so
    # the two arms cannot vote, and searched in a window around where the plate
    # put it so a family with an unusual head still lands on its own crease.
    half = (tr - tl) * 0.62
    core = ink[:, max(0, int(cx - half)):int(cx + half)]
    w = core.sum(1).astype(np.float32)
    span = L["FLOOR"] - L["APEX"]
    lo = max(apex + 1, int(P2R(L["crease"] - 0.06 * span)))
    hi = min(floor - 1, int(P2R(L["crease"] + 0.06 * span)))
    crease = int(lo + np.argmin(w[lo:hi])) if hi > lo else int(P2R(L["crease"]))

    hip = int(P2R(L["hip_y"]))
    hip_dx = L["hip_dx"] * Hr / (L["FLOOR"] - L["APEX"])
    return dict(apex=apex, floor=floor, Hr=Hr, cx=cx, crease=crease, hip=hip, hip_dx=hip_dx,
                shoulder_y=float(P2R(L["shoulder_y"])), torso_l=tl, torso_r=tr,
                arm_lcx=lcx, arm_rcx=rcx, arm_w=arm_w,
                arm_top=float(at), arm_bot=float(ab), three_run_rows=len(lefts)), None


# ── 3. cut ────────────────────────────────────────────────────────────────
def cut_masks(ink, M):
    """Four boolean masks over the render, cut on the toy's OWN seams."""
    h, w = ink.shape
    yy, xx = np.mgrid[0:h, 0:w]

    # ARMS: everything outboard of the measured torso edges and BELOW THE
    # CREASE. The crease bound is the whole trick. The head's ear lug is also
    # outboard of the torso, and it hangs to the crease by contract, so an
    # outboard mask that reaches any higher takes the bottom of the ear with the
    # arm: the arm then overflows its canvas, and the head loses the very piece
    # that hides the arm's cap. Grown by connected components so the shoulder
    # tucked under the head and the mitt at the bottom both come along.
    # ...and NOT THE FEET, which is the other half of the trick and is easy to
    # miss. The contract splays the feet to 0.32 H from the axis against a torso
    # edge at 0.19 H, so BOTH FEET ARE OUTBOARD OF THE TORSO TOO. Hand a foot to
    # the arm on its side and every family measures an arm length of 0.454 H:
    # exactly shoulder-to-floor, on all eight, which is not a thing eight
    # independently drawn bots do.
    #
    # THE FEET ARE TOLD APART BY THE FLOOR, NOT BY THE HIP ROW, and that is a
    # correction. A hard `yy < hip` bound cuts the arm off at the hip line, so
    # any part of a mitt drawn below that line is left out of the arm and falls
    # straight into the leg mask underneath it. Measured on the three families
    # drawn in the second wave: the LEFT LEG mask ran from column 36, 103 and
    # 145 of a 2048 wide frame, where the five families whose mitts stop above
    # the hip start at 307. The leg then claims to need 189, 136 and 127 units
    # of canvas on its outboard side where 113 exist, and all three were refused
    # for not fitting a canvas that was never the problem.
    #
    # A foot is the outboard thing that STANDS ON THE FLOOR. Nothing else does,
    # so that is the test, and the arm keeps whatever it was drawn with.
    floor_band = M["floor"] - 0.02 * M["Hr"]
    outboard = ink & ((xx < M["torso_l"]) | (xx > M["torso_r"])) & (yy > M["crease"])
    lab, n = ndimage.label(outboard)
    armL = np.zeros_like(ink); armR = np.zeros_like(ink)
    for i in range(1, n + 1):
        c = lab == i
        if c.sum() < 200:
            continue
        if yy[c].max() >= floor_band:     # it stands on the floor: it is a foot
            continue
        cxi = xx[c].mean()
        if cxi < M["cx"]:
            armL |= c
        else:
            armR |= c

    # HEAD: everything above the crease, plus the ear lugs, minus arm.
    head = ink & (yy <= M["crease"]) & ~armL & ~armR
    # TORSO: between the crease and the hip, inboard of the arms.
    torso = ink & (yy > M["crease"]) & (yy <= M["hip"] + 2) & ~armL & ~armR
    # LEGS: below the hip, split on the CENTRE LINE. Connected components are
    # the right tool for the arms and the wrong one here, and it is worth saying
    # why: the contract puts the two hips 50 units apart with a shaft about 40
    # units wide, so the two shafts TOUCH under the body and the legs are one
    # component from the hip down. Only the FEET are separated, by the channel
    # the plate opens on the centre line. Component labelling therefore hands
    # one leg the entire pair, which measures as a foot 0.86 H wide.
    below = ink & (yy > M["hip"]) & ~armL & ~armR
    legL = below & (xx < M["cx"]); legR = below & (xx >= M["cx"])
    return dict(head=head, torso=torso, armL=armL, armR=armR, legL=legL, legR=legR)


def edge_colour(rgb, mask, band, which="bottom"):
    """The mean colour of a mask's outermost `band` rows at one END of it.

    WHICH END MATTERS, and getting it wrong is visible on the shipped part. A
    limb's synthesised cap sits at its TOP, so it must be painted in the colour
    of the limb's top. Sampling the bottom instead paints the LEG's cap in the
    coral of its shoe and the ARM's in the colour of its mitt, which is exactly
    what the first cut of this wave did: every leg came out with a maroon disc
    on its hip and every arm with a pink one on its shoulder. The head's skirt
    is the one piece that genuinely belongs at the bottom, because it is the
    underside of the dome."""
    ys = np.where(mask.sum(1) > 0)[0]
    if len(ys) == 0:
        return np.array([160, 160, 160], np.float32)
    rows = np.mgrid[0:mask.shape[0], 0:mask.shape[1]][0]
    sel = mask & ((rows >= ys[-1] - band) if which == "bottom" else (rows <= ys[0] + band))
    if sel.sum() < 20:
        sel = mask
    return np.array([rgb[:, :, c][sel].mean() for c in range(3)], np.float32)


def mask_width_at(mask, y0, y1):
    """The widest run the mask shows between two rows: how wide the head really
    is where it meets the body, which is what its skirt has to continue."""
    w = 0
    for y in range(max(0, int(y0)), min(mask.shape[0], int(y1))):
        for a, b in runs(mask[y]):
            w = max(w, b - a)
    return w


def place(rgb, mask, s, src_pt, canvas, dst_pt, flip=False):
    """Scale by the ONE SHARED FACTOR s and paste so src_pt lands on dst_pt.

    `flip` mirrors the part first. THE LEG CANVAS IS HANDED: its hip sits at
    x=70 of 192, which leaves 113 units of room on one side and 62 on the other,
    because the contract splays the toe outward and the shaft is not central. A
    leg whose toe points the wrong way needs 122 units where the canvas offers
    62, and the whole set then has to shrink by half to make it fit. The rig
    mirrors limbs at draw time anyway, so which way the stored one faces is free
    to choose: it faces the way its canvas was cut for."""
    ys = np.where(mask.sum(1) > 0)[0]; xs = np.where(mask.sum(0) > 0)[0]
    if len(ys) == 0 or len(xs) == 0:
        return None
    y0, y1, x0, x1 = int(ys[0]), int(ys[-1]) + 1, int(xs[0]), int(xs[-1]) + 1
    sub = np.dstack([rgb[y0:y1, x0:x1], (mask[y0:y1, x0:x1] * 255)]).astype(np.uint8)
    if flip:
        sub = sub[:, ::-1]
        src_pt = ((x0 + x1 - 1) - src_pt[0], src_pt[1])
    im = Image.fromarray(sub, "RGBA")
    nw, nh = max(1, int(round(im.width * s))), max(1, int(round(im.height * s)))
    im = resample_rgba(im, (nw, nh))
    out = Image.new("RGBA", (canvas["w"], canvas["h"]), (0, 0, 0, 0))
    ox = int(round(dst_pt[0] - (src_pt[0] - x0) * s))
    oy = int(round(dst_pt[1] - (src_pt[1] - y0) * s))
    out.alpha_composite(im, (ox, oy)) if (ox >= 0 and oy >= 0) else out.paste(im, (ox, oy), im)
    return out


def _smear(part, from_y, to_y, mask_img, darken_to):
    """Continue a part's own pixels past where it was cut, up or down.

    WHY NOT A FLAT ELLIPSE, which is what stood here first. The contract says a
    head cut flat at its widest row lays a straight bar across the chest, and
    filling below the cut with one solid colour lays exactly the same bar, just
    a different colour: it has no texture, no shading and no curvature, so at
    fight size it reads as a card slipped behind the toy. Copying the part's own
    cut row along and darkening it keeps the clay, the moulded seams and the
    family's colour, and the ellipse only decides the SHAPE of what is kept."""
    a = np.asarray(part).astype(np.float32)
    h = a.shape[0]
    step = 1 if to_y >= from_y else -1
    src_row = a[int(from_y)].copy()
    out = a.copy()
    span = max(1.0, abs(to_y - from_y))
    for y in range(int(from_y), int(to_y) + step, step):
        if not (0 <= y < h):
            break
        t = abs(y - from_y) / span
        row = src_row.copy()
        row[:, :3] *= (1.0 - t) + t * darken_to
        # only where the part has nothing yet
        empty = out[y, :, 3] < 8
        out[y][empty] = row[empty]
    res = np.clip(out, 0, 255).astype(np.uint8)
    # the ellipse decides the silhouette of the smeared piece, and only of the
    # smeared piece: the part's own rows on the near side of the cut are never
    # touched, whichever way the smear ran.
    m = np.asarray(mask_img).astype(np.uint8)
    beyond = np.zeros(res.shape[:2], bool)
    if step > 0:
        beyond[int(from_y) + 1:] = True
    else:
        beyond[:int(from_y)] = True
    res[..., 3] = np.where((m > 0) | ~beyond, res[..., 3], 0)
    return Image.fromarray(res, "RGBA")


def dome_underside(part, depth, direction=1, darken_to=None):
    """LAW 2. A CUT EDGE CONTINUES AS A DOME, NEVER AS A FLAT BAR.

    `direction` is +1 for a head, whose cut is its bottom and whose skirt hangs
    BELOW it over the body, and -1 for a torso, whose cut is its top and whose
    skirt runs UP under the head.

    EVERY RUN ON THE CUT ROW DOMES SEPARATELY, AND ON ITS OWN WIDTH. A head's
    cut row is not one shape. Measured on the drawn heads at row 314 it is three
    runs -- lug 69, core 207, lug 69, with a 34px notch of background on each
    side of the core -- because the contract's ear lugs stand outboard of the
    core and their lower edge sits on the crease. Two earlier attempts at this
    each got one half of it wrong, and both are worth recording:

      TAKING THE WIDEST RUN AND CENTRING ONE DOME ON IT dropped both lugs. They
      end flat at the crease, so the silhouette fell from 402, 411, 388, 412 and
      413 px at row 314 to 204 to 208 at row 315: 182 to 207 px IN ONE ROW at
      the seat. That step is the black bar and the sharp wedge at every
      shoulder, and because the arm's cap sits under exactly the piece of head
      that went missing, it is also what saws the cap off flat.

      TAKING THE WHOLE EXTENT AND CLOSING THE NOTCHES bridged 34px of background
      on each side into solid clay and carried it down for 51 rows, which lays a
      grey slab clean across the figure from one arm to the other. Wrong in the
      other direction, and worse, because it is wrong in front of the player
      rather than at the seam.

    So each run keeps its own width and rounds away over its own half width,
    capped at the skirt: the core carries the full skirt down over the body, and
    a 69px lug rounds off in 34 rows the way the bottom of a disc does. That is
    also what the placeholder heads do, which is why they never showed the
    defect: measured at row 320 the placeholder still reads three runs, 60, 236
    and 60, where a drawn head read one run of 410.

    The ellipse's widest row IS the cut row, so the join is tangent and no step
    can exist there at any width. It used to span from_y - depth*1.6 to
    from_y + depth, putting its widest row 0.3 depth ABOVE the cut, so it was
    already narrowing where it met the part it hangs from."""
    a = np.asarray(part)
    al = a[:, :, 3] > 8
    rows = np.nonzero(al.sum(1))[0]
    if len(rows) == 0:
        return part
    from_y = int(rows[-1]) if direction > 0 else int(rows[0])
    shape = Image.new("L", part.size, 0)
    draw = ImageDraw.Draw(shape)
    deepest = 0.0
    for x0, x1 in runs(al[from_y]):
        hw = (x1 - x0) / 2.0
        if hw < 4:                      # an antialiased sliver is not a form
            continue
        cx = (x0 + x1 - 1) / 2.0
        d = min(float(depth), hw)       # a lug rounds off over its own half width
        draw.ellipse([cx - hw, from_y - d, cx + hw, from_y + d], fill=255)
        deepest = max(deepest, d)
    if deepest <= 0:
        return part
    if darken_to is None:
        darken_to = 0.62 if direction > 0 else 0.72
    return _smear(part, from_y, from_y + direction * deepest, shape, darken_to=darken_to)


def _seat_to_burial(res, pivot, burial):
    """Trim a limb's top so the burial the art gate reads is exactly `burial`.

    Predicting that burial means predicting how many pixels on the pivot row
    come back OPAQUE, and a smeared or resampled cap carries the soft edges of
    the row it came from, so the opaque run is narrower than the shape drawn.
    Rather than model that, read it back exactly as scripts/bots-art-check.mts
    does -- count alpha >= 200 on the pivot row -- and trim to the row the law
    then asks for. The result satisfies the law by construction."""
    prow = int(round(pivot[1]))
    if 0 <= prow < res.shape[0]:
        run = int((res[prow, :, 3] >= 200).sum())
        if run > 0:
            want_y0 = int(round(pivot[1] - burial * run))
            if want_y0 > 0:
                res[:want_y0, :, 3] = 0
    return Image.fromarray(res, "RGBA")


def round_cap(part, pivot, colour, limb_w):
    """The limb's proximal end: a plain rounded cap in the limb's own colour,
    and nothing else. No ring, no cup, no collar, no bolt. It is drawn BEHIND
    the model pixels and it is buried by the body group in the shipped draw
    order, so it is never seen on an assembled bot; it exists so the pivot lands
    on ink and the burial depth is the contract's."""
    a = np.asarray(part)
    ys = np.where(a[:, :, 3] > 8)[0]
    xs = np.where(a[:, :, 3].sum(0) > 0)[0]
    if len(ys) == 0:
        return part
    # THE TOP IS THE FIRST SOLID ROW, not the first row with any alpha at all.
    # The art gate measures the burial off pixels at alpha >= 200, so a cap
    # grown from the alpha > 8 top starts inside the antialiased fringe and
    # stops short of where the gate will look: measured on the sprocket arm the
    # cap filled rows 47 to 49 and the fringe held rows 50 to 54, so the gate
    # still read its ink starting at 55 and the burial at 0.19. Growing from
    # the solid row also lets the ellipse clear that fringe away, which is the
    # right thing to do with it: a soft sliver hanging above a limb's cap is
    # what puts a grey halo on the shoulder.
    solid = a[:, :, 3] >= 200
    srows = np.nonzero(solid.sum(1))[0]
    top = int(srows[0]) if len(srows) else int(ys[0])
    cx = float((xs[0] + xs[-1]) / 2)
    # THE CAP IS SIZED BY THE BURIAL LAW, not by a fixed multiple of the limb's
    # width. JOIN.burial says the pivot sits half the limb's OWN width below its
    # own ink top: too little and the cap shows past the body group, too much
    # and the limb reads short. Drawing a cap of some convenient size and hoping
    # is what put every limb in this wave at 0.73 to 0.84 against a 0.35 to 0.60
    # law. So measure the limb's real width at the pivot, work out where the ink
    # has to start, and put it exactly there.
    # THE LIMB'S OWN WIDTH is measured on the limb's own SHAFT, at the top of
    # what was actually cut. Reading it at the pivot row does not work for a leg
    # anchored on its foot, because the pivot then sits above the ink entirely
    # and there is nothing to measure; the previous version fell back to the
    # ARM's width and seated every leg wrong. The gate counts opaque pixels
    # across the pivot row of the finished part, so with the cap drawn 2r wide
    # and its top set r above the pivot, the burial it reads is exactly r/2r.
    # MEASURED THE WAY THE GATE MEASURES IT: opaque pixels across a row, from
    # the first SOLID row down. Two details, and both bit. `top` above is the
    # alpha > 8 top, so it can sit several rows into the antialiased fringe,
    # where a row contributes a two pixel sliver at alpha >= 200; and taking
    # every run separately let each of those slivers vote. Measured on the
    # sprocket arm, whose ink starts lower than the rest because its arm is
    # shorter: own_w came back about 20 against a real 43, so the cap was drawn
    # at half size, target_top landed BELOW the ink top, the extend branch never
    # ran, and the gate read a burial of 0.19 against a law of 0.35 to 0.60.
    widths = [int(solid[y].sum()) for y in range(top, min(a.shape[0], top + 12))
              if solid[y].any()]
    own_w = float(np.median(widths)) if widths else limb_w
    r_cap = own_w * JOIN.get("capR", 0.5)
    # THE LAW'S MINIMUM, not its midpoint. Everything above the pivot is drawn
    # above the shoulder on screen, where the head has to cover it, and at 0.5
    # the cap reached past the ear lug and read as a hard sleeve on the arm at
    # build size. 0.35 is the least the join law allows and so the least the
    # head has to hide.
    # a little INSIDE the floor, not on it: the trim below rounds to whole rows,
    # and aiming exactly at 0.35 lands three legs on 0.34.
    burial = JOIN.get("burialMin", 0.35) + 0.05
    target_top = pivot[1] - burial * (2 * r_cap)
    if top <= target_top:
        # Already deep enough: trim the rows above so the law is met exactly.
        # TRIMMED TO THE MEASURED RUN, not to target_top, which is the same
        # closing loop the extend branch ends with and for the same reason.
        # target_top is derived from own_w, and own_w is measured on the rows
        # at the top of the cut, where a limb drawn with a rounded end is still
        # tapering: on the sprocket arm those rows read 20 against a shaft of
        # 43, so target_top landed at row 55, this branch trimmed a correctly
        # seated cap at row 43 down to 55, and turned a burial of 0.47 into
        # 0.19. Whatever own_w says, the burial the gate reads is set by the
        # pivot row, so set it there.
        return _seat_to_burial(a.copy(), pivot, burial)
    r = r_cap
    # extend UP to exactly the row the burial law asks for
    shape = Image.new("L", part.size, 0)
    ImageDraw.Draw(shape).ellipse([cx - r, target_top, cx + r, target_top + 2 * r], fill=255)
    ImageDraw.Draw(shape).rectangle([cx - r, target_top + r, cx + r, part.size[1]], fill=255)
    # carry the limb's own top row UP into the cap, brightening slightly toward
    # the crown the way a rounded end catches the key light from above
    b = np.asarray(part).astype(np.float32)
    src = b[top].copy()
    out = b.copy()
    hi = max(0, int(target_top))
    # The cap sits UNDER the body group, so it is in shadow, and the contract
    # puts a soft occlusion wash on exactly this piece. Darkening up its length
    # makes the sliver that does peek out read as the limb turning under the
    # body instead of as a flat slab stuck on the end of it.
    occl = JOIN.get("occlusion", 0.55)
    for y in range(hi, top):
        t = (top - y) / max(1.0, top - hi)
        row = src.copy()
        row[:, :3] *= 1.0 + (occl - 1.0) * t
        empty = out[y, :, 3] < 8
        out[y][empty] = row[empty]
    res = np.clip(out, 0, 255).astype(np.uint8)
    m = np.asarray(shape) > 0
    above = np.zeros(res.shape[:2], bool)
    above[:top] = True
    res[..., 3] = np.where(m | ~above, res[..., 3], 0)

    return _seat_to_burial(res, pivot, burial)


def desidelight(part):
    """LAW: limb art must be laterally symmetric, because the rig mirrors it
    with scale.x = -1 and a side-lit limb flips its light on the mirrored side.
    Corrected with a LOW-FREQUENCY field that is a function of x only: the ratio
    of each column's mean value to its mirror's, smoothed. That removes a side
    key without touching a single moulded edge, which averaging the image with
    its own mirror would destroy."""
    a = np.asarray(part).astype(np.float32)
    al = a[:, :, 3] > 24
    if al.sum() < 200:
        return part, 1.0
    v = a[:, :, :3].mean(2)
    # Only columns with real ink in them. A column holding four antialiased
    # pixels has a meaningless mean, and letting it into the ratio is what made
    # this report 24.8 on a limb whose light is nearly flat.
    need = max(4, int(0.10 * al.sum(0).max()))
    col = np.array([v[al[:, x], x].mean() if al[:, x].sum() >= need else np.nan
                    for x in range(a.shape[1])])
    ok = ~np.isnan(col)
    if ok.sum() < 8:
        return part, 1.0
    idx = np.arange(a.shape[1])
    col = np.interp(idx, idx[ok], col[ok])
    k = max(3, a.shape[1] // 6) | 1
    sm = np.convolve(col, np.ones(k) / k, mode="same")
    # measure only where the smoothing had real data on both sides
    m = np.zeros_like(sm, bool); m[k // 2: len(sm) - k // 2] = True
    m &= ok
    mir = sm[::-1]
    before = float(sm[m].max() / max(1e-3, sm[m].min())) if m.sum() > 4 else 1.0
    tgt = (sm + mir) / 2.0
    g = np.clip(tgt / np.maximum(sm, 1e-3), 0.75, 1.33)
    a[:, :, :3] *= g[None, :, None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA"), before


# The contract's fixed accents. These NEVER vary by family, and the coral is
# the one the study singled out: "it is the single thing that makes a mixed bot
# read as one toy".
CORAL = np.array([0xB4, 0x6D, 0x52], np.float32)

# ── THE FACE ───────────────────────────────────────────────────────────────
# THE EYE IS THE WHOLE TOY. Every concept scene in art-src/bots/concept/ shows
# the same face: a warm lit bulb behind a metal ring, the same on every body
# colour. Measured off scene 2, the hero's lens sits at hue 44, saturation 0.63,
# value 0.82 and its ring at hue 31, saturation 0.27 -- neither of them anywhere
# near the mint the toy is painted. That difference is what makes those toys
# read as switched on, and it is the one thing our heads did not have: measured
# on the shipped art, the hue between an eye centre and the cheek beside it was
# 0.4 degrees on coral, 0.6 on ink and 0.1 on butter, because the paint mask
# crossed the eye and the eye took the body colour exactly.
#
# THE THREE COLOURS BELOW SHARE ONE HUE BY CONSTRUCTION, and that is a
# correctness property, not a taste one. Saturation is (max-min)/max and hue is
# fixed by (g-b)/(r-b); all three have (g-b)/(r-b) = 0.596, so ANY blend of
# them, and any scaling of one by a constant, lands on hue 35.8 exactly. That is
# what lets one narrow band in the paintable law hold the entire eye -- rim,
# glass and specular -- with no pixel of it falling out into paintable clay.
#
# EVERY SATURATION HERE IS BELOW FIGURE.metalSatMin (0.60), so no eye pixel can
# be counted against the torso's brass budget. The ceiling in the law's band is
# 0.56, which leaves the eye 0.04 of headroom and the brass key, at 0.70, well
# clear on the other side.
EYE_LENS = np.array([0xEA, 0xBC, 0x78], np.float32)   # the bulb: sat 0.487
EYE_HOT = np.array([0xFF, 0xEE, 0xD5], np.float32)    # its lit core: sat 0.165
EYE_RING = np.array([0xC7, 0xB2, 0x93], np.float32)   # the bezel: sat 0.261
# THE GRILLE.
#
# THE MOUTH IS A DIFFERENT METAL FROM THE EYE, and that is a correctness
# requirement, not a taste one. The first cut of this put the grille on the eye
# family's own hue, 35.8, reasoning that one band in the paintable law could
# then hold the whole face. scripts/bots-art-check.mts refused it, correctly:
# its face check finds the eyes by taking the TWO BIGGEST BLOBS in the law's
# `eye` band, and a mouth in that band is a single connected region larger than
# one lens, so it displaced a real eye on three of the eight heads and the gate
# reported eyes 28 percent of head height apart, one of them dead on the centre
# line. The mouth was being read as an eye.
#
# So the grille sits at hue 50.4, OUTSIDE the eye band's ceiling of 42 and
# comfortably inside the `brass` band (hue 20 to 60, saturation over 0.18, value
# over 0.22). It is therefore still an accent, still never painted, still
# identical on all eight paints, and it is invisible to the face check. At
# saturation 0.301 it is also well under FIGURE.metalSatMin (0.60), so not one
# pixel of it counts against the bot's brass budget, and the wind-up key at 0.70
# stays clear on the other side. NO BAND IN scripts/bots-art-accents.json HAS TO
# CHANGE for any of this, which is the point: the law already had a place for a
# warm metal that is not the eye.
GRILLE_LIT = np.array([0xBA, 0xB1, 0x82], np.float32)  # pale gold: hue 50.4, sat 0.301
# The closing that pulls the slats into the mouth. Measured on the eight heads
# the mouth is 118 to 131 px wide with 9 or 10 slats in it, so the gaps run 6 to
# 8 px; 11 clears the widest of them and is still far narrower than any real
# concavity in the head's silhouette, which is what stops the close reaching
# anything that is not mouth.
GRILLE_CLOSE = 11

# WHERE THE EYES ARE, as fractions of the head's own drawn height. Measured on
# all eight generated families; the spread is the reason these are bounds and
# not one number. Centres came back at 0.438 to 0.523 of head height down, and
# 0.224 to 0.253 out from the centre line, on every family.
EYE_BAND = dict(fyMin=0.30, fyMax=0.70, fxMin=0.10, fxMax=0.42,
                levelMax=0.04, mirrorMax=0.08, sizeRatioMax=2.2, minPx=300)
# THE SOCKET'S TWO EDGES, both measured off the shipped art at 3x. On a 42 px
# socket the clear glass runs to 35 and the moulded ring occupies the last 7,
# so the glass is 0.88 of the socket and the ring is the rest. An earlier 0.75
# left a bare crescent of unpinned glass between the amber and the ring, which
# read as a chip out of the bulb.
EYE_LENS_OF_SOCKET = 0.88
EYE_RING_R = 1.0 / 0.88
# the flood fill has escaped the socket when one step grows it by more than
# this. Honest steps measured at most 1.43x, escapes at least 2.46x.
EYE_BURST = 1.8
# a region this big is not an eye socket any more, whatever the fill says
EYE_SOCKET_MAX = 0.28
# two sockets on one face cannot touch: this is the widest either may be, as a
# share of the distance between the eye centres
EYE_SOCKET_OF_SEP = 0.46
# a socket bigger than this multiple of the accepted one has escaped, and loses
# its vote on where its own eye is
EYE_SOCKET_TRUST = 1.25

# HOW FAR THE BELLY CURVES PAST THE HIP ROW. The leg's own shaft runs 118 units
# from its hip pivot to the top of its shoe, so 22 rounds the corner off and
# still leaves the whole leg showing.
TORSO_HIP_DOME = 22
# THE BEZEL'S LEVEL, and it moved on 2026-09-05. It stood at 1.34, a reference
# 34 percent above the ring's own median, which pinned the bezel DARKER than the
# clay beside it. The argument for that was "a dark surround stops a lit bulb
# reading as a pale sticker", and it is a real effect, but it was applied to the
# wrong piece. In art-src/bots/concept/1-garage.png the bezel is the BRIGHTEST
# ring on the toy, a chrome collar catching the key light, and the dark surround
# is the one-unit crease where that collar meets the head, which the socket's
# own sculpted shading already draws. Pinned dark, the bezel and the sunken
# socket merged into a single deep round hole, which is the other half of why
# three reviewers reached for the word skull. Below 1.0 the bezel lands just
# above its own median: hardware with a light on it.
EYE_RING_DARKEN = 0.94
# the glass fades into the ring between these two multiples of the lens radius,
# which is what keeps a circle's edge off the face
EYE_FEATHER_IN = 0.94
EYE_FEATHER_OUT = 1.06
# where the specular sits inside the lens, x the lens radius, and how big.
# THE SAME PLACE ON BOTH EYES IS THE POINT: two highlights that agree are what
# a face does when it looks back at you, and two that disagree are two lamps.
EYE_SPEC_AT = (-0.30, -0.32)
EYE_SPEC_R = 0.21
# HOW MUCH OF THE LENS IS ACTUALLY LIT, and this is the number that decides
# whether the toy reads as switched on. It stood at 0.34 with a falloff of 2.0
# over 0.90 of the lens, which put a soft 34 percent blend toward EYE_HOT at the
# very centre and nothing at all past two thirds of the way out. Measured on the
# eight shipped heads, that left the eye at mean luminance 0.636 to 0.657
# against a cheek at 0.655 to 0.702: the lamp was DARKER than the wall beside
# it, on every head, in the base art. A bulb is not a peak, it is an AREA of
# light with a blown centre, so the reach goes out and the falloff softens: the
# lens now carries a broad lit core that holds up when the head is drawn at
# fight size, where a tight specular is one pixel and disappears.
EYE_GLOW_K = 0.78
EYE_GLOW_REACH = 1.02
EYE_GLOW_FALL = 2.6


def _pin(rgb, mask, colour, k_lo=0.35, ref=None):
    """Put every pixel of `mask` on ONE hue and ONE saturation, and let its own
    shading ride on value alone. Exactly what pin_coral does to a shoe, and for
    exactly the same reason: scaling all three channels by the same factor
    leaves hue and saturation constant to the last decimal, so a band narrow
    enough to catch nothing else still catches every pixel of the piece on
    every family. The moment the brightest channel clips at 255 that stops
    being true, so k is capped where the scale is still linear."""
    if not mask.any():
        return rgb
    lum = rgb[:, :, :3].mean(2)
    if ref is None:
        ref = float(np.median(lum[mask]))
    kmax = 255.0 / float(colour.max())
    k = np.clip(lum[mask] / max(ref, 1e-3), k_lo, kmax)
    out = rgb.copy()
    out[mask] = colour[None, :] * k[:, None]
    return out


def find_eyes(head, v, cx, minPx=None):
    """The two eyes, found by GEOMETRY and never by colour.

    WHAT WENT WRONG WITH COLOUR, measured. neutral_clay used to call the eye
    "the brightest thing on the bot" and take the two biggest blobs over value
    0.88. On a head lit from above, the brightest thing on the bot is the CROWN,
    and on three of the eight families a crown specular came back bigger than an
    eye: the blob count ran from 3,865 pixels on one head to 15,885 on another
    for the same two eyes. Whatever the crown blob caught was then protected
    from the clay pass, kept the cool cast the render gave it, and shipped as
    the pale blue hole Mike saw on three crowns. One rule caused both defects.

    Geometry cannot make that mistake, because a crown has no partner. The eyes
    are the only pair of bright blobs that are LEVEL with each other, MIRRORED
    about the head's centre line, and of comparable size. Measured over the
    eight families the pair lands at 0.44 to 0.52 of head height down and 0.22
    to 0.25 out, and the winning pair beat its nearest rival by an order of
    magnitude on every one of them.

    Returns [(cy, cx, npx), (cy, cx, npx)] left first, or None. NEVER a guess:
    a family with no pair is refused by the caller, the way this file refuses a
    bot whose arms it cannot find."""
    B = EYE_BAND
    ys = np.nonzero(head.sum(1))[0]
    if len(ys) == 0:
        return None
    top, hh = int(ys[0]), int(ys[-1] - ys[0] + 1)
    # THE THRESHOLD SWEEP IS A SEARCH, NOT A GUESS: every candidate it returns
    # has to pass the same pair test, and a threshold that finds no pair is
    # simply the wrong threshold for that render's exposure. 0.88 wins on eight
    # of eight; the rest are there so one dim render cannot cost a whole family.
    for thr in (0.88, 0.90, 0.86, 0.92, 0.84):
        lab, cnt = ndimage.label(ndimage.binary_closing(head & (v >= thr), np.ones((5, 5))) & head)
        cands = []
        for i in range(1, cnt + 1):
            m = lab == i
            n = int(m.sum())
            if n < (minPx or B["minPx"]):
                continue
            cyy, cxx = ndimage.center_of_mass(m)
            fy, fx = (cyy - top) / hh, (cxx - cx) / hh
            if B["fyMin"] <= fy <= B["fyMax"] and B["fxMin"] <= abs(fx) <= B["fxMax"]:
                cands.append((n, cyy, cxx, fy, fx))
        best = None
        for i in range(len(cands)):
            for j in range(i + 1, len(cands)):
                A, C = cands[i], cands[j]
                if A[4] * C[4] >= 0:                       # both on one side
                    continue
                if abs(A[3] - C[3]) > B["levelMax"]:       # not level
                    continue
                if abs(A[4] + C[4]) > B["mirrorMax"]:      # not mirrored
                    continue
                r = max(A[0], C[0]) / min(A[0], C[0])
                if r > B["sizeRatioMax"]:
                    continue
                cost = abs(A[3] - C[3]) + abs(A[4] + C[4]) + 0.02 * (r - 1)
                if best is None or cost < best[0]:
                    best = (cost, A, C)
        if best:
            _, A, C = best
            pair = sorted([A, C], key=lambda e: e[2])
            return [(e[1], e[2], e[0]) for e in pair], thr, top, hh
    return None


def socket_radius(head, v, ey, ex, hh):
    """How big the eye socket is, MEASURED off this family's own render.

    NOT off the bright blob, which is the specular and not the eye: it came back
    at 0.054 to 0.123 of head height across the eight families for eyes that
    differ nowhere near that much, because its size is set by how hard that
    render's key light hit that dome. And not off a radial profile either: the
    glass is a DOME, so its value falls away gradually and any "where does the
    plateau end" rule reads a big soft eye as small. Tried, measured, and it
    under-filled six of the eight.

    THE SOCKET HAS A WALL, and a flood fill can feel it. Grow the region that
    contains the eye centre, dropping the value threshold step by step. Inside
    the socket the region creeps: the glass, then the ring's lit top, each step
    adding a little. The moment the threshold falls under the groove that runs
    round the outside of the ring, the region escapes onto the cheek and its
    radius JUMPS. Measured on all eight families the last honest step grows the
    radius by at most 1.43x and the escape grows it by at least 2.46x, so a
    BURST bar of 1.8 sits in a gap with clear air on both sides.

    What comes back is the whole socket, ring included, AND ITS CENTRE. The
    centre matters as much as the radius: find_eyes hands over the centroid of
    the bright BLOB, which is the specular, and a specular sits wherever that
    dome's normal faced the key light. Measured, it lands high and to one side,
    so an eye drawn on it sits low in its own socket with a grey crescent above
    it, and the two eyes of one head disagree. The socket's own centroid is the
    eye, and it is symmetric by construction.

    The glass is the inner three quarters of the socket, which is the
    proportion every concept scene draws."""
    prev = None
    last = None
    for tau in np.arange(0.88, 0.49, -0.02):
        lab, _ = ndimage.label(head & (v >= tau))
        i = lab[int(round(ey)), int(round(ex))]
        if i == 0:
            continue
        m = lab == i
        r = float(np.sqrt(int(m.sum()) / np.pi) / hh)
        if r > EYE_SOCKET_MAX:              # already off the face
            break
        if prev is not None and r > prev * EYE_BURST:
            break                           # it escaped the socket
        ys, xs = np.nonzero(m.sum(1))[0], np.nonzero(m.sum(0))[0]
        # THE BOX CENTRE, NOT THE CENTRE OF MASS. A socket fills unevenly -- the
        # ring's lit top joins the glass before its shaded underside does -- so
        # the centre of mass rides upward with the light and puts the drawn eye
        # low in its own socket. The box is set by the wall on all four sides.
        last = (r, float(ys[0] + ys[-1]) / 2, float(xs[0] + xs[-1]) / 2)
        prev = r
    if last is None:
        return 0.12 * hh, float(ey), float(ex)
    return last[0] * hh, last[1], last[2]


def face_geometry(rgb, head, M):
    """WHERE THE FACE IS, measured, with nothing drawn.

    Lifted out of draw_face unchanged on 2026-09-05 so that a SECOND caller can
    ask the same question: the authored mouth has to be placed from the head's
    own face and there is exactly one right answer to where that face is. A
    mouth positioned off its own copy of this arithmetic would drift away from
    the eyes the moment either copy was touched.

    Returns None when this head has no symmetric pair of eyes, which is the same
    answer draw_face gave before and still gives.

    Returns dict(eyes, thr, top, hh, sockets, centres, r, sep)."""
    h, sat, v = hsv_full(rgb)
    found = find_eyes(head, v, M["cx"])
    if not found:
        return None
    eyes, thr, top, hh = found
    sockets = [socket_radius(head, v, ey, ex, hh) for (ey, ex, _n) in eyes]
    # THE SMALLER OF THE TWO, not the average. A socket measurement has exactly
    # one failure mode: the fill escapes early and reads too big. It cannot read
    # too small, because the wall it stops at is real. So the conservative eye is
    # the honest one, and the average lets one escaped eye grow both. Measured on
    # anvil, whose crown specular touches its right socket: averaged, the lenses
    # came out at 0.167 of head height and spilled over the cheek and into the
    # mouth; the smaller socket measured 0.134 and sits inside its own ring.
    sep = abs(eyes[0][1] - eyes[1][1])
    # AND THE SOCKETS MAY NOT TOUCH. Two eyes on one face have a face between
    # them; anything wider has escaped whatever the burst test thought.
    r_socket = min(min(s[0] for s in sockets), sep * EYE_SOCKET_OF_SEP)
    r = r_socket * EYE_LENS_OF_SOCKET
    # AN ESCAPED SOCKET LOSES ITS VOTE ON THE CENTRE TOO. anvil's right socket
    # runs into the crown specular and measured 219 against its left's 147; its
    # box centre then sat 122 rows above the other eye, which would have drawn
    # one eye on the forehead. A socket materially bigger than the accepted one
    # is not a socket, so that eye keeps the centre find_eyes gave it.
    ok = [s[0] <= r_socket * EYE_SOCKET_TRUST for s in sockets]
    centres = [(sockets[i][1], sockets[i][2]) if ok[i] else (eyes[i][0], eyes[i][1])
               for i in range(2)]
    # LEVEL, ALWAYS. Two eyes at different heights is the one facial error
    # nobody forgives, and every generated bot faces front. The trusted sockets
    # set the row; if neither is trusted the bright blobs do.
    rows = [centres[i][0] for i in range(2) if ok[i]] or [c[0] for c in centres]
    cy0 = float(np.mean(rows))
    centres = [(cy0, c[1]) for c in centres]
    return dict(eyes=eyes, thr=thr, top=top, hh=hh, sockets=sockets,
                centres=centres, r=r, sep=float(sep))


def draw_face(rgb, head, M, grille):
    """Give the head back its face: pin the ring, pin the glass, light the bulb.

    NOTHING HERE IS INVENTED. The ring and the glass are both drawn in the art
    already, sculpted, with their own light on them; every one of them was
    simply being painted over, because the paintable law's only bright accent
    was a CYAN band (#bfe9ff, hue 175 to 240) and this art's lens is a warm
    white bulb at hue 40 with saturation 0.06 to 0.10. It could never match.
    Measured on the eight fresh heads, 3,798 to 15,747 lens pixels fell in
    NEITHER the glass band nor the brass band and so were classified paintable
    clay. So the pin keeps every sculpted pixel where it is and changes only its
    hue and saturation, which is the one thing that has to be identical on all
    eight paints for a bot to look switched on.

    THE ONE THING THAT IS ADDED is the specular, and only because a gaze needs
    the two highlights to agree. The render puts one wherever that eye's normal
    happened to face, so the two eyes of one head disagree and the head reads as
    two lamps rather than as a face. One authored dot, the same offset inside
    both lenses, is what makes it look back at you.

    Returns (rgb, eye_mask, report)."""
    g = face_geometry(rgb, head, M)
    if g is None:
        return rgb, np.zeros(head.shape, bool), None
    eyes, thr, top, hh = g["eyes"], g["thr"], g["top"], g["hh"]
    centres, r, sockets = g["centres"], g["r"], g["sockets"]
    yy, xx = np.mgrid[0:head.shape[0], 0:head.shape[1]]

    ring_mask = np.zeros(head.shape, bool)
    lens_mask = np.zeros(head.shape, bool)
    for (cy, cx) in centres:
        d = np.hypot(yy - cy, xx - cx)
        lens_mask |= (d <= r) & head
        ring_mask |= (d > r) & (d <= r * EYE_RING_R) & head
    ring_mask &= ~lens_mask
    # the mouth is never part of an eye, whatever the radii come out as
    lens_mask &= ~grille
    ring_mask &= ~grille

    # 1 and 2. THE RING AND THE GLASS, IN ONE PASS, so the seam between them can
    #    be soft. A hard circular edge on the glass cuts a visible chord across
    #    a socket whose own centre the fill could only find to within a pixel or
    #    two, and a chord across an eye is the one thing a player's eye finds
    #    instantly. Feathering it is only safe because EYE_LENS and EYE_RING
    #    were chosen with the SAME hue ratio, (g-b)/(r-b) = 0.597 on both: every
    #    blend of the two lands on hue 35.8 exactly, so no pixel of the feather
    #    falls out of the law's eye band and gets painted.
    #
    #    The ring's reference is lifted above its own median so the ring lands
    #    DARKER than the clay round it. Measured on the concept scenes, the ring
    #    sits at value 0.64 lit and 0.30 shadowed against a cheek at 0.77, and
    #    that dark surround is what stops a lit bulb reading as a pale sticker.
    #    Pinned on its own median it came out the same lightness as the clay and
    #    vanished on all eight heads.
    both = lens_mask | ring_mask
    if both.any():
        t = np.zeros(head.shape, np.float64)
        for (cy, cx) in centres:
            dd = np.hypot(yy - cy, xx - cx)
            t = np.maximum(t, np.clip((r * EYE_FEATHER_OUT - dd)
                                      / max(r * (EYE_FEATHER_OUT - EYE_FEATHER_IN), 1e-6), 0, 1))
        lum = rgb[:, :, :3].mean(2)
        lens_ref = float(np.median(lum[lens_mask])) if lens_mask.any() else 1.0
        ring_ref = (float(np.median(lum[ring_mask])) * EYE_RING_DARKEN
                    if ring_mask.any() else lens_ref)
        col = EYE_RING[None, None, :] + (EYE_LENS - EYE_RING)[None, None, :] * t[:, :, None]
        ref = ring_ref + (lens_ref - ring_ref) * t
        kmax = 255.0 / float(max(EYE_LENS.max(), EYE_RING.max()))
        k = np.clip(lum / np.maximum(ref, 1e-3), 0.34 + 0.36 * t, kmax)
        out = rgb.copy()
        out[both] = (col * k[:, :, None])[both]
        rgb = out
    # 3. THE BULB. Blending toward EYE_HOT raises value and drops saturation
    #    without moving hue by a thousandth of a degree, so the core reads as
    #    lit rather than as a paler amber, and every pixel of it is still inside
    #    the one band the law carries for the eye.
    for (cy, cx) in centres:
        d = np.hypot(yy - cy, xx - cx) / max(r, 1e-6)
        glow = np.clip(1.0 - (d / EYE_GLOW_REACH) ** EYE_GLOW_FALL, 0.0, 1.0) * EYE_GLOW_K
        sy = cy + EYE_SPEC_AT[1] * r
        sx = cx + EYE_SPEC_AT[0] * r
        ds = np.hypot(yy - sy, xx - sx) / max(r * EYE_SPEC_R, 1e-6)
        # THE CATCH LIGHT. Tight, and hotter than the glow it sits in, or it
        # dissolves into the bulb and the eye stops looking back.
        glow = np.maximum(glow, np.clip(1.9 - ds * 1.6, 0.0, 1.0))
        w = (glow * lens_mask)[:, :, None]
        rgb = rgb * (1 - w) + EYE_HOT[None, None, :] * w
    eye_mask = lens_mask | ring_mask
    return np.clip(rgb, 0, 255), eye_mask, dict(
        thr=thr, r=round(float(r), 1), rOverH=round(float(r / hh), 4),
        lens=int(lens_mask.sum()), ring=int(ring_mask.sum()),
        sockets=[round(float(s[0]), 1) for s in sockets],
        eyes=[[int(round(c[0])), int(round(c[1]))] for c in centres])


def find_grille(head, v, M, eyes_y=None):
    """The mouth: the darkest thing on the bot, and on the head's centre line.

    Same defect as the eye, from the other side. "The biggest dark blob on the
    head" also fits the contact shadow where an ear lug meets the jaw, which is
    why that shadow shipped near-black and unpainted on seven of eight heads.
    Requiring the blob to straddle the centre line separates a mouth from a
    shadow at the edge, and costs nothing: a mouth that is not on the centre
    line is a defect in its own right."""
    lab, cnt = ndimage.label(head & (v <= 0.32))
    best = None
    for i in range(1, cnt + 1):
        m = lab == i
        n = int(m.sum())
        if n < 200:
            continue
        xs = np.nonzero(m.sum(0))[0]
        if not (xs[0] <= M["cx"] <= xs[-1]):        # must cross the centre line
            continue
        if best is None or n > best[0]:
            best = (n, m)
    return best[1] if best else np.zeros(head.shape, bool)


def mouth_region(grille, head):
    """THE WHOLE MOUTH, from the darkest blob in it.

    Lifted out of light_grille unchanged on 2026-09-05 so the authored mouth
    can heal exactly what the render drew. See light_grille for why the closing
    and then the span fill: the blob is the recess BEHIND the slats, the slats
    themselves are lighter and fall outside it, and a mouth is a letterbox so it
    is convex on every row by construction."""
    mouth = ndimage.binary_closing(grille, np.ones((GRILLE_CLOSE, GRILLE_CLOSE)))
    for y in np.nonzero(mouth.sum(1))[0]:
        xs = np.nonzero(mouth[y])[0]
        mouth[y, xs[0]:xs[-1] + 1] = True
    mouth &= head
    return mouth


def light_grille(rgb, head, grille):
    """LIGHT THE MOUTH. The other half of the face, and the half that was still
    a hole after the eye was fixed.

    THE DEFECT, measured on the eight shipped heads before this ran: the grille
    sat at mean luminance 0.074 to 0.110 against a cheek at 0.655 to 0.702, so
    the mouth was 11 to 16 percent of the brightness of the face round it. The
    concept scenes in art-src/bots/concept/ put the same part at 49 to 85
    percent: a lit brass speaker grille, not a hole. A wide near-black slot with
    dark slats low on a round bald head is the exact topology of a mouth full of
    teeth, and it is the highest contrast thing on the bot, so it WINS the face:
    three independent reviews of the shipped build reached for the same two
    words, "skull" and "screaming", before any of them mentioned the eyes.

    Contrast is the whole finding. The eye was fixed and the face still read
    wrong, because a lamp cannot win an argument against a 6x darker hole
    directly under it.

    WHAT THIS DOES, and it is the same move the shoes and the eye already make:
    PIN the grille to one hue and one saturation and let its own sculpted
    shading ride on value alone. Every slat, every bar face and every gap the
    model drew is still exactly where it was and still in the same order of
    brightness; only the level and the colour move.

    A BRIGHT RIM ROUND A SOFT RECESS, and getting that the wrong way round is
    the trap. The first cut of this lit the BAR FACES and let the gaps fall
    away, which is what the sculpt's own contrast wants. It made things worse:
    a row of bright vertical bars separated by dark gaps is exactly what teeth
    look like, so the mouth stopped being a hole and became a grin full of
    metal. What the concept actually does is the opposite. Its slats carry
    almost no contrast against each other; nearly all the light is on the FRAME
    round them, and the recess behind is one soft mid tone.

    So the interior is COMPRESSED, to a range of about 1.5 to 1 against the 3 to
    1 the sculpt carries, which keeps the slats legible as texture and stops any
    one of them reading as a tooth; and the outer shell is lifted to the lit
    brass, which is the bezel.

    THE RIM IS THE BLOB'S OWN OUTER SHELL, not a dilation onto the cheek, so the
    mouth's footprint does not move by one pixel: the paint mask, the paint
    share and the unmasked-body count are all identical to what they were.

    WHY IT STAYS PUT ON ALL EIGHT PAINTS. The mouth was an accent before, under
    the `rubber` band, purely by being nearly black; it is an accent now by
    being warm metal in the `brass` band, which is what the art actually is. See
    GRILLE_LIT for why it must be the brass band and not the eye's.

    THE GAPS BETWEEN THE SLATS ARE THE TEETH, and they were never part of the
    mouth. find_grille returns the darkest connected blob, which on this sculpt
    is the recess BEHIND the slats; the slats themselves are lighter, so they
    fall outside it, are classified paintable clay and take the body colour.
    Measured on head t1-1: the mouth's own bounding box is 4,216 solid pixels,
    of which the blob held 70.5 percent and 24.7 percent was PAINTED. So the
    shipped mouth was a dark cavity with a row of BODY COLOURED prongs standing
    in it, which is a described set of teeth, and lighting only the cavity left
    the prongs exactly as they were. Closing the blob with a kernel wider than
    the widest gap pulls the slats into the mouth, so the whole thing is one
    piece of brass with the slats as modelling on it. A closing cannot grow the
    outer silhouette, only fill concavities narrower than its kernel, so the
    mouth's outline does not move.

    Returns (rgb, mouth, report), where `mouth` is the closed region every later
    pass must protect: passing the raw blob on would let neutral_clay and the
    paint mask reach the slats again.
    """
    if not grille.any():
        return rgb, grille, dict(px=0)
    lum = rgb[:, :, :3].mean(2)
    before = float(lum[grille].mean()) / 255.0
    # One closing first, to drop the speckle the threshold leaves round the
    # slats, then a SPAN FILL: on every row the mouth occupies, everything
    # between its own leftmost and rightmost pixel is mouth. A mouth is a
    # letterbox, so it is convex on every row by construction, which makes the
    # span exact rather than an approximation: it keeps the rounded ends, since
    # those rows are simply shorter, and it swallows a prong of ANY width, which
    # a closing cannot promise. Measured on the eight heads the widest prong ran
    # 14 px against an 11 px kernel, so a closing alone left the fattest teeth
    # standing in body colour.
    mouth = mouth_region(grille, head)
    # the shell is one erosion deep, and it is the rim of the speaker
    inner = ndimage.binary_erosion(mouth, np.ones((3, 3)))
    shell = mouth & ~inner
    rgb = rgb.copy()

    def band(where, lo, hi, pct):
        """Pin `where` to the brass, with the value range CLAMPED between two
        multiples of the target rather than left to run. Scaling all three
        channels by one factor is _pin's move and keeps hue and saturation
        exactly constant; the clamp is what compresses the contrast."""
        if not where.any():
            return
        ref = max(float(np.percentile(lum[where], pct)), 1e-3)
        k = np.clip(lum[where] / ref, lo, hi)
        rgb[where] = GRILLE_LIT[None, :] * k[:, None]

    # THE PLATE IS BRIGHT AND THE SLATS ARE THE THIN DARK LINES IN IT, which is
    # the way round the concept draws it and the opposite of what the sculpt
    # carries. Referencing the 35th percentile puts roughly two thirds of the
    # mouth on the lit brass and leaves only the darkest third, the slat lines
    # themselves, to ramp down; the floor at 0.72 keeps even those off black, so
    # no line inside the mouth can read as the gap between two teeth.
    band(inner, 0.72, 1.02, 35)
    # the bezel: the same brass, a little further into the light
    band(shell, 0.94, 1.14, 55)
    # A CEILING, AND IT IS A CORRECTNESS PROPERTY RATHER THAN TASTE.
    # find_eyes looks for the eyes by sweeping a VALUE threshold down to 0.84
    # and pairing blobs that are level, mirrored and of comparable size. A
    # grille bright enough to cross that threshold can break into a left and a
    # right arc which are, by construction, level with each other and mirrored
    # about the centre line: a false pair of eyes sitting on the mouth. Holding
    # every grille pixel under 0.80 keeps it out of the sweep entirely, with
    # 0.04 of clearance under the lowest threshold in it. Scaling all three
    # channels by one factor is the same move _pin makes, so a clamped pixel
    # keeps its hue and its saturation and only gives up level.
    GRILLE_V_MAX = 0.80 * 255.0
    mx = rgb[:, :, :3].max(2)
    hot = mouth & (mx > GRILLE_V_MAX)
    if hot.any():
        k = (GRILLE_V_MAX / np.maximum(mx, 1e-6))[:, :, None]
        rgb = np.where(hot[:, :, None], rgb[:, :, :3] * k, rgb[:, :, :3]) \
            if rgb.shape[2] == 3 else np.concatenate(
                [np.where(hot[:, :, None], rgb[:, :, :3] * k, rgb[:, :, :3]), rgb[:, :, 3:]], 2)
    after = float(rgb[:, :, :3].mean(2)[mouth].mean()) / 255.0
    return np.clip(rgb, 0, 255), mouth, dict(
        blob=int(grille.sum()), px=int(mouth.sum()), slats=int(mouth.sum() - grille.sum()),
        shell=int(shell.sum()), clamped=int(hot.sum()),
        before=round(before, 4), after=round(after, 4))


# ── THE AUTHORED MOUTH ────────────────────────────────────────────────────
#
# WHY IT IS HERE AND NOT IN A PROMPT. Wave one asked the renderer for five
# mouths across sixteen head looks. Only the O came back different: smile,
# grille and zigzag all came back as the same slatted mouth, because the model
# has one idea of a robot mouth and a thin line on a ruler does not argue with
# it. Forty minutes of GPU bought one mouth. So the mouth joins the eye catch
# light, the wind up key and the coral sole on the list of things this file
# DRAWS rather than asks for.
#
# WHAT IS AND IS NOT NEW. The lighting is not new: an authored mouth is cut
# into the clay as a recess and then handed to the SAME find_grille and
# light_grille that have always run here. It lands on GRILLE_LIT, rides
# light_grille's own value ramp, sits under its 0.80 ceiling and is an accent
# no paint can reach, exactly as the rendered mouth is. Only the shape under
# the light is ours.
#
# THE DEFAULT IS UNCHANGED. With no mouth named, not one line below runs and
# the importer lights the mouth the render drew. Proved by re-deriving the live
# catalogue from the raws in a shadow tree: all 80 files, every sha identical.
MOUTHS_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bots-mouths.json")
# HOW FAR PAST THE MOUTH THE HEAL REACHES. Measured on the round head, which is
# the one that caught the first cut of this out: healing only the dark blob left
# a row of the render's own slats standing at the left end of the old mouth and
# the whole raised lip ridge round it, so the authored mouth shipped sitting
# next to a ghost of the one it replaced. THE HEAL IS THEREFORE A BOX, not a
# blob: the mouth's own bounding box grown by these fractions of its own size,
# which takes the lip modelling with it, plus any dark region touching that box
# and contained in it, which takes the slats.
MOUTH_HEAL_GROW = 5
MOUTH_HEAL_GROW_X = 0.10          # of the mouth's own width
MOUTH_HEAL_GROW_Y = 0.45          # of the mouth's own height
# a dark region touching the box joins the heal only if it also fits inside the
# box grown this much further, so a slat remnant comes with it and the neck
# shadow, which merely touches, does not
MOUTH_HEAL_REACH = 12
MOUTH_HEAL_DARK = 0.42
# a heal bigger than this share of the head is not a mouth, it is the file
# about to paint over the face. A breaker, never a clamp.
MOUTH_HEAL_MAX = 0.30
# how many relaxation passes the heal takes. Fixed, so the result is the same
# on every machine and on every run.
MOUTH_HEAL_ITERS = 180
_MOUTHS = None


def load_mouths():
    """The mouth table, read out of scripts/bots-mouths.json. Never retyped
    here: a cutter carrying its own copy of the table is a cutter that can draw
    a mouth nothing else has ever seen."""
    global _MOUTHS
    if _MOUTHS is None:
        t = json.load(open(MOUTHS_JSON, encoding="utf-8"))
        _MOUTHS = {"law": t["law"], "by": {m["id"]: m for m in t["mouths"]},
                   "order": [m["id"] for m in t["mouths"]]}
    return _MOUTHS


def _heal_clay(rgb, head, region):
    """PUT CLAY BACK WHERE THE RENDER'S MOUTH WAS.

    A hole is filled by solving for the smoothest surface that meets the clay
    round it, which is what a cheek is: the head's own light runs through the
    filled patch instead of stopping at its edge. Seeded with the nearest known
    pixel and then relaxed a fixed number of passes, so it is deterministic.

    WHY NOT _inpaint, WHICH THIS FILE ALREADY HAS. That one interpolates along
    rows and then down columns, and it is right for what it does: strip_brass
    removes a NARROW BAND at the neck, where a straight line between the two
    kept pixels either side is what was there. A mouth is not a band. It is a
    wide patch in the middle of a curved cheek, 250 px across and 100 tall on a
    factory render, and a straight horizontal blend across it flattens the
    cheek's own curvature and leaves a ridge down the middle of the face. The
    relaxation meets the clay on all four sides at once, so the surface it puts
    back is the surface that was there. Both are kept because they are answers
    to two different shapes of hole.

    Only pixels inside `region` are written. Everything else, on the head and
    off it, is left exactly as it was."""
    ys, xs = np.where(region)
    pad = MOUTH_HEAL_GROW * 3
    y0, y1 = max(int(ys.min()) - pad, 0), min(int(ys.max()) + pad + 1, rgb.shape[0])
    x0, x1 = max(int(xs.min()) - pad, 0), min(int(xs.max()) + pad + 1, rgb.shape[1])
    win = (slice(y0, y1), slice(x0, x1))
    reg = region[win]
    known = head[win] & ~reg
    if int(known.sum()) < 200:
        return None
    out = rgb[win][:, :, :3].astype(np.float32).copy()
    # SEED: every unknown pixel takes the nearest known one. That includes the
    # pixels off the head inside the window, which are seeded too so they hold
    # plausible clay and do not drag the relaxation toward the background.
    idx = ndimage.distance_transform_edt(~known, return_distances=False, return_indices=True)
    unk = ~known
    for c in range(3):
        ch = out[:, :, c]
        ch[unk] = ch[idx[0][unk], idx[1][unk]]
    for _ in range(MOUTH_HEAL_ITERS):
        for c in range(3):
            ch = out[:, :, c]
            ch[reg] = ndimage.uniform_filter(ch, 3)[reg]
    rgb = rgb.copy()
    patch = rgb[win]
    for c in range(3):
        patch[:, :, c][reg] = out[:, :, c][reg]
    rgb[win] = patch
    return rgb


def _grown_box(m, head, fx, fy, cx=None):
    """A mask's own bounding box, grown by these fractions of its own width and
    height, MIRRORED about the face's centre line when one is given, and cut to
    the head.

    THE MIRROR IS NOT TIDINESS. find_grille takes the largest dark blob that
    crosses the centre line, and on the round head the render's slats broke the
    mouth into pieces of which only the right hand one crossed: the box came
    back short on the left and a row of dark slats survived beside every small
    authored mouth. A mouth is symmetric about the face it is on, so the zone
    is too, and the ghost goes."""
    ys = np.nonzero(m.any(1))[0]
    xs = np.nonzero(m.any(0))[0]
    if not len(ys):
        return np.zeros(m.shape, bool)
    x0, x1 = int(xs[0]), int(xs[-1])
    if cx is not None:
        x0, x1 = min(x0, int(round(2 * cx)) - x1), max(x1, int(round(2 * cx)) - x0)
    gy = max(MOUTH_HEAL_GROW, int(round(fy * (ys[-1] - ys[0] + 1))))
    gx = max(MOUTH_HEAL_GROW, int(round(fx * (x1 - x0 + 1))))
    out = np.zeros(m.shape, bool)
    out[max(int(ys[0]) - gy, 0):int(ys[-1]) + gy + 1, max(x0 - gx, 0):x1 + gx + 1] = True
    return out & head


def _mouth_heal_zone(rgb, head, rendered, drawn, cx):
    """EVERYTHING THE OLD MOUTH LEFT BEHIND. The box round what the render drew,
    the box round what the table is about to draw, and any dark region that
    touches the first and still fits inside it: the slats, the lip ridge and the
    contact shadow all go, and a neck shadow that merely brushes the box does
    not."""
    zone = _grown_box(drawn, head, 0.06, 0.30, cx)
    if rendered is not None and rendered.any():
        zone |= _grown_box(rendered, head, MOUTH_HEAL_GROW_X, MOUTH_HEAL_GROW_Y, cx)
    reach = ndimage.binary_dilation(zone, np.ones((3, 3)), iterations=MOUTH_HEAL_REACH)
    _h, _s, v = hsv_full(rgb)
    lab, cnt = ndimage.label(head & (v <= MOUTH_HEAL_DARK))
    if cnt:
        # COUNTED, NOT SCANNED. The first cut of this asked `(lab == i)` of the
        # whole canvas three times per component; a factory render carries
        # hundreds of dark blobs and one bot took minutes. Two bincounts answer
        # both questions in two passes: how much of each component is in the
        # zone, and how much of it is outside the zone's reach.
        inzone = np.bincount(lab[zone], minlength=cnt + 1)
        outside = np.bincount(lab[~reach], minlength=cnt + 1)
        keep = [i for i in range(1, cnt + 1) if inzone[i] and not outside[i]]
        if keep:
            zone |= np.isin(lab, keep)
    return zone & head


def _mouth_coverage(spec, H, W, S):
    """The mouth's outline as coverage in [0,1] on an H by W box, drawn at S
    times and box averaged down. Every shape here is CONVEX ON EVERY ROW, which
    the caller then checks: see scripts/bots-mouths.json for why that is a law
    and not a preference."""
    kind = spec["shape"]
    hh, ww = int(round(H * S)), int(round(W * S))
    im = Image.new("L", (ww, hh), 0)
    d = ImageDraw.Draw(im)
    if kind == "plate":
        r = max(1.0, float(spec["cornerOfH"]) * hh)
        d.rounded_rectangle([0, 0, ww - 1, hh - 1], radius=r, fill=255)
    elif kind == "ellipse":
        d.ellipse([0, 0, ww - 1, hh - 1], fill=255)
    elif kind == "wedge":
        # A TRAPEZOID THAT NARROWS DOWNWARD, corners rounded by stroking the
        # inset outline with a round joint, since PIL has no rounded polygon.
        # One span on every row, like everything else in the table.
        tw = float(spec["taper"]) * ww
        # THE RADIUS CANNOT EXCEED HALF THE NARROW END. The first cut of this
        # took it straight from cornerOfH and, on the box head, the two bottom
        # corners crossed over each other and the wedge came out a blob.
        r = max(1.0, min(float(spec["cornerOfH"]) * hh, 0.45 * tw, 0.45 * ww, 0.45 * hh))
        pts = [(r, r), (ww - 1 - r, r),
               (ww / 2 + tw / 2 - r, hh - 1 - r), (ww / 2 - tw / 2 + r, hh - 1 - r)]
        d.polygon(pts, fill=255)
        d.line(pts + [pts[0]], fill=255, width=int(round(2 * r)), joint="curve")
    elif kind == "halfDisc":
        # THE BOTTOM HALF OF A TALL ELLIPSE: flat along the top, round
        # underneath, which is what an open smiling mouth is and, unlike a thin
        # crescent, is one span on every row. The two top corners are then
        # knocked off against a rounded rectangle so the lip does not end in a
        # point.
        d.ellipse([0, -hh, ww - 1, hh - 1], fill=255)
        cut = Image.new("L", (ww, hh), 0)
        ImageDraw.Draw(cut).rounded_rectangle([0, 0, ww - 1, hh - 1],
                                              radius=max(1.0, 0.20 * hh), fill=255)
        im = Image.fromarray(np.minimum(np.asarray(im), np.asarray(cut)))
    else:
        sys.exit(f"bots-mouths: unknown shape {kind!r}")
    a = np.asarray(im, np.float32) / 255.0
    return a.reshape(hh // S, S, ww // S, S).mean((1, 3)) if (hh % S == 0 and ww % S == 0) \
        else np.asarray(im.resize((int(round(W)), int(round(H))), Image.BOX), np.float32) / 255.0


def _mouth_depth(spec, cov):
    """HOW DEEP THE CLAY IS CUT, everywhere inside the mouth, in [0,1] with 1
    the shallowest. This is the only thing the five mouths disagree about after
    their outline, and it is what light_grille's ramp turns into brass: the
    shallow parts land on the lit plate, the deep parts on the dark lines in it,
    exactly as the sculpted grille's own slats and recess did.

    EVERY MARK CUTS AND NONE LIFTS, and that is light_grille's arithmetic
    talking, not a preference. Its ramp is clip(value / p35, 0.72, 1.02): a
    feature BELOW the mouth's own 35th percentile has a whole 0.72 to 1.0 of
    range to be seen in, and one above it saturates at 1.02 and is invisible.
    Measured: a mouth authored with a single lifted tooth came back a plain
    plate, the tooth 2 percent brighter than the clay round it. So a mark must
    be dark and must cover less than about a third of the mouth. Anything a
    mouth wants to say with a bright shape it has to say with its OUTLINE.

    Returned normalised to its own brightest pixel, so no mark can push a pixel
    of the mouth over find_grille's threshold."""
    h, w = cov.shape
    t = (np.arange(h, dtype=np.float32) + 0.5)[:, None] / h      # 0 at the top lip
    u = (np.arange(w, dtype=np.float32) + 0.5)[None, :] / w      # 0 at the left corner
    ramp = spec["ramp"]
    inside = cov >= 0.5
    if ramp["kind"] == "plate":
        D = float(ramp["top"]) + (float(ramp["bottom"]) - float(ramp["top"])) * t
        D = np.broadcast_to(D, cov.shape).copy()
    elif ramp["kind"] == "throat":
        # THE DEEPEST POINT IS THE FURTHEST FROM THE LIP, measured, so the ramp
        # follows whatever outline the shape has rather than a circle drawn on
        # top of it. A lit rim round a soft recess is what the concept scenes
        # carry and what stops an open mouth reading as a flat gold sticker.
        dist = ndimage.distance_transform_edt(inside).astype(np.float32)
        # SOFTENED, because a raw distance field has a RIDGE down its own medial
        # axis and on a shape with corners that ridge is a visible dark cross
        # inside the mouth. The concept scenes put one soft mid tone behind the
        # rim, not a spine. Blurred at a tenth of the mouth's short side, so the
        # softening is the same on a big head and a small one.
        dn = ndimage.gaussian_filter(dist, 0.10 * min(h, w))
        dn = dn / max(float(dn[inside].max()), 1e-6) if inside.any() else dn
        D = float(ramp["rim"]) + (float(ramp["core"]) - float(ramp["rim"])) \
            * dn ** float(ramp["power"])
    else:
        sys.exit(f"bots-mouths: unknown ramp {ramp['kind']!r}")
    for mk in spec.get("marks", []):
        k = mk["kind"]
        if k == "slats":
            n = int(mk["count"])
            pitch = 1.0 / n
            half = 0.5 * float(mk["widthOfPitch"]) * pitch
            inset = float(mk["insetOfH"])
            band = (t >= inset) & (t <= 1.0 - inset)
            hit = np.zeros(cov.shape, bool)
            for i in range(n):
                c = (i + 0.5) * pitch
                hit |= (np.abs(u - c) <= half) & band
            D = np.where(hit, D * float(mk["depth"]), D)
        elif k == "lip":
            # THE SHADOW UNDER THE TOP LIP: a dark band across the top of an
            # open mouth. It is what stops a wide bowl reading as a gold shield.
            D = np.where(t <= float(mk["heightOfH"]), D * float(mk["depth"]), D)
        elif k == "zigzag":
            peaks = int(mk["peaks"])
            amp = 0.5 * float(mk["amplitudeOfH"])
            # a triangle wave across the mouth, in the box's own coordinates
            phase = (u * peaks) % 1.0
            tri = np.abs(phase * 2.0 - 1.0) * 2.0 - 1.0        # -1 .. 1
            line = 0.5 + amp * tri
            hit = np.abs(t - line) <= 0.5 * float(mk["widthOfH"])
            D = np.where(hit, D * float(mk["depth"]), D)
        else:
            sys.exit(f"bots-mouths: unknown mark {k!r}")
    D = np.clip(D, 0.05, None)
    if inside.any():
        D = D / max(float(D[inside].max()), 1e-6)
    return np.clip(D, 0.05, 1.0)


def author_mouth(rgb, head, M, geom, mouth_id, expose_gain=1.0, grille=None):
    """DRAW ONE MOUTH FROM THE TABLE INTO THE CLAY.

    Heal the mouth the render drew, cut this one in its place, and hand the
    result back for find_grille and light_grille to light in the usual way.
    Nothing is lit here.

    `geom` is face_geometry's answer on THIS rgb, so the mouth is placed from
    the same eyes draw_face is about to draw. `expose_gain` maps this image into
    the levelled space find_grille's fixed threshold is calibrated in: 1.0 when
    the caller has already levelled, as process() has.

    A BREAKER AT EVERY STEP, never a clamp. A mouth that will not fit under the
    eyes, that runs off the chin or that comes out with a broken row sends the
    family back; it does not get quietly shrunk into place.

    Returns (rgb, mouth_mask, report) or (rgb, None, report) with `why` set."""
    T = load_mouths()
    if mouth_id not in T["by"]:
        sys.exit(f"bots-mouths: no mouth {mouth_id!r} in the table "
                 f"({', '.join(T['order'])})")
    spec, law = T["by"][mouth_id], T["law"]
    rep = {"mouth": mouth_id}
    ys = np.nonzero(head.sum(1))[0]
    if not len(ys):
        return rgb, None, {**rep, "why": "the head mask is empty"}
    seat = float(ys[-1])
    (ey, ex0), (_ey1, ex1) = geom["centres"][0], geom["centres"][1]
    r = float(geom["r"])
    sep = abs(float(ex1) - float(ex0))
    span = seat - float(ey)
    if span <= 0 or sep <= 0:
        return rgb, None, {**rep, "why": f"no room under the eyes (span {span:.0f}, sep {sep:.0f})"}

    # 1. PLACE, from the face and never from a pixel.
    W = float(spec["wOfSep"]) * sep
    H = float(spec["hOfSep"]) * sep
    mcy = float(ey) + float(law["drop"]) * span
    mcx = 0.5 * (float(ex0) + float(ex1))
    S = int(law["supersample"])
    box_h, box_w = int(round(H)), int(round(W))
    if box_h < 4 or box_w < 4:
        return rgb, None, {**rep, "why": f"the mouth comes out {box_w} by {box_h} px, too small to draw"}
    cov_box = _mouth_coverage(spec, box_h, box_w, S)
    D_box = _mouth_depth(spec, cov_box)
    top = int(round(mcy - box_h / 2.0))
    left = int(round(mcx - box_w / 2.0))
    cov = np.zeros(head.shape, np.float32)
    D = np.zeros(head.shape, np.float32)
    y0, x0 = max(top, 0), max(left, 0)
    y1, x1 = min(top + box_h, head.shape[0]), min(left + box_w, head.shape[1])
    if y1 <= y0 or x1 <= x0:
        return rgb, None, {**rep, "why": "the mouth lands off the canvas"}
    cov[y0:y1, x0:x1] = cov_box[y0 - top:y1 - top, x0 - left:x1 - left]
    D[y0:y1, x0:x1] = D_box[y0 - top:y1 - top, x0 - left:x1 - left]
    drawn = cov >= 0.5
    mask = drawn & head
    rep.update(box=[int(top), int(top + box_h - 1), int(left), int(left + box_w - 1)],
               eyeRow=round(float(ey), 1), eyeSep=round(sep, 1), eyeR=round(r, 1),
               seat=int(seat), drop=law["drop"], px=int(mask.sum()))

    # 2. THE BREAKERS, asked before anything is written.
    inside = float(mask.sum()) / max(float(drawn.sum()), 1.0)
    rep["insideHead"] = round(inside, 4)
    if inside < float(law["insideHeadMin"]):
        return rgb, None, {**rep, "why": f"only {inside:.0%} of the mouth lands on the head, "
                                         f"the law wants {float(law['insideHeadMin']):.0%}"}
    yy, xx = np.mgrid[0:head.shape[0], 0:head.shape[1]]
    keep_r = r * float(law["keepOutOfEyeR"])
    near = np.zeros(head.shape, bool)
    for (cy, cx) in geom["centres"]:
        near |= np.hypot(yy - cy, xx - cx) <= keep_r
    hit = int((mask & near).sum())
    rep["eyeKeepOutR"] = round(keep_r, 1)
    rep["eyeKeepOutHits"] = hit
    if hit:
        return rgb, None, {**rep, "why": f"{hit} px of the mouth sit inside the eyes' keep out "
                                         f"({keep_r:.0f} px of an eye centre); a mouth may never touch an eye"}
    # ROW CONVEXITY IS ASKED OF THE OUTLINE THE TABLE DREW, not of the outline
    # after the head has been cut out of it, and the difference is not a
    # technicality. Measured on the eight factory bots: six of them refused a
    # smile because ONE pixel of the head mask was missing under the top lip,
    # which split that row in two. light_grille closes the found blob with an
    # 11 px kernel before it fills anything, so a pinhole is filled and the
    # span is unaffected; a real concavity in the head is a different matter,
    # and that is caught downstream by the share of the authored mouth
    # find_grille actually lit.
    for y in np.nonzero(drawn.sum(1))[0]:
        xs = np.nonzero(drawn[y])[0]
        if xs[-1] - xs[0] + 1 != len(xs):
            return rgb, None, {**rep, "why": f"row {int(y)} of the mouth is in two pieces; every mouth in "
                                             f"the table must be convex on every row so light_grille's "
                                             f"span fill is a no op"}

    # 3. HEAL. The mouth the render drew goes back to clay, and so does the
    #    ground the new one will stand on, or the authored mouth ships with a
    #    ghost of the old one round it.
    if grille is None:
        _h, _s, _v = hsv_full(rgb)
        grille = find_grille(head, _v, M)
    rendered = mouth_region(grille, head) if grille.any() else None
    heal = _mouth_heal_zone(rgb, head, rendered, drawn & head, mcx)
    share = float(heal.sum()) / max(float(head.sum()), 1.0)
    rep["healedPx"] = int(heal.sum())
    rep["healedShare"] = round(share, 4)
    if share > MOUTH_HEAL_MAX:
        return rgb, None, {**rep, "why": f"the heal would cover {share:.0%} of the head, over the "
                                         f"{MOUTH_HEAL_MAX:.0%} a mouth may touch"}
    if heal.any():
        healed = _heal_clay(rgb, head, heal)
        if healed is None:
            return rgb, None, {**rep, "why": "not enough clay round the mouth to heal it"}
        rgb = healed

    # 4. CUT IT IN. The clay keeps its own colour and its own light and only
    #    gives up level, which is the move _pin and light_grille both make. The
    #    scale is set so the BRIGHTEST pixel of the recess lands on the law's
    #    recessValue in levelled space, which is under find_grille's 0.32: the
    #    mouth this draws is the mouth find_grille will hand on. It cannot
    #    change how the mouth looks, because light_grille's ramp divides by a
    #    percentile of these same values.
    rgb = rgb.copy()
    lev = rgb[:, :, :3].max(2) * (expose_gain / 255.0)
    top_v = float((lev * D)[mask].max()) if mask.any() else 0.0
    if top_v <= 0:
        return rgb, None, {**rep, "why": "the clay under the mouth is black"}
    k = float(law["recessValue"]) / top_v
    w = np.clip(cov, 0.0, 1.0)
    w = np.where(mask, 1.0, np.where(drawn, 0.0, w))     # hard inside, soft only outside
    keep = (w > 0) & (head | drawn)
    tgt = rgb[:, :, :3] * (k * D)[:, :, None]
    rgb[:, :, :3] = np.where(keep[:, :, None],
                             rgb[:, :, :3] * (1 - w)[:, :, None] + tgt * w[:, :, None],
                             rgb[:, :, :3])
    rep["recessTopV"] = round(float((rgb[:, :, :3].max(2) * expose_gain / 255.0)[mask].max()), 4)
    return np.clip(rgb, 0, 255), mask, rep


def mouth_for(family, override):
    """Which mouth this family wears: --mouth wins, then the manifest's own
    `mouth` on that family's head row, then none at all, which is the shipped
    behaviour and leaves the render's own mouth exactly where it is."""
    if override:
        return override
    for row in json.load(open(MANIFEST, encoding="utf-8")):
        if row.get("family") == family and row.get("folder") == "head":
            return row.get("mouth")
    return None


def lift_crevices(rgb, head, keep, floorV=0.26, upTo=0.45):
    """LIFT THE CONTACT SHADOWS OFF THE FLOOR OF THE PAINTABLE LAW.

    THE DEFECT, measured: the crevice where each ear lug meets the jaw renders
    near-black, and the paintable law calls anything under value 0.22 RUBBER --
    "soles, seams, tyre rims and the sunk dark core of every socket". Under the
    JOIN law there are no sockets left on a bot, so the only thing that band
    still catches on a head is this shadow, and catching it means the shadow is
    an accent: it keeps its own near-black in all eight paints. What a player
    sees is a hard black wedge cut into both shoulders. Seven of the eight heads
    carried one, the worst 1,009 pixels.

    A SHADOW IS NOT A MATERIAL. It should be painted, and come out as a dark
    version of whatever the player bought. So the head's clay is remapped
    monotonically from 0..upTo onto floorV..upTo: nothing above upTo moves at
    all, nothing crosses anything else, and the whole ramp lands clear of the
    rubber ceiling. The mouth and the eye are excluded, because both of them ARE
    materials and the contract wants them dark and lit respectively."""
    v = rgb[:, :, :3].max(2) / 255.0
    low = head & ~keep & (v < upTo) & (v > 0)
    if not low.any():
        return rgb, 0
    scale = np.ones_like(v)
    # new = floorV + v * (upTo - floorV) / upTo, applied as a per-pixel gain so
    # hue and saturation do not move: this is a lift, not a recolour.
    scale[low] = (floorV + v[low] * (upTo - floorV) / upTo) / np.maximum(v[low], 1e-6)
    out = rgb.copy()
    out[:, :, :3] = rgb[:, :, :3] * scale[:, :, None]
    return np.clip(out, 0, 255), int((head & ~keep & (v < 0.22)).sum())


def pin_coral(rgb, leg_mask, hip_y, floor_y):
    """Pin every shoe to ONE coral, keeping its own shading.

    TWO PROBLEMS, ONE FIX. The contract says coral is a FIXED accent that does
    not vary by family and is what makes a mixed bot read as one toy, yet each
    family came back a slightly different salmon, so a mixed bot wore four
    different shoes. And separately, the paint mask has to be able to find the
    coral in order NOT to paint over it: measured over these five families, the
    best colour-only rule catches 93 percent of the shoe while also catching 8
    percent of the clay, which is 32,000 body pixels that would keep bone cream
    in all eight paints.

    Both go away by pinning. The shoe is found HERE, where position is known
    (it is the bottom of the leg, and the contract says coral is reserved for
    feet), and its hue and saturation are replaced with the authored coral while
    its own luminance carries all the shading and every moulded seam. The
    shipped pixels then sit in a tight band that a denylist can separate from
    clay cleanly, which is what scripts/bots-paint-masks.py needs.
    """
    h, w = leg_mask.shape
    yy = np.mgrid[0:h, 0:w][0]
    ys = np.where(leg_mask.sum(1) > 0)[0]
    if len(ys) == 0:
        return rgb, 0
    # the shoe: the lower part of the leg, and warm enough to be the shoe rather
    # than the shaft above it. Position does the work; colour only trims.
    band = leg_mask & (yy >= ys[0] + (ys[-1] - ys[0]) * 0.55)
    a = rgb / 255.0
    mx, mn = a.max(2), a.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    warm = a[:, :, 0] >= a[:, :, 2]          # red at or above blue
    shoe = band & warm & (sat > 0.18)
    shoe = ndimage.binary_closing(shoe, np.ones((5, 5)))
    shoe &= leg_mask
    if shoe.sum() < 200:
        return rgb, 0
    lum = rgb[:, :, :3].mean(2)
    ref = float(np.median(lum[shoe]))
    out = rgb.copy()
    # CLAMP BELOW THE CLIPPING POINT. Scaling all three channels by the same
    # factor is what keeps hue and saturation EXACTLY constant, which is the
    # whole point of pinning: it puts every shoe pixel of every family on one
    # hue so a narrow denylist can find it. The moment the brightest channel
    # clips at 255 that stops being true, the saturation collapses, and the
    # pinned coral smears back across the same range as the clay. Coral's red is
    # 180, so 255/180 is the highest factor that keeps the scale linear.
    kmax = 255.0 / float(CORAL.max())
    k = np.clip(lum[shoe] / max(ref, 1e-3), 0.35, kmax)
    out[shoe] = CORAL[None, :] * k[:, None]
    return out, shoe


def neutral_clay(rgb, ink, masks, M, coral_mask, eye_mask=None, grille_mask=None):
    """Take the CLAY to neutral grey, and leave the four fixed accents alone.

    THE CONTRACT ASKS FOR THIS IN SO MANY WORDS: parts are rendered in neutral
    light, and the toy is painted in one pale clay "so its colour can be changed
    later", because the runtime multiplies the player's paint over the base. Bake
    the render's warmth into the part and the eight paints become eight muds.

    Balancing the MEAN, which is all neutralise() above does, is not enough. It
    removes the cast but leaves every individual pixel as warm as it was, and
    that has a consequence beyond colour: measured on this wave, the bone-cream
    clay sits at hue 30 with saturation past 0.18, which is INSIDE the brass
    band, so the paint mask called 45 to 62 percent of every torso "brass" and
    refused to paint it. The clay was competing with the accents for the same
    corner of colour space. Neutral clay cannot: it has no hue at all.

    The accents are identified HERE rather than in the mask deriver, because
    this is the only place that still knows where things are on a whole bot.
    Each one is found the way the contract describes it, not by a colour band:
      coral   the shoes, already pinned exactly by pin_coral
      metal   the ONE wind-up key: warm, saturated past the contract's metal
              floor, and on the torso, which is the only part allowed any
      eye     the lens and its ring, already pinned exactly by draw_face
      grille  the mouth, found on the centre line by find_grille

    THE EYE AND THE MOUTH ARE HANDED IN, and that is the fix for two shipped
    defects at once. This function used to find them itself, by colour: the eye
    was "the brightest thing on the bot" and the mouth "the darkest thing". On a
    top-lit head the brightest thing is the CROWN, and the darkest is the
    contact shadow under an ear lug. So the crown was protected from the clay
    pass on three families and shipped as a pale blue hole, and the eye was left
    to the clay pass on all eight and shipped with no face. Both are now found
    by geometry, once, before this runs -- see find_eyes and find_grille.
    """
    h, sat, v = hsv_full(rgb)

    # HOW MANY OF EACH, not how much of the colour. The contract is explicit:
    # exactly ONE brass key, TWO eye lenses, ONE grille. Taking every pixel that
    # passes a colour test instead caught 45,000 "metal" pixels on a torso whose
    # key is a fifth of that, because warm clay reaches the same saturation in
    # its shadows. Counting components is the difference between "the key" and
    # "everything on the chest that happens to be warm".
    def biggest(mask, n=1, min_px=200):
        lab, cnt = ndimage.label(mask)
        if cnt == 0:
            return np.zeros_like(mask)
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, cnt + 1))
        order = np.argsort(sizes)[::-1][:n]
        out = np.zeros_like(mask)
        for i in order:
            if sizes[i] >= min_px:
                out |= lab == (i + 1)
        return out

    head = masks["head"]; torso = masks["torso"]
    # THE KEY'S CORE, not its halo. A brass key on satin clay throws a warm
    # reflection onto the clay around it, and that halo passes the metal test
    # too. Protecting it keeps it warm, and the art gate then reads the key plus
    # its halo as the bot's metal: 4.2 to 7.7 percent of a torso against a 4
    # percent budget, with the halo reaching up into the neck's no-hardware
    # zone. Eroding first keeps the piece and drops the glow around it, and the
    # glow is clay, so it should go neutral with the rest of the clay.
    metal_raw = torso & is_metal(rgb)
    metal = biggest(ndimage.binary_closing(metal_raw, np.ones((5, 5))) & torso, 1)
    metal = ndimage.binary_erosion(metal, np.ones((5, 5)))
    lens = eye_mask if eye_mask is not None else np.zeros(ink.shape, bool)
    grille = grille_mask if grille_mask is not None else np.zeros(ink.shape, bool)
    keep = coral_mask | metal | lens | grille

    lum = rgb[:, :, :3].mean(2)
    out = rgb.copy()
    clay = ink & ~keep
    # a whisper of warmth is kept so the base does not read as dead concrete,
    # far below every accent band's floor
    out[clay] = np.stack([lum[clay] * 1.020, lum[clay] * 0.998, lum[clay] * 0.962], 1)
    return np.clip(out, 0, 255), dict(metal=int(metal.sum()), lens=int(lens.sum()),
                                      grille=int(grille.sum()), clay=int(clay.sum()))


def measure_ratios(masks, M, s, figure_h):
    """The cut toy's own proportions, as fractions of the contract's H. Measured
    on the MASKS, so what is reported is what was actually cut, not what the
    plate asked the model for."""
    def box(m):
        ys = np.where(m.sum(1) > 0)[0]; xs = np.where(m.sum(0) > 0)[0]
        return (int(ys[0]), int(ys[-1]), int(xs[0]), int(xs[-1])) if len(ys) else None
    # fractions of the ACTUAL figure height. Dividing by the nominal H instead
    # would report every ratio shrunk by the set fit factor, i.e. would call a
    # correctly proportioned bot out of band purely because the whole set was
    # scaled down to clear its canvases.
    H = figure_h
    side = arm_side(masks, M)
    ab = box(masks[side]); hb = box(masks["head"])
    lside = "legL" if masks["legL"].sum() >= masks["legR"].sum() else "legR"
    lb = box(masks[lside])
    r = {}
    if ab:
        r["armW"] = (ab[3] - ab[2] + 1) * s / H
        r["armL"] = (ab[1] - M["shoulder_y"]) * s / H
        r["armLOverW"] = r["armL"] / max(r["armW"], 1e-6)
    if hb:
        r["headH"] = (M["crease"] - hb[0]) * s / H
        # the head mask's own width INCLUDES the ear lugs, so it is headFullW
        # that this must be judged against. headCoreW is the dome alone, and
        # comparing a lugged width to the core band reports every family as
        # oversized when nothing is wrong.
        r["headFullW"] = (hb[3] - hb[2] + 1) * s / H
    r["bodyW"] = (M["torso_r"] - M["torso_l"]) * s / H
    if lb:
        r["legH"] = (lb[1] - M["hip"]) * s / H
        # THE FOOT, not the leg's bounding box. The leg mask runs from the body
        # centre out to the toe, so its box width is half the stance, and
        # reporting that as a foot puts every family half again over the band.
        # The foot is the widest ROW in the bottom quarter of the leg.
        lo = int(lb[1] - (lb[1] - lb[0]) * 0.25)
        widest = 0
        for y in range(lo, lb[1] + 1):
            for a, b in runs(masks[lside][y]):
                widest = max(widest, b - a)
        r["footW"] = widest * s / H
    both = masks["legL"] | masks["legR"]
    bxs = np.where(both.sum(0) > 0)[0]
    if len(bxs):
        r["stanceW"] = (bxs[-1] - bxs[0] + 1) * s / H
    return r


# ── 4. one bot ────────────────────────────────────────────────────────────

def hsv_full(rgb):
    """Hue in degrees, saturation and value, on a float RGB in 0..255. One
    definition: neutral_clay() finds the key with it and seat_the_key() finds
    the same key again on the registered part, so the two can never disagree
    about which pixels are the bot's one piece of metal."""
    a = rgb / 255.0
    mx, mn = a.max(2), a.min(2)
    v = mx
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    d = mx - mn
    h = np.zeros_like(v)
    lit = d > 0
    rm = lit & (mx == r); gm = lit & ~rm & (mx == g); bm = lit & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = ((b - r)[gm] / d[gm]) + 2
    h[bm] = ((r - g)[bm] / d[bm]) + 4
    return h * 60.0, sat, v


# THE PAINTABLE LAW's own brass band, read from the file the art gate and the
# mask deriver read. Three readers, one table.
ACCENTS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                      "bots-art-accents.json"), encoding="utf-8"))["accents"]


def is_metal(rgb):
    """The ONE brass key, for telling the accents apart on a whole bot.

    Saturation floor FIGURE.metalSatMin, which is what separates metal from the
    other two warm accents: brass measures 0.70, the grille 0.50 and the eye
    lens 0.19, so a floor at 0.60 has clearance on both sides. This is the
    right test for "which of the four accents is this pixel" and the WRONG one
    for "is there brass here" -- see is_law_brass."""
    h, sat, _ = hsv_full(rgb)
    return (h >= 20) & (h <= 60) & (sat >= FIG("metalSatMin"))


def is_law_brass(rgb):
    """BRASS AS THE ART GATE COUNTS IT, from the paintable law's own table.

    The gate's floor is saturation 0.18, not the 0.60 above, because a brass
    surface runs from a dark shaded edge to a bright specular and its
    saturation swings with it. Anything that strips brass has to strip it by
    THIS band or it leaves behind precisely the pixels the gate will fail.
    Measured: the sprocket torso came back with a brass collar band across its
    neck at rows 59 to 69, saturation between the two floors, so the strip
    stepped over all 1,182 pixels of it and the gate then reported 426 of them
    inside the neck's no-hardware radius."""
    b = ACCENTS["brass"]
    h, sat, v = hsv_full(rgb)
    return (h >= b["hueMin"]) & (h <= b["hueMax"]) & (sat >= b["satMin"]) & (v >= b["valueMin"])


def _inpaint(a, holes, al):
    """Close a hole in a part by interpolating across it, along rows first and
    down columns for whatever the rows could not reach.

    ONLY THE HOLE'S OWN PIXELS ARE WRITTEN. The version this replaces walked
    outward from the hole to find a bracketing pixel and then overwrote the
    whole span between the two, so on a torso whose brass reaches the
    silhouette it wrote a bar of interpolated clay clean across the body, and
    the shipped torsos came out gouged with horizontal streaks.

    THE COLUMN PASS IS NOT AN EXTRA, it is the case that actually happens. The
    thing being removed here is a collar the model drew AT THE NECK, and a
    collar is a band right across the part: on the sprocket torso it ran 186 px
    wide on a body 204 px wide, and once grown it left no kept pixel anywhere
    on those rows, so a row-only pass stepped over all 1,182 pixels of it and
    the gate failed the part. Down the column there is always clay above and
    below a band, which is exactly why a band is the easy direction to close.

    The clay around either is neutral, smooth and vertically ramped by this
    point, so what the interpolation puts back is what was there; anything
    cleverer would be inventing detail the model did not draw."""
    out = a.copy()
    done = ~holes
    for y in range(holes.shape[0]):
        hx = np.nonzero(holes[y])[0]
        if len(hx) == 0:
            continue
        gx = np.nonzero(al[y] & ~holes[y])[0]
        if len(gx) == 0:
            continue
        idx = np.searchsorted(gx, hx)
        for j, x in enumerate(hx):
            i = idx[j]
            lx = gx[i - 1] if i > 0 else None
            rx = gx[i] if i < len(gx) else None
            if lx is None:
                out[y, x] = a[y, rx]
            elif rx is None:
                out[y, x] = a[y, lx]
            else:
                t = (x - lx) / max(1, rx - lx)
                out[y, x] = a[y, lx] * (1 - t) + a[y, rx] * t
            done[y, x] = True
    left = holes & ~done
    if not left.any():
        return out
    for x in np.nonzero(left.sum(0))[0]:
        hy = np.nonzero(left[:, x])[0]
        gy = np.nonzero(al[:, x] & ~holes[:, x])[0]
        if len(gy) == 0:
            continue
        idx = np.searchsorted(gy, hy)
        for j, y in enumerate(hy):
            i = idx[j]
            uy = gy[i - 1] if i > 0 else None
            dy = gy[i] if i < len(gy) else None
            if uy is None:
                out[y, x] = a[dy, x]
            elif dy is None:
                out[y, x] = a[uy, x]
            else:
                t = (y - uy) / max(1, dy - uy)
                out[y, x] = a[uy, x] * (1 - t) + a[dy, x] * t
    return out


def strip_brass(torso):
    """Take every scrap of brass on the torso back to clay.

    GENEROUSLY. is_metal() is the accents law's colour test, and a colour test
    can only ever find the SATURATED core of a piece of brass: its blown
    specular has almost no saturation left and its shaded edge has almost no
    value, so both fall outside the band. Removing only what the test finds
    leaves a warm ghost of the key exactly where the key was, and the row
    interpolation then carries that ghost sideways as a brown streak across the
    chest. So the mask is closed and then dilated well past the piece before
    anything is filled, and what is filled is only ever interior body."""
    a = np.asarray(torso).astype(np.float32)
    al = a[:, :, 3] > 8
    if not al.any():
        return torso
    metal = is_law_brass(a[:, :, :3]) & al
    if not metal.any():
        return torso
    grown = ndimage.binary_dilation(
        ndimage.binary_closing(metal, np.ones((7, 7))), np.ones((13, 13))) & al
    return _to_img(_inpaint(a, grown, al))


def _to_img(a):
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def draw_key(torso, tier):
    """Draw the bot's ONE piece of metal: the torso's wind-up key.

    WHY IT IS DRAWN AND NOT MOVED. The first attempt lifted the model's own key
    off the chest and put it back at the contract's anchor, to keep the family's
    own shading. It cannot be done cleanly: the colour test that finds the key
    finds only its saturated core, so either a ghost stays behind or the patch
    that is carried across is a hard-edged cut-out with clay stuck to it, and
    the shipped torsos came out wearing two keys.

    And the contract does not ask for the family's own key. It is explicit that
    the four accents "are the same on every bot in this range", so the key is a
    FIXED accent, not a family trait, and drawing it is the honest reading. It
    is drawn from the SAME numbers scripts/bots-bake-parts.mjs draws it from, so
    a cut torso and a placeholder torso carry the same key in the same place,
    which is one more thing that makes a mixed bot read as one toy.

    Position is what keeps the art gate happy by construction: at the anchor
    below, the key's nearest corner sits 62 units from the neck against a
    no-hardware radius of 42, and its area is about 2 percent of the torso
    against a brass budget of 4."""
    nx, ny = RIG["torso"]["neck"]
    bw = BAND("bodyW")["target"] * H_CONTRACT
    bh = BAND("bodyH")["target"] * H_CONTRACT
    tk = (tier - 1) / 3.0
    kx, ky = nx + bw * 0.24, ny + bh * 0.42
    kr = bw * 0.052 + tk * 3

    layer = Image.new("RGBA", torso.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    base = (0xD9, 0xA4, 0x41)          # the accents law's brass
    d.rounded_rectangle([kx - kr * 0.28, ky - kr * 0.2, kx + kr * 0.28, ky + kr * 2.1],
                        radius=kr * 0.28, fill=base + (255,))
    for sgn in (-1, 1):
        c = (kx + sgn * kr * 0.85, ky - kr * 0.55)
        d.ellipse([c[0] - kr * 0.72, c[1] - kr * 0.72, c[0] + kr * 0.72, c[1] + kr * 0.72],
                  fill=base + (255,))
        d.ellipse([c[0] - kr * 0.30, c[1] - kr * 0.30, c[0] + kr * 0.30, c[1] + kr * 0.30],
                  fill=(0, 0, 0, 0))

    # THE CONTRACT'S LIGHT, on the key as on everything else: one soft key from
    # directly above, brightest at the top of the form and falling to
    # LIGHT.rampBottom at its base. Applied over the key's own height so it
    # reads as part of the same moulding rather than as a sticker.
    k = np.asarray(layer).astype(np.float32)
    ys = np.nonzero((k[:, :, 3] > 0).sum(1))[0]
    if len(ys):
        y0, y1 = int(ys[0]), int(ys[-1])
        t = np.clip((np.arange(k.shape[0]) - y0) / max(1, y1 - y0), 0, 1)
        ramp = (1.0 + (0.48 - 1.0) * t)[:, None, None]
        k[:, :, :3] *= ramp
    out = torso.copy()
    out.alpha_composite(_to_img(k))
    return out, int((k[:, :, 3] > 0).sum())


def arm_side(masks, M):
    """WHICH OF THE TWO DRAWN ARMS BECOMES THE ONE STORED ARM.

    One canonical arm is stored and the rig mirrors it, so this picks a winner
    between two arms the model drew independently. It used to take whichever
    side had MORE pixels, and more is the wrong thing to want: the failure a
    cut arm can have is bleeding outward into the body's edge or the head's
    lug, and every one of those failures ADDS pixels, so "more" selects for the
    defect. Measured on peeper, whose two arms differ by 30 percent: the left
    is 111 units across against a right of 86 and a contract band that stops at
    106, so the fatter side was chosen and then refused for not fitting the arm
    canvas, and with it went the whole family.

    measure() already has the honest number. arm_w is the MEDIAN arm width over
    every row where the belly showed three runs, so it is taken across both
    arms and no single fat one can move it far. The mitt runs about 1.12 of the
    shaft, so the arm whose box width is nearest 1.12 arm_w is the one that
    looks most like the arm this bot actually has."""
    want = M["arm_w"] * 1.12
    best, score = "armL", None
    for side in ("armL", "armR"):
        xs = np.where(masks[side].sum(0) > 0)[0]
        if len(xs) == 0:
            continue
        d = abs((xs[-1] - xs[0] + 1) - want)
        if score is None or d < score:
            best, score = side, d
    return best


def leg_handedness(canvas, pivot):
    """+1 if the canvas leaves its room on the +x side of the hip, else -1.
    That is the direction the stored leg's toe has to point."""
    return 1 if (canvas["w"] - 1 - pivot[0]) >= pivot[0] else -1


def leg_geometry(masks, M, lside):
    """The leg's HIP centre and which way its toe points.

    The hip is taken from the CONTRACT, mapped onto this render, and not
    measured off the mask. It cannot be measured: the contract puts the two hips
    50 units apart with a shaft about 40 wide, so the two shafts touch and the
    leg mask is a centre-line cut through one merged blob. Measuring its
    midpoint therefore returns the point halfway between the toe and the centre
    line, which sits about 18 units outboard of the real hip. Everything
    downstream inherits that error: the leg then claims to need 68 units of
    canvas on its inboard side where 62 exist, and the whole set is scaled down
    to make room for a gap that was never there."""
    lm = masks[lside]
    lxs = np.where(lm.sum(0) > 0)[0]
    scx = M["cx"] - M["hip_dx"] if lside == "legL" else M["cx"] + M["hip_dx"]
    lys = np.where(lm.sum(1) > 0)[0]
    toe = lm[int(lys[-1] - (lys[-1] - lys[0]) * 0.25):]
    txs = np.where(toe.sum(0) > 0)[0]
    fcx = float((txs[0] + txs[-1]) / 2) if len(txs) else scx
    return float(scx), (1 if fcx >= scx else -1)


def fit_factor(family, L):
    """How much this bot would have to shrink for every one of its parts to sit
    inside its canvas with the contract's margin still clear.

    THE SET TAKES THE WORST ONE. Clipping is the single largest remaining source
    of cheapness in this art: 23 of the 40 parts on the previous contract were
    cut flat by their own canvas, every arm had its hand amputated, and scaling
    a clipped sprite only scales the clip. But the fix cannot be per part or per
    family, because the whole reason a mixed bot reads as one toy is that every
    part of every family is at ONE scale. So this is measured on all eight and
    the smallest wins, and the assembled figure ends up a little under the
    contract's nominal H. That is the honest trade: a figure 3 percent short,
    against a foot with its toe sliced off."""
    src = os.path.join(KEYED, family + ".png")
    if not os.path.exists(src):
        return None
    a = np.asarray(Image.open(src).convert("RGBA"))
    ink = largest_component(a[:, :, 3])
    if ink is None:
        return None
    M, why = measure(ink, L)
    if M is None:
        return None
    s0 = H_CONTRACT / M["Hr"]
    masks = cut_masks(ink, M)
    worst, binder = 1.0, None
    plans = [
        ("head", masks["head"], (M["cx"], M["crease"]), RIG["head"], RIG["head"]["neck"]),
        # the torso is anchored on its HIPS; see the placement in process()
        ("torso", masks["torso"], (M["cx"], M["hip"]), RIG["torso"],
         [RIG["torso"]["neck"][0], RIG["torso"]["hipL"][1]]),
    ]
    side = arm_side(masks, M)
    acx = M["arm_lcx"] if side == "armL" else M["arm_rcx"]
    plans.append(("arm", masks[side], (acx, M["shoulder_y"]), RIG["arm"], RIG["arm"]["shoulder"]))
    lside = "legL" if masks["legL"].sum() >= masks["legR"].sum() else "legR"
    lm = masks[lside]
    scx, toe = leg_geometry(masks, M, lside)
    want = leg_handedness(RIG["leg"], RIG["leg"]["hip"])
    plans.append(("leg", lm, (scx, M["hip"]), RIG["leg"], RIG["leg"]["hip"], toe != want))

    for plan in plans:
        name, m, src_pt, canv, dst = plan[0], plan[1], plan[2], plan[3], plan[4]
        flip = plan[5] if len(plan) > 5 else False
        ys = np.where(m.sum(1) > 0)[0]; xs = np.where(m.sum(0) > 0)[0]
        if len(ys) == 0:
            continue
        if flip:
            lo, hi = int(xs[0]), int(xs[-1])
            src_pt = ((lo + hi) - src_pt[0], src_pt[1])
        # the four distances from the pivot to the ink's edges, in render px,
        # against the room the canvas leaves on each side after the margin
        room = [dst[0] - MARGIN, canv["w"] - 1 - MARGIN - dst[0],
                dst[1] - MARGIN, canv["h"] - 1 - MARGIN - dst[1]]
        need = [src_pt[0] - xs[0], xs[-1] - src_pt[0], src_pt[1] - ys[0], ys[-1] - src_pt[1]]
        for edge, rm, nd in zip(("left", "right", "top", "bottom"), room, need):
            if nd > 0 and rm / (nd * s0) < worst:
                worst = rm / (nd * s0)
                binder = f"{name} {edge}: needs {nd * s0:.0f} units, canvas offers {rm}"
    return min(1.0, worst), binder


def family_tier(family):
    """The family's tier, from the same manifest write_parts() writes by."""
    for row in json.load(open(MANIFEST, encoding="utf-8")):
        if row.get("family") == family:
            return int(row["tier"])
    return 1


def process(family, L, level_target, dry, k=1.0, mouth=None):
    src = os.path.join(KEYED, family + ".png")
    if not os.path.exists(src):
        return {"family": family, "verdict": "FAIL", "why": "no keyed render"}
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im)
    ink = largest_component(a[:, :, 3])
    if ink is None:
        return {"family": family, "verdict": "FAIL", "why": "nothing left after keying"}

    rgb, gain, level = neutralise(a[:, :, :3].astype(np.float32), ink)
    # ONE exposure per bot, so eight families sit at one level and a mixed bot
    # does not read as two toys. Still once per bot, never per part.
    rgb = np.clip(rgb * (level_target / max(level, 1e-3)), 0, 255)

    M, why = measure(ink, L)
    if M is None:
        return {"family": family, "verdict": "FAIL", "why": why}

    s = (H_CONTRACT / M["Hr"]) * k    # THE ONE SHARED SCALE, times the set fit factor
    masks = cut_masks(ink, M)
    # pin both shoes to the authored coral before anything is cut out of them
    coral_mask = np.zeros(ink.shape, bool)
    for side in ("legL", "legR"):
        rgb, sh = pin_coral(rgb, masks[side], M["hip"], M["floor"])
        if np.ndim(sh):
            coral_mask |= sh
    coral_px = int(coral_mask.sum())

    # THE FACE, before the clay pass and before anything is cut, for the same
    # reason the shoes are pinned here: this is the last place that still knows
    # where things are on a WHOLE BOT, and an eye found on a cut-out head has
    # already lost the centre line that tells an eye from a crown specular.
    # THE AUTHORED MOUTH, IF THIS FAMILY WEARS ONE, and nothing below this
    # block knows the difference: it heals the mouth the render drew and cuts
    # the table's shape into the clay in its place, so find_grille and
    # light_grille go on doing exactly what they have always done. With no
    # mouth named not one line of it runs.
    mouth_id = mouth_for(family, mouth)
    authored, mouth_rep = None, None
    if mouth_id:
        geom = face_geometry(rgb, masks["head"], M)
        if geom is None:
            return {"family": family, "verdict": "FAIL",
                    "why": "no symmetric pair of eyes on the head; refusing to ship a faceless bot",
                    "ratios": {}, "outside_band": []}
        rgb, authored, mouth_rep = author_mouth(rgb, masks["head"], M, geom, mouth_id)
        if authored is None:
            return {"family": family, "verdict": "FAIL",
                    "why": f"authored mouth {mouth_id}: {mouth_rep.get('why')}",
                    "ratios": {}, "outside_band": [], "mouth": mouth_rep}
    _h, _s, _v = hsv_full(rgb)
    grille_mask = find_grille(masks["head"], _v, M)
    # THE MOUTH IS LIT BEFORE THE EYE IS, so draw_face's own median references
    # are taken against a face whose darkest region is already where it will
    # ship. Both are pins on regions found by geometry, so the order changes
    # nothing about WHERE either one lands.
    rgb, grille_mask, grille_rep = light_grille(rgb, masks["head"], grille_mask)
    if authored is not None:
        # THE MOUTH THAT SHIPS MUST BE THE MOUTH THE TABLE DREW. find_grille
        # takes the biggest dark blob crossing the centre line, and on a healed
        # head that is the authored recess; if it is not, something else on this
        # render is darker and the family goes back rather than shipping a
        # gold band somewhere nobody drew one.
        got = float((grille_mask & authored).sum()) / max(float(authored.sum()), 1.0)
        mouth_rep["foundShare"] = round(got, 4)
        mouth_rep["litPx"] = int(grille_mask.sum())
        if got < 0.90:
            return {"family": family, "verdict": "FAIL",
                    "why": f"authored mouth {mouth_id}: find_grille lit only {got:.0%} of it; "
                           f"something darker than the mouth is on this head's centre line",
                    "ratios": {}, "outside_band": [], "mouth": mouth_rep}
    rgb, eye_mask, face = draw_face(rgb, masks["head"], M, grille_mask)
    if face is None:
        # NEVER A GUESS. A head with no symmetric pair of lit eyes is a head
        # this cutter cannot give a face to, and a faceless bot is exactly the
        # thing this wave exists to stop shipping.
        return {"family": family, "verdict": "FAIL",
                "why": "no symmetric pair of eyes on the head; refusing to ship a faceless bot",
                "ratios": {}, "outside_band": []}
    # THE CONTACT SHADOWS COME OFF THE FLOOR of the paintable law, so the wedge
    # at each ear lug is painted with the body instead of staying near-black in
    # all eight paints.
    if authored is not None:
        # A MOUTH MAY NEVER TOUCH AN EYE, asked of the mouth that will SHIP
        # (light_grille's, which closes and span fills the authored one) against
        # the eyes draw_face actually DREW, bezel included. The keep out that
        # placed the mouth was measured before either existed, so this is the
        # question asked again of the finished face.
        _yy, _xx = np.mgrid[0:masks["head"].shape[0], 0:masks["head"].shape[1]]
        bez = np.zeros(masks["head"].shape, bool)
        for (_cy, _cx) in face["eyes"]:
            bez |= np.hypot(_yy - _cy, _xx - _cx) <= face["r"] * EYE_RING_R
        touch = int((grille_mask & bez).sum())
        mouth_rep["eyeBezelHits"] = touch
        if touch:
            return {"family": family, "verdict": "FAIL",
                    "why": f"authored mouth {mouth_id}: {touch} px of the lit mouth fall inside the eyes "
                           f"draw_face drew",
                    "ratios": {}, "outside_band": [], "mouth": mouth_rep}
    rgb, wedge_px = lift_crevices(rgb, masks["head"], eye_mask | grille_mask)
    face["wedgeBefore"] = wedge_px

    # THE CLAY GOES NEUTRAL. Everything after this point sees a base the paint
    # system can actually tint and accent bands that do not compete with it.
    rgb, accent_px = neutral_clay(rgb, ink, masks, M, coral_mask,
                                  eye_mask=eye_mask, grille_mask=grille_mask)
    accent_px["face"] = face
    if mouth_rep is not None:
        accent_px["mouth"] = mouth_rep
    out = {}

    # HEAD ---------------------------------------------------------------
    hc = RIG["head"]
    head = place(rgb, masks["head"], s, (M["cx"], M["crease"]), hc, hc["neck"])
    # THE SKIRT CONTINUES THE HEAD'S OWN SILHOUETTE. dome_underside measures
    # that silhouette itself now; it used to be handed a half width taken off
    # mask_width_at, which reads the widest contiguous RUN and so returned the
    # head's CORE while the lugs stood outboard of it unmeasured. The head draws
    # LAST in the contract order, so this piece is the one that overhangs and
    # hides the shoulder cap: a skirt half the width of the head it hangs from
    # does not reach the cap, and the cap then shows its own sawn-off top.
    head = dome_underside(head, depth=SKIRT * 0.92, direction=1)
    out["head"] = head

    # TORSO --------------------------------------------------------------
    tc = RIG["torso"]
    # ANCHORED ON ITS HIPS, not on its neck, for the reason the leg is anchored
    # on its foot. The set fit factor takes the whole figure a few percent under
    # the contract's nominal H, so a torso hung from its neck ends a few rows
    # short of the hip row and every family ends somewhere different. Measured
    # at fit 0.954: the torso's own hip lands on row 211 against the contract's
    # 218, the art gate reports both hip points as AIR on five families, and
    # what a player sees is each leg hanging off the bottom of the body.
    # Anchored on the hips, every family's legs attach exactly where the
    # contract puts them and the slack moves to the NECK, which is the one end
    # that cannot show: the head's 56 row skirt is drawn over it, and this
    # torso's own skirt runs up under that.
    torso = place(rgb, masks["torso"], s, (M["cx"], M["hip"]), tc, [tc["neck"][0], tc["hipL"][1]])
    # THE TORSO'S BURIED SKIRT RUNS UP, and it used to run down. The contract
    # is one sentence -- "head art continues this far below its seat, torso art
    # this far above its neck" -- and the torso got the head's direction. What
    # shipped: every drawn torso starts flat at row 64, its neck row, with no
    # skirt above it at all, and grows 30 to 40 rows of clay BELOW its hips that
    # the contract does not have. The placeholder torso runs 7 to 220 and is the
    # shape to match. A torso with no skirt is a gap at the neck the moment a
    # head sits a pixel high; the clay below the hips is clay between the legs.
    # THE ONE BRASS PIECE comes off BEFORE the skirt is smeared, because the
    # smear carries the cut row along and a cut row with brass in it lays a
    # brown band the length of the skirt, and goes back on AFTER, at the
    # contract's own anchor and cut to the brass budget.
    torso = strip_brass(torso)
    torso = dome_underside(torso, depth=SKIRT * 0.8, direction=-1)
    # AND THE HIPS GET THE SAME TREATMENT AS THE HEAD'S SEAT, for the same
    # reason and by the same function. LAW 2 says "a cut edge continues as a
    # dome, never as a flat bar", and it was only ever applied to one of this
    # part's two cuts. Measured on the shipped torsos, the silhouette runs 146
    # to 199 px wide at row 217 and 0 at row 219: the body stops dead across the
    # hips with two square corners, and on an assembled bot that reads as a dark
    # slot cut straight through the toy at the waist, on all eight families.
    #
    # Shallow, and LIGHT rather than dark. The head's skirt is buried behind the
    # torso and is darkened to 0.62 because it is a shadow nobody sees; this one
    # is drawn OVER the legs and is the bottom of the belly, so it keeps almost
    # all its value and simply curves away. Deeper than this and the torso eats
    # the leg it is supposed to sit on.
    torso = dome_underside(torso, depth=TORSO_HIP_DOME, direction=1, darken_to=0.90)
    torso, key_px = draw_key(torso, family_tier(family))
    out["torso"] = torso

    # ARM ----------------------------------------------------------------
    # ONE canonical arm: the rig mirrors it for the other side, so storing two
    # is storing a contradiction. Take whichever side the cut found more of.
    ac = RIG["arm"]
    side = arm_side(masks, M)
    acx = M["arm_lcx"] if side == "armL" else M["arm_rcx"]
    # Anchored on the HAND for the same reason the leg is anchored on its foot:
    # the generated arm is a little shorter than the contract's target, both
    # ends cannot be exact, and of the two the hand is the one that shows. The
    # hand is where a weapon is gripped; the shoulder is buried under the head
    # and the torso, and the cap carries the shaft up to it.
    a_ys = np.where(masks[side].sum(1) > 0)[0]
    arm = place(rgb, masks[side], s, (acx, float(a_ys[-1])), ac, ac["hand"])
    arm = round_cap(arm, ac["shoulder"], edge_colour(rgb, masks[side], 10, "top"), M["arm_w"] * s)
    arm, arm_lat = desidelight(arm)
    out["arm"] = arm

    # LEG ----------------------------------------------------------------
    lc = RIG["leg"]
    lside = "legL" if masks["legL"].sum() >= masks["legR"].sum() else "legR"
    lm = masks[lside]
    # the hip sits on the SHAFT centre, not the foot centre: the toe splays
    # outward and a leg registered on the foot swings the whole limb inboard.
    shaft_cx, toe = leg_geometry(masks, M, lside)
    # ANCHOR THE LEG ON ITS FOOT, not on its hip, and it is worth saying why the
    # other way round is wrong. The generated legs come back a little shorter
    # than the contract's target, so the two anchors cannot both be exact. Hung
    # from the hip, each family's foot stops at a different height and the bots
    # stand at different heights on the same floor, which is the one error a
    # player sees immediately. Anchored on the foot, every family lands on ONE
    # floor line and the difference moves to the hip, which the torso draws over
    # and hides. The shaft is then carried up to the hip pivot by the same cap
    # that seats every other limb.
    lys_all = np.where(lm.sum(1) > 0)[0]
    leg = place(rgb, lm, s, (shaft_cx, float(lys_all[-1])), lc, lc["foot"],
                flip=(toe != leg_handedness(lc, lc["hip"])))
    leg = round_cap(leg, lc["hip"], edge_colour(rgb, lm, 10, "top"), M["arm_w"] * s)
    leg, leg_lat = desidelight(leg)
    out["leg"] = leg

    # THE PROPORTION GATE. Frame fill cannot see whether the model changed the
    # toy's internal proportions; these can, and they are the contract's own
    # bands, measured on what the cut actually produced rather than on what the
    # plate asked for. This is the check that "disproportionate, really cheap"
    # reduces to, so it is reported for every family whether it passes or not.
    ratios = measure_ratios(masks, M, s, H_CONTRACT * k)
    outside = []
    for k, v in ratios.items():
        b = BAND(k)
        if v < b["min"] * 0.95 or v > b["max"] * 1.05:
            outside.append(f"{k} {v:.3f} outside {b['min']:.3f}-{b['max']:.3f}")

    rep = {"family": family, "verdict": "ok", "shared_scale": round(s, 4),
           "ratios": {rk: round(rv, 3) for rk, rv in ratios.items()},
           "outside_band": outside,
           "render_H": M["Hr"], "three_run_rows": M["three_run_rows"],
           "gain": [round(float(g), 3) for g in gain], "level": round(level, 1),
           "arm_lateral_before": round(arm_lat, 2), "leg_lateral_before": round(leg_lat, 2),
           "coral_pinned_px": coral_px, "accent_px": accent_px,
           "key_px": key_px,
           "parts": {}}
    for slot, img in out.items():
        b = np.asarray(img)[:, :, 3] > 8
        ys = np.where(b.sum(1) > 0)[0]; xs = np.where(b.sum(0) > 0)[0]
        rep["parts"][slot] = {"ink": [int(xs[0]), int(ys[0]), int(xs[-1]), int(ys[-1])],
                              "canvas": [img.size[0], img.size[1]],
                              "clipped": bool(b[0].any() or b[-1].any() or b[:, 0].any() or b[:, -1].any())}
    if not dry:
        rep["written"] = write_parts(family, out)
    return rep


def write_parts(family, out):
    man = json.load(open(MANIFEST, encoding="utf-8"))
    wrote = []
    for row in man:
        if row.get("family") != family:
            continue
        slot = row["folder"]
        if slot not in out:
            continue
        d = os.path.join(PARTS, slot)
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, f"t{row['tier']}-{row['design']}.png")
        out[slot].save(p)
        wrote.append(os.path.relpath(p, ROOT).replace("\\", "/"))
    return wrote


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--family")
    ap.add_argument("--dry-run", action="store_true")
    # THE MOUTH, and leaving it off is the shipped behaviour. Named, every
    # family gets that mouth from scripts/bots-mouths.json instead of the one
    # its render drew; left off, each family takes the `mouth` on its own head
    # row in the manifest, and with neither the file does exactly what it did
    # before this argument existed.
    ap.add_argument("--mouth", help="a mouth id from scripts/bots-mouths.json, for every family")
    args = ap.parse_args()
    if args.mouth:
        T = load_mouths()
        if args.mouth not in T["by"]:
            sys.exit(f"--mouth {args.mouth!r} is not in {os.path.relpath(MOUTHS_JSON, ROOT)} "
                     f"({', '.join(T['order'])})")

    L = json.load(open(os.path.join(KITS, "skeleton.json"), encoding="utf-8"))
    fams = [args.family] if args.family else sorted(
        f[:-4] for f in os.listdir(KEYED) if f.endswith(".png"))

    # THE GATE'S VERDICT IS THE GATE'S TO MAKE. scripts/bots-gen-parts.mjs
    # --check writes the list of raws it passed; anything missing from it is a
    # bot that gate refused (tilted, arms merged, re-composed) and must not be
    # cut. Recomputing the verdict here instead would be two files agreeing to
    # disagree, which is how a refused bot reaches the parts folder.
    usable_path = os.path.join(os.path.dirname(KEYED), "usable.json")
    if os.path.exists(usable_path):
        usable = set(json.load(open(usable_path, encoding="utf-8")))
        skipped = [f for f in fams if f not in usable]
        fams = [f for f in fams if f in usable]
    else:
        skipped = []

    # ONE exposure target for the whole set, measured as the median clay level
    # across the bots, so no single family drags the shelf.
    levels = []
    for f in fams:
        p = os.path.join(KEYED, f + ".png")
        if not os.path.exists(p):
            continue
        a = np.asarray(Image.open(p).convert("RGBA"))
        ink = largest_component(a[:, :, 3])
        if ink is None:
            continue
        levels.append(neutralise(a[:, :, :3].astype(np.float32), ink)[2])
    target = float(np.median(levels)) if levels else 180.0

    # PASS 1: the set's fit factor, the smallest shrink that clears every
    # canvas on every family. One number for all eight, so the shared scale
    # stays shared.
    # PASS 1. Each bot's own fit factor, and the SET takes the worst of the
    # ones it accepts.
    #
    # A BOT THAT NEEDS A BIG SHRINK IS REFUSED, NOT ABSORBED, and this is the
    # most important line in the file after the arm cut. The first run of this
    # set produced a fit factor of 0.586, i.e. every family would have been
    # scaled to 59 percent and the whole shelf would have lost 41 percent of its
    # resolution. The cause was not a canvas that is too small: it was two bots,
    # piston and hornet, whose feet came back splayed to a stance of 0.86 and
    # 0.82 H against a contract band that stops at 0.662, with feet half again
    # wider than the band's widest. Shrinking the set would have quietly made
    # every OTHER family pay for two bad generations, and left the two bad ones
    # in the game. So the tolerance is small, and past it the bot is sent back.
    FIT_FLOOR = 0.90
    fits = {}
    for f in fams:
        r = fit_factor(f, L)
        if r is not None:
            fits[f] = r
    ok = {f: v for f, v in fits.items() if v[0] >= FIT_FLOOR}
    k = min(v[0] for v in ok.values()) if ok else 1.0
    binders = sorted(fits.items(), key=lambda kv: kv[1][0])[:4]
    refused = {f: v[1] for f, v in fits.items() if v[0] < FIT_FLOOR}

    reps = []
    for f in fams:
        if f in refused:
            reps.append({"family": f, "verdict": "FAIL",
                         "why": f"does not fit its canvases at the set scale ({fits[f][0]:.2f}): {refused[f]}",
                         "ratios": {}, "outside_band": []})
        else:
            reps.append(process(f, L, target, args.dry_run, k, args.mouth))
    print(json.dumps({"skipped_by_raw_gate": skipped,
                      "level_target": round(target, 1), "set_fit_factor": round(k, 4),
                      "figure_height": round(H_CONTRACT * k, 1),
                      "fit_floor": FIT_FLOOR,
                      "tightest": [{"family": b[0], "fit": round(b[1][0], 3), "binder": b[1][1]} for b in binders],
                      "shared_scale_law":
                      "every part of every family scaled by H_contract / this bot's own ink height",
                      "bots": reps}, indent=1))
    bad = [r for r in reps if r["verdict"] != "ok"]
    if bad:
        print(f"\n{len(bad)} of {len(reps)} bots refused: " +
              ", ".join(f"{b['family']} ({b['why']})" for b in bad), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
