/** Regression checks for individually owned limbs; no database or browser required. */
import assert from "node:assert/strict";
import { CARD_BY_ID, FIXTURE_BUILDS, OWNED_PARTS, STARTER_KIT, botTotal, engineBuild, recycleValue, type Build, type OwnedPart } from "../src/lib/bots/fixtures";
import { EQUIPMENT_SOCKETS, EQUIPMENT_KIND, fitPart, equipmentTarget, splitLegacyEquipment, socketsOf, withSockets, singlePrice, type EquipmentIds } from "../src/lib/bots/equipment";
import { assertModularBuild, combatPart, meanStats, modularBuild, modularSet, equipmentStatsTotal, type CombatBuild, type CombatSocket } from "../src/lib/bots/combat-model";
import { aggregates, deriveFighter } from "../src/app/bots/_combat/derive";
import { aggregates as oldAggregates } from "../src/app/bots/_engine/derive";
import { CANON, FAMILIES, familyBuild, WEAPON_OF_TIER, PARTS } from "../src/app/bots/_engine/catalog";
import { buildTotal, type Part, type Stats, type Orders } from "../src/app/bots/_engine/parts";
import { runFight, combatVersion } from "../src/lib/bots/combat";
import { runFight as oldRunFight, fightHash } from "../src/app/bots/_engine/resolve";
import { findsOf, NO_MARKS, type LookRows, type BotLook } from "../src/lib/bots/look";
import { earnedFor, engineBuildOf, totalOf, isComplete, partRecycleValue, partView, type BotRow, type PartRow } from "../src/app/bots/_server/bots";
import { canonicalBuild } from "../src/app/bots/_server/fight-read";
import { earnedOfBuild, getGarage, hydrateGarage, saveBuild, seedState, lookOfBay, bayOfPart } from "../src/lib/bots/garage-state";
import { practiceLink, readPracticeRobot, plainPracticeLook, demoReplayLink } from "../src/lib/bots/demo-replay";
import { starterPartRows } from "../src/app/bots/_server/players";
import { ownedOf } from "../src/lib/bots/live-garage";
import { SHOWCASE } from "../src/lib/bots/showcase";

let checks = 0;
function check(name: string, test: () => void) { test(); checks++; console.log(`[OK] ${name}`); }
const expand = (b: typeof CANON.T1) => modularBuild(b.head, b.torso, b.arms, b.arms, b.legs, b.legs, b.weapon);

check("Legacy pairs split once, conserving parts, coins, purchase history and resale", () => {
  const original = { parts: OWNED_PARTS.map(p => ({...p})), builds: {...FIXTURE_BUILDS}, coins: 873, bought: {"2026-09-06":["t2:1"]} };
  const frozen = JSON.stringify(original);
  const modern = splitLegacyEquipment(original);
  assert.equal(JSON.stringify(original), frozen);
  assert.equal(modern.coins, 873);
  assert.deepEqual(modern.bought, original.bought);
  for (const p of original.parts) {
    const pieces = modern.parts.filter(q => q.uid === p.uid || q.uid === `${p.uid}~r`);
    const limb = p.slot === "arms" || p.slot === "legs";
    assert.equal(pieces.length, limb ? 2 : 1);
    assert.equal(pieces.reduce((n, q) => n + q.price, 0), p.price);
    assert.equal(pieces.reduce((n, q) => n + recycleValue(q), 0), recycleValue(p));
  }
  assert.equal(splitLegacyEquipment(modern), modern);
  assert.equal(new Set(modern.parts.map(p => p.uid)).size, modern.parts.length);
  for (const [bay, b] of Object.entries(original.builds)) {
    assert.equal(botTotal(modern.builds[Number(bay)], modern.parts), botTotal(b, original.parts));
  }
  for (const card of STARTER_KIT.filter(p => p.slot === "arms" || p.slot === "legs")) {
    const state = splitLegacyEquipment({ parts:[{...card, uid:"starter", provenance:"Starter"}], builds:{} });
    assert.equal(state.parts.reduce((n,p) => n + recycleValue(p), 0), 6, "15 coin starter pairs keep all six resale coins");
  }
  for (const price of [50,200,600,2000]) assert.equal(singlePrice("arms", price) * 2, price);
});

const seeded = seedState(0);
check("Server starters and migrated inventory retain full resale through the client view", () => {
  const rows = starterPartRows("demo-wallet", true);
  assert.equal(rows.length, 7);
  assert.equal(rows.reduce((n,p) => n+p.list_price,0),75);
  assert.equal(rows.reduce((n,p) => n+partRecycleValue(p),0),30);
  for (const kind of ["arms","legs"] as const) {
    const limbs=rows.filter(p=>p.slot_kind===kind);
    assert.deepEqual(limbs.map(p=>p.list_price),[7,8]);
    assert.deepEqual(limbs.map(partRecycleValue),[3,3]);
  }
  rows.forEach((p,i)=>{
    const row={...p,id:i+1,recycled_at:null,created_at:"2026-09-06"} as PartRow;
    assert.equal(recycleValue(ownedOf(partView(row))),partRecycleValue(row));
  });
  assert.equal(partRecycleValue({list_price:8,stats:{salvage:-1}}),3);
  assert.equal(partRecycleValue({list_price:8,stats:{salvage:3.5}}),3);
  assert.equal(partRecycleValue({list_price:8,stats:{salvage:0}}),0);
});
const spark = { ...CARD_BY_ID["arms.kettleGrips"], uid:"test.spark", paint:"coral", provenance:"Test" } as OwnedPart;
const anvil = { ...CARD_BY_ID["arms.pistonLevers"], uid:"test.anvil", paint:"mint", provenance:"Test" } as OwnedPart;
const mixedParts = [...seeded.parts, spark, anvil];
let mixed = fitPart(fitPart(seeded.builds[1], spark, "armR"), anvil, "armL");
check("A Spark right arm and Anvil left arm keep their own identity and paint", () => {
  assert.equal(socketsOf(mixed).armR, spark.uid);
  assert.equal(socketsOf(mixed).armL, anvil.uid);
  const b = engineBuild(mixed, mixedParts) as CombatBuild;
  assert.equal(combatPart(b, "armR").id, spark.id);
  assert.equal(combatPart(b, "armL").id, anvil.id);
  assert.equal(combatPart(b, "armR").paint, "coral");
  const moved = fitPart(mixed, spark, "armL");
  assert.equal(moved.sockets!.armR, null);
  assert.equal(moved.sockets!.armL, spark.uid);
  assert.throws(() => fitPart(mixed, spark, "legL"), /does not fit/);
});

check("Whole-number averaging is independent of left/right order, including one-point parts", () => {
  const stats = [...PARTS.filter(p => p.slot === "arms" || p.slot === "legs").map(p => p.s), [1,0,0], [0,1,0], [0,0,1], [0,0,0]] as Stats[];
  for (const a of stats) for (const b of stats) assert.deepEqual(meanStats(a,b), meanStats(b,a));
  assert.deepEqual(meanStats([1,0,0], [0,1,0]), [1,0,0]);
  assert.deepEqual(meanStats([1,0,0], [0,0,0]), [0,0,0]);
});

check("Every paired family has the same aggregates under all three stances", () => {
  for (const family of FAMILIES) {
    const old = familyBuild(family.id, WEAPON_OF_TIER[family.tier]);
    const modern = expand(old);
    for (const stance of [0,1,2] as const) assert.deepEqual(aggregates(modern,{stance,focus:0}), oldAggregates(old,{stance,focus:0}));
  }
});

check("Modern aliases must describe their actual limbs and every limb is validated", () => {
  const b = engineBuild(mixed, mixedParts) as CombatBuild;
  assertModularBuild(b, "mixed");
  const altered = structuredClone(b);
  altered.arms.s[0]++;
  assert.throws(() => assertModularBuild(altered,"mixed"), /summary does not match/);
  const badPaint = structuredClone(b);
  (badPaint.limbs!.armR as unknown as {paint:string}).paint="pink";
  assert.throws(() => assertModularBuild(badPaint,"mixed"), /illegal paint/);
  const wrongKind=structuredClone(b);
  wrongKind.limbs!.legR=wrongKind.limbs!.armR;
  assert.throws(() => assertModularBuild(wrongKind,"mixed"), /wrong part/);
});

const rowsBase: LookRows = {wins:0,losses:0,level:1,champion:false,bodyPaints:[],partStars:[],hats:[],plateNumber:null};
check("Colour rewards require all six modern body pieces; old four-card rewards stay valid", () => {
  assert.equal(findsOf({...rowsBase,bodyCount:6,bodyPaints:["mint","mint","mint","mint"]}).colourMatch,false);
  assert.equal(findsOf({...rowsBase,bodyCount:6,bodyPaints:Array(6).fill("mint")}).colourMatch,true);
  assert.equal(findsOf({...rowsBase,bodyCount:6,bodyPaints:["mint","mint","mint","mint","mint","coral"]}).colourMatch,false);
  assert.equal(findsOf({...rowsBase,bodyPaints:Array(4).fill("mint")}).colourMatch,true);
  const missing=withSockets(seeded.builds[1],{...socketsOf(seeded.builds[1]),armR:null,legR:null});
  assert.equal(earnedOfBuild(missing,seeded.parts,seeded.bays[1],1).colourMatch,false);
});

function serverRows(build: Build, owned: OwnedPart[]) {
  const parts: PartRow[] = owned.map((p,i) => ({id:i+1,wallet:"demo",part_key:p.id,slot_kind:p.slot,tier:p.tier,stats:{s:p.s,paint:p.paint,equipmentVersion:2},bot_id:null,source:"shop",list_price:p.price,recycled_at:null,is_test:true,created_at:"2026-09-06"}));
  const sockets = Object.fromEntries(EQUIPMENT_SOCKETS.map(s => [s,owned.findIndex(p=>p.uid===socketsOf(build)[s])+1 || null])) as EquipmentIds<number>;
  const ids={head:sockets.head,torso:sockets.torso,arms:sockets.armL,legs:sockets.legL,weapon:sockets.weapon};
  const bot: BotRow={id:1,wallet:"demo",slot:1,name:"Sparky Kettle",build:{parts:ids,sockets,equipmentVersion:2},total:0,tier:1,weight_class:"",level:1,xp:0,wins:0,losses:0,broken_until:null,attacks_day_key:null,attacks_today:0,defenses_today:0,listed:true,recycled_at:null,is_test:true,created_at:"2026-09-06"};
  return {bot,parts,sockets,ids};
}
check("Server rows, save totals and workshop agree on complete and incomplete mixed builds", () => {
  for (const build of [mixed, withSockets(mixed,{...mixed.sockets!,legR:null}), withSockets(mixed,{...mixed.sockets!,armR:null,legR:null})]) {
    const {bot,parts,sockets,ids}=serverRows(build,mixedParts);
    assert.equal(totalOf(bot,parts),botTotal(build,mixedParts));
    const values=Object.fromEntries(EQUIPMENT_SOCKETS.map(s=>[s,parts.find(p=>p.id===sockets[s])?.stats?.s??[0,0,0]])) as Record<CombatSocket,Stats>;
    assert.equal(equipmentStatsTotal(values),totalOf(bot,parts));
    assert.equal(earnedFor({wins:0,losses:0,level:1,crown:false,partIds:ids,socketIds:sockets,plateNumber:null},parts).colourMatch, earnedOfBuild(build,mixedParts,undefined,1).colourMatch);
    const complete=EQUIPMENT_SOCKETS.every(s=>sockets[s]!=null);
    assert.equal(isComplete(bot,parts),complete);
    if (complete) assert.deepEqual(engineBuildOf(bot,parts),engineBuild(build,mixedParts));
    else assert.equal(engineBuildOf(bot,parts),null);
  }
  // The edge case which used to disagree: two distinct one-point limbs.
  const weakParts=mixedParts.map(p=>p.uid===spark.uid?{...p,s:[1,0,0] as Stats}:p.uid===anvil.uid?{...p,s:[0,1,0] as Stats}:p);
  const {bot,parts}=serverRows(mixed,weakParts);
  assert.equal(totalOf(bot,parts),botTotal(mixed,weakParts));
  const duplicated=serverRows(mixed,mixedParts);
  duplicated.bot.build!.sockets!.armR=duplicated.bot.build!.sockets!.armL;
  assert.equal(isComplete(duplicated.bot,duplicated.parts),false);
  assert.equal(engineBuildOf(duplicated.bot,duplicated.parts),null);
});

check("Mixed limb armour follows the fitted side and v3 replays survive JSON storage", () => {
  const b=engineBuild(mixed,mixedParts) as CombatBuild;
  const swapped=modularBuild(b.head,b.torso,b.limbs!.armR,b.limbs!.armL,b.limbs!.legL,b.limbs!.legR,b.weapon);
  const f=deriveFighter(b), other=deriveFighter(swapped);
  assert.notEqual(f.pieceArmor[2],f.pieceArmor[3]);
  assert.equal(f.pieceArmor[2],other.pieceArmor[3]);
  assert.equal(f.pieceArmor[3],other.pieceArmor[2]);
  for (let seed=1;seed<=30;seed++) {
    const first=runFight(seed,b,CANON.T2);
    const replay=runFight(seed,canonicalBuild(JSON.parse(JSON.stringify(b))),CANON.T2);
    assert.equal(first.st.v,3);
    assert.deepEqual(replay.st,first.st);
  }
  for (const tier of ["T1","T2","T3","T4"] as const) {
    assert.equal(combatVersion(CANON[tier],CANON[tier]),2);
    assert.deepEqual(runFight(918,CANON[tier],CANON[tier]).st,oldRunFight(918,CANON[tier],CANON[tier]).st);
  }
});

check("Practice share links preserve all seven pieces and reject malformed builds", () => {
  const url = new URL(practiceLink(mixed, mixedParts, 871), "http://localhost:3000");
  const encoded = url.searchParams.get("robot")!;
  const snapshot = readPracticeRobot(encoded)!;
  assert.ok(snapshot);
  assert.equal(url.searchParams.get("seed"), "871");
  assert.deepEqual(snapshot.build, engineBuild(mixed, mixedParts));
  const newBuild = fitPart(mixed, spark, "armL");
  assert.notDeepEqual(snapshot.build, engineBuild(newBuild, mixedParts));
  assert.deepEqual(readPracticeRobot(encoded)!.build, snapshot.build);
  const value = JSON.parse(encoded);
  value.pieces[0] = value.pieces[2];
  assert.equal(readPracticeRobot(JSON.stringify(value)), null);
  value.pieces[0] = ["head.hornetScope", "not-a-colour"];
  assert.equal(readPracticeRobot(JSON.stringify(value)), null);
  assert.equal(readPracticeRobot("x".repeat(4097)), null);
  assert.equal(readPracticeRobot("{}"), null);
  assert.throws(() => practiceLink(newBuild, mixedParts), /Add every part/);
});

check("The browser store reloads independent sockets and preserves split salvage", () => {
  const storage=new Map<string,string>();
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}});
  storage.set("bots.garage.v1",JSON.stringify({...seeded,parts:mixedParts,builds:{...seeded.builds,1:mixed}}));
  hydrateGarage(0);
  assert.deepEqual(socketsOf(getGarage().builds[1]),socketsOf(mixed));
  assert.deepEqual(getGarage().parts.map(p=>p.salvage),mixedParts.map(p=>p.salvage));
  saveBuild(mixed);
  const persisted=JSON.parse(storage.get("bots.garage.v1")!);
  assert.equal(persisted.builds[1].sockets.armR,spark.uid);
  assert.equal(persisted.builds[1].sockets.armL,anvil.uid);
  assert.equal(persisted.equipmentVersion,2);
  delete (globalThis as unknown as {localStorage?:unknown}).localStorage;
});

check("Practice pictures retain chosen cosmetics without changing fight hashes or granting marks", () => {
  const chosen: BotLook = {face:"happy",sticker:"heart",spot:"boot",stickerPaint:"coral",hat:{kind:"bow",color:"butter"},plateNumber:7};
  const dressed={...mixed,look:chosen};
  const url=new URL(practiceLink(dressed,mixedParts,33),"http://localhost:3000");
  const raw=url.searchParams.get("robot")!;
  const snapshot=readPracticeRobot(raw)!;
  assert.deepEqual(snapshot.look.look,chosen);
  assert.deepEqual(snapshot.look.paints,plainPracticeLook(engineBuild(mixed,mixedParts)).paints);
  assert.deepEqual(snapshot.look.marks,NO_MARKS);
  assert.equal(snapshot.look.wins,0);
  const changed={...dressed,look:{...chosen,face:"calm" as const,sticker:null,hat:null}};
  const changedRaw=new URL(practiceLink(changed,mixedParts,33),"http://localhost:3000").searchParams.get("robot")!;
  const second=readPracticeRobot(changedRaw)!;
  assert.deepEqual(second.build,snapshot.build);
  assert.equal(fightHash(runFight(33,snapshot.build,CANON.T2).st),fightHash(runFight(33,second.build,CANON.T2).st));
  assert.equal("look" in snapshot.build,false);

  const bad=JSON.parse(raw);
  bad.look={face:"made-up-face",sticker:"<script>",spot:"sky",stickerPaint:"pink",hat:{kind:"crown"},plateNumber:-99};
  bad.marks={stars:999,crown:true}; bad.wins=999; bad.earned={champion:true};
  const cleaned=readPracticeRobot(JSON.stringify(bad))!;
  assert.ok(cleaned);
  assert.equal(cleaned.look.look.face,"calm");
  assert.equal(cleaned.look.look.sticker,null);
  assert.equal(cleaned.look.look.spot,"chest");
  assert.equal(cleaned.look.look.hat,null);
  assert.equal(cleaned.look.look.plateNumber,null);
  assert.deepEqual(cleaned.look.marks,NO_MARKS);
  assert.equal(cleaned.look.wins,0);
  bad.look={face:"wink",hat:{kind:"bow",color:"pink"}};
  const gated=readPracticeRobot(JSON.stringify(bad))!;
  assert.equal(gated.look.look.face,"calm","Mixed body colours cannot claim the matched-colour face");
  assert.equal(gated.look.look.hat,null);
  bad.look="invalid";
  assert.equal(readPracticeRobot(JSON.stringify(bad))!.look.look.face,"calm");
  delete bad.look;
  assert.equal(readPracticeRobot(JSON.stringify(bad))!.look.look.sticker,null,"Old practice links still load");
  assert.deepEqual(readPracticeRobot(raw)!.look.look,chosen,"Later choices cannot change the captured picture");
});

check("Preview and placement choose one socket and respect an explicitly selected side", () => {
  const emptyArms=withSockets(mixed,{...mixed.sockets!,armL:null,armR:null});
  assert.equal(equipmentTarget(emptyArms,"arms"),"armL");
  assert.equal(equipmentTarget(emptyArms,"arms","armR"),"armR");
  const target=equipmentTarget(emptyArms,"arms","armR");
  const fitted=fitPart(emptyArms,spark,target);
  assert.equal(fitted.sockets!.armL,null);
  assert.equal(fitted.sockets!.armR,spark.uid);
  assert.equal(equipmentTarget(fitted,"arms"),"armL");
  assert.equal(equipmentTarget(mixed,"arms","armR"),"armR");
});

check("Every practice share path preserves stance and focus with the same replay hash", () => {
  const orders: [Orders,Orders]=[{stance:2,focus:1},{stance:1,focus:3}];
  const robot=new URL(practiceLink(mixed,mixedParts),"http://localhost:3000").searchParams.get("robot")!;
  for(const [subject,a,b] of [
    [{robot},engineBuild(mixed,mixedParts),CANON.T2],
    [{showcase:true},SHOWCASE.a,SHOWCASE.b],
    [{a:"T1",b:"T2"},CANON.T1,CANON.T2],
  ] as const){
    const q=new URL(demoReplayLink(7,subject,orders),"http://localhost:3000").searchParams;
    const restored=["A","B"].map(side=>({stance:Number(q.get(`stance${side}`)),focus:Number(q.get(`focus${side}`))})) as [Orders,Orders];
    assert.deepEqual(restored,orders);
    assert.equal(fightHash(runFight(7,a,b,...orders).st),fightHash(runFight(Number(q.get("seed")),a,b,...restored).st));
    if("robot" in subject) assert.equal(q.get("robot"),robot);
    if("showcase" in subject) assert.equal(q.get("showcase"),"1");
    if("a" in subject) assert.equal(q.get("a"),"T1");
  }
});

check("The garage retains saved looks and colours owned only by the right limb", () => {
  const chosen: BotLook={face:"happy",sticker:"heart",spot:"cheek",stickerPaint:"coral",hat:{kind:"bell",color:"butter"},plateNumber:7};
  const dressed={...mixed,look:chosen};
  const state={...seeded,parts:mixedParts,builds:{1:dressed}};
  assert.deepEqual(lookOfBay(state,1),chosen);
  assert.equal(Object.values(dressed.cards).includes(spark.uid),false);
  assert.equal(bayOfPart(state,spark.uid),1);
  const removed=withSockets(dressed,{...dressed.sockets!,armR:null});
  assert.notEqual(lookOfBay({...state,builds:{1:removed}},1).stickerPaint,"coral");
});

console.log(`\n${checks} equipment checks passed.`);
