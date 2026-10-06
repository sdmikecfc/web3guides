"use client";

/**
 * The ONE Pixi mount for Domain Kitchen (ADR-0101/0102/0103/0104). Owns the
 * Application lifecycle, the counted preloader, the fixed-timestep loop, and
 * PLAYER INPUT (taps, shop, and the layout editor -> world actions via
 * applyAction, the only door into the sim). All panels are DOM/React.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BOOT_TIPS, BootShell } from "./BootShell";
import {
  applyAction,
  applyCanonicalLaunch,
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
  setCareJobsActive,
  stepWorld,
  WORLD_FIXED_DT,
  type Facing,
  type HireKind,
  type PlacedItem,
  type RoomDef,
  type WorldState,
} from "./_engine/world";
import { itemDef, footprintCells } from "./_engine/items";
import { SHELL, SHELL_SIZES, shellAt, starterDesign, starterLayout } from "./_engine/rooms";
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

import { isGraduate } from "./_engine/academy";


import { AUTHORITY_ENABLED, type KitchenSnapshot, useCloudSave } from "./_chain/useCloudSave";
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
import { availableDishes, dishDef } from "./_engine/cookbook";
import { claimGuestDelivery, createDelivery, createOnboarding, onboardingStep, type OnboardingState } from "./_engine/onboarding";
import type { KitchenCommand } from "@/lib/chef/authority";
import DecorEditor from "./DecorEditor";
import { FLOOR_FINISHES } from "./_engine/building";
import { FriendsPanel } from "./FriendsPanel";
import { featuredItems, dailyIngredientOffers } from "@/lib/chef/authority";
import { settleRestaurant } from "@/lib/chef/offline";
import { RestaurantHUD, ShopCatalog, Cookbook, DeliveryParcel, ParcelArt } from "./RestaurantUI";
import FoodTruck from "./FoodTruck";
import { dispatchTruck, type TruckAction } from "./_engine/truck";
import { isTruckCommand, takeTruckBatch } from "./_chain/truck-tape";
import css from "./_ui/restaurant.module.css";
import { Coach, INTRO_DONE } from "./Coach";
import { CareSpot, DailyRibbon, ExpansionCard, careLabel } from "./DailyPlay";
import { type LaunchGoalId, LAUNCH_RULES } from "./_engine/launch-progression";


const MAX_SUBSTEPS = 8;
const DPR_CAP = 2;
const DEFAULT_SAVE_KEY = "dk_save_v2";
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
  | "truck"
  | "account"
  | "delivery"
  | "frontier"
  | "friends"
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

export default function GameStage({ openingPreview = false }: { openingPreview?: boolean }) {
  openingPreview = process.env.NODE_ENV === "development" && openingPreview;
  const SAVE_KEY = openingPreview ? "dk_opening_preview_v1" : DEFAULT_SAVE_KEY;
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
  const [, renderTruck] = useState(0);
  const [truckError, setTruckError] = useState("");
  const [truckBusy, setTruckBusy] = useState(false);
  const truckOpenRef = useRef(false);
  const truckActionsRef = useRef<TruckAction[]>([]);
  const truckSendingRef = useRef(false);
  const truckFlightRef = useRef<Promise<boolean>|null>(null);
  const truckUncertainRef = useRef(false);
  const flushTruckRef = useRef<(drain?:boolean)=>Promise<boolean>>(async()=>true);
  const truckOwnsPrediction=()=>truckOpenRef.current||truckSendingRef.current||truckActionsRef.current.length>0||truckUncertainRef.current||isTruckCommand(cloudRef.current.pendingCommand());
  const careButtons = useRef(new Map<string, HTMLButtonElement>());
  const [careBusy,setCareBusy] = useState(false);
  const [cookFocusSpecial,setCookFocusSpecial] = useState(false);
  const careBusyRef = useRef(false);
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
      const arranging=worldRef.current?.editing;
      insetRef.current = { top: arranging?80:mq.matches?184:105, bottom: arranging&&mq.matches?300:110 };
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
  const onboardingRef = useRef(createOnboarding(true));
  const deliveryRef = useRef(createDelivery());
  const [goalDishId, setGoalDishId] = useState<string | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const deliveryBusyRef = useRef(false);
  const [deliveryReveal, setDeliveryReveal] = useState<Record<string, number> | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const guestDesignRef = useRef<DkSave | null>(null);
  const parcelButtonRef = useRef<HTMLButtonElement>(null);
  const setIntroBoth = useCallback((n: number) => {
    introRef.current = n;
    setIntro(n);
    if(worldRef.current)setCareJobsActive(worldRef.current,n===INTRO_DONE);
  }, []);
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(true);
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
  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    const narrow=host.clientWidth<=900;
    insetRef.current={top:editing?80:narrow?184:105,bottom:editing&&narrow?300:110};
    sceneRef.current?.resize(host.clientWidth,host.clientHeight,insetRef.current.top,insetRef.current.bottom);
  },[editing]);
  const [holdItem, setHoldItem] = useState("");
  const [liftUid, setLiftUid] = useState(-1);
  const [editError, setEditError] = useState("");
  type EditSnapshot={layout:WorldState["layout"];design:WorldState["design"]};
  const editHistory=useRef<EditSnapshot[]>([]),editCursor=useRef(0);
  const editServerBase=useRef("");
  const [editSession,setEditSession]=useState(0);
  const [editUncertain,setEditUncertain]=useState(false);
  const [,renderEdit]=useState(0);
  const [pendingPlacement,setPendingPlacement]=useState<{gx:number;gy:number}|null>(null);
  const pendingPlacementRef=useRef(pendingPlacement);pendingPlacementRef.current=pendingPlacement;
  const [editSaving,setEditSaving]=useState(false);
  const editSavingRef=useRef(false);
  const runCommandRef=useRef<(command:KitchenCommand)=>Promise<KitchenSnapshot|null>>(async()=>null);
  const paintRef=useRef<{tool:"furniture"|"floor"|"wall";finishId:string}>({tool:"furniture",finishId:"cream"});
  const [routes,setRoutes]=useState(false);
  const recordEdit=useCallback(()=>{const w=worldRef.current;if(!w)return;const next=structuredClone({layout:w.layout,design:w.design});if(JSON.stringify(editHistory.current[editCursor.current])===JSON.stringify(next))return;editHistory.current=editHistory.current.slice(0,editCursor.current+1);editHistory.current.push(next);editCursor.current=editHistory.current.length-1;renderEdit(n=>n+1);},[]);
  const beginHistory=useCallback(()=>{const w=worldRef.current;if(!w)return;setEditSession(n=>n+1);const server=cloudRef.current.authorityRef.current?.save;editServerBase.current=server?JSON.stringify({layout:server.layout,design:server.design,shell:server.shell}):"";editHistory.current=[structuredClone({layout:w.layout,design:w.design})];editCursor.current=0;paintRef.current={tool:"furniture",finishId:"cream"};setRoutes(false);setGhostFacing("se");setPendingPlacement(null);renderEdit(n=>n+1);},[]);
  const restoreEdit=useCallback((index:number)=>{const w=worldRef.current,saved=editHistory.current[index];if(!w||!saved)return;if(applyAction(w,roomRef.current,{type:"replaceLayout",layout:saved.layout})){w.design=structuredClone(saved.design);editCursor.current=index;setHoldItem("");setLiftUid(-1);setPendingPlacement(null);setEditError("");renderEdit(n=>n+1);}},[]);
  /** which way the piece in hand is turned (ADR-0104's Turn control) */
  const [ghostFacing, setGhostFacing] = useState<Facing>("se");
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
  const cookbookSeenRef = useRef(false);
  const showSheet = useCallback((id: SheetId) => {
    truckOpenRef.current = id === "truck";
    if (id === "money") lpSeenRef.current = true;
    if (id === "menu") cookbookSeenRef.current = true;
    setOpenSheet(id);
  }, []);

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
  const campaigns: { market: string; endsAt: string; windowEndsAt: string }[] = [];

  // the wallet's REAL liquidity at the current market (M5)
  const market = marketDef(marketId);

  // server-side saves (M6): optional, never a gate on playing
  const cloud = useCloudSave(openingPreview);
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  const persistLocalNow = useCallback(() => {
    const w = worldRef.current;
    if (!w || w.editing) return;
    const metadata = { onboarding: onboardingRef.current, delivery: deliveryRef.current };
    const canonical = AUTHORITY_ENABLED && cloudRef.current.wallet ? cloudRef.current.authorityRef.current?.save : null;
    const saved = canonical ? { ...canonical, ...metadata } : serializeSave(w, themeRef.current, crewRef.current, introRef.current, roomTitleRef.current, metadata);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
  }, []);
  const updateOnboarding = useCallback((patch: Partial<OnboardingState>, sync = false) => {
    onboardingRef.current = { ...onboardingRef.current, ...patch };
    setGoalDishId(onboardingRef.current.goalDishId);
    setIntroBoth(onboardingStep(onboardingRef.current, deliveryRef.current));
    persistLocalNow();
    if (sync && AUTHORITY_ENABLED && cloudRef.current.wallet) {
      void runCommandRef.current({ type: "appearance", appearance: { onboarding: patch } });
    }
  }, [persistLocalNow, setIntroBoth]);
  const themeRef = useRef<ThemeId>("trattoria");
  themeRef.current = theme;
  const crewRef = useRef<DkSave["crew"]>({ chef: 0, waiter: 0, chefName: "" });
  crewRef.current = crew;
  const liveOn = false;
  // the polling snapshot runs outside React's render, so it reads a ref
  const liveRef = useRef(false);
  liveRef.current = liveOn;

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
    if (!snap || !worldRef.current) return;
    if (!onboardingRef.current.served && worldRef.current.stats.served > 0) updateOnboarding({ served: true }, true);
  }, [snap, updateOnboarding]);

  // keep the scene's edit view in a ref the ticker can read every frame
  useEffect(() => {
    const w=worldRef.current;
    const itemId=holdItem||w?.layout.find(p=>p.uid===liftUid)?.itemId||"";
    const position=pendingPlacement??{gx:-99,gy:-99};
    const why=w&&pendingPlacement&&itemId?previewPlace(w,roomRef.current,itemId,position.gx,position.gy,liftUid>=0?liftUid:undefined,ghostFacing):"";
    editRef.current = editing
      ? { liftUid, ghostItemId: holdItem, ...position, valid: !!pendingPlacement&&!why, facing: ghostFacing }
      : null;
    if(pendingPlacement)setEditError(why);
    if(editRef.current) Object.assign(editRef.current,{showRoutes:routes});
    (window as unknown as Record<string, unknown>).__editView = editRef.current;
  }, [editing, liftUid, holdItem, ghostFacing,routes,pendingPlacement]);

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
      let quietMusic = true;
      try { quietMusic = localStorage.getItem("dk_music_muted") !== "0"; } catch {}
      setMusicMuted(quietMusic);
      sfxRef.current.setMusicMuted(quietMusic);

      const a = new Application();
      await a.init({
        resizeTo: host,
        background: "#f4eddf",
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
      if(host.clientWidth>0&&host.clientHeight>0)a.renderer.resize(host.clientWidth,host.clientHeight);
      setProgress(0.1);

      const assets = await loadGameAssets((p) => {
        if (!cancelled) setProgress(0.1 + p * 0.9);
      });
      if (cancelled) return;

      // ── load: this browser's save, the server's, whichever is newer ──────
      let local: DkSave | null = null;
      try {
        const rawLocal = localStorage.getItem(SAVE_KEY);
        if (rawLocal) {
          const original=JSON.parse(rawLocal);
          local = sanitizeSave(original);
          if(Number(original?.v??0)<8){
            try{const backupKey=`${SAVE_KEY}:before-truck-v8`;if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,rawLocal);}catch{}
          }
        }
        else if (!openingPreview) {
          // an M3-era save still has value: turn its counts into a room
          const rawV1 = localStorage.getItem(OLD_SAVE_KEY);
          if (rawV1) {
            const s = JSON.parse(rawV1) as {
              coins?: number; tables?: number; stoves?: number; waiters?: number; chefs?: number;
            };
            local = sanitizeSave({
              intro: INTRO_DONE,
              onboarding: createOnboarding(true),
              delivery: createDelivery(Math.floor(Date.now() / 86_400_000), true),
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
      if(AUTHORITY_ENABLED&&cloudRef.current.wallet&&!remote)throw new Error("Your saved restaurant could not be loaded. Reconnect before continuing.");
      const chosen = AUTHORITY_ENABLED && remote ? remote : newerSave(local, remote);
      if (remote && chosen === remote && local) {
        setToast("Picked up your restaurant from your wallet.");
      }

      const save = chosen ?? sanitizeSave({ layout: starterLayout(), design: starterDesign() });
      try {
        const guestCopy = openingPreview ? null : localStorage.getItem("dk_guest_before_connect");
        if (guestCopy) guestDesignRef.current = sanitizeSave(JSON.parse(guestCopy));
      } catch {}
      const parkedUsd = 0;
      const volumeUsd = 0;
      onboardingRef.current = save.onboarding;
      deliveryRef.current = save.delivery;
      setGoalDishId(save.onboarding.goalDishId);
      let coins = save.coins;
      const hires = { waiters: save.waiters, chefs: save.chefs };
      const layout = layoutFromSave(save);
      const inventory = save.inventory;
      const savedAt = save.savedAt;
      const market = save.market;
      const lpDays = save.lpDays;

      if (savedAt > 0 && !(AUTHORITY_ENABLED && remote)) {
        // Reuse the same capped service and receipt as a tab returning from
        // the background. A backwards clock must retain the existing purse.
        const settled = settleRestaurant(save,{condition:{...save.maintenance,lastSettledAt:savedAt},coinRemainder:save.launch.passive.remainder,plateRemainder:0,passive:save.launch.passive},Date.now());
        const earned = settled.coins;
        save.maintenance=settled.condition;
        if(settled.equipment)save.equipment=settled.equipment;
        if(settled.passive)save.launch.passive=settled.passive;
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
        design: save.design,
        maintenance: save.maintenance,
        market,
        lpDays,
        courses: save.courses,
        pantry: save.pantry,
        menu: save.menu,
        bestQuality: save.bestQuality,
        utcDay: save.utcDay,
        daily: save.daily,
        launch: save.launch,
        truck: save.truck,
        equipment: save.equipment,
        careJobsActive: save.onboarding.finished,
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
        if (AUTHORITY_ENABLED && cloudRef.current.wallet) return;
        const beat = dayBeat(Date.now(), world.utcDay);
        if (!beat) return;
        applyAction(world, roomRef.current, {
          type: "newDay",
          utcDay: beat.utcDay,
          banked: beat.banked,
          tenure: 0,
          deferDelivery: true,
        });
        if (beat.welcomeBack) {
          setToast("The crew kept your place warm. A delivery is waiting by the door.");
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
        onboardingStep(save.onboarding, save.delivery)
      );

      let startTheme: ThemeId = (THEME_IDS as readonly string[]).includes(save.theme) ? save.theme as ThemeId : "trattoria";
      try {
        const t = localStorage.getItem(THEME_KEY) as ThemeId | null;
        if (!openingPreview && !chosen && t && (THEME_IDS as readonly string[]).includes(t)) startTheme = t;
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
      const discoveredSales = new Map(world.menu.dishes.filter(d=>d.key==="fries"||d.key==="lemonade").map(d=>[d.key,d.serves]));
      const soundSweep = () => {
        const sfx = sfxRef.current;
        if (!sfx) return;
        const s = world.stats;
        if (s.arrived > prevEv.arrived) sfx.play("doorbell");
        if (s.served > prevEv.served) sfx.play("serve");
        if(s.served>prevEv.served)for(const dish of world.menu.dishes){
          if(!discoveredSales.has(dish.key))continue;
          const before=discoveredSales.get(dish.key)??0;
          if(before===0&&dish.serves>0){
            sfx.play("unlock");setToast(dish.key==="fries"?"Your first fries! That truck discovery is now part of your restaurant.":"Your first lemonade! A little road-trip discovery, served right at home.");
            const station=world.operations.stations.find(entry=>entry.dishes.includes(dish.key));
            if(station)sceneRef.current?.spark(station.gx,station.gy,0xecc267,14);
          }
          discoveredSales.set(dish.key,dish.serves);
        }
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
      let passiveAt = Math.max(Date.now(), world.launch.passive.lastSettledAt);
      const settleGuestAbsence = (w: WorldState, now: number): number => {
        const elapsedMs = Math.max(0, now - passiveAt);
        if (w.editing) {
          // Decorating pauses service, including while its tab is hidden.
          applyAction(w,roomRef.current,{type:"settlePassive",elapsedMs,now});
          return 0;
        }
        const save = serializeSave(w,themeRef.current,crewRef.current,introRef.current,roomTitleRef.current,{onboarding:onboardingRef.current,delivery:deliveryRef.current});
        const settled = settleRestaurant(save,{
          condition:{...w.maintenance,lastSettledAt:passiveAt},
          coinRemainder:w.launch.passive.remainder,plateRemainder:0,passive:w.launch.passive,
        },now);
        w.playMoney += settled.coins;
        w.maintenance = settled.condition;
        if(settled.equipment)w.equipment=settled.equipment;
        if(settled.passive)w.launch.passive=settled.passive;
        return settled.coins;
      };
      let performanceFrames=0, performanceAt=performance.now();
      a.ticker.add(() => {
        if(truckOpenRef.current){acc=0;return;}
        if(process.env.NODE_ENV!=="production"){
          performanceFrames++;const now=performance.now();
          if(now-performanceAt>=1000){host.dataset.dkFps=String(Math.round(performanceFrames*1000/(now-performanceAt)));host.dataset.dkTicks=String(world.tick);performanceFrames=0;performanceAt=now;}
        }
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
        sceneRef.current?.sync(world, editRef.current, introRef.current===INTRO_DONE);
        if(sceneRef.current)for(const task of world.launch.careTasks){
          const button=careButtons.current.get(task.id);if(!button)continue;
          const point=sceneRef.current.tileToScreen(task.target.gx,task.target.gy);
          const adjacent=sceneRef.current.tileToScreen(task.target.gx+1,task.target.gy);
          const tileWidth=Math.abs(adjacent.x-point.x)*2;
          const lift=task.target.kind==="table"?tileWidth*.45:task.target.kind==="stove"?tileWidth*.52:0;
          button.style.setProperty("--care-art-size",`${Math.max(36,Math.min(84,tileWidth*1.15))}px`);
          button.style.left=`${point.x}px`;
          button.style.top=`${point.y-lift}px`;
        }
        const parcelButton = parcelButtonRef.current;
        if (parcelButton && sceneRef.current) {
          const door = roomRef.current.door;
          const point = sceneRef.current.tileToScreen(door.x, door.y);
          parcelButton.style.left = `${Math.max(40, Math.min(host.clientWidth - 40, point.x + 36))}px`;
          parcelButton.style.top = `${Math.max(insetRef.current.top + 22, Math.min(host.clientHeight - 160, point.y + 12))}px`;
        }
      });

      onVis = () => {
        if (!app || cancelled) return;
        if (document.visibilityState === "hidden") app.ticker.stop();
        else {
          // a tab left open across midnight is still a new day
          dayBusRef.current?.();
          const w = worldRef.current;
          const now = Date.now();
          if (AUTHORITY_ENABLED && cloudRef.current.wallet) {
            if (w && !w.editing && !truckOwnsPrediction()) void runCommandRef.current({type:"settle"});
          } else if (w) {
            const earned = settleGuestAbsence(w,now);
            if (!w.editing) {
              const metadata = {onboarding:onboardingRef.current,delivery:deliveryRef.current};
              // Persist the consumed absence before another hide/reload can
              // present it again, even if the regular poll has not run yet.
              try{localStorage.setItem(SAVE_KEY,JSON.stringify(serializeSave(w,themeRef.current,crewRef.current,introRef.current,roomTitleRef.current,metadata)));}catch{}
              if(earned>0)setToast(`The crew kept the pans warm. +${earned} coins while you were away.`);
            }
          }
          passiveAt = Math.max(passiveAt, now);
          app.ticker.start();
        }
      };
      document.addEventListener("visibilitychange", onVis);
      if (document.visibilityState === "hidden") a.ticker.stop();

      ro = new ResizeObserver(() => {
        if (!cancelled && host.clientWidth > 0) {
          a.renderer.resize(host.clientWidth,host.clientHeight);
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
        const connected = AUTHORITY_ENABLED && !!cloudRef.current.wallet;
        // Hidden guest tabs leave one absence to settle on return. Advancing
        // or autosaving here would silently turn days away into active play.
        if (!connected && document.visibilityState === "hidden") return;
        // Animated service predicts movement, never earned inventory or currency.
        const canonical = connected ? cloudRef.current.authorityRef.current : null;
        const passiveNow=Date.now();
        if(!connected){
          dayBusRef.current?.();
          const elapsedMs=Math.max(0,passiveNow-passiveAt);
          // Sleeping laptops can suspend timers without a visibility event.
          if(elapsedMs>60_000)settleGuestAbsence(w,passiveNow);
          else applyAction(w,roomRef.current,{type:"settlePassive",elapsedMs,now:passiveNow});
        }
        passiveAt=Math.max(passiveAt,passiveNow);
        if (canonical && !truckOwnsPrediction()) {
          w.playMoney = canonical.save.coins;
          w.coinFloat = 0;
          w.pantry = { ...w.pantry, ...structuredClone(canonical.save.pantry) };
          w.menu = { ...w.menu, ...structuredClone(canonical.save.menu) };
          w.daily = { ...canonical.save.daily };
          w.maintenance = { ...canonical.save.maintenance };
          setCareJobsActive(w,introRef.current===INTRO_DONE);
          applyCanonicalLaunch(w,canonical.save.launch);
        }
        const svc = deriveService(w);
        const qp = qualityParts(w);
        const displayQuality=canonical?.authority.currentQuality??qp.total;
        const tierNow = serviceTier(displayQuality);
        // keep the graduate mark honest however courses got finished
        setCourses((prev) => (prev.length === w.courses.length ? prev : [...w.courses]));
        setSnap({
          qBase: qp.base,
          qPresence: qp.presence,
          qClean: qp.cleanliness,
          qDishes: qp.dishes,
          bestQuality: canonical?.authority.verifiedBestQuality ?? w.stats.bestQuality,
          trashCount: w.trash.length,
          cleanliness: w.maintenance.cleanliness,
          equipment: w.maintenance.equipment,
          toiletsBroken: w.toilets.filter((t) => t.broken).length,
          toiletsTotal: w.toilets.length,
          tierName: svc.tier.name,
          seatsOpen: svc.seatsOpen,
          tables: svc.openTables,
          stoves: svc.stoves,
          waiters: w.hires.waiters,
          chefs: w.hires.chefs,
          speed: svc.speed,
          quality: AUTHORITY_ENABLED && cloudRef.current.authorityRef.current ? cloudRef.current.authorityRef.current.authority.currentQuality : qualityOf(w),
          presence: w.presence,
          coins: AUTHORITY_ENABLED && cloudRef.current.authorityRef.current ? cloudRef.current.authorityRef.current.save.coins : w.playMoney,
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
            SERVICE_TIERS[SERVICE_TIERS.length - 1].minQuality - displayQuality
          ),
          arrived: w.stats.arrived,
          hustles: w.stats.hustles,
          lpCardOpened: lpSeenRef.current,
          cookbookOpened: cookbookSeenRef.current,
          pantryCount: Object.values(w.pantry.stock).reduce((n,v)=>n+v,0),
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
        const metadata = { onboarding: onboardingRef.current, delivery: deliveryRef.current };
        const save = canonical ? { ...canonical.save, ...metadata } : serializeSave(w, themeRef.current, crewRef.current, introRef.current, roomTitleRef.current, metadata);
        try {
          if(!w.editing)localStorage.setItem(SAVE_KEY, JSON.stringify(save));
        } catch {}
        const now = Date.now();
        if (!w.editing && !AUTHORITY_ENABLED && cloudRef.current.status === "on" && now - lastPushRef.current > 15_000) {
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
      sfxRef.current?.destroy();
      if (app) {
        app.destroy(true, { children: true, texture: false });
        app = null;
      }
      worldRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // ── pointer: play verbs, or the layout editor ────────────────────────────
  const tileAt = useCallback((clientX: number, clientY: number): { x: number; y: number; facing?: Facing } | null => {
    const host = hostRef.current;
    const scene = sceneRef.current;
    if (!host || !scene) return null;
    const rect = host.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const world = worldRef.current, view = editRef.current;
    const itemId = view?.ghostItemId || world?.layout.find((item) => item.uid === view?.liftUid)?.itemId;
    if (world?.editing && itemId && itemDef(itemId)?.layer === "wall") {
      // A point high on a wall projects outside the floor grid. Pick the
      // actual mounting surface; retain the selected wall at the corner.
      const mount = scene.pickWall(sx, sy);
      if (mount) return mount;
    }
    return scene.pick(sx, sy);
  }, []);

  const onGhostMove = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      const w = worldRef.current;
      const view = editRef.current;
      if (!w || !w.editing || !view) return;
      if(pendingPlacementRef.current||editSavingRef.current||cloudRef.current.pendingCommand()?.type==="layout")return;
      if (!view.ghostItemId && view.liftUid < 0) return;
      const p = tileAt(ev.clientX, ev.clientY);
      if (!p) return;
      const gx = Math.round(p.x);
      const gy = Math.round(p.y);
      const nextFacing = p.facing ?? view.facing;
      if (gx === view.gx && gy === view.gy && nextFacing === view.facing) return;
      view.gx = gx;
      view.gy = gy;
      view.facing = nextFacing;
      const itemId =
        view.ghostItemId || w.layout.find((q) => q.uid === view.liftUid)?.itemId || "";
      view.valid =
        itemId !== "" &&
        previewPlace(w, roomRef.current, itemId, gx, gy, view.liftUid >= 0 ? view.liftUid : undefined, view.facing) === "";
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
      if (!world || !scene || truckOpenRef.current) return;
      const p = tileAt(clientX, clientY);
      if (!p) return;
      if(!world.editing){
        const rect=hostRef.current?.getBoundingClientRect();
        const uid=rect?scene.pickItem(clientX-rect.left,clientY-rect.top):null;
        const piece=world.layout.find(item=>item.uid===uid);
        if(piece&&itemDef(piece.itemId)?.kind==="counter"){showSheet("menu");return;}
        if(piece&&world.equipment.instances[String(piece.uid)]?.condition<100){
          if(AUTHORITY_ENABLED&&cloudRef.current.wallet)void runCommandRef.current({type:"repairMachine",uid:piece.uid});
          else {world.equipment.instances[String(piece.uid)].condition=100;sfxRef.current?.play("bus");setToast("Back in working order.");}
          return;
        }
      }
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
        if(editSavingRef.current||cloudRef.current.pendingCommand()?.type==="layout")return;
        const view = editRef.current;
        const gx = Math.round(p.x);
        const gy = Math.round(p.y);
        if(paintRef.current.tool==="floor"){
          if(applyAction(world,roomRef.current,{type:"finish",surface:"floor",id:paintRef.current.finishId,gx,gy})){recordEdit();sfxRef.current?.play("bus");}
          return;
        }
        if(paintRef.current.tool==="wall")return;
        if (view && (view.ghostItemId || view.liftUid >= 0)) {
          const itemId = view.ghostItemId || world.layout.find((q) => q.uid === view.liftUid)?.itemId;
          if (!itemId) return;
          if (p.facing) { view.facing = p.facing; setGhostFacing(p.facing); }
          view.gx=gx;view.gy=gy;
          const why=previewPlace(world,roomRef.current,itemId,gx,gy,view.liftUid>=0?view.liftUid:undefined,view.facing);
          view.valid=!why;setPendingPlacement({gx,gy});setEditError(why);
          return;
        }
        /**
         * Nothing in hand: lift whatever is under the tap.
         *
         * Select the visible sprite. Lifting by tile alone could not pick up
         * anything tall: a table is drawn from the bottom of its tile and
         * stands about a tile and a half high, so aiming at the tabletop
         * resolved to the tile BEHIND it and lifted the chair sitting there,
         * while the table's own floor tile was hidden underneath the table.
         * Transparent canvas and bare floor do not select a neighboring piece.
         * Footprints validate placement; they are not the visible hit target.
         */
        const bySprite = scene.pickItem(clientX - hostRef.current!.getBoundingClientRect().left,
          clientY - hostRef.current!.getBoundingClientRect().top);
        const hit = world.layout.find((q) => q.uid === bySprite);
        (window as unknown as Record<string, unknown>).__lastEdit = { branch: "liftTry", hitUid: hit ? hit.uid : -1, gx, gy };
        if (hit) {
          setLiftUid(hit.uid);
          setGhostFacing(hit.facing);
          setPendingPlacement(null);
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
      if(bestToilet&&AUTHORITY_ENABLED&&cloudRef.current.wallet){
        void runCommandRef.current({type:"repair"}).then(j=>{if(j)applyAction(world,roomRef.current,{type:"fixToilet",uid:bestToilet});});return;
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
        if(AUTHORITY_ENABLED&&cloudRef.current.wallet){void runCommandRef.current({type:"repair"}).then(j=>{if(j)applyAction(world,roomRef.current,{type:"sweep",trashId:bestTrash});});return;}
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

  const syncAuthority = useCallback((j: KitchenSnapshot) => {
    const latest = cloudRef.current.authorityRef.current;
    if (latest && j.revision < latest.revision) return;
    const w=worldRef.current; if(!w)return;
    const save=j.save;
    onboardingRef.current = save.onboarding;
    deliveryRef.current = save.delivery;
    setGoalDishId(save.onboarding.goalDishId);
    setIntroBoth(onboardingStep(save.onboarding, save.delivery));
    const preserveDraft=w.editing&&!editSavingRef.current;
    const before=JSON.stringify(w.layout.map(({uid,itemId,gx,gy,facing})=>({uid,itemId,gx,gy,facing})));
    const shellChanged=w.shellIdx!==save.shell;
    if(!preserveDraft&&(before!==JSON.stringify(save.layout)||shellChanged)){
      const wasEditing=w.editing;
      const fresh=createWorld("domain-kitchen-m4",shellAt(save.shell),{layout:save.layout,hires:{waiters:save.waiters,chefs:save.chefs},playMoney:save.coins,inventory:save.inventory,design:save.design,maintenance:save.maintenance,pantry:save.pantry,menu:save.menu,market:save.market,lpDays:save.lpDays,shellIdx:save.shell,courses:save.courses,daily:save.daily,launch:save.launch,truck:save.truck,equipment:save.equipment,careJobsActive:save.onboarding.finished,utcDay:save.utcDay,regulars:save.regulars,bestQuality:save.bestQuality});
      Object.assign(w,fresh);
      if(wasEditing)applyAction(w,shellAt(save.shell),{type:"edit",on:true});
    }
    w.playMoney=save.coins;w.coinFloat=0;w.pantry={...w.pantry,...structuredClone(save.pantry)};
    if(!preserveDraft){w.inventory={...save.inventory};w.design=structuredClone(save.design);}
    w.hires={waiters:save.waiters,chefs:save.chefs};w.maintenance={...save.maintenance};
    w.truck=structuredClone(save.truck);w.equipment=structuredClone(save.equipment);renderTruck(n=>n+1);
    w.menu={...w.menu,...structuredClone(save.menu)};
    for(const dish of w.menu.dishes)dish.serves=save.menu.serves[dish.key]??0;
    w.daily={...save.daily};applyCanonicalLaunch(w,save.launch);w.utcDay=save.utcDay;w.courses=[...save.courses];w.lpDays={...save.lpDays};w.market=save.market;
    if(!preserveDraft)roomRef.current=shellAt(save.shell);
    if(!preserveDraft&&shellChanged&&appRef.current&&assetsRef.current&&hostRef.current){sceneRef.current?.destroy();sceneRef.current=buildScene(appRef.current,roomRef.current,assetsRef.current,save.theme as ThemeId);sceneRef.current.resize(hostRef.current.clientWidth,hostRef.current.clientHeight,insetRef.current.top,insetRef.current.bottom);}
    setRoomTitle(save.name);roomTitleRef.current=save.name;setCrew(save.crew);crewRef.current=save.crew;setTheme(save.theme as ThemeId);themeRef.current=save.theme as ThemeId;setMarketId(save.market);
    sceneRef.current?.setTheme(save.theme as ThemeId);sceneRef.current?.setCrew(save.crew);sceneRef.current?.setSign(save.name);
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{}
  },[]);
  const syncAuthorityRef=useRef(syncAuthority);syncAuthorityRef.current=syncAuthority;
  const runCommand=useCallback(async(command:KitchenCommand)=>{
    if(command.type==="settle"&&truckOwnsPrediction())return null;
    const j=await cloudRef.current.command(command);
    // A home settlement already in flight can return after the truck opens.
    // Its canonical data is retained by the hook, then included in the next
    // truck receipt; it must not erase the truck's predicted input tape now.
    if(j&&!(command.type==="settle"&&truckOwnsPrediction()))syncAuthorityRef.current(j);
    if(!j?.ok){
      if(j&&worldRef.current?.editing&&editSavingRef.current){beginHistory();setHoldItem("");setLiftUid(-1);setEditError("Your restaurant changed on another device. Review the updated room before decorating again.");}
      return null;
    }
    if(command.type!=="settle")sfxRef.current?.play("kaching");
    return j;
  },[]);
  runCommandRef.current=runCommand;
  const authoritative=()=>AUTHORITY_ENABLED&&!!cloudRef.current.wallet;
  const saveGuestProgress=useCallback(()=>{
    const w=worldRef.current;if(!w||authoritative())return;
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(serializeSave(w,themeRef.current,crewRef.current,introRef.current,roomTitleRef.current,{onboarding:onboardingRef.current,delivery:deliveryRef.current})));}catch{}
  },[]);
  const applyTruckLocal=useCallback((action:TruckAction)=>{
    const w=worldRef.current;if(!w)return false;
    const result=dispatchTruck(w.truck,action,{coins:w.playMoney,recipeLevels:w.pantry.levels});
    if(result.error){if(action.type!=="tick")setTruckError(result.error);return false;}
    w.truck=result.truck;
    // Connected prediction animates the truck, but spendable currency and home
    // equipment stay at the latest confirmed receipt until the server replies.
    if(!authoritative()){
      w.playMoney+=result.coinDelta;
      for(const [id,n] of Object.entries(result.homeGrants))w.inventory[id]=(w.inventory[id]??0)+n;
      for(const [id,n] of Object.entries(result.stockGrants))w.pantry.stock[id]=(w.pantry.stock[id]??0)+n;
    }
    renderTruck(n=>n+1);return true;
  },[]);
  const flushTruck=useCallback(async(drain=false):Promise<boolean>=>{
    if(!authoritative())return true;
    if(truckFlightRef.current){
      const confirmed=await truckFlightRef.current;
      return confirmed&&drain?flushTruckRef.current(true):confirmed;
    }
    const outstanding=cloudRef.current.pendingCommand();
    const retry=isTruckCommand(outstanding)?outstanding:null;
    if(!retry&&!truckActionsRef.current.length)return !truckUncertainRef.current;
    const command:KitchenCommand=retry??{type:"truckBatch",actions:takeTruckBatch(truckActionsRef.current)};
    truckSendingRef.current=true;setTruckBusy(true);
    const owner=cloudRef.current.wallet;
    const flight=(async()=>{
      try{
        const response=await cloudRef.current.command(command);
        if(owner!==cloudRef.current.wallet){truckActionsRef.current=[];truckUncertainRef.current=false;return false;}
        const canonical=response?.save?response:cloudRef.current.authorityRef.current;
        if(canonical)syncAuthorityRef.current(canonical);
        if(response?.ok){
          truckUncertainRef.current=false;
          if(response.authority.truckClock?.pausedForAbsence){
            truckActionsRef.current=[];
            setTruckError("Your connection paused the truck. Resume when you are ready.");
          }else{
            // Canonical state already includes the submitted tape. Replay only
            // the unsent suffix, retaining that suffix for its own receipt.
            const queued=[...truckActionsRef.current];
            truckActionsRef.current=[];
            for(const action of queued){
              if(action.type==="tick"&&worldRef.current?.truck.run?.phase!=="playing")continue;
              if(!applyTruckLocal(action))break;
              truckActionsRef.current.push(action);
            }
            if(!truckActionsRef.current.length)setTruckError("");
          }
          return true;
        }
        truckActionsRef.current=[];
        truckUncertainRef.current=isTruckCommand(cloudRef.current.pendingCommand());
        // The last confirmed snapshot replaces speculative coins/equipment.
        // A pending envelope remains in the hook until the same ID is resolved.
        const w=worldRef.current;if(truckUncertainRef.current&&w?.truck.run?.phase==="playing")w.truck.run.phase="paused";
        setTruckError(response?.error??(truckUncertainRef.current?"Your connection paused. Press Resume to confirm the pending trip first.":"That action was refused. Your last confirmed truck has been restored."));
        return false;
      }finally{truckSendingRef.current=false;truckFlightRef.current=null;setTruckBusy(false);renderTruck(n=>n+1);}
    })();
    truckFlightRef.current=flight;
    const confirmed=await flight;
    return confirmed&&drain&&truckActionsRef.current.length?flushTruckRef.current(true):confirmed;
  },[applyTruckLocal]);
  flushTruckRef.current=flushTruck;
  const onTruckAction=useCallback((action:TruckAction)=>{
    const w=worldRef.current;if(!w)return;
    if(action.type==="tick"&&w.truck.run?.phase!=="playing")return;
    if(authoritative()&&(truckUncertainRef.current||(!truckSendingRef.current&&isTruckCommand(cloudRef.current.pendingCommand())))){
      if(action.type!=="tick")void flushTruckRef.current(true);
      return;
    }
    if(authoritative()&&action.type==="tick"&&truckActionsRef.current.reduce((sum,input)=>sum+(input.type==="tick"?input.ticks:0),0)+action.ticks>80){
      // Stop optimistic play before a delayed response can create an oversized
      // backlog. The pause itself is ordered after the already-predicted ticks.
      if(w.truck.run?.phase==="playing"&&applyTruckLocal({type:"pause"}))truckActionsRef.current.push({type:"pause"});
      setTruckError("Saving your trip. Service is paused until these actions are confirmed.");
      void flushTruckRef.current(true);return;
    }
    if(action.type==="pause"&&w.truck.run?.phase!=="playing")return;
    if(!applyTruckLocal(action))return;
    if(action.type!=="tick")setTruckError("");
    if(authoritative()){
      const previous=truckActionsRef.current[truckActionsRef.current.length-1];
      if(action.type==="tick"&&previous?.type==="tick"&&previous.ticks+action.ticks<=80)previous.ticks+=action.ticks;
      else truckActionsRef.current.push(action);
      // Movement/interactions are sent in the one-second tape, rather than a
      // request per keypress. Lifecycle and between-service purchases flush now.
      if(!["tick","move","moveTo","interact","discard"].includes(action.type))void flushTruckRef.current();
    }else if(action.type!=="tick")saveGuestProgress();
  },[applyTruckLocal,saveGuestProgress]);
  const prepareTruckExit=useCallback(async()=>{
    if(worldRef.current?.truck.run?.phase==="playing")onTruckAction({type:"pause"});
    if(!await flushTruckRef.current(true))return false;
    // A recovered uncertain tape may have restored a still-running service.
    if(worldRef.current?.truck.run?.phase==="playing"){
      onTruckAction({type:"pause"});if(!await flushTruckRef.current(true))return false;
    }
    saveGuestProgress();return true;
  },[onTruckAction,saveGuestProgress]);
  useEffect(()=>{
    if(openSheet!=="truck")return;
    const interval=window.setInterval(()=>{if(authoritative())void flushTruckRef.current();else saveGuestProgress();},1000);
    return ()=>{window.clearInterval(interval);void flushTruckRef.current(true);};
  },[openSheet,saveGuestProgress]);
  const onCareTask=useCallback(async(taskId:string)=>{
    const w=worldRef.current;if(!w||careBusyRef.current||w.editing)return;
    const task=w.launch.careTasks.find(entry=>entry.id===taskId);
    if(!task||task.progress>=task.steps)return;
    careBusyRef.current=true;setCareBusy(true);
    try{
      const ok=authoritative()?!!await runCommand({type:"careTask",taskId}):applyAction(w,roomRef.current,{type:"careTask",taskId});
      if(ok){
        saveGuestProgress();
        sceneRef.current?.spark(task.target.gx,task.target.gy,task.kind==="repair"?0xa2d2d5:0xe8d99c,8);
        sfxRef.current?.play("bus");
        if(w.launch.careTasks.find(entry=>entry.id===taskId)?.progress===task.steps)setToast(task.kind==="repair"?"All fixed. Good as new.":"Spotless. That looks better.");
      }
      await new Promise(resolve=>setTimeout(resolve,LAUNCH_RULES.careStepCooldownMs));
    }finally{careBusyRef.current=false;setCareBusy(false);}
  },[runCommand,saveGuestProgress]);
  const onClaimDailyGoal=useCallback(async(goalId:LaunchGoalId)=>{
    const w=worldRef.current;if(!w||careBusyRef.current)return;
    careBusyRef.current=true;setCareBusy(true);
    try{
      const hadBonus=w.launch.shiftClaimed;
      const ok=authoritative()?!!await runCommand({type:"claimDailyGoal",goalId}):applyAction(w,roomRef.current,{type:"claimDailyGoal",goalId});
      if(ok){saveGuestProgress();sfxRef.current?.play("kaching");setToast(!hadBonus&&w.launch.shiftClaimed?"Daily bonus! Coins and a rare ingredient for your next recipe.":"Job done. Coins and an ingredient added.");}
    }finally{careBusyRef.current=false;setCareBusy(false);}
  },[runCommand,saveGuestProgress]);
  const onDailyAction=useCallback((goalId:LaunchGoalId)=>{
    if(goalId==="care"){
      showSheet(null);sceneRef.current?.resetCamera();
      const task=worldRef.current?.launch.careTasks.find(entry=>entry.progress<entry.steps);
      if(task){careButtons.current.get(task.id)?.focus({preventScroll:true});setToast(careLabel(task)+". Tap the mess to work on it.");}
    }else if(goalId==="serve"){showSheet(null);setToast("Your crew is serving. Keep their paths clear and their kitchen cared for.");}
    else {setCookFocusSpecial(goalId==="prep"||goalId==="special");showSheet(goalId==="decorate"?"shop":"menu");}
  },[showSheet]);
  useEffect(()=>{if(cloud.error)setToast(cloud.error);},[cloud.error]);
  useEffect(()=>{
    if(!AUTHORITY_ENABLED||cloud.status!=="on"||phase!=="ready")return;
    let cancelled=false;
    void cloud.load().then(async(save)=>{if(!save||cancelled||truckOwnsPrediction())return;await runCommand({type:"settle"});});
    const id=setInterval(()=>{if(document.visibilityState!=="hidden"&&!worldRef.current?.editing&&!truckOwnsPrediction())void runCommand({type:"settle"});},15000);
    return()=>{cancelled=true;clearInterval(id);};
  },[cloud.status,phase,cloud.load,runCommand]);

  const onClaimDelivery = useCallback(async () => {
    const w = worldRef.current;
    if (!w || deliveryBusyRef.current) return;
    deliveryBusyRef.current = true;
    setDeliveryBusy(true);
    const before = { ...w.pantry.stock };
    try {
      let next: DkSave | null;
      if (authoritative()) {
        const result = await runCommand({ type: "claimDaily" });
        next = result?.save ?? null;
      } else {
        const saved = serializeSave(w, themeRef.current, crewRef.current, introRef.current, roomTitleRef.current, { onboarding: onboardingRef.current, delivery: deliveryRef.current });
        next = claimGuestDelivery(saved, Date.now());
        if (next) {
          // Write the receipt and its contents together before showing the reward.
          try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); }
          catch { setToast("Your browser could not keep this parcel. Make room in browser storage and try again."); return; }
          w.pantry.stock = { ...next.pantry.stock };
          deliveryRef.current = next.delivery;
          updateOnboarding(next.onboarding);
        }
      }
      if (!next) { setToast(cloudRef.current.error || "Today's parcel has already been opened."); return; }
      const contents: Record<string, number> = {};
      for (const [id, quantity] of Object.entries(next.pantry.stock)) {
        const added = quantity - (before[id] ?? 0);
        if (added > 0) contents[id] = added;
      }
      setDeliveryReveal(contents);
      sfxRef.current?.play("unlock");
      setIntroBoth(onboardingStep(onboardingRef.current, deliveryRef.current));
    } finally { deliveryBusyRef.current = false; setDeliveryBusy(false); }
  }, [runCommand, updateOnboarding, setIntroBoth]);

  const onChooseGoal = useCallback(async (id: string) => {
    const w = worldRef.current;
    if (!w || !availableDishes(w).some(d => d.id === id)) return;
    if (authoritative()) {
      const j = await runCommand({ type: "appearance", appearance: { onboarding: { goalDishId: id } } });
      if (!j) return;
    } else updateOnboarding({ goalDishId: id, upgraded: (w.pantry.levels[id] ?? 1) > 1 });
    setToast(`${dishDef(id)?.name ?? "This recipe"} is your next kitchen goal.`);
  }, [runCommand, updateOnboarding]);

  const onDials = useCallback((parkedUsd: number, volumeUsd: number) => {
    const world = worldRef.current;
    if (!world) return;
    applyAction(world, roomRef.current, { type: "dials", parkedUsd, weeklyVolumeUsd: volumeUsd });
  }, []);

  const onUpgradeDish = useCallback((key: string) => {
    if(authoritative()){void runCommand({type:"upgradeDish",dishId:key}).then(j=>{if(j){setToast("A new recipe level. Your kitchen has something to celebrate.");if(onboardingStep(j.save.onboarding,j.save.delivery)===5)showSheet(null);}});return;}
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "upgradeDish", key })) {
      const goal = onboardingRef.current.goalDishId ?? key;
      updateOnboarding({ upgraded: (world.pantry.levels[goal] ?? 1) > 1, goalDishId: goal });
      sfxRef.current?.play("unlock");
      setToast("The kitchen learned to cook that one better.");
      if (onboardingStep(onboardingRef.current, deliveryRef.current) === 5) showSheet(null);
    }
  }, []);

  const onPrepSpecial = useCallback(() => {
    if(authoritative()){void runCommand({type:"prepSpecial"});return;}
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
    if(authoritative()){void runCommand({type:"expand"});return;}
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
    if(authoritative()){void runCommand({type:"appearance",appearance:{market:id}});return;}
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "market", id })) {
      setMarketId(id);
      sfxRef.current?.play("unlock");
      setToast(`Now sourcing from ${id}. Everything you built stays put.`);
    }
  }, []);

  const onBuyHire = useCallback((hire: HireKind) => {
    if(authoritative()){void runCommand({type:"hire",hire});return;}
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "buyHire", hire })) {
      sfxRef.current?.play("kaching");
      sceneRef.current?.spark(world.door.x, world.door.y, 0xf3c86a, 10);
    }
  }, []);

  const onBuyItem = useCallback((itemId: string) => {
    if(authoritative()){void runCommand({type:"purchase",itemId});return;}
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, roomRef.current, { type: "buyItem", itemId })) {
      sfxRef.current?.play("kaching");
      setToast(`${itemDef(itemId)?.label ?? "It"} is in your storage. Open Decorate to place it.`);
    }
  }, []);

  const onSellItem = useCallback((itemId: string) => {
    if(authoritative()){void runCommand({type:"sell",itemId});return;}
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
    if (!world || (world.inventory[itemId] ?? 0) < 1) return;
    if (!world.editing) {
      if (!applyAction(world, roomRef.current, { type: "edit", on: true })) return;
      setEditing(true);
      beginHistory();
      setOpenSheet(null);
    }
    setHoldItem(itemId);
    setLiftUid(-1);
    setEditError("");
    setGhostFacing("se");
    sfxRef.current?.play("unlock");
  }, []);

  const toggleEdit = useCallback(() => {
    const world = worldRef.current;
    if (!world||editSavingRef.current) return;
    const next = !world.editing;
    if(next)beginHistory();
    else if(authoritative()){
      const latest=cloudRef.current.authorityRef.current;
      editSavingRef.current=true;setEditSaving(true);
      const pending=cloudRef.current.pendingCommand();
      if(pending?.type!=="layout"&&latest&&editServerBase.current!==JSON.stringify({layout:latest.save.layout,design:latest.save.design,shell:latest.save.shell})){
        syncAuthorityRef.current(latest);beginHistory();setHoldItem("");setLiftUid(-1);
        setEditError("Your restaurant changed on another device. The updated room is ready to review.");
        editSavingRef.current=false;setEditSaving(false);return;
      }
      void runCommand(pending?.type==="layout"?pending:{type:"layout",layout:world.layout.map(({uid,itemId,gx,gy,facing})=>({uid,itemId,gx,gy,facing})),design:world.design}).then(j=>{
        if(j){applyAction(world,roomRef.current,{type:"edit",on:false});setEditing(false);setHoldItem("");setLiftUid(-1);setPendingPlacement(null);}
        else setEditError(cloudRef.current.error||"The room could not be saved. Your changes are here; reconnect and try Done again.");
      }).finally(()=>{editSavingRef.current=false;setEditSaving(false);setEditUncertain(cloudRef.current.pendingCommand()?.type==="layout");});return;
    }
    const base = editHistory.current[0];
    const visualState = (value: EditSnapshot) => JSON.stringify({ layout: value.layout.map(({itemId,gx,gy,facing}) => ({itemId,gx,gy,facing})), design: value.design });
    const changed = !next && !!base && visualState(base) !== visualState({ layout: world.layout, design: world.design });
    setOpenSheet(null);
    if (applyAction(world, roomRef.current, { type: "edit", on: next })) {
      if (!next) {
        const progress = changed ? { ...onboardingRef.current, decorated: true } : onboardingRef.current;
        const saved = serializeSave(world, themeRef.current, crewRef.current, onboardingStep(progress, deliveryRef.current), roomTitleRef.current, { onboarding: progress, delivery: deliveryRef.current });
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); }
        catch {
          applyAction(world, roomRef.current, { type: "edit", on: true });
          setEditError("This browser could not save your changes. Make room in browser storage and try Done again.");
          return;
        }
        updateOnboarding(progress);
        if (changed) setToast("A little more you. Your changes are saved.");
      }
      setEditing(next);
      setHoldItem("");
      setLiftUid(-1);
      setEditError("");
      sfxRef.current?.play("unlock");
    }
  }, []);

  const deliveryAvailable = authoritative()
    ? cloud.authorityRef.current?.authority.dailyClaimed === false
    : !deliveryRef.current.welcomeClaimed || deliveryRef.current.claimedDay < Math.floor(Date.now() / 86_400_000);
  const openDelivery = () => { setDeliveryReveal(null); showSheet("delivery"); };
  const finishIntro = () => { updateOnboarding({ finished: true }, true); showSheet(null); };
  const onCoachAction = () => {
    if (intro === 1) {
      sceneRef.current?.resetCamera();
      setToast("Your crew has this. Tap the chef if you'd like to help.");
    } else if (intro === 2) {
      toggleEdit();
      setToast("Move your plant, change a floor finish, or choose an awning. Tap Done to keep it.");
    } else if (intro === 3) openDelivery();
    else if (intro === 4) showSheet("menu");
    else { updateOnboarding({ finished: true }, true); showSheet("account"); }
  };

  const onSaveAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      const w = worldRef.current;
      if (w && !cloudRef.current.wallet) {
        guestDesignRef.current = serializeSave(w, themeRef.current, crewRef.current, introRef.current, roomTitleRef.current, { onboarding: onboardingRef.current, delivery: deliveryRef.current });
        try { localStorage.setItem("dk_guest_before_connect", JSON.stringify(guestDesignRef.current)); } catch {}
      }
      await cloudRef.current.signIn();
      const saved = await cloudRef.current.load();
      const current = cloudRef.current.authorityRef.current;
      if (AUTHORITY_ENABLED && current) syncAuthority(current);
      else if (saved) { persistLocalNow(); setToast("Your restaurant account is connected."); }
    } finally { setAccountBusy(false); }
  };

  const shareKitchen = async () => {
    const app = appRef.current;
    if (!app || !snap) return;
    try {
      const wallet = cloudRef.current.wallet;
      const handle = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : undefined;
      const visitUrl = handle ? `${window.location.origin}/chef/visit/${encodeURIComponent(handle)}` : `${window.location.origin}/chef`;
      const blob = await makePostcard(app, app.stage, { name: roomTitleRef.current, tier: snap.tier });
      const how = await sharePostcard(blob, roomTitleRef.current, visitUrl);
      setToast(how === "shared" ? "Your postcard is ready to visit." : how === "cancelled" ? "Postcard kept here." : "Postcard saved. Copy your visit link to share alongside it.");
    } catch { setToast("The postcard did not come out. Try again in a moment."); }
  };

  return (
    <div className={css.game}
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "#f4eddf",
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
          visibility: openSheet==="truck"?"hidden":"visible",
          pointerEvents: openSheet==="truck"?"none":"auto",
        }}
      />
      {phase === "ready" && toast && (
        <div
          style={{
            position: "absolute",
            top: editing ? 82 : 176,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,252,243,0.97)",
            border: "1px solid #e8a13d",
            borderRadius: 999,
            color: "#3c392c",
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 700,
            padding: "8px 16px",
            zIndex: 45,
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
            onSkip={finishIntro}
            onAction={onCoachAction}
            busy={deliveryBusy || accountBusy}
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
          {!editing && openSheet!=="truck" && <RestaurantHUD name={roomTitle} snap={snap} active={openSheet} onOpen={(id) => {setCookFocusSpecial(false);showSheet(id as SheetId);}} onDecorate={()=>showSheet("shop")} onSound={() => showSheet("more")} />}
          {openSheet==="truck"&&worldRef.current&&<FoodTruck truck={worldRef.current.truck} coins={worldRef.current.playMoney} restaurantName={roomTitle} busy={truckBusy} error={truckError} confirmedDiscoveries={authoritative()?cloud.authorityRef.current?.save.truck.firstClears??[]:undefined} onSound={name=>sfxRef.current?.play(name)} onAction={onTruckAction} onHome={()=>{void (async()=>{if(await prepareTruckExit())showSheet(null);})();}} onPlaceHome={(itemId)=>{void (async()=>{if(!await prepareTruckExit())return;if((worldRef.current?.inventory[itemId]??0)<1){setTruckError("This equipment is already placed at home. Store it there before moving it.");return;}showSheet(null);onPlaceItem(itemId);})();}}/>}
          {!editing&&!openSheet&&intro===INTRO_DONE&&worldRef.current&&<>
            {worldRef.current.launch.careTasks.filter(task=>task.progress<task.steps).map(task=><CareSpot key={task.id} task={task} busy={careBusy} onCare={()=>void onCareTask(task.id)} buttonRef={node=>{if(node)careButtons.current.set(task.id,node);else careButtons.current.delete(task.id);}}/>)}
            <DailyRibbon world={worldRef.current} busy={careBusy} onClaim={id=>void onClaimDailyGoal(id)} onAction={onDailyAction}/>
          </>}
          {!editing && !openSheet && deliveryAvailable && (intro >= 3 || intro === INTRO_DONE) && <button ref={parcelButtonRef} className={css.secondary} onClick={openDelivery} aria-label="Open your ingredient delivery" style={{position:"absolute",left:"30%",top:"58%",transform:"translate(-50%, -50%)",zIndex:7,display:"grid",justifyItems:"center",padding:"5px 9px",background:"#fff9eb",border:"1px solid #d5b887",borderRadius:18,boxShadow:"0 4px 16px #79654624",minWidth:60,minHeight:60}}><ParcelArt size={46}/><span style={{fontSize:11}}>Delivery</span></button>}

          {/* ── the sheets ─────────────────────────────────────────────── */}
          {!editing && openSheet === "delivery" && <DeliveryParcel available={deliveryAvailable} busy={deliveryBusy} contents={deliveryReveal} onOpen={()=>void onClaimDelivery()} onClose={()=>{showSheet(null);setDeliveryReveal(null);}} onContinue={()=>{showSheet("menu");setDeliveryReveal(null);}} continueLabel="Choose a recipe"/>}
          {!editing && openSheet === "account" && <Sheet compact title="Save your kitchen" onClose={()=>showSheet(null)}>
            <div className={css.hero}><div className={css.eyebrow}>A place to come back to</div><h3>{roomTitle || "Your story starts here."}</h3><p>Your crew, your favorite corner, your next signature dish.</p></div>
            <div className={css.note}>{openingPreview ? "This opening-day preview has its own browser save. Your regular kitchen and connected account are untouched." : cloud.status === "on" ? "Your restaurant account is connected. Come back with the same wallet to open it on another device." : "Your restaurant is saved in this browser. Connect a wallet and sign in when you're ready to keep a restaurant across devices."}</div>
            {openingPreview && <div className={css.inlineActions}><Button onClick={()=>{localStorage.removeItem(SAVE_KEY);window.location.reload();}}>Restart opening preview</Button><a href="/chef" className={css.secondary}>Open my saved kitchen</a></div>}
            {!openingPreview && cloud.status !== "on" && <>
              {AUTHORITY_ENABLED && <p className={css.note}>Connected coins and ingredients are earned separately. For a new account, you can bring over a room design made with its starter furniture. A copy of this browser kitchen is kept before connecting.</p>}
              <div className={css.inlineActions}><ConnectButton showBalance={false} accountStatus="address" chainStatus="none"/><Button variant="primary" disabled={accountBusy||cloud.status==="signing"} onClick={()=>void onSaveAccount()}>{accountBusy ? "Opening your account…" : "Sign in to save"}</Button></div>
              <p className={css.note}>Signing in proves this wallet is yours. It does not stake tokens or spend funds.</p>
            </>}
            {cloud.error && <p role="alert" className={css.error}>{cloud.error}</p>}
            {cloud.authorityRef.current?.authority.canImportGuestDesign && guestDesignRef.current && <div className={css.note}><strong>Bring your corner with you.</strong><p>Use your browser kitchen's name, finishes, and starter furniture arrangement. Your connected rewards stay with this account.</p><Button disabled={accountBusy} onClick={()=>{const design=guestDesignRef.current;if(!design)return;setAccountBusy(true);void runCommand({type:"adoptGuestDesign",layout:design.layout,design:design.design,appearance:{name:design.name,theme:design.theme,crew:design.crew}}).then(j=>{if(j){guestDesignRef.current=null;setToast("Your room design is here. Welcome home.");}}).finally(()=>setAccountBusy(false));}}>Use this room design</Button></div>}
            {guestDesignRef.current && cloud.wallet && <MoreRow icon={<IconChevron/>} label="Return to my browser kitchen" hint="Open the local copy kept before connecting. Your connected restaurant stays saved." onClick={()=>{const copy=guestDesignRef.current;if(!copy)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(copy));cloud.signOut();window.location.reload();}catch{setToast("Your browser could not restore the saved copy.");}}}/>}
            <Button full variant="primary" onClick={()=>showSheet(null)}>Back to my kitchen</Button>
          </Sheet>}
          {!editing && (openSheet === "frontier" || openSheet === "learn") && <Sheet title="About Domain Kitchen" onClose={()=>showSheet(null)}>
            <div className={css.hero}><div className={css.eyebrow}>Your restaurant. Your food truck.</div><h3>Bring something wonderful home.</h3><p>Cook your way across the neighborhood, discover new machines, and build a restaurant worth visiting.</p></div>
            <p className={css.note}>Everything you earn stays yours when a trip ends. Place your discoveries at home and your crew starts serving their dishes.</p>
            <p className={css.note}>Kitchen coins are game currency. Optional token events open only after their reward pool and player eligibility are confirmed.</p>
            <Button full variant="primary" onClick={()=>showSheet("truck")}>Visit my food truck</Button>
            <a className={css.textButton} href="https://web3guides.com/domain-kitchen" target="_blank" rel="noopener noreferrer">How to play</a>
          </Sheet>}
          {!editing && openSheet === "shop" && (
            <Sheet title="Decorate" onClose={() => showSheet(null)}>
              <ShopCatalog unlockedMachines={worldRef.current?.truck.unlockedMachineIds} onArrange={()=>{showSheet(null);toggleEdit();}} expansion={worldRef.current?<ExpansionCard world={worldRef.current} onExpand={onExpand} onCook={()=>showSheet("menu")}/>:undefined} featuredOnly={authoritative()} eligibleMarkets={cloud.authorityRef.current?.authority.eligibleMarkets} featured={cloud.authorityRef.current?.featured??featuredItems(Date.now())} ingredientOffers={cloud.authorityRef.current?.ingredientOffers??[]} onBuyIngredient={(ingredientId)=>{void runCommand({type:"purchaseIngredient",ingredientId});}} snap={snap} theme={theme} onBuyHire={onBuyHire} onBuyItem={onBuyItem} onSellItem={onSellItem} onPlaceItem={onPlaceItem} onExpand={onExpand} />            </Sheet>
          )}

          {!editing && openSheet === "more" && (
            <Sheet compact title="Settings" onClose={() => showSheet(null)}>
              <div className={css.settingsOptions}>
                <button className={css.secondary} aria-pressed={!muted} onClick={()=>{const next=!muted;setMuted(next);sfxRef.current?.setEffectsMuted(next);try{localStorage.setItem(MUTE_KEY,next?"1":"0");}catch{}}}>Sounds <strong>{muted?"Off":"On"}</strong></button>
                <button className={css.secondary} aria-pressed={!musicMuted} onClick={()=>{const next=!musicMuted;setMusicMuted(next);sfxRef.current?.setMusicMuted(next);try{localStorage.setItem("dk_music_muted",next?"1":"0");}catch{}}}>Music <strong>{musicMuted?"Off":"On"}</strong></button>
              </div>
              <Button full onClick={()=>showSheet("account")}>{cloud.status==="on"?"Your saved kitchen":"Save your kitchen"}</Button>
              <button className={css.textButton} onClick={()=>showSheet("frontier")}>About Domain Kitchen</button>
            </Sheet>
          )}

          {!editing && openSheet === "friends" && <Sheet title="Your neighborhood" onClose={()=>showSheet(null)}><button className={css.secondary} onClick={()=>void shareKitchen()}><IconCamera size={18}/>Make a restaurant postcard</button><FriendsPanel cloud={cloud} onAccount={()=>showSheet("account")} onChanged={syncAuthority}/></Sheet>}
          {!editing && openSheet === "name" && (
            <Sheet compact title="Name your place" onClose={() => showSheet(null)}>
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
                  if(authoritative())void runCommand({type:"appearance",appearance:{name:roomTitleRef.current}});
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

          {editing&&editUncertain&&<div role="status" style={{position:"absolute",top:84,left:14,right:14,zIndex:12,padding:12,background:"#fff9e9",border:"1px solid #d8b36a",borderRadius:12,textAlign:"center"}}><p style={{margin:"0 0 8px"}}>Your room may already be saved. Confirm the result before making more changes.</p><Button disabled={editSaving} onClick={cloud.status==="error"?()=>{void cloud.signIn();}:toggleEdit}>{cloud.status==="error"?"Reconnect to confirm":"Confirm save"}</Button></div>}
          {editing && worldRef.current && <fieldset disabled={editSaving||editUncertain} style={{border:0,padding:0,margin:0}} aria-busy={editSaving}><DecorEditor key={editSession}
            world={worldRef.current} theme={theme} holdingItemId={holdItem} liftUid={liftUid} error={editError}
            canUndo={editCursor.current>0} canRedo={editCursor.current<editHistory.current.length-1}
            onUndo={()=>restoreEdit(editCursor.current-1)} onRedo={()=>restoreEdit(editCursor.current+1)}
            onDone={toggleEdit} onCancel={()=>{if(editSavingRef.current)return;restoreEdit(0);const w=worldRef.current;if(w){applyAction(w,roomRef.current,{type:"edit",on:false});const latest=cloudRef.current.authorityRef.current;if(authoritative()&&latest)syncAuthority(latest);else persistLocalNow();}setEditing(false);setHoldItem("");setLiftUid(-1);setPendingPlacement(null);}}
            onPickItem={(id)=>{paintRef.current.tool="furniture";setHoldItem(id);setLiftUid(-1);setGhostFacing("se");setPendingPlacement(null);setEditError("");}}
            onRotate={()=>{const order:Facing[]=["se","sw","nw","ne"];setGhostFacing(order[(order.indexOf(ghostFacing)+1)%4]);setEditError("");}}
            onStore={()=>{const w=worldRef.current;if(w&&liftUid>=0&&applyAction(w,roomRef.current,{type:"store",uid:liftUid})){recordEdit();setLiftUid(-1);setPendingPlacement(null);setEditError("");}}}
            onClearHold={()=>{setHoldItem("");setLiftUid(-1);setPendingPlacement(null);setEditError("");}}
            onFinish={(surface,id,gx,gy,side,index)=>{const w=worldRef.current;if(w&&applyAction(w,roomRef.current,{type:"finish",surface,id,gx,gy,side,index})){recordEdit();}}}
            onStorefront={(awning)=>{const w=worldRef.current;if(w&&applyAction(w,roomRef.current,{type:"storefront",awning}))recordEdit();}}
            onTool={(tool,finishId)=>{paintRef.current={tool,finishId:finishId??"cream"};setHoldItem("");setLiftUid(-1);setPendingPlacement(null);}}
            onRoutes={setRoutes} canConfirm={!!pendingPlacement&&!editError&&(!!holdItem||liftUid>=0)}
            onConfirm={()=>{const w=worldRef.current,view=editRef.current;if(!w||!view||!pendingPlacement)return;const {gx,gy}=pendingPlacement;const ok=liftUid>=0?applyAction(w,roomRef.current,{type:"move",uid:liftUid,gx,gy,facing:ghostFacing}):applyAction(w,roomRef.current,{type:"place",itemId:holdItem,gx,gy,facing:ghostFacing});if(ok){recordEdit();sfxRef.current?.play("kaching");setHoldItem("");setLiftUid(-1);setPendingPlacement(null);setEditError("");}else setEditError("That piece needs a clear spot and a path to the door.");}}
          /></fieldset>}
          {openSheet === "crew" && (
            <CrewModal
              crew={crew}
              looks={CREW_LOOKS}
              nameMax={CHEF_NAME_MAX}
              onPick={(next) => {
                if(authoritative())void runCommand({type:"appearance",appearance:{crew:next}});
                setCrew(next);
                sceneRef.current?.setCrew(next);
                sfxRef.current?.play("unlock");
              }}
              onName={(name) => {
                const next = { ...crewRef.current, chefName: name };
                setCrew(next);
                sceneRef.current?.setCrew(next);
              }}
              onClose={() => {if(authoritative())void runCommand({type:"appearance",appearance:{crew:crewRef.current}});showSheet("more");}}
            />
          )}
          {openSheet === "style" && (
            <StyleModal
              theme={theme}
              onPick={(t) => {
                if(authoritative())void runCommand({type:"appearance",appearance:{theme:t}});
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
          {openSheet === "menu" && worldRef.current && (
            <Cookbook focusSpecial={cookFocusSpecial} world={worldRef.current!} goalDishId={goalDishId} onChooseGoal={(id)=>void onChooseGoal(id)} introMode={intro === 4} deliveryAvailable={deliveryAvailable} deliveryBusy={deliveryBusy} onDelivery={openDelivery} onUpgrade={onUpgradeDish} onSelect={(keys) => { const w=worldRef.current; if(w) { if(authoritative())void runCommand({type:"selectMenu",dishes:keys}); else applyAction(w,roomRef.current,{type:"selectMenu",keys}); } }} onPrep={()=>{onPrepSpecial();showSheet(null);}} onClose={() => showSheet(null)} />
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
          error={phase === "error" ? cloud.error || "boot" : undefined}
          recovery={phase==="error"&&AUTHORITY_ENABLED&&cloud.wallet?<div style={{display:"grid",gap:12,justifyItems:"center"}}><ConnectButton showBalance={false} accountStatus="address" chainStatus="none"/><Button onClick={()=>{void (async()=>{await cloud.signIn();const saved=await cloud.load();if(saved)window.location.reload();})();}}>Reconnect and open</Button></div>:undefined}
        />
      )}
    </div>
  );
}
