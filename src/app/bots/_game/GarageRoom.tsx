"use client";

import { useEffect, useMemo, useRef } from "react";
import { ToyDisplay } from "../_components/ToyDisplay";
import { engineBuild, emptySockets, nameText, type Build, type OwnedPart } from "@/lib/bots/fixtures";
import { socketsOf } from "@/lib/bots/equipment";
import type { BotView } from "../_server/types";
import type { BotLook } from "../_view/look";
import css from "./garage-room.module.css";

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
  const selected = photos.find(p => p.build.bay === selectedBay);
  const selectedRow = rows.find(row => row.bay === selectedBay);
  const selectedMissing = selected ? emptySockets(selected.build).length : 7;
  const hasRobot = selected && selectedMissing < 7;
  const used = new Set(builds.flatMap(b => Object.values(socketsOf(b))));
  const spareCount = parts.filter(p => !used.has(p.uid)).length;
  const occupied = photos.filter(photo => emptySockets(photo.build).length < 7).length;
  const status = sample ? "A workshop original. Take a closer look."
    : selectedMissing ? `${selectedMissing} ${selectedMissing === 1 ? "piece" : "pieces"} left to make it yours.`
    : selectedRow?.inShop ? "Resting in the workshop."
    : selectedRow ? `${selectedRow.attacksLeft} fights left today · Level ${selectedRow.level}` : "Built by you. Ready for practice.";
  return <section className={css.room} aria-label={sample ? "Sample robot collection" : "Your robot collection"}>
    <div className={css.stage}>
      <div className={css.view}>
        {hasRobot ? <ToyDisplay build={selected.robot} look={selected.look} variant="workbench" mode="interactive" ariaLabel={nameText(selected.build.name)} />
          : <div className={css.emptyStand}><span aria-hidden>＋</span><strong>A little room for possibility.</strong><button onClick={() => onBuild(selectedBay)}>Build your robot</button></div>}
      </div>
      <header className={css.heading}>
        <p className={css.eyebrow}>{sample ? "SPROCKET ROW · SAMPLE GARAGE" : "SPROCKET ROW · YOUR GARAGE"}</p>
        <h1>Home, sweet workshop.</h1>
        <p className={css.intro}>A little place for big personalities.</p>
      </header>
      <aside className={css.buildCard} aria-label="Selected robot" aria-live="polite">
        <div className={css.clip} aria-hidden />
        <p className={css.cardEyebrow}>ON THE STAND <span>NO. 0{selectedBay}</span></p>
        <h2>{hasRobot ? nameText(selected.build.name) : "Your next robot"}</h2>
        <p className={css.buildStatus}>{hasRobot ? status : "An empty spot, waiting for your imagination."}</p>
        <div className={css.actions}>
          <button className={css.primary} onClick={() => onBuild(selectedBay)}>{sample ? "Look closer" : hasRobot ? "Build & change parts" : "Start building"}<span aria-hidden>→</span></button>
          {hasRobot && <button className={css.secondary} onClick={onFight}>{sample ? "Watch a sample fight" : "Take it to a fight"}<span aria-hidden>↗</span></button>}
        </div>
        {!sample && hasRobot && <button className={css.nameButton} onClick={onName}>Name & face</button>}
        {sample && <p className={css.sampleNote}>Your own robots are kept separately.</p>}
      </aside>
      <div className={css.roomTools} aria-label="Workshop shortcuts">
        <button onClick={onParts}><span aria-hidden>✦</span><span>Parts cabinet</span></button>
        <button onClick={onTools}><span aria-hidden>⚒</span><span>Tool board<small>{sample ? "Parts & ideas" : `${spareCount} spare ${spareCount === 1 ? "part" : "parts"}`}</small></span></button>
        <button onClick={onProgress}><span aria-hidden>☆</span><span>Milestones</span></button>
      </div>
    </div>
    <section className={css.shelf} aria-label="Robot bays">
      <div className={css.shelfHeading}><p><strong>{sample ? "Meet the workshop" : "Your collection"}</strong><span>{occupied} of 5 spots filled</span></p>{onExplore && <button onClick={onExplore}>Meet the workshop robots <span aria-hidden>→</span></button>}</div>
      <div ref={baysRef} className={css.bays}>
        {[1, 2, 3, 4, 5].map(bay => {
          const photo = photos.find(p => p.build.bay === bay);
          const missing = photo ? emptySockets(photo.build).length : 7;
          const occupiedBay = photo && missing < 7;
          return <button key={bay} data-bay={bay} className={css.bay} aria-pressed={bay === selectedBay} aria-label={occupiedBay ? `Select ${nameText(photo.build.name)}` : `Build a robot in spot ${bay}`} onClick={() => occupiedBay ? onSelect(bay) : onBuild(bay)}>
            <span className={css.portrait}>{occupiedBay ? <ToyDisplay build={photo.robot} look={photo.look} variant="cutout" ariaLabel={nameText(photo.build.name)} /> : <span className={css.add} aria-hidden>＋</span>}</span>
            <span className={css.bayCopy}><small>SPOT 0{bay}{bay === selectedBay ? " · ON THE STAND" : ""}</small><strong>{occupiedBay ? nameText(photo.build.name) : "Room for one more"}</strong><span>{occupiedBay ? sample ? "Sample robot" : missing ? `${missing} ${missing === 1 ? "piece" : "pieces"} to add` : "Made by you" : "Make something new"}</span></span>
          </button>;
        })}
      </div>
      {nudge && !sample && <div className={css.note}><button onClick={onEarn}>Something new for the shelf? See how to earn coins.</button><button onClick={onDismiss} aria-label="Hide this suggestion">×</button></div>}
    </section>
  </section>;
}
