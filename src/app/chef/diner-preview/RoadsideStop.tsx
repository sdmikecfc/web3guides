"use client";
import { useEffect } from 'react';
import { EVENT_BY_ID, EVENT_RULES, eventNeedle } from '@/lib/chef/diner/events';
import type { DinerCommand, DinerRun } from '@/lib/chef/diner/progression';
import { DinerModal } from './DinerModal';
import { DinerIcon } from './DinerIcon';
import css from './diner.module.css';

export function RoadsideStop({run,send,selected,onContinue}:{run:DinerRun;send:(c:DinerCommand)=>boolean;selected:string|null;onContinue:()=>void}){
  const event=run.event,task=event?.tasks.find(t=>selected===`cleanup:${t.id}`||(selected==='grill'&&t.id==='grill_surface')||(selected==='prep'&&t.id==='prep_surface'));
  useEffect(()=>{const release=()=>{if(event?.heldTarget)send({type:'eventInput',action:{type:'clean',targetId:event.heldTarget,active:false}});};window.addEventListener('blur',release);return()=>window.removeEventListener('blur',release);},[event?.heldTarget,send]);
  if(!event)return null;
  const definition=EVENT_BY_ID[event.kind];
  if(event.phase==='choice')return <DinerModal dismissible={false} title={definition.title} eyebrow="A story along the road" onClose={onContinue}><p className={css.panelLead}>{definition.description}</p><div className={css.list}>{definition.choices.map(choice=><button key={choice.id} className={css.eventChoice} onClick={()=>send({type:'eventChoice',choiceId:choice.id})}><DinerIcon name={event.kind==='flat_tyre'?'truck':'star'}/><span><strong>{choice.label}</strong><small>{choice.description}</small></span><DinerIcon name="arrow"/></button>)}</div></DinerModal>;
  if(event.phase==='resolved')return <DinerModal title="Back on the road." eyebrow={definition.title} onClose={onContinue}><div className={css.summary}><DinerIcon name="check" size={48}/><p className={css.panelLead}>{event.result}</p><button className={css.primary} onClick={onContinue}>See what&apos;s next</button></div></DinerModal>;
  if(event.phase==='paused')return <DinerModal title="A little breather." eyebrow={definition.title} onClose={()=>send({type:'eventInput',action:{type:'resume'}})}><p className={css.panelLead}>The roadside challenge is paused. Pick up where you left off.</p><button className={css.primary} onClick={()=>send({type:'eventInput',action:{type:'resume'}})}>Continue</button></DinerModal>;
  const stopHolding=()=>{if(task)send({type:'eventInput',action:{type:'clean',targetId:task.id,active:false}});};
  return <>
    <aside className={css.eventTimer}><span>{definition.title}</span><strong>{Math.ceil(event.remaining/20)}s</strong><button className={css.iconButton} aria-label="Pause roadside challenge" onClick={()=>send({type:'eventInput',action:{type:'pause'}})}><DinerIcon name="pause"/></button></aside>
    {event.kind==='health_inspector'?<div className={css.eventDock}><p>Tap a marked mess, then hold to clean it.</p><div className={css.actions}>{event.tasks.map(t=><span key={t.id} className={css.ingredient}>{t.progress===t.required?'✓ ':''}{t.label} · {Math.round(t.progress/t.required*100)}%</span>)}</div>{task&&task.progress<task.required?<button className={css.primary} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);send({type:'eventInput',action:{type:'clean',targetId:task.id,active:true}});}} onPointerUp={stopHolding} onPointerCancel={stopHolding} onLostPointerCapture={stopHolding}>Hold to {task.label.toLowerCase()}</button>:<span className={css.small}>Three jobs. A spotless little truck.</span>}</div>:
    <div className={css.eventDock}><p>Press when the marker reaches the green zone.</p><div className={css.timingTrack} role="meter" aria-label="Tyre repair timing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(eventNeedle(event)*100)}><span className={css.timingGreen} style={{left:`${EVENT_RULES.tyreWindow[0]/EVENT_RULES.tyrePeriod*100}%`,width:`${(EVENT_RULES.tyreWindow[1]-EVENT_RULES.tyreWindow[0])/EVENT_RULES.tyrePeriod*100}%`}}/><span className={css.timingNeedle} style={{left:`${eventNeedle(event)*100}%`}}/></div><button className={css.primary} onClick={()=>send({type:'eventInput',action:{type:'tap'}})}>Tighten · {event.hits} / 3</button><span className={css.small}>{event.mistakes} / 2 misses</span></div>}
  </>;
}
