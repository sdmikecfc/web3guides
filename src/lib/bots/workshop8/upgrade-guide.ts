import {dailyItems,ITEM_MAP,itemId,legalChoices,type Item} from './catalogue';
import {compareBuilds} from './journey';
import type {Robot8,Workshop8} from './state';

export type UpgradeSuggestion={item:Item;spareUid?:string;cost:number;shortfall:number;benefit:string;costNote:string|null;gpBefore:number;gpAfter:number};

/** One useful next step, calculated from this robot's seven actual parts.
 * Suggestions never buy anything or reserve a spare. Recheck at installation.
 */
export function recommendUpgrade(state:Workshop8,robot:Robot8,day:string):UpgradeSuggestion|null{
 const stocked=new Map(dailyItems(day).map(item=>[item.id,item]));
 for(const spare of state.spares){const item=ITEM_MAP.get(spare.item);if(item)stocked.set(item.id,item);}
 const options:(UpgradeSuggestion&{value:number})[]=[];
 for(const item of stocked.values()){
  if(itemId(robot.choices[item.slot],item.slot)===item.id)continue;
  const choices={...robot.choices,[item.slot]:item.entry.id};
  if(!legalChoices(choices))continue;
  const comparison=compareBuilds(robot.choices,choices);
  // A cosmetic duplicate or sideways trade is not presented as ladder progress.
  if(comparison.after.gp<=comparison.before.gp||!comparison.benefit)continue;
  const spare=state.spares.find(part=>part.item===item.id),cost=spare?0:item.price;
  const value=comparison.changes.reduce((total,change)=>total+Math.max(-1,Math.min(1,change.relative)),0);
  if(value<=0)continue;
  options.push({item,spareUid:spare?.uid,cost,shortfall:Math.max(0,cost-state.coins),benefit:`More ${comparison.benefit.label}.`,costNote:comparison.cost?`Less ${comparison.cost.label}.`:null,gpBefore:comparison.before.gp,gpAfter:comparison.after.gp,value});
 }
 options.sort((a,b)=>Number(a.shortfall>0)-Number(b.shortfall>0)||a.cost-b.cost||b.value-a.value||a.item.id.localeCompare(b.item.id));
 const best=options[0];if(!best)return null;
 const {value,...suggestion}=best;return suggestion;
}
