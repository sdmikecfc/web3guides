import { ImageResponse } from "next/og";
import { fantasyDb } from "@/lib/fantasy/supabase";
import { getAllTokensByAddress } from "@/lib/fantasy/doma";

export const runtime = "nodejs";
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

const FONT_FAMILY = "Inter, system-ui, -apple-system, sans-serif";
const MONO = "ui-monospace, monospace";

function shortNameFor(discordId: string): string {
  const s = String(discordId);
  return s.length > 4 ? `user-${s.slice(-4)}` : `user-${s}`;
}

async function getStandings(roundIdParam: string | null): Promise<{
  rows: Row[];
  roundName: string;
  status: string;
  isEmpty: boolean;
}> {
  const db = fantasyDb();

  // Pick the round: explicit param wins, otherwise latest.
  let round: { round_id: number; name: string; budget_usd: number; status: string } | null = null;
  if (roundIdParam && /^\d+$/.test(roundIdParam)) {
    const { data } = await db
      .from("fantasy_rounds")
      .select("round_id, name, budget_usd, status")
      .eq("round_id", Number(roundIdParam))
      .maybeSingle();
    if (data) round = data;
  }
  if (!round) {
    const { data } = await db
      .from("fantasy_rounds")
      .select("round_id, name, budget_usd, status")
      .order("draft_opens_at", { ascending: false })
      .limit(1);
    round = data?.[0] ?? null;
  }

  if (!round) {
    return { rows: [], roundName: "Doma Fantasy League", status: "PENDING", isEmpty: true };
  }

  // If round is UPCOMING or DRAFTING, no portfolio values yet — empty.
  if (round.status === "UPCOMING" || round.status === "DRAFTING") {
    return { rows: [], roundName: round.name, status: round.status, isEmpty: true };
  }

  const { data: holdings } = await db
    .from("fantasy_holdings")
    .select("discord_id, token_address, domain_name, cost_basis_fdv_usd")
    .eq("round_id", round.round_id);

  if (!holdings || holdings.length === 0) {
    return { rows: [], roundName: round.name, status: round.status, isEmpty: true };
  }

  const liveByAddr = await getAllTokensByAddress();
  const byUser = new Map<string, typeof holdings>();
  for (const h of holdings) {
    if (!byUser.has(h.discord_id)) byUser.set(h.discord_id, []);
    byUser.get(h.discord_id)!.push(h);
  }

  const budget = Number(round.budget_usd);
  const ranked: { discordId: string; totalValue: number; pct: number; topPick: string }[] = [];
  for (const [discordId, userHoldings] of Array.from(byUser.entries())) {
    let holdingsValue = 0;
    let costBasis = 0;
    let bestPick = { domain: "", pct: -Infinity };
    for (const h of userHoldings) {
      const live = liveByAddr.get(String(h.token_address).toLowerCase());
      const liveFdv = Number(live?.currentFDV ?? h.cost_basis_fdv_usd);
      holdingsValue += liveFdv;
      const cost = Number(h.cost_basis_fdv_usd);
      costBasis += cost;
      const gainPct = cost > 0 ? ((liveFdv - cost) / cost) * 100 : 0;
      if (gainPct > bestPick.pct) bestPick = { domain: h.domain_name, pct: gainPct };
    }
    const unspent = budget - costBasis;
    const totalValue = holdingsValue + unspent;
    const pct = budget > 0 ? ((totalValue - budget) / budget) * 100 : 0;
    ranked.push({ discordId, totalValue, pct, topPick: bestPick.domain || "—" });
  }
  ranked.sort((a, b) => b.totalValue - a.totalValue);

  const rows: Row[] = ranked.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    handle: shortNameFor(r.discordId),
    pct: r.pct,
    topPick: r.topPick,
  }));
  return { rows, roundName: round.name, status: round.status, isEmpty: false };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roundIdParam = searchParams.get("round_id") ?? searchParams.get("round");
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  let rows: Row[] = [];
  let roundName = "Doma Fantasy League";
  let status = "PENDING";
  let isEmpty = true;
  try {
    const result = await getStandings(roundIdParam);
    rows = result.rows;
    roundName = result.roundName;
    status = result.status;
    isEmpty = result.isEmpty;
  } catch (err) {
    console.error("[og/standings] failed:", err);
  }

  const day = status === "UPCOMING" ? "round opens soon"
    : status === "DRAFTING" ? "draft window"
    : status === "ACTIVE"   ? "scoring"
    : status === "COMPLETE" ? "final"
    : "preview";

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
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
              <div style={{ display: "flex", fontSize: 14, letterSpacing: 4, color: "#6272a0", textTransform: "uppercase" }}>
                Doma Fantasy League
              </div>
              <div style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: -0.5, marginTop: 2 }}>
                {`${roundName} standings`}
              </div>
            </div>
          </div>

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
            <div style={{ display: "flex", marginTop: 4, fontFamily: MONO, fontSize: 14, color: "#e4e8f5" }}>
              {date}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            height: 2,
            background: "linear-gradient(90deg, #7c6aff 0%, rgba(124,106,255,0) 60%, transparent 100%)",
            marginBottom: 14,
          }}
        />

        {/* Body */}
        {isEmpty ? (
          <div
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
              {status === "UPCOMING" ? "Round hasn't started"
                : status === "DRAFTING" ? "Draft in progress"
                : "No teams ranked yet"}
            </div>
            <div style={{ display: "flex", fontSize: 16, color: "#6272a0", maxWidth: 720, textAlign: "center" }}>
              {status === "UPCOMING"
                ? "Standings appear once the draft window opens and lineups lock."
                : status === "DRAFTING"
                  ? "Players are picking. Standings appear once scoring begins."
                  : "Scoring is live but no portfolios are on record yet."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rows.map((row) => {
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
                  <div style={{ display: "flex", width: 220, fontFamily: MONO, fontSize: 12, color: "#6272a0" }}>
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
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "auto",
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
      headers: {
        // Edge-cache the image for 60s, serve stale up to 5min while revalidating
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
