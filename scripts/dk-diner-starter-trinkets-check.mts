/** Welcome furnishings, conservative save migration and authoritative resale. */
import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,migrateDinerRestaurant,sanitizeDinerSave,validateDinerHome,getRenovationPreview,homeIncidents,dailyIngredientParcel,type DinerState,type DinerCommand} from '../src/lib/chef/diner/progression';
import {STARTER_TRINKETS,DECOR_BY_ID,decorResaleValue} from '../src/lib/chef/diner/collections';
import {createRestaurantBlueprint,validateRoomPlan} from '../src/lib/chef/diner/room-plan';
import {createRenovationState} from '../src/lib/chef/diner/renovation';
import {createDinerRecord,replayDiner} from '../src/lib/chef/diner/authority';
const now=Date.UTC(2026,8,21,12);let groups=0;
function check(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
function reject(state:DinerState,command:any,code:string){const result=dispatchDiner(state,command,{now});assert.equal(result.code,code);assert.deepEqual(result.state,state);}
function oldStarter(customized=false){const s=createDiner(now,'old-starter');delete s.starterTrinkets;s.decorOwned={};const blueprint=createRestaurantBlueprint('burger_shop');s.home.layout=blueprint.layout;const console=s.home.roomPlan!.modules.find(m=>m.kind==='console')!;console.x=9;console.y=5;console.rotation=1;s.home.roomPlan!.edges=s.home.roomPlan!.edges.filter(e=>!['stall-side-0-0','stall-side-0-1'].includes(e.id));if(customized){s.decorOwned.daisy_pot=1;s.home.layout.push({id:'my-flower',equipmentId:'daisy_pot',x:5,y:6,rotation:0});}return s;}
function storedWelcome(){let s=createDiner(now);return act(s,{type:'homeLayout',layout:s.home.layout.filter(p=>!STARTER_TRINKETS.includes(p.equipmentId as typeof STARTER_TRINKETS[number]))});}
check('new shop includes six distinct welcome pieces on valid supports with a walkable entrance mat',()=>{
 const s=createDiner(now);assert.equal(validateDinerHome(s,s.home.layout),null);assert.equal(validateRoomPlan(s.home.roomPlan!,s.home.layout),null);assert(sanitizeDinerSave(s));
 for(const id of STARTER_TRINKETS){assert.equal(s.decorOwned[id],1);assert.equal(s.home.layout.filter(p=>p.equipmentId===id).length,1);}
 assert.equal(s.home.layout.find(p=>p.equipmentId==='welcome_mat')!.y,7);assert(DECOR_BY_ID.welcome_mat.passable);
 assert.equal(s.home.layout.filter(p=>p.mount?.kind==='counter').length,3);assert.equal(s.home.layout.filter(p=>p.mount?.kind==='wall').length,1);
});
check('an untouched earlier starter moves seating opposite the bathroom and receives gifts once in storage',()=>{
 const before=oldStarter(),oldLayout=structuredClone(before.home.layout),next=migrateDinerRestaurant(before),console=next.home.roomPlan!.modules.find(m=>m.kind==='console')!;
 assert.deepEqual({x:console.x,y:console.y,rotation:console.rotation},{x:0,y:5,rotation:3});assert(next.home.roomPlan!.edges.some(e=>e.id==='stall-side-0-0'));
 assert.deepEqual(next.home.layout,oldLayout);assert.deepEqual(next.decorOwned,Object.fromEntries(STARTER_TRINKETS.map(id=>[id,1])));assert.deepEqual(migrateDinerRestaurant(next),next);assert.equal(next.coins,before.coins);assert(sanitizeDinerSave(next));
});
check('customized staged rooms keep the exact layout and modules while the welcome kit enters storage',()=>{
 const before=oldStarter(true),next=migrateDinerRestaurant(before);assert.deepEqual(next.home.layout,before.home.layout);assert.deepEqual(next.home.roomPlan,before.home.roomPlan);assert.equal(next.decorOwned.daisy_pot,2);assert(sanitizeDinerSave(next));
});
check('legacy conversion grants a placed kit once; restoring the old room cannot grant another',()=>{
 let s=oldStarter();delete s.home.roomPlan;delete s.home.fixtureInventory;s.home.w=s.home.h=8;s.home.staff={chefs:1,waiters:1};s.renovation=createRenovationState();
 s.home.layout=[{id:'old-grill',equipmentId:'grill',x:1,y:0,rotation:0},{id:'old-prep',equipmentId:'prep',x:3,y:0,rotation:0},{id:'old-sink',equipmentId:'sink',x:5,y:0,rotation:0}];
 s=migrateDinerRestaurant(s);assert.equal(s.starterTrinkets,undefined);const preview=getRenovationPreview(s)!;assert.equal(Object.keys(preview.includedDecor).length,6);
 s=act(s,{type:'renovateHome',stage:'burger_shop',previewToken:preview.token});assert.equal(s.home.layout.filter(p=>STARTER_TRINKETS.includes(p.equipmentId as typeof STARTER_TRINKETS[number])).length,6);const owned=structuredClone(s.decorOwned);
 s=act(s,{type:'restoreRenovation',backupId:s.renovation.backups[0].id});assert.deepEqual(getRenovationPreview(s)!.includedDecor,{});s=act(s,{type:'renovateHome',stage:'burger_shop',previewToken:getRenovationPreview(s)!.token});assert.deepEqual(s.decorOwned,owned);assert(sanitizeDinerSave(s));
});
check('only stored non-keepsakes sell for the configured value, with no client price or repeated payout',()=>{
 const fresh=createDiner(now);reject(fresh,{type:'sellDecor',decorId:'burger_mascot'},'decor_not_stored');let s=storedWelcome();const coins=s.coins;
 reject(s,{type:'sellDecor',decorId:'burger_mascot',price:999999},'invalid_command');reject(s,{type:'sellDecor',decorId:'pete_postcard'},'decor_unsellable');reject(s,{type:'sellDecor',decorId:'constructor'},'decor_unsellable');
 s=act(s,{type:'sellDecor',decorId:'burger_mascot'});assert.equal(s.coins,coins+decorResaleValue('burger_mascot')!);assert.equal(s.decorOwned.burger_mascot,0);reject(s,{type:'sellDecor',decorId:'burger_mascot'},'decor_not_stored');assert.equal(sanitizeDinerSave(s)!.decorOwned.burger_mascot,0);assert.equal(migrateDinerRestaurant(s).decorOwned.burger_mascot,0);
});
check('selling a copy removes excess saved references and snapshots without removing other possessions',()=>{
 let s=createDiner(now);s=act(s,{type:'saveLayout',name:'Welcome shop'});
 s.renovation.backups.push({id:'welcome-room',at:now,stage:'burger_shop',w:s.home.w,h:s.home.h,expansion:0,layout:structuredClone(s.home.layout),roomPlan:structuredClone(s.home.roomPlan),staff:{...s.home.staff}});
 s=act(s,{type:'homeLayout',layout:s.home.layout.filter(p=>p.equipmentId!=='retro_radio')});s=act(s,{type:'sellDecor',decorId:'retro_radio'});
 for(const layout of [s.savedLayouts[0].layout,s.renovation.backups[0].layout]){assert(!layout.some(p=>p.equipmentId==='retro_radio'));assert(layout.some(p=>p.equipmentId==='burger_mascot'));}
 assert(sanitizeDinerSave(s));s=act(s,{type:'loadLayout',layoutId:s.savedLayouts[0].id});assert(!s.home.layout.some(p=>p.equipmentId==='retro_radio'));s=act(s,{type:'restoreRenovation',backupId:'welcome-room'});assert(!s.home.layout.some(p=>p.equipmentId==='retro_radio'));assert.equal(s.decorOwned.retro_radio,0);
});
check('passable decor still requires a legal unique tile and valid owned count',()=>{
 const s=createDiner(now),mat=s.home.layout.find(p=>p.equipmentId==='welcome_mat')!;
 for(const xy of [{x:-1,y:7},{x:5,y:8}])assert(validateDinerHome(s,s.home.layout.map(p=>p.id===mat.id?{...p,...xy}:p)));
 s.decorOwned.welcome_mat=2;assert(validateDinerHome(s,[...s.home.layout,{...mat,id:'duplicate-mat'}]));
});
check('the entrance mat leaves physical chores and parcel locations reachable',()=>{
 const s=createDiner(now),jobs=homeIncidents(s);assert.equal(jobs.length,2);const parcel=dailyIngredientParcel(s);assert.notDeepEqual({x:parcel.x,y:parcel.y},{x:5,y:7});
 const withoutMat={...s,home:{...s.home,layout:s.home.layout.filter(p=>p.equipmentId!=='welcome_mat')}};assert.deepEqual(jobs,homeIncidents(withoutMat));assert.deepEqual(parcel,dailyIngredientParcel(withoutMat));
 for(const job of jobs)assert.equal(dispatchDiner(s,{type:'beginHomeTask',incidentId:job.id},{now:Math.max(now,job.availableAt)}).error,undefined);
});
check('server replay cannot sell the same spare twice or partially commit a duplicate sale tape',()=>{
 const record=createDinerRecord(now,'resale');record.state=storedWelcome();const before=structuredClone(record),command={type:'sellDecor' as const,decorId:'burger_mascot'};
 assert.throws(()=>replayDiner(record,[command,command],now));assert.deepEqual(record,before);
 const once=replayDiner(record,[command],now).record;assert.throws(()=>replayDiner(once,[command],now));assert.equal(once.state.coins,before.state.coins+90);
});
check('malformed welcome receipts are rejected instead of granting a fresh collection',()=>{
 const s=createDiner(now);(s as any).starterTrinkets={version:1,granted:false};assert.equal(sanitizeDinerSave(s),null);reject(s,{type:'settle'},'invalid_starter_receipt');
});
check('a full legacy collection keeps its additional gift and resale cannot overflow the saved balance',()=>{
 const old=oldStarter(true);old.decorOwned.daisy_pot=1000;const migrated=migrateDinerRestaurant(old);assert.equal(migrated.decorOwned.daisy_pot,1001);assert(sanitizeDinerSave(migrated));reject(migrated,{type:'buyDecor',decorId:'daisy_pot'},'decor_storage_full');
 const full=storedWelcome();full.coins=Number.MAX_SAFE_INTEGER;reject(full,{type:'sellDecor',decorId:'burger_mascot'},'coin_limit');
});
console.log(`${groups} welcome collection checks passed.`);
