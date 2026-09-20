import { buildServiceLoadout } from './geometry';
import { createService, dispatchService, serviceResult } from './service';
import type { ServiceAction, ServiceState } from './types';

export const RALLY_RULES={version:1,weekMs:604800000,customers:12,tier:2,menu:['classic_burger','fries','lemonade'],recipeLevel:0,equipmentTier:1} as const;
export type DinerRally={version:1;weekId:string;seed:string;bestScore:number;attempts:number;completed:number;service:ServiceState|null;lastScore:number|null;badge:boolean};
export function rallyWeek(now:number):string {const monday=Math.floor((Math.max(0,now)-345600000)/RALLY_RULES.weekMs);return `diner-week-${monday}`;}
export function createRally(now:number):DinerRally {const weekId=rallyWeek(now);return {version:1,weekId,seed:`${weekId}:equal-diner-v1`,bestScore:0,attempts:0,completed:0,service:null,lastScore:null,badge:false};}
export function startRally(previous:DinerRally,now:number):DinerRally {
  const rally=previous.weekId===rallyWeek(now)?structuredClone(previous):createRally(now);if(rally.service)return rally;
  const menu=[...RALLY_RULES.menu],layout=buildServiceLoadout(2,menu);rally.attempts++;rally.lastScore=null;
  rally.service=createService({seed:rally.seed,tier:2,menu,customers:RALLY_RULES.customers,arrivalTicks:280,queuePatienceTicks:1600,tablePatienceTicks:1100,recipeLevels:Object.fromEntries(menu.map(id=>[id,0])),stations:layout.stations,tables:layout.tables,helpers:[],practice:true,cosy:false,strikeLimit:3});return rally;
}
/** The input tape owns the score. There is no submit-score or prize balance field. */
export function dispatchRally(previous:DinerRally,action:ServiceAction):{rally:DinerRally;error?:string} {
  if(!previous.service)return {rally:previous,error:'Start this week’s rally first.'};
  const rally=structuredClone(previous);rally.service=dispatchService(rally.service!,action);return {rally};
}
export function rallyScore(service:ServiceState):number {
  if(!['complete','failed'].includes(service.phase))return 0;
  const completed=serviceResult(service).completed;return Math.max(0,service.paid*100+service.coins+Math.max(0,service.combo)*10-service.strikes*75+(completed?500:0));
}
export function finishRally(previous:DinerRally):{rally:DinerRally;error?:string} {
  if(!previous.service||!['complete','failed'].includes(previous.service.phase))return {rally:previous,error:'Finish the rally service first.'};
  const rally=structuredClone(previous),score=rallyScore(rally.service!);rally.bestScore=Math.max(rally.bestScore,score);rally.lastScore=score;if(rally.service!.phase==='complete'){rally.completed++;rally.badge=true;}rally.service=null;return {rally};
}
