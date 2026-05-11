import {
  getPoolStats,
  getRoundInfo,
  fmtUsd,
  fmtPct,
} from "../_data/tokens";
import { Countdown } from "../_components/Countdown";

interface LeaderRow {
  rank: number;
  handle: string;
  pctGrowth: number;
  totalValueUsd: number;
  topPick: { domain: string; gainPct: number };
  isYou?: boolean;
}

function mockLeaderboard(budget: number): LeaderRow[] {
  // Deterministic mock — never random — so the page is stable to compare across reloads.
  const seed = [
    { handle: "domainwhisperer", pctGrowth: 84.2, top: { domain: "TRENCHES.ai", gainPct: 187 } },
    { handle: "fdvfanatic",      pctGrowth: 71.4, top: { domain: "ALERT.ai", gainPct: 92 } },
    { handle: "gradgang",        pctGrowth: 63.0, top: { domain: "BRAG.com", gainPct: 41 } },
    { handle: "0xponzi",         pctGrowth: 58.8, top: { domain: "WINES.xyz", gainPct: 215 } },
    { handle: "you",             pctGrowth: 51.6, top: { domain: "SOFTWARE.ai", gainPct: 67 }, isYou: true },
    { handle: "boner.fund",      pctGrowth: 47.3, top: { domain: "BONER.com", gainPct: 88 } },
    { handle: "snipechad",       pctGrowth: 39.2, top: { domain: "RIDES.com", gainPct: 31 } },
    { handle: "mishka_holder",   pctGrowth: 33.9, top: { domain: "MISHKA.ai", gainPct: 122 } },
    { handle: "tldmaxi",         pctGrowth: 28.4, top: { domain: "INVESTORS.xyz", gainPct: 19 } },
    { handle: "depin_doge",      pctGrowth: 24.1, top: { domain: "DEPIN.ai", gainPct: 29 } },
    { handle: "hightech_helga",  pctGrowth: 18.7, top: { domain: "HIGHTECH.xyz", gainPct: 14 } },
    { handle: "namesnatch",      pctGrowth: 11.3, top: { domain: "GET.cash", gainPct: 9 } },
    { handle: "fractionfanatic", pctGrowth:  7.0, top: { domain: "TERABYTES.ai", gainPct: 18 } },
    { handle: "swimsuitsanon",   pctGrowth:  3.4, top: { domain: "SWIMSUITS.ai", gainPct: 12 } },
    { handle: "bondingcurve",    pctGrowth: -2.1, top: { domain: "DISCORDWALLETS.com", gainPct: -8 } },
    { handle: "midcurver",       pctGrowth: -6.8, top: { domain: "FOUNDATIONS.xyz", gainPct: -12 } },
  ];
  return seed.map((s, i) => ({
    rank: i + 1,
    handle: s.handle,
    pctGrowth: s.pctGrowth,
    totalValueUsd: budget * (1 + s.pctGrowth / 100),
    topPick: s.top,
    isYou: s.isYou,
  }));
}

export default function LeaderboardPage() {
  const stats = getPoolStats();
  const round = getRoundInfo();
  const rows = mockLeaderboard(stats.budgetUsd);
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="mx-auto max-w-[1380px] px-6 pt-12 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2">
            Round {String(round.roundNumber).padStart(2, "0")} standings
          </div>
          <h1 className="font-display text-[44px] font-bold tracking-[-0.025em] leading-tight">
            Standings
          </h1>
          <p className="text-[14px] text-muted mt-1.5">
            Live ranking by total portfolio growth. Updated daily at 12:00 UTC.
          </p>
        </div>
        <Countdown to={round.resolvesAt} label="Round resolves" />
      </div>

      {/* Podium — top 3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {top3.map((row, i) => (
          <PodiumCard key={row.handle} row={row} place={i + 1} />
        ))}
      </div>

      {/* Rest of the table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="grid grid-cols-[60px_1fr_120px_140px_180px] gap-4 px-5 py-3 border-b border-border/60 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <div className="text-right">Rank</div>
          <div>Player</div>
          <div className="text-right">Growth</div>
          <div className="text-right">Portfolio</div>
          <div className="text-right">Top mover</div>
        </div>
        {rest.map((row) => (
          <div
            key={row.handle}
            className="grid grid-cols-[60px_1fr_120px_140px_180px] gap-4 px-5 py-3 border-b border-border/30 last:border-b-0 transition-colors hover:bg-white/[0.02]"
            style={row.isYou ? { background: "rgba(124,106,255,0.06)" } : undefined}
          >
            <div className="text-right font-mono text-[13px] text-muted/80 tabular-nums">
              {String(row.rank).padStart(2, "0")}
            </div>
            <div className="flex items-center gap-2.5">
              <Avatar handle={row.handle} />
              <span className="font-display text-[14px] font-medium truncate">
                {row.handle}
                {row.isYou && (
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.12em] text-accent">
                    you
                  </span>
                )}
              </span>
            </div>
            <div
              className="text-right font-mono text-[13px] tabular-nums"
              style={{ color: row.pctGrowth > 0 ? "#34d399" : row.pctGrowth < 0 ? "#f87171" : "var(--color-muted)" }}
            >
              {fmtPct(row.pctGrowth, { showSign: true })}
            </div>
            <div className="text-right font-mono text-[13px] tabular-nums text-text">
              {fmtUsd(row.totalValueUsd, { compact: true })}
            </div>
            <div className="text-right">
              <span className="font-display text-[12px] text-text/90">{row.topPick.domain}</span>
              <span
                className="ml-1.5 font-mono text-[11px] tabular-nums"
                style={{ color: row.topPick.gainPct > 0 ? "#34d399" : "#f87171" }}
              >
                {fmtPct(row.topPick.gainPct, { showSign: true })}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-muted/70 font-mono">
        Demo data · live-data wiring in commit two
      </p>
    </div>
  );
}

function PodiumCard({ row, place }: { row: LeaderRow; place: number }) {
  const accents: Record<number, { gradient: string; tone: string; label: string }> = {
    1: { gradient: "linear-gradient(135deg, #f0b340, #d97706)", tone: "#f0b340", label: "1st" },
    2: { gradient: "linear-gradient(135deg, #cbd5e1, #64748b)", tone: "#cbd5e1", label: "2nd" },
    3: { gradient: "linear-gradient(135deg, #d97757, #92400e)", tone: "#d97757", label: "3rd" },
  };
  const a = accents[place];

  return (
    <div
      className="relative rounded-2xl p-5 overflow-hidden"
      style={{
        background: "rgba(13,17,32,0.70)",
        backdropFilter: "blur(20px) saturate(150%)",
        border: `1px solid ${a.tone}33`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: a.gradient }}
      />

      <div className="flex items-center justify-between mb-3">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: a.tone }}
        >
          {a.label}
        </span>
        <Avatar handle={row.handle} large />
      </div>

      <div className="font-display text-[20px] font-bold mb-1 truncate">
        {row.handle}
        {row.isYou && (
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-accent align-middle">
            you
          </span>
        )}
      </div>

      <div
        className="font-mono text-[28px] font-bold tabular-nums leading-tight"
        style={{ color: row.pctGrowth >= 0 ? "#34d399" : "#f87171" }}
      >
        {fmtPct(row.pctGrowth, { showSign: true })}
      </div>

      <div className="mt-3 flex items-baseline justify-between text-[12px] font-mono">
        <span className="text-muted">Portfolio</span>
        <span className="text-text tabular-nums">
          {fmtUsd(row.totalValueUsd, { compact: true })}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-[12px] font-mono">
        <span className="text-muted">Top mover</span>
        <span className="text-text">
          {row.topPick.domain}{" "}
          <span style={{ color: row.topPick.gainPct > 0 ? "#34d399" : "#f87171" }}>
            {fmtPct(row.topPick.gainPct, { showSign: true })}
          </span>
        </span>
      </div>
    </div>
  );
}

function Avatar({ handle, large }: { handle: string; large?: boolean }) {
  // Deterministic colour from the handle.
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) & 0xffffff;
  const hue = Math.abs(h) % 360;
  const size = large ? 36 : 26;
  return (
    <div
      className="rounded-full flex items-center justify-center font-display font-bold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue},70%,55%), hsl(${(hue + 40) % 360},65%,42%))`,
        fontSize: large ? 14 : 11,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
      }}
    >
      {handle.slice(0, 2).toUpperCase()}
    </div>
  );
}
