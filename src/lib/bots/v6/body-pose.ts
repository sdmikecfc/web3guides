import { BODY_SOCKETS_V6, type CollisionSnapshotV6, type HitProxyV6 } from "./collision";
import { add, axisQuatV6, clamp, eulerQuatV6, inverseQuatV6, multiplyQuatV6, rotateQuatV6, rotateY, scale, subtract, type QuatV6, type Vec3 } from "./math";

const IDENTITY: QuatV6 = [0, 0, 0, 1];
export interface BodyFrameV6 { translation: Vec3; orientation: QuatV6; knockdown: number }
export interface RigidLegPoseV6 { hip: Vec3; hipQuaternion: QuatV6; foot: Vec3; proxy: HitProxyV6 }
export interface BodyMotionInputV6 { frame: number; downUntil: number; gait: number; moveX: number; moveZ: number; yaw: number; armour: readonly number[] }
type MotionResultV6 = { body: BodyFrameV6; legs: { left: RigidLegPoseV6; right: RigidLegPoseV6 }; proxies: HitProxyV6[] };
const motionCacheV6 = new WeakMap<CollisionSnapshotV6, { key: string; value: MotionResultV6 }>();
export const bodyPointV6 = (body: BodyFrameV6, point: Vec3): Vec3 => add(body.translation, rotateQuatV6(point, body.orientation));
export const bodyDirectionV6 = (body: BodyFrameV6, direction: Vec3): Vec3 => rotateQuatV6(direction, body.orientation);
export const unbodyPointV6 = (body: BodyFrameV6, point: Vec3): Vec3 => rotateQuatV6(subtract(point, body.translation), inverseQuatV6(body.orientation));
export function bodyFromProxiesV6(proxies: readonly HitProxyV6[]): BodyFrameV6 {
  const torso = proxies.find(p => p.slot === "torso")!, pose = torso.pose;
  return pose ? { orientation: pose.rotation, translation: subtract(pose.origin, rotateQuatV6(pose.restOrigin, pose.rotation)), knockdown: 0 } : { orientation: [...IDENTITY], translation: [0, 0, 0], knockdown: 0 };
}

/** A rigid proxy carries its inverse rest mapping with it, including attached limbs. */
export function transformProxyV6(proxy: HitProxyV6, translation: Vec3, orientation: QuatV6): HitProxyV6 {
  const point = (p: Vec3) => add(translation, rotateQuatV6(p, orientation));
  const prior = proxy.pose;
  const pose: NonNullable<HitProxyV6["pose"]> = prior ? { ...prior, origin: point(prior.origin), rotation: multiplyQuatV6(orientation, prior.rotation) } : { segment: "body", origin: point(proxy.center), restOrigin: proxy.center, rotation: orientation, restCenter: proxy.center, restHalf: proxy.half };
  return { ...proxy, center: point(proxy.center), ...(proxy.shape === "capsule" ? { a: point(proxy.a!), b: point(proxy.b!) } : { orientation: multiplyQuatV6(orientation, proxy.orientation ?? IDENTITY) }), pose };
}
function lowest(proxy: HitProxyV6): number {
  if (proxy.shape === "capsule") return Math.min(proxy.a![1], proxy.b![1]) - proxy.radius!;
  const axis = proxy.orientation ? rotateQuatV6([0, 1, 0], inverseQuatV6(proxy.orientation)) : [0, 1, 0];
  return proxy.center[1] - axis.reduce((sum, n, i) => sum + Math.abs(n) * proxy.half[i], 0);
}
const smooth = (t: number) => { const n = clamp(t, 0, 1); return n * n * (3 - 2 * n); };
/** Twelve ticks falling, 24 on the floor, then a 36-tick controlled get-up. */
export function knockdownAmountV6(frame: number, until: number): number {
  if (until <= frame || until <= 0) return 0;
  const elapsed = frame - (until - 72);
  return elapsed < 12 ? smooth(elapsed / 12) : elapsed < 36 ? 1 : 1 - smooth((elapsed - 36) / 36);
}
export function rigidLegPoseV6(c: CollisionSnapshotV6, side: "left" | "right", motion: BodyMotionInputV6): RigidLegPoseV6 {
  const slot = side === "left" ? "legL" : "legR", rest = c.proxies.find(p => p.slot === slot)!, mount = c.mounts[slot], hip = mount.position;
  const localVelocity = rotateY([motion.moveX, 0, motion.moveZ], -motion.yaw), speed = Math.hypot(localVelocity[0], localVelocity[2]);
  const available = motion.armour[side === "left" ? 4 : 5] > 0;
  const swing = available && motion.downUntil <= motion.frame ? Math.sin(motion.gait + (side === "left" ? 0 : Math.PI)) * Math.min(.28, speed / 210) : 0;
  const direction: Vec3 = speed > .01 ? [localVelocity[2] / speed, 0, -localVelocity[0] / speed] : [1, 0, 0];
  const delta = axisQuatV6(direction, swing), hipQuaternion = multiplyQuatV6(delta, eulerQuatV6(mount.rotation)), translation = subtract(hip, rotateQuatV6(hip, delta));
  const proxy = transformProxyV6(rest, translation, delta); proxy.pose!.segment = "rigid";
  const ankle = rest.shape === "capsule" ? rest.a![1] < rest.b![1] ? rest.a! : rest.b! : [rest.center[0], rest.center[1] - rest.half[1], rest.center[2]] as Vec3;
  return { hip, hipQuaternion, foot: add(translation, rotateQuatV6(ankle, delta)), proxy };
}
/** Arms/weapons remain body-local. Returned proxies alone receive the common frame. */
export function bodyMotionV6(c: CollisionSnapshotV6, motion: BodyMotionInputV6, localProxies?: readonly HitProxyV6[]): MotionResultV6 {
  const key = [motion.frame,motion.downUntil,motion.gait,motion.moveX,motion.moveZ,motion.yaw,...motion.armour.map(n=>Number(n>0))].join(":"), cached = motionCacheV6.get(c);
  if(!localProxies && cached?.key === key) return cached.value;
  const legs = { left: rigidLegPoseV6(c, "left", motion), right: rigidLegPoseV6(c, "right", motion) };
  const untransformed = [...(localProxies ?? c.proxies).filter(p => p.slot !== "legL" && p.slot !== "legR"), legs.left.proxy, legs.right.proxy];
  const knockdown = knockdownAmountV6(motion.frame, motion.downUntil), orientation = axisQuatV6([1, 0, 0], -Math.PI / 2 * knockdown), pivot = c.mounts.torso.position;
  const translation = subtract(pivot, rotateQuatV6(pivot, orientation));
  const transformed = untransformed.map(p => transformProxyV6(p, translation, orientation));
  const alive = (p: HitProxyV6) => motion.armour[BODY_SOCKETS_V6.indexOf(p.slot)] > 0;
  // Preserve the authored floor reference, including when shorter or longer legs are mixed.
  const surviving = transformed.filter(alive);
  const floor = c.floorY, low = Math.min(...(surviving.length ? surviving : transformed).map(lowest));
  translation[1] += floor - low;
  const body: BodyFrameV6 = { translation, orientation, knockdown };
  const value = { body, legs, proxies: untransformed.map(p => transformProxyV6(p, translation, orientation)) };
  if(!localProxies) motionCacheV6.set(c,{key,value});
  return value;
}
