/** Street Eats preview progression. Renderer-free, seeded, and isolated from dk saves. */
import { CONTENT_VERSION, DIFFICULTIES, EQUIPMENT, EQUIPMENT_BY_ID, HOME_ONLY_EQUIPMENT_IDS, isTruckEquipmentAvailable, isHomeEquipmentAvailable, INGREDIENTS, INGREDIENT_BY_ID, RECIPES, RECIPE_BY_ID, ROUTES, SERVICE_RULES, SPICES, TRUCK_TIERS } from "./content";
import { createService, dispatchService, normalizeServiceAdditions, sanitizeService, serviceReadyError, serviceResult } from "./service";
import { buildServiceLoadout, makeStation, makeTable, validateServiceLayout } from "./geometry";
import { createHomeWorld, measureHomeRates, type HomeSimulationConfig } from "./home-simulation";
import { chooseHomeInteractionTile, homeSpatial } from "./home-spatial";
import { addHomeStroke, emptyHomeGesture, homePointNear, HOME_GESTURE_RULES, PARCEL_PARTS, parcelStage, parcelStageEnd, validHomePoint, type HomeGesturePoint, type HomeGestureWork, type ParcelPart } from './home-gesture';
import { charmOf, COSMETICS, DECOR_BY_ID, STARTER_TRINKETS, MAX_DECOR_COPIES, decorResaleValue, FINISH_RULES, finishPrice, RECRUITS, REGULARS, regularAvailable, regularFavourite, regularLevel, type DinerStaff, type FinishSlot, type SavedDinerLayout } from "./collections";
import { createDinerEvent, dispatchDinerEvent, eventServiceOptions, sanitizeDinerEvent, type DinerEvent, type EventAction, type NextServiceEffect } from "./events";
import { createRally, dispatchRally, finishRally, startRally, type DinerRally } from "./rally";
import type { Course, DinerTier, ServiceAction, ServiceState, ServiceStation, ServiceTable } from "./types";
import { createDinerCareer, sanitizeDinerCareer, recordCareerService, careerIngredientBundle, type DinerCareer } from './career';
import { createRenovationState, fixtureInventoryFor, getRenovationPreview, starterTrinketLayout, dinerFinishKit, installedStools, stoolOwnershipError, RENOVATION_RULES, type RenovationState, type FixtureInventory, type StoolInventory } from './renovation';
import { createRestaurantBlueprint, validateRoomPlan, alignRoomMounts, RESTAURANT_STAGES, ROOM_FIXTURES, ROOM_RULES, roomModuleGeometry, roomSeatStyles, bathroomBays, type RoomPlan, type RestaurantStage, type RoomModuleKind, type StoolStyle } from './room-plan';
import { ROOM_PALETTES, ROOM_FINISH_DEFAULTS, roomFinishPrice, type RoomFinishSlot } from './collections';
import { stageDecorIds, stageFinishKit } from './stage-style-kit';
import { createRecipeProgression, sanitizeRecipeProgression, RECIPE_KITS, autoHomeRecipeIds, type RecipeProgression } from './recipe-progression';
export { recipeKitOffers, recipeEquipmentNeeded, autoHomeRecipeIds, RECIPE_KITS, RECIPE_KIT_RULES } from './recipe-progression';
export { getRenovationPreview, renovationRequirements, RENOVATION_RULES } from './renovation';
export { careerIngredientRewards, CAREER_RULES } from './career';

export const DINER_SAVE_KEY = "street_eats_preview_v1";
export const DINER_RULES = {
  version: 1, dayMs: 86_400_000, hourMs: 3_600_000, maxDishLevel: 10,
  offlineMultiplier: .6, tillHours: 8, buzzHours: 4, buzzMax: 10,
  ingredientMaximum: 7, marketPrices: { common: 300, uncommon: 500, rare: 800 },
  sourceAllowances: { crate: 2, market: 1, garden: 1, kindness: 1, truck: 2 },
  starterCoins: 200, homeEquipmentMultiplier: 12, homeArrivalBase: 60, homeArrivalPerLevel: 2, rerollCost: 80,
  staffMealSpeed: 1.1, regularDailyServings: 1, incidentCoins: 30, incidentWaitMs: 600_000, incidentWorkTicks:{spill:40,delivery:12},
  recipeCost: 140, ingredientNodeCoins: 70, bonusCoins: 100,
  expansionPrices: [0, 25_000, 60_000, 150_000], expansionLevels: [1, 5, 12, 20],
  floors: [8, 10, 12, 14], reputationLevels: [0, 20, 60, 140, 260, 440, 680, 980, 1350, 1800, 2320, 2920, 3600, 4400, 5300, 6300, 7500, 8900, 10500, 12400].map(value => value * 12),
  nodeRewards: { slow: 25, medium: 50, busy: 80, special: 90, finale: 250 },
} as const;
export type NodeKind = "slow" | "medium" | "busy" | "special" | "shop" | "bonus" | "event" | "ingredients" | "finale";
export interface DinerNode { id: string; row: number; column: number; kind: NodeKind; next: string[]; name: string }
export interface HomePlacement { id: string; equipmentId: string; x: number; y: number; rotation: 0 | 1 | 2 | 3; skin?: string;mount?:{kind:'wall'|'counter'|'ceiling';targetId:string;slot:number} }
export type TruckStationPlacement = Pick<ServiceStation, "id" | "kind" | "x" | "y" | "facing">;
export type TruckTablePlacement = Pick<ServiceTable, "id" | "x" | "y" | "capacity"> & { rotation?: ServiceTable["rotation"] };
export type TruckTableId = 'table_1' | 'table_2' | 'table_4';
export const TRUCK_TABLE_PRICES: Record<1|2|4,number> = {1:EQUIPMENT_BY_ID.table_1.tiers[0].price,2:EQUIPMENT_BY_ID.table_2.tiers[0].price,4:EQUIPMENT_BY_ID.table_4.tiers[0].price};
export const truckMenuCapacity=(state:Pick<DinerState,'truckTier'>):number=>TRUCK_TIERS[state.truckTier].menuCapacity;
export interface DinerOffer { id: string; kind: "recipe" | "equipment" | "upgrade" | "ingredients"; target: string; price: number; purchased: boolean }
export interface DinerRun {
  /** Absent on existing trips, whose promised tutorial and finale rewards remain. */
  discoveryVersion?:2;
  id: string; seed: string; routeId: string; contentVersion: number; map: DinerNode[]; available: string[]; position: string | null; visited: string[];
  strikes: number; haul: number; service: ServiceState | null; serviceAccounted: { coins: number; strikes: number; reputation: number };
  menu: string[]; specials: string[]; spices: string[]; offers: DinerOffer[]; rerolled: boolean; qualified: boolean; ingredientClaimed: boolean; tutorial: boolean; serviceDays: number; practice: boolean;
  event:DinerEvent|null;nextService:NextServiceEffect|null;serviceEffect:NextServiceEffect|null;lastEventResult:string|null;mapVersion:1|2|3;
}
export interface DinerDaily { day: number; workVersion?:1|2; crate: boolean; crateProgressTicks:number; market: boolean; garden: boolean; kindness: boolean; truckRuns: string[]; minted: number; marketOffers: string[]; regularServed: string[]; regularProgress: Record<string, number>; incidentClaims: string[]; staffMeal: string | null }
export interface DinerHomeTask {incidentId:string;progressTicks:number;phase:"ready"|"working"|"paused";gesture?:HomeGestureWork}
export type DinerHomeTaskAction={type:"hold";active:boolean}|{type:"tick";ticks:number}|{type:"pause"}|{type:'strokeStart';point:HomeGesturePoint}|{type:'stroke';point:HomeGesturePoint}|{type:'parcel';part:ParcelPart};
export interface DinerState {
  /** Distinguishes newly sold holding counters from earlier heat-lamp ownership. */
  counterVersion?:1;
  version: 1; contentVersion: number; seed: string; createdAt: number; updatedAt: number; coins: number; reputation: number; restaurantLevel: number; truckTier: DinerTier; runsStarted: number;
  recipes: Record<string, { level: number }>; pantry: Record<string, number>;
  equipment: Record<string, { tier: number; truckOwned: boolean; homeCopies: number }>;
  decorOwned: Record<string, number>;
  starterTrinkets?: {version:1;granted:true};
  cosmetics: { wrap: string; horn: string; uniform: string; floor: string; wall: string };
  finishOwned: Record<FinishSlot, string[]>;
  paletteOwned?:Record<RoomFinishSlot,string[]>;
  career:DinerCareer;
  recipeProgression?:RecipeProgression;
  renovation:RenovationState;
  staffMembers: DinerStaff[];
  truckConfig: { stations: TruckStationPlacement[]; tables: TruckTablePlacement[]; tableCopies:Record<TruckTableId,number>; supplyVersion?:1; menuVersion?:2; layoutVersion?:2; layoutTier: DinerTier; menu: string[]; helperId: string | null; helperRole: "washer" | "runner" | "prep"; helperId2: string | null; helperRole2: "washer" | "runner" | "prep"; spices: string[] };
  savedLayouts: SavedDinerLayout[];
  home: { w: number; h: number; expansion: number; layout: HomePlacement[]; roomPlan?:RoomPlan; fixtureInventory?:FixtureInventory; stools?:StoolInventory; finishes?:Record<RoomFinishSlot,string>; menu: Record<Course, string[]>; staff: { chefs: number; waiters: number; cashiers?:number }; till: { coins: number; reputation: number; lastAt: number; capacityHours: number; filledMs: number }; garden: { plantedAt: number; ingredientId: string }; name: string };
  buzz: number[]; run: DinerRun | null;
  rally:DinerRally;
  homeTask:DinerHomeTask|null;
  lastRun: { id: string; reason: "home" | "failed" | "won"; banked: number; lost: number; serviceDays: number; recipes: string[]; equipment: string[] } | null;
  tutorial: { stage: number; finished: boolean; fryerGifted: boolean; crateClaimed: boolean };
  daily: DinerDaily;
  collections: { regulars: Record<string, number>; stamps: string[]; trophies: string[]; scraps: Record<string, number>; mementos: string[]; routeWins: string[] };
  settings: { cosy: boolean };
}
type DinerCoreCommand =
  | { type: "startRun"; routeId?: string; tutorial?: boolean; headStart?: boolean }
  | { type: "startPractice"; recipeIds?: string[] }
  | { type: "endPractice" }
  | { type: "chooseNode"; nodeId: string }
  | { type: "service"; action: ServiceAction }
  | { type: "eventChoice"; choiceId:string }
  | { type: "eventInput"; action:Exclude<EventAction,{type:'choice'}> }
  | { type: "startRally" | "finishRally" | "endRally" }
  | { type: "rallyService"; action:ServiceAction }
  | { type:"beginHomeTask";incidentId:string }
  | { type:"homeTaskInput";action:DinerHomeTaskAction }
  | { type: "finishService" | "goHome" | "leaveNode" | "rerollShop" | "claimCrate" | "collectTill" | "harvestGarden" | "greetRegular" | "expandHome" | "settle" }
  | { type: "chooseGift"; choice: "coins" | "ingredients" | "special" }
  | { type: "buyOffer"; offerId: string }
  | { type: "upgradeRecipe"; recipeId: string }
  | { type: "buyHomeEquipment"; equipmentId: string }
  | { type: "homeLayout"; layout: HomePlacement[] }
  | { type:'homeRoomPlan';roomPlan:RoomPlan;layout?:HomePlacement[] }
  | { type:'renovateHome';stage:RestaurantStage;previewToken:string }
  | { type:'restoreRenovation';backupId:string }
  | { type:'claimCareerIngredients';achievementId:string;recipeId:string }
  | { type:'buyHomeFixture';kind:'toilet'|'handwash_sink'|'chef_bar' }
  | { type:'buyHomeStool'|'installHomeStool';style:StoolStyle }
  | { type:'upgradeHomeStool';moduleId:string;seatIndex:number }
  | { type:'returnHomeStool';moduleId:string;seatIndex:number }
  | { type:'cleanHomeFixture'|'repairHomeFixture';moduleId:string }
  | { type: "setHomeMenu"; menu: Record<Course, string[]> }
  | { type: "setTruckMenu"; recipeIds: string[] }
  | { type: "setupLayout"; stations: TruckStationPlacement[]; tables: TruckTablePlacement[] }
  | { type: "buyTruckTable"; capacity:1|2|4 }
  | { type: "buyTruckRecipe"; recipeId:string }
  | { type:'buyRecipeKit';kitId:string }
  | { type: "buyTruckEquipment" | "upgradeTruckEquipment"; equipmentId:string }
  | { type: "buyIngredient"; ingredientId: string }
  | { type: "plantGarden"; ingredientId: string }
  | { type: "hire"; role: "chef" | "waiter" }
  | { type: "settings"; cosy?: boolean; name?: string };
export type DinerCollectionCommand =
  | { type: "setSpices"; spiceIds: string[] }
  | { type: "assignHelper"; slot?:0|1; staffId: string | null; role?: "washer" | "runner" | "prep" }
  | { type: "staffMeal"; recipeId: string }
  | { type: "serveRegular"; regularId: string }
  | { type: "helpIncident"; incidentId: string }
  | { type: "buyDecor" | "sellDecor"; decorId: string }
  | { type: "buyFinish"; slot: FinishSlot; id: string }
  | { type:'buyRoomFinish'|'setRoomFinish';slot:RoomFinishSlot;id:string }
  | { type: "setCosmetic"; slot: "wrap" | "horn" | "uniform" | "floor" | "wall"; id: string }
  | { type: "skinEquipment"; placementId: string; skinId: string }
  | { type: "saveLayout"; name: string }
  | { type: "loadLayout"; layoutId: string };
export type DinerCommand = DinerCoreCommand | DinerCollectionCommand;
export interface DinerContext { now: number; online?: boolean }
export interface DinerResult { state: DinerState; error?: string; code?: string }
export function activeDinerMode(state:DinerState):'service'|'eventInput'|'rallyService'|'homeTaskInput'|null {
  if(state.run?.service&&['preparing','playing','closing'].includes(state.run.service.phase))return 'service';
  if(state.run?.event?.phase==='challenge')return 'eventInput';
  if(state.rally?.service&&['preparing','playing','closing'].includes(state.rally.service.phase))return 'rallyService';
  if(!state.run&&!state.rally?.service&&state.homeTask?.phase==='working')return 'homeTaskInput';
  return null;
}
export function dinerTickCommand(state:DinerState,ticks:number):DinerCommand|null {const type=activeDinerMode(state);return type?{type,action:{type:'tick',ticks}}:null;}
export function dinerPauseCommand(state:DinerState):DinerCommand|null {const type=activeDinerMode(state);return type?{type,action:{type:'pause'}}:null;}
export function dinerCommandTicks(command:DinerCommand):number {return ['service','rallyService','eventInput','homeTaskInput'].includes(command.type)&&'action' in command&&command.action.type==='tick'?command.action.ticks:0;}
export function dinerClockBoundary(command:DinerCommand):boolean {return command.type==='eventChoice'||(command.type==='homeTaskInput'&&['strokeStart','parcel'].includes(command.action.type))||(['service','rallyService','eventInput','homeTaskInput'].includes(command.type)&&'action' in command&&['prepare','open','resume'].includes(command.action.type));}
const COURSES: Course[] = ["starter", "main", "dessert", "drink"];
const owns=(record:object,key:PropertyKey):boolean=>Object.prototype.hasOwnProperty.call(record,key);
function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code }); }
export function dinerDay(now: number) { return Math.floor(now / DINER_RULES.dayMs); }
export function dinerHash(seed: string) { let n = 2166136261; for (let i = 0; i < seed.length; i++) n = Math.imul(n ^ seed.charCodeAt(i), 16777619); return n >>> 0; }
function random(seed: string) { let n = dinerHash(seed); return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
function ordered<T>(values: readonly T[], seed: string, key: (v: T) => string): T[] { return [...values].sort((a, b) => dinerHash(`${seed}:${key(a)}`) - dinerHash(`${seed}:${key(b)}`)); }
function dailyState(day: number, seed: string): DinerDaily { return { day, workVersion:2, crate: false, crateProgressTicks:0, market: false, garden: false, kindness: false, truckRuns: [], minted: 0, marketOffers: ordered(INGREDIENTS, `${seed}:${day}:market`, i => i.id).slice(0, 3).map(i => i.id), regularServed: [], regularProgress: {}, incidentClaims: [], staffMeal: null }; }

/** Earlier preview colors stay owned; new purchases use an explicit durable receipt. */
function normalizeFinishes(state: DinerState) {
  if (state.finishOwned === undefined) state.finishOwned = {
    floor: [...new Set([FINISH_RULES.defaults.floor, state.cosmetics.floor])],
    wall: [...new Set([FINISH_RULES.defaults.wall, state.cosmetics.wall])],
  };
  const owned = state.finishOwned;
  if (!owned || typeof owned !== "object" || Array.isArray(owned) || Object.keys(owned).some(key => key !== "floor" && key !== "wall")) fail("invalid_finishes", "These room finishes need valid ownership receipts.");
  for (const slot of ["floor", "wall"] as const) {
    const ids = owned[slot];
    if (!Array.isArray(ids) || ids.length > Object.keys(FINISH_RULES.prices[slot]).length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || finishPrice(slot, id) === null) || !ids.includes(FINISH_RULES.defaults[slot]) || !ids.includes(state.cosmetics[slot])) fail("invalid_finishes", "Keep the currently applied and default room finishes in your collection.");
  }
}

/** Legacy rooms keep their exact footprint and furnishings; no old service
 * history is inferred from wealth, mastery, stamps or completed routes. */
function normalizeStarterTrinkets(state:DinerState) {
  if(state.starterTrinkets!==undefined){
    const receipt=state.starterTrinkets;
    if(!receipt||receipt.version!==1||receipt.granted!==true||Object.keys(receipt).some(k=>k!=='version'&&k!=='granted'))fail('invalid_starter_receipt','Keep the welcome collection receipt.');
    return;
  }
  if(!state.home.roomPlan)return;
  // Only the exact untouched earlier starter is rearranged. Furniture added by
  // a player, moved modules, saved favourites and legacy square rooms stay put.
  const plan=state.home.roomPlan,blueprint=createRestaurantBlueprint('burger_shop');
  if(plan.stage==='burger_shop'&&JSON.stringify(state.home.layout)===JSON.stringify(blueprint.layout)){
    const old=structuredClone(blueprint.roomPlan),oldConsole=old.modules.find(m=>m.kind==='console')!;
    oldConsole.x=9;oldConsole.y=5;oldConsole.rotation=1;old.edges=old.edges.filter(e=>!['stall-side-0-0','stall-side-0-1'].includes(e.id));
    const comparable=(room:RoomPlan)=>({...room,modules:room.modules.map(({condition,...m})=>({...m,id:m.id.replace(/^burger_shop-/, '')}))});
    if(JSON.stringify(comparable(plan))===JSON.stringify(comparable(old))){
      const candidate=structuredClone(plan),seat=candidate.modules.find(m=>m.kind==='console')!;
      seat.x=0;seat.y=5;seat.rotation=3;
      candidate.edges.push(...structuredClone(blueprint.roomPlan.edges.filter(e=>['stall-side-0-0','stall-side-0-1'].includes(e.id))));
      const layout=alignRoomMounts(state.home.layout,candidate);
      if(!validateRoomPlan(candidate,layout)){state.home.roomPlan=candidate;state.home.layout=layout;}
    }
  }
  for(const id of STARTER_TRINKETS)state.decorOwned[id]=(state.decorOwned[id]??0)+1;
  state.starterTrinkets={version:1,granted:true};
}

function normalizeRestaurant(state:DinerState){
  normalizeStarterTrinkets(state);
  if(state.counterVersion===undefined){
    if(state.equipment.pass?.truckOwned&&state.equipment.pass.tier===1)state.equipment.pass.tier=2;
    state.counterVersion=1;
  }else if(state.counterVersion!==1)fail('invalid_counter_version','This holding counter needs its matching game version.');
  if(state.run?.service?.config)normalizeServiceAdditions(state.run.service);
  if(state.rally?.service?.config)normalizeServiceAdditions(state.rally.service);
  if(state.truckConfig.layoutVersion!==undefined&&state.truckConfig.layoutVersion!==2)fail('invalid_truck_layout','This truck layout version is unavailable.');
  state.truckConfig.layoutVersion=2;
  if(!Number.isSafeInteger(state.home.staff.cashiers??0)||(state.home.staff.cashiers??0)<0||(state.home.staff.cashiers??0)>8)fail('invalid_staff','Keep a valid cashier roster.');
  state.career??=createDinerCareer(state.updatedAt);if(!sanitizeDinerCareer(state.career))fail('invalid_career','This career needs valid service receipts.');
  state.recipeProgression??=createRecipeProgression();if(!sanitizeRecipeProgression(state.recipeProgression)||state.recipeProgression.claimedKits.some(id=>{const kit=RECIPE_KITS.find(kit=>kit.kitId===id)!;return !owns(state.recipes,kit.recipeId)||kit.equipmentIds.some(equipmentId=>!state.equipment[equipmentId]?.truckOwned);}))fail('invalid_recipe_progression','Keep valid recipe discovery receipts and their owned equipment.');
  state.renovation??=createRenovationState();
  const renovation=state.renovation;
  renovation.styleKitGranted??=[];
  if(!Array.isArray(renovation.styleKitGranted)||renovation.styleKitGranted.length>3||new Set(renovation.styleKitGranted).size!==renovation.styleKitGranted.length||renovation.styleKitGranted.some(stage=>!Object.hasOwn(RESTAURANT_STAGES,stage)))fail('invalid_style_receipt','Keep valid restaurant welcome kit receipts.');
  normalizeFinishes(state);
  if(renovation.surfaceGifts!==undefined&&(!renovation.surfaceGifts||typeof renovation.surfaceGifts!=='object'||Array.isArray(renovation.surfaceGifts)||Object.keys(renovation.surfaceGifts).some(slot=>!['floor','wall'].includes(slot))||Object.entries(renovation.surfaceGifts).some(([slot,ids])=>!Array.isArray(ids)||ids.length>2||new Set(ids).size!==ids.length||ids.some(id=>!(slot==='floor'?['wood','terrazzo']:['diner_panel','deco']).includes(id)||!state.finishOwned[slot as FinishSlot].includes(id)))))fail('invalid_surface_receipt','Keep valid records for the surfaces included with your renovations.');
  const stage=state.home.roomPlan?.stage;
  if(stage&&!renovation.styleKitGranted.includes(stage)){
    // Existing rooms receive their new keepsakes in storage. Only an explicit
    // renovation places the kit or changes the selected floor and wall finish.
    for(const id of stageDecorIds(stage))state.decorOwned[id]=Math.min(MAX_DECOR_COPIES,(state.decorOwned[id]??0)+1);
    const kit=stageFinishKit(state,stage);for(const slot of ['floor','wall'] as const){const gifts=(kit.finishOwned[slot]??[]).filter(id=>id!==FINISH_RULES.defaults[slot]);state.finishOwned[slot].push(...(kit.finishOwned[slot]??[]));if(gifts.length){renovation.surfaceGifts??={};renovation.surfaceGifts[slot]=[...new Set([...(renovation.surfaceGifts[slot]??[]),...gifts])];}}
    renovation.styleKitGranted.push(stage);
  }
  if(state.home.stools===undefined){
    // Pre-stool-inventory saves keep every formerly rendered seat, including
    // their preserved layouts. A renovation never silently downgrades an owner.
    const rooms=[state.home.roomPlan,...(renovation.backups??[]).map(b=>b.roomPlan),...(state.savedLayouts??[]).map(s=>s.room?.roomPlan)],stock:StoolInventory={classic:3,diner:0};
    for(const plan of rooms){const used=installedStools(plan);for(const style of ['classic','diner'] as const)stock[style]=Math.max(stock[style],used[style]);}
    state.home.stools=stock;
  }
  if(!state.home.stools||Object.keys(state.home.stools).some(k=>!['classic','diner'].includes(k))||!['classic','diner'].every(k=>Number.isSafeInteger(state.home.stools![k as StoolStyle])&&state.home.stools![k as StoolStyle]>=0&&state.home.stools![k as StoolStyle]<=100))fail('invalid_stools','Keep valid stool ownership.');
  if(renovation.dinerPaletteGranted!==undefined&&renovation.dinerPaletteGranted!==true)fail('invalid_palette_receipt','Keep the diner palette gift receipt.');
  if(renovation.boothGrant!==undefined){const receipt=renovation.boothGrant;if(!receipt||receipt.version!==1||receipt.granted!==true||Object.keys(receipt).some(k=>k!=='version'&&k!=='granted'))fail('invalid_booth_receipt','Keep the diner booth gift receipt.');}
  // Established diners keep their chosen layout. Their new welcome booth waits
  // in storage, with the same once-only receipt used by new renovations.
  if(!renovation.boothGrant&&(state.home.roomPlan?.stage==='diner'||state.home.roomPlan?.stage==='restaurant'||renovation.completed?.includes('diner'))){
    state.equipment.booth_2??={tier:1,truckOwned:false,homeCopies:0};state.equipment.booth_2.homeCopies++;
    renovation.boothGrant={version:1,granted:true};
  }
  if(renovation.version!==1||!Array.isArray(renovation.completed)||new Set(renovation.completed).size!==renovation.completed.length||renovation.completed.some(s=>!Object.hasOwn(RESTAURANT_STAGES,s))||!Array.isArray(renovation.backups)||renovation.backups.length>3||!renovation.baseline||!Number.isSafeInteger(renovation.baseline.services)||renovation.baseline.services<0||renovation.baseline.services>state.career.services||!renovation.baseline.byDifficulty||!renovation.baseline.multiRecipe||Object.values(renovation.baseline.byDifficulty).some(v=>!Number.isSafeInteger(v)||v<0)||!['two','three'].every(k=>Number.isSafeInteger(renovation.baseline.multiRecipe[k as 'two'|'three'])&&renovation.baseline.multiRecipe[k as 'two'|'three']>=0))fail('invalid_renovation','This renovation needs a valid room snapshot.');
  if(!Number.isSafeInteger(renovation.baseline.introductory)||renovation.baseline.introductory<0||renovation.baseline.introductory>state.career.introductory||new Set(renovation.backups.map(b=>b?.id)).size!==renovation.backups.length)fail('invalid_renovation','Keep consistent career and room snapshots.');
  for(const backup of renovation.backups){if(!backup||typeof backup.id!=='string'||backup.id.length>100||!Number.isSafeInteger(backup.at)||backup.at<0||!Number.isInteger(backup.expansion)||backup.expansion<0||backup.expansion>3||!backup.staff||![backup.staff.chefs,backup.staff.waiters].every(n=>Number.isInteger(n)&&n>=1&&n<=8)||!Number.isInteger(backup.staff.cashiers??0)||(backup.staff.cashiers??0)<0||(backup.staff.cashiers??0)>8||(backup.roomPlan?backup.w!==backup.roomPlan.w||backup.h!==backup.roomPlan.h||backup.stage!==backup.roomPlan.stage:backup.stage!==null||![8,10,12,14].includes(backup.w)||backup.h!==backup.w)||validateDinerHome({...state,home:{...state.home,w:backup.w,h:backup.h,roomPlan:backup.roomPlan}},backup.layout))fail('invalid_snapshot','A preserved room needs valid owned furnishings and dimensions.');}
  state.savedLayouts??=[];
  if(!Array.isArray(state.savedLayouts)||state.savedLayouts.length>3)fail('invalid_layouts','Keep up to three saved room arrangements.');
  for(const saved of state.savedLayouts){if(!saved||typeof saved!=='object')fail('invalid_layouts','Keep valid saved room arrangements.');saved.room??={w:state.home.w,h:state.home.h,roomPlan:state.home.roomPlan?structuredClone(state.home.roomPlan):undefined};}
  state.home.finishes??={...ROOM_FINISH_DEFAULTS};state.paletteOwned??=Object.fromEntries(Object.entries(ROOM_FINISH_DEFAULTS).map(([slot,id])=>[slot,[id]])) as Record<RoomFinishSlot,string[]>;
  for(const slot of Object.keys(ROOM_PALETTES) as RoomFinishSlot[]){const ids=state.paletteOwned[slot];if(!Array.isArray(ids)||ids.length>ROOM_PALETTES[slot].length||new Set(ids).size!==ids.length||ids.some(id=>roomFinishPrice(slot,id)===null)||!ids.includes(ROOM_FINISH_DEFAULTS[slot])||!ids.includes(state.home.finishes[slot]))fail('invalid_palette','Keep purchased room colours in your collection.');}
  if(!renovation.dinerPaletteGranted&&(state.home.roomPlan?.stage==='diner'||state.home.roomPlan?.stage==='restaurant'||renovation.completed.includes('diner'))){
    const kit=dinerFinishKit(state);for(const slot of Object.keys(kit.includedPalette) as RoomFinishSlot[])state.paletteOwned[slot].push(...kit.includedPalette[slot]!);
    if(state.home.roomPlan?.stage==='diner')state.home.finishes=kit.finishes;
    renovation.dinerPaletteGranted=true;
  }
  for(const backup of renovation.backups)if(backup.cosmetics&&!['floor','wall'].every(slot=>state.finishOwned[slot as FinishSlot].includes(backup.cosmetics![slot as FinishSlot])))fail('invalid_snapshot','Keep owned surfaces in the renovation snapshot.');
  for(const backup of renovation.backups)if(backup.finishes&&(Object.keys(backup.finishes).length!==Object.keys(ROOM_PALETTES).length||Object.entries(backup.finishes).some(([slot,id])=>!Object.hasOwn(ROOM_PALETTES,slot)||!state.paletteOwned![slot as RoomFinishSlot].includes(id))))fail('invalid_snapshot','Keep owned room finishes in the renovation snapshot.');
  if(state.home.roomPlan){
    if(state.home.w!==state.home.roomPlan.w||state.home.h!==state.home.roomPlan.h||validateRoomPlan(state.home.roomPlan,state.home.layout)||stoolOwnershipError(state.home.roomPlan,state.home.stools))fail('invalid_room_plan','Keep a valid restaurant floor plan.');
    state.home.fixtureInventory??=fixtureInventoryFor(state.home.roomPlan);
    for(const module of state.home.roomPlan.modules){const owned=state.home.fixtureInventory[module.id];if(!owned||owned.kind!==module.kind)fail('fixture_not_owned','Keep owned room fixtures in the plan.');if(module.width!==owned.width)fail('fixture_not_owned','Keep the owned counter size.');if(['toilet','handwash_sink'].includes(module.kind))module.condition=owned.condition;else delete module.condition;}
  }
  if(state.home.fixtureInventory&&(Object.keys(state.home.fixtureInventory).length>100||Object.entries(state.home.fixtureInventory).some(([id,item])=>!/^[A-Za-z0-9_-]{1,80}$/.test(id)||!item||!Object.hasOwn(ROOM_FIXTURES,item.kind)||!Number.isFinite(item.condition)||item.condition<0||item.condition>100||(item.width!==undefined&&(item.kind!=='display_counter'||![3,4].includes(item.width))))))fail('invalid_fixture','Keep valid fixture ownership and condition.');
}

function validateSavedRoomLayout(state:DinerState,saved:SavedDinerLayout):string|null {
  const room=saved.room;if(!room)return 'Keep the original room context.';
  if(room.roomPlan?room.w!==room.roomPlan.w||room.h!==room.roomPlan.h:![8,10,12,14].includes(room.w)||room.h!==room.w)return 'Keep valid saved room dimensions.';
  return validateDinerHome({...state,home:{...state.home,...room,roomPlan:room.roomPlan}},saved.layout);
}

/** Additive migration for canonical server JSON. This does not settle time,
 * replace legacy rooms, pause a running service, or create historical rewards. */
export function migrateDinerRestaurant(input:DinerState):DinerState {
  const state=structuredClone(input);
  normalizeRestaurant(state);
  if(!state.run)routeTier(state);
  return state;
}

/** The one-seat design is basic equipment, but learning it grants no physical copies. */
function normalizeStarterEquipment(state: DinerState) {
  if (!owns(state.equipment, "table_1")) state.equipment.table_1 = { tier: 1, truckOwned: true, homeCopies: 0 };
}

/** Preserve completion receipts and partial percentages when shortening the old 60/80-tick chores. */
function normalizeHomeWork(state:DinerState){
  if(state.daily.workVersion===2){state.daily.crateProgressTicks??=state.daily.crate?DINER_RULES.incidentWorkTicks.delivery:0;return;}
  if(state.daily.workVersion!==undefined&&state.daily.workVersion!==1)fail('invalid_home_work','This restaurant job needs its matching version.');
  const oldCrate=state.daily.crateProgressTicks??(state.daily.crate?80:0);
  if(!Number.isSafeInteger(oldCrate)||oldCrate<0||oldCrate>80||state.daily.crate!==(oldCrate===80))fail('invalid_home_work','The parcel receipt is incomplete.');
  const scale=(value:number,oldTotal:number,total:number)=>Math.min(total-1,Math.floor(value*total/oldTotal));
  state.daily.crateProgressTicks=state.daily.crate?DINER_RULES.incidentWorkTicks.delivery:scale(oldCrate,80,DINER_RULES.incidentWorkTicks.delivery);
  if(state.homeTask){
    const task=state.homeTask,isCrate=task.incidentId===`crate:${state.daily.day}`,isSpill=task.incidentId===`incident:${state.daily.day}:0`;
    const oldTotal=isSpill?60:80,total=isSpill?DINER_RULES.incidentWorkTicks.spill:DINER_RULES.incidentWorkTicks.delivery;
    if(!Number.isSafeInteger(task.progressTicks)||task.progressTicks<0||task.progressTicks>=oldTotal||(isCrate&&task.progressTicks!==oldCrate))fail('invalid_home_work','The saved job progress is incomplete.');
    task.progressTicks=scale(task.progressTicks,oldTotal,total);
    const oldCredit=task.gesture?.creditTicks??0,credit=Math.max(0,Math.floor((Number.isFinite(oldCredit)?oldCredit:0)*total/oldTotal));
    const limit=isSpill?HOME_GESTURE_RULES.maxCreditTicks:parcelStageEnd(parcelStage(task.progressTicks,total),total)-task.progressTicks;
    task.gesture={point:task.gesture?.point??null,creditTicks:Math.min(limit,credit),remainder:0};
    if(!isSpill&&task.phase==='working'&&task.gesture.creditTicks===0)task.phase='ready';
  }
  state.daily.workVersion=2;
}

function applyTutorialStops(map:DinerNode[],correctNames=false){
  for(const node of map){
    if(node.row<2){node.kind='slow';if(correctNames)node.name='A quiet lunch';}
    else if(node.row===2){node.kind='bonus';if(correctNames)node.name='A little surprise';}
    else if(node.row===3){node.kind='busy';if(correctNames)node.name='Lunch rush';}
  }
}
export function generateDinerMap(seed: string,version:1|2|3=3): DinerNode[] {
  if (version === 3) {
    const roll = random(seed), firstMarket = roll() < .5 ? 0 : 1, secondMarket = roll() < .5 ? 0 : 1;
    const secondRush: NodeKind = roll() < .5 ? "busy" : "special";
    const fork = (market: number, marketKind: NodeKind, otherKind: NodeKind): NodeKind[] => market === 0 ? [marketKind, otherKind] : [otherKind, marketKind];
    // Commit to three stops at each main fork: no lane changes before its merge.
    // Seven service rows and five roadside stops keep the existing run structure.
    const kinds: NodeKind[][] = [
      ["slow"], ["slow"],
      fork(firstMarket, "event", "bonus"), fork(firstMarket, "busy", "medium"), fork(firstMarket, "shop", "ingredients"),
      ["medium"],
      fork(secondMarket, "ingredients", "bonus"), fork(secondMarket, secondRush, "medium"), fork(secondMarket, "shop", "event"),
      [roll() < .5 ? "busy" : "special"],
      roll() < .5 ? ["shop", "bonus"] : ["bonus", "shop"], ["finale"],
    ];
    const names: Record<NodeKind, string> = { slow: "A quiet lunch", medium: "Around the corner", busy: "Lunch rush", special: "Something different", shop: "Roadside market", bonus: "A little surprise", event: "A familiar face", ingredients: "Farm stand", finale: "The grand finale" };
    const rows: DinerNode[][] = kinds.map((row, index) => row.map((kind, column) => ({ id: `r${index}c${column}`, row: index, column, kind, next: [], name: names[kind] })));
    rows.slice(0, -1).forEach((row, index) => row.forEach(node => {
      const next = rows[index + 1];
      node.next = row.length === 2 && next.length === 2 ? [next[node.column].id] : next.map(n => n.id);
    }));
    return rows.flat();
  }
  const roll = random(seed), rows: DinerNode[][] = [];
  const serviceKinds:NodeKind[]=["medium","busy","special"],stopKinds:NodeKind[]=["shop","bonus","event","ingredients"];
  const legacyKinds:NodeKind[]=['medium','busy','shop','bonus','event','ingredients','special'];
  for (let row = 0; row < 12; row++) {
    const count = row === 11 ? 1 : 2 + Math.floor(roll() * 3);
    rows.push(Array.from({ length: count }, (_, column) => {
      // Every ordinary twelve-row path contains exactly seven services and five stops.
      const kind:NodeKind=version===1?(row===11?'finale':row===0?'slow':row<3?(column===0?'slow':'bonus'):row===3?'shop':legacyKinds[Math.floor(roll()*legacyKinds.length)]):row===11?'finale':row<2?'slow':row===2?(column===0?'bonus':'event'):row===4?'shop':row%2===1?serviceKinds[Math.floor(roll()*serviceKinds.length)]:stopKinds[Math.floor(roll()*stopKinds.length)];
      return { id: `r${row}c${column}`, row, column, kind, next: [], name: ({ slow: "A quiet lunch", medium: "Around the corner", busy: "Lunch rush", special: "Something different", shop: "Roadside market", bonus: "A little surprise", event: "A familiar face", ingredients: "Farm stand", finale: "The grand finale" })[kind] };
    }));
  }
  rows.slice(0, -1).forEach((row, index) => row.forEach(node => {
    const next = rows[index + 1], centre = Math.round(node.column * (next.length - 1) / Math.max(1, row.length - 1));
    node.next = next.filter(n => Math.abs(n.column - centre) <= 1).map(n => n.id);
  }));
  return rows.flat();
}

export function createDiner(now: number, seed = "street-eats-preview"): DinerState {
  const time = Number.isSafeInteger(now) && now >= 0 ? now : 0;
  const starter = buildServiceLoadout(1, ["classic_burger"]);
  const blueprint=createRestaurantBlueprint('burger_shop');
  return { version: 1, contentVersion: CONTENT_VERSION, counterVersion:1, seed, createdAt: time, updatedAt: time, coins: DINER_RULES.starterCoins, reputation: 0, restaurantLevel: 1, truckTier: 1, runsStarted: 0,
    career:createDinerCareer(time),recipeProgression:createRecipeProgression(),renovation:{...createRenovationState('burger_shop'),styleKitGranted:['burger_shop']},paletteOwned:Object.fromEntries(Object.entries(ROOM_FINISH_DEFAULTS).map(([slot,id])=>[slot,[id]])) as Record<RoomFinishSlot,string[]>,
    recipes: { classic_burger: { level: 0 } }, pantry: {},
    equipment: Object.fromEntries(["crate", "fridge", "plates", "grill", "prep", "sink", "bin", "table_1", "table_2", "fryer"].map(id => [id, { tier: 1, truckOwned: id!=="fryer", homeCopies: ["table_1","table_2","fryer","crate","bin","fridge","plates"].includes(id) ? 0 : 1 }])),
    decorOwned: Object.fromEntries(STARTER_TRINKETS.map(id=>[id,1])), starterTrinkets:{version:1,granted:true}, cosmetics: { wrap: "tomato", horn: "quiet", uniform: "classic", floor: "checker", wall: "cream" }, finishOwned: { floor: [FINISH_RULES.defaults.floor], wall: [FINISH_RULES.defaults.wall] }, staffMembers: [{ id: "chef-1", name: "Charlie", role: "chef", named: false, outfit: "classic", look: 0 }, { id: "waiter-1", name: "Robin", role: "waiter", named: false, outfit: "classic", look: 1 },{id:'cashier-1',name:'Jules',role:'cashier',named:false,outfit:'classic',look:2}], savedLayouts: [],
    truckConfig: { stations: starter.stations.filter(s=>['crate','fridge','plates','sink','bin'].includes(s.kind)).map(({ id, kind, x, y, facing }) => ({ id, kind, x:kind==='fridge'||kind==='plates'?3:kind==='bin'?2:x, y:kind==='fridge'?0:kind==='plates'?2:kind==='bin'?4:y, facing:kind==='fridge'||kind==='bin'?0:kind==='plates'?2:facing })), tables: [{id:'table_1',x:3,y:5,capacity:1,rotation:0}], tableCopies:{table_1:1,table_2:0,table_4:0}, supplyVersion:1, menuVersion:2, layoutVersion:2, layoutTier: 1, menu: ["classic_burger"], helperId: null, helperRole: "washer", helperId2: null, helperRole2: "washer", spices: [] },
    home: { w: blueprint.roomPlan.w, h: blueprint.roomPlan.h, expansion: 0, name: "My little burger shop", layout:[...blueprint.layout,...starterTrinketLayout(blueprint.roomPlan)],roomPlan:blueprint.roomPlan,fixtureInventory:fixtureInventoryFor(blueprint.roomPlan),stools:{classic:3,diner:0},finishes:{...ROOM_FINISH_DEFAULTS},
      menu: { main: ["classic_burger"], starter: [], drink: [], dessert: [] }, staff:blueprint.staff, till: { coins: 0, reputation: 0, lastAt: time, capacityHours: DINER_RULES.tillHours, filledMs: 0 }, garden: { plantedAt: time, ingredientId: "tomato" } },
    buzz: [], run: null,rally:createRally(time),homeTask:null, lastRun: null, tutorial: { stage: 0, finished: false, fryerGifted: false, crateClaimed: false }, daily: dailyState(dinerDay(time), seed), collections: { regulars: { old_pete: 0 }, stamps: [], trophies: [], scraps: {}, mementos: [], routeWins: [] }, settings: { cosy: false } };
}

/** Local preview checkpoint validation only. Online accounts never import this
 * as earned progress. Invalid checkpoints return null so callers can preserve
 * the original and offer recovery, instead of silently resetting possessions. */
export function sanitizeDinerSave(raw: unknown): DinerState | null {
  try {
    if (typeof raw === "string") { if (raw.length > 1_000_000) return null; raw = JSON.parse(raw); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || JSON.stringify(raw).length > 1_000_000) return null;
    const state = structuredClone(raw) as DinerState;
    const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
    const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max;
    const strings = (v: unknown, max = 1000): v is string[] => Array.isArray(v) && v.length <= max && v.every(s => typeof s === "string" && s.length <= 200);
    if (state.version !== 1 || state.contentVersion !== CONTENT_VERSION || typeof state.seed !== "string" || state.seed.length > 200 || ![state.createdAt, state.updatedAt, state.coins, state.reputation, state.restaurantLevel, state.runsStarted].every(v => integer(v)) || ![1, 2, 3, 4].includes(state.truckTier)) return null;
    const defaults = createDiner(state.createdAt, state.seed);
    // This only fills presentation/config fields from earlier checkpoints of
    // this new preview. It never imports or converts a legacy Domain Kitchen save.
    state.decorOwned ??= {}; state.cosmetics ??= defaults.cosmetics; state.staffMembers ??= defaults.staffMembers;
    if(!state.truckConfig){const legacyMenu=['classic_burger','fries'].filter(id=>state.recipes?.[id]);const legacy=buildServiceLoadout(1,legacyMenu);state.truckConfig={...defaults.truckConfig,menu:legacyMenu,stations:legacy.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing})),tables:legacy.tables.map(({id,x,y,capacity,rotation})=>({id,x,y,capacity,rotation}))};delete (state.truckConfig as Partial<DinerState['truckConfig']>).tableCopies;delete state.truckConfig.supplyVersion;delete state.truckConfig.menuVersion;}
    state.savedLayouts ??= [];
    if(object(state.truckConfig)){state.truckConfig.helperId2??=null;state.truckConfig.helperRole2??="washer";}
    state.rally??=createRally(state.updatedAt);state.homeTask??=null;
    if(!object(state.rally)||state.rally.version!==1||typeof state.rally.weekId!=='string'||typeof state.rally.seed!=='string'||![state.rally.bestScore,state.rally.attempts,state.rally.completed].every(n=>integer(n))||typeof state.rally.badge!=='boolean'||(state.rally.lastScore!==null&&!integer(state.rally.lastScore)))return null;
    if(state.rally.service){const restored=sanitizeService(state.rally.service);if(!restored||!restored.config.practice)return null;state.rally.service=restored;}
    if (!object(state.recipes) || !Object.entries(state.recipes).every(([id, r]) => Object.prototype.hasOwnProperty.call(RECIPE_BY_ID, id) && object(r) && integer(r.level, 10)) || !object(state.pantry) || !Object.entries(state.pantry).every(([id, count]) => Object.prototype.hasOwnProperty.call(INGREDIENT_BY_ID, id) && integer(count))) return null;
    if (!object(state.equipment) || !Object.entries(state.equipment).every(([id, e]) => owns(EQUIPMENT_BY_ID,id) && object(e) && integer(e.tier, EQUIPMENT_BY_ID[id].tiers.length) && e.tier >= 1 && typeof e.truckOwned === "boolean" && integer(e.homeCopies))) return null;
    normalizeTruckPolicy(state);
    if (!object(state.decorOwned) || !Object.entries(state.decorOwned).every(([id, count]) => owns(DECOR_BY_ID,id) && integer(count, MAX_DECOR_COPIES)) || !object(state.cosmetics) || ![COSMETICS.wraps.includes(state.cosmetics.wrap as typeof COSMETICS.wraps[number]), COSMETICS.horns.includes(state.cosmetics.horn as typeof COSMETICS.horns[number]), COSMETICS.uniforms.includes(state.cosmetics.uniform as typeof COSMETICS.uniforms[number]), COSMETICS.floors.includes(state.cosmetics.floor as typeof COSMETICS.floors[number]), COSMETICS.walls.includes(state.cosmetics.wall as typeof COSMETICS.walls[number])].every(Boolean)) return null;
    normalizeFinishes(state);
    if (!Array.isArray(state.staffMembers) || state.staffMembers.length > 11 || new Set(state.staffMembers.map(member => member.id)).size !== state.staffMembers.length || state.staffMembers.some(member => !member || typeof member.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(member.id) || typeof member.name !== "string" || member.name.length > 40 || !["chef", "waiter", "cashier"].includes(member.role) || typeof member.named !== "boolean" || !integer(member.look, 7) || !(COSMETICS.uniforms as readonly string[]).includes(member.outfit))) return null;
    if (!object(state.truckConfig) || !["washer", "runner", "prep"].includes(state.truckConfig.helperRole2) || (state.truckConfig.helperId2!==null&&(!state.staffMembers.some(member=>member.id===state.truckConfig.helperId2)||state.truckConfig.helperId2===state.truckConfig.helperId)) || !validTruckMenu(state, state.truckConfig.menu) || ![1, 2, 3, 4].includes(state.truckConfig.layoutTier) || !["washer", "runner", "prep"].includes(state.truckConfig.helperRole) || (state.truckConfig.helperId !== null && !state.staffMembers.some(member => member.id === state.truckConfig.helperId)) || !strings(state.truckConfig.spices, 5) || state.truckConfig.spices.some(id => !(SPICES as readonly string[]).includes(id))) return null;
    normalizeTruckStorage(state);
    normalizeStarterEquipment(state);
    ownedTruckLayout({ ...state, truckTier: state.truckConfig.layoutTier }, state.truckConfig);
    const home = state.home;
    if (!object(home) || (home.roomPlan ? !Object.hasOwn(RESTAURANT_STAGES,home.roomPlan.stage) || home.w !== RESTAURANT_STAGES[home.roomPlan.stage].w || home.h !== RESTAURANT_STAGES[home.roomPlan.stage].h : ![8, 10, 12, 14].includes(home.w) || home.h !== home.w) || !integer(home.expansion, 3) || typeof home.name !== "string" || home.name.length > 24 || !object(home.menu) || COURSES.some(course => !strings(home.menu[course], 3) || home.menu[course].some(id => !state.recipes[id] || RECIPE_BY_ID[id].course !== course)) || !object(home.staff) || ![home.staff.chefs, home.staff.waiters].every(v => integer(v, 8) && v >= 1) || !object(home.till) || ![home.till.coins, home.till.reputation].every(v => Number.isFinite(v) && v >= 0) || !integer(home.till.lastAt) || home.till.capacityHours !== DINER_RULES.tillHours || !Number.isFinite(home.till.filledMs) || home.till.filledMs < 0 || home.till.filledMs > DINER_RULES.tillHours * DINER_RULES.hourMs || !object(home.garden) || !integer(home.garden.plantedAt) || !owns(INGREDIENT_BY_ID,home.garden.ingredientId)) return null;
    normalizeRestaurant(state);
    if (validateDinerHome(state, home.layout)) return null;
    if (!Array.isArray(state.buzz) || state.buzz.length > 10 || !state.buzz.every(t => integer(t)) || !object(state.daily) || !integer(state.daily.day) || !integer(state.daily.minted, 7) || !strings(state.daily.truckRuns, 2) || !strings(state.daily.marketOffers, 3) || state.daily.marketOffers.some(id => !owns(INGREDIENT_BY_ID,id)) || ![state.daily.crate, state.daily.market, state.daily.garden, state.daily.kindness].every(v => typeof v === "boolean")) return null;
    state.daily.regularServed ??= []; state.daily.regularProgress ??= {}; state.daily.incidentClaims ??= []; state.daily.staffMeal ??= null;
    normalizeHomeWork(state);
    if(!integer(state.daily.crateProgressTicks,DINER_RULES.incidentWorkTicks.delivery)||state.daily.crate!==(state.daily.crateProgressTicks===DINER_RULES.incidentWorkTicks.delivery))return null;
    if (!strings(state.daily.regularServed, 8) || state.daily.regularServed.some(id => !REGULARS.some(member => member.id === id)) || !object(state.daily.regularProgress) || Object.entries(state.daily.regularProgress).some(([id, count]) => !REGULARS.some(member => member.id === id) || !Number.isFinite(count) || count < 0 || count > DINER_RULES.regularDailyServings) || !strings(state.daily.incidentClaims, 2) || (state.daily.staffMeal !== null && (!owns(state.recipes,state.daily.staffMeal)||!owns(RECIPE_BY_ID,state.daily.staffMeal)))) return null;
    if (!Array.isArray(state.savedLayouts) || state.savedLayouts.length > 3 || state.savedLayouts.some(saved => !saved || typeof saved.id !== "string" || typeof saved.name !== "string" || saved.name.length > 24 || validateSavedRoomLayout(state, saved) || !saved.menu || COURSES.some(course => !strings(saved.menu[course], 3) || saved.menu[course].some(id => !state.recipes[id] || RECIPE_BY_ID[id]?.course !== course)))) return null;
    if (!object(state.tutorial) || !integer(state.tutorial.stage, 10) || ![state.tutorial.finished, state.tutorial.fryerGifted, state.tutorial.crateClaimed].every(v => typeof v === "boolean") || !object(state.settings) || typeof state.settings.cosy !== "boolean") return null;
    if (!object(state.collections) || ![state.collections.stamps, state.collections.trophies, state.collections.mementos, state.collections.routeWins].every(v => strings(v)) || !object(state.collections.regulars) || !Object.values(state.collections.regulars).every(v => integer(v)) || !object(state.collections.scraps) || !Object.values(state.collections.scraps).every(v => integer(v))) return null;
    if (state.lastRun !== null && (!object(state.lastRun) || typeof state.lastRun.id !== "string" || !["home", "failed", "won"].includes(state.lastRun.reason) || ![state.lastRun.banked, state.lastRun.lost, state.lastRun.serviceDays].every(v => integer(v)) || !strings(state.lastRun.recipes) || !strings(state.lastRun.equipment))) return null;
    if (state.run !== null) {
      const run = state.run;
      run.practice ??= false;
      run.mapVersion??=1;run.event??=null;run.nextService??=null;run.serviceEffect??=null;run.lastEventResult??=null;
      if (!object(run) || typeof run.id !== "string" || run.id.length > 100 || typeof run.seed !== "string" || run.seed.length > 200 || !ROUTES.some(r => r.id === run.routeId) || run.contentVersion !== CONTENT_VERSION || !integer(run.haul) || !integer(run.strikes, 5) || !integer(run.serviceDays, 12) || typeof run.tutorial !== "boolean" || typeof run.qualified !== "boolean" || typeof run.ingredientClaimed !== "boolean" || typeof run.rerolled !== "boolean" || typeof run.practice !== "boolean") return null;
      if (!Array.isArray(run.map) || run.map.length > 48 || !strings(run.available, 4) || !strings(run.visited, 12) || !strings(run.menu, 4) || run.menu.some(id => !state.recipes[id]) || !strings(run.specials, 3) || !strings(run.spices, 5)) return null;
      if(![1,2,3].includes(run.mapVersion)||(run.discoveryVersion!==undefined&&run.discoveryVersion!==2))return null;const map = generateDinerMap(run.seed,run.mapVersion);if(run.tutorial)applyTutorialStops(map,run.mapVersion===3);
      // The first v3 tutorial saved forced kinds with the original branch names.
      // Accept that exact earlier map and correct its labels without changing
      // links, available stops, service state, haul or either legacy map version.
      if(run.tutorial&&run.mapVersion===3&&JSON.stringify(map)!==JSON.stringify(run.map)){
        const earlier=generateDinerMap(run.seed,3);applyTutorialStops(earlier);
        if(JSON.stringify(earlier)===JSON.stringify(run.map))run.map=map;
      }
      if (JSON.stringify(map) !== JSON.stringify(run.map) || [...run.available, ...run.visited, ...(run.position ? [run.position] : [])].some(id => !map.some(node => node.id === id))) return null;
      if (!Array.isArray(run.offers) || run.offers.length > 7 || !run.offers.every(o => object(o) && typeof o.id === "string" && typeof o.target === "string" && ["recipe", "equipment", "upgrade", "ingredients"].includes(o.kind) && integer(o.price) && typeof o.purchased === "boolean") || !object(run.serviceAccounted) || !Object.values(run.serviceAccounted).every(v => integer(v))) return null;
      if (run.service !== null) { const restored = sanitizeService(run.service); if (!restored || run.serviceAccounted.coins > restored.coins || run.serviceAccounted.strikes > restored.strikes) return null; run.service = restored; }
      if(run.event){const restored=sanitizeDinerEvent(run.event);if(!restored)return null;run.event=restored;}
      for(const effect of [run.nextService,run.serviceEffect])if(effect&&!['festival','rain','rival','film'].includes(effect.kind))return null;
    }
    if(state.homeTask!==null){
      const task=state.homeTask,incident=homeTaskTarget(state,task.incidentId);
      if(!object(task)||!incident||!integer(task.progressTicks,incident.requiredTicks-1)||!['ready','working','paused'].includes(task.phase))return null;
      if(incident.kind==='crate'&&task.progressTicks!==state.daily.crateProgressTicks)return null;
      if(task.phase==='working')task.phase='paused';
      task.gesture=emptyHomeGesture();
    }
    if(!state.run)routeTier(state);
    return state;
  } catch { return null; }
}
export const parseDinerSave = sanitizeDinerSave;

function footprint(p: HomePlacement): { x: number; y: number }[] {
  if(p.mount)return [];
  const size = (EQUIPMENT_BY_ID[p.equipmentId] ?? DECOR_BY_ID[p.equipmentId])?.footprint; if (!size) return [];
  const [w, h] = p.rotation % 2 ? [size[1], size[0]] : size;
  return Array.from({ length: w * h }, (_, i) => ({ x: p.x + i % w, y: p.y + Math.floor(i / w) }));
}
export function validateDinerHome(state: DinerState, layout: HomePlacement[]): string | null {
  if (!Array.isArray(layout) || layout.length > state.home.w * state.home.h) return "Choose furnishings that fit inside your diner.";
  const occupied = new Set<string>(), mats = new Set<string>(), ids = new Set<string>(), counts: Record<string, number> = {}, door = `${Math.floor(state.home.w / 2)},${state.home.h - 1}`;
  for (const p of layout) {
    if (!p || typeof p.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) || ids.has(p.id) || !(EQUIPMENT_BY_ID[p.equipmentId] ?? DECOR_BY_ID[p.equipmentId]) || !Number.isInteger(p.x) || !Number.isInteger(p.y) || ![0, 1, 2, 3].includes(p.rotation) || (p.skin !== undefined && !COSMETICS.skins.includes(p.skin as typeof COSMETICS.skins[number])) || Object.keys(p).some(k => !["id", "equipmentId", "x", "y", "rotation", "skin", "mount"].includes(k))) return "Choose a valid furnishing and rotation.";
    if(p.mount&&(!state.home.roomPlan||!owns(DECOR_BY_ID,p.equipmentId)||!['wall','counter','ceiling'].includes(p.mount.kind)||typeof p.mount.targetId!=='string'||!Number.isInteger(p.mount.slot)||p.mount.slot<0||Object.keys(p.mount).some(k=>!['kind','targetId','slot'].includes(k))))return "Choose a valid room mounting position.";
    if(DECOR_BY_ID[p.equipmentId]?.ceiling&&(!state.home.roomPlan||p.mount?.kind!=='ceiling'))return 'Hang ceiling decorations from a ceiling position in a renovated room.';
    ids.add(p.id); counts[p.equipmentId] = (counts[p.equipmentId] ?? 0) + 1;
    if (counts[p.equipmentId] > (state.equipment[p.equipmentId]?.homeCopies ?? state.decorOwned[p.equipmentId] ?? 0)) return "Buy a home copy before placing it.";
    const passable=DECOR_BY_ID[p.equipmentId]?.passable===true;
    for (const c of footprint(p)) { const key = `${c.x},${c.y}`; if (c.x < 0 || c.y < 0 || c.x >= state.home.w || c.y >= state.home.h || (passable?mats.has(key):occupied.has(key)||key===door)) return "Leave every furnishing and the entrance clear."; (passable?mats:occupied).add(key); }
  }
  const reachable = new Set<string>([door]), queue = [{ x: Math.floor(state.home.w / 2), y: state.home.h - 1 }];
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = { x: queue[i].x + dx, y: queue[i].y + dy }, key = `${c.x},${c.y}`;
    if (c.x >= 0 && c.y >= 0 && c.x < state.home.w && c.y < state.home.h && !occupied.has(key) && !reachable.has(key)) { reachable.add(key); queue.push(c); }
  }
  for (const p of layout) {
    if (DECOR_BY_ID[p.equipmentId]) continue;
    const cells = footprint(p), front = p.rotation === 0 ? { x: p.x, y: Math.max(...cells.map(c => c.y)) + 1 } : p.rotation === 1 ? { x: p.x - 1, y: p.y } : p.rotation === 2 ? { x: p.x, y: p.y - 1 } : { x: Math.max(...cells.map(c => c.x)) + 1, y: p.y };
    if (!reachable.has(`${front.x},${front.y}`)) return "Keep a path to the working side of every furnishing.";
  }
  return state.home.roomPlan?(validateRoomPlan(state.home.roomPlan,layout)??(state.home.stools?stoolOwnershipError(state.home.roomPlan,state.home.stools):null)):null;
}
/** New editor commits need separate chairs; legacy saves remain loadable. */
function proposedHomeChairError(state: DinerState, layout: HomePlacement[]): string | null {
  const singles = new Set(layout.filter(p => p.equipmentId === "table_1").map(p => p.id));
  if (!singles.size) return null;
  const world = createHomeWorld({ ...homeSimulationConfig(state), layout, chefs: 0, waiters: 0, arrivalRate: 0 });
  const chairs = new Map<string, string>();
  for (const table of world.tables) for (const seat of table.seats) {
    const key = `${seat.x},${seat.y}`, previous = chairs.get(key);
    if (previous && (singles.has(table.id) || singles.has(previous))) return "Give every one-seat table its own chair space.";
    chairs.set(key, table.id);
  }
  return null;
}
/** Preview and commit share the same placement checks; old checkpoints retain their original validation. */
export function validateDinerHomePlacement(state: DinerState, layout: HomePlacement[]): string | null {
  return validateDinerHome(state, layout) ?? proposedHomeChairError(state, layout);
}
export function menuSlots(state: DinerState) { return state.restaurantLevel >= 12 ? 3 : state.restaurantLevel >= 5 ? 2 : 1; }
export function staffSlots(state: DinerState) { const levelSlots=state.restaurantLevel >= 20 ? 8 : state.restaurantLevel >= 12 ? 6 : state.restaurantLevel >= 8 ? 5 : state.restaurantLevel >= 5 ? 4 : state.restaurantLevel >= 3 ? 3 : 2; return Math.max(state.home.roomPlan?3:2,levelSlots); }
export function equipmentTierCap(state: DinerState) { return state.restaurantLevel >= 12 ? 3 : state.restaurantLevel >= 5 ? 2 : 1; }
/** Home furniture has a stage unlock, without pretending it was a truck find. */
export function homeEquipmentPurchaseError(state:DinerState,id:string):string|null {
  if(!isHomeEquipmentAvailable(id))return 'Choose a furnishing available for your restaurant.';
  if((HOME_ONLY_EQUIPMENT_IDS as readonly string[]).includes(id))return ['diner','restaurant'].includes(state.home.roomPlan?.stage??'')?null:'Open your first diner to buy upholstered booths.';
  return state.equipment[id]?.truckOwned?null:'Discover this equipment on your truck first.';
}
export function homeMenu(state: DinerState): string[] {
  const machines = new Set(state.home.layout.map(p => p.equipmentId));
  return [...new Set([...COURSES.flatMap(course => state.home.menu[course]),...autoHomeRecipeIds(state)])].filter(id => state.recipes[id] && RECIPE_BY_ID[id]?.steps.every(step => machines.has(step.station)));
}
export function homeSimulationConfig(state: DinerState, at = state.updatedAt): HomeSimulationConfig {
  const menu = homeMenu(state);
  const mean = (fn: (id: string) => number) => menu.length ? menu.reduce((n, id) => n + fn(id), 0) / menu.length : 0;
  const mastery = mean(id => state.recipes[id].level), buzz = state.buzz.filter(t => at >= t && at - t < DINER_RULES.buzzHours * DINER_RULES.hourMs).length;
  return { w: state.home.w, h: state.home.h, layout: state.home.layout, equipment: state.equipment, menu, recipeLevels: Object.fromEntries(Object.entries(state.recipes).map(([id, r]) => [id, r.level])), chefs: state.home.staff.chefs, waiters: state.home.staff.waiters, cashiers:state.home.staff.cashiers??0,roomPlan:state.home.roomPlan,
    staffSpeedMultiplier: state.daily.staffMeal && dinerDay(at) === state.daily.day ? DINER_RULES.staffMealSpeed : 1,
    arrivalRate: (DINER_RULES.homeArrivalBase + (state.restaurantLevel - 1) * DINER_RULES.homeArrivalPerLevel) * (1 + mastery * .03) * (1 + charmOf(state).score / 1000) * (1 + Math.min(DINER_RULES.buzzMax, buzz) * .03) };
}
export function dinerRates(state: DinerState, at = state.updatedAt) { return measureHomeRates(homeSimulationConfig(state, at)); }
function updateLevel(state: DinerState) { state.restaurantLevel = Math.max(1, DINER_RULES.reputationLevels.filter(n => state.reputation >= n).length); }
function settleHome(state: DinerState, now: number, online = false) {
  const till = state.home.till, start = till.lastAt, end = Math.max(start, now), cap = till.capacityHours * DINER_RULES.hourMs;
  // The till banks elapsed capacity, not a moving coin ceiling. Changing prices,
  // layout, or buzz cannot refill past hours or erase money already collected.
  const from = start, creditedEnd = Math.min(end, start + Math.max(0, cap - till.filledMs));
  const mealExpiry = (state.daily.day + 1) * DINER_RULES.dayMs;
  const boundaries = [from, creditedEnd, ...[mealExpiry, ...state.buzz.map(t => t + DINER_RULES.buzzHours * DINER_RULES.hourMs)].filter(t => t > from && t < creditedEnd)].sort((a, b) => a - b);
  let coins = 0, reputation = 0;
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] <= boundaries[i - 1]) continue;
    let cursor=boundaries[i-1];const factor=online?1:DINER_RULES.offlineMultiplier;
    while(cursor<boundaries[i]-.0001){
      const rate=dinerRates(state,cursor);let hours=(boundaries[i]-cursor)/DINER_RULES.hourMs;
      const fixtures=(state.home.roomPlan?.modules??[]).filter(m=>m.kind==='toilet'||m.kind==='handwash_sink');
      for(const fixture of fixtures){const use=(rate.fixtureUses?.[fixture.id]??0)*factor,wear=fixture.kind==='toilet'?ROOM_RULES.toiletWear:ROOM_RULES.handwashWear,condition=state.home.fixtureInventory?.[fixture.id]?.condition??100;if(use>0&&condition>ROOM_RULES.minimumCondition)hours=Math.min(hours,(condition-ROOM_RULES.minimumCondition)/(use*wear));}
      if(hours<=1e-12)break;
      coins+=rate.coins*hours*factor;reputation+=rate.reputation*hours*factor;
      if(dinerDay(cursor)===state.daily.day)for(const regular of REGULARS){const recipe=regularFavourite(state,regular.id);if(recipe&&regularAvailable(state,regular.id))state.daily.regularProgress[regular.id]=Math.min(DINER_RULES.regularDailyServings,(state.daily.regularProgress[regular.id]??0)+(rate.platesByRecipe[recipe]??0)*hours*factor);}
      for(const fixture of fixtures){const owned=state.home.fixtureInventory?.[fixture.id];if(!owned||owned.condition<=ROOM_RULES.minimumCondition)continue;const wear=fixture.kind==='toilet'?ROOM_RULES.toiletWear:ROOM_RULES.handwashWear;owned.condition=Math.max(ROOM_RULES.minimumCondition,owned.condition-(rate.fixtureUses?.[fixture.id]??0)*wear*hours*factor);if(owned.condition<ROOM_RULES.minimumCondition+1e-8)owned.condition=ROOM_RULES.minimumCondition;fixture.condition=owned.condition;}
      cursor+=hours*DINER_RULES.hourMs;
    }
  }
  till.coins += coins; till.reputation += reputation; till.filledMs += creditedEnd - from; till.lastAt = end;
  state.buzz = state.buzz.filter(t => t <= end && end - t < DINER_RULES.buzzHours * DINER_RULES.hourMs).slice(-DINER_RULES.buzzMax);
}
function addIngredient(state: DinerState, id: string, count = 1) { if (!owns(INGREDIENT_BY_ID,id)) fail("unknown_ingredient", "That ingredient is unavailable."); if (state.daily.minted + count > DINER_RULES.ingredientMaximum) fail("daily_limit", "Today's ingredient allowance is already collected."); state.pantry[id] = (state.pantry[id] ?? 0) + count; state.daily.minted += count; }
function ingredientFor(state: DinerState, salt: string) { const demand = RECIPES.flatMap(recipe => recipe.ingredients); return demand[dinerHash(`${state.seed}:${state.daily.day}:${salt}`) % demand.length]; }
/** The physical parcel and the compatibility claim share exactly one daily receipt. */
function claimDailyIngredientParcel(state:DinerState){
  if(state.daily.crate)fail('already_claimed',"Today's crate is already open.");
  if(!state.tutorial.crateClaimed){addIngredient(state,'beef');addIngredient(state,'bun');state.tutorial.crateClaimed=true;}
  else {addIngredient(state,ingredientFor(state,'crate:0'));addIngredient(state,ingredientFor(state,'crate:1'));}
  state.daily.crate=true;state.daily.crateProgressTicks=DINER_RULES.incidentWorkTicks.delivery;
  if(state.homeTask?.incidentId===`crate:${state.daily.day}`)state.homeTask=null;
}
function grantTruckIngredient(state: DinerState) {
  const run = state.run!;
  if (!run.qualified || run.ingredientClaimed || state.daily.truckRuns.length >= DINER_RULES.sourceAllowances.truck) { run.haul += DINER_RULES.ingredientNodeCoins; return; }
  addIngredient(state, ingredientFor(state, `truck:${state.daily.truckRuns.length}`)); state.daily.truckRuns.push(run.id); run.ingredientClaimed = true;
}
function routeTier(state: DinerState) {
  let tier: DinerTier = state.truckTier;
  for (const route of ROUTES) if (state.collections.routeWins.includes(route.id)) tier = Math.max(tier, route.tier + 1) as DinerTier;
  state.truckTier = Math.min(4, tier) as DinerTier;
}
/** Choosing a route or preparing food reserves a trip; opening service commits it. */
export function canCancelDinerRun(state: DinerState): boolean {
  const run = state.run;
  if (!run || run.practice || run.visited.length || run.serviceDays || run.qualified || run.ingredientClaimed || run.haul || run.strikes || run.event || run.specials.length || run.offers.some(offer => offer.purchased)) return false;
  if (!run.position) return !run.service;
  const service = run.service;
  return !!service && !service.spawned && !service.coins && !service.strikes && (service.phase === 'setup' || service.phase === 'preparing' || (service.phase === 'paused' && service.pausedPhase === 'preparing'));
}
function finishRun(state: DinerState, reason: "home" | "failed" | "won") {
  const run = state.run!; if (run.practice) { state.run = null; return; }
  if(run.qualified&&!run.ingredientClaimed&&state.daily.truckRuns.length<DINER_RULES.sourceAllowances.truck)grantTruckIngredient(state);
  const banked = Math.floor(run.haul * (reason === "failed" ? .5 : 1)); state.coins += banked;
  // Honor an earlier trip's promised gift, without forcing a cuisine onto new players.
  if (run.tutorial && (reason !== 'home' || run.serviceDays > 0)) { state.tutorial.finished = true; state.tutorial.stage = 6; if (run.discoveryVersion!==2&&!state.tutorial.fryerGifted) { state.equipment.fryer??={tier:1,truckOwned:false,homeCopies:0};state.equipment.fryer.truckOwned=true;state.equipment.fryer.homeCopies++; state.tutorial.fryerGifted = true; } }
  state.lastRun = { id: run.id, reason, banked, lost: run.haul - banked, serviceDays: run.serviceDays, recipes: Object.keys(state.recipes), equipment: Object.keys(state.equipment).filter(id => state.equipment[id].truckOwned) };
  state.run = null; routeTier(state);
}
function currentNode(state: DinerState) { return state.run?.map.find(node => node.id === state.run!.position); }
function advanceNode(state: DinerState) { const run = state.run!, node = currentNode(state)!; run.visited.push(node.id); run.available = [...node.next]; run.position = null; run.service = null; run.event=null;run.serviceEffect=null; run.offers = []; }
/** Count markets actually reached on this trip, never skipped branches or rerolls. */
export function roadsideShopVisit(state:Pick<DinerState,'run'>):number {
  const run=state.run;if(!run||!run.map.some(node=>node.id===run.position&&node.kind==='shop'))return 0;
  return new Set(run.visited.filter(id=>id!==run.position&&run.map.some(node=>node.id===id&&node.kind==='shop'))).size+1;
}
export function shopOffers(state: DinerState, salt = "0"): DinerOffer[] {
  const run = state.run!, seed = `${run.seed}:${run.position}:${salt}`, cap = Math.max(2,equipmentTierCap(state));
  const equipment = ordered(EQUIPMENT.filter(e => isTruckEquipmentAvailable(e.id) && e.tiers.length && !['crate','fridge','plates','cups','boxes','bowls','bin'].includes(e.id) && !state.equipment[e.id]?.truckOwned), seed, e => e.id).slice(0, 3).map(e => ({ id: `equipment:${e.id}`, kind: "equipment" as const, target: e.id, price: e.tiers[0].price, purchased: false }));
  const discoveryTier=Math.max(state.truckTier,ROUTES.find(route=>route.id===run.routeId)?.tier??1);
  const candidates=ordered(RECIPES.filter(recipe=>!recipe.secret&&!owns(state.recipes,recipe.id)&&(recipe.route==='starter'||['tomato_pasta','vegetable_ramen'].includes(recipe.id)||ROUTES.some(route=>route.id===recipe.route&&route.tier<=discoveryTier))),`${seed}:recipes`,recipe=>recipe.id);
  const usable=(recipe:typeof RECIPES[number])=>recipe.steps.every(step=>state.equipment[step.station]?.truckOwned);
  const selected=[candidates.find(usable),candidates.find(recipe=>!usable(recipe))].filter((recipe):recipe is typeof RECIPES[number]=>!!recipe);
  for(const recipe of candidates)if(selected.length<2&&!selected.includes(recipe))selected.push(recipe);
  const recipes=roadsideShopVisit(state)<2?[]:selected.map(recipe=>({id:`recipe:${recipe.id}`,kind:'recipe' as const,target:recipe.id,price:DINER_RULES.recipeCost,purchased:false}));
  const upgradable = ordered(EQUIPMENT.filter(e => isTruckEquipmentAvailable(e.id) && state.equipment[e.id]?.truckOwned && state.equipment[e.id].tier < cap && e.tiers.some(t => t.tier === state.equipment[e.id].tier + 1)), seed, e => e.id)[0];
  return [...equipment, ...recipes, ...(upgradable ? [{ id: `upgrade:${upgradable.id}`, kind: "upgrade" as const, target: upgradable.id, price: upgradable.tiers.find(t => t.tier === state.equipment[upgradable.id].tier + 1)!.price, purchased: false }] : []), ...(run.qualified && !run.ingredientClaimed && state.daily.truckRuns.length < DINER_RULES.sourceAllowances.truck ? [{ id: "ingredients:bundle", kind: "ingredients" as const, target: ingredientFor(state, `shop:${run.position}`), price: 50, purchased: false }] : [])];
}

function validTruckMenu(state: DinerState, menu: string[]) {
  return Array.isArray(menu) && menu.length > 0 && menu.length <= 4 && new Set(menu).size === menu.length && menu.every(id => owns(state.recipes,id) && owns(RECIPE_BY_ID,id) && RECIPE_BY_ID[id].steps.every(step => state.equipment[step.station]?.truckOwned));
}
/** Existing larger menus survive migration; new choices respect the truck. */
function validNewTruckMenu(state:DinerState,menu:string[]):boolean {
  if(!validTruckMenu(state,menu))return false;
  if(menu.length<=truckMenuCapacity(state))return true;
  const current=state.run?.menu??state.truckConfig.menu;
  return current.length>truckMenuCapacity(state)&&menu.length<=current.length&&menu.every(id=>current.includes(id));
}
/** Old possessions stay where they were. New mandatory supplies arrive in storage,
 * and only an unopened first tutorial receives the simpler opening menu. */
function normalizeTruckPolicy(state:DinerState){
  if(state.truckConfig.supplyVersion===undefined){
    for(const id of ['fridge','plates']){state.equipment[id]??={tier:1,truckOwned:true,homeCopies:0};state.equipment[id].truckOwned=true;}
    state.truckConfig.supplyVersion=1;
  }else if(state.truckConfig.supplyVersion!==1)fail('invalid_storage','This truck supply version is unavailable.');
  if(state.truckConfig.menuVersion===undefined){
    const run=state.run,service=run?.service;
    const unopened=!service||(service.phase==='setup'&&service.tick===0&&service.customers.length===0&&!service.chef.held&&service.stations.every(station=>station.slots.every(slot=>!slot.item)));
    if(run?.tutorial&&run.serviceDays===0&&unopened&&owns(state.recipes,'classic_burger')){run.menu=['classic_burger'];if(service)service.config.menu=['classic_burger'];}
    state.truckConfig.menuVersion=2;
  }else if(state.truckConfig.menuVersion!==2)fail('invalid_menu','This truck menu version is unavailable.');
}
export interface TruckRecipeOffer {recipeId:string;price:number;available:boolean;reason:string|null}
/** Buying a recipe adds it to the book. Only an explicit menu selection creates new orders. */
export function truckRecipeShop(_state:DinerState):TruckRecipeOffer[]{return [];}
export interface TruckEquipmentOffer {equipmentId:string;name:string;action:'buy'|'upgrade';tier:number;capacity:number;price:number;available:boolean;reason:string|null;homeCapable:boolean}
/** Utility purchases and capacity upgrades use banked coins before a service.
 * Buying never installs a station or grants a restaurant copy. */
export function truckEquipmentShop(state:DinerState):TruckEquipmentOffer[]{
  const busy=Boolean(state.rally.service||(state.run&&state.run.service?.phase!=='setup'));
  return EQUIPMENT.flatMap(def=>{
    if(!isTruckEquipmentAvailable(def.id)||def.id.startsWith('table_'))return [];
    const owned=state.equipment[def.id],action=owned?.truckOwned?'upgrade':'buy';
    if(action==='buy'&&!['cups','boxes','bowls'].includes(def.id))return [];
    const tier=action==='buy'?1:owned.tier+1,spec=def.tiers.find(spec=>spec.tier===tier);if(!spec)return [];
    const dependency=def.id==='boxes'&&!state.equipment.fryer?.truckOwned?'Discover the fryer first.':def.id==='bowls'&&!state.equipment.boiler?.truckOwned?'Discover a noodle boiler first.':def.id==='cups'&&!['drinks','coffee','blender'].some(id=>state.equipment[id]?.truckOwned)?'Discover a drinks machine first.':null;
    const reason=busy?'Choose equipment at home or before preparing food.':dependency??(tier>equipmentTierCap(state)?`Restaurant level ${tier===2?5:12} unlocks this upgrade.`:state.coins<spec.price?'Save a few more coins first.':null);
    return [{equipmentId:def.id,name:def.name,action,tier,capacity:spec.capacity,price:spec.price,available:reason===null,reason,homeCapable:isHomeEquipmentAvailable(def.id)} as TruckEquipmentOffer];
  });
}
/** Add quantities once to older saves. Previously placed tables are possessions,
 * including an active service that was saved after a truck-size change. */
function normalizeTruckStorage(state:DinerState){
  const ids:TruckTableId[]=['table_1','table_2','table_4'];
  if(state.truckConfig.tableCopies===undefined){
    state.truckConfig.tableCopies=Object.fromEntries(ids.map(id=>{
      const capacity=Number(id.slice(6));
      const saved=state.truckConfig.tables.filter(table=>table.capacity===capacity).length;
      const active=state.run?.service?.tables.filter(table=>table.capacity===capacity).length??0;
      return [id,Math.max(state.equipment[id]?.truckOwned?1:0,saved,active)];
    })) as Record<TruckTableId,number>;
  }
  const copies=state.truckConfig.tableCopies;
  if(!copies||typeof copies!=='object'||Array.isArray(copies)||Object.keys(copies).some(id=>!ids.includes(id as TruckTableId))||ids.some(id=>!Number.isSafeInteger(copies[id])||copies[id]<0||copies[id]>100||(copies[id]>0&&!state.equipment[id]?.truckOwned)))fail('invalid_storage','The truck seating inventory is incomplete.');
}
function ownedTruckLayout(state: DinerState, input: { stations: TruckStationPlacement[]; tables: TruckTablePlacement[] }) {
  if (!Array.isArray(input.stations) || !Array.isArray(input.tables) || input.stations.length > 40 || input.tables.length > SERVICE_RULES.maxTables) fail("invalid_layout", "Choose a layout that fits your truck.");
  const seen = new Set<string>();
  const stations = input.stations.map(p => {
    if (!p || Object.keys(p).some(k => !["id", "kind", "x", "y", "facing"].includes(k)) || ![p.x, p.y].every(Number.isInteger) || ![0, 1, 2, 3].includes(p.facing) || typeof p.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)) fail("invalid_layout", "Choose valid station positions and facing.");
    const owned = state.equipment[p.kind]; if (!owned?.truckOwned || seen.has(p.kind)) fail("equipment_unavailable", "Use one copy of each owned truck station.");
    seen.add(p.kind); return makeStation(p.id, p.kind, p.x, p.y, Math.min(3, owned.tier) as 1 | 2 | 3, p.facing);
  });
  const tableCounts:Partial<Record<TruckTableId,number>>={};
  const tables = input.tables.map(p => {
    if (!p || Object.keys(p).some(k => !["id", "x", "y", "capacity", "rotation"].includes(k)) || ![p.x, p.y].every(Number.isInteger) || ![0, 1, 2, 3].includes(p.rotation ?? 0) || ![1, 2, 4].includes(p.capacity) || typeof p.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)) fail("invalid_layout", "Choose valid table positions and rotations.");
    const key=`table_${p.capacity}` as TruckTableId,owned = state.equipment[key];tableCounts[key]=(tableCounts[key]??0)+1;
    if (!owned?.truckOwned||(tableCounts[key]??0)>state.truckConfig.tableCopies[key]) fail("equipment_unavailable", "Buy another table and chairs before placing this copy.");
    return makeTable(p.id, p.x, p.y, p.capacity, Math.min(2, owned.tier) as 1 | 2, p.rotation ?? 0);
  });
  const error = validateServiceLayout(state.truckTier, stations, tables,{allowIncomplete:true}); if (error) fail("invalid_layout", error);
  return { stations, tables };
}
function rememberTruckLayout(state: DinerState, loadout: { stations: ServiceStation[]; tables: ServiceTable[] }) {
  state.truckConfig.stations = loadout.stations.map(({ id, kind, x, y, facing }) => ({ id, kind, x, y, facing }));
  state.truckConfig.tables = loadout.tables.map(({ id, x, y, capacity, rotation }) => ({ id, x, y, capacity, rotation })); state.truckConfig.layoutTier = state.truckTier;
}
function truckLoadout(state: DinerState) {
  const dy=TRUCK_TIERS[state.truckTier].h-TRUCK_TIERS[state.truckConfig.layoutTier].h;
  const previousPavement=TRUCK_TIERS[state.truckConfig.layoutTier].h+1;
  const input={stations:state.truckConfig.stations.map(station=>station.y>=previousPavement?{...station,y:station.y+dy}:station),tables:state.truckConfig.tables.map(table=>({...table,y:table.y+dy}))};
  const loadout=ownedTruckLayout(state,input);
  rememberTruckLayout(state, loadout); return loadout;
}
/** Pieces not on the saved board remain owned in the equipment trailer. */
export function truckStorage(state:DinerState){
  const placedStations=new Set(state.truckConfig.stations.map(station=>station.kind));
  return EQUIPMENT.filter(def=>isTruckEquipmentAvailable(def.id)&&state.equipment[def.id]?.truckOwned).map(def=>{
    const capacity=def.id.startsWith('table_')?Number(def.id.slice(6)) as 1|2|4:null;
    const owned=capacity===null?1:state.truckConfig.tableCopies?.[def.id as TruckTableId]??Math.max(1,state.truckConfig.tables.filter(table=>table.capacity===capacity).length);
    const placed=capacity===null?Number(placedStations.has(def.id as ServiceStation['kind'])):state.truckConfig.tables.filter(table=>table.capacity===capacity).length;
    return {equipmentId:def.id,name:def.name,capacity,owned,placed,available:Math.max(0,owned-placed),tier:state.equipment[def.id].tier};
  }).filter(item=>item.owned>0);
}
export function truckSetupError(state:DinerState):string|null {
  try {const copy=structuredClone(state);normalizeTruckStorage(copy);const layout=truckLoadout(copy);return serviceReadyError(createService({tier:copy.truckTier,menu:copy.run?.menu??copy.truckConfig.menu,...layout}));}
  catch(error){return error instanceof Error?error.message:'Check your truck layout.';}
}
function truckHelpers(state: DinerState) {
  const slots=[{id:state.truckConfig.helperId,role:state.truckConfig.helperRole},{id:state.truckConfig.helperId2??null,role:state.truckConfig.helperRole2??"washer" as const}];
  return slots.slice(0,TRUCK_TIERS[state.truckTier].helpers).flatMap((slot,index)=>{const staff=state.staffMembers.find(member=>member.id===slot.id);return staff&&!slots.slice(0,index).some(other=>other.id===slot.id)?[{id:staff.id,role:slot.role,look:staff.look}]:[];});
}
export function runStrikeLimit(state: DinerState) { return state.run?.spices.includes("two_strikes") ? 2 : state.settings.cosy ? 5 : 3; }
function awardScrap(state: DinerState, salt: string) {
  const secrets = RECIPES.filter(recipe => recipe.secret && !state.recipes[recipe.id]); if (!secrets.length) return;
  const recipe = secrets[dinerHash(`${state.seed}:${salt}`) % secrets.length];
  state.collections.scraps[recipe.id] = Math.min(3, (state.collections.scraps[recipe.id] ?? 0) + 1);
  if (state.collections.scraps[recipe.id] === 3) state.recipes[recipe.id] = { level: 0 };
}
export function homeIncidents(state: DinerState) {
  const day = state.daily.day, availableAt = Math.max(state.createdAt, day * DINER_RULES.dayMs);
  const blocked=state.home.layout.filter(p=>!DECOR_BY_ID[p.equipmentId]?.passable).flatMap(footprint);
  // All adjacent table cells cover the simulator's actual chair candidates.
  // They remain walkable, but a spill or delivery must not sit underneath a chair.
  const reserved=state.home.layout.filter(p=>['table_1','table_2','table_4','booth_2'].includes(p.equipmentId)).flatMap(footprint).flatMap(p=>[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}]);
  return [0,1].flatMap(index=>{
    const position=index===1?homeSpatial(state.home.w,state.home.h).delivery:chooseHomeInteractionTile({width:state.home.w,height:state.home.h,blocked,reserved,preferred:{x:Math.floor(state.home.w/2)+1,y:state.home.h-3}});
    if(!position)return [];reserved.push(position);
    return [{id:`incident:${day}:${index}`,kind:index===0?'spill' as const:'delivery' as const,name:index===0?'Wipe a little spill':"Unpack a neighbour's delivery",reward:DINER_RULES.incidentCoins,requiredTicks:index===0?DINER_RULES.incidentWorkTicks.spill:DINER_RULES.incidentWorkTicks.delivery,availableAt:availableAt+index*DINER_RULES.incidentWaitMs,...position}];
  }).filter(incident=>!state.daily.incidentClaims.includes(incident.id));
}
export function dailyIngredientParcel(state:DinerState){
  const position=homeSpatial(state.home.w,state.home.h).context.parcel;
  return {id:`crate:${state.daily.day}`,sceneId:'home-parcel',kind:'crate' as const,name:"Today's ingredient parcel",reward:0,requiredTicks:DINER_RULES.incidentWorkTicks.delivery,progressTicks:state.daily.crateProgressTicks??(state.daily.crate?DINER_RULES.incidentWorkTicks.delivery:0),claimed:state.daily.crate,availableAt:Math.max(state.createdAt,state.daily.day*DINER_RULES.dayMs),...position};
}
function homeTaskTarget(state:DinerState,id:string){
  const parcel=dailyIngredientParcel(state);
  return id===parcel.id&&!parcel.claimed?parcel:homeIncidents(state).find(job=>job.id===id);
}

function validateCommand(command: DinerCommand) {
  if (!command || typeof command !== "object" || Array.isArray(command)) fail("invalid_command", "Choose a diner action.");
  const fields: Record<string, string[]> = { startRun: ["routeId", "tutorial", "headStart"], startPractice: ["recipeIds"], endPractice: [], chooseNode: ["nodeId"], service: ["action"], finishService: [], goHome: [], leaveNode: [], rerollShop: [], claimCrate: [], collectTill: [], harvestGarden: [], greetRegular: [], expandHome: [], settle: [], chooseGift: ["choice"], buyOffer: ["offerId"], upgradeRecipe: ["recipeId"], buyHomeEquipment: ["equipmentId"], homeLayout: ["layout"], setHomeMenu: ["menu"], setTruckMenu: ["recipeIds"], setupLayout: ["stations", "tables"], buyIngredient: ["ingredientId"], plantGarden: ["ingredientId"], hire: ["role"], settings: ["cosy", "name"], setSpices: ["spiceIds"], assignHelper: ["staffId", "role", "slot"], staffMeal: ["recipeId"], serveRegular: ["regularId"], helpIncident: ["incidentId"], buyDecor: ["decorId"], setCosmetic: ["slot", "id"], skinEquipment: ["placementId", "skinId"], saveLayout: ["name"], loadLayout: ["layoutId"] };
  Object.assign(fields,{buyFinish:['slot','id'],buyTruckTable:['capacity'],buyTruckRecipe:['recipeId'],buyTruckEquipment:['equipmentId'],upgradeTruckEquipment:['equipmentId'],beginHomeTask:['incidentId'],homeTaskInput:['action'],eventChoice:['choiceId'],eventInput:['action'],startRally:[],rallyService:['action'],finishRally:[],endRally:[]});
  fields.buyRecipeKit=['kitId'];
  Object.assign(fields,{homeRoomPlan:['roomPlan','layout'],renovateHome:['stage','previewToken'],restoreRenovation:['backupId'],claimCareerIngredients:['achievementId','recipeId'],buyHomeFixture:['kind'],buyHomeStool:['style'],installHomeStool:['style'],returnHomeStool:['moduleId','seatIndex'],upgradeHomeStool:['moduleId','seatIndex'],cleanHomeFixture:['moduleId'],repairHomeFixture:['moduleId'],buyRoomFinish:['slot','id'],setRoomFinish:['slot','id'],sellDecor:['decorId']});
  if (!Object.prototype.hasOwnProperty.call(fields, command.type) || Object.keys(command).some(key => key !== "type" && !fields[command.type].includes(key))) fail("invalid_command", "Only action inputs may be submitted.");
  if(command.type==='homeTaskInput'){
    const action=command.action,allowed:Record<string,string[]>={tick:['ticks'],hold:['active'],pause:[],strokeStart:['point'],stroke:['point'],parcel:['part']};
    if(!action||typeof action!=='object'||!owns(allowed,action.type)||Object.keys(action).some(key=>key!=='type'&&!allowed[action.type].includes(key))||(action.type==='tick'&&(!Number.isSafeInteger(action.ticks)||action.ticks<1||action.ticks>SERVICE_RULES.maxTicksPerAction))||(action.type==='hold'&&typeof action.active!=='boolean')||((action.type==='strokeStart'||action.type==='stroke')&&!validHomePoint(action.point))||(action.type==='parcel'&&!PARCEL_PARTS.includes(action.part)))fail('invalid_home_task_input','Send a cloth movement, parcel part, or short whole-number time step.');
  }
  if(command.type==='eventInput'){const action=command.action,allowed:Record<string,string[]>={tick:['ticks'],clean:['targetId','active'],tap:[],pause:[],resume:[]};if(!action||!Object.hasOwn(allowed,action.type)||Object.keys(action).some(key=>key!=='type'&&!allowed[action.type].includes(key)))fail('invalid_event_input','Send only roadside timing and cleaning inputs.');}
  if (command.type === "service"||command.type==='rallyService') {
    const action = command.action, allowed: Record<string, string[]> = { prepare: [], open: [], pause: [], resume: [], discard: [], tick: ["ticks"], move: ["x", "y"], interact: ["targetId", "recipeId", "ingredientId", "seatId", "itemId"], hold: ["active"] };
    if (!action || typeof action !== "object" || !Object.prototype.hasOwnProperty.call(allowed, action.type) || Object.keys(action).some(key => key !== "type" && !allowed[action.type].includes(key))) fail("invalid_service_action", "Send cooking inputs, never service state or rewards.");
    if (action.type === "tick" && (!Number.isInteger(action.ticks) || action.ticks < 0 || action.ticks > SERVICE_RULES.maxTicksPerAction)) fail("invalid_ticks", "Use a bounded number of service ticks.");
    if (action.type === "move" && (![action.x, action.y].every(Number.isInteger) || Math.abs(action.x) > 100 || Math.abs(action.y) > 100)) fail("invalid_move", "Choose a kitchen tile.");
    if (action.type === "hold" && typeof action.active !== "boolean") fail("invalid_hold", "Choose whether to hold the interaction.");
    if (action.type==='interact'&&action.ingredientId!==undefined&&(typeof action.ingredientId!=='string'||!owns(INGREDIENT_BY_ID,action.ingredientId)))fail('invalid_service_action','Choose a known kitchen ingredient.');
    if (action.type==='interact'&&action.itemId!==undefined&&(typeof action.itemId!=='string'||action.itemId.length<1||action.itemId.length>64))fail('invalid_service_action','Choose an item on the holding counter.');
  }
}
export function dispatchDiner(current: DinerState, command: DinerCommand, context: DinerContext): DinerResult {
  const state = structuredClone(current);
  try {
    validateCommand(command);
    state.truckConfig.helperId2??=null;state.truckConfig.helperRole2??="washer";state.homeTask??=null;
    normalizeTruckPolicy(state);
    normalizeTruckStorage(state);
    normalizeStarterEquipment(state);
    normalizeHomeWork(state);
    normalizeFinishes(state);
    normalizeRestaurant(state);
    if (state.version !== 1 || state.contentVersion !== CONTENT_VERSION) fail("version_mismatch", "This preview save needs its matching game version.");
    if (!Number.isSafeInteger(context.now) || context.now < 0) fail("invalid_time", "The diner clock is unavailable.");
    const now = Math.max(context.now, state.updatedAt), day = dinerDay(now);
    settleHome(state, now, context.online === true); state.updatedAt = now;
    const dayChanged=day>state.daily.day;
    if (dayChanged) {state.daily = dailyState(day, state.seed);state.homeTask=null;}
    const spend = (amount: number) => { if (!Number.isSafeInteger(amount) || amount < 0 || state.coins < amount) fail("not_enough_coins", "Save a few more coins first."); state.coins -= amount; };
    switch (command.type) {
      case "settle": break;
      case 'claimCareerIngredients': {
        const bundle=careerIngredientBundle(state,command.achievementId,command.recipeId);if(!bundle)fail('career_reward_unavailable','Choose an earned, unclaimed career bundle and an owned recipe below level 10.');
        for(const [id,count] of Object.entries(bundle))state.pantry[id]=(state.pantry[id]??0)+count;
        state.career.ingredientClaims.push(command.achievementId);break;
      }
      case 'renovateHome': {
        if(!Object.hasOwn(RESTAURANT_STAGES,command.stage))fail('invalid_renovation','Choose a known restaurant stage.');
        const preview=getRenovationPreview(state,command.stage);if(!preview?.allowed)fail('renovation_locked','Complete the restaurant career goals and return home before renovating.');
        if(command.previewToken!==preview.token)fail('renovation_changed','Your room changed. Preview the renovation again before confirming.');
        spend(preview.cost);
        let index=0;while(state.renovation.backups.some(b=>b.id===`before-${command.stage}-${index}`))index++;
        const backup={id:`before-${command.stage}-${index}`,at:now,stage:state.home.roomPlan?.stage??null,w:state.home.w,h:state.home.h,expansion:state.home.expansion,layout:structuredClone(state.home.layout),roomPlan:state.home.roomPlan?structuredClone(state.home.roomPlan):undefined,staff:{...state.home.staff},finishes:{...state.home.finishes!},cosmetics:{...state.cosmetics}};
        state.renovation.backups=[...state.renovation.backups,backup].slice(-3);
        for(const [id,count] of Object.entries(preview.includedFurniture)){state.equipment[id]??={tier:1,truckOwned:false,homeCopies:0};state.equipment[id].homeCopies+=count;}
        if(preview.includedFurniture.booth_2)state.renovation.boothGrant={version:1,granted:true};
        for(const slot of Object.keys(preview.includedPalette) as RoomFinishSlot[])state.paletteOwned![slot].push(...preview.includedPalette[slot]!);
        for(const slot of ['floor','wall'] as const){const gifts=(preview.includedFinishes[slot]??[]).filter(id=>id!==FINISH_RULES.defaults[slot]);state.finishOwned[slot].push(...(preview.includedFinishes[slot]??[]));if(gifts.length){state.renovation.surfaceGifts??={};state.renovation.surfaceGifts[slot]=[...new Set([...(state.renovation.surfaceGifts[slot]??[]),...gifts])];}}
        state.cosmetics=preview.cosmetics;state.renovation.styleKitGranted??=[];if(!state.renovation.styleKitGranted.includes(command.stage))state.renovation.styleKitGranted.push(command.stage);
        state.home.finishes=preview.finishes;if(command.stage==='diner')state.renovation.dinerPaletteGranted=true;
        for(const [id,count] of Object.entries(preview.includedDecor))state.decorOwned[id]=(state.decorOwned[id]??0)+count;
        if(command.stage==='burger_shop'&&Object.keys(preview.includedDecor).length)state.starterTrinkets={version:1,granted:true};
        state.home.fixtureInventory??={};for(const module of preview.roomPlan.modules)state.home.fixtureInventory[module.id]??={kind:module.kind,condition:module.condition??100,...(module.width===undefined?{}:{width:module.width})};
        state.home.w=preview.roomPlan.w;state.home.h=preview.roomPlan.h;state.home.roomPlan=preview.roomPlan;state.home.layout=preview.layout;state.home.staff=preview.staff;state.home.expansion=command.stage==='burger_shop'?0:command.stage==='diner'?1:2;
        const cashier=state.staffMembers.find(member=>member.id==='cashier-1');if(cashier)cashier.role=preview.staff.cashiers?'cashier':'waiter';
        if(!state.renovation.completed.includes(command.stage)){state.renovation.completed.push(command.stage);if(command.stage==='diner')state.renovation.baseline={services:state.career.services,introductory:state.career.introductory,byDifficulty:{...state.career.byDifficulty},multiRecipe:{...state.career.multiRecipe}};}
        state.homeTask=null;const error=validateDinerHome(state,state.home.layout);if(error)fail('invalid_renovation',error);break;
      }
      case 'restoreRenovation': {
        if(state.run||state.rally.service)fail('run_active','Return home before restoring your room.');
        const backup=state.renovation.backups.find(b=>b.id===command.backupId);if(!backup)fail('snapshot_unavailable','Choose a preserved room snapshot.');
        state.home.w=backup.w;state.home.h=backup.h;state.home.expansion=backup.expansion;state.home.layout=structuredClone(backup.layout);state.home.roomPlan=backup.roomPlan?structuredClone(backup.roomPlan):undefined;state.home.staff={...backup.staff};
        if(backup.finishes)state.home.finishes={...backup.finishes};
        if(backup.cosmetics)state.cosmetics={...state.cosmetics,floor:backup.cosmetics.floor,wall:backup.cosmetics.wall};
        const cashier=state.staffMembers.find(member=>member.id==='cashier-1');if(cashier)cashier.role=backup.staff.cashiers?'cashier':'waiter';
        if(state.home.roomPlan)for(const m of state.home.roomPlan.modules){const owned=state.home.fixtureInventory?.[m.id];if(!owned||owned.kind!==m.kind)fail('fixture_not_owned','This snapshot needs its preserved room fixtures.');if(['toilet','handwash_sink'].includes(m.kind))m.condition=owned.condition;else delete m.condition;}
        const error=validateDinerHome(state,state.home.layout);if(error)fail('invalid_layout',error);state.homeTask=null;break;
      }
      case 'homeRoomPlan': {
        const old=state.home.roomPlan,plan=structuredClone(command.roomPlan);if(!old||!plan||plan.stage!==old.stage||plan.w!==old.w||plan.h!==old.h||Object.keys(plan).some(k=>!['version','stage','w','h','modules','edges','zones'].includes(k)))fail('invalid_room_plan','Edit your current room; use renovation to change its stage.');
        if(!Array.isArray(plan.modules))fail('invalid_room_plan','Keep a valid module list.');
        for(const module of plan.modules){const owned=state.home.fixtureInventory?.[module.id];if(!owned||owned.kind!==module.kind||Object.keys(module).some(k=>!['id','kind','x','y','rotation','condition','width','seatStyles'].includes(k)))fail('fixture_not_owned','Place only fixtures already owned by this diner.');if(module.width!==owned.width)fail('fixture_not_owned','Keep the owned counter size.');if(['toilet','handwash_sink'].includes(module.kind))module.condition=owned.condition;else delete module.condition;}
        const layout=command.layout===undefined?state.home.layout:structuredClone(command.layout);state.home.roomPlan=plan;
        const error=validateDinerHomePlacement(state,layout);if(error)fail('invalid_room_plan',error);state.home.layout=layout;state.homeTask=null;break;
      }
      case 'buyHomeFixture': {
        const plan=state.home.roomPlan;if(!plan||!['toilet','handwash_sink','chef_bar'].includes(command.kind)||(command.kind==='chef_bar'&&plan.stage!=='restaurant'))fail('fixture_unavailable','Choose a fixture available for this restaurant stage.');
        const inventory=state.home.fixtureInventory!,count=Object.values(inventory).filter(item=>item.kind===command.kind).length,capacity=command.kind==='chef_bar'?1:RESTAURANT_STAGES[plan.stage].bathroomBays;
        if(count>=capacity)fail('fixture_capacity',command.kind==='chef_bar'?'Your six-seat bar is already yours. Place it from storage.':'This stage already owns a fixture for every reserved bathroom bay.');
        spend(RENOVATION_RULES.fixturePrices[command.kind]);const prefix=command.kind==='toilet'?'toilet':command.kind==='chef_bar'?'chef-bar':'handwash';let number=count+1;while(inventory[`${prefix}-${number}`])number++;inventory[`${prefix}-${number}`]={kind:command.kind,condition:100};break;
      }
      case 'buyHomeStool': case 'installHomeStool': {
        if(!['classic','diner'].includes(command.style))fail('stool_unavailable','Choose a classic or upholstered stool.');
        if(command.type==='buyHomeStool'&&state.home.stools![command.style]>=100)fail('stool_capacity','Your stool collection is full. Use a stool from storage.');
        if(command.type==='installHomeStool'&&state.home.stools![command.style]<=installedStools(state.home.roomPlan)[command.style])fail('stool_not_stored','There are no spare stools of this style in storage.');
        const plan=state.home.roomPlan,module=plan?.modules.find(m=>(m.kind==='console'||m.kind==='chef_bar')&&roomSeatStyles(m).length<ROOM_FIXTURES[m.kind].capacity);
        if(!plan||!module)fail('stools_full','Place a bar with a spare stool position first.');
        const styles=roomSeatStyles(module);module.seatStyles=[...styles,command.style];
        const error=validateRoomPlan(plan,state.home.layout);if(error)fail('stool_blocked',error);
        if(command.type==='buyHomeStool'){spend(RENOVATION_RULES.stoolPrices[command.style]);state.home.stools![command.style]++;}break;
      }
      case 'returnHomeStool': {
        const module=state.home.roomPlan?.modules.find(m=>m.id===command.moduleId),styles=module?roomSeatStyles(module):[];
        if(!module||!Number.isInteger(command.seatIndex)||command.seatIndex<0||command.seatIndex>=styles.length)fail('stool_unavailable','Choose an installed stool to put into storage.');
        module.seatStyles=styles.filter((_,i)=>i!==command.seatIndex);break;
      }
      case 'upgradeHomeStool': {
        const module=state.home.roomPlan?.modules.find(m=>m.id===command.moduleId),styles=module?roomSeatStyles(module):[];
        if(!module||!Number.isInteger(command.seatIndex)||command.seatIndex<0||styles[command.seatIndex]!=='classic')fail('stool_upgrade_unavailable','Choose an installed classic stool to replace with an upholstered one.');
        if(state.home.stools!.diner>=100)fail('stool_capacity','Your upholstered stool collection is full. Use a stool from storage.');
        spend(RENOVATION_RULES.stoolUpholsteryPrice);state.home.stools!.diner++;module.seatStyles=[...styles];module.seatStyles[command.seatIndex]='diner';break;
      }
      case 'cleanHomeFixture': case 'repairHomeFixture': {
        const module=state.home.roomPlan?.modules.find(m=>m.id===command.moduleId),owned=state.home.fixtureInventory?.[command.moduleId];
        if(!module||!owned||!['toilet','handwash_sink'].includes(owned.kind)||owned.condition>=100)fail('fixture_not_needed','Choose a placed bathroom fixture that needs attention.');
        if(command.type==='cleanHomeFixture'&&owned.condition<=ROOM_RULES.minimumCondition)fail('fixture_repair_needed','This fixture needs a repair before it can reopen.');
        spend(command.type==='repairHomeFixture'?RENOVATION_RULES.maintenance.repair:RENOVATION_RULES.maintenance.clean);owned.condition=100;module.condition=100;break;
      }
      case 'buyRoomFinish': case 'setRoomFinish': {
        const price=roomFinishPrice(command.slot,command.id);if(price===null)fail('cosmetic_unavailable','Choose an available room finish.');
        const owned=state.paletteOwned![command.slot];if(!owned.includes(command.id)){if(command.type==='setRoomFinish')fail('finish_not_owned','Preview and buy this room finish first.');spend(price);owned.push(command.id);}state.home.finishes![command.slot]=command.id;break;
      }
      case "startRun": {
        if(state.homeTask?.phase==="working"){state.homeTask.phase="paused";state.homeTask.gesture=emptyHomeGesture();}
        if (state.run||state.rally.service) fail("run_active", "Finish or return from the current trip first.");
        routeTier(state);
        const routeId = command.routeId ?? "downtown", route = ROUTES.find(r => r.id === routeId);
        if (!route || route.tier > state.truckTier) fail("route_locked", "Clear the previous route's finale to grow your truck and open this route.");
        const tutorial = !state.tutorial.finished; if (command.tutorial && !tutorial) fail("tutorial_complete", "Your opening trip is already complete.");
        if(!tutorial&&state.truckConfig.spices.includes('full_menu')&&state.truckConfig.menu.length<3)fail('invalid_menu',truckMenuCapacity(state)<3?'Grow your truck before choosing the full-menu spice, or turn that spice off.':'Choose three recipes or turn off the full-menu spice before leaving.');
        if (command.headStart && (tutorial || !state.collections.routeWins.includes(routeId))) fail("head_start_locked", "Clear this route once to start at row four.");
        if ((command.headStart !== undefined && typeof command.headStart !== "boolean") || (command.tutorial !== undefined && typeof command.tutorial !== "boolean")) fail("invalid_command", "Choose a valid trip option.");
        const seed = `${state.seed}:run:${++state.runsStarted}`, map = generateDinerMap(seed);
        if(tutorial)applyTutorialStops(map,true);
        state.run = { discoveryVersion:2, id: `run-${state.runsStarted}-${dinerHash(seed)}`, seed, routeId, contentVersion: CONTENT_VERSION, map, available: map.filter(n => n.row === (command.headStart ? 3 : 0)).map(n => n.id), position: null, visited: [], strikes: 0, haul: 0, service: null, serviceAccounted: { coins: 0, strikes: 0, reputation: 0 }, menu: tutorial?['classic_burger']:[...state.truckConfig.menu], specials: [], spices: tutorial ? [] : [...state.truckConfig.spices], offers: [], rerolled: false, qualified: false, ingredientClaimed: false, tutorial, serviceDays: 0, practice: false,event:null,nextService:null,serviceEffect:null,lastEventResult:null,mapVersion:3 };
        break;
      }
      case "startPractice": {
        if(state.homeTask?.phase==="working"){state.homeTask.phase="paused";state.homeTask.gesture=emptyHomeGesture();}
        if (state.run||state.rally.service) fail("run_active", "Return from the current trip before practising.");
        const menu = command.recipeIds ?? state.truckConfig.menu; if (!validNewTruckMenu(state, menu)) fail("invalid_menu", `Practise with up to ${truckMenuCapacity(state)} owned recipes and their equipment.`);
        const seed = `${state.seed}:practice`, map = generateDinerMap(seed), loadout = truckLoadout(state);
        state.run = { id: `practice-${dinerHash(seed)}`, seed, routeId: "downtown", contentVersion: CONTENT_VERSION, map, available: [], position: map[0].id, visited: [], strikes: 0, haul: 0, service: createService({ ...DIFFICULTIES.slow, seed, tier: state.truckTier, menu, recipeLevels: Object.fromEntries(Object.entries(state.recipes).map(([id, r]) => [id, r.level])), practice: true, helpers: truckHelpers(state), ...loadout }), serviceAccounted: { coins: 0, strikes: 0, reputation: 0 }, menu: [...menu], specials: [], spices: [], offers: [], rerolled: false, qualified: false, ingredientClaimed: false, tutorial: false, serviceDays: 0, practice: true,event:null,nextService:null,serviceEffect:null,lastEventResult:null,mapVersion:3 }; break;
      }
      case "endPractice": if (!state.run?.practice) fail("not_practice", "There is no practice session to close."); else { state.run = null; break; }
      case "chooseNode": {
        const run = state.run; if (!run || run.practice || run.position || !run.available.includes(command.nodeId)) fail("node_unavailable", "Choose a connected stop on your current map.");
        const node = run.map.find(n => n.id === command.nodeId)!; run.position = node.id; run.rerolled = false;
        if (["slow", "medium", "busy", "special", "finale"].includes(node.kind)) {
          const forced = run.tutorial && run.discoveryVersion!==2 && run.serviceDays >= 2;
          const customers = forced ? 6 : run.tutorial && run.serviceDays === 0 ? 4 : node.kind === "slow" ? 8 : node.kind === "medium" ? 14 : node.kind === "finale" ? 30 : 20;
          const loadout = truckLoadout(state);
          const difficulty = node.kind === "finale" ? DIFFICULTIES.finale : node.kind === "busy" || node.kind === "special" ? DIFFICULTIES.busy : node.kind === "medium" ? DIFFICULTIES.medium : DIFFICULTIES.slow;
          const twist=dinerHash(`${run.seed}:${node.id}:special`)%3;
          const special:Partial<import('./types').CreateServiceOptions>=node.kind==='special'?(twist===0?{menu:[run.menu[dinerHash(node.id)%run.menu.length]],customers:16}:twist===1?{customerTypes:loadout.tables.some(t=>t.capacity===4)?['family']:['office'],customers:16}:{customerTypes:['critic'],customers:14}):{};
          run.serviceEffect=run.nextService;run.nextService=null;
          run.service = createService({ ...difficulty, customers,menu:run.menu,...special,...eventServiceOptions(run.serviceEffect??undefined), seed: `${run.seed}:${node.id}`, tier: state.truckTier, recipeLevels: Object.fromEntries(Object.entries(state.recipes).map(([id, r]) => [id, r.level])), cosy: state.settings.cosy, strikeLimit: Math.max(1, runStrikeLimit(state) - run.strikes), tutorialFailure: forced, tutorialLearning:run.tutorial&&!forced&&run.serviceDays<2, specials: run.specials, spices: run.spices, helpers: truckHelpers(state), stations: loadout.stations, tables: loadout.tables });
          run.serviceAccounted = { coins: 0, strikes: 0, reputation: 0 };
        } else if (node.kind === "shop") run.offers = shopOffers(state);
        else if(node.kind==='event')run.event=createDinerEvent(`${run.id}:${node.id}`,`${run.seed}:${node.id}:event`);
        if (!run.service) state.collections.stamps = [...new Set([...state.collections.stamps, `${run.routeId}:${node.row}:${node.kind}`])]; break;
      }
      case "service": {
        const run = state.run; if (!run?.service) fail("no_service", "Open a service day first.");
        run.service = dispatchService(run.service, command.action);
        if (!run.practice && command.action.type === 'open' && run.service.phase === 'playing') {
          const node = currentNode(state)!;
          state.collections.stamps = [...new Set([...state.collections.stamps, `${run.routeId}:${node.row}:${node.kind}`])];
        }
        const result = serviceResult(run.service);
        if (!run.practice) { run.haul += Math.max(0, result.coins - run.serviceAccounted.coins); run.strikes += Math.max(0, result.strikes - run.serviceAccounted.strikes); }
        run.serviceAccounted = { coins: result.coins, strikes: result.strikes, reputation: result.reputation };
        if (!run.practice && (result.failed || run.strikes >= runStrikeLimit(state))) finishRun(state, "failed");
        break;
      }
      case "finishService": {
        const run = state.run, node = currentNode(state); if (!run?.service || !node || !serviceResult(run.service).completed) fail("service_unfinished", "Finish serving this day's guests first.");
        if (run.practice) { state.run = null; break; }
        recordCareerService(state.career,run);
        run.serviceDays++; run.qualified = true; run.haul += DINER_RULES.nodeRewards[node.kind as keyof typeof DINER_RULES.nodeRewards] ?? 0;
        state.buzz = [...state.buzz, now].slice(-DINER_RULES.buzzMax);
        if (["busy", "special"].includes(node.kind) && dinerHash(`${run.seed}:${node.id}:scrap`) % 3 === 0) awardScrap(state, `${run.id}:${node.id}`);
        if(run.serviceEffect?.kind==='rival')awardScrap(state,`${run.id}:${node.id}:rival`);
        if (node.kind === "finale") { state.collections.routeWins = [...new Set([...state.collections.routeWins, run.routeId])]; state.collections.trophies = [...new Set([...state.collections.trophies, `${run.routeId}:finale`, ...(run.spices.length ? [`${run.routeId}:spices:${run.spices.length}`] : [])])]; const missing = run.discoveryVersion===2?undefined:ROUTES.find(r => r.id === run.routeId)!.recipeIds.find(id => !state.recipes[id]&&!RECIPE_KITS.some(kit=>kit.recipeId===id)); if (missing) state.recipes[missing] = { level: 0 }; finishRun(state, "won"); }
        else advanceNode(state); break;
      }
      case "goHome": {
        if (canCancelDinerRun(state)) {
          // Reuse the reservation so cancelling cannot reroll maps or consume a run.
          state.runsStarted = Math.max(0, state.runsStarted - 1);
          state.run = null;
        } else if (!state.run || state.run.position) fail("between_stops", "Go home from the map between stops. Pause a service to take a break.");
        else finishRun(state, "home");
        break;
      }
      case "chooseGift": {
        const run = state.run, node = currentNode(state); if (!run || !node || !["bonus", "ingredients"].includes(node.kind) || !["coins", "ingredients", "special"].includes(command.choice)) fail("no_gift", "Choose a gift at a bonus stop or ingredient stall.");
        if (command.choice === "ingredients") grantTruckIngredient(state);
        else if (command.choice === "coins") run.haul += DINER_RULES.bonusCoins;
        else { if (run.specials.length >= 3) fail("specials_full", "Three daily specials are already aboard."); run.specials.push(["early_bird", "sharp_knives", "big_tipper"][run.specials.length]); }
        advanceNode(state); break;
      }
      case 'eventChoice':case 'eventInput':{
        const run=state.run,node=currentNode(state);if(!run||run.practice||!node||node.kind!=='event'||!run.event)fail('no_event','Choose a roadside event first.');
        const action:EventAction=command.type==='eventChoice'?{type:'choice',choiceId:command.choiceId}:command.action;
        const result=dispatchDinerEvent(run.event,action,{haul:run.haul,routeRecipeIds:[...ROUTES.find(r=>r.id===run.routeId)!.recipeIds],seed:`${run.seed}:${node.id}`});if(result.error)fail('event_input',result.error);run.event=result.event;
        if(result.outcome){const outcome=result.outcome;run.haul+=outcome.haulDelta;run.strikes+=outcome.strikes;run.lastEventResult=result.event.result;if(outcome.nextService)run.nextService=outcome.nextService;
          if(outcome.recruitId){const recruit=RECRUITS.find(r=>r.id===outcome.recruitId);if(recruit&&!state.staffMembers.some(member=>member.id===recruit.id)&&state.staffMembers.length<11){state.staffMembers.push({...recruit,named:true,outfit:state.cosmetics.uniform,look:state.staffMembers.length%8});if(state.home.staff.chefs+state.home.staff.waiters+(state.home.staff.cashiers??0)<staffSlots(state))state.home.staff[recruit.role==='chef'?'chefs':'waiters']++;}}
          if(run.strikes>=runStrikeLimit(state)){finishRun(state,'failed');break;}
          const skip=outcome.skipRows??0;advanceNode(state);for(let i=0;i<skip;i++){const next=run.map.filter(n=>run.available.includes(n.id));if(next.some(n=>n.kind==='finale')){run.lastEventResult='The rain passed before the finale. Your final stop is still waiting.';break;}run.available=[...new Set(next.flatMap(n=>n.next))];}
        }break;
      }
      case 'startRally':if(state.run||state.rally.service)fail('run_active','Return home before starting a weekly rally.');else {if(state.homeTask?.phase==='working'){state.homeTask.phase='paused';state.homeTask.gesture=emptyHomeGesture();}state.rally=startRally(state.rally,now);break;}
      case 'rallyService':{const result=dispatchRally(state.rally,command.action);if(result.error)fail('no_rally',result.error);state.rally=result.rally;break;}
      case 'finishRally':{const result=finishRally(state.rally);if(result.error)fail('rally_unfinished',result.error);state.rally=result.rally;if(state.rally.badge)state.collections.trophies=[...new Set([...state.collections.trophies,`rally:${state.rally.weekId}`])];break;}
      case 'endRally':if(!state.rally.service)fail('no_rally','There is no rally to close.');else {state.rally.service=null;break;}
      case "leaveNode": if (!state.run || currentNode(state)?.kind !== "shop") fail("not_at_shop", "Finish the current stop first."); else { advanceNode(state); break; }
      case "rerollShop": { const run = state.run; if (!run || currentNode(state)?.kind !== "shop" || run.rerolled || run.haul < DINER_RULES.rerollCost) fail("reroll_unavailable", "A market has one paid reroll, using carried coins."); run.haul -= DINER_RULES.rerollCost; run.rerolled = true; run.offers = shopOffers(state, "reroll"); break; }
      case "buyOffer": {
        const run = state.run, offer = run?.offers.find(o => o.id === command.offerId); if (!run || currentNode(state)?.kind !== "shop" || !offer || offer.purchased) fail("offer_unavailable", "That market offer is unavailable."); if (run.haul < offer.price) fail("not_enough_haul", "Only carried coins can be spent on the road.");
        if((offer.kind==="equipment"||offer.kind==="upgrade")&&!isTruckEquipmentAvailable(offer.target))fail("offer_unavailable","This equipment is not available in the current kitchen.");
        if(offer.kind==='recipe'&&(!owns(RECIPE_BY_ID,offer.target)||owns(state.recipes,offer.target)))fail('offer_unavailable','This recipe is already learned or unavailable.');
        if(offer.kind==='equipment'&&state.equipment[offer.target]?.truckOwned)fail('offer_unavailable','This equipment is already owned.');
        if(offer.kind==='upgrade'&&(!state.equipment[offer.target]?.truckOwned||!EQUIPMENT_BY_ID[offer.target].tiers.some(t=>t.tier===state.equipment[offer.target].tier+1)))fail('offer_unavailable','This upgrade is no longer available.');
        run.haul -= offer.price; offer.purchased = true;
        if (offer.kind === "recipe") state.recipes[offer.target] ??= { level: 0 };
        else if (offer.kind === "equipment") { const owned = state.equipment[offer.target],def=EQUIPMENT_BY_ID[offer.target],homeGift=isHomeEquipmentAvailable(def.id)&&['cooking','prep','cleaning'].includes(def.family); state.equipment[offer.target] = { tier: owned?.tier ?? 1, truckOwned: true, homeCopies: (owned?.homeCopies ?? 0)+Number(homeGift) }; if(['table_1','table_2','table_4'].includes(offer.target))state.truckConfig.tableCopies[offer.target as TruckTableId]++; }
        else if (offer.kind === "upgrade") state.equipment[offer.target].tier++;
        else grantTruckIngredient(state);
        routeTier(state); break;
      }
      case "setTruckMenu": {
        const run = state.run;
        if (state.rally.service || (run?.position && run.service?.phase !== "setup") || !validNewTruckMenu(state, command.recipeIds)) fail("invalid_menu", `Choose up to ${truckMenuCapacity(state)} owned recipes during setup or between stops. Grow your truck for a larger menu.`);
        if ((run?.spices??state.truckConfig.spices).includes("full_menu") && command.recipeIds.length < 3) fail("invalid_menu", "Turn off the full-menu spice before choosing fewer than three recipes.");
        const loadout = truckLoadout(state);
        state.truckConfig.menu = [...command.recipeIds];
        if (run) { run.menu = [...command.recipeIds]; if (run.service) run.service = createService({ ...run.service.config, plateCount:undefined, cupCount:undefined, bowlCount:undefined, menu: run.menu, ...loadout }); }
        break;
      }
      case "setupLayout": {
        const run = state.run, service = run?.service;
        if (run && (!service || service.phase !== "setup")) fail("setup_only", "Arrange the truck at home or before opening this service.");
        if(state.rally.service)fail('setup_only','Finish the rally before changing your own truck.');
        const loadout = ownedTruckLayout(state, command);
        rememberTruckLayout(state, loadout);
        if (run && service) run.service = createService({ ...service.config, plateCount:undefined, cupCount:undefined, bowlCount:undefined, ...loadout }); break;
      }
      case 'buyTruckTable': {
        if(state.rally.service||(state.run&&state.run.service?.phase!=='setup'))fail('setup_only','Buy seating at home or before opening service.');
        if(![1,2,4].includes(command.capacity))fail('invalid_table','Choose a table with one, two, or four chairs.');
        const id=`table_${command.capacity}` as TruckTableId;
        if(state.truckConfig.tableCopies[id]>=100)fail('storage_full','Your trailer already has enough of this table.');
        spend(TRUCK_TABLE_PRICES[command.capacity]);
        state.truckConfig.tableCopies[id]++;
        state.equipment[id]??={tier:1,truckOwned:true,homeCopies:0};state.equipment[id].truckOwned=true;
        break;
      }
      case 'buyTruckRecipe': {
        fail('recipe_unavailable','Find recipes at roadside markets, starting with the second market you visit on a trip.');
      }
      case 'buyRecipeKit': {
        fail('recipe_kit_unavailable','Equipment and recipes are discovered separately at roadside markets. Your earlier purchases remain yours.');
      }
      case 'buyTruckEquipment':
      case 'upgradeTruckEquipment': {
        const desired=command.type==='buyTruckEquipment'?'buy':'upgrade';
        const offer=truckEquipmentShop(state).find(offer=>offer.equipmentId===command.equipmentId&&offer.action===desired);
        if(!offer||!offer.available)fail('equipment_unavailable',offer?.reason??'Choose an available truck utility or upgrade.');
        spend(offer.price);
        const owned=state.equipment[offer.equipmentId];state.equipment[offer.equipmentId]={tier:offer.tier,truckOwned:true,homeCopies:owned?.homeCopies??0};
        if(state.run?.service){const service=state.run.service;state.run.service=createService({...service.config,plateCount:undefined,cupCount:undefined,bowlCount:undefined,...truckLoadout(state)});}
        break;
      }
      case "collectTill": { const till = state.home.till, coins = Math.floor(till.coins), rep = Math.floor(till.reputation); state.coins += coins; state.reputation += rep; till.coins -= coins; till.reputation -= rep; till.filledMs = 0; updateLevel(state); break; }
      case "claimCrate": claimDailyIngredientParcel(state);break;
      case "buyIngredient": { if (state.daily.market || !state.daily.marketOffers.includes(command.ingredientId)) fail("offer_unavailable", "Choose one of today's three ingredient offers."); const ingredient = INGREDIENT_BY_ID[command.ingredientId]; spend(DINER_RULES.marketPrices[ingredient.rarity]); addIngredient(state, ingredient.id); state.daily.market = true; break; }
      case "plantGarden": if (!owns(INGREDIENT_BY_ID,command.ingredientId) || state.restaurantLevel < 3) fail("garden_locked", "A garden plot opens at restaurant level 3."); else { state.home.garden = { plantedAt: now, ingredientId: command.ingredientId }; break; }
      case "harvestGarden": if (state.restaurantLevel < 3 || state.daily.garden || now - state.home.garden.plantedAt < 8 * DINER_RULES.hourMs) fail("garden_not_ready", "Your daily harvest needs a level-3 garden and eight growing hours."); else { addIngredient(state, state.home.garden.ingredientId); state.daily.garden = true; state.home.garden.plantedAt = now; break; }
      case "greetRegular": if (state.daily.kindness) fail("already_claimed", "Today's small kindness is already collected."); else { addIngredient(state, ingredientFor(state, "kindness")); state.daily.kindness = true; break; }
      case "upgradeRecipe": { const recipe = RECIPE_BY_ID[command.recipeId], owned = state.recipes[command.recipeId]; if (!owns(RECIPE_BY_ID,command.recipeId) || !owns(state.recipes,command.recipeId) || owned.level >= DINER_RULES.maxDishLevel) fail("recipe_unavailable", "Choose an owned recipe below level 10."); if (recipe.ingredients.some(id => (state.pantry[id] ?? 0) < 1)) fail("ingredients_needed", "Collect one full set of this dish's ingredients."); recipe.ingredients.forEach(id => state.pantry[id]--); owned.level++; if (owned.level === 10) { state.collections.trophies.push(`mastered:${recipe.id}`); state.collections.regulars[`fan:${recipe.id}`] ??= 0; } break; }
      case "buyHomeEquipment": { const id=command.equipmentId,error=homeEquipmentPurchaseError(state,id);if(error)fail('discover_first',error);const def=EQUIPMENT_BY_ID[id];state.equipment[id]??={tier:1,truckOwned:false,homeCopies:0};const owned=state.equipment[id];spend(def.tiers.find(t => t.tier === owned.tier)!.price * DINER_RULES.homeEquipmentMultiplier);owned.homeCopies++;break; }
      case "homeLayout": { const error = validateDinerHomePlacement(state, command.layout); if (error) fail("invalid_layout", error); state.home.layout = structuredClone(command.layout);if(state.homeTask){if(!homeTaskTarget(state,state.homeTask.incidentId))state.homeTask=null;else {state.homeTask.phase="paused";state.homeTask.gesture=emptyHomeGesture();}} break; }
      case "setHomeMenu": { const menu = command.menu; if (!menu || COURSES.some(course => !Array.isArray(menu[course]) || menu[course].length > menuSlots(state) || new Set(menu[course]).size !== menu[course].length || menu[course].some(id => !state.recipes[id] || RECIPE_BY_ID[id]?.course !== course || RECIPE_BY_ID[id].steps.some(s => !state.home.layout.some(p => p.equipmentId === s.station))))) fail("invalid_menu", "Use owned dishes, their installed stations, and your course slots."); state.home.menu = structuredClone(menu); break; }
      case "hire": { if (!["chef", "waiter"].includes(command.role) || state.home.staff.chefs + state.home.staff.waiters + (state.home.staff.cashiers??0) >= staffSlots(state)) fail("staff_full", "Your next restaurant level will make room for more staff."); spend(500); state.home.staff[command.role === "chef" ? "chefs" : "waiters"]++; const count = state.staffMembers.length; state.staffMembers.push({ id: `hired-${count}`, name: `${command.role === "chef" ? "Chef" : "Waiter"} ${count + 1}`, role: command.role, named: false, outfit: state.cosmetics.uniform, look: count % 8 }); break; }
      case "setSpices": {
        if (state.run || !Array.isArray(command.spiceIds) || command.spiceIds.length > SPICES.length || new Set(command.spiceIds).size !== command.spiceIds.length || command.spiceIds.some(id => !(SPICES as readonly string[]).includes(id)) || (command.spiceIds.length > 0 && !state.collections.routeWins.length)) fail("spices_locked", "Choose spices at home after your first route win.");
        if (command.spiceIds.includes("full_menu") && state.truckConfig.menu.length < 3) fail("invalid_menu",truckMenuCapacity(state)<3?"Grow your truck before choosing the full-menu spice. It needs three recipes.":"Choose at least three recipes before the full-menu spice.");
        state.truckConfig.spices = [...command.spiceIds]; break;
      }
      case "assignHelper": {
        const slot=command.slot===undefined?0:command.slot,otherId=slot===0?state.truckConfig.helperId2:state.truckConfig.helperId;
        if (state.run || state.rally.service || ![0,1].includes(slot) || (command.staffId !== null && (!state.staffMembers.some(member => member.id === command.staffId) || TRUCK_TIERS[state.truckTier].helpers <= slot || otherId===command.staffId)) || (command.role !== undefined && !["washer", "runner", "prep"].includes(command.role))) fail("helper_unavailable", "Assign different crew members at home. The first seat opens at truck tier 2; the second at tier 4.");
        if(slot===0){state.truckConfig.helperId = command.staffId; state.truckConfig.helperRole = command.role ?? "washer";}
        else {state.truckConfig.helperId2=command.staffId;state.truckConfig.helperRole2=command.role??"washer";}
        break;
      }
      case "staffMeal": if (state.daily.staffMeal || !owns(RECIPE_BY_ID,command.recipeId) || !owns(state.recipes,command.recipeId)) fail("meal_unavailable", "Choose one owned dish for today's staff meal."); else { state.daily.staffMeal = command.recipeId; break; }
      case "serveRegular": {
        const regular = REGULARS.find(member => member.id === command.regularId);
        if (!regular || !regularAvailable(state, regular.id) || state.daily.regularServed.includes(regular.id) || (state.daily.regularProgress[regular.id] ?? 0) + 1e-9 < DINER_RULES.regularDailyServings) fail("regular_not_ready", "Keep their favourite on a working menu, then greet them after a meal. Each regular visits once daily.");
        state.daily.regularServed.push(regular.id); const before = state.collections.regulars[regular.id] ?? 0, count = before + 1; state.collections.regulars[regular.id] = count;
        if (regularLevel(before) < 3 && regularLevel(count) >= 3) { state.decorOwned[regular.memento] = Math.max(1, state.decorOwned[regular.memento] ?? 0); state.collections.mementos = [...new Set([...state.collections.mementos, regular.memento])]; }
        if (regularLevel(before) < 5 && regularLevel(count) >= 5) awardScrap(state, `friendship:${regular.id}`);
        break;
      }
      case "helpIncident":case "beginHomeTask": {
        if(state.run||state.rally.service)fail('home_task_unavailable','Return home before working on a restaurant job.');
        const incident = homeTaskTarget(state,command.incidentId);
        if (!incident || now < incident.availableAt) fail("incident_unavailable", "That little job is not waiting here now.");
        // Selecting is never rewarded. A different job explicitly resets unfinished work.
        state.homeTask={incidentId:incident.id,progressTicks:incident.kind==='crate'?incident.progressTicks:state.homeTask?.incidentId===incident.id?state.homeTask.progressTicks:0,phase:'ready',gesture:emptyHomeGesture()};break;
      }
      case 'homeTaskInput':{
        const action=command.action;
        if(action.type==='pause'||(action.type==='hold'&&!action.active)){if(state.homeTask){state.homeTask.phase='paused';state.homeTask.gesture=emptyHomeGesture();}break;}
        // A midnight boundary expires yesterday's work without repeatedly rejecting the clock.
        if(dayChanged&&action.type==='tick')break;
        if(state.run||state.rally.service||!state.homeTask)fail('home_task_unavailable','Choose an available restaurant job at home.');
        const task=state.homeTask,incident=homeTaskTarget(state,task.incidentId);
        if(!incident||now<incident.availableAt)fail('incident_unavailable','That little job is not waiting here now.');
        task.gesture??=emptyHomeGesture();
        if(action.type==='hold')fail('gesture_required','Drag the cloth across the spill, or open the parcel parts.');
        if(action.type==='strokeStart'){
          if(incident.kind!=='spill'||!homePointNear(action.point,incident,HOME_GESTURE_RULES.startRadius))fail('spill_target_required','Put the cloth on the spill to begin.');
          task.gesture={...emptyHomeGesture(),point:{...action.point}};task.phase='working';break;
        }
        if(action.type==='stroke'){
          if(incident.kind!=='spill'||task.phase!=='working')fail('home_task_paused','Start dragging on the spill first.');
          task.gesture=addHomeStroke(task.gesture,action.point,incident,task.progressTicks/incident.requiredTicks);break;
        }
        if(action.type==='parcel'){
          if(incident.kind!=='delivery'&&incident.kind!=='crate')fail('parcel_required','Choose a delivery parcel.');
          const stage=parcelStage(task.progressTicks,incident.requiredTicks);
          if(PARCEL_PARTS[stage]!==action.part||task.gesture.creditTicks>0)fail('parcel_part_required','Remove the tape, then open each flap.');
          task.gesture={...emptyHomeGesture(),creditTicks:parcelStageEnd(stage,incident.requiredTicks)-task.progressTicks};task.phase='working';break;
        }
        if(task.phase!=='working')fail('home_task_paused','Drag over the spill or open the next parcel part.');
        const worked=Math.min(action.ticks,task.gesture.creditTicks);
        task.progressTicks=Math.min(incident.requiredTicks,task.progressTicks+worked);task.gesture.creditTicks-=worked;
        if(incident.kind==='crate')state.daily.crateProgressTicks=task.progressTicks;
        if(task.progressTicks===incident.requiredTicks){if(incident.kind==='crate')claimDailyIngredientParcel(state);else {state.daily.incidentClaims.push(incident.id);state.coins+=incident.reward;state.homeTask=null;}}
        else if(incident.kind!=='spill'&&task.gesture.creditTicks===0)task.phase='ready';
        break;
      }
      case "buyDecor": { const decor = DECOR_BY_ID[command.decorId]; if (!decor || decor.memento) fail("decor_unavailable", "This keepsake is earned through friendship."); if(decor.ceiling&&!state.home.roomPlan)fail('ceiling_unavailable','Renovate this legacy room before buying ceiling decorations.'); if((state.decorOwned[decor.id]??0)>=MAX_DECOR_COPIES)fail("decor_storage_full","Sell a stored copy before buying another."); spend(decor.price); state.decorOwned[decor.id] = (state.decorOwned[decor.id] ?? 0) + 1; break; }
      case 'sellDecor': {
        const price=decorResaleValue(command.decorId);
        if(price===null)fail('decor_unsellable','Friendship keepsakes stay in your collection.');
        if(state.run||state.rally.service)fail('run_active','Return home before selling restaurant decorations.');
        const count=state.decorOwned[command.decorId]??0,placed=state.home.layout.filter(p=>p.equipmentId===command.decorId).length;
        if(count<=placed)fail('decor_not_stored','Store a spare copy before selling it.');
        if(!Number.isSafeInteger(state.coins+price))fail("coin_limit","The coin balance cannot hold this sale yet.");
        state.decorOwned[command.decorId]=count-1;state.coins+=price;
        // A saved arrangement is a furnishing plan, never a second inventory.
        // Remove only excess references to this sold copy; preserve every other
        // furnishing and room boundary in favourites and renovation snapshots.
        const keepOwned=(layout:HomePlacement[])=>{let used=0;return layout.filter(p=>p.equipmentId!==command.decorId||++used<count);};
        for(const saved of state.savedLayouts)saved.layout=keepOwned(saved.layout);
        for(const backup of state.renovation.backups)backup.layout=keepOwned(backup.layout);
        break;
      }
      case "buyFinish": {
        const price = finishPrice(command.slot, command.id);
        if (price === null) fail("cosmetic_unavailable", "Choose an available floor or wall finish.");
        if (!state.finishOwned[command.slot].includes(command.id)) {
          spend(price);
          state.finishOwned[command.slot].push(command.id);
        }
        state.cosmetics[command.slot] = command.id;
        break;
      }
      case "setCosmetic": {
        const values = command.slot === "wrap" ? COSMETICS.wraps : command.slot === "horn" ? COSMETICS.horns : command.slot === "uniform" ? COSMETICS.uniforms : command.slot === "floor" ? COSMETICS.floors : command.slot === "wall" ? COSMETICS.walls : [];
        if (!(values as readonly string[]).includes(command.id)) fail("cosmetic_unavailable", "Choose an available finish.");
        if ((command.slot === "floor" || command.slot === "wall") && !state.finishOwned[command.slot].includes(command.id)) fail("finish_not_owned", "Preview and buy this finish before applying it.");
        state.cosmetics[command.slot] = command.id; if (command.slot === "uniform") state.staffMembers.forEach(member => { member.outfit = command.id; }); break;
      }
      case "skinEquipment": { const placement = state.home.layout.find(item => item.id === command.placementId); if (!placement || !(COSMETICS.skins as readonly string[]).includes(command.skinId)) fail("cosmetic_unavailable", "Choose a placed furnishing and an available finish."); placement.skin = command.skinId; break; }
      case "saveLayout": {
        if (typeof command.name !== "string" || state.savedLayouts.length >= 3) fail("layouts_full", "Save up to three named room layouts.");
        const name = command.name.replace(/[\u0000-\u001f\u202a-\u202e<>]/g, "").trim().slice(0, 24); if (!name) fail("invalid_name", "Give this layout a short name.");
        state.savedLayouts.push({ id: `layout-${state.savedLayouts.length + 1}`, name, layout: structuredClone(state.home.layout), menu: structuredClone(state.home.menu), room:{w:state.home.w,h:state.home.h,roomPlan:state.home.roomPlan?structuredClone(state.home.roomPlan):undefined} }); break;
      }
      case "loadLayout": {
        const saved = state.savedLayouts.find(layout => layout.id === command.layoutId); if (!saved) fail("layout_unavailable", "Choose one of your saved rooms.");
        const error = validateDinerHome(state, saved.layout); if (error) fail("invalid_layout", error);
        state.home.layout = structuredClone(saved.layout); state.home.menu = structuredClone(saved.menu);if(state.homeTask){if(!homeTaskTarget(state,state.homeTask.incidentId))state.homeTask=null;else {state.homeTask.phase="paused";state.homeTask.gesture=emptyHomeGesture();}} break;
      }
      case "expandHome": { if(state.home.roomPlan)fail("renovation_required","Preview the next restaurant stage before renovating."); const next = state.home.expansion + 1; if (next >= DINER_RULES.floors.length || state.restaurantLevel < DINER_RULES.expansionLevels[next]) fail("expansion_locked", "Reach the restaurant level for the next room first."); spend(DINER_RULES.expansionPrices[next]); state.home.expansion = next; state.home.w = state.home.h = DINER_RULES.floors[next]; break; }
      case "settings": if (command.cosy !== undefined) { if (typeof command.cosy !== "boolean" || state.run) fail("run_active", "Choose cosy mode before leaving home."); state.settings.cosy = command.cosy; } if (command.name !== undefined) { if (typeof command.name !== "string") fail("invalid_name", "Choose a short diner name."); state.home.name = command.name.replace(/[\u0000-\u001f\u202a-\u202e<>]/g, "").trim().slice(0, 24) || "My little diner"; } break;
      default: fail("invalid_command", "That diner action is unavailable.");
    }
    return { state };
  } catch (error) { return { state: current, error: error instanceof Error ? error.message : "That action could not be completed.", code: typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "invalid_command" }; }
}
