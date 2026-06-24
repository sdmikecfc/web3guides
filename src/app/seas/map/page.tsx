"use client";

/**
 * THE WORLD MAP 🗺️ · Conquer the Seas shared world surface.
 *
 * A lightly animated, pan/zoom nautical chart of the 2000x2000 sea:
 * faction islands that grow with their fleet, every ship at its anchorage,
 * event beacons, and the daily Lookout cask. The cask spawn is derived
 * client-side from the day seed (same algorithm the score API validates
 * against), so the find is real: tap the glinting cask to claim.
 *
 * Data: GET /api/seas/map. Identity + claim: useSeasGame("lookout").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FG,
  FG3,
  GOLD,
  GOLD_BRIGHT,
  HAIRLINE,
  INK,
  GameHeader,
  ScoreBanner,
  dayKeyUTC,
  seededRng,
  useSeasGame,
} from "../games/shared";

// ── world + camera ──────────────────────────────────────────────────────────
const WORLD = 2000;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 3.5;
// Open monster waters: raiders pull toward this from their harbor. Matches the
// server's free-sailor center (route.ts shipPosition: {0.5, 0.42}).
const CENTER_WX = 0.5 * WORLD;
const CENTER_WY = 0.42 * WORLD;

// Ship glyph size in screen px at zoom 1, by hull class.
const CLASS_PX: Record<string, number> = {
  Dinghy: 10,
  Sloop: 11.5,
  Frigate: 13,
  Galleon: 14.5,
  Flagship: 16,
};
const FREE_SAIL = "#9aa3a8";
const BEACON_ICON: Record<string, string> = { battle: "⚔️", epic: "🌊", result: "🏴‍☠️" };

// ── sprite art (public/seas-art) ────────────────────────────────────────────
// Premium AI-painted scenes (gpt-image-1): each isle-N is a complete top-down
// island (sand, palms, town, fort, docks all baked in), each vessel-* is a full
// painterly ship with the bow pointing up, ocean is a seamless water texture and
// storm is a thundercloud. Every load is best-effort: a no-op onerror means a
// missing file never throws, and the draw code keeps a vector fallback for each
// sprite so the map can never crash on an absent asset.
type Sprite = { img: HTMLImageElement; ok: boolean; w: number; h: number };
const ART_DIR = "/seas-art/";
const ART_NAMES = [
  "isle-1",
  "isle-2",
  "isle-3",
  "isle-4",
  "isle-5",
  "vessel-dinghy",
  "vessel-sloop",
  "vessel-frigate",
  "vessel-galleon",
  "vessel-flagship",
  // Doubloon vessel skins (the Shipyard). Side-on POTC-style hulls a captain
  // buys to stand out on the map. Override the class vessel when worn.
  "ship-sovereign",
  "ship-crimsonmarauder",
  "ship-gildedlion",
  "ship-blackreaver",
  "ship-drownedwraith",
  "ship-bonecrusher",
  "ship-seawolf",
  "ship-corsair",
  "ship-jadeserpent",
  "ship-tempest",
  "ocean",
  "storm",
] as const;
type ArtName = (typeof ART_NAMES)[number];

function loadSprites(onReady: () => void): Record<ArtName, Sprite> {
  const out = {} as Record<ArtName, Sprite>;
  for (const name of ART_NAMES) {
    const sp: Sprite = { img: new Image(), ok: false, w: 0, h: 0 };
    sp.img.onload = () => {
      sp.ok = true;
      sp.w = sp.img.naturalWidth;
      sp.h = sp.img.naturalHeight;
      onReady();
    };
    // Never throw on a missing asset: the vector fallback covers it.
    sp.img.onerror = () => {
      sp.ok = false;
    };
    sp.img.src = `${ART_DIR}${name}.png`;
    out[name] = sp;
  }
  return out;
}

// Ship sprite + on-canvas size (screen px at zoom 1) per hull class. Ships are
// kept clearly SMALLER than islands so the harbors read as dotted with vessels,
// not a sea of objects: a Dinghy ~20px tall at zoom 1, a Flagship ~34px.
const SHIP_SPRITE: Record<string, ArtName> = {
  Dinghy: "vessel-dinghy",
  Sloop: "vessel-sloop",
  Frigate: "vessel-frigate",
  Galleon: "vessel-galleon",
  Flagship: "vessel-flagship",
};
// Drawn hull height in screen px at zoom 1, by class (grows with tier).
const SHIP_DRAW_H: Record<string, number> = {
  Dinghy: 20,
  Sloop: 24,
  Frigate: 27,
  Galleon: 30,
  Flagship: 34,
};
// Worn doubloon skin → sprite. Keys match the bot's SHIP_SKINS keys / cosmetics.skin.
const SKIN_SPRITE: Record<string, ArtName> = {
  sovereign: "ship-sovereign",
  crimsonmarauder: "ship-crimsonmarauder",
  gildedlion: "ship-gildedlion",
  blackreaver: "ship-blackreaver",
  drownedwraith: "ship-drownedwraith",
  bonecrusher: "ship-bonecrusher",
  seawolf: "ship-seawolf",
  corsair: "ship-corsair",
  jadeserpent: "ship-jadeserpent",
  tempest: "ship-tempest",
};
// Skins are side-on full ships (wider art), drawn larger than a class token so
// the flex reads. Height in screen px at zoom 1; width tracks the sprite aspect.
const SKIN_DRAW_H = 40;

// ── API shapes (GET /api/seas/map) ──────────────────────────────────────────
type MapFaction = {
  domain: string;
  color: string;
  flag: string;
  island: { x: number; y: number };
  level: number;
  shipCount: number;
  lpUsd?: number;
  projectedPayout?: number;
  bonded?: boolean;
  failed?: boolean; // GRADUATION_FAILED: dead, cannot bond, closed to new crew
  raid?: boolean; // the Pillage raid target (bottoken): centred + menacing, not joinable
  tier?: string; // emblem tier: "t1" | "t2" | "t3" (hybrid: level → t1/t2, bond → t3)
};
type ShipCareer = {
  s1Team?: string;
  s1Rank?: number;
  s1Founder?: boolean;
  s1Points?: number;
};
type MapShip = {
  id: string;
  name: string;
  faction: string | null;
  cls: string;
  icon: string;
  doubloons: number;
  glory: number;
  x: number;
  y: number;
  state?: "harbor" | "raiding";
  skin?: string | null;
  career?: ShipCareer;
};
type MapBeacon = {
  kind: string;
  x: number;
  y: number;
  title: string;
  line: string;
  resolveAt: string | null;
  winnerFaction?: string | null;
  winnerFlag?: string | null;
  hero?: string | null;
};
type MapData = {
  day: string;
  includeTest: boolean;
  storm: { faction: string } | null;
  factions: MapFaction[];
  ships: MapShip[];
  beacons: MapBeacon[];
  lookout: { active: boolean; claims: number };
};

// ── API shapes (GET /api/seas/leaderboard) ──────────────────────────────────
// Public-safe by construction: the route never emits hull_usd or any dollar
// figure, only rank / name / flag / glory / class.
type Leader = {
  rank: number;
  id: string;
  name: string;
  faction: string | null;
  flag: string;
  glory: number;
  cls: string;
};
type LeaderboardData = {
  updatedAt: string;
  leaders: Leader[];
};

// Class icon for the DOM chrome (mirrors the map route's hullClassName icons;
// safe in DOM, where emoji render reliably, unlike on the canvas).
const CLASS_ICON: Record<string, string> = {
  Flagship: "🚢",
  Galleon: "⛵",
  Frigate: "⛵",
  Sloop: "🛶",
  Dinghy: "🛶",
};

// Faction emblem art by hybrid bonding tier (t1 base → t2 ornate → t3 gold
// "BONDED"). Falls back at render time to the legacy crest-<domain> art if the
// tiered emblem asset is missing, so this never blanks a fleet badge.
function emblemSlug(domain: string) {
  return domain.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function emblemSrc(domain: string, tier?: string) {
  return `${ART_DIR}emblem-${emblemSlug(domain)}-${tier || "t1"}.png`;
}
function legacyCrestSrc(domain: string) {
  return `${ART_DIR}crest-${domain.toLowerCase()}.png`;
}

// ── Colorblind fleet markers ────────────────────────────────────────────────
// Each fleet gets a distinct SHAPE (shape + colour is the standard accessible
// pairing) so ships are told apart without relying on hue alone. The same five
// shapes key the bottom legend, so a player can learn shape -> fleet there and
// read it off every ship. Index = the fleet's order in data.factions.
const FLEET_GLYPH_COUNT = 5;
// Trace shape `kind` (0..4) centred at (cx,cy), radius r. Caller sets fill/stroke.
function fleetGlyphPath(ctx: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number) {
  ctx.beginPath();
  if (kind === 1) {
    ctx.arc(cx, cy, r, 0, 6.283); // circle
  } else if (kind === 2) {
    ctx.rect(cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72); // square
  } else if (kind === 3) {
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); // diamond
  } else if (kind === 4) {
    const a = r * 0.4; // plus / cross
    ctx.rect(cx - a, cy - r, a * 2, r * 2);
    ctx.rect(cx - r, cy - a, r * 2, a * 2);
  } else {
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.92, cy + r * 0.82); ctx.lineTo(cx - r * 0.92, cy + r * 0.82); ctx.closePath(); // triangle (0 + fallback)
  }
}
// Inline-SVG twin of fleetGlyphPath for the legend key.
function FleetGlyphSvg({ kind, color }: { kind: number; color: string }) {
  const p = { fill: color, stroke: "rgba(3,18,26,0.92)", strokeWidth: 1.4 };
  return (
    <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true" style={{ display: "block", flex: "0 0 auto" }}>
      {kind === 1 ? (
        <circle cx={8} cy={8} r={5.4} {...p} />
      ) : kind === 2 ? (
        <rect x={3} y={3} width={10} height={10} rx={1} {...p} />
      ) : kind === 3 ? (
        <path d="M8 2 L14 8 L8 14 L2 8 Z" {...p} />
      ) : kind === 4 ? (
        <path d="M6 2 H10 V6 H14 V10 H10 V14 H6 V10 H2 V6 H6 Z" {...p} />
      ) : (
        <path d="M8 2 L14 13 L2 13 Z" {...p} />
      )}
    </svg>
  );
}

// ── render models ───────────────────────────────────────────────────────────
type IslandModel = {
  f: MapFaction;
  cx: number;
  cy: number;
  R: number; // half-extent used for hit-testing + plate offset (kept identical role)
  pts: number[]; // vector fallback blob (unchanged shape)
  // sprite-render additions:
  sprite: ArtName; // island sprite chosen by faction level (isle-1..isle-5)
  drawW: number; // composited island sprite size in world px
  drawH: number;
  bobPh: number; // gentle bob phase (deterministic)
  foamPh: number; // foam-ring + light flicker phase (deterministic)
  harborA: number; // dock/harbor angle off the waterline (where the glow sits)
  cacheKey: string; // offscreen cache key: `${domain}:${level}`
};
type ShipModel = {
  s: MapShip;
  wx: number; // drawn world position (raiding ships sit at the nudged target)
  wy: number;
  homeX: number; // harbor anchor (unused for draw, kept for clarity/debug)
  homeY: number;
  raiding: boolean;
  phase: number;
  px: number;
  color: string;
  sprite: ArtName; // hull sprite by class, or the worn skin
  drawH: number; // hull height in screen px at zoom 1
  isSkin: boolean; // worn doubloon skin (side-on full ship) → skip the vector pennant
  glyph: number; // colorblind fleet shape index (0..4), or -1 for free sailors
};
type BeaconModel = { b: MapBeacon; wx: number; wy: number };
type StormModel = {
  cx: number;
  cy: number;
  R: number;
};
// Open-water atmosphere in absolute world coords. Decluttered: no rocks, no
// shipwrecks, no distant sails. Only a few faint drifting mist patches remain so
// the sea reads as open and calm, with islands + player ships the only objects.
type DecoModel = {
  mist: { x: number; y: number; r: number; ph: number; drift: number; a: number }[];
};
type WorldModel = {
  islands: IslandModel[];
  ships: ShipModel[];
  beacons: BeaconModel[];
  storm: StormModel | null;
  deco: DecoModel;
};

type Camera = { x: number; y: number; zoom: number };
type Selection =
  | { kind: "ship"; ship: MapShip }
  | { kind: "island"; faction: MapFaction }
  | { kind: "beacon"; beacon: MapBeacon }
  | { kind: "cask-guest" }
  | null;

// ── small pure helpers ──────────────────────────────────────────────────────
/** FNV-1a, identical to the server's hash32 (ship.id = hash32("s2:"+discordId).toString(36)). */
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clampCam(cam: Camera) {
  cam.zoom = clamp(cam.zoom, MIN_ZOOM, MAX_ZOOM);
  cam.x = clamp(cam.x, 0, WORLD);
  cam.y = clamp(cam.y, 0, WORLD);
}

function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function blobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  pts: number[],
  mul: number,
) {
  const n = pts.length;
  const P: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const r = R * pts[i] * mul;
    P.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }
  ctx.beginPath();
  ctx.moveTo((P[n - 1].x + P[0].x) / 2, (P[n - 1].y + P[0].y) / 2);
  for (let i = 0; i < n; i++) {
    const q = P[(i + 1) % n];
    ctx.quadraticCurveTo(P[i].x, P[i].y, (P[i].x + q.x) / 2, (P[i].y + q.y) / 2);
  }
  ctx.closePath();
}

// Draw a sprite centred at (x,y) sized to height h (preserving aspect), with an
// optional horizontal flip. Pixel art stays crisp; the caller controls
// imageSmoothingEnabled. Returns the drawn width (for callers that care).
function drawSpriteH(
  ctx: CanvasRenderingContext2D,
  sp: Sprite,
  x: number,
  y: number,
  h: number,
  flip = false,
): number {
  if (!sp.ok || !sp.h) return 0;
  const w = (sp.w / sp.h) * h;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sp.img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return w;
}

// Composite a single island sprite into an offscreen canvas, once per
// (domain, level). The premium isle-N art is fully self-contained: its sand,
// palms, huts, town, fort, docks and beaches are all painted INTO the image, so
// nothing is drawn on top here other than a soft water drop-shadow. The canvas
// is in island-local pixels with the island centre at the canvas centre; PAD
// gives the sprite room to overhang its footprint. The animated bits (foam
// ring, harbor-light glow, pennant, bob) are drawn live each frame in the main
// loop and are NOT baked in here.
const ISLAND_PAD = 24;
function buildIslandCanvas(
  isl: IslandModel,
  sprites: Record<ArtName, Sprite> | null,
): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  const half = isl.drawW / 2 + ISLAND_PAD;
  const size = Math.ceil(half * 2);
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;

  // soft water drop-shadow under the island
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "#02101a";
  ctx.beginPath();
  ctx.ellipse(cx, cy + isl.drawH * 0.16, isl.drawW * 0.5, isl.drawH * 0.4, 0, 0, 6.283);
  ctx.fill();
  ctx.restore();

  const islSprite = sprites?.[isl.sprite];
  if (islSprite?.ok) {
    ctx.imageSmoothingEnabled = true;
    drawSpriteH(ctx, islSprite, cx, cy, isl.drawH);
  } else {
    // vector fallback (a simple procedural island blob), scaled to drawW.
    const R = isl.drawW * 0.42;
    blobPath(ctx, cx, cy, R, isl.pts, 1.06);
    ctx.strokeStyle = "rgba(127,233,255,0.10)";
    ctx.lineWidth = 9;
    ctx.stroke();
    blobPath(ctx, cx, cy, R, isl.pts, 1);
    ctx.fillStyle = "#c2a06a";
    ctx.fill();
    blobPath(ctx, cx, cy, R, isl.pts, 0.84);
    ctx.fillStyle = "#0b211b";
    ctx.fill();
  }

  return cv;
}

// Static scenery (deterministic, same every load; safe at module scope).
const PLANKTON = (() => {
  const rng = seededRng("seas:plankton:v1");
  const out: { x: number; y: number; r: number; a: number; tw: number }[] = [];
  for (let i = 0; i < 110; i++) {
    out.push({
      x: rng() * WORLD,
      y: rng() * WORLD,
      r: 1.2 + rng() * 2.2,
      a: 0.08 + rng() * 0.16,
      tw: rng() * 6.283,
    });
  }
  return out;
})();

// (Removed three procedural "wave" layers that all read as banding/ovals over
// the 2000px world: the old SHIMMER (nine fixed sine ribbons), the broad swell
// ellipses, and the WAVE_CRESTS sine ribbons — the latter two were the "light
// ovals with sine graphs through them." The water now reads from the ocean
// texture + radial gradient + plankton twinkle + sparkle glints, which carry the
// motion without seams or light ovals.)

// Sparkle glints: tiny bright specks that wink on the swell.
const GLINTS = (() => {
  const rng = seededRng("seas:glints:v1");
  const out: { x: number; y: number; r: number; ph: number; sp: number }[] = [];
  for (let i = 0; i < 70; i++) {
    out.push({
      x: rng() * WORLD,
      y: rng() * WORLD,
      r: 0.8 + rng() * 1.6,
      ph: rng() * 6.283,
      sp: 0.6 + rng() * 1.4,
    });
  }
  return out;
})();

// Open-water atmosphere scattered ONCE, deterministically. DECLUTTERED: the
// scattered rocks, shipwrecks and distant sails are gone. All that remains is a
// handful of faint mist patches that drift for depth, so the sea stays open and
// calm with islands + player ships as the only real objects.
const DECO_RAW = (() => {
  const rng = seededRng("seas:deco:v4");
  const mist: { x: number; y: number; r: number; ph: number; drift: number; a: number }[] = [];
  for (let i = 0; i < 6; i++) {
    mist.push({
      x: rng() * WORLD,
      y: rng() * WORLD,
      r: 160 + rng() * 280,
      ph: rng() * 6.283,
      drift: 40 + rng() * 80,
      a: 0.03 + rng() * 0.04,
    });
  }
  return { mist };
})();

// ── page ────────────────────────────────────────────────────────────────────
export default function WorldMapPage() {
  const { captain, submitScore, submitState, lastResult } = useSeasGame("lookout");

  const [data, setData] = useState<MapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [claimMsg, setClaimMsg] = useState<{ text: string; gold: boolean } | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [boardOpen, setBoardOpen] = useState(true);
  const [shipOpen, setShipOpen] = useState(true);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera>({ x: WORLD / 2, y: WORLD / 2, zoom: 1 });
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1, base: 0.001 });
  const dataRef = useRef<MapData | null>(null);
  const modelRef = useRef<WorldModel | null>(null);
  const selectionRef = useRef<Selection>(null);
  const myIdRef = useRef<string | null>(null);
  const reducedRef = useRef(false);
  const dirtyRef = useRef(true);
  const burstRef = useRef<{ at: number; wx: number; wy: number } | null>(null);
  const spawnCacheRef = useRef<{ day: string; x: number; y: number } | null>(null);
  const spritesRef = useRef<Record<ArtName, Sprite> | null>(null);
  // Offscreen island composites, keyed by `${domain}:${level}`. Each island and
  // all of its static decoration is painted ONCE here; every frame is then a
  // single drawImage (plus the animated foam/bob/lights overlay).
  const islandCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef({
    mode: "none" as "none" | "pan" | "pinch",
    startX: 0,
    startY: 0,
    camX: 0,
    camY: 0,
    moved: false,
    tapOk: false,
    pinchDist: 1,
    pinchZoom: 1,
    midWX: 0,
    midWY: 0,
  });

  // Daily Lookout spawn, EXACTLY the server derivation in /api/seas/score:
  // seededRng(day + ":lookout"), first two draws into 0.08 + r()*0.84.
  const getSpawn = useCallback((): { day: string; x: number; y: number } => {
    const day = dayKeyUTC();
    const c = spawnCacheRef.current;
    if (c && c.day === day) return c;
    const r = seededRng(`${day}:lookout`);
    const sp = { day, x: 0.08 + r() * 0.84, y: 0.08 + r() * 0.84 };
    spawnCacheRef.current = sp;
    return sp;
  }, []);

  const myId = useMemo(
    () => (captain ? hash32(`s2:${captain.discord_id}`).toString(36) : null),
    [captain],
  );
  useEffect(() => {
    myIdRef.current = myId;
    dirtyRef.current = true;
  }, [myId]);
  useEffect(() => {
    selectionRef.current = selection;
    dirtyRef.current = true;
  }, [selection]);

  // ── load the sprite art (best-effort; vector fallback if any fail) ────────
  useEffect(() => {
    if (spritesRef.current) return;
    spritesRef.current = loadSprites(() => {
      // a freshly-decoded sprite invalidates any cached island composite that
      // was painted with the vector fallback, and triggers a repaint.
      islandCacheRef.current.clear();
      dirtyRef.current = true;
    });
  }, []);

  // ── fetch the snapshot ────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    fetch("/api/seas/map")
      .then((r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then((j: MapData) => {
        if (!dead) setData(j);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
    };
  }, []);

  // ── Top Captains board, derived from the SAME map snapshot the fleet crews
  // use, so the legend counts and the leaderboard can never disagree. (It used
  // to fetch a separate cached endpoint, which drifted out of sync during enlist
  // surges: 17 crew on the map but only 8 on the board.)
  const board = useMemo<LeaderboardData | null>(() => {
    if (!data) return null;
    const flagOf = new Map(data.factions.map((f) => [f.domain, f.flag]));
    const leaders = [...data.ships]
      .sort((a, b) => (b.glory || 0) - (a.glory || 0))
      .slice(0, 20)
      .map((s, i) => ({
        rank: i + 1,
        id: s.id,
        name: s.name,
        faction: s.faction,
        flag: s.faction ? flagOf.get(s.faction) || "🏳️" : "🏳️",
        glory: s.glory || 0,
        cls: s.cls,
      }));
    return { updatedAt: "", leaders };
  }, [data]);

  // ── build the render model ────────────────────────────────────────────────
  useEffect(() => {
    dataRef.current = data;
    if (!data) {
      modelRef.current = null;
      return;
    }
    const colorOf = new Map<string, string>();
    for (const f of data.factions) colorOf.set(f.domain, f.color);
    // Stable fleet → colorblind shape index, by the server's faction order.
    const glyphOf = new Map<string, number>();
    data.factions.forEach((f, i) => glyphOf.set(f.domain, i % FLEET_GLYPH_COUNT));

    const islands: IslandModel[] = data.factions.map((f) => {
      const rng = seededRng(f.domain);
      const raw: number[] = [];
      for (let i = 0; i < 16; i++) raw.push(0.74 + rng() * 0.45);
      const pts = raw.map((_, i) => {
        const a = raw[(i + 15) % 16];
        const b = raw[(i + 1) % 16];
        return (a + 2 * raw[i] + b) / 4;
      });
      const lvl = Math.max(1, Math.min(5, f.level));
      // hit-test radius + plate offset: identical role + scale to the old model.
      const R = 95 * (1 + 0.12 * f.level);

      // Island sprite by level: every isle-N is a complete top-down scene that
      // already contains its own sand, palms, town, fort and docks. Higher level
      // = a grander island (isle-1 islet ... isle-5 citadel port).
      const sprite: ArtName = `isle-${lvl}` as ArtName;
      // Island world size grows with level so a citadel reads clearly larger than
      // a bare islet. R is the waterline radius used for foam + hit-testing; the
      // painted sprite sits a touch outside it.
      const drawW = R * 2 * (0.92 + 0.06 * lvl);
      const drawH = drawW; // the isle-N sprites are square-ish

      // A stable harbor angle (where the soft harbor glow sits), seeded so it
      // never jitters between loads.
      const harborA = seededRng(`${f.domain}:harbor`)() * 6.283;

      return {
        f,
        cx: f.island.x * WORLD,
        cy: f.island.y * WORLD,
        R,
        pts,
        sprite,
        drawW,
        drawH,
        bobPh: rng() * 6.283,
        foamPh: rng() * 6.283,
        harborA,
        cacheKey: `${f.domain}:${lvl}`,
      };
    });

    const ships: ShipModel[] = data.ships.map((s) => {
      const homeX = s.x * WORLD;
      const homeY = s.y * WORLD;
      const raiding = s.state === "raiding";
      // Raiders leave their harbor anchor and pull toward the open monster
      // waters at the map center. Nudge target precomputed once (no per-frame
      // allocation in the draw loop). FNV phase varies the lerp amount slightly.
      let wx = homeX;
      let wy = homeY;
      if (raiding) {
        const k = 0.25 + ((hash32(s.id) >>> 5) % 1000) / 1000 * 0.1; // 0.25..0.35
        wx = homeX + (CENTER_WX - homeX) * k;
        wy = homeY + (CENTER_WY - homeY) * k;
      }
      return {
        s,
        wx,
        wy,
        homeX,
        homeY,
        raiding,
        phase: (hash32(s.id) % 6283) / 1000,
        px: CLASS_PX[s.cls] ?? 12,
        color: (s.faction && colorOf.get(s.faction)) || FREE_SAIL,
        // worn doubloon skin overrides the class vessel and draws larger
        sprite: (s.skin && SKIN_SPRITE[s.skin]) || SHIP_SPRITE[s.cls] || "vessel-frigate",
        drawH: s.skin && SKIN_SPRITE[s.skin] ? SKIN_DRAW_H : (SHIP_DRAW_H[s.cls] ?? 28),
        isSkin: Boolean(s.skin && SKIN_SPRITE[s.skin]),
        glyph: (s.faction && glyphOf.has(s.faction)) ? (glyphOf.get(s.faction) as number) : -1,
      };
    });

    const beacons: BeaconModel[] = data.beacons.map((b) => ({ b, wx: b.x * WORLD, wy: b.y * WORLD }));

    // Open-water atmosphere: just the faint drifting mist. No rocks, wrecks or
    // distant sails to cull anymore. The draw loop never allocates or recomputes.
    const deco: DecoModel = { mist: DECO_RAW.mist };

    // a new snapshot may change island levels: drop stale composites.
    islandCacheRef.current.clear();

    // Storm over the underdog fleet's island: just the centre + radius. The
    // painted storm.png is drawn over it in the loop with a gentle drift.
    let storm: StormModel | null = null;
    const stormDomain = data.storm?.faction || null;
    if (stormDomain) {
      const sf = data.factions.find((f) => f.domain === stormDomain);
      if (sf) {
        const sIsl = islands.find((i) => i.f.domain === stormDomain);
        const R = sIsl ? sIsl.R : 95;
        storm = { cx: sf.island.x * WORLD, cy: sf.island.y * WORLD, R };
      }
    }

    modelRef.current = { islands, ships, beacons, storm, deco };
    dirtyRef.current = true;
  }, [data]);

  // ── sizing (DPR-aware, cap 2) ─────────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      sizeRef.current = { w, h, dpr, base: Math.min(w, h) / WORLD };
      clampCam(cameraRef.current);
      dirtyRef.current = true;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ── camera helpers ────────────────────────────────────────────────────────
  const screenToWorld = useCallback((px: number, py: number) => {
    const { w, h, base } = sizeRef.current;
    const cam = cameraRef.current;
    const sc = base * cam.zoom;
    return { x: cam.x + (px - w / 2) / sc, y: cam.y + (py - h / 2) / sc };
  }, []);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    const { w, h, base } = sizeRef.current;
    const cam = cameraRef.current;
    const nz = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const sc = base * cam.zoom;
    const ns = base * nz;
    const wx = cam.x + (px - w / 2) / sc;
    const wy = cam.y + (py - h / 2) / sc;
    cam.zoom = nz;
    cam.x = wx - (px - w / 2) / ns;
    cam.y = wy - (py - h / 2) / ns;
    clampCam(cam);
    dirtyRef.current = true;
  }, []);

  // Wheel must be a manual non-passive listener (React registers wheel passive).
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0012));
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ── the claim ─────────────────────────────────────────────────────────────
  const handleCaskTap = useCallback(async () => {
    if (!captain) {
      setSelection({ kind: "cask-guest" });
      return;
    }
    if (submitState === "sending") return;
    const sp = getSpawn();
    const res = await submitScore(1, { x: sp.x, y: sp.y });
    if (res.ok) {
      burstRef.current = { at: performance.now() / 1000, wx: sp.x * WORLD, wy: sp.y * WORLD };
      setClaimMsg({ text: "+40 💰", gold: true });
      setData((d) => (d ? { ...d, lookout: { ...d.lookout, claims: d.lookout.claims + 1 } } : d));
    } else if (res.already) {
      setClaimMsg({ text: "Already claimed today.", gold: false });
    } else {
      setClaimMsg({ text: "Missed. Try the glinting cask.", gold: false });
    }
    dirtyRef.current = true;
  }, [captain, submitState, submitScore, getSpawn]);

  useEffect(() => {
    if (!claimMsg) return;
    const id = window.setTimeout(() => setClaimMsg(null), 5000);
    return () => window.clearTimeout(id);
  }, [claimMsg]);

  // ── tap hit-testing (world coords, generous radius) ───────────────────────
  const handleTap = useCallback(
    (px: number, py: number) => {
      const model = modelRef.current;
      const d = dataRef.current;
      if (!model || !d) return;
      const { base } = sizeRef.current;
      const cam = cameraRef.current;
      const sc = base * cam.zoom;
      const wp = screenToWorld(px, py);

      let bestDist = Infinity;
      let bestAct: (() => void) | null = null;
      const consider = (dist: number, radius: number, weight: number, act: () => void) => {
        const eff = dist * weight;
        if (dist <= radius && eff < bestDist) {
          bestDist = eff;
          bestAct = act;
        }
      };

      const rShip = 16 / sc;
      for (const m of model.ships) {
        consider(Math.hypot(wp.x - m.wx, wp.y - m.wy), rShip, 1, () =>
          setSelection({ kind: "ship", ship: m.s }),
        );
      }
      const rBeacon = 22 / sc;
      for (const m of model.beacons) {
        consider(Math.hypot(wp.x - m.wx, wp.y - m.wy), rBeacon, 1, () =>
          setSelection({ kind: "beacon", beacon: m.b }),
        );
      }
      if (d.lookout.active) {
        const sp = getSpawn();
        consider(
          Math.hypot(wp.x - sp.x * WORLD, wp.y - sp.y * WORLD),
          22 / sc,
          0.7,
          () => void handleCaskTap(),
        );
      }
      // Islands are big, lowest-priority targets: tap an island body to see its
      // fleet. The high weight means any ship/beacon/cask on top wins the tap.
      for (const isl of model.islands) {
        consider(Math.hypot(wp.x - isl.cx, wp.y - isl.cy), isl.R, 2.4, () =>
          setSelection({ kind: "island", faction: isl.f }),
        );
      }

      if (bestAct) (bestAct as () => void)();
      else setSelection(null);
    },
    [screenToWorld, getSpawn, handleCaskTap],
  );

  // ── pointer gestures: pan, tap, pinch ─────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone: gesture math still works without capture */
    }
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pts = pointersRef.current;
    pts.set(e.pointerId, { x, y });
    const g = gestureRef.current;
    const cam = cameraRef.current;
    if (pts.size === 1) {
      g.mode = "pan";
      g.startX = x;
      g.startY = y;
      g.camX = cam.x;
      g.camY = cam.y;
      g.moved = false;
      g.tapOk = true;
    } else if (pts.size === 2) {
      const two = Array.from(pts.values());
      g.mode = "pinch";
      g.tapOk = false;
      g.pinchDist = Math.max(8, Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y));
      g.pinchZoom = cam.zoom;
      const midX = (two[0].x + two[1].x) / 2;
      const midY = (two[0].y + two[1].y) / 2;
      const wm = screenToWorld(midX, midY);
      g.midWX = wm.x;
      g.midWY = wm.y;
    } else {
      g.tapOk = false;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    const pts = pointersRef.current;
    if (!cv || !pts.has(e.pointerId)) return;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pts.set(e.pointerId, { x, y });
    const g = gestureRef.current;
    const cam = cameraRef.current;
    const { w, h, base } = sizeRef.current;

    if (g.mode === "pinch" && pts.size >= 2) {
      const two = Array.from(pts.values());
      const dist = Math.max(8, Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y));
      const midX = (two[0].x + two[1].x) / 2;
      const midY = (two[0].y + two[1].y) / 2;
      cam.zoom = clamp((g.pinchZoom * dist) / g.pinchDist, MIN_ZOOM, MAX_ZOOM);
      const ns = base * cam.zoom;
      cam.x = g.midWX - (midX - w / 2) / ns;
      cam.y = g.midWY - (midY - h / 2) / ns;
      clampCam(cam);
      dirtyRef.current = true;
    } else if (g.mode === "pan" && pts.size === 1) {
      const dx = x - g.startX;
      const dy = y - g.startY;
      if (Math.hypot(dx, dy) > 5) {
        g.moved = true;
        g.tapOk = false;
      }
      const sc = base * cam.zoom;
      cam.x = g.camX - dx / sc;
      cam.y = g.camY - dy / sc;
      clampCam(cam);
      dirtyRef.current = true;
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pts = pointersRef.current;
    const had = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    const g = gestureRef.current;
    const cam = cameraRef.current;
    if (pts.size === 0) {
      if (g.mode === "pan" && g.tapOk && !g.moved && had && e.type === "pointerup") {
        handleTap(had.x, had.y);
      }
      g.mode = "none";
    } else if (pts.size === 1) {
      const rest = Array.from(pts.values())[0];
      g.mode = "pan";
      g.startX = rest.x;
      g.startY = rest.y;
      g.camX = cam.x;
      g.camY = cam.y;
      g.moved = true;
      g.tapOk = false;
    }
  };

  // ── draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(
    (tIn: number) => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const { w, h, dpr, base } = sizeRef.current;
      if (w < 4 || h < 4) return;
      const reduced = reducedRef.current;
      const t = reduced ? 0 : tIn;
      const cam = cameraRef.current;
      const sc = base * cam.zoom;
      const model = modelRef.current;
      const d = dataRef.current;
      const w2sx = (wx: number) => (wx - cam.x) * sc + w / 2;
      const w2sy = (wy: number) => (wy - cam.y) * sc + h / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000a10";
      ctx.fillRect(0, 0, w, h);

      // ── world-space pass: sea, scenery, islands ──
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(sc, sc);
      ctx.translate(-cam.x, -cam.y);

      const sprites = spritesRef.current;

      // ── primary water: a smooth navy -> teal radial gradient BASE, with the
      // seamless painterly ocean texture composited on top. The gradient base is
      // always laid down first so that even if the tiled texture shows a hairline
      // seam at a tile boundary, the smooth gradient reads underneath instead of a
      // hard band. The texture is tiled across the whole world in world space and
      // scrolls very slowly; if the asset is missing the gradient base alone is
      // the water.
      const sea = ctx.createRadialGradient(1000, 920, 60, 1000, 1000, 1500);
      sea.addColorStop(0, "#0a3a44");
      sea.addColorStop(0.55, "#052733");
      sea.addColorStop(1, "#01121b");
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, WORLD, WORLD);

      const oceanSp = sprites?.["ocean"];
      if (oceanSp?.ok) {
        // Draw the painted ocean ONCE, cover-scaled to fill the whole world.
        // Tiling it (even with nearest-neighbour sampling) stamped faint regular
        // horizontal seams across the water, because the AI texture is not a
        // perfectly wrappable tile. A single stretched draw has no repeats, so no
        // lines. The radial gradient base below shows through the slight alpha,
        // and the glints/plankton carry the motion the drift used to.
        const priorSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 0.92;
        const coverS = Math.max(WORLD / oceanSp.w, WORLD / oceanSp.h);
        const dw = oceanSp.w * coverS;
        const dh = oceanSp.h * coverS;
        ctx.drawImage(oceanSp.img, (WORLD - dw) / 2, (WORLD - dh) / 2, dw, dh);
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = priorSmoothing;
      }

      // subtle radial darkening / vignette laid ON TOP of the ocean texture for
      // depth: brighter, greener center fading to a deep navy at the edges.
      const vig = ctx.createRadialGradient(1000, 920, 60, 1000, 1000, 1500);
      vig.addColorStop(0, "rgba(14,70,82,0.18)");
      vig.addColorStop(0.55, "rgba(5,30,42,0.12)");
      vig.addColorStop(1, "rgba(1,12,20,0.62)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, WORLD, WORLD);

      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1 / sc;
      ctx.strokeRect(0, 0, WORLD, WORLD);

      // (Removed: the "slow large swells" — two broad 1300x130 light ellipses
      // drifting up the sea. Over the edge vignette they read as weird light
      // ovals, including out in the dark margin around the map.)

      // plankton glow (static positions, faint twinkle)
      ctx.fillStyle = "#7fe9ff";
      for (const p of PLANKTON) {
        ctx.globalAlpha = p.a * (reduced ? 1 : 0.65 + 0.35 * Math.sin(t * 0.5 + p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // (Removed, with the old shimmer + swells: the "scrolling wave-crest
      // ribbons" — faint sine strokes drifting across the world. They were the
      // light sine graphs showing through the swell ovals. The ocean texture,
      // gradient, plankton twinkle and the point sparkle glints below carry the
      // water cleanly, with no bands or ovals.)

      // sparkle glints winking on the swell
      if (!reduced) {
        ctx.fillStyle = "rgba(226,248,255,0.9)";
        for (const g of GLINTS) {
          const a = Math.pow(Math.max(0, Math.sin(t * g.sp + g.ph)), 8);
          if (a < 0.05) continue;
          ctx.globalAlpha = a * 0.8;
          ctx.beginPath();
          ctx.arc(g.x, g.y, g.r, 0, 6.283);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // faint compass-rose watermark in a corner of the chart
      {
        const rcx = 320;
        const rcy = 1680;
        const rR = 230;
        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = "#cfe6ff";
        ctx.lineWidth = 2.5 / sc + 1;
        ctx.beginPath();
        ctx.arc(rcx, rcy, rR, 0, 6.283);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rcx, rcy, rR * 0.7, 0, 6.283);
        ctx.stroke();
        ctx.fillStyle = "#cfe6ff";
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * 6.283;
          const long = k % 2 === 0;
          const tip = long ? rR : rR * 0.66;
          const wd = long ? 26 : 16;
          ctx.beginPath();
          ctx.moveTo(rcx + Math.cos(a) * tip, rcy + Math.sin(a) * tip);
          ctx.lineTo(rcx + Math.cos(a + 1.571) * wd, rcy + Math.sin(a + 1.571) * wd);
          ctx.lineTo(rcx + Math.cos(a - 1.571) * wd, rcy + Math.sin(a - 1.571) * wd);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      if (model) {
        // open-water atmosphere: a few faint drifting mist patches, nothing else.
        const deco = model.deco;
        ctx.save();
        for (const m of deco.mist) {
          const dx = reduced ? 0 : Math.sin(t * 0.05 + m.ph) * m.drift;
          const dy = reduced ? 0 : Math.cos(t * 0.04 + m.ph) * m.drift * 0.5;
          const mx = m.x + dx;
          const my = m.y + dy;
          const grad = ctx.createRadialGradient(mx, my, m.r * 0.1, mx, my, m.r);
          grad.addColorStop(0, `rgba(206,224,232,${m.a})`);
          grad.addColorStop(1, "rgba(206,224,232,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(mx, my, m.r, 0, 6.283);
          ctx.fill();
        }
        ctx.restore();

        // ── islands: one self-contained painted sprite each + LIGHT live
        // overlays (subtle foam ring, a single warm harbor glow, the faction
        // pennant). The sprite already carries all the sand/town/fort/docks, so
        // these stay faint and never fight the art. ──
        ctx.imageSmoothingEnabled = true; // painted island composites read smooth
        for (const isl of model.islands) {
          const { cx, cy, R, f } = isl;
          const bob = reduced ? 0 : Math.sin(t * 0.5 + isl.bobPh) * 3;

          // a very faint white foam ring at the waterline (kept subtle so it does
          // not clash with the island's own painted beach)
          const foam = reduced ? 0.5 : 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.9 + isl.foamPh));
          ctx.save();
          ctx.globalAlpha = foam * 0.3;
          ctx.strokeStyle = "rgba(244,253,255,0.9)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy + bob, R * (1.0 + (reduced ? 0.04 : 0.04 + 0.02 * Math.sin(t * 1.1 + isl.foamPh))), 0, 6.283);
          ctx.stroke();
          ctx.restore();

          // RAID TARGET (bottoken): a dark siege shadow on the water so the lone
          // hold-out reads as "under attack". The red siege ring goes on top, below.
          if (isl.f.raid) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = "#1a0606";
            ctx.beginPath();
            ctx.arc(cx, cy + bob, R * 1.55, 0, 6.283);
            ctx.fill();
            ctx.restore();
          }

          // the offscreen-cached island composite (built once per domain+level)
          let comp = islandCacheRef.current.get(isl.cacheKey);
          if (!comp) {
            comp = buildIslandCanvas(isl, sprites);
            islandCacheRef.current.set(isl.cacheKey, comp);
          }
          ctx.drawImage(comp, cx - comp.width / 2, cy + bob - comp.height / 2);

          // one soft warm harbor glow at the island's dock side (gentle flicker)
          {
            const hx = cx + Math.cos(isl.harborA) * R * 0.78;
            const hy = cy + bob + Math.sin(isl.harborA) * R * 0.78;
            const fl = reduced ? 0.85 : 0.7 + 0.3 * Math.sin(t * 3 + isl.foamPh);
            ctx.save();
            ctx.globalAlpha = 0.4 * fl;
            const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.22);
            glow.addColorStop(0, "rgba(255,196,110,0.9)");
            glow.addColorStop(1, "rgba(255,196,110,0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(hx, hy, R * 0.22, 0, 6.283);
            ctx.fill();
            ctx.restore();
          }

          // faction-color vector pennant/banner planted on the island
          const fx = cx;
          const fy = cy + bob - R * 0.42;
          const flick = reduced ? 0 : Math.sin(t * 2.5 + isl.foamPh) * 3;
          ctx.strokeStyle = "#cdbfa3";
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx, fy - 38);
          ctx.stroke();
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.moveTo(fx, fy - 38);
          ctx.lineTo(fx + 26, fy - 31 + flick);
          ctx.lineTo(fx, fy - 22);
          ctx.closePath();
          ctx.fill();

          // RAID TARGET: a red pulsing siege ring on top of the island.
          if (isl.f.raid) {
            const pulse = reduced ? 0.7 : 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.7));
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.strokeStyle = "#ff4d4d";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, cy + bob, R * (1.16 + (reduced ? 0 : 0.05 * Math.sin(t * 1.7))), 0, 6.283);
            ctx.stroke();
            ctx.restore();
          }
        }

        // ── storm over the underdog: the painted storm.png cloud, scaled to
        // cover the island, semi-transparent, with a gentle drift (frozen under
        // reduced motion). A faint vector cloud covers a missing asset. ──
        if (model.storm) {
          const st = model.storm;
          const stormSp = sprites?.["storm"];
          // a slow circular drift so the cloud hangs over the island and breathes
          const drift = st.R * 0.12;
          const dx = reduced ? 0 : Math.sin(t * 0.2) * drift;
          const dy = reduced ? 0 : Math.cos(t * 0.16) * drift * 0.5;
          ctx.save();
          // dim shadow under the cloud so the island reads as "in shadow"
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = "#04101a";
          ctx.beginPath();
          ctx.arc(st.cx, st.cy - st.R * 0.2, st.R * 1.5, 0, 6.283);
          ctx.fill();
          ctx.globalAlpha = 1;

          if (stormSp?.ok) {
            ctx.imageSmoothingEnabled = true;
            ctx.globalAlpha = 0.9;
            // cover the island generously; the cloud sits a little high so its
            // rain falls onto the island below.
            drawSpriteH(ctx, stormSp, st.cx + dx, st.cy - st.R * 0.25 + dy, st.R * 2.6);
            ctx.globalAlpha = 1;
          } else {
            // vector fallback: a couple of soft dark puffs over the island
            for (let i = 0; i < 3; i++) {
              const px = st.cx + (i - 1) * st.R * 0.55 + dx;
              const py = st.cy - st.R * 0.35 + dy;
              const r2 = st.R * (0.7 - i * 0.06);
              const g = ctx.createRadialGradient(px, py, r2 * 0.2, px, py, r2);
              g.addColorStop(0, "rgba(34,42,56,0.92)");
              g.addColorStop(1, "rgba(12,18,28,0)");
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(px, py, r2, 0, 6.283);
              ctx.fill();
            }
          }
          ctx.restore();
        }
      }
      ctx.restore();

      // ── screen-space pass: plates, ships, beacons, cask ──
      if (model && d) {
        // island name plates fade in past zoom 1.2
        if (cam.zoom > 1.2) {
          const a = Math.min(1, (cam.zoom - 1.2) / 0.4);
          const stormDomain = d.storm?.faction || null;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (const isl of model.islands) {
            const sx = w2sx(isl.cx);
            const sy = w2sy(isl.cy + isl.R * 1.3);
            if (sx < -160 || sx > w + 160 || sy < -60 || sy > h + 60) continue;
            const line2 = `${isl.f.shipCount} crew · Lv ${isl.f.level}`;
            // sub-lines beneath the fleet count: prize (crewed factions) + storm.
            const subs: { text: string; color: string }[] = [];
            const payout = isl.f.projectedPayout || 0;
            if (isl.f.shipCount > 0 && payout > 0) {
              subs.push({ text: `~$${Math.round(payout).toLocaleString()} prize`, color: GOLD });
            }
            if (stormDomain && isl.f.domain === stormDomain) {
              subs.push({ text: "Underdog wind", color: "rgba(180,205,255,0.92)" });
            }
            // widest line drives the plate width
            ctx.font = "600 12px system-ui, sans-serif";
            let pw = ctx.measureText(isl.f.domain).width;
            ctx.font = "11px system-ui, sans-serif";
            pw = Math.max(pw, ctx.measureText(line2).width);
            for (const su of subs) pw = Math.max(pw, ctx.measureText(su.text).width);
            pw += 20;
            const rows = 2 + subs.length;
            const ph = 14 * rows + 6;
            ctx.globalAlpha = a;
            rr(ctx, sx - pw / 2, sy - ph / 2, pw, ph, 8);
            ctx.fillStyle = "rgba(2,17,24,0.72)";
            ctx.fill();
            ctx.strokeStyle = isl.f.color;
            ctx.globalAlpha = a * 0.4;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = a;
            let ly = sy - ph / 2 + 13;
            ctx.fillStyle = FG;
            ctx.font = "600 12px system-ui, sans-serif";
            ctx.fillText(isl.f.domain, sx, ly);
            ly += 15;
            ctx.fillStyle = FG3;
            ctx.font = "11px system-ui, sans-serif";
            ctx.fillText(line2, sx, ly);
            for (const su of subs) {
              ly += 14;
              ctx.fillStyle = su.color;
              ctx.fillText(su.text, sx, ly);
            }
            ctx.globalAlpha = 1;
          }
        }

        // Always-on RAID banner over the centre island, so players see the target
        // even fully zoomed out.
        {
          const raidIsl = model.islands.find((i) => i.f.raid);
          if (raidIsl) {
            const sx = w2sx(raidIsl.cx);
            const sy = w2sy(raidIsl.cy - raidIsl.R * 1.4);
            const txt = "⚔️ RAID  bottoken.com";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "700 14px system-ui, sans-serif";
            const pw = ctx.measureText(txt).width + 24;
            ctx.globalAlpha = reduced ? 1 : 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(t * 1.7));
            rr(ctx, sx - pw / 2, sy - 14, pw, 28, 9);
            ctx.fillStyle = "rgba(40,6,6,0.9)";
            ctx.fill();
            ctx.strokeStyle = "#ff4d4d";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = "#ffd9d9";
            ctx.fillText(txt, sx, sy + 1);
            ctx.globalAlpha = 1;
          }
        }

        // ships
        const sel = selectionRef.current;
        const selShipId = sel && sel.kind === "ship" ? sel.ship.id : null;
        const showLabels = cam.zoom > 2;
        let labelBudget = 60;
        let mine: ShipModel | null = null;

        const drawShip = (m: ShipModel, isMine: boolean) => {
          const sx = w2sx(m.wx);
          const sy0 = w2sy(m.wy);
          if (sx < -60 || sx > w + 60 || sy0 < -60 || sy0 > h + 60) return;
          const s = m.px * cam.zoom;
          const bob = reduced ? 0 : Math.sin(t * 0.8 + m.phase) * 2;
          const sway = reduced ? 0 : Math.sin(t * 0.7 + m.phase * 1.3) * 0.07;
          const sy = sy0 + bob;

          if (isMine) {
            const halo = s * 1.25 + (reduced ? 0 : Math.sin(t * 2.4) * 2);
            ctx.beginPath();
            ctx.arc(sx, sy, halo, 0, 6.283);
            ctx.fillStyle = "rgba(240,180,92,0.10)";
            ctx.fill();
            ctx.strokeStyle = GOLD;
            ctx.lineWidth = 2;
            ctx.globalAlpha = reduced ? 0.9 : 0.65 + 0.3 * Math.sin(t * 2.4);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          if (m.s.id === selShipId) {
            ctx.beginPath();
            ctx.arc(sx, sy, s * 1.15, 0, 6.283);
            ctx.strokeStyle = "rgba(248,253,255,0.7)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // raiders trail a small white wake (drawn behind the hull)
          if (m.raiding) {
            const wlen = s * (1.1 + (reduced ? 0 : 0.25 + 0.25 * Math.sin(t * 2 + m.phase)));
            ctx.strokeStyle = "rgba(248,253,255,0.5)";
            ctx.lineWidth = Math.max(1, s * 0.12);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(sx - s * 0.18, sy + s * 0.34);
            ctx.lineTo(sx - wlen, sy + s * 0.34 + s * 0.18);
            ctx.moveTo(sx + s * 0.18, sy + s * 0.34);
            ctx.lineTo(sx + wlen * 0.7, sy + s * 0.34 + s * 0.22);
            ctx.stroke();
            ctx.lineCap = "butt";
          }

          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(sway);

          // painted top-down hull by class (bow already points up in the art, so
          // no facing rotation is applied, only the gentle bob/sway). Sized to
          // drawH * zoom, width tracking the sprite aspect. Falls back to a vector
          // hull + sails if the sprite is missing, so a lost asset never blanks
          // a ship.
          const hullSp = sprites?.[m.sprite];
          // mast height (sprite hull "points up", so the mast/pennant sit above it)
          const hullH = m.drawH * cam.zoom;
          const mastTop = -hullH * 0.62;
          if (hullSp?.ok) {
            ctx.imageSmoothingEnabled = true; // painterly hulls read smooth
            const hullW = (hullSp.w / hullSp.h) * hullH;
            ctx.drawImage(hullSp.img, -hullW / 2, -hullH * 0.5, hullW, hullH);
            // faction-color vector pennant on the mast (hull stays un-washed).
            // Worn skins are full side-on ships with their own sails/flags, so the
            // floating mast pennant is skipped for them.
            if (!m.isSkin) {
              ctx.strokeStyle = "#e6ddcb";
              ctx.lineWidth = Math.max(1, s * 0.06);
              ctx.beginPath();
              ctx.moveTo(0, -hullH * 0.42);
              ctx.lineTo(0, mastTop);
              ctx.stroke();
              const pflick = reduced ? 0 : Math.sin(t * 5 + m.phase) * 0.05 * s;
              ctx.fillStyle = m.color;
              ctx.beginPath();
              ctx.moveTo(0, mastTop);
              ctx.lineTo(0.3 * s, mastTop + 0.06 * s + pflick);
              ctx.lineTo(0, mastTop + 0.16 * s);
              ctx.closePath();
              ctx.fill();
            }
          } else {
            // vector fallback hull + mast + faction sails
            ctx.fillStyle = "#33271a";
            ctx.beginPath();
            ctx.moveTo(-0.5 * s, 0.05 * s);
            ctx.lineTo(0.5 * s, 0.05 * s);
            ctx.lineTo(0.3 * s, 0.32 * s);
            ctx.lineTo(-0.3 * s, 0.32 * s);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#d9d2c4";
            ctx.lineWidth = Math.max(1, s * 0.07);
            ctx.beginPath();
            ctx.moveTo(0, 0.05 * s);
            ctx.lineTo(0, -0.62 * s);
            ctx.stroke();
            ctx.fillStyle = m.color;
            ctx.beginPath();
            ctx.moveTo(0.04 * s, -0.6 * s);
            ctx.lineTo(0.4 * s, -0.12 * s);
            ctx.lineTo(0.04 * s, -0.08 * s);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            ctx.moveTo(-0.04 * s, -0.48 * s);
            ctx.lineTo(-0.3 * s, -0.1 * s);
            ctx.lineTo(-0.04 * s, -0.08 * s);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          // raiders fly a faint red raid pennant off the masthead (class vessels
          // only; skins keep their own silhouette clean)
          if (m.raiding && !m.isSkin) {
            const flick = reduced ? 0 : Math.sin(t * 6 + m.phase) * 0.08 * s;
            const ptop = hullSp?.ok ? mastTop - 0.04 * s : -0.62 * s;
            ctx.fillStyle = "rgba(232,72,72,0.85)";
            ctx.beginPath();
            ctx.moveTo(0, ptop);
            ctx.lineTo(0.32 * s, ptop - 0.04 * s + flick);
            ctx.lineTo(0, ptop + 0.12 * s);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();

          // Colorblind fleet marker: a small shape badge above the hull. Shape
          // encodes the fleet (not just colour), drawn in screen space so it
          // reads the same on skinned ships and the vector-fallback hull, and
          // never rotates. The matching shapes key the bottom legend.
          if (m.glyph >= 0) {
            const gr = Math.max(2.5, s * 0.22);
            const gy = sy - m.drawH * cam.zoom * 0.66 - gr;
            fleetGlyphPath(ctx, m.glyph, sx, gy, gr);
            ctx.fillStyle = m.color;
            ctx.fill();
            ctx.lineWidth = Math.max(0.75, gr * 0.22);
            ctx.strokeStyle = "rgba(3,18,26,0.92)";
            ctx.stroke();
          }

          const wantLabel =
            (showLabels && labelBudget > 0) || m.s.id === selShipId;
          if (wantLabel && !isMine) {
            if (showLabels) labelBudget--;
            ctx.font = "10px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.strokeStyle = "rgba(0,15,22,0.85)";
            ctx.lineWidth = 3;
            ctx.strokeText(m.s.name, sx, sy - s * 0.85);
            ctx.fillStyle = FG3;
            ctx.fillText(m.s.name, sx, sy - s * 0.85);
          }
          if (isMine) {
            ctx.font = "700 11px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.strokeStyle = "rgba(0,15,22,0.85)";
            ctx.lineWidth = 3;
            ctx.strokeText("You", sx, sy + s + 14);
            ctx.fillStyle = GOLD;
            ctx.fillText("You", sx, sy + s + 14);
          }
        };

        for (const m of model.ships) {
          if (myIdRef.current && m.s.id === myIdRef.current) {
            mine = m;
            continue;
          }
          drawShip(m, false);
        }
        if (mine) drawShip(mine, true);

        // beacons: pulsing gold ring + icon
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const m of model.beacons) {
          const sx = w2sx(m.wx);
          const sy = w2sy(m.wy);
          if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue;
          const phases = reduced ? [0.35] : [(t % 2) / 2, ((t + 1) % 2) / 2];
          for (const p of phases) {
            ctx.beginPath();
            ctx.arc(sx, sy, (8 + p * 26) * cam.zoom, 0, 6.283);
            ctx.strokeStyle = GOLD;
            ctx.globalAlpha = (1 - p) * 0.5;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.font = `${Math.round(15 * cam.zoom)}px system-ui, sans-serif`;
          ctx.fillText(BEACON_ICON[m.b.kind] || "⚔️", sx, sy);
        }

        // the Lookout cask: small barrel + 1.5s glint, no ring
        if (d.lookout.active) {
          const sp = getSpawn();
          const sx = w2sx(sp.x * WORLD);
          const sy = w2sy(sp.y * WORLD);
          if (sx > -40 && sx < w + 40 && sy > -40 && sy < h + 40) {
            const s = 9 * cam.zoom;
            const bw = s * 1.2;
            const bh = s * 1.4;
            ctx.fillStyle = "#7b4f24";
            ctx.strokeStyle = "#3f2a12";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - bw / 2, sy - bh / 2);
            ctx.quadraticCurveTo(sx - bw * 0.72, sy, sx - bw / 2, sy + bh / 2);
            ctx.lineTo(sx + bw / 2, sy + bh / 2);
            ctx.quadraticCurveTo(sx + bw * 0.72, sy, sx + bw / 2, sy - bh / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = "rgba(202,160,92,0.9)";
            ctx.lineWidth = Math.max(1, s * 0.12);
            for (const hy of [-bh * 0.18, bh * 0.18]) {
              ctx.beginPath();
              ctx.moveTo(sx - bw * 0.58, sy + hy);
              ctx.lineTo(sx + bw * 0.58, sy + hy);
              ctx.stroke();
            }
            // glint
            const ph = (t % 1.5) / 1.5;
            const a = reduced ? 0.65 : Math.pow(Math.max(0, Math.sin(Math.PI * ph)), 6);
            if (a > 0.02) {
              const gx = sx + bw * 0.5;
              const gy = sy - bh * 0.6;
              const L = s * 0.9 * (0.6 + 0.4 * a);
              ctx.strokeStyle = `rgba(255,236,190,${a.toFixed(3)})`;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(gx - L, gy);
              ctx.lineTo(gx + L, gy);
              ctx.moveTo(gx, gy - L);
              ctx.lineTo(gx, gy + L);
              ctx.moveTo(gx - L * 0.45, gy - L * 0.45);
              ctx.lineTo(gx + L * 0.45, gy + L * 0.45);
              ctx.stroke();
            }
          }
        }

        // claim burst
        const burst = burstRef.current;
        if (burst && !reduced) {
          const q = (t - burst.at) / 1.2;
          if (q >= 0 && q <= 1) {
            const sx = w2sx(burst.wx);
            const sy = w2sy(burst.wy);
            ctx.strokeStyle = GOLD_BRIGHT;
            ctx.globalAlpha = 1 - q;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, 10 + q * 60, 0, 6.283);
            ctx.stroke();
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * 6.283;
              ctx.beginPath();
              ctx.moveTo(sx + Math.cos(a) * (8 + q * 30), sy + Math.sin(a) * (8 + q * 30));
              ctx.lineTo(sx + Math.cos(a) * (16 + q * 52), sy + Math.sin(a) * (16 + q * 52));
              ctx.stroke();
            }
            ctx.font = "700 16px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = GOLD_BRIGHT;
            ctx.fillText("+40 💰", sx, sy - 26 - q * 36);
            ctx.globalAlpha = 1;
          } else if (q > 1) {
            burstRef.current = null;
          }
        }
      }
    },
    [getSpawn],
  );

  // ── one rAF loop: pause when hidden, static frame when reduced motion ─────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = () => {
      reducedRef.current = mq.matches;
      dirtyRef.current = true;
    };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onMq);

    let rafId = 0;
    const loop = (ts: number) => {
      rafId = requestAnimationFrame(loop);
      if (reducedRef.current) {
        if (dirtyRef.current) {
          dirtyRef.current = false;
          draw(0);
        }
        return;
      }
      draw(ts / 1000);
    };
    const start = () => {
      if (!rafId) {
        dirtyRef.current = true;
        rafId = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onMq);
    };
  }, [draw]);

  // live countdown while a beacon card is open
  useEffect(() => {
    if (!selection || selection.kind !== "beacon") return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [selection]);

  // ── DOM chrome ────────────────────────────────────────────────────────────
  const factionOf = useMemo(() => {
    const m = new Map<string, MapFaction>();
    for (const f of data?.factions || []) m.set(f.domain, f);
    return m;
  }, [data]);

  // The captain's own ship, found in the already-fetched map snapshot (NO new
  // endpoint). myId is the page's public id; ship.id is the same public id.
  const myShip = useMemo(
    () => (myId ? data?.ships.find((s) => s.id === myId) || null : null),
    [data, myId],
  );

  const ribbon = (text: string) => (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "44%",
        transform: "translate(-50%, -50%)",
        padding: "12px 22px",
        background: "rgba(2,17,24,0.78)",
        border: "1px solid rgba(240,180,92,0.4)",
        borderRadius: 12,
        color: FG,
        fontSize: 15,
        letterSpacing: "0.02em",
        fontFamily: "system-ui, sans-serif",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );

  const cardStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    bottom: 14,
    width: "min(360px, calc(100vw - 24px))",
    background: "rgba(2,17,24,0.92)",
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 14,
    padding: "12px 14px",
    color: FG,
    fontFamily: "system-ui, sans-serif",
    zIndex: 6,
  };

  const closeBtn = (
    <button
      onClick={() => setSelection(null)}
      aria-label="Close"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 999,
        border: `1px solid ${HAIRLINE}`,
        background: "rgba(248,253,255,0.06)",
        color: FG3,
        fontSize: 13,
        cursor: "pointer",
        lineHeight: "26px",
        padding: 0,
      }}
    >
      ✕
    </button>
  );

  let card: React.ReactNode = null;
  if (selection?.kind === "ship") {
    const sh = selection.ship;
    const f = sh.faction ? factionOf.get(sh.faction) : undefined;
    const car = sh.career;
    // vessel art: the worn doubloon skin if any, else the hull-class vessel —
    // the same sprite the canvas draws.
    const vesselSrc = `${ART_DIR}${(sh.skin && SKIN_SPRITE[sh.skin]) || SHIP_SPRITE[sh.cls] || "vessel-frigate"}.png`;
    // faction crest art (matches the /seas page), keyed by the lowercased domain.
    // Tiered emblem (bonding upgrade) with a one-shot fallback to the legacy crest.
    const crestSrc = f ? emblemSrc(f.domain, f.tier) : null;
    const crestFallback = f ? legacyCrestSrc(f.domain) : null;

    // prefilled celebration for the X share. Both the text and the map URL are
    // URL-encoded. No em-dashes, public-safe (glory + class only, never dollars).
    const shareText = `${sh.name} sails the ${f ? f.domain : "free"} fleet in Conquer the Seas. ${sh.glory.toLocaleString()} glory aboard a ${sh.cls}.`;
    const shareUrl = "https://seas.web3guides.com/seas/map";
    const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      shareText,
    )}&url=${encodeURIComponent(shareUrl)}`;

    // one labelled contribution row.
    const statRow = (label: string, value: string, valueColor: string) => (
      <div
        key={label}
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          padding: "9px 12px",
          borderRadius: 10,
          background: "rgba(248,253,255,0.04)",
          border: `1px solid ${HAIRLINE}`,
        }}
      >
        <span
          style={{
            color: FG3,
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          style={{
            color: valueColor,
            fontSize: 16,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
      </div>
    );

    card = (
      <div
        onClick={() => setSelection(null)}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          background: "rgba(0,8,14,0.62)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`${sh.name} — captain showcase`}
          style={{
            position: "relative",
            width: "min(500px, calc(100vw - 32px))",
            maxHeight: "calc(100% - 32px)",
            overflowY: "auto",
            background: "linear-gradient(180deg, rgba(5,28,38,0.97) 0%, rgba(2,17,24,0.97) 100%)",
            border: `1px solid ${HAIRLINE}`,
            borderRadius: 20,
            boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            padding: "22px 22px 20px",
            color: FG,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <button
            onClick={() => setSelection(null)}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 34,
              height: 34,
              borderRadius: 999,
              border: `1px solid ${HAIRLINE}`,
              background: "rgba(248,253,255,0.06)",
              color: FG3,
              fontSize: 15,
              cursor: "pointer",
              lineHeight: "32px",
              padding: 0,
              zIndex: 1,
            }}
          >
            ✕
          </button>

          {/* fleet line: flag + crest + domain + class */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 40 }}>
            {crestSrc && (
              <img
                src={crestSrc}
                alt=""
                width={44}
                height={44}
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement;
                  // First failure: drop to the legacy crest. Second: hide.
                  if (crestFallback && el.src.indexOf("emblem-") !== -1) el.src = crestFallback;
                  else el.style.display = "none";
                }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  objectFit: "cover",
                  border: `1px solid ${HAIRLINE}`,
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: FG3,
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>{f ? `${f.flag} ${f.domain}` : "🏳️ Free sailor"}</span>
              </div>
              <div
                style={{
                  color: GOLD,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginTop: 3,
                }}
              >
                {sh.cls}
              </div>
            </div>
          </div>

          {/* captain name (large) */}
          <div
            style={{
              fontWeight: 800,
              fontSize: 28,
              lineHeight: 1.1,
              marginTop: 14,
              letterSpacing: "-0.01em",
            }}
          >
            {sh.icon} {sh.name}
          </div>

          {sh.state === "raiding" && (
            <div style={{ color: "#ff7b7b", fontSize: 13, marginTop: 8, fontWeight: 700 }}>
              🚩 Raiding the open waters today
            </div>
          )}

          {/* the vessel sprite, framed */}
          <div
            style={{
              marginTop: 16,
              borderRadius: 16,
              background:
                "radial-gradient(120% 90% at 50% 30%, rgba(14,70,82,0.55) 0%, rgba(2,17,24,0.2) 70%, rgba(2,17,24,0) 100%)",
              border: `1px solid ${HAIRLINE}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px 16px",
              minHeight: 150,
            }}
          >
            <img
              src={vesselSrc}
              alt={`${sh.cls} vessel`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.opacity = "0";
              }}
              style={{
                height: 150,
                width: "auto",
                maxWidth: "100%",
                objectFit: "contain",
                filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.5))",
              }}
            />
          </div>

          {/* contribution breakdown */}
          <div
            style={{
              color: GOLD,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginTop: 18,
              marginBottom: 8,
            }}
          >
            Contribution
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {statRow("⭐ Glory", sh.glory.toLocaleString(), GOLD_BRIGHT)}
            {statRow("💰 Doubloons", sh.doubloons.toLocaleString(), FG)}
            {/* Holding is a public-safe tier: the hull CLASS NAME only, never a dollar figure. */}
            {statRow("🚢 Holding", sh.cls, FG)}
          </div>

          {/* S1 service record, if this captain has one */}
          {car && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 13,
                borderTop: `1px solid ${HAIRLINE}`,
              }}
            >
              <div
                style={{
                  color: GOLD,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Last season · Service Record S1
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 7,
                  fontSize: 13,
                }}
              >
                {car.s1Team && <span style={{ color: FG3 }}>⚓ {car.s1Team}</span>}
                {typeof car.s1Rank === "number" && <span style={{ color: FG }}>Rank #{car.s1Rank}</span>}
                {typeof car.s1Points === "number" && (
                  <span style={{ color: FG }}>{car.s1Points.toLocaleString()} pts</span>
                )}
                {car.s1Founder && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "1px 9px",
                      borderRadius: 999,
                      background: "rgba(240,180,92,0.16)",
                      border: "1px solid rgba(240,180,92,0.5)",
                      color: GOLD_BRIGHT,
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                  >
                    🏅 Founder
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Share on X */}
          <a
            href={tweetHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 18,
              padding: "12px 16px",
              borderRadius: 12,
              background: GOLD,
              color: INK,
              fontWeight: 800,
              fontSize: 14.5,
              letterSpacing: "0.01em",
              textDecoration: "none",
            }}
          >
            Share on X
          </a>
        </div>
      </div>
    );
  } else if (selection?.kind === "island") {
    const f = selection.faction;
    const payout = f.projectedPayout ?? 0;
    const failed = Boolean(f.failed) && !f.bonded;
    const tierName = f.bonded ? "Bonded" : failed ? "Failed" : f.tier === "t2" ? "Rallying" : "Rising";
    card = (
      <div style={cardStyle}>
        {closeBtn}
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 30 }}>
          <img
            src={emblemSrc(f.domain, f.tier)}
            alt=""
            width={48}
            height={48}
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              if (el.src.indexOf("emblem-") !== -1) el.src = legacyCrestSrc(f.domain);
              else el.style.display = "none";
            }}
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              objectFit: "cover",
              border: `1px solid ${HAIRLINE}`,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {f.flag} {f.domain}
            </div>
            <div style={{ color: FG3, fontSize: 12.5, marginTop: 2 }}>
              {f.shipCount} {f.shipCount === 1 ? "ship" : "ships"} · Level {f.level} · {tierName}
              {f.bonded ? " 🏆" : failed ? " 💀" : ""}
            </div>
          </div>
        </div>
        {f.raid ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#ff8f8f", fontSize: 13.5, fontWeight: 700 }}>⚔️ The last domain. Raid it.</div>
            <div style={{ color: FG3, fontSize: 12.5, marginTop: 6 }}>
              Buy and hold bottoken.com to bond it. Everyone who buys $10+ shares $300; the top fleet splits +$100. Pays only if it bonds.
            </div>
            <div style={{ color: GOLD, fontSize: 12.5, marginTop: 6 }}>app.doma.xyz/domain/bottoken.com · check your cut with !bosses me</div>
          </div>
        ) : failed ? (
          <div style={{ color: "#ff8f8f", fontSize: 13, marginTop: 8, fontWeight: 600 }}>
            💀 This fleet did not bond before its window closed. It is closed and wins $0. Pick another fleet.
          </div>
        ) : (
          <>
            {payout > 0 ? (
              <div style={{ color: GOLD, fontSize: 13, marginTop: 8, fontWeight: 600 }}>
                🏆 In the money. About ${payout} prize at season end.
              </div>
            ) : (
              <div style={{ color: FG3, fontSize: 13, marginTop: 8 }}>
                Outside the top 3. Climb the standings to win a cash share.
              </div>
            )}
            <div style={{ color: FG3, fontSize: 12.5, marginTop: 8 }}>
              Fly this flag for free: type !seas enlist in Discord. Hold {f.domain} to earn Glory daily (up to $100) and grow your ship into a cash share.
            </div>
          </>
        )}
      </div>
    );
  } else if (selection?.kind === "beacon") {
    const b = selection.beacon;
    const remain = b.resolveAt ? new Date(b.resolveAt).getTime() - nowTick : 0;
    const isResult = b.kind === "result";
    card = (
      <div style={cardStyle}>
        {closeBtn}
        <div style={{ fontWeight: 600, fontSize: 15, paddingRight: 30 }}>{b.title}</div>
        {isResult && (b.winnerFlag || b.winnerFaction) && (
          <div style={{ fontSize: 13.5, marginTop: 6, fontWeight: 700, color: FG }}>
            {b.winnerFlag ? `${b.winnerFlag} ` : "🏆 "}
            {b.winnerFaction || "The open sea"} takes the day
          </div>
        )}
        {isResult && b.hero && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: 10,
              background: "rgba(240,180,92,0.14)",
              border: "1px solid rgba(240,180,92,0.45)",
            }}
          >
            <span style={{ fontSize: 16 }}>🏴‍☠️</span>
            <span style={{ fontSize: 13.5 }}>
              <span style={{ color: FG3 }}>Last afloat: </span>
              <span style={{ color: GOLD_BRIGHT, fontWeight: 700 }}>{b.hero}</span>
            </span>
          </div>
        )}
        <div style={{ color: FG3, fontSize: 13, marginTop: 6 }}>{b.line}</div>
        {remain > 0 && (
          <div style={{ color: GOLD, fontSize: 13, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
            ⏳ {fmtRemain(remain)}
          </div>
        )}
      </div>
    );
  } else if (selection?.kind === "cask-guest") {
    card = (
      <div style={cardStyle}>
        {closeBtn}
        <div style={{ fontWeight: 600, fontSize: 15, paddingRight: 30 }}>✨ A glinting cask</div>
        <div style={{ color: FG3, fontSize: 13, marginTop: 4 }}>
          Type !seas missions in Discord to claim finds.
        </div>
      </div>
    );
  }

  // ── overlay panels: public leaderboard + the captain's own ship ───────────
  // Both live in the absolute-positioned chrome layer (NOT on the canvas) and
  // collapse to a slim header so they never cover the map. Public-safe: only
  // rank / flag / name / glory / class / doubloons render. NEVER any dollars.
  const panelHeader = (
    label: string,
    open: boolean,
    toggle: () => void,
  ): React.ReactNode => (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: open ? "2px 2px 8px" : 0,
        background: "transparent",
        border: "none",
        color: GOLD,
        fontFamily: "system-ui, sans-serif",
        fontWeight: 700,
        fontSize: 11.5,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span style={{ color: FG3, fontSize: 12, lineHeight: 1 }}>{open ? "▾" : "▸"}</span>
    </button>
  );

  const leaderboardPanel = board && board.leaders.length > 0 && (
    <div
      style={{
        position: "absolute",
        top: 48,
        left: 12,
        width: "min(238px, calc(100vw - 24px))",
        maxHeight: "calc(100% - 96px)",
        display: "flex",
        flexDirection: "column",
        background: "rgba(2,17,24,0.92)",
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 14,
        padding: "10px 12px",
        color: FG,
        fontFamily: "system-ui, sans-serif",
        zIndex: 6,
      }}
    >
      {panelHeader("⚓ Top Captains", boardOpen, () => setBoardOpen((v) => !v))}
      {boardOpen && (
        <div style={{ overflowY: "auto", marginTop: 2, marginRight: -4, paddingRight: 4 }}>
          {board.leaders.map((l) => {
            const isMe = myId != null && l.id === myId;
            return (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 7px",
                  marginBottom: 2,
                  borderRadius: 9,
                  background: isMe ? "rgba(240,180,92,0.16)" : "transparent",
                  border: isMe ? "1px solid rgba(240,180,92,0.5)" : "1px solid transparent",
                  fontSize: 12.5,
                }}
              >
                <span
                  style={{
                    color: isMe ? GOLD_BRIGHT : FG3,
                    fontWeight: 700,
                    minWidth: 20,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {l.rank}
                </span>
                <span style={{ fontSize: 13 }}>{l.flag}</span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isMe ? FG : FG,
                    fontWeight: isMe ? 700 : 500,
                  }}
                  title={`${l.name} · ${l.cls}`}
                >
                  {CLASS_ICON[l.cls] || "⛵"} {l.name}
                </span>
                <span style={{ color: GOLD, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {l.glory.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const myShipFaction = myShip?.faction ? factionOf.get(myShip.faction) : undefined;
  const myShipPanel = (
    <div
      style={{
        position: "absolute",
        top: 48,
        right: 12,
        width: "min(216px, calc(100vw - 24px))",
        background: "rgba(2,17,24,0.92)",
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 14,
        padding: "10px 12px",
        color: FG,
        fontFamily: "system-ui, sans-serif",
        zIndex: 6,
      }}
    >
      {panelHeader("🧭 My Ship", shipOpen, () => setShipOpen((v) => !v))}
      {shipOpen &&
        (myShip ? (
          <div style={{ marginTop: 2 }}>
            <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{CLASS_ICON[myShip.cls] || "⛵"}</span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {myShip.name}
              </span>
            </div>
            <div style={{ color: FG3, fontSize: 12.5, marginTop: 4 }}>
              {myShipFaction ? `${myShipFaction.flag} ${myShipFaction.domain}` : "🏳️ Free sailor"}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 8,
                fontSize: 12.5,
              }}
            >
              <span
                style={{
                  padding: "2px 9px",
                  borderRadius: 999,
                  background: "rgba(248,253,255,0.06)",
                  border: `1px solid ${HAIRLINE}`,
                  color: FG,
                }}
              >
                {myShip.cls}
              </span>
              <span style={{ padding: "2px 4px", color: FG }}>
                💰 {myShip.doubloons.toLocaleString()}
              </span>
              <span style={{ padding: "2px 4px", color: GOLD }}>
                ⭐ {myShip.glory.toLocaleString()}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 2, color: FG3, fontSize: 12.5, lineHeight: 1.45 }}>
            Type !seas enlist in Discord to pick a flag, then !seas missions to sail.
          </div>
        ))}
    </div>
  );

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: INK,
        color: FG,
        overscrollBehavior: "none",
      }}
    >
      <GameHeader title="The World Map" captain={captain} />
      <div ref={wrapRef} style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            touchAction: "none",
            cursor: "grab",
            display: "block",
          }}
        />

        {data && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 12,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(2,17,24,0.66)",
              border: `1px solid ${HAIRLINE}`,
              color: FG3,
              fontSize: 11.5,
              fontFamily: "system-ui, sans-serif",
              zIndex: 4,
            }}
          >
            👁️ {data.lookout.claims} found it today
          </div>
        )}

        {data && (
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 14,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              maxWidth: "60%",
              zIndex: 4,
            }}
          >
            {data.factions.map((f, i) => (
              <span
                key={f.domain}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(2,17,24,0.66)",
                  border: `1px solid ${f.color}55`,
                  color: FG,
                  fontSize: 12,
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                <FleetGlyphSvg kind={i % FLEET_GLYPH_COUNT} color={f.color} />
                {f.flag} {f.domain} · ⛵ {f.shipCount}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            position: "absolute",
            right: 14,
            bottom: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            zIndex: 4,
          }}
        >
          {[
            { label: "+", factor: 1.35 },
            { label: "−", factor: 1 / 1.35 },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              aria-label={b.label === "+" ? "Zoom in" : "Zoom out"}
              onClick={() => {
                const { w, h } = sizeRef.current;
                zoomAt(w / 2, h / 2, b.factor);
              }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                border: `1px solid ${HAIRLINE}`,
                background: "rgba(3,24,32,0.85)",
                color: FG,
                fontSize: 22,
                cursor: "pointer",
                lineHeight: "44px",
                padding: 0,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {claimMsg && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 132,
              padding: "8px 16px",
              borderRadius: 999,
              background: claimMsg.gold ? "rgba(240,180,92,0.16)" : "rgba(2,17,24,0.85)",
              border: `1px solid ${claimMsg.gold ? "rgba(240,180,92,0.5)" : HAIRLINE}`,
              color: claimMsg.gold ? GOLD_BRIGHT : FG,
              fontWeight: 600,
              fontSize: 14,
              fontFamily: "system-ui, sans-serif",
              zIndex: 5,
              whiteSpace: "nowrap",
            }}
          >
            {claimMsg.text}
          </div>
        )}

        {(submitState === "sending" || submitState === "done") && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 72,
              width: "min(380px, calc(100vw - 24px))",
              zIndex: 5,
            }}
          >
            <ScoreBanner state={submitState} result={lastResult} score={1} />
          </div>
        )}

        {leaderboardPanel}
        {myShipPanel}

        {card}

        {data && data.ships.length === 0 && ribbon("The fleets are setting sail. Enlist with !seas enlist in Discord.")}
        {failed && !data && ribbon("The chart is wet. Reload.")}

        {!data && !failed && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: INK,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: FG3,
              fontSize: 14,
              letterSpacing: "0.04em",
              fontFamily: "system-ui, sans-serif",
              zIndex: 8,
            }}
          >
            Charting the sea…
          </div>
        )}
      </div>
    </div>
  );
}
