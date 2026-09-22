"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import LivingRoomScene, { type LivingRoomSceneHandle, type RoomAnchor } from "../../_game/LivingRoomScene";
import { seedState } from "@/lib/bots/garage-state";
import { engineBuild, nameText } from "@/lib/bots/fixtures";
import { SHOWCASE } from "@/lib/bots/showcase";

/** Isolated visual review: fixture builds only, never reads/writes player saves. */
export default function RoomReview() {
  const [variant, setVariant] = useState<"garage" | "community">("garage");
  const [mobile, setMobile] = useState(false), [count, setCount] = useState(5), [selected, setSelected] = useState("review-1");
  const [anchors, setAnchors] = useState<RoomAnchor[]>([]);
  const sceneRef = useRef<LivingRoomSceneHandle>(null);
  const [picture, setPicture] = useState<string | null>(null);
  useEffect(() => { setPicture(null); }, [variant, mobile, count]);
  const actors = useMemo(() => {
    const sample = seedState(0), builds = Object.values(sample.builds);
    return Array.from({ length: count }, (_, i) => ({ id: `review-${i + 1}`, bay: i + 1, build: builds[i] ? engineBuild(builds[i], sample.parts) : i % 2 ? SHOWCASE.b : SHOWCASE.hammer, look: {} }));
  }, [count]);
  const names = useMemo(() => { const builds = Object.values(seedState(0).builds); return Array.from({ length: 5 }, (_, i) => builds[i] ? nameText(builds[i].name) : i % 2 ? "Rusty Beetle" : "Speedy Otter"); }, []);
  return <main style={{ background: "#241d17", minHeight: "100dvh", color: "#f3e1c3", padding: "76px 12px 12px", fontFamily: "system-ui" }}>
    <header style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
      <strong style={{ marginRight: "auto" }}>Model Kombat · Room form review</strong>
      <button onClick={() => setVariant(variant === "garage" ? "community" : "garage")} style={button}>Show {variant === "garage" ? "Community" : "Garage"}</button>
      <button onClick={() => setMobile(!mobile)} style={button}>{mobile ? "Desktop frame" : "Phone frame"}</button>
      <button onClick={() => setCount(count === 5 ? 1 : 5)} style={button}>{count === 5 ? "One robot" : "Five robots"}</button>
      <button onClick={() => setPicture(sceneRef.current?.capture() ?? null)} style={button}>Capture review image</button>
      {picture && <a href={picture} download={`model-kombat-${variant}-${mobile ? "phone" : "desktop"}-form.png`} style={{ color: "#f0cc91", padding: 8 }}>Save review image</a>}
      <Link href="/bots?tour=1" style={{ color: "#f0cc91", padding: 8 }}>Open the game</Link>
    </header>
    <section aria-label={`${variant} form preview`} style={{ width: mobile ? "min(390px,100%)" : "100%", height: mobile ? 560 : "min(78vh,760px)", minHeight: mobile ? 560 : 430, margin: "auto", position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid #7f6848" }}>
      <LivingRoomScene ref={sceneRef} actors={actors} selectedId={selected} variant={variant} onAnchors={setAnchors} />
      <h1 style={{ position: "absolute", top: 12, left: 20, fontSize: mobile ? 21 : 28, margin: 0, textShadow: "0 2px 9px #211307" }}>{variant === "garage" ? "Five stands. Your little crew." : "Meet the workshop robots."}</h1>
      {anchors.map(anchor => <button key={anchor.bay} onClick={() => setSelected(anchor.id)} aria-label={`Select ${names[anchor.bay - 1]}, stand ${anchor.bay}`} aria-pressed={selected === anchor.id}
        style={{ position: "absolute", left: anchor.x, top: anchor.y + 4, transform: "translateX(-50%)", width: anchor.width, color: "#fce9c7", background: selected === anchor.id ? "#8a6942e8" : "#352b22dc", border: "1px solid #bf9c6370", padding: 5, borderRadius: 5, fontSize: mobile ? 9 : 11, cursor: "pointer" }}>{anchor.bay <= count ? names[anchor.bay - 1] : `Empty stand ${anchor.bay}`}</button>)}
    </section>
    <p style={{ maxWidth: 920, margin: "12px auto 0", fontSize: 12, lineHeight: 1.6, color: "#c7b397" }}>Review preview · These are example robots, using real game parts at their original scale. The room uses one camera, common lighting and a physical floor. The room layout and Form direction were accepted on 10 September. Final Blender, export and runtime audits remain open; no final room assets have been exported.</p>
    {picture && <details style={{ maxWidth: 920, margin: "12px auto" }}><summary>Captured room image</summary><img src={picture} alt="Captured room review" style={{ width: "100%", height: "auto" }} /></details>}
  </main>;
}
const button = { color: "#f6e0bc", background: "#51402d", border: "1px solid #8b704b", borderRadius: 7, padding: "9px 12px", cursor: "pointer", fontSize: 12 };
