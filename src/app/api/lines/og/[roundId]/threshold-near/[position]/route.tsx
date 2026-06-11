/**
 * Doma Predictions — threshold-near alert image.
 *
 * Posted in #general-chat when a YES/NO holders/subdomains question gets
 * within 5% of its threshold during voting. Throttled by the bot to max
 * 5 alerts per question per round, 60-min cooldowns. Designed to drive
 * urgency without being spammy.
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
  amberDeep:   "#d97706",
  green:       "#34d399",
  rose:        "#f87171",
};

function fmtInt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US");
}

export async function GET(
  _req: Request,
  { params }: { params: { roundId: string; position: string } }
) {
  const roundId = parseInt(params.roundId, 10);
  const position = parseInt(params.position, 10);
  if (!Number.isFinite(roundId) || !Number.isFinite(position)) {
    return new Response("Invalid params", { status: 400 });
  }

  const db = fantasyDb();

  const { data: round } = await db
    .from("lines_rounds")
    .select("name, voting_locks_at")
    .eq("round_id", roundId)
    .maybeSingle();
  if (!round) return new Response("Round not found", { status: 404 });

  const { data: question } = await db
    .from("lines_questions")
    .select("*")
    .eq("round_id", roundId)
    .eq("position", position)
    .maybeSingle();
  if (!question) return new Response("Question not found", { status: 404 });

  // Pick counts for the picks-split readout
  const { data: picks } = await db
    .from("lines_picks")
    .select("answer")
    .eq("question_id", question.question_id);
  const yesCount = (picks ?? []).filter((p: { answer: string }) => p.answer === "YES").length;
  const noCount  = (picks ?? []).filter((p: { answer: string }) => p.answer === "NO").length;

  // Current value comes via querystring (?current=NNNN) since the bot already
  // has it in memory. Falls back to "—" if missing so the image still renders.
  const url = new URL(_req.url);
  const currentRaw = url.searchParams.get("current");
  const current = currentRaw !== null ? Number(currentRaw) : null;

  const rd = (question.resolution_data ?? {}) as { threshold?: number; domain_name?: string };
  const threshold = Number(rd.threshold ?? 0);
  const gap       = current !== null ? Math.max(0, threshold - current) : null;
  const pct       = current !== null && threshold > 0
    ? Math.min(100, Math.max(0, (current / threshold) * 100))
    : 0;
  const pctToGo   = gap !== null && threshold > 0
    ? ((gap / threshold) * 100).toFixed(1)
    : null;

  // Voting lock countdown — humanized
  const locksMs = new Date(round.voting_locks_at).getTime();
  const nowMs   = Date.now();
  const remainMs = Math.max(0, locksMs - nowMs);
  const hours = Math.floor(remainMs / (60 * 60 * 1000));
  const mins  = Math.floor((remainMs % (60 * 60 * 1000)) / (60 * 1000));
  const lockLabel = hours >= 24
    ? `${Math.floor(hours / 24)}d ${hours % 24}h`
    : hours >= 1
      ? `${hours}h ${mins}m`
      : `${mins}m`;

  const metricLabel = question.resolution_type === "subdomains_gte" ? "SUBDOMAINS" : "HOLDERS";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgMid} 50%, ${C.bgTo} 100%)`,
          padding: "50px 60px",
          fontFamily: "Inter, system-ui, sans-serif",
          color: C.white,
          position: "relative",
        }}
      >
        {/* Side accent */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 8,
            background: C.amber,
            display: "flex",
          }}
        />

        {/* Brand stripe */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 24 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.white }}>DOMA</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.violetLight }}>PREDICTIONS</span>
          <span style={{ fontSize: 12, color: C.muted, letterSpacing: 3, marginLeft: 14, textTransform: "uppercase" }}>
            {round.name}
          </span>
        </div>

        {/* Heat headline */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
          <span style={{ fontSize: 18, color: C.amber, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700 }}>
            🔥 Question {question.position} · close to threshold
          </span>
        </div>

        {/* Question prompt */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "20px 26px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            border: `1px solid ${C.amber}33`,
            marginBottom: 26,
          }}
        >
          <span style={{ fontSize: 28, color: C.white, lineHeight: 1.25, fontWeight: 600 }}>
            {question.prompt}
          </span>
        </div>

        {/* Big number row: current / threshold */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginBottom: 16 }}>
          <span
            style={{
              fontSize: 86,
              fontWeight: 900,
              color: C.amber,
              fontFamily: "ui-monospace, monospace",
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            {current !== null ? fmtInt(current) : "—"}
          </span>
          <span style={{ fontSize: 36, color: C.muted, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>
            / {fmtInt(threshold)}
          </span>
          <span style={{ fontSize: 14, color: C.muted, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600, marginLeft: 6 }}>
            {metricLabel}
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 18,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 9,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              width: `${pct}%`,
              height: "100%",
              background: `linear-gradient(90deg, ${C.amberDeep} 0%, ${C.amber} 100%)`,
            }}
          />
        </div>

        {/* Gap callout */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 26 }}>
          {gap !== null ? (
            <>
              <span style={{ fontSize: 22, color: C.white, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>
                +{fmtInt(gap)} to cross
              </span>
              {pctToGo !== null && (
                <span style={{ fontSize: 16, color: C.muted }}>
                  · {pctToGo}% to go
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 22, color: C.muted, fontFamily: "ui-monospace, monospace" }}>
              gap pending
            </span>
          )}
        </div>

        {/* Picks split + countdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, color: C.muted, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600 }}>
              Picks so far
            </span>
            <div style={{ display: "flex", gap: 24, marginTop: 6, alignItems: "center" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 14px",
                background: "rgba(52,211,153,0.12)",
                border: `1px solid ${C.green}55`,
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 14, color: C.green, fontWeight: 800, letterSpacing: 2 }}>YES</span>
                <span style={{ fontSize: 24, color: C.green, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>
                  {yesCount}
                </span>
              </div>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 14px",
                background: "rgba(248,113,113,0.12)",
                border: `1px solid ${C.rose}55`,
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 14, color: C.rose, fontWeight: 800, letterSpacing: 2 }}>NO</span>
                <span style={{ fontSize: 24, color: C.rose, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>
                  {noCount}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto", alignItems: "flex-end" }}>
            <span style={{ fontSize: 13, color: C.muted, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600 }}>
              Voting locks in
            </span>
            <span style={{ fontSize: 26, color: C.violetLight, fontWeight: 800, fontFamily: "ui-monospace, monospace", marginTop: 6 }}>
              {lockLabel}
            </span>
          </div>
        </div>

        {/* Footer accent */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${C.amber} 0%, transparent 70%)`,
            display: "flex",
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Short cache — current value is querystring so each call is unique.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
