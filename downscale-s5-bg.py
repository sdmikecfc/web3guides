"""
Cap the SHIPPED size of S5 game BACKGROUND plates.

WHY THIS EXISTS (2026-07-25, ADR-0078): sprites are keyed by key-s5-games.js,
which downscales on write (512px, so a re-key can never re-inflate the payload).
But `bg-*` files are UNKEYED full-frame paintings: by the key-s5-games.js
contract the GENERATORS write their finals directly, so they never pass through
that downscale and land at whatever gpt-image-2 returned (~1000-1500px). The
cutover pass capped them at 1280px wide; this tool re-applies that cap so
regenerating a plate cannot silently undo it.

Run after ANY bg-* regeneration:
    python downscale-s5-bg.py            # every game
    python downscale-s5-bg.py tankbuster # one game

Masters stay untouched in public/s5-art/games/_raw/.
"""
import sys, os, glob
from PIL import Image

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "s5-art", "games")
MAX_W = 1280  # bg plates stretch across the canvas, so cap WIDTH not longest side

def main() -> None:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    games = [only] if only else sorted(
        d for d in os.listdir(ART)
        if os.path.isdir(os.path.join(ART, d)) and d != "_raw"
    )
    before = after = 0
    touched = 0
    for g in games:
        for p in sorted(glob.glob(os.path.join(ART, g, "bg-*.png"))):
            sz = os.path.getsize(p)
            before += sz
            im = Image.open(p)
            if im.width <= MAX_W:
                after += sz
                print(f"  ok   {g}/{os.path.basename(p)}: {im.width}x{im.height} already <= {MAX_W}px")
                continue
            h = max(1, round(im.height * MAX_W / im.width))
            # keep the mode: an opaque plate gains nothing from an alpha channel
            im.resize((MAX_W, h), Image.LANCZOS).save(p, optimize=True)
            new = os.path.getsize(p)
            after += new
            touched += 1
            print(f"  cut  {g}/{os.path.basename(p)}: {im.width}x{im.height} -> {MAX_W}x{h}"
                  f"  ({sz/1048576:.2f} -> {new/1048576:.2f} MB)")
    print(f"\nbg plates: {touched} downscaled, {before/1048576:.2f} MB -> {after/1048576:.2f} MB")

if __name__ == "__main__":
    main()
