import type { CombatBuild } from "@/lib/bots/combat-model";
import type { Part, Slot as CardSlot, Stats as StatTuple, Tier } from "@/app/bots/_engine/parts";
export type StyleV5 = "tank" | "speed" | "ranged";
export type SideV5 = 0 | 1;
export const SLOTS_V5 = ["head", "torso", "armL", "armR", "legL", "legR"] as const;
export type SlotV5 = typeof SLOTS_V5[number];
export type SocketV5 = SlotV5 | "weapon";
export type WeaponKindV5 = "hammer" | "blade" | "rifle" | "paired_blades" | "punch" | "shove" | "smg";
export interface SpecialInfoV5 { id: string; name: string; description: string; unlockTier: 1 | 3; durationSeconds: 5 }
export interface CardV5 { id: string; slot: CardSlot; s: StatTuple; tier: Tier; price: number; style: StyleV5; artKey: string; name: string; lore: string; starter: boolean; weaponKind?: WeaponKindV5; special?: SpecialInfoV5 }
export interface AggregatesV5 { speed: number; str: number; dodge: number; dmg: number; block: number; health: number; luck: number; acc: number; atkSpd: number }
export interface PartV5 extends Part { slot: SocketV5; tier: Tier; style: StyleV5 | null; artKey: string; weaponKind?: WeaponKindV5 }
export interface StatsV5 extends AggregatesV5 { armour: number[]; movement: number; turnRate: number; accuracy: number; evasion: number; force: number; shield: number; radius: number }
export interface BuildV5 { version: 5; balanceVersion: "mk5-1"; appearanceBuild: CombatBuild; style: StyleV5; tier: Tier; parts: Record<SocketV5, PartV5>; capabilities: { special: SpecialInfoV5; tier3: boolean; weapon: WeaponKindV5; pairedMelee: boolean }; stats: StatsV5 }
export interface ActionV5 { kind: WeaponKindV5; started: number; windup: number; recovery: number; released: boolean; mount: "left" | "right"; special?: "charge" | "flank"; hitOnce?: boolean; direction?: number; slowed?: boolean }
export interface SpecialV5 { style: StyleV5; started: number; until: number; shieldLeft: number; finisherUsed: boolean; burstShots: number; burstDamageLeft: number; nextBurst: number; flankTarget: SlotV5 | null }
export interface FighterV5 { x: number; z: number; yaw: number; moveX: number; moveZ: number; armour: number[]; guard: number; action: ActionV5 | null; stunnedUntil: number; downUntil: number; immuneUntil: number; dodgeUntil: number; nextDodge: number; nextAction: number; nextShove: number; nextMount: "left" | "right"; dealt: number; shots: number; combo: number; meter: number; damageMeter: number; special: SpecialV5 | null; slowUntil: number; slowBy: SideV5 | null; dashUntil: number; dashX: number; dashZ: number; pushUntil: number; pushX: number; pushZ: number }
export type EventKindV5 = "start" | "windup" | "shot" | "hit" | "block" | "miss" | "dodge" | "stun" | "knockdown" | "interrupt" | "break" | "ko" | "timeout" | "special_start" | "special_end" | "slow" | "charge" | "flank";
export type PointV5 = [number, number, number];
export interface EventV5 { id: number; frame: number; kind: EventKindV5; who: SideV5; target: SideV5; weapon?: WeaponKindV5; slot?: SlotV5; damage?: number; point?: PointV5; normal?: PointV5; strength?: number; origin?: PointV5; direction?: PointV5; mount?: "left" | "right"; ability?: StyleV5; absorbed?: number }
export interface ProjectileV5 { id: number; who: SideV5; weapon: "rifle" | "smg"; mount: "left" | "right"; x: number; z: number; vx: number; vz: number; ttl: number; damage: number; slow: boolean; burst: boolean }
export interface SpecialCommandV5 { id: string; who: SideV5; kind: "special"; frame: number }
export interface StateV5 { version: 5; balanceVersion: "mk5-1"; seed: number; random: number; frame: number; done: boolean; winner: SideV5 | null; builds: [BuildV5, BuildV5]; stats: [StatsV5, StatsV5]; fighters: [FighterV5, FighterV5]; projectiles: ProjectileV5[]; events: EventV5[]; commands: SpecialCommandV5[]; autoSpecial: [boolean, boolean] }
export interface ResultV5 { version: 5; balanceVersion: "mk5-1"; seed: number; builds: [BuildV5, BuildV5]; commands: SpecialCommandV5[]; autoSpecial: [boolean, boolean]; winner: SideV5; frames: number; hash: string; events: EventV5[] }
