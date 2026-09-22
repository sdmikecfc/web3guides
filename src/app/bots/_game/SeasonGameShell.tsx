"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconGarage, IconPegboard, IconWeapon, IconWrench, IconStar } from "../_ui/icons";
import { useBotsSession } from "../battles/useBotsSession";
import { clearFightQuery, fightRoomHref, FIGHT_QUERY_KEYS } from "@/lib/bots/fight-navigation";
import type { SeasonStateResponse } from "@/lib/bots/season/types";
import type { BattlesView } from "../_server/types";
import { readGameView } from "@/lib/bots/view-fetch";
import { GAME_DEMO_KEY } from "@/lib/bots/game-demo";
import V6ToyPicture from "../_components/V6ToyPicture";
import SeasonWorkshop, { type SeasonRoom } from "./SeasonWorkshop";
import CommunityRoom, { type CommunityRoomProps } from "./CommunityRoom";
import WorkshopTour, { WORKSHOP_TOUR_KEY, WORKSHOP_TOUR_VERSION } from "./WorkshopTour";
import WorkshopLesson from "./WorkshopLesson";
import EntryDialog from "./EntryDialog";
import TrailerPlayer from "./TrailerPlayer";
import css from "./game.module.css";
import entry from "./entry.module.css";
import seasonCss from "./season-workshop.module.css";

const SeasonFight = dynamic(() => import("../fight/season/SeasonFightClient"), { ssr: false, loading: () => <div className={css.loading}><p>Opening your ring… Your room buttons stay below.</p></div> });
const RemasterFight = dynamic(() => import("../fight/remaster/RemasterFightClient"), { ssr: false, loading: () => <div className={css.loading}><p>Opening the remaster… Your room buttons stay below.</p></div> });
type Room = SeasonRoom | "community";
const validRoom = (value: string | null): Room => value === "parts" || value === "build" || value === "fight" || value === "community" ? value : "garage";
/** Separate hydration prevents a season visit from enrolling or changing a legacy garage. */
export default function SeasonGameShell() {
  const params = useSearchParams(), session = useBotsSession({ seasonOnly: true }), mode = validRoom(params.get("view"));
  const remaster = mode === "fight" && params.get("combat") === "7" && (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_BOTS_REMASTER_PREVIEW === "1");
  const fighting = mode === "fight" && (params.get("combat") === "6" || remaster);
  const query = Object.fromEntries([...FIGHT_QUERY_KEYS, ...(remaster ? ["clean"] : [])].map(key => [key, params.get(key) ?? undefined]));
  const [balance, setBalance] = useState<number | null>(null), [state, setState] = useState<SeasonStateResponse | null>(null);
  const [seasonLoadState, setSeasonLoadState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [welcome, setWelcome] = useState(false), [tour, setTour] = useState(false), [returning, setReturning] = useState(false), [trailer, setTrailer] = useState(false);
  const [battles, setBattles] = useState<BattlesView | null>(null), [battleStatus, setBattleStatus] = useState<"loading" | "ready" | "failed">("loading"), [retry, setRetry] = useState(0);
  const help = useRef<HTMLDialogElement>(null), scores = useRef<HTMLDialogElement>(null), entered = useRef(false);
  const markTour = () => { try { localStorage.setItem(WORKSHOP_TOUR_KEY, String(WORKSHOP_TOUR_VERSION)); } catch { /* Presentation only. */ } };
  useEffect(() => {
    if (entered.current || !session.ready) return; entered.current = true;
    let seen = 0, oldPlayer = !!session.token;
    try { const value = Number(localStorage.getItem(WORKSHOP_TOUR_KEY) ?? 0); if (Number.isFinite(value)) seen = value; } catch { /* The tour also works without storage. */ }
    try { const previous = JSON.parse(localStorage.getItem(GAME_DEMO_KEY) ?? "null"); oldPlayer ||= previous?.onboarding?.step === "complete"; } catch { /* An unreadable classic save must not override the separate tour choice. */ }
    setReturning(oldPlayer);
    if (seen < WORKSHOP_TOUR_VERSION && !fighting && params.get("tour") !== "1") { if (oldPlayer) setTour(true); else setWelcome(true); }
  }, [session.ready, session.token, fighting, params]);
  const navigate = useCallback((next: Room) => { markTour(); setWelcome(false); setTour(false); help.current?.close(); scores.current?.close(); const url = new URL(window.location.href); clearFightQuery(url.searchParams); url.searchParams.delete("panel"); url.searchParams.delete("tour"); url.searchParams.delete("clean"); url.searchParams.set("collection", "season"); if (next === "garage") url.searchParams.delete("view"); else url.searchParams.set("view", next); window.history.replaceState(null, "", `${url.pathname}${url.search}`); }, []);
  const closeTour = () => { markTour(); setTour(false); setWelcome(false); };
  const showTour = () => { help.current?.close(); setWelcome(false); setReturning(!!state?.roster.length || returning); setTour(true); };
  useEffect(() => {
    if (mode !== "community") return;
    const controller = new AbortController(); let busy = false;
    const update = () => { if (document.hidden || busy) return; busy = true; void readGameView<BattlesView>("/api/bots/battles", controller.signal).then(value => { if (controller.signal.aborted) return; if (value?.ok) setBattles(value); setBattleStatus(value?.ok ? "ready" : "failed"); }).catch(() => { if (!controller.signal.aborted) setBattleStatus("failed"); }).finally(() => { busy = false; }); };
    update(); const timer = setInterval(update, 30000); document.addEventListener("visibilitychange", update);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [mode, retry]);
  const collectionHref = "/bots?collection=classic&tour=1";
  const seasonRows = (state?.standings ?? []).slice().sort((a, b) => a.rank - b.rank);
  const scoreMessage = !session.ready || seasonLoadState === "loading" ? seasonRows.length ? "Updating season scores…" : "Loading season scores…" : !session.token ? "Connect your wallet to load season scores." : seasonLoadState === "unavailable" ? seasonRows.length ? "Season scores could not refresh. Showing the last scores loaded." : "Season scores are not available. Practice is still open." : seasonRows.length ? "Ranked player fights set these ratings. Practice and house fights do not change rank." : "No season scores yet. Player fights will set the board.";
  const seasonScores: NonNullable<CommunityRoomProps["seasonScores"]> = { state: seasonLoadState, period: state?.season?.name ?? "Current season", message: scoreMessage, rows: seasonRows.map(row => ({ rank: row.rank, name: row.botName, rating: row.rating })) };
  const watch = (id: string) => { const query = new URLSearchParams({ view: "fight", collection: "classic", replay: id }); window.location.assign(`/bots?${query}`); };
  return <div className={css.shell}>
    <header className={css.top}><button className={css.brand} onClick={() => navigate("garage")}>Model Kombat<span className={css.subbrand}>A Doma game</span></button><div className={css.collectionSwitch} aria-label="Choose your garage"><button aria-pressed>Season</button><Link href={collectionHref}>Collection</Link></div><div className={css.topRight}><button className={css.coins} onClick={() => { navigate("garage"); }} aria-label={`${balance ?? 0} season coins`}><span className={css.coin} aria-hidden>✦</span>{balance ?? "—"}<span className={css.desktopOnly}>season coins</span></button><button className={`${css.quiet} ${css.desktopOnly}`} onClick={showTour}>Show me around</button><Link className={`${css.quiet} ${css.rulesLink}`} href="/bots/rules">Rules</Link><button className={css.quiet} disabled={session.busy || session.pending} onClick={() => session.token ? help.current?.showModal() : void session.open()}>{session.token ? "Help" : session.busy || session.pending ? "Connecting…" : "Connect"}</button></div></header>
    <main className={`${css.workspace} ${css.fullRoom}`} aria-label={fighting ? "Fight room" : mode === "community" ? "Community room" : "Season workshop"}>
      <div className={css.seasonHost} hidden={fighting || mode === "community"}><SeasonWorkshop active={!fighting && mode !== "community" && !welcome && !tour && !trailer} mode={mode === "community" ? "garage" : mode} token={session.token} onConnect={() => void session.open()} onNavigate={navigate} onBalance={setBalance} onViewState={setState} onLoadState={setSeasonLoadState} /></div>
      {fighting && <div className={css.fightHost}>{remaster ? <RemasterFight key={JSON.stringify(query)} query={query} embedded onClose={() => navigate("fight")} /> : <SeasonFight key={JSON.stringify(query)} query={query} embedded onClose={() => navigate("fight")} />}</div>}
      {mode === "community" && <CommunityRoom battles={battles} state={battleStatus} campaign={null} seasonScores={seasonScores} onWatch={watch} onPractice={() => { window.location.assign(fightRoomHref(6, { style: "tank", tier: "3" })); }} onScores={() => scores.current?.showModal()} onRetry={() => setRetry(n => n + 1)} />}
    </main>
    <nav className={css.nav} aria-label="Game rooms">{([{ id: "garage", label: "Garage", Icon: IconGarage }, { id: "parts", label: "Parts", Icon: IconPegboard }, { id: "build", label: "Build", Icon: IconWrench }, { id: "fight", label: "Fight", Icon: IconWeapon }, { id: "community", label: "Community", Icon: IconStar }] as const).map(({ id, label, Icon }) => <button key={id} className={`${css.navButton} ${id === "community" ? css.navExtra : ""}`} aria-current={mode === id ? "page" : undefined} onClick={() => navigate(id)}><Icon size={22} />{label}</button>)}<button className={css.navButton} onClick={() => help.current?.showModal()}><span aria-hidden style={{ fontSize: 23, fontWeight: 800 }}>?</span>Help</button></nav>
    {session.error && <p className={css.status} role="status">{session.error}</p>}
    {welcome && !trailer && <EntryDialog title="Build your own robot." onClose={() => navigate("garage")}><p>Choose seven parts. Give it a name. Watch it fight.</p><p className={entry.allowance}>Try building now. Join a season with 250 coins to finish your first robot.</p><button className={entry.primary} onClick={() => navigate("build")}>Build my robot</button><button className={entry.secondary} onClick={() => navigate("garage")}>Look around</button><button className={entry.textButton} onClick={showTour}>Show me around</button><button className={entry.textButton} onClick={() => setTrailer(true)}>Watch trailer</button><small>Trying parts needs no wallet. Your browser choices stay here.</small></EntryDialog>}
    {tour && <WorkshopTour returning={returning} robotName={state?.roster[0]?.name} robotPreview={state?.roster[0] ? <V6ToyPicture build={state.roster[0].build} title={state.roster[0].name} /> : undefined} onClose={closeTour} onBuild={() => { closeTour(); navigate(returning ? "garage" : "build"); }} />}
    {trailer && <TrailerPlayer onClose={() => setTrailer(false)} />}
    <dialog ref={help} className={seasonCss.dialog} aria-label="Workshop help" onClick={e => { if (e.target === e.currentTarget) help.current?.close(); }}><button autoFocus className={seasonCss.close} onClick={() => help.current?.close()} aria-label="Close help">×</button><h2>Your workshop, at a glance.</h2><WorkshopLesson topic="season" compact /><button className={seasonCss.primary} onClick={showTour}>Show me around</button><p>Season coins and robots belong to that season. Your old collection stays yours.</p><Link href={collectionHref}>Open my saved collection →</Link>{session.token && <button onClick={() => { session.signOut(); help.current?.close(); }}>Disconnect wallet</button>}</dialog>
    <dialog ref={scores} className={seasonCss.dialog} aria-label="Season standings" onClick={e => { if (e.target === e.currentTarget) scores.current?.close(); }}><button autoFocus className={seasonCss.close} onClick={() => scores.current?.close()} aria-label="Close scores">×</button><h2>Season rating</h2><p role="status">{scoreMessage}</p>{seasonRows.length > 0 && <div className={seasonCss.scoreRows}>{seasonRows.map(row => <div key={row.wallet}><b>#{row.rank}</b><span><strong>{row.botName}</strong><small>{row.wins} wins · {row.losses} losses</small></span><strong>{row.rating.toLocaleString("en-US", { maximumFractionDigits: 0 })} rating</strong></div>)}</div>}<Link href={fightRoomHref(6, { style: "speed", tier: "3" })}>Try a Speed robot →</Link></dialog>
  </div>;
}
