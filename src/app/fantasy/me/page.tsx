import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/fantasy/session";
import { getLatestRound, getUserHoldings, decorateHoldings } from "@/lib/fantasy/db";
import { fmtUsd, fmtPct } from "../_data/tokens";
import { TierBadge } from "../_components/TierBadge";
import { Countdown } from "../_components/Countdown";

export const dynamic = "force-dynamic";

type Tier = "PREMIUM" | "UPPER_MID" | "MID" | "SMALL";

export default async function MyTeamPage() {
  const session = readSession();
  if (!session) redirect("/fantasy/login?error=session-required");

  const round = await getLatestRound();
  if (!round) {
    return <EmptyState title="No round yet" body="The first round will open soon." />;
  }

  const rawHoldings = await getUserHoldings(round.round_id, session.sub);
  if (rawHoldings.length === 0) {
    if (round.status === "DRAFTING") {
      return (
        <EmptyState
          title="You haven't drafted yet"
          body={`The draft window is open. Build a 10-domain portfolio under the ${fmtUsd(Number(round.budget_usd), { compact: true })} budget.`}
          cta={{ href: "/fantasy/draft", label: "Open draft" }}
        />
      );
    }
    return (
      <EmptyState
        title="You weren't in this round"
        body="No holdings on record. Wait for the next round to open and run !fantasy enter to play."
      />
    );
  }

  const holdings = await decorateHoldings(rawHoldings);
  const budget = Number(round.budget_usd);
  const totalCost = holdings.reduce((s, h) => s + h.cost_basis_fdv_usd, 0);
  const totalValue = holdings.reduce((s, h) => s + h.current_fdv_usd, 0);
  const unspent = budget - totalCost;
  const grandTotal = totalValue + unspent;
  const pctGrowth = budget > 0 ? ((grandTotal - budget) / budget) * 100 : 0;

  const phaseLabel =
    round.status === "DRAFTING" ? "drafting" :
    round.status === "ACTIVE" ? "scoring" :
    round.status === "COMPLETE" ? "complete" : "upcoming";

  const countdownTarget =
    round.status === "DRAFTING" ? round.draft_locks_at :
    round.status === "ACTIVE" ? round.resolves_at :
    null;

  return (
    <div className="mx-auto max-w-[1380px] px-6 pt-12 pb-20">
      {/* Header */}
      <div className="mb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2">
          {round.name} · {phaseLabel}
        </div>
        <h1 className="font-display text-[40px] font-bold tracking-[-0.025em] leading-tight mb-1.5">
          Your portfolio
        </h1>
        <p className="text-[14px] text-muted">
          {round.status === "DRAFTING"
            ? "Editable until the draft locks. Your picks are saved live."
            : round.status === "ACTIVE"
              ? "Lineup locked. Held positions tracked against live FDV until the round resolves."
              : "Round complete. Final values frozen."}
        </p>
      </div>

      {/* Top-level summary */}
      <section className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-5 mb-10">
        <div className="glass rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Total portfolio
            </span>
            {countdownTarget && (
              <Countdown
                to={countdownTarget}
                label={round.status === "DRAFTING" ? "Draft locks" : "Round resolves"}
              />
            )}
          </div>
          <div className="mt-2">
            <div className="font-display text-[48px] font-bold tracking-[-0.025em] tabular-nums leading-none">
              {fmtUsd(grandTotal, { compact: true })}
            </div>
            <div className="mt-2.5 flex items-baseline gap-3 font-mono">
              <span
                className="text-[18px] font-semibold tabular-nums"
                style={{ color: pctGrowth >= 0 ? "#34d399" : "#f87171" }}
              >
                {fmtPct(pctGrowth, { showSign: true })}
              </span>
              <span className="text-[12px] text-muted">
                from {fmtUsd(budget, { compact: true })} starting budget
              </span>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 space-y-3">
          <Row label="Holdings value" value={fmtUsd(totalValue, { compact: true })} />
          <Row label="Unspent budget" value={fmtUsd(unspent, { compact: true })} muted />
          <div className="h-px bg-border/60 my-2" />
          <Row label="Total" value={fmtUsd(grandTotal, { compact: true })} bold />
          <Row
            label={round.status === "COMPLETE" ? "Final result" : "Realized this round"}
            value={fmtPct(pctGrowth, { showSign: true })}
            color={pctGrowth >= 0 ? "#34d399" : "#f87171"}
          />
        </div>
      </section>

      {/* Holdings */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="h-px w-6 bg-accent/60" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Holdings ({holdings.length}/10){round.status !== "DRAFTING" ? " · locked" : ""}
            </span>
          </div>
          {round.status === "DRAFTING" ? (
            <Link
              href="/fantasy/draft"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted hover:text-accent transition-colors"
            >
              Edit picks →
            </Link>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted/70">
              no swaps · resolves day 4
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {holdings.map((h) => (
            <HoldingCard key={h.token_address} h={h} />
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 pt-24 pb-20">
      <div className="glass rounded-2xl p-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-3">My team</div>
        <h1 className="font-display text-[32px] font-bold tracking-[-0.025em] leading-tight mb-3">
          {title}
        </h1>
        <p className="text-[15px] text-muted leading-relaxed mb-6">{body}</p>
        {cta && (
          <Link
            href={cta.href}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-display font-semibold text-[14px] tracking-tight"
            style={{
              background: "linear-gradient(135deg, #7c6aff, #4f3cc9)",
              color: "#fff",
              boxShadow: "0 8px 24px rgba(124,106,255,0.35)",
            }}
          >
            {cta.label} →
          </Link>
        )}
      </div>
    </div>
  );
}

function HoldingCard({
  h,
}: {
  h: {
    domain_name: string;
    cost_basis_fdv_usd: number;
    current_fdv_usd: number;
    pct_change: number;
  };
}) {
  const pct = h.pct_change;
  const positive = pct >= 0;

  return (
    <div className="glass rounded-xl p-4 transition-colors hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[18px] font-semibold truncate leading-tight">
            {h.domain_name}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted/70">drafted</span>
          </div>
        </div>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted/60 rounded-md px-2 py-1"
          style={{ border: "1px solid rgba(255,255,255,0.04)" }}
        >
          Locked
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Cell label="Cost basis" value={fmtUsd(h.cost_basis_fdv_usd, { compact: true })} />
        <Cell label="Current FDV" value={fmtUsd(h.current_fdv_usd, { compact: true })} />
        <Cell
          label="Δ"
          value={fmtPct(pct, { showSign: true })}
          color={positive ? "#34d399" : "#f87171"}
        />
      </div>
    </div>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted/70">{label}</div>
      <div
        className="font-mono text-[13px] tabular-nums mt-0.5"
        style={{ color: color ?? "var(--color-text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
  color,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`font-mono text-[11px] uppercase tracking-[0.12em] ${muted ? "text-muted/70" : "text-muted"}`}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${bold ? "text-[16px] font-bold text-text" : "text-[14px]"}`}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
