import type { Stats } from "@/app/bots/_engine/parts";
import { deepFreeze } from "./math";
import { WEAPON_KINDS_V6,WEAPONS_V6 } from "./weapons";
import type { CardV6,FamilyInfoV6,FamilyV6,SlotV6,SpecialInfoV6,StyleV6,TierV6,WeaponKindV6 } from "./types";
export const CATALOG_VERSION_V6="mk6-catalog-1" as const;
export const ASSET_VERSION_V6="mk6-art-1";
export const STYLES_V6:readonly StyleV6[]=deepFreeze(["tank","speed","ranged"]);
export const GP_TIERS_V6=deepFreeze([100,200,350,500] as const);
export const BUILD_PRICES_V6=deepFreeze([250,750,2000,5000] as const);
export const FAMILIES_V6:readonly FamilyInfoV6[]=deepFreeze([
  {id:"boiler_knight",name:"Boiler knight",style:"tank",description:"A broad armoured toy with a brave face and planted feet."},
  {id:"scrapyard_bruiser",name:"Scrapyard bruiser",style:"tank",description:"A chunky patchwork fighter built to take hard hits."},
  {id:"roller_daredevil",name:"Roller daredevil",style:"speed",description:"A narrow, cocky racer on quick wheels."},
  {id:"spring_duelist",name:"Spring-legged duelist",style:"speed",description:"An expressive blade fighter with spring-loaded legs."},
  {id:"owl_ranger",name:"Owl-eyed ranger",style:"ranged",description:"A steady sharpshooter with large focusing lenses."},
  {id:"clockwork_gunner",name:"Clockwork gunner",style:"ranged",description:"A patient shooter with precise aiming mechanisms."},
]);
export function specialInfoV6(style:StyleV6):SpecialInfoV6 {return {id:style,name:style==="tank"?"Energy Shield":style==="speed"?"Overdrive":"Slow Field",durationSeconds:5,unlockTier:3,description:style==="tank"?"Block 90% of damage for 5 seconds, up to 35% of starting body durability.":style==="speed"?"Move 50% faster, attack 20% faster, hit 25% harder and gain 15 points of dodge chance for 5 seconds.":"Slow the rival's movement, turning and attacks by 30% for 5 seconds.",ending:style==="tank"?"A tier 3 body ends with a charge if its shield survives.":style==="speed"?"A tier 3 body ends with a flank attack. A rear hit can finish a limb below 25% durability.":"A tier 3 body ends with a burst from both arms, capped at two rifle hits."};}
const profiles:Record<FamilyV6,Record<Exclude<SlotV6,"weapon">,Stats>>={
  boiler_knight:{head:[0,1,2],torso:[2,1,0],arms:[0,2,1],legs:[0,2,1]},
  scrapyard_bruiser:{head:[1,0,2],torso:[2,0,1],arms:[1,2,0],legs:[1,2,0]},
  roller_daredevil:{head:[1,2,0],torso:[1,0,2],arms:[2,0,1],legs:[2,0,1]},
  spring_duelist:{head:[0,2,1],torso:[0,1,2],arms:[2,1,0],legs:[2,1,0]},
  owl_ranger:{head:[2,0,1],torso:[1,2,0],arms:[1,0,2],legs:[1,0,2]},
  clockwork_gunner:{head:[2,1,0],torso:[0,2,1],arms:[0,1,2],legs:[0,1,2]},
};
const gpWeight:Record<SlotV6,number>={head:.08,torso:.24,arms:.12,legs:.12,weapon:.20},priceWeight:Record<SlotV6,number>={head:.2,torso:.2,arms:.1,legs:.1,weapon:.2};
const title:Record<SlotV6,string>={head:"head",torso:"body",arms:"arm",legs:"leg",weapon:"weapon"};
function tuple(base:Stats,tier:TierV6):Stats {const total=[0,3,7,12,18][tier],out=base.map(n=>Math.floor(n*total/3)) as Stats;let remaining=total-out.reduce((n,v)=>n+v,0);const order=[0,1,2].sort((a,b)=>base[b]-base[a]||a-b);for(let n=0;remaining>0;n++,remaining--)out[order[n%3]]++;return out;}
const weaponStyle=(kind:WeaponKindV6):StyleV6=>["hammer","shotgun_wide"].includes(kind)?"tank":["sword","paired_blades","shock_blade","flame_sword"].includes(kind)?"speed":"ranged";
const weaponTuple=(kind:WeaponKindV6):Stats=>kind==="hammer"?[2,0,1]:["sword","paired_blades","shock_blade"].includes(kind)?[1,2,0]:kind==="ap_rifle"?[1,0,2]:kind==="flamethrower"?[1,1,1]:[2,1,0];
const cards:CardV6[]=[];
for(const tier of [1,2,3,4] as const){
  for(const family of FAMILIES_V6)for(const slot of ["head","torso","arms","legs"] as const)cards.push({id:`mk6.t${tier}.${family.id}.${slot}`,slot,tier,s:tuple(profiles[family.id][slot],tier),name:`${family.name} ${title[slot]}`,gp:Math.round(GP_TIERS_V6[tier-1]*gpWeight[slot]),price:Math.round(BUILD_PRICES_V6[tier-1]*priceWeight[slot]),style:family.style,family:family.id,artKey:`mk6/${family.id}/t${tier}/${slot}`,assetVersion:ASSET_VERSION_V6,collisionKey:`${family.id}.t${tier}`,visualReady:false,lore:slot==="torso"?"The body chooses your special. Mix the other parts to make it yours.":family.description,...(slot==="torso"?{special:specialInfoV6(family.style)}:{})});
  for(const kind of WEAPON_KINDS_V6){if(tier===1&&!["hammer","sword","ap_rifle"].includes(kind)||tier<3&&kind==="shoulder_cannon")continue;const definition=WEAPONS_V6[kind];cards.push({id:`mk6.t${tier}.weapon.${kind}`,slot:"weapon",tier,s:tuple(weaponTuple(kind),tier),name:tier===1&&kind==="ap_rifle"?"Starter rifle":definition.name,gp:Math.round(GP_TIERS_V6[tier-1]*.2),price:Math.round(BUILD_PRICES_V6[tier-1]*.2),style:weaponStyle(kind),family:null,weaponKind:kind,...(kind==="shoulder_cannon"?{signatureStyle:"ranged" as const}:{}),artKey:`mk6/weapons/t${tier}/${kind}`,assetVersion:ASSET_VERSION_V6,collisionKey:kind,visualReady:false,lore:definition.description});}
  if(tier>=3)for(const [signature,style,kind,name] of [["piledriver","tank","hammer","Knight's piledriver"],["powered_twins","speed","paired_blades","Powered twin blades"],["shoulder_battery","ranged","shoulder_cannon","Gunner's shoulder battery"]] as const){const base=cards.find(c=>c.id===`mk6.t${tier}.weapon.${kind}`)!;cards.push({...base,id:`mk6.t${tier}.signature.${signature}`,name,style,signature,signatureStyle:style,artKey:`mk6/signatures/t${tier}/${signature}`,lore:`A signature kit for a tier 3 or 4 ${style==="tank"?"Tank":style==="speed"?"Speed":"Ranged"} body. ${base.lore}`});}
}
export const CATALOG_V6:readonly CardV6[]=deepFreeze(cards);
export const V6_CATALOG=CATALOG_V6;
export const STARTER_CARDS_V6:readonly CardV6[]=deepFreeze(CATALOG_V6.filter(c=>c.tier===1));
const index:Readonly<Record<string,CardV6>>=deepFreeze(Object.fromEntries(CATALOG_V6.map(c=>[c.id,c])));
export function cardV6(id:string|undefined):CardV6|undefined{return id?index[id]:undefined;}
export function weaponCompatibilityV6(weaponId:string,bodyId:string|undefined):{compatible:boolean;reason:string|null}{const weapon=cardV6(weaponId),body=cardV6(bodyId);if(!weapon||weapon.slot!=="weapon")return {compatible:false,reason:"Choose a weapon."};if(!weapon.signatureStyle)return {compatible:true,reason:null};const okay=!!body&&body.slot==="torso"&&body.tier>=3&&body.style===weapon.signatureStyle;return {compatible:okay,reason:okay?null:`This signature kit needs a tier 3 or 4 ${weapon.signatureStyle==="tank"?"Tank":weapon.signatureStyle==="speed"?"Speed":"Ranged"} body.`};}
export function compatibleWeaponsV6(bodyId:string|undefined):readonly CardV6[]{return CATALOG_V6.filter(c=>c.slot==="weapon"&&weaponCompatibilityV6(c.id,bodyId).compatible);}
