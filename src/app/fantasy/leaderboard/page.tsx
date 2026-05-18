import { redirect } from "next/navigation";
import { readSession } from "@/lib/fantasy/session";
import { fantasyDb } from "@/lib/fantasy/supabase";
import { getLatestRound } from "@/lib/fantasy/db";
import { getAllTokensByAddress } from "@/lib/fantasy/doma";
import { fmtUsd, fmtPct } from "../_data/tokens";
import { Countdown } from "../_components/Countdown";

export const dynamic = "force-dynamic";

interface LeaderRow {
  discordId: string;
  shortName: string;
  totalValueUsd: number;
  pctGrowth: number;
  topMover: { domain: string; gainPct: number } | null;
  isYou: boolean;
}

function shortNameFor(discordId: string): string {
  // Last 4 digits — enough to distinguish users without exposing full ID.
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

export default async function LeaderboardPage() {
  // Public page — session is optional. If logged in, we highlight "you".
  const session = readSession();

  const round = await getLatestRound();
  if (!round) return <EmptyState title="No round yet" body="The first round will open soon." />;

  // During DRAFTING and before, there are no portfolio values to show.
  // This is the bug that was scaring people — fake leaderboard during draft.
  if (round.status === "UPCOMING") {
    return (
      <EmptyState
        title="Round hasn't started"
        body={`${round.name} opens for drafting soon. Standings appear once lineups lock and scoring begins.`}
        countdown={{ to: round.draft_opens_at, label: "Draft opens" }}
      />
    );
  }

  if (round.status === "DRAFTING") {
    return (
      <EmptyState
        title="Draft in progress"
        body="Standings will appear once lineups lock and the scoring window begins. Right now everyone's still picking."
        countdown={{ to: round.draft_locks_at, label: "Lineups lock" }}
      />
    );
  }

  // ACTIVE or COMPLETE — compute real leaderboard from fantasy_holdings.
  const db = fantasyDb();
  const { data: holdings, error } = await db
    .from("fantasy_holdings")
    .select("discord_id, token_address, domain_name, cost_basis_fdv_usd")
    .eq("round_id", round.round_id);

  if (error) {
    return <EmptyState title="Couldn't load standings" body={error.message} />;
  }
  if (!holdings || holdings.length === 0) {
    return <EmptyState title="No teams locked in" body="Standings appear once players draft." />;
  }

  // Mark each holding to live FDV.
  const liveByAddr = await getAllTokensByAddress();

  // Group by user.
  const byUser = new Map<string, typeof holdings>();
  for (const h of holdings) {
    if (!byUser.has(h.discord_id)) byUser.set(h.discord_id, []);
    byUser.get(h.discord_id)!.push(h);
  }

  // Fetch Discord display names from fantasy_users (set by bot on !fantasy enter)
  const userIds = Array.from(byUser.keys());
  const { data: userRows } = await db
    .from("fantasy_users")
    .select("discord_id, display_name")
    .in("discord_id", userIds);
  const nameById = new Map<string, string>();
  for (const u of userRows || []) {
    if (u.display_name) nameById.set(u.discord_id, u.display_name);
  }

  const budget = Number(round.budget_usd);
  const rows: LeaderRow[] = [];
  for (const [discordId, userHoldings] of Array.from(byUser.entries())) {
    let holdingsValue = 0;
    let costBasis = 0;
    let topMover: { domain: string; gainPct: number } | null = null;
    for (const h of userHoldings) {
      const live = liveByAddr.get(String(h.token_address).toLowerCase());
      const liveFdv = Number(live?.currentFDV ?? h.cost_basis_fdv_usd);
      holdingsValue += liveFdv;
      const cost = Number(h.cost_basis_fdv_usd);
      costBasis += cost;
      const gainPct = cost > 0 ? ((liveFdv - cost) / cost) * 100 : 0;
      if (!topMover || gainPct > topMover.gainPct) {
        topMover = { domain: h.domain_name, gainPct };
      }
    }
    const unspent = budget - costBasis;
    const totalValueUsd = holdingsValue + unspent;
    const pctGrowth = budget > 0 ? ((totalValueUsd - budget) / budget) * 100 : 0;
    rows.push({
      discordId,
      shortName: nameById.get(discordId) || shortNameFor(discordId),
      totalValueUsd,
      pctGrowth,
      topMover,
      isYou: session ? discordId === session.sub : false,
    });
  }

  rows.sort((a, b) => b.totalValueUsd - a.totalValueUsd);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="mx-auto max-w-[1380px] px-6 pt-12 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2">
            {round.name} · {round.status === "COMPLETE" ? "final results" : "live standings"}
          </div>
          <h1 className="font-display text-[44px] font-bold tracking-[-0.025em] leading-tight">
            Standings
          </h1>
          <p className="text-[14px] text-muted mt-1.5">
            {rows.length} {rows.length === 1 ? "team" : "teams"} · live FDV mark-to-market
          </p>
        </div>
        {round.status === "ACTIVE" && (
          <Countdown to={round.resolves_at} label="Round resolves" />
        )}
      </div>

      {top3.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {top3.map((row, i) => (
            <PodiumCard key={row.discordId} row={row} place={i + 1} />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="grid grid-cols-[60px_1fr_120px_140px_180px] gap-4 px-5 py-3 border-b border-border/60 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <div className="text-right">Rank</div>
            <div>Player</div>
            <div className="text-right">Growth</div>
            <div className="text-right">Portfolio</div>
            <div className="text-right">Top mover</div>
          </div>
          {rest.map((row, idx) => (
            <div
              key={row.discordId}
              className="grid grid-cols-[60px_1fr_120px_140px_180px] gap-4 px-5 py-3 border-b border-border/30 last:border-b-0 transition-colors hover:bg-white/[0.02]"
              style={row.isYou ? { background: "rgba(124,106,255,0.06)" } : undefined}
            >
              <div className="text-right font-mono text-[13px] text-muted/80 tabular-nums">
                {String(idx + 4).padStart(2, "0")}
              </div>
              <div className="flex items-center gap-2.5">
                <Avatar handle={row.shortName} />
                <span className="font-display text-[14px] font-medium truncate">
                  {row.shortName}
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
                {row.topMover ? (
                  <>
                    <span className="font-display text-[12px] text-text/90">{row.topMover.domain}</span>
                    <span
                      className="ml-1.5 font-mono text-[11px] tabular-nums"
                      style={{ color: row.topMover.gainPct > 0 ? "#34d399" : "#f87171" }}
                    >
                      {fmtPct(row.topMover.gainPct, { showSign: true })}
                    </span>
                  </>
                ) : (
                  <span className="text-muted/60">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[11px] text-muted/70 font-mono">
        names shown as <span className="text-text/80">user-XXXX</span> (last 4 digits of Discord ID) until usernames sync
      </p>
    </div>
  );
}

/* ───────────────── components ───────────────── */

function EmptyState({
  title,
  body,
  countdown,
}: {
  title: string;
  body: string;
  countdown?: { to: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 pt-24 pb-20">
      <div className="glass rounded-2xl p-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-3">
          Standings
        </div>
        <h1 className="font-display text-[32px] font-bold tracking-[-0.025em] leading-tight mb-3">
          {title}
        </h1>
        <p className="text-[15px] text-muted leading-relaxed mb-6">{body}</p>
        {countdown && <Countdown to={countdown.to} label={countdown.label} />}
      </div>
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
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: a.gradient }} />

      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: a.tone }}>
          {a.label}
        </span>
        <Avatar handle={row.shortName} large />
      </div>

      <div className="font-display text-[20px] font-bold mb-1 truncate">
        {row.shortName}
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
        <span className="text-text tabular-nums">{fmtUsd(row.totalValueUsd, { compact: true })}</span>
      </div>
      {row.topMover && (
        <div className="mt-1 flex items-baseline justify-between text-[12px] font-mono">
          <span className="text-muted">Top mover</span>
          <span className="text-text">
            {row.topMover.domain}{" "}
            <span style={{ color: row.topMover.gainPct > 0 ? "#34d399" : "#f87171" }}>
              {fmtPct(row.topMover.gainPct, { showSign: true })}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function Avatar({ handle, large }: { handle: string; large?: boolean }) {
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
      {handle.slice(-2).toUpperCase()}
    </div>
  );
}
