import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BOT_BASE = "http://143.110.183.157:5001";

export async function GET() {
  // Only allow authenticated dashboard users
  const cookieStore = await cookies();
  if (cookieStore.get("dash_auth")?.value !== "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Bot unreachable" }, { status: 503 });
  }
}
