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
  resize: (hostW: number, hostH: number) => void;
  pick: (px: number, py: number) => { x: number; y: number };
  spark: (tileX: number, tileY: number, color?: number, n?: number) => void;
  setTheme: (theme: ThemeId) => void;
}

const WALK_FRAMES_PER_TILE = 8;
const SIT_LIFT = 9;
const CHAR_ANCHOR_Y = 116 / 128;
const DISH_LIFT = 50;

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
  const lightG = new Graphics();
  const fxSteam = new Graphics();
  const fxGlow = new Graphics();
  fxGlow.blendMode = "add";
  const uiC = new Container();
  const uiG = new Graphics();
  uiC.addChild(uiG);
  root.addChild(floorC, gridG, wallC, decorC, objC, lightG, fxGlow, fxSteam, uiC);

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

  // ── walls (fixed shell) ──────────────────────────────────────────────────
  const wallL = new Sprite(tex.wallLeft);
  wallL.anchor.set(1, 0);
  wallL.scale.set(0.5);
  wallL.position.set(0, -WALL_H);
  const wallR = new Sprite(tex.wallRight);
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
    wallL.texture = set.wallLeft;
    wallR.texture = set.wallRight;
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

  function sheetFor(e: Entity): Spritesheet {
    const key: SheetKey =
      e.kind === "guest" ? (`guest${e.variant % 8}` as SheetKey) : (e.kind as SheetKey);
    return sheets[key];
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

  function syncEntities(world: WorldState): void {
    const seen = new Set<number>();
    for (const e of world.entities) {
      seen.add(e.id);
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

      if (e.name) {
        let chip = chips.get(e.id);
        if (!chip) {
          chip = new Text({
            text: e.name.toUpperCase(),
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
        chip.position.set(sx, sy - 70 - Math.sin(world.ambient.lampPhase * 2) * 2);
      }
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
  function resize(hostW: number, hostH: number): void {
    const vw = hostW > 0 ? hostW : app.screen.width;
    const vh = hostH > 0 ? hostH : app.screen.height;
    if (!(vw > 0) || !(vh > 0)) return;
    curScale = Math.min((vw * 0.94) / bw, (vh * 0.92) / bh);
    root.scale.set(curScale);
    root.position.set(
      vw / 2 - (minX + bw / 2) * curScale,
      vh / 2 - (minY + bh / 2) * curScale
    );
  }

  function pick(px: number, py: number): { x: number; y: number } {
    const lx = (px - root.position.x) / curScale;
    const ly = (py - root.position.y) / curScale - TILE_H / 2;
    return { x: lx / 64 + ly / 32, y: ly / 32 - lx / 64 };
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
    lightG.clear();
    const dusk = dark * (1 - dark) * 4;
    if (dusk > 0.01) {
      lightG.rect(minX, minY, bw, bh).fill({ color: 0x4a2c14, alpha: dusk * 0.14 });
    }
    if (dark > 0.01) {
      lightG.rect(minX, minY, bw, bh).fill({ color: 0x141c33, alpha: dark * 0.3 });
    }

    fxGlow.clear();
    const candleAmp = 0.45 + 0.55 * dark;
    for (const t of world.tables) {
      const p = anchorFor("table_basic", t.gx, t.gy);
      fxGlow
        .circle(p.x, p.y - 66, 24 + a.candle * 6)
        .fill({ color: 0xffb347, alpha: (0.055 + a.candle * 0.05) * candleAmp * 1.6 });
    }
    const windowPulse = 0.5 + 0.5 * Math.sin(a.lampPhase * 0.8);
    const windowAmp = 0.35 + 0.65 * dark;
    for (const p of windowPts) {
      fxGlow
        .circle(p.x, p.y, 30)
        .fill({ color: 0xf7c873, alpha: (0.05 + windowPulse * 0.045) * windowAmp * 1.7 });
    }
    for (const s of world.stovePos) {
      const p = anchorFor("stove_basic", s.gx, s.gy);
      fxGlow
        .circle(p.x, p.y - 44, 14)
        .fill({ color: 0xff8c42, alpha: 0.05 + a.candle * 0.04 });
    }

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

  return { sync, resize, pick, spark, setTheme };
}
