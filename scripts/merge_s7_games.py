#!/usr/bin/env python
"""
Compose src/lib/s7/games.ts: the FULL economy/session module (generated from
s6 by gen_s7_web's transform - constants, clampStats, session tokens, pool
math consumers) with the hand-written S7 GAME REGISTRY (gauntlet/horde/crypt,
Loadout-era rate mirrors) swapped in for the S6 game list.

Run AFTER gen_s7_web.py. Idempotent: always rebuilds from the s6 source +
the registry block kept in THIS file, so regeneration never loses the merge.
The registry literal lives here (not read from the previous games.ts) so the
compose is deterministic.
"""
import importlib.util
import io
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location("gen_s7_web", ROOT / "scripts" / "gen_s7_web.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

src = io.open(ROOT / "src" / "lib" / "s6" / "games.ts", encoding="utf-8").read()
counts: dict = {}
full = gen.transform(src, counts)

START = "export const GAMES: GameSlot[] = ["
i = full.index(START)
depth = 0
j = i + len(START) - 1  # position of the opening [
k = j
while True:
    ch = full[k]
    if ch == "[":
        depth += 1
    elif ch == "]":
        depth -= 1
        if depth == 0:
            break
    k += 1
end = full.index(";", k) + 1

REGISTRY = """export const GAMES: GameSlot[] = [
  // ── THE S7 SLATE (hand-written; merge_s7_games.py preserves this block) ──
  // maxScore = the ADR-0120 sanity clamp (>= 5x measured oracle, never a
  // reachable bound); rate mirrors each sim's rate() exactly (harness gate e).
  {
    key: "gauntlet",
    name: "The Gauntlet",
    comingSoon: true, // sim + client built 2026-08-24; flips at season wiring
    maxScore: 2_000_000,
    ratePerSec: 1600,
    burst: 3300,
    floorMs: 30_000,
    fastWinScore: 0,
    attempts: 3,
  },
  {
    key: "horde",
    name: "Hordebreaker",
    comingSoon: true,
    maxScore: 4_000_000,
    ratePerSec: 2200,
    burst: 3500,
    floorMs: 30_000,
    fastWinScore: 0,
    attempts: 3,
  },
  {
    key: "crypt",
    name: "The Crypt",
    comingSoon: true,
    maxScore: 2_500_000,
    ratePerSec: 1800,
    burst: 3200,
    floorMs: 30_000,
    fastWinScore: 0,
    attempts: 3,
  },
];"""

merged = full[:i] + REGISTRY + full[end:]
out = ROOT / "src" / "lib" / "s7" / "games.ts"
io.open(out, "w", encoding="utf-8", newline="\n").write(merged)
print(f"wrote {out.relative_to(ROOT)}: {len(merged.splitlines())} lines (full module + 3-game registry)")
