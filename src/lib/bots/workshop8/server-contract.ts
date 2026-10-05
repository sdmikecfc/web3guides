import { SLOTS, ITEM_MAP, itemId, legalChoices, parseAppearance } from "./catalogue";
import { blankDraft, changeWorkshop, type Action8, type Draft8, type Workshop8 } from "./state";
import { MILESTONES } from './journey';

function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Choose a valid action."); return v as Record<string, unknown>; }
function text(v: unknown, max = 120) { if (typeof v !== "string" || v.length > max) throw Error("Check the text and try again."); return v; }
export function requestId(v: unknown) { const id = text(v); if (!/^[A-Za-z0-9_.:-]{8,120}$/.test(id)) throw Error("Refresh and try again."); return id; }
function draft(v: unknown): Draft8 {
  const d = record(v), choices = record(d.choices), appearance = parseAppearance(d.appearance);
  if (!appearance || Object.entries(choices).some(([slot,id]) => !SLOTS.includes(slot as any) || typeof id !== "string" || !ITEM_MAP.has(itemId(id,slot as any)))) throw Error("Some parts could not be checked. Choose them again.");
  return { name: text(d.name,32), choices: { ...choices } as Draft8["choices"], appearance };
}
/** Whitelist only player intentions. Never accept balances, winners or clocks. */
export function playerAction(value: unknown, id: string): Action8 {
  const a = record(value);
  switch (a.kind) {
    case 'builderStep': if(!['style','parts','personalize','review'].includes(String(a.step))||!SLOTS.includes(a.slot as any))throw Error('Choose a build step.');return {kind:'builderStep',step:a.step as 'style'|'parts'|'personalize'|'review',slot:a.slot as any};
    case 'draftAppearance': {const appearance=parseAppearance(a.appearance);if(!appearance)throw Error('Choose valid paint.');return {kind:'draftAppearance',appearance}}
    case 'journey': {
      const lesson=a.lesson===undefined?undefined:text(a.lesson,40);
      if(lesson&&!['style','paint','name','finish','fight','special','reward'].includes(lesson))throw Error('Unknown lesson.');
      return {kind:'journey',plan:a.plan===undefined?undefined:a.plan===null?null:draft(a.plan),lesson,dismissWallet:a.dismissWallet===true};
    }
    case 'career': {
      if(a.title!==undefined&&a.title!==''&&!Object.prototype.hasOwnProperty.call(MILESTONES,String(a.title)))throw Error('Choose an earned title.');
      if(a.emblem!==undefined&&!['none','spark','star','shield','bolt'].includes(String(a.emblem)))throw Error('Choose an earned emblem.');
      if(a.pose!==undefined&&!['proud','salute','fist'].includes(String(a.pose)))throw Error('Choose a victory pose.');
      return {kind:'career',id:text(a.id),title:a.title as any,emblem:a.emblem as any,pose:a.pose as any,showMarks:typeof a.showMarks==='boolean'?a.showMarks:undefined,clearMarks:a.clearMarks===true,pin:a.pin===undefined?undefined:text(a.pin)};
    }
    case "welcome": return {kind:"welcome"};
    case "choose": if (!SLOTS.includes(a.slot as any) || typeof a.entry !== "string" || !ITEM_MAP.has(itemId(a.entry,a.slot as any))) throw Error("Choose an available part."); return {kind:"choose",slot:a.slot as any,entry:a.entry};
    case "nameDraft": return {kind:"nameDraft",name:text(a.name,32)};
    case "draft": return {kind:"draft",draft:draft(a.draft)};
    case "select": return {kind:"select",id:text(a.id)};
    case "finish": return {kind:"finish",request:id};
    case "buy": return {kind:"buy",item:text(a.item,180),request:id};
    case "recycle": return {kind:"recycle",id:text(a.id),request:id};
    case "repair": return {kind:"repair",id:text(a.id),request:id};
    case "paint": { const appearance=parseAppearance(a.appearance); if(!appearance)throw Error("Choose valid paint colours.");return {kind:"paint",id:text(a.id),name:text(a.name,32),appearance}; }
    default: throw Error("This action must be run by the game server.");
  }
}
/** Transfer choices, not browser coins, spares, victories or arbitrary high tiers. */
export function browserStarter(value: unknown): Draft8 {
  const d = draft(value);
  if (Object.entries(d.choices).some(([slot,id]) => ITEM_MAP.get(itemId(id!,slot as any))!.entry.tier !== 1)) throw Error("Only starter parts can move from an unsynced browser. Your browser garage stays safe.");
  return d;
}
export function applyBrowserStarter(state: Workshop8, value: unknown, finish: boolean, id: string, now: number) {
  if (state.robots.length || state.draft || state.coins !== 250 || state.history.length || state.spares.length) throw Error("This wallet already has a garage. Open that garage; your browser save has not been replaced.");
  const d = browserStarter(value);
  let next=changeWorkshop(state,{kind:"draft",draft:d},now);
  if (finish) { if(!legalChoices(d.choices))throw Error("Choose all seven starter parts first.");next=changeWorkshop(next,{kind:"finish",request:id},now); }
  // A single atomic mutation owns both draft transfer and optional assembly.
  next.revision=state.revision+1; return next;
}
