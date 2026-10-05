/**
 * Season 5, wallet-first WEB ENLIST. POST /api/s7/join
 *
 * Port of the proven S4 route (/api/s4/join) onto the s7 tables, one team:
 * everyone lands on "front" (The Guild).
 *
 *   RETURNING wallet (already an s7 player) -> returned instantly, no signature.
 *   NEW wallet -> one gasless ownership signature (anti-Sybil), then enlist.
 *   Body { address, message?, signature? }; a missing signature returns
 *   { needsSignature: true } so the client signs.
 *
 * Keyed on wallet; discord_id stays NULL until they link. The response NEVER
 * returns a wallet or a dollar figure; it names the team via the THEME.
 * POST-only handler: dynamic by nature, no force-dynamic needed.
 */
import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";
import { s7Db, verifyOwnership, smallestTeam, SEASON_KEY } from "@/lib/s7/server";
import { getTheme } from "@/lib/s7/data";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  let body: { address?: string; message?: string; signature?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Bad request.");
  }
  const { address, message, signature, ref } = body || {};
  if (!address || !isAddress(address)) return bad("Connect a wallet first.");
  const wallet = getAddress(address).toLowerCase();

  const db = s7Db();

  // Brothers in Arms attribution (ADR-0068 §3). Resolve a client-remembered
  // invite code to the recruiter's wallet. Fail-soft everywhere: a bad code
  // never blocks an enlist, and the edge table's UNIQUE(referred) + not_self
  // CHECK enforce first-attribution-wins and no self-invites at the DB layer.
  async function attributeReferral(referredWallet: string) {
    try {
      const code = String(ref || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
      const { data: recruiter } = await db
        .from("launch_wars_s7_players")
        .select("wallet")
        .eq("season_key", SEASON_KEY)
        .eq("ref_code", code)
        .eq("is_test", false)
        .limit(1)
        .maybeSingle();
      const recruiterWallet = recruiter?.wallet ? String(recruiter.wallet).toLowerCase() : null;
      if (!recruiterWallet || recruiterWallet === referredWallet) return;
      const { error: edgeErr } = await db.from("launch_wars_s7_referrals").insert({
        season_key: SEASON_KEY,
        referrer: recruiterWallet,
        referred: referredWallet,
        is_test: false,
      });
      if (edgeErr) return; // duplicate (already referred) or CHECK violation: first wins
      await db
        .from("launch_wars_s7_players")
        .update({ invited_by: recruiterWallet, updated_at: new Date().toISOString() })
        .eq("season_key", SEASON_KEY)
        .eq("wallet", referredWallet);
      await db.from("launch_wars_s7_funnel_events").insert({
        session_id: "server-join",
        event: "join_bound",
        ref: code,
        path: "/api/s7/join",
        is_test: false,
      });
    } catch {
      // attribution is strictly best-effort
    }
  }

  const carryIdentityFromS7 = async (w: string) => {
    try {
      const { data: prev } = await db
        .from("launch_wars_s7_players")
        .select("discord_id, display_name")
        .eq("season_key", "s7")
        .eq("wallet", w)
        .maybeSingle();
      if (!prev || (!prev.discord_id && !prev.display_name)) return;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (prev.discord_id) patch.discord_id = prev.discord_id;
      if (prev.display_name) patch.display_name = prev.display_name;
      await db
        .from("launch_wars_s7_players")
        .update(patch)
        .eq("season_key", SEASON_KEY)
        .eq("wallet", w)
        .is("discord_id", null);
    } catch {
      /* best-effort: an unlinked row is what we had anyway */
    }
  };

  const teamResponse = async (teamKey: string | null, extra: Record<string, unknown>) => {
    const theme = await getTheme();
    const team = theme.teams.find((x) => x.key === teamKey) || null;
    return NextResponse.json({
      ok: true,
      team: teamKey,
      teamName: team ? team.name : teamKey,
      accent: team ? team.accent : "#9aa7b4",
      ...extra,
    });
  };

  // Idempotent: a wallet already enlisted this season returns immediately.
  // A teamless row (a grant created it before enlist) is assigned now.
  const { data: existing } = await db
    .from("launch_wars_s7_players")
    .select("id, team_key, discord_id")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (existing) {
    let teamKey = existing.team_key as string | null;
    if (!teamKey) {
      teamKey = await smallestTeam(db);
      await db
        .from("launch_wars_s7_players")
        .update({ team_key: teamKey, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    if (!existing.discord_id) await carryIdentityFromS7(wallet);
    return teamResponse(teamKey, { joined: false, welcomeBack: true, linked: !!existing.discord_id });
  }

  // New wallet -> require one ownership signature (anti-Sybil, gasless).
  if (!message || !signature) {
    return NextResponse.json({ ok: false, needsSignature: true });
  }
  const v = await verifyOwnership(message, signature, address);
  if ("error" in v) return bad(v.error, 401);

  // Enlist onto the one front. discord_id stays NULL (link later).
  const teamKey = await smallestTeam(db);
  const { data: created, error } = await db
    .from("launch_wars_s7_players")
    .insert({ season_key: SEASON_KEY, wallet, team_key: teamKey, is_test: false })
    .select("team_key")
    .single();
  await carryIdentityFromS7(wallet);
  if (error) {
    // Race (UNIQUE season_key+wallet): another request just created it.
    const { data: race } = await db
      .from("launch_wars_s7_players")
      .select("team_key")
      .eq("season_key", SEASON_KEY)
      .eq("wallet", wallet)
      .maybeSingle();
    if (race) return teamResponse(race.team_key, { joined: false, welcomeBack: false });
    return bad(error.message, 500);
  }
  await attributeReferral(wallet); // fresh enlist only: first attribution wins
  return teamResponse(created.team_key, { joined: true });
}
