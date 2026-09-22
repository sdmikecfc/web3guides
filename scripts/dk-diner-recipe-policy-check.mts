/** Recipe ownership, deliberate menu selection and additive old-checkpoint policy. No database writes. */
import assert from 'node:assert/strict';
import { createDiner, dispatchDiner, sanitizeDinerSave, truckRecipeShop, truckStorage, truckSetupError, DINER_RULES, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createDinerRecord, replayDiner, DinerAuthorityError } from '../src/lib/chef/diner/authority';
import { createService, dispatchService, stepService } from '../src/lib/chef/diner/service';
import { buildServiceLoadout } from '../src/lib/chef/diner/geometry';
const now=Date.UTC(2026,8,22,12),fresh=()=>createDiner(now,'recipe-policy');let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
function reject(state:DinerState,command:DinerCommand,code:string){const result=dispatchDiner(state,command,{now});assert.equal(result.code,code,result.error);assert.deepEqual(result.state,state);}
function packed(state=fresh()){return act(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables});}
check('fresh ownership and both menu defaults contain one burger; fryer waits for discovery',()=>{
  const state=fresh();assert.deepEqual(Object.keys(state.recipes),['classic_burger']);assert.deepEqual(state.truckConfig.menu,['classic_burger']);assert.deepEqual(state.home.menu,{main:['classic_burger'],starter:[],drink:[],dessert:[]});
  assert.equal(state.equipment.fryer.truckOwned,false);assert.equal(state.equipment.fryer.homeCopies,0);assert(!truckStorage(state).some(item=>item.equipmentId==='fryer'));assert.deepEqual(truckRecipeShop(state),[]);
  for(const id of ['crate','fridge','plates','sink','bin'])assert(state.truckConfig.stations.some(station=>station.kind===id));assert.equal(truckSetupError(packed()),null);
  const practice=act(packed(),{type:'startPractice'});assert.deepEqual(practice.run!.menu,['classic_burger']);assert.deepEqual(practice.run!.service!.config.menu,['classic_burger']);
});
check('an owned recipe is optional and menu selection preserves every placed piece',()=>{
  let state=packed();const layout=structuredClone(state.truckConfig.stations),menu=structuredClone(state.home.menu),before=state.coins;
  state.recipes.cheeseburger={level:0};assert.equal(state.coins,before);assert.deepEqual(state.truckConfig.menu,['classic_burger']);assert.deepEqual(state.home.menu,menu);assert.deepEqual(state.truckConfig.stations,layout);
  state=act(state,{type:'startPractice'});assert.deepEqual(state.run!.menu,['classic_burger']);state=act(state,{type:'setTruckMenu',recipeIds:['classic_burger','cheeseburger']});assert.deepEqual(state.run!.service!.config.menu,['classic_burger','cheeseburger']);assert.deepEqual(state.truckConfig.stations,layout);assert.equal(state.run!.service!.tick,0);assert.equal(state.run!.service!.customers.length,0);
  state=act(state,{type:'service',action:{type:'open'}});const frozen=structuredClone(state.run!.service!.config.menu);reject(state,{type:'setTruckMenu',recipeIds:['classic_burger']},'invalid_menu');reject(state,{type:'buyTruckRecipe',recipeId:'side_salad'},'recipe_unavailable');assert.deepEqual(state.run!.service!.config.menu,frozen);
});
check('retired setup recipe purchases reject shortcuts and unknown fields atomically',()=>{
  const state=fresh();for(const recipeId of ['fries','lemonade','onion_rings','constructor','__proto__','classic_burger'])reject(state,{type:'buyTruckRecipe',recipeId},'recipe_unavailable');
  reject(state,{type:'buyTruckRecipe',recipeId:'cheeseburger',price:0} as any,'invalid_command');
  const poor=fresh();poor.coins=139;reject(poor,{type:'buyTruckRecipe',recipeId:'cheeseburger'},'recipe_unavailable');
  state.recipes.cheeseburger={level:0};reject(state,{type:'buyTruckRecipe',recipeId:'cheeseburger'},'recipe_unavailable');
  let record=createDinerRecord(now,'shop-tape');assert.throws(()=>replayDiner(record,[{type:'buyTruckRecipe',recipeId:'cheeseburger'},{type:'buyTruckRecipe',recipeId:'cheeseburger'}],now),(error:unknown)=>error instanceof DinerAuthorityError&&error.code==='recipe_unavailable');assert.equal(record.state.coins,200);assert.equal(record.state.recipes.cheeseburger,undefined);
});
check('the first tutorial starts simple but an explicit setup choice can add an owned recipe',()=>{
  let state=packed();state.recipes.cheeseburger={level:0};state=act(state,{type:'setTruckMenu',recipeIds:['cheeseburger']});state=act(state,{type:'startRun'});assert.deepEqual(state.run!.menu,['classic_burger']);state=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});state=act(state,{type:'setTruckMenu',recipeIds:['classic_burger','cheeseburger']});assert.deepEqual(state.run!.service!.config.menu,['classic_burger','cheeseburger']);
  state=act(state,{type:'settle'});assert.deepEqual(state.run!.menu,['classic_burger','cheeseburger']);assert.deepEqual(sanitizeDinerSave(state)!.run!.menu,state.run!.menu);
});
check('old recipes, wealth and layout survive; missing supplies arrive only in the trailer',()=>{
  const old=packed();old.recipes.fries={level:7};old.equipment.fryer={tier:2,truckOwned:true,homeCopies:2};old.truckConfig.menu=['classic_burger','fries'];old.truckConfig.stations=old.truckConfig.stations.filter(station=>!['fridge','plates'].includes(station.kind));delete old.truckConfig.supplyVersion;delete old.truckConfig.menuVersion;delete old.equipment.fridge;delete old.equipment.plates;
  const before=structuredClone(old),restored=sanitizeDinerSave(old)!;assert(restored);assert.deepEqual(restored.truckConfig.stations,before.truckConfig.stations);assert.deepEqual(restored.recipes,before.recipes);assert.deepEqual(restored.equipment.fryer,before.equipment.fryer);assert.equal(restored.coins,before.coins);assert.deepEqual(restored.truckConfig.menu,before.truckConfig.menu);
  for(const id of ['fridge','plates'])assert.equal(truckStorage(restored).find(item=>item.equipmentId===id)!.available,1);assert.deepEqual(sanitizeDinerSave(restored),restored);assert.equal(JSON.stringify(old),JSON.stringify(before));
});
check('only unopened old tutorial menus simplify; active old orders and raw portions remain intact',()=>{
  const old=packed();old.recipes.fries={level:3};old.equipment.fryer.truckOwned=true;old.truckConfig.menu=['classic_burger','fries'];delete old.truckConfig.menuVersion;
  let state=act(old,{type:'startRun'});state=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});
  const layout=buildServiceLoadout(1,['classic_burger','fries']);state.run!.menu=['classic_burger','fries'];state.run!.service=createService({seed:'legacy-raw',menu:['classic_burger','fries'],physicalSupplies:false,...layout});delete state.truckConfig.menuVersion;
  const unopened=sanitizeDinerSave(state)!;assert(unopened);assert.deepEqual(unopened.run!.menu,['classic_burger']);assert.equal(unopened.recipes.fries.level,3);
  state.run!.service=dispatchService(state.run!.service,{type:'open'});state.run!.service=dispatchService(state.run!.service,{type:'interact',targetId:'crate',recipeId:'fries'});while(state.run!.service.chef.path.length)stepService(state.run!.service,1);
  const portion=structuredClone(state.run!.service.chef.held),active=sanitizeDinerSave(state)!;assert(active);assert.deepEqual(active.run!.menu,['classic_burger','fries']);assert.deepEqual(active.run!.service!.config.menu,['classic_burger','fries']);assert.deepEqual(active.run!.service!.chef.held,portion);assert.equal(active.run!.service!.phase,'paused');assert.equal(active.run!.service!.config.physicalSupplies,false);
});
check('new tutorial completion never grants an unchosen fryer or fries recipe',()=>{
  let state=act(packed(),{type:'startRun'});state=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});state.run!.service!.phase='failed';state.run!.service!.strikes=3;state=act(state,{type:'service',action:{type:'pause'}});
  assert.equal(state.equipment.fryer.truckOwned,false);assert.equal(state.equipment.fryer.homeCopies,0);assert(!state.lastRun!.equipment.includes('fryer'));assert.equal(state.recipes.fries,undefined);assert.deepEqual(state.truckConfig.menu,['classic_burger']);assert.equal(state.tutorial.fryerGifted,false);
  reject(state,{type:'buyTruckRecipe',recipeId:'fries'},'recipe_unavailable');assert.deepEqual(state.home.menu.starter,[]);
  state=act(state,{type:'startRun'});state=act(state,{type:'goHome'});assert.equal(state.equipment.fryer.homeCopies,0);
});
console.log(`PASS ${groups} diner recipe-policy groups`);
