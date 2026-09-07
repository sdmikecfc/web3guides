"use client";

/**
 * PUT MONEY TO WORK — the modal (M10, ADR-0048).
 *
 * Mike's bar: "an 8 year old who has tried crypto games before should
 * understand". So the whole screen is one number and one button. No ticks, no
 * ranges, no fee tiers, no percentages, no basis points. The words "position",
 * "liquidity" and "in range" do not appear.
 *
 * The one thing it does explain is the honest catch: a full-range position
 * holds BOTH the token and dollars, so somebody holding only dollars has to
 * buy some of the token first. That is surfaced as a step, not an error.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import type { Address } from "viem";
import type { MarketDef } from "./_engine/items";
import { addLiquidity, planAddLiquidity, type MintPhase, type Plan } from "./_chain/addLiquidity";

import { FONT } from "./_ui/tokens";
const AMOUNTS = [10, 25, 50, 100];

const fmt = (raw: bigint, decimals: number, places = 2): string => {
  let base = BigInt(1);
  for (let i = 0; i < decimals; i++) base *= BigInt(10);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").slice(0, places);
  return `${whole}${places > 0 ? "." + frac : ""}`;
};

export function AddLiquidityModal({
  market,
  tradeHref,
  onClose,
  onDone,
}: {
  market: MarketDef;
  tradeHref: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [usd, setUsd] = useState(25);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<MintPhase>("idle");
  const [problem, setProblem] = useState<string | null>(null);

  const token = market.token as Address | undefined;

  const refresh = useCallback(async () => {
    if (!publicClient || !address || !token) return;
    setLoading(true);
    setProblem(null);
    try {
      const p = await planAddLiquidity(publicClient, token, address, usd);
      setPlan(p);
      if (!p) setProblem("This market has no pool to add to yet.");
    } catch {
      setProblem("Could not reach the market just now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, [publicClient, address, token, usd]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const go = async () => {
    if (!publicClient || !walletClient || !address || !token || !plan) return;
    setProblem(null);
    const res = await addLiquidity({
      publicClient,
      walletClient,
      account: address,
      token,
      plan,
      chainId,
      switchChain: switchChainAsync,
      onPhase: setPhase,
    });
    if (res.ok) {
      onDone();
      return;
    }
    setPhase("idle");
    if (res.reason === "cancelled") return; // they changed their mind; say nothing
    if (res.reason === "needs-gas") {
      setProblem("You need a tiny bit of the Doma coin for the network fee.");
      return;
    }
    setProblem("That did not go through, and nothing was taken. Try again.");
  };

  const busy = phase !== "idle" && phase !== "error" && phase !== "done";
  const shortToken = plan && !plan.haveEnoughToken;
  const shortUsdc = plan && !plan.haveEnoughUsdc;

  const label: Record<MintPhase, string> = {
    idle: "Put it to work",
    switching: "Switch network in your wallet…",
    "approving-token": `Allow ${market.label}…`,
    "approving-usdc": "Allow dollars…",
    minting: "Sending…",
    done: "Done",
    error: "Try again",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(8,4,2,0.62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 20,
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(400px, 96vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "rgba(27,19,16,0.98)",
          border: "1px solid #4a3626",
          borderRadius: 16,
          color: "#f3e9d2",
          fontFamily: FONT,
          fontSize: 13,
          padding: "14px 15px",
          boxShadow: "0 18px 44px rgba(8,4,2,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 800, letterSpacing: "0.05em", fontSize: 15 }}>
            PUT MONEY TO WORK
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #4a3626",
              background: "#2a1c14",
              color: "#f3e9d2",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ opacity: 0.75, lineHeight: 1.45, margin: "8px 0 10px" }}>
          You lend {market.label} and dollars to the market so other people can
          trade them. It stays yours, you can take it back whenever you like,
          and while it is there it pays your kitchen every hour.
        </div>

        {/* the one number */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setUsd(a)}
              style={{
                flex: 1,
                minWidth: 66,
                minHeight: 42,
                padding: "9px 6px",
                borderRadius: 10,
                border: `1px solid ${usd === a ? "#e8a13d" : "#4a3626"}`,
                background: usd === a ? "#e8a13d" : "#2a1c14",
                color: usd === a ? "#1b1310" : "#f3e9d2",
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ${a}
            </button>
          ))}
        </div>

        {loading && <div style={{ opacity: 0.6 }}>Checking the market…</div>}

        {plan && !loading && (
          <div
            style={{
              border: "1px solid rgba(74,54,38,0.8)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "rgba(20,14,11,0.5)",
              lineHeight: 1.5,
            }}
          >
            <div style={{ opacity: 0.7, marginBottom: 4 }}>This uses</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{market.label}</span>
              <span style={{ fontWeight: 700, color: shortToken ? "#e0a552" : "#f3e9d2" }}>
                {fmt(plan.tokenAmount, plan.tokenDecimals, 3)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>dollars</span>
              <span style={{ fontWeight: 700, color: shortUsdc ? "#e0a552" : "#f3e9d2" }}>
                ${fmt(plan.usdcAmount, 6, 2)}
              </span>
            </div>
            <div style={{ opacity: 0.5, marginTop: 5, fontSize: 12 }}>
              Half and half is what the market needs. Anything it does not use
              comes straight back to you.
            </div>
          </div>
        )}

        {/* the honest catch, as a step rather than an error */}
        {shortToken && (
          <div style={{ marginTop: 9 }}>
            <div style={{ color: "#e0a552", lineHeight: 1.45, marginBottom: 6 }}>
              First you need some {market.label}. Buy a little, come back, and
              this will be ready.
            </div>
            <a
              href={tradeHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e8a13d",
                background: "#e8a13d",
                color: "#1b1310",
                fontWeight: 800,
                textDecoration: "none",
                minHeight: 42,
              }}
            >
              Buy {market.label} ↗
            </a>
          </div>
        )}

        {shortUsdc && !shortToken && (
          <div style={{ marginTop: 9, color: "#e0a552", lineHeight: 1.45 }}>
            You need ${fmt(plan!.usdcAmount, 6, 2)} in dollars for this. Pick a
            smaller amount, or top up on Doma.
          </div>
        )}

        {problem && (
          <div style={{ marginTop: 9, color: "#ff9a9a", lineHeight: 1.45 }}>{problem}</div>
        )}

        {!shortToken && (
          <button
            onClick={go}
            disabled={busy || !plan || !!shortUsdc}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "11px 12px",
              borderRadius: 10,
              border: `1px solid ${plan && !shortUsdc && !busy ? "#e8a13d" : "#4a3626"}`,
              background: plan && !shortUsdc && !busy ? "#e8a13d" : "#241a14",
              color: plan && !shortUsdc && !busy ? "#1b1310" : "#8a7a63",
              fontFamily: FONT,
              fontSize: 14,
              fontWeight: 800,
              cursor: busy ? "default" : "pointer",
              minHeight: 46,
            }}
          >
            {label[phase]}
          </button>
        )}

        <div style={{ opacity: 0.5, marginTop: 9, lineHeight: 1.4, fontSize: 12 }}>
          Your wallet will ask you to confirm, twice the first time. Prices move
          while you trade, so what you get back can be worth more or less than
          what you put in.
        </div>
      </div>
    </div>
  );
}
