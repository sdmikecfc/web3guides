import { NextRequest, NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

const LP_BOT_BASE = process.env.LP_BOT_BASE ?? "http://143.110.183.157:5001";

// LP bot has a single process so no {process} path param — just /api/lp/logs?lines=N
export async function GET(req: NextRequest) {
  const key = process.env.LP_BOT_API_KEY ?? process.env.BOT_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "LP_BOT_API_KEY not configured" }, { status: 500 });
  }

  const lines = req.nextUrl.searchParams.get("lines") ?? "100";

  try {
    const res = await fetch(`${LP_BOT_BASE}/api/lp/logs?lines=${lines}`, {
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
