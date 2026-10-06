import assert from 'node:assert/strict';
import {roomBenchmark} from '../src/app/chef/room-review/benchmark';
import {validateDinerHomePlacement,homeSimulationConfig,dispatchDiner,createDiner,sanitizeDinerSave} from '../src/lib/chef/diner/progression';
import {createPlacementDraft,previewPlacement} from '../src/app/chef/diner-preview/placement-preview';
import {roomCollectionVisible} from '../src/lib/chef/diner/room-collection';
import {createHomeWorld,stepHomeWorld} from '../src/lib/chef/diner/home-simulation';
for(const stage of ['burger_shop','diner','restaurant'] as const){
 const state=roomBenchmark(stage,true);
 assert.equal(validateDinerHomePlacement(state,state.home.layout),null);
 const world=createHomeWorld({...homeSimulationConfig(state),arrivalRate:90});
 stepHomeWorld(world,20*300);
 assert(world.metrics.plates>0,stage+' must remain a functioning restaurant');
 console.log('PASS furnished benchmark',stage,state.home.layout.map(p=>p.equipmentId).join(', '),world.metrics.plates+' meals');
}
{
 let state=createDiner(1_800_000_000_000,'sale-check');state.decorOwned.display_counter_red=1;state.decorOwned.pie_display=1;
 for(const [id,equipmentId]of [['counter','display_counter_red'],['pie','pie_display']]){
  let draft=createPlacementDraft(state,'home',equipmentId,id);
  if(id==='pie')draft={...draft,mount:{kind:'counter',targetId:'counter',slot:0},x:state.home.layout.find(p=>p.id==='counter')!.x,y:state.home.layout.find(p=>p.id==='counter')!.y};
  const preview=previewPlacement(state,draft);assert.equal(preview.error,null);const applied=dispatchDiner(state,preview.command,{now:state.updatedAt});assert.equal(applied.error,undefined);state=applied.state;
 }
 const before=structuredClone(state),result=dispatchDiner(state,{type:'sellDecor',decorId:'display_counter_red',placementId:'counter'},{now:state.updatedAt});
 assert.equal(result.error,undefined);assert.equal(result.state.coins,before.coins+325);assert.equal(result.state.decorOwned.pie_display,1);assert(!result.state.home.layout.some(p=>['counter','pie'].includes(p.id)));assert(sanitizeDinerSave(result.state));
 assert(dispatchDiner(result.state,{type:'sellDecor',decorId:'display_counter_red',placementId:'counter'},{now:state.updatedAt}).error);
 assert.deepEqual(dispatchDiner(state,{type:'sellDecor',decorId:'chrome_clock',placementId:'counter'},{now:state.updatedAt}).state,before);
 assert.equal(roomCollectionVisible('ceramic_fox','decor',0),false);assert.equal(roomCollectionVisible('ceramic_fox','decor',1),true);
 console.log('PASS atomic placed-counter sale, attachment storage, reload, retry rejection and retained owned catalogue pieces');
}
