import {Cook} from './dk-diner-cook-fixture';
/** Local career, room ownership and renovation regressions. No network or database. */
import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,sanitizeDinerSave,getRenovationPreview,renovationRequirements,homeSimulationConfig,DINER_RULES,type DinerState,type DinerCommand,type DinerRun} from '../src/lib/chef/diner/progression';
import {createDinerCareer,recordCareerService,CAREER_RULES,careerIngredientRewards} from '../src/lib/chef/diner/career';
import {createRestaurantBlueprint,validateRoomPlan,roomModuleGeometry,ROOM_RULES,resolveRoomMount} from '../src/lib/chef/diner/room-plan';
import {createRenovationState,fixtureInventoryFor} from '../src/lib/chef/diner/renovation';
import {createService,dispatchService,serviceMissingIngredients,serviceRecipeSteps} from '../src/lib/chef/diner/service';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {RECIPE_BY_ID,ingredientSupply,DIFFICULTIES} from '../src/lib/chef/diner/content';
import {recipeVessel,vesselSupplyStation} from '../src/lib/chef/diner/batch';
import {createDinerRecord,migrateDinerRecord,replayDiner} from '../src/lib/chef/diner/authority';
import {createSocialProfile,publicDiner} from '../src/lib/chef/diner/social';
import type {ServiceState,ServiceAction} from '../src/lib/chef/diner/types';
const now=Date.UTC(2026,8,21,8);let groups=0;
function test(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(s:DinerState,c:DinerCommand,time=now){const r=dispatchDiner(s,c,{now:time});assert.equal(r.error,undefined,`${c.type}: ${r.error}`);return r.state;}
function reject(s:DinerState,c:any,code:string){const r=dispatchDiner(s,c,{now});assert.equal(r.code,code,`${c.type}: ${r.error}`);assert.deepEqual(r.state,s);}
function eligible(stage:'diner'|'restaurant'='diner') {const s=createDiner(now,'career');s.coins=1000000;s.tutorial.finished=true;s.collections.routeWins=['downtown','boardwalk'];for(const id of ['classic_burger','fries','lemonade','coffee','bacon_deluxe_burger','apple_pie'])s.recipes[id]={level:5};s.career.services=stage==='diner'?100:200;s.career.byRoute={downtown:s.career.services};s.career.byDifficulty={busy:s.career.services};s.career.multiRecipe={two:s.career.services,three:s.career.services};return s;}


test('fresh shop is a ten-by-eight room with three staff, three stools and persistent bathroom fixtures',()=>{
 const s=createDiner(now);assert.equal(s.home.w,10);assert.equal(s.home.h,8);assert.deepEqual(s.home.staff,{chefs:1,waiters:1,cashiers:1});assert.equal(s.home.roomPlan!.stage,'burger_shop');assert.equal(s.home.roomPlan!.modules.filter(m=>m.kind==='console').flatMap(m=>roomModuleGeometry(m).seats).length,3);assert.equal(s.home.fixtureInventory!['toilet-1'].condition,100);assert.equal(validateRoomPlan(s.home.roomPlan!,s.home.layout),null);assert(sanitizeDinerSave(s));assert.equal(s.career.services,0);
});
test('legacy square rooms migrate without rearrangement, wealth loss or invented career history',()=>{
 const raw:any=createDiner(now);delete raw.home.roomPlan;delete raw.home.fixtureInventory;delete raw.career;delete raw.renovation;raw.home.w=raw.home.h=8;raw.home.staff={chefs:1,waiters:1};raw.home.layout=[{id:'old-grill',equipmentId:'grill',x:1,y:0,rotation:0},{id:'old-prep',equipmentId:'prep',x:3,y:0,rotation:0},{id:'old-sink',equipmentId:'sink',x:5,y:0,rotation:0}];raw.coins=123456;raw.recipes.classic_burger.level=10;raw.collections.routeWins=['downtown'];const restored=sanitizeDinerSave(raw)!;assert(restored);assert.deepEqual(restored.home.layout,raw.home.layout);assert.equal(restored.home.roomPlan,undefined);assert.equal(restored.coins,raw.coins);assert.equal(restored.career.services,0);assert.deepEqual(restored.career.servedRecipes,{});assert.equal(getRenovationPreview(restored)!.stage,'burger_shop');
});
test('renovation previews do not mutate and confirmation keeps all ownership and an exact room snapshot',()=>{
 const s=eligible(),before=structuredClone(s),preview=getRenovationPreview(s)!;assert(preview.allowed);assert.deepEqual(s,before);reject(s,{type:'renovateHome',stage:'diner',previewToken:'old'},'renovation_changed');
 const next=act(s,{type:'renovateHome',stage:'diner',previewToken:preview.token});assert.equal(next.home.w,12);assert.equal(next.home.h,10);assert.deepEqual(next.equipment,before.equipment);assert.equal(next.home.staff.cashiers,0);assert.equal(next.home.staff.waiters,2);assert.deepEqual(next.renovation.backups[0].layout,before.home.layout);assert.equal(next.renovation.baseline.services,100);assert.equal(next.coins,before.coins-preview.cost);assert(sanitizeDinerSave(next));
 const restored=act(next,{type:'restoreRenovation',backupId:next.renovation.backups[0].id});assert.deepEqual(restored.home.layout,before.home.layout);assert.equal(restored.coins,next.coins);assert.deepEqual(restored.equipment,next.equipment);
});
test('restaurant needs new-stage service receipts and actual mastery; its three tables grant once across restore',()=>{
 let s=eligible();s=act(s,{type:'renovateHome',stage:'diner',previewToken:getRenovationPreview(s)!.token});assert.equal(renovationRequirements(s).allowed,false);s.career.services=200;s.career.byRoute={downtown:200};s.career.byDifficulty={busy:200};s.career.multiRecipe={two:200,three:200};const beforeTables=s.equipment.table_2.homeCopies;
 s=act(s,{type:'renovateHome',stage:'restaurant',previewToken:getRenovationPreview(s)!.token});assert.equal(s.home.w,14);assert.equal(s.home.h,12);assert.equal(s.equipment.table_2.homeCopies,beforeTables+3);assert.equal(s.home.layout.filter(p=>p.equipmentId==='table_2').length,3);assert(sanitizeDinerSave(s));
 const backup=s.renovation.backups.find(b=>b.stage==='diner')!;s=act(s,{type:'restoreRenovation',backupId:backup.id});s=act(s,{type:'renovateHome',stage:'restaurant',previewToken:getRenovationPreview(s)!.token});assert.equal(s.equipment.table_2.homeCopies,beforeTables+3);
});
test('forged modules cannot mint fixtures and moving or restoring them cannot repair wear',()=>{
 let s=createDiner(now);s.coins=10000;s.home.fixtureInventory!['toilet-1'].condition=35;s.home.roomPlan!.modules.find(m=>m.id==='toilet-1')!.condition=35;
 const plan=structuredClone(s.home.roomPlan!);plan.modules.find(m=>m.id==='toilet-1')!.condition=100;s=act(s,{type:'homeRoomPlan',roomPlan:plan});assert.equal(s.home.roomPlan!.modules.find(m=>m.id==='toilet-1')!.condition,35);
 const forged=structuredClone(plan);forged.modules.find(m=>m.id==='toilet-1')!.id='free-toilet';reject(s,{type:'homeRoomPlan',roomPlan:forged},'fixture_not_owned');
 s=act(s,{type:'buyHomeFixture',kind:'toilet'});assert.equal(s.home.fixtureInventory!['toilet-2'].kind,'toilet');reject(s,{type:'buyHomeFixture',kind:'toilet'},'fixture_capacity');const stock=structuredClone(s.home.fixtureInventory);assert(sanitizeDinerSave(s));assert.deepEqual(sanitizeDinerSave(s)!.home.fixtureInventory,stock);
 s.home.fixtureInventory!['toilet-1'].condition=20;s.home.roomPlan!.modules.find(m=>m.id==='toilet-1')!.condition=20;reject(s,{type:'cleanHomeFixture',moduleId:'toilet-1'},'fixture_repair_needed');const coins=s.coins;s=act(s,{type:'repairHomeFixture',moduleId:'toilet-1'});assert.equal(s.home.fixtureInventory!['toilet-1'].condition,100);assert.equal(s.coins,coins-75);reject(s,{type:'repairHomeFixture',moduleId:'toilet-1'},'fixture_not_needed');
});
test('finite chosen-recipe bundles pay complete sets once without consuming or enlarging the daily allowance',()=>{
 let s=eligible(),minted=s.daily.minted;const before=structuredClone(s.pantry);s=act(s,{type:'claimCareerIngredients',achievementId:'first_lunches',recipeId:'classic_burger'});for(const id of RECIPE_BY_ID.classic_burger.ingredients)assert.equal(s.pantry[id],(before[id]??0)+2);assert.equal(s.daily.minted,minted);reject(s,{type:'claimCareerIngredients',achievementId:'first_lunches',recipeId:'fries'},'career_reward_unavailable');reject(s,{type:'claimCareerIngredients',achievementId:'constructor',recipeId:'classic_burger'},'career_reward_unavailable');reject(s,{type:'claimCareerIngredients',achievementId:'steady_hands',recipeId:'classic_burger',quantity:999},'invalid_command');assert(sanitizeDinerSave(s));
});
test('introductory slow clears retain actual totals but cannot fill the career service gate',()=>{
 const s=eligible();s.career.introductory=100;s.career.byDifficulty={slow:100};assert.equal(renovationRequirements(s).requirements.find(r=>r.id==='services')!.current,12);assert.equal(renovationRequirements(s).allowed,false);assert.equal(s.career.services,100);s.career.introductory=0;s.career.byDifficulty={busy:100};s.recipes.fries.level=2;s.recipes.lemonade.level=2;s.recipes.coffee.level=2;s.recipes.apple_pie.level=2;assert.equal(renovationRequirements(s).requirements.find(r=>r.id==='mastery3')!.met,false);
});
test('actual cooking records count each served recipe and completion once; practice cannot earn career credit',()=>{
 const menu=['classic_burger','fries','lemonade'],loadout=buildServiceLoadout(2,menu);assert.equal(loadout.error,null);let service=createService({...DIFFICULTIES.slow,seed:'career-actual',tier:2,menu,customers:6,queuePatienceTicks:20000,tablePatienceTicks:20000,...loadout});
 new Cook(()=>service,action=>{service=dispatchService(service,action);}).run();assert(service.served>0);
 let state=createDiner(now,'actual-career');state.tutorial.finished=true;state=act(state,{type:'startRun'});state=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});state.run!.service=service;const expected=Object.fromEntries(menu.map(id=>[id,service.customers.filter(c=>c.recipeId===id&&c.servedTick!==null).length]).filter(([,n])=>Number(n)>0));const run=structuredClone(state.run!);state=act(state,{type:'finishService'});assert.deepEqual(state.career.servedRecipes,expected);assert.equal(state.career.services,1);assert.equal(state.career.plates,service.served);assert.equal(recordCareerService(state.career,run),false);run.id='practice';run.practice=true;assert.equal(recordCareerService(state.career,run),false);assert.equal(state.career.services,1);
 console.log(`Measured legal six-guest mixed-menu fixture: ${(service.tick/20/60).toFixed(2)} minutes; this is not a certified renovation pacing result.`);
});
test('independent room finish purchases are once-only and public rooms exclude private career and inventory',()=>{
 let s=createDiner(now);s.coins=10000;const before=s.coins;s=act(s,{type:'buyRoomFinish',slot:'counter',id:'sage'});s=act(s,{type:'buyRoomFinish',slot:'counter',id:'sage'});assert.equal(s.coins,before-250);assert.equal(s.home.finishes!.counter,'sage');reject(s,{type:'setRoomFinish',slot:'sign',id:'coral'},'finish_not_owned');assert(sanitizeDinerSave(s));const profile=createSocialProfile('11111111-1111-4111-8111-111111111111',now);profile.published=true;const payload=publicDiner(s,profile)!;assert(payload.home.roomPlan);assert.equal(payload.home.finishes!.counter,'sage');assert(!JSON.stringify(payload).includes('fixtureInventory'));assert(!('career'in payload));assert(!('paletteOwned'in payload));
});
test('bathroom wear is partition-independent, clock-safe and shared by online and offline credited service',()=>{
 const initial=createDiner(now);initial.home.fixtureInventory!['toilet-1'].condition=22;initial.home.roomPlan!.modules.find(m=>m.id==='toilet-1')!.condition=22;
 const whole=act(initial,{type:'settle'},now+8*3600000);let split=initial;for(let i=1;i<=32;i++)split=act(split,{type:'settle'},now+i*900000);
 assert(Math.abs(whole.home.till.coins-split.home.till.coins)<1e-6);for(const id of ['toilet-1','handwash-1'])assert(Math.abs(whole.home.fixtureInventory![id].condition-split.home.fixtureInventory![id].condition)<1e-6);assert.equal(whole.home.fixtureInventory!['toilet-1'].condition,20);
 assert.deepEqual(act(whole,{type:'settle'},now).home.fixtureInventory,whole.home.fixtureInventory);assert.equal(act(whole,{type:'settle'},now+9*3600000).home.till.coins,whole.home.till.coins);
 const online=dispatchDiner(initial,{type:'settle'},{now:now+3600000,online:true});const offline=dispatchDiner(initial,{type:'settle'},{now:now+6000000});assert.equal(online.error,undefined);assert.equal(offline.error,undefined);assert(Math.abs(online.state.home.till.coins-offline.state.home.till.coins)<1e-6);assert(Math.abs(online.state.home.fixtureInventory!['handwash-1'].condition-offline.state.home.fixtureInventory!['handwash-1'].condition)<1e-6);
});
test('room commits validate layout and ownership together and mounted decor does not invent an extra copy',()=>{
 let s=createDiner(now);s.home.layout=s.home.layout.filter(p=>!p.id.startsWith('welcome-'));s.decorOwned={};s.coins=5000;s=act(s,{type:'buyDecor',decorId:'daisy_pot'});
 const mount={kind:'counter' as const,targetId:'service-counter',slot:1},position=resolveRoomMount(s.home.roomPlan!,mount)!;assert(position);
 const secondMount={...mount,slot:2},secondPosition=resolveRoomMount(s.home.roomPlan!,secondMount)!;assert(secondPosition);
 const item={id:'counter-daisies',equipmentId:'daisy_pot',x:Math.floor(position.x),y:Math.floor(position.y),rotation:position.rotation,mount};
 s=act(s,{type:'homeRoomPlan',roomPlan:s.home.roomPlan!,layout:[...s.home.layout,item]});assert.equal(s.home.layout.at(-1)!.mount?.targetId,'service-counter');assert(sanitizeDinerSave(s));
 reject(s,{type:'homeRoomPlan',roomPlan:s.home.roomPlan!,layout:[...s.home.layout,{...item,id:'free-second',x:Math.floor(secondPosition.x),y:Math.floor(secondPosition.y),mount:secondMount}]},'invalid_room_plan');
 const forged=structuredClone(s.home.roomPlan!);forged.w=14;reject(s,{type:'homeRoomPlan',roomPlan:forged,layout:[]},'invalid_room_plan');
});
test('authoritative commands reject client rewards and a repeated achievement cannot issue another set',()=>{
 const record=createDinerRecord(now,'career-authority');record.state=eligible();const command={type:'claimCareerIngredients' as const,achievementId:'steady_hands',recipeId:'classic_burger'};const next=replayDiner(record,[command],now).record;
 assert.equal(next.state.pantry.beef,3);assert.equal(next.state.daily.minted,record.state.daily.minted);assert.throws(()=>replayDiner(next,[command],now));assert.throws(()=>replayDiner(record,[{...command,ingredients:{beef:999}} as any],now));assert.deepEqual(record.state.pantry,{});
});
test('canonical load migration preserves revision, old rooms and active service without settlement',()=>{
 const record=createDinerRecord(now,'old-canonical');const old:any=record.state;
 delete old.career;delete old.renovation;delete old.paletteOwned;delete old.home.finishes;delete old.home.roomPlan;delete old.home.fixtureInventory;
 old.home.w=old.home.h=8;old.home.staff={chefs:1,waiters:1};old.home.layout=[{id:'old-grill',equipmentId:'grill',x:1,y:0,rotation:0},{id:'old-prep',equipmentId:'prep',x:3,y:0,rotation:0},{id:'old-sink',equipmentId:'sink',x:5,y:0,rotation:0}];
 const loadout=buildServiceLoadout(2,['classic_burger']);old.rally.service=createService({seed:'live-canonical',tier:2,menu:['classic_burger'],practice:true,...loadout});old.rally.service=dispatchService(old.rally.service,{type:'open'});assert.equal(old.rally.service.phase,'playing');
 record.revision=45;record.clock={lastAt:now+1000,creditMs:250,pausedForAbsence:false};const original=structuredClone(record),migrated=migrateDinerRecord(record);
 assert.deepEqual(record,original);assert.equal(migrated.revision,45);assert.deepEqual(migrated.clock,record.clock);assert.deepEqual(migrated.state.home.layout,old.home.layout);assert.equal(migrated.state.home.roomPlan,undefined);assert.deepEqual(migrated.state.rally.service,old.rally.service);assert.equal(migrated.state.updatedAt,old.updatedAt);assert.deepEqual(migrated.state.home.till,old.home.till);assert.equal(migrated.state.career.services,0);assert.deepEqual(migrateDinerRecord(migrated),migrated);
});
test('three-person shop capacity includes its cashier and restoration restores the cashier role',()=>{
 let s=createDiner(now);s.coins=10000;reject(s,{type:'hire',role:'chef'},'staff_full');s.restaurantLevel=5;s=act(s,{type:'hire',role:'chef'});assert.equal(s.home.staff.chefs,2);reject(s,{type:'hire',role:'waiter'},'staff_full');
 const hired=eligible();hired.home.staff={chefs:3,waiters:2,cashiers:1};const upgraded=act(hired,{type:'renovateHome',stage:'diner',previewToken:getRenovationPreview(hired)!.token});assert.deepEqual(upgraded.home.staff,{chefs:3,waiters:3,cashiers:0});
 const invalid=structuredClone(s);invalid.home.staff.cashiers=-1;assert.equal(sanitizeDinerSave(invalid),null);
 let room=eligible();room=act(room,{type:'renovateHome',stage:'diner',previewToken:getRenovationPreview(room)!.token});assert.equal(room.staffMembers.find(m=>m.id==='cashier-1')!.role,'waiter');room=act(room,{type:'restoreRenovation',backupId:room.renovation.backups[0].id});assert.equal(room.staffMembers.find(m=>m.id==='cashier-1')!.role,'cashier');
});
test('saved favourites retain their original room context across renovation and cannot move its stage on apply',()=>{
 let s=eligible();s.home.layout=s.home.layout.filter(p=>!p.id.startsWith('welcome-'));s=act(s,{type:'buyDecor',decorId:'daisy_pot'});const mount={kind:'counter' as const,targetId:'service-counter',slot:1},point=resolveRoomMount(s.home.roomPlan!,mount)!;
 s=act(s,{type:'homeRoomPlan',roomPlan:s.home.roomPlan!,layout:[...s.home.layout,{id:'favourite-flowers',equipmentId:'daisy_pot',x:Math.floor(point.x),y:Math.floor(point.y),rotation:point.rotation,mount}]});s=act(s,{type:'saveLayout',name:'My first counter'});const saved=structuredClone(s.savedLayouts[0]);
 s=act(s,{type:'renovateHome',stage:'diner',previewToken:getRenovationPreview(s)!.token});assert.deepEqual(s.savedLayouts[0],saved);assert(sanitizeDinerSave(s));reject(s,{type:'loadLayout',layoutId:saved.id},'invalid_layout');assert.equal(s.home.roomPlan!.stage,'diner');
 s=act(s,{type:'restoreRenovation',backupId:s.renovation.backups[0].id});s=act(s,{type:'loadLayout',layoutId:saved.id});assert.deepEqual(s.home.layout,saved.layout);assert(sanitizeDinerSave(s));
});
test('the optional restaurant bar is one owned six-seat fixture, preserving the diner bar in storage',()=>{
 reject(createDiner(now),{type:'buyHomeFixture',kind:'chef_bar'},'fixture_unavailable');let state=eligible();state=act(state,{type:'renovateHome',stage:'diner',previewToken:getRenovationPreview(state)!.token});reject(state,{type:'buyHomeFixture',kind:'chef_bar'},'fixture_unavailable');const barId=state.home.roomPlan!.modules.find(m=>m.kind==='chef_bar')!.id;
 state.career.services=200;state.career.byRoute={downtown:200};state.career.byDifficulty={busy:200};state.career.multiRecipe={two:200,three:200};state=act(state,{type:'renovateHome',stage:'restaurant',previewToken:getRenovationPreview(state)!.token});assert.equal(state.home.fixtureInventory![barId].kind,'chef_bar');assert(!state.home.roomPlan!.modules.some(m=>m.id===barId));reject(state,{type:'buyHomeFixture',kind:'chef_bar'},'fixture_capacity');
 const withoutBar=structuredClone(state);delete withoutBar.home.fixtureInventory![barId];const before=withoutBar.coins,purchased=act(withoutBar,{type:'buyHomeFixture',kind:'chef_bar'});assert.equal(purchased.coins,before-3000);assert.equal(Object.values(purchased.home.fixtureInventory!).filter(m=>m.kind==='chef_bar').length,1);assert.deepEqual(purchased.home.layout,withoutBar.home.layout);assert.deepEqual(purchased.home.roomPlan,withoutBar.home.roomPlan);assert(sanitizeDinerSave(purchased));reject(purchased,{type:'buyHomeFixture',kind:'chef_bar'},'fixture_capacity');
});
console.log(`PASS ${groups} renovation/career groups`);
