"""
Convert S5 game BACKGROUND plates from PNG to WebP (and drop the PNGs).

WHY (2026-07-25, ADR-0078): `bg-*` plates are full-frame OPAQUE paintings, the
worst possible case for PNG. Measured on the shipped set, WebP q86 is 85-95%
smaller (12 plates: ~21 MB -> ~3 MB) with no alpha to preserve, which matters
because the arcade is the onboarding surface and mobile players pay for every
megabyte. Keyed SPRITES deliberately stay PNG: key-s5-games.js writes them via
pngjs, so that one write path stays one format.

loadManifest() in src/app/s5/games/_shared/art.ts resolves `bg-*` to .webp and
everything else to .png, so this tool and that rule must stay in sync.

Run after ANY bg-* regeneration, AFTER downscale-s5-bg.py:
    python webp-s5-bg.py             # every game
    python webp-s5-bg.py tankbuster  # one game

Masters stay untouched in public/s5-art/games/_raw/.
"""
import sys, os, glob
from PIL import Image

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "s5-art", "games")
QUALITY = 86

def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    games = [only] if only else sorted(
        d for d in os.listdir(ART)
        if os.path.isdir(os.path.join(ART, d)) and d != "_raw"
    )
    before = after = 0
    n = 0
    for g in games:
        for p in sorted(glob.glob(os.path.join(ART, g, "bg-*.png"))):
            dest = p[:-4] + ".webp"
            src_sz = os.path.getsize(p)
            im = Image.open(p)
            # plates are opaque; RGB keeps WebP out of its alpha path entirely
            im.convert("RGB").save(dest, "WEBP", quality=QUALITY, method=5)
            dst_sz = os.path.getsize(dest)
            os.remove(p)  # the manifest asks for .webp now, so the PNG is dead weight
            before += src_sz
            after += dst_sz
            n += 1
            print(f"  {g}/{os.path.basename(dest)}: {im.width}x{im.height} "
                  f"{src_sz/1048576:.2f} -> {dst_sz/1048576:.2f} MB "
                  f"({100 - dst_sz * 100 // src_sz}% smaller)")
    if n == 0:
        print("no bg-*.png found (already converted?)")
        return
    print(f"\n{n} plates: {before/1048576:.2f} MB -> {after/1048576:.2f} MB "
          f"(saved {(before-after)/1048576:.2f} MB)")

if __name__ == "__main__":
    main()
