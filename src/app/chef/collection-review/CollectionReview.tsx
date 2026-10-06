'use client';
import {useMemo,useState,useEffect,useRef} from 'react';
import {createDiner,dispatchDiner,homeSimulationConfig,type DinerCommand} from '@/lib/chef/diner/progression';
import {createHomeWorld,stepHomeWorld} from '@/lib/chef/diner/home-simulation';
import {COLLECTIBLES} from '@/lib/chef/diner/collectible-packs';
import {createPlacementDraft,previewPlacement} from '../diner-preview/placement-preview';
import {homeScene} from '../diner-preview/home-scene';
import DinerScene from '../diner-preview/DinerScene';
import {ModelIcon} from '../diner-preview/ModelIcon';
import {EquipmentAppearance,type AppearanceChoice} from '../diner-preview/EquipmentAppearance';
const now=Date.UTC(2026,8,23,12),heroes=['collect_dragonfire_grill','collect_disco_burger_jukebox','collect_lucky_cat_soda'];
function fixture(){const state=createDiner(now,'collection-review');state.home.name='The Lunch Club';for(const item of COLLECTIBLES)state.decorOwned[item.id]=1;state.equipment.drinks={tier:1,homeCopies:1,truckOwned:true};const p=previewPlacement(state,createPlacementDraft(state,'home','drinks','review-drinks'));return p.error?state:dispatchDiner(state,p.command,{now}).state;}
export default function CollectionReview(){
 const [state,setState]=useState(fixture),[rotation,setRotation]=useState(0),[choice,setChoice]=useState<AppearanceChoice|null>(null),[notice,setNotice]=useState(''),[gallery,setGallery]=useState(false),[film,setFilm]=useState(false),[frame,setFrame]=useState(0);
 const [selected,setSelected]=useState(COLLECTIBLES[0].id),[reviewSize,setReviewSize]=useState('1280x720');
 const stateRef=useRef(state);stateRef.current=state;
 const world=useMemo(()=>{const w=createHomeWorld(homeSimulationConfig(state));for(let t=0;t<500;t++)stepHomeWorld(w);return w;},[state]);useEffect(()=>{const timer=setInterval(()=>{stepHomeWorld(world);setFrame(f=>f+1);},50);return()=>clearInterval(timer);},[world]);
 const scene=useMemo(()=>{const s=homeScene(state,world,null,'#b85a47');if(choice)for(const object of s.objects)if(object.id===choice.targetId)object.appearance=choice.skinId??undefined;s.quality='high';return s;},[state,world,frame,choice]);
 const send=(command:DinerCommand)=>{const result=dispatchDiner(state,command,{now});setNotice(result.error??'Applied to the real room');if(!result.error)setState(result.state);return !result.error;};
 const equip=(kind:string,skinId:string)=>{const target=state.home.layout.find(p=>p.equipmentId===kind);if(target)setChoice({location:'home',targetId:target.id,skinId});};
 const place=()=>{const p=previewPlacement(state,createPlacementDraft(state,'home','collect_disco_burger_jukebox','review-jukebox'));if(p.error)setNotice(p.error);else send(p.command);};
 const showcase=()=>{const item=COLLECTIBLES.find(c=>c.id===selected)!;let s=fixture();
  if(item.equipmentKind){s.equipment[item.equipmentKind]={tier:2,homeCopies:1,truckOwned:true};let target=s.home.layout.find(p=>p.equipmentId===item.equipmentKind);
   if(!target){const p=previewPlacement(s,createPlacementDraft(s,'home',item.equipmentKind,'review-machine'));if(p.error){setNotice(p.error);return;}s=dispatchDiner(s,p.command,{now}).state;target=s.home.layout.find(p=>p.equipmentId===item.equipmentKind);}
   const result=dispatchDiner(s,{type:'setCollectibleAppearance',location:'home',targetId:target!.id,skinId:item.id},{now});if(result.error){setNotice(result.error);return;}s=result.state;
  }else{const p=previewPlacement(s,createPlacementDraft(s,'home',item.id,'review-collectible'));if(p.error){setNotice(p.error);return;}const result=dispatchDiner(s,p.command,{now});if(result.error){setNotice(result.error);return;}s=result.state;}
  setState(s);setGallery(false);setChoice(null);setNotice(`${item.name} in the real room`);
 };
 const captureRoom=()=>requestAnimationFrame(()=>document.querySelector('canvas')?.toBlob(blob=>{const item=COLLECTIBLES.find(c=>c.id===selected)!;if(blob)void fetch(`/api/chef/review-capture?name=collection_${item.shape}_room_${film?'1280x720':reviewSize}.png`,{method:'POST',body:blob}).then(r=>setNotice(r.ok?`${item.name} room capture saved on D:`:'Capture failed'));}));
 const record=async()=>{
  const canvas=document.querySelector<HTMLCanvasElement>('canvas[tabindex]');if(!canvas){setNotice('Open the restaurant first.');return;}
  const chunks:Blob[]=[];const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:12_000_000});
  recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const r=await fetch('/api/chef/review-capture?name=showcase.webm',{method:'POST',headers:{'Content-Type':'video/webm'},body:new Blob(chunks,{type:'video/webm'})});setNotice(r.ok?'14-second gameplay capture saved on D:':'Capture could not be saved.');};
  const apply=(kind:string,id:string)=>{const s=stateRef.current,t=s.home.layout.find(p=>p.equipmentId===kind);if(t){const r=dispatchDiner(s,{type:'setCollectibleAppearance',location:'home',targetId:t.id,skinId:id},{now});if(!r.error)setState(r.state);}};
  apply('grill','collect_dragonfire_grill');setNotice('Recording actual game renderer…');recorder.start();
  setTimeout(()=>{const s=stateRef.current;if(s.home.layout.some(p=>p.id==='review-jukebox'))return;const p=previewPlacement(s,{...createPlacementDraft(s,'home','collect_disco_burger_jukebox','review-jukebox'),x:8,y:5});if(!p.error)setState(dispatchDiner(s,p.command,{now}).state);},4500);
  setTimeout(()=>apply('drinks','collect_lucky_cat_soda'),9000);setTimeout(()=>recorder.stop(),14000);
 };
 const exportIcons=async()=>{for(const image of Array.from(document.querySelectorAll<HTMLImageElement>('img[data-model-icon="ready"]'))){const item=COLLECTIBLES.find(c=>c.name===image.alt);if(!item)continue;const blob=await (await fetch(image.src)).blob();const saved=await fetch(`/api/chef/review-capture?name=collection_${item.shape}.png`,{method:'POST',body:blob});if(!saved.ok){setNotice(`Could not save ${item.name}.`);return;}}setNotice('Loaded catalogue images saved on D:.');};
 return <main style={{background:'#f4e9dd',minHeight:'100dvh',color:'#31594e',fontFamily:'system-ui'}}><header style={{position:'relative',zIndex:20,background:'#f4e9ddee',padding:'12px 20px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><strong>Lunch Club · playable collection review</strong><button onClick={()=>setGallery(!gallery)}>{gallery?'Show restaurant':'Show collection'}</button><button onClick={()=>equip('grill','collect_dragonfire_grill')}>Dress the grill</button><button onClick={()=>equip('drinks','collect_lucky_cat_soda')}>Dress the fountain</button><button disabled={state.home.layout.some(p=>p.id==='review-jukebox')} onClick={place}>Place the jukebox</button><button onClick={()=>setState(fixture())}>Reset fixture</button><small>{notice}</small></header>
 <nav style={{position:'relative',zIndex:20,padding:'4px 20px',display:'flex',gap:20,flexWrap:'wrap'}}><button onClick={()=>setFilm(!film)}>{film?'Responsive framing':'Film framing 1280 × 720'}</button><button onClick={record} disabled={gallery}>Record 14-second showcase</button><button onClick={exportIcons} disabled={!gallery}>Save loaded catalogue images</button><label>Review frame<select value={reviewSize} onChange={e=>{setReviewSize(e.target.value);setFilm(false);}}>{['1280x720','390x844'].map(s=><option key={s}>{s}</option>)}</select></label><label>Preview collectible<select value={selected} onChange={e=>setSelected(e.target.value)}>{COLLECTIBLES.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button onClick={showcase}>Show in room</button><button onClick={captureRoom} disabled={gallery}>Save room capture</button></nav>
 {gallery?<section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:18,padding:24}}>{COLLECTIBLES.map(c=><article key={c.id} style={{background:'#fff7e8',padding:18,borderRadius:20,textAlign:'center'}}><ModelIcon kind={c.id} label={c.name} size={240}/><h3>{c.name}</h3><small>{c.pack} · {c.rarity}</small></article>)}</section>:<div style={{position:'relative',width:film?1280:Number(reviewSize.split('x')[0]),height:film?720:Number(reviewSize.split('x')[1]),minHeight:400}}><DinerScene mode="home" scene={scene} rotation={rotation} onRotate={setRotation} editing={false} onTarget={()=>{}} onTile={()=>{}}/></div>}
 {choice&&<EquipmentAppearance state={state} initial={choice} send={send} preview={setChoice} close={()=>setChoice(null)}/>}
 </main>;
}
