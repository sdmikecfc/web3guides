import { INGREDIENT_BY_ID, RECIPE_BY_ID, recipePrice } from '@/lib/chef/diner/content';
import { DINER_RULES, type DinerState, type DinerCommand } from '@/lib/chef/diner/progression';
import { IngredientArt } from './IngredientArt';
import { DinerIcon } from './DinerIcon';
import css from './recipe-upgrade.module.css';

export function recipeUpgradeDetails(state:DinerState,recipeId:string){
  const recipe=RECIPE_BY_ID[recipeId],owned=state.recipes[recipeId];if(!recipe||!owned)return null;
  const level=owned.level,mastered=level>=DINER_RULES.maxDishLevel;
  const ingredients=recipe.ingredients.map(id=>({id,name:INGREDIENT_BY_ID[id]?.name??id,have:state.pantry[id]??0,need:1}));
  return {name:recipe.name,level,mastered,ingredients,ready:!mastered&&ingredients.every(item=>item.have>=item.need),price:recipePrice(recipeId,level),nextPrice:recipePrice(recipeId,level+1)};
}

/** The same ingredient-funded upgrade command as the cookbook, beside cooking help. */
export function RecipeUpgrade({state,recipeId,send,openBook}:{state:DinerState;recipeId:string;send:(command:DinerCommand)=>boolean;openBook:()=>void}){
  const upgrade=recipeUpgradeDetails(state,recipeId);
  if(state.rally.service)return <aside className={css.note}>This rally loans everyone the same recipe levels. Permanent upgrades do not change the rally. {upgrade&&<button type="button" onClick={openBook}>View your own recipe</button>}</aside>;
  if(!upgrade)return null;
  return <section className={css.card} aria-label={`Upgrade ${upgrade.name}`}>
    <div className={css.heading}><DinerIcon name="star" size={24}/><div><h3>{upgrade.mastered?'Recipe mastered':`Make ${upgrade.name.toLowerCase()} worth more`}</h3><p>Permanent recipe level {upgrade.level}{!upgrade.mastered&&` → ${upgrade.level+1}`}</p></div></div>
    <p className={css.value}>{upgrade.price}{!upgrade.mastered&&<> → <strong>{upgrade.nextPrice}</strong></>} base coins per serving{!upgrade.mastered&&<b>+{upgrade.nextPrice-upgrade.price}</b>}</p>
    {!upgrade.mastered&&<><p className={css.cost}>Upgrade cost · one of each saved ingredient</p><ul className={css.ingredients}>{upgrade.ingredients.map(ingredient=><li key={ingredient.id} data-ready={ingredient.have>=ingredient.need}><IngredientArt id={ingredient.id} size={30}/><span>{ingredient.name}<small>Need {ingredient.need} · Have {ingredient.have}</small></span></li>)}</ul><button type="button" className={css.upgrade} disabled={!upgrade.ready} onClick={()=>send({type:'upgradeRecipe',recipeId})}>Upgrade recipe to level {upgrade.level+1}</button><p className={css.note}>{upgrade.ready?'Uses the pantry ingredients above. No coins needed.':'Collect the missing ingredients from parcels and roadside markets.'} {state.run?.service?'Applies to home and your next truck service. This service keeps its starting level.':'The improvement stays for future services.'}</p></>}
    <button type="button" className={css.book} onClick={openBook}><DinerIcon name="book" size={17}/>All recipe upgrades</button>
  </section>;
}
