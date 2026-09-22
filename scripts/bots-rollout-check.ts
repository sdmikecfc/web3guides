import assert from "node:assert/strict";
import fs from "node:fs";
import { rolloutEnabled, workshopEnabled, toyPilotEnabled } from "../src/lib/bots/rollout";
import { onboardingEnabled } from "../src/app/bots/_server/rollout";
import { enlistPlayer, starterPartRows } from "../src/app/bots/_server/players";
import { mutateOnboarding, loadCoinBalance, loadOnboarding, onboardingView } from "../src/app/bots/_server/onboarding";
import { carryPracticeAppearance } from "../src/app/bots/_server/practice-handoff";
import { BEGINNER_OFFERS, BEGINNER_ORDER } from "../src/lib/bots/beginner-catalog";
import { EQUIPMENT_KIND } from "../src/lib/bots/equipment";
import type { BotsDb } from "../src/app/bots/_server/db";
const { PGlite } = require(process.env.BOTS_PGLITE_PATH || "@electric-sql/pglite");
const memory = new PGlite();
const calls: string[]=[];
let missingNew=false,failNew=false;
const name={first:"Tiny",second:"Biscuit",num:7};
const originalEnvironment={...process.env};
const schema=fs.readFileSync("scripts/sql/fixtures/onboarding-schema.sql","utf8");
const migration=fs.readFileSync("scripts/sql/bots-onboarding-v1.sql","utf8");
const one=async(s:string,p:unknown[]=[]) => (await memory.query(s,p)).rows[0];
const ident=(s:string)=>{assert(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));return '"'+s+'"';};
/** Supabase-shaped adapter over the real local SQL, no network or remote writes. */
class Query {
 columns="*"; filters:{key:string,value:unknown,kind:string}[]=[]; orderBy=""; max:number|undefined; singleton=false; count=false; head=false;
 action="read"; rows:Record<string,unknown>[]=[]; patch:Record<string,unknown>={};
 constructor(readonly table:string){}
 select(columns="*",opts?:{count?:string;head?:boolean}){this.columns=columns;this.count=!!opts?.count;this.head=!!opts?.head;return this;}
 eq(key:string,value:unknown){this.filters.push({key,value,kind:"="});return this;}
 is(key:string,value:unknown){assert.equal(value,null);this.filters.push({key,value,kind:"IS NULL"});return this;}
 in(key:string,value:unknown[]){this.filters.push({key,value,kind:"IN"});return this;}
 order(key:string,opt?:{ascending?:boolean}){this.orderBy=ident(key)+(opt?.ascending===false?" DESC":" ASC");return this;}
 limit(n:number){this.max=n;return this;}maybeSingle(){this.singleton=true;return this;}single(){this.singleton=true;return this;}
 insert(rows:Record<string,unknown>|Record<string,unknown>[]){this.action="insert";this.rows=Array.isArray(rows)?rows:[rows];return this;}
 update(patch:Record<string,unknown>){this.action="update";this.patch=patch;return this;}
 async run(){
   if(missingNew&&this.table==="battle_bots_onboarding")return {data:null,error:{code:"42P01",message:"relation battle_bots_onboarding does not exist"},count:null};
   const args:unknown[]=[];const bind=(v:unknown)=>{args.push(v!==null&&typeof v==="object"?JSON.stringify(v):v);return "$"+args.length;};
   const where=this.filters.map(f=>ident(f.key)+(f.kind==="IS NULL"?" IS NULL":f.kind==="IN"?" IN ("+(f.value as unknown[]).map(bind).join(",")+")":"="+bind(f.value))).join(" AND ");
   let sql="";
   if(this.action==="insert"){
     const cols=Object.keys(this.rows[0]);sql="INSERT INTO "+ident(this.table)+"("+cols.map(ident).join(",")+") VALUES "+this.rows.map(row=>"("+cols.map(k=>bind(row[k])).join(",")+")").join(",")+" RETURNING *";
   }else if(this.action==="update"){
     sql="UPDATE "+ident(this.table)+" SET "+Object.entries(this.patch).map(([k,v])=>ident(k)+"="+bind(v)).join(",")+(where?" WHERE "+where:"")+" RETURNING *";
   }else sql="SELECT "+(this.count?"count(*)::int AS n":this.columns)+" FROM "+ident(this.table)+(where?" WHERE "+where:"")+(this.orderBy?" ORDER BY "+this.orderBy:"")+(this.max?" LIMIT "+this.max:"");
   try{const result=await memory.query(sql,args);return {data:this.head?null:this.singleton?result.rows[0]??null:result.rows,error:null,count:this.count?result.rows[0].n:null};}
   catch(e){const error=e as {message:string;code:string};return {data:null,error:{message:error.message,code:error.code},count:null};}
 }
 then(resolve:Function,reject?:Function){return this.run().then(v=>resolve(v),e=>reject?.(e));}
}
const adapter={
 from:(table:string)=>new Query(table),
 async rpc(func:string,args:Record<string,unknown>){
  calls.push(func);
  if(failNew&&func==="bb_onboarding_provision")return {data:null,error:{code:"42501",message:"permission denied"}};
  if(missingNew&&["bb_onboarding_provision","bb_legacy_provision","bb_coin_balance"].includes(func))return {data:null,error:{code:"PGRST202",message:"Could not find function in schema cache"}};
  const keys=Object.keys(args),values=keys.map(k=>args[k]!==null&&typeof args[k]==="object"?JSON.stringify(args[k]):args[k]);
  const statement=func==="bb_grant"?"SELECT * FROM ":"SELECT ";
  const suffix=func==="bb_grant"?"":" AS data";
  try{const result=await memory.query(statement+ident(func)+"("+keys.map((k,i)=>ident(k)+"=>$"+(i+1)).join(",")+")"+suffix,values);return {data:func==="bb_grant"?result.rows:result.rows[0]?.data,error:null};}
  catch(e){const error=e as {message:string;code:string};return {data:null,error:{message:error.message,code:error.code}};}
 },
} as unknown as BotsDb;
async function main(){
 for(const env of ["development","production"])for(const value of [undefined,"0","1","true",""])
  assert.equal(rolloutEnabled(value,env),value==="1"||value===undefined&&env==="development");
 Object.assign(process.env,{NODE_ENV:"production",NEXT_PUBLIC_BOTS_WORKSHOP_V1:"0",NEXT_PUBLIC_BOTS_TOY_PILOT:"0",BOTS_ONBOARDING_V1:"0",BOTS_ONBOARDING_V2:"0"});
 assert(!workshopEnabled()&&!toyPilotEnabled()&&!onboardingEnabled());
 await memory.exec(schema);await memory.exec(migration);
 const legacy=await enlistPlayer(adapter,"legacy-rollout",true);
 assert.equal(Number(legacy.player.coins),45);assert(legacy.joined);
 let parts=(await memory.query("SELECT * FROM battle_bots_part_instances WHERE wallet='legacy-rollout' ORDER BY id")).rows;
 assert.equal(parts.length,7);assert.equal(parts.reduce((n:number,p:any)=>n+p.list_price,0),75);
 const ids=parts.map((p:any)=>p.id);
 assert.equal((await enlistPlayer(adapter,"legacy-rollout",false)).joined,false);
 assert.deepEqual((await memory.query("SELECT id FROM battle_bots_part_instances WHERE wallet='legacy-rollout' ORDER BY id")).rows.map((p:any)=>p.id),ids);
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_onboarding")).n,0);
 process.env.BOTS_ONBOARDING_V1="1";
 const newcomer=await enlistPlayer(adapter,"new-rollout",true);assert.equal(Number(newcomer.player.coins),250);assert(newcomer.joined);
 assert.equal(Number((await enlistPlayer(adapter,"legacy-rollout",true)).player.coins),45,"enabling tutorial never upgrades old balance");
 process.env.BOTS_ONBOARDING_V1="0";calls.length=0;
 const resume=await enlistPlayer(adapter,"new-rollout",false);assert.equal(Number(resume.player.coins),250);assert.equal(calls.length,0,"rollback returns versioned player without any grant RPC");
 await mutateOnboarding(adapter,"new-rollout",{action:"welcome"},"2026-09-07");
 const head=BEGINNER_OFFERS.find(o=>o.part.slot==="head")!;
 await mutateOnboarding(adapter,"new-rollout",{action:"buy",socket:"head",offerId:head.id},"2026-09-07");
 assert.equal((await loadOnboarding(adapter,"new-rollout"))?.reserved_coins,200,"existing tutorial still buys with flag off");
 const balance=await loadCoinBalance(adapter,"new-rollout",resume.player);assert.deepEqual(balance,{total:200,reserved:200,spendable:0});
 await assert.rejects(mutateOnboarding(adapter,"legacy-rollout",{action:"welcome"},"2026-09-07"),/not open for new players/);
 const rows=starterPartRows("new-rollout",true);
 assert.equal((await one("SELECT bb_legacy_provision('new-rollout','Brass Otter',$1,$2,true) AS data",[JSON.stringify(name),JSON.stringify(rows)])).data.joined,false);
 assert.equal(Number((await one("SELECT coins FROM battle_bots_players WHERE wallet='new-rollout'")).coins),200);
 console.log("PASS rollout defaults, opt-in, atomic legacy kit and existing onboarding rollback/resume");
 process.env.BOTS_ONBOARDING_V1="1";missingNew=true;
 const compatible=await enlistPlayer(adapter,"old-schema-new",true);assert.equal(Number(compatible.player.coins),45);
 assert.equal((await enlistPlayer(adapter,"old-schema-new",false)).joined,false);
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_part_instances WHERE wallet='old-schema-new'")).n,7);
 const attempts=await Promise.all([enlistPlayer(adapter,"old-schema-race",true),enlistPlayer(adapter,"old-schema-race",true)]);
 assert.equal(Number((await one("SELECT coins FROM battle_bots_players WHERE wallet='old-schema-race'")).coins),45);
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_part_instances WHERE wallet='old-schema-race'")).n,7);
 assert.equal(attempts.filter(a=>a.joined).length,1,"duplicate kit winner is the sole new join");
 missingNew=false;failNew=true;calls.length=0;
 await assert.rejects(enlistPlayer(adapter,"permission-error",true),/permission denied/);assert(!calls.includes("bb_legacy_provision"),"real errors never choose a different grant");
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_players WHERE wallet='permission-error'")).n,0);
 console.log("PASS absent-migration auth/provision, concurrent duplicate-kit exclusion and fail-closed database errors");
 await memory.exec("CREATE FUNCTION fail_legacy_piece() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.wallet='legacy-rollback' THEN RAISE EXCEPTION 'test piece failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER fail_legacy_piece BEFORE INSERT ON battle_bots_part_instances FOR EACH ROW EXECUTE FUNCTION fail_legacy_piece();");
 await assert.rejects(one("SELECT bb_legacy_provision('legacy-rollback','Brass Otter',$1,$2,true)",[JSON.stringify(name),JSON.stringify(starterPartRows("legacy-rollback",true))]),/test piece failure/);
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_players WHERE wallet='legacy-rollback'")).n,0);
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_ledger WHERE wallet='legacy-rollback'")).n,0);
 assert.equal((await one("SELECT has_function_privilege('anon','bb_legacy_provision(text,text,jsonb,jsonb,boolean)','EXECUTE') AS allowed")).allowed,false);
 console.log("PASS atomic legacy failure leaves no orphan rows/grants; browser cannot execute provisioning");
 failNew=false;missingNew=false;process.env.BOTS_ONBOARDING_V2="1";calls.length=0;
 await assert.rejects(enlistPlayer(adapter,"v2-missing",true),/being set up/);
 assert.deepEqual(calls,["bb_onboarding_v2_provision"],"v2 missing migration never attempts v1 or legacy grants");
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_players WHERE wallet='v2-missing'")).n,0);
 assert.equal((await enlistPlayer(adapter,"legacy-rollout",true)).joined,false,"legacy garage stays available while v2 schema is missing");
 await memory.exec(fs.readFileSync("scripts/sql/bots-onboarding-v2.sql","utf8"));
 const v2=await enlistPlayer(adapter,"v2-rollout",true); assert.equal(Number(v2.player.coins),250);assert(v2.joined);
 let view=await onboardingView(adapter,"v2-rollout");assert.equal(view?.version,2);assert.equal(view?.draftBay,1);assert.equal(view?.purchasedCount,0);
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_bots WHERE wallet='v2-rollout'")).n,1);
 assert.equal((await one("SELECT count(*)::int AS n FROM battle_bots_part_instances WHERE wallet='v2-rollout'")).n,0);
 process.env.BOTS_ONBOARDING_V2="0";process.env.BOTS_ONBOARDING_V1="0";calls.length=0;
 assert.equal((await enlistPlayer(adapter,"v2-rollout",false)).joined,false);assert.equal(calls.length,0,"v2 account survives rollback without a grant");
 await mutateOnboarding(adapter,"v2-rollout",{action:"welcome"},"2026-09-09");
 await assert.rejects(mutateOnboarding(adapter,"v2-rollout",{action:"choose",socket:"head",offerId:head.id,revision:"0"},"2026-09-09"),/Refresh/);
 for(const socket of BEGINNER_ORDER){
  const offer=BEGINNER_OFFERS.find(o=>o.part.slot===EQUIPMENT_KIND[socket])!;
  view=(await mutateOnboarding(adapter,"v2-rollout",{action:"choose",socket,offerId:offer.id,revision:view!.revision},"2026-09-09")).onboarding;
 }
 assert.equal(view?.step,"shop");assert.equal(view?.purchasedCount,7);assert.equal(view?.reservedCoins,250);
 const replacement=BEGINNER_OFFERS.filter(o=>o.part.slot==='head')[1];
 view=(await mutateOnboarding(adapter,"v2-rollout",{action:"choose",socket:"head",offerId:replacement.id,revision:view!.revision},"2026-09-09")).onboarding;
 assert.equal(view?.draftOffers?.head,replacement.id);
 assert.equal(view?.purchases.head?.offerId,replacement.id);assert(Number(view?.purchases.head?.partId)<0,"draft selections expose only virtual IDs");
 await assert.rejects(mutateOnboarding(adapter,"v2-rollout",{action:"finish",revision:0},"2026-09-09"),/another window/);
 view=(await mutateOnboarding(adapter,"v2-rollout",{action:"finish",revision:view!.revision},"2026-09-09")).onboarding;
 assert.equal(view?.step,"complete");assert.equal(view?.milestones.practiced,false);assert(Number(view?.purchases.head?.partId)>0);
 assert.deepEqual(await loadCoinBalance(adapter,"v2-rollout",v2.player),{total:0,reserved:0,spendable:0});
 process.env.BOTS_ONBOARDING_V2="1";
 await enlistPlayer(adapter,"v2-transfer",true);
 const transfer={version:2,offers:Object.fromEntries(BEGINNER_ORDER.map(socket=>[socket,BEGINNER_OFFERS.find(o=>o.part.slot===EQUIPMENT_KIND[socket])!.id])),name,complete:true,coins:999999,wins:900,look:{face:"happy",hat:"crown"}};
 const result=await carryPracticeAppearance(adapter,"v2-transfer",transfer);assert(result.applied);
 const transferred=await one("SELECT * FROM battle_bots_bots WHERE wallet='v2-transfer'");
 assert.equal(transferred.wins,0);assert.equal(transferred.build.look.hat,null);
 assert.equal(Number((await one("SELECT coins FROM battle_bots_players WHERE wallet='v2-transfer'")).coins),0);
 assert.equal((await carryPracticeAppearance(adapter,"v2-transfer",transfer)).applied,true);
 assert.equal((await carryPracticeAppearance(adapter,"v2-rollout",transfer)).applied,false,"completed wallet keeps its own selected body");
 console.log("PASS v2 missing-schema refusal, actual service draft/Finish, flag rollback/resume, virtual-to-owned IDs and validated handoff");
}
main().finally(async()=>{for(const key of ["NODE_ENV","NEXT_PUBLIC_BOTS_WORKSHOP_V1","NEXT_PUBLIC_BOTS_TOY_PILOT","BOTS_ONBOARDING_V1","BOTS_ONBOARDING_V2"]){if(originalEnvironment[key]===undefined)delete process.env[key];else process.env[key]=originalEnvironment[key];}await memory.close();}).catch(error=>{console.error(error);process.exitCode=1;});
