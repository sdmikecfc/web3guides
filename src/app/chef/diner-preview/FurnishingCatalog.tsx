"use client";
import { useState } from 'react';
import { COSMETICS, DECOR, FRIENDSHIP_LEVELS, REGULARS, finishPrice, decorResaleValue } from '@/lib/chef/diner/collections';
import { ROOM_PALETTES, ROOM_FINISH_DEFAULTS, type RoomFinishSlot } from '@/lib/chef/diner/collections';
import type { RoomFinishChoice } from './RoomFinishPreview';
import { installedStools, renovationRequirements, RENOVATION_RULES } from '@/lib/chef/diner/renovation';
import { ROOM_FIXTURES, roomSeatStyles } from '@/lib/chef/diner/room-plan';
import { FINISH_PREVIEWS } from './FinishPreview';
import { STAGE_COPY } from './RenovationPreview';
import { HOME_EQUIPMENT, HOME_ONLY_EQUIPMENT_IDS } from '@/lib/chef/diner/content';
import { DINER_RULES, staffSlots, homeEquipmentPurchaseError, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import { ModelIcon } from './ModelIcon';
import { DinerIcon } from './DinerIcon';
import css from './furnishing-catalog.module.css';

type Props={state:DinerState;send:(command:DinerCommand)=>boolean;place:(id:string)=>void;moreStyle:()=>void;
  onGrow?:()=>void;onCook?:()=>void;onStaff?:()=>void;onRecipes?:()=>void;
  onPreviewRoomFinish?:(choice:RoomFinishChoice)=>void;
  onPreviewFinish?:(slot:'floor'|'wall',id:string)=>void;
};
const effects:Record<string,string>={
  grill:'For burgers, hot dogs and grilled favourites.',prep:'Chop, assemble and put the finishing touches on a dish.',
  boiler:'Boil and drain pasta or noodles. Your crew uses it for learned pasta and ramen recipes.',fryer:'Crisp golden fries and fried favourites.',sink:'Your waiter washes used plates here.',
  oven:'Bake pies and warm desserts.',blender:'Blend thick, creamy milkshakes.',coffee:'A fresh coffee for your regulars.',
  drinks:'Pour a refreshing lemonade.',waffle:'Make golden strawberry waffles.',
  table_1:'One table, one chair. A little spot for a solo guest.',table_2:'Seats two. Keep both sides clear for guests.',table_4:'A place for four to eat together.',
  booth_2:'A cosy upholstered booth for two. Keep both benches and a serving side clear.',
};
const money=(value:number)=>Math.floor(value).toLocaleString('en-US');
const COLLECTIONS=[
  {id:'all',name:'Everything',detail:'A little furniture, a little character. Mix any collection to make it yours.'},
  {id:'kitchen',name:'Kitchen',detail:'Working equipment for the dishes you have discovered on the road.'},
  {id:'seating',name:'Seating',detail:'A seat for every kind of lunch. Keep a clear route to each place.'},
  {id:'burger',name:'Burger shop',detail:'Cherry red, chrome and cheerful little details for the neighbourhood favourite.'},
  {id:'smalltown',name:'Small-town diner',detail:'Warm timber, cosy booths and wonderfully odd souvenirs from down the road.'},
  {id:'deco',name:'Art deco',detail:'Brass, soft light and dressed tables for a restaurant with a little occasion.'},
  {id:'garden',name:'Garden',detail:'Big leaves, little flowers and green corners. Every room can use a little life.'},
  {id:'keepsakes',name:'Keepsakes',detail:'Gifts from your regulars. Reach friendship level 3 by greeting them after their favourite meal.'},
] as const;
type CollectionId=typeof COLLECTIONS[number]['id'];
const decorationDetails:Record<string,string>={
  red_planter:'A cherry-red pot for a counter or a sunny corner.',chrome_clock:'A little chrome clock for the burger-shop wall.',milkshake_sign:'A framed milkshake print for your wall.',
  checkered_shelf:'A standing shelf of little lunchtime favourites.',daisy_pot:'A generous pot of daisies for the floor, or a smaller display on your counter.',garden_poster:'A framed botanical print for a greener corner.',
  coffee_print:'A warm coffee illustration, mounted flat on the wall.',burger_print:'Your house burger, framed and ready for the wall.',leafy_plant:'A tall rubber plant with a proper floor pot.',herb_planter:'Little kitchen herbs in a counter planter.',
  burger_mascot:'A smiling burger buddy for your counter.',retro_radio:'A vintage counter ornament. Your music settings stay separate.',condiment_caddy:'Ketchup, mustard and napkins together on your counter.',welcome_mat:'A soft gingham welcome. Guests can walk over it.',
  diner_clock:'An oversized wall clock for the long lunch crowd.',bear_statue:'A big friendly carved bear to greet your guests.',deer_trophy:'A carved woodland trophy for a quirky diner wall.',pie_display:'A decorative pie under glass for the counter. It does not add a dish to your menu.',coffee_sign:'A nostalgic coffee sign for the wall.',jukebox:'A colourful jukebox showpiece. Your music settings stay separate.',
  wine_rack:'A standing wine cabinet with bottles on display. Decoration, not a new drinks station.',deco_mirror:'A brass sunburst mirror mounted on your wall.',brass_planter:'A leafy palm in a polished brass floor planter.',chandelier:'A warm brass chandelier hung overhead. Walking space stays clear.',brass_sconce:'A pearl wall light with a brass surround.',velvet_rope:'A velvet welcome rope for an elegant entrance. Keep the walking route open.',runner_menu:'A polished menu stand for a counter display.',
};
const isSeating=(id:string)=>id.startsWith('table_')||id==='booth_2';
export function FurnishingCatalog({state,send,place,moreStyle,onGrow,onCook,onStaff,onRecipes,onPreviewFinish,onPreviewRoomFinish}:Props){
  const [view,setView]=useState<'furnish'|'storage'|'style'>('furnish');
  const [collection,setCollection]=useState<CollectionId>('all');
  const [sale,setSale]=useState<string|null>(null),[notice,setNotice]=useState('');
  const equipment=HOME_EQUIPMENT.map(item=>{
    const owned=state.equipment[item.id],placed=state.home.layout.filter(p=>p.equipmentId===item.id).length;
    return {id:item.id,name:item.name,footprint:item.footprint,placed,stored:Math.max(0,(owned?.homeCopies??0)-placed),tier:owned?.tier??1,
      price:(item.tiers.find(t=>t.tier===owned?.tier)?.price??item.tiers[0].price)*DINER_RULES.homeEquipmentMultiplier,
      locked:!!homeEquipmentPurchaseError(state,item.id),kind:'equipment' as const,detail:effects[item.id]??'A useful addition to your restaurant.',wall:false,ceiling:false,setId:isSeating(item.id)?'seating':'kitchen',memento:false};
  });
  const decor=DECOR.map(item=>{
    const placed=state.home.layout.filter(p=>p.equipmentId===item.id).length;
    return {id:item.id,name:item.name,footprint:item.footprint,placed,stored:Math.max(0,(state.decorOwned[item.id]??0)-placed),tier:1,
      price:item.price,locked:!!item.memento,kind:'decor' as const,detail:item.memento?`A gift from ${REGULARS.find(regular=>regular.memento===item.id)?.name??'a regular'}, earned at friendship level 3.`:decorationDetails[item.id]??'A little character for your restaurant.',wall:!!item.wall,ceiling:!!item.ceiling,setId:item.setId,memento:!!item.memento};
  });
  const all=[...equipment,...decor],storedFurnitureCount=all.reduce((sum,item)=>sum+item.stored,0);
  const matchesCollection=(item:typeof all[number])=>collection==='all'||collection==='kitchen'&&item.setId==='kitchen'||collection==='seating'&&isSeating(item.id)||collection==='burger'&&(['fifties','welcome'].includes(item.setId)||item.id==='burger_print')||collection==='smalltown'&&(item.setId==='smalltown'||item.id==='booth_2')||collection==='deco'&&(item.setId==='deco'||state.home.roomPlan?.stage==='restaurant'&&item.id.startsWith('table_'))||collection==='garden'&&(item.setId==='garden'||['leafy_plant','herb_planter'].includes(item.id))||collection==='keepsakes'&&item.memento;
  const available=all.filter(item=>matchesCollection(item)&&(view==='storage'?item.stored>0:!item.locked||item.stored>0||item.memento&&(collection==='keepsakes'||item.placed>0)));
  const collectionInfo=COLLECTIONS.find(item=>item.id===collection)!;
  const seatingModules=state.home.roomPlan?.modules.filter(module=>module.kind==='console'||module.kind==='chef_bar')??[];
  const stoolInstalled=installedStools(state.home.roomPlan),stoolOwned=state.home.stools??stoolInstalled;
  const openStoolPositions=seatingModules.reduce((sum,module)=>sum+ROOM_FIXTURES[module.kind].capacity-roomSeatStyles(module).length,0);
  const installedSeats=seatingModules.flatMap((module,moduleIndex)=>roomSeatStyles(module).map((style,seatIndex)=>({moduleId:module.id,seatIndex,style,label:`${module.kind==='console'?'Wall console':'Bar'}${seatingModules.length>1?` ${moduleIndex+1}`:''} · stool ${seatIndex+1}`})));
  const storedStoolCount=Math.max(0,stoolOwned.classic-stoolInstalled.classic)+Math.max(0,stoolOwned.diner-stoolInstalled.diner),storedCount=storedFurnitureCount+storedStoolCount;
  const showStools=!!state.home.roomPlan&&(collection==='seating'||view==='storage'&&collection==='all'&&storedStoolCount>0);
  const renovation=renovationRequirements(state);
  const crew=state.home.staff.chefs+state.home.staff.waiters+(state.home.staff.cashiers??0),crewSlots=staffSlots(state);
  const discoveries=equipment.filter(item=>item.locked&&!item.stored&&!(HOME_ONLY_EQUIPMENT_IDS as readonly string[]).includes(item.id));
  return <div className={css.catalog}>
    <div className={css.tools} role="group" aria-label="Decoration collection">
      <button aria-pressed={view==='furnish'} onClick={()=>setView('furnish')}><DinerIcon name="store" size={19}/>Furnish</button>
      <button aria-pressed={view==='storage'} onClick={()=>setView('storage')}><DinerIcon name="gift" size={19}/>Storage <span>{storedCount}</span></button>
      <button aria-pressed={view==='style'} onClick={()=>setView('style')}><DinerIcon name="leaf" size={19}/>Style</button>
    </div>
    {view==='style'?<div className={css.stylePage}>
      <p className={css.lead}>Start with the room. Make the little details yours.</p>
      {(['floor','wall'] as const).map(slot=><section className={css.finishSection} key={slot}><h3>{slot==='floor'?'Under your feet':'A fresh coat of paint'}</h3><div className={css.finishes}>
        {(slot==='floor'?COSMETICS.floors:COSMETICS.walls).map(id=>{const owned=state.finishOwned?.[slot]?.includes(id)||state.cosmetics[slot]===id,price=finishPrice(slot,id)??0;return <button key={id} aria-pressed={state.cosmetics[slot]===id} disabled={!onPreviewFinish&&!owned} onClick={()=>onPreviewFinish?onPreviewFinish(slot,id):send({type:'setCosmetic',slot,id})}>
          <span className={css.swatch} style={{background:FINISH_PREVIEWS[id]?.background}}><i/>{state.cosmetics[slot]===id&&<DinerIcon name="check" size={25}/>}</span><strong>{FINISH_PREVIEWS[id]?.label??id}</strong>
          <small>{state.cosmetics[slot]===id?'In your room':owned?'Owned':`${money(price)} coins`}</small>
        </button>;})}
      </div></section>)}
      {state.home.roomPlan&&onPreviewRoomFinish&&<section className={css.finishSection}><h3>Counters, stools & your sign</h3><div className={css.finishes}>{(Object.keys(ROOM_PALETTES) as RoomFinishSlot[]).map(slot=><button key={slot} onClick={()=>onPreviewRoomFinish({slot,id:(state.home.finishes?.[slot]??ROOM_FINISH_DEFAULTS[slot])})}><span className={css.swatch} style={{backgroundColor:ROOM_PALETTES[slot].find(f=>f.id===(state.home.finishes?.[slot]??ROOM_FINISH_DEFAULTS[slot]))?.color}}/><strong>{slot==='upholstery'?'Seats':slot==='counter'?'Counter fronts':slot==='worktop'?'Worktops':'Sign'}</strong><small>Preview colors in your room</small></button>)}</div></section>}
      <p className={css.note}>Preview finishes in your room before buying. Wood and stone dress the dining area; the kitchen and bathroom keep their practical floors. Once owned, finishes are yours to switch.</p>
      <section className={css.keepsakes} aria-label="Friendship keepsakes"><h3>Little gifts from your regulars</h3><p>Greet a regular after their favourite meal. Friendship level 3 earns a keepsake for your wall.</p><div className={css.keepsakeStrip}>{REGULARS.map(regular=>{const item=DECOR.find(item=>item.id===regular.memento)!,owned=(state.decorOwned[item.id]??0)>0,count=state.collections.regulars[regular.id]??0;return <div key={item.id}><ModelIcon kind={item.id} label={item.name} size={100}/><strong>{item.name}</strong><small>{owned?'In your collection':`From ${regular.name}`}</small><span>{owned?'Earned':`${Math.min(count,FRIENDSHIP_LEVELS[2])} / ${FRIENDSHIP_LEVELS[2]} greetings`}</span></div>;})}</div></section>
      <button className={css.moreStyle} onClick={moreStyle}>Keepsakes & saved rooms <DinerIcon name="arrow" size={17}/></button>
    </div>:<>
      {view==='furnish'&&<>
        <section className={css.growth} aria-label="Grow restaurant"><DinerIcon name="home" size={29}/><div><h3>{renovation.stage?STAGE_COPY[renovation.stage].name:'Your full restaurant'}</h3><p>{renovation.stage?STAGE_COPY[renovation.stage].description:'Make every corner yours.'}</p>{renovation.stage&&<span>{renovation.cost?`${money(renovation.cost)} coins + cooking accomplishments`:'A new burger shop, included'}<small>{renovation.allowed?'Ready to preview':'See your progress & preview the room'}</small></span>}</div>{onGrow&&<button onClick={onGrow}>Renovations<DinerIcon name="arrow" size={15}/></button>}</section>
        {(onStaff||onRecipes)&&<div className={css.usefulLinks}>{onStaff&&<button onClick={onStaff}><DinerIcon name="friends" size={23}/><span><strong>Your kitchen crew</strong><small>{crew} / {crewSlots} staff · {crew<crewSlots?'Hire a chef or waiter for 500 coins':'More staff slots open as you level up'}</small></span><DinerIcon name="arrow" size={15}/></button>}{onRecipes&&<button onClick={onRecipes}><DinerIcon name="book" size={23}/><span><strong>Make the menu yours</strong><small>Choose dishes and use ingredients to raise their level</small></span><DinerIcon name="arrow" size={15}/></button>}</div>}
      </>}
      <div className={css.collectionFilter}><label htmlFor="diner-furniture-collection">Browse collection</label><select id="diner-furniture-collection" value={collection} onChange={event=>setCollection(event.target.value as CollectionId)}>{COLLECTIONS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div className={css.collectionHeading}><p>{collectionInfo.detail}</p><span><DinerIcon name="coin" size={17}/>{money(state.coins)}</span></div>
      {view==='storage'&&<p className={css.note}>Move a decoration here with Store. Place it again whenever you like, or sell a spare.</p>}
      {notice&&<p className={css.note} role="status">{notice}</p>}
      {showStools&&<section className={css.stoolSection} aria-label="Counter stools">
        <div className={css.stoolHeading}><h3>Your counter stools</h3><span>{stoolInstalled.classic+stoolInstalled.diner} installed · {openStoolPositions} open positions</span></div>
        <p>Keep your original stools, add another seat, or replace just one with an upholstered stool. Replaced stools stay in storage.</p>
        <div className={css.stoolStock}>{(['classic','diner'] as const).map(style=>{
          const stored=Math.max(0,stoolOwned[style]-stoolInstalled[style]),name=style==='classic'?'Classic stool':'Upholstered stool';
          return <div key={style}><ModelIcon kind="stool" seatStyle={style} label={name} size={82}/><strong>{name}s</strong><span>{stoolOwned[style]} owned · {stoolInstalled[style]} installed · {stored} stored</span>
            {stored>0&&<button disabled={!openStoolPositions} onClick={()=>{if(send({type:'installHomeStool',style}))setNotice(`${name} placed from storage. No coins spent.`);}}>{openStoolPositions?'Place from storage':'No open stool positions'}</button>}
            {view==='furnish'&&<button disabled={!openStoolPositions||state.coins<RENOVATION_RULES.stoolPrices[style]} onClick={()=>{if(send({type:'buyHomeStool',style}))setNotice(`${name} added to the next open counter position.`);}}>Buy & install · {money(RENOVATION_RULES.stoolPrices[style])}</button>}
          </div>;
        })}</div>
        {installedSeats.length>0&&<details className={css.stoolUpgrades}><summary>Manage installed stools · {installedSeats.length}</summary><div>{installedSeats.map(seat=><div className={css.stoolInstalledRow} key={`${seat.moduleId}:${seat.seatIndex}`}><span>{seat.label}<small>{seat.style==='classic'?'Classic':'Upholstered'}</small></span><div><button aria-label={`Store ${seat.label.toLowerCase()}`} onClick={()=>{if(send({type:'returnHomeStool',moduleId:seat.moduleId,seatIndex:seat.seatIndex}))setNotice(`${seat.label} stored. Place it again whenever you like.`);}}>Store</button>{seat.style==='classic'&&<button disabled={state.coins<RENOVATION_RULES.stoolUpholsteryPrice} aria-label={`Replace ${seat.label.toLowerCase()} with an upholstered stool for ${RENOVATION_RULES.stoolUpholsteryPrice} coins`} onClick={()=>{if(send({type:'upgradeHomeStool',moduleId:seat.moduleId,seatIndex:seat.seatIndex}))setNotice(`${seat.label} now has an upholstered seat. Your classic stool is stored.`);}}>Upholstered · {money(RENOVATION_RULES.stoolUpholsteryPrice)}</button>}</div></div>)}</div></details>}
        <small>Stools use the next free position on a placed console or bar. The seat and its approach must stay clear.</small>
      </section>}
      {available.length?<div className={css.grid}>{available.map(item=><article className={css.item} key={item.id}>
        <div className={css.preview}><div className={css.platform}/><ModelIcon kind={item.id} tier={item.tier} label={item.name} size={180} tableStyle={item.id.startsWith('table_')&&state.home.roomPlan?.stage==='restaurant'?'restaurant':'cafe'}/>{item.stored>0&&<span className={css.stored}>Yours · {item.stored}</span>}</div>
        <div className={css.body}><span className={css.category}>{item.ceiling?'Ceiling decoration':item.wall?'Wall decoration':item.kind==='decor'?'Decoration':`${item.footprint.join(' × ')} tiles`}</span><h3>{item.name}</h3><p>{item.detail}</p><span className={css.ownership}>{item.placed?`${item.placed} in your restaurant`:item.kind==='equipment'?`Tier ${item.tier}`:item.memento?'Earned through friendship':'Make it yours'}</span>
          <button className={css.place} disabled={!item.stored&&(item.locked||state.coins<item.price)} onClick={()=>{
            if(item.stored){place(item.id);return;}
            const bought=send(item.kind==='equipment'?{type:'buyHomeEquipment',equipmentId:item.id}:{type:'buyDecor',decorId:item.id});if(bought)place(item.id);
          }}>{item.stored?<><DinerIcon name="decorate" size={17}/>Place</>:item.memento?'Friendship gift':<><DinerIcon name="coin" size={17}/>{money(item.price)} <small>· buy & place</small></>}</button>
          {!item.stored&&!item.locked&&state.coins<item.price&&<small className={css.shortfall}>{money(item.price-state.coins)} more coins</small>}
          {view==='storage'&&item.kind==='decor'&&!item.locked&&item.stored>0&&(sale===item.id?<div className={css.sale}><span>Sell one for {money(decorResaleValue(item.id)??0)} coins?</span><button onClick={()=>{if(send({type:'sellDecor',decorId:item.id})){setSale(null);setNotice(`${item.name} sold for ${money(decorResaleValue(item.id)??0)} coins.`);}}}>Sell one</button><button onClick={()=>setSale(null)}>Keep it</button></div>:<button className={css.sell} onClick={()=>setSale(item.id)}>Sell · {money(decorResaleValue(item.id)??0)} coins</button>)}
        </div>
      </article>)}</div>:view==='storage'&&showStools&&storedStoolCount>0?null:<div className={css.empty}><DinerIcon name="gift" size={40}/><h3>{view==='storage'?'Nothing stored here yet.':'More room for your favourites.'}</h3><p>{view==='storage'?'Stored pieces from this collection will appear here.':'Try another collection to find your next piece.'}</p><button onClick={()=>{setCollection('all');if(view==='storage')setView('furnish');}}>Browse all furniture</button></div>}
      {view==='furnish'&&['all','kitchen'].includes(collection)&&discoveries.length>0&&<section className={css.discovery} aria-label="Equipment to discover"><div className={css.discoveryHeading}><DinerIcon name="truck" size={25}/><div><h3>Bring something good home</h3><p>A first production-machine discovery on the road includes one restaurant copy in storage. Learn its recipes separately; buy additional copies here.</p></div></div><div className={css.discoveries}>{discoveries.map(item=><article key={item.id}><ModelIcon kind={item.id} label={item.name} size={110} tableStyle={item.id.startsWith('table_')&&state.home.roomPlan?.stage==='restaurant'?'restaurant':'cafe'}/><h4>{item.name}</h4><p>{item.detail}</p><strong className={css.source}>Find at a roadside market</strong><small>Additional restaurant copy: {money(item.price)} coins</small></article>)}</div>{onCook&&<button className={css.roadButton} onClick={onCook}>Explore with the truck<DinerIcon name="arrow" size={17}/></button>}</section>}
    </>}
  </div>;
}
