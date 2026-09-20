"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createHomeWorld, stepHomeWorld, type HomeWorld } from "@/lib/chef/diner/home-simulation";
import { EQUIPMENT_BY_ID, RECIPE_BY_ID } from "@/lib/chef/diner/content";
import { DECOR_BY_ID } from "@/lib/chef/diner/collections";
import type { publicDiner } from "@/lib/chef/diner/social";
import type { DinerSceneData, SceneObject, ScenePerson, SceneTable } from "./scene-types";
import { DinerIcon } from "./DinerIcon";
import css from "./diner.module.css";
import styles from "./FriendsPanel.module.css";
const DinerScene = dynamic(() => import("./DinerScene"), { ssr: false });
type PublicRoom = NonNullable<ReturnType<typeof publicDiner>>;
function publicScene(room: PublicRoom, world: HomeWorld | null, selected: string | null): DinerSceneData {
  const objects: SceneObject[] = [], tables: SceneTable[] = [];
  for (const placement of room.home.layout) {
    if (placement.equipmentId.startsWith("table_")) {
      const table = world?.tables.find(item => item.id === placement.id);
      tables.push({ id: placement.id, x: placement.x, y: placement.y, rotation: placement.rotation, capacity: placement.equipmentId === "table_4" ? 4 : 2, seats: table?.seats.map(seat => ({ ...seat })) ?? [] });
    } else {
      const station = world?.stations.find(item => item.id === placement.id), slot = station?.slots.find(item => item.item);
      objects.push({ id: placement.id, kind: placement.equipmentId, x: placement.x, y: placement.y, rotation: placement.rotation, tier: room.equipment[placement.equipmentId]?.tier, color: placement.skin, food: slot?.item, state: slot?.job?.ready ? "ready" : slot?.job ? "working" : "idle", progress: slot?.job ? 1 - slot.job.remaining / Math.max(1, slot.job.total) : 0 });
    }
  }
  const people: ScenePerson[] = [
    ...(world?.actors.map((actor): ScenePerson => ({ id: actor.id, role: actor.role, x: actor.x, y: actor.y, pose: actor.pose, held: actor.held, target: actor.path[0] })) ?? []),
    ...(world?.customers.map((customer): ScenePerson => ({ id: customer.id, role: "customer", x: customer.x, y: customer.y, look: Number(customer.id.replace(/\D/g, "")) % 8, pose: customer.phase === "eating" ? "eat" : customer.phase === "seated" ? "sit" : customer.path.length ? "walk" : "idle", target: customer.path[0], tableId: customer.tableId, seatId: customer.seatId, order: customer.phase === "seated" ? { recipeId: customer.recipeId, patience: 1 } : null })) ?? []),
  ];
  return { width: room.home.w, height: room.home.h, sign: room.name, floor: room.cosmetics.floor, wall: room.cosmetics.wall, wrap: room.cosmetics.wrap, uniform: room.cosmetics.uniform, selectedId: selected, objects, tables, people, tick: world?.tick };
}
export default function PublicDinerView({ handle }: { handle: string }) {
  const [room, setRoom] = useState<PublicRoom | null>(null), [frame, setFrame] = useState<HomeWorld | null>(null), [error, setError] = useState(""), [selected, setSelected] = useState<string | null>(null), [rotation, setRotation] = useState(0);
  const world = useRef<HomeWorld | null>(null);
  useEffect(() => {
    const abort = new AbortController(); let active = true;
    void fetch(`/api/chef/diner/visit/${encodeURIComponent(handle)}`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok || !body.ok || !body.simulation) throw new Error("This diner is private or unavailable right now.");
      if (active) { setRoom(body as PublicRoom); world.current = createHomeWorld(body.simulation); setFrame({ ...world.current }); }
    }).catch(reason => { if (active && reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "This diner could not be loaded."); });
    return () => { active = false; abort.abort(); world.current = null; };
  }, [handle]);
  useEffect(() => { const timer = setInterval(() => { if (world.current && document.visibilityState === "visible") { stepHomeWorld(world.current, 1); setFrame({ ...world.current }); } }, 50); return () => clearInterval(timer); }, []);
  const scene = useMemo(() => room ? publicScene(room, frame, selected) : null, [room, frame, selected]);
  const item = room?.home.layout.find(placement => placement.id === selected), definition = item ? EQUIPMENT_BY_ID[item.equipmentId] ?? DECOR_BY_ID[item.equipmentId] : null;
  return <main className={css.game}>
    {scene && <div className={css.scene}><DinerScene mode="home" scene={scene} rotation={rotation} onTarget={id => setSelected(id)} onTile={() => setSelected(null)}/></div>}
    {!room && <div className={styles.visitError} role={error ? "alert" : "status"}><h1>{error ? "A quiet doorstep" : "Walking around the corner…"}</h1><p>{error || "Setting the tables for your visit."}</p><Link href="/chef/diner-preview" className={`${css.button} ${styles.link}`}>Back to my diner</Link></div>}
    {room && <>
      <header className={styles.visitHeader}><div className={styles.visitCard}><span className={css.eyebrow}>A neighbour&apos;s little diner</span><h1>{room.name}</h1><p>{Object.keys(room.recipes).map(id => RECIPE_BY_ID[id]?.name).filter(Boolean).join(" · ") || "The kitchen is resting."}</p><div className={styles.visitStickers}>{room.stickers.filter(sticker => sticker.count > 0).map(sticker => <span key={sticker.id}>{sticker.name} · {sticker.count}</span>)}</div></div><Link href="/chef/diner-preview" className={`${css.button} ${styles.link}`} aria-label="Return to my diner"><DinerIcon name="home"/></Link></header>
      <div className={css.sceneControls}><button className={css.iconButton} aria-label="Rotate camera left" onClick={() => setRotation(value => (value + 3) % 4)}><DinerIcon name="rotate"/></button><button className={css.iconButton} aria-label="Rotate camera right" onClick={() => setRotation(value => (value + 1) % 4)}><DinerIcon name="rotate" style={{ transform: "scaleX(-1)" }}/></button></div>
      <div className={styles.visitBottom}><div className={styles.visitCard}>{definition && item ? <><strong>{definition.name}</strong><p>{room.equipment[item.equipmentId] ? `Equipment tier ${room.equipment[item.equipmentId].tier}.` : "memento" in definition && definition.memento ? "A keepsake earned through friendship." : "A personal touch from the decor shop."}</p></> : <><strong>Take a look around.</strong><p>Drag to pan, zoom for the little details, and tap a furnishing to inspect it. Leave stickers and friendship parcels through your own Neighbours book.</p></>}</div></div>
    </>}
  </main>;
}
