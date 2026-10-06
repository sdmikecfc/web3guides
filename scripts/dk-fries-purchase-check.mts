import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,shopOffers,sanitizeDinerSave,type DinerState,type DinerCommand} from '../src/lib/chef/diner/progression';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {serviceSupplyChoices,serviceReadyError,dispatchService} from '../src/lib/chef/diner/service';
import {Cook} from './dk-diner-cook-fixture';

const now=1800000000000;
function act(s:DinerState,c:DinerCommand){const r=dispatchDiner(s,c,{now});assert(!r.error,`${c.type}: ${r.error}`);return r.state;}
function firstMarket(){let s=createDiner(now,'fries-purchase');s=act(s,{type:'setupLayout',stations:[...s.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:s.truckConfig.tables});s=act(s,{type:'startRun'});const run=s.run!,market=run.map.find(n=>n.kind==='shop')!;run.position=market.id;run.serviceDays=3;run.available=[];run.haul=500;run.offers=shopOffers(s);assert(sanitizeDinerSave(JSON.parse(JSON.stringify(s))));return s;}
for(const order of [['fries','fryer'],['fryer','fries']]){
 let s=firstMarket();const before=structuredClone(s.truckConfig.stations),homeMenu=structuredClone(s.home.menu);
 for(const target of order){s=act(s,{type:'buyOffer',offerId:s.run!.offers.find(o=>o.target===target&&['recipe','equipment'].includes(o.kind))!.id});}
 assert.deepEqual(s.run!.menu,['classic_burger'],'Purchases must not change the menu silently');assert(s.equipment.boxes.truckOwned);assert.deepEqual(s.truckConfig.stations,before);
 s=act(s,{type:'setTruckMenu',recipeIds:['classic_burger','fries']});
 assert.deepEqual(s.home.menu,homeMenu);assert.equal(s.run!.haul,200);assert.deepEqual(sanitizeDinerSave(JSON.parse(JSON.stringify(s)))!.run!.menu,['classic_burger','fries']);
 s=act(s,{type:'leaveNode'});const next=s.run!.available.find(id=>['slow','medium','busy','special','finale'].includes(s.run!.map.find(n=>n.id===id)!.kind));assert(next);s=act(s,{type:'chooseNode',nodeId:next});
 assert(s.run!.service);assert(serviceReadyError(s.run!.service!), 'New equipment should still need deliberate placement');
 const layout=buildServiceLoadout(1,['classic_burger','fries']);
 s=act(s,{type:'setupLayout',stations:layout.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing})),tables:s.truckConfig.tables});assert.equal(serviceReadyError(s.run!.service!),null);
 // Both cookbook/setup edits and the menu saved at the market use real service configuration.
 s=act(s,{type:'setTruckMenu',recipeIds:['classic_burger']});assert(!serviceSupplyChoices(s.run!.service!,'crate').some(c=>c.ingredientId==='potato'));
 s=act(s,{type:'setTruckMenu',recipeIds:['classic_burger','fries']});assert(serviceSupplyChoices(s.run!.service!,'crate').some(c=>c.ingredientId==='potato'));
 let service=dispatchService(s.run!.service!,{type:'open'});s.run!.service=service;
 assert(dispatchDiner(s,{type:'setTruckMenu',recipeIds:['classic_burger']},{now}).error,'An opened service must retain its menu');
 const cook=new Cook(()=>service,a=>{service=dispatchService(service,a);});
 cook.until(()=>service.customers.some(c=>c.phase==='seated'&&c.recipeId==='fries'),4000);const guest=service.customers.find(c=>c.phase==='seated'&&c.recipeId==='fries')!;
 cook.dish('fries');assert.equal(service.chef.held?.kind,'dish');assert.equal(service.chef.held?.vesselKind,'fry_box');assert.equal(service.stations.find(st=>st.kind==='fryer')!.slots[0].batch?.remaining,2);
 cook.touch(guest.tableId!,undefined,guest.seatId!);assert.equal(service.customers.find(c=>c.id===guest.id)!.phase,'eating');
 console.log(`PASS ${order.join(' then ')}: buy, explicitly add at market, reload, place, choose potatoes, cook three portions and serve fries.`);
}
