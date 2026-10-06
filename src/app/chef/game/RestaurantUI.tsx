"use client";

import { useEffect, useRef, useState } from "react";
import type { PanelSnapshot } from "./DialsPanel";
import { ITEMS, MARKETS, COLLECTION_LP_DAYS, type ItemDef } from "./_engine/items";
import { type HireKind, type WorldState } from "./_engine/world";
import { ingredient, INGREDIENTS, DAILY_SPECIALS, nextRecipe, MAX_DISH_LEVEL } from "./_engine/pantry";
import { DISHES, MENU_SLOTS, availableDishes, dishDef, dishUnlockHint } from "./_engine/cookbook";
import { WELCOME_DISH_ID } from "./_engine/onboarding";
import { THEME_META } from "./_view/art-manifest";
import { furniturePreview } from "./_view/furniture-preview";
import { Sheet } from "./_ui/primitives";
import { IconBook, IconCart, IconChefHat, IconCoin, IconMedal, IconMore, IconStar, IconWrench } from "./_ui/icons";
import css from "./_ui/restaurant.module.css";
import shop from "./ShopCatalog.module.css";
import cook from "./Cookbook.module.css";
import { dishPresentation } from "./_view/dish-presentation";
import { passiveTerms } from "./_engine/launch-progression";

export function NeighborsIcon({size=24}:{size?:number}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3.2 3.2 0 0 1 0 6M18 14a5 5 0 0 1 4 5v2"/></svg>;
}

export function FoodArt({dish="margherita",size=120,mastered=false}:{dish?:string;size?:number;mastered?:boolean}) {
 const recipe=dishDef(dish) ?? DISHES[0];
 const art=dishPresentation(recipe.art,mastered);
 return <span style={{display:"inline-grid",placeItems:"center",position:"relative",width:size,height:size,flexShrink:0}}>
  <svg viewBox={art.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={recipe.name+(mastered?", mastered presentation":"")} style={{display:"block",width:"100%",height:"100%",overflow:"visible"}}><image href={art.svgSrc} width={art.width} height={art.height}/></svg>
  {mastered&&<span aria-hidden="true" style={{position:"absolute",right:3,top:9,color:"#d0a048"}}><IconStar size={21}/></span>}
 </span>;
}

export function IngredientArt({id,size=30}:{id:string;size?:number}) {
 const colors:Record<string,string>={tomato:"#cf644a",herb:"#72944f",flour:"#d9be7b",pepper:"#b84a3e",cheese:"#e9bb5a",lemon:"#e5c258",saffron:"#d49251",truffle:"#886b51"};
 return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="34" rx="13" ry="3" fill="#75694e" opacity=".12"/>{id==="herb"?<><path d="m18 34 5-27M21 18Q2 1 6 19q4 12 15 4M22 25q20-24 13-25-15 5-13 25" fill={colors[id]} stroke="#638347" strokeWidth="1.5"/></>:id==="flour"?<><path d="m13 7-3 25q10 5 20 0L27 7z" fill="#eee0b8" stroke="#b4a37b"/><path d="M11 12h17M18 28l5-13m-4 8-4-4m6 1 5-1" stroke="#bd9d53" strokeWidth="2"/></>:id==="cheese"?<><path d="M7 20 24 8l10 11v15H7z" fill={colors[id]}/><path d="m7 20 27-1-10-11z" fill="#f2d689"/><circle cx="17" cy="26" r="3" fill="#ca963f"/><circle cx="28" cy="29" r="2" fill="#ca963f"/></>:<><ellipse cx="20" cy="23" rx={id==="pepper"?8:13} ry="12" transform={id==="pepper"?"rotate(30 20 23)":undefined} fill={colors[id]||"#c39668"}/><ellipse cx="16" cy="19" rx="4" ry="3" fill="#fff" opacity=".18"/><path d="m20 13-7-4 7-1 6-4-1 8" fill="#64864c"/></>}</svg>;
}

export function ParcelArt({size=144,open=false}:{size?:number;open?:boolean}) {
 return <svg width={size} height={size} viewBox="0 0 160 160" fill="none" aria-hidden="true" focusable="false">
  <ellipse cx="80" cy="137" rx="49" ry="12" fill="#687044" opacity=".12"/>
  <path d="m31 76 49 24 49-24v42l-49 25-49-25Z" fill="#d6ae78" stroke="#957451" strokeWidth="2" strokeLinejoin="round"/>
  <path d="m80 100 49-24v42l-49 25Z" fill="#bd9465"/>
  <path d="m31 76 49-25 49 25-49 25Z" fill={open?"#96764f":"#eed3a3"} stroke="#957451" strokeWidth="2" strokeLinejoin="round"/>
  {open?<>
   <path d="m31 76-18-19 49-25 18 19Z" fill="#eed3a3" stroke="#957451" strokeWidth="2" strokeLinejoin="round"/>
   <path d="m80 51 20-19 47 24-18 20Z" fill="#ead09d" stroke="#957451" strokeWidth="2" strokeLinejoin="round"/>
   <path d="m31 76 49 25-14 20-49-25Zm49 25 49-25 15 19-49 25Z" fill="#f1d9ad" stroke="#957451" strokeWidth="2" strokeLinejoin="round"/>
   <circle cx="72" cy="71" r="16" fill="#d17658"/><path d="m71 56-9-8 10 3 6-10 1 12 8 1-10 4Z" fill="#698d5b"/>
   <path d="M98 82Q78 37 96 33q16 10 2 49Z" fill="#729753"/><path d="M98 82q23-34 34-20-5 22-34 20Z" fill="#96ad68"/>
  </>:<>
   <path d="m51 65 50 25v42l-14 7V96L38 72Z" fill="#6e8e65"/>
   <path d="m105 63 13 7-49 26v42l-13-7V90Z" fill="#78986c"/>
   <path d="M80 76Q41 69 59 55q12-3 21 21Zm0 0q8-33 23-20 7 15-23 20Z" fill="#93ae7d" stroke="#5e8058" strokeWidth="2"/>
   <ellipse cx="80" cy="76" rx="7" ry="5" fill="#628254"/>
  </>}
  <path d="m91 108 22-11v22l-22 11Z" fill="#fff4d7" stroke="#a1845c" strokeWidth="1.5"/>
  <path d="m97 116 4 3 7-13" stroke="#6e8a56" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>;
}

export interface DeliveryParcelProps {
 available:boolean; busy?:boolean; onOpen:()=>void; onClose?:()=>void; contents?:Record<string,number>|null;
 onContinue?:()=>void; continueLabel?:string;
}
/** Contents come from a completed claim. Rendering never grants ingredients. */
export function DeliveryParcel({available,busy=false,onOpen,onClose,contents,onContinue,continueLabel}:DeliveryParcelProps) {
 const revealed=contents!=null;
 const entries=Object.entries(contents??{}).filter(([,quantity])=>quantity>0);
 const content=<section className={css.delivery} aria-busy={busy}>
  <ParcelArt size={158} open={revealed}/>
  <div className={css.eyebrow}>{revealed?"A little pantry happiness":"Something good at your door"}</div>
  <h3>{revealed?"Fresh ingredients, ready to cook.":available?"Your kitchen delivery is here.":"All caught up."}</h3>
  <p>{revealed?"These ingredients are now in your pantry. Pick a recipe and make it your own.":available?"Untie the ribbon and see what is inside.":"Your next available delivery will appear here."}</p>
  {revealed?<><div className={css.deliveryContents} role="status" aria-label="Ingredients received">{entries.length?entries.map(([id,quantity])=><div key={id}><IngredientArt id={id} size={42}/><strong>+{quantity}</strong><span>{ingredient(id)?.label??id}</span></div>):<p>Your pantry is up to date.</p>}</div>{(onContinue||onClose)&&<button type="button" className={css.buy} onClick={onContinue??onClose}>{continueLabel??(onContinue?"Choose a recipe":"Back to my kitchen")}</button>}</>:<button type="button" className={css.buy} disabled={!available||busy} onClick={onOpen}>{busy?"Opening your delivery…":available?"Open my parcel":"Delivery collected"}</button>}
 </section>;
 return onClose?<Sheet title="Kitchen delivery" onClose={onClose}>{content}</Sheet>:content;
}

export function RestaurantHUD({name,snap,active,onOpen,onDecorate,onSound}:{name:string;snap:PanelSnapshot;active:string|null;onOpen:(id:string|null)=>void;onDecorate:()=>void;onSound:()=>void}) {
 const needsCare=snap.trashCount>0||snap.toiletsBroken>0||(snap.cleanliness??100)<65||(snap.equipment??100)<65;
 return <>
  <header className={css.header}>
   <button className={css.identity} onClick={()=>onOpen("name")} aria-label="Name your restaurant"><span className={css.crest}><IconChefHat size={29}/></span><span><span className={css.eyebrow}>Domain Kitchen</span><strong className={css.name}>{name||"The Little Kitchen"}</strong><span className={css.subtitle}>Your restaurant. Your next adventure.</span></span></button>
   <div className={css.headerStats}>
    <span className={css.metric}><IconCoin size={23}/><span><strong>{Math.floor(snap.coins).toLocaleString()}</strong><small>Kitchen coins</small></span></span>
    <span className={css.metric}><IconStar size={22}/><span><strong>{Math.round(snap.quality)}%</strong><small>Service rating</small></span></span>
    <button className={css.metric} aria-label="Restaurant settings" onClick={()=>onOpen("more")}><IconMore size={22}/></button>
   </div>
  </header>
  <div className={css.condition}><span className={css.openLabel}>{needsCare?"A little care needed":"Open & welcoming"}</span><p>{needsCare?`${snap.toiletsBroken?"A toilet needs repairing. ":(snap.equipment??100)<65?"Equipment needs care. ":""}${snap.trashCount||(snap.cleanliness??100)<65?"A quick tidy will help.":""}`:`${snap.seatsOpen} seats · ${snap.chefs+snap.waiters} happy hands`}</p></div>
  <nav className={css.dock} aria-label="Restaurant navigation">
   {[{id:"truck",label:"Cook",icon:<IconChefHat/>},{id:"shop",label:"Decorate",icon:<IconWrench/>},{id:"friends",label:"Friends",icon:<NeighborsIcon/>}].map(t=><button key={t.label} aria-pressed={active===t.id} onClick={()=>t.id==="shop"?onDecorate():onOpen(t.id)}>{t.icon}<span>{t.label}</span></button>)}
  </nav>
 </>;
}

/** A catalog viewport trims only the sprite's empty registration margins. */
function FurniturePreview({item,theme}:{item:ItemDef;theme:string}) {
 const art=furniturePreview(item,theme);
 return <svg className={shop.art} viewBox={art.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={item.label} focusable="false">
  <image href={art.src} width={art.width} height={art.height}/>
 </svg>;
}

function furnitureCategory(item:ItemDef):string {
 switch(item.kind) {
  case "table": return "Dining table";
  case "chair": return "Dining seat";
  case "stove": return "Cooking equipment";
  case "counter": return "Serving counter";
  case "toilet": return "Bathroom fixture";
  case "partition": return "Room layout";
  case "bench": return "Waiting area";
  case "wallArt": return "Wall decoration";
  default: return "Customer comfort";
 }
}

const SHOP_FILTERS=[
 {id:"all",label:"All pieces"}, {id:"dining",label:"Dining"}, {id:"kitchen",label:"Kitchen"},
 {id:"decor",label:"Decor"}, {id:"bathroom",label:"Bathroom"}, {id:"stored",label:"In storage"},
];

export function ShopCatalog({snap,theme,onBuyHire,onBuyItem,onSellItem,onPlaceItem,onExpand,featured=[],featuredOnly=false,onBuyIngredient,ingredientOffers=[],eligibleMarkets,unlockedMachines=[],onArrange,expansion}:{snap:PanelSnapshot;theme:string;onBuyHire:(hire:HireKind)=>void;onBuyItem:(id:string)=>void;onSellItem:(id:string)=>void;onPlaceItem:(id:string)=>void;onExpand:()=>void;featured?:string[];featuredOnly?:boolean;eligibleMarkets?:string[];unlockedMachines?:string[];onArrange?:()=>void;expansion?:React.ReactNode;onBuyIngredient?:(id:string)=>void;ingredientOffers?:{id:string,cost:number,quantity:number,purchased?:boolean}[]}) {
 const [tab,setTab]=useState("essentials"),[filter,setFilter]=useState("all"),[selectedId,setSelectedId]=useState<string|null>(null);
 const catalogRef=useRef<HTMLDivElement>(null),detailRef=useRef<HTMLElement>(null),lastPreview=useRef<string|null>(null);
 const coins=Math.floor(snap.coins);
 const selected=ITEMS.find(item=>item.id===selectedId);
 const tabs=[{id:"essentials",label:"Everyday pieces"},{id:"today",label:"Today's finds"},...Object.entries(THEME_META).map(([id,v])=>({id,label:v.label})),...MARKETS.map(m=>({id:m.collection,label:m.collectionName}))];
 const collectionLabel=tabs.find(entry=>entry.id===tab)?.label??"Furniture";
 const items=ITEMS.filter(item=>{
  if(item.cost<=0||!(tab==="today"?featured.includes(item.id):item.collection===tab))return false;
  if(filter==="stored")return (snap.inventory[item.id]||0)>0;
  if(filter==="dining")return ["table","chair","bench"].includes(item.kind);
  if(filter==="kitchen")return ["stove","counter"].includes(item.kind);
  if(filter==="bathroom")return ["toilet","partition"].includes(item.kind);
  if(filter==="decor")return ["plant","rug","doormat","partition","wallArt"].includes(item.kind);
  return true;
 });
 function isLocked(item:ItemDef) {
  if(item.machine&&item.machine!=="stove"&&!unlockedMachines.includes(item.machine))return true;
  const market=MARKETS.find(entry=>entry.collection===item.collection);
  return !!market&&(eligibleMarkets?!eligibleMarkets.includes(market.id):(snap.lpDays[market.id]||0)<COLLECTION_LP_DAYS);
 }
 const market=MARKETS.find(entry=>entry.collection===tab);
 const collectionLocked=!!market&&(eligibleMarkets?!eligibleMarkets.includes(market.id):(snap.lpDays[market.id]||0)<COLLECTION_LP_DAYS);

 useEffect(()=>{
  if(selectedId) {
   detailRef.current?.focus({preventScroll:true});
   detailRef.current?.scrollIntoView({block:"start"});
  } else if(lastPreview.current) {
   const opener=catalogRef.current?.querySelector<HTMLButtonElement>(`[data-preview="${lastPreview.current}"]`)
    ??catalogRef.current?.querySelector<HTMLButtonElement>('nav button[aria-pressed="true"]');
   opener?.focus({preventScroll:true});
   opener?.scrollIntoView({block:"nearest"});
   lastPreview.current=null;
  }
 },[selectedId]);

 function purchaseActions(item:ItemDef) {
  const stored=snap.inventory[item.id]||0,locked=isLocked(item),missing=Math.max(0,item.cost-coins);
  const notFeatured=featuredOnly&&item.collection!=="essentials"&&!item.market&&!featured.includes(item.id);
  return <div className={shop.purchase}>
   <div className={shop.priceRow}><strong aria-label={`${item.cost} coins`}><IconCoin size={19}/>{item.cost.toLocaleString()}<span>coins</span></strong><small>{stored?stored+" stored":""}</small></div>
   <button type="button" className={shop.buy} disabled={locked||notFeatured||missing>0} aria-label={locked?`${item.label}: ${item.machine?"discover on your food truck":"collection locked"}`:notFeatured?`${item.label}: not featured today`:missing?`${item.label}: need ${missing} more coins`:`Buy ${item.label} for ${item.cost} coins`} onClick={()=>onBuyItem(item.id)}>
    {locked?(item.machine?"Discover on your truck":"Collection locked"):notFeatured?"Not featured today":missing?`Need ${missing.toLocaleString()} more coins`:"Buy "+item.label}
   </button>
   {stored>0&&<div className={shop.storedActions}>
    <button type="button" onClick={()=>onPlaceItem(item.id)} aria-label={`Place ${item.label} from storage`}>Place stored</button>
    <button type="button" onClick={()=>onSellItem(item.id)} aria-label={`Sell one stored ${item.label} for ${Math.floor(item.cost/2)} coins`}>Sell · {Math.floor(item.cost/2)}</button>
   </div>}
  </div>;
 }

 return <div className={shop.catalog} ref={catalogRef}>
  {selected?<section className={shop.detail} ref={detailRef} tabIndex={-1} aria-label={selected.label+" details"}>
   <button type="button" className={shop.back} onClick={()=>setSelectedId(null)}>← Back to {collectionLabel}</button>
   <div className={shop.detailPicture}><FurniturePreview item={selected} theme={theme}/></div>
   <div className={shop.detailHeading}><div><span className={shop.category}>{furnitureCategory(selected)}</span><h3>{selected.label}</h3></div><span className={shop.balance}><IconCoin size={20}/>{coins.toLocaleString()}</span></div>
   <p className={shop.description}>{selected.desc}</p>
   <dl className={shop.specs}>
    <div><dt>Placement</dt><dd>{selected.layer==="wall"?"On a wall":selected.kind==="rug"?"Covers a 2 × 2 tile area":`${selected.footprint?.width??selected.cells} × ${selected.footprint?.height??1} floor tile${(selected.footprint?.width??selected.cells)>1?"s":""}`}</dd></div>
    <div><dt>Walking space</dt><dd>{selected.solid?"Guests walk around it":selected.layer==="wall"?"Keeps the floor clear":"Guests can walk over it"}</dd></div>
    <div><dt>In storage</dt><dd>{snap.inventory[selected.id]||0}</dd></div>
   </dl>
   {purchaseActions(selected)}
   <p className={shop.hint}>New pieces go into storage, ready to place in your restaurant.</p>
  </section>:<>
   <header className={shop.heading}><div><span className={shop.eyebrow}>The furniture shop</span><h3>Make room for your style.</h3><p>Choose a piece. Make it yours.</p></div><span className={shop.balance} aria-label={`${coins} kitchen coins available`}><IconCoin size={22}/><strong>{coins.toLocaleString()}</strong><small>coins</small></span></header>
   <div className={shop.buildTools}>{onArrange&&<button type="button" onClick={onArrange}><IconWrench size={19}/>Move & decorate</button>}<label>Collection<select aria-label="Furniture collection" value={tab} onChange={event=>setTab(event.target.value)}>{tabs.map(entry=><option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label></div>{expansion}
   <nav className={shop.filters} aria-label="Furniture categories">{SHOP_FILTERS.map(entry=><button type="button" key={entry.id} aria-pressed={entry.id===filter} onClick={()=>setFilter(entry.id)}>{entry.label}</button>)}</nav>
   {collectionLocked&&<p className={shop.notice}>The {market?.collectionName} collection is currently locked. Check your restaurant account for availability.</p>}
   {tab==="today"&&<p className={shop.notice}>A fresh selection each day. Everyday pieces are always available.</p>}
   <div className={shop.shelfHeading}><h3>{collectionLabel}</h3><span>{items.length} {items.length===1?"piece":"pieces"}</span></div>
   <div className={shop.grid}>{items.map(item=><article key={item.id} className={shop.card}>
    <button type="button" className={shop.picture} data-preview={item.id} aria-label={`View ${item.label} details`} onClick={()=>{lastPreview.current=item.id;setSelectedId(item.id);}}>
     <FurniturePreview item={item} theme={theme}/>
     <span className={shop.enlarge}>Take a closer look <span aria-hidden="true">↗</span></span>
    </button>
    <div className={shop.body}><h4>{item.label}</h4><span className={shop.category}>{furnitureCategory(item)}</span><p className={shop.description}>{item.desc}</p>{purchaseActions(item)}</div>
   </article>)}</div>
   {items.length===0&&<div className={shop.empty}><IconCart size={28}/><h4>{filter==="stored"?"No stored pieces here yet.":"No pieces in this selection."}</h4><p>Try another category or collection.</p></div>}
   {tab==="today"&&ingredientOffers.length>0&&<><div className={shop.shelfHeading}><h3>The produce stall</h3><span>Today's delivery</span></div><div className={shop.grid}>{ingredientOffers.map(offer=><article className={shop.card} key={offer.id}>
    <div className={shop.producePicture}><IngredientArt id={offer.id} size={84}/></div><div className={shop.body}><h4>{ingredient(offer.id)?.label}</h4><p className={shop.description}>{offer.quantity} for your pantry</p><div className={shop.priceRow}><strong><IconCoin size={18}/>{offer.cost}<span>coins</span></strong></div><button type="button" className={shop.buy} disabled={offer.purchased||!onBuyIngredient||snap.coins<offer.cost} onClick={()=>onBuyIngredient?.(offer.id)}>{offer.purchased?"Collected today":"Buy ingredients"}</button></div>
   </article>)}</div></>}
   {tab==="essentials"&&filter==="all"&&<><div className={shop.shelfHeading}><h3>A little room to grow</h3></div>{(["waiter","chef"] as const).map(hire=>{
    const cost=snap.hireCosts[hire];
    return <div className={shop.hire} key={hire}><IconChefHat size={27}/><div><strong>{hire==="chef"?"Hire a chef":"Hire a waiter"}</strong><p>{hire==="chef"?snap.chefNeedsStove?"Place another stove first.":"Cook more dishes together.":"Carry dishes and clear tables."}</p></div><button type="button" className={shop.buy} disabled={cost===null||snap.coins<(cost||0)||hire==="chef"&&snap.chefNeedsStove} onClick={()=>onBuyHire(hire)}>{cost===null?"Fully staffed":`${cost.toLocaleString()} coins`}</button></div>;
   })}{!expansion&&snap.nextShell&&<div className={shop.hire}><IconWrench size={27}/><div><strong>{snap.nextShell.label}</strong><p>{snap.nextShell.blurb}</p></div><button type="button" className={shop.buy} disabled={snap.coins<snap.nextShell.cost} onClick={onExpand}>{snap.nextShell.cost.toLocaleString()} coins</button></div>}</>}
  </>}
 </div>;
}

function RecipeNeeds({needs,stock}:{needs:Record<string,number>;stock:Record<string,number>}) {
 return <div className={css.recipeNeeds}>{Object.entries(needs).map(([id,needed])=>{
  const have=stock[id]??0,missing=Math.max(0,needed-have);
  return <div key={id} data-ready={missing===0||undefined}><IngredientArt id={id} size={32}/><span>{ingredient(id)?.label??id}<small>{missing?`${missing} more needed`:"Ready to use"}</small></span><strong aria-label={`${have} available, ${needed} needed`}>{have}<i> / {needed}</i></strong></div>;
 })}</div>;
}

export interface CookbookProps {
 world:WorldState; onUpgrade:(id:string)=>void; onSelect:(ids:string[])=>void; onPrep:()=>void; onClose:()=>void;
 goalDishId?:string|null; onChooseGoal?:(id:string)=>void; introMode?:boolean;
 deliveryAvailable?:boolean; onDelivery?:()=>void; deliveryBusy?:boolean; focusSpecial?:boolean;
}
export function Cookbook({world,onUpgrade,onSelect,onPrep,onClose,goalDishId,onChooseGoal,introMode=false,deliveryAvailable=false,onDelivery,deliveryBusy=false,focusSpecial=false}:CookbookProps) {
 const [focused,setFocused]=useState(goalDishId||WELCOME_DISH_ID);
 const [previewMastered,setPreviewMastered]=useState(false);
 const specialRef=useRef<HTMLElement>(null);
 const featureRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(focusSpecial)specialRef.current?.scrollIntoView({block:"start"});},[focusSpecial]);
 const availableIds=new Set(availableDishes(world).map(d=>d.id));
 const dish=dishDef(focused)??DISHES[0],level=world.pantry.levels[dish.id]||1;
 const needs=nextRecipe(dish.id,level),known=availableIds.has(dish.id);
 const ready=known&&!!needs&&Object.entries(needs).every(([id,n])=>(world.pantry.stock[id]??0)>=n);
 const selected=world.menu.selected.includes(dish.id),menuFull=world.menu.selected.length>=MENU_SLOTS;
 const special=DAILY_SPECIALS[world.daily.idx]??DAILY_SPECIALS[0];
 const canPrep=!world.daily.prepped&&Object.entries(special.needs).every(([id,n])=>(world.pantry.stock[id]??0)>=n);
 const bonus=Math.round((passiveTerms(world.pantry.levels,world.menu.selected).multiplier-1)*100);
 const mastery=dishPresentation(dish.art,true);
 return <Sheet title={introMode?"Your first recipe":"Your cookbook"} onClose={onClose}>
  <div className={cook.cookbook}>
   <section ref={featureRef} className={cook.feature} aria-label={dish.name+" recipe"}>
    <div className={cook.plate}><span className={cook.plateLabel}>{previewMastered&&level<MAX_DISH_LEVEL?"Mastered preview":level>=MAX_DISH_LEVEL?"House masterpiece":!known?"Recipe to discover":dish.domain?"From your domain collection":"Kitchen classics"}</span><FoodArt dish={dish.id} size={260} mastered={level>=MAX_DISH_LEVEL||previewMastered}/>{level<MAX_DISH_LEVEL&&<button type="button" className={cook.preview} aria-pressed={previewMastered} onClick={()=>setPreviewMastered(value=>!value)}>{previewMastered?"Show my dish":"See its mastered look"}</button>}<div className={cook.stars} aria-label={"Level "+level+" of "+MAX_DISH_LEVEL}>{Array.from({length:MAX_DISH_LEVEL},(_,i)=><span key={i} data-filled={i<level||undefined}><IconStar size={22}/></span>)}</div></div>
    <div className={cook.recipe}>
     <h3>{dish.name}</h3><p className={cook.description}>{dish.description}</p>
     {!known?<div className={cook.unlock}><IconBook size={29}/><strong>{dishUnlockHint(dish.id)??"Discover this collection"}</strong><p>This recipe becomes yours when you reach its kitchen goal.</p></div>:needs?<>
      <div className={cook.upgradeGoal}><IconStar size={21}/><div><strong>Next: level {level+1}</strong><span>{level===1?"More earning power. A step toward a bigger restaurant.":mastery.masteryDetail}</span></div></div>
      {introMode&&dish.id===WELCOME_DISH_ID&&level===1&&<p className={cook.hint}>Your welcome parcel has everything for this first upgrade.</p>}
      <RecipeNeeds needs={needs} stock={world.pantry.stock}/>
      <button type="button" className={cook.primary} disabled={!ready} onClick={()=>onUpgrade(dish.id)}>{!known?"Collection not unlocked":ready?"Upgrade to level "+(level+1):"More ingredients needed"}</button>
      <small className={cook.costNote}>Uses the ingredients above · +25% recipe earning power per level</small>
     </>:<div className={cook.mastered}><IconMedal size={30}/><strong>Mastered, with love.</strong><p>{mastery.masteryDetail} +50% recipe earning power.</p></div>}
     {!introMode&&known&&<p className={cook.menuToggle}>{world.operations.menu.includes(dish.id)?"Your crew serves this automatically.":"Place its working equipment with a clear path to start serving."}</p>}
    </div>
   </section>
   <nav className={cook.recipes} aria-label="Choose a recipe">{DISHES.filter(d=>!introMode||!d.domain).map(d=><button type="button" key={d.id} aria-label={"View "+d.name} aria-pressed={dish.id===d.id} data-locked={!availableIds.has(d.id)||undefined} onClick={()=>{setFocused(d.id);setPreviewMastered(false);featureRef.current?.scrollIntoView({block:"start"});if(availableIds.has(d.id))onChooseGoal?.(d.id);}}><FoodArt dish={d.id} size={76} mastered={(world.pantry.levels[d.id]||1)>=MAX_DISH_LEVEL}/><strong>{d.name}</strong><small>{availableIds.has(d.id)?"Level "+(world.pantry.levels[d.id]||1):"To discover"}</small></button>)}</nav>
   {!introMode&&<p className={cook.menuNote}><IconCoin size={16}/>Your menu earns +{bonus}%. Kitchen earnings average the levels of dishes you serve.</p>}
   {deliveryAvailable&&onDelivery&&<button type="button" className={cook.delivery} disabled={deliveryBusy} onClick={onDelivery}><ParcelArt size={49}/><span><strong>Your ingredients are here.</strong><small>{deliveryBusy?"Opening…":"Open your delivery"}</small></span><span aria-hidden="true">→</span></button>}
   {!introMode&&<section ref={specialRef} className={cook.special} aria-label="Today's special"><div><span className={cook.kicker}>Today's little challenge</span><h3>{special.name}</h3>{world.daily.prepped?<p>Ready for service · {Math.min(3,world.launch.counts.special)}/3 special orders served</p>:<p>{Object.entries(special.needs).map(([id,n])=>(ingredient(id)?.label??id)+" "+(world.pantry.stock[id]??0)+"/"+n).join(" · ")}</p>}<small>Prepare it, then serve 3 orders to finish two daily jobs.</small></div><button type="button" className={cook.primary} disabled={!canPrep} onClick={onPrep}>{world.daily.prepped?"On today's board":canPrep?"Cook today's special":"Gather ingredients"}</button></section>}
  </div>
 </Sheet>;
}
