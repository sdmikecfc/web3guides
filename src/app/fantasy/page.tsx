import Link from "next/link";
import { fantasyDb } from "@/lib/fantasy/supabase";
import { getLatestRound, getPoolForRound, type RoundRow, type PoolPriceRow } from "@/lib/fantasy/db";
import { fmtUsd, fmtInt } from "./_data/tokens";
import { StatCard } from "./_components/StatCard";
import { Countdown } from "./_components/Countdown";
import { TierBadge } from "./_components/TierBadge";

export const dynamic = "force-dynamic";

interface PoolStats {
  eligibleCount: number;
  budgetUsd: number;
  totalMarketFdvUsd: number;
}

const FILTER_DESCRIPTION =
  "≥ 25 holders AND (≥ $50 weekly volume OR ≥ $1,000 FDV)";

export default async function FantasyLanding() {
  const round = await getLatestRound();
  const pool = round ? await getPoolForRound(round.round_id) : [];
  const hasSnapshot = pool.length > 0;

  // Compute stats from the real snapshot (if any).
  const stats: PoolStats = hasSnapshot
    ? {
        eligibleCount: pool.length,
        budgetUsd: round ? Number(round.budget_usd) : 0,
        totalMarketFdvUsd: pool.reduce((s, p) => s + Number(p.fdv_usd), 0),
      }
    : { eligibleCount: 0, budgetUsd: 0, totalMarketFdvUsd: 0 };

  const top5 = pool.slice(0, 5);

  // Phase-appropriate countdown target.
  const phaseInfo = round ? phaseFor(round) : null;

  return (
    <div className="mx-auto max-w-[1380px] px-6 pt-12 pb-20">
      {/* ── Hero ─────────────────────────────────── */}
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {round ? `${round.name} · ${phaseInfo?.statusLabel ?? round.status.toLowerCase()}` : "Doma Fantasy League"}
          </span>
          <span className="h-px flex-1 max-w-[80px] bg-border/60" />
          {phaseInfo && <Countdown to={phaseInfo.countdownTo} label={phaseInfo.countdownLabel} />}
        </div>

        <h1 className="font-display text-[clamp(40px,5.5vw,68px)] font-bold leading-[1.05] tracking-[-0.025em] mb-5 max-w-4xl">
          Build a 10-domain portfolio.<br/>
          <span className="text-muted/70">Win on growth.</span>
        </h1>

        <p className="text-[16px] text-muted max-w-2xl leading-relaxed mb-8">
          {hasSnapshot ? (
            <>Pick 10 fractionalized Doma domains under a {fmtUsd(stats.budgetUsd, { compact: true })} budget.</>
          ) : (
            <>Pick 10 fractionalized Doma domains under a fixed budget.</>
          )}{" "}
          You have 3 days to draft, then 7 days of price movements decide it. Three rounds
          every month. Top finishers earn Flipper points and round trophies.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/fantasy/draft"
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-display font-semibold text-[15px] tracking-tight transition-all duration-200 hover:translate-y-[-1px]"
            style={{
              background: "linear-gradient(135deg, #7c6aff, #4f3cc9)",
              color: "#fff",
              boxShadow: "0 12px 32px rgba(124,106,255,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            Enter draft
            <ArrowRightIcon />
          </Link>
          <Link
            href="/fantasy/leaderboard"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-display font-medium text-[14px] text-muted hover:text-text transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            View leaderboard
          </Link>
        </div>
      </header>

      {/* ── Stats strip ─────────────────────────── */}
      {hasSnapshot ? (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12">
          <StatCard
            label="Eligible pool"
            value={fmtInt(stats.eligibleCount)}
            hint="domains in this round's snapshot"
            accent="#5eead4"
          />
          <StatCard
            label="Your budget"
            value={fmtUsd(stats.budgetUsd, { compact: true })}
            hint="35% of top-10 FDV sum"
            accent="#7c6aff"
          />
          <StatCard
            label="Total market FDV"
            value={fmtUsd(stats.totalMarketFdvUsd, { compact: true })}
            hint="across all eligible domains"
            accent="#f0b340"
          />
          <StatCard
            label="Picks required"
            value="10"
            hint="3 days to draft · 7 to score"
          />
        </section>
      ) : (
        <section className="glass rounded-xl p-6 mb-12 flex items-center gap-4">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "#f0b340", boxShadow: "0 0 10px rgba(240,179,64,0.6)" }}
          />
          <div>
            <div className="font-display text-[15px] font-semibold text-text mb-0.5">
              {round ? `${round.name} opens soon` : "First round opens soon"}
            </div>
            <div className="text-[13px] text-muted">
              Snapshot prices and budget will appear here when the draft window starts.
            </div>
          </div>
        </section>
      )}

      {/* ── How it works ────────────────────────── */}
      <section className="mb-12">
        <SectionLabel>How it plays</SectionLabel>
        <div className="grid md:grid-cols-3 gap-4">
          <HowCard
            num="01"
            title="Draft 10 domains"
            body="3 days to build a portfolio under budget. Pick a star, build the squad, or hunt the long tail for moonshots."
          />
          <HowCard
            num="02"
            title="Hold for 7 days"
            body="Lineup locks. Your portfolio scores on real Doma FDV growth, marked-to-market live. No swaps. No second guesses."
          />
          <HowCard
            num="03"
            title="Win the round"
            body="Round resolves on day 10. Top 3 earn Flipper points and trophy roles. Three fresh rounds every month — no wallet needed to play."
          />
        </div>
      </section>

      {/* ── Pool preview ────────────────────────── */}
      {hasSnapshot && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-4">
            <SectionLabel>This round&rsquo;s premium tier</SectionLabel>
            <Link
              href="/fantasy/draft"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-accent transition-colors"
            >
              See all {stats.eligibleCount} →
            </Link>
          </div>

          <div className="glass rounded-xl overflow-hidden">
            <div className="grid grid-cols-[2fr_120px_120px_100px] gap-4 px-5 py-3 border-b border-border/60 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              <div>Domain</div>
              <div className="text-right">FDV</div>
              <div className="text-right">Holders</div>
              <div className="text-right">Tier</div>
            </div>
            {top5.map((t) => (
              <div
                key={t.token_address}
                className="grid grid-cols-[2fr_120px_120px_100px] gap-4 px-5 py-3.5 border-b border-border/30 last:border-b-0"
              >
                <div className="font-display text-[15px] font-semibold">{t.domain_name}</div>
                <div className="text-right font-mono text-[14px] tabular-nums">
                  {fmtUsd(Number(t.fdv_usd), { compact: true })}
                </div>
                <div className="text-right font-mono text-[14px] tabular-nums text-muted">
                  {fmtInt(Number(t.holder_count ?? 0))}
                </div>
                <div className="text-right">
                  <TierBadge tier={(t.tier ?? "SMALL") as PoolPriceRow["tier"]} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Eligibility note ────────────────────── */}
      <section className="glass rounded-xl px-6 py-5">
        <div className="flex items-start gap-4">
          <span
            className="mt-1 inline-block h-2 w-2 rounded-full flex-shrink-0"
            style={{ background: "#5eead4", boxShadow: "0 0 10px rgba(94,234,212,0.6)" }}
          />
          <div>
            <div className="font-display text-[14px] font-semibold text-text mb-1">
              How to get your token in the pool
            </div>
            <p className="text-[13px] text-muted leading-relaxed">
              Domains qualify when they meet:{" "}
              <span className="font-mono text-text/90">{FILTER_DESCRIPTION}</span>.
              Want your favorite domain in the next round&rsquo;s pool? Get holders trading and bring more wallets in.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function phaseFor(round: RoundRow): { statusLabel: string; countdownTo: string; countdownLabel: string } | null {
  switch (round.status) {
    case "UPCOMING":  return { statusLabel: "opens soon",   countdownTo: round.draft_opens_at, countdownLabel: "Draft opens" };
    case "DRAFTING":  return { statusLabel: "drafting",     countdownTo: round.draft_locks_at, countdownLabel: "Draft locks" };
    case "ACTIVE":    return { statusLabel: "scoring",      countdownTo: round.resolves_at,    countdownLabel: "Round resolves" };
    case "COMPLETE":  return { statusLabel: "complete",     countdownTo: round.resolves_at,    countdownLabel: "Resolved" };
    default:          return null;
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="h-px w-6 bg-accent/60" />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{children}</span>
    </div>
  );
}

function HowCard({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="glass rounded-xl p-5 card-hover">
      <div className="font-mono text-[11px] tracking-[0.12em] text-accent mb-3">{num}</div>
      <div className="font-display text-[16px] font-semibold mb-1.5">{title}</div>
      <p className="text-[13px] text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
