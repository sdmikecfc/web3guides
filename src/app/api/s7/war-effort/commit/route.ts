/**
 * Season 5, COMMIT to the War Effort.
 * POST /api/s7/war-effort/commit  { t, domain, shells }
 *
 * MONEY PATH. It spends Shells, so it follows the same discipline as
 * /api/s7/tank-unlock, which is the web mirror of the bot's fail-closed
 * spendOk() escrow:
 *   - session-authed (walletForSession); never trust a client address,
 *   - SERVER-side validation of the domain, the window and the bounds; never
 *     trust a client price or a client's idea of "still open",
 *   - the window CLOSES at the 85% sprint tripwire (SPRINT_ARM_PCT), read from
 *     the persisted target row, so nobody can back a wall that is falling,
 *   - the spend fails CLOSED: s7_grant returns ok:false (no throw) on an
 *     overspend and writes nothing, and this route treats anything other than
 *     ok:true as "no debit happened",
 *   - a failed INSERT REFUNDS immediately, so a dead write never eats Shells.
 *
 * INVARIANTS: Shells only (p_points is always 0), cosmetics-only reward,
 * is_test carried from the player row. Nothing here reads or writes Medals,
 * the settlement table, or any USD figure. RESOLUTION IS THE BOT'S JOB: this
 * route never sets `status` to anything but 'committed'.
 */
import { NextResponse } from "next/server";
import { SHELLS_PER_RUN } from "@/lib/s7/games";
import { s7Db, SEASON_KEY } from "@/lib/s7/server";
import { walletForSession } from "@/lib/s7/me";
import { DEFAULT_THEME } from "@/lib/s7/theme";
import { SPRINT_ARM_PCT, WAR_EFFORT, WAR_EFFORT_TABLE } from "@/lib/s7/warEffort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status });

/** The bot's config row: {[domain]: {arms, activeUntil, lastLapse, done}}. A
 * stronghold that has EVER armed a sprint keeps the window shut. */
async function sprintArmed(db: ReturnType<typeof s7Db>, domain: string): Promise<boolean> {
  try {
    const { data } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "s7_sprint_state")
      .maybeSingle();
    if (!data?.value) return false;
    const parsed = JSON.parse(String(data.value)) as Record<string, { arms?: number; activeUntil?: string; done?: boolean }>;
    const s = parsed?.[domain];
    if (!s) return false;
    return Boolean((s.arms || 0) > 0 || s.activeUntil || s.done);
  } catch {
    // Unreadable sprint state: FAIL CLOSED. A commitment refused by mistake
    // costs nothing; one let through past the tripwire breaks the rule.
    return true;
  }
}

export async function POST(req: Request) {
  let body: { t?: string; domain?: string; shells?: number };
  try {
    body = (await req.json()) as { t?: string; domain?: string; shells?: number };
  } catch {
    return bad("bad json");
  }

  const domain = String(body.domain || "").toLowerCase().trim();
  const shells = Math.floor(Number(body.shells) || 0);
  if (!domain) return bad("Pick a stronghold.");
  if (!(shells >= WAR_EFFORT.MIN_SHELLS && shells <= WAR_EFFORT.MAX_SHELLS)) {
    return bad(
      `Commit between ${WAR_EFFORT.MIN_SHELLS} and ${WAR_EFFORT.MAX_SHELLS.toLocaleString()} ${DEFAULT_THEME.playCurrency}.`,
    );
  }

  const db = s7Db();
  const wallet = await walletForSession(db, body.t);
  if (!wallet) return NextResponse.json({ ok: false, error: "session expired: sign in again" }, { status: 401 });

  const { data: player } = await db
    .from("launch_wars_s7_players")
    .select("display_name, play_currency, is_test")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (!player) return bad("No commander for this wallet yet. Enlist at /s7/join first.", 404);
  const isTest = !!player.is_test;

  // ── THE WINDOW, from the persisted target row (never the client). ──
  const { data: target } = await db
    .from("launch_wars_s7_targets")
    .select("domain, name, status, normalized_progress")
    .eq("season_key", SEASON_KEY)
    .eq("domain", domain)
    .maybeSingle();
  if (!target) return bad("That stronghold is not on the front this season.");
  const status = String(target.status || "pending");
  const progress = Number(target.normalized_progress) || 0;
  const name = String(target.name || target.domain);
  if (status === "bonded") return bad(`${name} has already breached. Nothing can be declared for it now.`, 409);
  if (status === "failed") return bad(`${name} did not make it, so its War Effort is closed.`, 409);
  if (status !== "live") return bad(`${name} has not listed yet. You can declare for it once it is live.`, 409);
  if (progress >= SPRINT_ARM_PCT || (await sprintArmed(db, domain))) {
    return bad(
      `${name} is in its sprint band, so the War Effort on it is closed. The window shuts at ${Math.round(SPRINT_ARM_PCT * 100)}% so nobody can back a wall that is already falling.`,
      409,
    );
  }

  // One commitment per wallet per stronghold (the UNIQUE index is the truth;
  // this read only makes the refusal friendly).
  const { data: existing } = await db
    .from(WAR_EFFORT_TABLE)
    .select("id, shells")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .eq("domain", domain)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      ok: false,
      already: true,
      error: `You have already declared ${Math.round(Number(existing.shells) || 0).toLocaleString()} ${DEFAULT_THEME.playCurrency} for ${name}. One commitment per stronghold.`,
    });
  }

  // ── 1) SPEND, fail-closed. ok:false means the balance never moved. ──
  let spent = false;
  try {
    const { data } = await db.rpc("s7_grant", {
      p_season_key: SEASON_KEY,
      p_wallet: wallet,
      p_display_name: player.display_name ?? null,
      p_points: 0, // SHELLS ONLY, forever
      p_play_currency: -shells,
      p_reason: "war-effort:commit",
      p_meta: { domain, shells, src: "web" },
      p_is_test: isTest,
    });
    const row = Array.isArray(data) ? data[0] : data;
    spent = !!(row && (row as { ok?: boolean }).ok);
  } catch {
    spent = false;
  }
  if (!spent) {
    const have = Math.round(Number(player.play_currency) || 0);
    return bad(
      `You need ${shells.toLocaleString()} ${DEFAULT_THEME.playCurrency} to declare. You have ${have.toLocaleString()}. A banked arcade run pays ${SHELLS_PER_RUN}, and holding a stronghold pays every day.`,
    );
  }

  // ── 2) Persist the commitment. REFUND if it does not land. ──
  const { data: row, error } = await db
    .from(WAR_EFFORT_TABLE)
    .insert({
      season_key: SEASON_KEY,
      wallet,
      domain,
      shells,
      status: "committed",
      is_test: isTest,
    })
    .select("id, domain, shells, status")
    .maybeSingle();

  if (error || !row) {
    await db
      .rpc("s7_grant", {
        p_season_key: SEASON_KEY,
        p_wallet: wallet,
        p_display_name: player.display_name ?? null,
        p_points: 0,
        p_play_currency: shells,
        p_reason: "war-effort:refund",
        p_meta: { domain, reason: error ? String(error.message || error.code) : "insert", src: "web" },
        p_is_test: isTest,
      })
      .then(null, () => {});
    return NextResponse.json(
      { ok: false, error: `Could not record that commitment. Your ${DEFAULT_THEME.playCurrency} are untouched, try again.` },
      { status: 409 },
    );
  }

  // The fresh balance, read back after the spend.
  const { data: fresh } = await db
    .from("launch_wars_s7_players")
    .select("play_currency")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    domain,
    name,
    shells,
    returnsIfBreached: shells * WAR_EFFORT.MULT,
    decal: `breach-${domain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
    balance: Math.round(Number(fresh?.play_currency) || 0),
  });
}
