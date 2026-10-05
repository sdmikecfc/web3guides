import { registerCollisionManifestV6, type BodyCollisionV6, type CollisionManifestV6, type HitProxyV6 } from "./collision";
import { WEAPONS_V6 } from "./weapons";
import type { Vec3 } from "./math";

/** First three local Blender heroes. Kept distinct from the analytic rehearsal. */
export const HERO_COLLISION_VERSION_V6 = "mk6-collision-hero-1";
function hero(style: "tank" | "speed" | "ranged"): BodyCollisionV6 {
  const tank = style === "tank", speed = style === "speed", x = tank ? 760 : speed ? 480 : 590, y = tank ? 2040 : speed ? 1940 : 1990, hip = tank ? 370 : speed ? 250 : 310;
  const frame = (position: Vec3) => ({ position, rotation: [0, 0, 0] as Vec3 });
  const box = (slot: HitProxyV6["slot"], center: Vec3, half: Vec3): HitProxyV6 => ({ slot, center, half, shape: "box" });
  const limb = (slot: HitProxyV6["slot"], sign: number, leg = false): HitProxyV6 => {
    const a: Vec3 = leg ? [sign * hip, 860, 0] : [sign * x, y, 0], b: Vec3 = leg ? [sign * hip, 200, 90] : [sign * (x + 40), y - 815, 120], radius = tank ? leg ? 225 : 240 : speed ? leg ? 145 : 150 : leg ? 185 : 190;
    return { slot, a, b, radius, shape: "capsule", center: a.map((n, i) => (n + b[i]) / 2) as Vec3, half: a.map((n, i) => Math.abs(n - b[i]) / 2 + radius) as Vec3 };
  };
  return { radius: tank ? 960 : speed ? 640 : 760, height: tank ? 2950 : speed ? 2780 : 2850,
    mounts: { head: frame([0, tank ? 2160 : speed ? 2060 : 2100, 0]), torso: frame([0, 1100, 0]), armL: frame([-x, y, 0]), armR: frame([x, y, 0]), legL: frame([-hip, 1040, 0]), legR: frame([hip, 1040, 0]), handL: frame([-x - 40, y - 815, 120]), handR: frame([x + 40, y - 815, 120]), shoulderL: frame([-640, 2120, 15]), shoulderR: frame([640, 2120, 15]) },
    proxies: [box("head", [0, tank ? 2410 : speed ? 2330 : 2360, 20], tank ? [460, 360, 390] : speed ? [340, 320, 330] : [390, 280, 440]), box("torso", [0, tank ? 1640 : speed ? 1580 : 1650, 20], tank ? [650, 530, 440] : speed ? [315, 455, 245] : [420, 440, 360]), limb("armL", -1), limb("armR", 1), limb("legL", -1, true), limb("legR", 1, true)] };
}
const weapons = Object.fromEntries(Object.entries(WEAPONS_V6).map(([key, w]) => [key, w.proxy]));
weapons.hammer = { ...weapons.hammer, strikePoint: [0, 780, 300], path: [
  { time: 0, point: [800, 2000, 500], normal: [0, 0, 1] }, { time: .3, point: [700, 2950, 100], normal: [0, 0, 1] },
  { time: .48, point: [550, 2350, 1150], normal: [0, -.77, .64] }, { time: .62, point: [500, 1500, 1335], normal: [0, -.97, .243] },
  { time: .8, point: [650, 1350, 850], normal: [0, -1, 0] }, { time: .9, point: [950, 1625, 675], normal: [0, -.707, .707] },
  { time: 1, point: [800, 1900, 500], normal: [0, 0, 1] },
] };
weapons.paired_blades = { ...weapons.paired_blades, strikeSegments: [{ a:[65,180,0], b:[150,870,0], radius:30 },{ a:[150,870,0], b:[35,1090,0], radius:30 }], strikePoint: [100, 720, 0], strikeNormal: [1, 0, 0], path: [
  { time: 0, point: [620, 1800, 480], normal: [-.6, .1, .8] }, { time: .28, point: [1030, 2200, 450], normal: [-1, 0, 0] },
  { time: .47, point: [750, 1780, 1120], normal: [-1, -.1, .05] }, { time: .60, point: [250, 1460, 1260], normal: [-1, -.1, 0] },
  { time: .78, point: [-300, 1300, 800], normal: [-1, .1, -.2] }, { time: 1, point: [620, 1800, 480], normal: [-.6, .1, .8] },
] };
weapons.shoulder_cannon = { ...weapons.shoulder_cannon, muzzle: [0, 130, 1290], backupMuzzle: [0, 130, 590], specialMuzzle: [0, 120, 450] };
export const HERO_COLLISION_V6: Readonly<CollisionManifestV6> = registerCollisionManifestV6({ version: HERO_COLLISION_VERSION_V6, rigVersion: "mk6-rig-1", units: "millimetres", bodies: { "boiler_knight.t3": hero("tank"), "roller_daredevil.t3": hero("speed"), "owl_ranger.t3": hero("ranged") }, weapons });
