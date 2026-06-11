/**
 * OG Tournament — live recommendation standings graphic.
 *
 * Posted by `!og stats` in #general-chat. Shows current candidate
 * leaderboard with recommendation counts.
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
  silver:      "#cbd5e1",
  bronze:      "#d97757",
  rowAlt:      "rgba(255,255,255,0.025)",
};

function shortNameFor(discordId: string, displayName?: string | null): string {
  // NFKC collapses decorative Unicode variants (e.g. Mathematical Bold "𝐊𝐚𝐫𝐓𝐡𝐢𝐤")
  // back to plain ASCII so they render with any font instead of tofu boxes.
  const clean = displayName?.normalize("NFKC");
  if (clean) return clean.length > 22 ? clean.slice(0, 21) + "…" : clean;
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

export async function GET(
  req: Request,
  { params }: { params: { tournamentId: string } }
) {
  const tid = parseInt(params.tournamentId, 10);
  if (!Number.isFinite(tid)) {
    return new Response("Invalid tournament id", { status: 400 });
  }

  const debug = new URL(req.url).searchParams.get("debug") === "1";
  const db = ogTournamentDb();
  const { data: t, error: tErr } = await db
    .from("og_tournaments")
    .select("*")
    .eq("tournament_id", tid)
    .maybeSingle();
  if (tErr) console.error("[og-tournament/recommend-stats] og_tournaments error:", tErr);
  if (!t) return new Response("Tournament not found", { status: 404 });

  // Pull tally — sorted desc by count
  const { data: tally, error: tallyErr } = await db
    .from("og_recommendation_tally")
    .select("tournament_id, recommended_discord_id, rec_count, first_recommended_at")
    .eq("tournament_id", tid)
    .order("rec_count", { ascending: false })
    .limit(20);
  if (tallyErr) console.error("[og-tournament/recommend-stats] tally error:", tallyErr);

  const rows = tally ?? [];

  // Total stats
  const totalRecs = rows.reduce((s: number, r: any) => s + Number(r.rec_count), 0);
  const candidates = rows.length;

  // Pull unique voter count
  const { data: voters, error: votersErr } = await db
    .from("og_recommendations")
    .select("tournament_id, recommender_discord_id")
    .eq("tournament_id", tid);
  if (votersErr) console.error("[og-tournament/recommend-stats] voters error:", votersErr);
  const uniqueVoters = new Set((voters ?? []).map((v: any) => v.recommender_discord_id)).size;

  console.log("[og-tournament/recommend-stats] tid=%d rows=%d voters=%d totalRecs=%d", tid, rows.length, uniqueVoters, totalRecs);

  if (debug) {
    // Direct queries against og_recommendations with different filter shapes
    // to isolate the bug. tid is `parseInt(params.tournamentId, 10)` = number 1.
    const [allOgRec, filterTidNum, filterHardcoded1, filterString1, filterFilterFn] = await Promise.all([
      db.from("og_recommendations").select("tournament_id, recommended_discord_id"),
      db.from("og_recommendations").select("tournament_id, recommended_discord_id").eq("tournament_id", tid),
      db.from("og_recommendations").select("tournament_id, recommended_discord_id").eq("tournament_id", 1),
      db.from("og_recommendations").select("tournament_id, recommended_discord_id").eq("tournament_id", "1" as unknown as number),
      db.from("og_recommendations").select("tournament_id, recommended_discord_id").filter("tournament_id", "eq", tid),
    ]);

    // Same for the view
    const [allTally, tallyTidNum, tallyHardcoded1] = await Promise.all([
      db.from("og_recommendation_tally").select("tournament_id, recommended_discord_id, rec_count"),
      db.from("og_recommendation_tally").select("tournament_id, recommended_discord_id, rec_count").eq("tournament_id", tid),
      db.from("og_recommendation_tally").select("tournament_id, recommended_discord_id, rec_count").eq("tournament_id", 1),
    ]);

    // The route's exact failing queries — re-run inline so we can compare
    // their result to the test queries in the same handler execution.
    const routeTallyExact = await db
      .from("og_recommendation_tally")
      .select("recommended_discord_id, rec_count, first_recommended_at")
      .eq("tournament_id", tid)
      .order("rec_count", { ascending: false })
      .limit(20);
    const routeVotersExact = await db
      .from("og_recommendations")
      .select("recommender_discord_id")
      .eq("tournament_id", tid);

    return Response.json({
      tid,
      tid_type: typeof tid,
      env: {
        url_tail: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").slice(-30),
        key_prefix: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 16),
        key_len: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
      },
      // What the route's image-rendering path saw earlier in this same handler:
      route_actual_results: {
        og_tournaments:            { data: t,      error: tErr      },
        og_recommendation_tally:   { data: tally,  error: tallyErr  },
        og_recommendations_voters: { data: voters, error: votersErr },
      },
      // Re-running the route's EXACT failing queries in the debug branch:
      route_queries_re_run: {
        og_recommendation_tally:   { data: routeTallyExact.data,  error: routeTallyExact.error  },
        og_recommendations_voters: { data: routeVotersExact.data, error: routeVotersExact.error },
      },
      og_recommendations_tests: {
        no_filter:                    { data: allOgRec.data,         error: allOgRec.error },
        "eq tournament_id, tid":      { data: filterTidNum.data,     error: filterTidNum.error },
        "eq tournament_id, 1":        { data: filterHardcoded1.data, error: filterHardcoded1.error },
        "eq tournament_id, '1'":      { data: filterString1.data,    error: filterString1.error },
        "filter tournament_id eq tid":{ data: filterFilterFn.data,   error: filterFilterFn.error },
      },
      og_recommendation_tally_tests: {
        no_filter:                    { data: allTally.data,         error: allTally.error },
        "eq tournament_id, tid":      { data: tallyTidNum.data,      error: tallyTidNum.error },
        "eq tournament_id, 1":        { data: tallyHardcoded1.data,  error: tallyHardcoded1.error },
      },
    });
  }

  // Resolve display names from fantasy_users
  const userIds = rows.map((r: any) => r.recommended_discord_id);
  const { data: userRows } = userIds.length
    ? await db.from("fantasy_users").select("discord_id, display_name").in("discord_id", userIds)
    : { data: [] as any[] };
  const nameById = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.display_name) nameById.set(u.discord_id, u.display_name);
  }

  const top16 = rows.slice(0, 16);
  const maxCount = rows[0]?.rec_count || 1;
  const podiumTone = [C.amber, C.silver, C.bronze];

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
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 20% 25%, rgba(240,179,64,0.14) 0%, transparent 45%)",
            display: "flex",
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20, zIndex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, color: C.amber, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>
              {t.display_name} OG Tournament
            </span>
            <span style={{ fontSize: 36, fontWeight: 900, color: C.white, marginTop: 6, letterSpacing: -1 }}>
              Current Standings
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 13, color: C.muted, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600 }}>
              Recommend Phase
            </span>
            <div style={{ display: "flex", gap: 22, marginTop: 6 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: 11, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  Voters
                </span>
                <span style={{ fontSize: 22, color: C.white, fontFamily: "monospace", fontWeight: 800 }}>
                  {uniqueVoters}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: 11, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  Candidates
                </span>
                <span style={{ fontSize: 22, color: C.white, fontFamily: "monospace", fontWeight: 800 }}>
                  {candidates}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: 11, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>
                  Recs
                </span>
                <span style={{ fontSize: 22, color: C.amber, fontFamily: "monospace", fontWeight: 800 }}>
                  {totalRecs}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        {top16.length === 0 ? (
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              color: C.muted,
              zIndex: 1,
            }}
          >
            No recommendations yet — be the first.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, zIndex: 1, flex: 1 }}>
            {top16.map((r: any, i: number) => {
              const name = shortNameFor(r.recommended_discord_id, nameById.get(r.recommended_discord_id) || null);
              const tone = i < 3 ? podiumTone[i] : i < 16 ? C.violetLight : C.muted;
              const barPct = (Number(r.rec_count) / maxCount) * 100;
              return (
                <div
                  key={r.recommended_discord_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 14px",
                    background: i % 2 === 0 ? C.rowAlt : "transparent",
                    borderRadius: 6,
                    gap: 14,
                  }}
                >
                  <div style={{ display: "flex", width: 38, fontSize: 15, color: tone, fontFamily: "monospace", fontWeight: 800 }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div style={{ display: "flex", width: 230, fontSize: 16, color: C.white, fontWeight: 500 }}>
                    {name}
                  </div>
                  <div style={{ display: "flex", flex: 1, height: 14, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ display: "flex", width: `${barPct}%`, height: "100%", background: tone, borderRadius: 4 }} />
                  </div>
                  <div style={{ display: "flex", width: 80, fontSize: 18, color: tone, fontFamily: "monospace", fontWeight: 800, justifyContent: "flex-end" }}>
                    {r.rec_count}
                  </div>
                </div>
              );
            })}
            {rows.length > 16 && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 8, fontSize: 13, color: C.muted, fontStyle: "italic" }}>
                +{rows.length - 16} more candidate{rows.length - 16 === 1 ? "" : "s"} below top-16 cut
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
            paddingTop: 16,
            borderTop: `1px solid ${C.violet}33`,
            fontSize: 13,
            color: C.muted,
            letterSpacing: 1,
            zIndex: 1,
          }}
        >
          <span style={{ display: "flex" }}>
            Top 16 → bracket. Tied at the cut? Earliest first recommendation wins.
          </span>
          <span style={{ display: "flex", fontFamily: "monospace", color: C.amber, fontWeight: 700 }}>
            !recommend @user
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 900,
      fonts,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    }
  );
}
