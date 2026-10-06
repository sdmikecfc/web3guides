"use client";

import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { ITEMS, type ItemFacing } from "../game/_engine/items";
import { SHELL_SIZES } from "../game/_engine/rooms";
import { stepWorld, WORLD_FIXED_DT, type WorldState } from "../game/_engine/world";
import { loadGameAssets } from "../game/_view/preload";
import { buildScene, type Scene } from "../game/_view/scene";
import { applyToiletView, collectionItem, createInspectionWorld, FACINGS, fixtureSprite, REVIEW_COLLECTIONS, reviewTheme, type ReviewCollection, type ReviewScene, type ToiletView } from "./fixture";
import styles from "./review.module.css";

const LABELS: Record<ReviewCollection, string> = { trattoria: "Trattoria", izakaya: "Izakaya", taqueria: "Taqueria", diner: "Diner", bistro: "Bistro", neonlab: "Software · Neon Lab", bonebronze: "Boner · Bone Bronze" };

export default function ReviewStage() {
  const hostRef = useRef<HTMLDivElement>(null), sceneRef = useRef<Scene | null>(null);
  const [collection, setCollection] = useState<ReviewCollection>("trattoria");
  const [mode, setMode] = useState<ReviewScene>("starter");
  const [shell, setShell] = useState(0), [facing, setFacing] = useState<ItemFacing>("se");
  const [toilets, setToilets] = useState<ToiletView>("working"), [characters, setCharacters] = useState(true), [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0), [error, setError] = useState(""), [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  const [fixtureId, setFixtureId] = useState("chair_basic"), [brokenAsset, setBrokenAsset] = useState(false);
  const [stats, setStats] = useState({ seats: 0, guests: 0, served: 0 });
  const options = useRef({ toilets, characters, paused });
  options.current = { toilets, characters, paused };
  const theme = reviewTheme(collection);
  const selectedItem = ITEMS.find((entry) => entry.id === fixtureId) ?? collectionItem("chair", collection);
  // Essentials follow the room collection; fixed collection items retain their own art.
  const comparisonItem = selectedItem.collection === "essentials" ? collectionItem(selectedItem.kind, collection) : selectedItem;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false, initialized = false, app: Application | null = null, scene: Scene | null = null;
    let detach: (() => void) | undefined;
    setReady(false); setError(""); setProgress(0);
    void (async () => {
      try {
        const assets = await loadGameAssets((value) => { if (!disposed) setProgress(value); });
        if (disposed) return;
        const { world, room } = createInspectionWorld(collection, shell, facing, mode);
        app = new Application();
        await app.init({ resizeTo: host, background: "#f4eddf", antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: "webgl", autoStart: false });
        initialized = true;
        if (disposed) { app.destroy(true, { children: true, texture: false }); app = null; return; }
        host.appendChild(app.canvas);
        app.canvas.setAttribute("aria-label", mode === "starter" ? "Live starter restaurant with two corner restrooms and a thin privacy divider" : "Live Domain Kitchen restaurant with four chair directions and two restrooms");
        scene = buildScene(app, room, assets, reviewTheme(collection)); sceneRef.current = scene;
        scene.setCrew({ chef: 0, waiter: 1, chefName: "Gus" }); scene.setSign("Little Olive");
        const resize = () => {
          if (!app || !scene) return;
          app.renderer.resize(host.clientWidth, host.clientHeight);
          // This is the game's normal fit camera with only a modest inspection margin.
          scene.resize(host.clientWidth, host.clientHeight, 18, 24);
        };
        resize();
        const observer = new ResizeObserver(resize); observer.observe(host);
        const canvas = app.canvas;
        let drag: { id: number; x: number; y: number } | null = null;
        const down = (event: PointerEvent) => { if (event.button !== 0) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); };
        const move = (event: PointerEvent) => { if (!drag || drag.id !== event.pointerId) return; scene?.panBy(event.clientX - drag.x, event.clientY - drag.y); drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; };
        const up = (event: PointerEvent) => { if (drag?.id === event.pointerId) drag = null; };
        const wheel = (event: WheelEvent) => { event.preventDefault(); const rect = canvas.getBoundingClientRect(); scene?.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top); };
        canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("wheel", wheel, { passive: false });
        detach = () => { observer.disconnect(); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("wheel", wheel); };
        let accumulator = 0, statsIn = 0;
        const hiddenWorld: WorldState = { ...world, entities: [] };
        app.ticker.add((ticker) => {
          const elapsed = Math.min(.1, ticker.deltaMS / 1000);
          if (!options.current.paused) {
            accumulator += elapsed;
            while (accumulator >= WORLD_FIXED_DT) {
              applyToiletView(world, options.current.toilets);
              stepWorld(world, room); accumulator -= WORLD_FIXED_DT;
            }
          } else accumulator = 0;
          applyToiletView(world, options.current.toilets);
          if (options.current.characters) scene?.sync(world, null);
          else { Object.assign(hiddenWorld, world); hiddenWorld.entities = []; scene?.sync(hiddenWorld, null); }
          statsIn -= elapsed;
          if (statsIn <= 0) {
            statsIn = 1;
            setStats({ seats: world.seats.length, guests: world.entities.filter((entity) => entity.kind === "guest").length, served: world.stats.served });
          }
        });
        app.start(); setReady(true);
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "The inspection room could not load.");
        detach?.(); detach = undefined;
        if (sceneRef.current === scene) sceneRef.current = null;
        scene?.destroy(); scene = null;
        if (initialized) { app?.destroy(true, { children: true, texture: false }); app = null; }
      }
    })();
    return () => { disposed = true; detach?.(); scene?.destroy(); if (initialized) app?.destroy(true, { children: true, texture: false }); if (sceneRef.current === scene) sceneRef.current = null; };
  }, [collection, shell, facing, mode, retry]);

  function zoom(factor: number) {
    const host = hostRef.current;
    if (host) sceneRef.current?.zoomAt(factor, host.clientWidth / 2, host.clientHeight / 2);
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Local restaurant preview</span><h1>A little place to make yours</h1><p>A welcoming foundation, a tidy bathroom corner, and room for your own ideas. This preview is temporary.</p></div>
      <a href="/chef/game">Open the game</a>
    </header>
    <section className={styles.controls} aria-label="Inspection controls">
      <label>Scene<select value={mode} onChange={(event) => setMode(event.target.value as ReviewScene)}><option value="starter">Starter restaurant</option><option value="inspection">Fixture inspection</option></select></label>
      <label>Collection<select value={collection} onChange={(event) => setCollection(event.target.value as ReviewCollection)}>{REVIEW_COLLECTIONS.map((entry) => <option key={entry} value={entry}>{LABELS[entry]}</option>)}</select></label>
      <label>Room size<select value={shell} onChange={(event) => setShell(Number(event.target.value))}>{SHELL_SIZES.map((room, index) => <option value={index} key={room.label}>{room.w} × {room.h} · {room.label}</option>)}</select></label>
      {mode === "inspection" && <label>Fixture direction<select value={facing} onChange={(event) => setFacing(event.target.value as ItemFacing)}>{FACINGS.map((entry) => <option key={entry} value={entry}>{entry.toUpperCase()}</option>)}</select></label>}
      <label>Restrooms<select value={toilets} onChange={(event) => setToilets(event.target.value as ToiletView)}><option value="comparison">One working + one broken</option><option value="working">Both working</option><option value="broken">Both broken</option></select></label>
      <label className={styles.check}><input type="checkbox" checked={characters} onChange={(event) => setCharacters(event.target.checked)} /> Show characters</label>
      <button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? "Resume service" : "Pause service"}</button>
    </section>
    <section className={styles.room} aria-label="Actual game rendering">
      <div className={styles.host} ref={hostRef} />
      {!ready && <div className={styles.loading} role="status">{error ? <><strong>Unable to open this fixture</strong><p>{error}</p><button onClick={() => setRetry((value) => value + 1)}>Try again</button></> : <>Setting the tables… {Math.round(progress * 100)}%</>}</div>}
      <div className={styles.camera} aria-label="Inspection camera"><button disabled={!ready} aria-label="Zoom in" onClick={() => zoom(1.2)}>+</button><button disabled={!ready} aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>−</button><button disabled={!ready} onClick={() => sceneRef.current?.resetCamera()}>Fit room</button></div>
      <p className={styles.caption}>{mode === "starter" ? "Corner bathrooms · space to make it yours" : "Four chair directions · two restrooms"} · {stats.seats} reachable dining seats · {stats.guests} guests · {stats.served} plates served</p>
    </section>
    <p className={styles.note}>{mode === "starter" ? "The new restaurant arrangement, shown in your chosen room and collection. Two tables, a simple kitchen, and working bathrooms tucked behind a slim divider. Everything can be moved in Decorate. Expanding an existing restaurant keeps your furniture where you placed it." : "Fixture direction turns the stove, counter, bench, divider, and restrooms; the four dining chairs keep their comparison directions. Domain collections use their own available pieces with essential fixtures."} Drag to pan after zooming.</p>
    <section className={styles.assetPanel} aria-label="Four direction furniture comparison">
      <div className={styles.assetHeading}><div><h2>Check a piece on its own</h2><p>Actual shipped sprites with the same front, back, and mirroring choices as the restaurant.</p></div><label>Furniture<select value={fixtureId} onChange={(event) => setFixtureId(event.target.value)}>{["essentials", ...REVIEW_COLLECTIONS].map((group) => <optgroup key={group} label={group === "essentials" ? "Current collection fixtures" : LABELS[group as ReviewCollection]}>{ITEMS.filter((item) => item.collection === group).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select></label></div>
      {comparisonItem.kind === "toilet" && <label className={styles.check}><input type="checkbox" checked={brokenAsset} onChange={(event) => setBrokenAsset(event.target.checked)} /> Show damaged restroom sprite</label>}
      <div className={styles.comparison}>{FACINGS.map((direction) => {
        const sprite = fixtureSprite(comparisonItem, theme, direction, brokenAsset);
        return <figure key={direction}><div className={styles.sprite}><img src={sprite.src} alt={`${comparisonItem.label}, facing ${direction.toUpperCase()}`} draggable={false} style={{ transform: sprite.mirror ? "scaleX(-1)" : undefined }} /></div><figcaption><strong>{direction.toUpperCase()}</strong><span>{comparisonItem.label}</span></figcaption></figure>;
      })}</div>
    </section>
  </main>;
}
