/**
 * PART ART WITH THE DRAWN FALLBACK: the one loader every screen that puts a
 * bot on a canvas must use.
 *
 * THE HOUSE LAW IT CARRIES: every canvas keeps working with public/bots-art
 * removed. The Fight Viewer already obeyed it (a drawn pit, a drawn crowd,
 * drawn jointed bots) because src/app/bots/_view/scene.ts wraps its
 * Assets.load in a try and falls back to Pixi Graphics. The Garage and the
 * Build screen did not: they called Assets.load bare, so with the folder
 * renamed away the Garage showed five empty stands and the Build screen
 * showed a red error pill over seven empty sockets (verified 2026-09-04,
 * `.bots-preview/verify2/artoff-garage.png` and `artoff-build.png`).
 *
 * This module is that fallback, lifted out so the two screens IMPORT it
 * rather than each writing their own (the import-never-reimplement law:
 * a second copy reproduces the first author's assumptions). The drawing is
 * the same clay figure scene.ts draws, in the same rig frame, so a bot with
 * the art folder gone looks the same in the garage, on the lift and in the
 * pit.
 *
 * FOLLOW-UP (not this lane's files): scene.ts still holds the original
 * private copy of this drawing. Whoever owns scene.ts should delete its
 * `vectorArt` and `loadArt` and import `loadPartArt` from here, so there is
 * exactly one drawing of a fallback part in the repo.
 *
 * NOTHING HERE TOUCHES THE SIM. A fallback texture changes what a frame
 * looks like, never what the engine resolved, so no replay hash can move.
 */
"use client";

import type { Graphics, Renderer, Texture } from "pixi.js";
import type { Pixi } from "@/app/s7/games/_shared/pixi";
import type { PartArt } from "./rig";
import { FIGURE, RIG, maskFile, partFile, type ArtSlot } from "./rig-points";
import { K, TIER_COLOR } from "../_ui/tokens";

const hex = (h: string): number => parseInt(h.slice(1), 16);

/**
 * ── THE DRAWN PART IS DRAWN FROM THE CONTRACT (2026-09-04) ────────────────
 *
 * What stood here was drawn for the canvases that came before the concept
 * contract: a 116 x 116 head box, a 148 x 200 torso, 40 x 140 limbs. The
 * contract then moved every canvas (head to 456 x 384, torso 288 x 264, arm
 * 128 x 280, leg 192 x 280), so with public/bots-art removed the fallback
 * drew each part a quarter of its size in the top-left corner of its own
 * frame, on a figure 3.6 heads tall where the art is 1.94. A player with no
 * art saw a different robot, which is exactly what the house law exists to
 * prevent.
 *
 * It also drew a bolt at every shoulder, hip and grip. The JOIN law deleted
 * joint hardware from the art on the same day; drawing it here put it back.
 *
 * So every number below is READ from FIGURE and RIG, the same pair
 * scripts/bots-bake-parts.mjs draws the shipped art from. The drawn part and
 * the baked part are now the same figure at the same size on the same pivots,
 * and a canvas that moves moves both.
 */
const H = FIGURE.H;
const T = (k: keyof typeof FIGURE.ratio): number => FIGURE.ratio[k].target * H;
/** the head's core width, its full width across the lugs, and its height */
const HEAD_CORE = T("headCoreW"); // 328
const HEAD_FULL = T("headFullW"); // 406
const HEAD_H = T("headH"); // 288
/** the body, the limb shaft, the leg and the shoe */
const BODY_W = T("bodyW"); // 240
const BODY_H = T("bodyH"); // 156
const ARM_W = T("armW"); // 84
const ARM_L = T("armL"); // 121
const LEG_H = T("legH"); // 118
const FOOT_W = T("footW"); // 152
const FOOT_H = T("footH"); // 97
/**
 * How far the shoe splays outboard of its own shaft, as a fraction of the
 * shoe: the contract's stance minus the hip separation, halved. Same
 * derivation as the bake's FOOT_OFF_F, and the reason the two feet clear each
 * other instead of merging into one blob under the body.
 */
const FOOT_OFF =
  (T("stanceW") / 2 - (RIG.torso.hipR[0] - RIG.torso.hipL[0]) / 2 - FOOT_W / 2) / FOOT_W;
/**
 * The shoe's coral, from scripts/bots-art-accents.json. It is NOT one of the
 * eight paints (K has no entry and PAINTS.coral is a different colour a player
 * can buy): the sole stays this colour whatever the bot is painted, and the
 * whole-bot study found it is the single thing that most makes a mixed bot
 * read as one toy. So the drawn part has to carry it too.
 */
const SHOE_CORAL = 0xb46d52;

/** the cache key both halves share: one texture pair per slot, tier, design */
const fileKey = (slot: ArtSlot, tier: number, design: number): string => `${slot}:${tier}:${design}`;
const drawnKey = (slot: ArtSlot, tier: number): string => `vec:${slot}:${tier}`;

/**
 * The drawn stand-in for one part, generated into a texture pair (base plus
 * paint mask) in the rig's own frame, so the rig sockets, tints and joint
 * caps all land exactly where they land on the baked art.
 */
export function drawnPartArt(
  PIXI: Pixi,
  renderer: Renderer,
  slot: ArtSlot,
  tier: number,
  cache: Map<string, PartArt>,
): PartArt {
  const key = drawnKey(slot, tier);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = RIG[slot];
  const base: Graphics = new PIXI.Graphics();
  const mask: Graphics = new PIXI.Graphics();
  const clay = hex(K.clay);
  const edge = 0x9aa3b0;
  const tint = hex(TIER_COLOR[(tier as 1 | 2 | 3 | 4) ?? 1]);
  const tk = ((tier as number) - 1) / 3;
  if (slot === "head") {
    // Half the figure and wider than it is tall, its underside a DOME carried
    // to seat + skirt so the torso covers the bottom of it, and a low round
    // lug on each side whose outer edge is the widest point of the whole toy.
    // The lug is structural: it is what covers the arm's cap.
    const [sx, sy] = RIG.head.neck;
    const top = sy - HEAD_H;
    const er = (HEAD_FULL - HEAD_CORE) / 2;
    for (const s of [-1, 1]) base.circle(sx + s * (HEAD_CORE / 2), sy - er * 0.55, er).fill(clay);
    base.ellipse(sx, (top + sy + FIGURE.skirt) / 2, HEAD_CORE / 2, (HEAD_H + FIGURE.skirt) / 2).fill(clay);
    const eR = HEAD_CORE * 0.145;
    const ey = top + HEAD_H * 0.46;
    for (const s of [-1, 1]) {
      base.circle(sx + s * HEAD_CORE * 0.215, ey, eR).fill(hex(K.glass));
      base.circle(sx + s * HEAD_CORE * 0.215, ey + eR * 0.06, eR * 0.3).fill(hex(K.rubber));
    }
    base.roundRect(sx - HEAD_CORE * 0.185, top + HEAD_H * 0.7, HEAD_CORE * 0.37, HEAD_H * 0.115, HEAD_H * 0.05)
      .fill(hex(K.rubber)); // the grille mouth
    // the one tier mark, on the brow and nowhere near a joint
    base.roundRect(sx - HEAD_CORE * 0.13, top + HEAD_H * 0.05, HEAD_CORE * 0.26, HEAD_H * 0.06, HEAD_H * 0.03)
      .fill(tint);
    for (const s of [-1, 1]) mask.circle(sx + s * (HEAD_CORE / 2), sy - er * 0.55, er).fill(0xffffff);
    mask.ellipse(sx, (top + sy + FIGURE.skirt) / 2, HEAD_CORE / 2, (HEAD_H + FIGURE.skirt) / 2).fill(0xffffff);
  } else if (slot === "torso") {
    // A small wide barrel carrying the skirt above its neck, and the ONE brass
    // piece the whole bot is allowed: the wind-up key, low and to one side so
    // it stays clear of the neck's no-hardware radius.
    const [nx, ny] = RIG.torso.neck;
    base.roundRect(nx - BODY_W / 2, ny - FIGURE.skirt, BODY_W, BODY_H + FIGURE.skirt, BODY_W * 0.28).fill(clay);
    base.roundRect(nx - BODY_W * 0.3, ny + BODY_H * 0.16, BODY_W * 0.6, BODY_H * 0.44, BODY_W * 0.06)
      .stroke({ width: 3, color: edge }); // a moulded chest panel: shape, not hardware
    const kx = nx + BODY_W * 0.24;
    const ky = ny + BODY_H * 0.42;
    const kr = BODY_W * 0.052 + tk * 3;
    base.roundRect(kx - kr * 0.28, ky - kr * 0.2, kr * 0.56, kr * 2.3, kr * 0.28).fill(hex(K.brass));
    for (const s of [-1, 1]) base.circle(kx + s * kr * 0.85, ky - kr * 0.55, kr * 0.72).fill(hex(K.brass));
    mask.roundRect(nx - BODY_W / 2, ny - FIGURE.skirt, BODY_W, BODY_H + FIGURE.skirt, BODY_W * 0.28).fill(0xffffff);
  } else if (slot === "arm") {
    // Short and thick: length over width is 1.33. One capsule and a mitt, its
    // cap half buried under the body group. No bolt, no ring, no collar.
    const [sx, sy] = RIG.arm.shoulder;
    const top = sy - ARM_W / 2;
    const mr = ARM_W * (0.56 + tk * 0.02);
    base.roundRect(sx - ARM_W / 2, top, ARM_W, ARM_W / 2 + ARM_L, ARM_W / 2).fill(clay);
    base.circle(sx, top + ARM_W / 2 + ARM_L - mr * 0.45, mr).fill(clay);
    base.roundRect(sx - ARM_W / 2, top + ARM_W / 2 + ARM_L * 0.42, ARM_W, ARM_L * 0.1, ARM_W * 0.1)
      .stroke({ width: 3, color: edge }); // a moulded elbow ring, in clay
    mask.roundRect(sx - ARM_W / 2, top, ARM_W, ARM_W / 2 + ARM_L, ARM_W / 2).fill(0xffffff);
    mask.circle(sx, top + ARM_W / 2 + ARM_L - mr * 0.45, mr).fill(0xffffff);
  } else if (slot === "leg") {
    // Mostly foot: 0.21 H of leg against 0.174 H of shoe leaves a short shin,
    // which is what makes the concept bot read as a toy standing on two shoes.
    // The shoe splays OUTBOARD, and the rig mirrors the sprite for the pair.
    const [hx, hy] = RIG.leg.hip;
    const lw = ARM_W * 1.02;
    const top = hy - lw / 2;
    const floor = hy + LEG_H;
    base.roundRect(hx - lw / 2, top, lw, lw / 2 + LEG_H - FOOT_H * 0.55, lw / 2).fill(clay);
    const fx0 = hx + FOOT_W * FOOT_OFF - FOOT_W / 2;
    base.roundRect(fx0, floor - FOOT_H, FOOT_W, FOOT_H, FOOT_H * 0.46).fill(clay);
    base.roundRect(fx0 + FOOT_W * 0.06, floor - FOOT_H * 0.34, FOOT_W * 0.88, FOOT_H * 0.22, FOOT_H * 0.11)
      .fill(SHOE_CORAL); // the sole, the one colour a paint never changes
    mask.roundRect(hx - lw / 2, top, lw, lw / 2 + LEG_H - FOOT_H * 0.55, lw / 2).fill(0xffffff);
    mask.roundRect(fx0, floor - FOOT_H, FOOT_W, FOOT_H - FOOT_H * 0.34, FOOT_H * 0.46).fill(0xffffff);
  } else {
    // A tool, not a fitting: clay and one rubber grip. The brass budget is
    // spent on the torso's key, so nothing here is brass.
    const [gx, gy] = RIG.weapon.grip;
    const hh = 64 + tk * 16;
    base.roundRect(gx + 26, gy - 8, 100, 16, 8).fill(clay);
    base.roundRect(gx + 120, gy - hh / 2, 62, hh, 14).fill(clay);
    base.roundRect(gx + 120, gy - hh / 2, 62, hh, 14).stroke({ width: 3, color: edge });
    base.roundRect(gx - 24, gy - 12, 56, 24, 12).fill(hex(K.rubber)); // the grip
    mask.roundRect(gx + 26, gy - 8, 100, 16, 8).fill(0xffffff);
    mask.roundRect(gx + 120, gy - hh / 2, 62, hh, 14).fill(0xffffff);
  }
  const frame = new PIXI.Rectangle(0, 0, r.w, r.h);
  const art: PartArt = {
    base: renderer.generateTexture({ target: base, frame, resolution: 1 }),
    mask: renderer.generateTexture({ target: mask, frame, resolution: 1 }),
  };
  base.destroy();
  mask.destroy();
  cache.set(key, art);
  return art;
}

/**
 * Load one part's baked PNG pair, and fall back to the drawn part when the
 * file is not there. An unpainted part (a missing mask on a present base) is
 * better than an unbuilt one, so the mask alone is allowed to fail.
 *
 * `cache` is the caller's map and MUST be cleared when the caller's stage is
 * destroyed: a generated texture belongs to the renderer that made it.
 */
export async function loadPartArt(
  PIXI: Pixi,
  renderer: Renderer,
  slot: ArtSlot,
  tier: number,
  design: number,
  cache: Map<string, PartArt>,
): Promise<PartArt> {
  const key = fileKey(slot, tier, design);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const base = (await PIXI.Assets.load(partFile(slot, tier, design))) as Texture;
    let mask: Texture | null = null;
    try {
      mask = (await PIXI.Assets.load(maskFile(slot, tier, design))) as Texture;
    } catch {
      mask = null; // unpainted is better than unbuilt
    }
    const art: PartArt = { base, mask };
    cache.set(key, art);
    return art;
  } catch {
    // the house law: every canvas keeps working with public/bots-art removed
    return drawnPartArt(PIXI, renderer, slot, tier, cache);
  }
}
