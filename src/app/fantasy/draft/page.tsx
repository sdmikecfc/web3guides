import Link from "next/link";
import {
  getEligibleTokens,
  getPoolStats,
  getRoundInfo,
  fmtUsd,
  fmtInt,
} from "../_data/tokens";
import { Countdown } from "../_components/Countdown";
import { DraftBoard } from "../_components/DraftBoard";

export default function FantasyDraftPage() {
  const tokens = getEligibleTokens();
  const stats = getPoolStats();
  const round = getRoundInfo();

  return (
    <div className="mx-auto max-w-[1380px] px-6 pt-8 pb-20">
      {/* Compact header — leaves room for the board */}
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
            Round {String(round.roundNumber).padStart(2, "0")} · 3-day draft window ·{" "}
            <span className="text-text/80">{fmtInt(stats.eligibleCount)} eligible domains</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Budget</div>
            <div className="font-display text-[20px] font-bold tabular-nums">
              {fmtUsd(stats.budgetUsd, { compact: true })}
            </div>
          </div>
          <div className="h-10 w-px bg-border/60" />
          <Countdown to={round.draftLocksAt} label="Locks in" />
        </div>
      </div>

      <DraftBoard tokens={tokens} budgetUsd={stats.budgetUsd} />
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
