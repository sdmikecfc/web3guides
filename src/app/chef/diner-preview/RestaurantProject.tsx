"use client";
import {useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {RESTAURANT_PROJECTS,projectProgress,projectNextAction,validProjectPair,type RestaurantProjectId} from '@/lib/chef/diner/restaurant-projects';
import {RECIPES,RECIPE_BY_ID} from '@/lib/chef/diner/content';
import type {DinerState,DinerCommand} from '@/lib/chef/diner/progression';
import {physicalHomeScene} from './physical-home-scene';
import {DinerModal} from './DinerModal';
import type {PanelName} from './DinerPanels';
import css from './diner.module.css';
const Scene=dynamic(()=>import('./DinerScene'),{ssr:false});
export function RestaurantProjectPanel({state,send,close,open,place}:{state:DinerState;send:(c:DinerCommand)=>boolean;close:()=>void;open:(name:PanelName)=>void;place:(id:string)=>void}){
 const progress=projectProgress(state),opening=progress?.project.opening,ref=useRef(send);ref.current=send;
 const [choosing,setChoosing]=useState(!progress),[kind,setKind]=useState<RestaurantProjectId>('burger'),[first,setFirst]=useState('classic_burger'),[second,setSecond]=useState('fries');
 const [rotation,setRotation]=useState(0),hasOpening=useRef(!!opening);hasOpening.current=!!opening;
 useEffect(()=>{if(!opening)return;const tick=setInterval(()=>{if(!document.hidden)ref.current({type:'openingInput',action:{type:'tick',ticks:4}});},200);const pause=()=>{if(hasOpening.current)ref.current({type:'openingInput',action:{type:'pause'}});};const hidden=()=>{if(document.hidden)pause();};window.addEventListener('blur',pause);document.addEventListener('visibilitychange',hidden);return()=>{clearInterval(tick);window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',hidden);pause();};},[!!opening]);
 const choose=(id:RestaurantProjectId)=>{setKind(id);if(id==='burger'){setFirst('classic_burger');setSecond('fries');}else if(id==='breakfast'){setFirst('pancakes');setSecond('coffee');}else {const options=RECIPES.filter(r=>state.recipes[r.id]&&(id==='ramen'?r.id.includes('ramen'):r.course==='main'));setFirst(options[0]?.id??'');setSecond(id==='ramen'?options[1]?.id??'':RECIPES.find(r=>state.recipes[r.id]&&r.course==='dessert')?.id??'');}};
 if(opening&&progress){const w=opening.world,scene=physicalHomeScene({...state,home:{...state.home,w:w.config.w,h:w.config.h,layout:w.config.layout,roomPlan:w.config.roomPlan}},w,null);scene.previewInset=0;scene.paused=opening.paused;
  return <DinerModal title="Your opening night" eyebrow="A celebration · restaurant earnings continue" onClose={close} wide>
   <p className={css.notice}>{w.metrics.plates}/6 guests fed · {opening.greeted.length}/3 greeted. No patience deadlines.</p>
   <div style={{height:'50dvh',minHeight:250,position:'relative'}}><Scene mode="home" scene={scene} rotation={rotation} onRotate={setRotation} onTile={()=>{}} onTarget={id=>{const guest=w.customers.find(c=>c.id===id||c.regularId&&`regular:${c.regularId}`===id);if(guest?.celebrationIndex!==undefined)send({type:'openingInput',action:{type:'greet',guest:guest.celebrationIndex}});}}/></div>
   <div className={css.actions}>{w.config.celebration?.guests.slice(0,w.metrics.arrivals).map((g,i)=><button className={css.button} key={i} disabled={opening.greeted.includes(i)} onClick={()=>send({type:'openingInput',action:{type:'greet',guest:i}})}>{opening.greeted.includes(i)?'✓ ': 'Greet '}{g.name}</button>)}</div>
   <div className={css.actions}><button className={css.button} onClick={()=>send({type:'openingInput',action:{type:opening.paused?'resume':'pause'}})}>{opening.paused?'Resume celebration':'Pause'}</button><button className={css.primary} disabled={w.metrics.plates<6||opening.greeted.length<3} onClick={()=>send({type:'completeProject'})}>Celebrate & receive plaque</button><button className={css.quietLink} onClick={()=>send({type:'openingInput',action:{type:'cancel'}})}>Cancel · retry free</button></div>
  </DinerModal>;
 }
 const next=projectNextAction(state);
 return <DinerModal title="My restaurant project" eyebrow="Make a place that feels like yours" onClose={close}>
  {!choosing&&progress?<><h3>{RESTAURANT_PROJECTS[progress.id].name}</h3><ol>{['Choose the menu','Become known for it','Make the room yours','Celebrate'].map((label,i)=><li key={label}>{progress.completed||progress.stage>i?'✓ ':''}{label}</li>)}</ol>
   {progress.completed?<><p className={css.notice}>{progress.project.plaqueName} has opened its doors. Your plaque is yours to keep.</p><button className={css.primary} onClick={()=>place(`prestige_project_${progress.id}`)}>Place your plaque</button><button className={css.button} onClick={()=>open('postcard')}>Save your before-and-after postcard</button><button className={css.button} onClick={()=>send({type:'startOpening'})}>Replay opening night · no rewards</button></>:<>
    {next&&<p>{next.detail}</p>}
    {progress.stage===2?<><button className={css.button} onClick={()=>open('name')}>Confirm restaurant name</button><button className={css.button} onClick={()=>open('catalogue')}>Place your decorations</button><button className={css.primary} disabled={!progress.decor} onClick={()=>send({type:'confirmProjectDesign'})}>My design is ready</button></>:progress.ready?<button className={css.primary} onClick={()=>send({type:'startOpening'})}>Host opening night</button>:next&&<button className={css.primary} onClick={()=>open(next.action)}>{next.label}</button>}
   </>}<details><summary>Inspiration</summary><p>Use any owned furniture and finishes. A coordinated collection is optional.</p><button className={css.button} onClick={()=>open('roomStyles')}>Preview a collection in my room</button></details><button className={css.quietLink} onClick={()=>setChoosing(true)}>Choose another project · keep progress</button></>:<>
   <p>Pick a place to build toward. Your normal cooking and decorating count.</p><div className={css.list}>{Object.entries(RESTAURANT_PROJECTS).map(([id,p])=><button className={id===kind?css.softButton:css.button} key={id} onClick={()=>choose(id as RestaurantProjectId)}>{p.name}{state.projects?.entries[id as RestaurantProjectId]?.completed?' ✓':''}</button>)}</div>
   {kind==='ramen'||kind==='bistro'?<>{[0,1].map(slot=><label key={slot}>{slot===0?'First dish':'Second dish'}<select className={css.input} value={slot===0?first:second} onChange={e=>(slot===0?setFirst:setSecond)(e.target.value)}><option value="">Choose an owned dish</option>{RECIPES.filter(r=>state.recipes[r.id]&&(kind==='ramen'?r.id.includes('ramen'):r.course===(slot===0?'main':'dessert'))).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>)}</>:<p>{RECIPE_BY_ID[first]?.name} + {RECIPE_BY_ID[second]?.name}</p>}
   <button className={css.primary} disabled={!validProjectPair(kind,[first,second])} onClick={()=>{if(send({type:'selectProject',id:kind,pair:[first,second]}))setChoosing(false);}}>Work toward this restaurant</button>
  </>}
 </DinerModal>;
}
