/**
 * Pure game-only exchange measurements. No service, wallet, DB, renderer or GPU.
 * node scripts/bots-v7-domain-check.cjs bots-v7-exchange-check.ts
 * Optional BOTS_V7_EXCHANGE_SEEDS=20,75,97 (default75; at most8 seeds).
 * Optional BOTS_V7_EXCHANGE_REPORT=/absolute/task/report.json.
 * BOTS_V7_SOURCE_ROOT overlays a preserved domain through the existing runner.
 * Spacing/variety metrics are observations, not arbitrary balance acceptance gates.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createHeroBuildV7,createFightV7,stepFightV7,resultV7,replayV7,fighterPoseV7,FPS_V7,MAX_FRAMES_V7,RULES_V7} from '@/lib/bots/v7';
import type {ActionV7,StateV7,StyleV7,SideV7,EventV7} from '@/lib/bots/v7';
import {hashV6} from '@/lib/bots/v6/math';

const pairs:readonly (readonly [StyleV7,StyleV7])[]=[['tank','speed'],['tank','ranged'],['speed','ranged']];
const seeds=(process.env.BOTS_V7_EXCHANGE_SEEDS||'75').split(',').map(Number);
assert(seeds.length>0&&seeds.length<=8&&seeds.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff),'Use1–8 whole unsigned seeds.');
assert.equal(new Set(seeds).size,seeds.length,'Duplicate seeds do not add coverage.');
const sides=[0,1] as const,projectileKinds=new Set(['shoulder_cannon','backup_pistol','special_burst']);
const round=(n:number)=>Math.round(n*1000)/1000;
const addCount=(counts:Record<string,number>,name:string,n=1)=>{counts[name]=(counts[name]||0)+n;};
const sourceDir=path.join(path.resolve(process.env.BOTS_V7_SOURCE_ROOT||process.env.BOTS_V7_REPO_ROOT||path.join(__dirname,'..')),'src/lib/bots/v7');
function sourceFingerprint(){
  const files=fs.readdirSync(sourceDir).filter(name=>/\.(ts|json)$/.test(name)).sort().map(name=>({name,sha256:createHash('sha256').update(fs.readFileSync(path.join(sourceDir,name))).digest('hex')}));
  return {files,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};
}
const sourceAtStart=sourceFingerprint();
function label(value:unknown):string{
  if(typeof value==='string'||typeof value==='number')return String(value);
  if(value&&typeof value==='object'){const v=value as Record<string,unknown>;if(typeof v.kind==='string')return v.kind;}
  return 'unavailable';
}
function finite(value:unknown,where:string):void{
  if(typeof value==='number')assert(Number.isFinite(value),where+' is non-finite');
  else if(Array.isArray(value))value.forEach((v,i)=>finite(v,where+'.'+i));
  else if(value&&typeof value==='object')for(const [key,v]of Object.entries(value))finite(v,where+'.'+key);
}
type MotionAction=ActionV7&{motion?:string;comboIndex?:number};
type ActionRecord={id:number;who:SideV7;kind:string;mount:string;motion:string;comboIndex:number|null;started:number;activeEnd:number|null;contactEvents:number;shots:number;interrupted:boolean;explicitMisses:number;observed:boolean};
function measure(pair:readonly [StyleV7,StyleV7],seed:number){
  const builds=pair.map(style=>createHeroBuildV7(style)) as Parameters<typeof createFightV7>[0];
  const state=createFightV7(builds,seed,{autoSpecial:[true,true],defensePlans:['balanced','balanced']});
  const sourceIdentity={rulesVersion:state.rulesVersion,rigVersion:state.rigVersion,motionVersion:state.motionVersion,collisionVersion:state.collisionVersion,presentationVersion:state.presentationVersion,manifestHashes:builds.map(b=>b.manifestHash),rulesHash:hashV6(RULES_V7)};
  const actions=new Map<string,ActionRecord>(),moves:[string[],string[]]=[[],[]],sampleKinds:[Record<string,number>,Record<string,number>]=[{},{}],tactics:[Record<string,number>,Record<string,number>]=[{},{}],defences:[Record<string,number>,Record<string,number>]=[{},{}];
  const travel=[0,0],retreat=[0,0],lateral=[0,0],approach=[0,0],retreatSeconds=[0,0],pathHistory:[number[],number[]]=[[0],[0]];
  const rangeFrames={'850':0,'1200':0,'1800':0};let previousEvent=0,minimumRange=Infinity,maximumRange=0,stationaryFrames=0,longestStationaryFrames=0,longestStationaryEnd=0,closeExchangeFrames=0,longestCloseExchangeFrames=0,lastMeleeFrame=-Infinity,poseSamples=0;
  const eventCounts:Record<string,number>={},contract={motion:false,comboIndex:false,tactic:false,defence:false};
  function recordAction(who:SideV7,a:ActionV7|null){
    if(!a)return;const m=a as MotionAction,key=who+':'+a.id;
    const existing=actions.get(key);
    if(!existing){
      actions.set(key,{id:a.id,who,kind:a.kind,mount:a.mount,motion:m.motion||a.kind,comboIndex:m.comboIndex??null,started:a.started,activeEnd:a.started+a.windup+a.active,contactEvents:0,shots:0,interrupted:false,explicitMisses:0,observed:true});
      moves[who].push(m.motion||a.kind);addCount(sampleKinds[who],a.kind);
    }else if(!existing.observed){
      existing.observed=true;existing.motion=m.motion||a.kind;existing.comboIndex=m.comboIndex??null;existing.activeEnd=a.started+a.windup+a.active;
    }
    if(typeof m.motion==='string')contract.motion=true;if(typeof m.comboIndex==='number')contract.comboIndex=true;
  }
  function eventRecord(e:EventV7):ActionRecord|undefined{
    if(e.attackId===undefined)return undefined;const key=e.who+':'+e.attackId;let a=actions.get(key);
    if(!a&&e.kind==='windup'){
      const current=state.fighters[e.who].action;if(current?.id===e.attackId)recordAction(e.who,current);
      a=actions.get(key);
      if(!a){a={id:e.attackId,who:e.who,kind:e.weapon||'unobserved',mount:e.mount||'unobserved',motion:e.weapon||'unobserved',comboIndex:null,started:e.frame,activeEnd:null,contactEvents:0,shots:0,interrupted:false,explicitMisses:0,observed:false};actions.set(key,a);moves[e.who].push(a.motion);addCount(sampleKinds[e.who],a.kind);}
    }
    return a;
  }
  while(!state.done&&state.frame<MAX_FRAMES_V7){
    const prior=state.fighters.map(f=>({x:f.x,z:f.z}));for(const who of sides)recordAction(who,state.fighters[who].action);
    stepFightV7(state);
    const distance=Math.hypot(state.fighters[1].x-state.fighters[0].x,state.fighters[1].z-state.fighters[0].z);minimumRange=Math.min(minimumRange,distance);maximumRange=Math.max(maximumRange,distance);
    for(const threshold of ['850','1200','1800'] as const)if(distance<Number(threshold))rangeFrames[threshold]++;
    for(const who of sides){
      const f=state.fighters[who],r=prior[1-who],p=prior[who],dx=f.x-p.x,dz=f.z-p.z,d=Math.hypot(r.x-p.x,r.z-p.z),nx=d?(r.x-p.x)/d:0,nz=d?(r.z-p.z)/d:0,forward=dx*nx+dz*nz;
      finite(f,'fighter'+who+'@'+state.frame);assert(Math.hypot(f.x,f.z)<=RULES_V7.arenaRadius+1,'Robot root left arena at frame'+state.frame);
      travel[who]+=Math.hypot(dx,dz);retreat[who]+=Math.max(0,-forward);approach[who]+=Math.max(0,forward);lateral[who]+=Math.abs(dx*nz-dz*nx);if(forward<-.5)retreatSeconds[who]+=1/FPS_V7;pathHistory[who].push(travel[who]);recordAction(who,f.action);
      const ext=f as typeof f&{tactic?:unknown;defence?:unknown};if(ext.tactic!==undefined)contract.tactic=true;if(ext.defence!==undefined)contract.defence=true;addCount(tactics[who],label(ext.tactic));addCount(defences[who],label(ext.defence));
      if(f.action&&!projectileKinds.has(f.action.kind))lastMeleeFrame=state.frame;
    }
    finite(state.projectiles,'projectiles@'+state.frame);
    for(const e of state.events.slice(previousEvent)){
      finite(e,'event'+e.id);addCount(eventCounts,e.kind);const a=eventRecord(e);if(!a)continue;
      if(e.kind==='hit'||e.kind==='block')a.contactEvents++;if(e.kind==='shot')a.shots++;if(e.kind==='interrupt')a.interrupted=true;if(String(e.kind)==='miss')a.explicitMisses++;
    }
    previousEvent=state.events.length;
    // One-second root-path window avoids splitting a static exchange at short idle gaps.
    const stationary=state.frame>=FPS_V7&&distance<1800&&state.frame-lastMeleeFrame<=FPS_V7&&sides.every(who=>travel[who]-pathHistory[who][state.frame-FPS_V7]<=150);
    closeExchangeFrames=distance<1800&&state.frame-lastMeleeFrame<=FPS_V7?closeExchangeFrames+1:0;longestCloseExchangeFrames=Math.max(longestCloseExchangeFrames,closeExchangeFrames);
    stationaryFrames=stationary?stationaryFrames+1:0;if(stationaryFrames>longestStationaryFrames){longestStationaryFrames=stationaryFrames;longestStationaryEnd=state.frame;}
    if(state.frame%60===0){
      for(const who of sides){const pose=fighterPoseV7(state,who);finite(pose.nodes,'pose'+who+'@'+state.frame);finite(pose.proxies,'proxies'+who+'@'+state.frame);}poseSamples++;
    }
  }
  const timedOut=state.frame>=MAX_FRAMES_V7||!!eventCounts.timeout;let resultHash:string|null=null,replayMatches=false,replayError:string|null=null;
  if(state.done&&state.winner!==null){try{const result=resultV7(state);resultHash=result.hash;replayMatches=replayV7(result).hash===result.hash;}catch(e){replayError=e instanceof Error?e.message:String(e);}}
  const summaries=sides.map(who=>{
    const records=[...actions.values()].filter(a=>a.who===who),sequence=moves[who],motionCounts:Record<string,number>={},comboCounts:Record<string,number>={},outcomes:Record<string,number>={contact:0,interruptedWithoutContact:0,completedMeleeWithoutContact:0,firedResolvedWithoutContact:0,unfinishedOrUnobserved:0};let repeats=0,run=0,longest=0,last='';
    for(const move of sequence){addCount(motionCounts,move);if(move===last){repeats++;run++;}else run=1;longest=Math.max(longest,run);last=move;}
    for(const a of records){
      if(a.comboIndex!==null)addCount(comboCounts,String(a.comboIndex));
      if(a.contactEvents)outcomes.contact++;
      else if(a.interrupted)outcomes.interruptedWithoutContact++;
      else if(a.activeEnd===null||state.frame<a.activeEnd)outcomes.unfinishedOrUnobserved++;
      else if(!projectileKinds.has(a.kind))outcomes.completedMeleeWithoutContact++;
      else if(a.shots>0&&!state.projectiles.some(p=>p.who===who&&p.attackId===a.id))outcomes.firedResolvedWithoutContact++;
      else outcomes.unfinishedOrUnobserved++;
    }
    assert.equal(Object.values(outcomes).reduce((a,b)=>a+b,0),records.length,'Every action gets exactly one outcome.');
    return {style:pair[who],side:who,travelMetres:round(travel[who]/1000),retreatMetres:round(retreat[who]/1000),approachMetres:round(approach[who]/1000),lateralMetres:round(lateral[who]/1000),retreatSeconds:round(retreatSeconds[who]),actions:records.length,uniqueMotions:Object.keys(motionCounts).length,motionCounts,attackKindCounts:sampleKinds[who],comboIndexCounts:comboCounts,consecutiveSameMotion:repeats,sameMotionTransitionPercent:round(sequence.length>1?repeats/(sequence.length-1)*100:0),longestSameMotionRun:longest,first24Moves:sequence.slice(0,24),contactEvents:records.reduce((n,a)=>n+a.contactEvents,0),shotEvents:records.reduce((n,a)=>n+a.shots,0),explicitMissEvents:records.reduce((n,a)=>n+a.explicitMisses,0),outcomes,tacticSeconds:Object.fromEntries(Object.entries(tactics[who]).map(([k,n])=>[k,round(n/FPS_V7)])),defenceSeconds:Object.fromEntries(Object.entries(defences[who]).map(([k,n])=>[k,round(n/FPS_V7)]))};
  });
  const violations:string[]=[];if(timedOut)violations.push('timeout');if(!state.done||state.winner===null)violations.push('no-result');if(!replayMatches)violations.push('replay-divergence'+(replayError?': '+replayError:''));
  return {pair,seed,sourceIdentity,frames:state.frame,seconds:round(state.frame/FPS_V7),minimumRangeMm:round(minimumRange),maximumRangeMm:round(maximumRange),within:Object.fromEntries(Object.entries(rangeFrames).map(([range,frames])=>[range,{frames,seconds:round(frames/FPS_V7),percent:round(frames/Math.max(1,state.frame)*100)}])),longestCloseMeleeExchangeSeconds:round(longestCloseExchangeFrames/FPS_V7),longestStationaryMeleeExchange:{seconds:round(longestStationaryFrames/FPS_V7),startFrame:longestStationaryFrames?longestStationaryEnd-longestStationaryFrames+1:null,endFrame:longestStationaryFrames?longestStationaryEnd:null},eventCounts,deaths:eventCounts.ko||0,winner:state.winner,timedOut,replayMatches,resultHash,poseSamples,contract,robots:summaries,violations};
}
const report:{schema:string;source:ReturnType<typeof sourceFingerprint>;definitions:Record<string,string>;seeds:number[];cases:unknown[];failures:string[];passed:boolean}={schema:'model-kombat.v7-exchanges.v1',source:sourceAtStart,definitions:{sampling:'Every authoritative60Hz step, before aftermath. Default3seed75pairs; optional bounded seed list.',spacing:'Root-centre distance; not surface gap. Strictly less than850/1200/1800mm.',travel:'Actual root displacement including pushes. Retreat is its component away from the prior opponent position; this does not imply voluntary tactics.',stationary:'Both robots each travel<=150mm over the preceding60frames, remain<1800mm apart, and at least one melee action occurred in the last60frames. Short idle gaps do not reset this measure.',closeExchange:'Consecutive frames<1800mm with at least one melee action in the last60frames, regardless of movement; separates circling at close range from standing still.',variety:'Move identity uses action.motion when present, else attack kind; changing left/right mount alone does not count as a new move. comboIndex is reported separately.',misses:'Completed melee without contact and fired attacks whose projectiles all resolved without contact are inferred action outcomes, not synthetic engine miss events. Interruptions and unfinished/in-flight actions are separate.',special:'Both sides use balanced automatic Special for repeatable exchange coverage; this is not a test of manual input.',acceptance:'Non-finite numbers, root outside arena, timeout/no result, replay divergence or source changing mid-run reject the run. Spacing/variety/balance numbers have no frozen threshold.'},seeds,cases:[],failures:[],passed:false};
for(const pair of pairs)for(const seed of seeds){
  try{const measured=measure(pair,seed);report.cases.push(measured);for(const violation of measured.violations)report.failures.push(pair.join('/')+' seed'+seed+': '+violation);console.log(JSON.stringify({pair,seed,seconds:measured.seconds,close1200:measured.within['1200'],stationary:measured.longestStationaryMeleeExchange,robots:measured.robots.map(r=>({style:r.style,moves:r.motionCounts,travel:r.travelMetres,retreat:r.retreatMetres,outcomes:r.outcomes})),violations:measured.violations}));}
  catch(error){const message=error instanceof Error?error.message:String(error);report.failures.push(pair.join('/')+' seed'+seed+': '+message);report.cases.push({pair,seed,error:message});}
}
if(sourceFingerprint().sha256!==sourceAtStart.sha256)report.failures.push('Domain source changed during this measurement; rerun one coherent candidate.');
report.passed=report.failures.length===0;
if(process.env.BOTS_V7_EXCHANGE_REPORT){const file=path.resolve(process.env.BOTS_V7_EXCHANGE_REPORT);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({schema:report.schema,passed:report.passed,cases:report.cases.length,failures:report.failures}));
if(!report.passed)process.exitCode=1;
