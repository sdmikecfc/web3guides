"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ToyDisplay, PartDisplay } from "../_components/ToyDisplay";
import { NamePicker } from "../_components/NamePicker";
import { LookPicker } from "../_components/LookPicker";
import { IconGarage, IconPegboard, IconWeapon, IconWrench, IconStar } from "../_ui/icons";
import { useBotsSession } from "../battles/useBotsSession";
import { decodeBotsSession } from "../battles/session";
import { rigLookOf } from "../_view/look-view";
import type { FightClientProps } from "../fight/FightClient";
import type { BattlesView, BotView, EarnedBotView, LookView, MeView } from "../_server/types";
import { CARD_SLOTS, engineBuild, emptySockets, nameText, starterBuild, SLOT_STATS, type Build, type OwnedPart, type PartCard, type Socket } from "@/lib/bots/fixtures";
import { BEGINNER_OFFERS, BEGINNER_ORDER, gameCard, type BeginnerOffer } from "@/lib/bots/beginner-catalog";
import { equipmentPaints, EQUIPMENT_KIND, EQUIPMENT_LABEL, EQUIPMENT_SOCKETS, fitPart, socketsOf, withSockets } from "@/lib/bots/equipment";
import { buildOf, buyOnServer, ownedOf, saveBotOnServer, withBoughtPart, withSavedBot } from "@/lib/bots/live-garage";
import { demoBuy, demoComplete, demoSave, demoWelcome, demoCreateBay, freshGameDemo, GAME_DEMO_KEY, readGameDemo, type GameDemo } from "@/lib/bots/game-demo";
import { NO_LOOK, NO_MARKS, findsOf, normalizeLook, type BotLook } from "@/lib/bots/look";
import type { PaintId } from "../_engine/parts";
import type { OnboardingView } from "@/lib/bots/onboarding-types";
import { type CampaignPeriod, type CampaignView } from "@/lib/bots/campaign-view";
import { SHOWCASE } from "@/lib/bots/showcase";
import type { Listing } from "@/lib/bots/shipment";
import { seedState } from "@/lib/bots/garage-state";
import GarageRoom from "./GarageRoom";
import WorkshopShop from "./WorkshopShop";
import { CampaignPanel, EarningPanel, GameDrawer, HelpPanel } from "./GamePanels";
import { ProgressPanel } from "./ProgressPanel";
import type { ProgressView } from "@/lib/bots/progress-view";
import css from "./game.module.css";

const FightClient = dynamic(() => import("../fight/FightClient"), { ssr: false, loading: () => <div className={css.loading}><p>Opening the ring…</p></div> });
const ServerFight = dynamic(() => import("../fight/FightClient").then(m => m.ServerFight), { ssr: false, loading: () => <div className={css.loading}><p>Opening the ring…</p></div> });
type Mode = "garage" | "parts" | "build" | "fight";
type Drawer = "help" | "earn" | "campaign" | "community" | "name" | "look" | "sample" | "tools" | null;
type Feed = { kind: "server"; id: string; tutorial: boolean } | { kind: "local"; props: FightClientProps; tutorial: boolean } | null;
type PlayerMe = MeView & { onboarding?: OnboardingView | null; player: MeView["player"] & { reservedCoins?: number; spendableCoins?: number } };
const validMode = (s: string | null): Mode => s === "parts" || s === "build" || s === "fight" ? s : "garage";
const shortSocket: Record<Socket, string> = { head: "Head", torso: "Body", armL: "L arm", armR: "R arm", legL: "L leg", legR: "R leg", weapon: "Weapon" };
const count = (n: number) => n.toLocaleString();
const safeMessage = (j: unknown, fallback: string) => {
  const error = j && typeof j === "object" && "error" in j ? (j as { error: unknown }).error : null;
  return typeof error === "string" && error.length < 180 && !/session|token|wallet|database|sql|column|relation|undefined|stack/i.test(error) ? error : fallback;
};
function Guide({ children }: { children: React.ReactNode }) { return <div className={css.guide}><span className={css.guideFace} aria-hidden>••</span><p>{children}</p></div>; }

export default function GameShell() {
  const params = useSearchParams(), session = useBotsSession();
  const [mode, setMode] = useState<Mode>("garage"), [drawer, setDrawer] = useState<Drawer>(null);
  const [demo, setDemo] = useState<GameDemo>(() => freshGameDemo()), [hydrated, setHydrated] = useState(false);
  const [me, setMe] = useState<PlayerMe | null>(null), [loadState, setLoadState] = useState<"loading" | "ready" | "failed" | "expired">("loading");
  const [bay, setBay] = useState(1), [edit, setEdit] = useState<Build | null>(null), [socket, setSocket] = useState<Socket>("head");
  const [selection, setSelection] = useState<string | null>(null), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const [feed, setFeed] = useState<Feed>(null), [battles, setBattles] = useState<BattlesView | null>(null), [battlesState, setBattlesState] = useState<"loading" | "ready" | "failed">("loading");
  const completedTutorial = useRef(false);
  useEffect(() => { completedTutorial.current = false; }, [feed]);
  const [campaign, setCampaign] = useState<CampaignView | null>(null), [earningCampaign, setEarningCampaign] = useState<CampaignView | null>(null), [period, setPeriod] = useState<CampaignPeriod>("final");
  const [earnedRows, setEarnedRows] = useState<EarnedBotView[] | null>(null);
  const [progress, setProgress] = useState<{ token: string; view: ProgressView } | null>(null);
  const [nudgeHidden, setNudgeHidden] = useState(false), [resetAsk, setResetAsk] = useState(false);
  const tokenRef = useRef(session.token), busyRef = useRef(false), mounted = useRef(true), requestEpoch = useRef(0);
  tokenRef.current = session.token;
  const signedIn = !!session.token;
  const exploring = params.get("tour") === "1";
  const [newBay, setNewBay] = useState<number | null>(null), [sampleBay, setSampleBay] = useState(1);
  const sampleGarage = useMemo(() => seedState(0), []);
  const sampleBuilds = useMemo(() => Object.values(sampleGarage.builds), [sampleGarage]);
  const sampleLook = useCallback((b: Build) => rigLookOf({ paints: equipmentPaints(b, sampleGarage.parts), look: { ...NO_LOOK, ...(b.look ?? {}), plateNumber: b.name.num }, marks: NO_MARKS, wins: 0 }, "mint"), [sampleGarage]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestEpoch.current++; }; }, []);
  useEffect(() => { try { setDemo(readGameDemo(localStorage.getItem(GAME_DEMO_KEY))); } catch { setDemo(freshGameDemo()); } setHydrated(true); }, []);
  useEffect(() => { if (hydrated && session.ready && !session.token) { try { localStorage.setItem(GAME_DEMO_KEY, JSON.stringify(demo)); } catch { /* The garage still works when browser storage is full. */ } } }, [demo, hydrated, session.ready, session.token]);
  useEffect(() => { setMode(validMode(params.get("view"))); const open = params.get("panel"); if (open === "earn" || open === "campaign" || open === "community" || open === "help") setDrawer(open); }, [params]);
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
    requestEpoch.current++; setMe(null); setEdit(null); setFeed(null); setBay(1); setNewBay(null); setSelection(null); setNudgeHidden(false); setEarnedRows(null); setEarningCampaign(null); setProgress(null);
    setLoadState(session.token ? "loading" : "ready"); void refresh(session.token);
    try { setNudgeHidden(localStorage.getItem(`bots.earning-note.${session.last?.walletName ?? "practice"}`) === "dismissed"); } catch { /* optional preference */ }
  }, [session.token, session.ready, refresh, session.last?.walletName]);
  useEffect(() => {
    if (!hydrated || !session.ready) return;
    const controller = new AbortController(), token = session.token;
    setCampaign(null);
    void fetch(`/api/bots/campaign?period=${period}`, { cache: "no-store", signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.ok ? r.json() : null).then(v => { if (!controller.signal.aborted && v?.ok) setCampaign(v); }).catch(() => {});
    return () => controller.abort();
  }, [period, session.token, session.ready, hydrated]);

  // Personal earning covers the whole campaign; leaderboard tabs are independent.
  useEffect(() => {
    if (!hydrated || !session.ready || drawer !== "earn" || session.token && !me) return;
    const controller = new AbortController(), token = session.token;
    setEarningCampaign(null);
    const load = () => fetch("/api/bots/campaign?period=final", { cache: "no-store", signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null).then(v => { if (!controller.signal.aborted && tokenRef.current === token) setEarningCampaign(v?.ok ? v : null); }).catch(() => {});
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [drawer, session.token, session.ready, hydrated, me?.campaignEnrollment?.campaignId, me?.campaignEnrollment?.snapshotStatus, !!me]);

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
  const progressPanel = <ProgressPanel signedIn={signedIn} view={progress?.token === session.token ? progress.view : null} onConnect={() => void session.open()} />;

  const onboarding = signedIn ? me?.onboarding ?? null : demo.onboarding;
  const intro = !!onboarding && onboarding.step !== "complete";
  const parts = useMemo(() => signedIn ? me?.parts.map(ownedOf) ?? [] : demo.parts, [signedIn, me?.parts, demo.parts]);
  const builds = useMemo(() => {
    if (!signedIn) return demo.builds;
    if (!me) return [];
    const savedBuilds = me.bots.map(buildOf);
    if (newBay && !savedBuilds.some(b => b.bay === newBay)) savedBuilds.push(starterBuild(newBay));
    // Recycling the last robot leaves a usable empty bay, not an endless loader.
    return savedBuilds.length ? savedBuilds : [withSockets(starterBuild(1), socketsOf(starterBuild(1)))];
  }, [signedIn, me?.bots, demo.builds, newBay]);
  const saved = builds.find(b => b.bay === bay) ?? builds[0] ?? null;
  const build = edit && edit.bay === saved?.bay ? edit : saved;
  const row = me?.bots.find(b => b.bay === build?.bay);
  const totalCoins = signedIn ? me?.player.coins ?? 0 : demo.coins;
  const reserved = onboarding?.reservedCoins ?? me?.player.reservedCoins ?? 0;
  const spendable = signedIn ? me?.player.spendableCoins ?? Math.max(0, totalCoins - reserved) : Math.max(0, totalCoins - reserved);
  const ready = hydrated && session.ready && (!signedIn || loadState === "ready") && !!build;
  const liveLook = useCallback((b: Build): LookView => {
    const actual = me?.bots.find(v => v.bay === b.bay);
    return { paints: equipmentPaints(b, parts), look: { ...(b.look ?? NO_LOOK), plateNumber: b.name.num }, marks: signedIn && actual ? actual.marks : NO_MARKS, wins: signedIn && actual ? actual.wins : 0 };
  }, [me?.bots, parts, signedIn]);
  const robot = useMemo(() => build ? engineBuild(build, parts) : null, [build, parts]);
  const look = useMemo(() => build ? rigLookOf(liveLook(build), row?.paint ?? "mint") : undefined, [build, liveLook, row?.paint]);
  const incomplete = build ? emptySockets(build).length : 7;
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
    if (!(mode === "fight" || drawer === "community") || !session.ready) return;
    const controller = new AbortController(), token = session.token;
    setBattlesState("loading");
    const q = row ? `?bot=${row.id}` : "";
    void fetch(`/api/bots/battles${q}`, { cache: "no-store", signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.ok ? r.json() : null).then(v => { if (controller.signal.aborted) return; setBattles(v?.ok ? v : null); setBattlesState(v?.ok ? "ready" : "failed"); }).catch(() => { if (!controller.signal.aborted) { setBattles(null); setBattlesState("failed"); } });
    return () => controller.abort();
  }, [mode, drawer, row?.id, session.token, session.ready]);

  const go = (next: Mode) => { setMode(next); setSelection(null); if (next !== "fight") setFeed(null); setDrawer(null); const url = new URL(window.location.href); url.searchParams.delete("panel"); if (next === "garage") url.searchParams.delete("view"); else url.searchParams.set("view", next); window.history.replaceState(null, "", `${url.pathname}${url.search}`); };
  const explore = (enabled: boolean) => {
    if (edit) { setNote("Save your changes before looking around."); return; }
    const url = new URL(window.location.href); url.searchParams.delete("panel");
    if (enabled) { url.searchParams.set("tour", "1"); url.searchParams.delete("view"); }
    else { url.searchParams.delete("tour"); if (onboarding?.step === "shop") url.searchParams.set("view", "parts"); else url.searchParams.delete("view"); }
    setMode(!enabled && onboarding?.step === "shop" ? "parts" : "garage"); setFeed(null); setDrawer(null); setSelection(null);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };
  const mutate = async (work: (token: string | null) => Promise<void> | void) => {
    if (busyRef.current) return;
    const claims = tokenRef.current ? decodeBotsSession(tokenRef.current) : null;
    if (claims && claims.exp <= Date.now()) { setLoadState("expired"); return; }
    busyRef.current = true; setBusy(true); const token = tokenRef.current;
    try { await work(token); } catch { if (mounted.current && tokenRef.current === token) setNote("That did not finish. Please try again."); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const introAction = async (action: "welcome" | "buy" | "practice" | "complete", extra?: { socket?: Socket; offerId?: string }) => {
    await mutate(async token => {
      if (!token) {
        if (action === "welcome") { setDemo(demoWelcome); setBay(2); go("parts"); }
        if (action === "buy" && extra?.socket && extra.offerId) { setDemo(v => demoBuy(v, extra.socket!, extra.offerId!)); setEdit(null); setSelection(null); }
        if (action === "practice") openPractice(true);
        if (action === "complete") { setDemo(demoComplete); setNote("Your first build is ready. Nothing was lost in practice."); }
        return;
      }
      const res = await fetch("/api/bots/onboarding", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ t: token, action, ...extra }) });
      const value = await res.json().catch(() => null);
      if (tokenRef.current !== token || !mounted.current) return;
      if (!res.ok || !value?.ok) { setNote(safeMessage(value, "That did not finish. Please try again.")); return; }
      setEdit(null); setSelection(null); await refresh(token);
      if (tokenRef.current !== token || !mounted.current) return;
      if (action === "welcome") { setBay(value.onboarding?.draftBay ?? 2); go("parts"); }
      if (action === "practice" && typeof value.fightId === "string") { go("fight"); setFeed({ kind: "server", id: value.fightId, tutorial: true }); }
      if (action === "complete") setNote("Your first build is ready. Nothing was lost in practice.");
    });
  };

  const openPractice = (tutorial = false) => {
    const mine = tutorial ? builds.find(b => b.bay === onboarding?.draftBay) : build;
    const welcome = builds.find(b => b.bay === onboarding?.welcomeBay) ?? builds[0];
    if (!mine || !welcome || emptySockets(mine).length) { setNote("Add all seven parts first."); return; }
    const a = engineBuild(mine, parts), b = engineBuild(welcome, parts), looks: [LookView, LookView] = [liveLook(mine), liveLook(welcome)];
    go("fight"); setFeed({ kind: "local", tutorial, props: {
      seed: 75, a, b, looks,
      ids: [{ name: nameText(mine.name), wallet: "Your practice garage", wins: 0, losses: 0, strategy: "", paint: "mint" }, { name: nameText(welcome.name), wallet: "Welcome robot", wins: 0, losses: 0, strategy: "", paint: "butter" }],
      mode: "spar", modeLabel: "Welcome practice", replayUrl: "/bots", watchAnotherHref: "/bots?view=fight", rewardLines: ["Practice. No coins, points, wins, or repairs."],
    } });
  };
  const watchShowcase = () => { go("fight"); setFeed({ kind: "local", tutorial: false, props: { seed: 75, a: SHOWCASE.a, b: SHOWCASE.b, ids: [{ name: SHOWCASE.names[0], wallet: "Practice", wins: 0, losses: 0, strategy: "", paint: "mint" }, { name: SHOWCASE.names[1], wallet: "Practice", wins: 0, losses: 0, strategy: "", paint: "coral" }], mode: "spar", modeLabel: "A practice fight", replayUrl: SHOWCASE.href, watchAnotherHref: "/bots?view=fight" } }); };
  const watch = (id: string) => { go("fight"); setFeed({ kind: "server", id, tutorial: false }); };
  const fightComplete = () => { if (feed?.tutorial) { completedTutorial.current = true; void introAction("complete"); } else if (signedIn) void refresh(); };
  const closeFight = () => { const explainEarning = feed?.tutorial && completedTutorial.current; setFeed(null); go("garage"); if (explainEarning) setDrawer("earn"); if (signedIn) void refresh(); };

  const saveBuild = async () => {
    if (!build) return;
    const value = build;
    await mutate(async token => {
      if (!token) { setDemo(v => demoSave(v, value)); setEdit(null); setNote("Saved. This robot is yours."); return; }
      const sockets = socketsOf(value), actual = me?.bots.find(b => b.bay === value.bay);
      const answer = await saveBotOnServer({ bay: value.bay, name: value.name, decal: value.decal, paint: actual?.paint, listed: actual?.listed,
        parts: Object.fromEntries(CARD_SLOTS.map(s => [s, value.cards[s] == null ? null : Number(value.cards[s])])) as BotView["parts"],
        sockets: Object.fromEntries(EQUIPMENT_SOCKETS.map(s => [s, sockets[s] == null ? null : Number(sockets[s])])) as BotView["sockets"], look: value.look ?? NO_LOOK });
      if (tokenRef.current !== token || !mounted.current) return;
      if (answer.ok) { setMe(v => v ? withSavedBot(v, answer.value) as PlayerMe : v); setNewBay(null); setEdit(null); setNote("Saved. This robot is yours."); }
      else setNote(answer.message ?? "Your robot could not be saved. Try again.");
    });
  };
  const selectBot = (next: number) => { if (busyRef.current) return; if (edit) { setNote("Save your changes before choosing another robot."); return; } setBay(next); setSelection(null); const url = new URL(window.location.href); url.searchParams.set("bay", String(next)); window.history.replaceState(null, "", `${url.pathname}${url.search}`); };
  const openBay = (next: number) => {
    if (busyRef.current) return;
    if (intro) { explore(false); return; }
    if (edit && next !== bay) { setNote("Save your changes before choosing another robot."); return; }
    if (!builds.some(b => b.bay === next)) { if (signedIn) setNewBay(next); else setDemo(v => demoCreateBay(v, next)); }
    selectBot(next); go("build");
  };
  const choosePart = (p: OwnedPart) => { if (busyRef.current || !build) return; setEdit(fitPart(build, p, socket)); setSelection(p.uid); };
  const changeLook = (patch: Partial<BotLook>) => { if (!busyRef.current && build) { const next = normalizeLook({ ...(build.look ?? NO_LOOK), ...patch }, earned); setEdit({ ...build, look: next, decal: next.spot === "chest" ? next.sticker : null }); } };
  const dismissNudge = () => { setNudgeHidden(true); if (!signedIn) setDemo(v => ({ ...v, nudgeDismissed: true })); try { localStorage.setItem(`bots.earning-note.${session.last?.walletName ?? "practice"}`, "dismissed"); } catch {} };
  const startFight = (difficulty?: string, defenderBotId?: number) => void mutate(async token => {
    if (!token || !row) { setDrawer("earn"); return; }
    if (edit) { setNote("Save your robot before the fight."); return; }
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
    if (answer.ok) { setMe(v => v ? withBoughtPart(v, listing.id, answer.value.part, answer.value.coins) as PlayerMe : v); setSelection(null); setNote("It is yours. Open Build to put it on."); await refresh(token); }
    else setNote(answer.message ?? "The part could not be bought. Try again.");
  });

  const stageTitle = onboarding?.step === "welcome" ? "Your first friend." : mode === "parts" && intro ? "Made by you." : build ? nameText(build.name) : "Your garage";
  const socketTabs = <div className={css.socketGrid} role="group" aria-label="Choose a body part">{EQUIPMENT_SOCKETS.map(s => <button key={s} className={css.socket} aria-label={EQUIPMENT_LABEL[s]} aria-pressed={socket === s} onClick={() => { setSocket(s); setSelection(null); }} disabled={intro && onboarding?.step === "shop" && s !== onboarding.nextSocket}>{shortSocket[s]}</button>)}</div>;
  const introWelcome = onboarding?.step === "welcome";
  const chooseIntro = intro && onboarding?.step === "shop";
  const introPractice = intro && onboarding?.step === "practice";
  const showChoice = mode === "parts" && !introWelcome || mode === "build" && !intro;
  const fullRoom = (!intro || exploring) && (mode === "garage" || mode === "parts");
  const sample = exploring && !signedIn;
  const collectionLook = useCallback((b: Build) => rigLookOf(liveLook(b), me?.bots.find(v => v.bay === b.bay)?.paint ?? "mint"), [liveLook, me?.bots]);
  const allWorn = new Set(builds.flatMap(b => Object.values(socketsOf(b))));
  const spares = parts.filter(p => !allWorn.has(p.uid));

  return <div className={css.shell}>
    <header className={css.top}>
      <button className={css.brand} onClick={() => go("garage")}>Clanker Cup<span className={css.subbrand}>Your little workshop</span></button>
      <div className={css.topRight}><button className={css.coins} onClick={() => setDrawer("earn")} aria-label={`${ready ? count(totalCoins) : "Checking"} coins. How to earn coins`}><span className={css.coin} aria-hidden>✦</span>{ready ? count(totalCoins) : "…"}<span className={css.desktopOnly}>coins</span></button>
        <button className={css.quiet} onClick={() => setDrawer("campaign")}><span className={css.desktopOnly}>The </span>Cup</button>
        {signedIn ? <button className={css.quiet} onClick={() => setDrawer("help")}>Help</button> : <button className={css.quiet} disabled={session.busy || session.pending} onClick={() => void session.open()}>{session.busy || session.pending ? "Connecting…" : "Connect"}</button>}
      </div>
    </header>
    <main className={`${css.workspace} ${fullRoom && !feed ? css.fullRoom : ""}`} data-mode={mode} aria-label={`${mode === "parts" ? "Parts shop" : mode === "build" ? "Build your robot" : mode === "fight" ? "Fight room" : "Your garage"}`}>
      {!ready ? <div className={css.loading}><div><h1 className={css.title}>{signedIn && loadState === "expired" ? "Welcome back." : signedIn && loadState === "failed" ? "Your garage is safe." : "Opening your workshop…"}</h1><p className={css.body}>{signedIn && loadState === "expired" ? "Sign in again to open your saved garage. Your robots are still yours." : signedIn && loadState === "failed" ? "We could not load your saved robot. Please try again." : "Your robot and its parts belong together."}</p>{signedIn && loadState === "expired" && <button className={css.primary} disabled={session.busy || session.pending} onClick={() => void session.open()}>{session.busy || session.pending ? "Connecting…" : "Open my saved garage"}</button>}{signedIn && loadState === "failed" && <button className={css.primary} onClick={() => { setLoadState("loading"); void refresh(); }}>Try again</button>}</div></div> : feed ? <div className={css.fightHost}>
        {feed.kind === "server" ? <ServerFight key={feed.id} id={feed.id} embedded onClose={closeFight} onCloseLabel={feed.tutorial ? "What comes next?" : undefined} onComplete={fightComplete} hideShare={feed.tutorial} /> : <FightClient key={`${feed.props.seed}-${feed.props.ids[0].name}-${feed.tutorial}`} {...feed.props} embedded onClose={closeFight} onCloseLabel={feed.tutorial ? "What comes next?" : undefined} onComplete={fightComplete} hideShare={feed.tutorial || feed.props.replayUrl === "/bots"} />}
      </div> : fullRoom ? <div className={css.roomHost}>
        {edit && <div className={css.tourBar}><span>Unsaved changes to {nameText(edit.name)}</span><button disabled={busy} onClick={() => void saveBuild()}>{busy ? "Saving…" : "Save my robot"}</button></div>}
        {exploring && <div className={css.tourBar}><span>{sample ? "Sample collection · your first build is saved" : "Looking around · your first build is saved"}</span><button onClick={() => explore(false)}>{intro ? "Continue my first build →" : "Back to my robots →"}</button></div>}
        {mode === "parts" ? <WorkshopShop me={signedIn ? me : null} spendable={spendable} introductory={intro} onResume={() => explore(false)} onEarn={() => setDrawer("earn")} onBuy={buyRegular} onReload={() => void refresh()} /> : <GarageRoom builds={sample ? sampleBuilds : builds} parts={sample ? sampleGarage.parts : parts} selectedBay={sample ? sampleBay : build?.bay ?? 1} rows={signedIn ? me?.bots ?? [] : []} sample={sample} lookFor={sample ? sampleLook : collectionLook}
          onSelect={sample ? setSampleBay : selectBot} onBuild={sample ? next => { if (sampleGarage.builds[next]) { setSampleBay(next); setDrawer("sample"); } else explore(false); } : openBay}
          onName={() => setDrawer("name")} onFight={sample ? watchShowcase : () => go("fight")} onParts={() => go("parts")} onTools={sample ? () => go("parts") : () => setDrawer("tools")} onEarn={() => setDrawer("earn")} onProgress={() => setDrawer("help")}
          onExplore={!signedIn && !exploring ? () => explore(true) : undefined} nudge={!(nudgeHidden || !signedIn && demo.nudgeDismissed)} onDismiss={dismissNudge} />}
      </div> : <>
        <section className={css.stageColumn} aria-label="Your robot">
          <div className={css.stage}><div className={css.stageTop}><p className={css.eyebrow}>{signedIn ? "Your garage" : "Practice garage · saved here"}</p><h1 className={css.title}>{stageTitle}</h1></div>
            {robot && <ToyDisplay build={robot} look={look} mode="interactive" variant="workshop" rotation={-.15} selectedSocket={mode === "build" ? socket : undefined} onSocketSelect={mode === "build" && !intro ? s => { setSocket(s); setSelection(null); } : undefined} className={css.toy} ariaLabel={`${nameText(build!.name)} with its chosen parts`} />}
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
            {introWelcome ? <><Guide>This one is yours, for free. Now let’s build a friend for it.</Guide><p className={css.body}>You have 250 coins set aside for seven parts. Pick the shapes you love. Every first part is equally strong.</p><button className={css.primary} style={{ marginTop: 18 }} disabled={busy} onClick={() => void introAction("welcome")}>Choose my first part →</button><button className={css.secondary} onClick={() => explore(true)}>Look around the workshop</button><p className={css.fine}>{signedIn ? "Your robot and choices save to your account." : "Try it here. Connect any time to open your real garage."}</p></> : chooseIntro ? <>
              {mode !== "parts" ? <><Guide>Let’s finish your new robot, one part at a time.</Guide><button className={css.primary} onClick={() => go("parts")}>Choose {EQUIPMENT_LABEL[socket].toLowerCase()}</button></> : <><p className={css.body} style={{ marginBottom: 13 }}>{socket === "armR" || socket === "legR" ? "This side can look different. Pick any one you like." : "Same three stats: 1, 1, 1. Which shape feels like yours?"}</p><div className={css.partGrid}>{currentOffers.map(o => <PartChoice key={o.id} part={o.part} paint={o.color} selected={selection === o.id} onClick={() => setSelection(o.id)} caption={`${o.price} coins`} />)}</div></>}
            </> : introPractice ? <><Guide>All seven parts fit. Let’s see them move.</Guide><p className={css.body}>Your new robot will face your welcome robot. This is practice. No parts, coins, or progress can be lost.</p><button className={css.primary} style={{ marginTop: 18 }} disabled={busy || !!edit} onClick={() => void introAction("practice")}>{busy ? "Opening the ring…" : "Watch my first fight →"}</button><p className={css.fine}>You watch. Your robot does the rest.</p></> : mode === "garage" ? <>
              <Guide>{edit ? "You have a change to save before your next fight." : "A new part can change the whole little character."}</Guide>
              {edit ? <button className={css.primary} disabled={busy} onClick={() => void saveBuild()}>Save my robot</button> : <button className={css.primary} onClick={() => go("build")}>Build my robot <IconWrench size={18} /></button>}
              <button className={css.secondary} onClick={() => go("fight")}>Take it to a fight <IconWeapon size={18} /></button>
              <div className={css.milestones}><span className={css.milestone} data-done={true}>A robot of your own</span>{onboarding?.milestones.assembled && <span className={css.milestone} data-done={true}>First build</span>}{onboarding?.milestones.practiced && <span className={css.milestone} data-done={true}>First practice</span>}</div>
              {!(nudgeHidden || (!signedIn && demo.nudgeDismissed)) && <div className={css.nudge}><button className={css.dismiss} onClick={dismissNudge} aria-label="Hide this suggestion">×</button><p className={css.body}>Want more parts? Let Doma trades earn your next coins.</p><button className={css.secondary} onClick={() => setDrawer("earn")}>Show me how</button></div>}
              <button className={css.secondary} onClick={() => setDrawer("community")}>See what others are building</button>
            </> : mode === "build" ? <><p className={css.body} style={{ marginBottom: 13 }}>{EQUIPMENT_LABEL[socket]}. Choose a part to put it on.</p><div className={css.partGrid}>{owned.map(p => <PartChoice key={p.uid} part={p} paint={p.paint} selected={socketsOf(build!)[socket] === p.uid} onClick={() => choosePart(p)} caption={socketsOf(build!)[socket] === p.uid ? "On your robot" : "Put it on"} />)}</div>{owned.length === 0 && <><p className={css.body}>There is no spare {EQUIPMENT_LABEL[socket].toLowerCase()} here yet.</p><button className={css.secondary} onClick={() => go("parts")}>Find one in Parts</button></>}</> : <>
              {incomplete ? <><Guide>Your robot needs all seven pieces before a fight.</Guide><button className={css.primary} onClick={() => go("build")}>Finish my robot</button></> : signedIn ? <>
                <p className={css.body}>{row?.inShop ? "This robot is being repaired. Choose another robot or watch a fight." : `${row?.attacksLeft ?? 0} attacks left today. A real loss can mean a day for repairs.`}</p>
                {battlesState === "loading" ? <p className={css.fine}>Finding rivals…</p> : battlesState === "failed" ? <p className={css.fine}>The ring could not load. You can still watch the practice fight.</p> : <div className={css.list}>{battles?.pve.map(rival => <button className={css.listRow} disabled={busy || !!row?.inShop || !row?.attacksLeft || !!edit} key={rival.difficulty} onClick={() => startFight(rival.difficulty)}><strong>{rival.title} · {rival.shapeName}</strong>{rival.feel}<small>{rival.coinsWin} coins for a win · {rival.points} points</small></button>)}</div>}
                {!!battles?.defenders.length && <><h3 className={css.heading} style={{ fontSize: 23, marginTop: 24 }}>Neighbouring robots</h3><p className={css.fine}>Put in 25 coins to challenge a player. You can lose those coins.</p><div className={css.list}>{battles.defenders.slice(0, 6).map(rival => <button className={css.listRow} key={rival.botId} disabled={busy || spendable < 25 || rival.challengedToday || !!row?.inShop || !row?.attacksLeft || !!edit} onClick={() => startFight(undefined, rival.botId)}><strong>{rival.name}</strong>{rival.gapWords ?? "Ready in the ring"}<small>Challenge · 25 coins</small></button>)}</div></>}
              </> : <><Guide>Try another practice fight with your new robot.</Guide><button className={css.primary} onClick={() => openPractice(false)}>Watch my robot fight</button><p className={css.fine}>No coins, points, wins, or repairs in this practice garage.</p><button className={css.secondary} onClick={() => void session.open()}>Connect for real fights</button></>}
              <button className={css.secondary} onClick={watchShowcase}>Watch a practice fight</button><button className={css.secondary} onClick={() => setDrawer("community")}>Watch the community</button>
            </>}
          </div>
          {chooseIntro && mode === "parts" && <div className={css.selection}><p className={css.body}>{pickedOffer ? `${pickedOffer.part.name} · ${pickedOffer.price} coins. It goes straight on your robot.` : "Tap a part to choose it."} · {reserved} coins reserved</p><button className={css.primary} disabled={!pickedOffer || busy} onClick={() => pickedOffer && void introAction("buy", { socket, offerId: pickedOffer.id })}>{busy ? "Putting it on…" : pickedOffer ? `Choose this ${EQUIPMENT_KIND[socket] === "arms" ? "arm" : EQUIPMENT_KIND[socket] === "legs" ? "leg" : EQUIPMENT_LABEL[socket].toLowerCase()}` : "Pick your favourite above"}</button></div>}
          {!intro && mode === "build" && <div className={css.selection}>{incomplete > 0 && <p className={css.body}>{incomplete} empty {incomplete === 1 ? "space" : "spaces"}. Add every part to fight.</p>}<button className={css.primary} disabled={!edit || busy} onClick={() => void saveBuild()}>{busy ? "Saving…" : edit ? "Save my robot" : "All changes saved"}</button>{!edit && !incomplete && <button className={css.secondary} onClick={() => go("fight")}>Take it to a fight →</button>}</div>}
        </section>
      </>}
    </main>

    <nav className={css.nav} aria-label="Game rooms">{([{ id: "garage", label: "Garage", Icon: IconGarage }, { id: "parts", label: "Parts", Icon: IconPegboard }, { id: "build", label: "Build", Icon: IconWrench }, { id: "fight", label: "Fight", Icon: IconWeapon }] as const).map(({ id, label, Icon }) => <button key={id} className={css.navButton} aria-current={mode === id ? "page" : undefined} onClick={() => { if (sample && id === "build") setDrawer("sample"); else if (exploring && id === "fight") watchShowcase(); else go(id); }}><Icon size={22} />{label}</button>)}<button className={`${css.navButton} ${css.navExtra}`} onClick={() => setDrawer("community")}><IconStar size={22} />Community</button><button className={css.navButton} onClick={() => setDrawer("help")}><span aria-hidden style={{ fontSize: 23, lineHeight: "22px", fontWeight: 800 }}>?</span>Help</button></nav>
    {(note || session.error) && <p role="status" className={css.status}>{note || session.error}</p>}
    {drawer && <GameDrawer title={drawer === "sample" ? "A workshop character" : drawer === "tools" ? "Your tool board" : drawer === "earn" ? "Feed your robot" : drawer === "campaign" ? "The Clanker Cup" : drawer === "community" ? "Around the workshop" : drawer === "name" || drawer === "look" ? "A little personality" : "A helping hand"} onClose={() => { setDrawer(null); setResetAsk(false); }}>
      {drawer === "sample" ? <><div style={{height:340}}><ToyDisplay build={engineBuild(sampleGarage.builds[sampleBay], sampleGarage.parts)} look={sampleLook(sampleGarage.builds[sampleBay])} mode="interactive" variant="workshop" ariaLabel={nameText(sampleGarage.builds[sampleBay].name)} /></div><h3>{nameText(sampleGarage.builds[sampleBay].name)}</h3><p>A sample robot from the workshop. Every arm, leg and tool can be chosen separately.</p><button className={css.primary} onClick={watchShowcase}>Watch a sample fight</button><button className={css.secondary} onClick={() => explore(false)}>{intro ? "Continue my first build" : "Back to my robots"}</button></> : drawer === "tools" ? <><p>Spare parts, ready for your next idea.</p><div className={css.partGrid}>{spares.map(p => <PartChoice key={p.uid} part={p} paint={p.paint} selected={false} caption="Open in Build" onClick={() => { const target=EQUIPMENT_SOCKETS.find(s => EQUIPMENT_KIND[s] === p.slot)!; setSocket(target); if (build) setEdit(fitPart(build,p,target)); go("build"); }} />)}</div>{!spares.length && <p>No spare parts yet. The cabinet gets a new shipment every day.</p>}<button className={css.secondary} onClick={() => go("parts")}>Open the parts cabinet</button></> : drawer === "earn" ? <EarningPanel campaign={earningCampaign} signedIn={signedIn} onConnect={() => void session.open()} /> : drawer === "campaign" ? <CampaignPanel view={campaign} period={period} onPeriod={setPeriod} /> : drawer === "help" ? <>{resetAsk ? <div className={css.callout}><strong>Start this practice garage again?</strong><p>Your local practice choices will be cleared. Your connected account is untouched.</p><button className={css.primary} onClick={() => { setDemo(freshGameDemo()); setEdit(null); setBay(1); setFeed(null); go("garage"); setResetAsk(false); }}>Yes, start again</button><button className={css.secondary} onClick={() => setResetAsk(false)}>Keep my robot</button></div> : <HelpPanel demo={!signedIn} onEarn={() => setDrawer("earn")} onCampaign={() => setDrawer("campaign")} onReset={() => setResetAsk(true)} onSignOut={() => { session.signOut(); setDrawer(null); go("garage"); }} />}{!resetAsk && <><button className={css.secondary} onClick={() => explore(true)}>Look around the workshop</button>{progressPanel}</>}</> : drawer === "community" ? <><div className={css.callout}><strong>Something small. Something proud.</strong><p>Watch a real replay from another garage. Every part in a replay is the part that robot wore at the bell.</p></div>{battlesState === "loading" ? <p>Finding recent fights…</p> : battles?.recent.length ? <div className={css.list}>{battles.recent.slice(0, 15).map(f => <button key={f.id} className={css.listRow} onClick={() => watch(f.id)}><strong>{f.winnerName} won a fight</strong>{f.names[0]} vs {f.names[1]}<small>Watch · {f.seconds} seconds</small></button>)}</div> : <p>No recent community fights are available yet.</p>}<button className={css.primary} style={{ marginTop: 20 }} onClick={watchShowcase}>Watch a practice fight</button><button className={css.secondary} onClick={() => setDrawer("campaign")}>See the cup leaders</button></> : build ? <><div style={{ height: 210, borderRadius: 18, overflow: "hidden", marginBottom: 18 }}><ToyDisplay build={robot!} look={look} ariaLabel={nameText(build.name)} /></div><details className={css.nameDetails}><summary>{nameText(build.name)} · Change name</summary><NamePicker name={build.name} onChange={name => { if (!busyRef.current) setEdit({ ...build, name, look: { ...(build.look ?? NO_LOOK), plateNumber: name.num } }); }} /></details><LookPicker look={build.look ?? NO_LOOK} earned={earned} colours={colours} onChange={changeLook} compact /><button className={css.primary} disabled={!edit || busy} onClick={async () => { await saveBuild(); }}>{busy ? "Saving…" : "Save my robot"}</button><p className={css.fine}>Parts keep their own colours. Earned hats and decorations stay with the robot.</p>{progressPanel}</> : null}
    </GameDrawer>}
  </div>;
}

function PartChoice({ part, paint, selected, onClick, caption, bought }: { part: PartCard; paint?: BeginnerOffer["color"]; selected: boolean; onClick: () => void; caption: string; bought?: boolean }) {
  return <button className={css.part} aria-pressed={selected} onClick={onClick} aria-label={`${part.name}. ${caption}`}><div className={css.partArt}><PartDisplay part={part} paint={paint} ariaLabel={part.name} /></div>{bought && <span className={css.partBought}>Yours</span>}<span className={css.partLabel}><strong>{part.name}</strong><small>{caption}</small></span></button>;
}

function PartNumbers({ part }: { part: PartCard }) { const names: Record<string, string> = { speed: "Speed", strength: "Strength", dodge: "Dodge", damage: "Damage", block: "Block", health: "Health", luck: "Luck", accuracy: "Aim", attackSpeed: "Hit speed" }; return <div className={css.stats}>{SLOT_STATS[part.slot].map((key, index) => <span key={key}>{names[key]} <strong>{part.s[index]}</strong></span>)}</div>; }
