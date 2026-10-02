"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LivingRoomScene, { type RoomLoadStatus } from "../../_game/LivingRoomScene";
import { createCombatToy } from "../../_view/combat-toy";
import { type RoomActorLoader } from "../../_view/living-room";
import { communityVisitors } from "@/lib/bots/community-room";
import { rigLookOf } from "../../_view/look-view";

/** Development-only fixture: real models and renderer, injected asynchronous loader failures. */
export default function LoadingCheck() {
  const [mounted, setMounted] = useState(true), [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<RoomLoadStatus>({ ready: 0, pending: 5, failedIds: [] });
  const failures = useRef(new Set(["practice-2"])), delayed = useRef(false);
  const counts = useRef({ created: 0, disposed: 0, attempts: {} as Record<string, number> });
  const [metrics, setMetrics] = useState(counts.current);
  useEffect(() => { const timer = setInterval(() => setMetrics({ ...counts.current, attempts: { ...counts.current.attempts } }), 100); return () => clearInterval(timer); }, []);
  const actors = useMemo(() => communityVisitors(null).visitors.map(visitor => ({ id: visitor.id, bay: visitor.bay, build: visitor.build, look: rigLookOf(visitor.look, visitor.paint), activity: revision % 2 ? "inspect" as const : "wave" as const })), [revision]);
  const loadActor = useCallback<RoomActorLoader>(async (definition, quality) => {
    counts.current.attempts[definition.id] = (counts.current.attempts[definition.id] ?? 0) + 1;
    if (delayed.current) await new Promise(resolve => setTimeout(resolve, 450));
    if (failures.current.has(definition.id)) throw new Error(`Expected isolated loader failure for ${definition.id}`);
    const toy = await createCombatToy(definition.build, definition.look, false, quality);
    counts.current.created++;
    const dispose = toy.dispose.bind(toy); let disposed = false;
    toy.dispose = () => { if (!disposed) { disposed = true; counts.current.disposed++; } dispose(); };
    return toy;
  }, []);
  return <main style={{ background: "#241b14", color: "#f6dfba", height: "100dvh", display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", padding: 10, gap: 8 }}>
    <header><strong>Room loading verification — development only</strong><p style={{ margin: "3px 0", fontSize: 12 }}>Real practice models. One model deliberately fails on its first load.</p></header>
    <div style={{ minHeight: 0 }}>{mounted && <LivingRoomScene actors={actors} variant="community" loadActor={loadActor} onLoadStatus={setStatus} />}</div>
    <footer style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12 }}>
      <button onClick={() => { failures.current.add("practice-3"); setRevision(n => n + 1); }}>Fail a changed robot</button>
      <button onClick={() => failures.current.clear()}>Restore missing pictures</button>
      <button onClick={() => { delayed.current = true; setRevision(n => n + 1); }}>Delay changed robots</button>
      <button onClick={() => setMounted(value => !value)}>{mounted ? "Unmount room" : "Mount room"}</button>
      <output data-room-test-report={JSON.stringify({ ...metrics, ...status, mounted })}>{status.ready} ready · {status.pending} loading · {status.failedIds.length} failed · {metrics.created} created · {metrics.disposed} disposed</output>
    </footer>
  </main>;
}
