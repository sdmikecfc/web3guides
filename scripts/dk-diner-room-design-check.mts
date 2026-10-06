import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,sanitizeDinerSave,validateDinerHomePlacement,type DinerCommand} from '../src/lib/chef/diner/progression';
import {transformGroup} from '../src/app/chef/diner-preview/group-placement';
import {createPlacementDraft,previewPlacement} from '../src/app/chef/diner-preview/placement-preview';
import {alignRoomMounts,resolveRoomMount} from '../src/lib/chef/diner/room-plan';
import {roomStyleQuote,ROOM_STYLES} from '../src/lib/chef/diner/room-design';
import {createRestaurantBlueprint} from '../src/lib/chef/diner/room-plan';
import {fixtureInventoryFor,installedStools} from '../src/lib/chef/diner/renovation';
const now=1800000000000;
for(const stage of ['burger_shop','diner','restaurant'] as const){
 let s=createDiner(now,`design-${stage}`);const room=createRestaurantBlueprint(stage);
 Object.assign(s.home,{w:room.roomPlan.w,h:room.roomPlan.h,roomPlan:room.roomPlan,layout:room.layout,fixtureInventory:fixtureInventoryFor(room.roomPlan),stools:installedStools(room.roomPlan)});
 for(const p of room.layout){if(s.equipment[p.equipmentId])s.equipment[p.equipmentId].homeCopies=Math.max(3,s.equipment[p.equipmentId].homeCopies);else s.decorOwned[p.equipmentId]=3;}
 s.decorOwned.display_counter_red=1;s.decorOwned.daisy_pot=2;s.coins=100000;
 const p=previewPlacement(s,createPlacementDraft(s,'home','display_counter_red','display'));assert.equal(p.error,null,`${stage}: ${p.error}`);assert.equal(p.command.type,'homeLayout');if(p.command.type==='homeLayout')s.home.layout=p.command.layout;
 s.home.layout.push({id:'attached-pot',equipmentId:'daisy_pot',x:0,y:0,rotation:0,mount:{kind:'counter',targetId:'display',slot:1}});s.home.layout=alignRoomMounts(s.home.layout,s.home.roomPlan!);
 const original=structuredClone(s),selected=['display','attached-pot'];
 for(let i=0;i<4;i++){const transformed=transformGroup(s,selected,0,0,true);s.home.layout=transformed.layout;const child=s.home.layout.find(p=>p.id==='attached-pot')!,point=resolveRoomMount(s.home.roomPlan!,child.mount!,s.home.layout)!;assert.equal(child.x,Math.floor(point.x));assert.equal(child.y,Math.floor(point.y));}
 assert.deepEqual(s.home.layout,original.home.layout,'Four rotations restore the group and attachment');
 const invalid=transformGroup(s,selected,-100,0);assert(invalid.error);assert(dispatchDiner(s,{type:'homeLayout',layout:invalid.layout},{now}).error);assert.deepEqual(s.home.layout,original.home.layout);
 console.log(`PASS ${stage}: group footprint rotation, attached object alignment and atomic invalid-move rejection.`);
}
let s=createDiner(now,'saved-designs');s.coins=10000;
const act=(command:DinerCommand)=>{const r=dispatchDiner(s,command,{now});assert.equal(r.error,undefined,r.error);s=r.state;};
let quote=roomStyleQuote(s,'green_corner')!;const before=structuredClone(s);const wrong=dispatchDiner(s,{type:'applyRoomStyle',styleId:'green_corner',layout:s.home.layout,expectedCost:quote.cost+1},{now});assert(wrong.error);assert.deepEqual(wrong.state,before);
act({type:'applyRoomStyle',styleId:'green_corner',layout:s.home.layout,expectedCost:quote.cost});assert.equal(s.home.finishes!.counter,'sage');const funds=s.coins;
assert(dispatchDiner(s,{type:'applyRoomStyle',styleId:'green_corner',layout:s.home.layout,expectedCost:quote.cost},{now}).error);assert.equal(s.coins,funds);
act({type:'saveLayout',name:'My café'});const saved=s.savedLayouts[0];act({type:'renameLayout',layoutId:saved.id,name:'Sunday café'});act({type:'buyRoomFinish',slot:'counter',id:'cream'});assert.equal(s.home.finishes!.counter,'cream');act({type:'loadLayout',layoutId:saved.id});assert.equal(s.home.finishes!.counter,'sage');assert.equal(s.savedLayouts[0].name,'Sunday café');assert(sanitizeDinerSave(s));
act({type:'buyRoomFinish',slot:'counter',id:'cream'});act({type:'saveLayout',layoutId:saved.id,name:'Cream café'});assert.equal(s.savedLayouts.length,1);assert.equal(s.savedLayouts[0].finishes!.counter,'cream');
for(const style of ROOM_STYLES)assert(style.decor.length===3);
console.log('PASS exact ownership quotes, duplicate purchase denial, named save/replace, finish restoration and reload.');
