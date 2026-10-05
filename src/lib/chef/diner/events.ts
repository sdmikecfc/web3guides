import { DIFFICULTIES } from './content';
import type { CreateServiceOptions } from './types';

export const EVENT_RULES={version:1,tickMs:50,cleanTicks:60,inspectionTicks:400,tyreTicks:600,tyrePeriod:60,tyreWindow:[18,30] as const,tyreHits:3,tyreMistakes:2,tyrePrice:200,inspectionReward:80} as const;
export type EventKind='street_festival'|'rainstorm'|'health_inspector'|'flat_tyre'|'rival_truck'|'film_crew'|'lost_tourist';
export type EventChoice={id:string;label:string;description:string};
export const EVENT_DEFINITIONS:{id:EventKind;title:string;description:string;choices:EventChoice[]}[]=[
  {id:'street_festival',title:'Street festival',description:'Music fills the next block. There is room for one more food truck.',choices:[{id:'join',label:'Join the festival',description:'Your next service is busy, with double tips.'},{id:'pass',label:'Take the quieter street',description:'Keep your planned next service.'}]},
  {id:'rainstorm',title:'A passing rainstorm',description:'A cloud opens just as you reach the next corner.',choices:[{id:'wait',label:'Wait for the rain to pass',description:'Skip the next stop without earning its rewards.'},{id:'serve',label:'Put up the awning',description:'The next service has fewer, less patient customers.'}]},
  {id:'health_inspector',title:'An unexpected inspection',description:'The inspector smiles. Three little clean-up jobs should put everything right.',choices:[{id:'clean',label:'Clean up together',description:'Hold each marked cleaning job. Finish within 20 seconds for 80 haul coins; otherwise take one strike.'}]},
  {id:'flat_tyre',title:'A flat tyre',description:'It is only a short stop if you can tighten the wheel neatly.',choices:[{id:'pay',label:'Pay 200 haul coins',description:'A roadside mechanic gets you moving.'},{id:'repair',label:'Fix it yourself',description:'Land three presses in the green timing zone. Two misses or running out of time costs one strike.'}]},
  {id:'rival_truck',title:'A friendly rival',description:'The truck across the street proposes a little cooking contest.',choices:[{id:'challenge',label:'Accept the challenge',description:'Clear a harder next service to earn a recipe scrap.'},{id:'avoid',label:'Wish them a good lunch',description:'Continue with your planned next service.'}]},
  {id:'film_crew',title:'A small film crew',description:'They would love to film a day aboard your truck.',choices:[{id:'film',label:'Welcome them aboard',description:'Your next service welcomes influencers.'},{id:'decline',label:'Keep the kitchen quiet',description:'Continue as planned.'}]},
  {id:'lost_tourist',title:'A new face',description:'A cook on their first visit has taken one wrong turn too many.',choices:[{id:'directions',label:'Help them find the way',description:'Meet a named recruit for your staff roster.'},{id:'wave',label:'Point out the main road',description:'Offer a friendly wave and continue.'}]},
];
export const EVENT_BY_ID=Object.fromEntries(EVENT_DEFINITIONS.map(event=>[event.id,event])) as Record<EventKind,typeof EVENT_DEFINITIONS[number]>;
export type NextServiceEffect={kind:'festival'|'rain'|'rival'|'film';scrapRecipeId?:string};
export type DinerEvent={version:1;id:string;kind:EventKind;phase:'choice'|'challenge'|'paused'|'resolved';tick:number;remaining:number;tasks:{id:string;label:string;x:number;y:number;progress:number;required:number}[];heldTarget:string|null;hits:number;mistakes:number;lastTapCycle:number;result:string|null};
export type EventAction={type:'choice';choiceId:string}|{type:'tick';ticks:number}|{type:'clean';targetId:string;active:boolean}|{type:'tap'|'pause'|'resume'};
export type EventOutcome={haulDelta:number;strikes:number;skipRows?:number;nextService?:NextServiceEffect;recruitId?:string};
export type EventContext={haul:number;routeRecipeIds:string[];seed:string;scheduledMarkets?:boolean};
function hash(value:string){let result=2166136261;for(let i=0;i<value.length;i++)result=Math.imul(result^value.charCodeAt(i),16777619);return result>>>0;}
export function eventKindFor(seed:string):EventKind{return EVENT_DEFINITIONS[hash(seed)%EVENT_DEFINITIONS.length].id;}
export function createDinerEvent(id:string,seed:string,kind:EventKind=eventKindFor(seed)):DinerEvent{return {version:1,id,kind,phase:'choice',tick:0,remaining:0,tasks:[],heldTarget:null,hits:0,mistakes:0,lastTapCycle:-1,result:null};}
export function sanitizeDinerEvent(raw:unknown):DinerEvent|null {try{const e=structuredClone(raw) as DinerEvent;if(!e||e.version!==1||typeof e.id!=='string'||!EVENT_BY_ID[e.kind]||!['choice','challenge','paused','resolved'].includes(e.phase)||![e.tick,e.remaining,e.hits,e.mistakes].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=600)||!Number.isSafeInteger(e.lastTapCycle)||!Array.isArray(e.tasks)||e.tasks.length>3||e.tasks.some(t=>!['grill_surface','prep_surface','aisle_spill'].includes(t.id)||!Number.isInteger(t.progress)||t.progress<0||t.progress>EVENT_RULES.cleanTicks||t.required!==EVENT_RULES.cleanTicks))return null;if(e.phase==='challenge'){e.phase='paused';e.heldTarget=null;}return e;}catch{return null;}}
export function eventNeedle(event:DinerEvent):number{return (event.tick%EVENT_RULES.tyrePeriod)/EVENT_RULES.tyrePeriod;}
export function eventServiceOptions(effect:NextServiceEffect|undefined,pacing:Partial<CreateServiceOptions>={}):Partial<CreateServiceOptions>{
  if(!effect)return {};
  // Keep route pacing as the baseline: an event changes the next service
  // without replacing a beginner's day with the old eleven-second rush.
  if(pacing.customers!==undefined&&pacing.arrivalTicks!==undefined){
    const customers=pacing.customers,arrivalTicks=pacing.arrivalTicks;
    if(effect.kind==='festival')return {customers:Math.ceil(customers*1.2),arrivalTicks:Math.round(arrivalTicks*.9),tipMultiplier:2};
    if(effect.kind==='rain')return {customers:Math.max(4,Math.ceil(customers*.65)),arrivalTicks:Math.round(arrivalTicks*1.25),queuePatienceTicks:Math.round(pacing.queuePatienceTicks!*.85),tablePatienceTicks:Math.round(pacing.tablePatienceTicks!*.85)};
    if(effect.kind==='rival')return {customers:customers+2,arrivalTicks:Math.round(arrivalTicks*.85),tablePatienceTicks:Math.round(pacing.tablePatienceTicks!*.9)};
  }
  if(effect.kind==='festival')return {...DIFFICULTIES.busy,tipMultiplier:2};
  if(effect.kind==='rain')return {...DIFFICULTIES.slow,customers:6,queuePatienceTicks:780,tablePatienceTicks:650};
  if(effect.kind==='rival')return {...DIFFICULTIES.medium,arrivalTicks:240,tablePatienceTicks:780};
  return {customerTypes:['influencer']};
}
export function dispatchDinerEvent(previous:DinerEvent,action:EventAction,context:EventContext):{event:DinerEvent;outcome?:EventOutcome;error?:string}{
  const event=structuredClone(previous),bad=(error:string)=>({event:previous,error});
  const done=(result:string,outcome:EventOutcome)=>{event.phase='resolved';event.result=result;event.heldTarget=null;return {event,outcome};};
  if(!action||typeof action!=='object'||event.phase==='resolved')return bad('This roadside stop is already finished.');
  if(action.type==='pause'){if(event.phase==='challenge'){event.phase='paused';event.heldTarget=null;}return {event};}
  if(action.type==='resume'){if(event.phase==='paused')event.phase='challenge';return {event};}
  if(action.type==='choice'){
    if(event.phase!=='choice'||!EVENT_BY_ID[event.kind].choices.some(choice=>choice.id===action.choiceId))return bad('Choose one of this stop’s available options.');
    const normal={haulDelta:0,strikes:0};
    switch(event.kind){
      case 'street_festival':return done(action.choiceId==='join'?'The next block is ready for your festival lunch.':'The quiet street looks inviting.',{...normal,...(action.choiceId==='join'?{nextService:{kind:'festival' as const}}:{})});
      case 'rainstorm':return done(action.choiceId==='wait'?(context.scheduledMarkets?'The rain passed. Your planned route is ready.':'The rain passed. The next stop was skipped without rewards.'):'The awning is up. A few impatient guests are on their way.',{...normal,...(action.choiceId==='wait'?(context.scheduledMarkets?{}:{skipRows:1}):{nextService:{kind:'rain' as const}})});
      case 'health_inspector':event.phase='challenge';event.remaining=EVENT_RULES.inspectionTicks;event.tasks=[{id:'grill_surface',label:'Wipe the grill surface',x:1,y:0,progress:0,required:EVENT_RULES.cleanTicks},{id:'prep_surface',label:'Clean the prep board',x:2,y:0,progress:0,required:EVENT_RULES.cleanTicks},{id:'aisle_spill',label:'Mop the aisle spill',x:1,y:1,progress:0,required:EVENT_RULES.cleanTicks}];return {event};
      case 'flat_tyre':if(action.choiceId==='pay'){if(context.haul<EVENT_RULES.tyrePrice)return bad('You need 200 carried coins for the mechanic.');return done('A fresh tyre, and back on the road.',{haulDelta:-EVENT_RULES.tyrePrice,strikes:0});}event.phase='challenge';event.remaining=EVENT_RULES.tyreTicks;return {event};
      case 'rival_truck':return done(action.choiceId==='challenge'?'Your next lunch will settle the friendly rivalry.':'A friendly wave, and on you go.',{...normal,...(action.choiceId==='challenge'?{nextService:{kind:'rival' as const,scrapRecipeId:context.routeRecipeIds[hash(context.seed)%Math.max(1,context.routeRecipeIds.length)]}}:{})});
      case 'film_crew':return done(action.choiceId==='film'?'The crew invited influencers to your next lunch.':'A quiet kitchen today.',{...normal,...(action.choiceId==='film'?{nextService:{kind:'film' as const}}:{})});
      case 'lost_tourist':return done(action.choiceId==='directions'?'A new friend remembers your kindness.':'A wave, a smile, and the right road.',{...normal,...(action.choiceId==='directions'?{recruitId:['jo','bea','gus'][hash(context.seed)%3]}:{})});
    }
  }
  if(event.phase!=='challenge')return bad('Choose an option or resume this challenge first.');
  if(action.type==='clean'){
    if(event.kind!=='health_inspector'||typeof action.active!=='boolean'||!event.tasks.some(task=>task.id===action.targetId))return bad('Choose one of the marked cleaning jobs.');
    event.heldTarget=action.active?action.targetId:null;return {event};
  }
  if(action.type==='tap'){
    if(event.kind!=='flat_tyre')return bad('This challenge needs its marked cleaning targets.');
    const cycle=Math.floor(event.tick/EVENT_RULES.tyrePeriod),position=event.tick%EVENT_RULES.tyrePeriod;
    if(cycle===event.lastTapCycle)return bad('Wait for the next turn of the wheel.');event.lastTapCycle=cycle;
    if(position>=EVENT_RULES.tyreWindow[0]&&position<=EVENT_RULES.tyreWindow[1])event.hits++;else event.mistakes++;
    if(event.hits>=EVENT_RULES.tyreHits)return done('The wheel is secure. Back on the road.',{haulDelta:0,strikes:0});
    if(event.mistakes>=EVENT_RULES.tyreMistakes)return done('The repair took too long. One expedition plate cracked.',{haulDelta:0,strikes:1});return {event};
  }
  if(action.type==='tick'){
    if(!Number.isSafeInteger(action.ticks)||action.ticks<1||action.ticks>100)return bad('Use a short, whole-number time step.');
    for(let i=0;i<action.ticks;i++){event.tick++;event.remaining--;const task=event.tasks.find(task=>task.id===event.heldTarget);if(task)task.progress=Math.min(task.required,task.progress+1);
      if(event.kind==='health_inspector'&&event.tasks.every(task=>task.progress===task.required))return done('A spotless little truck. The inspector leaves an 80-coin bonus.',{haulDelta:EVENT_RULES.inspectionReward,strikes:0});
      if(event.remaining<=0)return done('Time ran out. One expedition plate cracked.',{haulDelta:0,strikes:1});
    }return {event};
  }
  return bad('Choose an available roadside action.');
}
