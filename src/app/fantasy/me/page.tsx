import {
  getPoolStats,
  getRoundInfo,
  fmtUsd,
  fmtPct,
} from "../_data/tokens";
import { TierBadge } from "../_components/TierBadge";
import { Countdown } from "../_components/Countdown";

interface MockHolding {
  domain: string;
  costBasisUsd: number;     // FDV at draft
  currentFdvUsd: number;    // mark-to-market
  tier: "PREMIUM" | "UPPER_MID" | "MID" | "SMALL";
}

function buildMockTeam(): MockHolding[] {
  // Deterministic — pulled from the live top-of-pool to look familiar.
  return [
    { domain: "ALERT.ai",       costBasisUsd: 240520, currentFdvUsd: 268900, tier: "PREMIUM" },
    { domain: "TRENCHES.ai",    costBasisUsd:  32504, currentFdvUsd:  93000, tier: "UPPER_MID" },
    { domain: "WINES.xyz",      costBasisUsd:  10879, currentFdvUsd:  34300, tier: "UPPER_MID" },
    { domain: "MISHKA.ai",      costBasisUsd:   3576, currentFdvUsd:   7920, tier: "MID" },
    { domain: "TAXATTORNEYS.xyz", costBasisUsd: 3271, currentFdvUsd:   2950, tier: "MID" },
    { domain: "FOUNDATIONS.xyz",  costBasisUsd: 3094, currentFdvUsd:   2700, tier: "MID" },
    { domain: "cryptobancs.com",  costBasisUsd: 2297, currentFdvUsd:   2810, tier: "MID" },
    { domain: "DISCORDWALLETS.com", costBasisUsd: 1992, currentFdvUsd: 1820, tier: "SMALL" },
    { domain: "fastchain.xyz",   costBasisUsd:   850, currentFdvUsd:   1140, tier: "SMALL" },
    { domain: "kooche.com",      costBasisUsd:   620, currentFdvUsd:    790, tier: "SMALL" },
  ];
}

export default function MyTeamPage() {
  const stats = getPoolStats();
  const round = getRoundInfo();
  const team = buildMockTeam();
  const totalCost = team.reduce((s, h) => s + h.costBasisUsd, 0);
  const totalValue = team.reduce((s, h) => s + h.currentFdvUsd, 0);
  const unspent = stats.budgetUsd - totalCost;
  const grandTotal = totalValue + unspent;
  const pctGrowth = ((grandTotal - stats.budgetUsd) / stats.budgetUsd) * 100;

  return (
    <div className="mx-auto max-w-[1380px] px-6 pt-12 pb-20">
      {/* Header */}
      <div className="mb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2">
          Round {String(round.roundNumber).padStart(2, "0")} · scoring
        </div>
        <h1 className="font-display text-[40px] font-bold tracking-[-0.025em] leading-tight mb-1.5">
          Your portfolio
        </h1>
        <p className="text-[14px] text-muted">
          Lineup locked. Held positions tracked against live FDV until the round resolves.
        </p>
      </div>

      {/* Top-level summary */}
      <section className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-5 mb-10">
        <div className="glass rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Total portfolio
            </span>
            <Countdown to={round.resolvesAt} label="Round resolves" />
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
                from {fmtUsd(stats.budgetUsd, { compact: true })} starting budget
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
            label="Realized this round"
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
              Holdings (10/10) · locked
            </span>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted/70">
            no swaps · results day 10
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {team.map((h) => (
            <HoldingCard key={h.domain} h={h} />
          ))}
        </div>
      </section>
    </div>
  );
}

function HoldingCard({ h }: { h: MockHolding }) {
  const pct = ((h.currentFdvUsd - h.costBasisUsd) / h.costBasisUsd) * 100;
  const positive = pct >= 0;

  return (
    <div className="glass rounded-xl p-4 transition-colors hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[18px] font-semibold truncate leading-tight">
            {h.domain}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <TierBadge tier={h.tier} size="sm" />
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
        <Cell label="Cost basis" value={fmtUsd(h.costBasisUsd, { compact: true })} />
        <Cell label="Current FDV" value={fmtUsd(h.currentFdvUsd, { compact: true })} />
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
