"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ToyDisplay } from "../_components/ToyDisplay";
import { engineBuild, emptySockets, nameText, recycleValue, type Build, type OwnedPart } from "@/lib/bots/fixtures";
import { socketsOf } from "@/lib/bots/equipment";
import type { Build as EngineBuild } from "../_engine/parts";
import type { BotView } from "../_server/types";
import type { BotLook } from "../_view/look";
import css from "./garage-room.module.css";

const BAYS = [1, 2, 3, 4, 5] as const;
const EMPTY_TOY: EngineBuild = {
  head: { id: "empty.head", s: [0, 0, 0] }, torso: { id: "empty.torso", s: [0, 0, 0] },
  arms: { id: "empty.arms", s: [0, 0, 0] }, legs: { id: "empty.legs", s: [0, 0, 0] }, weapon: { id: "empty.weapon", s: [0, 0, 0] },
};

export default function GarageRoom({ builds, parts, selectedBay, rows, sample, lookFor, onSelect, onBuild, onName, onFight, onParts, onTools, onEarn, onProgress, onExplore, nudge, onDismiss, onRecycle, busy = false }: {
  builds: Build[]; parts: OwnedPart[]; selectedBay: number; rows: BotView[]; sample: boolean;
  lookFor: (build: Build) => BotLook;
  onSelect: (bay: number) => void; onBuild: (bay: number) => void; onName: () => void;
  onFight: () => void; onParts: () => void; onTools: () => void; onEarn: () => void; onProgress: () => void;
  onExplore?: () => void; nudge: boolean; onDismiss: () => void;
  onRecycle?: (bay: number) => Promise<boolean>; busy?: boolean;
}) {
  const photos = useMemo(() => builds.map(build => ({ build, robot: engineBuild(build, parts), look: lookFor(build) })), [builds, parts, lookFor]);
  const selected = photos.find(p => p.build.bay === selectedBay);
  const selectedRow = rows.find(row => row.bay === selectedBay);
  const selectedMissing = selected ? emptySockets(selected.build).length : 7;
  const hasRobot = !!selected && selectedMissing < 7;
  const complete = hasRobot && selectedMissing === 0;
  const used = new Set(builds.flatMap(b => Object.values(socketsOf(b))));
  const spareCount = parts.filter(p => !used.has(p.uid)).length;
  const occupied = photos.filter(photo => emptySockets(photo.build).length < 7).length;
  const nextBay = BAYS.find(bay => !photos.some(p => p.build.bay === bay && emptySockets(p.build).length < 7));
  const equipped = new Set(selected ? Object.values(socketsOf(selected.build)) : []);
  const refund = parts.filter(p => equipped.has(p.uid)).reduce((sum, part) => sum + recycleValue(part), 0);
  const [recycleBusy, setRecycleBusy] = useState(false);
  const [recycleError, setRecycleError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.close(); setRecycleError(""); }, [selectedBay]);
  const status = sample ? "A workshop original. Take a closer look."
    : selectedMissing ? `${selectedMissing} ${selectedMissing === 1 ? "piece" : "pieces"} left to make it yours.`
    : selectedRow?.inShop ? "Resting in the workshop."
    : selectedRow ? `${selectedRow.attacksLeft} fights left today · Level ${selectedRow.level}` : "Built by you. Ready for practice.";
  const openRecycle = () => { setRecycleError(""); dialog.current?.showModal(); };
  const confirmRecycle = async () => {
    if (!onRecycle || busy || recycleBusy) return;
    setRecycleBusy(true); setRecycleError("");
    try { if (await onRecycle(selectedBay)) dialog.current?.close(); else setRecycleError("Your robot has not been recycled. Please try again."); }
    catch { setRecycleError("Your robot has not been recycled. Please try again."); }
    finally { setRecycleBusy(false); }
  };

  return <section className={css.room} aria-label={sample ? "Sample robot collection" : "Your robot collection"}>
    <div className={css.stage}>
      <header className={css.heading}>
        <p className={css.eyebrow}>{sample ? "SAMPLE GARAGE · MAX 5 ROBOTS" : "YOUR GARAGE · MAX 5 ROBOTS"}</p>
        <h1>Five stands. Your little crew.</h1>
        <p className={css.intro}>{occupied} of 5 robots · {nextBay ? "There is room for another personality." : "Your garage is full. Recycle a robot to make room."}</p>
      </header>
      <div className={css.standRow} aria-label="All five robot stands">
        {BAYS.map(bay => {
          const photo = photos.find(p => p.build.bay === bay), missing = photo ? emptySockets(photo.build).length : 7;
          const filled = !!photo && missing < 7, chosen = selectedBay === bay, suggested = !filled && nextBay === bay;
          return <button key={bay} className={css.stand} data-empty={!filled} data-suggested={suggested} aria-pressed={chosen}
            disabled={busy || recycleBusy}
            aria-label={filled ? `Select ${nameText(photo.build.name)}, stand ${bay} of 5` : `Build a robot on empty stand ${bay} of 5`}
            onClick={() => filled ? onSelect(bay) : onBuild(bay)}>
            <span className={css.standNumber}>0{bay}</span>
            <span className={css.standToy}><ToyDisplay build={filled ? photo.robot : EMPTY_TOY} look={filled ? photo.look : undefined} variant="bay" ariaLabel={filled ? nameText(photo.build.name) : `Empty stand ${bay}`} /></span>
            {!filled && <span className={css.emptyInvitation}>{suggested ? <><b>{occupied ? "Build another bot" : "Build your first bot"}</b><span className={css.pointer} aria-hidden>↓</span></> : <><b>Empty stand</b><span aria-hidden>＋</span></>}</span>}
            <span className={css.standPlate}><strong>{filled ? nameText(photo.build.name) : `Stand ${bay}`}</strong><small>{filled ? missing ? `${missing} parts to add` : chosen ? "Selected robot" : "Ready to choose" : "Room for a new robot"}</small></span>
          </button>;
        })}
      </div>

      <aside className={css.buildCard} aria-label="Selected robot" aria-live="polite">
        <div className={css.clip} aria-hidden />
        <p className={css.cardEyebrow}>{complete ? "BUILT TO STAY" : "ON THE STAND"} <span>NO. 0{selectedBay}</span></p>
        <h2>{hasRobot && selected ? nameText(selected.build.name) : "Your next robot"}</h2>
        <p className={css.buildStatus}>{hasRobot ? status : "An empty spot, waiting for your imagination."}</p>
        <div className={css.actions}>
          <button className={css.primary} disabled={busy || recycleBusy} onClick={() => complete && !sample ? onName() : onBuild(selectedBay)}>{sample ? "Look closer" : complete ? "Name & face" : hasRobot ? "Continue building" : "Start building"}<span aria-hidden>→</span></button>
          {complete && <button className={css.secondary} disabled={busy || recycleBusy} onClick={onFight}>{sample ? "Watch a sample fight" : "Take it to a fight"}<span aria-hidden>↗</span></button>}
        </div>
        {!sample && complete && <p className={css.permanentNote}>Parts stay with a finished robot. Build another to try a new combination.</p>}
        {!sample && hasRobot && onRecycle && <button className={css.recycleButton} disabled={busy || recycleBusy} onClick={openRecycle}>Recycle robot <span>+{refund} coins</span></button>}
        {sample && <p className={css.sampleNote}>Your own robots are kept separately.</p>}
      </aside>
      <div className={css.roomTools} aria-label="Workshop shortcuts">
        <button onClick={onParts}><span aria-hidden>✦</span><span>Parts cabinet</span></button>
        <button onClick={onTools}><span aria-hidden>⚒</span><span>Tool board<small>{sample ? "Parts & ideas" : `${spareCount} spare ${spareCount === 1 ? "part" : "parts"}`}</small></span></button>
        <button onClick={onProgress}><span aria-hidden>☆</span><span>Milestones</span></button>
      </div>
    </div>
    <footer className={css.garageFoot}>
      <p><strong>{occupied} / 5 robots</strong><span>Five is the maximum. Finished parts are permanent.</span></p>
      {nextBay ? <button className={css.another} disabled={busy || recycleBusy} onClick={() => onBuild(nextBay)}>{occupied ? "Build another bot" : "Build your first bot"}<span aria-hidden>→</span></button> : <span className={css.fullGarage}>Recycle a robot to free a stand.</span>}
      {onExplore && <button className={css.explore} onClick={onExplore}>Meet the workshop robots</button>}
      {nudge && !sample && <div className={css.note}><button onClick={onEarn}>How to earn coins</button><button onClick={onDismiss} aria-label="Hide this suggestion">×</button></div>}
    </footer>
    <dialog ref={dialog} className={css.recycleDialog} aria-labelledby="recycle-robot-title" onCancel={e => { if (recycleBusy) e.preventDefault(); }}>
      <p className={css.cardEyebrow}>MAKE ROOM FOR ANOTHER ROBOT</p>
      <h2 id="recycle-robot-title">Recycle {selected ? nameText(selected.build.name) : "this robot"}?</h2>
      <p>This permanently removes the robot and its fitted parts, and opens stand {selectedBay} for a new build.</p>
      <div className={css.refund}><strong>+{refund} coins</strong><span>40% of the parts' list value.<br />Free starter parts return 0 coins.</span></div>
      <div className={css.actions}><button className={css.primary} disabled={busy || recycleBusy} onClick={() => dialog.current?.close()}>Keep my robot</button><button className={css.secondary} disabled={busy || recycleBusy} onClick={() => void confirmRecycle()}>{recycleBusy ? "Recycling…" : `Recycle for ${refund} coins`}</button></div>
      {recycleError && <p role="alert">{recycleError}</p>}
    </dialog>
  </section>;
}
