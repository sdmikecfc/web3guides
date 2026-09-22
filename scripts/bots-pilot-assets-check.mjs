#!/usr/bin/env node
/** Read-only GLB/manifest contract check. No provider, DB, renderer, or source-art writes.
 * Run: node scripts/bots-pilot-assets-check.mjs [--json]
 * This proves static modular rig contracts and main-pass geometry budgets, not visual appeal. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const folder=path.join(root,"public/bots-art/3d/pilot");
const errors=[],warnings=[];
const sockets=["head","torso","armL","armR","legL","legR","weapon"];
const slotOf={head:"head",torso:"torso",armL:"arms",armR:"arms",legL:"legs",legR:"legs",weapon:"weapon"};
const influences={head:["head"],torso:["torso"],armL:["armL","elbowL","wristL"],armR:["armR","elbowR","wristR"],legL:["legL","kneeL","ankleL","wheelL"],legR:["legR","kneeR","ankleR","wheelR"],weapon:["weapon","mechanism"]};
const demand=(yes,message)=>{if(!yes)errors.push(message);return !!yes;};
const close=(a,b,tolerance=1e-5)=>a.length===b.length&&a.every((v,i)=>Number.isFinite(v)&&Math.abs(v-b[i])<=tolerance);
const digest=buffer=>crypto.createHash("sha256").update(buffer).digest("hex");
const files=new Map();
function readGlb(name,expectedHash){
  if(!/^[\w.-]+\.glb$/.test(name))throw Error(`Unsafe local GLB name: ${name}`);
  if(files.has(name)){demand(files.get(name).hash===expectedHash,`${name}: conflicting manifest hash`);return files.get(name);}
  const bytes=fs.readFileSync(path.join(folder,name));
  demand(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2,`${name}: GLB v2 header`);
  demand(bytes.readUInt32LE(8)===bytes.length,`${name}: exact declared byte length`);
  let json,bin;
  for(let offset=12;offset<bytes.length;){const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(offset+8+length>bytes.length)throw Error(`${name}: truncated chunk`);if(type===0x4e4f534a)json=JSON.parse(bytes.toString("utf8",offset+8,offset+8+length));if(type===0x004e4942)bin=bytes.subarray(offset+8,offset+8+length);offset+=8+length;}
  if(!json||!bin)throw Error(`${name}: embedded JSON and binary are required`);
  const hash=digest(bytes);demand(typeof expectedHash==="string"&&/^[0-9a-f]{64}$/.test(expectedHash)&&hash===expectedHash,`${name}: SHA256 matches manifest`);
  demand((json.buffers??[]).every(b=>!b.uri),`${name}: no external buffers`);
  demand((json.images??[]).every(i=>i.bufferView!=null&&!i.uri),`${name}: no external image requests`);
  const parents=new Map();(json.nodes??[]).forEach((n,i)=>(n.children??[]).forEach(c=>{demand(!parents.has(c),`${name}: node has one parent`);parents.set(c,i);}));
  const worlds=new Map();
  const world=(i,seen=new Set())=>{if(worlds.has(i))return worlds.get(i);if(seen.has(i))throw Error(`${name}: cyclic scene graph`);seen.add(i);const n=json.nodes[i];if(!n)throw Error(`${name}: missing node ${i}`);const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));const result=parents.has(i)?world(parents.get(i),seen).clone().multiply(local):local;worlds.set(i,result);return result;};
  const accessor=index=>{
    const a=json.accessors[index],v=json.bufferViews[a?.bufferView];if(!a||!v||a.sparse)throw Error(`${name}: unsupported accessor ${index}`);
    const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},components=sizes[a.type];
    const getters={5120:[1,"readInt8",127],5121:[1,"readUInt8",255],5122:[2,"readInt16LE",32767],5123:[2,"readUInt16LE",65535],5125:[4,"readUInt32LE",4294967295],5126:[4,"readFloatLE",1]};
    const spec=getters[a.componentType];if(!components||!spec)throw Error(`${name}: unsupported accessor format`);
    const [size,get,divisor]=spec,start=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??size*components,out=[];
    if(start+(a.count-1)*stride+size*components>bin.length)throw Error(`${name}: accessor exceeds binary buffer`);
    for(let i=0;i<a.count;i++)for(let c=0;c<components;c++){const raw=bin[get](start+i*stride+c*size);out.push(a.normalized?Math.max(-1,raw/divisor):raw);}return out;
  };
  const skin=(json.skins??[]).map(s=>({names:s.joints.map(i=>json.nodes[i]?.name),inverse:accessor(s.inverseBindMatrices)}));
  const active=new Set();const visit=i=>{if(active.has(i))return;active.add(i);for(const c of json.nodes[i]?.children??[])visit(c);};
  for(const i of json.scenes?.[json.scene??0]?.nodes??[])visit(i);
  let triangles=0,draws=0;const usedMaterials=new Set(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],usedJoints=new Set();
  for(const i of active){const node=json.nodes[i];if(node.mesh==null)continue;
    demand(node.skin!=null,`${name}: every displayed module mesh is skinned`);
    for(const primitive of json.meshes[node.mesh].primitives){
      demand((primitive.mode??4)===4,`${name}: triangle primitives only`);
      const pos=accessor(primitive.attributes.POSITION),indices=primitive.indices==null?pos.length/3:json.accessors[primitive.indices].count;
      triangles+=indices/3;draws++;
      const material=json.materials?.[primitive.material];if(material?.name)usedMaterials.add(material.name);else demand(false,`${name}: named material on every draw`);
      demand(primitive.attributes.NORMAL!=null,`${name}: vertex normals`);
      const point=new Vector3();for(let p=0;p<pos.length;p+=3){point.fromArray(pos,p).applyMatrix4(world(i));for(let axis=0;axis<3;axis++){const v=point.getComponent(axis);if(!Number.isFinite(v))throw Error(`${name}: non-finite vertex`);min[axis]=Math.min(min[axis],v);max[axis]=Math.max(max[axis],v);}}
      if(primitive.attributes.JOINTS_0==null||primitive.attributes.WEIGHTS_0==null){demand(false,`${name}: weighted independent module`);continue;}
      const joints=accessor(primitive.attributes.JOINTS_0),weights=accessor(primitive.attributes.WEIGHTS_0),names=skin[node.skin]?.names??[];
      demand(joints.length===weights.length,`${name}: matching joint/weight lengths`);
      for(let j=0;j<joints.length;j+=4){let sum=0;for(let c=0;c<4;c++){const weight=weights[j+c];sum+=weight;if(weight>1e-6){const bone=names[joints[j+c]];if(!bone)throw Error(`${name}: invalid bone index`);usedJoints.add(bone);}}demand(Math.abs(sum-1)<.002,`${name}: normalized skin weights at vertex ${j/4}`);}
    }
  }
  const result={name,hash,json,skin,world,accessor,triangles,draws,usedMaterials:Array.from(usedMaterials).sort(),usedJoints:Array.from(usedJoints).sort(),min,max};files.set(name,result);return result;
}
function markerWorld(file,marker,label){
  if(!marker||typeof marker.bone!=="string"||!Array.isArray(marker.point)||marker.point.length!==3||!marker.point.every(Number.isFinite)){demand(false,`${label}: explicit bone-local marker`);return [NaN,NaN,NaN];}
  const index=file.json.nodes.findIndex(n=>n.name===marker.bone);if(index<0){demand(false,`${label}: known marker bone`);return [NaN,NaN,NaN];}
  return new Vector3(...marker.point).applyMatrix4(file.world(index)).toArray();
}
function checkSkin(file,canonical){
  demand(file.skin.length>0,`${file.name}: skeleton present`);
  for(const skin of file.skin){demand(JSON.stringify(skin.names)===JSON.stringify(canonical.names),`${file.name}: canonical joint names and order`);demand(skin.inverse.length===canonical.inverse.length&&skin.inverse.every((v,i)=>Number.isFinite(v)&&v===canonical.inverse[i]),`${file.name}: identical canonical inverse binds`);}
}

function main(){
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,"manifest.json"),"utf8"));
  demand(manifest.version==="toy-rig-v1", "manifest: supported rig version");
  demand(manifest.coordinates?.up==="+Y"&&manifest.coordinates?.front==="+Z", "manifest: shared coordinate system");
  const canonical=readGlb(manifest.motion,manifest.motionSha256),canonicalSkin=canonical.skin[0];
  if(!canonicalSkin)throw Error("Canonical motion has no skeleton");
  demand(canonicalSkin.names.length<=32,"canonical: at most 32 bones");
  for(const [bone,position] of Object.entries(manifest.rest)){const index=canonical.json.nodes.findIndex(n=>n.name===bone);demand(index>=0&&close(new Vector3().setFromMatrixPosition(canonical.world(index)).toArray(),position),`${bone}: declared rest point agrees with GLB`);}
  const variants=[];
  for(const [id,part] of Object.entries(manifest.parts)){
    const expected=part.slot==="arms"?["armL","armR"]:part.slot==="legs"?["legL","legR"]:[part.slot];
    demand(JSON.stringify(part.variants.map(v=>v.socket).sort())===JSON.stringify(expected.sort()),`${id}: independently selectable required sockets`);
    for(const entry of part.variants){
      demand(sockets.includes(entry.socket)&&slotOf[entry.socket]===part.slot,`${id}: compatible module kind`);
      const fight=readGlb(entry.file,entry.sha256),inspection=readGlb(entry.inspection,entry.inspectionSha256);
      for(const model of [fight,inspection]){
        checkSkin(model,canonicalSkin);
        demand(model.triangles>0&&Number.isInteger(model.triangles),`${model.name}: real triangle geometry`);
        demand(model.usedJoints.every(j=>influences[entry.socket]?.includes(j)),`${model.name}: weights only move this module's joints (${model.usedJoints.join(",")})`);
      }
      demand(entry.triangles===fight.triangles,`${entry.file}: triangle declaration matches bytes`);
      demand(JSON.stringify((entry.materialRegions??[]).slice().sort())===JSON.stringify(inspection.usedMaterials),`${entry.file}: materialRegions match actual inspection materials`);
      demand(entry.attachment?.bone===entry.socket&&close(entry.attachment?.point??[],[0,0,0]),`${entry.file}: one canonical attachment`);
      const anchor=markerWorld(fight,entry.attachment,entry.file+" attachment");
      demand(close(anchor,manifest.rest[entry.socket]),`${entry.file}: attachment meets declared socket`);
      const markers={};for(const [key,value] of Object.entries(entry.markers??{}))markers[key]=markerWorld(fight,value,`${entry.file} ${key}`);
      const need=part.slot==="head"?["neck"]:part.slot==="torso"?["shoulderL","shoulderR","hipL","hipR","neck","decal"]:part.slot==="arms"?["shoulder","hand"]:part.slot==="legs"?["hip","foot"]:["grip","workingSurface"];
      for(const key of need)demand(Array.isArray(markers[key]),`${entry.file}: ${key} marker exists`);
      if(part.slot==="legs")demand(Math.abs(fight.min[1]-(markers.foot?.[1]??NaN))<=.05,`${entry.file}: drawn foot supports the declared floor (min ${fight.min[1]})`);
      if(part.slot==="weapon")demand(close(entry.markers?.workingSurface?.point??[],entry.contact??[]),`${entry.file}: working surface agrees with contact point`);
      variants.push({id,slot:part.slot,entry,fight,inspection,markers});
    }
  }
  const at=socket=>variants.filter(v=>v.entry.socket===socket);
  for(const torso of at("torso")){
    for(const head of at("head"))demand(close(torso.markers.neck??[],head.markers.neck??[]),`${torso.id}/${head.id}: neck attachment aligns`);
    for(const socket of ["armL","armR","legL","legR"]){const key=(socket.startsWith("arm")?"shoulder":"hip")+socket.slice(-1),other=socket.startsWith("arm")?"shoulder":"hip";for(const part of at(socket))demand(close(torso.markers[key]??[],part.markers[other]??[]),`${torso.id}/${part.id}/${socket}: attachment aligns`);}
  }
  const hands=at("armR"),weapons=at("weapon"),leftLegs=at("legL"),rightLegs=at("legR");
  demand(hands.length>=4&&weapons.length>=4,"pilot: at least four hands and four weapons");
  let handPairs=0,legPairs=0;
  for(const hand of hands)for(const weapon of weapons){handPairs++;demand(close(hand.markers.hand??[],weapon.markers.grip??[]),`${hand.id}/${weapon.id}: hand and grip meet`);}
  for(const left of leftLegs)for(const right of rightLegs){legPairs++;demand(close([(left.markers.hip?.[1]??NaN)-(left.markers.foot?.[1]??NaN)],[(right.markers.hip?.[1]??NaN)-(right.markers.foot?.[1]??NaN)]),`${left.id}/${right.id}: equal hip support height`);demand(close([left.markers.foot?.[1]??NaN],[right.markers.foot?.[1]??NaN]),`${left.id}/${right.id}: both feet meet the floor`);}
  // Additive per-module maxima prove every combination, without sampling.
  const counts=Object.fromEntries(sockets.map(s=>[s,at(s).length]));
  const combinations=Object.values(counts).reduce((n,v)=>n*v,1);
  const worstTriangles=2+sockets.reduce((n,s)=>n+Math.max(...at(s).map(v=>v.fight.triangles)),0);
  const worstMainDraws=1+sockets.reduce((n,s)=>n+Math.max(...at(s).map(v=>v.fight.draws)),0);
  demand(combinations>0,"pilot: all seven sockets have choices");
  demand(worstTriangles<=12000,`all combinations: ${worstTriangles} triangles including one plate <= 12000`);
  demand(worstMainDraws<=28,`all combinations: ${worstMainDraws} main draws including one plate <= 28`);
  return {schema:"bots.pilot.assets.v1",ok:errors.length===0,manifestVersion:manifest.version,files:files.size,parts:Object.keys(manifest.parts).length,variants:variants.length,bones:canonicalSkin.names.length,clips:canonical.json.animations?.length??0,counts,handWeaponPairs:handPairs,legPairs,combinations,worstTriangles,worstMainDraws,errors,warnings,evidence:"Static GLB bytes, attachment markers, independent skin weights, and additive main-pass budgets. GPU appearance and animation quality need browser review."};
}
let report;
try{report=main();}catch(error){errors.push(error instanceof Error?error.message:String(error));report={schema:"bots.pilot.assets.v1",ok:false,errors,warnings};}
if(process.argv.includes("--json"))console.log(JSON.stringify(report,null,2));
else {console.log(report.ok?`PASS: ${report.files} GLBs; ${report.variants} independent modules; ${report.handWeaponPairs} hand/weapon and ${report.legPairs} leg pairings; all ${report.combinations.toLocaleString()} builds <= ${report.worstTriangles} triangles / ${report.worstMainDraws} main draws.`:`FAIL: ${errors.length} asset contract issues`);for(const error of errors)console.error(" - "+error);}
if(!report.ok)process.exitCode=1;
