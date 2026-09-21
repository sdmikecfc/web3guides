import { roadsideShopVisit, recipeEquipmentNeeded, type DinerState, type DinerCommand } from '@/lib/chef/diner/progression';
import { EQUIPMENT_BY_ID, RECIPES, RECIPE_BY_ID, isHomeEquipmentAvailable } from '@/lib/chef/diner/content';
import { ModelIcon } from './ModelIcon';
import css from './recipe-learning.module.css';

const names=(ids:string[])=>ids.map(id=>EQUIPMENT_BY_ID[id]?.name??id).join(', ');
const coins=(value:number)=>Math.floor(value).toLocaleString('en-US');
export const equipmentDisplayName=(id:string,tier=1)=>id==='pass'?(tier>=2?'Warming counter':'Holding counter'):EQUIPMENT_BY_ID[id]?.name??id;
export function recipeEquipmentHint(state:DinerState,recipeId:string):string{
  const missing=recipeEquipmentNeeded(state,recipeId),supplies=missing.filter(id=>['cups','bowls','boxes'].includes(id)),machines=missing.filter(id=>!supplies.includes(id));
  return missing.length?[machines.length?`Still to find: ${names(machines)}.`:'',supplies.length?`Buy ${names(supplies)} in the preparation shop.`:''].filter(Boolean).join(' '):'Equipment owned. Arrange it before opening.';
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
  if(id==='fryer'&&tier>=3)return `${spec.capacity} cooking slots. Raises ready fries baskets automatically; food will not burn.`;
  if(id==='boiler')return `${spec.capacity} cooking ${spec.capacity===1?'slot':'slots'}. ${tier>1?'Faster boiling. ':''}Lift and drain the basket when ready.`;
  if(id==='pass')return tier>=2?`${spec.capacity} holding spots and heat lamps. Keeps finished dishes warm; does not cook or reheat cold food.`:`${spec.capacity} spots for ingredients, food and clean or dirty dishes. Frees your hands; no heating.`;
  if(id==='oven'&&spec.warm)return `${spec.capacity} cooking slots. Faster baking; finished dishes stay warm.`;
  if(spec.noBurn)return `${spec.capacity} cooking slots. Faster cooking; food will not burn.`;
  return `${spec.capacity} ${id==='prep'?'work':'cooking'} ${spec.capacity===1?'slot':'slots'}.${tier>1?' Works faster.':''}`;
}

/** A short explanation in the existing cookbook or preparation shelf. */
export function RecipeLearning({state,compact=false}:{state:DinerState;compact?:boolean}){
  const waiting=RECIPES.filter(recipe=>state.recipes[recipe.id]).map(recipe=>({recipe,missing:recipeEquipmentNeeded(state,recipe.id)})).find(item=>item.missing.length>0);
  return <section className={`${css.learning} ${compact?css.compact:''}`} aria-label="Discover recipes on the road">
    <div className={css.heading}><h3>Find your next favourite</h3><p>The first roadside market sells equipment and upgrades. From the second market, look for paid recipe finds too. Each visit has a small changing selection.</p></div>
    {!compact&&<p className={css.note}>A machine and its recipe are separate finds. Keep either while you hunt for the other. Then arrange your truck and choose what goes on today&apos;s menu.</p>}
    {waiting&&!compact&&<p className={css.waiting}><strong>{waiting.recipe.name} is learned.</strong> {recipeEquipmentHint(state,waiting.recipe.id)}</p>}
  </section>;
}

/** The real randomized market; buying never changes the player's chosen menu. */
export function RoadsideMarket({state,send}:{state:DinerState;send:(command:DinerCommand)=>boolean}){
  const run=state.run;if(!run)return null;
  const visit=roadsideShopVisit(state);
  return <section className={css.market} aria-label="Roadside finds">
    <div className={css.heading}><h3>{visit<2?'A few useful finds':'Something new for your kitchen'}</h3><p>{visit<2?'Equipment and upgrades today. Your second market starts offering recipes too.':'A changing mix of equipment, upgrades and recipes. Take what suits your next menu.'} Spend the coins carried on this trip; purchases stay yours.</p></div>
    <div className={css.marketCards}>{run.offers.map(offer=>{
      const recipe=offer.kind==='recipe'?RECIPE_BY_ID[offer.target]:undefined;
      const equipment=EQUIPMENT_BY_ID[offer.target];
      const targetTier=(state.equipment[offer.target]?.tier??1)+(offer.kind==='upgrade'&&!offer.purchased?1:0);
      const missing=recipe?recipeEquipmentNeeded(state,recipe.id):[];
      const dishes=equipment?RECIPES.filter(dish=>dish.steps.some(step=>step.station===equipment.id)):[];
      const learned=dishes.filter(dish=>state.recipes[dish.id]);
      const homeCopy=equipment&&isHomeEquipmentAvailable(equipment.id)&&['cooking','prep','cleaning'].includes(equipment.family);
      const affordable=run.haul>=offer.price;
      const title=recipe?.name??(equipment?equipmentDisplayName(equipment.id,targetTier):'Ingredient parcel');
      return <article className={css.find} key={offer.id} aria-label={title}>
        <div className={css.art}><ModelIcon kind={recipe?'food':offer.kind==='ingredients'?'crate':offer.target} recipeId={recipe?.id} tier={targetTier} label={title} size={172}/>{offer.purchased&&<span className={css.kept}>Yours to keep</span>}</div>
        <div className={css.findBody}><span className={css.category}>{offer.kind==='recipe'?'Recipe':offer.kind==='upgrade'?`Upgrade · tier ${targetTier}`:offer.kind==='ingredients'?'Mastery ingredients':'Equipment'}</span><h4>{title}</h4>
          {recipe?<><p>{recipe.steps.map(step=>step.label).join(' → ')}.</p><p className={missing.length?css.needs:css.ready}>{recipeEquipmentHint(state,recipe.id)}</p><small>Recipe only. Add it to your menu when you are ready.</small></>:equipment?<><p>{equipmentUpgradeDescription(equipment.id,targetTier)}</p>{dishes.length>0&&<p className={css.needs}>{learned.length?`For your ${learned.map(dish=>dish.name.toLowerCase()).join(', ')}.`:`Try it with ${dishes.slice(0,2).map(dish=>dish.name.toLowerCase()).join(' or ')}. Recipes sold separately.`}</p>}<small>{offer.kind==='upgrade'?'Improves your owned equipment. No extra machine copy.':homeCopy?'First discovery includes one restaurant copy in storage. Recipe sold separately.':'Truck item. No restaurant copy included.'}</small></>:<p>Permanent ingredients for upgrading your recipes.</p>}
          <button type="button" disabled={offer.purchased||!affordable} onClick={()=>send({type:'buyOffer',offerId:offer.id})}>{offer.purchased?'Bought':`Buy ${recipe?'recipe':offer.kind==='upgrade'?'upgrade':'find'} · ${coins(offer.price)} coins`}</button>
          {!offer.purchased&&!affordable&&<span className={css.priceNote}>Need {coins(offer.price-run.haul)} more carried coins</span>}
        </div>
      </article>;
    })}</div>
    <p className={css.note}>Nothing gets added to your menu automatically. Unused machines can wait in your trailer.</p>
  </section>;
}
