"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FightRoomFrame from "../../_game/FightRoomFrame";
import { createFightSceneV6, type FightSceneV6 } from "../../_view/v6-fight-scene";
import { createBotsSfx, savedBotsSound, type BotsSfx } from "../../_view/sfx";
import { authHeaders, readBotsSession } from "../../battles/session";
import { createFightV6, stepFightV6, acceptSpecialV6, presetV6, CATALOG_V6, FAMILIES_V6, weaponCompatibilityV6 } from "@/lib/bots/v6";
import type { StateV6, StyleV6, SpecialCommandV6, BuildV6, EventV6, TierV6 } from "@/lib/bots/v6/types";
import { seasonPracticeBuild, type SeasonPracticeQuery } from "@/lib/bots/season/practice";
import type { SeasonMatch, SeasonMatchResponse } from "@/lib/bots/season/types";
import { acceptsSeasonSnapshot, advanceSeasonPicture, seasonMoment, seasonPayoutText } from "@/lib/bots/season/live-playback";
import css from "./season-fight.module.css";

export type SeasonFightQuery = SeasonPracticeQuery;
const STYLES: StyleV6[] = ["tank", "speed", "ranged"];
const LABEL = { tank: "Tank", speed: "Speed", ranged: "Ranged" };
const NAMES = { tank: "Boiler knight", speed: "Roller daredevil", ranged: "Owl-eyed ranger" };
const uid = () => crypto.randomUUID();
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const inputKey = (id: string) => `bots:season:special:${id}`;
function savedInput(id: string) { try { return sessionStorage.getItem(inputKey(id)); } catch { return null; } }
function saveInput(id: string, input: string | null) { try { if (input) sessionStorage.setItem(inputKey(id), input); else sessionStorage.removeItem(inputKey(id)); } catch { /* In-memory retries still use the same ID when storage is unavailable. */ } }
function status(s: StateV6, side: 0 | 1) {
  const f = s.fighters[side];
  if (s.done) return s.winner === side ? "Winner" : "Fight over";
  if (f.downUntil > s.frame) return "Getting up";
  if (f.stunnedUntil > s.frame) return "Stunned";
  if (f.special) return s.builds[side].capabilities.special.name;
  if (f.overheated) return "Cooling down";
  if (f.burn) return "Burning";
  if (f.slowUntil > s.frame) return "Slowed";
  return f.action ? f.action.released ? "Recovering" : "Preparing attack" : "Finding an opening";
}
export default function SeasonFightClient({ query, embedded = false, onClose }: { query: SeasonFightQuery; embedded?: boolean; onClose?: () => void }) {
  const [practiceQuery, setPracticeQuery] = useState<SeasonPracticeQuery>(() => ({ ...query, session: undefined }));
  const [rival, setRival] = useState<StyleV6>(STYLES.includes(query.rival as StyleV6) ? query.rival as StyleV6 : "ranged");
  const [seed, setSeed] = useState(query.seed !== undefined && Number.isInteger(Number(query.seed)) && Number(query.seed) >= 0 && Number(query.seed) <= 4294967295 ? Number(query.seed) : 75), [running, setRunning] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [hud, setHud] = useState<StateV6 | null>(null), [live, setLive] = useState<SeasonMatch | null>(null);
  const [pending, setPending] = useState(false), [replaying, setReplaying] = useState(false), [reduced, setReduced] = useState(false), [cinematic, setCinematic] = useState(true), [sound, setSound] = useState(false);
  const [stats, setStats] = useState({ fps: 0, dents: 0, scorches: 0, vertices: 0, gripError: 0, drawCalls: 0, triangles: 0, drawMs: 0, crowd: false });
  const canvas = useRef<HTMLCanvasElement>(null), host = useRef<HTMLDivElement>(null), scene = useRef<FightSceneV6 | null>(null), state = useRef<StateV6 | null>(null), audio = useRef<BotsSfx | null>(null);
  const authority = useRef<SeasonMatch | null>(null), replayInputs = useRef<SpecialCommandV6[]>([]), replayCursor = useRef(0), lastInput = useRef<string | null>(null);
  const requestLatch = useRef<string | null>(null), activeSession = useRef(query.session), generation = useRef(0), initQueue = useRef<Promise<unknown>>(Promise.resolve());
  const inputAbort = useRef<AbortController | null>(null);
  activeSession.current = query.session;
  const controls = useRef({ running, replaying, cinematic, reduced }), soundCursor = useRef(0), initial = useRef<StateV6 | null>(null);
  controls.current = { running, replaying, cinematic, reduced };
  const practiceChoice = useMemo(() => {
    try { return { ...seasonPracticeBuild(practiceQuery), error: "" }; }
    catch (error) { return { build: presetV6("tank", 1), name: "Robot link unavailable", linked: true, error: error instanceof Error ? error.message : "Open this robot from your garage again." }; }
  }, [practiceQuery]);
  const style = practiceChoice.build.style, tier = practiceChoice.build.tier;
  const practice = useMemo(() => [practiceChoice.build, presetV6(rival, tier, { signature: !!practiceChoice.build.parts.weapon.signature && tier >= 3 })] as [BuildV6, BuildV6], [practiceChoice.build, rival, tier]);
  const practiceError = query.session ? "" : practiceChoice.error;
  const chooseExample = (next: SeasonPracticeQuery) => { controls.current.running = false; setRunning(false); setReplaying(false); setPracticeQuery(next); };
  const currentLive = live?.id === query.session ? live : null;
  const builds = currentLive?.builds ?? practice, liveMode = !!query.session;
  const sceneKey = liveMode ? currentLive?.id ?? `waiting:${query.session}` : "practice";
  const buildKey = JSON.stringify(builds.map(b => [b.appearanceBuild, b.rulesVersion, b.assetVersion, b.collisionVersion]));
  useEffect(() => { const media = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduced(media.matches); update(); media.addEventListener("change", update); setSound(savedBotsSound()); audio.current = createBotsSfx(savedBotsSound()); return () => { media.removeEventListener("change", update); audio.current?.dispose(); }; }, []);
  useEffect(() => audio.current?.setMuted(!sound), [sound]);
  const receive = useCallback((session: SeasonMatch) => {
    const old = authority.current;
    if (!activeSession.current || !acceptsSeasonSnapshot(old, session, activeSession.current)) return false;
    authority.current = session; setLive(session);
    if (!controls.current.replaying) {
      if (!state.current) state.current = copy(session.state);
      setHud(copy(session.state));
      // A final reply may arrive while the picture is still playing its confirmed last hit.
      const playing = !state.current.done;
      controls.current.running = playing; setRunning(playing);
    }
    const id = lastInput.current;
    const receipt = id ? session.inputs.find(i => i.inputId === id) : undefined;
    if (id && (receipt || session.status === "complete" || session.viewerSide === 1)) {
      lastInput.current = null; saveInput(session.id, null);
      if (requestLatch.current === id) { requestLatch.current = null; setPending(false); }
    }
    setNotice(receipt?.accepted === false ? receipt.reason ?? "Special was not ready." : "");
    return true;
  }, []);
  useEffect(() => {
    generation.current++;
    inputAbort.current?.abort(); inputAbort.current = null;
    authority.current = null; state.current = null; initial.current = null; requestLatch.current = null; lastInput.current = null;
    controls.current.replaying = false; controls.current.running = false;
    setLive(null); setHud(null); setReady(false); setPending(false); setReplaying(false); setRunning(false); setNotice("");
    if (!query.session) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    const session = query.session;
    const abort = new AbortController();
    lastInput.current = savedInput(session);
    async function poll() {
      try {
        const token = readBotsSession(); if (!token) throw new Error("Connect your wallet in the garage to resume this fight.");
        const response = await fetch(`/api/bots/season/matches/${encodeURIComponent(session)}`, { headers: authHeaders(token), cache: "no-store", signal: abort.signal }), body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "The fight is reconnecting.");
        if (cancelled) return; receive((body as SeasonMatchResponse).session);
        if (authority.current?.id === session && authority.current.status === "complete") return;
      } catch (e) { if (!cancelled) setNotice(e instanceof Error ? e.message : "The fight is reconnecting."); }
      if (!cancelled) timer = setTimeout(poll, document.hidden ? 2500 : 350);
    }
    void poll(); return () => { cancelled = true; abort.abort(); inputAbort.current?.abort(); clearTimeout(timer); generation.current++; };
  }, [query.session, receive]);
  useEffect(() => {
    if (!canvas.current || !host.current || liveMode && !currentLive) return;
    let dead = false, raf = 0, last = 0, accumulator = 0, since = 0, count = 0, localScene: FightSceneV6 | undefined;
    setReady(false); setError("");
    if (practiceError) { setError(practiceError); setHud(null); controls.current.running = false; setRunning(false); return; }
    let fresh: StateV6;
    try {
      fresh = liveMode && authority.current ? copy(authority.current.state) : createFightV6(seed, builds[0], builds[1]);
      initial.current = createFightV6(fresh.seed, fresh.builds[0], fresh.builds[1], { autoSpecial: fresh.autoSpecial, defensePlans: fresh.defensePlans });
    } catch {
      setError("This fight needs its saved robot and combat rules. Your saved result is safe.");
      controls.current.running = false; setRunning(false); return;
    }
    state.current = fresh; setHud(copy(fresh));
    controls.current.replaying = false; controls.current.running = liveMode && !fresh.done;
    setReplaying(false); setRunning(controls.current.running); soundCursor.current = fresh.events.length;
    const resize = () => { if (host.current) { const r = host.current.getBoundingClientRect(); localScene?.resize(r.width, r.height, devicePixelRatio); } };
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    const targetCanvas = canvas.current;
    // A cancelled async scene finishes disposing before another scene uses this canvas.
    initQueue.current = initQueue.current.catch(() => undefined).then(async () => {
      if (dead) return;
      const render = await createFightSceneV6(targetCanvas, builds);
      if (dead) { render.dispose(); return; } localScene = render; scene.current = render; resize(); setReady(true);
      function loop(now: number) {
        if (dead) return; raf = requestAnimationFrame(loop);
        const elapsed = Math.min(.1, (now - (last || now)) / 1000); last = now;
        if (document.hidden || !state.current) { audio.current?.stop(); return; }
        const s = state.current, c = controls.current;
        if (c.running && !s.done) {
          if (liveMode && !c.replaying && authority.current) {
            accumulator += elapsed;
            const confirmed = authority.current.state;
            const catchUp = Math.max(0, confirmed.frame - s.frame - 24);
            try { advanceSeasonPicture(s, confirmed, Math.floor(accumulator * 60) + catchUp); }
            catch { state.current = copy(confirmed); soundCursor.current = confirmed.events.length; render.reset(); }
            accumulator = Math.min(1 / 60, accumulator % (1 / 60));
          } else {
            accumulator += elapsed;
            while (accumulator >= 1 / 60 && !s.done) {
              if (c.replaying) while (replayCursor.current < replayInputs.current.length && replayInputs.current[replayCursor.current].frame === s.frame) acceptSpecialV6(s, replayInputs.current[replayCursor.current++]);
              stepFightV6(s); accumulator -= 1 / 60;
            }
          }
        } else accumulator = 0;
        const picture = state.current!;
        render.render(picture, now, c.cinematic, c.reduced);
        while (soundCursor.current < picture.events.length) { const event = picture.events[soundCursor.current++]; if (picture.frame - event.frame > 8) continue; if (event.kind === "hit") audio.current?.impact(event.weapon); else if (event.kind === "windup") audio.current?.windup(event.weapon ?? "hammer", event.who); }
        count++; if (now - since > 250) { setHud(copy(liveMode && !c.replaying && authority.current ? authority.current.state : picture)); setStats({ ...render.stats(), fps: Math.round(count * 1000 / Math.max(1, now - since)) }); count = 0; since = now; }
        if (picture.done && c.running) { if (!c.replaying) replayInputs.current = copy(picture.commands); controls.current.running = false; setRunning(false); setHud(copy(picture)); }
      }
      raf = requestAnimationFrame(loop);
    }).catch(e => { if (!dead) setError(e instanceof Error ? e.message : "The arena could not load. Your robots are safe."); });
    return () => { dead = true; cancelAnimationFrame(raf); observer.disconnect(); localScene?.dispose(); if (scene.current === localScene) scene.current = null; audio.current?.stop(); };
    // Build identity, not each polled state, owns the renderer lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildKey, sceneKey, seed, liveMode, practiceError]);
  const special = useCallback(async () => {
    if (!scene.current || !initial.current || requestLatch.current || controls.current.replaying || !controls.current.running || !state.current || state.current.done) return;
    audio.current?.unlock();
    if (!liveMode) { const receipt = acceptSpecialV6(state.current, { id: uid(), who: 0, kind: "special", frame: state.current.frame }); if (!receipt.accepted) setNotice(receipt.reason ?? "Special is still charging."); else setNotice(""); setHud(copy(state.current)); return; }
    const session = authority.current, token = readBotsSession(); if (!session || session.id !== activeSession.current || session.viewerSide === 1 || session.status !== "running" || session.state.done || !token) return;
    const inputId = lastInput.current ?? uid(), epoch = generation.current;
    lastInput.current = inputId; requestLatch.current = inputId; saveInput(session.id, inputId); setPending(true);
    const abort = new AbortController(); inputAbort.current = abort;
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(`/api/bots/season/matches/${encodeURIComponent(session.id)}/input`, { method: "POST", headers: { ...authHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify({ inputId, kind: "special" }), signal: abort.signal }), body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? "Special could not connect. Tap again to retry.");
      if (epoch !== generation.current) return;
      const accepted = receive(body.session);
      if (accepted && body.input?.accepted === false) setNotice(body.input.reason ?? "Special was not ready.");
    } catch (e) { if (epoch === generation.current && lastInput.current === inputId) setNotice(abort.signal.aborted ? "Special is reconnecting. Tap Retry Special to try the same press again." : e instanceof Error ? e.message : "Tap Special again to retry."); }
    finally { clearTimeout(timeout); if (inputAbort.current === abort) inputAbort.current = null; if (epoch === generation.current && requestLatch.current === inputId) { requestLatch.current = null; setPending(false); } }
  }, [liveMode, receive]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.code !== "Space" || event.repeat || event.target instanceof Element && event.target.closest("input,select,textarea,button,dialog,a,[contenteditable=true]")) return; event.preventDefault(); void special(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [special]);
  function restart(replay = false, at = 0) {
    if (!initial.current) return;
    if (liveMode && (!replay || authority.current?.status !== "complete")) return;
    if (liveMode && authority.current) replayInputs.current = copy(authority.current.state.commands);
    else if (!replaying && state.current) replayInputs.current = copy(state.current.commands);
    const s = copy(initial.current); replayCursor.current = 0;
    while (!s.done && s.frame < at) { while (replayCursor.current < replayInputs.current.length && replayInputs.current[replayCursor.current].frame === s.frame) acceptSpecialV6(s, replayInputs.current[replayCursor.current++]); stepFightV6(s); }
    state.current = s; controls.current.replaying = replay; controls.current.running = true;
    scene.current?.reset(); soundCursor.current = s.events.length; audio.current?.stop(); setHud(copy(s)); setReplaying(replay); setRunning(true); setNotice("");
  }
  const viewer = currentLive?.viewerSide ?? 0, describe = (event: EventV6) => seasonMoment(event, viewer);
  const meter = Math.min(100, hud?.fighters[viewer].meter ?? 0), finished = !!hud?.done, moments = hud?.events.filter(e => describe(e)).slice(-5) ?? [];
  const canReplay = !liveMode || currentLive?.status === "complete";
  return <FightRoomFrame embedded={embedded} onClose={onClose} title={liveMode ? "Season fight" : "New robot practice"}
    tools={<label className={css.option}><input type="checkbox" checked={cinematic && !reduced} disabled={reduced} onChange={e => setCinematic(e.target.checked)} /> {reduced ? "Steady camera · reduced motion" : "Moving camera"}</label>}
    arena={<section className={css.arena} ref={host}><canvas ref={canvas} aria-label="Robot fight arena" />
      <div className={css.hud}>{hud?.fighters.map((f, i) => <div key={i}><strong>{currentLive?.identities[i].name ?? (i === 0 ? practiceChoice.name : NAMES[rival])}</strong><span>{hud.builds[i].gp} GP · {LABEL[hud.builds[i].style]}</span><progress max={hud.stats[i].armour[1]} value={Math.max(0, f.armour[1])} /><small>{status(hud, i as 0 | 1)}</small></div>)}</div>
      {!ready && <div className={css.loading} role={error ? "alert" : "status"}><strong>{error || "Bringing your robots into the ring…"}</strong>{error && <p>Use the room buttons below to continue.</p>}</div>}
      <div className={css.dentCount}>{stats.dents} dents · {stats.scorches} scorch marks</div>
    </section>}
    status={<>{notice && <p className={css.notice} role="status">{notice}</p>}{finished && <div className={css.result}><strong><span>{hud?.winner === viewer ? "Your robot wins!" : "The rival wins this one."}</span>{liveMode && currentLive && <> · <small>{seasonPayoutText(currentLive)}</small></>}</strong><button disabled={!ready || !canReplay} onClick={() => restart(true)}>Watch replay</button>{!liveMode && <button onClick={() => restart(false)}>Fight again</button>}<details><summary>Why this result</summary>{moments.map(e => <button disabled={!canReplay} key={e.id} className={css.moment} onClick={() => restart(true, Math.max(0, e.frame - 45))}>{describe(e)} <span>↗ {Math.floor(e.frame / 60)}s</span></button>)}</details></div>}</>}
    special={<div className={css.actionBar}>{!liveMode && !running && !finished ? <button className={css.primary} disabled={!ready} onClick={() => { audio.current?.unlock(); controls.current.running = true; setRunning(true); }}>Start practice fight</button> : <button className={`${css.primary} ${meter >= 100 ? css.charged : ""}`} disabled={!ready || !running || finished || replaying || pending || viewer === 1 || liveMode && currentLive?.status !== "running" || meter < 100 && !lastInput.current} onClick={() => void special()}>{replaying || viewer === 1 ? "Recorded fight" : finished ? "Fight complete" : pending ? "Sending Special…" : lastInput.current ? "Retry Special" : hud?.fighters[viewer].special ? `${hud.builds[viewer].capabilities.special.name} active` : meter >= 100 ? `${hud?.builds[viewer].capabilities.special.name} · Space` : `Special charging · ${Math.floor(meter)}%`}</button>}<progress aria-label="Special charge" max={100} value={meter} /><small>{viewer === 1 ? "Your saved defense plan ran this fight. Watch its replay." : replaying ? "Replaying the recorded Special presses." : liveMode ? "Your robot moves and attacks. You choose when to use Special." : "Practice only. No coins or repairs."}</small></div>}
    setup={!liveMode ? <div className={css.setup}><p>{practiceError ? "This link could not open. Choose a practice example below." : practiceChoice.linked ? "These are the exact parts from your link. Trying another example leaves your saved robot unchanged." : "Try six robot families, four tiers and different weapons. Practice costs no coins."}</p><label>Practice example<select value={practiceChoice.linked ? "linked" : practice[0].parts.torso.family ?? ""} onChange={e => chooseExample({ family: e.target.value, tier: String(tier) })}>{practiceChoice.linked && <option value="linked" disabled>{practiceError ? "Choose an example" : practiceChoice.name}</option>}{FAMILIES_V6.map(f => <option key={f.id} value={f.id}>{LABEL[f.style]} · {f.name}</option>)}</select></label><label>Tier<select disabled={practiceChoice.linked} value={tier} onChange={e => chooseExample({ family: practice[0].parts.torso.family ?? undefined, tier: e.target.value })}>{([1, 2, 3, 4] as TierV6[]).map(value => <option key={value} value={value}>Tier {value}</option>)}</select></label><label>Weapon<select disabled={practiceChoice.linked} value={practice[0].parts.weapon.id} onChange={e => chooseExample({ family: practice[0].parts.torso.family ?? undefined, tier: String(tier), weapon: e.target.value })}>{CATALOG_V6.filter(c => c.slot === "weapon" && c.tier === tier && weaponCompatibilityV6(c.id, practice[0].parts.torso.id).compatible).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Rival<select value={rival} onChange={e => { setRunning(false); setReplaying(false); setRival(e.target.value as StyleV6); }}>{STYLES.map(s => <option key={s} value={s}>{LABEL[s]} · {NAMES[s]}</option>)}</select></label><label>Fight seed<input type="number" min={0} max={4294967295} value={seed} onChange={e => { setRunning(false); setSeed(Number(e.target.value) >>> 0); }} /></label></div> : undefined}
    details={<div className={css.details}><strong>{builds[viewer].capabilities.special.name}</strong><p>{builds[viewer].capabilities.special.description}</p><p>{builds[viewer].capabilities.special.ending}</p><label><input type="checkbox" checked={sound} onChange={e => { setSound(e.target.checked); if (e.target.checked) { audio.current?.setMuted(false); audio.current?.unlock(); } }} /> Sound</label>{process.env.NODE_ENV === "development" && <p>Render: {stats.fps} FPS · {stats.drawCalls} draws · {stats.triangles.toLocaleString()} triangles · {stats.drawMs.toFixed(1)} ms. Damage: {stats.vertices.toLocaleString()} moved vertices. Reach limit: {Math.round(stats.gripError * 1000)} mm.</p>}</div>}
  />;
}
