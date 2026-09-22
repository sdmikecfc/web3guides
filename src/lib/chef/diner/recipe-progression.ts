/** Legacy kit receipts remain owned; new discoveries are independent road purchases. */
import { RECIPE_BY_ID, ingredientSupply } from './content';
import { recipeVessel, vesselSupplyStation } from './batch';
import type { DinerState } from './progression';

/** Historical metadata only: these thresholds no longer gate any purchase. */
export const RECIPE_KIT_RULES={version:1,pastaServices:1,ramenPastaPlates:3} as const;
export const RECIPE_KITS=[
  {kitId:'pasta_starter',name:'A little pasta kitchen',recipeId:'tomato_pasta',price:320,equipmentIds:['boiler','bowls'],homeEquipmentIds:['boiler'],description:'Tomato pasta, a boiler and a bowl rack. Includes one boiler for your restaurant.'},
  {kitId:'ramen_starter',name:'Noodle night',recipeId:'vegetable_ramen',price:140,equipmentIds:[],homeEquipmentIds:[],description:'Learn vegetable ramen using your existing boiler and prep counter. No new machine needed.'},
] as const;
export type RecipeKitId=typeof RECIPE_KITS[number]['kitId'];
export interface RecipeProgression {version:1;claimedKits:RecipeKitId[]}
export function createRecipeProgression():RecipeProgression{return {version:1,claimedKits:[]};}
export function sanitizeRecipeProgression(value:unknown):RecipeProgression|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const item=value as RecipeProgression;
  if(Object.keys(item).some(key=>!['version','claimedKits'].includes(key))||item.version!==1||!Array.isArray(item.claimedKits)||item.claimedKits.length>RECIPE_KITS.length||new Set(item.claimedKits).size!==item.claimedKits.length||item.claimedKits.some(id=>!RECIPE_KITS.some(kit=>kit.kitId===id)))return null;
  return {version:1,claimedKits:[...item.claimedKits]};
}
export const isKitRecipe=(id:string):boolean=>RECIPE_KITS.some(kit=>kit.recipeId===id);
export const isKitEquipment=(id:string):boolean=>RECIPE_KITS.some(kit=>(kit.equipmentIds as readonly string[]).includes(id));
export interface RecipeKitOffer {kitId:RecipeKitId;name:string;recipeId:string;price:number;equipmentIds:readonly string[];description:string;available:boolean;reason:string|null;owned:boolean;unlocked:boolean;progress:number;target:number;progressLabel:string}

/** Compatibility for older callers. Kits are no longer offered or purchasable. */
export function recipeKitOffers(_state:Pick<DinerState,'career'|'recipes'|'recipeProgression'|'equipment'|'run'|'rally'|'coins'>):RecipeKitOffer[]{return [];}

/** Buying a recipe is allowed before finding these pieces. Installation and
 * menu selection remain separate decisions before the next service. */
export function recipeEquipmentNeeded(state:Pick<DinerState,'equipment'>,recipeId:string):string[]{
  const recipe=RECIPE_BY_ID[recipeId];if(!recipe)return [];
  const vessel=vesselSupplyStation(recipeVessel(recipeId));
  const supplies=[recipe.ingredients[0],...(recipe.assemblyIngredients??[])].map(ingredientSupply);
  return [...new Set([...recipe.steps.map(step=>step.station),...supplies,...(vessel?[vessel]:[])])].filter(id=>!state.equipment[id]?.truckOwned);
}

/** Kit dishes follow the installed kitchen. The home simulation applies real
 * working-position/routing checks before accepting an order or paying a sale. */
export function autoHomeRecipeIds(state:Pick<DinerState,'recipes'|'home'>):string[]{
  const machines=new Set(state.home.layout.map(item=>item.equipmentId));
  return RECIPE_KITS.map(kit=>kit.recipeId).filter(id=>Object.hasOwn(state.recipes,id)&&RECIPE_BY_ID[id]?.steps.every(step=>machines.has(step.station)));
}
