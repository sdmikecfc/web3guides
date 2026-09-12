import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {createFightV6,incomingThreatV6,acceptSpecialV6,controlledV6,resultV6,replayV6,stepFightV6,FAMILIES_V6,MAX_FRAMES_V6,RULES_V6,WEAPON_KINDS_V6,cardV6,weaponCompatibilityV6,cloneV6,collisionManifestV6,presetV6,runFightV6,snapshotBuildV6,type BuildV6,type DefensePlanV6,type StyleV6,type TierV6,type WeaponKindV6} from "../src/lib/bots/v6";

// The manifest module registers immutable authored proxy metadata. No service or DB access.
const moduleName=process.env.MK_V6_COLLISION_MODULE??"catalogue-collision";
assert(/^[a-z][a-z0-9-]*$/.test(moduleName));require(path.join(__dirname,"../src/lib/bots/v6",moduleName));
const version=process.env.MK_V6_COLLISION_VERSION??"mk6-collision-catalogue-1";collisionManifestV6(version);
const styles:StyleV6[]=["tank","speed","ranged"],plans:DefensePlanV6[]=["early","balanced","last-stand"];
type Kind="role"|"hybrid"|"arsenal"|"signature"|"splash"|"manual"|"mirror";
interface Cohort {kind:Kind;tier:TierV6;count:number;id:string}
const referenceSeeds=Number(process.env.MK_V6_REFERENCE_SEEDS??16);assert(Number.isInteger(referenceSeeds)&&referenceSeeds>=16&&referenceSeeds<=64);const cohorts:Cohort[]=[];
for(const tier of [1,2,3,4] as const){cohorts.push({kind:"mirror",tier,count:16,id:`mirror-t${tier}`},{kind:"manual",tier,count:12,id:`manual-t${tier}`},{kind:"role",tier,count:referenceSeeds,id:`role-t${tier}`},{kind:"hybrid",tier,count:8,id:`hybrid-t${tier}`});if(tier>=2)cohorts.push({kind:"arsenal",tier,count:72,id:`arsenal-t${tier}`});if(tier>=3)cohorts.push({kind:"signature",tier,count:16,id:`signature-t${tier}`},{kind:"splash",tier,count:8,id:`splash-t${tier}`});}
const selected=process.env.MK_V6_BENCH_COHORT??"all",splitFilter=process.env.MK_V6_BENCH_SPLIT,sampleOverride=process.env.MK_V6_BENCH_SEEDS?Number(process.env.MK_V6_BENCH_SEEDS):null;
assert(selected==="all"||cohorts.some(c=>c.id===selected));assert(splitFilter==="train"||splitFilter==="heldout","Choose an explicit bank. Held-out is never the default.");if(sampleOverride!==null)assert(Number.isInteger(sampleOverride)&&sampleOverride>=2&&sampleOverride<=64);
const code=path.join(__dirname,"../src/lib/bots/v6"),sourceHash=createHash("sha256");for(const file of readdirSync(code).filter(f=>(f.endsWith(".ts")||f.endsWith(".json"))&&!["index.ts","assets.ts","asset-catalogue.json"].includes(f)).sort()){sourceHash.update(file);sourceHash.update(readFileSync(path.join(code,file),"utf8").replace(/\r\n/g,"\n"));}
console.log(JSON.stringify({sourceHash:sourceHash.digest("hex"),testHash:createHash("sha256").update(readFileSync(__filename,"utf8").replace(/\r\n/g,"\n")).digest("hex"),rules:RULES_V6,collisionVersion:version,selected,splitFilter,sampleOverride,referenceSeeds,pairFilter:process.env.MK_V6_BENCH_PAIR??null,hashScope:"simulation/catalogue/collision; excludes visual registry and re-export index; normalizes CRLF"}));
const pairFilter=process.env.MK_V6_BENCH_PAIR??null;if(pairFilter)assert(["tank/speed","tank/ranged","speed/ranged"].includes(pairFilter));
const records:unknown[]=[],failures:string[]=[];
// Every legal ordered assignment appears once per body-style pairing. The cannon
// is a Ranged-only tier3+ kit, so it is never tested on an illegal Tank/Speed body.
function arsenalAssignments(tier:TierV6,a:StyleV6,b:StyleV6):[WeaponKindV6,WeaponKindV6][] {
 const body=(style:StyleV6)=>`mk6.t${tier}.${FAMILIES_V6.find(f=>f.style===style)!.id}.torso`,allowed=(style:StyleV6)=>WEAPON_KINDS_V6.filter(w=>weaponCompatibilityV6(`mk6.t${tier}.weapon.${w}`,body(style)).compatible),left=allowed(a),right=allowed(b),pairs:[WeaponKindV6,WeaponKindV6][]=[];
 for(const first of left)for(const second of right)if(first!==second)pairs.push([first,second]);
 const expected=new Set(left.flatMap(first=>right.filter(second=>first!==second).map(second=>`${first}/${second}`)));assert.equal(pairs.length,new Set(pairs.map(p=>p.join('/'))).size);assert.deepEqual(new Set(pairs.map(p=>p.join('/'))),expected);assert.equal(pairs.length,tier===2||b!=='ranged'?72:81);return pairs;
}
for(const tier of [2,3,4] as const)for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)arsenalAssignments(tier,styles[a],styles[b]);
const family=(style:StyleV6,index:number)=>FAMILIES_V6.filter(f=>f.style===style)[index%2].id;
function build(style:StyleV6,cohort:Cohort,index:number,side:number,familyIndex?:number,arsenalWeapon?:WeaponKindV6):BuildV6 {
 const {kind,tier}=cohort,chosenFamily=family(style,kind==="mirror"?index%2:familyIndex??(side===0?Math.floor(index/2):index));let base=presetV6(style,tier,{family:chosenFamily,signature:kind==="signature",collisionVersion:version});
 if(kind==="role"||kind==="signature"||kind==="manual"||kind==="mirror")return base;
 if(kind==="splash"){
  const raw=cloneV6(presetV6(style,tier===3?1:2,{family:chosenFamily,collisionVersion:version}).appearanceBuild);raw.torso=base.appearanceBuild.torso;raw.weapon=presetV6(style,2,{collisionVersion:version}).appearanceBuild.weapon;return snapshotBuildV6(raw,{collisionVersion:version});
 }
 if(kind==="arsenal"){
  assert(arsenalWeapon,"Use the recorded legal arsenal assignment.");return presetV6(style,tier,{family:chosenFamily,weapon:arsenalWeapon,collisionVersion:version});
 }
 const donor=presetV6(styles[(styles.indexOf(style)+1+index%2)%3],tier,{collisionVersion:version}),raw=cloneV6(base.appearanceBuild);raw.head=donor.appearanceBuild.head;raw.limbs!.armL=donor.appearanceBuild.limbs!.armL;raw.limbs!.legR=donor.appearanceBuild.limbs!.legR;return snapshotBuildV6(raw,{collisionVersion:version});
}
if(process.env.MK_V6_BENCH_VALIDATE_ONLY==="1"){
 let assignments=0;for(const tier of [2,3,4] as const)for(let a=0;a<3;a++)for(let b=a+1;b<3;b++)for(const [index,weapons] of Array.from(arsenalAssignments(tier,styles[a],styles[b]).entries())){const cohort:Cohort={kind:"arsenal",tier,count:72,id:`arsenal-t${tier}`},A=build(styles[a],cohort,index,0,undefined,weapons[0]),B=build(styles[b],cohort,index,1,undefined,weapons[1]);assert.equal(A.gp,B.gp);assert.equal(A.capabilities.weapon,weapons[0]);assert.equal(B.capabilities.weapon,weapons[1]);assignments++;}console.log(JSON.stringify({ok:true,legalOrderedWeaponAssignments:assignments,uniqueAssignmentsPerTier:{t2:[72,72,72],t3:[72,81,81],t4:[72,81,81]},fightsRun:0}));process.exit(0);
}
function manualMatch(seed:number,A:BuildV6,B:BuildV6,defensePlans:[DefensePlanV6,DefensePlanV6],manual:0|1,verifyReplay:boolean){
 const state=createFightV6(seed,A,B,{autoSpecial:manual===0?[false,true]:[true,false],defensePlans});let sequence=0;
 while(!state.done){const f=state.fighters[manual],r=state.fighters[1-manual],style=state.builds[manual].style,d=Math.hypot(f.x-r.x,f.z-r.z),hp=f.armour[1]/state.stats[manual].armour[1];
  const useful=hp<.3||(style==="tank"?incomingThreatV6(state,manual):style==="speed"?d<2700&&!(r.special?.style==="tank"&&r.special.shieldLeft>0):d<3500);
  if(f.meter>=100&&!f.special&&!controlledV6(state,manual)&&useful){const receipt=acceptSpecialV6(state,{id:`manual-${++sequence}-${state.frame}`,kind:"special",who:manual,frame:state.frame});assert(receipt.accepted);}
  stepFightV6(state);
 }
 const result=resultV6(state);if(verifyReplay)assert.equal(replayV6(result).hash,result.hash);return result;
}
let games=0,allTimeouts=0;
for(const split of ["train","heldout"] as const){if(splitFilter!==split)continue;const bank=styles.map(()=>({wins:0,games:0}));let bankSideWins=0,bankGames=0,referenceTiers=0;
 for(const cohort of cohorts){if(selected!=="all"&&selected!==cohort.id)continue;const cohortCount=sampleOverride??cohort.count,totals=styles.map(()=>({wins:0,games:0})),reference=cohort.kind==="role",familyCombinations=reference?4:1;let cohortSideWins=0,cohortGames=0;
  for(let a=0;a<3;a++)for(let b=cohort.kind==="mirror"?a:a+1;b<(cohort.kind==="mirror"?a+1:3);b++){if(pairFilter&&`${styles[a]}/${styles[b]}`!==pairFilter)continue;const assignments=cohort.kind==="arsenal"?arsenalAssignments(cohort.tier,styles[a],styles[b]):null,count=assignments?.length??cohortCount;let wins=0,sideWins=0,timeouts=0,disabled=0,shots=0,duration=0;const subgroups:Record<string,{wins:number;matches:number;shots:number}>={},weaponScores:Record<string,{wins:number;matches:number}>={};for(let i=0;i<count;i++)for(let combination=0;combination<familyCombinations;combination++){
   const seed=((split==="train"?0x19e52103:0x6387af31)+(i+1)*(split==="train"?104729:1299709)+cohort.tier*8191)>>>0,A=build(styles[a],cohort,i,0,reference?Math.floor(combination/2):undefined,assignments?.[i][0]),B=build(styles[b],cohort,i,1,reference?combination%2:undefined,assignments?.[i][1]);assert.equal(A.gp,B.gp);
   const planA=plans[i%3],planB=cohort.kind==="mirror"?planA:plans[Math.floor(i/3)%3],subgroup=`${A.parts.torso.family}/${A.capabilities.weapon}/${planA} vs ${B.parts.torso.family}/${B.capabilities.weapon}/${planB}`,sub=subgroups[subgroup]??={wins:0,matches:0,shots:0};for(const swap of cohort.kind==="mirror"?[0]:[0,1]){const actualPlans:[DefensePlanV6,DefensePlanV6]=swap?[planB,planA]:[planA,planB],r=cohort.kind==="manual"?manualMatch(seed,swap?B:A,swap?A:B,actualPlans,((i%2+swap)%2) as 0|1,i===0&&swap===0):runFightV6(seed,swap?B:A,swap?A:B,{autoSpecial:[true,true],defensePlans:actualPlans});const first=r.winner===swap,shotCount=r.events.filter(e=>e.kind==="shot").length;wins+=Number(first);sideWins+=Number(r.winner===0);totals[first?a:b].wins++;totals[a].games++;totals[b].games++;timeouts+=Number(r.frames===MAX_FRAMES_V6);disabled+=Number(r.events.at(-1)?.defeatReason==="disabled");shots+=shotCount;duration+=r.frames;sub.wins+=Number(first);sub.matches++;sub.shots+=shotCount;if(cohort.kind==="arsenal"){const wa=weaponScores[A.capabilities.weapon]??={wins:0,matches:0},wb=weaponScores[B.capabilities.weapon]??={wins:0,matches:0};wa.matches++;wb.matches++;wa.wins+=Number(first);wb.wins+=Number(!first);}games++;}
  }
  const matches=count*(cohort.kind==="mirror"?1:2)*familyCombinations,rate=wins/matches,label=`${split} ${cohort.id} ${styles[a]}/${styles[b]}`,row={split,cohort:cohort.id,pair:`${styles[a]}/${styles[b]}`,reference,independentSeeds:count,familyCombinations,matches,firstStyleWinRate:rate,firstSideWinRate:sideWins/matches,timeouts,disabled,shots,meanSeconds:duration/(matches*60),subgroups,...(cohort.kind==="arsenal"?{weaponScores,weaponAssignments:assignments}:{})};records.push(row);console.log(JSON.stringify(row));if(reference&&(rate<.3||rate>.7))failures.push(`${label} ${(rate*100).toFixed(2)}% outside 30–70%`);if(timeouts)failures.push(`${label}: ${timeouts} timeouts`);cohortSideWins+=sideWins;cohortGames+=matches;allTimeouts+=timeouts;
  }
  const scores=totals.map((t,i)=>({style:styles[i],...t,winRate:t.wins/t.games})),sideBias=Math.abs(cohortSideWins/cohortGames-.5);console.log(JSON.stringify({split,cohort:cohort.id,scores,sideBias}));if(reference){referenceTiers++;bankSideWins+=cohortSideWins;bankGames+=cohortGames;totals.forEach((t,i)=>{bank[i].wins+=t.wins;bank[i].games+=t.games;});}
 }
 const scores=bank.map((t,i)=>({style:styles[i],...t,winRate:t.games?t.wins/t.games:0})),sideBias=bankGames?Math.abs(bankSideWins/bankGames-.5):0;console.log(JSON.stringify({split,referenceBank:true,referenceTiers,scores,sideBias}));if(referenceTiers===4){for(const score of scores)if(score.winRate<.4||score.winRate>.6)failures.push(`${split} reference bank ${score.style}: ${(score.winRate*100).toFixed(2)}% outside 40–60%`);if(sideBias>=.05)failures.push(`${split} reference bank: ${(sideBias*100).toFixed(2)}pp side bias, required <5pp`);}
}
const complete=selected==="all"&&sampleOverride===null&&pairFilter===null;
console.log(JSON.stringify({ok:failures.length===0&&complete,complete,games,timeouts:allTimeouts,failures}));
assert.equal(failures.length,0,failures.join("\n"));if(process.env.MK_V6_BENCH_PARTITION!=="1")assert(complete,"This selected/reduced diagnostic is not the complete release balance gate.");
