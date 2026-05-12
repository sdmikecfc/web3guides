import { NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

// ETH LP bot lives on port 5005 (SOFTWARE.ai LP bot is 5002).
// Override LP_BOT_ETH_BASE in env if it ever moves.
const LP_BOT_ETH_BASE = process.env.LP_BOT_ETH_BASE ?? "http://143.110.183.157:5005";

export async function GET() {
  const key = process.env.LP_API_KEY_ETH ?? process.env.LP_BOT_API_KEY ?? process.env.BOT_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "LP_API_KEY_ETH not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${LP_BOT_ETH_BASE}/api/lp/summary`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `ETH LP bot returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json({ error: "ETH LP bot unreachable" }, { status: 503 });
  }
}
