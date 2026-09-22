#!/usr/bin/env python
"""
S7 WEB SURFACE GENERATOR (ADR-0134's method applied to the web) - generates
src/app/s7, src/lib/s7 and src/app/api/s7 from their s6 counterparts with a
mechanical token rewrite plus the REALMFALL vocabulary map. The engine pieces
already carved by hand (src/season/*, lib/s7/games.ts, lib/s7/classes.ts,
app/s7/games/**) are NEVER touched: the generator skips any destination that
exists and fails loudly if a copy would collide unexpectedly.

  python scripts/gen_s7_web.py            # generate
  python scripts/gen_s7_web.py --report   # counts only, write nothing

PATH LAW: quoted absolute paths are protected from the VOCAB maps (a path is
plumbing, not fiction - renaming "/pilot/anim" would orphan art), but they DO
receive the season-prefix map with three standing exceptions:
  /s6-art/front  stays (the battlefield set until the map re-skin ships)
  /s5-art        stays (the world plate has lived there since S5, declared
                 in season.config worldArtRoot)
  /s4-art        stays (legacy shared assets)

VOCAB (en, word-boundary where ambiguity exists; 'column' is deliberately NOT
mapped - it collides with layout vocabulary - and is listed as a manual sweep
item). ko/zh get best-effort core-noun maps with hit counts reported; the
Friday locale polish pass remains scheduled either way.

GATES: zero s5/s6 residue outside protections; the S7 bannedVocab list
(season.config) must not match the generated tree; repo-wide tsc must exit 0.
"""
import io
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPORT_ONLY = "--report" in sys.argv
REGEN = "--regen" in sys.argv

PAIRS = [
    (ROOT / "src" / "lib" / "s6", ROOT / "src" / "lib" / "s7"),
    (ROOT / "src" / "app" / "s6", ROOT / "src" / "app" / "s7"),
    (ROOT / "src" / "app" / "api" / "s6", ROOT / "src" / "app" / "api" / "s7"),
]

# Hand-built files/dirs the generator must never write into.
SKIP_DEST = {
    ROOT / "src" / "lib" / "s7" / "games.ts",
    ROOT / "src" / "lib" / "s7" / "classes.ts",
}
SKIP_DEST_DIRS = {ROOT / "src" / "app" / "s7" / "games"}

# case-sensitive plain replacements (checked longest-first)
VOCAB_PLAIN = [
    ("MAINFRAMES", "KEEPS"), ("MAINFRAME", "KEEP"),
    ("Mainframes", "Keeps"), ("Mainframe", "Keep"),
    ("mainframes", "keeps"), ("mainframe", "keep"),
    ("PILOTS", "ADVENTURERS"), ("PILOT", "ADVENTURER"),
    ("Pilots", "Adventurers"), ("Pilot", "Adventurer"),
    ("pilots", "adventurers"), ("pilot", "adventurer"),
    ("UPRISING", "REALMFALL"), ("Uprising", "Realmfall"),
    ("The Resistance", "The Guild"), ("the Resistance", "the Guild"),
    ("Iron Column", "Guild"),
    ("UNDER ASSAULT", "UNDER SIEGE"),
    ("MACHINE-HELD", "CURSED"),
    ("DETECTED", "SIGHTED"),
    ("LIBERATED", "RECLAIMED"), ("Liberated", "Reclaimed"), ("liberated", "reclaimed"),
    ("The Warden", "The Lich"), ("the Warden", "the Lich"), ("Warden", "Lich"),
    # ko/zh best-effort core nouns (hit counts reported; polish pass Friday)
    ("메인프레임", "요새"), ("파일럿", "모험가"), ("시그널", "무훈"), ("스크랩", "골드"),
    ("主机", "城堡"), ("机甲", "英雄"), ("驾驶员", "冒险者"), ("信号", "战功"), ("废料", "金币"),
]
# word-boundary regex replacements (substring danger: mechanic, Scrapped...)
VOCAB_WORD = [
    (r"\bSignal\b", "Valor"),
    (r"\bScrap\b", "Gold"),
    (r"\bmechs\b", "heroes"), (r"\bmech\b", "hero"),
    (r"\bMechs\b", "Heroes"), (r"\bMech\b", "Hero"),
]

PATH_RE = re.compile(r"([\"'`])(/[^\"'`\n]*)\1")


def map_path(p: str) -> str:
    if p.startswith("/s6-art/front") or p.startswith("/s5-art") or p.startswith("/s4-art"):
        return p
    p = p.replace("/s6-art", "/s7-art").replace("/s6/", "/s7/").replace("/api/s6/", "/api/s7/")
    # bare route forms: "/s6", "/s6?x", "/s6#y" (the dead-link drift class the
    # first run caught: eight un-suffixed hrefs pointing back at the old season)
    if p == "/s6" or p.startswith("/s6?") or p.startswith("/s6#"):
        p = "/s7" + p[3:]
    return p


def transform(text: str, counts: dict) -> str:
    # 1. lift quoted absolute paths out, season-prefix-mapped, vocab-protected
    saved: list[str] = []

    def stash(m: re.Match) -> str:
        q, path = m.group(1), m.group(2)
        p = map_path(path)
        # interpolation holes inside a template-literal path are CODE, not
        # path: their identifiers must follow the vocab map or they orphan
        # from their (mapped) definitions (garage.tsx pilotKey, caught by tsc)
        p = p.replace("${pilot", "${adventurer").replace("${mech", "${hero")
        saved.append(q + p + q)
        return f"\x00P{len(saved)-1}\x00"

    text = PATH_RE.sub(stash, text)

    # 2a. PROTECT the STEP-NUMBER key families before the blankets. The
    # how-to-play strings use s1Title..s8Title and gs1..gs8 as SECTION step
    # keys - sequence numbers, not season keys (a first-run misread renamed
    # step 5 and collided step 6 into step 7; the copy-audit note "s5Title
    # deliberately kept" always meant SECTION five). Protected verbatim.
    step_saved: list[str] = []

    def stash_step(m: re.Match) -> str:
        step_saved.append(m.group(0))
        # marker alphabet must be MAP-IMMUNE: an "S" marker containing S5/S6
        # gets rewritten by the blankets and restores into the wrong slot
        # (gs2Body became gs3Title on the second run). "K" is untouched.
        return f"\x00K{len(step_saved)-1}\x00"

    text = re.sub(r"\bg?s\d(?:Title|Body\d?|Cta)\b", stash_step, text)

    # 2. token blankets (identifiers, keys, routes-in-code, comments)
    text = text.replace("Season 6", "Season 7").replace("season 6", "season 7")
    text = text.replace("s6", "s7").replace("S6", "S7")
    text = text.replace("s5", "s7").replace("S5", "S7")

    # 3. vocabulary
    for a, b in VOCAB_PLAIN:
        n = text.count(a)
        if n:
            counts[a] = counts.get(a, 0) + n
            text = text.replace(a, b)
    for pat, b in VOCAB_WORD:
        text, n = re.subn(pat, b, text)
        if n:
            counts[pat] = counts.get(pat, 0) + n

    # 4. restore paths, then the step keys
    for i, s in enumerate(saved):
        text = text.replace(f"\x00P{i}\x00", s)
    for i, s in enumerate(step_saved):
        text = text.replace(f"\x00K{i}\x00", s)
    return text


def main() -> None:
    counts: dict = {}
    written = 0
    skipped = 0
    for src_dir, dst_dir in PAIRS:
        for src in sorted(src_dir.rglob("*")):
            if not src.is_file():
                continue
            rel = src.relative_to(src_dir)
            # FILENAMES carry the token map too (S6TopNav.tsx must become
            # S7TopNav.tsx or its mapped imports dangle - first-run lesson)
            rel = pathlib.Path(*[part.replace("s6", "s7").replace("S6", "S7").replace("s5", "s7").replace("S5", "S7") for part in rel.parts])
            dst = dst_dir / rel
            if dst in SKIP_DEST or any(d in dst.parents or d == dst for d in SKIP_DEST_DIRS):
                skipped += 1
                continue
            if dst.exists() and not REGEN:
                raise SystemExit(f"COLLISION: {dst} exists and is not in the skip set - refusing (use --regen to overwrite generated trees)")
            if src.suffix in (".ts", ".tsx", ".mts", ".txt", ".md"):
                out = transform(io.open(src, encoding="utf-8").read(), counts)
                if not REPORT_ONLY:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    io.open(dst, "w", encoding="utf-8", newline="\n").write(out)
            else:
                if not REPORT_ONLY:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    dst.write_bytes(src.read_bytes())
            written += 1

    print(f"{'would write' if REPORT_ONLY else 'wrote'} {written} files, skipped {skipped} hand-built")
    print("vocab hits:", {k: v for k, v in sorted(counts.items(), key=lambda kv: -kv[1])})

    if REPORT_ONLY:
        return

    # ---- residue gate on the generated trees ----
    bad = []
    for _, dst_dir in PAIRS:
        for f in dst_dir.rglob("*.ts*"):
            if any(d in f.parents for d in SKIP_DEST_DIRS) or f in SKIP_DEST:
                continue
            t = io.open(f, encoding="utf-8").read()
            for i, ln in enumerate(t.splitlines()):
                clean = ln
                # standing path exceptions are legal residue
                for ok in ("/s6-art/front", "/s5-art", "/s4-art"):
                    clean = clean.replace(ok, "")
                if re.search(r"\bs6\b|s6_|s6-|S6\b|\bs5\b|s5_|S5[A-Z]", clean):
                    bad.append((str(f.relative_to(ROOT)), i + 1, ln.strip()[:80]))
    if bad:
        print(f"RESIDUE ({len(bad)} lines):")
        for b in bad[:12]:
            print("  ", b)
        raise SystemExit(1)

    # ---- banned-vocab gate (the S7 config list, en only) ----
    banned = ["Uprising", "mainframe", "Mainframe", "pilot", "Pilot", "Iron Column", "MACHINE-HELD"]
    hits = []
    for _, dst_dir in PAIRS:
        for f in dst_dir.rglob("*.ts*"):
            t = io.open(f, encoding="utf-8").read()
            # the path law: quoted absolute paths are plumbing, not fiction -
            # strip them before scanning, exactly like the residue gate
            t = PATH_RE.sub("", t)
            for w in banned:
                if w in t:
                    hits.append((str(f.relative_to(ROOT)), w))
    if hits:
        print(f"BANNED VOCAB ({len(hits)}):", hits[:10])
        raise SystemExit(1)

    print("residue clean, banned vocab clean; running tsc...")
    r = subprocess.run([str(ROOT / "node_modules" / ".bin" / "tsc") + (".cmd" if sys.platform == "win32" else ""), "--noEmit"], cwd=ROOT)
    raise SystemExit(r.returncode)


if __name__ == "__main__":
    main()
