import {createService,dispatchService} from './service';
import {buildServiceLoadout,makeTable} from './geometry';
import {arrangeLoanedService,rankedActive,validateRankedEnvelope,RANKED_RULES,type RankedCommand,type RankedEnvelope,type RankedLayout} from './ranked-rally';
import {DinerAuthorityError} from './authority';
import type {ServiceState} from './types';
export const PICNIC={version:1,id:'neighbourhood-picnic-v1',name:'Neighbourhood Picnic',goal:300,qualification:3,reward:'prestige_picnic_plaque'} as const;
export interface CommunityAttempt {version:1;id:string;wallet:string;eventId:typeof PICNIC.id;startedAt:number;revision:number;clock:{lastAt:number;creditMs:number};service:ServiceState;status:'active'|'complete'|'abandoned';finishedAt?:number}
const fail=(code:string,message:string,status=400):never=>{throw new DinerAuthorityError(code,message,status);};
export function picnicService(seed:string){const loadout=buildServiceLoadout(2,['classic_burger','fries']),first=loadout.tables[0];return createService({...loadout,tables:[makeTable('picnic-table',first.x,first.y,2,1,first.rotation)],tier:2,seed,menu:['classic_burger','fries'],recipeLevels:{classic_burger:0,fries:0},helpers:[],customers:6,plateCount:4,arrivalTicks:600,pacingProfile:'slow',maxWaitingCustomers:1,queuePatienceTicks:1800,tablePatienceTicks:1400,cosy:false,practice:false,strikeLimit:3,signature:null});}
export function createCommunityAttempt(id:string,wallet:string,now:number):CommunityAttempt {
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||!/^0x[0-9a-f]{40}$/.test(wallet)||!Number.isSafeInteger(now))fail('invalid_attempt','Use a signed-in picnic attempt.');
 return {version:1,id,wallet,eventId:PICNIC.id,startedAt:now,revision:0,clock:{lastAt:now,creditMs:0},service:picnicService(`${PICNIC.id}:${id}`),status:'active'};
}
export const communityMealIds=(a:CommunityAttempt)=>a.service.customers.filter(c=>c.servedTick!==null&&c.servedTick!==undefined).map(c=>`${a.id}:${c.id}`);
export function arrangeCommunity(service:ServiceState,layout:RankedLayout){return arrangeLoanedService(service,layout,picnicService('loan'));}
export function predictCommunity(service:ServiceState,c:RankedCommand){return c.type==='service'?dispatchService(service,c.action):c.type==='layout'?arrangeCommunity(service,c):service;}
export function replayCommunity(current:CommunityAttempt,envelope:RankedEnvelope,now:number){
 validateRankedEnvelope(envelope);
 if(envelope.attemptId!==current.id||envelope.revision!==current.revision||current.status!=='active')fail('community_conflict','Refresh your picnic attempt before continuing.',409);
 if(!Number.isSafeInteger(now)||now<current.clock.lastAt)fail('invalid_clock','The picnic clock is unavailable.');
 const next=structuredClone(current),elapsed=now-next.clock.lastAt;next.clock.lastAt=now;
 if(rankedActive(next.service)&&elapsed+next.clock.creditMs>RANKED_RULES.maxGapMs){next.service=dispatchService(next.service,{type:'pause'});next.clock.creditMs=0;next.revision++;return {attempt:next,interrupted:true,accepted:[{type:'service',action:{type:'pause'}}] as RankedCommand[]};}
 next.clock.creditMs=rankedActive(next.service)?next.clock.creditMs+elapsed:0;
 for(const c of envelope.commands){if(next.status!=='active')fail('community_finished','The picnic attempt has ended.');const active=rankedActive(next.service);
  if(c.type==='service'&&c.action.type==='tick'){const required=c.action.ticks*50;if(!active||required>next.clock.creditMs)throw new DinerAuthorityError('time_credit','Wait for your cooking actions to save.',429,Math.max(100,required-next.clock.creditMs));next.clock.creditMs-=required;}
  if(c.type==='finish'){if(!['complete','failed'].includes(next.service.phase))fail('community_unfinished','Finish serving before ending this kitchen.');next.status='complete';next.finishedAt=now;}
  else if(c.type==='abandon'){next.status='abandoned';next.finishedAt=now;}
  else next.service=predictCommunity(next.service,c);
  if(active!==rankedActive(next.service)||next.status!=='active')next.clock.creditMs=0;
 }
 next.revision++;return {attempt:next,interrupted:false,accepted:structuredClone(envelope.commands)};
}
