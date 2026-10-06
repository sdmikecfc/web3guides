// Controlled equipment changes, measured through actual movement and contacts.
// Offline only: no wallet, network, save or economy changes.
require('./personal-native-path.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {arcadeBuild,loaner}=require('../../src/lib/bots/arcade/equipment.ts');
const {ArcadeEngine,replay}=require('../../src/lib/bots/arcade/engine.ts');
const {preset,aggregateEquipment,ENTRY_MAP}=require('../../src/lib/bots/workshop8/catalogue.ts');
const {newRun,opponent}=require('../../src/lib/bots/arcade/ladder.ts');
const base=preset('tank'),starter=arcadeBuild(base,'My starter');
const press=(engine,action)=>{engine.input(0,action,true);engine.input(0,action,false);};
function contact(attacker,defender=loaner('tank'),action='heavy'){
 const engine=new ArcadeEngine([attacker,defender],75,{training:true,dummy:'idle'});
 press(engine,'skip');engine.fighters[0].x=500;engine.fighters[1].x=651;
 press(engine,action);
 for(let i=0;i<90;i++){
  engine.step();const hit=engine.events.find(event=>event.kind==='hit');
  if(hit)return {engine,hit,healthLost:(defender.health-engine.fighters[1].hp)/defender.health};
 }
 throw Error('Expected controlled contact');
}
function distance(build){
 const engine=new ArcadeEngine([build,loaner('tank')],75,{training:true,dummy:'idle'});
 press(engine,'skip');engine.fighters[0].x=200;engine.fighters[1].x=1000;engine.input(0,'right',true);
 for(let i=0;i<30;i++)engine.step();
 return engine.fighters[0].x-200;
}
const baseline=contact(starter);
for(const slot of ['legL','legR']){
 const build=arcadeBuild({...base,[slot]:preset('speed')[slot]},'Faster leg');
 assert.equal(build.gp,starter.gp,'Same-GP parts must still change movement');
 assert(distance(build)>distance(starter),`${slot} must increase actual distance`);
 assert.equal(build.damage,starter.damage,'A leg must not become a weapon upgrade');
}
for(const slot of ['armL','armR']){
 const build=arcadeBuild({...base,[slot]:preset('speed')[slot]},'Faster arm');
 const result=contact(build);
 assert(result.hit.tick<baseline.hit.tick,`${slot} must shorten real attack startup`);
 assert(result.hit.damage<baseline.hit.damage,'Faster/lighter arm retains its power tradeoff');
}
const upgradedWeapon=arcadeBuild({...base,weapon:preset('tank',2).weapon},'Upgraded weapon');
assert(contact(upgradedWeapon).hit.damage>baseline.hit.damage,'Installed weapon must change actual damage');
assert.equal(upgradedWeapon.health,starter.health,'Weapon upgrade cannot grant armour health');
const armoured=arcadeBuild({...base,torso:preset('tank',2).torso},'Armoured body');
assert(contact(starter,armoured).healthLost<contact(starter,starter).healthLost,'Durability/plating must reduce the health fraction lost to an identical hit');
assert.equal(armoured.damage,starter.damage,'Body upgrade cannot replace the weapon power');
// A mixed build near a tier threshold must retain each part contribution, not
// become an all-T1 or all-T2 preset just because its appearance has a tier.
const mixedChoices={...base,weapon:preset('tank',2).weapon,legR:preset('speed',2).legR};
const mixed=arcadeBuild(mixedChoices,'Mixed equipment');
assert.equal(mixed.gp,aggregateEquipment(mixedChoices,ENTRY_MAP).gp);
assert.equal(mixed.gp,130);assert.equal(mixed.tier,1);
assert.notDeepEqual(mixed,loaner('tank',1));assert.notEqual(mixed.health,loaner('tank',2).health);
const run=newRun(mixed,1,75,'owned-mixed','robot-one');
const fight=new ArcadeEngine([run.build,opponent(run)],75);
assert.deepEqual(fight.fighters[0].build,mixed,'Ladder must preserve the exact equipped build');
for(const difficulty of ['easy','normal','hard'])assert.deepEqual(new ArcadeEngine([mixed,starter],75,{difficulty}).fighters[0].build,mixed);
// Recorded equipment values remain pinned even if the source choices upgrade.
const recorded=new ArcadeEngine([mixed,starter],75,{training:true,dummy:'idle'});
press(recorded,'skip');recorded.input(0,'right',true);
for(let i=0;i<45;i++)recorded.step();recorded.input(0,'right',false);press(recorded,'heavy');
for(let i=0;i<60;i++)recorded.step();assert(recorded.events.some(event=>event.kind==='hit'));
const packet=recorded.packet();mixedChoices.weapon=preset('tank',4).weapon;
assert.equal(replay(packet,recorded.tick).digest(),recorded.digest());
console.log('PASS arcade equipment: real contact damage, both arm timings, both leg movement, durability/plating survivability, mixed builds without tier replacement, ladder transfer, equal difficulty stats, pinned replay.');
console.log(JSON.stringify({starter:{gp:starter.gp,health:starter.health,heavyDamage:baseline.hit.damage,contactTick:baseline.hit.tick,walk30Frames:distance(starter)},mixed:{gp:mixed.gp,health:mixed.health,heavyDamage:contact(mixed).hit.damage,walk30Frames:distance(mixed)}}));
