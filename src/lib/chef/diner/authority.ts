/** Diner preview authority. No legacy kitchen state or client reward totals enter here. */
import { activeDinerMode, createDiner, dinerCommandTicks, dinerDay, dinerPauseCommand, dispatchDiner, type DinerCommand, type DinerState } from "./progression";
import { SERVICE_RULES } from "./content";

export const DINER_AUTHORITY_RULES = { version: 1, tickMs: SERVICE_RULES.tickMs, maxActions: 128, maxTicks: 100, maxGapMs: 5_000, presenceGapMs: 30_000, maxBytes: 48_000 } as const;
export interface DinerRecord { state: DinerState; revision: number; clock: { lastAt: number; creditMs: number; pausedForAbsence: boolean } }
export interface DinerEnvelope { id: string; revision: number; commands: DinerCommand[] }
export class DinerAuthorityError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryAfterMs = 0) { super(message); }
}
export function createDinerRecord(now: number, seed: string): DinerRecord {
  return { state: createDiner(now, seed), revision: 0, clock: { lastAt: now, creditMs: 0, pausedForAbsence: false } };
}
const playing = (state: DinerState) => activeDinerMode(state)!==null;
export function validateDinerEnvelope(value: unknown): DinerEnvelope {
  const body = value as Partial<DinerEnvelope> | null;
  if (!body || typeof body !== "object" || Object.keys(body).some(key => !["id", "revision", "commands"].includes(key)) || typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) || !Number.isSafeInteger(body.revision) || body.revision! < 0 || !Array.isArray(body.commands) || !body.commands.length || body.commands.length > DINER_AUTHORITY_RULES.maxActions)
    throw new DinerAuthorityError("invalid_envelope", "An action needs an ID, saved revision, and a bounded input list.");
  let ticks = 0;
  for (const command of body.commands) {
    if (!command || typeof command !== "object" || Array.isArray(command) || typeof command.type !== "string") throw new DinerAuthorityError("invalid_command", "Choose a valid diner action.");
    if (['service','rallyService','eventInput','homeTaskInput'].includes(command.type)&&'action' in command&&command.action?.type==='tick') {
      const count=dinerCommandTicks(command);if (!Number.isSafeInteger(count) || count < 0) throw new DinerAuthorityError("invalid_ticks", "Elapsed ticks must be a whole number.");
      ticks += count;
    }
  }
  if (ticks > DINER_AUTHORITY_RULES.maxTicks) throw new DinerAuthorityError("tape_too_long", "Save at least every five seconds while cooking.");
  return body as DinerEnvelope;
}

/** Ordered replay preserves input/tick timing. An error never commits a partial tape. */
export function replayDiner(current: DinerRecord, commands: DinerCommand[], now: number): { record: DinerRecord; accepted: DinerCommand[]; interrupted: boolean } {
  validateDinerEnvelope({ id: "00000000-0000-4000-8000-000000000000", revision: current.revision, commands });
  const record = structuredClone(current);
  if (!Number.isSafeInteger(now) || now < 0) throw new DinerAuthorityError("invalid_clock", "The diner clock is unavailable.");
  const elapsed = Math.max(0, now - record.clock.lastAt);
  record.clock.lastAt = Math.max(now, record.clock.lastAt);
  // Expire the old selected job before replaying any part of its tape. Otherwise
  // the first tick clears it and a second chunk rejects the entire expiration.
  if(record.state.homeTask&&dinerDay(record.clock.lastAt)>record.state.daily.day&&(activeDinerMode(record.state)==='homeTaskInput'||commands.some(command=>command.type==='homeTaskInput'))){
    const paused:DinerCommand={type:'homeTaskInput',action:{type:'pause'}};
    record.state=dispatchDiner(record.state,paused,{now:record.clock.lastAt}).state;
    record.clock.creditMs=0;record.clock.pausedForAbsence=true;
    return {record,accepted:[paused],interrupted:true};
  }
  if (playing(record.state) && record.clock.creditMs + elapsed > DINER_AUTHORITY_RULES.maxGapMs) {
    const paused = dinerPauseCommand(record.state)!;
    record.state = dispatchDiner(record.state, paused, { now: record.clock.lastAt }).state;
    record.clock.creditMs = 0; record.clock.pausedForAbsence = true;
    return { record, accepted: [paused], interrupted: true };
  }
  if (playing(record.state)) record.clock.creditMs += elapsed;
  else record.clock.creditMs = 0;
  for (const command of commands) {
    const previousMode=activeDinerMode(record.state),wasPlaying = previousMode!==null;
    if (['service','rallyService','eventInput','homeTaskInput'].includes(command.type)&&'action' in command&&command.action.type==='tick') {
      const required = dinerCommandTicks(command) * DINER_AUTHORITY_RULES.tickMs;
      if (!wasPlaying || previousMode!==command.type || required > record.clock.creditMs) throw new DinerAuthorityError("time_credit", "Your shift is still saving. Retry this same action shortly.", 429, Math.max(100, required - record.clock.creditMs));
      record.clock.creditMs -= required;
    }
    // A recent server-observed request interval earns the online rate. Absences
    // settle at 60%; a browser cannot submit a presence flag or elapsed reward.
    const result = dispatchDiner(record.state, command, { now: record.clock.lastAt, online: elapsed <= DINER_AUTHORITY_RULES.presenceGapMs });
    if (result.error) throw new DinerAuthorityError(result.code ?? "invalid_command", result.error);
    record.state = result.state;
    if (previousMode !== activeDinerMode(record.state)) record.clock.creditMs = 0;
    if (playing(record.state)) record.clock.pausedForAbsence = false;
  }
  return { record, accepted: structuredClone(commands), interrupted: false };
}
