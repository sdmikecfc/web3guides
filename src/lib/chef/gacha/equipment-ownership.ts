import { keccak256, stringToHex } from 'viem';
import { DOMAIN_COLLECTIBLE_BY_ID, type DomainId } from '../diner/domain-worlds';
import { appearanceTargets } from '../diner/collectible-appearances';
import type { DinerState } from '../diner/progression';
import { EQUIPMENT_BY_ID } from '../diner/content';
import { COLLECTION_SPOT_BY_ID, displaySpotKind } from '../diner/collection-display-spots';

/** A beta layout reference is presentation data, never ownership/progress evidence. */
export interface EquipmentDestination { room: string; location: 'home' | 'truck'; id: string; kind: string; display?: true }
export interface OwnedEquipmentItem { tokenId: string; itemId: string; catalogueVersion: 3; destination: EquipmentDestination | null }
export interface EquipmentInventory {
  domain: DomainId; revision: string; ready: boolean;
  checkpoint: { block: string; hash: string; timestamp: number } | null;
  items: OwnedEquipmentItem[];
}
export interface EquipmentAssignmentRequest { requestId: string; revision: string; tokenId: string; destination: EquipmentDestination | null }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const unsignedId = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < (BigInt(1) << BigInt(256));
export function parseEquipmentDestination(v: unknown): EquipmentDestination {
  if (!record(v) || !exact(v, v.display === true ? ['room', 'location', 'id', 'kind', 'display'] : ['room', 'location', 'id', 'kind']) || typeof v.room !== 'string' || !/^0x[0-9a-f]{64}$/.test(v.room)
    || !['home', 'truck'].includes(String(v.location)) || typeof v.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(v.id)
    || typeof v.kind !== 'string' || !/^[a-z_0-9]{1,40}$/.test(v.kind) || v.display === true && (v.location !== 'home' || !COLLECTION_SPOT_BY_ID[v.kind])) throw new Error('Invalid equipment destination');
  return v as unknown as EquipmentDestination;
}
export function parseEquipmentAssignment(v: unknown): EquipmentAssignmentRequest {
  if (!record(v) || !exact(v, ['requestId', 'revision', 'tokenId', 'destination']) || typeof v.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.requestId)
    || !unsignedId(v.revision) || !unsignedId(v.tokenId)) throw new Error('Invalid equipment assignment');
  return { requestId: v.requestId, revision: v.revision, tokenId: v.tokenId, destination: v.destination === null ? null : parseEquipmentDestination(v.destination) };
}
export const equipmentRoomKey = (state: Pick<DinerState, 'seed'>) => keccak256(stringToHex(state.seed));
export const equipmentTargetKey = (d: EquipmentDestination) => keccak256(stringToHex(JSON.stringify([d.room, d.location, d.id])));
export function equipmentDestinations(state: DinerState, location: EquipmentDestination['location']) {
  return appearanceTargets(state, location).filter(t => !!EQUIPMENT_BY_ID[t.kind] && (location === 'home' ? state.equipment[t.kind]?.homeCopies > 0 : state.equipment[t.kind]?.truckOwned)).map(t => ({ room: equipmentRoomKey(state), location, ...t }));
}
export function equipmentDestinationError(state: DinerState, itemId: string, destination: EquipmentDestination): string | null {
  const item = DOMAIN_COLLECTIBLE_BY_ID[itemId];
  if(destination.display){
    if(!item || displaySpotKind(item)!==destination.kind)return 'Choose a matching display surface.';
    return destination.location==='home' && destination.room===equipmentRoomKey(state) && state.home.layout.some(p=>p.id===destination.id&&p.equipmentId===destination.kind) ? null : 'Place the display spot first.';
  }
  if (!item?.machine || item.machine !== destination.kind) return 'Choose a compatible machine.';
  if (destination.room !== equipmentRoomKey(state) || !equipmentDestinations(state, destination.location).some(d => d.id === destination.id && d.kind === destination.kind)) return 'Load or place this machine first.';
  return null;
}
export function parseEquipmentInventory(v: unknown, domain: DomainId): EquipmentInventory {
  if (!record(v) || v.domain !== domain || !unsignedId(v.revision) || typeof v.ready !== 'boolean' || !Array.isArray(v.items)) throw new Error('Invalid owned equipment response');
  const checkpoint = v.checkpoint;
  if (checkpoint !== null && (!record(checkpoint) || !unsignedId(checkpoint.block) || typeof checkpoint.hash !== 'string' || !/^0x[0-9a-f]{64}$/.test(checkpoint.hash) || !Number.isSafeInteger(checkpoint.timestamp) || Number(checkpoint.timestamp) < 0)) throw new Error('Invalid ownership checkpoint');
  if (!v.ready && v.items.length || v.ready && checkpoint === null) throw new Error('Ownership is still syncing');
  const seen = new Set<string>();
  const items = v.items.map(raw => {
    if (!record(raw) || !unsignedId(raw.tokenId) || seen.has(raw.tokenId) || typeof raw.itemId !== 'string' || raw.catalogueVersion !== 3) throw new Error('Invalid owned item');
    seen.add(raw.tokenId); const item = DOMAIN_COLLECTIBLE_BY_ID[raw.itemId];
    if (!item || item.domain !== domain) throw new Error('Wrong collection');
    const destination = raw.destination === null ? null : parseEquipmentDestination(raw.destination);
    if (destination && (destination.display ? displaySpotKind(item)!==destination.kind : item.machine !== destination.kind)) throw new Error('Incompatible saved appearance');
    return { tokenId: raw.tokenId, itemId: raw.itemId, catalogueVersion: 3 as const, destination };
  });
  return { domain, revision: v.revision, ready: v.ready, checkpoint: checkpoint as EquipmentInventory['checkpoint'], items };
}
/** Overlay only: neither a DinerState mutation nor a cooking input. Fail closed. */
export function equipmentSkinOverlays(state: DinerState, inventory: EquipmentInventory | null, location: EquipmentDestination['location']) {
  const result: Record<string, string> = {};
  if (!inventory?.ready || location === 'truck' && (state.rally.service || state.run?.practice)) return result;
  for (const item of inventory.items) if (item.destination?.location === location && !equipmentDestinationError(state, item.itemId, item.destination)) result[item.destination.id] = item.itemId;
  return result;
}
