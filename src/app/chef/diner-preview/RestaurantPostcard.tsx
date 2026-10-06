"use client";
import {quietRestaurantScene} from './quiet-view';
import {dishPresentationName} from '@/lib/chef/diner/personal-touches';
import {useMemo,useRef,useState} from 'react';
import {homeSimulationConfig,type DinerState} from '@/lib/chef/diner/progression';
import {createHomeWorld} from '@/lib/chef/diner/home-simulation';
import {prestigeRewards} from '@/lib/chef/diner/progress-rewards';
import {physicalHomeScene as homeScene} from './physical-home-scene';
import DinerScene from './DinerScene';
import {DinerModal} from './DinerModal';
import css from './diner.module.css';

/** A separate presentation of the owned room. No simulation or save is advanced. */
export function RestaurantPostcard({state,close}:{state:DinerState;close:()=>void}){
 const beforeHost=useRef<HTMLDivElement>(null);const projectId=state.projects?.active,project=projectId?state.projects?.entries[projectId]:null,before=project?.completed?project.before:null;
 const beforeScene=useMemo(()=>before?quietRestaurantScene({...state,...before,home:{...state.home,...before.home}}):null,[before]);
 const host=useRef<HTMLDivElement>(null),[rotation,setRotation]=useState(0),[status,setStatus]=useState('');
 const badges=prestigeRewards(state).filter(r=>r.claimed),[selected,setSelected]=useState(()=>badges.slice(0,3).map(r=>r.id));
 const scene=useMemo(()=>{const view=quietRestaurantScene(state);view.paused=true;view.previewInset=0;return view;},[state]);
 function download(){const source=host.current?.querySelector<HTMLCanvasElement>('canvas');if(!source){setStatus('Wait for your restaurant to appear.');return;}
  try{const image=document.createElement('canvas');image.width=1200;image.height=1000;const ctx=image.getContext('2d')!;
   ctx.fillStyle='#f7efdf';ctx.fillRect(0,0,1200,1000);ctx.fillStyle='#376552';ctx.textAlign='center';ctx.font='700 18px sans-serif';ctx.fillText('DOMAIN KITCHEN · A PLACE OF MY OWN',600,40);
   let size=48;do{ctx.font=`700 ${size}px Georgia`;if(ctx.measureText(state.home.name).width<=1080)break;size-=2;}while(size>24);ctx.fillText(state.home.name,600,100);
   const old=beforeHost.current?.querySelector<HTMLCanvasElement>('canvas');
   if(old){ctx.font='700 22px sans-serif';ctx.fillText('Before',300,150);ctx.fillText('After',900,150);const fit=Math.min(560/old.width,660/old.height);ctx.drawImage(old,20+(560-old.width*fit)/2,175+(660-old.height*fit)/2,old.width*fit,old.height*fit);}
   const scale=Math.min((old?560:1160)/source.width,(old?660:720)/source.height),width=source.width*scale,height=source.height*scale;ctx.drawImage(source,old?620+(560-width)/2:(1200-width)/2,old?175+(660-height)/2:130+(720-height)/2,width,height);
   ctx.font='700 22px sans-serif';const labels=badges.filter(b=>selected.includes(b.id)).map(b=>b.name);labels.forEach((label,i)=>ctx.fillText(label,600,880+i*30,1100));
   if(state.personal?.signature){ctx.font='18px sans-serif';ctx.fillText(dishPresentationName(state.personal.signature.recipeId,state.personal.signature),600,960,1080);}
   ctx.font='16px sans-serif';ctx.fillText('domainkitchen.xyz',600,982);
   const link=document.createElement('a');link.download='domain-kitchen-postcard.png';link.href=image.toDataURL('image/png');link.click();setStatus('Saved to Downloads. Share it wherever you like.');
  }catch{setStatus('Your browser could not save this postcard. Please try again.');}
 }
 return <DinerModal title="Your restaurant postcard" eyebrow="Preview · sharing is your choice" onClose={close} wide footer={<><button className={css.button} onClick={close}>Close</button><button className={css.primary} onClick={download}>Download postcard</button></>}>
  <h3 style={{textAlign:'center'}}>{state.home.name}</h3>
  {beforeScene&&<><h4>Before</h4><div ref={beforeHost} style={{height:260,position:'relative'}}><DinerScene mode='home' scene={{...beforeScene,previewInset:0}} rotation={rotation} showWorldHints={false} onTarget={()=>{}} onTile={()=>{}}/></div><h4>After</h4></>}
  <div ref={host} style={{position:'relative',height:'min(55dvh,560px)',minHeight:260,borderRadius:20,overflow:'hidden'}}><DinerScene mode="home" scene={scene} rotation={rotation} onRotate={setRotation} showWorldHints={false} onTarget={()=>{}} onTile={()=>{}}/></div>
  <div className={css.actions}><button className={css.button} onClick={()=>setRotation(v=>(v+3)%4)}>Rotate left</button><button className={css.button} onClick={()=>setRotation(v=>(v+1)%4)}>Rotate right</button></div>
  <p className={css.small}>Frame your room using zoom and rotation. Choose up to three earned displays for the card. Downloading never publishes anything.</p>
  <div className={css.actions}>{badges.map(b=><button className={selected.includes(b.id)?css.softButton:css.button} aria-pressed={selected.includes(b.id)} disabled={!selected.includes(b.id)&&selected.length===3} key={b.id} onClick={()=>setSelected(v=>v.includes(b.id)?v.filter(id=>id!==b.id):[...v,b.id])}>{b.name}</button>)}</div>
  {status&&<p className={css.notice} role="status">{status}</p>}
 </DinerModal>;
}
