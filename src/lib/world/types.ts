/**
 * THE WORLD ENGINE CONTRACT — season-agnostic, and deliberately so.
 *
 * Every Launch Wars season has shipped a bespoke map: stars/map/SectorMap.tsx
 * (898 L), s4/map/HitListMap.tsx (2186 L), s5/map/SiegeMap.tsx (1366 L). About
 * 4,400 lines doing one job three ways, rewritten from scratch each season,
 * and the single biggest reason a new season takes a week.
 *
 * This file is the seam that ends that. The ENGINE (src/lib/world/*,
 * src/app/_world/*) is written once and never edited per season. A season
 * ships ONE WorldConfig (e.g. src/lib/s5/world.ts) plus an art folder plus a
 * strings block. That is the whole delta.
 *
 * It is the same move lib/s5/theme.ts already made for WORDS — one object, DB
 * overridable, no logic anywhere else knows the season's vocabulary — applied
 * to PLACES.
 *
 * CLIENT-SAFE, and it must stay that way: pure types and consts, no
 * "server-only" import, no next/headers, no data layer. Client components read
 * this directly; importing a VALUE from a server-only module into a "use
 * client" file passes tsc and breaks `next build` (CLAUDE.md, learned twice).
 */

/** Normalized position: fractions of the world box on both axes, always 0..1.
 * NEVER pixels. The stage resizes constantly and every season's map is a
 * different shape; the existing NODE_POS (SiegeMap.tsx:116) and FLEETS
 * (SectorMap.tsx:31) tables already use exactly this idiom. */
export type Vec2 = { x: number; y: number };

/**
 * The six kinds ARE the franchise DNA. Every season since S2 has had a base
 * you own, domains you attack, games you play, signposted nav, something
 * teased but locked, and other players to go look at. The engine bakes in the
 * KINDS and the behaviour that hangs off them; the season descriptor renames,
 * repositions and repaints them.
 *
 * Resist adding a seventh for a one-season gimmick — that is how a shared
 * engine rots back into a bespoke one. A gimmick is a "nav" site with its own
 * popup body.
 */
export type SiteKind =
  | "home" // your base. One per map.
  | "target" // an enemy domain. NOT authored here (see targetSlots).
  | "game" // a mini-game place. Binds to a game key via gameSlots.
  | "nav" // a diegetic link: workshop, kit, trophies, guides, news, board.
  | "locked" // painted, visibly closed, teasing. No route.
  | "roam"; // the way out to other players' bases.

/**
 * The vector fallback drawn when a site's art is missing, still loading, or
 * 404s. EVERY site sets one, no exceptions — that is what lets the map ship
 * and be fully playable before a single asset is painted, and what makes each
 * later art drop a pure file copy with zero code risk. Same contract the games
 * run on (games/_shared/art.ts: "TRY-IMAGE-ELSE-VECTOR, ALWAYS").
 */
export type GlyphKind =
  | "keep" // walled fort — strongholds
  | "camp" // tents + a fire — your base
  | "arcade" // a cabinet/tent — game places
  | "workshop" // gantry + a hull on blocks
  | "depot" // crate stacks — kit
  | "monument" // plinth — trophies
  | "school" // map tent — guides
  | "radio" // lattice mast — news
  | "board" // notice board — the war board
  | "plant" // cooling towers — the locked tease
  | "signpost" // fingerpost — roam
  | "tower"; // generic spare

/** What the second tap does. `game` resolves through WorldConfig.gameSlots so
 * a slate change never touches a site, a coordinate or a painting. */
export type SiteOpens =
  | { kind: "route"; href: string }
  | { kind: "popup"; body: string }
  | { kind: "game"; slot: string }
  | { kind: "locked"; note: string };

/** Ambient life hints. Purely declarative: WorldCanvas reads these and decides
 * how to spend its particle budget. A season never writes animation code. */
export type SiteLife = {
  /** Pulsing invitation — the "begging to be played" cue on game places. */
  glow?: boolean;
  /** A chimney//campfire smoke column. */
  smoke?: boolean;
  /** A flag that ripples. */
  flag?: boolean;
};

export type WorldSite = {
  /** Stable id AND the art basename. Never a game key — the slate churns
   * (four retirement waves in three days on S5) and a repaint is expensive. */
  key: string;
  kind: SiteKind;
  /** Player-visible name. Seasons that localize pass an already-resolved
   * string; the engine never reaches into a dict itself. */
  label: string;
  /** One line of flavour under the label in the popup. */
  blurb?: string;
  /** GROUND-CONTACT point (where the building meets the earth), not its
   * centre. Sprites anchor bottom-centre so they SIT on the ground instead of
   * floating — the single detail that makes a painted map read as 3D. */
  pos: Vec2;
  /** Sprite width as a fraction of world width. Height follows the art's own
   * aspect, so a re-export with different padding can never render giant
   * (the S2 channel-run lesson, games/_shared/art.ts). */
  size: number;
  /** Art basename under artRoot. Absent => glyph forever, which is a valid
   * permanent state, not a placeholder. */
  art?: string;
  glyph: GlyphKind;
  /** Glyph stroke, label rule and halo colour. */
  accent: string;
  opens: SiteOpens;
  life?: SiteLife;
  /** Label declutter: 1 shows always, 2 from the middle zoom, 3 only when
   * zoomed right in. Keeps a 24-site board readable at k=1. */
  tier?: 1 | 2 | 3;
};

/** The four painted states of an enemy domain. Named by STATE, never by
 * season vocabulary — s4 called them contracts, s5 calls them strongholds,
 * and the engine does not care. */
export type TargetArt = {
  intact: string;
  sieged: string;
  breaching: string;
  breached: string;
};

export type WorldConfig = {
  /**
   * e.g. "/s5-art/world". Everything under it resolves to `.webp`.
   *
   * WebP for the SPRITES too, which departs from the games' bg-webp/else-png
   * rule on purpose. That rule exists because key-s5-games.js writes through
   * pngjs and one write path should stay one format; this cutter is Python and
   * has no such constraint. It matters here because a map loads its whole cast
   * at once: the same 18 sprites were 4.96 MB as 512px PNGs and are 0.83 MB as
   * WebP, an 83% cut with alpha intact, on what is about to be the season's
   * landing page.
   */
  artRoot: string;
  /** Width / height of the world box. 1.6 = 16:10. Fixed for the season's
   * life: every coordinate below is a fraction of it. */
  aspect: number;
  /** Ground plates, basename only. `far` is a small fast plate that paints
   * immediately; `near` crossfades in when decoded (the CampBackdrop pattern).
   * Both optional — groundCss covers their absence. */
  ground: { far?: string; near?: string };
  /** The floor under everything. Paints when no plate has loaded (or ever
   * lands), so the map is never blank and never shows a broken image. */
  groundCss: string;
  /** Every authored destination. Enemy domains are NOT in here. */
  sites: WorldSite[];
  /**
   * Fixed positions for the season's domains, consumed IN LISTING ORDER.
   * Position is bound to index and NEVER to status: a wall that falls must not
   * jump across the map (ADR-0008, stated twice in the existing code). Fewer
   * targets than slots is fine; more wraps with a small offset.
   */
  targetSlots: Vec2[];
  /**
   * One entry per ARCHETYPE. Targets are assigned round-robin by listing index
   * (`i % length`), so a season with three archetypes never shows eleven
   * identical buildings — which is the single loudest tell that a map was
   * generated rather than painted.
   *
   * The assignment is by INDEX and therefore stable forever: a stronghold's
   * silhouette can never change between loads, or when its status changes, or
   * when a neighbour breaches. Same rule as targetSlots (ADR-0008).
   *
   * A one-entry array is perfectly valid; every target just shares a look.
   */
  targetArt: TargetArt[];
  /** Painted place -> the game key currently occupying it. THE point of the
   * indirection: a slate change is one line here, not a re-render. An unknown
   * or retired key falls back to the generic place. */
  gameSlots: Record<string, string>;
  /**
   * THE ROAD NETWORK — authored data, and the SINGLE SOURCE OF TRUTH for it.
   *
   * The engine DRAWS these roads onto the ground and ROUTES its ambient traffic
   * along the very same polylines, so a tank is on the road by construction
   * rather than by coincidence.
   *
   * This inverts an earlier design that painted roads into the ground plate and
   * then tried to recover them with colour classification. That cannot work,
   * and not for want of tuning: a sandy road and a sandy field are the same
   * material — measured, road pixels sit at h=0.10/s=0.46 and the map's dry
   * ground sits right beside them. Roads are distinguishable by SHAPE, not
   * colour. Authoring them removes the guessing entirely and is what lets a new
   * season swap in: new polylines, new art folder, done.
   */
  roads: Vec2[][];
  /**
   * Rivers, same deal. Drawn by the engine and treated as impassable when
   * placing buildings, so nothing can ever end up standing in water.
   */
  rivers: Vec2[][];
  /** Where roads cross rivers. Drawn as a bridge/ford and passable. */
  crossings: Vec2[];
  /** Camera limits. min must be >= 1 so the world always covers the viewport
   * and the camera can never pan into void. */
  zoom: { min: number; max: number };
  /**
   * THE OPENING SHOT: the normalized point held at the viewport centre on
   * arrival, and the zoom to hold it at.
   *
   * Centre it on the CONTENT, not on the player's own base. Centring on the
   * base seems friendlier and is a trap: at 1920x1080 a 16:10 board only shows
   * ~86% of its height, so anchoring low pushes the far rank off the top edge
   * and a new commander never learns the rest of the map exists. Frame the
   * whole board; make the base findable by SIZE and by its accent ring instead.
   */
  openAt: { x: number; y: number; k: number };
  /** Sprite width fraction for a domain node. */
  targetSize: number;
};

/** Position for target index i. Wraps with a small offset rather than stacking
 * exactly, so an unexpected extra domain is visible instead of hidden — the
 * same guard nodePos() already applies in SiegeMap.tsx:134. */
export function targetPos(cfg: WorldConfig, i: number): Vec2 {
  const slots = cfg.targetSlots;
  if (!slots.length) return { x: 0.5, y: 0.5 };
  const base = slots[i % slots.length];
  const wrap = Math.floor(i / slots.length);
  return {
    x: Math.min(0.94, base.x + wrap * 0.03),
    y: Math.min(0.92, base.y + wrap * 0.04),
  };
}

/** Resolve a game place to the key currently sitting on it. Returns null when
 * the slot is unmapped or points at a key the season has since retired, which
 * the caller renders as a generic "field exercises" destination rather than a
 * broken link. */
export function gameForSlot(cfg: WorldConfig, slot: string, liveKeys: readonly string[]): string | null {
  const key = cfg.gameSlots[slot];
  if (!key) return null;
  return liveKeys.includes(key) ? key : null;
}

/** The archetype a target uses, chosen by listing index and stable forever. */
export function targetArtFor(cfg: WorldConfig, i: number): TargetArt {
  const set = cfg.targetArt;
  return set[((i % set.length) + set.length) % set.length];
}

/** Art URL for a site, or null when it should stay a glyph. */
export function siteArtUrl(cfg: WorldConfig, site: WorldSite): string | null {
  return site.art ? `${cfg.artRoot}/${site.art}.webp` : null;
}

/** Art URL for a ground plate basename. Plates are always WebP. */
export function groundUrl(cfg: WorldConfig, name: string | undefined): string | null {
  return name ? `${cfg.artRoot}/${name}.webp` : null;
}

/** The hour the world is lit for. */
export type DayPhase = "dawn" | "day" | "dusk" | "night";

/**
 * Which hour the world is in, from a SERVER timestamp.
 *
 * It lives HERE, in the directive-free engine module, rather than beside the
 * canvas that consumes it — and that is not tidiness, it is the boundary rule
 * in its less famous direction. A `"use client"` module's plain function
 * exports are NOT callable from a server component: the server receives a
 * client reference and calling it throws "is not a function" at request time,
 * with tsc perfectly happy. The well-known trap is importing a server-only
 * value into a client component; this is the same wall from the other side.
 *
 * Server-side is also the CORRECT place for it on the merits. Date.now() in a
 * client render breaks hydration, and worse, it would give every commander a
 * different sky — the map is a shared place, so the sun must be in the same
 * position for everyone looking at it.
 */
export function dayPhaseFor(nowMs: number): DayPhase {
  const h = new Date(nowMs).getUTCHours();
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}
