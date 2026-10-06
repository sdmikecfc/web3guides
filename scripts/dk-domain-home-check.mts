import assert from 'node:assert/strict';
import {DOMAIN_IDS,DOMAIN_WORLDS} from '../src/lib/chef/diner/domain-worlds';
import {domainRoomBlueprint,grantDomainRoomKit} from '../src/lib/chef/diner/domain-room-kits';
import {createDiner,sanitizeDinerSave} from '../src/lib/chef/diner/progression';
import {createHomeWorld,stepHomeWorld} from '../src/lib/chef/diner/home-simulation';
import {attachJourneyRewards} from '../src/lib/chef/diner/domain-journey-rewards';
import {validateRoomPlan} from '../src/lib/chef/diner/room-plan';
import {homeLayoutIsClear,validHomeAudience} from '../src/lib/chef/diner/home-audience';
import {collectionEvidence} from './dk-domain-collection-fixture';
const now=1800000000000,wallet='0x1111111111111111111111111111111111111111';
for(const domain of DOMAIN_IDS){
 let state=createDiner(now);state.equipment.prep.tier=3;
 const evidence={wallet,rewards:[2,4,6,8].map(milestone=>({domain,milestone,receipt_key:`journey:${domain}:${milestone}`,earned_at:now}))};
 const original=structuredClone(state);state=attachJourneyRewards(state,evidence,wallet);assert.deepEqual(state.home,original.home);assert.deepEqual(state.run,original.run);assert.equal(state.coins,original.coins);assert.equal(state.equipment.prep.tier,3);assert(!state.domainRooms);assert(sanitizeDinerSave(state));assert.deepEqual(attachJourneyRewards(state,evidence,wallet),state);
 assert.throws(()=>attachJourneyRewards(state,{...evidence,wallet:'0x2222222222222222222222222222222222222222'},wallet));
 state.decorOwned[`prestige_journey_${domain}`]=0;assert.equal(attachJourneyRewards(state,evidence,wallet).decorOwned[`prestige_journey_${domain}`],0,'resale does not reset receipt');
 for(const stage of ['burger_shop','diner','restaurant'] as const){
  const design=domainRoomBlueprint(domain,stage);assert.equal(validateRoomPlan(design.roomPlan,design.layout),null,`${domain}/${stage}`);
  for(const recipe of DOMAIN_WORLDS[domain].menu){
   let w=createHomeWorld({w:design.roomPlan.w,h:design.roomPlan.h,roomPlan:design.roomPlan,layout:design.layout,equipment:state.equipment,menu:[recipe.id],recipeLevels:{[recipe.id]:2},chefs:1,waiters:1,cashiers:1,arrivalRate:35,arrivalLimit:6});
   for(let t=0;t<30000;t++){stepHomeWorld(w);if(t===2400){assert(validHomeAudience({version:1,world:w,fraction:0}));const restored=JSON.parse(JSON.stringify(w));stepHomeWorld(restored,400);const expected=structuredClone(w);stepHomeWorld(expected,400);assert.deepEqual(restored,expected,'offline/reload uses identical physical scheduling');w=restored;}if(w.metrics.plates===6&&!w.customers.length&&w.tables.every(t=>t.seats.every(s=>s.status==='clean')))break;}
   assert.equal(w.metrics.plates,6,`${domain}/${stage}/${recipe.id}: ${w.notice}`);assert(w.tables.every(t=>t.seats.every(s=>s.status==='clean')),'washing finishes');
   if(['steamed_mandu','house_red'].includes(recipe.id)){assert.equal(w.metrics.domainPortions,6);assert.equal(w.metrics.domainBatches,recipe.id==='house_red'?1:2);}
   w.config.layoutDraining=true;for(let t=0;t<6000&&!homeLayoutIsClear(w);t++)stepHomeWorld(w);assert(homeLayoutIsClear(w),'a pending layout can physically close its old kitchen');
  }
  console.log(`PASS ${domain}/${stage}: all three dishes, batches, washing, reload/offline, safe closure`);
 }
}
