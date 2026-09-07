import "server-only";
import type { CampaignEnrollmentView } from "@/lib/bots/onboarding-types";
import type { BotsDb } from "./db";

/** Trading eligibility waits for the reporter's capital snapshot; owning a toy never does. */
export async function campaignEnrollment(db: BotsDb, wallet: string, request = false, isTest = false): Promise<CampaignEnrollmentView> {
  const unavailable: CampaignEnrollmentView = { campaignId: null, campaignStatus: "unavailable", snapshotStatus: "pending" };
  try {
    const now = new Date().toISOString();
    const { data: active, error } = await db.from("battle_bots_campaigns").select("id,status,starts_at,ends_at,created_at")
      .eq("status", "active").lte("starts_at", now).gt("ends_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return unavailable;
    if (!active) {
      const { data: draft } = await db.from("battle_bots_campaigns").select("id").eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return draft ? { ...unavailable, campaignId: String(draft.id), campaignStatus: "draft" } : unavailable;
    }
    let row: { snapshot_status?: string } | null = null;
    if (request) {
      const { data, error: rpcError } = await db.rpc("bb_campaign_request_enrollment", { p_campaign_id: active.id, p_wallet: wallet.toLowerCase(), p_requested_at: now, p_is_test: isTest });
      if (rpcError) return unavailable;
      row = Array.isArray(data) ? data[0] : data;
    } else {
      const { data, error: readError } = await db.from("battle_bots_campaign_enrollments").select("snapshot_status").eq("campaign_id", active.id).eq("wallet", wallet.toLowerCase()).maybeSingle();
      if (readError) return unavailable;
      row = data;
    }
    const status = row?.snapshot_status;
    return { campaignId: String(active.id), campaignStatus: "active", snapshotStatus: status === "ready" || status === "failed" ? status : "pending" };
  } catch { return unavailable; }
}
