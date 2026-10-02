// Regression: real approved arms must connect across normal fighting spacing,
// while distance, crouches, blocks and retreats still matter.
const assert=require('node:assert/strict');
const {calibrated}=require('./probe-pit-reach.cjs');
const {PitEngine}=require('../../src/lib/bots/pit/engine.ts');
const {moves}=require('../../src/lib/bots/pit/moves.ts');
const {verifyDrills}=require('../../src/lib/bots/pit/drills.ts');
const tick=(e,n)=>{for(let i=0;i<n;i++)e.step()};
const press=(e,action)=>{e.input(0,action);e.input(0,action,false)};
(async()=>{
 const specs=await calibrated();let cases=0;
 for(const a of specs)for(const b of specs)for(const facing of [1,-1])for(const id of ['light','heavy'])for(const gap of [1100,1500,2000,2500]){
  const e=new PitEngine([a,b],{training:true,dummy:'idle'});e.phase='fight';e.actors[0].x=-gap/2*facing;e.actors[1].x=gap/2*facing;e.actors[0].facing=facing;e.actors[1].facing=-facing;
  press(e,id);tick(e,80);assert(e.events.some(v=>v.kind==='hit'&&v.who===0),`${a.style}/${b.style} ${id} must connect at ${gap}, facing ${facing}`);cases++;
 }
 console.log(`PASS ${cases} model-calibrated punch/heavy contacts at close, middle and full usable range, both sides`);
 for(const a of specs){
  const create=gap=>{const e=new PitEngine([a,specs[1]],{training:true,dummy:'idle'});e.phase='fight';e.actors[0].x=-gap/2;e.actors[1].x=gap/2;return e};
  const far=create(3800);press(far,'light');tick(far,70);assert(!far.events.some(v=>v.kind==='hit'),'far jab must miss');assert.equal(far.actors[0].energy,0,'whiff grants no energy');
  const retreat=create(3200);retreat.input(1,'right');press(retreat,'light');tick(retreat,70);assert(!retreat.events.some(v=>v.kind==='hit'),'retreat is real, no target magnetism');
  const duck=create(2200);duck.input(1,'down');press(duck,'light');tick(duck,70);assert(!duck.events.some(v=>v.kind==='hit'),'duck avoids high punch');
  const block=create(2500);block.input(1,'guard');press(block,'light');tick(block,70);assert(block.events.some(v=>v.kind==='block'),'extended punch still respects guard');
  const entry=create(3200);entry.input(0,'right');press(entry,'light');entry.step();assert.equal(entry.actors[0].attack.move.motion,'jab','forward light is a travelling punch');entry.input(0,'right',false);tick(entry,70);assert(entry.events.some(v=>v.kind==='hit'),'forward light bridges entry distance');
  const drill=verifyDrills(a);assert.equal(drill.string?.hits,3,'all three parts connect at 2500');assert(drill.string.damage>=20&&drill.string.damage<=30,'normal combo budget');
  console.log(`PASS ${a.name}: whiff, retreat, duck, block, entry jab, and ${drill.string.damage}% real-range combo`);
 }
 const e=new PitEngine([specs[2],specs[1]],{seed:102});e.skipIntro();
 for(let i=0;i<2400;i++){if(i%80===0){e.input(0,'right');press(e,'light')}if(i%80===20)e.input(0,'right',false);if(i%80===24)press(e,'heavy');e.step()}
 const p=e.packet();for(const hz of [30,60,120]){const r=new PitEngine(p.fighters,p.options);r.replay=p.commands;let acc=0;while(r.tick<p.endTick){acc+=60/hz;while(acc>=1&&r.tick<p.endTick){r.step();acc--}}assert.equal(r.digest(),e.digest());}
 console.log('PASS actual-model advancing attacks, AI, hit-stop and replays agree at 30/60/120 render rates');
 const training=new PitEngine([specs[0],specs[1]],{training:true,dummy:'idle',unlimited:true});training.phase='fight';training.step();assert.equal(training.actors[0].energy,300);assert.equal(training.actors[1].energy,0);console.log('PASS unlimited training energy does not grant the rival free supers');
})().catch(e=>{console.error(e);process.exitCode=1});
