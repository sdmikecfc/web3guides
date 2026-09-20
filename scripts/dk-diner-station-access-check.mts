/** Real station contacts, compact packing and beginner pacing. No network. */
import assert from 'node:assert/strict';
import {buildServiceLoadout,isAtStationAccess,makeStation,makeTable,serviceGeometry,stationAccessCells,stationAccessPath,stationWorkingCell,validateServiceLayout} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,sanitizeService,serviceReadyError,stepService} from '../src/lib/chef/diner/service';
import {createDiner,dispatchDiner,sanitizeDinerSave} from '../src/lib/chef/diner/progression';
import type {ServiceAction,ServiceState} from '../src/lib/chef/diner/types';
let groups=0;function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
const now=Date.UTC(2026,8,21);
function installed(){let state=createDiner(now,'compact-access');const result=dispatchDiner(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables},{now});assert.equal(result.error,undefined,result.error);return result.state;}
function controls(initial:ServiceState){let s=initial;const send=(a:ServiceAction)=>{s=dispatchService(s,a);};const until=(f:()=>boolean,limit=6000)=>{let n=0;while(!f()&&n++<limit)stepService(s);assert(f(),s.notice);};const touch=(targetId:string,ingredientId?:string,seatId?:string)=>{send({type:'interact',targetId,ingredientId,seatId});until(()=>!s.chef.path.length);};return {get s(){return s;},send,until,touch,load(){s=dispatchService(sanitizeService(s)!,{type:'resume'});}};}
test('all facings can use a reachable side when the illustrated front is blocked',()=>{
 for(const facing of [0,1,2,3] as const){const loadout=buildServiceLoadout(4,['classic_burger']);const grill=loadout.stations.find(st=>st.kind==='grill')!;grill.x=3;grill.y=1;grill.facing=facing;const front=stationWorkingCell(grill);const blocker=makeStation('front-blocker','bin',front.x,front.y);const stations=loadout.stations.filter(st=>st.kind!=='bin'&&!(st.x===blocker.x&&st.y===blocker.y));stations.push(blocker);
  const cells=stationAccessCells(4,stations,loadout.tables,grill);assert(cells.length>0);assert(!cells.some(p=>p.x===front.x&&p.y===front.y));assert(stationAccessPath(4,stations,loadout.tables,serviceGeometry(4).door,grill));
  const d=controls(dispatchService(createService({tier:4,physicalSupplies:false,menu:['classic_burger'],stations,tables:loadout.tables,tutorialLearning:true}),{type:'open'}));assert.equal(d.s.phase,'playing',d.s.notice);d.touch('crate');d.touch(grill.id);assert(isAtStationAccess(4,d.s.stations,d.s.tables,d.s.chef,grill));assert(d.s.stations.find(st=>st.id===grill.id)!.slots[0].job);assert(sanitizeService(d.s));
 }
});
test('a clear corner works, but two blocking flanks never permit reaching through furniture',()=>{
 const grill=makeStation('grill','grill',2,1),base=[grill],tables=[makeTable('table',3,6,1)];assert(stationAccessCells(4,base,tables,grill).some(p=>p.x===1&&p.y===2));
 const blocked=[grill,makeStation('left','bin',1,1),makeStation('below','bin',2,2)];assert(!stationAccessCells(4,blocked,tables,grill).some(p=>p.x===1&&p.y===2));
 blocked.push(makeStation('top','bin',2,0),makeStation('right','bin',3,1));assert.equal(stationAccessPath(4,blocked,tables,serviceGeometry(4).door,grill),null);assert(validateServiceLayout(4,blocked,tables,{allowIncomplete:true}));
});
test('fresh four-by-three fits the burger kit inside with an outdoor bin, without moving old saves',()=>{
 const state=installed(),initial=structuredClone(state);assert.deepEqual(state.truckConfig.stations.find(st=>st.kind==='plates'),{id:'plates',kind:'plates',x:3,y:2,facing:2});assert.deepEqual(state.truckConfig.stations.find(st=>st.kind==='bin'),{id:'bin',kind:'bin',x:2,y:4,facing:0});
 const begun=dispatchDiner(state,{type:'startPractice'},{now}).state;assert.equal(serviceReadyError(begun.run!.service!),null);assert(begun.run!.service!.stations.filter(st=>st.kind!=='bin').every(st=>st.y<3));assert(sanitizeDinerSave(begun));assert.deepEqual(state,initial);
 const old=structuredClone(state);old.truckConfig.stations=buildServiceLoadout(1,['classic_burger']).stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing}));assert.deepEqual(sanitizeDinerSave(old)!.truckConfig.stations,old.truckConfig.stations,'existing arrangements must not be repacked');
});
test('outdoor supplies keep queue, ramp and hot appliances bounded by the actual floor',()=>{
 const state=installed(),s=dispatchDiner(state,{type:'startPractice'},{now}).state.run!.service!;assert.equal(validateServiceLayout(1,s.stations,s.tables),null);
 for(const point of [{x:-1,y:4},{x:1,y:3},{x:1,y:2},{x:6,y:4}]){const moved=s.stations.map(st=>st.kind==='bin'?{...st,...point}:st);assert(validateServiceLayout(1,moved,s.tables),JSON.stringify(point));}
 const hot=s.stations.map(st=>st.kind==='grill'?{...st,x:0,y:4}:st);assert(validateServiceLayout(1,hot,s.tables),'hot equipment remains inside');
});
test('a real compact burger and exact plate wash release guest two within one second, including reload',()=>{
 let state=installed();state=dispatchDiner(state,{type:'startRun'},{now}).state;state=dispatchDiner(state,{type:'chooseNode',nodeId:state.run!.available[0]},{now}).state;const d=controls(dispatchService(state.run!.service!,{type:'open'}));
 d.until(()=>d.s.customers[0]?.phase==='seated');d.touch('fridge','beef');d.touch('grill');d.until(()=>!!d.s.stations.find(st=>st.kind==='grill')!.slots[0].job?.ready);d.touch('grill');d.touch('prep');d.touch('crate','bun');d.touch('prep');d.send({type:'hold',active:true});d.until(()=>!!d.s.stations.find(st=>st.kind==='prep')!.slots[0].job?.ready);d.send({type:'hold',active:false});d.touch('plates');d.touch('prep');assert.equal(d.s.chef.held?.kind,'dish');
 const first=d.s.customers[0];d.touch(first.tableId!,undefined,first.seatId!);d.until(()=>d.s.tables[0].seats[0].item?.kind==='dirty');assert.equal(d.s.spawned,1);d.touch(first.tableId!,undefined,first.seatId!);d.touch('sink');stepService(d.s,100);assert.equal(d.s.spawned,1,'placing a dish is not washing it');d.send({type:'hold',active:true});stepService(d.s,10);d.load();assert.equal(d.s.spawned,1);assert.equal(d.s.chef.holding,false);d.send({type:'hold',active:true});d.until(()=>d.s.washed===1);const washedAt=d.s.tick;d.until(()=>d.s.spawned===2,20);assert(d.s.tick-washedAt<=20);assert.equal(d.s.strikes,0);assert.equal(d.s.cleanPlates,2);assert(sanitizeService(d.s));
});
console.log(`PASS ${groups} station access groups`);
