// Uses the shipped model geometry rather than the fallback reach constants.
const fs=require('node:fs'),zlib=require('node:zlib'),ts=require('typescript'),path=require('node:path');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText,f);
const {GLTFLoader}=require('three/examples/jsm/loaders/GLTFLoader.js');
const {assemble,prepareLibrary}=require('../../src/lib/bots/workshop8/runtime/parts-assembly.ts');
const {loaner,moves}=require('../../src/lib/bots/pit/moves.ts');
const {ENTRY_MAP}=require('../../src/lib/bots/workshop8/catalogue.ts');
const {PitEngine}=require('../../src/lib/bots/pit/engine.ts');
const {robotRig}=require('../../src/lib/bots/pit/rig.ts');
const {calibrateRig}=require('../../src/lib/bots/pit/calibration.ts');
async function calibrated(){
 const library=new Map(),specs=['tank','speed','ranged'].map(loaner);
 for(const spec of specs){for(const id of new Set([...Object.values(spec.choices),'__support']))if(!library.has(id)){
  const bytes=zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../../server-assets/bots8',id+'.glb.gz')));
  const model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  if(ENTRY_MAP.has(id)){model.userData.weaponKind=ENTRY_MAP.get(id).weapon;model.userData.weaponHands=ENTRY_MAP.get(id).hands;prepareLibrary(model)}library.set(id,model);
 }const rig=robotRig(assemble(spec.choices,library),spec);Object.assign(spec,calibrateRig(rig,spec));}
 return specs;
}
function strike(a,b,id,gap){const e=new PitEngine([a,b],{training:true,dummy:'idle',unlimited:false});e.phase='fight';e.actors[0].x=-gap/2;e.actors[1].x=gap/2;e.start(0,id,false);for(let i=0;i<90;i++)e.step();return {hit:e.events.some(v=>v.kind==='hit'&&v.who===0),damage:b.hp-e.actors[1].hp,gap:e.actors[1].x-e.actors[0].x};}
function matchup(a,b,policy,seed){
 const e=new PitEngine([a,b],{seed,difficulty:'normal'}),history=[];
 const pulse=k=>{e.input(0,k);e.input(0,k,false)};
 for(let t=0;t<22000&&e.phase!=='result'&&e.phase!=='finishPrompt';t++){
  const p=e.actors[0],r=e.actors[1],dist=Math.abs(p.x-r.x);
  history.push({attacking:!!r.attack&&r.attack.frame<r.attack.move.startup+r.attack.move.active,guard:r.held.has('guard'),level:r.attack?.move.level});
  if(history.length>20)history.shift();const seen=history[0];
  if(e.phase==='fight'&&t%6===0){
   const desired=new Set(),toward=r.x>p.x?'right':'left';let action;
   if(policy==='mash'){if(dist>2100)desired.add(toward);action='light';}
   else if(p.attack?.hits.includes(1)){if(['light','advance'].includes(p.attack.move.id))action='heavy';else if(p.attack.move.id==='heavy'){desired.add(toward);action=p.energy>=200?'super':'special'}}
   else if(seen.attacking&&dist<3100){desired.add('guard');if(seen.level==='low')desired.add('down');}
   else if(!p.attack&&!p.stun){if(dist>2450)desired.add(toward);else if(seen.guard&&dist<2000){desired.add('down');action='light'}else action='light';}
   for(const k of ['left','right','guard','down'])if(p.held.has(k)!==desired.has(k))e.input(0,k,desired.has(k));
   if(action)pulse(action);
  }
  e.step();
 }
 return {won:e.winner===0,hits:e.events.filter(v=>v.kind==='hit'&&v.who===0).length,damage:e.events.filter(v=>v.kind==='hit'&&v.who===0).reduce((n,v)=>n+v.amount,0)};
}
if(require.main===module)calibrated().then(specs=>{if(process.argv.includes('--matches')){for(const a of specs)for(const b of specs)for(const policy of ['mash','measured']){const results=Array.from({length:6},(_,i)=>matchup(a,b,policy,100+i));console.log(JSON.stringify({player:a.style,opponent:b.style,policy,wins:results.filter(r=>r.won).length,hits:results.reduce((n,r)=>n+r.hits,0)}))}return;}for(const a of specs){for(const id of ['light','heavy','advance','low']){
 const ranges=[];for(let gap=1100;gap<=3600;gap+=100)if(strike(a,specs[1],id,gap).hit)ranges.push(gap);
 console.log(a.style,id,'fist/foot',a.contacts[id], 'connects',ranges.length?[Math.min(...ranges),Math.max(...ranges)]:[], 'travel',moves(a)[id].travel);
 }} }).catch(e=>{console.error(e);process.exitCode=1});
module.exports={calibrated,strike};
