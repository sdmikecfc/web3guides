import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,sanitizeDinerSave,staffSlots,type DinerCommand,type DinerState,type DinerRun} from '../src/lib/chef/diner/progression';
import {recordCareerService} from '../src/lib/chef/diner/career';
import {serviceLevelProgress,unlockedTruckHelpers} from '../src/lib/chef/diner/service-level';
import {dispatchService} from '../src/lib/chef/diner/service';
import {TRUCK_TIERS} from '../src/lib/chef/diner/content';
import {Cook} from './dk-diner-cook-fixture';

const now=Date.UTC(2026,8,22,10);let groups=0;
function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
function act(s:DinerState,c:DinerCommand){const r=dispatchDiner(s,c,{now});assert.equal(r.error,undefined,`${c.type}: ${r.error}`);return r.state;}
function reject(s:DinerState,c:DinerCommand,code:string){const before=structuredClone(s),r=dispatchDiner(s,c,{now});assert.equal(r.code,code);assert.deepEqual(r.state,before);assert.deepEqual(s,before);}
function fresh(){const s=createDiner(now,'service-helper');return act(s,{type:'setupLayout',stations:[...s.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:s.truckConfig.tables});}

// Cook one ordinary opening day through real inputs. Historical receipt tests
// reuse its completed snapshot under distinct run IDs; they never award meals.
let earned=act(fresh(),{type:'startRun'});earned=act(earned,{type:'chooseNode',nodeId:earned.run!.available[0]});let cooked=earned.run!.service!;
new Cook(()=>cooked,a=>{cooked=dispatchService(cooked,a);}).run();assert.equal(cooked.served,4);earned.run!.service=cooked;const completed=structuredClone(earned.run!);
function history(count:number){const s=fresh();for(let i=0;i<count;i++)assert(recordCareerService(s.career,{...structuredClone(completed),id:`completed-service-${i}`}));return s;}

test('only five distinct completed ordinary service receipts unlock the small-truck helper',()=>{
  const s=fresh();assert.equal(TRUCK_TIERS[1].helpers,1);assert.equal(unlockedTruckHelpers(s),0);assert.deepEqual(serviceLevelProgress(s),{level:1,cleared:0,target:5,remaining:5,unlocked:false});
  s.coins=1_000_000;s.restaurantLevel=20;assert.equal(unlockedTruckHelpers(s),0,'wealth and restaurant XP cannot manufacture cooking receipts');
  const invalid: DinerRun[]=[{...structuredClone(completed),practice:true},{...structuredClone(completed),service:{...structuredClone(cooked),config:{...cooked.config,practice:true}}},{...structuredClone(completed),service:{...structuredClone(cooked),phase:'playing'}}];
  for(const run of invalid){assert.equal(recordCareerService(s.career,run),false);assert.equal(s.career.services,0);}
  for(let i=0;i<5;i++){const run={...structuredClone(completed),id:`earned-day-${i}`};assert(recordCareerService(s.career,run));const count=s.career.services;assert.equal(recordCareerService(s.career,run),false);assert.equal(s.career.services,count);assert.equal(unlockedTruckHelpers(s),i===4?1:0);}
  assert.deepEqual(serviceLevelProgress(s),{level:2,cleared:5,target:5,remaining:0,unlocked:true});
});
test('promotion permits one 500-coin hire; assigning an owned worker is free and never creates a duplicate',()=>{
  const before=history(4);before.coins=1000;assert.equal(staffSlots(before),3);reject(before,{type:'hire',role:'waiter'},'staff_full');reject(before,{type:'assignHelper',staffId:'waiter-1',role:'washer'},'helper_unavailable');
  let s=history(5);s.coins=1000;assert.equal(staffSlots(s),4);const roster=structuredClone(s.staffMembers),equipment=structuredClone(s.equipment);s=act(s,{type:'assignHelper',staffId:'waiter-1',role:'washer'});s=act(s,{type:'assignHelper',staffId:'waiter-1',role:'washer'});assert.equal(s.coins,1000);assert.deepEqual(s.staffMembers,roster);assert.deepEqual(s.equipment,equipment);
  s=act(s,{type:'hire',role:'waiter'});assert.equal(s.coins,500);assert.equal(s.staffMembers.length,roster.length+1);assert.equal(new Set(s.staffMembers.map(m=>m.id)).size,s.staffMembers.length);reject(s,{type:'hire',role:'waiter'},'staff_full');
  const reloaded=sanitizeDinerSave(s);assert(reloaded);assert.equal(serviceLevelProgress(reloaded).level,2);assert.equal(reloaded.coins,500);assert.deepEqual(reloaded.staffMembers,s.staffMembers);assert.deepEqual(reloaded.equipment,equipment);assert.equal(reloaded.truckConfig.helperId,'waiter-1');
});
test('setup and between-stop assignment refresh both the helper snapshot and runtime without resetting the service',()=>{
  let s=act(history(5),{type:'startRun'});s=act(s,{type:'assignHelper',staffId:'waiter-1',role:'washer'});s=act(s,{type:'chooseNode',nodeId:s.run!.available[0]});const old=s.run!.service!;assert.equal(old.phase,'setup');assert.deepEqual(old.helpers.map(h=>[h.id,h.role]),[['waiter-1','washer']]);const before=structuredClone(old);
  s=act(s,{type:'assignHelper',staffId:'chef-1',role:'runner'});assert.deepEqual(s.run!.service!.config.helpers.map(h=>[h.id,h.role]),[['chef-1','runner']]);assert.deepEqual(s.run!.service!.helpers.map(h=>[h.id,h.role]),[['chef-1','runner']]);
  for(const key of ['tick','stations','tables','chef','plateStock','nextArrival','rng','coins','customers'] as const)assert.deepEqual(s.run!.service![key],before[key],key);
  s=act(s,{type:'assignHelper',staffId:null});assert.deepEqual(s.run!.service!.helpers,[]);assert.deepEqual(s.run!.service!.config.helpers,[]);s=act(s,{type:'assignHelper',staffId:'waiter-1',role:'washer'});const saved=sanitizeDinerSave(s);assert(saved);assert.deepEqual(saved.run!.service!.helpers,s.run!.service!.helpers);
  reject(s,{type:'assignHelper',staffId:'not-hired',role:'washer'},'helper_unavailable');reject(s,{type:'assignHelper',slot:1,staffId:'chef-1'},'helper_unavailable');
  s=act(s,{type:'service',action:{type:'prepare'}});reject(s,{type:'assignHelper',staffId:null},'helper_unavailable');s=act(s,{type:'service',action:{type:'pause'}});reject(s,{type:'assignHelper',staffId:null},'helper_unavailable');s=act(s,{type:'service',action:{type:'resume'}});s=act(s,{type:'service',action:{type:'open'}});reject(s,{type:'assignHelper',staffId:null},'helper_unavailable');
});
test('practice and rally completion cannot increment career promotion or substitute personally owned helpers',()=>{
  let s=history(4),career=structuredClone(s.career);s=act(s,{type:'startPractice'});s.run!.service={...structuredClone(cooked),config:{...cooked.config,practice:true}};s=act(s,{type:'finishService'});assert.deepEqual(s.career,career);assert.equal(unlockedTruckHelpers(s),0);
  s=act(s,{type:'startRally'});reject(s,{type:'assignHelper',staffId:'waiter-1'},'helper_unavailable');assert.equal(s.rally.service!.helpers.length,0);
  // A terminal rally scoreboard fixture exercises its distinct finish command.
  s.rally.service!.phase='complete';s=act(s,{type:'finishRally'});assert.deepEqual(s.career,career);assert.equal(serviceLevelProgress(s).level,1);
  let promoted=act(history(5),{type:'assignHelper',staffId:'waiter-1',role:'washer'});promoted=act(promoted,{type:'startRally'});assert.deepEqual(promoted.rally.service!.helpers,[]);reject(promoted,{type:'assignHelper',staffId:'chef-1'},'helper_unavailable');
});
test('older larger trucks keep their owned helper slots even with no career receipts',()=>{
  for(const [tier,slots] of [[2,1],[3,1],[4,2]] as const){let s=fresh();s.truckTier=tier;assert.equal(s.career.services,0);assert.equal(unlockedTruckHelpers(s),slots);s=act(s,{type:'assignHelper',staffId:'waiter-1',role:'washer'});if(tier===4){s=act(s,{type:'assignHelper',slot:1,staffId:'chef-1',role:'runner'});reject(s,{type:'assignHelper',slot:1,staffId:'waiter-1'},'helper_unavailable');}const loaded=sanitizeDinerSave(s);assert(loaded);assert.equal(unlockedTruckHelpers(loaded),slots);assert.deepEqual(loaded.truckConfig,s.truckConfig);}
});
console.log(`Passed ${groups} service promotion and helper checks.`);
