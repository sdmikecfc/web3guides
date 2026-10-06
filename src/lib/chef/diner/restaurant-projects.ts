import type {DinerState,DinerCommand} from './progression';
import {homeSimulationConfig,validateDinerHome} from './progression';
import {RECIPE_BY_ID} from './content';
import {REGULARS,DECOR_BY_ID} from './collections';
import {COMMUNITY_HANDLES} from './community-customers';
import {createHomeWorld,stepHomeWorld,type HomeWorld} from './home-simulation';
import {validHomeAudience} from './home-audience';
export const RESTAURANT_PROJECTS={burger:{name:'Roadside Burger Joint'},breakfast:{name:'Neighbourhood Breakfast Café'},ramen:{name:'Late-Night Ramen Bar'},bistro:{name:'Evening Bistro'}} as const;
export type RestaurantProjectId=keyof typeof RESTAURANT_PROJECTS;
export type DesignSnapshot=Pick<DinerState,'cosmetics'|'collectibleAppearances'>&{home:Pick<DinerState['home'],'name'|'layout'|'w'|'h'|'roomPlan'|'finishes'|'menu'>};
export interface RestaurantProject {pair:[string,string];before:DesignSnapshot;nameConfirmed:boolean;designReady:boolean;completed:boolean;plaqueName?:string;opening?:{world:HomeWorld;greeted:number[];lastAt:number;credit:number;paused:boolean}}
export interface RestaurantProjects {version:1;active:RestaurantProjectId|null;entries:Partial<Record<RestaurantProjectId,RestaurantProject>>}
export type ProjectCommand={type:'selectProject';id:RestaurantProjectId;pair:[string,string]}|{type:'confirmProjectDesign'}|{type:'startOpening'}|{type:'openingInput';action:{type:'tick';ticks:number}|{type:'greet';guest:number}|{type:'pause'|'resume'|'cancel'}}|{type:'completeProject'};
export const newRestaurantProjects=():RestaurantProjects=>({version:1,active:null,entries:{}});
export function validRestaurantProjects(raw:RestaurantProjects):boolean {
 try{if(raw.version!==1||!raw.entries||Object.keys(raw.entries).length>4||raw.active!==null&&(!Object.hasOwn(RESTAURANT_PROJECTS,raw.active)||!raw.entries[raw.active]))return false;
  for(const [id,p] of Object.entries(raw.entries)){if(!Object.hasOwn(RESTAURANT_PROJECTS,id)||!p||!validProjectPair(id as RestaurantProjectId,p.pair)||[p.nameConfirmed,p.designReady,p.completed].some(v=>typeof v!=='boolean'))return false;
   const h=p.before?.home;if(!h||!Number.isInteger(h.w)||h.w<4||h.w>20||!Number.isInteger(h.h)||h.h<4||h.h>20||typeof h.name!=='string'||h.name.length>40||!Array.isArray(h.layout)||h.layout.length>300||JSON.stringify(p.before).length>150000)return false;
   if(p.plaqueName!==undefined&&(typeof p.plaqueName!=='string'||p.plaqueName.length>40))return false;
   const o=p.opening;if(o&&(!validHomeAudience({version:1,world:o.world,fraction:0})||o.world.config.celebration?.version!==1||o.world.config.arrivalLimit!==6||o.world.config.celebration.guests.length!==6||!Array.isArray(o.greeted)||o.greeted.length>6||o.greeted.some(n=>!Number.isInteger(n)||n<0||n>5)||!Number.isFinite(o.lastAt)||!Number.isFinite(o.credit)||o.credit<0||o.credit>100||typeof o.paused!=='boolean'))return false;
  }return true;
 }catch{return false;}
}
export function designSnapshot(state:DinerState):DesignSnapshot {const {name,layout,w,h,roomPlan,finishes,menu}=state.home;return structuredClone({cosmetics:state.cosmetics,collectibleAppearances:state.collectibleAppearances,home:{name,layout,w,h,roomPlan,finishes,menu}});}
export function validProjectPair(id:RestaurantProjectId,pair:string[]):pair is [string,string]{if(pair.length!==2||pair[0]===pair[1]||pair.some(p=>!Object.hasOwn(RECIPE_BY_ID,p)))return false;return id==='burger'?pair[0]==='classic_burger'&&pair[1]==='fries':id==='breakfast'?pair[0]==='pancakes'&&pair[1]==='coffee':id==='ramen'?pair.every(p=>p.includes('ramen')):id==='bistro'?RECIPE_BY_ID[pair[0]].course==='main'&&RECIPE_BY_ID[pair[1]].course==='dessert':false;}
export function projectProgress(state:DinerState,id=state.projects?.active){const project=id?state.projects?.entries[id]:undefined;if(!project)return null;const [a,b]=project.pair,counts=project.pair.map(p=>state.career.servedRecipes[p]??0),owns=!!state.recipes[a]&&!!state.recipes[b],signature=project.pair.includes(state.personal?.signature?.recipeId??'');
 const menu=owns&&signature,meals=counts[0]>=5&&counts[1]>=5&&counts[0]+counts[1]>=20,mastery=project.pair.some(p=>(state.recipes[p]?.level??0)>=3),decor=state.home.layout.filter(p=>!!DECOR_BY_ID[p.equipmentId]&&!DECOR_BY_ID[p.equipmentId].displaySlot).length>=3;
 const stage=!menu?0:!meals||!mastery?1:!project.nameConfirmed||!project.designReady||!decor?2:3;
 return {id:id!,project,counts,menu,meals,mastery,decor,stage,ready:stage===3,completed:project.completed};
}
export function projectNextAction(state:DinerState){const p=projectProgress(state);if(!p||p.completed)return null;
 if(p.stage===0){const missing=p.project.pair.find(id=>!state.recipes[id]);return {title:missing?`Find ${RECIPE_BY_ID[missing].name}`:'Choose your house signature',detail:missing==='fries'?'Fries are guaranteed at the first Downtown market.':missing?`Look for ${RECIPE_BY_ID[missing].name} at roadside markets.`:'Make one of your project recipes your signature.',action:missing?'map' as const:'recipes' as const,label:missing?'Find a market':'Personalize a dish'};}
 if(p.stage===1)return {title:p.meals?'Upgrade a project dish':'Become known for your menu',detail:`${p.counts[0]} ${RECIPE_BY_ID[p.project.pair[0]].name} · ${p.counts[1]} ${RECIPE_BY_ID[p.project.pair[1]].name}. Serve 20 total, five of each; reach level 3 on one.`,action:p.meals?'recipes' as const:'map' as const,label:p.meals?'Upgrade a dish':'Cook a lunch'};
 return {title:p.stage===2?'Make the room yours':'Host your opening night',detail:p.stage===2?'Name your restaurant, place three decorations and mark the design ready.':'Six guests, three greetings and no patience deadlines.',action:'project' as const,label:p.stage===2?'Review my design':'Celebrate'};
}
export function applyProjectCommand(state:DinerState,command:ProjectCommand,now:number){
 state.projects??=newRestaurantProjects();const projects=state.projects,fail=(message:string):never=>{throw new Error(message);};
 if(command.type==='selectProject'){
  if(!Object.hasOwn(RESTAURANT_PROJECTS,command.id)||!Array.isArray(command.pair)||!validProjectPair(command.id,command.pair))fail('Choose a project and its two dishes.');
  if(projects.active&&projects.entries[projects.active]?.opening)fail('Close your opening night before switching projects.');
  projects.active=command.id;projects.entries[command.id]??={pair:[...command.pair],before:designSnapshot(state),nameConfirmed:false,designReady:false,completed:false};return;
 }
 const progress=projectProgress(state);if(!progress)fail('Choose a restaurant project first.');const project=progress!.project;
 if(command.type==='confirmProjectDesign'){if(!state.home.name.trim()||!progress!.decor||validateDinerHome(state,state.home.layout))fail('Name your restaurant and place three decorations in a valid room.');project.nameConfirmed=true;project.designReady=true;return;}
 if(command.type==='startOpening'){
  if(!progress!.ready)fail('Finish the first three project stages before opening night.');if(project.opening)return;
  if(state.run?.service||state.rally.service||state.run?.position)fail('Finish the current stop before opening night.');
  const layoutError=validateDinerHome(state,state.home.layout);if(layoutError)fail(layoutError);
  const regulars=REGULARS.filter(r=>(state.collections.regulars[r.id]??0)>0).slice(0,6),guests=Array.from({length:6},(_,i)=>({name:regulars[i]?.name??COMMUNITY_HANDLES[i],regularId:regulars[i]?.id,look:regulars[i]?REGULARS.findIndex(r=>r.id===regulars[i].id):i}));
  const config=homeSimulationConfig(state);config.menu=[...project.pair];config.arrivalRate=120;config.arrivalLimit=6;config.namedVisit=undefined;config.celebration={version:1,guests};
  if(config.roomPlan)config.roomPlan=structuredClone(config.roomPlan);
  for(const m of config.roomPlan?.modules??[])if(m.condition!==undefined)m.condition=100;
  const world=createHomeWorld(config);world.fixtureWear=false;if(world.menu.length!==2||!world.config.chefs||!world.config.waiters||!world.tables.some(t=>t.seats.length))fail('Place working equipment for both dishes and keep a cook, server and usable seats.');
  project.opening={world,greeted:[],lastAt:now,credit:0,paused:false};return;
 }
 if(command.type==='openingInput'){
  const action=command.action,keys:Record<string,string[]>={tick:['type','ticks'],greet:['type','guest'],pause:['type'],resume:['type'],cancel:['type']};
  if(!action||!Object.hasOwn(keys,action.type)||Object.keys(action).some(key=>!keys[action.type].includes(key)))fail('Choose a valid opening-night action.');
  const opening=project.opening;if(!opening)fail('Open your celebration first.');const o=opening!;
  if(command.action.type==='cancel'){delete project.opening;return;}
  if(command.action.type==='pause'||command.action.type==='resume'){o.paused=command.action.type==='pause';o.lastAt=now;o.credit=0;return;}
  if(command.action.type==='greet'){const n=command.action.guest;if(!Number.isInteger(n)||n<0||n>=6||o.world.metrics.arrivals<=n)fail('Select a guest at your opening night.');o.greeted=[...new Set([...o.greeted,n])];return;}
  if(command.action.type!=='tick')return;const ticks=command.action.ticks;if(!Number.isSafeInteger(ticks)||ticks<1||ticks>100)fail('Advance the celebration with its normal clock.');
  const elapsed=Math.max(0,now-o.lastAt);o.lastAt=now;if(o.paused||elapsed>5000){o.paused=true;o.credit=0;return;}o.credit=Math.min(100,o.credit+elapsed/50);if(ticks>Math.floor(o.credit))return;o.credit-=ticks;stepHomeWorld(o.world,ticks);return;
 }
 if(command.type==='completeProject'){
  const o=project.opening;if(!o||o.world.metrics.plates<6||o.greeted.length<3)fail('Feed six guests and greet three to finish opening night.');
  if(project.completed){delete project.opening;return;}project.completed=true;project.plaqueName=state.home.name;const id=`prestige_project_${progress!.id}`;state.decorOwned[id]=(state.decorOwned[id]??0)+1;delete project.opening;
 }
}
