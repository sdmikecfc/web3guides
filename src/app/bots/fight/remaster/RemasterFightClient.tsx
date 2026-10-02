"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FightRoomFrame from "../../_game/FightRoomFrame";
import { createFightSceneV7 } from "../../_view/v7-fight-scene";
import { createRemasterAudio } from "../../_view/v7-audio";
import { AFTERMATH_FRAMES_V7, FPS_V7, MAX_FRAMES_V7, acceptSpecialV7, createFightV7, createHeroBuildV7, resultV7, stepFightV7, type BuildV7, type ResultV7, type SpecialCommandV7, type StateV7 } from "@/lib/bots/v7";
import { REMASTER_STYLES, assertRemasterProof, readRemasterQuery, remasterFrame, remasterPreviewEnabled, remasterTime, type RemasterMode, type RemasterQuery, type RemasterStyle } from "./playback";
import css from "./remaster-fight.module.css";

const LABEL = { tank: "Tank", speed: "Speed", ranged: "Ranged" };
const HELP = { tank: "Heavy armour. A powerful hammer.", speed: "Quick feet. Two sharp blades.", ranged: "Make room. Line up the shot." };
type Scene = Awaited<ReturnType<typeof createFightSceneV7>>;
type Audio = ReturnType<typeof createRemasterAudio>;
type Hud = Pick<StateV7, "done" | "frame" | "winner" | "stats"> & { fighters: Pick<StateV7["fighters"][number], "armour" | "meter" | "special">[] };
interface VideoOptions { startFrame?: number; frames?: number; fps?: number; width?: number; height?: number; download?: boolean; untilDone?: boolean }
const clone = <T,>(value: T): T => structuredClone(value);
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000); }

/** Local proof room. It never reads accounts, awards coins, or writes player builds. */
export default function RemasterFightClient({ query = {}, embedded = false, onClose }: { query?: RemasterQuery; embedded?: boolean; onClose?: () => void }) {
  const initialQuery = useMemo(() => readRemasterQuery(query), []);
  const [style, setStyle] = useState<RemasterStyle>(initialQuery.style), [rival, setRival] = useState<RemasterStyle>(initialQuery.rival);
  const [seed, setSeed] = useState(initialQuery.seed), [seedText, setSeedText] = useState(String(initialQuery.seed));
  const [mode, setMode] = useState<RemasterMode>(initialQuery.mode), [focusSide, setFocusSide] = useState<0 | 1>(0), [autoSpecial, setAutoSpecial] = useState(false);
  const [running, setRunning] = useState(false), [ready, setReady] = useState(false), [replaying, setReplaying] = useState(false), [recording, setRecording] = useState(false);
  const [cinematic, setCinematic] = useState(true), [reduced, setReduced] = useState(false), [sound, setSound] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null), [displayFrame, setDisplayFrame] = useState(0), [furthest, setFurthest] = useState(0), [hasReplay, setHasReplay] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null), host = useRef<HTMLElement>(null), scene = useRef<Scene | null>(null), audio = useRef<Audio | null>(null);
  const state = useRef<StateV7 | null>(null), visual = useRef(0), maxFrame = useRef(0), recorded = useRef<ResultV7 | null>(null), commands = useRef<SpecialCommandV7[]>([]), commandIndex = useRef(0), soundCursor = useRef(0);
  const alive = useRef(true), queue = useRef<Promise<unknown>>(Promise.resolve()), captureAbort = useRef<AbortController | null>(null);
  const controls = useRef({ running, replaying, mode, focusSide, cinematic, reduced, sound }); controls.current = { running, replaying, mode, focusSide, cinematic, reduced, sound };
  const builds = useMemo(() => [createHeroBuildV7(style), createHeroBuildV7(rival)] as [BuildV7, BuildV7], [style, rival]);
  const showroom = useMemo(() => createFightV7(builds, seed, { autoSpecial: [false, false], defensePlans: ["balanced", "balanced"] }), [builds, seed]);
  const key = `${style}:${rival}:${seed}:${autoSpecial}`;
  const publish = useCallback(() => { const s = state.current; if (!s || !alive.current) return; setHud({ done: s.done, frame: s.frame, winner: s.winner, stats: s.stats, fighters: s.fighters.map(f => ({ armour: f.armour.slice(), meter: f.meter, special: f.special ? { ...f.special } : null })) }); setDisplayFrame(visual.current); setFurthest(maxFrame.current); }, []);
  const draw = useCallback(() => { const s = state.current, c = controls.current; if (s && scene.current) scene.current.render(c.mode === "turntable" ? showroom : s, visual.current * 1000 / FPS_V7, c.cinematic, c.reduced, visual.current); }, [showroom]);
  const pause = useCallback(() => { controls.current.running = false; setRunning(false); audio.current?.stop(); publish(); }, [publish]);
  const play = useCallback(() => { if (!scene.current || captureAbort.current) return; audio.current?.unlock(); controls.current.running = true; setRunning(true); }, []);

  const seek = useCallback((frame: number, source = commands.current) => {
    if (captureAbort.current) return null;
    pause();
    if (controls.current.mode === "turntable") { visual.current = Math.max(0, Math.floor(frame)); }
    else { const rebuilt = remasterFrame(builds, seed, autoSpecial, source, frame); state.current = rebuilt.state; visual.current = rebuilt.displayFrame; commandIndex.current = rebuilt.commandIndex; if (rebuilt.state.done && !recorded.current) { recorded.current = resultV7(rebuilt.state); commands.current = clone(rebuilt.state.commands); setHasReplay(true); } }
    if (controls.current.mode !== "turntable") maxFrame.current = Math.max(maxFrame.current, visual.current); soundCursor.current = state.current?.events.length ?? 0;
    controls.current.replaying = true; setReplaying(true); scene.current?.reset(); draw(); publish(); return state.current ? clone(state.current) : null;
  }, [autoSpecial, builds, draw, pause, publish, seed]);

  const reset = useCallback(() => {
    if (captureAbort.current) return;
    pause(); state.current = createFightV7(builds, seed, { autoSpecial: [autoSpecial, true], defensePlans: ["balanced", "balanced"] });
    visual.current = 0; maxFrame.current = 0; recorded.current = null; commands.current = []; commandIndex.current = 0; soundCursor.current = 0;
    controls.current.replaying = false; setReplaying(false); setHasReplay(false); setNotice(""); scene.current?.reset(); draw(); publish();
  }, [autoSpecial, builds, draw, pause, publish, seed]);
  const replay = useCallback(() => { const result = recorded.current; if (!result || captureAbort.current) return; try { assertRemasterProof(builds, result); commands.current = clone(result.commands); seek(0, commands.current); controls.current.replaying = true; setReplaying(true); play(); } catch (e) { pause(); setError(e instanceof Error ? e.message : "This preview cannot replay. Reload to start a new fight."); setReady(false); } }, [builds, pause, play, seek]);
  const useSpecial = useCallback(() => {
    const s = state.current, c = controls.current;
    if (!s || s.done || !c.running || c.replaying || c.mode === "turntable" || autoSpecial || captureAbort.current) return;
    audio.current?.unlock(); const input: SpecialCommandV7 = { id: crypto.randomUUID(), who: 0, kind: "special", frame: s.frame }, receipt = acceptSpecialV7(s, input);
    if (receipt.accepted) { commands.current = clone(s.commands); commandIndex.current = commands.current.length; setNotice(""); } else setNotice(receipt.reason ?? "Special is not ready yet.");
    publish();
  }, [autoSpecial, publish]);

  useEffect(() => {
    alive.current = true; const media = matchMedia("(prefers-reduced-motion: reduce)"), update = () => setReduced(media.matches); update(); media.addEventListener("change", update);
    audio.current = createRemasterAudio(); audio.current.setMuted(true);
    return () => { alive.current = false; captureAbort.current?.abort(); media.removeEventListener("change", update); audio.current?.dispose(); audio.current = null; };
  }, []);
  useEffect(() => audio.current?.setMuted(!sound), [sound]);
  useEffect(() => { const hidden = () => { if (document.hidden) { captureAbort.current?.abort(); pause(); } }; document.addEventListener("visibilitychange", hidden); return () => document.removeEventListener("visibilitychange", hidden); }, [pause]);
  useEffect(() => {
    if (!canvas.current || !host.current || !remasterPreviewEnabled()) return;
    let dead = false, raf = 0, last = 0, accumulator = 0, lastUi = 0, localScene: Scene | null = null;
    setReady(false); setError(""); reset(); const target = canvas.current;
    const resize = () => { if (!captureAbort.current && host.current) { const r = host.current.getBoundingClientRect(); localScene?.resize(r.width, r.height, devicePixelRatio); draw(); } };
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    queue.current = queue.current.catch(() => undefined).then(async () => {
      if (dead) return;
      const c = controls.current, handle = await createFightSceneV7(target, builds, { mode: c.mode, focusSide: c.focusSide });
      if (dead) { handle.dispose(); return; } localScene = handle; scene.current = handle;
      const latest = controls.current; handle.setPresentation({ mode: latest.mode, focusSide: latest.focusSide, orbit: latest.cinematic && !latest.reduced });
      resize(); setReady(true); draw();
      function loop(time: number) {
        if (dead) return; raf = requestAnimationFrame(loop);
        const dt = Math.min(.1, Math.max(0, (time - (last || time)) / 1000)); last = time;
        if (document.hidden || captureAbort.current || !state.current) { accumulator = 0; return; }
        const s = state.current, control = controls.current;
        if (!control.running) { accumulator = 0; return; }
        try {
        if (control.running) {
          accumulator += dt;
          while (accumulator >= 1 / FPS_V7) {
            accumulator -= 1 / FPS_V7;
            if (control.mode === "turntable") { visual.current++; }
            else if (!s.done) {
              if (control.replaying) while (commandIndex.current < commands.current.length && commands.current[commandIndex.current].frame === s.frame) {
                const receipt = acceptSpecialV7(s, commands.current[commandIndex.current++]); if (!receipt.accepted) throw new Error("The recorded Special could not replay.");
              }
              stepFightV7(s); visual.current = s.frame;
              if (s.done && !control.replaying) { recorded.current = resultV7(s); commands.current = clone(s.commands); setHasReplay(true); }
            } else if (visual.current < s.frame + AFTERMATH_FRAMES_V7) { visual.current++; }
            else { control.running = false; setRunning(false); break; }
          }
          if (control.mode !== "turntable") maxFrame.current = Math.max(maxFrame.current, visual.current);
        } else accumulator = 0;
        draw(); while (soundCursor.current < s.events.length) { const event = s.events[soundCursor.current++]; if (s.frame - event.frame <= 8) audio.current?.event(event); }
        if (time - lastUi > 100) { publish(); lastUi = time; }
        } catch (e) { cancelAnimationFrame(raf); setError(e instanceof Error ? e.message : "The preview could not play."); setReady(false); pause(); }
      }
      raf = requestAnimationFrame(loop);
    }).catch(e => { if (!dead) { setError(e instanceof Error ? e.message : "The preview could not load."); pause(); } });
    return () => { dead = true; captureAbort.current?.abort(); cancelAnimationFrame(raf); observer.disconnect(); localScene?.dispose(); if (scene.current === localScene) scene.current = null; audio.current?.stop(); };
  }, [key, builds, reset, draw, pause, publish]);
  useEffect(() => { pause(); visual.current = mode === "turntable" ? 0 : state.current?.frame ?? 0; const c = controls.current; scene.current?.setPresentation({ mode, focusSide, orbit: c.cinematic && !c.reduced }); scene.current?.reset(); draw(); publish(); }, [mode, focusSide, pause, draw, publish]);
  useEffect(() => { const c = controls.current; scene.current?.setPresentation({ mode: c.mode, focusSide: c.focusSide, orbit: cinematic && !reduced }); draw(); }, [cinematic, reduced, draw]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.code !== "Space" || event.repeat || event.target instanceof Element && event.target.closest("button,input,select,textarea,a,dialog,[contenteditable=true]")) return; event.preventDefault(); void useSpecial(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [useSpecial]);

  const captureFrame = useCallback((format: "image/png" | "image/jpeg" = "image/png") => { if (!canvas.current || !scene.current) return null; draw(); return canvas.current.toDataURL(format, .95); }, [draw]);
  const savePicture = useCallback(async () => { const value = captureFrame(); if (!value) return; const a = document.createElement("a"); a.href = value; a.download = `model-kombat-remaster-${style}-${seed}-${visual.current}.png`; a.click(); setNotice("Picture saved from this exact frame."); }, [captureFrame, seed, style]);
  const recordVideo = useCallback(async (options: VideoOptions = {}) => {
    if (!canvas.current || !scene.current || !state.current || captureAbort.current) throw new Error("The preview is not ready to record.");
    assertRemasterProof(builds, recorded.current);
    if (typeof MediaRecorder === "undefined") throw new Error("Video recording is not available in this browser. Save a picture instead.");
    const fps = options.fps === 60 ? 60 : 30, maximum = Math.ceil((MAX_FRAMES_V7 + AFTERMATH_FRAMES_V7) / FPS_V7 * fps) + 1;
    const frames = Math.max(1, Math.min(maximum, Math.floor(options.frames ?? (options.untilDone ? maximum : fps * 6))));
    const w = Math.max(320, Math.min(1920, Math.floor(options.width ?? 1280))), h = Math.max(240, Math.min(1920, Math.floor(options.height ?? 720)));
    const original = clone(state.current), originalVisual = visual.current, originalIndex = commandIndex.current, controller = new AbortController(); captureAbort.current = controller;
    pause(); setRecording(true); setNotice("Recording the actual fight. Keep this window visible."); audio.current?.unlock();
    const output = document.createElement("canvas"); output.width = w; output.height = h; const ctx = output.getContext("2d");
    let stream: MediaStream | null = null, recorder: MediaRecorder | null = null, done: Promise<Blob> | null = null, recorderStarted = false;
    try {
      if (!ctx || typeof output.captureStream !== "function") throw new Error("This browser cannot record the canvas. Save a picture instead.");
      const startFrame = Math.max(0, Math.floor(options.startFrame ?? originalVisual)), rebuilt = remasterFrame(builds, seed, autoSpecial, commands.current, startFrame);
      if (controls.current.mode !== "turntable") { state.current = rebuilt.state; visual.current = rebuilt.displayFrame; commandIndex.current = rebuilt.commandIndex; } else visual.current = startFrame;
      scene.current.reset(); scene.current.resize(w, h, 1); soundCursor.current = state.current.events.length;
      draw(); ctx.drawImage(canvas.current, 0, 0, w, h);
      stream = output.captureStream(0); const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      if (!track || typeof track.requestFrame !== "function") throw new Error("This browser cannot capture individual frames. Save a picture instead.");
      const soundStream = controls.current.sound ? audio.current?.captureStream() : null, soundTracks = soundStream?.getAudioTracks().map(t => t.clone()) ?? []; soundTracks.forEach(t => stream!.addTrack(t));
      const types = soundTracks.length ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4"] : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/mp4"];
      const mimeType = types.find(type => MediaRecorder.isTypeSupported(type)); if (!mimeType) throw new Error("No supported video format was found. Save a picture instead.");
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3000000 }); const chunks: BlobPart[] = [];
      done = new Promise<Blob>((resolve, reject) => { recorder!.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; recorder!.onstop = () => resolve(new Blob(chunks, { type: mimeType })); recorder!.onerror = () => reject(new Error("Video recording stopped unexpectedly.")); });
      void done.catch(() => undefined);
      recorder.start(); recorderStarted = true; const began = performance.now(); let capturedFrames = 0;
      for (let n = 0; n < frames; n++) {
        if (controller.signal.aborted) throw new Error("Recording cancelled."); if (document.hidden) throw new Error("Recording stopped because the window was hidden. Keep it visible and try again."); if (recorder.state !== "recording") throw new Error("The browser stopped recording. Save a picture instead.");
        if (n > 0) for (let step = 0; step < FPS_V7 / fps; step++) {
          const s = state.current!;
          if (controls.current.mode === "turntable") visual.current++;
          else if (!s.done) { while (commandIndex.current < commands.current.length && commands.current[commandIndex.current].frame === s.frame) { const receipt = acceptSpecialV7(s, commands.current[commandIndex.current++]); if (!receipt.accepted) throw new Error("The recorded Special could not replay."); } stepFightV7(s); visual.current = s.frame; }
          else visual.current = Math.min(s.frame + AFTERMATH_FRAMES_V7, visual.current + 1);
        }
        draw(); ctx.drawImage(canvas.current, 0, 0, w, h); track.requestFrame();
        capturedFrames++;
        const s = state.current!; while (soundCursor.current < s.events.length) audio.current?.event(s.events[soundCursor.current++]);
        const wait = began + (n + 1) * 1000 / fps - performance.now(); if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        if (options.untilDone && controls.current.mode !== "turntable" && s.done && visual.current >= s.frame + AFTERMATH_FRAMES_V7) break;
      }
      recorder.stop(); const blob = await done; if (blob.size < 512) throw new Error("No usable video frames were recorded.");
      const completedResult = state.current.done ? resultV7(state.current) : null;
      const metadata = { mimeType, width: w, height: h, targetFps: fps, requestedFrames: frames, capturedFrames, seconds: (performance.now() - began) / 1000, audio: soundTracks.length > 0, startFrame, endFrame: visual.current, seed, mode: controls.current.mode, styles: builds.map(b => b.style), autoSpecial: [autoSpecial, true], defensePlans: ["balanced", "balanced"], commands: clone(commands.current), rulesVersion: state.current.rulesVersion, rigVersion: state.current.rigVersion, motionVersion: state.current.motionVersion, collisionVersion: state.current.collisionVersion, presentationVersion: state.current.presentationVersion, manifestHash: builds[0].manifestHash, resultHash: completedResult?.hash ?? recorded.current?.hash ?? null, completedResult };
      if (options.download !== false) download(blob, `model-kombat-remaster-${seed}.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
      setNotice(`Video saved${metadata.audio ? " with sound" : " without sound"}. The fight is paused where you left it.`); return { blob, ...metadata };
    } finally {
      if (recorder && recorder.state !== "inactive") recorder.stop(); if (recorderStarted && done) await done.catch(() => undefined); stream?.getTracks().forEach(t => t.stop()); audio.current?.stop(); captureAbort.current = null;
      if (alive.current) { state.current = original; visual.current = originalVisual; commandIndex.current = originalIndex; soundCursor.current = original.events.length; scene.current?.reset(); if (host.current) { const r = host.current.getBoundingClientRect(); scene.current?.resize(r.width, r.height, devicePixelRatio); } draw(); publish(); setRecording(false); }
    }
  }, [autoSpecial, builds, draw, pause, publish, seed]);
  const captureClick = async () => { try { await recordVideo(); } catch (e) { setNotice(e instanceof Error ? e.message : "The video could not be saved."); } };
  useEffect(() => {
    if (!remasterPreviewEnabled()) return;
    const api = { version: 7, ready, play, pause, reset, replay, seek, render: draw, captureFrame, recordVideo, setMode: (value: RemasterMode) => { if (!captureAbort.current) setMode(value); }, setFocus: (value: 0 | 1) => { if (!captureAbort.current) setFocusSide(value); }, setCamera: (value: boolean) => { if (!captureAbort.current) setCinematic(value); }, state: () => state.current ? clone(state.current) : null, presentationState: () => clone(controls.current.mode === "turntable" ? showroom : state.current), displayFrame: () => visual.current, result: () => recorded.current ? clone(recorded.current) : null, stats: () => scene.current?.stats() ?? null, inspect: () => scene.current?.inspect() ?? null };
    const w = window as unknown as { __botsRemaster?: typeof api }; w.__botsRemaster = api;
    return () => { if (w.__botsRemaster === api) delete w.__botsRemaster; };
  }, [captureFrame, draw, pause, play, ready, recordVideo, replay, reset, seek, showroom]);

  const finished = !!hud?.done && displayFrame >= hud.frame + AFTERMATH_FRAMES_V7, meter = Math.min(100, hud?.fighters[0].meter ?? 0);
  const activeSpecial = (side: number) => { const active = hud?.fighters[side].special; return mode !== "turntable" && hud && !hud.done && active && active.until > hud.frame ? active : null; };
  const ownSpecial = activeSpecial(0), specialSeconds = (until: number) => `${((until - (hud?.frame ?? 0)) / FPS_V7).toFixed(1)}s`;
  const changePair = (value: string) => { const [a, b] = value.split(":") as [RemasterStyle, RemasterStyle]; setStyle(a); setRival(b); };
  const seedChange = () => { if (/^\d+$/.test(seedText) && Number(seedText) <= 4294967295) { setSeed(Number(seedText)); setNotice(""); } else { setSeedText(String(seed)); setNotice("Choose a whole seed from 0 to 4294967295."); } };
  const arena = <section className={css.arena} ref={host}><canvas className={css.canvas} ref={canvas} aria-label="Remastered robot preview" />{!initialQuery.clean && <>
    <div className={css.modes} aria-label="Preview mode">{([["turntable", "Meet the robots"], ["weapon-demo", "Weapon test"], ["fight", "Fight"]] as const).map(([id, name]) => <button key={id} disabled={recording} aria-pressed={mode === id} onClick={() => setMode(id)}>{name}</button>)}</div>
    {mode !== "turntable" && hud && <div className={css.hud}>{hud.fighters.map((fighter, i) => { const active = activeSpecial(i); return <div className={css.fighter} key={i}><strong>{LABEL[i === 0 ? style : rival]}</strong><small>{i === 0 ? "Your robot" : "Rival"} · {Math.max(0, Math.ceil(fighter.armour[1]))} armour</small><progress value={Math.max(0, fighter.armour[1])} max={hud.stats[i].armour[1]} />{active && <span className={css.activeSpecial} data-style={builds[i].style}><span>{builds[i].capabilities.special.name}</span><b>{specialSeconds(active.until)}</b></span>}</div>; })}</div>}
    {mode === "turntable" && <div className={css.hero}><small>THE REMASTER · HERO PREVIEW</small><h2>{LABEL[focusSide === 0 ? style : rival]}</h2><p>{HELP[focusSide === 0 ? style : rival]}</p></div>}
    {mode === "turntable" && <div className={css.heroChoices} aria-label="Choose a hero">{REMASTER_STYLES.map(hero => <button key={hero} disabled={recording} aria-pressed={style === hero && focusSide === 0} onClick={() => { setFocusSide(0); setStyle(hero); }}>{LABEL[hero]}</button>)}</div>}
    <div className={css.caption}><span>{mode === "weapon-demo" ? "Actual fight · your weapon in focus" : "Local preview · no coins or saved progress"}</span><span>{replaying ? "Replay · " : ""}{remasterTime(displayFrame)}</span></div>
  </>}{!ready && <div className={css.loading} role={error ? "alert" : "status"}><strong>{error || "Opening the remaster…"}</strong>{error && <><p>Your saved game is safe. Use the room buttons below or reload this preview.</p><button className={css.primary} onClick={() => window.location.reload()}>Reload preview</button></>}</div>}</section>;
  if (!remasterPreviewEnabled()) return <p>The remaster preview is not available.</p>;
  if (initialQuery.clean) return <div className={css.clean}>{arena}</div>;
  return <FightRoomFrame embedded={embedded} onClose={onClose} title="Remaster preview" arena={arena}
    tools={<div className={css.tools}><label><input type="checkbox" checked={cinematic && !reduced} disabled={recording || reduced} onChange={e => setCinematic(e.target.checked)} />{reduced ? "Steady · reduced motion" : "Moving camera"}</label><label><input type="checkbox" checked={sound} disabled={recording} onChange={e => { setSound(e.target.checked); audio.current?.setMuted(!e.target.checked); if (e.target.checked) audio.current?.unlock(); }} />Sound</label></div>}
    special={<div className={css.bar}>
      <div className={css.transport}>
        <button className={css.primary} disabled={!ready || recording || finished && mode !== "turntable"} onClick={running ? pause : play}>{running ? "Pause" : mode === "turntable" ? "Turn robot" : "Play"}</button>
        <button disabled={!ready || recording || !hasReplay || mode === "turntable"} onClick={replay}>Replay</button>
        <button disabled={!ready || recording} onClick={reset}>Reset</button>
      </div>
      <div className={css.special}>
        <button data-active={!!ownSpecial} data-style={style} disabled={!ready || recording || !running || replaying || autoSpecial || mode === "turntable" || !!hud?.done || !!ownSpecial || meter < 100} onClick={useSpecial}>{mode === "turntable" ? "Special is used in fights" : ownSpecial ? `${builds[0].capabilities.special.name} · ${specialSeconds(ownSpecial.until)}` : autoSpecial ? "Special · automatic" : meter >= 100 ? `${builds[0].capabilities.special.name} · Space` : `Special · ${Math.floor(meter)}%`}</button>
        <progress aria-label={ownSpecial ? "Active Special time remaining" : "Special charge"} value={ownSpecial ? ownSpecial.until - hud!.frame : mode === "turntable" ? 0 : meter} max={ownSpecial ? ownSpecial.until - ownSpecial.started : 100} />
      </div>
      {mode !== "turntable" && <label className={css.timeline}><span>Replay frame</span><input aria-label="Replay frame" type="range" min={0} max={Math.max(1, furthest)} step={1} value={displayFrame} disabled={!ready || recording || furthest < 1} onChange={e => seek(Number(e.target.value))} /><span>{remasterTime(displayFrame)}</span></label>}
    </div>}
    status={finished ? <div className={css.result}><strong>{LABEL[hud!.winner === 0 ? style : rival]} wins</strong><p>{replaying ? "The same recorded fight." : "Try the replay, or choose another match in Details."}</p></div> : undefined}
    setup={<div className={css.setup}><p>Three hero kits. Every weapon test is an actual fight. Your other robots and progress stay as they are.</p><label>Quick match<select value={`${style}:${rival}`} disabled={recording} onChange={e => changePair(e.target.value)}>{!['tank:speed','tank:ranged','speed:ranged'].includes(`${style}:${rival}`) && <option value={`${style}:${rival}`}>{LABEL[style]} vs {LABEL[rival]}</option>}<option value="tank:speed">Tank vs Speed</option><option value="tank:ranged">Tank vs Ranged</option><option value="speed:ranged">Speed vs Ranged</option></select></label><div className={css.pair}><label>Your hero<select value={style} disabled={recording} onChange={e => setStyle(e.target.value as RemasterStyle)}>{REMASTER_STYLES.map(s => <option key={s} value={s}>{LABEL[s]} · {HELP[s]}</option>)}</select></label><label>Rival<select value={rival} disabled={recording} onChange={e => setRival(e.target.value as RemasterStyle)}>{REMASTER_STYLES.map(s => <option key={s} value={s}>{LABEL[s]}</option>)}</select></label></div><label>Fight seed<input value={seedText} inputMode="numeric" type="number" min={0} max={4294967295} disabled={recording} onChange={e => setSeedText(e.target.value)} onBlur={seedChange} onKeyDown={e => { if (e.key === "Enter") seedChange(); }} /></label><label className={css.check}><input type="checkbox" checked={autoSpecial} disabled={recording} onChange={e => setAutoSpecial(e.target.checked)} />Use your Special automatically · starts a new fight</label><p>The rival uses its Special automatically. With this turned off, press Special or Space when your meter fills.</p></div>}
    details={<div className={css.setup}><strong>{builds[0].capabilities.special.name}</strong><p>{HELP[style]}</p><div className={css.exports}><button disabled={!ready || recording} onClick={() => void savePicture()}>Save picture</button><button disabled={!ready || recording} onClick={() => void captureClick()}>Record next 6 seconds</button>{recording && <button onClick={() => captureAbort.current?.abort()}>Cancel recording</button>}</div><small>Video records this actual canvas. Turn on Sound before recording to include it. Save a picture if video is unavailable.</small>{notice && <p className={css.notice} role="status">{notice}</p>}</div>}
  />;
}
