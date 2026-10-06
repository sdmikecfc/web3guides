import {DOMAIN_WORLDS,isDomainId,type DomainId} from './domain-worlds';
import {journeyEntryOpen,journeyCanFinish,type DomainSeason} from './domain-seasons';
import {openRoadJourney} from './journey-map';
import {RECIPE_BY_ID,EQUIPMENT_BY_ID} from './content';
import {buildServiceLoadout,makeStation,makeTable,validateServiceLayout} from './geometry';
import {createService,dispatchService} from './service';
import {rankedActive,validateRankedEnvelope,RANKED_RULES,type RankedCommand,type RankedLayout} from './ranked-rally';
import {DinerAuthorityError} from './authority';
import type {DinerNode} from './progression';
import type {ServiceState,ServiceAction} from './types';

export const DOMAIN_JOURNEY_RULES={version:1,services:8,graceMs:86400000} as const;
const fail=(code:string,message:string,status=400):never=>{throw new DinerAuthorityError(code,message,status);};
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export const domainMealIds=(domain:DomainId)=>DOMAIN_WORLDS[domain].menu.map(r=>r.id);
export const isJourneyService=(kind:DinerNode['kind'])=>['slow','medium','busy','special','finale'].includes(kind);
/** Every corridor has the same service depth, even when its stop types differ. */
export const journeyServiceIndex=(nodes:readonly DinerNode[],node:DinerNode)=>new Set(nodes.filter(n=>n.row<node.row&&isJourneyService(n.kind)).map(n=>n.row)).size;
export type JourneyReward={key:string;domain:DomainId;milestone:2|4|6|8;kind:'decor'|'completion';earnedAt:number};
export interface DomainJourneyAttempt {
 version:1;id:string;wallet:string;domain:DomainId;seasonId:string;startedAt:number;endsAt:number;revision:number;
 phase:'map'|'service'|'encounter';status:'active'|'complete'|'abandoned';outcome?:'won'|'failed'|'expired';
 clock:{lastAt:number;creditMs:number};nodes:DinerNode[];visited:string[];current:string|null;completed:string[];
 service:ServiceState;equipmentTiers:Record<string,number>;patienceBoost:boolean;helper:boolean;rewards:JourneyReward[];finishedAt?:number;
 practice:boolean;
}
export type JourneyCommand=RankedCommand|{type:'choose';nodeId:string}|{type:'encounter';choice:'equipment'|'patience'}|{type:'helper';enabled:boolean};
export type JourneyEnvelope={id:string;attemptId:string;revision:number;commands:JourneyCommand[]};

export function domainJourneyMap(domain:DomainId,seed:string):DinerNode[]{
 const names={gochujang:{shop:'Kitchen workshop',event:'The midnight market',bonus:'A gift from the brigade',ingredients:'Fermentation courtyard',finale:'Spice Street after dark'},smoothie:{shop:'Fruit Club workshop',event:'Waterfront meet-up',bonus:'A sunny surprise',ingredients:'Orchard picnic',finale:'The waterfront rush'},wines:{shop:'Cellar workshop',event:'Vineyard tasting',bonus:'The host’s gift',ingredients:'Harvest courtyard',finale:'The vintage celebration'}}[domain];
 return openRoadJourney(`${domain}:${seed}`).map(n=>({...n,name:n.kind in names?names[n.kind as keyof typeof names]:n.name}));
}
export function journeyReachable(a:DomainJourneyAttempt):DinerNode[]{
 if(a.status!=='active'||a.phase!=='map')return [];
 const ids=a.current?a.nodes.find(n=>n.id===a.current)!.next:a.nodes.filter(n=>n.row===0).map(n=>n.id);
 return a.nodes.filter(n=>ids.includes(n.id)&&!a.visited.includes(n.id));
}
export function domainService(domain:DomainId,seed:string,completed=0,kind:DinerNode['kind']='medium',tiers:Record<string,number>={},helper=false,patienceBoost=false,practice=false):ServiceState {
 const menu=domainMealIds(domain).slice(0,practice?3:completed<2?1:completed<4?2:3),full=buildServiceLoadout(3,domainMealIds(domain),tiers);
 if(full.error)throw new Error(full.error);
 const final=kind==='finale',pressure=kind==='slow'?'steady':kind==='busy'||kind==='special'?'rush':'destination';
 return createService({...full,tier:3,seed,menu,recipeLevels:Object.fromEntries(domainMealIds(domain).map(id=>[id,2])),customers:practice?3:final?20:[6,8,10,12,14,16,18,20][Math.min(7,completed)],arrivalTicks:600,
  pacingProfile:final?'finale':pressure,pacingVersion:2,demandVersion:1,domain,environment:domain==='gochujang'?'night_market':domain==='smoothie'?'boardwalk':'business',
  maxWaitingCustomers:completed<2?2:3,queuePatienceTicks:(patienceBoost?165:145)*20,tablePatienceTicks:(patienceBoost?140:120)*20,
  plateCount:6,cupCount:6,bowlCount:6,cosy:false,practice,strikeLimit:3,helpers:helper?[{id:'domain-washer',role:'washer',name:'Clear & wash'}]:[],signature:null,
 });
}
export function createDomainJourney(id:string,wallet:string,season:DomainSeason,now:number,practice=false):DomainJourneyAttempt {
 if(!uuid(id)||!/^0x[0-9a-f]{40}$/.test(wallet)||!isDomainId(season.domain)||!Number.isSafeInteger(now))fail('invalid_attempt','Start a signed-in domain journey.');
 if(!journeyEntryOpen(season,now))fail('season_closed','This journey is not accepting new attempts.',409);
 const seed=`${season.id}:journey-v1`; // Equal supplied challenge, independent of purchases or wallet.
 return {version:1,id,wallet,domain:season.domain,seasonId:season.id,startedAt:now,endsAt:season.endsAt!,revision:0,phase:'map',status:'active',clock:{lastAt:now,creditMs:0},nodes:domainJourneyMap(season.domain,seed),visited:[],current:null,completed:[],service:domainService(season.domain,`${seed}:practice`,0,'slow',{},false,false,practice),equipmentTiers:{},patienceBoost:false,helper:false,rewards:[],practice};
}
export function arrangeDomainService(a:DomainJourneyAttempt,layout:RankedLayout):ServiceState {
 if(a.phase!=='service'||a.service.phase!=='setup')fail('already_open','Arrange equipment before starting preparation.');
 const loan=buildServiceLoadout(3,domainMealIds(a.domain),a.equipmentTiers),service=a.service;
 if(!Array.isArray(layout.stations)||!Array.isArray(layout.tables)||layout.stations.length!==loan.stations.length||layout.tables.length!==loan.tables.length||new Set(layout.stations.map(p=>p?.id)).size!==layout.stations.length||new Set(layout.tables.map(p=>p?.id)).size!==layout.tables.length)fail('loan_only','Keep every supplied piece exactly once.');
 for(const p of layout.stations)if(!p||Object.keys(p).some(k=>!['id','kind','x','y','facing'].includes(k))||!Number.isInteger(p.x)||!Number.isInteger(p.y)||![0,1,2,3].includes(p.facing)||!loan.stations.some(s=>s.id===p.id&&s.kind===p.kind))fail('loan_only','Use the supplied equipment only.');
 for(const p of layout.tables)if(!p||Object.keys(p).some(k=>!['id','x','y','capacity','rotation'].includes(k))||!Number.isInteger(p.x)||!Number.isInteger(p.y)||![0,1,2,3].includes(p.rotation)||!loan.tables.some(t=>t.id===p.id&&t.capacity===p.capacity))fail('loan_only','Use the supplied seating only.');
 const stations=layout.stations.map(p=>makeStation(p.id,p.kind,p.x,p.y,loan.stations.find(s=>s.id===p.id)!.tier,p.facing)),tables=layout.tables.map(p=>makeTable(p.id,p.x,p.y,p.capacity,1,p.rotation));
 const error=validateServiceLayout(3,stations,tables);if(error)fail('invalid_layout',error);
 return createService({...service.config,stations,tables});
}
export function validateJourneyEnvelope(raw:unknown):JourneyEnvelope {
 const e=raw as JourneyEnvelope;
 if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!['id','attemptId','revision','commands'].includes(k))||!uuid(e.id)||!uuid(e.attemptId)||!Number.isSafeInteger(e.revision)||e.revision<0||!Array.isArray(e.commands)||!e.commands.length||e.commands.length>128)fail('invalid_input','Send ordered journey actions.');
 const cooking:RankedCommand[]=[];
 for(const c of e.commands){if(!c||typeof c!=='object'||Array.isArray(c))fail('invalid_input','Send journey actions only.');
  if(c.type==='choose'){if(Object.keys(c).length!==2||typeof c.nodeId!=='string'||!/^r\d+c\d+$/.test(c.nodeId))fail('invalid_stop','Choose a reachable map stop.');}
  else if(c.type==='encounter'){if(Object.keys(c).length!==2||!['equipment','patience'].includes(c.choice))fail('invalid_choice','Choose a workshop improvement or extra patience.');}
  else if(c.type==='helper'){if(Object.keys(c).length!==2||typeof c.enabled!=='boolean')fail('invalid_helper','Choose solo or the supplied washer.');}
  else cooking.push(c as RankedCommand);
 }
 if(cooking.length)validateRankedEnvelope({...e,commands:cooking});return e;
}
/** Uses only server-created state. Neither a score nor a client save is accepted. */
export function applyJourneyCommand(a:DomainJourneyAttempt,c:JourneyCommand,now:number):void {
 if(a.status!=='active')fail('attempt_finished','This journey has ended.',409);
 if(c.type==='abandon'){a.status='abandoned';a.finishedAt=now;return;}
 if(c.type==='choose'){
  const n=journeyReachable(a).find(n=>n.id===c.nodeId);if(!n)fail('unreachable_stop','Follow one of the connected roads.');
  a.current=n!.id;a.visited.push(n!.id);
  if(isJourneyService(n!.kind)){a.phase='service';const previous=a.service;const next=domainService(a.domain,`${a.seasonId}:journey-v1:${n!.id}`,a.completed.length,n!.kind,a.equipmentTiers,a.helper,a.patienceBoost,a.practice);
   // Keep the player's valid supplied layout between services.
   a.service=next;if(a.completed.length){try{a.service=arrangeDomainService(a,{stations:previous.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing})),tables:previous.tables.map(({id,x,y,capacity,rotation})=>({id,x,y,capacity,rotation}))});}catch{a.service=next;}}
  }else a.phase='encounter';return;
 }
 if(c.type==='encounter'){
  if(a.phase!=='encounter')fail('no_encounter','Reach an encounter first.');
  if(c.choice==='patience')a.patienceBoost=true;else{const machines=[...new Set(domainMealIds(a.domain).flatMap(id=>RECIPE_BY_ID[id].steps.map(s=>s.station)))],machine=machines.sort((x,y)=>(a.equipmentTiers[x]??1)-(a.equipmentTiers[y]??1)||x.localeCompare(y)).find(id=>(a.equipmentTiers[id]??1)<EQUIPMENT_BY_ID[id].tiers.length);if(!machine)fail('fully_upgraded','Your loaned machines are already fully upgraded.');a.equipmentTiers[machine!]=(a.equipmentTiers[machine!]??1)+1;}a.phase='map';return;
 }
 if(a.phase!=='service')fail('choose_service','Choose your next lunch on the map.');
 if(c.type==='helper'){if(a.service.phase!=='setup')fail('already_open','Choose help before preparation.');a.helper=c.enabled;a.service=createService({...a.service.config,stations:a.service.stations,tables:a.service.tables,helpers:c.enabled?[{id:'domain-washer',role:'washer',name:'Clear & wash'}]:[]});return;}
 if(c.type==='layout'){a.service=arrangeDomainService(a,c);return;}
 if(c.type==='finish'){
  if(!['complete','failed'].includes(a.service.phase))fail('unfinished_service','Finish this service before returning to the map.');
  if(a.service.phase==='failed'){a.status='complete';a.outcome='failed';a.finishedAt=now;return;}
  a.completed.push(a.current!);
  const milestone=a.completed.length;
  if(!a.practice&&[2,4,6,8].includes(milestone))a.rewards.push({key:`journey:${a.domain}:${milestone}`,domain:a.domain,milestone:milestone as 2|4|6|8,kind:milestone===8?'completion':'decor',earnedAt:now});
  if(milestone===8||a.practice){a.status='complete';a.outcome='won';a.finishedAt=now;}else a.phase='map';return;
 }
 if(c.type==='service')a.service=dispatchService(a.service,c.action);else fail('invalid_input','Choose a supported journey action.');
}
export function replayDomainJourney(current:DomainJourneyAttempt,envelope:JourneyEnvelope,now:number){
 validateJourneyEnvelope(envelope);
 if(envelope.attemptId!==current.id||envelope.revision!==current.revision||current.status!=='active')fail('journey_conflict','Refresh this journey before continuing.',409);
 if(!Number.isSafeInteger(now)||now<current.clock.lastAt)fail('invalid_clock','The journey clock is unavailable.');
 const next=structuredClone(current),elapsed=now-next.clock.lastAt;next.clock.lastAt=now;
 const seasonal={domain:next.domain,startsAt:next.startedAt,endsAt:next.endsAt,approved:true} as DomainSeason;
 if(!journeyCanFinish(seasonal,next.startedAt,now)){next.status='complete';next.outcome='expired';next.finishedAt=now;next.clock.creditMs=0;next.revision++;return {attempt:next,interrupted:false,accepted:[] as JourneyCommand[]};}
 const live=()=>next.phase==='service'&&rankedActive(next.service);
 if(live()&&elapsed+next.clock.creditMs>RANKED_RULES.maxGapMs){next.service=dispatchService(next.service,{type:'pause'});next.clock.creditMs=0;next.revision++;return {attempt:next,interrupted:true,accepted:[{type:'service',action:{type:'pause'}}] as JourneyCommand[]};}
 next.clock.creditMs=live()?next.clock.creditMs+elapsed:0;
 for(const c of envelope.commands){const before=live();
  if(c.type==='service'&&c.action.type==='tick'){const required=c.action.ticks*50;if(!before||required>next.clock.creditMs)throw new DinerAuthorityError('time_credit','Wait for your cooking actions to save.',429,Math.max(100,required-next.clock.creditMs));next.clock.creditMs-=required;}
  applyJourneyCommand(next,c,now);if(before!==live()||next.status!=='active')next.clock.creditMs=0;
 }
 next.revision++;return {attempt:next,interrupted:false,accepted:structuredClone(envelope.commands)};
}
