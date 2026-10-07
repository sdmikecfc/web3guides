import { ENTRY_MAP, SLOTS, itemId, type Item } from './catalogue';
import type { Workshop8 } from './state';

/** Copies in the cabinet and on robots are different things, even for one design. */
export function partOwnership(state: Workshop8, item: Pick<Item, 'id'>) {
  const spare = state.spares.filter(part => part.item === item.id).length;
  const fitted = state.robots.reduce((total, robot) => total + SLOTS.filter(slot => itemId(robot.choices[slot], slot) === item.id).length, 0);
  return { spare, fitted, total: spare + fitted };
}

export type GarageStep = 'build' | 'resume-fight' | 'resume-build' | 'fight' | 'upgrade' | 'another' | 'crew' | 'full';
export function nextGarageStep(state: Workshop8): GarageStep {
  if (state.active) return 'resume-fight';
  if (state.draft && state.robots.length < 5) return 'resume-build';
  if (!state.robots.length) return 'build';
  const fought = state.history.some(fight => !!fight.robotId && fight.mode !== 'training' && fight.completedAt !== undefined)
    || state.robots.some(robot => robot.wins + robot.losses > 0 || (robot.career?.wins ?? 0) + (robot.career?.losses ?? 0) > 0);
  if (!fought) return 'fight';
  // These are observable saved equipment changes, not an assumed lesson completion.
  const upgraded = state.spares.some(part => part.uid.startsWith('returned:'))
    || state.robots.some(robot => SLOTS.some(slot => (ENTRY_MAP.get(robot.choices[slot])?.tier ?? 1) > 1));
  if (!upgraded) return 'upgrade';
  return state.robots.length === 1 ? 'another' : state.robots.length < 5 ? 'crew' : 'full';
}

export type PurchaseAttempt = { scope: string; item: string; request: string };
/** Synchronous click guard; failed purchases keep their id until their result is known. */
export class PurchaseGate {
  private active = false;
  private attempts = new Map<string, PurchaseAttempt>();
  pending(scope: string) { return this.attempts.get(scope); }
  restore(attempt: PurchaseAttempt) { if (!this.active && !this.attempts.has(attempt.scope)) this.attempts.set(attempt.scope, attempt); }
  begin(scope: string, item: string, makeId: () => string) {
    if (this.active) return null;
    const previous = this.attempts.get(scope);
    if (previous && previous.item !== item) throw Error('Retry your previous purchase before buying another part.');
    const attempt = previous ?? { scope, item, request: makeId() };
    this.attempts.set(scope, attempt); this.active = true;
    return { attempt, retry: !!previous };
  }
  rehome(attempt: PurchaseAttempt, scope: string) {
    if (this.attempts.get(attempt.scope)?.request !== attempt.request) return;
    this.attempts.delete(attempt.scope); attempt.scope=scope; this.attempts.set(scope,attempt);
  }
  finish(attempt: PurchaseAttempt, confirmed: boolean) {
    if (confirmed && this.attempts.get(attempt.scope)?.request === attempt.request) this.attempts.delete(attempt.scope);
    this.active = false;
  }
  confirm(scope: string, request: string) { if (this.attempts.get(scope)?.request === request) this.attempts.delete(scope); }
}

export function definitePurchaseRejection(error: unknown, hadUncertainAttempt = false) {
  const status=(error as {status?:unknown}|null)?.status;
  return !hadUncertainAttempt && typeof status==='number' && status>=400 && status<500 && status!==408 && status!==409;
}
