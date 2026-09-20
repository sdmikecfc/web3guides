"use client";
import { useState } from 'react';
import { COSMETICS, DECOR } from '@/lib/chef/diner/collections';
import { HOME_EQUIPMENT } from '@/lib/chef/diner/content';
import { DINER_RULES, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import { ModelIcon } from './ModelIcon';
import { DinerIcon } from './DinerIcon';
import css from './furnishing-catalog.module.css';

type Props={state:DinerState;send:(command:DinerCommand)=>boolean;place:(id:string)=>void;moreStyle:()=>void};
const effects:Record<string,string>={
  grill:'For burgers, hot dogs and grilled favourites.',prep:'Chop, assemble and put the finishing touches on a dish.',
  fryer:'Crisp golden fries and fried favourites.',sink:'Your waiter washes used plates here.',
  oven:'Bake pies and warm desserts.',blender:'Blend thick, creamy milkshakes.',coffee:'A fresh coffee for your regulars.',
  drinks:'Pour a refreshing lemonade.',waffle:'Make golden strawberry waffles.',
  table_1:'One table, one chair. A little spot for a solo guest.',table_2:'Seats two. Keep both sides clear for guests.',table_4:'A place for four to eat together.',
};
const money=(value:number)=>Math.floor(value).toLocaleString('en-US');
const colors:Record<string,string>={cream:'#f4ebd7',mint:'#a7c8af',rose:'#deb5a7',terracotta:'#c98162',checker:'#88ae98'};
export function FurnishingCatalog({state,send,place,moreStyle}:Props){
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
  return <div className={css.catalog}>
    <div className={css.tools} role="group" aria-label="Decoration collection">
      <button aria-pressed={view==='furnish'} onClick={()=>setView('furnish')}><DinerIcon name="store" size={19}/>Furnish</button>
      <button aria-pressed={view==='storage'} onClick={()=>setView('storage')}><DinerIcon name="gift" size={19}/>Storage <span>{storedCount}</span></button>
      <button aria-pressed={view==='style'} onClick={()=>setView('style')}><DinerIcon name="leaf" size={19}/>Style</button>
    </div>
    {view==='style'?<div className={css.stylePage}>
      <p className={css.lead}>Start with the room. Make the little details yours.</p>
      {(['floor','wall'] as const).map(slot=><section className={css.finishSection} key={slot}><h3>{slot==='floor'?'Under your feet':'A fresh coat of paint'}</h3><div className={css.finishes}>
        {(slot==='floor'?COSMETICS.floors:COSMETICS.walls).map(id=><button key={id} aria-pressed={state.cosmetics[slot]===id} onClick={()=>send({type:'setCosmetic',slot,id})}>
          <span className={`${css.swatch} ${slot==='floor'&&id==='checker'?css.checker:''}`} style={{backgroundColor:colors[id]}}><i/>{state.cosmetics[slot]===id&&<DinerIcon name="check" size={25}/>}</span><strong>{id[0].toUpperCase()+id.slice(1)}</strong>
        </button>)}
      </div></section>)}
      <button className={css.moreStyle} onClick={moreStyle}>Keepsakes & saved rooms <DinerIcon name="arrow" size={17}/></button>
    </div>:<>
      <div className={css.collectionHeading}><p>{view==='storage'?'Yours already. Find it a lovely spot.':'Good things for your little diner.'}</p><span><DinerIcon name="coin" size={17}/>{money(state.coins)}</span></div>
      {available.length?<div className={css.grid}>{available.map(item=><article className={css.item} key={item.id}>
        <div className={css.preview}><div className={css.platform}/><ModelIcon kind={item.id} tier={item.tier} label={item.name} size={180}/>{item.stored>0&&<span className={css.stored}>Yours · {item.stored}</span>}</div>
        <div className={css.body}><span className={css.category}>{item.wall?'Wall decoration':item.kind==='decor'?'For the joy of it':`${item.footprint.join(' × ')} tiles`}</span><h3>{item.name}</h3><p>{item.detail}</p><span className={css.ownership}>{item.placed?`${item.placed} in your restaurant`:item.kind==='equipment'?`Tier ${item.tier}`:'Make it yours'}</span>
          <button className={css.place} disabled={!item.stored&&(item.locked||state.coins<item.price)} onClick={()=>{
            if(item.stored){place(item.id);return;}
            const bought=send(item.kind==='equipment'?{type:'buyHomeEquipment',equipmentId:item.id}:{type:'buyDecor',decorId:item.id});if(bought)place(item.id);
          }}>{item.stored?<><DinerIcon name="decorate" size={17}/>Place</>:<><DinerIcon name="coin" size={17}/>{money(item.price)} <small>· buy & place</small></>}</button>
        </div>
      </article>)}</div>:<div className={css.empty}><DinerIcon name="gift" size={40}/><h3>Everything has a home.</h3><p>New finds and stored furnishings will wait here.</p><button onClick={()=>setView('furnish')}>Browse furniture</button></div>}
      {view==='furnish'&&equipment.some(item=>item.locked&&!item.stored)&&<details className={css.discovery}><summary><DinerIcon name="truck" size={24}/><span><strong>A little further down the road</strong><small>Discover new equipment on truck trips</small></span><DinerIcon name="arrow" size={17}/></summary><div className={css.discoveries}>{equipment.filter(item=>item.locked&&!item.stored).map(item=><div key={item.id}><ModelIcon kind={item.id} label={item.name} size={88}/><strong>{item.name}</strong><p>{item.detail}</p></div>)}</div></details>}
    </>}
  </div>;
}
