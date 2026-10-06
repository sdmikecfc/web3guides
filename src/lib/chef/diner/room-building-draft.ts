/** Editable designs contain possessions, never grants or production state. */
import type {DinerState,HomePlacement} from './progression';
import {homeEquipmentPurchaseError,DINER_RULES} from './progression';
import {EQUIPMENT_BY_ID} from './content';
import {DECOR_BY_ID,COSMETICS,MAX_DECOR_COPIES,ROOM_FINISH_DEFAULTS,finishPrice,roomFinishPrice,type FinishSlot,type RoomFinishSlot} from './collections';
import {roomCollectionVisible} from './room-collection';
import {createRestaurantBlueprint,roomSeatStyles,alignRoomMounts,type RoomPlan,type RoomModuleKind} from './room-plan';
import {freeRoomStructureError,migrateRoomPlan} from './room-plan-v2';
import {stoolOwnershipError,starterTrinketLayout,RENOVATION_RULES} from './renovation';
import {stageDecorLayout} from './stage-style-kit';
import {domainRoomAppearanceError} from './domain-room-kits';

export type RoomDesign={roomPlan:RoomPlan;layout:HomePlacement[];purchases?:Record<string,number>;finishes?:Partial<Record<RoomFinishSlot,string>>;surfaces?:Partial<Record<FinishSlot,string>>};
export type UnfinishedRoomDesign=RoomDesign&{version:1;savedAt:number};
const validId=(id:unknown)=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id);
export const BUILD_FIXTURE_PRICES:Record<RoomModuleKind,number>={display_counter:600,lift_gate:150,service_hatch:350,internal_pass:400,console:650,chef_bar:3000,toilet:600,handwash_sink:350};
export function fixturePurchase(key:string){const [prefix,kind,id,...extra]=key.split('/');return prefix==='fixture'&&!extra.length&&Object.hasOwn(BUILD_FIXTURE_PRICES,kind)&&validId(id)&&id.startsWith('draft-fixture-')?{kind:kind as RoomModuleKind,id}:null;}
/** A preview cart purchases only pieces still present in the proposed room. */
export function roomPurchaseNeeded(state:DinerState,draft:RoomDesign,key:string):number {
 const fixture=fixturePurchase(key);if(fixture)return !state.home.fixtureInventory?.[fixture.id]&&draft.roomPlan.modules.some(m=>m.id===fixture.id&&m.kind===fixture.kind)?1:0;
 if(key==='stool/classic'||key==='stool/diner'){const style=key.slice(6) as 'classic'|'diner';return Math.max(0,draft.roomPlan.modules.flatMap(roomSeatStyles).filter(s=>s===style).length-(state.home.stools?.[style]??0));}
 return Math.max(0,draft.layout.filter(p=>p.equipmentId===key).length-(state.equipment[key]?.homeCopies??state.decorOwned[key]??0));
}
export function trimRoomPurchases(state:DinerState,draft:RoomDesign):RoomDesign {
 const next=structuredClone(draft);for(const key of Object.keys(next.purchases??{})){const needed=roomPurchaseNeeded(state,next,key);if(needed)next.purchases![key]=Math.min(next.purchases![key],needed);else delete next.purchases![key];}return next;
}

/** Price and ownership are recomputed from the catalogue, never supplied grants. */
export function quoteRoomPurchases(state:DinerState,draft:Pick<RoomDesign,'purchases'|'finishes'|'surfaces'>):{cost:number;owned:DinerState;error:string|null}{
 const owned={...state,equipment:structuredClone(state.equipment),decorOwned:{...state.decorOwned},finishOwned:structuredClone(state.finishOwned),paletteOwned:structuredClone(state.paletteOwned??Object.fromEntries(Object.entries(ROOM_FINISH_DEFAULTS).map(([k,v])=>[k,[v]])) as Record<RoomFinishSlot,string[]>),home:{...state.home,fixtureInventory:structuredClone(state.home.fixtureInventory??{}),stools:{...state.home.stools!}}};let cost=0;
 const reject=(error:string)=>({cost,owned,error}),cart=draft.purchases??{};
 for(const [name,choices] of [['surfaces',draft.surfaces],['finishes',draft.finishes]] as const){
  if(choices===undefined)continue;
  if(!choices||typeof choices!=='object'||Array.isArray(choices)||Object.keys(choices).length>(name==='surfaces'?2:4))return reject('Choose valid room finishes.');
  for(const [slot,id] of Object.entries(choices)){
   const price=typeof id==='string'?(name==='surfaces'?finishPrice(slot as FinishSlot,id):roomFinishPrice(slot as RoomFinishSlot,id)):null;
   if(price===null)return reject('Choose a finish from the catalogue.');
   const stock=name==='surfaces'?owned.finishOwned[slot as FinishSlot]:owned.paletteOwned[slot as RoomFinishSlot];
   if(!stock.includes(id)){stock.push(id);cost+=price;}
  }
 }
 if(!cart||typeof cart!=='object'||Array.isArray(cart)||Object.keys(cart).length>40)return reject('Choose a bounded furniture order.');
 for(const [id,count] of Object.entries(cart)){
  if(!Number.isInteger(count)||count<1||count>20)return reject('Choose a valid furniture quantity.');
  const fixture=fixturePurchase(id);
  if(fixture){
   if(count!==1||Object.hasOwn(owned.home.fixtureInventory,fixture.id)||Object.keys(owned.home.fixtureInventory).length>=100)return reject('Choose a new fixture that fits your collection.');
   owned.home.fixtureInventory[fixture.id]={kind:fixture.kind,condition:100};cost+=BUILD_FIXTURE_PRICES[fixture.kind];
  }else if(id==='stool/classic'||id==='stool/diner'){
   const style=id.slice(6) as 'classic'|'diner';if((owned.home.stools[style]??0)+count>100)return reject('Use a stored stool first.');owned.home.stools[style]=(owned.home.stools[style]??0)+count;cost+=RENOVATION_RULES.stoolPrices[style]*count;
  }else if(Object.hasOwn(EQUIPMENT_BY_ID,id)){
   for(let n=0;n<count;n++){const error=homeEquipmentPurchaseError(owned,id);if(error)return reject(error);const piece=owned.equipment[id]??={tier:1,truckOwned:false,homeCopies:0};cost+=EQUIPMENT_BY_ID[id].tiers[piece.tier-1].price*DINER_RULES.homeEquipmentMultiplier;piece.homeCopies++;}
  }else{
   const decor=Object.hasOwn(DECOR_BY_ID,id)?DECOR_BY_ID[id]:undefined;
   if(!decor||decor.collectible||decor.memento||!roomCollectionVisible(id,'decor',state.decorOwned[id]??0))return reject('Choose a furnishing from the public furniture shop.');
   if((owned.decorOwned[id]??0)+count>MAX_DECOR_COPIES)return reject('Use a stored copy before buying more.');
   cost+=decor.price*count;owned.decorOwned[id]=(owned.decorOwned[id]??0)+count;
  }
 }
 return {cost,owned,error:null};
}

/** Rehearsal and rendering use precisely the inventory and presentation being previewed. */
export function roomDesignPreview(state:DinerState,draft:RoomDesign):DinerState {
 const owned=quoteRoomPurchases(state,draft).owned;
 return {...owned,cosmetics:{...owned.cosmetics,...draft.surfaces},home:{...owned.home,roomPlan:structuredClone(draft.roomPlan),layout:structuredClone(draft.layout),finishes:{...ROOM_FINISH_DEFAULTS,...owned.home.finishes,...draft.finishes}}};
}
export function roomDesignCommand(state:DinerState,draft:RoomDesign){return {type:'homeRoomPlan' as const,...draft,expectedCost:quoteRoomPurchases(state,draft).cost};}

/** Incomplete paths and overlapping previews may be saved, but unowned assets may not. */
export function roomDesignAssetError(state:DinerState,draft:RoomDesign):string|null {
 const quote=quoteRoomPurchases(state,draft);if(quote.error)return quote.error;state=quote.owned;
 const p=draft?.roomPlan;
 if(!p||p.version!==2||p.stage!==state.home.roomPlan?.stage||p.w!==state.home.w||p.h!==state.home.h)return 'Keep this design on your current restaurant plot.';
 const shape=freeRoomStructureError(p);if(shape)return shape;
 if(Object.keys(p).some(k=>!['version','stage','w','h','modules','edges','zones','surfaces','entrances','seating','legacyShell','appearance'].includes(k)))return 'Keep valid construction data.';
 const appearanceError=domainRoomAppearanceError(state,p,draft.layout);if(appearanceError)return appearanceError;
 for(const m of p.modules){const owned=state.home.fixtureInventory?.[m.id];if(!validId(m.id)||!owned||owned.kind!==m.kind||owned.width!==m.width||Object.keys(m).some(k=>!['id','kind','x','y','rotation','condition','width','seatStyles'].includes(k)))return 'Place only fixtures you own.';}
 const stoolError=stoolOwnershipError(p,state.home.stools??{classic:0,diner:0});if(stoolError)return stoolError;
 if(p.surfaces?.some(s=>s.finish&&!state.finishOwned.floor.includes(s.finish))||p.edges.some(e=>e.finish&&!state.finishOwned.wall.includes(e.finish)))return 'Choose a finish you own.';
 if(!Array.isArray(draft.layout)||draft.layout.length>p.w*p.h)return 'Keep a bounded furniture list.';
 const ids=new Set(p.modules.map(m=>m.id)),counts:Record<string,number>={};
 for(const item of draft.layout){
  if(!item||!validId(item.id)||ids.has(item.id)||!Object.hasOwn(EQUIPMENT_BY_ID,item.equipmentId)&&!Object.hasOwn(DECOR_BY_ID,item.equipmentId)||!Number.isInteger(item.x)||!Number.isInteger(item.y)||item.x<(item.mount?-1:0)||item.y<(item.mount?-1:0)||item.x>=p.w||item.y>=p.h||![0,1,2,3].includes(item.rotation)||Object.keys(item).some(k=>!['id','equipmentId','x','y','rotation','skin','mount'].includes(k))||item.skin!==undefined&&!COSMETICS.skins.includes(item.skin as typeof COSMETICS.skins[number]))return 'Choose valid furniture positions.';
  ids.add(item.id);counts[item.equipmentId]=(counts[item.equipmentId]??0)+1;
  if(counts[item.equipmentId]>(state.equipment[item.equipmentId]?.homeCopies??state.decorOwned[item.equipmentId]??0))return 'Choose furnishings you own.';
  if(item.mount&&(!['wall','counter','ceiling'].includes(item.mount.kind)||!validId(item.mount.targetId)||!Number.isSafeInteger(item.mount.slot)||item.mount.slot<0||item.mount.slot>p.w*p.h||Object.keys(item.mount).some(k=>!['kind','targetId','slot'].includes(k))))return 'Choose a valid decoration support.';
 }
 return null;
}

export function normalizeRoomDesign(state:DinerState,draft:RoomDesign):RoomDesign {
 const next=structuredClone(draft);
 for(const m of next.roomPlan.modules){if(['toilet','handwash_sink'].includes(m.kind))m.condition=state.home.fixtureInventory?.[m.id]?.condition??m.condition;else delete m.condition;}
 return next;
}

/** Reuse the current stage's starter using existing ownership, including stable fixture IDs. */
export function starterRoomDesign(state:DinerState):{draft:RoomDesign;missing:string[]} {
 const blueprint=createRestaurantBlueprint(state.home.roomPlan!.stage),plan=blueprint.roomPlan,available=Object.entries(state.home.fixtureInventory??{}),used=new Set<string>(),missing:string[]=[],remap=new Map<string,string>();
 const stools={...state.home.stools!},installed=(state.home.roomPlan?.modules??[]).flatMap(roomSeatStyles);
 plan.modules=plan.modules.flatMap(m=>{
  const owned=available.find(([id,o])=>!used.has(id)&&o.kind===m.kind&&o.width===m.width);
  if(!owned){missing.push(m.kind.replaceAll('_',' '));return [];}
  used.add(owned[0]);remap.set(m.id,owned[0]);m.id=owned[0];
  if(['toilet','handwash_sink'].includes(m.kind))m.condition=owned[1].condition;
  if(m.kind==='console'||m.kind==='chef_bar'){const capacity=roomSeatStyles(m).length;m.seatStyles=[];for(const style of [...installed,...Array(stools.classic).fill('classic'),...Array(stools.diner).fill('diner')] as ('classic'|'diner')[])if(m.seatStyles.length<capacity&&stools[style]>0){m.seatStyles.push(style);stools[style]--;}}
  return [m];
 });
 // Starter decorations are optional; missing pieces are disclosed, never created.
 const candidates=[...blueprint.layout,...starterTrinketLayout(plan),...stageDecorLayout(plan)],counts:Record<string,number>={};
 const layout=candidates.flatMap(item=>{const n=counts[item.equipmentId]??0,owned=state.equipment[item.equipmentId]?.homeCopies??state.decorOwned[item.equipmentId]??0;if(n>=owned){missing.push(EQUIPMENT_BY_ID[item.equipmentId]?.name??DECOR_BY_ID[item.equipmentId]?.name??item.equipmentId);return [];}counts[item.equipmentId]=n+1;if(item.mount)item.mount.targetId=remap.get(item.mount.targetId)??item.mount.targetId;return [item];});
 const migrated=migrateRoomPlan(plan,layout);
 return {draft:{roomPlan:migrated,layout:alignRoomMounts(layout,migrated)},missing:[...new Set(missing)]};
}
