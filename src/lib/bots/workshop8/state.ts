import { ENTRY_MAP, ITEM_MAP, SLOTS, itemId, legalChoices, defaultAppearance, parseAppearance, type Choices, type Slot, type Appearance } from "./catalogue";
import { freshJourney, careerOf, pruneRetained, MILESTONES, type Career, type Journey, type FightReport } from './journey';

export const SAVE_KEY = "mk8.connected-workshop.v1";
export type Robot8 = { id: string; name: string; choices: Choices; appearance: Appearance; cost: number; wins: number; losses: number; repairUntil: number; career?: Career };
export type Draft8 = { step?:'style'|'parts'|'personalize'|'review'; slot?:Slot; name: string; choices: Partial<Choices>; appearance: Appearance };
export type Fight8 = { competition?: import('./competition').FightCompetition; waiting?: boolean; server?: boolean; mode?: 'house' | 'training'; report?: FightReport; id: string; robotId: string | null; name: string; choices: Choices; appearance: Appearance; rival: Choices; seed: number; arena: string; startedAt: number; completedAt?: number; winner?: number | null; coins?: number; inputs?: { id: string; who: 0 | 1; tick: number }[]; ticks?: number; reason?: string; versions?: unknown };
export type Workshop8 = { journey?: Journey; version: 1; revision: number; welcomed: boolean; coins: number; draft: Draft8 | null; robots: Robot8[]; selected: string | null; spares: { uid: string; item: string }[]; history: Fight8[]; active: Fight8 | null; days: Record<string, number>; receipts: string[] };
function validInputs(inputs:unknown,tick:number):boolean {return Array.isArray(inputs)&&inputs.length<=100&&inputs.every(i=>i&&typeof i.id==='string'&&i.id.length<160&&(i.who===0||i.who===1)&&Number.isInteger(i.tick)&&i.tick>=0&&i.tick<=tick)&&new Set(inputs.map(i=>i.id)).size===inputs.length;}
export function freshWorkshop(): Workshop8 { return { version: 1, revision: 0, welcomed: false, coins: 250, draft: null, robots: [], selected: null, spares: [], history: [], active: null, days: {}, receipts: [] }; }
export const blankDraft = (): Draft8 => ({ name: "", choices: {}, appearance: defaultAppearance() });
export function readWorkshop(raw: string | null): Workshop8 | null {
  if (!raw) return freshWorkshop();
  if (raw.length > 2_000_000) return null;
  try {
    const s = JSON.parse(raw) as Workshop8;
    if (s.version !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0 || !Number.isSafeInteger(s.coins) || s.coins < 0 || !Array.isArray(s.robots) || s.robots.length > 5 || !Array.isArray(s.spares) || !Array.isArray(s.history) || !Array.isArray(s.receipts) || !s.days || typeof s.days !== "object" || Array.isArray(s.days) || Object.entries(s.days).some(([day,n])=>!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isSafeInteger(n)||n<0)) return null;
    if (s.robots.some(r => !r.id || !legalChoices(r.choices) || !parseAppearance(r.appearance) || typeof r.name !== "string" || !Number.isSafeInteger(r.cost) || r.cost<0 || !Number.isSafeInteger(r.wins) || r.wins<0 || !Number.isSafeInteger(r.losses) || r.losses<0 || !Number.isFinite(r.repairUntil) || r.repairUntil<0) || new Set(s.robots.map(r=>r.id)).size !== s.robots.length) return null;
    if (s.spares.some(p => !p.uid || !ITEM_MAP.has(p.item)) || new Set(s.spares.map(p=>p.uid)).size !== s.spares.length) return null;
    if (s.draft && ((s.draft.step!==undefined&&!['style','parts','personalize','review'].includes(s.draft.step))||(s.draft.slot!==undefined&&!SLOTS.includes(s.draft.slot))||!parseAppearance(s.draft.appearance) || typeof s.draft.name !== "string" || Object.entries(s.draft.choices).some(([slot,id]) => !SLOTS.includes(slot as Slot) || !ITEM_MAP.has(itemId(id,slot as Slot))))) return null;
    if ([...s.history, ...(s.active ? [s.active] : []),...Object.values(s.journey?.retained??{})].some(f => !legalChoices(f.choices) || !legalChoices(f.rival) || !parseAppearance(f.appearance) || !Number.isInteger(f.seed))) return null;
    if(s.journey){const j=s.journey;if(j.version!==1||typeof j.trainingCompleted!=='boolean'||typeof j.walletPromptDismissed!=='boolean'||!Array.isArray(j.lessons)||j.lessons.length>20||j.lessons.some(x=>typeof x!=='string'||x.length>40)||!j.retained||Array.isArray(j.retained)||Object.keys(j.retained).length>40)return null;if(j.plan&&(!parseAppearance(j.plan.appearance)||typeof j.plan.name!=='string'||j.plan.name.length>32||Object.entries(j.plan.choices).some(([slot,id])=>!SLOTS.includes(slot as Slot)||!ITEM_MAP.has(itemId(id!,slot as Slot)))))return null;}
    for(const r of s.robots)if(r.career){const c=r.career;if(c.version!==1||(c.pose!==undefined&&!['proud','salute','fist'].includes(c.pose))||(c.emblem!==undefined&&!['none','spark','star','shield','bolt'].includes(c.emblem))||(c.title!==undefined&&!Object.prototype.hasOwnProperty.call(MILESTONES,c.title))||typeof c.verified!=='boolean'||!Number.isSafeInteger(c.wins)||c.wins<0||!Number.isSafeInteger(c.losses)||c.losses<0||!c.weapons||!c.milestones||Object.entries(c.milestones).some(([id,f])=>!Object.prototype.hasOwnProperty.call(MILESTONES,id)||typeof f!=='string')||!Array.isArray(c.marks)||c.marks.length>5||c.marks.some(m=>!SLOTS.includes(m.slot)||typeof m.node!=='string'||!Array.isArray(m.local)||m.local.length!==3||!m.local.every(Number.isFinite)))return null;}
    return s;
  } catch { return null; }
}
export function draftCost(s: Workshop8) {
  const unused = s.spares.slice(); let cost = 0;
  for (const slot of SLOTS) {
    const id = s.draft?.choices[slot]; if (!id) continue;
    const item = ITEM_MAP.get(itemId(id,slot)); if (!item) continue;
    const index = unused.findIndex(p=>p.item === item.id);
    if (index >= 0) unused.splice(index,1); else cost += item.price;
  }
  return cost;
}
export function repairQuote(robot:Robot8,now=Date.now()) {
  const gp=SLOTS.reduce((n,slot)=>n+([0,100,200,350,500][ENTRY_MAP.get(robot.choices[slot])!.tier])*(["head","torso","weapon"].includes(slot)?.2:.1),0);
  const factor=Math.max(0,Math.min(1,(gp-100)/400)),duration=3600000+factor*7200000;
  return Math.ceil((50+factor*100)*Math.min(1,Math.max(0,robot.repairUntil-now)/duration));
}
export type Action8 = {kind:'builderStep';step:'style'|'parts'|'personalize'|'review';slot:Slot} | {kind:'draftAppearance';appearance:Appearance} | {kind:'journey';plan?:Draft8|null;lesson?:string;dismissWallet?:boolean} | {kind:'career';id:string;title?:keyof typeof MILESTONES|'';emblem?:Career['emblem'];pose?:'proud'|'salute'|'fist';showMarks?:boolean;clearMarks?:boolean;pin?:string} | { kind: "checkpoint"; id: string; ticks: number; inputs: NonNullable<Fight8["inputs"]>; versions: unknown } | { kind: "choose"; slot: Slot; entry: string } | { kind: "nameDraft"; name: string } | { kind: "welcome" } | { kind: "draft"; draft: Draft8 } | { kind: "select"; id: string } | { kind: "buy"; item: string; request: string } | { kind: "finish"; request: string } | { kind: "recycle"; id: string; request: string } | { kind: "paint"; id: string; appearance: Appearance; name: string } | { kind: "start"; fight: Fight8 } | { kind: "complete"; id: string; winner: number | null; inputs: NonNullable<Fight8["inputs"]>; ticks: number; reason: string; versions: unknown } | { kind: "repair"; id: string; request: string };
export function changeWorkshop(previous: Workshop8, action: Action8, now = Date.now()): Workshop8 {
  if ("request" in action && previous.receipts.includes(action.request)) return previous;
  const s = structuredClone(previous);
  const robot = "id" in action ? s.robots.find(r=>r.id===action.id) : undefined;
  switch (action.kind) {
    case 'builderStep': if(s.draft){s.draft.step=action.step;s.draft.slot=action.slot;}break;
    case 'draftAppearance': if(!s.draft||!parseAppearance(action.appearance))throw Error('Start a build first.');s.draft.appearance=structuredClone(action.appearance);break;
    case 'journey': {
      s.journey ??= freshJourney();
      if (action.plan !== undefined) {
        if (action.plan && (!parseAppearance(action.plan.appearance) || Object.entries(action.plan.choices).some(([slot,id]) => !SLOTS.includes(slot as Slot) || !ITEM_MAP.has(itemId(id!,slot as Slot))))) throw Error('Choose valid parts for your plan.');
        s.journey.plan = action.plan;
      }
      if (action.lesson && !s.journey.lessons.includes(action.lesson)) s.journey.lessons.push(action.lesson);
      if (action.dismissWallet) s.journey.walletPromptDismissed = true;
      break;
    }
    case 'career': {
      if (!robot) throw Error('Choose a saved robot.');
      robot.career = structuredClone(careerOf(robot));
      if (action.title !== undefined) {
        if (action.title && !robot.career.milestones[action.title]) throw Error('Earn this title in a fight first.');
        robot.career.title = action.title || undefined;
        robot.career.emblem = action.title ? MILESTONES[action.title].emblem : 'none';
      }
      if (action.emblem !== undefined) {
        if(action.emblem!=='none'&&!Object.keys(robot.career.milestones).some(id=>MILESTONES[id as keyof typeof MILESTONES].emblem===action.emblem))throw Error('Earn this emblem in a fight first.');
        robot.career.emblem=action.emblem;
      }
      if (action.pose) robot.career.pose = action.pose;
      if (action.showMarks !== undefined) robot.career.showMarks = action.showMarks;
      if (action.clearMarks) robot.career.marks = [];
      if (action.pin) {
        const fight = s.history.find(f=>f.id===action.pin) ?? s.journey?.retained[action.pin];
        if (!fight || fight.robotId !== robot.id) throw Error('Choose a completed fight for this robot.');
        s.journey ??= freshJourney(); s.journey.retained[fight.id] = structuredClone(fight); robot.career.pinnedReplay = fight.id;
      }
      break;
    }
    case "welcome": s.welcomed = true; break;
    case "choose": {
      if(s.robots.length>=5||!ITEM_MAP.has(itemId(action.entry,action.slot)))throw Error("Choose an available part.");
      s.draft??=blankDraft();if(action.slot==='torso'&&!s.draft.choices.torso)s.draft.appearance=defaultAppearance(ENTRY_MAP.get(action.entry)!.family);
      s.draft.choices[action.slot]=action.entry;break;
    }
    case "nameDraft": s.draft??=blankDraft();s.draft.name=action.name.slice(0,32);break;
    case "draft": if(s.robots.length >= 5) throw Error("Your five stands are full. Recycle a robot to make room."); s.draft = action.draft; break;
    case "select": if(!robot) throw Error("Choose a robot in your garage."); s.selected=robot.id; break;
    case "buy": {
      const item=ITEM_MAP.get(action.item); if(!item) throw Error("That part is unavailable.");
      if(s.coins<item.price) throw Error("You need more game coins for this part.");
      s.coins-=item.price;s.spares.push({uid:action.request,item:item.id});break;
    }
    case "finish": {
      if(!s.draft || !legalChoices(s.draft.choices)) throw Error("Choose all seven parts first.");
      if(s.robots.length>=5) throw Error("Your five stands are full.");
      const name=s.draft.name.trim();if(!name||name.length>32) throw Error("Give your robot a name, up to 32 letters.");
      const cost=draftCost(s);if(cost>s.coins) throw Error("You need more game coins to finish this robot.");
      for(const slot of SLOTS){const index=s.spares.findIndex(p=>p.item===itemId(s.draft!.choices[slot]!,slot));if(index>=0)s.spares.splice(index,1);}
      const total=SLOTS.reduce((n,slot)=>n+ITEM_MAP.get(itemId(s.draft!.choices[slot]!,slot))!.price,0);
      s.coins-=cost;s.robots.push({id:action.request,name,choices:structuredClone(s.draft.choices),appearance:structuredClone(s.draft.appearance),cost:total,wins:0,losses:0,repairUntil:0});s.selected=action.request;s.draft=null;s.welcomed=true;break;
    }
    case "recycle": if(!robot)throw Error("That robot is no longer here.");if(s.active?.robotId===robot.id)throw Error("Finish its fight before recycling.");s.coins+=Math.floor(robot.cost*.4);s.robots=s.robots.filter(r=>r.id!==robot.id);s.selected=s.robots[0]?.id??null;break;
    case "paint": if(!robot||!parseAppearance(action.appearance))throw Error("Choose a saved robot.");if(!action.name.trim()||action.name.trim().length>32)throw Error("Use a name up to 32 letters.");robot.appearance=structuredClone(action.appearance);robot.name=action.name.trim();break;
    case "start": if(s.active)throw Error("Finish your current fight first.");if(!legalChoices(action.fight.choices)||!legalChoices(action.fight.rival))throw Error("The fighter has an unavailable part.");if(action.fight.robotId){const own=s.robots.find(r=>r.id===action.fight.robotId);if(!own||own.repairUntil>now||JSON.stringify(own.choices)!==JSON.stringify(action.fight.choices))throw Error("Choose a ready robot.");}s.active=structuredClone(action.fight);break;
    case "checkpoint": {
      if(!s.active||s.active.id!==action.id||!Number.isInteger(action.ticks)||action.ticks<0||action.ticks>7200||action.ticks<(s.active.ticks??0))return previous;
      if(!validInputs(action.inputs,action.ticks))throw Error("The saved fight inputs are invalid.");
      s.active.ticks=action.ticks;s.active.inputs=structuredClone(action.inputs);s.active.versions=action.versions;break;
    }
    case "complete": {
      if(!s.active||s.active.id!==action.id||s.history.some(f=>f.id===action.id))return previous;
      if(!validInputs(action.inputs,action.ticks))throw Error("The fight inputs are invalid.");
      if(![0,1,null].includes(action.winner)||!Number.isInteger(action.ticks)||action.ticks<1||action.ticks>7200)throw Error("This fight result is incomplete.");
      const training=s.active.mode==='training',eligible=!training||!s.journey?.trainingCompleted;
      const day=new Date(now).toISOString().slice(0,10),count=s.days[day]??0,coins=eligible&&count<12?75+(count===5?100:0):0;
      const own=s.robots.find(r=>r.id===s.active!.robotId);if(own&&!training){if(action.winner===0)own.wins++;if(action.winner===1){own.losses++;const gp=SLOTS.reduce((n,slot)=>n+([0,100,200,350,500][ENTRY_MAP.get(own.choices[slot])!.tier])*(["head","torso","weapon"].includes(slot)?.2:.1),0);own.repairUntil=now+3600000+Math.max(0,Math.min(1,(gp-100)/400))*7200000;}}
      if(training){s.journey??=freshJourney();s.journey.trainingCompleted=true;}
      s.coins+=coins;if(eligible)s.days[day]=count+1;s.history=[{...s.active,completedAt:now,winner:action.winner,coins,inputs:action.inputs,ticks:action.ticks,reason:action.reason,versions:action.versions},...s.history].slice(0,30);s.active=null;break;
    }
    case "repair": {
      if(!robot)throw Error("Choose a saved robot.");const gp=SLOTS.reduce((n,slot)=>n+([0,100,200,350,500][ENTRY_MAP.get(robot.choices[slot])!.tier])*(["head","torso","weapon"].includes(slot)?.2:.1),0),factor=Math.max(0,Math.min(1,(gp-100)/400)),duration=3600000+factor*7200000;
      const cost=repairQuote(robot,now);if(s.coins<cost)throw Error("Not enough game coins. Free repair finishes automatically.");s.coins-=cost;robot.repairUntil=0;break;
    }
  }
  if(s.journey){const lesson=action.kind==='choose'||action.kind==='draft'?'style':action.kind==='nameDraft'&&action.name.trim()?'name':action.kind==='draftAppearance'||action.kind==='paint'?'paint':action.kind==='finish'?'finish':action.kind==='start'?'fight':action.kind==='complete'?'reward':null;if(lesson&&!s.journey.lessons.includes(lesson))s.journey.lessons.push(lesson);}
  pruneRetained(s);s.revision++;if("request" in action)s.receipts=[...s.receipts,action.request].slice(-500);
  return s;
}
