import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOT_BASE = "http://143.110.183.157:5001";

export async function GET() {
  const key = process.env.BOT_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "BOT_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${BOT_BASE}/api/bot/summary`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Bot returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json({ error: "Bot unreachable" }, { status: 503 });
  }
}
