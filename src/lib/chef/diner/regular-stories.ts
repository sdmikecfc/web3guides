import {REGULARS,regularAvailable,regularFavourite} from './collections';
import {createHomeWorld,stepHomeWorld,type HomeSimulationConfig,type HomeWorld} from './home-simulation';
import type {DinerState} from './progression';

export type RegularVisit={id:number;regularId:string;recipeId:string;ticks:number;ready:boolean;config:HomeSimulationConfig;layoutKey:string};
export type RegularStories={version:1;cursor:number;sequence:number;pending:RegularVisit|null;lastGreeting:{regularId:string;visitId:number}|null};
export const newRegularStories=():RegularStories=>({version:1,cursor:0,sequence:0,pending:null,lastGreeting:null});
export const STORY_AT=[3,8,15] as const;
export const REGULAR_STORIES:Record<string,readonly [string,string,string]>={
  old_pete:["Pete leaves an old bus ticket beside his burger. ‘This used to be the last stop before the hills. You could tell who was heading home by their smile.’", "He brings a faded photograph of this street. ‘I kept meaning to leave. Then I knew everybody’s order, and somehow that was enough.’", "‘Thought this belonged here.’ His postcard shows the road beyond town. On the back: A good place to come home to."],
  marge:["Marge wraps both hands around her coffee. ‘Quietest five minutes of my shift. You have no idea what that’s worth.’", "She has started bringing an extra coffee back to the ward. ‘The new nurse is finding her feet. Someone did the same for me.’", "A little thank-you badge arrives from the night staff. ‘You’ve never met half of them. They all know this place.’"],
  dottie:["Dottie introduces her poodle as the real food critic. ‘I choose the sundae. He chooses where we sit.’", "She tells you about the tiny garden she planted after moving here. ‘The daisies made it feel like home first.’", "She gives you their portrait. ‘Put it somewhere he can see it. He has a terrible opinion of photographs without him.’"],
  rex:["Rex folds a road map into a square beside his plate. ‘Best part of this route? Knowing lunch is sorted.’", "He tells you about a diner that stayed open through a storm for three stranded drivers. ‘You remember who puts a light on.’", "A souvenir plate comes from a town two hundred miles away. ‘Saw this and thought of your place. Funny how that happens.’"],
  professor_lin:["Lin takes one bite of pie and closes her notebook. ‘Some observations deserve your full attention.’", "Her recipe notes are full of arrows and crossed-out measurements. ‘An experiment is only a failure if you refuse to taste it.’", "She leaves a handwritten note: The secret ingredient is having somewhere you want to return to. ‘Not very scientific. Still true.’"],
  kiki:["Kiki balances her board under the seat. ‘I nearly landed it today. Nearly counts until tomorrow, right?’", "She brings the news: the younger skaters have asked her to teach them. ‘Turns out explaining it is harder than doing it.’", "Her first little skateboard is yours to display. ‘It’s retired. Give it a good view of the fries.’"],
  hendersons:["The Hendersons debate who invented their pancake tradition. Everyone has a different answer. Everyone orders another bite.", "A family member visiting from away recognizes the familiar seats. ‘They told me everything about this place. They forgot to mention how good it smells.’", "They leave a family photo with a space in the caption for your restaurant’s name. ‘Part of the tradition now.’"],
  mr_bell:["Bell studies his plate, then smiles. ‘I promised myself I’d stop taking notes at lunch. You’re making that difficult.’", "He admits his favourite meals never made the papers. ‘The little places. The people who remembered. That was the real story.’", "His framed review is only one sentence: I came for a meal, and kept coming back for the place."],
};
const caches=new Map<string,HomeWorld>();
export function validRegularVisit(visit:RegularVisit):boolean{
  const c=visit.config;
  if(!c||![c.w,c.h].every(n=>Number.isInteger(n)&&n>=1&&n<=20)||![c.chefs,c.waiters,c.cashiers??0].every(n=>Number.isInteger(n)&&n>=0&&n<=8)||!Number.isFinite(c.arrivalRate)||c.arrivalRate<0||c.arrivalRate>10000||!Array.isArray(c.menu)||c.menu.length>32||!c.menu.includes(visit.recipeId)||!Array.isArray(c.layout)||c.layout.length>300||!c.equipment||!c.recipeLevels||c.namedVisit?.id!==visit.id||c.namedVisit.regularId!==visit.regularId||c.namedVisit.recipeId!==visit.recipeId)return false;
  if(c.layout.some(p=>!p||typeof p.id!=='string'||typeof p.equipmentId!=='string'||![p.x,p.y].every(Number.isFinite)))return false;
  try{createHomeWorld(c);return visit.layoutKey===regularLayoutKey(c);}catch{return false;}
}
export const regularLayoutKey=(config:HomeSimulationConfig)=>JSON.stringify(config,(key,value)=>key==='condition'||key==='namedVisit'?undefined:value);
/** Reconstruct only from a server-created configuration and server-observed time.
 * Cached worlds are copied out; rendering and rehearsal cannot mutate evidence. */
export function regularVisitWorld(visit:RegularVisit):HomeWorld{
  const key=JSON.stringify([visit.id,visit.regularId,visit.config]);let world=caches.get(key);
  if(!world||world.tick>visit.ticks)world=createHomeWorld(visit.config);
  if(world.tick<visit.ticks)stepHomeWorld(world,visit.ticks-world.tick);
  if(caches.size>=8&&!caches.has(key))caches.delete(caches.keys().next().value!);caches.set(key,world);
  return structuredClone(world);
}
export function advanceRegularStories(state:DinerState,config:HomeSimulationConfig,now:number,online:boolean):void{
  const stories=state.regularStories??=newRegularStories();
  if(!online||now-state.updatedAt>30000||state.run||state.rally.service)return;
  if(!stories.pending){
    for(let offset=0;offset<REGULARS.length;offset++){
      const index=(stories.cursor+offset)%REGULARS.length,regular=REGULARS[index],recipeId=regularFavourite(state,regular.id);
      if(!recipeId||!regularAvailable(state,regular.id)||!config.menu.includes(recipeId))continue;
      const id=++stories.sequence,visitConfig=structuredClone({...config,namedVisit:{id,regularId:regular.id,recipeId}});
      stories.pending={id,regularId:regular.id,recipeId,ticks:0,ready:false,config:visitConfig,layoutKey:regularLayoutKey(config)};stories.cursor=(index+1)%REGULARS.length;break;
    }
    return;
  }
  const visit=stories.pending;if(visit.ready)return;
  if(state.homeAudience){visit.ready=state.homeAudience.world.metrics.namedMeals?.includes(visit.id)===true;return;}
  if(!config.menu.includes(visit.recipeId)||!regularAvailable(state,visit.regularId)){stories.pending=null;return;}
  if(visit.layoutKey!==regularLayoutKey(config)){visit.config=structuredClone({...config,namedVisit:{id:visit.id,regularId:visit.regularId,recipeId:visit.recipeId}});visit.ticks=0;visit.layoutKey=regularLayoutKey(config);return;}
  visit.ticks=Math.min(12000,visit.ticks+Math.max(0,Math.floor((now-state.updatedAt)/50)));
  visit.ready=regularVisitWorld(visit).metrics.namedMeals?.includes(visit.id)===true;
}
export function regularChapterRequest(state:DinerState,id:string,chapter:number){
  const favourite=regularFavourite(state,id),regular=REGULARS.find(r=>r.id===id)!;
  return chapter===0?{label:'Give their favourite a permanent recipe upgrade',done:!!favourite&&(state.recipes[favourite]?.level??0)>=1}:chapter===1?{label:'Complete five real truck services',done:(state.career?.services??0)>=5}:{label:'Display their personal keepsake',done:state.home.layout.some(p=>p.equipmentId===regular.memento)};
}
