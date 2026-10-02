"""
Cutout pipeline for NANO BANANA output.

Why this exists: the S5 sprite pipeline was built on gpt-image-2, which reliably
paints the flat #FF00FF plate that key-s5-games.js chroma-keys against. Nano
banana IGNORES that instruction (measured: corners came back 195,74,125 dusty
mauve, 0.0% pure magenta), so the chroma keyer cannot cut it. Nano banana is 1
credit an image against gpt-image-2's 7, so the cheap path is worth keeping:
generate with NO plate instruction at all, then cut locally with rembg, which
costs nothing.

  nano banana (1 credit)  ->  rembg (free)  ->  largest component  ->  512px
  gpt-image-2 (7 credits) ->  magenta chroma key  (key-s5-games.js)

Both land in the same place: a tight, transparent, 512px PNG in
public/s5-art/games/<game>/. Use whichever suits the asset.

  python key-nano.py <src.png> <game> <name> [--max 512]
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))


def largest_component(alpha, thresh=8):
    """Keep only the biggest blob: generators like to leave specks and a stray
    shadow puddle, and a 3-pixel speck in a corner ruins the bbox crop."""
    solid = alpha > thresh
    h, w = solid.shape
    lab = np.zeros((h, w), np.int32)
    cur = 0
    best, best_n = 0, 0
    stack = []
    for y in range(h):
        for x in range(w):
            if not solid[y, x] or lab[y, x]:
                continue
            cur += 1
            n = 0
            stack.append((y, x))
            lab[y, x] = cur
            while stack:
                cy, cx = stack.pop()
                n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = cur
                        stack.append((ny, nx))
            if n > best_n:
                best, best_n = cur, n
    return lab == best if best else solid


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 1
    src, game, name = sys.argv[1], sys.argv[2], sys.argv[3]
    mx = 512
    if "--max" in sys.argv:
        mx = int(sys.argv[sys.argv.index("--max") + 1])

    from rembg import remove

    im = Image.open(src).convert("RGBA")
    cut = remove(im)
    a = np.asarray(cut).astype(np.uint8)
    alpha = a[..., 3]

    # downsample the mask for the component walk: a 1024^2 python flood fill is
    # slow and we only need it to pick WHICH blob, not to shape the edge
    small = np.asarray(Image.fromarray(alpha).resize((256, 256), Image.NEAREST))
    keep_small = largest_component(small)
    keep = np.asarray(Image.fromarray((keep_small * 255).astype(np.uint8))
                      .resize(alpha.shape[::-1], Image.NEAREST)) > 127
    alpha = np.where(keep, alpha, 0).astype(np.uint8)

    ys, xs = np.where(alpha > 8)
    if len(xs) == 0:
        print("FAIL: nothing survived the cut")
        return 2
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    out = np.dstack([a[..., :3], alpha])[y0:y1, x0:x1]
    img = Image.fromarray(out, "RGBA")

    if max(img.size) > mx:
        s = mx / max(img.size)
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)

    # keep the master exactly like the gpt-image-2 path does
    raw_dir = os.path.join(ROOT, "public", "s5-art", "games", "_raw", game)
    out_dir = os.path.join(ROOT, "public", "s5-art", "games", game)
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    Image.open(src).convert("RGBA").save(os.path.join(raw_dir, name + ".png"))
    dst = os.path.join(out_dir, name + ".png")
    img.save(dst)
    cov = float((np.asarray(img)[..., 3] > 8).mean())
    print(f"{name}: {img.size[0]}x{img.size[1]}px, {cov*100:.1f}% opaque, "
          f"{os.path.getsize(dst)/1024:.1f} KB -> {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
