/**
 * Season 7, the class tracks (ADR-0129).
 *
 *   GET  /api/s7/class?t=<session>       -> { ok, active, tracks }
 *   POST /api/s7/class { t, classId }    -> { ok, track }  (switch / first pick)
 *
 * Mike's law, verbatim: "if they change from level 3 warrior to mage they are
 * a level 1 mage and can switch back to warrior." Switching is free and
 * instant; rows are never deleted (lib/s7/classes owns the semantics, proven
 * by scripts/s7-classes-check.ts before these tables existed).
 *
 * Auth = the play-session token, the same gate every game route uses: class
 * choice is a play-side action, not a money action.
 */
import { NextResponse } from "next/server";
import { s7Db, SEASON_KEY } from "@/lib/s7/server";
import { getTracks, isClassId, switchClass } from "@/lib/s7/classes";

export const runtime = "nodejs";

async function walletFor(db: ReturnType<typeof s7Db>, t: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(t)) return null;
  const { data: sess } = await db
    .from("launch_wars_s7_game_sessions")
    .select("wallet, expires_at")
    .eq("token", t)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) return null;
  return String(sess.wallet).toLowerCase();
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const db = s7Db();
  const wallet = await walletFor(db, t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired" }, { status: 401 });
  try {
    const { active, tracks } = await getTracks(db, wallet);
    return NextResponse.json({ ok: true, active, tracks });
  } catch {
    return NextResponse.json({ ok: false, error: "class read failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: { t?: string; classId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const db = s7Db();
  const wallet = await walletFor(db, String(body.t || ""));
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired" }, { status: 401 });
  const classId = String(body.classId || "");
  if (!isClassId(classId)) return NextResponse.json({ ok: false, error: "unknown class" }, { status: 400 });
  // The player row must exist for active_class to land on (the join flow
  // creates it; a session token without a row is the zombie-session class of
  // bug, healed the same way /api/s7/hq does).
  const { data: player } = await db
    .from("launch_wars_s7_players")
    .select("wallet")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (!player) {
    return NextResponse.json({ ok: false, error: "enlist first, then pick a class" }, { status: 409 });
  }
  try {
    const track = await switchClass(db, wallet, classId);
    return NextResponse.json({ ok: true, track });
  } catch {
    return NextResponse.json({ ok: false, error: "switch failed" }, { status: 500 });
  }
}
