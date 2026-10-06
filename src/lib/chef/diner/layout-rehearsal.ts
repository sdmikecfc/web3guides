import {RECIPE_BY_ID,ingredientSupply} from './content';
import {recipeVessel,vesselSupplyStation} from './batch';
import {createService,dispatchService,stepService,serviceReadyError,serviceRecipeSteps,serviceMissingIngredients} from './service';
import {createHomeWorld,stepHomeWorld,type HomeSimulationConfig,type HomeWorld} from './home-simulation';
import type {CreateServiceOptions,ServiceAction,ServiceState} from './types';

export type RehearsalFrame={tick:number;truck?:ServiceState;home?:HomeWorld};
export type RehearsalResult={version:1;mode:'home'|'truck';served:number;washed:number;unfinished:number;seconds:number;walkingSeconds:number;congestionSeconds:number;issues:string[];frames:RehearsalFrame[]};
const LIMIT=120*20;
const result=(mode:'home'|'truck'):RehearsalResult=>({version:1,mode,served:0,washed:0,unfinished:3,seconds:0,walkingSeconds:0,congestionSeconds:0,issues:[],frames:[]});
/** No DinerState or dispatchDiner enters this module. All mutable inputs are
 * cloned, and outputs are estimates with no command/reward/achievement path. */
export function rehearseHome(input:HomeSimulationConfig,capture=true):RehearsalResult{
  const r=result('home'),w=createHomeWorld({...structuredClone(input),arrivalRate:120,arrivalLimit:3});
  if(!w.menu.length)r.issues.push('No selected dishes have working, reachable equipment.');
  if(!w.tables.length)r.issues.push('No usable seats. Check chairs and customer routes.');
  if(!w.actors.some(a=>a.role==='chef')||!w.actors.some(a=>a.role==='waiter'))r.issues.push('A cook and server are needed.');
  for(let tick=0;tick<LIMIT;tick++){
    const before=w.actors.map(a=>({x:a.x,y:a.y,moving:!!a.path.length}));stepHomeWorld(w);
    w.actors.forEach((actor,i)=>{if(Math.hypot(actor.x-before[i].x,actor.y-before[i].y)>.001)r.walkingSeconds+=.05;else if(before[i].moving&&actor.path.length)r.congestionSeconds+=.05;});
    if(capture&&tick%20===0)r.frames.push({tick:w.tick,home:structuredClone(w)});
    if(w.metrics.plates>=3&&w.metrics.washed>=3)break;
  }
  r.served=w.metrics.plates;r.washed=w.metrics.washed;r.unfinished=Math.max(0,3-r.served);r.seconds=w.tick/20;
  if(r.unfinished)r.issues.push(`${r.unfinished} orders unfinished after ${r.seconds}s. Check working positions, handoffs and table access.`);
  if(w.metrics.bathroomMisses)r.issues.push('Guests could not reach an available working bathroom.');
  if(r.congestionSeconds>10)r.issues.push('Staff spend time waiting for a shared route.');
  if(capture)r.frames.push({tick:w.tick,home:structuredClone(w)});return r;
}

export function rehearseTruck(input:CreateServiceOptions,capture=true):RehearsalResult{
  const r=result('truck');let s=createService({...structuredClone(input),seed:'layout-rehearsal-v1',customers:3,practice:true,tutorialLearning:false,lessonVersion:0,pacingVersion:0,arrivalTicks:400,queuePatienceTicks:12000,tablePatienceTicks:12000});
  const error=serviceReadyError(s);if(error){r.issues.push(error);return r;}
  const tick=(count=1)=>{for(let i=0;i<count;i++){if(s.tick>=LIMIT)throw new Error('The rehearsal reached its 120-second limit.');const before={x:s.chef.x,y:s.chef.y};stepService(s);if(s.chef.x!==before.x||s.chef.y!==before.y)r.walkingSeconds+=.05;if(capture&&s.tick%20===0)r.frames.push({tick:s.tick,truck:structuredClone(s)});if(!['playing','closing','preparing'].includes(s.phase))throw new Error('Rehearsal service finished.');}};
  const until=(test:()=>boolean)=>{while(!test())tick();};
  const act=(action:ServiceAction)=>{tick(20);s=dispatchService(s,action);};
  const touch=(targetId:string,recipeId?:string,ingredientId?:string,seatId?:string)=>{act({type:'interact',targetId,recipeId,ingredientId,seatId});until(()=>!s.chef.path.length);};
  const station=(kind:string)=>s.stations.find(st=>st.kind===kind)!;
  const supply=(recipe:string,ingredient:string)=>touch(station(ingredientSupply(ingredient)).id,recipe,ingredient);
  const ready=(kind:string)=>until(()=>station(kind).slots.some(slot=>slot.job?.ready));
  const wash=(tableId:string,seatId:string)=>{touch(tableId,undefined,undefined,seatId);if(s.chef.held?.kind!=='dirty')return;touch(station('sink').id);act({type:'hold',active:true});until(()=>station('sink').slots.every(slot=>!slot.item));act({type:'hold',active:false});};
  const cook=(recipe:string)=>{
    if(recipe==='fries'&&station('fryer')?.slots.some(slot=>slot.batch?.phase==='raised')){touch(station('boxes').id);touch(station('fryer').id);return;}
    supply(recipe,RECIPE_BY_ID[recipe].ingredients[0]);
    for(const [i,step] of serviceRecipeSteps(s,recipe).entries()){
      if(!s.chef.held)throw new Error('An order is being handled by a helper; allow more counter space.');
      const target=station(step.station).id,missing=serviceMissingIngredients(s.chef.held);touch(target,recipe);
      for(const ingredient of missing){supply(recipe,ingredient);if(recipe==='chicken_ramen'&&ingredient==='chicken'){touch(station('grill').id);ready('grill');touch(station('grill').id);}touch(target);}
      act({type:'hold',active:true});ready(step.station);act({type:'hold',active:false});
      if(step.station==='fryer'&&['fries','cheese_fries'].includes(recipe)){touch(target);if(recipe==='fries'){touch(station('boxes').id);touch(target);return;}touch(target);continue;}
      if(step.station==='boiler')touch(target);
      if(i===serviceRecipeSteps(s,recipe).length-1)touch(station(vesselSupplyStation(recipeVessel(recipe))!).id);
      touch(target);
    }
  };
  s=dispatchService(s,{type:'open'});
  try{while(s.tick<LIMIT){
    const dirty=s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({table,seat})))[0];
    if(dirty){wash(dirty.table.id,dirty.seat.id);continue;}
    const guest=s.customers.find(c=>c.phase==='seated');if(!guest){tick();continue;}
    cook(guest.recipeId);touch(guest.tableId!,undefined,undefined,guest.seatId!);
  }}catch(error){if(s.served<3)r.issues.push(error instanceof Error?error.message:'The reference cook could not finish this layout.');}
  r.served=s.served;r.washed=s.washed;r.unfinished=3-s.served;r.seconds=s.tick/20;
  if(capture)r.frames.push({tick:s.tick,truck:structuredClone(s)});return r;
}
