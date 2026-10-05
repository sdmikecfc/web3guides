"use client";
import { ROOM_PALETTES, ROOM_FINISH_DEFAULTS, type RoomFinishSlot } from '@/lib/chef/diner/collections';
import type { DinerState } from '@/lib/chef/diner/progression';
import css from './finish-preview.module.css';
export type RoomFinishChoice={slot:RoomFinishSlot;id:string};
const labels:Record<RoomFinishSlot,string>={counter:'Counter fronts',worktop:'Worktops',upholstery:'Seats',sign:'Sign'};
export function RoomFinishPreview({state,choice,change,cancel,apply}:{state:DinerState;choice:RoomFinishChoice;change:(c:RoomFinishChoice)=>void;cancel:()=>void;apply:()=>void}){
  const finish=ROOM_PALETTES[choice.slot].find(f=>f.id===choice.id)!,owned=state.paletteOwned?.[choice.slot]?.includes(choice.id)||finish.price===0,applied=(state.home.finishes?.[choice.slot]??ROOM_FINISH_DEFAULTS[choice.slot])===choice.id;
  return <section className={css.panel} aria-label="Preview furnishing finishes"><div className={css.heading}><div><strong>A little more yours</strong><small>See it in your room before spending</small></div><button aria-label="Cancel furnishing finish" onClick={cancel}>×</button></div><div className={css.tabs}>{(Object.keys(labels) as RoomFinishSlot[]).map(slot=><button key={slot} aria-pressed={slot===choice.slot} onClick={()=>change({slot,id:state.home.finishes?.[slot]??ROOM_FINISH_DEFAULTS[slot]})}>{labels[slot]}</button>)}</div><div className={css.swatches}>{ROOM_PALETTES[choice.slot].map(f=><button key={f.id} aria-pressed={choice.id===f.id} onClick={()=>change({...choice,id:f.id})}><span style={{background:f.color}}/>{f.name}</button>)}</div><div className={css.footer}><span>{owned?'Owned':`${finish.price} coins`}</span><button className={css.cancel} onClick={cancel}>Cancel</button><button className={css.apply} disabled={applied||(!owned&&state.coins<finish.price)} onClick={apply}>{applied?'Already applied':owned?'Apply finish':`Buy & apply · ${finish.price}`}</button></div></section>;
}
