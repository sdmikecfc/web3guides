/**
 * THE FRONT scene (ADR-0121): everything the battlefield paints. Owns no
 * rAF - Battlefield.tsx drives step + render. Ground is PROCEDURAL first
 * (kit law: the page must look right with the art folder deleted); sprite
 * art layers on top where it exists. All positions in sim px (2600x1080),
 * letterboxed by the pixi stage.
 */
"use client";

import type { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { createPixiStage, type PixiStage } from "../games/_shared/pixi";
import {
  BAND_Y0,
  BAND_Y1,
  FRONT_H,
  FRONT_W,
  HUMAN_EDGE,
  WARDEN_EDGE,
  frontXAt,
  setFrontTarget,
  setObstacles,
  type FrontEvent,
  type FrontSim,
} from "./sim";
import { BUILDING_ROUTES, FRONT_LAYOUT, MILESTONE_SPOTS, type LayoutItem } from "./setdressing";
// the SHIPPED class-id validator (client-safe; Battlefield.tsx already
// imports it into this bundle) - never a re-listed local whitelist
import { isClassId } from "@/lib/s7/classes";

export interface Milestone {
  x: number;
  name: string;
  state: "held" | "active" | "reclaimed";
  pct: number; // paid peak %, 100 when reclaimed
}

export interface FrontSceneHandle {
  stage: PixiStage;
  render: (dt: number) => void;
  resize: (cssW: number, cssH: number, dpr: number) => void;
  setData: (milestones: Milestone[], frontX: number, reclaimed: boolean) => void;
  /** wheel zoom anchored at a css point; factor >1 zooms in. k clamps 1..3 */
  zoomAt: (cssX: number, cssY: number, factor: number) => void;
  panBy: (cssDx: number, cssDy: number) => void;
  destroy: () => void;
}

const C = {
  groundWest: 0x6f7d4a, // warm field green
  groundMid: 0x6b6350, // scarred earth
  groundEast: 0x3c4652, // cold alloy
  contour: 0xfff8e8,
  road: 0x2f2b26,
  rail: 0x4a4640,
  human: 0xffd28a,
  humanDeep: 0xe0662e,
  warden: 0x8fe2ff,
  wardenDeep: 0x2ea8d8,
  danger: 0xff5c48,
  white: 0xf0f0eb,
  slab: 0x07090d,
} as const;

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

/** deterministic scenery rng - never consumes the sim stream */
function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UNIT_ART = "/s7-art/front-units"; // REALMFALL guild + legion (keyed, all facing EAST)
const KEEP_ART = "/s7-art/keeps";
const FORT_ART = "/s5-art/world";
const FX_ART = "/s6-art/front/fx";
const DRONE_ART = `${UNIT_ART}/legion-wraith.png`;

export async function buildFrontScene(
  canvas: HTMLCanvasElement,
  sim: FrontSim,
  opts: {
    small: boolean;
    /** first-visit pulse on the PLAY marker (presentation only): stronger
     * halo + label swell for the scene's first 10s. Battlefield passes true
     * only while the map legend has never been closed. */
    pulsePlay?: boolean;
    onNavigate?: (href: string) => void;
    onFortTap?: (index: number, cssX: number, cssY: number) => void;
  },
): Promise<FrontSceneHandle> {
  const stage = await createPixiStage(canvas, { background: 0x0b0d12 });
  const PIXI = stage.pixi;
  const W = stage.world;

  // ---- texture shelf (every load individually guarded: kit law) ----
  const tex = new Map<string, Texture>();
  const tryLoad = async (key: string, url: string) => {
    try {
      const t = (await PIXI.Assets.load(url)) as Texture;
      tex.set(key, t);
    } catch {
      /* vector fallback covers it */
    }
  };
  // every hull the sim's class pools can roll (sim assigns u.tankKey; the
  // big arty hulls park deep and lob, the shield hulls hold the line)
  const hulls = ["scout", "hound", "badger", "sentry", "ram", "brawler", "bulwark", "mortar", "anvil", "atlas", "juggernaut"];
  const INF_HUMAN = ["hornet", "recon"];
  const INF_WARDEN = ["viper", "spectre"];
  // REALMFALL unit art: three guild renders cover the armor roster by
  // battlefield role (skirmish + line hulls = knight, standoff = archer, the
  // deep arty hulls = catapult); legion foot troops are skeletons + wraiths.
  // The hull KEYS stay - the sim's pools, bands and widths are keyed on them.
  const UNIT_FILE: Record<string, string> = {
    scout: "guild-knight", hound: "guild-knight", ram: "guild-knight",
    brawler: "guild-knight", bulwark: "guild-knight",
    badger: "guild-archer", sentry: "guild-archer",
    mortar: "guild-catapult", anvil: "guild-catapult",
    atlas: "guild-catapult", juggernaut: "guild-catapult",
    hornet: "guild-knight", recon: "guild-archer",
    viper: "legion-skeleton", spectre: "legion-wraith",
  };
  await Promise.all([
    ...[...hulls, "hornet", "recon", "viper", "spectre"].map((h) =>
      tryLoad(`tank:${h}`, `${UNIT_ART}/${UNIT_FILE[h] ?? "guild-knight"}.png`),
    ),
    tryLoad("drone", DRONE_ART),
    ...[1, 2, 3, 4, 5].map((i) => tryLoad(`boom${i}`, `${FX_ART}/explosion${i}.png`)),
    ...[1, 2, 3].map((i) => tryLoad(`smoke${i}`, `${FX_ART}/explosionSmoke${i}.png`)),
    ...["", "2", "3"].flatMap((a) =>
      ["intact", "sieged", "breached"].map((s) => tryLoad(`fort${a}:${s}`, `${FORT_ART}/fort${a}-${s}.webp`)),
    ),
    // REALMFALL keeps (2026-08-31, Mike: "the domains are all the same dark
    // castle... something easier to see"): FIVE distinct cursed variants now
    // cycle the stands - green witch-fire, purple crystal, cyan spectral,
    // ember gate, bone-white ossuary - each with a bright accent glow that
    // reads on the dark east. keep-reclaimed still serves every freed stand;
    // a missing variant file falls to the legacy S5 fort chain below.
    ...[1, 2, 3, 4, 5].flatMap((i) => [
      tryLoad(`fortress${i}`, `${KEEP_ART}/keep-cursed-${i}.png`),
      tryLoad(`fortress${i}-lib`, `${KEEP_ART}/keep-reclaimed.png`),
    ]),
    // ground wash is the REALMFALL plate (2026-08-27: the S6 plate had
    // circuit-ice and machine-war debris painted in - the last S6 pixels on the
    // map); citadel-freed.png stays on disk for a season-end beat, unwired
    tryLoad("wash", "/s7-art/front/wash.webp"),
    tryLoad("citadel", `${KEEP_ART}/citadel-dark.png`),
    tryLoad("walker", `${UNIT_ART}/legion-golem.png`),
  ]);
  const namedTexQueue = new Set<string>();
  // NAMED UNITS draw from the shelf ONLY: the class figure first (clsTex,
  // below), else the hull's guild texture already loaded from front-units.
  // The old per-name lazy-load from the s7 map-tanks folder is gone on
  // purpose: that directory never shipped, so every fetch was a guaranteed 404.
  const namedTex = (tankKey: string): Texture | null =>
    tex.get(`tank:${tankKey}`) ?? tex.get("tank:scout") ?? null;
  // CLASS FIGURES (Mike 2026-08-30: "Top players fight as their class"):
  // named adventurers who picked a class draw its full-body painted figure
  // (class-<id>.png, authored facing EAST like all the fleet art). Lazy
  // idiom: queue once, return null until the texture lands - so an
  // unknown/null cls, a missing file or a failed load all return null and
  // the caller falls through to the tank chain: the kit-law path is intact.
  const clsTex = (cls: string | null | undefined): Texture | null => {
    if (!isClassId(cls)) return null;
    const k = `cls:${cls}`;
    const t = tex.get(k);
    if (t) return t;
    if (!namedTexQueue.has(k)) {
      namedTexQueue.add(k);
      void tryLoad(k, `${UNIT_ART}/class-${cls}.png`);
    }
    return null;
  };

  // ---- layers, painter's order (all inside the CAMERA for pan/zoom) ----
  const cam = new PIXI.Container();
  W.addChild(cam);
  const groundG = new PIXI.Graphics();
  const milestonesC = new PIXI.Container();
  const territoryG = new PIXI.Graphics();
  const fortsC = new PIXI.Container();
  const baseC = new PIXI.Container();
  const setC = new PIXI.Container(); // Mike-authored set dressing (layout.ts)
  const tanksC = new PIXI.Container();
  const infG = new PIXI.Graphics();
  const fxC = new PIXI.Container();
  const labelsC = new PIXI.Container();
  cam.addChild(groundG, milestonesC, territoryG, fortsC, baseC, setC, tanksC, infG, fxC, labelsC);
  // camera state: k=1 shows the whole board; clamp keeps the view on it
  let camK = 1;
  let camX = 0;
  let camY = 0;
  const camClamp = () => {
    camK = Math.max(1, Math.min(3, camK));
    camX = Math.max(FRONT_W * (1 - camK), Math.min(0, camX));
    camY = Math.max(FRONT_H * (1 - camK), Math.min(0, camY));
    cam.scale.set(camK);
    cam.position.set(camX, camY);
  };
  // css->sim: undo the letterbox (stage.world scale/offset applied by resize)
  const cssToSim = (cssX: number, cssY: number) => {
    const ws = W.scale.x || 1;
    return { x: (cssX - W.position.x) / ws, y: (cssY - W.position.y) / ws };
  };

  // ---- ground (once) ----
  {
    const rng = seededRng(77);
    const y0 = BAND_Y0 - 90;
    const y1 = BAND_Y1 + 46;
    const strips = 26;
    // painted wash underlay when present; procedural strips stay as the
    // kit-law fallback AND the etching layer on top either way
    const washT = tex.get("wash");
    if (washT) {
      const s = new PIXI.Sprite(washT);
      s.position.set(0, y0);
      s.width = FRONT_W;
      s.height = y1 - y0;
      s.alpha = 1;
      cam.addChildAt(s, cam.getChildIndex(groundG));
    }
    if (!washT) {
      for (let i = 0; i < strips; i++) {
        const t = i / (strips - 1);
        const col =
          t < 0.5 ? lerpColor(C.groundWest, C.groundMid, t * 2) : lerpColor(C.groundMid, C.groundEast, (t - 0.5) * 2);
        groundG.rect((FRONT_W / strips) * i, y0, FRONT_W / strips + 1, y1 - y0).fill({ color: col });
      }
      // value-noise blobs give the flat strips gentle hills
      for (let i = 0; i < 90; i++) {
        const x = rng() * FRONT_W;
        const light = rng() > 0.5;
        groundG
          .ellipse(x, y0 + rng() * (y1 - y0), 60 + rng() * 170, 24 + rng() * 60)
          .fill({ color: light ? 0xffffff : 0x000000, alpha: light ? 0.035 : 0.05 });
      }
    }
    // contour lines - the military-map signature; SKIPPED over the painted
    // wash (Mike: the haze made it hard to read - the wash has its own detail)
    for (let c = 0; washT == null && c < 6; c++) {
      const by = y0 + ((c + 0.7) / 7) * (y1 - y0);
      groundG.moveTo(0, by);
      for (let x = 0; x <= FRONT_W; x += 52) {
        groundG.lineTo(x, by + Math.sin(x * 0.006 + c * 2.2) * 26 + Math.sin(x * 0.0017 + c) * 40);
      }
      groundG.stroke({ width: 1, color: C.contour, alpha: 0.07 });
    }
    // supply road (south) + rail line (north) - procedural fallback only
    if (!washT) {
    groundG.moveTo(0, 760);
    for (let x = 0; x <= FRONT_W; x += 60) groundG.lineTo(x, 760 + Math.sin(x * 0.0021) * 46);
    groundG.stroke({ width: 26, color: C.road, alpha: 0.65 });
    for (const off of [-7, 7]) {
      groundG.moveTo(0, 330 + off);
      for (let x = 0; x <= FRONT_W; x += 60) groundG.lineTo(x, 330 + off + Math.sin(x * 0.0013 + 5) * 30);
      groundG.stroke({ width: 3, color: C.rail, alpha: 0.8 });
    }
    for (let x = 0; x <= FRONT_W; x += 26) {
      const y = 330 + Math.sin(x * 0.0013 + 5) * 30;
      groundG.moveTo(x, y - 9).lineTo(x, y + 9).stroke({ width: 2, color: C.rail, alpha: 0.5 });
    }
    // west copses / east crystal shards
    for (let i = 0; i < 46; i++) {
      const x = 40 + rng() * (HUMAN_EDGE + 260);
      const y = y0 + 30 + rng() * (y1 - y0 - 60);
      const s = 7 + rng() * 9;
      groundG.moveTo(x, y - s).lineTo(x - s * 0.7, y + s * 0.6).lineTo(x + s * 0.7, y + s * 0.6).closePath();
      groundG.fill({ color: 0x3f5233, alpha: 0.85 });
    }
    for (let i = 0; i < 26; i++) {
      const x = WARDEN_EDGE - 380 + rng() * 500;
      const y = y0 + 30 + rng() * (y1 - y0 - 60);
      const s = 6 + rng() * 10;
      groundG.moveTo(x, y - s * 1.4).lineTo(x - s * 0.5, y + s * 0.5).lineTo(x + s * 0.5, y + s * 0.5).closePath();
      groundG.fill({ color: 0x77d9f5, alpha: 0.5 });
    }
    }
    // slab bevel: the newhedge table-model edge
    groundG.rect(0, y1, FRONT_W, FRONT_H - y1).fill({ color: C.slab });
    groundG.moveTo(0, y1).lineTo(FRONT_W, y1).stroke({ width: 3, color: 0x000000, alpha: 0.55 });
    groundG.rect(0, y1, FRONT_W, 16).fill({ color: 0x000000, alpha: 0.35 });
    groundG.rect(0, y0 - 200, FRONT_W, 200).fill({ color: C.slab });
    groundG.moveTo(0, y0).lineTo(FRONT_W, y0).stroke({ width: 2, color: 0xffffff, alpha: 0.08 });
  }

  // ---- base + citadel dressing (vector v1) ----
  {
    const g = new PIXI.Graphics();
    // (vector hangars retired 2026-08-14: real buildings come from layout.ts)
    // Lich citadel east (generated art > fort3 tint > vector spire)
    const cit = tex.get("citadel") ?? tex.get("fort3:intact");
    if (cit) {
      const s = new PIXI.Sprite(cit);
      s.anchor.set(0.5, 1);
      // 2440, not 2520: at 240 wide the citadel spanned x 2400-2640 against a
      // 2600 board, so its east flank hung off the map (Mike, 2026-08-16:
      // "the warden on the right needs to go in a little"). 2440 spans
      // 2320-2560, clear of the edge with room for its danger rings.
      // y 610, not 700 (Mike 2026-08-17: "move the warden up"): the live
      // feed panel now overlays the field's bottom band, and the citadel's
      // rings reached the very bottom edge of the board.
      s.position.set(2440, 610);
      const cw2 = tex.get("citadel") ? 240 : 170;
      s.width = cw2;
      s.height = (cit.height / cit.width) * cw2;
      if (!tex.get("citadel")) s.tint = 0x9fd8ff;
      baseC.addChild(s);
    } else {
      g.moveTo(2440, 200).lineTo(2390, 610).lineTo(2490, 610).closePath().fill({ color: 0x2a3644 });
    }
    g.ellipse(2440, 610, 120, 34).stroke({ width: 4, color: C.danger, alpha: 0.8 });
    g.ellipse(2440, 610, 88, 24).stroke({ width: 2, color: C.warden, alpha: 0.8 });
    baseC.addChild(g);
    // EVERY structure on this board is named (Mike: "all of them need labels").
    // The Lich's seat was the one unlabelled landmark on the map.
    const wl = new PIXI.Text({
      text: "THE LICH",
      style: {
        fill: C.danger,
        fontSize: 17,
        fontFamily: "Segoe UI, sans-serif",
        fontWeight: "800",
        stroke: { color: 0x05070b, width: 4 },
      },
    });
    wl.anchor.set(0.5, 0);
    wl.position.set(2440, 622);
    baseC.addChild(wl);
  }

  // ---- set dressing (Mike-authored layout: props + clickable buildings) ----
  const setObs: Array<{ x: number; y: number; r: number }> = [];
  {
    const items: LayoutItem[] = FRONT_LAYOUT;
    await Promise.all(
      // S7 set art wins when it exists (setdressing.ts documents the s7 path);
      // the S6 baked set remains the fallback for keys not yet re-rendered
      Array.from(new Set(items.map((it) => it.key))).map(async (k) => {
        await tryLoad(`set:${k}`, `/s7-art/front/set/${k}.png`);
        if (!tex.get(`set:${k}`)) await tryLoad(`set:${k}`, `/s6-art/front/set/${k}.png`);
      }),
    );
    for (const it of items) {
      const t = tex.get(`set:${it.key}`);
      if (!t) continue; // art not landed yet: skip silently (kit law)
      const sp = new PIXI.Sprite(t);
      sp.anchor.set(0.5, 1);
      const w = t.width * 0.5 * it.s; // baked at 2x for zoom crispness
      sp.width = it.flip ? -w : w;
      sp.height = t.height * 0.5 * it.s;
      sp.position.set(it.x, it.y);
      sp.zIndex = it.y;
      // GROUNDING SHADOW (Mike 2026-08-17: "a little shadow at the base to
      // make it look like it fits in more"). A soft contact ellipse under
      // every BUILDING - the same trick that seats the battle units on the
      // ground. Props skip it: trees carry painted shadows already.
      if (it.key.startsWith("bld-")) {
        const sh = new PIXI.Graphics();
        sh.ellipse(it.x, it.y - 3, Math.abs(w) * 0.46, Math.abs(w) * 0.13).fill({ color: 0x000000, alpha: 0.28 });
        sh.zIndex = it.y - 1;
        setC.addChild(sh);
      }
      const route = BUILDING_ROUTES[it.key];
      if (route) {
        sp.eventMode = "static";
        sp.cursor = "pointer";
        sp.on("pointertap", () => opts.onNavigate?.(route));
      }
      setC.addChild(sp);
      if (it.key.startsWith("bld-") || it.key.startsWith("prop-ruin") || it.key === "prop-watertower") {
        setObs.push({ x: it.x, y: it.y - 12, r: Math.max(30, w * 0.42) });
      }
    }
    setC.sortableChildren = true;
    // labels ONLY on clickable buildings (props stay untagged on the board),
    // plus ONE routeless exception: bld-kitchen has no route yet (SOON), but
    // an unlabeled building on an all-labeled board read as a bug, so its
    // label draws while the sprite stays non-clickable.
    const BLD_LABELS: Record<string, string> = {
      "bld-base": "GUILD HALL", "bld-board": "WAR TABLE", "bld-ironjaw": "THE GAUNTLET",
      "bld-strain": "HORDEBREAKER", "bld-stopclock": "THE CRYPT", "bld-arcade": "TAVERN",
      "bld-challenges": "CHALLENGES", "bld-riot": "THE SPIRE",
      "bld-kitchen": "KITCHEN · SOON",
    };
    for (const it of items) {
      const lbl = BLD_LABELS[it.key];
      if (!lbl || (!BUILDING_ROUTES[it.key] && it.key !== "bld-kitchen")) continue;
      const t = new PIXI.Text({
        text: lbl,
        style: { fill: 0xffd28a, fontSize: 15, fontFamily: "Segoe UI, sans-serif", fontWeight: "800" },
      });
      t.anchor.set(0.5, 0);
      t.position.set(it.x, it.y + 4);
      t.zIndex = it.y + 1;
      setC.addChild(t);
    }
  }

  // PLAY + ATTACK markers (Mike 2026-08-17: "the attack symbol is not the
  // right color, hard to see and there are no play arrows"). The old ones
  // were world-space text: the 2600px world letterboxes to ~0.4x on screen,
  // so 20px labels rendered ~8px, and the red ATTACK sat on the machine-rust
  // territory it was pointing at. Now each marker is a prebuilt pill + cased
  // chevron, counter-scaled every frame to hold screen size at any zoom, and
  // EVERY game arena gets a PLAY arrow (today's gauntlet biggest + pulsing),
  // not just the day's rotation.
  const mkMarker = (label: string, color: number, textFill: number, big: boolean) => {
    const c = new PIXI.Container();
    const k = big ? 1 : 0.8;
    const g = new PIXI.Graphics();
    // dark casing under the colour so the chevron survives ANY terrain
    g.moveTo(-14 * k, -17 * k)
      .lineTo(0, 0)
      .lineTo(14 * k, -17 * k)
      .stroke({ width: 11 * k, color: 0x0c1014, alpha: 0.85, join: "round", cap: "round" });
    g.moveTo(-14 * k, -17 * k)
      .lineTo(0, 0)
      .lineTo(14 * k, -17 * k)
      .stroke({ width: 5.5 * k, color, join: "round", cap: "round" });
    const t = new PIXI.Text({
      text: label,
      style: {
        fill: textFill,
        fontSize: big ? 19 : 15,
        fontFamily: "Segoe UI, sans-serif",
        fontWeight: "900",
        letterSpacing: 1,
      },
    });
    t.anchor.set(0.5, 1);
    t.position.set(0, -24 * k);
    const pw = t.width + 20 * k;
    const ph = t.height + 9 * k;
    const pill = new PIXI.Graphics();
    pill
      .roundRect(-pw / 2, -24 * k - t.height - 4.5 * k, pw, ph, ph / 2)
      .fill({ color: 0x0c1014, alpha: 0.86 })
      .stroke({ width: 2.5, color, alpha: 0.95 });
    c.addChild(pill, g, t);
    c.zIndex = 99999; // above the battle name labels that share labelsC
    labelsC.addChild(c);
    return c;
  };
  labelsC.sortableChildren = true;
  const GAME_KEYS = ["bld-ironjaw", "bld-strain", "bld-stopclock", "bld-riot"];
  const dayIdx = Math.floor(Date.now() / 86400000) % GAME_KEYS.length;
  // anchor at the building's ACTUAL scaled top (the icons shrank today; a
  // fixed offset would float the arrows in mid-air)
  const arenaAnchor = (key: string) => {
    const it = FRONT_LAYOUT.find((l) => l.key === key);
    const t = tex.get(`set:${key}`);
    if (!it || !t) return null;
    return { x: it.x, y: it.y - t.height * 0.5 * it.s };
  };
  const playMarkers = GAME_KEYS.map((key) => {
    const a = arenaAnchor(key);
    if (!a) return null;
    const today = key === GAME_KEYS[dayIdx];
    return { c: mkMarker("PLAY", 0xf0b340, 0xffd98a, today), x: a.x, y: a.y, today };
  }).filter((m): m is NonNullable<typeof m> => m !== null);
  // ATTACK: white on a red-rimmed dark pill - the one pairing that reads on
  // tan ground, rust territory AND the fortress art it points at
  const attackM = mkMarker("ATTACK", 0xff3b30, 0xffffff, true);
  attackM.visible = false;
  const markersG = new PIXI.Graphics();
  labelsC.addChild(markersG);

  // ---- milestones (rebuilt on data) ----
  let milestones: Milestone[] = [];
  const fortPool: Sprite[] = [];
  const msG = new PIXI.Graphics();
  milestonesC.addChild(msG);
  const msTexts: Text[] = [];
  const FORT_Y = [340, 620, 900];
  const spotFor = (i: number) => MILESTONE_SPOTS[i] ?? { x: 0, y: FORT_Y[i % 3] };

  function paintMilestones() {
    msG.clear();
    for (const t of msTexts) t.destroy();
    msTexts.length = 0;
    for (const s of fortPool) s.visible = false;
    milestones.forEach((m, i) => {
      const col = m.state === "reclaimed" ? C.human : m.state === "active" ? C.white : C.warden;
      // etched vertical line, dashed for the active one
      if (m.state === "active") {
        for (let y = BAND_Y0 - 60; y < BAND_Y1; y += 26)
          msG.moveTo(m.x, y).lineTo(m.x, y + 14).stroke({ width: 2, color: col, alpha: 0.5 });
      } else {
        msG.moveTo(m.x, BAND_Y0 - 60).lineTo(m.x, BAND_Y1).stroke({ width: 2, color: col, alpha: 0.3 });
      }
      // THE NAME GOES ON THE KEEP, NOT ON THE LADDER LINE (Mike,
      // 2026-08-16: "all of them need labels"). It used to render rotated 90
      // degrees at the foot of the etched line, which is the milestone's
      // position on the liberation LADDER (m.x) and nowhere near the tower the
      // player is actually looking at (spotFor(i)). So every keep read as
      // unlabelled while faint sideways text floated over open ground. Now it
      // sits horizontally under its own stand, in the building-label grammar,
      // stroked so it survives both the pale west grass and the dark east ice.
      const sp = spotFor(i);
      const label = new PIXI.Text({
        text: m.state === "active" ? `${m.name} ${m.pct}%` : m.name,
        style: {
          fill: col,
          fontSize: 16,
          fontFamily: "Segoe UI, sans-serif",
          fontWeight: "800",
          stroke: { color: 0x05070b, width: 4 },
        },
      });
      label.anchor.set(0.5, 0);
      label.position.set(sp.x, sp.y + 6);
      label.alpha = m.state === "held" ? 0.9 : 1;
      milestonesC.addChild(label);
      msTexts.push(label);
      // fortress sprite on the line (5 cursed variants cycle by stand index)
      const archN = (i % 5) + 1;
      const s7key = m.state === "reclaimed" ? `fortress${archN}-lib` : `fortress${archN}`;
      const legacyArch = ["", "2", "3"][i % 3];
      const legacyState = m.state === "reclaimed" ? "breached" : m.state === "active" ? "sieged" : "intact";
      const ft = tex.get(s7key) ?? tex.get(`fort${legacyArch}:${legacyState}`);
      const fy = spotFor(i).y;
      if (ft) {
        let s = fortPool[i];
        if (!s) {
          s = new PIXI.Sprite(ft);
          fortPool[i] = s;
          fortsC.addChild(s);
          s.eventMode = "static";
          s.cursor = "pointer";
          const idx = i;
          s.on("pointertap", () => {
            // sim -> css: apply camera then the letterbox transform
            const sp2 = spotFor(idx);
            const ws = W.scale.x || 1;
            const cssX = (sp2.x * camK + camX) * ws + W.position.x;
            const cssY = ((sp2.y - 60) * camK + camY) * ws + W.position.y;
            opts.onFortTap?.(idx, cssX, cssY);
          });
        }
        s.texture = ft;
        s.visible = true;
        s.anchor.set(0.5, 1);
        s.position.set(spotFor(i).x, spotFor(i).y); // Mike-authored stands
        const fw = 118;
        s.width = fw;
        s.height = (ft.height / ft.width) * fw;
        // native S7 art carries its own palette; only the legacy fallback tints
        s.tint = tex.get(s7key) ? 0xffffff : m.state === "reclaimed" ? 0xffd9a0 : m.state === "active" ? 0xffffff : 0x9fd8ff;
      } else {
        msG.rect(m.x - 26, fy - 40, 52, 40).fill({ color: 0x333d49 });
        msG.moveTo(m.x - 26, fy - 40).lineTo(m.x, fy - 58).lineTo(m.x + 26, fy - 40).stroke({ width: 3, color: col });
      }
    });
  }

  // ---- units ----
  const unitSprites = new Map<number, Sprite>();
  const nameTexts = new Map<number, Text>();
  const droneT = tex.get("drone");
  // hull class reads at a glance: the deep-standoff arty hulls are the big
  // silhouettes, the skirmish hulls the small ones (Mike 2026-08-17)
  // arty hulls widened for the catapult render (507x256 landscape): at the
  // old 52-56 the siege engines drew ~27px tall next to 70px knights
  const TANK_W: Record<string, number> = {
    scout: 40, hound: 40, ram: 48, brawler: 50, bulwark: 50,
    mortar: 74, anvil: 74, atlas: 84, juggernaut: 84, colossus: 58, paladin: 50,
  };

  // ---- fx pools ----
  interface Boom {
    s: Sprite;
    t: number;
    big: boolean;
  }
  const booms: Boom[] = [];
  const tracers: Array<{ x: number; y: number; tx: number; ty: number; t: number; side: 0 | 1 }> = [];
  const beams: Array<{ x: number; y: number; tx: number; ty: number; t: number }> = [];
  const rockets: Array<{
    x: number; y: number; tx: number; ty: number; t: number; side: 0 | 1;
    /** flight seconds + arc height, scaled by throw distance so the deep
     * artillery lobs read as real mortar arcs, not flat 0.55s hops */
    dur: number; arc: number;
  }> = [];
  let fortLaserT = 0;
  let liberateFlash = 0;
  let liberateX = 0;

  function consume(events: FrontEvent[]) {
    for (const e of events) {
      if (e.type === "shot") tracers.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, t: 0.12, side: e.side });
      else if (e.type === "rocket") {
        const dd = Math.hypot(e.tx - e.x, e.ty - e.y);
        rockets.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, t: 0, side: e.side, dur: 0.5 + dd / 520, arc: 42 + dd * 0.22 });
      }
      else if (e.type === "beam") beams.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, t: 0.3 });
      else if (e.type === "boom") {
        const bt = tex.get("boom1");
        if (bt && booms.length < 22) {
          const s = new PIXI.Sprite(bt);
          s.anchor.set(0.5, 0.72);
          s.position.set(e.x, e.y);
          const w = e.big ? 46 : 26;
          s.width = w;
          s.height = w;
          fxC.addChild(s);
          booms.push({ s, t: 0, big: e.big });
        }
      } else if (e.type === "liberate") {
        liberateFlash = 2.2;
        liberateX = e.x;
      }
    }
    events.length = 0;
  }

  const FRONT_SAMPLES = 22;

  function paintTerritory() {
    territoryG.clear();
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= FRONT_SAMPLES; i++) {
      const y = BAND_Y0 + ((BAND_Y1 - BAND_Y0) * i) / FRONT_SAMPLES;
      pts.push([frontXAt(sim, y), y]);
    }
    // warm behind the front, cold ahead of it
    territoryG.moveTo(0, BAND_Y0 - 60);
    for (const [x, y] of pts) territoryG.lineTo(x, y);
    territoryG.lineTo(0, BAND_Y1);
    territoryG.closePath().fill({ color: C.humanDeep, alpha: 0.07 });
    territoryG.moveTo(FRONT_W, BAND_Y0 - 60);
    for (const [x, y] of pts) territoryG.lineTo(x, y);
    territoryG.lineTo(FRONT_W, BAND_Y1);
    territoryG.closePath().fill({ color: C.wardenDeep, alpha: 0.08 });
    // the line itself: hot core + glow
    for (const [w, a] of [
      [9, 0.10],
      [4, 0.3],
      [2, 0.9],
    ] as const) {
      territoryG.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts) territoryG.lineTo(x, y);
      territoryG.stroke({ width: w, color: C.white, alpha: a });
    }
    if (liberateFlash > 0) {
      const r = (2.2 - liberateFlash) * 320;
      territoryG.circle(liberateX, (BAND_Y0 + BAND_Y1) / 2, r).stroke({
        width: 5,
        color: C.human,
        alpha: Math.max(0, liberateFlash / 2.2) * 0.8,
      });
    }
  }

  // FIRST-VISIT PULSE clock (presentation only): counts render seconds, the
  // pulse dies at 10s. Only ever advances when opts.pulsePlay is set.
  let pulseT = 0;

  function render(dt: number) {
    consume(sim.events);
    paintTerritory();
    if (liberateFlash > 0) liberateFlash -= dt;

    // PLAY + ATTACK markers: counter-scale by the letterbox AND the camera
    // so they hold ~screen size at any zoom (the whole reason the old ones
    // were invisible), bob like the S7 quest markers
    markersG.clear();
    const wsM = W.scale.x || 1;
    const inv = Math.max(1, Math.min(3, 1 / (wsM * camK)));
    const bobY = Math.sin(sim.t * 4.4) * 6 * inv;
    for (const pm of playMarkers) {
      pm.c.scale.set(inv * (pm.today ? 1 : 0.9));
      pm.c.position.set(pm.x, pm.y - 8 * inv + bobY);
      pm.c.alpha = pm.today ? 1 : 0.85;
    }
    // FIRST-VISIT PULSE: an expanding amber halo + a gentle swell on TODAY's
    // arena for the first 10s, only while the legend has never been closed.
    // Pure presentation: no sim state, no layout, dies silently at 10s.
    const todayM = playMarkers.find((m) => m.today);
    if (opts.pulsePlay === true && pulseT < 10 && todayM) {
      pulseT += dt;
      const ph = (pulseT * 1.1) % 1; // ~0.9s ring cycle
      const cy = todayM.y - 30 * inv + bobY; // ring wraps the pill + chevron
      markersG.circle(todayM.x, cy, (34 + ph * 52) * inv).stroke({
        width: 4 * inv,
        color: 0xf0b340,
        alpha: (1 - ph) * 0.75,
      });
      todayM.c.scale.set(inv * (1 + 0.08 * Math.sin(pulseT * 6)));
    }
    const activeIdx = milestones.findIndex((m) => m.state === "active");
    if (activeIdx >= 0) {
      const sp = spotFor(activeIdx);
      const fortS = fortPool[activeIdx];
      const fortH = fortS && fortS.visible ? fortS.height : 150;
      attackM.visible = true;
      attackM.scale.set(inv);
      attackM.position.set(sp.x, sp.y - fortH - 10 * inv + bobY);
    } else attackM.visible = false;

    // sprites for tanks / drones / named; dots for infantry
    infG.clear();
    for (const u of sim.units) {
      const isSprite = u.kind !== "walker";
      if (isSprite) {
        let s = unitSprites.get(u.id);
        if (!s) {
          const t0 =
            u.kind === "drone"
              ? droneT
              : u.kind === "named"
                ? clsTex(u.cls) ?? namedTex(u.tankKey ?? "scout")
                : u.kind === "inf"
                  ? tex.get(`tank:${(u.side === 0 ? INF_HUMAN : INF_WARDEN)[u.id % 2]}`) ?? null
                  : tex.get(`tank:${u.tankKey ?? "scout"}`) ?? tex.get("tank:scout") ?? null;
          if (t0) {
            s = new PIXI.Sprite(t0);
            s.anchor.set(0.5, 0.5);
            unitSprites.set(u.id, s);
            tanksC.addChild(s);
          }
        }
        if (s) {
          s.visible = u.deadT <= 0;
          if (s.visible) {
            const shR = u.kind === "inf" ? 8 : 16;
            infG.ellipse(u.x, u.y + (u.kind === "inf" ? 8 : 12), shR, shR * 0.34).fill({ color: 0x000000, alpha: 0.22 });
          }
          s.position.set(u.x, u.y + (u.kind === "drone" ? Math.sin(sim.t * 3 + u.id) * 4 : 0));
          // LATE CLASS-TEXTURE SWAP: sprites are created ONCE with whatever
          // texture was ready and this loop never re-reads the shelf, so a
          // texture that loads after first sight is stale forever. Tanks have
          // always had that staleness harmlessly (their front-units fallback
          // IS the final art) - a class figure must actually land,
          // so probe per frame until it does. O(1) per named unit: one
          // clsTex call (Map.get behind an id check); flips exactly once.
          // Unknown/null cls or a failed load never flips: guild path stays.
          const sc = s as Sprite & { __cls?: boolean; __lean?: number; __rot?: number };
          if (u.kind === "named" && !sc.__cls) {
            const ct = clsTex(u.cls);
            if (ct) {
              s.texture = ct;
              sc.__cls = true;
            }
          }
          // SIZE BY HEIGHT, NOT WIDTH (Mike, 2026-08-31: "the knights and
          // characters ... are a bit too big, like giants"). Width-sizing
          // made every TALL sprite huge: guild-archer is 162x256, so w=46
          // stood it 72px, taller than the 58px legion skeletons it fights.
          // A figure's drawn HEIGHT is what the eye compares, so pin that
          // and let width follow the aspect. Vehicles (wide art) keep
          // width-sizing - a catapult is measured across, not up.
          const aspect = s.texture.height / s.texture.width;
          const tall = aspect > 1.15;
          const w =
            u.kind === "drone"
              ? 38
              : u.kind === "inf"
                ? 20
                : tall
                  ? (sc.__cls ? 46 : 40) / aspect // class figures read one notch larger
                  : TANK_W[u.tankKey ?? ""] ?? 46;
          // NEVER free-rotate a top-down mini (found live: separation jitter
          // spins them and 180-degree headings read upside down because the
          // art has a baked visual top). Mirror for west + a clamped lean.
          // The mirror sign is u.face - the SIM's hysteretic facing (target
          // side while engaged, travel direction only after it holds 0.25s) -
          // never raw per-frame velocity, which flickered the sprite. All the
          // fleet art is authored facing EAST (drills, claws, shields right),
          // so face=1 is unmirrored. u.vx is px/s.
          const sv = s as Sprite & { __lean?: number; __rot?: number };
          const speed2 = u.vx * u.vx + u.vy * u.vy;
          if (speed2 > 100) {
            const targetLean = Math.max(-0.5, Math.min(0.5, Math.atan2(u.vy, Math.abs(u.vx) + 18)));
            sv.__lean = (sv.__lean ?? 0) + (targetLean - (sv.__lean ?? 0)) * 0.08;
          } else {
            // parked units settle flat (arty sits square behind the line)
            sv.__lean = (sv.__lean ?? 0) * 0.97;
          }
          // FACING LATCH, EVERY SPRITE (Mike, 2026-08-31: "the big enemies
          // are still going back and forth and vibrating" - the walker got
          // this on the earlier pass, but skirmishers, golems and named
          // units all mirror through THIS branch and kept swapping every
          // few frames while engaged). A mini turns only after the sim's
          // facing has held for a third of a second.
          const fv = s as Sprite & { __face?: number; __pf?: number; __pat?: number };
          if (fv.__face === undefined) fv.__face = u.face;
          if (u.face !== fv.__face) {
            if (fv.__pf !== u.face) {
              fv.__pf = u.face;
              fv.__pat = sim.t;
            } else if (sim.t - (fv.__pat ?? 0) > 0.35) {
              fv.__face = u.face;
              fv.__pf = undefined;
            }
          } else {
            fv.__pf = undefined;
          }
          const hx = fv.__face ?? 1;
          s.width = w * hx;
          s.height = aspect * w;
          // ROTATION IS DAMPED, NOT SNAPPED (Mike, 2026-08-19: the drones
          // "are just constantly turning back and forth"). The lean is
          // multiplied by the mirror sign so the tilt stays world-consistent
          // on a flipped sprite - correct, but it means a facing change
          // NEGATES the rotation in a single frame: a +17 degree bank becomes
          // -17 degrees instantly, which reads as the unit snapping around.
          // Skirmishers sit on their target and flip often, so it never
          // stops. Easing the RENDERED angle turns any flip into a short roll
          // and costs nothing when the facing is steady.
          const wantRot = (sv.__lean ?? 0) * hx;
          const prevRot = sv.__rot ?? wantRot;
          sv.__rot = prevRot + (wantRot - prevRot) * 0.12;
          s.rotation = sv.__rot;
          if (u.kind === "drone") s.tint = 0xcfeeff;
          else if (u.side === 1) s.tint = 0x9db6d8;
          else s.tint = 0xffffff;
        }
        if (u.kind === "named") {
          let label = nameTexts.get(u.id);
          if (!label && u.name) {
            label = new PIXI.Text({
              text: u.name.toUpperCase().slice(0, 14),
              style: { fill: C.human, fontSize: 12, fontFamily: "Segoe UI, sans-serif", fontWeight: "700" },
            });
            label.anchor.set(0.5, 1);
            nameTexts.set(u.id, label);
            labelsC.addChild(label);
          }
          if (label) {
            label.visible = u.deadT <= 0;
            label.position.set(u.x, u.y - 22);
          }
        }
        continue;
      }
      if (u.deadT > 0) continue;
      if (u.kind === "walker") {
        const wt = tex.get("walker");
        if (wt) {
          let s = unitSprites.get(u.id);
          if (!s) {
            s = new PIXI.Sprite(wt);
            s.anchor.set(0.5, 0.6);
            unitSprites.set(u.id, s);
            tanksC.addChild(s);
          }
          // HEAVY TREAD, not a wobble (Mike 2026-08-27: the old ±2.3° rock at
          // 2.2rad/s read as a spasming lizard at map scale). A colossus
          // settles slowly on each step and never tilts.
          s.position.set(u.x, u.y + Math.sin(sim.t * 1.1 + u.id) * 2);
          // FACING LATCH (Mike 2026-08-31: "he's going back and forth so
          // fast he's a blur"). While ENGAGED the sim faces the target's
          // side instantly by design, and skirmishers dancing around a
          // colossus swap that side every few frames - the sprite branch
          // absorbs this with its damped lean, but the walker mirrored raw.
          // A giant does not pirouette: the RENDERED mirror only follows a
          // facing that has held steady for a third of a second.
          const wv = s as Sprite & { __face?: number; __pendFace?: number; __pendAt?: number };
          if (wv.__face === undefined) wv.__face = u.face;
          if (u.face !== wv.__face) {
            if (wv.__pendFace !== u.face) {
              wv.__pendFace = u.face;
              wv.__pendAt = sim.t;
            } else if (sim.t - (wv.__pendAt ?? 0) > 0.35) {
              wv.__face = u.face;
              wv.__pendFace = undefined;
            }
          } else {
            wv.__pendFace = undefined;
          }
          s.width = 92 * (wv.__face ?? 1);
          s.height = (wt.height / wt.width) * 92;
          s.rotation = 0;
          continue;
        }
        // vector giant fallback: legs stomp, cyan eye, beam handled via events
        const ph = Math.sin(sim.t * 2.2 + u.id) * 7;
        infG.moveTo(u.x - 14, u.y).lineTo(u.x - 20, u.y + 26 + ph).stroke({ width: 5, color: 0x24303c });
        infG.moveTo(u.x + 14, u.y).lineTo(u.x + 20, u.y + 26 - ph).stroke({ width: 5, color: 0x24303c });
        infG.roundRect(u.x - 26, u.y - 46, 52, 46, 8).fill({ color: 0x323e4c });
        infG.circle(u.x, u.y - 30, 6).fill({ color: C.warden, alpha: 0.95 });
        infG.circle(u.x, u.y - 30, 10 + Math.sin(sim.t * 5) * 2).stroke({ width: 2, color: C.warden, alpha: 0.5 });
        continue;
      }
      // muzzle pip when firing (sprite carries the body now)
      if (u.flashT > 0) infG.circle(u.x + (u.side === 0 ? 10 : -10), u.y - 2, 2.6).fill({ color: 0xfff2c0, alpha: 0.95 });
    }
    // tracers + beams
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.t -= dt;
      if (tr.t <= 0) {
        tracers.splice(i, 1);
        continue;
      }
      infG.moveTo(tr.x, tr.y).lineTo(tr.tx, tr.ty).stroke({
        width: 1.4,
        color: tr.side === 0 ? C.human : C.warden,
        alpha: (tr.t / 0.12) * 0.75,
      });
    }
    // ROCKETS: parabolic hop with a smoke trail, big boom on land
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.t += dt / r.dur;
      if (r.t >= 1) {
        const bt = tex.get("boom1");
        if (bt && booms.length < 22) {
          const bs = new PIXI.Sprite(bt);
          bs.anchor.set(0.5, 0.72);
          bs.position.set(r.tx, r.ty);
          bs.width = 40;
          bs.height = 40;
          fxC.addChild(bs);
          booms.push({ s: bs, t: 0, big: true });
        }
        rockets.splice(i, 1);
        continue;
      }
      const px = r.x + (r.tx - r.x) * r.t;
      const py = r.y + (r.ty - r.y) * r.t - Math.sin(r.t * Math.PI) * r.arc;
      infG.circle(px, py, 3).fill({ color: 0xffe9b0, alpha: 1 });
      for (let k = 1; k <= 3; k++) {
        const bt2 = Math.max(0, r.t - k * 0.07);
        const sx = r.x + (r.tx - r.x) * bt2;
        const sy = r.y + (r.ty - r.y) * bt2 - Math.sin(bt2 * Math.PI) * r.arc;
        infG.circle(sx, sy, 2.4 + k).fill({ color: 0xcccccc, alpha: 0.24 - k * 0.06 });
      }
    }
    // FORT DEFENSE LASERS: held forts fire cyan pulses into the clash - the
    // armies are FIGHTING OVER the buildings, and the buildings answer
    fortLaserT -= dt;
    if (fortLaserT <= 0) {
      fortLaserT = 1.6;
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        if (m.state === "reclaimed") continue;
        const sp = spotFor(i);
        const fx0 = frontXAt(sim, sp.y - 40);
        if (Math.abs(sp.x - fx0) > 340) continue;
        beams.push({ x: sp.x, y: sp.y - 70, tx: fx0 - 14, ty: sp.y - 40 + (i % 5) * 16 - 32, t: 0.3 });
      }
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.t -= dt;
      if (b.t <= 0) {
        beams.splice(i, 1);
        continue;
      }
      infG.moveTo(b.x, b.y).lineTo(b.tx, b.ty).stroke({ width: 4, color: C.warden, alpha: (b.t / 0.3) * 0.9 });
    }
    // explosion flipbooks -> smoke fade
    for (let i = booms.length - 1; i >= 0; i--) {
      const b = booms[i];
      b.t += dt;
      const frame = Math.floor(b.t * 14);
      if (frame < 5) {
        const t5 = tex.get(`boom${frame + 1}`);
        if (t5) b.s.texture = t5;
      } else if (frame < 12) {
        const ts = tex.get(`smoke${((frame - 5) % 3) + 1}`);
        if (ts) b.s.texture = ts;
        b.s.alpha = Math.max(0, 1 - (b.t - 0.36) / 0.8);
      } else {
        b.s.destroy();
        booms.splice(i, 1);
      }
    }
    stage.renderFrame();
  }

  return {
    stage,
    render,
    resize: (cssW, cssH, dpr) => stage.resize(cssW, cssH, dpr, FRONT_W, FRONT_H),
    zoomAt: (cssX, cssY, factor) => {
      const p = cssToSim(cssX, cssY);
      const k0 = camK;
      camK = Math.max(1, Math.min(3, camK * factor));
      // keep the point under the cursor fixed: solve cam pos for same sim point
      camX = p.x - ((p.x - camX) * camK) / k0;
      camY = p.y - ((p.y - camY) * camK) / k0;
      camClamp();
    },
    panBy: (cssDx, cssDy) => {
      const ws = W.scale.x || 1;
      camX += cssDx / ws;
      camY += cssDy / ws;
      camClamp();
    },
    setData: (ms, frontX, reclaimed) => {
      milestones = ms;
      paintMilestones();
      setFrontTarget(sim, frontX, reclaimed);
      setObstacles(sim, [
        ...setObs,
        ...ms.map((_m, i) => ({ x: spotFor(i).x, y: spotFor(i).y - 24, r: 64 })),
      ]);
    },
    destroy: () => {
      unitSprites.forEach((s) => s.destroy());
      nameTexts.forEach((t) => t.destroy());
      stage.destroy();
    },
  };
}
