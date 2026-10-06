"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {validateProblemReport,replayProblem,REPORT_LIMITS,type ProblemReport,type ReportCategory} from '@/lib/chef/diner/problem-reports';
import {gameplayRecorder} from './gameplay-recorder';
import {readLocalDiagnostics} from './local-diagnostics';
import {serviceScene} from './scene-adapter';
import {DinerModal} from './DinerModal';
import {useDinerAccess} from './DinerAccess';
import css from './diner.module.css';
const Scene=dynamic(()=>import('./DinerScene'),{ssr:false});
const labels:Record<ReportCategory,string>={interaction:'Couldn’t interact',understanding:'Didn’t understand',difficulty:'Too difficult'};
export function ReportReplay({report}:{report:ProblemReport}){
 const [tick,setTick]=useState(0),[playing,setPlaying]=useState(false);
 const total=report.replay?.actions.reduce((n,a)=>n+(a.type==='tick'?a.ticks:0),0)??0;
 useEffect(()=>{setTick(0);setPlaying(false);},[report.id]);
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setTick(n=>Math.min(total,n+4)),200);return()=>clearInterval(timer);},[playing,total]);
 useEffect(()=>{if(tick>=total)setPlaying(false);},[tick,total]);
 const service=useMemo(()=>replayProblem(report,tick),[report,tick]),scene=service?serviceScene(service,null,'#b66751'):null;
 if(scene){scene.previewInset=0;scene.paused=true;}
 return <div>{scene?<><div style={{height:280,position:'relative'}}><Scene mode="truck" scene={scene} rotation={0} onTarget={()=>{}} onTile={()=>{}}/></div><label>Replay · {(tick/20).toFixed(1)} seconds<input type="range" min={0} max={total} value={tick} onChange={e=>{setPlaying(false);setTick(Number(e.target.value));}} style={{width:'100%'}}/></label><button className={css.button} onClick={()=>{if(tick>=total)setTick(0);setPlaying(v=>!v);}}>{playing?'Pause replay':'Play replay'}</button></>:<p className={css.small}>A visual replay is unavailable for this game version. The action log is retained.</p>}<details><summary>Gameplay details</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:250,overflow:'auto'}}>{JSON.stringify({actions:report.replay?.actions??[],diagnostics:report.diagnostics},null,2)}</pre></details></div>;
}
export function ProblemReportPanel({close}:{close:()=>void}){
 const access=useDinerAccess(),draftKey=`dk-report-draft-v1:${access&&'wallet'in access?access.wallet:'local'}`;
 const [category,setCategory]=useState<ReportCategory>('interaction'),[note,setNote]=useState(''),[include,setInclude]=useState(true),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState('');
 const [replay]=useState(()=>gameplayRecorder.snapshot()),[diagnostics]=useState(readLocalDiagnostics),[pending,setPending]=useState<ProblemReport|null>(null);
 const id=useRef('');if(!id.current&&typeof crypto!=='undefined')id.current=crypto.randomUUID();
 const draft:ProblemReport={version:1,id:id.current,build:process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0,12)??'personal-touches-v1',category,note,replay:include?replay:null,diagnostics};
 useEffect(()=>{try{const saved=validateProblemReport(JSON.parse(localStorage.getItem(draftKey)??'null'));if(saved?.version===1){setPending(saved);setCategory(saved.category);setNote(saved.note);setInclude(!!saved.replay);setStatus('Your unsent report is ready to retry.');}}catch{}},[draftKey]);
 const download=()=>{const safe=validateProblemReport(pending??draft);if(!safe){setStatus('This replay is too large. Turn off the replay attachment and try again.');return;}const url=URL.createObjectURL(new Blob([JSON.stringify(safe)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='domain-kitchen-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 async function submit(){const payload=validateProblemReport(pending??draft);if(!payload){setStatus('This replay is too large. Turn off the replay attachment and try again.');return;}setBusy(true);setStatus('Sending…');try{localStorage.setItem(draftKey,JSON.stringify(payload));setPending(payload);const response=await fetch('/api/chef/diner/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error??'Sending did not finish.');localStorage.removeItem(draftKey);setReceipt(result.id);setStatus('Thank you. Your report is saved.');}catch(e){setStatus(e instanceof Error?e.message:'Your report is still waiting.');}finally{setBusy(false);}}
 return <DinerModal title="What got in the way?" onClose={close}>{receipt?<><p role="status">{status}</p><p className={css.small}>Report {receipt}</p><button className={css.primary} onClick={close}>Back to the game</button></>:<>
  <label>What happened?<select className={css.button} disabled={!!pending} value={category} onChange={e=>setCategory(e.target.value as ReportCategory)}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
  <label>A little more detail (optional)<textarea className={css.button} style={{width:'100%',minHeight:80,textAlign:'left'}} maxLength={REPORT_LIMITS.note} disabled={!!pending} value={note} onChange={e=>setNote(e.target.value)}/></label>
  <label className={css.button}><input type="checkbox" disabled={!replay||!!pending} checked={pending?!!pending.replay:include&&!!replay} onChange={e=>setInclude(e.target.checked)}/> Include recent cooking actions</label>
  <p className={css.small}>Sends your note and game diagnostics to our private team inbox. No screen recording or wallet credentials. Reports are deleted after 30 days.</p>
  {(pending?.replay||include&&replay)&&<details><summary>Preview what will be sent</summary><ReportReplay report={pending??draft}/></details>}
  <div className={css.actions}><button className={css.primary} disabled={busy} onClick={()=>void submit()}>{pending?'Retry same report':'Send report'}</button><button className={css.button} onClick={download}>Download instead</button>{pending&&<button className={css.quietLink} disabled={busy} onClick={()=>{setPending(null);id.current=crypto.randomUUID();localStorage.removeItem(draftKey);}}>Edit report</button>}</div>{status&&<p role="status">{status}</p>}
 </>}</DinerModal>;
}
