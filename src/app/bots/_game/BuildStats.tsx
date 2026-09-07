import { PartDisplay } from "../_components/ToyDisplay";
import { aggregates } from "@/lib/bots/combat";
import { engineBuild, SLOT_STATS, type Build, type OwnedPart, type PartCard, type Socket } from "@/lib/bots/fixtures";
import { fitPart, socketsOf } from "@/lib/bots/equipment";
import type { BeginnerOffer } from "@/lib/bots/beginner-catalog";
import css from "./game.module.css";

const names: Record<string, string> = { speed: "Speed", strength: "Strength", dodge: "Dodge", damage: "Damage", block: "Block", health: "Health", luck: "Luck", accuracy: "Accuracy", attackSpeed: "Attack speed" };
const totalNames = { speed: "Speed", str: "Strength", dodge: "Dodge", dmg: "Damage", block: "Block", health: "Health", luck: "Luck", acc: "Accuracy", atkSpd: "Attack speed" };

/** A shop try-on has no ownership, currency, or saved-build side effects. */
export function previewOffer(build: Build, parts: OwnedPart[], socket: Socket, offer?: BeginnerOffer) {
  if (!offer) return { build, parts };
  const part: OwnedPart = { ...offer.part, uid: `preview:${socket}:${offer.id}`, provenance: "Preview", ...(offer.color ? { paint: offer.color } : {}) };
  return { build: fitPart(build, part, socket), parts: [...parts, part] };
}
function Delta({ value }: { value: number }) { return <em className={value > 0 ? css.statPlus : value < 0 ? css.statMinus : css.statSame} aria-label={`Change ${value > 0 ? "+" : ""}${value}`}>{value > 0 ? "+" : ""}{value}</em>; }
export function OverallStats({ build, parts, before, beforeParts, preview }: { build: Build; parts: OwnedPart[]; before: Build; beforeParts: OwnedPart[]; preview: boolean }) {
  const stats = aggregates(engineBuild(build, parts)), original = aggregates(engineBuild(before, beforeParts));
  return <aside className={css.overallStats} aria-label="Overall robot stats"><p className={css.eyebrow}>YOUR ROBOT</p><h2>Overall stats</h2><dl>{(Object.keys(totalNames) as (keyof typeof totalNames)[]).map(key => <div key={key}><dt>{totalNames[key]}</dt><dd>{stats[key]}{preview && <Delta value={stats[key] - original[key]} />}</dd></div>)}</dl><p className={css.statHint}>{preview ? "With your preview attached. Changes are compared with your saved robot." : "Your starting combat stats. Mixed arms and legs are averaged; matching sets add their bonus."}</p></aside>;
}
export function PartNumbers({ part }: { part: PartCard }) {
  return <span className={css.partNumbers}>{SLOT_STATS[part.slot].map((key, i) => <span key={key}>{names[key]} <b>{part.s[i]}</b></span>)}</span>;
}
export function PartStats({ part, before, build, socket }: { part?: OwnedPart; before: OwnedPart[]; build: Build; socket: Socket }) {
  if (!part) return <p className={css.statHint}>Choose a part to see it attached and compare its stats.</p>;
  const old = before.find(p => p.uid === socketsOf(build)[socket]);
  return <div className={css.partComparison} aria-label="Selected part stats and comparison"><div className={css.inspectedPart}><PartDisplay part={part} paint={part.paint} ariaLabel={`${part.name} preview`} /></div><div><p className={css.eyebrow}>SELECTED PART</p><h3>{part.name}</h3><dl>{SLOT_STATS[part.slot].map((key, i) => <div key={key}><dt>{names[key]}</dt><dd>{part.s[i]}<Delta value={part.s[i] - (old?.s[i] ?? 0)} /></dd></div>)}</dl><p className={css.statHint}>+ gain · − loss · 0 unchanged</p></div></div>;
}
