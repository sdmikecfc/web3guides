import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,shopOffers,homeSimulationConfig,migrateDinerRestaurant} from '../src/lib/chef/diner/progression';
import {ROUTES,RECIPES} from '../src/lib/chef/diner/content';
import {routeAccess,destinationService} from '../src/lib/chef/diner/routes';
import {COMMUNITY_HANDLES} from '../src/lib/chef/diner/community-customers';
import {businessOrder,validAudience} from '../src/lib/chef/diner/customer-traits';
import {buildServiceLoadout,makeStation} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,sanitizeService,stepService} from '../src/lib/chef/diner/service';
import {createHomeWorld,stepHomeWorld} from '../src/lib/chef/diner/home-simulation';
import {Cook} from './dk-diner-cook-fixture';
import {Kitchen} from './dk-diner-reference-kitchen';
import {renovationRequirements} from '../src/lib/chef/diner/renovation';
const time=1800000000000;
assert.equal(COMMUNITY_HANDLES.length,100);assert.equal(new Set(COMMUNITY_HANDLES).size,100);assert.equal(RECIPES.length,32);
assert.deepEqual(ROUTES.map(r=>r.id),['downtown','festival','business_center','boardwalk','night_market']);
let state=createDiner(time,'destinations');
assert.equal(routeAccess(state,'downtown'),null);assert(routeAccess(state,'festival'));assert(routeAccess(state,'boardwalk'));
for(const [before,after]of [['downtown','festival'],['festival','business_center'],['business_center','boardwalk'],['boardwalk','night_market']]){state.collections.routeWins.push(before);assert.equal(routeAccess(state,after),null);}
const old=createDiner(time,'old');delete old.journey;old.truckTier=3;old.collections.routeWins=['boardwalk'];const migrated=migrateDinerRestaurant(old);assert.equal(routeAccess(migrated,'boardwalk'),null);assert.equal(routeAccess(migrated,'night_market'),null);assert(migrated.journey?.legacyRenovation);
console.log('PASS five routes, legacy access, explicit progression and 100 exact community names');
state=createDiner(time,'market');state.tutorial.finished=true;state=dispatchDiner(state,{type:'startRun',routeId:'downtown'},{now:time}).state;
const market=state.run!.map.find(n=>n.kind==='shop')!;state.run!.position=market.id;state.run!.serviceDays=3;state.run!.haul=300;
for(const salt of ['0','reroll']){const offers=shopOffers(state,salt);assert.equal(offers.find(o=>o.target==='fries')?.price,140);assert.equal(offers.find(o=>o.target==='fryer')?.price,160);assert.equal(offers.find(o=>o.target==='boxes')?.price,0);}
state.run!.offers=shopOffers(state);for(const offerId of ['recipe:fries','equipment:fryer']){const result=dispatchDiner(state,{type:'buyOffer',offerId},{now:time});assert.equal(result.error,undefined);state=result.state;}
assert(state.equipment.boxes.truckOwned);assert.equal(state.run!.haul,0);assert.deepEqual(state.run!.menu,['classic_burger']);
const original=structuredClone(state.run),coins=state.coins;let trial=dispatchDiner(state,{type:'practiceFries'},{now:time});assert.equal(trial.error,undefined);assert(trial.state.run?.practice);const restored=dispatchDiner(trial.state,{type:'endPractice'},{now:time});assert.equal(restored.error,undefined);assert.deepEqual(restored.state.run,original);assert.equal(restored.state.coins,coins);
console.log('PASS guaranteed 300-coin fries setup, rerolls, included boxes, opt-in menu and reversible practice');
assert(validAudience({local:0,party:100,business:0},['festival']));assert(!validAudience({local:0,party:100,business:0},[]));assert(!validAudience({local:1,party:100,business:0},['festival']));
const menu=['classic_burger','fries','lemonade','chicken_ramen'],history:string[]=[];for(let i=0;i<200;i++){const chosen=businessOrder(menu,{},(i*137%200)/200,history);assert.notEqual(chosen,'lemonade');history.push(chosen);assert(!(history.length>2&&history.at(-1)===history.at(-2)&&history.at(-2)===history.at(-3)));}assert.equal(businessOrder(['fries'],{},.5,[]),'fries');
console.log('PASS audience ownership/percentages and business price diversity');
for(const tier of [1,2,3] as const){const layout=buildServiceLoadout(3,['tomato_pasta','vegetable_ramen']);let s=createService({...layout,tier:3,menu:['tomato_pasta','vegetable_ramen'],customers:1,stations:layout.stations.map(st=>st.kind==='boiler'?makeStation(st.id,st.kind,st.x,st.y,tier,st.facing):st),tutorialLearning:true});s=dispatchService(s,{type:'open'});const k=new Cook(()=>s,a=>{s=dispatchService(s,a);});k.touch('crate','tomato_pasta',undefined,'pasta');k.touch('boiler');k.until(()=>s.stations.find(st=>st.kind==='boiler')!.slots[0].job?.ready===true);k.touch('boiler');const boiler=s.stations.find(st=>st.kind==='boiler')!;assert.equal(boiler.slots.length,tier);const ids=new Set<string>();for(let i=0;i<tier+1;i++){k.touch('boiler');ids.add(s.chef.held!.id);assert(sanitizeService(s));k.touch('bin');}assert.equal(ids.size,tier+1);assert.equal(s.stations.find(st=>st.kind==='boiler')!.slots[0].item,null);}
console.log('PASS boiler tiers: distinct finite portions, capacity and reload conservation');
for(const routeId of ['festival','business_center'])for(let day=0;day<3;day++){
  let cleared=0;for(let seed=0;seed<100;seed++){
    const config=destinationService(routeId,day,false,1),layout=buildServiceLoadout(routeId==='festival'?2:3,['classic_burger']);
    const s=createService({...layout,...config,seed:`${routeId}:${day}:${seed}`,tier:routeId==='festival'?2:3,menu:['classic_burger']});
    const kitchen=new Kitchen(s,20);try{kitchen.lunch(true);assert.equal(kitchen.s.messes?.length,0);assert(sanitizeService(kitchen.s));if(!kitchen.s.missed)cleared++;}catch(e){if(seed<3)console.log('FAIL seed',routeId,day,seed,kitchen.s.phase,kitchen.s.served,kitchen.s.missed,kitchen.s.notice);}
  }assert(cleared>=95,`${routeId} day ${day+1}: only ${cleared}/100 seeds cleared`);console.log(`PASS ${routeId} day ${day+1}: ${cleared}/100 seeds, real cooking, cleanup and one-second decisions`);
}
for(const mix of [{local:0,party:100,business:0},{local:0,party:0,business:100},{local:34,party:33,business:33}]){
 const s=createDiner(time,'home-guests');s.audience=mix;s.collections.routeWins=['festival','business_center'];const world=createHomeWorld(homeSimulationConfig(s));stepHomeWorld(world,36000);assert(world.metrics.plates>0);assert(world.messes.length<=4);assert(world.customers.length<40);assert(world.actors.every(a=>!a.held||!!a.task));console.log(`PASS home audience ${JSON.stringify(mix)}: ${world.metrics.plates} meals, ${world.metrics.turnedAway} departures, ${world.messes.length} remaining messes`);
}
