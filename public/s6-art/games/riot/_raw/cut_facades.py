#!/usr/bin/env python
"""
CUT THE RIOT MID-LAYER FACADES - CraftPix tileset pieces -> shipped webp
(Mike's "buildings are just textures" redline, 2026-08-15).

  python public/s6-art/games/riot/_raw/cut_facades.py

THIS FILE IS THE PIPELINE (recover-lost-pipelines law). It reads the
gitignored CraftPix tilesets in art-src/riot/packs/tiles-* and performs
STRAIGHT CROPS AND TILE PASTES ONLY - no AI processing, no rembg, no
resampling (the CraftPix license forbids AI processing; transformed
game-ready pieces in the build are fine, raw redistribution is not).
No CraftPix file ever lands inside _raw itself - this script only READS
art-src and WRITES the composed webp facades one level up, exactly like
riot-atlas.mjs's licensing wall.

The Client (src/app/s6/games/riot/Client.tsx) draws these at the mid
parallax layer's slab anchors, bottom on the FLOOR_TOP back-wall line,
try-image-else-vector: the flat skin.mid rects Mike flagged remain the
no-art fallback.

  facade-l1-{a,b,c,d}.webp  OLD TOWN     cyberpunk-market tileset (942087)
  facade-l2-{a,b}.webp      THE PINES    green-zone ruin walls   (846754)
  facade-l3-{a,b}.webp      THE FOUNDRY  lab wall tiles          (104941)
"""
import pathlib

from PIL import Image

RAW = pathlib.Path(__file__).parent
OUT = RAW.parent
PACKS = RAW.parents[4] / "art-src" / "riot" / "packs"
MARKET = PACKS / "tiles-market" / "1 Tiles"
GREEN = PACKS / "tiles-green" / "Tileset.png"
LAB = PACKS / "tiles-lab" / "1 Tiles"


def save(name: str, im: Image.Image) -> None:
    dst = OUT / f"{name}.webp"
    im.save(dst, "WEBP", lossless=True)  # pixel art: lossless, tiny anyway
    print(f"  {name}: {im.size[0]}x{im.size[1]}, {dst.stat().st_size // 1024} KB")


def crop(path: pathlib.Path, box: tuple[int, int, int, int]) -> Image.Image:
    return Image.open(path).convert("RGBA").crop(box)


def market() -> None:
    t1 = MARKET / "Tileset1.png"  # blue-grey palette
    t2 = MARKET / "Tileset2.png"  # warm orange-brown (the streets skin)
    # left assembly: cornice + framed wall with the dark window + lower ledge
    save("facade-l1-a", crop(t2, (0, 0, 96, 128)))
    # column + wall with the small lit slit windows
    save("facade-l1-b", crop(t2, (96, 0, 192, 128)))
    # the stepped market-stall awning over a brick base
    save("facade-l1-c", crop(t2, (0, 128, 64, 192)))
    # blue-grey variant of the framed wall for skyline rhythm
    save("facade-l1-d", crop(t1, (0, 0, 96, 128)))


def green() -> None:
    # overgrown ruin walls. The sheet's only tall coherent block is x0-96
    # (measured: fully-opaque 96w run y2-94; everything right of it is
    # separate small blocks with sky gaps), so piece A is that block straight
    # and piece B is COMPOSED: the stone-cap + hanging-vines strip (256,64)-
    # (352,96) (also measured fully opaque) over two wall-fill slices from
    # inside the big block. Straight crops and pastes only.
    save("facade-l2-a", crop(GREEN, (0, 0, 96, 96)))
    b = Image.new("RGBA", (96, 96))
    b.paste(crop(GREEN, (256, 64, 352, 96)), (0, 0))
    b.paste(crop(GREEN, (0, 48, 96, 80)), (0, 32))
    b.paste(crop(GREEN, (0, 62, 96, 94)), (0, 64))
    save("facade-l2-b", b)


def lab() -> None:
    # compose 3x3-tile lab walls: lit top strip / panel row / baseboard.
    # Straight tile pastes at native 32px - no resampling.
    def wall(cols: list[list[str]]) -> Image.Image:
        im = Image.new("RGBA", (32 * len(cols), 32 * len(cols[0])))
        for cx, col in enumerate(cols):
            for cy, n in enumerate(col):
                tile = Image.open(LAB / f"Tiles_{n}.png").convert("RGBA")
                im.paste(tile, (cx * 32, cy * 32), tile)
        return im

    # clean panels with a window + hatch row
    save("facade-l3-a", wall([["01", "31", "21"], ["02", "32", "22"], ["03", "33", "23"]]))
    # the mottled/overgrown variant (col 06/36/26 are ragged EDGE tiles -
    # repeating col 1 keeps the facade silhouette rectangular)
    save("facade-l3-b", wall([["04", "34", "24"], ["05", "35", "25"], ["04", "34", "24"]]))


def main() -> None:
    market()
    green()
    lab()


if __name__ == "__main__":
    main()
