// Exercise the actual exported robot hierarchy, geometry and runtime pose without WebGL.
{
  const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
  const root=process.env.BOTS_REPO_ROOT||path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript'),resolve=Module._resolveFilename;
  Module._resolveFilename=function(request,parent,isMain,options){return resolve.call(this,request.startsWith('@/')?path.join(root,'src',request.slice(2)):request,parent,isMain,options);};
  require.extensions['.ts']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);};
}
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const repo=process.env.BOTS_REPO_ROOT||path.resolve(__dirname,'..'),ts=require(repo+'/node_modules/typescript');
const {presetV6,createFightV6,stepFightV6,snapshotBuildV6}=require(repo+'/src/lib/bots/v6');
const {fighterPoseV6,weaponForActionV6}=require(repo+'/src/lib/bots/v6/engine');
const {HERO_COLLISION_VERSION_V6}=require(repo+'/src/lib/bots/v6/hero-collision');
const {modularBuild}=require(repo+'/src/lib/bots/combat-model');
const out=process.env.BOTS_V6_RENDER_OUTPUT||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'mk6-render-check-')),report={checks:[],failures:[],rigs:[],samples:[],sources:{},scope:'CPU actual GLB parsing, live model geometry and transforms; no GPU/FPS claim'};
const pass=(name,extra={})=>{report.checks.push({name,...extra});console.log('PASS',name);};
const soft=(condition,message)=>{if(!condition)report.failures.push(message);};
const hash=v=>createHash('sha256').update(v).digest('hex');
(async()=>{
 const threePath=repo+'/node_modules/three/build/three.module.js',loaderPath=repo+'/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
 const THREE=await import(pathToFileURL(threePath).href),{GLTFLoader}=await import(pathToFileURL(loaderPath).href);
 const sources=new Map(),loading=[];
 GLTFLoader.prototype.loadAsync=async function(url){
  assert(String(url).startsWith('/bots-art/3d/season-v6/'),'only game hero GLBs are read');
  const file=path.join(repo,'public',url),buffer=fs.readFileSync(file);report.sources[path.basename(file)]=hash(buffer);
  const result=await this.parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
  sources.set(url,result.scene);return result;
 };
 const staged=path.join(out,'src/app/bots/_view/v6-toy.ts'),file=!process.argv.includes('--repo')&&fs.existsSync(staged)?staged:repo+'/src/app/bots/_view/v6-toy.ts';
 report.sources.renderer=hash(fs.readFileSync(file));report.sources.engine=hash(fs.readFileSync(repo+'/src/lib/bots/v6/engine.ts'));
 for(const name of['pose','hero-collision','catalog','collision'])report.sources[name]=hash(fs.readFileSync(repo+'/src/lib/bots/v6/'+name+'.ts'));
 let code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 code=code.replaceAll('"three"',JSON.stringify(pathToFileURL(threePath).href)).replaceAll('"three/examples/jsm/loaders/GLTFLoader.js"',JSON.stringify(pathToFileURL(loaderPath).href));
 const assetsShim=path.join(out,'assets.runtime.mjs');fs.writeFileSync(assetsShim,`import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const assets=require(${JSON.stringify(repo+'/src/lib/bots/v6/assets.ts')});export const cardAssetV6=assets.cardAssetV6,CATALOGUE_ASSET_ROOT_V6=assets.CATALOGUE_ASSET_ROOT_V6;`);
 code=code.replaceAll('"@/lib/bots/v6/assets"',JSON.stringify(pathToFileURL(assetsShim).href));
 const moduleFile=path.join(out,'v6-toy.runtime.mjs');fs.writeFileSync(moduleFile,code);const {createToyV6}=await import(pathToFileURL(moduleFile).href+'?'+Date.now());
 const hero=style=>presetV6(style,3,{signature:true,collisionVersion:HERO_COLLISION_VERSION_V6});
 const hashMeshes=toy=>{const rows=[];toy.root.traverse(o=>{if(o.isMesh)rows.push([o.name,hash(Buffer.from(o.geometry.getAttribute('position').array.buffer)),o.geometry.getAttribute('color')?hash(Buffer.from(o.geometry.getAttribute('color').array.buffer)):null,hash(Buffer.from(o.geometry.getAttribute('normal').array.buffer))]);});return rows;};
 const rawGeometryHash=()=>{const rows=[];for(const [name,root] of sources)root.traverse(o=>{if(o.isMesh)rows.push([name,o.name,hash(Buffer.from(o.geometry.getAttribute('position').array.buffer))]);});return rows;};
 const mats=new Map(),geos=new Map();
 const oldMaterialDispose=THREE.Material.prototype.dispose,oldGeometryDispose=THREE.BufferGeometry.prototype.dispose;
 THREE.Material.prototype.dispose=function(){mats.set(this,(mats.get(this)||0)+1);return oldMaterialDispose.call(this);};
 THREE.BufferGeometry.prototype.dispose=function(){geos.set(this,(geos.get(this)||0)+1);return oldGeometryDispose.call(this);};
 for(const style of['tank','speed','ranged']){
  const build=hero(style);let toy;
  try{toy=await createToyV6(build);}catch(e){report.failures.push(`${style} loader: ${e.message}`);continue;}
  loading.push(toy);
  const slots=['head','torso','armL','armR','legL','legR'];assert(slots.every(slot=>toy.slots[slot]),`${style} six body slots resolve`);
  const names=['armL_elbow','armR_elbow','handL','handR'];assert(names.every(name=>toy.root.getObjectByName(name)),`${style} arm hierarchy resolves`);
  report.rigs.push({style,slots:Object.keys(toy.slots),joints:names.map(name=>({name,position:toy.root.getObjectByName(name).position.toArray()}))});
  pass(`${style}: real Blender hero loads every canonical body slot, elbow and hand`);
  const state=createFightV6(75,build,hero(style==='speed'?'tank':'speed'));
  state.fighters[0].x=1234;state.fighters[0].z=-987;state.fighters[0].yaw=789;
  const f=state.fighters[0],rootPoint=arr=>toy.body.localToWorld(new THREE.Vector3(...arr).multiplyScalar(.001));
  let maxGrip=0,maxJoint=0,maxStretch=0,maxMuzzle=0,maxBarrelAngle=0,animated=false,samples=0;
  const restPositions=new Map();toy.root.traverse(o=>{if(!o.isMesh)restPositions.set(o.name,o.position.clone());});
  const w=build.capabilities.weaponDefinition;
  for(const mount of['left','right','shoulder']){
   if(mount==='shoulder'&&style!=='ranged')continue;
   if(mount==='left'&&style!=='speed')continue;
   f.action={id:1,kind:mount==='shoulder'?w.id:style==='ranged'?'backup_pistol':w.id,mount,started:0,windup:30,active:18,recovery:42,released:false,hitTargets:[],targetHeight:1600,aim:[0,1600,1000],aimLocal:[0,1600,1000],aimVelocity:[0,0,0],aimError:[0,0,0],lastPoint:null,nextPulse:0,burstBudget:0,critical:false,emissions:0,pathActive:[...w.proxy.active],slowed:false};
   for(let frame=0;frame<=90;frame++){
    state.frame=frame;const shared=fighterPoseV6(state,0);toy.pose(f,frame,shared);samples++;
    for(const side of['left','right']){
     const suffix=side==='left'?'L':'R',arm=shared.arms[side],shoulder=toy.slots['arm'+suffix],elbow=toy.root.getObjectByName('arm'+suffix+'_elbow'),hand=toy.root.getObjectByName('hand'+suffix);
     const actualHand=hand.getWorldPosition(new THREE.Vector3()),actualElbow=elbow.getWorldPosition(new THREE.Vector3()),actualShoulder=shoulder.getWorldPosition(new THREE.Vector3());
     maxJoint=Math.max(maxJoint,actualHand.distanceTo(rootPoint(arm.grip)),actualElbow.distanceTo(rootPoint(arm.elbow)),actualShoulder.distanceTo(rootPoint(arm.shoulder)));
     const rig=build.collision.arms[side];maxStretch=Math.max(maxStretch,Math.abs(actualShoulder.distanceTo(actualElbow)-Math.hypot(...rig.upper)/1000),Math.abs(actualElbow.distanceTo(actualHand)-Math.hypot(...rig.lower)/1000));
     assert.deepEqual(elbow.position.toArray(),restPositions.get(elbow.name).toArray(),'joint translations never stretch');
     assert.deepEqual(hand.position.toArray(),restPositions.get(hand.name).toArray(),'hand translation stays authored');
     const weapon=toy.root.getObjectByName('weapon_'+side);
     if(weapon){const definition=weaponForActionV6(state,0,f.action.mount===side?f.action.kind:w.id),grip=definition.proxy.grip;maxGrip=Math.max(maxGrip,actualHand.distanceTo(weapon.localToWorld(new THREE.Vector3(...grip).multiplyScalar(.001))));}
     if(frame>0&&shared.weapons[side]&&shoulder.quaternion.angleTo(new THREE.Quaternion())>.01)animated=true;
    }
    for(const [side,gun] of Object.entries(shared.mounts||{})){
     const weapon=toy.root.getObjectByName('weapon_'+side);if(!weapon)continue;
     const definition=weaponForActionV6(state,0,f.action.mount===side?f.action.kind:(side==='right'&&w.mount==='shoulder'?'backup_pistol':w.id)),muzzle=definition.proxy.muzzle;
     const actual=weapon.localToWorld(new THREE.Vector3(...muzzle).multiplyScalar(.001)),expected=rootPoint(gun.muzzle);
     maxMuzzle=Math.max(maxMuzzle,actual.distanceTo(expected));
     const axis=new THREE.Vector3(0,0,1).transformDirection(weapon.matrixWorld),forward=new THREE.Vector3(...gun.forward).transformDirection(toy.body.matrixWorld);
     maxBarrelAngle=Math.max(maxBarrelAngle,axis.angleTo(forward));
     if(weapon.quaternion.angleTo(new THREE.Quaternion())>.01)animated=true;
    }
   }
  }
  report.samples.push({style,samples,maxGripMm:maxGrip*1000,maxJointMm:maxJoint*1000,maxStretchMm:maxStretch*1000,maxMuzzleMm:maxMuzzle*1000,maxBarrelDegrees:maxBarrelAngle*180/Math.PI,animated});
  soft(maxGrip<.001,`${style} actual GLB hand/weapon grip gap ${maxGrip*1000}mm`);soft(maxJoint<.001,`${style} rendered joints diverge from shared pose by${maxJoint*1000}mm`);soft(maxStretch<.001,`${style} arm length differs by${maxStretch*1000}mm`);
  soft(maxMuzzle<.001,`${style} rendered muzzle differs from simulated muzzle by${maxMuzzle*1000}mm`);soft(maxBarrelAngle<.00001,`${style} rendered barrel differs from shot ray by${maxBarrelAngle*180/Math.PI}degrees`);
  if(style!=='ranged')soft(animated,`${style} attack has no actual arm rotation`);
  if(maxGrip<.001&&maxJoint<.001&&maxStretch<.001)pass(`${style}: actual hands, held grips and non-stretched arms agree through ${samples} preparation/contact/recovery poses`);
  const savedAction=f.action;
  for(const side of['left','right'])if(toy.root.getObjectByName('weapon_'+side))for(const kind of['punch','shove']){
   f.action={...savedAction,kind,mount:side};toy.pose(f,15,fighterPoseV6(state,0,15));
   assert.equal(toy.root.getObjectByName('weapon_'+side).visible,false,`${style} ${side} actual weapon mesh is stowed for bare-hand ${kind}`);
   const otherWeapon=toy.root.getObjectByName('weapon_'+(side==='left'?'right':'left'));if(otherWeapon)assert.equal(otherWeapon.visible,true,'stowing the striking hand does not remove the other weapon');
  }
  f.action=savedAction;toy.pose(f,state.frame,fighterPoseV6(state,0));
  const peer=await createToyV6(build);loading.push(peer);const peerBefore=hashMeshes(peer),rawBefore=rawGeometryHash(),before=hashMeshes(toy);
  const hit={id:1,frame:10,kind:'hit',who:1,target:0,slot:'torso',weapon:'hammer',damage:30,point:[0,500,1000],normal:[0,0,1000]};
  assert(toy.impact(hit)>0,`${style} hit deforms actual clay vertices`);assert(toy.dents>0&&toy.changedVertices>0);assert.notDeepEqual(hashMeshes(toy),before);
  const damaged=hashMeshes(toy);assert.deepEqual(hashMeshes(peer),peerBefore);assert.deepEqual(rawGeometryHash(),rawBefore);
  const protectedNames=[];toy.root.traverse(o=>{if(o.isMesh&&o.userData.mk_surface!=='clay')protectedNames.push(o.name);});assert.deepEqual(damaged.filter(r=>protectedNames.includes(r[0])),before.filter(r=>protectedNames.includes(r[0])),'lenses, joints and machinery remain undeformed');
  toy.pose(f,20,fighterPoseV6(state,0));assert.deepEqual(hashMeshes(toy),damaged,'poses preserve damage');
  const armHit={...hit,id:2,slot:'armL'};assert(toy.impact(armHit)>0);const burn={...hit,id:3,kind:'burn',weapon:'flamethrower',slot:'armL'};assert(toy.impact(burn)>0);assert.equal(toy.scorches,1);
  const expected=hashMeshes(toy);toy.reset();assert.equal(toy.dents,0);assert.equal(toy.scorches,0);assert.equal(toy.changedVertices,0);assert.deepEqual(hashMeshes(toy),before);
  toy.impact(hit);toy.impact(armHit);toy.impact(burn);assert.deepEqual(hashMeshes(toy),expected,'recorded impacts rebuild byte-identical positions, normals and scorch colours');
  const detached=toy.slots.armL.clone(true),detachedMesh=[];detached.traverse(o=>{if(o.isMesh&&o.userData.mk_surface==='clay')detachedMesh.push(hash(Buffer.from(o.geometry.getAttribute('color').array.buffer)));});
  f.armour[2]=0;toy.pose(f,30,fighterPoseV6(state,0));assert.equal(toy.slots.armL.visible,false);if(toy.root.getObjectByName('weapon_left'))assert.equal(toy.root.getObjectByName('weapon_left').visible,false);
  detached.visible=true;const afterDetach=[];detached.traverse(o=>{if(o.isMesh&&o.userData.mk_surface==='clay')afterDetach.push(hash(Buffer.from(o.geometry.getAttribute('color').array.buffer)));});assert.deepEqual(afterDetach,detachedMesh);assert.deepEqual(hashMeshes(peer),peerBefore);
 pass(`${style}: dents/scorches persist, peers/cache stay clean, replay resets identically and a detached limb retains its surface marks`);
 }
 const burstBuild=hero('ranged'),burstToy=await createToyV6(burstBuild);loading.push(burstToy);
 const burstState=createFightV6(75,burstBuild,hero('tank')),burstFighter=burstState.fighters[0];
 burstFighter.x=-1321;burstFighter.z=765;burstFighter.yaw=-930;
 const savedArmour=[...burstFighter.armour],specialMeshes={};
 for(const side of['left','right']){
  const gun=burstToy.root.getObjectByName('special_'+side);assert(gun,`actual Special ${side} mount exists`);
  assert.equal(gun.visible,false,'Special pistol stays hidden before the finisher');
  const meshes=[];gun.traverse(o=>{if(o.isMesh)meshes.push(o);});assert(meshes.length>0,'actual exported sidearm has geometry');specialMeshes[side]=meshes;
  gun.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(gun);
  assert(Math.abs(bounds.max.z-.45)<.001,'actual sidearm forward edge matches the authored 450mm muzzle');
  assert(bounds.min.y<.12&&bounds.max.y>.12,'authored 120mm barrel center lies inside actual sidearm geometry');
 }
 for(let i=0;i<specialMeshes.left.length;i++)assert.notEqual(specialMeshes.left[i].geometry,specialMeshes.right[i].geometry,'each held sidearm owns its own geometry');
 let specialMuzzle=0,specialGrip=0,specialDirection=0,specialJoint=0,specialStretch=0;
 burstFighter.action={id:77,kind:'special_burst',special:'burst',mount:'right',started:0,windup:10,active:40,recovery:12,released:false,hitTargets:[],targetHeight:1600,aim:[800,1600,1100],aimLocal:[0,1600,0],aimVelocity:[0,0,0],aimError:[0,0,0],lastPoint:null,nextPulse:10,burstBudget:40,critical:false,emissions:0,pathActive:[0,1],slowed:false};
 for(let frame=0;frame<=62;frame++){
  burstState.frame=frame;const shared=fighterPoseV6(burstState,0);burstToy.pose(burstFighter,frame,shared);
  for(const side of['left','right']){
   const gun=burstToy.root.getObjectByName('special_'+side),mount=shared.mounts[side],suffix=side==='left'?'L':'R';assert(gun.visible&&mount,'both actual Special guns are visible and aimed during burst');
   const definition=weaponForActionV6(burstState,0,'special_burst'),actualMuzzle=gun.localToWorld(new THREE.Vector3(...definition.proxy.muzzle).multiplyScalar(.001)),expectedMuzzle=burstToy.body.localToWorld(new THREE.Vector3(...mount.muzzle).multiplyScalar(.001));
   specialMuzzle=Math.max(specialMuzzle,actualMuzzle.distanceTo(expectedMuzzle));
   const actualForward=new THREE.Vector3(0,0,1).transformDirection(gun.matrixWorld),expectedForward=new THREE.Vector3(...mount.forward).transformDirection(burstToy.body.matrixWorld);specialDirection=Math.max(specialDirection,actualForward.angleTo(expectedForward));
   const actualHand=burstToy.root.getObjectByName('hand'+suffix).getWorldPosition(new THREE.Vector3()),actualElbow=burstToy.root.getObjectByName('arm'+suffix+'_elbow').getWorldPosition(new THREE.Vector3()),actualShoulder=burstToy.slots['arm'+suffix].getWorldPosition(new THREE.Vector3());
   specialGrip=Math.max(specialGrip,actualHand.distanceTo(gun.localToWorld(new THREE.Vector3(...definition.proxy.grip).multiplyScalar(.001))));
   specialJoint=Math.max(specialJoint,actualHand.distanceTo(burstToy.body.localToWorld(new THREE.Vector3(...shared.arms[side].grip).multiplyScalar(.001))));
   const rig=burstBuild.collision.arms[side];specialStretch=Math.max(specialStretch,Math.abs(actualShoulder.distanceTo(actualElbow)-Math.hypot(...rig.upper)/1000),Math.abs(actualElbow.distanceTo(actualHand)-Math.hypot(...rig.lower)/1000));
  }
  for(const side of['left','right','shoulder']){const normal=burstToy.root.getObjectByName('weapon_'+side);if(normal)assert.equal(normal.visible,false,'ordinary weapons are stowed during two-pistol Special');}
 }
 for(const [left,right] of[[0,savedArmour[3]],[savedArmour[2],0],[0,0]]){
  burstFighter.armour[2]=left;burstFighter.armour[3]=right;burstToy.pose(burstFighter,30,fighterPoseV6(burstState,0));
  assert.equal(burstToy.root.getObjectByName('special_left').visible,left>0,'lost left arm hides only its Special pistol');assert.equal(burstToy.root.getObjectByName('special_right').visible,right>0,'lost right arm hides only its Special pistol');
 }
 burstFighter.armour=[...savedArmour];burstFighter.action=null;burstToy.reset();burstToy.pose(burstFighter,63,fighterPoseV6(burstState,0));
 assert.equal(burstToy.root.getObjectByName('special_left').visible,false);assert.equal(burstToy.root.getObjectByName('special_right').visible,false);
 assert.equal(burstToy.root.getObjectByName('weapon_right').visible,true);assert.equal(burstToy.root.getObjectByName('weapon_shoulder').visible,true);
 assert(specialMuzzle<.001&&specialGrip<.001&&specialJoint<.001&&specialStretch<.001&&specialDirection<.00001,'actual two-pistol grips, muzzle, shot direction and fixed arms match shared simulation');
 pass('actual two-pistol Special GLB: both hands, 63 burst poses, muzzle/direction, arm-loss visibility and normal-weapon return',{samples:63,maxMuzzleMm:specialMuzzle*1000,maxGripMm:specialGrip*1000,maxJointMm:specialJoint*1000,maxStretchMm:specialStretch*1000,maxBarrelDegrees:specialDirection*180/Math.PI});
 const tank=hero('tank'),speed=hero('speed'),ranged=hero('ranged'),choices=[ranged.parts.head,tank.parts.torso,speed.parts.armL,ranged.parts.armR,ranged.parts.legL,speed.parts.legR,tank.parts.weapon];
 const mixedBuild=snapshotBuildV6(modularBuild(...choices.map(c=>({id:c.id,s:[...c.s]}))),{collisionVersion:HERO_COLLISION_VERSION_V6}),mixedToy=await createToyV6(mixedBuild);loading.push(mixedToy);
 const mixedState=createFightV6(31,mixedBuild,speed);let mixedGap=0;
 for(let n=0;n<300&&!mixedState.done;n++){stepFightV6(mixedState);const pose=fighterPoseV6(mixedState,0);mixedToy.pose(mixedState.fighters[0],mixedState.frame,pose);for(const side of['left','right']){const actual=mixedToy.root.getObjectByName(side==='left'?'handL':'handR').getWorldPosition(new THREE.Vector3()),expected=mixedToy.body.localToWorld(new THREE.Vector3(...pose.arms[side].grip).multiplyScalar(.001));mixedGap=Math.max(mixedGap,actual.distanceTo(expected));}}
 soft(mixedGap<.001,`mixed donor limbs differ from saved mount/arm pose by${mixedGap*1000}mm`);if(mixedGap<.001)pass('mixed three-family hero retains exact independent donor limbs and shared attachment poses',{maxJointMm:mixedGap*1000});
 const {FAMILIES_V6,CATALOG_V6}=require(repo+'/src/lib/bots/v6/catalog');
 let catalogueSamples=0,catalogueJoint=0,catalogueMuzzle=0;
 const cases=[];
 for(const family of FAMILIES_V6)for(const tier of[1,2,3,4])cases.push(presetV6(family.style,tier,{family:family.id,signature:tier>=3}));
 const rows=Array.isArray(CATALOG_V6)?CATALOG_V6:Object.values(CATALOG_V6||{});
 const {cardAssetV6}=require(repo+'/src/lib/bots/v6/assets');
 assert.equal(cardAssetV6('mk6.t2.weapon.shoulder_cannon'),undefined,'retired cannon proof is not admitted as a playable part');
 for(const card of rows)assert(cardAssetV6(card)?.ready,'every active card has an admitted visual: '+card.id);
 for(const card of rows.filter(c=>c.slot==='weapon')){
  const reference=presetV6(card.style??'ranged',card.tier),raw={...reference.appearanceBuild,weapon:{id:card.id,s:[...card.s]}};
  try{cases.push(snapshotBuildV6(raw));}catch(error){report.failures.push('weapon fixture '+card.id+': '+error.message);}
 }
 assert.equal(cases.length,FAMILIES_V6.length*4+rows.filter(c=>c.slot==='weapon').length,'every active weapon and family/tier has an actual model case');
 assert.equal(rows.filter(c=>c.id==='mk6.t2.weapon.shoulder_cannon').length,0,'retired T2 cannon is not a playable catalogue card');
 for(const build of cases){
  const toy=await createToyV6(build),state=createFightV6(75,build,presetV6('tank',build.tier)),f=state.fighters[0];
  f.x=150;f.z=-200;f.yaw=500;const w=build.capabilities.weaponDefinition;
  for(const frame of[0,15,30,45,70]){
   state.frame=frame;f.gait=frame*47;f.moveX=35;f.moveZ=12;
   f.action={id:1,kind:w.id,mount:w.mount,started:0,windup:30,active:18,recovery:42,released:false,hitTargets:[],targetHeight:1600,aim:[0,1600,3000],aimLocal:[0,1600,0],aimVelocity:[0,0,0],aimError:[0,0,0],aimFrame:0,aimSlot:'torso',lastPoint:null,nextPulse:0,burstBudget:0,critical:false,emissions:0,pathActive:[...w.proxy.active],slowed:false};
   const pose=fighterPoseV6(state,0);toy.pose(f,frame,pose);catalogueSamples++;
   for(const side of['left','right']){
    const hand=toy.root.getObjectByName(side==='left'?'handL':'handR'),expected=toy.body.localToWorld(new THREE.Vector3(...pose.arms[side].grip).multiplyScalar(.001));
    catalogueJoint=Math.max(catalogueJoint,hand.getWorldPosition(new THREE.Vector3()).distanceTo(expected));
    const leg=toy.slots[side==='left'?'legL':'legR'];assert(leg.quaternion.angleTo(new THREE.Quaternion(...pose.legs[side].hipQuaternion))<.000001,'actual leg follows shared hip pose');
   }
   for(const [mount,gun]of Object.entries(pose.mounts)){
    const node=toy.root.getObjectByName('weapon_'+mount);if(!node)continue;
    const mountKind=mount===f.action.mount?f.action.kind:(mount==='right'&&w.mount==='shoulder'?'backup_pistol':w.id);
    const proxy=weaponForActionV6(state,0,mountKind).proxy;
    catalogueMuzzle=Math.max(catalogueMuzzle,node.localToWorld(new THREE.Vector3(...proxy.muzzle).multiplyScalar(.001)).distanceTo(toy.body.localToWorld(new THREE.Vector3(...gun.muzzle).multiplyScalar(.001))));
   }
  }
  toy.dispose();
 }
 soft(catalogueJoint<.001,`catalogue hand error ${catalogueJoint*1000}mm`);soft(catalogueMuzzle<.001,`catalogue muzzle error ${catalogueMuzzle*1000}mm`);
 if(catalogueJoint<.001&&catalogueMuzzle<.001)pass('all six families across four tiers and every weapon: actual joints, walking hips and gun muzzles follow combat',{builds:cases.length,samples:catalogueSamples,maxJointMm:catalogueJoint*1000,maxMuzzleMm:catalogueMuzzle*1000});
 for(const toy of loading){toy.dispose();toy.dispose();}
 const doubleMaterials=[...mats.values()].filter(n=>n!==1).length,doubleGeometries=[...geos.values()].filter(n=>n!==1).length;
 soft(doubleMaterials===0,`${doubleMaterials} material resources disposed more than once`);soft(doubleGeometries===0,`${doubleGeometries} geometry resources disposed more than once`);
 for(const source of sources.values())source.traverse(o=>{if(o.isMesh){soft(!geos.has(o.geometry),'cached source geometry was disposed');for(const m of Array.isArray(o.material)?o.material:[o.material])soft(!mats.has(m),'cached source material was disposed');}});
 if(!doubleMaterials&&!doubleGeometries)pass('one owned-resource dispose each; shared cached GLB materials/geometry stay alive');
 fs.writeFileSync(path.join(out,'actual-glb-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
})().catch(e=>{report.failures.push(e.stack||String(e));fs.writeFileSync(path.join(out,'actual-glb-report.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;});

