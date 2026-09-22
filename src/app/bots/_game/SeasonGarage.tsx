"use client";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { BuildV6 } from "@/lib/bots/v6";
import type { SeasonBot } from "@/lib/bots/season/types";
import { createSeasonGarageToy, seasonGarageBounds } from "../_view/season-garage";
import type { RoomActorLoader, RoomDisplayToy } from "../_view/living-room";
import LivingRoomScene, { type RoomAnchor } from "./LivingRoomScene";
import css from "./season-garage.module.css";

export type SeasonGarageLoader = (build: BuildV6, id: string) => Promise<RoomDisplayToy>;
const defaultLoader: SeasonGarageLoader = build => createSeasonGarageToy(build);
const framing = { desktopWidth: 23, desktopMinHeight: 7, desktopTargetY: 1.7 };

/** Same approved room and five trolleys, occupied by exact saved seasonal builds. */
export default function SeasonGarage({ robots, selectedId, active = true, busy = false, onSelect, onBuild, clipboard, loadModel = defaultLoader }: { robots: SeasonBot[]; selectedId?: string; active?: boolean; busy?: boolean; onSelect(id: string): void; onBuild(): void; clipboard?: ReactNode; loadModel?: SeasonGarageLoader }) {
  const host = useRef<HTMLDivElement>(null), builds = useRef(new Map<string, BuildV6>()), models = useRef(new Map<string, RoomDisplayToy>());
  builds.current = new Map(robots.slice(0, 5).map(robot => [robot.id, robot.build]));
  const [anchors, setAnchors] = useState<RoomAnchor[]>([]);
  const details = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null);
  const openClipboard = () => { opener.current = document.activeElement as HTMLElement; details.current?.showModal(); };
  const actors = useMemo(() => robots.slice(0, 5).map((robot, index) => ({ id: robot.id, bay: index + 1, build: robot.build.appearanceBuild, look: {}, version: [robot.build.rulesVersion, robot.build.assetVersion, robot.build.collisionVersion] })), [robots]);
  const loader = useCallback<RoomActorLoader>(async definition => {
    const build = builds.current.get(definition.id); if (!build) throw new Error("This robot is no longer on this stand.");
    const model = await loadModel(build, definition.id), dispose = model.dispose;
    models.current.set(definition.id, model);
    model.dispose = () => { if (models.current.get(definition.id) === model) models.current.delete(definition.id); dispose(); };
    return model;
  }, [loadModel]);
  const diagnostics = useCallback(() => {
    if (host.current) host.current.dataset.seasonModels = JSON.stringify(Array.from(models.current, ([id, model]) => ({ id, ...seasonGarageBounds(model), parts: Object.fromEntries(Object.entries(builds.current.get(id)?.parts ?? {}).map(([slot, part]) => [slot, part.id])) })));
  }, []);
  const projected = useCallback((next: RoomAnchor[]) => { setAnchors(next); diagnostics(); }, [diagnostics]);
  const nextBay = Math.min(5, robots.length + 1);
  return <div ref={host} className={css.garage} aria-label="Five season robot stands">
    <div className={css.scene}>{active && <LivingRoomScene actors={actors} selectedId={selectedId} onAnchors={projected} onReady={diagnostics} loadActor={loader} framing={framing} />}</div>
    <div className={css.labels}>{[1, 2, 3, 4, 5].map(bay => {
      const robot = robots[bay - 1], anchor = anchors.find(a => a.bay === bay), suggested = !robot && bay === nextBay;
      return <button key={bay} className={css.stand} aria-label={robot ? `Select ${robot.name}, stand ${bay} of 5` : `Build a robot on empty stand ${bay} of 5`} aria-pressed={!!robot && selectedId === robot.id} disabled={busy}
        style={anchor ? { left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height } : { left: `${10 + (bay - 1) * 20}%`, top: "72%", width: "18%", height: "50%" }}
        onClick={() => { if (robot) { onSelect(robot.id); if (clipboard) openClipboard(); } else onBuild(); }}>
        {!robot && <span className={css.invitation}><b>{suggested ? robots.length ? "Build another robot" : "Build your first robot" : "Empty stand"}</b><span aria-hidden>{suggested ? "↓" : "+"}</span></span>}
        <span className={css.name}><strong>{robot?.name ?? `Stand ${bay}`}</strong><small>{robot ? `${robot.gp} GP · ${robot.ready ? "Ready" : "Repairing"}` : "Room for a new robot"}</small></span>
      </button>;
    })}</div>
    <p className={css.note}>{robots.length}/5 robots · Finished robots keep their parts.</p>
    {clipboard && <><button className={css.clipboardButton} onClick={openClipboard}>{robots.find(robot => robot.id === selectedId)?.name ?? "Robot details"}<span>Open clipboard →</span></button><dialog ref={details} className={css.clipboard} aria-label="Your selected robot" onClose={() => opener.current?.focus()} onClick={e => { if (e.target === e.currentTarget) details.current?.close(); }}><button className={css.close} autoFocus aria-label="Close robot clipboard" onClick={() => details.current?.close()}>×</button>{clipboard}</dialog></>}
  </div>;
}
