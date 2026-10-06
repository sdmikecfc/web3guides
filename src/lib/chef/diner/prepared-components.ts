import {RECIPE_BY_ID} from './content';
import type {ServiceItem} from './types';

export type PreparedComponent='patty'|'fries'|'pasta'|'noodles'|'chicken';
export const COMPONENT_WARMTH=90*20;
export const COMPONENT_NAMES:Record<PreparedComponent,string>={patty:'Cooked patty',fries:'Fries portion',pasta:'Drained pasta',noodles:'Drained noodles',chicken:'Grilled chicken'};
export const RECIPE_FAMILIES={burgers:'Burgers',fried:'Fried sides',pasta:'Pasta',ramen:'Ramen',breakfast:'Breakfast',drinks:'Drinks',baked:'Baked treats',soups:'Soups'} as const;
export function recipeFamilies(id:string):(keyof typeof RECIPE_FAMILIES)[]{
  const recipe=RECIPE_BY_ID[id];if(!recipe)return [];
  const families:(keyof typeof RECIPE_FAMILIES)[]=[];if(id.endsWith('_soup'))families.push('soups');
  if(id.includes('burger')||id.includes('sandwich')||id==='hot_dog'||id==='grilled_cheese')families.push('burgers');
  if(recipe.steps.some(s=>s.station==='fryer'))families.push('fried');
  if(id.includes('pasta'))families.push('pasta');if(id.includes('ramen')||id==='spicy_ramyeon')families.push('ramen');
  if(['pancakes','strawberry_waffle','coffee','grilled_cheese'].includes(id))families.push('breakfast');
  if(recipe.course==='drink')families.push('drinks');if(recipe.steps.some(s=>s.station==='oven'||s.station==='waffle'))families.push('baked');
  return families;
}
export const COMPONENT_RECIPES:Record<Exclude<PreparedComponent,'chicken'>,readonly string[]>={
  patty:['classic_burger','cheeseburger','bbq_burger','avocado_burger'],
  fries:['fries','cheese_fries'],
  pasta:['tomato_pasta','pesto_pasta','creamy_mushroom_pasta'],
  noodles:['vegetable_ramen','chicken_ramen','spicy_miso_ramen','spicy_ramyeon'],
};
export function componentForOutput(output:string):PreparedComponent|undefined{
  return output==='cooked_patty'?'patty':output==='boiled_pasta'?'pasta':output==='boiled_noodles'?'noodles':output==='cooked_chicken'?'chicken':undefined;
}
export function compatibleAssemblies(menu:readonly string[],food:ServiceItem|null):string[]{
  const component=food?.preparedComponent;
  if(!component||component==='chicken'||food?.kind!=='processed'||food.stage.startsWith('prepared_')||food.stage.startsWith('plated_'))return [];
  return menu.filter(id=>COMPONENT_RECIPES[component].includes(id));
}
export function auxiliaryChicken(item:ServiceItem):boolean{return item.recipeId==='chicken_ramen'&&item.ingredientId==='chicken';}
