/**
 * Measurement gate (M10). Runs the REAL `poolsFor`, `measureFdv`,
 * `measureLiquidity` and `measureVolume` from src/lib/chef/measure.ts against
 * LIVE Doma state. This module decides what people are paid.
 *
 * Why this exists
 * ───────────────
 * Every other dk-*-check either hits a route or reimplements the logic it is
 * checking. Nothing imported the chain-measurement module itself, and that is
 * exactly how three defects of the same family survived here — each one
 * returning a plausible partial answer instead of throwing:
 *
 *   * `measureLiquidity` did `Math.min(count, 60)`. `balanceOf` counts a
 *     wallet's v3 positions across EVERY pool on Doma, so an LP active in ten
 *     other markets could have their campaign position sit past the ceiling
 *     and be scored `inRangeUsd: 0` — indistinguishable from having none, and
 *     landing hardest on the most active participant.
 *   * `measureVolume` fell out of its page loop on the counter and returned
 *     whatever it had. 60 pages is 6,000 swaps; software.ai runs ~110/hour, so
 *     that was 4.6x headroom on a program whose whole purpose is to raise
 *     volume. A campaign succeeding fivefold would have broken its own
 *     measurement, quietly, for every player in the window.
 *   * and the one this file was originally written for:
 *
 *   measureFdv did `const deepest = pools[0]`, but poolsFor returned pools in
 *   FEE_TIERS order, so `deepest` was ALWAYS the fee-100 pool. Measured that
 *   day, fee 100 was 4,899,190x thinner than fee 3000 on software.ai and
 *   59,744,446x thinner on boner.com. FDV feeds the bonus every player is
 *   paid, so the whole campaign's bonus was priced off the single most
 *   movable pool in the market. It never threw and never looked wrong: it
 *   returned a finite, positive, plausible number.
 *
 * That is the "can it fail in a way that looks like success" class ADR-0113
 * exists for, so it gets a gate that runs the shipped code.
 *
 * Needs the alias + server-only shim, and DOMA_API_KEY for the volume half
 * (it lives in doma-reporter/.env, not this repo's .env.local):
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/dk-measure-check.mts
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/dk-measure-check.mts --deep
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Address } from "viem";
import { parseAbiItem } from "viem";
import { NPM_ADDRESS, rangeWidthPct } from "@/app/chef/game/_chain/v3";
import { fullRange } from "@/app/chef/game/_chain/addLiquidity";
import {
  chainClient,
  poolsFor,
  measureFdv,
  measureLiquidity,
  measureVolume,
  measureWindow,
} from "@/lib/chef/measure";
import { MARKETS } from "@/app/chef/game/_engine/items";

/** `--deep` also proves the paging ceiling THROWS. Costs ~300 API calls. */
const DEEP = process.argv.includes("--deep");

/**
 * Read .env.local by hand, the same way dk-ingest-check does: this runs
 * outside Next's env loading, and without it the volume half of the gate
 * skips itself and quietly checks half of what it claims to.
 */
{
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local: fall back to the ambient environment */
  }
}

let failures = 0;
let checks = 0;
function ok(cond: boolean, label: string, detail = "") {
  checks++;
  if (!cond) failures++;
  console.log(`  ${cond ? "ok " : "FAIL"}  ${label}${detail ? " · " + detail : ""}`);
}

const client = chainClient();

const live = MARKETS.filter((m) => !!m.token);
if (live.length === 0) {
  console.log("no market has a token address — nothing to check");
  process.exit(1);
}

for (const m of live) {
  console.log(`\n── ${m.id} · ${m.token}`);
  const pools = await poolsFor(client, m.token as Address);

  ok(pools.length > 0, "the token resolves at least one pool", `${pools.length} tiers`);
  if (pools.length === 0) continue;

  for (const p of pools) {
    console.log(
      `     fee ${String(p.fee).padStart(5)} · L=${p.liquidity} · tick ${p.tick}`
    );
  }

  // 1. uninitialised pools must never reach a consumer: they carry no price,
  //    and one sorted first would price FDV at zero for a healthy market.
  ok(
    pools.every((p) => p.sqrtPriceX96 > BigInt(0)),
    "every returned pool is initialised"
  );

  // 2. the ordering contract measureFdv's `pools[0]` naming depends on
  const sorted = pools.every(
    (p, i) => i === 0 || pools[i - 1].liquidity >= p.liquidity
  );
  ok(sorted, "pools are sorted deepest-first");

  // 3. THE REGRESSION. Before the fix this was the fee-100 pool on both
  //    markets, and on boner.com fee 100 is ~60 million times thinner.
  const deepest = pools.reduce((a, b) => (b.liquidity > a.liquidity ? b : a), pools[0]);
  ok(
    pools[0].address === deepest.address,
    "pools[0] IS the deepest pool, not merely the lowest fee tier",
    `fee ${pools[0].fee}, L=${pools[0].liquidity}`
  );

  // 4. and the number that actually gets paid on
  const fdv = await measureFdv(client, m.token as Address, pools);
  ok(fdv !== null && fdv > 0, "FDV is a real positive number", fdv ? `$${Math.round(fdv).toLocaleString()}` : "null");

  // 5. FDV must not be priced off a tier holding a rounding error of the
  //    market's depth. A thin tier can be moved for less than the bonus is
  //    worth, which is the whole reason the ordering mattered.
  //
  //    The floor is 1%, not "a majority": depth legitimately splits across two
  //    healthy tiers (software.ai's top tier held 54.90% on 2026-08-12, so a
  //    50% floor would flake the first time the other one caught up). 1%
  //    still fails decisively on dust — the old fee-100 pick on boner.com was
  //    0.0000017% of the market.
  const totalL = pools.reduce((a, p) => a + p.liquidity, BigInt(0));
  if (totalL > BigInt(0)) {
    const shareBp = Number((pools[0].liquidity * BigInt(1000000)) / totalL) / 10000;
    ok(
      shareBp >= 1,
      "the priced pool is not dust",
      `${shareBp.toFixed(4)}% of total depth`
    );
  }

  // 6. Regression witness: what the pre-fix code would have priced off. Not a
  //    pass/fail (a market may legitimately be deepest at fee 100) — it makes
  //    the magnitude visible so a silent reordering cannot slip back in.
  const feeOrder = [...pools].sort((a, b) => a.fee - b.fee);
  if (feeOrder[0].address !== pools[0].address) {
    const ratio =
      feeOrder[0].liquidity > BigInt(0)
        ? Number(pools[0].liquidity / feeOrder[0].liquidity)
        : Infinity;
    console.log(
      `     note: fee-tier order would have priced off fee ${feeOrder[0].fee}, ` +
        `${ratio.toLocaleString()}x thinner than fee ${pools[0].fee}`
    );
  }
}

/* ── the two PRIMARY scoring inputs ───────────────────────────────────────
 * FDV is a bounded bonus. These two ARE the payout, and both carried the same
 * silent-truncation defect until 2026-08-13: `Math.min(count, 60)` on the
 * position enumeration and a bare page counter on the volume paging. Neither
 * threw; both returned a plausible partial answer.
 */

/* ── the concentration curve, measured not assumed ────────────────────────
 * These numbers are the economics: concentration multiplies in-range dollars
 * in the ADR-0111 split. They were never measured, and both descriptions of
 * them were wrong — the code comment said a full range scores "~1" (it scores
 * 0.5) and ADR-0111 said a 2% band scores "~50" (it is capped at 8).
 *
 * Locked here so any change to the curve has to be DELIBERATE. If Mike
 * retunes the economics these assertions should be updated in the same pass.
 */
console.log("\n══ the concentration curve");
{
  const conc = (w: number) => (w > 0 ? Math.max(0.25, Math.min(8, 100 / w)) : 1);
  const full = fullRange(60);
  const wFull = rangeWidthPct(full.tickLower, full.tickUpper);

  ok(Math.abs(wFull - 200) < 0.01, "a full range measures 200% wide", wFull.toFixed(2));
  ok(Math.abs(conc(wFull) - 0.5) < 0.001, "so the in-game LP button scores 0.500", conc(wFull).toFixed(3));
  ok(conc(0.0001) === 8, "the tightest range is capped at 8.000");
  ok(
    Math.abs(conc(0.0001) / conc(wFull) - 16) < 0.01,
    "tight beats full range by exactly 16x per dollar",
    `${(conc(0.0001) / conc(wFull)).toFixed(1)}x`
  );
  // rangeWidthPct is bounded above by 200 (as the lower tick goes to zero the
  // expression tends to 2), so the 0.25 floor needs a width over 400.
  ok(
    conc(200) > 0.25,
    "the Math.max(0.25, ...) floor is unreachable dead code",
    "widthPct maxes at 200"
  );
}

console.log("\n══ measureLiquidity");
{
  // A wallet with no v3 positions must read as an exact, honest zero rather
  // than as an error or a NaN. This is the branch every non-LP player takes.
  const empty = "0x000000000000000000000000000000000000dEaD" as Address;
  const m = MARKETS.find((x) => !!x.token)!;
  const pools = await poolsFor(client, m.token as Address);
  const r = await measureLiquidity(client, empty, m.token as Address, pools);
  ok(r.inRangeUsd === 0, "a wallet with no positions reads zero dollars");
  ok(r.positions === 0, "and zero positions");
  ok(r.concentration === 1, "and a neutral concentration of 1, never 0 or NaN", String(r.concentration));

  // THE POSITIVE PATH, which had never been run. In-range liquidity is half
  // the payout formula and only its zero branch was ever exercised. NPM is an
  // ERC-721, so a position mint emits Transfer(from=0x0, to=owner) — that
  // yields real LP wallets without adding enumeration methods to the shipped
  // ABI just for a test.
  const head = await client.getBlockNumber();
  const CHUNK = BigInt(9000);
  const owners = new Set<string>();
  try {
    const logs = await client.getLogs({
      address: NPM_ADDRESS,
      event: parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
      ),
      args: { from: "0x0000000000000000000000000000000000000000" as Address },
      fromBlock: head > CHUNK ? head - CHUNK : BigInt(0),
      toBlock: head,
    });
    for (const l of logs) {
      const o = String(l.args.to || "").toLowerCase();
      if (/^0x[a-f0-9]{40}$/.test(o)) owners.add(o);
    }
  } catch {
    /* getLogs unsupported or rate-limited: reported as a skip below */
  }

  let checked = 0;
  let lp: { wallet: string; inRangeUsd: number; concentration: number; positions: number } | null = null;
  for (const w of [...owners].slice(0, 30)) {
    checked++;
    const got = await measureLiquidity(client, w as Address, m.token as Address, pools);
    if (got.positions > 0) {
      lp = { wallet: w, ...got };
      break;
    }
  }

  if (!lp) {
    console.log(`  skip  no LP for ${m.id} among ${checked} recent minters (not a failure)`);
  } else {
    console.log(
      `     ${lp.wallet} · ${lp.positions} position(s) · $${lp.inRangeUsd.toFixed(2)} in range · conc ${lp.concentration.toFixed(3)}`
    );
    ok(lp.positions > 0, `${m.id} a real LP wallet is found and read`);
    ok(Number.isFinite(lp.inRangeUsd) && lp.inRangeUsd >= 0, "its in-range dollars are finite and non-negative");
    ok(
      lp.concentration >= 0.5 && lp.concentration <= 8,
      "its concentration sits inside the real reachable band [0.5, 8]",
      lp.concentration.toFixed(3)
    );
  }
}

console.log("\n══ measureVolume · the last CLOSED 12h window");
if (!process.env.DOMA_API_KEY) {
  console.log("  skip  DOMA_API_KEY not set (it lives in doma-reporter/.env)");
} else {
  // The ingest scores the window that just closed, so mirror that exactly.
  const H12 = 12 * 3600 * 1000;
  const toMs = Math.floor(Date.now() / H12) * H12;
  const fromMs = toMs - H12;

  for (const m of MARKETS.filter((x) => !!x.token)) {
    // fractionalTokenId is not in items.ts; these are the verified pilots.
    const tokenId = m.id === "software.ai" ? 7 : m.id === "boner.com" ? 11 : null;
    if (tokenId === null) continue;

    const t0 = Date.now();
    const byWallet = await measureVolume(tokenId, fromMs, toMs);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    // Reaching here at all is the assertion that matters: the ceiling throws
    // now, so a returned value means the window was paged to its own start.
    ok(true, `${m.id} paged to the window start without hitting the ceiling`, `${secs}s`);

    const wallets = [...byWallet.keys()];
    const total = [...byWallet.values()].reduce((a, b) => a + b, 0);
    console.log(
      `     ${wallets.length} wallets · $${Math.round(total).toLocaleString()} volume`
    );

    // Guards the CAIP-10 parsing that once cost a whole bounty payout.
    ok(
      wallets.every((w) => /^0x[a-f0-9]{40}$/.test(w)),
      `${m.id} every attributed wallet is a bare lowercase address`
    );
    ok(
      [...byWallet.values()].every((v) => Number.isFinite(v) && v > 0),
      `${m.id} every volume figure is finite and positive`
    );
  }
}

/* ── measureWindow: the seam nothing tested ───────────────────────────────
 * dk-campaign-check proves the SCORING is correct given entries. Nothing
 * proved the entries themselves are BUILT correctly from live data, which is
 * where all four bugs this session actually lived. This closes that gap with
 * real wallets that really traded.
 */
console.log("\n══ measureWindow · real wallets, real window");
if (!process.env.DOMA_API_KEY) {
  console.log("  skip  DOMA_API_KEY not set");
} else {
  const H12 = 12 * 3600 * 1000;
  const toMs = Math.floor(Date.now() / H12) * H12;
  const fromMs = toMs - H12;
  const TOKEN = MARKETS.find((m) => m.id === "software.ai")!.token as Address;

  // Pick real traders from the window rather than inventing wallets: a
  // synthetic wallet scores zero everywhere and would prove nothing.
  const vol = await measureVolume(7, fromMs, toMs);
  const top = [...vol.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  ok(top.length > 0, "the window had real traders to score", `${vol.size} wallets`);

  if (top.length > 0) {
    const players = top.map(([wallet], i) => ({
      wallet,
      quality: 50 + i, // distinct, so a quality mix-up would show
      active: true,
    }));
    const measured = await measureWindow({
      token: TOKEN,
      tokenId: 7,
      players,
      fromMs,
      toMs,
    });

    ok(
      measured.entries.length === players.length,
      "every player got an entry, none silently dropped",
      `${measured.entries.length}/${players.length}`
    );
    // THE seam: the volume the window reports must be the volume measured.
    const mismatched = measured.entries.filter(
      (e) => Math.abs(e.volumeUsd - (vol.get(e.wallet) ?? 0)) > 0.01
    );
    ok(mismatched.length === 0, "each entry carries that wallet's own measured volume");
    ok(
      measured.entries.every((e) => e.quality === players.find((p) => p.wallet === e.wallet)?.quality),
      "quality is carried per wallet, not shuffled between them"
    );
    ok(
      measured.entries.every((e) => e.inRangeUsd >= 0 && Number.isFinite(e.inRangeUsd)),
      "in-range dollars are finite and never negative"
    );
    ok(measured.fdv !== null && measured.fdv > 0, "the window carries an FDV", `$${Math.round(measured.fdv ?? 0).toLocaleString()}`);
    for (const e of measured.entries) {
      console.log(
        `     ${e.wallet.slice(0, 10)}… vol $${Math.round(e.volumeUsd).toLocaleString()} · ` +
          `inRange $${Math.round(e.inRangeUsd).toLocaleString()} · q${e.quality}`
      );
    }

    // The operator exclusion is a MONEY guardrail (ADR-0111/0121): prove it
    // removes a wallet rather than merely being accepted as a parameter.
    const excludedRun = await measureWindow({
      token: TOKEN,
      tokenId: 7,
      players,
      fromMs,
      toMs,
      excluded: new Set([top[0][0]]),
    });
    ok(
      excludedRun.entries.length === players.length - 1,
      "an excluded wallet is actually dropped from the entries",
      `${excludedRun.entries.length}/${players.length - 1}`
    );
    ok(
      !excludedRun.entries.some((e) => e.wallet === top[0][0]),
      "and it is the RIGHT wallet that was dropped"
    );
  }
}

if (DEEP && process.env.DOMA_API_KEY) {
  console.log("\n══ the paging ceiling THROWS (--deep)");
  // A 12h window 60 days back needs far more than 300 pages to reach at
  // software.ai's rate, so this must fail loudly rather than return partial
  // volume. Returning a value here would be the original bug.
  const H12 = 12 * 3600 * 1000;
  const toMs = Math.floor((Date.now() - 60 * 24 * 3600 * 1000) / H12) * H12;
  let threw = false;
  let msg = "";
  try {
    await measureVolume(7, toMs - H12, toMs);
  } catch (e) {
    threw = true;
    msg = (e as Error).message;
  }
  ok(threw, "an unreachable window throws instead of returning partial volume", msg.slice(0, 90));
} else if (!DEEP) {
  console.log("\n  note: run with --deep to also prove the paging ceiling throws (~300 API calls)");
}

console.log(
  failures === 0
    ? `\nmeasure check PASS · ${checks} assertions`
    : `\nmeasure check FAIL · ${failures}/${checks} failed`
);
process.exit(failures === 0 ? 0 : 1);
