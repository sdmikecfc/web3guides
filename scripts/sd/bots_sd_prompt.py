"""BATTLE BOTS / stable-diffusion lane: THE PROMPT, IN ONE PLACE.

Every prompt any script under scripts/sd/ sends to a model is assembled HERE,
from scripts/sd/bots-sd-prompts.json, and embedded HERE. The sweep writes its
job files with it, the smoke test renders with it, the runner renders with it.
Nowhere else holds prompt text, so the three cannot disagree on a word.

    python scripts/sd/bots_sd_prompt.py                    # token table for every variant and slot
    python scripts/sd/bots_sd_prompt.py --show head-t3-1   # plain, weighted, and what a 77 cut would keep
    python scripts/sd/bots_sd_prompt.py --assert           # exit 1 unless every prompt can be embedded WHOLE here
    python scripts/sd/bots_sd_prompt.py --fetch-tokenizer  # 2.2 MB CLIP tokenizer.json so counts are real

── THE DEFECT THIS FILE CLOSES ────────────────────────────────────────────
The assembled production prompt is 234 CLIP tokens (179 words; measured with
the real CLIP BPE tokenizer on 2026-09-05). CLIP's context is 77 tokens. Plain
diffusers keeps the first 77 and DROPS THE REST WITHOUT A WORD. The skeleton
puts the subject and the camera first, so what survived the cut was

    "bbclay, a single robot toy HEAD on its own, no body ... wider than it
     is tall, a rounded dome crown, the underside is a continuous dome and is"

and what was silently deleted was the finish ("designer vinyl toy, moulded
clay, soft satin sheen"), the colour-neutral law, the light law and the plate:
every house law the sweep exists to control. The smoke test could not see it,
because it carried its own 52-token prompt.

── THE FIX ────────────────────────────────────────────────────────────────
compel (pip `compel`, by damian0815) encodes a prompt of any length as as many
77-token chunks as it takes, concatenates the embeddings, and takes per-clause
weights in its own syntax: `(clause)1.2`. So this file offers

  build_prompt()      the plain text. What people read, what the job files
                      carry, what token counts are taken on.
  build_weighted()    the same segments, the law clauses wrapped as
                      (clause)1.20 in compel syntax. What the model is fed.
                      The weights live in the matrix under `weights`.
  build_negative()    the negative for a set, and when a slot is named, that
                      slot's own groups in front (matrix `negative.slot`):
                      arm, leg, weapon and torso forbid a face and a whole
                      character; the head forbids a third eye (anything above
                      the eye line: a lens, a window, a vent, a grille).
  count_tokens()      the real CLIP token count whenever a tokenizer can be
                      found, else an estimate that OVER-counts on purpose,
                      and it always says which one it used.
  assert_embeddable() the pre-flight. Refuses, before any model is loaded,
                      when a prompt would be cut and compel is not there to
                      chunk it.
  encode()            the only function that turns text into embeddings. It
                      runs compel with truncation OFF, then checks the
                      embedding actually covers every token. Without compel
                      it REFUSES. It never falls back to the cut.

Nothing here reads the GPU. Everything but encode() runs on any machine.
"""
from __future__ import annotations

import glob
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MATRIX = os.path.join(HERE, "bots-sd-prompts.json")
TOKENIZER_DIR = os.path.join(HERE, ".tokenizer")
TOKENIZER_JSON = os.path.join(TOKENIZER_DIR, "tokenizer.json")
# SDXL's tokenizer and tokenizer_2 both use this BPE vocabulary (tokenizer_2
# differs only in its pad token), so one count serves both encoders.
CLIP_REPO = "openai/clip-vit-large-patch14"

PROMPT_LIMIT = 77           # CLIP's context, BOS and EOS included
CHUNK_BODY = PROMPT_LIMIT - 2   # tokens of text per chunk once BOS and EOS are in
COMPEL_PIN = "compel==2.4.0"

SEGMENTS = ("trigger", "subject", "view", "form", "features", "forehead", "tier",
            "finish", "neutral", "light", "plate")


def die(msg: str) -> None:
    """A breaker, never a fallback. There is no version of this module that
    quietly sends a shorter prompt than the one it was asked to send."""
    raise SystemExit("bots_sd_prompt REFUSES: " + msg)


def load_matrix() -> dict:
    return json.load(open(MATRIX, encoding="utf-8"))


# ── assembly ───────────────────────────────────────────────────────────────

def segments(m: dict, slot: str, tier: int, plate: str, variant: str) -> list[tuple[str, str]]:
    """The prompt as an ordered list of (segment name, text). Everything else
    in this file is a view of this list, so plain and weighted cannot drift."""
    sk, sub = m["skeleton"], m["subject"][slot]
    if plate not in m["plates"] or plate.startswith("_"):
        die(f"unknown plate {plate!r}")
    if variant == "terse":
        return [("trigger", m["trigger"]), ("subject", sk["subjectShort"][slot]),
                ("view", sk["viewShort"]), ("finish", sk["finishShort"]),
                ("plate", m["plates"]["_short"][plate])]
    if variant not in ("full", "full+tier"):
        die(f"unknown promptVariant {variant!r}")
    out = [("trigger", m["trigger"]), ("subject", sub["subject"]), ("view", sk["view"]),
           ("form", sub["form"]), ("features", sub["features"])]
    # THE CLEAR FOREHEAD (lane H, 2026-09-05): a slot whose subject entry carries
    # `forehead` says it right after its features. Only the head does (matrix
    # skeleton._forehead): the forehead is blank clay, the eyes are exactly two,
    # and the family character sits in the ear cups, the crown, the cheeks and
    # the mouth. Any other slot is untouched by this line.
    if sub.get("forehead"):
        out.append(("forehead", sub["forehead"]))
    if variant == "full+tier":
        out.append(("tier", m["tier"][str(tier)]))
    out += [("finish", sk["finish"]), ("neutral", sk["neutral"]), ("light", sk["light"]),
            ("plate", m["plates"][plate]["phrase"])]
    return out


def build_prompt(m: dict, slot: str, tier: int, plate: str, variant: str) -> str:
    return ", ".join(text for _, text in segments(m, slot, tier, plate, variant))


def _escape(text: str) -> str:
    """compel reads ( ) and " as syntax. Our clauses carry none, but a clause
    edited later might, and an unescaped paren would silently become a weight
    group. Hyphens inside words (dead-on, wind-up) are plain text to compel's
    parser (checked against compel 2.4.0's grammar) and are left alone."""
    return (text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            .replace('"', '\\"'))


def weights_table(m: dict) -> dict[str, float]:
    return {k: float(v) for k, v in m.get("weights", {}).items() if not k.startswith("_")}


def build_weighted(m: dict, slot: str, tier: int, plate: str, variant: str) -> str:
    """The compel form: the plain segments, with every segment named in the
    matrix's `weights` table wrapped as (text)w. A segment at 1.0 is emitted
    bare so the string stays readable."""
    w = weights_table(m)
    out = []
    for name, text in segments(m, slot, tier, plate, variant):
        k = w.get(name, 1.0)
        text = _escape(text)
        out.append(f"({text}){k:.2f}" if abs(k - 1.0) > 1e-9 else text)
    return ", ".join(out)


def slot_negative_groups(m: dict, slot: str | None) -> list[str]:
    """The groups a slot carries IN FRONT of either negative set, from the
    matrix's `negative.slot` map. Measured 2026-09-05: an arm rendered as a
    whole robot with eyes and feet, and a mallet grew eyes, so every limb
    slot forbids a face and a whole character whatever the set's length; and
    every design-2 head pool lost to a lens or a grille above the eye line
    (rank-part's THIRD EYE), so the head forbids that (`forehead`, lane H).
    No slot given (smoke.py's call) means no slot groups."""
    if not slot:
        return []
    return list(m["negative"].get("slot", {}).get(slot, []))


def build_negative(m: dict, which: str, slot: str | None = None) -> str:
    """The negative text for a set (`short` or `long`) and, when a slot is
    named, that slot's own groups first. Order matters for the same reason it
    does in the positive: the first tokens dominate, and for a limb the face
    is the fatal defect."""
    if which not in m["negative"] or which in ("_", "groups", "slot"):
        die(f"unknown negative set {which!r}")
    g = m["negative"]["groups"]
    names = slot_negative_groups(m, slot) + list(m["negative"][which])
    missing = [k for k in names if k not in g]
    if missing:
        die(f"negative set {which!r} for slot {slot!r} names groups with no text: {missing}")
    return ", ".join(g[k]["text"] for k in names)


# ── counting ───────────────────────────────────────────────────────────────

_COUNTER: tuple | None = None
_BUNDLED: tuple | None = None


def _find_tokenizer_json() -> str | None:
    for p in (os.environ.get("BB_CLIP_TOKENIZER_JSON"), TOKENIZER_JSON):
        if p and os.path.exists(p):
            return p
    hub = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub",
                       "models--openai--clip-vit-large-patch14", "snapshots", "*", "tokenizer.json")
    hits = sorted(glob.glob(hub))
    return hits[0] if hits else None


def _estimate(text: str) -> int:
    """The fallback, and it is built to OVER-count. One and a half tokens per
    word, one per comma, plus BOS and EOS. On the production prompt the real
    count is 234 and this says 308, so it can only ever err toward "does not
    fit", which is the safe direction for a pre-flight."""
    words = len(text.replace(",", " ").split())
    return int(math.ceil(words * 1.5 + text.count(",") + 2))


def tokenizer() -> tuple[str, object, object]:
    """(name, count_fn, decode_fn_or_None). count_fn(text) returns the token
    count INCLUDING BOS and EOS, the same convention diffusers' 77 uses. Real
    when it can be, an estimate otherwise, and the name says which."""
    global _COUNTER
    if _COUNTER is not None:
        return _COUNTER
    try:
        from transformers import CLIPTokenizer  # present wherever diffusers is
        try:
            tok = CLIPTokenizer.from_pretrained(CLIP_REPO, local_files_only=True)
        except Exception:
            tok = CLIPTokenizer.from_pretrained(CLIP_REPO)
        _COUNTER = ("clip-bpe (transformers)",
                    lambda t: len(tok(t).input_ids),
                    lambda ids: tok.decode(ids, skip_special_tokens=True))
        return _COUNTER
    except Exception:
        pass
    p = _find_tokenizer_json()
    if p:
        try:
            from tokenizers import Tokenizer
            tok = Tokenizer.from_file(p)
            tok.no_truncation()
            rel = os.path.relpath(p, ROOT) if p.startswith(ROOT) else p
            _COUNTER = (f"clip-bpe (tokenizers, {rel})",
                        lambda t: len(tok.encode(t).ids),
                        lambda ids: tok.decode(ids, skip_special_tokens=True))
            return _COUNTER
        except Exception:
            pass
    _COUNTER = ("ESTIMATE (no CLIP tokenizer here; over-counts on purpose)", _estimate, None)
    return _COUNTER


def _count_tokens_orig(text: str) -> tuple[int, str]:
    name, fn, _ = tokenizer()
    return int(fn(text)), name


def _bundled_tokenizer():
    """The bundled CLIP BPE (scripts/sd/.tokenizer/tokenizer.json) through the
    tokenizers library, loaded once. None when the file or the library is absent."""
    global _BUNDLED
    if _BUNDLED is None:
        try:
            from tokenizers import Tokenizer
            tok = Tokenizer.from_file(TOKENIZER_JSON)
            tok.no_truncation()
            _BUNDLED = (tok,)
        except Exception:
            _BUNDLED = (None,)
    return _BUNDLED[0]


def count_tokens(text: str) -> tuple[int, str]:
    """Prefer the bundled real CLIP BPE through the tokenizers library. Measured on
    the box on 2026-09-05: the transformers path counted 799 tokens for a prompt the
    pipeline's own tokenizer counts at 223, and the smoke test rightly refused on the
    disagreement. Falls back to the old path (transformers, then the over-counting
    estimate) and always says which counter answered.

    This function sits ABOVE the __main__ guard on purpose: the first version was
    appended below it, so `python bots_sd_prompt.py --assert` died with NameError
    while every importer worked."""
    tok = _bundled_tokenizer()
    if tok is not None:
        return len(tok.encode(text).ids), "clip-bpe (tokenizers, bundled tokenizer.json)"
    return _count_tokens_orig(text)


def is_real_count(counter_name: str) -> bool:
    return counter_name.startswith("clip-bpe")


def chunks_needed(n_tokens: int) -> int:
    """How many 77-token chunks compel will build for n tokens (BOS/EOS
    counted once in n; every chunk gets its own pair)."""
    return max(1, math.ceil(max(n_tokens - 2, 0) / CHUNK_BODY))


def cut_preview(text: str) -> str | None:
    """What a plain 77-token pipeline would KEEP of this text, or None when no
    real tokenizer is available to say. Uses the same counter count_tokens()
    does (the bundled tokenizer.json first), so the preview and the count
    cannot disagree."""
    bundled = _bundled_tokenizer()
    if bundled is not None:
        ids = bundled.encode(text).ids
        decode = lambda i: bundled.decode(i, skip_special_tokens=True)  # noqa: E731
    else:
        name, fn, decode = tokenizer()
        if not is_real_count(name) or decode is None:
            return None
        try:
            from transformers import CLIPTokenizer
            ids = CLIPTokenizer.from_pretrained(CLIP_REPO, local_files_only=True)(text).input_ids
        except Exception:
            return None
    if len(ids) <= PROMPT_LIMIT:
        return text
    # the bare tokenizers decoder leaves CLIP's end-of-word markers in; fold
    # them back into spaces so the preview reads as prose
    kept = decode(ids[1:PROMPT_LIMIT - 1]).replace("</w>", " ")
    kept = " ".join(kept.split()).replace(" ,", ",").replace(" - ", "-")
    return kept


def compel_version() -> str | None:
    try:
        import compel  # imports torch; absent on a box with no render stack
        return getattr(compel, "__version__", "installed")
    except Exception:
        return None


# ── the pre-flight ─────────────────────────────────────────────────────────

def assert_embeddable(prompt: str, negative: str, label: str = "the production prompt",
                      quiet: bool = False) -> dict:
    """Refuse, before anything is loaded, if this prompt could not reach the
    model whole. Returns the counts so callers can print or store them."""
    n, how = count_tokens(prompt)
    nn, _ = count_tokens(negative)
    longest = max(n, nn)
    ver = compel_version()
    info = {"promptTokens": n, "negativeTokens": nn, "counter": how, "limit": PROMPT_LIMIT,
            "chunks": chunks_needed(longest), "compel": ver, "real": is_real_count(how)}
    if not quiet:
        print(f"PROMPT PRE-FLIGHT ({label})")
        print(f"  prompt   {n:>4} tokens   negative {nn:>4} tokens   context {PROMPT_LIMIT}   "
              f"chunks needed {info['chunks']}")
        print(f"  counter  {how}")
        keep = cut_preview(prompt)
        if keep is not None and n > PROMPT_LIMIT:
            print(f"  a plain {PROMPT_LIMIT}-token pipeline would keep only: \"{keep}\"")
        print(f"  compel   {ver or 'NOT INSTALLED'}")
    if longest > PROMPT_LIMIT and not ver:
        die(f"{label} is {n} tokens and its negative {nn}; CLIP holds {PROMPT_LIMIT}. Without compel "
            f"the tail is CUT SILENTLY and the finish, the neutral law, the light law and the plate "
            f"never reach the model. Install it (pip install --no-deps {COMPEL_PIN} \"pyparsing~=3.0\"; "
            f"provision.sh does) and run again. Nothing was loaded and nothing was rendered.")
    if not quiet:
        print(f"  OK: the whole prompt will be embedded in {info['chunks']} chunk(s)"
              if longest > PROMPT_LIMIT else "  OK: fits in one chunk")
    return info


# ── the embedding, the only text-to-tensor path ────────────────────────────

def _pad_to_same_length(compel, cond, neg):
    """compel 2.4 on transformers 5 raises AttributeError (EmbeddingsProviderMulti
    has no empty_z) inside pad_conditioning_tensors_to_same_length for SDXL's two
    encoders, measured on the box on 2026-09-05. This does what that method
    means to do: pad the shorter embedding with whole 77-token chunks of the
    EMPTY prompt's embedding until both are the same length."""
    import torch
    if cond.shape[1] == neg.shape[1]:
        return cond, neg
    empty = compel("")
    empty = empty[0] if isinstance(empty, (tuple, list)) else empty
    def grow(t, n):
        while t.shape[1] < n:
            t = torch.cat([t, empty.to(t.device, t.dtype)], dim=1)
        return t[:, :n, :]
    n = max(cond.shape[1], neg.shape[1])
    return grow(cond, n), grow(neg, n)


def encode(pipe, weighted: str, negative: str, plain: str) -> tuple[dict, dict]:
    """Embed the weighted prompt and the negative through compel with
    truncation OFF, for an SDXL pipeline (two tokenizers, two encoders,
    pooled output from the second). Returns (kwargs for pipe(...), meta).

    THE PROOF IS IN THE SHAPE. After compel returns, the plain prompt is
    counted with the pipeline's OWN tokenizer and the embedding must be a
    whole number of 77-position chunks covering every one of those tokens.
    Anything shorter means something truncated, and that is a refusal."""
    try:
        from compel import Compel, ReturnedEmbeddingsType
    except Exception as e:  # ImportError, or torch missing underneath it
        die(f"compel could not be imported ({type(e).__name__}: {e}). The prompt is longer than "
            f"{PROMPT_LIMIT} tokens and there is no other path that embeds it whole. "
            f"pip install --no-deps {COMPEL_PIN} \"pyparsing~=3.0\"")
    dtype = pipe.text_encoder_2.dtype
    compel = Compel(
        tokenizer=[pipe.tokenizer, pipe.tokenizer_2],
        text_encoder=[pipe.text_encoder, pipe.text_encoder_2],
        returned_embeddings_type=ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
        requires_pooled=[False, True],
        truncate_long_prompts=False,          # THE FIX: chunk, never cut
        dtype_for_device_getter=lambda _d: dtype,
    )
    cond, pooled = compel(weighted)
    neg, neg_pooled = compel(negative)
    cond, neg = _pad_to_same_length(compel, cond, neg)

    n_plain = len(pipe.tokenizer(plain).input_ids)
    n_neg = len(pipe.tokenizer(negative).input_ids)
    need = chunks_needed(max(n_plain, n_neg)) * PROMPT_LIMIT
    got = int(cond.shape[1])
    if got % PROMPT_LIMIT != 0 or got < need or int(neg.shape[1]) != got:
        die(f"the embedding is {got} positions long ({int(neg.shape[1])} for the negative) but "
            f"{n_plain} prompt tokens / {n_neg} negative tokens need {need}. Something truncated.")
    meta = {"promptTokens": n_plain, "negativeTokens": n_neg, "embedLen": got,
            "chunks": got // PROMPT_LIMIT, "counter": "clip-bpe (the pipeline's own tokenizer)"}
    kwargs = {"prompt_embeds": cond, "pooled_prompt_embeds": pooled,
              "negative_prompt_embeds": neg, "negative_pooled_prompt_embeds": neg_pooled}
    return kwargs, meta


# ── cli ────────────────────────────────────────────────────────────────────

def fetch_tokenizer() -> str:
    from huggingface_hub import hf_hub_download
    os.makedirs(TOKENIZER_DIR, exist_ok=True)
    p = hf_hub_download(repo_id=CLIP_REPO, filename="tokenizer.json", local_dir=TOKENIZER_DIR)
    print(f"fetched {p} ({os.path.getsize(p) / 1e6:.1f} MB, MIT licence, gitignored)")
    return p


def part_triple(key: str) -> tuple[str, int, int]:
    slot, t, d = key.split("-")
    return slot, int(t[1:]), int(d)


def main(argv: list[str]) -> int:
    if "--fetch-tokenizer" in argv:
        fetch_tokenizer()
        return 0
    m = load_matrix()
    if "--show" in argv:
        key = argv[argv.index("--show") + 1]
        slot, tier, _ = part_triple(key)
        plate = argv[argv.index("--plate") + 1] if "--plate" in argv else "grey"
        variant = argv[argv.index("--variant") + 1] if "--variant" in argv else "full+tier"
        plain = build_prompt(m, slot, tier, plate, variant)
        print("PLAIN\n  " + plain)
        print("\nWEIGHTED (what the model is fed)\n  " + build_weighted(m, slot, tier, plate, variant))
        n, how = count_tokens(plain)
        print(f"\n{n} tokens ({how}), {chunks_needed(n)} chunks")
        keep = cut_preview(plain)
        if keep is not None and n > PROMPT_LIMIT:
            print(f"a plain {PROMPT_LIMIT}-token pipeline would keep only:\n  \"{keep}\"")
        for which in ("short", "long"):
            neg = build_negative(m, which, slot)
            nn, _ = count_tokens(neg)
            print(f"\nNEGATIVE {which} for {slot} ({nn} tokens, {chunks_needed(nn)} chunks; "
                  f"slot groups {slot_negative_groups(m, slot) or 'none'})\n  " + neg)
        return 0

    print("TOKEN COUNTS, tier 3, plate grey")
    print(f"  {'variant':<10} {'slot':<7} {'tokens':>6} {'chunks':>6}")
    worst, worst_key = 0, None
    slots = [s for s in m["subject"] if not s.startswith("_")]
    for variant in m["axes"]["promptVariant"]["values"]:
        for slot in slots:
            n, how = count_tokens(build_prompt(m, slot, 3, "grey", variant))
            print(f"  {variant:<10} {slot:<7} {n:>6} {chunks_needed(n):>6}")
            if n > worst:
                worst, worst_key = n, (variant, slot)
    worst_neg, worst_neg_key = 0, None
    for which in ("short", "long"):
        for slot in slots:
            n, how = count_tokens(build_negative(m, which, slot))
            print(f"  {'neg:' + which:<10} {slot:<7} {n:>6} {chunks_needed(n):>6}"
                  + ("" if slot_negative_groups(m, slot) else "  (no slot groups)"))
            if n > worst_neg:
                worst_neg, worst_neg_key = n, (which, slot)
    print(f"  counter: {how}")
    print(f"  weights: {weights_table(m)}")
    if "--assert" in argv:
        variant, slot = worst_key
        nwhich, nslot = worst_neg_key
        assert_embeddable(build_prompt(m, slot, 3, "grey", variant), build_negative(m, nwhich, nslot),
                          label=f"the longest production prompt ({variant}, {slot}) with the longest "
                                f"negative ({nwhich}, {nslot})")
        print("PROMPT ASSERT PASS: every production prompt and every slot's negative can be "
              "embedded whole on this machine")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
