/**
 * Doma Predictions — live leaderboard page (public).
 *
 *   /predictions/[roundId]/standings
 *
 * No auth required — anyone can check the current standings. Cached for ~60s
 * at the CDN level so the DB doesn't get hammered by power-users refreshing
 * every few seconds.
 */

import { fantasyDb } from "@/lib/fantasy/supabase";

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";
// Cache hint for Vercel — serves stale from edge for up to 5 min while
// revalidating in the background. Keeps DB load minimal.
export const revalidate = 60;

const C = {
  bgFrom:  "#070b1a",
  bgMid:   "#0a0e27",
  bgTo:    "#1a0b3d",
  amber:   "#f0b340",
  violet:  "#a78bfa",
  white:   "#f8fafc",
  muted:   "#7a89b8",
  silver:  "#cbd5e1",
  bronze:  "#d97757",
  rowAlt:  "rgba(255,255,255,0.03)",
};

function normalize(name?: string | null): string {
  if (!name) return "";
  return String(name).normalize("NFKC");
}
function shortName(discordId: string, displayName?: string | null) {
  const n = normalize(displayName);
  if (n) return n.length > 24 ? n.slice(0, 23) + "…" : n;
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

export default async function PredictionsStandingsPage({
  params,
}: { params: { roundId: string } }) {
  const roundId = parseInt(params.roundId, 10);
  if (!Number.isFinite(roundId)) {
    return <ErrorState title="Invalid round" body="That round id doesn't look right." />;
  }

  const db = fantasyDb();

  const { data: round } = await db
    .from("lines_rounds").select("*").eq("round_id", roundId).maybeSingle();
  if (!round) return <ErrorState title="Round not found" body="No round with that id." />;

  const { data: questions } = await db
    .from("lines_questions").select("question_id, position, points, question_type, resolved_outcome, numeric_actual, prompt")
    .eq("round_id", roundId).order("position", { ascending: true });

  const { data: scoreRows } = await db
    .from("lines_scores").select("*")
    .eq("round_id", roundId).order("score", { ascending: false });
  const scores = scoreRows ?? [];

  // Resolve display names in one shot
  const ids = scores.map((s: { discord_id: string }) => s.discord_id);
  const { data: users } = ids.length
    ? await db.from("fantasy_users").select("discord_id, display_name").in("discord_id", ids)
    : { data: [] as { discord_id: string; display_name: string | null }[] };
  const nameById = new Map((users ?? []).map((u) => [u.discord_id, u.display_name]));

  const resolvedCount = (questions ?? []).filter(
    (q) => q.resolved_outcome !== null || q.numeric_actual !== null
  ).length;

  const totalPlayers = scores.length;
  const top3 = scores.slice(0, 3);
  const rest = scores.slice(3, 20);

  return (
    <main style={{
      minHeight: "100vh",
      background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
      color: C.white,
      fontFamily: "Inter, system-ui, sans-serif",
      padding: "32px 16px 64px",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 12, color: C.amber, letterSpacing: 4,
            textTransform: "uppercase", fontWeight: 700, marginBottom: 8,
          }}>
            📊 Doma Predictions · Live Standings
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, marginBottom: 8 }}>
            {round.name}
          </h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            {totalPlayers} player{totalPlayers === 1 ? "" : "s"} · {resolvedCount}/{questions?.length ?? 0} questions resolved · status: <b style={{ color: C.violet }}>{round.status}</b>
          </p>
        </div>

        {/* Podium */}
        {top3.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
            {top3.map((s, i) => {
              const medal = ["🥇", "🥈", "🥉"][i];
              const tone = [C.amber, C.silver, C.bronze][i];
              return (
                <div key={s.discord_id} style={{
                  padding: "18px 14px",
                  background: "rgba(13,17,32,0.7)",
                  border: `1.5px solid ${tone}55`,
                  borderRadius: 12,
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0,
                    height: 3, background: tone,
                  }} />
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{medal}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.white, lineHeight: 1.2 }}>
                    {shortName(s.discord_id, nameById.get(s.discord_id))}
                  </div>
                  <div style={{
                    fontSize: 22, color: tone, fontFamily: "ui-monospace, monospace",
                    fontWeight: 800, marginTop: 4,
                  }}>
                    {s.score} pts
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {s.correct_count}/{s.resolved_count} correct
                    {s.has_fomo && <span style={{ color: C.amber, marginLeft: 6 }}>⚡ FOMO</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rest of leaderboard */}
        {rest.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "60px 1fr 100px 100px",
              gap: 12, padding: "10px 14px",
              fontSize: 11, color: C.muted, fontWeight: 700,
              letterSpacing: 1.5, textTransform: "uppercase",
            }}>
              <div>Rank</div>
              <div>Player</div>
              <div style={{ textAlign: "right" }}>Score</div>
              <div style={{ textAlign: "right" }}>Correct</div>
            </div>
            {rest.map((s, i) => (
              <div key={s.discord_id} style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 100px 100px",
                gap: 12,
                alignItems: "center",
                padding: "10px 14px",
                background: i % 2 === 0 ? C.rowAlt : "transparent",
                borderRadius: 6,
              }}>
                <div style={{
                  fontSize: 14, color: C.muted, fontFamily: "ui-monospace, monospace",
                  fontWeight: 700,
                }}>
                  {String(i + 4).padStart(2, "0")}
                </div>
                <div style={{ fontSize: 15, color: C.white }}>
                  {shortName(s.discord_id, nameById.get(s.discord_id))}
                  {s.has_fomo && <span style={{ color: C.amber, marginLeft: 6, fontSize: 12 }}>⚡</span>}
                </div>
                <div style={{
                  fontSize: 17, color: C.violet, fontFamily: "ui-monospace, monospace",
                  fontWeight: 700, textAlign: "right",
                }}>
                  {s.score} pts
                </div>
                <div style={{
                  fontSize: 13, color: C.muted, fontFamily: "ui-monospace, monospace",
                  textAlign: "right",
                }}>
                  {s.correct_count}/{s.resolved_count}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPlayers === 0 && (
          <div style={{
            padding: "40px 20px", textAlign: "center",
            color: C.muted, fontSize: 16, fontStyle: "italic",
          }}>
            No picks submitted yet — be the first.
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 36, padding: "14px 18px",
          background: "rgba(124,106,255,0.06)",
          border: `1px solid ${C.violet}33`,
          borderRadius: 8,
          fontSize: 13, color: C.muted, lineHeight: 1.5,
        }}>
          <b style={{ color: C.violet }}>Standings update every minute.</b><br />
          Hard refresh to see the latest. Score = base points + FOMO bonus (if your FOMO pick scored anything).
        </div>
      </div>
    </main>
  );
}

function ErrorState({ title, body }: { title: string; body: string }) {
  return (
    <main style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
      color: C.white, fontFamily: "Inter, system-ui, sans-serif",
      padding: 32,
    }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>{title}</h1>
        <p style={{ color: C.silver, fontSize: 16, lineHeight: 1.55 }}>{body}</p>
      </div>
    </main>
  );
}
