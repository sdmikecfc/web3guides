"use client";
/**
 * SEASON 5 · IRON SIEGE — ARMOR CLASH client (game key "armorclash").
 *
 * Portrait, and the sim owns the WHOLE canvas including the card strip, so
 * there is no coordinate translation anywhere: a tap in canvas space is a tap
 * in sim space. That is why the slot hitboxes live in the sim (slotRect) and
 * this file only DRAWS them - the two can never disagree about where a card is.
 *
 * REGISTER: bright cartoon (Mike, 2026-07-28). Fat outlines, flat cel fills,
 * a green field split by a blue river. Every draw keeps a vector fallback, so
 * the game is fully playable before a sprite lands.
 */
import { useCallback, useRef } from "react";
import { RunShell, type ShellInput, type ShellView } from "../_shared/RunShell";
import { GameIntro } from "../_shared/GameIntro";
import { canvasTex, loadManifest, ready, spr, sprRot, stripRot } from "../_shared/art";
import type { Sfx } from "../_shared/sfx";
import {
  createArmorclash,
  stepArmorclash,
  armorclashDone,
  armorclashScore,
  slotRect,
  legalDeploy,
  gridEmoji,
  sharePayload,
  CARDS,
  BRIDGE_XS,
  BRIDGE_HW,
  RIVER_Y0,
  RIVER_Y1,
  FIELD_H,
  MANA_CAP,
  ROUNDS,
  ROUND_T,
  SURGE_T,
  VIEW_W,
  VIEW_H,
  type AcState,
} from "./sim";

const GAME = "armorclash";
const ACCENT = "#e0662e";
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Pulled back from full saturation: the old pair was astroturf-bright and
// near-identical, so the board read as one flat sheet.
// Brighter and more saturated than the old olive pair: half of the "PS1
// dirt" read was simply a muddy base colour under a muddy painting.
const FIELD_MINE = "#7cbe55";
const FIELD_THEIRS = "#6cb04b";
// Water on a green field is green-blue and DARK. #57c7ff was a swimming pool.
// Bright, clean, phone-game water. The old navy pair read as tape.
const RIVER = "#4fb5e4";
const RIVER_DEEP = "#2e86b8";

/** Baked once: grass speckle and mow chop. Painting this per frame would be
 *  absurd; painting it once costs nothing forever. */
let GRASS_TEX: CanvasImageSource | null = null;
function bakeArena() {
  if (GRASS_TEX) return;
  let seed = 0x2545f491;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  GRASS_TEX = canvasTex(96, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 340; i++) {
      const a = 0.025 + rnd() * 0.04;
      g.fillStyle = rnd() < 0.5 ? `rgba(34,66,26,${a})` : `rgba(205,235,160,${a})`;
      g.fillRect(rnd() * w, rnd() * h, 0.7 + rnd() * 1.1, 0.7 + rnd() * 1.1);
    }
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = `rgba(36,66,26,${0.04 + rnd() * 0.05})`;
      g.lineWidth = 0.7 + rnd() * 1.1;
      const x = rnd() * w;
      const y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 2 + rnd() * 5, y - 3 - rnd() * 5);
      g.stroke();
    }
  });
}
const PLANK = "#c9a35e";
const INK = "rgba(30,20,10,0.55)";
const MINE = "#3f8fd0";
const THEIRS = "#e2574d";
/** Hostiles always carry a magenta accent: the season's colorblind law. */
const MAGENTA = "#ff5cf0";

/* NO bg-arena. A painted plate carries its own rivers and roads, and the sim
 * has exactly one river with exactly two crossings -- units walked over
 * painted water because to the sim that water was never there. The arena is
 * drawn from the sim's constants below instead, so it cannot disagree. */
/* THE PAINTED KEEPS ARE BACK, GRADED (2026-08-02). They were deleted a day
 * earlier for the drawn castle below, on the reasoning that a tower carries a
 * rule and rule-bearing things are drawn (ADR-0088). Wrong call: the complaint
 * was the EXPOSURE, not the art. The plates averaged 30% luminance on dark
 * grass, so they read as blobs; deleting them threw away all the detail to fix
 * a brightness problem, and the replacement looked cheap next to the painted
 * units it stands beside (Mike: "armor clash graphics went downhill"). Graded
 * up (~1.85 brightness, originals kept as *-dark-backup.png) they are legible
 * AND painted. The drawn castle stays below as the fallback, and the team roof
 * is still stamped on top of the plate, so ownership never depends on the art.
 */
/* The nine unit-*.png AI paintings are RETIRED from the manifest
 * (2026-08-02): field units and card faces now draw from the baked team
 * strips under units/ (Quaternius CC0 tanks through /dev/bake, see
 * art-src/baked/strips/manifest.json), which replaces ~3.5MB of paintings
 * with ~55KB of webp and finally puts ANIMATION FRAMES on the field. The
 * pngs stay on disk, unreferenced, same as the tower dark-backups. */
const ART = loadManifest(GAME, [
  "units/tower-mine",
  "units/tower-theirs",
  "units/tower-hq-mine",
  "units/tower-hq-theirs",
  "bridge",
  "fx-boom",
  "units/light-mine",
  "units/light-theirs",
  "units/medium-mine",
  "units/medium-theirs",
  "units/heavy-mine",
  "units/heavy-theirs",
  "units/launcher-mine",
  "units/launcher-theirs",
  "units/missile",
  // BAKED SCENERY (2026-08-02): real conifers and boulders replace the drawn
  // canopy discs that framed the pitch. Foot-on-anchor, tight-cropped.
  "scn/tree-a",
  "scn/tree-b",
  "scn/rock",
] as const);

/** Card key -> strip role. Tier 1 rides the light hull, 2-3 the medium,
 * 4-5 the heavy; the launcher and pillbox are emplacements, not strips. */
const STRIP_ROLE: Record<string, "light" | "medium" | "heavy"> = {
  stuart: "light",
  chaffee: "light",
  sherman: "medium",
  cromwell: "medium",
  hellcat: "medium",
  panther: "heavy",
  tiger: "heavy",
  tiger2: "heavy",
};
const STRIP_FRAMES = 4;

let AR: Record<string, string> = {};
const T = (k: string) => AR[k] ?? k;

export type ArmorclashStrings = {
  intro?: string;
  introDaily?: string;
  shell?: Record<string, string>;
  arena?: Record<string, string>;
};

/** Frame-invariant canvas gradients, lazily built on first draw. */
const GRADS: { tg?: CanvasGradient; bg?: CanvasGradient; rg?: CanvasGradient; vig?: CanvasGradient } = {};

/** A soft CONTACT shadow hugging an entity's feet. The franchise longShadow
 * throws a hard evening ellipse a full radius to the right, and under this
 * game's small pieces it read as pasted dark puddles beside them rather than
 * grounding under them (the 2026-08-02 composition pass). */
function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.fillStyle = "rgba(24,40,16,0.30)";
  ctx.beginPath();
  ctx.ellipse(x + r * 0.12, y, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function ink(ctx: CanvasRenderingContext2D, w = 2.5) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
}

/**
 * A TOWER, as a game piece rather than an illustration.
 *
 * Stone body, team roof, crenellations, and a flag on the big one so the two
 * HQs read as the objectives at a glance. Everything is sized from `r`, the
 * radius the sim uses for its no-deploy disc and its range checks, so the
 * picture is the rule.
 */
function drawTower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  big: boolean,
  mine: boolean,
  hit: boolean,
) {
  const roof = mine ? MINE : THEIRS;
  const dark = mine ? "#2f6ea6" : "#b23a31";
  // PAINTED FIRST, with the team roof stamped over it. Whose tower it is may
  // never depend on how well someone reads a painting, so the cap, the flag
  // and the hit flash are drawn on top of the plate exactly as they are drawn
  // on top of the vector.
  // THE BAKED KEEPS (Kenney tower-defense kit through the rig's tilt camera,
  // accents recoloured per team in pixels — the material route sees only the
  // white of Kenney's texture-atlas authoring). The tilt is legal because a
  // tower never rotates (ADR-0092), and it is the tilt that makes the board
  // read 3D: visible walls and height instead of a stamped disc. Team lives
  // IN the art now, so the old stamped cap band is gone; the drawn castle
  // below remains the fallback and keeps its stamps.
  const plate = ART[
    big
      ? mine
        ? "units/tower-hq-mine"
        : "units/tower-hq-theirs"
      : mine
        ? "units/tower-mine"
        : "units/tower-theirs"
  ];
  if (ready(plate)) {
    // A THIRD BIGGER THAN THE COLLISION DISC, on purpose: towers are the
    // board's anchors and at 1:1 they read as tokens. The sim's r is LAW for
    // range and hits and is untouched; this is stage presence only.
    const size = r * (big ? 4.6 : 4.0);
    contactShadow(ctx, x, y + r * 0.55, r * 1.5);
    ctx.save();
    if (hit) ctx.filter = "brightness(2.2)";
    // tilt bakes carry their height ABOVE the anchor: sit the foot on y.
    spr(ctx, plate, x, y - r * 0.72, size, () => {});
    ctx.restore();
    return;
  }
  // DRAWN, NOT PAINTED (Mike 2026-08-01: "castles are too dark and it's hard to
  // see what they actually are"). The painted plates shipped dark against dark
  // grass with a 0.55-alpha roof cap as their only team tell, and they took an
  // early return that made everything below here dead code. ADR-0088's rule
  // decides it: a tower carries a rule (whose it is, how close it is to dying)
  // and must be found in under a second, so it is DRAWN -- near-white stone,
  // a full team roof, merlons, and a flag on the HQ. `r` drives every dimension
  // because r is a rule the sim enforces and the picture has to keep matching.
  // Near-white read as a chess piece on grass. Stone, lit from above.
  const body = hit ? "#ffffff" : "#b9bdb2";
  const w = r * 1.55;
  const h = r * 1.7;
  ctx.save();
  // body: a stone gradient so it has mass. The silhouette is untouched --
  // `r` is a rule the sim enforces, so the picture must keep matching it.
  {
    const bg = ctx.createLinearGradient(x - w / 2, y - h * 0.55, x + w / 2, y + h * 0.45);
    bg.addColorStop(0, hit ? "#ffffff" : "#d3d7cb");
    bg.addColorStop(0.55, body);
    bg.addColorStop(1, hit ? "#e8e8e8" : "#8e938a");
    ctx.fillStyle = bg;
  }
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h * 0.55, w, h, 3);
  ctx.fill();
  ink(ctx, 2.4);
  ctx.stroke();
  // a stone course or two, so the body is not a blank slab
  ctx.strokeStyle = "rgba(90,96,88,0.5)";
  ctx.lineWidth = 1.4;
  for (let i = 1; i <= (big ? 2 : 1); i++) {
    const yy = y - h * 0.55 + (h * i) / (big ? 3 : 2);
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 2, yy);
    ctx.lineTo(x + w / 2 - 2, yy);
    ctx.stroke();
  }
  // roof band + crenellations, in the team colour
  ctx.fillStyle = hit ? "#ffffff" : roof;
  ctx.beginPath();
  ctx.roundRect(x - w / 2 - 2, y - h * 0.55 - 6, w + 4, 8, 2);
  ctx.fill();
  ink(ctx, 2.2);
  ctx.stroke();
  ctx.fillStyle = dark;
  const merlons = big ? 3 : 2;
  for (let i = 0; i < merlons; i++) {
    const mx = x - w / 2 + (w * (i + 0.5)) / merlons;
    ctx.fillRect(mx - 3, y - h * 0.55 - 11, 6, 6);
  }
  if (big && mine) {
    // THE FLAG, on YOUR HQ only. It is the "this one is yours" marker, and
    // the enemy HQ stands hard against the top edge where a mast would be
    // sliced off by the round banner anyway. Theirs is already unmistakable:
    // red roof, magenta ring, and the only big tower up there.
    const base = y - h * 0.55 - 11;
    const dir = -1;
    const tip = base + dir * 15;
    ctx.strokeStyle = "rgba(40,30,16,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x, tip);
    ctx.stroke();
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x, tip);
    ctx.lineTo(x + 13, tip - dir * 4.5);
    ctx.lineTo(x, tip - dir * 9);
    ctx.closePath();
    ctx.fill();
    ink(ctx, 1.8);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A TANK, from directly above.
 *
 * Team colour lives in the HULL, which is why there is no coloured disc under
 * it any more: the disc existed only because the painted cutouts were the same
 * pale green on both sides, and at this scale it showed as two thin crescents
 * behind a wider sprite.
 *
 * Everything is sized from `r`, the radius the sim uses for separation and
 * range, so the picture is the rule. And a plan view rotates honestly: there is
 * no fixed camera angle for a rotation to violate, which is exactly what broke
 * when a side-elevation sprite was flipped vertically for the enemy side.
 */
function drawTank(
  ctx: CanvasRenderingContext2D,
  r: number,
  a: number,
  mine: boolean,
  hit: boolean,
) {
  const body = hit ? "#ffffff" : mine ? MINE : THEIRS;
  const dark = hit ? "#e8e8e8" : mine ? "#2f6ea6" : "#b23a31";
  ctx.save();
  ctx.rotate(a);
  const L = r * 1.9; // nose to tail
  const W = r * 1.35; // track to track
  // tracks, one either side, drawn first so the hull sits between them
  ctx.fillStyle = "#2a2f33";
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W * 0.3, 2);
  ctx.roundRect(-L / 2, W / 2 - W * 0.3, L, W * 0.3, 2);
  ctx.fill();
  ink(ctx, 1.8);
  ctx.stroke();
  // hull
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-L / 2 + 1, -W / 2 + W * 0.22, L - 2, W * 0.56, 2.5);
  ctx.fill();
  ink(ctx, 2);
  ctx.stroke();
  // turret + barrel, pointing along the unit's facing
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(-L * 0.06, 0, W * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ink(ctx, 1.8);
  ctx.stroke();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(0, -W * 0.09, L * 0.62, W * 0.18, 1.5);
  ctx.fill();
  ink(ctx, 1.4);
  ctx.stroke();
  ctx.restore();
}

export default function ArmorclashClient({ strings }: { strings?: ArmorclashStrings }) {
  AR = strings?.arena ?? {};
  const prevRef = useRef({ kills: 0, deploys: 0, towers: 0, hqs: 0, round: 1, deny: 0 });

  const createSim = useCallback(
    (w: number, h: number, seed: string, reduced: boolean, stats: unknown) => {
      prevRef.current = { kills: 0, deploys: 0, towers: 0, hqs: 0, round: 1, deny: 0 };
      return createArmorclash(w, h, seed, reduced, stats as never);
    },
    [],
  );

  const draw = useCallback((ctx: CanvasRenderingContext2D, s: AcState, view: ShellView) => {
    // SIM UNITS, not CSS pixels. This game pins a fixed worldSize, so
    // RunShell's fitCanvasToSim sets the transform such that a draw at
    // x = VIEW_W lands exactly on the right edge -- view.w is the CSS box and
    // means nothing to the drawing context. Using it made every full-bleed
    // fill overdraw off-canvas (harmless) and every CENTRED thing -- the
    // vignette, any W/2 text -- sit off to one side (not harmless).
    //
    // The two games WITHOUT a worldSize (Warpath, Warhawks) are the opposite
    // case: their sim size IS the CSS box, so view.w is correct there. The
    // rule is "does this game pin a worldSize", not a blanket preference.
    const W = VIEW_W;
    const H = VIEW_H;
    ctx.save();
    if (!REDUCED_MOTION && s.shake > 0) {
      ctx.translate((s.rngFx() - 0.5) * s.shake * 0.4, (s.rngFx() - 0.5) * s.shake * 0.4);
    }

    // ── THE ARENA, from the sim's own constants ────────────────────────────
    // Two lawns, one river, two bridges. Every number below is imported from
    // the sim, so the picture and the rules are the same map by construction.
    bakeArena();
    // Each half gets its own gradient, darkest at the back line, so the board
    // has a near end and a far end instead of two identical sheets.
    {
      // Frame-invariant gradients, built once (renderer fix #2 from the
      // upgrade plan: these three were allocated EVERY FRAME for the life of
      // the game, which is pure GC noise on a phone).
      if (!GRADS.tg) {
        GRADS.tg = ctx.createLinearGradient(0, 0, 0, RIVER_Y0);
        GRADS.tg.addColorStop(0, "#4c8036");
        GRADS.tg.addColorStop(1, FIELD_THEIRS);
        GRADS.bg = ctx.createLinearGradient(0, RIVER_Y1, 0, FIELD_H);
        GRADS.bg.addColorStop(0, FIELD_MINE);
        GRADS.bg.addColorStop(1, "#588c3c");
        // Shallow at the shores, deep in the channel — the old gradient ran
        // the other way, which is why the river read as a dark-edged band.
        GRADS.rg = ctx.createLinearGradient(0, RIVER_Y0, 0, RIVER_Y1);
        GRADS.rg.addColorStop(0, RIVER);
        GRADS.rg.addColorStop(0.5, RIVER_DEEP);
        GRADS.rg.addColorStop(1, RIVER);
      }
      ctx.fillStyle = GRADS.tg;
      ctx.fillRect(0, 0, W, RIVER_Y0);
      ctx.fillStyle = GRADS.bg!;
      ctx.fillRect(0, RIVER_Y1, W, FIELD_H - RIVER_Y1);
    }
    // THE PITCH IS DRAWN, NOT PAINTED (2026-08-02). bg-field.webp — an AI
    // painting tiled at 256px — left the field: its smear and seams read as
    // "PS1 dirt" (Mike) next to the crisp baked units, and a lane battler's
    // ground is supposed to be the QUIET layer. Flat green + stripes + a fine
    // speckle, with the detail budget spent on the pieces standing on it.
    if (GRASS_TEX) {
      for (let y = 0; y < FIELD_H; y += 96) {
        for (let x = 0; x < W; x += 96) ctx.drawImage(GRASS_TEX, x, y);
      }
    }

    // MOWN STRIPES. The lane battler's whole visual grammar: they say "this
    // is a pitch, not a landscape". Stronger than before, because they no
    // longer fight a painting for the same ground.
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x < W; x += 60) {
      ctx.fillRect(x, 0, 30, RIVER_Y0);
      ctx.fillRect(x + 30, RIVER_Y1, 30, FIELD_H - RIVER_Y1);
    }

    // GROUND LIFE, deterministic off position: clover patches, daisies, and
    // worn dirt at the four bridge mouths — the one place dirt belongs,
    // because that is where every tank actually drives.
    {
      const h2 = (ix: number, iy: number, salt: number) => {
        let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
        h ^= h >>> 13;
        return (h >>> 0) / 4294967296;
      };
      for (let gx = 0; gx < W; gx += 44) {
        for (let gy = 0; gy < FIELD_H; gy += 44) {
          if (gy > RIVER_Y0 - 14 && gy < RIVER_Y1 + 14) continue;
          const r0 = h2(gx, gy, 3);
          const px2 = gx + h2(gx, gy, 5) * 40;
          const py2 = gy + h2(gx, gy, 7) * 40;
          if (r0 < 0.1) {
            // clover patch: a darker green cluster
            ctx.fillStyle = "rgba(40,84,30,0.35)";
            for (let k = 0; k < 3; k++) {
              ctx.beginPath();
              ctx.arc(px2 + h2(gx + k, gy, 9) * 8, py2 + h2(gx, gy + k, 11) * 6, 2.6 + h2(gx, gy, 13 + k) * 2, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (r0 < 0.145) {
            // a daisy: four white petals, warm centre — tiny, sparse
            ctx.fillStyle = "rgba(250,250,240,0.85)";
            for (let k = 0; k < 4; k++) {
              const a2 = (k / 4) * Math.PI * 2;
              ctx.beginPath();
              ctx.arc(px2 + Math.cos(a2) * 1.7, py2 + Math.sin(a2) * 1.7, 1.15, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = "#e8c34f";
            ctx.beginPath();
            ctx.arc(px2, py2, 1.05, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // THE FOREST EDGE. A board is a PLACE when it is framed: overlapping
      // canopies down both flanks and heavier corner stands turn the naked
      // rectangle into a clearing. Kept inside a ~14px margin so no gameplay
      // ground is hidden; deploys under the leaves still read.
      // A REAL TREE where the art landed, the drawn disc where it did not.
      // The bakes carry their own height above the anchor, so the foot sits on
      // (cx2, cy2) and the crown rises up-screen from there.
      const canopy = (cx2: number, cy2: number, cr: number, tone: number) => {
        const tImg = ART[tone % 2 === 0 ? "scn/tree-a" : "scn/tree-b"];
        if (ready(tImg)) {
          const w = cr * 2.5;
          const h = w * (tImg!.naturalHeight / tImg!.naturalWidth);
          ctx.fillStyle = "rgba(22,44,16,0.34)";
          ctx.beginPath();
          ctx.ellipse(cx2 + cr * 0.12, cy2, cr * 0.95, cr * 0.36, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(tImg!, cx2 - w / 2, cy2 - h * 0.94, w, h);
          return;
        }
        const cols = ["#3f7c31", "#356d2a", "#488a38"];
        ctx.fillStyle = "rgba(22,44,16,0.30)";
        ctx.beginPath();
        ctx.ellipse(cx2 + 2, cy2 + 3, cr * 1.05, cr * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cols[tone % 3];
        ctx.beginPath();
        ctx.arc(cx2, cy2, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,230,0.14)";
        ctx.beginPath();
        ctx.arc(cx2 - cr * 0.3, cy2 - cr * 0.32, cr * 0.55, 0, Math.PI * 2);
        ctx.fill();
      };
      for (let ty = 8; ty < FIELD_H; ty += 26) {
        if (ty > RIVER_Y0 - 18 && ty < RIVER_Y1 + 18) continue;
        canopy(4 + h2(0, ty, 21) * 8, ty + h2(1, ty, 22) * 10, 9 + h2(2, ty, 23) * 5, Math.floor(h2(3, ty, 24) * 3));
        canopy(W - 4 - h2(4, ty, 25) * 8, ty + h2(5, ty, 26) * 10, 9 + h2(6, ty, 27) * 5, Math.floor(h2(7, ty, 28) * 3));
      }
      for (const [cx2, cy2] of [
        [10, 10],
        [W - 10, 10],
        [10, FIELD_H - 10],
        [W - 10, FIELD_H - 10],
      ] as const) {
        canopy(cx2, cy2, 15, 1);
        canopy(cx2 + (cx2 < W / 2 ? 13 : -13), cy2 + 6, 11, 0);
        canopy(cx2 + 4, cy2 + (cy2 < FIELD_H / 2 ? 14 : -14), 10, 2);
      }
      // BOULDERS along the treeline, so the frame is not one repeated shape
      {
        const rk = ART["scn/rock"];
        if (ready(rk)) {
          for (const [rx, ry, rs] of [
            [17, FIELD_H * 0.3, 15],
            [W - 17, FIELD_H * 0.24, 13],
            [15, FIELD_H * 0.72, 12],
            [W - 15, FIELD_H * 0.78, 16],
          ] as const) {
            const w = rs * 2.2;
            const h = w * (rk!.naturalHeight / rk!.naturalWidth);
            ctx.fillStyle = "rgba(22,44,16,0.3)";
            ctx.beginPath();
            ctx.ellipse(rx + 1.5, ry, rs * 0.95, rs * 0.34, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(rk!, rx - w / 2, ry - h * 0.88, w, h);
          }
        }
      }

      // worn approaches at the bridge mouths: trampled, faded, TANK country
      for (const bx of BRIDGE_XS) {
        for (const [by, dir] of [
          [RIVER_Y0 - 4, -1],
          [RIVER_Y1 + 4, 1],
        ] as const) {
          const wg = ctx.createRadialGradient(bx, by, 4, bx, by, 46);
          wg.addColorStop(0, "rgba(150,128,84,0.42)");
          wg.addColorStop(0.6, "rgba(150,128,84,0.16)");
          wg.addColorStop(1, "rgba(150,128,84,0)");
          ctx.fillStyle = wg;
          ctx.beginPath();
          ctx.ellipse(bx, by + dir * 16, 34, 30, 0, 0, Math.PI * 2);
          ctx.fill();
          // TREAD RUTS. They were 42px long, thin, dark and splayed outward,
          // which at play size read as two sticks lying across the field
          // rather than as tracks worn into the approach. Short, wide, dead
          // straight and fading out: a rut is a smudge, not a line.
          {
            const rl = 20;
            const rg = ctx.createLinearGradient(bx, by, bx, by + dir * rl);
            rg.addColorStop(0, "rgba(96,80,52,0.3)");
            rg.addColorStop(1, "rgba(96,80,52,0)");
            ctx.fillStyle = rg;
            for (const off of [-8, 4]) ctx.fillRect(bx + off, by, 4, dir * rl);
          }
        }
      }
    }
    // A darker apron at the very top and bottom so the two ends read as ends.
    for (const [y0, y1] of [
      [0, 16],
      [FIELD_H - 16, FIELD_H],
    ]) {
      ctx.fillStyle = "rgba(24,60,20,0.16)";
      ctx.fillRect(0, y0, W, y1 - y0);
    }
    // THE VIGNETTE: corners fall off, the middle breathes. The cheapest
    // "this is a lit game board, not a texture export" cue there is.
    if (!GRADS.vig) {
      GRADS.vig = ctx.createRadialGradient(W / 2, FIELD_H / 2, FIELD_H * 0.34, W / 2, FIELD_H / 2, FIELD_H * 0.78);
      GRADS.vig.addColorStop(0, "rgba(0,0,0,0)");
      GRADS.vig.addColorStop(1, "rgba(10,22,8,0.30)");
    }
    ctx.fillStyle = GRADS.vig;
    ctx.fillRect(0, 0, W, FIELD_H);

    // THE RIVER. Sandy shores, shallow-to-deep water, scalloped foam at both
    // banks and ripple arcs drifting with the current — the stylised water
    // grammar every phone game shares, replacing the navy tape + dash glints.
    ctx.fillStyle = "#d8c690";
    ctx.fillRect(0, RIVER_Y0 - 4, W, 4);
    ctx.fillRect(0, RIVER_Y1, W, 4);
    ctx.fillStyle = "rgba(120,104,64,0.4)";
    ctx.fillRect(0, RIVER_Y0 - 1, W, 1);
    ctx.fillRect(0, RIVER_Y1, W, 1);
    ctx.fillStyle = GRADS.rg!;
    ctx.fillRect(0, RIVER_Y0, W, RIVER_Y1 - RIVER_Y0);
    // FOAM: two scalloped lines per bank, the outer bright and the inner
    // faint, waving slowly. Drawn as sine-bumped polylines so the edge reads
    // as lapping water rather than a ruled border.
    for (const [bankY, dir] of [
      [RIVER_Y0, 1],
      [RIVER_Y1, -1],
    ] as const) {
      for (const [inset, alpha, amp] of [
        [2.2, 0.75, 1.4],
        [6.5, 0.28, 2.0],
      ] as const) {
        ctx.strokeStyle = `rgba(238,250,255,${alpha})`;
        ctx.lineWidth = inset < 4 ? 1.8 : 1.2;
        ctx.beginPath();
        for (let x = -8; x <= W + 8; x += 4) {
          const y =
            bankY +
            dir * inset +
            Math.sin(x * 0.11 + s.clock * (dir > 0 ? 0.9 : -0.8) + inset) * amp * dir;
          if (x <= -8) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // RIPPLES: soft highlight arcs drifting with the current, three lanes.
    ctx.lineWidth = 1.4;
    for (let lane = 0; lane < 3; lane++) {
      const yy = RIVER_Y0 + 8 + lane * 8;
      const sp = 9 + lane * 6;
      // softer: at play size the old alphas read as white scribble on the water
      ctx.strokeStyle = `rgba(230,248,255,${0.12 + lane * 0.04})`;
      for (let i = 0; i < 5; i++) {
        const gx = ((s.clock * sp + i * 78 + lane * 31) % (W + 90)) - 45;
        ctx.beginPath();
        ctx.arc(gx, yy + 3, 7 + lane * 2, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    }

    // THE BRIDGES. The only two ways across, so they are drawn heaviest of
    // anything on the board: a player who cannot find the crossing has no
    // game to play.
    for (const bx of BRIDGE_XS) {
      const bw = BRIDGE_HW * 2;
      // rails first, so the planks below read as a BUILT crossing
      ctx.fillStyle = "#4a3a22";
      ctx.fillRect(bx - BRIDGE_HW - 3, RIVER_Y0 - 3, 3, RIVER_Y1 - RIVER_Y0 + 6);
      ctx.fillRect(bx + BRIDGE_HW, RIVER_Y0 - 3, 3, RIVER_Y1 - RIVER_Y0 + 6);
      ctx.fillStyle = "#6b5533";
      for (const py of [RIVER_Y0 - 4, RIVER_Y1] as const) {
        ctx.fillRect(bx - BRIDGE_HW - 4, py, 5, 5);
        ctx.fillRect(bx + BRIDGE_HW - 1, py, 5, 5);
      }
      const by = RIVER_Y0 - 7;
      const bh = RIVER_Y1 - RIVER_Y0 + 14;
      // The contact shadow stays in code whatever happens above it: it is what
      // makes the deck sit ON the water instead of floating over it, and it has
      // to scale with the span.
      ctx.fillStyle = "rgba(20,14,6,0.22)";
      ctx.fillRect(bx - BRIDGE_HW + 2, by + 3, bw, bh);
      // PAINTED DECK. This is the only way across and the code already calls it
      // "drawn heaviest of anything on the board" -- a player who cannot find
      // the crossing has no game to play -- so the art has to be at least as
      // findable as the flat plank fill it replaces, never less.
      if (ready(ART.bridge)) {
        ctx.drawImage(ART.bridge!, bx - BRIDGE_HW, by, bw, bh);
        continue;
      }
      ctx.fillStyle = PLANK;
      ctx.fillRect(bx - BRIDGE_HW, by, bw, bh);
      ctx.strokeStyle = "rgba(120,80,32,0.55)";
      ctx.lineWidth = 1.5;
      for (let y = by + 5; y < by + bh; y += 7) {
        ctx.beginPath();
        ctx.moveTo(bx - BRIDGE_HW + 1.5, y);
        ctx.lineTo(bx + BRIDGE_HW - 1.5, y);
        ctx.stroke();
      }
      // rails, so it reads as a bridge and not a plank of colour
      ctx.fillStyle = "#a9803f";
      ctx.fillRect(bx - BRIDGE_HW - 3, by, 3.5, bh);
      ctx.fillRect(bx + BRIDGE_HW - 0.5, by, 3.5, bh);
      ink(ctx, 2.2);
      ctx.strokeRect(bx - BRIDGE_HW - 3, by, bw + 6, bh);
    }

    // CORNER PLANTING, outside the rows anything is ever deployed into, so it
    // decorates without ever being mistaken for something you can touch.
    for (const [bx2, by2, br] of [
      [14, 14, 11],
      [W - 14, 14, 11],
      [14, FIELD_H - 14, 11],
      [W - 14, FIELD_H - 14, 11],
      [18, RIVER_Y0 - 26, 8],
      [W - 18, RIVER_Y1 + 26, 8],
    ] as const) {
      ctx.fillStyle = "#3f7a34";
      ctx.beginPath();
      ctx.arc(bx2 - br * 0.4, by2, br * 0.72, 0, Math.PI * 2);
      ctx.arc(bx2 + br * 0.4, by2 - br * 0.2, br * 0.62, 0, Math.PI * 2);
      ctx.arc(bx2, by2 + br * 0.35, br * 0.66, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 2);
      ctx.stroke();
    }

    // ── deploy affordance: your half glows while a card is affordable ───────
    const card = CARDS[s.hand[s.sel]];
    if (card && s.mana >= card.cost && s.phase === "play") {
      ctx.fillStyle = "rgba(224,102,46,0.07)";
      ctx.fillRect(0, RIVER_Y1 + 4, W, FIELD_H - RIVER_Y1 - 10);

      // ── THE GHOST. What this card does if you commit it HERE ─────────────
      // Mike: "should show range when placing". An emplacement is bought for
      // its reach and its blind spot, and both were invisible until after the
      // mana was spent. The ring is drawn from the card's own numbers and the
      // legality tint calls the sim's own predicate, so the preview cannot
      // disagree with the tap that follows it.
      const ptr = view.pointer;
      if (ptr && ptr.y < FIELD_H) {
        const ok = legalDeploy(s, ptr.x, ptr.y);
        const tint = ok ? "126,224,106" : "255,90,90";
        if (card.mobile === false) {
          ctx.save();
          ctx.strokeStyle = `rgba(${tint},0.55)`;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(ptr.x, ptr.y, card.range, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = `rgba(${tint},0.07)`;
          ctx.fill();
          if (card.minRange) {
            // the blind spot, in the colour of the thing that punishes you
            ctx.strokeStyle = "rgba(255,120,90,0.6)";
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(ptr.x, ptr.y, card.minRange, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }
        // the footprint itself, so you can see it will not fit before it does not
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = `rgba(${tint},0.95)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ptr.x, ptr.y, card.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (s.denyT > 0) {
      ctx.strokeStyle = `rgba(255,90,90,${0.7 * (s.denyT / 0.35)})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(2, RIVER_Y1 + 5, W - 4, FIELD_H - RIVER_Y1 - 12);
    }

    // ── towers ──────────────────────────────────────────────────────────────
    // STONE PADS, under every tower and drawn in one pass before them. A
    // tower standing on bare lawn looks dropped there; a tower on a pad looks
    // built, and the pad is also the honest picture of `tw.r`, the disc units
    // are not allowed to deploy inside.
    for (const tw of s.towers) {
      if (tw.dead) continue;
      ctx.fillStyle = "rgba(24,48,20,0.20)";
      ctx.beginPath();
      ctx.ellipse(tw.x, tw.y + tw.r * 0.42, tw.r + 6, (tw.r + 6) * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#cfd6cd";
      ctx.beginPath();
      ctx.ellipse(tw.x, tw.y + tw.r * 0.32, tw.r + 4, (tw.r + 4) * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ink(ctx, 2);
      ctx.stroke();
    }
    for (const tw of s.towers) {
      const mine = tw.side === 0;
      if (tw.dead) {
        ctx.globalAlpha = Math.max(0, tw.ko / 0.8);
      }
      if (!mine) {
        // A THREAT WASH, not a hoop. This was a hard magenta stroke, which read
        // as a debug overlay and put a fourth hue on a board that only speaks
        // red, blue and green. The roof already says whose it is; this only has
        // to say "and it reaches this far".
        const gl = ctx.createRadialGradient(tw.x, tw.y, tw.r * 0.5, tw.x, tw.y, tw.r + 12);
        gl.addColorStop(0, "rgba(214,76,64,0.26)");
        gl.addColorStop(1, "rgba(214,76,64,0)");
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(tw.x, tw.y, tw.r + 12, 0, Math.PI * 2);
        ctx.fill();
      }
      drawTower(ctx, tw.x, tw.y, tw.r, tw.big, mine, tw.hit > 0);
      ctx.globalAlpha = 1;
      if (!tw.dead) {
        const w = tw.r * 2.4;
        ctx.fillStyle = "rgba(10,10,10,0.55)";
        ctx.fillRect(tw.x - w / 2, tw.y - tw.r * 2.7 - 8, w, 4);
        ctx.fillStyle = mine ? "#7ee06a" : "#ff7a5c";
        ctx.fillRect(tw.x - w / 2, tw.y - tw.r * 2.7 - 8, w * Math.max(0, tw.hp / tw.maxHp), 4);
      }
    }

    // ── units ───────────────────────────────────────────────────────────────
    for (const u of s.units) {
      const c = CARDS[u.card];
      const mine = u.side === 0;
      ctx.save();
      ctx.translate(u.x, u.y);
      if (u.dead) {
        // A WRECK, not a ghost: the hulk chars to near-black and smokes
        // through its ko fade instead of politely dimming out. Cheap and
        // stateless — the darkening is a filter over the same strip frame.
        ctx.globalAlpha = Math.max(0, u.ko / 0.5);
        ctx.filter = "brightness(0.35) saturate(0.4)";
      }
      // the franchise ground shadow, so the tank sits ON the pitch — it was
      // imported into this game and never called, which is half of why the
      // field read flat next to the other three games
      contactShadow(ctx, 0, c.r * 0.4, c.r * 1.15);
      // THE MORTAR PIT IS NOT A TANK. Drawn unrotated: every other unit uses
      // u.a as a heading because it drives somewhere, but a dug-in emplacement
      // does not, and spinning it to face a target reads as the position itself
      // turning around. It holds still; the shell does the talking.
      if (c.key === "pillbox") {
        drawPillbox(ctx, 0, 0, c.r * 2.4, mine);
      } else if (c.key === "mortar") {
        // THE MISSILE BATTERY (Mike, 2026-08-02: "make it a missile launcher
        // instead of mortar, same long range"). Kenney TD tile 205, teamed.
        // It faces the enemy bank and never rotates: an emplacement holds
        // still, the missile does the talking.
        spr(ctx, ART[mine ? "units/launcher-mine" : "units/launcher-theirs"], 0, 0, c.r * 3.0, () => {
          drawPillbox(ctx, 0, 0, c.r * 2.4, mine);
        });
      } else {
        // BAKED TEAM STRIPS, at last: real track frames instead of a static
        // hull. The frame advances with DISTANCE (an odometer read off the
        // unit's own position), so a parked tank holds still and a driving
        // one's tracks roll — and because position is sim state, replays
        // show identical frames. Draw stays pure: nothing is stored.
        const role = STRIP_ROLE[c.key];
        const strip = role ? ART[`units/${role}-${mine ? "mine" : "theirs"}` as keyof typeof ART] : null;
        const frame = Math.floor((Math.abs(u.x) + Math.abs(u.y)) / 7);
        stripRot(ctx, strip, STRIP_FRAMES, frame, 0, 0, c.r * 3.4, u.a, () => {
          drawTank(ctx, c.r, u.a, mine, u.hit > 0);
        });
        if (u.hit > 0 && strip) {
          // the strip has no white hit-flash frame; a hot overlay stands in
          ctx.globalAlpha = 0.55;
          ctx.globalCompositeOperation = "lighter";
          stripRot(ctx, strip, STRIP_FRAMES, frame, 0, 0, c.r * 3.4, u.a, () => {});
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
      ctx.filter = "none";
      if (u.dead) {
        // rising smoke over the hulk, driven by ko so replays agree
        const kf = 1 - Math.max(0, u.ko / 0.5);
        ctx.globalAlpha = Math.max(0, 0.5 - kf * 0.5);
        ctx.fillStyle = "#2a2622";
        ctx.beginPath();
        ctx.arc(u.x + kf * 3, u.y - kf * 14, c.r * (0.4 + kf * 0.7), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (!u.dead && u.hp < u.maxHp) {
        ctx.fillStyle = "rgba(10,10,10,0.55)";
        ctx.fillRect(u.x - c.r, u.y - c.r - 8, c.r * 2, 3);
        ctx.fillStyle = mine ? "#7ee06a" : "#ff7a5c";
        ctx.fillRect(u.x - c.r, u.y - c.r - 8, c.r * 2 * Math.max(0, u.hp / u.maxHp), 3);
      }
      if (u.shieldT > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(u.x, u.y, c.r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // tracers + particles
    for (const tr of s.tracers) {
      const full = tr.beam ? 0.16 : 0.09;
      ctx.globalAlpha = Math.max(0, tr.life / full) * 0.9;
      if (tr.beam) {
        // A CHARGED SHOT LOOKS LIKE ONE: a hot core inside a wide glow, so the
        // Tiger II's two-second wind-up pays off visibly rather than landing
        // the same hairline every other tank fires.
        ctx.strokeStyle = tr.side === 0 ? "rgba(150,220,255,0.45)" : "rgba(255,150,140,0.45)";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(tr.x0, tr.y0);
        ctx.lineTo(tr.x1, tr.y1);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.4;
      } else if (tr.arc) {
        // A LOB, not a line: the mortar's shell should look like it went OVER
        // the river rather than through it.
        const mx = (tr.x0 + tr.x1) / 2;
        const my = (tr.y0 + tr.y1) / 2 - Math.abs(tr.x1 - tr.x0) * 0.18 - 14;
        ctx.strokeStyle = tr.side === 0 ? "#cfe8ff" : "#ffd0cb";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(tr.x0, tr.y0);
        ctx.quadraticCurveTo(mx, my, tr.x1, tr.y1);
        ctx.stroke();
        // The 251 missile, streaking the lob while the trail flashes. Its
        // heading is the curve's tangent at the sampled point; the sprite is
        // authored nose-UP, hence the +PI/2.
        {
          const t = 0.62;
          const px2 = (1 - t) * (1 - t) * tr.x0 + 2 * (1 - t) * t * mx + t * t * tr.x1;
          const py2 = (1 - t) * (1 - t) * tr.y0 + 2 * (1 - t) * t * my + t * t * tr.y1;
          const dx = 2 * (1 - t) * (mx - tr.x0) + 2 * t * (tr.x1 - mx);
          const dy = 2 * (1 - t) * (my - tr.y0) + 2 * t * (tr.y1 - my);
          sprRot(ctx, ART["units/missile"], px2, py2, 10, Math.atan2(dy, dx) + Math.PI / 2, () => {});
        }
        continue;
      } else {
        ctx.strokeStyle = tr.side === 0 ? "#cfe8ff" : "#ffd0cb";
        ctx.lineWidth = 1.6;
      }
      ctx.beginPath();
      ctx.moveTo(tr.x0, tr.y0);
      ctx.lineTo(tr.x1, tr.y1);
      ctx.stroke();
      // MUZZLE LIGHT: a hot core + halo at the shot's origin, sized by the
      // trail's own life so it blooms and dies with the tracer. This is the
      // cheapest "guns have weight" cue there is, and the game had none.
      {
        const mf = Math.max(0, tr.life / (tr.beam ? 0.16 : 0.09));
        ctx.globalAlpha = mf * 0.9;
        ctx.fillStyle = "#fff3c8";
        ctx.beginPath();
        ctx.arc(tr.x0, tr.y0, 2.2 + mf * 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = mf * 0.35;
        ctx.fillStyle = "#ffb64f";
        ctx.beginPath();
        ctx.arc(tr.x0, tr.y0, 5 + mf * 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const p of s.parts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 3));
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // floaters
    ctx.textAlign = "center";
    for (const f of s.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.font = `800 ${f.big ? 15 : 12}px ui-sans-serif,system-ui,sans-serif`;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillStyle = f.big ? ACCENT : "#fff";
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // ── HUD strip ───────────────────────────────────────────────────────────
    // THE FRAME. A pitch without an edge reads as green that ran out.
    ctx.strokeStyle = "#cfd6cd";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, FIELD_H - 6);
    ink(ctx, 3);
    ctx.strokeRect(1.5, 1.5, W - 3, FIELD_H - 3);
    ctx.strokeRect(6, 6, W - 12, FIELD_H - 12);

    ctx.fillStyle = "#12161b";
    ctx.fillRect(0, FIELD_H, W, H - FIELD_H);

    // ROUND PILL + CLOCK, on their own dark band. They used to be drawn as
    // bare ACCENT text straight onto the field, which put dark orange on
    // bright green over the top of the enemy HQ: the two least readable
    // things on the board, on top of each other.
    // TWO CORNER PILLS, never a full-width band. The enemy HQ stands at the
    // top CENTRE of the board, so a banner across the top edge sits on the
    // objective, which is what Mike hit. That edge belongs to the HQ.
    const mm = Math.max(0, Math.floor(s.roundT / 60));
    const ss = Math.max(0, Math.floor(s.roundT % 60));
    const pill = (text: string, right: boolean, color: string) => {
      ctx.font = "800 12px ui-monospace,Menlo,monospace";
      const pw = ctx.measureText(text).width + 16;
      const px = right ? W - 10 - pw : 10;
      ctx.fillStyle = "rgba(10,13,17,0.78)";
      ctx.beginPath();
      ctx.roundRect(px, 9, pw, 21, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = color;
      ctx.fillText(text, px + 8, 24);
    };
    // ONE BATTLE: the clock is the whole story, and the final minute announces
    // itself (both bars double there, so it has to be visible without reading
    // a number).
    const surging = ROUND_T - s.roundT >= SURGE_T;
    pill(
      surging
        ? `${mm}:${String(ss).padStart(2, "0")} · DOUBLE MANA`
        : `${mm}:${String(ss).padStart(2, "0")}`,
      false,
      surging ? "#ffd166" : "#ffd7a8",
    );
    pill(`${armorclashScore(s)}`, true, "#ffffff");

    // mana bar with cost notches
    const mx = 12;
    const my = FIELD_H + 8;
    const mw = W - 100;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(mx, my, mw, 10);
    ctx.fillStyle = "#7b5cff";
    ctx.fillRect(mx, my, mw * (s.mana / MANA_CAP), 10);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let i = 1; i < MANA_CAP; i++) {
      const nx = mx + (mw * i) / MANA_CAP;
      ctx.beginPath();
      ctx.moveTo(nx, my);
      ctx.lineTo(nx, my + 10);
      ctx.stroke();
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "800 11px ui-monospace,Menlo,monospace";
    ctx.fillText(`${Math.floor(s.mana)}`, mx + mw + 6, my + 9);
    // Optics: the enemy's bar, so a well-scouted player can read their tempo
    if (s.mods.showEnemyMana) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(mx, my - 7, mw, 4);
      ctx.fillStyle = MAGENTA;
      ctx.fillRect(mx, my - 7, mw * (s.enemyMana / MANA_CAP), 4);
    }

/** A PILLBOX, from above. There is no sprite for it: the card fell through to
 * the generic blue rounded rectangle every un-arted card gets, and on the field
 * it borrowed the MORTAR plate, so the new emplacement looked like a bug in two
 * places at once. Concrete ring, dark interior, and a firing slit facing the
 * enemy bank -- three shapes, unmistakable at 34px and at 20px. */
function drawPillbox(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, mine: boolean) {
  const r = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(12,16,12,0.34)";
  ctx.beginPath();
  ctx.ellipse(1.5, r * 0.34, r * 0.98, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // concrete
  ctx.fillStyle = "#9aa0a2";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7c8385";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  // the casemate
  ctx.fillStyle = "#2b3134";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // firing slit, pointing at the enemy bank
  ctx.fillStyle = "#12181a";
  ctx.fillRect(-r * 0.62, mine ? -r * 0.86 : r * 0.5, r * 1.24, r * 0.36);
  ctx.fillStyle = mine ? "#7ee06a" : "#ff7a5c";
  ctx.fillRect(-r * 0.5, mine ? -r * 0.78 : r * 0.58, r, r * 0.16);
  ctx.restore();
}

    // the four card slots
    for (let i = 0; i < 4; i++) {
      const r = slotRect(i);
      const c = CARDS[s.hand[i]];
      const sel = s.sel === i;
      const afford = c && s.mana >= c.cost;
      ctx.fillStyle = sel ? "#22303c" : "#1a2028";
      ctx.beginPath();
      ctx.roundRect(r.x0, r.y0 - (sel ? 4 : 0), r.x1 - r.x0, r.y1 - r.y0, 8);
      ctx.fill();
      ctx.strokeStyle = sel ? ACCENT : "rgba(255,255,255,0.16)";
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.stroke();
      if (!c) continue;
      ctx.globalAlpha = afford ? 1 : 0.42;
      const cx = (r.x0 + r.x1) / 2;
      const cy = r.y0 + 26 - (sel ? 4 : 0);
      if (c.key === "pillbox") {
        drawPillbox(ctx, cx, cy, 32, true);
      } else if (c.key === "mortar") {
        spr(ctx, ART["units/launcher-mine"], cx, cy, 32, () => drawPillbox(ctx, cx, cy, 32, true));
      } else if (STRIP_ROLE[c.key] && ready(ART[`units/${STRIP_ROLE[c.key]}-mine` as keyof typeof ART])) {
        stripRot(ctx, ART[`units/${STRIP_ROLE[c.key]}-mine` as keyof typeof ART], STRIP_FRAMES, 0, cx, cy, 34, -Math.PI / 2, () => {});
      } else {
        ctx.fillStyle = MINE;
        ctx.beginPath();
        ctx.roundRect(cx - 11, cy - 13, 22, 26, 3);
        ctx.fill();
        ink(ctx, 2);
        ctx.stroke();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "700 9px ui-sans-serif,system-ui,sans-serif";
      ctx.fillText(c.name, cx, r.y1 - 16 - (sel ? 4 : 0));
      // the cost coin
      ctx.beginPath();
      ctx.arc(r.x0 + 12, r.y0 + 12 - (sel ? 4 : 0), 9, 0, Math.PI * 2);
      ctx.fillStyle = "#7b5cff";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "800 11px ui-monospace,Menlo,monospace";
      ctx.fillText(`${c.cost}`, r.x0 + 12, r.y0 + 16 - (sel ? 4 : 0));
      ctx.globalAlpha = 1;
    }

    // the NEXT card, display only
    const nx0 = W - 44;
    ctx.fillStyle = "#161c23";
    ctx.beginPath();
    ctx.roundRect(nx0, 408, 36, 60, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "700 8px ui-monospace,Menlo,monospace";
    ctx.fillText(T("NEXT"), nx0 + 18, 419);
    const nc = CARDS[s.next];
    if (nc) {
      const key = `unit-${nc.key}` as keyof typeof ART;
      if (ready(ART[key])) spr(ctx, ART[key], nx0 + 18, 440, 24, () => {});
      else {
        ctx.fillStyle = MINE;
        ctx.beginPath();
        ctx.roundRect(nx0 + 10, 430, 16, 20, 3);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.font = "800 10px ui-monospace,Menlo,monospace";
      ctx.fillText(`${nc.cost}`, nx0 + 18, 464);
    }

    // ── banner ──────────────────────────────────────────────────────────────
    if (s.banner) {
      const a = Math.max(0, Math.min(1, s.banner.t * 2));
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(8,10,14,0.62)";
      ctx.fillRect(0, FIELD_H * 0.36, W, s.banner.sub ? 56 : 40);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${s.banner.big ? 21 : 16}px ui-monospace,Menlo,monospace`;
      ctx.fillText(T(s.banner.txt), W / 2, FIELD_H * 0.36 + 27);
      if (s.banner.sub) {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "700 11px ui-sans-serif,system-ui,sans-serif";
        ctx.fillText(T(s.banner.sub), W / 2, FIELD_H * 0.36 + 47);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }, []);

  const onFrame = useCallback((s: AcState, sfx: Sfx) => {
    const p = prevRef.current;
    if (s.kills > p.kills) sfx.play("score");
    if (s.deploysPlayer > p.deploys) sfx.play("clank");
    if (s.towersDownEnemy > p.towers) sfx.play("blast");
    if (s.hqDownEnemy > p.hqs) sfx.play("fanfare");
    if (s.round > p.round) sfx.play("banner");
    if (s.denyT > p.deny) sfx.play("ricochet");
    p.kills = s.kills;
    p.deploys = s.deploysPlayer;
    p.towers = s.towersDownEnemy;
    p.hqs = s.hqDownEnemy;
    p.round = s.round;
    p.deny = s.denyT;
  }, []);

  return (
    <RunShell<AcState>
      game={GAME}
      title="Armor Clash"
      accent={ACCENT}
      worldSize={() => ({ w: VIEW_W, h: VIEW_H })}
      createSim={createSim}
      step={(s, dt, input: ShellInput) => stepArmorclash(s, dt, input)}
      draw={draw}
      done={armorclashDone}
      score={armorclashScore}
      onFrame={onFrame}
      sfxPack={["tap", "clank", "cannon", "hit", "ricochet", "explode", "blast", "banner", "boss", "score", "fanfare", "ko"]}
      runMeta={(s, ctx) => ({
        v: 1,
        daily: ctx.daily,
        grid: ctx.grid,
        round: s.round,
        kills: s.kills,
        hqs: s.hqDownEnemy,
      })}
      shareBuild={(s, dayKey) => {
        const grid = gridEmoji(s);
        return { grid, payload: sharePayload(dayKey, armorclashScore(s), grid) };
      }}
      resultHeadline={(s) => (s.win ? "The river is yours" : "The advance is broken")}
      resultSub={(s) =>
        `${s.kills} kills · ${s.towers.filter((t) => t.side === 1 && t.dead).length} of their structures razed`
      }
      intro={<GameIntro intro={strings?.intro ??
              "Tap a card, then tap your own half of the field. That tank rolls itself to the nearest bridge and picks its own fights. Raze their HQ to take the round."} daily={strings?.introDaily ??
              "Your first scored run today is the shared daily clash: everyone fights the same battle."} more={strings?.shell?.howItWorks} />}
      strings={{
        startIdle: "Sound the advance",
        startAgain: "Advance again",
        scoreUnit: "damage",
        dailyResultNote: "The daily clash · the same battlefield for everyone today",
        ...strings?.shell,
      }}
    />
  );
}
