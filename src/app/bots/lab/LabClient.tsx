"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createFightV4, FAMILIES, preset, SLOTS, stepFightV4, validBuild, WEAPONS, type BuildV4, type EventV4, type Family, type Module, type Slot, type StateV4 } from "./engine";
import { FAMILY_LABEL, FAMILY_DESCRIPTION, FAMILY_SHORT, overallRows, partDescription, partName, partRows, SLOT_LABEL, type StatRow } from "./stats";
import { labAudio } from "./audio";
import type { LabScene } from "./scene";
import PartInspection from "./PartInspection";
import css from "./lab.module.css";

const STORAGE = "modelkombat.combat-lab.v4";
type Camera = "cinematic" | "steady";
const decimal = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
function StatList({ rows, before, compact = false }: { rows: StatRow[]; before?: StatRow[]; compact?: boolean }) {
  return <dl className={`${css.stats} ${compact ? css.compact : ""}`}>{rows.map(row => {
    const previous = before?.find(r => r.key === row.key)?.value ?? row.value, delta = +(row.value - previous).toFixed(2);
    return <div key={row.key}><dt>{row.label}</dt><dd>{decimal(row.value)}{row.unit && <small> {row.unit}</small>}{before && <span className={delta === 0 ? css.same : (row.lower ? delta < 0 : delta > 0) ? css.plus : css.minus} aria-label={`Change ${delta > 0 ? "+" : ""}${delta}`}>{delta > 0 ? "+" : ""}{decimal(delta)}</span>}</dd></div>;
  })}</dl>;
}
const describe = (e: EventV4) => {
  const who = e.who === 0 ? "Your robot" : "Rival";
  if (e.kind === "hit") return `${who}: ${e.damage} damage to ${SLOT_LABEL[e.slot ?? "torso"].toLowerCase()}`;
  if (e.kind === "block") return `${e.target === 0 ? "Your shield" : "Rival shield"} absorbs the hit`;
  if (e.kind === "stun") return `${who} lands a stunning combination`;
  if (e.kind === "knockdown") return `${who} lands a knockdown`;
  if (e.kind === "interrupt") return `${who}'s attack was interrupted`;
  if (e.kind === "break") return `${who} loses ${SLOT_LABEL[e.slot ?? "torso"].toLowerCase()}`;
  if (e.kind === "dodge") return `${who} evades the incoming attack`;
  if (e.kind === "ko" || e.kind === "timeout") return `${who} wins${e.kind === "timeout" ? " on remaining body armour" : " by knockout"}`;
  return "";
};
export default function LabClient() {
  const [build, setBuild] = useState<BuildV4>(() => preset("brute"));
  const [pending, setPending] = useState<BuildV4 | null>(null), [slot, setSlot] = useState<Slot | "weapon">("head");
  const [opponent, setOpponent] = useState<Family>("hotshot"), [seedText, setSeedText] = useState("2048");
  const [camera, setCamera] = useState<Camera>("cinematic"), [sound, setSound] = useState(false), [reduced, setReduced] = useState(false);
  const [view, setView] = useState<"build" | "fight">("build"), [playing, setPlaying] = useState(false), [ready, setReady] = useState(false), [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [feed, setFeed] = useState<string[]>([]), [readout, setReadout] = useState<StateV4 | null>(null);
  const [performanceData, setPerformanceData] = useState({ fps: 0, drawCalls: 0, triangles: 0, geometries: 0, dents: 0 });
  const [sceneReady, setSceneReady] = useState(0), [retry, setRetry] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null), scene = useRef<LabScene | null>(null), audio = useRef<ReturnType<typeof labAudio> | null>(null);
  const state = useRef<StateV4 | null>(null), running = useRef(false), slowUntil = useRef(0), buildGeneration = useRef(0);
  const [inspectingDamage, setInspectingDamage] = useState(false);
  const display = pending ?? build, enemy = useMemo(() => preset(opponent, 1), [opponent]);
  const example = FAMILIES.find(family => { const p = preset(family); return p.weapon === display.weapon && SLOTS.every(s => p.parts[s].family === display.parts[s].family && p.parts[s].design === display.parts[s].design); });
  const controls = useRef({ view, camera, reduced }); controls.current = { view, camera, reduced };
  const selectionKey = JSON.stringify([display, enemy]);
  const seed = Number(seedText), validSeed = /^\d+$/.test(seedText) && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE) ?? "null"); if (validBuild(saved?.build)) setBuild(saved.build); if (FAMILIES.includes(saved?.opponent)) setOpponent(saved.opponent); if (saved?.camera === "steady") setCamera("steady"); } catch {}
    const media = matchMedia("(prefers-reduced-motion: reduce)"); setReduced(media.matches); const change = () => setReduced(media.matches); media.addEventListener("change", change); setHydrated(true);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => { if (hydrated) try { localStorage.setItem(STORAGE, JSON.stringify({ build, opponent, camera })); } catch {} }, [build, opponent, camera, hydrated]);
  useEffect(() => {
    if (!canvas.current) return;
    let gone = false, raf = 0, last = 0, accumulator = 0, renderCount = 0, metricsTime = 0, lastReadout = 0, readoutFrame = -1;
    const voice = labAudio(); audio.current = voice;
    const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; scene.current?.resize(rect.width, rect.height); }); observer.observe(canvas.current);
    const visibility = () => { last = 0; accumulator = 0; if (document.hidden) voice.stop(); }; document.addEventListener("visibilitychange", visibility);
    void import("./scene").then(async ({ createLabScene }) => {
      const stage = await createLabScene(canvas.current!, e => {
        voice.event(e); const message = describe(e); if (message) setFeed(old => [message, ...old].slice(0, 4));
        if (e.kind === "knockdown" && controls.current.camera === "cinematic" && !controls.current.reduced) slowUntil.current = performance.now() + 80;
      });
      if (gone) { stage.dispose(); return; }
      scene.current = stage; const rect = canvas.current!.getBoundingClientRect(); stage.resize(rect.width, rect.height); setSceneReady(v => v + 1);
      function animate(now: number) {
        if (gone) return; raf = requestAnimationFrame(animate); if (document.hidden) return;
        const dt = last ? Math.min(.06, (now - last) / 1000) : 0; last = now;
        const s = state.current;
        if (s && running.current && !s.done) {
          accumulator += dt * (now < slowUntil.current ? .35 : 1);
          while (accumulator >= 1 / 60 && !s.done) { stepFightV4(s); accumulator -= 1 / 60; }
          if (s.done) { running.current = false; setPlaying(false); }
        } else accumulator = 0;
        if (s) stage.render(s, now / 1000, controls.current.view === "build", controls.current.camera === "cinematic", controls.current.reduced);
        renderCount++;
        if (now - metricsTime > 1200) { const fps = metricsTime ? Math.round(renderCount * 1000 / (now - metricsTime)) : 0; setPerformanceData({ ...stage.metrics(), fps }); renderCount = 0; metricsTime = now; }
        if (s && controls.current.view === "fight" && s.frame !== readoutFrame && now - lastReadout > 160) { setReadout({ ...s, fighters: s.fighters.map(f => ({ ...f, armour: [...f.armour] })) as StateV4["fighters"] }); lastReadout = now; readoutFrame = s.frame; }
      }
      raf = requestAnimationFrame(animate);
    }).catch(e => { if (!gone) setError(e instanceof Error ? e.message : "The 3D workshop could not load."); });
    return () => { gone = true; cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener("visibilitychange", visibility); voice.dispose(); if (audio.current === voice) audio.current = null; scene.current?.dispose(); scene.current = null; };
  }, [retry]);
  useEffect(() => {
    if (!scene.current || !hydrated) return;
    const generation = ++buildGeneration.current, stage = scene.current;
    running.current = false; setPlaying(false); setReady(false); setError(""); setFeed([]); setInspectingDamage(false);
    const [a, b] = JSON.parse(selectionKey) as [BuildV4, BuildV4]; state.current = createFightV4(2048, a, b);
    void stage.builds(a, b).then(() => { if (generation === buildGeneration.current) { setReady(true); setReadout(state.current); } }).catch(e => { if (generation === buildGeneration.current) setError(e instanceof Error ? e.message : "A clay part could not load. Try again."); });
  }, [selectionKey, sceneReady, hydrated]);
  const start = useCallback(() => {
    if (!scene.current || !ready || !validSeed || pending) return;
    audio.current?.stop(); audio.current?.enable(sound); scene.current.reset(); setFeed([]); setNotice(""); setInspectingDamage(false);
    state.current = createFightV4(seed, build, enemy); setView("fight"); setPlaying(true); running.current = true; setReadout(state.current);
  }, [ready, validSeed, seed, pending, build, enemy, sound]);
  function edit() { setInspectingDamage(false); running.current = false; setPlaying(false); setView("build"); audio.current?.stop(); scene.current?.reset(); state.current = createFightV4(validSeed ? seed : 2048, display, enemy); setFeed([]); }
  function chooseModule(module: Module) { if (slot === "weapon") return; setPending({ ...build, parts: { ...build.parts, [slot]: module } }); setNotice(""); }
  const items = slot === "weapon" ? WEAPONS.map(weapon => ({ ...build, weapon })) : FAMILIES.flatMap(family => ([0, 1] as const).map(design => ({ ...build, parts: { ...build.parts, [slot]: { family, design } } })));
  const totalRows = overallRows(display), selectedRows = partRows(display, slot);
  const labels = ["Your robot", `${FAMILY_LABEL[opponent]} rival`];
  return <main className={css.lab}>
    <header className={css.header}><Link href="/bots" className={css.brand}>MODEL KOMBAT<span>A DOMA GAME</span></Link><div className={css.headerMiddle}><span className={css.liveDot} /> COMBAT LAB <small>Practice workshop</small></div><Link className={css.back} href="/bots">Back to garage ↗</Link></header>
    <div className={css.intro}><div><p className={css.eyebrow}>PRACTICE WORKSHOP · SAVED HERE</p><h1>Made by you.</h1></div><p>Mix the parts. Find your fighter.<br /><span>Try a build, then take it into the ring.</span></p></div>
    <div className={css.workspace}>
      <aside className={css.overview} aria-label="Overall robot stats">
        <div className={css.panelHeading}><span className={css.eyebrow}>YOUR MACHINE</span><h2>{pending ? "Try it on." : "Make it yours."}</h2></div>
        <div className={css.presets} aria-label="Example builds">{FAMILIES.map(family => <button key={family} disabled={view === "fight"} aria-pressed={example === family} onClick={() => { setBuild(preset(family)); setPending(null); setNotice(""); }}><i style={{ background: { brute: "#bb7056", hotshot: "#689e96", deadeye: "#8998b1" }[family] }} />{FAMILY_LABEL[family]}</button>)}</div>
        <p className={css.exampleDescription}>{example ? FAMILY_DESCRIPTION[example] : "Mixed build. Every fitted part contributes its own strengths."}<span>Starting examples, not fixed classes. Mix any parts.</span></p><div className={css.sectionLabel}>OVERALL STATS{pending && <span>With preview part</span>}</div>
        <StatList rows={totalRows} before={pending ? overallRows(build) : undefined} />
        <p className={css.hint}>These are the actual starting combat values. Part loss and control effects change them during a fight.</p>
        <div className={css.sectionLabel}>FITTED PARTS</div>
        <div className={css.fitted}>{[...SLOTS, "weapon" as const].map(s => <button key={s} disabled={view === "fight"} aria-pressed={slot === s} onClick={() => { setSlot(s); setPending(null); }}><span>{SLOT_LABEL[s]}</span><strong>{s === "weapon" ? { hammer: "Hammer", baton: "Baton", rifle: "Rifle" }[build.weapon] : `${FAMILY_SHORT[build.parts[s].family]} ${build.parts[s].design + 1}`}</strong></button>)}</div>
      </aside>
      <section className={css.arenaSection} aria-label="Robot preview and combat arena">
        <div className={css.stage}>
          <div className={css.stageTop}><span className={css.stageTag}>{view === "build" ? pending ? "TRYING IT ON" : inspectingDamage ? "DAMAGE CLOSE-UP" : "YOUR WORKSHOP" : "PRACTICE FIGHT"}</span><span>{view === "fight" ? `${((readout?.frame ?? 0) / 60).toFixed(1)}s` : "CLAY ARMOUR · BRASS BONES"}</span></div>
          <canvas ref={canvas} className={css.canvas} aria-label="3D clay robot preview and deterministic practice combat" />
          {!ready && !error && <div className={css.overlay}><span className={css.spinner} />Assembling the clay machines…</div>}
          {error && <div className={css.overlay} role="alert"><p>{error}</p><button onClick={() => { setError(""); setRetry(v => v + 1); }}>Reload workshop</button></div>}
          {view === "fight" && readout && <div className={css.health}>{readout.fighters.map((f, i) => <div key={i}><strong>{labels[i]}</strong><div className={css.healthTrack}><span style={{ width: `${f.armour[1] / readout.stats[i].armour[1] * 100}%` }} /></div><small>{f.armour[1]} / {readout.stats[i].armour[1]} body armour</small><span className={css.statusLabel}>{f.downUntil > readout.frame ? "KNOCKED DOWN" : f.stunnedUntil > readout.frame ? "STUNNED" : f.dodgeUntil > readout.frame ? "EVADING" : f.immuneUntil > readout.frame ? "RECOVERY PROTECTION" : f.action && !f.action.released ? f.action.kind === "rifle" ? "TAKING AIM" : f.action.kind === "hammer" ? "CHARGING HAMMER" : "WINDING UP" : ""}</span></div>)}</div>}
          {view === "build" && <div className={css.nameplates}><span>{pending ? "Preview attached" : "Your one-of-a-kind machine"}</span></div>}
          {view === "fight" && readout?.done && <div className={css.result}><span>PRACTICE COMPLETE</span><h2>{readout.winner === 0 ? "Your machine takes it." : "A lesson in the dents."}</h2><p>{labels[readout.winner ?? 0]} wins. Try another combination.</p></div>}
          <div className={css.stageBottom}><span>{pending ? "Preview attached. Fit it to keep the change." : view === "build" ? "Every piece can come from a different family." : feed[0] || "The machines are finding their range."}</span><span>{performanceData.dents} dents</span></div>
        </div>
        <section className={css.clayProof} aria-label="Clay damage test"><h3>Test the armour</h3><p>Hit the clay to inspect its damage up close. Resets before a fight.</p><div>{(["hammer", "projectile", "blade"] as const).map(kind => <button key={kind} disabled={!ready || view === "fight"} onClick={() => { const n = scene.current?.damage(kind) ?? 0; setInspectingDamage(true); setNotice(`${n} clay ${n === 1 ? "dent" : "dents"}. Watch the light move across the surface.`); }}>{kind === "hammer" ? "Hammer dent" : kind === "projectile" ? "Projectile crater" : "Blade groove"}</button>)}<button disabled={view === "fight"} onClick={() => { scene.current?.reset(); setInspectingDamage(false); setNotice("Clay restored."); }}>Restore clay</button></div></section>
        {inspectingDamage && view === "build" && <button className={css.damageBack} onClick={() => { scene.current?.inspectDamage(false); setInspectingDamage(false); }}>← Whole robot</button>}{notice && <p className={css.notice} role="status">{notice}</p>}
        <div className={css.controlBar}>
          <div><label>Rival<select value={opponent} disabled={view === "fight"} onChange={e => setOpponent(e.target.value as Family)}>{FAMILIES.map(f => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</select></label><label>Fight seed<input aria-label="Fight seed" inputMode="numeric" value={seedText} onChange={e => setSeedText(e.target.value)} aria-invalid={!validSeed} /></label></div>
          {view === "build" ? <button className={css.primary} disabled={!ready || !!pending || !validSeed} onClick={start}>Watch a fight <span>↗</span></button> : <div className={css.playback}><button onClick={edit}>Edit build</button>{readout?.done ? <button className={css.primary} onClick={start}>Replay fight ↻</button> : <button className={css.primary} onClick={() => { running.current = !running.current; setPlaying(running.current); if (!running.current) audio.current?.stop(); }}>{playing ? "Pause" : "Resume"}</button>}</div>}
        </div>
        {!validSeed && <p className={css.validation}>Use a whole seed number from 0 to 4294967295.</p>}
        <div className={css.utility}><label>Camera<select aria-label="Camera mode" value={camera} disabled={reduced} onChange={e => setCamera(e.target.value as Camera)}><option value="cinematic">Cinematic</option><option value="steady">Steady</option></select></label><button aria-pressed={sound} onClick={() => { setSound(v => !v); audio.current?.enable(!sound); }}>Sound {sound ? "on" : "off"}</button><span>{reduced ? "Reduced motion respected" : "Same build + same seed = same fight"}</span></div>
        {view === "fight" && <ol className={css.feed} aria-label="Recent combat events">{feed.map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}</ol>}
      </section>
      <aside className={css.inspector} aria-label="Selected part stats and comparison">
        <div className={css.panelHeading}><span className={css.eyebrow}>THE PARTS BENCH</span><h2>{SLOT_LABEL[slot]}</h2></div>
        <div className={css.socketTabs}>{[...SLOTS, "weapon" as const].map(s => <button key={s} disabled={view === "fight"} aria-pressed={slot === s} onClick={() => { setSlot(s); setPending(null); }}>{SLOT_LABEL[s].replace("Left ", "L ").replace("Right ", "R ")}</button>)}</div>
        <div className={css.partPreview}><PartInspection build={display} slot={slot} /><span>{pending ? "PREVIEW" : "FITTED"}</span></div>
        <div className={css.partDetails}><h3>{partName(slot, display)}</h3><p>{partDescription(slot, display)}</p><StatList rows={selectedRows} before={partRows(build, slot)} compact />
          <div className={css.compareKey}><span className={css.plus}>+ improvement</span><span className={css.minus}>− tradeoff</span><span>0 unchanged</span></div>
          {pending && <div className={css.fitActions}><button className={css.primary} onClick={() => { setBuild(pending); setPending(null); setNotice("Part fitted. Your new build is saved here."); }}>Fit this part</button><button onClick={() => setPending(null)}>Cancel preview</button></div>}
        </div>
        <div className={css.sectionLabel}>TRY ANOTHER PART</div>
        <div className={css.parts}>{items.map(item => {
          const name = partName(slot, item), active = slot === "weapon" ? display.weapon === item.weapon : JSON.stringify(display.parts[slot]) === JSON.stringify(item.parts[slot]);
          return <button key={name} aria-pressed={active} disabled={view === "fight"} onClick={() => { setNotice(""); if (slot === "weapon") setPending(item); else chooseModule(item.parts[slot]); }}><i style={{ background: slot === "weapon" ? "#cbb37a" : { brute: "#bb7056", hotshot: "#689e96", deadeye: "#8998b1" }[item.parts[slot].family] }} /><span>{name}</span><small>{partRows(item, slot).map(r => `${decimal(r.value)} ${r.label.toLowerCase()}`).slice(0, 2).join(" · ")}</small></button>;
        })}</div>
      </aside>
    </div>
    <footer className={css.footer}><span>COMBAT LAB · ENGINE 4 · PRACTICE ONLY</span><details><summary>Performance</summary><span>{performanceData.fps || "—"} FPS · {performanceData.drawCalls} draws · {performanceData.triangles.toLocaleString()} triangles · {performanceData.geometries} geometries</span></details><span>Clay gets dented. Your garage stays safe.</span></footer>
  </main>;
}
