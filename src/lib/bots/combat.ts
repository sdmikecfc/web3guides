import * as legacy from "@/app/bots/_engine/resolve";
import * as modular from "@/app/bots/_combat/resolve";
import { aggregates as oldAggregates } from "@/app/bots/_engine/derive";
import { aggregates as newAggregates } from "@/app/bots/_combat/derive";
import type { CombatBuild } from "./combat-model";
import { NO_ORDERS, type Mode, type Orders } from "@/app/bots/_engine/parts";
export type Fight = legacy.Fight;
export const combatVersion = (a: CombatBuild, b: CombatBuild) => a.limbs || b.limbs ? 3 : 2;
export function createFight(seed: number, a: CombatBuild, b: CombatBuild, oa: Orders = NO_ORDERS, ob: Orders = NO_ORDERS, mode: Mode = "spar"): Fight {
  return combatVersion(a,b) === 3 ? modular.createFight(seed,a,b,oa,ob,mode) : legacy.createFight(seed,a,b,oa,ob,mode);
}
export function stepFight(fight: Fight) { if (fight.st.v === 3) modular.stepFight(fight as modular.Fight); else legacy.stepFight(fight); }
export function resultOf(fight: Fight) { return fight.st.v === 3 ? modular.resultOf(fight as modular.Fight) : legacy.resultOf(fight); }
export function runFight(seed: number, a: CombatBuild, b: CombatBuild, oa: Orders = NO_ORDERS, ob: Orders = NO_ORDERS, mode: Mode = "spar"): Fight {
  const f=createFight(seed,a,b,oa,ob,mode); while (!f.st.done) stepFight(f); return f;
}
export function resolveFight(seed: number, a: CombatBuild, b: CombatBuild, oa: Orders = NO_ORDERS, ob: Orders = NO_ORDERS, mode: Mode = "spar") { return resultOf(runFight(seed,a,b,oa,ob,mode)); }
export function aggregates(b: CombatBuild, o: Orders = NO_ORDERS) { return b.limbs ? newAggregates(b,o) : oldAggregates(b,o); }
