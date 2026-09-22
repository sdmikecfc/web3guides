import assert from 'node:assert/strict';
import { buildServiceLoadout, inServiceFloor, makeTable, pointKey, serviceGeometry, serviceQueueSlots, validateServiceLayout } from '../src/lib/chef/diner/geometry';
import { availableServiceQueueSpots, createService, sanitizeService, stepService } from '../src/lib/chef/diner/service';
import { SERVICE_RULES } from '../src/lib/chef/diner/content';
import type { Point, ServiceCustomer, ServiceState } from '../src/lib/chef/diner/types';

let checks=0;
function check(name:string,run:()=>void){run();checks++;console.log(`OK ${name}`);}
function guest(id:string,p:Point,phase:ServiceCustomer['phase']='queue'):ServiceCustomer{return {id,...p,phase,groupId:null,type:'walk_in',path:[],recipeId:'classic_burger',patience:12000,maxPatience:12000,queuePatience:12000,tableId:null,seatId:null,mealId:null,eatRemaining:0,payment:0,tip:0,servedCold:false,servedTick:null};}
function occupiedService(count:number):ServiceState{
  const layout=buildServiceLoadout(1,['classic_burger']);layout.tables=[makeTable('solo',3,5,1)];
  const s=createService({...layout,menu:['classic_burger'],customers:20});s.phase='playing';s.nextArrival=10000;s.nextId=100;
  const seat=s.tables[0].seats[0],seated=guest('seated',seat,'seated');seated.tableId='solo';seated.seatId=seat.id;seated.mealId='meal-existing';seat.status='occupied';seat.customerId=seated.id;seat.mealId=seated.mealId;
  const spots=serviceQueueSlots(1,s.stations,s.tables);s.customers=[seated,...Array.from({length:count},(_,i)=>guest(`waiting_${i}`,spots[i]))];s.spawned=s.customers.length;return s;
}
function separated(s:ServiceState){const q=s.customers.filter(c=>c.phase==='queue');for(let i=0;i<q.length;i++)for(let j=i+1;j<q.length;j++)assert(Math.hypot(q[i].x-q[j].x,q[i].y-q[j].y)>=.79999,`${q[i].id} overlapped ${q[j].id}`);}

check('every truck has distinct reachable pavement queue spaces, away from chairs and the exit',()=>{
  for(const tier of [1,2,3,4] as const){const layout=buildServiceLoadout(tier,['classic_burger']),g=serviceGeometry(tier),spots=serviceQueueSlots(tier,layout.stations,layout.tables),chairs=new Set(layout.tables.flatMap(t=>t.seats).map(pointKey));assert(spots.length>=4);assert.equal(new Set(spots.map(pointKey)).size,spots.length);for(const p of spots){assert(inServiceFloor(tier,p));assert(p.y>=g.pavement.y);assert(!chairs.has(pointKey(p)));assert.notDeepEqual(p,g.exit);}}
});
check('legacy five-person pile repairs on reload without changing patience, meals or progress',()=>{
  const s=occupiedService(5),g=serviceGeometry(1);for(const c of s.customers.filter(c=>c.phase==='queue')){c.x=g.queue.x;c.y=g.queue.y;}
  const restored=sanitizeService(s);assert(restored);separated(restored);assert.equal(restored.spawned,s.spawned);assert.deepEqual(restored.customers.map(c=>[c.id,c.patience,c.mealId]),s.customers.map(c=>[c.id,c.patience,c.mealId]));assert(sanitizeService(restored));
  stepService(s,1);separated(s);assert.equal(s.spawned,restored.spawned);
});
check('line closes one place at a time without overlapping, and a mid-step resume preserves positions',()=>{
  const s=occupiedService(2),spots=serviceQueueSlots(1,s.stations,s.tables);s.customers[1].y=spots[1].y;s.customers[2].y=spots[2].y;
  stepService(s,1);separated(s);const restored=sanitizeService(s);assert(restored);assert.deepEqual(restored.customers.map(c=>[c.x,c.y,c.path]),s.customers.map(c=>[c.x,c.y,c.path]));
  for(let tick=0;tick<30;tick++){stepService(s,1);separated(s);}
  assert.deepEqual(s.customers.filter(c=>c.phase==='queue').map(({x,y})=>({x,y})),spots.slice(0,2));
});
check('arrivals cannot claim a spot under someone already moving through it',()=>{
  const s=occupiedService(1),spots=serviceQueueSlots(1,s.stations,s.tables);s.customers[1].y=spots[0].y+.3;
  const available=availableServiceQueueSpots(s);assert(!available.some(p=>pointKey(p)===pointKey(spots[0])));assert(!available.some(p=>pointKey(p)===pointKey(spots[1])));
});
check('family members walk from their own position instead of jumping to the first customer path',()=>{
  const layout=buildServiceLoadout(3,['classic_burger']);layout.tables=[makeTable('family_table',3,5,4)];assert.equal(validateServiceLayout(3,layout.stations,layout.tables),null);
  const s=createService({...layout,tier:3,menu:['classic_burger'],customers:8});s.phase='playing';s.nextArrival=10000;s.nextId=100;const spots=serviceQueueSlots(3,s.stations,s.tables);
  s.customers=spots.slice(0,3).map((p,i)=>({...guest(`family_${i}`,p),type:'family' as const,groupId:'family'}));s.spawned=s.customers.length;const before=s.customers.map(c=>({x:c.x,y:c.y}));stepService(s,1);
  for(let i=0;i<s.customers.length;i++){const c=s.customers[i];assert.equal(c.phase,'walking');assert(Math.hypot(c.x-before[i].x,c.y-before[i].y)<=SERVICE_RULES.customerSpeed/SERVICE_RULES.ticksPerSecond+.00001);}
  assert(sanitizeService(s));
});
console.log(`Passed ${checks} truck queue checks.`);
