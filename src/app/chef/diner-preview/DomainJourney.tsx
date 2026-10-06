'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {useAccount,useSignMessage} from 'wagmi';
import {DOMAIN_WORLDS,type DomainId} from '@/lib/chef/diner/domain-worlds';
import {DOMAIN_SEASONS} from '@/lib/chef/diner/domain-seasons';
import {createDomainJourney,replayDomainJourney,arrangeDomainService,journeyReachable,type DomainJourneyAttempt,type JourneyCommand} from '@/lib/chef/diner/domain-journeys';
import {rankedActive,type RankedLayout} from '@/lib/chef/diner/ranked-rally';
import {serviceTargetIntent,serviceSupplyChoices,serviceAssemblyChoices,itemLabel} from '@/lib/chef/diner/service';
import {RECIPE_BY_ID} from '@/lib/chef/diner/content';
import {manualWorkKey} from '@/lib/chef/diner/controls';
import {makeStation,makeTable,stationFootprint,tableFootprint} from '@/lib/chef/diner/geometry';
import type {ServiceAction} from '@/lib/chef/diner/types';
import {DinerSync,type DinerSession} from './diner-sync';
import {DomainJourneySync} from './domain-journey-sync';
import {DomainJourneyMap} from './DomainJourneyMap';
import {ControlPreferencesProvider,ControlsPanel,useControls} from './ControlPreferences';
import {HoldAction} from './HoldAction';
import {ServiceFocus} from './ServiceFocus';
import {DinerModal} from './DinerModal';
import {DinerWalletConnect} from './DinerWalletConnect';
import {ModelIcon} from './ModelIcon';
import {serviceScene} from './scene-adapter';
import {serviceCookingSteps} from './cooking-guide';
import DinerScene from './DinerScene';
import css from './domain-journey.module.css';

export default function DomainJourney(props:{domain:DomainId;review?:boolean}){return <ControlPreferencesProvider><Journey {...props}/></ControlPreferencesProvider>;}
function Journey({domain,review=false}:{domain:DomainId;review?:boolean}){
 const world=DOMAIN_WORLDS[domain],{controls}=useControls(),{address,chainId}=useAccount(),{signMessageAsync}=useSignMessage();
 const wallet=review?'0x1111111111111111111111111111111111111111':address?.toLowerCase(),walletRef=useRef(wallet);walletRef.current=wallet;
 const session=useRef<DinerSession|null>(null),client=useRef<DomainJourneySync|null>(null),fixture=useRef<DomainJourneyAttempt|null>(null);
 const [attempt,setAttempt]=useState<DomainJourneyAttempt|null>(null),[signed,setSigned]=useState(review),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(review),[rewards,setRewards]=useState<any[]>([]);
 const [otherJourney,setOtherJourney]=useState<DomainId|null>(null),[selected,setSelected]=useState<string|null>(null),[seat,setSeat]=useState<string|undefined>(),[supplies,setSupplies]=useState<string|null>(null),[rotation,setRotation]=useState(0),[draft,setDraft]=useState<RankedLayout|null>(null),[editing,setEditing]=useState(false),[guide,setGuide]=useState<string|null>(null),[settings,setSettings]=useState(false),[confirmEnd,setConfirmEnd]=useState(false);
 const reviewKey=`dk-domain-journey-review-v1:${domain}`;
 async function request(path:string,body?:any):Promise<any>{
  if(review){
   if(path==='journey/current')return {attempt:fixture.current};
   if(path==='journey/start'){
    if(fixture.current?.status!=='active'){const now=Date.now(),season={...DOMAIN_SEASONS.find(s=>s.domain===domain)!,id:`${domain}-private-review-v1`,approved:true,startsAt:now-1000,endsAt:now+7*86400000};fixture.current=createDomainJourney(body.id,wallet!,season,now,body.practice);}
   }else if(path==='journey/commands'){
    const saved=JSON.parse(localStorage.getItem(`${reviewKey}:receipt`)??'null');if(saved?.id===body.id)return {attempt:fixture.current,duplicate:true};
    const next=replayDomainJourney(fixture.current!,body,Date.now());fixture.current=next.attempt;localStorage.setItem(reviewKey,JSON.stringify(fixture.current));localStorage.setItem(`${reviewKey}:receipt`,JSON.stringify({id:body.id}));return next;
   }
   localStorage.setItem(reviewKey,JSON.stringify(fixture.current));return {attempt:fixture.current};
  }
  const response=await fetch(`/api/chef/diner/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session.current?{Authorization:`Bearer ${session.current.accessToken}`}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'}),data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.error??'The journey could not be reached.'),{status:response.status,retryAfterMs:data.retryAfterMs});return data;
 }
 function adopt(a:DomainJourneyAttempt){if(a.wallet!==walletRef.current)return;if(a.domain!==domain){setOtherJourney(a.domain);return;}setOtherJourney(null);client.current?.stop();client.current=new DomainJourneySync(a,localStorage,request,(next,message)=>{if(next.wallet!==walletRef.current)return;setAttempt({...next});setStatus(message);});setSelected(null);setSupplies(null);setDraft(null);setEditing(false);void client.current.flush();}
 useEffect(()=>{
  client.current?.stop();client.current=null;session.current=null;setAttempt(null);setSigned(review);setRewards([]);setOtherJourney(null);
  if(review){try{const saved=JSON.parse(localStorage.getItem(reviewKey)??'null');if(saved?.version===1&&saved.domain===domain&&saved.wallet===wallet){fixture.current=saved;adopt(saved);}}catch{setStatus('The private preview could not be restored. Start a fresh preview.');}}
  return()=>{client.current?.pause();client.current?.stop();};
 },[wallet,domain]);
 useEffect(()=>{if(review)return;let active=true;void request('journey/status').then(r=>{if(active)setEnabled(r.enabled&&r.seasons.some((s:any)=>s.domain===domain&&s.open));}).catch(e=>{if(active)setStatus(e.message);});return()=>{active=false;};},[domain,review]);
 useEffect(()=>{const ticks=setInterval(()=>{const c=client.current;if(!c||c.blocked||document.hidden||c.shown.phase!=='service'||c.shown.status!=='active')return;if(rankedActive(c.shown.service))c.send({type:'service',action:{type:'tick',ticks:1}});},50),save=setInterval(()=>void client.current?.flush(),500),pause=()=>client.current?.pause(),hidden=()=>{if(document.hidden)pause();};window.addEventListener('blur',pause);document.addEventListener('visibilitychange',hidden);return()=>{clearInterval(ticks);clearInterval(save);pause();window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',hidden);};},[]);
 function command(c:JourneyCommand){return client.current?.send(c);}
 const send=(action:ServiceAction)=>command({type:'service',action});
 const service=attempt?.service,work=service?manualWorkKey(service):null,previousWork=useRef<string|null>(null);
 useEffect(()=>{if(service?.chef.holding&&previousWork.current!==work)send({type:'hold',active:false});previousWork.current=work;},[work,service?.chef.holding]);
 useEffect(()=>{
  const down=(e:KeyboardEvent)=>{const c=client.current;if(!c||c.shown.phase!=='service'||c.shown.status!=='active'||guide||settings||confirmEnd||e.repeat||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement)return;const s=c.shown.service,key=e.key.toLowerCase();if(key==='e'&&!(e.target instanceof HTMLButtonElement&&e.target.dataset.workControl!==undefined)){e.preventDefault();if(manualWorkKey(s))send({type:'hold',active:controls.work==='toggle'?!s.chef.holding:true});}const dirs:Record<string,[number,number]>={w:[0,-1],arrowup:[0,-1],s:[0,1],arrowdown:[0,1],a:[-1,0],arrowleft:[-1,0],d:[1,0],arrowright:[1,0]};if(dirs[key]){e.preventDefault();send({type:'move',x:Math.round(s.chef.x)+dirs[key][0],y:Math.round(s.chef.y)+dirs[key][1]});}};
  const up=(e:KeyboardEvent)=>{if(e.key.toLowerCase()==='e'&&controls.work==='hold')send({type:'hold',active:false});};window.addEventListener('keydown',down);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
 },[controls.work,guide,settings,confirmEnd]);
 async function connect(){if(!wallet||!address)return;const expected=wallet;setBusy(true);try{
  let saved:DinerSession|null=null;try{saved=JSON.parse(localStorage.getItem(DinerSync.sessionKey(wallet))??'null');}catch{}
  if(saved?.wallet===wallet&&saved.expiresAt*1000>Date.now()+60000)session.current=saved;else{const challenge=await request('wallet/challenge',{address,chainId:chainId??1});if(walletRef.current!==expected)return;const signature=await signMessageAsync({message:challenge.message,account:address});if(walletRef.current!==expected)return;session.current=await request('wallet/verify',{nonce:challenge.nonce,message:challenge.message,signature});}
  if(walletRef.current!==expected||session.current?.wallet!==expected)return;localStorage.setItem(DinerSync.sessionKey(wallet),JSON.stringify(session.current));const result=await request('journey/current');if(walletRef.current!==expected)return;setSigned(true);if(result.attempt)adopt(result.attempt);const earned=await request('journey/rewards');if(walletRef.current===expected)setRewards(earned.rewards);
 }catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 async function start(practice=false){setBusy(true);try{const key=`dk-domain-journey-start-v1:${wallet}:${review?'review':'verified'}:${domain}:${practice}`,id=localStorage.getItem(key)??crypto.randomUUID();localStorage.setItem(key,id);const result=await request('journey/start',{id,domain,practice});if(result.attempt?.wallet!==walletRef.current)return;localStorage.removeItem(key);adopt(result.attempt);if(result.attempt.practice&&result.attempt.phase==='map'&&result.attempt.domain===domain){const first=journeyReachable(result.attempt)[0];if(first){command({type:'choose',nodeId:first.id});void client.current?.flush();}}}catch(e){setStatus((e as Error).message);}finally{setBusy(false);}}
 const target=(id:string,seatId?:string)=>{setSelected(id);setSeat(seatId);if(!service||service.phase==='setup')return;const st=service.stations.find(s=>s.id===id);if(st&&['crate','fridge'].includes(st.kind)&&!service.chef.held){setSupplies(id);send({type:'interact',targetId:id});}else{setSupplies(null);send({type:'interact',targetId:id,seatId});}};
 const move=(x:number,y:number,turn=false)=>{if(!service||!selected)return;const d=structuredClone(draft??{stations:service.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing})),tables:service.tables.map(({id,x,y,capacity,rotation})=>({id,x,y,capacity,rotation}))}),p=d.stations.find(p=>p.id===selected)??d.tables.find(p=>p.id===selected);if(!p)return;if(turn){if('facing'in p)p.facing=((p.facing+1)%4) as 0|1|2|3;else p.rotation=((p.rotation+1)%4) as 0|1|2|3;}else{p.x=x;p.y=y;}setDraft(d);};
 let shown=service,layoutError='';if(draft&&attempt&&service){try{shown=arrangeDomainService(attempt,draft);}catch(e){layoutError=(e as Error).message;shown={...service,stations:draft.stations.map(p=>makeStation(p.id,p.kind,p.x,p.y,service.stations.find(s=>s.id===p.id)!.tier,p.facing)),tables:draft.tables.map(p=>makeTable(p.id,p.x,p.y,p.capacity,1,p.rotation))};}}
 const scene=shown?serviceScene(shown,selected,world.palette.accent,world.name):null;if(scene){scene.truckSetup=true;scene.previewInset=0;if(editing&&shown){const st=shown.stations.find(p=>p.id===selected),t=shown.tables.find(p=>p.id===selected);scene.tileHighlights=(st?stationFootprint(st):t?tableFootprint(t):[]).map(p=>({...p,valid:!layoutError}));}}
 const active=service&&rankedActive(service),intent=service&&selected?serviceTargetIntent(service,selected,seat):null;
 const stopWork=()=>{if(service?.chef.holding)send({type:'hold',active:false});};
 const finish=()=>{command({type:'finish'});void client.current?.flush();setSelected(null);setSupplies(null);};
 const ended=attempt&&attempt.status!=='active',saving=client.current?.canonical.status==='active'&&ended;
 return <main className={css.page} data-control-hand={controls.hand} data-cooking={!!attempt&&!ended&&attempt.phase==='service'} style={{'--domain-accent':world.palette.accent} as CSSProperties}>
 <header className={css.header}><a href={review?`/chef/domain-review?domain=${domain}`:'/chef/diner-preview'} onClick={()=>client.current?.pause()}>← {review?'Art workshop':'Restaurant'}</a><strong>{world.name}</strong><button onClick={()=>{client.current?.pause();setSettings(true);}}>Settings</button></header>
 {review&&<div className={css.review}>PRIVATE PLAYTEST · no real rewards · restaurant save untouched</div>}
 {otherJourney&&<p className={css.status}>You have an unfinished {DOMAIN_WORLDS[otherJourney].name} journey. <a href={`/chef/journeys/${otherJourney}`}>Resume or end it first →</a></p>}
 {!attempt?<section className={css.intro}><small>FREE SEASONAL JOURNEY</small><h1>{world.destination}</h1><p>{world.crowd}</p><div className={css.dishes}>{world.menu.map(r=><button key={r.id} onClick={()=>setGuide(r.id)}><ModelIcon kind="food" recipeId={r.id} foodKind="dish" size={64} label={r.name}/><span>{r.name}</span></button>)}</div><p>Eight services. Supplied kitchen. One optional Clear & wash helper. Prepare freely, then take on the rush.</p>
 {!wallet&&!review?<DinerWalletConnect/>:!signed?<button className={css.primary} disabled={busy} onClick={()=>void connect()}>Sign in to save your journey</button>:<div className={css.actions}><button className={css.primary} disabled={busy||!enabled} onClick={()=>void start()}>Start journey</button><button disabled={busy||!enabled} onClick={()=>void start(true)}>Try the kitchen</button></div>}{!enabled&&<p>Season dates have not been announced.</p>}
 <details><summary>What can I earn?</summary><p>Finish services 2, 4 and 6 for themed décor. Beat the finale for a badge, all three recipes and their basic equipment. Borrowed gear stays here. Earned rewards stay yours even if a later service goes wrong.</p><p>The complete themed restaurant is a separate collection reward for discovering all 24 collectibles.</p><p>Already-started journeys have 24 hours to finish after the season closes.</p></details>{!!rewards.length&&<p>{rewards.filter(r=>r.domain===domain).length} milestones already earned.</p>}</section>:
 ended?<section className={css.intro}><small>{attempt.practice?'KITCHEN PRACTICE':review?'PLAYTEST RESULT':'JOURNEY RESULT'}</small><h1>{attempt.outcome==='won'?attempt.practice?'Kitchen complete!':`${world.name} complete!`:attempt.outcome==='expired'?'The season has closed':'Ready for another go?'}</h1><p>{attempt.completed.length} / {attempt.practice?1:8} services finished.</p>{!attempt.practice&&<p>{attempt.rewards.length?`${attempt.rewards.length} milestones ${review?'previewed':'earned'}.`:'Your restaurant and ordinary trip are unchanged.'}</p>}{saving?<p>Saving your result…</p>:<div className={css.actions}><button className={css.primary} onClick={()=>void start()}>New journey</button><a href="/chef/diner-preview">Return to restaurant</a></div>}</section>:
 attempt.phase==='map'?<><h1 className={css.mapTitle}>{world.destination}</h1><DomainJourneyMap attempt={attempt} choose={nodeId=>{command({type:'choose',nodeId});void client.current?.flush();}}/><button className={css.end} onClick={()=>setConfirmEnd(true)}>End this attempt</button></>:
 attempt.phase==='encounter'?<section className={css.intro}><small>TAKE A BREATHER</small><h1>{attempt.nodes.find(n=>n.id===attempt.current)?.name}</h1><p>Choose something to help with the next rush.</p><div className={css.actions}><button className={css.primary} onClick={()=>command({type:'encounter',choice:'equipment'})}>Improve one loaned machine</button><button disabled={attempt.patienceBoost} onClick={()=>command({type:'encounter',choice:'patience'})}>{attempt.patienceBoost?'Extra patience already active':'Give every guest 20 seconds more'}</button></div><p>These improvements last until this journey ends.</p></section>:
 service&&scene?<>
 <div className={css.serviceHeader}><div className={css.dishes}>{service.config.menu.map(id=><button key={id} onClick={()=>{stopWork();setGuide(id);}}>{RECIPE_BY_ID[id].name}</button>)}</div><span>{service.served}/{service.config.customers} served · {service.strikes}/3 strikes</span>{active&&<button onClick={()=>send({type:'pause'})}>Pause</button>}</div>
 <div className={css.scene}><DinerScene mode="truck" scene={scene} rotation={rotation} onRotate={setRotation} editing={editing} showWorldHints={false} onTarget={target} onTile={(x,y)=>editing?move(x,y):send({type:'move',x,y})}/><div className={css.cameraTurn}><button aria-label="Rotate camera left" onClick={()=>setRotation(r=>r-1)}>↶</button><button aria-label="Rotate camera right" onClick={()=>setRotation(r=>r+1)}>↷</button></div></div>
 <section className={css.controls}>
 {service.phase==='setup'?<><div className={css.actions}><button onClick={()=>{setEditing(!editing);setDraft(null);}}>{editing?'Close layout tools':'Arrange supplied kitchen'}</button><label><input type="checkbox" checked={attempt.helper} disabled={!!draft} onChange={e=>command({type:'helper',enabled:e.target.checked})}/>Clear & wash helper · free</label></div>{editing&&<div className={css.actions}><span>Select a piece, then tap a tile.</span><button disabled={!selected} onClick={()=>move(0,0,true)}>Rotate</button>{draft&&<><button onClick={()=>setDraft(null)}>Cancel move</button><button disabled={!!layoutError} onClick={()=>{if(command({type:'layout',...draft}))setDraft(null);}}>Confirm layout</button></>}</div>}<div className={css.actions}><button className={css.primary} disabled={!!draft} onClick={()=>{setEditing(false);send({type:'prepare'});}}>Prep food</button><button disabled={!!draft} onClick={()=>{setEditing(false);send({type:'open'});}}>Open for service</button></div></>:
 service.phase==='paused'?<div className={css.actions}><strong>Paused</strong><button className={css.primary} onClick={()=>send({type:'resume'})}>Resume</button><button onClick={()=>setConfirmEnd(true)}>End attempt</button></div>:
 ['complete','failed'].includes(service.phase)?<div className={css.actions}><p>{service.phase==='complete'?'Service complete!':'That rush got away.'} {service.served} guests served.</p><button className={css.primary} onClick={finish}>{service.phase==='failed'||attempt.completed.length===7||attempt.practice?'See result':'Back to map'}</button></div>:
 <><div className={css.actions}><strong>{itemLabel(service.chef.held)}</strong>{service.phase==='preparing'&&<button className={css.primary} onClick={()=>send({type:'open'})}>Open for service</button>}{intent&&(intent.hold?<HoldAction active={service.chef.holding} label={intent.label} disabled={intent.disabled} onHold={active=>send({type:'hold',active})}/>:<button disabled={intent.disabled} onClick={()=>target(selected!,seat)}>{intent.label}</button>)}</div>
 {supplies?<div className={css.supplies}><strong>Cooking supplies · free</strong><div className={css.actions}>{serviceSupplyChoices(service,supplies).map(c=><button key={c.ingredientId} onClick={()=>{send({type:'interact',targetId:supplies,recipeId:c.recipeId,ingredientId:c.ingredientId});setSupplies(null);}}>{c.name}</button>)}<button onClick={()=>setSupplies(null)}>Close</button></div></div>:<ServiceFocus service={service} selectedId={selected} onCounterItem={(targetId,itemId)=>send({type:'interact',targetId,itemId})}/>}
 {service.stations.find(s=>s.id===selected)?.kind==='prep'&&serviceAssemblyChoices(service).length>1&&<div className={css.actions}>{serviceAssemblyChoices(service).map(id=><button key={id} onClick={()=>send({type:'interact',targetId:selected!,recipeId:id})}>{RECIPE_BY_ID[id].name}</button>)}</div>}{service.notice&&<p className={css.notice}>{service.notice}</p>}</>}
 {layoutError&&<p role="alert">{layoutError}</p>}</section></>:null}
 {status&&<p role="status" className={css.status}>{status}</p>}{client.current?.blocked&&<button className={css.retry} onClick={()=>void client.current?.flush()}>Retry saved actions</button>}
 {guide&&<DinerModal title={RECIPE_BY_ID[guide].name} onClose={()=>setGuide(null)}><ModelIcon kind="food" recipeId={guide} foodKind="dish" size={110} label={RECIPE_BY_ID[guide].name}/><ol>{serviceCookingSteps(service,guide).map((step,i)=><li key={i}>{step}</li>)}</ol></DinerModal>}
 {settings&&<DinerModal title="Controls & readability" onClose={()=>setSettings(false)}><ControlsPanel/></DinerModal>}
 {confirmEnd&&<DinerModal title="End this attempt?" onClose={()=>setConfirmEnd(false)}><p>Earned milestones stay yours. A new journey starts at the first stop.</p><button className={css.primary} onClick={()=>{command({type:'abandon'});void client.current?.flush();setConfirmEnd(false);}}>End attempt</button></DinerModal>}
 </main>;
}
