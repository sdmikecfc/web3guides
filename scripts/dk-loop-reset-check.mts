import assert from 'node:assert/strict';
import {branchingJourney,readableStopName} from '../src/lib/chef/diner/journey-map';
import {createDiner,dispatchDiner,sanitizeDinerSave,dinerStopService,type DinerCommand} from '../src/lib/chef/diner/progression';
import {serviceNet,serviceWages,roundHelperCapacity} from '../src/lib/chef/diner/round-staff';
import {requiredLoadout} from '../src/app/chef/diner-preview/required-loadout';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,stepService} from '../src/lib/chef/diner/service';
import {homeMountSurfaces,createPlacementDraft,previewPlacement} from '../src/app/chef/diner-preview/placement-preview';
import {pickMountSurface} from '../src/app/chef/diner-preview/placement-surfaces';
import {Ray,Vector3} from 'three';
import {Kitchen} from './dk-diner-reference-kitchen';

const now=Date.UTC(2026,8,25),ordinary=new Set(['slow','medium','busy','special','finale']);
for(let seed=0;seed<100;seed++){
 const map=branchingJourney(String(seed));
 function walk(id:string,path:string[]=[]){const n=map.find(n=>n.id===id)!;assert(n);const next=[...path,id];
  if(!n.next.length){assert.equal(n.kind,'finale');assert.equal(next.filter(id=>ordinary.has(map.find(n=>n.id===id)!.kind)).length,8);assert.equal(map.find(n=>n.id===next[3])!.kind,'shop');return;}
  assert(n.next.every(id=>map.find(x=>x.id===id)?.row===n.row+1));
  if([4,5,7,8].includes(n.row)){assert.equal(n.next.length,1);assert.equal(map.find(x=>x.id===n.next[0])!.column,n.column);}
  n.next.forEach(id=>walk(id,next));
 }walk(map[0].id);
 assert.notDeepEqual(map.filter(n=>n.column===0&&n.row>=4&&n.row<=6).map(n=>n.kind),map.filter(n=>n.column===1&&n.row>=4&&n.row<=6).map(n=>n.kind));
}
console.log('PASS 100 committed maps: eight services on every path, guaranteed first market, differing corridors, no dead ends');
let state=createDiner(now,'loop-reset');
function act(c:DinerCommand){const r=dispatchDiner(state,c,{now});assert.equal(r.error,undefined,`${c.type}: ${r.error}`);state=r.state;}
assert.equal(roundHelperCapacity(state),0);state.career.services=1;assert.equal(roundHelperCapacity(state),1);state.truckTier=2;assert.equal(roundHelperCapacity(state),2);state.truckTier=1;state.career.byRoute.downtown=1;state.career.byDifficulty.slow=1;state.career.receipts=['fixture:completed-teaching'];
act({type:'startRun'});act({type:'chooseNode',nodeId:state.run!.available[0]});
const original=structuredClone(state),proposal=requiredLoadout(state);assert.equal(proposal.error,null);assert(proposal.command);assert.deepEqual(state,original);assert.deepEqual(proposal.added.sort(),['grill','prep']);act(proposal.command);
act({type:'setRoundHelpers',roles:['washer']});assert.equal(state.run!.service!.helpers.length,1);
const config=state.run!.service!.config;assert.equal(config.wageVersion,1);
for(let gross=0;gross<=500;gross++){
 const service={config,coins:gross};assert.equal(serviceWages(service),Math.floor(gross*.2));assert.equal(serviceNet(service)+serviceWages(service),gross);
 let net=0;for(let n=1;n<=gross;n++)net+=serviceNet({config,coins:n})-serviceNet({config,coins:n-1});assert.equal(net,serviceNet(service));
}
assert.equal(serviceWages({config:{...config,wageVersion:0},coins:100}),0);
assert(sanitizeDinerSave(state),'new setup must reload');
act({type:'service',action:{type:'prepare'}});assert(dispatchDiner(state,{type:'setRoundHelpers',roles:[]},{now}).error,'staffing must lock at food preparation');
assert.equal(readableStopName('Chefâ€™s Challenge'),'Chef’s Challenge');
console.log('PASS owned loadout proposal, helper unlocks, preparation lock, cumulative wages and reload');
const party=createService({...buildServiceLoadout(2,['classic_burger']),tier:2,menu:['classic_burger'],customers:8,customerTypes:['party','party','party','walk_in'],demandVersion:1,arrivalTicks:20,maxWaitingCustomers:4,queuePatienceTicks:12000,tablePatienceTicks:12000});
const partyOpen=dispatchService(party,{type:'open'});stepService(partyOpen,20);assert.equal(partyOpen.customers[0].type,'party');
console.log('PASS early festival party arrival');

// Accounting fixtures feed cumulative simulation totals through the real command handler.
for(const failure of [false,true]){
 let ledger=structuredClone(original);ledger.career.services=1;
 const apply=(command:DinerCommand)=>{const result=dispatchDiner(ledger,command,{now});assert.equal(result.error,undefined);ledger=result.state;};
 apply({type:'setRoundHelpers',roles:['washer']});ledger.run!.haul=200;
 for(const coins of [7,7,19,51,51]){ledger.run!.service!.coins=coins;ledger.run!.service!.stats!.food=coins;apply({type:'service',action:{type:'tick',ticks:0}});assert.equal(ledger.run!.haul,200+coins-Math.floor(coins*.2));const saved=sanitizeDinerSave(ledger);assert(saved);ledger=saved;}
 const before=ledger.coins;
 if(failure){ledger.run!.service!.phase='failed';ledger.run!.service!.strikes=3;apply({type:'service',action:{type:'tick',ticks:0}});assert.equal(ledger.coins-before,Math.floor(241/2));assert.equal(ledger.lastRun!.serviceReceipt!.wages,10);}
 else{const bonus=ledger.run!.service!.config.completionBonus!;ledger.run!.service!.phase='complete';apply({type:'finishService'});assert.equal(ledger.run!.haul,241+bonus);apply({type:'goHome'});assert.equal(ledger.coins-before,241+bonus);}
 assert(dispatchDiner(ledger,{type:'goHome'},{now}).error);
}
console.log('PASS cumulative wage ledger across repeated updates, reload, failure, bonus and banking');
{
 let ledger=structuredClone(original);ledger.career.services=1;
 ledger=dispatchDiner(ledger,{type:'setRoundHelpers',roles:['washer']},{now}).state;
 ledger=dispatchDiner(ledger,requiredLoadout(ledger).command!,{now}).state;
 const opened=dispatchDiner(ledger,{type:'service',action:{type:'open'}},{now});assert.equal(opened.error,undefined);ledger=opened.state;
 ledger.run!.haul=200;ledger.run!.service!.coins=51;ledger.run!.service!.stats!.food=51;
 const before=ledger.coins,ended=dispatchDiner(ledger,{type:'abandonService'},{now});
 assert.equal(ended.error,undefined);assert.equal(ended.state.coins-before,120);assert.equal(ended.state.lastRun!.serviceReceipt!.wages,10);
 assert(dispatchDiner(ended.state,{type:'abandonService'},{now}).error);
 assert(sanitizeDinerSave(ended.state));
}
console.log('PASS early exit settles wages once and preserves existing half-haul banking');

{
 const room=createDiner(now,'surface-pick');room.decorOwned.chrome_clock=1;
 const draft=createPlacementDraft(room,'home','chrome_clock','new-clock'),surfaces=homeMountSurfaces(room,draft);
 const blocked=surfaces.find(s=>s.mount.targetId==='outer-back'&&s.error?.includes('menu board'))!;assert(blocked);
 const ray=new Ray(new Vector3(blocked.x,blocked.surfaceHeight+.095,4),new Vector3(0,0,-1));
 const hit=pickMountSurface(ray,surfaces)!;assert.equal(hit.mount.targetId,'outer-back');assert(hit.error?.includes('menu board'));
 assert(previewPlacement(room,{...draft,mount:hit.mount,x:Math.floor(hit.x),y:Math.floor(hit.y),rotation:hit.rotation}).error);
 assert.equal(previewPlacement(room,draft).error,null,'initial preview avoids built-in menu and windows');
}
console.log('PASS wall-surface picking retains invalid target instead of jumping to another wall');
{
 const loadout=buildServiceLoadout(1,['classic_burger']);loadout.tables=[makeTable('bad',3,5,1),makeTable('usable',5,5,1)];
 const s=dispatchService(createService({...loadout,menu:['classic_burger'],customers:1,demandVersion:1}),{type:'open'});
 // Reproduce a legacy inaccessible first candidate, without changing the free second seat.
 s.tables[0].seats[0].x=-40;stepService(s,250);assert.equal(s.customers[0].tableId,'usable');
}
console.log('PASS inaccessible first seat does not prevent another table seating the arrival');

function finishLunch(k:Kitchen){
 k.send({type:'prepare'});k.burger();k.send({type:'open'});
 let guard=0,idleTicks=0;
 while(['playing','closing'].includes(k.s.phase)&&guard++<1500){
  if(k.s.served+k.s.missed===k.s.config.customers){k.until(()=>!['playing','closing'].includes(k.s.phase));break;}
  const guests=()=>k.s.customers.filter(c=>c.phase==='seated').sort((a,b)=>a.patience-b.patience);
  const dirty=k.s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({table,seat})));
  const target=guests()[0];
  const blocked=target&&dirty.find(d=>d.seat.id===target.seatId);
  if(blocked||(!k.held()&&(!target||!k.s.cleanPlates)&&dirty.length)){
   const chosen=blocked??dirty[0],saved=!!k.held();if(saved)k.touch('prep');
   k.touch(chosen.table.id,undefined,undefined,chosen.seat.id);if(k.held()?.kind==='dirty')k.wash();if(saved)k.touch('prep');continue;
  }
  if(target){if(!k.held())k.burger();const ready=guests().find(c=>!k.s.tables.find(t=>t.id===c.tableId)?.seats.find(s=>s.id===c.seatId)?.item);if(ready)k.touch(ready.tableId!,undefined,undefined,ready.seatId!);continue;}
  if(k.held()?.kind==='dish'&&!dirty.length)idleTicks+=20;
  k.tick(20);
 }
 assert.equal(k.s.phase,'complete',k.s.notice);
 return idleTicks;
}
if(process.argv.includes('--balance')){
 for(const profile of ['third','finale'] as const){let completed=0,served=0,seconds=0,peakSeats=0,peakOrders=0,idleTicks=0,multiSeeds=0,repeatSeeds=0;
  for(let seed=0;seed<100;seed++){
   const layout=buildServiceLoadout(1,['classic_burger'],profile==='finale'?{grill:2,prep:2,sink:2,plates:2}:{});
   layout.tables=profile==='third'?[makeTable('table_1',3,5,1)]:[makeTable('a',3,5,2),makeTable('b',5,5,2)];
   const k=new Kitchen(createService({...layout,seed:`${profile}-${seed}`,menu:['classic_burger'],customers:profile==='third'?8:22,pacingVersion:2,pacingProfile:profile,demandVersion:1,queuePatienceTicks:profile==='third'?1800:1700,tablePatienceTicks:profile==='third'?1400:1200,maxWaitingCustomers:profile==='third'?2:3}),20);
   let high=false,rushes=0,multi=false;const tick=k.tick.bind(k);k.tick=(n=1)=>{for(let i=0;i<n;i++){tick();const seats=k.s.customers.filter(c=>['seated','eating'].includes(c.phase)).length,orders=k.s.customers.filter(c=>c.phase==='seated').length;if(seats>=3&&!high)rushes++;high=seats>=3;multi ||=orders>=2;peakSeats=Math.max(peakSeats,seats);peakOrders=Math.max(peakOrders,orders);}};
   try{if(profile==='finale')idleTicks+=finishLunch(k);else k.lunch(true);completed++;}catch(error){if(seed-completed<3)console.log({profile,seed,phase:k.s.phase,held:k.held(),notice:k.s.notice,error:String(error),missed:k.s.missed,served:k.s.served,paid:k.s.paid,tick:k.s.tick});}served+=k.s.served;seconds+=k.s.tick/20;multiSeeds+=Number(multi);repeatSeeds+=Number(rushes>=2);
  }
  console.log(JSON.stringify({profile,seeds:100,completed,served,meanSeconds:Math.round(seconds/100),peakSeats,peakOrders,multipleOrderSeeds:multiSeeds,repeatedThreeSeatRushSeeds:repeatSeeds,idlePercent:idleTicks/20/seconds*100}));
  if(profile==='third')assert(completed>=95,'third-service completion gate');else{assert(completed>=85&&completed<=95,'solo finale completion gate');assert(peakSeats>=3&&peakOrders>=2);assert(multiSeeds>=95&&repeatSeeds>=80);assert(idleTicks/20/seconds<.15);}
 }
}
