import {recipePrice,RECIPE_BY_ID,EQUIPMENT_BY_ID,SERVICE_RULES} from './content';
import {recipeVessel,SERVING_VESSELS} from './batch';
import {COMPONENT_RECIPES,COMPONENT_NAMES} from './prepared-components';
import {serviceReadyError} from './service';
import {stationAccessPath,servicePath,serviceGeometry} from './geometry';
import type {ServiceState} from './types';
export type ServiceStats={version:1;food:number;tips:number;queuePeak:number;queueTicks:number;prepTicks:number;maxCombo:number;servedWarm:number};
export const newServiceStats=():ServiceStats=>({version:1,food:0,tips:0,queuePeak:0,queueTicks:0,prepTicks:0,maxCombo:0,servedWarm:0});
export const PRESSURE_NAMES={slow:'Relaxed Lunch',medium:'Steady Lunch',busy:'Lunch Rush',special:'Chef’s Challenge'};
/** A disclosed forecast, not a promised payout. Tip estimates are excluded. */
export function serviceForecast(s:ServiceState,bonus=0){
 const prices=s.config.menu.map(id=>({id,base:recipePrice(id,s.config.recipeLevels[id]),price:recipePrice(id,s.config.recipeLevels[id])*(s.config.specials.includes('happy_hour')&&RECIPE_BY_ID[id].course==='drink'?2:1)}));
 const mean=prices.reduce((a,b)=>a+b.price,0)/prices.length;
 const top=[...prices].sort((a,b)=>b.base-a.base||a.id.localeCompare(b.id)).slice(0,3),weights=top.length===1?[1]:top.length===2?[.6,.4]:[.5,.3,.2];
 const business=top.reduce((sum,p,i)=>sum+p.price*weights[i],0);
 const perGuest=s.config.customerTypes.reduce((sum,type)=>sum+(s.config.destinationVersion&&type==='business'?business:mean)*(s.config.destinationVersion&&type==='party'?1.35:1),0)/Math.max(1,s.config.customerTypes.length);
 const food=Math.round(s.config.customers*perGuest*SERVICE_RULES.menuMultipliers[s.config.menu.length-1]*(s.config.cosy?.8:1));
 const gaps=s.arrivalSchedule?.length?s.arrivalSchedule:[s.config.arrivalTicks];
 return {food,bonus,total:food+bonus,minGap:Math.round(Math.min(...gaps)/20),maxGap:Math.round(Math.max(...gaps)/20),assumptions:`Estimate: every guest served; ${s.config.customerTypes.includes('business')?'business price preferences, before repeat-order limits':'equal dish demand'}; current menu and price bonuses included. Tips excluded. Preparation, walking and clearing affect time.`};
}
export function servicePressurePhase(s:ServiceState){
 if(s.phase==='preparing'||s.phase==='setup')return 'Preparation';if(s.phase==='closing')return 'Clearing';
 if(!s.arrivalSchedule?.length)return 'Service';
 const next=s.arrivalSchedule[Math.max(0,(s.arrivalCursor??0)-1)]??s.config.arrivalTicks;
 return next<=440?'Rush':next>=640?'Recovery':'Steady service';
}
export function approachingRush(s:ServiceState){return s.phase==='playing'&&s.spawned<s.config.customers&&s.nextArrival<=120&&s.nextArrival>20&&(s.arrivalSchedule?.[s.arrivalCursor??0]??999)>0&&(s.arrivalSchedule?.[s.arrivalCursor??0]??999)<=440;}
export function serviceComparisonKey(s:ServiceState){
 const {seed,...rules}=s.config;
 return JSON.stringify({version:1,rules,stations:s.stations.map(st=>[st.id,st.kind,st.x,st.y,st.facing,st.tier]),tables:s.tables.map(t=>[t.id,t.x,t.y,t.capacity,t.rotation])});
}
export function serviceInsight(s:ServiceState){
 if(s.burnt)return `${s.burnt} portions burnt. Prep ahead or try a basket-lifting fryer to free your attention.`;
 if(s.missed)return `${s.missed} guests left. Try a shorter menu or move your busiest stations closer together.`;
 if(s.stats&&s.stats.servedWarm===s.served&&s.served)return `Every one of your ${s.served} dishes reached its guest warm.`;
 return `You served ${s.served} guests and washed ${s.washed} dishes.`;
}
export function kitchenReadiness(s:ServiceState){
 const origin=serviceGeometry(s.config.tier).door;
 const blocked=s.stations.filter(st=>!stationAccessPath(s.config.tier,s.stations,s.tables,origin,st));
 const seats=s.tables.flatMap(t=>t.seats.filter(seat=>!!servicePath(s.config.tier,s.stations,s.tables,origin,seat)).map(seat=>({tableId:t.id,seatId:seat.id})));
 const distances=s.stations.map(st=>({id:st.id,name:EQUIPMENT_BY_ID[st.kind].name,steps:stationAccessPath(s.config.tier,s.stations,s.tables,origin,st)?.length??999})).sort((a,b)=>b.steps-a.steps);
 const shared=Object.entries(COMPONENT_RECIPES).filter(([,recipes])=>recipes.filter(id=>s.config.menu.includes(id)).length>1).map(([id])=>COMPONENT_NAMES[id as keyof typeof COMPONENT_NAMES]);
 return {error:serviceReadyError(s),blocked,seats,shared,vessels:[...new Set(s.config.menu.map(recipeVessel))].map(id=>({id,name:SERVING_VESSELS[id].name,stock:id==='fry_box'?'free boxes':id==='bowl'?s.cleanBowls:id==='cup'?s.cleanCups:s.cleanPlates})),suggestion:blocked.length?'Clear a working side for the marked station.':seats.length===1?'One seat makes washing the likely bottleneck. A second seat lets the next guest sit while you clear.':distances[0]?.steps>7?`${distances[0].name} is ${distances[0].steps} steps from the door. Group your ingredient, cooking and plating stations to reduce trips.`:'Your working routes are clear. Prepare a component or basket before opening.',targetId:blocked[0]?.id??(seats.length===1?seats[0].tableId:distances[0]?.id)};
}
