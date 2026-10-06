"use client";
import {useEffect,useState} from 'react';
import {nextIntroduction,introductionVisit} from '@/lib/chef/diner/introductions';
function IntroductionCard({state,send,open,communityReady}:{state:DinerState;send:(c:DinerCommand)=>boolean;open:(p:PanelName)=>void;communityReady:boolean}){
 const [intro]=useState(()=>nextIntroduction(state,communityReady)),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{if(intro)send({type:'ackIntroduction',id:intro.id,visit:introductionVisit(state)});},[]);
 if(!intro||dismissed||state.progressRewards?.pinned)return null;
 return <div className={css.row}><div><p>{intro.title}</p></div><button className={css.button} onClick={()=>{setDismissed(true);open(intro.action);}}>{intro.label}</button><button className={css.quietLink} onClick={()=>setDismissed(true)}>Not now</button></div>;
}

import {dishPresentationName} from '@/lib/chef/diner/personal-touches';
import {roomStyleName} from '@/lib/chef/diner/room-design';
import {nextProgressGoal,progressGoals,prestigeRewards,STYLE_BUNDLES} from '@/lib/chef/diner/progress-rewards';
import {type DinerState,type DinerCommand} from '@/lib/chef/diner/progression';
import {DECOR_BY_ID} from '@/lib/chef/diner/collections';
import {ROUTES} from '@/lib/chef/diner/content';
import type {PanelName} from './DinerPanels';
import {ModelIcon} from './ModelIcon';
import css from './diner.module.css';

export function NextGoal({state,open,send,communityReady=false}:{state:DinerState;open:(name:PanelName)=>void;send?:(c:DinerCommand)=>boolean;communityReady?:boolean}){
 const goal=nextProgressGoal(state);
 return <>{send&&<IntroductionCard key={introductionVisit(state)} state={state} send={send} open={open} communityReady={communityReady}/>}<div className={css.row} aria-label="Next goal"><div><span className={css.eyebrow}>Next goal · {goal.current} / {goal.target}</span><h3>{goal.title}</h3><p>{goal.detail}</p></div><button className={css.button} onClick={()=>open(goal.action)}>{goal.label??'View'}</button><button className={css.quietLink} onClick={()=>open('goals')}>Change goal</button></div></>;
}
export function GoalChoices({state,send,open}:{state:DinerState;send:(c:DinerCommand)=>boolean;open:(name:PanelName)=>void}){
 return <div className={css.list}>{progressGoals(state).map(goal=><div key={goal.id} className={css.row}><div><h3>{goal.title}</h3><p>{goal.detail} · {goal.current}/{goal.target}</p></div><button className={css.button} onClick={()=>{send({type:'pinGoal',goalId:goal.id});open(goal.action);}}>Pin & view</button></div>)}</div>;
}
export function EarnedDisplays({state,send,place}:{state:DinerState;send:(c:DinerCommand)=>boolean;place:(id:string)=>void}){
 return <><h3 className={css.sectionTitle}>Your story, on your walls</h3><p className={css.small}>These displays celebrate cooking and discovery. They do not change income or production.</p><div className={css.list}>{prestigeRewards(state).map(reward=><div className={css.row} key={reward.id}><ModelIcon kind={reward.itemId} label={reward.name} size={68}/><div><h3>{reward.name}</h3><p>Earned by: {reward.detail}</p></div>{reward.claimed?<button className={css.button} onClick={()=>place(reward.itemId)}>Place in restaurant</button>:<button className={css.button} disabled={!reward.earned} onClick={()=>send({type:'claimPrestige',rewardId:reward.id})}>{reward.earned?'Claim display':'Keep cooking'}</button>}</div>)}</div></>;
}
export function RestaurantProfile({state,share,rename}:{state:DinerState;share:()=>void;rename:()=>void}){
 const displays=prestigeRewards(state).filter(r=>r.claimed);
 return <><div className={css.summary}><h3>{state.home.name}</h3><p>{roomStyleName(state)} · {state.career.services} lunches completed</p><button className={css.button} onClick={rename}>Change restaurant name</button></div>{state.personal?.signature&&<p className={css.notice}>House signature: {dishPresentationName(state.personal.signature.recipeId,state.personal.signature)}</p>}<h3 className={css.sectionTitle}>Places you have cooked</h3><div className={css.tabs}>{ROUTES.map(r=><span className={css.chip} key={r.id}>{state.collections.routeWins.includes(r.id)?'✓ ':''}{r.name}</span>)}</div><h3 className={css.sectionTitle}>Earned badges</h3><div className={css.list}>{displays.map(d=><div className={css.row} key={d.id}><ModelIcon kind={d.itemId} size={50} label={d.name}/><p>{DECOR_BY_ID[d.itemId].name}</p></div>)}</div><p className={css.small}>Local rally best: {state.rally.bestScore??0} · unverified. A local result does not appear in public rankings.</p><button className={css.primary} onClick={share}>Download restaurant postcard</button><p className={css.small}>Sharing is your choice. Downloading does not publish your restaurant.</p></>;
}
