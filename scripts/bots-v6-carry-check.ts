import assert from 'node:assert/strict';
import {presetV6,cloneV6,FAMILIES_V6,weaponGripPoseV6,sampleWeaponPathV6,subtract,length3,rotateQuatV6,dotV6,cardV6,type Vec3,type WeaponKindV6} from '../src/lib/bots/v6';
let groups=0,samples=0;const check=(name:string,run:()=>void)=>{run();console.log(`PASS ${name}`);groups++;};
check('fitted hammer carry and complete swing stay reachable on every matched family/tier',()=>{
 for(const family of FAMILIES_V6)for(const tier of [1,2,3,4] as const)for(const signature of [false,true]){
  if(signature&&(family.style!=='tank'||tier<3))continue;const b=presetV6(family.style,tier,{family:family.id,weapon:'hammer',signature}),w=b.collision.weapon;assert(w.path.every(k=>k.roll===0));
  for(const side of ['left','right'] as const){const idle=weaponGripPoseV6(b.collision,w,side,sampleWeaponPathV6(w,0,side)),end=weaponGripPoseV6(b.collision,w,side,sampleWeaponPathV6(w,1,side));assert(length3(subtract(idle.grip,end.grip))<.001);assert(idle.grip[1]<idle.shoulder[1]-200);for(const height of [1100,1500,1900,2500])for(let n=0;n<=200;n++){samples++;assert(weaponGripPoseV6(b.collision,w,side,sampleWeaponPathV6(w,n/200,side,height)).gripError<1);}}
 }
});
check('upright blade carry leaves contact poses unchanged and has no opposite-normal jump',()=>{
 for(const family of FAMILIES_V6)for(const tier of [1,2,3,4] as const)for(const kind of ['sword','paired_blades','shock_blade','flame_sword','powered_twins'] as const){
  const signature=kind==='powered_twins';if(signature&&(family.style!=='speed'||tier<3)||!signature&&!cardV6(`mk6.t${tier}.weapon.${kind}`))continue;
  const b=presetV6(family.style,tier,{family:family.id,weapon:signature?'sword':kind as WeaponKindV6,signature}),w=b.collision.weapon,plain=cloneV6(w);plain.path.forEach(k=>{delete k.up;});assert(w.path[0].up&&w.path.at(-1)!.up);
  for(const side of ['left','right'] as const){const idle=weaponGripPoseV6(b.collision,w,side,sampleWeaponPathV6(w,0,side)),end=weaponGripPoseV6(b.collision,w,side,sampleWeaponPathV6(w,1,side));assert(idle.grip[1]<idle.shoulder[1]-180);assert(dotV6(rotateQuatV6([0,1,0],idle.orientation),[0,1,0])>.999);assert(length3(subtract(idle.grip,end.grip))<.001);let prior:Vec3|null=null;
   for(let n=0;n<=1000;n++){samples++;const t=n/1000,p=weaponGripPoseV6(b.collision,w,side,sampleWeaponPathV6(w,t,side,1500));if(prior)assert(length3(subtract(prior,p.grip))<50,`${family.id} T${tier} ${kind} carry jumps at ${t}`);prior=p.grip;if(t>=w.active[0]&&t<=w.active[1]){const baseline=weaponGripPoseV6(b.collision,plain,side,sampleWeaponPathV6(plain,t,side,1500));assert(length3(subtract(p.grip,baseline.grip))<.001);assert(length3(subtract(p.strikePoint,baseline.strikePoint))<.001);}}
  }
 }
});
console.log(JSON.stringify({ok:true,groups,samples}));
