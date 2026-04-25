import { NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

// LP bot may live on the same droplet as the auto-sniper (same port, /api/lp/...)
// or on a different port. Override LP_BOT_BASE in env to point elsewhere.
const LP_BOT_BASE = process.env.LP_BOT_BASE ?? "http://143.110.183.157:5001";

export async function GET() {
  // Allow re-using the auto-sniper's key if the LP endpoints sit on the same
  // FastAPI service. Otherwise set LP_BOT_API_KEY explicitly.
  const key = process.env.LP_BOT_API_KEY ?? process.env.BOT_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "LP_BOT_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${LP_BOT_BASE}/api/lp/summary`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `LP bot returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json({ error: "LP bot unreachable" }, { status: 503 });
  }
}
