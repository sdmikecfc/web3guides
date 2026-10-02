/** Permanent achievements come only from completed, non-practice service receipts. */
import { RECIPE_BY_ID, ROUTES } from './content';
import type { DinerRun, DinerState } from './progression';

export interface DinerCareer {
  version:1; startedAt:number; services:number; introductory:number; plates:number;
  byRoute:Record<string,number>; byDifficulty:Record<string,number>; servedRecipes:Record<string,number>; multiRecipe:{two:number;three:number};
  receipts:string[]; ingredientClaims:string[];
}
export const CAREER_RULES={version:1,receiptLimit:2048,bundles:[
  {id:'first_lunches',services:3,sets:2}, {id:'steady_hands',services:10,sets:3},
  {id:'local_favourite',services:24,sets:4}, {id:'road_regular',services:45,sets:4},
  {id:'busy_kitchen',services:70,sets:5}, {id:'first_renovation',services:100,sets:5}, {id:'experienced_crew',services:140,sets:5},
  {id:'welcoming_everyone',services:180,sets:5}, {id:'restaurant_ready',services:200,sets:5},
]} as const;
export function createDinerCareer(now:number):DinerCareer{return {version:1,startedAt:now,services:0,introductory:0,plates:0,byRoute:{},byDifficulty:{},servedRecipes:{},multiRecipe:{two:0,three:0},receipts:[],ingredientClaims:[]};}
const own=(o:object,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
const count=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0&&(n as number)<=100_000_000;
function validCareerFields(c:DinerCareer):boolean{
  const record=(raw:unknown,keys:readonly string[])=>!!raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.entries(raw).every(([id,n])=>keys.includes(id)&&count(n));
  return record(c.byRoute,ROUTES.map(r=>r.id))&&record(c.byDifficulty,['slow','medium','busy','special','finale'])&&record(c.servedRecipes,Object.keys(RECIPE_BY_ID))&&c.multiRecipe&&count(c.multiRecipe.two)&&count(c.multiRecipe.three)&&c.multiRecipe.three<=c.multiRecipe.two&&c.multiRecipe.two<=c.services&&
    Array.isArray(c.receipts)&&c.receipts.length<=CAREER_RULES.receiptLimit&&new Set(c.receipts).size===c.receipts.length&&c.receipts.every(id=>typeof id==='string'&&id.length<=240)&&
    Array.isArray(c.ingredientClaims)&&new Set(c.ingredientClaims).size===c.ingredientClaims.length&&c.ingredientClaims.every(id=>CAREER_RULES.bundles.some(b=>b.id===id))&&
    Object.values(c.byRoute).reduce((a,b)=>a+b,0)===c.services&&Object.values(c.byDifficulty).reduce((a,b)=>a+b,0)===c.services&&Object.values(c.servedRecipes).reduce((a,b)=>a+b,0)===c.plates;
}
export function sanitizeDinerCareer(value:unknown):DinerCareer|null{
  const c=value as DinerCareer;
  if(!c||c.version!==1||!Number.isSafeInteger(c.startedAt)||c.startedAt<0||!count(c.services)||!count(c.introductory)||c.introductory>c.services||!count(c.plates)||!validCareerFields(c))return null;
  return structuredClone(c);
}
export function recordCareerService(career:DinerCareer,run:DinerRun):boolean{
  const service=run.service,node=run.map.find(n=>n.id===run.position);
  if(run.practice||!service||service.config.practice||service.phase!=='complete'||!node||!['slow','medium','busy','special','finale'].includes(node.kind))return false;
  const receipt=`${run.id}:${node.id}`;if(career.receipts.includes(receipt))return false;
  career.receipts.push(receipt);career.receipts=career.receipts.slice(-CAREER_RULES.receiptLimit);
  career.services++;career.byRoute[run.routeId]=(career.byRoute[run.routeId]??0)+1;career.byDifficulty[node.kind]=(career.byDifficulty[node.kind]??0)+1;
  if(node.kind==='slow'&&node.row<2)career.introductory++;
  const served=new Set<string>();for(const guest of service.customers)if(guest.servedTick!==null&&own(RECIPE_BY_ID,guest.recipeId)){
    career.plates++;career.servedRecipes[guest.recipeId]=(career.servedRecipes[guest.recipeId]??0)+1;
    served.add(guest.recipeId);
  }
  if(served.size>=2)career.multiRecipe.two++;if(served.size>=3)career.multiRecipe.three++;
  return true;
}
export function careerIngredientRewards(state:Pick<DinerState,'career'>){return CAREER_RULES.bundles.map(bundle=>({...bundle,claimed:state.career?.ingredientClaims.includes(bundle.id)??false,available:(state.career?.services??0)>=bundle.services,progress:Math.min(bundle.services,state.career?.services??0)}));}
/** A finite achievement pays complete sets for the explicitly chosen owned dish. */
export function careerIngredientBundle(state:Pick<DinerState,'career'|'recipes'>,achievementId:string,recipeId:string):Record<string,number>|null{
  const bundle=CAREER_RULES.bundles.find(b=>b.id===achievementId),career=state.career;
  if(!bundle||!career||career.services<bundle.services||career.ingredientClaims.includes(achievementId)||!own(state.recipes,recipeId)||!own(RECIPE_BY_ID,recipeId)||state.recipes[recipeId].level>=10)return null;
  const sets=bundle.sets;
  return Object.fromEntries(RECIPE_BY_ID[recipeId].ingredients.map(id=>[id,sets]));
}
