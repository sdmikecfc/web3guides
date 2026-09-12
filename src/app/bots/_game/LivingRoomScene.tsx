"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Build } from "../_engine/parts";
import type { BotLook } from "../_view/look";
import { createLivingRoom, type LivingRoom, type RoomActorLoader, type RoomFraming } from "../_view/living-room";

export interface RoomActor { id: string; bay: number; build: Build; look: BotLook; activity?: "wave" | "inspect" | "arrive" }
export interface RoomAnchor { id: string; bay: number; x: number; y: number; width: number; height: number }
export interface RoomLoadStatus { ready: number; pending: number; failedIds: string[] }
export interface LivingRoomSceneProps {
  actors: RoomActor[]; selectedId?: string; variant?: "garage" | "community";
  className?: string; onAnchors?: (anchors: RoomAnchor[]) => void; onReady?: () => void; onLoadStatus?: (status: RoomLoadStatus) => void;
  loadActor?: RoomActorLoader;
  framing?: RoomFraming;
}
export interface LivingRoomSceneHandle { capture(): string | null }

/** One camera, floor and renderer. Accessible DOM controls use projected stands. */
const LivingRoomScene = forwardRef<LivingRoomSceneHandle, LivingRoomSceneProps>(function LivingRoomScene({ actors, selectedId, variant = "garage", className, onAnchors, onReady, onLoadStatus, loadActor, framing }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null), host = useRef<HTMLDivElement>(null);
  const scene = useRef<LivingRoom | null>(null);
  const latest = useRef({ actors, selectedId, onAnchors, onReady, onLoadStatus });
  latest.current = { actors, selectedId, onAnchors, onReady, onLoadStatus };
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [loadStatus, setLoadStatus] = useState<RoomLoadStatus>({ ready: 0, pending: actors.length, failedIds: [] });
  const key = JSON.stringify(actors), refresh = useRef<(retry?: boolean) => void>(() => {});
  useImperativeHandle(ref, () => ({ capture() { if (!scene.current || !canvas.current || state !== "ready") return null; scene.current.render(0); return canvas.current.toDataURL("image/png"); } }), [state]);
  useEffect(() => {
    if (!canvas.current || !host.current) return;
    const element = canvas.current, container = host.current;
    let room: LivingRoom;
    let dead = false, visible = true, frame = 0, previous = 0, ready = false, revision = 0, lastKey = "", modalOpen = false;
    let sampleStart = 0, sampleFrames = 0, metricsAt = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    try { room = createLivingRoom(element, variant, undefined, loadActor, framing); scene.current = room; }
    catch (error) { console.error("[living room]", error); setState("failed"); return; }
    const draw = (time = 0) => {
      room.render(motion.matches ? 0 : Math.floor(time * 12) / 12);
      const now = performance.now();
      if (time && now - metricsAt < 1000) return;
      metricsAt = now;
      const m = room.metrics();
      container.dataset.roomDrawCalls = String(m.calls); container.dataset.roomTriangles = String(m.triangles);
      container.dataset.roomCpuMs = m.cpuMs.toFixed(2); container.dataset.roomActors = String(m.actors);
      container.dataset.roomGeometries = String(m.geometries); container.dataset.roomTextures = String(m.textures);
    };
    const animate = (time: number) => {
      frame = 0;
      if (dead || !ready || !visible || document.hidden || motion.matches || modalOpen) return;
      if (time - previous >= 16) {
        draw(time / 1000); previous = time; sampleFrames++;
        if (!sampleStart) sampleStart = time;
        if (time - sampleStart >= 1500) {
          container.dataset.roomFramesPerSecond = (sampleFrames * 1000 / (time - sampleStart)).toFixed(1);
          container.dataset.roomSampleMs = String(Math.round(time - sampleStart)); sampleFrames = 0; sampleStart = time;
        }
      }
      frame = requestAnimationFrame(animate);
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame); frame = 0;
      sampleStart = 0; sampleFrames = 0;
      container.dataset.roomAnimating = String(ready && visible && !document.hidden && !motion.matches && !modalOpen);
      if (!ready || !visible || document.hidden || motion.matches || modalOpen) { container.dataset.roomFramesPerSecond = "0"; container.dataset.roomSampleMs = "0"; }
      if (dead || !ready || !visible || document.hidden || modalOpen) return;
      if (motion.matches) draw(); else frame = requestAnimationFrame(animate);
    };
    const resize = () => {
      if (dead || !container.clientWidth || !container.clientHeight) return;
      room.resize(container.clientWidth, container.clientHeight, window.devicePixelRatio || 1);
      latest.current.onAnchors?.(room.anchors()); if (ready) draw();
    };
    const update = (retry = false) => {
      const nextKey = JSON.stringify(latest.current.actors); if (!retry && nextKey === lastKey) return; lastKey = nextKey;
      const ticket = ++revision;
      void room.setActors(latest.current.actors, status => {
        if (dead || ticket !== revision) return;
        setLoadStatus(status); latest.current.onLoadStatus?.(status);
        resize(); if (status.ready || !status.pending) setState("ready");
      }).then(accepted => {
        if (dead || ticket !== revision || !accepted) return;
        ready = true; room.select(latest.current.selectedId); resize(); setState("ready");
        latest.current.onReady?.(); schedule();
      }).catch(error => { if (!dead && ticket === revision) { console.error("[living room actors]", error); setState("failed"); } });
    };
    refresh.current = update; setState("loading");
    const observer = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); schedule(); });
    const lost = (event: Event) => { event.preventDefault(); ready = false; setState("failed"); schedule(); };
    const modals = new MutationObserver(() => { const next = !!document.querySelector('dialog[open],[aria-modal="true"]'); if (next !== modalOpen) { modalOpen = next; schedule(); } });
    modals.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal"] });
    observer.observe(container); intersection.observe(container); element.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", schedule); motion.addEventListener("change", schedule);
    ready = true; resize(); schedule(); update();
    return () => {
      dead = true; revision++; refresh.current = () => {}; if (frame) cancelAnimationFrame(frame);
      observer.disconnect(); intersection.disconnect(); modals.disconnect(); element.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", schedule); motion.removeEventListener("change", schedule);
      room.dispose(); if (scene.current === room) scene.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, loadActor, framing]);
  useEffect(() => { refresh.current(); }, [key]);
  useEffect(() => { scene.current?.select(selectedId); scene.current?.render(0); }, [selectedId]);
  return <div ref={host} className={className} data-room-ready={state === "ready"} data-room-variant={variant} data-room-pending={loadStatus.pending} data-room-failed={loadStatus.failedIds.join(",")} style={{ width: "100%", height: "100%", position: "relative" }}>
    <canvas ref={canvas} aria-hidden="true" style={{ width: "100%", height: "100%", display: "block" }} />
    {(state !== "ready" || loadStatus.failedIds.length > 0) && <div role="status" style={{ position: "absolute", bottom: 10, left: 10, maxWidth: "calc(100% - 20px)", color: "#f4ddbb", background: "#392a20ed", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
      {state === "failed" ? "The room picture could not load. Your robot buttons still work." : loadStatus.failedIds.length ? `${loadStatus.failedIds.length} robot picture${loadStatus.failedIds.length === 1 ? "" : "s"} could not load. The others are ready.` : "The robots are arriving…"}
      {loadStatus.failedIds.length > 0 && <button style={{ marginLeft: 10, color: "inherit", background: "#6e5030", border: "1px solid #c49c67", borderRadius: 5, padding: "5px 8px" }} onClick={() => refresh.current(true)}>Try pictures again</button>}
    </div>}
  </div>;
});
export default LivingRoomScene;
