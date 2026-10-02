import assert from 'node:assert/strict';
import { CARD_INDEX, CANON_T1 } from '@/app/bots/_engine/catalog';
import { runFight as legacyFight, fightHash } from '@/app/bots/_engine/resolve';
import { fnv1a } from '@/app/bots/_engine/rng';
import { CANON_T2, CANON_T3, CANON_T4 } from '@/app/bots/_engine/catalog';
import { acceptSpecialV5, advanceFightV5, applyControlV5, cardV5, createFightV5, hashV5, hitV5, MAX_FRAMES_V5, movementV5, presetV5, replayV5, resultV5, RIFLE_MIN_RANGE_V5, runFightV5, snapshotBuildV5, SLOTS_V5, STARTER_CARDS_V5, statsV5, stepFightV5, STYLES_V5, V5_CATALOG, validBuildV5, weaponDamageV5, type StateV5, type StyleV5 } from '../src/lib/bots/v5';
let checks=0;
function check(name:string, test:()=>void){ test(); checks++; console.log('PASS',name); }
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
const make=(a:StyleV5='tank',b:StyleV5='speed',tier:1|2|3|4=1)=>createFightV5(17,presetV5(a,tier),presetV5(b,tier),{autoSpecial:[false,false]});
const ready=(s:StateV5,who:0|1,id='special')=>{s.fighters[who].meter=100;assert(acceptSpecialV5(s,{id,who,kind:'special',frame:s.frame}).accepted);};
const noAttacks=(s:StateV5)=>s.fighters.forEach(f=>{f.armour[2]=f.armour[3]=0;});
check('catalogue has equal-budget distinct starters, all four tiers, stable art and strict saved identity',()=>{
  assert.equal(STARTER_CARDS_V5.length,15);
  for(const slot of ['head','torso','arms','legs','weapon']){const rows=STARTER_CARDS_V5.filter(c=>c.slot===slot);assert.equal(new Set(rows.map(c=>c.s.join())).size,3);for(const c of rows){assert.deepEqual([...c.s].sort(),[0,1,2]);assert.equal(cardV5(`beginner.v2.${c.id}`)?.id,c.id);}}
  for(const c of [...V5_CATALOG,...STARTER_CARDS_V5]){assert(CARD_INDEX[c.artKey],c.artKey);assert.equal(c.s.reduce((a,b)=>a+b),[0,3,7,12,18][c.tier]);}
  for(const style of STYLES_V5){const b=presetV5(style,1,true);assert(validBuildV5(b));assert.equal(b.parts.head.id,`mk5.starter.${style}.head`);assert.equal(50*3+25*4,250);assert.equal(statsV5(b.appearanceBuild).speed,b.stats.speed);}
  assert.throws(()=>snapshotBuildV5(CANON_T1));
  const b=presetV5('tank');b.appearanceBuild.head.s[0]++;assert.throws(()=>snapshotBuildV5(b.appearanceBuild));
  const legacy=copy(presetV5('speed').appearanceBuild);legacy.head={id:'head.peeperEye',s:[12,8,0]};assert.throws(()=>snapshotBuildV5(legacy));legacy.head={id:'beginner.v1.head.anvilMask',s:[1,1,1]};assert.equal(snapshotBuildV5(legacy).parts.head.tier,1);legacy.head.s=[9,9,1];assert.throws(()=>snapshotBuildV5(legacy));
  const aliases=copy(presetV5('speed').appearanceBuild);aliases.arms={id:'forged',s:[12,8,0]};assert.deepEqual(snapshotBuildV5(aliases).appearanceBuild.arms,presetV5('speed').appearanceBuild.arms);
  const fresh=presetV5('speed'), state=createFightV5(1,fresh,presetV5('ranged'));fresh.appearanceBuild.head.s[0]++;assert.notEqual(fresh.appearanceBuild.head.s[0],state.builds[0].appearanceBuild.head.s[0]);
  assert(validBuildV5(copy(presetV5('tank'))));
});
check('meter gives 5/sec and actual body-damage bonus capped per charge, with no charging during active',()=>{
  const s=make();noAttacks(s);advanceFightV5(s,1200);assert.equal(s.fighters[0].meter,100);assert.equal(s.fighters[1].meter,100);
  const d=make();const f=d.fighters[1];f.guard=0;const max=d.stats[1].armour[1];
  hitV5(d,0,'hammer',{slot:'armL',damage:2,guaranteedContact:true});assert.equal(f.meter,0);
  hitV5(d,0,'hammer',{slot:'torso',damage:max*.4,guaranteedContact:true});assert.equal(f.damageMeter,40);assert.equal(f.meter,40);
  hitV5(d,0,'hammer',{slot:'torso',damage:1,guaranteedContact:true});assert.equal(f.meter,40);
  ready(d,1);assert.equal(f.damageMeter,0);hitV5(d,0,'hammer',{slot:'torso',damage:1,guaranteedContact:true});assert.equal(f.meter,0);assert.equal(f.damageMeter,0);
  noAttacks(d);advanceFightV5(d,299);assert.equal(f.meter,0);advanceFightV5(d,300);assert(f.meter>0);assert.equal(f.special,null);
});
check('energy shield absorbs 90% from every direction through stun, with finite body cap and interrupted ending',()=>{
  const s=make('speed','tank',3),f=s.fighters[1];f.guard=0;ready(s,1);const cap=s.stats[1].armour[1]*.35;
  const hp=f.armour[1];hitV5(s,0,'rifle',{slot:'torso',damage:20,sourceX:f.x,sourceZ:f.z-1000,guaranteedContact:true});
  assert.equal(f.armour[1],hp-2);applyControlV5(s,1,'stun',0);
  const before=f.armour[1];hitV5(s,0,'rifle',{slot:'torso',damage:20,sourceX:f.x-1000,sourceZ:f.z,guaranteedContact:true});assert.equal(f.armour[1],before-2);
  for(let n=0;n<4;n++)hitV5(s,0,'rifle',{slot:'armL',damage:20,sourceX:f.x-1000,sourceZ:f.z,guaranteedContact:true});
  assert(Math.abs(s.events.reduce((n,e)=>n+(e.absorbed??0),0)-cap)<1e-5);assert.equal(f.special?.shieldLeft,0);
  noAttacks(s);advanceFightV5(s,299);assert(!s.events.some(e=>e.kind==='charge'));
});
check('slow is immediate, affects travel/turn/preparation, expires; overdrive multipliers do not persist',()=>{
  const s=make('ranged','speed',2),normal=movementV5(s,1);s.fighters[1].action={kind:'blade',started:0,windup:40,recovery:30,released:false,mount:'right'};ready(s,0);
  assert.equal(s.fighters[1].slowUntil,300);assert(Math.abs(movementV5(s,1)-normal*.7)<1e-6);stepFightV5(s);assert(s.fighters[1].action!.windup>40);
  noAttacks(s);s.fighters.forEach(f=>f.action=null);advanceFightV5(s,300);assert.equal(movementV5(s,1),normal);
  const speed=make('speed','tank'),base=movementV5(speed,0),damage=weaponDamageV5(speed,0,'blade');ready(speed,0);assert.equal(movementV5(speed,0),base*1.5);assert(Math.abs(weaponDamageV5(speed,0,'blade')-damage*1.25)<=1);
});
check('tier-three endings wait until last second, use limb dependencies and cap both SMGs together',()=>{
  const s=make('ranged','tank',3);ready(s,0);s.fighters[1].armour[2]=s.fighters[1].armour[3]=0;s.fighters[1].armour[1]=10000;
  advanceFightV5(s,239);assert(!s.events.some(e=>e.weapon==='smg'));
  s.fighters[0].armour[2]=0;advanceFightV5(s,299);
  const shots=s.events.filter(e=>e.kind==='shot'&&e.weapon==='smg');assert(shots.length>0);assert(shots.every(e=>e.mount==='right'));assert(shots.length<=4);
  const maximum=weaponDamageV5(s,0,'rifle')*2;assert(s.events.filter(e=>e.weapon==='smg').reduce((n,e)=>n+(e.damage??0),0)<=maximum);
  const t=make('tank','tank',3);ready(t,0);t.fighters[1].armour[2]=t.fighters[1].armour[3]=0;advanceFightV5(t,239);assert(!t.events.some(e=>e.kind==='charge'));advanceFightV5(t,260);assert(t.events.some(e=>e.kind==='charge'&&e.frame===240));
  const broken=make('speed','tank',3);ready(broken,0);broken.fighters[0].armour[4]=0;noAttacks(broken);advanceFightV5(broken,299);assert(!broken.events.some(e=>e.kind==='flank'));
});
check('control immunity, range, separate arms and missing legs change actual actions',()=>{
  const s=make();assert(applyControlV5(s,1,'stun',0));assert.equal(s.fighters[1].stunnedUntil,24);assert.equal(s.fighters[1].immuneUntil,144);s.frame=24;assert(!applyControlV5(s,1,'knockdown',0));s.frame=144;assert(applyControlV5(s,1,'knockdown',0));assert.equal(s.fighters[1].downUntil,216);assert.equal(s.fighters[1].immuneUntil,336);
  const noGun=make('ranged','tank');noGun.fighters[0].armour[3]=0;advanceFightV5(noGun,500);assert(!noGun.events.some(e=>e.who===0&&e.kind==='shot'));
  const far=make();far.fighters[0].action={kind:'hammer',started:-40,windup:40,recovery:43,released:false,mount:'right'};stepFightV5(far);assert(far.events.some(e=>e.who===0&&e.kind==='miss'));assert(!far.events.some(e=>e.kind==='hit'));
  const raw=presetV5('speed',2).appearanceBuild,c=cardV5('mk5.t2.speed.paired-blades')!;raw.weapon={id:c.id,s:[...c.s]};const paired=createFightV5(3,snapshotBuildV5(raw),presetV5('tank',2),{autoSpecial:[false,false]});paired.fighters[0].armour[3]=0;advanceFightV5(paired,600);assert(paired.events.some(e=>e.who===0&&e.weapon==='paired_blades'&&e.mount==='left'));assert(!paired.events.some(e=>e.who===0&&e.weapon==='paired_blades'&&e.mount==='right'));
});
check('blade ending only finishes a limb below 25% on a clean rear contact',()=>{
  function strike(rear:boolean,fraction:number,tier:1|3=3){const s=make('speed','tank',tier);ready(s,0);s.frame=250;const f=s.fighters[1];f.guard=0;f.yaw=0;f.armour[2]=s.stats[1].armour[2]*fraction;hitV5(s,0,'blade',{slot:'armL',damage:1,finisher:true,guaranteedContact:true,sourceX:f.x,sourceZ:f.z+(rear?-1000:1000)});return s;}
  assert.equal(strike(true,.24).fighters[1].armour[2],0);assert(strike(false,.24).fighters[1].armour[2]>0);assert(strike(true,.25).fighters[1].armour[2]>0);assert(strike(true,.24,1).fighters[1].armour[2]>0);
});
check('rifle clearance cancels blocked aim, permits cooldown retreat and arm-only shove, and keeps both muzzle origins outside the rival',()=>{
  function aimed(distance:number){const s=make('ranged','tank',3),f=s.fighters[0],b=s.fighters[1];f.x=f.z=0;f.yaw=0;b.x=0;b.z=distance;b.armour[2]=b.armour[3]=0;s.frame=30;f.action={kind:'rifle',started:0,windup:18,recovery:62,released:false,mount:'right'};return s;}
  const close=aimed(RIFLE_MIN_RANGE_V5-1);stepFightV5(close);assert(!close.events.some(e=>e.kind==='shot'));assert(close.events.some(e=>e.kind==='interrupt'&&e.weapon==='rifle'));assert(close.fighters[0].dashUntil>close.frame);assert(close.fighters[0].nextShove>close.frame);
  const cooldown=aimed(1300);cooldown.fighters[0].nextShove=500;stepFightV5(cooldown);assert.equal(cooldown.fighters[0].action,null);assert(cooldown.fighters[0].z<0,'a blocked aim must retreat while shove is cooling down');assert(!cooldown.events.some(e=>e.kind==='shot'||e.kind==='dodge'));
  const oneLeg=aimed(1300);oneLeg.fighters[0].armour[4]=0;stepFightV5(oneLeg);assert(oneLeg.fighters[0].nextShove>oneLeg.frame,'an intact arm can shove even after losing a leg');assert(!oneLeg.events.some(e=>e.kind==='dodge'||e.kind==='shot'));assert(oneLeg.fighters[0].dashUntil<=oneLeg.frame);
  const recovery=aimed(1300);recovery.fighters[0].action!.released=true;stepFightV5(recovery);assert.equal(recovery.fighters[0].nextAction,80,'escaping during recovery cannot reset rifle firing cadence');assert(recovery.fighters[0].dashUntil>recovery.frame);
  const clear=aimed(RIFLE_MIN_RANGE_V5);stepFightV5(clear);const shot=clear.events.find(e=>e.kind==='shot'&&e.weapon==='rifle');assert(shot?.origin);assert(Math.hypot(shot.origin[0],shot.origin[2]-RIFLE_MIN_RANGE_V5)>clear.stats[1].radius,'rifle emission starts outside the rival');
  const burst=aimed(1060);burst.fighters[0].action=null;ready(burst,0);burst.frame=275;stepFightV5(burst);const smg=burst.events.find(e=>e.kind==='shot'&&e.weapon==='smg');assert(smg?.origin);assert(Math.hypot(smg.origin[0],smg.origin[2])<460,'compact pistols use their shorter origin');assert(Math.hypot(smg.origin[0],smg.origin[2]-1060)>burst.stats[1].radius);
  const stalled=runFightV5(53,presetV5('tank',3),presetV5('ranged',3),{autoSpecial:[true,true]});assert(stalled.frame<MAX_FRAMES_V5,'one-legged gunner must not loop forever between blocked aims');
});
check('actual movement stays finite and bounded at every tick, with no teleporting charge or flank',()=>{
  let frames=0,maxStep=0;for(const a of STYLES_V5)for(const b of STYLES_V5)for(let seed=75;seed<78;seed++){const s=createFightV5(seed,presetV5(a,4),presetV5(b,4),{autoSpecial:[true,true]});while(!s.done){const before=s.fighters.map(f=>[f.x,f.z]);stepFightV5(s);s.fighters.forEach((f,i)=>{assert(Number.isInteger(f.x)&&Number.isInteger(f.z));assert(Math.hypot(f.x,f.z)<5002);const step=Math.hypot(f.x-before[i][0],f.z-before[i][1]);assert(step<280,`${a}/${b} frame${s.frame} jumped ${step}`);maxStep=Math.max(maxStep,step);});frames++;}}console.log(`${frames} trajectory ticks; largest step ${maxStep.toFixed(2)} sim units`);
});
check('manual command retries are idempotent and saved input replays survive JSON round-trip',()=>{
  const s=make('tank','tank',3);advanceFightV5(s,1000);while(s.fighters[0].meter<100&&!s.done)stepFightV5(s);assert(!s.done);const command={id:'button-1',who:0 as const,kind:'special' as const,frame:s.frame};assert(acceptSpecialV5(s,command).accepted);const hash=hashV5(s);assert(acceptSpecialV5(s,command).accepted);assert.equal(hashV5(s),hash);assert(!acceptSpecialV5(s,{...command,who:1}).accepted);assert(!acceptSpecialV5(s,{...command,id:'wrong-tick',frame:s.frame+1}).accepted);
  advanceFightV5(s,MAX_FRAMES_V5);const result=resultV5(s);assert.equal(hashV5(replayV5(copy(result))),hashV5(s));
  const a=make('speed','ranged',2),b=copy(a);advanceFightV5(a,MAX_FRAMES_V5);while(!b.done)advanceFightV5(b,Math.min(MAX_FRAMES_V5,b.frame+17));assert.equal(hashV5(a),hashV5(b));
});
check('all styles/tier matchups are bounded and reproduce; mixed limbs, T3 body splash and paint do not invent classes',()=>{
  let fights=0;for(const tier of [1,2,3,4] as const)for(const a of STYLES_V5)for(const b of STYLES_V5)for(let seed=1;seed<=8;seed++){const one=runFightV5(seed,presetV5(a,tier),presetV5(b,tier),{autoSpecial:[true,true]});const two=runFightV5(seed,presetV5(a,tier),presetV5(b,tier),{autoSpecial:[true,true]});assert.equal(hashV5(one),hashV5(two));assert(one.done&&one.frame<=5400);assert(one.events.some(e=>e.kind==='hit'||e.kind==='block'));for(const f of one.fighters){assert(Number.isInteger(f.x)&&Number.isInteger(f.z));assert(Math.hypot(f.x,f.z)<5002);assert(f.armour.every(n=>Number.isFinite(n)&&n>=0));assert(f.meter>=0&&f.meter<=100);}fights++;}
  for(let seed=1;seed<=64;seed++){const raw=copy(presetV5(STYLES_V5[seed%3],1).appearanceBuild);const torso=cardV5(`mk5.t3.${STYLES_V5[seed%3]}.torso`)!;raw.torso={id:torso.id,s:[...torso.s]};for(const [i,slot]of Array.from(['armL','armR','legL','legR'].entries())){const c=cardV5(`mk5.t${1+(seed+i)%4}.${STYLES_V5[(seed+i)%3]}.${slot.startsWith('arm')?'arms':'legs'}`)!;raw.limbs![slot as 'armL']={id:c.id,s:[...c.s]};}const b=snapshotBuildV5(raw),s=runFightV5(seed,b,presetV5(STYLES_V5[(seed+1)%3],2),{autoSpecial:[true,true]});assert(s.done&&s.frame<=5400);assert(b.capabilities.tier3);fights++;}
  const plain=presetV5('tank'),paint=copy(plain.appearanceBuild);paint.torso.paint='coral';const coloured=snapshotBuildV5(paint);assert.deepEqual(plain.stats,coloured.stats);assert.deepEqual(runFightV5(7,plain,presetV5('speed')).events,runFightV5(7,coloured,presetV5('speed')).events);console.log(`${fights} mixed/repeated simulation fixtures`);
});
check('all 200 legacy baseline hashes remain frozen',()=>{
  const hex=(n:number)=>(n>>>0).toString(16).padStart(8,'0'),roll=(rows:string[])=>hex(fnv1a(rows.join(','))),all:string[]=[];
  const expected=['fa0df511','98c10093','e750eafb','9e5392ed'];
  for(const [i,build] of Array.from([CANON_T1,CANON_T2,CANON_T3,CANON_T4].entries())){const hashes:string[]=[];for(let seed=0;seed<50;seed++){const s=legacyFight(fnv1a(`bots-baseline-${seed}`),build,build);hashes.push(hex(fightHash(s.st)));}assert.equal(roll(hashes),expected[i]);all.push(...hashes);}assert.equal(roll(all),'9fd36ca7');
});
console.log(`${checks} v5 groups passed.`);
