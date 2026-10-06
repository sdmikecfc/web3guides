import { roadsideShopVisit, recipeEquipmentNeeded, truckMenuCapacity, truckMenuEditError, type DinerState, type DinerCommand } from '@/lib/chef/diner/progression';
import { EQUIPMENT_BY_ID, INGREDIENT_BY_ID, RECIPES, RECIPE_BY_ID, isHomeEquipmentAvailable } from '@/lib/chef/diner/content';
import { ModelIcon } from './ModelIcon';
import css from './recipe-learning.module.css';

const names=(ids:string[])=>ids.map(id=>EQUIPMENT_BY_ID[id]?.name??id).join(', ');
const coins=(value:number)=>Math.floor(value).toLocaleString('en-US');
export const equipmentDisplayName=(id:string,tier=1)=>id==='pass'?(tier>=2?'Warming counter':'Holding counter'):EQUIPMENT_BY_ID[id]?.name??id;
export function recipeEquipmentHint(state:DinerState,recipeId:string):string{
  const missing=recipeEquipmentNeeded(state,recipeId),supplies=missing.filter(id=>['cups','bowls','boxes'].includes(id)),machines=missing.filter(id=>!supplies.includes(id));
  if(missing.length===2&&machines.includes('fryer')&&supplies.includes('boxes'))return 'Needs a fryer. Fries boxes are included.';
  return missing.length?[machines.length?`Still to find: ${names(machines)}.`:'',supplies.length?`Buy ${names(supplies)} at roadside markets.`:''].filter(Boolean).join(' '):'Equipment owned. Arrange it before opening.';
}

/** Copy describes implemented truck behavior, not aspirational appliance names. */
export function equipmentUpgradeDescription(id:string,tier:number):string{
  const spec=EQUIPMENT_BY_ID[id]?.tiers.find(item=>item.tier===tier);
  if(!spec)return 'A permanent equipment upgrade.';
  if(id==='crate')return 'Freely supplied dry ingredients for your chosen menu.';
  if(id==='fridge')return 'Freely supplied chilled ingredients for your chosen menu.';
  if(id==='bin')return 'Dispose of used fries boxes and food you no longer need.';
  if(id.startsWith('table_'))return `Room for ${spec.capacity} ${spec.capacity===1?'customer':'customers'}. ${tier>1?'Guests finish eating 20% sooner.':'Place on the pavement.'}`;
  if(id==='sink')return tier>=3?`Automatically washes up to ${spec.capacity} dirty dishes.`:`Holds ${spec.capacity} dirty dishes. Hold to wash.`;
  if(['plates','bowls','cups'].includes(id))return `Holds ${spec.capacity} clean ${id==='plates'?'plates':id==='bowls'?'bowls':'cups'}. Wash used ones to refill it.`;
  if(id==='boxes')return 'A supply of disposable fries boxes. Used boxes go in the bin.';
  if(id==='blender'&&tier>=2)return `${spec.capacity} mixing ${spec.capacity===1?'slot':'slots'}. Blends while you do another job.`;
  if(id==='drinks'&&tier>=2)return 'Fills drinks instantly when you use it.';
  if(id==='fryer')return `${spec.capacity} ${spec.capacity===1?'basket':'baskets'} · 3 portions each. ${tier>=3?'Raises ready baskets automatically.':'Raise each basket when ready.'}`;
  if(id==='boiler')return `${spec.capacity} simultaneous ${spec.capacity===1?'batch':'batches'}, ${tier+1} portions each. ${tier>1?'Faster boiling. ':''}Drain noodles; ladle soups into clean bowls.`;
  if(id==='steamer')return `${spec.capacity} steaming baskets · 3 portions each. Take one portion and finish it at prep. ${tier>1?'Steams faster.':''}`;
  if(id==='wine_station')return `${spec.capacity} bottle positions · 6 glasses per bottle. Uncork, then bring a clean glass to pour. Wash glasses after use.`;
  if(id==='juicer')return `${spec.capacity} pressing ${spec.capacity===1?'slot':'slots'}. ${tier>=2?'Presses while you do another job.':'Hold to press the fruit.'}`;
  if(id==='pass')return tier>=2?`${spec.capacity} holding spots and heat lamps. Keeps finished dishes warm; does not cook or reheat cold food.`:`${spec.capacity} spots for ingredients, food and clean or dirty dishes. Frees your hands; no heating.`;
  if(id==='oven'&&spec.warm)return `${spec.capacity} cooking slots. Faster baking; finished dishes stay warm.`;
  if(spec.noBurn)return `${spec.capacity} cooking slots. Faster cooking; food will not burn.`;
  return `${spec.capacity} ${id==='prep'?'work':'cooking'} ${spec.capacity===1?'slot':'slots'}.${tier>1?' Works faster.':''}`;
}

/** A short explanation in the existing cookbook or preparation shelf. */
export function RecipeLearning({state,compact=false}:{state:DinerState;compact?:boolean}){
  const waiting=RECIPES.filter(recipe=>state.recipes[recipe.id]).map(recipe=>({recipe,missing:recipeEquipmentNeeded(state,recipe.id)})).find(item=>item.missing.length>0);
  return <section className={`${css.learning} ${compact?css.compact:''}`} aria-label="Discover recipes on the road">
    <div className={css.heading}><h3>Find your next favourite</h3><p>Downtown’s first market follows lunch three and stocks fries plus a fryer. Later markets depend on your route. Spend carried coins on equipment and new recipes.</p></div>
    {!compact&&<p className={css.note}>A machine and its recipe are separate finds. Keep either while you hunt for the other. Then arrange your truck and choose what goes on today&apos;s menu.</p>}
    {waiting&&!compact&&<p className={css.waiting}><strong>{waiting.recipe.name} is learned.</strong> {recipeEquipmentHint(state,waiting.recipe.id)}</p>}
  </section>;
}

/** The real randomized market; buying never changes the player's chosen menu. */
export function RoadsideMarket({state,send,openRecipe}:{state:DinerState;send:(command:DinerCommand)=>boolean;openRecipe?:(recipeId:string)=>void}){
  const run=state.run;if(!run)return null;
  const visit=roadsideShopVisit(state);
  const friesReady=!!state.recipes.fries&&!recipeEquipmentNeeded(state,'fries').length;
  const friesChosen=run.menu.includes('fries'),menuFull=run.menu.length>=truckMenuCapacity(state);
  return <section className={css.market} aria-label="Roadside finds">
    <div className={css.heading}><h3>{visit<2?'A few useful finds':'Something new for your kitchen'}</h3><p>Spend carried coins. Your finds stay yours.</p></div>
    {run.routeId==='downtown'&&visit===1&&<p>Fries recipe: {state.recipes.fries?'Owned':'140 coins'} · Fryer: {state.equipment.fryer?.truckOwned?'Owned':'160 coins'} · Free boxes with the fryer. One basket makes three orders.</p>}
    {friesReady&&!friesChosen&&visit===1&&!run.offers.some(o=>o.kind==='recipe'&&o.target==='fries')&&<section className={css.cookNext} aria-label="Cook your fries"><strong>Ready to cook fries</strong><p>Potatoes are free in the pantry. Load the fryer and boxes at your next stop.</p><button type="button" disabled={!!truckMenuEditError(state)} onClick={()=>menuFull?openRecipe?.('fries'):send({type:'setTruckMenu',recipeIds:[...run.menu,'fries']})}>{menuFull?'Edit next service’s menu':'Add to next service’s menu'}</button></section>}
    <div className={css.marketCards}>{run.offers.filter(o=>!(o.target==='boxes'&&o.price===0&&(state.equipment.boxes?.truckOwned||run.offers.some(f=>f.target==='fryer'&&f.kind==='equipment')))).sort((a,b)=>{const rank=(id:string)=>run.routeId==='downtown'&&visit===1?(id==='recipe:fries'?0:id==='equipment:fryer'?1:2):2;return rank(a.id)-rank(b.id);}).map(offer=>{
      const recipe=offer.kind==='recipe'?RECIPE_BY_ID[offer.target]:undefined;
      const ingredientRecipe=offer.kind==='ingredients'&&offer.id.startsWith('ingredients:recipe:')?RECIPE_BY_ID[offer.target]:undefined;
      const equipment=EQUIPMENT_BY_ID[offer.target];
      const targetTier=(state.equipment[offer.target]?.tier??1)+(offer.kind==='upgrade'&&!offer.purchased?1:0);
      const missing=recipe?recipeEquipmentNeeded(state,recipe.id):[];
      const dishes=equipment?RECIPES.filter(dish=>dish.steps.some(step=>step.station===equipment.id)):[];
      const learned=dishes.filter(dish=>state.recipes[dish.id]);
      const homeCopy=equipment&&isHomeEquipmentAvailable(equipment.id)&&['cooking','prep','cleaning'].includes(equipment.family);
      const affordable=run.haul>=offer.price;
      const title=recipe?.name??(equipment?equipmentDisplayName(equipment.id,targetTier):ingredientRecipe?`${ingredientRecipe.name} upgrade ingredients`:'Ingredient parcel');
      return <article className={css.find} key={offer.id} aria-label={title}>
        <div className={css.art}><ModelIcon kind={recipe||ingredientRecipe?'food':offer.kind==='ingredients'?'crate':offer.target} recipeId={recipe?.id??ingredientRecipe?.id} tier={targetTier} label={title} size={172}/>{offer.purchased&&<span className={css.kept}>Yours to keep</span>}</div>
        <div className={css.findBody}><span className={css.category}>{offer.kind==='recipe'?'Recipe':offer.kind==='upgrade'?`Upgrade · tier ${targetTier}`:offer.kind==='ingredients'?'Mastery ingredients':'Equipment'}</span><h4>{title}</h4>
          {recipe?<><p>{recipe.steps.map(step=>step.label).join(' → ')}.</p><p className={missing.length?css.needs:css.ready}>{recipeEquipmentHint(state,recipe.id)}</p>{recipe.id==='fries'&&offer.purchased&&!missing.length&&<p>Potatoes are free in the pantry.</p>}</>:equipment?<><p>{equipmentUpgradeDescription(equipment.id,targetTier)}</p>{dishes.length>0&&<details><summary>Recipe support</summary><p className={css.needs}>{learned.length?`For your ${learned.map(dish=>dish.name.toLowerCase()).join(', ')}.`:`Try it with ${dishes.slice(0,2).map(dish=>dish.name.toLowerCase()).join(' or ')}. Recipes sold separately.`}</p></details>}<details><summary>What’s included</summary><small>{offer.kind==='upgrade'?'Improves your owned equipment. No extra machine copy.':homeCopy?'First discovery includes one restaurant copy in storage. Recipe sold separately.':'Truck item. No restaurant copy included.'}</small></details></>:ingredientRecipe?<><p>One complete ingredient set for a permanent {ingredientRecipe.name.toLowerCase()} upgrade.</p><p>{ingredientRecipe.ingredients.map(id=>`1 × ${INGREDIENT_BY_ID[id].name}`).join(' · ')}</p><small>Added to your pantry. Use in the cookbook when you are ready; buying does not spend the ingredients.</small></>:<p>Permanent ingredients for upgrading your recipes.</p>}
          {recipe&&offer.purchased&&!missing.length?<button type="button" disabled={run.menu.includes(recipe.id)||!!truckMenuEditError(state)} onClick={()=>menuFull?openRecipe?.(recipe.id):send({type:'setTruckMenu',recipeIds:[...run.menu,recipe.id]})}>{run.menu.includes(recipe.id)?'On your truck menu':menuFull?'Edit next service’s menu':'Add to next service’s menu'}</button>:<button type="button" disabled={offer.purchased||!affordable} onClick={()=>send({type:'buyOffer',offerId:offer.id})}>{offer.purchased?'Bought':`Buy ${recipe?'recipe':offer.kind==='upgrade'?'upgrade':'find'} · ${coins(offer.price)} coins`}</button>}
          {ingredientRecipe&&<small>Upgrade this dish at home in Menu & recipes.</small>}
          {!offer.purchased&&!affordable&&<span className={css.priceNote}>Need {coins(offer.price-run.haul)} more carried coins</span>}
        </div>
      </article>;
    })}</div>

  </section>;
}
