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

/** Boiling finishes independently; draining remains a deliberate player action. */
export const NOODLE_RECIPES=['tomato_pasta','vegetable_ramen','pesto_pasta','creamy_mushroom_pasta','chicken_ramen','spicy_miso_ramen','spicy_ramyeon'];
export type BoilBasket = { version:1; recipeId:string; phase:'cooking'|'ready'|'drained'; createdTick:number };
export type BoilerBatch = {version:2;recipeId:string;phase:'cooking'|'ready'|'drained';createdTick:number;total:number;remaining:number};
export const SOUP_RECIPES=['tomato_soup','mushroom_soup'];
export const boilerPortions=(tier:number)=>Math.max(2,Math.min(4,tier+1));
export const isSoup=(id:string)=>SOUP_RECIPES.includes(id);
export function createBoilBasket(recipeId:string,tick:number,tier=1,version=0):BoilBasket|BoilerBatch|null {
  if(!NOODLE_RECIPES.includes(recipeId)&&!isSoup(recipeId))return null;
  return version===1?{version:2,recipeId,phase:'cooking',createdTick:tick,total:boilerPortions(tier),remaining:boilerPortions(tier)}:{version:1,recipeId,phase:'cooking',createdTick:tick};
}
export function validateBoilBasket(raw:unknown):BoilBasket|BoilerBatch|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const basket=raw as BoilBasket|BoilerBatch,keys=['version','recipeId','phase','createdTick',...(basket.version===2?['total','remaining']:[])];
  if(keys.some(key=>!Object.hasOwn(basket,key))||Object.keys(basket).some(key=>!keys.includes(key))||![1,2].includes(basket.version)||(!NOODLE_RECIPES.includes(basket.recipeId)&&!isSoup(basket.recipeId))||!['cooking','ready','drained'].includes(basket.phase)||!Number.isSafeInteger(basket.createdTick)||basket.createdTick<0)return null;
  if(basket.version===2&&(!Number.isInteger(basket.total)||basket.total<2||basket.total>4||!Number.isInteger(basket.remaining)||basket.remaining<1||basket.remaining>basket.total||basket.phase==='cooking'&&basket.remaining!==basket.total))return null;
  return {...basket};
}
export function takeBoilerPortion(batch:BoilerBatch):BoilerBatch|null {return batch.remaining>1?{...batch,remaining:batch.remaining-1}:null;}
export type VesselKind = 'plate' | 'cup' | 'fry_box' | 'bowl' | 'pizza_dish';
export const SERVING_VESSELS: Record<VesselKind, { name: string; reusable: boolean; supply: 'plates' | 'cups' | 'boxes' | 'bowls' | null; available: boolean }> = {
  plate: { name: 'plate', reusable: true, supply: 'plates', available: true },
  cup: { name: 'cup', reusable: true, supply: 'cups', available: true },
  fry_box: { name: 'fries box', reusable: false, supply: 'boxes', available: true },
  bowl: { name: 'bowl', reusable: true, supply: 'bowls', available: true },
  pizza_dish: { name: 'pizza dish', reusable: true, supply: null, available: false },
};
const CUP_RECIPES = new Set(['lemonade', 'coffee', 'vanilla_shake', 'strawberry_shake','mango_smoothie','citrus_cooler','house_red']);
export function recipeVessel(recipeId: string): VesselKind { return ['fries','cheese_fries'].includes(recipeId) ? 'fry_box' : NOODLE_RECIPES.includes(recipeId)||isSoup(recipeId)||recipeId==='berry_smoothie_bowl'?'bowl':CUP_RECIPES.has(recipeId) ? 'cup' : 'plate'; }
export function vesselReusable(kind: VesselKind): boolean { return SERVING_VESSELS[kind]?.reusable === true; }
export function vesselSupplyStation(kind: VesselKind): 'plates' | 'cups' | 'boxes' | 'bowls' | null { return SERVING_VESSELS[kind]?.supply ?? null; }
