import type { Build, CardSlot, OwnedPart, Socket } from "./fixtures";
import type { PaintId } from "@/app/bots/_engine/parts";

export const EQUIPMENT_SOCKETS = ["head", "torso", "armL", "armR", "legL", "legR", "weapon"] as const;
export const EQUIPMENT_KIND: Record<Socket, CardSlot> = { head: "head", torso: "torso", armL: "arms", armR: "arms", legL: "legs", legR: "legs", weapon: "weapon" };
export const EQUIPMENT_LABEL: Record<Socket, string> = { head: "Head", torso: "Body", armL: "Left arm", armR: "Right arm", legL: "Left leg", legR: "Right leg", weapon: "Weapon" };
export type EquipmentIds<T = string> = Record<Socket, T | null>;
export const isLimb = (slot: CardSlot) => slot === "arms" || slot === "legs";
export const singlePrice = (slot: CardSlot, pairPrice: number) => isLimb(slot) ? Math.ceil(pairPrice / 2) : pairPrice;

/** Older saved robots carry one card per pair. Read them without mutating them. */
export function socketsOf(build: Pick<Build, "cards" | "sockets">): EquipmentIds {
  if (build.sockets) return { ...build.sockets };
  const c = build.cards;
  return { head: c.head, torso: c.torso, armL: c.arms, armR: c.arms, legL: c.legs, legR: c.legs, weapon: c.weapon };
}
export const socketUid = (build: Pick<Build, "cards" | "sockets">, socket: Socket) => socketsOf(build)[socket];
export const equippedIds = (build: Pick<Build, "cards" | "sockets">) => new Set(Object.values(socketsOf(build)).filter((id): id is string => id != null));

export function withSockets(build: Build, sockets: EquipmentIds): Build {
  return { ...build, sockets, cards: { head: sockets.head, torso: sockets.torso, arms: sockets.armL, legs: sockets.legL, weapon: sockets.weapon } };
}

/** Preview and placement choose the same single compatible socket. */
export function equipmentTarget(build: Build, slot: CardSlot, preferred?: Socket): Socket {
  if (preferred && EQUIPMENT_KIND[preferred] === slot) return preferred;
  const targets = EQUIPMENT_SOCKETS.filter(s => EQUIPMENT_KIND[s] === slot);
  return targets.find(s => socketUid(build,s) == null) ?? targets[0];
}

/** One owned item can occupy only one socket. Moving it frees its old socket. */
export function fitPart(build: Build, part: OwnedPart, target: Socket): Build {
  if (EQUIPMENT_KIND[target] !== part.slot) throw new Error("That part does not fit this socket.");
  const sockets = socketsOf(build);
  for (const s of EQUIPMENT_SOCKETS) if (sockets[s] === part.uid) sockets[s] = null;
  sockets[target] = part.uid;
  return withSockets(build, sockets);
}

export function equipmentPaints(build: Build, parts: readonly OwnedPart[]): Record<Socket, PaintId | null> {
  const sockets = socketsOf(build);
  const get = (s: Socket) => parts.find(p => p.uid === sockets[s])?.paint ?? null;
  return { head: get("head"), torso: get("torso"), armL: get("armL"), armR: get("armR"), legL: get("legL"), legR: get("legR"), weapon: get("armR") };
}

/** Splitting an owned pair preserves both its paid price and whole-coin resale. */
export function splitPairValue(price: number, salvage = Math.floor(price * .4)) {
  return [
    { price: Math.floor(price / 2), salvage: Math.floor(salvage / 2) },
    { price: Math.ceil(price / 2), salvage: Math.ceil(salvage / 2) },
  ] as const;
}

/** Browser-only legacy migration: preserve every owned pair and its resale value. */
export function splitLegacyEquipment<T extends { equipmentVersion?: number; parts: OwnedPart[]; builds: Record<number, Build> }>(state: T): T {
  if (state.equipmentVersion === 2) return state;
  const parts = state.parts.flatMap(p => isLimb(p.slot)
    ? splitPairValue(p.price, p.salvage).map((value, side) => ({ ...p, ...value, uid: side ? `${p.uid}~r` : p.uid }))
    : [{ ...p }]);
  const builds = Object.fromEntries(Object.entries(state.builds).map(([key, b]) => {
    const s = socketsOf(b);
    if (!b.sockets) {
      if (s.armR) s.armR += "~r";
      if (s.legR) s.legR += "~r";
    }
    return [key, withSockets(b, s)];
  }));
  return { ...state, equipmentVersion: 2, parts, builds };
}
