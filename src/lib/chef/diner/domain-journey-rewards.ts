import {isDomainId,type DomainId} from './domain-worlds';
import {domainKitAsset} from './domain-room-kit-defs';
import {RECIPE_BY_ID} from './content';
import {domainMealIds} from './domain-journeys';
import {recipeVessel,vesselSupplyStation} from './batch';
import type {DinerState} from './progression';
export type JourneyEntitlements={version:1;receipts:string[]};
export type JourneyRewardEvidence={wallet:string;rewards:{domain:DomainId;milestone:number;receipt_key:string;earned_at:number|string}[]};
export function validJourneyEntitlements(value:unknown):value is JourneyEntitlements|undefined{
 if(value===undefined)return true;const v=value as JourneyEntitlements;
 return !!v&&v.version===1&&Object.keys(v).every(k=>['version','receipts'].includes(k))&&Array.isArray(v.receipts)&&v.receipts.length<=12&&new Set(v.receipts).size===v.receipts.length&&v.receipts.every(k=>/^journey:(gochujang|smoothie|wines):(2|4|6|8)$/.test(k));
}
export function domainJourneyRewardItem(domain:DomainId,milestone:number){return milestone===8?`prestige_journey_${domain}`:domainKitAsset(domain,milestone===2?'sign':milestone===4?'feature':'lamp');}
/** Called only after fetching authenticated server receipts. Never accepts a browser command or imported attempt. */
export function attachJourneyRewards(input:DinerState,evidence:unknown,wallet:string):DinerState{
 const data=evidence as JourneyRewardEvidence;
 if(!/^0x[0-9a-f]{40}$/.test(wallet)||data?.wallet!==wallet||!Array.isArray(data.rewards)||data.rewards.length>12)throw new Error('Verify journey rewards for this wallet.');
 const state=structuredClone(input);state.domainJourneyRewards??={version:1,receipts:[]};
 if(!validJourneyEntitlements(state.domainJourneyRewards))throw new Error('Invalid saved journey receipts.');
 for(const r of data.rewards){
  if(!isDomainId(r?.domain)||![2,4,6,8].includes(r.milestone)||r.receipt_key!==`journey:${r.domain}:${r.milestone}`||!Number.isSafeInteger(Number(r.earned_at))||Number(r.earned_at)<0)throw new Error('Invalid journey reward receipt.');
  if(state.domainJourneyRewards.receipts.includes(r.receipt_key))continue;
  const item=domainJourneyRewardItem(r.domain,r.milestone);state.decorOwned[item]=Math.max(1,state.decorOwned[item]??0);
  if(r.milestone===8){
   for(const recipeId of domainMealIds(r.domain)){state.recipes[recipeId]??={level:0};
    for(const kind of RECIPE_BY_ID[recipeId].steps.map(step=>step.station)){const owned=state.equipment[kind]??={tier:1,truckOwned:false,homeCopies:0};owned.truckOwned=true;owned.homeCopies=Math.max(1,owned.homeCopies);}
    const supply=vesselSupplyStation(recipeVessel(recipeId));if(supply){const owned=state.equipment[supply]??={tier:1,truckOwned:false,homeCopies:0};owned.truckOwned=true;}
   }
  }
  state.domainJourneyRewards.receipts.push(r.receipt_key);
 }
 return state;
}
