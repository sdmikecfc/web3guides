import assert from "node:assert/strict";
import { battlesView } from "../src/app/bots/_server/battles";
import { fightView, type BattleRow, type ResultJson } from "../src/app/bots/_server/fight-read";
import type { BotsDb } from "../src/app/bots/_server/db";
import { STARTER_PARTS } from "../src/app/bots/_engine/catalog";
import { NO_ORDERS, type Build } from "../src/app/bots/_engine/parts";

const build = Object.fromEntries(STARTER_PARTS.map(p=>[p.slot,{id:p.id,s:[...p.s]}])) as unknown as Build;
const identity = (name:string) => ({ name,wallet:"Brass Otter 7",wins:0,losses:0,strategy:"",paint:"mint" as const,tier:1 as const,total:15 });
const result: ResultJson = { v:1,seed:75,mode:"pve",difficulty:"easy",buildA:build,buildB:build,orders:[NO_ORDERS,NO_ORDERS],winner:0,frames:1234,end:"ko",hash:99,
 chain:"Saved fight",finisher:"head off",names:["Tiny Biscuit 7","Blinky"],walletNames:["Brass Otter 7","House"],ids:[identity("Tiny Biscuit 7"),identity("Blinky")],houseShape:null,
 rewards:{attackerCoins:0,attackerPoints:0,attackerXp:0,defenderCoins:0,stakeHeld:0,stakePayout:0,houseBonus:0,drop:null,hat:null,attackerRepair:false},totalA:15,totalB:15 };
const row = { id:1,status:"resolved",mode:"pve",result,created_at:new Date().toISOString(),challenger_wallet:"not-public",stake:0,class_gap:0 } as BattleRow;
function adapter(opponentsFail:boolean,feedFail=false):BotsDb {
  return {from:(table:string)=>{
    const query:any={select:()=>query,eq:()=>query,in:()=>query,gte:()=>query,order:()=>query,limit:()=>query,is:()=>query,neq:()=>query,
      then:(resolve:Function)=>resolve(table==='battle_bots_battles'
        ? {data:feedFail?null:[row],error:feedFail?{message:'feed unavailable'}:null}
        : {data:[],error:opponentsFail?{message:'optional matchmaking unavailable'}:null})};
    return query;
  }} as unknown as BotsDb;
}
async function main(){
  const unavailable=await battlesView(adapter(true),null,null);
  assert.equal(unavailable.ok,true);assert.equal(unavailable.defendersAvailable,false);assert.deepEqual(unavailable.defenders,[]);
  assert.equal(unavailable.recent.length,1);assert.equal(unavailable.featured.fastestKo?.id,'1');
  assert.deepEqual(unavailable.recent[0].builds,[fightView(row,null).buildA,fightView(row,null).buildB]);
  assert(!JSON.stringify(unavailable).includes('not-public'),'saved robot assemblies never expose wallet addresses');
  const empty=await battlesView(adapter(false),null,null);
  assert.equal(empty.defendersAvailable,true);assert.deepEqual(empty.defenders,[]);
  await assert.rejects(()=>battlesView(adapter(false,true),null,null),/read: feed unavailable/);
  console.log('Community: opponent-search failure preserves canonical public replays; empty opponents remain distinct; actual feed failures remain errors.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
