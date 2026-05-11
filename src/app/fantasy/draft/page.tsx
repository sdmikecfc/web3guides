import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/fantasy/session";
import { getCurrentDraftingRound, getPoolForRound, getUserHoldings } from "@/lib/fantasy/db";
import { fmtUsd, fmtInt, type FantasyToken, type Tier } from "../_data/tokens";
import { Countdown } from "../_components/Countdown";
import { DraftBoard } from "../_components/DraftBoard";

export const dynamic = "force-dynamic";

export default async function FantasyDraftPage() {
  const session = readSession();
  if (!session) redirect("/fantasy/login?error=session-required");

  const round = await getCurrentDraftingRound();
  if (!round) {
    return (
      <div className="mx-auto max-w-2xl px-6 pt-24 pb-20">
        <div className="glass rounded-2xl p-10">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-3">No draft open</div>
          <h1 className="font-display text-[32px] font-bold tracking-[-0.025em] leading-tight mb-3">
            Nothing to draft right now.
          </h1>
          <p className="text-[15px] text-muted leading-relaxed mb-6">
            The next round will open soon. Watch <span className="font-mono text-accent">#original-gansters</span> for the announcement.
          </p>
          <Link
            href="/fantasy"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-text transition-colors"
          >
            ← back to landing
          </Link>
        </div>
      </div>
    );
  }

  const [pool, holdings] = await Promise.all([
    getPoolForRound(round.round_id),
    getUserHoldings(round.round_id, session.sub),
  ]);

  // Map DB rows -> shape the DraftBoard already consumes.
  const tokens: FantasyToken[] = pool.map((p) => ({
    domain: p.domain_name,
    symbol: "",
    address: p.token_address,
    tier: (p.tier ?? "SMALL") as Tier,
    fdvUsd: Number(p.fdv_usd),
    priceUsd: Number(p.price_usd ?? 0),
    price24hAgoUsd: null,
    pctChange24h: null,
    volumeUsd: Number(p.volume_usd ?? 0),
    holderCount: Number(p.holder_count ?? 0),
    status: (p.status === "FRACTIONALIZED" ? "FRACTIONALIZED" : "GRADUATION_SUCCESSFUL") as
      | "FRACTIONALIZED"
      | "GRADUATION_SUCCESSFUL",
    fractionalizedAt: "",
  }));

  const initialPicks = holdings.map((h) => h.token_address);

  return (
    <div className="mx-auto max-w-[1380px] px-6 pt-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <Link
            href="/fantasy"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted hover:text-text transition-colors mb-2"
          >
            <BackArrowIcon /> back
          </Link>
          <h1 className="font-display text-[34px] font-bold tracking-[-0.025em] leading-tight">
            Draft your team
          </h1>
          <div className="text-[13px] text-muted mt-1">
            {round.name} · 36-hour draft window ·{" "}
            <span className="text-text/80">{fmtInt(tokens.length)} eligible domains</span>
            {initialPicks.length === 10 && (
              <span className="ml-2 text-text/90">· <span className="text-accent">team saved — you can still edit</span></span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Budget</div>
            <div className="font-display text-[20px] font-bold tabular-nums">
              {fmtUsd(Number(round.budget_usd), { compact: true })}
            </div>
          </div>
          <div className="h-10 w-px bg-border/60" />
          <Countdown to={round.draft_locks_at} label="Locks in" />
        </div>
      </div>

      <DraftBoard
        tokens={tokens}
        budgetUsd={Number(round.budget_usd)}
        initialPicks={initialPicks}
      />
    </div>
  );
}

function BackArrowIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M13 8H3M7 4L3 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
