import type {DinerTier,CreateServiceOptions,CustomerType} from './types';
import type {DinerState} from './progression';
export type RouteEnvironment='street'|'festival'|'business'|'boardwalk'|'night_market';
export interface RouteDefinition {version:1;customerPool:readonly CustomerType[];id:string;name:string;tier:DinerTier;requires:string|null;environment:RouteEnvironment;marketPool:number;truckReward?:DinerTier;customerReward?:'party'|'business';giftRewards?:string[];description:string;availableFrom?:number;availableUntil?:number}
export const ROUTE_DEFINITIONS:readonly RouteDefinition[]=[
  {version:1,customerPool:["walk_in","kid"],id:'downtown',name:'Downtown',tier:1,requires:null,environment:'street',marketPool:1,truckReward:2,description:'Your neighbourhood lunch route. Learn burgers, then try a three-portion basket of fries.'},
  {version:1,customerPool:["party"],id:'festival',name:'Music Festival',tier:2,requires:'downtown',environment:'festival',marketPool:2,truckReward:3,customerReward:'party',description:'Grass, music and dancing guests. Food pays 35% more; keep up with cleanup.'},
  {version:1,customerPool:["business"],id:'business_center',name:'Business Center',tier:3,requires:'festival',environment:'business',marketPool:3,truckReward:4,customerReward:'business',description:'A brisk office lunch. Guests choose your priciest dishes, expect speed and tip well.'},
  {version:1,customerPool:["walk_in","office","kid"],id:'boardwalk',name:'Boardwalk',tier:4,requires:'business_center',environment:'boardwalk',marketPool:2,description:'A seaside outing with familiar favourites and a bigger kitchen.'},
  {version:1,customerPool:["walk_in","office","critic"],id:'night_market',name:'Night Market',tier:4,requires:'boardwalk',environment:'night_market',marketPool:3,description:'Lanterns, late-night favourites and your most ambitious menu.'},
];
export interface JourneyProgress {version:1;legacyAccess:string[];legacyRenovation:boolean}
export function newJourney():JourneyProgress{return {version:1,legacyAccess:[],legacyRenovation:false};}
export function migrateJourney(state:DinerState):void {
  if(!state.journey)state.journey={version:1,legacyAccess:[...(state.truckTier>=2?['boardwalk']:[]),...(state.truckTier>=3?['night_market']:[])],legacyRenovation:state.collections.routeWins.includes('boardwalk')};
}
export function routeAccess(state:DinerState,id:string,now=state.updatedAt):string|null {
  const route=ROUTE_DEFINITIONS.find(r=>r.id===id);if(!route)return 'This destination is unavailable.';
  if(route.availableFrom!==undefined&&now<route.availableFrom)return 'This seasonal route has not opened yet.';
  if(route.availableUntil!==undefined&&now>=route.availableUntil)return 'This seasonal route has ended. Your keepsakes remain yours.';
  if(!route.requires||state.journey?.legacyAccess.includes(id)||state.collections.routeWins.includes(id)||state.collections.routeWins.includes(route.requires))return null;
  return `Clear ${ROUTE_DEFINITIONS.find(r=>r.id===route.requires)?.name??route.requires} to open this route.`;
}
export function recipeDiscoveryRank(route:string):number{return ROUTE_DEFINITIONS.find(definition=>definition.id===route)?.marketPool??1;}
export function destinationService(routeId:string,day:number,finale:boolean,menuSize:number):Partial<CreateServiceOptions>{
  const definition=ROUTE_DEFINITIONS.find(route=>route.id===routeId);
  if(!['festival','business_center'].includes(routeId))return definition&&(definition.availableFrom!==undefined||definition.availableUntil!==undefined)?{destinationVersion:1,environment:definition.environment,customerTypes:[...definition.customerPool]}:{};
  const festival=routeId==='festival';
  return {destinationVersion:1,environment:festival?'festival':'business',customers:finale?20:[10,12,14,14,16,16,18,20][Math.min(7,day)],arrivalTicks:540+(menuSize>2?40:0),maxWaitingCustomers:day<2?2:3,queuePatienceTicks:3600,tablePatienceTicks:3000,pacingVersion:2,pacingProfile:'destination',customerTypes:festival?(finale?['party']:day===0?['party','walk_in']:['party','party','party','walk_in']):[...(definition?.customerPool??['business'])],cleanupLesson:festival&&day===0};
}
