"use client";



import {dishPresentationName} from '@/lib/chef/diner/personal-touches';
import { EQUIPMENT_BY_ID, RECIPE_BY_ID, SERVICE_RULES } from '@/lib/chef/diner/content';

import { isAdjacent, stationFootprint } from '@/lib/chef/diner/geometry';

import { protectedLesson } from '@/lib/chef/diner/service-schedule';

import { itemLabel, serviceSupplyChoices, isUsedFriesBox } from '@/lib/chef/diner/service';

import { SERVING_VESSELS, isSoup } from '@/lib/chef/diner/batch';

import type { ServiceItem, ServiceSeat, ServiceState, ServiceStation, ServiceTable, StationSlot } from '@/lib/chef/diner/types';

import { ModelIcon } from './ModelIcon';

import { DinerIcon } from './DinerIcon';

import { equipmentDisplayName } from './RecipeLearning';

import css from './service-focus.module.css';



type Feedback={title:string;detail?:string;time?:string;progress?:number;tone?:'ready'|'warning';food?:ServiceItem;recipeId?:string;emptyKind?:string;tier?:number};

const seconds=(ticks:number)=>`${(Math.ceil(Math.max(0,ticks)*SERVICE_RULES.tickMs/100-1e-8)/10).toFixed(1)}s`;

const running=(service:ServiceState)=>service.phase==='preparing'||service.phase==='playing'||service.phase==='closing';

function stationWorked(service:ServiceState,station:ServiceStation){return running(service)&&[service.chef,...service.helpers].some(actor=>actor.targetId===station.id&&actor.holding&&!actor.path.length&&isAdjacent(actor,stationFootprint(station)));}

function stationFeedback(service:ServiceState,station:ServiceStation,slot:StationSlot):Feedback {

  const item=slot.item!,job=slot.job,food={...item},label=itemLabel(item);

  const batchName=isSoup(item.recipeId)?RECIPE_BY_ID[item.recipeId].name:RECIPE_BY_ID[item.recipeId]?.ingredients[0]==='pasta'?'Pasta':'Ramen noodles';
  if(slot.portions?.ready)return {title:`${slot.portions.remaining} ${item.recipeId==='house_red'?'glasses':'mandu portions'} ready`,detail:item.recipeId==='house_red'?'Bring a clean glass from the cup stand.':'Take one portion, then add dipping sauce at prep.',time:item.warmthTicks===undefined?undefined:item.cold?'Cold':`${seconds(item.warmthTicks)} warm`,tone:'ready',food};

  if(slot.boil?.phase==='ready')return {title:`${batchName} · lift & drain`,detail:'Tap the boiler before collecting your cooked noodles.',tone:'ready',food};

  if(slot.boil?.phase==='drained')return {title:batchName,detail:`${slot.boil.version===2?slot.boil.remaining+' portions · ':''}${isSoup(item.recipeId)?'Ladle into a clean bowl, then add the topping at prep.':'Collect one portion and choose its dish at prep.'}`,time:item.cold?'Cold':item.warmthTicks===undefined?undefined:`${seconds(item.warmthTicks)} warm`,tone:'ready',food};

  if(slot.batch?.phase==='ready')return {title:'Raise the basket',detail:'Tap the fryer to lift the cooked batch.',time:`${slot.batch.remaining} portions`,tone:'ready',food};

  if(slot.batch?.phase==='raised')return {title:`${slot.batch.remaining} portions ready`,detail:'Bring an empty fries box to portion one order.',tone:'ready',food};

  if(item.kind==='burnt')return {title:'Burnt',detail:label,time:'Cannot serve',tone:'warning',food};

  if(job&&!job.ready){

    const manual=job.action==='hold'||job.action==='wash',working=stationWorked(service,station),step=RECIPE_BY_ID[item.recipeId]?.steps[item.step];

    const verbs:Record<string,string>={boiler:'Boiling',grill:'Grilling',fryer:'Frying',oven:'Baking',coffee:'Brewing',drinks:'Pouring',blender:'Blending'};

    const title=!running(service)?service.phase==='paused'?'Paused':'Stopped':manual?working?(job.action==='wash'?'Washing':'Preparing'):'Needs hands-on work':job.action==='wash'?'Washing':station.kind==='sink'?'Dishwasher running':verbs[station.kind]??'Cooking';

    return {title,detail:item.kind==='dirty'?`Used ${SERVING_VESSELS[item.vesselKind??'plate'].name}`:`${RECIPE_BY_ID[item.recipeId]?.name??'Food'} · ${step?.label??'In progress'}`,time:`${seconds(job.remaining)} ${manual&&!working?'work':'left'}`,progress:job.total>0?1-job.remaining/job.total:0,food};

  }

  if(job?.ready&&job.burnRemaining!==null){

    return {title:running(service)?'Ready — lift it off the heat':'Ready · heat timer paused',detail:label,time:`${seconds(job.burnRemaining)} until burnt`,progress:1,tone:running(service)?'warning':'ready',food};

  }

  if(item.cold&&item.kind==='dish')return {title:'Cold',detail:RECIPE_BY_ID[item.recipeId]?.name??'Dish',time:'Base price · no tip',tone:'ready',food};

  if(station.kind==='pass')return {title:label,detail:item.kind==='dirty'?(isUsedFriesBox(item)?'Used box. Throw it in the bin.':'Set down for now. Still needs washing.'):item.kind==='dish'&&station.tier>=2?'Kept warm under the lamps.':'Set down safely. Pick up when you need it.',tone:item.kind==='dish'?'ready':undefined,food};

  return {title:item.kind==='dish'?'Ready to serve':job?.ready?'Ready for the next step':'On the counter',detail:label,tone:item.kind==='dish'||job?.ready?'ready':undefined,food};

}

function sameMeal(item:ServiceItem|null,table:ServiceTable,seat:ServiceSeat){return item?.kind==='dirty'&&item.meal?.tableId===table.id&&item.meal.seatId===seat.id&&item.meal.mealId===seat.mealId;}

function seatFeedback(service:ServiceState,table:ServiceTable,seat:ServiceSeat,index:number):Feedback {

  const seatLabel=`Seat ${index+1}`,customer=service.customers.find(c=>c.id===seat.customerId),recipeId=customer?.recipeId??seat.item?.recipeId;

  const patienceDrain=(service.config.cosy?2/3:1)*(service.config.spices.includes('rush_hour')?1.25:1);

  if(seat.item?.kind==='dirty'){

    const vessel=SERVING_VESSELS[seat.item.vesselKind??'plate'].name;

    const guest=customer&&['walking','seated','eating'].includes(customer.phase)?customer:null;

    const order=guest?RECIPE_BY_ID[guest.recipeId]?.name??'Their order':null;

    return {title:`Clear the used ${vessel}`,detail:guest?`${seatLabel} · ${order}${guest.phase==='walking'?' · guest approaching':' ordered'}`:seatLabel,

      time:guest?.phase==='seated'&&!(service.config.lessonVersion===1?protectedLesson(service):service.config.tutorialLearning)?`${seconds(guest.patience/patienceDrain)} patience`:undefined,food:seat.item,tone:'warning'};

  }

  if(seat.status==='awaitingWash'){

    const station=service.stations.find(st=>st.slots.some(slot=>sameMeal(slot.item,table,seat))),slot=station?.slots.find(slot=>sameMeal(slot.item,table,seat));

    const carried=[service.chef,...service.helpers].some(actor=>sameMeal(actor.held,table,seat));

    const washing=running(service)&&station&&slot?.job&&!slot.job.ready&&(slot.job.action==='timed'||stationWorked(service,station));

    return {title:washing?'Plate is washing':carried?'Plate on its way to sink':station?'Plate waiting at sink':'Waiting for its clean plate',detail:`${seatLabel} · unavailable until washed`,time:slot?.job?`${seconds(slot.job.remaining)} ${washing?'left':'work'}`:undefined,emptyKind:'sink'};

  }

  if(seat.status==='clean')return {title:'Ready for a guest',detail:seatLabel,emptyKind:'chair',tone:'ready'};

  if(seat.status==='reserved'||customer?.phase==='walking')return {title:recipeId?dishPresentationName(recipeId,service.config.signature):'Guest approaching',detail:`${seatLabel} · guest approaching`,recipeId};

  if(seat.status==='eating')return {title:recipeId?dishPresentationName(recipeId,service.config.signature):'Enjoying lunch',detail:`${seatLabel} · eating${customer?.servedCold?' · served cold':''}`,time:customer?`${seconds(customer.eatRemaining)} left`:undefined,food:seat.item??undefined,recipeId};

  return {title:recipeId?dishPresentationName(recipeId,service.config.signature):'Waiting for an order',detail:`${customer?.regularId==='old_pete'?'Old Pete':seatLabel} · ordered`,time:customer&&!(service.config.lessonVersion===1?protectedLesson(service):service.config.tutorialLearning)?`${seconds(customer.patience/patienceDrain)} patience`:undefined,recipeId};

}

function FoodRow({feedback,index,recipeLevels,onTake,takeDisabled=false,takeLabel='Take'}:{feedback:Feedback;index?:number;recipeLevels:Record<string,number>;onTake?:()=>void;takeDisabled?:boolean;takeLabel?:string}){

  const {food,recipeId,emptyKind}=feedback,kind=food||recipeId||emptyKind==='dirty'?'food':emptyKind;

  return <div className={`${css.row} ${feedback.tone?css[feedback.tone]:''}`}>

    <div className={css.art}>{kind?<ModelIcon kind={kind} recipeId={food?.recipeId??recipeId} foodKind={food?.kind??(emptyKind==='dirty'?'dirty':'dish')} components={food?.components} ingredientId={food?.ingredientId} vesselKind={food?.vesselKind} stage={food?.stage} cold={food?.cold} mastery={recipeLevels[food?.recipeId??recipeId??'']??0} tier={feedback.tier} label={food?itemLabel(food):recipeId?`Ordered ${RECIPE_BY_ID[recipeId]?.name??'dish'}`:feedback.title} size={43}/>:<DinerIcon name="plate" size={28}/>}</div>

    <div className={css.text}><div className={css.rowTitle}>{index!==undefined&&<span className={css.number}>{index+1}</span>}<strong>{feedback.title}</strong></div>

      {feedback.detail&&<span className={css.detail}>{feedback.detail}</span>}

      {feedback.time&&<span className={css.time}>{feedback.tone==='warning'?<DinerIcon name="clock" size={11}/>:null}{feedback.time}</span>}

      {feedback.progress!==undefined&&<div className={css.track} role="progressbar" aria-label={`${feedback.detail??feedback.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0,Math.min(1,feedback.progress))*100)}><span style={{width:`${Math.max(0,Math.min(1,feedback.progress))*100}%`}}/></div>}

    </div>

    {onTake&&<button type="button" className={css.take} disabled={takeDisabled} aria-label={`Take ${feedback.detail&&feedback.title==='Burnt'?'burnt food':feedback.title} from spot ${(index??0)+1}`} onClick={onTake}>{takeLabel}</button>}

  </div>;

}



/** Selection feedback, with exact-item pickup for a mixed holding counter. */

export function ServiceFocus({service,selectedId,onCounterItem}:{service:ServiceState;selectedId:string|null;onCounterItem?:(stationId:string,itemId:string)=>void}){

  if(!selectedId)return null;const mess=service.messes?.find(m=>m.id===selectedId);if(mess)return <aside className={css.card} aria-label="Cleanup"><header className={css.header}><strong>Time to tidy up</strong></header><div className={css.rows}><FoodRow recipeLevels={service.config.recipeLevels} feedback={{title:'Hold to mop',detail:`Each mess makes waiting guests lose patience 10% faster. ${(service.messes?.length??0)*10}% extra pressure now.`,progress:mess.progress/60}}/></div></aside>;

  const station=service.stations.find(s=>s.id===selectedId),table=service.tables.find(t=>t.id===selectedId);

  if(!station&&!table)return null;

  const occupied=station?.slots.flatMap((slot,index)=>slot.item?[{slot,index}]:[])??[],free=station?station.slots.length-occupied.length:0;

  const stopped=service.phase==='paused'?'Paused':service.phase==='setup'?'Before opening':service.phase==='complete'||service.phase==='failed'?'Service ended':null;

  const title=station?equipmentDisplayName(station.kind,station.tier):`Table · ${table!.capacity} seats`;

  const guests=table?.seats.filter(seat=>['reserved','occupied','eating'].includes(seat.status)).length??0;

  return <aside className={css.card} aria-label={`${title} details`} data-service-focus={selectedId} data-holding-counter={station?.kind==='pass'} data-batch-station={station?.kind==='boiler'&&occupied.length>0}>

    <header className={css.header}><strong>{title}</strong><span>{stopped??(station?['crate','fridge'].includes(station.kind)?'Ingredients':station.kind==='plates'?`${service.cleanPlates} clean`:station.kind==='cups'?`${service.cleanCups} clean`:station.kind==='bowls'?`${service.cleanBowls??0} clean`:station.kind==='boxes'?'Fries boxes':station.kind==='bin'?'Scraps':`${occupied.length}/${station.slots.length} occupied`:`${guests} ${guests===1?'guest':'guests'}`)}</span></header>

    <div className={css.rows}>

      {table&&<p>{service.customers.filter(c=>c.tableId===table.id&&c.phase!=='gone').map(c=>c.communityHandle).filter(Boolean).join(' · ')}</p>}

      {table?table.seats.map((seat,index)=><FoodRow recipeLevels={service.config.recipeLevels} key={seat.id} feedback={seatFeedback(service,table,seat,index)}/>):occupied.length?occupied.map(({slot,index})=><FoodRow recipeLevels={service.config.recipeLevels} key={index} feedback={stationFeedback(service,station!,slot)} index={station!.slots.length>1?index:undefined} onTake={(station!.kind==='pass'||station!.kind==='boiler'&&slot.job?.ready||!!slot.portions?.ready)&&onCounterItem?()=>onCounterItem(station!.id,slot.item!.id):undefined} takeLabel={slot.boil?.phase==='ready'?'Drain':slot.item!.recipeId==='house_red'?'Pour':isSoup(slot.item!.recipeId)?'Ladle':'Take'} takeDisabled={!running(service)||(station!.kind==='wine_station'?service.chef.held?.kind!=='plate'||service.chef.held.vesselKind!=='cup':station!.kind==='boiler'&&isSoup(slot.item!.recipeId)?service.chef.held?.kind!=='plate'||service.chef.held.vesselKind!=='bowl':!!service.chef.held)}/>):<FoodRow recipeLevels={service.config.recipeLevels} feedback={['crate','fridge'].includes(station!.kind)?{title:station!.kind==='fridge'?'Cold ingredients':'Pantry ingredients',detail:`${serviceSupplyChoices(service,station!.id).map(choice=>choice.name).join(' · ') || 'No supplies for this menu'}. Supplied free. Use empty hands to choose.`,emptyKind:station!.kind,tier:station!.tier}:station!.kind==='plates'?{title:`${service.cleanPlates} clean plates`,detail:'Used plates return here after washing.',emptyKind:'plates'}:station!.kind==='cups'?{title:`${service.cleanCups} clean cups`,detail:'Wash used cups to refill the stand.',emptyKind:'cups'}:station!.kind==='bowls'?{title:`${service.cleanBowls??0} clean bowls`,detail:'Used bowls return here after washing. Separate from your plates and cups.',emptyKind:'bowls'}:station!.kind==='boxes'?{title:'Fries boxes',detail:'Box your fries here, or take an empty box first. Used boxes go in the bin.',emptyKind:'boxes'}:station!.kind==='bin'?{title:'Food scraps',detail:'Throw away food scraps and used fries boxes. Dirty plates go to the sink.',emptyKind:'bin',tier:station!.tier}:station!.kind==='pass'?{title:'A place to free your hands',detail:station!.tier>=2?'Set down ingredients, food or dishes. Lamps keep finished dishes warm.':'Set down ingredients, food or clean and dirty dishes. Nothing cooks here.',emptyKind:'pass',tier:station!.tier}:{title:'Clear and ready',detail:`${free} free ${station!.kind==='sink'?'wash':station!.kind==='prep'?'counter':'cooking'} ${free===1?'spot':'spots'}`,emptyKind:station!.kind,tier:station!.tier}}/>}

    </div>

    {station?.kind==='pass'&&occupied.length>0&&onCounterItem&&<div className={css.free}>{service.chef.held?'Set down what you are carrying, then choose an item to take.':'Choose the stored item you want to take.'}</div>}

    {station&&occupied.length>0&&free>0&&<div className={css.free}>{free} {free===1?'spot':'spots'} still free</div>}

  </aside>;

}

export default ServiceFocus;
