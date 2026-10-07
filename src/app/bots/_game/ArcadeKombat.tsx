'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArcadeEngine,guarding,ready,replay} from '../../../lib/bots/arcade/engine';
import {LADDERS,newRun,opponent,settleRun,matchSeed,ladderDifficulty,type LadderRun} from '../../../lib/bots/arcade/ladder';
import {ARCADE_SAVE,freshArcadeSave,readArcadeSave,type ArcadeSave} from '../../../lib/bots/arcade/save';
import {loaner,arcadeBuild,tierForGP} from '../../../lib/bots/arcade/equipment';
import {ladderAvailable,ladderRequirement,ladderResumeAvailable} from '../../../lib/bots/arcade/access';
import {ARENAS,arenaDefinition,type ArenaId} from '../../../lib/bots/arcade/arenas';
import {RULES,ART,AI_VERSION,type Settings,type Action,type Build,type Style,type Tier} from '../../../lib/bots/arcade/types';
import {HeldInputs,bindCombatMouse,DEFAULT_PREFERENCES,keyName,keyboardBinding,readPreferences,type Binding,type PitPreferences} from '../../../lib/bots/pit/controls';
import type {Robot8} from '../../../lib/bots/workshop8/state';
import ArcadeLadderMap from './ArcadeLadderMap';
import css from './arcade-kombat.module.css';

const PREFS='mk11.arcade.preferences.1';
const LABELS:Partial<Record<Action,string>>={light:'Light',heavy:'Heavy',special:'Special',guard:'Guard',throw:'Throw',super:'Super',dash:'Dash',enhance:'Enhance',escape:'Escape'};
const NAMES={tank:'Boiler',speed:'Voltage',ranged:'Deadbolt'};
const HELP={tank:'Hold your ground. Make the opening hurt.',speed:'Get in. Strike clean. Get out.',ranged:'Own the distance. Keep your cannon cool.'};
type View=Awaited<ReturnType<typeof import('../../../lib/bots/arcade/view').createArcadeView>>;
type Snapshot={tick:number;phase:string;phaseFrames:number;round:number;clock:number;winner:0|1|null;roundWinner:0|1|null;fighters:{name:string;hp:number;max:number;guard:number;maxGuard:number;energy:number;combo:number;comboDamage:number;status:string;armed:boolean;heat:number|null;venting:boolean}[];inputs:string[]};

function snapshot(e:ArcadeEngine):Snapshot{return{tick:e.tick,phase:e.phase,phaseFrames:e.phaseFrames,round:e.round,clock:e.clock,winner:e.winner,roundWinner:e.roundWinner,fighters:e.fighters.map(f=>({name:f.build.name,hp:f.hp,max:f.build.health,guard:f.guard,maxGuard:f.build.guard,energy:f.energy,combo:f.combo,comboDamage:f.comboDamage,status:f.noticeUntil>e.tick?f.notice:guarding(f)?'Guarding':ready(f)?'Ready':'Recovering',armed:f.armed,heat:f.build.style==='ranged'?f.heat:null,venting:f.vent>0})),inputs:e.commands.filter(c=>c.down&&!['clear','left','right','skip'].includes(c.action)).slice(-8).map(c=>LABELS[c.action]??c.action)};}

type Match={builds:[Build,Build];seed:number;training:boolean;serial:number;arena:ArenaId;difficulty:'easy'|'normal'|'hard';run?:LadderRun;checkpoint?:ArcadeSave['checkpoint']};
export default function ArcadeKombat({ownedRobot,ownedRobots=[],preferredRobotId,saveScope='device',garageMessage='',garageError='',garageLoading=false,onRetryGarage,onClose}:{ownedRobot?:Robot8;ownedRobots?:Robot8[];preferredRobotId?:string;saveScope?:string;garageMessage?:string;garageError?:string;garageLoading?:boolean;onRetryGarage?:()=>void;onClose?:()=>void}){
 const [style,setStyle]=useState<Style>('tank');
 const [previewSeed,setPreviewSeed]=useState(75);
 const [arena,setArena]=useState<ArenaId>('reactor');
 const robots=ownedRobot?[ownedRobot]:ownedRobots;
 const [owned,setOwned]=useState(!!ownedRobot),[robotId,setRobotId]=useState(ownedRobot?.id??''),[tier,setTier]=useState<Tier>(1),[match,setMatch]=useState<Match|null>(null);
 const [saved,setSaved]=useState<ArcadeSave>(()=>freshArcadeSave(saveScope)),[saveError,setSaveError]=useState('');
 const savedRef=useRef(saved),settled=useRef('');savedRef.current=saved;
 const selectionMade=useRef(false);
 const initializedScope=useRef<string|null>(null);
 const chosenRobot=robots.find(r=>r.id===robotId)??(!robotId?robots[0]:undefined);
 const persist=useCallback((next:ArcadeSave)=>{savedRef.current=next;setSaved(next);try{localStorage.setItem(ARCADE_SAVE+':'+next.scope,JSON.stringify(next));setSaveError('');}catch{setSaveError('Could not save this ladder on your device. Keep this tab open.');}},[]);
 useEffect(()=>{if(match)return;try{const next=readArcadeSave(localStorage.getItem(ARCADE_SAVE+':'+saveScope),saveScope);savedRef.current=next;setSaved(next);if(next.active&&!selectionMade.current){setTier(next.active);const run=next.runs[next.active];if(run)setStyle(run.build.style);}}catch{setSaveError('Device saving is unavailable. You can still play.');}},[saveScope,!!match]);
 const [prefs,setPrefs]=useState<PitPreferences>(structuredClone(DEFAULT_PREFERENCES));
 const [settings,setSettings]=useState(false),[binding,setBinding]=useState<Binding|null>(null),[warning,setWarning]=useState('');
 const [touch,setTouch]=useState(false),[paused,setPaused]=useState(false),[loading,setLoading]=useState(0),[error,setError]=useState('');
 const [state,setState]=useState<Snapshot|null>(null),[dummy,setDummy]=useState<'idle'|'block'|'fight'>('idle'),[hitboxes,setHitboxes]=useState(false),[unlimited,setUnlimited]=useState(true);
 const [moves,setMoves]=useState(false),[rotateDismissed,setRotateDismissed]=useState(false),[recording,setRecording]=useState(false),[clip,setClip]=useState(''),[clipExtension,setClipExtension]=useState('webm'),[frameUrl,setFrameUrl]=useState('');
 const recorder=useRef<MediaRecorder|null>(null),clipUrl=useRef(''),frameObjectUrl=useRef('');
 const host=useRef<HTMLDivElement>(null),surface=useRef<HTMLDivElement>(null),engine=useRef<ArcadeEngine|null>(null),view=useRef<View|null>(null),music=useRef<HTMLAudioElement|null>(null),audio=useRef<AudioContext|null>(null);
 const resultDialog=useRef<HTMLElement>(null);
 const blocked=useRef(true),pauseRequested=useRef(false),preferences=useRef(prefs);preferences.current=prefs;
 const input=useRef(new HeldInputs((action,down)=>engine.current?.input(0,action,down)));
 useEffect(()=>{try{setPrefs(readPreferences(JSON.parse(localStorage.getItem(PREFS)??'null')));}catch{}setTouch(matchMedia('(pointer:coarse)').matches);return()=>{music.current?.pause();void audio.current?.close();};},[]);
 useEffect(()=>{try{setArena(arenaDefinition(localStorage.getItem('mk11.arcade.arena')).id);}catch{}},[]);
 useEffect(()=>{setPreviewSeed(Math.floor(Math.random()*0xffffffff));},[]);
 useEffect(()=>{try{localStorage.setItem(PREFS,JSON.stringify(prefs));}catch{}view.current?.setOptions({reduced:prefs.reduced,shake:prefs.shake,flashes:prefs.flashes,low:prefs.quality==='low'});if(music.current)music.current.volume=prefs.musicVolume;},[prefs]);
 const activateAudio=useCallback(()=>{
  if(!music.current){music.current=new Audio('/Combat Loop.mp3');music.current.loop=true;music.current.volume=preferences.current.musicVolume;}
  if(preferences.current.musicVolume)void music.current.play().catch(()=>{});
  if(!audio.current)try{audio.current=new AudioContext();}catch{}
  void audio.current?.resume();
 },[]);
 const pause=useCallback(()=>{input.current.clear();pauseRequested.current=true;blocked.current=true;setPaused(true);music.current?.pause();},[]);
 const resume=()=>{activateAudio();input.current.clear();pauseRequested.current=false;setPaused(false);blocked.current=!view.current;};
 const selectedBuild=()=>{if(owned){if(!chosenRobot)throw Error('Your robot is not available. Choose a free Tier 1 fighter or reload your garage.');return arcadeBuild(chosenRobot.choices,chosenRobot.name);}return loaner(style,1);};
 const chooseOwnedRobot=(robot:Robot8)=>{try{const build=arcadeBuild(robot.choices,robot.name),active=savedRef.current.active,run=active?savedRef.current.runs[active]:undefined;setOwned(true);setRobotId(robot.id);setStyle(build.style);setTier(run&&ladderResumeAvailable(run,build,robot.id)?run.tier:build.tier);}catch(e){setError((e as Error).message);}};
 useEffect(()=>{if(match||selectionMade.current||initializedScope.current===saveScope)return;const preferred=ownedRobot??ownedRobots.find(r=>r.id===preferredRobotId)??ownedRobots[0];if(preferred){initializedScope.current=saveScope;chooseOwnedRobot(preferred);}
 // A slow garage response must not replace a free fighter the player already chose.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ownedRobot,ownedRobots,preferredRobotId,saveScope,!!match]);
 const launch=(next:Omit<Match,'serial'>)=>{
  selectionMade.current=true;
  activateAudio();setError('');setPaused(false);pauseRequested.current=false;setState(null);setLoading(0);blocked.current=true;settled.current='';
  try{localStorage.setItem('mk11.arcade.arena',arena);}catch{}
  setMatch({...next,serial:Date.now()});
 };
 const enterRun=(run:LadderRun,checkpoint:ArcadeSave['checkpoint']=null)=>{
  let build:Build;try{build=selectedBuild();}catch(e){setError((e as Error).message);return;}
  if(!ladderResumeAvailable(run,build,owned?chosenRobot?.id??null:null)){setError(ladderAvailable(run.tier,build,owned)?'This saved run uses different equipment. Select its robot, or start a new ladder with your current build.':ladderRequirement(run.tier));return;}
  persist({...savedRef.current,active:run.tier,arena,runs:{...savedRef.current.runs,[run.tier]:run},checkpoint});
  launch({builds:[run.build,opponent(run)],seed:matchSeed(run),training:false,arena,difficulty:ladderDifficulty(run),run,checkpoint});
 };
 const startLadder=()=>{try{const build=selectedBuild();if(!ladderAvailable(tier,build,owned)){setError(ladderRequirement(tier));return;}enterRun(newRun(build,tier,selectionRun.seed,crypto.randomUUID(),owned?chosenRobot?.id:undefined));setPreviewSeed(Math.floor(Math.random()*0xffffffff));}catch(e){setError((e as Error).message);}};
 const checkpoint=useCallback(()=>{
  const e=engine.current;if(!e||!match?.run||e.phase==='result')return;
  const r=savedRef.current.runs[match.run.tier];if(!r||r.id!==match.run.id||r.stage!==match.run.stage||r.lives!==match.run.lives)return;
  persist({...savedRef.current,checkpoint:{runId:r.id,stage:r.stage,lives:r.lives,tick:e.tick,commands:e.commands.slice(),rules:RULES,art:ART,aiVersion:e.settings.aiVersion}});
 },[match,persist]);
 useEffect(()=>{if(!match?.run)return;const id=setInterval(checkpoint,2000);const save=()=>{input.current.clear();checkpoint();};window.addEventListener('pagehide',save);return()=>{clearInterval(id);window.removeEventListener('pagehide',save);};},[match,checkpoint]);
 useEffect(()=>{
  if(state?.phase!=='result'||!match?.run)return;const key=`${match.run.id}:${match.run.stage}:${match.run.lives}`;if(settled.current===key)return;settled.current=key;
  const next=settleRun(match.run,state.winner);persist({...savedRef.current,runs:{...savedRef.current.runs,[next.tier]:next},checkpoint:null});
 },[state?.phase,state?.winner,match,persist]);
 const continueRun=()=>{const run=match?.run&&savedRef.current.runs[match.run.tier];if(run&&!run.cleared&&run.lives>0)enterRun(run);};
 const savedRun=saved.runs[tier];
 let equipment:Build|null=null;try{equipment=selectedBuild();}catch{}
 const unlockedTier=owned&&equipment?tierForGP(equipment.gp):1;
 const canStartLadder=ladderAvailable(tier,equipment,owned);
 const canResumeSaved=!!savedRun&&ladderResumeAvailable(savedRun,equipment,owned?chosenRobot?.id??null:null);
 const selectionRun=savedRun&&!savedRun.cleared&&savedRun.lives>0?savedRun:newRun(equipment??loaner(style,1),tier,previewSeed,'preview');
 const resultRun=match?.run?saved.runs[match.run.tier]??match.run:null;
 const nextLadder=LADDERS.find(l=>l.tier===(match?.run?.tier??0)+1);
 useEffect(()=>{if(state?.phase==='result'){const dialog=resultDialog.current;(dialog?.querySelector<HTMLElement>('[data-result-primary]:not(:disabled)')??dialog?.querySelector<HTMLElement>('button:not(:disabled),a[href]'))?.focus();}},[state?.phase,resultRun?.stage,resultRun?.lives,resultRun?.cleared]);
 useEffect(()=>{if(!match&&tier>unlockedTier)setTier(unlockedTier);},[match,tier,unlockedTier]);
 useEffect(()=>{
  if(!match||!host.current)return;
  let disposed=false,raf=0,last=0,accumulator=0,lastUi=0,eventIndex=0;const options:Settings={difficulty:match.difficulty,training:match.training,dummy:match.training?dummy:'fight',unlimited:match.training&&unlimited,aiVersion:match.checkpoint?match.checkpoint.aiVersion??'mk11-ai-1':match.run?match.run.aiVersion??'mk11-ai-1':AI_VERSION};
  const e=match.checkpoint?replay({rules:RULES,art:ART,builds:match.builds,seed:match.seed,settings:options,commands:match.checkpoint.commands},match.checkpoint.tick):new ArcadeEngine(match.builds,match.seed,options);engine.current=e;
  if(match.checkpoint){e.input(0,'clear');eventIndex=e.events.length;pauseRequested.current=true;setPaused(true);}
  const effect=(kind:string,damage:number)=>{
   const ctx=audio.current;if(!ctx||!preferences.current.effectsVolume||!['hit','block','land','escape'].includes(kind))return;
   const t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=kind==='block'?'triangle':'sawtooth';osc.frequency.setValueAtTime(kind==='block'?480:damage>90?110:180,t);osc.frequency.exponentialRampToValueAtTime(38,t+.13);gain.gain.setValueAtTime(.055*preferences.current.effectsVolume,t);gain.gain.exponentialRampToValueAtTime(.001,t+.15);osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+.16);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  };
  import('../../../lib/bots/arcade/view').then(m=>m.createArcadeView(host.current!,setLoading,{reduced:prefs.reduced,flashes:prefs.flashes,shake:prefs.shake,hitboxes,low:prefs.quality==='low',arena:match.arena},match.builds)).then(v=>{
   if(disposed){v.destroy();return;}view.current=v;blocked.current=pauseRequested.current;setLoading(1);setState(snapshot(e));
   const frame=(now:number)=>{if(disposed)return;
    const delta=last?Math.min(100,now-last):0;last=now;
    if(!blocked.current){accumulator+=delta;while(accumulator>=1000/60){e.step();accumulator-=1000/60;}}
    else accumulator=0;
    v.render(e);
    while(eventIndex<e.events.length){const event=e.events[eventIndex++];effect(event.kind,event.damage);}
    if(now-lastUi>65){setState(snapshot(e));lastUi=now;}
    raf=requestAnimationFrame(frame);
   };raf=requestAnimationFrame(frame);
  }).catch(err=>{if(!disposed)setError(String(err.message??err));});
  return()=>{disposed=true;cancelAnimationFrame(raf);input.current.clear();if(recorder.current?.state==='recording')recorder.current.stop();view.current?.destroy();view.current=null;engine.current=null;};
 // Preferences and training switches update the running scene separately.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[match]);
 useEffect(()=>{if(engine.current){engine.current.settings.dummy=dummy;engine.current.settings.unlimited=unlimited;}view.current?.setOptions({hitboxes});},[dummy,unlimited,hitboxes]);
 useEffect(()=>{if(state?.phase==='result'&&recorder.current?.state==='recording')recorder.current.stop();},[state?.phase]);
 useEffect(()=>{
  if(!settings&&!moves&&!paused&&state?.phase!=='result')return;
  const key=(event:KeyboardEvent)=>{
   const dialog=document.querySelector('[role="dialog"]');if(!dialog)return;
   if(event.key==='Tab'){
    const elements=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,summary,[href]')).filter(el=>el.getClientRects().length);
    if(!elements.length)return;const first=elements[0],last=elements[elements.length-1];
    if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
   }
  };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[settings,moves,paused,state?.phase]);
 useEffect(()=>{
  const detach=match&&surface.current?bindCombatMouse(surface.current,window,input.current,()=>!blocked.current&&!!view.current,()=>{surface.current?.focus({preventScroll:true});setTouch(false);activateAudio();}):()=>{};
  const keydown=(event:KeyboardEvent)=>{
   if(binding){event.preventDefault();const existing=Object.entries(prefs.bindings).find(([action,code])=>code===event.code&&action!==binding);if(existing){setWarning(`${keyName(event.code)} is already ${existing[0]}. Choose another key.`);return;}setPrefs(p=>({...p,bindings:{...p.bindings,[binding]:event.code}}));setBinding(null);setWarning('');return;}
   if(!match||(event.target as HTMLElement)?.matches('input,select,textarea'))return;
   const action=keyboardBinding(event.code,preferences.current.bindings);if(!action)return;event.preventDefault();if(event.repeat)return;
   if(action==='pause'){if(blocked.current&&!settings&&!moves){resume();}else pause();return;}
   if(blocked.current)return;setTouch(false);activateAudio();input.current.set('key'+event.code,[action]);
  };
  const keyup=(event:KeyboardEvent)=>input.current.set('key'+event.code,[]);
  const visibility=()=>{if(document.hidden)pause();};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',pause);window.addEventListener('orientationchange',pause);document.addEventListener('visibilitychange',visibility);
  return()=>{detach();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',pause);window.removeEventListener('orientationchange',pause);document.removeEventListener('visibilitychange',visibility);input.current.clear();};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[match,binding,settings,moves,prefs.bindings,pause,activateAudio]);
 const tap=(action:Action)=>{engine.current?.input(0,action,true);engine.current?.input(0,action,false);};
 const button=(action:Action,primary=false)=><button key={action} className={`${css.control} ${primary?css.mainControl:''} ${action==='guard'?css.guard:''}`} style={{opacity:prefs.opacity}} aria-label={LABELS[action]} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(blocked.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setTouch(e.pointerType==='touch');activateAudio();input.current.set('pointer'+e.pointerId,[action]);}} onPointerUp={e=>input.current.set('pointer'+e.pointerId,[])} onPointerCancel={()=>pause()}><strong>{LABELS[action]}</strong>{!touch&&!prefs.touch&&<small>{keyName(prefs.bindings[action as Binding])}</small>}</button>;
 const pad=(event:React.PointerEvent<HTMLDivElement>)=>{const b=event.currentTarget.getBoundingClientRect(),x=(event.clientX-b.x)/b.width*2-1,y=(event.clientY-b.y)/b.height*2-1;const actions:Action[]=[];if(x<-.25)actions.push('left');if(x>.25)actions.push('right');if(y<-.35)actions.push('up');if(y>.35)actions.push('down');input.current.set('pad'+event.pointerId,actions);};
 const close=()=>{input.current.clear();checkpoint();setMatch(null);music.current?.pause();setState(null);setPaused(false);};
 const saveFrame=()=>{view.current?.capture().toBlob(blob=>{if(!blob)return;if(frameObjectUrl.current)URL.revokeObjectURL(frameObjectUrl.current);frameObjectUrl.current=URL.createObjectURL(blob);setFrameUrl(frameObjectUrl.current);});};
 const record=()=>{
  if(recorder.current?.state==='recording'){recorder.current.stop();return;}
  const canvas=view.current?.canvas;if(!canvas||typeof MediaRecorder==='undefined'){setError('This browser cannot record the review. You can still play.');return;}
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
  const stream=canvas.captureStream(30),r=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:2500000}:undefined),chunks:Blob[]=[];let bytes=0;
  r.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>48*1024*1024&&r.state==='recording')r.stop();}};
  r.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(clipUrl.current)URL.revokeObjectURL(clipUrl.current);clipUrl.current=URL.createObjectURL(new Blob(chunks,{type:r.mimeType}));setClip(clipUrl.current);setClipExtension(r.mimeType.includes('mp4')?'mp4':'webm');setRecording(false);};recorder.current=r;r.start(1000);setRecording(true);setClip('');
 };
 useEffect(()=>()=>{if(recorder.current?.state==='recording')recorder.current.stop();if(clipUrl.current)URL.revokeObjectURL(clipUrl.current);if(frameObjectUrl.current)URL.revokeObjectURL(frameObjectUrl.current);},[]);
 const showTouch=touch||prefs.touch;
 return <main className={`${css.app} ${showTouch?css.touchMode:''}`} style={{'--control-size':prefs.size} as React.CSSProperties}>
  <header className={css.header}><a href="/bots/play" onClick={onClose?e=>{e.preventDefault();close();onClose();}:undefined}>MODEL <b>KOMBAT</b></a><span>ARCADE / THE LEAGUE</span><div className={css.menuActions}><button onClick={()=>{if(match)pause();setMoves(true);}}>Help</button><button onClick={()=>{if(match)pause();setSettings(true);}}>Settings</button></div></header>
  {!match?<section className={css.selection}>
   <div className={css.intro}><span className={css.eyebrow}>ARCADE / THE LEAGUE</span><h1>{owned?'Your robot.':'Pick your'}<br/> <em>{owned?'Your ladder.':'fighter.'}</em></h1><p>Beat 6 rivals. 3 lives. Boss at the end.</p><p className={css.reviewNote}>Arcade · No game coins or prize points.</p></div>
   {owned&&equipment?<div className={css.ownedFighter}><img src={`/bots-arcade/v1/${equipment.style}${equipment.tier>1?`-t${equipment.tier}`:''}-jab-0.png`} alt={`${equipment.name}, your Tier ${equipment.tier} Arcade fighter`}/><div><span className={css.eyebrow}>YOUR WORKSHOP ROBOT</span><h2>{equipment.name}</h2><p>Tier {equipment.tier} · {equipment.gp} Gear Points</p><p>Health {equipment.health}<br/>Attack power {equipment.damage.toFixed(1)}<br/>Movement {equipment.speed.toFixed(1)}</p><button onClick={()=>{selectionMade.current=true;setOwned(false);setTier(1);}}>Try free Tier 1 fighters</button></div></div>:<div className={css.fighters}>{(['tank','speed','ranged'] as const).map(s=><button key={s} className={`${css.fighterCard} ${style===s&&!owned?css.chosen:''}`} onClick={()=>{selectionMade.current=true;setStyle(s);setOwned(false);setTier(1);}}><span className={css.cardType}>{s==='tank'?'TOUGH / CLOSE RANGE':s==='speed'?'FAST / QUICK COUNTERS':'RANGED / KEEP YOUR DISTANCE'}</span><img src={`/bots-arcade/v1/${s}-jab-0.png`} alt={`${NAMES[s]} free Tier 1 fighter, ready to fight`}/><h2>{NAMES[s]}</h2><p>{HELP[s]}</p><span className={css.cardSelect}>{style===s&&!owned?'Selected':'Choose fighter'} · Tier 1 →</span></button>)}</div>}
   <div className={css.ladderPanel}>
    <div className={css.ladderTabs}>{LADDERS.map(l=><button key={l.tier} aria-pressed={tier===l.tier} disabled={!ladderAvailable(l.tier,equipment,owned)} title={l.tier>unlockedTier?ladderRequirement(l.tier):undefined} onClick={()=>{if(ladderAvailable(l.tier,equipment,owned)){selectionMade.current=true;setTier(l.tier);}}}><small>TIER {l.tier}</small><b>{l.name}</b><span>{l.tier>unlockedTier?`Locked · ${l.gp} GP robot`:saved.runs[l.tier]?.cleared?'★ Cleared':l.tag}</span></button>)}</div>
    {owned&&!chosenRobot&&<p role="alert">Your selected robot is unavailable. Open your garage or choose a free Tier 1 fighter.</p>}
    <ArcadeLadderMap run={selectionRun} label={savedRun&&!canResumeSaved&&!savedRun.cleared&&savedRun.lives>0?`Saved run · ${savedRun.build.name}`:undefined}/>
    {savedRun&&!savedRun.cleared&&savedRun.lives>0?<div className={css.ladderResume}><p><b>{savedRun.build.name}</b><br/><small>{canResumeSaved?'Your ladder is saved on this device.':'Choose this run’s robot and equipment to continue.'}</small></p><button className={canResumeSaved?css.primary:undefined} disabled={!canResumeSaved} onClick={()=>enterRun(savedRun,saved.checkpoint?.runId===savedRun.id?saved.checkpoint:null)}>Continue ladder →</button><button className={!canResumeSaved?css.primary:undefined} disabled={!canStartLadder} onClick={startLadder}>Start fresh</button></div>:<div className={css.ladderResume}><p>{savedRun?.cleared?'Ladder cleared. Go again?':savedRun?.lives===0?'Fresh run. All 3 lives restored.':'Win 2 rounds to beat each opponent.'}</p><button className={css.primary} disabled={!canStartLadder} onClick={startLadder}>Start ladder →</button></div>}
    <div className={css.garageChoice}>{(robots.length>0||owned)&&<label>Fight as <select value={owned?chosenRobot?.id??'unavailable':'temporary'} onChange={e=>{selectionMade.current=true;const robot=robots.find(r=>r.id===e.target.value);if(robot)chooseOwnedRobot(robot);else{setOwned(false);setTier(1);}}}>{owned&&!chosenRobot&&<option value="unavailable" disabled>Selected robot unavailable</option>}<option value="temporary">Free Tier 1 fighter</option>{robots.map(r=><option key={r.id} value={r.id}>{r.name} · My robot</option>)}</select></label>}<p role="status">{garageMessage}</p>{garageError&&<p role="alert">{garageError} <button disabled={garageLoading} onClick={onRetryGarage}>Retry garage</button> <a href="/bots/workshop?view=garage">Open garage / sign in →</a></p>}<p>{owned&&equipment?`${equipment.name} · ${equipment.gp} GP · Ladders through Tier ${unlockedTier}`:'Free fighters enter Tier 1. Upgrade your own robot to unlock higher ladders.'} <a href={owned?'/bots/workshop?view=garage':'/bots/workshop?view=build'}>{owned?'Upgrade robot':'Build your robot'} →</a></p>{equipment&&!owned&&<details className={css.fighterStats}><summary>Fighter stats</summary><p>Health {equipment.health} · Attack power {equipment.damage.toFixed(1)} · Movement speed {equipment.speed.toFixed(1)}</p></details>}</div>
    {saveError&&<p role="alert">{saveError}</p>}
   </div>
   <div className={css.startBar}><details><summary>Arena · {arenaDefinition(arena).name}</summary><label className={css.arenaSelect}><img src={`/bots-arcade/v1/${arenaDefinition(arena).file}`} alt=""/><span>Choose arena <select value={arena} onChange={e=>setArena(e.target.value as ArenaId)}>{ARENAS.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></span></label></details></div>
  </section>:<section className={css.match}>
   <div className={css.topBar}><button onClick={()=>{pause();setMoves(true);}}>Moves & controls</button><span>{match.run?`TIER ${match.run.tier} · WIN 2 ROUNDS TO ADVANCE`:'ARCADE'}</span><button onClick={record} disabled={loading<1}>{recording?'Stop recording':'Record fight'}</button>{clip&&<a href={clip} download={`model-kombat-whole-character-review.${clipExtension}`}>Save clip</a>}<button onClick={pause}>Pause / Esc</button></div>
   {match.run&&<ArcadeLadderMap run={match.run} compact/>}
   <div className={css.arena} ref={surface} tabIndex={0} aria-label="Fighting arena. Left mouse attacks, right mouse guards, middle mouse heavy." onContextMenu={e=>e.preventDefault()}>
    <div className={css.canvas} ref={host}/>
    {state&&<div className={css.hud}>{state.fighters.map((f,i)=><div key={i} className={`${css.playerHud} ${i?css.rivalHud:''}`}><div className={css.fighterName}><b>{f.name}</b><span>{state.fighters[i].hp} / {f.max}</span></div><div className={css.health}><i style={{width:`${f.hp/f.max*100}%`}}/></div><div className={css.guardMeter}><i style={{width:`${f.guard/f.maxGuard*100}%`}}/></div><div className={css.meterRow}><div className={css.energy}>{[0,1,2].map(n=><i key={n}><b style={{width:`${Math.min(100,Math.max(0,f.energy-n*1000)/10)}%`}}/></i>)}</div><span>{'●'.repeat(engine.current?.fighters[i].wins??0)}{'○'.repeat(2-(engine.current?.fighters[i].wins??0))}</span></div><small>{f.status}</small>{f.heat!==null&&<div className={css.heat} aria-label={`Cannon heat ${Math.round(f.heat)} percent${f.venting?', venting':''}`}><span>{f.venting?'VENTING':'HEAT'}</span><i><b style={{width:`${Math.min(100,f.heat)}%`}}/></i></div>}</div>)}<div className={css.timer}><b>{Math.ceil(state.clock/60)}</b><span>ROUND {state.round}</span></div></div>}
    {loading<1&&!error&&<div className={css.screenCue}><span>POWERING UP</span><strong>{Math.round(loading*100)}%</strong><small>Loading character frames</small></div>}
    {state?.phase==='intro'&&loading===1&&<div className={css.screenCue}><span>ROUND {state.round}</span><strong>{state.phaseFrames>25?'READY?':'FIGHT'}</strong><button onClick={()=>tap('skip')}>Fight now</button></div>}
    {state?.phase==='roundEnd'&&<div className={css.screenCue}><span>ROUND {state.round}</span><strong>{state.roundWinner===null?'ROUND DRAW':state.roundWinner===0?'ROUND WON':'ROUND LOST'}</strong><small>Win 2 rounds to beat this opponent.</small></div>}
    {state?.phase==='finish'&&<div className={css.screenCue}><span>OPPONENT {match.run?`${match.run.stage+1} OF 6`:''}</span><strong>{state.winner===0?'YOU WIN':'RIVAL WINS'}</strong>{state.winner===0&&<button onClick={()=>tap('finish')}>Finish · F</button>}</div>}
    {state?.phase==='finisher'&&<div className={css.finisherLabel}>{match.builds[state.winner??0].style==="tank"?"HYDRAULIC DEMOLITION":match.builds[state.winner??0].style==="speed"?"FLASH RUPTURE":"SOLAR OVERLOAD"}</div>}
    {state&&state.phase==='fight'&&state.fighters.some(f=>f.combo>1)&&<div className={css.combo}>{Math.max(...state.fighters.map(f=>f.combo))} HITS <span>{Math.max(...state.fighters.map(f=>f.comboDamage))} DAMAGE</span></div>}
   </div>
   {match.training&&<div className={css.trainingBar}><label>Dummy <select value={dummy} onChange={e=>setDummy(e.target.value as typeof dummy)}><option value="idle">Idle</option><option value="block">Guard</option><option value="fight">Fight back</option></select></label><label><input type="checkbox" checked={unlimited} onChange={e=>setUnlimited(e.target.checked)}/> Unlimited energy</label><label><input type="checkbox" checked={hitboxes} onChange={e=>setHitboxes(e.target.checked)}/> Contact boxes</label><button onClick={()=>engine.current?.resetTraining()}>Reset positions</button><button onClick={saveFrame}>Capture frame</button>{frameUrl&&<a href={frameUrl} download="model-kombat-whole-character-frame.png">Download frame</a>}<span>{state?.inputs.join(' → ')||'Move closer. Land Light, then Light, then Heavy.'}</span></div>}
   <div className={css.controls}>
    {showTouch?<div className={css.pad} role="application" aria-label="Movement pad: up jumps, down crouches, left and right move" style={{transform:`translate(${prefs.leftX}px,${-prefs.leftY}px)`}} onPointerDown={e=>{if(blocked.current)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);activateAudio();pad(e);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))pad(e);}} onPointerUp={e=>input.current.set('pad'+e.pointerId,[])} onPointerCancel={pause}><span>▲</span><span>◀</span><b>MOVE</b><span>▶</span><span>▼</span></div>:<div className={css.desktopGuide}><b>A / D</b> Move <b>W / Space</b> Jump <b>S</b> Crouch<br/><span>Mouse: Left · Light / Right · Guard / Middle · Heavy</span></div>}
    <div className={css.actionCluster} style={{transform:`translate(${-prefs.rightX}px,${-prefs.rightY}px)`}}><div className={css.secondaryControls}>{button('throw')}{button('super')}{prefs.dashButton&&button('dash')}<button className={`${css.control} ${state?.fighters[0].armed?css.armed:''}`} onClick={()=>tap('enhance')}>Enhance {state?.fighters[0].armed?'ON':'OFF'}<small>1 energy</small></button>{state&&state.fighters[0].energy>=3000&&state.fighters[0].combo>0&&button('escape')}</div><div className={css.primaryControls}>{(['light','heavy','special','guard'] as Action[]).map(a=>button(a,true))}</div></div>
   </div>
   {!rotateDismissed&&showTouch&&<div className={css.rotate}>Landscape gives you more fighting room. <button onClick={()=>setRotateDismissed(true)}>Dismiss</button></div>}
  </section>}
  {error&&<div role="alert" className={css.error}>{error}<button onClick={()=>{close();setError('');}}>Back to selection</button></div>}
  {((paused&&!settings&&!moves)||state?.phase==='result')&&match&&<div className={css.scrim}><section ref={resultDialog} role="dialog" aria-modal="true" aria-label={state?.phase==='result'?'Match result':'Paused'} className={css.modal}>
   <span className={css.eyebrow}>{state?.phase==='result'?'OPPONENT MATCH COMPLETE':'TAKE A BREATHER'}</span>
   <h2>{state?.phase==='result'?(state.winner===null?'A draw.':state.winner===0?(resultRun?.cleared?'Ladder champion!':'Opponent beaten!'):'Rival won.'):'Paused.'}</h2>
   {resultRun&&state?.phase==='result'&&<ArcadeLadderMap run={resultRun} compact/>}
   <p>{state?.phase==='result'?'Arcade · No game coins or prize points.':'Ready when you are.'}</p>
   {state?.phase!=='result'&&<button autoFocus className={css.primary} onClick={resume}>Resume fight</button>}
   {match.run&&state?.phase==='result'&&resultRun&&<>{resultRun.cleared?<><p>{nextLadder?ladderAvailable(nextLadder.tier,equipment,owned)?`Your robot is ready for Tier ${nextLadder.tier}.`:`Tier ${nextLadder.tier} needs your own robot with ${nextLadder.gp} Gear Points.`:'All 6 rivals beaten. You conquered the final ladder.'}</p>{nextLadder&&(ladderAvailable(nextLadder.tier,equipment,owned)?<button data-result-primary autoFocus className={css.primary} onClick={()=>{close();setTier(nextLadder.tier);}}>Choose Tier {nextLadder.tier} ladder →</button>:<a data-result-primary className={`${css.primary} ${css.upgradeAction}`} href={owned?'/bots/workshop?view=garage':'/bots/workshop?view=build'}>{owned?`Upgrade robot · ${nextLadder.gp} GP →`:`Build a robot · Reach ${nextLadder.gp} GP →`}</a>)}</>:resultRun.lives===0?<><p>Out of lives. Keep your robot. Try a fresh run.</p><button data-result-primary autoFocus className={css.primary} disabled={!canStartLadder} onClick={startLadder}>Restart ladder · 3 lives →</button></>:<><p>{state.winner===null?'No life lost. Face the same opponent again.':state.winner===0?`${resultRun.stage} of 6 opponents beaten.`:'One life lost. Your ladder progress is saved.'}</p><button data-result-primary autoFocus className={css.primary} onClick={continueRun}>{state.winner===0?'Next opponent →':'Retry opponent →'}</button></>}</>}
   <button data-result-primary={resultRun?.cleared&&!nextLadder?true:undefined} className={resultRun?.cleared&&!nextLadder?css.primary:undefined} onClick={close}>Fighter selection</button>
  </section></div>}
  {moves&&<div className={css.scrim}><section role="dialog" aria-modal="true" aria-label="Moves and controls" className={css.modal}><h2>How to play.</h2><p>Win two rounds to beat each rival. Guard, wait for a missed attack, then strike.</p><dl><dt>Move &amp; jump</dt><dd>{showTouch?'Use the left pad to move. Up jumps; down crouches.':`${keyName(prefs.bindings.left)} / ${keyName(prefs.bindings.right)} move, ${keyName(prefs.bindings.up)} jumps, ${keyName(prefs.bindings.down)} crouches.`}</dd><dt>Attack &amp; guard</dt><dd>{showTouch?'Tap Light or Heavy to attack. Hold Guard to block.':`${keyName(prefs.bindings.light)} is Light, ${keyName(prefs.bindings.heavy)} is Heavy, ${keyName(prefs.bindings.special)} is Special. Hold ${keyName(prefs.bindings.guard)} to guard. The on-screen buttons work too.`}</dd></dl><details className={css.advancedMoves}><summary>Combos &amp; advanced moves</summary><dl><dt>Light → Light → Heavy</dt><dd>Press again after each hit to chain attacks. A missed attack cannot start a combo.</dd><dt>Down + Light / Forward + Heavy</dt><dd>Low attacks beat standing guard. Overhead attacks beat crouching guard.</dd><dt>Down + Heavy → Air Light → Air Heavy</dt><dd>Launch the rival, follow into the air, then knock them down.</dd><dt>Throw</dt><dd>Break close guard. Press Throw within ten frames to escape a grab.</dd><dt>Special / Forward Special / Down Special</dt><dd>Each fighter has three special attacks. Enhance costs 1 energy; Super costs 2; combo Escape costs 3.</dd></dl><p>After winning two rounds, choose Finish for your finishing move.</p></details><button autoFocus className={css.primary} onClick={()=>{setMoves(false);if(match)resume();}}>{match?"Back to fight":"Back to selection"}</button></section></div>}
  {settings&&<div className={css.scrim}><section role="dialog" aria-modal="true" aria-label="Settings" className={`${css.modal} ${css.settings}`}><h2>Your controls.</h2><div className={css.settingsGrid}><label><input type="checkbox" checked={prefs.touch} onChange={e=>setPrefs(p=>({...p,touch:e.target.checked}))}/> Always show touch controls</label><label><input type="checkbox" checked={prefs.reduced} onChange={e=>setPrefs(p=>({...p,reduced:e.target.checked}))}/> Reduced motion</label><label><input type="checkbox" checked={prefs.flashes} onChange={e=>setPrefs(p=>({...p,flashes:e.target.checked}))}/> Impact flashes</label>{(['musicVolume','effectsVolume','shake','size','opacity','leftX','rightX','leftY','rightY'] as const).map(field=><label key={field}>{({musicVolume:'Music',effectsVolume:'Effects',shake:'Camera shake',size:'Button size',opacity:'Button opacity',leftX:'Pad horizontal',rightX:'Buttons horizontal',leftY:'Pad vertical',rightY:'Buttons vertical'})[field]}<input type="range" min={field==='size'?.8:field==='opacity'?.35:field.endsWith('X')||field.endsWith('Y')?-20:0} max={field==='size'?1.25:field.endsWith('X')||field.endsWith('Y')?40:1} step={field.endsWith('X')||field.endsWith('Y')?1:.05} value={prefs[field]} onChange={e=>setPrefs(p=>({...p,[field]:Number(e.target.value)}))}/></label>)}</div><details><summary>Remap keyboard</summary><div className={css.bindings}>{(Object.keys(prefs.bindings) as Binding[]).map(action=><button key={action} onClick={()=>setBinding(action)}>{action} <b>{binding===action?'Press key…':keyName(prefs.bindings[action])}</b></button>)}</div></details>{warning&&<p role="alert">{warning}</p>}<button autoFocus className={css.primary} onClick={()=>{setSettings(false);setBinding(null);if(match)resume();}}>Done</button></section></div>}
 </main>;
}

