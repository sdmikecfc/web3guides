"use client";

/** Public restaurant viewing and authenticated, server-approved social actions. */
import { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { createWorld, stepWorld, WORLD_FIXED_DT, type Facing, type WorldState } from "../../game/_engine/world";
import { sanitizeDesign, type RestaurantDesign } from "../../game/_engine/building";
import { STARTER_DISH_IDS, dishDef } from "../../game/_engine/cookbook";
import { sanitizeEquipment, type EquipmentState } from "../../game/_engine/equipment";
import { SHELL_SIZES } from "../../game/_engine/rooms";
import { loadGameAssets, type ThemeId } from "../../game/_view/preload";
import { buildScene, type Scene } from "../../game/_view/scene";
import { AUTHORITY_ENABLED, useCloudSave, type KitchenSnapshot } from "../../game/_chain/useCloudSave";
import { NeighborsIcon } from "../../game/RestaurantUI";
import { IconWrench } from "../../game/_ui/icons";
import { CheerButton } from "../../board/CheerButton";
import styles from "./visit.module.css";

export interface VisitPayload {
  ok: boolean; name: string; tier: string; theme: string; shell: number;
  layout: { uid?: number; itemId: string; gx: number; gy: number; facing: Facing }[];
  crew: { chef: number; waiter: number }; hires: { waiters: number; chefs: number };
  design?: RestaurantDesign;
  condition?: { cleanliness: number; equipment: number };
  equipment?: EquipmentState;
  menu?: { selected: string[]; levels: Record<string, number> };
  interactions?: { parcels: boolean; help: boolean };
}

/** A public view needs only the visible menu and placed-machine snapshot. */
export function createVisitWorld(handle: string, view: VisitPayload) {
  const shellIdx = Math.max(0, Math.min(SHELL_SIZES.length - 1, Math.floor(view.shell) || 0)), room = SHELL_SIZES[shellIdx];
  const selected = Array.isArray(view.menu?.selected)
    ? [...new Set(view.menu.selected.filter(id => typeof id === "string" && !!dishDef(id)))] : [...STARTER_DISH_IDS];
  const equipment = sanitizeEquipment(view.equipment);
  for (const [uid, instance] of Object.entries(equipment.instances)) if (!view.layout.some(piece => piece.uid === instance.uid && piece.itemId === instance.itemId)) delete equipment.instances[uid];
  const world = createWorld(`dk-visit-${handle}`, room, {
    layout: view.layout, equipment, hires: view.hires, shellIdx, parkedUsd: 0, weeklyVolumeUsd: 0,
    careJobsActive: false,
    design: sanitizeDesign(view.design, room.w, room.h),
    maintenance: { cleanliness: view.condition?.cleanliness ?? 100, equipment: view.condition?.equipment ?? 100, lastSettledAt: 0 },
    pantry: { stock: {}, levels: view.menu?.levels ?? {} },
    menu: { selected, unlocked: [...STARTER_DISH_IDS, ...selected], serves: {}, specialUnlocked: false, specialServes: 0, specialMastered: false },
  });
  return { world, room };
}

/** Preview acting must not age the host's displayed equipment snapshot. */
export function stepVisitWorld(world: WorldState, room: (typeof SHELL_SIZES)[number], condition: EquipmentState) {
  stepWorld(world, room);
  for (const [uid, instance] of Object.entries(condition.instances)) if (world.equipment.instances[uid]) world.equipment.instances[uid].condition = instance.condition;
}

function ParcelArt() {
  return <svg viewBox="0 0 100 90" width="74" height="67" aria-hidden="true">
    <ellipse cx="49" cy="79" rx="36" ry="8" fill="#486147" opacity=".16" />
    <path d="m17 32 35-13 32 14-2 35-32 14-32-16z" fill="#dca65c" stroke="#936d40" strokeWidth="2" strokeLinejoin="round" />
    <path d="m17 32 33 14 34-13-32-14z" fill="#f4d592" /><path d="m50 46 1 36 31-14 2-35z" fill="#c2914d" />
    <path d="m37 26 32 14-1 34-12 5 1-35-31-14z" fill="#668b65" /><path d="m17 45 32 14 35-14v10L50 68 18 54z" fill="#70976d" />
    <path d="M51 27C15 15 41 0 51 27c0-35 29-20 0 0Z" fill="#83a476" stroke="#517650" strokeWidth="2.5" />
    <path d="m78 12 2-6 2 6 6 2-6 2-2 6-2-6-6-2z" fill="#e8b653" />
  </svg>;
}

export default function VisitClient({ handle }: { handle: string }) {
  const hostRef = useRef<HTMLDivElement>(null), sceneRef = useRef<Scene | null>(null), worldRef = useRef<WorldState | null>(null);
  const parcelRef = useRef<HTMLButtonElement>(null), mounted = useRef(true);
  const cloud = useCloudSave();
  const [status, setStatus] = useState<"loading" | "gone" | "failed" | "ready">("loading");
  const [info, setInfo] = useState<VisitPayload | null>(null), [snapshot, setSnapshot] = useState<KitchenSnapshot | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [collected, setCollected] = useState(false), [gifted, setGifted] = useState(false), [helped, setHelped] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let dead = false;
    if (AUTHORITY_ENABLED && cloud.status === "on") void cloud.social().then((data) => { if (!dead) setSnapshot(data); });
    else setSnapshot(null);
    return () => { dead = true; };
  }, [cloud.social, cloud.status]);

  useEffect(() => {
    let dead = false, initialized = false, app: Application | null = null, scene: Scene | null = null, raf = 0;
    let removeListeners: (() => void) | undefined;
    const controller = new AbortController();
    setStatus("loading"); setCollected(false); setGifted(false); setHelped(false); setMessage("");
    void (async () => {
      try {
        const res = await fetch(`/api/chef/visit/${encodeURIComponent(handle)}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) { if (!dead) setStatus(res.status === 404 ? "gone" : "failed"); return; }
        const v = await res.json() as VisitPayload;
        if (!v.ok) { if (!dead) setStatus("gone"); return; }
        const host = hostRef.current;
        if (dead || !host) return;
        setInfo(v);
        const assets = await loadGameAssets(() => {});
        if (dead) return;
        app = new Application();
        await app.init({ resizeTo: host, background: "#edf0de", antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: "webgl" });
        initialized = true;
        if (dead) { app.destroy(true); app = null; return; }
        host.appendChild(app.canvas);
        app.canvas.style.cssText = "position:absolute;inset:0;touch-action:none";
        const { world, room } = createVisitWorld(handle, v);
        const equipmentSnapshot = structuredClone(world.equipment);
        worldRef.current = world;
        for (let i = 0; i < 60 * 60; i++) stepVisitWorld(world, room, equipmentSnapshot);
        const theme = (["trattoria", "izakaya", "taqueria", "diner", "bistro"].includes(v.theme) ? v.theme : "trattoria") as ThemeId;
        scene = buildScene(app, room, assets, theme); sceneRef.current = scene;
        scene.setCrew({ chef: v.crew.chef, waiter: v.crew.waiter, chefName: "" }); scene.setSign(v.name);
        const onResize = () => scene?.resize(host.clientWidth, host.clientHeight, host.clientWidth < 700 ? 125 : 98, host.clientWidth < 700 ? 190 : 145);
        onResize();
        const observer = new ResizeObserver(onResize); observer.observe(host);
        let drag: { x: number; y: number } | null = null;
        const down = (event: PointerEvent) => { drag = { x: event.clientX, y: event.clientY }; app?.canvas.setPointerCapture(event.pointerId); };
        const move = (event: PointerEvent) => { if (!drag) return; scene?.panBy(event.clientX - drag.x, event.clientY - drag.y); drag = { x: event.clientX, y: event.clientY }; };
        const up = () => { drag = null; };
        const wheel = (event: WheelEvent) => { event.preventDefault(); const rect = host.getBoundingClientRect(); scene?.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top); };
        const canvas = app.canvas;
        canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("wheel", wheel, { passive: false });
        removeListeners = () => { observer.disconnect(); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("wheel", wheel); };
        let acc = 0, last = performance.now();
        const loop = (time: number) => {
          acc += Math.min(.25, (time - last) / 1000); last = time;
          while (acc >= WORLD_FIXED_DT) { stepVisitWorld(world, room, equipmentSnapshot); acc -= WORLD_FIXED_DT; }
          scene?.sync(world, null);
          if (scene && parcelRef.current) {
            const point = scene.tileToScreen(room.door.x + .5, room.door.y + .4);
            parcelRef.current.style.left = `${point.x}px`; parcelRef.current.style.top = `${point.y}px`;
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop); setStatus("ready");
      } catch (error) { if (!dead && !(error instanceof DOMException && error.name === "AbortError")) setStatus("failed"); }
    })();
    return () => { dead = true; controller.abort(); cancelAnimationFrame(raf); removeListeners?.(); scene?.destroy(); if (initialized) app?.destroy(true); sceneRef.current = null; worldRef.current = null; };
  }, [handle, retry]);

  const neighbor = snapshot?.neighbors.find((entry) => entry.handle.toLowerCase() === handle.toLowerCase());
  const mine = cloud.wallet ? `${cloud.wallet.slice(0, 6)}…${cloud.wallet.slice(-4)}`.toLowerCase() === handle.toLowerCase() : false;
  const friends = neighbor?.status === "friend";
  const availability = neighbor as typeof neighbor & { parcelAvailable?: boolean; helpAvailable?: boolean; giftSent?: boolean };
  const parcelAvailable = friends && info?.interactions?.parcels && !collected && availability?.parcelAvailable !== false && (snapshot?.authority.socialRemaining ?? 0) > 0;

  async function act(type: "requestFriend" | "acceptFriend" | "findGift" | "sendGift" | "help") {
    if (busy || !AUTHORITY_ENABLED || cloud.status !== "on") return;
    setBusy(true); setMessage("");
    const result = await cloud.command({ type, targetHandle: handle });
    if (!mounted.current) return;
    if (result) {
      setSnapshot(result);
      if (type === "findGift") { setCollected(true); setMessage("A little ingredient surprise is waiting in your pantry."); sceneRef.current?.spark(worldRef.current?.door.x ?? 4, worldRef.current?.door.y ?? 7, 0xc7a75c, 14); }
      else if (type === "sendGift") { setGifted(true); setMessage("Your neighbor received a little ingredient parcel."); }
      else if (type === "requestFriend") setMessage("Your invitation is on its way. You can share parcels once they accept.");
      else if (type === "acceptFriend") setMessage("You are neighbors. Have a look for a parcel by the door.");
      else {
        setHelped(true); setMessage("A little care goes a long way. Their restaurant feels better already.");
        try {
          const response = await fetch(`/api/chef/visit/${encodeURIComponent(handle)}`, { cache: "no-store" });
          const fresh = response.ok ? await response.json() as VisitPayload : null;
          if (fresh?.ok && mounted.current) { setInfo(fresh); if (worldRef.current && fresh.condition) Object.assign(worldRef.current.maintenance, fresh.condition); }
        } catch { /* A confirmed help remains successful if the visual refresh is offline. */ }
      }
    }
    setBusy(false);
  }
  const zoom = (factor: number) => { const host = hostRef.current; if (host) sceneRef.current?.zoomAt(factor, host.clientWidth / 2, host.clientHeight / 2); };
  return <main className={styles.visit}>
    <div ref={hostRef} className={styles.stage} aria-label="Your neighbor's restaurant" />
    <header className={styles.header}>
      <div className={styles.crest}><NeighborsIcon size={28} /></div>
      <div className={styles.identity}><span className={styles.eyebrow}>Around the corner</span><h1>{info?.name || "A little neighborhood kitchen"}</h1><p>{status === "ready" ? `${info?.tier} · ${mine ? "Your restaurant" : friends ? "Your neighbor’s restaurant" : "You’re visiting"}` : status === "loading" ? "Opening the door…" : "A table for another time"}</p></div>
      {status === "ready" && <CheerButton handle={handle} />}
    </header>
    {status === "loading" && <div className={styles.loading} role="status"><ParcelArt /><span>Setting the table for your visit…</span></div>}
    {(status === "gone" || status === "failed") && <section className={styles.unavailable}>
      <NeighborsIcon size={44} /><h2>{status === "gone" ? "This restaurant isn’t open for visits." : "We couldn’t open the door just yet."}</h2>
      <p>{status === "gone" ? "Find another lovely little place in the neighborhood." : "Your connection may have paused. Give it another try."}</p>
      {status === "failed" && <button onClick={() => setRetry((n) => n + 1)}>Try again</button>}<a href="/chef/board">Explore the neighborhood</a>
    </section>}
    {status === "ready" && <>
      <div className={styles.camera} aria-label="Restaurant camera"><button aria-label="Zoom in" onClick={() => zoom(1.2)}>+</button><button aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>−</button><button aria-label="Show whole restaurant" onClick={() => sceneRef.current?.resetCamera()}>Fit</button></div>
      {parcelAvailable && <button ref={parcelRef} type="button" className={styles.parcel} disabled={busy} onClick={() => void act("findGift")} aria-label="Open the ingredient parcel by the restaurant entrance"><ParcelArt /><span>A little surprise</span></button>}
      <section className={styles.social} aria-label="Visit actions">
        <div className={styles.socialTitle}><NeighborsIcon size={22} /><strong>{friends ? "Good neighbors make a happy kitchen." : "Every neighborhood starts with a hello."}</strong></div>
        {mine ? <p>You’re admiring your own place. Head home to decorate or welcome another guest.</p>
          : !AUTHORITY_ENABLED ? <p>Enjoy a look around and cheer for this kitchen. Neighbor parcels will arrive with connected restaurants.</p>
          : cloud.status !== "on" ? <p><a href="/chef">Sign in at your restaurant</a> to meet this chef, find ingredients, and lend a hand.</p>
          : !snapshot ? <p>{cloud.error || "Opening your neighbor book…"}</p>
          : neighbor?.status === "blocked" ? <p>You have blocked this restaurant. Manage your neighbors from your own kitchen.</p>
          : !friends ? <div className={styles.actions}><p>{neighbor?.status === "outgoing" ? "Your invitation is waiting for this chef." : "Become neighbors to share ingredients and help each other’s restaurants."}</p><button disabled={busy || neighbor?.status === "outgoing"} onClick={() => void act(neighbor?.status === "incoming" ? "acceptFriend" : "requestFriend")}>{neighbor?.status === "incoming" ? "Accept invitation" : neighbor?.status === "outgoing" ? "Invitation sent" : "Become neighbors"}</button></div>
          : <><div className={styles.actions}>
            <button disabled={busy || !parcelAvailable} onClick={() => void act("findGift")}>{collected || availability?.parcelAvailable === false ? "Parcel collected" : (snapshot.authority.socialRemaining ?? 0) <= 0 ? "Pantry surprises complete" : "Find a parcel"}</button>
            <button disabled={busy || gifted || availability?.giftSent} onClick={() => void act("sendGift")}>{gifted || availability?.giftSent ? "Parcel delivered" : "Send a gift"}</button>
            <button disabled={busy || helped || availability?.helpAvailable === false || !info?.interactions?.help} onClick={() => void act("help")}><IconWrench size={16} />{helped ? "Helped today" : info?.interactions?.help ? "Lend a hand" : "Already sparkling"}</button>
          </div><p>{snapshot.authority.socialRemaining} ingredient surprises left today across all visits and gifts.</p></>}
        {message && <p className={styles.success} role="status">{message}</p>}
        {cloud.error && snapshot && <p className={styles.error} role="alert">{cloud.error}</p>}
      </section>
    </>}
    <a className={styles.home} href="/chef">Back to my restaurant</a>
  </main>;
}
