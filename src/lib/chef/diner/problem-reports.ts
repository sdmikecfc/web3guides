import {dispatchService,sanitizeService} from './service';
import type {ServiceAction,ServiceState} from './types';
export const REPORT_LIMITS={bytes:512*1024,windowMs:30000,actions:1600,ticks:700,note:600,days:30} as const;
export const REPORT_CATEGORIES=['interaction','understanding','difficulty'] as const;
export type ReportCategory=typeof REPORT_CATEGORIES[number];
export interface GameplayReplay {version:number;checkpoint:ServiceState|null;actions:ServiceAction[]}
export interface ProblemReport {version:1;id:string;category:ReportCategory;note:string;build:string;replay:GameplayReplay|null;diagnostics:{kind:string;at:number;details:Record<string,string|number|boolean>}[]}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
/** A service checkpoint excludes account/session state. Seeds are already resolved
 * into rng and the arrival schedule, so the original player-derived seed is unnecessary. */
export function scrubGameplay<T>(value:T):T{return JSON.parse(JSON.stringify(value,(key,v)=>{
 if(/token|password|secret|wallet|address|playerId|signature|communityHandle|name/i.test(key))return undefined;
 if(key==='seed')return 'diagnostic';
 return typeof v==='string'?v.replace(/0x[a-f0-9]{40}/gi,'[wallet]'):v;
}));}
export function validReportAction(raw:unknown):raw is ServiceAction{
 const a=raw as any,fields:Record<string,string[]>={tick:['ticks'],hold:['active'],move:['x','y'],interact:['targetId','recipeId','seatId','ingredientId','itemId'],prepare:[],open:[],pause:[],resume:[],discard:[],skipLesson:[]};
 if(!a||typeof a!=='object'||Array.isArray(a)||!Object.hasOwn(fields,a.type)||Object.keys(a).some(k=>k!=='type'&&!fields[a.type].includes(k)))return false;
 if(a.type==='tick')return Number.isSafeInteger(a.ticks)&&a.ticks>0&&a.ticks<=100;
 if(a.type==='hold')return typeof a.active==='boolean';
 if(a.type==='move')return [a.x,a.y].every(n=>Number.isFinite(n)&&n>=-20&&n<=40);
 if(a.type==='interact')return typeof a.targetId==='string'&&fields.interact.every(k=>a[k]===undefined||typeof a[k]==='string'&&a[k].length<=100);
 return true;
}
export function validateProblemReport(raw:unknown):ProblemReport|null{
 const p=raw as ProblemReport;
 if(!p||p.version!==1||!uuid(p.id)||!REPORT_CATEGORIES.includes(p.category)||typeof p.note!=='string'||p.note.length>REPORT_LIMITS.note||typeof p.build!=='string'||p.build.length>100||!Array.isArray(p.diagnostics)||p.diagnostics.length>120)return null;
 const diagnostics=p.diagnostics.filter(d=>d&&['blocked-action','onboarding','service','frame'].includes(d.kind)&&Number.isFinite(d.at)&&d.details&&typeof d.details==='object').map(d=>({kind:d.kind,at:d.at,details:Object.fromEntries(Object.entries(d.details).filter(([k,v])=>k.length<80&&(['number','boolean'].includes(typeof v)||typeof v==='string'&&v.length<300)))}));
 let replay:GameplayReplay|null=null;
 if(p.replay){const r=p.replay;if(!Number.isSafeInteger(r.version)||r.version<1||r.version>100||!Array.isArray(r.actions)||r.actions.length>REPORT_LIMITS.actions||!r.actions.every(validReportAction)||r.actions.reduce((n,a)=>n+(a.type==='tick'?a.ticks:0),0)>REPORT_LIMITS.ticks)return null;
  const checkpoint=r.version===1?sanitizeService(r.checkpoint,{diagnosticReplay:true}):null;
  // Older checkpoints are retained only as an action log, never executed.
  replay={version:r.version,checkpoint,actions:r.actions};
 }
 const clean=scrubGameplay({version:1 as const,id:p.id,category:p.category,note:p.note,build:p.build,replay,diagnostics});
 return new TextEncoder().encode(JSON.stringify(clean)).length<=REPORT_LIMITS.bytes?clean:null;
}
export function replayProblem(report:ProblemReport,through=Infinity):ServiceState|null{
 const replay=report.replay;if(!replay||replay.version!==1||!replay.checkpoint)return null;
 let state=structuredClone(replay.checkpoint),ticks=0;
 for(const action of replay.actions){if(ticks>=through)break;if(action.type==='tick'){const take=Math.min(action.ticks,through-ticks);state=dispatchService(state,{type:'tick',ticks:take});ticks+=take;}else state=dispatchService(state,action);}
 return state;
}
/** Checkpoints every five seconds bound copying cost to the local interaction loop. */
export class GameplayRecorder {
 private segments:{at:number;checkpoint:ServiceState;actions:ServiceAction[]}[]=[];
 private seed='';
 clear(){this.segments=[];this.seed='';}
 before(state:ServiceState,action:ServiceAction,now=Date.now()){
  if(this.seed!==state.config.seed){this.clear();this.seed=state.config.seed;}
  if(!validReportAction(action))return;
  this.segments=this.segments.filter(s=>now-s.at<REPORT_LIMITS.windowMs);
  let segment=this.segments.at(-1);
  if(!segment||now-segment.at>=5000||segment.actions.length>=300){segment={at:now,checkpoint:scrubGameplay(state),actions:[]};this.segments.push(segment);}
  const last=segment.actions.at(-1);if(action.type==='tick'&&last?.type==='tick'&&last.ticks+action.ticks<=100)last.ticks+=action.ticks;else segment.actions.push(structuredClone(action));
  // Bound memory even when a malfunction floods input between simulation ticks.
  while(this.segments.length>6||this.segments.reduce((n,s)=>n+s.actions.length,0)>REPORT_LIMITS.actions)this.segments.shift();
 }
 snapshot():GameplayReplay|null{
  while(this.segments.length){const result={version:1 as const,checkpoint:this.segments[0].checkpoint,actions:this.segments.flatMap(s=>s.actions)};
   if(result.actions.reduce((n,a)=>n+(a.type==='tick'?a.ticks:0),0)<=REPORT_LIMITS.ticks&&new TextEncoder().encode(JSON.stringify(result)).length<REPORT_LIMITS.bytes-40000)return structuredClone(result);this.segments.shift();}
  return null;
 }
}
