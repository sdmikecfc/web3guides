"use client";
import { useState } from 'react';
import { COSMETICS, DECOR, DECOR_BY_ID, REGULARS, FRIENDSHIP_LEVELS, finishPrice, type FinishSlot } from '@/lib/chef/diner/collections';
import { RECIPES, RECIPE_BY_ID, SPICES, TRUCK_TIERS } from '@/lib/chef/diner/content';
import type { DinerCommand, DinerState } from '@/lib/chef/diner/progression';
import { DinerIcon } from './DinerIcon';
import { ModelIcon } from './ModelIcon';
import { regularBookEntry, type CollectionAction } from './collection-view';
import css from './diner.module.css';
import book from './collection-books.module.css';
export { PassportBook } from './PassportBook';
type Props={state:DinerState;send:(command:DinerCommand)=>boolean};
const friendly=(name:string)=>name.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());

export function HomeFinishes({state,send,place,onPreviewFinish}:{state:DinerState;send:Props['send'];place:(id:string)=>void;onPreviewFinish?:(slot:FinishSlot,id:string)=>void}){
  const [name,setName]=useState('My favourite layout');
  return <>
    <p className={css.small}>Try each colour in your room before you choose. A finish purchase is permanent; switching between owned colours is free.</p>
    <div className={css.split}>{(['floor','wall'] as const).map(slot=><div key={slot}><h3 className={css.sectionTitle}>{slot==='floor'?'Under your feet':'Around the room'}</h3><div className={css.tabs}>{(slot==='floor'?COSMETICS.floors:COSMETICS.walls).map(id=>{const owned=state.finishOwned?.[slot]?.includes(id)??state.cosmetics[slot]===id,applied=state.cosmetics[slot]===id;return <button type="button" key={id} aria-label={`${onPreviewFinish?'Preview':'Apply'} ${friendly(id)} ${slot} · ${owned?'owned':`${finishPrice(slot,id)} coins`}`} aria-pressed={applied} disabled={!onPreviewFinish&&!owned} className={applied?css.tabActive:''} onClick={()=>{if(onPreviewFinish)onPreviewFinish(slot,id);else if(owned)send({type:'setCosmetic',slot,id});}}>{friendly(id)} · {applied?'Applied':owned?'Owned':`${finishPrice(slot,id)} coins`}</button>;})}</div></div>)}</div>
    <div className={css.grid}>{DECOR.filter(d=>!d.memento||state.decorOwned[d.id]>0).map(item=>{const stored=(state.decorOwned[item.id]??0)-state.home.layout.filter(p=>p.equipmentId===item.id).length;return <article className={css.card} key={item.id}><div className={css.cardArt}><ModelIcon kind={item.id} label={item.name}/>{stored>0&&<span className={css.ribbon}>{stored} in storage</span>}</div><div className={css.cardBody}><span className={css.badge}>{friendly(item.setId)} · {item.wall?'Wall hanging':'Floor decoration'}</span><h3>{item.name}</h3>{stored>0&&<button className={css.primary} onClick={()=>place(item.id)}>Place</button>}{!item.memento&&<button className={css.button} disabled={state.coins<item.price} onClick={()=>send({type:'buyDecor',decorId:item.id})}>Buy · {item.price} coins</button>}</div></article>;})}</div>
    <h3 className={css.sectionTitle}>Keep a favourite arrangement</h3><div className={css.inputRow}><input className={css.textInput} aria-label="Layout name" maxLength={24} value={name} onChange={e=>setName(e.target.value)}/><button className={css.button} disabled={state.savedLayouts.length>=3} onClick={()=>send({type:'saveLayout',name})}>Save room</button></div><div className={css.list}>{state.savedLayouts.map(layout=><div className={css.row} key={layout.id}><DinerIcon name="home"/><div><h3>{layout.name}</h3><p>{layout.layout.length} furnishings</p></div><button className={css.button} onClick={()=>send({type:'loadLayout',layoutId:layout.id})}>Use layout</button></div>)}</div>
  </>;
}

export function RegularBook({state,send,openRecipes,openDecor,openCook}:Props&{openRecipes?:()=>void;openDecor?:()=>void;openCook?:()=>void}){
  const actions:Record<CollectionAction,(()=>void)|undefined>={recipes:openRecipes,decorate:openDecor,cook:openCook};
  return <section className={book.book} aria-label="Your restaurant regulars">
    <header className={book.intro}><DinerIcon name="heart" size={38}/><div><h3>Familiar faces, favourite meals</h3><p>Your staff serve their favourite at home. Then say hello here, once per regular each day, to grow the friendship.</p></div></header>
    <div className={book.regulars}>{REGULARS.map((regular,index)=>{const entry=regularBookEntry(state,regular.id)!,missing=entry.requirements.filter(requirement=>!requirement.met),action=missing[0]?.action;
      return <article className={book.regular} key={regular.id} aria-labelledby={`regular-${regular.id}`}>
        <div className={book.portrait}><div className={book.portraitArt}><ModelIcon kind="customer" look={index} label={regular.name} size={130}/></div><div><span className={book.tag}><DinerIcon name="heart" size={13}/>{entry.level?`Friendship ${entry.level} of 5`:entry.count?'Getting to know you':'Someone to meet'}</span><h4 id={`regular-${regular.id}`}>{regular.name}</h4><p>{regular.quirk}</p></div></div>
        <div className={book.favourite}>{entry.favourite?<ModelIcon kind={entry.favourite} label={entry.recipe?.name??'Favourite meal'} size={64}/>:<DinerIcon name="plate" size={35}/>}<div><small>Always happy to order</small><strong>{entry.recipe?.name??'Any level-10 dish'}</strong></div></div>
        <ul className={book.requirements} aria-label={`What brings ${regular.name} in`}>{entry.requirements.map(requirement=><li key={requirement.label} className={requirement.met?book.ready:undefined}>{requirement.met?<DinerIcon name="check" size={15}/>:<span className={book.missingDot} aria-hidden="true"/>}<span>{requirement.label}<span className={css.srOnly}>{requirement.met?' — ready':' — still needed'}</span></span></li>)}</ul>
        {action&&actions[action]&&<button type="button" className={book.linkButton} onClick={actions[action]}>{action==='recipes'?'Open recipe binder':action==='decorate'?'Furnish my restaurant':'Open truck plans'}</button>}
        <div className={book.daily}><strong className={book.dailyTitle}>{entry.greeted?'Today’s hello is remembered':entry.ready?'Their favourite has been served':entry.available?'Waiting for today’s favourite':'A little invitation to prepare'}</strong><p>{entry.greeted?'Come back tomorrow after another favourite meal for your next hello.':entry.ready?'A friendly hello adds one visit to this friendship.':missing.length?'Complete the invitation above, then let your restaurant serve a favourite meal.':entry.wait}</p><button type="button" className={book.button} disabled={!entry.ready} onClick={()=>send({type:'serveRegular',regularId:regular.id})}>{entry.greeted?'See you tomorrow':entry.ready?`Say hello to ${regular.name}`:entry.available?'Favourite meal not served yet':'Invitation not ready'}</button></div>
        <div className={book.milestones} aria-label={`${entry.count} daily hellos. Friendship milestones`}>{FRIENDSHIP_LEVELS.map(threshold=><div key={threshold} className={book.milestone} data-done={entry.count>=threshold} data-gift={threshold===15||threshold===40}><span>{threshold}</span><small>{threshold===15?'Keepsake':threshold===40?'Scrap':'Friendship'}</small></div>)}</div>
        <div className={book.next}><DinerIcon name={entry.nextAt===15||entry.nextAt===40?'gift':'heart'} size={16}/><span><strong>{entry.count} daily {entry.count===1?'hello':'hellos'}</strong>{entry.nextAt?` · ${entry.nextAt-entry.count} more for ${entry.nextReward.toLowerCase()}.`:' · A friend for life.'}{entry.mementoOwned&&<> {entry.mementoName} is in your collection.</>}</span></div>
      </article>;
    })}</div>
    <div className={book.scraps}><h4>Little scraps of something secret</h4><p>At 15 hellos, each regular gives a personal keepsake. At 40, they give one scrap for an unowned secret recipe, if one remains. Three matching scraps unlock that dish; the other friendship milestones are recognition.</p><div className={book.scrapList}>{RECIPES.filter(recipe=>recipe.secret).map(recipe=><div className={book.scrap} key={recipe.id}><ModelIcon kind={recipe.id} label={recipe.name} size={60}/><div><strong>{recipe.name}</strong><small>{Object.hasOwn(state.recipes,recipe.id)?'Recipe discovered':`${state.collections.scraps[recipe.id]??0} / 3 matching scraps`}</small></div></div>)}</div></div>
  </section>;
}

export function StaffRitual({state,send}:Props){return <>
  <h3 className={css.sectionTitle}>A meal for your crew</h3><p className={css.small}>Pick one house favourite for a small speed boost today. No ingredients needed.</p><div className={css.tabs}>{Object.keys(state.recipes).map(id=><button key={id} disabled={!!state.daily.staffMeal} className={state.daily.staffMeal===id?css.tabActive:''} onClick={()=>send({type:'staffMeal',recipeId:id})}>{RECIPE_BY_ID[id]?.name}</button>)}</div>
  <h3 className={css.sectionTitle}>Your people</h3><div className={css.list}>{state.staffMembers.map(member=><div className={css.row} key={member.id}><ModelIcon kind={member.role} label={member.name} size={48}/><div><h3>{member.name}</h3><p>{member.role} · {member.named?'Met on the road':'Diner crew'}</p></div></div>)}</div>
  <h3 className={css.sectionTitle}>Aprons for the team</h3><div className={css.tabs}>{COSMETICS.uniforms.map(id=><button key={id} className={state.cosmetics.uniform===id?css.tabActive:''} onClick={()=>send({type:'setCosmetic',slot:'uniform',id})}>{friendly(id)}</button>)}</div>
</>;}

export function TruckExtras({state,send}:Props){
  const spiceDetails:Record<string,string>={rush_hour:'Patience drains 25% faster.',picky_eaters:'Only dishes at level 3 or higher.',short_staffed:'Leave your helpers at home.',two_strikes:'Two strikes end the trip.',full_menu:'Cook at least three recipes.'};
  const locked=!!state.run||!!state.rally.service,capacity=TRUCK_TIERS[state.truckTier].helpers;
  const helperSlots=[{slot:0 as const,id:state.truckConfig.helperId,role:state.truckConfig.helperRole},{slot:1 as const,id:state.truckConfig.helperId2,role:state.truckConfig.helperRole2}];
  return <>
    <h3 className={css.sectionTitle}>An extra pair of hands</h3><p className={css.small}>{capacity?'Choose different crew members and one fixed job each before leaving home.':'Grow your truck to tier 2 for a helper seat.'}{locked?' Change your crew after returning home.':''}</p>
    {helperSlots.filter(helper=>helper.slot===0||capacity>1).map(helper=>{const other=helperSlots[1-helper.slot].id;return <div key={helper.slot} role="group" aria-label={`Helper seat ${helper.slot+1}`}>
      {capacity>1&&<h4 className={css.small}>Helper seat {helper.slot+1}</h4>}
      <div className={css.tabs}><button disabled={locked||capacity<=helper.slot} aria-pressed={!helper.id} className={!helper.id?css.tabActive:''} onClick={()=>send({type:'assignHelper',slot:helper.slot,staffId:null})}>Empty seat</button>{state.staffMembers.map(member=><button key={member.id} disabled={locked||capacity<=helper.slot||other===member.id} aria-pressed={helper.id===member.id} title={other===member.id?'Already in the other helper seat':undefined} className={helper.id===member.id?css.tabActive:''} onClick={()=>send({type:'assignHelper',slot:helper.slot,staffId:member.id,role:helper.role})}>{member.name}</button>)}</div>
      {helper.id&&<div className={css.tabs} role="group" aria-label={`Job for helper seat ${helper.slot+1}`}>{(['washer','runner','prep'] as const).map(role=><button key={role} disabled={locked||capacity<=helper.slot} aria-pressed={helper.role===role} className={helper.role===role?css.tabActive:''} onClick={()=>send({type:'assignHelper',slot:helper.slot,staffId:helper.id,role})}>{role==='washer'?'Clear & wash':role==='runner'?'Serve ready dishes':'Help prepare'}</button>)}</div>}
    </div>;})}
    {capacity<2&&<p className={css.tiny}>A second helper seat opens at truck tier 4.</p>}
    <h3 className={css.sectionTitle}>A little extra spice</h3><p className={css.small}>After your first finale, add optional challenges for skill trophies.</p><div className={css.list}>{SPICES.map(id=><div className={css.row} key={id}><DinerIcon name="star"/><div><h3>{friendly(id)}</h3><p>{spiceDetails[id]}</p></div><button disabled={locked||!state.collections.routeWins.length} className={state.truckConfig.spices.includes(id)?css.softButton:css.button} onClick={()=>send({type:'setSpices',spiceIds:state.truckConfig.spices.includes(id)?state.truckConfig.spices.filter(s=>s!==id):[...state.truckConfig.spices,id]})}>{state.truckConfig.spices.includes(id)?'Added':'Add'}</button></div>)}</div>
  </>;
}
