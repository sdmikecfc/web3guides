import { CARD_BY_ID } from "./fixtures";
import { modularBuild } from "./combat-model";
import type { Part, PaintId } from "@/app/bots/_engine/parts";

/** The public practice display uses real catalogue pieces, including unlike limbs. */
function piece(id: string, paint?: PaintId): Part {
  const card = CARD_BY_ID[id];
  if (!card) throw new Error(`Missing showcase piece: ${id}`);
  return { id, s: [...card.s], ...(paint ? { paint } : {}) };
}

export const SHOWCASE = {
  a: modularBuild(
    piece("head.kettleDome", "mint"), piece("torso.kettleChest", "mint"),
    piece("arms.kettleGrips", "butter"), piece("arms.peeperHooks", "mint"),
    piece("legs.kettleShins", "mint"), piece("legs.peeperStilts", "cream"),
    piece("weapon.sparkDrill"),
  ),
  b: modularBuild(
    piece("head.pistonVisor", "coral"), piece("torso.peeperBox", "cream"),
    piece("arms.peeperHooks", "coral"), piece("arms.kettleGrips", "cream"),
    piece("legs.peeperStilts", "ink"), piece("legs.kettleShins", "cream"),
    piece("weapon.rustySpanner"),
  ),
  names: ["Speedy Otter", "Rusty Beetle"] as [string, string],
  href: "/bots/fight/demo?seed=7&showcase=1",
};
