/**
 * Domain Kitchen chain-layer check (M5): exercises the SAME math the game
 * uses against LIVE Doma state, plus a synthetic case with a known answer.
 * No wallet needed — it reads a real pool and prices a made-up position.
 *
 * Run: npx tsx scripts/dk-chain-check.mts
 */

import {
  FEE_TIERS,
  isInRange,
  positionAmounts,
  priceToken1InToken0,
  rangeLabel,
  rangeWidthPct,
  tickToSqrtPrice,
  USDC_E,
  USDC_E_DECIMALS,
  V3_FACTORY,
} from "../src/app/chef/game/_chain/v3";

const RPC = "https://rpc.doma.xyz";
const TOKEN = "0xa100000000000d6e18bc155f425685e4badfe11c"; // software.ai

let failures = 0;
function fail(m: string) {
  failures++;
  console.error("FAIL: " + m);
}
function ok(label: string, cond: boolean, detail = "") {
  if (!cond) fail(`${label} ${detail}`);
  else console.log(`  ok  ${label}${detail ? " · " + detail : ""}`);
}

let id = 1;
async function call(to: string, data: string): Promise<string | null> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const j = (await res.json()) as { result?: string; error?: unknown };
  return j.result ?? null;
}
const pad = (a: string) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0");

(async () => {
  console.log("── pure math, against hand-checkable cases ──────────────────");

  // A position entirely below its range holds only token0; entirely above,
  // only token1. Those two are the easiest correctness anchors there are.
  const L = BigInt(1_000_000);
  const below = positionAmounts(L, 1000, 2000, BigInt(Math.floor(tickToSqrtPrice(500))));
  ok("below range is all token0", below.amount0 > 0 && below.amount1 === 0);
  const above = positionAmounts(L, 1000, 2000, BigInt(Math.floor(tickToSqrtPrice(2500))));
  ok("above range is all token1", above.amount1 > 0 && above.amount0 === 0);
  const inside = positionAmounts(L, 1000, 2000, BigInt(Math.floor(tickToSqrtPrice(1500))));
  ok("inside range holds both", inside.amount0 > 0 && inside.amount1 > 0);

  ok("in-range test is half-open", isInRange(1000, 1000, 2000) && !isInRange(2000, 1000, 2000));
  ok("a wide range reads Wide", rangeLabel(-60000, 60000) === "Wide", rangeLabel(-60000, 60000));
  ok("a narrow range reads Tight", rangeLabel(1000, 1100) === "Tight", `${rangeWidthPct(1000, 1100).toFixed(1)}%`);

  // price at tick 0 is 1:1 when decimals match
  const p0 = priceToken1InToken0(BigInt(Math.floor(tickToSqrtPrice(0))), 6, 6);
  ok("price at tick 0 is ~1", Math.abs(p0 - 1) < 0.01, p0.toFixed(6));

  console.log("\n── live Doma state ──────────────────────────────────────────");
  let poolsFound = 0;
  for (const fee of FEE_TIERS) {
    const feeHex = fee.toString(16).padStart(64, "0");
    const raw = await call(V3_FACTORY, "0x1698ee82" + pad(TOKEN) + pad(USDC_E) + feeHex);
    const pool = raw ? "0x" + raw.slice(-40) : "";
    if (!pool || /^0x0+$/.test(pool)) continue;
    poolsFound++;
    const slot0 = await call(pool, "0x3850c7bd");
    if (!slot0) {
      fail(`pool ${pool} (fee ${fee}) has no slot0`);
      continue;
    }
    const sqrtPriceX96 = BigInt("0x" + slot0.slice(2, 66));
    const tickRaw = BigInt("0x" + slot0.slice(66, 130));
    const tick = tickRaw > BigInt(2) ** BigInt(23) ? Number(tickRaw - BigInt(2) ** BigInt(24)) : Number(tickRaw);
    const price = priceToken1InToken0(sqrtPriceX96, USDC_E_DECIMALS, 6);
    // token0 is USDC.e here, so price1in0 IS the token's dollar price
    console.log(`  fee ${String(fee).padStart(5)} · pool ${pool} · tick ${tick} · $${price.toFixed(6)}`);
    if (!(price > 0) || !Number.isFinite(price)) fail(`fee ${fee} priced at ${price}`);

    // value a synthetic in-range position and sanity-check the dollars
    const lo = tick - 500;
    const hi = tick + 500;
    const amts = positionAmounts(BigInt(10_000_000_000), lo, hi, sqrtPriceX96);
    const usd = amts.amount0 / 1e6 + (amts.amount1 / 1e6) * price;
    if (!Number.isFinite(usd) || usd <= 0) fail(`fee ${fee} synthetic position priced at ${usd}`);
    else console.log(`        a ±500-tick position of L=1e10 would be worth $${usd.toFixed(2)}`);
  }
  ok("every fee tier resolved a pool", poolsFound === FEE_TIERS.length, `${poolsFound}/${FEE_TIERS.length}`);

  if (failures > 0) {
    console.error(`\nchain check FAIL (${failures})`);
    process.exit(1);
  }
  console.log("\nchain check PASS");
})();
