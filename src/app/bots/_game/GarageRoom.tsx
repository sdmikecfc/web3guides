"use client";

import { useEffect, useMemo, useRef } from "react";
import { ToyDisplay } from "../_components/ToyDisplay";
import { engineBuild, emptySockets, nameText, type Build, type OwnedPart } from "@/lib/bots/fixtures";
import { socketsOf } from "@/lib/bots/equipment";
import type { BotView } from "../_server/types";
import type { BotLook } from "../_view/look";
import { STREET } from "../_view/setdressing";
import gallery from "../garage/garage.module.css";
import css from "./rooms.module.css";

export default function GarageRoom({ builds, parts, selectedBay, rows, sample, lookFor, onSelect, onBuild, onName, onFight, onParts, onTools, onEarn, onProgress, onExplore, nudge, onDismiss }: {
  builds: Build[]; parts: OwnedPart[]; selectedBay: number; rows: BotView[]; sample: boolean;
  lookFor: (build: Build) => BotLook;
  onSelect: (bay: number) => void; onBuild: (bay: number) => void; onName: () => void;
  onFight: () => void; onParts: () => void; onTools: () => void; onEarn: () => void; onProgress: () => void;
  onExplore?: () => void; nudge: boolean; onDismiss: () => void;
}) {
  const photos = useMemo(() => builds.map(build => ({ build, robot: engineBuild(build, parts), look: lookFor(build) })), [builds, parts, lookFor]);
  const baysRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element=baysRef.current;if(!element)return;
    const fit=()=>{const card=element.querySelector<HTMLElement>(`[data-bay="${selectedBay}"]`);if(card&&element.scrollWidth>element.clientWidth)element.scrollLeft=card.offsetLeft-element.offsetLeft-(element.clientWidth-card.offsetWidth)/2;};
    fit();const observer=new ResizeObserver(fit);observer.observe(element);return()=>observer.disconnect();
  },[selectedBay]);
  const selected = builds.find(b => b.bay === selectedBay);
  const used = new Set(builds.flatMap(b => Object.values(socketsOf(b))));
  const spareCount = parts.filter(p => !used.has(p.uid)).length;
  return <section className={css.garage} aria-label={sample ? "Sample robot collection" : "Your robot collection"}>
    <header className={css.heading}>
      <div><p className={css.eyebrow}>{sample ? "A LOOK INSIDE · SAMPLE ROBOTS" : "YOUR GARAGE · SPROCKET ROW"}</p><h1>A little place to call home.</h1><p>{sample ? "A few little characters from the workshop. Your own robots are kept separately." : "Build something odd. Make room for another friend."}</p></div>
      {onExplore && <button className={css.lightButton} onClick={onExplore}>Meet the workshop robots →</button>}
    </header>
    <div className={css.street} aria-hidden style={{ backgroundImage: `url(${STREET.file})` }}><span>SPROCKET ROW</span></div>
    <div className={`${gallery.collection} ${css.collection}`}>
      <div className={css.collectionTitle}><h2>{sample ? "Meet the workshop" : "Your little collection"}</h2><span>FIVE SPOTS. ENDLESS PERSONALITY.</span></div>
      <div ref={baysRef} className={`${gallery.gallery} ${css.gallery}`} aria-label="Robot bays">
        {[1, 2, 3, 4, 5].map(bay => {
          const photo = photos.find(p => p.build.bay === bay), row = rows.find(r => r.bay === bay);
          const missing = photo ? emptySockets(photo.build).length : 7;
          const status = sample ? photo ? "Sample build · look closer" : "Room for one more."
            : !photo ? "Build a new friend" : missing ? `${missing} ${missing === 1 ? "piece" : "pieces"} to add` : row?.inShop ? "Resting in the workshop" : row ? `${row.attacksLeft} fights left today · level ${row.level}` : "Ready for practice";
          return <button key={bay} data-bay={bay} className={css.bay} aria-pressed={bay === selectedBay} aria-label={photo && missing<7 ? `Select ${nameText(photo.build.name)}` : `Build a robot in spot ${bay}`} onClick={() => photo && missing<7 ? onSelect(bay) : onBuild(bay)}>
            <div className={`${gallery.portrait} ${css.portrait}`}>
              {photo && missing<7 ? <ToyDisplay build={photo.robot} look={photo.look} ariaLabel={nameText(photo.build.name)} /> : <div className={css.empty}><span>+</span><strong>Room for<br />one more.</strong></div>}
              <span className={css.number}>0{bay}</span>
            </div>
            <div className={css.tag}><strong className={gallery.robotName}>{photo ? nameText(photo.build.name) : `Spot ${bay}`}</strong><span>{status}</span></div>
          </button>;
        })}
      </div>
      <div className={css.selection} aria-live="polite"><div><span className={css.eyebrow}>{sample ? "ON THE STAND" : "YOUR CHOSEN ROBOT"}</span><strong>{selected ? nameText(selected.name) : "Choose a spot"}</strong></div>
        <div className={css.actions}><button className={css.lightButton} onClick={() => onBuild(selectedBay)}>{sample ? "Look closer" : "Build & change parts"}</button>{!sample && <button onClick={onName}>Name & face</button>}<button onClick={onFight}>{sample ? "Watch a sample fight" : "Take it to a fight"}</button></div>
      </div>
    </div>
    <div className={css.tools}>
      <button onClick={onParts}><span aria-hidden>✦</span><div><strong>The parts cabinet</strong><small>Today's colours. Your next favourite.</small></div><b aria-hidden>→</b></button>
      <button onClick={onTools}><span aria-hidden>⚒</span><div><strong>Your tool board</strong><small>{sample ? "Parts and ideas for every little character." : `${spareCount} spare ${spareCount === 1 ? "part" : "parts"} waiting for a home.`}</small></div><b aria-hidden>→</b></button>
      <button onClick={onProgress}><span aria-hidden>☆</span><div><strong>Little milestones</strong><small>Build, play and find something to keep.</small></div><b aria-hidden>→</b></button>
    </div>
    {nudge && !sample && <div className={css.note}><p>Something new for the shelf? <button onClick={onEarn}>See how trades earn coins.</button></p><button onClick={onDismiss} aria-label="Hide this suggestion">×</button></div>}
  </section>;
}
