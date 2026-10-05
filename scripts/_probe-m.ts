import * as fs from "node:fs";
import * as path from "node:path";
import { fnv1a } from "../src/app/bots/_engine/rng";
import { CANON } from "../src/app/bots/_engine/catalog";
import { runFight, fightHash } from "../src/app/bots/_engine/resolve";
import type { Build, CanonKey } from "../src/app/bots/_engine/parts";

const PAIRINGS: readonly [CanonKey, CanonKey][] = [["T1","T1"],["T2","T2"],["T3","T3"],["T4","T4"]];
const hex = (n:number)=> (n>>>0).toString(16).padStart(8,"0");
const seedAt = (i:number)=> fnv1a(`bots-baseline-${i}`);

function dress(b: Build): Build {
  const d = (p: any) => ({ ...p, look: { face:"happy" }, face:"happy", sticker:{id:"star",spot:"chest"}, decal:"bolt", topper:{kind:"bow"}, hat:{kind:"bow",color:"coral"}, marks:{stars:6} });
  return { legs: d(b.legs), arms: d(b.arms), torso: d(b.torso), head: d(b.head), weapon: d(b.weapon), look: { face:"stars" } } as any;
}

let rawSame = 0, rawDiff = 0, decSame = 0, decDiff = 0;
const plainHashes: string[][] = [[],[],[],[]];
for (let p=0;p<4;p++) for (let i=0;i<50;i++) {
  const [ka,kb]=PAIRINGS[p];
  const a = runFight(seedAt(i), CANON[ka], CANON[kb]).st;
  const b = runFight(seedAt(i), dress(CANON[ka]), dress(CANON[kb])).st;
  plainHashes[p].push(hex(fightHash(a)));
  if (fightHash(a)===fightHash(b)) rawSame++; else rawDiff++;
  const strip = (st:any)=>{ const {builds, ...rest}=st; return JSON.stringify(rest); };
  if (strip(a)===strip(b)) decSame++; else decDiff++;
}
console.log("raw hash same/diff:", rawSame, rawDiff);
console.log("decision (state minus builds echo) same/diff:", decSame, decDiff);
const roll=(hs:string[])=>hex(fnv1a(hs.join(",")));
console.log(PAIRINGS.map((p,i)=>`${p[0]}v${p[1]} ${roll(plainHashes[i])}`).join("  "), " all", roll(plainHashes.flat()));

// source-gate probe
const WORDS = ["look","looks","face","faces","sticker","stickers","decal","decals","topper","toppers","hat","hats","mark","marks"];
const re = new RegExp(`\b(${WORDS.join("|")})\b`,"i");
const dir = path.join(process.cwd(),"src/app/bots/_engine");
function strip(src:string){
  const block = new RegExp("/\*[\s\S]*?\*/","g");
  const line = new RegExp("//[^\n]*","g");
  const dq = new RegExp('"(?:[^"\\\n]|\\.)*"',"g");
  const sq = new RegExp("'(?:[^'\\\n]|\\.)*'","g");
  const bq = new RegExp("`(?:[^`\\]|\\.)*`","g");
  return src.replace(block,"").replace(line,"").replace(dq,'""').replace(sq,"''").replace(bq,"``");
}
for (const f of fs.readdirSync(dir)) {
  if(!f.endsWith(".ts")) continue;
  strip(fs.readFileSync(path.join(dir,f),"utf8")).split("\n").forEach((line,i)=>{
    if(re.test(line)) console.log(`HIT ${f}:${i+1}  ${line.trim().slice(0,110)}`);
  });
}
