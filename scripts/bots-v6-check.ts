import assert from 'node:assert/strict';
import {V6_CATALOG,FAMILIES_V6,GP_TIERS_V6,BUILD_PRICES_V6,SOCKETS_V6,cardV6,posedProxiesV6,presetV6,snapshotBuildV6,validBuildV6,statsV6,gpV6,cloneV6,hashV6,createFightV6,advanceFightV6,stepFightV6,acceptSpecialV6,resultV6,replayV6,runFightV6,applyControlV6,resolveImpactV6,movementV6,sweepBoxV6,sweepCapsuleV6,sweepRobotV6,actionPhaseV6,actionPathPhaseV6,muzzleV6,MAX_FRAMES_V6,footprintSupportV6,rotateY,normalize,scale,BODY_SOCKETS_V6,WEAPON_KINDS_V6,type SideV6,type StyleV6,type StateV6,type SweepContactV6,type Vec3} from '../src/lib/bots/v6';

let groups=0;
function check(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
const pair=(a:StyleV6='tank',b:StyleV6='speed',tier:1|2|3|4=3)=>createFightV6(391,presetV6(a,tier),presetV6(b,tier),{autoSpecial:[false,false]});
function contact(slot:typeof BODY_SOCKETS_V6[number]='torso'):SweepContactV6{return {t:.5,slot,point:[0,1500,0],normal:[0,0,1000],localPoint:[0,500,1000],localNormal:[0,0,1000]};}
function impact(s:StateV6,damage:number,options:Partial<Parameters<typeof resolveImpactV6>[1]>={}){return resolveImpactV6(s,{who:0,weapon:'ap_rifle',mount:'right',attackId:100,contact:contact(),damage,...options});}
function ready(s:StateV6,who:SideV6=0,id='manual'){s.fighters[who].meter=100;assert.equal(acceptSpecialV6(s,{id,kind:'special',who,frame:s.frame}).accepted,true);}

check('135 canonical cards, independent sockets, fixed GP/price budgets and signature restrictions',()=>{
  assert.equal(V6_CATALOG.length,135);assert.equal(new Set(V6_CATALOG.map(c=>c.id)).size,135);
  for(const tier of [1,2,3,4] as const)for(const family of FAMILIES_V6){const b=presetV6(family.style,tier,{family:family.id});assert.equal(b.gp,GP_TIERS_V6[tier-1]);assert.equal(SOCKETS_V6.reduce((n,s)=>n+b.parts[s].price,0),BUILD_PRICES_V6[tier-1]);assert(validBuildV6(b));}
  const base=presetV6('tank',3),mixed=cloneV6(base.appearanceBuild),part=presetV6('speed',1).appearanceBuild.limbs!.legL;mixed.limbs!.legL=part;const built=snapshotBuildV6(mixed);assert.equal(built.style,'tank');assert.equal(built.parts.legL.id,part.id);assert.equal(built.parts.legR.id,base.parts.legR.id);assert.equal(statsV6(mixed).gp,built.gp);assert.equal(gpV6(mixed),built.gp);
  const bad=cloneV6(base.appearanceBuild);bad.weapon=presetV6('speed',3,{signature:true}).appearanceBuild.weapon;assert.throws(()=>snapshotBuildV6(bad),/signature kit/);bad.weapon=base.appearanceBuild.weapon;bad.torso=presetV6('tank',1).appearanceBuild.torso;bad.weapon=presetV6('tank',3,{signature:true}).appearanceBuild.weapon;assert.throws(()=>snapshotBuildV6(bad),/signature kit/);
  const forged=cloneV6(base);forged.parts.torso.s[0]++;assert(!validBuildV6(forged));const forgedRaw=cloneV6(base.appearanceBuild);forgedRaw.head.s[0]++;assert.throws(()=>snapshotBuildV6(forgedRaw));const collision=cloneV6(base);collision.collision.weapon.muzzle[2]++;assert(!validBuildV6(collision));assert.equal(statsV6({} as never).gp,0);
});

check('swept boxes/capsules hit through a long tick; misses remain misses; targets move',()=>{
  const box=sweepBoxV6([0,0,-5000],[0,0,5000],[0,0,0],[100,100,100],10);assert(box&&box.t>.48&&box.t<.5);assert.equal(box.point[2],-100);assert.equal(sweepBoxV6([111,0,-5000],[111,0,5000],[0,0,0],[100,100,100],10),null);
  const capsule=sweepCapsuleV6([0,0,-5000],[0,0,5000],[0,-100,0],[0,100,0],100,10);assert(capsule&&capsule.t>.48&&capsule.t<.5);assert.equal(sweepCapsuleV6([111,0,-5000],[111,0,5000],[0,-100,0],[0,100,0],100,10),null);
  const b=presetV6('tank',3),hit=sweepRobotV6([-3000,1500,0],[3000,1500,0],{x:1000,z:0,yaw:0},{x:0,z:0,yaw:0},b.collision.proxies,b.stats.armour,20);assert(hit);assert(hit.localPoint.every(Number.isFinite));assert.equal(hit.localPoint[1]>=0&&hit.localPoint[1]<=1000,true);
});

check('a geometric hit has no post-contact random miss; AP only bypasses physical plating',()=>{
  const normal=pair(),ap=cloneV6(normal),before=normal.random;normal.stats[1].plating[1]=.35;ap.stats[1].plating[1]=.35;
  assert.equal(impact(normal,100),65);assert.equal(impact(ap,100,{platingBypass:.5}),82.5);assert.equal(normal.random,before);
  const shield=pair('speed','tank');shield.stats[1].plating[1]=.35;ready(shield,1);assert.equal(impact(shield,100,{platingBypass:.5}),8.25);assert.equal(shield.events.at(-1)!.absorbed,90);
  const rawCap=shield.stats[1].armour[1]*.35;assert.equal(shield.fighters[1].special!.shieldLeft,rawCap-90);const guard=pair();guard.fighters[1].guardPose=1;guard.fighters[1].x=0;guard.fighters[1].z=0;guard.fighters[1].yaw=0;guard.stats[1].plating[2]=0;const amount=impact(guard,20,{contact:contact('armL'),source:[0,0,1000]});assert.equal(amount,10);assert.equal(impact(guard,20,{contact:contact('armL'),source:[0,0,-1000]}),20);
});

check('24/72 tick control, 120 tick protection, normal damage and interruption',()=>{
  const s=pair();assert(applyControlV6(s,1,'stun',0));assert.equal(s.fighters[1].stunnedUntil,24);assert.equal(s.fighters[1].immuneUntil,144);assert(!applyControlV6(s,1,'knockdown',0));assert(impact(s,10)>0);s.frame=144;assert(applyControlV6(s,1,'knockdown',0));assert.equal(s.fighters[1].downUntil,216);assert.equal(s.fighters[1].immuneUntil,336);s.frame=215;assert(!applyControlV6(s,1,'stun',0));
  const shock=pair();for(let i=0;i<3;i++){shock.frame=i*30;impact(shock,1,{weapon:'shock_blade',shock:36});}assert.equal(shock.fighters[1].stunnedUntil,84);assert.equal(shock.fighters[1].shock,0);
});

check('five-second specials, per-charge damage meter, slow starts immediately and changes pending attacks',()=>{
  const s=pair('tank','tank');impact(s,s.stats[1].armour[1]*.8,{platingBypass:1});assert.equal(s.fighters[1].damageMeter,40);assert.equal(s.fighters[1].meter,40);ready(s,1);assert.equal(s.fighters[1].damageMeter,0);assert.equal(s.fighters[1].special!.until,300);impact(s,10);assert.equal(s.fighters[1].meter,0);s.fighters.forEach(f=>{f.nextAction=10000;});s.frame=299;stepFightV6(s);assert.equal(s.fighters[1].special,null);assert(s.fighters[1].meter>0);
  const slow=pair('ranged','tank');slow.fighters[0].x=-1000;slow.fighters[1].x=1000;advanceFightV6(slow,24);const base=movementV6(slow,1),a=slow.fighters[1].action;assert(a);const end=a.started+a.windup+a.active+a.recovery;ready(slow,0);assert.equal(movementV6(slow,1),base*.7);stepFightV6(slow);assert(slow.fighters[1].action!.started+slow.fighters[1].action!.windup+slow.fighters[1].action!.active+slow.fighters[1].action!.recovery>end);
});

check('rear flank only finishes a pre-damaged limb; front or healthy contacts cannot execute',()=>{
  const rear=pair('speed','tank');ready(rear,0);rear.frame=250;rear.fighters[1].x=0;rear.fighters[1].z=0;rear.fighters[1].yaw=0;rear.fighters[1].armour[2]=rear.stats[1].armour[2]*.2;
  const front=cloneV6(rear),healthy=cloneV6(rear);healthy.fighters[1].armour[2]=healthy.stats[1].armour[2]*.3;
  impact(rear,1,{contact:contact('armL'),weapon:'special_flank',finisher:true,source:[0,0,-1000]});assert.equal(rear.fighters[1].armour[2],0);assert.deepEqual(rear.events.filter(e=>e.kind==='break').map(e=>[e.who,e.target]),[[1,1]]);impact(front,1,{contact:contact('armL'),weapon:'special_flank',finisher:true,source:[0,0,1000]});assert(front.fighters[1].armour[2]>0);impact(healthy,1,{contact:contact('armL'),weapon:'special_flank',finisher:true,source:[0,0,-1000]});assert(healthy.fighters[1].armour[2]>0);
});

check('lost weapon arm stops rifle use; paired blades retain the surviving arm; lost legs stop escapes',()=>{
  const rifle=pair('ranged','tank');rifle.fighters[0].armour[3]=0;advanceFightV6(rifle,900);assert(!rifle.events.some(e=>e.who===0&&e.weapon==='ap_rifle'&&e.kind==='shot'));
  const paired=createFightV6(99,presetV6('speed',3,{weapon:'paired_blades'}),presetV6('tank',3),{autoSpecial:[false,false]});paired.fighters[0].armour[3]=0;advanceFightV6(paired,700);assert(paired.events.some(e=>e.who===0&&e.weapon==='paired_blades'&&e.mount==='left'&&e.kind==='hit'));assert(!paired.events.some(e=>e.who===0&&e.weapon==='paired_blades'&&e.mount==='right'));
  const feet=pair('ranged','tank');feet.fighters[0].armour[4]=0;advanceFightV6(feet,700);assert(!feet.events.some(e=>e.who===0&&e.kind==='dodge'));assert(feet.fighters[0].dashUntil<=feet.frame,"An interrupted timer is not an active escape");
});

check('burn refreshes one effect; flame heats and shotgun pellets have individual swept rays',()=>{
  const s=pair();impact(s,1,{weapon:'flame_sword',burn:2});s.frame=30;impact(s,1,{weapon:'flame_sword',burn:2});assert.equal(s.fighters[1].burn!.damage,2);assert.equal(s.fighters[1].burn!.until,180);assert.equal(s.fighters[1].burn!.nextTick,30);
  for(const [kind,count] of [['shotgun_tight',5],['shotgun_wide',7]] as const){const r=runFightV6(78,presetV6('ranged',3,{weapon:kind}),presetV6('tank',3),{autoSpecial:[false,false]});const shot=r.events.find(e=>e.kind==='shot'&&e.who===0)!;assert(shot);assert.equal(r.events.filter(e=>e.kind==='shot'&&e.attackId===shot.attackId).length,count);assert(new Set(r.events.filter(e=>e.kind==='shot'&&e.attackId===shot.attackId).map(e=>JSON.stringify(e.direction))).size>1);}
  const flame=createFightV6(8,presetV6('ranged',3,{weapon:'flamethrower'}),presetV6('tank',3),{autoSpecial:[false,false]});advanceFightV6(flame,700);assert(flame.events.some(e=>e.kind==='flame'));assert(flame.events.some(e=>e.kind==='burn'));assert(flame.fighters[0].heat>0);
});

check('commands are idempotent, cannot be backdated, and JSON reconnect/replay reproduces events',()=>{
  const s=pair('tank','tank');while(!s.done&&(s.fighters[0].meter<100||s.fighters[0].stunnedUntil>s.frame||s.fighters[0].downUntil>s.frame))stepFightV6(s);const command={id:'same-input',kind:'special' as const,who:0 as const,frame:s.frame};assert(acceptSpecialV6(s,command).accepted);assert(acceptSpecialV6(s,command).accepted);assert.equal(s.commands.length,1);assert(!acceptSpecialV6(s,{...command,frame:s.frame-1}).accepted);const reconnected=cloneV6(s);advanceFightV6(s,MAX_FRAMES_V6);advanceFightV6(reconnected,MAX_FRAMES_V6);assert.equal(resultV6(s).hash,resultV6(reconnected).hash);assert.equal(replayV6(resultV6(s)).hash,resultV6(s).hash);assert.throws(()=>advanceFightV6(s,s.frame-1));assert.throws(()=>advanceFightV6(s,MAX_FRAMES_V6+1));
});

check('all ten weapons complete, fixed steps remain bounded, projectile origins stay outside enemies',()=>{
  let ticks=0,shots=0;for(const weapon of WEAPON_KINDS_V6){const s=createFightV6(821,presetV6('ranged',3,{weapon}),presetV6('tank',3),{autoSpecial:[true,true]});while(!s.done){const at=s.events.length,previous=s.fighters.map(f=>[f.x,f.z]);stepFightV6(s);ticks++;assert.equal(new Set(s.projectiles.map(p=>p.id)).size,s.projectiles.length);for(let who=0;who<2;who++){const f=s.fighters[who];assert(Number.isInteger(f.x)&&Number.isInteger(f.z)&&Number.isInteger(f.yaw));assert(Math.hypot(f.x,f.z)<=f.arenaLimit+1);assert(Math.hypot(f.x-previous[who][0],f.z-previous[who][1])<650);assert(f.armour.every(n=>n>=0&&Number.isFinite(n)));if(f.action){const phase=actionPathPhaseV6(f.action,s.frame);assert(phase>=0&&phase<=1);assert(['preparation','contact','recovery','done'].includes(actionPhaseV6(f.action,s.frame)));}}
    for(const event of s.events.slice(at)){if(event.kind==='shot'&&event.origin){shots++;const target=s.fighters[event.target];assert.equal(sweepRobotV6(event.origin,event.origin,{x:target.x,z:target.z,yaw:target.yaw},{x:target.x,z:target.z,yaw:target.yaw},posedProxiesV6(s,event.target),target.armour,0),null);}if(event.point){assert(event.point[0]>=-1000&&event.point[0]<=1000&&event.point[1]>=0&&event.point[1]<=1000&&event.point[2]>=-1000&&event.point[2]<=1000);}}
  }assert(s.frame<MAX_FRAMES_V6,`${weapon} timed out`);assert(s.events.some(e=>e.who===0&&(e.kind==='hit'||e.kind==='block')));}
  console.log(JSON.stringify({boundedTicks:ticks,physicalShotOrigins:shots}));
});
check('coincident centres separate deterministically and stay inside the ring',()=>{
  for(const at of [0,5400]){const a=pair('tank','tank'),b=cloneV6(a);for(const s of [a,b]){s.fighters.forEach(f=>{f.x=at;f.z=0;f.nextAction=99999;});for(let i=0;i<10;i++)stepFightV6(s);}assert.equal(hashV6(a),hashV6(b));const direction=normalize([a.fighters[1].x-a.fighters[0].x,0,a.fighters[1].z-a.fighters[0].z]),minimum=footprintSupportV6(posedProxiesV6(a,0).filter(p=>p.slot!=="armL"&&p.slot!=="armR"),a.fighters[0].armour,rotateY(direction,-a.fighters[0].yaw))+footprintSupportV6(posedProxiesV6(a,1).filter(p=>p.slot!=="armL"&&p.slot!=="armR"),a.fighters[1].armour,rotateY(scale(direction,-1),-a.fighters[1].yaw));assert(Math.hypot(a.fighters[0].x-a.fighters[1].x,a.fighters[0].z-a.fighters[1].z)>minimum-2);assert(a.fighters.every(f=>Math.hypot(f.x,f.z)<=f.arenaLimit+1));}
});
console.log(JSON.stringify({ok:true,groups}));
