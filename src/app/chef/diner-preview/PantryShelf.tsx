"use client";

import { INGREDIENTS, INGREDIENT_BY_ID } from '@/lib/chef/diner/content';
import { DINER_RULES, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import { IngredientArt } from './IngredientArt';
import { DinerIcon } from './DinerIcon';
import css from './pantry-shelf.module.css';

export interface PantryShelfProps {
  state:DinerState;
  send:(command:DinerCommand)=>boolean;
  close:()=>void;
  openRecipes:()=>void;
}

const number=(value:number)=>Math.floor(value).toLocaleString();
function timeLeft(ms:number){const minutes=Math.max(1,Math.ceil(ms/60000)),hours=Math.floor(minutes/60);return hours?`${hours}h${minutes%60?` ${minutes%60}m`:''}`:`${minutes}m`;}

function ParcelArt(){return <svg viewBox="0 0 80 80" width="80" height="80" fill="none" stroke="#78503c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  <ellipse cx="41" cy="69" rx="29" ry="4" fill="#78503c" opacity=".12" stroke="none"/>
  <path d="m12 28 29-13 28 14v31L40 73 12 58Z" fill="#d5a16b"/>
  <path d="m12 28 28 15 29-14-28-14Z" fill="#edc58f"/>
  <path d="M40 43v30l29-13V29Z" fill="#b98555"/>
  <path d="m28 21 12-5 28 13-11 5Z" fill="#f6cf65"/>
  <path d="m27 36 13 7v30l-13-7Z" fill="#f6cf65"/>
  <path d="m49 46 13-6v13l-13 6Z" fill="#fff2d6" stroke="none"/><path d="m52 47 7-3m-7 7 5-2" stroke="#8b9d77" strokeWidth="1.7"/>
  <path d="m15 11 1 6m-4-3h7m48-4-2 5m-1-4 4 3" stroke="#d7a34c" strokeWidth="2.5"/>
</svg>;}

/** Pantry contents only. The parent owns modal focus, dismissal and navigation. */
export function PantryShelf({state,send,close,openRecipes}:PantryShelfProps){
  const owned=INGREDIENTS.filter(ingredient=>(state.pantry[ingredient.id]??0)>0);
  const total=owned.reduce((sum,ingredient)=>sum+state.pantry[ingredient.id],0);
  const remaining=Math.max(0,DINER_RULES.ingredientMaximum-state.daily.minted);
  const full=remaining<1;
  const crop=INGREDIENT_BY_ID[state.home.garden.ingredientId];
  // Read the already-settled game clock, including the server offset for connected diners.
  const gardenWait=Math.max(0,8*DINER_RULES.hourMs-(state.updatedAt-state.home.garden.plantedAt));
  const gardenReason=state.daily.garden?'Harvested today':full?'Daily allowance collected':gardenWait>0?`Ready in ${timeLeft(gardenWait)}`:'';
  const marketNote=state.daily.market?'You’ve chosen today’s ingredient. Three fresh offers arrive tomorrow.':full?'You’ve collected today’s ingredient allowance. Fresh offers arrive tomorrow.':'Choose one of today’s three ingredients. Each offer adds one to your pantry.';

  return <div className={css.pantry}>
    <div className={css.shelfHeading}>
      <div><span className={css.eyebrow}>Saved for something delicious</span><h3>On your shelves <span>{number(total)}</span></h3></div>
      <span className={css.varieties}>{owned.length} {owned.length===1?'kind':'kinds'}</span>
    </div>

    {owned.length?<ul className={css.inventory} aria-label="Ingredients in your pantry">
      {owned.map(ingredient=><li className={css.ingredient} key={ingredient.id}>
        <span className={css.quantity} aria-label={`${number(state.pantry[ingredient.id])} in your pantry`}>×{number(state.pantry[ingredient.id])}</span>
        <IngredientArt id={ingredient.id} size={68}/><strong>{ingredient.name}</strong>
      </li>)}
    </ul>:<div className={css.emptyShelf}>
      <div className={css.emptyArt}><IngredientArt id="beef" size={70}/><IngredientArt id="bun" size={70}/><IngredientArt id="tomato" size={58}/></div>
      <strong>A little room for delicious things</strong>
      <p>{!state.tutorial.crateClaimed?'Your first parcel has beef and a bun for your first burger upgrade.':'Ingredients you discover wait here until you use them to improve a recipe.'}</p>
    </div>}

    <section className={`${css.parcel} ${state.daily.crate?css.parcelOpened:''}`} aria-label="Daily ingredient parcel">
      <div className={css.parcelArt}><ParcelArt/>{state.daily.crate&&<span className={css.receipt}><DinerIcon name="check" size={15}/></span>}</div>
      <div className={css.parcelCopy}><span className={css.eyebrow}>A little delivery</span><h3>{state.daily.crate?'Today’s parcel is unpacked':'Your parcel is waiting'}</h3>
        <p>{state.daily.crate?'Today’s two ingredients are collected. A fresh parcel arrives tomorrow.':remaining<DINER_RULES.sourceAllowances.crate?'This parcel needs two spaces in your daily ingredient allowance.':'Find it by your restaurant entrance. Peel the golden tape, then open each flap.'}</p>
      </div>
      {!state.daily.crate&&<button type="button" className={css.parcelButton} onClick={close}>Back to my parcel<DinerIcon name="arrow" size={16}/></button>}
    </section>

    <section className={css.market} aria-label="Daily ingredient market">
      <div className={css.marketHeading}><div><span className={css.eyebrow}>Fresh picks</span><h3>Today’s market</h3></div><span className={css.wallet}><DinerIcon name="coin" size={18}/>{number(state.coins)}</span></div>
      <p className={css.marketNote}>{marketNote}</p>
      <div className={css.offers}>
        {state.daily.marketOffers.map(id=>{
          const ingredient=INGREDIENT_BY_ID[id];if(!ingredient)return null;
          const cost=DINER_RULES.marketPrices[ingredient.rarity],shortfall=Math.max(0,cost-state.coins);
          const reason=state.daily.market?'Come back tomorrow':full?'Daily allowance collected':shortfall>0?`Need ${number(shortfall)} more coins`:'';
          return <article className={css.offer} key={id}>
            <span className={`${css.rarity} ${ingredient.rarity==='rare'?css.rare:ingredient.rarity==='uncommon'?css.uncommon:''}`}>{ingredient.rarity}</span>
            <div className={css.offerArt}><IngredientArt id={id} size={86}/></div>
            <h4>{ingredient.name}</h4><p>{number(state.pantry[id]??0)} on your shelf</p>
            <button type="button" className={css.buy} disabled={!!reason} aria-label={`Buy one ${ingredient.name} for ${number(cost)} coins${reason?`. ${reason}`:''}`} aria-describedby={`pantry-offer-${id}`} onClick={()=>{if(!reason)send({type:'buyIngredient',ingredientId:id});}}><DinerIcon name="coin" size={17}/>{number(cost)}</button>
            <small id={`pantry-offer-${id}`} className={css.offerReason}>{reason||'One fresh ingredient'}</small>
          </article>;
        })}
      </div>
    </section>

    {state.restaurantLevel>=3&&crop&&<section className={css.garden} aria-label="Your garden harvest">
      <div className={css.gardenArt}><IngredientArt id={crop.id} size={58}/><DinerIcon name="leaf" size={19}/></div>
      <div><span className={css.eyebrow}>Grown with a little patience</span><h3>{crop.name} patch</h3><p>{state.daily.garden?'Your next daily harvest is tomorrow.':full?'Today’s shared ingredient allowance is collected.':gardenWait>0?`Growing · ready in ${timeLeft(gardenWait)}`:'One fresh ingredient is ready to pick.'}</p></div>
      <button type="button" className={css.harvest} disabled={!!gardenReason} title={gardenReason||undefined} aria-label={`Harvest ${crop.name}${gardenReason?`. ${gardenReason}`:''}`} onClick={()=>{if(!gardenReason)send({type:'harvestGarden'});}}>{state.daily.garden?'Collected':gardenWait>0?'Growing':'Harvest'}<DinerIcon name={state.daily.garden?'check':gardenWait>0?'clock':'leaf'} size={16}/></button>
    </section>}

    <div className={css.dailyAllowance}>
      <div><strong>{state.daily.minted} / {DINER_RULES.ingredientMaximum} ingredients found today</strong><span>All ingredient discoveries share this daily allowance.</span></div>
      <div className={css.allowancePips} role="progressbar" aria-label="Daily ingredients collected" aria-valuemin={0} aria-valuemax={DINER_RULES.ingredientMaximum} aria-valuenow={state.daily.minted}>{Array.from({length:DINER_RULES.ingredientMaximum},(_,index)=><span key={index} className={index<state.daily.minted?css.filledPip:undefined}/>)}</div>
    </div>
    <button type="button" className={css.recipeButton} onClick={openRecipes}><DinerIcon name="book" size={22}/><span>Make a recipe your own<small>Use your ingredients in the recipe binder</small></span><DinerIcon name="arrow" size={19}/></button>
  </div>;
}
