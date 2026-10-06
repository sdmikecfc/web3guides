import assert from 'node:assert/strict';
import { ALL_COLLECTIBLES, COLLECTIBLES, PACKS, PACK_TICKETS, collectibleAtTicket, packItems, packLeaderboard, type SettledPackOpening } from '../src/lib/chef/diner/collectible-packs';
import { SHOP_DECOR } from '../src/lib/chef/diner/decor-catalog';
import { DECOR_BY_ID, charmOf, decorResaleValue } from '../src/lib/chef/diner/collections';
import { createDiner, dispatchDiner, sanitizeDinerSave, validateDinerHomePlacement, homeSimulationConfig } from '../src/lib/chef/diner/progression';
import { createHomeWorld, stepHomeWorld } from '../src/lib/chef/diner/home-simulation';
import { resolveRoomMount } from '../src/lib/chef/diner/room-plan';
import { createPlacementDraft, previewPlacement } from '../src/app/chef/diner-preview/placement-preview';
import { ownedEquipmentAppearances } from '../src/lib/chef/diner/collectible-appearances';
const now=Date.UTC(2026,8,23,12);let groups=0;
function check(name:string,fn:()=>void){fn();groups++;console.log('PASS '+name);}

check('each twelve-item pool maps all 10000 tickets to its exact published integer odds',()=>{
  assert.equal(COLLECTIBLES.length,24);assert.equal(new Set(COLLECTIBLES.map(i=>i.id)).size,24);
  for(const pack of ['regular','super'] as const){const items=packItems(pack),counts=new Map<string,number>();assert.equal(items.length,12);assert.equal(items.reduce((sum,i)=>sum+i.weight,0),PACK_TICKETS);
    for(let ticket=0;ticket<PACK_TICKETS;ticket++){const item=collectibleAtTicket(pack,ticket);assert.equal(item.pack,pack);counts.set(item.id,(counts.get(item.id)??0)+1);}
    for(const item of items)assert.equal(counts.get(item.id),item.weight,item.id);
    for(const invalid of [-1,10000,.5,NaN,Infinity])assert.throws(()=>collectibleAtTicket(pack,invalid));
  }
  assert.equal(PACKS.regular.priceUnits,5_000_000);assert.equal(PACKS.regular.redemptionUnits,4_990_000);assert.equal(PACKS.super.redemptionUnits,9_980_000);
});
check('samples grant real, reloadable furnishings without charging, and account commands cannot grant or coin-sell them',()=>{
  let state=createDiner(now,'pack-check');const coins=state.coins;
  for(const pack of ['regular','super'] as const)for(const item of packItems(pack)){
    const ticket=packItems(pack).slice(0,packItems(pack).indexOf(item)).reduce((sum,i)=>sum+i.weight,0);
    assert(dispatchDiner(state,{type:'previewPack',pack},{now}).error);
    const result=dispatchDiner(state,{type:'previewPack',pack},{now,packPreviewTicket:ticket});assert.equal(result.error,undefined,result.error);state=result.state;
    assert.equal(state.decorOwned[item.id],1);assert.equal(state.coins,coins);assert.equal(decorResaleValue(item.id),null);
    assert(dispatchDiner(state,{type:'buyDecor',decorId:item.id},{now}).error);assert(dispatchDiner(state,{type:'sellDecor',decorId:item.id},{now}).error);
  }
  assert(sanitizeDinerSave(JSON.stringify(state)));assert.equal(charmOf(state).score,charmOf(createDiner(now,'pack-check')).score);
  const furnished=structuredClone(state);furnished.home.layout.push(...COLLECTIBLES.map((item,i)=>({id:`sample-${i}`,equipmentId:item.id,x:5,y:5,rotation:0 as const})));assert.equal(charmOf(furnished).score,charmOf(state).score,'placed collectibles do not increase earnings through charm');
  const more=dispatchDiner(state,{type:'previewPack',pack:'regular'},{now,packPreviewTicket:0});assert.equal(more.state.decorOwned[COLLECTIBLES[0].id],2);
});
check('public commands cannot open samples, while old ownership and owned appearance controls survive reload',()=>{
  const state=createDiner(now,'private-collection');
  assert.deepEqual(ownedEquipmentAppearances(state,'grill'),[]);
  for(const item of ALL_COLLECTIBLES)state.decorOwned[item.id]=1;
  const saved=JSON.stringify(state);
  for(const pack of ['regular','super'] as const){
    const denied=dispatchDiner(state,{type:'previewPack',pack},{now:now+60_000});
    assert(denied.error);assert.deepEqual(denied.state,state);
    // Command payloads cannot supply the separate development-fixture context.
    const forged=dispatchDiner(state,{type:'previewPack',pack,packPreviewTicket:0} as any,{now});
    assert(forged.error);assert.deepEqual(forged.state,state);
  }
  assert.equal(JSON.stringify(state),saved);
  const reloaded=sanitizeDinerSave(saved)!;assert(reloaded);
  for(const item of ALL_COLLECTIBLES)assert.equal(reloaded.decorOwned[item.id],1,item.id);
  assert.deepEqual(ownedEquipmentAppearances(reloaded,'grill').map(item=>item.id),['collect_dragonfire_grill']);
  assert.deepEqual(ownedEquipmentAppearances(reloaded,'sink'),[]);
  reloaded.decorOwned.collect_dragonfire_grill=0;
  assert.deepEqual(ownedEquipmentAppearances(reloaded,'grill'),[]);
});
check('display counters carry two real attachments through rotation and moving; missing supports and doubled slots fail',()=>{
  let state=createDiner(now,'counter-check');state.coins=10000;
  state=dispatchDiner(state,{type:'buyDecor',decorId:'display_counter_oak'},{now}).state;
  const draft=createPlacementDraft(state,'home','display_counter_oak','display-test');let proposed=previewPlacement(state,draft);assert.equal(proposed.error,null,proposed.error??'');
  state=dispatchDiner(state,proposed.command,{now}).state;
  for(const [slot,equipmentId] of ['collect_lucky_bun','collect_pickle_diver'].entries()){
    state.decorOwned[equipmentId]=1;const mount={kind:'counter' as const,targetId:'display-test',slot},at=resolveRoomMount(state.home.roomPlan!,mount,state.home.layout)!;assert(at);
    state.home.layout.push({id:`trinket-${slot}`,equipmentId,x:Math.floor(at.x),y:Math.floor(at.y),rotation:0,mount});
  }
  assert.equal(validateDinerHomePlacement(state,state.home.layout),null);
  for(const rotation of [0,1,2,3] as const){let found=false;for(let y=4;y<state.home.h&&!found;y++)for(let x=0;x<state.home.w&&!found;x++){
    const candidate=previewPlacement(state,{...draft,existing:true,x,y,rotation});if(candidate.error)continue;
    const result=dispatchDiner(state,candidate.command,{now});assert.equal(result.error,undefined);state=result.state;assert(sanitizeDinerSave(JSON.stringify(state)));found=true;
    for(const p of state.home.layout.filter(p=>p.mount?.targetId==='display-test')){const at=resolveRoomMount(state.home.roomPlan!,p.mount!,state.home.layout)!;assert.equal(p.x,Math.floor(at.x));assert.equal(p.y,Math.floor(at.y));assert.equal(at.rotation,rotation);}
  }assert(found,`No valid counter arrangement at ${rotation}`);}
  assert(validateDinerHomePlacement(state,state.home.layout.filter(p=>p.id!=='display-test')));
  const duplicate=structuredClone(state.home.layout);duplicate.find(p=>p.id==='trinket-1')!.mount!.slot=0;
  assert(validateDinerHomePlacement(state,duplicate));
});
check('new coin decorations are buyable, storable and sellable without unlocking collectible sales or changing old set bonuses',()=>{
  assert.equal(SHOP_DECOR.length,27); // Original 24 furnishings plus three modular counter corners.
  for(const item of SHOP_DECOR){const state=createDiner(now,'shop-check');state.coins=10000;const bought=dispatchDiner(state,{type:'buyDecor',decorId:item.id},{now});assert.equal(bought.error,undefined,item.id);assert.equal(bought.state.decorOwned[item.id],1);assert.equal(bought.state.coins,10000-item.price);assert.equal(dispatchDiner(bought.state,{type:'sellDecor',decorId:item.id},{now}).error,undefined,item.id);}
  const state=createDiner(now,'sets');state.home.layout.push(...['red_planter','chrome_clock','milkshake_sign','checkered_shelf'].map((equipmentId,i)=>({id:`set-${i}`,equipmentId,x:6,y:5,rotation:0 as const})));assert(charmOf(state).sets.includes('fifties'));
  for(const item of COLLECTIBLES){assert(DECOR_BY_ID[item.id].collectible);assert.equal(DECOR_BY_ID[item.id].price,0);}
});
check('official opening counts ignore duplicates, preview draws, wrong pools and invalid chain evidence',()=>{
  const make=(n:number,wallet='0x'+'a'.repeat(40)):SettledPackOpening=>({openingId:`opening-${n}`,wallet,pack:'regular',version:2,itemId:COLLECTIBLES[0].id,chainId:1,contractAddress:'0x'+'c'.repeat(40),transactionHash:'0x'+n.toString(16).padStart(64,'0'),logIndex:0,tokenId:String(n),openedAt:now+n,mode:'live'});
  const a=make(1),b=make(2),superItem=packItems('super')[0];
  const receipts=[a,a,{...a,openingId:'retry'},b,{...make(3),mode:'preview' as 'live'},{...make(4),itemId:superItem.id},{...make(5),transactionHash:'unconfirmed'}, {...make(6),pack:'super' as const,itemId:superItem.id}];
  const rows=packLeaderboard(receipts,'regular');assert.equal(rows.length,1);assert.equal(rows[0].regular,2);assert.equal(rows[0].super,1);assert.equal(rows[0].unique,2);
  assert.equal(packLeaderboard(receipts,'super')[0].super,1);
  assert.equal(packLeaderboard([{...a,openingId:'remint',transactionHash:make(9).transactionHash},a],'regular')[0].regular,1);
  const tied=packLeaderboard([a,make(10,'0x'+'b'.repeat(40))],'regular');assert.deepEqual(tied.map(row=>row.rank),[1,1]);
  const malformed=[null,{}, {...a,tokenId:'01'}, {...a,transactionHash:null}, {...a,contractAddress:42}] as unknown as SettledPackOpening[];
  assert.deepEqual(packLeaderboard(malformed,'regular'),[]);
});
check('waiting benches are used by queued guests and release them to real dining seats without adding tables',()=>{
  const state=createDiner(now,'waiting-room');state.decorOwned.waiting_bench_red=1;
  const draft=createPlacementDraft(state,'home','waiting_bench_red','waiting-bench'),preview=previewPlacement(state,draft);assert.equal(preview.error,null,preview.error??'');
  const arranged=dispatchDiner(state,preview.command,{now}).state,world=createHomeWorld({...homeSimulationConfig(arranged),arrivalRate:240});
  assert.equal(world.notice,'');const capacity=world.tables.reduce((n,t)=>n+t.seats.length,0);assert.equal(capacity,3);
  const waited=new Set<string>();let satWaiting=false,laterDined=false;
  for(let tick=0;tick<12000;tick++){
    stepHomeWorld(world);
    const reservations=world.customers.flatMap(c=>c.waitingPlaceId?[c.waitingPlaceId]:[]);assert.equal(new Set(reservations).size,reservations.length,'waiting seats must be exclusive');assert(reservations.length<=2);
    for(const c of world.customers){if(c.waitingPlaceId){waited.add(c.id);satWaiting||=!c.path.length;}if(waited.has(c.id)&&c.phase==='eating')laterDined=true;}
    if(satWaiting&&laterDined&&world.metrics.washed>0)break;
  }
  assert(satWaiting,'guests should sit on the bench');assert(laterDined,'a waiting guest should move to a dining seat and receive food');assert(world.metrics.washed>0);assert.equal(world.tables.reduce((n,t)=>n+t.seats.length,0),capacity);
});
console.log(`PASS ${groups} pack and decorating groups`);
