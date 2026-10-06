import type { DecorDef } from './collections';
import type { DomainCollectible } from './domain-worlds';
import type { DinerState, HomePlacement } from './progression';

/** Free, neutral supports, not NFTs or evidence of NFT ownership. They keep the
 * physical layout stable while ownership is syncing or a collectible leaves. */
export const COLLECTION_DISPLAY_SPOTS: DecorDef[] = (['floor', 'wall', 'counter', 'ceiling'] as const).flatMap(mount => [1, 2].map(width => ({
  id: `collection_spot_${mount}_${width}`, name: `${width === 2 ? 'Wide ' : ''}${mount} display spot`,
  description: 'A free display support. Move or store it like other furniture.',
  footprint: [width, 1] as [number, number], price: 0, setId: 'collection_supports', collectible: true,
  displaySlot: mount, wall: mount === 'wall', counter: mount === 'counter', ceiling: mount === 'ceiling',
  passable: mount === 'ceiling',
})));
export const COLLECTION_SPOT_BY_ID = Object.fromEntries(COLLECTION_DISPLAY_SPOTS.map(s => [s.id, s]));
export function displaySpotKind(item: Pick<DomainCollectible, 'mount' | 'footprint'>) {
  const id = `collection_spot_${item.mount}_${item.footprint[0]}`;
  return item.footprint[1] === 1 && COLLECTION_SPOT_BY_ID[id] ? id : null;
}
/** Preview and confirmed command use the same non-financial support inventory. */
export function displaySpotDraft(state: DinerState, placement: HomePlacement) {
  const spot = placement && typeof placement.equipmentId === 'string' && Object.hasOwn(COLLECTION_SPOT_BY_ID,placement.equipmentId) ? COLLECTION_SPOT_BY_ID[placement.equipmentId] : null;
  if (!spot || !state.home.roomPlan) throw new Error('Choose a collectible display spot in your restaurant.');
  if (spot.displaySlot === 'floor' ? !!placement.mount : placement.mount?.kind !== spot.displaySlot) throw new Error('Choose the matching display surface.');
  const existing = state.home.layout.find(p => p.id === placement.id);
  if (existing && existing.equipmentId !== placement.equipmentId) throw new Error('This position belongs to another furnishing.');
  const layout = [...state.home.layout.filter(p => p.id !== placement.id), placement];
  const count = layout.filter(p => p.equipmentId === placement.equipmentId).length;
  const candidate = { ...state, home: { ...state.home, layout }, decorOwned: { ...state.decorOwned, [placement.equipmentId]: Math.max(state.decorOwned[placement.equipmentId] ?? 0, count) } };
  return candidate;
}
