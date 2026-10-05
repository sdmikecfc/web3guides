"use client";
import { useState } from 'react';
import { dinerRates, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import { renovationRequirements } from '@/lib/chef/diner/renovation';
import { careerIngredientRewards } from '@/lib/chef/diner/career';
import { RECIPES } from '@/lib/chef/diner/content';
import { STAGE_COPY } from './RenovationPreview';
import css from './diner.module.css';

export function HomeGrowth({state,send,open,preview}:{state:DinerState;send:(command:DinerCommand)=>boolean;open:(panel:'catalogue'|'recipes'|'staff'|'map')=>void;preview:()=>void}) {
  const next=renovationRequirements(state),rates=dinerRates(state),bundles=careerIngredientRewards(state),available=bundles.filter(b=>b.available&&!b.claimed);
  const eligible=RECIPES.filter(r=>state.recipes[r.id]&&state.recipes[r.id].level<10),[recipe,setRecipe]=useState(eligible[0]?.id??'');
  const choice=eligible.some(r=>r.id===recipe)?recipe:eligible[0]?.id;
  return <>
    <div className={css.statBox}><span className={css.eyebrow}>{next.currentStage?STAGE_COPY[next.currentStage].name:'Your original restaurant'}</span><strong>{next.stage?STAGE_COPY[next.stage].name:'Your full restaurant'}</strong><p className={css.small}>{next.stage?STAGE_COPY[next.stage].description:'Keep collecting dishes and making every corner your own.'}</p>
      {next.stage&&<><p className={css.small}>{next.cost?`${next.cost.toLocaleString()} coins, recipe mastery and good lunches on the road.`:'Your new burger-shop layout is included. Preview it before changing anything.'}</p><button className={css.primary} onClick={preview}>Preview {next.stage==='burger_shop'?'burger shop':'renovation'}</button><p className={css.tiny}>Your old room is saved. Displaced furnishings stay in storage; your money, recipes and finishes stay yours.</p></>}
    </div>
    {next.stage&&next.cost>0&&<><h3 className={css.sectionTitle}>Getting there</h3><div className={css.list}>{next.requirements.map(r=><div className={css.row} key={r.id}><span aria-label={r.met?'Complete':'In progress'}>{r.met?'✓':'○'}</span><div><h3>{r.label}</h3><progress aria-label={r.label} max={Math.max(1,r.target)} value={Math.min(r.current,r.target)}/><p>{Math.floor(r.current).toLocaleString()} / {r.target.toLocaleString()}</p></div></div>)}</div><p className={css.notice}>Real truck services count. Practice and replayed claims don’t. Only a limited number of introductory lunches count, so try a busier route and serve different dishes.</p></>}
    <h3 className={css.sectionTitle}>Ingredients you earned</h3><p className={css.small}>Cooking milestones give complete upgrade sets for a dish you choose. Each parcel is yours once; no need to wait for a lucky daily delivery.</p>
    {available.length>0&&choice?<><label className={css.field}>For which dish?<select aria-label="Recipe for achievement ingredients" value={choice} onChange={e=>setRecipe(e.target.value)}>{eligible.map(r=><option key={r.id} value={r.id}>{r.name} · level {state.recipes[r.id].level}</option>)}</select></label><div className={css.list}>{available.map(b=><div className={css.row} key={b.id}><div><h3>{b.services} good lunches</h3><p>Up to {b.sets} complete recipe upgrades.</p></div><button className={css.primary} onClick={()=>send({type:'claimCareerIngredients',achievementId:b.id,recipeId:choice})}>Collect</button></div>)}</div></>:<p className={css.notice}>{bundles.find(b=>!b.available)?`Next parcel: ${bundles.find(b=>!b.available)!.progress} / ${bundles.find(b=>!b.available)!.services} completed services.`:'All currently available parcels have been collected.'}</p>}
    <h3 className={css.sectionTitle}>Make today a little better</h3><p className={css.small}>About {Math.round(rates.coins)} coins an hour with your current layout. {rates.bottleneck==='seats'?'Reachable seats are your current limit.':rates.bottleneck==='kitchen'?'Your cooking capacity is the current limit.':rates.bottleneck==='waiters'?'Serving capacity is your current limit.':'Recipe mastery and truck-service buzz bring more guests.'}</p><div className={css.actions}><button className={css.button} onClick={()=>open('recipes')}>Improve a dish</button><button className={css.button} onClick={()=>open('catalogue')}>Furnish</button><button className={css.button} onClick={()=>open('map')}>Take the truck</button></div>
  </>;
}
