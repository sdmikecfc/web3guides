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
import { createPixiStage, type PixiStage } from "@/app/s7/games/_shared/pixi";
import { DRAW_ORDER, buildRig, RIG_HEIGHT, type PartArt, type Rig } from "./rig";
import { RIG, maskFile, partFile, type ArtSlot } from "./rig-points";
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
const PIT_FLOOR = { cx: SIM_W / 2, cy: 500, rx: 640, ry: 114 } as const;
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

/** HP bar offsets from each socket pivot, in rig units (the head pivot is
 * the neck, so its bar rides above the crown; the limbs hang from their
 * pivots, so theirs sit mid limb) */
const BAR_AT: Record<Socket, readonly [number, number]> = {
  head: [0, -175], torso: [0, -110], armL: [0, 100], armR: [0, 100], legL: [0, 100], legR: [0, 100], weapon: [0, 0],
};
const BAR_W = 36;
const BAR_H = 5;

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
  /** load both builds' art onto the rigs (vector fallback per part) and
   * paint them */
  setBuilds: (a: Build, b: Build, paints: readonly [number, number]) => Promise<void>;
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
  const rigs: [Rig, Rig] = [buildRig(PIXI), buildRig(PIXI)];
  const nodes: [Map<Socket, Container>, Map<Socket, Container>] = [new Map(), new Map()];
  const rest: [Map<Socket, { x: number; y: number }>, Map<Socket, { x: number; y: number }>] = [new Map(), new Map()];
  const arts: [Map<Socket, PartArt | null>, Map<Socket, PartArt | null>] = [new Map(), new Map()];
  rigs.forEach((rig, i) => {
    const dir = i === 0 ? 1 : -1;
    rig.root.scale.set(RIG_SCALE * dir, RIG_SCALE);
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
    const base: Graphics = new PIXI.Graphics();
    const mask: Graphics = new PIXI.Graphics();
    const clay = hex(K.clay);
    const edge = 0x9aa3b0;
    const tint = hex(TIER_COLOR[(tier as 1 | 2 | 3 | 4) ?? 1]);
    if (slot === "head") {
      base.roundRect(22, 28, 116, 116, 30).fill(clay);
      base.roundRect(22, 28, 116, 116, 30).stroke({ width: 4, color: edge });
      base.roundRect(70, 6, 20, 30, 8).fill(edge); // the antenna
      base.circle(80, 6, 8).fill(tint);
      base.circle(56, 84, 16).fill(hex(K.glass));
      base.circle(104, 84, 16).fill(hex(K.glass));
      base.circle(58, 86, 7).fill(hex(K.rubber));
      base.circle(106, 86, 7).fill(hex(K.rubber));
      base.roundRect(58, 116, 44, 8, 4).fill(hex(K.rubber)); // the grille smile
      mask.roundRect(22, 28, 116, 116, 30).fill(0xffffff);
    } else if (slot === "torso") {
      base.roundRect(26, 20, 148, 200, 34).fill(clay);
      base.roundRect(26, 20, 148, 200, 34).stroke({ width: 4, color: edge });
      base.roundRect(64, 150, 72, 40, 8).fill(hex(K.rubber)); // the vent
      for (let i = 0; i < 3; i++) base.rect(72, 158 + i * 10, 56, 4).fill(0x6b6b72);
      base.circle(100, 60, 14).fill(tint); // the tier lamp
      base.circle(100, 60, 6).fill(0xffffff);
      mask.roundRect(26, 20, 148, 200, 34).fill(0xffffff);
    } else if (slot === "arm") {
      base.roundRect(25, 12, 40, 140, 20).fill(clay);
      base.roundRect(25, 12, 40, 140, 20).stroke({ width: 4, color: edge });
      base.circle(45, 160, 26).fill(clay); // the mitt
      base.circle(45, 160, 26).stroke({ width: 4, color: edge });
      base.circle(45, 20, 12).fill(tint); // the shoulder bolt
      mask.roundRect(25, 12, 40, 140, 20).fill(0xffffff);
    } else if (slot === "leg") {
      base.roundRect(25, 12, 40, 150, 20).fill(clay);
      base.roundRect(25, 12, 40, 150, 20).stroke({ width: 4, color: edge });
      base.roundRect(16, 160, 62, 36, 12).fill(hex(K.rubber)); // the boot
      base.circle(45, 20, 12).fill(tint); // the hip bolt
      mask.roundRect(25, 12, 40, 150, 20).fill(0xffffff);
    } else {
      base.roundRect(8, 50, 130, 20, 10).fill(hex(K.rubber)); // the handle
      base.roundRect(126, 18, 84, 84, 16).fill(hex(K.brass)); // the head
      base.roundRect(126, 18, 84, 84, 16).stroke({ width: 4, color: 0xa87a2a });
      base.circle(30, 60, 12).fill(tint); // the grip bolt
      mask.roundRect(126, 18, 84, 84, 16).fill({ color: 0xffffff, alpha: 0 });
    }
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

  async function setBuilds(a: Build, b: Build, paints: readonly [number, number]) {
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
      rigs[i].setPaint(paints[i]);
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
    const off = BAR_AT[socket];
    return restPoint(side, socket, off[0], off[1] + (socket === "head" ? 90 : 0));
  }

  const paintOf: [number, number] = [0xffffff, 0xffffff];

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
      const d = spawnDebris(fx, p.side, p.piece, p.key, at.x, at.y, dir, FLOOR_Y + 26, PIT_FLOOR);
      if (!d) continue;
      // hide the rig node and build a matching debris piece from the same art
      const node = nodes[p.side].get(socket);
      if (node) node.visible = false;
      const root: Container = new PIXI.Container();
      const addSprite = (sock: Socket, dx: number, dy: number, rot: number) => {
        const art = arts[p.side].get(sock);
        if (!art) return;
        const r = RIG[ART_OF_SOCKET[sock]];
        const anchor = sock === "head" ? [r.w / 2, RIG.head.neck[1]] : sock === "weapon" ? [RIG.weapon.grip[0], RIG.weapon.grip[1]] : [r.w / 2, 20];
        const base: Sprite = new PIXI.Sprite(art.base);
        base.anchor.set(anchor[0] / r.w, anchor[1] / r.h);
        base.position.set(dx, dy);
        base.rotation = rot;
        root.addChild(base);
        if (art.mask) {
          const mask: Sprite = new PIXI.Sprite(art.mask);
          mask.anchor.set(anchor[0] / r.w, anchor[1] / r.h);
          mask.position.set(dx, dy);
          mask.rotation = rot;
          mask.blendMode = "multiply";
          mask.tint = paintOf[p.side];
          root.addChild(mask);
        }
      };
      addSprite(socket, 0, 0, 0);
      // the near arm carries the weapon: it goes with the arm
      if (socket === "armR") {
        const hx = RIG.arm.hand[0] - RIG.arm.shoulder[0];
        const hy = RIG.arm.hand[1] - RIG.arm.shoulder[1];
        addSprite("weapon", hx, hy, -0.62);
        const wn = nodes[p.side].get("weapon");
        if (wn) wn.visible = false;
      }
      // the crack, drawn once on the piece
      const crack: Graphics = new PIXI.Graphics();
      drawCrack(crack, 0, socket === "head" ? -70 : 80, 1);
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

  const setBuildsPainted = async (a: Build, b: Build, paints: readonly [number, number]) => {
    paintOf[0] = paints[0];
    paintOf[1] = paints[1];
    await setBuilds(a, b, paints);
  };

  function reset() {
    pending.length = 0;
    for (const d of debrisNodes) d.root.destroy({ children: true });
    debrisNodes.length = 0;
    for (const m of nodes) m.forEach((n) => (n.visible = true));
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
    // the block: the arm swings across
    if (s.block >= 0) {
      const p = stepped(s.block, BLOCK_S);
      const up = -1.4 * Math.sin(Math.PI * Math.min(1, p * 1.2));
      if (s.blockArm === PIECE.ARM_L) pose.armL += up;
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
    // the knockout: the loser sits, the torso rotates 20 degrees and drops
    if (down) {
      const p = ease(stepped(s.sit, SIT_S));
      pose.sink += (legsGone === 2 ? 150 : 140) * p;
      pose.torsoRot = -20 * DEG * p;
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
      rig.update(tMs);
      const p = computePose(side, st, fx);
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
      // the weapon rides the near hand: give it the same swing
      add("weapon", p.armR);
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
    setBuilds: setBuildsPainted,
    onEvent,
    reset,
    settle(fx) {
      fx.hitStop = 0;
      detach(fx);
      settleFightFx(fx);
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
