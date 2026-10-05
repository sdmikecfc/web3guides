/** Stage geometry, owned stools and enduring migration checks; entirely local. */
import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,getRenovationPreview,sanitizeDinerSave,migrateDinerRestaurant,homeSimulationConfig,type DinerState,type DinerCommand} from '../src/lib/chef/diner/progression';
import {createRestaurantBlueprint,roomModuleGeometry,roomSeatStyles,bathroomBays,validateRoomPlan,resolveRoomMount,alignRoomMounts} from '../src/lib/chef/diner/room-plan';
import {stageDecorIds} from '../src/lib/chef/diner/stage-style-kit';
import {fixtureInventoryFor,installedStools,RENOVATION_RULES} from '../src/lib/chef/diner/renovation';
import {createHomeWorld,homePath,stepHomeWorld} from '../src/lib/chef/diner/home-simulation';
import {createDinerRecord,replayDiner,DinerAuthorityError} from '../src/lib/chef/diner/authority';
import {createLegacyDinerFixture} from './dk-diner-legacy-fixture';
import {createPlacementDraft,previewPlacement} from '../src/app/chef/diner-preview/placement-preview';
const now=Date.UTC(2026,8,21,10);let groups=0;
function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
function act(s:DinerState,c:DinerCommand){const r=dispatchDiner(s,c,{now});assert.equal(r.error,undefined,`${c.type}: ${r.error}`);return r.state;}
function eligible(){const s=createDiner(now);s.coins=100000;s.career.services=100;s.career.byRoute={downtown:100};s.career.byDifficulty={medium:100};s.career.multiRecipe={two:100,three:0};s.collections.routeWins=['downtown'];for(const id of ['classic_burger','fries','lemonade'])s.recipes[id]={level:3};return s;}
function diner(){const s=eligible();return act(s,{type:'renovateHome',stage:'diner',previewToken:getRenovationPreview(s)!.token});}
test('the extended burger counter meets the wall and lift gate in every rotated geometry',()=>{
 const {roomPlan,layout}=createRestaurantBlueprint('burger_shop'),counter=roomPlan.modules.find(m=>m.kind==='display_counter')!,gate=roomPlan.modules.find(m=>m.kind==='lift_gate')!;
 assert.equal(counter.x,0);assert.equal(counter.width,4);assert.equal(gate.x,4);assert.deepEqual(roomModuleGeometry(counter).cells.map(p=>p.x),[0,1,2,3]);assert.equal(validateRoomPlan(roomPlan,layout),null);
 for(const rotation of [0,1,2,3] as const)assert.equal(new Set(roomModuleGeometry({...counter,rotation}).cells.map(p=>`${p.x},${p.y}`)).size,4);
});
test('diner bar aligns with hatch, far bathroom entrance leaves every bay reachable, wall booth serves',()=>{
 const s=diner(),plan=s.home.roomPlan!,world=createHomeWorld(homeSimulationConfig(s)),bar=plan.modules.find(m=>m.kind==='chef_bar')!,hatch=plan.modules.find(m=>m.kind==='service_hatch')!;
 assert.equal(bar.y,hatch.y);assert.equal(bar.y,3);assert(plan.edges.some(e=>e.id==='bath-front-11'&&e.kind==='door'));
 assert.deepEqual(bathroomBays(plan).sinks.map(p=>p.x),[8,9,10]);
 for(const p of bathroomBays(plan).toilets)assert(homePath(world,world.door,{x:p.x,y:1},new Set(),'customer'));
 const booth=s.home.layout.find(p=>p.equipmentId==='booth_2')!,seats=world.tables.find(t=>t.id===booth.id)!.seats;assert.equal(Math.min(...seats.map(p=>p.x)),0);for(const seat of seats)assert(homePath(world,world.door,seat,new Set(),'customer'));
 stepHomeWorld(world,18000);assert(world.metrics.plates>10);assert((world.metrics.fixtureUses['toilet-1']??0)>0);
});
test('renovation carries three classic stools and buys additional styles only when chosen',()=>{
 let s=diner();assert.deepEqual(installedStools(s.home.roomPlan),{classic:3,diner:0});assert.deepEqual(s.home.stools,{classic:3,diner:0});assert.equal(s.home.finishes!.upholstery,'cherry');
 let coins=s.coins;s=act(s,{type:'buyHomeStool',style:'classic'});assert.equal(s.coins,coins-RENOVATION_RULES.stoolPrices.classic);assert.deepEqual(s.home.stools,{classic:4,diner:0});
 const bar=s.home.roomPlan!.modules.find(m=>m.kind==='chef_bar')!;coins=s.coins;s=act(s,{type:'upgradeHomeStool',moduleId:bar.id,seatIndex:0});assert.equal(s.coins,coins-RENOVATION_RULES.stoolUpholsteryPrice);assert.deepEqual(s.home.stools,{classic:4,diner:1});assert.deepEqual(roomSeatStyles(s.home.roomPlan!.modules.find(m=>m.id===bar.id)!),['diner','classic','classic','classic']);
 const repeat=dispatchDiner(s,{type:'upgradeHomeStool',moduleId:bar.id,seatIndex:0},{now});assert.equal(repeat.code,'stool_upgrade_unavailable');assert.deepEqual(repeat.state,s);assert(sanitizeDinerSave(s));
 const restored=act(s,{type:'restoreRenovation',backupId:s.renovation.backups[0].id});assert.deepEqual(restored.home.stools,s.home.stools);const preview=getRenovationPreview(restored)!;assert.deepEqual(installedStools(preview.roomPlan),{classic:4,diner:1});
});
test('unowned stools and counter-width changes cannot be submitted as a layout',()=>{
 const s=diner(),plan=structuredClone(s.home.roomPlan!);plan.modules.find(m=>m.kind==='chef_bar')!.seatStyles=['classic','classic','classic','classic'];const forged=dispatchDiner(s,{type:'homeRoomPlan',roomPlan:plan},{now});assert.equal(forged.code,'invalid_room_plan');assert.deepEqual(forged.state,s);
 const burger=createDiner(now),bad=structuredClone(burger.home.roomPlan!);bad.modules.find(m=>m.kind==='display_counter')!.width=3;assert.equal(dispatchDiner(burger,{type:'homeRoomPlan',roomPlan:bad},{now}).code,'fixture_not_owned');
});
test('stored stools reinstall without charge and repeat requests cannot create more seating',()=>{
 let s=diner();const owned={...s.home.stools!},coins=s.coins,bar=s.home.roomPlan!.modules.find(m=>m.kind==='chef_bar')!;
 assert.equal(dispatchDiner(s,{type:'installHomeStool',style:'classic'},{now}).code,'stool_not_stored');
 s=act(s,{type:'returnHomeStool',moduleId:bar.id,seatIndex:1});assert.deepEqual(installedStools(s.home.roomPlan),{classic:2,diner:0});assert.deepEqual(s.home.stools,owned);
 s=act(s,{type:'installHomeStool',style:'classic'});assert.deepEqual(installedStools(s.home.roomPlan),{classic:3,diner:0});assert.deepEqual(s.home.stools,owned);assert.equal(s.coins,coins);
 const repeat=dispatchDiner(s,{type:'installHomeStool',style:'classic'},{now});assert.equal(repeat.code,'stool_not_stored');assert.deepEqual(repeat.state,s);assert(sanitizeDinerSave(s));
});
test('legacy six-stool diners keep their exact floor plan and existing upholstered seating',()=>{
 const s=diner();delete s.home.stools;const bar=s.home.roomPlan!.modules.find(m=>m.kind==='chef_bar')!;delete bar.seatStyles;bar.y=4;s.home.layout=s.home.layout.filter(p=>!p.id.startsWith('diner-gift-'));
 const original=structuredClone(s.home.roomPlan),migrated=migrateDinerRestaurant(s);assert.deepEqual(migrated.home.roomPlan,original);assert.equal(migrated.home.stools!.diner,6);assert.equal(migrated.home.stools!.classic,3);assert.deepEqual(migrateDinerRestaurant(migrated),migrated);assert(sanitizeDinerSave(migrated));
});
test('stage gift kits and surfaces preview together, remain owned and never duplicate after sale or restore',()=>{
 const initial=eligible(),preview=getRenovationPreview(initial)!;assert.equal(preview.cosmetics.floor,'wood');assert.equal(preview.cosmetics.wall,'diner_panel');assert.deepEqual(Object.keys(preview.includedDecor),stageDecorIds('diner'));assert.equal(initial.cosmetics.floor,'checker');
 let s=act(initial,{type:'renovateHome',stage:'diner',previewToken:preview.token});assert.equal(s.cosmetics.floor,'wood');assert.equal(s.home.layout.filter(p=>p.id.startsWith('diner-gift-')).length,4);
 s=act(s,{type:'homeLayout',layout:s.home.layout.filter(p=>p.equipmentId!=='bear_statue')});s=act(s,{type:'sellDecor',decorId:'bear_statue'});assert.equal(s.decorOwned.bear_statue,0);assert(s.renovation.styleKitGranted!.includes('diner'));
 s=act(s,{type:'restoreRenovation',backupId:s.renovation.backups[0].id});assert.equal(s.cosmetics.floor,'checker');const again=getRenovationPreview(s)!;assert.deepEqual(again.includedDecor,{});assert(!again.layout.some(p=>p.equipmentId==='bear_statue'));s=act(s,{type:'renovateHome',stage:'diner',previewToken:again.token});assert.equal(s.decorOwned.bear_statue,0);assert(sanitizeDinerSave(s));
 const legacy=structuredClone(s);delete legacy.renovation.styleKitGranted;for(const id of stageDecorIds('diner'))delete legacy.decorOwned[id];legacy.renovation.backups=[];legacy.home.layout=legacy.home.layout.filter(p=>!stageDecorIds('diner').includes(p.equipmentId));const layout=structuredClone(legacy.home.layout),migrated=migrateDinerRestaurant(legacy);assert.deepEqual(migrated.home.layout,layout);for(const id of stageDecorIds('diner'))assert.equal(migrated.decorOwned[id],1);assert.deepEqual(migrateDinerRestaurant(migrated),migrated);
});
test('the restaurant includes stone, deco walls and ceiling gifts while preserving purchased surfaces',()=>{
 let s=diner();s.career.services=200;s.career.byRoute={downtown:200};s.career.byDifficulty={busy:200};s.career.multiRecipe={two:200,three:200};s.collections.routeWins.push('boardwalk');for(const id of ['classic_burger','fries','lemonade','coffee','bacon_deluxe_burger','apple_pie'])s.recipes[id]={level:5};
 const preview=getRenovationPreview(s)!;assert.equal(preview.cosmetics.floor,'terrazzo');assert.equal(preview.cosmetics.wall,'deco');assert.deepEqual(Object.keys(preview.includedDecor),stageDecorIds('restaurant'));const chandelier=preview.layout.find(p=>p.equipmentId==='chandelier')!;assert.equal(chandelier.mount!.kind,'ceiling');assert.equal(resolveRoomMount(preview.roomPlan,chandelier.mount!)!.surfaceHeight,2.8);
 const before=structuredClone(s),upgraded=act(s,{type:'renovateHome',stage:'restaurant',previewToken:preview.token});assert.equal(validateRoomPlan(upgraded.home.roomPlan!,upgraded.home.layout),null);assert(sanitizeDinerSave(upgraded));assert.deepEqual(before,s);
 const custom=act(s,{type:'buyFinish',slot:'floor',id:'terracotta'}),chosen=getRenovationPreview(custom)!;assert.equal(chosen.cosmetics.floor,'terracotta');assert.equal(chosen.cosmetics.wall,'deco');assert.equal(dispatchDiner(custom,{type:'renovateHome',stage:'restaurant',previewToken:preview.token},{now}).code,'renovation_changed');
});
test('two guests crossing the exit threshold cannot deadlock arrivals from opposite directions',()=>{
 const s=diner(),w=createHomeWorld({...homeSimulationConfig(s),arrivalRate:0});w.actors=[];
 for(const [i,dx] of [-.4,.3].entries())w.customers.push({...w.door,x:w.door.x+dx,id:`exit-${i}`,phase:'leaving',path:[{...w.door}],tableId:null,seatId:null,orderId:null,recipeId:'classic_burger',eatRemaining:0});
 stepHomeWorld(w,2);assert.equal(w.customers.length,0);
});
test('purchased wood survives later renovations while documented free wood can upgrade to stone',()=>{
 const initial=act(eligible(),{type:'buyFinish',slot:'floor',id:'wood'}),first=getRenovationPreview(initial)!;assert.equal(first.cosmetics.floor,'wood');assert.equal(first.includedFinishes.floor,undefined);
 const s=act(initial,{type:'renovateHome',stage:'diner',previewToken:first.token});assert.equal(s.renovation.surfaceGifts?.floor,undefined);s.career.services=200;s.career.byRoute={downtown:200};s.career.byDifficulty={busy:200};s.career.multiRecipe={two:200,three:200};s.collections.routeWins.push('boardwalk');for(const id of ['classic_burger','fries','lemonade','coffee','bacon_deluxe_burger','apple_pie'])s.recipes[id]={level:5};
 assert.equal(getRenovationPreview(s)!.cosmetics.floor,'wood');assert(sanitizeDinerSave(s));
 const gifted=diner();assert.deepEqual(gifted.renovation.surfaceGifts,{floor:['wood'],wall:['diner_panel']});gifted.career=structuredClone(s.career);gifted.collections.routeWins=[...s.collections.routeWins];gifted.recipes=structuredClone(s.recipes);assert.equal(getRenovationPreview(gifted)!.cosmetics.floor,'terrazzo');
 const forged=structuredClone(gifted);forged.renovation.surfaceGifts={floor:['wood','bogus']};assert.equal(sanitizeDinerSave(forged),null);
});
test('earlier three-tile counters and customized layouts load unchanged and continue service',()=>{
 const s=createDiner(now),plan=s.home.roomPlan!,counter=plan.modules.find(m=>m.kind==='display_counter')!;counter.x=1;delete counter.width;delete s.home.fixtureInventory![counter.id].width;plan.edges.find(e=>e.id==='kitchen-0')!.kind='wall';s.home.layout=alignRoomMounts(s.home.layout,plan);s.home.layout.find(p=>p.equipmentId==='daisy_pot')!.y=5;delete s.home.stools;
 const layout=structuredClone(s.home.layout),savedPlan=structuredClone(plan),loaded=sanitizeDinerSave(s)!;assert(loaded);assert.deepEqual(loaded.home.roomPlan,savedPlan);assert.deepEqual(loaded.home.layout,layout);assert.equal(roomModuleGeometry(loaded.home.roomPlan!.modules.find(m=>m.kind==='display_counter')!).cells.length,3);
 const w=createHomeWorld(homeSimulationConfig(loaded));stepHomeWorld(w,18000);assert(w.metrics.plates>8);assert(w.metrics.washed>8);
});
test('ceiling mounts reject invalid supports and floor props while keeping customer circulation open',()=>{
 const s=diner();s.career.services=200;s.career.byRoute={downtown:200};s.career.byDifficulty={busy:200};s.career.multiRecipe={two:200,three:200};s.collections.routeWins.push('boardwalk');for(const id of ['classic_burger','fries','lemonade','coffee','bacon_deluxe_burger','apple_pie'])s.recipes[id]={level:5};
 const full=act(s,{type:'renovateHome',stage:'restaurant',previewToken:getRenovationPreview(s)!.token}),chandelier=full.home.layout.find(p=>p.equipmentId==='chandelier')!,invalid=structuredClone(full.home.layout);invalid.find(p=>p.id===chandelier.id)!.mount!.targetId='outer-side';assert(validateRoomPlan(full.home.roomPlan!,invalid));
 const noCeiling=full.home.layout.filter(p=>p.id!==chandelier.id),withLight=createHomeWorld(homeSimulationConfig(full)),withoutLight=createHomeWorld(homeSimulationConfig({...full,home:{...full.home,layout:noCeiling}}));assert.deepEqual(withLight.walkable,withoutLight.walkable);
 const fakeFloorProp=structuredClone(full.home.layout);fakeFloorProp.find(p=>p.id===chandelier.id)!.equipmentId='bear_statue';assert(validateRoomPlan(full.home.roomPlan!,fakeFloorProp));
 for(const state of [diner(),full]){const world=createHomeWorld({...homeSimulationConfig(state),arrivalRate:180});stepHomeWorld(world,18000);const first=world.metrics.plates;stepHomeWorld(world,18000);assert(first>20);assert(world.metrics.plates>first+15,`${state.home.roomPlan!.stage} keeps serving after busy traffic`);assert(world.metrics.washed>30);for(const person of [...world.actors,...world.customers])assert(world.walkable[Math.round(person.y)*world.config.w+Math.round(person.x)]);}
});
test('authoritative stool action tapes reject unowned installation without partially charging a purchase',()=>{
 const record=createDinerRecord(now,'stool-replay');record.state=diner();const before=structuredClone(record);
 assert.throws(()=>replayDiner(record,[{type:'buyHomeStool',style:'classic'},{type:'installHomeStool',style:'classic'}],now),error=>error instanceof DinerAuthorityError&&error.code==='stool_not_stored');assert.deepEqual(record,before);
 const accepted=replayDiner(record,[{type:'buyHomeStool',style:'classic'}],now);assert.equal(accepted.record.state.coins,record.state.coins-RENOVATION_RULES.stoolPrices.classic);assert.deepEqual(accepted.record.state.home.stools,{classic:4,diner:0});assert(sanitizeDinerSave(accepted.record.state));
});
test('legacy rooms cannot buy or floor-place a ceiling light and keep all existing furniture unchanged',()=>{
 const legacy=createLegacyDinerFixture(now,'legacy-ceiling');legacy.coins=10000;const before=structuredClone(legacy),purchase=dispatchDiner(legacy,{type:'buyDecor',decorId:'chandelier'},{now});assert.equal(purchase.code,'ceiling_unavailable');assert.deepEqual(purchase.state,before);
 // A chandelier legitimately retained in storage after restoring an older room
 // remains owned, but must not become a blocking floor furnishing in that room.
 legacy.decorOwned.chandelier=1;const layout=structuredClone(legacy.home.layout),draft=createPlacementDraft(legacy,'home','chandelier','stored-light'),preview=previewPlacement(legacy,draft);assert.match(preview.error!,/ceiling/);assert.equal(dispatchDiner(legacy,preview.command,{now}).code,'invalid_layout');assert.deepEqual(legacy.home.layout,layout);assert.equal(sanitizeDinerSave(legacy)!.decorOwned.chandelier,1);
 const current=createDiner(now);current.coins=10000;const bought=act(current,{type:'buyDecor',decorId:'chandelier'}),mounted=createPlacementDraft(bought,'home','chandelier','mounted-light');assert.equal(mounted.mount!.kind,'ceiling');assert.equal(previewPlacement(bought,mounted).error,null);const saved=act(bought,previewPlacement(bought,mounted).command);assert(sanitizeDinerSave(saved));
 const withoutMount=structuredClone(saved.home.layout);delete withoutMount.find(p=>p.id==='mounted-light')!.mount;assert(validateRoomPlan(saved.home.roomPlan!,withoutMount));assert.equal(dispatchDiner(saved,{type:'homeLayout',layout:withoutMount},{now}).code,'invalid_layout');
});
console.log(`PASS ${groups} stage continuity groups`);
