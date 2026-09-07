/** Combat Lab v4. Pure, fixed-step combat; rendering never writes this state. */
export const VERSION = 4 as const;
export const FPS = 60;
export const CAP = 90 * FPS;
export const SCALE = 1000;
export const SLOTS = ["head", "torso", "armL", "armR", "legL", "legR"] as const;
export type Slot = typeof SLOTS[number];
export type Family = "brute" | "hotshot" | "deadeye";
export type Weapon = "hammer" | "baton" | "rifle";
export type Side = 0 | 1;
export type Point = [number, number, number];
export interface Module { family: Family; design: 0 | 1 }
export interface BuildV4 { version: 4; parts: Record<Slot, Module>; weapon: Weapon }
export interface Stats { armour: number[]; speed: number; accuracy: number; dodge: number; force: number; shield: number }
export interface Action { kind: Weapon | "punch"; started: number; windup: number; recovery: number; released: boolean }
export interface Fighter {
  x: number; z: number; yaw: number; armour: number[]; guard: number; action: Action | null;
  stunnedUntil: number; downUntil: number; immuneUntil: number; dodgeUntil: number; dodgeX: number; dodgeZ: number;
  nextDodge: number; combo: number; dealt: number; shots: number; nextAction: number;
}
export type EventKind = "start" | "windup" | "shot" | "hit" | "block" | "miss" | "dodge" | "stun" | "knockdown" | "interrupt" | "break" | "ko" | "timeout";
export interface EventV4 {
  id: number; frame: number; kind: EventKind; who: Side; target: Side; weapon?: Weapon | "punch";
  slot?: Slot; damage?: number; point?: Point; normal?: Point; strength?: number;
}
export interface Projectile { id: number; who: Side; x: number; z: number; vx: number; vz: number; ttl: number }
export interface StateV4 {
  version: 4; seed: number; random: number; frame: number; done: boolean; winner: Side | null;
  builds: [BuildV4, BuildV4]; stats: [Stats, Stats]; fighters: [Fighter, Fighter]; projectiles: Projectile[]; events: EventV4[];
}
export interface ResultV4 { version: 4; seed: number; builds: [BuildV4, BuildV4]; winner: Side; frames: number; hash: string; events: EventV4[] }
export const FAMILIES: Family[] = ["brute", "hotshot", "deadeye"];
export const WEAPONS: Weapon[] = ["hammer", "baton", "rifle"];
export const WEAPON = {
  hammer: { range: 1850, windup: 66, recovery: 51, damage: 24 },
  baton: { range: 1550, windup: 25, recovery: 30, damage: 11 },
  rifle: { range: 6200, windup: 49, recovery: 49, damage: 19 },
  punch: { range: 1250, windup: 24, recovery: 39, damage: 7 },
} as const;

export function preset(family: Family, design: 0 | 1 = 0): BuildV4 {
  return { version: 4, parts: Object.fromEntries(SLOTS.map(s => [s, { family, design: family === "brute" && s === "armL" ? 1 : design }])) as BuildV4["parts"], weapon: family === "brute" ? "hammer" : family === "hotshot" ? "baton" : "rifle" };
}
export function validBuild(value: unknown): value is BuildV4 {
  if (!value || typeof value !== "object") return false;
  const b = value as BuildV4;
  return b.version === 4 && WEAPONS.includes(b.weapon) && !!b.parts && SLOTS.every(s => {
    const p = b.parts[s]; return p && FAMILIES.includes(p.family) && (p.design === 0 || p.design === 1);
  });
}
export function canonicalBuild(b: BuildV4): BuildV4 {
  if (!validBuild(b)) throw new Error("Invalid Combat Lab build");
  return { version: 4, parts: Object.fromEntries(SLOTS.map(s => [s, { family: b.parts[s].family, design: b.parts[s].design }])) as BuildV4["parts"], weapon: b.weapon };
}
export function statsFor(b: BuildV4): Stats {
  const family = (s: Slot) => b.parts[s].family;
  const legSpeed = (s: Slot) => ({ brute: 15, hotshot: 32, deadeye: 22 })[family(s)] + b.parts[s].design * 2;
  return {
    armour: SLOTS.map(s => Math.round((s === "torso" ? 155 : s === "head" ? 57 : s.startsWith("arm") ? 67 : 60) * ({ brute: 1.3, hotshot: .86, deadeye: 1 })[family(s)] + b.parts[s].design * 4)),
    speed: Math.round((legSpeed("legL") + legSpeed("legR")) / 2),
    accuracy: ({ brute: 79, hotshot: 83, deadeye: 94 })[family("head")] + b.parts.head.design * 2,
    dodge: ["legL", "legR"].reduce((n, s) => n + ({ brute: 2, hotshot: 10, deadeye: 4 })[family(s as Slot)], 0),
    force: ["armL", "armR", "torso"].reduce((n, s) => n + ({ brute: 4, hotshot: 1, deadeye: 2 })[family(s as Slot)], 0),
    shield: family("armL") === "brute" && b.parts.armL.design === 1 ? 65 : 0,
  };
}
function fighter(stats: Stats, side: Side): Fighter {
  return { x: side === 0 ? -3000 : 3000, z: side === 0 ? 250 : -250, yaw: side === 0 ? 1571 : -1571, armour: [...stats.armour], guard: stats.shield, action: null, stunnedUntil: 0, downUntil: 0, immuneUntil: 0, dodgeUntil: 0, dodgeX: 0, dodgeZ: 0, nextDodge: 70 + side * 19, combo: 0, dealt: 0, shots: 0, nextAction: 25 + side * 8 };
}
export function createFightV4(seed: number, a: BuildV4, b: BuildV4): StateV4 {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed must be an unsigned 32-bit integer");
  const builds: [BuildV4, BuildV4] = [canonicalBuild(a), canonicalBuild(b)], stats = builds.map(statsFor) as [Stats, Stats];
  return { version: 4, seed, random: seed || 0x9e3779b9, frame: 0, done: false, winner: null, builds, stats, fighters: [fighter(stats[0], 0), fighter(stats[1], 1)], projectiles: [], events: [{ id: 0, frame: 0, kind: "start", who: 0, target: 1 }] };
}
function roll(s: StateV4, n = 100): number { let x = s.random; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.random = x >>> 0; return s.random % n; }
function emit(s: StateV4, kind: EventKind, who: Side, extra: Partial<EventV4> = {}): EventV4 {
  const e: EventV4 = { id: s.events.length, frame: s.frame, kind, who, target: (1 - who) as Side, ...extra }; s.events.push(e); return e;
}
export const controlled = (s: StateV4, who: Side) => s.fighters[who].stunnedUntil > s.frame || s.fighters[who].downUntil > s.frame;
export const hasShield = (s: StateV4, who: Side) => s.stats[who].shield > 0 && s.fighters[who].armour[2] > 0;
export function shieldFacing(s: StateV4, who: Side, fromX: number, fromZ: number): boolean {
  const f = s.fighters[who], dx = fromX - f.x, dz = fromZ - f.z, len = Math.hypot(dx, dz);
  return len > 0 && (Math.sin(f.yaw / 1000) * dx + Math.cos(f.yaw / 1000) * dz) / len >= .35;
}
/** Control cannot refresh itself; immunity includes the full recovery window. */
export function applyControl(s: StateV4, victim: Side, kind: "stun" | "knockdown", attacker: Side): boolean {
  const f = s.fighters[victim]; if (s.done || s.frame < f.immuneUntil || controlled(s, victim)) return false;
  const duration = kind === "stun" ? 24 : 72;
  if (kind === "stun") f.stunnedUntil = s.frame + duration; else f.downUntil = s.frame + duration;
  f.immuneUntil = s.frame + duration + 120;
  if (f.action && !f.action.released) emit(s, "interrupt", victim, { target: attacker, weapon: f.action.kind });
  f.action = null; f.dodgeUntil = s.frame; f.nextAction = s.frame + duration + 8;
  emit(s, kind, attacker, { target: victim }); return true;
}
function chooseSlot(s: StateV4, target: Fighter): number {
  const weights = [10, 42, 13, 15, 10, 10]; let total = 0;
  const alive = weights.map((w, i) => target.armour[i] > 0 ? (total += w, w) : 0);
  let pick = roll(s, total || 1); for (let i = 0; i < 6; i++) { pick -= alive[i]; if (pick < 0) return i; } return 1;
}
export function hit(s: StateV4, who: Side, weapon: Action["kind"], sourceX?: number, sourceZ?: number): void {
  if (s.done) return;
  const victim = (1 - who) as Side, a = s.fighters[who], b = s.fighters[victim], stats = s.stats[who];
  const airborne = b.dodgeUntil > s.frame;
  if (airborne || roll(s) > Math.max(42, stats.accuracy - (b.armour[0] <= 0 ? 5 : 0) - Math.floor(s.stats[victim].dodge / 2) - (a.armour[0] <= 0 ? 24 : 0))) { emit(s, "miss", who, { weapon }); return; }
  let damage = Math.round((WEAPON[weapon].damage + stats.force) * (88 + roll(s, 25)) / 100 * (a.armour[2] <= 0 ? .82 : 1));
  let index = chooseSlot(s, b), blocked = false;
  if (hasShield(s, victim) && b.guard >= 12 && !controlled(s, victim) && !b.action && shieldFacing(s, victim, sourceX ?? a.x, sourceZ ?? a.z)) {
    b.guard = Math.max(0, b.guard - damage); damage = Math.max(1, Math.round(damage * .18)); index = 2; blocked = true;
  }
  const angle = Math.atan2((sourceX ?? a.x) - b.x, (sourceZ ?? a.z) - b.z) - b.yaw / 1000;
  const normal: Point = [Math.round(Math.sin(angle) * 1000), 0, Math.round(Math.cos(angle) * 1000)];
  const point: Point = [Math.round(normal[0] * .3), index === 0 ? 340 : index === 1 ? 520 : -200, Math.round(normal[2] * .28)];
  // A recorded offset, in the shell's bone space, gives distinct but replayable dents.
  point[0] += roll(s, 161) - 80; point[1] += roll(s, 171) - 85;
  const dealt = Math.min(b.armour[index], damage); b.armour[index] = Math.max(0, b.armour[index] - damage); a.dealt += dealt;
  emit(s, blocked ? "block" : "hit", who, { target: victim, weapon, slot: SLOTS[index], damage: dealt, point, normal, strength: weapon === "hammer" ? 1000 : weapon === "rifle" ? 650 : 380 });
  if (!blocked && weapon === "hammer") {
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    b.x += Math.round(dx / len * 260); b.z += Math.round(dz / len * 260);
    applyControl(s, victim, "knockdown", who);
  }
  if (!blocked && weapon === "baton" && ++a.combo % 3 === 0) applyControl(s, victim, "stun", who);
  if (b.armour[index] === 0) {
    emit(s, "break", victim, { target: who, slot: SLOTS[index] });
    if (index === 3 && b.action) { emit(s, "interrupt", victim, { weapon: b.action.kind }); b.action = null; }
    if (index === 1) { s.done = true; s.winner = who; emit(s, "ko", who); }
  }
}
function bound(f: Fighter) { const n = Math.hypot(f.x, f.z); if (n > 4450) { f.x = Math.round(f.x * 4450 / n); f.z = Math.round(f.z * 4450 / n); } }
function updateFighter(s: StateV4, who: Side) {
  const f = s.fighters[who], target = s.fighters[1 - who], stats = s.stats[who];
  if (controlled(s, who)) return;
  const dx = target.x - f.x, dz = target.z - f.z, distance = Math.hypot(dx, dz) || 1;
  const ux = dx / distance, uz = dz / distance;
  if (!f.action || !f.action.released) f.yaw = Math.round(Math.atan2(dx, dz) * 1000);
  const missingLegs = Number(f.armour[4] <= 0) + Number(f.armour[5] <= 0);
  const speed = stats.speed * (missingLegs === 2 ? .23 : missingLegs === 1 ? .57 : 1);
  function repositionRifle(factor = 1) {
    // Keep cycling along the boundary instead of retreating into a dead end.
    const radius = Math.hypot(f.x, f.z), retreat = distance < 3200 ? -.75 : 0;
    if (radius > 3500 && retreat) {
      const sign = who ? -1 : 1;
      const oldX = f.x, oldZ = f.z;
      f.x += Math.round((-oldZ / radius * sign - oldX / radius * .20) * speed * factor);
      f.z += Math.round((oldX / radius * sign - oldZ / radius * .20) * speed * factor);
    } else { f.x += Math.round(ux * speed * retreat * factor); f.z += Math.round(uz * speed * retreat * factor); }
    bound(f);
  }
  const enemyWindup = target.action && !target.action.released && s.frame - target.action.started >= target.action.windup - 19;
  if (!f.action && enemyWindup && s.frame >= f.nextDodge && missingLegs === 0 && stats.dodge >= 12) {
    const sign = roll(s, 2) ? 1 : -1;
    f.dodgeUntil = s.frame + 23; f.dodgeX = Math.round(-uz * sign * 46); f.dodgeZ = Math.round(ux * sign * 46); f.nextDodge = s.frame + 155;
    emit(s, "dodge", who);
  }
  if (f.dodgeUntil > s.frame) { f.x += f.dodgeX; f.z += f.dodgeZ; bound(f); return; }
  if (f.action) {
    const action = f.action, age = s.frame - action.started;
    if (!action.released && age >= action.windup) {
      action.released = true;
      if (action.kind === "rifle") {
        // A real projectile travels along the committed aim; evasive motion can clear it.
        const error = (roll(s, 101) - 50) * (101 - stats.accuracy) / 18000;
        const angle = f.yaw / 1000 + error;
        const p: Projectile = { id: s.events.length, who, x: f.x + Math.round(Math.sin(angle) * 650), z: f.z + Math.round(Math.cos(angle) * 650), vx: Math.round(Math.sin(angle) * 270), vz: Math.round(Math.cos(angle) * 270), ttl: 32 };
        s.projectiles.push(p); f.shots++; emit(s, "shot", who, { weapon: "rifle" });
      } else if (distance <= WEAPON[action.kind].range + 200 && shieldFacing(s, who, target.x, target.z)) hit(s, who, action.kind);
      else emit(s, "miss", who, { weapon: action.kind });
    }
    if (age >= action.windup + action.recovery) { f.action = null; f.nextAction = s.frame + 8; }
    if (action.kind === "rifle" && action.released) repositionRifle(.45);
    return;
  }
  if (hasShield(s, who) && s.frame % 9 === 0) f.guard = Math.min(stats.shield, f.guard + 2);
  const weapon = f.armour[3] > 0 ? s.builds[who].weapon : "punch";
  const range = WEAPON[weapon].range;
  let movement = distance > (weapon === "rifle" ? 3600 : range - 90) ? 1 : weapon === "rifle" && distance < 2400 ? -.60 : 0;
  if (weapon === "rifle" && movement < 0) repositionRifle();
  else if (movement) { f.x += Math.round(ux * speed * movement); f.z += Math.round(uz * speed * movement); }
  if (weapon !== "rifle" && distance < range + 400) { const strafe = ((Math.floor(s.frame / 140) + who) % 2 ? 1 : -1) * 4; f.x += Math.round(-uz * strafe); f.z += Math.round(ux * strafe); }
  bound(f);
  if ((f.armour[2] > 0 || f.armour[3] > 0) && distance <= range && s.frame >= f.nextAction && !(weapon === "rifle" && movement < 0 && s.frame % 150 < 65)) {
    const spec = WEAPON[weapon];
    f.action = { kind: weapon, started: s.frame, windup: spec.windup + missingLegs * 5, recovery: spec.recovery, released: false };
    emit(s, "windup", who, { weapon });
  }
}
export function stepFightV4(s: StateV4): void {
  if (s.done) return;
  s.frame++;
  const first = (s.seed & 1) as Side;
  updateFighter(s, first); if (!s.done) updateFighter(s, (1 - first) as Side);
  if (!s.done) for (let i = s.projectiles.length - 1; i >= 0; i--) {
    const p = s.projectiles[i], victim = s.fighters[1 - p.who], oldX = p.x, oldZ = p.z;
    p.x += p.vx; p.z += p.vz; p.ttl--;
    const len2 = p.vx * p.vx + p.vz * p.vz, t = Math.max(0, Math.min(1, ((victim.x - oldX) * p.vx + (victim.z - oldZ) * p.vz) / len2));
    if (Math.hypot(oldX + t * p.vx - victim.x, oldZ + t * p.vz - victim.z) < 490) { hit(s, p.who, "rifle", oldX, oldZ); s.projectiles.splice(i, 1); }
    else if (p.ttl <= 0) { emit(s, "miss", p.who, { weapon: "rifle" }); s.projectiles.splice(i, 1); }
    if (s.done) break;
  }
  const [a, b] = s.fighters, dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz);
  if (dist < 1110) { const ux = dist ? dx / dist : 1, uz = dist ? dz / dist : 0, shift = (1110 - dist) / 2; a.x -= Math.round(ux * shift); a.z -= Math.round(uz * shift); b.x += Math.round(ux * shift); b.z += Math.round(uz * shift); }
  bound(a); bound(b);
  if (!s.done && s.frame >= CAP) {
    const health = a.armour[1] * s.stats[1].armour[1] - b.armour[1] * s.stats[0].armour[1];
    s.winner = health === 0 ? (a.dealt === b.dealt ? first : a.dealt > b.dealt ? 0 : 1) : health > 0 ? 0 : 1;
    s.done = true; emit(s, "timeout", s.winner);
  }
}
export function hashV4(value: unknown): string { const str = JSON.stringify(value); let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0).toString(16).padStart(8, "0"); }
export function runFightV4(seed: number, a: BuildV4, b: BuildV4): StateV4 { const s = createFightV4(seed, a, b); while (!s.done) stepFightV4(s); return s; }
export function resultV4(s: StateV4): ResultV4 { if (!s.done || s.winner === null) throw new Error("Fight is still running"); return { version: 4, seed: s.seed, builds: s.builds, winner: s.winner, frames: s.frame, hash: hashV4(s), events: s.events }; }
