/**
 * Season 5, wallet-first WEB ENLIST. POST /api/s5/join
 *
 * Port of the proven S4 route (/api/s4/join) onto the s5 tables, one team:
 * everyone lands on "front" (The Iron Column).
 *
 *   RETURNING wallet (already an s5 player) -> returned instantly, no signature.
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
import { s5Db, verifyOwnership, smallestTeam, SEASON_KEY } from "@/lib/s5/server";
import { getTheme } from "@/lib/s5/data";

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

  const db = s5Db();

  // Brothers in Arms attribution (ADR-0068 §3). Resolve a client-remembered
  // invite code to the recruiter's wallet. Fail-soft everywhere: a bad code
  // never blocks an enlist, and the edge table's UNIQUE(referred) + not_self
  // CHECK enforce first-attribution-wins and no self-invites at the DB layer.
  async function attributeReferral(referredWallet: string) {
    try {
      const code = String(ref || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
      const { data: recruiter } = await db
        .from("launch_wars_s5_players")
        .select("wallet")
        .eq("season_key", SEASON_KEY)
        .eq("ref_code", code)
        .eq("is_test", false)
        .limit(1)
        .maybeSingle();
      const recruiterWallet = recruiter?.wallet ? String(recruiter.wallet).toLowerCase() : null;
      if (!recruiterWallet || recruiterWallet === referredWallet) return;
      const { error: edgeErr } = await db.from("launch_wars_s5_referrals").insert({
        season_key: SEASON_KEY,
        referrer: recruiterWallet,
        referred: referredWallet,
        is_test: false,
      });
      if (edgeErr) return; // duplicate (already referred) or CHECK violation: first wins
      await db
        .from("launch_wars_s5_players")
        .update({ invited_by: recruiterWallet, updated_at: new Date().toISOString() })
        .eq("season_key", SEASON_KEY)
        .eq("wallet", referredWallet);
      await db.from("launch_wars_s5_funnel_events").insert({
        session_id: "server-join",
        event: "join_bound",
        ref: code,
        path: "/api/s5/join",
        is_test: false,
      });
    } catch {
      // attribution is strictly best-effort
    }
  }

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
    .from("launch_wars_s5_players")
    .select("id, team_key, discord_id")
    .eq("season_key", SEASON_KEY)
    .eq("wallet", wallet)
    .maybeSingle();
  if (existing) {
    let teamKey = existing.team_key as string | null;
    if (!teamKey) {
      teamKey = await smallestTeam(db);
      await db
        .from("launch_wars_s5_players")
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

  // Enlist onto the one front. discord_id stays NULL (link later).
  const teamKey = await smallestTeam(db);
  const { data: created, error } = await db
    .from("launch_wars_s5_players")
    .insert({ season_key: SEASON_KEY, wallet, team_key: teamKey, is_test: false })
    .select("team_key")
    .single();
  if (error) {
    // Race (UNIQUE season_key+wallet): another request just created it.
    const { data: race } = await db
      .from("launch_wars_s5_players")
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
