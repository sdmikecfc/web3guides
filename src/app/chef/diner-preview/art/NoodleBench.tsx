"use client";
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { buildServiceLoadout, makeTable, makeStation, stationAccessPath } from '@/lib/chef/diner/geometry';
import { createService, dispatchService, serviceSupplyChoices, serviceTargetIntent, itemLabel } from '@/lib/chef/diner/service';
import type { ServiceAction, ServiceState, ServiceItem } from '@/lib/chef/diner/types';
import { serviceScene } from '../scene-adapter';
import { ServiceFocus } from '../ServiceFocus';
import { ModelIcon } from '../ModelIcon';
import { DinerIcon } from '../DinerIcon';
import { keyboardDirection, isTypingTarget, nearestTruckInteraction, firstLunchCoach } from '../truck-controls';
const DinerScene=dynamic(()=>import('../DinerScene'),{ssr:false});
const button={minHeight:44,padding:'8px 14px',border:'1px solid #c5b695',borderRadius:12,background:'#fff4d5',color:'#365e4c',cursor:'pointer'};

/** Isolated manual test kitchen. Never reads/writes a player save or rewards. */
export function NoodleBench(){
  const menus=[{id:'burger_fries',name:'Burger + fries',recipes:['classic_burger','fries']},{id:'tomato_pasta',name:'Tomato pasta',recipes:['tomato_pasta']},{id:'vegetable_ramen',name:'Vegetable ramen',recipes:['vegetable_ramen']},{id:'holding_counter',name:'holding counter',recipes:['classic_burger']},{id:'warming_counter',name:'warming counter',recipes:['classic_burger']}];
  const create=(id:string)=>{
    const menu=menus.find(choice=>choice.id===id)!.recipes,loadout=buildServiceLoadout(1,menu),table=loadout.tables[0],counter=id.endsWith('_counter')?makeStation('bench-counter','pass',3,0,id==='warming_counter'?2:1):null;
    if(counter)loadout.stations.push(counter,makeStation('bench-bowls','bowls',5,0));
    const result=createService({seed:'noodle-art-bench',tier:1,menu,...loadout,tables:[makeTable(table.id,table.x,table.y,1)],practice:true,customers:2,tablePatienceTicks:12000,queuePatienceTicks:12000});
    if(counter){
      const station=result.stations.find(item=>item.id===counter.id)!;
      const sample=(id:string,kind:ServiceItem['kind'],extra:Partial<ServiceItem>={}):ServiceItem=>({id,kind,recipeId:'classic_burger',step:0,stage:kind,createdTick:0,cold:false,physical:true,...extra});
      station.slots[0].item=sample('bench-bun','ingredient',{ingredientId:'bun',stage:'raw_bun'});
      const plateId=result.plateStock.shift()!;result.cleanPlates--;station.slots[1].item=sample(plateId,'plate',{vesselKind:'plate',plateId});
      if(station.tier>=2){
        const bowlId=result.bowlStock.shift()!;result.cleanBowls--;station.slots[2].item=sample(bowlId,'dirty',{vesselKind:'bowl',plateId:bowlId,recipeId:'tomato_pasta',stage:'dirty'});
        const dishPlate=result.plateStock.shift()!;result.cleanPlates--;station.slots[3].item=sample('bench-burger','dish',{step:2,stage:'plated',finishedTick:0,vesselKind:'plate',plateId:dishPlate});
      }
    }
    return dispatchService(result,{type:'prepare'});
  };
  const [service,setService]=useState<ServiceState>(()=>create('burger_fries')),[selected,setSelected]=useState<string|null>(null),[supply,setSupply]=useState<string|null>(null);
  const live=useRef(service);live.current=service;
  const send=(action:ServiceAction)=>setService(previous=>dispatchService(previous,action));
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setService(previous=>dispatchService(previous,{type:'tick',ticks:2}));},100);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{if(isTypingTarget(event.target as HTMLElement))return;const s=live.current,move=keyboardDirection(event.key,0);if(move){event.preventDefault();send({type:'move',x:Math.round(s.chef.x)+move.x,y:Math.round(s.chef.y)+move.y});}else if(event.key.toLowerCase()==='e'){event.preventDefault();const action=nearestTruckInteraction(s,selected??undefined),counter=s.stations.find(station=>station.id===action?.targetId&&station.kind==='pass');if(counter&&!s.chef.held&&counter.slots.filter(slot=>slot.item).length>1){setSelected(counter.id);setSupply(null);const path=stationAccessPath(s.config.tier,s.stations,s.tables,s.chef,counter);if(path!==null)send({type:'move',...(path.at(-1)??{x:Math.round(s.chef.x),y:Math.round(s.chef.y)})});return;}if(action)send({type:'interact',...action});send({type:'hold',active:true});}};
    const up=(event:KeyboardEvent)=>{if(event.key.toLowerCase()==='e')send({type:'hold',active:false});};window.addEventListener('keydown',down);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
  },[selected]);
  const target=(id:string,seatId?:string)=>{setSelected(id);const state=live.current,station=state.stations.find(station=>station.id===id),choices=serviceSupplyChoices(state,id);setSupply(choices.length>1?id:null);if(station?.kind==='pass'&&!state.chef.held&&station.slots.filter(slot=>slot.item).length>1){const path=stationAccessPath(state.config.tier,state.stations,state.tables,state.chef,station);if(path!==null)send({type:'move',...(path.at(-1)??{x:Math.round(state.chef.x),y:Math.round(state.chef.y)})});return;}send({type:'interact',targetId:id,...(seatId?{seatId}:{}),...(choices.length===1?{recipeId:choices[0].recipeId,ingredientId:choices[0].ingredientId}:{})});};
  const intent=selected?serviceTargetIntent(service,selected):null,coach=firstLunchCoach(service);
  return <section aria-label="Truck cooking practice" style={{margin:'32px 0',background:'#fff8e8',borderRadius:22,padding:18}}>
    <h2>Try the truck kitchen</h2><p>Development practice only. Your saved restaurant stays untouched. Click objects, or use WASD and E.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{menus.map(choice=><button key={choice.id} style={button} onClick={()=>{setService(create(choice.id));setSupply(null);setSelected(null);}}>Reset {choice.name}</button>)}<button style={button} disabled={service.phase!=='preparing'} onClick={()=>send({type:'open'})}>Open practice lunch</button></div>
    <div style={{position:'relative',height:500,overflow:'hidden',borderRadius:18,marginTop:12}}><DinerScene mode="truck" scene={serviceScene(service,selected)} rotation={0} onTarget={target} onTile={(x,y)=>send({type:'move',x,y})}/><div style={{position:'absolute',left:10,bottom:10,maxWidth:'calc(100% - 20px)'}}><ServiceFocus service={service} selectedId={selected} onCounterItem={(stationId,itemId)=>{setSupply(null);send({type:'hold',active:false});send({type:'interact',targetId:stationId,itemId});}}/></div></div>
    <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>{service.chef.held?<ModelIcon kind="food" recipeId={service.chef.held.recipeId} foodKind={service.chef.held.kind} ingredientId={service.chef.held.ingredientId} vesselKind={service.chef.held.vesselKind} stage={service.chef.held.stage} size={64} label="Carried item"/>:<DinerIcon name="hand" size={34}/>}<strong>{itemLabel(service.chef.held)}</strong><span>{service.config.bowlCount>0?`${service.cleanBowls} / ${service.config.bowlCount} clean bowls`:service.config.plateCount>0?`${service.cleanPlates} / ${service.config.plateCount} clean plates`:''} · {service.served} served · {service.washed} washed</span></div>
    {supply&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{serviceSupplyChoices(service,supply).map(choice=><button style={button} key={`${choice.recipeId}:${choice.ingredientId}`} onClick={()=>{send({type:'interact',targetId:supply,recipeId:choice.recipeId,ingredientId:choice.ingredientId});setSupply(null);}}>{choice.name}</button>)}</div>}
    {intent?.hold&&<button style={button} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);send({type:'hold',active:true});}} onPointerUp={()=>send({type:'hold',active:false})} onPointerCancel={()=>send({type:'hold',active:false})}>{intent.label}</button>}
    <p role="status">{service.notice}</p><p><strong>{coach.heading}</strong> {coach.detail}</p>
  </section>;
}
