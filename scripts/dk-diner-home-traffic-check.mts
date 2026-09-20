import assert from 'node:assert/strict';
import {createHomeWorld,stepHomeWorld,measureHomeRates,HOME_SIM_RULES,type HomeSimulationConfig,type HomeWorld} from '../src/lib/chef/diner/home-simulation';
let groups=0;function test(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function config():HomeSimulationConfig{return {w:8,h:8,layout:[{id:'grill',equipmentId:'grill',x:1,y:0,rotation:0},{id:'prep',equipmentId:'prep',x:3,y:0,rotation:0},{id:'sink',equipmentId:'sink',x:5,y:0,rotation:0},{id:'table',equipmentId:'table_2',x:2,y:3,rotation:0}],equipment:{grill:{tier:1},prep:{tier:1},sink:{tier:1},table_2:{tier:1}},menu:['classic_burger'],recipeLevels:{classic_burger:0},chefs:1,waiters:1,arrivalRate:120};}
const near=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
function invariants(w:HomeWorld){
 for(const actor of w.actors){assert(w.walkable[Math.round(actor.y)*w.config.w+Math.round(actor.x)],`${actor.id} entered furniture`);for(const other of w.actors)if(other.id!==actor.id)assert(near(actor,other)>=.6499,`${actor.id}/${other.id} overlap at tick${w.tick}: ${near(actor,other)}`);for(const c of w.customers)if(c.phase==='seated'||c.phase==='eating')assert(near(actor,c)>=.6499,`${actor.id} entered occupied chair`);for(const table of w.tables)for(const seat of table.seats)assert(near(actor,seat)>=.6499,`${actor.id} entered a chair`);}
 const items=[...w.actors.map(actor=>actor.held),...w.stations.flatMap(st=>st.slots.map(slot=>slot.item)),...w.tables.flatMap(table=>table.seats.map(seat=>seat.item))].filter(Boolean);assert.equal(new Set(items.map(item=>item!.id)).size,items.length,'one physical owner per dish');
}
test('the cook works at the front and waiter uses a separate counter handoff and table edge',()=>{
 const w=createHomeWorld(config());assert(w.stations.every(st=>near(st.front,st.handoff)>=1));let picked=false,served=false,parked=false;
 for(let tick=0;tick<9000;tick++){stepHomeWorld(w);invariants(w);for(const actor of w.actors){if(actor.role==='waiter'&&actor.task?.kind==='deliver'&&actor.task.phase==='pickup'&&actor.goal){const st=w.stations.find(st=>st.id===actor.task!.stationId)!;assert.notDeepEqual(actor.goal,st.front);picked=true;}if(actor.role==='waiter'&&actor.task?.phase==='drop'&&actor.task.kind==='deliver'&&actor.goal){assert(w.tables[0].servicePoints.some(p=>near(p,actor.goal!)<.001));assert(w.tables[0].seats.every(p=>near(p,actor.goal!)>=1));served=true;}if(actor.role==='chef'&&!actor.task&&!actor.path.length&&w.metrics.plates>0){assert(w.stations.every(st=>near(st.front,actor)>.65));parked=true;}}}
 assert(picked&&served&&parked,JSON.stringify({picked,served,parked,actors:w.actors,plates:w.metrics.plates}));assert(w.metrics.plates>=10,`only ${w.metrics.plates} meals`);assert(w.metrics.washed>=9);console.log(`  starter: ${w.metrics.plates} meals, ${w.metrics.washed} washes in ${w.tick/1200}min`);
});
test('three chefs and three waiters stay distinct and keep working in a crowded starter',()=>{
 const c=config();c.chefs=3;c.waiters=3;c.arrivalRate=600;c.equipment.grill.tier=3;c.equipment.prep.tier=3;c.equipment.sink.tier=3;c.layout.push({id:'table2',equipmentId:'table_2',x:5,y:3,rotation:0});const w=createHomeWorld(c);let halfway=0;
 for(let tick=0;tick<18000;tick++){stepHomeWorld(w);invariants(w);if(tick===8999)halfway=w.metrics.plates;}
 assert(halfway>10,`first half stalled: ${halfway}`);assert(w.metrics.plates>halfway+10,`second half stalled: ${w.metrics.plates}`);assert(w.metrics.washed>20);console.log(`  crowded: ${w.metrics.plates} meals, ${w.metrics.washed} washes; halfway${halfway}`);
 const a=structuredClone(w),b=structuredClone(w);stepHomeWorld(a,1000);stepHomeWorld(b,400);const restored=JSON.parse(JSON.stringify(b));stepHomeWorld(restored,600);assert.deepEqual(restored,a);
});
test('rotated equipment and one-seat tables retain reachable work, handoff and serving positions',()=>{
 for(const rotation of [0,1,2,3] as const){const c=config();c.w=10;c.h=10;c.arrivalRate=60;c.layout=[{id:'grill',equipmentId:'grill',x:2,y:2,rotation},{id:'prep',equipmentId:'prep',x:5,y:2,rotation},{id:'sink',equipmentId:'sink',x:7,y:2,rotation},{id:'table',equipmentId:'table_1',x:4,y:6,rotation}];c.equipment.table_1={tier:1};const w=createHomeWorld(c);assert.equal(w.tables[0].seats.length,1);assert(w.tables[0].servicePoints.length>0);for(let tick=0;tick<6000;tick++){stepHomeWorld(w);invariants(w);}assert(w.metrics.plates>=3,`rotation${rotation} stalled with${w.metrics.plates}`);}
});
test('offline measurement uses exactly the same separated traffic loop',()=>{
 const c=config();c.arrivalRate=8;const w=createHomeWorld(c);stepHomeWorld(w,HOME_SIM_RULES.measurementWarmupTicks);const coins=w.metrics.coins,plates=w.metrics.plates;stepHomeWorld(w,HOME_SIM_RULES.measurementTicks);const rate=measureHomeRates(c),hours=HOME_SIM_RULES.measurementTicks/72000;assert.equal(rate.plates,(w.metrics.plates-plates)/hours);assert.equal(rate.coins,(w.metrics.coins-coins)/hours);assert.equal(rate.plates,8);
});
console.log(`PASS ${groups} home traffic groups`);
