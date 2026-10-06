/** Actual cooking, two-seat delivery and recoverable serving errors. No generated saves. */
import assert from 'node:assert/strict';
import { buildServiceLoadout, makeTable } from '../src/lib/chef/diner/geometry';
import { createService, dispatchService, sanitizeService, serviceTargetIntent, stepService } from '../src/lib/chef/diner/service';
import type { ServiceAction, ServiceState } from '../src/lib/chef/diner/types';

let passed=0,failed=0;
function test(name:string,run:()=>void){try{run();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}: ${error instanceof Error?error.message:error}`);}}
class Lunch {
  s:ServiceState;
  constructor(customers=2,rotation:0|1|2|3=0){
    this.s=dispatchService(createService({...buildServiceLoadout(1,['classic_burger']),seed:'two-seat-lunch',menu:['classic_burger'],tables:[makeTable('shared',3,5,2,1,rotation)],customers,arrivalTicks:20,maxWaitingCustomers:4,tablePatienceTicks:18000,queuePatienceTicks:18000,tutorialLearning:false}),{type:'open'});
    assert.equal(this.s.phase,'playing',this.s.notice);
  }
  send(action:ServiceAction){this.s=dispatchService(this.s,action);}
  until(fn:()=>boolean){let n=0;while(!fn()&&n++<18000&&['playing','closing'].includes(this.s.phase))stepService(this.s,1);assert(fn(),`Timed out: ${this.s.notice}`);}
  touch(targetId:string,seatId?:string,ingredientId?:string){this.send({type:'interact',targetId,seatId,...(ingredientId?{recipeId:'classic_burger',ingredientId}:{})});this.until(()=>!this.s.chef.path.length);}
  cook(plated=true){
    this.touch('fridge',undefined,'beef');this.touch('grill');this.until(()=>!!this.s.stations.find(st=>st.kind==='grill')!.slots[0].job?.ready);this.touch('grill');this.touch('prep');
    this.touch('crate',undefined,'bun');this.touch('prep');this.send({type:'hold',active:true});this.until(()=>!!this.s.stations.find(st=>st.kind==='prep')!.slots[0].job?.ready);this.send({type:'hold',active:false});
    if(plated)this.touch('plates');this.touch('prep');assert.equal(this.s.chef.held?.kind,plated?'dish':'processed');
  }
  seated(){this.until(()=>this.s.customers.filter(c=>c.phase==='seated').length===2);}
}

test('an unplated burger gives plate instructions for the table and either seat, then can be plated and served',()=>{
  const d=new Lunch();d.seated();d.cook(false);const held=d.s.chef.held!.id;
  for(const seatId of [undefined,...d.s.tables[0].seats.map(seat=>seat.id)]){
    assert.match(serviceTargetIntent(d.s,'shared',seatId).label,/plate/i);
    d.touch('shared',seatId);assert.match(d.s.notice,/plate/i);assert.doesNotMatch(d.s.notice,/nobody.*ordered|different dish/i);assert.equal(d.s.served,0);assert.equal(d.s.chef.held!.id,held);
  }
  d.touch('prep');d.touch('plates');d.touch('prep');d.touch('shared',d.s.tables[0].seats[1].id);assert.equal(d.s.served,1);assert.equal(d.s.tables[0].seats[1].status,'eating');assert(sanitizeService(d.s));
});

test('the second seat serves first, and both customers receive their own finite plate in all four table rotations',()=>{
  for(const rotation of [0,1,2,3] as const){
    const d=new Lunch(2,rotation);d.seated();const seats=d.s.tables[0].seats.map(seat=>seat.id),plates:string[]=[];
    for(const seatId of [seats[1],seats[0]]){d.cook();plates.push(d.s.chef.held!.plateId!);d.touch('shared',seatId);assert.equal(d.s.tables[0].seats.find(seat=>seat.id===seatId)!.status,'eating',d.s.notice);}
    assert.equal(d.s.served,2);assert.equal(new Set(plates).size,2);assert.equal(d.s.cleanPlates,0);assert(sanitizeService(d.s));
  }
});

test('a dirty first seat does not block an eligible second seat; explicit dirty-seat selection stays exact',()=>{
  const d=new Lunch(4);d.seated();const seats=d.s.tables[0].seats.map(seat=>seat.id);
  d.cook();d.touch('shared',seats[0]);d.until(()=>{const seat=d.s.tables[0].seats[0];return seat.item?.kind==='dirty'&&seat.status==='occupied';});
  d.cook();const held=d.s.chef.held!.id;
  d.touch('shared',seats[0]);assert.equal(d.s.served,1);assert.equal(d.s.chef.held!.id,held);assert.match(d.s.notice,/clear/i);
  assert.equal(serviceTargetIntent(d.s,'shared').disabled,false,'clean second seat must still be actionable');
  d.touch('shared');assert.equal(d.s.served,2,d.s.notice);assert.equal(d.s.tables[0].seats[1].status,'eating');assert.equal(d.s.tables[0].seats[0].item?.kind,'dirty');assert(sanitizeService(d.s));
});

test('a served or wrong seat never consumes another burger or steals another customer’s order',()=>{
  const d=new Lunch(3);d.seated();const seatId=d.s.tables[0].seats[1].id;d.cook();d.touch('shared',seatId);
  // Keep this customer eating while a second burger is made.
  d.s.customers.find(c=>c.seatId===seatId&&c.phase==='eating')!.eatRemaining=12000;
  d.cook();const held=d.s.chef.held!.id;d.touch('shared',seatId);assert.equal(d.s.served,1);assert.equal(d.s.chef.held!.id,held);assert.match(d.s.notice,/already|enjoying/i);
  d.touch('shared','not-a-seat');assert.equal(d.s.served,1);assert.equal(d.s.chef.held!.id,held);
  d.touch('shared',d.s.tables[0].seats[0].id);assert.equal(d.s.served,2);assert(sanitizeService(d.s));
});
console.log(`${passed} passed; ${failed} failed table-service groups`);process.exitCode=failed?1:0;
