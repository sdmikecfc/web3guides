import { aggregates } from "./combat";
import { statsV5, WEAPONS_V5 } from "./v5";
import { engineBuild, type Build, type OwnedPart } from "./fixtures";
import { EQUIPMENT_SOCKETS, socketsOf } from "./equipment";
import { styleCardOf } from "./style-catalog";
import { STYLE_GUIDE } from "./style-guide";
import type { CombatBuild } from "./combat-model";
import type { LookView } from "@/app/bots/_server/types";
import { fightRoomHref } from "./fight-navigation";

export function hasStyleParts(build: Build, parts: readonly OwnedPart[]) {
  const fitted = socketsOf(build);
  return EQUIPMENT_SOCKETS.some(socket => !!styleCardOf(parts.find(p => p.uid === fitted[socket])?.id));
}
export function hasStyleBody(build: Build, parts: readonly OwnedPart[]) {
  return !!styleCardOf(parts.find(p => p.uid === socketsOf(build).torso)?.id);
}
/** A new styled body may use older spares. Empty-body drafts stay editable. */
export function styleAssemblyIssue(build: Build, parts: readonly OwnedPart[], wasStyled = false): string | null {
  const body = parts.find(p => p.uid === socketsOf(build).torso);
  return body && !styleCardOf(body.id) && (wasStyled || hasStyleParts(build, parts))
    ? "Choose a Tank, Speed or Ranged body to use these parts. You can keep the other older parts."
    : null;
}
export function buildStatsForUI(build: Build, parts: readonly OwnedPart[]) {
  const snapshot = engineBuild(build, parts);
  return hasStyleParts(build, parts) && !styleAssemblyIssue(build, parts) ? statsV5(snapshot) : aggregates(snapshot);
}
export function styleRobotPreviewHref(robot: CombatBuild, appearance: LookView, seed = 75) {
  return fightRoomHref(5, { robot: JSON.stringify(robot), appearance: JSON.stringify(appearance), seed: String(seed) });
}
export function buildCapabilities(build: Build, parts: readonly OwnedPart[]) {
  const fitted = socketsOf(build);
  const body = styleCardOf(parts.find(p => p.uid === fitted.torso)?.id);
  const weapon = styleCardOf(parts.find(p => p.uid === fitted.weapon)?.id);
  const legL = styleCardOf(parts.find(p => p.uid === fitted.legL)?.id), legR = styleCardOf(parts.find(p => p.uid === fitted.legR)?.id);
  return [
    { key: "style", label: "Body style", value: body ? STYLE_GUIDE[body.style].label : "Classic body" },
    { key: "weapon", label: "Weapon", value: weapon?.name ?? parts.find(p => p.uid === fitted.weapon)?.name ?? "Choose a weapon" },
    { key: "range", label: "Weapon range", value: weapon?.weaponKind ? `${WEAPONS_V5[weapon.weaponKind].range / 1000} m` : "Classic melee range" },
    { key: "dodge", label: "Quick dodge", value: !body ? "Needs a styled body" : legL?.style === "speed" && legR?.style === "speed" ? "Available with both Speed legs" : "Needs two Speed legs" },
    { key: "special", label: "Body special", value: body?.special?.name ?? "No body special" },
    { key: "special-effect", label: "Special effect", value: body?.special?.description ?? "No special effect" },
    { key: "special-fit", label: "Special ready", value: body ? "Ready when the special meter fills" : "Needs a styled body" },
    { key: "upgrade", label: "Tier 3 body special", value: body ? body.tier >= 3 ? "Unlocked" : `Unlocks ${styleCardOf(`mk5.t3.${body.style}.torso`)?.special?.name ?? "with a Tier 3 body"}` : "Needs a styled body" },
  ];
}
