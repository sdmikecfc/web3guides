import type { Build } from "@/app/bots/_engine/parts";
import type { BattlesView, FightSummary, LookView } from "@/app/bots/_server/types";
import { plainPracticeLook } from "./demo-replay";
import { SHOWCASE } from "./showcase";

export interface CommunityVisitor {
  id: string; bay: number; name: string; label: "Just fought" | "Recent visitor" | "Practice robot" | "Workshop helper";
  build: Build; look: LookView; paint: FightSummary["paints"][number]; fightId: string | null;
}
type SavedFight = FightSummary & { builds?: [Build, Build] };
/** Cached summaries may not have geometry yet. Never put a replacement model
 * under a real player's name. Its actual replay remains available in the list. */
function hasSnapshots(fight: FightSummary | null | undefined): fight is SavedFight & { builds: [Build, Build] } {
  const pair = (fight as SavedFight | undefined)?.builds;
  return Array.isArray(pair) && pair.length === 2 && pair.every(build => build && (["head", "torso", "arms", "legs", "weapon"] as const).every(slot => {
    const part = build[slot];
    return part && typeof part.id === "string" && Array.isArray(part.s) && part.s.length === 3 && part.s.every(Number.isFinite);
  }));
}
function practice(bay: number, name: string, build: Build, helper = false): CommunityVisitor {
  return { id: `practice-${bay}`, bay, name, label: helper ? "Workshop helper" : "Practice robot", build, look: plainPracticeLook(build), paint: "mint", fightId: null };
}
function fighters(fight: SavedFight & { builds: [Build, Build] }, firstBay: number, label: CommunityVisitor["label"]): CommunityVisitor[] {
  return ([0, 1] as const).map(side => ({ id: `${fight.id}:${side}`, bay: firstBay + side, name: fight.names[side], label,
    build: fight.builds[side], look: fight.looks[side] ?? plainPracticeLook(fight.builds[side]), paint: fight.paints[side], fightId: fight.id }));
}
/** Five honest occupants: a recorded pair, two visitors, and the house helper. */
export function communityVisitors(battles: BattlesView | null) {
  const candidates = [battles?.featured.upset, battles?.featured.fastestKo, ...(battles?.recent ?? [])];
  const featured = candidates.find(hasSnapshots) ?? null;
  const other = (battles?.recent ?? []).find(fight => fight.id !== featured?.id && hasSnapshots(fight));
  const visitors = featured ? fighters(featured, 1, "Just fought") : [practice(1, SHOWCASE.names[0], SHOWCASE.a), practice(2, SHOWCASE.names[1], SHOWCASE.b)];
  visitors.push(...(other && hasSnapshots(other) ? fighters(other, 3, "Recent visitor") : [practice(3, "Hammer tester", SHOWCASE.hammer), practice(4, "Parts tester", SHOWCASE.a)]));
  visitors.push(practice(5, "Wrench", SHOWCASE.b, true));
  return { featured, visitors };
}
