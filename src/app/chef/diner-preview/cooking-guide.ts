import { EQUIPMENT_BY_ID, INGREDIENT_BY_ID, RECIPE_BY_ID, ingredientSupply } from '@/lib/chef/diner/content';
import { BATCH_RULES, recipeVessel, SERVING_VESSELS } from '@/lib/chef/diner/batch';
import { serviceRecipeSteps } from '@/lib/chef/diner/service';
import type { DinerState } from '@/lib/chef/diner/progression';

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
  const recipe=RECIPE_BY_ID[recipeId];if(!recipe)return [];
  const service=state.run?.service??state.rally.service;
  const physical=service?service.config.physicalSupplies:true,batches=service?!!service.config.batchVersion:true;
  const ingredient=(id:string)=>`${INGREDIENT_BY_ID[id].name.toLowerCase()} from the ${ingredientSupply(id)==='fridge'?'fridge':'pantry'}`;
  const steps=[physical?`Take ${ingredient(recipe.ingredients[0])}.`:`Take ${recipe.name.toLowerCase()} ingredients from the pantry.`];
  for(const step of service?serviceRecipeSteps(service,recipeId):recipe.steps){
    const action=physical&&step.station==='prep'&&recipe.assemblyIngredients?.length
      ?`Leave the cooked food on the prep counter. Fetch ${recipe.assemblyIngredients.map(ingredient).join(' and ')} one at a time and combine them.`
      :`${step.label} at the ${EQUIPMENT_BY_ID[step.station].name.toLowerCase()}.`;
    steps.push(`${action} ${step.action==='hold'?'Hold the nearby work control or E.':'You can do another job while it cooks.'}${step.station==='boiler'?' When ready, tap to lift and drain the basket. Tap again to take the noodles to prep.':''}`);
  }
  if(physical){
    if(recipeId==='fries'&&batches){
      steps.push(`Tap the ready fryer to raise its basket. One batch makes ${BATCH_RULES.friesPortions} orders.`,'Take an empty fries box and bring it to the raised basket for one portion.');
    }else{
      const vessel=batches?SERVING_VESSELS[recipeVessel(recipeId)].name:'plate';
      steps.push(`Leave the finished food at its station. Take a clean ${vessel} from its stand and bring it to the food.`);
    }
  }
  steps.push('Pick up the order and tap the guest’s table.',physical&&batches&&recipeId==='fries'?'Clear the used carton and take it to the bin.':'Clear the used dish. Wash it in the sink to refill your limited supply.');
  return steps;
}
