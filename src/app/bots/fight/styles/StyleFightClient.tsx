'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFightV5, stepFightV5, acceptSpecialV5, presetV5, cardV5, snapshotBuildV5, resultV5, type BuildV5, type StateV5, type StyleV5, type SpecialCommandV5 } from '@/lib/bots/v5';
import { practiceBuildV5, type StylePracticeQuery } from '@/lib/bots/style-practice';
import { createStyleFightScene, type StyleFightScene, type StyleVisualState } from '../../_view/style-fight-scene';
import { rigLookFromBuild, rigLookOf } from '../../_view/look-view';
import { createBotsSfx, savedBotsSound, type BotsSfx } from '../../_view/sfx';
import type { LookView } from '../../_server/types';
import type { BotLook } from '../../_view/look';
import { authHeaders, readBotsSession } from '../../battles/session';
import type { LiveHouseSession, LiveHouseResponse } from '@/lib/bots/live-house-types';
import css from './styles.module.css';

const LABEL = { tank: 'Tank', speed: 'Speed', ranged: 'Ranged' };
const IDEA = { tank: 'Tough but slow. Take hits and strike hard.', speed: 'Quick but fragile. Close in and keep moving.', ranged: 'Shoot from a distance. Shove and dash away when crowded.' };
const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `press-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function visualState(s: StateV5): StyleVisualState {
  const fighter = (f: StateV5['fighters'][0]) => ({ ...f, special: { active: !!f.special, kind: f.special?.style ?? '', endsAt: f.special?.until ?? 0, shield: f.special?.shieldLeft ?? 0, finisher: !!f.special?.finisherUsed || !!f.special && f.special.burstShots > 0 } });
  return { ...s, fighters: [fighter(s.fighters[0]), fighter(s.fighters[1])] };
}
function readLook(build: BuildV5, value?: string): BotLook {
  try { if (value && value.length < 8192) { const v = JSON.parse(value) as LookView; if (v.look && v.marks && v.paints) return rigLookOf(v, 'butter'); } } catch { /* Appearance cannot alter the saved build. */ }
  return rigLookFromBuild(build.appearanceBuild, build.style === 'tank' ? 'butter' : build.style === 'speed' ? 'coral' : 'sky');
}
function status(s: StateV5, side: 0 | 1): string {
  const f = s.fighters[side];
  if (s.done) return s.winner === side ? 'Winner' : 'Fight over';
  if (f.downUntil > s.frame) return 'Getting up';
  if (f.stunnedUntil > s.frame) return 'Stunned';
  if (f.special) return s.builds[side].capabilities.special.name;
  if (f.slowUntil > s.frame) return 'Slowed';
  if (f.action?.kind === 'rifle') return f.action.released ? 'Reloading' : 'Taking aim';
  if (f.action?.kind === 'shove') return 'Making room';
  return f.meter >= 100 ? 'Special ready' : 'Fighting';
}

export default function StyleFightClient({ query }: { query: StylePracticeQuery }) {
  const parsed = useMemo(() => { try { return { build: practiceBuildV5(query), error: '' }; } catch (e) { return { build: presetV5('ranged'), error: e instanceof Error ? e.message : 'This build could not load.' }; } }, [query]);
  const [build, setBuild] = useState(parsed.build), [rival, setRival] = useState<StyleV5>(query.rival === 'speed' || query.rival === 'ranged' ? query.rival : 'tank');
  const [seed, setSeed] = useState((Number(query.seed) || 75) >>> 0), [round, setRound] = useState(0), [playing, setPlaying] = useState(false), [replaying, setReplaying] = useState(false);
  const [ready, setReady] = useState(false), [error, setError] = useState(parsed.error), [notice, setNotice] = useState(''), [live, setLive] = useState<LiveHouseSession | null>(null), [pending, setPending] = useState(false);
  const [cinematic, setCinematic] = useState(true), [reduced, setReduced] = useState(false), [sound, setSound] = useState(false), [hud, setHud] = useState<StateV5 | null>(null);
  const [perf, setPerf] = useState({ fps: 0, drawCalls: 0, triangles: 0, drawMs: 0, dents: 0, vertices: 0, crowd: false });
  const canvas = useRef<HTMLCanvasElement>(null), host = useRef<HTMLDivElement>(null), scene = useRef<StyleFightScene | null>(null), state = useRef<StateV5 | null>(null), sfx = useRef<BotsSfx | null>(null);
  const presentation = useRef<StateV5 | null>(null);
  const authority = useRef<LiveHouseSession | null>(null);
  const control = useRef({ playing, cinematic, reduced, replaying }), lastReplay = useRef<SpecialCommandV5[]>([]), replayIndex = useRef(0), requestBusy = useRef(false), sessionId = useRef(query.session ?? ''), liveMode = !!query.session || !!query.botId;
  const initQueue = useRef(Promise.resolve()), lifetime = useRef(0), lastInput = useRef<string | null>(null);
  control.current = { playing, cinematic, reduced, replaying };
  const opponent = useMemo(() => presetV5(rival, build.tier), [rival, build.tier]);

  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches); update(); media.addEventListener('change', update); setSound(savedBotsSound()); return () => media.removeEventListener('change', update); }, []);
  useEffect(() => { sfx.current = createBotsSfx(savedBotsSound()); return () => { sfx.current?.dispose(); sfx.current = null; }; }, []);
  useEffect(() => { sfx.current?.setMuted(!sound); }, [sound]);

  const updateSession = useCallback((session: LiveHouseSession) => {
    const before = authority.current;
    if (before && (session.id !== before.id || session.revision < before.revision || session.state.frame < before.state.frame)) return;
    authority.current = session;
    const receipt = lastInput.current && session.inputs.find(r => r.inputId === lastInput.current);
    if (receipt) lastInput.current = null;
    state.current = session.state; setLive(session); setHud({ ...session.state }); setNotice('');
  }, []);
  useEffect(() => {
    if (!liveMode) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    const requestIdKey = `bots:live5:start:${query.botId ?? 'resume'}:${query.difficulty ?? 'easy'}`;
    async function poll() {
      try {
        const token = readBotsSession(); if (!token) throw new Error('Connect your wallet in the garage, then open this fight again.');
        let url = `/api/bots/fight/live/${encodeURIComponent(sessionId.current)}`, options: RequestInit = { headers: authHeaders(token), cache: 'no-store' };
        if (!sessionId.current) {
          let requestId = sessionStorage.getItem(requestIdKey); if (!requestId) { requestId = uid(); sessionStorage.setItem(requestIdKey, requestId); }
          url = '/api/bots/fight/live/start'; options = { method: 'POST', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: Number(query.botId), difficulty: query.difficulty ?? 'easy', requestId }) };
        }
        const response = await fetch(url, options), value = await response.json(); if (!response.ok || !value.ok) throw new Error(value.error?.message ?? value.message ?? value.error ?? 'The fight could not connect.');
        if (cancelled) return;
        const session = (value as LiveHouseResponse).session; sessionId.current = session.id;
        const q = new URLSearchParams({ session: session.id }); history.replaceState(null, '', `/bots/fight/styles?${q}`);
        updateSession(session); setError('');
        if (session.status === 'complete') { for (const difficulty of ['easy', 'medium', 'hard']) sessionStorage.removeItem(`bots:live5:start:${session.botId}:${difficulty}`); sessionStorage.removeItem(`bots:live5:start:${session.botId}`); return; }
      } catch (e) { if (!cancelled) setNotice(e instanceof Error ? e.message : 'Connection lost. Trying again.'); }
      if (!cancelled) timer = setTimeout(poll, document.hidden ? 2500 : 250);
    }
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [liveMode, query.botId, query.difficulty, updateSession]);

  const liveBuildKey = live?.builds.map(b => b.appearanceBuild.torso.id).join('|') ?? '';
  useEffect(() => {
    if (!canvas.current || !host.current || parsed.error || liveMode && !live) return;
    const epoch = ++lifetime.current, element = canvas.current, container = host.current;
    let disposed = false, handle: StyleFightScene | null = null, observer: ResizeObserver | null = null, raf = 0;
    setReady(false); setError('');
    initQueue.current = initQueue.current.catch(() => {}).then(async () => {
      if (disposed) return;
      const a = live?.builds[0] ?? build, b = live?.builds[1] ?? opponent;
      if (!liveMode) { state.current = createFightV5(seed, a, b, { autoSpecial: [false, true] }); setHud({ ...state.current }); replayIndex.current = 0; }
      else presentation.current = createFightV5(live!.state.seed, a, b, { autoSpecial: live!.state.autoSpecial });
      try {
        handle = await createStyleFightScene(element);
        if (disposed) { handle.dispose(); return; }
        const looks: [BotLook, BotLook] = live ? [rigLookOf(live.identities[0].look, 'butter'), rigLookOf(live.identities[1].look, 'sky')] : [readLook(build, query.appearance), rigLookFromBuild(opponent.appearanceBuild, 'coral')];
        await handle.builds(a.appearanceBuild, b.appearanceBuild, looks);
        if (disposed) { handle.dispose(); return; }
        scene.current = handle;
        const resize = () => { const box = container.getBoundingClientRect(); handle?.resize(box.width, box.height, devicePixelRatio); }; observer = new ResizeObserver(resize); observer.observe(container); resize();
        setReady(true); let previous = performance.now(), bank = 0, uiAt = previous, metricAt = previous, frames = 0, audioCursor = 0, liveCommandIndex = 0;
        const samples: { frame: number; fps: number; drawMs: number }[] = [];
        const frame = (now: number) => {
          if (disposed) return;
          const s = state.current, c = control.current, dt = Math.min(.25, (now - previous) / 1000); previous = now;
          if (s && !document.hidden) {
            if (!liveMode && c.playing && !s.done) {
              bank += dt;
              while (bank >= 1 / 60 && !s.done) {
                if (c.replaying) while (replayIndex.current < lastReplay.current.length && lastReplay.current[replayIndex.current].frame === s.frame) acceptSpecialV5(s, lastReplay.current[replayIndex.current++]);
                stepFightV5(s); bank -= 1 / 60;
              }
            } else if (!liveMode) bank = 0;
            let picture = s;
            if (liveMode && presentation.current) {
              // Smooth buffered playback of confirmed ticks. It never predicts a hit
              // or accepts a Special before the server has recorded it.
              const display = presentation.current;
              bank += dt;
              const catchUp = c.replaying ? 0 : Math.max(0, s.frame - display.frame - 30);
              let budget = Math.min(180, Math.floor(bank * 60) + catchUp);
              while (display.frame < s.frame && !display.done && budget-- > 0) {
                while (liveCommandIndex < s.commands.length && s.commands[liveCommandIndex].frame === display.frame) acceptSpecialV5(display, s.commands[liveCommandIndex++]);
                stepFightV5(display);
              }
              bank = Math.min(1 / 60, bank % (1 / 60)); picture = display;
            }
            handle!.render(visualState(picture), now / 1000, c.cinematic, c.reduced); frames++;
            if (s.events.length < audioCursor) audioCursor = 0;
            while (audioCursor < picture.events.length) { const e = picture.events[audioCursor++]; if (picture.frame - e.frame > 8) continue; if (e.kind === 'hit' || e.kind === 'block') sfx.current?.impact(e.weapon, { blocked: e.kind === 'block', side: e.who, move: e.weapon }); else if (e.kind === 'shot') sfx.current?.play('tick'); else if (e.kind === 'special_start') sfx.current?.play('whoosh'); else if (e.kind === 'break') { sfx.current?.play('clang-tumble'); sfx.current?.crowd('break'); } else if (e.kind === 'ko' || e.kind === 'timeout') sfx.current?.crowd('ko'); }
            if (now - uiAt > 100) { setHud({ ...(liveMode && c.replaying ? picture : s) }); uiAt = now; }
            if (now - metricAt >= 1000) { const metric = { fps: Math.round(frames * 1000 / (now - metricAt)), ...handle!.stats() }; setPerf(metric); container.dataset.metrics = JSON.stringify(metric); if (picture.frame > 0 && !picture.done && samples.length < 100) samples.push({ frame: picture.frame, fps: metric.fps, drawMs: metric.drawMs }); container.dataset.performanceSamples = JSON.stringify(samples); metricAt = now; frames = 0; }
          } else { bank = 0; sfx.current?.stop(); }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      } catch (e) { if (!disposed && lifetime.current === epoch) setError(e instanceof Error ? e.message : 'The fight picture could not load.'); handle?.dispose(); }
    });
    return () => { disposed = true; cancelAnimationFrame(raf); observer?.disconnect(); handle?.dispose(); if (scene.current === handle) scene.current = null; sfx.current?.stop(); };
    // A live state update must not recreate its models or renderer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, opponent, seed, round, liveBuildKey, liveMode, parsed.error]);

  const activate = useCallback(async () => {
    const s = state.current; if (!s || requestBusy.current || replaying || !ready || !liveMode && !control.current.playing) return;
    sfx.current?.unlock(); const inputId = lastInput.current ?? uid();
    if (!liveMode) { const r = acceptSpecialV5(s, { id: inputId, who: 0, kind: 'special', frame: s.frame }); setNotice(r.accepted ? '' : r.reason ?? 'Not ready yet.'); setHud({ ...s }); return; }
    requestBusy.current = true; setPending(true); lastInput.current = inputId;
    try { const response = await fetch(`/api/bots/fight/live/${encodeURIComponent(sessionId.current)}/input`, { method: 'POST', headers: { ...authHeaders(readBotsSession()), 'Content-Type': 'application/json' }, body: JSON.stringify({ inputId, kind: 'special' }) }); const value = await response.json(); if (!response.ok || !value.ok) throw new Error(value.message ?? value.error?.message ?? value.error ?? 'The button press was not confirmed. Press again to retry it.'); updateSession(value.session); lastInput.current = null; if (value.input && !value.input.accepted) setNotice(value.input.reason ?? 'Not ready yet.'); }
    catch (e) { if (lastInput.current) setNotice(e instanceof Error ? e.message : 'The button press was not confirmed. Press again to retry it.'); }
    finally { requestBusy.current = false; setPending(false); }
  }, [liveMode, ready, replaying, updateSession]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.repeat || e.code !== 'Space' && e.code !== 'KeyQ' || (e.target as HTMLElement).closest('input,select,textarea,button,a,[contenteditable]')) return; e.preventDefault(); void activate(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [activate]);
  function reset(replay: boolean) { lastReplay.current = replay ? [...(state.current?.commands ?? [])] : []; setReplaying(replay); setPlaying(true); setNotice(''); setRound(n => n + 1); sfx.current?.unlock(); }
  function chooseStyle(style: StyleV5) { setBuild(presetV5(style, build.tier)); setReplaying(false); setPlaying(false); }
  const s = hud, f = s?.fighters[0], active = !!f?.special, done = !!s?.done;
  const current = live?.builds[0] ?? build, special = current.capabilities.special;
  const canSpecial = ready && !done && !replaying && !active && (f?.meter ?? 0) >= 100 && (f?.stunnedUntil ?? 0) <= (s?.frame ?? 0) && (f?.downUntil ?? 0) <= (s?.frame ?? 0) && (liveMode || playing);
  const ending = current.style === 'tank' ? 'A shield charge can knock the rival down. A broken shield stops it.' : current.style === 'speed' ? 'A rear blade hit can finish a limb below 25% armour. Healthy limbs stay attached.' : 'Both arms fire a short machine-pistol burst. A missing arm cannot fire.';
  if (liveMode && !live) return <main className={css.page}><header className={css.header}><Link href='/bots'>← Garage</Link><strong>Model Kombat · House fight</strong></header><div className={css.panel} style={{ margin: 20 }} role='status'><h1>Opening your fight</h1><p>{notice || 'Loading your saved robot and opponent…'}</p></div></main>;
  return <main className={css.page}>
    <header className={css.header}><Link href='/bots'>← Garage</Link><div><strong>Model Kombat</strong><span>{liveMode ? 'House fight' : 'Practice room'} · Build preview</span></div><label><input type='checkbox' checked={sound} onChange={e => { setSound(e.target.checked); sfx.current?.setMuted(!e.target.checked); }} /> Sound</label></header>
    <div className={css.layout}>
      <section className={css.stage} ref={host} aria-label='Robot fight arena'>
        <canvas ref={canvas} aria-label='Your saved toy robot fighting in the arena' />
        <div className={css.scoreboard}>{([0, 1] as const).map(side => <div key={side}><strong>{live?.identities[side].name ?? (side === 0 ? query.robot ? 'Your robot' : LABEL[build.style] : `${LABEL[rival]} rival`)}</strong><progress aria-label={`${side === 0 ? 'Your' : 'Rival'} body armour`} max={s?.stats[side].armour[1] ?? 100} value={s?.fighters[side].armour[1] ?? 100} /><span>{s ? `${Math.ceil(s.fighters[side].armour[1])} / ${s.stats[side].armour[1]} armour` : 'Getting ready'}</span><b>{s ? status(s, side) : ''}</b></div>)}</div>
        {(!ready || error) && <div className={css.cover} role='status'><strong>{error || (liveMode && notice ? notice : 'Getting your robots ready…')}</strong></div>}
        {ready && !playing && !liveMode && !done && <div className={css.cover}><strong>Time your special.</strong><p>Your robot fights. You choose when to use its special.</p><button onClick={() => { setPlaying(true); sfx.current?.unlock(); sfx.current?.play('bell'); }}>Start practice fight</button></div>}
        <div className={css.footnote}><span>{Math.floor((s?.frame ?? 0) / 60)}s · {perf.dents} dents</span><label><input type='checkbox' checked={cinematic && !reduced} disabled={reduced} onChange={e => setCinematic(e.target.checked)} /> Moving camera</label></div>
      </section>
      <aside className={css.panel}>
        <div><small>{LABEL[current.style]} body · Tier {current.tier}</small><h1>{special.name}</h1><p>{special.description}</p></div>
        <div className={css.special}>
          <div className={css.meter}><span style={{ width: `${active ? Math.max(0, ((f?.special?.until ?? 0) - (s?.frame ?? 0)) / 3) : f?.meter ?? 0}%` }} /></div>
          <button className={css.specialButton} disabled={!canSpecial || pending} onClick={() => void activate()}>{pending ? 'Sending…' : done ? 'Fight finished' : replaying ? 'Replaying your Special presses' : active ? `${special.name} · ${Math.max(0, ((f?.special?.until ?? 0) - (s?.frame ?? 0)) / 60).toFixed(1)}s` : canSpecial ? `Use ${special.name}` : `Special charging · ${Math.floor(f?.meter ?? 0)}%`}</button>
          <small>{liveMode ? 'Server-confirmed input' : 'Practice · no coins needed'} · Press Q or Space</small>
        </div>
        {notice && <p role='status' className={css.notice}>{notice}</p>}
        {done && <div className={css.result} role='status'><strong>{s?.winner === 0 ? 'Your robot wins!' : 'Your rival wins this time.'}</strong><p>{liveMode ? live?.settlement ? `+${live.settlement.coins} coins · +${live.settlement.xp} XP` : 'Saving your result. Reopening this fight will finish saving it.' : 'Try another part combination or save your special for a different moment.'}</p>{(!liveMode || live?.status === 'complete') && <button onClick={() => reset(true)}>Replay my button presses</button>}</div>}
        <details><summary>{current.tier >= 3 ? 'Your finishing move' : 'Tier 3 unlocks a finishing move'}</summary><p>{ending}</p><p>One button does both. Your robot must still have the right limbs and reach its target.</p><p>The meter fills over time and when your body takes damage. It starts empty each fight.</p></details>
        {!liveMode && <>
          <fieldset disabled={playing && !done}><legend>Try a fighting style</legend><div className={css.styles}>{(['tank', 'speed', 'ranged'] as StyleV5[]).map(style => <button key={style} aria-pressed={style === build.style} title={IDEA[style]} onClick={() => chooseStyle(style)}>{LABEL[style]}</button>)}</div><p>{IDEA[build.style]}</p><div className={css.inputs}><label>Tier<select value={build.tier} onChange={e => { setBuild(presetV5(build.style, Number(e.target.value) as 1 | 2 | 3 | 4)); setPlaying(false); }}>{[1, 2, 3, 4].map(t => <option key={t}>{t}</option>)}</select></label><label>Rival<select value={rival} onChange={e => { setRival(e.target.value as StyleV5); setPlaying(false); }}>{(['tank', 'speed', 'ranged'] as StyleV5[]).map(style => <option value={style} key={style}>{LABEL[style]}</option>)}</select></label></div>
          <label>Weapon<select value={current.parts.weapon.id} onChange={e => { const c = cardV5(e.target.value)!; setBuild(snapshotBuildV5({ ...build.appearanceBuild, weapon: { id: c.id, s: [...c.s] } })); setPlaying(false); }}>{!['tank', 'speed', 'ranged'].some(style => current.parts.weapon.id === `mk5.t${build.tier}.${style}.weapon`) && !current.parts.weapon.id.endsWith('paired-blades') && <option value={current.parts.weapon.id}>{cardV5(current.parts.weapon.id)?.name ?? 'Saved weapon'}</option>}{['tank', 'speed', 'ranged'].map(style => { const c = cardV5(`mk5.t${build.tier}.${style}.weapon`)!; return <option value={c.id} key={c.id}>{c.name}</option>; })}{build.tier >= 2 && <option value={`mk5.t${build.tier}.speed.paired-blades`}>Paired blades</option>}</select></label>
          <label>Fight seed<input type='number' min='0' max='4294967295' value={seed} onChange={e => { setSeed(Number(e.target.value) >>> 0); setPlaying(false); }} /></label></fieldset>
          <div className={css.actions}><button onClick={() => reset(false)} disabled={!ready}>Start again</button><button onClick={() => { setPlaying(v => !v); sfx.current?.unlock(); }} disabled={!ready || done}>{playing ? 'Pause' : 'Continue'}</button></div>
        </>}
        <details><summary>Robot stats &amp; fight details</summary><dl>{Object.entries({ 'Body armour': current.stats.armour[1], 'Movement': current.stats.movement.toFixed(1), 'Accuracy': `${current.stats.accuracy.toFixed(1)}%`, 'Evasion': `${current.stats.evasion.toFixed(1)}%`, 'Attack power': current.stats.force.toFixed(1), 'Rifle shots': f?.shots ?? 0 }).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p>Colour changes the look. Mixed parts keep their full stats.</p><small>{perf.fps} FPS · {perf.drawCalls} draws · {Math.round(perf.triangles / 1000)}k triangles · {perf.vertices} dented vertices{done && s ? ` · Replay ${resultV5(s).hash}` : ''}</small></details>
        <p className={css.limit}>These builds work in practice and house fights. Player fights will support them in a later update.</p>
      </aside>
    </div>
  </main>;
}
