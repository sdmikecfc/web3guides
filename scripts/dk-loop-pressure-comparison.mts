/** Actual cooking/movement/washing; no food, income or customer state injection. */
import assert from 'node:assert/strict';
import {Kitchen} from './dk-diner-reference-kitchen';
import {Cook} from './dk-diner-cook-fixture';
import {createService} from '../src/lib/chef/diner/service';
import {buildServiceLoadout,makeTable,makeStation,validateServiceLayout} from '../src/lib/chef/diner/geometry';
import {serviceNet} from '../src/lib/chef/diner/round-staff';

const seeds=Number(process.env.DK_BALANCE_SEEDS??100);
for(const menu of [['classic_burger'],['classic_burger','fries']])for(const prepared of [true,false])for(const help of [0,1,2]){
 let complete=0,served=0,elapsed=0,idle=0,net=0,simultaneous=0,repeatRush=0;
 const failures:Record<string,number>={};
 for(let seed=0;seed<seeds;seed++){
  const load=buildServiceLoadout(2,menu,{grill:2,prep:2,sink:2,plates:2,fryer:2});
  load.tables=[makeTable('a',3,6,2),makeTable('b',5,6,2)];
  outer: for(let y=0;y<4;y++)for(let x=0;x<7;x++){const pass=makeStation('pass','pass',x,y,2);if(!validateServiceLayout(2,[...load.stations,pass],load.tables)){load.stations.push(pass);break outer;}}
  assert(load.stations.some(s=>s.kind==='pass'));assert.equal(validateServiceLayout(2,load.stations,load.tables),null);
  const k=new Kitchen(createService({...load,tier:2,seed:`finale-${seed}`,menu,customers:22,pacingVersion:2,pacingProfile:'finale',demandVersion:1,wageVersion:1,queuePatienceTicks:1700,tablePatienceTicks:1200,maxWaitingCustomers:3,helpers:help?[{id:'wash',role:'washer'},...(help===2?[{id:'prep-help',role:'prep' as const}]:[])]:[]}),20);
  const cook=new Cook(()=>k.s,action=>action.type==='tick'?k.tick(action.ticks):k.send(action));
  let peaks=0,peak=false,multi=false,idleTicks=0;
  const tick=k.tick.bind(k);k.tick=(n=1)=>{for(let i=0;i<n;i++){tick();const active=k.s.customers.filter(c=>['seated','eating'].includes(c.phase));const high=active.length>=3;if(high&&!peak)peaks++;peak=high;multi ||=active.filter(c=>c.phase==='seated').length>=2;}};
  try{
   k.send({type:'prepare'});if(prepared){if(menu.includes('fries')){cook.dish('fries');k.touch('pass');}k.burger();}k.send({type:'open'});
   let guard=0;
   while(['playing','closing'].includes(k.s.phase)&&guard++<4000){
    if(k.s.served+k.s.missed===k.s.config.customers){k.until(()=>!['playing','closing'].includes(k.s.phase));break;}
    const guests=()=>k.s.customers.filter(c=>c.phase==='seated').sort((a,b)=>a.patience-b.patience);
    const dirty=k.s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({table,seat})));
    const guest=guests()[0],blocked=guest&&dirty.find(d=>d.seat.id===guest.seatId);
    if(blocked||(!k.held()&&(!guest||!k.s.cleanPlates)&&dirty.length&&!help)){
     const chosen=blocked??dirty[0],saved=k.held();if(saved)k.touch('pass');
     k.touch(chosen.table.id,undefined,undefined,chosen.seat.id);if(k.held()?.kind==='dirty')k.wash();if(saved)k.touch('pass');continue;
    }
    if(guest){
     if(!k.held()&&guest.recipeId==='classic_burger'&&!k.s.cleanPlates){k.tick(20);continue;}
     if(k.held()&&k.held()!.recipeId!==guest.recipeId){const matching=guests().find(c=>c.recipeId===k.held()!.recipeId);if(matching){k.touch(matching.tableId!,undefined,undefined,matching.seatId!);continue;}k.touch('pass');}
     if(!k.held()){
      const stored=k.s.stations.find(s=>s.kind==='pass')?.slots.find(slot=>slot.item?.kind==='dish'&&slot.item.recipeId===guest.recipeId);
      if(stored)k.send({type:'interact',targetId:'pass',itemId:stored.item!.id});else if(guest.recipeId==='classic_burger')k.burger();else cook.dish(guest.recipeId);
      k.until(()=>!k.s.chef.path.length);
     }
     const ready=guests().find(c=>c.recipeId===k.held()?.recipeId&&!k.s.tables.find(t=>t.id===c.tableId)?.seats.find(s=>s.id===c.seatId)?.item);
     if(ready)k.touch(ready.tableId!,undefined,undefined,ready.seatId!);else k.tick(20);continue;
    }
    if(!k.held()&&prepared&&k.s.cleanPlates&&!k.s.stations.find(s=>s.kind==='pass')?.slots.some(slot=>slot.item)){k.burger();continue;}
    // Ready food, no waiting order and nothing the cook can clear: admission idle.
    if(!dirty.length&&!k.s.chef.path.length)idleTicks+=20;
    k.tick(20);
   }
   assert.equal(k.s.phase,'complete',k.s.notice);complete++;
  }catch(error){if(seeds===1)console.log(error,{held:k.held(),notice:k.s.notice});const reason=String(error).split('\n')[0];failures[reason]=(failures[reason]??0)+1;}
  served+=k.s.served;elapsed+=k.s.tick;idle+=idleTicks;net+=serviceNet(k.s);simultaneous+=multi?1:0;repeatRush+=peaks>=2?1:0;
 }
 console.log(JSON.stringify({menu,prepared,helpers:help,seeds,complete,served,meanSeconds:Math.round(elapsed/seeds/20),idlePercent:Math.round(idle/elapsed*1000)/10,netPerMinute:Math.round(net/elapsed*1200*10)/10,multipleOrdersSeeds:simultaneous,repeatedThreeSeatRushSeeds:repeatRush,failures}));
}
