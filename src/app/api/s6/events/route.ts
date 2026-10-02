/**
 * Season 5 funnel events. POST /api/s6/events
 *
 * Fire-and-forget beacon sink (lib/s5/track.ts): inserts one row into
 * launch_wars_s6_funnel_events. Defensive by design:
 *
 * - EVENT ALLOWLIST: unknown event names are dropped (400), so the table can
 *   never be spammed into a junk namespace.
 * - The wallet column is NEVER trusted from the body. It is null unless the
 *   beacon carries a play-session token (t) that resolves server-side.
 * - session_id/ref/path are format-clamped; utm is a small string map.
 * - A DB failure returns ok:false 200 (beacons don't retry; tracking must
 *   never look like an outage).
 */
import { NextResponse } from "next/server";
import { s6Db, SEASON_KEY } from "@/lib/s6/server";

export const runtime = "nodejs";

const EVENTS = new Set([
  "landing_view",
  "cta_click",
  "connect_start",
  "siwe_ok",
  "hotspot_tap",
  "panel_open",
  "join_view",
  "join_signed",
  "join_done",
  "arcade_view",
  "game_open",
  "run_done",
  "guest_claim",
  "map_view",
  "board_view",
  "rules_view",
  "radio_open",
  "dock_tap",
  "outbound_buy",
  // fired by the client since day one but MISSING here, so both were
  // silently 400'd (found in the 2026-08-16 CRO instrumentation audit):
  "welcome_view",
  "invite_clicked",
]);

const SID_RE = /^[A-Za-z0-9-]{8,64}$/;

export async function POST(req: Request) {
  let body: {
    session_id?: string;
    event?: string;
    ref?: string | null;
    utm?: Record<string, unknown>;
    path?: string;
    t?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sessionId = String(body.session_id || "");
  const event = String(body.event || "");
  if (!SID_RE.test(sessionId) || !EVENTS.has(event)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const ref = typeof body.ref === "string" && body.ref ? body.ref.slice(0, 200) : null;
  const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 120) : null;
  const utm: Record<string, string> = {};
  if (body.utm && typeof body.utm === "object" && !Array.isArray(body.utm)) {
    for (const [k, v] of Object.entries(body.utm)) {
      if (typeof v === "string" && /^[a-z_]{1,24}$/.test(k)) utm[k] = v.slice(0, 80);
    }
  }

  const db = s6Db();

  // Wallet ONLY via a verified play session, never from the body.
  let wallet: string | null = null;
  const t = String(body.t || "");
  if (/^[A-Za-z0-9_-]{8,80}$/.test(t)) {
    try {
      const { data: sess } = await db
        .from("launch_wars_s6_game_sessions")
        .select("wallet, expires_at")
        .eq("token", t)
        .maybeSingle();
      if (sess && new Date(sess.expires_at).getTime() >= Date.now()) {
        wallet = String(sess.wallet).toLowerCase();
      }
    } catch {
      wallet = null;
    }
  }

  try {
    const { error } = await db.from("launch_wars_s6_funnel_events").insert({
      season_key: SEASON_KEY,
      session_id: sessionId,
      wallet,
      event,
      ref,
      utm,
      path,
      is_test: false,
    });
    if (error) return NextResponse.json({ ok: false }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}
