import { isPaintId,type Part,type Stats } from "@/app/bots/_engine/parts";
import { meanPart,type CombatBuild } from "@/lib/bots/combat-model";
import { ASSET_VERSION_V6,CATALOG_VERSION_V6,FAMILIES_V6,cardV6,specialInfoV6,weaponCompatibilityV6 } from "./catalog";
import { BODY_SOCKETS_V6,collisionManifestV6,footprintRadiusV6,type ArmRigV6,type CollisionSnapshotV6,type HitProxyV6 } from "./collision";
import "./default-collision";
import { CATALOGUE_COLLISION_VERSION_V6 } from "./catalogue-collision";
import { add,canonical,clamp,cloneV6,deepFreeze,hashV6,subtract,type Vec3 } from "./math";
import { defaultArmRigV6 } from "./pose";
import { WEAPONS_V6 } from "./weapons";
import type { AggregatesV6,BuildV6,CardV6,FamilyV6,PartV6,SocketV6,StatsV6,StyleV6,TierV6,WeaponDefinitionV6,WeaponKindV6 } from "./types";
export const SOCKETS_V6:readonly SocketV6[]=[...BODY_SOCKETS_V6,"weapon"];
export const socketKindV6=(socket:SocketV6)=>socket.startsWith("arm")?"arms":socket.startsWith("leg")?"legs":socket;
export function partAtV6(raw:CombatBuild|undefined,socket:SocketV6):Part|undefined {return socket==="armL"||socket==="armR"?raw?.limbs?.[socket]??raw?.arms:socket==="legL"||socket==="legR"?raw?.limbs?.[socket]??raw?.legs:raw?.[socket];}
function cardsOf(raw:CombatBuild):Partial<Record<SocketV6,CardV6>> {return Object.fromEntries(SOCKETS_V6.map(slot=>{const c=cardV6(partAtV6(raw,slot)?.id);return [slot,c?.slot===socketKindV6(slot)?c:undefined];}));}
export function gpV6(raw:CombatBuild):number{return Object.values(cardsOf(raw)).reduce((total,card)=>total+(card?.gp??0),0);}
/** Milliradians. Every accuracy point narrows the cone; current canonical totals span 0 to 24. */
export function aimErrorV6(accuracy:number):number{return Math.round(105000/(1+Math.max(0,accuracy)*.015))/1000;}
/** Same canonical aggregation is used for incomplete previews and complete simulation snapshots. */
export function statsV6(raw:CombatBuild):StatsV6 {
  const cards=cardsOf(raw),tuple=(slot:SocketV6):Stats=>cards[slot]?.s??[0,0,0],mean=(a:Stats,b:Stats):Stats=>a.map((n,i)=>(n+b[i])/2) as Stats;
  const head=tuple("head"),body=tuple("torso"),arms=mean(tuple("armL"),tuple("armR")),legs=mean(tuple("legL"),tuple("legR")),weapon=tuple("weapon");
  const a:AggregatesV6={speed:legs[0],str:legs[1]+arms[1]+body[1],dodge:legs[2]+head[1],dmg:arms[0]+weapon[0],block:arms[2],health:body[0],luck:body[2]+head[2],acc:head[0]+weapon[2],atkSpd:weapon[1]},gp=Object.values(cards).reduce((n,c)=>n+(c?.gp??0),0),bodyTotal=body.reduce((n,v)=>n+v,0)||1;
  const armour=BODY_SOCKETS_V6.map(slot=>{const c=cards[slot];if(!c)return 0;return Math.round((slot==="torso"?150+c.gp*2+a.health*4:slot==="head"?40+c.gp:45+c.gp*1.35+c.s[1])*1.8);});
  const plating=BODY_SOCKETS_V6.map(slot=>{const p=tuple(slot),total=p.reduce((n,v)=>n+v,0)||1;return cards[slot]?clamp(body[0]/bodyTotal*.24+p[1]/total*.08,0,.35):0;});
  const attackPoints=arms.reduce((n,v)=>n+v,0)+weapon.reduce((n,v)=>n+v,0),power=(.72+.28*((cards.weapon?.gp??0)/20+((cards.armL?.gp??0)+(cards.armR?.gp??0))/24)/2)*(.84+.32*a.dmg/Math.max(1,attackPoints));
  return {...a,gp,armour,plating,guard:8+a.block*2,movement:35+a.speed*1.5+legs[1]*.8,turnRate:75+Math.min(50,a.speed*3),aimError:aimErrorV6(a.acc),evasion:Math.min(45,8+a.dodge*1.1+a.speed*.35),force:a.dmg+a.str*.4,power,attackRate:1+a.atkSpd*.014,heatCapacity:100,cooling:34/60};
}
function shiftedProxy(proxy:HitProxyV6,offset:Vec3):HitProxyV6 {return {...cloneV6(proxy),center:add(proxy.center,offset),...(proxy.a?{a:add(proxy.a,offset)}:{}),...(proxy.b?{b:add(proxy.b,offset)}:{})};}
function collisionSnapshot(parts:Record<SocketV6,PartV6>,version:string):CollisionSnapshotV6 {
  const manifest=collisionManifestV6(version),body=manifest.bodies[parts.torso.collisionKey];if(!body)throw new Error("The chosen body's collision data is not installed.");
  const proxies=BODY_SOCKETS_V6.map(slot=>{const origin=manifest.bodies[parts[slot].collisionKey],proxy=origin?.proxies.find(p=>p.slot===slot);if(!origin||!proxy)throw new Error(`The ${slot} collision data is not installed.`);return shiftedProxy(proxy,subtract(body.mounts[slot].position,origin.mounts[slot].position));});
  const arms=Object.fromEntries((["left","right"] as const).map(side=>{const slot=side==="left"?"armL":"armR",part=parts[slot],origin=manifest.bodies[part.collisionKey],proxy=proxies.find(p=>p.slot===slot)!;return [side,cloneV6(origin.arms?.[side]??defaultArmRigV6(side,part.tier===1?.79:part.tier===2?.9:part.tier===4?1.06:1,proxy.radius??Math.min(...proxy.half)))];})) as Record<"left"|"right",ArmRigV6>;
  const weaponKey=parts.weapon.signature??parts.weapon.collisionKey,authoredTier=manifest.weapons[`${weaponKey}.t${parts.weapon.tier}`],weapon=authoredTier??manifest.weapons[weaponKey]??manifest.weapons[parts.weapon.collisionKey];if(!weapon)throw new Error("The weapon's collision data is not installed.");
  const scaled=cloneV6(weapon);if(!authoredTier){const size=parts.weapon.tier===1?.79:parts.weapon.tier===2?.9:parts.weapon.tier===4?1.06:1,vector=(v:Vec3)=>v.map(n=>Math.round(n*size)) as Vec3;scaled.grip=vector(scaled.grip);scaled.muzzle=vector(scaled.muzzle);scaled.strikePoint=vector(scaled.strikePoint);scaled.radius*=size;if(scaled.offhandGrip)scaled.offhandGrip=vector(scaled.offhandGrip);if(scaled.backupMuzzle)scaled.backupMuzzle=vector(scaled.backupMuzzle);scaled.path=scaled.path.map(key=>({...key,point:vector(key.point)}));if(scaled.strikeSegments)scaled.strikeSegments=scaled.strikeSegments.map(e=>({a:vector(e.a),b:vector(e.b),radius:e.radius*size}));}
  const bodySize=parts.torso.tier===1?.79:parts.torso.tier===2?.9:parts.torso.tier===4?1.06:1,bodyVector=(v:Vec3)=>v.map(n=>Math.round(n*bodySize)) as Vec3;
  const specialMuzzle=cloneV6(body.specialMuzzle??bodyVector([0,120,450]));
  const specialBlade=cloneV6(body.specialBlade??WEAPONS_V6.sword.proxy);
  if(!body.specialBlade){specialBlade.strikeSegments=[{a:bodyVector([0,180,0]),b:bodyVector([0,720,0]),radius:30*bodySize},{a:bodyVector([0,720,0]),b:bodyVector([-80,850,0]),radius:30*bodySize}];specialBlade.grip=bodyVector(specialBlade.grip);specialBlade.strikePoint=bodyVector(specialBlade.strikePoint);specialBlade.muzzle=bodyVector(specialBlade.muzzle);specialBlade.radius*=bodySize;specialBlade.path=specialBlade.path.map(key=>({...key,point:bodyVector(key.point)}));}
  return {version,rigVersion:manifest.rigVersion,manifestHash:hashV6(manifest),radius:Math.max(body.radius,footprintRadiusV6(proxies)),height:body.height,floorY:Math.min(...body.proxies.map(p=>p.shape==="capsule"?Math.min(p.a![1],p.b![1])-p.radius!:p.center[1]-p.half[1])),proxies,arms,mounts:cloneV6(body.mounts),weapon:scaled,specialMuzzle,specialBlade};
}
export function snapshotBuildV6(raw:CombatBuild,options:{collisionVersion?:string}={}):BuildV6 {
  if(!raw||typeof raw!=="object")throw new Error("Choose the seven robot parts.");
  const parts=Object.fromEntries(SOCKETS_V6.map(socket=>{const source=partAtV6(raw,socket),card=cardV6(source?.id);if(!source||!card||card.slot!==socketKindV6(socket)||!Array.isArray(source.s)||source.s.length!==3||source.s.some((n,i)=>n!==card.s[i])||source.paint!==undefined&&!isPaintId(source.paint))throw new Error(`Choose a valid ${socket} part.`);return [socket,{...cloneV6(card),socket,...(source.paint?{paint:source.paint}:{})}];})) as Record<SocketV6,PartV6>;
  const allowed=weaponCompatibilityV6(parts.weapon.id,parts.torso.id);if(!allowed.compatible)throw new Error(allowed.reason!);
  const compact=(socket:SocketV6):Part=>({id:parts[socket].id,s:[...parts[socket].s] as Stats,...(parts[socket].paint?{paint:parts[socket].paint}:{})});
  const limbs={armL:compact("armL"),armR:compact("armR"),legL:compact("legL"),legR:compact("legR")};
  const appearanceBuild:CombatBuild={head:compact("head"),torso:compact("torso"),weapon:compact("weapon"),limbs,arms:meanPart(limbs.armL,limbs.armR),legs:meanPart(limbs.legL,limbs.legR)};
  const body=parts.torso,collisionVersion=options.collisionVersion??CATALOGUE_COLLISION_VERSION_V6,collision=collisionSnapshot(parts,collisionVersion),definition:WeaponDefinitionV6=cloneV6(WEAPONS_V6[parts.weapon.weaponKind!]);definition.proxy=cloneV6(collision.weapon);definition.minimumRange*=parts.weapon.tier===1?.79:parts.weapon.tier===2?.9:parts.weapon.tier===4?1.06:1;
  
  if(definition.id==="ap_rifle"&&parts.weapon.tier===1)definition.damage*=29.5/29*28/27;
  if(definition.id==="sword")definition.damage*=parts.weapon.tier===1?25.5/24:parts.weapon.tier===2?25/24:parts.weapon.tier===3?26/24:1;
  if(definition.id==="hammer")definition.damage*=[0,30.5,31,33,34][parts.weapon.tier]/32;
  if(parts.weapon.signature==="piledriver"){definition.damage*=1.40;definition.recovery+=16;definition.impulse+=80;}else if(parts.weapon.signature==="powered_twins"){definition.damage=25*(parts.weapon.tier===4?.91:.94);definition.windup=17;definition.active=10;definition.recovery=18;}else if(parts.weapon.signature==="shoulder_battery"){definition.damage=47*1.1;definition.recovery=86;}
  const stats=statsV6(appearanceBuild);
  return deepFreeze({version:6,rulesVersion:"mk6-2",catalogVersion:CATALOG_VERSION_V6,assetVersion:ASSET_VERSION_V6,collisionVersion,appearanceBuild,parts,gp:stats.gp,style:body.style,tier:body.tier,stats,collision,capabilities:{special:specialInfoV6(body.style),tier3:body.tier>=3,weapon:definition.id,paired:definition.paired,mount:definition.mount,signature:parts.weapon.signature??null,weaponDefinition:definition}} as BuildV6);
}
export function validBuildV6(value:unknown):value is BuildV6 {try{const b=value as BuildV6;return b?.version===6&&JSON.stringify(canonical(b))===JSON.stringify(canonical(snapshotBuildV6(b.appearanceBuild,{collisionVersion:b.collisionVersion})));}catch{return false;}}
export function presetV6(style:StyleV6,tier:TierV6=1,options:{family?:FamilyV6;weapon?:WeaponKindV6;signature?:boolean;collisionVersion?:string}={}):BuildV6 {
  const family=options.family??FAMILIES_V6.find(f=>f.style===style)?.id;if(!family||!FAMILIES_V6.some(f=>f.id===family&&f.style===style))throw new Error("Choose one of the six robot families.");
  const get=(slot:string):Part=>{const id=slot==="weapon"?options.signature?`mk6.t${tier}.signature.${style==="tank"?"piledriver":style==="speed"?"powered_twins":"shoulder_battery"}`:`mk6.t${tier}.weapon.${options.weapon??(style==="tank"?"hammer":style==="speed"?"sword":"ap_rifle")}`:`mk6.t${tier}.${family}.${slot}`,card=cardV6(id);if(!card)throw new Error("This weapon is not available at that tier.");return {id,s:[...card.s] as Stats};};
  return snapshotBuildV6({head:get("head"),torso:get("torso"),arms:get("arms"),legs:get("legs"),weapon:get("weapon")},{collisionVersion:options.collisionVersion});
}
