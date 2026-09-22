"""BATTLE BOTS / stable-diffusion lane: THE RUNNER.

    python scripts/sd/bots-sd-render.py art-src/sd/jobs/stage0.jsonl --dry-run
    python scripts/sd/bots-sd-render.py art-src/sd/jobs/stage1.jsonl --dry-run
    python scripts/sd/bots-sd-render.py art-src/sd/jobs/stage0.jsonl --models /workspace/models --out /workspace/renders
    python scripts/sd/bots-sd-render.py art-src/sd/jobs/stage1c-limbs.jsonl --dry-run --controls-root art-src/sd/controls/v2

Reads the job lines bots-sd-sweep.py --emit wrote and renders each one through
bots_sd_pipeline.render() with embeddings from bots_sd_prompt.encode(): the
whole prompt, chunked and weighted. It never hands text to the pipeline.

BEFORE IT LOADS ANYTHING it checks every job against the matrix: the job's
`prompt` must be exactly what bots_sd_prompt.build_prompt() assembles for its
slot, tier, plate and variant today, its `negative` what build_negative()
assembles, and its `promptCompel` what build_weighted() assembles, or it
refuses. One source of truth, enforced rather than assumed. Then it counts
tokens and refuses if a prompt would be cut and compel is missing. A style job
must name a reference that exists, is square and is not the old anchor. Every
job must name the contract alpha its cut will use. --dry-run stops there, and
runs on any machine with no GPU.

WHAT IS WIRED: checkpoint sdxl-base-1.0; control stacks made of depth,
lineart and canny through the union model; the three matrix samplers; the
single layout; THE IP-ADAPTER STYLE WEIGHT (ip-adapter-plus_sdxl_vit-h with a
cleaned concept reference, see bots_sd_pipeline.py). NOT WIRED, and refused
with a plain message rather than silently approximated: the other
checkpoints (stage 1's other three arms), the sheet layout (stage 3).

STYLE 0 IS BYTE-IDENTICAL TO BEFORE THE ADAPTER EXISTED. Once the adapter is
loaded into the unet, every call has to carry an image, so the jobs are
ORDERED: every style-0 job renders first on the untouched pipeline, then the
adapter is loaded once and the style jobs render with it. The style-0 job id
and its pipeline call are unchanged, so a stage-0 render on disk is still
valid and is still skipped on resume.

THE CUT. Every render is also written CUT to alpha, with the control alpha it
was conditioned on (bots_sd_matte.py; never a colour key, the plate is the
body's own grey by design): <out>/<part>/cut/<job id>.png on the contract
canvas, with the rim and control edge numbers inside the PNG and beside it.
That cut folder is what scripts/sd/rank-part.py judges. A render already on
disk with no cut gets cut on resume.

THE CONTROLS ROOT. A job carries the tree its maps came from as
`controlsRoot` (the sweep writes it; absent means art-src/sd/controls, the
default). --controls-root re-points every job in the file at another tree
(art-src/sd/controls/v2, the richer limb placeholders): the five square maps,
the matte and the placement, re-read from that tree's own square manifest. A
render against a non-default root carries the root's tag in its id
(..._seed1000_v2), so it never collides with, or resumes as, the default one.
The cut follows the root too: bots_sd_matte.cut() reads the contract alpha at
a fixed place under ITS root, so a non-default job is cut through a shadow
root under <out>/_matte-root/<tag>/ that holds copies of that tree's contract
maps. Measured 2026-09-05: the v2 limb alphas overlap the default ones at IoU
0.63 to 0.97, so cutting a v2 render with the default alpha would hand the
judge the wrong silhouette.

Output: <out>/<part>/<job id>.png beside <job id>.json (the job, the token and
chunk counts, the embedding length, the style, the seconds, the cut metrics).
A render that already exists is skipped, so a killed run resumes. The
seconds-per-image line at the end is the number bots-sd-sweep.py --sec prices
from.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bots_sd_matte as MATTE  # noqa: E402
import bots_sd_pipeline as PIPE  # noqa: E402
import bots_sd_prompt as P  # noqa: E402

ROOT = P.ROOT
WIRED_CHECKPOINTS = ("sdxl-base-1.0",)
DEFAULT_CONTROLS = "art-src/sd/controls"
CONTROL_KEYS = ("depth", "lineart", "canny", "alpha", "hidden")


def controls_root(j: dict) -> str:
    """The controls tree a job's maps came from; absent means the default."""
    return j.get("controlsRoot") or DEFAULT_CONTROLS


def root_tag(rel: str) -> str:
    """'' for the default root, else the root's name under it (v2). The same
    rule as bots-sd-sweep.py, so file names and render ids agree."""
    if rel == DEFAULT_CONTROLS:
        return ""
    if rel.startswith(DEFAULT_CONTROLS + "/"):
        return rel[len(DEFAULT_CONTROLS) + 1:].replace("/", "-")
    return os.path.basename(rel.rstrip("/"))


def root_rel(path: str) -> str:
    p = path if os.path.isabs(path) else os.path.join(ROOT, path)
    rel = os.path.relpath(os.path.normpath(p), ROOT).replace(os.sep, "/")
    if rel.startswith(".."):
        P.die(f"controls root {path} is outside the repo")
    return rel


def repoint(j: dict, rel: str) -> dict:
    """The same job against another controls root: every control map and the
    matte under it, the placement re-read from that root's own square
    manifest, and controlsRoot set. Refuses when the root has no manifest or
    no entry for the part, rather than keeping a placement from another tree."""
    if controls_root(j) == rel:
        return j
    j = dict(j)
    j["controls"] = {k: f"{rel}/square/{j['part']}/{k}.png" for k in CONTROL_KEYS}
    j["matte"] = f"{rel}/contract/{j['part']}/alpha.png"
    man = os.path.join(ROOT, rel, "square", "manifest.json")
    if not os.path.exists(man):
        P.die(f"--controls-root {rel}: no square manifest at {man} (run bots-sd-controls.py for that root)")
    items = {it["key"]: it for it in json.load(open(man, encoding="utf-8"))["items"]}
    it = items.get(j["part"])
    if it is None:
        P.die(f"--controls-root {rel}: its square manifest has no entry for {j['part']}")
    j["placement"] = {"cropBack": it["cropBack"], "contractCanvas": it["contractCanvas"],
                      "workingCanvas": it["workingCanvas"]}
    j["controlsRoot"] = rel
    return j


def is_style(j: dict) -> bool:
    return float(j.get("style", 0.0)) > 0.0


def job_id(j: dict) -> str:
    """Unchanged for a style-0 job (so old renders still resume); a style job
    carries its adapter scale and reference name, so the two never collide."""
    sc = j["controlScale"]
    sc = "-".join(f"{float(x):.2f}" for x in sc) if isinstance(sc, list) else f"{float(sc):.2f}"
    base = (f"{j['part']}_{j['controlStack']}_s{sc}_e{float(j['controlEnd']):.2f}"
            f"_cfg{float(j['cfg']):.1f}_st{int(j['steps'])}_{j['sampler']}_seed{int(j['seed'])}")
    if is_style(j):
        base += f"_ip{float(j['style']):.2f}_{j['styleRefName']}"
    tag = root_tag(controls_root(j))
    if tag:
        base += f"_{tag}"
    return base


def check_job(m: dict, j: dict) -> list[str]:
    """Everything that would make this job render something other than what
    the plan says. Empty list means it is safe to spend on."""
    bad = []
    for k in ("part", "slot", "tier", "plate", "promptVariant", "negativeSet", "prompt", "negative",
              "controls", "controlStack", "controlScale", "controlEnd", "cfg", "steps", "sampler",
              "seed", "checkpoint", "style"):
        if k not in j:
            bad.append(f"missing field {k}")
    if bad:
        return bad
    want = P.build_prompt(m, j["slot"], int(j["tier"]), j["plate"], j["promptVariant"])
    if j["prompt"] != want:
        bad.append("prompt differs from what the matrix assembles today; re-run bots-sd-sweep.py --emit")
    wneg = P.build_negative(m, j["negativeSet"], j["slot"])
    if j["negative"] != wneg:
        bad.append("negative differs from what the matrix assembles today; re-run bots-sd-sweep.py --emit")
    wcompel = P.build_weighted(m, j["slot"], int(j["tier"]), j["plate"], j["promptVariant"])
    if j.get("promptCompel", wcompel) != wcompel:
        bad.append("promptCompel differs from build_weighted(); re-run bots-sd-sweep.py --emit")
    if j["checkpoint"] not in WIRED_CHECKPOINTS:
        bad.append(f"checkpoint {j['checkpoint']!r} is not wired in this runner (only {WIRED_CHECKPOINTS})")
    if j.get("layout", "single") != "single":
        bad.append(f"layout {j['layout']!r} is not wired in this runner (only single)")
    if j["sampler"] not in PIPE.SAMPLERS:
        bad.append(f"sampler {j['sampler']!r} is not one of {PIPE.SAMPLERS}")

    # the style arm: a scale in the band, a named reference that exists and is fit to feed
    try:
        s = float(j["style"])
    except (TypeError, ValueError):
        s = -1.0
    if s < 0.0 or s > 1.0:
        bad.append(f"style {j['style']!r} is not a scale in [0, 1]")
    elif s > 0.0:
        ref = j.get("styleRef")
        if not ref or not j.get("styleRefName"):
            bad.append(f"style {s} needs styleRef and styleRefName (the sweep writes them)")
        else:
            try:
                PIPE.load_style_image(ref, root=ROOT)
            except SystemExit as e:
                bad.append(str(e))
    elif j.get("styleRef"):
        bad.append("style 0 with a styleRef: the sweep does not write that; re-run --emit")

    # the controls root: every map and the matte must sit under the root the job names
    rel = controls_root(j)
    paths = list(j["controls"].values()) if isinstance(j["controls"], dict) else []
    off = [p for p in paths + [j.get("matte") or ""] if not str(p).startswith(rel + "/")]
    if off:
        bad.append(f"controlsRoot is {rel} but {off[0]!r} is not under it; re-run bots-sd-sweep.py --emit")

    # the cut: the contract alpha and the placement the matte inverts
    matte = j.get("matte")
    if not matte:
        bad.append("no `matte` (the contract alpha path); re-run bots-sd-sweep.py --emit")
    elif not os.path.exists(os.path.join(ROOT, matte)):
        bad.append(f"contract alpha missing at {matte} (run bots-sd-controls.py)")
    pl = j.get("placement") or {}
    if not all(k in pl for k in ("cropBack", "contractCanvas", "workingCanvas")):
        bad.append("no `placement` (cropBack/contractCanvas/workingCanvas from the square manifest); re-run --emit")

    try:
        names = PIPE.stack(j["controlStack"])
        for n in names:
            p = j["controls"].get(n)
            if not p or not os.path.exists(os.path.join(ROOT, p)):
                bad.append(f"control map {n} missing at {p} (run bots-sd-controls.py)")
        sc = j["controlScale"]
        if isinstance(sc, list) and len(sc) != len(names):
            bad.append("controlScale list does not match the control stack")
    except SystemExit as e:
        bad.append(str(e))
    return bad


def matte_root(j: dict, out: str) -> str:
    """The root bots_sd_matte.cut() reads the contract alpha and canny from. The
    matte module reads them at a FIXED place under its root
    (<root>/art-src/sd/controls/contract/<part>/), so a job against another
    controls root gets a shadow root under <out>/_matte-root/<tag>/ holding
    fresh copies of that tree's contract maps for the part. The copies are
    small and re-made every time, so a regenerated tree is never cut with a
    stale alpha."""
    rel = controls_root(j)
    if rel == DEFAULT_CONTROLS:
        return ROOT
    shadow = os.path.join(out, "_matte-root", root_tag(rel))
    src_dir = os.path.join(ROOT, rel, "contract", j["part"])
    dst_dir = os.path.join(shadow, "art-src", "sd", "controls", "contract", j["part"])
    os.makedirs(dst_dir, exist_ok=True)
    if not os.path.exists(os.path.join(src_dir, "alpha.png")):
        P.die(f"contract alpha missing at {rel}/contract/{j['part']}/alpha.png (run bots-sd-controls.py)")
    for fn in ("alpha.png", "canny.png"):
        if os.path.exists(os.path.join(src_dir, fn)):
            shutil.copyfile(os.path.join(src_dir, fn), os.path.join(dst_dir, fn))
    return shadow


def write_cut(img, j: dict, dst_dir: str, jid: str, out: str) -> dict:
    cut_dir = os.path.join(dst_dir, "cut")
    rgba, metrics = MATTE.cut(img, j["part"], job=j, root=matte_root(j, out))
    metrics["controlsRoot"] = controls_root(j)
    metrics["contractAlpha"] = j["matte"]
    MATTE.save_cut(rgba, metrics, os.path.join(cut_dir, jid + ".png"))
    return metrics


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs", help="a .jsonl written by bots-sd-sweep.py --emit")
    ap.add_argument("--models", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--limit", type=int, default=0, help="render only the first N jobs (in file order)")
    ap.add_argument("--dry-run", action="store_true",
                    help="check every job and count tokens; load nothing; needs no GPU")
    ap.add_argument("--controls-root", default=None, metavar="DIR",
                    help="render every job against this controls tree instead of the one it carries "
                         f"(default: as written, which is {DEFAULT_CONTROLS} unless the sweep said otherwise; "
                         f"{DEFAULT_CONTROLS}/v2 for the richer limb placeholders)")
    args = ap.parse_args()

    m = P.load_matrix()
    jobs = [json.loads(l) for l in open(args.jobs, encoding="utf-8") if l.strip()]
    if not jobs:
        P.die(f"{args.jobs} holds no jobs")
    if args.limit:
        jobs = jobs[:args.limit]
    if args.controls_root:
        jobs = [repoint(j, root_rel(args.controls_root)) for j in jobs]

    # 1. every job against the matrix, before anything costs money
    problems = {}
    for i, j in enumerate(jobs):
        bad = check_job(m, j)
        if bad:
            problems[i] = bad
    if problems:
        print(f"{len(problems)} of {len(jobs)} jobs are not safe to render:")
        for i, bad in list(problems.items())[:12]:
            print(f"  job {i} ({jobs[i].get('part')}): " + "; ".join(bad))
        P.die("fix the job file first; nothing was loaded and nothing was rendered")
    ids = [job_id(j) for j in jobs]
    if len(set(ids)) != len(ids):
        P.die("two jobs share an id; the file would overwrite its own renders")

    # 2. the prompt pre-flight on every distinct prompt
    distinct = {}
    for j in jobs:
        distinct.setdefault((j["prompt"], j["negative"]), j["promptCompel"])
    n_style = sum(1 for j in jobs if is_style(j))
    refs = sorted({j["styleRefName"] for j in jobs if is_style(j)})
    roots = sorted({controls_root(j) for j in jobs})
    print(f"{len(jobs)} jobs ({n_style} with the IP-Adapter, references {refs or 'none'}), "
          f"{len(distinct)} distinct prompt/negative pairs, working size {args.size}, "
          f"controls root {roots[0] if len(roots) == 1 else roots}")
    longest = None
    for (prompt, negative), weighted in distinct.items():
        n, how = P.count_tokens(prompt)
        nn, _ = P.count_tokens(negative)
        print(f"  {n:>4} + {nn:>3} tokens, {P.chunks_needed(max(n, nn))} chunks: {prompt[:72]}...")
        if longest is None or n > longest[0]:
            longest = (n, prompt, negative)
    P.assert_embeddable(longest[1], longest[2], label="the longest prompt in this job file")
    if args.dry_run:
        print("DRY RUN OK: every job matches the matrix, every reference and control map is on disk, "
              "and every prompt will be embedded whole.")
        return 0
    if not args.models or not args.out:
        P.die("--models and --out are required to render (or pass --dry-run)")

    # 3. the models, once. Style-0 jobs first on the untouched pipeline (see the header).
    import torch
    if not torch.cuda.is_available():
        P.die("no CUDA device")
    os.makedirs(args.out, exist_ok=True)
    order = sorted(range(len(jobs)), key=lambda i: (is_style(jobs[i]), i))
    pipe = PIPE.load_pipeline(args.models, style=n_style > 0)
    embed_cache: dict = {}
    sched_cache: dict = {}
    ref_cache: dict = {}

    # 4. the jobs
    done = skipped = cut_only = 0
    t_all = time.time()
    secs = []
    for k, i in enumerate(order):
        j = jobs[i]
        jid = ids[i]
        dst_dir = os.path.join(args.out, j["part"])
        os.makedirs(dst_dir, exist_ok=True)
        png = os.path.join(dst_dir, jid + ".png")
        cut_png = os.path.join(dst_dir, "cut", jid + ".png")
        if os.path.exists(png):
            skipped += 1
            if not os.path.exists(cut_png):
                from PIL import Image
                write_cut(Image.open(png), j, dst_dir, jid, args.out)
                cut_only += 1
            continue
        if is_style(j) and not PIPE.style_loaded(pipe):
            PIPE.load_style_adapter(pipe, args.models)
            print("  IP-Adapter loaded; every remaining job is a style job")
        key = (j["promptCompel"], j["negative"])
        if key not in embed_cache:
            embed_cache[key] = P.encode(pipe, j["promptCompel"], j["negative"], plain=j["prompt"])
            kw, meta = embed_cache[key]
            print(f"  embedded {meta['promptTokens']} tokens in {meta['chunks']} chunks "
                  f"(embedding length {meta['embedLen']})")
        kw, meta = embed_cache[key]
        if j["sampler"] not in sched_cache:
            sched_cache[j["sampler"]] = PIPE.scheduler_for(pipe, j["sampler"])
        pipe.scheduler = sched_cache[j["sampler"]]
        names = PIPE.stack(j["controlStack"])
        images, modes = PIPE.load_controls(j["controls"], names, args.size, root=ROOT)
        style_kw = {}
        if is_style(j):
            if j["styleRef"] not in ref_cache:
                ref_cache[j["styleRef"]] = PIPE.load_style_image(j["styleRef"], root=ROOT)
            style_kw = {"style_image": ref_cache[j["styleRef"]], "style_scale": float(j["style"])}
        t0 = time.time()
        img = PIPE.render(pipe, images=images, modes=modes, scale=j["controlScale"],
                          end=j["controlEnd"], cfg=j["cfg"], steps=j["steps"], seed=j["seed"],
                          size=args.size, embeds=kw, **style_kw)
        dt = time.time() - t0
        secs.append(dt)
        img.save(png)
        metrics = write_cut(img, j, dst_dir, jid, args.out)
        with open(os.path.join(dst_dir, jid + ".json"), "w", encoding="utf-8") as f:
            json.dump({"job": j, "embedding": meta, "seconds": round(dt, 2), "size": args.size,
                       "png": png, "cut": cut_png, "matte": metrics,
                       "style": {"scale": float(j["style"]), "ref": j.get("styleRef")}}, f, indent=1)
        done += 1
        tag = f"  ip {float(j['style']):.2f} {j['styleRefName']}" if is_style(j) else ""
        print(f"  [{k + 1}/{len(jobs)}] {jid}  {dt:.1f}s  rim {metrics['rimEdgeRecall']:.2f}{tag}")

    if secs:
        per = sum(secs) / len(secs)
        print(f"\nrendered {done} (skipped {skipped} already on disk, {cut_only} of those newly cut) in "
              f"{time.time() - t_all:.0f}s; {per:.2f} s/image. Price the plan with: "
              f"python scripts/sd/bots-sd-sweep.py --sec {per:.2f}")
    else:
        print(f"nothing to render: all {skipped} renders already on disk ({cut_only} newly cut)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
