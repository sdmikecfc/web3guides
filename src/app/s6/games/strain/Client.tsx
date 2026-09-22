"use client";
/**
 * STRAIN - the page client. Presentation only (ADR-0119: Pixi renders, the
 * sim rules); the scene reads state every painted frame and keeps a tiny
 * page-side memory for pops, shakes and the escape banner. Layout mirrors
 * the approved mockup: circuit floor, amber wobbling blob with a glowing
 * nucleus, prey bots by tier, the red hunter with its dashed aggro ring, the
 * tier-locked door in the wall.
 *
 * ROUND 6 (2026-08-16) ADDED FIVE RULES AND THEREFORE FIVE TELLS. The law is
 * that no gameplay signal may be invisible, so each new sim rule landed here
 * in the same pass:
 *   FEED CHANNEL  -> a progress arc around the blob while it is anchored.
 *   FEED NOISE    -> a ripple drawn at the literal earshot radius, so you can
 *                    see which machines are about to come looking.
 *   TOO BIG       -> a hard red flash and a shake on the bounce, because
 *                    "nothing happened" must never be what a contact looks like.
 *   SEARCH MEMORY -> a marker on every searcher's LAST KNOWN position, tied to
 *                    the machine walking back to it.
 *   LOCKDOWN/PURGE-> the hatch reads JAMMED, the frame breathes red whenever
 *                    the floor is ARMED (every machine bites at any tier), and
 *                    the purge is a real gauge next to the growth bar. The
 *                    cones themselves grow because the sim rewrites visionR,
 *                    so what you see IS what can see you.
 * Every aware/uneatable read imports botAware() from the sim rather than
 * re-deriving the meter test: the rim has to be right about search and pinning
 * or it lies about exactly the states the rebuild added.
 *
 * ROUND 7 (2026-08-17) ADDED TWO AUTHORED ENTITY CLASSES AND ONE SPLIT RULE,
 * and the same law applied to all three:
 *   TURRETS       -> a red wedge drawn with the SAME raycast fan as every
 *                    other cone (so it dies on walls and crates exactly where
 *                    the sim says), an acquisition arc over the gun, a laser
 *                    onto the blob past a third of the lock, and a tracer on
 *                    the frames a round leaves the barrel. This is the only
 *                    thing in the game that damages the player from across the
 *                    room, so it gets four tells, not one, and every one of
 *                    them lands before the first shot does.
 *   LOW COVER     -> a flat translucent teal pad with a DASHED outline, a
 *                    step-over chevron and no depth cue of any kind, painted
 *                    under the blob and under every machine. A wall is opaque,
 *                    solid-stroked and inset-lit; nothing about a crate reads
 *                    the same, because the one thing a player must never
 *                    hesitate about is which of the two they can walk through.
 *   INSTANT MEALS -> the absence of a tell IS the tell. Chaff at or under your
 *                    tier no longer draws the feed arc or the noise ring,
 *                    because nothing is being channelled: it just pops.
 * The cone fan marches s.lows now, which quietly fixes every eye at once -
 * machines, cameras and turrets all stop drawing through cover.
 *
 * ROUND 8 (2026-08-17, Mike on the deployed build): the aim laser and the
 * shot tracer both used to draw a line to the blob off state that could
 * outlive the turret's actual sight (the uncapped lock meter), which was his
 * "weird line coming to you when you interact with something" - a red laser
 * tracking the blob through walls for measured seconds after a feed latch.
 * Both render paths now gate the laser on the sim's published `sees`, and the
 * fired round is a real PROJECTILE (s.shots) drawn as a tracer in flight in
 * both paths: what you sidestep is exactly what is drawn. The muzzle-to-blob
 * flash line is gone; the flash is a muzzle burst and the round is a body.
 */

import { RunShell, type SceneHandle } from "../_shared/RunShell";
import { createPixiStage } from "../_shared/pixi";
// TYPE-ONLY (erased): real constructors come from stage.pixi (the SSR law).
import type { Container, Graphics, Sprite as SpriteT, Spritesheet, Text, Texture, TilingSprite as TilingSpriteT } from "pixi.js";
import {
  createStrain,
  stepStrain,
  strainDone,
  strainScore,
  alarmHeat,
  botAware,
  feedFrac,
  floorArmed,
  purgeFrac,
  botR,
  turretLockFrac,
  turretThreat,
  BLOB_R_BY_TIER,
  CHAMBERS_PER_LAP,
  MAX_TIER,
  SEEN_ALARM_S,
  type StrainState,
} from "./sim";
import { TIER_THRESHOLDS } from "./chambers";

/** The pinned design space. chambers.ts authors every number in these units
 * and tape.ts replays in them; the shell is handed exactly this box. */
const DESIGN_W = 360;
const DESIGN_H = 480;

const C = {
  bg: 0x0a0e15,
  trace: 0x131c2a,
  wall: 0x22304a,
  amber: 0xffb454,
  amberHi: 0xffd894,
  nucleus: 0xfff3dd,
  red: 0xff5340,
  cyan: 0x58d6f2,
  steel: 0x33415a,
  steelHi: 0x54677e,
  text: 0xc9d4e3,
  dim: 0x6b7a8f,
};

async function buildScene(canvas: HTMLCanvasElement): Promise<SceneHandle<StrainState>> {
  const stage = await createPixiStage(canvas, { background: C.bg });
  const { Container, Graphics, Text, TextStyle } = stage.pixi;
  const W = stage.world;
  const hud = (size: number, fill: number, bold = false) =>
    new TextStyle({ fontFamily: "Segoe UI, system-ui, sans-serif", fontSize: size, fill, fontWeight: bold ? "700" : "400", letterSpacing: 1 });

  // Chamber keyart under the vector layer (try-image-else-vector: a failed
  // load keeps the plain chamber). Dimmed so gameplay stays readable.
  let bgArt: SpriteT | null = null;
  const bgDims = { w: 360, h: 480 };
  const fitBgArt = () => {
    if (!bgArt) return;
    const tw = bgArt.texture.width || 1;
    const th = bgArt.texture.height || 1;
    const sc = Math.max(bgDims.w / tw, bgDims.h / th);
    bgArt.scale.set(sc);
    bgArt.position.set((bgDims.w - tw * sc) / 2, (bgDims.h - th * sc) / 2);
  };
  // the painted server-vault deck (bg-vault.webp); the key card is the
  // fallback so a missing plate still lands something under the chamber.
  stage.pixi.Assets.load("/s6-art/games/strain/bg-vault.webp")
    .catch(() => stage.pixi.Assets.load("/s6-art/games/strain/card.webp"))
    .then((tex) => {
      if (!tex) return;
      bgArt = new stage.pixi.Sprite(tex);
      bgArt.alpha = 0.85;
      W.addChildAt(bgArt, 0);
      fitBgArt();
    })
    .catch(() => {});

  // ── THE CRAFTPIX TILE SEAM (2026-08-15). The kit pipeline will land small
  // seamless tiles at tiles/floor.webp and tiles/wall.webp. The floor tile
  // rides BETWEEN the vault plate and the vector traces, dimmed so the
  // authored palette still reads; the wall tile is stored here and consumed
  // by the once-per-chamber wall rebuild in render. Both loads 404 today into
  // silent catches, and every consumer is guarded, so with zero kit files on
  // disk the game renders exactly as before (try-image-else-vector, the S6
  // art law).
  let floorTile: TilingSpriteT | null = null;
  const fitFloorTile = () => {
    if (!floorTile) return;
    floorTile.width = bgDims.w;
    floorTile.height = bgDims.h;
  };
  stage.pixi.Assets.load("/s6-art/games/strain/tiles/floor.webp")
    .then((tex) => {
      if (!tex) return;
      // pixel tiles stay crisp: nearest-neighbor, never bilinear mush
      (tex as Texture).source.style.scaleMode = "nearest";
      floorTile = new stage.pixi.TilingSprite({ texture: tex as Texture, width: bgDims.w, height: bgDims.h });
      floorTile.alpha = 0.55;
      // above the plate, below the traces; bgArt always re-inserts itself at
      // index 0, so the order holds whichever load resolves first
      W.addChildAt(floorTile, W.getChildIndex(floor));
      fitFloorTile();
    })
    .catch(() => {});
  let wallTileTex: Texture | null = null;
  stage.pixi.Assets.load("/s6-art/games/strain/tiles/wall.webp")
    .then((tex) => {
      if (!tex) return;
      (tex as Texture).source.style.scaleMode = "nearest";
      wallTileTex = tex as Texture;
    })
    .catch(() => {});

  const floor = new Graphics();
  // THE PUZZLE, DRAWN: dark slabs with a lit cyan edge over the vault plate.
  // Vector only (no new art files); redrawn when the chamber changes.
  const wallsG = new Graphics();
  // kit wall tiling rides UNDER wallsG so the cyan stroke stays the
  // readability outline over whatever the tile paints; empty until (and
  // unless) tiles/wall.webp lands, so absence adds nothing
  const wallTiles = new Container();
  const door = new Graphics();
  // the painted blast hatch; the Graphics above stays the fallback AND keeps
  // the break-progress arc, which must never depend on art landing
  let doorSpr: SpriteT | null = null;
  const doorLabel = new Text({ text: "", style: hud(9, 0xff8a7a, true) });
  doorLabel.anchor.set(0.5);
  // THE STEALTH LAYER (2026-08-15). Sight is a cone now, so the cone is what
  // the screen has to sell: raycast wedges that visibly STOP at cover, the
  // fixed cameras that own the chokepoints, and a filling meter over anything
  // that has eyes on you. Vectors only, no new art.
  // ROUND 7. LOW COVER has to read as UNMISTAKABLY not-a-wall: a wall is an
  // opaque slab with a hard cyan edge and a drop shadow; a crate is a flat,
  // translucent teal pad with a DASHED outline, no shadow, and a step-over
  // chevron in the middle. It draws UNDER the cones (so a cone visibly dies on
  // it) and under the blob (so the blob visibly slides over it).
  const lowG = new Graphics();
  const cones = new Graphics();
  const botsLayer = new Container();
  const camsG = new Graphics();
  /** THE GUNS. Their own layer and their own colour language: everything else
   * on this floor is an alarm, this one is damage. */
  const turretsG = new Graphics();
  const rings = new Graphics(); // the warden's aura
  const pips = new Graphics(); // per-machine detection meters
  const blob = new Graphics();
  const fx = new Graphics();
  const vignette = new Graphics();
  W.addChild(floor, wallTiles, wallsG, lowG, door, doorLabel, cones, rings, botsLayer, camsG, turretsG, pips, blob, fx, vignette);
  stage.pixi.Assets.load("/s6-art/games/strain/door.webp")
    .then((tex) => {
      if (doorSpr) return; // the props atlas landed first and owns the slot
      doorSpr = new stage.pixi.Sprite(tex);
      doorSpr.anchor.set(0.5);
      doorSpr.visible = false;
      W.addChildAt(doorSpr, W.getChildIndex(door)); // under the progress arc
    })
    .catch(() => {});

  const hudLayer = new Container();
  W.addChild(hudLayer);
  const tierChip = new Text({ text: "", style: hud(10, C.amber, true) });
  const depthChip = new Text({ text: "", style: hud(11, C.text, true) });
  const scoreT = new Text({ text: "", style: hud(12, C.amber, true) });
  const growthG = new Graphics();
  const growthLabel = new Text({ text: "GROWTH", style: hud(8, C.dim) });
  const hpG = new Graphics();
  const banner = new Text({ text: "", style: hud(20, C.amber, true) });
  banner.anchor.set(0.5);
  /** The one plain line the stealth loop needs: are you seen, and is the
   * floor loud. Sits under the tier chip so it never fights the score. */
  const alertT = new Text({ text: "", style: hud(9, C.red, true) });
  const hint = new Text({ text: "WASD OR HOLD TO STEER · REACH THEM UNSEEN · CROSS BEHIND THE CRATES · TURRETS CANNOT BE EATEN", style: hud(7.5, C.dim) });
  /** ROUND 6: THE PURGE BAR. The chamber clock is a rule the player must
   * react to (cones grow, machines speed up, at full purge the floor ARMS and
   * the Warden is pinned), so it gets a real gauge, not a feeling. */
  const purgeG = new Graphics();
  const purgeLabel = new Text({ text: "PURGE", style: hud(8, C.dim) });
  hudLayer.addChild(tierChip, depthChip, scoreT, growthG, growthLabel, hpG, purgeG, purgeLabel, banner, alertT, hint);

  // per-bot display objects, rebuilt when the chamber changes
  let botG: Graphics[] = [];
  let botSpr: (SpriteT | null)[] = [];
  // per-bot VIEW memory for the kit anims: the sim has no walkDist, so the
  // renderer keeps last position (did it move since the last paint?) and a
  // sticky horizontal facing for the sprite flip. Presentation state only.
  let botMem: { x: number; y: number; dir: number }[] = [];
  const mem = {
    lastChamber: -1,
    lastSimW: 0,
    eaten: [] as boolean[],
    pops: [] as { x: number; y: number; t: number; big: boolean }[],
    prevHp: 99,
    shakeT: 0,
    bannerT: 0,
    prevDoorPts: 0,
    prevAlarm: false,
    alarmT: 0,
    // ROUND 6 beats: the bounce off something too big, the moment the floor
    // arms itself, and the meal that got torn out of the blob's mouth
    prevStartles: 0,
    startleT: 0,
    prevArmed: false,
    armedT: 0,
    prevBroken: 0,
    brokenT: 0,
    // ROUND 7: the round that landed. A turret hit arrives from off-body, so
    // it needs its own beat or it reads as damage from nowhere.
    prevTurretHits: 0,
    turretT: 0,
  };

  const layoutStatics = (k: number, simW: number, simH: number) => {
    floor.clear();
    // circuit traces
    floor.moveTo(20 * k, 60 * k).lineTo(120 * k, 60 * k).lineTo(120 * k, 140 * k).lineTo(220 * k, 140 * k)
      .moveTo(220 * k, 140 * k).lineTo(300 * k, 140 * k).lineTo(300 * k, 80 * k)
      .moveTo(60 * k, 200 * k).lineTo(60 * k, 300 * k).lineTo(160 * k, 300 * k)
      .moveTo(240 * k, 220 * k).lineTo(320 * k, 220 * k)
      .moveTo(40 * k, 380 * k).lineTo(140 * k, 380 * k).lineTo(140 * k, 420 * k)
      .moveTo(260 * k, 340 * k).lineTo(260 * k, 420 * k).lineTo(200 * k, 420 * k)
      .stroke({ width: 1.6, color: C.trace });
    for (const [x, y] of [[120, 60], [220, 140], [60, 200], [320, 220], [140, 420], [260, 340]] as const) {
      floor.circle(x * k, y * k, 3 * k).fill(0x182437);
    }
    // chamber walls
    floor.roundRect(6 * k, 6 * k, simW - 12 * k, simH - 12 * k, 10 * k).stroke({ width: 6, color: C.wall });
  };

  // PAINTED PREY (2026-08-14): one keyed render for the drone bots, one for
  // the hunter machine. The Graphics layer stays for the eatable ring + aggro
  // ring, so the tier read (can I eat this?) never depends on the art landing.
  const botTex: Record<string, unknown | null> = { bot: null, hunter: null, prey1: null, prey3: null, prey5: null };
  for (const key of Object.keys(botTex)) {
    stage.pixi.Assets.load(`/s6-art/games/strain/${key}.webp`)
      .then((tex) => {
        botTex[key] = tex;
      })
      .catch(() => {});
  }
  /** Prey art by TIER, so what you are about to swallow looks its size: the
   * microbot, the four-legged drone, the worker, then the armored sentry for
   * the two heavy tiers. Any missing render falls back down the chain and
   * finally to the vector bot, so a half-delivered art batch still plays. */
  const preyTexFor = (tier: number) =>
    (tier <= 1 ? botTex.prey1 : tier === 2 ? botTex.bot : tier === 3 ? botTex.prey3 : botTex.prey5) ??
    botTex.bot ??
    botTex.prey3 ??
    null;

  // ── THE CRAFTPIX CHAR SEAM (2026-08-15). The kit pipeline (a riot-atlas
  // derivative) will land Pixi spritesheets at chars/<char>.json: prey1/2/3
  // by tier band, the hunter machine, and props (the blast hatch strip).
  // Every load is fire-and-forget and every consumer guards per char, so
  // today - with zero kit files on disk - these all 404 into silent catches
  // and each bot keeps its static webp, which keeps the vector ring under IT:
  // the fallback chain never shortens (try-image-else-vector).
  type CharKey = "prey1" | "prey2" | "prey3" | "hunter" | "props";
  const charSheets: Record<CharKey, Spritesheet | null> = { prey1: null, prey2: null, prey3: null, hunter: null, props: null };
  for (const key of Object.keys(charSheets) as CharKey[]) {
    stage.pixi.Assets.load(`/s6-art/games/strain/chars/${key}.json`)
      .then((sh) => {
        if (!sh) return;
        const ss = sh as Spritesheet;
        // the SNES-crisp line (riot's): nearest-neighbor on the atlas source
        const t0 = Object.values(ss.textures)[0];
        if (t0) t0.source.style.scaleMode = "nearest";
        charSheets[key] = ss;
        // the hatch strip may arrive with no door.webp on disk: give the door
        // a sprite slot so the strip still animates (the webp landing first
        // keeps its slot; render swaps frames onto whichever sprite exists)
        if (key === "props" && !doorSpr) {
          const fr = (ss.animations as Record<string, Texture[]>)["door"];
          const first = fr?.[0] ?? t0;
          if (first) {
            doorSpr = new stage.pixi.Sprite(first);
            doorSpr.anchor.set(0.5);
            doorSpr.visible = false;
            W.addChildAt(doorSpr, W.getChildIndex(door)); // under the progress arc
          }
        }
      })
      .catch(() => {});
  }
  /** Which atlas char a machine wears: hunters (the warden included) own
   * `hunter`; prey splits by tier band so heavier machines read heavier. */
  const charFor = (b: { hunter: boolean; warden: boolean; tier: number }): CharKey =>
    b.hunter || b.warden ? "hunter" : b.tier <= 2 ? "prey1" : b.tier <= 4 ? "prey2" : "prey3";
  /** One frame off a char sheet, chef's textureFor fallback chain (scene.ts):
   * the asked strip -> its frame 0 -> idle_0 -> walk_0 -> the sheet's first
   * texture, so a half-shipped kit still dresses every bot. Frame indices
   * derive from s.t ONLY: two paints of one state must agree. */
  const charFrame = (sheet: Spritesheet, anim: string, period: number, t: number): Texture | null => {
    const frames = (sheet.animations as Record<string, Texture[]>)[anim];
    if (frames && frames.length > 0) return frames[Math.floor(t / period) % frames.length];
    return (
      sheet.textures[`${anim}_0`] ??
      sheet.textures["idle_0"] ??
      sheet.textures["walk_0"] ??
      Object.values(sheet.textures)[0] ??
      null
    );
  };

  /** Solid at pad 0: the same test the sim's line of sight uses. ROUND 7 FOLDS
   * IN LOW COVER, and it has to: the drawn cone IS the contract. A wedge
   * painted straight through a crate would teach the player that crates are
   * decoration, which is the exact opposite of the rule they carry. */
  const wallHit = (s: StrainState, x: number, y: number): boolean => {
    for (const w of s.walls) {
      if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
    }
    for (const w of s.lows) {
      if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
    }
    return false;
  };

  /**
   * A CONE THAT STOPS AT COVER. Nine rays, coarse-marched against the walls,
   * drawn as one wedge: a cone painted as a plain arc would promise sight
   * through a slab and teach the player the wrong lesson about every corner
   * in the building.
   */
  const coneFan = (
    g: Graphics,
    s: StrainState,
    x: number,
    y: number,
    fx2: number,
    fy2: number,
    r: number,
    cosHalf: number,
    color: number,
    alpha: number,
  ) => {
    if (r <= 0) return;
    const half = Math.acos(Math.max(-1, Math.min(1, cosHalf)));
    const base = Math.atan2(fy2, fx2);
    const RAYS = 9;
    const STEPS = 10;
    const pts: number[] = [x, y];
    for (let i = 0; i <= RAYS; i++) {
      const a = base - half + (2 * half * i) / RAYS;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let reach = r;
      for (let st = 1; st <= STEPS; st++) {
        const t = (r * st) / STEPS;
        if (wallHit(s, x + dx * t, y + dy * t)) {
          reach = t - r / STEPS;
          break;
        }
      }
      if (reach < 0) reach = 0;
      pts.push(x + dx * reach, y + dy * reach);
    }
    g.poly(pts).fill({ color, alpha });
  };

  /** The alert palette, one language for machines and cameras alike: calm
   * steel, filling amber, red once it has clocked you. */
  const alertTint = (seenS: number, awareS: number): { color: number; alpha: number } => {
    if (seenS >= awareS) return { color: 0xff5340, alpha: 0.2 };
    if (seenS > 0.05) return { color: 0xffb454, alpha: 0.16 };
    return { color: 0x58d6f2, alpha: 0.09 };
  };

  const rebuildBots = (s: StrainState) => {
    for (const g of botG) g.destroy();
    for (const sp of botSpr) sp?.destroy();
    botG = [];
    botSpr = [];
    botMem = [];
    botsLayer.removeChildren();
    mem.eaten = s.bots.map((b) => b.eaten);
    for (const b of s.bots) {
      // a bot earns a sprite slot if EITHER render is on disk: the keyed webp
      // or its kit atlas char (which can land without the webps). Neither
      // landed = the vector ring, today's exact picture.
      const sheet = charSheets[charFor(b)];
      const tex = (b.hunter ? botTex.hunter : preyTexFor(b.tier)) ?? (sheet ? Object.values(sheet.textures)[0] : null);
      let sp: SpriteT | null = null;
      if (tex) {
        sp = new stage.pixi.Sprite(tex as never);
        sp.anchor.set(0.5);
        botsLayer.addChild(sp);
      }
      botSpr.push(sp);
      // facing seeded off the sim's own look vector so frame one reads right
      botMem.push({ x: b.x, y: b.y, dir: b.fx < 0 ? -1 : 1 });
      const g = new Graphics();
      botG.push(g);
      botsLayer.addChild(g);
    }
  };

  return {
    resize(cssW, cssH, dpr, simW, simH) {
      stage.resize(cssW, cssH, dpr, simW, simH);
      if (mem.lastSimW !== simW) {
        mem.lastSimW = simW;
        bgDims.w = simW;
        bgDims.h = simH;
        fitBgArt();
        fitFloorTile(); // the kit floor tracks the same sim box as the plate
        layoutStatics(simW / 360, simW, simH);
      }
    },
    destroy() {
      stage.destroy();
    },
    render(s, view) {
      const k = s.k;
      if (mem.lastChamber !== s.chamber) {
        mem.lastChamber = s.chamber;
        rebuildBots(s);
        mem.bannerT = s.chamber >= CHAMBERS_PER_LAP ? 70 : 0;
        // the walls only move when the chamber does
        wallsG.clear();
        for (const old of wallTiles.removeChildren()) old.destroy();
        for (const w of s.walls) {
          if (wallTileTex) {
            // kit tile under the stroke: the opaque inner fills would bury
            // it, so with a tile landed only the cyan outline draws on top
            // (the outline is the readability contract, tile or no tile)
            const ts = new stage.pixi.TilingSprite({ texture: wallTileTex, width: w.w, height: w.h });
            ts.position.set(w.x, w.y);
            wallTiles.addChild(ts);
            wallsG.roundRect(w.x, w.y, w.w, w.h, 3 * k).stroke({ width: 2, color: C.cyan, alpha: 0.5 });
          } else {
            wallsG.roundRect(w.x, w.y, w.w, w.h, 3 * k).fill(0x0c1523).stroke({ width: 2, color: C.cyan, alpha: 0.5 });
            wallsG
              .roundRect(w.x + 3 * k, w.y + 3 * k, Math.max(1, w.w - 6 * k), Math.max(1, w.h - 6 * k), 2 * k)
              .fill({ color: 0x16233a, alpha: 0.95 });
          }
        }
        // ── LOW COVER, DRAWN AS THE OPPOSITE OF A WALL ──────────────────────
        // Three signals, all different from the slabs above: a FLAT teal pad
        // at low alpha (you can see the floor through it), a DASHED outline
        // (walls are solid-stroked), and a step-over chevron. No inner fill,
        // no edge highlight, nothing that reads as height. The blob and every
        // machine paint on top of it, which is the final proof on screen that
        // it is crossed rather than collided with.
        lowG.clear();
        for (const w of s.lows) {
          lowG.roundRect(w.x, w.y, w.w, w.h, 4 * k).fill({ color: 0x2f6f74, alpha: 0.34 });
          // dashed border, hand-stepped so it reads at any size
          const dash = 5 * k;
          for (let x = w.x; x < w.x + w.w; x += dash * 2) {
            const e = Math.min(x + dash, w.x + w.w);
            lowG.moveTo(x, w.y).lineTo(e, w.y).moveTo(x, w.y + w.h).lineTo(e, w.y + w.h);
          }
          for (let y = w.y; y < w.y + w.h; y += dash * 2) {
            const e = Math.min(y + dash, w.y + w.h);
            lowG.moveTo(w.x, y).lineTo(w.x, e).moveTo(w.x + w.w, y).lineTo(w.x + w.w, e);
          }
          lowG.stroke({ width: 1.8, color: 0x7fe3e8, alpha: 0.75 });
          // the "you can cross this" mark: a double chevron, like a low step
          const cx = w.x + w.w / 2;
          const cy = w.y + w.h / 2;
          const a = Math.min(w.w, w.h) * 0.22;
          lowG
            .moveTo(cx - a, cy + a * 0.5).lineTo(cx, cy - a * 0.35).lineTo(cx + a, cy + a * 0.5)
            .moveTo(cx - a, cy + a * 1.15).lineTo(cx, cy + a * 0.3).lineTo(cx + a, cy + a * 1.15)
            .stroke({ width: 1.6, color: 0xa9f0f4, alpha: 0.6 });
        }
      }

      // deltas
      for (let i = 0; i < s.bots.length; i++) {
        const b = s.bots[i];
        if (b.eaten && !mem.eaten[i]) {
          mem.eaten[i] = true;
          mem.pops.push({ x: b.x, y: b.y, t: 12, big: b.hunter });
        }
      }
      if (s.hp < mem.prevHp) mem.shakeT = 12;
      mem.prevHp = s.hp;
      // the moment the floor goes loud gets its own beat
      if (s.alarm && !mem.prevAlarm) mem.alarmT = 80;
      mem.prevAlarm = s.alarm;
      if (mem.alarmT > 0) mem.alarmT--;
      // ROUND 6 BEATS. Each one is a rule the player has to learn from the
      // screen alone: you bounced off something too big, the floor just armed
      // itself, something tore a meal out of your mouth.
      if (s.startles > mem.prevStartles) mem.startleT = 40;
      mem.prevStartles = s.startles;
      if (mem.startleT > 0) mem.startleT--;
      const armed = floorArmed(s);
      if (armed && !mem.prevArmed) mem.armedT = 90;
      mem.prevArmed = armed;
      if (mem.armedT > 0) mem.armedT--;
      if (s.feedsBroken > mem.prevBroken) mem.brokenT = 36;
      mem.prevBroken = s.feedsBroken;
      if (mem.brokenT > 0) mem.brokenT--;
      if (s.turretHits > mem.prevTurretHits) mem.turretT = 40;
      mem.prevTurretHits = s.turretHits;
      if (mem.turretT > 0) mem.turretT--;
      if (mem.startleT > 0 || mem.brokenT > 0 || mem.turretT > 0) mem.shakeT = Math.max(mem.shakeT, 8);
      if (s.doorPts > mem.prevDoorPts) {
        mem.prevDoorPts = s.doorPts;
        if (s.chamber === CHAMBERS_PER_LAP - 1) mem.bannerT = 110; // the escape moment
      }
      if (mem.shakeT > 0) mem.shakeT--;
      if (mem.bannerT > 0) mem.bannerT--;
      const shake = mem.shakeT > 0 ? (mem.shakeT % 2 === 0 ? 3 : -3) * k : 0;
      W.pivot.set(-shake, 0);

      // door
      door.clear();
      const locked = !s.doorBlown && s.tier < s.doorTier;
      // THE CLEAR BEAT: with fewer than three meals left the room is spent,
      // so the way out starts pulsing and an arrow points at it. Pure
      // presentation, read off sim state, mutating nothing.
      const preyLeft = s.bots.reduce((n, b) => n + (!b.eaten && !b.hunter ? 1 : 0), 0);
      const beat = preyLeft < 3;
      const pulse = beat ? 0.5 + 0.5 * Math.sin(s.t * 5) : 0;
      // THE HATCH STRIP (kit). With the props atlas landed, its `door` frames
      // own the plate: closed holds frame 0, the break channel (s.doorProgress
      // 0..1) sweeps the strip, blown pins the last frame - the same beat the
      // progress arc already tells, now painted. No props atlas = the static
      // webp = the vector hatch, unchanged (try-image-else-vector). Texture
      // swaps BEFORE the width check below so an atlas-only door still shows.
      {
        const dFrames = charSheets.props ? (charSheets.props.animations as Record<string, Texture[]>)["door"] : undefined;
        if (doorSpr && dFrames && dFrames.length > 0) {
          const n = dFrames.length;
          doorSpr.texture = s.doorBlown
            ? dFrames[n - 1]
            : s.doorProgress > 0
              ? dFrames[Math.min(n - 1, Math.floor(s.doorProgress * n))]
              : dFrames[0];
        }
      }
      if (doorSpr && doorSpr.texture.width > 0) {
        doorSpr.visible = true;
        doorSpr.position.set(s.doorX, s.doorY);
        doorSpr.scale.set((88 * k) / doorSpr.texture.height);
        // locked reads cold and dim, openable reads warm: the same two-state
        // language the vector hatch carried, now on the painted plate.
        doorSpr.tint = locked ? 0x7f93b4 : 0xffd9a0;
        // a thin ring keeps the state legible even at the smallest sizes
        door.circle(s.doorX, s.doorY, 34 * k).stroke({ width: 2, color: locked ? 0x3c516f : C.amber, alpha: 0.55 });
      } else {
        door.roundRect(s.doorX - 12 * k, s.doorY - 44 * k, 24 * k, 88 * k, 4 * k)
          .fill(0x26344e)
          .stroke({ width: 2, color: locked ? 0x3c516f : C.amber });
        door.moveTo(s.doorX - 6 * k, s.doorY - 24 * k).lineTo(s.doorX + 4 * k, s.doorY - 10 * k).lineTo(s.doorX - 3 * k, s.doorY)
          .moveTo(s.doorX + 3 * k, s.doorY + 10 * k).lineTo(s.doorX - 4 * k, s.doorY + 20 * k).lineTo(s.doorX + 4 * k, s.doorY + 30 * k)
          .stroke({ width: 2, color: 0x0d1523 });
      }
      if (beat) {
        door.circle(s.doorX, s.doorY, (36 + 8 * pulse) * k).stroke({ width: 3, color: C.amber, alpha: 0.3 + 0.45 * pulse });
      }
      if (s.doorProgress > 0) {
        door.arc(s.doorX, s.doorY, 30 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.doorProgress))
          .stroke({ width: 4, color: C.amber });
      }
      // A LOCKDOWN JAMS THE HATCH (x3 channel). The plate has to say so, or a
      // channel that suddenly crawls reads as a bug.
      doorLabel.text = s.alarm ? "JAMMED" : s.doorBlown ? "OPEN" : `T${s.doorTier}`;
      doorLabel.style.fill = s.alarm ? C.red : locked ? 0xff8a7a : C.amberHi;
      if (s.alarm) {
        door.circle(s.doorX, s.doorY, 40 * k).stroke({ width: 2, color: C.red, alpha: 0.35 + 0.3 * Math.sin(s.t * 7) });
      }
      // CLAMPED ON ALL FOUR EDGES. A door at [180,30] used to draw its label
      // at y -26, off the top of the frame; the same happened on every edge.
      {
        const m = 13 * k;
        const above = s.doorY - 56 * k;
        const ly = above < m ? s.doorY + 56 * k : above;
        doorLabel.position.set(
          Math.max(m + doorLabel.width / 2, Math.min(s.W - m - doorLabel.width / 2, s.doorX)),
          Math.max(m, Math.min(s.H - m, ly)),
        );
      }

      // ── the eyes: cones first (under everything), then the cameras ────────
      cones.clear();
      camsG.clear();
      pips.clear();
      for (const b of s.bots) {
        if (b.eaten) continue;
        const tint = alertTint(b.seenS, s.awareS);
        coneFan(cones, s, b.x, b.y, b.fx, b.fy, b.visionR, b.visionCos, tint.color, tint.alpha);
      }
      // ROUND 6: MEMORY MADE VISIBLE. A machine that lost you walks back to
      // where it last had you and sweeps it - so the screen shows that point,
      // tied to the machine walking at it. Without this the player cannot see
      // why a room stayed hostile after they broke the line.
      for (const b of s.bots) {
        if (b.eaten || b.searchF <= 0) continue;
        const pulse = 0.35 + 0.35 * Math.sin(s.t * 5 + b.lastX);
        pips.circle(b.lastX, b.lastY, 9 * k).stroke({ width: 1.6, color: 0xff8a5a, alpha: pulse });
        pips.moveTo(b.lastX - 4 * k, b.lastY).lineTo(b.lastX + 4 * k, b.lastY)
          .moveTo(b.lastX, b.lastY - 4 * k).lineTo(b.lastX, b.lastY + 4 * k)
          .stroke({ width: 1.4, color: 0xff8a5a, alpha: pulse });
      }
      for (const c of s.cams) {
        const tint = alertTint(c.seenS, s.awareS);
        coneFan(cones, s, c.x, c.y, c.fx, c.fy, c.r, c.visionCos, tint.color, tint.alpha);
        // mount plate and lens: it reads as bolted to the ceiling, and the
        // lens points where the cone points
        const lit = c.seenS >= s.awareS ? C.red : c.seenS > 0.05 ? C.amber : C.steelHi;
        camsG.roundRect(c.x - 6 * k, c.y - 6 * k, 12 * k, 12 * k, 3 * k).fill(0x1b2740).stroke({ width: 1.6, color: C.steelHi });
        camsG.circle(c.x + c.fx * 5 * k, c.y + c.fy * 5 * k, 3.2 * k).fill(lit);
        camsG.moveTo(c.x, c.y).lineTo(c.x + c.fx * 11 * k, c.y + c.fy * 11 * k).stroke({ width: 2, color: lit, alpha: 0.9 });
        if (c.seenS > 0.05) {
          const frac = Math.min(1, c.seenS / SEEN_ALARM_S);
          pips
            .arc(c.x, c.y - 13 * k, 5 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
            .stroke({ width: 2.4, color: frac > 0.66 ? C.red : C.amber });
        }
      }

      // ── THE TURRETS (round 7) ─────────────────────────────────────────────
      // THE STANDING LAW: nothing that damages the player may be invisible or
      // art-only. A turret therefore draws FOUR things, and each one maps to a
      // sim rule the player has to be able to learn from the screen alone:
      //   the WEDGE      - drawn with the same raycast fan as every other cone,
      //                    so it dies on walls AND crates exactly where the sim
      //                    says it does. Hot red, not the alarm palette: this
      //                    one is a gun, not a witness;
      //   the LOCK ARC   - the acquisition meter, filling. Nothing has ever
      //                    been shot without this having filled first;
      //   the AIM LINE   - once acquisition is past a third, a hard line joins
      //                    the muzzle to the blob. This is the tell you are
      //                    meant to react to, and it is impossible to miss;
      //   the TRACER     - the round itself, on the frames it goes off.
      turretsG.clear();
      for (const t of s.turrets) {
        const lock = turretLockFrac(s, t);
        const hot = lock > 0.05;
        coneFan(cones, s, t.x, t.y, t.fx, t.fy, t.r, t.visionCos, 0xff3b2a, hot ? 0.1 + 0.2 * lock : 0.09);
        // the mount: a bolted plate with a barrel along the facing, so the
        // direction it covers reads without the cone
        const bar = 13 * k;
        turretsG
          .moveTo(t.x, t.y)
          .lineTo(t.x + t.fx * bar, t.y + t.fy * bar)
          .stroke({ width: 4.5, color: hot ? C.red : 0x8a5a52 });
        turretsG.roundRect(t.x - 7 * k, t.y - 7 * k, 14 * k, 14 * k, 3 * k).fill(0x2a1a20).stroke({ width: 2, color: hot ? C.red : 0x9d6f66 });
        turretsG.circle(t.x, t.y, 3.4 * k).fill(hot ? C.red : 0x6d4a44);
        if (hot) {
          // the acquisition meter, over the gun that is filling it
          turretsG
            .arc(t.x, t.y - 15 * k, 5.5 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lock)
            .stroke({ width: 2.8, color: lock > 0.6 ? C.red : C.amber });
        }
        if (t.sees && lock > 0.33) {
          // THE TELL. A laser onto the blob, brightening as the shot closes.
          // GATED ON LIVE SIGHT (round 8): the laser used to draw off the
          // decaying meter alone, so it tracked the blob through walls for
          // seconds after the gun had lost it - Mike's "weird line coming to
          // you". The sim publishes `sees`; no tell outlives its sight.
          turretsG
            .moveTo(t.x + t.fx * bar, t.y + t.fy * bar)
            .lineTo(s.px, s.py)
            .stroke({ width: 1.6, color: C.red, alpha: 0.25 + 0.6 * lock });
          if (lock >= 1) {
            turretsG.circle(s.px, s.py, (14 + 5 * Math.sin(s.t * 22)) * k).stroke({ width: 2, color: C.red, alpha: 0.8 });
          }
        }
        if (t.flash > 0) {
          // the muzzle flash: the round itself is a body now, drawn below
          const a = t.flash / 10;
          turretsG.circle(t.x + t.fx * bar, t.y + t.fy * bar, 7 * k * a).fill({ color: 0xffd894, alpha: a });
        }
      }
      // ── THE ROUNDS IN FLIGHT (round 8) ────────────────────────────────────
      // Dodgeable means VISIBLE: each round is a bright tracer with a short
      // trail along its own velocity, the same body the sim flies - what you
      // sidestep is exactly what is drawn.
      for (const sh of s.shots) {
        turretsG
          .moveTo(sh.x - sh.vx * 0.05, sh.y - sh.vy * 0.05)
          .lineTo(sh.x, sh.y)
          .stroke({ width: 2.4, color: 0xffd894, alpha: 0.85 });
        turretsG.circle(sh.x, sh.y, 3.5 * k).fill(0xffe9c0);
      }

      // bots + the warden's aura
      rings.clear();
      for (let i = 0; i < s.bots.length; i++) {
        const b = s.bots[i];
        const g = botG[i];
        if (!g) continue;
        g.clear();
        const spr = botSpr[i] ?? null;
        if (b.eaten) {
          if (spr) spr.visible = false;
          continue;
        }
        // THE WARDEN IS BIGGER. Its silhouette has to read as the boss of the
        // floor from across the room, so it draws at 1.6x its tier radius
        // and wears the aura at full size.
        const r = botR(b.tier) * k * (b.warden ? 1.6 : 1);
        const eatable = b.tier <= s.tier;
        // AWARE = UNEATABLE (round 5): the sim's own aware test, alarm-pinned
        // hunters included, because eating is off the table for exactly this
        // set and the screen has to say so instantly.
        // IMPORTED, NOT REIMPLEMENTED (round 6): search memory and alarm
        // pinning both make a machine uneatable, and a rim that re-derived the
        // old meter test would lie about exactly the cases the rebuild added.
        const isAware = botAware(s, b);
        // THE KIT FRAME SWAP. When this bot's atlas char has landed, the
        // sprite wears a live frame each paint: ATTACK the moment it is aware
        // (the attack anim IS the aware/evade read - round 5, it dodges while
        // aware so aware beats moving), walk while it moved since the last
        // paint, idle otherwise. Movement is view memory (the sim has no
        // walkDist); every frame index derives from s.t alone. A missing
        // char = the static webp exactly as today. Death has NO strip on
        // purpose: the swallow pop owns that beat.
        const bm = botMem[i];
        let dressed = false;
        if (bm) {
          const dx = b.x - bm.x;
          const moving = Math.abs(dx) + Math.abs(b.y - bm.y) > 0.01;
          if (Math.abs(dx) > 0.01) bm.dir = dx < 0 ? -1 : 1; // sticky when still
          bm.x = b.x;
          bm.y = b.y;
          const sheet = charSheets[charFor(b)];
          if (spr && sheet) {
            const t = isAware
              ? charFrame(sheet, "attack", 0.22, s.t)
              : moving
                ? charFrame(sheet, "walk", 0.18, s.t)
                : charFrame(sheet, "idle", 0.5, s.t);
            if (t) {
              spr.texture = t;
              dressed = true;
            }
          }
        }
        if (spr && spr.texture.width > 0) {
          // painted machine: sized off the SAME tier radius the sim uses, so
          // what you see is what you can swallow. Round-5 graphics pass: art
          // draws bigger (2.6 -> 3.2 prey, 3.1 -> 3.7 hunters) but the tier
          // rings below stay on the sim radius - art overhangs, gameplay
          // geometry does not move. Eatable reads cool steel; every hunter
          // wears the Warden's red now (one Warden, every floor).
          spr.visible = true;
          spr.position.set(b.x, b.y);
          const sc = (r * (b.hunter ? 3.7 : 3.2)) / spr.texture.width;
          // kit frames are side-view pixel art: they read fine top-down with
          // a horizontal flip, and rotating them would fight the baked
          // perspective, so flip is ALL we do - and only when dressed, so the
          // static webps keep today's exact un-flipped scale call.
          if (dressed) spr.scale.set((bm?.dir ?? 1) * sc, sc);
          else spr.scale.set(sc);
          spr.tint = eatable ? 0x9fd8ff : b.hunter ? 0xff4030 : 0xffb0a4;
        }
        if (b.hunter) {
          // THE WARDEN IS PRESENT ON EVERY FLOOR (round 5): each chamber's
          // apex hunter is an avatar of the one Warden, so every one of them
          // breathes the red aura - scaled to its tier - and chamber 5's
          // real body wears it biggest and brightest.
          const halo = 0.55 + 0.45 * Math.sin(s.t * 2.4);
          const av = b.warden ? 1 : 0.68 + 0.045 * Math.min(MAX_TIER, b.tier);
          const dim = b.warden ? 1 : 0.8;
          rings.circle(b.x, b.y, r * 1.9 * av).stroke({ width: b.warden ? 3 : 2.5, color: 0xff3b2a, alpha: (0.18 + 0.3 * halo) * dim });
          rings.circle(b.x, b.y, r * 2.5 * av).stroke({ width: 2, color: 0xff3b2a, alpha: (0.08 + 0.18 * halo) * dim });
        }
        if (b.hunter) {
          // one Warden, every floor: every avatar draws in the Warden's red
          const col = eatable ? C.steelHi : 0xff3b2a;
          if (!spr) {
            g.poly([b.x, b.y - r * 1.4, b.x + r * 1.3, b.y - r * 0.4, b.x + r * 0.8, b.y + r * 1.2, b.x - r * 0.8, b.y + r * 1.2, b.x - r * 1.3, b.y - r * 0.4])
              .fill(eatable ? 0x2c3950 : b.warden ? 0x3a1418 : 0x2a1a22)
              .stroke({ width: b.warden ? 3.5 : 2.5, color: col });
            g.roundRect(b.x - r * 0.6, b.y - r * 0.25, r * 1.2, r * 0.35, 3 * k).fill(col);
          } else {
            g.circle(b.x, b.y, r * 1.5).stroke({ width: b.warden ? 3 : 2, color: col, alpha: 0.7 });
          }
        } else {
          const col = eatable ? C.steelHi : 0x6f87a3;
          if (!spr) {
            g.roundRect(b.x - r, b.y - r * 0.9, r * 2, r * 1.8, 4 * k).fill(C.steel).stroke({ width: 1.8, color: col });
            g.roundRect(b.x - r * 0.5, b.y - r * 0.35, r, r * 0.4, 2 * k).fill(eatable ? 0x8fe9ff : C.cyan);
            g.circle(b.x - r * 0.5, b.y + r * 1.1, r * 0.3).fill(col);
            g.circle(b.x + r * 0.5, b.y + r * 1.1, r * 0.3).fill(col);
          } else {
            g.circle(b.x, b.y, r * 1.25).stroke({ width: 1.6, color: col, alpha: 0.55 });
          }
        }
        // THE AWARE RIM (round 5): a machine that has clocked you is
        // UNEATABLE, and that has to read instantly - a hard red ring just
        // outside the art, nothing else in the game wears it.
        if (isAware) {
          pips.circle(b.x, b.y, r * 1.75 + 2 * k).stroke({ width: 2.6, color: C.red, alpha: 0.85 + 0.15 * Math.sin(s.t * 8) });
        }
        // THE METER, OVER THE MACHINE THAT IS FILLING IT. Same arc grammar as
        // the door channel: nothing to read, just watch it close. An
        // alarm-pinned hunter shows at least the aware nub even after its
        // meter drains, because eating it is still off the table.
        if (b.seenS > 0.05 || isAware) {
          const frac = Math.min(1, Math.max(isAware ? 0.08 : 0, b.seenS / SEEN_ALARM_S));
          pips
            .arc(b.x, b.y - r - 9 * k, 5.5 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
            .stroke({ width: 2.6, color: frac > 0.66 ? C.red : isAware ? 0xff8a5a : C.amber });
        }
      }

      // THE BLOB, LAYERED (round 5 graphics pass): a darker outer membrane on
      // its own slower wobble, the amber body, a brighter nucleus, and three
      // internal highlights drifting on closed orbits. All vector, every
      // number a pure function of s.t, so two paints of one state agree.
      blob.clear();
      const R = BLOB_R_BY_TIER[Math.min(MAX_TIER, s.tier)] * k;
      // outer membrane: darker skin, 12 points, out of phase with the body
      const wobM = (i: number) => R * (1.22 + 0.09 * Math.sin(s.t * 2.1 + i * 2.3));
      const mpts: number[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        mpts.push(s.px + Math.cos(a) * wobM(i), s.py + Math.sin(a) * wobM(i));
      }
      blob.poly(mpts).fill({ color: 0x9a6420, alpha: 0.5 }).stroke({ width: 1.8, color: 0x7c4f16, alpha: 0.8 });
      const wob = (i: number) => R * (1 + 0.12 * Math.sin(s.t * 3.1 + i * 1.7));
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10;
        pts.push(s.px + Math.cos(a) * wob(i), s.py + Math.sin(a) * wob(i));
      }
      blob.poly(pts).fill({ color: C.amber, alpha: 0.85 }).stroke({ width: 2.5, color: C.amberHi });
      if (view.pointer?.down) {
        const dx = view.pointer.x - s.px;
        const dy = view.pointer.y - s.py;
        const d = Math.hypot(dx, dy) || 1;
        blob.moveTo(s.px, s.py)
          .lineTo(s.px + (dx / d) * (R + 16 * k), s.py + (dy / d) * (R + 16 * k))
          .stroke({ width: 6 * k, color: C.amber, alpha: 0.55 });
      }
      blob.circle(s.px, s.py, R * 0.5).fill(C.amber);
      blob.circle(s.px - R * 0.18, s.py - R * 0.18, R * 0.42).fill(C.amberHi);
      // drifting internal blobs: closed orbits at three speeds, sized down
      // the chain so the body reads busy without reading noisy
      for (let i = 0; i < 3; i++) {
        const oa = s.t * (0.7 + 0.25 * i) + i * 2.4;
        const orb = R * (0.34 + 0.16 * Math.sin(s.t * 1.3 + i * 1.9));
        blob
          .circle(s.px + Math.cos(oa) * orb, s.py + Math.sin(oa) * orb, R * (0.17 - 0.03 * i))
          .fill({ color: C.amberHi, alpha: 0.55 });
      }
      // the nucleus, brighter and haloed: the one thing that always reads
      blob.circle(s.px - R * 0.25, s.py - R * 0.25, R * 0.2).fill({ color: C.nucleus, alpha: 0.55 });
      blob.circle(s.px - R * 0.25, s.py - R * 0.25, R * 0.14).fill(C.nucleus);
      // PRESSED FLAT: the hide verb has to look like something, so the blob
      // wears a tight cyan ring while it is holding still and filling meters
      // at a third the rate.
      if (s.hiding) {
        blob.circle(s.px, s.py, R + 4 * k).stroke({ width: 2, color: C.cyan, alpha: 0.5 + 0.3 * Math.sin(s.t * 6) });
      }
      if (s.iframes > 0 && Math.floor(s.t * 10) % 2 === 0) {
        blob.circle(s.px, s.py, R + 6 * k).stroke({ width: 2, color: C.red, alpha: 0.7 });
      }
      // ── THE FEED (round 6) ────────────────────────────────────────────────
      // Two things the player must be able to read at a glance while anchored:
      // HOW LONG until the meal lands, and HOW FAR the noise is carrying. The
      // noise ring is the rule "eating is loud" drawn at its literal radius,
      // so a player can see which machines are about to come looking.
      const feed = feedFrac(s);
      if (s.feedIdx >= 0) {
        blob
          .arc(s.px, s.py, R + 9 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * feed)
          .stroke({ width: 4, color: C.amberHi });
        blob.circle(s.px, s.py, R + 9 * k).stroke({ width: 1.4, color: C.amber, alpha: 0.3 });
        const ripple = (s.t * 0.9) % 1;
        pips.circle(s.px, s.py, s.feedNoiseR * ripple).stroke({
          width: 2,
          color: C.amberHi,
          alpha: 0.34 * (1 - ripple),
        });
        pips.circle(s.px, s.py, s.feedNoiseR).stroke({ width: 1.2, color: C.amberHi, alpha: 0.18 });
      }
      // TOO BIG TO SWALLOW: the bounce gets its own hard red flash, because
      // "nothing happened" is the one thing a contact must never look like.
      if (mem.startleT > 0) {
        blob.circle(s.px, s.py, R + 12 * k).stroke({ width: 3, color: C.red, alpha: mem.startleT / 40 });
      }

      // pops
      fx.clear();
      mem.pops = mem.pops.filter((p) => p.t > 0);
      for (const p of mem.pops) {
        p.t--;
        const a = p.t / 12;
        fx.circle(p.x, p.y, (p.big ? 34 : 20) * k * (1 - a * 0.6)).stroke({ width: 3, color: p.big ? C.red : C.amberHi, alpha: a });
      }
      // the way out, pointed at: an arrowhead just off the blob's nose once
      // the room is nearly spent, so nobody wanders a cleared maze
      if (beat) {
        const ddx = s.doorX - s.px;
        const ddy = s.doorY - s.py;
        const dd = Math.hypot(ddx, ddy) || 1;
        if (dd > 56 * k) {
          const ux = ddx / dd;
          const uy = ddy / dd;
          const ax = s.px + ux * (R + 22 * k);
          const ay = s.py + uy * (R + 22 * k);
          fx.poly([
            ax + ux * 11 * k,
            ay + uy * 11 * k,
            ax - uy * 7 * k,
            ay + ux * 7 * k,
            ax + uy * 7 * k,
            ay - ux * 7 * k,
          ]).fill({ color: C.amberHi, alpha: 0.35 + 0.45 * pulse });
        }
      }
      vignette.clear();
      // THE RIM IS THE WARNING. It warms as the loudest meter in the room
      // fills, and once the floor is loud it pulses and stays: the alarm is
      // chamber-scoped, so the frame tells you which floor you are paying on.
      const heat = alarmHeat(s);
      const armedNow = floorArmed(s);
      if (armedNow) {
        // ARMED: the whole frame goes red and BREATHES FAST. This is the one
        // state where every machine on the floor bites whatever its tier, so
        // it cannot look like the old "somebody saw you" warmth.
        const p = 0.55 + 0.45 * Math.sin(s.t * (s.alarm ? 6 : 4));
        vignette.rect(0, 0, s.W, s.H).stroke({ width: 16 * k, color: C.red, alpha: 0.3 + 0.35 * p });
        vignette.rect(6 * k, 6 * k, s.W - 12 * k, s.H - 12 * k).stroke({ width: 3 * k, color: 0xff8a5a, alpha: 0.2 + 0.3 * p });
      } else if (heat > 0.05) {
        vignette
          .rect(0, 0, s.W, s.H)
          .stroke({ width: 12 * k, color: heat > 0.66 ? C.red : C.amber, alpha: 0.1 + 0.32 * heat });
      }
      if (mem.shakeT > 0) {
        vignette.rect(0, 0, s.W, s.H).stroke({ width: 14 * k, color: C.red, alpha: mem.shakeT / 22 });
      }

      // HUD
      tierChip.text = `TIER ${s.tier}`;
      tierChip.position.set(14 * k, 14 * k);
      depthChip.text =
        s.chamber < CHAMBERS_PER_LAP ? `CHAMBER ${s.chamber + 1}/${CHAMBERS_PER_LAP}` : `DEPTH ${s.chamber + 1}`;
      depthChip.position.set(s.W - 14 * k - depthChip.width, 14 * k);
      scoreT.text = `${strainScore(s)}`;
      scoreT.position.set(s.W - 14 * k - scoreT.width, 32 * k);
      const nextThresh = s.tier < MAX_TIER ? TIER_THRESHOLDS[s.tier + 1] : TIER_THRESHOLDS[MAX_TIER];
      const prevThresh = TIER_THRESHOLDS[s.tier] ?? 0;
      const frac = s.tier >= MAX_TIER ? 1 : Math.min(1, (s.growth - prevThresh) / Math.max(1, nextThresh - prevThresh));
      growthLabel.position.set(14 * k, s.H - 26 * k);
      growthG.clear();
      growthG.roundRect(70 * k, s.H - 28 * k, 200 * k, 9 * k, 4.5 * k).fill(0x101826).stroke({ width: 1, color: 0x223047 });
      growthG.roundRect(70 * k, s.H - 28 * k, Math.max(9 * k, 200 * k * frac), 9 * k, 4.5 * k).fill(C.amber);
      // ── THE PURGE GAUGE (round 6) ─────────────────────────────────────────
      // The chamber clock the player has to beat: it fills, the cones on the
      // floor visibly grow with it, and at FULL the floor arms and the Warden
      // is pinned. An invisible timer would be exactly the kind of rule this
      // rebuild exists to delete.
      const pf = purgeFrac(s);
      purgeLabel.position.set(14 * k, s.H - 40 * k);
      purgeLabel.style.fill = pf >= 1 ? C.red : pf > 0.5 ? C.amber : C.dim;
      purgeG.clear();
      purgeG.roundRect(70 * k, s.H - 42 * k, 200 * k, 9 * k, 4.5 * k).fill(0x101826).stroke({ width: 1, color: 0x223047 });
      if (pf > 0) {
        purgeG
          .roundRect(70 * k, s.H - 42 * k, Math.max(4 * k, 200 * k * pf), 9 * k, 4.5 * k)
          .fill(pf >= 1 ? C.red : pf > 0.5 ? C.amber : 0x7a6a4a);
      }
      if (pf >= 1) {
        purgeG
          .roundRect(70 * k, s.H - 42 * k, 200 * k, 9 * k, 4.5 * k)
          .stroke({ width: 1.6, color: C.red, alpha: 0.5 + 0.5 * Math.sin(s.t * 7) });
      }
      hpG.clear();
      for (let i = 0; i < s.hpMax; i++) {
        const px = 14 * k + i * 14 * k;
        if (i < s.hp) hpG.circle(px, 34 * k, 3.8 * k).fill(C.cyan);
        else hpG.circle(px, 34 * k, 3.8 * k).stroke({ width: 1.4, color: 0x1c3a48 });
      }
      hint.position.set(s.W / 2 - hint.width / 2, s.H - 14 * k);
      hint.alpha = s.t < 6 ? 1 : Math.max(0, 1 - (s.t - 6) * 0.25);
      // the stealth read, in plain words and no em-dashes
      // ONE WARDEN, EVERY FLOOR (round 5, supersedes round 4's hunter
      // wording): the fiction is a single Warden stalking you through its
      // avatars, so the alarm names THE WARDEN on every chamber. Chamber 5
      // is its real body and the win.
      // ONE PLAIN LINE, ROUND-6 ORDER OF DANGER: the mouth full and loud, the
      // floor armed, the lockdown, the meter, the hide. No em-dashes.
      const searching = s.bots.some((b) => !b.eaten && b.searchF > 0);
      // ROUND 7 PUTS THE GUN AT THE TOP OF THE ORDER OF DANGER. A lockdown is
      // a floor that might hurt you; an acquiring turret is a plate in under a
      // second, so it outranks everything except the round already leaving the
      // barrel. Two states, because "it has you" and "it is shooting" are
      // different decisions.
      const gun = turretThreat(s);
      alertT.text =
        gun >= 1
          ? "TURRET FIRING. SIDESTEP THE SHOT"
          : gun > 0.2
            ? "TURRET LOCKING ON YOU"
            : s.alarm
              ? "LOCKDOWN: EVERY MACHINE BITES NOW"
              : pf >= 1
                ? "PURGE: THE FLOOR IS ARMED. GET OUT"
                : s.feedIdx >= 0
                  ? "FEEDING. THIS IS LOUD"
                  : heat > 0.66
                    ? "SEEN. BREAK THE LINE"
                    : heat > 0.05
                      ? "EYES ON YOU"
                      : searching
                        ? "THEY ARE SEARCHING FOR YOU"
                        : s.hiding
                          ? "HOLDING STILL"
                          : "";
      alertT.style.fill =
        gun > 0.2 || s.alarm || pf >= 1 || heat > 0.66 ? C.red : s.feedIdx >= 0 || heat > 0.05 || searching ? C.amber : C.cyan;
      alertT.position.set(14 * k, 46 * k);
      alertT.alpha = armedNow ? 0.75 + 0.25 * Math.sin(s.t * 6) : 1;
      // THE PAYOFF BEAT owns the screen while it lasts; the depth banners
      // take the rest.
      if (s.phase === "won") {
        banner.visible = true;
        banner.text = "THE WARDEN IS EATEN";
        banner.style.fill = C.amberHi;
        banner.position.set(s.W / 2, s.H * 0.4);
        banner.alpha = Math.min(1, (96 - s.wonF) / 12, s.wonF / 14);
      } else if (mem.turretT > 0) {
        banner.visible = true;
        banner.text = "TURRET HIT";
        banner.style.fill = C.red;
        banner.position.set(s.W / 2, s.H * 0.4);
        banner.alpha = Math.min(1, mem.turretT / 16);
      } else if (mem.brokenT > 0) {
        banner.visible = true;
        banner.text = "MEAL TORN LOOSE";
        banner.style.fill = C.red;
        banner.position.set(s.W / 2, s.H * 0.4);
        banner.alpha = Math.min(1, mem.brokenT / 14);
      } else if (mem.armedT > 0 && !s.alarm) {
        banner.visible = true;
        banner.text = "THE PURGE HAS STARTED";
        banner.style.fill = C.red;
        banner.position.set(s.W / 2, s.H * 0.4);
        banner.alpha = Math.min(1, mem.armedT / 24);
      } else if (mem.alarmT > 0) {
        banner.visible = true;
        banner.text = "LOCKDOWN";
        banner.style.fill = C.red;
        banner.position.set(s.W / 2, s.H * 0.4);
        banner.alpha = Math.min(1, mem.alarmT / 24);
      } else if (mem.bannerT > 0) {
        banner.visible = true;
        banner.style.fill = C.amber;
        banner.text =
          s.chamber >= CHAMBERS_PER_LAP && s.chamber % CHAMBERS_PER_LAP === 0 && mem.bannerT > 40
            ? "DEEPER"
            : mem.bannerT > 40
              ? "QUARANTINE BROKEN"
              : "THE NETWORK HUNTS FASTER";
        banner.position.set(s.W / 2, s.H * 0.4);
        banner.alpha = Math.min(1, mem.bannerT / 30);
      } else {
        banner.visible = false;
      }

      stage.renderFrame();
    },
  };
}

const scene = (canvas: HTMLCanvasElement) => buildScene(canvas);

/** No-WebGL fallback: flat 2d vectors, fully playable. */
function drawFallback(ctx: CanvasRenderingContext2D, s: StrainState) {
  const k = s.k;
  ctx.fillStyle = "#0a0e15";
  ctx.fillRect(0, 0, s.W, s.H);
  ctx.strokeStyle = "#22304a";
  ctx.lineWidth = 4;
  ctx.strokeRect(4 * k, 4 * k, s.W - 8 * k, s.H - 8 * k);
  for (const w of s.walls) {
    ctx.fillStyle = "#16233a";
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "#58d6f2";
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }
  // LOW COVER, and it has to be unmistakably NOT a wall here too: flat teal
  // wash, DASHED outline (the walls above are solid), and the step-over
  // chevron. The fallback is a real way to play, so a rule that only reads in
  // WebGL is a rule half the players never learn.
  ctx.setLineDash([5 * k, 5 * k]);
  for (const w of s.lows) {
    ctx.fillStyle = "rgba(47,111,116,0.34)";
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "#7fe3e8";
    ctx.lineWidth = 1.8;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const a = Math.min(w.w, w.h) * 0.22;
    ctx.setLineDash([]);
    ctx.strokeStyle = "#a9f0f4";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - a, cy + a * 0.5);
    ctx.lineTo(cx, cy - a * 0.35);
    ctx.lineTo(cx + a, cy + a * 0.5);
    ctx.moveTo(cx - a, cy + a * 1.15);
    ctx.lineTo(cx, cy + a * 0.3);
    ctx.lineTo(cx + a, cy + a * 1.15);
    ctx.stroke();
    ctx.setLineDash([5 * k, 5 * k]);
  }
  ctx.setLineDash([]);
  // SIGHT LINES, EVEN HERE. The fallback is a real way to play the game, and
  // a stealth game you cannot see the cones in is a different game: two edge
  // rays per eye is enough to read which way a machine is looking.
  const coneLines = (x: number, y: number, fx2: number, fy2: number, r: number, cos: number, seenS: number) => {
    const half = Math.acos(Math.max(-1, Math.min(1, cos)));
    const base = Math.atan2(fy2, fx2);
    ctx.strokeStyle = seenS >= s.awareS ? "#ff5340" : seenS > 0.05 ? "#ffb454" : "#3c5f7a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const a of [base - half, base, base + half]) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.stroke();
  };
  for (const b of s.bots) {
    if (b.eaten) continue;
    coneLines(b.x, b.y, b.fx, b.fy, b.visionR, b.visionCos, b.seenS);
  }
  for (const c of s.cams) {
    coneLines(c.x, c.y, c.fx, c.fy, c.r, c.visionCos, c.seenS);
    ctx.fillStyle = c.seenS > 0.05 ? "#ffb454" : "#54677e";
    ctx.fillRect(c.x - 5 * k, c.y - 5 * k, 10 * k, 10 * k);
  }
  // ── THE TURRETS, WITH THE SAME FOUR TELLS THE WEBGL SCENE DRAWS ──────────
  // wedge, acquisition bar, aim line, tracer. The one hazard that costs HP
  // from across the room may not be a WebGL-only rule.
  for (const t of s.turrets) {
    const lock = turretLockFrac(s, t);
    const half = Math.acos(Math.max(-1, Math.min(1, t.visionCos)));
    const base = Math.atan2(t.fy, t.fx);
    ctx.strokeStyle = lock > 0.05 ? "#ff5340" : "#8a5a52";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const a of [base - half, base, base + half]) {
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r);
    }
    ctx.stroke();
    ctx.fillStyle = lock > 0.05 ? "#ff5340" : "#6d4a44";
    ctx.fillRect(t.x - 7 * k, t.y - 7 * k, 14 * k, 14 * k);
    ctx.strokeStyle = "#0a0e15";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x + t.fx * 13 * k, t.y + t.fy * 13 * k);
    ctx.stroke();
    if (lock > 0.05) {
      ctx.fillStyle = lock > 0.6 ? "#ff5340" : "#ffb454";
      ctx.fillRect(t.x - 7 * k, t.y - 13 * k, 14 * k * lock, 3 * k);
    }
    // gated on live sight (round 8): the ghost-laser fix holds here too
    if (t.sees && lock > 0.33) {
      ctx.strokeStyle = `rgba(255,83,64,${(0.25 + 0.6 * lock).toFixed(2)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(t.x + t.fx * 13 * k, t.y + t.fy * 13 * k);
      ctx.lineTo(s.px, s.py);
      ctx.stroke();
    }
    if (t.flash > 0) {
      ctx.fillStyle = "#ffd894";
      ctx.beginPath();
      ctx.arc(t.x + t.fx * 13 * k, t.y + t.fy * 13 * k, 6 * k * (t.flash / 10), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the rounds in flight (round 8): the dodgeable body, tracer and all
  for (const sh of s.shots) {
    ctx.strokeStyle = "rgba(255,216,148,0.85)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(sh.x - sh.vx * 0.05, sh.y - sh.vy * 0.05);
    ctx.lineTo(sh.x, sh.y);
    ctx.stroke();
    ctx.fillStyle = "#ffe9c0";
    ctx.beginPath();
    ctx.arc(sh.x, sh.y, 3.5 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of s.bots) {
    if (b.eaten) continue;
    const r = botR(b.tier) * k * (b.warden ? 1.6 : 1);
    // hunters all wear the Warden's red (one Warden, every floor)
    ctx.fillStyle = b.hunter ? (b.tier > s.tier ? "#ff3b2a" : "#54677e") : b.tier <= s.tier ? "#54677e" : "#6f87a3";
    ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
    // aware = uneatable: the hard red rim, even here
    const isAware = botAware(s, b);
    if (isAware) {
      ctx.strokeStyle = "#ff5340";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - r - 3 * k, b.y - r - 3 * k, r * 2 + 6 * k, r * 2 + 6 * k);
    }
    if (b.seenS > 0.05) {
      ctx.fillStyle = isAware ? "#ff5340" : "#ffb454";
      ctx.fillRect(b.x - r, b.y - r - 6 * k, r * 2 * Math.min(1, b.seenS / SEEN_ALARM_S), 3 * k);
    }
  }
  // ROUND 6, EVEN HERE: search memory (where it thinks you are) has to be
  // visible or the room's behaviour is unreadable.
  for (const b of s.bots) {
    if (b.eaten || b.searchF <= 0) continue;
    ctx.strokeStyle = "#ff8a5a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.lastX, b.lastY, 9 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  const R = BLOB_R_BY_TIER[Math.min(MAX_TIER, s.tier)] * k;
  // THE FEED: the channel ring and the noise it is broadcasting
  if (s.feedIdx >= 0) {
    ctx.strokeStyle = "#ffd894";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.px, s.py, R + 8 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * feedFrac(s));
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,216,148,0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.px, s.py, s.feedNoiseR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffb454";
  ctx.beginPath();
  ctx.arc(s.px, s.py, R, 0, Math.PI * 2);
  ctx.fill();
  if (s.hiding) {
    ctx.strokeStyle = "#58d6f2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.px, s.py, R + 4 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#26344e";
  ctx.fillRect(s.doorX - 10 * k, s.doorY - 40 * k, 20 * k, 80 * k);
  if (floorArmed(s)) {
    ctx.strokeStyle = "#ff5340";
    ctx.lineWidth = 8 * k;
    ctx.strokeRect(4 * k, 4 * k, s.W - 8 * k, s.H - 8 * k);
  }
  // the purge gauge: the chamber clock, drawn
  {
    const pf = purgeFrac(s);
    ctx.fillStyle = "#101826";
    ctx.fillRect(12 * k, s.H - 18 * k, 140 * k, 7 * k);
    ctx.fillStyle = pf >= 1 ? "#ff5340" : pf > 0.5 ? "#ffb454" : "#7a6a4a";
    ctx.fillRect(12 * k, s.H - 18 * k, 140 * k * pf, 7 * k);
    ctx.fillStyle = "#6b7a8f";
    ctx.font = `${8 * k}px system-ui`;
    ctx.fillText("PURGE", 158 * k, s.H - 12 * k);
  }
  ctx.fillStyle = "#c9d4e3";
  ctx.font = `${11 * k}px system-ui`;
  ctx.fillText(
    `T${s.tier}  ${s.chamber < CHAMBERS_PER_LAP ? `CH ${s.chamber + 1}/${CHAMBERS_PER_LAP}` : `DEPTH ${s.chamber + 1}`}  HP ${s.hp}/${s.hpMax}  ${strainScore(s)}`,
    12 * k,
    22 * k,
  );
  // same order of danger as the WebGL HUD: the gun first, because it is the
  // shortest fuse on the floor
  const gunF2 = turretThreat(s);
  if (gunF2 >= 1) {
    ctx.fillStyle = "#ff5340";
    ctx.fillText("TURRET FIRING. SIDESTEP THE SHOT", 12 * k, 38 * k);
  } else if (gunF2 > 0.2) {
    ctx.fillStyle = "#ff5340";
    ctx.fillText("TURRET LOCKING ON YOU", 12 * k, 38 * k);
  } else if (s.alarm) {
    ctx.fillStyle = "#ff5340";
    ctx.fillText("LOCKDOWN: EVERY MACHINE BITES NOW", 12 * k, 38 * k);
  } else if (floorArmed(s)) {
    ctx.fillStyle = "#ff5340";
    ctx.fillText("PURGE: THE FLOOR IS ARMED. GET OUT", 12 * k, 38 * k);
  } else if (s.feedIdx >= 0) {
    ctx.fillStyle = "#ffb454";
    ctx.fillText("FEEDING. THIS IS LOUD", 12 * k, 38 * k);
  }
}

export default function StrainClient() {
  return (
    <RunShell<StrainState>
      game="strain"
      title="STRAIN"
      accent="#ffb454"
      // PIN THE WORLD (2026-08-14). Strain was the last game reading its sim
      // dimensions off browser layout, so the chamber it simulated was never
      // the 360x480 space chambers.ts is authored in - and never the space
      // tape.ts replays in either. Pinned, the live game and the harness agree.
      aspect={DESIGN_W / DESIGN_H}
      worldSize={() => ({ w: DESIGN_W, h: DESIGN_H })}
      createSim={(w, h, seed, reduced, stats) => createStrain(w, h, seed, false, stats)}
      step={(s, dt, input) => stepStrain(s, dt, input)}
      draw={(ctx, s) => drawFallback(ctx, s)}
      scene={scene}
      done={strainDone}
      score={strainScore}
      resultHeadline={(s) =>
        s.wardensEaten > 0
          ? `THE WARDEN IS EATEN · DEPTH ${s.chamber + 1}`
          : s.phase === "timeout"
            ? "THE NETWORK OUTLASTED YOU"
            : s.chamber < CHAMBERS_PER_LAP
              ? `PURGED IN CHAMBER ${s.chamber + 1}`
              : `PURGED AT DEPTH ${s.chamber + 1}`
      }
      resultSub={(s) =>
        `tier T${s.tier} · ate ${s.eatenCount} (${s.quietEats} taken unseen, ${s.huntersEaten} hunters) · ${Math.round(s.doorPts / 120)} doors broken · ${s.alarmsTripped} alarms`
      }
      shareBuild={(s, dayKey) => {
        const doors = Math.round(s.doorPts / 120);
        const grid = `${"\u{1F9A0}"}${"\u{1F6AA}".repeat(Math.min(12, doors))}${s.huntersEaten > 0 ? `\u{1F916}×${s.huntersEaten}` : ""}${s.wardensEaten > 0 ? "\u{1F451}" : ""}\u{1F480}`;
        return {
          grid,
          payload: `STRAIN ${dayKey} · ${strainScore(s)} pts · depth ${s.chamber + 1}${s.wardensEaten > 0 ? " · WARDEN DOWN" : ""}\n${grid}\nlaunchwars.xyz/s6/games/strain`,
        };
      }}
      intro={
        <div>
          <p style={{ margin: "0 0 8px" }}>
            You are the virus the Resistance smuggled in. The Warden wants you contained.
          </p>
          <p style={{ margin: 0, opacity: 0.85 }}>
            WASD, the arrows or a held pointer steer you; SPACE holds you still. Every machine has a SIGHT CONE and
            walks a patrol, and the cameras sweep the chokepoints. Reach one UNSEEN and it corrupts whatever its size.
            Once it has CLOCKED you it cannot be corrupted at all: the small ones dodge out of your reach with their
            eyes on you, the big ones come for you, and only breaking the line of sight makes a machine forget. A
            second and a half in anything&apos;s sight and the ALARM goes off, and the WARDEN hunts you until you leave
            that floor. Turrets lock on and FIRE a round you can sidestep; crates stop it mid flight. Work the
            corners, come in from behind, park on the door once your tier matches its lock. Five
            chambers deep the Warden&apos;s real body is waiting, and taking it unseen is the win. The network keeps
            going after that, and everything in it only gets faster.
          </p>
        </div>
      }
      strings={{
        scoreUnit: "",
        startIdle: "RELEASE THE STRAIN",
        keyboardHint: "Keyboard works too: WASD or arrows to steer, held, and SPACE to hold still.",
      }}
    />
  );
}
