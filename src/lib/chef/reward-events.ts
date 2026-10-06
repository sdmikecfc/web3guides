/** Finite, reviewed token-pilot accounting. This module never sends a transaction.
 * Funding/rights/cohort evidence must come from trusted operator verification,
 * never from HTTP request bodies or a player's save. */
import { createHash } from "node:crypto";
import { createTruckAuthority, replayTruck, type TruckAuthority } from "./truck-authority";
import { createEqualTruckProgress, type TruckAction } from "../../app/chef/game/_engine/truck";

const ZERO = BigInt(0), ONE = BigInt(1);
const walletPattern = /^0x[a-f0-9]{40}$/;
const hashPattern = /^0x[a-f0-9]{64}$/;
export const REWARD_EVENT_RULES = { version: 1, maxCohort: 500, maxDepth: 8, bands: [{ depth: 3, weight: 100 }, { depth: 6, weight: 110 }, { depth: 8, weight: 125 }] } as const;
export interface RewardEvent {
  version: 1; id: string; chainId: number; token: string; escrow: string; domain: string;
  startsAt: number; endsAt: number; poolAtomic: string; rulesDigest: string;
}
export interface ReviewedEventEvidence {
  /** The funding adapter must verify a dedicated, committed event reserve. */
  funding: { eventId: string; chainId: number; token: string; escrow: string; amountAtomic: string; transactionHash: string; blockHash: string; verifiedAt: number };
  rights: { eventId: string; domain: string; agreementDigest: string; expiresAt: number; reviewedBy: string };
  cohort: { eventId: string; wallets: string[]; reviewDigest: string; reviewedBy: string; closedAt: number };
}
export class RewardEventError extends Error { constructor(public code: string, message: string) { super(message); } }
function requireRule(test: unknown, code: string, message: string): asserts test { if (!test) throw new RewardEventError(code, message); }
function atomic(value: string): bigint {
  requireRule(typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value), "invalid_amount", "Token amounts must use exact nonnegative integer units.");
  return BigInt(value);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export function rewardDigest(value: unknown): string { return `0x${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`; }
export function rewardRulesDigest(): string { return rewardDigest(REWARD_EVENT_RULES); }
/** Structural gate only. Authenticity of the evidence is the server adapter's responsibility. */
export function validateEventEvidence(event: RewardEvent, evidence: ReviewedEventEvidence): void {
  requireRule(event.version === 1 && /^[a-z0-9][a-z0-9-]{2,63}$/.test(event.id), "invalid_event", "Choose a versioned event.");
  requireRule(Number.isSafeInteger(event.chainId) && event.chainId > 0 && walletPattern.test(event.token) && walletPattern.test(event.escrow), "invalid_event", "The event chain and token must be explicit.");
  requireRule(Number.isSafeInteger(event.startsAt) && Number.isSafeInteger(event.endsAt) && event.startsAt >= 0 && event.endsAt > event.startsAt && event.domain.length > 0 && event.domain.length <= 253, "invalid_event", "The event needs a bounded schedule and domain.");
  requireRule(atomic(event.poolAtomic) > ZERO && event.rulesDigest === rewardRulesDigest(), "invalid_event", "The event needs a finite pool and the current reviewed scoring rules.");
  const { funding, rights, cohort } = evidence;
  requireRule(funding.eventId === event.id && funding.chainId === event.chainId && funding.token === event.token && funding.escrow === event.escrow && atomic(funding.amountAtomic) >= atomic(event.poolAtomic) && hashPattern.test(funding.transactionHash) && hashPattern.test(funding.blockHash) && Number.isSafeInteger(funding.verifiedAt) && funding.verifiedAt <= event.startsAt, "funding_missing", "A verified committed reserve must cover this event before it opens.");
  requireRule(rights.eventId === event.id && rights.domain === event.domain && hashPattern.test(rights.agreementDigest) && rights.expiresAt >= event.endsAt && !!rights.reviewedBy, "rights_missing", "Domain-control rights must cover the entire event.");
  requireRule(cohort.eventId === event.id && cohort.wallets.length > 0 && cohort.wallets.length <= REWARD_EVENT_RULES.maxCohort && new Set(cohort.wallets).size === cohort.wallets.length && cohort.wallets.every(wallet => walletPattern.test(wallet)) && hashPattern.test(cohort.reviewDigest) && !!cohort.reviewedBy && Number.isSafeInteger(cohort.closedAt) && cohort.closedAt <= event.startsAt, "cohort_missing", "A bounded, manually reviewed cohort must be frozen before opening.");
}
export function depthWeight(depth: number): number {
  requireRule(Number.isSafeInteger(depth) && depth >= 0 && depth <= REWARD_EVENT_RULES.maxDepth, "invalid_depth", "Only verified service-day depth can be scored.");
  return depth >= 8 ? 125 : depth >= 6 ? 110 : depth >= 3 ? 100 : 0;
}
export interface EventEntry { eventId: string; rulesDigest: string; wallet: string; bestDepth: number; truck: TruckAuthority }
/** Fixed pilot kit; permanent home/normal-truck upgrades never enter this snapshot. */
export function createEqualEventTruck(now: number): TruckAuthority {
  const truck = createTruckAuthority(now);
  truck.progress = createEqualTruckProgress();
  return truck;
}
export function enterRewardEvent(event: RewardEvent, evidence: ReviewedEventEvidence, wallet: string, now: number): EventEntry {
  validateEventEvidence(event, evidence);
  requireRule(now >= event.startsAt && now < event.endsAt, "event_closed", "This event is not open.");
  requireRule(evidence.cohort.wallets.includes(wallet), "not_eligible", "This pilot uses its reviewed participant list.");
  return { eventId: event.id, rulesDigest: event.rulesDigest, wallet, bestDepth: 0, truck: createEqualEventTruck(now) };
}
const eventActions = new Set(["start", "tick", "move", "moveTo", "interact", "discard", "pause", "resume", "abandon", "finish", "marketVisit"]);
/** Best depth only: replaying orders/days never adds scoring weight or home rewards. */
export function replayRewardEvent(entry: EventEntry, event: RewardEvent, evidence: ReviewedEventEvidence, actions: TruckAction[], now: number): EventEntry {
  validateEventEvidence(event, evidence);
  requireRule(entry.eventId === event.id && entry.rulesDigest === event.rulesDigest && evidence.cohort.wallets.includes(entry.wallet), "event_changed", "The event snapshot does not match this participant.");
  requireRule(now >= event.startsAt && now < event.endsAt, "event_closed", "This event has closed.");
  requireRule(Array.isArray(actions) && actions.every(action => action && eventActions.has(action.type) && !(action.type === "start" && action.practice)), "event_loadout_fixed", "Pilot equipment, recipes, and upgrades are the same for everyone.");
  const result = replayTruck(entry.truck, actions, now, { coins: 0, recipeLevels: {}, seed: `${event.id}:equal-kit-v1`, runId: `${event.id}:${entry.wallet}:${entry.truck.progress.attempts + 1}` });
  const next = { ...structuredClone(entry), truck: result.authority };
  // The engine's bestDay is the number of service days cleared, excluding markets.
  next.bestDepth = Math.max(entry.bestDepth, Math.min(REWARD_EVENT_RULES.maxDepth, result.authority.progress.bestDay));
  // Ignore all normal-mode coin, stock, and home grants. No ownership escapes this ledger.
  return next;
}
export interface RewardAllocation { wallet: string; bestDepth: number; weight: number; amountAtomic: string }
export interface RewardManifest {
  version: 1; eventId: string; chainId: number; token: string; escrow: string; poolAtomic: string;
  rulesDigest: string; evidenceDigest: string; closedAt: number; allocations: readonly RewardAllocation[];
  allocatedAtomic: string; unallocatedAtomic: string; digest: string;
}
/** Exact largest-remainder allocation. Input must be the final reviewed server ledger. */
export function createRewardManifest(event: RewardEvent, evidence: ReviewedEventEvidence, entries: readonly Pick<EventEntry, "wallet" | "bestDepth" | "eventId" | "rulesDigest">[], now: number): RewardManifest {
  validateEventEvidence(event, evidence);
  requireRule(Number.isSafeInteger(now) && now >= event.endsAt, "event_open", "Close and review the event before allocating its pool.");
  requireRule(entries.length <= evidence.cohort.wallets.length && new Set(entries.map(entry => entry.wallet)).size === entries.length, "duplicate_entry", "A wallet may have only one final best-depth entry.");
  const allocations = entries.map(entry => {
    requireRule(entry.eventId === event.id && entry.rulesDigest === event.rulesDigest && evidence.cohort.wallets.includes(entry.wallet), "invalid_entry", "Only this event's reviewed participants can receive an allocation.");
    return { wallet: entry.wallet, bestDepth: entry.bestDepth, weight: depthWeight(entry.bestDepth), amount: ZERO, remainder: ZERO };
  }).filter(entry => entry.weight > 0).sort((a,b) => a.wallet.localeCompare(b.wallet));
  const pool = atomic(event.poolAtomic), total = allocations.reduce((sum, entry) => sum + BigInt(entry.weight), ZERO);
  let allocated = ZERO;
  if (total > ZERO) {
    for (const entry of allocations) { const numerator = pool * BigInt(entry.weight); entry.amount = numerator / total; entry.remainder = numerator % total; allocated += entry.amount; }
    const rounding = [...allocations].sort((a,b) => a.remainder === b.remainder ? a.wallet.localeCompare(b.wallet) : a.remainder > b.remainder ? -1 : 1);
    for (let i = 0; allocated < pool; i++) { rounding[i].amount += ONE; allocated += ONE; }
  }
  const body = { version: 1 as const, eventId: event.id, chainId: event.chainId, token: event.token, escrow: event.escrow, poolAtomic: event.poolAtomic,
    rulesDigest: event.rulesDigest, evidenceDigest: rewardDigest(evidence), closedAt: event.endsAt,
    allocations: allocations.map(({wallet,bestDepth,weight,amount}) => Object.freeze({wallet,bestDepth,weight,amountAtomic:amount.toString()})),
    allocatedAtomic: allocated.toString(), unallocatedAtomic: (pool - allocated).toString() };
  Object.freeze(body.allocations);
  return Object.freeze({ ...body, digest: rewardDigest(body) });
}
export interface ConfirmedPayoutReceipt { manifestDigest: string; wallet: string; amountAtomic: string; chainId: number; token: string; transactionHash: string; logIndex: number; blockHash: string }
/** Reconcile externally confirmed chain logs; never retry a transfer from missing HTTP acknowledgement. */
export function reconcilePayoutReceipts(manifest: RewardManifest, receipts: readonly ConfirmedPayoutReceipt[]) {
  const { digest, ...body } = manifest;
  requireRule(digest === rewardDigest(body), "manifest_changed", "The allocation manifest has changed.");
  const events = new Set<string>(), byWallet = new Map<string, ConfirmedPayoutReceipt>();
  for (const receipt of receipts) {
    const allocation = manifest.allocations.find(entry => entry.wallet === receipt.wallet);
    requireRule(receipt.manifestDigest === digest && receipt.chainId === manifest.chainId && receipt.token === manifest.token && hashPattern.test(receipt.transactionHash) && hashPattern.test(receipt.blockHash) && Number.isSafeInteger(receipt.logIndex) && receipt.logIndex >= 0 && allocation?.amountAtomic === receipt.amountAtomic && atomic(receipt.amountAtomic) > ZERO, "invalid_receipt", "The confirmed transfer must match this exact nonzero manifest allocation.");
    const id = `${receipt.chainId}:${receipt.transactionHash}:${receipt.logIndex}`;
    const previous = byWallet.get(receipt.wallet);
    if (previous && rewardDigest(previous) === rewardDigest(receipt)) continue;
    requireRule(!previous && !events.has(id), "duplicate_payout", "A wallet or chain transfer log has already been reconciled.");
    events.add(id); byWallet.set(receipt.wallet, { ...receipt });
  }
  const paidAtomic = Array.from(byWallet.values()).reduce((sum, receipt) => sum + atomic(receipt.amountAtomic), ZERO);
  return { manifestDigest: digest, paidAtomic: paidAtomic.toString(), remainingAtomic: (atomic(manifest.allocatedAtomic) - paidAtomic).toString(), paidWallets: Array.from(byWallet.keys()).sort(), pendingWallets: manifest.allocations.filter(entry => atomic(entry.amountAtomic) > ZERO && !byWallet.has(entry.wallet)).map(entry => entry.wallet) };
}
