"use client";
import { useState } from 'react';
import { COSMETICS, DECOR, FRIENDSHIP_LEVELS, REGULARS, finishPrice } from '@/lib/chef/diner/collections';
import { ROOM_PALETTES, ROOM_FINISH_DEFAULTS, type RoomFinishSlot } from '@/lib/chef/diner/collections';
import type { RoomFinishChoice } from './RoomFinishPreview';
import { renovationRequirements } from '@/lib/chef/diner/renovation';
import { STAGE_COPY } from './RenovationPreview';
import { HOME_EQUIPMENT } from '@/lib/chef/diner/content';
import { DINER_RULES, staffSlots, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
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
  fryer:'Crisp golden fries and fried favourites.',sink:'Your waiter washes used plates here.',
  oven:'Bake pies and warm desserts.',blender:'Blend thick, creamy milkshakes.',coffee:'A fresh coffee for your regulars.',
  drinks:'Pour a refreshing lemonade.',waffle:'Make golden strawberry waffles.',
  table_1:'One table, one chair. A little spot for a solo guest.',table_2:'Seats two. Keep both sides clear for guests.',table_4:'A place for four to eat together.',
};
const money=(value:number)=>Math.floor(value).toLocaleString('en-US');
const colors:Record<string,string>={cream:'#f4ebd7',mint:'#a7c8af',rose:'#deb5a7',terracotta:'#c98162',checker:'#88ae98'};
export function FurnishingCatalog({state,send,place,moreStyle,onGrow,onCook,onStaff,onRecipes,onPreviewFinish,onPreviewRoomFinish}:Props){
  const [view,setView]=useState<'furnish'|'storage'|'style'>('furnish');
  const equipment=HOME_EQUIPMENT.map(item=>{
    const owned=state.equipment[item.id],placed=state.home.layout.filter(p=>p.equipmentId===item.id).length;
    return {id:item.id,name:item.name,footprint:item.footprint,placed,stored:Math.max(0,(owned?.homeCopies??0)-placed),tier:owned?.tier??1,
      price:(item.tiers.find(t=>t.tier===owned?.tier)?.price??item.tiers[0].price)*DINER_RULES.homeEquipmentMultiplier,
      locked:!owned?.truckOwned,kind:'equipment' as const,detail:effects[item.id]??'A useful addition to your restaurant.',wall:false};
  });
  const decor=DECOR.filter(item=>!item.memento||state.decorOwned[item.id]>0).map(item=>{
    const placed=state.home.layout.filter(p=>p.equipmentId===item.id).length;
    return {id:item.id,name:item.name,footprint:item.footprint,placed,stored:Math.max(0,(state.decorOwned[item.id]??0)-placed),tier:1,
      price:item.price,locked:!!item.memento,kind:'decor' as const,detail:item.memento?'A little memory, earned on your travels.':item.wall?'A finishing touch for your wall.':'A little colour for your favourite corner.',wall:!!item.wall};
  });
  const all=[...equipment,...decor],storedCount=all.reduce((sum,item)=>sum+item.stored,0),available=all.filter(item=>view==='storage'?item.stored>0:!item.locked||item.stored>0);
  const renovation=renovationRequirements(state);
  const crew=state.home.staff.chefs+state.home.staff.waiters+(state.home.staff.cashiers??0),crewSlots=staffSlots(state);
  const discoveries=equipment.filter(item=>item.locked&&!item.stored);
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
          <span className={`${css.swatch} ${slot==='floor'&&id==='checker'?css.checker:''}`} style={{backgroundColor:colors[id]}}><i/>{state.cosmetics[slot]===id&&<DinerIcon name="check" size={25}/>}</span><strong>{id[0].toUpperCase()+id.slice(1)}</strong>
          <small>{state.cosmetics[slot]===id?'In your room':owned?'Owned':`${money(price)} coins`}</small>
        </button>;})}
      </div></section>)}
      {state.home.roomPlan&&onPreviewRoomFinish&&<section className={css.finishSection}><h3>Counters, stools & your sign</h3><div className={css.finishes}>{(Object.keys(ROOM_PALETTES) as RoomFinishSlot[]).map(slot=><button key={slot} onClick={()=>onPreviewRoomFinish({slot,id:(state.home.finishes?.[slot]??ROOM_FINISH_DEFAULTS[slot])})}><span className={css.swatch} style={{backgroundColor:ROOM_PALETTES[slot].find(f=>f.id===(state.home.finishes?.[slot]??ROOM_FINISH_DEFAULTS[slot]))?.color}}/><strong>{slot==='upholstery'?'Seats':slot==='counter'?'Counter fronts':slot==='worktop'?'Worktops':'Sign'}</strong><small>Preview colors in your room</small></button>)}</div></section>}
      <p className={css.note}>Finishes cover the whole room. Once owned, you can switch them whenever you like.</p>
      <section className={css.keepsakes} aria-label="Friendship keepsakes"><h3>Little gifts from your regulars</h3><p>Greet a regular after their favourite meal. Friendship level 3 earns a keepsake for your wall.</p><div className={css.keepsakeStrip}>{REGULARS.map(regular=>{const item=DECOR.find(item=>item.id===regular.memento)!,owned=(state.decorOwned[item.id]??0)>0,count=state.collections.regulars[regular.id]??0;return <div key={item.id}><ModelIcon kind={item.id} label={item.name} size={100}/><strong>{item.name}</strong><small>{owned?'In your collection':`From ${regular.name}`}</small><span>{owned?'Earned':`${Math.min(count,FRIENDSHIP_LEVELS[2])} / ${FRIENDSHIP_LEVELS[2]} greetings`}</span></div>;})}</div></section>
      <button className={css.moreStyle} onClick={moreStyle}>Keepsakes & saved rooms <DinerIcon name="arrow" size={17}/></button>
    </div>:<>
      {view==='furnish'&&<>
        <section className={css.growth} aria-label="Grow restaurant"><DinerIcon name="home" size={29}/><div><h3>{renovation.stage?STAGE_COPY[renovation.stage].name:'Your full restaurant'}</h3><p>{renovation.stage?STAGE_COPY[renovation.stage].description:'Make every corner yours.'}</p>{renovation.stage&&<span>{renovation.cost?`${money(renovation.cost)} coins + cooking accomplishments`:'A new burger shop, included'}<small>{renovation.allowed?'Ready to preview':'See your progress & preview the room'}</small></span>}</div>{onGrow&&<button onClick={onGrow}>Renovations<DinerIcon name="arrow" size={15}/></button>}</section>
        {(onStaff||onRecipes)&&<div className={css.usefulLinks}>{onStaff&&<button onClick={onStaff}><DinerIcon name="friends" size={23}/><span><strong>Your kitchen crew</strong><small>{crew} / {crewSlots} staff · {crew<crewSlots?'Hire a chef or waiter for 500 coins':'More staff slots open as you level up'}</small></span><DinerIcon name="arrow" size={15}/></button>}{onRecipes&&<button onClick={onRecipes}><DinerIcon name="book" size={23}/><span><strong>Make the menu yours</strong><small>Choose dishes and use ingredients to raise their level</small></span><DinerIcon name="arrow" size={15}/></button>}</div>}
      </>}
      <div className={css.collectionHeading}><p>{view==='storage'?'Yours already. Find it a lovely spot.':'Good things for your little diner.'}</p><span><DinerIcon name="coin" size={17}/>{money(state.coins)}</span></div>
      {available.length?<div className={css.grid}>{available.map(item=><article className={css.item} key={item.id}>
        <div className={css.preview}><div className={css.platform}/><ModelIcon kind={item.id} tier={item.tier} label={item.name} size={180}/>{item.stored>0&&<span className={css.stored}>Yours · {item.stored}</span>}</div>
        <div className={css.body}><span className={css.category}>{item.wall?'Wall decoration':item.kind==='decor'?'For the joy of it':`${item.footprint.join(' × ')} tiles`}</span><h3>{item.name}</h3><p>{item.detail}</p><span className={css.ownership}>{item.placed?`${item.placed} in your restaurant`:item.kind==='equipment'?`Tier ${item.tier}`:'Make it yours'}</span>
          <button className={css.place} disabled={!item.stored&&(item.locked||state.coins<item.price)} onClick={()=>{
            if(item.stored){place(item.id);return;}
            const bought=send(item.kind==='equipment'?{type:'buyHomeEquipment',equipmentId:item.id}:{type:'buyDecor',decorId:item.id});if(bought)place(item.id);
          }}>{item.stored?<><DinerIcon name="decorate" size={17}/>Place</>:<><DinerIcon name="coin" size={17}/>{money(item.price)} <small>· buy & place</small></>}</button>
          {!item.stored&&!item.locked&&state.coins<item.price&&<small className={css.shortfall}>{money(item.price-state.coins)} more coins</small>}
        </div>
      </article>)}</div>:<div className={css.empty}><DinerIcon name="gift" size={40}/><h3>Everything has a home.</h3><p>New finds and stored furnishings will wait here.</p><button onClick={()=>setView('furnish')}>Browse furniture</button></div>}
      {view==='furnish'&&discoveries.length>0&&<section className={css.discovery} aria-label="Equipment to discover"><div className={css.discoveryHeading}><DinerIcon name="truck" size={25}/><div><h3>Bring something good home</h3><p>Discover equipment on a truck trip. Then buy copies for your restaurant here.</p></div></div><div className={css.discoveries}>{discoveries.map(item=><article key={item.id}><ModelIcon kind={item.id} label={item.name} size={110}/><h4>{item.name}</h4><p>{item.detail}</p><strong className={css.source}>{item.id==='fryer'&&!state.tutorial.finished?'A gift after your first adventure':'Find at a truck shop stop'}</strong><small>Restaurant copy: {money(item.price)} coins</small></article>)}</div>{onCook&&<button className={css.roadButton} onClick={onCook}>Explore with the truck<DinerIcon name="arrow" size={17}/></button>}</section>}
    </>}
  </div>;
}
