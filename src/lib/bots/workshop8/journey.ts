import { ENTRY_MAP, ITEM_MAP, SLOTS, SLOT_NAMES, aggregateEquipment, itemId, legalChoices, type Choices, type Slot } from './catalogue';
import type { Draft8, Fight8, Robot8, Workshop8 } from './state';

export const MILESTONES = {
  ring_ready: { title: 'Ring Ready', emblem: 'spark', explanation: 'Completed your first training fight.' },
  first_victory: { title: 'First Victory', emblem: 'star', explanation: 'Won a house fight.' },
  last_arm: { title: 'Last Arm Standing', emblem: 'shield', explanation: 'Won after losing an arm.' },
  comeback: { title: 'Comeback', emblem: 'bolt', explanation: 'Won from low body health against a healthier rival.' },
} as const;
export type Milestone = keyof typeof MILESTONES;
export type BattleMark = { slot: Slot; node: string; local: number[]; fightId: string };
export type Career = {
  version: 1; verified: boolean; firstFight?: string; firstVictory?: string;
  wins: number; losses: number; weapons: Record<string, number>;
  milestones: Partial<Record<Milestone, string>>; pinnedReplay?: string;
  title?: Milestone; emblem?: 'none' | 'spark' | 'star' | 'shield' | 'bolt';
  pose?: 'proud' | 'salute' | 'fist'; marks: BattleMark[]; showMarks?: boolean;
};
export type Journey = {
  version: 1; trainingCompleted: boolean; lessons: string[]; walletPromptDismissed: boolean;
  plan: Draft8 | null; retained: Record<string, Fight8>;
};
export type FightMoment = { tick: number; text: string; kind: string };
export type FightReport = { version: 1; moments: FightMoment[]; suggestion: string; highlight: { start: number; end: number }; milestones: Milestone[] };
export const freshJourney = (): Journey => ({ version: 1, trainingCompleted: false, lessons: [], walletPromptDismissed: false, plan: null, retained: {} });
export const careerOf = (r: Robot8): Career => r.career ?? { version: 1, verified: false, wins: r.wins, losses: r.losses, weapons: {}, milestones: {}, marks: [] };

/** Allocate individual spare copies, including identical left/right limbs. */
export function plannedParts(s: Workshop8, draft: Draft8 | null = s.journey?.plan ?? null) {
  const unused = [...s.spares];
  const parts = SLOTS.flatMap(slot => {
    const entry = draft?.choices[slot], item = entry && ITEM_MAP.get(itemId(entry, slot));
    if (!item) return [];
    const index = unused.findIndex(p => p.item === item.id), owned = index >= 0;
    if (owned) unused.splice(index, 1);
    return [{ slot, item, owned, cost: owned ? 0 : item.price }];
  });
  return { parts, cost: parts.reduce((n, p) => n + p.cost, 0), missing: parts.filter(p => !p.owned).length, complete: legalChoices(draft?.choices) };
}

export function compareBuilds(before: Choices, after: Choices) {
  const a = aggregateEquipment(before, ENTRY_MAP), b = aggregateEquipment(after, ENTRY_MAP);
  const labels = { body: 'body health', speed: 'movement speed', attackSpeed: 'attack speed', plating: 'armour', power: 'hit power', precision: 'aim', turn: 'turning speed' } as const;
  const changes = Object.entries(labels).map(([key, label]) => {
    const k = key as keyof typeof labels, from = a.stats[k], to = b.stats[k];
    return { key, label, from, to, delta: to - from, relative: (to - from) / Math.max(.001, Math.abs(from)) };
  });
  const ordered = [...changes].sort((x, y) => Math.abs(y.relative) - Math.abs(x.relative));
  return { before: a, after: b, changes, benefit: ordered.find(c => c.delta > .00001), cost: ordered.find(c => c.delta < -.00001) };
}

export type RecordedEvent = { id: number; tick: number; kind: string; who: number; target?: number; amount?: number; slot?: Slot; node?: string; local?: number[]; reason?: string; action?: string; actionInstance?: number; absorbed?: number };
export function explainFight(fight: Fight8, events: RecordedEvent[], initial: [Record<Slot, number>, Record<Slot, number>]): FightReport {
  const candidates: (FightMoment & { weight: number })[] = [];
  for (const e of events) {
    let text = '', weight = 0;
    if (e.kind === 'break') { text = `${e.who === 0 ? 'Your robot broke the rival’s' : 'The rival broke your'} ${SLOT_NAMES[e.slot ?? 'torso'].toLowerCase()}.`; weight = 5; }
    else if (e.kind === 'hit' && e.reason === 'caught recovery') { text = e.who === 0 ? 'Your robot landed a hit during the rival’s recovery.' : 'The rival hit while your robot was recovering.'; weight = 4; }
    else if (e.kind === 'special' && e.who === 0) { text = 'Your Special activated here.'; weight = 3; }
    else if (e.kind === 'block') { text = `${e.target === 0 ? 'Your robot' : 'The rival'} blocked this attack.`; weight = 2; }
    else if (e.kind === 'parry') { text = 'A weapon parry stopped this attack.'; weight = 2; }
    else if (e.kind === 'defeat') { text = `${e.who === 0 ? 'Your robot' : 'The rival'} could no longer fight.`; weight = 6; }
    if (text) candidates.push({ tick: e.tick, text, kind: e.kind, weight });
  }
  const chosen: typeof candidates = [];
  for (const c of candidates.sort((a, b) => b.weight - a.weight || a.tick - b.tick)) {
    if (chosen.length === 3) break;
    if (!chosen.some(m => m.text === c.text || Math.abs(m.tick - c.tick) < 90)) chosen.push(c);
  }
  const ticks = fight.ticks ?? 0, duration = Math.min(ticks, 1200);
  const anchors = [0, Math.max(0, ticks - duration), ...candidates.map(c => Math.max(0, Math.min(ticks - duration, c.tick - 240)))];
  const start = anchors.sort((a, b) => {
    const score = (t: number) => candidates.filter(c => c.tick >= t && c.tick <= t + duration).reduce((n, c) => n + c.weight, 0);
    return score(b) - score(a) || b - a;
  })[0] ?? 0;
  const milestones: Milestone[] = [];
  if (fight.mode === 'training') milestones.push('ring_ready');
  else if (fight.winner === 0) {
    milestones.push('first_victory');
    if (events.some(e => e.kind === 'break' && e.target === 0 && (e.slot === 'armL' || e.slot === 'armR'))) milestones.push('last_arm');
    const remaining = [initial[0].torso, initial[1].torso]; let comeback = false;
    for (const e of events) if (e.kind === 'hit' && e.slot === 'torso' && (e.target === 0 || e.target === 1)) {
      remaining[e.target] = Math.max(0, remaining[e.target] - (e.amount ?? 0));
      if (remaining[0] <= initial[0].torso * .25 && remaining[1] > initial[1].torso * .5) comeback = true;
    }
    if (comeback) milestones.push('comeback');
  }
  const suggestion = events.some(e => e.kind === 'hit' && e.target === 0 && e.reason === 'caught recovery')
    ? 'Your weapon leaves an opening after attacking. Preview a quicker kit for your next build.'
    : !events.some(e => e.kind === 'special' && e.who === 0)
      ? 'Try your Special when its meter is ready. Training gives you a safe place to learn it.'
      : 'Try another weapon in practice and compare how it handles this opponent.';
  return { version: 1, moments: chosen.sort((a, b) => a.tick - b.tick).map(({ weight, ...m }) => m), suggestion, highlight: { start, end: start + duration }, milestones };
}

/** Called only after authoritative settlement, never from client-submitted results. */
export function recordCareer(state: Workshop8, fight: Fight8, report: FightReport, events: RecordedEvent[]) {
  state.journey ??= freshJourney();
  const robot = state.robots.find(r => r.id === fight.robotId);
  fight.report = report;
  if (fight.mode === 'training') state.journey.trainingCompleted = true;
  if (!robot) return;
  const c = structuredClone(careerOf(robot));
  c.verified = true; c.wins = robot.wins; c.losses = robot.losses;
  report.milestones = report.milestones.filter(id => !c.milestones[id]);
  const keep = (id: string) => { state.journey!.retained[id] = structuredClone(fight); };
  if (!c.firstFight) { c.firstFight = fight.id; keep(fight.id); }
  if (fight.mode !== 'training') {
    c.weapons[fight.choices.weapon] = (c.weapons[fight.choices.weapon] ?? 0) + 1;
    if (fight.winner === 0 && !c.firstVictory) { c.firstVictory = fight.id; keep(fight.id); }
  }
  for (const id of report.milestones) { c.milestones[id] = fight.id; keep(fight.id); }
  c.title ??= report.milestones[0];
  c.emblem ??= c.title ? MILESTONES[c.title].emblem : 'none';
  const marks = events.filter(e => e.kind === 'hit' && e.target === 0 && e.slot && e.node && e.local?.length === 3)
    .slice(-5).map(e => ({ slot: e.slot!, node: e.node!, local: [...e.local!], fightId: fight.id }));
  c.marks = [...c.marks, ...marks].slice(-5); robot.career = c;
}

export function pruneRetained(state:Workshop8){
 if(!state.journey)return;
 const keep=new Set(state.robots.flatMap(r=>{const c=careerOf(r);return [c.firstFight,c.firstVictory,c.pinnedReplay,...Object.values(c.milestones)]}).filter(Boolean));
 for(const id of Object.keys(state.journey.retained))if(!keep.has(id))delete state.journey.retained[id];
}
