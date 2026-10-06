/** Local replay checks. No database credentials or live writes are used. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyKitchenCommand, initializeKitchen, KitchenCommandError, syncDeliveryFromAuthority } from "../src/lib/chef/authority";
import { createTruckAuthority, replayTruck, TruckAuthorityError, validateTruckTape } from "../src/lib/chef/truck-authority";
import { dispatchTruck, TRUCK_LADDER, TRUCK_PRICES, type TruckAction } from "../src/app/chef/game/_engine/truck";

const now=Date.UTC(2026,8,20,12),context={coins:10_000,seed:"authority-replay",runId:"server-run"};
const start=()=>replayTruck(createTruckAuthority(now),[{type:"start",node:1}],now,context).authority;
const run=(name:string,fn:()=>void)=>{fn();console.log(`ok ${name}`);};
const rejects=(fn:()=>unknown,code:string)=>assert.throws(fn,error=>(error instanceof TruckAuthorityError||error instanceof KitchenCommandError)&&error.code===code);

run("server time bounds ordered ticks and same-instant spam earns no time",()=>{
  const initial=start();
  rejects(()=>replayTruck(initial,[{type:"tick",ticks:20}],now,context),"truck_time_credit");
  assert.equal(initial.progress.run!.tick,0);
  const next=replayTruck(initial,[{type:"tick",ticks:20}],now+1000,context).authority;
  assert.equal(next.progress.run!.tick,20);assert.equal(next.clock.creditMs,0);
  rejects(()=>replayTruck(next,[{type:"tick",ticks:1}],now+1000,context),"truck_time_credit");
  rejects(()=>replayTruck(next,[{type:"tick",ticks:1}],now+999,context),"invalid_time");
});
run("input tape order matches deterministic prediction and fractional credit survives",()=>{
  const initial=start();
  const actions:TruckAction[]=[{type:"moveTo",x:3,y:2},{type:"tick",ticks:7},{type:"moveTo",x:4,y:2},{type:"tick",ticks:13}];
  let predicted=initial.progress;
  for(const action of actions)predicted=dispatchTruck(predicted,action,{...context,now:now+1025}).truck;
  const result=replayTruck(initial,actions,now+1025,context);
  assert.deepEqual(result.authority.progress,predicted);assert.equal(result.authority.clock.creditMs,25);
  const tail=replayTruck(result.authority,[{type:"tick",ticks:1}],now+1050,context);
  assert.equal(tail.authority.progress.run!.tick,21);assert.equal(tail.authority.clock.creditMs,0);
});
run("a long disconnection pauses and commits no stale tape or offline truck coins",()=>{
  const initial=start(),result=replayTruck(initial,[{type:"tick",ticks:100}],now+60_000,context);
  assert.equal(result.interrupted,true);assert.equal(result.authority.progress.run!.phase,"paused");
  assert.equal(result.authority.progress.run!.tick,0);assert.equal(result.coinDelta,0);assert.equal(result.authority.clock.creditMs,0);
  const resumed=replayTruck(result.authority,[{type:"resume"}],now+120_000,context).authority;
  rejects(()=>replayTruck(resumed,[{type:"tick",ticks:1}],now+120_000,context),"truck_time_credit");
  assert.equal(replayTruck(resumed,[{type:"tick",ticks:1}],now+120_050,context).authority.progress.run!.tick,1);
});
run("pause and resume cannot bank time; a failing tape has no partial changes",()=>{
  const initial=start();
  const paused=replayTruck(initial,[{type:"pause"}],now+4000,context).authority;
  assert.equal(paused.clock.creditMs,0);
  const resumed=replayTruck(paused,[{type:"resume"}],now+5000,context).authority;
  rejects(()=>replayTruck(resumed,[{type:"tick",ticks:1}],now+5000,context),"truck_time_credit");
  const saved=structuredClone(initial);
  rejects(()=>replayTruck(initial,[{type:"tick",ticks:10},{type:"buyMachine",machineId:"counter"}],now+1000,context),"truck_action_refused");
  assert.deepEqual(initial,saved);
});
run("repeated input heartbeats cannot silently discard an unplayed time backlog",()=>{
  let current=start();
  for(let second=1;second<=6;second++)current=replayTruck(current,[{type:"moveTo",x:3,y:2}],now+second*1000,context).authority;
  assert.equal(current.progress.run!.phase,"paused");assert.equal(current.progress.run!.tick,0);
  assert.equal(current.clock.pausedForAbsence,true);assert.equal(current.clock.creditMs,0);
});
run("forged rewards, snapshots, overlong tapes, NaN, and unbounded ticks are rejected",()=>{
  for(const action of [{type:"tick",ticks:1,coinDelta:99999},{type:"start",node:1,loadout:{techLevels:{cook:3}}},{type:"moveTo",x:NaN,y:2}])rejects(()=>validateTruckTape([action]),"invalid_truck_action");
  rejects(()=>validateTruckTape([{type:"tick",ticks:101}]),"truck_tape_too_long");
  rejects(()=>validateTruckTape(Array.from({length:129},()=>({type:"pause"}))),"invalid_truck_tape");
});
run("new and legacy accounts never import client truck ownership or first-clear receipts",()=>{
  const fresh=initializeKitchen(null,now),forged=structuredClone(fresh.save);
  forged.truck.techLevels.cook=3;forged.truck.bestDay=8;forged.truck.firstClears=[1,2,3,4,5,6,7,8,9,10,11,12];
  forged.truck.machineInventory.fryer=99;forged.truck.unlockedMachineIds.push("fryer","drinks");
  const migrated=initializeKitchen(forged,now);
  assert.equal(migrated.save.truck.bestDay,0);assert.equal(migrated.save.truck.techLevels.cook,0);assert.equal(migrated.save.truck.machineInventory.fryer,undefined);
  assert.ok(!migrated.save.menu.unlocked.includes("fries"));assert.ok(!migrated.save.menu.unlocked.includes("lemonade"));
  delete fresh.authority.truck;fresh.save.truck=forged.truck;
  syncDeliveryFromAuthority(fresh);assert.equal(fresh.save.truck.bestDay,0);
  assert.ok(!fresh.save.menu.unlocked.includes("fries"),"canonical truck must be restored before derived recipe ownership");
});
run("normal upgrades spend home coins and survive all canonical snapshots",()=>{
  const fresh=initializeKitchen(null,now);fresh.save.coins=1000;
  const upgraded=applyKitchenCommand(fresh,{type:"truck",action:{type:"upgrade",tech:"cook"}},now,"alice").actor;
  assert.equal(upgraded.save.coins,1000-TRUCK_PRICES.tech[0]);assert.equal(upgraded.save.truck.techLevels.cook,1);
  const appearance=applyKitchenCommand(upgraded,{type:"appearance",appearance:{name:"Café",truck:{techLevels:{cook:3}}} as any},now,"alice").actor;
  assert.equal(appearance.save.truck.techLevels.cook,1);assert.equal(appearance.save.coins,upgraded.save.coins);
  assert.equal(upgraded.authority.truck!.progress.techLevels.cook,1);
});
run("only an actual delivered order grants coins and first-clear rewards are once-only",()=>{
  const fresh=initializeKitchen(null,now);
  let current=applyKitchenCommand(fresh,{type:"truck",action:{type:"start",node:1}},now,"alice").actor;
  // A narrowly controlled, trusted simulation fixture one delivery from clearing.
  const service=current.authority.truck!.progress.run!;
  const pass=service.stations.find(station=>station.machineId==="pass")!;
  service.player.x=pass.x;service.player.y=pass.y+1;service.player.path=[];service.player.pending=null;
  service.player.held={id:999,kind:"plate_pasta"};service.served=service.target-1;
  service.customers=[{id:998,dish:"pasta",patience:1000,maxPatience:1000}];
  const before=current.save.coins;
  current=applyKitchenCommand(current,{type:"truck",action:{type:"interact",stationId:pass.id}},now,"alice").actor;
  assert.equal(current.save.coins-before,TRUCK_PRICES.salePerOrder+TRUCK_LADDER[0].clearCoins);
  assert.equal(current.save.truck.bestDay,1);assert.equal(current.save.truck.run!.rewardClaimed,true);
  rejects(()=>applyKitchenCommand(current,{type:"truck",action:{type:"interact",stationId:pass.id}},now,"alice"),"truck_action_refused");
  assert.equal(current.save.coins-before,TRUCK_PRICES.salePerOrder+TRUCK_LADDER[0].clearCoins);
});
run("earned market machine receipts cross to home once and failed commands cannot mint",()=>{
  let current=initializeKitchen(null,now);
  const market=TRUCK_LADDER.find(node=>node.kind!=="service"&&node.unlock)!;
  // Server-issued route fixture; the action itself contains only its stop ID.
  current.authority.truck!.progress.nextNode=market.id;
  current=applyKitchenCommand(current,{type:"truck",action:{type:"marketVisit",node:market.id}},now,"alice").actor;
  const homeId=market.unlock==="fryer"?"fryer_basic":"drinks_basic";
  assert.equal(current.save.inventory[homeId],1);
  current.authority.truck!.progress.nextNode=market.id;
  current=applyKitchenCommand(current,{type:"truck",action:{type:"marketVisit",node:market.id}},now,"alice").actor;
  assert.equal(current.save.inventory[homeId],1);
  rejects(()=>applyKitchenCommand(current,{type:"truck",action:{type:"marketVisit",node:market.id}},now,"alice"),"truck_action_refused");
});
run("duplicate and stolen layout IDs cannot replace owned machine condition",()=>{
  let current=initializeKitchen(null,now);
  const stove=current.save.layout.find(piece=>piece.itemId==="stove_basic")!;
  const originalUid=stove.uid!;
  current.save.equipment.instances[String(originalUid)].condition=5;
  current.save.equipment.instances["500"]={uid:500,itemId:"stove_basic",condition:35};
  current.save.inventory.stove_basic=1;
  const layout=current.save.layout.map(piece=>({...piece,...(piece.itemId==="table_basic"?{uid:originalUid}:{})}));
  layout.push({itemId:"stove_basic",uid:originalUid,gx:3,gy:0,facing:"se"});
  current=applyKitchenCommand(current,{type:"layout",layout,equipment:{instances:{[originalUid]:{uid:originalUid,itemId:"stove_basic",condition:100}}}} as any,now,"alice").actor;
  const machines=current.save.layout.filter(piece=>piece.itemId==="stove_basic");
  assert.deepEqual(machines.map(piece=>piece.uid).sort((a,b)=>a!-b!),[originalUid,500].sort((a,b)=>a-b));
  assert.deepEqual(machines.map(piece=>current.save.equipment.instances[String(piece.uid)].condition).sort((a,b)=>a-b),[5,35]);
  const stored=applyKitchenCommand(current,{type:"layout",layout:current.save.layout.filter(piece=>piece.itemId!=="stove_basic")},now,"alice").actor;
  assert.equal(stored.save.equipment.instances[String(originalUid)].condition,5);
  assert.equal(stored.save.equipment.instances["500"].condition,35);
  const anonymous=machines.map(piece=>({...piece,uid:undefined}));
  const replaced=applyKitchenCommand(stored,{type:"layout",layout:[...stored.save.layout,...anonymous]},now,"alice").actor;
  assert.deepEqual(replaced.save.layout.filter(piece=>piece.itemId==="stove_basic").map(piece=>replaced.save.equipment.instances[String(piece.uid)].condition).sort((a,b)=>a-b),[5,35]);
});
run("event commands cannot bypass the server registry through the generic reducer",()=>{
  rejects(()=>applyKitchenCommand(initializeKitchen(null,now),{type:"truckEvent",eventId:"forged",action:{type:"enter"}},now,"alice"),"event_unavailable");
  const route=readFileSync("src/app/api/chef/command/route.ts","utf8");
  assert.match(route,/applyServerKitchenCommand\(current, body.command, now, wallet, target\)/);
  assert.match(route,/p_expected_revision: current.revision/);assert.match(route,/p_command: body.id, p_fingerprint: fingerprint/);
});
console.log("PASS truck authority replay checks (pure local; production CAS not exercised)");
