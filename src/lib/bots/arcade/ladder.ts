import {loaner} from './equipment';
import type {Build,Style,Tier} from './types';
export const LADDERS=[{tier:1,gp:100,name:'Scrapyard',tag:'Learn the league'},{tier:2,gp:200,name:'Foundry',tag:'Find your openings'},{tier:3,gp:350,name:'Reactor',tag:'Earn your reputation'},{tier:4,gp:500,name:'Overload',tag:'Challenge the machine'}] as const;
export type LadderRun={version:1;id:string;tier:Tier;seed:number;stage:number;lives:number;cleared:boolean;build:Build;bestStage:number};
export function newRun(build:Build,tier:Tier,seed:number,id:string):LadderRun{return{version:1,id,tier,seed,stage:0,lives:3,cleared:false,build:structuredClone(build),bestStage:0};}
export function opponent(run:LadderRun):Build{
 const styles:Style[]=['speed','tank','ranged','speed','ranged','tank'];
 const base=loaner(styles[(run.stage+(run.seed%3))%5],run.tier);
 const names=['Rivet','Scrapjack','Blue Shift','Lockjaw','The Contender'];
 if(run.stage<5)return {...base,name:names[run.stage]};
 return {...loaner('tank',run.tier),name:run.tier===4?'THE SOVEREIGN · OVERLOAD':'THE SOVEREIGN',boss:true};
}
/** Draws replay the same opponent; losses never erase the player's equipment. */
export function settleRun(run:LadderRun,winner:0|1|null):LadderRun{
 if(run.cleared||run.lives===0)return run;
 if(winner===null)return run;
 const next=structuredClone(run);
 if(winner===1)next.lives--;
 else{next.stage++;next.bestStage=Math.max(next.bestStage,next.stage);next.cleared=next.stage===6;}
 return next;
}
export const matchSeed=(run:LadderRun)=>(run.seed+Math.imul(run.stage+1,2654435761))>>>0;
export const ladderDifficulty=(run:LadderRun):'easy'|'normal'|'hard'=>run.stage<4?(run.tier===1?'easy':'normal'):run.stage===4?'normal':'hard';
export const stageName=(stage:number)=>stage===5?'THE SOVEREIGN':stage===4?'THE CONTENDER':`BOUT ${stage+1}`;
export function readRun(value:unknown):LadderRun|null{
 if(!value||typeof value!=='object')return null;const r=value as LadderRun,b=r.build;
 if(r.version!==1||typeof r.id!=='string'||r.id.length>120||![1,2,3,4].includes(r.tier)||!Number.isInteger(r.seed)||r.seed<0||r.seed>0xffffffff||!Number.isInteger(r.stage)||r.stage<0||r.stage>6||!Number.isInteger(r.lives)||r.lives<0||r.lives>3||r.cleared!==(r.stage===6)||!Number.isInteger(r.bestStage)||r.bestStage<r.stage||r.bestStage>6)return null;
 if(!b||typeof b.name!=='string'||b.name.length>32||!['tank','speed','ranged'].includes(b.style)||![1,2,3,4].includes(b.tier)||b.boss||!['gp','health','damage','speed','handling','guard','precision'].every(k=>Number.isFinite(b[k as keyof Build])&&Number(b[k as keyof Build])>0))return null;
 return structuredClone(r);
}
