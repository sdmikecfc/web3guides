import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { botsDb, type BotsDb, Refusal } from "./db";
import { sessionFromRequest } from "./session";
import { freshWorkshop, readWorkshop, changeWorkshop, type Workshop8, type Fight8 } from "@/lib/bots/workshop8/state";
import { preset, practiceOpponent, defaultAppearance } from "@/lib/bots/workshop8/catalogue";
import { playerAction, requestId, applyBrowserStarter } from "@/lib/bots/workshop8/server-contract";
import { simulateWorkshopFight, WORKSHOP_RULES } from "./workshop8-simulation";

export function requireWorkshop() { if(process.env.BOTS_WORKSHOP8_SERVER!=="1"&&process.env.BOTS_WORKSHOP_JOURNEY!=="1")throw new Refusal(503,"Wallet saves are not open yet. Your device garage is safe."); }
export function workshopError(error: unknown) {
  if(error instanceof Refusal)return NextResponse.json({ok:false,error:error.message},{status:error.status});
  console.error("[mk8]",error instanceof Error?error.message:"Unavailable");
  return NextResponse.json({ok:false,error:"Your wallet garage could not save. Nothing was replaced. Try again."},{status:503});
}
function dbFailure(error:{message:string;code?:string}):never {
  if(error.message.includes("REVISION_CONFLICT"))throw new Refusal(409,"Your garage changed on another tab or device. Refresh before trying again.");
  throw Error(`Workshop database unavailable (${error.code??"unknown"}).`);
}
export async function readWalletWorkshop(db:BotsDb,wallet:string):Promise<Workshop8|null>{
  const {data,error}=await db.from("mk8_workshops").select("state,revision").eq("wallet",wallet).maybeSingle();if(error)dbFailure(error);
  if(!data)return null;const state=readWorkshop(JSON.stringify(data.state));if(!state||state.revision!==data.revision)throw Error("Saved workshop validation failed.");return state;
}
async function commit(db:BotsDb,wallet:string,old:Workshop8,id:string,next:Workshop8,published:unknown=null){
  const {data,error}=await db.rpc("mk8_commit",{p_wallet:wallet,p_revision:old.revision,p_request:id,p_state:next,p_public:published});if(error)dbFailure(error);return data.state as Workshop8;
}
function publicFight(f:Fight8){
  // Explicit allowlist. Never serialize an account row or wallet address.
  return {id:f.id,name:f.name,choices:f.choices,appearance:{version:f.appearance.version,parts:f.appearance.parts,banner:false},rival:f.rival,seed:f.seed,arena:f.arena,startedAt:f.startedAt,completedAt:f.completedAt,winner:f.winner,inputs:f.inputs,ticks:f.ticks,reason:f.reason,versions:f.versions,replay:true,source:"house"};
}
async function advance(db:BotsDb,wallet:string,state:Workshop8,now:number){
  if(!state.active)return {state,engine:null};
  const engine=await simulateWorkshopFight(state.active,Math.floor((now-state.active.startedAt)*.06));
  if(engine.done){
    const f=state.active,snap=engine.snapshot(),completedAt=Math.round(f.startedAt+engine.tick/60*1000);
    const reason=engine.tick>=7200?"More core armour remained.":snap.winner===null?"A draw.":engine.actors[1-snap.winner].hp.torso<=0?"Body armour broke.":engine.actors[1-snap.winner].hp.head<=0?"The head broke.":"Both arms broke.";
    const next=changeWorkshop(state,{kind:"complete",id:f.id,winner:snap.winner,ticks:snap.tick,inputs:snap.inputs,reason,versions:WORKSHOP_RULES},completedAt);
    return {state:await commit(db,wallet,state,`settle:${f.id}`,next,publicFight(next.history[0])),engine:null};
  }
  return {state,engine};
}
function response(wallet:string,state:Workshop8,now:number,engine:Awaited<ReturnType<typeof simulateWorkshopFight>>|null=null){
  const visible=structuredClone(state);
  if(visible.active){visible.active.server=true;visible.active.ticks=engine?.tick??0;visible.active.inputs=engine?.snapshot().inputs??visible.active.inputs;}
  return {ok:true,wallet,state:visible,serverNow:now};
}
export async function workshopGet(req:Request, test?:{db:BotsDb;now:number}){
  requireWorkshop();const auth=sessionFromRequest(req);if(!auth)throw new Refusal(401,"Sign in to open your wallet garage.");
  const db=test?.db??botsDb(),state=await readWalletWorkshop(db,auth.wallet);if(!state)return {ok:true,wallet:auth.wallet,state:null,serverNow:test?.now??Date.now()};
  const now=test?.now??Date.now(),result=await advance(db,auth.wallet,state,now);return response(auth.wallet,result.state,now,result.engine);
}
export async function workshopPost(req:Request,body:any,test?:{db:BotsDb;now:number}){
  requireWorkshop();const auth=sessionFromRequest(req);if(!auth)throw new Refusal(401,"Sign in again to save to your wallet.");
  let id:string;try{id=requestId(body?.requestId)}catch(e){throw new Refusal(400,(e as Error).message)}
  const db=test?.db??botsDb(),wallet=auth.wallet,now=test?.now??Date.now();
  if(body.action?.kind==="enroll"){
    const {data,error}=await db.rpc("mk8_commit",{p_wallet:wallet,p_revision:-1,p_request:id,p_state:freshWorkshop(),p_public:null});if(error)dbFailure(error);return response(wallet,data.state,now);
  }
  let state=await readWalletWorkshop(db,wallet);if(!state)throw new Refusal(409,"Open your wallet garage first.");
  const prior=await db.from("mk8_requests").select("request_id").eq("wallet",wallet).eq("request_id",id).maybeSingle();if(prior.error)dbFailure(prior.error);if(prior.data)return response(wallet,state,now);
  if(body.revision!==state.revision)throw new Refusal(409,"Your garage changed on another tab or device. Refresh before trying again.");
  let next:Workshop8;
  try{
    const action=body.action;
    if(action?.kind==="transferStarter")next=applyBrowserStarter(state,action.draft,action.finish===true,id,now);
    else if(action?.kind==="start"){
      if(state.active)return response(wallet,state,now);
      const own=state.robots.find(r=>r.id===action.robotId),loaner=action.loaner===true;
      if(!loaner&&(!own||own.repairUntil>now))throw Error("Choose a ready robot, or use the loaner.");
      if(!["spaceship","colosseum","basement"].includes(action.arena))throw Error("Choose an arena.");
      const choices=loaner?preset("tank"):own!.choices,seed=randomInt(0,0x100000000),styles=["tank","speed","ranged"] as const;
      const fight:Fight8={id:randomUUID(),robotId:loaner?null:own!.id,name:loaner?"Workshop loaner":own!.name,choices,appearance:loaner?defaultAppearance():own!.appearance,rival:practiceOpponent(choices,styles[seed%3]),seed,arena:action.arena,startedAt:now+3000,inputs:[],versions:WORKSHOP_RULES,server:true};
      next=changeWorkshop(state,{kind:"start",fight},now);
    }else if(action?.kind==="special"){
      if(!state.active||state.active.id!==action.fightId)throw Error("That fight has finished.");
      const result=await advance(db,wallet,state,now);state=result.state;if(!result.engine)return response(wallet,state,now);
      if(!result.engine.special(0,id))throw Error("Your special is not ready yet.");
      next=structuredClone(state);next.active!.inputs=[...(state.active!.inputs??[]).filter(i=>i.who===0),{id,who:0,tick:result.engine.tick+1}];next.revision++;
    }else next=changeWorkshop(state,playerAction(action,id),now);
  }catch(e){if(e instanceof Refusal)throw e;throw new Refusal(400,e instanceof Error?e.message:"Check your choices.");}
  return response(wallet,await commit(db,wallet,state,id,next),now);
}
