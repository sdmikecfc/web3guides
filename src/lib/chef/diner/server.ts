import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { CONTENT_VERSION } from "./content";
import { createDinerRecord, DinerAuthorityError, type DinerRecord } from "./authority";

export function dinerServerEnabled() { return process.env.DINER_PREVIEW_SERVER_ENABLED === "true" && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY; }
export function dinerServerStatus() { const enabled = dinerServerEnabled(); return { enabled, authAvailable: enabled, namespace: "street_eats_preview_v1", contentVersion: CONTENT_VERSION, tokenRewards: false }; }
function client(key: string) { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }); }
export function dinerAuthClient() { if (!dinerServerEnabled()) throw new DinerAuthorityError("preview_offline", "Online preview saves are not configured. Your browser preview remains available.", 503); return client(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }
export function dinerDb() { if (!dinerServerEnabled()) throw new DinerAuthorityError("preview_offline", "Online preview saves are not configured.", 503); return client(process.env.SUPABASE_SERVICE_ROLE_KEY!); }
export async function dinerPlayer(req: Request): Promise<string> {
  const authorization = req.headers.get("authorization"), token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || token.length > 4096) throw new DinerAuthorityError("session_required", "Open your preview account to continue.", 401);
  const { data, error } = await dinerAuthClient().auth.getUser(token);
  if (error || !data.user?.id) throw new DinerAuthorityError("session_expired", "Your preview session expired. Reconnect to continue.", 401);
  return data.user.id;
}
export async function loadDinerRecord(db: ReturnType<typeof dinerDb>, player: string, now: number): Promise<DinerRecord> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db.from("diner_preview_players").select("state,clock,revision").eq("player_id", player).maybeSingle();
    if (error) throw new DinerAuthorityError("preview_unavailable", "The preview database has not been prepared or could not be reached.", 503);
    if (data) {
      if (data.state?.version !== 1 || data.state?.contentVersion !== CONTENT_VERSION) throw new DinerAuthorityError("version_mismatch", "This saved preview needs its matching rules version.", 409);
      return { state: data.state, clock: data.clock, revision: Number(data.revision) };
    }
    const record = createDinerRecord(now, `diner:${player}`);
    const initialized = await db.rpc("diner_preview_initialize", { p_player: player, p_state: record.state, p_clock: record.clock });
    if (initialized.error) throw new DinerAuthorityError("preview_unavailable", "The preview account could not be initialized.", 503);
  }
  throw new DinerAuthorityError("preview_unavailable", "Please reconnect to your preview account.", 503);
}
function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])); return value; }
export function dinerFingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function dinerSnapshot(record: DinerRecord) { return { ok: true, state: record.state, revision: record.revision, clock: record.clock, serverTime: Date.now() }; }
