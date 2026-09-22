"use client";
import { ROUTES, TRUCK_TIERS } from '@/lib/chef/diner/content';
import type { DinerState } from '@/lib/chef/diner/progression';
import { passportRoute } from './collection-view';
import { DinerIcon } from './DinerIcon';
import css from './collection-books.module.css';

export interface PassportBookProps {state:DinerState;openRecipes?:()=>void;openCook?:()=>void}
/** Stamps are memories of entry; finale receipts and recipe ownership grow trucks. */
export function PassportBook({state,openRecipes,openCook}:PassportBookProps){
  const tier=TRUCK_TIERS[state.truckTier];
  return <section className={css.book} aria-label="Your road passport">
    <header className={css.intro}><DinerIcon name="book" size={38}/><div><h3>Your road passport</h3><p>Stamps remember stops you visited. They are not coins, and a service stamp does not mean its service was cleared.</p></div></header>
    <div className={css.unlock}><DinerIcon name="truck" size={30}/><div><strong>Your tier-{state.truckTier} truck</strong><small>{tier.w} × {tier.h} kitchen · {tier.helpers===0?'No helper seat yet':`${tier.helpers} helper ${tier.helpers===1?'seat':'seats'}`}. Growth comes from a route finale win and every recipe in that route.</small></div></div>
    <div className={css.routes}>{ROUTES.map(route=>{const entry=passportRoute(state,route.id)!;return <article key={route.id} className={css.route} aria-labelledby={`passport-${route.id}`}>
      <header className={css.routeHeading}><DinerIcon name={entry.won?'star':'truck'} size={31}/><div><h4 id={`passport-${route.id}`}>{route.name}</h4><p>{entry.stamps.length} different stop {entry.stamps.length===1?'stamp':'stamps'} · {entry.open?'Route open':`Opens with truck tier ${route.tier}`}</p></div></header>
      <div className={css.routeBody}>
        <div className={css.unlock}><DinerIcon name={entry.upgraded?'check':'truck'} size={25}/><div><strong>{entry.upgraded?`Tier ${entry.nextTier.tier} earned`:`Grow to tier ${entry.nextTier.tier}`}</strong><small>{entry.nextTier.w} × {entry.nextTier.h} kitchen · {entry.nextTier.helpers} helper {entry.nextTier.helpers===1?'seat':'seats'}</small></div></div>
        <ul className={css.requirements} aria-label={`${route.name} truck growth requirements`}><li className={entry.won?css.ready:undefined}>{entry.won?<DinerIcon name="check" size={16}/>:<span className={css.missingDot} aria-hidden="true"/>}<span>{entry.won?'Finale cleared':'Clear this route’s finale'}</span></li><li className={entry.owned===entry.recipes.length?css.ready:undefined}>{entry.owned===entry.recipes.length?<DinerIcon name="check" size={16}/>:<span className={css.missingDot} aria-hidden="true"/>}<span>{entry.owned} / {entry.recipes.length} route recipes discovered · any mastery level counts</span></li></ul>
        <ul className={css.recipes} aria-label={`${route.name} recipe collection`}>{entry.recipes.map(recipe=><li key={recipe.id} data-owned={recipe.owned}>{recipe.owned&&<DinerIcon name="check" size={12}/>}<span>{recipe.name}{!recipe.owned?' · to find':''}</span></li>)}</ul>
        {!entry.upgraded&&<p className={css.rule}>{entry.earned?'Both requirements are complete. Return home to see your larger truck.':'Discover recipes in route markets or the recipe shop, or earn one at the finale. Visiting every stop is not required for truck growth.'}</p>}
        <div className={css.actions}>{openRecipes&&entry.owned<entry.recipes.length&&<button type="button" className={css.linkButton} onClick={openRecipes}>Browse recipes</button>}{openCook&&<button type="button" className={css.linkButton} onClick={openCook}>{state.run?'Return to my route':entry.open?'Plan a road trip':'See my next route'}</button>}</div>
        <h5 className={css.subheading}>Places you have been</h5>
        {entry.stamps.length?<div className={css.stamps}>{entry.stamps.map(stamp=><div className={css.stamp} key={stamp.id}><strong>Stop {stamp.stop}</strong><small>{stamp.name}</small></div>)}</div>:<p className={css.empty}>Your first stamp arrives when you enter a stop on this route.</p>}
      </div>
    </article>;})}</div>
  </section>;
}
