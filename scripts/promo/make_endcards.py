# End cards for the S6 promo, both formats. The map-frame grammar: dark
# ground, amber corner brackets, the ADR-0126 money line (never "win $X"),
# launchwars.xyz as the one CTA.
from PIL import Image, ImageDraw, ImageFont

SP = r"C:\Users\Mike\AppData\Local\Temp\claude\C--Users-Mike-Desktop-trading-bot--claude-worktrees-clever-clarke-50cbb4\447c6f2b-c4f9-4db6-af73-7917a13a8086\scratchpad"
AMBER = (240, 179, 64)
INK = (233, 237, 241)
DIM = (170, 180, 189)
BG = (11, 13, 16)

def F(px, bold=True):
    try:
        return ImageFont.truetype("segoeuib.ttf" if bold else "segoeui.ttf", px)
    except OSError:
        return ImageFont.load_default()

def brackets(d, w, h, inset, arm, width=4, alpha_col=AMBER):
    i = inset
    for cx, cy, dx, dy in [(i, i, 1, 1), (w - i, i, -1, 1), (i, h - i, 1, -1), (w - i, h - i, -1, -1)]:
        d.line([(cx, cy), (cx + arm * dx, cy)], fill=alpha_col, width=width)
        d.line([(cx, cy), (cx, cy + arm * dy)], fill=alpha_col, width=width)

def card(w, h, out):
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    # faint vignette ground
    grad = Image.new("L", (1, h))
    for y in range(h):
        grad.putpixel((0, y), int(18 + 26 * abs(y / h - 0.5) * 2))
    im.paste(Image.new("RGB", (w, h), (16, 20, 25)), (0, 0), grad.resize((w, h)))
    d = ImageDraw.Draw(im)
    brackets(d, w, h, inset=int(min(w, h) * 0.045), arm=int(min(w, h) * 0.075))
    cx = w // 2
    s = h / 1080 if w > h else h / 1920
    ys = h * (0.30 if w > h else 0.33)
    gap = 1 if w > h else 1.12
    d.text((cx, ys), "SEASON 6 · UPRISING", font=F(int(34 * s)), fill=AMBER, anchor="mm")
    d.text((cx, ys + 92 * s * gap), "LAUNCH WARS", font=F(int(128 * s)), fill=INK, anchor="mm")
    d.text((cx, ys + 205 * s * gap), "A war for real internet domains.", font=F(int(46 * s), bold=False), fill=INK, anchor="mm")
    d.text((cx, ys + 285 * s * gap), "Watch free. Play free. Own a piece from $5.", font=F(int(36 * s), bold=False), fill=DIM, anchor="mm")
    d.text((cx, ys + 350 * s * gap), "$1,000 season pool. Every domain pays its holders.", font=F(int(36 * s), bold=False), fill=DIM, anchor="mm")
    d.text((cx, ys + 480 * s * gap), "launchwars.xyz", font=F(int(72 * s)), fill=AMBER, anchor="mm")
    im.save(out)
    print(out)

card(1920, 1080, SP + r"\endcard_169.png")
card(1080, 1920, SP + r"\endcard_916.png")
