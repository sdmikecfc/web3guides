// Geometry checks use the same approved GLBs and pose sampler as the browser.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText,f);
const {GLTFLoader}=require('three/examples/jsm/loaders/GLTFLoader.js'),T=require('three');
const {assemble,prepareLibrary}=require('../../src/lib/bots/workshop8/runtime/parts-assembly.ts');
const {ENTRY_MAP}=require('../../src/lib/bots/workshop8/catalogue.ts');
const {indexedBounds}=require('../../src/lib/bots/pit/weapon-carry.ts');
const {robotRig}=require('../../src/lib/bots/pit/rig.ts');
const {loaner,moves,fighter}=require('../../src/lib/bots/pit/moves.ts'),{PitEngine}=require('../../src/lib/bots/pit/engine.ts');
(async()=>{
 const library=new Map(),loader=new GLTFLoader();
 for(const style of ['tank','speed','ranged'])for(const kit of process.argv.includes('--all')?[...ENTRY_MAP.values()].filter(e=>e.id.startsWith('kit1.')&&e.tier===1).map(e=>e.id):[null]){
  const base=loaner(style),spec=kit?fighter(style,{...base.choices,weapon:kit}):base;
  for(const id of new Set([...Object.values(spec.choices),'__support']))if(!library.has(id)){
   const bytes=zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'../../server-assets/bots8',id+'.glb.gz'))),model=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
   if(ENTRY_MAP.has(id)){model.userData.weaponKind=ENTRY_MAP.get(id).weapon;model.userData.weaponHands=ENTRY_MAP.get(id).hands;prepareLibrary(model);}library.set(id,model);
  }
  const assembly=assemble(spec.choices,library),rig=robotRig(assembly,spec),actor=new PitEngine([spec,spec]).actors[0];actor.x=0;actor.facing=1;
  rig.stance(actor,0,0,false);assert(rig.inspect().stowedClearance>=.07,style+' stowed weapon clears body');
  let maxGripError=0;
  for(const id of ['special','forwardSpecial']){const move=moves(spec)[id];
   for(let frame=0;frame<move.startup+move.active+move.recovery;frame++){
    rig.stance({...actor,attack:{move,frame,facing:1,instance:1,hits:[],enhanced:false,shots:0}},frame,0,false);
    maxGripError=Math.max(maxGripError,rig.inspect().gripError);
    rig.model.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite),style+' finite transforms'));
    if(frame===move.startup){const a=rig.model.getObjectByName('handGripR').getWorldPosition(new T.Vector3()),b=rig.model.getObjectByName('gripR').getWorldPosition(new T.Vector3());assert(a.distanceTo(b)<.025,style+' striking grip stays attached');}
   }
  }
  assert(maxGripError<.06,style+' drawing hand reach '+maxGripError);
  const names=[];rig.model.traverse(o=>{if(o.name==='gripR'||o.name==='muzzle')names.push(o.name)});assert.equal(names.filter(n=>n==='gripR').length,1,'one real grip, no clones');
  console.log(JSON.stringify({style,kit:spec.weapon,maxGripError,uniqueSockets:true,stowedClear:true}));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
