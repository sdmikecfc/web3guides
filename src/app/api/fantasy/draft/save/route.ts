/**
 * POST /api/fantasy/draft/save
 *
 * Body: { picks: string[] }   -- exactly 10 token_addresses (CAIP-10)
 *
 * Validates against the current DRAFTING round's snapshot, then upserts
 * fantasy_holdings (delete existing for user/round, insert new 10) inside
 * a single Supabase call sequence.
 */

import { NextRequest, NextResponse } from "next/server";
import { fantasyDb } from "@/lib/fantasy/supabase";
import { readSession } from "@/lib/fantasy/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TARGET_PICKS = 10;

function bad(message: string, code = 400) {
  return NextResponse.json({ ok: false, error: message }, { status: code });
}

export async function POST(req: NextRequest) {
  const session = readSession();
  if (!session) return bad("unauthenticated", 401);

  let body: any;
  try { body = await req.json(); }
  catch { return bad("invalid-json"); }

  const picks: string[] = Array.isArray(body?.picks) ? body.picks : [];
  if (picks.length !== TARGET_PICKS) return bad(`expected ${TARGET_PICKS} picks`);

  const uniqueLower = Array.from(new Set(picks.map((p) => String(p).toLowerCase())));
  if (uniqueLower.length !== TARGET_PICKS) return bad("duplicate picks");

  const db = fantasyDb();

  // Find the current DRAFTING round.
  const { data: rounds, error: rErr } = await db
    .from("fantasy_rounds")
    .select("*")
    .eq("status", "DRAFTING")
    .order("draft_opens_at", { ascending: false })
    .limit(1);
  if (rErr) {
    console.error("[draft/save] round read", rErr);
    return bad("server-error", 500);
  }
  const round = rounds?.[0];
  if (!round) return bad("no-draft-window-open");

  // Snapshot for that round.
  const { data: snap } = await db
    .from("fantasy_pool_snapshots")
    .select("*")
    .eq("round_id", round.round_id)
    .single();
  if (!snap) return bad("snapshot-missing", 500);

  // Pull prices for all selected addresses from the snapshot.
  const { data: prices, error: pErr } = await db
    .from("fantasy_pool_prices")
    .select("token_address, domain_name, fdv_usd")
    .eq("snapshot_id", snap.snapshot_id)
    .in("token_address", uniqueLower);
  if (pErr) {
    console.error("[draft/save] prices read", pErr);
    return bad("server-error", 500);
  }

  if (!prices || prices.length !== TARGET_PICKS) {
    return bad(`one or more picks are not eligible (matched ${prices?.length ?? 0}/${TARGET_PICKS})`);
  }

  const totalCost = prices.reduce((s, p) => s + Number(p.fdv_usd || 0), 0);
  const budget = Number(round.budget_usd || 0);
  if (totalCost > budget) {
    return bad(`over budget: $${Math.round(totalCost).toLocaleString()} > $${Math.round(budget).toLocaleString()}`);
  }

  const nowIso = new Date().toISOString();

  // Delete previous holdings for this user/round, then insert the new set.
  const { error: dErr } = await db
    .from("fantasy_holdings")
    .delete()
    .eq("round_id", round.round_id)
    .eq("discord_id", session.sub);
  if (dErr) {
    console.error("[draft/save] delete", dErr);
    return bad("server-error", 500);
  }

  const rows = prices.map((p) => ({
    round_id: round.round_id,
    discord_id: session.sub,
    token_address: p.token_address,
    domain_name: p.domain_name,
    cost_basis_fdv_usd: Number(p.fdv_usd),
    drafted_at: nowIso,
  }));
  const { error: iErr } = await db.from("fantasy_holdings").insert(rows);
  if (iErr) {
    console.error("[draft/save] insert", iErr);
    return bad("server-error", 500);
  }

  return NextResponse.json({
    ok: true,
    round_id: round.round_id,
    total_cost_usd: totalCost,
    budget_usd: budget,
    unspent_usd: budget - totalCost,
    locked_at: nowIso,
  });
}
