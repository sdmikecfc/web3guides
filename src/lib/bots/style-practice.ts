import { cardV5, presetV5, snapshotBuildV5, type BuildV5, type StyleV5 } from './v5';
import type { CombatBuild } from './combat-model';
import type { Tier } from '@/app/bots/_engine/parts';

export interface StylePracticeQuery { style?: string; rival?: string; tier?: string; part?: string; robot?: string; appearance?: string; seed?: string; session?: string; botId?: string; difficulty?: string }
export function practiceBuildV5(q: StylePracticeQuery): BuildV5 {
  if (q.robot) {
    if (q.robot.length > 8192) throw new Error('This robot link is too long. Open the fight from your garage.');
    return snapshotBuildV5(JSON.parse(q.robot) as CombatBuild);
  }
  const style: StyleV5 = q.style === 'tank' || q.style === 'speed' || q.style === 'ranged' ? q.style : 'ranged';
  const tier = Math.max(1, Math.min(4, Number(q.tier) || 1)) as Tier;
  const build = presetV5(style, tier);
  if (!q.part) return build;
  const c = cardV5(q.part); if (!c) throw new Error('This part is not available in this practice room.');
  const b = build.appearanceBuild, p = { id: c.id, s: [...c.s] as typeof c.s };
  if (c.slot === 'arms') { b.arms = p; b.limbs!.armR = p; b.limbs!.armL = { ...p, s: [...p.s] }; }
  else if (c.slot === 'legs') { b.legs = p; b.limbs!.legR = p; b.limbs!.legL = { ...p, s: [...p.s] }; }
  else b[c.slot] = p;
  return snapshotBuildV5(b);
}
