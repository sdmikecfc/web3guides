/** Independent roadside discovery and preservation of retired kit ownership. */
import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,generateDinerMap,homeMenu,homeSimulationConfig,migrateDinerRestaurant,recipeKitOffers,recipeEquipmentNeeded,roadsideShopVisit,sanitizeDinerSave,shopOffers,truckRecipeShop,validateDinerHome,type DinerCommand,type DinerState} from '../src/lib/chef/diner/progression';
import {createService,dispatchService} from '../src/lib/chef/diner/service';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {measureHomeRates} from '../src/lib/chef/diner/home-simulation';
import {replayDiner,DinerAuthorityError,type DinerRecord} from '../src/lib/chef/diner/authority';
import {EQUIPMENT_BY_ID,RECIPES,DEFERRED_EQUIPMENT_IDS} from '../src/lib/chef/diner/content';
import {Cook} from './dk-diner-cook-fixture';
const now=Date.UTC(2026,8,21,8);let groups=0;
function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
const fresh=()=>createDiner(now,'road-discovery');
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
function reject(state:DinerState,command:DinerCommand,code:string){const result=dispatchDiner(state,command,{now});assert.equal(result.code,code,result.error);assert.deepEqual(result.state,state);}
function market(ordinal=1,state=fresh()){state=structuredClone(state);state.tutorial.finished=true;state=act(state,{type:'startRun'});const shops=state.run!.map.filter(node=>node.kind==='shop');state.run!.visited=shops.slice(0,ordinal-1).map(node=>node.id);state.run!.available=[shops[ordinal-1].id];state=act(state,{type:'chooseNode',nodeId:shops[ordinal-1].id});state.run!.haul=10000;return state;}
function withOffer(state:DinerState,kind:'equipment'|'recipe'|'upgrade',target:string){state=structuredClone(state);for(let seed=0;seed<500;seed++){const offers=shopOffers(state,`sample-${seed}`);if(offers.some(offer=>offer.kind===kind&&offer.target===target)){state.run!.offers=offers;return state;}}throw new Error(`No ${kind} offer for ${target}`);}
function buy(state:DinerState,kind:'equipment'|'recipe'|'upgrade',target:string){state=withOffer(state,kind,target);return act(state,{type:'buyOffer',offerId:state.run!.offers.find(offer=>offer.kind===kind&&offer.target===target)!.id});}
function home(state:DinerState){return act(act(state,{type:'leaveNode'}),{type:'goHome'});}

test('first actual market offers real machines and upgrades, never recipes or unimplemented props',()=>{
 const s=market(),seen=new Set<string>();assert.equal(roadsideShopVisit(s),1);
 for(let i=0;i<100;i++){const offers=shopOffers(s,`stock-${i}`);assert(offers.some(o=>o.kind==='upgrade'));assert(!offers.some(o=>o.kind==='recipe'));for(const o of offers){seen.add(o.target);assert(!(DEFERRED_EQUIPMENT_IDS as readonly string[]).includes(o.target));}}
 for(const id of ['boiler','fryer','oven','blender','coffee'])assert(seen.has(id),id);
 const late=structuredClone(s);late.run!.mapVersion=3;late.run!.map=generateDinerMap(late.run!.seed,3);const last=late.run!.map.filter(n=>n.kind==='shop').at(-1)!;late.run!.position=last.id;late.run!.visited=[];assert.equal(roadsideShopVisit(late),1);assert(!shopOffers(late).some(o=>o.kind==='recipe'));late.run!.visited=[last.id,last.id];assert.equal(roadsideShopVisit(late),1);
});
test('second actual market samples useful and aspirational recipes independently of owned machinery',()=>{
 const s=market(2),seen=new Set<string>();assert.equal(roadsideShopVisit(s),2);
 for(let i=0;i<200;i++){const offers=shopOffers(s,`menu-${i}`).filter(o=>o.kind==='recipe');assert.equal(offers.length,2);assert.equal(offers.filter(o=>RECIPES.find(r=>r.id===o.target)!.steps.every(step=>s.equipment[step.station]?.truckOwned)).length,1);for(const o of offers)seen.add(o.target);}
 for(const id of ['fries','tomato_pasta','vegetable_ramen'])assert(seen.has(id),id);assert.deepEqual(recipeEquipmentNeeded(s,'tomato_pasta').sort(),['boiler','bowls']);
});
test('early recipes stay in the starter neighbourhood; later cuisines join after route or truck growth',()=>{
 const early=market(2),boardwalk=structuredClone(early),late=structuredClone(early),seenBoardwalk=new Set<string>(),seenLate=new Set<string>();boardwalk.truckTier=2;late.truckTier=3;
 for(let i=0;i<200;i++){
  for(const offer of shopOffers(early,`cuisine-${i}`).filter(o=>o.kind==='recipe')){const recipe=RECIPES.find(r=>r.id===offer.target)!;assert.notEqual(recipe.route,'night_market',recipe.id);assert(recipe.route!=='boardwalk'||recipe.id==='vegetable_ramen',recipe.id);}
  for(const offer of shopOffers(boardwalk,`cuisine-${i}`).filter(o=>o.kind==='recipe')){const recipe=RECIPES.find(r=>r.id===offer.target)!;assert.notEqual(recipe.route,'night_market',recipe.id);seenBoardwalk.add(recipe.id);}
  for(const offer of shopOffers(late,`cuisine-${i}`).filter(o=>o.kind==='recipe'))seenLate.add(offer.target);
 }
 assert(seenBoardwalk.has('vanilla_shake'));assert(seenLate.has('strawberry_waffle'));
});
test('machine purchase grants one home copy but no dish, layout or menu; duplicate replay is atomic',()=>{
 const s=withOffer(market(),'equipment','boiler'),before=structuredClone(s),bought=act(s,{type:'buyOffer',offerId:'equipment:boiler'});
 assert.equal(bought.run!.haul,before.run!.haul-EQUIPMENT_BY_ID.boiler.tiers[0].price);assert.equal(bought.coins,before.coins);assert.deepEqual(bought.equipment.boiler,{tier:1,truckOwned:true,homeCopies:1});for(const key of ['recipes','truckConfig','home'] as const)assert.deepEqual(bought[key],before[key]);assert.deepEqual(bought.run!.menu,before.run!.menu);reject(bought,{type:'buyOffer',offerId:'equipment:boiler'},'offer_unavailable');
 const record:DinerRecord={state:s,revision:0,clock:{lastAt:now,creditMs:0,pausedForAbsence:false}};assert.throws(()=>replayDiner(record,[{type:'buyOffer',offerId:'equipment:boiler'},{type:'buyOffer',offerId:'equipment:boiler'}],now),(e:unknown)=>e instanceof DinerAuthorityError&&e.code==='offer_unavailable');assert.equal(record.state.equipment.boiler,undefined);
 const existing=structuredClone(s);existing.equipment.boiler={tier:2,truckOwned:true,homeCopies:3};reject(existing,{type:'buyOffer',offerId:'equipment:boiler'},'offer_unavailable');
});
test('recipe-first purchase needs no matching machine or career gate and does not activate new orders',()=>{
 const s=withOffer(market(2),'recipe','vegetable_ramen'),before=structuredClone(s),bought=act(s,{type:'buyOffer',offerId:'recipe:vegetable_ramen'});assert.equal(bought.recipes.vegetable_ramen.level,0);assert.equal(bought.recipes.tomato_pasta,undefined);assert.equal(bought.career.services,0);for(const key of ['equipment','truckConfig'] as const)assert.deepEqual(bought[key],before[key]);assert.deepEqual(bought.home.menu,before.home.menu);assert.deepEqual(bought.run!.menu,before.run!.menu);reject(bought,{type:'buyOffer',offerId:'recipe:vegetable_ramen'},'offer_unavailable');reject(home(bought),{type:'setTruckMenu',recipeIds:['vegetable_ramen']},'invalid_menu');
});
test('saved stock is frozen across settlement/reload; rerolls are paid and do not count as visits',()=>{
 let s=market(2);const offers=structuredClone(s.run!.offers),haul=s.run!.haul;assert.deepEqual(shopOffers(s),offers);assert.deepEqual(sanitizeDinerSave(s)!.run!.offers,offers);s=act(s,{type:'settle'});assert.deepEqual(s.run!.offers,offers);s=act(s,{type:'rerollShop'});assert.equal(roadsideShopVisit(s),2);assert(s.run!.haul<haul);reject(s,{type:'rerollShop'},'reroll_unavailable');
});
test('fixed kits and universal recipes are retired; useful serving supplies remain separate purchases',()=>{
 const s=fresh();s.coins=10000;assert.deepEqual(recipeKitOffers(s),[]);assert.deepEqual(truckRecipeShop(s),[]);for(const kitId of ['pasta_starter','ramen_starter'])reject(s,{type:'buyRecipeKit',kitId},'recipe_kit_unavailable');for(const recipeId of ['fries','tomato_pasta','vegetable_ramen','cheeseburger'])reject(s,{type:'buyTruckRecipe',recipeId},'recipe_unavailable');reject(s,{type:'buyTruckEquipment',equipmentId:'boiler'},'equipment_unavailable');
 const gear=home(buy(market(),'equipment','boiler')),bowls=act(gear,{type:'buyTruckEquipment',equipmentId:'bowls'});assert.equal(bowls.equipment.bowls.homeCopies,0);assert.equal(bowls.equipment.boiler.homeCopies,1);assert.equal(bowls.recipes.tomato_pasta,undefined);
});
test('old kit receipts, recipes, mastery and gifted machinery survive without retroactive copies',()=>{
 const old=fresh();old.coins=4321;old.recipeProgression={version:1,claimedKits:['pasta_starter','ramen_starter']};old.recipes.tomato_pasta={level:4};old.recipes.vegetable_ramen={level:2};old.equipment.boiler={tier:2,truckOwned:true,homeCopies:3};old.equipment.bowls={tier:1,truckOwned:true,homeCopies:0};old.equipment.fryer={tier:2,truckOwned:true,homeCopies:2};old.tutorial.fryerGifted=true;const before=structuredClone(old),loaded=sanitizeDinerSave(old)!;assert(loaded);for(const key of ['coins','equipment','recipes','recipeProgression','home','truckConfig'] as const)assert.deepEqual(loaded[key],before[key],key);assert.deepEqual(migrateDinerRestaurant(loaded),loaded);assert.deepEqual(old,before);reject(loaded,{type:'buyRecipeKit',kitId:'pasta_starter'},'recipe_kit_unavailable');
});
test('new opening trips do not force a loss or fryer gift; already-active old trips keep their promise',()=>{
 let s=act(fresh(),{type:'startRun'});assert.equal(s.run!.discoveryVersion,2);s.run!.serviceDays=2;const next=s.run!.map.find(n=>n.row===2)!;s.run!.available=[next.id];s=act(s,{type:'chooseNode',nodeId:next.id});assert.equal(s.run!.service!.config.tutorialFailure,false);assert.equal(s.run!.service!.config.tutorialLearning,false);s.run!.service=null;s.run!.position=null;s=act(s,{type:'goHome'});assert.equal(s.tutorial.finished,true);assert.equal(s.tutorial.fryerGifted,false);assert.equal(s.equipment.fryer.truckOwned,false);assert.equal(s.equipment.fryer.homeCopies,0);
 let legacy=act(fresh(),{type:'startRun'});delete legacy.run!.discoveryVersion;legacy.run!.serviceDays=1;legacy=act(legacy,{type:'goHome'});assert.equal(legacy.tutorial.fryerGifted,true);assert.equal(legacy.equipment.fryer.homeCopies,1);
});
let pasta:DinerState;
test('independent recipe and boiler purchases reconnect at home after installation, without a menu switch',()=>{
 let s=buy(market(2),'recipe','tomato_pasta');s=buy(s,'equipment','boiler');s=act(home(s),{type:'buyTruckEquipment',equipmentId:'bowls'});pasta=structuredClone(s);assert(!homeMenu(s).includes('tomato_pasta'));let placed=false;
 for(let y=0;y<s.home.h&&!placed;y++)for(let x=0;x<s.home.w&&!placed;x++)for(const rotation of [0,1,2,3] as const){const layout=[...s.home.layout,{id:'home-boiler',equipmentId:'boiler',x,y,rotation}];if(!validateDinerHome(s,layout)){s=act(s,{type:'homeLayout',layout});placed=true;break;}}
 assert(placed);assert(homeMenu(s).includes('tomato_pasta'));assert.deepEqual(s.home.menu,pasta.home.menu);assert(measureHomeRates(homeSimulationConfig(s)).platesByRecipe.tomato_pasta>0);const stored=act(s,{type:'homeLayout',layout:s.home.layout.filter(item=>item.id!=='home-boiler')});assert(!homeMenu(stored).includes('tomato_pasta'));assert.equal(stored.equipment.boiler.homeCopies,1);
});
test('new finales grow the truck without granting unchosen dishes or losing acquired machinery',()=>{
 let s=act(pasta,{type:'startRun'});const finale=s.run!.map.find(n=>n.kind==='finale')!;s.run!.available=[finale.id];s=act(s,{type:'chooseNode',nodeId:finale.id});const layout=buildServiceLoadout(1,['classic_burger']);let service=createService({...layout,tables:[makeTable('table_1',3,5,1)],menu:['classic_burger'],customers:1,queuePatienceTicks:12000,tablePatienceTicks:12000});new Cook(()=>service,a=>{service=dispatchService(service,a);}).run();s.run!.service=service;s=act(s,{type:'service',action:{type:'tick',ticks:0}});const recipes=structuredClone(s.recipes),equipment=structuredClone(s.equipment);s=act(s,{type:'finishService'});assert.equal(s.truckTier,2);assert.deepEqual(s.recipes,recipes);assert.deepEqual(s.equipment,equipment);
});
console.log(`PASS ${groups} independent discovery and legacy kit groups`);
