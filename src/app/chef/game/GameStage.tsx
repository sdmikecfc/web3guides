"use client";

/**
 * The ONE Pixi mount for Domain Kitchen (ADR-0101/0102/0103/0104). Owns the
 * Application lifecycle, the counted preloader, the fixed-timestep loop, and
 * PLAYER INPUT (taps, shop, and the layout editor -> world actions via
 * applyAction, the only door into the sim). All panels are DOM/React.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { BOOT_TIPS, BootShell } from "./BootShell";
import {
  applyAction,
  canUpgradeDish,
  createWorld,
  deriveService,
  hireCost,
  awayEarnings,
  layoutForCounts,
  previewPlace,
  qualityOf,
  qualityParts,
  REGULAR_NAMES,
  stepWorld,
  WORLD_FIXED_DT,
  type HireKind,
  type PlacedItem,
  type RoomDef,
  type WorldState,
} from "./_engine/world";
import { itemDef } from "./_engine/items";
import { SHELL, SHELL_SIZES, shellAt } from "./_engine/rooms";
import { loadGameAssets, THEME_IDS, type GameAssets, type ThemeId } from "./_view/preload";
import { buildScene, type EditView, type Scene } from "./_view/scene";
import { createDkSfx, type DkSfx } from "./_view/sfx";
import { DialsPanel, ShopPanel, type PanelSnapshot } from "./DialsPanel";
import { BookModal, EditTray, MenuModal, StyleModal, CrewModal } from "./Chrome";
import { C, FONT, R, S, SHADOW, Z } from "./_ui/tokens";
import { Button, CoinChip, DockButton, Sheet, StatPill } from "./_ui/primitives";
import { makePostcard, sharePostcard } from "./postcard";
import {
  IconBook,
  IconCap,
  IconCart,
  IconChefHat,
  IconCamera,
  IconChevron,
  IconCloche,
  IconExternal,
  IconMedal,
  IconMoney,
  IconMore,
  IconSpeaker,
  IconSpeakerOff,
  IconSwatch,
  IconWrench,
} from "./_ui/icons";
import { AcademyModal } from "./Academy";
import { isGraduate } from "./_engine/academy";
import { LpPanel } from "./LpPanel";
import { useLpPositions } from "./_chain/useLpPositions";
import { useCloudSave } from "./_chain/useCloudSave";
import { marketDef } from "./_engine/items";
import { SERVICE_TIERS, serviceTier } from "./_engine/campaign";
import {
  layoutFromSave,
  newerSave,
  sanitizeSave,
  serializeSave,
  type DkSave,
  CREW_LOOKS,
  CHEF_NAME_MAX,
  ROOM_NAME_MAX,
} from "./_engine/save";
import { dayBeat, tenureDays } from "./_engine/wallclock";
import { DAILY_SPECIALS } from "./_engine/pantry";
import { Coach, INTRO_DONE, INTRO_STEPS } from "./Coach";
import { AddLiquidityModal } from "./AddLiquidityModal";

const MAX_SUBSTEPS = 8;
const DPR_CAP = 2;
const SAVE_KEY = "dk_save_v2";
const OLD_SAVE_KEY = "dk_build_v1";
const MUTE_KEY = "dk_mute_v1";
const THEME_KEY = "dk_theme_v1";
/**
 * How much the crew can bank while you are away. Raised 6 -> 24 in M8: at 2
 * game-hours per real hour this used to top out after three real hours, so a
 * whole night away and a coffee break paid exactly the same. It is still far
 * below what a live tab earns (coins are deliberately the abundant resource);
 * what makes returning worth it is the pantry, the special and the tenure,
 * which are day-gated in wallclock.ts.
 */

type Phase = "loading" | "ready" | "error";

interface SaveV2 {
  v: 2 | 3;
  coins: number;
  waiters: number;
  chefs: number;
  layout: { itemId: string; gx: number; gy: number; facing: "se" | "sw" }[];
  inventory: Record<string, number>;
  p: number;
  vol: number;
  savedAt: number;
  /** v3 (ADR-0105): which market, and banked LP tenure per market */
  market?: string;
  lpDays?: Record<string, number>;
}

function phaseIcon(clockHrs: number): string {
  if (clockHrs >= 5 && clockHrs < 8) return "🌅";
  if (clockHrs >= 8 && clockHrs < 17) return "☀️";
  if (clockHrs >= 17 && clockHrs < 21) return "🌇";
  return "🌙";
}

function clockText(clockHrs: number): string {
  const h24 = Math.floor(clockHrs);
  const m = Math.floor((clockHrs - h24) * 60);
  const ap = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m < 10 ? "0" : ""}${m}${ap}`;
}

function kindLine(w: WorldState): string {
  const svc = deriveService(w);
  if (svc.seatsOpen === 0) return "No seats yet. Put a table down and set chairs beside it.";
  const tableThroughput = svc.seatsOpen * 0.85;
  const vals: [string, number][] = [
    ["tables", tableThroughput],
    ["kitchen", svc.speed],
    ["crowd", svc.arrivalsPerMin],
  ];
  vals.sort((a, b) => a[1] - b[1]);
  const balanced = vals[1][1] - vals[0][1] < 0.4;
  if (balanced) return "The room is humming. Tables, kitchen, and crowd are in balance.";
  switch (vals[0][0]) {
    case "tables":
      return "The room is full. Another table and chairs seat more guests.";
    case "kitchen":
      return "Guests are waiting on the kitchen. A stove or a chef speeds it up.";
    default:
      return "The room is ready for more guests. Great service brings them in.";
  }
}

/** A round icon-only button. The sound toggle is the only one on the HUD. */
function IconOnly({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        display: "grid",
        placeItems: "center",
        borderRadius: R.pill,
        background: C.panel,
        border: `1px solid ${C.line}`,
        boxShadow: SHADOW.card,
        backdropFilter: "blur(6px)",
        color: C.creamDim,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/**
 * One tappable row inside the More sheet. Everything the old chip bar held
 * that is not worth a permanent dock slot lives here, with a line of plain
 * language saying what it does — the chips said only "Style" and "Crew".
 */
function MoreRow({
  icon,
  label,
  hint,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span style={{ color: C.amber, display: "grid", placeItems: "center", width: 26 }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.cream }}>
          {label}
        </span>
        <span style={{ display: "block", fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
          {hint}
        </span>
      </span>
      <span style={{ color: C.muted, display: "grid", placeItems: "center" }}>
        {href ? <IconExternal size={16} /> : <IconChevron size={16} />}
      </span>
    </>
  );
  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: S.md,
    width: "100%",
    minHeight: 56,
    padding: `${S.sm}px ${S.sm}px`,
    borderRadius: R.inner,
    background: "transparent",
    border: "none",
    borderBottom: `1px solid ${C.lineSoft}`,
    textAlign: "left",
    fontFamily: FONT,
    cursor: "pointer",
    textDecoration: "none",
  };
  if (href) {
    return (
      <a href={href} style={style}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} style={style}>
      {inner}
    </button>
  );
}

/**
 * Every surface that can cover the room. `null` is the game itself: canvas,
 * coin counter, service pill and the dock, and nothing else.
 */
type SheetId =
  | "money"
  | "shop"
  | "service"
  | "menu"
  | "learn"
  | "more"
  | "book"
  | "name"
  | "crew"
  | "style"
  | "addLp"
  | null;

export default function GameStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldState | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sfxRef = useRef<DkSfx | null>(null);
  const editRef = useRef<EditView | null>(null);
  const lastPushRef = useRef(0);
  /** posts a `newDay` when the real date has turned over (M8) */
  const dayBusRef = useRef<(() => void) | null>(null);
  /**
   * The shell the restaurant currently occupies (M8b).
   *
   * The room used to be the module constant SHELL, passed to every call. Now
   * that it can be bought bigger, the CURRENT shell has to travel with the
   * world instead: the sim records `shellIdx`, and this ref is what every
   * applyAction / stepWorld / previewPlace call reads. They must never
   * disagree, which is why nothing outside boot and onExpand writes it.
   */
  const roomRef = useRef<RoomDef>(SHELL);
  /** kept so an expansion can rebuild the scene without re-running boot */
  const appRef = useRef<Application | null>(null);
  const assetsRef = useRef<GameAssets | null>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0.02);
  const [tipIdx, setTipIdx] = useState(0);
  const [snap, setSnap] = useState<PanelSnapshot | null>(null);
  /**
   * MOBILE (M7g). The three panels are fixed-width cards: the left column is
   * 250px and the shop is 244px, so on a 375px phone they were each taking two
   * thirds of the screen, overlapping each other AND the chip bar, and burying
   * the room completely. Most people will open this from a Discord link on a
   * phone, so that was the first thing they would ever see.
   *
   * The breakpoint is 900, not 720: the two columns plus their margins need
   * ~520px, so below 900 the room is squeezed into a slot under 380px wide.
   * A full-width room with bottom sheets beats a narrow slot with side cards.
   *
   * Narrow layout: all three become full-width bars stacked at the BOTTOM,
   * collapsed by default so the room is visible, and they behave as an
   * accordion so only one sheet is ever open. A collapsed panel is a 41px
   * header, so three of them cost ~135px and leave the room the rest.
   */
  const [narrow, setNarrow] = useState(false);
  // what the chrome covers, so the camera can centre the room on the band that
  // is actually visible rather than behind the bars
  const insetRef = useRef({ top: 0, bottom: 0 });
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => {
      setNarrow(mq.matches);
      /**
       * The HUD frame is the SAME on both form factors now (M11), so the
       * camera reserves the same band everywhere: the coin strip up top and
       * the dock below. Sheets are transient overlays and deliberately do NOT
       * change the insets, so opening one never makes the room jump.
       */
      insetRef.current = { top: 56, bottom: 96 };
      const host = hostRef.current;
      if (host) sceneRef.current?.resize(host.clientWidth, host.clientHeight, insetRef.current.top, insetRef.current.bottom);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /**
   * ONE sheet at a time, on every device (M11).
   *
   * This replaced eight separate open/collapsed booleans plus a narrow-only
   * accordion. The old set could put SIX surfaces on screen at once on a
   * desktop first run, which is most of why the game read as a wall of text
   * rather than as a game. One enum also kills the ShopPanel double-mount:
   * there is exactly one place the active sheet renders.
   */
  const [openSheet, setOpenSheet] = useState<SheetId>(null);
  const [toast, setToast] = useState<string | null>(null);
  /**
   * The first-run coach (M8). Held in a ref for the save writer and in state
   * for the render, because the 600ms save poll runs outside React.
   */
  const [intro, setIntro] = useState(INTRO_DONE);
  const introRef = useRef(INTRO_DONE);
  const setIntroBoth = useCallback((n: number) => {
    introRef.current = n;
    setIntro(n);
  }, []);
  const [muted, setMuted] = useState(false);
  const [courses, setCourses] = useState<string[]>([]);
  const [theme, setTheme] = useState<ThemeId>("trattoria");
  // YOUR CREW (M7d): cosmetic, saved beside the theme, never in WorldState
  const [crew, setCrew] = useState<DkSave["crew"]>({ chef: 0, waiter: 0, chefName: "" });
  /**
   * The restaurant's PUBLIC name (CUTE+VIRAL push). Cosmetic like crew, saved
   * beside it, never in WorldState. Renders on the door sign; the board,
   * postcard and visits will carry it next.
   */
  const [roomTitle, setRoomTitle] = useState("");
  const roomTitleRef = useRef("");
  const [editing, setEditing] = useState(false);
  const [holdItem, setHoldItem] = useState("");
  const [liftUid, setLiftUid] = useState(-1);
  const [editError, setEditError] = useState("");
  /** which way the piece in hand is turned (ADR-0104's Turn control) */
  const [ghostFacing, setGhostFacing] = useState<"se" | "sw">("se");
  /**
   * Has the player ever OPENED the money sheet (M10)? The last coach step
   * advances on seeing it, never on spending, so nobody is nudged toward
   * money to finish an intro.
   *
   * M11 fixed a hole here. This used to be set during render whenever the LP
   * card was not collapsed, and on a desktop that card started open, so the
   * step completed before the player did anything at all. It is now set only
   * by the action that opens the sheet, so the step means what it says.
   */
  const lpSeenRef = useRef(false);
  const showSheet = useCallback((id: SheetId) => {
    if (id === "money") lpSeenRef.current = true;
    setOpenSheet(id);
  }, []);
  const [useLive, setUseLive] = useState(true);
  const [marketId, setMarketId] = useState<string>("software.ai");

  /**
   * Live campaigns (M10). Public info, so this needs no wallet: somebody with
   * no wallet still deserves to know a campaign is running, since that is the
   * reason to go and get one.
   *
   * When nothing is live the card is simply ABSENT. It never says "no rewards
   * right now" — that is a doom message, and the kindness laws forbid telling
   * a player they have missed something.
   */
  const [campaigns, setCampaigns] = useState<
    { market: string; endsAt: string; windowEndsAt: string }[]
  >([]);
  useEffect(() => {
    let gone = false;
    fetch("/api/chef/campaign")
      .then((r) => r.json())
      .then((j) => {
        if (!gone && j?.ok && Array.isArray(j.campaigns)) setCampaigns(j.campaigns);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);

  // the wallet's REAL liquidity at the current market (M5)
  const market = marketDef(marketId);
  const lp = useLpPositions(market?.token);
  // server-side saves (M6): optional, never a gate on playing
  const cloud = useCloudSave();
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  const themeRef = useRef<ThemeId>("trattoria");
  themeRef.current = theme;
  const crewRef = useRef<DkSave["crew"]>({ chef: 0, waiter: 0, chefName: "" });
  crewRef.current = crew;
  const liveOn = useLive && lp.status === "ready" && lp.positions.length > 0;
  // the polling snapshot runs outside React's render, so it reads a ref
  const liveRef = useRef(false);
  liveRef.current = liveOn;

  // a live position replaces the practice slider as the room's size
  useEffect(() => {
    const world = worldRef.current;
    if (!world || !liveOn) return;
    const usd = Math.round(lp.totalUsd * 100) / 100;
    if (Math.abs(world.dials.parkedUsd - usd) < 0.01) return;
    applyAction(world, roomRef.current, {
      type: "dials",
      parkedUsd: usd,
      weeklyVolumeUsd: world.dials.weeklyVolumeUsd,
    });
  }, [liveOn, lp.totalUsd]);

  useEffect(() => {
    if (phase !== "loading") return;
    const id = setInterval(() => setTipIdx((i) => (i + 1) % BOOT_TIPS.length), 2600);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(id);
  }, [toast]);

  /**
   * The coach advances on what the player DID, read off the same snapshot the
   * panels use. It walks forward through any steps already satisfied, so
   * somebody who ignores the card and just plays finds it has quietly kept up
   * with them rather than pointing at something they did two minutes ago.
   */
  useEffect(() => {
    if (!snap || intro >= INTRO_DONE || intro < 1) return;
    let next = intro;
    while (next < INTRO_DONE && INTRO_STEPS[next - 1]?.done(snap)) next++;
    if (next !== intro) {
      setIntroBoth(next);
      if (next >= INTRO_DONE) {
        setToast("That is the whole game. Your hands make it better.");
      }
    }
  }, [snap, intro, setIntroBoth]);

  // keep the scene's edit view in a ref the ticker can read every frame
  useEffect(() => {
    editRef.current = editing
      ? { liftUid, ghostItemId: holdItem, gx: -99, gy: -99, valid: false, facing: ghostFacing }
      : null;
    (window as unknown as Record<string, unknown>).__editView = editRef.current;
  }, [editing, liftUid, holdItem, ghostFacing]);

  // ── boot ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let app: Application | null = null;
    let ro: ResizeObserver | null = null;
    let onVis: (() => void) | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    (async () => {
      setProgress(0.08);
      let startMuted = false;
      try {
        startMuted = localStorage.getItem(MUTE_KEY) === "1";
      } catch {}
      setMuted(startMuted);
      sfxRef.current = createDkSfx(!startMuted);

      const a = new Application();
      await a.init({
        resizeTo: host,
        background: "#1b1310",
        antialias: true,
        resolution: Math.min(
          typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
          DPR_CAP
        ),
        autoDensity: true,
        preference: "webgl",
        preserveDrawingBuffer: true,
      });
      if (cancelled) {
        a.destroy(true);
        return;
      }
      app = a;
      appRef.current = a;
      host.appendChild(a.canvas);
      setProgress(0.1);

      const assets = await loadGameAssets((p) => {
        if (!cancelled) setProgress(0.1 + p * 0.9);
      });
      if (cancelled) return;

      // ── load: this browser's save, the server's, whichever is newer ──────
      let local: DkSave | null = null;
      try {
        const rawLocal = localStorage.getItem(SAVE_KEY);
        if (rawLocal) local = sanitizeSave(JSON.parse(rawLocal));
        else {
          // an M3-era save still has value: turn its counts into a room
          const rawV1 = localStorage.getItem(OLD_SAVE_KEY);
          if (rawV1) {
            const s = JSON.parse(rawV1) as {
              coins?: number; tables?: number; stoves?: number; waiters?: number; chefs?: number;
            };
            local = sanitizeSave({
              coins: s.coins,
              waiters: s.waiters,
              chefs: s.chefs,
              layout: layoutForCounts(s.tables ?? 2, s.stoves ?? 1),
            });
          }
        }
      } catch {}

      // the cloud copy, if this browser already holds a session token
      const remote = await cloudRef.current.load().catch(() => null);
      const chosen = newerSave(local, remote);
      if (remote && chosen === remote && local) {
        setToast("Picked up your restaurant from your wallet.");
      }

      const save = chosen ?? sanitizeSave({});
      const parkedUsd = save.dials.parkedUsd;
      const volumeUsd = save.dials.weeklyVolumeUsd;
      let coins = save.coins;
      const hires = { waiters: save.waiters, chefs: save.chefs };
      const layout = save.layout.length > 0 ? layoutFromSave(save) : layoutForCounts(2, 1);
      const inventory = save.inventory;
      const savedAt = save.savedAt;
      const market = save.market;
      const lpDays = save.lpDays;

      if (savedAt > 0) {
        const awayHrs = Math.max(0, (Date.now() - savedAt) / 3.6e6);
        // the engine owns the away math now (M11 economy inversion): capped
        // kind banking, multiplied by the wallet, never the old dial drip
        const earned = awayEarnings(awayHrs, { parkedUsd, weeklyVolumeUsd: volumeUsd });
        if (earned > 0) {
          coins += earned;
          setToast(`The crew kept the pans warm. +${earned} coins while you were away.`);
        }
      }

      // whichever shell this restaurant grew into, resolved BEFORE the world
      // is built so the layout is validated against the right walls
      const bootRoom = shellAt(save.shell);
      roomRef.current = bootRoom;
      const world = createWorld("domain-kitchen-m4", bootRoom, {
        parkedUsd,
        weeklyVolumeUsd: volumeUsd,
        playMoney: coins,
        hires,
        layout,
        inventory,
        market,
        lpDays,
        courses: save.courses,
        pantry: save.pantry,
        menu: save.menu,
        bestQuality: save.bestQuality,
        utcDay: save.utcDay,
        daily: save.daily,
        regulars: save.regulars,
        shellIdx: save.shell,
        cheers: cloudRef.current.cheersRef.current,
      });
      worldRef.current = world;
      setCourses([...world.courses]);

      /**
       * THE DAY BUS (M8). Read the real clock HERE, out where a clock is
       * allowed, turn it into a plain action, and post it through the sim's
       * one door. stepWorld still knows nothing about wall time, so a replay
       * of the same tape still lands on the same world.
       *
       * Run it at boot and again whenever the tab comes back to life, so a
       * player who leaves a laptop open overnight gets tomorrow's delivery
       * when they sit down rather than whenever they next reload.
       */
      const dayBus = () => {
        const beat = dayBeat(Date.now(), world.utcDay);
        if (!beat) return;
        const held = world.dials.parkedUsd > 0;
        applyAction(world, roomRef.current, {
          type: "newDay",
          utcDay: beat.utcDay,
          banked: beat.banked,
          tenure: tenureDays(Date.now(), save.utcDay, save.dials.parkedUsd > 0, held),
        });
        if (beat.welcomeBack) {
          setToast("Gus brought your orders in from the market. Have a look in the pantry.");
        }
      };
      dayBus();
      dayBusRef.current = dayBus;

      // somebody cheered this kitchen on the board (M8c). A COUNT, never a
      // name: the player learns the room has people rooting for it.
      if (world.cheers > 0) {
        const n = world.cheers;
        setToast(
          n === 1
            ? "A chef cheered your kitchen today. Expect a livelier room."
            : `${n} chefs cheered your kitchen today. Expect a livelier room.`
        );
      }

      /**
       * Who gets the coach. A brand new save (savedAt 0) starts at step 1. A
       * save that stopped partway resumes where it stopped. A save written
       * before M8 has no `intro` key and sanitizes to 0, but it also has a
       * savedAt, and somebody who has already played a restaurant does not
       * need to be told what a restaurant is.
       */
      setIntroBoth(
        save.savedAt === 0 ? 1 : save.intro === 0 ? INTRO_DONE : save.intro
      );

      let startTheme: ThemeId = "trattoria";
      try {
        const t = localStorage.getItem(THEME_KEY) as ThemeId | null;
        if (t && (THEME_IDS as readonly string[]).includes(t)) startTheme = t;
      } catch {}
      setTheme(startTheme);
      setCrew(save.crew);
      setRoomTitle(save.name);
      roomTitleRef.current = save.name;
      assetsRef.current = assets;
      const scene = buildScene(a, roomRef.current, assets, startTheme);
      sceneRef.current = scene;
      scene.setCrew(save.crew);
      scene.setSign(save.name);
      scene.resize(host.clientWidth, host.clientHeight, insetRef.current.top, insetRef.current.bottom);

      const prevEv = {
        arrived: world.stats.arrived,
        served: world.stats.served,
        hearts: world.stats.hearts,
        gusVisits: world.stats.gusVisits,
        specialUnlocked: world.menu.specialUnlocked,
        specialMastered: world.menu.specialMastered,
      };
      const soundSweep = () => {
        const sfx = sfxRef.current;
        if (!sfx) return;
        const s = world.stats;
        if (s.arrived > prevEv.arrived) sfx.play("doorbell");
        if (s.served > prevEv.served) sfx.play("serve");
        if (s.hearts > prevEv.hearts) sfx.play("heart");
        if (s.gusVisits > prevEv.gusVisits) sfx.play("gus");
        if (world.menu.specialUnlocked && !prevEv.specialUnlocked) sfx.play("unlock");
        if (world.menu.specialMastered && !prevEv.specialMastered) sfx.play("unlock");
        prevEv.arrived = s.arrived;
        prevEv.served = s.served;
        prevEv.hearts = s.hearts;
        prevEv.gusVisits = s.gusVisits;
        prevEv.specialUnlocked = world.menu.specialUnlocked;
        prevEv.specialMastered = world.menu.specialMastered;
      };

      let acc = 0;
      a.ticker.add(() => {
        let frameDt = a.ticker.deltaMS / 1000;
        if (!(frameDt > 0) || frameDt > 0.25) frameDt = WORLD_FIXED_DT;
        acc += frameDt;
        let steps = 0;
        while (acc >= WORLD_FIXED_DT && steps < MAX_SUBSTEPS) {
          stepWorld(world, roomRef.current);
          acc -= WORLD_FIXED_DT;
          steps++;
        }
        if (steps >= MAX_SUBSTEPS) acc = 0;
        soundSweep();
        // through the REF, not the closure: expanding the room destroys this
        // scene and builds a new one, and a captured `scene` would keep
        // syncing the dead one
        sceneRef.current?.sync(world, editRef.current);
      });

      onVis = () => {
        if (!app) return;
        if (document.visibilityState === "hidden") app.ticker.stop();
        else {
          app.ticker.start();
          // a tab left open across midnight is still a new day
          dayBusRef.current?.();
        }
      };
      document.addEventListener("visibilitychange", onVis);
      if (document.visibilityState === "hidden") a.ticker.stop();

      ro = new ResizeObserver(() => {
        if (!cancelled && host.clientWidth > 0) {
          sceneRef.current?.resize(
            host.clientWidth,
            host.clientHeight,
            insetRef.current.top,
            insetRef.current.bottom
          );
        }
      });
      ro.observe(host);

      stepWorld(world, roomRef.current);
      scene.sync(world, null);
      a.render();

      poll = setInterval(() => {
        if (cancelled) return;
        const w = worldRef.current;
        if (!w) return;
        const svc = deriveService(w);
        const qp = qualityParts(w);
        const tierNow = serviceTier(qp.total);
        // keep the graduate mark honest however courses got finished
        setCourses((prev) => (prev.length === w.courses.length ? prev : [...w.courses]));
        setSnap({
          qBase: qp.base,
          qPresence: qp.presence,
          qClean: qp.cleanliness,
          qDishes: qp.dishes,
          bestQuality: w.stats.bestQuality,
          trashCount: w.trash.length,
          toiletsBroken: w.toilets.filter((t) => t.broken).length,
          toiletsTotal: w.toilets.length,
          tierName: svc.tier.name,
          seatsOpen: svc.seatsOpen,
          tables: svc.openTables,
          stoves: svc.stoves,
          waiters: w.hires.waiters,
          chefs: w.hires.chefs,
          speed: svc.speed,
          quality: qualityOf(w),
          presence: w.presence,
          coins: w.playMoney,
          clock: clockText(w.clockHrs),
          phase: phaseIcon(w.clockHrs),
          line: kindLine(w),
          parkedUsd: w.dials.parkedUsd,
          volumeUsd: w.dials.weeklyVolumeUsd,
          gusHere: w.entities.some((e) => e.name === "Gus"),
          multLp: svc.mult.lp,
          multVol: svc.mult.vol,
          multTotal: svc.mult.total,
          multCapped: svc.mult.capped,
          hireCosts: { waiter: hireCost(w, "waiter"), chef: hireCost(w, "chef") },
          chefNeedsStove: w.hires.chefs >= svc.stoves,
          inventory: { ...w.inventory },
          editing: w.editing,
          market: w.market,
          lpDays: { ...w.lpDays },
          liveParked: liveRef.current,
          tier: tierNow.name,
          tierBlurb: tierNow.blurb,
          topTier: tierNow.name === SERVICE_TIERS[SERVICE_TIERS.length - 1].name,
          toTopTier: Math.max(
            0,
            SERVICE_TIERS[SERVICE_TIERS.length - 1].minQuality - qp.total
          ),
          arrived: w.stats.arrived,
          hustles: w.stats.hustles,
          lpCardOpened: lpSeenRef.current,
          busedByPlayer: w.stats.busedByPlayer,
          placements: w.stats.placements,
          dirtyTables: w.tables.filter((t) => t.dirty > 0).length,
          dailyName: DAILY_SPECIALS[w.daily.idx]?.name ?? "",
          dailyPrepped: w.daily.prepped,
          dailyPlates: w.daily.plates,
          dailyGreeted: w.daily.greeted,
          dailyReady: Object.entries(DAILY_SPECIALS[w.daily.idx]?.needs ?? {}).every(
            ([id, n]) => (w.pantry.stock[id] ?? 0) >= n
          ),
          dueNames: w.dueToday
            .map((i) => w.regulars[i])
            .filter(Boolean)
            .map((r) => REGULAR_NAMES[r.n]),
          nextShell: SHELL_SIZES[w.shellIdx + 1]
            ? {
                label: SHELL_SIZES[w.shellIdx + 1].label,
                cost: SHELL_SIZES[w.shellIdx + 1].cost,
                blurb: SHELL_SIZES[w.shellIdx + 1].blurb,
              }
            : null,
        });
        // one save shape, written locally every tick of the poll and pushed
        // to the server on a slower beat when the player has signed in
        const save = serializeSave(w, themeRef.current, crewRef.current, introRef.current, roomTitleRef.current);
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(save));
        } catch {}
        const now = Date.now();
        if (cloudRef.current.status === "on" && now - lastPushRef.current > 15_000) {
          lastPushRef.current = now;
          void cloudRef.current.store(save);
        }
      }, 600);

      if (process.env.NODE_ENV !== "production") {
        (window as unknown as Record<string, unknown>).__dk = {
          // dev-only: lets dk-shot verify the REAL postcard module end to end
          postcard: async () => {
            const blob = await makePostcard(a, a.stage, {
              name: roomTitleRef.current,
              tier: "Finding its feet",
            });
            return URL.createObjectURL(blob);
          },
          app: a,
          world,
          /**
           * A GETTER, not the scene object (M8b). Buying a bigger room
           * destroys the scene and builds a new one, so a captured reference
           * goes stale and every call on it silently does nothing -- which
           * cost real time to diagnose once already.
           */
          get scene() {
            return sceneRef.current;
          },
          /** whichever shell the room is in right now */
          get room() {
            return roomRef.current;
          },
          act: (action: Parameters<typeof applyAction>[2]) => applyAction(world, roomRef.current, action),
          /** call the verb path directly, bypassing the gesture layer (M8b) */
          tapAt: (x: number, y: number) => onTapRef.current(x, y),
          /** buy the next shell AND rebuild the scene, as the shop button does */
          expand: () => onExpandRef.current(),
          /** the gesture layer's live state, so a probe can see why a tap died */
          gesture: () => ({ ...gestureRef.current, pointers: pointersRef.current.size }),
          tick: (n: number) => {
            for (let i = 0; i < n; i++) stepWorld(world, roomRef.current);
            scene.sync(world, editRef.current);
            a.render();
          },
        };
      }
      setProgress(1);
      setPhase("ready");
    })().catch((err) => {
      console.error("[domain-kitchen] boot failed", err);
      if (!cancelled) setPhase("error");
    });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (onVis) document.removeEventListener("visibilitychange", onVis);
      ro?.disconnect();
      if (app) {
        app.destroy(true, { children: true, texture: false });
        app = null;
      }
      worldRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // ── pointer: play verbs, or the layout editor ────────────────────────────
  const tileAt = useCallback((clientX: number, clientY: number) => {
    const host = hostRef.current;
    const scene = sceneRef.current;
    if (!host || !scene) return null;
    const rect = host.getBoundingClientRect();
    return scene.pick(clientX - rect.left, clientY - rect.top);
  }, []);

  const onGhostMove = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      const w = worldRef.current;
      const view = editRef.current;
      if (!w || !w.editing || !view) return;
      if (!view.ghostItemId && view.liftUid < 0) return;
      const p = tileAt(ev.clientX, ev.clientY);
      if (!p) return;
      const gx = Math.round(p.x);
      const gy = Math.round(p.y);
      if (gx === view.gx && gy === view.gy) return;
      view.gx = gx;
      view.gy = gy;
      const itemId =
        view.ghostItemId || w.layout.find((q) => q.uid === view.liftUid)?.itemId || "";
      view.valid =
        itemId !== "" &&
        previewPlace(w, roomRef.current, itemId, gx, gy, view.liftUid >= 0 ? view.liftUid : undefined) === "";
    },
    [tileAt]
  );

  /**
   * A TAP that landed: everything the player can do by touching the room.
   *
   * Split out of onPointerDown in M8b. It now runs on pointer UP, and only
   * when the pointer barely moved, because the room can be panned once it is
   * zoomed in and a drag used to fix toilets on the way past. This is the
   * ADR-0088 rule restated: decide on release, measure travel from the press
   * point, and never take pointer capture until a drag has actually started.
   */
  const onTap = useCallback(
    (clientX: number, clientY: number) => {
      const world = worldRef.current;
      const scene = sceneRef.current;
      if (!world || !scene) return;
      const p = tileAt(clientX, clientY);
      if (!p) return;
      // dev-only tap forensics: what the handler actually received and picked
      if (typeof window !== "undefined") {
        (window as unknown as Record<string, unknown>).__lastTap = {
          clientX,
          clientY,
          tile: { x: p.x, y: p.y },
          editing: world.editing,
          t: Date.now(),
        };
      }

      // ── EDIT MODE ────────────────────────────────────────────────────────
      // Gated on BOTH the sim flag and the React view. They are set together
      // by the Arrange button, but a debug path (or any future divergence)
      // can flip the sim alone — and then a lift half-runs: the tap finds a
      // piece, setLiftUid fires into a view that editRef rebuilds as null,
      // and the player's next tap silently starts over. Divergence now makes
      // edit taps inert instead of half-alive.
      if (world.editing && editRef.current) {
        const view = editRef.current;
        const gx = Math.round(p.x);
        const gy = Math.round(p.y);
        if (view && (view.ghostItemId || view.liftUid >= 0)) {
          const itemId = view.ghostItemId || world.layout.find((q) => q.uid === view.liftUid)?.itemId;
          if (!itemId) return;
          const facing = view.liftUid >= 0
            ? world.layout.find((q) => q.uid === view.liftUid)?.facing
            : undefined;
          const ok =
            view.liftUid >= 0
              ? applyAction(world, roomRef.current, { type: "move", uid: view.liftUid, gx, gy, facing })
              : applyAction(world, roomRef.current, { type: "place", itemId, gx, gy, facing: view.facing });
          (window as unknown as Record<string, unknown>).__lastEdit = { branch: "act", ok, gx, gy, liftUid: view.liftUid, itemId };
          if (ok) {
            sfxRef.current?.play("kaching");
            scene.spark(gx, gy, 0xf3c86a, 8);
            setHoldItem("");
            setLiftUid(-1);
            setEditError("");
          } else {
            const why = previewPlace(
              world, roomRef.current, itemId, gx, gy,
              view.liftUid >= 0 ? view.liftUid : undefined
            );
            setEditError(why || "That will not fit there.");
          }
          return;
        }
        /**
         * Nothing in hand: lift whatever is under the tap.
         *
         * SPRITE first, tile second. Lifting by tile alone could not pick up
         * anything tall: a table is drawn from the bottom of its tile and
         * stands about a tile and a half high, so aiming at the tabletop
         * resolved to the tile BEHIND it and lifted the chair sitting there,
         * while the table's own floor tile was hidden underneath the table.
         * The tile test stays as the fallback so tapping bare floor beside a
         * piece still works, and so multi-cell items keep their whole
         * footprint.
         */
        const bySprite = scene.pickItem(clientX - hostRef.current!.getBoundingClientRect().left,
          clientY - hostRef.current!.getBoundingClientRect().top);
        const hit =
          world.layout.find((q) => q.uid === bySprite) ??
          world.layout.find((q) => {
            const cells = itemDef(q.itemId)?.cells ?? 1;
            return gy === q.gy && gx >= q.gx && gx < q.gx + cells;
          });
        (window as unknown as Record<string, unknown>).__lastEdit = { branch: "liftTry", hitUid: hit ? hit.uid : -1, gx, gy };
        if (hit) {
          setLiftUid(hit.uid);
          setHoldItem("");
          setEditError("");
        }
        return;
      }

      // ── PLAY MODE: the join-loop verbs ───────────────────────────────────
      /**
       * SPRITE-FIRST TARGETING (the tap-offset fix). Verbs used to resolve
       * purely by tile distance from the tap's floor projection, but a tall
       * sprite is drawn a full tile above its ground tile, so a natural
       * click on a character's face or a table top registered tiles BEHIND
       * it, and the acknowledgement spark faithfully marked the wrong spot.
       * Now the tap asks the renderer what is visibly under the finger, and
       * the projected tile `p` is corrected to that thing's ground tile; the
       * tile-distance searches below then agree with the player's eye. Taps
       * on bare floor keep the old behavior exactly.
       */
      {
        const rect = hostRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = clientX - rect.left;
          const sy = clientY - rect.top;
          const entId = scene.pickEntity(sx, sy);
          const ent = entId >= 0 ? world.entities.find((e) => e.id === entId) : undefined;
          if (ent) {
            p.x = ent.x;
            p.y = ent.y;
          } else {
            const uid = scene.pickItem(sx, sy);
            const piece = uid >= 0 ? world.layout.find((q) => q.uid === uid) : undefined;
            if (piece) {
              p.x = piece.gx;
              p.y = piece.gy;
            }
          }
        }
      }
      // a broken restroom is the most valuable thing to touch, then litter
      let bestToilet = 0;
      let td = 1.2;
      for (const t of world.toilets) {
        if (!t.broken) continue;
        const d = Math.hypot(t.gx - p.x, t.gy - p.y);
        if (d < td) {
          td = d;
          bestToilet = t.uid;
        }
      }
      if (bestToilet && applyAction(world, roomRef.current, { type: "fixToilet", uid: bestToilet })) {
        const t = world.toilets.find((x) => x.uid === bestToilet);
        if (t) scene.spark(t.gx, t.gy, 0x9fe3ff, 10);
        sfxRef.current?.play("unlock");
        return;
      }

      let bestTrash = -1;
      let rd = 1.1;
      for (const t of world.trash) {
        const d = Math.hypot(t.gx - p.x, t.gy - p.y);
        if (d < rd) {
          rd = d;
          bestTrash = t.id;
        }
      }
      if (bestTrash >= 0) {
        const spot = world.trash.find((t) => t.id === bestTrash);
        if (applyAction(world, roomRef.current, { type: "sweep", trashId: bestTrash })) {
          if (spot) scene.spark(spot.gx, spot.gy, 0xf3e9d2, 8);
          sfxRef.current?.play("bus");
          return;
        }
      }

      let bestT = -1;
      let bd = 1.35;
      world.tables.forEach((t, i) => {
        if (t.dirty === 0) return;
        const d = Math.hypot(t.gx - p.x, t.gy - p.y);
        if (d < bd) {
          bd = d;
          bestT = i;
        }
      });
      if (bestT >= 0 && applyAction(world, roomRef.current, { type: "bus", tableIdx: bestT })) {
        const t = world.tables[bestT];
        scene.spark(t.gx, t.gy, 0xf3c86a, 10);
        sfxRef.current?.play("bus");
        return;
      }

      /**
       * PEOPLE (M8). Staff first, because the crew is what the player is
       * usually reaching for mid-rush, then guests.
       *
       * Tapping YOUR chef -- the one wearing the name from the Crew modal --
       * rallies the whole room instead of just him. It is the closest thing
       * this game has to commanding the floor, and it is why the name is
       * worth typing.
       */
      let namedChefId = -1;
      for (const e of world.entities) {
        if (e.kind === "chef" && !e.dead && (namedChefId < 0 || e.id < namedChefId)) {
          namedChefId = e.id;
        }
      }

      let bestE = 0;
      let ed = 1.1;
      for (const e of world.entities) {
        if (e.kind === "guest") continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < ed) {
          ed = d;
          bestE = e.id;
        }
      }
      if (bestE) {
        const e = world.entities.find((x) => x.id === bestE);
        const rally = bestE === namedChefId;
        const did = rally
          ? applyAction(world, roomRef.current, { type: "pep" })
          : applyAction(world, roomRef.current, { type: "hustle", entityId: bestE });
        if (did) {
          if (rally) {
            for (const c of world.entities) {
              if (c.kind === "waiter" || c.kind === "chef") scene.spark(c.x, c.y, 0xffd98a, 7);
            }
          } else if (e) {
            scene.spark(e.x, e.y, 0xffd98a, 7);
          }
          sfxRef.current?.play("hustle");
          return;
        }
        // refused (still hustling, or the room was rallied a moment ago): a
        // small spark so the tap is acknowledged without a scolding message
        if (e) scene.spark(e.x, e.y, 0xf3e9d2, 4);
        return;
      }

      let bestG = 0;
      let gd = 1.1;
      for (const e of world.entities) {
        if (e.kind !== "guest" || e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < gd) {
          gd = d;
          bestG = e.id;
        }
      }
      if (bestG) {
        const g = world.entities.find((x) => x.id === bestG);
        if (applyAction(world, roomRef.current, { type: "greet", entityId: bestG })) {
          if (g) scene.spark(g.x, g.y, 0xe25555, 6);
          sfxRef.current?.play("heart");
        } else if (g) {
          scene.spark(g.x, g.y, 0xf3e9d2, 4);
        }
        return;
      }

      scene.spark(p.x, p.y, 0xf3e9d2, 4);
    },
    [tileAt]
  );

  /**
   * THE GESTURE LAYER (M8b).
   *
   * One finger: a tap runs a verb, a drag pans (only when zoomed in, since at
   * zoom 1 there is no slack to pan into). Two fingers: pinch to zoom about
   * the midpoint. Wheel zooms about the cursor.
   *
   * The rules that make this safe, all of them learned the hard way in
   * ADR-0088: measure travel from the PRESS POINT rather than summing
   * per-event deltas, take pointer capture only at the moment the slop is
   * crossed (capturing on press is exactly what made buildings unclickable in
   * Launch Wars), and reset the gesture on pointercancel.
   */
  const SLOP = 8;
  const gestureRef = useRef({
    id: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    dragging: false,
    moved: 0,
  });
  /** live pointers, so a second finger can start a pinch mid-drag */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);

  const onPointerDown = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointersRef.current.size === 2) {
      // forEach, not a spread: this project's tsc target refuses Map iterators
      const pts: { x: number; y: number }[] = [];
      pointersRef.current.forEach((p) => pts.push(p));
      const [a, b] = pts;
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      // a second finger cancels the one-finger gesture: whatever it was, it
      // is a pinch now, and it must not also fire a verb on release
      gestureRef.current.id = -1;
      gestureRef.current.dragging = false;
      return;
    }
    // NO VERB HERE. Only remember where the finger landed.
    gestureRef.current = {
      id: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      lastX: ev.clientX,
      lastY: ev.clientY,
      dragging: false,
      moved: 0,
    };
  }, []);

  const onPointerMoveGesture = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      const scene = sceneRef.current;
      if (pointersRef.current.has(ev.pointerId)) {
        pointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      }

      // ── two fingers: pinch ─────────────────────────────────────────────
      if (pointersRef.current.size === 2 && scene) {
        // forEach, not a spread: this project's tsc target refuses Map iterators
      const pts: { x: number; y: number }[] = [];
      pointersRef.current.forEach((p) => pts.push(p));
      const [a, b] = pts;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist.current > 0 && d > 0) {
          const host = hostRef.current;
          const rect = host?.getBoundingClientRect();
          scene.zoomAt(
            d / pinchDist.current,
            (a.x + b.x) / 2 - (rect?.left ?? 0),
            (a.y + b.y) / 2 - (rect?.top ?? 0)
          );
        }
        pinchDist.current = d;
        return;
      }

      const g = gestureRef.current;
      if (g.id !== ev.pointerId) return;
      g.moved = Math.max(g.moved, Math.hypot(ev.clientX - g.startX, ev.clientY - g.startY));

      if (!g.dragging && g.moved > SLOP && scene?.canPan() && !worldRef.current?.editing) {
        // the drag is real: NOW take capture, so the pan survives the pointer
        // leaving the host, and so a tap never captures anything
        g.dragging = true;
        try {
          ev.currentTarget.setPointerCapture(ev.pointerId);
        } catch {}
      }
      if (g.dragging && scene) {
        scene.panBy(ev.clientX - g.lastX, ev.clientY - g.lastY);
      }
      g.lastX = ev.clientX;
      g.lastY = ev.clientY;
    },
    []
  );

  const endGesture = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>, fire: boolean) => {
      pointersRef.current.delete(ev.pointerId);
      if (pointersRef.current.size < 2) pinchDist.current = 0;
      const g = gestureRef.current;
      if (g.id !== ev.pointerId) return;
      const wasTap = !g.dragging && g.moved <= SLOP;
      if (g.dragging) {
        try {
          ev.currentTarget.releasePointerCapture(ev.pointerId);
        } catch {}
      }
      gestureRef.current.id = -1;
      gestureRef.current.dragging = false;
      if (fire && wasTap) onTap(ev.clientX, ev.clientY);
    },
    [onTap]
  );

  /**
   * The tap path, reachable from a test (M8b).
   *
   * The gesture layer sits between a real pointer and the verbs now, so when a
   * tap stops working there are two suspects and no way to tell them apart
   * from outside. This ref lets a probe call the verb path directly and settle
   * it. Dev only: it is only ever read by the __dk debug object.
   */
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  /**
   * Expanding has to go through the React handler, because growing the room
   * also REBUILDS the scene. `__dk.act({type:"expand"})` grows the sim only
   * and leaves the view a shell behind, so the debug object exposes this
   * instead of letting a probe reach for the raw action. Assigned below,
   * where onExpand is declared.
   */
  const onExpandRef = useRef<() => void>(() => {});

  /** one handler on the host: the camera gesture, then the arrange ghost */
  const onPointerMove = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      onPointerMoveGesture(ev);
      onGhostMove(ev);
    },
    [onPointerMoveGesture, onGhostMove]
  );

  const onWheel = useCallback((ev: React.WheelEvent<HTMLDivElement>) => {
    const scene = sceneRef.current;
    const host = hostRef.current;
    if (!scene || !host) return;
    const rect = host.getBoundingClientRect();
    scene.zoomAt(
      ev.deltaY < 0 ? 1.12 : 1 / 1.12,
      ev.clientX - rect.left,
      ev.clientY - rect.top
    );
  }, []);

  const onDials = useCallback((parkedUsd: number, volumeUsd: number) => {
    const world = worldRef.current;
    if (!world) return;
    applyAction(world, roomRef.current, { type: "dials", parkedUsd, weeklyVolumeUsd: volumeUsd });
  }, []);

  const onUpgradeDish = useCallback((key: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "upgradeDish", key })) {
      sfxRef.current?.play("unlock");
      setToast("The kitchen learned to cook that one better.");
    }
  }, []);

  const onPrepSpecial = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "prepSpecial" })) {
      sfxRef.current?.play("unlock");
      const spec = DAILY_SPECIALS[world.daily.idx];
      setToast(`${spec?.name ?? "Today's special"} is on the board. The room will notice.`);
    }
  }, []);

  /**
   * TAKE THE ROOM NEXT DOOR (M8b).
   *
   * The floor is a per-tile sprite grid and the walls are baked to the shell's
   * length, so a bigger room is a new SCENE, not a resized one. The world is
   * untouched by that: it already holds the layout, the people and the shell
   * index, so the new scene picks it all up on its first sync.
   */
  const onExpand = useCallback(() => {
    const world = worldRef.current;
    const app = appRef.current;
    const assets = assetsRef.current;
    const host = hostRef.current;
    if (!world || !app || !assets || !host) return;
    if (!applyAction(world, roomRef.current, { type: "expand" })) return;

    roomRef.current = shellAt(world.shellIdx);
    sceneRef.current?.destroy();
    const next = buildScene(app, roomRef.current, assets, themeRef.current);
    next.setCrew(crewRef.current);
    next.resize(host.clientWidth, host.clientHeight, insetRef.current.top, insetRef.current.bottom);
    next.sync(world, null);
    sceneRef.current = next;

    sfxRef.current?.play("unlock");
    setToast(
      `The ${SHELL_SIZES[world.shellIdx].label} is yours. Tap Arrange and spread out.`
    );
  }, []);

  onExpandRef.current = onExpand;

  const onMarket = useCallback((id: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "market", id })) {
      setMarketId(id);
      sfxRef.current?.play("unlock");
      setToast(`Now sourcing from ${id}. Everything you built stays put.`);
    }
  }, []);

  const onBuyHire = useCallback((hire: HireKind) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "buyHire", hire })) {
      sfxRef.current?.play("kaching");
      sceneRef.current?.spark(world.door.x, world.door.y, 0xf3c86a, 10);
    }
  }, []);

  const onBuyItem = useCallback((itemId: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "buyItem", itemId })) {
      sfxRef.current?.play("kaching");
      setToast(`${itemDef(itemId)?.label ?? "It"} is in your storage. Tap Arrange to place it.`);
    }
  }, []);

  const onSellItem = useCallback((itemId: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "sellItem", itemId })) {
      sfxRef.current?.play("kaching");
      setToast(`Sold from storage. Anything standing in the room stays put.`);
    }
  }, []);

  /** Place straight from the shop: jump into arranging with it in hand. */
  const onPlaceItem = useCallback((itemId: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (!world.editing) {
      if (!applyAction(world, roomRef.current, { type: "edit", on: true })) return;
      setEditing(true);
    }
    setHoldItem(itemId);
    setLiftUid(-1);
    setEditError("");
    setGhostFacing("se");
    sfxRef.current?.play("unlock");
  }, []);

  const toggleEdit = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const next = !world.editing;
    if (applyAction(world, roomRef.current, { type: "edit", on: next })) {
      setEditing(next);
      setHoldItem("");
      setLiftUid(-1);
      setEditError("");
      sfxRef.current?.play("unlock");
    }
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "#1b1310",
        overflow: "hidden",
      }}
    >
      <div
        ref={hostRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endGesture(e, true)}
        onPointerCancel={(e) => endGesture(e, false)}
        onPointerLeave={(e) => endGesture(e, false)}
        onWheel={onWheel}
        style={{
          position: "absolute",
          inset: 0,
          /**
           * "none", not "manipulation" (M8b): the browser's own pinch-zoom and
           * pan would otherwise compete with the camera for the same gestures.
           * The DOM panels sit above this element and keep their own
           * "manipulation", so their double-tap protection is unaffected.
           */
          touchAction: "none",
        }}
      />
      {phase === "ready" && toast && (
        <div
          style={{
            position: "absolute",
            top: 58,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(27,19,16,0.94)",
            border: "1px solid #e8a13d",
            borderRadius: 999,
            color: "#f3e9d2",
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 700,
            padding: "8px 16px",
            zIndex: 6,
            maxWidth: "88vw",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
      {/* the coach steps aside for arrange mode and for any open modal, so it
          never sits on top of the thing it just told the player to open */}
      {phase === "ready" &&
        snap &&
        intro >= 1 &&
        intro < INTRO_DONE &&
        !editing &&
        openSheet === null &&
        // on a phone an OPEN bottom sheet fills most of the screen, and the
        // coach card floated on top of the shop rows it had just told the
        // player to go and use
        (
          <Coach
            step={intro}
            snap={snap}
            narrow={narrow}
            onSkip={() => setIntroBoth(INTRO_DONE)}
          />
        )}
      {phase === "ready" && snap && (
        <>
          {/*
            LAYOUT. Wide: a left flex column (position + dials) and the shop
            pinned right. These used to be independent absolutes both at
            left:12, one from the top and one from the bottom, and at 1280x800
            the position card covered the dials header outright; one column
            makes that impossible.

            Narrow: all three become full-width bars stacked at the BOTTOM.
            They are 250px and 244px cards, so side by side they needed ~518px
            and a phone has 375. pointerEvents none on the container so the
            room stays tappable between the cards; each card turns it back on.
          */}
          {/* ── THE HUD (M11) ──────────────────────────────────────────
              Replaces the eight-chip bar and the three floating cards. The
              room is the page; the HUD is a thin frame around it, identical
              on a phone and a laptop. Everything else arrives as one Sheet.
          */}
          {!editing && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  top: 12,
                  display: "flex",
                  gap: 8,
                  zIndex: Z.hud,
                }}
              >
                {/* the game's first persistent coin counter: until now coins
                    only existed inside the shop header */}
                <CoinChip coins={snap.coins} onClick={() => showSheet("money")} />
                <StatPill
                  quality={snap.quality}
                  tier={snap.tier}
                  clock={`${snap.clock} · ${snap.phase}`}
                  badge={snap.dailyPlates < 10 || !snap.dailyPrepped || !snap.dailyGreeted}
                  onClick={() => showSheet("service")}
                />
              </div>

              <div style={{ position: "absolute", right: 12, top: 12, zIndex: Z.hud }}>
                <IconOnly
                  label={muted ? "Sound off" : "Sound on"}
                  onClick={() => {
                    setMuted((m) => {
                      const next = !m;
                      sfxRef.current?.setMuted(next);
                      try {
                        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
                      } catch {}
                      return next;
                    });
                  }}
                >
                  {muted ? <IconSpeakerOff /> : <IconSpeaker />}
                </IconOnly>
              </div>

              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: `calc(10px + env(safe-area-inset-bottom, 0px))`,
                  display: "flex",
                  justifyContent: "center",
                  gap: 8,
                  zIndex: Z.hud,
                  pointerEvents: "none",
                }}
              >
                <div style={{ display: "flex", gap: 8, pointerEvents: "auto" }}>
                  <DockButton
                    icon={<IconCart />}
                    label="Shop"
                    active={openSheet === "shop"}
                    onClick={() => showSheet(openSheet === "shop" ? null : "shop")}
                  />
                  <DockButton
                    icon={<IconMoney />}
                    label="Money"
                    active={openSheet === "money"}
                    badge={!!campaigns.find((c) => c.market === marketId)}
                    onClick={() => showSheet(openSheet === "money" ? null : "money")}
                  />
                  <DockButton
                    icon={<IconCloche />}
                    label="Menu"
                    active={openSheet === "menu"}
                    onClick={() => showSheet(openSheet === "menu" ? null : "menu")}
                  />
                  <DockButton
                    icon={<IconCap />}
                    label="Learn"
                    active={openSheet === "learn"}
                    onClick={() => showSheet(openSheet === "learn" ? null : "learn")}
                  />
                  <DockButton
                    icon={<IconMore />}
                    label="More"
                    active={openSheet === "more"}
                    onClick={() => showSheet(openSheet === "more" ? null : "more")}
                  />
                </div>
              </div>
            </>
          )}

          {/* ── the sheets ─────────────────────────────────────────────── */}
          {!editing && openSheet === "money" && market && (
            <Sheet title="Your money here" onClose={() => showSheet(null)}>
              <LpPanel
                market={market}
                read={lp}
                live={liveOn}
                cloud={cloud}
                onUseLive={setUseLive}
                collapsed={false}
                bare
                onToggle={() => showSheet(null)}
                onAddLiquidity={() => showSheet("addLp")}
              />
              <DialsPanel
                snap={snap}
                collapsed={false}
                bare
                section="money"
                onToggle={() => showSheet(null)}
                onDials={onDials}
                onMarket={onMarket}
                campaign={campaigns.find((c) => c.market === marketId) ?? null}
              />
            </Sheet>
          )}

          {!editing && openSheet === "service" && (
            <Sheet title="Tonight's service" onClose={() => showSheet(null)}>
              <DialsPanel
                snap={snap}
                collapsed={false}
                bare
                section="service"
                onToggle={() => showSheet(null)}
                onDials={onDials}
                onMarket={onMarket}
                campaign={campaigns.find((c) => c.market === marketId) ?? null}
              />
            </Sheet>
          )}

          {!editing && openSheet === "shop" && (
            <Sheet title="Shop" onClose={() => showSheet(null)}>
              <ShopPanel
                snap={snap}
                theme={theme}
                collapsed={false}
                bare
                onToggle={() => showSheet(null)}
                onBuyHire={onBuyHire}
                onBuyItem={onBuyItem}
                onSellItem={onSellItem}
                onPlaceItem={onPlaceItem}
                onExpand={onExpand}
              />
            </Sheet>
          )}

          {!editing && openSheet === "more" && (
            <Sheet title="More" onClose={() => showSheet(null)}>
              <MoreRow icon={<IconWrench />} label="Arrange the room" hint="Move, turn and store your furniture." onClick={() => { showSheet(null); toggleEdit(); }} />
              <MoreRow icon={<IconChevron />} label="Name your place" hint={roomTitle ? `The sign says ${roomTitle}.` : "Put a name over the door."} onClick={() => showSheet("name")} />
              <MoreRow icon={<IconChefHat />} label="Your crew" hint="Pick your chef and waiter, and name them." onClick={() => showSheet("crew")} />
              <MoreRow icon={<IconSwatch />} label="Style" hint="Change the look of the whole room." onClick={() => showSheet("style")} />
              <MoreRow icon={<IconBook />} label="Guest book" hint="What happened in your restaurant." onClick={() => showSheet("book")} />
              <MoreRow
                icon={<IconCamera />}
                label="Share a postcard"
                hint="A picture of your place, ready to post."
                onClick={async () => {
                  const app = appRef.current;
                  const scene = sceneRef.current;
                  const w = worldRef.current;
                  if (!app || !scene || !w) return;
                  showSheet(null);
                  try {
                    const blob = await makePostcard(app, app.stage, {
                      name: roomTitleRef.current,
                      tier: snap.tier,
                    });
                    const how = await sharePostcard(blob, roomTitleRef.current);
                    setToast(how === "shared" ? "Postcard sent." : "Postcard saved to your downloads.");
                    sfxRef.current?.play("kaching");
                  } catch {
                    setToast("The postcard did not come out. Try again in a moment.");
                  }
                }}
              />
              <MoreRow icon={<IconMedal />} label="Best tables in town" hint="See how other kitchens are doing." href="/chef/board" />
            </Sheet>
          )}

          {!editing && openSheet === "name" && (
            <Sheet title="Name your place" onClose={() => showSheet("more")}>
              <div style={{ fontFamily: FONT, fontSize: 13, color: C.creamDim, lineHeight: 1.5, marginBottom: 10 }}>
                The name goes on a sign by your door. Friends will see it when
                they look at your place.
              </div>
              <input
                type="text"
                maxLength={ROOM_NAME_MAX}
                defaultValue={roomTitle}
                placeholder="Big Mike's"
                aria-label="Restaurant name"
                onChange={(e) => {
                  const v = e.target.value;
                  setRoomTitle(v);
                  roomTitleRef.current = v;
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: FONT,
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.cream,
                  background: C.well,
                  border: `1px solid ${C.line}`,
                  borderRadius: R.inner,
                  padding: "12px 14px",
                  outline: "none",
                }}
              />
              <div style={{ height: 12 }} />
              <Button
                variant="primary"
                onClick={() => {
                  sceneRef.current?.setSign(roomTitleRef.current);
                  sfxRef.current?.play("kaching");
                  showSheet(null);
                  setToast(
                    roomTitleRef.current.trim()
                      ? "The sign is up. Looks good."
                      : "Sign taken down. You can name it any time."
                  );
                }}
              >
                Put up the sign
              </Button>
            </Sheet>
          )}

          {editing && (
            <EditTray
              inventory={snap.inventory}
              holdingItemId={holdItem}
              liftUid={liftUid}
              error={editError}
              onPickItem={(id) => {
                setHoldItem(id);
                setLiftUid(-1);
                setEditError("");
              }}
              onRotate={() => {
                const world = worldRef.current;
                if (!world) return;
                // Turn works on BOTH: a lifted piece turns in place, and a
                // piece from storage turns in your hand before it lands
                setGhostFacing((f) => (f === "se" ? "sw" : "se"));
                if (liftUid >= 0) {
                  if (!applyAction(world, roomRef.current, { type: "rotate", uid: liftUid })) {
                    setEditError("That will not fit turned around.");
                    return;
                  }
                }
                setEditError("");
                sfxRef.current?.play("bus");
              }}
              onStore={() => {
                const world = worldRef.current;
                if (!world || liftUid < 0) return;
                if (applyAction(world, roomRef.current, { type: "store", uid: liftUid })) {
                  setLiftUid(-1);
                  setEditError("");
                  sfxRef.current?.play("bus");
                } else {
                  setEditError("The room needs that where it is.");
                }
              }}
              onCancel={() => {
                setHoldItem("");
                setLiftUid(-1);
                setEditError("");
              }}
            />
          )}
          {openSheet === "crew" && (
            <CrewModal
              crew={crew}
              looks={CREW_LOOKS}
              nameMax={CHEF_NAME_MAX}
              onPick={(next) => {
                setCrew(next);
                sceneRef.current?.setCrew(next);
                sfxRef.current?.play("unlock");
              }}
              onName={(name) => {
                const next = { ...crewRef.current, chefName: name };
                setCrew(next);
                sceneRef.current?.setCrew(next);
              }}
              onClose={() => showSheet("more")}
            />
          )}
          {openSheet === "style" && (
            <StyleModal
              theme={theme}
              onPick={(t) => {
                setTheme(t);
                sceneRef.current?.setTheme(t);
                sfxRef.current?.play("unlock");
                try {
                  localStorage.setItem(THEME_KEY, t);
                } catch {}
              }}
              onClose={() => showSheet("more")}
            />
          )}
          {openSheet === "learn" && (
            <AcademyModal
              done={courses}
              onComplete={(id) => {
                const world = worldRef.current;
                if (!world) return;
                if (applyAction(world, roomRef.current, { type: "completeCourse", id })) {
                  setCourses([...world.courses]);
                  sfxRef.current?.play("unlock");
                  setToast(
                    isGraduate(world.courses)
                      ? "Every course finished. Your kitchen wears the mark."
                      : "Course finished. The coins are in your register."
                  );
                }
              }}
              onClose={() => showSheet(null)}
              tradeHref={
                market
                  ? `https://app.doma.xyz/domain/${encodeURIComponent(market.id.toLowerCase())}`
                  : undefined
              }
              onAddLiquidity={() => showSheet("addLp")}
            />
          )}
          {openSheet === "menu" && worldRef.current && (
            <MenuModal
              menu={worldRef.current.menu}
              theme={theme}
              pantry={worldRef.current.pantry}
              daily={worldRef.current.daily}
              canUpgrade={(k) => (worldRef.current ? canUpgradeDish(worldRef.current, k) : false)}
              onUpgrade={onUpgradeDish}
              onPrepSpecial={onPrepSpecial}
              onClose={() => showSheet(null)}
            />
          )}
          {openSheet === "addLp" && market && (
            <AddLiquidityModal
              market={market}
              tradeHref={`https://app.doma.xyz/domain/${encodeURIComponent(market.id.toLowerCase())}`}
              onClose={() => showSheet("money")}
              onDone={() => {
                showSheet("money");
                setToast("That is working now. Your kitchen will feel it within the hour.");
                // the position list is polled, so it appears on the card by itself
              }}
            />
          )}
          {openSheet === "book" && worldRef.current && (
            <BookModal
              moments={worldRef.current.moments}
              hearts={worldRef.current.stats.hearts}
              served={worldRef.current.stats.served}
              gusVisits={worldRef.current.stats.gusVisits}
              regulars={worldRef.current.regulars}
              dueToday={worldRef.current.dueToday}
              theme={theme}
              onClose={() => showSheet("menu")}
            />
          )}
        </>
      )}
      {phase !== "ready" && (
        <BootShell
          progress={progress}
          tip={BOOT_TIPS[tipIdx]}
          error={phase === "error" ? "boot" : undefined}
        />
      )}
    </div>
  );
}
