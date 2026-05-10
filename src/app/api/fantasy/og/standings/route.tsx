import { ImageResponse } from "next/og";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const TONES: Record<number, string> = {
  1: "#f0b340",
  2: "#cbd5e1",
  3: "#d97757",
};

interface Row {
  rank: number;
  handle: string;
  pct: number;
  topPick: string;
}

const SAMPLE: Row[] = [
  { rank: 1,  handle: "domainwhisperer", pct:  84.2, topPick: "TRENCHES.ai" },
  { rank: 2,  handle: "fdvfanatic",      pct:  71.4, topPick: "ALERT.ai" },
  { rank: 3,  handle: "gradgang",        pct:  63.0, topPick: "BRAG.com" },
  { rank: 4,  handle: "0xponzi",         pct:  58.8, topPick: "WINES.xyz" },
  { rank: 5,  handle: "you",             pct:  51.6, topPick: "SOFTWARE.ai" },
  { rank: 6,  handle: "boner.fund",      pct:  47.3, topPick: "BONER.com" },
  { rank: 7,  handle: "snipechad",       pct:  39.2, topPick: "RIDES.com" },
  { rank: 8,  handle: "mishka_holder",   pct:  33.9, topPick: "MISHKA.ai" },
  { rank: 9,  handle: "tldmaxi",         pct:  28.4, topPick: "INVESTORS.xyz" },
  { rank: 10, handle: "depin_doge",      pct:  24.1, topPick: "DEPIN.ai" },
];

const FONT_FAMILY = "Inter, system-ui, -apple-system, sans-serif";
const MONO = "ui-monospace, monospace";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roundNum = searchParams.get("round") ?? searchParams.get("season") ?? "01";
  const day = searchParams.get("day") ?? "scoring";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#07090f",
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 15% 18%, rgba(124,106,255,0.30) 0%, transparent 60%), " +
            "radial-gradient(ellipse 65% 55% at 85% 90%, rgba(26,58,143,0.40) 0%, transparent 60%)",
          padding: "44px 56px 32px",
          fontFamily: FONT_FAMILY,
          color: "#e4e8f5",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          {/* Brand left */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                width: 44,
                height: 44,
                background: "linear-gradient(135deg, #7c6aff 0%, #4f3cc9 100%)",
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 32px rgba(124,106,255,0.45)",
              }}
            >
              <div style={{ display: "flex", width: 14, height: 14, borderRadius: 999, background: "#0d1120" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: 14,
                  letterSpacing: 4,
                  color: "#6272a0",
                  textTransform: "uppercase",
                }}
              >
                Doma Fantasy League
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: -0.5,
                  marginTop: 2,
                }}
              >
                {`Round ${roundNum} standings`}
              </div>
            </div>
          </div>

          {/* Right meta */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              fontSize: 13,
              color: "#6272a0",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex" }}>{day}</div>
            <div
              style={{
                display: "flex",
                marginTop: 4,
                fontFamily: MONO,
                fontSize: 14,
                color: "#e4e8f5",
              }}
            >
              {date}
            </div>
          </div>
        </div>

        {/* Accent line */}
        <div
          style={{
            display: "flex",
            height: 2,
            background:
              "linear-gradient(90deg, #7c6aff 0%, rgba(124,106,255,0) 60%, transparent 100%)",
            marginBottom: 14,
          }}
        />

        {/* Leaderboard rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {SAMPLE.map((row) => {
            const tone = TONES[row.rank];
            const positive = row.pct >= 0;
            const pctStr = `${positive ? "+" : ""}${row.pct.toFixed(1)}%`;
            return (
              <div
                key={row.rank}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: row.rank <= 3 ? "rgba(124,106,255,0.05)" : "rgba(13,17,32,0.55)",
                  border: `1px solid ${row.rank <= 3 ? `${tone}33` : "rgba(255,255,255,0.05)"}`,
                  borderRadius: 10,
                  padding: "8px 18px",
                  fontSize: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 40,
                    fontFamily: MONO,
                    fontSize: 14,
                    color: tone || "#6272a0",
                    letterSpacing: 1,
                  }}
                >
                  {String(row.rank).padStart(2, "0")}
                </div>
                <div style={{ display: "flex", flex: 1, fontWeight: 600, fontSize: 19 }}>
                  {row.handle}
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 220,
                    fontFamily: MONO,
                    fontSize: 12,
                    color: "#6272a0",
                  }}
                >
                  <span>Top:&nbsp;</span>
                  <span style={{ color: "#e4e8f5" }}>{row.topPick}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 100,
                    justifyContent: "flex-end",
                    fontFamily: MONO,
                    fontSize: 19,
                    fontWeight: 700,
                    color: positive ? "#34d399" : "#f87171",
                  }}
                >
                  {pctStr}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11,
            color: "#6272a0",
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex" }}>doma.xyz · fantasy league</div>
          <div style={{ display: "flex" }}>10-day rounds · 3 per month</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 675,
    }
  );
}
