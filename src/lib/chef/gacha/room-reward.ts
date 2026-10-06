import { DOMAIN_COLLECTIBLES, isDomainId, type DomainId } from '../diner/domain-worlds';
import { DOMAIN_RESTAURANT_COLLECTION_VERSION } from '../diner/domain-discoveries';
import { unlockDomainRoomSizes } from '../diner/domain-room-kits';
import type { DinerState } from '../diner/progression';

export interface CollectionRoomReward {
  version: 1;
  source: 'verified-openings';
  wallet: string;
  domain: DomainId;
  catalogueVersion: number;
  receiptId: string;
  earnedAt: number;
  checkedAt: number;
}
export interface VerifiedCollection {
  domain: DomainId; catalogueVersion: number; found: number; total: 24;
  discoveredIds: string[]; missingIds: string[]; complete: boolean;
  completedAt: number | null; receipt: { id: string; earnedAt: number } | null;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const time = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const key = (domain: DomainId, wallet: string) => `collection:${domain}:v${DOMAIN_RESTAURANT_COLLECTION_VERSION}:${wallet}`;

/** Shape validation is not authentication. Only pass the server's own RPC result
 * here, or a response fetched directly with the current wallet's signed session. */
export function parseVerifiedCollection(value: unknown, domain: DomainId, wallet: string): VerifiedCollection {
  if (!isDomainId(domain) || !/^0x[0-9a-f]{40}$/.test(wallet) || !object(value)) throw new Error('Collection record unavailable.');
  const required = DOMAIN_COLLECTIBLES.filter(i => i.domain === domain).map(i => i.id);
  const { discoveredIds: found, missingIds: missing } = value;
  if (value.domain !== domain || value.catalogueVersion !== DOMAIN_RESTAURANT_COLLECTION_VERSION || value.total !== 24 ||
    !Array.isArray(found) || !Array.isArray(missing) || found.length + missing.length !== required.length ||
    [...found, ...missing].some(id => typeof id !== 'string' || !required.includes(id)) || new Set([...found, ...missing]).size !== 24 ||
    value.found !== found.length || value.complete !== (found.length === 24) ||
    (value.complete ? !time(value.completedAt) : value.completedAt !== null)) throw new Error('Collection record unavailable.');
  if (value.receipt !== null && (!value.complete || !object(value.receipt) || value.receipt.id !== key(domain, wallet) || !time(value.receipt.earnedAt))) throw new Error('Collection receipt unavailable.');
  return value as unknown as VerifiedCollection;
}

export function collectionRoomReward(progress: VerifiedCollection, wallet: string, now: number): CollectionRoomReward {
  const checked = parseVerifiedCollection(progress, progress.domain, wallet);
  if (!time(now) || !checked.complete || !checked.receipt || checked.completedAt! > now || checked.receipt.earnedAt > now) throw new Error('Discover all 24 different pieces before claiming this restaurant.');
  return { version: 1, source: 'verified-openings', wallet, domain: checked.domain, catalogueVersion: checked.catalogueVersion,
    receiptId: checked.receipt.id, earnedAt: checked.receipt.earnedAt, checkedAt: now };
}

export function parseCollectionRoomReward(value: unknown, wallet: string, domain: DomainId): CollectionRoomReward {
  if (!object(value) || !/^0x[0-9a-f]{40}$/.test(wallet) || !isDomainId(domain) || value.version !== 1 || value.source !== 'verified-openings' ||
    value.wallet !== wallet || value.domain !== domain || value.catalogueVersion !== DOMAIN_RESTAURANT_COLLECTION_VERSION ||
    value.receiptId !== key(domain, wallet) || !time(value.earnedAt) || !time(value.checkedAt) || value.earnedAt > value.checkedAt ||
    Object.keys(value).some(k => !['version', 'source', 'wallet', 'domain', 'catalogueVersion', 'receiptId', 'earnedAt', 'checkedAt'].includes(k))) throw new Error('This restaurant reward could not be verified for this wallet.');
  return value as unknown as CollectionRoomReward;
}

/** Local beta attachment ONLY, immediately after an authenticated response. This
 * is not a browser command and never supplies evidence to server progression.
 * The live state is extended, not replaced with an online restaurant snapshot. */
export function attachVerifiedCollectionRoom(input: DinerState, value: unknown, wallet: string, domain: DomainId): DinerState {
  const reward = parseCollectionRoomReward(value, wallet, domain), state = structuredClone(input);
  state.domainRooms ??= { version: 1, earned: {} };
  // Earlier journey entitlements and already-issued kit quantities stay intact.
  state.domainRooms.earned[domain] ??= { receiptId: reward.receiptId, seasonId: `collection-v${reward.catalogueVersion}`, earnedAt: reward.earnedAt, stages: [] };
  return unlockDomainRoomSizes(state);
}
