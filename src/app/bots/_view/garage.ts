/**
 * THE GARAGE (screens doc 3.1 and 3.2): the interior diorama the Garage
 * screen paints. A putty back wall in six stepped bands, a concrete floor,
 * the corkboard on the left wall and the tool board on the right, five bays
 * along the floor each with the real stand under its bot, the workbench
 * between bays 2 and 3 with the crew at it, the toolbox and the ceiling fan
 * as dressing, a cream bay tag hanging off every stand, and the warm
 * vignette fading to the frame edge (never to the page dark).
 *
 * Shape copied from the bay (src/app/bots/_view/bay.ts, itself the S7 front
 * scene shape): owns no rAF, the client drives render(now); every position
 * is in SCENE px (setdressing.ts) and a camera container letterboxes or
 * pans them, so the phone shows the same scene through a narrower window
 * instead of a second layout. Props load through one guarded shelf (the S7
 * scene's tryLoad): every painted sprite keeps a drawn fallback, so the
 * canvas works with public/bots-art deleted (the house law).
 *
 * Text painted in here (Baloo 2, the toy voice): the bay tags (name and
 * status, the countdown included, the one number a canvas may paint), the
 * floor plate numbers and the crew speech chips. Everything else is DOM.
 */
"use client";

import type { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { createPixiStage, type PixiStage } from "@/app/s7/games/_shared/pixi";
import { DRAW_ORDER, RIG_HEIGHT, buildRig, type PartArt, type Rig } from "./rig";
import {
  BAY_FLOOR_Y,
  BAY_X,
  BOT_HEIGHT,
  CREW_SPOT,
  GARAGE_SET,
  PROP_SIZE,
  SCENE,
  STAND,
  TRIP_WIRE,
  propFile,
  type PropKey,
  type SetItem,
} from "./setdressing";
import { K, M } from "../_ui/tokens";
import { BAY_COUNT, type Socket, type StrategyKind } from "@/lib/bots/fixtures";

export type TagDot = "good" | "warn" | "bad" | "muted" | "dashed";

export interface BayTag {
  name: string;
  status: string;
  dot: TagDot;
  /** the "In a battle" dot pulses */
  pulse?: boolean;
}

export interface GarageOpts {
  small: boolean;
  /** the resolved Baloo 2 family (the owner reads --font-bots-toy) */
  toyFont: string;
  onBayTap?: (bay: number) => void;
  onCorkboardTap?: () => void;
  onToolBoardTap?: () => void;
  onCrewTap?: (kind: StrategyKind) => void;
  /** the phone camera settled on a bay (after a swipe) */
  onFocus?: (bay: number) => void;
}

export interface GarageHandle {
  stage: PixiStage;
  /** index 0..4 = bay 1..5; the client pushes art exactly as the Build screen does */
  rigs: Rig[];
  render: (nowMs: number) => void;
  resize: (cssW: number, cssH: number, dpr: number) => void;
  setBotVisible: (bay: number, visible: boolean) => void;
  setTag: (bay: number, tag: BayTag | null) => void;
  /** one figure per live strategy, at its authored spot */
  setCrew: (kinds: readonly StrategyKind[]) => void;
  /** a speech chip over a figure for 4 seconds of render time, plus a work beat */
  speak: (kind: StrategyKind, text: string) => void;
  /** the phone camera: centre this bay */
  focusBay: (bay: number) => void;
  /** the bot alone, HUD-free, as a PNG data URL (the bay sheet's picture) */
  extractBot: (bay: number) => Promise<string | null>;
  destroy: () => void;
}

const hex = (h: string): number => parseInt(h.slice(1), 16);
const FRAME_MS = 1000 / 12;
const SPEAK_MS = 4000;
const CREW_KINDS: readonly StrategyKind[] = ["blsh", "position", "limit"];

/** stepped colour ramp, copied from bay.ts: warm up, cool down */
function band(base: number, k: number): number {
  const r = (base >> 16) & 255, g = (base >> 8) & 255, b = base & 255;
  const lum = (v: number, warm: number) => Math.max(0, Math.min(255, Math.round(v + k * 34 + (k > 0 ? warm : -warm * 0.6))));
  return (lum(r, 6 * k) << 16) | (lum(g, 3 * k) << 8) | lum(b, k > 0 ? 0 : 8 * -k);
}

/**
 * Per-socket paint. The rig's setPaint tints every mask at once; a paint
 * job is per part, so this reaches the mask sprite of each node (children
 * order in rig.ts: ghost, base, mask, flash). TODO(rig): replace with a
 * rig.setPaintFor(socket, hex) once the rig lane adds it.
 */
export function paintRigSockets(rig: Rig, paints: Partial<Record<Socket, number>>): void {
  DRAW_ORDER.forEach((socket, i) => {
    const node = rig.root.children[i] as Container | undefined;
    const mask = node?.children?.[2] as Sprite | undefined;
    const v = paints[socket];
    if (mask && v != null) mask.tint = v;
  });
}

export async function buildGarage(canvas: HTMLCanvasElement, opts: GarageOpts): Promise<GarageHandle> {
  // the stage's sim: the whole scene on desktop, a 780x600 window on a phone
  const simW = opts.small ? 780 : SCENE.w;
  const simH = opts.small ? 600 : SCENE.h;
  const stage = await createPixiStage(canvas, { background: hex(K.vignette) });
  const PIXI = stage.pixi;
  const W = stage.world;

  // ── the camera ───────────────────────────────────────────────────────────
  const cam: Container = new PIXI.Container();
  const camScale = opts.small ? simH / SCENE.h : 1;
  cam.scale.set(camScale);
  W.addChild(cam);
  let camX = 0;
  let camTarget = 0;
  const camFor = (bay: number) => (opts.small ? simW / 2 - BAY_X[bay - 1] * camScale : 0);

  // ── the texture shelf (every load individually guarded: kit law) ────────
  const tex = new Map<PropKey, Texture>();
  const tryLoad = async (key: PropKey) => {
    try {
      const t = (await PIXI.Assets.load(propFile(key))) as Texture;
      tex.set(key, t);
    } catch {
      /* vector fallback covers it */
    }
  };
  await Promise.all((Object.keys(PROP_SIZE) as PropKey[]).map(tryLoad));

  // ── the room ─────────────────────────────────────────────────────────────
  const wall: Graphics = new PIXI.Graphics();
  const wallBase = hex(K.wall);
  for (let i = 0; i < 6; i++) {
    const k = 0.5 - i / 5;
    wall.rect(0, (SCENE.floorY * i) / 6, SCENE.w, SCENE.floorY / 6 + 1).fill(band(wallBase, k));
  }
  const floor: Graphics = new PIXI.Graphics();
  const floorBase = hex(K.floor);
  floor.rect(0, SCENE.floorY, SCENE.w, SCENE.h - SCENE.floorY).fill(floorBase);
  floor.rect(0, SCENE.floorY, SCENE.w, 8).fill(band(floorBase, -0.35));
  floor.rect(0, SCENE.floorY + 8, SCENE.w, 50).fill(band(floorBase, 0.12));
  // a pool of shadow under every stand, the only softness on the floor
  for (const x of BAY_X) floor.ellipse(x, BAY_FLOOR_Y - 4, 150, 22).fill({ color: 0x8a8898, alpha: 0.2 });
  cam.addChild(wall, floor);

  const wallLayer: Container = new PIXI.Container();
  const floorLayer: Container = new PIXI.Container();
  floorLayer.sortableChildren = true;
  cam.addChild(wallLayer, floorLayer);

  // ── props (painted, or drawn when the art is missing) ────────────────────
  const propBox = (key: PropKey, s: number) => ({ w: PROP_SIZE[key][0] * s, h: PROP_SIZE[key][1] * s });

  function fallbackProp(key: PropKey, s: number, anchor: "floor" | "wall"): Graphics {
    const g: Graphics = new PIXI.Graphics();
    const { w, h } = propBox(key, s);
    const x0 = -w / 2;
    const y0 = anchor === "floor" ? -h : -h / 2;
    const clay = hex(K.clay), brass = hex(K.brass), rubber = hex(K.rubber), paper = hex(K.paper);
    switch (key) {
      case "corkboard":
        g.roundRect(x0, y0, w, h, 16).fill(0xc48a4a);
        g.roundRect(x0 + 14, y0 + 14, w - 28, h - 28, 10).fill(0xd9a86a);
        g.roundRect(x0 + w * 0.12, y0 + h * 0.2, w * 0.45, h * 0.55, 8).fill(paper);
        g.roundRect(x0 + w * 0.62, y0 + h * 0.3, w * 0.25, h * 0.3, 8).fill(paper);
        g.circle(x0 + w * 0.2, y0 + h * 0.25, 9).fill(hex(M.bad));
        g.circle(x0 + w * 0.5, y0 + h * 0.25, 9).fill(hex(M.bad));
        break;
      case "tool-board":
        g.roundRect(x0, y0, w, h, 20).fill(paper);
        for (let yy = y0 + 30; yy < y0 + h - 20; yy += 34) for (let xx = x0 + 30; xx < x0 + w - 20; xx += 34) g.circle(xx, yy, 4).fill(0xd8cdb4);
        for (let i = 0; i < 3; i++) g.roundRect(x0 + 40 + i * (w / 3.4), y0 + 40, 14, h * 0.4, 7).fill(brass);
        break;
      case "ceiling-fan": {
        // four blades seen from below: two ellipses on each axis
        const L = h / 2 - 24;
        g.ellipse(0, -L / 2 - 20, 15, L / 2).fill(paper);
        g.ellipse(0, L / 2 + 20, 15, L / 2).fill(paper);
        g.ellipse(-L / 2 - 20, 0, L / 2, 15).fill(paper);
        g.ellipse(L / 2 + 20, 0, L / 2, 15).fill(paper);
        g.circle(0, 0, 34).fill(brass);
        break;
      }
      case "workbench":
        g.roundRect(x0, y0 + h * 0.3, w, h * 0.18, 10).fill(0xd9a86a);
        g.roundRect(x0 + 20, y0 + h * 0.48, w - 40, h * 0.52, 10).fill(0xc48a4a);
        g.roundRect(x0 + 40, y0 + h * 0.55, w * 0.35, h * 0.15, 6).fill(0xd9a86a);
        g.roundRect(x0 + w * 0.55, y0 + h * 0.55, w * 0.35, h * 0.15, 6).fill(0xd9a86a);
        g.circle(x0 + w * 0.85, y0 + h * 0.1, 26).fill(brass);
        break;
      case "toolbox":
        g.roundRect(x0, y0 + h * 0.3, w, h * 0.7, 16).fill(hex(M.bad));
        g.roundRect(x0 + w * 0.3, y0, w * 0.4, h * 0.34, 14).fill(rubber);
        g.roundRect(x0 + w * 0.42, y0 + h * 0.55, w * 0.16, h * 0.2, 6).fill(brass);
        break;
      case "stand":
        g.ellipse(0, -h * 0.16, w / 2, h * 0.12).fill(0x9a9aa8);
        g.ellipse(0, -h * 0.2, w / 2 - 8, h * 0.1).fill(clay);
        g.roundRect(-14, -h * 0.9, 28, h * 0.72, 10).fill(0x9fd9c4);
        g.roundRect(-w * 0.28, -h, w * 0.56, h * 0.14, 14).fill(paper);
        for (const dx of [-w * 0.3, w * 0.3]) g.circle(dx, -h * 0.06, 18).fill(rubber);
        break;
      default: {
        // a crew figure: the bay's wrencher shape, standing (bay.ts)
        g.ellipse(0, -h * 0.42, w * 0.26, h * 0.3).fill(clay);
        g.circle(0, -h * 0.78, h * 0.17).fill(clay);
        g.circle(-h * 0.06, -h * 0.8, h * 0.05).fill(hex(K.glass));
        g.circle(h * 0.06, -h * 0.8, h * 0.05).fill(hex(K.glass));
        g.roundRect(-h * 0.07, -h * 0.7, h * 0.14, h * 0.035, 4).fill(rubber);
        g.roundRect(-w * 0.25, -h * 0.14, w * 0.18, h * 0.14, 8).fill(rubber);
        g.roundRect(w * 0.07, -h * 0.14, w * 0.18, h * 0.14, 8).fill(rubber);
        g.roundRect(w * 0.2, -h * 0.6, h * 0.05, h * 0.3, 6).fill(brass);
      }
    }
    return g;
  }

  function placeProp(item: SetItem): Container {
    const t = tex.get(item.key);
    let node: Container;
    if (t) {
      const s: Sprite = new PIXI.Sprite(t);
      s.anchor.set(0.5, item.anchor === "floor" ? 1 : 0.5);
      s.scale.set(item.s);
      node = s;
    } else {
      node = fallbackProp(item.key, item.s, item.anchor);
    }
    node.position.set(item.x, item.y);
    if (item.flip) node.scale.x = -Math.abs(node.scale.x);
    if (item.anchor === "wall") wallLayer.addChild(node);
    else {
      node.zIndex = item.y;
      floorLayer.addChild(node);
    }
    return node;
  }

  let fan: Container | null = null;
  const wallHits: Array<{ key: PropKey; x: number; y: number; w: number; h: number }> = [];
  for (const item of GARAGE_SET) {
    const node = placeProp(item);
    if (item.key === "ceiling-fan") fan = node;
    if (item.anchor === "wall") {
      const { w, h } = propBox(item.key, item.s);
      wallHits.push({ key: item.key, x: item.x, y: item.y, w, h });
    }
  }

  // ── the five bays: stand, rig, floor plate, tag ──────────────────────────
  const rigScale = BOT_HEIGHT / RIG_HEIGHT;
  const feetY = BAY_FLOOR_Y - STAND.feetAboveGround;
  const rigs: Rig[] = [];
  const tags: Array<{ root: Container; bg: Graphics; name: Text; status: Text; dot: Graphics; pulse: boolean; on: boolean }> = [];
  const emptyRings: Graphics[] = [];

  for (let i = 0; i < BAY_COUNT; i++) {
    const x = BAY_X[i];
    placeProp({ key: "stand", x, y: BAY_FLOOR_Y, s: STAND.s, anchor: "floor" });

    const rig = buildRig(PIXI);
    rig.root.scale.set(rigScale);
    rig.root.position.set(x, feetY);
    rig.root.zIndex = BAY_FLOOR_Y + 1;
    rig.root.visible = false;
    floorLayer.addChild(rig.root);
    rigs.push(rig);

    // the empty bay's dashed ring on the base plate
    const ring: Graphics = new PIXI.Graphics();
    const n = 16;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = a0 + ((Math.PI * 2) / n) * 0.55;
      ring.moveTo(Math.cos(a0) * 110, Math.sin(a0) * 26);
      for (let q = 1; q <= 4; q++) {
        const a = a0 + ((a1 - a0) * q) / 4;
        ring.lineTo(Math.cos(a) * 110, Math.sin(a) * 26);
      }
      ring.stroke({ width: 5, color: 0xffffff, alpha: 0.7 });
    }
    ring.position.set(x, feetY + 4);
    ring.zIndex = BAY_FLOOR_Y + 2;
    ring.visible = false;
    floorLayer.addChild(ring);
    emptyRings.push(ring);

    // the floor plate: a painted number 1..5 in front of the stand
    const plate: Container = new PIXI.Container();
    const plateBg: Graphics = new PIXI.Graphics();
    plateBg.roundRect(-40, -22, 80, 44, 10).fill(hex(K.rubber));
    plateBg.roundRect(-40, -22, 80, 44, 10).stroke({ width: 3, color: 0x6a6a72 });
    const plateText: Text = new PIXI.Text({
      text: String(i + 1),
      style: { fontFamily: opts.toyFont, fontSize: 34, fontWeight: "800", fill: hex(K.paper) },
    });
    plateText.anchor.set(0.5, 0.5);
    plateText.position.set(0, 2);
    plate.addChild(plateBg, plateText);
    plate.position.set(x, BAY_FLOOR_Y + 48);
    plate.zIndex = BAY_FLOOR_Y + 60;
    floorLayer.addChild(plate);

    // the tag: cream, two lines, a dot, hung off the stand's post by a string
    const root: Container = new PIXI.Container();
    const bg: Graphics = new PIXI.Graphics();
    const name: Text = new PIXI.Text({
      text: "",
      style: { fontFamily: opts.toyFont, fontSize: 28, fontWeight: "800", fill: hex(K.ink) },
    });
    const status: Text = new PIXI.Text({
      text: "",
      style: { fontFamily: opts.toyFont, fontSize: 22, fontWeight: "600", fill: 0x5a4c3a },
    });
    const dot: Graphics = new PIXI.Graphics();
    root.addChild(bg, name, status, dot);
    root.position.set(x + 96, feetY - 150);
    root.zIndex = BAY_FLOOR_Y + 50;
    root.visible = false;
    floorLayer.addChild(root);
    tags.push({ root, bg, name, status, dot, pulse: false, on: false });
  }

  const drawTag = (i: number, tag: BayTag | null) => {
    const t = tags[i];
    if (!tag) {
      t.root.visible = false;
      t.on = false;
      emptyRings[i].visible = false;
      return;
    }
    t.on = true;
    t.pulse = !!tag.pulse;
    t.name.text = tag.name;
    t.status.text = tag.status;
    const w = Math.max(200, Math.max(t.name.width, t.status.width + 30) + 40);
    const h = 92;
    t.bg.clear();
    // the string up to the cradle
    t.bg.moveTo(-60, -150).lineTo(14, 0).stroke({ width: 3, color: hex(K.rubber), alpha: 0.7 });
    t.bg.roundRect(0, 0, w, h, 12).fill(hex(K.paper));
    t.bg.roundRect(0, 0, w, h, 12).stroke({ width: 3, color: 0xcdbf9f });
    t.bg.circle(14, 14, 6).fill(hex(K.brass));
    t.name.position.set(20, 12);
    t.status.position.set(44, 50);
    t.dot.clear();
    const dotColor = tag.dot === "good" ? hex(M.good) : tag.dot === "warn" ? hex(M.warn) : tag.dot === "bad" ? hex(M.bad) : hex(M.muted);
    if (tag.dot === "dashed") {
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = a0 + ((Math.PI * 2) / n) * 0.55;
        t.dot.moveTo(Math.cos(a0) * 8, Math.sin(a0) * 8);
        t.dot.arc(0, 0, 8, a0, a1);
        t.dot.stroke({ width: 3, color: hex(M.muted) });
      }
    } else {
      t.dot.circle(0, 0, 8).fill(dotColor);
    }
    t.dot.position.set(26, 64);
    t.root.visible = true;
    emptyRings[i].visible = tag.dot === "dashed";
  };

  // ── the crew (one figure per live strategy) ──────────────────────────────
  const crew = new Map<StrategyKind, { node: Container; chip: Container; chipText: Text; chipBg: Graphics; speakUntil: number; baseY: number; baseSX: number; baseSY: number; h: number }>();
  const wire: Graphics = new PIXI.Graphics();
  wire.zIndex = TRIP_WIRE.y - 1;
  wire.visible = false;
  wire.moveTo(TRIP_WIRE.x0, TRIP_WIRE.y).lineTo(TRIP_WIRE.x1, TRIP_WIRE.y).stroke({ width: 4, color: hex(K.brass) });
  for (const px of [TRIP_WIRE.x0, TRIP_WIRE.x1]) wire.roundRect(px - 8, TRIP_WIRE.y - 26, 16, 30, 5).fill(hex(K.rubber));
  floorLayer.addChild(wire);

  for (const kind of CREW_KINDS) {
    const spot = CREW_SPOT[kind];
    const node = placeProp(spot);
    node.visible = false;
    const { h } = propBox(spot.key, spot.s);
    const chip: Container = new PIXI.Container();
    const chipBg: Graphics = new PIXI.Graphics();
    const chipText: Text = new PIXI.Text({
      text: "",
      style: { fontFamily: opts.toyFont, fontSize: 28, fontWeight: "700", fill: hex(K.ink) },
    });
    chipText.anchor.set(0.5, 0.5);
    chip.addChild(chipBg, chipText);
    chip.position.set(spot.x, spot.y - h - 44);
    chip.zIndex = BAY_FLOOR_Y + 80;
    chip.visible = false;
    floorLayer.addChild(chip);
    crew.set(kind, { node, chip, chipText, chipBg, speakUntil: -1, baseY: spot.y, baseSX: node.scale.x, baseSY: node.scale.y, h });
  }
  let liveCrew: readonly StrategyKind[] = [];

  // ── the vignette (stage space, over the camera) ──────────────────────────
  {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(128, 118, 60, 128, 128, 172);
      grad.addColorStop(0, "rgba(191,181,166,0)");
      grad.addColorStop(0.7, "rgba(191,181,166,0.06)");
      grad.addColorStop(1, "rgba(191,181,166,0.85)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      const vig: Sprite = new PIXI.Sprite(PIXI.Texture.from(cv));
      vig.width = simW;
      vig.height = simH;
      W.addChild(vig);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  let focused = 1;
  camTarget = camFor(focused);
  camX = camTarget;
  let dragging = false;
  // speak() cannot read a clock (no clock reads in a scene): the next painted
  // frame stamps the chip's end time from the owner's rAF `now`
  const pendingSpeak: Array<{ speakUntil: number }> = [];

  function render(now: number) {
    for (const c of pendingSpeak) c.speakUntil = now + SPEAK_MS;
    pendingSpeak.length = 0;

    // the phone camera eases toward its bay unless a finger holds it
    if (!dragging) camX += (camTarget - camX) * 0.18;
    cam.position.set(camX, 0);

    const q = Math.floor(now / FRAME_MS) * FRAME_MS;
    for (let i = 0; i < rigs.length; i++) {
      // staggered by bay so five bots never breathe in step
      rigs[i].update(now + i * 400);
    }
    if (fan) fan.rotation = ((q / 6000) * Math.PI * 2) % (Math.PI * 2);

    // tags: the battle dot pulses
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((now / 900) * Math.PI * 2));
    for (const t of tags) if (t.on) t.dot.alpha = t.pulse ? pulse : 1;

    // crew idles and speech, quantized to 12 fps like the rig
    crew.forEach((c, kind) => {
      if (!c.node.visible) return;
      const speaking = c.speakUntil > now;
      c.chip.visible = speaking;
      if (speaking) {
        // a 4-frame work beat: a squash that steps
        const beat = Math.floor(((now - (c.speakUntil - SPEAK_MS)) % 600) / 150);
        const sq = [1, 0.96, 0.93, 0.97][beat];
        c.node.scale.set(c.baseSX, c.baseSY * sq);
      } else {
        c.node.scale.set(c.baseSX, c.baseSY);
      }
      if (kind === "blsh") {
        // taps a foot: a 6px hop every 1.2 s, feet planted the rest of the time
        c.node.position.y = c.baseY - (q % 1200 < FRAME_MS * 2 ? 6 : 0);
      } else if (kind === "position") {
        c.node.rotation = 0.03 * Math.sin((q / 2400) * Math.PI * 2);
      } else {
        // perfectly still, eyes on the wire; a blink every 4 s is one squashed frame
        c.node.scale.y = c.baseSY * (q % 4000 < FRAME_MS ? 0.985 : c.node.scale.y / c.baseSY);
      }
    });
    stage.renderFrame();
  }

  // ── pointer: taps, hover, and the phone swipe ────────────────────────────
  let scale = 1;
  let offX = 0;
  let offY = 0;
  const toScene = (cssX: number, cssY: number) => {
    const sx = (cssX - offX) / scale;
    const sy = (cssY - offY) / scale;
    return { x: (sx - camX) / camScale, y: sy / camScale };
  };
  type Hit = { kind: "bay"; bay: number } | { kind: "cork" } | { kind: "tools" } | { kind: "crew"; who: StrategyKind };
  const hitAt = (cssX: number, cssY: number): Hit | null => {
    const p = toScene(cssX, cssY);
    for (const kind of liveCrew) {
      const c = crew.get(kind);
      const spot = CREW_SPOT[kind];
      if (!c) continue;
      const { w, h } = propBox(spot.key, spot.s);
      if (Math.abs(p.x - spot.x) <= w / 2 && p.y <= spot.y && p.y >= spot.y - h) return { kind: "crew", who: kind };
    }
    for (let i = 0; i < BAY_COUNT; i++) {
      if (Math.abs(p.x - BAY_X[i]) <= 170 && p.y >= feetY - BOT_HEIGHT - 40 && p.y <= BAY_FLOOR_Y + 70) return { kind: "bay", bay: i + 1 };
    }
    for (const h of wallHits) {
      if (Math.abs(p.x - h.x) <= h.w / 2 && Math.abs(p.y - h.y) <= h.h / 2) return h.key === "corkboard" ? { kind: "cork" } : { kind: "tools" };
    }
    return null;
  };
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let down: { x: number; y: number; camX: number; moved: boolean } | null = null;
  const onDown = (e: PointerEvent) => {
    const { x, y } = local(e);
    down = { x, y, camX, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    const { x, y } = local(e);
    if (down) {
      if (!down.moved && Math.hypot(x - down.x, y - down.y) > 6) down.moved = true;
      if (down.moved && opts.small) {
        dragging = true;
        camX = down.camX + (x - down.x) / scale;
      }
      return;
    }
    const h = hitAt(x, y);
    canvas.style.cursor = h ? "pointer" : "default";
  };
  const onUp = (e: PointerEvent) => {
    const { x, y } = local(e);
    const d = down;
    down = null;
    if (!d) return;
    if (d.moved && opts.small) {
      dragging = false;
      // snap to the nearest bay
      let best = 1;
      let bestD = Infinity;
      for (let i = 0; i < BAY_COUNT; i++) {
        const dd = Math.abs(camFor(i + 1) - camX);
        if (dd < bestD) {
          bestD = dd;
          best = i + 1;
        }
      }
      focused = best;
      camTarget = camFor(best);
      opts.onFocus?.(best);
      return;
    }
    if (d.moved) return;
    const h = hitAt(x, y);
    if (!h) return;
    if (h.kind === "bay") opts.onBayTap?.(h.bay);
    else if (h.kind === "cork") opts.onCorkboardTap?.();
    else if (h.kind === "tools") opts.onToolBoardTap?.();
    else opts.onCrewTap?.(h.who);
  };
  const onLeave = () => {
    if (down?.moved && opts.small) {
      dragging = false;
      camTarget = camFor(focused);
    }
    down = null;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  return {
    stage,
    rigs,
    render,
    resize(cssW, cssH, dpr) {
      stage.resize(cssW, cssH, dpr, simW, simH);
      scale = Math.min(cssW / simW, cssH / simH) || 1;
      offX = (cssW - simW * scale) / 2;
      offY = (cssH - simH * scale) / 2;
    },
    setBotVisible(bay, visible) {
      rigs[bay - 1].root.visible = visible;
    },
    setTag(bay, tag) {
      drawTag(bay - 1, tag);
    },
    setCrew(kinds) {
      liveCrew = kinds;
      crew.forEach((c, kind) => {
        c.node.visible = kinds.includes(kind);
      });
      wire.visible = kinds.includes("limit");
    },
    speak(kind, text) {
      const c = crew.get(kind);
      if (!c || !c.node.visible) return;
      c.chipText.text = text;
      const w = c.chipText.width + 44;
      const h = 56;
      c.chipBg.clear();
      c.chipBg.roundRect(-w / 2, -h / 2, w, h, 14).fill(hex(K.paper));
      c.chipBg.roundRect(-w / 2, -h / 2, w, h, 14).stroke({ width: 3, color: 0xcdbf9f });
      c.chipBg.poly([-10, h / 2 - 1, 10, h / 2 - 1, 0, h / 2 + 14]).fill(hex(K.paper));
      // speakUntil is set on the next painted frame's clock (render's `now`)
      c.speakUntil = Number.POSITIVE_INFINITY;
      pendingSpeak.push(c);
    },
    focusBay(bay) {
      focused = Math.min(BAY_COUNT, Math.max(1, bay));
      camTarget = camFor(focused);
    },
    async extractBot(bay) {
      const rig = rigs[bay - 1];
      if (!rig.root.visible) return null;
      try {
        const cv = stage.app.renderer.extract.canvas({ target: rig.root, resolution: 1 }) as HTMLCanvasElement;
        return cv.toDataURL("image/png");
      } catch {
        return null;
      }
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      for (const r of rigs) r.destroy();
      stage.destroy();
    },
  };
}

export type { PartArt };
