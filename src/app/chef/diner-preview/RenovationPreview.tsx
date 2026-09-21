"use client";
import type { RestaurantStage } from '@/lib/chef/diner/room-plan';
import { getRenovationPreview } from '@/lib/chef/diner/renovation';
import type { DinerState } from '@/lib/chef/diner/progression';
import css from './finish-preview.module.css';

export const STAGE_COPY:Record<RestaurantStage,{name:string;description:string;included:string}>={
  burger_shop:{name:'Neighbourhood burger shop',description:'A little burger shop with a proper counter, three stools and room to make it yours.',included:'10 × 8 · cook, cashier & server · 3 stools · 2 bathroom bays, 1 toilet & 1 hand basin'},
  diner:{name:'Your first diner',description:'A warm oak chef’s bar, six upholstered stools and a booth for two. A separate kitchen serves through its hatch; servers take orders and earn tips.',included:'12 × 10 · 6 bar stools + a booth for two · oak & teal finishes · cashier becomes a second server · 3 bathroom bays'},
  restaurant:{name:'Your full restaurant',description:'An enclosed kitchen and a dining room with linen-covered tables, flowers and proper place settings. Servers collect food inside the kitchen.',included:'14 × 12 · 3 dressed two-seat tables & 6 chairs included · keep your booth in storage · 4 bathroom bays'},
};
export type RenovationChoice=NonNullable<ReturnType<typeof getRenovationPreview>>;
export function RenovationPreview({state,choice,before,setBefore,cancel,confirm}:{state:DinerState;choice:RenovationChoice;before:boolean;setBefore:(v:boolean)=>void;cancel:()=>void;confirm:()=>void}){
  const current=getRenovationPreview(state,choice.stage),valid=current?.token===choice.token,allowed=valid&&current?.allowed;
  return <section className={css.panel} aria-label="Renovation preview"><div className={css.heading}><div><strong>{STAGE_COPY[choice.stage].name}</strong><small>Preview only · your room is safe</small></div><button aria-label="Cancel renovation preview" onClick={cancel}>×</button></div>
    <div className={css.row}><div className={css.tabs}><button aria-pressed={before} onClick={()=>setBefore(true)}>My room</button><button aria-pressed={!before} onClick={()=>setBefore(false)}>After renovation</button></div><p>{STAGE_COPY[choice.stage].included}</p></div>
    <p className={css.error}>{!valid?'Your room changed. Close and open a fresh preview.':!allowed?current?.reason??'Keep cooking: the accomplishments in Decorate unlock this renovation.':'Your old layout will be backed up. Extra furniture goes into storage.'}</p>
    <div className={css.footer}><span>{choice.cost?`${choice.cost.toLocaleString()} coins`:'Included · no charge'}</span><button className={css.cancel} onClick={cancel}>Keep my room</button><button className={css.apply} disabled={!allowed} onClick={confirm}>Confirm renovation</button></div>
  </section>;
}
