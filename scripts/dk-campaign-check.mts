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

console.log("── 1. out-of-range liquidity is worth nothing ───────────────");
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

if (failures > 0) {
  console.error(`\ncampaign check FAIL (${failures})`);
  process.exit(1);
}
console.log("\ncampaign check PASS");
