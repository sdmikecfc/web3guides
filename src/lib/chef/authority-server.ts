import "server-only";
import { createHash } from "node:crypto";
import { dkDb, DK_GAME_KEY } from "./server";
import { initializeKitchen, syncDeliveryFromAuthority, publicAuthority, featuredItems, dailyIngredientOffers, applyKitchenCommand, KitchenCommandError, type AuthorityState, type KitchenRecord, type KitchenCommand } from "./authority";
import { createEqualEventTruck, enterRewardEvent, replayRewardEvent, RewardEventError, type RewardEvent, type ReviewedEventEvidence } from "./reward-events";
import { TruckAuthorityError } from "./truck-authority";
import { sanitizeSave } from "../../app/chef/game/_engine/save";
import { handleOf } from "./board";
import { KITCHEN_RULES, utcKitchenDay } from "./rules";

export const authorityEnabled = () => process.env.NEXT_PUBLIC_DK_AUTHORITY_ENABLED === "true";
type VerifiedTruckEvent = { event: RewardEvent; evidence: ReviewedEventEvidence };
/** No funding/rights verification integration has been provisioned. A feature
 * flag, environment JSON, or player request is deliberately insufficient.
 * Replace this registry only with reviewed, authenticated verification data. */
function verifiedTruckEvent(_id?: string): VerifiedTruckEvent | null { return null; }
export function truckEventStatus() {
  return { enabled: false, event: null, code: "event_unavailable", label: "Token pilot not open",
    reason: "No verified funded event is configured.", rules: { serviceDays: 8, marketStops: 4, qualifyingDepths: [3, 6, 8], weights: [100, 110, 125], scoring: "best-depth", retries: "unlimited", loadout: "equal" },
    gates: { configured: false, fundingVerified: false, domainRightsVerified: false, cohortReviewed: false, payoutAdapterAvailable: false } };
}
/** Event play reuses the exact same wallet revision and SQL command receipt as
 * home play. Its truck ledger never replaces the player's normal truck. */
export function applyServerKitchenCommand(current: KitchenRecord, command: KitchenCommand, now: number, wallet: string, target?: { id: string; record: KitchenRecord }) {
  if (command.type !== "truckEvent") return applyKitchenCommand(current, command, now, wallet, target);
  const verified = verifiedTruckEvent(command.eventId);
  if (!verified) throw new KitchenCommandError("event_unavailable", "No verified, funded truck event is open.", 503);
  const next = applyKitchenCommand(current, { type: "settle" }, now, wallet);
  const ledger = next.actor.authority.truckEvents ??= {};
  try {
    const existing = ledger[command.eventId];
    if (command.action.type === "enter") {
      if (existing) throw new KitchenCommandError("already_entered", "Resume your existing event truck.");
      ledger[command.eventId] = enterRewardEvent(verified.event, verified.evidence, wallet, now);
    } else {
      if (!existing) throw new KitchenCommandError("event_entry_missing", "Enter this event before playing.");
      if (command.action.type === "restart") {
        // Validate the current schedule/cohort again; retain only the best receipt.
        enterRewardEvent(verified.event, verified.evidence, wallet, now);
        ledger[command.eventId] = { ...existing, truck: createEqualEventTruck(now) };
      } else if (command.action.type === "play") ledger[command.eventId] = replayRewardEvent(existing, verified.event, verified.evidence, command.action.actions, now);
      else throw new KitchenCommandError("invalid_command", "Choose a valid event action.");
    }
    return next;
  } catch (error) {
    if (error instanceof RewardEventError || error instanceof TruckAuthorityError) throw new KitchenCommandError(error.code, error.message, error instanceof TruckAuthorityError ? error.status : 400, error instanceof TruckAuthorityError ? error.retryAfterMs || undefined : undefined);
    throw error;
  }
}
type Db = ReturnType<typeof dkDb>;
type Player = { state: unknown; authority_state: AuthorityState | null; state_revision: number; updated_at: string };

export async function loadKitchen(db: Db, wallet: string, now: number): Promise<KitchenRecord> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from("domain_kitchen_players").select("state,authority_state,state_revision,updated_at")
      .eq("game_key", DK_GAME_KEY).eq("wallet", wallet).maybeSingle<Player>();
    if (error) throw new KitchenCommandError("authority_unavailable", "The restaurant service is unavailable. Your saved kitchen is safe.", 503);
    if (data?.authority_state) return syncDeliveryFromAuthority({ save: sanitizeSave(data.state), authority: data.authority_state, revision: Number(data.state_revision) });
    const record = initializeKitchen(data?.state ?? null, now);
    const { data: initialized, error: initError } = await db.rpc("dk_initialize_authority", {
      p_game: DK_GAME_KEY, p_wallet: wallet, p_save: record.save, p_authority: record.authority,
      p_expected_updated_at: data?.updated_at ?? null,
    });
    if (initError) throw new KitchenCommandError("authority_unavailable", "The restaurant service is updating. Please try again soon.", 503);
    if (initialized?.ok === false && initialized?.code !== "conflict") break;
  }
  throw new KitchenCommandError("conflict", "Your kitchen changed on another device. Load it again.", 409);
}

/** Public handles resolve beyond the leaderboard; ambiguous prefixes never pick a random player. */
export async function resolveKitchenHandle(db: Db, input: unknown): Promise<string | null> {
  if (typeof input !== "string") return null;
  const handle = input.toLowerCase();
  if (!/^0x[a-f0-9]{4}…[a-f0-9]{4}$/.test(handle)) return null;
  const [prefix, suffix] = handle.split("…");
  const { data, error } = await db.from("domain_kitchen_players").select("wallet").eq("game_key", DK_GAME_KEY)
    .eq("is_test", false).like("wallet", `${prefix}%${suffix}`).limit(2);
  return !error && data?.length === 1 && handleOf(data[0].wallet).toLowerCase() === handle ? data[0].wallet : null;
}

export async function neighborView(db: Db, record: KitchenRecord, now = Date.now()) {
  const wallets = Object.keys(record.authority.neighbors);
  if (!wallets.length) return [];
  const { data, error } = await db.from("domain_kitchen_players").select("wallet,name:state->>name")
    .eq("game_key", DK_GAME_KEY).in("wallet", wallets);
  if (error) return [];
  const sameDay = record.authority.socialDay === utcKitchenDay(now);
  const pairs = sameDay ? record.authority.socialPairs : {};
  const remaining = !sameDay || record.authority.socialUsed < KITCHEN_RULES.socialIngredientsPerDay;
  return (data ?? []).map((r) => ({
    handle: handleOf(r.wallet), name: typeof r.name === "string" ? r.name.slice(0, 24) : "", status: record.authority.neighbors[r.wallet],
    parcelAvailable: record.authority.neighbors[r.wallet] === "friend" && remaining && !pairs[`find:${r.wallet}`],
    helpAvailable: record.authority.neighbors[r.wallet] === "friend" && !pairs[`help:${r.wallet}`],
  }));
}

export async function kitchenResponse(db: Db, record: KitchenRecord, now: number) {
  return { ok: true, save: record.save, revision: record.revision, authority: publicAuthority(record, now),
    neighbors: await neighborView(db, record, now), featured: featuredItems(now), ingredientOffers: dailyIngredientOffers(now, record.authority), truckEvent: truckEventStatus(), serverTime: now };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
/** The same key with a different command is an error; JSON property order is irrelevant. */
export function commandFingerprint(command: KitchenCommand): string {
  return createHash("sha256").update(JSON.stringify(canonical(command))).digest("hex");
}
