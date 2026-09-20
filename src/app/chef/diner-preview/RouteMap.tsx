"use client";
import { useEffect, useRef } from 'react';
import type { DinerRun } from '@/lib/chef/diner/progression';
import { DinerIcon } from './DinerIcon';
import css from './diner.module.css';

export function RouteMap({run,choose}:{run:DinerRun;choose:(id:string)=>void}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{root.current?.querySelector('[data-current-row="true"]')?.scrollIntoView({block:'center'});},[run.position,run.available.join(',')]);
  const rows=Array.from({length:12},(_,i)=>run.map.filter(node=>node.row===11-i));
  const position=(id:string)=>{const node=run.map.find(n=>n.id===id)!;const row=run.map.filter(n=>n.row===node.row);return {x:(node.column+.5)*1000/row.length,y:(11-node.row)*116+49};};
  const reached=new Set([...run.visited,...(run.position?[run.position]:[])]);
  return <div className={css.routeMap} ref={root}>
    <svg className={css.mapRoads} viewBox="0 0 1000 1392" preserveAspectRatio="none" aria-hidden="true">{run.map.flatMap(node=>node.next.map(next=>{const from=position(node.id),to=position(next),used=reached.has(node.id)&&(reached.has(next)||run.available.includes(next));return <line key={`${node.id}:${next}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={used?'#91a47e':'#d9d4bd'} strokeWidth={used?5:3} strokeDasharray={used?undefined:'7 6'}/>;}))}</svg>
    {rows.map((nodes,i)=><div className={css.routeMapRow} key={i} data-current-row={nodes.some(n=>run.position===n.id||(!run.position&&run.available.includes(n.id)))}>{nodes.map(node=>{
      const available=run.available.includes(node.id)&&!run.position,visited=run.visited.includes(node.id),current=run.position===node.id;
      return <div className={css.routeNodeWrap} key={node.id}><button className={`${css.node} ${available?css.nodeAvailable:''} ${visited?css.nodeVisited:''} ${current?css.nodeCurrent:''}`} disabled={!available} aria-label={`${node.name}, stop ${node.row+1}${available?', available':visited?', visited':', locked'}`} onClick={()=>choose(node.id)}><DinerIcon name={node.kind==='shop'?'store':node.kind==='ingredients'?'leaf':['event','bonus'].includes(node.kind)?'gift':node.kind==='finale'?'star':'plate'}/><strong>{node.name}</strong><small>{visited?'Visited':`Stop ${node.row+1}`}</small></button></div>;
    })}</div>)}
  </div>;
}
