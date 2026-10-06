/** Full route chain with real orders. This zero-delay burger/fries driver tests
 * progression/receipts, not the human renovation economy or multi-dish skill. */
import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,sanitizeDinerSave,type DinerCommand} from '../src/lib/chef/diner/progression';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {Cook} from './dk-diner-cook-fixture';
import {dispatchService} from '../src/lib/chef/diner/service';
import {Kitchen} from './dk-diner-reference-kitchen';
import {routeAccess} from '../src/lib/chef/diner/routes';
const now=1800000000000;let state=createDiner(now,'five-route-chain');state.tutorial.finished=true;state.onboarding!.completed=true;
function act(command:DinerCommand){const r=dispatchDiner(state,command,{now});assert.equal(r.error,undefined,r.error);state=r.state;}
let minutes=0;
for(const [index,routeId] of ['downtown','festival','business_center','boardwalk','night_market'].entries()){
  if(index>=3){state.truckConfig.tableCopies.table_2=2;state.equipment.table_2={tier:1,truckOwned:true,homeCopies:0};} // Explicit late-route two-seat fixture; later destinations use Regular.
  if(index>=3)act({type:'setTruckMenu',recipeIds:['fries']});
  if(index>=3)for(const id of ['grill','prep','sink','fryer'])state.equipment[id].tier=3; // Explicit late-route equipment fixture; no economy claim.
  const loadout=buildServiceLoadout(state.truckTier,index>=3?['fries']:['classic_burger'],Object.fromEntries(Object.entries(state.equipment).map(([id,e])=>[id,e.tier])));
  // Explicit four-seat loadout: this verifies route receipts, not purchase pacing.
  state.equipment.table_2={tier:1,truckOwned:true,homeCopies:0};state.truckConfig.tableCopies.table_2=2;
  state.truckConfig.stations=loadout.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing}));
  state.truckConfig.tables=[{id:'a',x:3,y:loadout.tables[0].y,capacity:2,rotation:0},{id:'b',x:5,y:loadout.tables[0].y,capacity:2,rotation:0}];
  act({type:'startRun',routeId});let services=0;
  while(state.run){
    const options=state.run.map.filter(n=>state.run!.available.includes(n.id)),node=options.find(n=>n.kind==='bonus')??options[0];assert(node);act({type:'chooseNode',nodeId:node.id});
    if(node.kind==='shop'){
      if(routeId==='downtown'&&services===3){assert(state.run!.haul>=300,'opening services must pay for fries');for(const offerId of ['recipe:fries','equipment:fryer'])act({type:'buyOffer',offerId});const before=structuredClone(state.run),banked=state.coins;act({type:'practiceFries'});assert(sanitizeDinerSave(state));
        act({type:'endPractice'});assert.deepEqual(state.run,before);assert.equal(state.coins,banked);}
      act({type:'leaveNode'});continue;
    }
    if(node.kind==='bonus'||node.kind==='ingredients'){act({type:'chooseGift',choice:'coins'});continue;}
    if(node.kind==='event'){const event=state.run!.event!,choice={street_festival:'pass',rainstorm:'wait',flat_tyre:'pay',rival_truck:'avoid',film_crew:'decline',lost_tourist:'wave',health_inspector:'clean'}[event.kind];act({type:'eventChoice',choiceId:choice});if(event.kind==='health_inspector')for(const targetId of ['grill_surface','prep_surface','aisle_spill']){act({type:'eventInput',action:{type:'clean',targetId,active:true}});act({type:'eventInput',action:{type:'tick',ticks:60}});}continue;}
    assert(state.run!.service);let measured=state.run!.service!;if(index>=3)new Cook(()=>measured,action=>{measured=dispatchService(measured,action);}).run();else {const cook=new Kitchen(measured,0);cook.lunch(true);measured=cook.s;}assert.equal(measured.missed,0);minutes+=measured.tick/1200;state.run!.service=measured;
    act({type:'service',action:{type:'tick',ticks:1}});act({type:'finishService'});services++;
    const before=structuredClone(state.collections);assert(dispatchDiner(state,{type:'finishService'},{now}).error);assert.deepEqual(state.collections,before);
  }
  assert.equal(services,8);assert(state.collections.routeWins.includes(routeId));assert.equal(state.truckTier,Math.min(4,index+2));assert.deepEqual(state.audience,{local:100,party:0,business:0});assert(sanitizeDinerSave(state));console.log(`PASS ${routeId}: eight real services, unique finale receipt, tier ${state.truckTier}, crowd still opt-in`);
}
assert.equal(routeAccess(state,'night_market'),null);console.log(`MEASURED five-route burger / late-route fries driver: ${minutes.toFixed(1)} active cooking minutes. Mastery and renovation requirements intentionally remain unearned.`);
