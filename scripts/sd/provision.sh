#!/usr/bin/env bash
# BATTLE BOTS art factory - LANE R provisioning runbook.
#
# Stands a rented GPU box up from nothing to "control-conditioned SDXL renders
# that the ranker can judge against the rig contract". Run it on a fresh
# Vast.ai instance started from the template:
#
#   Image:  pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime
#   Disk:   60 GB
#   Ports:  8188 (only if you also want the ComfyUI GUI)
#
# Everything here is idempotent; re-running on a warm box is a no-op.
#
# TOTAL DOWNLOAD: ~13.6 GB. On a 1 Gbit host that is about 3 minutes; budget
# 15 minutes because host bandwidth on the marketplace varies by 20x.
#
# ── RISKS: read before spending ──────────────────────────────────────────
#  1. THE INSTANCE BILLS DISK FOR AS LONG AS IT EXISTS. Stopping it does not
#     stop the disk charge. DESTROY it every night (the last lines of this
#     script say how). Re-provisioning is 15 minutes; a parked disk for a month
#     costs more than every GPU hour in this project.
#  2. SDXL BASE 1.0 MODEL CARD WORDING. The card's Intended Use says the model
#     is "intended for research purposes only". That sentence is a stated
#     intended use on the card, not a term of the licence: the CreativeML Open
#     RAIL++-M licence itself permits commercial use (with its use-based
#     restrictions). Recorded here because anyone who reads the card and not
#     the licence will call the checkpoint research-only. If the project ever
#     needs to show its licence homework, cite the licence text, and keep this
#     note beside it. Same note in bots-sd-sweep.py CHECKPOINTS.
#  3. PROMPT LENGTH. The production prompt is 234 CLIP tokens; CLIP holds 77.
#     Every render goes through bots_sd_prompt.encode() (compel, chunked,
#     weighted) and REFUSES without compel. Never call the pipeline with raw
#     prompt text; step 3 below asserts the embedding path before the smoke.
#  4. THE UNION MODEL LOADER. ControlNet-Union ProMax must load as
#     ControlNetUnionModel from a folder with config_promax.json as its
#     config.json (num_control_type 8). Loaded as a plain ControlNetModel it
#     silently loses its mode routing. Step 2 lays the folder out; the smoke
#     test refuses if the mode count is wrong.
#  5. compel 2.4.0 needs transformers 5.x and declares a `notebook` dependency
#     it does not use at render time. It is installed --no-deps with pyparsing
#     beside it, so a Jupyter stack is not pulled onto a render box.
#  6. THE IP-ADAPTER LAYOUT. bots_sd_pipeline.py loads the adapter exactly the
#     way the hand test on the box proved on 2026-09-05:
#       image_encoder = CLIPVisionModelWithProjection.from_pretrained(
#                           $MODELS/clip_vision/models/image_encoder)
#       pipe.load_ip_adapter($MODELS/ipadapter, subfolder="sdxl_models",
#                            weight_name="ip-adapter-plus_sdxl_vit-h.safetensors")
#     so the weights MUST sit at those sub-paths. The first version of step 2
#     flattened both downloads into their folder roots and never fetched the
#     encoder's config.json at all, so the style path could only have worked
#     on a box someone had laid out by hand. Step 2 now keeps the sub-paths,
#     fetches the config, and moves a flat file from the old layout into place.
set -euo pipefail
trap 'echo; echo "REMEMBER: a Vast instance bills disk for as long as it EXISTS. Destroy it, do not stop it:  vastai destroy instance <id>"' EXIT

ROOT=${ROOT:-/workspace}
MODELS=$ROOT/models
SD=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)   # this scripts/sd checkout
mkdir -p "$MODELS"/{checkpoints,controlnet,controlnet-union-promax,ipadapter,clip_vision,vae,lora}
cd "$ROOT"

echo "=== 0. what did we actually get? ================================="
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv
python -c "import torch;print('torch',torch.__version__,'cuda',torch.version.cuda,torch.cuda.get_device_name(0))"
df -h "$ROOT" | tail -1

echo "=== 1. python deps =============================================="
pip install --no-cache-dir -q \
  "diffusers==0.40.0" "transformers>=5,<6" accelerate safetensors \
  "huggingface_hub[hf_transfer]" pillow numpy scipy opencv-python-headless peft \
  "pyparsing~=3.0" "tokenizers"
pip install --no-cache-dir -q --no-deps "compel==2.4.0"     # see RISKS 5
python -c "import compel, diffusers, transformers; print('compel', __import__('importlib.metadata').metadata.version('compel'), 'diffusers', diffusers.__version__, 'transformers', transformers.__version__)"
export HF_HUB_ENABLE_HF_TRANSFER=1   # ~4x faster pulls; without it budget 3x the time

echo "=== 2. weights =================================================="
# Sizes are the real file sizes, so you can predict the download.
# LICENCES - checked 2026-09-05, all cleared for commercial use:
#   SDXL base 1.0 ............ CreativeML Open RAIL++-M   commercial OK, no revenue cap
#                              (MODEL CARD says "intended for research purposes only":
#                               a stated intended use, not a licence term. RISKS 2.)
#   xinsir controlnet-union .. Apache 2.0                 commercial OK, no strings
#   IP-Adapter (h94, plus) ... Apache 2.0                 commercial OK
#                              (do NOT pull the FaceID variants: research-only)
#   CLIP ViT-H/14 (LAION) .... MIT                        commercial OK
#   sdxl-vae-fp16-fix ........ MIT                        commercial OK
dl () {  # dl <repo> <file> <dest-dir> [<dest-name>]
  python - "$@" <<'PY'
import sys, os, shutil
from huggingface_hub import hf_hub_download
repo, fn, dest = sys.argv[1], sys.argv[2], sys.argv[3]
name = sys.argv[4] if len(sys.argv) > 4 else os.path.basename(fn)
out = os.path.join(dest, name)
if os.path.exists(out):
    print(f"  have {out}"); raise SystemExit
p = hf_hub_download(repo_id=repo, filename=fn, local_dir=dest)
if os.path.abspath(p) != os.path.abspath(out):
    shutil.move(p, out)
print(f"  got  {out}  {os.path.getsize(out)/1e9:.2f} GB")
PY
}

dl stabilityai/stable-diffusion-xl-base-1.0 sd_xl_base_1.0.safetensors "$MODELS/checkpoints"   # 6.94 GB
# the pipeline config that goes with the single file (tokenizers, encoder and
# scheduler configs; no weights): a few hundred KB, so the load is offline-safe
python - <<'PY'
from huggingface_hub import snapshot_download
p = snapshot_download("stabilityai/stable-diffusion-xl-base-1.0",
                      allow_patterns=["model_index.json", "scheduler/*", "tokenizer/*", "tokenizer_2/*",
                                      "text_encoder/config.json", "text_encoder_2/config.json",
                                      "unet/config.json", "vae/config.json"])
print("  sdxl pipeline config cached at", p)
PY
# the VAE ships in diffusers layout: config.json beside the weights, loaded with from_pretrained
dl madebyollin/sdxl-vae-fp16-fix          config.json                          "$MODELS/vae"
dl madebyollin/sdxl-vae-fp16-fix          diffusion_pytorch_model.safetensors  "$MODELS/vae"    # 0.33 GB
# the union model: ProMax weights under the default name, ProMax config as config.json (RISKS 4)
dl xinsir/controlnet-union-sdxl-1.0       config_promax.json                   "$MODELS/controlnet-union-promax" config.json
dl xinsir/controlnet-union-sdxl-1.0       diffusion_pytorch_model_promax.safetensors "$MODELS/controlnet-union-promax" diffusion_pytorch_model.safetensors  # 2.51 GB
python - "$MODELS/controlnet-union-promax/config.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
n = c.get("num_control_type")
assert n == 8, f"config.json says num_control_type={n}; ProMax needs 8 (xinsir's config_promax.json)"
print("  union config: num_control_type", n)
PY
# the IP-Adapter and its ViT-H image encoder, at the SUB-PATHS the pipeline
# names (RISKS 6). A flat file left by the old version of this step is moved.
mkdir -p "$MODELS/ipadapter/sdxl_models" "$MODELS/clip_vision/models/image_encoder"
[ -f "$MODELS/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors" ] && [ ! -f "$MODELS/ipadapter/sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors" ] \
  && mv "$MODELS/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors" "$MODELS/ipadapter/sdxl_models/"
[ -f "$MODELS/clip_vision/model.safetensors" ] && [ ! -f "$MODELS/clip_vision/models/image_encoder/model.safetensors" ] \
  && mv "$MODELS/clip_vision/model.safetensors" "$MODELS/clip_vision/models/image_encoder/"
dl h94/IP-Adapter  sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors "$MODELS/ipadapter/sdxl_models"          # 0.85 GB
dl h94/IP-Adapter  models/image_encoder/config.json                  "$MODELS/clip_vision/models/image_encoder"
dl h94/IP-Adapter  models/image_encoder/model.safetensors            "$MODELS/clip_vision/models/image_encoder"  # 2.53 GB
# every file the render path AND the style path open, checked by the module
# that opens them (no GPU, nothing loaded): refuses with the missing paths
python "$SD/bots_sd_pipeline.py" --check-models "$MODELS" --style

echo "=== 3. the prompt reaches the model whole ========================"
# The production prompt is 234 CLIP tokens into a 77-token context. This
# asserts, with the real tokenizer and with compel importable, that every
# production prompt will be embedded whole. Refuses otherwise. No GPU used.
python "$SD/bots_sd_prompt.py" --assert

echo "=== 4. smoke test ==============================================="
# Proves the whole prompt reaches the model AND that the control binds. Fails
# loudly on either. Never start a paid sweep on a box that fails this.
python "$SD/smoke.py" --models "$MODELS" --out "$ROOT/smoke"

echo
echo "PROVISIONED. Next: rsync the control maps, the cleaned style references and the job files up, then run stage 0."
echo "  rsync -az art-src/sd/ vast:$ROOT/art-src/sd/      # controls/, style/clean/, jobs/"
echo "  python $SD/bots-sd-render.py art-src/sd/jobs/stage0.jsonl --models $MODELS --out $ROOT/renders"
echo "  python $SD/bots-sd-render.py art-src/sd/jobs/stage1.jsonl --models $MODELS --out $ROOT/renders   # the IP-Adapter arm"
echo "  python $SD/rank-part.py batch $ROOT/renders/head-t3-1/cut --sheet                             # judge the CUT renders"
echo
echo "================================================================="
echo "WHEN YOU STOP FOR THE DAY: DESTROY THE INSTANCE. DO NOT MERELY STOP IT."
echo "Vast bills disk per GB per hour for as long as the instance EXISTS,"
echo "stopped or not. 60 GB parked for a month costs more than every GPU"
echo "hour in this project. Re-running this script on a fresh box is ~15 min."
echo "  from your laptop:  vastai destroy instance <INSTANCE_ID>"
echo "  or in the web UI:  Instances -> the trash icon (DESTROY), not the stop icon"
echo "================================================================="
