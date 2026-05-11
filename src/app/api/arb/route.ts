import { NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

// Arb bot lives on port 5003 (LP bot is 5002, auto-sniper api is 5001).
// Override with ARB_BOT_BASE in env if it ever moves.
const ARB_BOT_BASE = process.env.ARB_BOT_BASE ?? "http://143.110.183.157:5003";

export async function GET() {
  // Allow re-using the auto-sniper key if the keys are unified, but prefer
  // a dedicated ARB_API_KEY since the bot has its own .env.
  const key = process.env.ARB_API_KEY ?? process.env.BOT_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "ARB_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${ARB_BOT_BASE}/api/arb/summary`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Arb bot returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json({ error: "Arb bot unreachable" }, { status: 503 });
  }
}
