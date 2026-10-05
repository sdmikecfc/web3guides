import "server-only";
import type { BotsDb } from "./db";

export interface ProgressView {
  source: "available" | "unavailable";
  activeDays: number | null;
  firstSeenAt: string | null;
  firstBuildAt: string | null;
  firstFightAt: string | null;
  awards: Array<{ id: string; kind: string; color: string; earnedAt: string }>;
}
const unavailable = (): ProgressView => ({ source: "unavailable", activeDays: null, firstSeenAt: null, firstBuildAt: null, firstFightAt: null, awards: [] });
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
function publicProgress(raw: unknown): ProgressView {
  if (!raw || typeof raw !== "object") return unavailable();
  const r = raw as Record<string, unknown>;
  if (typeof r.activeDays !== "number" || !Number.isSafeInteger(r.activeDays) || r.activeDays < 0) return unavailable();
  return { source: "available", activeDays: r.activeDays, firstSeenAt: date(r.firstSeenAt), firstBuildAt: date(r.firstBuildAt), firstFightAt: date(r.firstFightAt),
    awards: Array.isArray(r.awards) ? r.awards.filter((a): a is Record<string, string> => !!a && typeof a === "object" && typeof a.id === "string" && typeof a.kind === "string" && typeof a.color === "string" && date(a.earnedAt) !== null).map(a => ({ id: a.id, kind: a.kind, color: a.color, earnedAt: a.earnedAt })) : [] };
}
/** No event type or date comes from the browser; the RPC uses its own UTC day. */
export async function touchProgress(db: BotsDb, wallet: string): Promise<ProgressView> {
  try { const { data, error } = await db.rpc("bb_progress_touch", { p_wallet: wallet.toLowerCase() }); return error ? unavailable() : publicProgress(data); }
  catch { return unavailable(); }
}
/** Called only after the save route has validated and bound the owned parts. */
export async function noteSavedBuild(db: BotsDb, wallet: string, botId: number): Promise<void> {
  try { await db.rpc("bb_progress_saved_build", { p_wallet: wallet.toLowerCase(), p_bot_id: botId }); } catch { /* additive migration may arrive after the web */ }
}
export async function readProgress(db: BotsDb, wallet: string): Promise<ProgressView> {
  try { const { data, error } = await db.rpc("bb_progress_view", { p_wallet: wallet.toLowerCase() }); return error ? unavailable() : publicProgress(data); }
  catch { return unavailable(); }
}
