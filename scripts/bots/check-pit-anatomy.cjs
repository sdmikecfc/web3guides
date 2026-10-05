// Actual approved geometry, anatomical axes and full motion cycles. These
// checks complement visual review; they do not certify that combat is fun.
const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict'),ts=require('typescript'),T=require('three');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText,f);
const {GLTFLoader}=require('three/examples/jsm/loaders/GLTFLoader.js');
const {assemble,prepareLibrary}=require('../../src/lib/bots/workshop8/runtime/parts-assembly.ts');
const {loaner,moves,fighter}=require('../../src/lib/bots/pit/moves.ts');
const {ENTRY_MAP}=require('../../src/lib/bots/workshop8/catalogue.ts');
const {brawlPose,kicking}=require('../../src/lib/bots/pit/brawl-pose.ts');
const {PitEngine}=require('../../src/lib/bots/pit/engine.ts');
const {robotRig}=require('../../src/lib/bots/pit/rig.ts');
const {calibrateRig}=require('../../src/lib/bots/pit/calibration.ts');
const {verifyDrills}=require('../../src/lib/bots/pit/drills.ts');
const vec=a=>new T.Vector3(...a),library=new Map();
async function load(id){if(library.has(id))return;const bytes=zlib.gunzipSync(fs.readFileSync(require('node:path').join(__dirname,'../../server-assets/bots8',id+'.glb.gz'))),model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;if(ENTRY_MAP.has(id)){model.userData.weaponKind=ENTRY_MAP.get(id).weapon;model.userData.weaponHands=ENTRY_MAP.get(id).hands;prepareLibrary(model)}library.set(id,model);}
(async()=>{
 const specs=['tank','speed','ranged'].map(loaner);
 // Independent left/right choices must keep their own lengths and hand frames.
 specs.push(fighter('Mixed limbs',{...specs[0].choices,armL:specs[1].choices.armL,legR:specs[2].choices.legR}));
 let sampled=0;
 for(const spec of specs){for(const id of new Set([...Object.values(spec.choices),'__support']))await load(id);
  const assembly=assemble(spec.choices,library),restBefore=assembly.model.getObjectByName('wristR').getWorldPosition(new T.Vector3());assembly.bind();const pose=brawlPose(assembly.model),a=new PitEngine([spec,spec]).actors[0];
  assembly.rest();assert(assembly.model.getObjectByName('wristR').getWorldPosition(new T.Vector3()).distanceTo(restBefore)<1e-7,'legacy weapon stance unchanged');
  a.held.add('guard');pose.pose(a,0);
  for(const [side,data]of Object.entries(pose.inspect())){const sign=side==='L'?1:-1;assert(data.wrist[0]*sign>.25,spec.name+' uncrossed guard');assert(data.elbow[1]<data.wrist[1],spec.name+' elbow below guard');}
  a.held.clear();
  a.held.add('right');let planted=0;
  for(const facing of [1,-1])for(const direction of [1,-1]){a.facing=facing;const previous={};
   for(let tick=0;tick<100;tick++){a.x=direction*tick*spec.speed;pose.pose(a,tick);const data=pose.inspect();
    for(const side of ['L','R']){const phase=((a.x*facing/(1000*.82*1.5)+(side==='L'?0:.5))%1+1)%1,foot=a.x/1000+data[side].ankle[2]*.82*facing,p=previous[side];
     if(p&&phase<.59&&p.phase<.59&&Math.abs(phase-p.phase)<.2){assert(Math.abs(foot-p.foot)<.003,spec.name+' grounded foot must not slide');planted++}previous[side]={phase,foot};
    }
   }
  }assert(planted>100);a.held.clear();a.x=0;a.facing=1;  for(const m of Object.values(moves(spec)).filter(m=>!m.motion.startsWith('weapon'))){
   const n=m.startup+m.active+m.recovery;
   for(let f=0;f<n;f++){a.attack={move:m,frame:f,facing:1,instance:1,hits:[],enhanced:false,shots:0};a.crouch=m.id==='low';a.y=m.id.startsWith('air')?900:0;pose.pose(a,0);sampled++;
    for(const [side,d]of Object.entries(pose.inspect())){
     const upper=vec(d.knee).sub(vec(d.hip)),lower=vec(d.ankle).sub(vec(d.knee));
     assert(new T.Vector3().crossVectors(upper,lower).x>.001,spec.name+' knee bends forward: '+m.id+'/'+f);
     const arm=vec(d.wrist).sub(vec(d.elbow)).normalize();assert(arm.dot(vec(d.handAxis))>.999,spec.name+' hand aligned with forearm');
     if(kicking(m.motion)&&m.motion!=='stomp'&&side==='R'&&f===m.startup+m.active-1){assert(d.sole[2]>.97,spec.name+' sole faces kick');assert(d.toe[1]>.97,spec.name+' toe stays upright');}
    }
    assembly.model.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite),'finite joint transforms'));
   }
  }
  console.log('PASS '+spec.name+': uncrossed guard, aligned fists, positive knee flexion, upright kick, repeatable bind');
  const rig=robotRig(assemble(spec.choices,library),spec);Object.assign(spec,calibrateRig(rig,spec));
  const verified=verifyDrills(spec);assert(verified.string,spec.name+' real-geometry light-light-heavy');
  console.log('Actual geometry combo:',JSON.stringify(verified));
 }
 console.log('Sampled '+sampled+' actual assembled poses. Visual approval still required.');
})().catch(e=>{console.error(e);process.exitCode=1});
