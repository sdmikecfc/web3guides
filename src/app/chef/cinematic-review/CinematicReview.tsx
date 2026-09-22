'use client';

import { useEffect, useMemo, useState } from 'react';
import { createDiner, homeSimulationConfig } from '@/lib/chef/diner/progression';
import { createHomeWorld, stepHomeWorld } from '@/lib/chef/diner/home-simulation';
import DinerScene from '../diner-preview/DinerScene';
import { homeScene } from '../diner-preview/home-scene';
import type { DinerPerformance, DinerSceneData, ScenePerson } from '../diner-preview/scene-types';
import styles from './review.module.css';

type Pose = 'idle' | 'walk' | 'carry' | 'cook' | 'wash' | 'eat' | 'takeOrder' | 'waiting';
type Finish = 'burger' | 'cafe';
const POSES: Array<{ id: Pose; name: string }> = [
  { id: 'idle', name: 'A quiet moment' },
  { id: 'walk', name: 'Walking' },
  { id: 'carry', name: 'Bringing lunch' },
  { id: 'cook', name: 'On the grill' },
  { id: 'wash', name: 'Washing up' },
  { id: 'eat', name: 'First bite' },
  { id: 'takeOrder', name: 'Taking an order' },
  { id: 'waiting', name: 'Dreaming of lunch' },
];

/** A small stage using exactly the character, food and furniture renderer used in play. */
function characterScene(pose: Pose, tick: number, finish: Finish, paused: boolean): DinerSceneData {
  const role: ScenePerson['role'] = pose === 'eat'||pose === 'waiting' ? 'customer' : pose === 'takeOrder' ? 'cashier' : pose === 'carry' ? 'waiter' : 'chef';
  // Renderer identity includes the role, so switching actions also swaps the
  // uniform and silhouette instead of dressing every role as the cook.
  const person: ScenePerson = { id: `review-${role}`, role, x: 1.5, y: 1.1, pose:pose==='waiting'?'idle':pose, target: { x: 1.5, y: 2.1 } };
  if(pose==='waiting')person.order={recipeId:'classic_burger',patience:.85};
  const scene: DinerSceneData = {
    width: 4, height: 3, homeTerraceDepth: 0, previewInset: 20, characterReview: true,
    sign: 'Bun & Butter', paint: finish === 'burger' ? '#bd654e' : '#365f55',
    floor: finish === 'burger' ? 'checker' : 'wood', wall: 'cream',
    roomFinishes: finish === 'burger'
      ? { counter: 'tomato', worktop: 'porcelain', upholstery: 'cherry', sign: 'cream' }
      : { counter: 'sage', worktop: 'walnut', upholstery: 'mint', sign: 'cream' },
    menu: ['classic_burger'], tick, paused, objects: [], tables: [], people: [person],
  };
  if (pose === 'eat') {
    person.look = 2; person.x = 1.5; person.y = .65;
    person.target = { x: 1.5, y: 1.65 }; person.tableId = 'review-table'; person.seatId = 'review-seat';
    person.work = { seatHeight: .47 };
    scene.tables = [{
      id: 'review-table', x: 1.5, y: 1.65, rotation: 0, capacity: 1,
      seatHeight: .47, surfaceHeight: .85,
      seats: [{ id: 'review-seat', x: person.x, y: person.y, status: 'eating', customerId: person.id,
        item: { recipeId: 'classic_burger', kind: 'dish', vesselKind: 'plate', mastery: 3 } }],
    }];
  } else if (pose === 'takeOrder') {
    person.x = 1; person.y = .65;
    person.target = { x: 1, y: 1.65 }; person.work = { stationKind: 'pass' };
    scene.objects = [{ id: 'review-counter', kind: 'display_counter', x: .5, y: 1.65, footprint: [3, 1] }];
  } else {
    if (pose === 'cook' || pose === 'wash') {
      // Face the working side of the foreground station. The face, hands and
      // task remain visible from the initial camera without faking the contact.
      person.x = 1.5; person.y = .65;
      person.target = { x: person.x, y: 1.65 };
      person.work = { stationKind: pose === 'cook' ? 'grill' : 'sink', recipeId: 'classic_burger' };
      scene.objects = [{
        id: `review-${pose === 'cook' ? 'grill' : 'sink'}`, kind: pose === 'cook' ? 'grill' : 'sink',
        x: 1.5, y: 1.65, rotation: 2, state: 'working',
        ...(pose === 'cook' ? { food: { recipeId: 'classic_burger', kind: 'processed', stage: 'patty' } as const, progress: (tick % 100) / 100 } : {}),
      }];
      // Washing uses the rig's hand-held dish and sponge. An inventory item
      // here would correctly select the carrying pose instead of scrubbing.
    }
    if (pose === 'walk' || pose === 'carry') {
      // Constant speed with a brief turning point, rather than a character skating in place.
      const leg = (tick % 160) / 80, forwards = leg < 1;
      person.x = .35 + (forwards ? leg : 2 - leg) * 2.7; person.y = 1.75;
      person.target = { x: forwards ? 3.1 : .3, y: person.y };
      if (pose === 'carry') {
        person.held = { recipeId: 'classic_burger', kind: 'dish', vesselKind: 'plate', mastery: 3 };
      }
    }
  }
  return scene;
}

/** Development proof only: no authentication changes, saves, rewards or network writes. */
export default function CinematicReview() {
  const [mode, setMode] = useState<'restaurant' | 'character'>('restaurant');
  const [pose, setPose] = useState<Pose>('cook');
  const [finish, setFinish] = useState<Finish>('burger');
  const [paused, setPaused] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [reset, setReset] = useState(0);
  const [frame, setFrame] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [performance, setPerformance] = useState<DinerPerformance | null>(null);
  const baseState = useMemo(() => {
    const state = createDiner(1_800_000_000_000, 'cinematic-review');
    state.home.name = 'Bun & Butter';
    state.home.menu.main = ['classic_burger'];
    return state;
  }, [reset]);
  const world = useMemo(() => {
    const next = createHomeWorld({ ...homeSimulationConfig(baseState), arrivalRate: 150 });
    // Reach a real populated lunch through simulation; no posed or fabricated orders.
    stepHomeWorld(next, 1400);
    return next;
  }, [baseState]);
  const state = useMemo(() => finish === 'burger' ? baseState : {
    ...baseState,
    cosmetics: { ...baseState.cosmetics, floor: 'wood', wall: 'cream' },
    home: { ...baseState.home, finishes: { counter: 'sage', worktop: 'walnut', upholstery: 'mint', sign: 'cream' } },
  }, [baseState, finish]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (mode === 'restaurant') stepHomeWorld(world);
      setFrame(value => value + 1);
    }, 50);
    return () => clearInterval(timer);
  }, [paused, world, mode]);

  const scene = mode === 'restaurant'
    ? { ...homeScene(state, world, selected, finish === 'burger' ? '#bd654e' : '#365f55'), paused, previewInset: 20 }
    : characterScene(pose, frame, finish, paused);
  const changeMode = (next: typeof mode) => { setMode(next); setSelected(null); setPerformance(null); };
  const restart = () => { setReset(value => value + 1); setFrame(0); setSelected(null); setPaused(false); };

  return <main className={styles.review} data-cinematic-review data-review-ready={performance ? 'true' : 'false'}
    data-scene-mode={mode} data-person-pose={pose} data-room-style={finish}
    data-simulation-tick={world.tick} data-orders-taken={world.metrics.ordersTaken} data-served={world.metrics.plates}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>DOMAIN KITCHEN · ART PROOF</p><h1>A little shop with heart.</h1></div>
      <div className={styles.viewSwitch} aria-label="Review scene">
        <button aria-pressed={mode === 'restaurant'} onClick={() => changeMode('restaurant')}>Live restaurant</button>
        <button aria-pressed={mode === 'character'} onClick={() => changeMode('character')}>Up close</button>
      </div>
    </header>

    <section className={styles.stage} aria-label={mode === 'restaurant' ? 'Live burger shop' : 'Character animation review'}>
      <DinerScene key={mode} mode="home" scene={scene} rotation={rotation} onTarget={setSelected}
        onTile={() => setSelected(null)} showWorldHints={false} onPerformance={setPerformance} />
      <div className={styles.sceneCaption}>
        <span className={paused ? styles.pausedDot : styles.liveDot} />
        {mode === 'restaurant'
          ? `${paused ? 'Lunch paused' : 'Lunch is in full swing'} · ${world.metrics.plates} served`
          : POSES.find(item => item.id === pose)?.name}
      </div>
    </section>

    <footer className={styles.footer}>
      <div className={styles.controls}>
        <label>{mode === 'restaurant' ? 'Make it yours' : 'Little moments'}
          {mode === 'restaurant'
            ? <select aria-label="Restaurant finish" value={finish} onChange={event => setFinish(event.target.value as Finish)}><option value="burger">Cherry burger shop</option><option value="cafe">Sage & walnut café</option></select>
            : <select aria-label="Character action" value={pose} onChange={event => { setPose(event.target.value as Pose); setFrame(0); }}>{POSES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        </label>
        <div className={styles.buttons}>
          <button onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? 'Play' : 'Pause'}</button>
          <button aria-label="Turn camera left" onClick={() => setRotation(value => (value + 3) % 4)}>↶</button>
          <button aria-label="Turn camera right" onClick={() => setRotation(value => (value + 1) % 4)}>↷</button>
          <button onClick={restart}>Reset</button>
        </div>
      </div>
      <div className={styles.notes}>
        <p>{mode === 'restaurant' ? 'Real orders, cooking, handoffs and clearing. Drag to look around; scroll or pinch to get closer.' : 'Same characters and animations as the game. Turn the camera to inspect hands, faces and foot contact.'}</p>
        <output aria-label="Renderer performance" data-fps={performance?.fps} data-draw-calls={performance?.drawCalls} data-triangles={performance?.triangles}>
          {performance ? `${performance.fps} FPS · ${performance.drawCalls} draws · ${performance.triangles.toLocaleString()} triangles` : 'Preparing the scene…'}
        </output>
      </div>
      {world.notice && mode === 'restaurant' && <p role="status" className={styles.notice}>{world.notice}</p>}
    </footer>
  </main>;
}
