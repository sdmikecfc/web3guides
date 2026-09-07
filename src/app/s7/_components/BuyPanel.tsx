"use client";
/**
 * S7 IN-APP BUY: one tap, $5, on the keep's bonding curve.
 *
 * Replaces the "leave for app.doma.xyz and type an amount into a stranger's
 * form" step, which is where S4 lost half of everyone who joined. The wallet
 * is already connected from the SIWE enlist, so the whole purchase happens
 * here: quote -> approve (only if needed) -> buy.
 *
 * SAFETY POSTURE, because this spends real money:
 *   - Renders NOTHING unless the server says this token is on its launchpad
 *     curve (see /api/s7/buy-info). Graduated or unknown falls back to the
 *     old link. A buy button never appears on a guess.
 *   - Every quote is read live from the curve immediately before the buy, and
 *     the exact token count is shown BEFORE the wallet opens.
 *   - minTokenAmount carries a measured slippage floor (see BUY_SLIPPAGE_BPS),
 *     so a curve that moved hard under other buyers reverts rather than
 *     silently filling far worse than the preview showed.
 *   - Approves the EXACT amount, never unlimited.
 *   - Hard guards: right chain, enough USDC.e, supply still available.
 *   - BUY_IN_APP_ENABLED in lib/s7/launchpad.ts is the kill switch.
 *
 * The user always initiates; nothing here ever auto-signs.
 */
import { useCallback, useEffect, useState } from "react";
import { DOMA_HELP } from "@/lib/s7/help";
import { useAccount, useChainId, useSwitchChain, usePublicClient, useWalletClient } from "wagmi";
import { track } from "@/lib/s7/track";
import { USDC_E_ADDRESS, USDC_E_DECIMALS, buyLink, DOMA_PROFILE_URL } from "@/lib/s7/funding";
import {
  BONDING_CURVE_MODEL_ABI,
  BUY_IN_APP_ENABLED,
  BUY_MAX_USD,
  BUY_MIN_USD,
  BUY_PRESETS_USD,
  QUALIFYING_HOLD_USD,
  APPROVE_GAS_LIMIT_FALLBACK,
  BUY_GAS_LIMIT_FALLBACK,
  BUY_SLIPPAGE_BPS,
  DOMA_CHAIN_ID,
  GAS_PRICE_BOOST_PCT,
  MIN_GAS_WEI,
  ERC20_ABI,
  LAUNCHPAD_ABI,
  clampToAvailable,
  formatTokens,
  minOut,
  quoteAfterFee,
  txUrl,
  sanitizeUsd,
  usdToUnits,
} from "@/lib/s7/launchpad";

type BuyInfo = {
  ok?: boolean;
  tradable?: boolean;
  launchpadAddress?: string | null;
  tokenAddress?: string | null;
  symbol?: string | null;
  decimals?: number;
  fallbackUrl?: string;
  /** Why it is not tradable, when it is not. The API distinguishes "no token
   * yet" (never listed: nothing to buy anywhere) from "not on the curve"
   * (graduated: buyable on Doma), and the card must too. */
  reason?: string | null;
};

type Phase = "idle" | "quoting" | "ready" | "approving" | "buying" | "done" | "error";

const EMBER = "#e0662e";
const TEXT = "#e9edf1";
const MUTED = "#9aa7b4";
const GOOD = "#34d399";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function BuyPanel({
  domain,
  name,
  strings,
  demoLaunchpad,
  demoToken,
  simulate = false,
}: {
  domain: string;
  name: string;
  /** DEV ONLY: point the panel at a real live launchpad that is not on our
   * roster yet, so the flow can be exercised before our walls list. */
  demoLaunchpad?: string;
  demoToken?: string;
  /** DEV ONLY: run every read AND validate the buy against the chain with
   * simulateContract, but never send a transaction. Nothing is spent. */
  simulate?: boolean;
  /** en/ko/zh copy from the caller's dict. */
  strings: {
    title: string;
    quoting: string;
    youGet: string;
    buyCta: string;
    approveCta: string;
    connectFirst: string;
    switchChain: string;
    needFunds: string;
    needGas: string;
    fundCta: string;
    done: string;
    viewTx: string;
    failed: string;
    slippageNote: string;
    curveLine: string;
    termsTitle: string;
    termsPoints: string[];
    sellRoute: string;
    tokenPage: string;
    portfolio: string;
    orAmount: string;
    underQualifying: string;
    fallbackCta: string;
    /** Shown when the keep has not listed on-chain yet: there is no
     * curve, no contract and nothing to buy anywhere. */
    notListedCta: string;
    notListedNote: string;
  };
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: DOMA_CHAIN_ID });
  const { data: walletClient } = useWalletClient();

  const [info, setInfo] = useState<BuyInfo | null>(null);
  const [usd, setUsd] = useState<number>(BUY_PRESETS_USD[0]);
  const [typed, setTyped] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [tokensOut, setTokensOut] = useState<bigint | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Fill percent + how much better this price is than the wall's last dollar. */
  const [curve, setCurve] = useState<{ fillPct: number; vsEnd: number } | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  // Resolve the venue once. Until this says tradable, no button renders.
  useEffect(() => {
    if (demoLaunchpad) {
      setInfo({ ok: true, tradable: true, launchpadAddress: demoLaunchpad, tokenAddress: demoToken ?? null });
      return;
    }
    let cancelled = false;
    void fetch(`/api/s7/buy-info?domain=${encodeURIComponent(domain)}`)
      .then((r) => (r.ok ? (r.json() as Promise<BuyInfo>) : null))
      .then((j) => {
        if (!cancelled && j) setInfo(j);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [domain, demoLaunchpad, demoToken]);

  const launchpad = (info?.launchpadAddress || "") as `0x${string}`;
  // Doma's fractional tokens are NOT all 18dp (SUPPLEMINTZ.com is 6dp), and a
  // wrong guess misstates the amount by orders of magnitude. Trust the API
  // when it answers, verify on-chain otherwise.
  const [decimals, setDecimals] = useState<number>(info?.decimals ?? 6);
  useEffect(() => {
    if (typeof info?.decimals === "number" && Number.isFinite(info.decimals)) {
      setDecimals(info.decimals);
      return;
    }
    if (!publicClient || !info?.tokenAddress) return;
    let cancelled = false;
    void publicClient
      .readContract({ address: info.tokenAddress as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" })
      .then((d) => {
        if (!cancelled) setDecimals(Number(d));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [info?.decimals, info?.tokenAddress, publicClient]);

  /** Read the live curve quote for the chosen amount. */
  const refreshQuote = useCallback(async () => {
    if (!publicClient || !launchpad) return;
    setPhase("quoting");
    setErr(null);
    try {
      const amountIn = usdToUnits(usd);
      const [feeBps, curveModel, sold, available] = await Promise.all([
        publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "buyFeeRateBps" }),
        publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "curveModel" }),
        publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "tokensSold" }),
        publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "getAvailableTokensToBuy" }),
      ]);
      const raw = await publicClient.readContract({
        address: curveModel as `0x${string}`,
        abi: BONDING_CURVE_MODEL_ABI,
        functionName: "calculateBuyExactQuote",
        args: [quoteAfterFee(amountIn, feeBps as bigint), sold as bigint],
      });
      const out = clampToAvailable(raw as bigint, available as bigint);

      // THE CURVE POSITION (the honest urgency hook). A linear curve runs
      // ~1.97x from empty to full, so the same $5 always buys more now than it
      // will at the end. Quoting the near-full point gives the exact multiple
      // without any "be first" claim, which would be false anyway: these walls
      // list on Doma's schedule and non-players buy them first.
      try {
        const supply = (await publicClient.readContract({
          address: launchpad, abi: LAUNCHPAD_ABI, functionName: "launchTokensSupply",
        })) as bigint;
        if (supply > BigInt(0)) {
          const nearFull = supply - supply / BigInt(100); // 99% sold
          const atEnd = (await publicClient.readContract({
            address: curveModel as `0x${string}`,
            abi: BONDING_CURVE_MODEL_ABI,
            functionName: "calculateBuyExactQuote",
            args: [quoteAfterFee(amountIn, feeBps as bigint), nearFull],
          })) as bigint;
          const fillPct = Number(((sold as bigint) * BigInt(10000)) / supply) / 100;
          const vsEnd = atEnd > BigInt(0) ? Number((out * BigInt(100)) / atEnd) / 100 : 0;
          setCurve({ fillPct, vsEnd });
        }
      } catch {
        setCurve(null); // decoration only: never block the quote
      }

      // The chain is the truth about whether this launch is open.
      let live = true;
      try {
        live = Number(await publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "launchStatus" })) === 1;
      } catch {
        live = true; // no launchStatus on this launchpad: fall back to the quote
      }
      setTokensOut(out);
      const ok = live && out > BigInt(0);
      setPhase(ok ? "ready" : "error");
      if (!ok) setErr(strings.failed);
    } catch {
      setPhase("error");
      setErr(strings.failed);
    }
  }, [publicClient, launchpad, usd, strings.failed]);

  useEffect(() => {
    if (info?.tradable) void refreshQuote();
  }, [info?.tradable, refreshQuote]);

  async function handleBuy() {
    if (!walletClient || !address || !publicClient || !launchpad) return;
    setErr(null);
    try {
      // 1) Right chain, or nothing else is safe to do.
      if (chainId !== DOMA_CHAIN_ID) {
        await switchChainAsync({ chainId: DOMA_CHAIN_ID });
      }
      const amountIn = usdToUnits(usd);

      // 2) Enough USDC.e? Say so plainly instead of letting the wallet revert.
      const bal = (await publicClient.readContract({
        address: USDC_E_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      if (bal < amountIn) {
        setPhase("error");
        setErr(strings.needFunds);
        return;
      }

      // 2b) GAS. Doma gas is paid in ETH ON DOMA CHAIN; a wallet holding only
      // mainnet ETH cannot transact here at all, and the wallet's own error
      // for that is unreadable. Say it plainly and point at the wizard.
      const gasBal = await publicClient.getBalance({ address });
      if (gasBal < MIN_GAS_WEI) {
        setPhase("error");
        setErr(strings.needGas);
        return;
      }

      // 3) Re-quote at the last possible moment: the curve moves.
      const [feeBps, curveModel, sold, available] = await Promise.all([
        publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "buyFeeRateBps" }),
        publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "curveModel" }),
        publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "tokensSold" }),
        publicClient.readContract({ address: launchpad, abi: LAUNCHPAD_ABI, functionName: "getAvailableTokensToBuy" }),
      ]);
      const fresh = clampToAvailable(
        (await publicClient.readContract({
          address: curveModel as `0x${string}`,
          abi: BONDING_CURVE_MODEL_ABI,
          functionName: "calculateBuyExactQuote",
          args: [quoteAfterFee(amountIn, feeBps as bigint), sold as bigint],
        })) as bigint,
        available as bigint,
      );
      if (fresh <= BigInt(0)) {
        setPhase("error");
        setErr(strings.failed);
        return;
      }
      setTokensOut(fresh);

      // 4) Approve EXACTLY this spend if the allowance is short.
      const allowance = (await publicClient.readContract({
        address: USDC_E_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, launchpad],
      })) as bigint;
      if (allowance < amountIn) {
        setPhase("approving");
        const approveHash = await walletClient.writeContract({
          address: USDC_E_ADDRESS as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [launchpad, amountIn],
          gas: APPROVE_GAS_LIMIT_FALLBACK,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // 5) The buy, with a slippage floor so a moved curve reverts.
      setPhase("buying");
      if (simulate) {
        // Validate the exact call against the live chain and STOP. viem's
        // simulateContract runs it in an eth_call, so this proves the buy
        // would succeed (or shows the precise revert) without spending.
        await publicClient.simulateContract({
          address: launchpad,
          abi: LAUNCHPAD_ABI,
          functionName: "buy",
          args: [amountIn, minOut(fresh, BUY_SLIPPAGE_BPS)],
          account: address,
        });
        setHash(null);
        setPhase("done");
        return;
      }
      track("outbound_buy", { ref: "inapp-buy", domain });
      // Gas price nudged up and a hard limit kept in reserve: estimation can
      // fail outright on a launchpad that just went live (snipe.py:866-872).
      let gasPrice: bigint | undefined;
      try {
        gasPrice = ((await publicClient.getGasPrice()) * GAS_PRICE_BOOST_PCT) / BigInt(100);
      } catch {
        gasPrice = undefined;
      }
      const buyHash = await walletClient.writeContract({
        address: launchpad,
        abi: LAUNCHPAD_ABI,
        functionName: "buy",
        args: [amountIn, minOut(fresh, BUY_SLIPPAGE_BPS)],
        gas: BUY_GAS_LIMIT_FALLBACK,
        ...(gasPrice ? { gasPrice } : {}),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });
      setHash(buyHash);
      setPhase(receipt.status === "success" ? "done" : "error");
      if (receipt.status !== "success") setErr(strings.failed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setPhase("error");
      // A user-cancelled signature is not an error worth shouting about.
      setErr(/reject|denied|cancell?ed/i.test(msg) ? null : strings.failed);
    }
  }

  // Not tradable on the curve (graduated, unlisted, or unresolved): the old
  // link out is still the right answer, so render that and nothing else.
  if (!BUY_IN_APP_ENABLED || !info || !info.tradable) {
    if (!info?.fallbackUrl) return null;
    // NOT LISTED YET is a different answer from NOT ON THE CURVE. A wall with
    // no token cannot be bought anywhere, so it must not wear a buy button:
    // that is a promise the page cannot keep, and the player only discovers it
    // after leaving the site. Quiet outline + one honest line instead.
    const unlisted = info.reason === "no token yet";
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <a
          href={info.fallbackUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            track("cta_click", { ref: unlisted ? "buy-unlisted" : "buy-fallback", domain });
            if (!unlisted) track("outbound_buy", { ref: "buy-fallback", domain });
          }}
          data-testid={unlisted ? "buy-unlisted" : "buy-fallback"}
          style={unlisted ? btnQuiet() : btn(EMBER)}
        >
          {unlisted ? strings.notListedCta : strings.fallbackCta}
        </a>
        {unlisted ? (
          <p style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
            {strings.notListedNote}
          </p>
        ) : null}
      </div>
    );
  }

  if (phase === "done") {
    const linkStyle: React.CSSProperties = {
      fontSize: 11.5, color: EMBER, textDecoration: "underline", textUnderlineOffset: 3,
    };
    return (
      <div data-testid="buy-done" style={{ display: "grid", gap: 7 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: GOOD }}>{strings.done}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a
            href={info.fallbackUrl || buyLink(domain)}
            target="_blank"
            rel="noreferrer"
            data-testid="buy-token-page"
            onClick={() => track("cta_click", { ref: "buy-token-page", domain })}
            style={linkStyle}
          >
            {strings.tokenPage}
          </a>
          <a
            href={DOMA_PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="buy-portfolio"
            onClick={() => track("cta_click", { ref: "buy-portfolio", domain })}
            style={linkStyle}
          >
            {strings.portfolio}
          </a>
        </div>
        <a
          href={DOMA_HELP.buying}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 11.5, color: "#7dd3fc", display: "block", marginBottom: 6 }}
        >
          New to domain tokens? How buying works ↗
        </a>
        {hash ? (
          <a href={txUrl(hash)} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: MUTED, fontFamily: MONO }}>
            {strings.viewTx}
          </a>
        ) : null}
      </div>
    );
  }

  const busy = phase === "approving" || phase === "buying";
  return (
    <div data-testid="buy-panel" style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 11, fontFamily: MONO, letterSpacing: "0.1em", color: MUTED, textTransform: "uppercase" }}>
        {strings.title}
      </p>

      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        {BUY_PRESETS_USD.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setUsd(v)}
            disabled={busy}
            aria-pressed={usd === v}
            style={{
              flex: 1,
              minHeight: 40,
              cursor: busy ? "default" : "pointer",
              fontFamily: MONO,
              fontSize: 13,
              fontWeight: 800,
              color: usd === v ? "#0b0d10" : TEXT,
              background: usd === v ? EMBER : "rgba(255,255,255,0.05)",
              border: `1px solid ${usd === v ? EMBER : "rgba(154,167,180,0.3)"}`,
              borderRadius: 8,
            }}
          >
            ${v}
          </button>
        ))}
      </div>

      {/* Any amount, not just the presets. USDC.e is 6dp and the curve prices
          fractions cleanly, so a $1 test buy is a real option: on Doma the gas
          for it is ~0.0000003 ETH, which is the opposite of the usual "small
          buys are not worth it" situation. */}
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.1em", color: MUTED, textTransform: "uppercase" }}>
          {strings.orAmount}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={BUY_MIN_USD}
          max={BUY_MAX_USD}
          step="any"
          value={typed}
          placeholder={String(usd)}
          disabled={busy}
          data-testid="buy-custom"
          onChange={(e) => {
            setTyped(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n)) setUsd(sanitizeUsd(n));
          }}
          onBlur={() => {
            if (typed === "") return;
            const fixed = sanitizeUsd(Number(typed));
            setUsd(fixed);
            setTyped(String(fixed));
          }}
          style={{
            flex: 1, minWidth: 0, minHeight: 40, padding: "6px 10px",
            fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(154,167,180,0.3)", borderRadius: 8,
          }}
        />
      </label>

      <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
        {phase === "quoting" || tokensOut === null
          ? strings.quoting
          : `${strings.youGet} ${formatTokens(tokensOut, decimals)} ${info.symbol || name}`}
      </p>

      {usd < QUALIFYING_HOLD_USD ? (
        <p data-testid="buy-under-qualifying" style={{ margin: 0, fontSize: 12, color: "#f0b340", lineHeight: 1.5 }}>
          {fillQual(strings.underQualifying, QUALIFYING_HOLD_USD)}
        </p>
      ) : null}

      {curve && curve.vsEnd > 1.01 ? (
        <p data-testid="curve-position" style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
          {fillLine(strings.curveLine, curve.fillPct, curve.vsEnd)}
        </p>
      ) : null}

      {!isConnected ? (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>{strings.connectFirst}</p>
      ) : (
        <button
          type="button"
          onClick={handleBuy}
          disabled={busy || phase === "quoting" || tokensOut === null || tokensOut <= BigInt(0)}
          data-testid="buy-now"
          style={{ ...btn(EMBER), opacity: busy ? 0.7 : 1, border: 0, width: "100%", minHeight: 44 }}
        >
          {phase === "approving"
            ? strings.approveCta
            : phase === "buying"
              ? strings.buyCta
              : chainId !== DOMA_CHAIN_ID
                ? strings.switchChain
                : // TWO DECIMALS. `usd` is a raw number off the custom-amount
                  // field, so typing 9.8 produced a button reading "Buy $9.8".
                  // This is the one place it is shown as MONEY; the placeholder
                  // and the qualifying-hold comparison above stay numeric.
                  `${strings.buyCta} $${usd.toFixed(2)}`}
        </button>
      )}

      {err ? (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: "#fb6f84" }}>
          {err}{" "}
          {info.fallbackUrl ? (
            <a href={info.fallbackUrl} target="_blank" rel="noreferrer" style={{ color: MUTED, textDecoration: "underline" }}>
              {strings.fallbackCta}
            </a>
          ) : null}
        </p>
      ) : null}

      <p style={{ margin: 0, fontSize: 10.5, color: MUTED, opacity: 0.85, lineHeight: 1.45 }}>{strings.slippageNote}</p>

      <details data-testid="buy-terms" style={{ marginTop: 2 }}>
        <summary
          style={{
            cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em",
            textTransform: "uppercase", color: MUTED, listStyle: "revert",
          }}
        >
          {strings.termsTitle}
        </summary>
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {strings.termsPoints.map((t, i) => (
            <p key={i} style={{ margin: 0, fontSize: 11.5, color: MUTED, lineHeight: 1.55 }}>
              {t}
            </p>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <a
              href={info.fallbackUrl || buyLink(domain)}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("cta_click", { ref: "buy-sell-route", domain })}
              data-testid="buy-sell-route"
              style={{ fontSize: 11.5, color: EMBER, textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              {strings.sellRoute}
            </a>
            <a
              href={DOMA_PROFILE_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("cta_click", { ref: "terms-portfolio", domain })}
              data-testid="terms-portfolio"
              style={{ fontSize: 11.5, color: EMBER, textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              {strings.portfolio}
            </a>
          </div>
        </div>
      </details>
    </div>
  );
}

/** "$5 or more is what qualifies you for the cash split." */
function fillQual(tpl: string, min: number): string {
  return tpl.replace("{min}", String(min));
}

/** "This wall is 42% filled. Your $5 buys 1.4x what it will at the end." */
function fillLine(tpl: string, fillPct: number, vsEnd: number): string {
  return tpl
    .replace("{pct}", String(Math.round(fillPct)))
    .replace("{mult}", vsEnd.toFixed(vsEnd >= 10 ? 0 : 1));
}

/** The NOT-A-BUY button: same shape so the card's rhythm holds, but hollow
 * and muted so it never reads as a purchase at a glance. */
function btnQuiet(): React.CSSProperties {
  return {
    display: "block",
    textAlign: "center",
    background: "transparent",
    color: MUTED,
    border: "1px solid rgba(154,167,180,0.35)",
    fontWeight: 700,
    fontSize: 13,
    padding: "10px 16px",
    borderRadius: 10,
    textDecoration: "none",
    cursor: "pointer",
  };
}

function btn(accent: string): React.CSSProperties {
  return {
    display: "block",
    textAlign: "center",
    background: accent,
    color: "#0b0d10",
    fontWeight: 800,
    fontSize: 13.5,
    padding: "11px 16px",
    borderRadius: 10,
    textDecoration: "none",
    cursor: "pointer",
  };
}
