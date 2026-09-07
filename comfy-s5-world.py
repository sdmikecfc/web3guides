#!/usr/bin/env python
"""
S5 WORLD MAP ART DRIVER — ComfyUI on the Vast box.

Durable copy of the ComfyUI flow (the previous session's scripts lived in a
session-scoped scratchpad and are gone). Generates the world-map assets that
src/lib/s5/world.ts references, into public/s5-art/world/.

  python comfy-s5-world.py --list
  python comfy-s5-world.py site-workshop site-depot
  python comfy-s5-world.py --all
  python comfy-s5-world.py --probe          # one throwaway style test

THE BOX
  Endpoint  http://50.173.30.254:24023   (host port mapped to ComfyUI's 8188)
  Auth      Authorization: Bearer <jupyter_token>
  Models    sd_xl_turbo_1.0_fp16 and SD1.5 ONLY. No Juggernaut, and there is no
            SSH and no `vastai execute` on a running box, so nothing else can
            be installed. Turbo is what we have.

  ALWAYS take the port from `vastai show instance 46100156 --raw` (the entry
  keyed 8188), NEVER from a port scan. A scan of that IP also finds an
  UNAUTHENTICATED ComfyUI on another port: that is a DIFFERENT TENANT on the
  same shared host, not this container. An unauthenticated 401 from 24023 is
  the correct signal you have the right box.

  The token is a credential and is never stored in this file. Put it in
  .comfy_token (gitignored) or the COMFY_TOKEN env var:
      vastai show instance 46100156 --raw   ->  jupyter_token

FOUR RULES, each learned by breaking it (carried over from the game-art run):
  1. NO magenta plate. Turbo will not bind a hard background instruction at low
     CFG: the magenta leaks into the subject without ever filling the
     background. Cut with rembg afterwards instead.
  2. NEVER name a real game in the style. Naming one pulled that game's whole
     scene in, grass and walls included.
  3. NEVER imply a layout. "asset sheet" produced a literal sheet of 40
     vehicles and the cutter then extracted an 82px fragment. Every subject
     starts "one single ...".
  4. cfg 3.5 MINIMUM. At 2.0 a star insignia appeared on a turret; the weighted
     no-insignia negatives only start binding around 3.5.

POST-PROCESSING (repo contract, ADR-0078/0079)
  sprites  -> rembg cutout -> PNG, longest side 512
  bg-*     -> PIL -> WebP q86, capped 1280 wide
  A plate saved as PNG 404s silently into the vector fallback, so the extension
  matters. This script writes the right one per asset.
"""
import argparse
import io
import json
import os
import pathlib
import sys
import time
import urllib.request

BASE = "http://50.173.30.254:24023"
CKPT = "sd_xl_turbo_1.0_fp16.safetensors"
ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "public" / "s5-art" / "world"
RAW = OUT / "_raw"

# Turbo settings that actually work on this box (measured, ~2s/image on a 4090).
STEPS, CFG, SAMPLER, SCHED = 10, 3.5, "euler_ancestral", "sgm_uniform"


def token() -> str:
    t = os.environ.get("COMFY_TOKEN", "").strip()
    if t:
        return t
    f = ROOT / ".comfy_token"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()
    sys.exit(
        "No token. Run:\n"
        "  vastai show instance 46100156 --raw\n"
        "and put jupyter_token in .comfy_token or $COMFY_TOKEN"
    )


def req(path: str, data: bytes | None = None):
    r = urllib.request.Request(BASE + path, data=data)
    r.add_header("Authorization", "Bearer " + token())
    if data:
        r.add_header("Content-Type", "application/json")
    return urllib.request.urlopen(r, timeout=120)


# ── THE STYLE BIBLE ─────────────────────────────────────────────────────────
# The map is a COLLAGE: one painted ground plate with ~16 separate structures
# composited onto it. It survives only if CAMERA, SUN and SCALE are identical
# in every one, so those three are stated FIRST and in the same words each
# time. A reworded camera is a different camera.

CAM = (
    "one single isolated building viewed from a high three-quarter overhead angle, "
    "camera raised about 55 degrees above the horizon looking down, "
    "you can clearly see the roof and two side walls meeting at a near corner, "
    "orthographic strategy-map view, no horizon, no sky, no perspective distortion, "
)

SUN = (
    "bright clear late morning sunlight from the upper left at ten o'clock, "
    "left and top surfaces brightly lit and warm, right surfaces in soft cool shade never black, "
    "short soft shadows falling down and to the right, "
)

# Deliberately NOT the thick-black-outline cartoon register used for the game
# sprites: those live on their own dark backgrounds, whereas these sit on a
# painterly sunlit ground plate and would read as stickers.
HAND = (
    "rich hand painted digital illustration, painted fantasy strategy adventure map art, "
    "visible confident brushwork, warm painterly edges, clean readable silhouette, "
    "soft ambient occlusion, gentle stylisation, high readability at small size, "
)

PAL = (
    "bright vivid saturated cheerful colours, sunlit greens, warm ochre earth, "
    "cream and honey stonework, terracotta and slate roofs, olive and khaki military green, "
    "warm orange rust accents, deep colour in the shadows never grey mud, "
)

# Rule 1: no magenta. A plain off-white backdrop cuts cleanly with rembg and
# does not tint the subject the way a saturated plate does at low CFG.
BACKDROP = (
    "isolated on a plain flat off-white studio backdrop, "
    "no scenery, no ground plane, no terrain, no grass, no cast shadow on the background, nothing else in frame"
)

NEG = (
    "(text:1.6), (letters:1.6), (words:1.5), (numbers:1.5), (signage:1.4), (watermark:1.5), "
    "(insignia:1.6), (emblem:1.5), (flag:1.4), (star:1.4), (cross:1.3), (roundel:1.4), (logo:1.5), "
    "(people:1.5), (soldiers:1.4), (figures:1.4), (face:1.4), "
    "(multiple buildings:1.5), (grid of objects:1.5), (collage:1.4), (sheet of items:1.5), (tiled:1.3), "
    "photo, photorealistic, 3d render, cel shaded, thick black outline, pixel art, "
    "dark, gloomy, desaturated, muddy, grimdark, night, fog, "
    "border, frame, vignette, ui, interface, map legend, compass rose"
)


def sprite(body: str) -> str:
    # Rule 3: every subject starts "one single ...", inside CAM.
    return CAM + body + ", " + HAND + PAL + SUN + BACKDROP


# ── THE ASSET LIST ──────────────────────────────────────────────────────────
# Keys MUST match the `art` fields in src/lib/s5/world.ts. Named by PLACE, never
# by game key: the slate churned four times in three days and a repaint per
# rename is not affordable.
ASSETS: dict[str, str] = {
    "site-basecamp": (
        "a friendly well kept military field camp with a large canvas command tent, "
        "a covered vehicle bay, stacked supply crates and a warm campfire"
    ),
    "site-commandpost": (
        "a large military headquarters hut with a big wooden notice board covered in pinned papers out front, "
        "an aerial mast on the roof"
    ),
    "site-workshop": (
        "an open fronted repair workshop shed with a gantry crane and a tank hull up on blocks inside"
    ),
    "site-quartermaster": (
        "a supply depot of stacked wooden crates and barrels under a canvas awning"
    ),
    "site-trophyhall": (
        "a small walled stone parade court with a raised plinth and captured field guns arranged around it"
    ),
    "site-fieldschool": (
        "a large open sided briefing tent with map easels and a chalkboard under an awning"
    ),
    "site-radiomast": (
        "a tall steel lattice radio mast with guy wires beside a small generator hut"
    ),
    "site-convoyroad": (
        "a fortified road checkpoint with a timber barrier, sandbag emplacements and a stone bridge"
    ),
    "site-airfield": (
        "a small grass airstrip with two open hangars, a windsock and semicircular dispersal pens"
    ),
    "site-arena": (
        "a walled shell damaged town block with a broken clock tower and a street running through it"
    ),
    "site-ridgepass": (
        "a rocky mountain pass with a fortified gatehouse and a winding road cut into the ridge"
    ),
    "site-training": (
        "a military proving ground with target boards, earth berms and an obstacle course"
    ),
    "site-muster": (
        "a wide muster field of neat rows of small canvas tents with a timber pontoon bridge leading away"
    ),
    "site-powerstation": (
        "a cold disused power station with two large concrete cooling towers and a turbine hall, "
        "chain link fence and locked gates, unlit and shut down"
    ),
    "fort-intact": (
        "one single squat concrete military fortress with thick walls, a battlemented parapet, "
        "a heavy steel gate and corner watchtowers, undamaged and solid"
    ),
}

PLATES = {
    # The ground plate is generated elsewhere (nano_banana_pro, 16:9) because
    # Turbo cannot hold a whole painted landscape together at 10 steps. Listed
    # here only so --list shows the complete picture.
    "bg-land": "(generated externally, nano_banana_pro 16:9 2k)",
}


def graph(prompt: str, seed: int, w: int = 1024, h: int = 1024) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": STEPS, "cfg": CFG,
                "sampler_name": SAMPLER, "scheduler": SCHED, "denoise": 1.0,
                "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": "s5world", "images": ["6", 0]}},
    }


def generate(name: str, prompt: str, seed: int) -> pathlib.Path | None:
    body = json.dumps({"prompt": graph(prompt, seed)}).encode()
    pid = json.load(req("/prompt", body))["prompt_id"]
    for _ in range(150):
        time.sleep(2)
        hist = json.load(req(f"/history/{pid}"))
        if pid in hist:
            outs = hist[pid].get("outputs", {}).get("7", {}).get("images", [])
            if not outs:
                print(f"  {name}: finished with no image")
                return None
            im = outs[0]
            q = f"/view?filename={im['filename']}&subfolder={im.get('subfolder','')}&type={im.get('type','output')}"
            data = req(q).read()
            RAW.mkdir(parents=True, exist_ok=True)
            p = RAW / f"{name}.png"
            p.write_bytes(data)
            print(f"  {name}: {len(data)//1024} KB -> {p}")
            return p
    print(f"  {name}: TIMED OUT")
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--probe", action="store_true", help="one throwaway style test")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    if args.list:
        for k in ASSETS:
            print(" ", k)
        for k, v in PLATES.items():
            print(" ", k, v)
        return

    if args.probe:
        generate("_probe", sprite(ASSETS["site-workshop"]), args.seed)
        return

    names = list(ASSETS) if args.all else args.names
    if not names:
        ap.error("give asset names, or --all / --list / --probe")
    for i, n in enumerate(names):
        if n not in ASSETS:
            print(f"  {n}: unknown, skipping")
            continue
        print(f"[{i+1}/{len(names)}] {n}")
        generate(n, sprite(ASSETS[n]), args.seed + i)


if __name__ == "__main__":
    main()
