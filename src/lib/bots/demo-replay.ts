import { CARD_BY_ID, nameText, type Build, type OwnedPart } from "./fixtures";
import { gameCard } from "./beginner-catalog";
import { EQUIPMENT_KIND, EQUIPMENT_SOCKETS, socketUid } from "./equipment";
import { modularBuild, combatPart, combatPaints, type CombatBuild } from "./combat-model";
import { isPaintId, NO_ORDERS, type Orders } from "@/app/bots/_engine/parts";
import type { Part } from "@/app/bots/_engine/parts";
import { NO_LOOK, NO_MARKS, findsOf, normalizeLook, toHatWon, type BotLookRaw } from "./look";
import type { LookView } from "@/app/bots/_server/types";

/** Every public practice link carries the orders which produced that fight. */
export function demoReplayLink(seed: number, subject: { robot?: string; showcase?: boolean; loadout?: "hammer"; a?: string; b?: string }, orders: readonly [Orders, Orders] = [NO_ORDERS, NO_ORDERS]): string {
  const fighters: Record<string, string> = subject.robot ? { robot: subject.robot }
    : subject.showcase ? { showcase: "1", ...(subject.loadout ? {loadout:subject.loadout} : {}) } : { a: subject.a ?? "T2", b: subject.b ?? "T2" };
  const q = new URLSearchParams({seed:String(seed >>> 0), ...fighters,
    stanceA:String(orders[0].stance),stanceB:String(orders[1].stance),
    focusA:String(orders[0].focus),focusB:String(orders[1].focus)});
  return `/bots/fight/demo?${q}`;
}

/** The house side keeps the same build-colour fallback as an ordinary demo. */
export function plainPracticeLook(build: CombatBuild): LookView {
  return { paints: combatPaints(build), look: { ...NO_LOOK }, marks: { ...NO_MARKS }, wins: 0 };
}

function capturedLook(build: CombatBuild, raw: unknown): LookView {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as BotLookRaw & { plateNumber?: unknown }
    : {};
  const paints = combatPaints(build);
  const hatRaw = value.hat;
  const hat = hatRaw && typeof hatRaw === "object" && "color" in hatRaw &&
    hatRaw.color != null && !isPaintId(hatRaw.color) ? null : toHatWon(hatRaw);
  const plateNumber = typeof value.plateNumber === "number" && Number.isInteger(value.plateNumber) &&
    value.plateNumber >= 1 && value.plateNumber <= 99 ? value.plateNumber : null;
  const earned = findsOf({
    wins: 0, losses: 0, level: 1, champion: false, bodyCount: 6,
    bodyPaints: EQUIPMENT_SOCKETS.filter(s => s !== "weapon").map(s => paints[s]).filter(isPaintId),
    partStars: EQUIPMENT_SOCKETS.map(s => gameCard(combatPart(build,s).id)?.tier ?? 0),
    // A known hat in this unsigned practice picture is decoration only. It
    // never enters inventory, grants or earned marks on a player's account.
    hats: hat ? [hat] : [], plateNumber,
  });
  return { paints, look: normalizeLook({ ...value, hat }, earned), marks: { ...NO_MARKS }, wins: 0 };
}

/** A practice replay carries its seven catalog pieces in the link. Editing
 * the garage later cannot change the fight somebody else watches. */
export function practiceLink(build: Build, parts: readonly OwnedPart[], seed = 7): string {
  const pieces = EQUIPMENT_SOCKETS.map(s => {
    const p = parts.find(p => p.uid === socketUid(build,s));
    if (!p) throw new Error("Add every part before a practice fight.");
    return [p.id,p.paint ?? null];
  });
  const chosen = build.look;
  const look = {
    face: chosen?.face ?? "calm", sticker: chosen ? chosen.sticker : build.decal,
    spot: chosen?.spot ?? "chest", stickerPaint: chosen?.stickerPaint ?? null,
    hat: toHatWon(chosen?.hat), plateNumber: chosen?.plateNumber ?? build.name.num,
  };
  const q = new URLSearchParams({seed:String(seed >>> 0),robot:JSON.stringify({name:nameText(build.name),pieces,look})});
  return `/bots/fight/demo?${q}`;
}

export function readPracticeRobot(raw: string): {name:string;build:CombatBuild;look:LookView} | null {
  if (raw.length > 4096) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.name !== "string" || value.name.length > 60 || !Array.isArray(value.pieces) || value.pieces.length !== 7) return null;
    const parts: Part[] = value.pieces.map((p:unknown,i:number) => {
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "string") throw new Error("part");
      const card = gameCard(p[0]);
      if (!card || card.slot !== EQUIPMENT_KIND[EQUIPMENT_SOCKETS[i]]) throw new Error("slot");
      if (p[1] !== null && !isPaintId(p[1])) throw new Error("colour");
      return {id:card.id,s:[...card.s],...(card.slot !== "weapon" && isPaintId(p[1]) ? {paint:p[1]} : {})};
    });
    const build = modularBuild(parts[0],parts[1],parts[2],parts[3],parts[4],parts[5],parts[6]);
    return {name:value.name,build,look:capturedLook(build,value.look)};
  } catch { return null; }
}
