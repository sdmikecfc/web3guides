"""Stage 0 across slots: does the control bind on a torso, an arm and a leg too?
Imports the lane's pipeline and prompt modules; edits nothing of theirs.
    python stage0_multi.py --models /workspace/models --out /workspace/bb/out/stage0-multi torso-t3-1 arm-t3-1 leg-t3-1
"""
import os, sys, json, time, argparse
sys.path.insert(0, "/workspace/bb/scripts/sd")
from PIL import Image
import bots_sd_pipeline as P
import bots_sd_prompt as Q

ap = argparse.ArgumentParser(); ap.add_argument("--models", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--seeds", type=int, default=4); ap.add_argument("parts", nargs="+"); a = ap.parse_args()
pipe = P.load_pipeline(a.models); P.scheduler_for(pipe, "dpmpp_2m_karras")
os.makedirs(a.out, exist_ok=True); log = open(os.path.join(a.out, "log.txt"), "a")
for part in a.parts:
    wd = f"/workspace/bb/art-src/sd/worked-example/{part}"
    params = json.load(open(os.path.join(wd, "params.json")))
    weighted = open(os.path.join(wd, "prompt-compel.txt"), encoding="utf-8").read().strip()
    plain = open(os.path.join(wd, "prompt.txt"), encoding="utf-8").read().strip()
    neg = open(os.path.join(wd, "negative.txt"), encoding="utf-8").read().strip()
    # the worked example writes square-<map>.png (the 1024 working canvas) and contract-<map>.png
    maps = {n: os.path.join(wd, f"square-{n}.png") for n in ("depth", "lineart") if os.path.exists(os.path.join(wd, f"square-{n}.png"))}
    if not maps: raise SystemExit(f"no square-depth/lineart maps in {wd}")
    images, modes = P.load_controls(maps, list(maps), 1024)
    embeds, meta = Q.encode(pipe, weighted, neg, plain=plain)
    for seed in range(1000, 1000 + a.seeds):
        t0 = time.time()
        im = P.render(pipe, images=images, modes=modes, scale=0.7, end=1.0, cfg=5.0, steps=30, seed=seed, size=1024, embeds=embeds)
        fn = os.path.join(a.out, f"{part}_seed{seed}.png"); im.save(fn)
        msg = f"{fn} {time.time()-t0:.1f}s controls={list(maps)}"; print(msg, flush=True); log.write(msg + chr(10)); log.flush()
print("STAGE0 MULTI DONE", flush=True)
