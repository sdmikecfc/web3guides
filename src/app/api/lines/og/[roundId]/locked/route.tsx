/**
 * Doma Lines — picks-locked matrix image.
 *
 * Posted at voting lock. Shows the full pick matrix for everyone who
 * voted, plus crowd lean per question. Designed to be the public
 * reveal moment.
 */

import { ImageResponse } from "next/og";
import { fantasyDb } from "@/lib/fantasy/supabase";

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
  green:       "#34d399",
  rose:        "#f87171",
  amber:       "#f0b340",
  rowAlt:      "rgba(255,255,255,0.025)",
};

function shortNameFor(discordId: string, displayName?: string | null): string {
  if (displayName) return displayName.length > 14 ? displayName.slice(0, 13) + "…" : displayName;
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

export async function GET(
  _req: Request,
  { params }: { params: { roundId: string } }
) {
  const roundId = parseInt(params.roundId, 10);
  if (!Number.isFinite(roundId)) {
    return new Response("Invalid round id", { status: 400 });
  }

  const db = fantasyDb();

  const { data: round } = await db
    .from("lines_rounds")
    .select("*")
    .eq("round_id", roundId)
    .maybeSingle();
  if (!round) return new Response("Round not found", { status: 404 });

  const { data: questions } = await db
    .from("lines_questions")
    .select("question_id, position")
    .eq("round_id", roundId)
    .order("position", { ascending: true });
  const qs = questions ?? [];

  const { data: allPicks } = await db
    .from("lines_picks")
    .select("discord_id, question_id, answer")
    .eq("round_id", roundId);

  // Group by user
  const qIdToPos = new Map<number, number>(qs.map((q: any) => [q.question_id, q.position]));
  const picksByUser = new Map<string, Record<number, string>>();
  for (const p of allPicks ?? []) {
    const pos = qIdToPos.get(p.question_id);
    if (!pos) continue;
    if (!picksByUser.has(p.discord_id)) picksByUser.set(p.discord_id, {});
    picksByUser.get(p.discord_id)![pos] = p.answer;
  }

  const userIds = Array.from(picksByUser.keys());

  // Resolve names
  const { data: userRows } = userIds.length
    ? await db.from("fantasy_users").select("discord_id, display_name").in("discord_id", userIds)
    : { data: [] as any[] };
  const nameById = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.display_name) nameById.set(u.discord_id, u.display_name);
  }

  // Sort users alphabetically by display name
  userIds.sort((a, b) =>
    shortNameFor(a, nameById.get(a) || null).localeCompare(shortNameFor(b, nameById.get(b) || null))
  );

  // Crowd lean per question
  const positions = qs.map((q: any) => q.position).sort((a: number, b: number) => a - b);
  const crowdLean = positions.map((pos: number) => {
    let yes = 0, total = 0;
    for (const uid of userIds) {
      const ans = picksByUser.get(uid)?.[pos];
      if (ans) { total++; if (ans === "YES") yes++; }
    }
    return total === 0 ? null : Math.round((yes / total) * 100);
  });

  // Visible rows — cap to 18 to fit
  const visibleUsers = userIds.slice(0, 18);

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
          fontFamily: "Inter, system-ui, sans-serif",
          color: C.white,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: C.white }}>DOMA</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: C.violetLight }}>PREDICTIONS</span>
            <span style={{ fontSize: 12, color: C.muted, letterSpacing: 3, marginLeft: 16, textTransform: "uppercase" }}>
              {round.name}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 13, color: C.violetLight, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
              🔒 Picks Locked
            </span>
            <span style={{ fontSize: 14, color: C.muted, marginTop: 4, fontFamily: "monospace" }}>
              {userIds.length} player{userIds.length === 1 ? "" : "s"} in
            </span>
          </div>
        </div>

        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 14px",
            background: "rgba(124,106,255,0.08)",
            borderRadius: 6,
            gap: 6,
            marginBottom: 4,
          }}
        >
          <div style={{ display: "flex", width: 160, fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
            Player
          </div>
          {positions.map((pos: number) => (
            <div
              key={pos}
              style={{
                display: "flex",
                width: 70,
                fontSize: 13,
                color: C.muted,
                fontFamily: "monospace",
                fontWeight: 700,
                justifyContent: "center",
              }}
            >
              Q{pos}
            </div>
          ))}
        </div>

        {/* User rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
          {visibleUsers.map((uid, i) => (
            <div
              key={uid}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "5px 14px",
                background: i % 2 === 0 ? C.rowAlt : "transparent",
                borderRadius: 4,
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 160,
                  fontSize: 14,
                  color: C.white,
                  fontWeight: 500,
                  overflow: "hidden",
                }}
              >
                {shortNameFor(uid, nameById.get(uid) || null)}
              </div>
              {positions.map((pos: number) => {
                const ans = picksByUser.get(uid)?.[pos];
                const color = ans === "YES" ? C.green : ans === "NO" ? C.rose : C.muted;
                return (
                  <div
                    key={pos}
                    style={{
                      display: "flex",
                      width: 70,
                      fontSize: 16,
                      color,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      justifyContent: "center",
                    }}
                  >
                    {ans ? ans.charAt(0) : "–"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Crowd lean row */}
        {userIds.length > 18 && (
          <div style={{ display: "flex", fontSize: 12, color: C.muted, marginTop: 8, marginLeft: 14 }}>
            + {userIds.length - 18} more
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 14px",
            marginTop: 8,
            background: "rgba(240,179,64,0.06)",
            borderRadius: 6,
            border: `1px solid ${C.amber}33`,
            gap: 6,
          }}
        >
          <div style={{ display: "flex", width: 160, fontSize: 12, color: C.amber, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
            Crowd
          </div>
          {crowdLean.map((pct, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                width: 70,
                fontSize: 13,
                color: C.amber,
                fontFamily: "monospace",
                fontWeight: 700,
                justifyContent: "center",
              }}
            >
              {pct === null ? "–" : `${pct}%Y`}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 900,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    }
  );
}
