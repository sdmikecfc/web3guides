/**
 * The Pixi scene for the Domain Kitchen room (ADR-0101/0102/0103/0104). DRAW
 * layer only: reads WorldState every sync(), never mutates it.
 *
 * M4a: furniture sprites are driven by `world.layout`, keyed by placement uid
 * — placing, moving, rotating and storing all fall out of one reconcile pass.
 * Edit mode draws the grid, a lifted ghost, and a validity tint. The M3c
 * theme registry still applies: every furniture sprite resolves its texture
 * through the ACTIVE theme, so styles and layout compose freely.
 *
 * NO-SLIDING lives here on the view side: walk/carry frames are a pure
 * function of walkDist.
 */

import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type Spritesheet,
  type Texture,
} from "pixi.js";
import {
  TILE_H,
  TILE_W,
  WALL_H,
  isoX,
  isoY,
  FURN_BX,
  FURN_BY,
  FURN_H,
  FURN_W,
  FURN2_BX,
  FURN2_BY,
  FURN2_H,
  FURN2_W,
} from "../_engine/iso";
import { itemDef } from "../_engine/items";
import type { Entity, RoomDef, WorldState } from "../_engine/world";
import { fnv1a } from "../_engine/rng";
import type { DkSave } from "../_engine/save";
import { GUEST_LOOKS } from "./preload";

/** the cosmetic crew pick, straight off the save (M7d) */
type CrewLook = DkSave["crew"];
import type {
  GameAssets,
  ItemSetId,
  RoomAssetKey,
  RoomTextures,
  SheetKey,
  ThemeId,
} from "./preload";

export interface EditView {
  /** the placement being dragged (uid), or -1 */
  liftUid: number;
  /** an inventory item being placed, or "" */
  ghostItemId: string;
  /** tile the ghost sits on */
  gx: number;
  gy: number;
  /** false = red tint (placement would be refused) */
  valid: boolean;
  /** which way the piece in hand is turned, so Turn is visible before it lands */
  facing: "se" | "sw";
}

export interface Scene {
  sync: (world: WorldState, edit?: EditView | null) => void;
  resize: (hostW: number, hostH: number, insetTop?: number, insetBottom?: number) => void;
  pick: (px: number, py: number) => { x: number; y: number };
  /** uid of the placed item drawn under this screen point, or -1 */
  pickItem: (px: number, py: number) => number;
  /** entity id whose sprite is drawn under this screen point, or -1 */
  pickEntity: (px: number, py: number) => number;
  spark: (tileX: number, tileY: number, color?: number, n?: number) => void;
  /**
   * The camera (M8b). Needed once the room can be bought up to 18x12, which
   * on a phone fits the whole floor into something you cannot aim a thumb at.
   * `zoomAt` takes screen coordinates so the tile under the finger stays put.
   */
  zoomAt: (factor: number, screenX: number, screenY: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetCamera: () => void;
  /** false at zoom 1, where there is no slack and a drag should do nothing */
  canPan: () => boolean;
  setTheme: (theme: ThemeId) => void;
  /** the restaurant's name on a sign by the door; "" hides it */
  setSign: (name: string) => void;
  /** swap the chef/waiter looks (M7d): textures only, never the sim */
  setCrew: (crew: CrewLook) => void;
  /**
   * Tear the whole scene down (M8b). Needed because the room can now GROW:
   * the floor is a per-tile sprite grid and the walls are sized to the shell,
   * so expanding means building a new scene rather than nudging the old one.
   * Everything hangs off one root container, so this is one destroy.
   */
  destroy: () => void;
}

const WALK_FRAMES_PER_TILE = 8;
const SIT_LIFT = 9;
const CHAR_ANCHOR_Y = 116 / 128;
const DISH_LIFT = 50;

/**
 * WHAT THE ROOM SAYS (M8).
 *
 * The room was full of people who never acknowledged you. Bubbles cost no sim
 * state at all: every one of them is DERIVED from a timer the world already
 * keeps, so nothing is stored, nothing is hashed, and a replay of the same
 * tape shows the same bubbles in the same frames.
 *
 * Which line appears is fnv1a of ids and the day, never Math.random. That is
 * the same law spark() follows (its particle fan is `i / n`, not a roll), and
 * it is what lets dk-shot.mjs take a screenshot twice and get the same picture.
 *
 * Copy rules: plain words, short enough to read at a glance, no em-dashes, and
 * an order line never names a dish, because the sim picks the dish at SERVE
 * time. A bubble that named it would be guessing.
 */
const LINES: Record<string, string[]> = {
  order: [
    "One of your best, please!",
    "Something warm, please.",
    "I heard good things.",
    "It smells great in here.",
  ],
  gus: ["The usual, please.", "My table was waiting for me."],
  // a regular knows the place, so they never say "I heard good things"
  usual: ["The usual, please!", "Good to be back.", "You know what I like."],
  loved: ["So good!", "Worth the trip!", "Five stars from me."],
  fine: ["Thanks!", "That hit the spot.", "Lovely, thank you."],
  wait: ["Is there room yet?", "We can wait a bit.", "It smells worth the wait."],
  ack: ["Yes, chef!", "On it!", "Right away!"],
  cheffy: ["Coming right up!", "Pans are hot!", "Two minutes, chef!"],
};

/** Deterministic pick: a pure function of the world, so replays match. */
function lineFor(bucket: string, id: number, day: number): string {
  const pool = LINES[bucket];
  return pool[fnv1a(`${bucket}.${id}.${day}`) % pool.length];
}

/**
 * Which bubble an entity should be showing right now, or null.
 *
 * Each window opens on a timer the sim already runs and closes on its own, so
 * there is no bubble lifetime to track. `hustleT > 6.6` is the first 1.4s of
 * the 8s hustle, which is exactly when a rallied waiter would answer.
 */
function bubbleFor(e: Entity, day: number): string | null {
  if (e.dead) return null;
  if (e.kind === "guest") {
    if (e.emote === "heart" && e.emoteT > 0.9) return lineFor("loved", e.id, day);
    if (e.emote === "coin" && e.emoteT > 0.9) return lineFor("fine", e.id, day);
    if (e.state === "sit" && e.stateT < 2.5) {
      if (e.name === "Gus") return lineFor("gus", e.id, day);
      if (e.regularIdx >= 0) return lineFor("usual", e.id, day);
      return lineFor("order", e.id, day);
    }
    if (e.state === "wait" && e.stateT < 2.5) return lineFor("wait", e.id, day);
    return null;
  }
  if (e.hustleT > 6.6) return lineFor(e.kind === "chef" ? "cheffy" : "ack", e.id, day);
  return null;
}

const LOCOMOTION: Record<string, boolean> = {
  enter: true,
  leave: true,
  toStove: true,
  toPass: true,
  toTable: true,
  toAnchor: true,
  toBus: true,
  clockOut: true,
  toBench: true,
  toChore: true,
};

function animFor(e: Entity): { name: string; flip: boolean } {
  const front = e.heading === "se" || e.heading === "sw";
  const flip = e.heading === "sw" || e.heading === "nw";
  if (LOCOMOTION[e.state]) {
    const base = e.carrying ? "carry" : "walk";
    const frame = Math.floor(e.walkDist * WALK_FRAMES_PER_TILE) % 4;
    return { name: `${base}_${front ? "f" : "b"}_${frame}`, flip };
  }
  switch (e.state) {
    case "sit":
    case "wait":
      return { name: "sit_0", flip: e.heading === "sw" };
    case "eat":
      return { name: `eat_${Math.floor(e.stateT / 0.45) % 2}`, flip: e.heading === "sw" };
    case "cook":
      return { name: `cook_${Math.floor(e.stateT / 0.7) % 2}`, flip: false };
    case "serve":
      return { name: `carry_${front ? "f" : "b"}_0`, flip };
    case "pickup":
    case "bus":
    case "chore":
      return { name: `walk_${front ? "f" : "b"}_0`, flip };
    case "idle":
    default: {
      const frame = Math.floor(e.stateT / 0.8) % 2;
      if (front) return { name: `idle_f_${frame}`, flip };
      return { name: `idle_b_${frame}`, flip };
    }
  }
}

function darkness(clockHrs: number): number {
  const h = clockHrs;
  if (h >= 8 && h < 17) return 0;
  if (h >= 17 && h < 21) return (h - 17) / 4;
  if (h >= 21 || h < 5) return 1;
  return 1 - (h - 5) / 3;
}

interface SparkP {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: number;
}

/** A furniture sprite bound to a placement. */
interface FurnSprite {
  sprite: Sprite;
  art: RoomAssetKey;
  /** a domain piece keeps its own art set and ignores theme changes */
  artSet?: ItemSetId;
  /** dirty-dish overlay for tables */
  dish?: Sprite;
}

/** Where a placement's sprite sits: multi-cell art registers on its far tile. */
function anchorFor(itemId: string, gx: number, gy: number): { x: number; y: number } {
  const cells = itemDef(itemId)?.cells ?? 1;
  const ax = gx + (cells - 1);
  return { x: isoX(ax, gy), y: isoY(ax, gy) + TILE_H };
}

export function buildScene(
  app: Application,
  room: RoomDef,
  assets: GameAssets,
  initialTheme: ThemeId
): Scene {
  const { themes, itemSets, sheets } = assets;
  let tex: RoomTextures = themes[initialTheme];

  /** Texture for an item: a domain piece uses its fixed set (ADR-0105). */
  function artOf(itemId: string): Texture | undefined {
    const def = itemDef(itemId);
    if (!def) return undefined;
    if (def.artSet) {
      const set = itemSets[def.artSet as ItemSetId];
      return set ? set[def.art as keyof typeof set] : undefined;
    }
    return tex[def.art as RoomAssetKey];
  }

  const root = new Container();
  app.stage.addChild(root);

  const floorC = new Container();
  const gridG = new Graphics();
  const wallC = new Container();
  const decorC = new Container();
  const objC = new Container();
  objC.sortableChildren = true;
  /**
   * CONTACT SHADOWS (M11). Until now the renderer drew none at all — grep for
   * "shadow" and every hit was a CSS box-shadow on a DOM panel. That is the
   * single biggest reason the room read as cut-and-paste: a character with no
   * shadow does not stand on the floor, it hovers over a picture of one.
   *
   * Drawn as one Graphics cleared per frame, the same idiom as lightG/fxGlow,
   * and layered ABOVE decorC so a table casts onto a rug rather than under it.
   * Softness comes from three concentric ellipses instead of a blur filter:
   * cheaper, and it matches the flat baked-art look better than a real blur.
   */
  const shadowG = new Graphics();
  const lightG = new Graphics();
  const fxSteam = new Graphics();
  const fxGlow = new Graphics();
  fxGlow.blendMode = "add";
  // Flames sit ABOVE the day/night wash (lightG) on purpose: a lit burner
  // should read brighter as the room darkens, not get dimmed with everything
  // else. Sprites rather than Graphics, so they use the baked fx atlas.
  const flameC = new Container();
  const uiC = new Container();
  const uiG = new Graphics();
  uiC.addChild(uiG);
  root.addChild(floorC, gridG, wallC, decorC, shadowG, objC, lightG, flameC, fxGlow, fxSteam, uiC);

  // ── floor (fixed shell) ──────────────────────────────────────────────────
  const floorSprites: { sprite: Sprite; art: RoomAssetKey }[] = [];
  for (let gx = 0; gx < room.w; gx++) {
    for (let gy = 0; gy < room.h; gy++) {
      const art: RoomAssetKey = (gx + gy) % 2 === 0 ? "floor" : "floorAlt";
      const s = new Sprite(tex[art]);
      s.anchor.set(0.5, 0);
      s.scale.set(0.5);
      s.position.set(isoX(gx, gy), isoY(gx, gy));
      floorC.addChild(s);
      floorSprites.push({ sprite: s, art });
    }
  }

  /**
   * WALLS. Sized to the shell (M8b): the left wall spans the room's depth and
   * the right wall its width, so a bigger room needs a longer pair. Both are
   * anchored at the room's top corner, which does not move when the room
   * grows, so only the texture changes.
   */
  const wallL = new Sprite(tex.wallLeft[room.h]);
  wallL.anchor.set(1, 0);
  wallL.scale.set(0.5);
  wallL.position.set(0, -WALL_H);
  const wallR = new Sprite(tex.wallRight[room.w]);
  wallR.anchor.set(0, 0);
  wallR.scale.set(0.5);
  wallR.position.set(0, -WALL_H);
  wallC.addChild(wallL, wallR);

  // ── furniture, reconciled from world.layout each sync ────────────────────
  const furn = new Map<number, FurnSprite>();
  /** litter sprites, keyed by the sim's trash id */
  const trashSprites = new Map<number, Sprite>();
  const ghost = new Sprite();
  ghost.alpha = 0.62;
  ghost.visible = false;
  objC.addChild(ghost);

  function makeFurnSprite(itemId: string, facing: string): FurnSprite | null {
    const def = itemDef(itemId);
    if (!def) return null;
    const art = def.art as RoomAssetKey;
    const t = artOf(itemId);
    if (!t) return null;
    const s = new Sprite(t);
    if (def.cells > 1) {
      s.anchor.set(FURN2_BX / FURN2_W, FURN2_BY / FURN2_H);
    } else if (def.kind === "rug" || def.kind === "doormat") {
      s.anchor.set(0.5, 0.5);
    } else {
      s.anchor.set(FURN_BX / FURN_W, FURN_BY / FURN_H);
    }
    const flip = facing === "sw" && def.kind !== "rug" && def.kind !== "doormat";
    s.scale.set(flip ? -0.5 : 0.5, 0.5);
    const entry: FurnSprite = { sprite: s, art, artSet: def.artSet as ItemSetId | undefined };
    if (def.kind === "table") {
      const d = new Sprite(tex.dishes);
      d.anchor.set(0.5, 0.5);
      d.scale.set(0.5);
      d.visible = false;
      entry.dish = d;
      objC.addChild(d);
    }
    if (!def.solid) decorC.addChild(s);
    else objC.addChild(s);
    return entry;
  }

  function syncFurniture(world: WorldState): void {
    const seen = new Set<number>();
    for (const p of world.layout) {
      seen.add(p.uid);
      const def = itemDef(p.itemId);
      if (!def) continue;
      let entry = furn.get(p.uid);
      if (!entry) {
        const made = makeFurnSprite(p.itemId, p.facing);
        if (!made) continue;
        entry = made;
        furn.set(p.uid, entry);
      }
      const s = entry.sprite;
      const flip = p.facing === "sw" && def.kind !== "rug" && def.kind !== "doormat";
      s.scale.set(flip ? -0.5 : 0.5, 0.5);
      const a = anchorFor(p.itemId, p.gx, p.gy);
      if (def.kind === "rug") {
        s.position.set(isoX(p.gx, p.gy), isoY(p.gx, p.gy) + TILE_H);
      } else if (def.kind === "doormat") {
        s.position.set(isoX(p.gx, p.gy), isoY(p.gx, p.gy) + TILE_H / 2);
      } else {
        s.position.set(a.x, a.y);
        s.zIndex = (p.gx + (def.cells - 1) + p.gy) * 10;
      }
      s.alpha = world.editing ? 0.92 : 1;
      s.visible = true;
      if (entry.dish) {
        const t = world.tables.find((tb) => tb.uid === p.uid);
        entry.dish.position.set(a.x, a.y - DISH_LIFT);
        entry.dish.zIndex = (p.gx + p.gy) * 10 + 2;
        entry.dish.visible = !!t && t.dirty > 0;
      }
    }
    furn.forEach((entry, uid) => {
      if (!seen.has(uid)) {
        entry.sprite.destroy();
        entry.dish?.destroy();
        furn.delete(uid);
      }
    });

    // a broken restroom wears its own art (ADR-0106)
    for (const t of world.toilets) {
      const entry = furn.get(t.uid);
      if (!entry) continue;
      entry.sprite.texture = t.broken ? tex.toiletBroken : tex.toilet;
    }

    // litter on the floor
    const seenTrash = new Set<number>();
    for (const t of world.trash) {
      seenTrash.add(t.id);
      let s = trashSprites.get(t.id);
      if (!s) {
        s = new Sprite(tex.trash);
        s.anchor.set(0.5, 0.5);
        s.scale.set(0.5);
        decorC.addChild(s);
        trashSprites.set(t.id, s);
      }
      s.position.set(isoX(t.gx, t.gy), isoY(t.gx, t.gy) + TILE_H / 2 + 4);
    }
    trashSprites.forEach((s, id) => {
      if (!seenTrash.has(id)) {
        s.destroy();
        trashSprites.delete(id);
      }
    });
  }

  function setTheme(theme: ThemeId): void {
    const set = themes[theme];
    if (!set) return;
    tex = set;
    for (const f of floorSprites) f.sprite.texture = set[f.art];
    wallL.texture = set.wallLeft[room.h];
    wallR.texture = set.wallRight[room.w];
    furn.forEach((entry) => {
      // domain pieces keep their own look when the country style changes
      if (!entry.artSet) entry.sprite.texture = set[entry.art];
      if (entry.dish) entry.dish.texture = set.dishes;
    });
    trashSprites.forEach((s) => {
      s.texture = set.trash;
    });
  }

  const windowPts: { x: number; y: number }[] = [];
  for (const gy of room.windowsLeft) {
    windowPts.push({ x: isoX(0, gy + 0.5), y: isoY(0, gy + 0.5) - WALL_H * 0.55 });
  }
  for (const gx of room.windowsRight) {
    windowPts.push({ x: isoX(gx + 0.5, 0), y: isoY(gx + 0.5, 0) - WALL_H * 0.55 });
  }

  // ── characters + chips ───────────────────────────────────────────────────
  const charSprites = new Map<number, Sprite>();
  const chips = new Map<number, Text>();

  /**
   * Which crew looks the player picked (M7d). Purely presentational, so it
   * lives beside the theme rather than in WorldState — putting it in the world
   * would drag a cosmetic into hashWorld. Changing it swaps textures on the
   * existing sprites; nothing about the sim moves.
   */
  let crew: CrewLook = { chef: 0, waiter: 0, chefName: "" };
  function setCrew(next: CrewLook): void {
    crew = next;
    charSprites.forEach((s, id) => {
      const e = lastEntities.get(id);
      if (!e) return;
      const a = animFor(e);
      s.texture = textureFor(sheetFor(e), a.name);
    });
  }
  /** last-seen entities, so setCrew can re-texture without waiting for a tick */
  const lastEntities = new Map<number, Entity>();

  /**
   * Which spritesheet a character wears.
   *
   * Guests get one of GUEST_LOOKS faces derived from two fields the sim
   * ALREADY hashes: the rolled variant (0..7) and the entity id. Doubling the
   * pool this way is a pure view change, so hashWorld stays byte-identical and
   * the harness tapes keep reproducing. Widening the spawn roll instead would
   * have been a sim change for a cosmetic.
   */
  function sheetFor(e: Entity): Spritesheet {
    if (e.kind === "chef") return sheets[`chef${crew.chef}` as SheetKey];
    if (e.kind === "waiter") return sheets[`waiter${crew.waiter}` as SheetKey];
    const look = (e.variant * 2 + (e.id % 2)) % GUEST_LOOKS;
    return sheets[`guest${look}` as SheetKey];
  }
  function textureFor(sheet: Spritesheet, name: string): Texture {
    const t = sheet.textures[name];
    if (t) return t;
    if (name.startsWith("idle_b") && sheet.textures["walk_b_0"]) {
      return sheet.textures["walk_b_0"];
    }
    return (
      sheet.textures["idle_f_0"] ||
      sheet.textures["walk_f_0"] ||
      Object.values(sheet.textures)[0]
    );
  }

  let sparks: SparkP[] = [];
  function spark(tileX: number, tileY: number, color = 0xf3c86a, n = 8): void {
    const cx = (tileX - tileY) * 32;
    const cy = (tileX + tileY) * 16 + TILE_H / 2 - 30;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + 0.4;
      sparks.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * (26 + (i % 3) * 9),
        vy: Math.sin(ang) * (16 + (i % 3) * 6) - 24,
        age: 0,
        life: 0.65,
        color,
      });
    }
  }

  /**
   * Speech bubbles, pooled per entity exactly like the name chips.
   *
   * Pooled and NOT recreated per frame: Pixi Text allocates a texture, so
   * building one every frame for every guest would churn the GPU. Setting
   * `.text` on a handful of live objects is cheap.
   *
   * The tail is drawn into the shared uiG Graphics, which sync() already
   * clears and redraws once a frame, so the bubbles list has to be gathered
   * during the entity walk and drawn after that clear.
   */
  const bubbles = new Map<number, Text>();
  let bubbleTails: { x: number; y: number; w: number; h: number }[] = [];
  function syncBubble(e: Entity, sx: number, sy: number, day: number): void {
    const text = bubbleFor(e, day);
    if (!text) {
      const old = bubbles.get(e.id);
      if (old) {
        old.destroy();
        bubbles.delete(e.id);
      }
      return;
    }
    let t = bubbles.get(e.id);
    if (!t) {
      t = new Text({
        text,
        style: {
          fontFamily: "system-ui, sans-serif",
          fontSize: 11,
          fontWeight: "600",
          fill: 0xf3e9d2,
        },
      });
      t.anchor.set(0.5, 1);
      uiC.addChild(t);
      bubbles.set(e.id, t);
    }
    if (t.text !== text) t.text = text;
    // above the emote slot at -74, so a heart and a line never overlap
    const by = sy - 92;
    t.position.set(sx, by);
    bubbleTails.push({ x: sx, y: by, w: t.width + 14, h: t.height + 8 });
  }

  function syncEntities(world: WorldState): void {
    const seen = new Set<number>();
    bubbleTails = [];
    lastEntities.clear();
    // whichever chef has the lowest id wears the player's chosen name
    let namedChefId = -1;
    for (const e of world.entities) {
      if (e.kind === "chef" && !e.dead && (namedChefId < 0 || e.id < namedChefId)) {
        namedChefId = e.id;
      }
    }
    for (const e of world.entities) {
      seen.add(e.id);
      lastEntities.set(e.id, e);
      let s = charSprites.get(e.id);
      if (!s) {
        s = new Sprite();
        s.anchor.set(0.5, CHAR_ANCHOR_Y);
        objC.addChild(s);
        charSprites.set(e.id, s);
      }
      const sheet = sheetFor(e);
      const { name, flip } = animFor(e);
      s.texture = textureFor(sheet, name);
      s.scale.set(flip ? -0.5 : 0.5, 0.5);
      const seated = e.state === "sit" || e.state === "eat" || e.state === "wait";
      const sx = (e.x - e.y) * 32;
      const sy = (e.x + e.y) * 16 + TILE_H / 2 - (seated ? SIT_LIFT : 0);
      s.position.set(sx, sy);
      s.zIndex = (e.x + e.y) * 10 + 5;

      /**
       * NAME CHIPS. Gus has always had one. M8 gives the same chip to YOUR
       * chef, using the name the player typed in the Crew modal -- which up to
       * now was sanitized, capped, persisted and cloud-synced, and then drawn
       * absolutely nowhere. Only the first chef wears it: with two on the
       * floor, two identical labels reads as a bug rather than a name.
       */
      const label = e.name || (e.id === namedChefId ? crew.chefName : "");
      if (label) {
        let chip = chips.get(e.id);
        if (!chip) {
          chip = new Text({
            text: "",
            style: {
              fontFamily: "system-ui, sans-serif",
              fontSize: 11,
              fontWeight: "800",
              fill: 0xf3e9d2,
              stroke: { color: 0x2a1c14, width: 3 },
              letterSpacing: 1,
            },
          });
          chip.anchor.set(0.5, 1);
          uiC.addChild(chip);
          chips.set(e.id, chip);
        }
        // set every frame so a rename in the Crew modal shows at once
        const up = label.toUpperCase();
        if (chip.text !== up) chip.text = up;
        chip.position.set(sx, sy - 70 - Math.sin(world.ambient.lampPhase * 2) * 2);
      } else if (chips.has(e.id)) {
        chips.get(e.id)!.destroy();
        chips.delete(e.id);
      }

      syncBubble(e, sx, sy, world.day);
    }
    charSprites.forEach((s, id) => {
      if (!seen.has(id)) {
        s.destroy();
        charSprites.delete(id);
      }
    });
    chips.forEach((c, id) => {
      if (!seen.has(id)) {
        c.destroy();
        chips.delete(id);
      }
    });
    bubbles.forEach((b, id) => {
      if (!seen.has(id)) {
        b.destroy();
        bubbles.delete(id);
      }
    });
  }

  // ── camera ───────────────────────────────────────────────────────────────
  const minX = isoX(0, room.h) - 8;
  const maxX = isoX(room.w, 0) + 8;
  const minY = -WALL_H - 6;
  const maxY = isoY(room.w, room.h) + TILE_H + 8;
  const bw = maxX - minX;
  const bh = maxY - minY;
  let curScale = 1;

  /**
   * Fit the room to the view. The host element is the intended source of
   * truth, but it can measure 0 before layout (and stays 0 in a hidden
   * browser pane, where 100dvh collapses), which would leave the camera at
   * scale 0 and paint nothing. The renderer's own screen size is always
   * real, so it is the fallback.
   */
  /**
   * insetTop / insetBottom are the bands the chrome covers.
   *
   * On a phone the chip bar owns the top and three panel bars own the bottom,
   * and centring the room on the FULL viewport parked it behind them with the
   * dead space split evenly above and below. Centring on the band that is
   * actually visible costs nothing and stops the room looking like it is
   * floating in the wrong place. Wide layouts pass zero and behave as before.
   */
  /**
   * THE CAMERA (M8b).
   *
   * Zoom and pan are COMPOSED WITH the fit, never a replacement for it. That
   * matters because resize() runs on every ResizeObserver fire and on every
   * media-query change: if the player's view lived in root.scale/position
   * directly, rotating a phone or opening a panel would silently throw it
   * away. The fit is recomputed from scratch each time and the player's
   * zoom/pan is re-applied on top, so their view survives.
   *
   * `curScale` and `root.position` stay THE canonical transform, which is what
   * keeps pick() correct for free: it inverts exactly those two, so it needs
   * no knowledge that a camera exists at all. Do not introduce a second
   * transform layer.
   */
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 2.6;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  /** the last fit, kept so the camera can be re-applied without a resize */
  let fit = { vw: 0, band: 0, insetTop: 0, scale: 1 };

  function applyCamera(): void {
    curScale = fit.scale * zoom;
    // Clamp the pan so the room can never be dragged off screen. At zoom 1
    // there is no slack in either axis and both clamps collapse to 0, so the
    // fit is exactly what it always was.
    const slackX = Math.max(0, (bw * curScale - fit.vw) / 2);
    const slackY = Math.max(0, (bh * curScale - fit.band) / 2);
    panX = Math.max(-slackX, Math.min(slackX, panX));
    panY = Math.max(-slackY, Math.min(slackY, panY));
    root.scale.set(curScale);
    root.position.set(
      fit.vw / 2 - (minX + bw / 2) * curScale + panX,
      fit.insetTop + fit.band / 2 - (minY + bh / 2) * curScale + panY
    );
  }

  function resize(hostW: number, hostH: number, insetTop = 0, insetBottom = 0): void {
    const vw = hostW > 0 ? hostW : app.screen.width;
    const vh = hostH > 0 ? hostH : app.screen.height;
    if (!(vw > 0) || !(vh > 0)) return;
    const band = Math.max(120, vh - insetTop - insetBottom);
    fit = {
      vw,
      band,
      insetTop,
      scale: Math.min((vw * 0.94) / bw, (band * 0.94) / bh),
    };
    applyCamera();
  }

  /** Zoom about a point in screen space, so the tile under the cursor stays put. */
  function zoomAt(factor: number, sx: number, sy: number): void {
    const before = curScale;
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
    if (next === zoom) return;
    zoom = next;
    // keep the world point under (sx, sy) where it is: the pan has to absorb
    // the difference the scale change introduces at that point
    const ratio = (fit.scale * zoom) / before;
    panX += (sx - root.position.x) * (1 - ratio);
    panY += (sy - root.position.y) * (1 - ratio);
    applyCamera();
  }

  function panBy(dx: number, dy: number): void {
    panX += dx;
    panY += dy;
    applyCamera();
  }

  /**
   * THE DOOR SIGN (CUTE+VIRAL). The player's restaurant name floats on a
   * small plate above the doormat. uiC layer like the name chips, so it never
   * fights the day/night wash; view-only, cannot move hashWorld.
   */
  let signText: Text | null = null;
  function setSign(name: string): void {
    const label = (name || "").trim();
    if (!label) {
      if (signText) {
        signText.destroy();
        signText = null;
      }
      return;
    }
    if (!signText) {
      signText = new Text({
        text: "",
        style: {
          fontFamily: "system-ui, sans-serif",
          fontSize: 15,
          fontWeight: "800",
          fill: 0xffe9c2,
          stroke: { color: 0x5f3a1f, width: 4 },
          letterSpacing: 1.2,
        },
      });
      signText.anchor.set(0.5, 1);
      uiC.addChild(signText);
    }
    signText.text = label.toUpperCase();
    // above the door tile, clear of guests walking in
    signText.position.set(isoX(room.door.x, room.door.y), isoY(room.door.x, room.door.y) - 26);
  }

  function resetCamera(): void {
    zoom = 1;
    panX = 0;
    panY = 0;
    applyCamera();
  }

  const canPan = (): boolean => zoom > 1;

  function pick(px: number, py: number): { x: number; y: number } {
    const lx = (px - root.position.x) / curScale;
    const ly = (py - root.position.y) / curScale - TILE_H / 2;
    return { x: lx / 64 + ly / 32, y: ly / 32 - lx / 64 };
  }

  /**
   * Which PLACED ITEM is under this screen point, or -1.
   *
   * Arrange mode used to lift by TILE: it took the tile under the finger and
   * looked for an item anchored there. That works for a rug and fails for
   * anything tall. A table's sprite is drawn from the BOTTOM of its tile and
   * extends upward roughly a tile and a half, so the tabletop you are aiming
   * at projects to the tile BEHIND the table — you either lifted the chair
   * sitting there or nothing at all, and the table's own floor tile was
   * covered by the table. Hence "I cannot move the original two tables".
   *
   * So hit-test the sprites the player can actually see, frontmost first.
   * Bounding boxes rather than per-pixel: they overlap in an isometric view,
   * which is exactly what the zIndex tiebreak is for — the thing drawn on top
   * is the thing you meant.
   */
  function pickItem(px: number, py: number): number {
    const lx = (px - root.position.x) / curScale;
    const ly = (py - root.position.y) / curScale;
    let bestUid = -1;
    let bestZ = -Infinity;
    furn.forEach((entry, uid) => {
      const s = entry.sprite;
      if (!s.visible || !s.texture) return;
      const w = s.texture.width * Math.abs(s.scale.x);
      const h = s.texture.height * Math.abs(s.scale.y);
      // a flipped sprite mirrors about its anchor, so the anchor swaps sides
      const ax = s.scale.x < 0 ? 1 - s.anchor.x : s.anchor.x;
      const left = s.position.x - ax * w;
      const top = s.position.y - s.anchor.y * h;
      if (lx < left || lx > left + w || ly < top || ly > top + h) return;
      const z = s.zIndex ?? 0;
      if (z >= bestZ) {
        bestZ = z;
        bestUid = uid;
      }
    });
    return bestUid;
  }

  /**
   * Which CHARACTER is under this screen point, or -1.
   *
   * The play-mode twin of pickItem, and the fix for the tap offset Mike felt
   * ("where I click is an inch from where it registers"): verbs picked by
   * projecting the tap to a floor TILE, but a standing character is drawn
   * roughly a full tile above their ground tile, so a natural click on the
   * face or body registered tiles behind them — and the acknowledgement
   * spark landed there too, faithfully marking the wrong spot. The clay cast
   * made it worse: the new figures are nearly all head.
   *
   * Bounding boxes, frontmost wins, same law as pickItem.
   */
  function pickEntity(px: number, py: number): number {
    const lx = (px - root.position.x) / curScale;
    const ly = (py - root.position.y) / curScale;
    let bestId = -1;
    let bestZ = -Infinity;
    charSprites.forEach((s, id) => {
      if (!s.visible || !s.texture) return;
      const w = s.texture.width * Math.abs(s.scale.x);
      const h = s.texture.height * Math.abs(s.scale.y);
      const ax = s.scale.x < 0 ? 1 - s.anchor.x : s.anchor.x;
      const left = s.position.x - ax * w;
      const top = s.position.y - s.anchor.y * h;
      if (lx < left || lx > left + w || ly < top || ly > top + h) return;
      const z = s.zIndex ?? 0;
      if (z >= bestZ) {
        bestZ = z;
        bestId = id;
      }
    });
    return bestId;
  }

  /** iso diamond outline for one tile */
  function tileDiamond(gx: number, gy: number): number[] {
    const x = isoX(gx, gy);
    const y = isoY(gx, gy);
    return [
      x, y,
      x + TILE_W / 2, y + TILE_H / 2,
      x, y + TILE_H,
      x - TILE_W / 2, y + TILE_H / 2,
    ];
  }

  /**
   * One flame sprite per lit stove, pooled by stove index. Flicker runs at
   * ~8fps (0.12s per frame) because a slower cycle reads as a pulsing lamp
   * rather than fire.
   */
  const flameSprites = new Map<number, Sprite>();
  const sizzleSprites = new Map<number, Sprite>();
  function syncFlames(world: WorldState, lit: Map<number, number>): void {
    const dead: number[] = [];
    flameSprites.forEach((s, i) => {
      if (!lit.has(i)) {
        s.destroy();
        dead.push(i);
      }
    });
    dead.forEach((i) => flameSprites.delete(i));
    const deadZ: number[] = [];
    sizzleSprites.forEach((s, i) => {
      if (!lit.has(i)) {
        s.destroy();
        deadZ.push(i);
      }
    });
    deadZ.forEach((i) => sizzleSprites.delete(i));

    lit.forEach((cookT, i) => {
      const stove = world.stovePos[i];
      if (!stove) return;
      let s = flameSprites.get(i);
      if (!s) {
        s = new Sprite(sheets.fx.textures.flame_0);
        s.anchor.set(0.5, 0.5);
        s.scale.set(0.5);
        flameC.addChild(s);
        flameSprites.set(i, s);
      }
      // driven by the COOKING CHEF's own state clock, so two stoves running at
      // once flicker independently instead of in lockstep.
      const tex = sheets.fx.textures[`flame_${Math.floor(cookT / 0.12) % 4}`];
      if (tex) s.texture = tex;
      const p = anchorFor("stove_basic", stove.gx, stove.gy);
      // sits on the burner plate: the stove art puts its hob ~62px above the
      // tile's bottom corner in logical units.
      s.position.set(p.x - 11, p.y - 62);

      /**
       * The sizzle above the pan. These frames were baked in M7 and then
       * never drawn: a third of the fx sheet was downloaded on every boot to
       * be ignored. Slower than the flame (0.18s vs 0.12s) so the two read as
       * separate things rather than one strobing mass.
       */
      let z = sizzleSprites.get(i);
      if (!z) {
        z = new Sprite(sheets.fx.textures.sizzle_0);
        z.anchor.set(0.5, 0.5);
        z.scale.set(0.5);
        flameC.addChild(z);
        sizzleSprites.set(i, z);
      }
      const ztex = sheets.fx.textures[`sizzle_${Math.floor(cookT / 0.18) % 4}`];
      if (ztex) z.texture = ztex;
      z.position.set(p.x - 11, p.y - 78);
    });
  }

  function sync(world: WorldState, edit?: EditView | null): void {
    // self-heal: if the camera never got a real size (host measured 0 before
    // layout), fit to the renderer now rather than rendering nothing forever
    if (!(curScale > 0)) resize(0, 0);
    const a = world.ambient;
    const dark = darkness(world.clockHrs);
    syncFurniture(world);
    syncEntities(world);

    // ── edit mode: grid + ghost ────────────────────────────────────────────
    gridG.clear();
    if (world.editing) {
      // a blueprint wash so edit mode reads instantly, then the tile lattice
      for (let gx = 0; gx < room.w; gx++) {
        for (let gy = 0; gy < room.h; gy++) {
          gridG.poly(tileDiamond(gx, gy)).fill({ color: 0x2b5fa8, alpha: 0.1 });
          gridG.poly(tileDiamond(gx, gy)).stroke({ color: 0xdff0ff, width: 1.4, alpha: 0.34 });
        }
      }
      gridG
        .poly(tileDiamond(room.door.x, room.door.y))
        .fill({ color: 0x6fe3a0, alpha: 0.2 });
    }
    if (edit && (edit.ghostItemId || edit.liftUid >= 0)) {
      const itemId =
        edit.ghostItemId ||
        world.layout.find((p) => p.uid === edit.liftUid)?.itemId ||
        "";
      const def = itemId ? itemDef(itemId) : undefined;
      const ghostTex = itemId ? artOf(itemId) : undefined;
      if (def && ghostTex) {
        ghost.visible = true;
        ghost.texture = ghostTex;
        if (def.cells > 1) ghost.anchor.set(FURN2_BX / FURN2_W, FURN2_BY / FURN2_H);
        else if (def.kind === "rug" || def.kind === "doormat") ghost.anchor.set(0.5, 0.5);
        else ghost.anchor.set(FURN_BX / FURN_W, FURN_BY / FURN_H);
        // the ghost must SHOW its facing, or the Turn button looks broken
        const flat = def.kind === "rug" || def.kind === "doormat";
        const ghostFlip = edit.facing === "sw" && !flat;
        ghost.scale.set(ghostFlip ? -0.5 : 0.5, 0.5);
        const g = anchorFor(itemId, edit.gx, edit.gy);
        ghost.position.set(g.x, g.y);
        ghost.zIndex = 9999;
        ghost.tint = edit.valid ? 0x9effb0 : 0xff9a9a;
        // footprint highlight
        for (let i = 0; i < def.cells; i++) {
          gridG
            .poly(tileDiamond(edit.gx + i, edit.gy))
            .fill({ color: edit.valid ? 0x6fe3a0 : 0xff6b6b, alpha: 0.3 });
        }
        // hide the piece being lifted so the ghost reads as "in hand"
        if (edit.liftUid >= 0) {
          const lifted = furn.get(edit.liftUid);
          if (lifted) lifted.sprite.visible = false;
        }
      }
    } else {
      ghost.visible = false;
    }

    // ── light + glows ──────────────────────────────────────────────────────
    /**
     * CONTACT SHADOWS. Computed straight from world state rather than from the
     * sprites, so nothing depends on which sync ran first, and so a SEATED
     * guest keeps their shadow on the floor instead of lifting it with them
     * (charSprites subtract SIT_LIFT; the floor does not move).
     *
     * Read-only over WorldState like the rest of the view layer: it cannot
     * move hashWorld.
     */
    shadowG.clear();
    /**
     * AMBIENT OCCLUSION along both wall bases. The walls used to meet the
     * floor on a hard line with nothing in the crease, which is the other half
     * of why the room read flat — a real corner is never the same brightness
     * as the middle of the floor.
     *
     * A run of heavily overlapping low-alpha ellipses approximates a gradient
     * that Graphics cannot fill directly. Nudged 0.35 of a tile INTO the room
     * so the band lands on the floor rather than smudging up the wall (shadowG
     * draws above wallC).
     */
    const AO_STEPS = 26;
    for (let i = 0; i <= AO_STEPS; i++) {
      const t = (i / AO_STEPS) * room.w;
      shadowG
        .ellipse(isoX(t, 0.35), isoY(t, 0.35) + TILE_H / 2, 30, 17)
        .fill({ color: 0x241509, alpha: 0.033 });
    }
    for (let i = 0; i <= AO_STEPS; i++) {
      const t = (i / AO_STEPS) * room.h;
      shadowG
        .ellipse(isoX(0.35, t), isoY(0.35, t) + TILE_H / 2, 30, 17)
        .fill({ color: 0x241509, alpha: 0.033 });
    }
    const blob = (x: number, y: number, rx: number, ry: number, base: number) => {
      shadowG.ellipse(x, y, rx * 1.35, ry * 1.35).fill({ color: 0x2a1a10, alpha: base * 0.45 });
      shadowG.ellipse(x, y, rx, ry).fill({ color: 0x2a1a10, alpha: base * 0.75 });
      shadowG.ellipse(x, y, rx * 0.62, ry * 0.62).fill({ color: 0x241509, alpha: base });
    };
    for (const p of world.layout) {
      const def = itemDef(p.itemId);
      // flat decor lies ON the floor, so it has nothing to cast
      if (!def || !def.solid) continue;
      const cx = isoX(p.gx, p.gy) + ((def.cells - 1) * 32) / 2;
      const cy = isoY(p.gx, p.gy) + TILE_H / 2 + ((def.cells - 1) * 16) / 2;
      blob(cx, cy, 20 + (def.cells - 1) * 14, 10 + (def.cells - 1) * 7, 0.2);
    }
    for (const e of world.entities) {
      if (e.dead) continue;
      blob(isoX(e.x, e.y), isoY(e.x, e.y) + TILE_H / 2, 13, 6.5, 0.28);
    }

    lightG.clear();
    const dusk = dark * (1 - dark) * 4;
    if (dusk > 0.01) {
      lightG.rect(minX, minY, bw, bh).fill({ color: 0x4a2c14, alpha: dusk * 0.14 });
    }
    if (dark > 0.01) {
      lightG.rect(minX, minY, bw, bh).fill({ color: 0x141c33, alpha: dark * 0.3 });
    }

    fxGlow.clear();
    /**
     * SOFT GLOWS. Every light in the room used to be ONE hard-edged circle,
     * and additive blending renders that as a flat disc of colour rather than
     * as light. The stove was the worst offender at alpha 0.34 and read as a
     * yellow sticker sitting behind the flame.
     *
     * Five rings with a linear falloff cost the same draw call budget and
     * actually fall off at the edge. Alphas are tuned to sum to roughly `peak`
     * at the centre, so the existing brightness numbers still mean what they
     * meant.
     */
    const GLOW_RINGS = 5;
    const glow = (x: number, y: number, r: number, color: number, peak: number) => {
      if (!(peak > 0.001) || !(r > 0)) return;
      for (let i = GLOW_RINGS; i >= 1; i--) {
        const f = i / GLOW_RINGS;
        fxGlow.circle(x, y, r * f).fill({ color, alpha: peak * (1 - f * 0.85) * 0.45 });
      }
    };
    const candleAmp = 0.45 + 0.55 * dark;
    for (const t of world.tables) {
      const p = anchorFor("table_basic", t.gx, t.gy);
      glow(
        p.x,
        p.y - 66,
        26 + a.candle * 7,
        0xffb347,
        (0.055 + a.candle * 0.05) * candleAmp * 1.6
      );
    }
    const windowPulse = 0.5 + 0.5 * Math.sin(a.lampPhase * 0.8);
    const windowAmp = 0.35 + 0.65 * dark;
    for (const p of windowPts) {
      glow(p.x, p.y, 34, 0xf7c873, (0.05 + windowPulse * 0.045) * windowAmp * 1.7);
    }
    // ── the stove actually lights now (M7c) ───────────────────────────────
    // A stove is LIT when a chef is standing at it in the "cook" state. That
    // is derivable entirely here: stoveAnchors and stovePos are built in the
    // same order (world.ts rebuildDerived), and a cooking chef stands on an
    // anchor. Nearest-anchor matching keeps it robust if that ever changes.
    //
    // This whole system is read-only over WorldState. It adds nothing to the
    // sim and cannot move hashWorld — the same rule the theme layer follows.
    const lit = new Map<number, number>(); // stove index -> that chef's stateT
    for (const e of world.entities) {
      if (e.kind !== "chef" || e.state !== "cook") continue;
      let best = -1;
      let bestD = Infinity;
      world.stoveAnchors.forEach((anchor, i) => {
        const d = (anchor.x - e.x) ** 2 + (anchor.y - e.y) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0 && best < world.stovePos.length) lit.set(best, e.stateT);
    }
    syncFlames(world, lit);

    world.stovePos.forEach((s, i) => {
      const p = anchorFor("stove_basic", s.gx, s.gy);
      // an unlit stove keeps its faint pilot glow; a lit one blooms
      const isLit = lit.has(i);
      glow(
        p.x,
        p.y - 44,
        isLit ? 34 : 18,
        0xff8c42,
        isLit ? 0.3 : 0.05 + a.candle * 0.04
      );
    });

    fxSteam.clear();
    for (const p of a.steam) {
      const cx = isoX(p.gx, p.gy);
      const cy = isoY(p.gx, p.gy) + TILE_H / 2 - 54 - p.z;
      const t = p.age / p.life;
      fxSteam
        .circle(cx, cy, 4 + t * 9)
        .fill({ color: 0xf7f3ea, alpha: 0.32 * (1 - t) });
    }

    // ── ui layer ───────────────────────────────────────────────────────────
    uiG.clear();
    // bubble backings first, so nothing else in this layer sits behind one
    for (const b of bubbleTails) {
      uiG
        .roundRect(b.x - b.w / 2, b.y - b.h + 2, b.w, b.h, 7)
        .fill({ color: 0x2a1c14, alpha: 0.92 })
        .stroke({ color: 0x4a3626, width: 1, alpha: 0.9 });
      uiG
        .poly([b.x - 4, b.y + 1, b.x + 4, b.y + 1, b.x, b.y + 7])
        .fill({ color: 0x2a1c14, alpha: 0.92 });
    }
    for (const e of world.entities) {
      if (e.emote && e.emoteT > 0) {
        const rise = (1.8 - e.emoteT) * 16;
        const ex = (e.x - e.y) * 32;
        const ey = (e.x + e.y) * 16 + TILE_H / 2 - 74 - rise;
        const fade = Math.min(1, e.emoteT / 0.5);
        if (e.emote === "heart") {
          uiG.circle(ex - 3.2, ey - 2, 3.6).fill({ color: 0xe25555, alpha: fade });
          uiG.circle(ex + 3.2, ey - 2, 3.6).fill({ color: 0xe25555, alpha: fade });
          uiG.poly([ex - 6.4, ey - 0.5, ex + 6.4, ey - 0.5, ex, ey + 7]).fill({ color: 0xe25555, alpha: fade });
        } else {
          uiG.circle(ex, ey, 5.5).fill({ color: 0xe8c04a, alpha: fade });
          uiG.circle(ex, ey, 3).stroke({ color: 0xb8922e, width: 1.5, alpha: fade });
        }
      }
      if (e.state === "bus" && e.taskTable >= 0 && world.tables[e.taskTable]) {
        const t = world.tables[e.taskTable];
        const p = anchorFor("table_basic", t.gx, t.gy);
        for (let k = 0; k < 3; k++) {
          const ang = a.lampPhase * 6 + (k * Math.PI * 2) / 3;
          uiG
            .circle(p.x + Math.cos(ang) * 14, p.y - 62 + Math.sin(ang) * 6, 2.4)
            .fill({ color: 0xf6f2e7, alpha: 0.7 });
        }
      }
    }
    sparks = sparks.filter((p) => p.age < p.life);
    for (const p of sparks) {
      p.age += 1 / 60;
      p.x += p.vx / 60;
      p.y += p.vy / 60;
      p.vy += 1;
      const fade = 1 - p.age / p.life;
      uiG.circle(p.x, p.y, 2 + fade * 1.5).fill({ color: p.color, alpha: fade });
    }
  }

  function destroy(): void {
    // pooled Text objects live in uiC, which is a child of root, so one
    // recursive destroy takes the maps' contents with it
    chips.clear();
    bubbles.clear();
    charSprites.clear();
    flameSprites.clear();
    sizzleSprites.clear();
    root.destroy({ children: true });
  }

  return {
    sync,
    resize,
    pick,
    pickItem,
    pickEntity,
    spark,
    setTheme,
    setSign,
    setCrew,
    destroy,
    zoomAt,
    panBy,
    resetCamera,
    canPan,
  };
}
