/**
 * THE RIG (screens doc 2.4 and 6.4): one Pixi Container per bot, seven part
 * sprites on pivots, and EVERY motion a transform (rotate, scale, offset).
 * No frame sheets for parts: that is what makes 60 parts affordable and what
 * keeps the no-sliding law by construction.
 *
 * Shape copied from the S7 front scene (src/app/s7/front/scene.ts): no rAF
 * here, the owner calls update() and paints; constructors come from the
 * loaded pixi module (stage.pixi) so pixi stays client-only (the pixi.ts SSR
 * law); every position is in the rig's own @2x units and the owner scales
 * the root.
 *
 * Paint: each part is two layers, the grey base and the white paint MASK
 * tinted with the chosen colour at multiply. Zero extra art per colour.
 *
 * Draw order (far to near): far leg, far arm, torso, near leg, head, near
 * arm, weapon. The far side is the bot's left, mirrored (scale.x = -1),
 * which is legal only because the light is from directly above.
 */
"use client";

import type { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Pixi } from "@/app/s7/games/_shared/pixi";
import { RIG, type ArtSlot } from "./rig-points";
import type { DecalId, Socket } from "@/lib/bots/fixtures";

export interface PartArt {
  base: Texture;
  /** null for art that has no paintable area (never for baked parts) */
  mask: Texture | null;
}

export const DRAW_ORDER: readonly Socket[] = ["legL", "armL", "torso", "legR", "head", "armR", "weapon"];

export const ART_OF_SOCKET: Record<Socket, ArtSlot> = {
  head: "head",
  torso: "torso",
  armL: "arm",
  armR: "arm",
  legL: "leg",
  legR: "leg",
  weapon: "weapon",
};

/** the far side is mirrored */
const MIRRORED: Record<Socket, boolean> = {
  head: false, torso: false, armL: true, armR: false, legL: true, legR: false, weapon: false,
};

// ── the contract, reduced to the offsets the rig needs ────────────────────
const LEG_LEN = RIG.leg.foot[1] - RIG.leg.hip[1]; // hip to foot, 175
const HIP_X = (RIG.torso.hipL[0] + RIG.torso.hipR[0]) / 2;
const HIP_Y = RIG.torso.hipL[1];
const NECK = { x: RIG.torso.neck[0] - HIP_X, y: RIG.torso.neck[1] - HIP_Y };
const SHOULDER_L = { x: RIG.torso.shoulderL[0] - HIP_X, y: RIG.torso.shoulderL[1] - HIP_Y };
const SHOULDER_R = { x: RIG.torso.shoulderR[0] - HIP_X, y: RIG.torso.shoulderR[1] - HIP_Y };
const HIP_L = { x: RIG.torso.hipL[0] - HIP_X, y: 0 };
const HIP_R = { x: RIG.torso.hipR[0] - HIP_X, y: 0 };
const DECAL = { x: RIG.torso.decal[0] - HIP_X, y: RIG.torso.decal[1] - HIP_Y };
const HAND = { x: RIG.arm.hand[0] - RIG.arm.shoulder[0], y: RIG.arm.hand[1] - RIG.arm.shoulder[1] };
/** the weapon's rest angle in the hand: up and out, so the head reads */
const WEAPON_REST = -0.62;

/** sprite anchor per socket: the pivot as a fraction of the canvas */
const ANCHOR: Record<Socket, { x: number; y: number }> = {
  head: { x: RIG.head.neck[0] / RIG.head.w, y: RIG.head.neck[1] / RIG.head.h },
  torso: { x: HIP_X / RIG.torso.w, y: HIP_Y / RIG.torso.h },
  armL: { x: RIG.arm.shoulder[0] / RIG.arm.w, y: RIG.arm.shoulder[1] / RIG.arm.h },
  armR: { x: RIG.arm.shoulder[0] / RIG.arm.w, y: RIG.arm.shoulder[1] / RIG.arm.h },
  legL: { x: RIG.leg.hip[0] / RIG.leg.w, y: RIG.leg.hip[1] / RIG.leg.h },
  legR: { x: RIG.leg.hip[0] / RIG.leg.w, y: RIG.leg.hip[1] / RIG.leg.h },
  weapon: { x: RIG.weapon.grip[0] / RIG.weapon.w, y: RIG.weapon.grip[1] / RIG.weapon.h },
};

/** foot line to head crown at scale 1 (@2x units) */
export const RIG_HEIGHT = LEG_LEN - NECK.y + RIG.head.neck[1];

/** Idle clip (screens doc 6.4): 2.4s loop, quantized to 12 fps for the clay feel. */
const IDLE_MS = 2400;
const FRAME_MS = 1000 / 12;
const DEG = Math.PI / 180;

export interface Rig {
  root: Container;
  setArt: (socket: Socket, art: PartArt | null) => void;
  /** a 60% alpha preview of a part on an empty socket (tap-to-equip) */
  setGhost: (socket: Socket, art: PartArt | null) => void;
  setPaint: (hex: number) => void;
  setDecal: (id: DecalId | null) => void;
  /** white flash for 2 render frames (the socket clunk) */
  flash: (socket: Socket) => void;
  /** advance the idle to time t (ms) and apply every transform */
  update: (tMs: number) => void;
  /** the current hotspot point of a socket, in root space */
  socketPoint: (socket: Socket) => { x: number; y: number };
  destroy: () => void;
}

interface Node {
  socket: Socket;
  node: Container;
  base: Sprite;
  mask: Sprite;
  flash: Sprite;
  ghost: Sprite;
  flashFrames: number;
}

export function buildRig(PIXI: Pixi): Rig {
  const root = new PIXI.Container();
  root.sortableChildren = true;
  const nodes = new Map<Socket, Node>();
  let paint = 0xffffff;

  const spriteAt = (socket: Socket): Sprite => {
    const s = new PIXI.Sprite(PIXI.Texture.EMPTY);
    s.anchor.set(ANCHOR[socket].x, ANCHOR[socket].y);
    return s;
  };

  DRAW_ORDER.forEach((socket, z) => {
    const node = new PIXI.Container();
    node.zIndex = z;
    const base = spriteAt(socket);
    const mask = spriteAt(socket);
    mask.blendMode = "multiply";
    mask.tint = paint;
    const flash = spriteAt(socket);
    flash.blendMode = "add";
    flash.alpha = 0.7;
    flash.visible = false;
    const ghost = spriteAt(socket);
    ghost.alpha = 0.6;
    ghost.visible = false;
    node.addChild(ghost, base, mask, flash);
    if (MIRRORED[socket]) node.scale.x = -1;
    root.addChild(node);
    nodes.set(socket, { socket, node, base, mask, flash, ghost, flashFrames: 0 });
  });

  // the decal rides the torso at the contract's decal point
  const torso = nodes.get("torso")!;
  const decal: Graphics = new PIXI.Graphics();
  decal.position.set(DECAL.x, DECAL.y);
  torso.node.addChild(decal);

  const points: Record<Socket, { x: number; y: number }> = {
    head: { x: 0, y: 0 }, torso: { x: 0, y: 0 }, armL: { x: 0, y: 0 }, armR: { x: 0, y: 0 },
    legL: { x: 0, y: 0 }, legR: { x: 0, y: 0 }, weapon: { x: 0, y: 0 },
  };

  function drawDecal(id: DecalId | null) {
    decal.clear();
    if (!id) return;
    // ink on light paints, cream on dark ones, so a sticker always reads
    const l = ((paint >> 16) & 255) * 0.299 + ((paint >> 8) & 255) * 0.587 + (paint & 255) * 0.114;
    const c = l > 120 ? 0x2b2f3a : 0xf3e9d2;
    const S = 56; // sticker width, @2x
    if (id === "plate") {
      decal.roundRect(-S / 2, -16, S, 32, 6).stroke({ width: 4, color: c });
      decal.circle(-14, 0, 4).fill(c);
      decal.circle(14, 0, 4).fill(c);
    } else if (id === "bolt") {
      decal.poly([-6, -30, 12, -30, 2, -6, 16, -6, -10, 30, -2, 4, -16, 4]).fill(c);
    } else if (id === "star") {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 30 : 13;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      decal.poly(pts).fill(c);
    } else if (id === "stripes") {
      for (let i = -1; i <= 1; i++) decal.roundRect(-S / 2, i * 14 - 4, S, 8, 4).fill(c);
    } else if (id === "wrenches") {
      for (const dir of [1, -1]) {
        const x0 = -22 * dir, y0 = 22, x1 = 22 * dir, y1 = -22;
        const nx = 3.5, ny = 3.5 * dir;
        decal.poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny]).fill(c);
        decal.circle(x1, y1, 9).fill(c);
        decal.circle(x1 + 4 * dir, y1 - 4, 4).fill(l > 120 ? 0xffffff : c);
      }
    } else if (id === "heart") {
      decal.circle(-11, -8, 13).fill(c);
      decal.circle(11, -8, 13).fill(c);
      decal.poly([-23, -2, 23, -2, 0, 26]).fill(c);
    }
  }
  let decalId: DecalId | null = null;

  return {
    root,
    setArt(socket, art) {
      const n = nodes.get(socket)!;
      n.base.texture = art ? art.base : PIXI.Texture.EMPTY;
      n.mask.texture = art?.mask ?? PIXI.Texture.EMPTY;
      n.flash.texture = art ? art.base : PIXI.Texture.EMPTY;
      n.base.visible = n.mask.visible = !!art;
      if (!art) n.flash.visible = false;
    },
    setGhost(socket, art) {
      const n = nodes.get(socket)!;
      n.ghost.texture = art ? art.base : PIXI.Texture.EMPTY;
      n.ghost.visible = !!art;
    },
    setPaint(hex) {
      paint = hex;
      nodes.forEach((n) => {
        n.mask.tint = hex;
      });
      drawDecal(decalId);
    },
    setDecal(id) {
      decalId = id;
      drawDecal(id);
    },
    flash(socket) {
      const n = nodes.get(socket)!;
      if (n.base.visible) n.flashFrames = 2;
    },
    update(tMs) {
      // quantized to 12 fps: transforms step, they never glide
      const q = Math.floor(tMs / FRAME_MS) * FRAME_MS;
      const ph = (q / IDLE_MS) * Math.PI * 2;
      const breath = 1 + 0.01 * (1 + Math.sin(ph));
      const headTilt = 2 * DEG * Math.sin(((q - 200) / IDLE_MS) * Math.PI * 2);
      const swing = 3 * DEG * Math.sin(ph);
      const hipsY = -LEG_LEN;

      const set = (socket: Socket, x: number, y: number, rot: number, sy = 1) => {
        const n = nodes.get(socket)!;
        n.node.position.set(x, y);
        n.node.rotation = rot;
        n.node.scale.y = sy;
        if (n.flashFrames > 0) {
          n.flash.visible = true;
          n.flashFrames -= 1;
        } else {
          n.flash.visible = false;
        }
        points[socket].x = x;
        points[socket].y = y;
      };

      // legs are planted: no idle motion, ever
      set("legL", HIP_L.x, hipsY, 0);
      set("legR", HIP_R.x, hipsY, 0);
      set("torso", 0, hipsY, 0, breath);
      set("head", NECK.x, hipsY + NECK.y * breath, headTilt);
      // arms swing antiphase; the far arm is mirrored so its sign flips back
      set("armL", SHOULDER_L.x, hipsY + SHOULDER_L.y * breath, swing);
      set("armR", SHOULDER_R.x, hipsY + SHOULDER_R.y * breath, -swing);
      // the weapon follows the near hand
      const ar = -swing;
      const hx = SHOULDER_R.x + HAND.x * Math.cos(ar) - HAND.y * Math.sin(ar);
      const hy = hipsY + SHOULDER_R.y * breath + HAND.x * Math.sin(ar) + HAND.y * Math.cos(ar);
      set("weapon", hx, hy, ar + WEAPON_REST);
      // the torso hotspot is the chest centre (the decal point), not the hips
      points.torso.x = DECAL.x;
      points.torso.y = hipsY + DECAL.y * breath;
    },
    socketPoint(socket) {
      return { x: points[socket].x, y: points[socket].y };
    },
    destroy() {
      root.destroy({ children: true });
    },
  };
}
