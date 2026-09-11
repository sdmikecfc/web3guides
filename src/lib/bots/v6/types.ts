import type { CombatBuild } from "@/lib/bots/combat-model";
import type { PaintId, Stats } from "@/app/bots/_engine/parts";
import type { BodySocketV6, CollisionSnapshotV6, WeaponProxyV6 } from "./collision";
import type { Vec3 } from "./math";
export type { Vec3, BodySocketV6 };
export type TierV6=1|2|3|4;
export type SideV6=0|1;
export type StyleV6="tank"|"speed"|"ranged";
export type FamilyV6="boiler_knight"|"scrapyard_bruiser"|"roller_daredevil"|"spring_duelist"|"owl_ranger"|"clockwork_gunner";
export type SlotV6="head"|"torso"|"arms"|"legs"|"weapon";
export type SocketV6=BodySocketV6|"weapon";
export type DefensePlanV6="early"|"balanced"|"last-stand";
export type WeaponKindV6="hammer"|"sword"|"paired_blades"|"ap_rifle"|"shotgun_tight"|"shotgun_wide"|"shock_blade"|"flame_sword"|"flamethrower"|"shoulder_cannon";
export type AttackKindV6=WeaponKindV6|"punch"|"shove"|"backup_pistol"|"special_charge"|"special_flank"|"special_burst";
export type MountV6="left"|"right"|"shoulder";
export interface SpecialInfoV6 {id:StyleV6;name:string;description:string;durationSeconds:5;ending:string;unlockTier:3}
export interface FamilyInfoV6 {id:FamilyV6;name:string;style:StyleV6;description:string}
export interface CardV6 {
  id:string;slot:SlotV6;tier:TierV6;s:Stats;name:string;price:number;gp:number;
  style:StyleV6;family:FamilyV6|null;artKey:string;assetVersion:string;collisionKey:string;visualReady:boolean;
  lore:string;weaponKind?:WeaponKindV6;signatureStyle?:StyleV6;signature?:"piledriver"|"powered_twins"|"shoulder_battery";special?:SpecialInfoV6;
}
export interface PartV6 extends CardV6 {socket:SocketV6;paint?:PaintId}
export interface AggregatesV6 {speed:number;str:number;dodge:number;dmg:number;block:number;health:number;luck:number;acc:number;atkSpd:number}
export interface StatsV6 extends AggregatesV6 {
  gp:number;armour:number[];plating:number[];guard:number;movement:number;turnRate:number;aimError:number;evasion:number;force:number;power:number;attackRate:number;heatCapacity:number;cooling:number;
}
export interface WeaponDefinitionV6 {
  id:WeaponKindV6;name:string;description:string;range:number;minimumRange:number;windup:number;active:number;recovery:number;damage:number;
  mount:MountV6;paired:boolean;projectile:boolean;pellets:number;spread:number;projectileSpeed:number;projectileRadius:number;platingBypass:number;
  heat:number;burn:number;shock:number;impulse:number;proxy:WeaponProxyV6;
}
export interface BuildV6 {
  version:6;rulesVersion:"mk6-1";catalogVersion:"mk6-catalog-1";assetVersion:string;collisionVersion:string;
  appearanceBuild:CombatBuild;parts:Record<SocketV6,PartV6>;gp:number;style:StyleV6;tier:TierV6;
  stats:StatsV6;collision:CollisionSnapshotV6;
  capabilities:{special:SpecialInfoV6;tier3:boolean;weapon:WeaponKindV6;paired:boolean;mount:MountV6;signature:string|null;weaponDefinition:WeaponDefinitionV6};
}
export interface ActionV6 {
  id:number;kind:AttackKindV6;mount:MountV6;started:number;windup:number;active:number;recovery:number;
  released:boolean;hitTargets:BodySocketV6[];targetHeight:number;aim:Vec3;aimLocal:Vec3;aimVelocity:Vec3;aimError:Vec3;lastPoint:Vec3|null;nextPulse:number;
  special?:"charge"|"flank"|"burst";interrupted?:boolean;slowed?:boolean;burstBudget:number;critical:boolean;emissions:number;pathActive:[number,number];
}
export interface SpecialV6 {style:StyleV6;started:number;until:number;shieldLeft:number;finisherUsed:boolean;burstBudget:number}
export interface BurnV6 {by:SideV6;until:number;nextTick:number;damage:number;slot:BodySocketV6;attackId:number}
export interface FighterV6 {
  x:number;z:number;yaw:number;moveX:number;moveZ:number;arenaLimit:number;armour:number[];guard:number;heat:number;overheated:boolean;
  action:ActionV6|null;special:SpecialV6|null;meter:number;damageMeter:number;dealt:number;shots:number;
  stunnedUntil:number;downUntil:number;immuneUntil:number;slowUntil:number;shock:number;shockDecayAt:number;burn:BurnV6|null;
  dodgeUntil:number;nextDodge:number;dashUntil:number;dashX:number;dashZ:number;pushUntil:number;pushX:number;pushZ:number;
  nextAction:number;nextShove:number;nextMount:MountV6;lastThreat:number;
}
export type EventKindV6="start"|"windup"|"shot"|"hit"|"block"|"miss"|"dodge"|"shove"|"stun"|"knockdown"|"interrupt"|"break"|"ko"|"timeout"|"special_start"|"special_end"|"slow"|"charge"|"flank"|"flame"|"burn"|"shock"|"overheat"|"cooled";
export interface EventV6 {
  id:number;frame:number;kind:EventKindV6;who:SideV6;target:SideV6;attackId?:number;weapon?:AttackKindV6;mount?:MountV6;slot?:BodySocketV6;
  damage?:number;absorbed?:number;platingStopped?:number;point?:Vec3;normal?:Vec3;worldPoint?:Vec3;worldNormal?:Vec3;origin?:Vec3;direction?:Vec3;ability?:StyleV6;phase?:number;critical?:boolean;
}
export interface ProjectileV6 {id:number;attackId:number;who:SideV6;weapon:AttackKindV6;mount:MountV6;x:number;y:number;z:number;vx:number;vy:number;vz:number;radius:number;ttl:number;damage:number;platingBypass:number;burn:number;shock:number;impulse:number}
export interface SpecialCommandV6 {id:string;who:SideV6;kind:"special";frame:number}
export interface FightOptionsV6 {autoSpecial?:[boolean,boolean];defensePlans?:[DefensePlanV6,DefensePlanV6];commands?:SpecialCommandV6[]}
export interface StateV6 {
  version:6;rulesVersion:"mk6-1";catalogVersion:"mk6-catalog-1";seed:number;random:number;frame:number;done:boolean;winner:SideV6|null;
  builds:[BuildV6,BuildV6];stats:[StatsV6,StatsV6];fighters:[FighterV6,FighterV6];projectiles:ProjectileV6[];events:EventV6[];commands:SpecialCommandV6[];
  autoSpecial:[boolean,boolean];defensePlans:[DefensePlanV6,DefensePlanV6];attackSequence:number;
}
export interface ResultV6 {version:6;rulesVersion:"mk6-1";catalogVersion:"mk6-catalog-1";seed:number;builds:[BuildV6,BuildV6];commands:SpecialCommandV6[];autoSpecial:[boolean,boolean];defensePlans:[DefensePlanV6,DefensePlanV6];winner:SideV6;frames:number;hash:string;events:EventV6[]}
export interface SpecialReceiptV6 {accepted:boolean;command?:SpecialCommandV6;reason?:string}
