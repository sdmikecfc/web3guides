"use client";

import { useState } from "react";
import { AWNINGS, FLOOR_FINISHES, WALL_FINISHES } from "./_engine/building";
import { ITEMS, itemDef } from "./_engine/items";
import type { WorldState } from "./_engine/world";
import { IconWrench } from "./_ui/icons";
import styles from "./_ui/restaurant.module.css";
import editor from "./DecorEditor.module.css";

export interface DecorEditorProps {
  world: WorldState;
  theme: string;
  holdingItemId: string;
  liftUid: number;
  error: string;
  canUndo: boolean;
  canRedo: boolean;
  onDone: () => void;
  onCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPickItem: (id: string) => void;
  onRotate: () => void;
  onStore: () => void;
  onClearHold: () => void;
  onFinish: (surface: "floor" | "wall", id: string, gx?: number, gy?: number, side?: "left" | "right", index?: number) => void;
  onStorefront: (awning: string) => void;
  onTool: (tool: "furniture" | "floor" | "wall", finishId?: string) => void;
  onRoutes: (on: boolean) => void;
  onConfirm?: () => void;
  canConfirm?: boolean;
}

type Tab = "furniture" | "floor" | "wall" | "storefront";
const TABS: { id: Tab; label: string }[] = [
  { id: "furniture", label: "Furniture" }, { id: "floor", label: "Floors" },
  { id: "wall", label: "Walls" }, { id: "storefront", label: "Storefront" },
];

export default function DecorEditor(props: DecorEditorProps) {
  const { world } = props;
  const [tab, setTab] = useState<Tab>("furniture");
  const [floor, setFloor] = useState(world.design.floor);
  const [wall, setWall] = useState(world.design.wall);
  const [wallSection, setWallSection] = useState("all");
  const [routes, setRoutes] = useState(false);
  const held = itemDef(props.holdingItemId) ?? itemDef(world.layout.find((p) => p.uid === props.liftUid)?.itemId ?? "");
  const storage = ITEMS.filter((item) => (world.inventory[item.id] ?? 0) > 0);

  function changeTab(next: Tab) {
    setTab(next);
    props.onClearHold();
    props.onTool(next === "floor" || next === "wall" ? next : "furniture", next === "floor" ? floor : next === "wall" ? wall : undefined);
  }

  function applyWall() {
    if (wallSection === "all") props.onFinish("wall", wall);
    else {
      const [side, index] = wallSection.split(",");
      props.onFinish("wall", wall, undefined, undefined, side as "left" | "right", Number(index));
    }
  }

  return <>
    <div className={`${styles.editBar} ${editor.bar}`} aria-label="Decorating controls">
      <strong><IconWrench size={17} /> Decorating</strong>
      <button type="button" className={styles.secondary} disabled={!props.canUndo} onClick={props.onUndo} title="Undo last decoration">Undo</button>
      <button type="button" className={styles.secondary} disabled={!props.canRedo} onClick={props.onRedo} title="Redo decoration">Redo</button>
      <button type="button" className={styles.secondary} onClick={props.onCancel}>Cancel</button>
      <button type="button" className={`${styles.buy} ${editor.done}`} onClick={props.onDone}>Done</button>
    </div>

    <section className={`${styles.editor} ${editor.panel}`} aria-label="Restaurant decorator">
      <nav className={styles.tabs} aria-label="Decoration categories">
        {TABS.map((entry) => <button type="button" key={entry.id} aria-pressed={tab === entry.id} onClick={() => changeTab(entry.id)}>{entry.label}</button>)}
      </nav>

      {tab === "furniture" && <>
        <p>{held ? held.layer === "wall" ? `${held.label}: tap a wall to hang it.` : `${held.label}: choose a spot in your restaurant.` : "Tap a piece in your restaurant to move it, or choose from storage."}</p>
        {held && <div className={editor.selection}>
          <div className={editor.selectionCopy}>
            <strong>{held.label}</strong>
            <small>{held.layer === "wall" ? "Fits the wall automatically" : held.kind === "toilet" ? "Bathroom fixture · repair when broken" : held.kind === "chair" ? "Dining seat · place beside a table" : held.kind === "counter" ? "Serving counter · connects chefs and waiters" : held.kind === "partition" ? "Room divider · leave a clear walking route" : held.effect?.type === "production" ? "Production · supports your service" : held.effect?.type === "comfort" ? "Comfort · helps guests wait happily" : "Decoration · make it yours"}</small>
          </div>
          <div className={editor.actions}>
            {held.layer !== "wall" && <button type="button" className={styles.secondary} onClick={props.onRotate} aria-label={`Rotate ${held.label}`}>Rotate</button>}
            {props.liftUid > 0 && <button type="button" className={styles.secondary} onClick={props.onStore}>Store</button>}
            <button type="button" className={styles.secondary} onClick={props.onClearHold}>Put down</button>
          </div>
          {props.onConfirm && <button type="button" className={styles.buy} onClick={props.onConfirm} disabled={!props.canConfirm}>Place here</button>}
        </div>}
        <div className={styles.storage} aria-label="Furniture in storage">
          {storage.map((item) => <button
            type="button" key={item.id} aria-pressed={props.holdingItemId === item.id && props.liftUid < 1}
            aria-label={`Place ${item.label}, ${world.inventory[item.id]} in storage`}
            title={`${item.label} · ${item.desc}`} onClick={() => props.onPickItem(item.id)}
          >
            <img src={`/chef-art/room/${item.artSet ?? (item.collection === "essentials" ? props.theme : item.collection)}/${item.art === "wallArt" ? "wall-art" : item.art}.png`} alt="" draggable={false} />
            <span>{item.label}</span><small>× {world.inventory[item.id]}</small>
          </button>)}
          {!storage.length && <p className={editor.empty}>Your storage is empty. Move a piece from the room, or find something new in the Shop.</p>}
        </div>
      </>}

      {tab === "floor" && <>
        <p>Pick a finish, then tap individual floor tiles. Mix a kitchen floor with a cozy dining area.</p>
        <div className={`${styles.swatches} ${editor.swatches}`} aria-label="Floor finishes">
          {FLOOR_FINISHES.map((finish) => <button type="button" key={finish.id} aria-pressed={floor === finish.id} onClick={() => { setFloor(finish.id); props.onTool("floor", finish.id); }}>
            <i style={{ background: `repeating-conic-gradient(${finish.color} 0% 25%, ${finish.accent} 0% 50%) 50% / 20px 20px` }} />{finish.label}
          </button>)}
        </div>
        <button type="button" className={`${styles.secondary} ${editor.fill}`} onClick={() => props.onFinish("floor", floor)}>Use across the whole floor</button>
      </>}

      {tab === "wall" && <>
        <p>Choose a color for your walls. Use individual sections to frame a little dining nook.</p>
        <div className={`${styles.swatches} ${editor.swatches}`} aria-label="Wall finishes">
          {WALL_FINISHES.map((finish) => <button type="button" key={finish.id} aria-pressed={wall === finish.id} onClick={() => { setWall(finish.id); props.onTool("wall", finish.id); }}>
            <i style={{ background: `linear-gradient(180deg,${finish.color} 70%,${finish.accent} 70%)` }} />{finish.label}
          </button>)}
        </div>
        <div className={editor.wallControls}>
          <label htmlFor="dk-wall-section">Paint</label>
          <select id="dk-wall-section" value={wallSection} onChange={(event) => setWallSection(event.target.value)}>
            <option value="all">All walls</option>
            {(["left", "right"] as const).flatMap((side) => Array.from({ length: side === "left" ? world.grid.h : world.grid.w }, (_, index) => <option key={`${side},${index}`} value={`${side},${index}`}>{side === "left" ? "Left" : "Right"} · section {index + 1}</option>))}
          </select>
          <button type="button" className={styles.secondary} onClick={applyWall}>Apply color</button>
        </div>
      </>}

      {tab === "storefront" && <>
        <p>A warm welcome starts at the door. Choose your café awning.</p>
        <div className={`${styles.swatches} ${editor.swatches}`} aria-label="Storefront awnings">
          {AWNINGS.map((awning) => <button type="button" key={awning.id} aria-pressed={world.design.storefront.awning === awning.id} onClick={() => props.onStorefront(awning.id)}>
            <i style={{ background: `repeating-linear-gradient(90deg,${awning.color} 0px,${awning.color} 9px,${awning.accent} 9px,${awning.accent} 18px)` }} />{awning.label}
          </button>)}
        </div>
      </>}

      {props.error && <p className={styles.error} role="status">{props.error}</p>}
      <label className={editor.routes}><input type="checkbox" checked={routes} onChange={(event) => { setRoutes(event.target.checked); props.onRoutes(event.target.checked); }} /> Show walking routes</label>
    </section>
  </>;
}
