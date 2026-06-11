/**
 * OG Tournament — single match card.
 *
 * A vs B with current vote tallies, seeds, and the winner (post-resolve).
 */

import { ImageResponse } from "next/og";
import { ogTournamentDb } from "@/lib/og-tournament/supabase";
import { loadCjkFonts } from "@/lib/og-tournament/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const C = {
  bgFrom:      "#070b1a",
  bgMid:       "#0a0e27",
  bgTo:        "#1a0b3d",
  violet:      "#7c6aff",
  violetLight: "#a78bfa",
  white:       "#f8fafc",
  muted:       "#7a89b8",
  amber:       "#f0b340",
  green:       "#34d399",
  rose:        "#f87171",
  cardBg:      "rgba(13,17,32,0.7)",
};

const ROUND_LABEL: Record<string, string> = {
  ROUND_16: "Round of 16",
  QUARTERS: "Quarter Finals",
  SEMIS:    "Semi Finals",
};

function shortNameFor(discordId: string, displayName?: string | null): string {
  // NFKC collapses decorative Unicode variants (e.g. Mathematical Bold "𝐊𝐚𝐫𝐓𝐡𝐢𝐤")
  // back to plain ASCII so they render with any font instead of tofu boxes.
  const clean = displayName?.normalize("NFKC");
  if (clean) return clean.length > 24 ? clean.slice(0, 23) + "…" : clean;
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

export async function GET(
  _req: Request,
  { params }: { params: { tournamentId: string; matchId: string } }
) {
  const tid = parseInt(params.tournamentId, 10);
  const mid = parseInt(params.matchId, 10);
  if (!Number.isFinite(tid) || !Number.isFinite(mid)) {
    return new Response("Invalid params", { status: 400 });
  }

  const db = ogTournamentDb();
  const { data: t } = await db.from("og_tournaments").select("tournament_id, display_name").eq("tournament_id", tid).maybeSingle();
  const { data: match } = await db.from("og_bracket_matches").select("*").eq("match_id", mid).maybeSingle();
  if (!t || !match) return new Response("Not found", { status: 404 });

  // Vote tally
  const { data: tally } = await db
    .from("og_bracket_vote_tally")
    .select("match_id, voted_for_discord_id, votes")
    .eq("match_id", mid);
  let votesA = 0, votesB = 0;
  for (const r of tally ?? []) {
    if (r.voted_for_discord_id === match.competitor_a_id) votesA = Number(r.votes);
    else if (r.voted_for_discord_id === match.competitor_b_id) votesB = Number(r.votes);
  }
  const totalVotes = votesA + votesB;
  const pctA = totalVotes === 0 ? 50 : Math.round((votesA / totalVotes) * 100);
  const pctB = 100 - pctA;

  // Names
  const { data: userRows } = await db
    .from("fantasy_users")
    .select("discord_id, display_name")
    .in("discord_id", [match.competitor_a_id, match.competitor_b_id]);
  const nameById = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.display_name) nameById.set(u.discord_id, u.display_name);
  }
  const nameA = shortNameFor(match.competitor_a_id, nameById.get(match.competitor_a_id) || null);
  const nameB = shortNameFor(match.competitor_b_id, nameById.get(match.competitor_b_id) || null);

  const winnerId = match.winner_id;
  const aWins = winnerId === match.competitor_a_id;
  const bWins = winnerId === match.competitor_b_id;

  const roundLabel = ROUND_LABEL[match.round_name] || match.round_name;

  function Side({
    letter,
    name,
    seed,
    votes,
    pct,
    isWinner,
    side,
  }: {
    letter: string;
    name: string;
    seed: number | null;
    votes: number;
    pct: number;
    isWinner: boolean;
    side: "left" | "right";
  }) {
    const align = side === "left" ? "flex-start" : "flex-end";
    const accent = isWinner ? C.green : C.violet;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: align,
          width: "44%",
          padding: "32px 28px",
          background: isWinner ? "rgba(52,211,153,0.10)" : C.cardBg,
          border: `2px solid ${accent}55`,
          borderRadius: 14,
          position: "relative",
        }}
      >
        {isWinner && (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: -14,
              ...(side === "left" ? { left: 24 } : { right: 24 }),
              background: C.green,
              color: C.white,
              padding: "4px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            WINNER
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 48, fontWeight: 900, color: accent }}>{letter}</span>
          {seed != null && (
            <span style={{ fontSize: 16, color: C.muted, fontFamily: "monospace" }}>
              seed #{seed}
            </span>
          )}
        </div>
        <span style={{ fontSize: 36, color: C.white, fontWeight: 800, marginTop: 14, lineHeight: 1.1, textAlign: side }}>
          {name}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 22 }}>
          <span style={{ fontSize: 48, color: accent, fontFamily: "monospace", fontWeight: 900 }}>
            {pct}%
          </span>
          <span style={{ fontSize: 18, color: C.muted, fontFamily: "monospace" }}>
            ({votes} vote{votes === 1 ? "" : "s"})
          </span>
        </div>
      </div>
    );
  }

  const fonts = await loadCjkFonts();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
          padding: "40px 50px",
          fontFamily: "NotoSansJP, Inter, system-ui, sans-serif",
          color: C.white,
          position: "relative",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 11, color: C.amber, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>
              {t.display_name} OG Tournament
            </span>
            <span style={{ fontSize: 26, color: C.white, fontWeight: 800, marginTop: 4 }}>
              {roundLabel} — Match {match.position}
            </span>
          </div>
          <span style={{ fontSize: 13, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>
            {winnerId ? "Resolved" : "Voting Open"}
          </span>
        </div>

        {/* Match — A vs B */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1 }}>
          <Side
            letter="🅰️"
            name={nameA}
            seed={match.seed_a}
            votes={votesA}
            pct={pctA}
            isWinner={aWins}
            side="left"
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, flexDirection: "column" }}>
            <span style={{ fontSize: 48, color: C.muted, fontWeight: 900, opacity: 0.4 }}>
              vs
            </span>
            <div style={{ display: "flex", marginTop: 16, fontSize: 14, color: C.muted, fontFamily: "monospace" }}>
              {totalVotes} total vote{totalVotes === 1 ? "" : "s"}
            </div>
          </div>
          <Side
            letter="🅱️"
            name={nameB}
            seed={match.seed_b}
            votes={votesB}
            pct={pctB}
            isWinner={bWins}
            side="right"
          />
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.violet}33`, fontSize: 13, color: C.muted, letterSpacing: 1 }}>
          <span style={{ display: "flex" }}>React 🅰️ or 🅱️ on the post to vote · one vote per match</span>
          <span style={{ display: "flex" }}>
            {winnerId ? "" : `Closes: ${new Date(match.closes_at).toUTCString().slice(0, 16)}`}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: { "Cache-Control": "no-store, must-revalidate" },
    }
  );
}
