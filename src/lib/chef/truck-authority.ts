/** Trusted truck input replay. Time and rewards come from this reducer, never a client save. */
import { createTruckProgress, dispatchTruck, TRUCK_TICK_MS, type TruckAction, type TruckContext, type TruckProgress } from "../../app/chef/game/_engine/truck";

export const TRUCK_COMMAND_RULES = { version: 1, maxActions: 128, maxTicks: 100, maxGapMs: 5_000 } as const;
export interface TruckClock { lastAt: number; creditMs: number; pausedForAbsence: boolean }
export interface TruckAuthority { version: 1; progress: TruckProgress; clock: TruckClock }
export class TruckAuthorityError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryAfterMs = 0) { super(message); }
}
function reject(code: string, message: string): never { throw new TruckAuthorityError(code, message); }
export function createTruckAuthority(now: number): TruckAuthority {
  return { version: 1, progress: createTruckProgress(), clock: { lastAt: now, creditMs: 0, pausedForAbsence: false } };
}
const FIELDS: Record<string, readonly string[]> = {
  start: ["node", "practice"], tick: ["ticks"], move: ["dx", "dy"], moveTo: ["x", "y"],
  interact: ["stationId", "choice"], discard: [], pause: [], resume: [], abandon: [], finish: [],
  place: ["machineId", "x", "y", "facing"], moveStation: ["stationId", "x", "y", "facing"],
  rotate: ["stationId"], store: ["stationId"], buyMachine: ["machineId"], buySize: ["size"],
  hire: ["role"], upgrade: ["tech"], setCrew: ["look"], setCosmetic: ["color", "sign"], marketVisit: ["node", "choice"],
};
/** Exact action vocabulary also rejects smuggled clocks, loadouts, and reward deltas. */
export function validateTruckTape(raw: unknown): TruckAction[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > TRUCK_COMMAND_RULES.maxActions) reject("invalid_truck_tape", "Send a short sequence of truck actions.");
  let ticks = 0;
  for (const action of raw) {
    if (!action || typeof action !== "object" || Array.isArray(action) || !Object.hasOwn(FIELDS, action.type)) reject("invalid_truck_action", "Choose a valid truck action.");
    if (Object.keys(action).some(key => key !== "type" && !FIELDS[action.type].includes(key))) reject("invalid_truck_action", "Truck actions cannot include saved progress or rewards.");
    for (const field of ["node", "ticks", "dx", "dy", "x", "y", "stationId", "facing", "look"]) {
      if (field in action && (!Number.isSafeInteger(action[field]) || Math.abs(action[field]) > 1_000_000)) reject("invalid_truck_action", "Truck coordinates and counts must be bounded whole numbers.");
    }
    if (action.type === "tick") {
      if (!Number.isSafeInteger(action.ticks) || action.ticks < 0) reject("invalid_truck_action", "Truck ticks must be a nonnegative whole number.");
      ticks += action.ticks;
    }
    if (action.practice !== undefined && typeof action.practice !== "boolean") reject("invalid_truck_action", "Choose a valid practice mode.");
  }
  if (ticks > TRUCK_COMMAND_RULES.maxTicks) reject("truck_tape_too_long", "Save truck play at least every five seconds.");
  return raw as TruckAction[];
}
export interface TruckReplayResult { authority: TruckAuthority; coinDelta: number; homeGrants: Record<string, number>; stockGrants: Record<string, number>; interrupted: boolean }
/** Replay ordered input against a server-issued clock. Caller commits atomically with its command receipt. */
export function replayTruck(input: TruckAuthority, raw: unknown, now: number, context: TruckContext): TruckReplayResult {
  const actions = validateTruckTape(raw);
  if (!Number.isSafeInteger(now) || now < input.clock.lastAt) reject("invalid_time", "The truck clock is catching up.");
  const authority = structuredClone(input), clock = authority.clock;
  const elapsed = now - clock.lastAt;
  const playing = authority.progress.run?.phase === "playing";
  const result: TruckReplayResult = { authority, coinDelta: 0, homeGrants: {}, stockGrants: {}, interrupted: false };
  clock.lastAt = now;
  if (playing && (elapsed > TRUCK_COMMAND_RULES.maxGapMs || clock.creditMs + elapsed > TRUCK_COMMAND_RULES.maxGapMs)) {
    authority.progress = dispatchTruck(authority.progress, { type: "pause" }, context).truck;
    if (authority.progress.run) authority.progress.run.notice = "Your connection paused. Resume when you are ready; this truck does not run offline.";
    clock.creditMs = 0; clock.pausedForAbsence = true; result.interrupted = true;
    return result;
  }
  clock.creditMs = playing ? Math.min(TRUCK_COMMAND_RULES.maxGapMs, clock.creditMs + elapsed) : 0;
  for (const action of actions) {
    if (action.type === "tick") {
      const requestedMs = action.ticks * TRUCK_TICK_MS;
      if (authority.progress.run?.phase !== "playing") reject("truck_not_playing", "Resume your truck before advancing play.");
      if (requestedMs > clock.creditMs) throw new TruckAuthorityError("truck_time_credit", "Wait for the truck clock, then retry this same action.", 429, requestedMs - clock.creditMs);
      clock.creditMs -= requestedMs;
    }
    const beforePhase = authority.progress.run?.phase;
    const next = dispatchTruck(authority.progress, action, { ...context, coins: context.coins + result.coinDelta, now });
    if (next.error) reject("truck_action_refused", next.error);
    if (!Number.isSafeInteger(next.coinDelta) || context.coins + result.coinDelta + next.coinDelta < 0) reject("invalid_truck_reward", "The truck could not verify this action.");
    authority.progress = next.truck;
    result.coinDelta += next.coinDelta;
    for (const key of ["homeGrants", "stockGrants"] as const) for (const [id, amount] of Object.entries(next[key])) {
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000) reject("invalid_truck_reward", "The truck could not verify this reward.");
      result[key][id] = (result[key][id] ?? 0) + amount;
    }
    // Pause/finish and new runs cannot carry banked movement time across boundaries.
    if (beforePhase !== authority.progress.run?.phase || action.type === "start") clock.creditMs = 0;
    if (action.type === "resume" || action.type === "start") clock.pausedForAbsence = false;
  }
  return result;
}
