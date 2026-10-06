"use client";
import {useMemo,useState} from 'react';
import {homeSimulationConfig,validateDinerHomePlacement,type DinerState,type DinerCommand,type HomePlacement} from '@/lib/chef/diner/progression';
import {EQUIPMENT_BY_ID} from '@/lib/chef/diner/content';
import {DECOR_BY_ID} from '@/lib/chef/diner/collections';
import {createHomeWorld} from '@/lib/chef/diner/home-simulation';
import {physicalHomeScene as homeScene} from './physical-home-scene';
import {transformGroup} from './group-placement';
import DinerScene from './DinerScene';
import {DinerModal} from './DinerModal';
import {LayoutRehearsal} from './LayoutRehearsal';
import css from './diner.module.css';
import styles from './room-style-studio.module.css';

export function GroupArrange({state,send,close}:{state:DinerState;send:(c:DinerCommand)=>boolean;close:()=>void}){
 const [layout,setLayout]=useState(()=>structuredClone(state.home.layout)),[ids,setIds]=useState<string[]>([]),[rotation,setRotation]=useState(0),[rehearse,setRehearse]=useState(false);
 const [moveError,setMoveError]=useState<string|null>(null);
 const [past,setPast]=useState<HomePlacement[][]>([]),[future,setFuture]=useState<HomePlacement[][]>([]);
 const draft=useMemo(()=>({...state,home:{...state.home,layout}}),[state,layout]),error=validateDinerHomePlacement(state,layout);
 const scene=useMemo(()=>{const s=homeScene(draft,createHomeWorld({...homeSimulationConfig(draft),arrivalRate:0}),ids[0]??null,'');s.previewInset=0;s.people=[];s.tileHighlights=layout.filter(p=>ids.includes(p.id)&&!p.mount).flatMap(p=>{const [a,b]=(EQUIPMENT_BY_ID[p.equipmentId]??DECOR_BY_ID[p.equipmentId]).footprint,[w,h]=p.rotation%2?[b,a]:[a,b];return Array.from({length:w*h},(_,i)=>({x:p.x+i%w,y:p.y+Math.floor(i/w),valid:!error}));});return s;},[draft,ids,error,layout]);
 const change=(next:HomePlacement[])=>{setMoveError(null);setPast(v=>[...v,layout].slice(-40));setFuture([]);setLayout(next);};
 const select=(id:string)=>{if(layout.some(p=>p.id===id))setIds(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);};
 const move=(dx:number,dy:number,turn=false)=>{const next=transformGroup(draft,ids,dx,dy,turn);if(next.layout!==draft.home.layout)change(next.layout);setMoveError(next.error);};
 const confirm=()=>{if(!error&&send({type:'homeLayout',layout}))close();};
 if(rehearse)return <LayoutRehearsal draft={{mode:'home',candidate:draft,previous:state,error}} close={()=>setRehearse(false)} confirm={confirm}/>;
 return <><DinerModal title="Arrange your restaurant" eyebrow="Draft · nothing changes until you confirm" onClose={close} wide bodyClassName={styles.body}><div className={styles.studio}><div className={styles.scene}><DinerScene mode="home" scene={scene} rotation={rotation} onRotate={setRotation} editing showWorldHints={false} onTarget={select} onTile={(x,y)=>{const root=layout.find(p=>ids.includes(p.id));if(root)move(x-root.x,y-root.y);}}/></div><div className={styles.controls}>
 <p className={css.small}>Select several pieces to move together. Countertop objects travel with their furniture. Tap a floor spot or use the arrows, then preview the routes before confirming.</p>
 <select multiple aria-label="Select furniture to move" value={ids} size={6} onChange={e=>setIds(Array.from(e.target.selectedOptions,o=>o.value))}>{layout.filter(p=>!p.mount||!ids.includes(p.mount.targetId)).map(p=><option key={p.id} value={p.id}>{(EQUIPMENT_BY_ID[p.equipmentId]??DECOR_BY_ID[p.equipmentId]).name}</option>)}</select>
 <div className={css.actions}>{[[0,-1,'↑'],[-1,0,'←'],[1,0,'→'],[0,1,'↓']].map(([x,y,label])=><button key={label} className={css.button} disabled={!ids.length} aria-label={`Move group ${label}`} onClick={()=>move(Number(x),Number(y))}>{label}</button>)}<button className={css.button} disabled={!ids.length} onClick={()=>move(0,0,true)}>Rotate group</button><button className={css.button} onClick={()=>setIds([])}>Clear selection</button><button className={css.button} disabled={!ids.length} onClick={()=>{change(layout.filter(p=>!ids.includes(p.id)&&!ids.includes(p.mount?.targetId??'')));setIds([]);}}>Store selected</button></div>
 <p role="status" className={error||moveError?css.notice:css.small}>{moveError??error??'The proposed layout has clear working routes.'}</p>
 <div className={css.actions}><button className={css.button} disabled={!past.length} onClick={()=>{setMoveError(null);setFuture(v=>[layout,...v]);setLayout(past[past.length-1]);setPast(v=>v.slice(0,-1));}}>Undo</button><button className={css.button} disabled={!future.length} onClick={()=>{setMoveError(null);setPast(v=>[...v,layout]);setLayout(future[0]);setFuture(v=>v.slice(1));}}>Redo</button><button className={css.button} onClick={()=>setRehearse(true)}>Test my layout</button><button className={css.button} onClick={close}>Cancel all</button><button className={css.primary} disabled={!!error} onClick={confirm}>Confirm arrangement</button></div></div></div></DinerModal>
 </>;
}
