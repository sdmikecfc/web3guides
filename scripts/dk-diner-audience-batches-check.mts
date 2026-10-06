import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,sanitizeDinerSave,shopOffers,homeSimulationConfig,type DinerCommand} from '../src/lib/chef/diner/progression';
import {createService,dispatchService,sanitizeService,stepService} from '../src/lib/chef/diner/service';
import {buildServiceLoadout,makeStation} from '../src/lib/chef/diner/geometry';
import {leaveServiceMess,cleanupDrain} from '../src/lib/chef/diner/cleanup';
import {settleAudience} from '../src/lib/chef/diner/home-audience';
import {stepHomeWorld} from '../src/lib/chef/diner/home-simulation';
import {ingredientSupply,RECIPE_BY_ID} from '../src/lib/chef/diner/content';
import {Cook} from './dk-diner-cook-fixture';
const now=1800000000000;
let state=createDiner(now,'audience-ledger');state.collections.routeWins=['downtown','festival','business_center'];
function act(command:DinerCommand,time=state.updatedAt,online=true){const r=dispatchDiner(state,command,{now:time,online});assert.equal(r.error,undefined,r.error);state=r.state;assert(sanitizeDinerSave(state),'checkpoint reload');}
act({type:'setAudience',mix:{local:0,party:100,business:0}});
for(let t=1;t<=100;t++)act({type:'settle'},now+t*5000);
assert(state.homeAudience!.world.metrics.plates>0);assert(state.regularStories?.pending?.ready,'named visit still completes within party audience');
const visit=state.regularStories!.pending!;act({type:'serveRegular',regularId:visit.regularId,visitId:visit.id});assert.equal(state.collections.regulars[visit.regularId],1);
const before=state.home.till.coins,world=state.homeAudience!.world,expected=structuredClone(state);
// Settle a bounded interval by the same simulation as direct physical playback.
settleAudience(expected,homeSimulationConfig(expected),10000,true);
act({type:'settle'},state.updatedAt+10000);assert.equal(state.home.till.coins,expected.home.till.coins);
act({type:'setAudience',mix:{local:0,party:0,business:100}});assert.equal(state.home.till.coins,expected.home.till.coins,'mix cannot reprice earnings');
const fixture=state.home.roomPlan!.modules.find(m=>m.kind==='toilet')!;fixture.condition=92;state.home.fixtureInventory![fixture.id].condition=92;
act({type:'settle'},state.updatedAt+50);assert(state.homeAudience!.world.bathrooms.find(f=>f.id===fixture.id)!.condition>90,'maintenance persists');
const namedBefore=state.collections.regulars.old_pete;act({type:'settle'},state.updatedAt+3600000,false);assert.equal(state.collections.regulars.old_pete,namedBefore);
console.log('PASS audience settlement, saved crowd, physical regular visit, ownership and maintenance');
const menu=['tomato_soup','mushroom_soup'];let s=createService({...buildServiceLoadout(2,menu,{boiler:2}),tier:2,menu,customers:2,tutorialLearning:true,lessonVersion:0});s=dispatchService(s,{type:'open'});
const cook=new Cook(()=>s,a=>{s=dispatchService(s,a);});
for(const recipe of menu){const primary=recipe==='tomato_soup'?'tomato':'mushroom_sauce';cook.touch(ingredientSupply(primary),recipe,undefined,primary);cook.touch('boiler');}
cook.until(()=>s.stations.find(st=>st.kind==='boiler')!.slots.every(slot=>slot.job?.ready===true));
const pot=s.stations.find(st=>st.kind==='boiler')!.slots[1],potId=pot.item!.id;
cook.touch('bowls');cook.touch('boiler',undefined,undefined,undefined,potId);assert.equal(s.chef.held?.recipeId,'mushroom_soup');assert.equal(s.stations.find(st=>st.kind==='boiler')!.slots[1].boil?.version,2);assert.equal((s.stations.find(st=>st.kind==='boiler')!.slots[1].boil as any).remaining,2);assert(sanitizeService(s));
const warmth=s.chef.held!.warmthTicks!;for(let t=0;t<25;t++)stepService(s);assert(s.chef.held!.warmthTicks!<warmth);
console.log('PASS mixed soup pots, exact selected portion, bowl stock and inherited warmth');
{
  const recipes=['tomato_soup','mushroom_soup','vegetable_ramen'];let multi=createService({...buildServiceLoadout(3,recipes,{boiler:3}),tier:3,menu:recipes,customers:1,tutorialLearning:true,lessonVersion:0});multi=dispatchService(multi,{type:'open'});
  const kitchen=new Cook(()=>multi,action=>{multi=dispatchService(multi,action);});
  for(const recipe of recipes){const primary=RECIPE_BY_ID[recipe].ingredients[0];kitchen.touch(ingredientSupply(primary),recipe,undefined,primary);kitchen.touch('boiler');assert.equal(multi.chef.held,null,'ready batches must not intercept loading another pot');kitchen.until(()=>multi.stations.find(st=>st.kind==='boiler')!.slots.some(slot=>slot.item?.recipeId===recipe&&slot.job?.ready));}
  assert.equal(multi.stations.find(st=>st.kind==='boiler')!.slots.filter(slot=>slot.job?.ready).length,3);assert(sanitizeService(multi));
  console.log('PASS advanced boiler loads a third pot beside two ready batches');
}
let cleanup=createService({...buildServiceLoadout(2,['classic_burger']),tier:2,menu:['classic_burger'],customers:1,cleanupLesson:true});cleanup=dispatchService(cleanup,{type:'open'});
for(let i=0;i<4;i++){cleanup.tick+=300;assert(leaveServiceMess(cleanup,cleanup.chef,0));}cleanup.tick+=300;assert.equal(leaveServiceMess(cleanup,cleanup.chef,0),false);assert.equal(cleanupDrain(4),1.4);
const id=cleanup.messes![0].id,mop=new Cook(()=>cleanup,a=>{cleanup=dispatchService(cleanup,a);});mop.touch(id);mop.send({type:'hold',active:true});mop.tick(22);mop.send({type:'hold',active:false});const progress=cleanup.messes!.find(m=>m.id===id)!.progress;assert(progress>0&&progress<60);cleanup=sanitizeService(cleanup)!;assert(cleanup);cleanup=dispatchService(cleanup,{type:'resume'});mop.tick(20);assert.equal(cleanup.messes!.find(m=>m.id===id)!.progress,progress);mop.send({type:'hold',active:true});mop.until(()=>!cleanup.messes!.some(m=>m.id===id));
console.log('PASS four-mess cap, nonblocking routes, interrupted cleaning and reload');
// Legacy three-tier boiler checkpoints keep their two old slots and single basket.
const layout=buildServiceLoadout(3,['tomato_pasta'],{boiler:3});const legacy=createService({...layout,tier:3,menu:['tomato_pasta'],boilerVersion:0,destinationVersion:0});assert.equal(legacy.stations.find(st=>st.kind==='boiler')!.slots.length,2);assert(sanitizeService(legacy));
console.log('PASS legacy boiler checkpoint keeps its original capacity');

// A completed/reloaded market practice must return to the paid trip unchanged.
let practice=createDiner(now,'fries-practice-return');practice.tutorial.finished=true;
practice=dispatchDiner(practice,{type:'startRun',routeId:'downtown'},{now}).state;
const market=practice.run!.map.find(node=>node.kind==='shop')!;
practice.run!.position=market.id;practice.run!.serviceDays=3;practice.run!.haul=300;practice.run!.offers=shopOffers(practice);
for(const offerId of ['recipe:fries','equipment:fryer']){const result=dispatchDiner(practice,{type:'buyOffer',offerId},{now});assert.equal(result.error,undefined);practice=result.state;}
const originalRun=structuredClone(practice.run),originalCareer=structuredClone(practice.career),originalCoins=practice.coins;
practice=dispatchDiner(practice,{type:'practiceFries'},{now}).state;
practice=sanitizeDinerSave(JSON.parse(JSON.stringify(practice)))!;assert(practice);
practice=dispatchDiner(practice,{type:'service',action:{type:'resume'}},{now}).state;
new Cook(()=>practice.run!.service!,action=>{const result=dispatchDiner(practice,{type:'service',action},{now});assert.equal(result.error,undefined);practice=result.state;}).run();
const finished=dispatchDiner(practice,{type:'finishService'},{now});assert.equal(finished.error,undefined);
assert.deepEqual(finished.state.run,originalRun);assert.deepEqual(finished.state.career,originalCareer);assert.equal(finished.state.coins,originalCoins);
assert(sanitizeDinerSave(finished.state));
console.log('PASS completed fries practice restores market after reload, without rewards or trip changes');
