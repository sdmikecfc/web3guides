"""
Commander x camp-plate CONTACT SHEET + mismatch audit.

The in-scene grade was derived against ONE commander (wrench) on ONE plate (the
Panther). There are 8 commanders and 14 plates, so 112 pairings, and there is no
reason a blonde in a blue shirt sits on a snow-grey Chaffee plate the way a
brunette sits on the Panther. This renders every pairing exactly as the page
composites it and measures how far each one is from the plate it stands on.

Faithful to HqScene.tsx:
  filter: saturate(var --cmdr-sat) brightness(var --cmdr-bri) contrast(1.02)
          sepia(.18) blur(.35px), the two vars coming from COMMANDER_GRADE
  + a soft-light directional light masked to her alpha
  placement: height 32.5% of plate, centre at x=78%, bottom aligned

Result: a single global grade left 18/112 pairings in band; the per-commander
grade puts 112/112 in band.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
CMDR = os.path.join(ROOT, "public", "s5-art", "commander")
HQ = os.path.join(ROOT, "public", "s5-art", "hq")
OUT = r"C:\Users\Mike\Documents\Doma\s5-art-samples"

GIRLS = ["wrench", "vega", "havoc", "compass"]
MEN = ["diesel", "forge", "granite", "jackal"]

# CSS order, from the shipped rule
CON, SEP = 1.02, 0.18
# Per-commander, mirroring COMMANDER_GRADE in src/lib/s5/model.ts. One global
# filter could not serve eight palettes: it put 94 of 112 pairings out of band.
GRADE = {
    "wrench": (0.43, 0.61), "vega": (1.09, 0.65), "havoc": (0.82, 0.74),
    "compass": (0.86, 0.88), "diesel": (1.29, 1.32), "forge": (0.83, 1.76),
    "granite": (1.72, 1.01), "jackal": (0.87, 1.37),
}
H_FRAC, X_FRAC = 0.325, 0.78


def plates():
    out = [("panther (default)", os.path.join(HQ, "camp-portrait.webp"))]
    d = os.path.join(HQ, "plates")
    for f in sorted(os.listdir(d)):
        if f.endswith(".webp"):
            out.append((f[len("camp-"):-len(".webp")], os.path.join(d, f)))
    return out


def mat_saturate(s):
    return np.array([
        [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
    ])


SEPIA = np.array([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]])


def apply_filter(rgb, sat, bri):
    """rgb float 0..1, shape (h,w,3). CSS filters apply left to right."""
    x = rgb @ mat_saturate(sat).T
    x = x * bri
    x = x * CON + (0.5 - 0.5 * CON)
    m = (1 - SEP) * np.eye(3) + SEP * SEPIA
    x = x @ m.T
    return np.clip(x, 0, 1)


def soft_light(cb, cs):
    d = np.where(cb <= 0.25, ((16 * cb - 12) * cb + 4) * cb, np.sqrt(np.clip(cb, 0, 1)))
    return np.where(cs <= 0.5,
                    cb - (1 - 2 * cs) * cb * (1 - cb),
                    cb + (2 * cs - 1) * (d - cb))


def light_overlay(h, w):
    """The two gradients from .s5hq-cmdr-light, premultiplied into (rgb, alpha)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    u, v = xx / max(1, w - 1), yy / max(1, h - 1)
    # radial-gradient(115% 75% at 10% 90%) warm firelight
    r = np.sqrt(((u - 0.10) / 1.15) ** 2 + ((v - 0.90) / 0.75) ** 2)
    warm_a = np.interp(r, [0.0, 0.34, 0.64], [0.42, 0.15, 0.0], right=0.0)
    # linear-gradient(205deg) cool sky, 0 -> 58%
    ang = np.deg2rad(205.0)
    t = (np.sin(ang) * u - np.cos(ang) * v)
    t = (t - t.min()) / max(1e-9, (t.max() - t.min()))
    cool_a = np.clip(np.interp(t, [0.0, 0.58], [0.24, 0.0], right=0.0), 0, 1)
    warm = np.array([255, 150, 60]) / 255.0
    cool = np.array([130, 170, 210]) / 255.0
    # warm layer sits ON TOP of the cool layer (first listed wins in CSS)
    a = warm_a + cool_a * (1 - warm_a)
    rgb = (warm * warm_a[..., None] + cool * cool_a[..., None] * (1 - warm_a[..., None]))
    rgb = np.divide(rgb, np.maximum(a[..., None], 1e-6))
    return rgb, a


def graded_commander(path, target_h, ck):
    im = Image.open(path).convert("RGBA")
    w = max(1, int(round(im.width * target_h / im.height)))
    im = im.resize((w, target_h), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float64) / 255.0
    rgb, alpha = arr[..., :3], arr[..., 3]
    sat, bri = GRADE.get(ck, (1.0, 1.0))
    rgb = apply_filter(rgb, sat, bri)
    lrgb, la = light_overlay(target_h, w)
    rgb = rgb * (1 - la[..., None]) + soft_light(rgb, lrgb) * la[..., None]
    out = np.dstack([np.clip(rgb, 0, 1) * 255, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA").filter(ImageFilter.GaussianBlur(0.35)), rgb, alpha


def sat_val(rgb, mask=None):
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    if mask is not None:
        sel = mask > 0.78
        if sel.sum() == 0:
            return 0.0, 0.0
        return float(s[sel].mean()), float(mx[sel].mean())
    return float(s.mean()), float(mx.mean())


def build(names, label, cell_w=210):
    ps = plates()
    rows, report = [], []
    for ck in names:
        cpath = os.path.join(CMDR, ck + ".png")
        cells = []
        for tname, ppath in ps:
            plate = Image.open(ppath).convert("RGB")
            ch = max(2, int(round(plate.height * H_FRAC)))
            fig, frgb, falpha = graded_commander(cpath, ch, ck)
            cx = int(round(plate.width * X_FRAC - fig.width / 2))
            cy = plate.height - fig.height
            comp = plate.copy()
            comp.paste(fig, (cx, cy), fig)
            # the plate palette WHERE SHE STANDS, not the whole painting
            box = (max(0, cx), max(0, cy), min(plate.width, cx + fig.width), plate.height)
            local = np.asarray(plate.crop(box)).astype(np.float64) / 255.0
            ps_, pv_ = sat_val(local)
            gs, gv = sat_val(frgb, falpha)
            report.append((ck, tname, gs, gv, ps_, pv_,
                           gs / max(ps_, 1e-6), gv / max(pv_, 1e-6)))
            cells.append((tname, comp))
        rows.append((ck, cells))

    cw = cell_w
    chh = int(cw * 4 / 3)
    pad, top, left = 6, 26, 86
    W = left + len(ps) * (cw + pad) + pad
    H = top + len(rows) * (chh + pad) + pad
    sheet = Image.new("RGB", (W, H), (14, 16, 20))
    d = ImageDraw.Draw(sheet)
    for i, (tname, _) in enumerate(ps):
        d.text((left + i * (cw + pad) + 4, 8), tname[:22], fill=(190, 200, 210))
    for r, (ck, cells) in enumerate(rows):
        y = top + r * (chh + pad)
        d.text((6, y + chh // 2), ck, fill=(230, 200, 140))
        for c, (_, comp) in enumerate(cells):
            sheet.paste(comp.resize((cw, chh), Image.LANCZOS), (left + c * (cw + pad), y))
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, f"_COMBOS_{label}.png")
    sheet.save(p)
    return p, report


def main():
    allrep = []
    paths = []
    for names, label in ((GIRLS, "girls"), (MEN, "men")):
        p, rep = build(names, label)
        paths.append(p)
        allrep += rep
    print("sheets:")
    for p in paths:
        print("  " + p + "  (%.1f KB)" % (os.path.getsize(p) / 1024))
    # target from the tuned pairing: ~1.3x plate saturation, ~1.05x its value
    allrep.sort(key=lambda r: -abs(r[6] - 1.3))
    print("\nWORST 18 MISMATCHES (sat ratio vs the plate she stands on; 1.3 = the tuned target)")
    print(f"{'commander':10} {'plate':16} {'herSat':>7} {'plateSat':>9} {'ratio':>6} {'valRatio':>9}")
    for ck, tn, gs, gv, ps_, pv_, rs, rv in allrep[:18]:
        print(f"{ck:10} {tn:16} {gs:7.3f} {ps_:9.3f} {rs:6.2f} {rv:9.2f}")
    ok = [r for r in allrep if 0.95 <= r[6] <= 1.75]
    print(f"\n{len(ok)}/{len(allrep)} pairings inside a sane saturation band (0.95-1.75x)")


if __name__ == "__main__":
    main()
