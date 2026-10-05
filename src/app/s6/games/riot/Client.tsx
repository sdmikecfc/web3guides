"use client";
/**
 * RIOT - the page client. Presentation only (ADR-0119: Pixi renders, the sim
 * rules). Checkpoint B: an ALL-VECTOR belt-scroll brawler view - capsule
 * fighters with limb lines whose pose derives from the sim's own state clock
 * (fsm + attackId + (fsmDur-fsmF)/fsmDur), so the picture and the hitbox can
 * never drift apart. Zero art files render today; every Assets.load below is
 * fire-and-forget with a null fallback (try-image-else-vector, the S6 art
 * law): every actor dresses in a sheet frame when its atlas has landed and
 * falls back to its vector rig per-actor otherwise, so a missing or partial
 * pack can never blank the game. Gameplay signals (tells, warmth rings, the
 * vuln glow) are ALWAYS vector, drawn over the sprite.
 *
 * LAYERS (the plan's stack): shakeRoot > (skyFar -camX*0.15 / mid -camX*0.45 /
 * play -camX > groundG, doorsG, shadowsG, floorFxG, actorsC sortable zIndex=y,
 * projG, fxG) + overlayG + hudLayer. The camera is SIM state: this file only
 * ever positions containers at -s.camX; pointerTransform (on RunShell) adds
 * camX so tapes carry WORLD coordinates.
 *
 * PRESENTATION MEMORY (the ironjaw mem pattern): the sim publishes monotonic
 * counters (hitCount/hurtCount/koCount/pickupCount + last-coords) and this
 * file diffs them into countdowns - hitsparks, KO debris, shake, victim
 * flashes, the hitstop zoom-punch. Math.random is ALLOWED here and nowhere
 * near the sim (page-side only, never on the tape).
 */

import { RunShell, type SceneHandle } from "../_shared/RunShell";
import { createPixiStage } from "../_shared/pixi";
// TYPE-ONLY (erased): real constructors come from stage.pixi (the SSR law).
import type { Container, Graphics, Sprite, Spritesheet, Text, Texture } from "pixi.js";
import {
  createRiot,
  stepRiot,
  riotDone,
  riotScore,
  DESIGN_W,
  DESIGN_H,
  FLOOR_TOP,
  FLOOR_BOT,
  ENTRY_WARM_F,
  type RiotState,
  type Enemy,
  type Boss,
  type AttackId,
} from "./sim";
import { LEVEL_SETS, TELL_FLOOR_F, BOSS_TELL_FLOOR_F, type EnemyKind, type LevelDef } from "./levels";
import type { Sfx } from "../_shared/sfx";

// ── palette ────────────────────────────────────────────────────────────────
const C = {
  amber: 0xe8a33d,
  amberHi: 0xffd894,
  amberDeep: 0xa06a1e,
  red: 0xff5340,
  redDeep: 0x7e2c22,
  green: 0x59d98c,
  violet: 0xb07cff,
  white: 0xffffff,
  ink: 0x0c0a08,
  text: 0xf0e9da,
  dim: 0x9a917f,
  steel: 0x3a3f4c,
};

/** Per-skin dressing (RENDER-ONLY: read off the level def, never fed back). */
/** Ground colors re-keyed round 4 (Mike: "the wood flooring doesn't make
 * sense outside"): L1 walks an ASPHALT street (cool gray under the amber
 * sky), L2 a beaten DIRT path (earth brown under the pines), L3 riveted
 * DECK PLATE (violet steel). The old browns + plank lines read as parquet. */
const SKINS: Record<
  "streets" | "forest" | "facility",
  { skyTop: number; skyHz: number; ground: number; groundLine: number; under: number; far: number; mid: number; accent: number }
> = {
  streets: { skyTop: 0x1c110c, skyHz: 0x8a4520, ground: 0x26242a, groundLine: 0x3a3740, under: 0x141317, far: 0x2c1a12, mid: 0x382216, accent: 0xe8a33d },
  forest: { skyTop: 0x081512, skyHz: 0x1f5244, ground: 0x241c11, groundLine: 0x39301d, under: 0x120e08, far: 0x14302a, mid: 0x1b3d34, accent: 0x58d6c2 },
  facility: { skyTop: 0x110818, skyHz: 0x4c1c5a, ground: 0x1d1327, groundLine: 0x342249, under: 0x0f0916, far: 0x241031, mid: 0x321845, accent: 0xd45ae0 },
};

/** Machine palettes: every kind reads as its own silhouette AND its own hue. */
const KIND_ART: Record<EnemyKind, { main: number; deep: number; eye: number }> = {
  grunt: { main: 0x8a8f9c, deep: 0x555b68, eye: 0xff5340 },
  pgrunt: { main: 0x9c9484, deep: 0x615a4d, eye: 0xffb454 },
  harass: { main: 0x9fb7c4, deep: 0x5d7280, eye: 0x58d6f2 },
  thrower: { main: 0xc4a35a, deep: 0x7d6633, eye: 0xffb454 },
  bthrower: { main: 0xb8a86a, deep: 0x6e6238, eye: 0x58d6f2 },
  blocker: { main: 0x5f8f86, deep: 0x39544f, eye: 0x59d98c },
  bomber: { main: 0x9a9a6b, deep: 0x5d5d3f, eye: 0xffd894 },
  charger: { main: 0xb0685a, deep: 0x6e3c33, eye: 0xff5340 },
};

/** Boss display names - ORIGINAL strings, no trademarks anywhere. */
const BOSS_NAMES: Record<Boss["kind"], string> = {
  charge: "BULLRIG",
  limbs: "LONGARM",
  warp: "FLICKER",
};
/** Boss tell aura by attackId (the warp boss's color IS the read). */
const BOSS_AURA = [0xe8a33d, 0xff5340, 0xb07cff];

// ── art hooks ──────────────────────────────────────────────────────────────
const ART = "/s6-art/games/riot";
type CharKey = "hero" | "thug-a" | "thug-b" | "thug-c" | "thug-d" | "boss-1" | "boss-2" | "boss-3" | "props";
const CHAR_KEYS: CharKey[] = ["hero", "thug-a", "thug-b", "thug-c", "thug-d", "boss-1", "boss-2", "boss-3", "props"];
/** Which atlas each machine kind wears (integrate phase may remap). */
const CHAR_FOR: Record<EnemyKind, CharKey> = {
  grunt: "thug-a",
  pgrunt: "thug-a",
  harass: "thug-b",
  bomber: "thug-b",
  thrower: "thug-c",
  bthrower: "thug-c",
  blocker: "thug-d",
  charger: "thug-d",
};
/** Sprite scale per atlas key: cells are 96 (hero/thugs) or 128 (bosses)
 * with feet baked at CELL-6; the vector rigs stand ~64px, so these factors
 * land a sheet character at rig height. Tuned per pack, not per frame. */
const SPRITE_SCALE: Partial<Record<CharKey, number>> = {
  // CraftPix cells: chars are 48px-source (~34px body) in 96 cells, bosses
  // 96px-source (~41-64px body) in 128 cells. One factor per source density
  // keeps every pack's pixels the same size on the belt.
  hero: 1.7,
  "thug-a": 1.7,
  "thug-b": 1.7,
  "thug-c": 1.7,
  "thug-d": 1.7,
  "boss-1": 1.25,
  "boss-2": 1.25,
  "boss-3": 1.25,
};
/** Feet sit at CELL-6 in every ingested cell (riot-ingest baseline law). */
const SPRITE_ANCHOR_Y = (96 - 6) / 96;

/** The textureFor fallback chain: a pack missing a verb degrades to its
 * nearest sibling, then idle, then the sheet's first frame - never a crash,
 * never an invisible actor (the CC0 floor ships without walk/jump). */
const ANIM_FALLBACK: Record<string, string> = {
  jab2: "jab1",
  jab3: "jab1",
  finisher: "jab1",
  swing: "jab1",
  jumpkick: "jump",
  jump: "idle",
  dash: "walk",
  run: "walk",
  walk: "idle",
  rise: "hurt",
  down: "hurt",
  attack: "jab1",
  attack2: "attack",
  attack3: "attack",
  stun: "hurt",
  death: "hurt",
};

// ── page-side audio deltas (ironjaw pattern; reset per run in createSim) ───
const audioPrev = {
  hit: 0,
  hurt: 0,
  ko: 0,
  pickup: 0,
  goF: 0,
  boss: false,
  bosses: 0,
  fights: 0,
  combo: 0,
  enters: 0,
  stuns: 0,
  weapon: "" as "" | "pipe" | "blaster",
  attack: "" as AttackId,
  dead: false,
};
function resetAudioPrev(): void {
  audioPrev.hit = 0;
  audioPrev.hurt = 0;
  audioPrev.ko = 0;
  audioPrev.pickup = 0;
  audioPrev.goF = 0;
  audioPrev.boss = false;
  audioPrev.bosses = 0;
  audioPrev.fights = 0;
  audioPrev.combo = 0;
  audioPrev.enters = 0;
  audioPrev.stuns = 0;
  audioPrev.weapon = "";
  audioPrev.attack = "";
  audioPrev.dead = false;
}
function riotAudio(s: RiotState, sfx: Sfx): void {
  const p = audioPrev;
  if (s.p.attackId !== "" && s.p.attackId !== p.attack) sfx.play("tap"); // swing whoosh
  if (s.hitCount > p.hit) sfx.play(s.lastHitHeavy ? "clank" : "hit");
  if (s.hurtCount > p.hurt) {
    sfx.play("hurt");
    sfx.buzz(24);
  }
  if (s.koCount > p.ko) sfx.play("ko");
  if (s.pickupCount > p.pickup) sfx.play(s.lastPickupKind === "pipe" ? "pickup" : "powerup"); // blaster + health read as powerups
  let enters = 0;
  let stuns = 0;
  for (const e of s.enemies) {
    if (e.fsm === "enter") enters++;
    if (e.fsm === "stun") stuns++;
  }
  if (enters > p.enters) sfx.play("door"); // something just walked in
  if (stuns > p.stuns) sfx.play("breaker"); // a guard broke
  if (s.goF > 0 && p.goF === 0) sfx.play("warn"); // GO
  const bossLive = !!s.boss && s.boss.fsm !== "dead";
  if (bossLive && !p.boss) sfx.play("boss");
  if (s.bossesDown > p.bosses) sfx.play("fanfare");
  if (s.fightsCleared > p.fights) sfx.play("score");
  if (s.comboCount > p.combo && s.comboCount >= 3) sfx.play("score");
  if (p.weapon !== "" && s.p.weapon === "") sfx.play("clank"); // weapon lost/spent
  if ((s.phase === "dead" || s.phase === "timeout") && !p.dead) {
    sfx.play("ko");
    sfx.buzz([30, 40, 60]);
  }
  p.attack = s.p.attackId;
  p.hit = s.hitCount;
  p.hurt = s.hurtCount;
  p.ko = s.koCount;
  p.pickup = s.pickupCount;
  p.enters = enters;
  p.stuns = stuns;
  p.goF = s.goF;
  p.boss = bossLive;
  p.bosses = s.bossesDown;
  p.fights = s.fightsCleared;
  p.combo = s.comboCount;
  p.weapon = s.p.weapon;
  p.dead = s.phase === "dead" || s.phase === "timeout";
}

// ── small helpers ──────────────────────────────────────────────────────────
function lerpC(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
function hex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}
/** Deterministic per-index jitter for static dressing (NOT Math.random:
 * dressing must not shimmer between frames). */
function h01(i: number): number {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** One limb-line pose. Local space: feet at (0,0), +x = facing, up = -y. */
interface Pose {
  lean: number; // torso-top x offset
  crouch: number; // body drop
  armF: [number, number]; // front hand
  armB: [number, number]; // back hand
  legF: [number, number]; // front foot
  legB: [number, number]; // back foot
  lying: boolean;
}

/** The one clock: fsm + attackId + progress (0..1 through the state) +
 * a distance-ish cycle for locomotion. Used by player AND machines so every
 * actor animates off sim truth. */
function poseFor(
  fsm: string,
  attackId: AttackId | "",
  prog: number,
  cycle: number,
): Pose {
  const P: Pose = { lean: 0, crouch: 0, armF: [13, -40], armB: [-7, -42], legF: [6, 0], legB: [-6, 0], lying: false };
  const ext = Math.sin(Math.min(1, Math.max(0, prog)) * Math.PI); // swell mid-state
  switch (fsm) {
    case "walk":
    case "approach":
    case "strafe":
    case "enter": {
      const sw = Math.sin(cycle);
      P.legF = [sw * 8, 0];
      P.legB = [-sw * 8, 0];
      P.armF = [11 - sw * 4, -40];
      P.armB = [-7 + sw * 4, -41];
      break;
    }
    case "run": {
      const sw = Math.sin(cycle * 1.4);
      P.lean = 5;
      P.legF = [sw * 11, 0];
      P.legB = [-sw * 11, 0];
      P.armF = [12 - sw * 6, -38];
      P.armB = [-8 + sw * 6, -40];
      break;
    }
    case "attack":
    case "jumpatk": {
      switch (attackId) {
        case "jab1":
          P.armF = [12 + 26 * ext, -42];
          P.lean = 3 * ext;
          break;
        case "jab2":
          P.armB = [12 + 26 * ext, -41];
          P.armF = [6, -38];
          P.lean = 3 * ext;
          break;
        case "finisher":
          P.armF = [10 + 30 * ext, -40];
          P.armB = [8 + 26 * ext, -46];
          P.lean = 7 * ext;
          P.crouch = 3 * ext;
          break;
        case "swing": {
          const a = -1.9 + 2.7 * ext; // overhead-to-forward arc
          P.armF = [Math.cos(a) * 26, -42 + Math.sin(a) * 22];
          P.lean = 5 * ext;
          break;
        }
        case "dash":
          P.lean = 11;
          P.armF = [-8, -36];
          P.armB = [-14, -40];
          P.legF = [12, 0];
          P.legB = [-13, 0];
          break;
        case "jumpkick":
          P.legF = [8 + 22 * ext, -16];
          P.legB = [-6, -8];
          P.armF = [-4, -44];
          P.armB = [-12, -38];
          P.lean = -4;
          break;
        default:
          // machines have no attackId: a plain forward lunge
          P.armF = [12 + 24 * ext, -40];
          P.lean = 5 * ext;
      }
      break;
    }
    case "windup":
      P.lean = -5;
      P.armF = [-2 - 10 * prog, -46]; // cocked
      P.armB = [-10, -40];
      break;
    case "tell":
      P.lean = -6;
      P.armF = [-4 - 8 * prog, -48];
      break;
    case "recover":
      P.lean = 2;
      P.armF = [14, -38];
      break;
    case "jump":
      P.legF = [7, -10];
      P.legB = [-5, -8];
      P.armF = [10, -46];
      P.armB = [-10, -46];
      break;
    case "hit":
      P.lean = -8;
      P.armF = [4, -32];
      P.armB = [-14, -36];
      break;
    case "stun":
      P.lean = Math.sin(cycle * 2.4) * 6;
      P.crouch = 4;
      P.armF = [10, -30];
      P.armB = [-10, -30];
      break;
    case "down":
      P.lying = true;
      break;
    case "getup":
      P.crouch = 16 * (1 - prog);
      break;
    default:
      // idle bob
      P.crouch = Math.sin(cycle * 0.5) * 1.2;
  }
  return P;
}

export default function RiotClient() {
  return (
    <RunShell<RiotState>
      game="riot"
      title="RIOT"
      accent="#e8a33d"
      // PIN THE BELT (the ironjaw framing lesson): the sim is always 640x400
      // and the stage letterboxes it; aspect and worldSize must agree.
      aspect={DESIGN_W / DESIGN_H}
      worldSize={() => ({ w: DESIGN_W, h: DESIGN_H })}
      createSim={(w, h, seed, reduced, stats) => {
        resetAudioPrev(); // per-run page state reset, per the RunShell contract
        return createRiot(w, h, seed, false, stats ?? { botox: 0, drugs: 0, ozempic: 0, aura: 0, optics: 0 });
      }}
      step={(s, dt, input) => stepRiot(s, dt, input)}
      draw={(ctx, s) => drawFallback(ctx, s)}
      scene={scene}
      onFrame={riotAudio}
      sfxPack={["tap", "hit", "hurt", "ko", "clank", "breaker", "pickup", "powerup", "door", "boss", "warn", "fanfare", "score"]}
      // THE CAMERA CONTRACT: the sim owns camX; the shell converts the screen
      // pointer to WORLD x before the sim sees it, so tapes replay camera-free.
      pointerTransform={(x, y, s) => ({ x: x + s.camX, y })}
      done={riotDone}
      score={riotScore}
      resultHeadline={(s) =>
        s.phase === "timeout"
          ? "THE CLOCK CALLED IT"
          : s.bossesDown >= 3
            ? `SCRAPPED IN THE ARENA · WAVE ${s.arenaWave}`
            : `DOWN IN STAGE ${Math.min(3, s.level + 1)}`
      }
      resultSub={(s) =>
        `${s.kills} machines scrapped · ${s.fightsCleared} brawls won · ${s.bossesDown}/3 bosses · ${Math.round(s.t)}s`
      }
      shareBuild={(s, dayKey) => {
        // rows: stages cleared (skin-colored squares) / bosses down / arena waves
        const squares = ["\u{1F7E7}", "\u{1F7E9}", "\u{1F7EA}"];
        const row1 = squares.map((e, i) => (i < s.bossesDown ? e : "⬛")).join("");
        const row2 = s.bossesDown > 0 ? "⚙️".repeat(s.bossesDown) : "";
        const row3 = s.arenaWave > 0 ? "\u{1F525}".repeat(Math.min(12, s.arenaWave)) : "";
        const grid = `${[row1, row2, row3].filter(Boolean).join("\n")}\u{1F480}`;
        return {
          grid,
          payload: `RIOT ${dayKey} · ${riotScore(s)} pts · ${
            s.bossesDown >= 3 ? `arena wave ${s.arenaWave}` : `stage ${Math.min(3, s.level + 1)}`
          }\n${grid}\nlaunchwars.xyz/s6/games/riot`,
        };
      }}
      intro={
        <div>
          <p style={{ margin: "0 0 8px" }}>
            The Warden&apos;s machines hold the streets. Walk right and take them back, one brawl at a time.
          </p>
          <p style={{ margin: 0, opacity: 0.85 }}>
            CLICK to punch: any click, held any length, anywhere on screen. He swings the way he is facing, two jabs
            then a smash that knocks machines flat, turning around only when the machine is behind him. DRAG to move:
            press and slide toward where you want to go, keep it held and he breaks into a run; click while running for
            a dash attack, click in the air for a flying kick, and both break a blocker&apos;s guard. SPACE jumps.
            Dropped pipes and blasters pick up automatically and hit far harder, but a knockdown costs you yours. Every
            machine flashes before it strikes: read the tell, step off the line, and stay off the bomb marks. Three
            stages, three bosses, and after the third the arena never ends. It only gets faster.
          </p>
        </div>
      }
      strings={{
        scoreUnit: "",
        startIdle: "START THE RIOT",
        keyboardHint: "Keyboard works too: WASD or arrows to move, Space to jump. Click or tap to attack.",
      }}
    />
  );
}

// ── the Pixi scene ─────────────────────────────────────────────────────────
async function buildScene(canvas: HTMLCanvasElement): Promise<SceneHandle<RiotState>> {
  const stage = await createPixiStage(canvas, { background: 0x14100c });
  const { Container, Graphics, Text, TextStyle } = stage.pixi;
  const W = stage.world;
  const hud = (size: number, fill: number, bold = false) =>
    new TextStyle({ fontFamily: "Segoe UI, system-ui, sans-serif", fontSize: size, fill, fontWeight: bold ? "700" : "400", letterSpacing: 1 });

  // ── atlases: fire-and-forget, null until the art phase lands them ────────
  const sheets: Record<CharKey, Spritesheet | null> = {
    hero: null,
    "thug-a": null,
    "thug-b": null,
    "thug-c": null,
    "thug-d": null,
    "boss-1": null,
    "boss-2": null,
    "boss-3": null,
    props: null,
  };
  for (const key of CHAR_KEYS) {
    stage.pixi.Assets.load(`${ART}/chars/${key}.json`)
      .then((sh) => {
        if (!sh) return;
        const ss = sh as Spritesheet;
        // THE SNES-CRISP LINE: nearest-neighbor on the atlas source.
        const t0 = Object.values(ss.textures)[0];
        if (t0) t0.source.style.scaleMode = "nearest";
        sheets[key] = ss;
      })
      .catch(() => {});
  }
  // painted far plates per level skin; vector gradient stands in until then
  const bgTex: (Texture | null)[] = [null, null, null];
  for (let i = 0; i < 3; i++) {
    stage.pixi.Assets.load(`${ART}/bg-l${i + 1}-far.webp`)
      .then((t) => {
        if (t) bgTex[i] = t as Texture;
      })
      .catch(() => {});
  }
  // THE WALL BUILDINGS (Mike 2026-08-16: "render 5 building varieties for
  // each level... instead of these assets blown up in resolution"): five
  // Seedream-rendered facades per level, cut by _raw/cut_bldrows.py from one
  // shared-baseline lineup per level, shipped at ~2x display size. They are
  // PAINTED art: linear filtering (no nearest - that law is for pixel-cell
  // atlases), drawn at one uniform scale per level so the lineup's relative
  // heights survive. The flat skin.mid slabs stay the no-art fallback.
  // THE CUTS MUST STAY FOOT-TIGHT. Mike 2026-08-16 "the buildings are
  // floating and not big enough": the cutter cropped each piece with
  // Image.getbbox(), the L1 plate has stray 1px specks out in its empty sky,
  // and so every piece shipped with ~230 dead rows under its base and ~200
  // over its roof. Bottom-on-the-floor-line then floated the art 28px and
  // spent 26% of each sprite on nothing (bld-l1-d drew 56px - hero height).
  // cut_bldrows.py now crops on an OPENED alpha mask and gates the foot.
  // Any future re-cut must keep that gate green or this comes straight back.
  const FACADE_FILES: string[][] = [
    ["bld-l1-a", "bld-l1-b", "bld-l1-c", "bld-l1-d", "bld-l1-e"],
    ["bld-l2-a", "bld-l2-b", "bld-l2-c", "bld-l2-d", "bld-l2-e"],
    ["bld-l3-a", "bld-l3-b", "bld-l3-c", "bld-l3-d", "bld-l3-e"],
  ];
  /** ROUND 4 (Mike: "the buildings look better but they seem a bit far"):
   * 0.5 -> 0.6, picked by PIL compositing of 0.50/0.58/0.66 against the L1
   * far plate with actors at true scale. At 0.6 the tallest piece stands
   * 246 (roof y=9, brushing the frame like a street you are ON), the
   * shopfront tier stands ~133-178 with clear skyline over its roofs, and
   * at 0.66 the row swallowed the skyline - rejected. Painted art, linear
   * filtering: fractional scale is fine (quarter-snap is the pixel-cell
   * atlases' law, not this row's). */
  const BLD_SCALE = 0.6;
  /** The foot sinks THIS far under the band's back line, so the 1-2px
   * antialiased edge on a cut base can never read as a gap. groundG draws
   * after wallC, so the tuck is hidden at every camera position. */
  const BLD_TUCK = 3;
  const facadeTex: (Texture | null)[][] = FACADE_FILES.map((l) => l.map(() => null));
  FACADE_FILES.forEach((list, li) =>
    list.forEach((name, fi) => {
      stage.pixi.Assets.load(`${ART}/${name}.webp`)
        .then((t) => {
          if (t) facadeTex[li][fi] = t as Texture;
        })
        .catch(() => {});
    }),
  );

  // ── layer stack ──────────────────────────────────────────────────────────
  const shakeRoot = new Container();
  W.addChild(shakeRoot);
  shakeRoot.pivot.set(DESIGN_W / 2, DESIGN_H / 2);
  shakeRoot.position.set(DESIGN_W / 2, DESIGN_H / 2);
  const skyFar = new Container(); // parallax 0.15
  const mid = new Container(); // parallax 0.45
  const play = new Container(); // parallax 1 (the belt)
  shakeRoot.addChild(skyFar, mid, play);
  const skyVecG = new Graphics(); // gradient bands + far silhouettes (vector bg)
  skyFar.addChild(skyVecG);
  let bgSprite: Sprite | null = null; // painted plate, cover-fit over skyVecG
  const midG = new Graphics();
  const midSpr = new Container(); // facade sprites over/instead of the vector slabs
  mid.addChild(midG, midSpr);
  // THE WALL (Mike 2026-08-16: "full row of buildings, no gaps... like a
  // real city you are walking through" - the Simpsons Arcade grammar): a
  // CONTIGUOUS facade row at STREET parallax, its base ON the band's back
  // line, doors set into it. The old 0.45-parallax scatter with 120-210px
  // strides was gaps by construction.
  const wallC = new Container(); // facade sprites, edge to edge
  const wallG = new Graphics(); // contiguous vector wall (no-art fallback)
  const groundG = new Graphics(); // the belt band, redrawn per level
  const doorsG = new Graphics(); // door slabs (vector fallback for doorsC)
  const doorsC = new Container(); // CraftPix door sprites (props sheet door1/2/3)
  const shadowsG = new Graphics(); // ground-truth ellipses, shrink with z
  const floorFxG = new Graphics(); // lane telegraphs, bomb marks, pickups, walk target
  const actorsC = new Container(); // painter's sort: zIndex = y
  actorsC.sortableChildren = true;
  const projG = new Graphics(); // bolts, bombs, the limb boss laser
  const fxG = new Graphics(); // hitsparks, KO debris, door debris
  play.addChild(wallG, wallC, groundG, doorsG, doorsC, shadowsG, floorFxG, actorsC, projG, fxG);
  const overlayG = new Graphics(); // hurt flash, hitstop corners, transition dim
  W.addChild(overlayG);
  const hudLayer = new Container();
  W.addChild(hudLayer);

  // ── actor pool (sprite UNDER graphics: signals always draw over art) ─────
  const actorPool: { c: Container; g: Graphics; s: Sprite }[] = [];
  let actorUsed = 0;
  const takeActor = (): { c: Container; g: Graphics; s: Sprite } => {
    let a = actorPool[actorUsed];
    if (!a) {
      const c = new Container();
      const sp = new stage.pixi.Sprite();
      sp.anchor.set(0.5, SPRITE_ANCHOR_Y);
      sp.visible = false;
      const g = new Graphics();
      c.addChild(sp, g);
      actorsC.addChild(c);
      a = { c, g, s: sp };
      actorPool.push(a);
    }
    actorUsed++;
    a.c.visible = true;
    a.c.alpha = 1;
    a.c.rotation = 0;
    a.s.visible = false;
    a.g.clear();
    return a;
  };

  /** Pick a frame off a loaded sheet: exact anim -> the fallback chain ->
   * idle -> first frame. Returns null only for a null/empty sheet, which
   * routes the actor to its vector rig (the try-image-else-vector law). */
  const texFor = (
    sheet: Spritesheet | null,
    anim: string,
    frame01: number,
    cyclic: boolean,
  ): Texture | null => {
    if (!sheet) return null;
    const anims = sheet.animations as Record<string, Texture[]>;
    let name = anim;
    let frames = anims[name];
    let hops = 0;
    while ((!frames || frames.length === 0) && hops < 6) {
      name = ANIM_FALLBACK[name] ?? "idle";
      frames = anims[name];
      hops++;
      if (name === "idle" && (!frames || frames.length === 0)) break;
    }
    if (!frames || frames.length === 0) {
      const first = Object.values(sheet.textures)[0];
      return first ?? null;
    }
    const n = frames.length;
    const f01 = Math.max(0, Math.min(1, frame01));
    const idx = cyclic ? ((Math.floor(frame01 * n) % n) + n) % n : Math.min(n - 1, Math.floor(f01 * n));
    return frames[idx] ?? frames[0];
  };

  /** Dress an actor slot in a sheet frame (true) or leave it to the vector
   * rig (false). Signals - tells, warmth, stuns - stay in a.g on top. */
  const dressSprite = (
    a: { s: Sprite },
    key: CharKey,
    anim: string,
    frame01: number,
    cyclic: boolean,
  ): boolean => {
    const t = texFor(sheets[key], anim, frame01, cyclic);
    if (!t) return false;
    a.s.texture = t;
    a.s.scale.set(SPRITE_SCALE[key] ?? 0.85);
    a.s.visible = true;
    return true;
  };

  // ── HUD ──────────────────────────────────────────────────────────────────
  const hudG = new Graphics(); // HP bar, weapon chip, boss bar, GO chevrons
  const scoreT = new Text({ text: "", style: hud(13, C.text, true) });
  const weaponT = new Text({ text: "", style: hud(9.5, C.text, true) });
  const comboT = new Text({ text: "", style: hud(13, C.amber, true) });
  comboT.anchor.set(1, 0);
  const bossNameT = new Text({ text: "", style: hud(10, 0xff8a75, true) });
  bossNameT.anchor.set(0.5);
  const waveT = new Text({ text: "", style: hud(11, C.amber, true) });
  waveT.anchor.set(0.5);
  const cardT = new Text({ text: "", style: hud(26, C.text, true) });
  cardT.anchor.set(0.5);
  const cardSubT = new Text({ text: "", style: hud(10, C.dim, true) });
  cardSubT.anchor.set(0.5);
  const goT = new Text({ text: "GO", style: hud(16, C.amber, true) });
  goT.anchor.set(0.5);
  const hintT = new Text({ text: "CLICK: PUNCH · DRAG: MOVE · SPACE: JUMP", style: hud(7.5, C.dim) });
  hintT.anchor.set(0.5, 1);
  hudLayer.addChild(hudG, scoreT, weaponT, comboT, bossNameT, waveT, cardT, cardSubT, goT, hintT);

  // ── presentation memory (page-side only, never sim) ──────────────────────
  interface FxP {
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    max: number;
    size: number;
    color: number;
    grav: boolean;
    star: boolean;
  }
  const mem = {
    prevHit: 0,
    prevHurt: 0,
    prevKo: 0,
    prevPickup: 0,
    hitFlashT: 0, // victim white-flash window (2-4f)
    hurtT: 0, // red overlay
    hpPopT: 0, // HP bar pop after a health pack
    shakeT: 0,
    comboPopT: 0,
    prevCombo: 0,
    layoutKey: "",
    lastWallF: -1,
    fx: [] as FxP[],
    seen: new WeakSet<Enemy>(),
    doorOpen: new Set<string>(),
    doorOpenAt: new Map<string, number>(), // wallF when a door blew open (flipbook clock)
    prevSlam: false, // boss-1 piston slam edge (one-shot dust + shake)
    lastSimW: 0,
  };
  /** Door sprite pool (doorsC), one per fixture on the current level. */
  const doorPool: Sprite[] = [];
  const burst = (x: number, y: number, color: number, n: number, grav: boolean) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      mem.fx.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5 - (grav ? 120 : 0),
        t: 26,
        max: 26,
        size: 2.5 + Math.random() * 4,
        color,
        grav,
        star: false,
      });
    }
  };
  const spark = (x: number, y: number, heavy: boolean) => {
    mem.fx.push({ x, y, vx: 0, vy: 0, t: heavy ? 10 : 7, max: heavy ? 10 : 7, size: heavy ? 20 : 13, color: heavy ? C.amberHi : C.white, grav: false, star: true });
  };

  // ── static dressing (redrawn on level change + when facade cuts land) ────
  const drawStatics = (lvl: LevelDef | null, levelW: number, facades: Texture[]) => {
    const skin = SKINS[lvl?.skin ?? "facility"];
    const skyW = DESIGN_W + 0.15 * Math.max(0, levelW - DESIGN_W) + 40;
    const midW = DESIGN_W + 0.45 * Math.max(0, levelW - DESIGN_W) + 40;
    // sky gradient bands (vector fallback for the painted far plate)
    skyVecG.clear();
    const BANDS = 9;
    for (let i = 0; i < BANDS; i++) {
      const t = i / (BANDS - 1);
      skyVecG.rect(0, (FLOOR_TOP / BANDS) * i, skyW, FLOOR_TOP / BANDS + 1).fill(lerpC(skin.skyTop, skin.skyHz, t * t));
    }
    // horizon glow line
    skyVecG.rect(0, FLOOR_TOP - 3, skyW, 3).fill({ color: skin.accent, alpha: 0.25 });
    // far silhouettes per skin
    const kind = lvl?.skin ?? "facility";
    for (let x = 0, i = 0; x < skyW; i++) {
      const w = 46 + h01(i) * 60;
      if (kind === "streets") {
        const ht = 60 + h01(i * 3 + 1) * 90;
        skyVecG.rect(x, FLOOR_TOP - ht, w, ht).fill(skin.far);
        for (let wy = 0; wy < 3; wy++) {
          if (h01(i * 7 + wy) > 0.45) skyVecG.rect(x + w * 0.25, FLOOR_TOP - ht + 12 + wy * 20, 5, 7).fill({ color: skin.accent, alpha: 0.35 });
        }
      } else if (kind === "forest") {
        const ht = 50 + h01(i * 3 + 1) * 70;
        skyVecG.poly([x, FLOOR_TOP, x + w * 0.5, FLOOR_TOP - ht, x + w, FLOOR_TOP]).fill(skin.far);
      } else {
        const ht = 70 + h01(i * 3 + 1) * 60;
        skyVecG.rect(x, FLOOR_TOP - ht, w, ht).fill(skin.far);
        skyVecG.rect(x + 6, FLOOR_TOP - ht + 8, w - 12, 4).fill({ color: skin.accent, alpha: 0.3 });
      }
      x += w + 12 + h01(i * 5 + 2) * 30;
    }
    // ── THE WALL: contiguous facades at street parallax (Mike 2026-08-16:
    //    "a full row of buildings, no gaps... a real city you are walking
    //    through"). Advance = the piece's own drawn width, minus a 1px seam
    //    overlap. The vector fallback is ALSO gap-free - the law holds with
    //    zero art on disk. ──────────────────────────────────────────────────
    wallG.clear();
    for (const old of wallC.removeChildren()) old.destroy();
    // pushback 0.15 -> 0.08 (round 4, picked with BLD_SCALE by compositing):
    // the wall is the street's OWN wall - the heavier tint read as distance
    const wTint = lerpC(0xffffff, skin.far, 0.08);
    {
      const wallEnd = levelW + 60;
      let x = -20;
      let i = 0;
      let prev = -1; // last piece index: a facade never sits next to its twin
      while (x < wallEnd) {
        let pick = -1;
        if (facades.length > 0) {
          pick = Math.floor(h01(i * 7 + 3) * facades.length) % facades.length;
          // two identical neon arcades shoulder to shoulder read as a
          // copy-paste, not a street - step to the neighbour instead
          if (pick === prev && facades.length > 1) pick = (pick + 1) % facades.length;
          prev = pick;
        }
        const tex = pick >= 0 ? facades[pick] : null;
        if (tex) {
          // painted, pre-scaled renders: ONE uniform scale per level keeps
          // the lineup's relative heights; linear filtering, never nearest
          const spr = new stage.pixi.Sprite(tex);
          spr.anchor.set(0, 1);
          spr.position.set(x, FLOOR_TOP + BLD_TUCK);
          spr.scale.set(BLD_SCALE);
          spr.tint = wTint;
          wallC.addChild(spr);
          x += Math.max(24, tex.width * BLD_SCALE - 1);
        } else {
          const w = 58 + h01(i * 5 + 2) * 52;
          const ht = 108 + h01(i * 11) * 52;
          const top = FLOOR_TOP - ht;
          if (kind === "streets") {
            wallG.rect(x, top, w, ht).fill(skin.mid);
            wallG.rect(x, top, w, 6).fill(lerpC(skin.mid, 0x000000, 0.3)); // parapet
            wallG.rect(x + w - 2, top, 2, ht).fill({ color: 0x000000, alpha: 0.25 }); // party-wall seam
            // window grid, some lit
            for (let wy = 0; wy < 3; wy++)
              for (let wx = 0; wx + 14 < w; wx += 18) {
                const lit = h01(i * 13 + wy * 5 + wx) > 0.55;
                wallG
                  .rect(x + 6 + wx, top + 14 + wy * 26, 9, 13)
                  .fill(lit ? { color: skin.accent, alpha: 0.55 } : { color: 0x000000, alpha: 0.35 });
              }
            // shopfront band at street level
            wallG.rect(x + 3, FLOOR_TOP - 30, w - 6, 30).fill(lerpC(skin.mid, 0x000000, 0.22));
            wallG.rect(x + 3, FLOOR_TOP - 30, w - 6, 4).fill({ color: skin.accent, alpha: 0.4 }); // awning line
          } else if (kind === "forest") {
            // treeline block: packed trunks + canopy mass, edge to edge
            wallG.rect(x, FLOOR_TOP - 34, w, 34).fill(lerpC(skin.mid, 0x000000, 0.35)); // undergrowth
            for (let tx = 6; tx + 8 < w; tx += 16)
              wallG.rect(x + tx, FLOOR_TOP - ht * 0.62, 8, ht * 0.62).fill(skin.mid);
            wallG
              .poly([x, FLOOR_TOP - ht * 0.55, x + w * 0.5, FLOOR_TOP - ht, x + w, FLOOR_TOP - ht * 0.55])
              .fill(lerpC(skin.mid, 0x000000, 0.15));
            wallG.rect(x, FLOOR_TOP - ht * 0.58, w, ht * 0.2).fill(skin.mid);
          } else {
            // facility: server wall, panel by panel
            wallG.rect(x, top, w, ht).fill(skin.mid);
            wallG.rect(x + w - 2, top, 2, ht).fill({ color: 0x000000, alpha: 0.3 });
            for (let py = top + 10; py + 18 < FLOOR_TOP; py += 22) {
              wallG.rect(x + 5, py, w - 10, 16).fill(lerpC(skin.mid, 0x000000, 0.25));
              wallG.rect(x + 8, py + 3, 3, 3).fill({ color: skin.accent, alpha: 0.8 });
              if (h01(i * 7 + py) > 0.5) wallG.rect(x + 14, py + 3, 3, 3).fill({ color: C.red, alpha: 0.6 });
            }
            wallG.rect(x, FLOOR_TOP - 8, w, 8).fill(lerpC(skin.mid, 0x000000, 0.35)); // skirting
          }
          x += w;
        }
        i++;
      }
    }
    // mid layer: sparse distant silhouettes peeking ABOVE the wall roofline
    // (0.45 parallax; gaps are correct at distance)
    midG.clear();
    for (const old of midSpr.removeChildren()) old.destroy();
    for (let x = 30, i = 0; x < midW; i++) {
      const ht = 150 + h01(i * 11) * 70;
      if (kind === "forest") {
        midG
          .poly([x, FLOOR_TOP - ht * 0.5, x + 30, FLOOR_TOP - ht, x + 60, FLOOR_TOP - ht * 0.5])
          .fill({ color: skin.mid, alpha: 0.55 });
      } else {
        midG.rect(x, FLOOR_TOP - ht, 46, ht).fill({ color: skin.mid, alpha: 0.55 });
        if (kind === "streets") midG.rect(x + 8, FLOOR_TOP - ht + 8, 30, 4).fill({ color: skin.accent, alpha: 0.2 });
      }
      x += 150 + h01(i * 13 + 4) * 100;
    }
    // ── THE GROUND (round 4, Mike: "the wood flooring doesn't make sense
    //    outside"). The old band - flat brown + plank lines + diagonal
    //    seams - read as parquet. Street dressing per skin now, all vector,
    //    all in the skin palette: L1 an asphalt roadway with a jointed
    //    sidewalk + kerb along the band's back line, faded lane dashes,
    //    manholes, patches and cracks; L2 a beaten dirt path, grass tufts
    //    breaking both edges; L3 riveted deck plating with a hazard strip
    //    and cooling grates. The 3 faint depth lines stay on every skin -
    //    the y-lanes must keep reading. ────────────────────────────────────
    groundG.clear();
    const gw = levelW + 80;
    const bandH = FLOOR_BOT - FLOOR_TOP;
    groundG.rect(0, FLOOR_TOP, gw, DESIGN_H - FLOOR_TOP).fill(skin.ground);
    if (kind === "streets") {
      const SW = 22; // sidewalk depth to the kerb
      groundG.rect(0, FLOOR_TOP, gw, SW).fill(lerpC(skin.ground, 0xffffff, 0.1));
      for (let x = 0; x < gw; x += 46) groundG.rect(x, FLOOR_TOP, 1.5, SW).fill({ color: 0x000000, alpha: 0.22 }); // paving joints
      groundG.rect(0, FLOOR_TOP + SW, gw, 2.5).fill(lerpC(skin.ground, 0xffffff, 0.25)); // kerb face
      groundG.rect(0, FLOOR_TOP + SW + 2.5, gw, 3).fill({ color: 0x000000, alpha: 0.35 }); // kerb shadow
      const laneY = FLOOR_TOP + bandH * 0.62;
      for (let x = 0; x < gw; x += 64) groundG.rect(x, laneY, 30, 3).fill({ color: 0xd8d2c4, alpha: 0.14 }); // faded lane dashes
      for (let i = 0; i < gw / 90; i++) {
        const px = i * 90 + h01(i * 3) * 50;
        const py = FLOOR_TOP + SW + 12 + h01(i * 7 + 1) * (bandH - SW - 34);
        if (h01(i * 11 + 2) > 0.6)
          groundG.rect(px, py, 34 + h01(i) * 30, 14 + h01(i * 5) * 10).fill({ color: 0x000000, alpha: 0.1 }); // resurfaced patch
        if (h01(i * 13 + 3) > 0.72) {
          groundG
            .ellipse(px, py, 11, 4.5)
            .fill(lerpC(skin.ground, 0x000000, 0.3))
            .stroke({ width: 1.2, color: lerpC(skin.ground, 0xffffff, 0.18) }); // manhole
          groundG.ellipse(px, py, 6.5, 2.6).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        }
        if (h01(i * 17 + 4) > 0.62) {
          let cx = px - 14;
          let cy = py + 6;
          groundG.moveTo(cx, cy);
          for (let k = 0; k < 4; k++) {
            cx += 7 + h01(i * 19 + k) * 8;
            cy += (h01(i * 23 + k) - 0.5) * 8;
            groundG.lineTo(cx, cy);
          }
          groundG.stroke({ width: 1, color: 0x000000, alpha: 0.28 }); // crack
        }
      }
      for (let x = 60; x < gw; x += 240 + 60 * h01(x))
        groundG.roundRect(x, FLOOR_TOP + SW + 7, 26, 5, 2).fill({ color: 0x000000, alpha: 0.5 }); // storm drains against the kerb
    } else if (kind === "forest") {
      // the walked heart of the path is lighter packed earth
      groundG.rect(0, FLOOR_TOP + 26, gw, bandH - 44).fill(lerpC(skin.ground, 0xffffff, 0.06));
      for (let i = 0; i < gw / 40; i++) {
        const px = i * 40 + h01(i * 3) * 26;
        // grass tufts breaking BOTH edges: the band reads as a path through growth
        const ty = h01(i * 5 + 1) > 0.5 ? FLOOR_TOP + 4 + h01(i * 7) * 18 : FLOOR_BOT - 22 + h01(i * 7) * 16;
        for (let b = 0; b < 3; b++) {
          const bx = px + b * 4 - 4;
          groundG
            .moveTo(bx, ty + 6)
            .lineTo(bx + (h01(i * 11 + b) - 0.5) * 5, ty - 4 - h01(i * 13 + b) * 5)
            .stroke({ width: 1.5, color: skin.mid, alpha: 0.8 });
        }
        if (h01(i * 17 + 2) > 0.7)
          groundG
            .ellipse(px, FLOOR_TOP + 30 + h01(i * 19) * (bandH - 56), 5 + h01(i * 23) * 4, 2.5 + h01(i * 23) * 1.6)
            .fill(lerpC(skin.ground, 0xffffff, 0.16)); // half-buried stone
        if (h01(i * 29 + 5) > 0.82)
          groundG.ellipse(px, FLOOR_TOP + 36 + h01(i * 31) * (bandH - 60), 9, 3.5).fill({ color: 0x000000, alpha: 0.12 }); // dark trodden earth
      }
    } else {
      // facility: riveted deck plating
      const plateW = 76;
      for (let x = plateW; x < gw; x += plateW) groundG.rect(x, FLOOR_TOP + 10, 2, DESIGN_H - FLOOR_TOP - 22).fill({ color: 0x000000, alpha: 0.3 }); // plate seams
      for (let i = 1; i <= 2; i++) {
        const y = FLOOR_TOP + (bandH / 3) * i;
        groundG.rect(0, y, gw, 1.5).fill({ color: 0x000000, alpha: 0.3 });
        for (let x = plateW; x < gw; x += plateW) {
          groundG.circle(x - 5, y - 4, 1.4).fill(lerpC(skin.ground, 0xffffff, 0.22)); // rivets at the seam crossings
          groundG.circle(x + 6, y + 4, 1.4).fill(lerpC(skin.ground, 0xffffff, 0.22));
        }
      }
      // hazard chevron strip on the band's back line
      groundG.rect(0, FLOOR_TOP, gw, 9).fill(lerpC(skin.ground, 0x000000, 0.3));
      for (let x = 0; x < gw; x += 24)
        groundG.poly([x, FLOOR_TOP + 9, x + 8, FLOOR_TOP, x + 16, FLOOR_TOP, x + 8, FLOOR_TOP + 9]).fill({ color: C.amberDeep, alpha: 0.5 });
      // cooling grates with a faint accent glow
      for (let i = 0; i < gw / 200; i++) {
        const px = i * 200 + h01(i * 7) * 120;
        const py = FLOOR_TOP + 34 + h01(i * 11 + 1) * (bandH - 58);
        groundG.roundRect(px, py, 34, 12, 2).fill({ color: 0x000000, alpha: 0.35 });
        for (let k = 4; k < 30; k += 6) groundG.rect(px + k, py + 2, 2.5, 8).fill({ color: skin.accent, alpha: 0.16 + 0.18 * h01(i * 13 + k) });
      }
    }
    // the depth lanes (kept on every skin: the y-band must read)
    for (let i = 1; i <= 3; i++) {
      const y = FLOOR_TOP + (bandH / 4) * i;
      groundG.rect(0, y, gw, 1).fill({ color: skin.groundLine, alpha: 0.6 });
    }
    groundG.rect(0, FLOOR_BOT, gw, DESIGN_H - FLOOR_BOT).fill(skin.under);
    groundG.rect(0, FLOOR_TOP, gw, 2).fill({ color: skin.accent, alpha: 0.35 });
  };

  const fitCover = (sp: Sprite, w: number, ht: number) => {
    const tw = sp.texture.width || 1;
    const th = sp.texture.height || 1;
    const sc = Math.max(w / tw, ht / th);
    sp.scale.set(sc);
    sp.position.set(0, 0);
  };

  // ── rig drawing (shared by player + machines; boss has its own) ──────────
  const drawRig = (
    g: Graphics,
    pose: Pose,
    col: { main: number; deep: number; eye: number },
    kind: EnemyKind | "hero",
    opts: { weapon?: "" | "pipe" | "blaster"; white?: number; tellI?: number },
  ) => {
    const white = opts.white ?? 0;
    if (pose.lying) {
      g.roundRect(-22, -13, 44, 12, 6).fill(col.main).stroke({ width: 1.5, color: col.deep });
      g.circle(24, -8, 6.5).fill(col.main).stroke({ width: 1.5, color: col.deep });
      if (white > 0) g.roundRect(-22, -13, 44, 12, 6).fill({ color: C.white, alpha: white });
      return;
    }
    const cr = pose.crouch;
    const lean = pose.lean;
    // limbs first (behind the torso)
    g.moveTo(-4, -26 + cr).lineTo(pose.legB[0], pose.legB[1]).stroke({ width: 4.5, color: col.deep, cap: "round" });
    g.moveTo(-5 + lean * 0.6, -44 + cr).lineTo(pose.armB[0], pose.armB[1] + cr).stroke({ width: 4, color: col.deep, cap: "round" });
    // torso capsule
    const wdt = kind === "charger" ? 15 : kind === "harass" ? 8 : kind === "bomber" ? 13 : 10;
    if (kind === "bomber") {
      g.circle(lean * 0.5, -38 + cr, 15).fill(col.main).stroke({ width: 2, color: col.deep });
    } else {
      g.roundRect(-wdt + lean * 0.5, -54 + cr, wdt * 2, 32, wdt).fill(col.main).stroke({ width: 2, color: col.deep });
    }
    // head by silhouette
    if (kind === "grunt" || kind === "pgrunt" || kind === "blocker") {
      g.roundRect(-7 + lean, -66 + cr, 15, 12, 2).fill(col.main).stroke({ width: 1.5, color: col.deep }); // box head
      g.rect(1 + lean, -62 + cr, 5, 3).fill(col.eye);
    } else if (kind === "thrower" || kind === "bthrower") {
      g.circle(lean, -61 + cr, 7).fill(col.main).stroke({ width: 1.5, color: col.deep });
      g.arc(-6 + lean, -66 + cr, 8, -2.6, -0.6).stroke({ width: 2.5, color: col.eye }); // the dish
      g.circle(3 + lean, -61 + cr, 2).fill(col.eye);
    } else if (kind === "charger") {
      g.roundRect(-9 + lean, -63 + cr, 20, 11, 3).fill(col.main).stroke({ width: 1.5, color: col.deep });
      g.poly([9 + lean, -63 + cr, 16 + lean, -68 + cr, 11 + lean, -58 + cr]).fill(col.deep); // horn
      g.rect(2 + lean, -60 + cr, 5, 3).fill(col.eye);
    } else if (kind === "hero") {
      g.circle(lean, -60 + cr, 7.5).fill(col.main).stroke({ width: 1.5, color: col.deep });
      g.rect(-2 + lean, -62 + cr, 8, 3.5).fill(0x4a3312); // visor band
    } else {
      // harass / bomber: small round head
      g.circle(lean, kind === "bomber" ? -58 + cr : -60 + cr, 6).fill(col.main).stroke({ width: 1.5, color: col.deep });
      g.circle(2 + lean, kind === "bomber" ? -58 + cr : -60 + cr, 2).fill(col.eye);
    }
    // blocker shield plate rides the front
    if (kind === "blocker") {
      g.roundRect(9, -58 + cr, 7, 40, 2).fill(col.deep).stroke({ width: 1.5, color: col.eye });
    }
    // front limbs (over the torso)
    g.moveTo(4, -26 + cr).lineTo(pose.legF[0], pose.legF[1]).stroke({ width: 4.5, color: col.deep, cap: "round" });
    g.moveTo(5 + lean * 0.6, -44 + cr).lineTo(pose.armF[0], pose.armF[1] + cr).stroke({ width: 4, color: col.main, cap: "round" });
    g.circle(pose.armF[0], pose.armF[1] + cr, 3).fill(col.main);
    // carried weapons (visible pipe / blaster - the drop promise made legible)
    const wp = opts.weapon ?? (kind === "pgrunt" ? "pipe" : kind === "bthrower" ? "blaster" : "");
    if (wp === "pipe") {
      const hx = pose.armF[0];
      const hy = pose.armF[1] + cr;
      g.moveTo(hx, hy).lineTo(hx + 16, hy - 14).stroke({ width: 4, color: 0x2c2c30, cap: "round" });
      g.moveTo(hx + 16, hy - 14).lineTo(hx + 19, hy - 17).stroke({ width: 4, color: C.amberDeep, cap: "round" });
    } else if (wp === "blaster") {
      const hx = pose.armF[0];
      const hy = pose.armF[1] + cr;
      g.roundRect(hx - 2, hy - 5, 13, 6, 2).fill(0x2c2c30);
      g.rect(hx + 11, hy - 4, 4, 3).fill(col.eye);
    }
    if (white > 0) {
      if (kind === "bomber") g.circle(lean * 0.5, -38 + cr, 15).fill({ color: C.white, alpha: white });
      else g.roundRect(-wdt + lean * 0.5, -54 + cr, wdt * 2, 34, wdt).fill({ color: C.white, alpha: white });
    }
    // the windup flash ring, intensifying as the tell resolves
    const tellI = opts.tellI ?? 0;
    if (tellI > 0) {
      g.circle(0, -40 + cr, 30 - 14 * tellI).stroke({ width: 3, color: lerpC(col.eye, C.white, tellI), alpha: 0.35 + 0.6 * tellI });
    }
  };

  /** The bosses: bigger bespoke rigs, one silhouette per kind. */
  const drawBoss = (g: Graphics, b: Boss, wallF: number, tellVis: number) => {
    const vuln = b.fsm === "vuln";
    const main = vuln ? 0x4c6455 : C.steel;
    const deep = 0x23262e;
    const aura = BOSS_AURA[((b.attackId % 3) + 3) % 3];
    // tell aura: color IS the read (warp boss doubly so)
    if (b.fsm === "tell" && tellVis > 0) {
      g.circle(0, -46, 58 - 20 * tellVis).stroke({ width: 4, color: aura, alpha: 0.3 + 0.65 * tellVis });
      g.circle(0, -46, 30).fill({ color: aura, alpha: 0.12 + 0.18 * tellVis });
    }
    if (vuln) {
      // the free-hit window: green glow, unmistakable
      const pulse = 0.5 + 0.4 * Math.sin(wallF * 0.3);
      g.circle(0, -44, 52).stroke({ width: 4, color: C.green, alpha: pulse });
    }
    if (b.kind === "charge") {
      // BULLRIG: wide low chassis, ram plate front, tread base
      g.roundRect(-34, -18, 68, 14, 5).fill(deep).stroke({ width: 2, color: 0x3a4152 });
      g.roundRect(-30, -56, 56, 42, 10).fill(main).stroke({ width: 2, color: 0x4a5468 });
      g.poly([26, -60, 44, -44, 44, -18, 26, -14]).fill(0x4a5468).stroke({ width: 2, color: deep }); // the ram plate
      g.roundRect(-16, -70, 24, 14, 4).fill(main).stroke({ width: 2, color: deep });
      g.rect(0, -66, 7, 4).fill(b.fsm === "tell" ? aura : C.red);
      if (b.fsm === "attack") {
        for (let i = 0; i < 3; i++) g.moveTo(-40 - i * 14, -46 + i * 12).lineTo(-62 - i * 16, -46 + i * 12).stroke({ width: 3, color: C.white, alpha: 0.3 });
      }
    } else if (b.kind === "limbs") {
      // LONGARM: tall frame, two oversized arms
      g.roundRect(-16, -84, 32, 62, 12).fill(main).stroke({ width: 2, color: 0x4a5468 });
      g.roundRect(-11, -96, 22, 15, 4).fill(main).stroke({ width: 2, color: deep });
      g.rect(-4, -91, 9, 4).fill(b.fsm === "tell" ? aura : C.red);
      const armExt = b.fsm === "attack" && b.attackId === 0 ? 70 : 16;
      g.moveTo(12, -70).lineTo(24 + armExt, -34).stroke({ width: 9, color: deep, cap: "round" });
      g.circle(24 + armExt, -34, 8).fill(0x4a5468).stroke({ width: 2, color: deep });
      g.moveTo(-12, -70).lineTo(-26, -30).stroke({ width: 9, color: deep, cap: "round" });
      g.circle(-26, -30, 8).fill(0x4a5468).stroke({ width: 2, color: deep });
      g.moveTo(-8, -22).lineTo(-10, 0).stroke({ width: 6, color: deep, cap: "round" });
      g.moveTo(8, -22).lineTo(10, 0).stroke({ width: 6, color: deep, cap: "round" });
    } else {
      // FLICKER: slim hooded rig, hovers; aura ring always faintly on
      const bob = Math.sin(wallF * 0.12) * 3;
      g.circle(0, -44 + bob, 34).stroke({ width: 2, color: C.violet, alpha: 0.18 });
      g.poly([-14, -14 + bob, 0, -88 + bob, 14, -14 + bob]).fill(main).stroke({ width: 2, color: 0x4a5468 });
      g.roundRect(-9, -78 + bob, 18, 14, 6).fill(deep);
      g.rect(-5, -73 + bob, 10, 3.5).fill(b.fsm === "tell" ? aura : C.violet);
      g.moveTo(-10, -52 + bob).lineTo(-22, -30 + bob).stroke({ width: 5, color: deep, cap: "round" });
      g.moveTo(10, -52 + bob).lineTo(22, -30 + bob).stroke({ width: 5, color: deep, cap: "round" });
    }
  };

  return {
    resize(cssW, cssH, dpr, simW, simH) {
      stage.resize(cssW, cssH, dpr, simW, simH);
      mem.lastSimW = simW;
    },
    destroy() {
      stage.destroy();
    },
    render(s, view) {
      // ── run restart detection: wallF went backwards -> reset page memory ──
      if (s.wallF < mem.lastWallF) {
        mem.fx.length = 0;
        mem.doorOpen.clear();
        mem.doorOpenAt.clear();
        mem.seen = new WeakSet<Enemy>();
        mem.prevHit = s.hitCount;
        mem.prevHurt = s.hurtCount;
        mem.prevKo = s.koCount;
        mem.prevPickup = s.pickupCount;
        mem.hitFlashT = 0;
        mem.hurtT = 0;
        mem.hpPopT = 0;
        mem.shakeT = 0;
        mem.prevSlam = false;
        mem.layoutKey = "";
      }
      mem.lastWallF = s.wallF;

      const lvlIdx = Math.max(0, Math.min(2, s.level));
      const lvl: LevelDef | null = LEVEL_SETS[s.setIdx]?.[lvlIdx] ?? null;
      const skin = SKINS[lvl?.skin ?? "facility"];

      // ── statics on level change; the facade count rides the redraw key so
      //    the mid row hot-swaps to art when the async cuts land (door memory
      //    only resets on a REAL level change, not on a texture arriving) ────
      const facades = facadeTex[lvlIdx].filter((t): t is Texture => t !== null);
      const key = `${s.setIdx}:${lvlIdx}:${s.levelW}:f${facades.length}`;
      if (mem.layoutKey !== key) {
        const levelChanged = mem.layoutKey.split(":f")[0] !== `${s.setIdx}:${lvlIdx}:${s.levelW}`;
        mem.layoutKey = key;
        if (levelChanged) {
          mem.doorOpen.clear();
          mem.doorOpenAt.clear();
        }
        drawStatics(lvl, s.levelW, facades);
      }
      // painted far plate hot-swap (suppress the vector sky when it lands)
      const want = bgTex[lvlIdx];
      if (want) {
        if (!bgSprite) {
          bgSprite = new stage.pixi.Sprite(want);
          skyFar.addChild(bgSprite);
        }
        if (bgSprite.texture !== want) bgSprite.texture = want;
        bgSprite.visible = true;
        fitCover(bgSprite, DESIGN_W + 0.15 * Math.max(0, s.levelW - DESIGN_W) + 40, DESIGN_H);
        skyVecG.visible = false;
      } else {
        if (bgSprite) bgSprite.visible = false;
        skyVecG.visible = true;
      }

      // ── parallax + camera (the sim owns camX; we only follow) ─────────────
      skyFar.x = -s.camX * 0.15;
      mid.x = -s.camX * 0.45;
      play.x = -s.camX;

      // ── presentation deltas -> fx ─────────────────────────────────────────
      if (s.hitCount > mem.prevHit) {
        spark(s.lastHitX, s.lastHitY - 36, s.lastHitHeavy);
        mem.hitFlashT = 3;
        if (s.lastHitHeavy) mem.shakeT = Math.max(mem.shakeT, 6);
      }
      if (s.hurtCount > mem.prevHurt) {
        mem.hurtT = 10;
        mem.shakeT = Math.max(mem.shakeT, 8);
      }
      if (s.koCount > mem.prevKo) {
        burst(s.lastKoX, s.lastKoY - 24, 0x8a8f9c, 10, true);
        burst(s.lastKoX, s.lastKoY - 24, C.amber, 4, true);
        mem.shakeT = Math.max(mem.shakeT, 5);
      }
      if (s.pickupCount > mem.prevPickup) {
        if (s.lastPickupKind === "health") {
          // heal read: green burst + the HP bar pop (hpPopT)
          burst(s.p.x, s.p.y - 40, C.green, 8, false);
          mem.hpPopT = 10;
        } else {
          burst(s.p.x, s.p.y - 40, C.amberHi, 6, false);
        }
      }
      // boss-1 piston slam ground-strike: dust + shake the frame it lands
      const slamLive = !!s.boss && s.boss.kind === "charge" && s.boss.fsm === "attack" && s.boss.attackId === 0;
      if (slamLive && !mem.prevSlam && s.boss) {
        burst(s.boss.x + s.boss.face * 55, s.boss.y - 6, C.amberHi, 6, true);
        burst(s.boss.x + s.boss.face * 55, s.boss.y - 6, 0x8a8f9c, 8, true);
        mem.shakeT = Math.max(mem.shakeT, 6);
      }
      mem.prevSlam = slamLive;
      if (s.comboCount > mem.prevCombo) mem.comboPopT = 8;
      mem.prevCombo = s.comboCount;
      mem.prevHit = s.hitCount;
      mem.prevHurt = s.hurtCount;
      mem.prevKo = s.koCount;
      mem.prevPickup = s.pickupCount;
      if (mem.hitFlashT > 0) mem.hitFlashT--;
      if (mem.hurtT > 0) mem.hurtT--;
      if (mem.hpPopT > 0) mem.hpPopT--;
      if (mem.shakeT > 0) mem.shakeT--;
      if (mem.comboPopT > 0) mem.comboPopT--;

      // door-burst detection: a machine we have never seen, standing at a
      // door fixture, means that door just blew open
      const doors = lvl?.fights.flatMap((f) => f.doors) ?? [];
      for (const e of s.enemies) {
        if (mem.seen.has(e)) continue;
        mem.seen.add(e);
        for (const [dx, dy] of doors) {
          if (Math.abs(e.x - dx) < 46 && Math.abs(e.y - dy) < 40) {
            const dk = `${dx},${dy}`;
            if (!mem.doorOpen.has(dk)) {
              // the door blows open ON the frame its thug first stands in it
              // (sim spawns door entries at the fixture itself)
              mem.doorOpen.add(dk);
              mem.doorOpenAt.set(dk, s.wallF);
              burst(dx, dy - 30, skin.groundLine, 12, true);
              burst(dx, dy - 30, skin.accent, 4, true);
            }
          }
        }
      }

      // ── camera shake + hitstop zoom-punch (presentation only) ─────────────
      const jx = mem.shakeT > 0 ? (Math.random() - 0.5) * 7 : 0;
      const jy = mem.shakeT > 0 ? (Math.random() - 0.5) * 4 : 0;
      shakeRoot.position.set(DESIGN_W / 2 + jx, DESIGN_H / 2 + jy);
      shakeRoot.scale.set(s.p.freeze > 0 ? 1.015 : 1);

      // ── doors: the CraftPix Doors pack (props door1/2/3, 6-frame closed->
      //    open flipbook) on the band's back line; vector slabs are the
      //    no-art fallback. The flipbook starts the frame the thug appears
      //    in the doorway (mem.doorOpenAt), so the door opens AS it steps
      //    out - the emergence read Mike asked for. ──────────────────────────
      doorsG.clear();
      const doorFrames = (sheets.props?.animations as Record<string, Texture[]> | undefined)?.[`door${lvlIdx + 1}`];
      if (doorFrames && doorFrames.length > 0) {
        let di = 0;
        for (const [dx, dy] of doors) {
          let spr = doorPool[di];
          if (!spr) {
            spr = new stage.pixi.Sprite();
            // door art is 32x64 centered in the 96 props cell: content bottom
            // sits at cell row (96+64)/2 = 80. Anchoring there lands the
            // slab's foot exactly on the authored back-line y.
            spr.anchor.set(0.5, 80 / 96);
            spr.scale.set(1.2);
            doorsC.addChild(spr);
            doorPool.push(spr);
          }
          const at = mem.doorOpenAt.get(`${dx},${dy}`);
          const idx = at == null ? 0 : Math.min(doorFrames.length - 1, 1 + Math.floor((s.wallF - at) / 4));
          spr.texture = doorFrames[idx] ?? doorFrames[0];
          spr.position.set(dx, dy);
          spr.visible = true;
          di++;
        }
        for (let i = di; i < doorPool.length; i++) doorPool[i].visible = false;
      } else {
        for (const spr of doorPool) spr.visible = false;
        for (const [dx, dy] of doors) {
          const open = mem.doorOpen.has(`${dx},${dy}`);
          doorsG.roundRect(dx - 24, dy - 74, 48, 74, 3).fill(skin.under).stroke({ width: 2.5, color: skin.groundLine });
          if (open) {
            doorsG.rect(dx - 18, dy - 68, 36, 66).fill(0x050403);
            doorsG.poly([dx - 18, dy - 68, dx - 6, dy - 62, dx - 18, dy - 40]).fill(skin.groundLine); // torn panel
          } else {
            doorsG.rect(dx - 18, dy - 68, 36, 66).fill(skin.ground);
            doorsG.rect(dx - 1.5, dy - 68, 3, 66).fill({ color: skin.accent, alpha: 0.5 }); // the seam light
            doorsG.circle(dx + 10, dy - 36, 2.5).fill({ color: C.red, alpha: 0.5 + 0.4 * Math.sin(s.wallF * 0.1) });
          }
        }
      }

      // ── shadows: ground truth at (x, y), shrinking with z ─────────────────
      shadowsG.clear();
      const shadow = (x: number, y: number, base: number, z: number) => {
        const f = Math.max(0.35, 1 - z / 220);
        shadowsG.ellipse(x, y, base * f, base * 0.32 * f).fill({ color: 0x000000, alpha: 0.32 * f });
      };
      shadow(s.p.x, s.p.y, 15, s.p.z);
      for (const e of s.enemies) {
        if (e.fsm === "dead") continue;
        shadow(e.x, e.y, e.kind === "charger" ? 19 : 14, e.z);
      }
      if (s.boss && s.boss.fsm !== "dead") shadow(s.boss.x, s.boss.y, 26, s.boss.z);

      // ── floor fx: lane telegraphs, bomb marks, pickups, walk target ───────
      floorFxG.clear();
      const tellWindow = TELL_FLOOR_F + s.tellLeadF;
      const scrL = s.camX;
      const scrR = s.camX + DESIGN_W;
      for (const e of s.enemies) {
        // charger lane telegraph: the unblockable line, drawn early and long
        if (e.kind === "charger" && e.tellF > 0 && e.tellF <= tellWindow + 16) {
          const a = 0.25 + 0.55 * (1 - Math.min(1, e.tellF / (tellWindow + 16)));
          for (let x = scrL; x < scrR; x += 26) {
            floorFxG.rect(x, e.lane - 1.5, 15, 3).fill({ color: C.red, alpha: a });
          }
          floorFxG.moveTo(scrL, e.lane - 9).lineTo(scrR, e.lane - 9).stroke({ width: 1, color: C.red, alpha: a * 0.5 });
          floorFxG.moveTo(scrL, e.lane + 9).lineTo(scrR, e.lane + 9).stroke({ width: 1, color: C.red, alpha: a * 0.5 });
        }
      }
      // the lane telegraph belongs to the LANE CHARGE ONLY (round 4 fix:
      // it used to draw on every tell, so cycle 1 promised a full-screen
      // lane attack and then... nothing. That was half of Mike's "it just
      // flashes" read on the slam.)
      if (s.boss && s.boss.kind === "charge" && s.boss.fsm === "tell" && s.boss.attackId === 2) {
        const bi = s.boss.fsmDur > 0 ? (s.boss.fsmDur - s.boss.fsmF) / s.boss.fsmDur : 0;
        for (let x = scrL; x < scrR; x += 26) {
          floorFxG.rect(x, s.boss.lane - 2, 15, 4).fill({ color: C.red, alpha: 0.2 + 0.6 * bi });
        }
      }
      // BULLRIG'S PISTON SLAM (boss-1 attack 0, the round-4 "just a flash"
      // fix): the slam zone IS the sim's own hit window (rel -14..84 along
      // facing, |dy| <= 16) - it warms red through the tell, then flashes
      // amber with shock rings while the active frames are live. Telegraph
      // AND payoff, exactly where the hitbox is - never art-only.
      if (s.boss && s.boss.kind === "charge" && s.boss.attackId === 0 && (s.boss.fsm === "tell" || s.boss.fsm === "attack")) {
        const b = s.boss;
        const bp = b.fsmDur > 0 ? (b.fsmDur - b.fsmF) / b.fsmDur : 0;
        const x0 = b.x + b.face * -14;
        const x1 = b.x + b.face * 84;
        const lx = Math.min(x0, x1);
        const wpx = Math.abs(x1 - x0);
        if (b.fsm === "tell") {
          floorFxG.rect(lx, b.y - 16, wpx, 32).fill({ color: C.red, alpha: 0.06 + 0.16 * bp });
          floorFxG.rect(lx, b.y - 16, wpx, 32).stroke({ width: 1.5, color: C.red, alpha: 0.25 + 0.45 * bp });
        } else {
          floorFxG.rect(lx, b.y - 16, wpx, 32).fill({ color: C.amber, alpha: 0.22 * (1 - bp) });
          const ix = b.x + b.face * 58;
          const r = 12 + 60 * bp;
          floorFxG.ellipse(ix, b.y, r, r * 0.34).stroke({ width: 3.5, color: C.amberHi, alpha: 0.85 * (1 - bp) });
          floorFxG.ellipse(ix, b.y, r * 0.55, r * 0.19).stroke({ width: 2.5, color: C.white, alpha: 0.7 * (1 - bp) });
        }
      }
      // bomb marks: drawn from launch at the authored (tx, ty) - the dodge is
      // knowable, never reactive (the stopclock arc contract)
      for (const b of s.bombs) {
        if (b.dead) continue;
        const rem = Math.hypot(b.tx - b.x, b.ty - b.y);
        const p = Math.max(0, Math.min(1, 1 - rem / Math.max(1, b.arcLen)));
        const pulse = 0.45 + 0.3 * Math.sin(s.wallF * 0.2);
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
          floorFxG.arc(b.tx, b.ty, 16, a, a + Math.PI / 11).stroke({ width: 2, color: C.redDeep, alpha: pulse });
        }
        floorFxG.circle(b.tx, b.ty, 3 + 10 * p).fill({ color: C.red, alpha: 0.15 + 0.3 * p });
        floorFxG.moveTo(b.tx - 8, b.ty).lineTo(b.tx + 8, b.ty).stroke({ width: 1.5, color: C.redDeep, alpha: 0.6 });
        floorFxG.moveTo(b.tx, b.ty - 8).lineTo(b.tx, b.ty + 8).stroke({ width: 1.5, color: C.redDeep, alpha: 0.6 });
      }
      // pickups: flat on the belt with a pulsing claim ring
      for (const pk of s.pickups) {
        if (pk.taken) continue;
        const pr = 13 + 1.6 * Math.sin(s.wallF * 0.12);
        floorFxG.circle(pk.x, pk.y, pr).stroke({ width: 1.6, color: pk.kind === "health" ? C.green : C.amber, alpha: 0.5 });
        if (pk.kind === "pipe") {
          floorFxG.moveTo(pk.x - 9, pk.y + 3).lineTo(pk.x + 7, pk.y - 6).stroke({ width: 4, color: 0x2c2c30, cap: "round" });
          floorFxG.moveTo(pk.x + 7, pk.y - 6).lineTo(pk.x + 10, pk.y - 8).stroke({ width: 4, color: C.amberDeep, cap: "round" });
        } else if (pk.kind === "blaster") {
          floorFxG.roundRect(pk.x - 8, pk.y - 5, 14, 6, 2).fill(0x2c2c30);
          floorFxG.rect(pk.x + 6, pk.y - 4, 4, 3).fill(0x58d6f2);
          floorFxG.rect(pk.x - 6, pk.y + 1, 3, 4).fill(0x2c2c30);
        } else {
          // the med kit: white case, green cross - the one pickup that is
          // never a weapon, so it never wears amber
          floorFxG.roundRect(pk.x - 9, pk.y - 7, 18, 13, 2.5).fill(0xe8e4da).stroke({ width: 1.2, color: 0x8a8f9c });
          floorFxG.rect(pk.x - 5.5, pk.y - 2.5, 11, 4).fill(C.green);
          floorFxG.rect(pk.x - 2, pk.y - 6, 4, 11).fill(C.green);
        }
      }
      // walk-target marker under a DRAGGED pointer only (CLICK LAW v3: an
      // undragged press is a pending punch, and a walk ring under it would
      // promise movement the sim will never make)
      if (view.pointer?.down && s.pressDragged) {
        const ty = Math.max(FLOOR_TOP + 6, Math.min(FLOOR_BOT, view.pointer.y));
        floorFxG.circle(view.pointer.x, ty, 7).stroke({ width: 1.5, color: skin.accent, alpha: 0.5 });
      }

      // ── actors (painter's sort by y) ──────────────────────────────────────
      actorUsed = 0;
      // the player
      {
        const p = s.p;
        const a = takeActor();
        a.c.position.set(p.x, p.y - p.z);
        a.c.zIndex = p.y;
        a.c.scale.x = p.face;
        a.c.scale.y = 1;
        const prog = p.fsmDur > 0 ? (p.fsmDur - p.fsmF) / p.fsmDur : 0;
        const cycle = s.wallF * (p.fsm === "run" ? 0.42 : 0.26);
        const pose = poseFor(p.fsm, p.attackId, prog, cycle);
        const blink = p.iframes > 0 && Math.floor(s.wallF / 3) % 2 === 0;
        a.c.alpha = blink ? 0.55 : 1;
        // sheet frame off the same clock the hitbox runs on; vector rig when
        // no sheet (or no frames) has landed
        let hAnim = "idle";
        let hF01 = s.wallF * 0.016;
        let hCyc = true;
        if (p.fsm === "walk") hF01 = cycle / (Math.PI * 2);
        else if (p.fsm === "run") hF01 = cycle / (Math.PI * 2);
        else if (p.fsm === "attack" || p.fsm === "jumpatk") {
          hAnim = p.attackId || "jab1";
          hF01 = prog;
          hCyc = false;
        } else if (p.fsm === "jump") {
          hAnim = "jump";
          hF01 = prog;
          hCyc = false;
        } else if (p.fsm === "hit") {
          hAnim = "hurt";
          hF01 = prog;
          hCyc = false;
        } else if (p.fsm === "down") {
          hAnim = "down";
          hF01 = 1;
          hCyc = false;
        } else if (p.fsm === "getup") {
          hAnim = "rise";
          hF01 = prog;
          hCyc = false;
        }
        if (p.fsm === "walk" || p.fsm === "run") hAnim = p.fsm === "run" ? "run" : "walk";
        if (dressSprite(a, "hero", hAnim, hF01, hCyc)) {
          if (p.fsm === "hit") a.g.ellipse(0, -30, 17, 26).fill({ color: C.white, alpha: 0.35 });
        } else {
          drawRig(a.g, pose, { main: C.amber, deep: C.amberDeep, eye: 0x4a3312 }, "hero", {
            weapon: p.weapon,
            white: p.fsm === "hit" ? 0.5 : 0,
          });
        }
        // dash/run motion streaks
        if (p.fsm === "run" || p.attackId === "dash") {
          for (let i = 0; i < 3; i++) {
            a.g.moveTo(-16 - i * 8, -20 - i * 12).lineTo(-30 - i * 10, -20 - i * 12).stroke({ width: 2.5, color: C.amberHi, alpha: 0.28 });
          }
        }
      }
      // the machines
      for (const e of s.enemies) {
        if (e.fsm === "dead") continue;
        const a = takeActor();
        a.c.position.set(e.x, e.y - e.z);
        a.c.zIndex = e.y;
        a.c.scale.x = e.face;
        a.c.scale.y = 1;
        const prog = e.fsmDur > 0 ? (e.fsmDur - e.fsmF) / e.fsmDur : 0;
        const pose = poseFor(e.fsm, "", prog, s.wallF * 0.24);
        const col = KIND_ART[e.kind];
        // ENTRY WARMTH: visible, shootable, harmless - the fairness ring
        if (e.warmF > 0) {
          const grow = Math.max(0, Math.min(1, e.warmF / ENTRY_WARM_F));
          a.g.circle(0, -34, 14 + 26 * grow).stroke({ width: 2.5, color: col.eye, alpha: 0.7 });
          a.c.alpha = 0.85;
        }
        // the windup tell, visible inside the Sensors-widened window only
        const tellI = e.tellF > 0 && e.tellF <= tellWindow ? 1 - e.tellF / tellWindow : 0;
        const victim = mem.hitFlashT > 0 && Math.abs(e.x - s.lastHitX) < 52 && Math.abs(e.y - s.lastHitY) < 40;
        // sheet frame off the fsm clock; the tell ring stays VECTOR on top
        // (a gameplay signal never moves into art)
        let eAnim = "idle";
        let eF01 = s.wallF * 0.016;
        let eCyc = true;
        if (e.fsm === "enter" || e.fsm === "approach" || e.fsm === "strafe") {
          eAnim = "walk";
          eF01 = s.wallF * 0.04;
        } else if (e.fsm === "windup") {
          eAnim = "attack";
          eF01 = prog * 0.5;
          eCyc = false;
        } else if (e.fsm === "attack") {
          eAnim = "attack";
          eF01 = 0.5 + prog * 0.5;
          eCyc = false;
        } else if (e.fsm === "stun" || e.fsm === "down" || e.fsm === "getup") {
          eAnim = "hurt";
          eF01 = 1;
          eCyc = false;
        }
        if (dressSprite(a, CHAR_FOR[e.kind], eAnim, eF01, eCyc)) {
          if (victim) a.g.ellipse(0, -28, 16, 24).fill({ color: C.white, alpha: 0.5 });
          if (tellI > 0) a.g.circle(0, -34, 24).stroke({ width: 3, color: col.eye, alpha: 0.25 + 0.65 * tellI });
        } else {
          drawRig(a.g, pose, col, e.kind, { white: victim ? 0.7 : 0, tellI });
        }
        if (e.fsm === "stun") {
          for (let i = 0; i < 3; i++) {
            const sa = s.wallF * 0.2 + (i * Math.PI * 2) / 3;
            a.g.circle(Math.cos(sa) * 13, -68 + Math.sin(sa) * 4, 2).fill(C.amberHi);
          }
        }
      }
      // the boss
      if (s.boss && s.boss.fsm !== "dead") {
        const b = s.boss;
        const a = takeActor();
        a.c.position.set(b.x, b.y - b.z);
        a.c.zIndex = b.y;
        a.c.scale.x = b.face;
        a.c.scale.y = 1;
        const bossWindow = BOSS_TELL_FLOOR_F + s.tellLeadF;
        const tellVis = b.fsm === "tell" && b.fsmF <= bossWindow ? 1 - b.fsmF / bossWindow : 0;
        const victim = mem.hitFlashT > 0 && Math.abs(b.x - s.lastHitX) < 60 && Math.abs(b.y - s.lastHitY) < 48;
        // 128px boss cells off the fsm clock; aura + vuln stay VECTOR signals
        const bossKey = `boss-${Math.min(3, s.level + 1)}` as CharKey;
        let bAnim = "idle";
        let bF01 = s.wallF * 0.016;
        let bCyc = true;
        const atkAnim = ["attack", "attack2", "attack3"][b.attackId] ?? "attack";
        if (b.fsm === "tell") {
          bAnim = atkAnim;
          bF01 = (b.fsmDur > 0 ? (b.fsmDur - b.fsmF) / b.fsmDur : 0) * 0.5;
          bCyc = false;
        } else if (b.fsm === "attack") {
          bAnim = atkAnim;
          bF01 = 0.5 + (b.fsmDur > 0 ? (b.fsmDur - b.fsmF) / b.fsmDur : 0) * 0.5;
          bCyc = false;
        } else if (b.fsm === "vuln") {
          bAnim = "stun";
          bF01 = s.wallF * 0.03;
        } else if (b.fsm === "recover") {
          bAnim = "hurt";
          bF01 = 1;
          bCyc = false;
        }
        if (dressSprite(a, bossKey, bAnim, bF01, bCyc)) {
          if (tellVis > 0)
            a.g.circle(0, -44, 40).stroke({ width: 4, color: BOSS_AURA[b.attackId] ?? C.red, alpha: 0.25 + 0.6 * tellVis });
          if (b.fsm === "vuln")
            a.g
              .circle(0, -44, 44 + 3 * Math.sin(s.wallF * 0.25))
              .stroke({ width: 3.5, color: 0x66e29a, alpha: 0.85 });
          if (victim) a.g.roundRect(-30, -80, 60, 66, 12).fill({ color: C.white, alpha: 0.45 });
        } else {
          drawBoss(a.g, b, s.wallF, tellVis);
          if (victim) a.g.roundRect(-30, -80, 60, 66, 12).fill({ color: C.white, alpha: 0.45 });
        }
        // the piston slam payoff on the BODY (both dress paths - the atlas'
        // 4-frame attack strip alone never read as an attack): twin rams
        // punch out across the hit window and snap back, impact star at
        // full extension. Local +x flips with face like the hitbox does.
        if (b.kind === "charge" && b.fsm === "attack" && b.attackId === 0) {
          const bp = b.fsmDur > 0 ? (b.fsmDur - b.fsmF) / b.fsmDur : 0;
          const ext = Math.sin(Math.min(1, bp) * Math.PI);
          const px2 = 26 + 56 * ext;
          a.g.moveTo(22, -46).lineTo(px2, -42).stroke({ width: 7, color: 0x4a5468, cap: "round" });
          a.g.moveTo(22, -28).lineTo(px2 + 5, -30).stroke({ width: 7, color: 0x3a4152, cap: "round" });
          a.g.roundRect(px2 - 2, -52, 10, 30, 3).fill(0x5a6478).stroke({ width: 1.5, color: 0x23262e });
          if (ext > 0.4) {
            const sr = 9 + 7 * ext;
            const sx = px2 + 11;
            const sy = -38;
            a.g
              .poly([sx - sr, sy, sx - sr * 0.25, sy - sr * 0.25, sx, sy - sr, sx + sr * 0.25, sy - sr * 0.25, sx + sr, sy, sx + sr * 0.25, sy + sr * 0.25, sx, sy + sr, sx - sr * 0.25, sy + sr * 0.25])
              .fill({ color: C.white, alpha: 0.55 + 0.35 * ext });
          }
        }
      }
      for (let i = actorUsed; i < actorPool.length; i++) actorPool[i].c.visible = false;

      // ── projectiles ───────────────────────────────────────────────────────
      projG.clear();
      // LONGARM's chest laser: a beam you JUMP - drawn the full locked screen
      if (s.boss && s.boss.kind === "limbs" && s.boss.fsm === "attack" && s.boss.attackId === 1) {
        const by = s.boss.y - 30;
        projG.moveTo(scrL, by).lineTo(s.boss.x, by).stroke({ width: 7, color: C.red, alpha: 0.85 });
        projG.moveTo(scrL, by).lineTo(s.boss.x, by).stroke({ width: 2.5, color: 0xffd9c4, alpha: 0.95 });
      }
      for (const b of s.bolts) {
        if (b.dead) continue;
        const vl = Math.hypot(b.vx, b.vy) || 1;
        const tx = -b.vx / vl;
        const ty = -b.vy / vl;
        const by = b.y - b.z;
        if (b.mine) {
          projG.moveTo(b.x + tx * 26, by + ty * 26).lineTo(b.x, by).stroke({ width: 3.5, color: C.amber, alpha: 0.5 });
          projG.circle(b.x, by, 3.4).fill(C.amberHi);
        } else {
          projG.moveTo(b.x + tx * 30, by + ty * 30).lineTo(b.x, by).stroke({ width: 3.5, color: C.red, alpha: 0.55 });
          projG.circle(b.x, by, 3.4).fill(C.redDeep);
        }
      }
      // bombs: shadow at the true point, body lifted along the arc
      for (const b of s.bombs) {
        if (b.dead) continue;
        const rem = Math.hypot(b.tx - b.x, b.ty - b.y);
        const p = Math.max(0, Math.min(1, 1 - rem / Math.max(1, b.arcLen)));
        const alt = 4 * Math.min(90, b.arcLen * 0.25) * p * (1 - p);
        projG.ellipse(b.x, b.y, 6 * (1 - alt / 260), 3 * (1 - alt / 260)).fill({ color: 0x000000, alpha: 0.3 });
        projG.circle(b.x, b.y - alt - 6, 6.5).fill(0x2c2c30).stroke({ width: 2, color: C.redDeep });
        projG.circle(b.x + 2, b.y - alt - 9, 2).fill(C.red);
      }

      // ── page fx particles ─────────────────────────────────────────────────
      fxG.clear();
      mem.fx = mem.fx.filter((f) => f.t > 0);
      for (const f of mem.fx) {
        f.t--;
        f.x += f.vx / 60;
        f.y += f.vy / 60;
        if (f.grav) f.vy += 420 / 60;
        f.vx *= 0.96;
        const al = f.t / f.max;
        if (f.star) {
          // the hitspark: a four-point star that snaps open then fades
          const r = f.size * (1.3 - al * 0.6);
          fxG.poly([f.x - r, f.y, f.x - r * 0.22, f.y - r * 0.22, f.x, f.y - r, f.x + r * 0.22, f.y - r * 0.22, f.x + r, f.y, f.x + r * 0.22, f.y + r * 0.22, f.x, f.y + r, f.x - r * 0.22, f.y + r * 0.22]).fill({ color: f.color, alpha: al });
        } else {
          fxG.rect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size).fill({ color: f.color, alpha: al });
        }
      }

      // ── overlay: hurt flash, hitstop corners, transition dim ──────────────
      overlayG.clear();
      if (mem.hurtT > 0) {
        overlayG.rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: C.red, alpha: (mem.hurtT / 10) * 0.16 });
      }
      if (s.p.freeze > 0) {
        const L = 22;
        overlayG.poly([0, 0, L, 0, 0, L]).fill({ color: 0x000000, alpha: 0.8 });
        overlayG.poly([DESIGN_W, 0, DESIGN_W - L, 0, DESIGN_W, L]).fill({ color: 0x000000, alpha: 0.8 });
        overlayG.poly([0, DESIGN_H, L, DESIGN_H, 0, DESIGN_H - L]).fill({ color: 0x000000, alpha: 0.8 });
        overlayG.poly([DESIGN_W, DESIGN_H, DESIGN_W - L, DESIGN_H, DESIGN_W, DESIGN_H - L]).fill({ color: 0x000000, alpha: 0.8 });
      }
      const showCard = s.transF > 0 || (s.phase === "level" && s.level === 0 && s.t < 3);
      if (showCard) {
        overlayG.rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: 0x000000, alpha: 0.4 });
      }

      // ── HUD ───────────────────────────────────────────────────────────────
      hudG.clear();
      // player HP (pops green for a beat after a health pack)
      hudG.roundRect(14, 14, 146, 12, 6).fill(0x100c08).stroke({ width: 1.5, color: 0x3a2f20 });
      const hpFrac = Math.max(0, Math.min(1, s.p.hp / Math.max(1, s.p.hpMax)));
      if (hpFrac > 0) hudG.roundRect(16, 16, 142 * hpFrac, 8, 4).fill(mem.hpPopT > 0 ? C.green : hpFrac > 0.35 ? C.amber : C.red);
      if (mem.hpPopT > 0)
        hudG.roundRect(12, 12, 150, 16, 8).stroke({ width: 2.5, color: C.green, alpha: mem.hpPopT / 10 });
      // weapon chip
      if (s.p.weapon !== "") {
        hudG.roundRect(14, 32, 88, 18, 9).fill(0x100c08).stroke({ width: 1.5, color: C.amberDeep });
        if (s.p.weapon === "pipe") {
          hudG.moveTo(24, 45).lineTo(36, 37).stroke({ width: 3.5, color: 0xd8d2c4, cap: "round" });
        } else {
          hudG.roundRect(22, 38, 14, 6, 2).fill(0xd8d2c4);
          hudG.rect(34, 39, 3, 3).fill(0x58d6f2);
        }
        weaponT.text = `× ${s.p.weaponUses}`;
        weaponT.visible = true;
        weaponT.position.set(44, 36);
      } else {
        weaponT.visible = false;
      }
      // score
      scoreT.text = `${riotScore(s)}`;
      scoreT.position.set(DESIGN_W - 14 - scoreT.width, 12);
      // combo
      if (s.comboCount >= 2 && s.comboT > 0) {
        comboT.visible = true;
        comboT.text = `${s.comboCount} HITS`;
        comboT.scale.set(1 + mem.comboPopT * 0.045);
        comboT.position.set(DESIGN_W - 14, 32);
      } else {
        comboT.visible = false;
      }
      // boss bar (top center, under the score line)
      if (s.boss && s.boss.fsm !== "dead") {
        const bw = 300;
        const bx = DESIGN_W / 2 - bw / 2;
        bossNameT.visible = true;
        bossNameT.text = BOSS_NAMES[s.boss.kind];
        bossNameT.position.set(DESIGN_W / 2, 18);
        hudG.roundRect(bx, 26, bw, 10, 5).fill(0x100c08).stroke({ width: 1.5, color: s.boss.fsm === "vuln" ? C.green : 0x4a2a24 });
        const bf = Math.max(0, Math.min(1, s.boss.hp / Math.max(1, s.boss.hpMax)));
        if (bf > 0) hudG.roundRect(bx + 2, 28, (bw - 4) * bf, 6, 3).fill(C.red);
      } else {
        bossNameT.visible = false;
      }
      // arena wave counter
      if (s.phase === "arena") {
        waveT.visible = true;
        waveT.text = `WAVE ${s.arenaWave}`;
        waveT.position.set(DESIGN_W / 2, s.boss ? 48 : 22);
      } else {
        waveT.visible = false;
      }
      // level name card
      if (showCard) {
        cardT.visible = true;
        cardSubT.visible = true;
        if (s.phase === "arena" || (s.phase === "transition" && s.bossesDown >= 3)) {
          cardT.text = "THE ARENA";
          cardSubT.text = "IT DOES NOT END";
        } else {
          cardT.text = lvl?.name ?? `STAGE ${lvlIdx + 1}`;
          cardSubT.text = `STAGE ${lvlIdx + 1} OF 3`;
        }
        cardT.position.set(DESIGN_W / 2, 150);
        cardSubT.position.set(DESIGN_W / 2, 176);
      } else {
        cardT.visible = false;
        cardSubT.visible = false;
      }
      // GO arrow: unlocked and the sim says walk on
      if (!s.camLock && s.goF > 0) {
        const pulse = 0.45 + 0.55 * Math.sin(s.wallF * 0.25);
        goT.visible = true;
        goT.alpha = pulse;
        goT.position.set(DESIGN_W - 66, 196);
        for (let i = 0; i < 2; i++) {
          const cx = DESIGN_W - 44 + i * 16;
          hudG.poly([cx, 186, cx + 11, 196, cx, 206]).stroke({ width: 3.5, color: C.amber, alpha: pulse * (1 - i * 0.3) });
        }
      } else {
        goT.visible = false;
      }
      hintT.text = "CLICK: PUNCH · DRAG: MOVE · SPACE: JUMP";
      hintT.position.set(DESIGN_W / 2, DESIGN_H - 6);
      hintT.alpha = s.t < 6 ? 0.9 : Math.max(0, 0.9 - (s.t - 6) * 0.3);

      stage.renderFrame();
    },
  };
}

const scene = (canvas: HTMLCanvasElement) => buildScene(canvas);

/** No-WebGL fallback: flat 2d, fully playable - every gameplay signal
 * (tells, lanes, bomb marks, warm rings, GO, HP) survives here. */
function drawFallback(ctx: CanvasRenderingContext2D, s: RiotState) {
  const lvlIdx = Math.max(0, Math.min(2, s.level));
  const lvl = LEVEL_SETS[s.setIdx]?.[lvlIdx] ?? null;
  const skin = SKINS[lvl?.skin ?? "facility"];
  // sky + ground
  ctx.fillStyle = hex(skin.skyTop);
  ctx.fillRect(0, 0, s.W, FLOOR_TOP);
  ctx.fillStyle = hex(lerpC(skin.skyTop, skin.skyHz, 0.7));
  ctx.fillRect(0, FLOOR_TOP - 70, s.W, 70);
  // the ground, street-appropriate per skin (round 4; scrolls with camX)
  ctx.fillStyle = hex(skin.ground);
  ctx.fillRect(0, FLOOR_TOP, s.W, s.H - FLOOR_TOP);
  if (lvl?.skin === "streets") {
    ctx.fillStyle = hex(lerpC(skin.ground, 0xffffff, 0.1));
    ctx.fillRect(0, FLOOR_TOP, s.W, 22); // sidewalk
    ctx.fillStyle = hex(lerpC(skin.ground, 0xffffff, 0.25));
    ctx.fillRect(0, FLOOR_TOP + 22, s.W, 2.5); // kerb
    ctx.fillStyle = "rgba(216,210,196,0.14)";
    for (let x = -(s.camX % 64); x < s.W; x += 64) ctx.fillRect(x, FLOOR_TOP + (FLOOR_BOT - FLOOR_TOP) * 0.62, 30, 3); // lane dashes
  } else if (lvl?.skin === "forest") {
    ctx.fillStyle = hex(lerpC(skin.ground, 0xffffff, 0.06));
    ctx.fillRect(0, FLOOR_TOP + 26, s.W, FLOOR_BOT - FLOOR_TOP - 44); // the packed path heart
  } else {
    ctx.fillStyle = hex(lerpC(skin.ground, 0x000000, 0.3));
    ctx.fillRect(0, FLOOR_TOP, s.W, 9); // hazard strip base
    ctx.fillStyle = "rgba(160,106,30,0.5)";
    for (let x = -(s.camX % 24); x < s.W; x += 24) ctx.fillRect(x, FLOOR_TOP, 8, 9);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    for (let x = -(s.camX % 76); x < s.W; x += 76) ctx.fillRect(x, FLOOR_TOP + 10, 2, s.H - FLOOR_TOP - 22); // plate seams
  }
  ctx.fillStyle = hex(skin.groundLine);
  for (let i = 1; i <= 3; i++) ctx.fillRect(0, FLOOR_TOP + ((FLOOR_BOT - FLOOR_TOP) / 4) * i, s.W, 1); // depth lanes
  ctx.fillStyle = hex(skin.under);
  ctx.fillRect(0, FLOOR_BOT, s.W, s.H - FLOOR_BOT);

  ctx.save();
  ctx.translate(-s.camX, 0);
  const tellWindow = TELL_FLOOR_F + s.tellLeadF;
  // the wall: contiguous, same law as the Pixi path (no gaps)
  {
    let wx = -20;
    let i = 0;
    while (wx < s.levelW + 60) {
      const w = 58 + h01(i * 5 + 2) * 52;
      const ht = 108 + h01(i * 11) * 52;
      ctx.fillStyle = hex(skin.mid);
      ctx.fillRect(wx, FLOOR_TOP - ht, w, ht);
      ctx.fillStyle = hex(lerpC(skin.mid, 0x000000, 0.25));
      ctx.fillRect(wx + w - 2, FLOOR_TOP - ht, 2, ht);
      ctx.fillRect(wx + 3, FLOOR_TOP - 28, w - 6, 28);
      wx += w;
      i++;
    }
  }
  // doors
  ctx.fillStyle = hex(skin.groundLine);
  for (const f of lvl?.fights ?? []) {
    for (const [dx, dy] of f.doors) ctx.fillRect(dx - 22, dy - 70, 44, 70);
  }
  // charger lanes
  ctx.strokeStyle = hex(C.red);
  ctx.lineWidth = 3;
  for (const e of s.enemies) {
    if (e.kind === "charger" && e.tellF > 0) {
      ctx.beginPath();
      ctx.moveTo(s.camX, e.lane);
      ctx.lineTo(s.camX + s.W, e.lane);
      ctx.stroke();
    }
  }
  // bomb marks + bombs
  for (const b of s.bombs) {
    if (b.dead) continue;
    ctx.strokeStyle = hex(C.redDeep);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.tx, b.ty, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#2c2c30";
    ctx.fillRect(b.x - 5, b.y - 5, 10, 10);
  }
  // pickups (health = white case + green cross, same read as the Pixi path)
  for (const pk of s.pickups) {
    if (pk.taken) continue;
    if (pk.kind === "health") {
      ctx.fillStyle = "#e8e4da";
      ctx.fillRect(pk.x - 9, pk.y - 7, 18, 13);
      ctx.fillStyle = hex(C.green);
      ctx.fillRect(pk.x - 5, pk.y - 2, 10, 4);
      ctx.fillRect(pk.x - 2, pk.y - 5, 4, 10);
    } else {
      ctx.fillStyle = pk.kind === "pipe" ? hex(C.amberDeep) : "#58d6f2";
      ctx.fillRect(pk.x - 7, pk.y - 4, 14, 8);
    }
  }
  // machines: kind-colored rects + tell ring + attack lunge line
  for (const e of s.enemies) {
    if (e.fsm === "dead") continue;
    const col = KIND_ART[e.kind];
    const ex = e.x;
    const ey = e.y - e.z;
    if (e.warmF > 0) {
      ctx.strokeStyle = hex(col.eye);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, ey - 30, 16 + 22 * Math.min(1, e.warmF / ENTRY_WARM_F), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = hex(e.fsm === "down" ? col.deep : col.main);
    if (e.fsm === "down") ctx.fillRect(ex - 20, ey - 12, 40, 12);
    else ctx.fillRect(ex - 11, ey - 60, 22, 60);
    if (e.tellF > 0 && e.tellF <= tellWindow) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ex, ey - 38, 28 - 12 * (1 - e.tellF / tellWindow), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.fsm === "attack") {
      ctx.strokeStyle = hex(col.eye);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ex, ey - 40);
      ctx.lineTo(ex + e.face * 30, ey - 40);
      ctx.stroke();
    }
  }
  // boss
  if (s.boss && s.boss.fsm !== "dead") {
    const b = s.boss;
    ctx.fillStyle = b.fsm === "vuln" ? hex(C.green) : hex(C.steel);
    ctx.fillRect(b.x - 28, b.y - b.z - 84, 56, 84);
    if (b.fsm === "tell") {
      ctx.strokeStyle = hex(BOSS_AURA[((b.attackId % 3) + 3) % 3]);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(b.x, b.y - b.z - 44, 50, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (b.kind === "limbs" && b.fsm === "attack" && b.attackId === 1) {
      ctx.strokeStyle = hex(C.red);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(s.camX, b.y - 30);
      ctx.lineTo(b.x, b.y - 30);
      ctx.stroke();
    }
    // the piston slam zone (boss-1 attack 0): telegraph red, land amber -
    // the same hit window the sim tests (rel -14..84, |dy| <= 16)
    if (b.kind === "charge" && b.attackId === 0 && (b.fsm === "tell" || b.fsm === "attack")) {
      const bp = b.fsmDur > 0 ? (b.fsmDur - b.fsmF) / b.fsmDur : 0;
      const x0 = b.x + b.face * -14;
      const x1 = b.x + b.face * 84;
      ctx.fillStyle = b.fsm === "tell" ? `rgba(255,83,64,${0.08 + 0.18 * bp})` : `rgba(232,163,61,${0.4 * (1 - bp)})`;
      ctx.fillRect(Math.min(x0, x1), b.y - 16, Math.abs(x1 - x0), 32);
      if (b.fsm === "attack") {
        ctx.strokeStyle = hex(C.amberHi);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(b.x + b.face * 58, b.y, (12 + 60 * bp) * 0.34 * 3, (12 + 60 * bp) * 0.34, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  // bolts
  for (const b of s.bolts) {
    if (b.dead) continue;
    ctx.fillStyle = b.mine ? hex(C.amber) : hex(C.red);
    ctx.fillRect(b.x - 3, b.y - b.z - 3, 6, 6);
  }
  // the player: amber capsule + lunge line
  const p = s.p;
  const py = p.y - p.z;
  ctx.fillStyle = p.fsm === "hit" ? "#ffffff" : hex(C.amber);
  if (p.fsm === "down") ctx.fillRect(p.x - 20, py - 12, 40, 12);
  else ctx.fillRect(p.x - 10, py - 62, 20, 62);
  if (p.fsm === "attack" || p.fsm === "jumpatk") {
    const prog = p.fsmDur > 0 ? (p.fsmDur - p.fsmF) / p.fsmDur : 0;
    const ext = Math.sin(Math.min(1, prog) * Math.PI);
    ctx.strokeStyle = hex(C.amberHi);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, py - 42);
    ctx.lineTo(p.x + p.face * (14 + 30 * ext), py - 42);
    ctx.stroke();
  }
  ctx.restore();

  // HUD
  ctx.fillStyle = "#100c08";
  ctx.fillRect(14, 14, 146, 12);
  ctx.fillStyle = hex(C.amber);
  ctx.fillRect(16, 16, 142 * Math.max(0, Math.min(1, p.hp / Math.max(1, p.hpMax))), 8);
  ctx.fillStyle = hex(C.text);
  ctx.font = "12px system-ui";
  const where = s.phase === "arena" ? `WAVE ${s.arenaWave}` : `STAGE ${lvlIdx + 1}`;
  const wpn = p.weapon !== "" ? `  ${p.weapon.toUpperCase()} ×${p.weaponUses}` : "";
  ctx.fillText(`${where}${wpn}  ${riotScore(s)}`, 14, 40);
  if (s.boss && s.boss.fsm !== "dead") {
    ctx.fillStyle = "#100c08";
    ctx.fillRect(s.W / 2 - 150, 26, 300, 10);
    ctx.fillStyle = hex(C.red);
    ctx.fillRect(s.W / 2 - 148, 28, 296 * Math.max(0, s.boss.hp / Math.max(1, s.boss.hpMax)), 6);
    ctx.fillText(BOSS_NAMES[s.boss.kind], s.W / 2 - 24, 20);
  }
  if (!s.camLock && s.goF > 0) {
    ctx.fillStyle = hex(C.amber);
    ctx.font = "bold 16px system-ui";
    ctx.fillText("GO →", s.W - 70, 200);
  }
  if (s.transF > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, s.W, s.H);
    ctx.fillStyle = hex(C.text);
    ctx.font = "bold 26px system-ui";
    const nm = s.phase === "arena" || s.bossesDown >= 3 ? "THE ARENA" : (lvl?.name ?? `STAGE ${lvlIdx + 1}`);
    ctx.fillText(nm, s.W / 2 - ctx.measureText(nm).width / 2, 156);
  }
}
