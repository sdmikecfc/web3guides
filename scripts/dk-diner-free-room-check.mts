import assert from 'node:assert/strict';
import {createRestaurantBlueprint,validateRoomPlan,type RoomPlan} from '../src/lib/chef/diner/room-plan';
import {migrateRoomPlan,compileRestaurantPlan} from '../src/lib/chef/diner/room-plan-v2';
import {createHomeWorld,stepHomeWorld,type HomeSimulationConfig} from '../src/lib/chef/diner/home-simulation';
import {RECIPES} from '../src/lib/chef/diner/content';
import {createDiner,dispatchDiner,sanitizeDinerSave} from '../src/lib/chef/diner/progression';
import {editableConstruction,drawRoomEdges,paintRoomFloor,storeRoomPiece} from '../src/lib/chef/diner/room-construction';
import {starterRoomDesign,roomDesignAssetError,quoteRoomPurchases,trimRoomPurchases,type RoomDesign} from '../src/lib/chef/diner/room-building-draft';
import {createPlacementDraft} from '../src/app/chef/diner-preview/placement-preview';
import {transformRoomGroup,addStoredRoomFixture} from '../src/app/chef/diner-preview/room-editor';
import {getRenovationPreview} from '../src/lib/chef/diner/renovation';
import {settleAudience,validHomeAudience} from '../src/lib/chef/diner/home-audience';
import {reservedWallMount} from '../src/lib/chef/diner/mount-reservations';
const config=(roomPlan:RoomPlan,layout:HomeSimulationConfig['layout'],waiters=1):HomeSimulationConfig=>({roomPlan,w:roomPlan.w,h:roomPlan.h,layout,equipment:Object.fromEntries(layout.map(p=>[p.equipmentId,{tier:1}])),menu:['classic_burger'],recipeLevels:{classic_burger:0},chefs:1,waiters,cashiers:0,staffPolicyVersion:1,arrivalRate:45,arrivalLimit:6});
{
 const state=createDiner(0,'atomic-furniture');state.coins=5000;
 const draft={...editableConstruction({roomPlan:state.home.roomPlan!,layout:state.home.layout}),purchases:{table_1:1}},quote=quoteRoomPurchases(state,draft);
 assert.equal(quote.error,null);assert(quote.cost>0);
 const pos=createPlacementDraft({...quote.owned,home:{...state.home,...draft}},'home','table_1','new-table');
 draft.layout.push({id:pos.id,equipmentId:pos.equipmentId,x:pos.x,y:pos.y,rotation:pos.rotation});
 assert.equal(roomDesignAssetError(state,draft),null);assert.equal(validateRoomPlan(draft.roomPlan,draft.layout),null);
 const saved=dispatchDiner(state,{type:'saveRoomDraft',...draft},{now:0});assert(!saved.error,saved.error);assert.equal(saved.state.coins,state.coins);assert.deepEqual(saved.state.equipment,state.equipment);assert(sanitizeDinerSave(saved.state)?.home.draft?.purchases);
 const moved=transformRoomGroup(draft,['home-grill','home-prep'],0,1);assert.equal(moved.layout.find(p=>p.id==='home-grill')!.y,1);assert.deepEqual(moved.purchases,draft.purchases);
 const command={type:'homeRoomPlan' as const,...draft,expectedCost:quote.cost};
 const poor=structuredClone(state);poor.coins=0;const refused=dispatchDiner(poor,command,{now:0});assert(refused.error);assert.deepEqual(refused.state,poor);
 const bought=dispatchDiner(state,command,{now:0});assert(!bought.error,bought.error);assert.equal(bought.state.coins,state.coins-quote.cost);assert.equal(bought.state.equipment.table_1.homeCopies,(state.equipment.table_1?.homeCopies??0)+1);assert(sanitizeDinerSave(bought.state));
 const retry=dispatchDiner(bought.state,command,{now:0});assert(retry.error);assert.deepEqual(retry.state,bought.state);
 assert(quoteRoomPurchases(state,{purchases:{pack_regular_v2:1}}).error);
 console.log('PASS atomic furniture preview, draft cart reload, cancellation, insufficient funds, repeat submission and no pack purchases');
}
{
 const original=createDiner(0,'pickup-shift'),draft=editableConstruction({roomPlan:original.home.roomPlan!,layout:original.home.layout});
 const counter=draft.roomPlan.modules.find(m=>m.kind==='console')!;draft.roomPlan.seating![counter.id]={mode:'pickup',pointId:'service-counter'};
 const applied=dispatchDiner(original,{type:'homeRoomPlan',...draft},{now:0});assert(!applied.error,applied.error);
 const shift=dispatchDiner(applied.state,{type:'setHomeStaff',chefs:1,waiters:0,cashiers:0},{now:0});assert(!shift.error,shift.error);assert(sanitizeDinerSave(shift.state));assert.deepEqual(shift.state.staffMembers,original.staffMembers);
 const unowned=dispatchDiner(shift.state,{type:'setHomeStaff',chefs:8,waiters:0,cashiers:0},{now:0});assert(unowned.error);
 const broken=structuredClone(draft);broken.roomPlan.seating![counter.id]={mode:'waiter'};assert(dispatchDiner(shift.state,{type:'homeRoomPlan',...broken},{now:0}).error,'a server-free shift cannot apply waiter seating');
 console.log('PASS no-waiter pickup shift, roster preservation, ownership validation and reload');
}
{
 const state=createDiner(0,'fixture-shopping');state.coins=10000;
 const id='draft-fixture-handwash_sink-1',key=`fixture/handwash_sink/${id}`;
 const draft=addStoredRoomFixture({...editableConstruction({roomPlan:state.home.roomPlan!,layout:state.home.layout}),purchases:{[key]:1}},id,'handwash_sink',100);
 const quote=quoteRoomPurchases(state,draft);assert.equal(quote.error,null);assert.equal(quote.cost,350);assert.equal(validateRoomPlan(draft.roomPlan,draft.layout),null);
 const saved=dispatchDiner(state,{type:'saveRoomDraft',...draft},{now:0});assert(!saved.error,saved.error);assert(sanitizeDinerSave(saved.state)?.home.draft);assert(!state.home.fixtureInventory?.[id]);
 const bought=dispatchDiner(state,{type:'homeRoomPlan',...draft,expectedCost:quote.cost},{now:0});assert(!bought.error,bought.error);assert.equal(bought.state.home.fixtureInventory![id].kind,'handwash_sink');assert.equal(bought.state.coins,9650);assert(sanitizeDinerSave(bought.state));
 assert(dispatchDiner(bought.state,{type:'homeRoomPlan',...draft,expectedCost:quote.cost},{now:0}).error);
 const removed=trimRoomPurchases(state,storeRoomPiece(draft,id));assert.equal(quoteRoomPurchases(state,removed).cost,0);
 const attached:RoomDesign={...draft,purchases:{...draft.purchases,pie_display:1},layout:[...draft.layout,{id:'new-pie',equipmentId:'pie_display',x:0,y:0,rotation:0,mount:{kind:'counter',targetId:id,slot:0}}]};
 assert.deepEqual(trimRoomPurchases(state,storeRoomPiece(attached,id)).purchases,{},'removing supports also removes unattached preview purchases');
 console.log('PASS fixture preview and purchase, unfinished reload, no duplicate grant and attached-preview cart cleanup');
}
{
 const state=createDiner(0,'free-construction'),draft=editableConstruction({roomPlan:state.home.roomPlan!,layout:state.home.layout});
 assert.equal(validateRoomPlan(draft.roomPlan,draft.layout),null);
 const applied=dispatchDiner(state,{type:'homeRoomPlan',...draft},{now:0});assert(!applied.error,applied.error);assert(sanitizeDinerSave(applied.state));assert.equal(applied.state.coins,state.coins);assert.deepEqual(applied.state.decorOwned,state.decorOwned);
 const painted=paintRoomFloor(draft,{x:3,y:6},{x:4,y:7},'patio');assert.equal(painted.roomPlan.surfaces!.filter(s=>s.kind==='patio').length,4);
 const wall=drawRoomEdges(painted,{x:3,y:6},{x:5,y:6},'wall'),erased=drawRoomEdges(wall,{x:3,y:6},{x:5,y:6},'erase');assert.equal(wall.roomPlan.edges.length,painted.roomPlan.edges.length+2);assert.equal(erased.roomPlan.edges.length,painted.roomPlan.edges.length);
 assert(reservedWallMount(draft.roomPlan,{kind:'wall',targetId:'outer-back-2',slot:0}),'editable starter menu keeps its reserved space');
 const withoutMenuWall=storeRoomPiece(draft,'outer-back-2');assert.equal(reservedWallMount(withoutMenuWall.roomPlan,{kind:'wall',targetId:'outer-back-1',slot:0}),null,'removing support releases the sign space');
 console.log('PASS free construction, ownership-preserving commit and hydration');
}
for(const stage of ['burger_shop','diner','restaurant'] as const){const b=createRestaurantBlueprint(stage),plan=migrateRoomPlan(b.roomPlan,b.layout);assert.equal(plan.version,2);assert.deepEqual(plan.modules,b.roomPlan.modules);assert.deepEqual(plan.edges,b.roomPlan.edges);assert.equal(validateRoomPlan(plan,b.layout),null,stage);assert.deepEqual(migrateRoomPlan(plan,b.layout),plan);console.log('PASS migrated starter',stage);}
function openRoom(){const b=createRestaurantBlueprint('restaurant'),plan=migrateRoomPlan(b.roomPlan,b.layout);plan.legacyShell=false;plan.edges=[];plan.zones=[];plan.modules=[];plan.seating={};const layout=[{id:'grill',equipmentId:'grill',x:4,y:3,rotation:0 as const},{id:'prep',equipmentId:'prep',x:6,y:3,rotation:0 as const},{id:'sink',equipmentId:'sink',x:8,y:3,rotation:0 as const},{id:'table',equipmentId:'table_2',x:4,y:7,rotation:0 as const}];return {plan,layout};}
function run(c:HomeSimulationConfig){const w=createHomeWorld(c);assert.equal(w.notice,'');let movingFood=false;for(let i=0;i<18000;i++){stepHomeWorld(w);movingFood ||=w.customers.some(c=>!!c.held)||w.actors.some(a=>!!a.held);const items=[...w.actors.map(a=>a.held),...w.customers.map(c=>c.held),...w.stations.flatMap(s=>[...s.slots,...s.dirtySlots??[]].map(s=>s.item)),...w.tables.flatMap(t=>t.seats.map(s=>s.item))].filter(Boolean);assert.equal(items.length,new Set(items.map(i=>i!.id)).size,'food exists once');if(w.metrics.plates>=6&&!w.customers.length&&w.tables.every(t=>t.seats.every(s=>s.status==='clean')))break;}assert(w.metrics.plates>=3,JSON.stringify({plates:w.metrics.plates,customers:w.customers,actors:w.actors,orders:w.orders}));assert(movingFood);return w;}
{
 const {plan,layout}=openRoom();assert.equal(validateRoomPlan(plan,layout),null);const w=run(config(plan,layout));console.log('PASS open cooking island without a mandatory pass or kitchen zone',w.metrics.plates);
 const c=compileRestaurantPlan(plan,layout);assert(c.path(plan.entrances![0].at,{x:4,y:4}));
 plan.surfaces!.find(s=>s.x===4&&s.y===4)!.kind='garden';assert(validateRoomPlan(plan,layout));
}
{
 const {plan,layout}=openRoom();plan.modules=[{id:'pickup',kind:'internal_pass',x:8,y:6,rotation:0}];plan.seating={table:{mode:'pickup',pointId:'pickup'}};assert.equal(validateRoomPlan(plan,layout),null);const w=run(config(plan,layout,0));console.log('PASS self-service pickup, physical carrying, returns and cook washing without waiters',w.metrics.plates,w.metrics.washed);
}
{
 const {plan,layout}=openRoom();layout.pop();plan.modules=[{id:'hibachi',kind:'chef_bar',x:3,y:7,rotation:0,seatStyles:['classic','classic','classic']}];plan.seating={hibachi:{mode:'chef'}};assert.equal(validateRoomPlan(plan,layout),null);const w=run(config(plan,layout,0));console.log('PASS chef-side service and clearing without waiters',w.metrics.plates);
}
{
 const {plan,layout}=openRoom();layout.pop();
 plan.modules=[{id:'south-bar',kind:'chef_bar',x:4,y:7,rotation:0,seatStyles:['classic','classic']},{id:'west-bar',kind:'chef_bar',x:2,y:1,rotation:1,seatStyles:['classic','classic']},{id:'east-bar',kind:'chef_bar',x:10,y:1,rotation:3,seatStyles:['classic','classic']}];
 plan.seating=Object.fromEntries(plan.modules.map(m=>[m.id,{mode:'chef'}]));assert.equal(validateRoomPlan(plan,layout),null);const w=run(config(plan,layout,0));assert.equal(w.metrics.plates,6);console.log('PASS U-shaped hibachi, opposite working sides and no-waiter cleanup');
}
{
 const {plan,layout}=openRoom();plan.modules=[{id:'pass',kind:'internal_pass',x:8,y:5,rotation:0}];
 for(let x=1;x<12;x++)plan.edges.push({id:`separate-${x}`,a:{x,y:5},b:{x,y:6},kind:x===3?'staff_gate':x===8||x===9?'hatch':'wall',height:2.4});
 for(let y=0;y<6;y++)for(const x of [0,11])plan.edges.push({id:`side-${x}-${y}`,a:{x,y},b:{x:x+1,y},kind:'wall',height:2.4});
 assert.equal(validateRoomPlan(plan,layout),null);const w=run(config(plan,layout));assert.equal(w.metrics.plates,6);console.log('PASS separate kitchen with actual staff gate and pass');
}
{
 const {plan,layout}=openRoom();for(const tile of plan.surfaces!){if(tile.y>=5)tile.kind='patio';if(tile.x>=8&&tile.x<=10&&tile.y>=8&&tile.y<=9)tile.kind='garden';}
 assert.equal(validateRoomPlan(plan,layout),null);const w=run(config(plan,layout));assert.equal(w.metrics.plates,6);console.log('PASS courtyard dining, patio paths and planted non-walkable area');
}
{
 const {plan,layout}=openRoom(),c=config(plan,layout),state=createDiner(0,'layout-transition');
 settleAudience(state,c,30000,true);assert(state.homeAudience!.world.orders.length);
 const accepted=state.homeAudience!.world.metrics.arrivals,next=structuredClone(c);next.layout.find(p=>p.id==='table')!.x=5;
 const oldTick=state.homeAudience!.world.tick,oldTill=state.home.till.coins;
 settleAudience(state,next,0,true);assert(state.homeAudience!.pendingLayout);assert.equal(state.homeAudience!.world.tick,oldTick);assert.equal(state.home.till.coins,oldTill);assert.equal(state.homeAudience!.world.config.layout[3].x,4);
 const restored=JSON.parse(JSON.stringify(state));assert(validHomeAudience(restored.homeAudience));
 for(let i=0;i<600&&state.homeAudience!.pendingLayout;i++){settleAudience(state,next,1000,true);settleAudience(restored,next,1000,true);}
 assert(!state.homeAudience!.pendingLayout,'old service eventually drains');assert(state.homeAudience!.world.metrics.plates>=accepted);assert.equal(state.homeAudience!.world.config.layout[3].x,5);assert.deepEqual(state.homeAudience,restored.homeAudience);assert.equal(state.home.till.coins,restored.home.till.coins);
 console.log('PASS pending layout survives reload and settles accepted meals once');
}

{
 const original=createDiner(0,'draft-ownership'),draft=editableConstruction({roomPlan:original.home.roomPlan!,layout:original.home.layout});
 draft.layout.find(p=>p.id==='home-grill')!.x=2;
 assert(validateRoomPlan(draft.roomPlan,draft.layout),'unfinished overlaps stay a preview');
 const saved=dispatchDiner(original,{type:'saveRoomDraft',...draft},{now:0});assert(!saved.error,saved.error);
 assert.deepEqual(saved.state.home.layout,original.home.layout);assert.deepEqual(saved.state.home.roomPlan,original.home.roomPlan);
 const hydrated=sanitizeDinerSave(saved.state);assert(hydrated?.home.draft);assert.deepEqual(hydrated.home.draft.layout,draft.layout);
 const forbidden=structuredClone(draft);forbidden.roomPlan.surfaces![0].finish='terrazzo';assert(roomDesignAssetError(original,forbidden));
 const rejected=dispatchDiner(original,{type:'saveRoomDraft',...forbidden},{now:0});assert(rejected.error);assert.deepEqual(rejected.state,original);
 const starter=starterRoomDesign(original);assert.equal(starter.missing.length,0);assert.equal(roomDesignAssetError(original,starter.draft),null);assert.equal(validateRoomPlan(starter.draft.roomPlan,starter.draft.layout),null);
 const applied=dispatchDiner(saved.state,{type:'homeRoomPlan',...starter.draft},{now:0});assert(!applied.error,applied.error);assert(!applied.state.home.draft);assert.deepEqual(applied.state.equipment,original.equipment);assert.deepEqual(applied.state.decorOwned,original.decorOwned);
 console.log('PASS unfinished draft reload, ownership rejection and starter preview without grants');
}

{
 const original=createDiner(0,'keep-renovation');original.coins=1000000;original.collections.routeWins=['downtown'];original.career.services=100;original.career.byRoute={downtown:100};original.career.byDifficulty={busy:100};original.career.multiRecipe={two:100,three:100};for(const id of ['classic_burger','fries','lemonade'])original.recipes[id]={level:3};
 const preview=getRenovationPreview(original,'diner','keep')!;assert(preview.allowed);assert.equal(preview.roomPlan.w,12);assert.equal(preview.roomPlan.h,10);assert.equal(validateRoomPlan(preview.roomPlan,preview.layout),null);
 const before=structuredClone(original.home),result=dispatchDiner(original,{type:'renovateHome',stage:'diner',layoutChoice:'keep',previewToken:preview.token},{now:0});assert(!result.error,result.error);assert(sanitizeDinerSave(result.state));assert.deepEqual(result.state.renovation.backups.at(-1)!.layout,before.layout);
 for(const item of before.layout){const moved=result.state.home.layout.find(p=>p.id===item.id)!;assert(moved);if(!item.mount){assert.equal(moved.x,item.x);assert.equal(moved.y,item.y);}}
 const swapped=dispatchDiner(original,{type:'renovateHome',stage:'diner',layoutChoice:'starter',previewToken:preview.token},{now:0});assert(swapped.error);assert.deepEqual(swapped.state,original);
 console.log('PASS keep-layout renovation, preserved ownership, backup and bound preview choice');
}
