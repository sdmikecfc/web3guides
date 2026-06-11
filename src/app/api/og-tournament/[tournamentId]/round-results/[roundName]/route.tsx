/**
 * OG Tournament — round results image.
 *
 * Posted when a round closes. Lists winners from each match in that round.
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
  rowAlt:      "rgba(255,255,255,0.025)",
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
  if (clean) return clean.length > 18 ? clean.slice(0, 17) + "…" : clean;
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

export async function GET(
  _req: Request,
  { params }: { params: { tournamentId: string; roundName: string } }
) {
  const tid = parseInt(params.tournamentId, 10);
  if (!Number.isFinite(tid)) return new Response("Invalid tournament id", { status: 400 });
  const roundName = params.roundName?.toUpperCase();
  if (!ROUND_LABEL[roundName]) return new Response("Invalid round", { status: 400 });

  const db = ogTournamentDb();
  const { data: t } = await db.from("og_tournaments").select("tournament_id, display_name").eq("tournament_id", tid).maybeSingle();
  if (!t) return new Response("Tournament not found", { status: 404 });

  const { data: matches } = await db
    .from("og_bracket_matches")
    .select("*")
    .eq("tournament_id", tid)
    .eq("round_name", roundName)
    .order("position", { ascending: true });
  const list = matches ?? [];

  // Collect votes per match for display
  const matchIds = list.map((m: any) => m.match_id);
  const { data: tallies } = matchIds.length
    ? await db.from("og_bracket_vote_tally").select("match_id, voted_for_discord_id, votes").in("match_id", matchIds)
    : { data: [] as any[] };
  const tallyByMatch = new Map<number, { a: number; b: number }>();
  for (const m of list) tallyByMatch.set(m.match_id, { a: 0, b: 0 });
  for (const row of tallies ?? []) {
    const m = list.find((x: any) => x.match_id === row.match_id);
    if (!m) continue;
    const bucket = tallyByMatch.get(m.match_id)!;
    if (row.voted_for_discord_id === m.competitor_a_id) bucket.a = Number(row.votes);
    else if (row.voted_for_discord_id === m.competitor_b_id) bucket.b = Number(row.votes);
  }

  // Names
  const allIds = new Set<string>();
  for (const m of list) { allIds.add(m.competitor_a_id); allIds.add(m.competitor_b_id); }
  const { data: userRows } = allIds.size
    ? await db.from("fantasy_users").select("discord_id, display_name").in("discord_id", Array.from(allIds))
    : { data: [] as any[] };
  const nameById = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.display_name) nameById.set(u.discord_id, u.display_name);
  }

  const label = ROUND_LABEL[roundName];

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 12, color: C.amber, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>
              {t.display_name} OG Tournament
            </span>
            <span style={{ fontSize: 36, color: C.white, fontWeight: 900, marginTop: 4, letterSpacing: -1 }}>
              {label} — Results
            </span>
          </div>
          <span style={{ fontSize: 13, color: C.green, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
            ✅ Round Resolved
          </span>
        </div>

        {/* Match grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {list.map((m: any) => {
            const t = tallyByMatch.get(m.match_id) || { a: 0, b: 0 };
            const aName = shortNameFor(m.competitor_a_id, nameById.get(m.competitor_a_id) || null);
            const bName = shortNameFor(m.competitor_b_id, nameById.get(m.competitor_b_id) || null);
            const winnerId = m.winner_id;
            const aWins = winnerId === m.competitor_a_id;
            const bWins = winnerId === m.competitor_b_id;

            return (
              <div
                key={m.match_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 18px",
                  background: C.cardBg,
                  borderRadius: 8,
                  border: `1px solid ${C.violet}33`,
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", width: 42, fontSize: 14, color: C.muted, fontFamily: "monospace", fontWeight: 700 }}>
                  M{m.position}
                </div>
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    background: aWins ? "rgba(52,211,153,0.10)" : "transparent",
                    borderRadius: 4,
                  }}
                >
                  {m.seed_a && (
                    <span style={{ display: "flex", fontSize: 11, color: C.muted, fontFamily: "monospace", width: 22 }}>
                      #{m.seed_a}
                    </span>
                  )}
                  <span style={{ display: "flex", fontSize: 16, color: aWins ? C.green : C.white, fontWeight: aWins ? 800 : 500, flex: 1 }}>
                    {aName}
                  </span>
                  <span style={{ display: "flex", fontSize: 16, color: aWins ? C.green : C.muted, fontFamily: "monospace", fontWeight: 700 }}>
                    {t.a}
                  </span>
                </div>
                <span style={{ display: "flex", fontSize: 14, color: C.muted, fontWeight: 700 }}>vs</span>
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    background: bWins ? "rgba(52,211,153,0.10)" : "transparent",
                    borderRadius: 4,
                  }}
                >
                  {m.seed_b && (
                    <span style={{ display: "flex", fontSize: 11, color: C.muted, fontFamily: "monospace", width: 22 }}>
                      #{m.seed_b}
                    </span>
                  )}
                  <span style={{ display: "flex", fontSize: 16, color: bWins ? C.green : C.white, fontWeight: bWins ? 800 : 500, flex: 1 }}>
                    {bName}
                  </span>
                  <span style={{ display: "flex", fontSize: 16, color: bWins ? C.green : C.muted, fontFamily: "monospace", fontWeight: 700 }}>
                    {t.b}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.violet}33`, fontSize: 13, color: C.muted, letterSpacing: 1 }}>
          <span style={{ display: "flex" }}>{list.length} match{list.length === 1 ? "" : "es"} resolved</span>
          <span style={{ display: "flex" }}>
            {roundName === "SEMIS" ? "→ winners announced May 29" :
             roundName === "QUARTERS" ? "→ Semi Finals open next" :
             "→ Quarter Finals open next"}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 900,
      fonts,
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    }
  );
}
