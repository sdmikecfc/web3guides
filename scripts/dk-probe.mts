/**
 * Read-only Doma mainnet probe for the Domain Kitchen LP reader (M5).
 * Confirms the addresses and call shapes before any UI code is written.
 * Run: npx tsx scripts/dk-probe.mts
 */

const RPC = "https://rpc.doma.xyz";
const NPM = "0xce126ca6aceBBDCe95D7b8A3Ce637951640811E0";
const FACTORY = "0x2e50b586d5bcD04cb6125E028A6a669f7f3cF1C2";
const USDC_E = "0x31EEf89D5215C305304a2fA5376a1f1b6C5dc477";
const SOFTWARE_POOL = "0x956019957604e69F37a4930F8AC400Be5fD6FDB2";

let id = 1;
async function call(to: string, data: string): Promise<string | null> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: id++, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const j = (await res.json()) as { result?: string; error?: { message: string } };
  if (j.error) return null;
  return j.result ?? null;
}

const sel = {
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  fee: "0xddca3f43",
  slot0: "0x3850c7bd",
  liquidity: "0x1a686502",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  name: "0x06fdde03",
};

const addrOf = (hex: string | null) => (hex ? "0x" + hex.slice(-40) : "(null)");
const numOf = (hex: string | null) => (hex ? BigInt(hex.slice(0, 66)) : -1n);

function decodeString(hex: string | null): string {
  if (!hex || hex.length < 130) return "(none)";
  const len = Number(BigInt("0x" + hex.slice(66, 130)));
  const bytes = hex.slice(130, 130 + len * 2);
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) out += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
  return out;
}

(async () => {
  console.log("── the SOFTWARE.ai pool ─────────────────────────────────────");
  const t0 = addrOf(await call(SOFTWARE_POOL, sel.token0));
  const t1 = addrOf(await call(SOFTWARE_POOL, sel.token1));
  const fee = Number(numOf(await call(SOFTWARE_POOL, sel.fee)));
  const liq = numOf(await call(SOFTWARE_POOL, sel.liquidity));
  const slot0 = await call(SOFTWARE_POOL, sel.slot0);
  console.log(`token0=${t0}`);
  console.log(`token1=${t1}`);
  console.log(`fee=${fee}  liquidity=${liq}`);
  if (slot0) {
    const sqrtPriceX96 = BigInt("0x" + slot0.slice(2, 66));
    const tickRaw = BigInt("0x" + slot0.slice(66, 130));
    const tick = tickRaw > 2n ** 23n ? Number(tickRaw - 2n ** 24n) : Number(tickRaw);
    console.log(`sqrtPriceX96=${sqrtPriceX96}  tick=${tick}`);
  }
  const other = t0.toLowerCase() === USDC_E.toLowerCase() ? t1 : t0;
  console.log(`the domain token here = ${other}`);
  console.log(`  symbol=${decodeString(await call(other, sel.symbol))}`);
  console.log(`  name=${decodeString(await call(other, sel.name))}`);
  console.log(`  decimals=${numOf(await call(other, sel.decimals))}`);

  console.log("\n── factory.getPool round-trip ───────────────────────────────");
  const pad = (a: string) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const feeHex = fee.toString(16).padStart(64, "0");
  const got = addrOf(await call(FACTORY, "0x1698ee82" + pad(other) + pad(USDC_E) + feeHex));
  console.log(`getPool(token, USDC.e, ${fee}) = ${got}`);
  console.log(`matches the known pool: ${got.toLowerCase() === SOFTWARE_POOL.toLowerCase()}`);

  console.log("\n── NPM sanity (ERC721Enumerable) ────────────────────────────");
  const bal = numOf(await call(NPM, "0x70a08231" + pad(SOFTWARE_POOL)));
  console.log(`NPM.balanceOf(some address) responded: ${bal >= 0n} (value ${bal})`);
  const sym = decodeString(await call(NPM, sel.symbol));
  console.log(`NPM symbol=${sym}`);

  console.log("\n── other fee tiers for this token ───────────────────────────");
  for (const f of [100, 500, 3000, 10000]) {
    const p = addrOf(await call(FACTORY, "0x1698ee82" + pad(other) + pad(USDC_E) + f.toString(16).padStart(64, "0")));
    if (p !== "0x0000000000000000000000000000000000000000" && p !== "(null)") {
      console.log(`  fee ${f} -> ${p}`);
    }
  }
})();
