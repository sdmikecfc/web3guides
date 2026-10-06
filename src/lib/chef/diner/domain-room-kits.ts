import {DOMAIN_IDS,isDomainId,type DomainId} from './domain-worlds';
import {DOMAIN_ROOM_STUDIES} from './domain-room-studies';
import {domainKitAsset,type DomainRoomAppearance} from './domain-room-kit-defs';
import {RESTAURANT_STAGES,alignRoomMounts,validateRoomPlan,type RestaurantStage,type RoomPlan} from './room-plan';
import type {RoomDesign} from './room-building-draft';
import type {DinerState,HomePlacement} from './progression';
import {EQUIPMENT_BY_ID} from './content';
import {domainCollectionProgress} from './domain-discoveries';
import type {DomainOpeningRecord,DomainSeason} from './domain-seasons';

export type DomainRoomEntitlements={version:1;earned:Partial<Record<DomainId,{receiptId:string;seasonId:string;earnedAt:number;stages:RestaurantStage[];kitchenVersion?:1}>>};
const stages:RestaurantStage[]=['burger_shop','diner','restaurant'];
export function validDomainRoomEntitlements(value:unknown):value is DomainRoomEntitlements|undefined {
 if(value===undefined)return true;if(!value||typeof value!=='object')return false;
 const v=value as DomainRoomEntitlements;if(v.version!==1||!v.earned||typeof v.earned!=='object'||Array.isArray(v.earned))return false;
 return Object.entries(v.earned).every(([d,e])=>isDomainId(d)&&!!e&&(e.kitchenVersion===undefined||e.kitchenVersion===1)&&typeof e.receiptId==='string'&&/^[-a-zA-Z0-9_:]{1,160}$/.test(e.receiptId)&&typeof e.seasonId==='string'&&/^[-a-zA-Z0-9_:]{1,160}$/.test(e.seasonId)&&Number.isSafeInteger(e.earnedAt)&&e.earnedAt>=0&&Array.isArray(e.stages)&&e.stages.length<=3&&new Set(e.stages).size===e.stages.length&&e.stages.every(s=>stages.includes(s)));
}
export function domainRoomBlueprint(domain:DomainId,stage:RestaurantStage):RoomDesign {
 const {w,h}=RESTAURANT_STAGES[stage],prefix=`theme-${domain}`,bathX=w-3;
 const appearance:DomainRoomAppearance={version:1,floor:domain,pieces:{}};
 const plan:RoomPlan={version:2,stage,w,h,legacyShell:false,zones:[],edges:[],modules:[],surfaces:Array.from({length:w*h},(_,i)=>({x:i%w,y:Math.floor(i/w),kind:'indoor'})),entrances:[{id:`${prefix}-door`,at:{x:Math.floor(w/2),y:h-1},facing:0,awning:false}],seating:{},appearance};
 for(let x=0;x<w;x++){
  const id=`${prefix}-back-${x}`;plan.edges.push({id,a:{x,y:-1},b:{x,y:0},kind:'wall',height:3.4});appearance.pieces[id]={domain,part:'wall'};
  plan.edges.push({id:`${prefix}-front-${x}`,a:{x,y:h-1},b:{x,y:h},kind:x===Math.floor(w/2)?'door':'half_wall',height:.65});
 }
 for(let y=0;y<h;y++){
  plan.edges.push({id:`${prefix}-left-${y}`,a:{x:-1,y},b:{x:0,y},kind:'half_wall',height:.65});
  const id=`${prefix}-right-${y}`;plan.edges.push({id,a:{x:w-1,y},b:{x:w,y},kind:'wall',height:3.4});appearance.pieces[id]={domain,part:'wall'};
 }
 // The bathroom is a real enclosure. It does not reserve the rest of the room.
 for(let y=0;y<3;y++)plan.edges.push({id:`${prefix}-bath-side-${y}`,a:{x:bathX-1,y},b:{x:bathX,y},kind:'wall',height:1.9});
 for(let x=bathX;x<w;x++)plan.edges.push({id:`${prefix}-bath-front-${x}`,a:{x,y:2},b:{x,y:3},kind:x===bathX?'door':'wall',height:1.9});
 plan.modules.push({id:`${prefix}-pass`,kind:'display_counter',width:4,x:0,y:3,rotation:0},{id:`${prefix}-bar`,kind:'console',x:0,y:h-3,rotation:3,seatStyles:['classic','classic','classic']},{id:`${prefix}-toilet`,kind:'toilet',x:w-2,y:0,rotation:0,condition:100},{id:`${prefix}-basin`,kind:'handwash_sink',x:w-1,y:0,rotation:0,condition:100});
 if(stage!=='burger_shop')plan.modules.push({id:`${prefix}-counter-extension`,kind:'display_counter',width:4,x:4,y:3,rotation:0});
 for(const m of plan.modules)if(['display_counter','console'].includes(m.kind))appearance.pieces[m.id]={domain,part:'counter'};
 const layout:HomePlacement[]=[{id:`${prefix}-grill`,equipmentId:'grill',x:0,y:0,rotation:0},{id:`${prefix}-prep`,equipmentId:'prep',x:2,y:0,rotation:0},{id:`${prefix}-sink`,equipmentId:'sink',x:4,y:0,rotation:0}];
 // Keep the starter burger workflow usable without changing the player's menu.
 // The domain's own complete kitchen fits between those retained stations.
 const specialized=domain==='gochujang'?['boiler','steamer','griddle']:domain==='smoothie'?['blender','juicer']:['wine_station','oven'];
 for(const [i,kind] of specialized.entries())layout.push({id:`${prefix}-${kind}`,equipmentId:kind,x:[1,3,5][i],y:0,rotation:0});
 // A compact first room, then additional independent tables in the larger plots.
 const tablePositions=stage==='burger_shop'?[{x:7,y:4},{x:7,y:6}]:stage==='diner'?[{x:7,y:5},{x:10,y:5},{x:7,y:8},{x:10,y:8}]:[{x:7,y:5},{x:11,y:5},{x:7,y:8},{x:11,y:8},{x:5,y:9},{x:9,y:10}];
 for(const [i,p] of tablePositions.entries()){
  const id=`${prefix}-table-${i}`;layout.push({id,equipmentId:'table_2',...p,rotation:0});plan.seating![id]={mode:'waiter',chairs:[{x:-1,y:0},{x:1,y:0}]};appearance.pieces[id]={domain,part:'table'};
 }
 layout.push({id:`${prefix}-plant`,equipmentId:domainKitAsset(domain,'plant'),x:w-1,y:h-1,rotation:0},{id:`${prefix}-feature`,equipmentId:domainKitAsset(domain,'feature'),x:3,y:h-2,rotation:0});
 if(stage!=='burger_shop')layout.push({id:`${prefix}-plant-dining`,equipmentId:domainKitAsset(domain,'plant'),x:w-1,y:4,rotation:0});
 // Signs have one stable four-tile support; they cannot overlap wall lamps.
 for(let x=1;x<=4;x++)delete appearance.pieces[`${prefix}-back-${x}`];
 layout.push({id:`${prefix}-sign`,equipmentId:domainKitAsset(domain,'sign'),x:1,y:0,rotation:0,mount:{kind:'wall',targetId:`${prefix}-back-1`,slot:0}});
 for(const x of stage==='restaurant'?[0,5,8,10]:stage==='diner'?[0,5,8]:[0,5])layout.push({id:`${prefix}-lamp-${x}`,equipmentId:domainKitAsset(domain,'lamp'),x,y:0,rotation:0,mount:{kind:'wall',targetId:`${prefix}-back-${x}`,slot:0}});
 if(stage!=='burger_shop')for(const y of [4,h-3])layout.push({id:`${prefix}-dining-lamp-${y}`,equipmentId:domainKitAsset(domain,'lamp'),x:w-1,y,rotation:1,mount:{kind:'wall',targetId:`${prefix}-right-${y}`,slot:0}});
 return {roomPlan:plan,layout:alignRoomMounts(layout,plan)};
}

export function domainRoomAppearanceError(state:Pick<DinerState,'domainRooms'>,plan:RoomPlan,layout:HomePlacement[]):string|null {
 const a=plan.appearance;if(a===undefined)return null;
 if(!a||typeof a!=='object'||Array.isArray(a)||a.version!==1||!a.pieces||typeof a.pieces!=='object'||Array.isArray(a.pieces)||Object.keys(a).some(k=>!['version','floor','pieces'].includes(k))||Object.keys(a.pieces).length>300)return 'Choose a valid earned room style.';
 const earned=(d:unknown)=>isDomainId(d)&&!!state.domainRooms?.earned[d];
 if(a.floor!==undefined&&!earned(a.floor))return 'Discover all 24 collectibles for this domain to unlock its restaurant.';
 for(const [id,v] of Object.entries(a.pieces)){
  if(!v||!earned(v.domain)||Object.keys(v).some(k=>!['domain','part'].includes(k)))return 'Discover all 24 collectibles for this domain to unlock its restaurant.';
  const edge=plan.edges.find(e=>e.id===id),module=plan.modules.find(m=>m.id===id),item=layout.find(p=>p.id===id);
  if(!edge&&!module&&!item&&['wall','counter','table'].includes(v.part))continue;
  if(v.part==='wall'&&edge?.kind==='wall')continue;
  if(v.part==='counter'&&module&&['display_counter','console','chef_bar','internal_pass','service_hatch'].includes(module.kind))continue;
  if(v.part==='table'&&item&&['table_1','table_2','table_4'].includes(item.equipmentId))continue;
  return 'Apply the room appearance to its matching wall, table or counter.';
 }
 return null;
}

/** Server settlement only: caller supplies its authenticated wallet and indexed history.
 * Never expose records, completion booleans or receipt totals as a browser command.
 * Existing earned rooms remain owned, including earlier journey entitlements. */
export function grantDomainRoomKit(input:DinerState,evidence:{domain:DomainId;wallet:string;records:readonly DomainOpeningRecord[];seasons:readonly DomainSeason[];serverNow:number}):DinerState {
 if(!evidence||!isDomainId(evidence.domain)||!/^0x[0-9a-fA-F]{40}$/.test(evidence.wallet)||!Number.isSafeInteger(evidence.serverNow)||evidence.serverNow<0)throw new Error('Verified collection history is required.');
 if(input.domainRooms?.earned[evidence.domain])return unlockDomainRoomSizes(input);
 const progress=domainCollectionProgress(evidence.records,evidence.seasons,evidence.wallet,evidence.domain);
 if(!progress.complete||progress.completedAt===null||progress.completedAt>evidence.serverNow)throw new Error('Discover all 24 different collectibles for this domain first.');
 const state=structuredClone(input);state.domainRooms??={version:1,earned:{}};
 state.domainRooms.earned[evidence.domain]={receiptId:progress.receiptKey,seasonId:`collection-v${progress.catalogueVersion}`,earnedAt:progress.completedAt,stages:[]};
 return unlockDomainRoomSizes(state);
}
/** Each newly reached plot size tops up only the missing kit quantities once. */
export function unlockDomainRoomSizes(input:DinerState):DinerState {
 const state=structuredClone(input),current=stages.indexOf(state.home.roomPlan?.stage??'burger_shop');
 for(const domain of DOMAIN_IDS){
  const entitlement=state.domainRooms?.earned[domain];if(!entitlement)continue;
  for(const stage of stages.slice(0,current+1)){
   if(entitlement.stages.includes(stage))continue;
   const kit=domainRoomBlueprint(domain,stage),counts:Record<string,number>={};
   for(const p of kit.layout)counts[p.equipmentId]=(counts[p.equipmentId]??0)+1;
   for(const [id,n] of Object.entries(counts))if(EQUIPMENT_BY_ID[id]){const owned=state.equipment[id]??={tier:1,truckOwned:false,homeCopies:0};owned.homeCopies=Math.max(owned.homeCopies,n);}else state.decorOwned[id]=Math.max(state.decorOwned[id]??0,n);
   state.home.fixtureInventory??={};
   const used=new Set<string>();
   for(const m of kit.roomPlan.modules){const match=Object.entries(state.home.fixtureInventory).find(([id,o])=>!used.has(id)&&o.kind===m.kind&&o.width===m.width);if(match)used.add(match[0]);else {state.home.fixtureInventory[m.id]={kind:m.kind,condition:100,...(m.width?{width:m.width}:{})};used.add(m.id);}}
   state.home.stools??={classic:0,diner:0};state.home.stools.classic=Math.max(state.home.stools.classic,3);
   entitlement.stages.push(stage);
  }
  // Earlier private kits used the burger kitchen. Add the new cuisine machines
  // once without moving furniture, changing menus or replenishing sold décor.
  if(entitlement.kitchenVersion!==1){
   for(const p of domainRoomBlueprint(domain,stages[current]).layout){
    if(!EQUIPMENT_BY_ID[p.equipmentId]||!['boiler','steamer','griddle','blender','juicer','wine_station','oven'].includes(p.equipmentId))continue;
    const owned=state.equipment[p.equipmentId]??={tier:1,truckOwned:false,homeCopies:0};owned.homeCopies=Math.max(1,owned.homeCopies);
   }
   entitlement.kitchenVersion=1;
  }
 }
 return state;
}
export function earnedDomainRoomDraft(state:DinerState,domain:DomainId):RoomDesign {
 const stage=state.home.roomPlan?.stage??'burger_shop';
 if(!state.domainRooms?.earned[domain]?.stages.includes(stage))throw new Error('Discover all 24 collectibles for this domain to unlock its restaurant.');
 const draft=domainRoomBlueprint(domain,stage),error=validateRoomPlan(draft.roomPlan,draft.layout);if(error)throw new Error(error);
 const used=new Set<string>();
 for(const m of draft.roomPlan.modules){
  const match=Object.entries(state.home.fixtureInventory??{}).find(([id,o])=>!used.has(id)&&o.kind===m.kind&&o.width===m.width);if(!match)throw new Error('Restore the missing kit fixture from storage before applying.');
  const old=m.id;m.id=match[0];used.add(m.id);if(['toilet','handwash_sink'].includes(m.kind))m.condition=match[1].condition;
  const style=draft.roomPlan.appearance!.pieces[old];if(style){delete draft.roomPlan.appearance!.pieces[old];draft.roomPlan.appearance!.pieces[m.id]=style;}
 }
 return draft;
}
export const domainRoomName=(domain:DomainId)=>DOMAIN_ROOM_STUDIES[domain].name;
