/** Spatial practice rules v5. All outcomes use fixed simulation ticks, never animation or wall time. */
import { snapshotBuildV5 } from "./build";
import { SLOTS_V5, type BuildV5, type EventKindV5, type EventV5, type FighterV5, type ProjectileV5, type ResultV5, type SideV5, type SlotV5, type SpecialCommandV5, type StateV5, type WeaponKindV5 } from "./types";
export const FPS_V5 = 60;
export const MAX_FRAMES_V5 = 5400;
export const ARENA_RADIUS_V5 = 5000;
/** Centre-to-centre clearance for an ordinary rifle's barrel and projectile origin. */
export const RIFLE_MIN_RANGE_V5 = 1500;
export const RULES_V5 = Object.freeze({ version: 5, balanceVersion: "mk5-1", fps: FPS_V5, maxFrames: MAX_FRAMES_V5, specialFrames: 300, passiveMeterPerSecond: 5, damageMeterCap: 40, shieldReduction: .9, shieldBodyCap: .35, speedMove: 1.5, speedAttack: 1.2, speedDamage: 1.25, speedEvasion: 15, evasionCap: 60, slow: .3, stunFrames: 24, knockdownFrames: 72, recoveryProtection: 120 } as const);
export const WEAPONS_V5 = {
  hammer: { range: 1750, windup: 40, recovery: 43, damage: 23 },
  blade: { range: 1580, windup: 21, recovery: 30, damage: 17 },
  paired_blades: { range: 1420, windup: 17, recovery: 24, damage: 10 },
  rifle: { range: 6200, windup: 18, recovery: 62, damage: 20 },
  punch: { range: 1250, windup: 26, recovery: 34, damage: 7 },
  shove: { range: 1480, windup: 15, recovery: 26, damage: 4 },
  smg: { range: 4400, windup: 8, recovery: 10, damage: 5 },
} as const;
const other = (who: SideV5): SideV5 => (1 - who) as SideV5;
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const angle = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }
function canonical(v: unknown): unknown { if (Array.isArray(v)) return v.map(canonical); if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])])); return v; }
export function hashV5(v: unknown): string { let h = 2166136261; for (const c of JSON.stringify(canonical(v))) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16).padStart(8, "0"); }
function rng(s: StateV5, n = 100): number { let x = s.random; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.random = x >>> 0; return s.random % n; }
function emit(s: StateV5, kind: EventKindV5, who: SideV5, extra: Partial<EventV5> = {}) { const e: EventV5 = { id: s.events.length, frame: s.frame, kind, who, target: other(who), ...extra }; s.events.push(e); return e; }
function fighter(b: BuildV5, who: SideV5): FighterV5 {
  return { x: who ? 3000 : -3000, z: who ? -200 : 200, yaw: who ? -1571 : 1571, moveX: 0, moveZ: 0, armour: [...b.stats.armour], guard: b.stats.shield, action: null, stunnedUntil: 0, downUntil: 0, immuneUntil: 0, dodgeUntil: 0, nextDodge: 90, nextAction: 20, nextShove: 0, nextMount: "right", dealt: 0, shots: 0, combo: 0, meter: 0, damageMeter: 0, special: null, slowUntil: 0, slowBy: null, dashUntil: 0, dashX: 0, dashZ: 0, pushUntil: 0, pushX: 0, pushZ: 0 };
}
export function createFightV5(seed: number, a: BuildV5, b: BuildV5, options: { autoSpecial?: [boolean, boolean] } = {}): StateV5 {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed must be an unsigned 32-bit integer.");
  const builds = [a, b].map(input => {
    const rebuilt = snapshotBuildV5(input.appearanceBuild);
    if (input.version !== 5 || input.balanceVersion !== RULES_V5.balanceVersion || hashV5(input) !== hashV5(rebuilt)) throw new Error("Unsupported or changed build snapshot.");
    return rebuilt;
  }) as [BuildV5, BuildV5];
  const autoSpecial: [boolean, boolean] = [...(options.autoSpecial ?? [false, true])];
  return { version: 5, balanceVersion: "mk5-1", seed, random: seed || 0x9e3779b9, frame: 0, done: false, winner: null, builds, stats: [builds[0].stats, builds[1].stats], fighters: [fighter(builds[0], 0), fighter(builds[1], 1)], projectiles: [], events: [{ id: 0, frame: 0, kind: "start", who: 0, target: 1 }], commands: [], autoSpecial };
}
export const controlledV5 = (s: StateV5, who: SideV5) => s.fighters[who].stunnedUntil > s.frame || s.fighters[who].downUntil > s.frame;
export function facingV5(f: FighterV5, x: number, z: number, cosine = .25): boolean { const dx = x - f.x, dz = z - f.z, len = Math.hypot(dx, dz); return len > 0 && (Math.sin(f.yaw / 1000) * dx + Math.cos(f.yaw / 1000) * dz) / len >= cosine; }
const legs = (f: FighterV5) => Number(f.armour[4] > 0) + Number(f.armour[5] > 0);
const speedActive = (f: FighterV5) => f.special?.style === "speed";
export function movementV5(s: StateV5, who: SideV5): number { const f = s.fighters[who]; return s.stats[who].movement * (legs(f) === 2 ? 1 : legs(f) === 1 ? .57 : .23) * (speedActive(f) ? 1.5 : 1) * (f.slowUntil > s.frame ? .7 : 1); }
function bound(f: FighterV5) { const len = Math.hypot(f.x, f.z); if (len > ARENA_RADIUS_V5) { f.x = Math.round(f.x * ARENA_RADIUS_V5 / len); f.z = Math.round(f.z * ARENA_RADIUS_V5 / len); } }
function move(f: FighterV5, dx: number, dz: number) { f.x += Math.round(dx); f.z += Math.round(dz); bound(f); }
export function applyControlV5(s: StateV5, victim: SideV5, kind: "stun" | "knockdown", by: SideV5): boolean {
  const f = s.fighters[victim]; if (s.done || f.immuneUntil > s.frame || controlledV5(s, victim)) return false;
  const duration = kind === "stun" ? 24 : 72;
  if (kind === "stun") f.stunnedUntil = s.frame + duration; else f.downUntil = s.frame + duration;
  f.immuneUntil = s.frame + duration + 120;
  if (f.action && !f.action.released) emit(s, "interrupt", victim, { weapon: f.action.kind });
  f.action = null; f.dashUntil = f.dodgeUntil = s.frame; f.nextAction = s.frame + duration + 6;
  emit(s, kind, by, { target: victim }); return true;
}
export function weaponDamageV5(s: StateV5, who: SideV5, kind: WeaponKindV5): number {
  const f = s.fighters[who], a = s.stats[who];
  const amount = WEAPONS_V5[kind].damage + a.force * (kind === "hammer" ? .6 : kind === "rifle" ? 1.1 : kind === "smg" ? .13 : kind === "shove" ? .1 : .65) + (kind === "rifle" ? Math.max(0, a.acc - 4) * .45 : kind === "blade" || kind === "paired_blades" ? Math.max(0, a.atkSpd - 2) * .9 : 0);
  return Math.max(1, Math.round(amount * (speedActive(f) ? 1.25 : 1)));
}
function chosenSlot(s: StateV5, f: FighterV5): number {
  const weights = [8, 42, 13, 13, 12, 12].map((n, i) => f.armour[i] > 0 ? n : 0);
  let r = rng(s, weights.reduce((a, b) => a + b, 0) || 1);
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; } return 1;
}
export interface HitOptionsV5 { sourceX?: number; sourceZ?: number; damage?: number; slot?: SlotV5; finisher?: boolean; guaranteedContact?: boolean; mount?: "left" | "right"; slow?: boolean; burst?: boolean; knockdown?: boolean }
/** Damage path shared by melee, swept projectiles and specials; useful for deterministic rule fixtures. */
export function hitV5(s: StateV5, who: SideV5, weapon: WeaponKindV5, options: HitOptionsV5 = {}): boolean {
  if (s.done) return false;
  const target = other(who), a = s.fighters[who], b = s.fighters[target], fromX = options.sourceX ?? a.x, fromZ = options.sourceZ ?? a.z;
  const evade = Math.min(60, s.stats[target].evasion + (speedActive(b) ? 15 : 0));
  const chance = Math.max(25, s.stats[who].accuracy - evade - (a.armour[0] <= 0 ? 18 : 0));
  if (b.dodgeUntil > s.frame || !options.guaranteedContact && rng(s) >= chance) { emit(s, "miss", who, { weapon, mount: options.mount }); return false; }
  let index = options.slot ? SLOTS_V5.indexOf(options.slot) : chosenSlot(s, b);
  if (index < 0 || b.armour[index] <= 0) index = chosenSlot(s, b);
  let damage = options.damage ?? Math.max(1, Math.round(weaponDamageV5(s, who, weapon) * (90 + rng(s, 21)) / 100));
  let absorbed = 0, blocked = false;
  const front = facingV5(b, fromX, fromZ);
  if (b.special?.style === "tank" && b.special.shieldLeft > 0) {
    absorbed = Math.min(b.special.shieldLeft, damage * .9); b.special.shieldLeft = round(b.special.shieldLeft - absorbed); damage = round(damage - absorbed); blocked = absorbed > 0;
    if (b.special.shieldLeft <= 0 && b.action?.special === "charge") { emit(s, "interrupt", target, { weapon: b.action.kind }); b.action = null; b.nextAction = s.frame + 12; }
  } else if (b.armour[2] > 0 && b.guard > 0 && front && !b.action && !controlledV5(s, target) && rng(s) < 12 + s.stats[target].block * 1.5) {
    absorbed = Math.min(b.guard, damage * .5); b.guard -= absorbed; damage -= absorbed; blocked = absorbed > 0; index = 2;
  }
  if (options.finisher && a.special?.style === "speed" && s.frame >= a.special.until - 60 && s.builds[who].capabilities.tier3 && !facingV5(b, fromX, fromZ, -.35) && !blocked && index >= 2 && b.armour[index] * 4 < s.stats[target].armour[index]) damage = b.armour[index];
  damage = round(Math.min(b.armour[index], Math.max(0, damage)));
  b.armour[index] = round(b.armour[index] - damage); a.dealt = round(a.dealt + damage);
  if (index === 1 && !b.special && damage > 0) { const gain = Math.min(40 - b.damageMeter, damage / s.stats[target].armour[1] * 100); b.damageMeter = round(b.damageMeter + gain); b.meter = Math.min(100, round(b.meter + gain)); }
  const localAngle = Math.atan2(fromX - b.x, fromZ - b.z) - b.yaw / 1000;
  const normal: [number, number, number] = [Math.round(Math.sin(localAngle) * 1000), 0, Math.round(Math.cos(localAngle) * 1000)];
  const point: [number, number, number] = [Math.max(-1000, Math.min(1000, normal[0] + rng(s, 241) - 120)), 300 + rng(s, 401), Math.max(-1000, Math.min(1000, normal[2] + rng(s, 241) - 120))];
  emit(s, blocked ? "block" : "hit", who, { weapon, slot: SLOTS_V5[index], damage, point, normal, strength: weapon === "hammer" ? 1000 : weapon === "rifle" ? 650 : 400, mount: options.mount, absorbed: round(absorbed) });
  if (!blocked && options.slow && a.special?.style === "ranged") { b.slowUntil = Math.max(b.slowUntil, a.special.until); b.slowBy = who; emit(s, "slow", who); }
  if (!blocked && options.knockdown) applyControlV5(s, target, "knockdown", who);
  if (!blocked && weapon === "shove") { const len = Math.hypot(b.x - a.x, b.z - a.z) || 1; b.pushX = Math.round((b.x - a.x) / len * 45); b.pushZ = Math.round((b.z - a.z) / len * 45); b.pushUntil = s.frame + 10; }
  if (b.armour[index] === 0) {
    emit(s, "break", target, { slot: SLOTS_V5[index] });
    if (b.action && ((index === 2 && b.action.mount === "left") || (index === 3 && b.action.mount === "right") || (index >= 4 && b.action.special))) { emit(s, "interrupt", target, { weapon: b.action.kind }); b.action = null; }
    if (index >= 4) b.dodgeUntil = b.dashUntil = s.frame;
    if (index === 1) { s.done = true; s.winner = who; emit(s, "ko", who); }
  }
  return !blocked && damage > 0;
}
function startSpecial(s: StateV5, who: SideV5) {
  const f = s.fighters[who], build = s.builds[who]; f.meter = 0; f.damageMeter = 0;
  if (f.action && !f.action.released) emit(s, "interrupt", who, { weapon: f.action.kind }); f.action = null;
  f.special = { style: build.style, started: s.frame, until: s.frame + 300, shieldLeft: s.stats[who].armour[1] * .35, finisherUsed: false, burstShots: 0, burstDamageLeft: weaponDamageV5(s, who, "rifle") * 2, nextBurst: s.frame + 246, flankTarget: null };
  emit(s, "special_start", who, { ability: build.style });
  if (build.style === "ranged") { const b = s.fighters[other(who)]; b.slowUntil = f.special.until; b.slowBy = who; emit(s, "slow", who); }
}
/** Re-time only the remaining ordinary action; field expiry restores its normal rate. */
function syncSlow(s: StateV5, who: SideV5) {
  const f = s.fighters[who], a = f.action, slow = f.slowUntil > s.frame;
  if (!a || a.special || !!a.slowed === slow) return;
  const age = s.frame - a.started, ratio = slow ? 1 / .7 : .7;
  if (!a.released) { a.windup = age + Math.max(1, Math.round((a.windup - age) * ratio)); a.recovery = Math.max(1, Math.round(a.recovery * ratio)); }
  else a.recovery = Math.max(1, age - a.windup + Math.round((a.windup + a.recovery - age) * ratio));
  a.slowed = slow;
}
function beginEnding(s: StateV5, who: SideV5) {
  const f = s.fighters[who], build = s.builds[who];
  if (!f.special || f.special.finisherUsed || !build.capabilities.tier3 || s.frame < f.special.until - 60) return;
  f.special.finisherUsed = true;
  if (legs(f) === 2 && (build.style === "tank" && f.special.shieldLeft > 0 || build.style === "speed") && (f.armour[2] > 0 || f.armour[3] > 0)) {
    if (f.action && !f.action.released) emit(s, "interrupt", who, { weapon: f.action.kind });
    const flank = build.style === "speed", mount = f.armour[3] > 0 ? "right" : "left";
    f.action = { kind: flank ? "blade" : "hammer", special: flank ? "flank" : "charge", started: s.frame, windup: flank ? 38 : 23, recovery: flank ? 21 : 36, released: false, mount, direction: f.yaw };
    emit(s, flank ? "flank" : "charge", who, { weapon: f.action.kind, mount });
  }
}
export function acceptSpecialV5(s: StateV5, command: SpecialCommandV5): { accepted: boolean; reason?: string; command?: SpecialCommandV5 } {
  if (!command || typeof command.id !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(command.id) || ![0, 1].includes(command.who) || command.kind !== "special" || !Number.isInteger(command.frame)) return { accepted: false, reason: "Invalid special command." };
  const prior = s.commands.find(c => c.id === command.id);
  if (prior) return prior.who === command.who && prior.kind === command.kind && prior.frame === command.frame ? { accepted: true, command: clone(prior) } : { accepted: false, reason: "Command ID already used." };
  const f = s.fighters[command.who];
  const reason = command.frame !== s.frame ? "The command must use the current fight tick." : s.done ? "The fight has ended." : controlledV5(s, command.who) ? "Wait until your robot recovers." : f.special ? "The special is already active." : f.meter < 100 ? "The special is still charging." : null;
  if (reason) return { accepted: false, reason };
  const accepted = { id: command.id, who: command.who, kind: "special" as const, frame: s.frame }; s.commands.push(accepted); startSpecial(s, command.who); return { accepted: true, command: clone(accepted) };
}
function shoot(s: StateV5, who: SideV5, weapon: "rifle" | "smg", mount: "left" | "right") {
  const f = s.fighters[who]; if (f.armour[mount === "left" ? 2 : 3] <= 0) return;
  const rival = s.fighters[other(who)];
  if (weapon === "rifle" && Math.hypot(rival.x - f.x, rival.z - f.z) < RIFLE_MIN_RANGE_V5) return;
  const angle = f.yaw / 1000 + (rng(s, 101) - 50) * (101 - s.stats[who].accuracy) / 24000;
  const dx = Math.sin(angle), dz = Math.cos(angle), side = mount === "left" ? -220 : 220;
  let damage = weaponDamageV5(s, who, weapon);
  if (weapon === "smg") { if (f.special?.style !== "ranged") return; damage = Math.min(damage, f.special.burstDamageLeft); f.special.burstDamageLeft -= damage; if (damage <= 0) return; }
  const muzzle = weapon === "smg" ? 400 : 740;
  const p: ProjectileV5 = { id: s.events.length, who, weapon, mount, x: f.x + Math.round(dx * muzzle + dz * side), z: f.z + Math.round(dz * muzzle - dx * side), vx: Math.round(dx * 290), vz: Math.round(dz * 290), ttl: 24, damage, slow: false, burst: weapon === "smg" };
  s.projectiles.push(p); f.shots++; emit(s, "shot", who, { weapon, mount, origin: [p.x, 1500, p.z], direction: [p.vx, 0, p.vz] });
}
function retreat(s: StateV5, who: SideV5, speed: number) {
  const f = s.fighters[who], b = s.fighters[other(who)], len = Math.hypot(b.x - f.x, b.z - f.z) || 1, ux = (b.x - f.x) / len, uz = (b.z - f.z) / len;
  let best = -Infinity, bx = -ux, bz = -uz;
  for (const turn of [0, .75, -.75, 1.3, -1.3, 1.8, -1.8]) { const x = -ux * Math.cos(turn) + uz * Math.sin(turn), z = -uz * Math.cos(turn) - ux * Math.sin(turn), tx = f.x + x * 850, tz = f.z + z * 850; const score = Math.hypot(tx - b.x, tz - b.z) - Math.max(0, Math.hypot(tx, tz) - (ARENA_RADIUS_V5 - 150)) * 6; if (score > best) { best = score; bx = x; bz = z; } }
  move(f, bx * speed, bz * speed);
}
function rifleEscape(s: StateV5, who: SideV5, speed: number, mount: "left" | "right") {
  const f = s.fighters[who], b = s.fighters[other(who)], distance = Math.hypot(b.x - f.x, b.z - f.z) || 1;
  if (s.frame >= f.nextShove) {
    hitV5(s, who, "shove", { mount }); f.nextShove = s.frame + 150;
    if (legs(f) === 2) { f.dashUntil = s.frame + 15; f.dashX = Math.round(-(b.x - f.x) / distance * speed * 2.4); f.dashZ = Math.round(-(b.z - f.z) / distance * speed * 2.4); emit(s, "dodge", who); }
    else retreat(s, who, speed);
  } else retreat(s, who, speed);
}
function updateFighter(s: StateV5, who: SideV5) {
  const f = s.fighters[who], b = s.fighters[other(who)], build = s.builds[who];
  if (controlledV5(s, who)) return;
  syncSlow(s, who);
  beginEnding(s, who);
  const dx = b.x - f.x, dz = b.z - f.z, distance = Math.hypot(dx, dz) || 1, ux = dx / distance, uz = dz / distance, speed = movementV5(s, who);
  const desired = Math.atan2(dx, dz), locked = f.action && !f.action.released && s.frame - f.action.started >= f.action.windup - 10;
  const turn = s.stats[who].turnRate / 1000 * (f.slowUntil > s.frame ? .7 : 1);
  if (!locked && f.action?.special !== "charge") f.yaw = Math.round(angle(f.yaw / 1000 + Math.max(-turn, Math.min(turn, angle(desired - f.yaw / 1000)))) * 1000);
  if (f.special?.style === "ranged" && build.capabilities.tier3 && s.frame >= f.special.nextBurst && f.special.burstShots < 8) {
    const mount = f.special.burstShots % 2 ? "left" : "right";
    if (facingV5(f, b.x, b.z, .8)) { shoot(s, who, "smg", mount); f.special.burstShots++; f.special.nextBurst = s.frame + 6; }
  }
  if (f.dashUntil > s.frame) { const slow = f.slowUntil > s.frame ? .7 : 1; move(f, f.dashX * slow, f.dashZ * slow); return; }
  if (f.action) {
    const action = f.action, age = s.frame - action.started;
    if (action.kind === "rifle" && distance < RIFLE_MIN_RANGE_V5) {
      if (!action.released) emit(s, "interrupt", who, { weapon: "rifle", mount: action.mount }); f.action = null; f.nextAction = action.released ? Math.max(s.frame + 5, action.started + action.windup + action.recovery) : s.frame + 5;
      rifleEscape(s, who, speed, action.mount); return;
    }
    if (action.special === "charge" && (!f.special || f.special.shieldLeft <= 0)) { emit(s, "interrupt", who, { weapon: action.kind }); f.action = null; f.nextAction = s.frame + 12; return; }
    if (action.special === "flank" && !action.released) {
      const radius = 1220, sign = (s.seed + who) % 2 ? 1 : -1, rear = b.yaw / 1000 + Math.PI;
      const tangent = Math.atan2(f.x - b.x, f.z - b.z) + sign * .28;
      const aim = age < 26 ? tangent : rear;
      const tx = b.x + Math.sin(aim) * radius, tz = b.z + Math.cos(aim) * radius, length = Math.hypot(tx - f.x, tz - f.z) || 1;
      move(f, (tx - f.x) / length * Math.min(length, speed * 3), (tz - f.z) / length * Math.min(length, speed * 3));
    } else if (action.special === "charge" && age >= action.windup && age < action.windup + 25 && !action.hitOnce) {
      const tx = Math.sin((action.direction ?? f.yaw) / 1000) * speed * 4.5, tz = Math.cos((action.direction ?? f.yaw) / 1000) * speed * 4.5;
      const length2 = tx * tx + tz * tz || 1, t = Math.max(0, Math.min(1, ((b.x - f.x) * tx + (b.z - f.z) * tz) / length2));
      if (Math.hypot(f.x + tx * t - b.x, f.z + tz * t - b.z) <= 1250) { action.hitOnce = true; hitV5(s, who, "hammer", { damage: Math.round(weaponDamageV5(s, who, "hammer") * 1.2), knockdown: true, mount: action.mount }); }
      else move(f, tx, tz);
    } else if (!action.released && action.kind !== "rifle" && !action.special) {
      const travel = Math.min(speed * (age >= action.windup - 9 ? 2.7 : .8), Math.max(0, distance - WEAPONS_V5[action.kind].range * (action.kind === "hammer" ? .96 : .8))); move(f, Math.sin(f.yaw / 1000) * travel, Math.cos(f.yaw / 1000) * travel);
    } else if (action.released && action.kind !== "rifle" && !action.special && distance > WEAPONS_V5[action.kind].range) {
      move(f, ux * speed * .8, uz * speed * .8);
    }
    if (!action.released && age >= action.windup) {
      action.released = true;
      if (action.kind === "rifle") shoot(s, who, "rifle", action.mount);
      else if (action.special !== "charge") {
        const actualDistance = Math.hypot(b.x - f.x, b.z - f.z), reach = WEAPONS_V5[action.kind].range;
        if (actualDistance <= reach + 90 && facingV5(f, b.x, b.z)) {
          const rear = !facingV5(b, f.x, f.z, -.35), weak = [2, 3, 4, 5].filter(i => b.armour[i] > 0 && b.armour[i] * 4 < s.stats[other(who)].armour[i]).sort((a, c) => b.armour[a] / s.stats[other(who)].armour[a] - b.armour[c] / s.stats[other(who)].armour[c]);
          hitV5(s, who, action.kind, { mount: action.mount, ...(action.special === "flank" && rear && weak.length ? { slot: SLOTS_V5[weak[0]], finisher: true } : {}) });
        } else emit(s, "miss", who, { weapon: action.kind, mount: action.mount });
      }
    }
    if (action.kind === "rifle" && (action.released || age < action.windup - 4) && distance < 2600) retreat(s, who, speed * (.38));
    if (age >= action.windup + action.recovery) { f.action = null; f.nextAction = s.frame + 5; }
    return;
  }
  if (s.frame % 30 === 0) f.guard = Math.min(s.stats[who].shield, f.guard + 1);
  const paired = build.capabilities.pairedMelee;
  const arm = paired ? f.armour[f.nextMount === "left" ? 2 : 3] > 0 ? f.nextMount : f.nextMount === "left" ? "right" : "left" : f.armour[3] > 0 ? "right" : "left";
  if (f.armour[arm === "left" ? 2 : 3] <= 0) return;
  const weapon = paired ? "paired_blades" : f.armour[3] > 0 ? build.capabilities.weapon : "punch";
  const ranged = weapon === "rifle", reach = WEAPONS_V5[weapon].range;
  if (ranged && distance < RIFLE_MIN_RANGE_V5) { rifleEscape(s, who, speed, arm); return; }
  const incoming = b.action && !b.action.released && b.action.windup - (s.frame - b.action.started) <= 12;
  if (incoming && legs(f) === 2 && s.frame >= f.nextDodge && build.parts.legL.style === "speed" && build.parts.legR.style === "speed" && rng(s) < 20) {
    const sign = rng(s, 2) ? 1 : -1; f.dashUntil = s.frame + 9; f.dodgeUntil = s.frame + 7; f.dashX = Math.round(-uz * speed * 1.3 * sign); f.dashZ = Math.round(ux * speed * 1.3 * sign); f.nextDodge = s.frame + 150; emit(s, "dodge", who); return;
  }
  if (distance > (ranged ? 4200 : reach - 70)) move(f, ux * speed, uz * speed);
  else if (ranged && distance < 2400) retreat(s, who, speed * .55);
  if (distance <= reach + 20 && s.frame >= f.nextAction && facingV5(f, b.x, b.z, .65)) {
    const spec = WEAPONS_V5[weapon], rate = (1 + s.stats[who].atkSpd * .012) * (speedActive(f) ? 1.2 : 1) * (f.slowUntil > s.frame ? .7 : 1);
    f.action = { kind: weapon, started: s.frame, windup: Math.max(10, Math.round(spec.windup / rate)), recovery: Math.max(14, Math.round(spec.recovery / rate)), released: false, mount: arm, slowed: f.slowUntil > s.frame };
    f.nextMount = arm === "left" ? "right" : "left"; emit(s, "windup", who, { weapon, mount: arm });
  }
}
export function stepFightV5(s: StateV5): StateV5 {
  if (s.done) return s;
  s.frame++;
  const before = s.fighters.map(f => [f.x, f.z]);
  for (const who of [0, 1] as const) {
    const f = s.fighters[who];
    if (f.special && s.frame >= f.special.until) { emit(s, "special_end", who, { ability: f.special.style }); if (f.action?.special) { emit(s, "interrupt", who, { weapon: f.action.kind }); f.action = null; f.nextAction = s.frame + 8; } f.special = null; }
    if (!f.special) { f.meter = Math.min(100, round(f.meter + 5 / 60)); if (f.meter > 99.999) f.meter = 100; }
    if (f.pushUntil > s.frame) move(f, f.pushX, f.pushZ);
    if (s.autoSpecial[who] && f.meter >= 100 && !f.special && !controlledV5(s, who)) startSpecial(s, who);
  }
  const first = (s.seed & 1) as SideV5;
  updateFighter(s, first); if (!s.done) updateFighter(s, other(first));
  if (!s.done) for (let i = 0; i < s.projectiles.length; ) {
    const p = s.projectiles[i], b = s.fighters[other(p.who)], ox = p.x, oz = p.z;
    p.x += p.vx; p.z += p.vz; p.ttl--;
    const t = Math.max(0, Math.min(1, ((b.x - ox) * p.vx + (b.z - oz) * p.vz) / (p.vx * p.vx + p.vz * p.vz)));
    if (Math.hypot(ox + t * p.vx - b.x, oz + t * p.vz - b.z) <= s.stats[other(p.who)].radius) { hitV5(s, p.who, p.weapon, { sourceX: ox, sourceZ: oz, damage: p.damage, mount: p.mount, slow: p.slow, burst: p.burst }); s.projectiles.splice(i, 1); }
    else if (p.ttl <= 0) { emit(s, "miss", p.who, { weapon: p.weapon, mount: p.mount }); s.projectiles.splice(i, 1); } else i++;
    if (s.done) break;
  }
  const [a, b] = s.fighters, dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz), clearance = s.stats[0].radius + s.stats[1].radius;
  if (distance < clearance) { const ux = distance ? dx / distance : 1, uz = distance ? dz / distance : 0, shift = (clearance - distance) / 2; move(a, -ux * shift, -uz * shift); move(b, ux * shift, uz * shift); }
  s.fighters.forEach((f, i) => { f.moveX = f.x - before[i][0]; f.moveZ = f.z - before[i][1]; });
  if (!s.done && s.frame >= MAX_FRAMES_V5) { const hp = a.armour[1] / s.stats[0].armour[1] - b.armour[1] / s.stats[1].armour[1]; s.winner = Math.abs(hp) > 1e-9 ? hp > 0 ? 0 : 1 : a.dealt !== b.dealt ? a.dealt > b.dealt ? 0 : 1 : first; s.done = true; emit(s, "timeout", s.winner); }
  return s;
}
export function advanceFightV5(s: StateV5, toFrame: number): StateV5 { if (!Number.isFinite(toFrame) || toFrame < s.frame) throw new Error("Cannot rewind a live fight."); const end = Math.min(MAX_FRAMES_V5, Math.floor(toFrame)); while (!s.done && s.frame < end) stepFightV5(s); return s; }
export function runFightV5(seed: number, a: BuildV5, b: BuildV5, options: { autoSpecial?: [boolean, boolean]; commands?: SpecialCommandV5[] } = {}): StateV5 {
  const s = createFightV5(seed, a, b, options), commands = [...(options.commands ?? [])].sort((a, b) => a.frame - b.frame);
  let i = 0;
  while (!s.done) { while (i < commands.length && commands[i].frame === s.frame) { const receipt = acceptSpecialV5(s, commands[i++]); if (!receipt.accepted) throw new Error(`Replay command rejected: ${receipt.reason}`); } stepFightV5(s); }
  if (i !== commands.length) throw new Error("Replay includes commands outside this fight.");
  return s;
}
export function resultV5(s: StateV5): ResultV5 { if (!s.done || s.winner === null) throw new Error("The fight is still running."); return { version: 5, balanceVersion: "mk5-1", seed: s.seed, builds: clone(s.builds), commands: clone(s.commands), autoSpecial: [...s.autoSpecial], winner: s.winner, frames: s.frame, hash: hashV5(s), events: clone(s.events) }; }
export function replayV5(result: ResultV5): StateV5 { const s = runFightV5(result.seed, result.builds[0], result.builds[1], { autoSpecial: result.autoSpecial, commands: result.commands }); if (hashV5(s) !== result.hash) throw new Error("Replay does not match its saved rules and commands."); return s; }
