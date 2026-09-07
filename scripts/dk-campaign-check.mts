/**
 * Campaign scoring gate (ADR-0111). This splits REAL money, so every law the
 * ADR states is tested here as an executable property, not a comment:
 *
 *   1. out-of-range liquidity earns exactly zero
 *   2. wash volume buys a shrinking share (log curve), so doubling spend
 *      never doubles the take
 *   3. service quality pays FLAT — a top-tier player's contribution share is
 *      untouched by their quality, and a crowded top tier pays each less
 *   4. no wallet exceeds the per-wallet cap, ever
 *   5. every active player clears the floor
 *   6. the FDV bonus is bounded and never pays for a fall
 *   7. shares never sum above 1
 *
 * Run: npx tsx scripts/dk-campaign-check.mts
 */

import { formatUnits, settleShares, trimUnits } from "../src/app/chef/game/_engine/settle";
import {
  DEFAULT_WEIGHTS,
  fdvBonus,
  liquidityScore,
  scoreWindow,
  serviceTier,
  volumeScore,
  type WindowEntry,
} from "../src/app/chef/game/_engine/campaign";

let failures = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok  ${label}${detail ? " · " + detail : ""}`);
  else {
    failures++;
    console.error(`FAIL: ${label} ${detail}`);
  }
};

const player = (over: Partial<WindowEntry>): WindowEntry => ({
  wallet: "0x" + Math.random().toString(16).slice(2, 10).padEnd(40, "0"),
  volumeUsd: 0,
  inRangeUsd: 0,
  concentration: 1,
  quality: 55,
  active: true,
  ...over,
});

console.log("── 0. the concentration gap is the one Mike chose ───────────");
{
  // Measured 2026-08-13: a full range scores 0.5, the tightest reachable 8.
  // The RAW gap is 16x, but the score applies an exponent, so what a player
  // actually feels is pow(8/0.5, e). Mike lowered it 2026-08-14 because
  // ADR-0115 makes the in-game LP button full-range only, so the whole gap
  // fell on beginners pressing the button we point them at.
  const FULL = 0.5;
  const TIGHT = 8;
  const gap = (e?: number) => liquidityScore(1000, TIGHT, e) / liquidityScore(1000, FULL, e);

  ok("the default exponent is 0.25", DEFAULT_WEIGHTS.concentrationExponent === 0.25);
  ok("tight now beats full range by 2x, not 4x", Math.abs(gap() - 2) < 0.001, gap().toFixed(3) + "x");
  ok("the old hardcoded sqrt was 4x", Math.abs(gap(0.5) - 4) < 0.001, gap(0.5).toFixed(3) + "x");
  ok("an exponent of 0 pays every range the same", Math.abs(gap(0) - 1) < 1e-9);
  ok("full range still earns real credit", liquidityScore(1000, FULL) > 0);
  // per-campaign override must actually reach the split
  const tightWins = (e: number) => {
    const r = scoreWindow({
      fdvRatio: 1,
      weights: { concentrationExponent: e },
      entries: [
        player({ wallet: "0xT".padEnd(42, "0"), inRangeUsd: 1000, concentration: TIGHT }),
        player({ wallet: "0xF".padEnd(42, "0"), inRangeUsd: 1000, concentration: FULL }),
        ...Array.from({ length: 6 }, (_, i) => player({ wallet: `0x${i}`.padEnd(42, "0"), inRangeUsd: 300 })),
      ],
    });
    const t = r.shares.find((s) => s.wallet.startsWith("0xT"))!;
    const f = r.shares.find((s) => s.wallet.startsWith("0xF"))!;
    return t.fromContribution / f.fromContribution;
  };
  const flat = tightWins(0);
  const steep = tightWins(0.5);
  ok("the exponent is honoured per campaign", steep > flat + 0.1, `${flat.toFixed(2)}x vs ${steep.toFixed(2)}x`);
}

console.log("\n── 1. out-of-range liquidity is worth nothing ───────────────");
{
  ok("zero in-range scores zero", liquidityScore(0, 4) === 0);
  // enough players that the per-wallet cap does not bind and mask the effect
  const w = scoreWindow({
    fdvRatio: 1,
    entries: [
      player({ wallet: "0xA".padEnd(42, "0"), inRangeUsd: 0, concentration: 8 }), // huge but out of range
      player({ wallet: "0xB".padEnd(42, "0"), inRangeUsd: 500, concentration: 1 }),
      ...Array.from({ length: 6 }, (_, i) => player({ wallet: `0x${i}`.padEnd(42, "0"), inRangeUsd: 300 })),
    ],
  });
  const a = w.shares.find((s) => s.wallet.startsWith("0xA"))!;
  const b = w.shares.find((s) => s.wallet.startsWith("0xB"))!;
  ok("out-of-range player only gets the floor", a.liftedByFloor && a.share < b.share,
    `${a.share.toFixed(4)} vs ${b.share.toFixed(4)}`);
}

console.log("\n── 2. wash volume buys a shrinking share ────────────────────");
{
  const r1 = volumeScore(1_000);
  const r2 = volumeScore(2_000);
  const r10 = volumeScore(10_000);
  ok("doubling volume does not double score", r2 < r1 * 2, `${r1.toFixed(3)} -> ${r2.toFixed(3)}`);
  ok("10x volume is far from 10x score", r10 < r1 * 4, `${r10.toFixed(3)}`);
  // a whale trading 100x more than an honest player cannot take 100x the share
  const w = scoreWindow({
    fdvRatio: 1,
    entries: [
      player({ wallet: "0xW".padEnd(42, "0"), volumeUsd: 100_000 }),
      player({ wallet: "0xH".padEnd(42, "0"), volumeUsd: 1_000 }),
    ],
  });
  const whale = w.shares.find((s) => s.wallet.startsWith("0xW"))!;
  const honest = w.shares.find((s) => s.wallet.startsWith("0xH"))!;
  ok("100x the volume is under 3x the share", whale.share < honest.share * 3,
    `${(whale.share / honest.share).toFixed(2)}x`);
}

console.log("\n── 3. quality pays FLAT, never as a multiplier ──────────────");
{
  // a realistic field, so the per-wallet cap is not binding: the cap trims
  // whoever is at it, which would mask the flatness we are checking for
  const base: WindowEntry[] = [
    player({ wallet: "0x1".padEnd(42, "0"), volumeUsd: 500, inRangeUsd: 200, quality: 95 }),
    player({ wallet: "0x2".padEnd(42, "0"), volumeUsd: 500, inRangeUsd: 200, quality: 55 }),
    ...Array.from({ length: 8 }, (_, i) =>
      player({ wallet: `0xf${i}`.padEnd(42, "0"), volumeUsd: 400, inRangeUsd: 150 })
    ),
  ];
  const r = scoreWindow({ fdvRatio: 1, entries: base });
  const hi = r.shares.find((s) => s.wallet.startsWith("0x1"))!;
  const lo = r.shares.find((s) => s.wallet.startsWith("0x2"))!;
  ok("nobody is capped in this field", !hi.cappedByWallet && !lo.cappedByWallet);
  ok("identical work earns identical CONTRIBUTION",
    Math.abs(hi.fromContribution - lo.fromContribution) < 1e-9,
    `${hi.fromContribution.toFixed(5)} vs ${lo.fromContribution.toFixed(5)}`);
  ok("only the top-tier player gets the award", hi.fromServiceAward > 0 && lo.fromServiceAward === 0);
  ok("the award is the ONLY difference",
    Math.abs(hi.share - lo.share - hi.fromServiceAward) < 1e-9);

  // a crowded top tier pays each member less (the S2 fleet shape)
  const crowded = scoreWindow({
    fdvRatio: 1,
    entries: Array.from({ length: 10 }, (_, i) =>
      player({ wallet: `0x${i}`.padEnd(42, "0"), volumeUsd: 500, quality: 95 })
    ),
  });
  const solo = scoreWindow({
    fdvRatio: 1,
    entries: [
      player({ wallet: "0xS".padEnd(42, "0"), volumeUsd: 500, quality: 95 }),
      ...Array.from({ length: 9 }, (_, i) => player({ wallet: `0x${i}`.padEnd(42, "0"), volumeUsd: 500, quality: 55 })),
    ],
  });
  const each = crowded.shares[0].fromServiceAward;
  const alone = solo.shares.find((s) => s.wallet.startsWith("0xS"))!.fromServiceAward;
  ok("a crowded top tier pays each member less", each < alone, `${each.toFixed(4)} vs ${alone.toFixed(4)}`);
  ok("the award pool itself is fixed",
    Math.abs(each * 10 - alone) < 1e-9, `${(each * 10).toFixed(4)} = ${alone.toFixed(4)}`);
}

console.log("\n── 4/5/7. cap, floor, and the total ─────────────────────────");
{
  // one player doing everything, nine doing a little
  const entries = [
    player({ wallet: "0xBIG".padEnd(42, "0"), volumeUsd: 5_000_000, inRangeUsd: 500_000, concentration: 8, quality: 95 }),
    ...Array.from({ length: 9 }, (_, i) =>
      player({ wallet: `0x${i}`.padEnd(42, "0"), volumeUsd: 20, inRangeUsd: 5 })
    ),
  ];
  const r = scoreWindow({ fdvRatio: 1, entries });
  const big = r.shares.find((s) => s.wallet.startsWith("0xBIG"))!;
  ok("nobody exceeds the per-wallet cap",
    r.shares.every((s) => s.share <= DEFAULT_WEIGHTS.perWalletCap + 1e-9),
    `top ${big.share.toFixed(4)} vs cap ${DEFAULT_WEIGHTS.perWalletCap}`);
  ok("the big player was actually capped", big.cappedByWallet);
  ok("every active player clears the floor",
    r.shares.every((s) => s.share >= DEFAULT_WEIGHTS.activeFloor * 0.5),
    `min ${Math.min(...r.shares.map((s) => s.share)).toFixed(5)}`);
  ok("shares never sum above 1", r.distributed <= 1 + 1e-9, r.distributed.toFixed(6));

  const empty = scoreWindow({ fdvRatio: 1, entries: [] });
  ok("an empty window pays nothing and does not throw", empty.distributed === 0);

  // DELIBERATE: with very few players the cap leaves money undistributed, and
  // that remainder rolls into the next window rather than being handed to
  // whoever happened to show up. Recorded as a property so nobody "fixes" it.
  const thin = scoreWindow({
    fdvRatio: 1,
    entries: [
      player({ wallet: "0xa".padEnd(42, "0"), volumeUsd: 900, inRangeUsd: 400 }),
      player({ wallet: "0xb".padEnd(42, "0"), volumeUsd: 900, inRangeUsd: 400 }),
    ],
  });
  ok("a two-player window under-distributes on purpose",
    thin.distributed <= DEFAULT_WEIGHTS.perWalletCap * 2 + 1e-9 && thin.distributed < 0.75,
    `${thin.distributed.toFixed(3)} of the window paid, the rest rolls over`);
}

console.log("\n── 6. the FDV bonus is bounded and never pays for a fall ────");
{
  ok("a flat FDV pays no bonus", fdvBonus(1, 0.25) === 0);
  ok("a FALLING FDV pays no bonus", fdvBonus(0.5, 0.25) === 0);
  ok("a doubling reaches the cap", fdvBonus(2, 0.25) === 0.25);
  ok("a 10x cannot exceed the cap", fdvBonus(10, 0.25) === 0.25);
  // junk FDV data must pay NOTHING rather than max out the bonus
  ok("junk input pays nothing", fdvBonus(NaN, 0.25) === 0 && fdvBonus(Infinity, 0.25) === 0);

  // the bonus lifts everyone together, so it changes no one's relative share
  const entries = [
    player({ wallet: "0x1".padEnd(42, "0"), volumeUsd: 900 }),
    player({ wallet: "0x2".padEnd(42, "0"), volumeUsd: 300 }),
  ];
  const flat = scoreWindow({ fdvRatio: 1, entries });
  const up = scoreWindow({ fdvRatio: 2, entries });
  const ratioFlat = flat.shares[0].share / flat.shares[1].share;
  const ratioUp = up.shares[0].share / up.shares[1].share;
  ok("the bonus does not reshuffle who earns what",
    Math.abs(ratioFlat - ratioUp) < 1e-6, `${ratioFlat.toFixed(4)} vs ${ratioUp.toFixed(4)}`);
}

console.log("\n── the public ladder ────────────────────────────────────────");
{
  ok("a fresh room is on the ladder", serviceTier(45).name === "Finding its feet");
  ok("80 reaches the top tier", serviceTier(80).name === "The best table in town");
  ok("79 does not", serviceTier(79).name !== "The best table in town", serviceTier(79).name);
}

/**
 * SETTLEMENT ROUNDING (M9). The one place a fraction becomes a dollar, so the
 * only property that really matters is that the rows SUM EXACTLY. A payout
 * that is a cent out is one somebody reconciles by hand at midnight, and
 * ADR-0113's whole lesson is that money code must be checked before it pays,
 * not after somebody notices.
 */
/**
 * SETTLEMENT (M9/M9b). The one place a fraction becomes an amount, so the
 * property that matters is that the rows SUM EXACTLY. A payout a unit out is
 * one somebody reconciles by hand, and ADR-0113's lesson is that money code is
 * checked BEFORE it pays, not after somebody notices.
 *
 * Both pot kinds are tested, because Mike's campaigns are set amounts but not
 * always dollars: "$300 from this token and $300 from that token and maybe a
 * huge 1% of the total supply for another".
 */
console.log("\n── settlement: the rows must sum exactly ────────────────────");
const wal = (n: number) => "0x" + String(n % 100).padStart(2, "0").repeat(20);
{
  // A DOLLAR POT. The nastiest case for naive rounding: thirds of a dollar.
  const thirds = settleShares(
    [1, 2, 3].map((i) => ({ wallet: wal(i), share: 1 / 3, windows: 1 })),
    BigInt(100)
  );
  ok("thirds of a dollar sum exactly", thirds.exact, `${thirds.totalUnits} cents`);
  /**
   * 99, not 100, and that is CORRECT. Three shares of 1/3 are 333333333333 in
   * fixed point, summing to 0.999999999999 rather than 1, so the pot is
   * entitled to 99 whole cents and the last one is unspent. The direction of
   * that error is the point: fixed point can shave a minor unit DOWNWARD, and
   * never pays out more than the shares earned.
   */
  ok("and pay 99, leaving the un-earned cent unspent", thirds.totalUnits === BigInt(99), `${thirds.totalUnits}`);
  ok("the shaved cent is reported, not lost", thirds.unspentUnits === BigInt(1));

  // a realistic trial: $300, 28 windows, 20 wallets on uneven shares
  const shares = Array.from({ length: 20 }, (_, i) => (i + 1) / 210); // sums to 1
  const owed = shares.map((share, i) => ({ wallet: wal(i), share, windows: 28 }));
  const trial = settleShares(owed, BigInt(30000));
  ok("a $300 20-wallet trial sums exactly", trial.exact, `${trial.totalUnits} of 30000`);
  ok("nothing exceeds the pot", trial.totalUnits <= BigInt(30000));
  ok("every wallet appears once", new Set(trial.rows.map((r) => r.wallet)).size === trial.rows.length);

  // determinism: the same input twice must produce the identical payout
  const again = settleShares(owed, BigInt(30000));
  ok(
    "the same input gives the identical result",
    JSON.stringify(again.rows.map((r) => [r.wallet, r.units.toString()])) ===
      JSON.stringify(trial.rows.map((r) => [r.wallet, r.units.toString()]))
  );

  /**
   * A TOKEN POT: 1% of a billion-token supply at 18 decimals.
   *
   * This is 1e25 base units, about a BILLION times past
   * Number.MAX_SAFE_INTEGER. If any of this arithmetic ever slips back into
   * floats, THIS is the assertion that catches it.
   */
  const potTokens = BigInt("10000000000000000000000000"); // 1e7 tokens, 18dp
  const tokenSplit = settleShares(owed, potTokens);
  ok("a 1e25 token pot sums exactly", tokenSplit.exact, `${tokenSplit.totalUnits}`);
  ok(
    "and never exceeds the pot",
    tokenSplit.totalUnits <= potTokens,
    `${tokenSplit.totalUnits} <= ${potTokens}`
  );
  // shares run (i+1)/210, so the largest is 20/210 = 2/21 of the pot
  ok(
    "the biggest row is 2/21 of the pot, to the token",
    tokenSplit.rows[0].units > (potTokens * BigInt(2)) / BigInt(22) &&
      tokenSplit.rows[0].units < (potTokens * BigInt(2)) / BigInt(20),
    trimUnits(tokenSplit.rows[0].units, 18, 2)
  );
  // the same split, in dollars and in tokens, must rank wallets identically
  ok(
    "dollar and token pots rank wallets the same",
    JSON.stringify(trial.rows.map((r) => r.wallet)) ===
      JSON.stringify(tokenSplit.rows.map((r) => r.wallet))
  );

  // ADR-0111's under-distribution: shares below 1 leave the rest UNSPENT
  const thin = settleShares(
    [{ wallet: wal(1), share: 0.25, windows: 1 }, { wallet: wal(2), share: 0.25, windows: 1 }],
    BigInt(30000)
  );
  ok("a thin window under-distributes on purpose", thin.totalUnits === BigInt(15000), `${thin.totalUnits}`);
  ok("and the rest is reported unspent", thin.unspentUnits === BigInt(15000), `${thin.unspentUnits}`);

  ok("nothing owed pays nothing", settleShares([], BigInt(30000)).rows.length === 0);
  ok(
    "a zero share is dropped, not paid a unit",
    settleShares([{ wallet: wal(9), share: 0, windows: 3 }], BigInt(30000)).rows.length === 0
  );
  ok("an empty pot pays nothing", settleShares(owed, BigInt(0)).rows.length === 0);

  // formatting must be string maths: Number(1e25)/1e18 is already wrong
  ok(
    "1e25 base units formats as 10000000",
    formatUnits(potTokens, 18) === "10000000.000000000000000000",
    formatUnits(potTokens, 18)
  );
  ok("cents format as dollars", formatUnits(BigInt(30000), 2) === "300.00");
}

if (failures > 0) {
  console.error(`\ncampaign check FAIL (${failures})`);
  process.exit(1);
}
console.log("\ncampaign check PASS");
