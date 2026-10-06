'use client';
import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
import {rehearseHome,rehearseTruck,type RehearsalResult} from '@/lib/chef/diner/layout-rehearsal';
import {homeSimulationConfig,type DinerState} from '@/lib/chef/diner/progression';
import type {CreateServiceOptions} from '@/lib/chef/diner/types';
import {DinerModal} from './DinerModal';
import {physicalHomeScene} from './physical-home-scene';
import {serviceScene} from './scene-adapter';
import css from './diner.module.css';
const DinerScene=dynamic(()=>import('./DinerScene'),{ssr:false});
export type RehearsalDraft={mode:'home';candidate:DinerState;previous:DinerState;error?:string|null}|{mode:'truck';candidate:CreateServiceOptions;previous:CreateServiceOptions;error?:string|null};
export function LayoutRehearsal({draft,close,confirm}:{draft:RehearsalDraft;close:()=>void;confirm?:()=>void}){
  const [results,setResults]=useState<{next:RehearsalResult;before:RehearsalResult}|null>(null),[error,setError]=useState<string|null>(null),[frame,setFrame]=useState(0),[rotation,setRotation]=useState(0),[running,setRunning]=useState(true);
  useEffect(()=>{let cancelled=false;setResults(null);setError(null);setFrame(0);const timer=setTimeout(()=>{try{const next=draft.mode==='home'?rehearseHome(homeSimulationConfig(draft.candidate)):rehearseTruck(draft.candidate),before=draft.mode==='home'?rehearseHome(homeSimulationConfig(draft.previous),false):rehearseTruck(draft.previous,false);if(!cancelled)setResults({next,before});}catch{if(!cancelled)setError('This arrangement could not be rehearsed. Your restaurant is unchanged; return to arranging and check the working positions.');}},0);return()=>{cancelled=true;clearTimeout(timer);};},[draft]);
  useEffect(()=>{if(!running||!results)return;const timer=setInterval(()=>setFrame(n=>Math.min(n+1,results.next.frames.length-1)),250);return()=>clearInterval(timer);},[results,running]);
  const sample=results?.next.frames[frame],scene=sample?.truck?serviceScene(sample.truck,null,'#91aa9a'):sample?.home&&draft.mode==='home'?physicalHomeScene(draft.candidate,sample.home,null,'#91aa9a'):null;
  if(scene){scene.rehearsal=true;scene.paused=!running;scene.selectedId=null;scene.guideTarget=null;scene.previewInset=12;scene.truckSetup=true;}
  return <DinerModal title="Test my layout" eyebrow="Rehearsal · three orders · 4× speed" wide onClose={close} footer={<><button className={css.button} onClick={close}>Back to arranging</button>{confirm&&<button className={css.primary} disabled={!!draft.error} onClick={confirm}>Confirm placement</button>}</>}>
    <p className={css.panelLead}>Ghosts use the real walking and cooking rules. Your coins, food, inventory and achievements are untouched. Throughput is an estimate.</p>
    {scene&&<div style={{height:'min(50dvh,460px)',position:'relative',borderRadius:18,overflow:'hidden'}}><DinerScene mode={draft.mode} scene={scene} rotation={rotation} onRotate={setRotation} onTarget={()=>{}} onTile={()=>{}} showWorldHints={false}/></div>}
    {error?<p role="alert">{error}</p>:!results?<p role="status">Trying three representative orders…</p>:<><div className={css.actions}><button className={css.button} onClick={()=>setRunning(value=>!value)}>{running?'Pause ghosts':'Play ghosts'}</button><button className={css.button} onClick={()=>{setFrame(0);setRunning(true);}}>Replay</button><span>{Math.round((sample?.tick??0)/20)} / {Math.round(results.next.seconds)} seconds</span></div><table style={{width:'100%',textAlign:'left',fontSize:13,marginTop:12}}><thead><tr><th>Estimate</th><th>Previous</th><th>Proposed</th></tr></thead><tbody>{[['Orders served',results.before.served,results.next.served],['Orders unfinished',results.before.unfinished,results.next.unfinished],['Dishes washed',results.before.washed,results.next.washed],['Walking seconds',Math.round(results.before.walkingSeconds),Math.round(results.next.walkingSeconds)],['Traffic delay seconds',Math.round(results.before.congestionSeconds),Math.round(results.next.congestionSeconds)]].map(([label,before,next])=><tr key={label}><th>{label}</th><td>{before}</td><td>{next}</td></tr>)}</tbody></table><ul>{[...(draft.error?[draft.error]:[]),...results.next.issues].map((issue,i)=><li key={i}>{issue}</li>)}</ul>{!draft.error&&!results.next.issues.length&&<p>All three orders fit this rehearsal. Play style and later rushes will change the result.</p>}</>}
  </DinerModal>;
}
