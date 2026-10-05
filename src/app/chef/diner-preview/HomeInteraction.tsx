"use client";
import { DECOR_BY_ID, REGULARS } from '@/lib/chef/diner/collections';
import { EQUIPMENT_BY_ID, RECIPE_BY_ID } from '@/lib/chef/diner/content';
import { type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import { DinerIcon } from './DinerIcon';
import type { PanelName } from './DinerPanels';
import css from './diner.module.css';

type Props={state:DinerState;selected:string|null;send:(command:DinerCommand)=>boolean;close:()=>void;open:(panel:PanelName)=>void;edit:()=>void};

/** A physical selection exposes one small action, never an automatic reward. */
export function HomeInteraction({state,selected,send,close,open,edit}:Props){
  if(!selected||selected.startsWith('incident:')||selected==='home-parcel')return null;
  const furnishing=state.home.layout.find(item=>item.id===selected);
  const regular=REGULARS.find(person=>`regular:${person.id}`===selected);
  let title='',detail='',actions:React.ReactNode=null;
  if(regular){
    title=regular.name;detail=state.daily.regularServed.includes(regular.id)?'A good lunch and a friendly goodbye. See you tomorrow.':regular.quirk;
    actions=<button className={css.primary} disabled={state.daily.regularServed.includes(regular.id)} onClick={()=>send({type:'serveRegular',regularId:regular.id})}>Say hello <DinerIcon name="heart" size={16}/></button>;
  }else if(furnishing){
    const def=EQUIPMENT_BY_ID[furnishing.equipmentId]??DECOR_BY_ID[furnishing.equipmentId];title=def?.name??'Your furnishing';
    const dishes=Object.keys(state.recipes).filter(id=>RECIPE_BY_ID[id].steps.some(step=>step.station===furnishing.equipmentId));
    detail=dishes.length?`Used for ${dishes.map(id=>RECIPE_BY_ID[id].name.toLowerCase()).join(', ')}.`:furnishing.equipmentId==='sink'?'Your waiter brings used plates here.':furnishing.equipmentId.startsWith('table_')?'Give your guests a comfortable place to eat.':'A little piece of your own style.';
    actions=<><button className={css.primary} onClick={edit}><DinerIcon name="decorate" size={17}/>Move or rotate</button>{dishes.length>0&&<button className={css.button} onClick={()=>open('recipes')}>Improve a dish</button>}</>;
  }else return null;
  return <section className={css.homeAction} aria-label={title}>
    <button className={css.actionClose} aria-label="Close selected object" onClick={close}><DinerIcon name="close" size={17}/></button>
    <div className={css.homeActionText}><strong>{title}</strong><p>{detail}</p></div>
    <div className={css.actions}>{actions}</div>
  </section>;
}
