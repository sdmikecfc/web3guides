/**
 * Doma Lines — winners / final standings image.
 *
 * Posted when the round resolves. Top 3 podium + ranked list.
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
  amber:       "#f0b340",
  silver:      "#cbd5e1",
  bronze:      "#d97757",
  rowAlt:      "rgba(255,255,255,0.025)",
};

function shortNameFor(discordId: string, displayName?: string | null): string {
  if (displayName) return displayName.length > 22 ? displayName.slice(0, 21) + "…" : displayName;
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

  const { data: scores } = await db
    .from("lines_scores")
    .select("*")
    .eq("round_id", roundId);

  const ranked = (scores ?? []).slice().sort((a: any, b: any) => Number(b.score) - Number(a.score));
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3, 13);

  // Resolve names
  const allIds = [...top3, ...rest].map((r: any) => r.discord_id);
  const { data: userRows } = allIds.length
    ? await db.from("fantasy_users").select("discord_id, display_name").in("discord_id", allIds)
    : { data: [] as any[] };
  const nameById = new Map<string, string>();
  for (const u of userRows ?? []) {
    if (u.display_name) nameById.set(u.discord_id, u.display_name);
  }

  const podiumTone = [C.amber, C.silver, C.bronze];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
          padding: "44px 56px",
          fontFamily: "Inter, system-ui, sans-serif",
          color: C.white,
          position: "relative",
        }}
      >
        {/* Glow accents */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 50% 25%, rgba(240,179,64,0.16) 0%, transparent 45%), " +
              "radial-gradient(circle at 90% 90%, rgba(124,106,255,0.18) 0%, transparent 50%)",
            display: "flex",
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28, zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: C.white }}>DOMA</span>
            <span style={{ fontSize: 36, fontWeight: 800, color: C.violetLight }}>PREDICTIONS</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 14, color: C.muted, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>
              🏆 Final Results
            </span>
            <span style={{ fontSize: 14, color: C.violetLight, marginTop: 4, letterSpacing: 2 }}>
              {round.name}
            </span>
          </div>
        </div>

        {/* Podium */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 32, zIndex: 1 }}>
          {top3.map((r: any, i: number) => {
            const tone = podiumTone[i];
            const name = shortNameFor(r.discord_id, nameById.get(r.discord_id) || null);
            const medal = ["🥇", "🥈", "🥉"][i];
            const place = ["1st", "2nd", "3rd"][i];
            return (
              <div
                key={r.discord_id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  padding: "22px 24px",
                  background: "rgba(13,17,32,0.7)",
                  border: `1px solid ${tone}55`,
                  borderRadius: 14,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 4,
                    background: tone,
                    display: "flex",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 32 }}>{medal}</span>
                  <span style={{ fontSize: 14, color: tone, letterSpacing: 3, fontWeight: 800, textTransform: "uppercase" }}>
                    {place}
                  </span>
                </div>
                <span style={{ fontSize: 24, color: C.white, fontWeight: 700, marginTop: 12 }}>
                  {name}
                </span>
                <span
                  style={{
                    fontSize: 36,
                    color: tone,
                    fontFamily: "monospace",
                    fontWeight: 800,
                    marginTop: 8,
                  }}
                >
                  {r.score} pts
                </span>
                <span style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                  {r.correct_count}/{r.resolved_count} correct
                </span>
              </div>
            );
          })}
          {/* Pad podium if fewer than 3 ranked */}
          {Array.from({ length: Math.max(0, 3 - top3.length) }).map((_, i) => (
            <div
              key={`pad-${i}`}
              style={{
                display: "flex",
                flex: 1,
                padding: "22px 24px",
                background: "rgba(13,17,32,0.4)",
                border: "1px dashed rgba(255,255,255,0.08)",
                borderRadius: 14,
              }}
            />
          ))}
        </div>

        {/* Top 10 list */}
        {rest.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, zIndex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 18px",
                gap: 14,
                background: "rgba(124,106,255,0.06)",
                borderRadius: 6,
              }}
            >
              <div style={{ display: "flex", width: 60, fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
                Rank
              </div>
              <div style={{ display: "flex", flex: 1, fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
                Player
              </div>
              <div style={{ display: "flex", width: 100, fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", justifyContent: "flex-end" }}>
                Score
              </div>
              <div style={{ display: "flex", width: 100, fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", justifyContent: "flex-end" }}>
                Correct
              </div>
            </div>
            {rest.map((r: any, i: number) => {
              const name = shortNameFor(r.discord_id, nameById.get(r.discord_id) || null);
              return (
                <div
                  key={r.discord_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 18px",
                    gap: 14,
                    background: i % 2 === 0 ? C.rowAlt : "transparent",
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: "flex", width: 60, fontSize: 16, color: C.muted, fontFamily: "monospace", fontWeight: 700 }}>
                    {String(i + 4).padStart(2, "0")}
                  </div>
                  <div style={{ display: "flex", flex: 1, fontSize: 17, color: C.white, fontWeight: 500 }}>
                    {name}
                  </div>
                  <div style={{ display: "flex", width: 100, fontSize: 17, color: C.violetLight, fontFamily: "monospace", fontWeight: 700, justifyContent: "flex-end" }}>
                    {r.score} pts
                  </div>
                  <div style={{ display: "flex", width: 100, fontSize: 14, color: C.muted, fontFamily: "monospace", justifyContent: "flex-end" }}>
                    {r.correct_count}/{r.resolved_count}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {ranked.length === 0 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, fontSize: 24, color: C.muted, zIndex: 1 }}>
            No teams ranked yet.
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 18, fontSize: 13, color: C.muted, letterSpacing: 1, zIndex: 1 }}>
          <span style={{ display: "flex" }}>{ranked.length} player{ranked.length === 1 ? "" : "s"} ranked</span>
          <span style={{ display: "flex" }}>doma.xyz · doma lines</span>
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
