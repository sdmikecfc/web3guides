#!/usr/bin/env python
"""
S6 PILOT DRIVER - ComfyUI on the Vast box (instance 47569958).

THE BIBLE METHOD (ADR-0006/0069): `--stylelock` renders ONE pilot. Mike
approves it, THEN the 8-pilot roster batch below unlocks (--batch refuses
to run until APPROVED = True, flipped by hand after his verdict).

  python comfy-s6-pilots.py --probe        # throwaway register test
  python comfy-s6-pilots.py --stylelock    # THE approval candidate
  python comfy-s6-pilots.py --batch        # 8 pilots (gated on APPROVED)

THE BOX
  Endpoint  http://66.114.157.224:40794  (host port for ComfyUI's 8188,
            from `vastai show instance 47569958 --raw`, never a port scan)
  Auth      Authorization: Bearer <jupyter_token> -> .comfy_token (gitignored)
  Model     Juggernaut-XL_v9.safetensors (the ADR-0069 character register).
            NOT preinstalled: one wget in the instance portal terminal puts
            it in /workspace/ComfyUI/models/checkpoints/ (~7.1GB, public HF).
            Falls back to sd_xl_turbo for --probe ONLY (never the lock).

CHARACTER REGISTER (ADR-0069, S6 plan): painted game key art, resistance
mechanic in a worn jumpsuit, amber accents, PG ALWAYS. The underage-drift
and nudity guardrails are baked into POS/NEG below and are not optional.
"""
import argparse
import json
import os
import pathlib
import sys
import time
import urllib.request

BASE = os.environ.get("COMFY_BASE", "http://66.114.157.224:40794")
JUGG = "Juggernaut-XL_v9.safetensors"
TURBO = "sd_xl_turbo_1.0_fp16.safetensors"
ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "public" / "s6-art" / "pilot" / "_raw"

# Flip to True ONLY after Mike approves the stylelock render.
APPROVED = False

# Juggernaut settings (full SDXL, not turbo): quality over speed.
STEPS, CFG, SAMPLER, SCHED = 30, 4.5, "dpmpp_2m", "karras"
W, H = 832, 1216  # portrait key art


def token() -> str:
    t = os.environ.get("COMFY_TOKEN", "").strip()
    if t:
        return t
    f = ROOT / ".comfy_token"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()
    sys.exit("No token: .comfy_token or $COMFY_TOKEN (vastai show instance 47569958 --raw)")


def req(path: str, data: bytes | None = None):
    r = urllib.request.Request(BASE + path, data=data)
    r.add_header("Authorization", "Bearer " + token())
    if data:
        r.add_header("Content-Type", "application/json")
    return urllib.request.urlopen(r, timeout=180)


def checkpoints() -> list[str]:
    j = json.load(req("/object_info/CheckpointLoaderSimple"))
    return j["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]


# ── THE REGISTER, stated once ───────────────────────────────────────────────
STYLE = (
    "beautiful natural portrait, soft warm golden-hour light, gentle smooth studio-quality lighting, "
    "soft focus background, natural healthy skin, relaxed natural expression, "
)

WORLD = (
    "a resistance mech pilot of the human uprising, well-fitted olive flight suit, "
    "leather belt and harness, standing in a warm dieselpunk hangar, "
)

# PG + adult-only guardrails (ADR-0069): stated positively AND negatively.
GUARD_POS = "adult in their mid twenties, about 25 years old, fully clothed, "
NEG = (
    "(child:1.7), (teen:1.7), (underage:1.7), (minor:1.6), "
    "(nude:1.6), (nsfw:1.6), (cleavage:1.5), (revealing:1.5), (swimsuit:1.5), "
    "(text:1.5), (watermark:1.5), (logo:1.4), (signature:1.4), "
    "(gun:1.5), (rifle:1.5), (pistol:1.4), (weapon:1.3), "
    "photo, photorealistic, 3d render, anime, cel shaded, "
    "deformed hands, extra fingers, cross-eyed, grimdark, "
    "harsh shadows, chiseled gaunt face, choppy layered hair, over-sharpened, severe expression"
)

PILOTS: dict[str, str] = {
    # v5 SOFT REGISTER (Mike: "much better"). ~25yo, clearly adult, PG.
    "forge": "a ruggedly handsome 25 year old man with a short dark beard, a small burn scar on his jaw, steady serious eyes, broad shoulders, grease-stained hands",
    "ember": "a gorgeous 25 year old woman with long smooth flowing dark hair, soft pretty face, warm brown eyes, light natural makeup, calm confident look",
    "volt": "a handsome lanky 25 year old man with messy dark hair, tired kind eyes, light stubble, headphones around his neck",
    "anchor": "a beautiful 25 year old woman with long smooth silver-blonde hair over one shoulder, soft round pretty face, gentle calm expression, a polished brass prosthetic forearm",
    "juno": "a beautiful 25 year old woman with very long smooth black hair, soft elegant face, warm bronze skin, gentle focused eyes",
    "patch": "a friendly 25 year old man with round spectacles, curly hair, a warm easy grin, oil-stained apron, the young genius tinkerer",
    "redline": "a handsome lean 25 year old man with slicked-back hair, a racing scarf, a crooked confident grin",
    "nova": "a beautiful 25 year old woman with long smooth copper-red hair, soft freckled pretty face, easy warm smile, amber goggles pushed up",
}


def graph(prompt: str, seed: int, ckpt: str) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": STEPS, "cfg": CFG,
                "sampler_name": SAMPLER, "scheduler": SCHED, "denoise": 1.0,
                "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": "s6pilot", "images": ["6", 0]}},
    }


def generate(name: str, prompt: str, seed: int, ckpt: str) -> pathlib.Path | None:
    t0 = time.time()
    body = json.dumps({"prompt": graph(prompt, seed, ckpt)}).encode()
    pid = json.load(req("/prompt", body))["prompt_id"]
    for _ in range(240):
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
            print(f"  {name}: {len(data)//1024} KB in {int(time.time()-t0)}s -> {p}")
            return p
    print(f"  {name}: TIMED OUT")
    return None


def pilot_prompt(body: str) -> str:
    return STYLE + WORLD + GUARD_POS + body + ", waist-up portrait, looking at viewer"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--stylelock", action="store_true")
    ap.add_argument("--batch", action="store_true")
    ap.add_argument("--seed", type=int, default=61)
    args = ap.parse_args()

    have = checkpoints()
    jugg = JUGG in have
    print(f"box checkpoints: {have}")

    if args.probe:
        ck = JUGG if jugg else TURBO
        print(f"probe on {ck} (throwaway)")
        generate("_probe", pilot_prompt(PILOTS["forge"]), args.seed, ck)
        return

    if not jugg:
        sys.exit(
            "Juggernaut not on the box yet. In the instance portal terminal run:\n"
            "  wget -O /workspace/ComfyUI/models/checkpoints/Juggernaut-XL_v9.safetensors "
            '"https://huggingface.co/RunDiffusion/Juggernaut-XL-v9/resolve/main/'
            'Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors"'
        )

    if args.stylelock:
        generate("stylelock-forge", pilot_prompt(PILOTS["forge"]), args.seed, JUGG)
        return

    if args.batch:
        if not APPROVED:
            sys.exit("BATCH LOCKED: Mike has not approved the stylelock. Flip APPROVED after his verdict.")
        for i, (k, body) in enumerate(PILOTS.items()):
            print(f"[{i+1}/8] {k}")
            generate(f"pilot-{k}", pilot_prompt(body), args.seed + i * 13, JUGG)
        return

    ap.error("--probe, --stylelock or --batch")


if __name__ == "__main__":
    main()
