/**
 * THE BAY (screens doc 2.1): the mech-lab diorama the Build screen paints.
 * A putty back wall in six stepped bands, a concrete floor, a warm vignette
 * fading to the frame edge (never to the page dark), the scissor lift rising
 * 40px on open, the bot on it, seven hotspot rings at the rig pivots, a
 * crew wrencher at the near corner, and the name plate hanging off the rail
 * (the ONLY text painted into this canvas).
 *
 * Shape copied from the S7 front scene (src/app/s7/front/scene.ts): owns no
 * rAF, the client drives render(); every position is in sim px and the stage
 * letterboxes them (createPixiStage, used as is). Sim space is 1520x1400 on
 * desktop (the 760x700 canvas at 2x) and 780x840 on a phone (390x420 at 2x),
 * so one sim px is half a css px on both.
 *
 * THE BOT ON THE LIFT IS AWAKE (2026-09-05). This is the screen where a player
 * decides whether they care about this toy, so it is the screen where the toy
 * has to look back. The rig carries the face and the breath (_view/rig.ts);
 * what this file owes it is the three pieces of state only this screen has:
 * WHERE THE POINTER IS, so the bot follows it and perks up when it is on him;
 * WHICH SOCKETS ARE FILLED, so a half built bot reads flat and a finished one
 * reads eager; and WHEN A PART WENT ON, so he bounces and looks at his new arm.
 * All of it is rendering, and none of it can move a replay hash.
 */
"use client";

import { installWorkshop } from "./workshop-light";
import type { Container, Graphics, Sprite, Text } from "pixi.js";
import { createPixiStage, type PixiStage } from "@/app/s7/games/_shared/pixi";
import { buildRig, RIG_HEIGHT, type PartArt, type Rig } from "./rig";
import { LIFT, liftFile } from "./rig-points";
import { K, M, T, TIER_COLOR } from "../_ui/tokens";
import { CARD_OF_SOCKET, SOCKETS, type CardSlot, type Socket } from "@/lib/bots/fixtures";
import type { Tier } from "@/lib/bots/tier";

export interface RingState {
  filled: boolean;
  tier: Tier | null;
}

export interface BayOpts {
  small: boolean;
  /** the resolved Baloo 2 family (the owner reads --font-bots-toy) */
  toyFont: string;
  onSocketTap?: (socket: Socket) => void;
  onSocketHover?: (socket: Socket | null) => void;
}

export interface BayHandle {
  stage: PixiStage;
  rig: Rig;
  simW: number;
  simH: number;
  /** css px per sim px, after resize */
  render: (nowMs: number) => void;
  resize: (cssW: number, cssH: number, dpr: number) => void;
  setRings: (state: Record<Socket, RingState>) => void;
  /** a tray card of this slot is selected or dragged: its rings pulse, the rest dim */
  setArming: (slot: CardSlot | null) => void;
  setHover: (socket: Socket | null) => void;
  setName: (text: string) => void;
  /** the wrencher kneels at whichever leg was last touched */
  setWrenchTarget: (socket: "legL" | "legR") => void;
  /** the lift rises 40px over 600ms */
  open: () => void;
  /** ring flash on a socket (2 frames) */
  flashRing: (socket: Socket) => void;
  /** nearest matching socket within radiusCss of a css point, or null */
  hitSocket: (cssX: number, cssY: number, slot: CardSlot | null, radiusCss: number) => Socket | null;
  /** a socket's ring centre in css px (for the drag ghost's snap) */
  socketCss: (socket: Socket) => { x: number; y: number };
  destroy: () => void;
}

const hex = (h: string): number => parseInt(h.slice(1), 16);

/** The DK ease, cubic-bezier(0.32, 0.72, 0, 1), solved for y at x. */
function ease(x: number): number {
  const bx = (t: number) => 3 * 0.32 * t * (1 - t) * (1 - t) + 3 * 0 * t * t * (1 - t) + t * t * t;
  const by = (t: number) => 3 * 0.72 * t * (1 - t) * (1 - t) + 3 * 1 * t * t * (1 - t) + t * t * t;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 20; i++) {
    t = (lo + hi) / 2;
    if (bx(t) < x) lo = t;
    else hi = t;
  }
  return by(t);
}

/** stepped colour ramp, copied in spirit from the bake's shift(): warm up, cool down */
function band(base: number, k: number): number {
  const r = (base >> 16) & 255, g = (base >> 8) & 255, b = base & 255;
  const lum = (v: number, warm: number) => Math.max(0, Math.min(255, Math.round(v + k * 34 + (k > 0 ? warm : -warm * 0.6))));
  return (lum(r, 6 * k) << 16) | (lum(g, 3 * k) << 8) | lum(b, k > 0 ? 0 : 8 * -k);
}

export async function buildBay(canvas: HTMLCanvasElement, opts: BayOpts): Promise<BayHandle> {
  /**
   * THE DESKTOP FRAME LOST 88 CSS PX OF EMPTY WALL (2026-09-06). It was
   * 1520x1400 in a 760x700 box, which left 145 css px of blank wall over the
   * bot's head and pushed the look picker under the fold on a 900 px tall
   * screen: on the demo laptop the only way to find out a robot could have a
   * face was to scroll past it. 1520x1224 in a 760x612 box is the SAME
   * letterbox scale (both are exactly 2 sim px per css px), so the bot on the
   * lift is the same size in pixels as it was and simply owns more of its
   * frame. 74 css px of headroom is left over the crown, and the tallest hat
   * is 30 of them (look.ts TOPPER_H at this rig scale), so nothing clips.
   *
   * THE PHONE'S LIFT WAS CUT IN HALF by the bottom edge: at 0.905 the lift
   * sprite ended at sim 846 in an 840 tall canvas, so the base rail and the
   * shadow pool under it were sliced. 0.86 puts the whole rig, its shadow and
   * the wrencher's own shadow inside the frame with 12 sim px to spare.
   */
  const simW = opts.small ? 780 : 1520;
  const simH = opts.small ? 840 : 1060;
  const stage = await createPixiStage(canvas, { background: hex(K.vignette) });
  const PIXI = stage.pixi;
  const W = stage.world;

  // layout, as fractions of the sim so both sizes share one scene
  const floorY = Math.round(simH * (opts.small ? 0.76 : 0.743));
  const liftTop = Math.round(simH * (opts.small ? 0.86 : 0.8));
  const liftRise = 80; // 40 css px
  const cx = simW / 2;
  const rigScale = opts.small ? 600 / RIG_HEIGHT : 720 / RIG_HEIGHT;
  const liftScale = opts.small ? 0.72 : 1;
  const crewScale = opts.small ? 0.8 : 1.25;

  // â”€â”€ the room â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const wall: Graphics = new PIXI.Graphics();
  const wallBase = hex(K.wall);
  for (let i = 0; i < 6; i++) {
    const k = 0.5 - i / 5; // top lit, bottom sunk
    wall.rect(0, (floorY * i) / 6, simW, floorY / 6 + 1).fill(band(wallBase, k));
  }
  const floor: Graphics = new PIXI.Graphics();
  const floorBase = hex(K.floor);
  floor.rect(0, floorY, simW, simH - floorY).fill(floorBase);
  floor.rect(0, floorY, simW, 6).fill(band(floorBase, -0.35));
  floor.rect(0, floorY + 6, simW, 40).fill(band(floorBase, 0.12));
  // a soft pool of shadow under the lift, the only softness on the floor
  floor.ellipse(cx, liftTop + 120 * liftScale, LIFT.platformW * 0.62 * liftScale, 28 * liftScale).fill({ color: 0x8a8898, alpha: 0.22 });
  W.addChild(wall, floor);
  try { await installWorkshop(PIXI, W, simW, simH, floorY); wall.visible=false; floor.visible=false; } catch { /* keep the drawn room */ }

  // â”€â”€ the lift (two baked states, crossfaded while it rises) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const liftDown: Sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
  const liftRaised: Sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
  for (const s of [liftDown, liftRaised]) {
    s.anchor.set(0.5, 1);
    s.scale.set(liftScale);
    s.position.set(cx, liftTop + (LIFT.h - LIFT.topRaised) * liftScale);
  }
  W.addChild(liftDown, liftRaised);
  try {
    liftDown.texture = await PIXI.Assets.load(liftFile("down"));
    liftRaised.texture = await PIXI.Assets.load(liftFile("raised"));
  } catch {
    // kit law: the page must run with the art folder deleted; the platform
    // then reads as the shadow pool and the bot still stands on the line
  }

  // â”€â”€ the bot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // the renderer goes in so the rig can read the head texture back and put
  // the blink on the lenses the art actually has (rig.ts measureEyes)
  const rig = buildRig(PIXI, stage.app.renderer);
  rig.root.scale.set(rigScale);
  W.addChild(rig.root);
  // a player who has asked the system for less movement gets a still toy: the
  // bulb stays lit, because a light is not motion
  rig.setCalm(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

  /**
   * â”€â”€ THE WRENCHER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   *
   * A vector mechanic until the crew sheet lands, and until 2026-09-06 a
   * PALE one: clay (#c7cdd6) on a floor of #cfc6b8, with no outline and no
   * contact shadow. Mike read it exactly as it was drawn, "a small white
   * blob sits on the floor to the right of the lift".
   *
   * Three things turn a blob into a person at this size, and none of them is
   * detail: a DARK BODY, so the silhouette is the thing the eye catches
   * first and it is a shape a person recognises; an INK RIM, so nothing on
   * the diorama floats on a floor of nearly its own colour; and a CONTACT
   * SHADOW, so he is kneeling on the concrete rather than pasted over it.
   * At 55 css px tall nothing smaller than those three would survive anyway,
   * which is why the face stays two lenses and a grille.
   */
  const crew: Container = new PIXI.Container();
  const crewShade: Graphics = new PIXI.Graphics();
  const crewBody: Graphics = new PIXI.Graphics();
  const crewArm: Graphics = new PIXI.Graphics();
  {
    const suit = hex(K.rubber);      // the overalls: the dark half of the silhouette
    const skin = hex(K.clay);        // his own head, the light half
    const brass = hex(K.brass);
    const rim = hex(K.ink);
    const line = (a: number) => ({ width: 3, color: rim, alpha: a });
    // he kneels on concrete, so there is a pool under him
    crewShade.ellipse(0, 2, 34, 10).fill({ color: 0x6b6558, alpha: 0.34 });
    crewBody.ellipse(0, -26, 22, 30).fill(suit);          // kneeling body
    crewBody.ellipse(0, -26, 22, 30).stroke(line(0.45));
    crewBody.roundRect(-30, -12, 24, 14, 6).fill(suit);   // the knee, down on the floor
    crewBody.roundRect(-30, -12, 24, 14, 6).stroke(line(0.4));
    crewBody.roundRect(-13, -44, 26, 9, 4).fill(brass);   // the tool belt, his one bright thing
    crewBody.circle(0, -70, 22).fill(skin);               // head
    crewBody.circle(0, -70, 22).stroke(line(0.5));
    // a cap: a dome over the top third of the head and a brim out the front,
    // which is the whole of "mechanic" at 55 px. A band straight across the
    // middle read as a headband, so the dome has to sit ON the crown
    crewBody.ellipse(0, -83, 21, 12).fill(brass);
    crewBody.roundRect(7, -86, 26, 7, 3.5).fill(brass); // the brim: the same way the wrench points
    crewBody.ellipse(0, -83, 21, 12).stroke(line(0.35));
    crewBody.circle(-8, -74, 6).fill(hex(K.glass));
    crewBody.circle(8, -74, 6).fill(hex(K.glass));
    crewBody.circle(-7, -73, 2.5).fill(rim);
    crewBody.circle(9, -73, 2.5).fill(rim);
    crewBody.roundRect(-8, -60, 16, 5, 2).fill({ color: rim, alpha: 0.7 }); // grille smile
    crewArm.roundRect(-4, 0, 10, 36, 5).fill(suit);
    crewArm.roundRect(-4, 0, 10, 36, 5).stroke(line(0.4));
    crewArm.roundRect(-3, 30, 8, 30, 3).fill(brass);      // the wrench
    crewArm.circle(1, 62, 8).fill(brass);
    crewArm.circle(1, 62, 8).stroke({ width: 2.5, color: rim, alpha: 0.4 });
    crewArm.circle(1, 62, 3).fill(rim);
    crewArm.position.set(18, -40);
    crewArm.rotation = -1.2;
    crew.addChild(crewShade, crewBody, crewArm);
  }
  crew.scale.set(crewScale);
  W.addChild(crew);
  let wrenchSide: 1 | -1 = 1;
  const placeCrew = () => {
    // kneeling on the floor at the lift's base, inside the phone canvas
    crew.position.set(cx + wrenchSide * (LIFT.platformW / 2 + 48) * liftScale, liftTop + 96 * liftScale);
    crew.scale.x = crewScale * -wrenchSide;
  };
  placeCrew();

  // â”€â”€ the name plate on the rail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const plate: Container = new PIXI.Container();
  const plateBg: Graphics = new PIXI.Graphics();
  const plateText: Text = new PIXI.Text({
    text: "",
    style: {
      fontFamily: opts.toyFont,
      fontSize: 44,
      fontWeight: "800",
      fill: hex(K.ink),
    },
  });
  plateText.anchor.set(0.5, 0.5);
  plate.addChild(plateBg, plateText);
  plate.scale.set(opts.small ? 0.62 : 1);
  W.addChild(plate);
  const drawPlate = (text: string) => {
    plateText.text = text;
    const w = Math.max(160, plateText.width + 48);
    const h = 64;
    plateBg.clear();
    // two straps up to the rail
    plateBg.roundRect(-w / 2 + 14, -30, 8, 34, 3).fill(hex(K.rubber));
    plateBg.roundRect(w / 2 - 22, -30, 8, 34, 3).fill(hex(K.rubber));
    plateBg.roundRect(-w / 2, 0, w, h, 10).fill(hex(K.paper));
    plateBg.roundRect(-w / 2, 0, w, h, 10).stroke({ width: 3, color: 0xcdbf9f });
    for (const [px, py] of [[-w / 2 + 12, 12], [w / 2 - 12, 12], [-w / 2 + 12, h - 12], [w / 2 - 12, h - 12]]) {
      plateBg.circle(px, py, 4.5).fill(hex(K.brass));
    }
    plateText.position.set(0, h / 2 + 2);
  };
  drawPlate("");

  // â”€â”€ the vignette: a radial fade to K.vignette at the frame edge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(128, 118, 40, 128, 128, 168);
      grad.addColorStop(0, "rgba(191,181,166,0)");
      grad.addColorStop(0.62, "rgba(191,181,166,0.08)");
      grad.addColorStop(1, "rgba(191,181,166,0.9)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      const vig: Sprite = new PIXI.Sprite(PIXI.Texture.from(cv));
      vig.width = simW;
      vig.height = simH;
      W.addChild(vig);
    }
  }

  // â”€â”€ hotspot rings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const rings = new Map<Socket, Graphics>();
  const ringState: Record<Socket, RingState> = {
    head: { filled: false, tier: null }, torso: { filled: false, tier: null },
    armL: { filled: false, tier: null }, armR: { filled: false, tier: null },
    legL: { filled: false, tier: null }, legR: { filled: false, tier: null },
    weapon: { filled: false, tier: null },
  };
  const ringFlash: Record<Socket, number> = { head: 0, torso: 0, armL: 0, armR: 0, legL: 0, legR: 0, weapon: 0 };
  let arming: CardSlot | null = null;
  let hover: Socket | null = null;
  for (const s of SOCKETS) {
    const g: Graphics = new PIXI.Graphics();
    rings.set(s, g);
    W.addChild(g);
  }
  const RING_R = 34; // 34 css px diameter, drawn at 2x
  const RING_W = 4;
  const drawRing = (g: Graphics, color: number, alpha: number, dashed: boolean) => {
    g.clear();
    if (alpha <= 0.01) return;
    if (!dashed) {
      g.circle(0, 0, RING_R).stroke({ width: RING_W, color, alpha });
      return;
    }
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / n * 0.55;
      g.moveTo(Math.cos(a0) * RING_R, Math.sin(a0) * RING_R);
      g.arc(0, 0, RING_R, a0, a1);
      g.stroke({ width: RING_W, color, alpha });
    }
  };

  // â”€â”€ the lift's rise â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let openAt = -1;
  let riseK = 0;
  let landed = true;
  const platformTop = () => liftTop + liftRise * (1 - riseK);

  function render(now: number) {
    // open() only asks; the rise starts on the next painted frame, so this
    // file never reads a clock of its own (the owner's rAF is the one clock)
    if (openAt === -2) openAt = now;
    if (openAt >= 0) {
      riseK = ease(Math.max(0, Math.min(1, (now - openAt) / T.lift)));
      if (riseK >= 1) {
        openAt = -1;
        // the lift stops and the toy settles onto it: a small squash, once
        if (!landed) {
          landed = true;
          rig.poke("land");
        }
      }
    }
    // crossfade the two lift states across the middle of the rise
    const x = Math.max(0, Math.min(1, (riseK - 0.3) / 0.4));
    liftDown.alpha = 1 - x;
    liftRaised.alpha = x;

    rig.root.position.set(cx, platformTop());
    rig.update(now);

    // the wrencher: 4 frames of wrenching every 6 seconds, feet planted
    const beat = now % 6000;
    const frame = beat < 600 ? Math.floor(beat / 150) : -1;
    crewArm.rotation = frame < 0 ? -1.2 : -1.2 + [0, -0.35, -0.6, -0.25][frame];

    // rings, per the pulse rules
    const pulse = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin((now / 1200) * Math.PI * 2));
    const armPulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin((now / 1200) * Math.PI * 2));
    for (const s of SOCKETS) {
      const g = rings.get(s)!;
      const p = rig.socketPoint(s);
      g.position.set(cx + p.x * rigScale, platformTop() + p.y * rigScale);
      const st = ringState[s];
      if (ringFlash[s] > 0) {
        ringFlash[s] -= 1;
        drawRing(g, 0xffffff, 1, false);
        continue;
      }
      const armed = arming ? CARD_OF_SOCKET[s] === arming : false;
      if (arming && !armed) {
        drawRing(g, st.filled ? hex(TIER_COLOR[st.tier ?? 1]) : 0xffffff, 0.15, !st.filled);
      } else if (armed) {
        drawRing(g, st.filled ? hex(TIER_COLOR[st.tier ?? 1]) : 0xffffff, armPulse, !st.filled);
      } else if (!st.filled) {
        drawRing(g, 0xffffff, pulse, true);
      } else {
        drawRing(g, hex(TIER_COLOR[st.tier ?? 1]), hover === s ? 0.35 : 0, false);
      }
    }
    stage.renderFrame();
  }

  // â”€â”€ pointer: hover and tap on the rings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let scale = 1;
  let offX = 0;
  let offY = 0;
  const toSim = (cssX: number, cssY: number) => ({ x: (cssX - offX) / scale, y: (cssY - offY) / scale });
  const socketSim = (s: Socket) => {
    const p = rig.socketPoint(s);
    return { x: cx + p.x * rigScale, y: platformTop() + p.y * rigScale };
  };
  const hitSocket = (cssX: number, cssY: number, slot: CardSlot | null, radiusCss: number): Socket | null => {
    const pt = toSim(cssX, cssY);
    const r = radiusCss / scale;
    let best: Socket | null = null;
    let bestD = r;
    for (const s of SOCKETS) {
      if (slot && CARD_OF_SOCKET[s] !== slot) continue;
      const c = socketSim(s);
      const d = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitR = opts.small ? 22 : 17; // 44 css hit area on a phone, the ring itself on desktop

  /**
   * THE POINTER, IN THE BOT'S OWN UNITS, so the rig can be told where to look
   * without knowing anything about this canvas. The inverse of socketSim, and
   * it goes through the same rigScale and the same platformTop, so a rising
   * lift never leaves the gaze behind.
   */
  const toRig = (cssX: number, cssY: number) => {
    const p = toSim(cssX, cssY);
    return { x: (p.x - cx) / rigScale, y: (p.y - platformTop()) / rigScale };
  };
  /** near enough to the toy that it should notice: a box around the figure */
  const onTheBot = (r: { x: number; y: number }) =>
    Math.abs(r.x) < RIG_HEIGHT * 0.5 && r.y > -RIG_HEIGHT - 60 && r.y < 60;

  const onMove = (e: PointerEvent) => {
    const { x, y } = local(e);
    const s = hitSocket(x, y, null, hitR);
    if (s !== hover) {
      hover = s;
      canvas.style.cursor = s ? "pointer" : "default";
      opts.onSocketHover?.(s);
    }
    // the eyes follow the pointer wherever it is on the canvas; the perk up
    // and the lean in are for when it is actually on him
    const r = toRig(x, y);
    rig.lookAt(r);
    rig.setNoticed(onTheBot(r));
  };
  const onDown = (e: PointerEvent) => {
    const { x, y } = local(e);
    const s = hitSocket(x, y, null, hitR);
    if (s) {
      if (s === "legL" || s === "legR") {
        wrenchSide = s === "legR" ? 1 : -1;
        placeCrew();
      }
      opts.onSocketTap?.(s);
    }
    // a touch is the only pointer a phone has, so a tap has to do the noticing
    const r = toRig(x, y);
    rig.lookAt(r);
    rig.setNoticed(onTheBot(r));
  };
  const onLeave = () => {
    if (hover) {
      hover = null;
      opts.onSocketHover?.(null);
    }
    rig.lookAt(null);
    rig.setNoticed(false);
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerleave", onLeave);

  return {
    stage,
    rig,
    simW,
    simH,
    render,
    resize(cssW, cssH, dpr) {
      stage.resize(cssW, cssH, dpr, simW, simH);
      scale = Math.min(cssW / simW, cssH / simH) || 1;
      offX = (cssW - simW * scale) / 2;
      offY = (cssH - simH * scale) / 2;
    },
    setRings(state) {
      for (const s of SOCKETS) ringState[s] = state[s];
      // WHAT THE BOT IS FEELING, off the one thing this screen knows: a bot
      // still missing parts reads flat, a finished one reads eager. No new
      // state, no new call for the client to remember to make.
      const empty = SOCKETS.filter((s) => !ringState[s].filled).length;
      rig.setMood(empty === 0 ? "eager" : empty >= 4 ? "sleepy" : "flat");
    },
    setArming(slot) {
      arming = slot;
    },
    setHover(s) {
      hover = s;
    },
    setName(text) {
      drawPlate(text);
      // the LEFT rail end: the wrencher kneels at the right corner and a
      // plate over him hid the cute (found on the first 1440 screenshot)
      plate.position.set(cx - (LIFT.platformW / 2 - 150) * liftScale, platformTop() + 30 * liftScale);
    },
    setWrenchTarget(socket) {
      wrenchSide = socket === "legR" ? 1 : -1;
      placeCrew();
    },
    open() {
      openAt = -2;
      riseK = 0;
      landed = false;
    },
    flashRing(socket) {
      ringFlash[socket] = 2;
      rig.flash(socket);
      // a part just went on: the bot bounces and looks at what he was given.
      // This is the moment ownership is made, so it is the one place on this
      // screen that gets a reaction the player did not have to hunt for.
      rig.poke("fit", socket);
    },
    hitSocket,
    socketCss(s) {
      const c = socketSim(s);
      return { x: c.x * scale + offX, y: c.y * scale + offY };
    },
    destroy() {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerleave", onLeave);
      stage.destroy();
    },
  };
}

export type { PartArt };
