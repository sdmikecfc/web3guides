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
  incomePerHour,
  layoutForCounts,
  previewPlace,
  qualityOf,
  qualityParts,
  stepWorld,
  WORLD_FIXED_DT,
  type HireKind,
  type PlacedItem,
  type WorldState,
} from "./_engine/world";
import { itemDef } from "./_engine/items";
import { SHELL } from "./_engine/rooms";
import { loadGameAssets, THEME_IDS, type ThemeId } from "./_view/preload";
import { buildScene, type EditView, type Scene } from "./_view/scene";
import { createDkSfx, type DkSfx } from "./_view/sfx";
import { DialsPanel, ShopPanel, type PanelSnapshot } from "./DialsPanel";
import { BookModal, ChipBar, EditTray, MenuModal, StyleModal } from "./Chrome";
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
} from "./_engine/save";

const MAX_SUBSTEPS = 8;
const DPR_CAP = 2;
const SAVE_KEY = "dk_save_v2";
const OLD_SAVE_KEY = "dk_build_v1";
const MUTE_KEY = "dk_mute_v1";
const THEME_KEY = "dk_theme_v1";
const OFFLINE_GAME_HOURS_CAP = 6;

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

export default function GameStage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldState | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sfxRef = useRef<DkSfx | null>(null);
  const editRef = useRef<EditView | null>(null);
  const lastPushRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0.02);
  const [tipIdx, setTipIdx] = useState(0);
  const [snap, setSnap] = useState<PanelSnapshot | null>(null);
  const [dialsCollapsed, setDialsCollapsed] = useState(false);
  const [shopCollapsed, setShopCollapsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [academyOpen, setAcademyOpen] = useState(false);
  const [courses, setCourses] = useState<string[]>([]);
  const [theme, setTheme] = useState<ThemeId>("trattoria");
  const [editing, setEditing] = useState(false);
  const [holdItem, setHoldItem] = useState("");
  const [liftUid, setLiftUid] = useState(-1);
  const [editError, setEditError] = useState("");
  /** which way the piece in hand is turned (ADR-0104's Turn control) */
  const [ghostFacing, setGhostFacing] = useState<"se" | "sw">("se");
  const [lpCollapsed, setLpCollapsed] = useState(false);
  const [useLive, setUseLive] = useState(true);
  const [marketId, setMarketId] = useState<string>("software.ai");

  // the wallet's REAL liquidity at the current market (M5)
  const market = marketDef(marketId);
  const lp = useLpPositions(market?.token);
  // server-side saves (M6): optional, never a gate on playing
  const cloud = useCloudSave();
  const cloudRef = useRef(cloud);
  cloudRef.current = cloud;
  const themeRef = useRef<ThemeId>("trattoria");
  themeRef.current = theme;
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
    applyAction(world, SHELL, {
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

  // keep the scene's edit view in a ref the ticker can read every frame
  useEffect(() => {
    editRef.current = editing
      ? { liftUid, ghostItemId: holdItem, gx: -99, gy: -99, valid: false, facing: ghostFacing }
      : null;
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
      const parkedUsd = 25;
      const volumeUsd = 60;
      let coins = save.coins;
      const hires = { waiters: save.waiters, chefs: save.chefs };
      const layout = save.layout.length > 0 ? layoutFromSave(save) : layoutForCounts(2, 1);
      const inventory = save.inventory;
      const savedAt = save.savedAt;
      const market = save.market;
      const lpDays = save.lpDays;

      if (savedAt > 0) {
        const awayHrs = Math.max(0, (Date.now() - savedAt) / 3.6e6);
        const gameHrs = Math.min(awayHrs * 2, OFFLINE_GAME_HOURS_CAP);
        const inc = incomePerHour({ parkedUsd, weeklyVolumeUsd: volumeUsd });
        const earned = Math.floor((inc.lp + inc.vol) * gameHrs);
        if (earned > 0) {
          coins += earned;
          setToast(`The crew kept the pans warm. +${earned} coins while you were away.`);
        }
      }

      const world = createWorld("domain-kitchen-m4", SHELL, {
        parkedUsd,
        weeklyVolumeUsd: volumeUsd,
        playMoney: coins,
        hires,
        layout,
        inventory,
        market,
        lpDays,
        courses: save.courses,
      });
      worldRef.current = world;
      setCourses([...world.courses]);

      let startTheme: ThemeId = "trattoria";
      try {
        const t = localStorage.getItem(THEME_KEY) as ThemeId | null;
        if (t && (THEME_IDS as readonly string[]).includes(t)) startTheme = t;
      } catch {}
      setTheme(startTheme);
      const scene = buildScene(a, SHELL, assets, startTheme);
      sceneRef.current = scene;
      scene.resize(host.clientWidth, host.clientHeight);

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
          stepWorld(world, SHELL);
          acc -= WORLD_FIXED_DT;
          steps++;
        }
        if (steps >= MAX_SUBSTEPS) acc = 0;
        soundSweep();
        scene.sync(world, editRef.current);
      });

      onVis = () => {
        if (!app) return;
        if (document.visibilityState === "hidden") app.ticker.stop();
        else app.ticker.start();
      };
      document.addEventListener("visibilitychange", onVis);
      if (document.visibilityState === "hidden") a.ticker.stop();

      ro = new ResizeObserver(() => {
        if (!cancelled && host.clientWidth > 0) {
          scene.resize(host.clientWidth, host.clientHeight);
        }
      });
      ro.observe(host);

      stepWorld(world, SHELL);
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
          incomeLp: svc.income.lp,
          incomeVol: svc.income.vol,
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
        });
        // one save shape, written locally every tick of the poll and pushed
        // to the server on a slower beat when the player has signed in
        const save = serializeSave(w, themeRef.current);
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
          app: a,
          world,
          scene,
          act: (action: Parameters<typeof applyAction>[2]) => applyAction(world, SHELL, action),
          tick: (n: number) => {
            for (let i = 0; i < n; i++) stepWorld(world, SHELL);
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

  const onPointerMove = useCallback(
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
        previewPlace(w, SHELL, itemId, gx, gy, view.liftUid >= 0 ? view.liftUid : undefined) === "";
    },
    [tileAt]
  );

  const onPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      const world = worldRef.current;
      const scene = sceneRef.current;
      if (!world || !scene) return;
      const p = tileAt(ev.clientX, ev.clientY);
      if (!p) return;

      // ── EDIT MODE ────────────────────────────────────────────────────────
      if (world.editing) {
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
              ? applyAction(world, SHELL, { type: "move", uid: view.liftUid, gx, gy, facing })
              : applyAction(world, SHELL, { type: "place", itemId, gx, gy, facing: view.facing });
          if (ok) {
            sfxRef.current?.play("kaching");
            scene.spark(gx, gy, 0xf3c86a, 8);
            setHoldItem("");
            setLiftUid(-1);
            setEditError("");
          } else {
            const why = previewPlace(
              world, SHELL, itemId, gx, gy,
              view.liftUid >= 0 ? view.liftUid : undefined
            );
            setEditError(why || "That will not fit there.");
          }
          return;
        }
        // nothing in hand: lift whatever is under the tap
        const hit = world.layout.find((q) => {
          const cells = itemDef(q.itemId)?.cells ?? 1;
          return gy === q.gy && gx >= q.gx && gx < q.gx + cells;
        });
        if (hit) {
          setLiftUid(hit.uid);
          setHoldItem("");
          setEditError("");
        }
        return;
      }

      // ── PLAY MODE: the join-loop verbs ───────────────────────────────────
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
      if (bestToilet && applyAction(world, SHELL, { type: "fixToilet", uid: bestToilet })) {
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
        if (applyAction(world, SHELL, { type: "sweep", trashId: bestTrash })) {
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
      if (bestT >= 0 && applyAction(world, SHELL, { type: "bus", tableIdx: bestT })) {
        const t = world.tables[bestT];
        scene.spark(t.gx, t.gy, 0xf3c86a, 10);
        sfxRef.current?.play("bus");
        return;
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
      if (bestE && applyAction(world, SHELL, { type: "hustle", entityId: bestE })) {
        const e = world.entities.find((x) => x.id === bestE);
        if (e) scene.spark(e.x, e.y, 0xffd98a, 7);
        sfxRef.current?.play("hustle");
        return;
      }

      scene.spark(p.x, p.y, 0xf3e9d2, 4);
    },
    [tileAt]
  );

  const onDials = useCallback((parkedUsd: number, volumeUsd: number) => {
    const world = worldRef.current;
    if (!world) return;
    applyAction(world, SHELL, { type: "dials", parkedUsd, weeklyVolumeUsd: volumeUsd });
  }, []);

  const onUpgradeDish = useCallback((key: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, SHELL, { type: "upgradeDish", key })) {
      sfxRef.current?.play("unlock");
      setToast("The kitchen learned to cook that one better.");
    }
  }, []);

  const onMarket = useCallback((id: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, SHELL, { type: "market", id })) {
      setMarketId(id);
      sfxRef.current?.play("unlock");
      setToast(`Now sourcing from ${id}. Everything you built stays put.`);
    }
  }, []);

  const onBuyHire = useCallback((hire: HireKind) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, SHELL, { type: "buyHire", hire })) {
      sfxRef.current?.play("kaching");
      sceneRef.current?.spark(world.door.x, world.door.y, 0xf3c86a, 10);
    }
  }, []);

  const onBuyItem = useCallback((itemId: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, SHELL, { type: "buyItem", itemId })) {
      sfxRef.current?.play("kaching");
      setToast(`${itemDef(itemId)?.label ?? "It"} is in your storage. Tap Arrange to place it.`);
    }
  }, []);

  const onSellItem = useCallback((itemId: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (applyAction(world, SHELL, { type: "sellItem", itemId })) {
      sfxRef.current?.play("kaching");
      setToast(`Sold from storage. Anything standing in the room stays put.`);
    }
  }, []);

  /** Place straight from the shop: jump into arranging with it in hand. */
  const onPlaceItem = useCallback((itemId: string) => {
    const world = worldRef.current;
    if (!world) return;
    if (!world.editing) {
      if (!applyAction(world, SHELL, { type: "edit", on: true })) return;
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
    if (applyAction(world, SHELL, { type: "edit", on: next })) {
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
        style={{ position: "absolute", inset: 0, touchAction: "manipulation" }}
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
            fontFamily: 'ui-rounded, "Segoe UI", system-ui, sans-serif',
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
      {phase === "ready" && snap && (
        <>
          {!editing && market && (
            <LpPanel
              market={market}
              read={lp}
              live={liveOn}
              cloud={cloud}
              onUseLive={setUseLive}
              collapsed={lpCollapsed}
              onToggle={() => setLpCollapsed((c) => !c)}
            />
          )}
          {!editing && (
            <>
              <DialsPanel
                snap={snap}
                collapsed={dialsCollapsed}
                onToggle={() => setDialsCollapsed((c) => !c)}
                onDials={onDials}
                onMarket={onMarket}
              />
              <ShopPanel
                snap={snap}
                theme={theme}
                collapsed={shopCollapsed}
                onToggle={() => setShopCollapsed((c) => !c)}
                onBuyHire={onBuyHire}
                onBuyItem={onBuyItem}
                onSellItem={onSellItem}
                onPlaceItem={onPlaceItem}
              />
            </>
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
                  if (!applyAction(world, SHELL, { type: "rotate", uid: liftUid })) {
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
                if (applyAction(world, SHELL, { type: "store", uid: liftUid })) {
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
          <ChipBar
            muted={muted}
            theme={theme}
            editing={editing}
            onEdit={toggleEdit}
            onStyle={() => setStyleOpen(true)}
            onMute={() => {
              setMuted((m) => {
                const next = !m;
                sfxRef.current?.setMuted(next);
                try {
                  localStorage.setItem(MUTE_KEY, next ? "1" : "0");
                } catch {}
                return next;
              });
            }}
            onMenu={() => setMenuOpen(true)}
            onBook={() => setBookOpen(true)}
            onAcademy={() => setAcademyOpen(true)}
            graduate={isGraduate(courses)}
          />
          {styleOpen && (
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
              onClose={() => setStyleOpen(false)}
            />
          )}
          {academyOpen && (
            <AcademyModal
              done={courses}
              onComplete={(id) => {
                const world = worldRef.current;
                if (!world) return;
                if (applyAction(world, SHELL, { type: "completeCourse", id })) {
                  setCourses([...world.courses]);
                  sfxRef.current?.play("unlock");
                  setToast(
                    isGraduate(world.courses)
                      ? "Every course finished. Your kitchen wears the mark."
                      : "Course finished. The coins are in your register."
                  );
                }
              }}
              onClose={() => setAcademyOpen(false)}
            />
          )}
          {menuOpen && worldRef.current && (
            <MenuModal
              menu={worldRef.current.menu}
              theme={theme}
              pantry={worldRef.current.pantry}
              canUpgrade={(k) => (worldRef.current ? canUpgradeDish(worldRef.current, k) : false)}
              onUpgrade={onUpgradeDish}
              onClose={() => setMenuOpen(false)}
            />
          )}
          {bookOpen && worldRef.current && (
            <BookModal
              moments={worldRef.current.moments}
              hearts={worldRef.current.stats.hearts}
              served={worldRef.current.stats.served}
              gusVisits={worldRef.current.stats.gusVisits}
              onClose={() => setBookOpen(false)}
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
