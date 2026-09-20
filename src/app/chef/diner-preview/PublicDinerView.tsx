"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createHomeWorld, stepHomeWorld, type HomeWorld } from "@/lib/chef/diner/home-simulation";
import { EQUIPMENT_BY_ID, RECIPE_BY_ID } from "@/lib/chef/diner/content";
import { DECOR_BY_ID } from "@/lib/chef/diner/collections";
import { ROOM_FIXTURES } from "@/lib/chef/diner/room-plan";
import type { publicDiner } from "@/lib/chef/diner/social";
import { physicalHomeScene } from "./physical-home-scene";
import { DinerIcon } from "./DinerIcon";
import css from "./diner.module.css";
import styles from "./FriendsPanel.module.css";
const DinerScene = dynamic(() => import("./DinerScene"), { ssr: false });
type PublicRoom = NonNullable<ReturnType<typeof publicDiner>>;
export default function PublicDinerView({ handle }: { handle: string }) {
  const [room, setRoom] = useState<PublicRoom | null>(null), [frame, setFrame] = useState<HomeWorld | null>(null), [error, setError] = useState(""), [selected, setSelected] = useState<string | null>(null), [rotation, setRotation] = useState(0);
  const world = useRef<HomeWorld | null>(null);
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    setRoom(null);setFrame(null);setError("");setSelected(null);world.current=null;
    void fetch(`/api/chef/diner/visit/${encodeURIComponent(handle)}`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok || !body.ok || !body.simulation) throw new Error("This diner is private or unavailable right now.");
      if (active) { setRoom(body as PublicRoom); world.current = createHomeWorld(body.simulation); setFrame({ ...world.current }); }
    }).catch(reason => { if (active && reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "This diner could not be loaded."); });
    return () => { active = false; abort.abort(); world.current = null; };
  }, [handle]);
  useEffect(() => { const timer = setInterval(() => { if (world.current && document.visibilityState === "visible") { stepHomeWorld(world.current, 1); setFrame({ ...world.current }); } }, 50); return () => clearInterval(timer); }, []);
  const scene = useMemo(() => room ? physicalHomeScene(room, frame, selected) : null, [room, frame, selected]);
  const item = room?.home.layout.find(placement => placement.id === selected), definition = item ? EQUIPMENT_BY_ID[item.equipmentId] ?? DECOR_BY_ID[item.equipmentId] : null;
  const roomModule=room?.home.roomPlan?.modules.find(module=>module.id===selected),fixture=roomModule?ROOM_FIXTURES[roomModule.kind]:null;
  return <main className={css.game}>
    {scene && <div className={css.scene}><DinerScene mode="home" scene={scene} rotation={rotation} onTarget={id => setSelected(id)} onTile={() => setSelected(null)} showWorldHints={false}/></div>}
    {!room && <div className={styles.visitError} role={error ? "alert" : "status"}><h1>{error ? "A quiet doorstep" : "Walking around the corner…"}</h1><p>{error || "Setting the tables for your visit."}</p><Link href="/chef/diner-preview" className={`${css.button} ${styles.link}`}>Back to my diner</Link></div>}
    {room && <>
      <header className={styles.visitHeader}><div className={styles.visitCard}><span className={css.eyebrow}>A neighbour&apos;s little diner</span><h1>{room.name}</h1><p>{Object.keys(room.recipes).map(id => RECIPE_BY_ID[id]?.name).filter(Boolean).join(" · ") || "The kitchen is resting."}</p><div className={styles.visitStickers}>{room.stickers.filter(sticker => sticker.count > 0).map(sticker => <span key={sticker.id}>{sticker.name} · {sticker.count}</span>)}</div></div><Link href="/chef/diner-preview" className={`${css.button} ${styles.link}`} aria-label="Return to my diner"><DinerIcon name="home"/></Link></header>
      <div className={css.sceneControls}><button className={css.iconButton} aria-label="Rotate camera left" onClick={() => setRotation(value => (value + 3) % 4)}><DinerIcon name="rotate"/></button><button className={css.iconButton} aria-label="Rotate camera right" onClick={() => setRotation(value => (value + 1) % 4)}><DinerIcon name="rotate" style={{ transform: "scaleX(-1)" }}/></button></div>
      <div className={styles.visitBottom}><div className={styles.visitCard}>{definition && item ? <><strong>{definition.name}</strong><p>{room.equipment[item.equipmentId] ? `Equipment tier ${room.equipment[item.equipmentId].tier}.` : "memento" in definition && definition.memento ? "A keepsake earned through friendship." : "A personal touch from the decor shop."}</p></> : fixture ? <><strong>{fixture.name}</strong><p>Part of this restaurant&apos;s own room layout.</p></> : <><strong>Take a look around.</strong><p>Drag to pan, zoom for the little details, and tap a furnishing to inspect it. Leave stickers and friendship parcels through your own Neighbours book.</p></>}</div></div>
    </>}
  </main>;
}
