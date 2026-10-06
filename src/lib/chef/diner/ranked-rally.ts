import {createRally,startRally,rallyScore,rallyWeek,RALLY_RULES} from './rally';
import {createService,dispatchService} from './service';
import {makeStation,makeTable,validateServiceLayout} from './geometry';
import {validateCommand} from './progression';
import {DinerAuthorityError} from './authority';
import type {ServiceState,ServiceAction} from './types';
export const RANKED_RULES={version:1,maxActions:128,maxTicks:100,maxBytes:48000,maxGapMs:5000,graceMs:1800000} as const;
export type RankedLayout={stations:{id:string;kind:ServiceState['stations'][number]['kind'];x:number;y:number;facing:0|1|2|3}[];tables:{id:string;x:number;y:number;capacity:1|2|4;rotation:0|1|2|3}[]};
export type RankedCommand={type:'service';action:ServiceAction}|({type:'layout'}&RankedLayout)|{type:'finish'|'abandon'};
export interface RankedAttempt {version:1;id:string;wallet:string;weekId:string;startedAt:number;revision:number;clock:{lastAt:number;creditMs:number};service:ServiceState;status:'active'|'complete'|'abandoned';score:number|null;eligible:boolean;finishedAt?:number}
export type RankedEnvelope={id:string;attemptId:string;revision:number;commands:RankedCommand[]};
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const fail=(code:string,message:string,status=400):never=>{throw new DinerAuthorityError(code,message,status);};
export function rankedWeekEnd(weekId:string){const match=/^diner-week-(-?\d+)$/.exec(weekId);if(!match)fail('invalid_week','This rally week is unavailable.');return (Number(match![1])+1)*RALLY_RULES.weekMs+345600000;}
export function createRankedAttempt(id:string,wallet:string,now:number):RankedAttempt{
 if(!uuid(id)||!/^0x[0-9a-f]{40}$/.test(wallet)||!Number.isSafeInteger(now))fail('invalid_attempt','Choose a valid signed-in rally attempt.');
 return {version:1,id,wallet,weekId:rallyWeek(now),startedAt:now,revision:0,clock:{lastAt:now,creditMs:0},service:startRally(createRally(now),now).service!,status:'active',score:null,eligible:false};
}
export function validateRankedEnvelope(raw:unknown):RankedEnvelope{
 const e=raw as RankedEnvelope;
 if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!['id','attemptId','revision','commands'].includes(k))||!uuid(e.id)||!uuid(e.attemptId)||!Number.isSafeInteger(e.revision)||e.revision<0||!Array.isArray(e.commands)||!e.commands.length||e.commands.length>RANKED_RULES.maxActions)fail('invalid_rally_input','Send an attempt ID, revision and ordered cooking inputs.');
 let ticks=0;
 for(const c of e.commands){if(!c||typeof c!=='object'||Array.isArray(c))fail('invalid_rally_input','Only cooking actions can be submitted.');
  if(c.type==='service'){try{validateCommand(c);}catch{fail('invalid_rally_action','Send cooking inputs, never scores or a saved kitchen.');}if(c.action.type==='tick')ticks+=c.action.ticks;}
  else if(c.type==='layout'){if(Object.keys(c).some(k=>!['type','stations','tables'].includes(k))||!Array.isArray(c.stations)||!Array.isArray(c.tables)||c.stations.length>30||c.tables.length>12)fail('invalid_rally_layout','Arrange only the equipment loaned for this week.');}
  else if(!['finish','abandon'].includes(c.type)||Object.keys(c).length!==1)fail('invalid_rally_input','This command is not part of a rally attempt.');
 }
 if(ticks>RANKED_RULES.maxTicks)fail('rally_tape_too_long','Save at least every five seconds during a rally.');
 return e;
}
export const rankedActive=(s:ServiceState)=>['playing','preparing','closing'].includes(s.phase);
export function arrangeRanked(service:ServiceState,layout:RankedLayout):ServiceState{return arrangeLoanedService(service,layout,startRally(createRally(0),0).service!);}
export function arrangeLoanedService(service:ServiceState,layout:RankedLayout,loan:ServiceState):ServiceState{
 if(service.phase!=='setup')fail('rally_open','Arrange the loaned equipment before preparation begins.');
 // Canonical inventory comes from the weekly start, not generic defaults.

 const coordinates=(p:{x:number;y:number})=>Number.isInteger(p.x)&&Number.isInteger(p.y);
 if(layout.stations.some(p=>!p||typeof p!=='object')||layout.tables.some(p=>!p||typeof p!=='object'))fail('rally_inventory','Use valid loaned stations and tables.');
 if(layout.stations.length!==loan.stations.length||layout.tables.length!==loan.tables.length||new Set(layout.stations.map(p=>p.id)).size!==layout.stations.length||new Set(layout.tables.map(p=>p.id)).size!==layout.tables.length)fail('rally_inventory','Keep every loaned station and table, exactly once.');
 for(const p of layout.stations)if(!p||Object.keys(p).some(k=>!['id','kind','x','y','facing'].includes(k))||!coordinates(p)||![0,1,2,3].includes(p.facing)||!loan.stations.some(s=>s.id===p.id&&s.kind===p.kind))fail('rally_inventory','Purchased equipment cannot enter a ranked rally.');
 for(const p of layout.tables)if(!p||Object.keys(p).some(k=>!['id','x','y','capacity','rotation'].includes(k))||!coordinates(p)||![0,1,2,3].includes(p.rotation)||!loan.tables.some(t=>t.id===p.id&&t.capacity===p.capacity))fail('rally_inventory','Use only this week’s loaned tables.');
 const stations=layout.stations.map(p=>makeStation(p.id,p.kind,p.x,p.y,1,p.facing)),tables=layout.tables.map(p=>makeTable(p.id,p.x,p.y,p.capacity,1,p.rotation));
 const error=validateServiceLayout(loan.config.tier,stations,tables);if(error)fail('invalid_rally_layout',error);
 return createService({...service.config,stations,tables});
}
/** Pure prediction shares actions; only server replay spends authoritative time. */
export function predictRanked(service:ServiceState,c:RankedCommand){return c.type==='service'?dispatchService(service,c.action):c.type==='layout'?arrangeRanked(service,c):service;}
export function replayRanked(current:RankedAttempt,envelope:RankedEnvelope,now:number){
 validateRankedEnvelope(envelope);
 if(envelope.attemptId!==current.id||envelope.revision!==current.revision)fail('rally_conflict','Refresh this attempt before continuing.',409);
 if(current.status!=='active')fail('rally_finished','This attempt has already finished.',409);
 if(!Number.isSafeInteger(now)||now<current.clock.lastAt)fail('invalid_clock','The rally clock is unavailable.');
 const next=structuredClone(current),elapsed=now-next.clock.lastAt;next.clock.lastAt=now;
 if(rankedActive(next.service)&&elapsed+next.clock.creditMs>RANKED_RULES.maxGapMs){next.service=dispatchService(next.service,{type:'pause'});next.clock.creditMs=0;next.revision++;return {attempt:next,interrupted:true,accepted:[{type:'service',action:{type:'pause'}}] as RankedCommand[]};}
 next.clock.creditMs=rankedActive(next.service)?next.clock.creditMs+elapsed:0;
 for(const c of envelope.commands){if(next.status!=='active')fail('rally_finished','Nothing may follow the finish action.');
  const active=rankedActive(next.service);
  if(c.type==='service'&&c.action.type==='tick'){const required=c.action.ticks*50;if(!active||required>next.clock.creditMs)throw new DinerAuthorityError('time_credit','Your rally is still saving. Retry the same action.',429,Math.max(100,required-next.clock.creditMs));next.clock.creditMs-=required;}
  if(c.type==='finish'){if(!['complete','failed'].includes(next.service.phase))fail('rally_unfinished','Finish this service before recording a result.');next.score=rallyScore(next.service);next.status='complete';next.finishedAt=now;next.eligible=now<=rankedWeekEnd(next.weekId)+RANKED_RULES.graceMs;}
  else if(c.type==='abandon'){next.status='abandoned';next.finishedAt=now;}
  else next.service=predictRanked(next.service,c);
  if(active!==rankedActive(next.service)||next.status!=='active')next.clock.creditMs=0;
 }
 next.revision++;return {attempt:next,interrupted:false,accepted:structuredClone(envelope.commands)};
}
