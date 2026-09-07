/**
 * Season 4 — wallet-first WEB ENLIST. POST /api/s4/join
 *
 * Sign up on the WEBSITE with just a wallet; link Discord LATER (Mike
 * 2026-07-15; the proven S3 /api/stars/join pattern the guide's onboarding is
 * built on — "your wallet is your agent, no Discord account needed to start").
 * The wallet-link route (/api/s4/link-discord) later attaches a Discord to this
 * same wallet row (its "existing player, no Discord yet" branch), so the two
 * flows compose: web-enlist now, link Discord whenever.
 *
 *   RETURNING wallet (already an s4 player) -> returned instantly, no signature.
 *   NEW wallet -> one gasless ownership signature (anti-Sybil), then enlist +
 *     auto-assign the smallest team. Body { address, message?, signature? };
 *     a missing signature returns { needsSignature: true } so the client signs.
 *
 * Keyed on wallet; discord_id stays NULL until they link. Points accrue by
 * wallet in the hourly tick, so a wallet-first agent earns immediately. The
 * response NEVER returns a wallet or a dollar figure; it names the team via the
 * THEME so the client never hardcodes a themed word.
 */
import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { s4Db, verifyOwnership, smallestTeam, SEASON_KEY } from "@/lib/s4/server";
import { getTheme } from "@/lib/s4/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  let body: { address?: string; message?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Bad request.");
  }
  const { address, message, signature } = body || {};
  if (!address || !isAddress(address)) return bad("Connect a wallet first.");
  const wallet = getAddress(address).toLowerCase();

  const db = s4Db();

  const teamResponse = async (teamKey: string | null, extra: Record<string, unknown>) => {
    const theme = await getTheme();
    const team = theme.teams.find((x) => x.key === teamKey) || null;
    return NextResponse.json({
      ok: true,
      team: teamKey,
      teamName: team ? team.name : teamKey,
      accent: team ? team.accent : "#8b95ad",
      ...extra,
    });
  };

  // Idempotent: a wallet already enlisted this season returns immediately (no
  // signature, no new row). If an existing row is still teamless (e.g. a
  // score-grant created it before enlist), auto-assign the smallest team now.
  const { data: existing } = await db
    .from("launch_wars_s4_players")
    .select("id, team_key, discord_id")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (existing) {
    let teamKey = existing.team_key as string | null;
    if (!teamKey) {
      teamKey = await smallestTeam(db);
      await db
        .from("launch_wars_s4_players")
        .update({ team_key: teamKey, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return teamResponse(teamKey, { joined: false, welcomeBack: true, linked: !!existing.discord_id });
  }

  // New wallet -> require one ownership signature (anti-Sybil, gasless).
  if (!message || !signature) {
    return NextResponse.json({ ok: false, needsSignature: true });
  }
  const v = await verifyOwnership(message, signature, address);
  if ("error" in v) return bad(v.error, 401);

  // Enlist -> auto-assign the smallest team. discord_id stays NULL (link later).
  const teamKey = await smallestTeam(db);
  const { data: created, error } = await db
    .from("launch_wars_s4_players")
    .insert({ season_key: SEASON_KEY, wallet, team_key: teamKey, is_test: false })
    .select("team_key")
    .single();
  if (error) {
    // Race (UNIQUE season_key+wallet): another request just created it.
    const { data: race } = await db
      .from("launch_wars_s4_players")
      .select("team_key")
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet)
      .maybeSingle();
    if (race) return teamResponse(race.team_key, { joined: false, welcomeBack: false });
    return bad(error.message, 500);
  }
  return teamResponse(created.team_key, { joined: true });
}
