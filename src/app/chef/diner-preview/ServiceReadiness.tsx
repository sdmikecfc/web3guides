"use client";
import {serviceNet,serviceWages} from '@/lib/chef/diner/round-staff';
import {kitchenReadiness,serviceInsight,servicePressurePhase,approachingRush,serviceComparisonKey} from '@/lib/chef/diner/service-experience';
import {RECIPE_BY_ID,EQUIPMENT_BY_ID} from '@/lib/chef/diner/content';
import type {ServiceState} from '@/lib/chef/diner/types';
import type {DinerState} from '@/lib/chef/diner/progression';
import css from './diner.module.css';
export function ServiceReadiness({service,inspect,rehearse}:{service:ServiceState;inspect:(id:string)=>void;rehearse:()=>void}){
 const readiness=kitchenReadiness(service);
 return <details className={css.menuExplanation}><summary>Kitchen readiness · {readiness.error?'needs attention':'ready to open'}</summary><p>{service.config.menu.map(id=>RECIPE_BY_ID[id].name).join(' · ')}</p><p>Shared preparation: {readiness.shared.join(', ')||'Each dish has its own preparation.'}</p><p>{readiness.seats.length} usable seats · {readiness.vessels.map(v=>`${v.stock} ${v.stock==='free boxes'?'':v.name+'s'}`).join(' · ')}</p><p>Installed: {service.stations.map(s=>EQUIPMENT_BY_ID[s.kind].name).join(', ')}.</p>{readiness.error&&<p role="status"><strong>Cannot open:</strong> {readiness.error}</p>}<p><strong>Efficiency advice:</strong> {readiness.suggestion}</p><div className={css.actions}>{readiness.targetId&&<button className={css.button} onClick={()=>inspect(readiness.targetId!)}>Show in the truck</button>}<button className={css.button} onClick={rehearse}>Test my layout</button></div></details>;
}
export function PressureCue({service}:{service:ServiceState}){return approachingRush(service)?<p className={css.notice} role="status">A small rush is approaching. Ready your next portions.</p>:servicePressurePhase(service)==='Recovery'?<p className={css.small}>A little breathing room · clear dishes or prepare the next batch.</p>:null;}
export function LunchSummary({service,bonus,state}:{service:ServiceState;bonus:number;state:DinerState}){
 const previous=state.personalBests?.find(b=>b.key===serviceComparisonKey(service));
 const seconds=service.tick/20;
 return <><dl className={css.gridTwo}><div><dt>Food income</dt><dd>{service.stats?.food??service.customers.filter(c=>c.payment&&c.phase!=='eating').reduce((n,c)=>n+c.payment-c.tip,0)}</dd></div><div><dt>Tips</dt><dd>{service.stats?.tips??service.customers.filter(c=>c.payment&&c.phase!=='eating').reduce((n,c)=>n+c.tip,0)}</dd></div><div><dt>Helper wages</dt><dd>−{serviceWages(service)}</dd></div><div><dt>Completion bonus</dt><dd>{bonus}</dd></div><div><dt>Guests</dt><dd>{service.served} served · {service.missed} missed</dd></div><div><dt>Net earnings</dt><dd><strong>{serviceNet(service)+bonus}</strong></dd></div></dl><p className={css.small}>{serviceInsight(service)}</p>{previous&&seconds<previous.seconds&&<p>Personal best: {Math.round(seconds)} seconds including preparation and clearing, with the same rules and layout.</p>}</>;
}
