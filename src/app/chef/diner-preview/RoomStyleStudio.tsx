"use client";
import {useMemo,useState} from 'react';
import {atRestaurant,canVisitRestaurant,homeSimulationConfig,type DinerState,type DinerCommand,type HomePlacement} from '@/lib/chef/diner/progression';
import {ROOM_STYLES,roomStyleQuote} from '@/lib/chef/diner/room-design';
import {STYLE_BUNDLES,type StyleBundleId} from '@/lib/chef/diner/progress-rewards';
import {DECOR_BY_ID} from '@/lib/chef/diner/collections';
import {createHomeWorld} from '@/lib/chef/diner/home-simulation';
import {physicalHomeScene as homeScene} from './physical-home-scene';
import DinerScene from './DinerScene';
import {createPlacementDraft,previewPlacement,aimHomeMount,rotatePlacementDraft,type PlacementDraft} from './placement-preview';
import {DinerModal} from './DinerModal';
import css from './diner.module.css';
import styles from './room-style-studio.module.css';

function previewOwnership(state:DinerState,id:string){
 const draft=structuredClone(state),quote=roomStyleQuote(draft,id);if(!quote)return draft;
 for(const item of quote.style.decor)draft.decorOwned[item]=Math.max(1,draft.decorOwned[item]??0);
 Object.assign(draft.home.finishes!,quote.style.finishes);Object.assign(draft.cosmetics,quote.style.surfaces);return draft;
}
function suggestedLayout(state:DinerState,id:string){
 const draft=previewOwnership(state,id),style=ROOM_STYLES.find(s=>s.id===id)!;
 for(const item of style.decor){if(draft.home.layout.some(p=>p.equipmentId===item))continue;const placement=createPlacementDraft(draft,'home',item,`style-${item}`),preview=previewPlacement(draft,placement);if(!preview.error&&preview.command.type==='homeLayout')draft.home.layout=preview.command.layout;}
 return draft.home.layout;
}
export function RoomStyleStudio({state,send,close,reward=false}:{state:DinerState;send:(c:DinerCommand)=>boolean;close:()=>void;reward?:boolean}){
 const available=ROOM_STYLES.filter(s=>!!roomStyleQuote(state,s.id)&&(!reward||STYLE_BUNDLES.some(b=>b.id===s.id)));
 const [styleId,setStyleId]=useState(state.progressRewards?.style??available[0].id),[rotation,setRotation]=useState(0);
 const [layout,setLayout]=useState<HomePlacement[]>(()=>suggestedLayout(state,styleId)),[item,setItem]=useState<PlacementDraft|null>(null),[message,setMessage]=useState('');
 const [past,setPast]=useState<HomePlacement[][]>([]),[future,setFuture]=useState<HomePlacement[][]>([]);
 const quote=roomStyleQuote(state,styleId)!,eligible=state.career.services>=1&&!state.progressRewards?.style;
 const draft=useMemo(()=>{const value=previewOwnership(state,styleId);value.home.layout=layout;return value;},[state,styleId,layout]);
 const pending=item?previewPlacement(draft,item):null;
 const scene=useMemo(()=>{const value=homeScene(draft,createHomeWorld({...homeSimulationConfig(draft),arrivalRate:0}),item?.id??null,'');value.previewInset=0;value.people=[];value.objects=value.objects.filter(o=>!o.id.startsWith('incident:'));if(item&&pending){value.objects=value.objects.filter(o=>o.id!==item.id);value.tables=value.tables.filter(o=>o.id!==item.id);value.placement={object:pending.object,table:pending.table,valid:!pending.error};}return value;},[draft,item,pending]);
 const change=(next:HomePlacement[])=>{setPast(v=>[...v,layout].slice(-30));setFuture([]);setLayout(next);};
 const select=(id:string)=>{const placed=layout.find(p=>p.id===id);if(placed)setItem(createPlacementDraft(draft,'home',placed.equipmentId,id,true));};
 const choose=(id:string)=>{setStyleId(id);setLayout(suggestedLayout(state,id));setItem(null);setPast([]);setFuture([]);setMessage('');};
 const ensureHome=()=>atRestaurant(state)||(canVisitRestaurant(state)&&send({type:'visitRestaurant'}));
 const apply=()=>{if(!ensureHome()){setMessage('Finish the current stop before applying this design.');return;}if(send({type:'applyRoomStyle',styleId,layout,expectedCost:quote.cost}))close();};
 return <DinerModal title={reward?'Your first little transformation':'Find your restaurant style'} eyebrow="Preview in your own room" onClose={close} wide bodyClassName={styles.body}>
  <div className={styles.studio}><div className={styles.scene}><DinerScene mode="home" scene={scene} rotation={rotation} onRotate={setRotation} editing showWorldHints={false} onTarget={select} onTile={(x,y)=>{if(item)setItem(aimHomeMount(draft,item,x,y,true));}}/></div>
  <div className={styles.controls}><div className={css.tabs} aria-label="Restaurant styles">{available.map(s=><button key={s.id} aria-pressed={s.id===styleId} className={s.id===styleId?css.tabActive:''} onClick={()=>choose(s.id)}>{s.name}</button>)}</div>
  <p className={css.small}>{quote.style.description} Select a piece, tap its spot, then confirm. Unplaced pieces stay in storage.</p>
  <div className={css.actions}>{quote.style.decor.map(id=>{const placed=layout.find(p=>p.equipmentId===id);return <button className={css.button} key={id} onClick={()=>placed?select(placed.id):setItem(createPlacementDraft(draft,'home',id,`style-${id}`))}>{DECOR_BY_ID[id].name}{!placed?' · stored':''}</button>;})}</div>
  {item&&<div className={css.actions}><strong>{DECOR_BY_ID[item.equipmentId]?.name??item.equipmentId}</strong><button className={css.button} onClick={()=>setItem(rotatePlacementDraft(item))}>Rotate</button><button className={css.button} onClick={()=>{if(pending?.command.type==='homeLayout'&&!pending.error){change(pending.command.layout);setItem(null);}}} disabled={!!pending?.error}>Confirm spot</button><button className={css.button} onClick={()=>{change(layout.filter(p=>p.id!==item.id&&p.mount?.targetId!==item.id));setItem(null);}}>Store</button><button className={css.button} onClick={()=>setItem(null)}>Cancel move</button></div>}
  {pending?.error&&<p role="status" className={css.notice}>{pending.error}</p>}
  <div className={css.actions}><button className={css.button} disabled={!past.length} onClick={()=>{setFuture(v=>[layout,...v]);setLayout(past[past.length-1]);setPast(v=>v.slice(0,-1));setItem(null);}}>Undo</button><button className={css.button} disabled={!future.length} onClick={()=>{setPast(v=>[...v,layout]);setLayout(future[0]);setFuture(v=>v.slice(1));setItem(null);}}>Redo</button></div>
  {reward&&eligible?<><p className={css.notice}>One free counter finish and three decorations. Your first-lunch burger ingredients are also in the pantry. Claiming stores these rewards; it does not move your furniture.</p><button className={css.primary} onClick={()=>{if(send({type:'claimStyleBundle',bundleId:styleId as StyleBundleId}))setMessage('Yours! Confirm this design or keep everything in storage.');}}>Claim {quote.style.name} · free</button></>:<><p className={css.small}>{quote.cost?`${quote.cost} coins for missing pieces and finishes. Already-owned pieces cost nothing.`:'You own everything in this design.'} Existing furniture stays owned.</p><button className={css.primary} disabled={!!item||state.coins<quote.cost||!atRestaurant(state)&&!canVisitRestaurant(state)} onClick={apply}>{quote.cost?`Buy missing pieces & apply · ${quote.cost}`:'Apply this design'}</button></>}
  {message&&<p role="status" className={css.notice}>{message}</p>}<button className={css.quietLink} onClick={close}>Keep my room as it is</button></div></div>
 </DinerModal>;
}
