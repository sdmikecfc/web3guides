/**
 * DEV-ONLY BUY BENCH: /s5/buy-demo
 *
 * Our own strongholds have no token address in the DB yet (they list Jul 27 -
 * Aug 7), so the real buy panel on the map correctly shows nothing to buy.
 * This page points that SAME component at Doma walls that are live on their
 * bonding curve right now, so the whole flow can be driven before our season
 * opens.
 *
 * TWO MODES, and the default is the safe one:
 *   /s5/buy-demo          SIMULATE. Every read is real (fees, tokens sold, the
 *                         curve quote, your balances) and the buy is validated
 *                         against the chain with eth_call via simulateContract.
 *                         NOTHING IS SENT. NOTHING IS SPENT.
 *   /s5/buy-demo?live=1   REAL MONEY. The buy actually executes. Opt-in only,
 *                         never linked to, and loudly marked.
 *
 * Blocked in production: 404 unless NODE_ENV is development.
 */
import { notFound } from "next/navigation";
import { dict, getLocale } from "@/lib/s5/i18n";
import { BuyPanel } from "../_components/BuyPanel";

/** Doma walls that were FRACTIONALIZED (on-curve) when this page was written.
 * The first three are OURS, so a test buy there is not wasted money: it moves
 * a real stronghold toward breaching. */
const DEMO_WALLS = [
  { domain: "supplemintz.com", name: "SUPPLEMINTZ", launchpad: "0xEcA07592666D2F51bE7e19BA8bc9560542195cDf", note: "ours · was ~42% filled", ours: true },
  { domain: "brunchcasual.com", name: "BRUNCHCASUAL", launchpad: "0x82B4f906aC7b7Fb7ec28551919b6157849991b6b", note: "ours · fresh wall", ours: true },
  { domain: "openmkts.com", name: "OPENMKTS", launchpad: "0x8BECF30005841481F28BF063d547B6a72E8F3511", note: "ours · fresh wall", ours: true },
  { domain: "divorceattorneys.xyz", name: "DIVORCEATTORNEYS", launchpad: "0xBFC224e33f14273F764Be63c660f0E76166B1Bbe", note: "NOT ours · a bigger raise", ours: false },
];

export default function BuyDemoPage({ searchParams }: { searchParams?: { live?: string } }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const d = dict(getLocale());
  const live = searchParams?.live === "1";

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "28px 18px 80px", color: "#e9edf1" }}>
      <p style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, letterSpacing: "0.14em", color: live ? "#f87171" : "#e0662e", textTransform: "uppercase", margin: "0 0 6px" }}>
        Dev only · {live ? "live money" : "simulation"}
      </p>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 10px" }}>Buy bench</h1>
      <p style={{ fontSize: 13.5, color: "#9aa7b4", lineHeight: 1.65, margin: "0 0 14px" }}>
        The real buy panel from the map, pointed at Doma walls that are live on their bonding curve right now.
        Prices, fees, supply and your own balances are read live from the chain.
      </p>

      {live ? (
        <div style={{ border: "1px solid #f8717166", borderLeft: "3px solid #f87171", borderRadius: 10, padding: "14px 16px", background: "rgba(248,113,113,0.07)", margin: "0 0 26px" }}>
          <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 800, color: "#f87171" }}>
            Live mode. Pressing Buy spends real USDC.e.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#cdd4dc", lineHeight: 1.6 }}>
            Start with $1 on one of the first three, which are our own strongholds, so the money moves a real wall toward
            breaching instead of going nowhere. You need a little ETH on the Doma chain for gas, which is about
            0.0000003 ETH per buy. Drop the <code>?live=1</code> to go back to simulation.
          </p>
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: "#34d399", lineHeight: 1.65, margin: "0 0 26px", fontWeight: 700 }}>
          Simulation: the buy is validated against the chain but never sent. Nothing is spent.
          Add <code>?live=1</code> to the URL to do a real one.
        </p>
      )}

      <div style={{ display: "grid", gap: 18 }}>
        {DEMO_WALLS.map((w) => (
          <section
            key={w.domain}
            style={{
              background: "rgba(18,22,27,0.72)",
              border: `1px solid ${live && w.ours ? "rgba(52,211,153,0.35)" : "rgba(154,167,180,0.22)"}`,
              borderRadius: 14,
              padding: "16px 18px",
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 2px" }}>{w.name}</h2>
            <p style={{ fontSize: 11.5, color: w.ours ? "#87919b" : "#f0b340", margin: "0 0 14px", fontFamily: "ui-monospace, Menlo, monospace" }}>
              {w.domain} · {w.note}
            </p>
            <BuyPanel
              domain={w.domain}
              name={w.name}
              strings={d.map.buy}
              demoLaunchpad={w.launchpad}
              simulate={!live}
            />
          </section>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#87919b", lineHeight: 1.6, marginTop: 26 }}>
        Once a stronghold is listed and the bot has ingested its token address, this same panel appears on
        <code> /s5/map</code> for every player, with no demo wiring at all.
      </p>
    </main>
  );
}
