/* Deterministic AI regressions and a bounded policy comparison, not a fun test. */
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {ArcadeEngine,replay,ready}=require('../../src/lib/bots/arcade/engine.ts');
const {loaner}=require('../../src/lib/bots/arcade/equipment.ts'),{moveFor}=require('../../src/lib/bots/arcade/moves.ts');
const {AI_VERSION}=require('../../src/lib/bots/arcade/types.ts'),{newRun,ladderDifficulty,readRun}=require('../../src/lib/bots/arcade/ladder.ts');
const {readArcadeSave,freshArcadeSave}=require('../../src/lib/bots/arcade/save.ts');
const styles=['tank','speed','ranged'],difficulties=['easy','normal','hard'];
const tap=(e,action)=>{e.input(0,action);e.input(0,action,false);};
const hold=(e,actions)=>{for(const action of ['left','right','down','guard'])if(!!e.fighters[0].held[action]!==actions.includes(action))e.input(0,action,actions.includes(action));};
const step=(e,n)=>{while(n-->0)e.step();};
const legacyHashes=[
 'ec707020e2a0db337a90204a6e1b9394e9652e3306891a937f5e91382eacee4b','a3f869b3c5140c52bd45ebb2fc3ffa8a8cf0758ee0264d15bde94263d4b423d7','a1b0f36625ae1818c5be5ab486771c4d889756b6f4a9892cd1e10f85c1c91b16',
 '3d49792e02adde48eb9444cf0b978e76c2d7977b07f4354314da344af9f88860','56e1eedc3db0d4a6aba76669b02baeba5c3b5b281c9794d0e1389085987a9e50','9724618d6d58d7d2848f1b22663e4bb71d3c2029e24a14e984c74fba882a362b',
 '306bf43c3f086782668b88d4822eef5919e47762a761d365b83b06cf26a17c3d','3b184ff1b779a551284f70adaffc4b73f399d82d58f50dc34c7b1c7640ff17f7','e5e32eead39d12b76d23f2073d25e8593dbcad84e177f5108e54e34f929e2b44'];
let index=0;
for(const difficulty of difficulties)for(const style of styles){
 const e=new ArcadeEngine([loaner(style),loaner('speed')],75,{difficulty,aiVersion:'mk11-ai-1'});tap(e,'skip');
 for(let t=0;t<1800;t++){if(t%90===0)e.input(0,'right');if(t%90===22)e.input(0,'right',false);if(t%17===0)tap(e,t%51===0?'heavy':'light');e.step();}
 assert.equal(crypto.createHash('sha256').update(e.digest()).digest('hex'),legacyHashes[index++]);
 const old=e.packet();delete old.settings.aiVersion;assert.equal(replay(old,e.tick).digest(),e.digest());
}
console.log('PASS nine pre-change golden outcomes and unversioned replay dispatch');
for(const tier of [1,2,3,4]){
 const run=newRun(loaner('tank',tier),tier,75,'test');
 assert.deepEqual(Array.from({length:6},(_,stage)=>ladderDifficulty({...run,stage})),tier===1?['easy','normal','normal','normal','hard','hard']:['normal','normal','normal','normal','hard','hard']);
 delete run.aiVersion;assert.deepEqual(Array.from({length:6},(_,stage)=>ladderDifficulty({...run,stage})),tier===1?['easy','easy','easy','easy','normal','hard']:['normal','normal','normal','normal','normal','hard']);
 assert(readRun(run));assert.equal(readRun({...run,aiVersion:'unknown'}),null);
}
console.log('PASS new ladder escalation and preserved old-run difficulty');
// Neither pending player commands nor current opponent held buttons may influence
// an AI decision before its observation delay. Every difficulty gets this check.
for(const difficulty of difficulties){
 const a=new ArcadeEngine([loaner('tank'),loaner('speed')],41,{difficulty}),b=new ArcadeEngine([loaner('tank'),loaner('speed')],41,{difficulty});
 tap(a,'skip');tap(b,'skip');a.fighters[0].x=b.fighters[0].x=500;a.fighters[1].x=b.fighters[1].x=760;
 step(a,50);step(b,50);a.fighters[1].aiNext=b.fighters[1].aiNext=a.tick+1;
 tap(a,'light');b.input(0,'guard');a.step();b.step();
 assert.deepEqual(a.fighters[1],b.fighters[1]);assert.equal(a.randomState,b.randomState);
}
console.log('PASS new input remains invisible to delayed AI observations');

function play(policy,style,rival,difficulty,seed,aiVersion=AI_VERSION){
 const e=new ArcadeEngine([loaner(style),loaner(rival)],seed,{difficulty,aiVersion}),history=[];
 tap(e,'skip');let next=0,guardUntil=0,lastThreat=0,guardLow=false;
 for(let t=0;t<24000&&e.phase!=='result';t++){
  const p=e.fighters[0],r=e.fighters[1];
  history.push({x:r.x,y:r.y,move:r.move,frame:r.frame,actionId:r.actionId,guard:!!r.held.guard,down:!!r.held.down,knockedDown:r.down>0,stun:r.stun});if(history.length>30)history.shift();
  if(e.phase==='intro')tap(e,'skip');
  if(e.phase==='fight'&&e.tick>=next){
   next=e.tick+(policy==='spam'?6:5);
   const seen=history[Math.max(0,history.length-9)],distance=Math.abs(seen.x-p.x),forward=seen.x>p.x?'right':'left',back=seen.x>p.x?'left':'right';
   if(policy==='spam'){
    hold(e,distance>150?[forward]:[]);tap(e,'light');
   }else{
    hold(e,[]);
    if(p.energy>=3000&&p.stun>0&&p.combo>=3)tap(e,'escape');
    if(p.move&&p.contact){
     if(p.move==='jab')tap(e,'light');else if(['cross','low','step'].includes(p.move))tap(e,'heavy');
     else if(p.move==='launcher')tap(e,'light');else if(p.move==='airLight')tap(e,'heavy');
     else if(['heavy','special'].includes(p.move)&&p.energy>=2000)tap(e,'super');
     else if(moveFor(p.move,p.build).cancels.includes('special'))tap(e,'special');
    }else if(ready(p)){
     const move=seen.move&&moveFor(seen.move,r.build);
     if(seen.knockedDown){if(distance<185)hold(e,[back]);}
     else if(p.y){if(distance<220)tap(e,p.vy<0?'heavy':'light');}
     else if(e.tick<guardUntil)hold(e,guardLow?['guard','down']:['guard']);
     else if(move&&seen.frame<move.startup+move.active&&distance<move.target.x+move.radius+80&&seen.actionId!==lastThreat){
      lastThreat=seen.actionId;guardLow=move.level==='low'||move.level==='high';guardUntil=e.tick+Math.max(8,move.startup+move.active-seen.frame-8+8);hold(e,guardLow?['guard','down']:['guard']);
     }else if(seen.y>60&&distance<190){hold(e,['down']);tap(e,'heavy');}
     else if(seen.guard&&distance<195){if(distance<140)tap(e,'throw');else if(seen.down){hold(e,[forward]);tap(e,'heavy');}else{hold(e,['down']);tap(e,'light');}}
     else if(style==='ranged'&&distance>280&&p.heat<70&&!p.vent){tap(e,p.energy>=2000?'super':'special');}
     else if(distance>185)hold(e,[forward]);
     else if(p.energy>=2000)tap(e,'super');
     else if(move&&seen.frame>=move.startup+move.active){hold(e,['down']);tap(e,'light');}
     else tap(e,'light');
    }
   }
  }
  e.step();
 }
 const dealt=e.events.filter(x=>x.kind==='hit'&&x.side===0).reduce((s,x)=>s+x.damage,0)/e.fighters[1].build.health;
 const received=e.events.filter(x=>x.kind==='hit'&&x.side===1).reduce((s,x)=>s+x.damage,0)/e.fighters[0].build.health;
 return {winner:e.winner,finished:e.phase==='result',dealt,received,engine:e};
}
const sample=play('deliberate','speed','ranged','normal',75).engine;
assert.equal(replay(sample.packet(),sample.tick).digest(),sample.digest());
for(const rate of [30,60,120]){
 const packet=sample.packet(),e=new ArcadeEngine(packet.builds,packet.seed,packet.settings);let at=0,acc=0;
 while(e.tick<sample.tick){acc+=60/rate;while(acc>=1&&e.tick<sample.tick){while(at<packet.commands.length&&packet.commands[at].tick===e.tick){const c=packet.commands[at++];e.input(c.side,c.action,c.down);}e.step();acc--;}}
 assert.equal(e.digest(),sample.digest());
}
const run=newRun(loaner('speed'),1,75,'saved'),save={...freshArcadeSave('g'),active:1,runs:{1:run},checkpoint:{runId:run.id,stage:0,lives:3,tick:sample.tick,commands:sample.commands,rules:sample.packet().rules,art:sample.packet().art,aiVersion:AI_VERSION}};
assert.equal(readArcadeSave(JSON.stringify(save),'g').checkpoint.aiVersion,AI_VERSION);
const mismatched=structuredClone(save);delete mismatched.checkpoint.aiVersion;
assert.equal(readArcadeSave(JSON.stringify(mismatched),'g').checkpoint,null);
assert(readArcadeSave(JSON.stringify(mismatched),'g').runs[1]);
delete mismatched.runs[1].aiVersion;assert(readArcadeSave(JSON.stringify(mismatched),'g').checkpoint);
console.log('PASS new AI replay at 30/60/120 Hz and versioned checkpoint persistence');

const idleAfterSpam=new ArcadeEngine([loaner('tank'),loaner('tank')],75,{difficulty:'hard',training:true});tap(idleAfterSpam,'skip');
for(let t=0;t<500;t++){hold(idleAfterSpam,Math.abs(idleAfterSpam.fighters[0].x-idleAfterSpam.fighters[1].x)>150?['right']:[]);if(t%6===0)tap(idleAfterSpam,'light');idleAfterSpam.step();}
hold(idleAfterSpam,[]);const previousAction=idleAfterSpam.fighters[1].actionId;step(idleAfterSpam,240);
assert(idleAfterSpam.fighters[1].actionId>previousAction,'An old high-attack pattern must not leave AI guarding forever');
console.log('PASS defensive pattern expires when the opponent stops repeating it');

if(process.argv.includes('--metrics')){
 const rows=[];
 for(const aiVersion of process.argv.includes('--baseline')?['mk11-ai-1',AI_VERSION]:[AI_VERSION])for(const difficulty of difficulties)for(const policy of ['spam','deliberate'])for(const style of styles){
  let wins=0,finished=0,dealt=0,received=0,matches=0;
  for(const rival of styles)for(const seed of [7,75,199]){const r=play(policy,style,rival,difficulty,seed,aiVersion);wins+=r.winner===0?1:0;finished+=r.finished?1:0;dealt+=r.dealt;received+=r.received;matches++;}
  rows.push({aiVersion,difficulty,policy,style,matches,wins,finished,winRate:Math.round(wins/matches*100),damageRatio:+(dealt/Math.max(.001,received)).toFixed(3)});
 }
 console.log(JSON.stringify({aiVersion:AI_VERSION,note:'Fixed policies, 3 seeds, all nine equal-tier style matchups. Not human playtesting.',rows},null,2));
}
