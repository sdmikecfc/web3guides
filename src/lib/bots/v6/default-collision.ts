import { registerCollisionManifestV6, type AttachmentFrameV6, type AttachmentNameV6, type BodyCollisionV6, type CollisionManifestV6, type HitProxyV6, type WeaponProxyV6 } from "./collision";
import type { FamilyV6,StyleV6 } from "./types";
import type { Vec3 } from "./math";
import { WEAPONS_V6 } from "./weapons";
export const DEFAULT_COLLISION_VERSION_V6="mk6-collision-draft-1";
const families:Record<FamilyV6,StyleV6>={boiler_knight:"tank",scrapyard_bruiser:"tank",roller_daredevil:"speed",spring_duelist:"speed",owl_ranger:"ranged",clockwork_gunner:"ranged"};
function body(style:StyleV6,tier:number):BodyCollisionV6 {
  const size=[0,.79,.90,1,1.06][tier],height=(style==="tank"?2800:style==="speed"?2550:2650)*size,width=style==="tank"?1.12:style==="speed"?.86:1;
  const v=(x:number,y:number,z:number):Vec3=>[Math.round(x*size*width),Math.round(y*size),Math.round(z*size)];
  const frame=(x:number,y:number,z:number):AttachmentFrameV6=>({position:v(x,y,z),rotation:[0,0,0]});
  const mounts:Record<AttachmentNameV6,AttachmentFrameV6>={head:frame(0,2100,0),torso:frame(0,1200,0),armL:frame(-650,1950,0),armR:frame(650,1950,0),legL:frame(-330,1050,0),legR:frame(330,1050,0),handL:frame(-440,1450,110),handR:frame(440,1450,110),shoulderL:frame(-580,2110,-60),shoulderR:frame(580,2110,-60)};
  const capsule=(slot:HitProxyV6["slot"],a:Vec3,b:Vec3,radius:number):HitProxyV6=>{const r=Math.round(radius*size);return {slot,shape:"capsule",a,b,radius:r,center:a.map((n,i)=>(n+b[i])/2) as Vec3,half:a.map((n,i)=>Math.abs(n-b[i])/2+r) as Vec3};};
  return {height:Math.round(height),radius:Math.round((style==="tank"?745:style==="speed"?630:680)*size),mounts,proxies:[capsule("head",[0,Math.round(height-390*size),0],[0,Math.round(height-320*size),0],310),{slot:"torso",shape:"box",center:v(0,1510,0),half:v(520,470,360)},capsule("armL",v(-680,1860,0),v(-770,1190,170),205),capsule("armR",v(680,1860,0),v(770,1190,170),205),capsule("legL",v(-330,750,0),v(-330,245,55),220),capsule("legR",v(330,750,0),v(330,245,55),220)]};
}
const signatures:Record<string,WeaponProxyV6>={
  piledriver:{...WEAPONS_V6.hammer.proxy,strikePoint:[0,780,300],path:[{time:0,point:[800,2000,500],normal:[0,0,1]},{time:.3,point:[700,2950,100],normal:[0,0,1]},{time:.48,point:[550,2350,1150],normal:[0,-.77,.64]},{time:.62,point:[500,1500,1335],normal:[0,-.94,.342]},{time:.8,point:[650,1050,1000],normal:[0,-1,0]},{time:1,point:[800,1900,500],normal:[0,0,1]}]},
  powered_twins:{...WEAPONS_V6.paired_blades.proxy,strikeSegments:[{a:[65,180,0],b:[150,870,0],radius:30},{a:[150,870,0],b:[35,1090,0],radius:30}],strikePoint:[100,720,0],strikeNormal:[1,0,0],path:[{time:0,point:[620,1800,480],normal:[1,0,0]},{time:.28,point:[1030,2200,450],normal:[1,0,0]},{time:.47,point:[750,1780,1120],normal:[.25,0,.97]},{time:.6,point:[250,1460,1260],normal:[-.4,.1,.91]},{time:.78,point:[-300,1190,800],normal:[-.8,.15,.6]},{time:1,point:[620,1800,480],normal:[1,0,0]}]},
  shoulder_battery:{...WEAPONS_V6.shoulder_cannon.proxy,muzzle:[0,130,1290],backupMuzzle:[0,130,590],specialMuzzle:[0,120,450]},
};
/** Analytic rehearsal proxies only. Approved Blender exports register a different immutable version. */
export const DEFAULT_COLLISION_V6:Readonly<CollisionManifestV6>=registerCollisionManifestV6({version:DEFAULT_COLLISION_VERSION_V6,rigVersion:"mk6-rig-draft-1",units:"millimetres",bodies:Object.fromEntries(Object.entries(families).flatMap(([family,style])=>[1,2,3,4].map(tier=>[`${family}.t${tier}`,body(style,tier)]))),weapons:{...Object.fromEntries(Object.entries(WEAPONS_V6).map(([id,value])=>[id,value.proxy])),...signatures}});
