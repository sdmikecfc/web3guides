import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { botsDb, sessionSecret, Refusal, type BotsDb } from './db';
import { sessionFromRequest } from './session';
import { changeWorkshop, freshWorkshop, readWorkshop, type Fight8, type Workshop8 } from '@/lib/bots/workshop8/state';
import { defaultAppearance, ENTRY_MAP, preset, practiceOpponent, dailyItems } from '@/lib/bots/workshop8/catalogue';
import { explainFight, recordCareer, freshJourney } from '@/lib/bots/workshop8/journey';
import { competitionEnabled } from './workshop-competition';
import { TRAINING_VERSION } from '@/lib/bots/workshop8/training';
import { applyBrowserStarter, playerAction, requestId } from '@/lib/bots/workshop8/server-contract';
import { simulateWorkshopFight, WORKSHOP_RULES } from './workshop8-simulation';

export const journeyEnabled = () => process.env.BOTS_WORKSHOP_JOURNEY === '1';
export const GUEST_COOKIE = 'mk8_guest';
export function sameOrigin(req: Request) {
  const url=new URL(req.url),host=req.headers.get('host')??url.host;
  if(req.headers.get('origin')!==`${url.protocol}//${host}`)throw new Refusal(403,'Open Model Kombat in this tab and try again.');
}
function guestSecret(req: Request) {
  const value=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${GUEST_COOKIE}=`))?.slice(GUEST_COOKIE.length+1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function failure(error:{message:string;code?:string}):never {
  const text=error.message;
  if(text.includes('REVISION_CONFLICT'))throw new Refusal(409,'Your garage changed. Refresh it and retry.');
  if(text.includes('OTHER_FIGHT_ACTIVE'))throw new Refusal(409,'Finish the fight in your other garage first.');
  if(text.includes('ENROLLMENT_LIMIT'))throw new Refusal(429,'Too many new garages from this connection. Try again later.');
  if(text.includes('SESSION_EXPIRED'))throw new Refusal(401,'This guest session expired. Sign in to your wallet to recover a linked garage.');
  if(text.includes('GARAGE_NOT_FOUND'))throw new Refusal(404,'That garage is not linked to this player.');
  throw Error(`Journey storage unavailable (${error.code??'unknown'}).`);
}
async function rpc(db:BotsDb,name:string,params:Record<string,unknown>){const {data,error}=await db.rpc(name,params);if(error)failure(error);return data;}
export async function journeySession(req: Request, enroll=false) {
  if(!journeyEnabled())return NextResponse.json({ok:true,enabled:false});
  if(req.headers.get('sec-fetch-site')==='cross-site')throw new Refusal(403,'Open Model Kombat directly to start your garage.');
  const secret=guestSecret(req)??randomBytes(32).toString('hex'),db=botsDb();
  const {error}=await db.from('mk8_players').select('id').limit(1);if(error)failure(error);
  if(enroll){
    sameOrigin(req);
    if(!guestSecret(req))throw new Refusal(409,'Refresh to start your saved garage.');
    const ip=req.headers.get('x-real-ip')??req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'local';
    const bucket=createHmac('sha256',sessionSecret()).update(`${ip}:${Math.floor(Date.now()/3600000)}`).digest('hex');
    await rpc(db,'mk8_guest_enroll',{p_hash:hash(secret),p_bucket:bucket,p_state:{...freshWorkshop(),journey:freshJourney()}});
  }
  const response=NextResponse.json({ok:true,enabled:true},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set(GUEST_COOKIE,secret,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/bots/workshop',maxAge:60*86400});
  return response;
}
type Identity={player:string;kind:'guest'|'wallet';wallet?:string;isTest?:boolean};
async function identity(req:Request,db:BotsDb):Promise<Identity|null>{
  const auth=sessionFromRequest(req);
  if(auth)return {player:await rpc(db,'mk8_wallet_player',{p_wallet:auth.wallet}),kind:'wallet',wallet:auth.wallet,isTest:auth.isTest};
  const token=guestSecret(req);if(!token)return null;
  const {data,error}=await db.from('mk8_guest_sessions').select('player_id,expires_at,revoked').eq('token_hash',hash(token)).maybeSingle();if(error)failure(error);
  if(!data||data.revoked||Date.parse(data.expires_at)<=Date.now())return null;
  return {player:data.player_id,kind:'guest'};
}
type Garage={id:string;name:string;state:Workshop8;revision:number};
async function garages(db:BotsDb,owner:Identity):Promise<Garage[]>{
  const {data,error}=await db.from('mk8_garages').select('id,name,state,revision').eq('player_id',owner.player).order('updated_at',{ascending:false});if(error)failure(error);
  return (data??[]).map(row=>{const state=readWorkshop(JSON.stringify(row.state));if(!state||state.revision!==row.revision)throw Error('Saved garage needs recovery.');return {...row,state};});
}
function publicFight(f:Fight8){return {id:f.id,name:f.name,choices:f.choices,appearance:{version:f.appearance.version,parts:f.appearance.parts,banner:false},rival:f.rival,seed:f.seed,arena:f.arena,mode:f.mode,startedAt:f.startedAt,completedAt:f.completedAt,winner:f.winner,inputs:f.inputs,ticks:f.ticks,reason:f.reason,versions:f.versions,report:f.report,replay:true,source:f.mode==='training'?'training':'house'};}
async function commit(db:BotsDb,owner:Identity,g:Garage,id:string,next:Workshop8,day?:string,published?:unknown){
  return await rpc(db,competitionEnabled()?'mk8_competition_commit':'mk8_journey_commit',{p_player:owner.player,p_garage:g.id,p_revision:g.revision,p_request:id,p_state:next,p_day:day??null,p_public:published??null,...(competitionEnabled()?{p_wallet:owner.kind==='wallet'&&!owner.isTest?owner.wallet:null}:{})}) as Workshop8;
}
async function advance(db:BotsDb,owner:Identity,g:Garage,now:number){
  const f=g.state.active;if(!f||f.waiting)return {state:g.state,engine:null};
  const engine=await simulateWorkshopFight(f,Math.floor((now-f.startedAt)*.06));
  if(!engine.done)return {state:g.state,engine};
  const snap=engine.snapshot(),completedAt=Math.round(f.startedAt+engine.tick/60*1000);
  const next=changeWorkshop(g.state,{kind:'complete',id:f.id,winner:snap.winner,ticks:snap.tick,inputs:snap.inputs,reason:snap.winner===0?'Your robot won.':snap.winner===1?'The rival won.':'The fight ended in a draw.',versions:f.versions},completedAt);
  const completed=next.history[0],report=explainFight(completed,engine.events,[engine.actors[0].initial,engine.actors[1].initial]);
  recordCareer(next,completed,report,engine.events);
  return {state:await commit(db,owner,g,`settle:${f.id}`,next,new Date(completedAt).toISOString().slice(0,10),publicFight(completed)),engine:null};
}
async function response(db:BotsDb,owner:Identity,list:Garage[],g:Garage|null,now:number,engine:Awaited<ReturnType<typeof simulateWorkshopFight>>|null=null){
  const {data,error}=await db.from('mk8_player_days').select('day,completed,bonus_paid').eq('player_id',owner.player);if(error)failure(error);
  const state=g?structuredClone(g.state):null;
  if(state?.active){state.active.server=true;state.active.ticks=engine?.tick??0;state.active.inputs=engine?.snapshot().inputs??state.active.inputs;}
  return {ok:true,journey:true,session:{kind:owner.kind,address:owner.wallet},garageId:g?.id??null,garages:list.map(x=>({id:x.id,name:x.name,robots:x.state.robots.map(r=>({id:r.id,name:r.name})),activeFight:x.state.active?.id??null})),state,days:Object.fromEntries((data??[]).map(d=>[String(d.day).slice(0,10),d.completed])),serverNow:now};
}
export async function journeyGet(req:Request){
  const db=botsDb(),owner=await identity(req,db),now=Date.now();
  if(!owner)return {ok:true,journey:true,session:null,garageId:null,garages:[],state:null,days:{},serverNow:now};
  const {data:preference,error}=await db.from('mk8_players').select('active_garage').eq('id',owner.player).maybeSingle();if(error)failure(error);
  const list=await garages(db,owner),requested=new URL(req.url).searchParams.get('garage'),g=(requested?list.find(g=>g.id===requested):list.find(g=>g.state.active)||list.find(g=>g.id===preference?.active_garage)||list[0])??null;
  if(requested&&!g)throw new Refusal(404,'That garage is not linked to this player.');
  if(!g)return response(db,owner,list,null,now);
  const result=await advance(db,owner,g,now);g.state=result.state;g.revision=result.state.revision;
  return response(db,owner,list,g,now,result.engine);
}
export async function journeyPost(req:Request,body:any){
  sameOrigin(req);const db=botsDb(),owner=await identity(req,db);if(!owner)throw new Refusal(401,'Start a guest garage or sign in to your wallet.');
  let id:string;try{id=requestId(body?.requestId)}catch{throw new Refusal(400,'Refresh and retry this change.')}
  const list=await garages(db,owner),g=list.find(g=>g.id===body.garageId);if(!g)throw new Refusal(404,'Choose one of your saved garages.');
  const {data:prior,error}=await db.from('mk8_journey_requests').select('request_id').eq('garage_id',g.id).eq('request_id',id).maybeSingle();if(error)failure(error);
  if(prior)return response(db,owner,list,g,Date.now());
  if(body.revision!==g.revision)throw new Refusal(409,'Your garage changed. Refresh it and retry.');
  const action=body.action,now=Date.now();let next:Workshop8;
  if(action?.kind==='start'){
    if(g.state.active)return response(db,owner,list,g,now);
    const own=g.state.robots.find(r=>r.id===action.robotId),training=action.mode==='training',loaner=action.loaner===true;
    if(training&&(!own||loaner))throw new Refusal(400,'Choose your robot for training.');
    if(!loaner&&(!own||own.repairUntil>now))throw new Refusal(400,'Choose a ready robot or the free loaner.');
    if(!['spaceship','colosseum','basement'].includes(action.arena))throw new Refusal(400,'Choose an arena.');
    const choices=loaner?preset('tank'):own!.choices,seed=randomInt(0,0x100000000),style=(['tank','speed','ranged'] as const)[seed%3];
    const fight:Fight8={id:randomUUID(),robotId:loaner?null:own!.id,name:loaner?'Workshop loaner':own!.name,choices,appearance:loaner?defaultAppearance():own!.appearance,rival:practiceOpponent(choices,style),seed,arena:action.arena,mode:training?'training':'house',startedAt:0,waiting:true,inputs:[],server:true,versions:training?{...WORKSHOP_RULES,training:TRAINING_VERSION}:WORKSHOP_RULES};
    next=changeWorkshop(g.state,{kind:'start',fight},now);
  }else if(action?.kind==='ready'){
    if(!g.state.active||g.state.active.id!==action.fightId)throw new Refusal(400,'That fight is no longer open.');
    if(!g.state.active.waiting)return response(db,owner,list,g,now);
    next=structuredClone(g.state);next.active!.waiting=false;next.active!.startedAt=now+1000;next.revision++;
  }else if(action?.kind==='special'){
    if(g.state.active?.waiting)throw new Refusal(400,'The arena is still loading.');
    if(g.state.active?.id!==action.fightId)throw new Refusal(400,'That fight has finished.');
    const result=await advance(db,owner,g,now);g.state=result.state;g.revision=result.state.revision;
    if(!result.engine)return response(db,owner,list,g,now);
    if(!result.engine.special(0,id))throw new Refusal(400,'Your Special is not ready.');
    next=structuredClone(g.state);next.journey??=freshJourney();if(!next.journey.lessons.includes('special'))next.journey.lessons.push('special');next.active!.inputs=[...(next.active!.inputs??[]).filter(i=>i.who===0),{id,who:0,tick:result.engine.tick+1}];next.revision++;
  }else {try{if(action?.kind==='transferStarter')next=applyBrowserStarter(g.state,action.draft,action.finish===true,id,now);else {const intention=playerAction(action,id);if(intention.kind==='buy'&&!dailyItems(new Date(now).toISOString().slice(0,10)).some(i=>i.id===intention.item))throw new Refusal(400,'This part is not in today’s shipment. Add it to your plan.');next=changeWorkshop(g.state,intention,now);}}catch(e){if(e instanceof Refusal)throw e;throw new Refusal(400,(e as Error).message)}}
  g.state=await commit(db,owner,g,id,next);g.revision=g.state.revision;return response(db,owner,list,g,now);
}
export async function journeyClaim(req:Request){
  sameOrigin(req);const auth=sessionFromRequest(req),token=guestSecret(req);if(!auth||!token)throw new Refusal(401,'Sign in while your guest garage is open.');
  await rpc(botsDb(),'mk8_claim_guest',{p_wallet:auth.wallet,p_hash:hash(token)});
  const result=NextResponse.json(await journeyGet(req),{headers:{'Cache-Control':'no-store'}});
  result.cookies.set(GUEST_COOKIE,randomBytes(32).toString('hex'),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/bots/workshop',maxAge:60*86400});
  return result;
}
export async function journeySelect(req:Request,garageId:unknown){
  sameOrigin(req);const db=botsDb(),owner=await identity(req,db);
  if(!owner)throw new Refusal(401,'Open your saved garage first.');
  if(typeof garageId!=='string'||!/^[a-f0-9-]{36}$/i.test(garageId))throw new Refusal(400,'Choose a saved garage.');
  await rpc(db,'mk8_select_garage',{p_player:owner.player,p_garage:garageId});
  const url=new URL(req.url);url.searchParams.set('garage',garageId);
  return journeyGet(new Request(url,{headers:req.headers}));
}
