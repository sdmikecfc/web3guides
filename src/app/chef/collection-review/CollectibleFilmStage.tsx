'use client';
import {useMemo,useState} from 'react';
import DinerScene from '../diner-preview/DinerScene';
import {preloadCollectionAssets} from '../diner-preview/collection-assets';
import {collectibleFilmScene,FILM_HEROES} from './film-fixture';

export default function CollectibleFilmStage(){
 const [shot,setShot]=useState<0|1|2>(0),[revealed,setRevealed]=useState(true),[recording,setRecording]=useState(false),[notice,setNotice]=useState('');
 const scene=useMemo(()=>collectibleFilmScene(shot,revealed),[shot,revealed]);
 const title=['Dragonfire Grill','Disco Burger Jukebox','Lucky Cat Soda Fountain'][shot];
 const capture=()=>requestAnimationFrame(()=>document.querySelector<HTMLCanvasElement>('[data-film-closeups] canvas')?.toBlob(blob=>{if(blob)void fetch(`/api/chef/review-capture?name=hero_${shot}_${revealed?'after':'before'}.png`,{method:'POST',body:blob}).then(r=>setNotice(r.ok?'Close-up saved on D:':'Capture failed'));}));
 const record=async()=>{
  if(recording)return;setRecording(true);setNotice('Loading all three hero meshes…');
  try{
   await preloadCollectionAssets(FILM_HEROES);setShot(0);setRevealed(false);
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   const canvas=document.querySelector<HTMLCanvasElement>('[data-film-closeups] canvas');if(!canvas)throw Error('Scene is not ready');
   const stream=canvas.captureStream(30),parts:Blob[]=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:18_000_000});
   recorder.ondataavailable=e=>parts.push(e.data);const timers:number[]=[];
   recorder.onstop=async()=>{timers.forEach(clearTimeout);stream.getTracks().forEach(t=>t.stop());const response=await fetch('/api/chef/review-capture?name=showcase-closeups.webm',{method:'POST',body:new Blob(parts,{type:'video/webm'})});setRecording(false);setNotice(response.ok?'Three clean close-ups recorded on D:':'Saving failed');};
   recorder.start();setNotice('Recording: apply grill skin → place jukebox → apply fountain skin');
   const at=(time:number,action:()=>void)=>timers.push(window.setTimeout(action,time));
   at(800,()=>setRevealed(true));at(4500,()=>{setShot(1);setRevealed(false);});at(5300,()=>setRevealed(true));
   at(9000,()=>{setShot(2);setRevealed(false);});at(9800,()=>setRevealed(true));at(14000,()=>recorder.stop());
  }catch(error){setRecording(false);setNotice(error instanceof Error?error.message:'Recording failed');}
 };
 return <section data-film-closeups><nav style={{padding:16,display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
  <label>Hero shot <select disabled={recording} value={shot} onChange={e=>setShot(Number(e.target.value) as 0|1|2)}>{['Dragonfire Grill','Disco Burger Jukebox','Lucky Cat Soda Fountain'].map((name,i)=><option key={name} value={i}>{name}</option>)}</select></label>
  <button disabled={recording} onClick={()=>setRevealed(!revealed)}>{revealed?'Show before':'Show applied / placed'}</button>
  <button disabled={recording} onClick={capture}>Save hero close-up</button><button disabled={recording} onClick={record}>Record clean close-ups</button><output>{notice||title}</output>
 </nav><div style={{position:'relative',width:1280,height:720}}><DinerScene mode="home" scene={scene} rotation={0} onTile={()=>{}} onTarget={()=>{}} showWorldHints={false}/></div></section>;
}
