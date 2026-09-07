import { NextResponse } from "next/server";
import { botsDb } from "@/app/bots/_server/db";
import { sessionFromRequest } from "@/app/bots/_server/session";
import { displayName, type PlayerRow } from "@/app/bots/_server/players";
import { CAMPAIGN_CATEGORIES, campaignPeriod, campaignSnapshotAvailable, emptyCampaign, publicStandings, type CampaignView } from "@/lib/bots/campaign-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const numberOrNull = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? n : null;
const dateOrNull = (n: unknown) => typeof n === "string" && Number.isFinite(Date.parse(n)) ? n : null;
const object = (n: unknown): Record<string, any> => n && typeof n === "object" && !Array.isArray(n) ? n as Record<string, any> : {};

/** Read a reporter snapshot. Missing launch configuration never becomes fake standings. */
export async function GET(req: Request) {
  const period = campaignPeriod(new URL(req.url).searchParams.get("period"));
  const reply = (view: CampaignView) => NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
  try {
    const db = botsDb(), sess = sessionFromRequest(req), now = new Date().toISOString();
    const columns = "id,title,status,starts_at,ends_at,created_at";
    let campaignRead = await db.from("battle_bots_campaigns").select(columns).eq("status", "active").lte("starts_at", now).gt("ends_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!campaignRead.error && !campaignRead.data) campaignRead = await db.from("battle_bots_campaigns").select(columns).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (campaignRead.error) return reply(emptyCampaign(period));
    const c = campaignRead.data;
    if (!c) return reply(emptyCampaign(period, "available"));
    const out = emptyCampaign(period, "available");
    out.campaign = { id: String(c.id), title: typeof c.title === "string" ? c.title.slice(0, 80) : "Model Kombat", status: ["draft", "active", "closed", "frozen"].includes(c.status) ? c.status : "draft", startsAt: dateOrNull(c.starts_at), endsAt: dateOrNull(c.ends_at) };
    const [snapshotRead, enrollmentRead] = await Promise.all([
      db.from("battle_bots_campaign_snapshots").select("payload,as_of,frozen").eq("campaign_id", c.id).eq("period_key", period).order("as_of", { ascending: false }).limit(1).maybeSingle(),
      sess ? db.from("battle_bots_campaign_enrollments").select("snapshot_status,credit_from_at").eq("campaign_id", c.id).eq("wallet", sess.wallet).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (snapshotRead.error) { out.source = "unavailable"; return reply(out); }
    const payload = object(snapshotRead.data?.payload), p = object(payload.period);
    out.updatedAt = dateOrNull(payload.updatedAt) ?? dateOrNull(snapshotRead.data?.as_of);
    out.confirmedThrough = dateOrNull(object(payload.provenance).confirmedThrough);
    out.ready = typeof payload.ready === "boolean" ? payload.ready : null;
    const snapshotAvailable = campaignSnapshotAvailable(payload, String(c.id), period, snapshotRead.data?.frozen === true);
    if (c.status !== "draft" && !snapshotAvailable) out.source = "unavailable";
    if (!snapshotAvailable && c.status !== "draft") out.ready = false;
    out.period = { key: period, startsAt: dateOrNull(p.startsAt), endsAt: dateOrNull(p.endsAt), status: ["upcoming", "active", "checking", "frozen"].includes(p.status) ? p.status : "upcoming" };
    out.domaMcp = object(payload.provenance).domaMcp === "available" ? "available" : "pending";
    const standings = object(payload.standings);
    const wallets = Array.from(new Set(CAMPAIGN_CATEGORIES.flatMap(key => Array.isArray(standings[key]) ? standings[key].slice(0, 100).map((r: any) => typeof r?.wallet === "string" ? r.wallet.toLowerCase() : "") : []).filter((w: string) => /^0x[0-9a-f]{40}$/.test(w))));
    if (wallets.length) {
      const players = await db.from("battle_bots_players").select("wallet,wallet_name,is_test,is_operator").in("wallet", wallets).eq("is_test", false).eq("is_operator", false);
      if (!players.error && snapshotAvailable) {
        const names = new Map<string, string>();
        for (const row of players.data ?? []) names.set(row.wallet.toLowerCase(), displayName(row as PlayerRow));
        out.standings = publicStandings(standings, names);
      } else if (players.error) { out.source = "unavailable"; out.ready = false; }
    }
    if (sess) {
      // Public standings can remain available when this wallet's enrollment
      // read fails, but its private stale earning record must not look ready.
      const ownAvailable = snapshotAvailable && !enrollmentRead.error && enrollmentRead.data?.snapshot_status === "ready";
      const e = ownAvailable ? object(object(payload.players)[sess.wallet]) : {}, enrollment = enrollmentRead.error ? null : enrollmentRead.data;
      out.earning = { status: !ownAvailable ? enrollment?.snapshot_status === "failed" ? "failed" : "pending" : ["pending", "ready", "active", "checking", "failed", "confirmed"].includes(e.status) ? e.status : "pending",
        snapshotStatus: enrollment && ["pending", "ready", "failed"].includes(enrollment.snapshot_status) ? enrollment.snapshot_status : null,
        creditFromAt: dateOrNull(e.creditFromAt) ?? dateOrNull(enrollment?.credit_from_at),
        confirmedFillCount: numberOrNull(e.confirmedFillCount), pendingFillCount: numberOrNull(e.pendingFillCount), countedVolumeUsd: numberOrNull(e.countedVolumeUsd), earnedCoins: numberOrNull(e.earnedCoins), lastConfirmedFillAt: dateOrNull(e.lastConfirmedFillAt), updatedAt: dateOrNull(e.updatedAt) };
    }
    return reply(out);
  } catch { return reply(emptyCampaign(period)); }
}
