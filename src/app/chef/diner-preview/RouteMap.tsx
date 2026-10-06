"use client";
import {useEffect,useRef,useState} from 'react';
import {serviceForecast} from '@/lib/chef/diner/service-experience';
import {readableStopName} from '@/lib/chef/diner/journey-map';
import {dinerStopService,DINER_RULES,type DinerState,type DinerRun,type NodeKind} from '@/lib/chef/diner/progression';
import {DinerIcon,type DinerIconName} from './DinerIcon';
import css from './route-map.module.css';
const stops: Record<NodeKind, { label: string; detail: string; icon: DinerIconName; color: string }> = {
  slow: { label: 'Relaxed Lunch', detail: 'A gentle lunch. Find your rhythm and earn a little coin.', icon: 'plate', color: '#568577' },
  medium: { label: 'Steady Lunch', detail: 'A few more hungry faces. Prep ahead to stay on top.', icon: 'plate', color: '#568577' },
  busy: { label: 'Lunch Rush', detail: 'A faster rush and a bigger clear bonus. Come prepared.', icon: 'clock', color: '#b7664b' },
  special: { label: 'Chef’s Challenge', detail: 'A different crowd with a twist on the usual lunch.', icon: 'star', color: '#ab7a41' },
  shop: { label: 'Equipment market', detail: 'Spend coins on the recipes and equipment you want.', icon: 'store', color: '#b7664b' },
  ingredients: { label: 'Ingredient stop', detail: 'Pick up ingredients for your permanent recipe upgrades.', icon: 'leaf', color: '#688558' },
  bonus: { label: 'A free gift', detail: 'Choose a little extra for the journey. No service to cook.', icon: 'gift', color: '#b38543' },
  event: { label: 'Roadside encounter', detail: 'Meet someone along the road. See what they have in store.', icon: 'friends', color: '#718f9b' },
  finale: { label: 'The big finish', detail: 'One last, lively service. Bring everything you have learned.', icon: 'star', color: '#b38543' },
};


export function RouteMap({state,run,choose,strikeLimit}:{state:DinerState;run:DinerRun;choose:(id:string)=>void;strikeLimit:number}){
 const [selected,setSelected]=useState<string|null>(null),currentRef=useRef<HTMLButtonElement>(null),viewportRef=useRef<HTMLDivElement>(null);
 const recenter=()=>{const viewport=viewportRef.current,current=currentRef.current;if(viewport&&current)viewport.scrollTop=current.offsetTop-viewport.clientHeight*.7;};
 useEffect(()=>{recenter();setSelected(null);},[run.position,run.available.join(',')]);
 const reachable=new Set<string>(),pending=[...run.available,...(run.position?[run.position]:[])];
 while(pending.length){const id=pending.pop()!;if(reachable.has(id))continue;reachable.add(id);pending.push(...(run.map.find(n=>n.id===id)?.next??[]));}
 const visited=new Set(run.visited),rows=Array.from({length:Math.max(...run.map.map(n=>n.row))+1},(_,row)=>run.map.filter(n=>n.row===row));
 const position=(id:string)=>{const n=run.map.find(n=>n.id===id)!;return{x:(n.column+.5)*1000/rows[n.row].length,y:(rows.length-1-n.row)*100+45};};
 const hereId=run.position??run.visited.at(-1)??run.available[0],travelled=[...run.visited,...(run.position?[run.position]:[])],takenEdges=new Set(travelled.slice(1).map((id,i)=>`${travelled[i]}:${id}`));
 const node=run.map.find(n=>n.id===selected),available=!!node&&!run.position&&run.location!=='home'&&run.available.includes(node.id);
 const mystery=!!node?.mystery&&!visited.has(node.id)&&node.id!==run.position;
 const service=node&&!mystery&&['slow','medium','busy','special','finale'].includes(node.kind)?dinerStopService(state,run,node):null;
 const bonus=service?(service.config.completionBonus??DINER_RULES.nodeRewards[node!.kind as keyof typeof DINER_RULES.nodeRewards]??0):0;
 const forecast=service?serviceForecast(service,bonus):null;
 const crowd=service?.config.customerTypes.includes('critic')?'Food critics: less patience':service?.config.customerTypes.includes('family')?'Family groups':service?.config.customerTypes.includes('office')?'Office workers: less patience and larger tips':null;
 return <section className={css.journey} aria-label="Route map">
  <div className={css.status}><strong>{run.serviceDays} / 8 lunches</strong><span>{Math.max(0,strikeLimit-run.strikes)} chances left</span><button onClick={recenter} aria-label="Recenter route map">My spot</button></div>
  <div className={css.viewport} ref={viewportRef}><div className={css.map} style={{height:rows.length*100}}>
   <svg className={css.roads} viewBox={`0 0 1000 ${rows.length*100}`} preserveAspectRatio="none" aria-hidden="true">{run.map.flatMap(n=>n.next.map(id=>{const a=position(n.id),b=position(id),taken=takenEdges.has(`${n.id}:${id}`),next=n.id===hereId&&run.available.includes(id);return <path key={`${n.id}:${id}`} d={`M${a.x},${a.y} C${a.x},${a.y-45} ${b.x},${b.y+45} ${b.x},${b.y}`} fill="none" stroke={taken?'#397f73':next?'#c67a47':reachable.has(n.id)&&reachable.has(id)?'#baa98a':'#ddd2bf'} strokeWidth={taken?6:3} strokeDasharray={taken?undefined:'5 7'} vectorEffect="non-scaling-stroke"/>;}))}</svg>
   {[...rows].reverse().flatMap(nodes=>nodes.map(n=>{const next=!run.position&&run.available.includes(n.id),here=n.id===hereId,hidden=n.mystery&&!visited.has(n.id)&&n.id!==run.position,pos=position(n.id),label=hidden?'Mystery stop':readableStopName(n.name);return <button ref={here?currentRef:undefined} key={n.id} className={css.node} style={{left:`${pos.x/10}%`,top:pos.y}} data-current={here} data-available={next} data-finale={n.kind==='finale'} data-missed={!reachable.has(n.id)&&!visited.has(n.id)} data-visited={visited.has(n.id)} aria-label={`${label}, ${here?'you are here':next?'available':visited.has(n.id)?'visited':!reachable.has(n.id)?'road not taken':'ahead'}`} aria-pressed={selected===n.id} onClick={()=>setSelected(n.id)}><span className={css.nodeIcon}>{hidden?'?':<DinerIcon name={stops[n.kind].icon} size={26}/>}</span>{visited.has(n.id)&&<span className={css.visitedMark}>✓</span>}{(here||n.kind==='finale')&&<small>{here?'You are here':'Finale'}</small>}</button>;}))}
  </div></div>
  <div className={css.legend} aria-label="Map legend">{(['slow','busy','shop','bonus','event'] as const).map(kind=><span key={kind}><DinerIcon name={stops[kind].icon} size={16}/>{({slow:'Lunch',busy:'Rush',shop:'Market',bonus:'Gift',event:'Encounter'})[kind]}</span>)}<span><b>?</b>Mystery</span></div>
  {node?<div className={css.briefing}><div><strong>{mystery?'Mystery stop':readableStopName(node.name)}</strong><p>{mystery?'Find out when you arrive.':stops[node.kind].detail}</p>{service&&<p>{service.config.customers} guests · {node.kind==='finale'?'Groups with recovery gaps':stops[node.kind].label} · {bonus} clear bonus · {service.config.maxWaitingCustomers} waiting places</p>}{node.kind==='special'&&crowd&&<p>{crowd}</p>}{forecast&&<details><summary>Earnings estimate</summary><p>About {forecast.total} coins before tips and helper wages. {forecast.assumptions}</p></details>}</div><button disabled={!available} onClick={()=>choose(node.id)}>{available?'Go here':visited.has(node.id)?'Already visited':node.id===run.position?'Current stop':!reachable.has(node.id)?'Another road chosen':'Reach this stop first'}</button></div>:<p className={css.prompt}>Tap a stop to see what’s there.</p>}
 </section>;
}
