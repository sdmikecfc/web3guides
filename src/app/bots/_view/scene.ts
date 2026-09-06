/**
 * THE PIT (screens doc 4.2, engine doc 6): everything the fight viewer
 * paints. Sim space 1600x900 letterboxed by createPixiStage (used as is, the
 * S7 pixi.ts law); the pit backplate is the WebP first, else a vector pit
 * (cream floor, black rim, two posts, a string of bulbs, a curved bank of
 * tiny figures); bot A at x 560 facing right, B at x 1040 mirrored, feet on
 * the floor line; every part keeps a drawn fallback so the whole scene runs
 * with public/bots-art deleted (the house law).
 *
 * Shape copied from _view/bay.ts and the S7 front scene
 * (src/app/s7/front/scene.ts): owns no rAF, the client drives render();
 * constructors come from stage.pixi so pixi stays client-only. THE RENDERER
 * NEVER DECIDES ANYTHING: it reads the engine's FightState (swingT for the
 * tell and the lunge, staggerT for the wobble, armor for the bars and the
 * missing pieces) and the FightFx timers the client set from the log. There
 * is no Math.random here; the tumble is seeded in fightfx.ts.
 *
 * The rig is the Build screen's rig (rig.ts) unchanged: a fight pose is a
 * set of DELTAS applied to its seven nodes after rig.update() runs the idle,
 * so the two screens can never disagree about what a bot looks like. Rig
 * tweens step at 12 fps (fightfx.q12); the crumbs, sparks and debris run at
 * 60.
 */
"use client";

import type { Container, Graphics, Sprite, Texture } from "pixi.js";
import { createPixiStage, type Pixi, type PixiStage } from "@/app/s7/games/_shared/pixi";
import { DRAW_ORDER, PART_SCALE, buildRig, handOffset, paintBrokenFace, RIG_HEIGHT, type BotMood, type PartArt, type Rig } from "./rig";
import type { BotLook } from "./look";
import { bodyTintOf } from "./look-view";
import { FIGURE, RIG, maskFile, partFile, type ArtSlot } from "./rig-points";
import { K, M, TIER_COLOR } from "../_ui/tokens";
import { fnv1a } from "../_engine/rng";
import { PIECE, PIECE_COUNT, partTier, type Build, type FightEvent, type Piece, type Side, type Slot } from "../_engine/parts";
import { PARTS } from "../_engine/catalog";
import type { FightState } from "../_engine/resolve";
import {
  ARMS_UP_S,
  BARS_SHOW_S,
  BLINK_S,
  BLOCK_S,
  CHEER_S,
  CRACK_S,
  CRUMB_S,
  HIT_STOP_S,
  KO_PUNCH_S,
  LEAN_S,
  LUNGE_F,
  RECOIL_S,
  RECOVER_S,
  SHAKE_S,
  SIT_S,
  SMOKE_S,
  TELL_F,
  ease,
  settleFightFx,
  spawnCrumbs,
  spawnDebris,
  spawnSmoke,
  stepped,
  tumbleKey,
  type FightFx,
} from "./fightfx";
import type { Socket } from "@/lib/bots/fixtures";

// ── the stage ───────────────────────────────────────────────────────────────

export const SIM_W = 1600;
export const SIM_H = 900;
/** the phone camera: pushed in so the pit rim spans the width (4.2) */
const SMALL_CROP_W = 1170;
export const BOT_X: readonly [number, number] = [560, 1040];
export const FLOOR_Y = 600;
/** the pit floor's front edge (the plate's cream floor measured: back edge
 * y 386, front edge y 614 at the centre, the rim spanning x 160 to 1440) */
const PIT_FLOOR = { cx: SIM_W / 2, cy: 500, rx: 560, ry: 114 } as const;
/** a bot stands about 320 sim px tall in the pit */
const RIG_SCALE = 320 / RIG_HEIGHT;
const HOP_PX = 120;
const DEG = Math.PI / 180;

/** engine piece index -> rig socket (the weapon is a socket with no armor) */
const SOCKET_OF_PIECE: readonly Socket[] = ["head", "torso", "armL", "armR", "legL", "legR"];
const ART_OF_SOCKET: Record<Socket, ArtSlot> = {
  head: "head", torso: "torso", armL: "arm", armR: "arm", legL: "leg", legR: "leg", weapon: "weapon",
};
const SLOT_OF_SOCKET: Record<Socket, Slot> = {
  head: "head", torso: "torso", armL: "arms", armR: "arms", legL: "legs", legR: "legs", weapon: "weapon",
};

/** one colour on every socket: what a rig wears before a look has dressed it */
const flatPaints = (hex: number): Record<Socket, number> => ({
  head: hex, torso: hex, armL: hex, armR: hex, legL: hex, legR: hex, weapon: hex,
});

/**
 * The head's crown above its own neck pivot. The head canvas holds a
 * band-maximum head, so the drawn crown starts FIGURE.headApexY rows below
 * the canvas top; anything that hangs something over the head has to take
 * that off or it floats.
 */
const HEAD_TOP = RIG.head.neck[1] - FIGURE.headApexY; // 288

/**
 * The face's own points, in the head canvas, derived the way the bake derives
 * them. The drawn stand-in below has to put its eyes here or the rig's lit
 * bulb (_view/rig.ts) hangs over the forehead when public/bots-art is gone.
 */
const HEAD_CORE_W = FIGURE.ratio.headCoreW.target * FIGURE.H; // 328.2
const HEAD_ART_H = FIGURE.ratio.headH.target * FIGURE.H; // 288.4
const HEAD_CROWN = RIG.head.neck[1] - HEAD_ART_H; // 26.6
const EYE_DX = HEAD_CORE_W * 0.215; // 70.6
const EYE_CY = HEAD_CROWN + HEAD_ART_H * 0.46; // 159.3
const EYE_R = HEAD_CORE_W * 0.145; // 47.6
const MOUTH_Y = HEAD_CROWN + HEAD_ART_H * 0.7; // 228.5
/**
 * HP bar offsets from each socket pivot, in rig units. Every one of these had
 * to move with the concept contract, because every pivot did: the head's
 * pivot is its neck and the crown is now 288 above it rather than 150, and a
 * limb's pivot is now half a limb width down its own shaft rather than 20
 * from the top of a 200-tall canvas. Left alone, the head's bar drew across
 * its own forehead.
 */
const BAR_AT: Record<Socket, readonly [number, number]> = {
  head: [0, -HEAD_TOP - 26], torso: [0, -20], armL: [0, 74], armR: [0, 74], legL: [0, 52], legR: [0, 52], weapon: [0, 0],
};
/**
 * The MIDDLE of a part, for crumbs, sparks and the tumble's start. Separate
 * from BAR_AT because the two want different points and folding them into one
 * number (a bar offset plus 90 for the head) is what left the old head's
 * crumbs floating above it. Nothing here reaches the engine: a crumb's
 * position is fx state, so no replay hash can move.
 */
const HIT_AT: Record<Socket, readonly [number, number]> = {
  head: [0, -HEAD_TOP * 0.55], torso: [0, -34], armL: [0, 74], armR: [0, 74], legL: [0, 66], legR: [0, 66], weapon: [0, 0],
};
const BAR_W = 36;
const BAR_H = 5;
/** the weapon's rest angle in the hand, as rig.ts has it. The shoulder to
 *  hand vector is NOT copied here any more: rig.ts exports handOffset, which
 *  carries the arm's own scale, and a second copy of that formula was one
 *  more thing to get wrong. */
const WEAPON_REST = -0.62;

/** the bulbs on the WebP plate's front rim, measured off the render (sim
 * px); the fallback pit draws its own string on the same arc */
const BULBS: readonly (readonly [number, number])[] = [
  [182, 576], [218, 597], [254, 617], [299, 632], [344, 646], [400, 658], [456, 669], [521, 683], [586, 697],
  [656, 703], [727, 709], [800, 707], [874, 704], [943, 699], [1013, 695], [1081, 688], [1149, 680],
  [1206, 668], [1263, 656], [1314, 638], [1365, 619], [1399, 605], [1433, 591], [1457, 558], [1482, 524],
];
const PLATE_FILE = "/bots-art/plates/pit-side-on.webp";

const hex = (h: string): number => parseInt(h.slice(1), 16);

export interface FightSceneOpts {
  small: boolean;
  fightSeed: number;
}

export interface FightSceneHandle {
  stage: PixiStage;
  /** true when the WebP plate loaded; false = the vector pit */
  plate: boolean;
  /**
   * LOAD BOTH BUILDS' ART ONTO THE RIGS (vector fallback per part) AND DRESS
   * THEM. A look, not a paint: a robot is normally FOUR colours at once (head,
   * body, arms, legs, and the weapon rides the arm), and it also carries the
   * face it chose, the sticker in its spot, its plate number, the hat it won
   * and every mark it earned. The pit used to flatten all of that to one
   * colour per robot, which is why the same eight paints made the whole
   * catalogue read as two robots at ring size.
   *
   * The caller builds the look with _view/look-view.ts, from what the SERVER
   * stored on the fight row. Nothing here decides what a robot has earned.
   */
  setBuilds: (a: Build, b: Build, looks: readonly [BotLook, BotLook]) => Promise<void>;
  /** one new engine event: spawn what it needs at the right sim point */
  onEvent: (e: FightEvent, st: FightState, fx: FightFx) => void;
  /** back to the bell (a seek): every node visible, no debris, no cracks */
  reset: () => void;
  /** after a seek replayed its events: detach every cracked piece now and
   * settle every timer, so the next render is one still frame */
  settle: (fx: FightFx) => void;
  /** the tell's glint: a two-frame flash on the weapon */
  glint: (side: Side) => void;
  render: (st: FightState, fx: FightFx) => void;
  resize: (cssW: number, cssH: number, dpr: number) => void;
  destroy: () => void;
}

interface Pending {
  side: Side;
  piece: Piece;
  frame: number;
  key: number;
}

interface DebrisNode {
  root: Container;
  /** the fx.debris slot this node paints */
  index: number;
}

/** Which launch design a part id draws: its index inside the slot's tier
 * group when it is a catalog card, else a fixed pick from the id (the seed
 * never designs; a canonical or house part just borrows a shelf design). */
export function designOf(part: { id: string; s: readonly number[] }, slot: Slot): { tier: number; design: 1 | 2 } {
  const total = part.s[0] + part.s[1] + part.s[2];
  const tier = partTier(total);
  const group = PARTS.filter((p) => p.slot === slot && p.tier === tier);
  const i = group.findIndex((p) => p.id === part.id);
  if (i >= 0) return { tier, design: i % 2 === 0 ? 1 : 2 };
  return { tier, design: (fnv1a(part.id) & 1) === 0 ? 1 : 2 };
}


/**
 * THE DRAWN PART, ON THE CONCEPT CONTRACT (2026-09-04).
 *
 * Exported, and module level, for two reasons. It is the house law's fallback
 * ("every screen keeps working with public/bots-art deleted") so it has to be
 * testable without a renderer, and there must be exactly one drawing of a
 * fallback part in the repo: `_view/part-art.ts` holds a second copy that the
 * Garage and the Build screen still call, and it is on the OLD canvases.
 *
 * The canvases changed with the contract (head 160x160 -> 456x384, torso
 * 200x240 -> 288x264, arm and leg 90x200 -> 128x280 and 192x280) and the old
 * drawing did not follow them, so with the art folder gone every part landed
 * as a quarter-size shape in the corner of its own canvas. Redrawn to the
 * contract's own pivots: a domed head wider than it is tall whose UNDERSIDE
 * IS A DOME (a head cut off at its widest row lays a straight bar across the
 * chest), low side lugs whose outer edge is the full head width so they hide
 * the shoulder caps, a small wide barrel body, stubby limbs whose pivot is
 * half their own width below their own top, wide splayed feet, one piece of
 * brass on the whole figure, and no hardware at any joint.
 */
export function drawVectorPart(PIXI: Pixi, slot: ArtSlot, tier: number): { base: Graphics; mask: Graphics } {
  const base: Graphics = new PIXI.Graphics();
  const mask: Graphics = new PIXI.Graphics();
  const clay = hex(K.clay);
  const edge = 0x9aa3b0;
  const tint = hex(TIER_COLOR[(tier as 1 | 2 | 3 | 4) ?? 1]);
  // THE DRAWN PART, ON THE CONCEPT CONTRACT (2026-09-04). The canvases
  // changed with the contract (head 160x160 -> 456x384, torso 200x240 ->
  // 288x264, arm and leg 90x200 -> 128x280 and 192x280) and this drawing
  // did not follow them, so with public/bots-art deleted every part landed
  // as a quarter-size shape in the corner of its own canvas. Redrawn to the
  // contract's own pivots: a domed head wider than it is tall whose
  // UNDERSIDE IS A DOME (a head cut off at its widest row lays a straight
  // bar across the chest), low side lugs whose outer edge is the full head
  // width so they hide the shoulder caps, a small wide barrel body, stubby
  // limbs whose pivot is half their own width below their own top, wide
  // splayed feet, and no hardware at any joint.
  const H = RIG.head, T = RIG.torso, A = RIG.arm, L = RIG.leg, Wp = RIG.weapon;
  if (slot === "head") {
    const cx = H.neck[0], cy = 198, rx = 166, ry = 172;
    for (const lx of [cx - 154, cx + 154]) {
      base.circle(lx, cy - 30, 56).fill(clay); // the structural side lug
      base.circle(lx, cy - 30, 56).stroke({ width: 4, color: edge });
      mask.circle(lx, cy - 30, 56).fill(0xffffff);
    }
    base.ellipse(cx, cy, rx, ry).fill(clay);
    base.ellipse(cx, cy, rx, ry).stroke({ width: 4, color: edge });
    mask.ellipse(cx, cy, rx, ry).fill(0xffffff);
    // THE EYES AND THE MOUTH GO WHERE THE CONTRACT PUTS THEM, not where this
    // drawing used to guess (they were 9 across and 31 down from the baked
    // ones). Three files draw an eye at this point now, the bake, part-art.ts
    // and this, and _view/rig.ts hangs the lit bulb over it, so a stand-in
    // that guessed left the light floating above the eye with the art folder
    // deleted. Same formula as scripts/bots-bake-parts.mjs headParts().
    for (const ex of [cx - EYE_DX, cx + EYE_DX]) {
      base.circle(ex, EYE_CY, EYE_R).fill(hex(K.glass));
      base.circle(ex, EYE_CY, EYE_R * 0.3).fill(hex(K.rubber));
    }
    base.circle(cx, EYE_CY + EYE_R * 1.15, 12).fill(tint); // the tier stud
    base.roundRect(cx - HEAD_CORE_W * 0.185, MOUTH_Y, HEAD_CORE_W * 0.37, HEAD_ART_H * 0.115, 14)
      .fill(hex(K.rubber)); // the grille
  } else if (slot === "torso") {
    const x0 = 24, y0 = 8, w = T.w - 48, h = 212;
    base.roundRect(x0, y0, w, h, 78).fill(clay);
    base.roundRect(x0, y0, w, h, 78).stroke({ width: 4, color: edge });
    mask.roundRect(x0, y0, w, h, 78).fill(0xffffff);
    base.roundRect(T.decal[0] - 46, T.decal[1] + 22, 92, 34, 10).fill(hex(K.rubber)); // the vent
    for (let i = 0; i < 3; i++) base.rect(T.decal[0] - 38, T.decal[1] + 28 + i * 9, 76, 4).fill(0x6b6b72);
    // the ONE piece of metal on the whole figure: the wind-up key
    base.circle(T.decal[0] + 52, T.decal[1] - 14, 11).fill(hex(K.brass));
    base.circle(T.decal[0] + 74, T.decal[1] - 14, 11).fill(hex(K.brass));
    base.roundRect(T.decal[0] + 60, T.decal[1] - 14, 6, 40, 3).fill(hex(K.brass));
    base.circle(T.decal[0] - 58, T.decal[1] - 22, 13).fill(tint); // the tier lamp
  } else if (slot === "arm") {
    const px = A.shoulder[0], py = A.shoulder[1], hw = 43;
    base.roundRect(px - hw, py - hw, hw * 2, 165, hw).fill(clay);
    base.roundRect(px - hw, py - hw, hw * 2, 165, hw).stroke({ width: 4, color: edge });
    base.circle(A.hand[0], A.hand[1] - 8, 42).fill(clay); // the mitt
    base.circle(A.hand[0], A.hand[1] - 8, 42).stroke({ width: 4, color: edge });
    mask.roundRect(px - hw, py - hw, hw * 2, 165, hw).fill(0xffffff);
    mask.circle(A.hand[0], A.hand[1] - 8, 42).fill(0xffffff);
  } else if (slot === "leg") {
    const px = L.hip[0], py = L.hip[1], hw = 44;
    base.roundRect(px - hw, py - hw, hw * 2, 90, hw).fill(clay);
    base.roundRect(px - hw, py - hw, hw * 2, 90, hw).stroke({ width: 4, color: edge });
    mask.roundRect(px - hw, py - hw, hw * 2, 90, hw).fill(0xffffff);
    // the foot is wide, splayed and toes OUTWARD: the leg is mostly foot
    base.roundRect(15, L.foot[1] - 81, 154, 81, 34).fill(clay);
    base.roundRect(15, L.foot[1] - 81, 154, 81, 34).stroke({ width: 4, color: edge });
    mask.roundRect(15, L.foot[1] - 81, 154, 81, 34).fill(0xffffff);
    base.roundRect(19, L.foot[1] - 26, 146, 22, 11).fill(hex(K.rubber)); // the sole
  } else {
    base.roundRect(Wp.grip[0] - 30, Wp.grip[1] - 10, 130, 20, 10).fill(hex(K.rubber)); // the handle
    base.roundRect(Wp.grip[0] + 88, Wp.grip[1] - 50, 84, 84, 16).fill(hex(K.brass)); // the head
    base.roundRect(Wp.grip[0] + 88, Wp.grip[1] - 50, 84, 84, 16).stroke({ width: 4, color: 0xa87a2a });
    base.circle(Wp.grip[0], Wp.grip[1], 12).fill(tint); // the grip band
    mask.roundRect(Wp.grip[0] + 88, Wp.grip[1] - 50, 84, 84, 16).fill({ color: 0xffffff, alpha: 0 });
  }
  return { base, mask };
}

export async function buildFightScene(canvas: HTMLCanvasElement, opts: FightSceneOpts): Promise<FightSceneHandle> {
  const stage = await createPixiStage(canvas, { background: 0x2a1f1a });
  const PIXI = stage.pixi;
  const W = stage.world;

  // the camera: shake and the KO punch move this, never the world
  const cam: Container = new PIXI.Container();
  cam.pivot.set(SIM_W / 2, SIM_H / 2);
  cam.position.set(SIM_W / 2, SIM_H / 2);
  W.addChild(cam);

  // ── the backplate: WebP first, else the vector pit ───────────────────────
  let plate = false;
  const back: Container = new PIXI.Container();
  cam.addChild(back);
  const crowd: { node: Container; arms: Graphics; phase: number; baseY: number }[] = [];
  try {
    const tex = (await PIXI.Assets.load(PLATE_FILE)) as Texture;
    const sp: Sprite = new PIXI.Sprite(tex);
    // 1600x904: two rows spill top and bottom, centred
    sp.position.set(0, (SIM_H - tex.height) / 2);
    back.addChild(sp);
    plate = true;
  } catch {
    drawVectorPit(back);
  }

  function drawVectorPit(into: Container) {
    // the hall: a warm dark wall, lit from above (the DK derived-lighting rule)
    const wall: Graphics = new PIXI.Graphics();
    for (let i = 0; i < 6; i++) {
      const c = [0x3a2c24, 0x372a22, 0x33271f, 0x2f231c, 0x2b2019, 0x271d17][i];
      wall.rect(0, (i * 380) / 6, SIM_W, 380 / 6 + 1).fill(c);
    }
    into.addChild(wall);
    // the stands: three curved benches
    const benches: Graphics = new PIXI.Graphics();
    for (let r = 0; r < 3; r++) {
      const y = 330 - r * 62;
      benches.ellipse(SIM_W / 2, y, 760 + r * 40, 44).fill(r % 2 === 0 ? 0x5a4a3e : 0x51423a);
      benches.ellipse(SIM_W / 2, y - 6, 760 + r * 40, 40).fill(r % 2 === 0 ? 0x6b5a4c : 0x615146);
    }
    into.addChild(benches);
    // forty tiny figures at fixed seats (authored offsets, never rolled)
    const paints = [hex("#8fd9c4"), hex("#ff8a7a"), hex("#ffd166"), hex("#7fb8ff"), hex("#b9a7ff"), hex("#8fbf6a")];
    const seats: [number, number][] = [];
    const per = [14, 13, 13];
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < per[r]; i++) {
        const t = (i + 0.5) / per[r];
        const x = 300 + t * 1000 + (r % 2) * 22;
        const y = 300 - r * 62 - Math.sin(t * Math.PI) * 18;
        seats.push([x, y]);
      }
    }
    seats.forEach(([x, y], i) => {
      const node: Container = new PIXI.Container();
      const body: Graphics = new PIXI.Graphics();
      const c = paints[(i * 7) % paints.length];
      body.roundRect(-9, -30, 18, 30, 8).fill(c);
      body.circle(0, -38, 9).fill(hex(K.clay));
      body.circle(-3, -39, 1.6).fill(hex(K.rubber));
      body.circle(3, -39, 1.6).fill(hex(K.rubber));
      const arms: Graphics = new PIXI.Graphics();
      arms.roundRect(-16, -50, 5, 22, 2.5).fill(c);
      arms.roundRect(11, -50, 5, 22, 2.5).fill(c);
      arms.visible = false;
      node.addChild(body, arms);
      node.position.set(x, y);
      node.scale.set(0.9 + (i % 3) * 0.05);
      into.addChild(node);
      crowd.push({ node, arms, phase: (i * 0.37) % 1.6, baseY: y });
    });
    // the pit: a shallow round floor, black rubber rim, painted centre line
    const pit: Graphics = new PIXI.Graphics();
    pit.ellipse(SIM_W / 2, 500, 680, 150).fill(0x2a2a2e); // the rim's shadow
    pit.ellipse(SIM_W / 2, 494, 668, 140).fill(hex(K.rubber));
    pit.ellipse(SIM_W / 2, 494, 640, 118).fill(hex(K.floor));
    pit.ellipse(SIM_W / 2, 480, 600, 96).fill(0xd8cfc0);
    pit.ellipse(SIM_W / 2, 470, 560, 78).fill(0xe2d9c9);
    // the centre line and the two bolted marks
    pit.rect(SIM_W / 2 - 2, 380, 4, 230).fill({ color: 0xb9ad9b, alpha: 0.6 });
    for (const x of BOT_X) {
      pit.circle(x, FLOOR_Y + 8, 12).fill({ color: 0xb9ad9b, alpha: 0.5 });
      pit.circle(x, FLOOR_Y + 8, 4).fill(hex(K.brass));
    }
    into.addChild(pit);
    // two back posts with the rope
    const posts: Graphics = new PIXI.Graphics();
    for (const x of [470, 1130]) {
      posts.roundRect(x - 12, 360, 24, 60, 8).fill(0x9aa0a8);
      posts.roundRect(x - 12, 360, 24, 12, 6).fill(0xb8bec6);
    }
    posts.moveTo(482, 378);
    posts.quadraticCurveTo(SIM_W / 2, 400, 1118, 378);
    posts.stroke({ width: 7, color: 0xd9dce3 });
    posts.moveTo(482, 378);
    posts.quadraticCurveTo(SIM_W / 2, 400, 1118, 378);
    posts.stroke({ width: 3, color: 0xff8a7a, alpha: 0.7 });
    into.addChild(posts);
    // the near rim, cut low so it never covers the bots
    const near: Graphics = new PIXI.Graphics();
    near.moveTo(120, 640);
    near.quadraticCurveTo(SIM_W / 2, 760, 1480, 640);
    near.stroke({ width: 22, color: hex(K.rubber) });
    near.moveTo(120, 640);
    near.quadraticCurveTo(SIM_W / 2, 760, 1480, 640);
    near.stroke({ width: 8, color: 0x4a4a50, alpha: 0.6 });
    into.addChild(near);
    // the string of bulbs on the near rim
    const bulbs: Graphics = new PIXI.Graphics();
    bulbs.moveTo(BULBS[0][0], BULBS[0][1] + 10);
    for (const [x, y] of BULBS) bulbs.lineTo(x, y + 10);
    bulbs.stroke({ width: 2, color: 0x8c8c94 });
    for (const [x, y] of BULBS) {
      bulbs.circle(x, y + 10, 9).fill(0xf8e7b8);
      bulbs.circle(x, y + 10, 5).fill(0xfff6dc);
    }
    into.addChild(bulbs);
  }

  // ── the bulb glows (blink twice on the KO), both pit modes ───────────────
  const glowTex = (() => {
    const g: Graphics = new PIXI.Graphics();
    g.circle(24, 24, 24).fill({ color: 0xffe2a0, alpha: 0.25 });
    g.circle(24, 24, 14).fill({ color: 0xfff1cc, alpha: 0.5 });
    g.circle(24, 24, 6).fill({ color: 0xffffff, alpha: 0.9 });
    return stage.app.renderer.generateTexture({ target: g, frame: new PIXI.Rectangle(0, 0, 48, 48), resolution: 1 });
  })();
  const glows: Sprite[] = [];
  for (const [x, y] of BULBS) {
    const s: Sprite = new PIXI.Sprite(glowTex);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.position.set(x, y + (plate ? 0 : 10));
    s.alpha = 0;
    cam.addChild(s);
    glows.push(s);
  }

  // ── the scoreboard: two lamps, nothing else ──────────────────────────────
  const board: Graphics = new PIXI.Graphics();
  cam.addChild(board);
  const drawBoard = (aliveA: boolean, aliveB: boolean) => {
    board.clear();
    board.roundRect(SIM_W / 2 - 64, 18, 128, 40, 10).fill(0x1b1917);
    board.roundRect(SIM_W / 2 - 64, 18, 128, 40, 10).stroke({ width: 2, color: 0x3d3833 });
    board.rect(SIM_W / 2 - 1, 8, 2, 12).fill(0x3d3833);
    const lamp = (x: number, on: boolean) => {
      board.circle(x, 38, 9).fill(on ? hex(M.good) : 0x2c2a28);
      if (on) board.circle(x, 38, 14).fill({ color: hex(M.good), alpha: 0.18 });
    };
    lamp(SIM_W / 2 - 30, aliveA);
    lamp(SIM_W / 2 + 30, aliveB);
  };
  drawBoard(true, true);

  // ── debris rests under the bots, crumbs fly over them ────────────────────
  const debrisLayer: Container = new PIXI.Container();
  cam.addChild(debrisLayer);

  // ── the bots ─────────────────────────────────────────────────────────────
  // the renderer goes in so the rig can read a head texture back and put the
  // blink and the dim on the lenses the art actually has (rig.ts measureEyes)
  const rigs: [Rig, Rig] = [buildRig(PIXI, stage.app.renderer), buildRig(PIXI, stage.app.renderer)];
  const nodes: [Map<Socket, Container>, Map<Socket, Container>] = [new Map(), new Map()];
  const rest: [Map<Socket, { x: number; y: number }>, Map<Socket, { x: number; y: number }>] = [new Map(), new Map()];
  const arts: [Map<Socket, PartArt | null>, Map<Socket, PartArt | null>] = [new Map(), new Map()];
  rigs.forEach((rig, i) => {
    const dir = i === 0 ? 1 : -1;
    rig.root.scale.set(RIG_SCALE * dir, RIG_SCALE);
    // B is drawn in a mirror so the two face each other. Every shape a look
    // draws survives that; the plate's NUMBER does not, so the rig is told and
    // turns that one node back round (rig.ts setMirrored).
    rig.setMirrored(dir < 0);
    rig.root.position.set(BOT_X[i], FLOOR_Y);
    cam.addChild(rig.root);
    // the rig adds one Container per socket in DRAW_ORDER with zIndex = index
    DRAW_ORDER.forEach((socket, z) => {
      const node = rig.root.children.find((c) => c.zIndex === z) as Container | undefined;
      if (node) nodes[i].set(socket, node);
    });
    // the rest pose at t 0: the deterministic spawn point for a tumble
    rig.update(0);
    DRAW_ORDER.forEach((socket) => {
      const n = nodes[i].get(socket);
      rest[i].set(socket, n ? { x: n.position.x, y: n.position.y } : { x: 0, y: 0 });
    });
  });

  // ── overlays: HP bars, cracks, crumbs, smoke ─────────────────────────────
  const cracks: [Graphics, Graphics] = [new PIXI.Graphics(), new PIXI.Graphics()];
  const bars: Graphics = new PIXI.Graphics();
  const puffs: Graphics = new PIXI.Graphics();
  cam.addChild(cracks[0], cracks[1], bars, puffs);

  // ── art loading with the drawn fallback ──────────────────────────────────
  const artCache = new Map<string, PartArt>();

  function vectorArt(slot: ArtSlot, tier: number): PartArt {
    const key = `vec:${slot}:${tier}`;
    const hit = artCache.get(key);
    if (hit) return hit;
    const r = RIG[slot];
    const { base, mask } = drawVectorPart(PIXI, slot, tier);
    const frame = new PIXI.Rectangle(0, 0, r.w, r.h);
    const art: PartArt = {
      base: stage.app.renderer.generateTexture({ target: base, frame, resolution: 1 }),
      mask: stage.app.renderer.generateTexture({ target: mask, frame, resolution: 1 }),
    };
    base.destroy();
    mask.destroy();
    artCache.set(key, art);
    return art;
  }

  async function loadArt(slot: ArtSlot, tier: number, design: 1 | 2): Promise<PartArt> {
    const key = `${slot}:${tier}:${design}`;
    const hit = artCache.get(key);
    if (hit) return hit;
    try {
      const base = (await PIXI.Assets.load(partFile(slot, tier, design))) as Texture;
      let mask: Texture | null = null;
      try {
        mask = (await PIXI.Assets.load(maskFile(slot, tier, design))) as Texture;
      } catch {
        mask = null; // unpainted is better than unbuilt (the BuildClient law)
      }
      const art = { base, mask };
      artCache.set(key, art);
      return art;
    } catch {
      // kit law: the fight runs with the art folder deleted
      return vectorArt(slot, tier);
    }
  }

  async function setBuilds(a: Build, b: Build, looks: readonly [BotLook, BotLook]) {
    const builds: [Build, Build] = [a, b];
    for (let i = 0; i < 2; i++) {
      for (const socket of DRAW_ORDER) {
        const slot = SLOT_OF_SOCKET[socket];
        const part = builds[i][slot];
        const { tier, design } = designOf(part, slot);
        const art = await loadArt(ART_OF_SOCKET[socket], tier, design);
        arts[i].set(socket, art);
        rigs[i].setArt(socket, art);
      }
      // THE BODY COLOUR FIRST, THEN THE LOOK. setPaint is not the picture any
      // more, it is the ONE number the rig still keeps outside the look: the
      // colour of the CHIP a limb leaves on the body when it comes off
      // (rig.ts drawScar). Every socket is then given its own colour by
      // setLook, which is the picture.
      rigs[i].setPaint(bodyTintOf(looks[i]));
      rigs[i].setLook(looks[i]);
    }
  }

  // ── events -> spawns ─────────────────────────────────────────────────────
  const pending: Pending[] = [];
  const debrisNodes: DebrisNode[] = [];

  /** a socket's sim point at the REST pose (deterministic; the tumble's
   * spawn never depends on where a tween happened to be) */
  function restPoint(side: Side, socket: Socket, dx = 0, dy = 0): { x: number; y: number } {
    const dir = side === 0 ? 1 : -1;
    const p = rest[side].get(socket) ?? { x: 0, y: 0 };
    return { x: BOT_X[side] + (p.x + dx) * RIG_SCALE * dir, y: FLOOR_Y + (p.y + dy) * RIG_SCALE };
  }

  /** the struck piece's centre, for crumbs and sparks */
  function pieceCentre(side: Side, piece: Piece): { x: number; y: number } {
    const socket = SOCKET_OF_PIECE[piece];
    const off = HIT_AT[socket];
    return restPoint(side, socket, off[0], off[1]);
  }

  /**
   * EVERY SOCKET'S OWN COLOUR, per side, for the pieces that leave the rig.
   * A part that flies off is the same part in the same colour it was wearing
   * a frame earlier, so a coral arm must not land as a mint arm because the
   * mint torso happened to be the bot's "colour". It was one number per bot
   * before the look, and a four colour robot losing a leg proved it wrong.
   */
  const paintOf: [Record<Socket, number>, Record<Socket, number>] = [flatPaints(0xffffff), flatPaints(0xffffff)];

  function onEvent(e: FightEvent, _st: FightState, fx: FightFx) {
    if (e.t === "hit") {
      const victim: Side = e.who === 0 ? 1 : 0;
      const s = fx.sides[victim];
      s.recoil = 0;
      s.recoilPiece = e.part;
      rigs[victim].flash(SOCKET_OF_PIECE[e.part]);
      const c = pieceCentre(victim, e.part);
      spawnCrumbs(fx, c.x, c.y, victim === 0 ? -1 : 1, e.crit ? 5 : 3, 0);
      fx.sides[e.who].recover = 0;
      fx.sides[e.who].overRotate = 0;
    } else if (e.t === "miss") {
      const victim: Side = e.who === 0 ? 1 : 0;
      fx.sides[victim].lean = 0;
      fx.sides[e.who].recover = 0;
      fx.sides[e.who].overRotate = 1;
    } else if (e.t === "block") {
      // who = the blocker
      const s = fx.sides[e.who];
      s.block = 0;
      s.blockArm = e.arm;
      const c = pieceCentre(e.who, e.arm);
      spawnCrumbs(fx, c.x, c.y - 20, e.who === 0 ? -1 : 1, 2, 1);
      const swinger: Side = e.who === 0 ? 1 : 0;
      fx.sides[swinger].recover = 0;
      fx.sides[swinger].overRotate = 0;
    } else if (e.t === "bounce") {
      rigs[e.who].flash(SOCKET_OF_PIECE[e.part]);
      const c = pieceCentre(e.who, e.part);
      spawnCrumbs(fx, c.x, c.y, 0, 3, 1);
    } else if (e.t === "break") {
      const s = fx.sides[e.who];
      s.gone[e.part] = 1;
      s.crack = 0;
      s.crackPiece = e.part;
      fx.hitStop = HIT_STOP_S;
      fx.shake = SHAKE_S;
      fx.shakeAmp = 4;
      fx.cheer = CHEER_S;
      if (e.part !== PIECE.BODY) {
        pending.push({ side: e.who, piece: e.part, frame: e.f, key: tumbleKey(opts.fightSeed, e.f, e.who, e.part) });
      }
    } else if (e.t === "ko") {
      const loser: Side = e.winner === 0 ? 1 : 0;
      fx.ko = 0;
      fx.hitStop = HIT_STOP_S;
      fx.cheer = CHEER_S * 2;
      fx.sides[loser].sit = 0;
      fx.sides[e.winner].armsUp = 0;
      const c = pieceCentre(loser, PIECE.BODY);
      spawnSmoke(fx, c.x, c.y - 30);
    } else if (e.t === "timeout") {
      fx.timeout = 0;
      fx.sides[e.winner].armsUp = 0;
    }
  }

  /** a cracked part detaches once the hit-stop has passed */
  function detach(fx: FightFx) {
    if (fx.hitStop > 0 || pending.length === 0) return;
    while (pending.length) {
      const p = pending.shift()!;
      const socket = SOCKET_OF_PIECE[p.piece];
      const dir = p.side === 0 ? -1 : 1; // away from the hit: away from the other bot
      const at = restPoint(p.side, socket);
      const d = spawnDebris(fx, p.side, p.piece, p.key, at.x, at.y, dir, FLOOR_Y + 14, PIT_FLOOR);
      if (!d) continue;
      // hide the rig node and build a matching debris piece from the same art
      const node = nodes[p.side].get(socket);
      if (node) node.visible = false;
      const root: Container = new PIXI.Container();
      // A flown-off part is the SAME part at the SAME size on the SAME pivot
      // it hung from. Both halves of that used to be wrong: the anchor was
      // the canvas centre 20 rows down (a guess that was never the contract's
      // pivot and is 43 rows out on the new canvases) and the part's own
      // scale was left off, so a head POPPED smaller the instant it broke.
      const anchorOf = (sock: Socket): { x: number; y: number } => {
        const r = RIG[ART_OF_SOCKET[sock]];
        const p2 =
          sock === "head" ? RIG.head.neck
          : sock === "weapon" ? RIG.weapon.grip
          : sock === "armL" || sock === "armR" ? RIG.arm.shoulder
          : RIG.leg.hip;
        return { x: p2[0] / r.w, y: p2[1] / r.h };
      };
      const addSprite = (sock: Socket, dx: number, dy: number, rot: number) => {
        const art = arts[p.side].get(sock);
        if (!art) return;
        const a = anchorOf(sock);
        const k = PART_SCALE[sock];
        const put = (s: Sprite) => {
          s.anchor.set(a.x, a.y);
          s.position.set(dx, dy);
          s.rotation = rot;
          s.scale.set(k.x, k.y);
          root.addChild(s);
        };
        put(new PIXI.Sprite(art.base));
        if (art.mask) {
          const mask: Sprite = new PIXI.Sprite(art.mask);
          mask.blendMode = "multiply";
          // the piece's OWN colour, not the bot's: an arm that comes off is
          // still the arm's colour, and the weapon in its hand is still the
          // weapon's (which is the arm's, because a weapon rides the arm)
          mask.tint = paintOf[p.side][sock];
          put(mask);
        }
      };
      addSprite(socket, 0, 0, 0);
      // A HEAD THAT COMES OFF KEEPS ITS FACE. The debris is built from the
      // same textures the rig wears, and the face is not in those textures, so
      // without this a knocked off head bounces across the pit as a blank
      // dome and comes to rest that way for the whole knockout, which is the
      // one frame anybody screenshots. The light is out and the lids are half
      // down (rig.ts paints it), so the head reads as broken rather than lost.
      if (socket === "head") {
        const faceG: Graphics = new PIXI.Graphics();
        // the rig this head came off already measured its lenses, so nothing
        // is read back twice and the debris cannot land its lids anywhere the
        // standing bot did not
        // the HEAD's colour, because the lid is the head at the eye's row
        paintBrokenFace(faceG, rigs[p.side].headEyes(), paintOf[p.side].head);
        faceG.scale.set(PART_SCALE.head.x, PART_SCALE.head.y);
        root.addChild(faceG);
      }
      // the near arm carries the weapon: it goes with the arm, through the
      // rig's own hand formula
      if (socket === "armR") {
        const h = handOffset("armR", 0);
        addSprite("weapon", h.x, h.y, WEAPON_REST);
        const wn = nodes[p.side].get("weapon");
        if (wn) wn.visible = false;
      }
      // the crack, drawn once on the piece, at that piece's own middle
      const crack: Graphics = new PIXI.Graphics();
      drawCrack(crack, 0, HIT_AT[socket][1], 1);
      root.addChild(crack);
      const mirror = p.side === 0 ? 1 : -1;
      root.scale.set(RIG_SCALE * mirror, RIG_SCALE);
      debrisLayer.addChild(root);
      debrisNodes.push({ root, index: fx.debris.indexOf(d) });
    }
  }

  function drawCrack(g: Graphics, cx: number, cy: number, alpha: number) {
    // three jagged strokes in rig units: ink under, chalk over
    const path = [[-40, -30], [-12, -8], [-26, 14], [4, 6], [-6, 34], [22, 22], [16, 48]];
    for (const [w, c, a] of [[9, 0x1b1310, 0.55 * alpha], [4, 0xf3e9d2, 0.85 * alpha]] as const) {
      g.moveTo(cx + path[0][0], cy + path[0][1]);
      for (let i = 1; i < path.length; i++) g.lineTo(cx + path[i][0], cy + path[i][1]);
      g.stroke({ width: w, color: c, alpha: a });
    }
  }

  const setBuildsDressed = async (a: Build, b: Build, looks: readonly [BotLook, BotLook]) => {
    for (let i = 0; i < 2; i++) {
      const body = bodyTintOf(looks[i]);
      const p = looks[i].paint;
      for (const socket of DRAW_ORDER) paintOf[i][socket] = p?.[socket] ?? body;
    }
    await setBuilds(a, b, looks);
  };

  function reset() {
    pending.length = 0;
    for (const d of debrisNodes) d.root.destroy({ children: true });
    debrisNodes.length = 0;
    for (const m of nodes) m.forEach((n) => (n.visible = true));
    // back to the bell: a mood or a gaze half way to somewhere would slide
    // across the cut, so everything eased lands on its target now
    for (const rig of rigs) {
      rig.setMood("calm");
      rig.snap();
    }
    airborne[0] = airborne[1] = false;
    cracks[0].clear();
    cracks[1].clear();
    puffs.clear();
    for (const g of glows) g.alpha = 0;
    drawBoard(true, true);
  }

  // ── the pose (every number a delta on the rig's idle) ────────────────────
  interface Pose {
    x: number;
    y: number;
    rot: number;
    armR: number;
    armL: number;
    legL: number;
    legR: number;
    head: number;
    torsoRot: number;
    sink: number;
  }
  const pose: Pose = { x: 0, y: 0, rot: 0, armR: 0, armL: 0, legL: 0, legR: 0, head: 0, torsoRot: 0, sink: 0 };

  function computePose(i: Side, st: FightState, fx: FightFx): Pose {
    const s = fx.sides[i];
    const ss = st.sides[i];
    pose.x = 0;
    pose.y = 0;
    pose.rot = 0;
    pose.armR = 0;
    pose.armL = 0;
    pose.legL = 0;
    pose.legR = 0;
    pose.head = 0;
    pose.torsoRot = 0;
    pose.sink = 0;
    const down = s.sit >= 0;

    // the tell and the lunge, straight from the engine's swing timer
    if (!st.done && !down && ss.staggerT === 0) {
      const sw = ss.swingT;
      if (sw <= TELL_F && sw > LUNGE_F) {
        // lean back over the tell, in three steps (the clay feel)
        const k = Math.floor(((TELL_F - sw) / (TELL_F - LUNGE_F)) * 3) / 3;
        pose.rot = -0.14 * k;
        pose.armR = 0.9 * k;
        pose.head = -0.08 * k;
      } else if (sw <= LUNGE_F && sw >= 1) {
        // the hop-lunge: feet leave the ground, 120 px forward, in two steps
        const p = Math.floor(((LUNGE_F - sw + 1) / LUNGE_F) * 2) / 2;
        pose.x = HOP_PX * p;
        pose.y = -40 * Math.sin(Math.PI * Math.min(1, p + 0.25));
        pose.rot = 0.1 * p;
        pose.armR = 0.9 - 2.4 * p;
      }
    }
    // the recovery: hop back, follow through, over-rotate on a miss
    if (s.recover >= 0 && !down) {
      const p = stepped(s.recover, RECOVER_S);
      pose.x = HOP_PX * (1 - p);
      pose.y = -30 * Math.sin(Math.PI * p);
      pose.rot = 0.1 * (1 - p) + (s.overRotate ? 10 * DEG * (1 - p) : 0);
      pose.armR = -1.5 * (1 - p);
    }
    // recoil: 6 px away from the hit, eased back
    if (s.recoil >= 0) {
      const p = ease(stepped(s.recoil, RECOIL_S));
      pose.x -= 8 * (1 - p);
    }
    // the dodge lean: 8 degrees away and back
    if (s.lean >= 0) {
      const p = stepped(s.lean, LEAN_S);
      pose.rot -= 8 * DEG * Math.sin(Math.PI * p);
    }
    // the block: the arm swings across (the far arm's node is mirrored in
    // rig.ts, so its sign flips to bring the hand forward)
    if (s.block >= 0) {
      const p = stepped(s.block, BLOCK_S);
      const up = -1.4 * Math.sin(Math.PI * Math.min(1, p * 1.2));
      if (s.blockArm === PIECE.ARM_L) pose.armL -= up;
      else pose.armR += up;
    }
    // the stagger: a wobble for 30 frames, stepped by the frame count
    if (ss.staggerT > 0 && !down) {
      pose.rot += 0.06 * Math.sin(Math.floor(ss.staggerT / 5) * 1.9);
    }
    // a missing leg makes the bot kneel; both gone, it sits on the stumps
    const legsGone = s.gone[PIECE.LEG_L] + s.gone[PIECE.LEG_R];
    if (legsGone === 1 && !down) {
      pose.sink += 70;
      if (s.gone[PIECE.LEG_L]) pose.legR = 0.55;
      else pose.legL = 0.55;
      pose.rot += 0.05;
    } else if (legsGone === 2 && !down) {
      pose.sink += 150;
    }
    // the knockout: the loser sits and drops; the 20 degree lean goes on the
    // root (pivot at the feet) plus a small slump on the torso node, because
    // the head and arms are the torso's siblings, not its children, and a
    // torso-only rotation would pull the neck out from under the head
    if (down) {
      const p = ease(stepped(s.sit, SIT_S));
      pose.sink += (legsGone === 2 ? 150 : 140) * p;
      pose.rot -= 14 * DEG * p;
      pose.torsoRot = -6 * DEG * p;
      pose.head = 0.25 * p;
      pose.legL = 0.75 * p;
      pose.legR = -0.75 * p;
      pose.armL = 0.5 * p;
      pose.armR = 0.7 * p;
    }
    // the winner's arms up: up fast, hold, down
    if (s.armsUp >= 0) {
      const p = stepped(s.armsUp, ARMS_UP_S);
      const k = p < 0 ? 0 : Math.min(1, p * 4, (1 - p) * 4);
      pose.armL += -2.6 * k;
      pose.armR += -2.6 * k;
    }
    return pose;
  }

  // ── the frame ────────────────────────────────────────────────────────────
  const barColor = (pct: number): number => {
    if (pct >= 0.6) return hex(M.good);
    if (pct >= 0.3) return hex(M.warn);
    return hex(M.bad);
  };

  /**
   * HOW THIS BOT IS DOING, off state the engine already published. Nothing is
   * invented and nothing is fed back: the mood only moves the face and the
   * pose (rig.ts), so no replay hash can move.
   *
   *   down and out        hurt, eyes almost out, chin on the chest
   *   the winner          proud, chin up, the bulb at full
   *   body low or two     hurt: a bot missing an arm and a leg should not be
   *   pieces gone         standing there beaming
   *   winding up a swing  eager, the tell you can read on his face
   *   otherwise           calm
   */
  function moodOf(side: Side, st: FightState, fx: FightFx): BotMood {
    const s = fx.sides[side];
    if (s.sit >= 0) return "hurt";
    if (s.armsUp >= 0) return "proud";
    const ss = st.sides[side];
    let lost = 0;
    for (let p = 0; p < PIECE_COUNT; p++) if (p !== PIECE.BODY && s.gone[p]) lost++;
    const body = ss.armorMax[PIECE.BODY] > 0 ? ss.armor[PIECE.BODY] / ss.armorMax[PIECE.BODY] : 0;
    if (body <= 0.35 || lost >= 2) return "hurt";
    if (!st.done && ss.staggerT === 0 && ss.swingT <= TELL_F && ss.swingT > 0) return "eager";
    return st.done ? "flat" : "calm";
  }

  /**
   * WHERE HE IS LOOKING. At the other bot, always, because that is the only
   * thing in the pit worth looking at, and at the floor once he is sitting on
   * it. The target is in the rig's OWN units, so both bots use the same number
   * even though B's root is mirrored: forward is forward.
   */
  const FACE_OFF = Math.abs(BOT_X[1] - BOT_X[0]) / RIG_SCALE;
  const EYE_LINE = -RIG_HEIGHT * 0.75;
  /** whether each bot's feet were off the floor last frame, so a landing lands */
  const airborne: [boolean, boolean] = [false, false];

  function render(st: FightState, fx: FightFx) {
    detach(fx);

    // the camera: 3 px shake on a break, 1.04 punch on the KO
    let sx = 0, sy = 0;
    if (fx.shake > 0) {
      const k = fx.shake / SHAKE_S;
      const n = Math.floor(fx.time * 60);
      sx = fx.shakeAmp * k * (n % 2 === 0 ? 1 : -1);
      sy = fx.shakeAmp * k * 0.6 * (n % 3 === 0 ? 1 : -1);
    }
    let punch = 1;
    if (fx.ko >= 0 && fx.ko < KO_PUNCH_S) punch = 1 + 0.04 * Math.sin((Math.PI * fx.ko) / KO_PUNCH_S);
    cam.position.set(SIM_W / 2 + sx, SIM_H / 2 + sy);
    cam.scale.set(punch);

    const tMs = fx.time * 1000;
    bars.clear();
    for (let i = 0; i < 2; i++) {
      const side = i as Side;
      const dir = side === 0 ? 1 : -1;
      const rig = rigs[side];
      // the face and the look are set BEFORE the idle runs, so this frame's
      // update paints them rather than the next one
      const down = fx.sides[side].sit >= 0;
      rig.setMood(moodOf(side, st, fx));
      rig.lookAt(down ? { x: FACE_OFF * 0.2, y: 0 } : { x: FACE_OFF, y: EYE_LINE });
      rig.update(tMs);
      const p = computePose(side, st, fx);
      // the hop-lunge and the hop back put the feet in the air; the frame they
      // come down on, the toy settles
      const up = p.y < -6;
      if (airborne[side] && !up) rig.poke("land");
      airborne[side] = up;
      rig.root.position.set(BOT_X[side] + dir * p.x, FLOOR_Y + p.y + p.sink * RIG_SCALE);
      rig.root.rotation = dir * p.rot;
      const s = fx.sides[side];
      const nm = nodes[side];
      const add = (socket: Socket, rot: number, dy = 0) => {
        const n = nm.get(socket);
        if (!n) return;
        n.rotation += rot;
        n.position.y += dy;
      };
      add("armR", p.armR);
      add("armL", p.armL);
      add("legL", p.legL);
      add("legR", p.legR);
      add("head", p.head);
      add("torso", p.torsoRot);
      // the weapon rides the near hand: recompute the hand from the arm's
      // total rotation the way rig.ts does (HAND is shoulder to hand, the
      // rest angle is rig.ts's WEAPON_REST), so a swing carries the weapon
      {
        const arm = nm.get("armR");
        const wn = nm.get("weapon");
        if (arm && wn) {
          const ar = arm.rotation;
          const h = handOffset("armR", ar);
          wn.position.set(arm.position.x + h.x, arm.position.y + h.y);
          wn.rotation = ar + WEAPON_REST;
        }
      }
      // gone pieces stay hidden (a seek makes them visible again in reset)
      for (let piece = 0; piece < PIECE_COUNT; piece++) {
        if (s.gone[piece] && fx.hitStop <= 0 && piece !== PIECE.BODY) {
          const n = nm.get(SOCKET_OF_PIECE[piece]);
          if (n) n.visible = false;
        }
      }
      if (s.gone[PIECE.ARM_R] && fx.hitStop <= 0) {
        const wn = nm.get("weapon");
        if (wn) wn.visible = false;
      }

      // THE CONTACT SHADOW stays on the pit floor while the bot does not.
      // The root has been moved to the hop and the sink, so the floor is that
      // far back up in the root's own units; a bot in the air also throws a
      // smaller, softer one.
      // `lift` is how far ABOVE the root's own origin the real floor now is.
      // The root sits at FLOOR_Y + p.y + p.sink x RIG_SCALE, so the floor is
      // that whole displacement back up, in rig units: a hop (p.y negative)
      // lifts the bot and a kneel (p.sink positive) drops it, and the shadow
      // has to stay behind for both.
      const air = Math.min(1, Math.max(0, -p.y) / 40);
      rig.setShadow({
        lift: p.y / RIG_SCALE + p.sink,
        scale: 1 - 0.22 * air,
        alpha: 1 - 0.4 * air,
      });
      // and the rig re-settles LAST, after the pose and after the hiding: it
      // is what promotes an arm carried across the chest in front of the body
      // and what puts a scar chip where a limb used to be
      rig.afterPose();

      // the crack overlay on a cracked piece that is still attached
      const cg = cracks[side];
      cg.clear();
      if (s.crack >= 0 && (fx.hitStop > 0 || s.crackPiece === PIECE.BODY)) {
        const socket = SOCKET_OF_PIECE[s.crackPiece];
        const n = nm.get(socket);
        if (n && n.visible) {
          const a = Math.min(1, s.crack / CRACK_S);
          const wp = worldOf(side, n.position.x, n.position.y + (socket === "head" ? -70 : socket === "torso" ? -120 : 80), p);
          cg.position.set(wp.x, wp.y);
          cg.scale.set(RIG_SCALE * dir, RIG_SCALE);
          drawCrack(cg, 0, 0, a);
        }
      }

      // part HP bars: all for the first 2 s, then only the ones under 100 percent
      const ss = st.sides[side];
      for (let piece = 0; piece < PIECE_COUNT; piece++) {
        if (ss.armor[piece] <= 0) continue;
        const pct = ss.armor[piece] / ss.armorMax[piece];
        if (fx.time > BARS_SHOW_S && pct >= 1) continue;
        const socket = SOCKET_OF_PIECE[piece];
        const n = nm.get(socket);
        if (!n || !n.visible) continue;
        const off = BAR_AT[socket];
        const wp = worldOf(side, n.position.x + off[0], n.position.y + off[1], p);
        const x = Math.round(wp.x - BAR_W / 2);
        const y = Math.round(wp.y);
        bars.roundRect(x, y, BAR_W, BAR_H, 2).fill({ color: 0x000000, alpha: 0.35 });
        bars.roundRect(x, y, Math.max(2, Math.round(BAR_W * pct)), BAR_H, 2).fill(barColor(pct));
      }
    }

    // debris follows the seeded tumble
    for (const d of debrisNodes) {
      const src = fx.debris[d.index];
      if (!src || !src.on) {
        d.root.visible = false;
        continue;
      }
      d.root.visible = true;
      d.root.position.set(src.x, src.y);
      d.root.rotation = src.rot;
    }

    // crumbs, sparks and smoke
    puffs.clear();
    for (const c of fx.crumbs) {
      if (!c.on) continue;
      const k = 1 - c.t / CRUMB_S;
      if (c.kind === 1) puffs.circle(c.x, c.y, c.r * k + 0.5).fill({ color: hex(K.brass), alpha: 0.9 });
      else puffs.circle(c.x, c.y, c.r * (0.6 + 0.4 * k)).fill({ color: 0xb9beca, alpha: 0.5 + 0.5 * k });
    }
    for (const s of fx.smoke) {
      if (!s.on || s.t < 0) continue;
      const k = s.t / SMOKE_S;
      puffs.circle(s.x + s.drift * k, s.y - 90 * k, s.r * (0.6 + 0.8 * k)).fill({ color: 0x8e8a86, alpha: 0.5 * (1 - k) });
    }

    // the stands: bob 2 px, arms up on a break and the KO (vector pit only)
    if (crowd.length) {
      for (const f of crowd) {
        const ph = ((tMs / 1000 + f.phase) % 1.6) / 1.6;
        f.node.position.y = f.baseY + (ph < 0.5 ? 0 : -2);
        f.arms.visible = fx.cheer > 0;
      }
    }

    // the bulbs blink twice on the KO
    let glow = 0;
    if (fx.ko >= 0 && fx.ko < BLINK_S) glow = Math.max(0, Math.sin((fx.ko / BLINK_S) * Math.PI * 4));
    for (const g of glows) g.alpha = glow;

    // the scoreboard lamps
    drawBoard(st.sides[0].armor[PIECE.BODY] > 0, st.sides[1].armor[PIECE.BODY] > 0);

    stage.renderFrame();
  }

  /** a rig-space point to sim space through the root's transform */
  function worldOf(side: Side, rx: number, ry: number, p: Pose): { x: number; y: number } {
    const dir = side === 0 ? 1 : -1;
    const lx = rx * RIG_SCALE * dir;
    const ly = ry * RIG_SCALE;
    const rot = dir * p.rot;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return {
      x: BOT_X[side] + dir * p.x + lx * c - ly * s,
      y: FLOOR_Y + p.y + p.sink * RIG_SCALE + lx * s + ly * c,
    };
  }

  return {
    stage,
    plate,
    setBuilds: setBuildsDressed,
    onEvent,
    reset,
    settle(fx) {
      fx.hitStop = 0;
      detach(fx);
      settleFightFx(fx);
      // a replayed hit leaves a two-frame flash armed; a still frame must
      // not show it (found on the reduced-motion capture: the winner was white)
      // and a settled frame shows the mood and the gaze ARRIVED, not part way
      for (const rig of rigs) {
        rig.update(fx.time * 1000);
        rig.snap();
        rig.update(fx.time * 1000);
      }
    },
    glint(side) {
      rigs[side].flash("weapon");
    },
    render,
    resize(cssW, cssH, dpr) {
      if (opts.small) {
        // pushed in: fit the 1170-wide crop, then slide the world so the
        // crop's left edge lands where the stage put the letterbox
        stage.resize(cssW, cssH, dpr, SMALL_CROP_W, SIM_H);
        const scale = Math.min(cssW / SMALL_CROP_W, cssH / SIM_H) || 1;
        W.position.x -= ((SIM_W - SMALL_CROP_W) / 2) * scale;
      } else {
        stage.resize(cssW, cssH, dpr, SIM_W, SIM_H);
      }
    },
    destroy() {
      for (const d of debrisNodes) d.root.destroy({ children: true });
      debrisNodes.length = 0;
      rigs[0].destroy();
      rigs[1].destroy();
      stage.destroy();
    },
  };
}
