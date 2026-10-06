import { NextResponse } from "next/server";
import { dkDb, DK_GAME_KEY, walletForDkSession } from "@/lib/chef/server";
import { authorityEnabled, kitchenResponse, loadKitchen } from "@/lib/chef/authority-server";
import { handleOf } from "@/lib/chef/board";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!authorityEnabled()) return NextResponse.json({ ok: false, code: "rollout_pending" }, { status: 503, headers });
  try {
    const raw = await req.text();
    if (raw.length > 1024) return NextResponse.json({ ok: false }, { status: 413, headers });
    const body = JSON.parse(raw);
    const db = dkDb();
    const wallet = await walletForDkSession(db, body?.t);
    if (!wallet) return NextResponse.json({ ok: false, error: "Sign in to meet your neighbors." }, { status: 401, headers });
    const now = Date.now();
    const record = await loadKitchen(db, wallet, now);
    const { data, error } = await db.from("domain_kitchen_players").select("wallet,name:state->>name,authority_state")
      .eq("game_key", DK_GAME_KEY).eq("is_test", false).neq("wallet", wallet).not("authority_state", "is", null)
      .order("updated_at", { ascending: false }).limit(60);
    if (error) return NextResponse.json({ ok: false, error: "The neighborhood is unavailable." }, { status: 503, headers });
    const discover = (data ?? []).filter((r) => !record.authority.neighbors[r.wallet] && r.authority_state?.neighbors?.[wallet] !== "blocked")
      .slice(0, 24).map((r) => ({ handle: handleOf(r.wallet), name: typeof r.name === "string" ? r.name.slice(0, 24) : "" }));
    return NextResponse.json({ ...await kitchenResponse(db, record, now), discover }, { headers });
  } catch { return NextResponse.json({ ok: false, error: "The neighborhood is unavailable." }, { status: 503, headers }); }
}
