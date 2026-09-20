/** Small, serializable cooking receipts. Only the service reducer creates portions. */
export const BATCH_RULES = { version: 1, friesPortions: 3 } as const;
export type FryBatch = { version: 1; recipeId: 'fries'; total: 3; remaining: number; phase: 'cooking' | 'ready' | 'raised' | 'burnt'; createdTick: number };

export function createFryBatch(tick: number): FryBatch {
  return { version: 1, recipeId: 'fries', total: BATCH_RULES.friesPortions, remaining: BATCH_RULES.friesPortions, phase: 'cooking', createdTick: Number.isSafeInteger(tick) && tick >= 0 ? tick : 0 };
}
export function validateFryBatch(raw: unknown): FryBatch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as FryBatch;
  const keys = ['version', 'recipeId', 'total', 'remaining', 'phase', 'createdTick'];
  if (keys.some(k => !Object.hasOwn(b,k)) || Object.keys(b).some(k => !keys.includes(k)) || b.version !== 1 || b.recipeId !== 'fries' || b.total !== 3 || !Number.isSafeInteger(b.remaining) || b.remaining < 1 || b.remaining > 3 || !['cooking', 'ready', 'raised', 'burnt'].includes(b.phase) || !Number.isSafeInteger(b.createdTick) || b.createdTick < 0 || (b.phase !== 'raised' && b.remaining !== 3)) return null;
  return { ...b };
}
export function markFryBatchReady(batch: FryBatch): FryBatch {
  return batch.phase === 'cooking' ? { ...batch, phase: 'ready' } : { ...batch };
}
export function raiseFryBatch(batch: FryBatch): FryBatch | null {
  return batch.phase === 'ready' ? { ...batch, phase: 'raised' } : null;
}
export function burnFryBatch(batch: FryBatch): FryBatch {
  return batch.phase === 'cooking' || batch.phase === 'ready' ? { ...batch, phase: 'burnt' } : { ...batch };
}
/** The caller allocates a new item ID only after this succeeds. The original
 * potato stays in the machine until the final portion consumes its receipt. */
export function takeFryPortion(batch: FryBatch): { batch: FryBatch | null; portion: number } | null {
  if (!validateFryBatch(batch) || batch.phase !== 'raised') return null;
  const remaining = batch.remaining - 1;
  return { batch: remaining ? { ...batch, remaining } : null, portion: batch.total - remaining };
}

export type VesselKind = 'plate' | 'cup' | 'fry_box' | 'bowl' | 'pizza_dish';
export const SERVING_VESSELS: Record<VesselKind, { name: string; reusable: boolean; supply: 'plates' | 'cups' | 'boxes' | null; available: boolean }> = {
  plate: { name: 'plate', reusable: true, supply: 'plates', available: true },
  cup: { name: 'cup', reusable: true, supply: 'cups', available: true },
  fry_box: { name: 'fries box', reusable: false, supply: 'boxes', available: true },
  bowl: { name: 'bowl', reusable: true, supply: null, available: false },
  pizza_dish: { name: 'pizza dish', reusable: true, supply: null, available: false },
};
const CUP_RECIPES = new Set(['lemonade', 'coffee', 'vanilla_shake', 'strawberry_shake']);
export function recipeVessel(recipeId: string): VesselKind { return recipeId === 'fries' ? 'fry_box' : CUP_RECIPES.has(recipeId) ? 'cup' : 'plate'; }
export function vesselReusable(kind: VesselKind): boolean { return SERVING_VESSELS[kind]?.reusable === true; }
export function vesselSupplyStation(kind: VesselKind): 'plates' | 'cups' | 'boxes' | null { return SERVING_VESSELS[kind]?.supply ?? null; }
