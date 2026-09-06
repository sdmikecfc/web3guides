"""BATTLE BOTS / stable-diffusion lane: THE ONE GENERATION PATH.

smoke.py and bots-sd-render.py both render through render() below, and
render() takes EMBEDDINGS, not text. Every production render therefore goes
through bots_sd_prompt.encode(), and the whole prompt reaches the model. The
only way to hand this file raw text is the `truncating_prompt` argument, which
exists so the smoke test can render the cut prompt beside the full one and
prove they differ. It is named so nobody uses it by accident.

LOADERS, and why they look the way they do. Read from the diffusers 0.40.0
source on 2026-09-05, not from memory:

  * xinsir ControlNet-Union ProMax must load as ControlNetUnionModel, and
    ControlNetUnionModel is NOT in diffusers' single-file table
    (SINGLE_FILE_LOADABLE_CLASSES in loaders/single_file_model.py), so
    from_single_file() on the promax .safetensors raises. Loading it as a
    plain ControlNetModel, which is what the first smoke test did, drops the
    task embedding and the union's mode routing and reports nothing. It loads
    with from_pretrained() from a folder holding config.json (xinsir's own
    config_promax.json, which sets num_control_type 8) and the weights under
    the default file name. provision.sh lays that folder out.
  * the union model needs a control_mode per control image. ProMax modes:
    0 openpose, 1 depth, 2 hed/pidi/scribble/ted, 3 canny/lineart/anime
    lineart/mlsd, 4 normal, 5 segment, 6 tile, 7 repaint.
  * sdxl-vae-fp16-fix ships in diffusers layout (config.json + weights), so it
    loads with from_pretrained(). from_single_file() maps original-LDM key
    names and would not find these.
  * the SDXL checkpoint is one file; its pipeline config (tokenizers, the two
    text-encoder configs, the scheduler config) comes from the hub repo,
    which provision.sh pre-fetches so the load does not wait on the network.

THE IP-ADAPTER (style), wired 2026-09-05 from the path a hand test on the box
proved the same day (a proper concept crop as the style image at adapter
scale 0.4 with control scale 0.6 came back as warm pastel clay with chrome
bezels, a coral lit lens, the grille mouth and the ear cups, shape still
bound; at 0.8 the reference's background leaked in):

  * image_encoder = CLIPVisionModelWithProjection.from_pretrained(
        <models>/clip_vision/models/image_encoder, fp16), handed to the
    pipeline at construction (load_pipeline(style=True)). diffusers'
    load_ip_adapter then does NOT try to load an encoder of its own (checked
    in loaders/ip_adapter.py 0.40.0: the encoder branch runs only when the
    pipeline has none) and registers a CLIPImageProcessor(224) as the
    feature extractor: resize shortest side to 224, CENTRE CROP. Every style
    reference is therefore square (bots-sd-stylerefs.py makes them so).
  * pipe.load_ip_adapter(<models>/ipadapter, subfolder="sdxl_models",
        weight_name="ip-adapter-plus_sdxl_vit-h.safetensors")
    pipe.set_ip_adapter_scale(s); ip_adapter_image=<PIL RGB> in the call.
  * ONCE THE ADAPTER IS LOADED, EVERY CALL MUST CARRY AN IMAGE: the unet's
    encoder_hid_proj is then ip_image_proj and forward() raises without
    image_embeds (unet_2d_condition.py). So a style-0 render is only
    byte-identical to the pre-adapter pipeline if it runs BEFORE
    load_style_adapter(); render() refuses a style-0 call after it rather than
    fake one with a blank image at scale 0, and the runner orders its jobs so
    the question never comes up.

Nothing here is verified on a GPU yet beyond what the smoke test and the
hand test proved: this machine's card was measured unusable. Every call
signature was checked against the installed-version source (diffusers
0.40.0, on 2026-09-05); the first paid hour is where it is proven, and
smoke.py is what proves it.

    python scripts/sd/bots_sd_pipeline.py --check-models <models> [--style]   # files only, no GPU
"""
from __future__ import annotations

import os
import sys

from PIL import Image

SDXL_REPO = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_FILE = "sd_xl_base_1.0.safetensors"
IP_ADAPTER_SUBFOLDER = "sdxl_models"
IP_ADAPTER_FILE = "ip-adapter-plus_sdxl_vit-h.safetensors"
IMAGE_ENCODER_SUBDIR = os.path.join("models", "image_encoder")   # h94/IP-Adapter's ViT-H, as provision.sh lays it out
STYLE_FLAG = "_bb_style_loaded"    # set on the pipe by load_style_adapter; read by render()

# xinsir ControlNet-Union ProMax, from its model card.
UNION_MODE = {"openpose": 0, "depth": 1, "softedge": 2, "hed": 2, "scribble": 2,
              "canny": 3, "lineart": 3, "mlsd": 3, "normal": 4, "segment": 5,
              "tile": 6, "repaint": 7}
PROMAX_MODES = 8
SAMPLERS = ("dpmpp_2m_karras", "euler_a", "dpmpp_sde_karras")   # the matrix's three


def die(msg: str) -> None:
    raise SystemExit("bots_sd_pipeline REFUSES: " + msg)


def paths(models: str) -> dict[str, str]:
    return {
        "ckpt": os.path.join(models, "checkpoints", SDXL_FILE),
        "union": os.path.join(models, "controlnet-union-promax"),
        "vae": os.path.join(models, "vae"),
        "adapter": os.path.join(models, "ipadapter"),
        "encoder": os.path.join(models, "clip_vision", IMAGE_ENCODER_SUBDIR),
    }


def missing_models(models: str, style: bool = False) -> list[str]:
    p = paths(models)
    want = [p["ckpt"],
            os.path.join(p["union"], "config.json"),
            os.path.join(p["union"], "diffusion_pytorch_model.safetensors"),
            os.path.join(p["vae"], "config.json"),
            os.path.join(p["vae"], "diffusion_pytorch_model.safetensors")]
    if style:
        want += [os.path.join(p["adapter"], IP_ADAPTER_SUBFOLDER, IP_ADAPTER_FILE),
                 os.path.join(p["encoder"], "config.json"),
                 os.path.join(p["encoder"], "model.safetensors")]
    return [w for w in want if not os.path.exists(w)]


def _load_image_encoder(models: str):
    """h94/IP-Adapter's ViT-H image encoder in fp16. transformers renamed
    torch_dtype to dtype at 4.56 (diffusers 0.40.0 branches on the same
    version in loaders/ip_adapter.py), so this does too."""
    import torch
    import transformers
    from packaging.version import Version
    from transformers import CLIPVisionModelWithProjection
    p = paths(models)
    kw = {"dtype": torch.float16} if Version(transformers.__version__) >= Version("4.56.0") \
        else {"torch_dtype": torch.float16}
    return CLIPVisionModelWithProjection.from_pretrained(p["encoder"], **kw)


def load_pipeline(models: str, device: str = "cuda", style: bool = False):
    """SDXL base + ControlNet-Union ProMax + the fp16-fix VAE, in fp16. With
    style=True the IP-Adapter's image encoder rides along at construction (the
    proven hand path); the adapter weights themselves are loaded later by
    load_style_adapter(), so style-0 renders made before that call are
    byte-identical to a pipeline that never heard of the adapter: the unet,
    the VAE, the text encoders and the sampler are untouched by an encoder
    that is only ever consulted when ip_adapter_image is passed."""
    import torch
    from diffusers import (AutoencoderKL, ControlNetUnionModel,
                           StableDiffusionXLControlNetUnionPipeline)

    gone = missing_models(models, style=style)
    if gone:
        die("model files missing (run provision.sh):\n  " + "\n  ".join(gone))
    p = paths(models)
    cn = ControlNetUnionModel.from_pretrained(p["union"], torch_dtype=torch.float16)
    n_modes = int(cn.config.num_control_type)
    if n_modes != PROMAX_MODES:
        die(f"the union model loaded with {n_modes} control modes; ProMax has {PROMAX_MODES}. "
            f"{p['union']}/config.json must be xinsir's config_promax.json (provision.sh writes it).")
    vae = AutoencoderKL.from_pretrained(p["vae"], torch_dtype=torch.float16)
    extra = {"image_encoder": _load_image_encoder(models)} if style else {}
    pipe = StableDiffusionXLControlNetUnionPipeline.from_single_file(
        p["ckpt"], controlnet=cn, vae=vae, torch_dtype=torch.float16, config=SDXL_REPO, **extra)
    pipe.to(device)
    pipe.set_progress_bar_config(disable=True)
    setattr(pipe, STYLE_FLAG, False)
    return pipe


# ── the IP-Adapter ─────────────────────────────────────────────────────────

def style_loaded(pipe) -> bool:
    return bool(getattr(pipe, STYLE_FLAG, False))


def load_style_adapter(pipe, models: str) -> None:
    """Load ip-adapter-plus_sdxl_vit-h into the unet, once. After this every
    render() must carry a style image (see the header); the runner renders its
    style-0 jobs before calling this."""
    if style_loaded(pipe):
        return
    if getattr(pipe, "image_encoder", None) is None:
        die("the pipeline was built without an image encoder; load_pipeline(models, style=True) first")
    gone = missing_models(models, style=True)
    if gone:
        die("style model files missing (run provision.sh):\n  " + "\n  ".join(gone))
    p = paths(models)
    pipe.load_ip_adapter(p["adapter"], subfolder=IP_ADAPTER_SUBFOLDER, weight_name=IP_ADAPTER_FILE)
    if getattr(pipe, "feature_extractor", None) is None:
        die("load_ip_adapter registered no feature extractor; the style image could not be preprocessed")
    setattr(pipe, STYLE_FLAG, True)


def set_style_scale(pipe, scale: float) -> None:
    if not style_loaded(pipe):
        die("set_style_scale() before load_style_adapter()")
    s = float(scale)
    if not (0.0 < s <= 1.0):
        die(f"style scale {s} is outside (0, 1]; the sweep's band is 0.3 to 0.6")
    pipe.set_ip_adapter_scale(s)


def load_style_image(path: str, root: str | None = None) -> Image.Image:
    """A cleaned reference as RGB. Refuses a non-square image, because the
    adapter's feature extractor centre-crops a square and would silently drop
    the feet and the crown of a tall one; refuses transparency, because the
    RGB under it is whatever the file happened to hold."""
    if root and not os.path.isabs(path):
        path = os.path.join(root, path)
    if not os.path.exists(path):
        die(f"style reference missing: {path} (run bots-sd-stylerefs.py)")
    im = Image.open(path)
    if im.width != im.height:
        die(f"style reference {path} is {im.width}x{im.height}; references must be square "
            f"(bots-sd-stylerefs.py pads them on the plate)")
    if "A" in im.getbands():
        import numpy as np
        if int(np.asarray(im.getchannel("A")).min()) < 255:
            die(f"style reference {path} carries transparency; composite it on the plate first")
    if "b1" in os.path.basename(path).lower():
        die(f"style reference {path} is the old anchor; the concept art is the law")
    return im.convert("RGB")


def scheduler_for(pipe, name: str):
    from diffusers import (DPMSolverMultistepScheduler, DPMSolverSDEScheduler,
                           EulerAncestralDiscreteScheduler)
    cfg = pipe.scheduler.config
    if name == "dpmpp_2m_karras":
        return DPMSolverMultistepScheduler.from_config(cfg, algorithm_type="dpmsolver++",
                                                       use_karras_sigmas=True)
    if name == "euler_a":
        return EulerAncestralDiscreteScheduler.from_config(cfg)
    if name == "dpmpp_sde_karras":
        return DPMSolverSDEScheduler.from_config(cfg, use_karras_sigmas=True)
    die(f"sampler {name!r} is not one of {SAMPLERS}")


def stack(control_stack: str) -> list[str]:
    names = [s.strip() for s in control_stack.split("+") if s.strip()]
    bad = [n for n in names if n not in UNION_MODE]
    if bad or not names:
        die(f"control stack {control_stack!r}: unknown map(s) {bad}; known {sorted(UNION_MODE)}")
    return names


def load_controls(control_paths: dict[str, str], names: list[str], size: int,
                  root: str | None = None) -> tuple[list[Image.Image], list[int]]:
    """Open the named control maps as RGB at the working size, and the union
    mode index for each. Paths in a job file are repo-relative."""
    images, modes = [], []
    for n in names:
        p = control_paths.get(n)
        if not p:
            die(f"the job names {n} in its control stack but carries no {n} map")
        if root and not os.path.isabs(p):
            p = os.path.join(root, p)
        if not os.path.exists(p):
            die(f"control map missing: {p} (run bots-sd-controls.py)")
        im = Image.open(p).convert("RGB")
        if im.size != (size, size):
            im = im.resize((size, size), Image.LANCZOS)
        images.append(im)
        modes.append(UNION_MODE[n])
    return images, modes


def render(pipe, *, images: list[Image.Image], modes: list[int], scale, end,
           cfg: float, steps: int, seed: int, size: int,
           embeds: dict | None = None,
           truncating_prompt: str | None = None, negative: str | None = None,
           style_image: Image.Image | None = None, style_scale: float | None = None) -> Image.Image:
    """One render. `embeds` is the dict bots_sd_prompt.encode() returns and is
    the production path. `truncating_prompt` hands raw text to the pipeline,
    which keeps 77 tokens and drops the rest: it exists ONLY so smoke.py can
    show the difference, and passing both or neither is refused.

    `style_image` (a square RGB from load_style_image) turns the IP-Adapter on
    for this render at `style_scale`; both or neither. Without them the call
    to the pipeline is exactly the pre-adapter call, so a style-0 render is
    byte-identical to what this function produced before the adapter existed,
    PROVIDED the adapter has not been loaded into the unet yet; after that the
    unet demands an image, and this refuses rather than approximate."""
    import torch
    if (embeds is None) == (truncating_prompt is None):
        die("render() takes exactly one of embeds= (production) or truncating_prompt= (smoke A/B)")
    if len(images) != len(modes) or not images:
        die("render() needs one control mode per control image")
    if (style_image is None) != (style_scale is None):
        die("render() takes style_image= and style_scale= together, or neither")
    scales = list(scale) if isinstance(scale, (list, tuple)) else [float(scale)] * len(images)
    ends = list(end) if isinstance(end, (list, tuple)) else [float(end)] * len(images)
    if len(scales) != len(images) or len(ends) != len(images):
        die("controlScale / controlEnd lists must match the control stack length")
    kw = dict(embeds) if embeds is not None else {"prompt": truncating_prompt,
                                                  "negative_prompt": negative}
    if style_image is not None:
        if not style_loaded(pipe):
            die("a style render was asked for before load_style_adapter(); nothing was rendered")
        set_style_scale(pipe, style_scale)
        kw["ip_adapter_image"] = style_image
    elif style_loaded(pipe):
        die("the IP-Adapter is loaded into the unet, so a render without a style image is no longer "
            "the pre-adapter pipeline (the unet would refuse, and a blank image at scale 0 would not "
            "be byte-identical). Render style-0 jobs before the adapter is loaded; the runner orders "
            "them so.")
    gen = torch.Generator("cuda" if pipe.device.type == "cuda" else "cpu").manual_seed(int(seed))
    out = pipe(
        control_image=images, control_mode=modes,
        controlnet_conditioning_scale=scales, control_guidance_end=ends,
        num_inference_steps=int(steps), guidance_scale=float(cfg),
        height=size, width=size, generator=gen, **kw,
    )
    return out.images[0]


def _main(argv: list[str]) -> int:
    if "--check-models" in argv:
        models = argv[argv.index("--check-models") + 1]
        style = "--style" in argv
        gone = missing_models(models, style=style)
        if gone:
            print("bots_sd_pipeline: model files MISSING under " + models)
            for g in gone:
                print("  " + g)
            print("run provision.sh (RISKS 6 explains the adapter layout)")
            return 1
        print(f"bots_sd_pipeline: every model file present under {models}"
              f"{' (render + style)' if style else ' (render only; pass --style to check the adapter too)'}")
        return 0
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
