"use client";

import { useState } from "react";
import type { WorldState } from "./_engine/world";
import { dailyGoals, expansionRequirements, LAUNCH_RULES, type CareTask, type LaunchGoalId } from "./_engine/launch-progression";
import { SHELL_SIZES } from "./_engine/rooms";
import { IconCoin, IconWrench, IconStar } from "./_ui/icons";
import styles from "./DailyPlay.module.css";

export function careLabel(task:CareTask) {
 return task.kind==="repair"?(task.target.kind==="toilet"?"Fix the leak":"Repair the stove"):task.target.kind==="table"?"Wipe the table":"Mop the spill";
}

/** The mess itself is the touch target; no maintenance menu is involved. */
export function CareSpot({task,busy,onCare,buttonRef}:{task:CareTask;busy:boolean;onCare:()=>void;buttonRef:(node:HTMLButtonElement|null)=>void}) {
 const left=task.steps-task.progress,repair=task.kind==="repair";
 return <button ref={buttonRef} type="button" className={styles.careSpot} data-kind={task.target.kind} aria-label={careLabel(task)+", "+left+(left===1?" step left":" steps left")} disabled={busy} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onCare();}}>
  <svg viewBox="0 0 90 62" aria-hidden="true">
   {repair?<><path d="M12 46Q3 36 20 35q5-13 21-5 17-12 28 2 22 4 8 15-22 11-42 5Z" fill="#8fbec5" stroke="#65939c" strokeWidth="2" opacity={.5+left*.15}/><path d="M25 40q13 8 28 0m-7 9q15 3 25-4" fill="none" stroke="#dbf1e9" strokeWidth="3"/><path d="M55 4q-11 15 0 19 11-4 0-19" fill="#83b9ca"/></>:<><path d="M8 42q12-16 32-11 14-12 31 1 17 11 2 19-19 6-33 1-26 5-32-10" fill="#c5a679" opacity={.4+left*.15}/><path d="m26 36 10 7m13-8 9 10m-36 3 10-2" stroke="#9d7953" strokeWidth="3" strokeLinecap="round"/><path d="m60 30 6-5 5 5-7 5zM14 31l5-4 5 5-6 3" fill="#d9c494"/></>}
   <circle cx="18" cy="17" r="13" fill="#fff9df" stroke={repair?"#90afb0":"#bdab80"} strokeWidth="2"/>
   {repair?<path d="m12 23 10-10m-3-5q8-1 7 7l-4-1-3-3z" stroke="#577e82" strokeWidth="3" fill="none" strokeLinecap="round"/>:<path d="m11 16 8-6 7 7-8 7z" fill="#88a686" stroke="#5e805e" strokeWidth="1.5"/>}
  </svg>
  <span className={styles.careLabel}>{careLabel(task)}</span>
  <span className={styles.careSteps} aria-hidden="true">{Array.from({length:task.steps},(_,i)=><i key={i} data-done={i<task.progress||undefined}/>)}</span>
 </button>;
}

/** One next action in the room, with a small switcher instead of another screen. */
export function DailyRibbon({world,busy,onClaim,onAction}:{world:WorldState;busy:boolean;onClaim:(id:LaunchGoalId)=>void;onAction:(id:LaunchGoalId)=>void}) {
 const [index,setIndex]=useState(0);
 const goals=dailyGoals(world.launch),remaining=goals.filter(goal=>!goal.claimed);
 const goal=remaining.find(entry=>entry.ready)??remaining[index%Math.max(1,remaining.length)];
 const claimed=goals.length-remaining.length;
 if(!goal)return <aside className={styles.ribbon}><IconStar size={24}/><div><strong>A lovely day's work.</strong><small>All jobs finished. Make the restaurant yours.</small></div></aside>;
 return <aside className={styles.ribbon} aria-label="Today's restaurant jobs">
  <button type="button" className={styles.jobCount} onClick={()=>setIndex(value=>value+1)} aria-label="Show another daily job"><IconStar size={19}/><small>{claimed}/{goals.length}</small></button>
  <div className={styles.jobCopy}><small>{world.launch.shiftClaimed?"Daily bonus earned":`Finish ${LAUNCH_RULES.shiftGoals} jobs for a rare ingredient`}</small><strong>{goal.label} <span>{goal.current}/{goal.target}</span></strong></div>
  <button type="button" className={styles.jobAction} disabled={busy} onClick={()=>goal.ready?onClaim(goal.id):onAction(goal.id)}>{goal.ready?<><IconCoin size={16}/>Claim {goal.reward.coins}</>:goal.id==="care"?"Find a mess":goal.id==="decorate"?"Decorate":goal.id==="prep"||goal.id==="special"?"Cook special":"To the tables"}</button>
 </aside>;
}

export function ExpansionCard({world,onExpand,onCook}:{world:WorldState;onExpand:()=>void;onCook:()=>void}) {
 const next=expansionRequirements(world.shellIdx,world.pantry.levels,world.playMoney);
 if(!next)return <div className={styles.expansion}><IconStar size={25}/><div><strong>The whole place is yours.</strong><p>Your restaurant has its largest floor plan.</p></div></div>;
 const shell=SHELL_SIZES[next.nextShell],current=SHELL_SIZES[world.shellIdx];
 return <section className={styles.expansion} aria-label="Restaurant expansion">
  <span className={styles.floorPlan} aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>
  <div className={styles.expansionCopy}><strong>Grow your kitchen.</strong><p>{current.w} × {current.h} → {shell.w} × {shell.h} tiles</p><div className={styles.requirements}>{next.goals.map(goal=><span key={goal.id} data-ready={goal.ready||undefined}>{goal.ready?"✓ ":""}{goal.id==="coins"?`${Math.floor(goal.current).toLocaleString()}/${goal.target.toLocaleString()} coins`:`${goal.current}/${goal.target} ${goal.id==="mastered"?"mastered dishes":"dishes at level 2"}`}</span>)}</div></div>
  <div className={styles.expansionActions}><button type="button" disabled={!next.allowed} onClick={onExpand}><IconWrench size={17}/>Expand</button>{!next.goals.filter(g=>g.id!=="coins").every(g=>g.ready)&&<button type="button" onClick={onCook}>Work on recipes</button>}</div>
 </section>;
}
