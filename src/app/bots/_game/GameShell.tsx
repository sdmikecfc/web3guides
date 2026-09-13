"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ToyDisplay, PartDisplay } from "../_components/ToyDisplay";
import { NamePicker } from "../_components/NamePicker";
import { LookPicker } from "../_components/LookPicker";
import { IconGarage, IconPegboard, IconWeapon, IconWrench, IconStar } from "../_ui/icons";
import { useBotsSession } from "../battles/useBotsSession";
import { decodeBotsSession } from "../battles/session";
import { parsePracticeAppearance, parsePracticeDraft, practiceAppearanceOf, practiceDraftOf, type PracticeAppearance, type PracticeDraft } from "@/lib/bots/practice-handoff";
import { rigLookOf } from "../_view/look-view";
import type { FightClientProps } from "../fight/FightClient";
import type { BattlesView, BotView, EarnedBotView, LookView, MeView } from "../_server/types";
import { CARD_SLOTS, engineBuild, emptySockets, nameText, starterBuild, SLOT_STATS, type Build, type OwnedPart, type PartCard, type Socket } from "@/lib/bots/fixtures";
import { BEGINNER_OFFERS, BEGINNER_ORDER, gameCard, type BeginnerOffer } from "@/lib/bots/beginner-catalog";
import { equipmentPaints, EQUIPMENT_KIND, EQUIPMENT_LABEL, EQUIPMENT_SOCKETS, fitPart, socketsOf, withSockets } from "@/lib/bots/equipment";
import { buildOf, buyOnServer, ownedOf, recycleBotOnServer, saveBotOnServer, withBoughtPart, withSavedBot } from "@/lib/bots/live-garage";
import { demoBuy, demoComplete, demoSave, demoRecycle, demoWelcome, demoCreateBay, demoFinish, freshGameDemo, GAME_DEMO_KEY, readGameDemo, type GameDemo } from "@/lib/bots/game-demo";
import { draftPreview } from "@/lib/bots/onboarding-draft";
import { onboardingV2Enabled } from "@/lib/bots/rollout";
import { NO_LOOK, NO_MARKS, findsOf, normalizeLook, type BotLook } from "@/lib/bots/look";
import type { PaintId } from "../_engine/parts";
import type { OnboardingView } from "@/lib/bots/onboarding-types";
import { type CampaignPeriod, type CampaignView } from "@/lib/bots/campaign-view";
import { SHOWCASE } from "@/lib/bots/showcase";
import type { Listing } from "@/lib/bots/shipment";
import { seedState } from "@/lib/bots/garage-state";
import GarageRoom from "./GarageRoom";
import WorkshopShop from "./WorkshopShop";
import { CampaignPanel, GameDrawer, HelpPanel } from "./GamePanels";
import EarnDashboard from "./EarnDashboard";
import { ProgressPanel } from "./ProgressPanel";
import type { ProgressView } from "@/lib/bots/progress-view";
import css from "./game.module.css";
import { OverallStats, PartNumbers, PartStats, previewOffer } from "./BuildStats";
import StarterBuilder from "./StarterBuilder";
import CommunityRoom from "./CommunityRoom";
import TrailerPlayer from "./TrailerPlayer";
import entryCss from "./entry.module.css";
import EntryDialog from "./EntryDialog";
import { readGameView } from "@/lib/bots/view-fetch";
import { stylesPreviewEnabled, FIGHTING_STYLES, STYLE_GUIDE, stylePreviewHref } from "@/lib/bots/style-guide";
import { styleCardOf } from "@/lib/bots/style-catalog";
import { hasStyleParts, styleAssemblyIssue, styleRobotPreviewHref } from "@/lib/bots/style-preview";
import { clearFightQuery, fightRoomHref, styleQueryOf } from "@/lib/bots/fight-navigation";
import type { StylePracticeQuery } from "@/lib/bots/style-practice";
import WorkshopTour, { WORKSHOP_TOUR_KEY, WORKSHOP_TOUR_VERSION } from "./WorkshopTour";
import SeasonGameShell from "./SeasonGameShell";

const FightClient = dynamic(() => import("../fight/FightClient"), { ssr: false, loading: () => <div className={css.loading}><p>Opening the ring…</p></div> });
const ServerFight = dynamic(() => import("../fight/FightClient").then(m => m.ServerFight), { ssr: false, loading: () => <div className={css.loading}><p>Opening the ring…</p></div> });
const StyleFight = dynamic(() => import("../fight/styles/StyleFightClient"), { ssr: false, loading: () => <div className={css.loading}><p>Opening the ring… Your room buttons stay below.</p></div> });
type Mode = "garage" | "parts" | "build" | "fight" | "community";
type Drawer = "help" | "earn" | "campaign" | "community" | "name" | "look" | "sample" | "tools" | null;
type Feed = { kind: "server"; id: string; tutorial: boolean } | { kind: "local"; props: FightClientProps; tutorial: boolean } | { kind: "styles"; query: StylePracticeQuery; tutorial: false } | null;
type PlayerMe = MeView & { onboarding?: OnboardingView | null; player: MeView["player"] & { reservedCoins?: number; spendableCoins?: number } };
const validMode = (s: string | null): Mode => s === "parts" || s === "build" || s === "fight" || s === "community" ? s : "garage";
const defaultOnboardingVersion = () => onboardingV2Enabled() || stylesPreviewEnabled() ? 2 : 1;
const seasonPreview = process.env.NEXT_PUBLIC_BOTS_SEASON_V1 === "1";
const shortSocket: Record<Socket, string> = { head: "Head", torso: "Body", armL: "L arm", armR: "R arm", legL: "L leg", legR: "R leg", weapon: "Weapon" };
const count = (n: number) => n.toLocaleString();
const bayPreferenceKey = (token: string | null) => `bots.selected-bay.${token ? decodeBotsSession(token)?.wallet ?? "practice" : "practice"}`;
const validBay = (value: string | null) => value && /^[1-5]$/.test(value) ? Number(value) : null;
const PENDING_PRACTICE_KEY = "bots.practice.pending-appearance.v1";
const safeMessage = (j: unknown, fallback: string) => {
  const error = j && typeof j === "object" && "error" in j ? (j as { error: unknown }).error : null;
  return typeof error === "string" && error.length < 180 && !/session|token|wallet|database|sql|column|relation|undefined|stack/i.test(error) ? error : fallback;
};
function Guide({ children }: { children: React.ReactNode }) { return <div className={css.guide}><span className={css.guideFace} aria-hidden>••</span><p>{children}</p></div>; }

export default function GameShell({ initialFight, initialReplay }: { initialFight?: FightClientProps; initialReplay?: string } = {}) {
  const query = useSearchParams();
  const remaster = !initialFight && !initialReplay && (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_BOTS_REMASTER_PREVIEW === "1") && query.get("view") === "fight" && query.get("combat") === "7";
  return remaster || seasonPreview && !initialFight && !initialReplay && !query.get("replay") && query.get("collection") !== "classic" && query.get("combat") !== "5" ? <SeasonGameShell /> : <ClassicGameShell initialFight={initialFight} initialReplay={initialReplay} />;
}

function ClassicGameShell({ initialFight, initialReplay }: { initialFight?: FightClientProps; initialReplay?: string }) {
  const params = useSearchParams(), session = useBotsSession(), router = useRouter();
  const [mode, setMode] = useState<Mode>("garage"), [drawer, setDrawer] = useState<Drawer>(null);
  const [demo, setDemo] = useState<GameDemo>(() => freshGameDemo(defaultOnboardingVersion())), [hydrated, setHydrated] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false), [justFinished, setJustFinished] = useState(false);
  const [tourOpen, setTourOpen] = useState(false), [tourReturning, setTourReturning] = useState(false);
  const tourChecked = useRef(false);
  const [garageConflict, setGarageConflict] = useState(false), [retryFeed, setRetryFeed] = useState(0);
  const [handoffFailed, setHandoffFailed] = useState(false);
  const [me, setMe] = useState<PlayerMe | null>(null), [loadState, setLoadState] = useState<"loading" | "ready" | "failed" | "expired">("loading");
  const [bay, setBay] = useState(1), [edit, setEdit] = useState<Build | null>(null), [socket, setSocket] = useState<Socket>("head");
  const [selection, setSelection] = useState<string | null>(null), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const [localFeed, setFeed] = useState<Feed>(null), [battles, setBattles] = useState<BattlesView | null>(null), [battlesState, setBattlesState] = useState<"loading" | "ready" | "failed">("loading");
  const [initialDismissed, setInitialDismissed] = useState(false);
  const linkedFight = useMemo<Feed>(() => params.get("view") === "fight" && params.get("combat") === "5" ? { kind: "styles", query: styleQueryOf(params), tutorial: false } : params.get("view") === "fight" && params.get("replay") ? { kind: "server", id: params.get("replay")!, tutorial: false } : !initialDismissed && initialFight ? { kind: "local", props: initialFight, tutorial: false } : !initialDismissed && initialReplay ? { kind: "server", id: initialReplay, tutorial: false } : null, [params, initialFight, initialReplay, initialDismissed]);
  const feed = linkedFight ?? localFeed;
  const completedTutorial = useRef(false);
  useEffect(() => { completedTutorial.current = false; }, [feed]);
  const [campaign, setCampaign] = useState<CampaignView | null>(null), [period, setPeriod] = useState<CampaignPeriod>("final");
  const [earnedRows, setEarnedRows] = useState<EarnedBotView[] | null>(null);
  const [progress, setProgress] = useState<{ token: string; view: ProgressView } | null>(null);
  const [nudgeHidden, setNudgeHidden] = useState(false), [resetAsk, setResetAsk] = useState(false);
  const pendingPractice = useRef<PracticeAppearance | PracticeDraft | null>(null);
  const practiceRequest = useRef<{ token: string; result: Promise<{ ok: boolean; applied?: boolean; bay?: number; reason?: string }> } | null>(null);
  const partialPractice = useRef(false);
  const selectionOwner = useRef<{ key: string; preferred: number | null } | null>(null);
  const connect = () => {
    if (busyRef.current) { setNote("Saving your choices. Try connecting in a moment."); return; }
    if (!session.token) {
      const selected = edit ?? demo.builds.find(b => b.bay === bay);
      pendingPractice.current = demo.version === 2 ? practiceDraftOf(demo, selected) : practiceAppearanceOf(demo, selected); practiceRequest.current = null;
      partialPractice.current = !pendingPractice.current && !!selected && Object.values(socketsOf(selected)).some(Boolean);
      try { if (pendingPractice.current) sessionStorage.setItem(PENDING_PRACTICE_KEY, JSON.stringify(pendingPractice.current)); else sessionStorage.removeItem(PENDING_PRACTICE_KEY); } catch { /* The practice garage itself remains persisted. */ }
    }
    // Release the drawer's focus trap and expose any sign-in status message.
    setDrawer(null); setResetAsk(false); void session.open();
  };
  const tokenRef = useRef(session.token), busyRef = useRef(false), mounted = useRef(true), requestEpoch = useRef(0);
  tokenRef.current = session.token;
  const signedIn = !!session.token;
  const exploring = params.get("tour") === "1";
  const [newBay, setNewBay] = useState<number | null>(null), [sampleBay, setSampleBay] = useState(1);
  const sampleGarage = useMemo(() => seedState(0), []);
  const sampleBuilds = useMemo(() => Object.values(sampleGarage.builds), [sampleGarage]);
  const sampleLook = useCallback((b: Build) => rigLookOf({ paints: equipmentPaints(b, sampleGarage.parts), look: { ...NO_LOOK, ...(b.look ?? {}), plateNumber: b.name.num }, marks: NO_MARKS, wins: 0 }, "mint"), [sampleGarage]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestEpoch.current++; }; }, []);
  useEffect(() => { try { const raw = sessionStorage.getItem(PENDING_PRACTICE_KEY); if (raw && raw.length < 20000) { const value = JSON.parse(raw); pendingPractice.current = value.version === 2 ? parsePracticeDraft(value) : parsePracticeAppearance(value); } } catch { /* Malformed pending appearance cannot replace a robot. */ } }, []);
  useEffect(() => { try { setDemo(readGameDemo(localStorage.getItem(GAME_DEMO_KEY), defaultOnboardingVersion())); } catch { setDemo(freshGameDemo(defaultOnboardingVersion())); } setHydrated(true); }, []);
  useEffect(() => { if (hydrated && session.ready && !session.token) { try { localStorage.setItem(GAME_DEMO_KEY, JSON.stringify(demo)); } catch { /* The garage still works when browser storage is full. */ } } }, [demo, hydrated, session.ready, session.token]);
  useEffect(() => { const next = !initialDismissed && (initialFight || initialReplay) ? "fight" : validMode(params.get("panel") === "community" ? "community" : params.get("view")); setMode(next); const open = params.get("panel"); if (open === "earn" || open === "campaign" || open === "help") setDrawer(open); }, [params, initialDismissed, initialFight, initialReplay]);
  useEffect(() => { if (!note) return; const timer = setTimeout(() => setNote(""), 5200); return () => clearTimeout(timer); }, [note]);

  const refresh = useCallback(async (token = tokenRef.current) => {
    if (!token) { setMe(null); setLoadState("ready"); return; }
    const epoch = ++requestEpoch.current;
    try {
      const res = await fetch("/api/bots/me", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const value = await res.json();
      if (!mounted.current || tokenRef.current !== token || epoch !== requestEpoch.current) return;
      if (res.status === 401) { setLoadState("expired"); return; }
      if (!res.ok || !value?.ok) throw new Error("Garage unavailable");
      setMe(value as PlayerMe); setLoadState("ready");
      return value as PlayerMe;
    } catch { if (mounted.current && tokenRef.current === token && epoch === requestEpoch.current) setLoadState("failed"); }
  }, []);
  useEffect(() => {
    if (!session.ready) return;
    requestEpoch.current++; setMe(null); setEdit(null); setFeed(null); setBay(1); setNewBay(null); setSelection(null); setNudgeHidden(false); setEarnedRows(null); setProgress(null); setHandoffFailed(false); setGarageConflict(false);
    setLoadState(session.token ? "loading" : "ready");
    const token = session.token, appearance = token ? pendingPractice.current : null;
    const ownerKey = bayPreferenceKey(token);
    if (selectionOwner.current?.key !== ownerKey) {
      let preferred: number | null = null;
      try { preferred = validBay(localStorage.getItem(ownerKey)); } catch { /* Selection still works without storage. */ }
      if (!selectionOwner.current) preferred = validBay(new URL(window.location.href).searchParams.get("bay")) ?? preferred;
      selectionOwner.current = { key: ownerKey, preferred };
    }
    const preferredBay = selectionOwner.current.preferred;
    let cancelled = false;
    void (async () => {
      let copiedBay: number | null = null;
      if (appearance) {
        try {
          if (practiceRequest.current?.token !== token) practiceRequest.current = { token, result: fetch("/api/bots/practice-handoff", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ appearance }) }).then(async response => ({ ...await response.json(), ok: response.ok })) };
          const result = await practiceRequest.current.result;
          if (cancelled || tokenRef.current !== token) return;
          if (result.ok && (result.applied || result.reason === "existing-garage")) {
            pendingPractice.current = null;
            try { sessionStorage.removeItem(PENDING_PRACTICE_KEY); } catch { /* Optional retry persistence. */ }
          }
          if (result.ok && result?.applied && Number.isInteger(result.bay)) { copiedBay = result.bay!; setNote("Your robot choices are saved to your wallet."); }
          else if (result.ok && result.reason === "existing-garage") { setGarageConflict(true); }
          else { setHandoffFailed(true); setNote("Your browser robot is safe. Connecting its choices did not finish."); }
        } catch { if (!cancelled && tokenRef.current === token) { setHandoffFailed(true); setNote("Your browser robot is safe. Connecting its choices did not finish."); } }
      }
      if (token && !appearance && partialPractice.current) { partialPractice.current = false; setNote("Your unfinished practice build is saved in this browser. Only a finished seven-part build can be copied into your connected garage."); }
      if (!cancelled) {
        const loaded = await refresh(token);
        if (cancelled || tokenRef.current !== token) return;
        if (loaded) {
          const firstBuild = loaded.onboarding && loaded.onboarding.step !== "complete" ? loaded.onboarding.step === "welcome" ? loaded.onboarding.welcomeBay : loaded.onboarding.draftBay : null;
          const next = firstBuild ?? copiedBay ?? (loaded.bots.some(b => b.bay === preferredBay) ? preferredBay : loaded.bots[0]?.bay) ?? 1;
          rememberBay(next);
        } else if (!token && preferredBay) rememberBay(preferredBay);
      }
    })();
    try { setNudgeHidden(localStorage.getItem(`bots.earning-note.${session.last?.walletName ?? "practice"}`) === "dismissed"); } catch { /* optional preference */ }
    return () => { cancelled = true; };
  }, [session.token, session.ready, refresh, session.last?.walletName]);
  useEffect(() => {
    if (!hydrated || !session.ready) return;
    const controller = new AbortController(), token = session.token;
    setCampaign(null);
    let loading = false;
    const update = () => { if (document.hidden || loading) return; loading = true; void readGameView<CampaignView>(`/api/bots/campaign?period=${period}`, controller.signal, token ? { Authorization: `Bearer ${token}` } : {}).then(v => { if (!controller.signal.aborted && v?.ok) setCampaign(v); }).catch(() => {}).finally(() => { loading = false; }); };
    update(); const timer = mode === "community" ? setInterval(update, 60000) : null;
    document.addEventListener("visibilitychange", update);
    return () => { controller.abort(); if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [period, session.token, session.ready, hydrated, mode]);

  useEffect(() => {
    if (!session.ready || !session.token || !me || !(drawer === "look" || drawer === "name" || drawer === "help")) return;
    const token = session.token, controller = new AbortController();
    setProgress(null);
    const unavailable: ProgressView = { source: "unavailable", activeDays: null, firstSeenAt: null, firstBuildAt: null, firstFightAt: null, awards: [] };
    void fetch("/api/bots/progress", { cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null).then(v => { if (!controller.signal.aborted && tokenRef.current === token) setProgress({ token, view: v?.ok ? v : unavailable }); })
      .catch(() => { if (!controller.signal.aborted && tokenRef.current === token) setProgress({ token, view: unavailable }); });
    return () => controller.abort();
  }, [drawer, session.token, session.ready, me]);
  const progressPanel = <ProgressPanel signedIn={signedIn} view={progress?.token === session.token ? progress.view : null} onConnect={connect} />;

  const onboarding = signedIn ? me?.onboarding ?? null : demo.onboarding;
  const intro = !!onboarding && onboarding.step !== "complete";
  const starterV2 = intro && onboarding?.version === 2;
  const draft = useMemo(() => signedIn && starterV2 && onboarding ? draftPreview(onboarding) : null, [signedIn, starterV2, onboarding]);
  const parts = useMemo(() => signedIn ? [...(me?.parts.map(ownedOf) ?? []), ...(draft?.parts ?? [])] : demo.parts, [signedIn, me?.parts, demo.parts, draft]);
  const builds = useMemo(() => {
    if (!signedIn) return demo.builds.length ? demo.builds : [starterBuild(1)];
    if (!me) return [];
    const savedBuilds = me.bots.map(b => draft && b.bay === onboarding?.draftBay ? { ...draft.build, look: buildOf(b).look } : buildOf(b));
    if (newBay && !savedBuilds.some(b => b.bay === newBay)) savedBuilds.push(starterBuild(newBay));
    // Recycling the last robot leaves a usable empty bay, not an endless loader.
    return savedBuilds.length ? savedBuilds : [withSockets(starterBuild(1), socketsOf(starterBuild(1)))];
  }, [signedIn, me?.bots, demo.builds, newBay, draft, onboarding?.draftBay]);
  const saved = builds.find(b => b.bay === bay) ?? builds[0] ?? null;
  const build = edit && edit.bay === saved?.bay ? edit : saved;
  const row = me?.bots.find(b => b.bay === build?.bay);
  const styledBuild = !!build && hasStyleParts(build, parts);
  const styledBody = build ? styleCardOf(parts.find(p => p.uid === socketsOf(build).torso)?.id) : undefined;
  const totalCoins = signedIn ? me?.player.coins ?? 0 : demo.coins;
  const reserved = onboarding?.reservedCoins ?? me?.player.reservedCoins ?? 0;
  const spendable = signedIn ? me?.player.spendableCoins ?? Math.max(0, totalCoins - reserved) : Math.max(0, totalCoins - reserved);
  const ready = hydrated && session.ready && (!signedIn || loadState === "ready") && !!build;
  useEffect(() => {
    if (!seasonPreview || !ready || tourChecked.current || feed || exploring || garageConflict || handoffFailed) return;
    tourChecked.current = true;
    let seen = 0; try { seen = Number(localStorage.getItem(WORKSHOP_TOUR_KEY)) || 0; } catch { /* A tour never owns gameplay data. */ }
    if (seen < WORKSHOP_TOUR_VERSION && (!intro || onboarding?.version !== 2)) { setTourReturning(true); setTourOpen(true); }
  }, [ready, feed, exploring, garageConflict, handoffFailed, intro, onboarding?.version]);
  const closeTour = () => { setTourOpen(false); try { localStorage.setItem(WORKSHOP_TOUR_KEY, String(WORKSHOP_TOUR_VERSION)); } catch { /* Optional presentation preference. */ } };
  const showTour = () => { setDrawer(null); setTourReturning(!intro || onboarding?.version !== 2); setTourOpen(true); };
  const liveLook = useCallback((b: Build): LookView => {
    const actual = me?.bots.find(v => v.bay === b.bay);
    return { paints: equipmentPaints(b, parts), look: { ...(b.look ?? NO_LOOK), plateNumber: b.name.num }, marks: signedIn && actual ? actual.marks : NO_MARKS, wins: signedIn && actual ? actual.wins : 0 };
  }, [me?.bots, parts, signedIn]);
  const incomplete = build ? emptySockets(build).length : 7;
  const partsLocked = !starterV2 && !!saved && emptySockets(saved).length === 0;
  const worn = EQUIPMENT_SOCKETS.map(s => parts.find(p => p.uid === (build ? socketsOf(build)[s] : null))).filter((p): p is OwnedPart => !!p);
  const colours = Array.from(new Set(worn.filter(p => p.slot !== "weapon").map(p => p.paint).filter((p): p is PaintId => !!p)));
  const earned = findsOf({ wins: row?.wins ?? 0, losses: row?.losses ?? 0, level: row?.level ?? 1, champion: row?.marks.crown ?? false, bodyCount: 6,
    bodyPaints: worn.filter(p => p.slot !== "weapon").map(p => p.paint).filter((p): p is PaintId => !!p), partStars: worn.map(p => p.tier),
    hats: signedIn ? earnedRows?.find(e => e.bay === build?.bay)?.earned.hats ?? (saved?.look?.hat ? [saved.look.hat] : []) : [], plateNumber: build?.name.num ?? null });

  useEffect(() => {
    if (!(drawer === "name" || drawer === "look") || !session.token) return;
    const controller = new AbortController(), token = session.token;
    void fetch("/api/bots/earned", { cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).then(v => { if (!controller.signal.aborted && v?.ok && Array.isArray(v.bots)) setEarnedRows(v.bots); }).catch(() => {});
    return () => controller.abort();
  }, [drawer, session.token]);

  useEffect(() => {
    if (exploring) return;
    if (onboarding?.step === "shop" || onboarding?.step === "practice") { setBay(onboarding.draftBay); return; }
    if (onboarding?.step === "welcome") return;
    const requested = params.get("bay");
    if (requested && /^[1-5]$/.test(requested)) setBay(Number(requested));
    else if (onboarding?.step === "complete") setBay(onboarding.draftBay);
  }, [onboarding?.step, onboarding?.draftBay, params, exploring]);
  useEffect(() => { if (onboarding?.step === "shop" && onboarding.nextSocket) { setSocket(onboarding.nextSocket); setSelection(null); } }, [onboarding?.nextSocket, onboarding?.step]);
  useEffect(() => {
    if (!(mode === "fight" || mode === "community" || drawer === "community") || !session.ready) return;
    const controller = new AbortController(), token = session.token;
    setBattlesState("loading"); let loading = false;
    const q = row && mode === "fight" ? `?bot=${row.id}` : "";
    const update = () => {
      if (document.hidden || loading) return; loading = true;
      void readGameView<BattlesView>(`/api/bots/battles${q}`, controller.signal, token ? { Authorization: `Bearer ${token}` } : {}).then(v => { if (controller.signal.aborted) return; if (v?.ok) setBattles(v); setBattlesState(v?.ok ? "ready" : "failed"); }).catch(() => { if (!controller.signal.aborted) setBattlesState("failed"); }).finally(() => { loading = false; });
    };
    update(); const timer = mode === "community" ? setInterval(update, 30000) : null;
    document.addEventListener("visibilitychange", update);
    return () => { controller.abort(); if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [mode, drawer, row?.id, session.token, session.ready, retryFeed]);

  const go = (next: Mode) => { setInitialDismissed(true); setMode(next); setSelection(null); if (next !== "fight") setFeed(null); setDrawer(null); const url = new URL(window.location.href); url.pathname = "/bots"; clearFightQuery(url.searchParams); url.searchParams.delete("panel"); if (seasonPreview) url.searchParams.set("collection", "classic"); if (feed && onboarding?.step === "welcome" && next !== "build") url.searchParams.set("tour", "1"); if (next === "garage") url.searchParams.delete("view"); else url.searchParams.set("view", next); window.history.replaceState(null, "", `${url.pathname}${url.search}`); };
  const explore = (enabled: boolean) => {
    if (edit) { setNote("Save your changes before looking around."); return; }
    const url = new URL(window.location.href); clearFightQuery(url.searchParams); url.searchParams.delete("panel");
    if (enabled) { url.searchParams.set("tour", "1"); url.searchParams.delete("view"); }
    else { url.searchParams.delete("tour"); if (onboarding?.step === "shop") url.searchParams.set("view", "parts"); else url.searchParams.delete("view"); }
    setMode(!enabled && onboarding?.step === "shop" ? "parts" : "garage"); setFeed(null); setDrawer(null); setSelection(null);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };
  const mutate = async <T,>(work: (token: string | null) => Promise<T> | T): Promise<T | undefined> => {
    if (busyRef.current) return;
    const claims = tokenRef.current ? decodeBotsSession(tokenRef.current) : null;
    if (claims && claims.exp <= Date.now()) { setLoadState("expired"); return; }
    busyRef.current = true; setBusy(true); const token = tokenRef.current;
    try { return await work(token); } catch { if (mounted.current && tokenRef.current === token) setNote("That did not finish. Please try again."); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const introAction = async (action: "welcome" | "buy" | "practice" | "complete", extra?: { socket?: Socket; offerId?: string }) => {
    if (seasonPreview && action === "welcome") try { localStorage.setItem(WORKSHOP_TOUR_KEY, String(WORKSHOP_TOUR_VERSION)); } catch { /* A fresh start should not become a returning-player interruption. */ }
    await mutate(async token => {
      if (!token) {
        if (action === "welcome") { setDemo(demoWelcome); rememberBay(onboarding?.draftBay ?? 2); explore(false); go("parts"); }
        if (action === "buy" && extra?.socket && extra.offerId) { setDemo(v => demoBuy(v, extra.socket!, extra.offerId!)); setEdit(null); setSelection(null); }
        if (action === "practice") openPractice(true);
        if (action === "complete") { setDemo(demoComplete); setNote("Your first build is ready. Nothing was lost in practice."); }
        return;
      }
      const res = await fetch("/api/bots/onboarding", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ t: token, action: starterV2 && action === "buy" ? "choose" : action, ...extra, ...(starterV2 ? { revision: onboarding?.revision } : {}) }) });
      const value = await res.json().catch(() => null);
      if (tokenRef.current !== token || !mounted.current) return;
      if (!res.ok || !value?.ok) { setNote(safeMessage(value, "That did not finish. Please try again.")); if (res.status === 409) await refresh(token); return; }
      setEdit(null); setSelection(null); await refresh(token);
      if (tokenRef.current !== token || !mounted.current) return;
      if (action === "welcome") { rememberBay(value.onboarding?.draftBay ?? 2); explore(false); go("parts"); }
      if (action === "practice" && typeof value.fightId === "string") { go("fight"); setFeed({ kind: "server", id: value.fightId, tutorial: true }); }
      if (action === "complete") setNote("Your first build is ready. Nothing was lost in practice.");
    });
  };

  const finishStarter = async (name: Build["name"]) => {
    await mutate(async token => {
      if (!onboarding || onboarding.version !== 2 || !build) return;
      if (!token) {
        const next = demoFinish(demoSave(demo, { ...build, name }));
        if (!next.onboarding.milestones.assembled) { setNote("Choose all seven parts first."); return; }
        setDemo(next); setEdit(null); rememberBay(next.onboarding.draftBay); go("garage"); setJustFinished(true); return;
      }
      let revision = onboarding.revision;
      const send = async (action: string, extra: object = {}) => {
        const response = await fetch("/api/bots/onboarding", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, revision, ...extra }) });
        const value = await response.json().catch(() => null);
        if (tokenRef.current !== token || !mounted.current) return null;
        if (!response.ok || !value?.ok) { setNote(safeMessage(value, "Your robot has not finished saving. Please try again.")); await refresh(token); return null; }
        return value;
      };
      if (JSON.stringify(name) !== JSON.stringify(onboarding.draftName)) {
        const renamed = await send("name", { name }); if (!renamed) return;
        revision = renamed.onboarding?.revision ?? revision;
      }
      const finished = await send("finish"); if (!finished) return;
      const loaded = await refresh(token); if (!loaded || tokenRef.current !== token) return;
      setEdit(null); rememberBay(loaded.onboarding?.draftBay ?? 1); go("garage"); setJustFinished(true);
    });
  };

  const saveStarterName = async (name: Build["name"]) => {
    await mutate(async token => {
      if (!starterV2 || !build || !onboarding) return;
      if (!token) { setDemo(v => demoSave(v, { ...build, name })); return; }
      const res = await fetch("/api/bots/onboarding", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "name", name, revision: onboarding.revision }) });
      const value = await res.json().catch(() => null);
      if (tokenRef.current !== token || !mounted.current) return;
      if (!res.ok || !value?.ok) setNote(safeMessage(value, "The name did not save. Please try again."));
      await refresh(token);
    });
  };

  const retryPracticeTransfer = () => void mutate(async token => {
    const appearance = pendingPractice.current;
    if (!token || !appearance) return;
    practiceRequest.current = null;
    const response = await fetch("/api/bots/practice-handoff", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ appearance }) });
    const result = await response.json().catch(() => null);
    if (tokenRef.current !== token || !mounted.current) return;
    if (!response.ok || !result?.ok || !result.applied && result.reason !== "existing-garage") { setNote("Your choices are still saved here. Please retry, or keep practicing in this browser."); return; }
    const loaded = await refresh(token); if (tokenRef.current !== token || !loaded) return;
    pendingPractice.current = null; try { sessionStorage.removeItem(PENDING_PRACTICE_KEY); } catch {}
    setHandoffFailed(false);
    if (result.reason === "existing-garage") setGarageConflict(true);
    else { rememberBay(result.bay ?? loaded.onboarding?.draftBay ?? 1); setNote("Your robot choices are saved to your wallet."); }
  });

  const openPractice = (tutorial = false) => {
    const mine = tutorial ? builds.find(b => b.bay === onboarding?.draftBay) : build;
    const welcome = builds.find(b => b.bay === onboarding?.welcomeBay) ?? builds[0];
    if (!mine || !welcome || emptySockets(mine).length) { setNote("Add all seven parts first."); return; }
    const house = onboarding?.version === 2 || welcome.bay === mine.bay;
    const a = engineBuild(mine, parts), b = house ? SHOWCASE.b : engineBuild(welcome, parts), looks: [LookView, LookView] = [liveLook(mine), house ? { look: NO_LOOK, marks: NO_MARKS, paints: {}, wins: 0 } as LookView : liveLook(welcome)];
    if (hasStyleParts(mine, parts)) {
      if (!styleCardOf(parts.find(p => p.uid === socketsOf(mine).torso)?.id)) { setNote("Choose a Tank, Speed or Ranged body for a style fight."); return; }
      router.push(`${styleRobotPreviewHref(a, liveLook(mine))}&name=${encodeURIComponent(nameText(mine.name))}`); return;
    }
    go("fight"); setFeed({ kind: "local", tutorial, props: {
      seed: 75, a, b, looks,
      ids: [{ name: nameText(mine.name), wallet: "Your practice garage", wins: 0, losses: 0, strategy: "", paint: "mint" }, { name: house ? SHOWCASE.names[1] : nameText(welcome.name), wallet: "Practice rival", wins: 0, losses: 0, strategy: "", paint: "butter" }],
      mode: "spar", modeLabel: "Welcome practice", replayUrl: "/bots", watchAnotherHref: "/bots?view=fight", rewardLines: ["Practice. No coins, points, wins, or repairs."],
    } });
  };
  const watchShowcase = () => { go("fight"); setFeed({ kind: "local", tutorial: false, props: { seed: 75, a: SHOWCASE.a, b: SHOWCASE.b, ids: [{ name: SHOWCASE.names[0], wallet: "Practice", wins: 0, losses: 0, strategy: "", paint: "mint" }, { name: SHOWCASE.names[1], wallet: "Practice", wins: 0, losses: 0, strategy: "", paint: "coral" }], mode: "spar", modeLabel: "A practice fight", replayUrl: SHOWCASE.href, watchAnotherHref: "/bots?view=fight" } }); };
  const watch = (id: string) => { go("fight"); setFeed({ kind: "server", id, tutorial: false }); };
  const fightComplete = () => { if (feed?.tutorial) { completedTutorial.current = true; void introAction("complete"); } else if (signedIn) void refresh(); };
  const closeFight = () => { setFeed(null); go("garage"); if (signedIn) void refresh(); };

  const saveBuild = async () => {
    if (!build) return;
    const value = build;
    if (partsLocked && saved && EQUIPMENT_SOCKETS.some(s => socketsOf(value)[s] !== socketsOf(saved)[s])) { setNote("These parts stay with this robot. Build another robot to use different parts."); return; }
    const assemblyIssue = styleAssemblyIssue(value, parts, row?.engineVersion === 5 || !!saved && hasStyleParts(saved, parts));
    if (assemblyIssue) { setNote(assemblyIssue); return; }
    await mutate(async token => {
      if (!token) {
        const next = demoSave(demo, value);
        if (next === demo) { setNote("These parts could not be saved. Choose a spare part for each space and try again."); return; }
        setDemo(next); setEdit(null); setNote("Saved. This robot is yours."); return;
      }
      const sockets = socketsOf(value), actual = me?.bots.find(b => b.bay === value.bay);
      const answer = await saveBotOnServer({ bay: value.bay, name: value.name, decal: value.decal, paint: actual?.paint, listed: actual?.listed,
        parts: Object.fromEntries(CARD_SLOTS.map(s => [s, value.cards[s] == null ? null : Number(value.cards[s])])) as BotView["parts"],
        sockets: Object.fromEntries(EQUIPMENT_SOCKETS.map(s => [s, sockets[s] == null ? null : Number(sockets[s])])) as BotView["sockets"], look: value.look ?? NO_LOOK });
      if (tokenRef.current !== token || !mounted.current) return;
      if (answer.ok) { setMe(v => v ? withSavedBot(v, answer.value) as PlayerMe : v); setNewBay(null); setEdit(null); setNote("Saved. This robot is yours."); }
      else setNote(answer.message ?? "Your robot could not be saved. Try again.");
    });
  };
  const rememberBay = (next: number) => { setBay(next); const key = bayPreferenceKey(tokenRef.current); selectionOwner.current = { key, preferred: next }; try { localStorage.setItem(key, String(next)); } catch { /* Optional selection preference. */ } const url = new URL(window.location.href); url.searchParams.set("bay", String(next)); window.history.replaceState(null, "", `${url.pathname}${url.search}`); };
  const selectBot = (next: number) => { if (busyRef.current) return; if (edit) { setNote("Save your changes before choosing another robot."); return; } rememberBay(next); setSelection(null); };
  const openBay = (next: number) => {
    if (busyRef.current) return;
    if (intro) { explore(false); return; }
    if (edit && next !== bay) { setNote("Save your changes before choosing another robot."); return; }
    if (!(signedIn ? me?.bots : demo.builds)?.some(b => b.bay === next)) { if (signedIn) setNewBay(next); else setDemo(v => demoCreateBay(v, next)); }
    selectBot(next); go("build");
  };
  const choosePart = (p: OwnedPart) => { if (busyRef.current || !build || partsLocked) return; setEdit(fitPart(build, p, socket)); setSelection(p.uid); };
  const beginAnother = () => {
    if (intro) { explore(false); return; }
    const next = [1,2,3,4,5].find(n => !builds.some(b => b.bay === n && emptySockets(b).length === 0));
    if (!next) { setNote("Your garage has five robots. Recycle one in the garage to make room."); go("garage"); return; }
    openBay(next);
  };
  const recycleRobot = async (recycleBay: number): Promise<boolean> => {
    let recycled = false;
    await mutate(async token => {
      if (edit) { setNote("Save your changes before recycling a robot."); return; }
      if (!token) {
        const next = demoRecycle(demo, recycleBay);
        if (next === demo) return;
        const returned = next.coins - demo.coins;
        setDemo(next); rememberBay(next.builds[0]?.bay ?? 1); setNewBay(null); setSelection(null); setFeed(null);
        setNote("Robot recycled. " + returned + " coins returned. Its stand is ready for a new robot."); recycled = true; return;
      }
      const actual = me?.bots.find(b => b.bay === recycleBay);
      if (!actual) return;
      const answer = await recycleBotOnServer(actual.id);
      if (!mounted.current || tokenRef.current !== token) return;
      if (!answer.ok) { setNote(answer.message ?? "Your robot could not be recycled. Try again."); return; }
      setNewBay(null); setSelection(null); setFeed(null);
      const updated = await refresh(token);
      if (!mounted.current || tokenRef.current !== token) return;
      rememberBay(updated?.bots[0]?.bay ?? 1);
      setNote("Robot recycled. " + answer.value.coins + " coins returned. Its stand is ready for a new robot."); recycled = true;
    });
    return recycled;
  };
  const changeLook = (patch: Partial<BotLook>) => { if (!busyRef.current && build) { const next = normalizeLook({ ...(build.look ?? NO_LOOK), ...patch }, earned); setEdit({ ...build, look: next, decal: next.spot === "chest" ? next.sticker : null }); } };
  const dismissNudge = () => { setNudgeHidden(true); if (!signedIn) setDemo(v => ({ ...v, nudgeDismissed: true })); try { localStorage.setItem(`bots.earning-note.${session.last?.walletName ?? "practice"}`, "dismissed"); } catch {} };
  const startFight = (difficulty?: string, defenderBotId?: number) => void mutate(async token => {
    if (!token || !row) { setDrawer("earn"); return; }
    if (edit) { setNote("Save your robot before the fight."); return; }
    if (styledBuild) {
      if (defenderBotId) { setNote("Styled robots can face house robots and practice rivals. Player challenges are not open yet."); return; }
      if (row.engineVersion !== 5) { openPractice(); return; }
      router.push(fightRoomHref(5, { botId: String(row.id), difficulty: difficulty ?? "easy" })); return;
    }
    const res = await fetch("/api/bots/fight", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ t: token, botId: row.id, mode: defenderBotId ? "pvp" : "pve", difficulty, defenderBotId, ...(defenderBotId ? { stake: 25 } : {}) }) });
    const value = await res.json().catch(() => null);
    if (tokenRef.current !== token || !mounted.current) return;
    if (!res.ok || !value?.ok || typeof value.fightId !== "string") { setNote(safeMessage(value, "The fight could not start. Try again.")); return; }
    go("fight"); setFeed({ kind: "server", id: value.fightId, tutorial: false }); void refresh(token);
  });
  const currentOffers = (onboarding?.offers ?? BEGINNER_OFFERS).filter(o => o.part.slot === EQUIPMENT_KIND[socket]);
  const pickedOffer = currentOffers.find(o => o.id === selection);
  const attachedElsewhere = new Set(builds.filter(b => b.bay !== build?.bay).flatMap(b => Object.values(socketsOf(b)).filter((v): v is string => v !== null)));
  const owned = parts.filter(p => p.slot === EQUIPMENT_KIND[socket] && !attachedElsewhere.has(p.uid));
  const buyRegular = (listing: Listing) => mutate(async token => {
    if (intro) { explore(false); return; }
    if (!token) { setNote("Your first 250 coins were for your first build. Connect to earn more in your real garage."); setDrawer("earn"); return; }
    const answer = await buyOnServer(listing.id);
    if (tokenRef.current !== token || !mounted.current) return;
    if (answer.ok) { setMe(v => v ? withBoughtPart(v, listing.id, answer.value.part, answer.value.coins) as PlayerMe : v); setSelection(null); setNote("It is yours. Use it in your next robot."); await refresh(token); }
    else { const message = answer.message ?? "The part could not be bought. Try again."; setNote(message); return { ok: false, message }; }
  });

  const stageTitle = onboarding?.step === "welcome" ? "Your first friend." : mode === "parts" && intro ? "Made by you." : build ? nameText(build.name) : "Your garage";
  const socketTabs = <div className={css.socketGrid} role="group" aria-label="Choose a body part">{EQUIPMENT_SOCKETS.map(s => <button key={s} className={css.socket} aria-label={EQUIPMENT_LABEL[s]} aria-pressed={socket === s} onClick={() => { setSocket(s); setSelection(null); }} disabled={intro && onboarding?.step === "shop" && s !== onboarding.nextSocket}>{shortSocket[s]}</button>)}</div>;
  const introWelcome = onboarding?.step === "welcome";
  const chooseIntro = intro && onboarding?.step === "shop";
  const introPractice = intro && onboarding?.step === "practice";
  const showChoice = mode === "parts" && !introWelcome || mode === "build" && !intro;
  const fullRoom = mode === "community" || starterV2 && !exploring || (!intro || exploring) && (mode === "garage" || mode === "parts");
  const showStats = !feed && !fullRoom && (mode === "build" && !intro || mode === "parts" && chooseIntro);
  const trial = useMemo(() => build ? previewOffer(build, parts, socket, showStats && chooseIntro ? pickedOffer : undefined) : null, [build, parts, socket, showStats, chooseIntro, pickedOffer]);
  const robot = useMemo(() => trial ? engineBuild(trial.build, trial.parts) : null, [trial]);
  const look = useMemo(() => trial ? rigLookOf({ ...liveLook(trial.build), paints: equipmentPaints(trial.build, trial.parts) }, row?.paint ?? "mint") : undefined, [trial, liveLook, row?.paint]);
  const inspectedPart = trial?.parts.find(p => p.uid === socketsOf(trial.build)[socket]);
  const sample = exploring && !signedIn;
  const collectionLook = useCallback((b: Build) => rigLookOf(liveLook(b), me?.bots.find(v => v.bay === b.bay)?.paint ?? "mint"), [liveLook, me?.bots]);
  const allWorn = new Set(builds.flatMap(b => Object.values(socketsOf(b))));
  const spares = parts.filter(p => !allWorn.has(p.uid));

  return <div className={css.shell}>
    <header className={css.top}>
      <button className={css.brand} onClick={() => go("garage")}>Model Kombat<span className={css.subbrand}>A Doma game</span></button>
      {seasonPreview && <div className={css.collectionSwitch} aria-label="Choose your garage"><Link href="/bots?collection=season&tour=1">Season</Link><button aria-pressed>Collection</button></div>}
      <div className={css.topRight}><button className={css.coins} onClick={() => setDrawer("earn")} aria-label={`${ready ? count(totalCoins) : "Checking"} coins. How to earn coins`}><span className={css.coin} aria-hidden>✦</span>{ready ? count(totalCoins) : "…"}<span className={css.desktopOnly}>coins</span></button>
        {seasonPreview && <button className={`${css.quiet} ${css.desktopOnly}`} onClick={showTour}>Show me around</button>}
        <Link className={`${css.quiet} ${css.rulesLink}`} href="/bots/rules">Rules</Link>
        <button className={css.quiet} onClick={() => setDrawer("campaign")}>Prizes</button>
        {signedIn ? <button className={css.quiet} onClick={() => setDrawer("help")}>Help</button> : <button className={css.quiet} disabled={session.busy || session.pending} onClick={connect}>{session.busy || session.pending ? "Connecting…" : "Connect"}</button>}
      </div>
    </header>
    <main className={`${css.workspace} ${fullRoom && !feed ? css.fullRoom : css.artRoom} ${showStats ? css.withStats : ""}`} data-mode={mode} data-scene={mode === "fight" ? "arena" : "workshop"} aria-label={`${mode === "parts" ? "Parts shop" : mode === "build" ? "Build your robot" : mode === "fight" ? "Fight room" : "Your garage"}`}>
      {!ready ? <div className={css.loading}><div><h1 className={css.title}>{signedIn && loadState === "expired" ? "Welcome back." : signedIn && loadState === "failed" ? "Your garage is safe." : "Opening your workshop…"}</h1><p className={css.body}>{signedIn && loadState === "expired" ? "Sign in again to open your saved garage. Your robots are still yours." : signedIn && loadState === "failed" ? "We could not load your saved robot. Please try again." : "Your robot and its parts belong together."}</p>{signedIn && loadState === "expired" && <button className={css.primary} disabled={session.busy || session.pending} onClick={connect}>{session.busy || session.pending ? "Connecting…" : "Open my saved garage"}</button>}{signedIn && loadState === "failed" && <button className={css.primary} onClick={() => { setLoadState("loading"); void refresh(); }}>Try again</button>}</div></div> : feed ? <div className={css.fightHost}>
        {feed.kind === "styles" ? <StyleFight key={JSON.stringify(feed.query)} query={feed.query} embedded onClose={closeFight} /> : feed.kind === "server" ? <ServerFight key={feed.id} id={feed.id} embedded onClose={closeFight} onCloseLabel={feed.tutorial ? "What comes next?" : undefined} onComplete={fightComplete} hideShare={feed.tutorial} /> : <FightClient key={`${feed.props.seed}-${feed.props.ids[0].name}-${feed.tutorial}`} {...feed.props} embedded onClose={closeFight} onCloseLabel={feed.tutorial ? "What comes next?" : undefined} onComplete={fightComplete} hideShare={feed.tutorial || feed.props.replayUrl === "/bots"} />}
      </div> : mode === "community" ? <CommunityRoom battles={battles} state={battlesState} campaign={campaign} onWatch={watch} onPractice={watchShowcase} onScores={() => setDrawer("campaign")} onRetry={() => setRetryFeed(n => n + 1)} /> : starterV2 && !exploring && onboarding?.step === "shop" ? <StarterBuilder build={build!} parts={parts} onboarding={onboarding} socket={socket} busy={busy} signedIn={signedIn} onSocket={s => { setSocket(s); setSelection(null); }} onChoose={(s, id) => void introAction("buy", { socket: s, offerId: id })} onName={saveStarterName} onFinish={finishStarter} onExplore={() => explore(true)} /> : fullRoom ? <div className={css.roomHost}>
        {edit && <div className={css.tourBar}><span>Unsaved changes to {nameText(edit.name)}{styledBuild && !partsLocked && !incomplete ? <>. This robot can fight in practice and against house robots. Player fights need a later update. Finished robots keep their parts.</> : null}</span><button disabled={busy} onClick={() => void saveBuild()}>{busy ? "Saving…" : !partsLocked && !incomplete ? "Finish robot" : "Save my robot"}</button></div>}
        {justFinished && <div className={css.tourBar}><span>{nameText(build!.name)} is ready. {signedIn ? "Saved to your wallet." : "Saved in this browser."}</span><button onClick={() => { setJustFinished(false); openPractice(); }}>Try a practice fight</button><button onClick={() => setJustFinished(false)}>Explore the garage</button></div>}
        {exploring && <div className={css.tourBar}><span>{sample ? "Example robots. Build one of your own." : "Looking around your garage."}</span><button onClick={() => onboarding?.step === "welcome" ? void introAction("welcome") : explore(false)}>{intro ? onboarding?.purchasedCount ? "Continue my build →" : "Build my robot →" : "Back to my robots →"}</button></div>}
        {mode === "parts" ? <WorkshopShop me={signedIn ? me : null} spendable={spendable} introductory={intro} comparison={{ builds: sample ? sampleBuilds : builds, parts: sample ? sampleGarage.parts : parts, selectedBay: sample ? sampleBay : bay, finishedBays: (sample ? sampleBuilds : builds).filter(b => emptySockets(b).length === 0 && !(starterV2 && b.bay === onboarding?.draftBay)).map(b => b.bay) }} onResume={() => onboarding?.step === "welcome" ? void introAction("welcome") : explore(false)} onEarn={() => setDrawer("earn")} onBuy={buyRegular} onReload={() => void refresh()} /> : <GarageRoom builds={sample ? sampleBuilds : builds} parts={sample ? sampleGarage.parts : parts} selectedBay={sample ? sampleBay : build?.bay ?? 1} rows={signedIn ? me?.bots ?? [] : []} sample={sample} busy={busy} onRecycle={!sample && !intro ? recycleRobot : undefined} lookFor={sample ? sampleLook : collectionLook}
          onSelect={sample ? setSampleBay : selectBot} onBuild={sample ? next => { if (sampleGarage.builds[next]) { setSampleBay(next); setDrawer("sample"); } else explore(false); } : openBay}
          onName={() => setDrawer("name")} onFight={sample ? watchShowcase : () => go("fight")} onParts={() => go("parts")} onTools={sample ? () => go("parts") : () => setDrawer("tools")} onEarn={() => setDrawer("earn")} onProgress={() => setDrawer("help")}
          onExplore={!signedIn && !exploring ? () => explore(true) : undefined} nudge={!(nudgeHidden || !signedIn && demo.nudgeDismissed)} onDismiss={dismissNudge} />}
      </div> : <>
        {showStats && trial && saved && <OverallStats build={trial.build} parts={trial.parts} before={saved} beforeParts={parts} preview={!!pickedOffer || !!edit} />}
        <section className={css.stageColumn} aria-label="Your robot">
          <div className={css.stage}><div className={css.stageTop}><p className={css.eyebrow}>{mode === "fight" ? "The arena · your contender" : mode === "build" ? "The build bay · your workbench" : signedIn ? "Your garage" : "Practice garage · saved here"}</p><h1 className={css.title}>{stageTitle}</h1></div>
            {robot && <ToyDisplay build={robot} look={look} mode="interactive" variant={mode === "fight" ? "cutout" : "workbench"} rotation={-.15} selectedSocket={mode === "build" ? socket : undefined} onSocketSelect={mode === "build" && !intro ? s => { setSocket(s); setSelection(null); } : undefined} className={css.toy} ariaLabel={`${nameText(build!.name)} with its chosen parts`} />}
            <div className={css.stageBottom}><span className={css.pill}>{intro ? `${onboarding!.purchasedCount} of 7 parts chosen` : row ? `Level ${row.level} · ${row.wins} wins` : "Practice · no rewards"}</span><button onClick={() => setDrawer("name")} disabled={intro}>Name & face</button></div>
          </div>
          {!intro && <div className={css.robotTabs} aria-label="Choose your robot">{builds.map(b => <button key={b.bay} className={css.robotTab} aria-pressed={build?.bay === b.bay} onClick={() => selectBot(b.bay)}>{nameText(b.name)}</button>)}</div>}
        </section>
        <section className={css.aside} aria-label={mode === "parts" ? "Choose a part" : mode === "build" ? "Your parts" : "Next step"}>
          <div className={css.asideHead}><p className={css.eyebrow}>{introWelcome ? "A place to begin" : chooseIntro ? `Your first build · ${onboarding!.purchasedCount + 1} of 7` : introPractice ? "Ready for the ring" : mode === "garage" ? "Welcome home" : mode === "parts" ? "Today's shipment" : mode === "build" ? "Your parts, your way" : "Let them do the fighting"}</p>
            <h2 className={css.heading}>{introWelcome ? "Hello, little robot." : chooseIntro ? `Choose ${socket === "head" || socket === "torso" || socket === "weapon" ? "a" : "your"} ${EQUIPMENT_LABEL[socket].toLowerCase()}.` : introPractice ? "Meet your first rival." : mode === "garage" ? "What shall we do?" : mode === "parts" ? "Find a new favourite." : mode === "build" ? "Make it yours." : "Pick a fight. Watch it go."}</h2>
            {showChoice && socketTabs}
            {intro && <div className={css.progress} aria-label={`${onboarding!.purchasedCount} of seven parts chosen`}>{BEGINNER_ORDER.map((s, i) => <span key={s} data-done={i < onboarding!.purchasedCount} />)}</div>}
          </div>
          <div className={css.scroll}>
            {showStats && saved && <PartStats part={inspectedPart} before={parts} build={saved} socket={socket} />}
            {introWelcome ? <><Guide>This one is yours, for free. Now let’s build a friend for it.</Guide><p className={css.body}>You have 250 coins set aside for seven parts. Pick the shapes you love. Every first part is equally strong.</p><button className={css.primary} style={{ marginTop: 18 }} disabled={busy} onClick={() => void introAction("welcome")}>Choose my first part →</button><button className={css.secondary} onClick={() => explore(true)}>Look around the workshop</button><p className={css.fine}>{signedIn ? "Your robot and choices save to your account." : "Try it here. Connect any time to open your real garage."}</p></> : chooseIntro ? <>
              {mode !== "parts" ? <><Guide>Let’s finish your new robot, one part at a time.</Guide><button className={css.primary} onClick={() => go("parts")}>Choose {EQUIPMENT_LABEL[socket].toLowerCase()}</button></> : <><p className={css.body} style={{ marginBottom: 13 }}>{socket === "armR" || socket === "legR" ? "This side can look different. Pick any one you like." : "Same three stats: 1, 1, 1. Which shape feels like yours?"}</p><div className={css.partGrid}>{currentOffers.map(o => <PartChoice key={o.id} part={o.part} paint={o.color} selected={selection === o.id} onClick={() => setSelection(o.id)} caption={`${o.price} coins`} />)}</div></>}
            </> : introPractice ? <><Guide>All seven parts fit. Let’s see them move.</Guide><p className={css.body}>Your new robot will face your welcome robot. This is practice. No parts, coins, or progress can be lost.</p><button className={css.primary} style={{ marginTop: 18 }} disabled={busy || !!edit} onClick={() => void introAction("practice")}>{busy ? "Opening the ring…" : "Watch my first fight →"}</button><p className={css.fine}>You watch. Your robot does the rest.</p></> : mode === "garage" ? <>
              <Guide>{edit ? "You have a change to save before your next fight." : "Build another robot to try new parts."}</Guide>
              {edit ? <button className={css.primary} disabled={busy} onClick={() => void saveBuild()}>Save my robot</button> : <button className={css.primary} onClick={() => go("build")}>Build my robot <IconWrench size={18} /></button>}
              <button className={css.secondary} onClick={() => go("fight")}>Take it to a fight <IconWeapon size={18} /></button>
              <div className={css.milestones}><span className={css.milestone} data-done={true}>A robot of your own</span>{onboarding?.milestones.assembled && <span className={css.milestone} data-done={true}>First build</span>}{onboarding?.milestones.practiced && <span className={css.milestone} data-done={true}>First practice</span>}</div>
              {!(nudgeHidden || (!signedIn && demo.nudgeDismissed)) && <div className={css.nudge}><button className={css.dismiss} onClick={dismissNudge} aria-label="Hide this suggestion">×</button><p className={css.body}>Want more parts? Let Doma trades earn your next coins.</p><button className={css.secondary} onClick={() => setDrawer("earn")}>Show me how</button></div>}
              <button className={css.secondary} onClick={() => go("community")}>See what others are building</button>
            </> : mode === "build" ? <><p className={css.body} style={{ marginBottom: 13 }}>{partsLocked ? "These parts stay with your finished robot. Build another to try new parts." : `${EQUIPMENT_LABEL[socket]}. Choose a part to put it on.`}</p>{partsLocked && <button className={css.secondary} onClick={beginAnother}>Build another robot →</button>}<div className={css.partGrid}>{owned.filter(p => !partsLocked || socketsOf(build!)[socket] === p.uid).map(p => <PartChoice disabled={partsLocked} key={p.uid} part={p} paint={p.paint} selected={socketsOf(build!)[socket] === p.uid} onClick={() => choosePart(p)} caption={socketsOf(build!)[socket] === p.uid ? "On your robot" : "Put it on"} />)}</div>{owned.length === 0 && <><p className={css.body}>There is no spare {EQUIPMENT_LABEL[socket].toLowerCase()} here yet.</p><button className={css.secondary} onClick={() => go("parts")}>Find one in Parts</button></>}</> : <>
              {incomplete ? <><Guide>Your robot needs all seven pieces before a fight.</Guide><button className={css.primary} onClick={() => go("build")}>Finish my robot</button></> : styledBuild ? <>
                <Guide>{styledBody ? `${STYLE_GUIDE[styledBody.style].label} body · ${styledBody.special?.name ?? "Body special"}. You choose when to use your special move.` : "Add a Tank, Speed or Ranged body to use the new fighting styles."}</Guide>
                <p className={css.body}>Try your exact robot in practice. No coins, points or repairs.</p>
                <button className={css.primary} disabled={busy || !!edit || !styledBody} onClick={() => openPractice()}>Fight with my robot</button>
                {signedIn && row?.engineVersion === 5 && <><h3 className={css.heading} style={{ fontSize: 22, marginTop: 20 }}>Face a house robot</h3><div className={css.list}>{(["easy", "medium", "hard"] as const).map(difficulty => <button className={css.listRow} key={difficulty} disabled={busy || !!edit} onClick={() => startFight(difficulty)}><strong>{difficulty === "easy" ? "Easy rival" : difficulty === "medium" ? "Even match" : "Hard rival"}</strong><small>Use your special move</small></button>)}</div></>}
                <p className={css.fine}>Player fights need a later update.</p>
                <details><summary>See the three styles</summary>{FIGHTING_STYLES.map(style => <p key={style}><Link href={stylePreviewHref(style)}>{STYLE_GUIDE[style].label}: {STYLE_GUIDE[style].strength}</Link></p>)}</details>
              </> : signedIn ? <>
                <p className={css.body}>{row?.inShop ? "This robot is being repaired. Choose another robot or watch a fight." : `${row?.attacksLeft ?? 0} attacks left today. A real loss can mean a day for repairs.`}</p>
                {battlesState === "loading" ? <p className={css.fine}>Finding rivals…</p> : battlesState === "failed" ? <p className={css.fine}>The ring could not load. You can still watch the practice fight.</p> : <div className={css.list}>{battles?.pve.map(rival => <button className={css.listRow} disabled={busy || !!row?.inShop || !row?.attacksLeft || !!edit} key={rival.difficulty} onClick={() => startFight(rival.difficulty)}><strong>{rival.title} · {rival.shapeName}</strong>{rival.feel}<small>{rival.coinsWin} coins for a win · {rival.points} points</small></button>)}</div>}
                {!!battles?.defenders.length && <><h3 className={css.heading} style={{ fontSize: 23, marginTop: 24 }}>Neighbouring robots</h3><p className={css.fine}>Put in 25 coins to challenge a player. You can lose those coins.</p><div className={css.list}>{battles.defenders.slice(0, 6).map(rival => <button className={css.listRow} key={rival.botId} disabled={busy || spendable < 25 || rival.challengedToday || !!row?.inShop || !row?.attacksLeft || !!edit} onClick={() => startFight(undefined, rival.botId)}><strong>{rival.name}</strong>{rival.gapWords ?? "Ready in the ring"}<small>Challenge · 25 coins</small></button>)}</div></>}
              </> : <><Guide>Try another practice fight with your new robot.</Guide><button className={css.primary} onClick={() => openPractice(false)}>Watch my robot fight</button><p className={css.fine}>No coins, points, wins, or repairs in this practice garage.</p><button className={css.secondary} onClick={connect}>Connect for real fights</button></>}
              <button className={css.secondary} onClick={watchShowcase}>Watch a practice fight</button><button className={css.secondary} onClick={() => go("community")}>Watch the community</button>
            </>}
          </div>
          {chooseIntro && mode === "parts" && <div className={css.selection}><p className={css.body}>{pickedOffer ? `${pickedOffer.part.name} · ${pickedOffer.price} coins. It goes straight on your robot.` : "Tap a part to choose it."} · {reserved} coins reserved</p><button className={css.primary} disabled={!pickedOffer || busy} onClick={() => pickedOffer && void introAction("buy", { socket, offerId: pickedOffer.id })}>{busy ? "Putting it on…" : pickedOffer ? `Choose this ${EQUIPMENT_KIND[socket] === "arms" ? "arm" : EQUIPMENT_KIND[socket] === "legs" ? "leg" : EQUIPMENT_LABEL[socket].toLowerCase()}` : "Pick your favourite above"}</button></div>}
          {!intro && mode === "build" && <div className={css.selection}>{incomplete > 0 && <p className={css.body}>{incomplete} empty {incomplete === 1 ? "space" : "spaces"}. Add every part to fight.</p>}{styledBuild && !partsLocked && !incomplete && <p className={css.body}>This robot can fight in practice and against house robots. Player fights need a later update. Finished robots keep their parts. You can still change their name, face and stickers.</p>}{edit ? <button className={css.primary} disabled={busy} onClick={() => void saveBuild()}>{busy ? "Saving…" : !partsLocked && !incomplete ? "Finish robot" : "Save my robot"}</button> : <p className={css.savedNote} role="status">All changes saved</p>}{!edit && !incomplete && <button className={css.secondary} onClick={() => go("fight")}>Take it to a fight →</button>}</div>}
        </section>
      </>}
    </main>

    <nav className={css.nav} aria-label="Game rooms">{([{ id: "garage", label: "Garage", Icon: IconGarage }, { id: "parts", label: "Parts", Icon: IconPegboard }, { id: "build", label: "Build", Icon: IconWrench }, { id: "fight", label: "Fight", Icon: IconWeapon }] as const).map(({ id, label, Icon }) => <button key={id} className={css.navButton} aria-current={!drawer && mode === id ? "page" : undefined} onClick={() => { if (sample && id === "build") setDrawer("sample"); else if (exploring && id === "fight") watchShowcase(); else if (id === "build" && !intro) beginAnother(); else go(id); }}><Icon size={22} />{label}</button>)}<button className={`${css.navButton} ${css.navExtra}`} aria-current={mode === "community" ? "page" : undefined} onClick={() => go("community")}><IconStar size={22} />Community</button><button className={css.navButton} aria-current={drawer === "help" ? "page" : undefined} onClick={() => setDrawer("help")}><span aria-hidden style={{ fontSize: 23, lineHeight: "22px", fontWeight: 800 }}>?</span>Help</button></nav>
    {(note || session.error) && <p role="status" className={css.status}>{note || session.error}</p>}
    {ready && !feed && starterV2 && onboarding?.step === "welcome" && !exploring && !trailerOpen && !tourOpen && !garageConflict && !handoffFailed && <EntryDialog title="Build your own robot." onClose={() => explore(true)}><p>Choose seven parts. Give it a name. Watch it fight.</p><p className={entryCss.allowance}>You get 250 starter coins to build your first robot.</p><button className={entryCss.primary} disabled={busy} onClick={() => void introAction("welcome")}>Build my robot</button><button className={entryCss.secondary} onClick={() => explore(true)}>Look around</button>{seasonPreview && <button className={entryCss.textButton} onClick={showTour}>Show me around</button>}<button className={entryCss.textButton} onClick={() => setTrailerOpen(true)}>Watch trailer</button><small>{signedIn ? "Your choices save to this wallet." : "No wallet needed to try. Your choices save in this browser."}</small></EntryDialog>}
    {tourOpen && <WorkshopTour returning={tourReturning} robotName={!intro && build ? nameText(build.name) : undefined} robotPreview={!intro && !incomplete && robot ? <ToyDisplay build={robot} look={look} mode="static" ariaLabel={build ? nameText(build.name) : "Your saved robot"} /> : undefined} onClose={closeTour} onBuild={() => { closeTour(); if (tourReturning) go("garage"); else if (onboarding?.step === "welcome") void introAction("welcome"); else explore(false); }} />}
    {garageConflict && <EntryDialog title="Two saved garages." onClose={() => setGarageConflict(false)}><p>This wallet already has a garage. Your browser robot is still saved here, too.</p><button className={entryCss.primary} onClick={() => { setGarageConflict(false); go("garage"); }}>Open my wallet garage</button><button className={entryCss.secondary} onClick={() => { setGarageConflict(false); session.signOut(); go("garage"); }}>Keep practicing in this browser</button></EntryDialog>}
    {handoffFailed && <EntryDialog title="Your browser robot is safe." onClose={() => { setHandoffFailed(false); session.signOut(); }}><p>We could not finish saving your choices to this wallet. Your browser build is still here.</p><button className={entryCss.primary} disabled={busy} onClick={retryPracticeTransfer}>{busy ? "Saving choices…" : "Try saving again"}</button><button className={entryCss.secondary} disabled={busy} onClick={() => { setHandoffFailed(false); session.signOut(); go("garage"); }}>Keep practicing in this browser</button></EntryDialog>}
    {trailerOpen && <TrailerPlayer onClose={() => setTrailerOpen(false)} />}
    {drawer && <GameDrawer wide={drawer === "earn"} room={drawer === "community" ? "street" : drawer === "campaign" ? "arena" : drawer === "tools" ? "cabinet" : "workshop"} title={drawer === "sample" ? "A workshop character" : drawer === "tools" ? "Your tool board" : drawer === "earn" ? "Feed your robot" : drawer === "campaign" ? "Model Kombat prizes" : drawer === "community" ? "Community" : drawer === "name" || drawer === "look" ? "A little personality" : "A helping hand"} onClose={() => { setDrawer(null); setResetAsk(false); const url = new URL(window.location.href); url.searchParams.delete("panel"); window.history.replaceState(null, "", url.pathname + url.search); }}>
      {drawer === "sample" ? <><div style={{height:340}}><ToyDisplay build={engineBuild(sampleGarage.builds[sampleBay], sampleGarage.parts)} look={sampleLook(sampleGarage.builds[sampleBay])} mode="interactive" variant="workshop" ariaLabel={nameText(sampleGarage.builds[sampleBay].name)} /></div><h3>{nameText(sampleGarage.builds[sampleBay].name)}</h3><p>A sample robot from the workshop. Every arm, leg and tool can be chosen separately.</p><button className={css.primary} onClick={watchShowcase}>Watch a sample fight</button><button className={css.secondary} onClick={() => explore(false)}>{intro ? "Continue my first build" : "Back to my robots"}</button></> : drawer === "tools" ? <><p>Spare parts, ready for your next idea.</p><div className={css.partGrid}>{spares.map(p => <PartChoice key={p.uid} part={p} paint={p.paint} selected={false} caption="Use in a new robot" onClick={() => { setSocket(EQUIPMENT_SOCKETS.find(s => EQUIPMENT_KIND[s] === p.slot)!); beginAnother(); }} />)}</div>{!spares.length && <p>No spare parts yet. The cabinet gets a new shipment every day.</p>}<button className={css.secondary} onClick={() => go("parts")}>Open the parts cabinet</button></> : drawer === "earn" ? <EarnDashboard token={session.token} me={me} practiceCoins={demo.coins} preview={robot && build ? { build: robot, look, ariaLabel: nameText(build.name) } : undefined} onConnect={connect} onWatch={watch} onShop={() => go("parts")} onFight={() => go("fight")} /> : drawer === "campaign" ? <CampaignPanel view={campaign} period={period} onPeriod={setPeriod} /> : drawer === "help" ? <>{resetAsk ? <div className={css.callout}><strong>Start this practice garage again?</strong><p>Your local practice choices will be cleared. Your connected account is untouched.</p><button className={css.primary} onClick={() => { setDemo(freshGameDemo(defaultOnboardingVersion())); setEdit(null); setBay(1); setFeed(null); go("garage"); setResetAsk(false); }}>Yes, start again</button><button className={css.secondary} onClick={() => setResetAsk(false)}>Keep my robot</button></div> : <HelpPanel demo={!signedIn} onEarn={() => setDrawer("earn")} onCampaign={() => setDrawer("campaign")} onReset={() => setResetAsk(true)} onSignOut={() => { session.signOut(); setDrawer(null); go("garage"); }} />}{!resetAsk && <>{seasonPreview && <button className={css.primary} onClick={showTour}>Show me around</button>}<button className={css.secondary} onClick={() => explore(true)}>Look around the workshop</button>{progressPanel}</>}</> : drawer === "community" ? <><div className={css.callout}><strong>Watch other robots fight.</strong><p>This is the community room, also called Sprocket Row. Watch recent player fights and see the competition leaders.</p><p>Choose a fight below to watch its replay. The robots wear the parts they used in that fight.</p></div>{battlesState === "loading" ? <p>Finding recent fights…</p> : battles?.recent.length ? <div className={css.list}>{battles.recent.slice(0, 15).map(f => <button key={f.id} className={css.listRow} onClick={() => watch(f.id)}><strong>{f.winnerName} won a fight</strong>{f.names[0]} vs {f.names[1]}<small>Watch · {f.seconds} seconds</small></button>)}</div> : <p>No player fights are ready to watch yet. Try a practice replay below.</p>}<button className={css.primary} style={{ marginTop: 20 }} onClick={watchShowcase}>Watch a practice fight</button><button className={css.secondary} onClick={() => setDrawer("campaign")}>See competition scores</button></> : build ? <><div style={{ height: 210, borderRadius: 18, overflow: "hidden", marginBottom: 18 }}><ToyDisplay build={robot!} look={look} ariaLabel={nameText(build.name)} /></div><details className={css.nameDetails}><summary>{nameText(build.name)} · Change name</summary><NamePicker name={build.name} onChange={name => { if (!busyRef.current) setEdit({ ...build, name, look: { ...(build.look ?? NO_LOOK), plateNumber: name.num } }); }} /></details><LookPicker look={build.look ?? NO_LOOK} earned={earned} colours={colours} onChange={changeLook} compact /><button className={css.primary} disabled={!edit || busy} onClick={async () => { await saveBuild(); }}>{busy ? "Saving…" : !partsLocked && !incomplete ? "Finish robot" : "Save my robot"}</button><p className={css.fine}>Parts keep their own colours. Earned hats and decorations stay with the robot.</p>{progressPanel}</> : null}
    </GameDrawer>}
  </div>;
}

function PartChoice({ part, paint, selected, onClick, caption, bought, disabled }: { part: PartCard; paint?: BeginnerOffer["color"]; selected: boolean; onClick: () => void; caption: string; bought?: boolean; disabled?: boolean }) {
  return <button className={css.part} disabled={disabled} aria-pressed={selected} onClick={onClick} aria-label={`${part.name}. ${caption}`}><div className={css.partArt}><PartDisplay part={part} paint={paint} variant="cutout" ariaLabel={part.name} /></div>{bought && <span className={css.partBought}>Yours</span>}<span className={css.partLabel}><strong>{part.name}</strong><small>{caption}</small><PartNumbers part={part} /></span></button>;
}
