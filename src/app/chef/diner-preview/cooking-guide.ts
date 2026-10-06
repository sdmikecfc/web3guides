import { EQUIPMENT_BY_ID, INGREDIENT_BY_ID, RECIPE_BY_ID, ingredientSupply } from '@/lib/chef/diner/content';
import { BATCH_RULES, recipeVessel, SERVING_VESSELS } from '@/lib/chef/diner/batch';
import { serviceRecipeSteps } from '@/lib/chef/diner/service';
import type { DinerState } from '@/lib/chef/diner/progression';
import type { ServiceState } from '@/lib/chef/diner/types';

/** Loaned rally recipes come from the current service, not permanent ownership. */
export function cookingGuideMenu(state:DinerState):string[] {
  const ids=state.run?.service?.config.menu??state.rally.service?.config.menu??state.run?.menu??Object.keys(state.recipes);
  return [...new Set(ids)].filter(id=>Object.hasOwn(RECIPE_BY_ID,id));
}

export function cookingGuideRecipe(state:DinerState,requested?:string|null):string {
  const menu=cookingGuideMenu(state);
  return requested&&menu.includes(requested)?requested:menu[0]??'classic_burger';
}

/** Describe the physical rules of this checkpoint, including older services. */
export function cookingGuideSteps(state:DinerState,recipeId:string):string[] {
  return serviceCookingSteps(state.run?.service??state.rally.service,recipeId);
}
export function serviceCookingSteps(service:ServiceState|null|undefined,recipeId:string):string[] {
  const recipe=RECIPE_BY_ID[recipeId];if(!recipe)return [];
  const physical=service?service.config.physicalSupplies:true,batches=service?!!service.config.batchVersion:true;
  const ingredient=(id:string)=>`${INGREDIENT_BY_ID[id].name.toLowerCase()} from the ${ingredientSupply(id)==='fridge'?'fridge':'pantry'}`;
  const steps=[physical?`Take ${ingredient(recipe.ingredients[0])}.`:`Take ${recipe.name.toLowerCase()} ingredients from the pantry.`];
  for(const [index,step] of (service?serviceRecipeSteps(service,recipeId):recipe.steps.filter(step=>recipeId!=='chicken_ramen'||step.station!=='grill')).entries()){
    // Plain fries can be boxed directly from the raised basket. The shared
    // component's optional assembly step is not another required prep action.
    if(physical&&batches&&recipeId==='fries'&&step.output==='prepared_fries')continue;
    const action=physical&&step.station==='prep'&&recipe.assemblyIngredients?.length&&(recipeId!=='cheese_fries'||index>0)&&(recipe.assemblyStep===undefined||recipe.assemblyStep===index)
      ?`Leave the cooked food on the prep counter. Fetch ${recipe.assemblyIngredients.map(ingredient).join(' and ')} one at a time and combine them.`
      :`${step.label} at the ${EQUIPMENT_BY_ID[step.station].name.toLowerCase()}.`;
    if(recipeId==='chicken_ramen'&&step.station==='prep')steps.push('Take chicken from the fridge, grill it separately, and add the cooked chicken to your noodles. Raw chicken cannot be added.');
    if(recipeId==='cheese_fries'&&step.station==='prep'&&index>0)steps.push('Raise the finished fryer basket. With empty hands, take one of its three portions to prep and choose Cheese fries.');
    steps.push(`${action}${step.action==='hold'?' Hold the nearby work control or E.':step.action==='instant'?'':' You can do another job while it cooks.'}${step.station==='boiler'?' When ready, tap to lift and drain the basket. Tap again to take the noodles to prep.':''}`);
  }
  if(physical){
    if(recipeId==='house_red'){
      steps.push('One opened bottle serves six glasses. Take a clean glass from the cup stand, then tap the bottle to pour one serving.');
    }else if(recipeId==='fries'&&batches){
      steps.push(`Tap the ready fryer to raise its basket. One batch makes ${BATCH_RULES.friesPortions} orders.`,'Bring an empty fries box to the basket, or take a fries portion to the box supply.');
    }else{
      const vessel=batches?SERVING_VESSELS[recipeVessel(recipeId)].name:'plate';
      steps.push(`Bring a clean ${vessel} to the finished food, or take the food to the ${vessel} supply. Either order works.`);
    }
  }
  if(recipeId==='steamed_mandu')steps.splice(2,0,'Each basket makes three portions. Take one with empty hands; the rest stay in the steamer. Finish each portion with dipping sauce at prep.');
  steps.push('Pick up the order and tap the guest’s table.',physical&&batches&&['fries','cheese_fries'].includes(recipeId)?'Clear the used carton and take it to the bin.':'Clear the used dish. Wash it in the sink to refill your limited supply.');
  return steps;
}
