"""Battle Bots factory: the gate on scripts/sd/bots-sd-install.py.

    python scripts/sd/bots-sd-install-check.py [--gate] [--keep]

What it proves, in order, by running the installer AS A SUBPROCESS (the CLI
that ships, not a copy of its logic) and by reading the files it writes:

  1. --ship is refused when the candidate carries no RANKED proof (a bare copy
     of a known head, no sidecar, not inside a judge's normalised/ folder), and
     nothing lands in the target. --ship together with --unjudged is refused.
  2. the live folder (public/bots-art/parts, and every spelling of it: the
     parent folders, a ../ detour, a different case) is refused without --ship,
     and the 80 shipped files are byte-identical before and after.
  3. a known normalised head (the judge's rank-1 RANKED head-t3-1, proof read
     from its report.json) installs into a scratch tree: both files exist on
     the contract canvas, the mask is RGBA, every pixel under the mask is
     neutral in the base (r == g, the deriver's own clay), and THE EYE BAND IS
     AT ZERO: every solid pixel the shipped classifier puts in the law's eye
     band has mask alpha 0. This is the gate's EYE PAINTED question asked of
     every eye-band pixel, not just the two blobs.
  4. (--gate) the shipped gate, run on the shadow tree with cwd set to it,
     PASSES with the installed head in it, and the NEGATIVE CONTROL proves it
     read the shadow tree and not the live one: the installed head's base is
     replaced by an empty canvas in the shadow tree only, the gate is run
     again and must FAIL with NO INK naming /bots-art/parts/head/t3-1.png,
     while the live file is untouched.
  5. everything it made is removed (unless --keep), and the live hashes are
     compared one last time.

Refuses rather than skipping when the known head or its report is missing.
Never writes under public/. Run with PYTHONIOENCODING=utf-8.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
ROOT = os.path.dirname(SCRIPTS)
INSTALL_PY = os.path.join(HERE, "bots-sd-install.py")
LIVE_PARTS = os.path.join(ROOT, "public", "bots-art", "parts")
KNOWN_DIR = os.path.join(ROOT, ".bots-preview", "sd-stage1-sample", "rank-shipped")
KNOWN_HEAD = os.path.join(KNOWN_DIR, "normalised",
                          "head-t3-1_lineart_s0.55_e0.60_cfg5.0_st30_dpmpp_2m_karras_seed1001_ip0.60_head-2.png")

FAILS: list[str] = []


def fail(msg: str):
    FAILS.append(msg)
    print("FAIL " + msg)


def ok(msg: str):
    print("ok   " + msg)


def refuse(why: str):
    raise SystemExit("bots-sd-install-check REFUSES: " + why)


def sha(path: str) -> str:
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def live_snapshot() -> dict[str, str]:
    out = {}
    for dp, _, names in os.walk(LIVE_PARTS):
        for n in names:
            p = os.path.join(dp, n)
            out[os.path.relpath(p, LIVE_PARTS)] = sha(p)
    return out


def run_install(*args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    return subprocess.run([sys.executable, INSTALL_PY, *args], capture_output=True, text=True,
                          cwd=ROOT, env=env)


def load_installer():
    spec = importlib.util.spec_from_file_location("_bb_install", INSTALL_PY)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["_bb_install"] = mod
    spec.loader.exec_module(mod)
    return mod


def known_head() -> str:
    """The judge's rank-1 RANKED head-t3-1, or the first RANKED head in that
    report if the named file has gone; refuse if there is none."""
    rep = os.path.join(KNOWN_DIR, "report.json")
    if not os.path.exists(rep):
        refuse(f"{rep} is missing; there is no judged head to install")
    if os.path.exists(KNOWN_HEAD):
        return KNOWN_HEAD
    rows = json.load(open(rep, encoding="utf-8"))["rows"]
    for r in rows:
        if r.get("verdict") == "RANKED" and r.get("slot") == "head" and r.get("normalisedFile"):
            p = os.path.join(KNOWN_DIR, "normalised", os.path.basename(r["normalisedFile"].replace("\\", "/")))
            if os.path.exists(p):
                return p
    refuse(f"no RANKED head with a normalised file in {rep}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gate", action="store_true", help="also run the shipped gate on the shadow tree, with the negative control")
    ap.add_argument("--keep", action="store_true", help="leave the scratch tree in place")
    a = ap.parse_args()

    inst = load_installer()
    tmp = os.path.join(inst.INSTALL_ROOT, f"check-tmp-{os.getpid()}")
    if os.path.exists(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp)
    target = os.path.join(tmp, "parts")
    manifest = os.path.join(tmp, "manifest")
    head = known_head()
    before = live_snapshot()
    if len(before) != 80:
        refuse(f"the live tree holds {len(before)} files, not the 80 the contract ships; not a tree this check knows")
    print(f"known head: {head}\nlive tree: {len(before)} files snapshotted\nscratch: {tmp}\n")

    def live_unchanged(when: str):
        after = live_snapshot()
        if after == before:
            ok(f"live tree unchanged {when} ({len(after)} files byte-identical)")
        else:
            changed = sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))
            fail(f"LIVE TREE CHANGED {when}: {changed}")

    # 1. --ship without a RANKED proof
    bare = os.path.join(tmp, "bare")
    os.makedirs(bare)
    unjudged = os.path.join(bare, "head.png")
    shutil.copy2(head, unjudged)
    r = run_install("--ship", "--target", target, "--manifest-dir", manifest, "--part", "head", "3", "1", unjudged)
    out = r.stdout + r.stderr
    if r.returncode != 0 and "RANKED proof" in out:
        ok("--ship without a RANKED proof is refused: " + out.strip().splitlines()[-1][:140])
    else:
        fail(f"--ship without proof was NOT refused (exit {r.returncode}): {out[-400:]}")
    if os.path.exists(target) and any(os.scandir(target)):
        fail("--ship without proof still wrote into the target")
    else:
        ok("nothing landed in the target on that refusal")
    r = run_install("--ship", "--unjudged", "--target", target, "--manifest-dir", manifest, "--part", "head", "3", "1", head)
    if r.returncode != 0 and "--unjudged" in (r.stdout + r.stderr):
        ok("--ship with --unjudged is refused")
    else:
        fail(f"--ship with --unjudged was NOT refused (exit {r.returncode})")
    live_unchanged("after the --ship refusals")

    # 2. the live folder without --ship, in every spelling
    spellings = [
        LIVE_PARTS,
        os.path.join(LIVE_PARTS, "..", "parts"),
        os.path.dirname(LIVE_PARTS),                       # public/bots-art
        os.path.join(ROOT, "public"),
        LIVE_PARTS.upper() if os.name == "nt" else LIVE_PARTS,
        os.path.relpath(LIVE_PARTS, ROOT),                 # relative, cwd is ROOT
    ]
    for sp in spellings:
        r = run_install("--target", sp, "--manifest-dir", manifest, "--part", "head", "3", "1", head)
        out = r.stdout + r.stderr
        if r.returncode != 0 and "--ship" in out and "live" in out:
            ok(f"live folder refused without --ship: {sp}")
        else:
            fail(f"live folder NOT refused without --ship: {sp} (exit {r.returncode}): {out[-300:]}")
    live_unchanged("after the live-folder refusals")

    # 3. the known head into scratch, with proof from the judge's report
    r = run_install("--target", target, "--manifest-dir", manifest, "--part", "head", "3", "1", head)
    out = r.stdout + r.stderr
    if r.returncode != 0:
        fail(f"scratch install of the known head failed (exit {r.returncode}): {out[-600:]}")
    else:
        ok("known head installed into scratch: " + out.strip().splitlines()[0][:120])
    base_p = os.path.join(target, "head", "t3-1.png")
    mask_p = os.path.join(target, "head", "t3-1.mask.png")
    man_p = os.path.join(manifest, "head-t3-1.json")
    canvas = inst.load_canvas()["head"]
    if not (os.path.exists(base_p) and os.path.exists(mask_p)):
        fail("the pair is not in the target")
    else:
        with Image.open(base_p) as b, Image.open(mask_p) as m:
            if b.size == canvas and m.size == canvas:
                ok(f"both files on the contract canvas {canvas[0]}x{canvas[1]}")
            else:
                fail(f"sizes {b.size} / {m.size}, contract {canvas}")
            if m.mode == "RGBA":
                ok("mask is RGBA (the bake format the gate needs)")
            else:
                fail(f"mask is {m.mode}, not RGBA")
            base = np.asarray(b.convert("RGBA"))
            ma = np.asarray(m.convert("RGBA"))[..., 3]
        under = ma > 0
        if under.any() and np.array_equal(base[under][:, 0], base[under][:, 1]):
            ok(f"every pixel under the mask is neutral clay in the base ({int(under.sum())} px, r == g)")
        else:
            fail("the base carries colour under the mask")
        # THE EYE BAND: the shipped classifier, table cut to the one band
        dv = inst.load_deriver()
        full = dv.ACC
        if "eye" not in full:
            refuse("the law has no eye band; this check has nothing to protect")
        try:
            dv.ACC = {"eye": full["eye"]}
            eye = dv.accent_mask(base) & (base[..., 3] >= dv.OPAQUE)
        finally:
            dv.ACC = full
        n_eye = int(eye.sum())
        n_painted = int((eye & under).sum())
        if n_eye == 0:
            fail("no solid eye-band pixels on the installed head: the test would be vacuous")
        elif n_painted == 0:
            ok(f"eye band at zero: {n_eye} solid eye-band pixels, 0 under the mask")
        else:
            fail(f"EYE PAINTED: {n_painted} of {n_eye} eye-band pixels are under the mask")
    if os.path.exists(man_p):
        j = json.load(open(man_p, encoding="utf-8"))
        if (j.get("proof") or {}).get("source") == "report" and j["proof"].get("verdict") == "RANKED":
            ok(f"manifest records the proof: report row rank {j['proof'].get('rankInPool')}, "
               f"composite {j['proof'].get('composite')}")
        else:
            fail(f"manifest proof is {j.get('proof')}")
        if j.get("candidateSha256") != sha(head):
            fail("manifest candidate sha256 does not match the file")
    else:
        fail("no manifest written")
    live_unchanged("after the scratch install")

    # 4. the shipped gate on the shadow tree, then the negative control
    if a.gate and os.path.exists(base_p):
        sandbox = os.path.join(tmp, "gate-sandbox")
        rec = {"slot": "head", "base": base_p, "mask": mask_p, "part": "head-t3-1"}
        st = inst.stage_sandbox(target, sandbox, [rec])
        if st["differFromLive"] == 2:
            ok("shadow tree: exactly the two installed files differ from live")
        else:
            fail(f"shadow tree: {st['differFromLive']} files differ from live, expected 2")
        g = inst.run_gate(sandbox)
        print("   gate output:\n      " + "\n      ".join(g["output"].strip().splitlines()[-4:]))
        if g["pass"]:
            ok(f"shipped gate PASS on the shadow tree in {g['seconds']}s")
        else:
            fail(f"shipped gate FAIL on the shadow tree: {g['fails']}")
        # negative control: blank the installed head IN THE SHADOW TREE ONLY
        shadow_base = os.path.join(sandbox, "public", "bots-art", "parts", "head", "t3-1.png")
        Image.new("RGBA", canvas, (0, 0, 0, 0)).save(shadow_base)
        g2 = inst.run_gate(sandbox)
        hit = [l for l in g2["fails"] if "NO INK" in l and "/bots-art/parts/head/t3-1.png" in l]
        if not g2["pass"] and hit:
            ok("negative control: blanking the shadow head makes the gate FAIL NO INK on that file, "
               "so the gate reads the shadow tree, not the live one")
        else:
            fail(f"negative control did not fire: pass={g2['pass']} fails={g2['fails'][:3]}")
        if sha(os.path.join(LIVE_PARTS, "head", "t3-1.png")) == before[os.path.join("head", "t3-1.png")]:
            ok("live head t3-1 untouched by the negative control")
        else:
            fail("LIVE head t3-1 changed")
        live_unchanged("after the gate runs")

    # 5. clean up
    if not a.keep:
        shutil.rmtree(tmp, ignore_errors=True)
        if os.path.exists(tmp):
            fail(f"could not remove {tmp}")
        else:
            ok(f"scratch removed: {tmp}")
    live_unchanged("at the end")
    if FAILS:
        print(f"bots-sd-install-check FAIL ({len(FAILS)})")
        return 1
    print("bots-sd-install-check PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
