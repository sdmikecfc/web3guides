import { TRUCK_TIERS } from './content';
import type { DinerState } from './progression';

export const FIRST_SERVICE_PROMOTION=5;
/** Career receipts count only completed ordinary services, never practice or rally. */
export function serviceLevelProgress(state:Pick<DinerState,'career'>){
  const cleared=Math.min(FIRST_SERVICE_PROMOTION,state.career?.services??0),unlocked=cleared===FIRST_SERVICE_PROMOTION;
  return {level:unlocked?2:1,cleared,target:FIRST_SERVICE_PROMOTION,remaining:FIRST_SERVICE_PROMOTION-cleared,unlocked};
}
export function unlockedTruckHelpers(state:Pick<DinerState,'career'|'truckTier'>):number{
  if(state.truckTier===1)return serviceLevelProgress(state).unlocked?1:0;
  return TRUCK_TIERS[state.truckTier].helpers;
}
