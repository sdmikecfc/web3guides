"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  TRUCK_LADDER, TRUCK_MACHINES, TRUCK_PRICES, TRUCK_SIZES, TRUCK_TICK_MS,
  truckMachine, truckSize, truckStartError, truckMenu,
  type TruckAction, type TruckDish, type TruckFacing, type TruckItemKind,
  type TruckMachineId, type TruckProgress, type TruckRole, type TruckTech, type TruckIngredientChoice,
} from "./_engine/truck";
import { IconChefHat, IconCoin, IconMedal, IconWrench } from "./_ui/icons";
import { TruckBadgeArt, TruckDishArt, TruckMachineArt, TruckWorldArt, TRUCK_PAINTS, type TruckArtStation } from "./TruckArt";
import css from "./FoodTruck.module.css";
import type { DkSfxName } from "./_view/sfx";

export interface FoodTruckProps {
  truck: TruckProgress;
  coins: number;
  onAction: (action: TruckAction) => void;
  onHome: () => void;
  onPlaceHome: (itemId: string) => void;
  restaurantName?: string;
  busy?: boolean;
  error?: string | null;
  eventLabel?: string;
  eventLocked?: boolean;
  onSound?: (name:DkSfxName) => void;
  /** Omit for local guests. Signed-in play supplies only server-receipted stops. */
  confirmedDiscoveries?: readonly number[];
}

const DISHES: Record<TruckDish,{name:string;short:string;description:string;steps:string[];ingredient:TruckDish|"cup"}> = {
  pasta: {name:"Garden pasta",short:"Pasta",description:"Set pasta boiling, then simmer a tomato. Bring the cooked pasta to the sauce pan and plate your lovely lunch.",steps:["Pasta → pot","Tomato → sauce pan","Cooked pasta → ready sauce","Plating counter","Serving window"],ingredient:"pasta"},
  salad: {name:"Market salad",short:"Salad",description:"Chop a little garden goodness and send out a bright, fresh bowl.",steps:["Fridge greens","Chopping board","Plating counter","Serving window"],ingredient:"salad"},
  fries: {name:"Golden fries",short:"Fries",description:"A crisp little treat. Slice the potatoes before they meet the fryer.",steps:["Potato crate","Chopping board","Fryer","Plating counter","Serving window"],ingredient:"fries"},
  drink: {name:"Cool refreshment",short:"Drink",description:"Take chilled lemon and a cup from the fridge. Fill it, find its thirsty customer, and make their afternoon.",steps:["Fridge lemon cup","Drink machine","Serving window"],ingredient:"cup"},
};
const ITEM_LABELS:Record<TruckItemKind,string>={raw_pasta:"Uncooked pasta",raw_tomato:"A ripe tomato",sauce:"Fresh tomato sauce",sauced_pasta:"Pasta in tomato sauce",lemon_cup:"Chilled lemon & a cup",raw_salad:"Fresh greens",raw_potato:"A potato",cut_potato:"Sliced potatoes",cooked_pasta:"Cooked pasta",chopped_salad:"Chopped salad",cooked_fries:"Golden fries",cup:"An empty cup",drink:"A cold drink",plate_pasta:"Plated garden pasta",plate_salad:"Plated market salad",plate_fries:"Plated golden fries",dirty_plate:"A dirty plate",burnt:"Burnt food"};
const NEXT_ACTION:Record<TruckItemKind,string>={raw_pasta:"Bring it to the pasta pot.",raw_tomato:"Simmer it at the sauce pan.",sauce:"Leave this sauce ready at the sauce pan.",sauced_pasta:"Finish it at the plating counter.",lemon_cup:"Fill it at the drink machine.",raw_salad:"Bring it to the chopping board.",raw_potato:"Slice it at the chopping board.",cut_potato:"Bring it to the fryer.",cooked_pasta:"Bring it to the sauce pan once the tomato sauce is ready.",chopped_salad:"Finish it at the plating counter.",cooked_fries:"Finish it at the plating counter.",cup:"Fill it at the drink machine.",drink:"Bring it to the serving window.",plate_pasta:"Bring it to the serving window.",plate_salad:"Bring it to the serving window.",plate_fries:"Bring it to the serving window.",dirty_plate:"Wash it at the sink.",burnt:"Discard it to make room for something fresh."};
const ROLES: Array<{id:TruckRole;name:string;description:string}>=[{id:"washer",name:"A helping hand",description:"A washer collects dirty dishes and keeps clean plates coming."},{id:"prep",name:"Your prep cook",description:"Prepares and plates salads and fries for your waiting guests."},{id:"runner",name:"A friendly runner",description:"Picks up finished dishes from stations and serves waiting customers."}];
const TECHS:Array<{id:TruckTech;name:string;description:string}>=[{id:"prep",name:"A sharper kitchen",description:"Spend less time chopping and preparing ingredients."},{id:"cook",name:"A better flame",description:"Cook food faster at your pot and fryer."},{id:"service",name:"A smoother service",description:"Move between stations faster and give guests a little more patience."}];
function timeLabel(ticks:number){const seconds=Math.max(0,Math.ceil(ticks*TRUCK_TICK_MS/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;}
function RouteIcon({kind,size=25}:{kind:string;size?:number}){return kind==="market"?<IconWrench size={size}/>:kind==="gift"?<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 10h18v11H3zM2 6h20v4H2zM12 6v15M12 6C2 6 5-3 12 6Zm0 0c10 0 7-9 0 0Z" strokeLinejoin="round"/></svg>:<IconChefHat size={size}/>;}

/** Export only the illustrated scene: no account, currency, inventory, or HUD. */
async function saveTruckPostcard(scene:SVGSVGElement,name:string):Promise<void>{
  const art=scene.cloneNode(true) as SVGSVGElement;
  art.setAttribute("xmlns","http://www.w3.org/2000/svg");
  art.setAttribute("width","1280");art.setAttribute("height","920");
  art.querySelectorAll("[tabindex]").forEach(node=>node.removeAttribute("tabindex"));
  const source=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(art)],{type:"image/svg+xml;charset=utf-8"}));
  try{
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("The truck illustration could not be opened."));image.src=source;});
    const card=document.createElement("canvas");card.width=1360;card.height=1080;
    const ctx=card.getContext("2d");if(!ctx)throw new Error("Your browser could not make this postcard.");
    ctx.fillStyle="#f4f1df";ctx.fillRect(0,0,card.width,card.height);
    ctx.imageSmoothingQuality="high";ctx.drawImage(image,40,20,1280,920);
    ctx.strokeStyle="#d8cfb2";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(56,953);ctx.lineTo(1304,953);ctx.stroke();
    ctx.textBaseline="middle";ctx.textAlign="left";ctx.fillStyle="#456344";ctx.font="700 39px Georgia,serif";ctx.fillText(name||"My Food Truck",56,992,820);
    ctx.fillStyle="#8a7c60";ctx.font="20px 'Segoe UI',sans-serif";ctx.fillText("My little kitchen, on the road.",56,1034,820);
    ctx.textAlign="right";ctx.fillStyle="#a16f4e";ctx.font="700 24px 'Segoe UI',sans-serif";ctx.fillText("DOMAIN KITCHEN",1304,1006,375);
    const png=await new Promise<Blob>((resolve,reject)=>card.toBlob(blob=>blob?resolve(blob):reject(new Error("The postcard could not be saved.")),"image/png"));
    const download=URL.createObjectURL(png),link=document.createElement("a");
    link.href=download;link.download="my-food-truck.png";document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(download),4000);
  }finally{URL.revokeObjectURL(source);}
}

function TruckSheet({title,kicker,children,onClose,tabs}:{title:string;kicker?:string;children:ReactNode;onClose:()=>void;tabs?:ReactNode}){
  const panel=useRef<HTMLDivElement>(null),id=useId();
  useEffect(()=>{const before=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLButtonElement>("button")?.focus();return()=>before?.focus?.();},[]);
  return <div className={css.overlay} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section className={css.sheet} role="dialog" aria-modal="true" aria-labelledby={id} ref={panel} onKeyDown={event=>{
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();onClose();}
    if(event.key!=="Tab")return;const all=panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]');if(!all?.length)return;const first=all[0],last=all[all.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }}><header className={css.sheetHeader}><div>{kicker&&<div className={css.eyebrow}>{kicker}</div>}<h2 id={id}>{title}</h2></div><button type="button" className={css.close} aria-label={`Close ${title}`} onClick={onClose}>×</button></header>{tabs}<div className={css.sheetBody}>{children}</div></section></div>;
}

/** A presentation of the shared deterministic truck state. No rewards live here. */
export default function FoodTruck({truck,coins,onAction,onHome,onPlaceHome,restaurantName="The Little Kitchen",busy=false,error,eventLabel,eventLocked=false,onSound,confirmedDiscoveries}:FoodTruckProps){
  const [sheet,setSheet]=useState<"route"|"kit"|"recipes"|"pantry"|null>(null);
  const [kitTab,setKitTab]=useState<"equipment"|"crew"|"upgrades"|"style">("equipment");
  const [arranging,setArranging]=useState(false),[selected,setSelected]=useState<number|null>(null),[placing,setPlacing]=useState<TruckMachineId|null>(null);
  const [pantryId,setPantryId]=useState<number|null>(null);
  const [selectedNode,setSelectedNode]=useState(1);
  const [signDraft,setSignDraft]=useState(restaurantName);
  const [discovery,setDiscovery]=useState<{node:number;machine:TruckMachineId}|null>(null);
  const [postcardBusy,setPostcardBusy]=useState(false),[postcardNotice,setPostcardNotice]=useState("");
  const worldElement=useRef<HTMLDivElement>(null);
  const resultPanel=useRef<HTMLElement>(null);
  const actionRef=useRef(onAction),truckRef=useRef(truck),sheetRef=useRef(sheet),selectedRef=useRef(selected);
  const soundRef=useRef(onSound),soundState=useRef<{id:string;phase:string;served:number;held:string;processing:Set<string>;customers:Set<number>}|null>(null);
  soundRef.current=onSound;
  actionRef.current=onAction;truckRef.current=truck;sheetRef.current=sheet;selectedRef.current=selected;
  const run=truck.run;
  const playing=run?.phase==="playing",paused=run?.phase==="paused",inRun=playing||paused;
  const result=run?.phase==="cleared"||run?.phase==="failed";
  // nextNode is the recoverable ladder position; bestDay is a permanent record.
  const nextNode=truck.nextNode;
  const node=TRUCK_LADDER[(inRun||result?run!.node:selectedNode)-1]??TRUCK_LADDER[0];
  const nodeKind=node.kind;
  const dimensions=truckSize(inRun||result?run!.loadout.size:truck.size);
  const appearance=inRun||result?run!.loadout:truck;
  const sign=appearance.sign||restaurantName;
  const player=run&&(inRun||result)?run.player:{x:Math.min(3,dimensions.w-1),y:Math.min(2,dimensions.h-1),facing:0 as TruckFacing,held:null,path:[],job:null};
  const stations:TruckArtStation[]=(run&&(inRun||result)?run.stations:truck.layout).map(station=>{
    const live=run&&(inRun||result)?run.stations.find(s=>s.id===station.id):null;
    return {...station,label:truckMachine(station.machineId)?.name??station.machineId,food:live?.item?.kind,progress:live?.processing?1-live.processing.remaining/live.processing.total:undefined,selected:station.id===selected};
  });
  const chosenStation=stations.find(station=>station.id===selected);
  const walkingTo=run?.player.path.length?stations.find(station=>station.id===run.player.pending?.stationId):null;
  const walkingHint=run?.player.path.length?walkingTo?`Walking to ${walkingTo.label.toLowerCase()}…`:"Walking across your kitchen…":null;
  const paint=TRUCK_PAINTS.find(p=>p.id===appearance.color)??TRUCK_PAINTS[0];
  const allOwned=(id:TruckMachineId)=>truck.layout.filter(s=>s.machineId===id).length+(truck.machineInventory[id]??0);
  const availableDishes=inRun||result?run!.menu:truckMenu(truck.layout,node);
  const pantrySource=stations.find(s=>s.id===pantryId)?.machineId;
  const ingredientChoices:Array<{choice:TruckIngredientChoice;art:string;name:string;next:string}>=pantrySource==="fridge"?[
    ...(availableDishes.includes("salad")?[{choice:"salad" as const,art:"raw_salad",name:"Fresh greens",next:"Chopping board"}]:[]),
    ...(availableDishes.includes("drink")?[{choice:"drink" as const,art:"lemon_cup",name:"Lemon & cup",next:"Drink machine"}]:[]),
  ]:[
    ...(availableDishes.includes("pasta")?[{choice:"pasta" as const,art:"raw_pasta",name:"Pasta",next:"Pasta pot"},{choice:"tomato" as const,art:"raw_tomato",name:"A tomato",next:"Sauce pan"}]:[]),
    ...(availableDishes.includes("fries")?[{choice:"fries" as const,art:"raw_potato",name:"A potato",next:"Chopping board"}]:[]),
  ];
  const readyError=!inRun&&nodeKind==="service"?truckStartError(truck,node.id):null;
  // Practice exposes installed recipes at their gentlest matching service stop.
  const practiceMenuSize=truckMenu(truck.layout,TRUCK_LADDER[TRUCK_LADDER.length-1]).length;
  const practiceNode=TRUCK_LADDER.find(stop=>stop.kind==="service"&&truckMenu(truck.layout,stop).length===practiceMenuSize)??TRUCK_LADDER[0];
  const practiceError=truckStartError(truck,practiceNode.id,true);
  const discoveryConfirmed=!!discovery&&!busy&&(confirmedDiscoveries??truck.firstClears).includes(discovery.node)&&truck.unlockedMachineIds.includes(discovery.machine);
  const discoveredMachine=discovery?truckMachine(discovery.machine):null;
  const busyStation=run?.stations.find(station=>station.processing?.owner==="player");
  const readyStation=run?.stations.find(station=>station.item&&!station.processing&&!["sauce","burnt"].includes(station.item.kind));
  const emptyHandHint=busyStation?`Stay here while your ${truckMachine(busyStation.machineId)?.name.toLowerCase()} finishes.`:readyStation?`Tap ${truckMachine(readyStation.machineId)?.name.toLowerCase()} to pick up ${ITEM_LABELS[readyStation.item!.kind].toLowerCase()}.`:run?.stations.some(station=>station.machineId==="stove"&&station.processing)&&!run.stations.some(station=>station.machineId==="sauce"&&(station.item||station.processing))?"While the pasta boils, take a tomato to the sauce pan.":`${run?.cleanPlates??6} clean plates · ${run?.dirtyDishes??0} need washing`;

  useEffect(()=>{if(!inRun)setSelectedNode(Math.max(1,Math.min(12,nextNode)));},[nextNode,inRun]);
  useEffect(()=>{if(inRun){setArranging(false);setPlacing(null);}},[inRun]);
  useEffect(()=>{setSignDraft(truck.sign||restaurantName);},[truck.sign,restaurantName]);
  useEffect(()=>{if(result&&!sheet)resultPanel.current?.querySelector<HTMLButtonElement>("button")?.focus();},[result,sheet]);
  useEffect(()=>{
    if(!run){soundState.current=null;return;}
    const previous=soundState.current,held=run.player.held?`${run.player.held.id}:${run.player.held.kind}`:"";
    const processing=new Set(run.stations.filter(station=>station.processing).map(station=>`${station.id}:${station.item?.id}`));
    const customers=new Set(run.customers.map(customer=>customer.id));
    soundState.current={id:run.id,phase:run.phase,served:Math.max(previous?.id===run.id?previous.served:0,run.served),held,processing,customers};
    if(!previous||previous.id!==run.id){if(run.tick===0&&run.phase==="playing")soundRef.current?.("doorbell");return;}
    if(previous.phase!==run.phase&&run.phase==="failed"){soundRef.current?.("bus");return;}
    if(previous.phase!==run.phase&&run.phase==="cleared"){soundRef.current?.("unlock");return;}
    // Resuming/restoring is silent. Sounds follow real work, never UI clicks.
    if(run.phase!=="playing"||previous.phase!=="playing")return;
    if(run.served>previous.served)soundRef.current?.("serve");
    else if([...processing].some(key=>!previous.processing.has(key)))soundRef.current?.("hustle");
    else if(held&&held!==previous.held)soundRef.current?.("bus");
    else if([...customers].some(id=>!previous.customers.has(id)))soundRef.current?.("doorbell");
  },[run]);
  useEffect(()=>{
    let last=performance.now(),accumulator=0;
    const interval=window.setInterval(()=>{
      const now=performance.now(),delta=Math.min(250,Math.max(0,now-last));last=now;
      if(truckRef.current.run?.phase!=="playing"||document.visibilityState!=="visible"){accumulator=0;return;}
      accumulator+=delta;const ticks=Math.floor(accumulator/TRUCK_TICK_MS);if(ticks){accumulator-=ticks*TRUCK_TICK_MS;actionRef.current({type:"tick",ticks});}
    },100);
    const visibility=()=>{last=performance.now();accumulator=0;if(document.visibilityState!=="visible"&&truckRef.current.run?.phase==="playing")actionRef.current({type:"pause"});};
    document.addEventListener("visibilitychange",visibility);
    return()=>{clearInterval(interval);document.removeEventListener("visibilitychange",visibility);if(truckRef.current.run?.phase==="playing")actionRef.current({type:"pause"});};
  },[]);

  const openSheet=(value:typeof sheet)=>{if(playing&&value!=="pantry")onAction({type:"pause"});setSheet(value);};
  const goHome=()=>{if(playing){onAction({type:"pause"});truckRef.current={...truckRef.current,run:{...run!,phase:"paused"}};}onHome();};
  const interact=(stationId:number)=>{
    setSelected(stationId);
    if(!inRun){setArranging(true);setPlacing(null);return;}
    if(paused)return;
    const station=stations.find(s=>s.id===stationId);
    if((station?.machineId==="pantry"||station?.machineId==="fridge")&&!player.held){setPantryId(stationId);setSheet("pantry");return;}
    onAction({type:"interact",stationId});
  };
  const ground=(x:number,y:number)=>{
    if(inRun){if(playing)onAction({type:"moveTo",x,y});return;}
    if(!arranging)return;
    if(placing){onAction({type:"place",machineId:placing,x,y,facing:0});setPlacing(null);return;}
    if(selected!=null)onAction({type:"moveStation",stationId:selected,x,y});
  };
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      if(sheetRef.current||event.ctrlKey||event.metaKey||event.altKey||(event.target instanceof HTMLElement&&/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))return;
      const active=truckRef.current.run;if(!active||!["playing","paused"].includes(active.phase))return;
      const key=event.key.toLowerCase();
      if(key==="escape"||key==="p"){event.preventDefault();event.stopPropagation();actionRef.current({type:active.phase==="playing"?"pause":"resume"});return;}
      if(active.phase!=="playing")return;
      const moves:Record<string,[number,number]>={arrowup:[0,-1],w:[0,-1],arrowdown:[0,1],s:[0,1],arrowleft:[-1,0],a:[-1,0],arrowright:[1,0],d:[1,0]};
      if(moves[key]){event.preventDefault();event.stopPropagation();actionRef.current({type:"move",dx:moves[key][0],dy:moves[key][1]});return;}
      if(key==="e"||key===" "){
        // A focused station button owns Enter/Space and prevents duplicate work.
        if(event.target instanceof HTMLElement&&event.target.closest("button,[role=button]"))return;
        event.preventDefault();event.stopPropagation();const target=active.stations.find(s=>s.id===selectedRef.current)??[...active.stations].sort((a,b)=>(Math.abs(a.x-active.player.x)+Math.abs(a.y-active.player.y))-(Math.abs(b.x-active.player.x)+Math.abs(b.y-active.player.y)))[0];
        if(target)actionRef.current({type:"interact",stationId:target.id});
      }
    };
    window.addEventListener("keydown",keydown);return()=>window.removeEventListener("keydown",keydown);
  },[]);

  const start=()=>{setSheet(null);setArranging(false);setSelected(null);onAction({type:"start",node:node.id});};
  const practice=()=>{setSheet(null);setArranging(false);setSelected(null);onAction({type:"start",node:practiceNode.id,practice:true});};
  const visitStop=(choice?:"supplies"|"challenge")=>{
    if(node.unlock&&!truck.firstClears.includes(node.id))setDiscovery({node:node.id,machine:node.unlock});
    onAction({type:"marketVisit",node:node.id,...(choice?{choice}:{})});setSheet(null);
  };
  const finish=()=>{onAction({type:"finish"});if(run?.phase==="failed")onHome();else setSheet("route");};
  const endTrip=()=>{onAction({type:"abandon"});onAction({type:"finish"});onHome();};
  const showRoute=()=>openSheet("route");
  const makePostcard=async()=>{
    const scene=worldElement.current?.querySelector("svg");if(!scene||postcardBusy)return;
    setPostcardBusy(true);setPostcardNotice("");
    try{await saveTruckPostcard(scene,sign);setPostcardNotice("Your truck postcard is ready in your downloads.");}
    catch{setPostcardNotice("The postcard didn't come out. Please try again.");}
    finally{setPostcardBusy(false);}
  };

  return <section className={css.truck} aria-label="Food truck adventure">
    <header className={css.header}><div className={css.identity}><TruckBadgeArt color={paint.color}/><div className={css.identityText}><div className={css.eyebrow}>Domain Kitchen · on the road</div><h1 className={css.title}>{sign}</h1><p className={css.subtitle}>{dimensions.name} · a little adventure of your own</p>{eventLabel&&<div className={css.event}>{eventLabel}{eventLocked?" · equal loadout":""}</div>}</div></div><div className={css.headerActions}><span className={css.coin}><IconCoin size={20}/>{Math.floor(coins).toLocaleString()}</span><button type="button" className={css.home} onClick={goHome} aria-label={inRun?"Save this shift and return home":"Return to my restaurant"}>Back home</button></div></header>
    <div className={css.stage}>
      {inRun?<div className={css.statusBar}><div><small>{run!.practice?"Practice · no rewards":`Stop ${node.id} of 12`}</small><strong>{run!.served} / {run!.target} served</strong><div className={css.progressTrack}><i style={{width:`${Math.min(100,run!.served/run!.target*100)}%`}}/></div></div><div><small>Service time</small><strong className={css.clock}>{timeLabel(run!.tick)}</strong></div><button type="button" className={css.iconButton} aria-label={paused?"Resume service":"Pause service"} onClick={()=>onAction({type:paused?"resume":"pause"})}>{paused?"▶":"Ⅱ"}</button></div>:<div className={css.signpost}><span className={css.nodeTag}><RouteIcon kind={nodeKind} size={13}/> Stop {node.id} of 12</span><h2>{node.name}</h2><p>{nodeKind==="service"?"A new place. A few hungry faces. Make it a lovely lunch.":nodeKind==="market"?"A friendly stop for something useful. Everything you pick up is yours to keep.":"A little surprise, just around the corner."}</p><div className={css.menuChips}>{availableDishes.map(dish=><div key={dish}><TruckDishArt dish={dish} size={31}/>{DISHES[dish].short}</div>)}</div></div>}
      <div className={css.world} ref={worldElement}><TruckWorldArt width={dimensions.w} height={dimensions.h} paint={appearance.color} sign={sign} stations={stations} player={{...player,held:player.held?.kind,working:!!player.job,moving:!!player.path.length}} helpers={run?.helpers.map(helper=>({...helper,held:helper.held?.kind,working:!!helper.job,moving:!!helper.path.length}))} customers={inRun||result?run!.customers:[]} setup={arranging} paused={paused} onStation={interact} onTile={ground}/></div>
      {inRun&&<div className={css.orders} aria-label="Waiting orders">{run!.customers.map(customer=><div key={customer.id} className={css.order} aria-label={`${DISHES[customer.dish].name}, ${timeLabel(customer.patience)} patience remaining`}><TruckDishArt dish={customer.dish} size={41}/><span>{DISHES[customer.dish].short}</span><div className={css.patience}><i style={{width:`${Math.max(0,customer.patience/customer.maxPatience*100)}%`,background:customer.patience/customer.maxPatience<.3?"#c57553":undefined}}/></div></div>)}</div>}
      <p className={css.sceneHint}>{arranging?placing?`Tap an empty tile to place your ${truckMachine(placing)?.name.toLowerCase()}.`:selected?"Tap an empty tile to move this station.":"Choose a station, then choose its new spot.":inRun?<>{paused?"Your kitchen is paused. Everything will be right here.":"Tap a station. Your chef will walk there and get to work."}<span className={css.desktopHint}> <kbd>WASD</kbd> move · <kbd>E</kbd> work</span></>:"Arrange your little kitchen before the first guest arrives."}</p>
    </div>
    <footer className={css.controls}>
      <div className={`${css.notice} ${error?css.error:""}`} role="status" aria-live="polite">{error||readyError||run?.notice||(!inRun?"Coins, equipment and discoveries are always yours to keep.":" ")}</div>
      {arranging&&!inRun?<><div className={css.editor}><div className={css.editorInfo}><strong>{placing?truckMachine(placing)?.name:chosenStation?.label??"Make room for good food"}</strong><small>{placing?"Choose an empty floor tile.":chosenStation?"Move, turn, or tuck it away.":"Select a station in your truck."}</small></div><button type="button" className={css.secondary} disabled={selected==null||busy||eventLocked} onClick={()=>selected!=null&&onAction({type:"rotate",stationId:selected})}>Rotate</button><button type="button" className={css.secondary} disabled={selected==null||busy||eventLocked} onClick={()=>{if(selected!=null)onAction({type:"store",stationId:selected});setSelected(null);}}>Store</button><button type="button" className={css.primary} onClick={()=>{setArranging(false);setSelected(null);setPlacing(null);}}>Done</button></div><div className={css.storeRail} aria-label="Stored truck equipment">{TRUCK_MACHINES.filter(machine=>(truck.machineInventory[machine.id]??0)>0).map(machine=><button type="button" key={machine.id} aria-pressed={placing===machine.id} onClick={()=>{setPlacing(machine.id);setSelected(null);}}>{machine.name}<small>{truck.machineInventory[machine.id]} in storage</small></button>)}</div></>:<div className={css.actionRow}>
        {inRun?<><div className={css.context}><div className={css.heldArt}>{player.held?<TruckDishArt dish={player.held.kind} size={53}/>:<div className={css.heldEmpty}/>}</div><div><div className={css.smallLabel}>{player.job?"Getting it ready":"In your hands"}</div><strong>{player.held?ITEM_LABELS[player.held.kind]:"Ready for something good"}</strong><small>{walkingHint??(player.job?"Your chef is working. The station bar shows progress.":player.held?NEXT_ACTION[player.held.kind]:emptyHandHint)}</small></div></div><button type="button" className={paused?css.primary:css.secondary} onClick={()=>paused?onAction({type:"resume"}):openSheet("recipes")}>{paused?"Resume service":"Recipe cards"}</button>{player.held?.kind==="burnt"&&<button type="button" className={css.secondary} onClick={()=>onAction({type:"discard"})}>Discard</button>}</>:<><button type="button" className={css.secondary} onClick={showRoute}>The route</button><button type="button" className={css.secondary} onClick={()=>{setArranging(true);setSelected(null);}} disabled={eventLocked}>Arrange</button><button type="button" className={css.secondary} onClick={()=>openSheet("kit")}>My truck</button><button type="button" className={css.primary} disabled={busy||!!readyError} onClick={()=>nodeKind==="service"?start():nodeKind==="market"?openSheet("kit"):showRoute()}>{nodeKind==="service"?"Open for lunch":nodeKind==="market"?"Visit the market":"Open the surprise"}</button></>}
      </div>}
      {inRun&&<div className={css.quickStations} aria-label="Cooking stations">{stations.map(station=><button key={station.id} type="button" disabled={paused} style={{"--station-color":truckMachine(station.machineId as TruckMachineId)?.color} as CSSProperties} aria-pressed={selected===station.id} onClick={()=>interact(station.id)}><span/>{station.label}</button>)}</div>}
      {paused&&<div className={css.practiceRow}><button type="button" className={css.textButton} disabled={busy} onClick={endTrip}>{run!.practice?"Finish practice":"End trip & keep rewards"}</button></div>}
      {!inRun&&!arranging&&!result&&<div className={css.practiceRow}><button type="button" className={css.textButton} disabled={busy||!!practiceError} title={practiceError??"Try this kitchen as often as you like. No rewards or route changes."} onClick={practice}>Practice this kitchen</button><small>No rewards or route changes</small></div>}
    </footer>

    {sheet==="pantry"&&<TruckSheet title="Something fresh" kicker={pantrySource==="fridge"?"Your little fridge":"Ingredient crates"} onClose={()=>setSheet(null)}><p className={css.sheetIntro}>Choose one thing to carry. The kitchen keeps running while you choose.</p><div className={css.ingredientGrid}>{ingredientChoices.map(ingredient=><button type="button" className={css.ingredientChoice} key={ingredient.choice} onClick={()=>{if(pantryId!=null)onAction({type:"interact",stationId:pantryId,choice:ingredient.choice});setSheet(null);}}><TruckDishArt dish={ingredient.art} size={61}/><span>{ingredient.name}<small>Next: {ingredient.next}</small></span></button>)}</div>{!ingredientChoices.length&&<p className={css.sheetIntro}>You won't need anything from here for today's menu.</p>}</TruckSheet>}
    {sheet==="recipes"&&<TruckSheet title="A little cooking know-how" kicker="Today's recipe cards" onClose={()=>setSheet(null)}><p className={css.sheetIntro}>One thing in your hands, one step at a time. Your service is paused while you read.</p><div className={css.recipeGuide}>{availableDishes.map(dish=><article className={css.recipeCard} key={dish}><TruckDishArt dish={dish} size={145}/><h3>{DISHES[dish].name}</h3><p>{DISHES[dish].description}</p><div className={css.steps}>{DISHES[dish].steps.map(step=><span key={step}>{step}</span>)}</div></article>)}</div><p className={css.sheetIntro} style={{margin:"18px 0 0"}}>Hands full? Leave your item on a spare counter. After serving, collect dirty dishes from the window and wash them at the sink.</p></TruckSheet>}
    {sheet==="route"&&<TruckSheet title="The Garden District" kicker="Your food-truck adventure" onClose={()=>setSheet(null)}><p className={css.sheetIntro}>Twelve little stops: lively lunches, friendly markets, and discoveries to bring home. Pause any shift and come back when you like.</p><div className={css.route}>{TRUCK_LADDER.map(stop=>{
      const kind=stop.kind,done=truck.firstClears.includes(stop.id),locked=stop.id!==nextNode;
      return <button type="button" key={stop.id} className={`${css.routeNode} ${done?css.cleared:""}`} aria-pressed={node.id===stop.id} disabled={locked||inRun} onClick={()=>setSelectedNode(stop.id)}><span className={css.routeNumber}>{done?"✓":stop.id}</span><strong>{stop.name}</strong><small>{kind==="market"?"Market & equipment":kind==="gift"?"A neighborhood surprise":`About ${Math.ceil(stop.seconds/60)} min · ${stop.target} happy guests`}</small></button>;
    })}</div><div className={css.routeFooter}><p>{node.name}<br/>{nodeKind==="service"?truck.firstClears.includes(node.id)?"A familiar stop, with coins for each order.":`${node.clearCoins} first-clear coins, plus every order`:"Take a moment. There is no rush here."}</p>{inRun?<button className={css.primary} onClick={()=>{setSheet(null);onAction({type:"resume"});}}>Back to service</button>:nodeKind==="service"?<button className={css.primary} disabled={busy||!!readyError} onClick={start}>Let's cook</button>:nodeKind==="market"?<button className={css.primary} disabled={busy} onClick={()=>{setKitTab("equipment");setSheet("kit");}}>Browse the market</button>:<button className={css.primary} disabled={busy} onClick={()=>visitStop("supplies")}>Open my parcel</button>}</div></TruckSheet>}
    {sheet==="kit"&&<TruckSheet title="Your little kitchen on wheels" kicker="Make it work. Make it yours." onClose={()=>setSheet(null)} tabs={<div className={css.sheetTabs}>{([['equipment','Equipment'],['crew','Helping hands'],['upgrades','Better tools'],['style','Paint & sign']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={kitTab===id} onClick={()=>setKitTab(id)}>{label}</button>)}</div>}>
      <p className={css.sheetIntro}>{eventLocked?"This event uses its published loadout. Your own truck is waiting safely at home.":"Everything you buy stays with you, even when a day doesn't go to plan."}</p>
      {!inRun&&nodeKind==="market"&&<section className={css.marketChoices} aria-label="Choose your next stretch"><h3>Which road feels right today?</h3><p>{!truck.firstClears.includes(node.id)?node.unlock?`Either way, a free ${truckMachine(node.unlock)?.name.toLowerCase()} is coming home with you.`:"Either way, a few ingredients are yours to keep.":"Everything from your earlier visits is already yours to keep."}</p><div className={css.choiceGrid}><button className={css.marketChoice} disabled={busy} onClick={()=>visitStop("supplies")}><IconChefHat size={27}/><strong>Supplies & a steady day</strong><span>Collect your supplies and continue with the usual guest patience.</span></button><button className={css.marketChoice} disabled={busy} onClick={()=>visitStop("challenge")}><IconMedal size={27}/><strong>A little extra challenge</strong><span>Guests have 25% less patience next shift. Earn 15 extra coins if it is your first clear.</span></button></div></section>}
      {kitTab==="equipment"&&<><div className={css.grid}>{TRUCK_MACHINES.map(machine=>{
        const unlocked=truck.unlockedMachineIds.includes(machine.id),owned=allOwned(machine.id),stored=truck.machineInventory[machine.id]??0;
        return <article key={machine.id} className={css.card}><div className={css.cardArt}><TruckMachineArt machineId={machine.id} size={65}/></div><h3>{machine.name}</h3><p>{machine.description}</p><span className={css.owned}>{owned?`${owned} owned${stored?` · ${stored} stored`:""}`:unlocked?"Ready for your kitchen":"Discover it on the route"}</span><span className={css.price}><IconCoin size={15}/>{machine.cost}</span><button type="button" className={css.secondary} disabled={busy||inRun||eventLocked||!unlocked||machine.cost<=0||coins<machine.cost} onClick={()=>onAction({type:"buyMachine",machineId:machine.id})}>{machine.cost<=0?"Included with your truck":unlocked?"Buy for my truck":machine.id==="fryer"?"Found at stop 3":"Found at stop 7"}</button>{stored>0&&<button className={css.secondary} disabled={inRun||eventLocked} onClick={()=>{setPlacing(machine.id);setSelected(null);setArranging(true);setSheet(null);}}>Place in truck</button>}{machine.homeItemId&&owned>0&&<button className={css.textButton} onClick={()=>onPlaceHome(machine.homeItemId!)}>Use at home</button>}</article>;
      })}</div><p className={css.sheetIntro} style={{margin:"21px 0 13px"}}>A little more room for your ideas.</p><div className={css.grid}>{TRUCK_SIZES.map(size=><article className={css.card} key={size.id}><div className={css.cardArt}><TruckBadgeArt size={size.id==="small"?58:size.id==="medium"?72:85} color={paint.color}/></div><h3>{size.name}</h3><p>{size.w} × {size.h} kitchen · room for {size.helpers} {size.helpers===1?"helper":"helpers"}</p><span className={css.cardFoot}>{size.unlockNode?`After service day ${size.unlockNode}`:"Your first kitchen"}</span><button className={css.secondary} disabled={busy||inRun||eventLocked||TRUCK_SIZES.findIndex(s=>s.id===size.id)!==TRUCK_SIZES.findIndex(s=>s.id===truck.size)+1||truck.bestDay<size.unlockNode||coins<size.cost} onClick={()=>onAction({type:"buySize",size:size.id})}>{truck.size===size.id?"Your current truck":`${size.cost} coins · make room`}</button></article>)}</div></>}
      {kitTab==="crew"&&<><div className={css.grid}>{ROLES.map(role=>{
        const hired=truck.crew.filter(helper=>helper.role===role.id).length;
        return <article className={css.card} key={role.id}><div className={css.cardArt}><span className={css.crewPortrait}><IconChefHat size={31}/></span></div><h3>{role.name}</h3><p>{role.description}</p><span className={css.owned}>{hired?`${hired} in your crew`:"A friendly face for a busy day"}</span><span className={css.price}><IconCoin size={15}/>{TRUCK_PRICES.hire[role.id]}</span><button className={css.secondary} disabled={busy||inRun||eventLocked||hired>0||coins<TRUCK_PRICES.hire[role.id]||truck.crew.length>=dimensions.helpers} onClick={()=>onAction({type:"hire",role:role.id})}>{hired?"Already aboard":truck.crew.length>=dimensions.helpers?"Your crew is full":"Welcome aboard"}</button></article>;
      })}</div><p className={css.sheetIntro} style={{marginTop:18}}>{truck.crew.length} of {dimensions.helpers} crew spaces used. A larger truck makes room for more helping hands.</p></>}
      {kitTab==="upgrades"&&<div className={css.grid}>{TECHS.map(tech=>{
        const level=truck.techLevels[tech.id],price=TRUCK_PRICES.tech[level],max=price==null;
        return <article className={css.card} key={tech.id}><div className={css.cardArt}><IconWrench size={39}/></div><h3>{tech.name}</h3><p>{tech.description}</p><span className={css.owned}>Level {level}{max?" · fully upgraded":""}</span>{!max&&<span className={css.price}><IconCoin size={15}/>{price}</span>}<button className={css.secondary} disabled={max||busy||inRun||eventLocked||coins<price} onClick={()=>onAction({type:"upgrade",tech:tech.id})}>{max?"Lovely as it is":"Upgrade my tools"}</button></article>;
      })}</div>}
      {kitTab==="style"&&<><div style={{display:"flex",justifyContent:"center"}}><TruckBadgeArt size={150} color={paint.color}/></div><div className={css.paintRow}>{TRUCK_PAINTS.map(color=><button key={color.id} type="button" className={css.paint} style={{background:color.color}} aria-label={color.label} aria-pressed={truck.color===color.id} disabled={inRun||eventLocked||busy} onClick={()=>onAction({type:"setCosmetic",color:color.id})}/>)}</div><label className={css.inputLabel}>The name over your window<input value={signDraft} maxLength={24} disabled={inRun||eventLocked} onChange={event=>setSignDraft(event.target.value)} placeholder={restaurantName}/></label><div style={{textAlign:"center"}}><button className={css.secondary} disabled={busy||inRun||eventLocked||!signDraft.trim()} onClick={()=>onAction({type:"setCosmetic",sign:signDraft.trim()})}>Paint my sign</button></div><div className={css.postcardPanel}><p>A little souvenir of your kitchen on wheels.</p><button type="button" className={css.secondary} disabled={postcardBusy} onClick={()=>void makePostcard()}>{postcardBusy?"Making your postcard…":"Save truck postcard"}</button><small role="status" aria-live="polite">{postcardNotice||"A picture saved to this device."}</small></div></>}
    </TruckSheet>}
    {discoveryConfirmed&&discoveredMachine&&<TruckSheet title="Look what you brought home!" kicker="A permanent discovery" onClose={()=>setDiscovery(null)}><div className={css.discovery}><div className={css.discoveryArt}><TruckMachineArt machineId={discoveredMachine.id} size={172}/></div><h3>{discoveredMachine.name}</h3><p>One for your food truck. One for your restaurant. Both are yours to keep, through every adventure.</p><div className={css.discoveryActions}><button type="button" className={css.primary} disabled={busy} onClick={()=>{if(!discoveryConfirmed||!discoveredMachine.homeItemId)return;setDiscovery(null);onPlaceHome(discoveredMachine.homeItemId);}}>Place in restaurant</button><button type="button" className={css.secondary} disabled={busy||(truck.machineInventory[discoveredMachine.id]??0)<1} onClick={()=>{if(!discoveryConfirmed)return;setPlacing(discoveredMachine.id);setSelected(null);setArranging(true);setDiscovery(null);}}>Install in truck</button><button type="button" className={css.textButton} disabled={busy} onClick={()=>setDiscovery(null)}>Keep exploring</button></div></div></TruckSheet>}
    {result&&!sheet&&<div className={css.overlay}><section className={css.result} ref={resultPanel} onKeyDown={event=>{if(event.key!=="Tab")return;const buttons=resultPanel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");if(!buttons?.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}} role="dialog" aria-modal="true" aria-labelledby="truck-result-title"><div className={css.resultArt}>{run!.phase==="cleared"?<IconMedal size={62}/>:<TruckBadgeArt size={92} color={paint.color}/>}</div><div className={css.eyebrow}>{run!.practice?"A little practice":run!.phase==="cleared"?"You made their day":"A fresh start is waiting"}</div><h2 id="truck-result-title">{run!.phase==="cleared"?"That was a lovely lunch.":"Take the slow road home."}</h2><p>{run!.practice?"A little more confidence for your next adventure. Practice changes no coins, equipment, or route progress.":run!.phase==="cleared"?"The last plate is cleared, the coins are tucked away, and another little corner of the neighborhood awaits.":`${run!.failure||"A guest couldn't wait any longer."} Your coins, equipment and discoveries stay with you. Your next adventure begins with a slower day.`}</p><div className={css.resultStats}><div><strong>{run!.served}</strong><small>Happy guests</small></div><div><strong>{run!.coinsEarned}</strong><small>Coins earned</small></div><div><strong>{truck.bestDay}</strong><small>Best service day</small></div></div><div className={css.resultActions}><button className={css.primary} disabled={busy} onClick={finish}>{run!.phase==="cleared"?"See what is next":"Return to my restaurant"}</button>{run!.phase==="cleared"&&<button className={css.secondary} onClick={goHome}>My restaurant</button>}</div></section></div>}
  </section>;
}
