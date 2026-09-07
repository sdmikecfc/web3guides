/**
 * Season 5, THE WAR EFFORT state. POST /api/s6/war-effort  { t? }
 *
 * READ ONLY. Returns the public per-stronghold commitment totals (no wallets,
 * no dollars) and, when a play-session token is supplied, the caller's OWN
 * commitments. Nothing here moves a balance; the commit lives in
 * /api/s6/war-effort/commit and resolution lives in the bot.
 */
import { NextResponse } from "next/server";
import { s6Db } from "@/lib/s6/server";
import { walletForSession } from "@/lib/s6/me";
import { getSeasonSnapshot } from "@/lib/s6/data";
import {
  WAR_EFFORT,
  myCommitments,
  warEffortTotals,
  windowOpen,
  type MyCommitment,
  type WarEffortTotal,
} from "@/lib/s6/warEffort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { t?: string } = {};
  try {
    body = (await req.json()) as { t?: string };
  } catch {
    body = {};
  }

  const db = s6Db();
  const snapshot = await getSeasonSnapshot();
  const totals = await warEffortTotals(db);
  const sprintDomains = snapshot.sprint.domains.map((d) => d.toLowerCase());

  const strongholds = snapshot.targets.map((target) => {
    const agg: WarEffortTotal =
      totals.get(target.domain) || { domain: target.domain, committed: 0, pilots: 0, won: 0, lost: 0 };
    return {
      domain: target.domain,
      name: target.name,
      status: target.status,
      progress: target.progress,
      open: windowOpen(target, sprintDomains),
      committed: agg.committed,
      pilots: agg.pilots,
      won: agg.won,
      lost: agg.lost,
    };
  });

  let mine: MyCommitment[] = [];
  const wallet = body.t ? await walletForSession(db, body.t) : null;
  if (wallet) mine = await myCommitments(db, wallet);

  return NextResponse.json({
    ok: true,
    session: Boolean(wallet),
    min: WAR_EFFORT.MIN_SHELLS,
    max: WAR_EFFORT.MAX_SHELLS,
    mult: WAR_EFFORT.MULT,
    strongholds,
    mine,
  });
}
