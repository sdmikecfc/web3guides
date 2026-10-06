import {projectNextAction,RESTAURANT_PROJECTS,type RestaurantProjectId} from './restaurant-projects';
import type { DinerState } from './progression';
import { RECIPE_BY_ID, ROUTES } from './content';
import { CAREER_RULES } from './career';

export const STYLE_BUNDLES = [
  {id:'cherry_lunch',name:'Cherry Lunch',counter:'cream',decor:['chrome_clock','milkshake_sign','red_planter'],description:'Cream counters, cherry enamel and a little chrome.'},
  {id:'green_corner',name:'Green Corner Café',counter:'sage',decor:['coffee_print','garden_poster','herb_planter'],description:'Deep green counters, coffee prints and fresh herbs.'},
  {id:'roadside_favourite',name:'Roadside Favourite',counter:'oak',decor:['diner_clock','coffee_sign','pie_display'],description:'Warm timber, a well-loved clock and pie under glass.'},
] as const;
export type StyleBundleId=typeof STYLE_BUNDLES[number]['id'];
export interface ProgressRewards {version:1;style:StyleBundleId|null;claimed:string[];finales:string[];pinned:string|null}
export const newProgressRewards=():ProgressRewards=>({version:1,style:null,claimed:[],finales:[],pinned:null});
export function validProgressRewards(value:ProgressRewards):boolean {
  return !!value&&value.version===1&&(value.style===null||STYLE_BUNDLES.some(b=>b.id===value.style))&&
    Array.isArray(value.claimed)&&value.claimed.length<=40&&new Set(value.claimed).size===value.claimed.length&&value.claimed.every(id=>id==='service_badge'||id==='rally_trophy'||id.startsWith('dish_')&&!!RECIPE_BY_ID[id.slice(5)]||id.startsWith('route_')&&ROUTES.some(r=>r.id===id.slice(6)))&&
    Array.isArray(value.finales)&&value.finales.length<=ROUTES.length&&new Set(value.finales).size===value.finales.length&&value.finales.every(id=>ROUTES.some(r=>r.id===id))&&
    (value.pinned===null||typeof value.pinned==='string'&&value.pinned.length<=80);
}
export function prestigeRewards(state:DinerState){
  return [
    {id:'rally_trophy',name:'First verified rally',itemId:'prestige_rally_trophy',earned:state.progressRewards?.claimed.includes('rally_trophy')??false,detail:'Complete a server-verified weekly rally.'},
    {id:'service_badge',name:'Five good lunches',itemId:'prestige_service_badge',earned:state.career.services>=5,detail:'Complete five ordinary services. Your first helper position also opens.'},
    ...ROUTES.map(route=>({id:`route_${route.id}`,name:`${route.name} souvenir`,itemId:`prestige_route_${route.id}`,earned:state.progressRewards?.finales.includes(route.id)??false,detail:`Complete the ${route.name} finale.`})),
    ...Object.keys(state.recipes).map(id=>({id:`dish_${id}`,name:`${RECIPE_BY_ID[id].name} illustration`,itemId:`prestige_dish_${id}`,earned:state.recipes[id].level>=3&&(state.career.servedRecipes[id]??0)>0,detail:`Serve ${RECIPE_BY_ID[id].name} on the truck and reach recipe level three.`})),
  ].map(reward=>({...reward,claimed:state.progressRewards?.claimed.includes(reward.id)??false})).concat([
    ...Object.entries(state.projects?.entries??{}).filter(([,p])=>p?.completed).map(([id,p])=>({id:`project_${id}`,name:`${p!.plaqueName} · opening night`,itemId:`prestige_project_${id}`,earned:true,claimed:true,detail:`Complete ${RESTAURANT_PROJECTS[id as RestaurantProjectId].name} and host opening night.`})),
    ...(state.personal?.communityPlaque?[{id:'picnic_plaque',name:'Neighbourhood Picnic',itemId:'prestige_picnic_plaque',earned:true,claimed:true,detail:'Contribute three verified meals to the shared 300-meal picnic.'}]:[]),
  ]);
}
export interface ProgressGoal {label?:string;id:string;title:string;detail:string;action:'project'|'styleBundle'|'map'|'recipes'|'scrapbook'|'grow'|'pantry';current:number;target:number}
export function progressGoals(state:DinerState):ProgressGoal[]{
  const goals:ProgressGoal[]=[];
  const project=projectNextAction(state);if(project)goals.push({id:'restaurant_project',title:project.title,detail:project.detail,action:project.action,label:project.label,current:0,target:1});
  if(!state.progressRewards?.style)goals.push({id:'first_style',title:state.career.services?'Choose your restaurant style':'Your first restaurant style',detail:'Finish one lunch to choose a counter finish and three decorations.',action:state.career.services?'styleBundle':'map',current:Math.min(1,state.career.services),target:1});
  if((state.recipes.classic_burger?.level??0)===0&&state.onboarding?.burgerBundle)goals.push({id:'burger_upgrade',title:'Make your burger worth more',detail:'Your first-lunch ingredient set is ready in the cookbook.',action:'recipes',current:0,target:1});
  for(const reward of prestigeRewards(state).filter(r=>r.earned&&!r.claimed))goals.push({id:reward.id,title:reward.name,detail:'Earned. Choose a place for it in your restaurant.',action:'scrapbook',current:1,target:1});
  const bundle=CAREER_RULES.bundles.find(b=>!state.career.ingredientClaims.includes(b.id));
  if(bundle)goals.push({id:bundle.id,title:`${bundle.sets} complete ingredient sets`,detail:`${Math.max(0,bundle.services-state.career.services)} services to go. Use these to upgrade an owned dish.`,action:state.career.services>=bundle.services?'pantry':'map',current:Math.min(bundle.services,state.career.services),target:bundle.services});
  if(state.career.services<5)goals.push({id:'helper',title:'Your first truck helper',detail:'Complete five ordinary services to open a helper position.',action:'map',current:state.career.services,target:5});
  goals.push({id:'renovation',title:'Your next restaurant',detail:'See the coins, recipes and cooking accomplishments for your renovation.',action:'grow',current:0,target:1});
  return goals;
}
export function nextProgressGoal(state:DinerState):ProgressGoal {const goals=progressGoals(state);return goals.find(g=>g.id===state.progressRewards?.pinned)??goals[0];}
