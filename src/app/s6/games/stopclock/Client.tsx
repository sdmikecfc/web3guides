"use client";
/**
 * STOPCLOCK - the page client. Presentation only (ADR-0119: Pixi renders,
 * the sim rules). The one board in the arcade that is NOT dark: SUPERHOT's
 * white void, red crystalline enemies, black weapons, amber you. The scene
 * keeps page-side memory for the red-crystal shatters (allowed to use
 * Math.random: presentation never touches the sim or the tapes).
 *
 * ZOOMED OUT (2026-08-14 redesign): the sim's design space is 460x600 and
 * this page PINS it via worldSize + aspect, so the arena reads as an arena
 * regardless of the CSS box. RunShell's letterboxing does the rest; the
 * pointer maps because the box aspect equals the sim aspect.
 */

import { RunShell, type SceneHandle } from "../_shared/RunShell";
import { createPixiStage } from "../_shared/pixi";
// TYPE-ONLY (erased): real constructors come from stage.pixi (the SSR law).
import type { Container, Graphics, Sprite, Spritesheet, Text, Texture } from "pixi.js";
import {
  createStopclock,
  stepStopclock,
  stopclockDone,
  stopclockScore,
  TRANSITION_T,
  type StopclockState,
} from "./sim";

const DESIGN_W = 460;
const DESIGN_H = 600;

const C = {
  void: 0xeceae4,
  grid: 0xdcd9d0,
  barrier: 0xc9c5ba,
  barrierTop: 0xdad6cc,
  red: 0xd23226,
  redDeep: 0xa31d13,
  redHi: 0xe0473a,
  ink: 0x26231f,
  inkSoft: 0x8a857c,
  amber: 0xffb454,
  amberDeep: 0xc97a2b,
};

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  t: number;
}

async function buildScene(canvas: HTMLCanvasElement): Promise<SceneHandle<StopclockState>> {
  const stage = await createPixiStage(canvas, { background: C.void });
  const { Container, Graphics, Text, TextStyle } = stage.pixi;
  const W = stage.world;
  const hud = (size: number, fill: number, bold = false) =>
    new TextStyle({ fontFamily: "Segoe UI, system-ui, sans-serif", fontSize: size, fill, fontWeight: bold ? "700" : "400", letterSpacing: 1 });

  // STILL NO KEYART BACKDROP (2026-08-14, and it stands). The near-white void
  // IS the art in a SUPERHOT remake: red crystal machines and black bullet
  // trails only read at all against a blank bright field, and a keyart plate
  // behind it (tried at alpha .22) greyed the void and killed exactly the
  // contrast the game is built on. That reverted attempt is why the painted
  // pass below (2026-08-15, Mike: "I think its ready for its art") is drawn
  // the way it is: every sprite is TOP-DOWN to match this camera, the two
  // DRESSING plates (floor grain, cover slab) are pale and low-contrast and
  // ride under everything at low alpha, and the machines keep their saturated
  // red so the figure/ground read never moves. The older
  // /s6-art/games/stopclock/hero.png is still NOT wired in-arena: it was
  // rendered standing and front-on. It stays an intro/promo asset.
  //
  // TRY-IMAGE-ELSE-VECTOR (the S6 art law): every load below is optional. A
  // 404 leaves `null` and the vector body draws exactly as it shipped, which
  // is also what drawFallback paints on a no-WebGL canvas.
  const ART = "/s6-art/games/stopclock";
  /** WHICH WAY EACH RENDER ALREADY POINTS, in sim radians (atan2, y down).
   * A generator does not take direction instructions, so this is MEASURED off
   * the shipped cut: the player's pistol runs straight down the frame
   * (+PI/2), the sentry holds its gun down-right, the rusher's nose sits
   * bottom-left, the siege machine's mortar tube points up-right. Every
   * in-arena rotation is `aimAngle - FACE[kind]`, so re-cutting an asset in a
   * different pose is a one-number fix here and nothing else moves. */
  const FACE: Record<string, number> = {
    pistol: 0.56,
    rusher: 2.44,
    rocketeer: -1.15,
    player: Math.PI / 2,
  };
  const tex: Record<string, Texture | null> = {
    pistol: null,
    rusher: null,
    rocketeer: null,
    player: null,
    floor: null,
    cover: null,
  };
  for (const name of Object.keys(tex)) {
    stage.pixi.Assets.load(`${ART}/${name}.webp`)
      .then((t) => {
        if (t) tex[name] = t as Texture;
      })
      .catch(() => {});
  }

  /** KIT HEADING for the ANIMATED frames, separate from FACE above: FACE is
   * MEASURED off our own generated cuts, while the craftpix kit sheets carry
   * their own authored heading we have not seen yet. Defaulted to +PI/2
   * (figure drawn facing down-frame, like the player cut); when a sheet
   * lands pointing elsewhere this table is the one number to correct, and
   * the FACE numbers stay true for the static webp fallback. */
  const ATLAS_FACE: Record<string, number> = {
    pistol: Math.PI / 2,
    rusher: Math.PI / 2,
    rocketeer: Math.PI / 2,
  };
  /** The animated seam (same contract riot consumes): chars/<kind>.json is a
   * Pixi spritesheet atlas - frames `<anim>_<i>`, an `animations` map, a
   * sibling PNG. Fire-and-forget like every load above: until a sheet lands
   * (or forever, on 404) the entry stays null and the machine renders
   * EXACTLY as it ships today - static webp, else vector. The player is
   * deliberately absent from this table: player.webp is our own generated
   * art, not kit art, and its slot does not move. */
  const sheets: Record<string, Spritesheet | null> = {
    pistol: null,
    rusher: null,
    rocketeer: null,
  };
  for (const kind of Object.keys(sheets)) {
    stage.pixi.Assets.load(`${ART}/chars/${kind}.json`)
      .then((sh) => {
        if (!sh) return;
        const ss = sh as Spritesheet;
        // THE SNES-CRISP LINE (as riot): nearest-neighbor on the atlas
        // source - bilinear smear on pixel art reads as a bad upscale
        const t0 = Object.values(ss.textures)[0];
        if (t0) t0.source.style.scaleMode = "nearest";
        sheets[kind] = ss;
      })
      .catch(() => {});
  }
  /** Pick an animation frame off a landed sheet. `phase` is a frame COUNTER
   * for cyclic strips (floor(s.t / step)) and a 0..1 progress for one-shots.
   * Chain per the chef scene precedent: requested -> idle -> walk -> first
   * texture, so a kit shipped without a verb degrades to a stance, never a
   * crash or an invisible machine. Returns null only when the sheet has not
   * landed, which routes the machine to the static webp above (itself
   * guarded down to the vector body - the try-image-else-vector law). */
  const frameFor = (sheet: Spritesheet | null, anim: string, phase: number, cyclic: boolean): Texture | null => {
    if (!sheet) return null;
    const anims = sheet.animations as Record<string, Texture[]>;
    let frames = anims[anim];
    if ((!frames || frames.length === 0) && anim === "windup") {
      // a kit without a windup shows the attack STANCE (frame 0): a warm
      // rusher must still read "standing, harmless", never mid-swing
      const atk = anims.attack;
      if (atk && atk.length > 0) return atk[0];
    }
    if (!frames || frames.length === 0) frames = anims.idle;
    if (!frames || frames.length === 0) frames = anims.walk;
    if (!frames || frames.length === 0) return Object.values(sheet.textures)[0] ?? null;
    const n = frames.length;
    const i = cyclic ? ((Math.floor(phase) % n) + n) % n : Math.min(n - 1, Math.max(0, Math.floor(phase * n)));
    return frames[i] ?? frames[0];
  };

  const floorArtLayer = new Container(); // pale grain plate, under the grid
  const grid = new Graphics();
  const coverArtLayer = new Container();
  const barriers = new Graphics();
  const drops = new Graphics();
  /** THE STRAFE RAIL (2026-08-17): from the first repeat lap the shooters
   * slide along hand-authored lanes, and a machine that moves without a
   * visible track is a machine that steals shots. The rail is painted UNDER
   * the cast so the tell arrives before the shot is spent - you can see which
   * machines are the moving kind, how far they can go, and which way they are
   * going, and lead them. `sLen > 0` is the whole test. */
  const rails = new Graphics();
  const enemyArtLayer = new Container();
  const enemiesG = new Graphics();
  const bulletsG = new Graphics();
  const shardsG = new Graphics();
  const playerArtLayer = new Container();
  const playerG = new Graphics();
  const freezeFrame = new Graphics();
  W.addChild(
    floorArtLayer,
    grid,
    coverArtLayer,
    barriers,
    drops,
    rails,
    enemyArtLayer,
    enemiesG,
    bulletsG,
    shardsG,
    playerArtLayer,
    playerG,
    freezeFrame,
  );

  /** Sprite pools: the cast is authored but its live count moves every room,
   * so each layer keeps a growing pool and hides the tail. */
  const pool = (layer: Container) => {
    const sprites: Sprite[] = [];
    return {
      reset() {
        for (const sp of sprites) sp.visible = false;
      },
      take(t: Texture): Sprite {
        let sp = sprites.find((x) => !x.visible);
        if (!sp) {
          sp = new stage.pixi.Sprite(t);
          sp.anchor.set(0.5);
          sprites.push(sp);
          layer.addChild(sp);
        }
        sp.texture = t;
        sp.visible = true;
        sp.alpha = 1;
        sp.tint = 0xffffff;
        sp.rotation = 0;
        return sp;
      },
    };
  };
  const enemyPool = pool(enemyArtLayer);
  const coverPool = pool(coverArtLayer);
  let floorArt: Sprite | null = null;
  let playerArt: Sprite | null = null;

  const hudLayer = new Container();
  W.addChild(hudLayer);
  const timeChip = new Graphics();
  const timeText = new Text({ text: "", style: hud(10.5, 0xeceae4, true) });
  const ammoChip = new Graphics();
  const ammoText = new Text({ text: "RKT", style: hud(9.5, 0xeceae4, true) });
  const roomChip = new Graphics();
  const roomText = new Text({ text: "", style: hud(9.5, 0xeceae4, true) });
  const scoreT = new Text({ text: "", style: hud(12, C.ink, true) });
  const patience = new Text({ text: "THE WARDEN GROWS IMPATIENT", style: hud(10, C.red, true) });
  patience.anchor.set(0.5);
  /** THE PICKUP READ (2026-08-17): rides the amber burst below, so taking a
   * refill says what it did at the spot your eyes already are. */
  const pickupText = new Text({ text: "+1 RKT", style: hud(10, C.amberDeep, true) });
  pickupText.anchor.set(0.5);
  pickupText.visible = false;
  const transCard = new Text({ text: "", style: hud(30, C.ink, true) });
  transCard.anchor.set(0.5);
  const hint = new Text({ text: "HOLD: MOVE · TAP: SHOT · HOLD STILL: ROCKET · TOUCH: PUNCH", style: hud(7.5, C.inkSoft) });
  hudLayer.addChild(timeChip, timeText, ammoChip, ammoText, roomChip, roomText, scoreT, patience, pickupText, transCard, hint);

  const mem = {
    lastRoom: -1,
    lastSimW: 0,
    dead: [] as boolean[],
    shards: [] as Shard[],
    prevHits: 99,
    flashT: 0,
    /** last render-frame positions, ONLY for the atlas walk/idle split: the
     * sim has no walking flag and must not grow one for a cosmetic */
    lastX: [] as number[],
    lastY: [] as number[],
    /** THE PICKUP READ (2026-08-17, Mike: "the upgrades you pick up don't do
     * anything"). Measured headlessly first: the refill DOES land - sim.ts's
     * drops loop banks rockets 1 -> 2 the frame you step on one, and a full
     * launcher correctly leaves the drop on the floor. What was missing was
     * the READ: the only feedback was a 4.5px pip filling at the bottom edge
     * of the screen. Presentation-only answer, sim untouched: an amber burst
     * + "+1 RKT" at the drop the moment it is taken, and the RKT chip pops
     * the same frame. */
    prevRockets: -1,
    ammoPopT: 0,
    dropTaken: [] as boolean[],
    pickups: [] as { x: number; y: number; t: number }[],
  };

  const layoutStatics = (k: number, simW: number, simH: number) => {
    grid.clear();
    for (let x = 92; x < DESIGN_W; x += 92) grid.moveTo(x * k, 0).lineTo(x * k, simH).stroke({ width: 1, color: C.grid });
    for (let y = 100; y < DESIGN_H; y += 100) grid.moveTo(0, y * k).lineTo(simW, y * k).stroke({ width: 1, color: C.grid });
  };

  /** The floor grain: stretched to the arena, held PALE and low so the void
   * survives. This is the plate the 2026-08-14 keyart attempt failed at, so
   * it is deliberately alpha .3 over the same near-white fill rather than a
   * painted scene, and the vector grid still draws on top of it. */
  const layoutFloorArt = (simW: number, simH: number) => {
    if (!tex.floor) return;
    if (!floorArt) {
      floorArt = new stage.pixi.Sprite(tex.floor);
      floorArt.anchor.set(0);
      floorArt.alpha = 0.3;
      floorArtLayer.addChild(floorArt);
    }
    floorArt.width = simW;
    floorArt.height = simH;
  };

  const chip = (g: Graphics, t: Text, x: number, y: number, w: number, k: number) => {
    g.clear();
    g.roundRect(x, y, w, 22 * k, 11 * k).fill(C.ink);
    t.position.set(x + w / 2 - t.width / 2, y + 11 * k - t.height / 2);
  };

  return {
    resize(cssW, cssH, dpr, simW, simH) {
      stage.resize(cssW, cssH, dpr, simW, simH);
      if (mem.lastSimW !== simW) {
        mem.lastSimW = simW;
        layoutStatics(simW / DESIGN_W, simW, simH);
      }
    },
    destroy() {
      stage.destroy();
    },
    render(s, view) {
      const k = s.k;
      if (mem.lastRoom !== s.room) {
        mem.lastRoom = s.room;
        mem.dead = s.enemies.map((e) => e.dead);
        mem.shards = [];
        mem.lastX = [];
        mem.lastY = [];
        mem.dropTaken = [];
        mem.pickups = [];
      }

      // shatter on newly dead enemies (presentation randomness allowed)
      for (let i = 0; i < s.enemies.length; i++) {
        const e = s.enemies[i];
        if (e.dead && !mem.dead[i]) {
          mem.dead[i] = true;
          const n = e.kind === "rocketeer" ? 14 : 10;
          for (let j = 0; j < n; j++) {
            const a = Math.random() * Math.PI * 2;
            const sp = (30 + Math.random() * 90) * k;
            mem.shards.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              rot: Math.random() * Math.PI,
              vr: (Math.random() - 0.5) * 6,
              size: (4 + Math.random() * 7) * k,
              t: 34,
            });
          }
        }
      }
      if (s.hits < mem.prevHits) mem.flashT = 12;
      mem.prevHits = s.hits;
      if (mem.flashT > 0) mem.flashT--;

      // pickup detection: a drop whose `taken` flips is a refill that BANKED
      // (the sim never flips it on a full launcher). The room-clear sweep
      // flips them too - those pop the chip but skip the floor burst, since
      // the transition overlay owns that beat.
      for (let i = 0; i < s.drops.length; i++) {
        const d = s.drops[i];
        if (d.taken && !mem.dropTaken[i]) {
          mem.dropTaken[i] = true;
          if (s.phase === "room") mem.pickups.push({ x: d.x, y: d.y, t: 26 });
        }
      }
      if (mem.prevRockets >= 0 && s.rockets > mem.prevRockets) mem.ammoPopT = 22;
      mem.prevRockets = s.rockets;
      if (mem.ammoPopT > 0) mem.ammoPopT--;

      // barriers: painted slab if the dressing loaded, vector block if not.
      // The top lip stays VECTOR either way - it is the only depth cue that
      // tells a slab from a floor mark in a flat top-down camera.
      layoutFloorArt(s.W, s.H);
      barriers.clear();
      coverPool.reset();
      for (const b of s.barriers) {
        if (tex.cover) {
          const sp = coverPool.take(tex.cover);
          sp.anchor.set(0.5);
          sp.position.set(b.x + b.w / 2, b.y + b.h / 2);
          sp.width = b.w;
          sp.height = b.h;
        } else {
          barriers.roundRect(b.x, b.y, b.w, b.h, 5 * k).fill(C.barrier);
        }
        barriers.roundRect(b.x, b.y - 6 * k, b.w, 12 * k, 5 * k).fill(C.barrierTop);
      }

      // drops: rocket refills
      drops.clear();
      for (const d of s.drops) {
        if (d.taken) continue;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          drops.arc(d.x, d.y, 17 * k, a, a + Math.PI / 16).stroke({ width: 1.6, color: 0x3a3733, alpha: 0.5 });
        }
        // a little standing rocket: dark body, amber nose, two fins
        drops.roundRect(d.x - 3 * k, d.y - 5 * k, 6 * k, 11 * k, 2 * k).fill(0x3a3733);
        drops.poly([d.x - 3 * k, d.y - 5 * k, d.x + 3 * k, d.y - 5 * k, d.x, d.y - 10 * k]).fill(C.amberDeep);
        drops.rect(d.x - 5.5 * k, d.y + 3 * k, 2.5 * k, 4 * k).fill(0x3a3733);
        drops.rect(d.x + 3 * k, d.y + 3 * k, 2.5 * k, 4 * k).fill(0x3a3733);
      }
      // the pickup burst: expanding amber ring + rising "+1 RKT" where the
      // refill was taken (see mem.prevRockets above for why this exists)
      let pickAt: { x: number; y: number; a: number } | null = null;
      for (const p of mem.pickups) {
        p.t--;
        const pr = 1 - p.t / 26;
        const fade = p.t / 26;
        drops.circle(p.x, p.y, (14 + 30 * pr) * k).stroke({ width: 3 * k, color: C.amberDeep, alpha: 0.85 * fade });
        drops.circle(p.x, p.y, (6 + 14 * pr) * k).fill({ color: C.amber, alpha: 0.35 * fade });
        pickAt = { x: p.x, y: p.y - (16 + 18 * pr) * k, a: Math.min(1, p.t / 13) };
      }
      mem.pickups = mem.pickups.filter((p) => p.t > 0);
      if (pickAt) {
        pickupText.visible = true;
        pickupText.position.set(pickAt.x, pickAt.y);
        pickupText.alpha = pickAt.a;
      } else {
        pickupText.visible = false;
      }

      // THE STRAFE RAIL: the authored lane, drawn on the floor under the
      // machine that walks it. Three reads, in order of how urgently you need
      // them: the DASHED lane says "this one is the moving kind and this is
      // every pixel it can reach"; the SOLID half from the machine to the end
      // it is heading for says "it is going that way, lead it"; the ANCHOR
      // ticks say where it turns around. Nothing here is a sim input - it is
      // a straight read of the sim's own lane fields, so a rail can never
      // disagree with where the machine actually is.
      rails.clear();
      for (const e of s.enemies) {
        if (e.dead || e.sLen <= 0) continue;
        const ex = e.sx + e.sux * e.sLen;
        const ey = e.sy + e.suy * e.sLen;
        const nx = -e.suy;
        const ny = e.sux;
        const dash = 7 * k;
        const gap = 5 * k;
        for (let d = 0; d < e.sLen; d += dash + gap) {
          const d2 = Math.min(e.sLen, d + dash);
          rails
            .moveTo(e.sx + e.sux * d, e.sy + e.suy * d)
            .lineTo(e.sx + e.sux * d2, e.sy + e.suy * d2)
            .stroke({ width: 2 * k, color: C.redDeep, alpha: 0.26 });
        }
        for (const [ax, ay] of [
          [e.sx, e.sy],
          [ex, ey],
        ] as [number, number][]) {
          rails
            .moveTo(ax + nx * 5 * k, ay + ny * 5 * k)
            .lineTo(ax - nx * 5 * k, ay - ny * 5 * k)
            .stroke({ width: 2 * k, color: C.redDeep, alpha: 0.42 });
        }
        const hx = e.sdir > 0 ? ex : e.sx;
        const hy = e.sdir > 0 ? ey : e.sy;
        const hd = Math.hypot(hx - e.x, hy - e.y);
        rails.moveTo(e.x, e.y).lineTo(hx, hy).stroke({ width: 2.5 * k, color: C.red, alpha: 0.5 });
        if (hd > 3 * k) {
          const ux = (hx - e.x) / hd;
          const uy = (hy - e.y) / hd;
          rails
            .poly([
              hx + ux * 7 * k,
              hy + uy * 7 * k,
              hx - uy * 4.5 * k,
              hy + ux * 4.5 * k,
              hx + uy * 4.5 * k,
              hy - ux * 4.5 * k,
            ])
            .fill({ color: C.red, alpha: 0.55 });
        }
      }

      // enemies: red crystals; telegraph = white-hot muzzle ring.
      // WHERE THE ART GOES: the painted machine replaces the BODY only. Every
      // gameplay signal on top of it - the muzzle stub, the white-hot
      // telegraph ring, the wave arrival ring - stays procedural, because
      // those are the things the player reads to survive and they must not
      // depend on a render landing.
      enemiesG.clear();
      enemyPool.reset();
      const faceArt = (t: Texture, e: { x: number; y: number }, h: number, rot: number) => {
        const sp = enemyPool.take(t);
        const tw = t.width || 1;
        const th = t.height || 1;
        sp.height = h;
        sp.width = h * (tw / th);
        sp.rotation = rot;
        sp.position.set(e.x, e.y);
        return sp;
      };
      // VIEW-SIDE MOTION MEMORY for the atlas walk/idle split: "did it move
      // since the last RENDER frame" is a presentation question, so it lives
      // here, compared against mem and never written to the sim.
      const moved: boolean[] = [];
      for (let i = 0; i < s.enemies.length; i++) {
        const e = s.enemies[i];
        moved[i] = mem.lastX.length > i && (mem.lastX[i] !== e.x || mem.lastY[i] !== e.y);
        mem.lastX[i] = e.x;
        mem.lastY[i] = e.y;
      }
      for (let i = 0; i < s.enemies.length; i++) {
        const e = s.enemies[i];
        if (e.dead) continue;
        // WAVE ARRIVAL: a rusher that just walked in stands lit for a beat
        // before it charges. The closing ring is the promise the sim makes -
        // nothing touches you out of nowhere - so it is drawn first and big.
        if (e.warm > 0) {
          const grow = Math.max(0, Math.min(1, e.warm / 0.6));
          enemiesG.circle(e.x, e.y, (16 + 30 * grow) * k).stroke({ width: 2.5, color: C.red, alpha: 0.75 });
          enemiesG.circle(e.x, e.y, 15 * k).fill({ color: C.red, alpha: 0.14 });
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
            enemiesG.moveTo(e.x + Math.cos(a) * 20 * k, e.y + Math.sin(a) * 20 * k)
              .lineTo(e.x + Math.cos(a) * 27 * k, e.y + Math.sin(a) * 27 * k)
              .stroke({ width: 2, color: C.redDeep, alpha: 0.8 });
          }
        }
        if (e.kind === "rusher") {
          const r = 13 * k;
          const dx = s.px - e.x;
          const dy = s.py - e.y;
          const a = Math.atan2(dy, dx);
          const px1 = e.x + Math.cos(a) * r * 1.5;
          const py1 = e.y + Math.sin(a) * r * 1.5;
          const px2 = e.x + Math.cos(a + 2.5) * r;
          const py2 = e.y + Math.sin(a + 2.5) * r;
          const px3 = e.x + Math.cos(a - 2.5) * r;
          const py3 = e.y + Math.sin(a - 2.5) * r;
          // animFor, sim state + s.t ONLY (replay must not flicker): warm is
          // the sim's wave-arrival wind-up, the same field the arrival ring
          // above keys off, so the windup strip and the ring resolve on the
          // same beat. Cycles run on the SIM clock: a frozen clock freezes
          // the stride mid-step, which is the SUPERHOT promise, not a bug.
          const anim = e.warm > 0
            ? frameFor(sheets.rusher, "windup", 1 - Math.max(0, Math.min(1, e.warm / 0.6)), false)
            : moved[i]
              ? frameFor(sheets.rusher, "walk", Math.floor(s.t / 0.14), true)
              : frameFor(sheets.rusher, "idle", Math.floor(s.t / 0.5), true);
          // Atlas cells are CONTENT-TIGHT (ingest centered mode), so this
          // height is the literal body height on screen (Mike round 5:
          // smaller than the old chunky cutouts is right, 20px was not)
          if (anim) faceArt(anim, e, 40 * k, a - ATLAS_FACE.rusher);
          else if (tex.rusher) faceArt(tex.rusher, e, 34 * k, a - FACE.rusher);
          else enemiesG.poly([px1, py1, px2, py2, px3, py3]).fill(C.redHi).stroke({ width: 2, color: C.redDeep });
        } else if (e.kind === "rocketeer") {
          // the rocketeer: broad deep-red crystal with a fat shoulder tube
          const r = 17 * k;
          const aBody = Math.atan2(s.py - e.y, s.px - e.x);
          // attack while e.tele > 0: the EXACT condition the white-hot muzzle
          // ring below keys off. The divisor mirrors the sim's arm line
          // (tele = 0.35 + teleT for a rocketeer), so the strip's last frame
          // lands as the bomb exists - the anim confirms the ring, never
          // replaces it.
          const anim = e.tele > 0
            ? frameFor(sheets.rocketeer, "attack", 1 - Math.max(0, Math.min(1, e.tele / (0.35 + s.teleT))), false)
            : frameFor(sheets.rocketeer, "idle", Math.floor(s.t / 0.5), true);
          if (anim) {
            faceArt(anim, e, 56 * k, aBody - ATLAS_FACE.rocketeer);
          } else if (tex.rocketeer) {
            faceArt(tex.rocketeer, e, 46 * k, aBody - FACE.rocketeer);
          } else {
            enemiesG.poly([e.x, e.y - r * 1.3, e.x + r * 1.25, e.y - r * 0.2, e.x + r * 0.8, e.y + r, e.x - r * 0.8, e.y + r, e.x - r * 1.25, e.y - r * 0.2])
              .fill(C.redDeep)
              .stroke({ width: 2, color: 0x6f120b });
            enemiesG.poly([e.x - r * 0.35, e.y - r * 1.75, e.x + r * 0.35, e.y - r * 1.75, e.x + r * 0.55, e.y - r * 1.2, e.x - r * 0.55, e.y - r * 1.2]).fill(C.redDeep);
          }
          const a = aBody;
          const gx = e.x + Math.cos(a) * r * 1.9;
          const gy = e.y + Math.sin(a) * r * 1.9;
          enemiesG.moveTo(e.x + Math.cos(a) * r * 0.7, e.y + Math.sin(a) * r * 0.7).lineTo(gx, gy).stroke({ width: 7 * k, color: 0x3a3733, cap: "round" });
          if (e.tele > 0) {
            enemiesG.circle(gx, gy, 9 * k + e.tele * 26 * k).stroke({ width: 3, color: 0xffffff, alpha: 0.9 });
            enemiesG.circle(gx, gy, 5 * k).fill(0xffd9c4);
          }
        } else {
          // pistol bot
          const r = 13 * k;
          const aBody = Math.atan2(s.py - e.y, s.px - e.x);
          // same seam as the rocketeer: attack rides the e.tele > 0 window
          // the telegraph ring keys off (armed at 0.15 + teleT for a pistol
          // bot), idle breathes on the sim clock otherwise
          const anim = e.tele > 0
            ? frameFor(sheets.pistol, "attack", 1 - Math.max(0, Math.min(1, e.tele / (0.15 + s.teleT))), false)
            : frameFor(sheets.pistol, "idle", Math.floor(s.t / 0.5), true);
          if (anim) {
            faceArt(anim, e, 44 * k, aBody - ATLAS_FACE.pistol);
          } else if (tex.pistol) {
            faceArt(tex.pistol, e, 36 * k, aBody - FACE.pistol);
          } else {
            enemiesG.poly([e.x, e.y - r * 1.4, e.x + r * 1.2, e.y - r * 0.3, e.x + r * 0.75, e.y + r, e.x - r * 0.75, e.y + r, e.x - r * 1.2, e.y - r * 0.3])
              .fill(C.red)
              .stroke({ width: 2, color: C.redDeep });
            enemiesG.poly([e.x - r * 0.3, e.y - r * 1.85, e.x + r * 0.3, e.y - r * 1.85, e.x + r * 0.5, e.y - r * 1.3, e.x - r * 0.5, e.y - r * 1.3]).fill(C.red);
          }
          const a = aBody;
          const gx = e.x + Math.cos(a) * r * 1.8;
          const gy = e.y + Math.sin(a) * r * 1.8;
          enemiesG.moveTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r).lineTo(gx, gy).stroke({ width: 4.5 * k, color: 0x3a3733, cap: "round" });
          if (e.tele > 0) {
            enemiesG.circle(gx, gy, 7 * k + e.tele * 30 * k).stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
            enemiesG.circle(gx, gy, 4 * k).fill(0xfff3dd);
          }
        }
      }

      // projectiles: fast thin bullets, fat slow rockets
      bulletsG.clear();
      for (const b of s.bullets) {
        if (b.dead) continue;
        const vl = Math.hypot(b.vx, b.vy) || 1;
        const tx = -b.vx / vl;
        const ty = -b.vy / vl;
        if (b.mine) {
          if (b.rocket) {
            bulletsG.moveTo(b.x + tx * 34 * k, b.y + ty * 34 * k).lineTo(b.x, b.y).stroke({ width: 5 * k, color: C.amberDeep, alpha: 0.45 });
            bulletsG.circle(b.x, b.y, 5 * k).fill(0x26231f);
            bulletsG.circle(b.x + tx * 6 * k, b.y + ty * 6 * k, 2.6 * k).fill(C.amber);
          } else {
            bulletsG.moveTo(b.x + tx * 26 * k, b.y + ty * 26 * k).lineTo(b.x, b.y).stroke({ width: 3 * k, color: 0x3a3733, alpha: 0.55 });
            bulletsG.circle(b.x, b.y, 3.2 * k).fill(0x26231f);
          }
        } else if (b.rocket) {
          // THE ARCING BOMB, and this drawing is load-bearing. The renderer
          // has no height concept, so a projectile that sails over a wall
          // reads as a collision bug unless the arc is SHOWN. Three cues:
          // the MARK on the floor where it will land (drawn from launch, so
          // the dodge is knowable, not reactive), the SHADOW tracking the
          // sim's real collision point, and the bomb itself lifted off that
          // shadow along a parabola. The shadow is the true position; the
          // lifted body is the lie that makes the true position legible.
          const rem = b.arc ? Math.hypot(b.tx - b.x, b.ty - b.y) : 0;
          const p = b.arc ? Math.max(0, Math.min(1, 1 - rem / Math.max(1, b.arcLen))) : 0;
          const alt = b.arc ? 4 * Math.min(54 * k, b.arcLen * 0.22) * p * (1 - p) : 0;
          if (b.arc) {
            const pulse = 0.45 + 0.25 * Math.sin(s.wallF * 0.18);
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
              bulletsG.arc(b.tx, b.ty, 15 * k, a, a + Math.PI / 11).stroke({ width: 2 * k, color: C.redDeep, alpha: pulse });
            }
            bulletsG.circle(b.tx, b.ty, 3 * k + 9 * k * p).fill({ color: C.red, alpha: 0.16 + 0.3 * p });
            bulletsG.moveTo(b.tx - 8 * k, b.ty).lineTo(b.tx + 8 * k, b.ty).stroke({ width: 1.6 * k, color: C.redDeep, alpha: 0.6 });
            bulletsG.moveTo(b.tx, b.ty - 8 * k).lineTo(b.tx, b.ty + 8 * k).stroke({ width: 1.6 * k, color: C.redDeep, alpha: 0.6 });
            bulletsG.ellipse(b.x, b.y, (7 - 2 * (alt / (60 * k))) * k, (4 - 1.2 * (alt / (60 * k))) * k)
              .fill({ color: 0x26231f, alpha: 0.3 - 0.12 * (alt / (60 * k)) });
          }
          const by = b.y - alt;
          bulletsG.moveTo(b.x + tx * 44 * k, by + ty * 44 * k).lineTo(b.x, by).stroke({ width: 6.5 * k, color: C.amberDeep, alpha: 0.35 });
          bulletsG.circle(b.x, by, 7 * k).fill(C.redDeep).stroke({ width: 2, color: 0x6f120b });
          bulletsG.circle(b.x + tx * 9 * k, by + ty * 9 * k, 3 * k).fill(C.amber);
        } else {
          bulletsG.moveTo(b.x + tx * 78 * k, b.y + ty * 78 * k).lineTo(b.x, b.y).stroke({ width: 3.4 * k, color: C.red, alpha: 0.28 });
          bulletsG.moveTo(b.x + tx * 30 * k, b.y + ty * 30 * k).lineTo(b.x, b.y).stroke({ width: 3.4 * k, color: C.red, alpha: 0.6 });
          bulletsG.circle(b.x, b.y, 3.6 * k).fill(C.redDeep);
        }
      }

      // shards
      shardsG.clear();
      mem.shards = mem.shards.filter((sh) => sh.t > 0);
      for (const sh of mem.shards) {
        sh.t--;
        sh.x += sh.vx / 60;
        sh.y += sh.vy / 60;
        sh.vx *= 0.94;
        sh.vy *= 0.94;
        sh.rot += sh.vr / 60;
        const a = sh.t / 34;
        const c1 = Math.cos(sh.rot) * sh.size;
        const s1 = Math.sin(sh.rot) * sh.size;
        shardsG.poly([sh.x + c1, sh.y + s1, sh.x - s1 * 0.7, sh.y + c1 * 0.7, sh.x - c1 * 0.6, sh.y - s1]).fill({ color: C.redHi, alpha: a });
      }

      // player: amber hex + barrel toward the aim point
      playerG.clear();
      const aim = view.pointer;
      const aa = aim ? Math.atan2(aim.y - s.py, aim.x - s.px) : -Math.PI / 2;
      const R = 11 * k;
      const hex: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = aa + Math.PI / 6 + (Math.PI * 2 * i) / 6;
        hex.push(s.px + Math.cos(a) * R, s.py + Math.sin(a) * R);
      }
      const flash = s.iframes > 0 && Math.floor(s.wallF / 3) % 2 === 0;
      if (tex.player) {
        if (!playerArt) {
          playerArt = new stage.pixi.Sprite(tex.player);
          playerArt.anchor.set(0.5);
          playerArtLayer.addChild(playerArt);
        }
        const th = tex.player.height || 1;
        // SIZED TO THE HITBOX, not to taste: PLAYER_R is 11, so the painted
        // rig is held near 22 wide. A figure drawn bigger than the body that
        // bullets actually test against is a lie in a game about dodging.
        playerArt.height = 30 * k;
        playerArt.width = 30 * k * ((tex.player.width || 1) / th);
        playerArt.rotation = aa - FACE.player;
        playerArt.position.set(s.px, s.py);
        // the iframe blink: alpha rather than a white tint, because a painted
        // rig tinted white vanishes into the void it is standing on
        playerArt.alpha = flash ? 0.5 : 1;
        // the aim stub stays vector on top of the rig: it is where the shot
        // comes from, and a painted arm cannot promise that
        playerG.moveTo(s.px + Math.cos(aa) * R, s.py + Math.sin(aa) * R)
          .lineTo(s.px + Math.cos(aa) * (R + 12 * k), s.py + Math.sin(aa) * (R + 12 * k))
          .stroke({ width: 4 * k, color: C.amberDeep, cap: "round" });
      } else {
        playerG.poly(hex).fill(flash ? 0xffffff : C.amber).stroke({ width: 2, color: C.amberDeep });
        playerG.moveTo(s.px + Math.cos(aa) * R, s.py + Math.sin(aa) * R)
          .lineTo(s.px + Math.cos(aa) * (R + 12 * k), s.py + Math.sin(aa) * (R + 12 * k))
          .stroke({ width: 5 * k, color: C.amberDeep, cap: "round" });
        playerG.circle(s.px, s.py, 3.6 * k).fill(0x4a3312);
      }
      // THE PUNCH RING: whenever the launcher is empty, a pulsing dashed ring
      // shows the arm's-reach radius - the zero-resource verb made legible
      if (s.rockets === 0 && s.phase === "room") {
        const pr = 24 * k + 1.5 * k * Math.sin(s.wallF * 0.09);
        const pulse = 0.3 + 0.2 * Math.sin(s.wallF * 0.12);
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          playerG.arc(s.px, s.py, pr, a, a + Math.PI / 14).stroke({ width: 2 * k, color: 0x3a3733, alpha: pulse });
        }
      }

      // freeze framing: dark corners when time crawls, hit flash overlay,
      // and the room-clear beat card during a transition
      freezeFrame.clear();
      const frozen = s.timeScale < 0.5;
      if (frozen) {
        const L = 26 * k;
        freezeFrame.poly([0, 0, L, 0, 0, L]).fill({ color: 0x04060a, alpha: 0.9 });
        freezeFrame.poly([s.W, 0, s.W - L, 0, s.W, L]).fill({ color: 0x04060a, alpha: 0.9 });
        freezeFrame.poly([0, s.H, L, s.H, 0, s.H - L]).fill({ color: 0x04060a, alpha: 0.9 });
        freezeFrame.poly([s.W, s.H, s.W - L, s.H, s.W, s.H - L]).fill({ color: 0x04060a, alpha: 0.9 });
      }
      if (mem.flashT > 0) {
        freezeFrame.rect(0, 0, s.W, s.H).fill({ color: C.red, alpha: (mem.flashT / 12) * 0.18 });
      }
      if (s.phase === "transition") {
        // the beat runs on the WALL clock in the sim, so this card is a
        // steady ~1.4s: first half "ROOM CLEARED", second half the next room
        freezeFrame.rect(0, 0, s.W, s.H).fill({ color: C.void, alpha: 0.55 });
        const gone = TRANSITION_T - s.transT;
        transCard.visible = true;
        transCard.text = gone < TRANSITION_T * 0.5 ? "ROOM CLEARED" : `ROOM ${s.room + 2}`;
        transCard.position.set(s.W / 2, s.H * 0.42);
        transCard.alpha = 1;
      } else {
        transCard.visible = false;
      }

      // HUD: state words + a fill bar, never a percentage
      timeText.text = frozen ? "TIME FROZEN" : "TIME FLOWING";
      const tw = 128 * k;
      const tx0 = s.W / 2 - tw / 2;
      timeChip.clear();
      timeChip.roundRect(tx0, 12 * k, tw, 26 * k, 13 * k).fill(frozen ? C.ink : C.redDeep);
      timeChip.roundRect(tx0 + 12 * k, 31 * k, tw - 24 * k, 2.6 * k, 1.3 * k).fill({ color: 0xffffff, alpha: 0.25 });
      timeChip.roundRect(tx0 + 12 * k, 31 * k, (tw - 24 * k) * Math.max(0, Math.min(1, s.timeScale)), 2.6 * k, 1.3 * k).fill(C.amber);
      timeText.position.set(s.W / 2 - timeText.width / 2, 12 * k + 9 * k - timeText.height / 2);
      // rockets: label + capacity pips; the chip POPS the frame a refill
      // banks (amber wash + outline swell + the new pip drawn fat), so the
      // counter answers the pickup instead of whispering it
      const pop = mem.ammoPopT > 0 ? mem.ammoPopT / 22 : 0;
      const aw = (44 + s.rocketCap * 15) * k;
      ammoChip.clear();
      ammoChip.roundRect(14 * k, s.H - 36 * k, aw, 24 * k, 12 * k).fill(C.ink);
      if (pop > 0) {
        ammoChip.roundRect(14 * k, s.H - 36 * k, aw, 24 * k, 12 * k).fill({ color: C.amber, alpha: 0.4 * pop });
        ammoChip
          .roundRect(14 * k - 3 * k * pop, s.H - 36 * k - 3 * k * pop, aw + 6 * k * pop, 24 * k + 6 * k * pop, 12 * k + 3 * k * pop)
          .stroke({ width: 2.5 * k, color: C.amberDeep, alpha: 0.9 * pop });
      }
      ammoText.position.set(22 * k, s.H - 36 * k + 12 * k - ammoText.height / 2);
      for (let i = 0; i < s.rocketCap; i++) {
        const cx0 = 14 * k + 44 * k + i * 15 * k;
        const cy0 = s.H - 24 * k;
        const grow = pop > 0 && i === s.rockets - 1 ? 1 + 0.9 * pop : 1;
        if (i < s.rockets) ammoChip.circle(cx0, cy0, 4.5 * k * grow).fill(C.amber);
        else ammoChip.circle(cx0, cy0, 4.5 * k).stroke({ width: 1.5, color: 0x8a857c });
      }
      roomText.text = `ROOM ${s.room + 1}`;
      chip(roomChip, roomText, s.W - 102 * k, s.H - 35 * k, 88 * k, k);
      scoreT.text = `${stopclockScore(s)}`;
      scoreT.position.set(s.W - 14 * k - scoreT.width, 14 * k);
      patience.visible = s.idleF > s.patienceF * 0.75;
      patience.position.set(s.W / 2, 52 * k);
      if (patience.visible) patience.alpha = 0.6 + 0.4 * Math.sin(s.wallF * 0.2);
      hint.position.set(s.W / 2 - hint.width / 2, s.H - 12 * k);
      hint.alpha = s.t < 6 ? 1 : Math.max(0, 1 - (s.t - 6) * 0.3);

      stage.renderFrame();
    },
  };
}

const scene = (canvas: HTMLCanvasElement) => buildScene(canvas);

/** No-WebGL fallback: flat 2d, fully playable. */
function drawFallback(ctx: CanvasRenderingContext2D, s: StopclockState) {
  const k = s.k;
  ctx.fillStyle = "#eceae4";
  ctx.fillRect(0, 0, s.W, s.H);
  ctx.fillStyle = "#c9c5ba";
  for (const b of s.barriers) ctx.fillRect(b.x, b.y, b.w, b.h);
  // the strafe rail survives the no-WebGL path too: knowing which machines
  // move, and how far, is a fairness promise rather than a flourish
  for (const e of s.enemies) {
    if (e.dead || e.sLen <= 0) continue;
    ctx.strokeStyle = "#a31d13";
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.sx, e.sy);
    ctx.lineTo(e.sx + e.sux * e.sLen, e.sy + e.suy * e.sLen);
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.sdir > 0 ? e.sx + e.sux * e.sLen : e.sx, e.sdir > 0 ? e.sy + e.suy * e.sLen : e.sy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const e of s.enemies) {
    if (e.dead) continue;
    const r = (e.kind === "rocketeer" ? 16 : 12) * k;
    if (e.warm > 0) {
      // the wave arrival ring survives the no-WebGL path too: the fairness
      // promise is not a flourish
      ctx.strokeStyle = "#d23226";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 18 * k * Math.max(0, Math.min(1, e.warm / 0.6)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = e.kind === "rocketeer" ? "#a31d13" : "#d23226";
    ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
  }
  for (const b of s.bullets) {
    if (b.dead) continue;
    if (b.arc) {
      // the impact mark: without it a bomb that ignores walls is a bug
      ctx.strokeStyle = "#a31d13";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.tx, b.ty, 14 * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = b.mine ? "#26231f" : "#a31d13";
    const r = (b.rocket ? 6 : 3) * k;
    ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
  }
  ctx.fillStyle = "#ffb454";
  ctx.beginPath();
  ctx.arc(s.px, s.py, 11 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#26231f";
  ctx.font = `${11 * k}px system-ui`;
  const words = s.phase === "transition" ? "ROOM CLEARED" : s.timeScale < 0.5 ? "TIME FROZEN" : "TIME FLOWING";
  ctx.fillText(`${words}  RKT ${s.rockets}/${s.rocketCap}  ROOM ${s.room + 1}  ${stopclockScore(s)}`, 12 * k, 20 * k);
}

export default function StopclockClient() {
  return (
    <RunShell<StopclockState>
      game="stopclock"
      title="STOPCLOCK"
      accent="#d23226"
      aspect={DESIGN_W / DESIGN_H}
      worldSize={() => ({ w: DESIGN_W, h: DESIGN_H })}
      createSim={(w, h, seed, reduced, stats) => createStopclock(w, h, seed, false, stats)}
      step={(s, dt, input) => stepStopclock(s, dt, input)}
      draw={(ctx, s) => drawFallback(ctx, s)}
      scene={scene}
      done={stopclockDone}
      score={stopclockScore}
      resultHeadline={(s) => (s.phase === "timeout" ? "TIME FINALLY WON" : `SHOT IN ROOM ${s.room + 1}`)}
      resultSub={(s) => `${s.kills} kills · ${s.shotsFired} shots · ${s.rocketsFired} rockets · ${s.t.toFixed(1)}s inside`}
      shareBuild={(s, dayKey) => {
        const grid = `${"\u{1F7E5}".repeat(Math.min(12, s.kills))}\u{1F480}`;
        return {
          grid,
          payload: `STOPCLOCK ${dayKey} · ${stopclockScore(s)} pts · room ${s.room + 1}\n${grid}\nlaunchwars.xyz/s6/games/stopclock`,
        };
      }}
      intro={
        <div>
          <p style={{ margin: "0 0 8px" }}>
            Time moves only when you do. Read the room while it hangs frozen; commit when you are sure.
          </p>
          <p style={{ margin: 0, opacity: 0.85 }}>
            HOLD to move: time flows. TAP to fire: shots are unlimited, but every one costs a slice of time and their
            bullets creep closer. HOLD STILL to fire a ROCKET: double damage with a splash that can scrap two machines;
            rocketeers drop refills. Pistol bots snap fast bullets that cover stops. Rocketeers lob slow bombs OVER
            cover onto the exact spot you are standing on, so a wall is no answer to them: watch for the mark on the
            floor and be somewhere else. Rushers charge, and more of them walk in the longer you take, so no corner
            stays safe. An empty launcher still has the punch: touch a shooter to scrap it. The rooms never end; every
            lap the machines fire faster, bring another rocketeer, and once the rooms start repeating the shooters stop
            standing still: each one sidesteps along the marked track under it, so lead them. Do not think too long: the
            Warden&apos;s patience runs out.
          </p>
        </div>
      }
      strings={{
        scoreUnit: "",
        startIdle: "STOP THE CLOCK",
        keyboardHint: "Keyboard works too: WASD or arrows to move, tap Space to shoot, hold Space for a rocket.",
      }}
    />
  );
}
