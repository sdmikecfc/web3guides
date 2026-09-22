/**
 * WHAT A GAME ROBOT LOOKS LIKE, in one table.
 *
 * THE PROBLEM THIS FIXES. A player's robot is normally FOUR colours at once,
 * because every part keeps the colour it arrived in for life (ADR-0141). The
 * game's own nine robots have no parts and therefore no colours at all, so
 * every surface that drew one drew unpainted grey clay: the ladder on the
 * fights page, every finished fight in the list beside it, the board, and the
 * loser on the knockout card. A grey dummy standing next to a mint and coral
 * robot does not read as an opponent, it reads as a robot that failed to
 * load. Wobble, Clatter and Digger are CHARACTERS a player meets over and
 * over, and a character has a face.
 *
 * SO EACH OF THE NINE GETS ITS OWN LOOK, and the look says what the shape
 * already says in words. Rattle is "slow and thick", so it is moss and iron
 * with a bell. Buzz is "fast, thin armour", so it is wasp yellow on ink with
 * a spring on its head. Digger "hits harder than anything else", so it is
 * digger yellow on black tracks with two spanners on its chest. A player who
 * has fought Buzz twice knows Buzz on sight in a list of fifty rows.
 *
 * NOTHING HERE IS EARNED AND NOTHING HERE IS A PRIZE. A game robot wears no
 * stars, no patches, no cuffs, no sparkle and no crown: those are marks a
 * player's robot wins, and putting one on the house would be printing a medal
 * nobody was given. Colours, a face, one sticker and (on three of them) one
 * hat are chosen, not won, which is exactly what a player chooses too.
 *
 * IT IS NOT IN THE ENGINE, AND IT NEVER CAN BE. src/app/bots/_engine builds
 * a house robot out of five parts and three numbers each and has never heard
 * of a colour; the replay rollup in scripts/bots-harness.ts is what holds
 * that line. This file is read only by the things that DRAW a robot: the
 * portrait compositor, the stored look on a fight row, and the replay's
 * reader. A colour written here can no more change a fight than a sticker on
 * a player's robot can.
 *
 * ONE TABLE, EVERY SURFACE. The ladder, the fights list, the board, the
 * knockout card and the ring all end up here, so Clatter is the same Clatter
 * in all five and a change is made once.
 */
import type { Build, PaintId, Part, Slot } from "@/app/bots/_engine/parts";
import type { CardSlot } from "./fixtures";
import {
  NO_LOOK,
  NO_MARKS,
  socketPaints,
  type BotLook,
  type FaceId,
  type HatId,
  type LookMarks,
  type SocketPaints,
  type StickerId,
  type StickerSpot,
} from "./look";

/** One game robot's colours and what it has chosen to wear. */
export interface HouseLook {
  /** the colour of the card in each of the five slots (the weapon rides the
   *  arm, so its entry is only read when an arm has none) */
  slots: Readonly<Record<CardSlot, PaintId>>;
  face: FaceId;
  sticker: StickerId;
  spot: StickerSpot;
  /** three of the nine wear one, because a hat changes the SKYLINE and a
   *  silhouette is what a reader picks out of a list of fifty rows */
  hat: { kind: HatId; color: PaintId } | null;
}

const look = (
  head: PaintId,
  torso: PaintId,
  arms: PaintId,
  legs: PaintId,
  face: FaceId,
  sticker: StickerId,
  spot: StickerSpot,
  hat: { kind: HatId; color: PaintId } | null = null,
): HouseLook => ({ slots: { head, torso, arms, legs, weapon: arms }, face, sticker, spot, hat });

/**
 * THE NINE, in the catalogue's own order (easy, harder, hardest).
 *
 * Every one of them is a different pair of colours from every other one, and
 * no two share a face and a sticker, so two game robots side by side in the
 * fights list are never mistaken for each other. The `plate` sticker is the
 * one of the six that is not used: it draws a bordered box with two dots,
 * which at list size reads as a picture that failed to load.
 */
export const HOUSE_LOOKS: Readonly<Record<string, HouseLook>> = {
  // EASY
  /** a friendly tin dog: soft butter over sky, floppy ears */
  tinpup: look("butter", "sky", "cream", "sky", "happy", "star", "chest", { kind: "ears", color: "butter" }),
  /** slow and thick: moss over iron, and it rattles */
  kettle: look("moss", "moss", "cream", "ink", "calm", "stripes", "chest", { kind: "bell", color: "butter" }),
  /** hard to hit: lilac and sky, and it never stops leaning */
  wobble: look("lilac", "lilac", "cream", "sky", "happy", "heart", "chest"),
  // HARDER
  /** very fast, falls apart: coral over cream, propeller spinning */
  clatter: look("cream", "coral", "coral", "cream", "wink", "bolt", "chest", { kind: "propeller", color: "coral" }),
  /** blocks nearly every swing: moss plate over iron */
  anvil: look("ink", "moss", "ink", "moss", "calm", "stripes", "chest"),
  /** it rarely misses: big bright eyes over butter */
  peeper: look("sky", "butter", "sky", "butter", "stars", "star", "cheek"),
  // HARDEST
  /** wasp yellow on ink, with a spring for an antenna */
  hornet: look("butter", "ink", "butter", "ink", "wink", "bolt", "chest", { kind: "spring", color: "butter" }),
  /** digger yellow on black tracks, two spanners on the chest */
  bulldozer: look("butter", "butter", "ink", "ink", "calm", "wrenches", "chest"),
  /** it dodges a lot: lilac limbs under an ink body */
  gremlin: look("ink", "ink", "lilac", "lilac", "wink", "star", "chest"),
};

/** The plain robot a shape the table has never heard of falls back to: iron
 *  and cream, a calm face, nothing on it. Never grey clay. */
export const HOUSE_FALLBACK: HouseLook = look("ink", "ink", "cream", "cream", "calm", "stripes", "chest");

export function houseLook(shapeId: string | null | undefined): HouseLook {
  return (shapeId && HOUSE_LOOKS[shapeId]) || HOUSE_FALLBACK;
}

/** The seven sockets' colours for one game robot. */
export function houseSocketPaints(shapeId: string | null | undefined): SocketPaints {
  const h = houseLook(shapeId);
  return socketPaints((slot) => h.slots[slot]);
}

/** What a game robot has chosen to wear. Nothing on it is earned. */
export function houseBotLook(shapeId: string | null | undefined): BotLook {
  const h = houseLook(shapeId);
  return {
    ...NO_LOOK,
    face: h.face,
    sticker: h.sticker,
    spot: h.spot,
    stickerPaint: null,
    hat: h.hat ? { kind: h.hat.kind, color: h.hat.color } : null,
    plateNumber: null,
  };
}

/** A game robot wins nothing, so it wears nothing it has won. */
export const HOUSE_MARKS: LookMarks = NO_MARKS;

/**
 * WHICH GAME ROBOT A BUILD IS, read off the build itself.
 *
 * The engine names a house part `house.<shape>.<slot>` (parts.ts scaleShape),
 * so a stored fight from before any of this existed still says which of the
 * nine it was fighting. That matters: the fights list is mostly rows written
 * weeks ago, and a picture that only worked for new rows would leave the old
 * ones grey. Returns null for a player's robot, which is every build whose
 * parts came off the shelf.
 */
export function houseShapeIdOfBuild(build: Build | null | undefined): string | null {
  const id = build?.torso?.id || build?.head?.id || "";
  const m = /^house\.([a-z0-9_-]{1,24})\./.exec(id);
  return m ? m[1] : null;
}

/**
 * The same build with each part carrying its game robot's colour.
 *
 * WHY THE COLOUR GOES ON THE BUILD. Every drawing surface asks the same
 * question of a robot ("what colour is the card in this slot?", _view/pieces
 * slotPaint), and a part's own paint is the answer for a player's robot. A
 * copy is returned and the original is never touched, because the build the
 * engine resolved a fight from must stay exactly as it was resolved.
 */
export function paintedHouseBuild(build: Build, shapeId?: string | null): Build {
  const h = houseLook(shapeId ?? houseShapeIdOfBuild(build));
  const dress = (p: Part, slot: Slot): Part => ({ id: p.id, s: [p.s[0], p.s[1], p.s[2]], paint: h.slots[slot] });
  return {
    legs: dress(build.legs, "legs"),
    arms: dress(build.arms, "arms"),
    torso: dress(build.torso, "torso"),
    head: dress(build.head, "head"),
    weapon: dress(build.weapon, "weapon"),
  };
}
